import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildWalletInsights } from "../lib/wallet-copilot";

const PUTER_MODEL = "gpt-5-nano";

const quickPrompts = [
  "Hi — what can you do?",
  "Live Arc network status",
  "Analyze my wallet",
  "Explain Arc in simple words",
  "How do I bridge to Arc?",
  "Check my wallet risk"
];

const freeAgentTools = [
  {
    type: "function",
    function: {
      name: "get_arc_network_status",
      description: "Get the live Arc Testnet chain ID, latest block and RPC latency.",
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
      description: "Prepare a self-custodial USDC transfer on Arc. The user must review and sign.",
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
      description: "Prepare a token swap on Arc Testnet. The user reviews a live quote and signs.",
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
            enum: ["dashboard", "send", "receive", "swap", "bridge", "unified", "request", "portfolio", "activity", "community", "agent"]
          }
        },
        required: ["view"],
        additionalProperties: false
      }
    }
  }
];

function describeError(error) {
  if (!error) return "Unknown AI provider error.";
  if (typeof error === "string") return error;
  if (typeof error?.msg === "string") return error.msg;
  if (typeof error?.message === "string") return error.message;
  if (typeof error?.error === "string") return error.error;
  if (typeof error?.error?.message === "string") return error.error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown AI provider error.";
  }
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

function MessageBubble({ role, content }) {
  return (
    <div className={`assistant-message assistant-message-${role}`}>
      <span className="field-label">{role === "assistant" ? "Lumexa Agent" : "You"}</span>
      <p>{content || "..."}</p>
    </div>
  );
}

function ThinkingBubble({ mode }) {
  return (
    <div className="assistant-message assistant-message-assistant assistant-message-thinking">
      <span className="field-label">{mode === "free" ? "Fast Free Agent" : "Lumexa Agent"}</span>
      <p>Thinking<span className="typing-dots" aria-hidden="true"><i /><i /><i /></span></p>
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

function ActionButton({ action, onWalletAction }) {
  if (action?.kind !== "wallet-action") return null;
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

function toolCallToAction(toolCall) {
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

async function runTool(toolCall) {
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

  const action = toolCallToAction(toolCall);
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
      content: "Hi — I’m the Lumexa AI Agent. Connect the free AI once, then ask me anything or ask me to inspect Arc and prepare wallet actions."
    }
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("AI provider loading…");
  const [actions, setActions] = useState([]);
  const [agentMode, setAgentMode] = useState("arc");
  const [puterReady, setPuterReady] = useState(false);
  const [puterSignedIn, setPuterSignedIn] = useState(false);
  const [serverAiReady, setServerAiReady] = useState(false);
  const externalPromptRef = useRef("");
  const threadRef = useRef(null);
  const requestRef = useRef(null);

  const syncPuterState = () => {
    if (typeof window === "undefined") return;
    const ready = Boolean(window.puter?.ai?.chat && window.puter?.auth);
    setPuterReady(ready);
    if (!ready) return;
    try {
      const signedIn = Boolean(window.puter.auth.isSignedIn?.());
      setPuterSignedIn(signedIn);
      setNotice(signedIn ? `Puter AI connected · ${PUTER_MODEL}` : "Puter AI loaded · connect once to chat");
    } catch {
      setPuterSignedIn(false);
    }
  };

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    let active = true;
    fetch("/api/ai", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (active) setServerAiReady(Boolean(payload?.ready));
      })
      .catch(() => {
        if (active) setServerAiReady(false);
      });
    return () => { active = false; };
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

  const publicWalletContext = useMemo(() => ({
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
      count: context.activity.items.length,
      items: context.activity.items.slice(0, 5).map((item) => ({
        type: item.type,
        token: item.token,
        amount: item.amount,
        timeLabel: item.timeLabel,
        txHashShort: item.txHashShort,
        kind: item.kind
      }))
    }
  }), [context]);

  const insights = useMemo(() => buildWalletInsights(context), [context]);

  const ensurePuterSession = async (allowPopup = true) => {
    if (typeof window === "undefined" || !window.puter?.ai?.chat || !window.puter?.auth) {
      throw new Error("Puter AI has not loaded yet. Wait a moment and try again.");
    }

    if (window.puter.auth.isSignedIn?.()) {
      setPuterSignedIn(true);
      return true;
    }

    if (!allowPopup) {
      throw new Error("Connect Free AI once before running this mission.");
    }

    try {
      await window.puter.auth.signIn({ attempt_temp_user_creation: true });
      const signedIn = Boolean(window.puter.auth.isSignedIn?.());
      setPuterSignedIn(signedIn);
      if (!signedIn) throw new Error("Puter sign-in did not complete.");
      setNotice(`Puter AI connected · ${PUTER_MODEL}`);
      return true;
    } catch (nextError) {
      throw new Error(`Puter sign-in failed: ${describeError(nextError)}`);
    }
  };

  const connectFreeAi = async () => {
    setError("");
    try {
      await ensurePuterSession(true);
    } catch (nextError) {
      setError(describeError(nextError));
    }
  };

  const buildConversation = (nextMessages) => ([
    {
      role: "system",
      content: [
        "You are Lumexa AI Agent inside Lumexa AI Wallet, a self-custodial crypto wallet built on Arc.",
        "Answer greetings, normal questions and follow-up conversation naturally. Do not repeat a wallet summary unless the user asks about their wallet.",
        "For wallet-specific facts, use only the supplied public wallet context and live tools; never invent balances, activity or transaction status.",
        "Lumexa transaction support currently uses Arc Testnet only. Arc Testnet chain ID is 5042002.",
        "USDC is Arc gas. Native USDC and ERC-20 USDC at 0x3600000000000000000000000000000000000000 expose the same underlying pool, so never add them as separate assets.",
        "Use live tools for current Arc status and current Arc Node release questions.",
        "Use wallet action tools when the user asks to send, swap, bridge, switch network, or open a wallet feature.",
        "Wallet action tools only PREPARE an action. Never claim a transaction was signed, submitted or confirmed.",
        "Never request seed phrases, private keys or signing secrets.",
        `Public wallet context: ${JSON.stringify(publicWalletContext)}`
      ].join(" ")
    },
    ...nextMessages.slice(-10).map((item) => ({ role: item.role, content: item.content }))
  ]);

  const callPuter = async (conversation, withTools = true) => {
    const options = withTools
      ? { model: PUTER_MODEL, tools: freeAgentTools }
      : { model: PUTER_MODEL };
    return window.puter.ai.chat(conversation, options);
  };

  const askPuterAgent = async (nextMessages, allowPopup = true) => {
    await ensurePuterSession(allowPopup);
    const conversation = buildConversation(nextMessages);
    const collectedActions = [];
    let response;

    try {
      response = await callPuter(conversation, true);
    } catch (toolError) {
      try {
        response = await callPuter(conversation, false);
      } catch (basicError) {
        throw new Error(`Puter AI request failed: ${describeError(basicError || toolError)}`);
      }
    }

    for (let round = 0; round < 3; round += 1) {
      const toolCalls = Array.isArray(response?.message?.tool_calls) ? response.message.tool_calls : [];
      if (!toolCalls.length) {
        return {
          answer: puterText(response) || "The AI returned an empty response. Please try again.",
          actions: collectedActions
        };
      }

      conversation.push(response.message);
      for (const toolCall of toolCalls.slice(0, 3)) {
        const toolResult = await runTool(toolCall);
        if (toolResult.action) collectedActions.push(toolResult.action);
        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult.data)
        });
      }

      try {
        response = await callPuter(conversation, true);
      } catch (nextError) {
        throw new Error(`Puter AI tool follow-up failed: ${describeError(nextError)}`);
      }
    }

    return {
      answer: puterText(response) || (collectedActions.length ? "I prepared the requested wallet action for your review." : "The AI returned an empty response."),
      actions: collectedActions
    };
  };

  const useResult = (result, label) => {
    setMessages((current) => [
      ...current,
      { role: "assistant", content: result.answer || "I could not generate an answer. Please try again." }
    ]);
    setNotice(label);
    setActions(Array.isArray(result.actions) ? result.actions : []);
  };

  const askAssistant = async (nextQuestion, options = {}) => {
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
      if (agentMode === "arc" && serverAiReady) {
        try {
          const response = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: requestRef.current.signal,
            body: JSON.stringify({ question: trimmed, messages: nextMessages.slice(-10), context, stream: false })
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok && payload?.mode === "ai-copilot" && payload?.answer) {
            setMessages((current) => [...current, { role: "assistant", content: payload.answer }]);
            setNotice(payload.notice || "Lumexa Agent · server AI");
            setActions(Array.isArray(payload.actions) ? payload.actions : []);
            return;
          }
        } catch (serverError) {
          if (serverError?.name === "AbortError") throw serverError;
        }
      }

      const result = await askPuterAgent(nextMessages, options.allowPopup !== false);
      useResult(result, `${agentMode === "free" ? "Fast Free Agent" : "Lumexa Agent"} · Puter ${PUTER_MODEL}`);
    } catch (nextError) {
      if (nextError?.name === "AbortError") return;
      setError(describeError(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialPrompt?.id || !initialPrompt?.text || externalPromptRef.current === initialPrompt.id) return;
    externalPromptRef.current = initialPrompt.id;

    if (!serverAiReady && !puterSignedIn) {
      setQuestion(initialPrompt.text);
      setError("Connect Free AI once, then press Ask Lumexa Agent to run this mission.");
      return;
    }

    void askAssistant(initialPrompt.text, { allowPopup: false });
  }, [initialPrompt, puterSignedIn, serverAiReady]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, actions]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await askAssistant(question, { allowPopup: true });
  };

  const setMode = (mode) => {
    if (loading) return;
    setAgentMode(mode);
    setActions([]);
    setError("");
    setNotice(puterSignedIn ? `Puter AI connected · ${PUTER_MODEL}` : "Connect Free AI once to start real chat");
  };

  const providerState = !puterReady
    ? "Loading AI"
    : puterSignedIn
      ? "AI connected"
      : "Connect AI";

  return (
    <section className="card pro-ai-assistant agent-upgrade-shell">
      <Script
        src="https://js.puter.com/v2/"
        strategy="afterInteractive"
        onLoad={syncPuterState}
        onReady={syncPuterState}
        onError={() => {
          setPuterReady(false);
          setError("Puter.js could not load in this browser. Check ad/script blockers and refresh.");
        }}
      />

      <div className="assistant-hero">
        <div className="ai-orb-avatar" aria-hidden="true"><span /></div>
        <div><p className="section-kicker">Lumexa AI</p><h2>Real AI agent</h2></div>
        <span className={`status-badge ${puterSignedIn ? "agent-status-free" : ""}`}>{loading ? "Thinking" : providerState}</span>
      </div>

      <div className="agent-mode-switch" role="group" aria-label="AI agent mode">
        <button type="button" className={agentMode === "arc" ? "is-active" : ""} onClick={() => setMode("arc")} disabled={loading}>
          <strong>Lumexa Agent</strong><small>{serverAiReady ? "Server AI + Puter fallback" : "Puter AI + wallet tools"}</small>
        </button>
        <button type="button" className={agentMode === "free" ? "is-active" : ""} onClick={() => setMode("free")} disabled={loading}>
          <strong>Fast Free Agent</strong><small>{puterSignedIn ? `${PUTER_MODEL} ready` : "One-time Puter sign-in"}</small>
        </button>
      </div>

      <div className="agent-provider-note">
        <span className="agent-live-dot" />
        <div>
          <strong>{puterSignedIn ? "Real AI connected" : "Connect the real free AI"}</strong>
          <p>{puterSignedIn
            ? `Puter AI is authenticated and ready with ${PUTER_MODEL}. Wallet actions still require your signature.`
            : "Puter requires a one-time user sign-in on websites before AI calls. Your Puter account includes a free monthly allowance."}</p>
        </div>
        {!puterSignedIn ? (
          <button type="button" className="button button-secondary" onClick={connectFreeAi} disabled={!puterReady || loading}>
            {puterReady ? "Connect Free AI" : "Loading AI…"}
          </button>
        ) : null}
      </div>

      <div className="copilot-summary-grid">
        <div className="summary-card"><span className="field-label">Wallet</span><strong>{walletSnapshot?.address ? `${walletSnapshot.address.slice(0, 6)}…${walletSnapshot.address.slice(-4)}` : "Not connected"}</strong><small>{walletSnapshot?.onArc ? "Arc connected" : "Network check"}</small></div>
        <div className="summary-card"><span className="field-label">USDC</span><strong>{walletSnapshot?.usdcBalance || "Syncing…"}</strong><small>Live Arc balance</small></div>
        <div className="summary-card"><span className="field-label">AI status</span><strong>{providerState}</strong><small>{serverAiReady ? "Server + browser AI" : "Puter browser AI"}</small></div>
      </div>

      <p className="helper-copy">{notice}</p>

      <div className="agent-capability-strip">
        <span>Normal chat</span><span>General Q&A</span><span>Live Arc RPC</span><span>Wallet analysis</span><span>Send</span><span>Swap</span><span>Bridge</span><span>Unified</span>
      </div>

      <div className="prompt-row">
        {quickPrompts.map((prompt) => (
          <button key={prompt} type="button" className="prompt-chip" onClick={() => askAssistant(prompt, { allowPopup: true })} disabled={loading}>{prompt}</button>
        ))}
      </div>

      {insights.length ? (
        <div className="copilot-insights-grid">
          {insights.slice(0, 3).map((item) => <InsightCard key={item.id} item={item} />)}
        </div>
      ) : null}

      <div className="assistant-thread" ref={threadRef}>
        {messages.map((message, index) => (
          <MessageBubble key={`${message.role}-${index}`} role={message.role} content={message.content} />
        ))}
        {loading ? <ThinkingBubble mode={agentMode} /> : null}
      </div>

      {actions.length ? (
        <div className="action-row copilot-action-row">
          {actions.map((action) => (
            <ActionButton key={action.id} action={action} onWalletAction={onWalletAction} />
          ))}
        </div>
      ) : null}

      <form className="assistant-form" onSubmit={handleSubmit}>
        <textarea
          className="assistant-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={'Ask anything — “hi”, “what is Arc?”, “analyze my wallet”, or “send 5 USDC to 0x…”'}
          rows={3}
        />
        <div className="assistant-form-row">
          <button type="submit" className="button button-primary" disabled={loading || !question.trim() || !puterReady}>
            {loading ? "AI thinking…" : !puterSignedIn && !serverAiReady ? "Connect & Ask Lumexa Agent" : agentMode === "free" ? "Ask Free AI" : "Ask Lumexa Agent"}
          </button>
        </div>
      </form>

      <p className="agent-security-line">AI actions never sign transactions. Review every recipient, amount, quote and network in your wallet before approving. Never enter a seed phrase or private key.</p>

      {error ? <div className="empty-state empty-state-compact"><strong>AI connection</strong><p>{error}</p></div> : null}
    </section>
  );
}