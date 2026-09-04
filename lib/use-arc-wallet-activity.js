import { useCallback, useEffect, useRef, useState } from "react";

const REFRESH_INTERVAL_MS = 30000;
const REQUEST_TIMEOUT_MS = 18000;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function debugActivityLog(event, detail) {
  if (!IS_DEVELOPMENT) return;
  console.info("[wallet-activity]", event, detail);
}

export function useArcWalletActivity(address) {
  const [activity, setActivity] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const lastAddressRef = useRef("");

  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId;
    let activeController = null;
    let requestInFlight = false;

    if (!address) {
      setActivity([]);
      setNetworks([]);
      setStatus("idle");
      setError("");
      return undefined;
    }

    const addressChanged = lastAddressRef.current !== address;
    lastAddressRef.current = address;
    if (addressChanged) {
      setActivity([]);
      setNetworks([]);
    }
    setStatus((current) => (current === "ready" ? "refreshing" : "loading"));
    setError("");

    const loadActivity = async () => {
      if (requestInFlight || document.hidden) return;

      requestInFlight = true;
      activeController = new AbortController();
      const timeoutId = window.setTimeout(
        () => activeController?.abort(),
        REQUEST_TIMEOUT_MS
      );

      try {
        setStatus((current) => current === "ready" ? "refreshing" : "loading");
        setError("");

        const response = await fetch(
          `/api/wallet-activity?address=${encodeURIComponent(address)}&limit=75`,
          { signal: activeController.signal }
        );
        const payload = await readJsonSafely(response);

        if (!response.ok) {
          throw new Error(payload.error || "Activity temporarily unavailable.");
        }

        if (!cancelled) {
          const nextActivity = Array.isArray(payload.activity) ? payload.activity : [];
          const nextNetworks = Array.isArray(payload.networks) ? payload.networks : [];
          debugActivityLog("multichain-fetch-complete", {
            address,
            fetchedCount: nextActivity.length,
            networks: nextNetworks
          });
          setActivity(nextActivity);
          setNetworks(nextNetworks);
          setStatus("ready");
        }
      } catch (nextError) {
        if (cancelled) return;
        debugActivityLog("multichain-fetch-error", {
          address,
          message: nextError instanceof Error ? nextError.message : "Unknown RPC error"
        });
        setStatus("error");
        setError(
          nextError?.name === "AbortError"
            ? "Multichain activity sync timed out. Local Lumexa actions are still available."
            : "Activity temporarily unavailable. Please try again later."
        );
      } finally {
        window.clearTimeout(timeoutId);
        requestInFlight = false;
      }
    };

    void loadActivity();
    intervalId = window.setInterval(loadActivity, REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (!document.hidden) void loadActivity();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      activeController?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [address, refreshIndex]);

  return {
    activity,
    networks,
    status,
    error,
    refresh
  };
}
