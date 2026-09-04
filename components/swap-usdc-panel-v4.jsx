import { useEffect, useMemo, useState } from "react";
import {
  createWalletClient,
  custom,
  erc20Abi,
  formatUnits,
  parseUnits
} from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain } from "wagmi";
import {
  ARC_MAINNET_REQUESTED,
  ARC_PORTFOLIO_TOKENS,
  MULTICHAIN_WALLET_CHAINS,
  arcTestnet
} from "../lib/arc-chain";
import { createWalletActionRecord } from "../lib/local-activity";
import { switchWalletNetwork } from "../lib/wallet-network";
import { FeatureIcon } from "./wallet-sidebar";

const ARC_SWAP_ROUTER = "0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9";
const ARC_SWAP_PAIR = "0xb3685D16AAa06361ED28377b1319136650Fa9A13";
const SUPPORTED_SYMBOLS = ["USDC", "EURC"];
const TOKEN_CONFIG = Object.fromEntries(
  ARC_PORTFOLIO_TOKENS
    .filter((token) => SUPPORTED_SYMBOLS.includes(token.symbol) && token.address)
    .map((token) => [token.symbol, token])
);
const TOKENS = SUPPORTED_SYMBOLS.filter((symbol) => TOKEN_CONFIG[symbol]);
const DEFAULT_IN = TOKENS.includes("USDC") ? "USDC" : TOKENS[0] || "USDC";
const DEFAULT_OUT = TOKENS.find((token) => token !== DEFAULT_IN) || DEFAULT_IN;
const CONFIGURED = !ARC_MAINNET_REQUESTED && TOKENS.length === 2 && Number(arcTestnet.id) === 5042002;
const META = {
  USDC: { name: "USD Coin", mark: "$" },
  EURC: { name: "Euro Coin", mark: "€" }
};

const ROUTER_ABI = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" }
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }]
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" }
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }]
  }
];

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

function displayTokenAmount(raw, token) {
  const numeric = Number(formatUnits(raw, token.decimals));
  if (!Number.isFinite(numeric)) return `0.00 ${token.symbol}`;
  return `${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  })} ${token.symbol}`;
}

function minAfterSlippage(amountOut, slippageBps) {
  return (amountOut * BigInt(10_000 - Number(slippageBps))) / 10_000n;
}

function readableSwapError(error) {
  const message = String(error?.shortMessage || error?.message || error || "Swap failed.");
  const normalized = message.toLowerCase();
  if (normalized.includes("user rejected") || normalized.includes("user denied") || normalized.includes("rejected the request")) return "Swap cancelled in your wallet.";
  if (normalized.includes("insufficient")) return "Insufficient token balance or Arc gas balance for this swap.";
  if (normalized.includes("allowance") || normalized.includes("approve")) return "Token approval failed. Confirm the approval request in your wallet and try again.";
  if (normalized.includes("insufficient_liquidity") || normalized.includes("uniswapv2library") || normalized.includes("execution reverted")) return "The Arc Testnet USDC/EURC pool cannot quote this amount right now. Try a smaller amount.";
  if (normalized.includes("did not switch") || normalized.includes("switch")) return "Your wallet did not switch to Arc Testnet. Switch to Arc in the top network selector and try again.";
  return message;
}

export default function SwapUsdcPanelV4({ walletSnapshot, onActivitySaved, copilotAction }) {
  const { connector } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [tokenIn, setTokenIn] = useState(DEFAULT_IN);
  const [tokenOut, setTokenOut] = useState(DEFAULT_OUT);
  const [amount, setAmount] = useState("1");
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const inputAsset = useMemo(() => getAsset(walletSnapshot, tokenIn), [walletSnapshot, tokenIn]);
  const outputAsset = useMemo(() => getAsset(walletSnapshot, tokenOut), [walletSnapshot, tokenOut]);
  const inputToken = TOKEN_CONFIG[tokenIn];
  const outputToken = TOKEN_CONFIG[tokenOut];
  const balanceKnown = inputAsset?.status === "ready";
  const balance = Number(inputAsset?.balanceValue || 0);
  const insufficient = balanceKnown && Number(amount || 0) > balance + 0.0000001;
  const busy = switching || ["switching", "quoting", "approving", "swapping"].includes(status);
  const canReview = CONFIGURED && walletSnapshot?.isSignedIn && connector && publicClient && validAmount(amount) && tokenIn !== tokenOut && !insufficient;

  useEffect(() => {
    setQuote(null);
    setResult(null);
    setError("");
    setNotice("");
    setStatus("idle");
  }, [tokenIn, tokenOut, amount, slippageBps]);

  useEffect(() => {
    if (copilotAction?.tool !== "prepare_swap") return;
    const args = copilotAction.args || {};
    const nextIn = TOKENS.includes(args.tokenIn) ? args.tokenIn : DEFAULT_IN;
    const nextOut = TOKENS.includes(args.tokenOut) && args.tokenOut !== nextIn
      ? args.tokenOut
      : TOKENS.find((item) => item !== nextIn) || DEFAULT_OUT;
    setTokenIn(nextIn);
    setTokenOut(nextOut);
    setAmount(cleanAmount(args.amount || "1"));
    setSlippageBps([50, 100, 300].includes(Number(args.slippageBps)) ? Number(args.slippageBps) : 100);
  }, [copilotAction]);

  const ensureArc = async () => {
    const arcChain = MULTICHAIN_WALLET_CHAINS.find((item) => Number(item.id) === Number(arcTestnet.id));
    if (!arcChain) throw new Error("Arc Testnet configuration is unavailable.");
    setStatus("switching");
    return switchWalletNetwork({ connector, chain: arcChain, switchChainAsync });
  };

  const readFreshQuote = async () => {
    if (!inputToken || !outputToken || !publicClient) throw new Error("Swap token configuration is unavailable.");
    const amountInRaw = parseUnits(amount, inputToken.decimals);
    const amounts = await publicClient.readContract({
      address: ARC_SWAP_ROUTER,
      abi: ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountInRaw, [inputToken.address, outputToken.address]]
    });
    const amountOutRaw = Array.isArray(amounts) ? amounts[amounts.length - 1] : 0n;
    if (!amountOutRaw || amountOutRaw <= 0n) throw new Error("No live Arc Testnet liquidity quote is available for this amount.");
    const minimumOutRaw = minAfterSlippage(amountOutRaw, slippageBps);
    return {
      amountInRaw,
      amountOutRaw,
      minimumOutRaw,
      outputDisplay: displayTokenAmount(amountOutRaw, outputToken),
      minimumDisplay: displayTokenAmount(minimumOutRaw, outputToken),
      quotedAt: Date.now()
    };
  };

  const handleReview = async () => {
    if (!canReview) return;
    setError("");
    setNotice("");
    setResult(null);
    try {
      await ensureArc();
      setStatus("quoting");
      const nextQuote = await readFreshQuote();
      setQuote(nextQuote);
      setStatus("ready");
    } catch (nextError) {
      setQuote(null);
      setStatus("error");
      setError(readableSwapError(nextError));
    }
  };

  const handleSwap = async () => {
    if (!quote || !canReview || !inputToken || !outputToken) return;
    setError("");
    setNotice("");
    try {
      const { provider } = await ensureArc();
      const freshQuote = await readFreshQuote();
      setQuote(freshQuote);
      const walletClient = createWalletClient({ chain: arcTestnet, transport: custom(provider) });
      const account = walletSnapshot.address;
      const allowance = await publicClient.readContract({
        address: inputToken.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, ARC_SWAP_ROUTER]
      });

      if (allowance < freshQuote.amountInRaw) {
        setStatus("approving");
        setNotice(`Approve exactly ${amount} ${tokenIn} for the Arc Testnet swap router in your wallet.`);
        const approveHash = await walletClient.writeContract({
          account,
          address: inputToken.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [ARC_SWAP_ROUTER, freshQuote.amountInRaw],
          gas: 100_000n
        });
        const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        if (approveReceipt.status !== "success") throw new Error("Token approval reverted on Arc Testnet.");
      }

      setStatus("swapping");
      setNotice("Approval ready. Confirm the swap transaction in your wallet.");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
      const hash = await walletClient.writeContract({
        account,
        address: ARC_SWAP_ROUTER,
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForTokens",
        args: [
          freshQuote.amountInRaw,
          freshQuote.minimumOutRaw,
          [inputToken.address, outputToken.address],
          account,
          deadline
        ],
        gas: 300_000n
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Swap transaction reverted on Arc Testnet.");

      const link = `${arcTestnet.blockExplorers.default.url}/tx/${hash}`;
      const confirmed = {
        state: "success",
        txHash: hash,
        explorerUrl: link,
        output: freshQuote.outputDisplay
      };
      setResult(confirmed);
      setStatus("success");
      setNotice("Swap confirmed on Arc Testnet. Balances and Activity will refresh from chain data.");
      onActivitySaved?.(createWalletActionRecord({
        walletAddress: account,
        type: "Swap",
        kind: "swap",
        amount: `${amount} ${tokenIn} → ${freshQuote.outputDisplay}`,
        chain: arcTestnet.name,
        chainId: arcTestnet.id,
        sender: account,
        receiver: account,
        status: "Confirmed",
        txHash: hash,
        explorerUrl: link,
        summary: `Swapped ${amount} ${tokenIn} for ${freshQuote.outputDisplay} on Arc Testnet`,
        metadata: {
          operation: "swap",
          provider: "Arc Swap Uniswap V2 testnet pool",
          router: ARC_SWAP_ROUTER,
          pair: ARC_SWAP_PAIR,
          tokenIn,
          tokenOut,
          slippageBps,
          estimateOutput: freshQuote.outputDisplay
        }
      }));
    } catch (nextError) {
      setStatus("error");
      setNotice("");
      setError(readableSwapError(nextError));
    }
  };

  if (!walletSnapshot?.isSignedIn) {
    return <section className="wallet-v4-transaction-card"><div className="wallet-v4-empty"><strong>Connect your wallet to swap.</strong></div></section>;
  }

  return (
    <section className="wallet-v4-transaction-card">
      <header className="wallet-v4-page-head">
        <div><span>Self-custodial Arc Testnet liquidity</span><h2>Swap</h2><p>Review an onchain USDC/EURC quote first, then approve the exact input amount and sign the swap directly from your connected wallet.</p></div>
        <div className="wallet-v4-network-pill"><i />{arcTestnet.name}{Number(chainId) !== Number(arcTestnet.id) ? <small>Switches on review</small> : null}</div>
      </header>

      {!CONFIGURED ? <div className="wallet-v4-alert is-error"><strong>Swap route unavailable</strong><span>This self-custodial testnet route is enabled only on Arc Testnet. It is never reused automatically on mainnet.</span></div> : null}

      <div className="wallet-v4-swap-shell">
        <div className="wallet-v4-token-box">
          <header><span>You pay</span><small>Balance {inputAsset?.balance || "syncing…"}</small></header>
          <div><input value={amount} onChange={(event) => setAmount(cleanAmount(event.target.value))} inputMode="decimal" placeholder="0.00" /><label><b>{META[tokenIn]?.mark}</b><select value={tokenIn} onChange={(event) => { const next = event.target.value; if (next === tokenOut) setTokenOut(tokenIn); setTokenIn(next); }}>{TOKENS.map((token) => <option key={token}>{token}</option>)}</select></label></div>
          {balanceKnown ? <button type="button" onClick={() => setAmount(String(balance))}>Max</button> : null}
        </div>

        <button type="button" className="wallet-v4-swap-arrow" disabled={busy} onClick={() => { setTokenIn(tokenOut); setTokenOut(tokenIn); }} aria-label="Reverse swap pair"><FeatureIcon name="swap" /></button>

        <div className="wallet-v4-token-box is-output">
          <header><span>You receive</span><small>Balance {outputAsset?.balance || "syncing…"}</small></header>
          <div><strong>{quote?.outputDisplay || "—"}</strong><label><b>{META[tokenOut]?.mark}</b><select value={tokenOut} onChange={(event) => { const next = event.target.value; if (next === tokenIn) setTokenIn(tokenOut); setTokenOut(next); }}>{TOKENS.map((token) => <option key={token}>{token}</option>)}</select></label></div>
        </div>
      </div>

      <div className="wallet-v4-slippage"><span>Max slippage</span>{[50, 100, 300].map((value) => <button key={value} type="button" disabled={busy} className={slippageBps === value ? "is-active" : ""} onClick={() => setSlippageBps(value)}>{value / 100}%</button>)}</div>

      {insufficient ? <div className="wallet-v4-alert is-error"><strong>Insufficient {tokenIn}</strong><span>Available {inputAsset?.balance || "0"}</span></div> : null}

      {quote ? <div className="wallet-v4-review-card"><header><div><span>Swap review</span><strong>{amount} {tokenIn} → {quote.outputDisplay}</strong></div><span className="is-ready">Onchain quote</span></header><div className="wallet-v4-fees"><div><span>Minimum received</span><strong>{quote.minimumDisplay}</strong></div><div><span>Slippage limit</span><strong>{slippageBps / 100}%</strong></div><div><span>Route</span><strong>Arc Testnet USDC/EURC AMM</strong></div></div><p>The route is testnet-only and self-custodial. Your wallet signs every approval and swap transaction.</p></div> : null}

      {result ? <div className="wallet-v4-result"><div><span>Swap status</span><strong>Confirmed</strong></div><div><span>Transaction</span><code>{result.txHash}</code></div><a href={result.explorerUrl} target="_blank" rel="noreferrer">Open transaction ↗</a></div> : null}
      {error ? <div className="wallet-v4-alert is-error"><strong>Swap needs attention</strong><span>{error}</span></div> : null}
      {notice ? <div className="wallet-v4-alert"><strong>Swap update</strong><span>{notice}</span></div> : null}

      <div className="wallet-v4-actions"><button type="button" className="wallet-v4-secondary" onClick={handleReview} disabled={!canReview || busy}>{status === "quoting" || status === "switching" ? "Preparing quote…" : quote ? "Refresh quote" : "Review swap"}</button><button type="button" className="wallet-v4-primary" onClick={handleSwap} disabled={!quote || !canReview || busy}>{status === "approving" ? "Approving…" : status === "swapping" ? "Swapping…" : "Confirm in wallet"}</button></div>
    </section>
  );
}
