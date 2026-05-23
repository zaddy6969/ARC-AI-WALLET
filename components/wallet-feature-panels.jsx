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

export function ComingSoonPanel({
  kicker,
  title,
  description,
  badge = "Coming Soon"
}) {
  return (
    <section className="card coming-soon-panel">
      <span className="coming-soon-orb" aria-hidden="true" />
      <div>
        <p className="section-kicker">{kicker}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span className="status-badge">{badge}</span>
    </section>
  );
}

export function NftComingSoonCard() {
  return (
    <ComingSoonPanel
      kicker="NFT"
      title="NFT Marketplace & Gallery - Coming Soon"
      description="Collect, view, and trade NFTs directly from your ARC AI Wallet soon."
    />
  );
}

export function PortfolioPanel({ walletSnapshot, activityItems = [] }) {
  const assets = Array.isArray(walletSnapshot?.assets)
    ? walletSnapshot.assets
    : [];
  const visibleAssets = assets.filter(
    (asset) => asset.status !== "not-configured" || asset.symbol === "cirBTC"
  );
  const balanceValue = assets.reduce(
    (total, asset) => total + (Number(asset.valueUsd) || 0),
    0
  ) || parseBalance(walletSnapshot?.usdcBalance);
  const sentCount = activityItems.filter((item) => item.kind === "sent").length;
  const receivedCount = activityItems.filter(
    (item) => item.kind === "received" || item.kind === "bridge_received"
  ).length;

  return (
    <section className="card portfolio-os-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Portfolio</p>
          <h2>Real Arc wallet portfolio</h2>
        </div>
        <span className="status-badge status-good">Arc assets live</span>
      </div>

      <div className="portfolio-os-grid">
        <div className="portfolio-os-balance">
          <span>Total value</span>
          <strong>{formatUsd(balanceValue)}</strong>
          <small>
            {walletSnapshot?.balanceStatus === "loading"
              ? "Arc asset balances are syncing."
              : "USDC and EURC read directly from Arc Testnet."}
          </small>
        </div>
        {visibleAssets.map((asset) => (
          <div className="portfolio-os-asset" key={asset.symbol}>
            <span className="asset-logo">{asset.accent || asset.symbol.slice(0, 1)}</span>
            <div>
              <strong>{asset.symbol}</strong>
              <small>
                {asset.status === "not-configured"
                  ? "Supported by Arc App Kit swap/faucet; balance address not configured."
                  : asset.description}
              </small>
            </div>
            <strong>
              {asset.status === "not-configured"
                ? "Config needed"
                : asset.balance || "0.00 " + asset.symbol}
            </strong>
          </div>
        ))}
        <div className="portfolio-os-metrics">
          <div>
            <span>Sent</span>
            <strong>{sentCount}</strong>
          </div>
          <div>
            <span>Received</span>
            <strong>{receivedCount}</strong>
          </div>
          <div>
            <span>Tracked events</span>
            <strong>{activityItems.length}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
