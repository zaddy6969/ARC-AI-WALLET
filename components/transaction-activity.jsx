import { useMemo, useState } from "react";
import { FeatureIcon } from "./wallet-sidebar";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "received", label: "Received" },
  { id: "swap", label: "Swap" },
  { id: "bridge", label: "Bridge" },
  { id: "contract", label: "Contracts" }
];

function shortenValue(value) {
  if (!value || value.length < 14) return value || "";
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function normalizeAddress(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isSameAddress(left, right) {
  const a = normalizeAddress(left);
  const b = normalizeAddress(right);
  return Boolean(a && b && a === b);
}

function getActivityCategory(item, walletAddress) {
  const kind = String(item?.kind || "").toLowerCase();
  const type = String(item?.type || "").toLowerCase();
  const operation = String(item?.metadata?.operation || "").toLowerCase();

  if (kind === "swap" || type.includes("swap") || operation === "swap") return "swap";
  if (kind === "bridge" || kind === "bridge_received" || type.includes("bridge") || operation === "bridge") return "bridge";
  if (kind === "contract" || type.includes("contract") || operation.startsWith("contract")) return "contract";

  const sender = item?.sender || item?.from || "";
  const receiver = item?.receiver || item?.to || item?.recipient || "";
  if (isSameAddress(sender, walletAddress)) return "sent";
  if (isSameAddress(receiver, walletAddress)) return "received";
  if (kind === "sent" || type.startsWith("sent")) return "sent";
  if (kind === "received" || type.startsWith("received")) return "received";
  return kind || "other";
}

function getActivityTitle(item, category) {
  if (category === "swap") return item?.type || "Swap";
  if (category === "bridge") return item?.type || "Bridge";
  if (category === "contract") return item?.type || "Contract interaction";
  if (category === "sent") return item?.type || "Sent asset";
  if (category === "received") return item?.type || "Received asset";
  return item?.type || "Wallet activity";
}

function getActivityIcon(category) {
  if (category === "swap") return "swap";
  if (category === "bridge") return "bridge";
  if (category === "sent") return "send";
  if (category === "received") return "receive";
  return "activity";
}

function formatActivityDate(value, fallback) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return fallback || "Recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getRoute(item) {
  const source = item?.metadata?.sourceNetwork || item?.metadata?.sourceChain || "";
  const destination = item?.metadata?.destinationNetwork || item?.metadata?.destinationChain || "";
  if (source && destination) return `${source} → ${destination}`;
  return item?.chain || "";
}

function getCounterparty(item, walletAddress, category) {
  if (category === "swap" || category === "bridge") return getRoute(item);
  if (category === "contract") return item?.metadata?.contractName || item?.metadata?.contractAddress || item?.to || item?.counterparty || "Arc contract";
  if (category === "sent") return item?.receiver || item?.to || item?.recipient || item?.counterparty || "";
  if (category === "received") return item?.sender || item?.from || item?.counterparty || "";
  return item?.counterparty || "";
}

function ActivityRow({ item, walletAddress }) {
  const category = getActivityCategory(item, walletAddress);
  const counterparty = getCounterparty(item, walletAddress, category);
  const title = getActivityTitle(item, category);
  const status = item?.status || "Confirmed";

  return (
    <article className="wallet-v3-activity-row">
      <span className={`wallet-v3-activity-icon is-${category}`}>
        <FeatureIcon name={getActivityIcon(category)} />
      </span>
      <div className="wallet-v3-activity-main">
        <strong>{title}</strong>
        <span>{item?.summary || counterparty || item?.chain || "Wallet transaction"}</span>
        {item?.txHash ? <small>Tx {shortenValue(item.txHash)}</small> : null}
      </div>
      <div className="wallet-v3-activity-route">
        <span>{counterparty ? shortenValue(counterparty) : item?.chain || "—"}</span>
        <small>{formatActivityDate(item?.createdAt, item?.timeLabel)}</small>
      </div>
      <div className="wallet-v3-activity-amount">
        <strong>{item?.amount || (category === "contract" ? "Onchain" : "Tracked")}</strong>
        <span className={`wallet-v3-status is-${String(status).toLowerCase()}`}>{status}</span>
      </div>
      <div className="wallet-v3-activity-link">
        {item?.explorerUrl ? (
          <a href={item.explorerUrl} target="_blank" rel="noreferrer" aria-label="View transaction on ArcScan">↗</a>
        ) : (
          <span>—</span>
        )}
      </div>
    </article>
  );
}

export default function TransactionActivity({ walletSnapshot, items = [], liveStatus, liveError, onRefresh }) {
  const isSignedIn = walletSnapshot?.isSignedIn;
  const walletAddress = walletSnapshot?.address || "";
  const [activeFilter, setActiveFilter] = useState("all");

  const filteredItems = useMemo(() => {
    if (activeFilter === "all") return items;
    return items.filter((item) => getActivityCategory(item, walletAddress) === activeFilter);
  }, [activeFilter, items, walletAddress]);

  const counts = useMemo(() => {
    const result = { all: items.length, sent: 0, received: 0, swap: 0, bridge: 0, contract: 0 };
    items.forEach((item) => {
      const category = getActivityCategory(item, walletAddress);
      if (Object.prototype.hasOwnProperty.call(result, category)) result[category] += 1;
    });
    return result;
  }, [items, walletAddress]);

  return (
    <section className="wallet-v3-page-card wallet-v3-activity-page">
      <header className="wallet-v3-page-head">
        <div>
          <span className="wallet-v3-eyebrow">Explorer-backed transaction history</span>
          <h2>Activity</h2>
          <p>ArcScan history and Lumexa actions are merged into one timeline so older onchain transactions remain visible as contribution proof.</p>
        </div>
        {isSignedIn ? (
          <button
            type="button"
            className="wallet-v3-secondary-button"
            onClick={onRefresh}
            disabled={liveStatus === "loading" || liveStatus === "refreshing"}
          >
            {liveStatus === "loading" || liveStatus === "refreshing" ? "Syncing history…" : "Refresh history"}
          </button>
        ) : null}
      </header>

      {isSignedIn ? (
        <div className="wallet-v3-filter-tabs" role="tablist" aria-label="Activity filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={activeFilter === filter.id ? "is-active" : ""}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}<span>{counts[filter.id] || 0}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!isSignedIn ? (
        <div className="wallet-v3-empty"><strong>Connect a wallet to view activity.</strong></div>
      ) : liveStatus === "loading" && !items.length ? (
        <div className="wallet-v3-empty"><strong>Recovering full Arc history…</strong><span>Reading paginated ArcScan transactions and token transfers.</span></div>
      ) : !filteredItems.length ? (
        <div className="wallet-v3-empty">
          <strong>No {activeFilter === "all" ? "wallet" : activeFilter} activity found.</strong>
          <span>Lumexa checks ArcScan history as well as locally submitted wallet actions.</span>
        </div>
      ) : (
        <div className="wallet-v3-activity-table">
          <div className="wallet-v3-activity-header"><span>Activity</span><span>Route / counterparty</span><span>Amount</span><span /></div>
          {filteredItems.map((item) => <ActivityRow key={item.id} item={item} walletAddress={walletAddress} />)}
        </div>
      )}

      {liveStatus === "error" ? (
        <div className="wallet-v3-inline-warning"><strong>ArcScan history sync is temporarily unavailable.</strong><span>{liveError || "Locally saved Lumexa actions are still shown."}</span></div>
      ) : null}
    </section>
  );
}
