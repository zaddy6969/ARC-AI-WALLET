import { useEffect, useState } from "react";
import { ARC_TESTNET_NETWORK_CONFIG, arcTestnet } from "../lib/arc-chain";

const RESOURCES = [
  ["Arc Docs", "Official network and developer documentation", "https://docs.arc.io/"],
  ["ArcScan", "Inspect blocks, transactions and contracts", ARC_TESTNET_NETWORK_CONFIG.explorerUrl],
  ["Circle Faucet", "Get testnet tokens", "https://faucet.circle.com"],
  ["Contract Addresses", "Verify official Arc contract addresses", "https://docs.arc.io/arc/references/contract-addresses"],
  ["EVM Differences", "Review Arc-specific EVM behavior", "https://docs.arc.io/arc/references/evm-differences"],
  ["Gas and Fees", "Understand USDC gas and stable fee design", "https://docs.arc.io/arc/references/gas-and-fees"],
  ["Deterministic Finality", "Learn how Arc reaches sub-second finality", "https://docs.arc.io/arc/concepts/deterministic-finality"],
  ["Opt-in Privacy", "Read about Arc privacy architecture", "https://docs.arc.io/arc/concepts/opt-in-privacy"],
  ["Account Abstraction", "Explore smart accounts and paymaster providers", "https://docs.arc.io/arc/tools/account-abstraction"],
  ["Agentic Economy", "Onchain identity and jobs for AI agents", "https://docs.arc.io/build/agentic-economy"],
  ["ERC-8004 Agents", "Register onchain AI-agent identity and reputation", "https://docs.arc.io/arc/tutorials/register-your-first-ai-agent"],
  ["ERC-8183 Jobs", "Learn escrow and settlement for agent work", "https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job"],
  ["Run an Arc Node", "Node setup and operator documentation", "https://docs.arc.io/arc/tutorials/run-an-arc-node"],
  ["Arc Node v0.8.0", "Latest Arc node release notes", "https://github.com/circlefin/arc-node/releases/tag/v0.8.0"],
  ["Circle Skills", "Official AI build skills for Arc and Circle products", "https://github.com/circlefin/skills"]
];

function openExternal(url) {
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

function shortAddress(value) {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function ArcCommunityHubPanel({ walletSnapshot, onAskCopilot }) {
  const [network, setNetwork] = useState({ status: "loading" });
  const [copied, setCopied] = useState("");

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

  async function copyValue(label, value) {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1300);
    } catch {}
  }

  return (
    <section className="arc-community-page">
      <div className="arc-community-hero">
        <div>
          <p className="section-kicker">Arc Community + Builder Hub</p>
          <h2>Use Arc. Understand Arc. Build on Arc.</h2>
          <p>A read-only community center for live network health, official developer resources, AI-agent primitives, and node-operator updates.</p>
          <div className="arc-community-hero-actions">
            <button type="button" className="button button-primary" onClick={() => openExternal("https://docs.arc.io/")}>Open Arc docs ↗</button>
            <button type="button" className="button button-secondary" onClick={() => onAskCopilot?.("Explain Arc's most useful features for community members and builders, including USDC gas, deterministic finality, App Kit, Unified Balance and AI agents.")}>Ask Arc AI</button>
          </div>
        </div>
        <aside className="arc-wallet-ready-card">
          <span>Connected wallet</span>
          <strong>{shortAddress(walletSnapshot?.address)}</strong>
          <small>{walletSnapshot?.onArc ? "Arc Testnet ready" : "Connected on another network"}</small>
          <div><i className={walletSnapshot?.onArc ? "is-live" : ""} /> Chain {arcTestnet.id}</div>
        </aside>
      </div>

      <div className="arc-live-strip">
        <div><span>Network</span><strong>{network.status === "ready" ? "Online" : network.status === "loading" ? "Checking…" : "Degraded"}</strong><small>Official testnet RPC</small></div>
        <div><span>Latest block</span><strong>{network.blockNumber ? new Intl.NumberFormat("en-US").format(network.blockNumber) : "—"}</strong><small>Refreshes every 30s</small></div>
        <div><span>RPC latency</span><strong>{network.latencyMs ? `${network.latencyMs} ms` : "—"}</strong><small>Server health probe</small></div>
        <div><span>Finality</span><strong>&lt; 1 second</strong><small>Deterministic</small></div>
        <div><span>Gas</span><strong>USDC</strong><small>Arc-native gas asset</small></div>
      </div>

      <div className="arc-usdc-model">
        <div className="arc-usdc-model-icon">$</div>
        <div><strong>One USDC pool, two interfaces.</strong><p>Arc's native gas view and USDC ERC-20 view represent the same funds. The wallet must never add them together or present them as separate assets.</p></div>
        <button type="button" onClick={() => openExternal("https://docs.arc.io/arc/references/gas-and-fees")}>Learn ↗</button>
      </div>

      <section className="arc-node-release">
        <div>
          <span>ARC NODE · v0.8.0</span>
          <h3>Zero8 readiness for testnet operators</h3>
          <p>Arc Node v0.8.0 was released August 28, 2026. Arc's changelog says testnet node operators need a Zero8-capable release before September 3, 2026 at 15:00 UTC.</p>
          <div className="arc-node-points"><span>reth 2.2 / revm 38</span><span>relay failover</span><span>safer admin RPC defaults</span><span>DB migration tooling</span><span>new metrics & forensics</span></div>
        </div>
        <button type="button" className="button button-secondary" onClick={() => openExternal("https://github.com/circlefin/arc-node/releases/tag/v0.8.0")}>Release notes ↗</button>
      </section>

      <section className="arc-hub-section">
        <div className="arc-hub-heading"><div><span>Developer console</span><h3>Copy the essentials</h3></div></div>
        <div className="arc-copy-grid">
          <button type="button" onClick={() => copyValue("chain", arcTestnet.id)}><span>Chain ID</span><strong>{arcTestnet.id}</strong><em>{copied === "chain" ? "Copied" : "Copy"}</em></button>
          <button type="button" onClick={() => copyValue("rpc", ARC_TESTNET_NETWORK_CONFIG.rpcUrl)}><span>RPC</span><strong>{ARC_TESTNET_NETWORK_CONFIG.rpcUrl}</strong><em>{copied === "rpc" ? "Copied" : "Copy"}</em></button>
          <button type="button" onClick={() => copyValue("explorer", ARC_TESTNET_NETWORK_CONFIG.explorerUrl)}><span>Explorer</span><strong>{ARC_TESTNET_NETWORK_CONFIG.explorerUrl}</strong><em>{copied === "explorer" ? "Copied" : "Copy"}</em></button>
        </div>
      </section>

      <section className="arc-hub-section">
        <div className="arc-hub-heading"><div><span>Official resources</span><h3>Learn, inspect and build</h3></div></div>
        <div className="arc-resource-grid">
          {RESOURCES.map(([title, description, url]) => (
            <button type="button" key={title} onClick={() => openExternal(url)}><strong>{title}</strong><span>{description}</span><em>↗</em></button>
          ))}
        </div>
      </section>
    </section>
  );
}
