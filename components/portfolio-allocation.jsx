const TOKEN_COLORS = {
  USDC: "#61d8ff",
  EURC: "#8e6bff",
  cirBTC: "#f6b14a"
};

function getAssets(walletSnapshot) {
  const assets = Array.isArray(walletSnapshot?.assets)
    ? walletSnapshot.assets
    : [];

  return assets.map((asset) => ({
    ...asset,
    balanceValue: Number(asset?.balanceValue) || 0,
    valueUsd: Number(asset?.valueUsd) || 0,
    color: TOKEN_COLORS[asset?.symbol] || "#dce7ff"
  }));
}

function getChartSegments(assets) {
  const totalUnits = assets.reduce(
    (total, asset) => total + Math.max(asset.balanceValue, 0),
    0
  );

  if (totalUnits <= 0) {
    return {
      totalUnits,
      background: "conic-gradient(from 180deg, #61d8ff, #8e6bff, #f6b14a, #61d8ff)"
    };
  }

  let cursor = 0;
  const segments = assets.map((asset) => {
    const start = cursor;
    const size = (Math.max(asset.balanceValue, 0) / totalUnits) * 100;
    cursor += size;
    return `${asset.color} ${start}% ${cursor}%`;
  });

  return {
    totalUnits,
    background: `conic-gradient(from 180deg, ${segments.join(", ")})`
  };
}

export default function PortfolioAllocation({ walletSnapshot, compact = false }) {
  const assets = getAssets(walletSnapshot);
  const readyAssets = assets.filter((asset) => asset.status === "ready");
  const fundedAssets = readyAssets.filter((asset) => asset.balanceValue > 0);
  const displayAssets = readyAssets.length ? readyAssets : assets;
  const chartAssets = fundedAssets.length ? fundedAssets : readyAssets;
  const { totalUnits, background } = getChartSegments(chartAssets);

  return (
    <article className={`card analytics-card allocation-card ${compact ? "allocation-card-compact dashboard-priority-card" : ""}`}>
      <div className="section-heading">
        <div>
          <p className="section-kicker">Portfolio Allocation</p>
          <h2>Arc asset mix</h2>
        </div>
        <span className="status-badge">{displayAssets.length} assets</span>
      </div>

      <div className="allocation-content">
        <div className="allocation-ring" style={{ "--allocation-chart": background }}>
          <span>{fundedAssets[0]?.symbol || "ARC"}</span>
        </div>

        <div className="allocation-asset-list">
          {displayAssets.map((asset) => {
            const percentage =
              totalUnits > 0 ? (Math.max(asset.balanceValue, 0) / totalUnits) * 100 : 0;

            return (
              <div className="allocation-asset-row" key={asset.symbol}>
                <span
                  className="allocation-dot"
                  style={{ "--asset-color": asset.color }}
                  aria-hidden="true"
                />
                <div>
                  <strong>{asset.symbol}</strong>
                  <small>{asset.balance || `0.00 ${asset.symbol}`}</small>
                </div>
                <span>{percentage.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="helper-copy">
        {walletSnapshot?.isSignedIn
          ? "Allocation is generated from real Arc Testnet USDC, EURC, and cirBTC balances."
          : "Connect wallet to generate allocation from real balances."}
      </p>
    </article>
  );
}
