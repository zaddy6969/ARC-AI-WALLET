import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ARC_MAINNET_REQUESTED } from "../lib/arc-chain";
import NetworkSwitcher from "./network-switcher";

const THEME_STORAGE_KEY = "lumexa-wallet-theme";

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.lumexaTheme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
}

function ThemeIcon({ theme }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  if (theme === "light") {
    return (
      <svg {...common}>
        <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
    </svg>
  );
}

export default function AppNav({ walletSnapshot }) {
  const isConnected = Boolean(walletSnapshot?.isSignedIn && walletSnapshot?.address);
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    let savedTheme = "";
    try {
      savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) || "";
    } catch {}

    const nextTheme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const openAssistant = () => {
    if (typeof window !== "undefined") window.location.hash = "agent";
  };

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {}
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
        <button
          type="button"
          className="wallet-v5-theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <ThemeIcon theme={theme} />
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
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
