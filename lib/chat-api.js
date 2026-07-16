import {
  buildAssistantInput,
  generateLocalAssistantResponse
} from "./wallet-copilot";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_MS = 25_000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputs = Array.isArray(payload?.output) ? payload.output : [];
  const parts = [];

  for (const item of outputs) {
    if (item?.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (contentItem?.type === "output_text" && contentItem.text) {
        parts.push(contentItem.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function getCopilotMetadata(question, context) {
  const local = generateLocalAssistantResponse({ question, context });

  return {
    insights: Array.isArray(local.insights) ? local.insights : [],
    actions: Array.isArray(local.actions) ? local.actions : []
  };
}

async function requestOpenAI({ question, messages, context }) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
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
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const upstreamMessage =
        payload?.error?.message || "The AI provider rejected the request.";
      const error = new Error(upstreamMessage);
      error.status = response.status;
      throw error;
    }

    const answer = extractOutputText(payload);

    if (!answer) {
      throw new Error("The AI provider returned an empty response.");
    }

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

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error:
        "Real AI Copilot is not configured. Add OPENAI_API_KEY to the server environment and redeploy.",
      code: "COPILOT_NOT_CONFIGURED",
      mode: "unavailable"
    });
  }

  const metadata = getCopilotMetadata(normalizedQuestion, context);

  try {
    const answer = await requestOpenAI({
      question: normalizedQuestion,
      messages,
      context
    });

    return res.status(200).json({
      answer,
      insights: metadata.insights,
      actions: metadata.actions,
      notice: `Real AI Copilot · ${DEFAULT_MODEL}`,
      mode: "openai"
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    const status = Number(error?.status) || 502;

    console.error("[wallet-copilot] OpenAI request failed", {
      status,
      message: error instanceof Error ? error.message : "Unknown error"
    });

    return res.status(status >= 400 && status < 600 ? status : 502).json({
      error: timedOut
        ? "The real AI Copilot request timed out. Please try again."
        : "The real AI Copilot is temporarily unavailable. Please try again.",
      code: timedOut ? "COPILOT_TIMEOUT" : "COPILOT_PROVIDER_ERROR",
      mode: "unavailable"
    });
  }
}
