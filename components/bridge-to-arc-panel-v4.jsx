import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain } from "wagmi";
import { getPrimaryExplorerUrl, getPrimaryTxHash } from "../lib/arc-app-kit";
import {
  APP_KIT_EVM_CHAIN_OPTIONS,
  ARC_APP_KIT_READY,
  ARC_MAINNET_REQUESTED,
  MULTICHAIN_WALLET_CHAINS,
  arcTestnet
} from "../lib/arc-chain";
import {
  createArcBridgeClient,
  formatBridgeError,
  normalizeBridgeSteps,
  summarizeBridgeFees
} from "../lib/arc-bridge";
import { createWalletActionRecord } from "../lib/local-activity";
import { switchWalletNetwork } from "../lib/wallet-network";
import { USDC_ADDRESS_BY_CHAIN_ID } from "../lib/wallet-networks";
import { FeatureIcon } from "./wallet-sidebar";

const OPTIONS = APP_KIT_EVM_CHAIN_OPTIONS;
const CONFIGURED =
  (!ARC_MAINNET_REQUESTED || ARC_APP_KIT_READY) &&
  OPTIONS.length >= 2 &&
  OPTIONS.every((item) => item.appKitChain);

const BALANCE_ABI = [{
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
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function optionById(id) {
  return OPTIONS.find((item) => item.id === Number(id)) || OPTIONS[0];
}

function wagmiChainById(id) {
  return MULTICHAIN_WALLET_CHAINS.find((item) => item.id === Number(id)) || null;
}

function destinationFor(sourceId) {
  if (Number(sourceId) !== Number(arcTestnet.id)) return arcTestnet.id;
  return OPTIONS.find((item) => item.id !== arcTestnet.id)?.id || arcTestnet.id;
}

function chainMark(id) {
  if (Number(id) === Number(arcTestnet.id)) return "A";
  if ([1, 11155111].includes(Number(id))) return "Ξ";
  return "B";
}

function feeLabel(estimate) {
  const rows = summarizeBridgeFees(estimate || {}).slice(0, 6);
  return rows.length ? rows : [{ label: "Network + bridge fees", value: "Calculated by Circle" }];
}

function resultState(result) {
  if (!result) return "";
  if (result.state === "error") return "Failed";
  if (result.state === "success") return "Confirmed";
  return "Submitted";
}

function formatBalance(value, digits = 6) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function bridgeTxMetadata(steps) {
  const withHashes = steps.filter((step) => step.txHash);
  const sourceStep = withHashes[0] || null;
  const destinationStep = withHashes.length > 1 ? withHashes[withHashes.length - 1] : null;
  return {
    sourceTxHash: sourceStep?.txHash || "",
    destinationTxHash:
      destinationStep && destinationStep.txHash !== sourceStep?.txHash
        ? destinationStep.txHash
        : "",
    sourceExplorerUrl: sourceStep?.explorerUrl || "",
    destinationExplorerUrl:
      destinationStep && destinationStep.txHash !== sourceStep?.txHash
        ? destinationStep.explorerUrl || ""
        : ""
  };
}

export default function BridgeToArcPanelV4({ walletSnapshot, onActivitySaved, copilotAction }) {
  const { connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const initialSource = OPTIONS.some((item) => item.id === chainId) ? chainId : arcTestnet.id;
  const [sourceId, setSourceId] = useState(initialSource);
  const [destinationId, setDestinationId] = useState(destinationFor(initialSource));
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [balance, setBalance] = useState({ status: "idle", usdc: 0, gas: 0 });

  const source = useMemo(() => optionById(sourceId), [sourceId]);
  const destination = useMemo(() => optionById(destinationId), [destinationId]);
  const sourceChain = useMemo(() => wagmiChainById(source.id), [source.id]);
  const destinationChain = useMemo(() => wagmiChainById(destination.id), [destination.id]);
  const publicClient = usePublicClient({ chainId: source.id });
  const busy = switching || ["switching", "quoting", "bridging", "destination-switching"].includes(status);
  const canReview = CONFIGURED && Boolean(connector && walletSnapshot?.address && validAmount(amount) && source.id !== destination.id);
  const insufficient = balance.status === "ready" && Number(amount || 0) > Number(balance.usdc || 0) + 0.0000001;
  const sourceNeedsExternalGas = Number(source.id) !== Number(arcTestnet.id);
  const sourceGasMissing = balance.status === "ready" && sourceNeedsExternalGas && Number(balance.gas || 0) <= 0;
  const remainingUsdc = Math.max(0, Number(balance.usdc || 0) - Number(amount || 0));
  const quoteFees = useMemo(() => feeLabel(quote), [quote]);
  const steps = useMemo(() => normalizeBridgeSteps(result), [result]);

  useEffect(() => {
    if (!OPTIONS.some((item) => item.id === chainId) || busy || quote || result) return;
    setSourceId(chainId);
    setDestinationId((current) => current === chainId ? destinationFor(chainId) : current);
  }, [chainId, busy, quote, result]);

  useEffect(() => {
    if (copilotAction?.tool !== "prepare_bridge") return;
    const rawSource = String(copilotAction?.args?.sourceNetwork || "").toLowerCase();
    const rawDestination = String(copilotAction?.args?.destinationNetwork || "").toLowerCase();
    const lookup = (value) => {
      if (value === "arc") return arcTestnet.id;
      if (value.includes("ethereum")) return ARC_MAINNET_REQUESTED ? 1 : 11155111;
      if (value.includes("base")) return ARC_MAINNET_REQUESTED ? 8453 : 84532;
      return null;
    };
    const nextSource = lookup(rawSource);
    const nextDestination = lookup(rawDestination);
    if (nextSource) setSourceId(nextSource);
    if (nextDestination && nextDestination !== nextSource) setDestinationId(nextDestination);
    else if (nextSource) setDestinationId(destinationFor(nextSource));
    setAmount(cleanAmount(copilotAction?.args?.amount || ""));
    setQuote(null);
    setResult(null);
    setStatus("idle");
    setError("");
  }, [copilotAction]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = USDC_ADDRESS_BY_CHAIN_ID[source.id];
      if (!walletSnapshot?.address || !publicClient || !token) {
        setBalance({ status: "idle", usdc: 0, gas: 0 });
        return;
      }
      setBalance((current) => ({ ...current, status: "loading" }));
      try {
        const [rawUsdc, rawGas] = await Promise.all([
          publicClient.readContract({ address: token, abi: BALANCE_ABI, functionName: "balanceOf", args: [walletSnapshot.address] }),
          publicClient.getBalance({ address: walletSnapshot.address })
        ]);
        if (!cancelled) {
          setBalance({
            status: "ready",
            usdc: Number(formatUnits(rawUsdc, 6)),
            gas: Number(formatUnits(rawGas, sourceChain?.nativeCurrency?.decimals || 18))
          });
        }
      } catch {
        if (!cancelled) setBalance({ status: "error", usdc: 0, gas: 0 });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [walletSnapshot?.address, publicClient, source.id, sourceChain?.nativeCurrency?.decimals]);

  const resetQuote = () => {
    setQuote(null);
    setResult(null);
    setStatus("idle");
    setError("");
  };

  const ensureSource = async () => {
    if (!sourceChain) throw new Error("Source network configuration is unavailable.");
    setStatus("switching");
    const switched = await switchWalletNetwork({ connector, chain: sourceChain, switchChainAsync });
    return switched.provider;
  };

  const buildQuote = async () => {
    if (!canReview || insufficient || sourceGasMissing) {
      if (insufficient) throw new Error(`Insufficient USDC on ${source.shortName}.`);
      if (sourceGasMissing) throw new Error(`You need ${source.gasToken} on ${source.shortName} for source-chain gas.`);
      throw new Error("Enter a valid USDC amount and route.");
    }
    const provider = await ensureSource();
    setStatus("quoting");
    const client = await createArcBridgeClient(provider);
    const nextQuote = await client.kit.estimateBridge({
      from: { adapter: client.adapter, chain: source.appKitChain },
      to: { adapter: client.adapter, chain: destination.appKitChain, recipientAddress: walletSnapshot.address },
      token: "USDC",
      amount
    });
    setQuote(nextQuote);
    setStatus("ready");
    return { client, quote: nextQuote };
  };

  const handleReview = async () => {
    setError("");
    setResult(null);
    try {
      await buildQuote();
    } catch (nextError) {
      setQuote(null);
      setStatus("error");
      setError(formatBridgeError(nextError));
    }
  };

  const handleBridge = async () => {
    if (!canReview || insufficient || sourceGasMissing || !quote) return;
    setError("");
    try {
      const provider = await ensureSource();
      const client = await createArcBridgeClient(provider);
      setStatus("bridging");
      const nextResult = await client.kit.bridge({
        from: { adapter: client.adapter, chain: source.appKitChain },
        to: { adapter: client.adapter, chain: destination.appKitChain, recipientAddress: walletSnapshot.address },
        token: "USDC",
        amount
      });
      setResult(nextResult);
      const finalStatus = resultState(nextResult);
      setStatus(finalStatus === "Failed" ? "error" : finalStatus === "Confirmed" ? "success" : "submitted");
      const hash = getPrimaryTxHash(nextResult);
      const explorerUrl = getPrimaryExplorerUrl(nextResult);
      const bridgeSteps = normalizeBridgeSteps(nextResult);
      const lifecycleTxs = bridgeTxMetadata(bridgeSteps);

      onActivitySaved?.(createWalletActionRecord({
        walletAddress: walletSnapshot.address,
        type: "Bridge",
        kind: "bridge",
        amount: `${amount} USDC`,
        chain: `${source.name} → ${destination.name}`,
        chainId: source.id,
        sender: walletSnapshot.address,
        receiver: walletSnapshot.address,
        recipient: walletSnapshot.address,
        status: finalStatus,
        txHash: hash,
        explorerUrl,
        summary: `Bridge ${amount} USDC from ${source.name} to ${destination.name}`,
        metadata: {
          operation: "bridge",
          token: "USDC",
          sourceChainId: source.id,
          destinationChainId: destination.id,
          sourceNetwork: source.name,
          destinationNetwork: destination.name,
          bridgeState: nextResult?.state || "submitted",
          bridgeSteps,
          ...lifecycleTxs
        }
      }));

      if (finalStatus === "Failed") setError("Circle returned a failed bridge result. No success is being claimed.");
    } catch (nextError) {
      setStatus("error");
      setError(formatBridgeError(nextError));
    }
  };

  const switchToDestination = async () => {
    if (!destinationChain) return;
    setError("");
    setStatus("destination-switching");
    try {
      await switchWalletNetwork({ connector, chain: destinationChain, switchChainAsync });
      setStatus(result?.state === "success" ? "success" : "submitted");
    } catch (nextError) {
      setStatus(result?.state === "success" ? "success" : "submitted");
      setError(formatBridgeError(nextError));
    }
  };

  return (
    <section className="wallet-v4-transaction-card">
      <header className="wallet-v4-page-head">
        <div><span>Cross-chain USDC</span><h2>Bridge</h2><p>Review source funds, route and fees first. Lumexa switches to the exact source network before Circle prepares or submits the bridge.</p></div>
        <div className="wallet-v4-route-pill"><b>{chainMark(source.id)}</b>{source.shortName}<span>→</span><b>{chainMark(destination.id)}</b>{destination.shortName}</div>
      </header>

      {!CONFIGURED ? <div className="wallet-v4-alert is-error"><strong>Bridge configuration incomplete</strong><span>Circle App Kit route configuration is unavailable in this environment.</span></div> : null}

      <div className="wallet-v4-bridge-grid">
        <div className="wallet-v4-route-box"><label>From</label><div className="wallet-v4-chain-list">{OPTIONS.map((item) => <button key={item.id} type="button" disabled={busy} className={source.id === item.id ? "is-active" : ""} onClick={() => { setSourceId(item.id); if (destinationId === item.id) setDestinationId(destinationFor(item.id)); resetQuote(); }}><b>{chainMark(item.id)}</b><span><strong>{item.shortName}</strong><small>{item.gasToken} gas</small></span></button>)}</div></div>
        <button type="button" className="wallet-v4-route-swap" disabled={busy} onClick={() => { const previous = source.id; setSourceId(destination.id); setDestinationId(previous); resetQuote(); }}><FeatureIcon name="swap" /></button>
        <div className="wallet-v4-route-box"><label>To</label><div className="wallet-v4-chain-list">{OPTIONS.map((item) => <button key={item.id} type="button" disabled={busy || source.id === item.id} className={destination.id === item.id ? "is-active" : ""} onClick={() => { setDestinationId(item.id); resetQuote(); }}><b>{chainMark(item.id)}</b><span><strong>{item.shortName}</strong><small>{item.id === source.id ? "Source" : "Destination"}</small></span></button>)}</div></div>
      </div>

      <div className="wallet-v5-source-funds">
        <div><span>Source USDC</span><strong>{balance.status === "loading" ? "Checking…" : `${formatBalance(balance.usdc)} USDC`}</strong></div>
        <div><span>Source gas</span><strong>{balance.status === "loading" ? "Checking…" : `${formatBalance(balance.gas, 8)} ${source.gasToken}`}</strong></div>
        <div><span>Wallet network</span><strong>{Number(chainId) === Number(source.id) ? source.shortName : walletSnapshot?.activeChainName || "Other"}</strong></div>
      </div>

      <div className="wallet-v4-amount-card">
        <div><label>Amount</label><span>{balance.status === "ready" ? `Available ${formatBalance(balance.usdc)} USDC` : "Checking source balance…"}</span></div>
        <div><input value={amount} onChange={(event) => { setAmount(cleanAmount(event.target.value)); resetQuote(); }} inputMode="decimal" placeholder="0.00" /><strong>USDC</strong></div>
        {insufficient ? <small className="is-error">Amount exceeds the USDC balance on {source.shortName}.</small> : null}
        {sourceGasMissing ? <small className="is-error">Add {source.gasToken} on {source.shortName} before bridging.</small> : null}
      </div>

      {quote ? (
        <div className="wallet-v4-review-card wallet-v5-preflight-card">
          <header><div><span>Pre-sign bridge review</span><strong>{amount} USDC</strong></div><span className="is-ready">Circle quote ready</span></header>
          <div className="wallet-v4-review-route"><strong>{source.name}</strong><span>→</span><strong>{destination.name}</strong></div>
          <div className="wallet-v5-balance-change">
            <div><span>Source balance</span><strong>{formatBalance(balance.usdc)} USDC</strong></div>
            <div><span>Bridge amount</span><strong>-{amount} USDC</strong></div>
            <div><span>Before quoted fees</span><strong>≈ {formatBalance(remainingUsdc)} USDC remains</strong></div>
          </div>
          <div className="wallet-v4-fees">{quoteFees.map((row, index) => <div key={`${row.label}-${index}`}><span>{row.label}</span><strong>{row.value}</strong></div>)}</div>
          <div className="wallet-v5-security-checks">
            <span><i>✓</i> Source network verified before signing</span>
            <span><i>✓</i> Destination is your same wallet address</span>
            <span><i>✓</i> Live Circle fees displayed before approval</span>
            <span><i>✓</i> Activity stores the bridge lifecycle steps</span>
          </div>
        </div>
      ) : null}

      {error ? <div className="wallet-v4-alert is-error"><strong>Bridge needs attention</strong><span>{error}</span></div> : null}

      {result ? (
        <div className="wallet-v4-result wallet-v5-bridge-result">
          <div><span>Bridge status</span><strong>{resultState(result)}</strong></div>
          {getPrimaryTxHash(result) ? <div><span>Source transaction</span><code>{getPrimaryTxHash(result)}</code></div> : null}
          {steps.length ? <div className="wallet-v5-step-list"><span>Lifecycle</span><strong>{steps.filter((step) => ["success", "confirmed", "complete"].includes(String(step.state).toLowerCase())).length}/{steps.length} steps complete</strong></div> : null}
          {getPrimaryExplorerUrl(result) ? <a href={getPrimaryExplorerUrl(result)} target="_blank" rel="noreferrer">Open transaction ↗</a> : null}
          <button type="button" className="wallet-v4-secondary" onClick={switchToDestination} disabled={busy || Number(chainId) === Number(destination.id)}>{Number(chainId) === Number(destination.id) ? `${destination.shortName} active` : `Switch wallet to ${destination.shortName}`}</button>
        </div>
      ) : null}

      <div className="wallet-v4-actions">
        <button type="button" className="wallet-v4-secondary" onClick={handleReview} disabled={!canReview || insufficient || sourceGasMissing || busy}>{status === "quoting" || status === "switching" ? "Preparing review…" : quote ? "Refresh quote" : "Review bridge"}</button>
        <button type="button" className="wallet-v4-primary" onClick={handleBridge} disabled={!quote || insufficient || sourceGasMissing || busy}>{status === "bridging" ? "Confirming in wallet…" : "Confirm in wallet"}</button>
      </div>
    </section>
  );
}
