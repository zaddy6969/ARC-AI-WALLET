import Link from "next/link";
import { arcTestnet } from "../lib/arc-chain";

function shortenAddress(address) {
  if (!address) {
    return "No wallet";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getPortfolioValue(walletSnapshot) {
  const assets = Array.isArray(walletSnapshot?.assets)
    ? walletSnapshot.assets
    : [];
  const assetValue = assets.reduce(
    (total, asset) => total + (Number(asset?.valueUsd) || 0),
    0
  );

  const fallback = Number(
    String(walletSnapshot?.usdcBalance || "").replace(/[^\d.-]/g, "")
  );

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(assetValue || (Number.isFinite(fallback) ? fallback : 0));
}

export default function AppNav({ walletSnapshot }) {
  return (
    <header className="app-nav-shell">
      <div className="app-nav-bar">
        <Link href="/" className="app-nav-brand">
          <div className="app-nav-logo">
            <img
              src="/arc-ai-wallet-mark.png"
              alt="Arc AI Wallet"
            />
          </div>
          <div className="app-nav-copy">
            <span>AI Native Wallet</span>
            <strong>Arc AI Wallet</strong>
            <small>Built on {arcTestnet.name}</small>
          </div>
        </Link>

        <div className="app-nav-actions">
          <div className="app-nav-value">
            <span>Portfolio</span>
            <strong>{getPortfolioValue(walletSnapshot)}</strong>
          </div>
          <div className="app-nav-wallet-pill">
            {shortenAddress(walletSnapshot?.address)}
          </div>
          <div className="app-nav-status" aria-label="Arc Testnet status">
            <span />
            <strong>{walletSnapshot?.onArc ? "Arc online" : arcTestnet.name}</strong>
          </div>
          <button type="button" className="app-nav-icon-button" aria-label="Notifications">
            <span>N</span>
          </button>
          <button type="button" className="app-nav-icon-button" aria-label="Settings">
            <span>S</span>
          </button>
          <div className="app-nav-avatar" aria-label="Wallet profile">
            {walletSnapshot?.address ? walletSnapshot.address.slice(2, 4).toUpperCase() : "AI"}
          </div>
        </div>
      </div>
    </header>
  );
}
