function parseAmount(item) {
  const numeric = Number(String(item?.amount || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getWeeklyTrend(items) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const thisWeek = items.filter((item) => Date.parse(item.createdAt || "") >= now - weekMs);
  const previousWeek = items.filter((item) => {
    const timestamp = Date.parse(item.createdAt || "");
    return timestamp >= now - weekMs * 2 && timestamp < now - weekMs;
  });

  if (!previousWeek.length && thisWeek.length) {
    return "New activity detected this week.";
  }

  if (!thisWeek.length) {
    return "No new Arc USDC activity this week yet.";
  }

  const change = Math.round(((thisWeek.length - previousWeek.length) / Math.max(previousWeek.length, 1)) * 100);
  return `AI detected wallet activity changed by ${change}% this week.`;
}

function buildMonthlyBars(items) {
  const buckets = Array.from({ length: 8 }, (_, index) => ({
    id: index,
    label: `${index + 1}`,
    value: 0
  }));

  for (const item of items) {
    const timestamp = Date.parse(item.createdAt || "");
    if (!Number.isFinite(timestamp)) {
      continue;
    }

    const bucket = Math.min(7, Math.max(0, Math.floor((Date.now() - timestamp) / (4 * 24 * 60 * 60 * 1000))));
    buckets[7 - bucket].value += 1;
  }

  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);
  return buckets.map((bucket) => ({
    ...bucket,
    height: Math.max(10, Math.round((bucket.value / max) * 100))
  }));
}

export default function WalletIntelligencePanel({ activityItems = [], walletSnapshot }) {
  const sentItems = activityItems.filter((item) => item.kind === "sent");
  const receivedItems = activityItems.filter((item) =>
    item.kind === "received" || item.kind === "bridge_received"
  );
  const sentValue = sentItems.reduce((total, item) => total + parseAmount(item), 0);
  const receivedValue = receivedItems.reduce((total, item) => total + parseAmount(item), 0);
  const bars = buildMonthlyBars(activityItems);

  return (
    <section className="wallet-intelligence-grid">
      <article className="ai-insight-hero card">
        <div className="ai-orb-large" aria-hidden="true">
          <span />
        </div>
        <div>
          <p className="section-kicker">AI Analytics</p>
          <h2>Wallet intelligence, powered by real activity.</h2>
          <p>{getWeeklyTrend(activityItems)}</p>
        </div>
      </article>

      <article className="card analytics-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Activity Trend</p>
            <h2>Recent USDC movement</h2>
          </div>
          <span className="status-badge">{activityItems.length} events</span>
        </div>
        <div className="activity-mini-chart" aria-label="Recent activity chart">
          {bars.map((bar) => (
            <span key={bar.id} style={{ height: `${bar.height}%` }} title={`${bar.value} events`} />
          ))}
        </div>
      </article>

      <article className="card analytics-card">
        <p className="section-kicker">Portfolio Allocation</p>
        <div className="allocation-ring" style={{ "--allocation": "100%" }}>
          <span>USDC</span>
        </div>
        <p className="helper-copy">
          {walletSnapshot?.isSignedIn
            ? "Current tracked wallet allocation is focused on Arc Testnet USDC."
            : "Connect wallet to generate allocation from real balances."}
        </p>
      </article>

      <article className="card analytics-card">
        <p className="section-kicker">Flow Summary</p>
        <div className="flow-metrics">
          <div>
            <span>Sent</span>
            <strong>{sentValue.toFixed(2)} USDC</strong>
          </div>
          <div>
            <span>Received</span>
            <strong>{receivedValue.toFixed(2)} USDC</strong>
          </div>
        </div>
      </article>
    </section>
  );
}
