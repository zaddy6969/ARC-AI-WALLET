import { useEffect, useMemo, useState } from "react";
import { ARC_TESTNET_NETWORK_CONFIG, arcTestnet } from "../lib/arc-chain";

const RESOURCES = [
  ["Arc Docs", "Official Arc network and developer documentation", "https://docs.arc.io/"],
  ["App Kit", "Bridge, swap, send and Unified Balance workflows", "https://docs.arc.io/app-kit"],
  ["Unified Balance", "Chain-agnostic USDC balance and crosschain spend", "https://docs.arc.io/app-kit/unified-balance"],
  ["ArcScan", "Inspect blocks, transactions, wallets and contracts", ARC_TESTNET_NETWORK_CONFIG.explorerUrl],
  ["Circle Faucet", "Get testnet tokens for Arc and supported networks", "https://faucet.circle.com"],
  ["Contract Addresses", "Verify official Arc contract addresses before interacting", "https://docs.arc.io/arc/references/contract-addresses"],
  ["EVM Differences", "Review Arc-specific EVM behavior before deploying", "https://docs.arc.io/arc/references/evm-differences"],
  ["Gas and Fees", "Understand USDC gas and Arc's stable-fee design", "https://docs.arc.io/arc/references/gas-and-fees"],
  ["Deterministic Finality", "Learn how Arc reaches sub-second deterministic finality", "https://docs.arc.io/arc/concepts/deterministic-finality"],
  ["Opt-in Privacy", "Explore confidential transactions and selective disclosure", "https://docs.arc.io/arc/concepts/opt-in-privacy"],
  ["Post-quantum Security", "Read Arc's quantum-resilient security roadmap", "https://docs.arc.io/arc/concepts/post-quantum-security"],
  ["Account Abstraction", "Explore smart accounts and paymaster providers", "https://docs.arc.io/arc/tools/account-abstraction"],
  ["Agentic Economy", "Onchain identity, work and settlement for AI agents", "https://docs.arc.io/build/agentic-economy"],
  ["ERC-8004 Agents", "Register onchain AI-agent identity and reputation", "https://docs.arc.io/arc/tutorials/register-your-first-ai-agent"],
  ["ERC-8183 Jobs", "Create escrowed jobs, deliverables and settlement", "https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job"],
  ["Arc MCP Server", "Connect AI developer tools directly to Arc documentation", "https://docs.arc.io/ai/mcp"],
  ["Run an Arc Node", "Node setup and operator documentation", "https://docs.arc.io/arc/tutorials/run-an-arc-node"],
  ["Arc Node v0.8.0", "Zero8-ready node release and operator changes", "https://github.com/circlefin/arc-node/releases/tag/v0.8.0"],
  ["Circle Skills", "Official AI build skills for Arc and Circle products", "https://github.com/circlefin/skills"]
];

const JOURNEYS = [
  {
    id: "new",
    eyebrow: "NEW TO ARC",
    title: "Get funded and make your first move",
    text: "Use the faucet, confirm Arc Testnet, then send, swap or bridge test USDC with review-first wallet signing.",
    actions: [["Get test USDC", "external", "https://faucet.circle.com"], ["Open Send", "wallet", "send"], ["Open Bridge", "wallet", "bridge"]]
  },
  {
    id: "money",
    eyebrow: "PROGRAMMABLE MONEY",
    title: "Use one USDC workflow across chains",
    text: "Inspect your Unified Balance, bridge into Arc, swap supported assets and create payment requests without leaving the wallet.",
    actions: [["Unified Balance", "wallet", "unified"], ["Swap", "wallet", "swap"], ["Request payment", "wallet", "request"]]
  },
  {
    id: "builder",
    eyebrow: "BUILDERS",
    title: "Ship an Arc application",
    text: "Copy chain essentials, verify official contracts, check EVM differences and use Arc's EVM-compatible developer stack.",
    actions: [["Build overview", "external", "https://docs.arc.io/build"], ["Contract addresses", "external", "https://docs.arc.io/arc/references/contract-addresses"], ["Sample apps", "external", "https://docs.arc.io/arc/references/sample-applications"]]
  },
  {
    id: "agent",
    eyebrow: "AI + AGENTS",
    title: "Explore Arc's agentic economy",
    text: "Learn ERC-8004 identity and reputation, ERC-8183 jobs and escrow, and use Arc MCP/Circle Skills for AI-native development.",
    actions: [["Agentic economy", "external", "https://docs.arc.io/build/agentic-economy"], ["Register agent", "external", "https://docs.arc.io/arc/tutorials/register-your-first-ai-agent"], ["Create a job", "external", "https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job"]]
  },
  {
    id: "operator",
    eyebrow: "NODE OPERATORS",
    title: "Prepare for Zero8",
    text: "Review Arc Node v0.8.0, safer RPC defaults, relay failover, database migrations and operator requirements before the testnet activation window.",
    actions: [["v0.8.0 release", "external", "https://github.com/circlefin/arc-node/releases/tag/v0.8.0"], ["Run a node", "external", "https://docs.arc.io/arc/tutorials/run-an-arc-node"]]
  }
];

const CAPABILITIES = [
  ["Send USDC", "Live in wallet", "live", "Same-chain wallet transfer with review before signing."],
  ["Bridge", "Live in wallet", "live", "Move supported testnet USDC routes into Arc."],
  ["Swap", "Live in wallet", "live", "Prepare supported token swaps with live quote review."],
  ["Unified Balance", "Live in wallet", "live", "View supported crosschain USDC balances from one Arc wallet screen."],
  ["Payment requests", "Live in wallet", "live", "Create shareable Arc USDC payment requests and QR flows."],
  ["Arc AI Copilot", "Live in wallet", "live", "Explain wallet data and prepare review-first actions; it never signs for you."],
  ["Opt-in privacy", "Arc capability", "docs", "Official Arc privacy architecture; wallet transaction UI integration is not claimed here."],
  ["Account abstraction", "Integration path", "docs", "Official provider ecosystem for smart accounts and paymasters."],
  ["Agent identity/jobs", "Builder path", "docs", "ERC-8004 identity and ERC-8183 jobs are surfaced as developer/community workflows."],
  ["Node operator tools", "Community tools", "docs", "Live network health plus official node docs and release guidance."]
];

function openExternal(url) {
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

function openWalletView(view) {
  if (typeof window === "undefined") return;
  window.location.hash = view;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function shortAddress(value) {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function ResourceCard({ item }) {
  const [title, description, url] = item;
  return (
    <button type="button" onClick={() => openExternal(url)}>
      <strong>{title}</strong><span>{description}</span><em>↗</em>
    </button>
  );
}

export default function ArcCommunityHubPanel({ walletSnapshot, onAskCopilot }) {
  const [network, setNetwork] = useState({ status: "loading" });
  const [copied, setCopied] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/arc-status");
        const payload = await response.json();
        if (!cancelled) setNetwork({ status: response.ok && payload.ok ? "ready" : "error", ...payload });
      } catch (error) {
        if (!cancelled) setNetwork({ status: "error", error: error instanceof Error ? error.message : "Network check failed" });
      }
    }
    void load();
    const interval = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const visibleResources = useMemo(() => {
    if (filter === "all") return RESOURCES;
    const matcher = {
      money: /app kit|unified|gas|contract|faucet/i,
      builders: /docs|contract|evm|account|mcp|skills/i,
      agents: /agent|erc-8004|erc-8183|mcp|skills/i,
      operators: /node|arcscan|finality|gas/i,
      security: /privacy|security|contract|account|finality/i
    }[filter];
    return matcher ? RESOURCES.filter(([title]) => matcher.test(title)) : RESOURCES;
  }, [filter]);

  async function copyValue(label, value) {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1300);
    } catch {}
  }

  function runJourneyAction(type, value) {
    if (type === "wallet") openWalletView(value);
    else openExternal(value);
  }

  return (
    <section className="arc-community-page arc-community-upgraded">
      <div className="arc-community-hero">
        <div>
          <div className="arc-community-title-row">
            <p className="section-kicker">Arc Community + Builder Hub</p>
            <span className="arc-status-chip arc-status-chip-live">LIVE TESTNET</span>
          </div>
          <h2>Use Arc. Understand Arc. Build on Arc.</h2>
          <p>One place for wallet actions, Unified Balance, live network health, official Arc resources, AI-agent primitives and node-operator updates.</p>
          <div className="arc-community-hero-actions">
            <button type="button" className="button button-primary" onClick={() => openWalletView("unified")}>Open Unified Balance</button>
            <button type="button" className="button button-secondary" onClick={() => openWalletView("bridge")}>Bridge USDC</button>
            <button type="button" className="button button-secondary" onClick={() => onAskCopilot?.("Explain the best Arc features I can use from this wallet today, then separate them from Arc capabilities that are documentation or future integration paths.")}>Ask Arc AI</button>
          </div>
        </div>
        <aside className="arc-wallet-ready-card">
          <span>Connected wallet</span>
          <strong>{shortAddress(walletSnapshot?.address)}</strong>
          <small>{walletSnapshot?.onArc ? "Arc Testnet ready" : "Connected on another network"}</small>
          <div><i className={walletSnapshot?.onArc ? "is-live" : ""} /> Chain {arcTestnet.id}</div>
          <button type="button" onClick={() => openExternal(`${ARC_TESTNET_NETWORK_CONFIG.explorerUrl}/address/${walletSnapshot?.address || ""}`)} disabled={!walletSnapshot?.address}>View on ArcScan ↗</button>
        </aside>
      </div>

      <div className="arc-live-strip">
        <div><span>Network</span><strong>{network.status === "ready" ? "Online" : network.status === "loading" ? "Checking…" : "Degraded"}</strong><small>Official testnet RPC</small></div>
        <div><span>Latest block</span><strong>{network.blockNumber ? new Intl.NumberFormat("en-US").format(network.blockNumber) : "—"}</strong><small>Refreshes every 30s</small></div>
        <div><span>RPC latency</span><strong>{network.latencyMs ? `${network.latencyMs} ms` : "—"}</strong><small>Server health probe</small></div>
        <div><span>Finality</span><strong>&lt; 1 second</strong><small>Deterministic</small></div>
        <div><span>Gas</span><strong>USDC</strong><small>Arc-native gas asset</small></div>
      </div>

      <section className="arc-quick-actions" aria-label="Arc wallet actions">
        <div className="arc-hub-heading"><div><span>Use now</span><h3>Community shortcuts</h3></div><small>Money-moving actions still require your wallet signature.</small></div>
        <div className="arc-quick-action-grid">
          {[
            ["Send", "Send USDC on Arc", "send", "live"],
            ["Swap", "Swap supported Arc assets", "swap", "live"],
            ["Bridge", "Move USDC across supported testnets", "bridge", "live"],
            ["Unified", "Inspect crosschain USDC", "unified", "live"],
            ["Request", "Create a payment QR", "request", "live"],
            ["Activity", "Inspect wallet history", "activity", "live"]
          ].map(([title, text, view]) => (
            <button key={title} type="button" onClick={() => openWalletView(view)}>
              <span className="arc-quick-icon">{title.slice(0, 1)}</span><strong>{title}</strong><small>{text}</small><em>Open →</em>
            </button>
          ))}
        </div>
      </section>

      <div className="arc-usdc-model">
        <div className="arc-usdc-model-icon">$</div>
        <div><strong>One USDC pool, two interfaces.</strong><p>Arc's native gas view and USDC ERC-20 view represent the same funds. This wallet should never add them together or present them as separate Arc assets.</p></div>
        <button type="button" onClick={() => openExternal("https://docs.arc.io/arc/references/gas-and-fees")}>Learn ↗</button>
      </div>

      <section className="arc-hub-section arc-capability-section">
        <div className="arc-hub-heading"><div><span>What is actually available</span><h3>Live wallet vs Arc ecosystem</h3></div><small>No fake “coming soon” claims — capabilities are labeled clearly.</small></div>
        <div className="arc-capability-grid">
          {CAPABILITIES.map(([title, status, tone, text]) => (
            <article key={title} className="arc-capability-card">
              <div><strong>{title}</strong><span className={`arc-status-chip ${tone === "live" ? "arc-status-chip-live" : "arc-status-chip-docs"}`}>{status}</span></div>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="arc-hub-section arc-journeys-section">
        <div className="arc-hub-heading"><div><span>Choose your path</span><h3>Arc starter journeys</h3></div><small>Useful for users, builders, agents and operators.</small></div>
        <div className="arc-journey-grid">
          {JOURNEYS.map((journey) => (
            <article key={journey.id} className="arc-journey-card">
              <span>{journey.eyebrow}</span>
              <h4>{journey.title}</h4>
              <p>{journey.text}</p>
              <div>{journey.actions.map(([label, type, value]) => <button key={label} type="button" onClick={() => runJourneyAction(type, value)}>{label} {type === "external" ? "↗" : "→"}</button>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="arc-node-release arc-node-release-urgent">
        <div>
          <div className="arc-node-title-line"><span>ARC NODE · v0.8.0</span><b>OPERATOR NOTICE</b></div>
          <h3>Zero8 readiness for Arc Testnet</h3>
          <p>Arc Node v0.8.0 was released August 28, 2026. Operators should review the Zero8-compatible release and activation requirements before the September 3, 2026 testnet activation window.</p>
          <div className="arc-node-points"><span>reth 2.2 / revm 38</span><span>relay failover</span><span>safer admin RPC defaults</span><span>DB migration tooling</span><span>new metrics & forensics</span></div>
        </div>
        <div className="arc-node-actions"><button type="button" className="button button-primary" onClick={() => openExternal("https://github.com/circlefin/arc-node/releases/tag/v0.8.0")}>v0.8.0 release ↗</button><button type="button" className="button button-secondary" onClick={() => openExternal("https://docs.arc.io/arc/tutorials/run-an-arc-node")}>Node guide ↗</button></div>
      </section>

      <section className="arc-hub-section">
        <div className="arc-hub-heading"><div><span>Developer console</span><h3>Copy the essentials</h3></div><small>Always verify official contract addresses before deployment.</small></div>
        <div className="arc-copy-grid">
          <button type="button" onClick={() => copyValue("chain", arcTestnet.id)}><span>Chain ID</span><strong>{arcTestnet.id}</strong><em>{copied === "chain" ? "Copied" : "Copy"}</em></button>
          <button type="button" onClick={() => copyValue("rpc", ARC_TESTNET_NETWORK_CONFIG.rpcUrl)}><span>RPC</span><strong>{ARC_TESTNET_NETWORK_CONFIG.rpcUrl}</strong><em>{copied === "rpc" ? "Copied" : "Copy"}</em></button>
          <button type="button" onClick={() => copyValue("explorer", ARC_TESTNET_NETWORK_CONFIG.explorerUrl)}><span>Explorer</span><strong>{ARC_TESTNET_NETWORK_CONFIG.explorerUrl}</strong><em>{copied === "explorer" ? "Copied" : "Copy"}</em></button>
        </div>
      </section>

      <section className="arc-hub-section">
        <div className="arc-hub-heading arc-resource-heading"><div><span>Official resources</span><h3>Learn, inspect and build</h3></div><div className="arc-resource-filters">{[["all","All"],["money","Money"],["builders","Builders"],["agents","Agents"],["operators","Nodes"],["security","Security"]].map(([id,label]) => <button key={id} type="button" className={filter === id ? "is-active" : ""} onClick={() => setFilter(id)}>{label}</button>)}</div></div>
        <div className="arc-resource-grid">
          {visibleResources.map((item) => <ResourceCard key={item[0]} item={item} />)}
        </div>
      </section>

      <section className="arc-community-footer-callout">
        <div><span>ARC AI WALLET</span><h3>From wallet utility to Arc community gateway.</h3><p>Use Arc money workflows today, learn official network capabilities, and move into builder, agent or node-operator paths without mixing live features with documentation-only capabilities.</p></div>
        <button type="button" className="button button-primary" onClick={() => onAskCopilot?.("Give me a personalized Arc learning path based on this wallet. Start with what I can use today, then suggest builder, agent, privacy or node topics if relevant.")}>Build my Arc path with AI</button>
      </section>
    </section>
  );
}
