import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { createArcAppKitClient, formatAppKitError } from "../lib/arc-app-kit";
import { ARC_CIRBTC_ERC20_ADDRESS, arcTestnet } from "../lib/arc-chain";
import { createWalletActionRecord } from "../lib/local-activity";

const SWAP_TOKENS = ["USDC", "EURC", "cirBTC"];
const TOKEN_META = {
  USDC: { name: "USD Coin", mark: "$" },
  EURC: { name: "Euro Coin", mark: "€" },
  cirBTC: { name: "Circle Bitcoin", mark: "₿" }
};
const SLIPPAGE_OPTIONS = [
  { label: "0.5%", value: 50 },
  { label: "1%", value: 100 },
  { label: "3%", value: 300 }
];

function normalizeAmount(value) {
  const next = String(value || "").replace(/[^\d.]/g, "");
  const [whole, ...rest] = next.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 8)}` : whole;
}

function isValidAmount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function parseBalanceValue(balance) {
  const numeric = Number(String(balance || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function shortHash(hash) {
  if (!hash || hash.length < 14) return hash || "";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function getSwapTxHash(result) {
  if (result?.txHash) return result.txHash;
  const stepWithHash = Array.isArray(result?.steps)
    ? result.steps.find((step) => step.txHash)
    : null;
  return stepWithHash?.txHash || "";
}

function getSwapExplorerUrl(result) {
  if (result?.explorerUrl) return result.explorerUrl;
  const stepWithUrl = Array.isArray(result?.steps)
    ? result.steps.find((step) => step.explorerUrl)
    : null;
  return stepWithUrl?.explorerUrl || "";
}

function getSwapSender(result, fallbackAddress) {
  return result?.fromAddress || result?.sender || result?.from || fallbackAddress || "";
}

function getSwapReceiver(result, fallbackAddress) {
  return result?.toAddress || result?.receiver || result?.to || fallbackAddress || "";
}

function getEstimatedOutput(estimate) {
  if (estimate?.estimatedOutput?.amount) {
    return `${estimate.estimatedOutput.amount} ${estimate.estimatedOutput.token || ""}`.trim();
  }

  return (
    estimate?.estimatedOutput ||
    estimate?.amountOut ||
    estimate?.outputAmount ||
    estimate?.toAmount ||
    ""
  );
}

function getSwapFeeRows(estimate) {
  const fees = Array.isArray(estimate?.fees) ? estimate.fees : [];
  return fees.map((fee, index) => ({
    id: `${fee?.type || fee?.name || "fee"}-${index}`,
    label: fee?.name || fee?.type || "Swap fee",
    value: fee?.amount
      ? `${fee.amount}${fee.token ? ` ${fee.token}` : ""}`
      : fee?.formatted || "Included"
  }));
}

function getSwapTokenIdentifier(token) {
  return token === "cirBTC" ? ARC_CIRBTC_ERC20_ADDRESS : token;
}

function getAsset(walletSnapshot, symbol) {
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
  const asset = assets.find((item) => item?.symbol === symbol);

  if (asset) return asset;

  if (symbol === "USDC") {
    return {
      symbol,
      balance: walletSnapshot?.usdcBalance || "",
      balanceValue: parseBalanceValue(walletSnapshot?.usdcBalance),
      status: walletSnapshot?.balanceStatus === "ready" ? "ready" : walletSnapshot?.balanceStatus || "idle"
    };
  }

  return { symbol, balance: "", balanceValue: 0, status: "idle" };
}

function formatAvailable(asset, symbol) {
  if (asset?.status !== "ready") return "Syncing…";
  if (asset?.balance) return asset.balance;
  return `${Number(asset?.balanceValue || 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${symbol}`;
}

async function loadKitKey() {
  const response = await fetch("/api/app-kit-config");
  const payload = await response.json();

  if (!response.ok || !payload?.hasKitKey || !payload?.kitKey) {
    throw new Error("Circle App Kit key is not configured.");
  }

  return payload.kitKey;
}

async function readProxyRequestBody(input, init) {
  if (typeof init?.body === "string") return init.body;

  if (typeof URLSearchParams !== "undefined" && init?.body instanceof URLSearchParams) {
    return init.body.toString();
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      const body = await input.clone().text();
      return body || undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

async function withCircleStablecoinProxy(operation) {
  if (typeof window === "undefined" || typeof globalThis.fetch !== "function") {
    return operation();
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init = {}) => {
    const requestUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url;

    if (
      typeof requestUrl === "string" &&
      requestUrl.startsWith("https://api.circle.com/v1/stablecoinKits/")
    ) {
      const url = new URL(requestUrl);
      const method = init?.method || input?.method || "GET";
      const body = await readProxyRequestBody(input, init);

      return originalFetch("/api/circle-stablecoin-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `${url.pathname}${url.search}`,
          method,
          body
        })
      });
    }

    return originalFetch(input, init);
  };

  try {
    return await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export default function SwapUsdcPanel({ walletSnapshot, onActivitySaved }) {
  const { connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const [tokenIn, setTokenIn] = useState("USDC");
  const [tokenOut, setTokenOut] = useState("EURC");
  const [amountIn, setAmountIn] = useState("1.00");
  const [slippageBps, setSlippageBps] = useState(100);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [swapResult, setSwapResult] = useState(null);

  const isSignedIn = Boolean(walletSnapshot?.isSignedIn);
  const needsArcSwitch = isSignedIn && chainId !== arcTestnet.id;
  const amountLooksValid = isValidAmount(amountIn);
  const tokensValid = tokenIn !== tokenOut;
  const inputAsset = useMemo(() => getAsset(walletSnapshot, tokenIn), [walletSnapshot, tokenIn]);
  const outputAsset = useMemo(() => getAsset(walletSnapshot, tokenOut), [walletSnapshot, tokenOut]);
  const inputBalanceKnown = inputAsset?.status === "ready";
  const inputBalanceValue = Number(inputAsset?.balanceValue || 0);
  const hasEnoughBalance = !inputBalanceKnown || Number(amountIn || 0) <= inputBalanceValue;
  const estimateOutput = getEstimatedOutput(estimate);
  const feeRows = useMemo(() => getSwapFeeRows(estimate), [estimate]);
  const txHash = useMemo(() => getSwapTxHash(swapResult), [swapResult]);
  const explorerUrl = useMemo(() => getSwapExplorerUrl(swapResult), [swapResult]);
  const busy = isSwitchingChain || status === "estimating" || status === "swapping";

  useEffect(() => {
    setEstimate(null);
    setSwapResult(null);
    setError("");
    setStatus("idle");
  }, [tokenIn, tokenOut, amountIn, slippageBps]);

  const clearQuote = () => {
    setEstimate(null);
    setSwapResult(null);
    setError("");
    setStatus("idle");
  };

  const selectInputToken = (nextToken) => {
    if (nextToken === tokenOut) setTokenOut(tokenIn);
    setTokenIn(nextToken);
  };

  const selectOutputToken = (nextToken) => {
    if (nextToken === tokenIn) setTokenIn(tokenOut);
    setTokenOut(nextToken);
  };

  const reversePair = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
  };

  const useMax = () => {
    if (!inputBalanceKnown || inputBalanceValue <= 0) return;
    setAmountIn(String(inputBalanceValue));
  };

  const ensureArcNetwork = async () => {
    if (chainId === arcTestnet.id) return;
    if (!switchChainAsync) throw new Error("Wallet network switching is unavailable.");
    await switchChainAsync({ chainId: arcTestnet.id });
  };

  const getSwapParams = async () => {
    if (!connector || !isSignedIn) throw new Error("Connect your wallet before swapping.");
    if (!amountLooksValid) throw new Error("Enter a valid swap amount.");
    if (!tokensValid) throw new Error("Choose two different tokens.");
    if (!hasEnoughBalance) {
      throw new Error(`Insufficient ${tokenIn} balance for this swap.`);
    }

    await ensureArcNetwork();

    const [provider, kitKey] = await Promise.all([connector.getProvider(), loadKitKey()]);
    if (!provider) throw new Error("Wallet provider is unavailable.");
    const client = await createArcAppKitClient(provider);

    return {
      client,
      params: {
        from: {
          adapter: client.adapter,
          chain: "Arc_Testnet"
        },
        tokenIn: getSwapTokenIdentifier(tokenIn),
        tokenOut: getSwapTokenIdentifier(tokenOut),
        amountIn,
        config: {
          kitKey,
          slippageBps
        }
      }
    };
  };

  const handleEstimate = async () => {
    setStatus("estimating");
    setError("");
    setSwapResult(null);

    try {
      const { client, params } = await getSwapParams();
      const nextEstimate = await withCircleStablecoinProxy(() => client.kit.estimateSwap(params));
      setEstimate(nextEstimate);
      setStatus("ready");
    } catch (nextError) {
      setEstimate(null);
      setStatus("error");
      setError(formatAppKitError(nextError, "Unable to estimate swap."));
    }
  };

  const handleSwap = async () => {
    setStatus("swapping");
    setError("");

    try {
      const { client, params } = await getSwapParams();
      const result = await withCircleStablecoinProxy(() => client.kit.swap(params));
      setSwapResult(result);
      setStatus(result?.state === "error" ? "error" : "success");

      const hash = getSwapTxHash(result);
      const url = getSwapExplorerUrl(result) || (hash ? `${arcTestnet.blockExplorers.default.url}/tx/${hash}` : "");
      const outputAmount = result?.amountOut
        ? `${result.amountOut} ${tokenOut}`
        : estimateOutput || `${tokenOut} output confirmed in wallet`;

      onActivitySaved?.(
        createWalletActionRecord({
          walletAddress: walletSnapshot.address,
          type: "Swap",
          kind: "swap",
          amount: `${amountIn} ${tokenIn} -> ${outputAmount}`,
          chain: arcTestnet.name,
          status: result?.state === "error" ? "Failed" : "Confirmed",
          sender: getSwapSender(result, walletSnapshot.address),
          receiver: getSwapReceiver(result, walletSnapshot.address),
          txHash: hash,
          explorerUrl: url,
          summary: `Swapped ${amountIn} ${tokenIn} for ${outputAmount} on Arc Testnet.`,
          metadata: {
            tokenIn,
            tokenOut,
            estimateOutput: outputAmount,
            slippageBps
          }
        })
      );
    } catch (nextError) {
      setStatus("error");
      setError(formatAppKitError(nextError, "Unable to complete swap."));
    }
  };

  if (!isSignedIn) {
    return (
      <section className="card swap-panel swap-v2">
        <div className="swap-v2-head">
          <div><span className="swap-eyebrow">Arc Swap</span><h2>Swap tokens</h2></div>
          <span className="swap-network-pill">Arc Testnet</span>
        </div>
        <div className="swap-empty-state">
          <strong>Connect wallet to swap</strong>
          <p>Connect your wallet to use live Arc balances, quotes and wallet approval.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card swap-panel swap-v2">
      <div className="swap-v2-head">
        <div>
          <span className="swap-eyebrow">Arc Swap</span>
          <h2>Swap tokens</h2>
          <p>Choose a pair, review the live quote, then confirm in your wallet.</p>
        </div>
        <span className="swap-network-pill">Arc Testnet</span>
      </div>

      <div className="swap-v2-section swap-pair-section">
        <div className="swap-section-label">
          <span>1</span>
          <div><strong>Choose tokens</strong><small>Swap supported Arc assets</small></div>
        </div>

        <div className="swap-token-box">
          <div className="swap-token-box-head">
            <span>You pay</span>
            <span>Balance: <strong>{formatAvailable(inputAsset, tokenIn)}</strong></span>
          </div>
          <div className="swap-token-input-row">
            <input
              value={amountIn}
              onChange={(event) => setAmountIn(normalizeAmount(event.target.value))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`${tokenIn} amount`}
            />
            <div className="swap-token-select-wrap">
              <span className="swap-token-mark">{TOKEN_META[tokenIn]?.mark}</span>
              <select value={tokenIn} onChange={(event) => selectInputToken(event.target.value)} aria-label="Pay token">
                {SWAP_TOKENS.map((token) => <option key={token} value={token}>{token}</option>)}
              </select>
            </div>
          </div>
          <div className="swap-token-box-foot">
            <span>{TOKEN_META[tokenIn]?.name}</span>
            <button type="button" onClick={useMax} disabled={!inputBalanceKnown || inputBalanceValue <= 0}>MAX</button>
          </div>
        </div>

        <button type="button" className="swap-reverse-button" onClick={reversePair} disabled={busy} aria-label="Reverse swap pair">⇅</button>

        <div className="swap-token-box swap-token-box-output">
          <div className="swap-token-box-head">
            <span>You receive</span>
            <span>Balance: <strong>{formatAvailable(outputAsset, tokenOut)}</strong></span>
          </div>
          <div className="swap-token-input-row">
            <div className={`swap-output-value ${estimateOutput ? "is-ready" : ""}`}>{estimateOutput || "—"}</div>
            <div className="swap-token-select-wrap">
              <span className="swap-token-mark">{TOKEN_META[tokenOut]?.mark}</span>
              <select value={tokenOut} onChange={(event) => selectOutputToken(event.target.value)} aria-label="Receive token">
                {SWAP_TOKENS.map((token) => <option key={token} value={token}>{token}</option>)}
              </select>
            </div>
          </div>
          <div className="swap-token-box-foot"><span>{TOKEN_META[tokenOut]?.name}</span><span>Live quote</span></div>
        </div>
      </div>

      <div className="swap-v2-section">
        <div className="swap-section-label">
          <span>2</span>
          <div><strong>Swap settings</strong><small>Maximum price movement you accept</small></div>
        </div>
        <div className="swap-slippage-row">
          <span>Slippage tolerance</span>
          <div>
            {SLIPPAGE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={option.value === slippageBps ? "is-active" : ""}
                onClick={() => setSlippageBps(option.value)}
                disabled={busy}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {needsArcSwitch ? (
        <div className="swap-network-note">
          <span>↗</span>
          <div><strong>Arc network required</strong><p>Your wallet will switch to Arc Testnet when you review the swap.</p></div>
        </div>
      ) : null}

      {inputBalanceKnown && !hasEnoughBalance ? (
        <div className="swap-funding-warning">
          <span>!</span>
          <div>
            <strong>Not enough {tokenIn}</strong>
            <p>You entered {amountIn || "0"} {tokenIn}, but your available balance is {formatAvailable(inputAsset, tokenIn)}.</p>
          </div>
          <button type="button" onClick={useMax}>Use max</button>
        </div>
      ) : null}

      {estimate ? (
        <div className="swap-v2-section swap-quote-section">
          <div className="swap-section-label">
            <span>3</span>
            <div><strong>Review quote</strong><small>Live route from Circle App Kit</small></div>
          </div>
          <div className="swap-v2-quote">
            <div><span>Pay</span><strong>{amountIn} {tokenIn}</strong></div>
            <div className="swap-quote-output"><span>Estimated receive</span><strong>{estimateOutput || tokenOut}</strong></div>
            <div><span>Network</span><strong>Arc Testnet</strong></div>
            <div><span>Slippage</span><strong>{(slippageBps / 100).toFixed(slippageBps % 100 === 0 ? 0 : 1)}%</strong></div>
            {feeRows.map((fee) => <div key={fee.id}><span>{fee.label}</span><strong>{fee.value}</strong></div>)}
            <div><span>Wallet</span><strong>{shortAddress(walletSnapshot?.address)}</strong></div>
          </div>
        </div>
      ) : null}

      {error ? <p className="swap-v2-error" role="alert">{error}</p> : null}

      {swapResult ? (
        <div className="swap-v2-success">
          <div>
            <strong>{status === "success" ? "Swap submitted" : "Swap result"}</strong>
            <span>{amountIn} {tokenIn} → {estimateOutput || tokenOut}</span>
          </div>
          {txHash ? <code>{shortHash(txHash)}</code> : null}
          {explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer">View on ArcScan</a> : null}
        </div>
      ) : null}

      <div className="swap-v2-actions">
        {!estimate ? (
          <button
            type="button"
            className="button button-primary"
            onClick={handleEstimate}
            disabled={!tokensValid || !amountLooksValid || !hasEnoughBalance || busy}
          >
            {isSwitchingChain ? "Switching to Arc…" : status === "estimating" ? "Getting quote…" : "Review swap"}
          </button>
        ) : (
          <>
            <button type="button" className="button button-secondary" onClick={clearQuote} disabled={busy}>Edit</button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleSwap}
              disabled={!tokensValid || !amountLooksValid || !hasEnoughBalance || busy}
            >
              {status === "swapping" ? "Confirm in wallet…" : `Swap ${tokenIn}`}
            </button>
          </>
        )}
      </div>

      <div className="swap-v2-footnote">
        <span>Self-custodial</span><span>•</span><span>Wallet approval required</span><span>•</span><span>Arc Testnet</span>
      </div>
    </section>
  );
}
