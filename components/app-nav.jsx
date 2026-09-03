import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ARC_MAINNET_REQUESTED } from "../lib/arc-chain";
import NetworkSwitcher from "./network-switcher";

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const SEARCH_ROUTES = [
  { words: ["home", "dashboard"], view: "dashboard" },
  { words: ["send", "transfer"], view: "send" },
  { words: ["receive", "deposit", "address"], view: "receive" },
  { words: ["swap", "trade"], view: "swap" },
  { words: ["bridge", "cross chain"], view: "bridge" },
  { words: ["unified", "balance"], view: "unified" },
  { words: ["request", "payment request"], view: "request" },
  { words: ["assets", "portfolio"], view: "portfolio" },
  { words: ["activity", "transactions", "history"], view: "activity" },
  { words: ["ai", "agent", "assistant"], view: "agent" },
  { words: ["explore", "community", "arc"], view: "community" }
];

export default function AppNav({ walletSnapshot }) {
  const isConnected = Boolean(walletSnapshot?.isSignedIn && walletSnapshot?.address);
  const [query, setQuery] = useState("");

  const handleSearch = (event) => {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();
    if (!normalized || typeof window === "undefined") return;

    const route = SEARCH_ROUTES.find((item) =>
      item.words.some((word) => normalized.includes(word))
    );

    window.location.hash = route?.view || "agent";
    setQuery("");
  };

  return (
    <header className="app-nav-shell premium-v2-topbar-shell">
      <div className="app-nav-bar simple-wallet-nav premium-v2-topbar">
        <div className="premium-v2-topbar-left">
          <Link href="/#dashboard" className="app-nav-brand" aria-label="Lumexa AI Wallet dashboard">
            <div className="app-nav-logo" aria-hidden="true">
              <Image
                src="/arc-ai-wallet-mark-v2.png"
                alt=""
                width={42}
                height={42}
                sizes="42px"
                priority
              />
            </div>
            <div className="app-nav-copy">
              <strong>Lumexa AI Wallet</strong>
            </div>
          </Link>
          <NetworkSwitcher compact />
        </div>

        <div className="app-nav-actions simple-wallet-nav-actions premium-v2-topbar-right">
          <form className="premium-v2-search" onSubmit={handleSearch} role="search">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search or jump to…"
              aria-label="Search wallet"
            />
            <kbd>↵</kbd>
          </form>

          {!ARC_MAINNET_REQUESTED ? (
            <span className="premium-v2-launch-pill" title="Arc Mainnet support is prepared for public launch">
              Mainnet ready
            </span>
          ) : null}

          <span className="premium-v2-notification" title="Wallet notifications" aria-label="Wallet notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
            <i />
          </span>

          {isConnected ? (
            <div className="premium-wallet-account premium-v2-account">
              <span className="premium-wallet-avatar premium-v2-avatar" aria-hidden="true">
                <Image src="/arc-ai-wallet-mark-v2.png" alt="" width={24} height={24} sizes="24px" />
              </span>
              <span className="premium-wallet-address" title={walletSnapshot.address}>{shortAddress(walletSnapshot.address)}</span>
              <button type="button" className="premium-wallet-disconnect" onClick={walletSnapshot.disconnectWallet} title="Disconnect wallet" aria-label="Disconnect wallet">⌄</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
