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
  const balanceValue = parseBalance(walletSnapshot?.usdcBalance);
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
        <span className="status-badge status-good">USDC live</span>
      </div>

      <div className="portfolio-os-grid">
        <div className="portfolio-os-balance">
          <span>Total value</span>
          <strong>{formatUsd(balanceValue)}</strong>
          <small>{walletSnapshot?.usdcBalance || "USDC balance is syncing from Arc."}</small>
        </div>
        <div className="portfolio-os-asset">
          <span className="asset-logo">U</span>
          <div>
            <strong>USDC</strong>
            <small>Arc Testnet gas and payment asset</small>
          </div>
          <strong>{walletSnapshot?.usdcBalance || "Syncing"}</strong>
        </div>
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
