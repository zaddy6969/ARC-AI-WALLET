import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "lumexa-ai-wallet:activity:v2";
const UPDATE_EVENT = "lumexa-ai-wallet:activity-updated";
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeAddress(address) {
  return typeof address === "string" ? address.toLowerCase() : "";
}

function debugActivityLog(event, detail) {
  if (!IS_DEVELOPMENT) {
    return;
  }

  console.info("[arc-wallet-activity]", event, detail);
}

function readStorage() {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(items) {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
    return true;
  } catch {
    return false;
  }
}

function replaceStoredItems(nextItems) {
  writeStorage(nextItems.slice(0, 100));
}

function formatTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function shortHash(hash) {
  if (!hash || hash.length < 14) {
    return hash || "";
  }

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function getTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getActivityKey(item) {
  if (item?.txHash) {
    return `tx:${String(item.txHash).toLowerCase()}`;
  }

  if (item?.id) {
    return `id:${item.id}`;
  }

  return `fallback:${[
    item?.type,
    item?.createdAt,
    item?.amount,
    item?.walletAddress
  ]
    .filter(Boolean)
    .join(":")}`;
}

function mergeActivityItemPair(left, right) {
  const items = [left, right].filter(Boolean);
  const chainItem = items.find((item) => item.source === "chain") || null;
  const appItem = items.find((item) => item.source === "app") || null;
  const primary = chainItem || right || left;

  return {
    ...primary,
    id: chainItem?.id || appItem?.id || primary.id,
    source: chainItem && appItem ? "merged" : primary.source,
    walletAddress:
      appItem?.walletAddress || chainItem?.walletAddress || primary.walletAddress || "",
    type: chainItem?.type || appItem?.type || primary.type,
    kind: chainItem?.kind || appItem?.kind || primary.kind || "",
    amount: chainItem?.amount || appItem?.amount || primary.amount || "",
    chain: appItem?.chain || chainItem?.chain || primary.chain || "Arc Testnet",
    sender:
      chainItem?.sender ||
      appItem?.sender ||
      chainItem?.from ||
      primary.sender ||
      primary.from ||
      "",
    receiver:
      chainItem?.receiver ||
      appItem?.receiver ||
      chainItem?.to ||
      primary.receiver ||
      primary.to ||
      "",
    recipient:
      chainItem?.recipient ||
      appItem?.recipient ||
      chainItem?.counterparty ||
      primary.recipient ||
      "",
    counterparty:
      chainItem?.counterparty ||
      appItem?.recipient ||
      primary.counterparty ||
      "",
    status: chainItem?.status || appItem?.status || primary.status || "Confirmed",
    txHash: chainItem?.txHash || appItem?.txHash || primary.txHash || "",
    txHashShort:
      chainItem?.txHashShort ||
      appItem?.txHashShort ||
      shortHash(chainItem?.txHash || appItem?.txHash || primary.txHash || ""),
    explorerUrl:
      chainItem?.explorerUrl || appItem?.explorerUrl || primary.explorerUrl || "",
    summary: chainItem?.summary || appItem?.summary || primary.summary || "",
    createdAt:
      chainItem?.createdAt ||
      appItem?.createdAt ||
      primary.createdAt ||
      new Date().toISOString(),
    timeLabel: chainItem?.timeLabel || appItem?.timeLabel || primary.timeLabel || "Recently",
    blockNumber: chainItem?.blockNumber || appItem?.blockNumber || primary.blockNumber || null,
    token: chainItem?.token || appItem?.token || primary.token || "USDC",
    metadata: {
      ...(appItem?.metadata || {}),
      ...(primary.metadata || {})
    }
  };
}

export function saveLocalActivity(item) {
  const current = readStorage();
  debugActivityLog("local-save", {
    txHash: item?.txHash || "",
    walletAddress: item?.walletAddress || "",
    type: item?.type || "",
    currentCount: current.length
  });
  writeStorage([item, ...current].slice(0, 100));
}

export function updateLocalActivityStatuses(statuses) {
  if (!statuses || typeof statuses !== "object") {
    return;
  }

  const current = readStorage();
  let changed = false;
  const nextItems = current.map((item) => {
    const nextStatus = item.txHash ? statuses[item.txHash]?.status : "";

    if (!nextStatus || nextStatus === item.status) {
      return item;
    }

    changed = true;
    return {
      ...item,
      status: nextStatus,
      blockNumber: statuses[item.txHash]?.blockNumber || item.blockNumber || null
    };
  });

  if (changed) {
    replaceStoredItems(nextItems);
  }
}

export function updateLocalActivityByHash(txHash, patch) {
  if (!txHash || !patch || typeof patch !== "object") {
    return;
  }

  const normalizedHash = String(txHash).toLowerCase();
  const current = readStorage();
  let changed = false;
  const nextItems = current.map((item) => {
    if (String(item.txHash || "").toLowerCase() !== normalizedHash) {
      return item;
    }

    changed = true;
    return {
      ...item,
      ...patch
    };
  });

  if (changed) {
    replaceStoredItems(nextItems);
  }
}

export function createWalletActionRecord({
  walletAddress,
  type,
  kind = "",
  amount,
  chain,
  sender = "",
  receiver = "",
  recipient = "",
  status = "Confirmed",
  txHash = "",
  explorerUrl = "",
  summary = "",
  metadata = {}
}) {
  const createdAt = new Date().toISOString();

  return {
    id: `${type}-${txHash || createdAt}`,
    walletAddress: normalizeAddress(walletAddress),
    source: "app",
    type,
    kind,
    amount,
    chain,
    sender: normalizeAddress(sender),
    receiver: normalizeAddress(receiver || recipient),
    recipient,
    status,
    txHash,
    txHashShort: shortHash(txHash),
    explorerUrl,
    summary,
    createdAt,
    timeLabel: formatTimestamp(createdAt),
    metadata
  };
}

export function mapLiveActivityToFeedItem(item) {
  return {
    id: `chain-${item.id}`,
    walletAddress: "",
    source: "chain",
    type: item.type,
    kind: item.kind || "",
    amount: item.amount || "",
    chain: "Arc Testnet",
    sender: item.from || "",
    receiver: item.to || "",
    recipient: item.counterparty || "",
    counterparty: item.counterparty || "",
    status: item.status || "Confirmed",
    txHash: item.txHash || "",
    txHashShort: item.txHashShort || shortHash(item.txHash || ""),
    explorerUrl: item.explorerUrl || "",
    summary: item.summary || "",
    createdAt: item.timestampMs ? new Date(item.timestampMs).toISOString() : "",
    timeLabel: item.timeLabel || "Recently",
    blockNumber: item.blockNumber || null,
    token: item.token || "USDC"
  };
}

export function mergeActivityFeedItems(localItems, liveItems) {
  const merged = new Map();

  for (const item of [...localItems, ...liveItems]) {
    const key = getActivityKey(item);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, item);
      continue;
    }

    merged.set(key, mergeActivityItemPair(existing, item));
  }

  return [...merged.values()].sort(
    (left, right) => getTimestamp(right.createdAt) - getTimestamp(left.createdAt)
  );
}

export function useLocalActivityHistory(address) {
  const [items, setItems] = useState([]);

  const refresh = useCallback(() => {
    const walletAddress = normalizeAddress(address);
    const storedItems = readStorage();
    const nextItems = storedItems.filter((item) => {
      if (!walletAddress) {
        return false;
      }

      return item.walletAddress === walletAddress;
    });

    debugActivityLog("local-refresh", {
      connectedWallet: walletAddress,
      storedCount: storedItems.length,
      matchedCount: nextItems.length
    });
    setItems(nextItems);
  }, [address]);

  useEffect(() => {
    refresh();

    if (!isBrowser()) {
      return undefined;
    }

    const handleUpdate = () => refresh();
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEY) {
        refresh();
      }
    };

    window.addEventListener(UPDATE_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(UPDATE_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh]);

  return useMemo(
    () => ({
      items,
      save: saveLocalActivity,
      updateStatuses: updateLocalActivityStatuses,
      updateByHash: updateLocalActivityByHash,
      refresh
    }),
    [items, refresh]
  );
}
