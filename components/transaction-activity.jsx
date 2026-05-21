import { useMemo, useState } from "react";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "received", label: "Received" },
  { id: "swap", label: "Swapped" },
  { id: "bridge_received", label: "Bridged" }
];

function shortenValue(value) {
  if (!value || value.length < 14) {
    return value || "";
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function normalizeAddress(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isSameAddress(left, right) {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function getActivityDirection(item, walletAddress) {
  if (item?.kind === "swap" || String(item?.type || "").toLowerCase() === "swap") {
    return "swap";
  }

  const sender = item?.sender || item?.from || "";
  const receiver = item?.receiver || item?.to || item?.recipient || "";
  const explicitKind = String(item?.kind || "").toLowerCase();
  const explicitType = String(item?.type || "").toLowerCase();

  if (
    !sender &&
    isSameAddress(item?.walletAddress, walletAddress) &&
    (explicitKind === "sent" || explicitType.startsWith("sent"))
  ) {
    return "sent";
  }

  if (isSameAddress(sender, walletAddress)) {
    return "sent";
  }

  if (item?.kind === "bridge_received") {
    return "bridge_received";
  }

  if (isSameAddress(receiver, walletAddress)) {
    return "received";
  }

  return explicitKind || "other";
}

function getCounterparty(item, walletAddress, direction) {
  if (direction === "swap") {
    return item?.metadata?.tokenOut || item?.receiver || item?.to || item?.counterparty || "";
  }

  if (direction === "sent") {
    return item?.receiver || item?.to || item?.recipient || item?.counterparty || "";
  }

  if (direction === "received") {
    return item?.sender || item?.from || item?.counterparty || "";
  }

  return item?.recipient || item?.counterparty || item?.receiver || item?.to || "";
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

function getActivityTitle(item, direction) {
  if (direction === "sent") {
    return "Sent USDC";
  }

  if (direction === "received") {
    return "Received USDC";
  }

  if (direction === "swap") {
    return "Swapped USDC";
  }

  if (direction === "bridge_received") {
    return "Bridged USDC";
  }

  return item.type || "Wallet activity";
}

function getActivitySummary(item, direction, counterparty) {
  if (direction === "sent") {
    return counterparty
      ? `Sent ${item.amount || "USDC"} to ${shortenValue(counterparty)} on Arc Testnet.`
      : item.summary || "Sent USDC on Arc Testnet.";
  }

  if (direction === "received") {
    return counterparty
      ? `Received ${item.amount || "USDC"} from ${shortenValue(counterparty)} on Arc Testnet.`
      : item.summary || "Received USDC on Arc Testnet.";
  }

  return item.summary || "Wallet activity recorded.";
}

function ActivityCard({ item, walletAddress }) {
  const direction = getActivityDirection(item, walletAddress);
  const counterparty = getCounterparty(item, walletAddress, direction);
  const displayTitle = getActivityTitle(item, direction);
  const displaySummary = getActivitySummary(item, direction, counterparty);
  const sourceCopy =
    item.source === "merged"
      ? "Matched to a confirmed onchain wallet transaction"
      : item.source === "app"
        ? "Saved from an in-app wallet action"
        : "Tracked from live Arc onchain activity";
  const counterpartyLabel =
    direction === "sent"
      ? "Recipient"
      : direction === "received"
        ? "From"
        : direction === "swap"
          ? "Output"
          : direction === "bridge_received"
            ? "Destination"
            : "Counterparty";
  const iconLabel =
    direction === "sent"
      ? "UP"
      : direction === "received"
        ? "DN"
        : direction === "swap"
          ? "SW"
          : "BR";

  return (
    <article className="activity-card">
      <div className="activity-card-head">
        <div className={`activity-token-icon activity-token-icon-${direction}`}>
          {iconLabel}
        </div>
        <div className="activity-card-copy">
          <strong>{displayTitle}</strong>
          <span>{displaySummary}</span>
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
          {counterparty
            ? `${counterpartyLabel}: ${shortenValue(counterparty)}`
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
  const walletAddress = walletSnapshot?.address || "";
  const [activeFilter, setActiveFilter] = useState("all");
  const filteredItems = useMemo(() => {
    if (activeFilter === "all") {
      return items;
    }

    return items.filter(
      (item) => getActivityDirection(item, walletAddress) === activeFilter
    );
  }, [activeFilter, items, walletAddress]);
  const emptyFilterCopy = {
    sent: "No sent USDC activity found.",
    received: "No received USDC activity found.",
    swap: "No swap activity found.",
    bridge_received: "No bridged USDC activity found."
  };

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
          <strong>
            {emptyFilterCopy[activeFilter] ||
              `No ${activeFilter.replace("_", " ")} activity found.`}
          </strong>
          <p>Try another filter or refresh after your next Arc transaction.</p>
        </div>
      ) : (
        <div className="activity-feed">
          {filteredItems.map((item) => (
            <ActivityCard
              key={item.id}
              item={item}
              walletAddress={walletAddress}
            />
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
