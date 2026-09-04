import { useMemo, useState } from "react";
import { WALLET_ACTIVITY_NETWORKS } from "../lib/wallet-networks";
import { FeatureIcon } from "./wallet-sidebar";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "received", label: "Received" },
  { id: "swap", label: "Swap" },
  { id: "bridge", label: "Bridge" }
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
  if (category === "sent") return "Sent USDC";
  if (category === "received") return "Received USDC";
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
  if (category === "sent") return item?.receiver || item?.to || item?.recipient || item?.counterparty || "";
  if (category === "received") return item?.sender || item?.from || item?.counterparty || "";
  return item?.counterparty || "";
}

function getBridgeProgress(item) {
  const steps = Array.isArray(item?.metadata?.bridgeSteps) ? item.metadata.bridgeSteps : [];
  if (!steps.length) return "";
  const complete = steps.filter((step) => ["success", "confirmed", "complete"].includes(String(step?.state || "").toLowerCase())).length;
  return `${complete}/${steps.length} bridge steps`;
}

function ActivityRow({ item, walletAddress }) {
  const category = getActivityCategory(item, walletAddress);
  const counterparty = getCounterparty(item, walletAddress, category);
  const title = getActivityTitle(item, category);
  const status = item?.status || "Confirmed";
  const bridgeProgress = category === "bridge" ? getBridgeProgress(item) : "";

  return (
    <article className="wallet-v3-activity-row">
      <span className={`wallet-v3-activity-icon is-${category}`}>
        <FeatureIcon name={getActivityIcon(category)} />
      </span>
      <div className="wallet-v3-activity-main">
        <div className="wallet-v5-activity-title-line"><strong>{title}</strong><small>{item?.chain || "Wallet"}</small></div>
        <span>{item?.summary || counterparty || item?.chain || "Wallet transaction"}</span>
        {bridgeProgress ? <small className="wallet-v5-bridge-progress">{bridgeProgress}</small> : null}
      </div>
      <div className="wallet-v3-activity-route">
        <span>{counterparty ? shortenValue(counterparty) : item?.chain || "—"}</span>
        <small>{formatActivityDate(item?.createdAt, item?.timeLabel)}</small>
      </div>
      <div className="wallet-v3-activity-amount">
        <strong>{item?.amount || "Tracked"}</strong>
        <span className={`wallet-v3-status is-${String(status).toLowerCase()}`}>{status}</span>
      </div>
      <div className="wallet-v3-activity-link">
        {item?.explorerUrl ? (
          <a href={item.explorerUrl} target="_blank" rel="noreferrer" aria-label="View transaction on explorer">↗</a>
        ) : (
          <span>—</span>
        )}
      </div>
    </article>
  );
}

function NetworkSyncHealth({ statuses = [] }) {
  if (!statuses.length) return null;
  return (
    <div className="wallet-v5-network-health" aria-label="Activity network sync health">
      {statuses.map((network) => (
        <div key={network.chainId} className={network.status === "ready" ? "is-ready" : "is-error"} title={network.error || ""}>
          <i />
          <span><strong>{network.shortName || network.name}</strong><small>{network.status === "ready" ? `${network.count || 0} recent` : "Sync unavailable"}</small></span>
        </div>
      ))}
    </div>
  );
}

export default function TransactionActivity({ walletSnapshot, items = [], networkStatuses = [], liveStatus, liveError, onRefresh }) {
  const isSignedIn = walletSnapshot?.isSignedIn;
  const walletAddress = walletSnapshot?.address || "";
  const [activeFilter, setActiveFilter] = useState("all");
  const [networkFilter, setNetworkFilter] = useState("all");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const categoryMatches = activeFilter === "all" || getActivityCategory(item, walletAddress) === activeFilter;
      const networkMatches = networkFilter === "all" || Number(item?.chainId) === Number(networkFilter);
      return categoryMatches && networkMatches;
    });
  }, [activeFilter, items, networkFilter, walletAddress]);

  const counts = useMemo(() => {
    const result = { all: items.length, sent: 0, received: 0, swap: 0, bridge: 0 };
    items.forEach((item) => {
      const category = getActivityCategory(item, walletAddress);
      if (Object.prototype.hasOwnProperty.call(result, category)) result[category] += 1;
    });
    return result;
  }, [items, walletAddress]);

  const visibleNetworks = useMemo(() => {
    const used = new Set(items.map((item) => Number(item?.chainId)).filter(Boolean));
    const supported = WALLET_ACTIVITY_NETWORKS.filter((network) => used.has(network.id));
    return supported.length ? supported : WALLET_ACTIVITY_NETWORKS;
  }, [items]);

  return (
    <section className="wallet-v3-page-card wallet-v3-activity-page">
      <header className="wallet-v3-page-head">
        <div>
          <span className="wallet-v3-eyebrow">Multichain transaction history</span>
          <h2>Activity</h2>
          <p>Arc, Ethereum and Base USDC activity plus Lumexa swap and bridge actions in one timeline.</p>
        </div>
        {isSignedIn ? (
          <button
            type="button"
            className="wallet-v3-secondary-button"
            onClick={onRefresh}
            disabled={liveStatus === "loading" || liveStatus === "refreshing"}
          >
            {liveStatus === "loading" || liveStatus === "refreshing" ? "Syncing…" : "Refresh"}
          </button>
        ) : null}
      </header>

      {isSignedIn ? <NetworkSyncHealth statuses={networkStatuses} /> : null}

      {isSignedIn ? (
        <div className="wallet-v5-activity-toolbar">
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
          <label className="wallet-v5-network-filter">
            <span>Network</span>
            <select value={networkFilter} onChange={(event) => setNetworkFilter(event.target.value)}>
              <option value="all">All networks</option>
              {visibleNetworks.map((network) => <option key={network.id} value={network.id}>{network.name}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      {!isSignedIn ? (
        <div className="wallet-v3-empty"><strong>Connect a wallet to view activity.</strong></div>
      ) : liveStatus === "loading" && !items.length ? (
        <div className="wallet-v3-empty"><strong>Loading multichain activity…</strong><span>Reading recent USDC events across supported networks.</span></div>
      ) : !filteredItems.length ? (
        <div className="wallet-v3-empty">
          <strong>No matching activity yet.</strong>
          <span>Try another filter or complete a Lumexa wallet action.</span>
        </div>
      ) : (
        <div className="wallet-v3-activity-table">
          <div className="wallet-v3-activity-header"><span>Activity</span><span>Route / counterparty</span><span>Amount</span><span /></div>
          {filteredItems.map((item) => <ActivityRow key={`${item.chainId || "chain"}-${item.id}`} item={item} walletAddress={walletAddress} />)}
        </div>
      )}

      {liveStatus === "error" ? (
        <div className="wallet-v3-inline-warning"><strong>Live multichain sync is partially unavailable.</strong><span>{liveError || "Local Lumexa actions are still shown."}</span></div>
      ) : null}
    </section>
  );
}
