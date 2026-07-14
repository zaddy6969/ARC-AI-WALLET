import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import {
  getPrimaryExplorerUrl,
  getPrimaryTxHash
} from "../lib/arc-app-kit";
import {
  ARC_BRIDGE_DESTINATION,
  ARC_BRIDGE_SOURCE_OPTIONS
} from "../lib/arc-chain";
import {
  createArcBridgeClient,
  formatBridgeError,
  getBridgeErrorDetail,
  normalizeBridgeSteps,
  summarizeBridgeFees
} from "../lib/arc-bridge";
import { createWalletActionRecord } from "../lib/local-activity";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { WalletConnectCta } from "./wallet-connect";

const DEFAULT_AMOUNT = "1.00";

function isValidAmount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function normalizeAmount(value) {
  return String(value || "").replace(/[^\d.]/g, "");
}

function humanizeStepName(name) {
  return String(name || "Bridge step")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getBridgeStatusCopy(status) {
  switch (status) {
    case "estimating":
      return "Fetching a live bridge estimate from Circle App Kit.";
    case "ready":
      return "Bridge quote ready. Review the fees, then confirm the bridge in your wallet.";
    case "bridging":
      return "Submitting the burn, waiting for attestation, and tracking the mint onto Arc Testnet.";
    case "success":
      return "USDC bridge completed successfully.";
    case "error":
      return "Bridge flow needs attention. Review the message below and try again.";
    default:
      return "Bridge testnet USDC from a supported source chain into Arc Testnet.";
  }
}

export default function BridgeToArcPanel({
  sectionId,
  walletSnapshot,
  onActivitySaved,
  compact = false,
  title = "Bridge USDC to Arc",
  subtitle = "Move supported testnet USDC into Arc Testnet with Circle App Kit."
}) {
  const { address, connector } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const isSignedIn = walletSnapshot?.isSignedIn;
  const connectedAddress = walletSnapshot?.address || address || "";
  const [sourceChainId, setSourceChainId] = useState(ARC_BRIDGE_SOURCE_OPTIONS[0].id);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [recipientAddress, setRecipientAddress] = useState(connectedAddress);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [bridgeResult, setBridgeResult] = useState(null);

  const sourceChain = useMemo(
    () =>
      ARC_BRIDGE_SOURCE_OPTIONS.find((option) => option.id === sourceChainId) ||
      ARC_BRIDGE_SOURCE_OPTIONS[0],
    [sourceChainId]
  );

  const recipientLooksValid = Boolean(recipientAddress) && isAddress(recipientAddress);
  const amountLooksValid = isValidAmount(amount);
  const needsSourceSwitch = isSignedIn && currentChainId !== sourceChain.id;

  const feeRows = useMemo(() => summarizeBridgeFees(estimate), [estimate]);
  const stepRows = useMemo(() => normalizeBridgeSteps(bridgeResult), [bridgeResult]);
  const bridgeTxHash = useMemo(
    () => getPrimaryTxHash(bridgeResult),
    [bridgeResult]
  );
  const bridgeExplorerUrl = useMemo(
    () => getPrimaryExplorerUrl(bridgeResult),
    [bridgeResult]
  );
  const helperCopy = getBridgeStatusCopy(status);

  useEffect(() => {
    if (!connectedAddress) {
      return;
    }

    setRecipientAddress((current) => (current ? current : connectedAddress));
  }, [connectedAddress]);

  const handleEstimate = async () => {
    if (!connector || !isSignedIn || !amountLooksValid || !recipientLooksValid) {
      return;
    }

    setStatus("estimating");
    setError("");
    setErrorDetail("");
    setBridgeResult(null);

    try {
      if (needsSourceSwitch && switchChainAsync) {
        await switchChainAsync({ chainId: sourceChain.id });
      }

      const provider = await connector.getProvider();
      const bridgeClient = await createArcBridgeClient(provider);
      const nextEstimate = await bridgeClient.kit.estimateBridge({
        from: {
          adapter: bridgeClient.adapter,
          chain: sourceChain.appKitChain
        },
        to: {
          adapter: bridgeClient.adapter,
          chain: ARC_BRIDGE_DESTINATION.appKitChain,
          recipientAddress
        },
        amount
      });

      setEstimate(nextEstimate);
      setStatus("ready");
    } catch (nextError) {
      setEstimate(null);
      setStatus("error");
      setError(formatBridgeError(nextError));
      setErrorDetail(getBridgeErrorDetail(nextError));
    }
  };

  const handleBridge = async () => {
    if (
      !connector ||
      !isSignedIn ||
      !amountLooksValid ||
      !recipientLooksValid ||
      !estimate
    ) {
      if (!estimate) {
        setError("Estimate the bridge route before submitting it.");
      }
      return;
    }

    setStatus("bridging");
    setError("");
    setErrorDetail("");

    try {
      if (needsSourceSwitch && switchChainAsync) {
        await switchChainAsync({ chainId: sourceChain.id });
      }

      const provider = await connector.getProvider();
      const bridgeClient = await createArcBridgeClient(provider);
      const result = await bridgeClient.kit.bridge({
        from: {
          adapter: bridgeClient.adapter,
          chain: sourceChain.appKitChain
        },
        to: {
          adapter: bridgeClient.adapter,
          chain: ARC_BRIDGE_DESTINATION.appKitChain,
          recipientAddress
        },
        amount
      });

      setBridgeResult(result);
      setStatus(result.state === "success" ? "success" : result.state || "ready");

      if (result.state === "success") {
        onActivitySaved?.(
          createWalletActionRecord({
            walletAddress: connectedAddress,
            type: "Bridge",
            amount: `${amount} USDC`,
            chain: `${sourceChain.name} -> ${ARC_BRIDGE_DESTINATION.name}`,
            recipient: recipientAddress,
            status: "Confirmed",
            txHash: getPrimaryTxHash(result),
            explorerUrl: getPrimaryExplorerUrl(result),
            summary: `Bridged ${amount} USDC from ${sourceChain.name} to ${ARC_BRIDGE_DESTINATION.name}.`
          })
        );
      }

      if (result.state === "error") {
        setError("The bridge did not complete cleanly. Review the step feed below.");
      }
    } catch (nextError) {
      setStatus("error");
      setError(formatBridgeError(nextError));
      setErrorDetail(getBridgeErrorDetail(nextError));
    }
  };

  const handleSwitchSourceChain = async () => {
    try {
      await switchChainAsync({ chainId: sourceChain.id });
    } catch (nextError) {
      setError(formatBridgeError(nextError));
      setErrorDetail(getBridgeErrorDetail(nextError));
    }
  };

  return (
    <motion.section
      id={sectionId}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="rounded-[28px] border border-white/10 bg-arc-panel p-6 shadow-glass"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">Circle App Kit</Badge>
              <Badge tone="violet">Bridge</Badge>
              <Badge tone="green">Arc Testnet</Badge>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Bridge to Arc
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                {title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
                {subtitle}
              </p>
            </div>
          </div>

          {!isSignedIn ? (
            <WalletConnectCta className="hero-actions-inline" />
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Destination
              </p>
              <strong className="mt-2 block text-white">
                {ARC_BRIDGE_DESTINATION.name}
              </strong>
              <span className="mt-1 block text-xs text-slate-400">
                Minted USDC lands at the connected or custom recipient address.
              </span>
            </div>
          )}
        </div>

        {!isSignedIn ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
              <strong className="text-white">Connect a wallet to bridge testnet USDC.</strong>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                This flow is wired for real App Kit bridging from supported EVM
                testnets into Arc Testnet. Connect first, then choose a source
                chain and amount.
              </p>
            </div>
            <div className="grid gap-3">
              {ARC_BRIDGE_SOURCE_OPTIONS.map((option) => (
                <div
                  key={option.id}
                  className="rounded-[22px] border border-white/10 bg-white/5 p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Source route
                  </p>
                  <strong className="mt-2 block text-white">{option.name}</strong>
                  <p className="mt-2 text-sm text-slate-400">{option.helper}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <label className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Source chain
                </span>
                <select
                  value={sourceChainId}
                  onChange={(event) => {
                    setSourceChainId(Number(event.target.value));
                    setEstimate(null);
                    setBridgeResult(null);
                    setStatus("idle");
                    setError("");
                  }}
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-[rgba(8,13,24,0.9)] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-300/30"
                >
                  {ARC_BRIDGE_SOURCE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-sm text-slate-400">{sourceChain.helper}</p>
              </label>

              <label className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Amount
                </span>
                <input
                  value={amount}
                  onChange={(event) => {
                    setAmount(normalizeAmount(event.target.value));
                    setEstimate(null);
                    setBridgeResult(null);
                    setStatus("idle");
                    setError("");
                  }}
                  inputMode="decimal"
                  placeholder="1.00"
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-[rgba(8,13,24,0.9)] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/30"
                />
                <p className="mt-2 text-sm text-slate-400">
                  Enter the testnet USDC amount to bridge into Arc Testnet.
                </p>
              </label>

              <label className="rounded-[22px] border border-white/10 bg-white/5 p-4 lg:col-span-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Recipient on Arc
                </span>
                <input
                  value={recipientAddress}
                  onChange={(event) => {
                    setRecipientAddress(event.target.value.trim());
                    setEstimate(null);
                    setBridgeResult(null);
                    setStatus("idle");
                    setError("");
                  }}
                  placeholder="0x..."
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-[rgba(8,13,24,0.9)] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/30"
                />
                <p className="mt-2 text-sm text-slate-400">
                  Defaults to your connected address. Use any valid EVM address if you
                  want the minted USDC to land somewhere else on Arc Testnet.
                </p>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {needsSourceSwitch ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSwitchSourceChain}
                  disabled={isSwitchingChain}
                >
                  {isSwitchingChain
                    ? "Switching..."
                    : `Switch to ${sourceChain.shortName}`}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                onClick={handleEstimate}
                disabled={
                  !amountLooksValid ||
                  !recipientLooksValid ||
                  !connector ||
                  isSwitchingChain ||
                  status === "estimating" ||
                  status === "bridging"
                }
              >
                {isSwitchingChain
                  ? "Switching..."
                  : status === "estimating"
                    ? "Estimating..."
                    : "Estimate Bridge"}
              </Button>
              <Button
                type="button"
                onClick={handleBridge}
                disabled={
                  !amountLooksValid ||
                  !recipientLooksValid ||
                  !connector ||
                  !estimate ||
                  needsSourceSwitch ||
                  status === "estimating" ||
                  status === "bridging"
                }
              >
                {status === "bridging" ? "Bridging..." : "Bridge USDC to Arc"}
              </Button>
            </div>
          </>
        )}

        <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Bridge status
              </p>
              <p className="mt-2 text-sm text-slate-200">{helperCopy}</p>
            </div>
            <Badge
              tone={
                status === "success"
                  ? "green"
                  : status === "error"
                    ? "red"
                    : status === "bridging" || status === "estimating"
                      ? "amber"
                      : "blue"
              }
            >
              {status === "idle" ? "Ready" : status}
            </Badge>
          </div>
          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              <p>{error}</p>
              {errorDetail && errorDetail !== error ? (
                <details className="mt-3 text-xs text-rose-100/80">
                  <summary className="cursor-pointer">Technical details</summary>
                  <p className="mt-2 break-words font-mono">{errorDetail}</p>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>

        {feeRows.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {feeRows.map((fee) => (
              <div
                key={`${fee.label}-${fee.value}`}
                className="rounded-[22px] border border-white/10 bg-white/5 p-4"
              >
                <Badge tone={fee.tone}>{fee.label}</Badge>
                <strong className="mt-3 block text-lg text-white">{fee.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {bridgeTxHash ? (
          <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-400/10 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
              Bridge transaction
            </p>
            <p className="mt-2 break-all font-mono text-sm text-white">
              {bridgeTxHash}
            </p>
            {bridgeExplorerUrl ? (
              <a
                href={bridgeExplorerUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-sm font-medium text-emerald-100 underline decoration-emerald-200/30 underline-offset-4"
              >
                View on explorer
              </a>
            ) : null}
          </div>
        ) : null}

        {stepRows.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Bridge progress
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">
                  Step-by-step transfer feed
                </h3>
              </div>
            </div>

            <div className="grid gap-3">
              {stepRows.map((step) => (
                <div
                  key={step.id}
                  className="rounded-[22px] border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {humanizeStepName(step.name)}
                      </p>
                      {step.txHash ? (
                        <p className="mt-2 break-all font-mono text-xs text-slate-400">
                          {step.txHash}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">
                          Waiting for this step to submit.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        tone={
                          step.state === "success"
                            ? "green"
                            : step.state === "error"
                              ? "red"
                              : "amber"
                        }
                      >
                        {step.state}
                      </Badge>
                      {step.explorerUrl ? (
                        <a
                          href={step.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-sky-200 underline decoration-sky-200/30 underline-offset-4"
                        >
                          Open on explorer
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!compact ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Supported routes
              </p>
              <strong className="mt-2 block text-white">
                Ethereum Sepolia / Base Sepolia {"->"} Arc Testnet
              </strong>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Asset
              </p>
              <strong className="mt-2 block text-white">USDC</strong>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Settlement
              </p>
              <strong className="mt-2 block text-white">
                CCTP-backed mint onto Arc
              </strong>
            </div>
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}
