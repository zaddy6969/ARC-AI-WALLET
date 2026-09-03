import { memo } from "react";
import { arcTestnet } from "../lib/arc-chain";
import NetworkSwitcher from "./network-switcher";

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

function getPortfolioValue(walletSnapshot) {
  const assets = Array.isArray(walletSnapshot?.assets)
    ? walletSnapshot.assets
    : [];
  const assetValue = assets.reduce(
    (total, asset) => total + (Number(asset?.valueUsd) || 0),
    0
  );

  return assetValue || parseBalance(walletSnapshot?.usdcBalance);
}

function getBalanceSummary(walletSnapshot) {
  const assets = Array.isArray(walletSnapshot?.assets)
    ? walletSnapshot.assets
    : [];
  const readyAssets = assets.filter(
    (asset) => asset?.status === "ready" && Number(asset?.balanceValue) > 0
  );

  if (!readyAssets.length) {
    return walletSnapshot?.usdcBalance || "Connect wallet to sync assets";
  }

  return readyAssets
    .map((asset) => `${asset.balance}`)
    .join(" + ");
}

function formatUsd(value) {
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)}`;
}

function buildActivityBars(activityItems = []) {
  const buckets = Array.from({ length: 18 }, (_, index) => ({
    id: index,
    value: 0
  }));

  for (const item of activityItems) {
    const timestamp = Date.parse(item?.createdAt || "");

    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const bucket = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((Date.now() - timestamp) / (12 * 60 * 60 * 1000)))
    );
    buckets[buckets.length - 1 - bucket].value += 1;
  }

  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);

  return buckets.map((bucket, index) => ({
    ...bucket,
    height: activityItems.length
      ? Math.max(16, Math.round((bucket.value / max) * 100))
      : 8
  }));
}

function getWalletHealth({ isConnected, onArc, balanceValue, activityCount }) {
  let score = 54;

  if (isConnected) {
    score += 16;
  }

  if (onArc) {
    score += 16;
  }

  if (balanceValue > 0) {
    score += 8;
  }

  if (activityCount > 0) {
    score += 6;
  }

  return Math.min(score, 100);
}

function PremiumWalletCard({
  walletSnapshot,
  activityItems = [],
  onCopy,
  copied,
  onDisconnect
}) {
  const balanceValue = getPortfolioValue(walletSnapshot);
  const balanceSummary = getBalanceSummary(walletSnapshot);
  const isConnected = Boolean(walletSnapshot?.isSignedIn);
  const onArc = Boolean(walletSnapshot?.onArc);
  const bars = buildActivityBars(activityItems);
  const healthScore = getWalletHealth({
    isConnected,
    onArc,
    balanceValue,
    activityCount: activityItems.length
  });

  return (
    <section className="premium-wallet-card">
      <span className="wallet-card-particle wallet-card-particle-one" />
      <span className="wallet-card-particle wallet-card-particle-two" />
      <span className="wallet-card-particle wallet-card-particle-three" />
      <div className="wallet-light-sweep" />
      <div className="wallet-mesh-layer" aria-hidden="true" />

      <div className="premium-wallet-top">
        <div className="wallet-avatar-orb" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="section-kicker">AI Native Wallet</p>
          <h1>Lumexa AI Wallet</h1>
        </div>
        <span className={`status-badge ${isConnected && onArc ? "status-good" : ""}`}>
          {isConnected ? (onArc ? "Connected" : "Wrong network") : "Ready"}
        </span>
      </div>

      <div className="premium-wallet-body">
        <div className="premium-wallet-balance">
          <span>Total balance</span>
          <strong className="balance-counter">{formatUsd(balanceValue)}</strong>
          <small>{balanceSummary}</small>
        </div>

        <div className="wallet-live-console" aria-label="AI wallet status">
          <div className="wallet-live-orb" aria-hidden="true">
            <span />
          </div>
          <div className="wallet-live-graph">
            {bars.map((bar) => (
              <span
                key={bar.id}
                style={{ height: `${bar.height}%`, animationDelay: `${bar.id * 35}ms` }}
              />
            ))}
          </div>
          <div className="wallet-live-metrics">
            <div>
              <span className="field-label">Wallet health</span>
              <strong>{healthScore}%</strong>
            </div>
            <div>
              <span className="field-label">AI status</span>
              <strong>{isConnected ? "Scanning" : "Ready"}</strong>
            </div>
            <div>
              <span className="field-label">Activity</span>
              <strong>{activityItems.length} events</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="premium-wallet-footer">
        <div>
          <span className="field-label">Wallet</span>
          <div className="wallet-footer-actions">
            <button
              type="button"
              className="wallet-address-pill"
              onClick={onCopy}
              disabled={!walletSnapshot?.address}
            >
              {copied ? "Copied" : shortenAddress(walletSnapshot?.address)}
            </button>
            {walletSnapshot?.address ? (
              <button
                type="button"
                className="wallet-disconnect-pill"
                onClick={onDisconnect}
              >
                Disconnect
              </button>
            ) : null}
          </div>
        </div>
        <div>
          <span className="field-label">Network</span>
          <strong className="network-pulse-label">
            {walletSnapshot?.onArc ? arcTestnet.name : "Switch network"}
          </strong>
        </div>
        <div>
          <NetworkSwitcher compact />
        </div>
      </div>
    </section>
  );
}

export default memo(PremiumWalletCard);
