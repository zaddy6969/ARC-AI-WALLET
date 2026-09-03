import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain } from "wagmi";
import { getPrimaryExplorerUrl, getPrimaryTxHash } from "../lib/arc-app-kit";
import {
  APP_KIT_EVM_CHAIN_OPTIONS,
  ARC_APP_KIT_READY,
  ARC_MAINNET_REQUESTED,
  ARC_USDC_ERC20_ADDRESS,
  arcTestnet
} from "../lib/arc-chain";
import { createArcBridgeClient, formatBridgeError, summarizeBridgeFees } from "../lib/arc-bridge";
import { createWalletActionRecord } from "../lib/local-activity";
import { FeatureIcon } from "./wallet-sidebar";

const BRIDGE_NETWORK_OPTIONS = APP_KIT_EVM_CHAIN_OPTIONS;
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

const ERC20_BALANCE_ABI = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }]
}];

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
  return BRIDGE_NETWORK_OPTIONS.find((item) => item.id === Number(chainId)) || BRIDGE_NETWORK_OPTIONS[0];
}

function defaultDestinationId(sourceChainId) {
  if (sourceChainId !== arcTestnet.id) return arcTestnet.id;
  return BRIDGE_NETWORK_OPTIONS.find((option) => option.id !== arcTestnet.id)?.id || arcTestnet.id;
}

function formatNumber(value, maximumFractionDigits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits, minimumFractionDigits: 0 }).format(number);
}

function chainMark(option) {
  if (option.id === arcTestnet.id) return "A";
  if ([1, 11155111].includes(option.id)) return "Ξ";
  return "B";
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function verifyProviderChain(provider, expectedChainId) {
  if (!provider?.request) throw new Error("Wallet provider is unavailable.");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = await provider.request({ method: "eth_chainId" });
    const active = typeof value === "string" ? Number.parseInt(value, 16) : Number(value);
    if (active === expectedChainId) return;
    await sleep(250 + attempt * 80);
  }
  throw new Error("Wallet did not switch to the selected source network.");
}

function parseUsdcFees(rows) {
  return rows.reduce((total, row) => {
    const value = String(row?.value || "");
    if (!/USDC/i.test(value)) return total;
    const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return total + (match ? Number(match[0]) : 0);
  }, 0);
}

export default function BridgeToArcPanel({ walletSnapshot, onActivitySaved, copilotAction }) {
  const { connector } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const connectedAddress = walletSnapshot?.address || "";
  const initialSourceId = BRIDGE_NETWORK_OPTIONS.some((item) => item.id === currentChainId) ? currentChainId : arcTestnet.id;
  const [sourceChainId, setSourceChainId] = useState(initialSourceId);
  const [destinationChainId, setDestinationChainId] = useState(defaultDestinationId(initialSourceId));
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("idle");
  const [estimate, setEstimate] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [sourceBalances, setSourceBalances] = useState({ status: "idle", usdc: "", gas: "", error: "" });

  const sourceChain = useMemo(() => networkFromId(sourceChainId), [sourceChainId]);
  const destinationChain = useMemo(() => networkFromId(destinationChainId), [destinationChainId]);
  const sourceUsdcAddress = SOURCE_USDC_ADDRESSES[sourceChain.id];
  const sourcePublicClient = usePublicClient({ chainId: sourceChain.id });
  const fees = useMemo(() => summarizeBridgeFees(estimate).slice(0, 7), [estimate]);
  const quoteUsdcFees = useMemo(() => parseUsdcFees(fees), [fees]);
  const txHash = useMemo(() => getPrimaryTxHash(result), [result]);
  const explorerUrl = useMemo(() => getPrimaryExplorerUrl(result), [result]);
  const amountNumber = Number(amount || 0);
  const sourceUsdcNumber = Number(sourceBalances.usdc || 0);
  const sourceGasNumber = Number(sourceBalances.gas || 0);
  const balancesReady = sourceBalances.status === "ready";
  const walletOnSource = currentChainId === sourceChain.id;
  const amountExceedsBalance = balancesReady && amountNumber > sourceUsdcNumber + 0.0000001;
  const requiredUsdc = amountNumber + quoteUsdcFees;
  const quotedUsdcShort = Boolean(estimate && balancesReady && sourceUsdcNumber + 0.0000001 < requiredUsdc);
  const sourceGasMissing = Boolean(estimate && balancesReady && sourceGasNumber <= 0);
  const busy = isSwitching || ["switching", "estimating", "bridging", "destination-switching"].includes(status);
  const canReview = BRIDGE_CONFIGURED && connector && connectedAddress && validAmount(amount) && sourceChain.id !== destinationChain.id && !amountExceedsBalance;

  useEffect(() => {
    if (!BRIDGE_NETWORK_OPTIONS.some((item) => item.id === currentChainId)) return;
    if (status !== "idle" || estimate || result) return;
    setSourceChainId(currentChainId);
    setDestinationChainId((current) => current === currentChainId ? defaultDestinationId(currentChainId) : current);
  }, [currentChainId]);

  useEffect(() => {
    if (copilotAction?.tool !== "prepare_bridge") return;
    const args = copilotAction.args || {};
    const lookup = (value) => {
      const normalized = String(value || "").toLowerCase();
      if (normalized === "arc") return arcTestnet.id;
      if (normalized.includes("ethereum")) return ARC_MAINNET_REQUESTED ? 1 : 11155111;
      if (normalized.includes("base")) return ARC_MAINNET_REQUESTED ? 8453 : 84532;
      return null;
    };
    const nextSource = lookup(args.sourceNetwork);
    const nextDestination = lookup(args.destinationNetwork);
    if (nextSource) setSourceChainId(nextSource);
    if (nextDestination && nextDestination !== nextSource) setDestinationChainId(nextDestination);
    else if (nextSource) setDestinationChainId(defaultDestinationId(nextSource));
    setAmount(cleanAmount(args.amount || ""));
    setEstimate(null);
    setResult(null);
    setError("");
    setStatus("idle");
  }, [copilotAction]);

  useEffect(() => {
    let cancelled = false;
    async function loadBalances() {
      if (!connectedAddress || !sourcePublicClient || !sourceUsdcAddress) {
        setSourceBalances({ status: "idle", usdc: "", gas: "", error: "" });
        return;
      }
      setSourceBalances((current) => ({ ...current, status: "loading", error: "" }));
      try {
        const [usdcRaw, gasRaw] = await Promise.all([
          sourcePublicClient.readContract({ address: sourceUsdcAddress, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [connectedAddress] }),
          sourcePublicClient.getBalance({ address: connectedAddress })
        ]);
        if (cancelled) return;
        setSourceBalances({ status: "ready", usdc: formatUnits(usdcRaw, 6), gas: formatUnits(gasRaw, 18), error: "" });
      } catch (nextError) {
        if (!cancelled) setSourceBalances({ status: "error", usdc: "", gas: "", error: nextError instanceof Error ? nextError.message : "Balance check unavailable." });
      }
    }
    void loadBalances();
    return () => { cancelled = true; };
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
    if (destinationChainId === chainId) setDestinationChainId(defaultDestinationId(chainId));
    resetQuote();
  };

  const getReadyProvider = async () => {
    if (!BRIDGE_CONFIGURED) throw new Error("Bridge configuration is unavailable.");
    if (!connector) throw new Error("Connect your wallet first.");
    if (currentChainId !== sourceChain.id) {
      setStatus("switching");
      await switchChainAsync({ chainId: sourceChain.id });
    }
    const provider = await connector.getProvider();
    await verifyProviderChain(provider, sourceChain.id);
    return provider;
  };

  const createQuote = async () => {
    if (!canReview) throw new Error("Enter a valid USDC amount and route.");
    const provider = await getReadyProvider();
    setStatus("estimating");
    const bridgeClient = await createArcBridgeClient(provider);
    const nextEstimate = await bridgeClient.kit.estimateBridge({
      from: { adapter: bridgeClient.adapter, chain: sourceChain.appKitChain },
      to: { adapter: bridgeClient.adapter, chain: destinationChain.appKitChain, recipientAddress: connectedAddress },
      amount
    });
    setEstimate(nextEstimate);
    setStatus("ready");
    return bridgeClient;
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
    if (!canReview || quotedUsdcShort || sourceGasMissing) return;
    setError("");
    try {
      let bridgeClient;
      if (!estimate) bridgeClient = await createQuote();
      else {
        const provider = await getReadyProvider();
        bridgeClient = await createArcBridgeClient(provider);
      }
      setStatus("bridging");
      const nextResult = await bridgeClient.kit.bridge({
        from: { adapter: bridgeClient.adapter, chain: sourceChain.appKitChain },
        to: { adapter: bridgeClient.adapter, chain: destinationChain.appKitChain, recipientAddress: connectedAddress },
        amount
      });
      setResult(nextResult);
      if (nextResult?.state === "error") {
        setStatus("error");
        setError("Bridge could not be completed. Check the failed step and source balances, then try again.");
        return;
      }
      const nextHash = getPrimaryTxHash(nextResult);
      const nextExplorer = getPrimaryExplorerUrl(nextResult);
      const actionStatus = nextResult?.state === "success" ? "Confirmed" : "Submitted";
      setStatus(nextResult?.state === "success" ? "success" : "submitted");
      onActivitySaved?.(
        createWalletActionRecord({
          walletAddress: connectedAddress,
          type: "Bridge",
          kind: "bridge",
          amount: `${amount} USDC`,
          chain: `${sourceChain.name} → ${destinationChain.name}`,
          chainId: sourceChain.id,
          sender: connectedAddress,
          receiver: connectedAddress,
          recipient: connectedAddress,
          status: actionStatus,
          txHash: nextHash,
          explorerUrl: nextExplorer,
          summary: `Bridged ${amount} USDC from ${sourceChain.name} to ${destinationChain.name}.`,
          metadata: {
            operation: "bridge",
            sourceChainId: sourceChain.id,
            destinationChainId: destinationChain.id,
            sourceNetwork: sourceChain.name,
            destinationNetwork: destinationChain.name
          }
        })
      );
    } catch (nextError) {
      setStatus("error");
      setError(formatBridgeError(nextError));
    }
  };

  const switchToDestination = async () => {
    setError("");
    setStatus("destination-switching");
    try {
      await switchChainAsync({ chainId: destinationChain.id });
      const provider = await connector?.getProvider?.();
      await verifyProviderChain(provider, destinationChain.id);
      setStatus(result?.state === "success" ? "success" : "submitted");
    } catch (nextError) {
      setStatus(result?.state === "success" ? "success" : "submitted");
      setError(formatBridgeError(nextError));
    }
  };

  const fundingMessage = amountExceedsBalance
    ? `Amount exceeds your ${sourceChain.shortName} USDC balance.`
    : quotedUsdcShort
      ? `This route needs about ${formatNumber(requiredUsdc)} USDC including quoted fees.`
      : sourceGasMissing
        ? sourceChain.id === arcTestnet.id
          ? "Keep a small USDC amount available on Arc for gas."
          : `You need ${sourceChain.gasToken} on ${sourceChain.shortName} for source-chain gas.`
        : "";

  return (
    <section className="wallet-v3-page-card wallet-v3-bridge-page">
      <header className="wallet-v3-page-head">
        <div><span className="wallet-v3-eyebrow">Cross-chain USDC</span><h2>Bridge</h2><p>Select the exact source and destination. Lumexa switches the wallet to the source before generating a Circle quote.</p></div>
        <span className="wallet-v3-network-badge"><i />{sourceChain.shortName} → {destinationChain.shortName}</span>
      </header>

      {!BRIDGE_CONFIGURED ? <div className="wallet-v3-inline-warning is-error"><strong>Bridge unavailable</strong><span>Circle App Kit route configuration is incomplete.</span></div> : null}

      <div className="wallet-v3-bridge-route">
        <div className="wallet-v3-bridge-column">
          <span className="wallet-v3-field-title">From</span>
          <div className="wallet-v3-chain-options">
            {BRIDGE_NETWORK_OPTIONS.map((option) => (
              <button key={option.id} type="button" className={sourceChain.id === option.id ? "is-active" : ""} onClick={() => selectSource(option.id)} disabled={busy}>
                <span className="wallet-v3-chain-mark">{chainMark(option)}</span><span><strong>{option.shortName}</strong><small>{sourceChain.id === option.id ? (walletOnSource ? "Wallet connected" : "Will switch on review") : option.name}</small></span><i />
              </button>
            ))}
          </div>
        </div>
        <span className="wallet-v3-bridge-arrow"><FeatureIcon name="bridge" /></span>
        <div className="wallet-v3-bridge-column">
          <span className="wallet-v3-field-title">To</span>
          <div className="wallet-v3-chain-options">
            {BRIDGE_NETWORK_OPTIONS.filter((option) => option.id !== sourceChain.id).map((option) => (
              <button key={option.id} type="button" className={destinationChain.id === option.id ? "is-active" : ""} onClick={() => { setDestinationChainId(option.id); resetQuote(); }} disabled={busy}>
                <span className="wallet-v3-chain-mark">{chainMark(option)}</span><span><strong>{option.shortName}</strong><small>{destinationChain.id === option.id ? "Destination" : option.name}</small></span><i />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="wallet-v3-bridge-balance-row">
        <div><span>Available on {sourceChain.shortName}</span><strong>{sourceBalances.status === "loading" ? "Checking…" : balancesReady ? `${formatNumber(sourceUsdcNumber)} USDC` : "—"}</strong></div>
        <div><span>Source gas</span><strong>{sourceBalances.status === "loading" ? "Checking…" : balancesReady ? `${formatNumber(sourceGasNumber, 8)} ${sourceChain.gasToken}` : "—"}</strong></div>
        <div><span>Wallet network</span><strong>{walletOnSource ? sourceChain.shortName : walletSnapshot?.activeChainName || "Other"}</strong></div>
      </div>

      <div className="wallet-v3-bridge-amount">
        <div><span>Amount</span><small>USDC to bridge</small></div>
        <label><input value={amount} onChange={(event) => { setAmount(cleanAmount(event.target.value)); resetQuote(); }} inputMode="decimal" placeholder="0.00" /><strong>USDC</strong></label>
      </div>

      {estimate ? (
        <div className="wallet-v3-review-card">
          <div className="wallet-v3-review-head"><span>Review bridge</span><strong>{sourceChain.shortName} → {destinationChain.shortName}</strong></div>
          <div className="wallet-v3-review-grid">
            <div><span>Bridge amount</span><strong>{amount} USDC</strong></div>
            <div><span>Receive to</span><strong>{connectedAddress ? `${connectedAddress.slice(0, 7)}…${connectedAddress.slice(-5)}` : "—"}</strong></div>
            {fees.map((fee, index) => <div key={`${fee.label}-${index}`}><span>{fee.label}</span><strong>{fee.value}</strong></div>)}
            {quoteUsdcFees > 0 ? <div><span>Total source USDC</span><strong>≈ {formatNumber(requiredUsdc)} USDC</strong></div> : null}
          </div>
        </div>
      ) : null}

      {fundingMessage ? <div className="wallet-v3-inline-warning"><strong>Source funds needed</strong><span>{fundingMessage}</span></div> : null}
      {error && !fundingMessage ? <div className="wallet-v3-inline-warning is-error"><strong>Bridge unavailable</strong><span>{error}</span></div> : null}

      {status === "success" || status === "submitted" || status === "destination-switching" ? (
        <div className="wallet-v3-bridge-success">
          <div><strong>{status === "success" ? "Bridge complete" : "Bridge submitted"}</strong><span>{txHash ? `${txHash.slice(0, 10)}…${txHash.slice(-6)}` : "Track the route from Activity."}</span></div>
          <div>{explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer">View transaction ↗</a> : null}<button type="button" className="wallet-v3-secondary-button" onClick={switchToDestination} disabled={status === "destination-switching" || currentChainId === destinationChain.id}>{currentChainId === destinationChain.id ? `${destinationChain.shortName} active` : status === "destination-switching" ? "Switching…" : `Switch to ${destinationChain.shortName}`}</button></div>
        </div>
      ) : null}

      <div className="wallet-v3-action-row">
        {estimate ? <button type="button" className="wallet-v3-secondary-button" onClick={resetQuote} disabled={busy}>Edit</button> : null}
        <button type="button" className="wallet-v3-primary-button" onClick={estimate ? handleBridge : handleReview} disabled={!canReview || busy || (estimate && (quotedUsdcShort || sourceGasMissing))}>
          {status === "switching" || isSwitching ? `Switching to ${sourceChain.shortName}…` : status === "estimating" ? "Getting Circle quote…" : status === "bridging" ? "Confirm in wallet…" : estimate ? `Bridge ${amount} USDC` : walletOnSource ? "Review bridge" : `Switch to ${sourceChain.shortName} & review`}
        </button>
      </div>
      <p className="wallet-v3-security-note">Self-custodial · Circle route · Destination remains under the same wallet address</p>
    </section>
  );
}
