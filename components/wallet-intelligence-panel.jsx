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
    <article className="card analytics-card recent-activity-preview">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Recent Activity</p>
          <h2>Live wallet feed</h2>
        </div>
        <button type="button" className="button button-secondary" onClick={onOpenActivity}>
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
    <article className="card analytics-card command-center-card">
      <div className="command-center-header">
        <div>
          <p className="section-kicker">Command Center</p>
          <h2>Wallet control deck</h2>
        </div>
        <span className="status-badge status-good">Ready</span>
      </div>
      <div className="command-grid">
        {actions.map((action) => (
          <button key={action.id} type="button" onClick={action.action}>
            <span className="command-status">{action.status}</span>
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

      <PortfolioAllocation
        walletSnapshot={walletSnapshot}
        compact
        onOpenPortfolio={() => onSelectView?.("portfolio")}
      />

      <QuickActionCommandCenter
        onSelectView={onSelectView}
        onReceive={onReceive}
        onAiOpen={onAiOpen}
      />

      <RecentActivityPreview
        items={activityItems}
        onOpenActivity={() => onSelectView?.("activity")}
      />

      <article
        className="card analytics-card dashboard-click-card"
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
