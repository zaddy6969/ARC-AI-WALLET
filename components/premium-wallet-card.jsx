import { arcTestnet } from "../lib/arc-chain";

function shortenAddress(address) {
  if (!address) {
    return "No wallet connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function parseBalance(balance) {
  const numeric = Number(String(balance || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatUsd(value) {
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)}`;
}

export default function PremiumWalletCard({ walletSnapshot, onCopy, copied }) {
  const balanceValue = parseBalance(walletSnapshot?.usdcBalance);
  const isConnected = Boolean(walletSnapshot?.isSignedIn);
  const onArc = Boolean(walletSnapshot?.onArc);

  return (
    <section className="premium-wallet-card">
      <span className="wallet-card-particle wallet-card-particle-one" />
      <span className="wallet-card-particle wallet-card-particle-two" />
      <div className="wallet-light-sweep" />

      <div className="premium-wallet-top">
        <div className="wallet-avatar-orb" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="section-kicker">AI Native Wallet</p>
          <h1>Arc AI Wallet</h1>
        </div>
        <span className={`status-badge ${isConnected && onArc ? "status-good" : ""}`}>
          {isConnected ? (onArc ? "Connected" : "Wrong network") : "Ready"}
        </span>
      </div>

      <div className="premium-wallet-balance">
        <span>Total balance</span>
        <strong className="balance-counter">{formatUsd(balanceValue)}</strong>
        <small>{walletSnapshot?.usdcBalance || "Connect wallet to sync USDC"}</small>
      </div>

      <div className="premium-wallet-footer">
        <div>
          <span className="field-label">Wallet</span>
          <button
            type="button"
            className="wallet-address-pill"
            onClick={onCopy}
            disabled={!walletSnapshot?.address}
          >
            {copied ? "Copied" : shortenAddress(walletSnapshot?.address)}
          </button>
        </div>
        <div>
          <span className="field-label">Network</span>
          <strong>{arcTestnet.name}</strong>
        </div>
        <div>
          <span className="field-label">Gas</span>
          <strong>USDC</strong>
        </div>
      </div>
    </section>
  );
}
