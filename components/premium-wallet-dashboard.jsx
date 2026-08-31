import Image from "next/image";
import { memo, useMemo } from "react";
import { ARC_NETWORK_MODE, arcTestnet } from "../lib/arc-chain";
import { FeatureIcon } from "./wallet-sidebar";

function parseNumber(value) {
  const numeric = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatUsd(value) {
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0))}`;
}

function formatAmount(value, digits = 4) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits
  }).format(Number(value || 0));
}

function shorten(value, start = 6, end = 4) {
  if (!value) return "—";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function getReadyAssets(walletSnapshot) {
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
  return assets.filter((asset) => asset?.status === "ready");
}

function getPortfolioValue(walletSnapshot) {
  const assets = getReadyAssets(walletSnapshot);
  const total = assets.reduce((sum, asset) => sum + (Number(asset?.valueUsd) || 0), 0);
  return total || parseNumber(walletSnapshot?.usdcBalance);
}

function buildAllocation(assets, total) {
  const palette = ["#4f5dff", "#28b7ff", "#8b5cf6", "#18c7a3"];
  let cursor = 0;
  const rows = assets.map((asset, index) => {
    const value = Number(asset?.valueUsd || 0);
    const percent = total > 0 ? Math.max(0, (value / total) * 100) : 0;
    const start = cursor;
    cursor += percent;
    return {
      asset,
      value,
      percent,
      start,
      end: cursor,
      color: palette[index % palette.length]
    };
  });

  const gradient = rows.length && total > 0
    ? `conic-gradient(${rows.map((row) => `${row.color} ${row.start}% ${row.end}%`).join(", ")})`
    : "conic-gradient(#e8ecf5 0 100%)";

  return { rows, gradient };
}

function ActionTile({ icon, label, helper, onClick }) {
  return (
    <button type="button" className="premium-action-tile" onClick={onClick}>
      <span className="premium-action-icon"><FeatureIcon name={icon} /></span>
      <span className="premium-action-copy"><strong>{label}</strong><small>{helper}</small></span>
      <span className="premium-action-arrow">→</span>
    </button>
  );
}

function AssetLogo({ symbol }) {
  return <span className={`premium-token premium-token-${String(symbol || "").toLowerCase()}`}>{String(symbol || "?").slice(0, 1)}</span>;
}

function ActivityIcon({ kind }) {
  const icon = kind === "sent" ? "↑" : kind === "received" ? "↓" : kind === "swap" ? "⇄" : "↗";
  return <span className={`premium-activity-icon premium-activity-${kind || "other"}`}>{icon}</span>;
}

const PremiumWalletDashboard = memo(function PremiumWalletDashboard({
  walletSnapshot,
  activityItems = [],
  onSelectView,
  onReceive,
  onAskCopilot
}) {
  const assets = getReadyAssets(walletSnapshot).slice(0, 4);
  const totalValue = getPortfolioValue(walletSnapshot);
  const usdc = assets.find((asset) => asset.symbol === "USDC");
  const allocation = useMemo(() => buildAllocation(assets, totalValue), [assets, totalValue]);
  const recent = activityItems.slice(0, 5);
  const connectedNetwork = walletSnapshot?.onArc ? arcTestnet.name : "Other network";
  const networkMode = ARC_NETWORK_MODE === "mainnet" ? "Mainnet" : "Testnet";

  const actions = [
    { id: "send", label: "Send", helper: "Transfer USDC", icon: "send", click: () => onSelectView?.("send") },
    { id: "receive", label: "Receive", helper: "Your wallet address", icon: "receive", click: onReceive },
    { id: "swap", label: "Swap", helper: "Trade Arc assets", icon: "swap", click: () => onSelectView?.("swap") },
    { id: "bridge", label: "Bridge", helper: "Move USDC across chains", icon: "bridge", click: () => onSelectView?.("bridge") }
  ];

  return (
    <section className="premium-wallet-dashboard">
      <section className="premium-balance-hero">
        <div className="premium-balance-content">
          <div className="premium-hero-topline">
            <span>Total portfolio value</span>
            <span className="premium-network-chip"><i /> {connectedNetwork}</span>
          </div>
          <strong className="premium-balance-value">{formatUsd(totalValue)}</strong>
          <div className="premium-balance-meta">
            <span>{usdc?.balance || walletSnapshot?.usdcBalance || "Balance syncing…"}</span>
            <span>{assets.length} {assets.length === 1 ? "asset" : "assets"}</span>
            <span>Gas in USDC</span>
          </div>
        </div>

        <div className="premium-hero-stats">
          <div><span>Network</span><strong>{networkMode}</strong><small>Chain {arcTestnet.id}</small></div>
          <div><span>Activity</span><strong>{activityItems.length}</strong><small>Tracked moves</small></div>
        </div>

        <div className="premium-hero-art" aria-hidden="true">
          <div className="premium-orbit premium-orbit-one" />
          <div className="premium-orbit premium-orbit-two" />
          <Image src="/arc-ai-wallet-mark-v2.png" alt="" width={190} height={190} priority />
        </div>
      </section>

      <div className="premium-action-grid">
        {actions.map((action) => (
          <ActionTile key={action.id} icon={action.icon} label={action.label} helper={action.helper} onClick={action.click} />
        ))}
      </div>

      <div className="premium-primary-grid">
        <article className="premium-panel premium-assets-panel">
          <div className="premium-panel-head">
            <div><span>Portfolio</span><h2>Your assets</h2></div>
            <button type="button" onClick={() => onSelectView?.("portfolio")}>View all</button>
          </div>
          <div className="premium-asset-table">
            <div className="premium-asset-header"><span>Asset</span><span>Balance</span><span>Value</span></div>
            {assets.length ? assets.map((asset) => (
              <button type="button" className="premium-asset-row" key={asset.symbol} onClick={() => onSelectView?.("portfolio")}>
                <span className="premium-asset-name"><AssetLogo symbol={asset.symbol} /><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span></span>
                <span><strong>{asset.balance || `${formatAmount(asset.balanceValue, 6)} ${asset.symbol}`}</strong><small>{asset.symbol}</small></span>
                <span><strong>{formatUsd(asset.valueUsd)}</strong><small>USD value</small></span>
              </button>
            )) : (
              <div className="premium-empty">Balances are syncing from Arc.</div>
            )}
          </div>
        </article>

        <article className="premium-panel premium-allocation-panel">
          <div className="premium-panel-head"><div><span>Portfolio</span><h2>Allocation</h2></div></div>
          <div className="premium-allocation-body">
            <div className="premium-donut" style={{ background: allocation.gradient }}>
              <div><strong>{formatUsd(totalValue)}</strong><span>Total</span></div>
            </div>
            <div className="premium-allocation-list">
              {allocation.rows.length ? allocation.rows.map((row) => (
                <div key={row.asset.symbol}>
                  <i style={{ background: row.color }} />
                  <span><strong>{row.asset.symbol}</strong><small>{row.percent.toFixed(1)}%</small></span>
                  <strong>{formatUsd(row.value)}</strong>
                </div>
              )) : <span className="premium-empty">No allocation yet.</span>}
            </div>
          </div>
        </article>

        <article className="premium-panel premium-ai-panel">
          <div className="premium-panel-head premium-ai-head">
            <div><span>Assistant</span><h2>Arc AI</h2></div>
            <span className="premium-online"><i /> Ready</span>
          </div>
          <p>Ask about your wallet, transactions, Arc, or prepare an action for review.</p>
          <div className="premium-ai-chips">
            <button type="button" onClick={() => onAskCopilot?.("Analyze my wallet")}>Portfolio summary</button>
            <button type="button" onClick={() => onAskCopilot?.("Explain my latest transaction")}>Latest activity</button>
            <button type="button" onClick={() => onAskCopilot?.("What can I do with Arc today?")}>Explore Arc</button>
          </div>
          <button type="button" className="premium-ai-cta" onClick={() => onSelectView?.("agent")}>
            <span>Ask anything…</span><strong>↑</strong>
          </button>
        </article>
      </div>

      <div className="premium-secondary-grid">
        <article className="premium-panel premium-activity-panel">
          <div className="premium-panel-head">
            <div><span>Wallet</span><h2>Recent activity</h2></div>
            <button type="button" onClick={() => onSelectView?.("activity")}>View all</button>
          </div>
          <div className="premium-activity-list">
            {recent.length ? recent.map((item) => (
              <button type="button" key={item.id || item.txHash} onClick={() => onAskCopilot?.(`Explain transaction ${item.txHash || item.txHashShort || "latest"}`)}>
                <ActivityIcon kind={item.kind} />
                <span><strong>{item.type || "Transaction"}</strong><small>{item.timeLabel || "Recently"}</small></span>
                <span className="premium-activity-amount"><strong>{item.amount || "Tracked"}</strong><small>{item.txHashShort || shorten(item.txHash || "")}</small></span>
              </button>
            )) : <div className="premium-empty">Your recent Arc activity will appear here.</div>}
          </div>
        </article>

        <article className="premium-panel premium-network-panel">
          <div className="premium-panel-head"><div><span>Network</span><h2>{arcTestnet.name}</h2></div><span className="premium-healthy"><i /> Connected</span></div>
          <div className="premium-network-grid">
            <div><span>Chain ID</span><strong>{arcTestnet.id}</strong></div>
            <div><span>Gas asset</span><strong>USDC</strong></div>
            <div><span>Wallet</span><strong>{shorten(walletSnapshot?.address)}</strong></div>
            <div><span>Status</span><strong>{walletSnapshot?.onArc ? "Ready" : "Switch needed"}</strong></div>
          </div>
          <button type="button" className="premium-network-action" onClick={() => onSelectView?.("community")}>Explore Arc network <span>↗</span></button>
        </article>
      </div>
    </section>
  );
});

export default PremiumWalletDashboard;
