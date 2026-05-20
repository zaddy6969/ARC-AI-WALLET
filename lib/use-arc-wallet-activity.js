import { useCallback, useEffect, useState } from "react";

const REFRESH_INTERVAL_MS = 15000;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function debugActivityLog(event, detail) {
  if (!IS_DEVELOPMENT) {
    return;
  }

  console.info("[arc-wallet-activity]", event, detail);
}

export function useArcWalletActivity(address) {
  const [activity, setActivity] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId;
    let activeController = null;

    if (!address) {
      setActivity([]);
      setStatus("idle");
      setError("");
      return undefined;
    }

    debugActivityLog("connected-wallet", { address });
    setActivity([]);
    setStatus("loading");
    setError("");

    const loadActivity = async () => {
      activeController?.abort();
      activeController = new AbortController();

      try {
        setStatus((current) =>
          current === "ready" ? "refreshing" : "loading"
        );
        setError("");

        const response = await fetch(
          `/api/wallet-activity?address=${encodeURIComponent(address)}`,
          {
            signal: activeController.signal
          }
        );
        const payload = await readJsonSafely(response);

        if (!response.ok) {
          throw new Error(
            payload.error ||
              "Activity temporarily unavailable. Please try again later."
          );
        }

        if (!cancelled) {
          const nextActivity = Array.isArray(payload.activity) ? payload.activity : [];
          debugActivityLog("rpc-fetch-complete", {
            address,
            fetchedCount: nextActivity.length
          });
          setActivity(nextActivity);
          setStatus("ready");
        }
      } catch (nextError) {
        if (nextError?.name === "AbortError") {
          return;
        }

        if (!cancelled) {
          debugActivityLog("rpc-fetch-error", {
            address,
            message:
              nextError instanceof Error ? nextError.message : "Unknown RPC error"
          });
          setActivity([]);
          setStatus("error");
          setError("Activity temporarily unavailable. Please try again later.");
        }
      }
    };

    loadActivity();
    intervalId = window.setInterval(loadActivity, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      activeController?.abort();

      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [address, refreshIndex]);

  return {
    activity,
    status,
    error,
    refresh
  };
}
