import PortfolioAllocation from "./portfolio-allocation";

function parseBalance(balance) {
  const numeric = Number(String(balance || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatUsd(value) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

function semanticKind(item) {
  const kind = String(item?.kind || "").toLowerCase();
  const type = String(item?.type || "").toLowerCase();
  if (kind === "bridge_received") return "bridge";
  if (kind) return kind;
  if (type.includes("bridge")) return "bridge";
  if (type.includes("swap")) return "swap";
  return "";
}

export function ComingSoonPanel({ kicker, title, description, badge = "Coming Soon" }) {
  return (
    <section className="card coming-soon-panel">
      <span className="coming-soon-orb" aria-hidden="true" />
      <div><p className="section-kicker">{kicker}</p><h2>{title}</h2><p>{description}</p></div>
      <span className="status-badge">{badge}</span>
    </section>
  );
}

export function NftComingSoonCard() {
  return <ComingSoonPanel kicker="NFT" title="NFT Marketplace & Gallery - Coming Soon" description="Collect, view, and trade NFTs directly from Lumexa soon." />;
}

export function PortfolioPanel({ walletSnapshot, activityItems = [] }) {
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
  const visibleAssets = assets.filter((asset) => asset.status !== "not-configured");
  const balanceValue = assets.reduce((total, asset) => total + (Number(asset.valueUsd) || 0), 0) || parseBalance(walletSnapshot?.usdcBalance);
  const sentCount = activityItems.filter((item) => semanticKind(item) === "sent").length;
  const receivedCount = activityItems.filter((item) => semanticKind(item) === "received").length;
  const bridgeCount = activityItems.filter((item) => semanticKind(item) === "bridge").length;
  const swapCount = activityItems.filter((item) => semanticKind(item) === "swap").length;
  const networkName = walletSnapshot?.activeChainName || "Selected network";

  return (
    <section className="wallet-v3-page-card wallet-v3-portfolio-page">
      <div className="wallet-v3-page-head">
        <div><span className="wallet-v3-eyebrow">Portfolio</span><h2>{networkName} assets</h2><p>Balances update when you switch networks. Lumexa no longer pins this screen to Arc.</p></div>
        <span className="wallet-v3-network-badge"><i />Chain ID {walletSnapshot?.chainId || "—"}</span>
      </div>

      <div className="portfolio-os-grid" style={{ marginTop: 24 }}>
        <div className="portfolio-os-balance">
          <span>Total tracked value</span>
          <strong>{formatUsd(balanceValue)}</strong>
          <small>{walletSnapshot?.balanceStatus === "loading" || walletSnapshot?.balanceStatus === "refreshing" ? `Syncing ${networkName} balances…` : `Live balances from ${networkName}.`}</small>
        </div>
        <PortfolioAllocation walletSnapshot={walletSnapshot} />
        {visibleAssets.map((asset) => (
          <div className="portfolio-os-asset" key={`${walletSnapshot?.chainId}-${asset.symbol}`}>
            <span className="asset-logo">{asset.accent || asset.symbol.slice(0, 1)}</span>
            <div><strong>{asset.symbol}</strong><small>{asset.description || networkName}</small></div>
            <strong>{asset.balance || `0.00 ${asset.symbol}`}</strong>
          </div>
        ))}
        <div className="portfolio-os-metrics">
          <div><span>Sent</span><strong>{sentCount}</strong></div>
          <div><span>Received</span><strong>{receivedCount}</strong></div>
          <div><span>Swaps</span><strong>{swapCount}</strong></div>
          <div><span>Bridges</span><strong>{bridgeCount}</strong></div>
        </div>
      </div>
    </section>
  );
}
