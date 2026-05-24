import { memo } from "react";
import PortfolioAllocation from "./portfolio-allocation";
import { FeatureIcon } from "./wallet-sidebar";

function shortenValue(value) {
  if (!value || value.length < 14) {
    return value || "Unknown";
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function getWeeklyTrend(items) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const thisWeek = items.filter((item) => Date.parse(item.createdAt || "") >= now - weekMs);
  const previousWeek = items.filter((item) => {
    const timestamp = Date.parse(item.createdAt || "");
    return timestamp >= now - weekMs * 2 && timestamp < now - weekMs;
  });

  if (!previousWeek.length && thisWeek.length) {
    return "New activity detected this week.";
  }

  if (!thisWeek.length) {
    return "No new Arc USDC activity this week yet.";
  }

  const change = Math.round(((thisWeek.length - previousWeek.length) / Math.max(previousWeek.length, 1)) * 100);
  return `AI detected wallet activity changed by ${change}% this week.`;
}

function getDirection(item) {
  if (item?.kind === "swap") {
    return "Swapped";
  }

  return item?.kind === "bridge_received" ? "Bridged" : item?.kind === "sent" ? "Sent" : "Received";
}

function RecentActivityPreview({ items = [], onOpenActivity }) {
  const recentItems = items.slice(0, 4);

  return (
    <article
      className="card analytics-card recent-activity-preview dashboard-click-card"
      onClick={onOpenActivity}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onOpenActivity?.();
        }
      }}
    >
      <div className="section-heading">
        <div>
          <p className="section-kicker">Recent Activity</p>
          <h2>Live wallet feed</h2>
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={(event) => {
            event.stopPropagation();
            onOpenActivity?.();
          }}
        >
          View all
        </button>
      </div>

      {recentItems.length ? (
        <div className="recent-activity-list">
          {recentItems.map((item) => (
            <div key={item.id} className="recent-activity-row">
              <span className={`activity-token-icon activity-token-icon-${item.kind || "other"}`}>
                {item.kind === "sent" ? "UP" : item.kind === "received" ? "DN" : item.kind === "swap" ? "SW" : "BR"}
              </span>
              <div>
                <strong>{item.type || getDirection(item)}</strong>
                <small>{item.txHashShort || shortenValue(item.txHash)}</small>
              </div>
              <div>
                <strong>{item.amount || "Tracked"}</strong>
                <small>{item.timeLabel || "Recently"}</small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state empty-state-compact">
          <strong>No wallet activity yet.</strong>
          <p>Sent, received, swapped, and bridged USDC will appear here from real activity.</p>
        </div>
      )}
    </article>
  );
}

function QuickActionCommandCenter({ onSelectView, onReceive, onAiOpen }) {
  const actions = [
    {
      id: "send",
      label: "Send",
      icon: "send",
      helper: "Transfer Arc USDC",
      status: "Live",
      command: "Open send flow",
      action: () => onSelectView?.("send")
    },
    {
      id: "receive",
      label: "Receive",
      icon: "receive",
      helper: "Show QR address",
      status: "QR",
      command: "Copy wallet address",
      action: onReceive
    },
    {
      id: "swap",
      label: "Swap",
      icon: "swap",
      helper: "Arc App Kit route",
      status: "Live",
      command: "Swap stablecoins",
      action: () => onSelectView?.("swap")
    },
    {
      id: "bridge",
      label: "Bridge",
      icon: "bridge",
      helper: "Move USDC to Arc",
      status: "Live",
      command: "Bridge assets",
      action: () => onSelectView?.("bridge")
    },
    {
      id: "portfolio",
      label: "Portfolio",
      icon: "portfolio",
      helper: "Asset mix",
      status: "Live",
      command: "View balances",
      action: () => onSelectView?.("portfolio")
    },
    {
      id: "activity",
      label: "Activity",
      icon: "activity",
      helper: "Real wallet feed",
      status: "Live",
      command: "Review history",
      action: () => onSelectView?.("activity")
    },
    {
      id: "ai",
      label: "Ask AI",
      icon: "ai",
      helper: "Wallet guidance",
      status: "Copilot",
      command: "Analyze wallet",
      action: onAiOpen
    }
  ];

  return (
    <article className="card analytics-card quick-actions-card">
      <div className="command-center-header">
        <div>
          <p className="section-kicker">Quick Actions</p>
          <h2>Move faster</h2>
        </div>
      </div>
      <div className="command-grid">
        {actions.slice(0, 4).map((action) => (
          <button key={action.id} type="button" onClick={action.action}>
            <span className="command-icon-orb">
              <FeatureIcon name={action.icon} />
            </span>
            <span className="command-card-copy">
              <strong>{action.label}</strong>
              <small>{action.helper}</small>
              <em>{action.command}</em>
            </span>
          </button>
        ))}
      </div>
    </article>
  );
}

function AiCopilotWidget({ onAiOpen, walletSnapshot, activityItems = [] }) {
  return (
    <article
      className="card analytics-card ai-copilot-card dashboard-click-card"
      onClick={onAiOpen}
      role="button"
      tabIndex={0}
    >
      <div className="ai-copilot-top">
        <div className="ai-orb-avatar" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="section-kicker">AI Copilot</p>
          <h2>Ask your wallet</h2>
        </div>
      </div>
      <div className="ai-command-input">Ask about balance, activity, swaps...</div>
      <div className="ai-command-chips">
        {["Send USDC", "Check portfolio", "Bridge assets", "Recent activity"].map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <p className="helper-copy">
        Connected to {walletSnapshot?.address ? "your Arc wallet" : "Arc Testnet"} with {activityItems.length} tracked events.
      </p>
    </article>
  );
}

function MarketOverviewWidget({ walletSnapshot }) {
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
  const usdcAsset = assets.find((asset) => asset.symbol === "USDC");
  const cirbtcAsset = assets.find((asset) => asset.symbol === "cirBTC");

  return (
    <article className="card analytics-card market-overview-card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Market</p>
          <h2>Arc overview</h2>
        </div>
        <span className="status-badge status-good">Live</span>
      </div>
      <div className="market-grid">
        <div><span>USDC</span><strong>{usdcAsset?.balance || walletSnapshot?.usdcBalance || "0.00 USDC"}</strong></div>
        <div><span>cirBTC</span><strong>{cirbtcAsset?.balance || "0.00 cirBTC"}</strong></div>
        <div><span>Gas</span><strong>USDC</strong></div>
        <div><span>Chain</span><strong>{walletSnapshot?.onArc ? "Ready" : "Switch"}</strong></div>
      </div>
    </article>
  );
}

function PortfolioInsightsWidget({ walletSnapshot, activityItems = [] }) {
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
  const funded = assets.filter((asset) => Number(asset?.balanceValue) > 0);
  const health = Math.min(100, 62 + funded.length * 8 + Math.min(activityItems.length, 10));
  const totalValue = assets.reduce((total, asset) => total + (Number(asset?.valueUsd) || 0), 0);
  const strongestAsset = funded[0]?.symbol || "USDC";
  const riskLevel = funded.length > 2 ? "Balanced" : funded.length > 1 ? "Moderate" : "Focused";

  return (
    <article className="card analytics-card portfolio-insights-card">
      <div>
        <p className="section-kicker">AI Insights</p>
        <h2>Wallet health score</h2>
      </div>
      <div className="insight-vertical-stack">
        <div className="insight-score-ring">
          <strong>{health}</strong>
          <span>/100</span>
        </div>
        <div className="insight-feature-list">
          <div>
            <span>Risk level</span>
            <strong>{riskLevel}</strong>
          </div>
          <div>
            <span>Tracked assets</span>
            <strong>{funded.length || assets.length}</strong>
          </div>
          <div>
            <span>Top asset</span>
            <strong>{strongestAsset}</strong>
          </div>
          <div>
            <span>Portfolio value</span>
            <strong>${totalValue.toFixed(2)}</strong>
          </div>
        </div>
      </div>
      <p className="helper-copy">
        {funded.length > 1
          ? "Diversification is improving across Arc assets."
          : "Add more supported Arc assets to improve diversification."}
      </p>
    </article>
  );
}

function buildMonthlyBars(items) {
  const buckets = Array.from({ length: 8 }, (_, index) => ({
    id: index,
    label: `${index + 1}`,
    value: 0
  }));

  for (const item of items) {
    const timestamp = Date.parse(item.createdAt || "");
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const bucket = Math.min(7, Math.max(0, Math.floor((Date.now() - timestamp) / (4 * 24 * 60 * 60 * 1000))));
    buckets[7 - bucket].value += 1;
  }

  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);
  return buckets.map((bucket) => ({
    ...bucket,
    height: Math.max(10, Math.round((bucket.value / max) * 100))
  }));
}

function WalletIntelligencePanel({
  activityItems = [],
  walletSnapshot,
  onSelectView,
  onReceive,
  onAiOpen
}) {
  const bars = buildMonthlyBars(activityItems);

  return (
    <section className="wallet-intelligence-grid">
      <article className="ai-insight-hero card">
        <div className="ai-orb-large" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="section-kicker">AI Analytics</p>
          <h2>Wallet intelligence, powered by real activity.</h2>
          <p>{getWeeklyTrend(activityItems)}</p>
        </div>
      </article>

      <AiCopilotWidget
        onAiOpen={onAiOpen}
        walletSnapshot={walletSnapshot}
        activityItems={activityItems}
      />

      <QuickActionCommandCenter
        onSelectView={onSelectView}
        onReceive={onReceive}
        onAiOpen={onAiOpen}
      />

      <PortfolioAllocation
        walletSnapshot={walletSnapshot}
        compact
        onOpenPortfolio={() => onSelectView?.("portfolio")}
      />

      <MarketOverviewWidget walletSnapshot={walletSnapshot} />

      <RecentActivityPreview
        items={activityItems}
        onOpenActivity={() => onSelectView?.("activity")}
      />

      <PortfolioInsightsWidget
        walletSnapshot={walletSnapshot}
        activityItems={activityItems}
      />

      <article
        className="card analytics-card dashboard-click-card activity-trend-card"
        onClick={() => onSelectView?.("activity")}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            onSelectView?.("activity");
          }
        }}
      >
        <div className="section-heading">
          <div>
            <p className="section-kicker">Activity Trend</p>
            <h2>Recent USDC movement</h2>
          </div>
          <span className="status-badge">{activityItems.length} events</span>
        </div>
        <div className="activity-mini-chart" aria-label="Recent activity chart">
          {bars.map((bar) => (
            <span key={bar.id} style={{ height: `${bar.height}%` }} title={`${bar.value} events`} />
          ))}
        </div>
      </article>

      <article
        className="card analytics-card nft-mini-card dashboard-final-card"
        onClick={() => onSelectView?.("nft")}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            onSelectView?.("nft");
          }
        }}
      >
        <span className="coming-soon-orb" aria-hidden="true" />
        <p className="section-kicker">NFT</p>
        <h2>NFT Marketplace & Gallery - Coming Soon</h2>
        <p className="helper-copy">
          Collect, view, and trade NFTs directly from your ARC AI Wallet soon.
        </p>
      </article>
    </section>
  );
}

export default memo(WalletIntelligencePanel);
