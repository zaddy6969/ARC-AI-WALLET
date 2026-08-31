import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain } from "wagmi";
import { formatUnits } from "viem";
import { getPrimaryExplorerUrl, getPrimaryTxHash } from "../lib/arc-app-kit";
import {
  APP_KIT_EVM_CHAIN_OPTIONS,
  ARC_APP_KIT_READY,
  ARC_MAINNET_REQUESTED,
  ARC_USDC_ERC20_ADDRESS,
  arcTestnet
} from "../lib/arc-chain";
import {
  createArcBridgeClient,
  formatBridgeError,
  summarizeBridgeFees
} from "../lib/arc-bridge";
import { createWalletActionRecord } from "../lib/local-activity";

const BRIDGE_NETWORK_OPTIONS = APP_KIT_EVM_CHAIN_OPTIONS;
const ETHEREUM_CHAIN_ID = ARC_MAINNET_REQUESTED ? 1 : 11155111;
const BASE_CHAIN_ID = ARC_MAINNET_REQUESTED ? 8453 : 84532;
const BRIDGE_CONFIGURED =
  (!ARC_MAINNET_REQUESTED || ARC_APP_KIT_READY) &&
  BRIDGE_NETWORK_OPTIONS.length >= 2 &&
  BRIDGE_NETWORK_OPTIONS.every((option) => Boolean(option.appKitChain));

const SOURCE_USDC_ADDRESSES = ARC_MAINNET_REQUESTED
  ? {
      [arcTestnet.id]: ARC_USDC_ERC20_ADDRESS,
      1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    }
  : {
      [arcTestnet.id]: ARC_USDC_ERC20_ADDRESS,
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

function networkFromId(chainId) {
  return (
    BRIDGE_NETWORK_OPTIONS.find((item) => item.id === Number(chainId)) ||
    BRIDGE_NETWORK_OPTIONS[0]
  );
}

function copilotNetworkId(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "arc") return arcTestnet.id;

  if (ARC_MAINNET_REQUESTED) {
    if (normalized === "ethereum" || normalized === "ethereum-mainnet") return 1;
    if (normalized === "base" || normalized === "base-mainnet") return 8453;
    return null;
  }

  if (normalized === "ethereum-sepolia") return 11155111;
  if (normalized === "base-sepolia") return 84532;
  return null;
}

function defaultDestinationId(sourceChainId) {
  if (sourceChainId !== arcTestnet.id) return arcTestnet.id;
  return BRIDGE_NETWORK_OPTIONS.some((option) => option.id === BASE_CHAIN_ID)
    ? BASE_CHAIN_ID
    : BRIDGE_NETWORK_OPTIONS.find((option) => option.id !== arcTestnet.id)?.id || arcTestnet.id;
}

function chainIcon(option) {
  if (option.id === arcTestnet.id) return "A";
  if (option.id === ETHEREUM_CHAIN_ID) return "Ξ";
  return "B";
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

export default function BridgeToArcPanel({ walletSnapshot, onActivitySaved, copilotAction }) {
  const { connector } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const connectedAddress = walletSnapshot?.address || "";
  const currentNetworkSupported = BRIDGE_NETWORK_OPTIONS.some(
    (item) => item.id === currentChainId
  );
  const initialSourceId = currentNetworkSupported
    ? currentChainId
    : BRIDGE_NETWORK_OPTIONS[0].id;

  const [sourceChainId, setSourceChainId] = useState(initialSourceId);
  const [destinationChainId, setDestinationChainId] = useState(
    defaultDestinationId(initialSourceId)
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

  const sourceChain = useMemo(() => networkFromId(sourceChainId), [sourceChainId]);
  const destinationChain = useMemo(
    () => networkFromId(destinationChainId),
    [destinationChainId]
  );
  const destinationOptions = useMemo(
    () => BRIDGE_NETWORK_OPTIONS.filter((item) => item.id !== sourceChain.id),
    [sourceChain.id]
  );
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
  const canContinue = Boolean(
    BRIDGE_CONFIGURED &&
      connector &&
      connectedAddress &&
      validAmount(amount) &&
      sourceChain?.appKitChain &&
      destinationChain?.appKitChain &&
      sourceChain.id !== destinationChain.id
  );
  const amountExceedsBalance =
    balancesReady && amountNumber > sourceUsdcNumber + 0.0000001;
  const requiredUsdc = amountNumber + quoteUsdcFees;
  const quotedUsdcShort = Boolean(
    estimate && balancesReady && sourceUsdcNumber + 0.0000001 < requiredUsdc
  );
  const sourceGasMissing = Boolean(
    estimate && balancesReady && sourceGasNumber <= 0
  );
  const safeMax = estimate
    ? Math.max(0, sourceUsdcNumber - quoteUsdcFees - 0.000001)
    : Math.max(0, sourceUsdcNumber);
  const busy =
    isSwitching || ["switching", "estimating", "bridging"].includes(status);

  useEffect(() => {
    if (copilotAction?.tool !== "prepare_bridge") return;
    const args = copilotAction.args || {};
    const nextSource = copilotNetworkId(args.sourceNetwork);
    const nextDestination = copilotNetworkId(args.destinationNetwork);
    if (nextSource) setSourceChainId(nextSource);
    if (nextDestination && nextDestination !== nextSource) {
      setDestinationChainId(nextDestination);
    } else if (nextSource) {
      setDestinationChainId(defaultDestinationId(nextSource));
    }
    setAmount(cleanAmount(args.amount || ""));
    setEstimate(null);
    setResult(null);
    setError("");
    setStatus("idle");
  }, [copilotAction]);

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
          error:
            nextError instanceof Error
              ? nextError.message
              : "Balance check unavailable."
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
    if (busy) return;
    setSourceChainId(chainId);
    if (destinationChainId === chainId) {
      setDestinationChainId(defaultDestinationId(chainId));
    }
    resetQuote();
  };

  const selectDestination = (chainId) => {
    if (busy || chainId === sourceChainId) return;
    setDestinationChainId(chainId);
    resetQuote();
  };

  const getReadyProvider = async () => {
    if (!BRIDGE_CONFIGURED) {
      throw new Error(
        ARC_MAINNET_REQUESTED
          ? "Arc Mainnet bridge support is locked until Circle App Kit production chain identifiers are configured."
          : "Bridge configuration is unavailable."
      );
    }
    if (!connector) throw new Error("Connect your wallet first.");

    if (currentChainId !== sourceChain.id) {
      if (!switchChainAsync) {
        throw new Error("Wallet network switching is unavailable.");
      }
      setStatus("switching");
      await switchChainAsync({ chainId: sourceChain.id });
    }

    const provider = await connector.getProvider();
    if (!provider) throw new Error("Wallet provider is unavailable.");
    await verifyProviderChain(provider, sourceChain.id);
    return provider;
  };

  const createQuote = async () => {
    if (!BRIDGE_CONFIGURED) {
      throw new Error(
        ARC_MAINNET_REQUESTED
          ? "Arc Mainnet bridge support is not enabled yet."
          : "Bridge support is not configured."
      );
    }
    if (!canContinue) throw new Error("Enter a valid USDC amount and route.");
    if (amountExceedsBalance) {
      throw new Error(
        `Insufficient USDC. Available on ${sourceChain.shortName}: ${formatNumber(
          sourceUsdcNumber
        )} USDC.`
      );
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
        chain: destinationChain.appKitChain,
        recipientAddress: connectedAddress
      },
      amount
    });

    setEstimate(nextEstimate);
    setStatus("ready");
    return { bridgeClient };
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
          chain: destinationChain.appKitChain,
          recipientAddress: connectedAddress
        },
        amount
      });

      setResult(nextResult);

      if (nextResult?.state === "error") {
        setStatus("error");
        setError(
          "Bridge could not be completed. Check the failed step and source balances, then try again."
        );
        return;
      }

      setStatus(nextResult?.state === "success" ? "success" : "submitted");
      onActivitySaved?.(
        createWalletActionRecord({
          walletAddress: connectedAddress,
          type: "Bridge",
          amount: `${amount} USDC`,
          chain: `${sourceChain.name} -> ${destinationChain.name}`,
          recipient: connectedAddress,
          status: nextResult?.state === "success" ? "Confirmed" : "Submitted",
          txHash: getPrimaryTxHash(nextResult),
          explorerUrl: getPrimaryExplorerUrl(nextResult),
          summary: `Bridged ${amount} USDC from ${sourceChain.name} to ${destinationChain.name}.`
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

  const fundingMessage = amountExceedsBalance
    ? `Amount exceeds your ${sourceChain.shortName} USDC balance.`
    : quotedUsdcShort
      ? `This bridge needs about ${formatNumber(
          requiredUsdc
        )} USDC including quoted fees. You have ${formatNumber(
          sourceUsdcNumber
        )} USDC.`
      : sourceGasMissing
        ? sourceChain.id === arcTestnet.id
          ? "Keep a small USDC amount available on Arc for the source transaction fee."
          : `You need ${sourceChain.gasToken} on ${sourceChain.shortName} to pay source-chain gas.`
        : "";

  const routeHelper = ARC_MAINNET_REQUESTED
    ? "Arc, Ethereum and Base"
    : "Arc, Ethereum Sepolia and Base Sepolia";

  return (
    <section className="bridge-wallet-card wallet-page-card bridge-v2">
      <div className="bridge-wallet-head">
        <div>
          <span className="bridge-eyebrow">Cross-chain USDC</span>
          <h2>Bridge USDC</h2>
          <p>Choose where your USDC is now and where you want to move it.</p>
        </div>
        <span className="bridge-destination-pill">
          {sourceChain.shortName} → {destinationChain.shortName}
        </span>
      </div>

      {!BRIDGE_CONFIGURED && ARC_MAINNET_REQUESTED ? (
        <div className="bridge-funding-warning" role="status">
          <span>!</span>
          <div>
            <strong>Mainnet bridge locked</strong>
            <p>Circle App Kit production chain identifiers must be configured before real-value bridging is enabled.</p>
          </div>
        </div>
      ) : null}

      {copilotAction?.tool === "prepare_bridge" ? (
        <div className="copilot-prepared-note"><strong>Prepared by Arc AI</strong><span>Balances and Circle fees are checked before signing.</span></div>
      ) : null}

      <div className="bridge-v2-section">
        <div className="bridge-section-label">
          <span>1</span>
          <div>
            <strong>Choose route</strong>
            <small>{routeHelper}</small>
          </div>
        </div>

        <div className="bridge-route-network-label">From</div>
        <div
          className="bridge-source-grid bridge-three-network-grid"
          role="radiogroup"
          aria-label="Bridge source network"
        >
          {BRIDGE_NETWORK_OPTIONS.map((option) => {
            const active = option.id === sourceChainId;
            return (
              <button
                type="button"
                key={option.id}
                className={`bridge-source-card ${active ? "is-active" : ""}`}
                onClick={() => selectSource(option.id)}
                disabled={busy || !BRIDGE_CONFIGURED}
                aria-pressed={active}
              >
                <span className="bridge-chain-icon">{chainIcon(option)}</span>
                <span className="bridge-chain-copy">
                  <strong>{option.shortName}</strong>
                  <small>
                    {active && walletOnSelectedSource
                      ? "Wallet connected"
                      : active
                        ? "Selected"
                        : "Choose network"}
                  </small>
                </span>
                <span className="bridge-radio" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className="bridge-route-network-label bridge-route-network-label-to">To</div>
        <div
          className="bridge-source-grid bridge-destination-grid"
          role="radiogroup"
          aria-label="Bridge destination network"
        >
          {destinationOptions.map((option) => {
            const active = option.id === destinationChainId;
            return (
              <button
                type="button"
                key={option.id}
                className={`bridge-source-card ${active ? "is-active" : ""}`}
                onClick={() => selectDestination(option.id)}
                disabled={busy || !BRIDGE_CONFIGURED}
                aria-pressed={active}
              >
                <span className="bridge-chain-icon">{chainIcon(option)}</span>
                <span className="bridge-chain-copy">
                  <strong>{option.shortName}</strong>
                  <small>{active ? "Destination" : "Choose network"}</small>
                </span>
                <span className="bridge-radio" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className="bridge-source-balances">
          <div>
            <span>Available USDC</span>
            <strong>
              {sourceBalances.status === "loading"
                ? "Checking…"
                : balancesReady
                  ? `${formatNumber(sourceUsdcNumber)} USDC`
                  : "—"}
            </strong>
          </div>
          <div>
            <span>{sourceChain.id === arcTestnet.id ? "Arc gas view" : "Gas balance"}</span>
            <strong>
              {sourceBalances.status === "loading"
                ? "Checking…"
                : balancesReady
                  ? `${formatNumber(sourceGasNumber, 8)} ${sourceChain.gasToken}`
                  : "—"}
            </strong>
          </div>
          <div>
            <span>Wallet network</span>
            <strong className={walletOnSelectedSource ? "is-ready" : ""}>
              {walletOnSelectedSource
                ? sourceChain.shortName
                : "Will switch on review"}
            </strong>
          </div>
        </div>
        {sourceBalances.status === "error" ? (
          <p className="bridge-balance-note">
            Live source balances could not be loaded. You can still request a quote when the route is enabled.
          </p>
        ) : null}
      </div>

      <div className="bridge-v2-section">
        <div className="bridge-section-label">
          <span>2</span>
          <div>
            <strong>Amount</strong>
            <small>USDC to bridge</small>
          </div>
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
              disabled={!BRIDGE_CONFIGURED}
            />
            <strong>USDC</strong>
          </div>
          {balancesReady ? (
            <span className="bridge-available-line">
              Available {formatNumber(sourceUsdcNumber)} USDC
              {estimate ? (
                <button type="button" onClick={useSafeMax}>
                  Use max after fees
                </button>
              ) : null}
            </span>
          ) : null}
        </label>

        <div className="bridge-route-summary">
          <div>
            <span>From</span>
            <strong>{sourceChain.shortName}</strong>
          </div>
          <span className="bridge-route-arrow" aria-hidden="true">
            →
          </span>
          <div>
            <span>To</span>
            <strong>{destinationChain.shortName}</strong>
          </div>
          <div className="bridge-route-recipient">
            <span>Receive to</span>
            <strong>
              {connectedAddress
                ? `${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}`
                : "Connect wallet"}
            </strong>
          </div>
        </div>
      </div>

      {estimate ? (
        <div className="bridge-v2-section bridge-review-section">
          <div className="bridge-section-label">
            <span>3</span>
            <div>
              <strong>Review quote</strong>
              <small>Circle bridge + forwarding fees</small>
            </div>
          </div>
          <div className="bridge-quote bridge-v2-quote">
            <div>
              <span>Route</span>
              <strong>
                {sourceChain.shortName} → {destinationChain.shortName}
              </strong>
            </div>
            <div>
              <span>Bridge amount</span>
              <strong>{amount} USDC</strong>
            </div>
            {feeRows.map((fee, index) => (
              <div key={`${fee.label}-${index}`}>
                <span>{fee.label}</span>
                <strong>{fee.value}</strong>
              </div>
            ))}
            {quoteUsdcFees > 0 ? (
              <div className="bridge-quote-total">
                <span>USDC needed on source</span>
                <strong>≈ {formatNumber(requiredUsdc)} USDC</strong>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {fundingMessage ? (
        <div className="bridge-funding-warning" role="alert">
          <span>!</span>
          <div>
            <strong>Source funds needed</strong>
            <p>{fundingMessage}</p>
          </div>
          {estimate && quotedUsdcShort && safeMax > 0 ? (
            <button type="button" onClick={useSafeMax}>
              Use {formatNumber(safeMax)} USDC
            </button>
          ) : null}
        </div>
      ) : null}

      {error && !fundingMessage ? (
        <p className="bridge-error" role="alert">
          {error}
        </p>
      ) : null}

      {status === "success" || status === "submitted" ? (
        <div className="bridge-success">
          <strong>{status === "success" ? "Bridge complete" : "Bridge submitted"}</strong>
          {txHash ? (
            <span>
              {txHash.slice(0, 10)}…{txHash.slice(-6)}
            </span>
          ) : null}
          {explorerUrl ? (
            <a href={explorerUrl} target="_blank" rel="noreferrer">
              View transaction
            </a>
          ) : null}
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
            {!BRIDGE_CONFIGURED
              ? "Mainnet bridge not enabled"
              : status === "switching" || isSwitching
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
        {estimate ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={resetQuote}
            disabled={busy}
          >
            Edit
          </button>
        ) : null}
      </div>

      <div className="bridge-v2-footnote">
        <span>✓ Self-custodial</span>
        <span>✓ Circle route</span>
        <span>✓ Arc ↔ Base / Ethereum</span>
      </div>
    </section>
  );
}
