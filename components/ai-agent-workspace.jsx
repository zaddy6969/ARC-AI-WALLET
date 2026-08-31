import { useEffect, useRef, useState } from "react";
import WalletAssistant from "./wallet-assistant";

const SHORTCUTS = [
  {
    label: "Analyze wallet",
    prompt: "Analyze my wallet. Summarize balances, recent activity, anything unusual, and the most useful next action."
  },
  {
    label: "Check Arc",
    prompt: "Check the live Arc Testnet network status and tell me the latest block and RPC latency."
  },
  {
    label: "Bridge USDC",
    prompt: "Help me bridge USDC to Arc. Ask only for the details you still need, then prepare the bridge action for review."
  },
  {
    label: "Unified Balance",
    prompt: "Show me my Unified Balance options and open the Unified Balance view if that is the right next step."
  }
];

export default function AiAgentWorkspace({
  walletSnapshot,
  activityItems,
  activityStatus,
  initialPrompt,
  onWalletAction
}) {
  const [prompt, setPrompt] = useState(initialPrompt || null);
  const promptRef = useRef(0);

  useEffect(() => {
    if (initialPrompt?.id && initialPrompt?.text) setPrompt(initialPrompt);
  }, [initialPrompt]);

  const runShortcut = (text) => {
    promptRef.current += 1;
    setPrompt({
      id: `agent-shortcut-${Date.now()}-${promptRef.current}`,
      text
    });
  };

  return (
    <section className="agent-chat-page">
      <div className="agent-chat-header">
        <div>
          <h2>AI Assistant</h2>
          <p>Ask about your wallet or prepare an action.</p>
        </div>
        <div className="agent-chat-shortcuts" aria-label="AI shortcuts">
          {SHORTCUTS.map((item) => (
            <button key={item.label} type="button" onClick={() => runShortcut(item.prompt)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="agent-assistant-stage">
        <WalletAssistant
          walletSnapshot={walletSnapshot}
          activityItems={activityItems}
          activityStatus={activityStatus}
          initialPrompt={prompt}
          onWalletAction={onWalletAction}
        />
      </div>
    </section>
  );
}
