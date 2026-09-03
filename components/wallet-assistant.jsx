import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";

const PUTER_MODEL = "gpt-5-nano";

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
      description: "Prepare a USDC bridge between Arc, Ethereum Sepolia and Base Sepolia. User review and wallet signature are required.",
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
      description: "Prepare a request to switch the connected wallet network.",
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

function Message({ role, content }) {
  return (
    <div className={`wallet-v3-ai-message is-${role}`}>
      <span>{role === "assistant" ? "Lumexa" : "You"}</span>
      <p>{content}</p>
    </div>
  );
}

export default function WalletAssistant({
  walletSnapshot,
  activityItems,
  activityStatus,
  initialPrompt,
  onWalletAction
}) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "How can I help with your wallet? I can explain activity, check Arc, or prepare a send, swap, bridge, or network switch for your review." }
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actions, setActions] = useState([]);
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
      .then((payload) => { if (active) setServerAiReady(Boolean(payload?.ready)); })
      .catch(() => { if (active) setServerAiReady(false); });
    return () => { active = false; };
  }, []);

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
        assets: assets.map((asset) => ({ symbol: asset.symbol, balance: asset.balance, valueUsd: Number(asset.valueUsd) || 0 }))
      },
      activity: {
        status: activityStatus || "idle",
        items: Array.isArray(activityItems) ? activityItems.slice(0, 12) : []
      }
    };
  }, [activityItems, activityStatus, walletSnapshot]);

  const publicWalletContext = useMemo(() => ({
    wallet: context.wallet,
    portfolio: context.portfolio,
    activity: {
      status: context.activity.status,
      count: context.activity.items.length,
      items: context.activity.items.slice(0, 6).map((item) => ({
        type: item.type,
        kind: item.kind,
        amount: item.amount,
        chain: item.chain,
        timeLabel: item.timeLabel,
        txHashShort: item.txHashShort
      }))
    }
  }), [context]);

  const ensurePuterSession = async (allowPopup = true) => {
    if (typeof window === "undefined" || !window.puter?.ai?.chat || !window.puter?.auth) {
      throw new Error("Fallback AI is still loading. Try again in a moment.");
    }
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
        "You are Lumexa Assistant inside Lumexa AI Wallet, a self-custodial wallet built on Arc.",
        "Be concise and useful. Use supplied wallet context only for wallet-specific facts.",
        "Use live tools for current Arc status. Use wallet action tools when the user asks to send, swap, bridge, switch network, or open a feature.",
        "Wallet action tools only prepare actions. Never claim an action was signed or confirmed before the wallet/onchain result says so.",
        "Never request seed phrases, private keys, passwords, or signing secrets.",
        `Wallet context: ${JSON.stringify(publicWalletContext)}`
      ].join(" ")
    },
    ...nextMessages.slice(-10).map((item) => ({ role: item.role, content: item.content }))
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

    const nextMessages = [...messages, { role: "user", content: trimmed }];
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
            body: JSON.stringify({ question: trimmed, messages: nextMessages.slice(-10), context, stream: false })
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok && payload?.answer) {
            setMessages((current) => [...current, { role: "assistant", content: payload.answer }]);
            setActions(Array.isArray(payload.actions) ? payload.actions : []);
            return;
          }
        } catch (serverError) {
          if (serverError?.name === "AbortError") throw serverError;
        }
      }

      const result = await callPuterAgent(nextMessages, allowPopup);
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
      setActions(result.actions || []);
    } catch (nextError) {
      if (nextError?.name !== "AbortError") setError(describeError(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialPrompt?.id || !initialPrompt?.text || externalPromptRef.current === initialPrompt.id) return;
    externalPromptRef.current = initialPrompt.id;
    if (!serverAiReady && !puterSignedIn) {
      setQuestion(initialPrompt.text);
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

  const providerReady = serverAiReady || puterSignedIn;

  return (
    <section className="wallet-v3-ai-shell">
      <Script
        src="https://js.puter.com/v2/"
        strategy="afterInteractive"
        onLoad={syncPuterState}
        onReady={syncPuterState}
        onError={() => setPuterReady(false)}
      />

      <div className="wallet-v3-ai-statusbar">
        <div><span className="wallet-v3-ai-orb">✦</span><div><strong>Lumexa Assistant</strong><small>{walletSnapshot?.activeChainName || "Wallet intelligence"}</small></div></div>
        <span className={`wallet-v3-ai-status ${providerReady ? "is-ready" : ""}`}><i />{loading ? "Thinking" : providerReady ? "Ready" : "Connect AI"}</span>
      </div>

      {!serverAiReady && !puterSignedIn ? (
        <div className="wallet-v3-ai-connect">
          <div><strong>Connect the fallback AI once</strong><span>Your wallet remains self-custodial. Lumexa never gets signing access.</span></div>
          <button type="button" className="wallet-v3-secondary-button" onClick={() => ensurePuterSession(true).catch((nextError) => setError(describeError(nextError)))} disabled={!puterReady || loading}>{puterReady ? "Connect AI" : "Loading…"}</button>
        </div>
      ) : null}

      <div className="wallet-v3-ai-thread" ref={threadRef}>
        {messages.map((message, index) => <Message key={`${message.role}-${index}`} role={message.role} content={message.content} />)}
        {loading ? <div className="wallet-v3-ai-message is-assistant is-thinking"><span>Lumexa</span><p>Thinking<span className="wallet-v3-dots">…</span></p></div> : null}
      </div>

      {actions.length ? (
        <div className="wallet-v3-ai-actions">
          {actions.map((action) => (
            <button key={action.id} type="button" className="wallet-v3-primary-button" onClick={() => onWalletAction?.(action)}>{action.label || "Review action"}</button>
          ))}
        </div>
      ) : null}

      <form className="wallet-v3-ai-composer" onSubmit={handleSubmit}>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (question.trim() && !loading) void askAssistant(question, { allowPopup: true });
            }
          }}
          placeholder="Ask Lumexa about your wallet or prepare an action…"
          rows={2}
          aria-label="Ask Lumexa"
        />
        <button type="submit" aria-label="Send message" disabled={loading || !question.trim()}>↑</button>
      </form>

      <div className="wallet-v3-ai-foot">AI never signs transactions. Review every amount, recipient, quote, and network in your wallet.</div>
      {error ? <div className="wallet-v3-inline-warning is-error"><strong>Assistant unavailable</strong><span>{error}</span></div> : null}
    </section>
  );
}
