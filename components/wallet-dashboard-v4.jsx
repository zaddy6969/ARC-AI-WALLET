import { memo, useEffect, useMemo, useState } from "react";
import { FeatureIcon } from "./wallet-sidebar";

function formatUsd(value) {
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0))}`;
}

function shortAddress(value) {
  if (!value) return "—";
  return `${value.slice(0, 7)}…${value.slice(-5)}`;
}

function readyAssets(walletSnapshot) {
  return Array.isArray(walletSnapshot?.assets)
    ? walletSnapshot.assets.filter((asset) => asset?.status === "ready")
    : [];
}

function semanticCategory(item) {
  const kind = String(item?.kind || "").toLowerCase();
  const type = String(item?.type || "").toLowerCase();
  const operation = String(item?.metadata?.operation || "").toLowerCase();
  if (kind === "swap" || type.includes("swap") || operation === "swap") return "swap";
  if (kind === "bridge" || kind === "bridge_received" || type.includes("bridge") || operation === "bridge") return "bridge";
  if (kind === "received" || type.includes("received")) return "receive";
  return "send";
}

function activityLabel(item) {
  const category = semanticCategory(item);
  if (category === "swap") return "Swap";
  if (category === "bridge") return "Bridge";
  if (category === "receive") return "Received";
  return "Sent";
}

function AssetMark({ symbol }) {
  const mark = symbol === "USDC" ? "$" : symbol === "EURC" ? "€" : symbol === "cirBTC" ? "₿" : symbol === "ETH" ? "Ξ" : String(symbol || "?").slice(0, 1);
  return <span className={`wallet-v4-token-mark is-${String(symbol || "token").toLowerCase()}`}>{mark}</span>;
}

const WalletDashboardV4 = memo(function WalletDashboardV4({
  walletSnapshot,
  activityItems = [],
  onSelectView,
  onReceive
}) {
  const assets = readyAssets(walletSnapshot);
  const portfolioValue = useMemo(() => assets.reduce((sum, asset) => sum + (Number(asset?.valueUsd) || 0), 0), [assets]);
  const recent = activityItems.slice(0, 6);
  const [networkStatus, setNetworkStatus] = useState(null);

  useEffect(() => {
    if (!walletSnapshot?.onArc) {
      setNetworkStatus(null);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/arc-status", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && response.ok) setNetworkStatus(payload);
      } catch {
        if (!cancelled) setNetworkStatus(null);
      }
    };
    void load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [walletSnapshot?.onArc]);

  const actions = [
    { id: "send", label: "Send", helper: "Transfer assets", icon: "send", click: () => onSelectView?.("send") },
    { id: "receive", label: "Receive", helper: "Wallet address", icon: "receive", click: onReceive },
    { id: "swap", label: "Swap", helper: "Get live quote", icon: "swap", click: () => onSelectView?.("swap") },
    { id: "bridge", label: "Bridge", helper: "Move cross-chain", icon: "bridge", click: () => onSelectView?.("bridge") }
  ];

  const healthLabel = walletSnapshot?.supportedNetwork
    ? walletSnapshot?.balanceStatus === "error"
      ? "Needs attention"
      : "Connected"
    : "Unsupported";

  return (
    <section className="wallet-v4-dashboard">
      <header className="wallet-v4-dashboard-head">
        <div>
          <span className="wallet-v4-kicker">Wallet overview</span>
          <h1>Portfolio</h1>
          <p>{shortAddress(walletSnapshot?.address)} · {walletSnapshot?.activeChainName || "Unsupported network"}</p>
        </div>
        <div className={`wallet-v4-health ${walletSnapshot?.supportedNetwork ? "is-online" : "is-error"}`}><i /><span><strong>{healthLabel}</strong><small>Chain ID {walletSnapshot?.chainId || "—"}</small></span></div>
      </header>

      {!walletSnapshot?.supportedNetwork ? (
        <div className="wallet-v4-alert is-error"><strong>Unsupported network</strong><span>Switch to Arc, Ethereum Sepolia, or Base Sepolia from the network control above.</span></div>
      ) : null}

      <section className="wallet-v4-balance-hero">
        <div className="wallet-v4-balance-copy">
          <span>Total portfolio value</span>
          <strong>{formatUsd(portfolioValue)}</strong>
          <div className="wallet-v4-balance-foot">
            <span>{assets.length} {assets.length === 1 ? "asset" : "assets"}</span>
            <i />
            <span>{walletSnapshot?.balanceStatus === "loading" || walletSnapshot?.balanceStatus === "refreshing" ? "Syncing balances" : "Live wallet data"}</span>
          </div>
        </div>
        <div className="wallet-v4-network-card">
          <div className="wallet-v4-network-mark">{walletSnapshot?.activeChainName?.slice(0, 1) || "?"}</div>
          <div><span>Active network</span><strong>{walletSnapshot?.activeChainName || "Unsupported"}</strong><small>{walletSnapshot?.nativeSymbol ? `Gas: ${walletSnapshot.nativeSymbol}` : "No network data"}</small></div>
          <div className="wallet-v4-network-metrics">
            {walletSnapshot?.onArc ? <span><small>Block</small><strong>{networkStatus?.blockNumber ? Number(networkStatus.blockNumber).toLocaleString() : "Live"}</strong></span> : null}
            {walletSnapshot?.onArc ? <span><small>RPC</small><strong>{networkStatus?.latencyMs ? `${networkStatus.latencyMs} ms` : "Ready"}</strong></span> : null}
          </div>
        </div>
      </section>

      <div className="wallet-v4-action-grid">
        {actions.map((action) => (
          <button key={action.id} type="button" className="wallet-v4-action" onClick={action.click}>
            <span className="wallet-v4-action-icon"><FeatureIcon name={action.icon} /></span>
            <span><strong>{action.label}</strong><small>{action.helper}</small></span>
            <b>↗</b>
          </button>
        ))}
      </div>

      <div className="wallet-v4-content-grid">
        <article className="wallet-v4-panel wallet-v4-assets-panel">
          <header><div><span>Assets</span><h2>Your balances</h2></div><button type="button" onClick={() => onSelectView?.("portfolio")}>View all</button></header>
          <div className="wallet-v4-assets-table">
            <div className="wallet-v4-assets-head"><span>Asset</span><span>Balance</span><span>Value</span></div>
            {assets.length ? assets.map((asset) => (
              <button type="button" className="wallet-v4-asset-row" key={`${walletSnapshot?.chainId}-${asset.symbol}`} onClick={() => onSelectView?.("portfolio")}>
                <span className="wallet-v4-asset-name"><AssetMark symbol={asset.symbol} /><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span></span>
                <span><strong>{asset.balance || "0"}</strong><small>{walletSnapshot?.activeChainName}</small></span>
                <span><strong>{asset.priceUsd ? formatUsd(asset.valueUsd) : "—"}</strong><small>{asset.native ? "Gas asset" : asset.priceUsd ? "Estimated value" : "Balance only"}</small></span>
              </button>
            )) : <div className="wallet-v4-empty"><strong>{walletSnapshot?.balanceStatus === "loading" ? "Syncing balances…" : "No assets found on this network."}</strong></div>}
          </div>
        </article>

        <article className="wallet-v4-panel wallet-v4-activity-panel">
          <header><div><span>Activity</span><h2>Recent transactions</h2></div><button type="button" onClick={() => onSelectView?.("activity")}>View all</button></header>
          <div className="wallet-v4-recent-list">
            {recent.length ? recent.map((item) => {
              const category = semanticCategory(item);
              return (
                <button type="button" key={item.id} onClick={() => onSelectView?.("activity")}>
                  <span className={`wallet-v4-mini-icon is-${category}`}><FeatureIcon name={category === "receive" ? "receive" : category} /></span>
                  <span><strong>{activityLabel(item)}</strong><small>{item.summary || item.chain || "Wallet activity"}</small></span>
                  <span><strong>{item.amount || "Tracked"}</strong><small>{item.status || item.timeLabel || "Confirmed"}</small></span>
                </button>
              );
            }) : <div className="wallet-v4-empty"><strong>No recent activity yet.</strong><span>Submitted wallet transactions will appear here.</span></div>}
          </div>
        </article>
      </div>
    </section>
  );
});

export default WalletDashboardV4;
