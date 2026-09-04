import Image from "next/image";
import Link from "next/link";
import { ARC_MAINNET_REQUESTED } from "../lib/arc-chain";
import NetworkSwitcher from "./network-switcher";

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function ThemeIcon({ theme }) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 14.4A8.2 8.2 0 0 1 9.6 3.5 8.4 8.4 0 1 0 20.5 14.4Z" />
    </svg>
  );
}

export default function AppNav({ walletSnapshot, theme = "dark", onToggleTheme }) {
  const isConnected = Boolean(walletSnapshot?.isSignedIn && walletSnapshot?.address);

  const openAssistant = () => {
    if (typeof window !== "undefined") window.location.hash = "agent";
  };

  return (
    <header className="wallet-v3-topbar wallet-v4-topbar">
      <div className="wallet-v3-topbar-left wallet-v4-topbar-left">
        <Link href="/#dashboard" className="wallet-v3-brand wallet-v4-brand" aria-label="Lumexa AI Wallet dashboard">
          <span className="wallet-v3-brand-mark"><Image src="/lumexa-ai-wallet-mark-v2.png" alt="" width={44} height={44} sizes="44px" priority /></span>
          <span><strong>Lumexa</strong><small>AI Wallet</small></span>
        </Link>
        <NetworkSwitcher compact />
      </div>

      <div className="wallet-v3-topbar-right wallet-v4-topbar-right">
        {!ARC_MAINNET_REQUESTED ? <span className="wallet-v3-mainnet-pill">Mainnet ready</span> : null}
        <button type="button" className="wallet-v4-theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
          <ThemeIcon theme={theme} />
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
        <button type="button" className="wallet-v3-ask-button" onClick={openAssistant}><span>✦</span><b>Ask Lumexa</b></button>
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
