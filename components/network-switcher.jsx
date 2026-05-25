import { useState } from "react";
import { useChainId, useSwitchChain } from "wagmi";
import { MULTICHAIN_WALLET_CHAINS } from "../lib/arc-chain";

function getChainLabel(chainId) {
  return (
    MULTICHAIN_WALLET_CHAINS.find((chain) => chain.id === chainId)?.name ||
    "Unsupported network"
  );
}

export default function NetworkSwitcher({ compact = false }) {
  const chainId = useChainId();
  const { switchChainAsync, isPending } = useSwitchChain();
  const [error, setError] = useState("");
  const currentChainId = MULTICHAIN_WALLET_CHAINS.some(
    (chain) => chain.id === chainId
  )
    ? chainId
    : "";

  const handleChange = async (event) => {
    const nextChainId = Number(event.target.value);

    if (!nextChainId || nextChainId === chainId) {
      return;
    }

    try {
      setError("");
      await switchChainAsync({ chainId: nextChainId });
    } catch (nextError) {
      const rejected =
        nextError instanceof Error &&
        nextError.message.toLowerCase().includes("reject");

      setError(
        rejected
          ? "Network switch rejected."
          : "Unable to switch network. Try from your wallet."
      );
    }
  };

  return (
    <div className={`network-switcher ${compact ? "network-switcher-compact" : ""}`}>
      <label>
        <span className="field-label">Change network</span>
        <select
          value={currentChainId}
          onChange={handleChange}
          disabled={isPending || !switchChainAsync}
          aria-label="Change wallet network"
        >
          {currentChainId === "" ? (
            <option value="">{getChainLabel(chainId)}</option>
          ) : null}
          {MULTICHAIN_WALLET_CHAINS.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </label>
      {isPending || error ? (
        <small>{isPending ? "Switching network..." : error}</small>
      ) : null}
    </div>
  );
}
