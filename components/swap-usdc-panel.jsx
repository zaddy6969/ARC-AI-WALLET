import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { createArcAppKitClient, formatAppKitError } from "../lib/arc-app-kit";
import { arcTestnet } from "../lib/arc-chain";
import { createWalletActionRecord } from "../lib/local-activity";

const SWAP_TOKENS = ["USDC", "EURC", "cirBTC"];
const SLIPPAGE_OPTIONS = [
  { label: "0.5%", value: 50 },
  { label: "1%", value: 100 },
  { label: "3%", value: 300 }
];

function normalizeAmount(value) {
  return String(value || "").replace(/[^\d.]/g, "");
}

function isValidAmount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function parseBalanceValue(balance) {
  const numeric = Number(String(balance || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function shortHash(hash) {
  if (!hash || hash.length < 14) {
    return hash || "";
  }

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function getSwapTxHash(result) {
  if (result?.txHash) {
    return result.txHash;
  }

  const stepWithHash = Array.isArray(result?.steps)
    ? result.steps.find((step) => step.txHash)
    : null;

  return stepWithHash?.txHash || "";
}

function getSwapExplorerUrl(result) {
  if (result?.explorerUrl) {
    return result.explorerUrl;
  }

  const stepWithUrl = Array.isArray(result?.steps)
    ? result.steps.find((step) => step.explorerUrl)
    : null;

  return stepWithUrl?.explorerUrl || "";
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

function getSwapFeeSummary(estimate) {
  const fees = Array.isArray(estimate?.fees) ? estimate.fees : [];

  if (!fees.length) {
    return "";
  }

  return fees
    .map((fee) => {
      if (fee?.amount && fee?.token) {
        return `${fee.amount} ${fee.token}`;
      }

      if (fee?.amount) {
        return String(fee.amount);
      }

      return fee?.type || "";
    })
    .filter(Boolean)
    .join(" + ");
}

async function loadKitKey() {
  const response = await fetch("/api/app-kit-config");
  const payload = await response.json();

  if (!response.ok || !payload?.hasKitKey || !payload?.kitKey) {
    throw new Error("Circle App Kit key is not configured.");
  }

  return payload.kitKey;
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

  const isSignedIn = walletSnapshot?.isSignedIn;
  const needsArcSwitch = isSignedIn && chainId !== arcTestnet.id;
  const amountLooksValid = isValidAmount(amountIn);
  const tokensValid = tokenIn !== tokenOut;
  const estimateOutput = getEstimatedOutput(estimate);
  const feeSummary = getSwapFeeSummary(estimate);
  const usdcBalance = parseBalanceValue(walletSnapshot?.usdcBalance);
  const hasEnoughUsdc = tokenIn !== "USDC" || Number(amountIn) <= usdcBalance;
  const txHash = useMemo(() => getSwapTxHash(swapResult), [swapResult]);
  const explorerUrl = useMemo(() => getSwapExplorerUrl(swapResult), [swapResult]);

  useEffect(() => {
    setEstimate(null);
    setSwapResult(null);
    setError("");
    setStatus("idle");
  }, [tokenIn, tokenOut, amountIn, slippageBps]);

  const ensureArcNetwork = async () => {
    if (chainId === arcTestnet.id || !switchChainAsync) {
      return;
    }

    await switchChainAsync({ chainId: arcTestnet.id });
  };

  const getSwapParams = async () => {
    if (!connector || !isSignedIn) {
      throw new Error("Connect your wallet before swapping.");
    }

    if (!amountLooksValid) {
      throw new Error("Enter a valid swap amount.");
    }

    if (!tokensValid) {
      throw new Error("Choose two different tokens.");
    }

    if (!hasEnoughUsdc) {
      throw new Error("Insufficient USDC balance for this swap.");
    }

    await ensureArcNetwork();

    const [provider, kitKey] = await Promise.all([
      connector.getProvider(),
      loadKitKey()
    ]);
    const client = await createArcAppKitClient(provider);

    return {
      client,
      params: {
        from: {
          adapter: client.adapter,
          chain: "Arc_Testnet"
        },
        tokenIn,
        tokenOut,
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
      const nextEstimate = await client.kit.estimateSwap(params);
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
      const result = await client.kit.swap(params);
      setSwapResult(result);
      setStatus(result?.state === "error" ? "error" : "success");

      const hash = getSwapTxHash(result);
      const url = getSwapExplorerUrl(result);

      onActivitySaved?.(
        createWalletActionRecord({
          walletAddress: walletSnapshot.address,
          type: "Swap",
          kind: "swap",
          amount: `${amountIn} ${tokenIn}`,
          chain: arcTestnet.name,
          status: result?.state === "error" ? "Failed" : "Confirmed",
          txHash: hash,
          explorerUrl: url,
          summary: `Swapped ${amountIn} ${tokenIn} for ${tokenOut} on Arc Testnet.`,
          metadata: {
            tokenIn,
            tokenOut,
            estimateOutput: estimateOutput || `${tokenOut} output confirmed in wallet`,
            slippageBps
          }
        })
      );
    } catch (nextError) {
      setStatus("error");
      setError(formatAppKitError(nextError, "Unable to complete swap."));
    }
  };

  return (
    <section className="card swap-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Swap</p>
          <h2>Swap tokens on Arc Testnet</h2>
        </div>
        <span className={status === "success" ? "status-badge status-good" : "status-badge"}>
          {status === "idle" ? "Arc App Kit" : status}
        </span>
      </div>

      {!isSignedIn ? (
        <div className="empty-state">
          <strong>Connect wallet to swap.</strong>
          <p>Real swaps require your connected wallet and Arc Testnet approval.</p>
        </div>
      ) : (
        <>
          <div className="swap-route-grid">
            <label className="composer-field">
              <span className="field-label">From token</span>
              <select
                value={tokenIn}
                onChange={(event) => setTokenIn(event.target.value)}
                className="composer-input"
              >
                {SWAP_TOKENS.map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </label>

            <label className="composer-field">
              <span className="field-label">To token</span>
              <select
                value={tokenOut}
                onChange={(event) => setTokenOut(event.target.value)}
                className="composer-input"
              >
                {SWAP_TOKENS.map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </label>

            <label className="composer-field swap-amount-field">
              <span className="field-label">Amount</span>
              <input
                value={amountIn}
                onChange={(event) => setAmountIn(normalizeAmount(event.target.value))}
                inputMode="decimal"
                placeholder="1.00"
                className="composer-input"
              />
            </label>

            <label className="composer-field swap-amount-field">
              <span className="field-label">Slippage tolerance</span>
              <select
                value={slippageBps}
                onChange={(event) => setSlippageBps(Number(event.target.value))}
                className="composer-input"
              >
                {SLIPPAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="empty-state empty-state-compact">
            <strong>Swap check</strong>
            <p>
              {needsArcSwitch
                ? "Switch to Arc Testnet before estimating the swap."
                : !tokensValid
                  ? "Choose two different tokens."
                  : !amountLooksValid
                    ? "Enter a valid amount."
                    : !hasEnoughUsdc
                      ? `Insufficient USDC balance. Available: ${walletSnapshot?.usdcBalance || "0 USDC"}.`
                    : estimateOutput
                      ? `Estimated output: ${estimateOutput}`
                      : "Estimate the live swap route before confirming in your wallet."}
            </p>
            {feeSummary ? <small>Estimated fees: {feeSummary}</small> : null}
          </div>

          <div className="composer-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={handleEstimate}
              disabled={
                !tokensValid ||
                !amountLooksValid ||
                !hasEnoughUsdc ||
                status === "estimating" ||
                status === "swapping" ||
                isSwitchingChain
              }
            >
              {status === "estimating" ? "Estimating..." : "Estimate Swap"}
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleSwap}
              disabled={
                !tokensValid ||
                !amountLooksValid ||
                !hasEnoughUsdc ||
                !estimate ||
                needsArcSwitch ||
                status === "estimating" ||
                status === "swapping" ||
                isSwitchingChain
              }
            >
              {status === "swapping" ? "Swapping..." : `Swap ${tokenIn}`}
            </button>
          </div>
        </>
      )}

      {error ? (
        <div className="empty-state empty-state-compact">
          <strong>Swap unavailable</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {swapResult ? (
        <div className="empty-state empty-state-compact">
          <strong>{status === "success" ? "Swap submitted" : "Swap result"}</strong>
          <p>
            {status === "success"
              ? `Your ${amountIn} ${tokenIn} swap was submitted on Arc Testnet.`
              : `${amountIn} ${tokenIn} to ${tokenOut}`}
          </p>
          {txHash ? <code>{shortHash(txHash)}</code> : null}
          {explorerUrl ? (
            <a href={explorerUrl} target="_blank" rel="noreferrer">
              View on ArcScan
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
