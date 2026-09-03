import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_REQUESTED,
  ARC_PUBLIC_MAINNET_LAUNCH_DATE,
  MULTICHAIN_WALLET_CHAINS
} from "../lib/arc-chain";

function getChain(chainId) {
  return MULTICHAIN_WALLET_CHAINS.find((chain) => chain.id === Number(chainId)) || null;
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
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function readProviderChainId(provider) {
  if (!provider?.request) return null;
  const value = await provider.request({ method: "eth_chainId" });
  return typeof value === "string" ? Number.parseInt(value, 16) : Number(value);
}

async function waitForProviderChain(provider, expectedChainId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const activeChainId = await readProviderChainId(provider).catch(() => null);
    if (activeChainId === expectedChainId) return true;
    await sleep(250 + attempt * 100);
  }
  return false;
}

export default function NetworkSwitcher({ compact = false }) {
  const chainId = useChainId();
  const { connector, isConnected } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();
  const [error, setError] = useState("");
  const [manualPending, setManualPending] = useState(false);
  const [requestedChainId, setRequestedChainId] = useState(null);
  const currentChain = useMemo(() => getChain(chainId), [chainId]);
  const busy = isPending || manualPending;
  const launchLabel = formatLaunchDate(ARC_PUBLIC_MAINNET_LAUNCH_DATE);

  useEffect(() => {
    if (requestedChainId && chainId === requestedChainId) {
      setRequestedChainId(null);
      setError("");
    }
  }, [chainId, requestedChainId]);

  const addAndSwitchChain = async (provider, chain) => {
    if (!provider?.request) throw new Error("Wallet network switching is unavailable.");
    const hexId = chainIdHex(chain.id);
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hexId,
        chainName: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: chain.rpcUrls.default.http,
        blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : []
      }]
    });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  };

  const forceProviderSwitch = async (provider, chain) => {
    if (!provider?.request) return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex(chain.id) }]
      });
    } catch (switchError) {
      if (!isUnknownChainError(switchError)) throw switchError;
      await addAndSwitchChain(provider, chain);
    }
  };

  const handleChange = async (event) => {
    const nextChainId = Number(event.target.value);
    const nextChain = getChain(nextChainId);
    if (!nextChain || nextChainId === chainId || busy || !isConnected) return;

    setError("");
    setRequestedChainId(nextChainId);
    setManualPending(true);

    try {
      const provider = await connector?.getProvider?.();
      if (!provider?.request) throw new Error("Wallet provider is unavailable.");

      try {
        await switchChainAsync({ chainId: nextChainId });
      } catch (switchError) {
        if (!isUnknownChainError(switchError)) throw switchError;
        await addAndSwitchChain(provider, nextChain);
      }

      let switched = await waitForProviderChain(provider, nextChainId);
      if (!switched) {
        await forceProviderSwitch(provider, nextChain);
        switched = await waitForProviderChain(provider, nextChainId);
      }

      if (!switched) throw new Error("Wallet stayed on the previous network.");
    } catch (nextError) {
      setRequestedChainId(null);
      const message = String(nextError?.message || "").toLowerCase();
      setError(
        message.includes("reject") || message.includes("denied")
          ? "Network switch cancelled"
          : message.includes("previous network")
            ? "Wallet did not switch networks"
            : "Could not switch network"
      );
    } finally {
      setManualPending(false);
    }
  };

  const displayValue = requestedChainId || (currentChain ? currentChain.id : "");

  return (
    <div className={`network-switcher wallet-v3-network-switcher ${compact ? "network-switcher-compact" : ""}`}>
      <label>
        <span className="wallet-v3-network-dot" aria-hidden="true" />
        <select value={displayValue} onChange={handleChange} disabled={busy || !isConnected} aria-label="Switch network">
          {!currentChain && !requestedChainId ? <option value="">Unsupported network</option> : null}
          {MULTICHAIN_WALLET_CHAINS.map((chain) => (
            <option key={chain.id} value={chain.id}>{chain.name}</option>
          ))}
          {!ARC_MAINNET_REQUESTED ? (
            <option value={ARC_MAINNET_CHAIN_ID} disabled>Arc Mainnet — {launchLabel}</option>
          ) : null}
        </select>
      </label>
      {busy ? <small>Switching…</small> : error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
