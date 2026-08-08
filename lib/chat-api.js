import {
  buildAssistantInput,
  generateLocalAssistantResponse
} from "./wallet-copilot";

const GATEWAY_API_URL = "https://ai-gateway.vercel.sh/v1/responses";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL || "openai/gpt-5.6-sol";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-sol";
const REQUEST_TIMEOUT_MS = 24_000;

const NETWORK_VALUES = ["arc", "ethereum-sepolia", "base-sepolia"];
const TOKEN_VALUES = ["USDC", "EURC", "cirBTC"];

const COPILOT_TOOLS = [
  {
    type: "function",
    name: "prepare_send",
    description:
      "Prepare a self-custodial USDC transfer on Arc. Use only when both recipient address and amount are known. The user will review and sign in their wallet.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        recipient: {
          type: "string",
          description: "A full 0x EVM recipient address."
        },
        amount: {
          type: "string",
          description: "Positive USDC amount written as a decimal string."
        }
      },
      required: ["recipient", "amount"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "prepare_swap",
    description:
      "Prepare a token swap on Arc Testnet. Use only when input token, output token and amount are known. The user will review the live Circle quote and sign in their wallet.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        tokenIn: { type: "string", enum: TOKEN_VALUES },
        tokenOut: { type: "string", enum: TOKEN_VALUES },
        amount: {
          type: "string",
          description: "Positive input token amount written as a decimal string."
        },
        slippageBps: {
          type: "integer",
          enum: [50, 100, 300],
          description: "Slippage in basis points. Use 100 unless the user explicitly chooses another supported value."
        }
      },
      required: ["tokenIn", "tokenOut", "amount", "slippageBps"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "prepare_bridge",
    description:
      "Prepare a USDC bridge between Arc Testnet, Ethereum Sepolia and Base Sepolia. Source and destination must differ. The wallet will fetch a live quote before the user signs.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        sourceNetwork: { type: "string", enum: NETWORK_VALUES },
        destinationNetwork: { type: "string", enum: NETWORK_VALUES },
        amount: {
          type: "string",
          description: "Positive USDC amount written as a decimal string."
        }
      },
      required: ["sourceNetwork", "destinationNetwork", "amount"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "switch_network",
    description:
      "Ask the connected wallet to switch to Arc Testnet, Ethereum Sepolia or Base Sepolia. Network switching does not move funds.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        network: { type: "string", enum: NETWORK_VALUES }
      },
      required: ["network"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "open_wallet_view",
    description:
      "Open a wallet screen when the user asks to view a feature but has not provided enough information to prepare a transaction.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["dashboard", "send", "receive", "swap", "bridge", "request", "portfolio", "activity", "community"]
        }
      },
      required: ["view"],
      additionalProperties: false
    }
  }
];

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getProvider() {
  const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || "";
  if (gatewayKey) {
    return {
      apiKey: gatewayKey,
      apiUrl: GATEWAY_API_URL,
      model: GATEWAY_MODEL,
      provider: "vercel-ai-gateway"
    };
  }

  const openAiKey =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    process.env.AI_API_KEY ||
    "";

  if (openAiKey) {
    return {
      apiKey: openAiKey,
      apiUrl: OPENAI_API_URL,
      model: OPENAI_MODEL,
      provider: "openai"
    };
  }

  return null;
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  const parts = [];

  for (const item of outputs) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const contentItem of item.content) {
      if (contentItem?.type === "output_text" && contentItem.text) {
        parts.push(contentItem.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function parseToolArguments(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function toolCallToAction(item) {
  if (!item || item.type !== "function_call") return null;
  const args = parseToolArguments(item.arguments);
  const id = `${item.name || "action"}-${item.call_id || Date.now()}`;

  if (item.name === "prepare_send") {
    return {
      id,
      kind: "wallet-action",
      tool: item.name,
      label: `Review send ${args.amount || ""} USDC`.trim(),
      args
    };
  }

  if (item.name === "prepare_swap") {
    return {
      id,
      kind: "wallet-action",
      tool: item.name,
      label: `Review ${args.tokenIn || "token"} → ${args.tokenOut || "token"} swap`,
      args
    };
  }

  if (item.name === "prepare_bridge") {
    return {
      id,
      kind: "wallet-action",
      tool: item.name,
      label: `Review ${args.amount || ""} USDC bridge`.trim(),
      args
    };
  }

  if (item.name === "switch_network") {
    return {
      id,
      kind: "wallet-action",
      tool: item.name,
      label: "Switch network",
      args
    };
  }

  if (item.name === "open_wallet_view") {
    return {
      id,
      kind: "wallet-action",
      tool: item.name,
      label: `Open ${args.view || "wallet"}`,
      args
    };
  }

  return null;
}

function getToolActions(payload) {
  return (Array.isArray(payload?.output) ? payload.output : [])
    .map(toolCallToAction)
    .filter(Boolean)
    .slice(0, 3);
}

function answerForActions(actions) {
  const action = actions[0];
  if (!action) return "";

  if (action.tool === "prepare_send") {
    return `I prepared a ${action.args.amount} USDC transfer to ${action.args.recipient}. Review the recipient, amount and live network fee before signing.`;
  }
  if (action.tool === "prepare_swap") {
    return `I prepared a ${action.args.amount} ${action.args.tokenIn} → ${action.args.tokenOut} swap on Arc. Open it to fetch the live quote before signing.`;
  }
  if (action.tool === "prepare_bridge") {
    return `I prepared a ${action.args.amount} USDC bridge from ${action.args.sourceNetwork} to ${action.args.destinationNetwork}. The Bridge screen will verify balances, fees and the live route before signing.`;
  }
  if (action.tool === "switch_network") {
    return `I can switch your connected wallet to ${action.args.network}. This changes the active network only and does not move funds.`;
  }
  if (action.tool === "open_wallet_view") {
    return `I can open the ${action.args.view} screen for you.`;
  }
  return "I prepared the wallet action for your review.";
}

function localResponse(question, context, notice) {
  const local = generateLocalAssistantResponse({ question, context });
  return {
    ...local,
    notice: notice || "Arc AI · Wallet intelligence",
    mode: "wallet-intelligence"
  };
}

async function requestModel({ question, messages, context, provider }) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(provider.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        instructions: [
          "You are Arc AI Copilot inside a self-custodial wallet.",
          "Use the supplied wallet context for balances and activity; never invent wallet data.",
          "When a user gives enough information for Send, Swap, Bridge, or network switching, call the matching function tool instead of merely describing steps.",
          "A tool call only PREPARES an action. Never claim a transaction was submitted, confirmed, signed, or completed.",
          "Never request or expose seed phrases, private keys, or signing secrets.",
          "If required transaction details are missing, ask one concise follow-up question rather than guessing.",
          "For ordinary wallet questions, answer directly and concisely without a tool call."
        ].join(" "),
        input: buildAssistantInput(question, messages, context),
        tools: COPILOT_TOOLS,
        tool_choice: "auto",
        parallel_tool_calls: false,
        max_output_tokens: 520,
        store: false
      })
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {}

    if (!response.ok) {
      const error = new Error(payload?.error?.message || "AI provider rejected the request.");
      error.status = response.status;
      throw error;
    }

    const actions = getToolActions(payload);
    const answer = extractOutputText(payload) || answerForActions(actions);
    if (!answer && !actions.length) throw new Error("AI provider returned an empty response.");

    return { answer, actions };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function handleWalletChat(req, res) {
  const provider = getProvider();

  if (req.method === "GET") {
    return res.status(200).json({
      ready: Boolean(provider),
      provider: provider?.provider || "local-fallback",
      model: provider?.model || null,
      tools: ["send", "swap", "bridge", "switch-network", "open-view"]
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { question, messages, context } = req.body || {};
  const normalizedQuestion = normalizeText(question);

  if (!normalizedQuestion) {
    return res.status(400).json({ error: "A question is required." });
  }

  if (!provider) {
    return res.status(200).json(
      localResponse(
        normalizedQuestion,
        context,
        "Arc AI · Wallet intelligence"
      )
    );
  }

  const local = localResponse(normalizedQuestion, context);

  try {
    const result = await requestModel({
      question: normalizedQuestion,
      messages,
      context,
      provider
    });

    return res.status(200).json({
      ...local,
      answer: result.answer,
      actions: result.actions.length ? result.actions : local.actions,
      notice: `Arc AI · ${provider.model}`,
      mode: "ai-copilot",
      provider: provider.provider
    });
  } catch (error) {
    console.error("[wallet-copilot] provider fallback", {
      provider: provider.provider,
      status: Number(error?.status) || 0,
      message: error instanceof Error ? error.message : "Unknown error"
    });

    return res.status(200).json(
      localResponse(
        normalizedQuestion,
        context,
        "Arc AI · Wallet intelligence fallback"
      )
    );
  }
}
