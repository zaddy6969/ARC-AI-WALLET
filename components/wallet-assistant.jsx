import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildWalletInsights } from "../lib/wallet-copilot";

const FREE_AGENT_MODEL = "liquid/lfm-2.5-1.2b-instruct:free";

const quickPrompts = [
  "Live Arc network status",
  "Latest Arc Node release",
  "Analyze my wallet",
  "Open Unified Balance",
  "How do I bridge to Arc?",
  "Check my wallet risk"
];

const freeAgentTools = [
  {
    type: "function",
    function: {
      name: "get_arc_network_status",
      description: "Get the live Arc Testnet chain ID, latest block and RPC latency from the wallet's Arc status endpoint.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "get_arc_node_release",
      description: "Get the latest public Arc Node release from the official circlefin/arc-node GitHub repository.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "prepare_send",
      description: "Prepare a self-custodial USDC transfer on Arc. Never claim it is sent; the user must review and sign.",
      parameters: {
        type: "object",
        properties: {
          recipient: { type: "string", description: "Full 0x EVM recipient address." },
          amount: { type: "string", description: "Positive USDC amount as a decimal string." }
        },
        required: ["recipient", "amount"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "prepare_swap",
      description: "Prepare a token swap on Arc Testnet. The wallet fetches the live quote and the user signs.",
      parameters: {
        type: "object",
        properties: {
          tokenIn: { type: "string", enum: ["USDC", "EURC", "cirBTC"] },
          tokenOut: { type: "string", enum: ["USDC", "EURC", "cirBTC"] },
          amount: { type: "string" },
          slippageBps: { type: "integer", enum: [50, 100, 300] }
        },
        required: ["tokenIn", "tokenOut", "amount", "slippageBps"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "prepare_bridge",
      description: "Prepare a USDC bridge between Arc Testnet, Ethereum Sepolia and Base Sepolia. The user reviews and signs.",
      parameters: {
        type: "object",
        properties: {
          sourceNetwork: { type: "string", enum: ["arc", "ethereum-sepolia", "base-sepolia"] },
          destinationNetwork: { type: "string", enum: ["arc", "ethereum-sepolia", "base-sepolia"] },
          amount: { type: "string" }
        },
        required: ["sourceNetwork", "destinationNetwork", "amount"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "switch_network",
      description: "Prepare a request to switch the connected wallet network. This never moves funds.",
      parameters: {
        type: "object",
        properties: {
          network: { type: "string", enum: ["arc", "ethereum-sepolia", "base-sepolia"] }
        },
        required: ["network"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_wallet_view",
      description: "Open one of the wallet screens when the user asks to view a feature.",
      parameters: {
        type: "object",
        properties: {
          view: {
            type: "string",
            enum: ["dashboard", "send", "receive", "swap", "bridge", "unified", "request", "portfolio", "activity", "community"]
          }
        },
        required: ["view"],
        additionalProperties: false
      }
    }
  }
];

function MessageBubble({ role, content }) {
  return (
    <div className={`assistant-message assistant-message-${role}`}>
      <span className="field-label">{role === "assistant" ? "Arc AI" : "You"}</span>
      <p>{content || "..."}</p>
    </div>
  );
}

function ThinkingBubble({ mode }) {
  return (
    <div className="assistant-message assistant-message-assistant assistant-message-thinking">
      <span className="field-label">{mode === "free" ? "Fast Agent" : "Arc AI"}</span>
      <p>Working<span className="typing-dots" aria-hidden="true"><i /><i /><i /></span></p>
    </div>
  );
}

function InsightCard({ item }) {
  return (
    <article className={`insight-card insight-card-${item.tone || "neutral"}`}>
      <span className="field-label">{item.title}</span>
      <strong>{item.body}</strong>
    </article>
  );
}

function ActionButton({ action, onPrompt, onWalletAction }) {
  if (action.kind === "wallet-action") {
    return (
      <button
        type="button"
        className="button button-primary copilot-action-button"
        onClick={() => onWalletAction?.(action)}
      >
        {action.label || "Review action"}
      </button>
    );
  }

  if (action.kind === "prompt") {
    return <button type="button" className="button button-secondary" onClick={() => onPrompt(action.prompt)}>{action.label}</button>;
  }

  if (action.kind === "internal-link") {
    return <Link href={action.href} className="button button-secondary">{action.label}</Link>;
  }

  if (action.kind === "link") {
    return <a href={action.href} target="_blank" rel="noreferrer" className="button button-secondary">{action.label}</a>;
  }

  return null;
}

function parseToolArgs(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function puterText(response) {
  if (typeof response === "string") return response.trim();
  if (typeof response?.message?.content === "string") return response.message.content.trim();
  if (Array.isArray(response?.message?.content)) {
    return response.message.content
      .map((part) => typeof part === "string" ? part : part?.text || part?.content || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (typeof response?.text === "string") return response.text.trim();
  return "";
}

function freeAgentAction(toolCall) {
  const name = toolCall?.function?.name || "";
  const args = parseToolArgs(toolCall?.function?.arguments);
  const id = `${name || "agent-action"}-${toolCall?.id || Date.now()}`;

  if (name === "prepare_send") {
    return { id, kind: "wallet-action", tool: name, label: `Review send ${args.amount || ""} USDC`.trim(), args };
  }
  if (name === "prepare_swap") {
    return { id, kind: "wallet-action", tool: name, label: `Review ${args.tokenIn || "token"} → ${args.tokenOut || "token"} swap`, args };
  }
  if (name === "prepare_bridge") {
    return { id, kind: "wallet-action", tool: name, label: `Review ${args.amount || ""} USDC bridge`.trim(), args };
  }
  if (name === "switch_network") {
    return { id, kind: "wallet-action", tool: name, label: `Switch to ${args.network || "network"}`, args };
  }
  if (name === "open_wallet_view") {
    return { id, kind: "wallet-action", tool: name, label: `Open ${args.view || "wallet"}`, args };
  }
  return null;
}

async function runFreeTool(toolCall) {
  const name = toolCall?.function?.name || "";
  const args = parseToolArgs(toolCall?.function?.arguments);

  if (name === "get_arc_network_status") {
    const response = await fetch("/api/arc-status", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Arc network status is unavailable.");
    return { data: payload };
  }

  if (name === "get_arc_node_release") {
    const response = await fetch("/api/arc-agent-data?tool=node-release", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Arc Node release data is unavailable.");
    return { data: payload };
  }

  const action = freeAgentAction(toolCall);
  if (action) {
    return {
      action,
      data: {
        prepared: true,
        requiresUserReview: true,
        requiresWalletSignature: name !== "open_wallet_view",
        tool: name,
        args
      }
    };
  }

  return { data: { error: "Unsupported tool." } };
}

export default function WalletAssistant({
  walletSnapshot,
  activityItems,
  activityStatus,
  initialPrompt,
  onWalletAction
}) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Arc AI Agent is ready. I can inspect live Arc status, check the latest Arc Node release, analyze your wallet, and prepare Send, Swap, Bridge or navigation actions for your review."
    }
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Live wallet intelligence");
  const [actions, setActions] = useState([]);
  const [agentMode, setAgentMode] = useState("arc");
  const [puterReady, setPuterReady] = useState(false);
  const autoAnalyzeAddressRef = useRef("");
  const externalPromptRef = useRef("");
  const threadRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.puter?.ai?.chat) setPuterReady(true);
  }, []);

  const context = useMemo(() => {
    const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
    const totalValueUsd = assets.reduce((sum, asset) => sum + (Number(asset?.valueUsd) || 0), 0);

    return {
      wallet: {
        address: walletSnapshot?.address || "",
        connected: Boolean(walletSnapshot?.isSignedIn),
        onArc: Boolean(walletSnapshot?.onArc),
        usdcBalance: walletSnapshot?.usdcBalance || "",
        balanceStatus: walletSnapshot?.balanceStatus || "idle"
      },
      portfolio: {
        status: walletSnapshot?.balanceStatus || "idle",
        totalValueUsd,
        assets: assets.map((asset) => ({
          symbol: asset.symbol,
          name: asset.name,
          balance: asset.balance,
          balanceLabel: String(asset.balance || "").replace(` ${asset.symbol}`, ""),
          valueUsd: Number(asset.valueUsd) || 0,
          hasValue: Number(asset.valueUsd) > 0,
          allocation: totalValueUsd > 0 ? ((Number(asset.valueUsd) || 0) / totalValueUsd) * 100 : 0
        }))
      },
      activity: {
        status: activityStatus || "idle",
        items: Array.isArray(activityItems) ? activityItems.slice(0, 12) : []
      }
    };
  }, [activityItems, activityStatus, walletSnapshot]);

  const freeAgentContext = useMemo(() => ({
    wallet: {
      address: context.wallet.address,
      connected: context.wallet.connected,
      onArc: context.wallet.onArc,
      usdcBalance: context.wallet.usdcBalance
    },
    portfolio: {
      totalValueUsd: context.portfolio.totalValueUsd,
      assets: context.portfolio.assets.map((asset) => ({
        symbol: asset.symbol,
        balanceLabel: asset.balanceLabel,
        valueUsd: asset.valueUsd
      }))
    },
    activity: {
      status: context.activity.status,
      count: context.activity.items.length
    }
  }), [context]);

  const insights = useMemo(() => buildWalletInsights(context), [context]);

  const askFreeAgent = async (trimmed, nextMessages) => {
    if (typeof window === "undefined" || !window.puter?.ai?.chat) {
      throw new Error("Free Agent is still loading. Try again in a moment.");
    }

    const systemMessage = {
      role: "system",
      content: [
        "You are Arc Fast Agent inside a self-custodial crypto wallet.",
        "Arc wallet transaction support is Arc Testnet only. Arc Testnet chain ID is 5042002.",
        "USDC is Arc gas. The native USDC view and ERC-20 USDC at 0x3600000000000000000000000000000000000000 expose the same balance pool, so never add or describe them as separate balances.",
        "Use get_arc_network_status for live network questions and get_arc_node_release for current Arc Node release questions.",
        "Use wallet action tools when the user asks to send, swap, bridge, switch network, or open a wallet feature.",
        "Wallet action tools only PREPARE an action. Never claim a transaction was signed, submitted or confirmed.",
        "Never request seed phrases, private keys or signing secrets.",
        `Public wallet context: ${JSON.stringify(freeAgentContext)}`
      ].join(" ")
    };

    const conversation = [
      systemMessage,
      ...nextMessages.slice(-8).map((item) => ({ role: item.role, content: item.content }))
    ];
    const collectedActions = [];
    let response = await window.puter.ai.chat(conversation, {
      model: FREE_AGENT_MODEL,
      tools: freeAgentTools
    });

    for (let round = 0; round < 3; round += 1) {
      const toolCalls = Array.isArray(response?.message?.tool_calls) ? response.message.tool_calls : [];
      if (!toolCalls.length) {
        return {
          answer: puterText(response) || "Fast Agent completed the request.",
          actions: collectedActions
        };
      }

      conversation.push(response.message);

      for (const toolCall of toolCalls.slice(0, 3)) {
        const toolResult = await runFreeTool(toolCall);
        if (toolResult.action) collectedActions.push(toolResult.action);
        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult.data)
        });
      }

      response = await window.puter.ai.chat(conversation, {
        model: FREE_AGENT_MODEL,
        tools: freeAgentTools
      });
    }

    return {
      answer: puterText(response) || (collectedActions.length ? "I prepared the requested wallet action for your review." : "Fast Agent completed the request."),
      actions: collectedActions
    };
  };

  const askAssistant = async (nextQuestion) => {
    const trimmed = String(nextQuestion || "").trim();
    if (!trimmed || loading) return;

    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setQuestion("");
    setLoading(true);
    setError("");
    setActions([]);
    requestRef.current?.abort();
    requestRef.current = new AbortController();

    try {
      if (agentMode === "free") {
        const result = await askFreeAgent(trimmed, nextMessages);
        setMessages((current) => [
          ...current,
          { role: "assistant", content: result.answer || "Fast Agent could not generate an answer." }
        ]);
        setNotice(`Free Agent · ${FREE_AGENT_MODEL}`);
        setActions(Array.isArray(result.actions) ? result.actions : []);
        return;
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: requestRef.current.signal,
        body: JSON.stringify({
          question: trimmed,
          messages: nextMessages.slice(-8),
          context,
          stream: false
        })
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {}

      if (!response.ok) throw new Error(payload.error || "Arc AI is unavailable.");

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.answer || "I could not generate a wallet answer. Please try again."
        }
      ]);
      setNotice(payload.notice || "Arc AI ready");
      setActions(Array.isArray(payload.actions) ? payload.actions : []);
    } catch (nextError) {
      if (nextError?.name === "AbortError") return;
      setError(nextError instanceof Error ? nextError.message : "Arc AI could not complete that request. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      agentMode === "arc" &&
      walletSnapshot?.isSignedIn &&
      walletSnapshot?.address &&
      autoAnalyzeAddressRef.current !== walletSnapshot.address
    ) {
      autoAnalyzeAddressRef.current = walletSnapshot.address;
      void askAssistant("Analyze my wallet");
    }
  }, [agentMode, walletSnapshot?.address, walletSnapshot?.isSignedIn]);

  useEffect(() => {
    if (initialPrompt?.id && initialPrompt?.text && externalPromptRef.current !== initialPrompt.id) {
      externalPromptRef.current = initialPrompt.id;
      void askAssistant(initialPrompt.text);
    }
  }, [initialPrompt]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, actions]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await askAssistant(question);
  };

  const setMode = (mode) => {
    if (loading) return;
    setAgentMode(mode);
    setActions([]);
    setError("");
    setNotice(mode === "free" ? "Free Agent · Puter.js · no developer API key" : "Live wallet intelligence");
  };

  return (
    <section className="card pro-ai-assistant agent-upgrade-shell">
      <Script
        src="https://js.puter.com/v2/"
        strategy="afterInteractive"
        onLoad={() => setPuterReady(Boolean(window.puter?.ai?.chat))}
        onReady={() => setPuterReady(Boolean(window.puter?.ai?.chat))}
      />

      <div className="assistant-hero">
        <div className="ai-orb-avatar" aria-hidden="true"><span /></div>
        <div><p className="section-kicker">Arc AI</p><h2>AI agent</h2></div>
        <span className={`status-badge ${agentMode === "free" ? "agent-status-free" : ""}`}>{loading ? "Working" : "Ready"}</span>
      </div>

      <div className="agent-mode-switch" role="group" aria-label="AI agent mode">
        <button type="button" className={agentMode === "arc" ? "is-active" : ""} onClick={() => setMode("arc")} disabled={loading}>
          <strong>Arc Agent</strong><small>Wallet AI + actions</small>
        </button>
        <button type="button" className={agentMode === "free" ? "is-active" : ""} onClick={() => setMode("free")} disabled={loading}>
          <strong>Fast Free Agent</strong><small>{puterReady ? "Puter ready" : "Loading Puter…"}</small>
        </button>
      </div>

      {agentMode === "free" ? (
        <div className="agent-provider-note">
          <span className="agent-live-dot" />
          <div><strong>Free model agent</strong><p>No developer API key. Puter may ask you to sign in and usage follows your Puter allowance. Prompts and the minimal public wallet context shown here are sent to Puter AI.</p></div>
        </div>
      ) : null}

      <div className="copilot-summary-grid">
        <div className="summary-card"><span className="field-label">Wallet</span><strong>{walletSnapshot?.address ? `${walletSnapshot.address.slice(0, 6)}…${walletSnapshot.address.slice(-4)}` : "Not connected"}</strong><small>{walletSnapshot?.onArc ? "Arc connected" : "Network check"}</small></div>
        <div className="summary-card"><span className="field-label">USDC</span><strong>{walletSnapshot?.usdcBalance || "Syncing…"}</strong><small>Live Arc balance</small></div>
        <div className="summary-card"><span className="field-label">Agent tools</span><strong>Live + wallet</strong><small>RPC · Node · Actions</small></div>
      </div>

      <p className="helper-copy">{notice}</p>

      <div className="agent-capability-strip">
        <span>Live Arc RPC</span><span>Arc Node GitHub</span><span>Send</span><span>Swap</span><span>Bridge</span><span>Unified</span>
      </div>

      <div className="prompt-row">
        {quickPrompts.map((prompt) => (
          <button key={prompt} type="button" className="prompt-chip" onClick={() => askAssistant(prompt)} disabled={loading}>{prompt}</button>
        ))}
      </div>

      <div className="assistant-thread" ref={threadRef}>
        {messages.map((message, index) => (
          <MessageBubble key={`${message.role}-${index}`} role={message.role} content={message.content} />
        ))}
        {loading ? <ThinkingBubble mode={agentMode} /> : null}
      </div>

      {actions.length ? (
        <div className="action-row copilot-action-row">
          {actions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onPrompt={askAssistant}
              onWalletAction={onWalletAction}
            />
          ))}
        </div>
      ) : null}

      <form className="assistant-form" onSubmit={handleSubmit}>
        <textarea
          className="assistant-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={agentMode === "free" ? 'Try “check Arc status and latest node release”' : 'Try “send 5 USDC to 0x…” or “bridge 10 USDC from Base to Arc”'}
          rows={3}
        />
        <div className="assistant-form-row">
          <button type="submit" className="button button-primary" disabled={loading || !question.trim() || (agentMode === "free" && !puterReady)}>{loading ? "Agent working…" : agentMode === "free" ? "Run Free Agent" : "Run Arc Agent"}</button>
        </div>
      </form>

      <p className="agent-security-line">Agent actions never sign transactions. Review every recipient, amount, quote and network in your wallet before approving. Never enter a seed phrase or private key.</p>

      {error ? <div className="empty-state empty-state-compact"><strong>AI agent unavailable</strong><p>{error}</p></div> : null}
    </section>
  );
}
