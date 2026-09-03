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

function assetValue(asset) {
  return Number(asset?.valueUsd || 0);
}

function category(item) {
  const kind = String(item?.kind || "").toLowerCase();
  const type = String(item?.type || "").toLowerCase();
  if (kind === "swap" || type.includes("swap")) return "swap";
  if (kind === "bridge" || kind === "bridge_received" || type.includes("bridge")) return "bridge";
  if (kind === "received" || type.includes("received")) return "receive";
  return "send";
}

function activityLabel(item) {
  const c = category(item);
  if (c === "swap") return "Swap";
  if (c === "bridge") return "Bridge";
  if (c === "receive") return "Received";
  return "Sent";
}

function AssetMark({ symbol }) {
  const mark = symbol === "USDC" ? "$" : symbol === "EURC" ? "€" : symbol === "cirBTC" ? "₿" : symbol === "ETH" ? "Ξ" : String(symbol || "?").slice(0, 1);
  return <span className={`wallet-v3-token-mark is-${String(symbol || "token").toLowerCase()}`}>{mark}</span>;
}

const PremiumWalletDashboard = memo(function PremiumWalletDashboard({
  walletSnapshot,
  activityItems = [],
  onSelectView,
  onReceive
}) {
  const assets = readyAssets(walletSnapshot);
  const portfolioValue = useMemo(() => assets.reduce((sum, asset) => sum + assetValue(asset), 0), [assets]);
  const recent = activityItems.slice(0, 5);
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
    { id: "receive", label: "Receive", helper: "Show address", icon: "receive", click: onReceive },
    { id: "swap", label: "Swap", helper: "Live quote", icon: "swap", click: () => onSelectView?.("swap") },
    { id: "bridge", label: "Bridge", helper: "Move cross-chain", icon: "bridge", click: () => onSelectView?.("bridge") }
  ];

  return (
    <section className="wallet-v3-dashboard">
      <div className="wallet-v3-dashboard-heading">
        <div>
          <span className="wallet-v3-eyebrow">Portfolio</span>
          <h1>Your wallet</h1>
        </div>
        <div className="wallet-v3-current-network"><i /> <span><strong>{walletSnapshot?.activeChainName || "Unsupported network"}</strong><small>Chain ID {walletSnapshot?.chainId || "—"}</small></span></div>
      </div>

      {!walletSnapshot?.supportedNetwork ? (
        <div className="wallet-v3-inline-warning is-error"><strong>Unsupported network</strong><span>Choose Arc, Ethereum Sepolia, or Base Sepolia from the network selector.</span></div>
      ) : null}

      <section className="wallet-v3-balance-card">
        <div className="wallet-v3-balance-main">
          <span>Total portfolio value</span>
          <strong>{formatUsd(portfolioValue)}</strong>
          <div className="wallet-v3-balance-meta">
            <span>{shortAddress(walletSnapshot?.address)}</span>
            <i />
            <span>{walletSnapshot?.balanceStatus === "loading" || walletSnapshot?.balanceStatus === "refreshing" ? "Syncing balances…" : `${assets.length} ${assets.length === 1 ? "asset" : "assets"}`}</span>
          </div>
        </div>
        <div className="wallet-v3-balance-network">
          <span className="wallet-v3-network-logo">{walletSnapshot?.activeChainName?.slice(0, 1) || "?"}</span>
          <div><span>Active network</span><strong>{walletSnapshot?.activeChainName || "Unsupported"}</strong><small>{walletSnapshot?.nativeSymbol ? `Gas: ${walletSnapshot.nativeSymbol}` : "Network not supported"}</small></div>
        </div>
      </section>

      <div className="wallet-v3-action-grid">
        {actions.map((action) => (
          <button key={action.id} type="button" className="wallet-v3-action" onClick={action.click}>
            <span className="wallet-v3-action-icon"><FeatureIcon name={action.icon} /></span>
            <span><strong>{action.label}</strong><small>{action.helper}</small></span>
            <b>→</b>
          </button>
        ))}
      </div>

      <div className="wallet-v3-dashboard-grid">
        <article className="wallet-v3-panel wallet-v3-assets-panel">
          <header><div><span>Assets</span><h2>Balances</h2></div><button type="button" onClick={() => onSelectView?.("portfolio")}>View all</button></header>
          <div className="wallet-v3-assets-table">
            <div className="wallet-v3-assets-head"><span>Asset</span><span>Balance</span><span>Value</span></div>
            {assets.length ? assets.map((asset) => (
              <button type="button" className="wallet-v3-asset-row" key={`${walletSnapshot?.chainId}-${asset.symbol}`} onClick={() => onSelectView?.("portfolio")}>
                <span className="wallet-v3-asset-name"><AssetMark symbol={asset.symbol} /><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span></span>
                <span><strong>{asset.balance || "0"}</strong><small>{walletSnapshot?.activeChainName}</small></span>
                <span><strong>{asset.priceUsd ? formatUsd(asset.valueUsd) : "—"}</strong><small>{asset.native ? "Gas asset" : asset.priceUsd ? "Estimated value" : "Balance only"}</small></span>
              </button>
            )) : (
              <div className="wallet-v3-empty"><strong>{walletSnapshot?.balanceStatus === "loading" ? "Syncing balances…" : "No assets found on this network."}</strong></div>
            )}
          </div>
        </article>

        <article className="wallet-v3-panel wallet-v3-network-panel">
          <header><div><span>Network</span><h2>Connection</h2></div><span className="wallet-v3-health"><i />{walletSnapshot?.supportedNetwork ? "Connected" : "Unsupported"}</span></header>
          <div className="wallet-v3-network-summary">
            <span className="wallet-v3-network-logo is-large">{walletSnapshot?.activeChainName?.slice(0, 1) || "?"}</span>
            <div><strong>{walletSnapshot?.activeChainName || "Unsupported network"}</strong><span>Chain ID {walletSnapshot?.chainId || "—"}</span></div>
          </div>
          <div className="wallet-v3-network-stats">
            <div><span>Gas token</span><strong>{walletSnapshot?.nativeSymbol || "—"}</strong></div>
            <div><span>Wallet state</span><strong>{walletSnapshot?.balanceStatus === "error" ? "Needs attention" : "Synced"}</strong></div>
            {walletSnapshot?.onArc ? <div><span>Latest block</span><strong>{networkStatus?.blockNumber ? Number(networkStatus.blockNumber).toLocaleString() : "Live"}</strong></div> : null}
            {walletSnapshot?.onArc ? <div><span>RPC latency</span><strong>{networkStatus?.latencyMs ? `${networkStatus.latencyMs} ms` : "Checking"}</strong></div> : null}
          </div>
          {walletSnapshot?.activeExplorerUrl ? <a className="wallet-v3-panel-link" href={walletSnapshot.activeExplorerUrl} target="_blank" rel="noreferrer">Open explorer <span>↗</span></a> : null}
        </article>

        <article className="wallet-v3-panel wallet-v3-activity-panel">
          <header><div><span>History</span><h2>Recent activity</h2></div><button type="button" onClick={() => onSelectView?.("activity")}>View all</button></header>
          <div className="wallet-v3-dashboard-activity">
            {recent.length ? recent.map((item) => {
              const icon = category(item);
              return (
                <button type="button" key={item.id} onClick={() => onSelectView?.("activity")}>
                  <span className={`wallet-v3-mini-activity-icon is-${icon}`}><FeatureIcon name={icon === "receive" ? "receive" : icon} /></span>
                  <span><strong>{activityLabel(item)}</strong><small>{item.summary || item.chain || "Wallet activity"}</small></span>
                  <span><strong>{item.amount || "Tracked"}</strong><small>{item.status || item.timeLabel || "Confirmed"}</small></span>
                </button>
              );
            }) : <div className="wallet-v3-empty"><strong>No recent activity yet.</strong><span>Transactions will appear here after they are submitted.</span></div>}
          </div>
        </article>

        <article className="wallet-v3-panel wallet-v3-assistant-card">
          <div className="wallet-v3-assistant-icon">✦</div>
          <span>Lumexa Assistant</span>
          <h2>One place for wallet intelligence.</h2>
          <p>Understand activity, check network status, or prepare a send, swap, bridge, or network switch.</p>
          <button type="button" className="wallet-v3-primary-button" onClick={() => onSelectView?.("agent")}>Ask Lumexa <span>→</span></button>
        </article>
      </div>
    </section>
  );
});

export default PremiumWalletDashboard;
