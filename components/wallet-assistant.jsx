import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildWalletInsights } from "../lib/wallet-copilot";

const quickPrompts = [
  "Send 5 USDC",
  "Check my USDC balance",
  "Show last transactions",
  "Bridge assets",
  "Portfolio summary",
  "Analyze wallet activity",
  "Explain how this wallet solves user problems"
];

function MessageBubble({ role, content }) {
  return (
    <div className={`assistant-message assistant-message-${role}`}>
      <span className="field-label">
        {role === "assistant" ? "Wallet Copilot" : "You"}
      </span>
      <p>{content || "..."}</p>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="assistant-message assistant-message-assistant assistant-message-thinking">
      <span className="field-label">Wallet Copilot</span>
      <p>
        Thinking
        <span className="typing-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
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

function ActionButton({ action, onPrompt }) {
  if (action.kind === "prompt") {
    return (
      <button
        type="button"
        className="button button-secondary"
        onClick={() => onPrompt(action.prompt)}
      >
        {action.label}
      </button>
    );
  }

  if (action.kind === "internal-link") {
    return (
      <Link href={action.href} className="button button-secondary">
        {action.label}
      </Link>
    );
  }

  if (action.kind === "link") {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noreferrer"
        className="button button-secondary"
      >
        {action.label}
      </a>
    );
  }

  return null;
}

export default function WalletAssistant({
  walletSnapshot,
  activityItems,
  activityStatus
}) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "I'm your Arc wallet copilot. Ask about balances, recent activity, Send, Bridge, Receive, or what to do next."
    }
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Wallet Copilot Ready");
  const [actions, setActions] = useState([]);
  const autoAnalyzeAddressRef = useRef("");
  const threadRef = useRef(null);

  const context = useMemo(
    () => ({
      wallet: {
        address: walletSnapshot?.address || "",
        connected: Boolean(walletSnapshot?.isSignedIn),
        onArc: Boolean(walletSnapshot?.onArc),
        usdcBalance: walletSnapshot?.usdcBalance || "",
        balanceStatus: walletSnapshot?.balanceStatus || "idle"
      },
      activity: {
        status: activityStatus,
        items: Array.isArray(activityItems) ? activityItems.slice(0, 12) : []
      }
    }),
    [activityItems, activityStatus, walletSnapshot]
  );

  const insights = useMemo(() => buildWalletInsights(context), [context]);

  const askAssistant = async (nextQuestion) => {
    const trimmed = String(nextQuestion || "").trim();

    if (!trimmed || loading) {
      return;
    }

    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setQuestion("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: trimmed,
          messages: nextMessages.slice(-6),
          context,
          stream: false
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Wallet Copilot is unavailable.");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            payload.answer ||
            "I couldn't generate a wallet answer right now. Please try again."
        }
      ]);
      setNotice(payload.notice || "Wallet Copilot Ready");
      setActions(Array.isArray(payload.actions) ? payload.actions : []);
    } catch {
      setError("Wallet Copilot is temporarily unavailable. Please try again.");
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
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, loading]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await askAssistant(question);
  };

  return (
    <section className="card">
      <div className="assistant-hero">
        <div className="ai-orb-avatar" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="section-kicker">AI Assistant</p>
          <h2>Arc wallet copilot</h2>
          <p className="helper-copy">
            Ask for balance checks, transaction explanations, bridge guidance,
            and plain-English wallet intelligence.
          </p>
        </div>
        <span className="status-badge">
          {loading
            ? "Thinking"
            : walletSnapshot?.isSignedIn
              ? "Live wallet mode"
              : "AI ready"}
        </span>
      </div>

      <div className="copilot-summary-grid">
        <div className="summary-card">
          <span className="field-label">Connected wallet</span>
          <strong>{walletSnapshot?.address || "No wallet connected"}</strong>
          <small>
            {walletSnapshot?.onArc
              ? "Arc Testnet ready"
              : "Connect and switch to Arc for full wallet actions"}
          </small>
        </div>
        <div className="summary-card">
          <span className="field-label">USDC balance</span>
          <strong>{walletSnapshot?.usdcBalance || "Syncing..."}</strong>
          <small>Live from your connected Arc wallet snapshot</small>
        </div>
        <div className="summary-card">
          <span className="field-label">Recent activity</span>
          <strong>{Array.isArray(activityItems) ? activityItems.length : 0} events</strong>
          <small>Live send, receive, and bridge events for this wallet</small>
        </div>
      </div>

      <p className="helper-copy">{notice}</p>

      <div className="insight-grid">
        {insights.map((item) => (
          <InsightCard key={item.id} item={item} />
        ))}
      </div>

      <div className="prompt-row">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="prompt-chip"
            onClick={() => askAssistant(prompt)}
            disabled={loading}
          >
            {prompt}
          </button>
        ))}
      </div>

      {actions.length ? (
        <div className="action-row">
          {actions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onPrompt={askAssistant}
            />
          ))}
        </div>
      ) : null}

      <div className="assistant-thread" ref={threadRef}>
        {messages.map((message, index) => (
          <MessageBubble
            key={`${message.role}-${index}`}
            role={message.role}
            content={message.content}
          />
        ))}
        {loading ? <ThinkingBubble /> : null}
      </div>

      <form className="assistant-form" onSubmit={handleSubmit}>
        <textarea
          className="assistant-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about Send, Bridge, Receive, or your wallet activity..."
          rows={4}
        />
        <div className="assistant-form-row">
          <span className="helper-copy">
            Mic ready soon. Type a command like "Analyze my wallet" today.
          </span>
          <button type="button" className="button button-secondary" disabled title="Voice commands coming soon">
            Mic
          </button>
          <button type="submit" className="button button-primary" disabled={loading}>
            {loading ? "Thinking..." : "Ask Copilot"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="empty-state empty-state-compact">
          <strong>AI assistant unavailable</strong>
          <p>{error}</p>
        </div>
      ) : null}
    </section>
  );
}
