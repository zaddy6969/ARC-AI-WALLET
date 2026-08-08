import {
  buildAssistantInput,
  generateLocalAssistantResponse
} from "./wallet-copilot";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 18_000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getApiKey() {
  return (
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_KEY ||
    process.env.AI_API_KEY ||
    ""
  );
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

function localResponse(question, context, notice) {
  const local = generateLocalAssistantResponse({ question, context });
  return {
    ...local,
    notice: notice || "Arc AI · Wallet intelligence",
    mode: "wallet-intelligence"
  };
}

async function requestOpenAI({ question, messages, context, apiKey }) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: buildAssistantInput(question, messages, context),
        max_output_tokens: 420,
        temperature: 0.25,
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

    const answer = extractOutputText(payload);
    if (!answer) throw new Error("AI provider returned an empty response.");
    return answer;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function handleWalletChat(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { question, messages, context } = req.body || {};
  const normalizedQuestion = normalizeText(question);

  if (!normalizedQuestion) {
    return res.status(400).json({ error: "A question is required." });
  }

  const apiKey = getApiKey();

  if (!apiKey) {
    return res.status(200).json(
      localResponse(
        normalizedQuestion,
        context,
        "Arc AI · Live wallet intelligence"
      )
    );
  }

  const local = localResponse(normalizedQuestion, context);

  try {
    const answer = await requestOpenAI({
      question: normalizedQuestion,
      messages,
      context,
      apiKey
    });

    return res.status(200).json({
      ...local,
      answer,
      notice: `Arc AI · ${DEFAULT_MODEL}`,
      mode: "openai"
    });
  } catch (error) {
    console.error("[wallet-copilot] provider fallback", {
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
