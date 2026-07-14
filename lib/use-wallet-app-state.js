import { useCallback, useEffect, useMemo } from "react";
import {
  mapLiveActivityToFeedItem,
  mergeActivityFeedItems,
  useLocalActivityHistory
} from "./local-activity";
import { useArcWalletActivity } from "./use-arc-wallet-activity";

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function useWalletAppState(walletSnapshot) {
  const liveActivityState = useArcWalletActivity(walletSnapshot.address);
  const localActivityState = useLocalActivityHistory(walletSnapshot.address);

  const localItems = localActivityState.items;
  const updateLocalStatuses = localActivityState.updateStatuses;
  const updateLocalByHash = localActivityState.updateByHash;
  const saveLocalItem = localActivityState.save;
  const refreshLocalItems = localActivityState.refresh;
  const refreshLiveItems = liveActivityState.refresh;

  const pendingHashes = useMemo(
    () =>
      [...new Set(
        localItems
          .filter(
            (item) =>
              item.txHash &&
              !["confirmed", "failed"].includes(
                String(item.status || "").toLowerCase()
              )
          )
          .map((item) => item.txHash)
      )].slice(0, 25),
    [localItems]
  );
  const pendingHashKey = pendingHashes.join(",");

  useEffect(() => {
    const hashes = pendingHashKey ? pendingHashKey.split(",") : [];

    if (!hashes.length) {
      return undefined;
    }

    let cancelled = false;
    let activeController = null;
    let requestInFlight = false;

    const verifyStatuses = async () => {
      if (requestInFlight || document.hidden) {
        return;
      }

      requestInFlight = true;
      activeController = new AbortController();

      try {
        const response = await fetch("/api/transaction-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          signal: activeController.signal,
          body: JSON.stringify({ hashes })
        });
        const payload = await readJsonSafely(response);

        if (!cancelled && response.ok) {
          updateLocalStatuses(payload.statuses);
        }
      } catch (error) {
        if (error?.name !== "AbortError" && process.env.NODE_ENV !== "production") {
          console.info("[arc-wallet-activity]", "status-check-skipped");
        }
      } finally {
        requestInFlight = false;
      }
    };

    void verifyStatuses();
    const intervalId = window.setInterval(verifyStatuses, 20000);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void verifyStatuses();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pendingHashKey, updateLocalStatuses]);

  const mergedActivity = useMemo(
    () =>
      mergeActivityFeedItems(
        localItems,
        liveActivityState.activity.map(mapLiveActivityToFeedItem)
      ),
    [liveActivityState.activity, localItems]
  );

  const saveActivity = useCallback(
    (item) => {
      saveLocalItem(item);
      refreshLocalItems();
      refreshLiveItems();
    },
    [refreshLiveItems, refreshLocalItems, saveLocalItem]
  );

  const refreshActivity = useCallback(() => {
    refreshLocalItems();
    refreshLiveItems();
  }, [refreshLiveItems, refreshLocalItems]);

  const updateActivityByHash = useCallback(
    (txHash, patch) => {
      updateLocalByHash(txHash, patch);
      refreshLocalItems();
      refreshLiveItems();
    },
    [refreshLiveItems, refreshLocalItems, updateLocalByHash]
  );

  return {
    walletSnapshot,
    liveActivity: liveActivityState.activity,
    liveActivityStatus: liveActivityState.status,
    liveActivityError: liveActivityState.error,
    localActivity: localItems,
    saveLocalActivity: saveActivity,
    refreshLocalActivity: refreshLocalItems,
    updateLocalActivityByHash: updateActivityByHash,
    refreshActivity,
    mergedActivity
  };
}
