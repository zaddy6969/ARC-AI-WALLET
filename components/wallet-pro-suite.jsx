import { memo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { FeatureIcon } from "./wallet-sidebar";
import { ARC_TESTNET_NETWORK_CONFIG, ARC_USDC_ERC20_ADDRESS, arcTestnet } from "../lib/arc-chain";

const CIRCLE_FAUCET_URL = "https://faucet.circle.com";
const ARC_DOCS_URL = "https://docs.arc.network";
const ARC_COMMUNITY_URL = "https://community.arc.network";
const ARC_EXPLORER_URL = ARC_TESTNET_NETWORK_CONFIG.explorerUrl;

function parseBalance(value) {
  const numeric = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatUsd(value) {
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0))}`;
}

function shorten(value, start = 6, end = 4) {
  if (!value) return "";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function getPortfolioValue(walletSnapshot) {
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
  const value = assets.reduce((sum, asset) => sum + (Number(asset?.valueUsd) || 0), 0);
  return value || parseBalance(walletSnapshot?.usdcBalance);
}

function getReadyAssets(walletSnapshot) {
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
  return assets.filter((asset) => asset?.status === "ready").slice(0, 4);
}

function openExternal(url) {
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

export const WalletOverviewCard = memo(function WalletOverviewCard({
  walletSnapshot,
  copied,
  onCopy,
  onDisconnect,
  onSelectView,
  onReceive
}) {
  const totalValue = getPortfolioValue(walletSnapshot);
  const assets = getReadyAssets(walletSnapshot);
  const usdc = assets.find((asset) => asset.symbol === "USDC");
  const actions = [
    { id: "send", label: "Send", icon: "send", onClick: () => onSelectView?.("send") },
    { id: "receive", label: "Receive", icon: "receive", onClick: onReceive },
    { id: "swap", label: "Swap", icon: "swap", onClick: () => onSelectView?.("swap") },
    { id: "bridge", label: "Bridge", icon: "bridge", onClick: () => onSelectView?.("bridge") }
  ];

  return (
    <section className="wallet-overview-card wallet-overview-simple">
      <div className="wallet-overview-main">
        <span className="wallet-balance-label">Total balance</span>
        <strong className="wallet-overview-balance">{formatUsd(totalValue)}</strong>
        <p className="wallet-primary-balance">{usdc?.balance || walletSnapshot?.usdcBalance || "Syncing…"}</p>

        <div className="wallet-overview-actions">
          {actions.map((action) => (
            <button type="button" key={action.id} onClick={action.onClick}>
              <span><FeatureIcon name={action.icon} /></span>
              {action.label}
            </button>
          ))}
        </div>

        <div className="wallet-overview-footer">
          <button type="button" onClick={onCopy} title={walletSnapshot?.address}>
            {copied ? "Copied" : shorten(walletSnapshot?.address)}
          </button>
          <button type="button" onClick={onDisconnect}>Disconnect</button>
        </div>
      </div>
    </section>
  );
});

function AssetsCard({ walletSnapshot, onSelectView }) {
  const assets = getReadyAssets(walletSnapshot);

  return (
    <article className="pro-dashboard-card assets-card">
      <div className="pro-card-heading">
        <strong>Assets</strong>
        <button type="button" onClick={() => onSelectView?.("portfolio")}>See all</button>
      </div>
      <div className="pro-asset-list">
        {assets.length ? assets.map((asset) => (
          <div key={asset.symbol}>
            <span className="pro-token-icon">{asset.symbol.slice(0, 1)}</span>
            <span><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
            <span><strong>{asset.balance || `0 ${asset.symbol}`}</strong><small>{formatUsd(asset.valueUsd)}</small></span>
          </div>
        )) : (
          <div className="pro-empty-row"><span>Balances are syncing.</span></div>
        )}
      </div>
    </article>
  );
}

function RecentCard({ activityItems = [], onSelectView }) {
  const items = activityItems.slice(0, 4);

  return (
    <article className="pro-dashboard-card recent-card">
      <div className="pro-card-heading">
        <strong>Activity</strong>
        <button type="button" onClick={() => onSelectView?.("activity")}>See all</button>
      </div>
      <div className="pro-recent-list">
        {items.length ? items.map((item) => (
          <button type="button" key={item.id || item.txHash} onClick={() => onSelectView?.("activity")}>
            <span className="pro-activity-icon">{item.kind === "sent" ? "↑" : item.kind === "received" ? "↓" : item.kind === "swap" ? "⇄" : "↗"}</span>
            <span><strong>{item.type || "Transaction"}</strong><small>{item.timeLabel || "Recently"}</small></span>
            <span><strong>{item.amount || "Tracked"}</strong><small>{item.txHashShort || shorten(item.txHash || "")}</small></span>
          </button>
        )) : (
          <div className="pro-empty-row"><span>No activity yet.</span></div>
        )}
      </div>
    </article>
  );
}

export function FastDashboardPanel({ walletSnapshot, activityItems = [], onSelectView }) {
  return (
    <section className="fast-dashboard fast-dashboard-simple">
      <div className="fast-dashboard-grid">
        <AssetsCard walletSnapshot={walletSnapshot} onSelectView={onSelectView} />
        <RecentCard activityItems={activityItems} onSelectView={onSelectView} />
      </div>
    </section>
  );
}

export function TransactionGuardianBanner({ mode = "wallet" }) {
  const labels = {
    send: "Check address and amount before signing.",
    swap: "Check quote and approval before signing.",
    bridge: "Check source chain and amount before signing."
  };
  return <div className="pro-guardian pro-guardian-compact"><span>✓</span><p>{labels[mode] || "Your wallet controls every signature."}</p></div>;
}

export function ActivityInterpreterPanel({ activityItems = [], onAskCopilot }) {
  const latest = activityItems[0];
  if (!latest) return null;

  return (
    <section className="pro-interpreter pro-interpreter-compact">
      <div><strong>{latest.type || "Latest transaction"}</strong><span>{latest.amount || latest.txHashShort || ""}</span></div>
      <button type="button" onClick={() => onAskCopilot?.(`Explain my latest transaction ${latest.txHash || ""}`)}>Explain</button>
    </section>
  );
}

export function PaymentRequestPanel({ walletSnapshot }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const address = walletSnapshot?.address || "";
  const units = amount && Number(amount) > 0 ? BigInt(Math.round(Number(amount) * 1_000_000)).toString() : "0";
  const uri = address
    ? `ethereum:${ARC_USDC_ERC20_ADDRESS}@${arcTestnet.id}/transfer?address=${address}&uint256=${units}`
    : "";

  async function copyRequest() {
    if (!uri) return;
    const message = `${amount || "0"} USDC${note ? ` · ${note}` : ""}\n${uri}`;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  return (
    <section className="pro-request-panel wallet-page-card">
      <div className="simple-page-heading"><h2>Request USDC</h2></div>
      <div className="pro-request-grid">
        <div className="pro-request-form">
          <label><span>Amount</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="25.00" /></label>
          <label><span>Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" maxLength={80} /></label>
          <button className="button button-primary" type="button" onClick={copyRequest} disabled={!address || !amount}>{copied ? "Copied" : "Copy request"}</button>
        </div>
        <div className="pro-request-qr">
          <div className="qr-surface">{uri ? <QRCodeSVG value={uri} size={180} level="M" /> : <span>Connect wallet</span>}</div>
          <strong>{amount || "0.00"} USDC</strong>
        </div>
      </div>
    </section>
  );
}

export function CommunityHubPanel({ onSelectView }) {
  const links = [
    { title: "Arc Docs", url: ARC_DOCS_URL },
    { title: "Arc Community", url: ARC_COMMUNITY_URL },
    { title: "ArcScan", url: ARC_EXPLORER_URL },
    { title: "USDC Faucet", url: CIRCLE_FAUCET_URL }
  ];

  return (
    <section className="wallet-page-card community-simple">
      <div className="simple-page-heading"><h2>Explore Arc</h2></div>
      <div className="community-link-grid">
        {links.map((item) => (
          <button type="button" key={item.title} onClick={() => openExternal(item.url)}><strong>{item.title}</strong><span>↗</span></button>
        ))}
      </div>
      <button className="button button-secondary" type="button" onClick={() => onSelectView?.("bridge")}>Bridge to Arc</button>
    </section>
  );
}
