import { useCallback, useEffect, useMemo } from "react";
import {
  mapLiveActivityToFeedItem,
  mergeActivityFeedItems,
  useLocalActivityHistory
} from "./local-activity";
import { useArcWalletActivity } from "./use-arc-wallet-activity";
import { useArcWalletSnapshot } from "./use-arc-wallet-snapshot";

export function useWalletAppState() {
  const walletSnapshot = useArcWalletSnapshot();
  const liveActivityState = useArcWalletActivity(walletSnapshot.address);
  const localActivityState = useLocalActivityHistory(walletSnapshot.address);

  const localItems = localActivityState.items;
  const updateLocalStatuses = localActivityState.updateStatuses;
  const updateLocalByHash = localActivityState.updateByHash;
  const saveLocalItem = localActivityState.save;
  const refreshLocalItems = localActivityState.refresh;
  const refreshLiveItems = liveActivityState.refresh;

  useEffect(() => {
    const hashes = localItems
      .map((item) => item.txHash)
      .filter(Boolean)
      .slice(0, 25);

    if (!hashes.length) {
      return undefined;
    }

    let cancelled = false;

    const verifyStatuses = async () => {
      try {
        const response = await fetch("/api/transaction-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ hashes })
        });
        const payload = await response.json();

        if (!cancelled && response.ok) {
          updateLocalStatuses(payload.statuses);
        }
      } catch {}
    };

    void verifyStatuses();
    const intervalId = window.setInterval(verifyStatuses, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [localItems, updateLocalStatuses]);

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
