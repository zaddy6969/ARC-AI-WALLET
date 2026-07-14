import { erc20Abi, formatUnits, getAddress } from "viem";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useBlockNumber,
  useChainId,
  useDisconnect,
  usePublicClient
} from "wagmi";
import {
  ARC_PORTFOLIO_TOKENS,
  arcTestnet
} from "./arc-chain";

const RETRY_DELAYS_MS = [0, 600, 1400];
const BLOCK_REFRESH_THROTTLE_MS = 12000;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

function normalizeAddress(address) {
  if (!address) {
    return "";
  }

  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

function debugWalletLog(event, detail) {
  if (!IS_DEVELOPMENT) {
    return;
  }

  console.info("[arc-wallet-balance]", event, detail);
}

async function withRetry(task, label) {
  let lastError;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      if (attempt > 0) {
        debugWalletLog("retry", { label, attempt });
      }

      return await task();
    } catch (error) {
      lastError = error;
      debugWalletLog("request-failed", {
        label,
        attempt,
        message: error instanceof Error ? error.message : "Unknown error"
      });

      if (attempt < RETRY_DELAYS_MS.length - 1) {
        await sleep(RETRY_DELAYS_MS[attempt + 1]);
      }
    }
  }

  throw lastError;
}

function formatBalanceForDisplay(value, symbol = arcTestnet.nativeCurrency.symbol) {
  const numeric = Number(value || 0);

  if (!Number.isFinite(numeric)) {
    return `0.00 ${symbol}`;
  }

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: numeric >= 1000 ? 0 : 2,
    maximumFractionDigits: 4
  }).format(numeric)} ${symbol}`;
}

function createIdleAssets() {
  return ARC_PORTFOLIO_TOKENS.map((token) => ({
    ...token,
    balance: "",
    balanceValue: 0,
    valueUsd: 0,
    status: token.address ? "idle" : "not-configured"
  }));
}

export function useArcWalletSnapshot() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { data: blockNumber } = useBlockNumber({
    chainId: arcTestnet.id,
    watch: Boolean(address),
    query: {
      enabled: Boolean(address)
    }
  });
  const [usdcBalance, setUsdcBalance] = useState("");
  const [balanceStatus, setBalanceStatus] = useState("idle");
  const [balanceError, setBalanceError] = useState("");
  const [balanceSource, setBalanceSource] = useState("");
  const [assets, setAssets] = useState(createIdleAssets);
  const lastRefreshAtRef = useRef(0);

  const displayAddress = useMemo(
    () => normalizeAddress(address || ""),
    [address]
  );

  useEffect(() => {
    let cancelled = false;

    if (!displayAddress || !publicClient) {
      setUsdcBalance("");
      setBalanceStatus("idle");
      setBalanceError("");
      setBalanceSource("");
      setAssets(createIdleAssets());
      return undefined;
    }

    const now = Date.now();
    const shouldThrottleRefresh =
      typeof blockNumber === "bigint" &&
      balanceStatus === "ready" &&
      now - lastRefreshAtRef.current < BLOCK_REFRESH_THROTTLE_MS;

    if (shouldThrottleRefresh) {
      return undefined;
    }

    const loadUsdcBalance = async () => {
      try {
        setBalanceStatus((current) => (current === "ready" ? "refreshing" : "loading"));
        setBalanceError("");

        lastRefreshAtRef.current = Date.now();

        const configuredTokens = ARC_PORTFOLIO_TOKENS.filter((token) => token.address);
        const [nativeResult, tokenResults] = await Promise.allSettled([
          withRetry(
            () => publicClient.getBalance({ address: displayAddress }),
            "native-arc-balance"
          ),
          Promise.allSettled(
            configuredTokens.map((token) =>
              withRetry(
                () =>
                  publicClient.readContract({
                    address: token.address,
                    abi: erc20Abi,
                    functionName: "balanceOf",
                    args: [displayAddress]
                  }),
                `${token.symbol.toLowerCase()}-balance`
              )
            )
          )
        ]);

        if (cancelled) {
          return;
        }

        if (tokenResults.status === "fulfilled") {
          setAssets(
            ARC_PORTFOLIO_TOKENS.map((token) => {
              if (!token.address) {
                return {
                  ...token,
                  balance: "",
                  balanceValue: 0,
                  valueUsd: 0,
                  status: "not-configured"
                };
              }

              const resultIndex = configuredTokens.findIndex(
                (configuredToken) => configuredToken.symbol === token.symbol
              );
              const result = tokenResults.value[resultIndex];

              if (result?.status !== "fulfilled" || typeof result.value !== "bigint") {
                return {
                  ...token,
                  balance: "",
                  balanceValue: 0,
                  valueUsd: 0,
                  status: "error"
                };
              }

              const balanceValue = Number(formatUnits(result.value, token.decimals));

              return {
                ...token,
                balance: formatBalanceForDisplay(
                  formatUnits(result.value, token.decimals),
                  token.symbol
                ),
                balanceValue: Number.isFinite(balanceValue) ? balanceValue : 0,
                valueUsd:
                  Number.isFinite(balanceValue) && token.priceUsd
                    ? balanceValue * token.priceUsd
                    : 0,
                status: "ready"
              };
            })
          );
        }

        const usdcResult =
          tokenResults.status === "fulfilled"
            ? tokenResults.value[
                configuredTokens.findIndex((token) => token.symbol === "USDC")
              ]
            : null;

        if (usdcResult?.status === "fulfilled" && typeof usdcResult.value === "bigint") {
          setUsdcBalance(formatBalanceForDisplay(formatUnits(usdcResult.value, 6), "USDC"));
          setBalanceStatus("ready");
          setBalanceError("");
          setBalanceSource("erc20");
          return;
        }

        if (
          nativeResult.status === "fulfilled" &&
          typeof nativeResult.value === "bigint"
        ) {
          setUsdcBalance(
            formatBalanceForDisplay(
              formatUnits(nativeResult.value, arcTestnet.nativeCurrency.decimals),
              arcTestnet.nativeCurrency.symbol
            )
          );
          setBalanceStatus("ready");
          setBalanceError("");
          setBalanceSource("native");
          return;
        }

        setBalanceStatus(usdcBalance ? "ready" : "error");
        setBalanceError(
          usdcBalance
            ? ""
            : "Wallet balance is temporarily syncing. Please try again shortly."
        );
      } catch (error) {
        if (!cancelled) {
          debugWalletLog("fatal-error", {
            address: displayAddress,
            message: error instanceof Error ? error.message : "Unknown error"
          });

          setBalanceStatus(usdcBalance ? "ready" : "error");
          setBalanceError(
            usdcBalance
              ? ""
              : "Wallet balance is temporarily syncing. Please try again shortly."
          );
        }
      }
    };

    loadUsdcBalance();

    return () => {
      cancelled = true;
    };
  }, [displayAddress, publicClient, chainId, blockNumber]);

  return {
    address: displayAddress,
    rawAddress: address || "",
    isConnected,
    isSignedIn: isConnected && Boolean(displayAddress),
    onArc: chainId === arcTestnet.id,
    usdcBalance,
    balanceStatus,
    balanceError,
    balanceSource,
    assets,
    disconnectWallet: disconnect
  };
}
