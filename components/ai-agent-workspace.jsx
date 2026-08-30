import { useEffect, useMemo, useRef, useState } from "react";
import WalletAssistant from "./wallet-assistant";

const MISSIONS = [
  { label: "Scan my wallet", prompt: "Analyze my wallet deeply. Summarize balances, recent activity, unusual patterns and the most useful next action." },
  { label: "Check Arc live", prompt: "Check the live Arc Testnet network status and tell me the latest block and RPC latency." },
  { label: "Risk review", prompt: "Review my wallet risk using my balances and recent activity. Flag anything I should inspect before signing another transaction." },
  { label: "Latest Arc update", prompt: "Check the latest official Arc Node release and summarize what changed and why it matters to an Arc user." },
  { label: "Bridge planner", prompt: "Help me plan the safest supported USDC bridge into Arc. Ask only for details you still need, then prepare the wallet action for review." },
  { label: "Unified Balance", prompt: "Explain my Unified Balance options and open the Unified Balance wallet view if that is the right next step." }
];

function shortAddress(address) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatBlock(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? new Intl.NumberFormat("en-US").format(number) : "Syncing";
}

export default function AiAgentWorkspace({
  walletSnapshot,
  activityItems,
  activityStatus,
  initialPrompt,
  onWalletAction
}) {
  const [network, setNetwork] = useState(null);
  const [networkError, setNetworkError] = useState("");
  const [missionPrompt, setMissionPrompt] = useState(initialPrompt || null);
  const missionRef = useRef(0);

  useEffect(() => {
    if (initialPrompt?.id && initialPrompt?.text) setMissionPrompt(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const refresh = async () => {
      try {
        const response = await fetch("/api/arc-status", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Arc status unavailable");
        if (!cancelled) {
          setNetwork(payload);
          setNetworkError("");
        }
      } catch {
        if (!cancelled) setNetworkError("Live RPC check unavailable");
      }
    };

    void refresh();
    timer = window.setInterval(refresh, 20000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  const activityCount = Array.isArray(activityItems) ? activityItems.length : 0;
  const pendingCount = useMemo(() => (
    Array.isArray(activityItems)
      ? activityItems.filter((item) => !["confirmed", "failed"].includes(String(item?.status || "").toLowerCase())).length
      : 0
  ), [activityItems]);

  const runMission = (prompt) => {
    missionRef.current += 1;
    setMissionPrompt({ id: `agent-mission-${Date.now()}-${missionRef.current}`, text: prompt });
    window.requestAnimationFrame(() => {
      document.querySelector(".agent-assistant-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section className="agent-command-center">
      <div className="agent-command-hero">
        <div className="agent-command-copy">
          <div className="agent-command-kicker"><span className="agent-command-pulse" /> ARC AGENT COMMAND CENTER</div>
          <h2>One agent for your wallet and Arc.</h2>
          <p>
            Ask it to inspect live network data, understand your wallet, review risk, and prepare Send, Swap or Bridge actions. You still approve every transaction.
          </p>
          <div className="agent-command-actions">
            <button type="button" className="button button-primary" onClick={() => runMission(MISSIONS[0].prompt)}>Run wallet scan</button>
            <button type="button" className="button button-secondary" onClick={() => runMission(MISSIONS[1].prompt)}>Check Arc live</button>
          </div>
        </div>

        <div className="agent-core-visual" aria-hidden="true">
          <span className="agent-core-ring agent-core-ring-one" />
          <span className="agent-core-ring agent-core-ring-two" />
          <span className="agent-core-orb">AI</span>
          <small>LIVE AGENT</small>
        </div>
      </div>

      <div className="agent-live-grid">
        <article className="agent-live-card">
          <span>ARC NETWORK</span>
          <strong>{network?.ok ? "ONLINE" : networkError ? "CHECK" : "SYNCING"}</strong>
          <small>Block {formatBlock(network?.blockNumber)} · {network?.latencyMs ? `${network.latencyMs} ms RPC` : "live RPC"}</small>
        </article>
        <article className="agent-live-card">
          <span>CONNECTED WALLET</span>
          <strong>{shortAddress(walletSnapshot?.address)}</strong>
          <small>{walletSnapshot?.usdcBalance || "Balance syncing"}</small>
        </article>
        <article className="agent-live-card">
          <span>ACTIVITY INTELLIGENCE</span>
          <strong>{activityCount} EVENTS</strong>
          <small>{pendingCount ? `${pendingCount} need status review` : activityStatus === "ready" ? "Activity synced" : "Syncing activity"}</small>
        </article>
        <article className="agent-live-card agent-live-card-safe">
          <span>EXECUTION MODE</span>
          <strong>USER SIGNS</strong>
          <small>Agent prepares · wallet approves</small>
        </article>
      </div>

      <div className="agent-command-layout">
        <aside className="agent-mission-panel">
          <div className="agent-mission-heading">
            <span>QUICK MISSIONS</span>
            <strong>Give the agent a job</strong>
          </div>
          <div className="agent-mission-list">
            {MISSIONS.map((mission, index) => (
              <button key={mission.label} type="button" onClick={() => runMission(mission.prompt)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{mission.label}</strong><small>Run with wallet context</small></div>
                <b>→</b>
              </button>
            ))}
          </div>
          <div className="agent-safety-card">
            <span>SELF-CUSTODY GUARD</span>
            <strong>The agent cannot sign for you.</strong>
            <p>Recipients, amounts, quotes and networks stay visible for your review before wallet approval.</p>
          </div>
        </aside>

        <div className="agent-assistant-stage">
          <div className="agent-stage-label">
            <div><span>LIVE CONSOLE</span><strong>Talk to Arc AI Agent</strong></div>
            <small><i /> Arc + wallet tools connected</small>
          </div>
          <WalletAssistant
            walletSnapshot={walletSnapshot}
            activityItems={activityItems}
            activityStatus={activityStatus}
            initialPrompt={missionPrompt}
            onWalletAction={onWalletAction}
          />
        </div>
      </div>
    </section>
  );
}
