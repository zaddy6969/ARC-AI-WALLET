import { useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_REQUESTED,
  ARC_PUBLIC_MAINNET_LAUNCH_DATE,
  MULTICHAIN_WALLET_CHAINS
} from "../lib/arc-chain";

function getChain(chainId) {
  return MULTICHAIN_WALLET_CHAINS.find((chain) => chain.id === chainId) || null;
}

function chainIdHex(chainId) {
  return `0x${Number(chainId).toString(16)}`;
}

function isUnknownChainError(error) {
  const code = Number(error?.code || error?.cause?.code || 0);
  const message = String(error?.message || error?.cause?.message || "").toLowerCase();
  return code === 4902 || message.includes("unrecognized chain") || message.includes("unknown chain") || message.includes("not added");
}

function formatLaunchDate(value) {
  if (!value) return "Sep 16";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return "Sep 16";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
}

export default function NetworkSwitcher({ compact = false }) {
  const chainId = useChainId();
  const { connector } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();
  const [error, setError] = useState("");
  const [manualPending, setManualPending] = useState(false);
  const currentChain = getChain(chainId);
  const busy = isPending || manualPending;
  const launchLabel = formatLaunchDate(ARC_PUBLIC_MAINNET_LAUNCH_DATE);

  const addAndSwitchChain = async (chain) => {
    const provider = await connector?.getProvider?.();
    if (!provider?.request) {
      throw new Error("Wallet network switching is unavailable.");
    }

    const hexId = chainIdHex(chain.id);
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: chain.blockExplorers?.default?.url
            ? [chain.blockExplorers.default.url]
            : []
        }
      ]
    });

    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }]
    });
  };

  const handleChange = async (event) => {
    const nextChainId = Number(event.target.value);
    const nextChain = getChain(nextChainId);

    if (!nextChain || nextChainId === chainId || busy) return;

    setError("");
    setManualPending(true);

    try {
      try {
        await switchChainAsync({ chainId: nextChainId });
      } catch (switchError) {
        if (!isUnknownChainError(switchError)) throw switchError;
        await addAndSwitchChain(nextChain);
      }
    } catch (nextError) {
      const message = String(nextError?.message || "").toLowerCase();
      setError(
        message.includes("reject") || message.includes("denied")
          ? "Network switch cancelled"
          : "Could not switch network"
      );
    } finally {
      setManualPending(false);
    }
  };

  return (
    <div className={`network-switcher ${compact ? "network-switcher-compact" : ""}`}>
      <label>
        <span className="sr-only">Network</span>
        <span className="network-switcher-dot" aria-hidden="true" />
        <select
          value={currentChain ? currentChain.id : ""}
          onChange={handleChange}
          disabled={busy}
          aria-label="Switch network"
        >
          {!currentChain ? <option value="">Unsupported network</option> : null}
          {MULTICHAIN_WALLET_CHAINS.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
          {!ARC_MAINNET_REQUESTED ? (
            <option value={ARC_MAINNET_CHAIN_ID} disabled>
              Arc Mainnet — pre-launch {launchLabel}
            </option>
          ) : null}
        </select>
      </label>
      {busy ? (
        <small>Switching…</small>
      ) : error ? (
        <small role="alert">{error}</small>
      ) : !ARC_MAINNET_REQUESTED ? (
        <small>Mainnet-ready build · Arc Mainnet goes live {launchLabel}</small>
      ) : null}
    </div>
  );
}
