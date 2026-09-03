import Image from "next/image";
import Link from "next/link";
import { ARC_MAINNET_REQUESTED } from "../lib/arc-chain";
import NetworkSwitcher from "./network-switcher";

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function AppNav({ walletSnapshot }) {
  const isConnected = Boolean(walletSnapshot?.isSignedIn && walletSnapshot?.address);

  const openAssistant = () => {
    if (typeof window !== "undefined") window.location.hash = "agent";
  };

  return (
    <header className="wallet-v3-topbar">
      <div className="wallet-v3-topbar-left">
        <Link href="/#dashboard" className="wallet-v3-brand" aria-label="Lumexa AI Wallet dashboard">
          <span className="wallet-v3-brand-mark"><Image src="/lumexa-ai-wallet-mark-v2.png" alt="" width={44} height={44} sizes="44px" priority /></span>
          <span><strong>Lumexa</strong><small>AI Wallet</small></span>
        </Link>
        <NetworkSwitcher compact />
      </div>

      <div className="wallet-v3-topbar-right">
        {!ARC_MAINNET_REQUESTED ? <span className="wallet-v3-mainnet-pill">Mainnet ready</span> : null}
        <button type="button" className="wallet-v3-ask-button" onClick={openAssistant}><span>✦</span> Ask Lumexa</button>
        {isConnected ? (
          <div className="wallet-v3-account">
            <span className="wallet-v3-account-avatar"><Image src="/lumexa-ai-wallet-mark-v2.png" alt="" width={26} height={26} sizes="26px" /></span>
            <span><strong>{shortAddress(walletSnapshot.address)}</strong><small>{walletSnapshot?.activeChainName || "Connected"}</small></span>
            <button type="button" onClick={walletSnapshot.disconnectWallet} title="Disconnect wallet" aria-label="Disconnect wallet">⌄</button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
