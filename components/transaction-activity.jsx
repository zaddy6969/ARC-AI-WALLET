import { useMemo, useState } from "react";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "received", label: "Received" },
  { id: "bridge_received", label: "Bridged" }
];

function shortenValue(value) {
  if (!value || value.length < 14) {
    return value || "";
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatActivityDate(value, fallback) {
  const date = new Date(value || "");

  if (Number.isNaN(date.getTime())) {
    return fallback || "Recently";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function ActivityCard({ item }) {
  const sourceCopy =
    item.source === "merged"
      ? "Matched to a confirmed onchain wallet transaction"
      : item.source === "app"
        ? "Saved from an in-app wallet action"
        : "Tracked from live Arc onchain activity";
  const counterpartyLabel =
    item.kind === "sent"
      ? "Recipient"
      : item.kind === "received"
        ? "From"
        : item.kind === "bridge_received"
          ? "Destination"
          : "Counterparty";

  return (
    <article className="activity-card">
      <div className="activity-card-head">
        <div className={`activity-token-icon activity-token-icon-${item.kind || "other"}`}>
          {item.kind === "sent" ? "UP" : item.kind === "received" ? "DN" : "BR"}
        </div>
        <div className="activity-card-copy">
          <strong>{item.type}</strong>
          <span>{item.summary || "Wallet activity recorded."}</span>
        </div>
        <div className="activity-card-amount">
          <strong>{item.amount || "Tracked event"}</strong>
          <span>{item.chain || "Arc Testnet"}</span>
        </div>
      </div>
      <div className="activity-card-meta">
        <span>{formatActivityDate(item.createdAt, item.timeLabel)}</span>
        <span className={`activity-status activity-status-${String(item.status || "confirmed").toLowerCase()}`}>
          {item.status || "Confirmed"}
        </span>
        {item.txHashShort ? <span>{item.txHashShort}</span> : null}
      </div>
      <div className="activity-card-footer">
        <span>
          {item.recipient
            ? `${counterpartyLabel}: ${shortenValue(item.recipient)}`
            : sourceCopy}
        </span>
        {item.explorerUrl ? (
          <a href={item.explorerUrl} target="_blank" rel="noreferrer">
            View on explorer
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function TransactionActivity({
  walletSnapshot,
  items,
  liveStatus,
  liveError,
  onRefresh
}) {
  const isSignedIn = walletSnapshot?.isSignedIn;
  const [activeFilter, setActiveFilter] = useState("all");
  const filteredItems = useMemo(() => {
    if (activeFilter === "all") {
      return items;
    }

    if (activeFilter === "received") {
      return items.filter((item) => item.kind === "received");
    }

    return items.filter((item) => item.kind === activeFilter);
  }, [activeFilter, items]);

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Activity</p>
          <h2>Wallet actions and Arc activity</h2>
        </div>
        <div className="activity-heading-actions">
          <span className="status-badge">
            {!isSignedIn
              ? "Wallet required"
              : liveStatus === "loading" || liveStatus === "refreshing"
                ? "Syncing"
                : `${items.length} items`}
          </span>
          {isSignedIn ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={onRefresh}
              disabled={liveStatus === "loading" || liveStatus === "refreshing"}
            >
              {liveStatus === "loading" || liveStatus === "refreshing"
                ? "Refreshing..."
                : "Refresh Activity"}
            </button>
          ) : null}
        </div>
      </div>

      {isSignedIn ? (
        <div className="activity-filter-row">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`activity-filter-chip ${activeFilter === filter.id ? "activity-filter-chip-active" : ""}`}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      {!isSignedIn ? (
        <div className="empty-state">
          <strong>Connect wallet to view activity.</strong>
          <p>
            Connect your wallet to load real Arc Testnet USDC transfers.
          </p>
        </div>
      ) : liveStatus === "loading" && items.length === 0 ? (
        <div className="empty-state">
          <strong>Loading transactions...</strong>
          <p>Fetching recent Arc Testnet USDC activity for this wallet.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <strong>Your Arc wallet activity will appear here.</strong>
          <p>
            Real sent and received USDC transfers will appear after your wallet
            records them on Arc Testnet.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <strong>No {activeFilter.replace("_", " ")} activity found.</strong>
          <p>Try another filter or refresh after your next Arc transaction.</p>
        </div>
      ) : (
        <div className="activity-feed">
          {filteredItems.map((item) => (
            <ActivityCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {liveStatus === "error" ? (
        <div className="empty-state empty-state-compact">
          <strong>Failed to load activity. Try again.</strong>
          <p>{liveError || "Please try again later."}</p>
        </div>
      ) : null}
    </section>
  );
}
