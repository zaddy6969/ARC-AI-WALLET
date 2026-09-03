import Image from "next/image";
import { memo, useEffect, useMemo, useState } from "react";
import { arcTestnet } from "../lib/arc-chain";
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
  const palette = ["#4169f5", "#38bdf8", "#f59e0b", "#8b5cf6"];
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
    <button type="button" className="premium-action-tile premium-v2-action-tile" onClick={onClick}>
      <span className={`premium-action-icon premium-v2-action-${icon}`}><FeatureIcon name={icon} /></span>
      <span className="premium-action-copy"><strong>{label}</strong><small>{helper}</small></span>
      <span className="premium-action-arrow">→</span>
    </button>
  );
}

function AssetLogo({ symbol }) {
  const normalized = String(symbol || "").toLowerCase();
  const mark = symbol === "USDC" ? "$" : symbol === "EURC" ? "€" : symbol === "cirBTC" ? "₿" : String(symbol || "?").slice(0, 1);
  return <span className={`premium-token premium-token-${normalized}`}>{mark}</span>;
}

function ActivityIcon({ kind }) {
  const icon = kind === "sent" ? "↑" : kind === "received" || kind === "bridge_received" ? "↓" : kind === "swap" ? "⇄" : "↗";
  return <span className={`premium-activity-icon premium-activity-${kind || "other"}`}>{icon}</span>;
}

function activityAmountClass(item) {
  if (item?.kind === "received" || item?.kind === "bridge_received") return "is-positive";
  if (item?.kind === "sent") return "is-negative";
  return "";
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
  const [networkStatus, setNetworkStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/arc-status");
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
  }, []);

  const actions = [
    { id: "send", label: "Send", helper: "Transfer to any address", icon: "send", click: () => onSelectView?.("send") },
    { id: "receive", label: "Receive", helper: "Get funds to your wallet", icon: "receive", click: onReceive },
    { id: "swap", label: "Swap", helper: "Trade supported assets", icon: "swap", click: () => onSelectView?.("swap") },
    { id: "bridge", label: "Bridge", helper: "Move assets across chains", icon: "bridge", click: () => onSelectView?.("bridge") }
  ];

  return (
    <section className="premium-wallet-dashboard premium-v2-dashboard">
      <section className="premium-balance-hero premium-v2-hero">
        <div className="premium-balance-content premium-v2-hero-content">
          <span className="premium-v2-eyebrow">Total Portfolio Value</span>
          <strong className="premium-balance-value">{formatUsd(totalValue)}</strong>
          <div className="premium-v2-usdc-line">
            <strong>{usdc?.balance || walletSnapshot?.usdcBalance || "Balance syncing…"}</strong>
            <span>{usdc?.valueUsd ? formatUsd(usdc.valueUsd) : "USDC"}</span>
          </div>
        </div>

        <div className="premium-hero-stats premium-v2-hero-stats">
          <div>
            <span className="premium-v2-stat-icon">✓</span>
            <strong>Live</strong>
            <small>Portfolio synced</small>
          </div>
          <div>
            <span className="premium-v2-stat-icon">◔</span>
            <strong>{assets.length}</strong>
            <small>{assets.length === 1 ? "Asset" : "Assets"}</small>
          </div>
          <div>
            <span className="premium-v2-stat-icon">◎</span>
            <strong>{arcTestnet.name}</strong>
            <small>{walletSnapshot?.onArc ? "Active network" : "Switch required"}</small>
          </div>
        </div>

        <div className="premium-hero-art premium-v2-hero-art" aria-hidden="true">
          <div className="premium-orbit premium-orbit-one" />
          <div className="premium-orbit premium-orbit-two" />
          <Image src="/lumexa-ai-wallet-mark-v2.png" alt="" width={230} height={230} priority />
        </div>
      </section>

      <div className="premium-action-grid premium-v2-action-grid">
        {actions.map((action) => (
          <ActionTile key={action.id} icon={action.icon} label={action.label} helper={action.helper} onClick={action.click} />
        ))}
      </div>

      <div className="premium-primary-grid premium-v2-primary-grid">
        <article className="premium-panel premium-assets-panel premium-v2-panel premium-v2-assets-panel">
          <div className="premium-v2-table-head">
            <span>Asset</span><span>Balance</span><span>Value (USD)</span>
          </div>
          <div className="premium-asset-table premium-v2-asset-table">
            {assets.length ? assets.map((asset) => (
              <button type="button" className="premium-asset-row premium-v2-asset-row" key={asset.symbol} onClick={() => onSelectView?.("portfolio")}>
                <span className="premium-asset-name"><AssetLogo symbol={asset.symbol} /><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span></span>
                <span><strong>{asset.balance || `${formatAmount(asset.balanceValue, 6)} ${asset.symbol}`}</strong><small>{asset.symbol}</small></span>
                <span><strong>{formatUsd(asset.valueUsd)}</strong><small>{asset.symbol === "USDC" ? "Stablecoin" : "Wallet value"}</small></span>
              </button>
            )) : (
              <div className="premium-empty">Balances are syncing from Arc.</div>
            )}
          </div>
          <button type="button" className="premium-v2-footer-link" onClick={() => onSelectView?.("portfolio")}><span>◫</span> View all assets <b>→</b></button>
        </article>

        <article className="premium-panel premium-allocation-panel premium-v2-panel">
          <div className="premium-panel-head premium-v2-panel-head"><div><h2>Allocation</h2></div><span className="premium-v2-filter">By value⌄</span></div>
          <div className="premium-allocation-body premium-v2-allocation-body">
            <div className="premium-donut premium-v2-donut" style={{ background: allocation.gradient }}>
              <div><strong>{formatUsd(totalValue)}</strong><span>Total</span></div>
            </div>
            <div className="premium-allocation-list premium-v2-allocation-list">
              {allocation.rows.length ? allocation.rows.map((row) => (
                <div key={row.asset.symbol}>
                  <i style={{ background: row.color }} />
                  <span><strong>{row.asset.symbol}</strong><small>{row.percent.toFixed(1)}%</small></span>
                  <strong>{formatUsd(row.value)}</strong>
                </div>
              )) : <span className="premium-empty">No allocation yet.</span>}
            </div>
          </div>
          <button type="button" className="premium-v2-footer-link" onClick={() => onSelectView?.("portfolio")}><span>◔</span> View full breakdown <b>→</b></button>
        </article>

        <article className="premium-panel premium-ai-panel premium-v2-panel premium-v2-ai-panel">
          <div className="premium-panel-head premium-ai-head premium-v2-panel-head">
            <div><h2>✦ AI Assistant</h2></div>
            <span className="premium-online"><i /> Open</span>
          </div>
          <p>Analyze your wallet, understand activity, and prepare actions for review.</p>
          <div className="premium-ai-chips premium-v2-ai-chips">
            <button type="button" onClick={() => onAskCopilot?.("Analyze my wallet")}>Portfolio summary</button>
            <button type="button" onClick={() => onAskCopilot?.("Explain my recent activity")}>Recent activity</button>
            <button type="button" onClick={() => onAskCopilot?.("What can I do with Arc today?")}>Explore Arc</button>
          </div>
          <button type="button" className="premium-ai-cta premium-v2-ai-cta" onClick={() => onSelectView?.("agent")}>
            <span>Ask me anything…</span><strong>↑</strong>
          </button>
        </article>
      </div>

      <div className="premium-secondary-grid premium-v2-secondary-grid">
        <article className="premium-panel premium-activity-panel premium-v2-panel premium-v2-activity-panel">
          <div className="premium-panel-head premium-v2-panel-head">
            <div><h2>Recent Activity</h2></div>
            <button type="button" onClick={() => onSelectView?.("activity")}>View all</button>
          </div>
          <div className="premium-activity-list premium-v2-activity-list">
            {recent.length ? recent.map((item) => (
              <button type="button" key={item.id || item.txHash} onClick={() => onAskCopilot?.(`Explain transaction ${item.txHash || item.txHashShort || "latest"}`)}>
                <ActivityIcon kind={item.kind} />
                <span><strong>{item.type || "Transaction"}</strong><small>{item.summary || item.timeLabel || "Recently"}</small></span>
                <span className={`premium-activity-amount ${activityAmountClass(item)}`}><strong>{item.amount || "Tracked"}</strong><small>{item.timeLabel || item.txHashShort || shorten(item.txHash || "")}</small></span>
                <span className={`premium-v2-status ${String(item.status || "confirmed").toLowerCase()}`}>{item.status || "Confirmed"}</span>
              </button>
            )) : <div className="premium-empty">Your recent Arc activity will appear here.</div>}
          </div>
        </article>

        <article className="premium-panel premium-network-panel premium-v2-panel premium-v2-network-panel">
          <div className="premium-panel-head premium-v2-panel-head"><div><h2>Network</h2></div><span className="premium-healthy"><i /> {networkStatus?.ok ? "Healthy" : walletSnapshot?.onArc ? "Connected" : "Switch"}</span></div>
          <div className="premium-v2-network-name"><span className="premium-v2-network-mark">A</span><strong>{arcTestnet.name}</strong></div>
          <div className="premium-network-grid premium-v2-network-grid">
            <div><span>Chain ID</span><strong>{arcTestnet.id}</strong></div>
            <div><span>Gas</span><strong>USDC</strong></div>
            <div><span>Block</span><strong>{networkStatus?.blockNumber ? Number(networkStatus.blockNumber).toLocaleString() : "Live"}</strong></div>
            <div><span>RPC</span><strong>{networkStatus?.latencyMs ? `${networkStatus.latencyMs} ms` : "Ready"}</strong></div>
          </div>
          <button type="button" className="premium-network-action premium-v2-footer-link" onClick={() => onSelectView?.("community")}>View network details <span>↗</span></button>
        </article>

        <article className="premium-panel premium-v2-panel premium-v2-insights-panel">
          <div className="premium-panel-head premium-v2-panel-head"><div><h2>Wallet Insights</h2></div><span className="premium-v2-filter">Live</span></div>
          <div className="premium-v2-insight-list">
            <div><span className="premium-v2-insight-icon insight-green">↗</span><span><strong>{activityItems.length}</strong><small>Tracked transactions</small></span></div>
            <div><span className="premium-v2-insight-icon insight-violet">◫</span><span><strong>{assets.length}</strong><small>Portfolio assets</small></span></div>
            <div><span className="premium-v2-insight-icon insight-blue">✓</span><span><strong>Self-custody</strong><small>You approve every transaction</small></span></div>
          </div>
          <button type="button" className="premium-v2-footer-link" onClick={() => onSelectView?.("agent")}><span>✦</span> Go to AI Agent <b>→</b></button>
        </article>
      </div>
    </section>
  );
});

export default PremiumWalletDashboard;
