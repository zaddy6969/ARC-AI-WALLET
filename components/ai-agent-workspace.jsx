import { useEffect, useState } from "react";
import WalletAssistant from "./wallet-assistant";

export default function AiAgentWorkspace({
  walletSnapshot,
  activityItems,
  activityStatus,
  initialPrompt,
  onWalletAction
}) {
  const [prompt, setPrompt] = useState(initialPrompt || null);

  useEffect(() => {
    if (initialPrompt?.id && initialPrompt?.text) setPrompt(initialPrompt);
  }, [initialPrompt]);

  return (
    <section className="wallet-v3-agent-page">
      <header className="wallet-v3-page-head">
        <div>
          <span className="wallet-v3-eyebrow">Lumexa intelligence</span>
          <h2>AI Assistant</h2>
          <p>One assistant for wallet questions, analysis, and preparing actions for your approval.</p>
        </div>
      </header>
      <WalletAssistant
        walletSnapshot={walletSnapshot}
        activityItems={activityItems}
        activityStatus={activityStatus}
        initialPrompt={prompt}
        onWalletAction={onWalletAction}
      />
    </section>
  );
}
