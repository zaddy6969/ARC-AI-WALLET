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
      : 18 + ((index * 13) % 52)
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

export default function PremiumWalletCard({
  walletSnapshot,
  activityItems = [],
  onCopy,
  copied
}) {
  const balanceValue = parseBalance(walletSnapshot?.usdcBalance);
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
          <h1>Arc AI Wallet</h1>
        </div>
        <span className={`status-badge ${isConnected && onArc ? "status-good" : ""}`}>
          {isConnected ? (onArc ? "Connected" : "Wrong network") : "Ready"}
        </span>
      </div>

      <div className="premium-wallet-body">
        <div className="premium-wallet-balance">
          <span>Total balance</span>
          <strong className="balance-counter">{formatUsd(balanceValue)}</strong>
          <small>{walletSnapshot?.usdcBalance || "Connect wallet to sync USDC"}</small>
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
          <strong className="network-pulse-label">{arcTestnet.name}</strong>
        </div>
        <div>
          <span className="field-label">Gas</span>
          <strong>USDC</strong>
        </div>
      </div>
    </section>
  );
}
