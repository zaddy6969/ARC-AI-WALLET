import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildWalletInsights } from "../lib/wallet-copilot";

const quickPrompts = [
  "Analyze my wallet",
  "Show my balance",
  "Explain my last transaction",
  "How do I bridge to Arc?",
  "Check my wallet risk"
];

function MessageBubble({ role, content }) {
  return (
    <div className={`assistant-message assistant-message-${role}`}>
      <span className="field-label">{role === "assistant" ? "Arc AI" : "You"}</span>
      <p>{content || "..."}</p>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="assistant-message assistant-message-assistant assistant-message-thinking">
      <span className="field-label">Arc AI</span>
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
      content: "Arc AI Copilot is ready. Ask about your wallet or tell me to prepare a Send, Swap, Bridge, or network switch."
    }
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Live wallet intelligence");
  const [actions, setActions] = useState([]);
  const autoAnalyzeAddressRef = useRef("");
  const externalPromptRef = useRef("");
  const threadRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

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

  const insights = useMemo(() => buildWalletInsights(context), [context]);

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
      setError("Arc AI could not complete that request. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      walletSnapshot?.isSignedIn &&
      walletSnapshot?.address &&
      autoAnalyzeAddressRef.current !== walletSnapshot.address
    ) {
      autoAnalyzeAddressRef.current = walletSnapshot.address;
      void askAssistant("Analyze my wallet");
    }
  }, [walletSnapshot?.address, walletSnapshot?.isSignedIn]);

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

  return (
    <section className="card pro-ai-assistant">
      <div className="assistant-hero">
        <div className="ai-orb-avatar" aria-hidden="true"><span /></div>
        <div><p className="section-kicker">Arc AI</p><h2>Wallet copilot</h2></div>
        <span className="status-badge">{loading ? "Thinking" : "Ready"}</span>
      </div>

      <div className="copilot-summary-grid">
        <div className="summary-card"><span className="field-label">Wallet</span><strong>{walletSnapshot?.address ? `${walletSnapshot.address.slice(0, 6)}…${walletSnapshot.address.slice(-4)}` : "Not connected"}</strong><small>{walletSnapshot?.onArc ? "Arc connected" : "Network check"}</small></div>
        <div className="summary-card"><span className="field-label">USDC</span><strong>{walletSnapshot?.usdcBalance || "Syncing…"}</strong><small>Live Arc balance</small></div>
        <div className="summary-card"><span className="field-label">Activity</span><strong>{Array.isArray(activityItems) ? activityItems.length : 0} events</strong><small>Wallet context</small></div>
      </div>

      <p className="helper-copy">{notice}</p>

      <div className="prompt-row">
        {quickPrompts.map((prompt) => (
          <button key={prompt} type="button" className="prompt-chip" onClick={() => askAssistant(prompt)} disabled={loading}>{prompt}</button>
        ))}
      </div>

      <div className="assistant-thread" ref={threadRef}>
        {messages.map((message, index) => (
          <MessageBubble key={`${message.role}-${index}`} role={message.role} content={message.content} />
        ))}
        {loading ? <ThinkingBubble /> : null}
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
          placeholder='Try “send 5 USDC to 0x…” or “bridge 10 USDC from Base to Arc”'
          rows={3}
        />
        <div className="assistant-form-row">
          <button type="submit" className="button button-primary" disabled={loading || !question.trim()}>{loading ? "Thinking…" : "Ask Arc AI"}</button>
        </div>
      </form>

      {error ? <div className="empty-state empty-state-compact"><strong>Arc AI unavailable</strong><p>{error}</p></div> : null}
    </section>
  );
}
