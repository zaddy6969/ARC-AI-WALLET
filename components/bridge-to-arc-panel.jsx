import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain } from "wagmi";
import { formatUnits } from "viem";
import { getPrimaryExplorerUrl, getPrimaryTxHash } from "../lib/arc-app-kit";
import { ARC_BRIDGE_DESTINATION, ARC_BRIDGE_SOURCE_OPTIONS } from "../lib/arc-chain";
import {
  createArcBridgeClient,
  formatBridgeError,
  summarizeBridgeFees
} from "../lib/arc-bridge";
import { createWalletActionRecord } from "../lib/local-activity";

const SOURCE_USDC_ADDRESSES = {
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
};

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
];

function cleanAmount(value) {
  const next = String(value || "").replace(/[^\d.]/g, "");
  const [whole, ...rest] = next.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 6)}` : whole;
}

function validAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function sourceFromId(chainId) {
  return ARC_BRIDGE_SOURCE_OPTIONS.find((item) => item.id === Number(chainId)) || ARC_BRIDGE_SOURCE_OPTIONS[0];
}

function parseUsdcFees(rows) {
  return rows.reduce((total, row) => {
    const value = String(row?.value || "");
    if (!/USDC/i.test(value)) return total;
    const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return total + (match ? Number(match[0]) : 0);
  }, 0);
}

function formatNumber(value, maximumFractionDigits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0
  }).format(number);
}

async function verifyProviderChain(provider, expectedChainId) {
  if (!provider?.request) return;
  const value = await provider.request({ method: "eth_chainId" });
  const active = typeof value === "string" ? Number.parseInt(value, 16) : Number(value);
  if (active !== expectedChainId) {
    throw new Error("Wallet did not switch to the selected source network.");
  }
}

export default function BridgeToArcPanel({ walletSnapshot, onActivitySaved }) {
  const { connector } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const connectedAddress = walletSnapshot?.address || "";
  const supportedCurrentSource = ARC_BRIDGE_SOURCE_OPTIONS.some((item) => item.id === currentChainId);

  const [sourceChainId, setSourceChainId] = useState(
    supportedCurrentSource ? currentChainId : ARC_BRIDGE_SOURCE_OPTIONS[0].id
  );
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("idle");
  const [estimate, setEstimate] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [sourceBalances, setSourceBalances] = useState({
    status: "idle",
    usdc: "",
    gas: "",
    error: ""
  });

  const sourceChain = useMemo(() => sourceFromId(sourceChainId), [sourceChainId]);
  const sourceUsdcAddress = SOURCE_USDC_ADDRESSES[sourceChain.id];
  const sourcePublicClient = usePublicClient({ chainId: sourceChain.id });
  const feeRows = useMemo(() => summarizeBridgeFees(estimate).slice(0, 6), [estimate]);
  const quoteUsdcFees = useMemo(() => parseUsdcFees(feeRows), [feeRows]);
  const txHash = useMemo(() => getPrimaryTxHash(result), [result]);
  const explorerUrl = useMemo(() => getPrimaryExplorerUrl(result), [result]);

  const amountNumber = Number(amount || 0);
  const sourceUsdcNumber = Number(sourceBalances.usdc || 0);
  const sourceGasNumber = Number(sourceBalances.gas || 0);
  const balancesReady = sourceBalances.status === "ready";
  const walletOnSelectedSource = currentChainId === sourceChain.id;
  const canContinue = Boolean(connector && connectedAddress && validAmount(amount));
  const amountExceedsBalance = balancesReady && amountNumber > sourceUsdcNumber + 0.0000001;
  const requiredUsdc = amountNumber + quoteUsdcFees;
  const quotedUsdcShort = Boolean(
    estimate && balancesReady && sourceUsdcNumber + 0.0000001 < requiredUsdc
  );
  const sourceGasMissing = Boolean(estimate && balancesReady && sourceGasNumber <= 0);
  const safeMax = estimate
    ? Math.max(0, sourceUsdcNumber - quoteUsdcFees - 0.000001)
    : Math.max(0, sourceUsdcNumber);

  // Follow an actual wallet network change, but do not overwrite a source chain
  // that the user selected in this panel. The previous effect also depended on
  // bridge status, which caused a manual Base/Ethereum selection to snap back.
  useEffect(() => {
    if (ARC_BRIDGE_SOURCE_OPTIONS.some((item) => item.id === currentChainId)) {
      setSourceChainId(currentChainId);
    }
  }, [currentChainId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSourceBalances() {
      if (!connectedAddress || !sourcePublicClient || !sourceUsdcAddress) {
        setSourceBalances({ status: "idle", usdc: "", gas: "", error: "" });
        return;
      }

      setSourceBalances((current) => ({ ...current, status: "loading", error: "" }));

      try {
        const [usdcRaw, gasRaw] = await Promise.all([
          sourcePublicClient.readContract({
            address: sourceUsdcAddress,
            abi: ERC20_BALANCE_ABI,
            functionName: "balanceOf",
            args: [connectedAddress]
          }),
          sourcePublicClient.getBalance({ address: connectedAddress })
        ]);

        if (cancelled) return;
        setSourceBalances({
          status: "ready",
          usdc: formatUnits(usdcRaw, 6),
          gas: formatUnits(gasRaw, 18),
          error: ""
        });
      } catch (nextError) {
        if (cancelled) return;
        setSourceBalances({
          status: "error",
          usdc: "",
          gas: "",
          error: nextError instanceof Error ? nextError.message : "Balance check unavailable."
        });
      }
    }

    void loadSourceBalances();
    return () => {
      cancelled = true;
    };
  }, [connectedAddress, sourceChain.id, sourcePublicClient, sourceUsdcAddress]);

  const resetQuote = () => {
    setEstimate(null);
    setResult(null);
    setError("");
    setStatus("idle");
  };

  const selectSource = (chainId) => {
    if (isSwitching || ["switching", "estimating", "bridging"].includes(status)) return;
    setSourceChainId(chainId);
    resetQuote();
  };

  const getReadyProvider = async () => {
    if (!connector) throw new Error("Connect your wallet first.");

    if (currentChainId !== sourceChain.id) {
      setStatus("switching");
      await switchChainAsync({ chainId: sourceChain.id });
    }

    const provider = await connector.getProvider();
    if (!provider) throw new Error("Wallet provider is unavailable.");
    await verifyProviderChain(provider, sourceChain.id);
    return provider;
  };

  const createQuote = async () => {
    if (!canContinue) throw new Error("Enter a valid USDC amount.");
    if (amountExceedsBalance) {
      throw new Error(`Insufficient USDC. Available on ${sourceChain.shortName}: ${formatNumber(sourceUsdcNumber)} USDC.`);
    }

    const provider = await getReadyProvider();
    setStatus("estimating");
    const bridgeClient = await createArcBridgeClient(provider);
    const nextEstimate = await bridgeClient.kit.estimateBridge({
      from: {
        adapter: bridgeClient.adapter,
        chain: sourceChain.appKitChain
      },
      to: {
        adapter: bridgeClient.adapter,
        chain: ARC_BRIDGE_DESTINATION.appKitChain,
        recipientAddress: connectedAddress
      },
      amount
    });

    setEstimate(nextEstimate);
    setStatus("ready");
    return { bridgeClient, provider };
  };

  const handleReview = async () => {
    setError("");
    setResult(null);

    try {
      await createQuote();
    } catch (nextError) {
      setEstimate(null);
      setStatus("error");
      setError(formatBridgeError(nextError));
    }
  };

  const handleBridge = async () => {
    if (!canContinue || quotedUsdcShort || sourceGasMissing) return;

    setError("");
    setResult(null);

    try {
      let bridgeClient;

      if (!estimate) {
        ({ bridgeClient } = await createQuote());
      } else {
        const provider = await getReadyProvider();
        bridgeClient = await createArcBridgeClient(provider);
      }

      setStatus("bridging");
      const nextResult = await bridgeClient.kit.bridge({
        from: {
          adapter: bridgeClient.adapter,
          chain: sourceChain.appKitChain
        },
        to: {
          adapter: bridgeClient.adapter,
          chain: ARC_BRIDGE_DESTINATION.appKitChain,
          recipientAddress: connectedAddress
        },
        amount
      });

      setResult(nextResult);

      if (nextResult?.state === "error") {
        setStatus("error");
        setError("Bridge could not be completed. Check the failed step and source balances, then try again.");
        return;
      }

      setStatus(nextResult?.state === "success" ? "success" : "submitted");
      onActivitySaved?.(
        createWalletActionRecord({
          walletAddress: connectedAddress,
          type: "Bridge",
          amount: `${amount} USDC`,
          chain: `${sourceChain.name} -> ${ARC_BRIDGE_DESTINATION.name}`,
          recipient: connectedAddress,
          status: nextResult?.state === "success" ? "Confirmed" : "Submitted",
          txHash: getPrimaryTxHash(nextResult),
          explorerUrl: getPrimaryExplorerUrl(nextResult),
          summary: `Bridged ${amount} USDC from ${sourceChain.name} to Arc Testnet.`
        })
      );
    } catch (nextError) {
      setStatus("error");
      setError(formatBridgeError(nextError));
    }
  };

  const useSafeMax = () => {
    if (!balancesReady || safeMax <= 0) return;
    setAmount(safeMax.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""));
    if (estimate) {
      setEstimate(null);
      setStatus("idle");
    }
    setError("");
  };

  const busy = isSwitching || ["switching", "estimating", "bridging"].includes(status);
  const fundingMessage = amountExceedsBalance
    ? `Amount exceeds your ${sourceChain.shortName} USDC balance.`
    : quotedUsdcShort
      ? `This bridge needs about ${formatNumber(requiredUsdc)} USDC including quoted fees. You have ${formatNumber(sourceUsdcNumber)} USDC.`
      : sourceGasMissing
        ? `You need ${sourceChain.gasToken} on ${sourceChain.shortName} to pay source-chain gas.`
        : "";

  return (
    <section className="bridge-wallet-card wallet-page-card bridge-v2">
      <div className="bridge-wallet-head">
        <div>
          <span className="bridge-eyebrow">Cross-chain USDC</span>
          <h2>Bridge to Arc</h2>
          <p>Choose a source network, review the quote, then confirm in your wallet.</p>
        </div>
        <span className="bridge-destination-pill">Arc Testnet</span>
      </div>

      <div className="bridge-v2-section">
        <div className="bridge-section-label">
          <span>1</span>
          <div><strong>Source network</strong><small>Select where your USDC is now</small></div>
        </div>

        <div className="bridge-source-grid" role="radiogroup" aria-label="Bridge source network">
          {ARC_BRIDGE_SOURCE_OPTIONS.map((option) => {
            const active = option.id === sourceChainId;
            return (
              <button
                type="button"
                key={option.id}
                className={`bridge-source-card ${active ? "is-active" : ""}`}
                onClick={() => selectSource(option.id)}
                disabled={busy}
                aria-pressed={active}
              >
                <span className="bridge-chain-icon">{option.shortName === "ETH Sepolia" ? "Ξ" : "B"}</span>
                <span className="bridge-chain-copy">
                  <strong>{option.shortName}</strong>
                  <small>{active && walletOnSelectedSource ? "Wallet connected" : active ? "Selected" : "Choose network"}</small>
                </span>
                <span className="bridge-radio" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className="bridge-source-balances">
          <div>
            <span>Available USDC</span>
            <strong>{sourceBalances.status === "loading" ? "Checking…" : balancesReady ? `${formatNumber(sourceUsdcNumber)} USDC` : "—"}</strong>
          </div>
          <div>
            <span>Gas balance</span>
            <strong>{sourceBalances.status === "loading" ? "Checking…" : balancesReady ? `${formatNumber(sourceGasNumber, 8)} ${sourceChain.gasToken}` : "—"}</strong>
          </div>
          <div>
            <span>Wallet network</span>
            <strong className={walletOnSelectedSource ? "is-ready" : ""}>{walletOnSelectedSource ? sourceChain.shortName : "Will switch on review"}</strong>
          </div>
        </div>
        {sourceBalances.status === "error" ? <p className="bridge-balance-note">Live source balances could not be loaded. You can still request a quote.</p> : null}
      </div>

      <div className="bridge-v2-section">
        <div className="bridge-section-label">
          <span>2</span>
          <div><strong>Amount</strong><small>USDC to receive on Arc</small></div>
        </div>

        <label className="bridge-amount-field bridge-v2-amount">
          <div>
            <input
              value={amount}
              onChange={(event) => {
                setAmount(cleanAmount(event.target.value));
                resetQuote();
              }}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="USDC amount to bridge"
            />
            <strong>USDC</strong>
          </div>
          {balancesReady ? (
            <span className="bridge-available-line">
              Available {formatNumber(sourceUsdcNumber)} USDC
              {estimate ? <button type="button" onClick={useSafeMax}>Use max after fees</button> : null}
            </span>
          ) : null}
        </label>

        <div className="bridge-route-summary">
          <div><span>From</span><strong>{sourceChain.shortName}</strong></div>
          <span className="bridge-route-arrow" aria-hidden="true">→</span>
          <div><span>To</span><strong>Arc Testnet</strong></div>
          <div className="bridge-route-recipient"><span>Receive to</span><strong>{connectedAddress ? `${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}` : "Connect wallet"}</strong></div>
        </div>
      </div>

      {estimate ? (
        <div className="bridge-v2-section bridge-review-section">
          <div className="bridge-section-label">
            <span>3</span>
            <div><strong>Review quote</strong><small>Circle bridge + forwarding fees</small></div>
          </div>
          <div className="bridge-quote bridge-v2-quote">
            <div><span>Bridge amount</span><strong>{amount} USDC</strong></div>
            {feeRows.map((fee, index) => (
              <div key={`${fee.label}-${index}`}><span>{fee.label}</span><strong>{fee.value}</strong></div>
            ))}
            {quoteUsdcFees > 0 ? (
              <div className="bridge-quote-total"><span>USDC needed on source</span><strong>≈ {formatNumber(requiredUsdc)} USDC</strong></div>
            ) : null}
          </div>
        </div>
      ) : null}

      {fundingMessage ? (
        <div className="bridge-funding-warning" role="alert">
          <span>!</span>
          <div><strong>Source funds needed</strong><p>{fundingMessage}</p></div>
          {estimate && quotedUsdcShort && safeMax > 0 ? <button type="button" onClick={useSafeMax}>Use {formatNumber(safeMax)} USDC</button> : null}
        </div>
      ) : null}

      {error && !fundingMessage ? <p className="bridge-error" role="alert">{error}</p> : null}

      {status === "success" || status === "submitted" ? (
        <div className="bridge-success">
          <strong>{status === "success" ? "Bridge complete" : "Bridge submitted"}</strong>
          {txHash ? <span>{txHash.slice(0, 10)}…{txHash.slice(-6)}</span> : null}
          {explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer">View transaction</a> : null}
        </div>
      ) : null}

      <div className="bridge-actions bridge-v2-actions">
        {!estimate ? (
          <button
            type="button"
            className="button button-primary"
            onClick={handleReview}
            disabled={!canContinue || busy || amountExceedsBalance}
          >
            {status === "switching" || isSwitching
              ? `Switching to ${sourceChain.shortName}…`
              : status === "estimating"
                ? "Getting quote…"
                : walletOnSelectedSource
                  ? "Review bridge"
                  : `Switch to ${sourceChain.shortName} & review`}
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={handleBridge}
            disabled={!canContinue || busy || quotedUsdcShort || sourceGasMissing}
          >
            {status === "bridging"
              ? "Confirm in wallet…"
              : quotedUsdcShort
                ? "Not enough USDC"
                : sourceGasMissing
                  ? `Need ${sourceChain.gasToken} for gas`
                  : `Bridge ${amount} USDC`}
          </button>
        )}
        {estimate ? <button type="button" className="button button-secondary" onClick={resetQuote} disabled={busy}>Edit</button> : null}
      </div>

      <div className="bridge-v2-footnote">
        <span>✓ Self-custodial</span>
        <span>✓ Circle CCTP</span>
        <span>✓ Destination mint handled automatically</span>
      </div>
    </section>
  );
}