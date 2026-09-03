import { memo } from "react";

const TOKEN_COLORS = {
  USDC: "#315cf5",
  EURC: "#31a6d6",
  cirBTC: "#e89128",
  ETH: "#7557d8"
};

function getAssets(walletSnapshot) {
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
  return assets.map((asset) => ({
    ...asset,
    balanceValue: Number(asset?.balanceValue) || 0,
    valueUsd: Number(asset?.valueUsd) || 0,
    color: TOKEN_COLORS[asset?.symbol] || "#9aa9c7"
  }));
}

function formatUsd(value) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
}

function getChartSegments(assets) {
  const totalUnits = assets.reduce((total, asset) => total + Math.max(asset.valueUsd || asset.balanceValue, 0), 0);
  if (totalUnits <= 0) return { totalUnits, background: "conic-gradient(#dce3ee 0 100%)" };
  let cursor = 0;
  const segments = assets.map((asset) => {
    const start = cursor;
    const size = (Math.max(asset.valueUsd || asset.balanceValue, 0) / totalUnits) * 100;
    cursor += size;
    return `${asset.color} ${start}% ${cursor}%`;
  });
  return { totalUnits, background: `conic-gradient(from 180deg, ${segments.join(", ")})` };
}

function getCenterLabel(fundedAssets, walletSnapshot) {
  if (!fundedAssets.length) return walletSnapshot?.activeChainName?.split(" ")[0]?.toUpperCase() || "WALLET";
  if (fundedAssets.length === 1) return fundedAssets[0].symbol;
  return `${fundedAssets.length} ASSETS`;
}

function PortfolioAllocation({ walletSnapshot, compact = false, onOpenPortfolio }) {
  const assets = getAssets(walletSnapshot);
  const readyAssets = assets.filter((asset) => asset.status === "ready");
  const fundedAssets = readyAssets.filter((asset) => asset.balanceValue > 0 || asset.valueUsd > 0);
  const displayAssets = readyAssets.length ? readyAssets : assets;
  const chartAssets = fundedAssets.length ? fundedAssets : readyAssets;
  const { totalUnits, background } = getChartSegments(chartAssets);
  const isInteractive = typeof onOpenPortfolio === "function";

  const handleKeyDown = (event) => {
    if (!isInteractive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenPortfolio();
    }
  };

  return (
    <article
      className={`card analytics-card allocation-card ${compact ? "allocation-card-compact dashboard-priority-card" : ""} ${isInteractive ? "allocation-card-interactive" : ""}`}
      onClick={isInteractive ? onOpenPortfolio : undefined}
      onKeyDown={handleKeyDown}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? "Open portfolio details" : undefined}
    >
      <div className="section-heading">
        <div><p className="section-kicker">Portfolio Allocation</p><h2>{walletSnapshot?.activeChainName || "Wallet"} asset mix</h2></div>
        <span className="status-badge">{isInteractive ? "Open" : `${displayAssets.length} assets`}</span>
      </div>

      <div className="allocation-content">
        <div className="allocation-pie-wrap">
          <div className="allocation-pie" style={{ "--allocation-chart": background }}><span className="allocation-pie-core" aria-hidden="true" /></div>
          <strong>{getCenterLabel(fundedAssets, walletSnapshot)}</strong>
        </div>
        <div className="allocation-asset-list">
          {displayAssets.map((asset) => {
            const percentage = totalUnits > 0 ? (Math.max(asset.valueUsd || asset.balanceValue, 0) / totalUnits) * 100 : 0;
            return (
              <div className="allocation-asset-row" key={asset.symbol}>
                <span className="allocation-dot" style={{ "--asset-color": asset.color }} aria-hidden="true" />
                <div><strong>{asset.symbol}</strong><small>{asset.balance || `0.00 ${asset.symbol}`} / {asset.priceUsd ? formatUsd(asset.valueUsd) : "balance only"}</small></div>
                <span>{percentage.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {!compact ? <p className="helper-copy">{walletSnapshot?.isSignedIn ? `Allocation uses the balances currently loaded from ${walletSnapshot?.activeChainName || "the selected network"}.` : "Connect wallet to generate allocation."}</p> : null}
    </article>
  );
}

export default memo(PortfolioAllocation);
