import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { createArcAppKitClient, formatAppKitError } from "../lib/arc-app-kit";
import {
  ARC_APP_KIT_READY,
  ARC_BRIDGE_DESTINATION,
  ARC_CIRBTC_ERC20_ADDRESS,
  ARC_MAINNET_REQUESTED,
  ARC_PORTFOLIO_TOKENS,
  arcTestnet
} from "../lib/arc-chain";
import { createWalletActionRecord } from "../lib/local-activity";
import { FeatureIcon } from "./wallet-sidebar";

const SWAP_TOKENS = ARC_PORTFOLIO_TOKENS.filter((token) => token.address).map((token) => token.symbol);
const DEFAULT_TOKEN_IN = SWAP_TOKENS.includes("USDC") ? "USDC" : SWAP_TOKENS[0] || "USDC";
const DEFAULT_TOKEN_OUT = SWAP_TOKENS.find((token) => token !== DEFAULT_TOKEN_IN) || DEFAULT_TOKEN_IN;
const SWAP_CONFIGURED = (!ARC_MAINNET_REQUESTED || ARC_APP_KIT_READY) && Boolean(ARC_BRIDGE_DESTINATION.appKitChain) && SWAP_TOKENS.length >= 2;
const TOKEN_META = {
  USDC: { name: "USD Coin", mark: "$" },
  EURC: { name: "Euro Coin", mark: "€" },
  cirBTC: { name: "Circle Bitcoin", mark: "₿" }
};

function normalizeAmount(value) {
  const next = String(value || "").replace(/[^\d.]/g, "");
  const [whole, ...rest] = next.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 8)}` : whole;
}

function validAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function getAsset(walletSnapshot, symbol) {
  return (walletSnapshot?.assets || []).find((item) => item?.symbol === symbol) || null;
}

function getTokenIdentifier(symbol) {
  return symbol === "cirBTC" ? ARC_CIRBTC_ERC20_ADDRESS : symbol;
}

function getEstimatedOutput(estimate, tokenOut) {
  if (estimate?.estimatedOutput?.amount) return `${estimate.estimatedOutput.amount} ${estimate.estimatedOutput.token || tokenOut}`;
  const value = estimate?.estimatedOutput || estimate?.amountOut || estimate?.outputAmount || estimate?.toAmount || "";
  return value ? `${value}` : "";
}

function getTxHash(result) {
  if (result?.txHash) return result.txHash;
  const step = Array.isArray(result?.steps) ? result.steps.find((item) => item?.txHash) : null;
  return step?.txHash || "";
}

function getExplorerUrl(result, hash) {
  if (result?.explorerUrl) return result.explorerUrl;
  const step = Array.isArray(result?.steps) ? result.steps.find((item) => item?.explorerUrl) : null;
  if (step?.explorerUrl) return step.explorerUrl;
  return hash && arcTestnet.blockExplorers?.default?.url ? `${arcTestnet.blockExplorers.default.url}/tx/${hash}` : "";
}

function feeRows(estimate) {
  return (Array.isArray(estimate?.fees) ? estimate.fees : []).map((fee, index) => ({
    id: `${fee?.type || fee?.name || "fee"}-${index}`,
    label: fee?.name || fee?.type || "Fee",
    value: fee?.amount ? `${fee.amount}${fee.token ? ` ${fee.token}` : ""}` : fee?.formatted || "Included"
  }));
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function verifyProviderChain(provider, expectedChainId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = await provider?.request?.({ method: "eth_chainId" });
    const chainId = typeof value === "string" ? Number.parseInt(value, 16) : Number(value);
    if (chainId === expectedChainId) return;
    await sleep(250 + attempt * 80);
  }
  throw new Error("Wallet did not switch to Arc.");
}

async function loadLegacyKitProxyToken() {
  const response = await fetch("/api/app-kit-config", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload?.hasKitKey && payload?.kitKey ? payload.kitKey : "";
}

async function proxyCircleRequest(operation) {
  if (typeof window === "undefined" || typeof globalThis.fetch !== "function") return operation();
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url;
    if (typeof requestUrl === "string" && requestUrl.startsWith("https://api.circle.com/v1/stablecoinKits/")) {
      const url = new URL(requestUrl);
      let body = typeof init?.body === "string" ? init.body : undefined;
      if (!body && typeof Request !== "undefined" && input instanceof Request) {
        try { body = await input.clone().text(); } catch { body = undefined; }
      }
      return originalFetch("/api/circle-stablecoin-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: `${url.pathname}${url.search}`, method: init?.method || input?.method || "GET", body })
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

function shouldTryLegacyProxy(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("kit key") || message.includes("api key") || message.includes("unauthorized") || message.includes("401") || message.includes("stablecoinkit");
}

export default function SwapUsdcPanel({ walletSnapshot, onActivitySaved, copilotAction }) {
  const { connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [tokenIn, setTokenIn] = useState(DEFAULT_TOKEN_IN);
  const [tokenOut, setTokenOut] = useState(DEFAULT_TOKEN_OUT);
  const [amountIn, setAmountIn] = useState("1");
  const [slippageBps, setSlippageBps] = useState(100);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [result, setResult] = useState(null);
  const [quoteMode, setQuoteMode] = useState("permissionless");

  const inputAsset = useMemo(() => getAsset(walletSnapshot, tokenIn), [walletSnapshot, tokenIn]);
  const outputAsset = useMemo(() => getAsset(walletSnapshot, tokenOut), [walletSnapshot, tokenOut]);
  const balanceKnown = inputAsset?.status === "ready";
  const balanceValue = Number(inputAsset?.balanceValue || 0);
  const enoughBalance = !balanceKnown || Number(amountIn || 0) <= balanceValue;
  const output = getEstimatedOutput(estimate, tokenOut);
  const fees = useMemo(() => feeRows(estimate), [estimate]);
  const busy = switching || status === "estimating" || status === "swapping";

  useEffect(() => {
    setEstimate(null);
    setResult(null);
    setError("");
    setStatus("idle");
  }, [tokenIn, tokenOut, amountIn, slippageBps]);

  useEffect(() => {
    if (copilotAction?.tool !== "prepare_swap") return;
    const args = copilotAction.args || {};
    const nextIn = SWAP_TOKENS.includes(args.tokenIn) ? args.tokenIn : DEFAULT_TOKEN_IN;
    const nextOut = SWAP_TOKENS.includes(args.tokenOut) && args.tokenOut !== nextIn
      ? args.tokenOut
      : SWAP_TOKENS.find((token) => token !== nextIn) || DEFAULT_TOKEN_OUT;
    setTokenIn(nextIn);
    setTokenOut(nextOut);
    setAmountIn(normalizeAmount(args.amount || "1"));
    setSlippageBps([50, 100, 300].includes(Number(args.slippageBps)) ? Number(args.slippageBps) : 100);
  }, [copilotAction]);

  const getClientAndParams = async () => {
    if (!SWAP_CONFIGURED) throw new Error("Swap support is not configured for this environment.");
    if (!walletSnapshot?.isSignedIn || !connector) throw new Error("Connect your wallet before swapping.");
    if (!validAmount(amountIn)) throw new Error("Enter a valid swap amount.");
    if (tokenIn === tokenOut) throw new Error("Choose two different assets.");
    if (!enoughBalance) throw new Error(`Insufficient ${tokenIn} balance.`);

    if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id });
    const provider = await connector.getProvider();
    if (!provider?.request) throw new Error("Wallet provider is unavailable.");
    await verifyProviderChain(provider, arcTestnet.id);
    const client = await createArcAppKitClient(provider);

    return {
      client,
      params: {
        from: { adapter: client.adapter, chain: ARC_BRIDGE_DESTINATION.appKitChain },
        tokenIn: getTokenIdentifier(tokenIn),
        tokenOut: getTokenIdentifier(tokenOut),
        amountIn,
        config: { slippageBps }
      }
    };
  };

  const runSwapOperation = async (operationName, client, params, preferredMode = "permissionless") => {
    const operation = () => client.kit[operationName](params);
    if (preferredMode === "legacy-proxy") {
      const kitKey = await loadLegacyKitProxyToken();
      if (!kitKey) throw new Error("Circle route authorization is unavailable.");
      return proxyCircleRequest(() => client.kit[operationName]({ ...params, config: { ...params.config, kitKey } }));
    }

    try {
      return await operation();
    } catch (firstError) {
      if (!shouldTryLegacyProxy(firstError)) throw firstError;
      const kitKey = await loadLegacyKitProxyToken();
      if (!kitKey) throw firstError;
      const response = await proxyCircleRequest(() => client.kit[operationName]({ ...params, config: { ...params.config, kitKey } }));
      setQuoteMode("legacy-proxy");
      return response;
    }
  };

  const handleReview = async () => {
    setStatus("estimating");
    setError("");
    setResult(null);
    try {
      const { client, params } = await getClientAndParams();
      const nextEstimate = await runSwapOperation("estimateSwap", client, params);
      setEstimate(nextEstimate);
      setStatus("ready");
    } catch (nextError) {
      setEstimate(null);
      setStatus("error");
      setError(formatAppKitError(nextError, "No live swap route is available for this pair right now."));
    }
  };

  const handleSwap = async () => {
    setStatus("swapping");
    setError("");
    try {
      const { client, params } = await getClientAndParams();
      const nextResult = await runSwapOperation("swap", client, params, quoteMode);
      setResult(nextResult);
      const failed = nextResult?.state === "error";
      const hash = getTxHash(nextResult);
      const explorerUrl = getExplorerUrl(nextResult, hash);
      const finalStatus = failed ? "Failed" : nextResult?.state === "success" ? "Confirmed" : "Submitted";
      setStatus(failed ? "error" : "success");

      onActivitySaved?.(
        createWalletActionRecord({
          walletAddress: walletSnapshot.address,
          type: "Swap",
          kind: "swap",
          amount: `${amountIn} ${tokenIn} → ${output || tokenOut}`,
          chain: arcTestnet.name,
          chainId: arcTestnet.id,
          status: finalStatus,
          sender: walletSnapshot.address,
          receiver: walletSnapshot.address,
          txHash: hash,
          explorerUrl,
          summary: `Swapped ${amountIn} ${tokenIn} for ${output || tokenOut} on ${arcTestnet.name}.`,
          metadata: { operation: "swap", tokenIn, tokenOut, slippageBps, estimateOutput: output }
        })
      );
    } catch (nextError) {
      setStatus("error");
      setError(formatAppKitError(nextError, "Unable to submit this swap."));
    }
  };

  if (!walletSnapshot?.isSignedIn) {
    return <section className="wallet-v3-page-card"><div className="wallet-v3-empty"><strong>Connect your wallet to swap.</strong></div></section>;
  }

  return (
    <section className="wallet-v3-page-card wallet-v3-swap-page">
      <header className="wallet-v3-page-head">
        <div><span className="wallet-v3-eyebrow">Arc swap</span><h2>Swap</h2><p>Get a live quote first. Nothing is signed until you confirm it in your wallet.</p></div>
        <span className="wallet-v3-network-badge"><i />{arcTestnet.name}</span>
      </header>

      {!SWAP_CONFIGURED ? (
        <div className="wallet-v3-inline-warning"><strong>Swap is not configured.</strong><span>Production chain and asset configuration is required.</span></div>
      ) : null}

      <div className="wallet-v3-swap-box">
        <div className="wallet-v3-token-field">
          <div className="wallet-v3-field-label"><span>You pay</span><small>Balance {inputAsset?.balance || "syncing…"}</small></div>
          <div className="wallet-v3-token-input">
            <input value={amountIn} onChange={(event) => setAmountIn(normalizeAmount(event.target.value))} inputMode="decimal" placeholder="0.00" />
            <label><span>{TOKEN_META[tokenIn]?.mark}</span><select value={tokenIn} onChange={(event) => { const next = event.target.value; if (next === tokenOut) setTokenOut(tokenIn); setTokenIn(next); }}>{SWAP_TOKENS.map((token) => <option key={token}>{token}</option>)}</select></label>
          </div>
          {balanceKnown ? <button type="button" className="wallet-v3-text-button" onClick={() => setAmountIn(String(balanceValue))}>Use max</button> : null}
        </div>

        <button type="button" className="wallet-v3-swap-direction" onClick={() => { setTokenIn(tokenOut); setTokenOut(tokenIn); }} aria-label="Reverse swap pair"><FeatureIcon name="swap" /></button>

        <div className="wallet-v3-token-field is-output">
          <div className="wallet-v3-field-label"><span>You receive</span><small>Balance {outputAsset?.balance || "syncing…"}</small></div>
          <div className="wallet-v3-token-input"><strong className={output ? "is-ready" : ""}>{output || "—"}</strong><label><span>{TOKEN_META[tokenOut]?.mark}</span><select value={tokenOut} onChange={(event) => { const next = event.target.value; if (next === tokenIn) setTokenIn(tokenOut); setTokenOut(next); }}>{SWAP_TOKENS.map((token) => <option key={token}>{token}</option>)}</select></label></div>
        </div>
      </div>

      <div className="wallet-v3-settings-row">
        <span>Slippage</span>
        {[50, 100, 300].map((value) => <button key={value} type="button" className={value === slippageBps ? "is-active" : ""} onClick={() => setSlippageBps(value)}>{value / 100}%</button>)}
      </div>

      {!enoughBalance ? <div className="wallet-v3-inline-warning"><strong>Insufficient {tokenIn}</strong><span>Available: {inputAsset?.balance || "0"}</span></div> : null}

      {estimate ? (
        <div className="wallet-v3-review-card">
          <div className="wallet-v3-review-head"><span>Review quote</span><strong>{amountIn} {tokenIn} → {output || tokenOut}</strong></div>
          <div className="wallet-v3-review-grid">
            <div><span>Network</span><strong>{arcTestnet.name}</strong></div>
            <div><span>Slippage</span><strong>{slippageBps / 100}%</strong></div>
            {fees.map((fee) => <div key={fee.id}><span>{fee.label}</span><strong>{fee.value}</strong></div>)}
          </div>
        </div>
      ) : null}

      {error ? <div className="wallet-v3-inline-warning is-error"><strong>Swap unavailable</strong><span>{error}</span></div> : null}
      {result && status === "success" ? <div className="wallet-v3-success"><strong>Swap submitted</strong><span>{getTxHash(result) ? `${getTxHash(result).slice(0, 10)}…${getTxHash(result).slice(-6)}` : "Track it in Activity."}</span></div> : null}

      <div className="wallet-v3-action-row">
        {estimate ? <button type="button" className="wallet-v3-secondary-button" onClick={() => { setEstimate(null); setResult(null); setStatus("idle"); setError(""); }} disabled={busy}>Edit</button> : null}
        <button
          type="button"
          className="wallet-v3-primary-button"
          onClick={estimate ? handleSwap : handleReview}
          disabled={!SWAP_CONFIGURED || !validAmount(amountIn) || tokenIn === tokenOut || !enoughBalance || busy}
        >
          {switching ? "Switching to Arc…" : status === "estimating" ? "Getting live quote…" : status === "swapping" ? "Confirm in wallet…" : estimate ? `Swap ${tokenIn}` : "Review swap"}
        </button>
      </div>
      <p className="wallet-v3-security-note">Self-custodial · Live Circle route · Wallet approval required</p>
    </section>
  );
}
