import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { FeatureIcon } from "./wallet-sidebar";
import { ARC_NETWORK_MODE } from "../lib/arc-chain";

const PUTER_MODEL = "gpt-5-nano";
const IS_MAINNET = ARC_NETWORK_MODE === "mainnet";
const NETWORK_VALUES = IS_MAINNET
  ? ["arc", "ethereum-mainnet", "base-mainnet"]
  : ["arc", "ethereum-sepolia", "base-sepolia"];

const agentTools = [
  {
    type: "function",
    function: {
      name: "get_arc_network_status",
      description: "Get live Arc network chain ID, latest block and RPC latency.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "get_arc_node_release",
      description: "Get the latest public Arc Node release.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "prepare_send",
      description: "Prepare a self-custodial USDC transfer. User review and wallet signature are required.",
      parameters: {
        type: "object",
        properties: {
          recipient: { type: "string" },
          amount: { type: "string" }
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
      description: "Prepare an Arc token swap. A live quote and wallet signature are required.",
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
      description: `Prepare a USDC bridge between ${NETWORK_VALUES.join(", ")}. User review and wallet signature are required.`,
      parameters: {
        type: "object",
        properties: {
          sourceNetwork: { type: "string", enum: NETWORK_VALUES },
          destinationNetwork: { type: "string", enum: NETWORK_VALUES },
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
      description: "Prepare a request to switch the connected wallet network.",
      parameters: {
        type: "object",
        properties: {
          network: { type: "string", enum: NETWORK_VALUES }
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
      description: "Open a Lumexa wallet screen.",
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

const STARTER_PROMPTS = [
  { label: "Analyze my wallet", prompt: "Analyze my wallet and tell me the three most useful things to know right now.", icon: "portfolio" },
  { label: "Explain latest transaction", prompt: "Explain my latest transaction in plain English.", icon: "activity" },
  { label: "Check Arc network", prompt: "Check the current Arc network status and tell me if everything looks healthy.", icon: "community" },
  { label: "What should I review?", prompt: "Review my visible wallet activity and tell me if anything deserves attention.", icon: "ai" }
];

const QUICK_VIEWS = [
  { view: "send", label: "Send", icon: "send" },
  { view: "swap", label: "Swap", icon: "swap" },
  { view: "bridge", label: "Bridge", icon: "bridge" },
  { view: "activity", label: "Activity", icon: "activity" }
];

function describeError(error) {
  if (!error) return "Unknown AI provider error.";
  if (typeof error === "string") return error;
  if (typeof error?.msg === "string") return error.msg;
  if (typeof error?.message === "string") return error.message;
  if (typeof error?.error === "string") return error.error;
  if (typeof error?.error?.message === "string") return error.error.message;
  return "Unknown AI provider error.";
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
      .map((part) => (typeof part === "string" ? part : part?.text || part?.content || ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (typeof response?.text === "string") return response.text.trim();
  return "";
}

function toolCallToAction(toolCall) {
  const name = toolCall?.function?.name || "";
  const args = parseToolArgs(toolCall?.function?.arguments);
  const id = `${name || "agent-action"}-${toolCall?.id || Date.now()}`;
  if (name === "prepare_send") return { id, kind: "wallet-action", tool: name, label: `Review send ${args.amount || ""} USDC`.trim(), args };
  if (name === "prepare_swap") return { id, kind: "wallet-action", tool: name, label: `Review ${args.tokenIn || "token"} → ${args.tokenOut || "token"} swap`, args };
  if (name === "prepare_bridge") return { id, kind: "wallet-action", tool: name, label: `Review ${args.amount || ""} USDC bridge`.trim(), args };
  if (name === "switch_network") return { id, kind: "wallet-action", tool: name, label: `Switch to ${args.network || "network"}`, args };
  if (name === "open_wallet_view") return { id, kind: "wallet-action", tool: name, label: `Open ${args.view || "wallet"}`, args };
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

function shortValue(value, start = 6, end = 4) {
  const text = String(value || "");
  if (!text) return "—";
  if (text.length <= start + end + 3) return text;
  return `${text.slice(0, start)}…${text.slice(-end)}`;
}

function formatUsd(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "$0.00";
  const fractionDigits = Math.abs(numeric) >= 1000 ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }).format(numeric);
  } catch {
    return `$${numeric.toFixed(fractionDigits)}`;
  }
}

function Message({ role, content }) {
  const assistant = role === "assistant";
  return (
    <article className={`lumexa-ai-message is-${role}`}>
      <div className="lumexa-ai-avatar" aria-hidden="true">{assistant ? "✦" : "Y"}</div>
      <div className="lumexa-ai-message-body">
        <div className="lumexa-ai-message-meta">
          <strong>{assistant ? "Lumexa" : "You"}</strong>
          {assistant ? <span>Wallet Copilot</span> : null}
        </div>
        <div className="lumexa-ai-message-text">
          {String(content || "").split("\n").map((line, index) => (
            line ? <span key={`${line.slice(0, 20)}-${index}`}>{line}</span> : <br key={`break-${index}`} />
          ))}
        </div>
      </div>
    </article>
  );
}

function actionDetails(action) {
  const args = action?.args || {};
  if (action?.tool === "prepare_send") {
    return { icon: "send", title: `Send ${args.amount || ""} USDC`.trim(), meta: `To ${shortValue(args.recipient, 8, 6)}`, cta: "Review send" };
  }
  if (action?.tool === "prepare_swap") {
    return { icon: "swap", title: `${args.tokenIn || "Token"} → ${args.tokenOut || "Token"}`, meta: `${args.amount || ""} ${args.tokenIn || ""}`.trim(), cta: "Review swap" };
  }
  if (action?.tool === "prepare_bridge") {
    return { icon: "bridge", title: `Bridge ${args.amount || ""} USDC`.trim(), meta: `${args.sourceNetwork || "Source"} → ${args.destinationNetwork || "Destination"}`, cta: "Review bridge" };
  }
  if (action?.tool === "switch_network") {
    return { icon: "community", title: "Switch network", meta: args.network || "Select network", cta: "Switch" };
  }
  return { icon: "activity", title: action?.label || "Open wallet", meta: "Prepared by Lumexa", cta: "Open" };
}

function PreparedAction({ action, onOpen }) {
  const detail = actionDetails(action);
  return (
    <button type="button" className="lumexa-ai-action-card" onClick={() => onOpen?.(action)}>
      <span className="lumexa-ai-action-icon"><FeatureIcon name={detail.icon} /></span>
      <span className="lumexa-ai-action-copy"><strong>{detail.title}</strong><small>{detail.meta}</small></span>
      <span className="lumexa-ai-action-cta">{detail.cta}<b>→</b></span>
    </button>
  );
}

export default function WalletAssistant({
  walletSnapshot,
  activityItems,
  activityStatus,
  initialPrompt,
  onWalletAction
}) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState([]);
  const [puterReady, setPuterReady] = useState(false);
  const [puterSignedIn, setPuterSignedIn] = useState(false);
  const [fallbackNeeded, setFallbackNeeded] = useState(false);
  const [serverAiReady, setServerAiReady] = useState(false);
  const [serverAiChecked, setServerAiChecked] = useState(false);
  const externalPromptRef = useRef("");
  const threadRef = useRef(null);
  const requestRef = useRef(null);
  const requestIdRef = useRef(0);
  const textareaRef = useRef(null);

  const syncPuterState = () => {
    if (typeof window === "undefined") return;
    const ready = Boolean(window.puter?.ai?.chat && window.puter?.auth);
    setPuterReady(ready);
    if (!ready) return;
    try {
      setPuterSignedIn(Boolean(window.puter.auth.isSignedIn?.()));
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
        if (!active) return;
        const ready = Boolean(payload?.ready);
        setServerAiReady(ready);
        setServerAiChecked(true);
        if (!ready) setFallbackNeeded(true);
      })
      .catch(() => {
        if (!active) return;
        setServerAiReady(false);
        setServerAiChecked(true);
        setFallbackNeeded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const input = textareaRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 48), 132)}px`;
  }, [question]);

  const context = useMemo(() => {
    const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
    const totalValueUsd = assets.reduce((sum, asset) => sum + (Number(asset?.valueUsd) || 0), 0);
    return {
      wallet: {
        address: walletSnapshot?.address || "",
        connected: Boolean(walletSnapshot?.isSignedIn),
        chainId: walletSnapshot?.chainId || null,
        network: walletSnapshot?.activeChainName || "",
        onArc: Boolean(walletSnapshot?.onArc),
        usdcBalance: walletSnapshot?.usdcBalance || "",
        nativeBalance: walletSnapshot?.nativeBalance || "",
        balanceStatus: walletSnapshot?.balanceStatus || "idle"
      },
      portfolio: {
        totalValueUsd,
        assets: assets.slice(0, 8).map((asset) => ({
          symbol: asset.symbol,
          balance: asset.balance,
          balanceLabel: asset.balanceLabel,
          name: asset.name,
          valueUsd: Number(asset.valueUsd) || 0,
          allocation: Number(asset.allocation) || 0,
          hasValue: asset.hasValue !== false
        }))
      },
      activity: {
        status: activityStatus || "idle",
        items: Array.isArray(activityItems) ? activityItems.slice(0, 8) : []
      }
    };
  }, [activityItems, activityStatus, walletSnapshot]);

  const publicWalletContext = useMemo(() => ({
    wallet: {
      connected: context.wallet.connected,
      chainId: context.wallet.chainId,
      network: context.wallet.network,
      onArc: context.wallet.onArc,
      usdcBalance: context.wallet.usdcBalance,
      nativeBalance: context.wallet.nativeBalance,
      balanceStatus: context.wallet.balanceStatus
    },
    portfolio: context.portfolio,
    activity: {
      status: context.activity.status,
      count: context.activity.items.length,
      items: context.activity.items.slice(0, 5).map((item) => ({
        type: item.type,
        kind: item.kind,
        amount: item.amount,
        chain: item.chain,
        timeLabel: item.timeLabel,
        txHashShort: item.txHashShort
      }))
    }
  }), [context]);

  const totalValue = context.portfolio.totalValueUsd;
  const latestActivity = context.activity.items[0] || null;
  const activityCount = Array.isArray(activityItems) ? activityItems.length : 0;

  const waitForPuter = async () => {
    setFallbackNeeded(true);
    for (let index = 0; index < 40; index += 1) {
      if (typeof window !== "undefined" && window.puter?.ai?.chat && window.puter?.auth) {
        syncPuterState();
        return true;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
    }
    throw new Error("Fallback AI is still loading. Try again in a moment.");
  };

  const ensurePuterSession = async (allowPopup = true) => {
    await waitForPuter();
    if (window.puter.auth.isSignedIn?.()) {
      setPuterSignedIn(true);
      return true;
    }
    if (!allowPopup) throw new Error("Connect the fallback AI once to continue.");
    await window.puter.auth.signIn({ attempt_temp_user_creation: true });
    const signedIn = Boolean(window.puter.auth.isSignedIn?.());
    setPuterSignedIn(signedIn);
    if (!signedIn) throw new Error("AI sign-in did not complete.");
    return true;
  };

  const buildConversation = (nextMessages) => ([
    {
      role: "system",
      content: [
        "You are Lumexa Wallet Copilot inside Lumexa AI Wallet, a self-custodial wallet built on Arc.",
        "Be concise, practical, and transaction-aware. Prefer short paragraphs or short bullet-style lines.",
        "Use supplied wallet context only for wallet-specific facts.",
        "Use live tools for current Arc status. Use wallet action tools when the user asks to send, swap, bridge, switch network, or open a feature.",
        "Wallet action tools only prepare actions. Never claim an action was signed or confirmed before the wallet/onchain result says so.",
        "Never request seed phrases, private keys, passwords, or signing secrets.",
        `Wallet context: ${JSON.stringify(publicWalletContext)}`
      ].join(" ")
    },
    ...nextMessages.slice(-8).map((item) => ({ role: item.role, content: item.content }))
  ]);

  const callPuterAgent = async (nextMessages, allowPopup) => {
    await ensurePuterSession(allowPopup);
    const conversation = buildConversation(nextMessages);
    const collectedActions = [];
    let response;

    try {
      response = await window.puter.ai.chat(conversation, { model: PUTER_MODEL, tools: agentTools });
    } catch {
      response = await window.puter.ai.chat(conversation, { model: PUTER_MODEL });
    }

    for (let round = 0; round < 3; round += 1) {
      const toolCalls = Array.isArray(response?.message?.tool_calls) ? response.message.tool_calls : [];
      if (!toolCalls.length) {
        return { answer: puterText(response) || "I could not generate a response. Please try again.", actions: collectedActions };
      }
      conversation.push(response.message);
      for (const toolCall of toolCalls.slice(0, 3)) {
        const toolResult = await runTool(toolCall);
        if (toolResult.action) collectedActions.push(toolResult.action);
        conversation.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult.data) });
      }
      response = await window.puter.ai.chat(conversation, { model: PUTER_MODEL, tools: agentTools });
    }

    return {
      answer: puterText(response) || (collectedActions.length ? "I prepared that action for your review." : "Please try again."),
      actions: collectedActions
    };
  };

  const askAssistant = async (nextQuestion, { allowPopup = true } = {}) => {
    const trimmed = String(nextQuestion || "").trim();
    if (!trimmed || loading) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const nextMessages = [...messages.slice(-20), { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setQuestion("");
    setLoading(true);
    setError("");
    setActions([]);
    requestRef.current?.abort();
    requestRef.current = new AbortController();

    try {
      if (serverAiReady) {
        try {
          const response = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: requestRef.current.signal,
            body: JSON.stringify({ question: trimmed, messages: nextMessages.slice(-8), context, stream: false })
          });
          const payload = await response.json().catch(() => ({}));
          if (requestId !== requestIdRef.current) return;
          if (response.ok && payload?.answer) {
            setMessages((current) => [...current.slice(-21), { role: "assistant", content: payload.answer }]);
            setActions(Array.isArray(payload.actions) ? payload.actions : []);
            return;
          }
          setFallbackNeeded(true);
        } catch (serverError) {
          if (serverError?.name === "AbortError") throw serverError;
          setFallbackNeeded(true);
        }
      }

      const result = await callPuterAgent(nextMessages, allowPopup);
      if (requestId !== requestIdRef.current) return;
      setMessages((current) => [...current.slice(-21), { role: "assistant", content: result.answer }]);
      setActions(result.actions || []);
    } catch (nextError) {
      if (requestId !== requestIdRef.current) return;
      if (nextError?.name !== "AbortError") setError(describeError(nextError));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialPrompt?.id || !initialPrompt?.text || externalPromptRef.current === initialPrompt.id) return;
    externalPromptRef.current = initialPrompt.id;
    if (!serverAiReady && !puterSignedIn && !serverAiChecked) {
      setQuestion(initialPrompt.text);
      return;
    }
    void askAssistant(initialPrompt.text, { allowPopup: false });
  }, [initialPrompt, puterSignedIn, serverAiChecked, serverAiReady]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, actions]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await askAssistant(question, { allowPopup: true });
  };

  const stopAssistant = () => {
    requestIdRef.current += 1;
    requestRef.current?.abort();
    setLoading(false);
  };

  const clearConversation = () => {
    stopAssistant();
    setMessages([]);
    setQuestion("");
    setActions([]);
    setError("");
  };

  const openView = (view) => {
    onWalletAction?.({
      id: `quick-${view}-${Date.now()}`,
      kind: "wallet-action",
      tool: "open_wallet_view",
      label: `Open ${view}`,
      args: { view }
    });
  };

  const providerReady = serverAiReady || puterSignedIn;
  const providerLabel = serverAiReady ? "Lumexa AI" : puterSignedIn ? "Fallback AI" : serverAiChecked ? "AI offline" : "Checking AI";
  const showStarter = messages.length === 0 && !loading;
  const showFallbackScript = fallbackNeeded || (serverAiChecked && !serverAiReady);

  return (
    <section className="lumexa-ai-workspace">
      {showFallbackScript ? (
        <Script
          src="https://js.puter.com/v2/"
          strategy="afterInteractive"
          onLoad={syncPuterState}
          onReady={syncPuterState}
          onError={() => setPuterReady(false)}
        />
      ) : null}

      <aside className="lumexa-ai-context-panel">
        <div className="lumexa-ai-identity">
          <span className="lumexa-ai-logo">✦</span>
          <div><strong>Lumexa Copilot</strong><small>Wallet-aware AI</small></div>
          <span className={`lumexa-ai-live ${providerReady ? "is-ready" : ""}`}><i />{providerLabel}</span>
        </div>

        <div className="lumexa-ai-context-grid">
          <article><span>Portfolio</span><strong>{formatUsd(totalValue)}</strong><small>{context.portfolio.assets.length} visible assets</small></article>
          <article><span>Network</span><strong>{walletSnapshot?.activeChainName || "Wallet"}</strong><small>Chain {walletSnapshot?.chainId || "—"}</small></article>
          <article><span>Activity</span><strong>{activityCount}</strong><small>{activityStatus === "loading" ? "Syncing" : "transactions loaded"}</small></article>
          <article><span>Wallet</span><strong>{shortValue(walletSnapshot?.address)}</strong><small>Self-custodial</small></article>
        </div>

        <div className="lumexa-ai-rail-section">
          <div className="lumexa-ai-rail-title"><strong>Quick actions</strong><span>No AI round-trip</span></div>
          <div className="lumexa-ai-quick-grid">
            {QUICK_VIEWS.map((item) => (
              <button key={item.view} type="button" onClick={() => openView(item.view)}>
                <span><FeatureIcon name={item.icon} /></span><strong>{item.label}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="lumexa-ai-rail-section is-latest">
          <div className="lumexa-ai-rail-title"><strong>Latest activity</strong><span>{latestActivity?.timeLabel || "—"}</span></div>
          {latestActivity ? (
            <button type="button" className="lumexa-ai-latest-card" onClick={() => askAssistant("Explain my latest transaction in plain English.", { allowPopup: true })}>
              <span className="lumexa-ai-latest-icon"><FeatureIcon name={latestActivity.kind === "sent" ? "send" : latestActivity.kind === "received" ? "receive" : latestActivity.kind === "swap" ? "swap" : latestActivity.kind?.includes("bridge") ? "bridge" : "activity"} /></span>
              <span><strong>{latestActivity.type || "Transaction"}</strong><small>{latestActivity.amount || latestActivity.txHashShort || "Tracked onchain"}</small></span>
              <b>→</b>
            </button>
          ) : <div className="lumexa-ai-empty-mini">No transaction loaded yet.</div>}
        </div>

        <div className="lumexa-ai-privacy-note"><span>✓</span><div><strong>Private by design</strong><small>Lumexa cannot sign transactions or access your keys.</small></div></div>
      </aside>

      <div className="lumexa-ai-chat-panel">
        <header className="lumexa-ai-chat-head">
          <div>
            <span className="lumexa-ai-chat-orb">✦</span>
            <div><strong>Ask Lumexa</strong><small>{loading ? "Working on your request…" : "Wallet context is available for this session"}</small></div>
          </div>
          <div className="lumexa-ai-chat-tools">
            <span className={`lumexa-ai-provider-pill ${providerReady ? "is-ready" : ""}`}><i />{providerLabel}</span>
            {messages.length ? <button type="button" onClick={clearConversation}>New chat</button> : null}
          </div>
        </header>

        {!serverAiReady && serverAiChecked && !puterSignedIn ? (
          <div className="lumexa-ai-fallback-bar">
            <div><strong>Server AI is unavailable</strong><span>Connect the privacy-safe fallback once to keep the assistant working.</span></div>
            <button type="button" onClick={() => ensurePuterSession(true).catch((nextError) => setError(describeError(nextError)))} disabled={loading || (fallbackNeeded && !puterReady)}>{puterReady ? "Connect fallback" : "Loading…"}</button>
          </div>
        ) : null}

        <div className="lumexa-ai-thread" ref={threadRef}>
          {showStarter ? (
            <div className="lumexa-ai-starter">
              <span className="lumexa-ai-starter-mark">✦</span>
              <h3>What do you want to do?</h3>
              <p>Ask about balances, activity, networks, or prepare wallet actions. Lumexa never signs for you.</p>
              <div className="lumexa-ai-starter-grid">
                {STARTER_PROMPTS.map((item) => (
                  <button key={item.label} type="button" onClick={() => askAssistant(item.prompt, { allowPopup: true })}>
                    <span><FeatureIcon name={item.icon} /></span>
                    <strong>{item.label}</strong>
                    <small>{item.prompt}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message, index) => <Message key={`${message.role}-${index}`} role={message.role} content={message.content} />)}
          {loading ? (
            <article className="lumexa-ai-message is-assistant is-thinking">
              <div className="lumexa-ai-avatar">✦</div>
              <div className="lumexa-ai-message-body">
                <div className="lumexa-ai-message-meta"><strong>Lumexa</strong><span>Analyzing</span></div>
                <div className="lumexa-ai-thinking"><i /><i /><i /></div>
              </div>
            </article>
          ) : null}
        </div>

        {actions.length ? (
          <div className="lumexa-ai-prepared-actions">
            <div className="lumexa-ai-prepared-head"><strong>Prepared for review</strong><span>Your wallet still controls the final signature</span></div>
            <div className="lumexa-ai-action-stack">
              {actions.map((action) => <PreparedAction key={action.id} action={action} onOpen={onWalletAction} />)}
            </div>
          </div>
        ) : null}

        <div className="lumexa-ai-composer-wrap">
          <form className="lumexa-ai-composer" onSubmit={handleSubmit}>
            <div className="lumexa-ai-composer-context"><span>✦</span><strong>Wallet context</strong><small>{walletSnapshot?.activeChainName || "Connected wallet"}</small></div>
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (question.trim() && !loading) void askAssistant(question, { allowPopup: true });
                }
              }}
              placeholder="Ask about your wallet, a transaction, or prepare an action…"
              rows={1}
              aria-label="Ask Lumexa"
            />
            {loading ? (
              <button type="button" className="lumexa-ai-stop" aria-label="Stop response" onClick={stopAssistant}>■</button>
            ) : (
              <button type="submit" className="lumexa-ai-send" aria-label="Send message" disabled={!question.trim()}>↑</button>
            )}
          </form>
          <div className="lumexa-ai-composer-foot"><span>Enter to send · Shift + Enter for a new line</span><span>Never share seed phrases or private keys.</span></div>
        </div>

        {error ? <div className="lumexa-ai-error"><strong>Assistant unavailable</strong><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div> : null}
      </div>
    </section>
  );
}
