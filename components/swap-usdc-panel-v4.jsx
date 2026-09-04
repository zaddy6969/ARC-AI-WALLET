import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { createArcAppKitClient, formatAppKitError } from "../lib/arc-app-kit";
import {
  ARC_APP_KIT_READY,
  ARC_BRIDGE_DESTINATION,
  ARC_CIRBTC_ERC20_ADDRESS,
  ARC_MAINNET_REQUESTED,
  ARC_PORTFOLIO_TOKENS,
  MULTICHAIN_WALLET_CHAINS,
  arcTestnet
} from "../lib/arc-chain";
import { createWalletActionRecord } from "../lib/local-activity";
import { switchWalletNetwork } from "../lib/wallet-network";
import { FeatureIcon } from "./wallet-sidebar";

const TOKENS = ARC_PORTFOLIO_TOKENS.filter((token) => token.address).map((token) => token.symbol);
const DEFAULT_IN = TOKENS.includes("USDC") ? "USDC" : TOKENS[0] || "USDC";
const DEFAULT_OUT = TOKENS.find((token) => token !== DEFAULT_IN) || DEFAULT_IN;
const CONFIGURED = (!ARC_MAINNET_REQUESTED || ARC_APP_KIT_READY) && Boolean(ARC_BRIDGE_DESTINATION.appKitChain) && TOKENS.length >= 2;
const META = { USDC: { name: "USD Coin", mark: "$" }, EURC: { name: "Euro Coin", mark: "€" }, cirBTC: { name: "Circle Bitcoin", mark: "₿" } };

function cleanAmount(value) {
  const next = String(value || "").replace(/[^\d.]/g, "");
  const [whole, ...rest] = next.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 8)}` : whole;
}

function validAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function getAsset(walletSnapshot, symbol) {
  return (walletSnapshot?.assets || []).find((asset) => asset?.symbol === symbol) || null;
}

function tokenIdentifier(symbol) {
  return symbol === "cirBTC" ? ARC_CIRBTC_ERC20_ADDRESS : symbol;
}

function txHash(result) {
  if (result?.txHash) return result.txHash;
  return (result?.steps || []).find((step) => step?.txHash)?.txHash || "";
}

function explorerUrl(result, hash) {
  if (result?.explorerUrl) return result.explorerUrl;
  const fromStep = (result?.steps || []).find((step) => step?.explorerUrl)?.explorerUrl;
  if (fromStep) return fromStep;
  return hash && arcTestnet?.blockExplorers?.default?.url ? `${arcTestnet.blockExplorers.default.url}/tx/${hash}` : "";
}

function quoteRoot(estimate) {
  if (!estimate || typeof estimate !== "object") return estimate;
  if (estimate?.data?.estimatedOutput || estimate?.data?.amountOut || estimate?.data?.outputAmount) return estimate.data;
  if (estimate?.estimate?.estimatedOutput || estimate?.estimate?.amountOut) return estimate.estimate;
  return estimate;
}

function normalizeOutputAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim();
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return text;
  if (numeric === 0) return "0";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
    useGrouping: false
  }).format(numeric);
}

function outputQuote(estimate, tokenOut) {
  const root = quoteRoot(estimate);
  const direct = root?.estimatedOutput;
  if (direct && typeof direct === "object") {
    const amount = normalizeOutputAmount(direct.amount ?? direct.value ?? direct.formattedAmount);
    if (amount) return { amount, token: direct.token || direct.symbol || tokenOut };
  }
  if (typeof direct === "string" || typeof direct === "number") {
    const amount = normalizeOutputAmount(direct);
    if (amount) return { amount, token: tokenOut };
  }
  const fallback = root?.amountOut ?? root?.outputAmount ?? root?.toAmount ?? root?.buyAmount ?? root?.amount_out;
  if (fallback && typeof fallback === "object") {
    const amount = normalizeOutputAmount(fallback.amount ?? fallback.value ?? fallback.formattedAmount);
    if (amount) return { amount, token: fallback.token || fallback.symbol || tokenOut };
  }
  const amount = normalizeOutputAmount(fallback);
  return amount ? { amount, token: tokenOut } : { amount: "", token: tokenOut };
}

function feeRows(estimate) {
  const root = quoteRoot(estimate);
  const rows = Array.isArray(root?.fees) ? root.fees : [];
  return rows.map((fee, index) => ({ id: `${fee?.type || fee?.name || "fee"}-${index}`, label: fee?.name || fee?.type || "Fee", value: fee?.amount ? `${fee.amount}${fee.token ? ` ${fee.token}` : ""}` : fee?.formatted || "Included" }));
}

async function loadProxyKitKey() {
  const response = await fetch("/api/app-kit-config", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload?.hasKitKey && payload?.kitKey ? payload.kitKey : "";
}

function shouldUseProxy(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return text.includes("kit key") || text.includes("api key") || text.includes("unauthorized") || text.includes("401") || text.includes("stablecoinkit");
}

async function withCircleProxy(operation) {
  if (typeof window === "undefined") return operation();
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url;
    if (typeof requestUrl === "string" && requestUrl.startsWith("https://api.circle.com/v1/stablecoinKits/")) {
      const url = new URL(requestUrl);
      let body = typeof init?.body === "string" ? init.body : undefined;
      if (!body && typeof Request !== "undefined" && input instanceof Request) {
        try { body = await input.clone().text(); } catch { body = undefined; }
      }
      return originalFetch("/api/circle-stablecoin-proxy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: `${url.pathname}${url.search}`, method: init?.method || input?.method || "GET", body }) });
    }
    return originalFetch(input, init);
  };
  try { return await operation(); } finally { globalThis.fetch = originalFetch; }
}

async function runKitOperation(client, name, params, useProxyFirst = false) {
  const direct = () => client.kit[name](params);
  if (useProxyFirst) {
    const key = await loadProxyKitKey();
    if (!key) return direct();
    return withCircleProxy(() => client.kit[name]({ ...params, config: { ...params.config, kitKey: key } }));
  }
  try {
    return await direct();
  } catch (error) {
    if (!shouldUseProxy(error)) throw error;
    const key = await loadProxyKitKey();
    if (!key) throw error;
    return withCircleProxy(() => client.kit[name]({ ...params, config: { ...params.config, kitKey: key } }));
  }
}

export default function SwapUsdcPanelV4({ walletSnapshot, onActivitySaved, copilotAction }) {
  const { connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [tokenIn, setTokenIn] = useState(DEFAULT_IN);
  const [tokenOut, setTokenOut] = useState(DEFAULT_OUT);
  const [amount, setAmount] = useState("1");
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");

  const inputAsset = useMemo(() => getAsset(walletSnapshot, tokenIn), [walletSnapshot, tokenIn]);
  const outputAsset = useMemo(() => getAsset(walletSnapshot, tokenOut), [walletSnapshot, tokenOut]);
  const balanceKnown = inputAsset?.status === "ready";
  const balance = Number(inputAsset?.balanceValue || 0);
  const insufficient = balanceKnown && Number(amount || 0) > balance + 0.0000001;
  const quotedOutput = useMemo(() => outputQuote(quote, tokenOut), [quote, tokenOut]);
  const output = quotedOutput.amount ? `${quotedOutput.amount} ${quotedOutput.token || tokenOut}` : "";
  const fees = useMemo(() => feeRows(quote), [quote]);
  const busy = switching || status === "switching" || status === "swapping";
  const canReview = CONFIGURED && walletSnapshot?.isSignedIn && connector && validAmount(amount) && tokenIn !== tokenOut && !insufficient;
  const hasLiveQuote = Boolean(quote && quotedOutput.amount);

  const buildParams = (client) => ({
    from: { adapter: client.adapter, chain: ARC_BRIDGE_DESTINATION.appKitChain },
    tokenIn: tokenIdentifier(tokenIn),
    tokenOut: tokenIdentifier(tokenOut),
    amountIn: amount,
    config: { slippageBps }
  });

  useEffect(() => {
    setQuote(null);
    setResult(null);
    setError("");
    setQuoteError("");
    setStatus("idle");
  }, [tokenIn, tokenOut, amount, slippageBps]);

  useEffect(() => {
    if (copilotAction?.tool !== "prepare_swap") return;
    const args = copilotAction.args || {};
    const nextIn = TOKENS.includes(args.tokenIn) ? args.tokenIn : DEFAULT_IN;
    const nextOut = TOKENS.includes(args.tokenOut) && args.tokenOut !== nextIn ? args.tokenOut : TOKENS.find((item) => item !== nextIn) || DEFAULT_OUT;
    setTokenIn(nextIn);
    setTokenOut(nextOut);
    setAmount(cleanAmount(args.amount || "1"));
    setSlippageBps([50, 100, 300].includes(Number(args.slippageBps)) ? Number(args.slippageBps) : 100);
  }, [copilotAction]);

  useEffect(() => {
    if (!canReview || Number(chainId) !== Number(arcTestnet.id) || !connector?.getProvider) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setQuoteError("");
      setStatus((current) => current === "swapping" ? current : "quoting");
      try {
        const provider = await connector.getProvider();
        if (!provider?.request) throw new Error("Wallet provider is unavailable.");
        const client = await createArcAppKitClient(provider);
        const nextQuote = await runKitOperation(client, "estimateSwap", buildParams(client), true);
        if (cancelled) return;
        const parsed = outputQuote(nextQuote, tokenOut);
        if (!parsed.amount) throw new Error("Circle returned a quote without an output amount.");
        setQuote(nextQuote);
        setStatus("ready");
      } catch (nextError) {
        if (cancelled) return;
        setQuote(null);
        setStatus("idle");
        setQuoteError(formatAppKitError(nextError, "No live swap route is available for this pair right now."));
      }
    }, 550);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [amount, tokenIn, tokenOut, slippageBps, canReview, chainId, connector]);

  const prepare = async () => {
    if (!canReview) throw new Error(insufficient ? `Insufficient ${tokenIn} balance.` : "Enter a valid swap amount and pair.");
    const arcChain = MULTICHAIN_WALLET_CHAINS.find((item) => item.id === arcTestnet.id);
    if (!arcChain) throw new Error("Arc network configuration is unavailable.");
    setStatus("switching");
    const { provider } = await switchWalletNetwork({ connector, chain: arcChain, switchChainAsync });
    const client = await createArcAppKitClient(provider);
    return { client, params: buildParams(client) };
  };

  const handleReview = async () => {
    setError("");
    setQuoteError("");
    setResult(null);
    try {
      const { client, params } = await prepare();
      setStatus("quoting");
      const nextQuote = await runKitOperation(client, "estimateSwap", params, true);
      const parsed = outputQuote(nextQuote, tokenOut);
      if (!parsed.amount) throw new Error("Circle returned a quote without an output amount.");
      setQuote(nextQuote);
      setStatus("ready");
    } catch (nextError) {
      setQuote(null);
      setStatus("error");
      setError(formatAppKitError(nextError, "No live swap route is available for this pair right now."));
    }
  };

  const handleSwap = async () => {
    if (!hasLiveQuote || !canReview) return;
    setError("");
    setQuoteError("");
    try {
      const { client, params } = await prepare();
      setStatus("swapping");
      const nextResult = await runKitOperation(client, "swap", params, true);
      setResult(nextResult);
      const failed = nextResult?.state === "error";
      const hash = txHash(nextResult);
      const link = explorerUrl(nextResult, hash);
      const finalStatus = failed ? "Failed" : nextResult?.state === "success" ? "Confirmed" : "Submitted";
      setStatus(failed ? "error" : "success");
      onActivitySaved?.(createWalletActionRecord({
        walletAddress: walletSnapshot.address,
        type: "Swap",
        kind: "swap",
        amount: `${amount} ${tokenIn} → ${output || tokenOut}`,
        chain: arcTestnet.name,
        chainId: arcTestnet.id,
        sender: walletSnapshot.address,
        receiver: walletSnapshot.address,
        status: finalStatus,
        txHash: hash,
        explorerUrl: link,
        summary: `Swap ${amount} ${tokenIn} for ${output || tokenOut} on ${arcTestnet.name}`,
        metadata: { operation: "swap", tokenIn, tokenOut, slippageBps, estimateOutput: output }
      }));
      if (failed) setError("Circle returned a failed swap result. No success is being claimed.");
    } catch (nextError) {
      setStatus("error");
      setError(formatAppKitError(nextError, "Unable to submit this swap."));
    }
  };

  if (!walletSnapshot?.isSignedIn) return <section className="wallet-v4-transaction-card"><div className="wallet-v4-empty"><strong>Connect your wallet to swap.</strong></div></section>;

  const receiveValue = status === "quoting" ? "Getting quote…" : quotedOutput.amount || (quoteError ? "Unavailable" : "0.00");

  return (
    <section className="wallet-v4-transaction-card">
      <header className="wallet-v4-page-head">
        <div><span>Arc liquidity</span><h2>Swap</h2><p>Live output updates as you type. Review fees, then approve the actual transaction in your wallet.</p></div>
        <div className="wallet-v4-network-pill"><i />{arcTestnet.name}{Number(chainId) !== Number(arcTestnet.id) ? <small>Switches on review</small> : null}</div>
      </header>

      {!CONFIGURED ? <div className="wallet-v4-alert is-error"><strong>Swap configuration incomplete</strong><span>At least two supported Arc assets and Circle App Kit are required.</span></div> : null}

      <div className="wallet-v4-swap-shell">
        <div className="wallet-v4-token-box">
          <header><span>You pay</span><small>Balance {inputAsset?.balance || "syncing…"}</small></header>
          <div><input value={amount} onChange={(event) => setAmount(cleanAmount(event.target.value))} inputMode="decimal" placeholder="0.00" /><label><b>{META[tokenIn]?.mark}</b><select value={tokenIn} onChange={(event) => { const next = event.target.value; if (next === tokenOut) setTokenOut(tokenIn); setTokenIn(next); }}>{TOKENS.map((token) => <option key={token}>{token}</option>)}</select></label></div>
          {balanceKnown ? <button type="button" onClick={() => setAmount(String(balance))}>Max</button> : null}
        </div>

        <button type="button" className="wallet-v4-swap-arrow" onClick={() => { setTokenIn(tokenOut); setTokenOut(tokenIn); }} aria-label="Reverse swap pair"><FeatureIcon name="swap" /></button>

        <div className="wallet-v4-token-box is-output">
          <header><span>You receive</span><small>Balance {outputAsset?.balance || "syncing…"}</small></header>
          <div><strong className={status === "quoting" ? "is-loading" : quoteError ? "is-unavailable" : ""}>{receiveValue}</strong><label><b>{META[tokenOut]?.mark}</b><select value={tokenOut} onChange={(event) => { const next = event.target.value; if (next === tokenIn) setTokenIn(tokenOut); setTokenOut(next); }}>{TOKENS.map((token) => <option key={token}>{token}</option>)}</select></label></div>
          {hasLiveQuote ? <small className="wallet-v4-live-quote-label">Live Circle estimate · {quotedOutput.token || tokenOut}</small> : Number(chainId) !== Number(arcTestnet.id) && canReview ? <small className="wallet-v4-live-quote-label">Switch to Arc on review to load the quote.</small> : null}
        </div>
      </div>

      <div className="wallet-v4-slippage"><span>Max slippage</span>{[50, 100, 300].map((value) => <button key={value} type="button" className={slippageBps === value ? "is-active" : ""} onClick={() => setSlippageBps(value)}>{value / 100}%</button>)}</div>

      {insufficient ? <div className="wallet-v4-alert is-error"><strong>Insufficient {tokenIn}</strong><span>Available {inputAsset?.balance || "0"}</span></div> : null}
      {quoteError ? <div className="wallet-v4-alert is-error"><strong>Live quote unavailable</strong><span>{quoteError}</span></div> : null}

      {hasLiveQuote ? <div className="wallet-v4-review-card"><header><div><span>Swap review</span><strong>{amount} {tokenIn} → {output}</strong></div><span className="is-ready">Live quote</span></header><div className="wallet-v4-fees">{fees.length ? fees.map((row) => <div key={row.id}><span>{row.label}</span><strong>{row.value}</strong></div>) : <div><span>Slippage limit</span><strong>{slippageBps / 100}%</strong></div>}</div><p>Nothing is signed until you confirm the transaction in your connected wallet.</p></div> : null}

      {result ? <div className="wallet-v4-result"><div><span>Swap status</span><strong>{result?.state === "error" ? "Failed" : result?.state === "success" ? "Confirmed" : "Submitted"}</strong></div>{txHash(result) ? <div><span>Transaction</span><code>{txHash(result)}</code></div> : null}{explorerUrl(result, txHash(result)) ? <a href={explorerUrl(result, txHash(result))} target="_blank" rel="noreferrer">Open transaction ↗</a> : null}</div> : null}
      {error ? <div className="wallet-v4-alert is-error"><strong>Swap needs attention</strong><span>{error}</span></div> : null}

      <div className="wallet-v4-actions"><button type="button" className="wallet-v4-secondary" onClick={handleReview} disabled={!canReview || busy}>{status === "switching" ? "Switching network…" : status === "quoting" ? "Getting quote…" : hasLiveQuote ? "Refresh quote" : "Review swap"}</button><button type="button" className="wallet-v4-primary" onClick={handleSwap} disabled={!hasLiveQuote || !canReview || busy}>{status === "swapping" ? "Swapping…" : "Confirm in wallet"}</button></div>
    </section>
  );
}
