import { memo, useMemo, useState } from "react";
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
  if (!value) return "Not connected";
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
  activityItems = [],
  copied,
  onCopy,
  onDisconnect,
  onSelectView,
  onReceive,
  onAiOpen
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
    <section className="wallet-overview-card">
      <div className="wallet-overview-main">
        <div className="wallet-overview-label-row">
          <span>Portfolio balance</span>
          <span className={`network-state ${walletSnapshot?.onArc ? "is-ready" : ""}`}>
            <i /> {walletSnapshot?.onArc ? "Arc connected" : "Switch to Arc"}
          </span>
        </div>
        <strong className="wallet-overview-balance">{formatUsd(totalValue)}</strong>
        <p>{usdc?.balance || walletSnapshot?.usdcBalance || "Balance syncing…"}</p>

        <div className="wallet-overview-actions">
          {actions.map((action) => (
            <button type="button" key={action.id} onClick={action.onClick}>
              <span><FeatureIcon name={action.icon} /></span>
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <aside className="wallet-overview-side">
        <div className="wallet-overview-wallet">
          <span>Connected wallet</span>
          <strong>{shorten(walletSnapshot?.address)}</strong>
          <div>
            <button type="button" onClick={onCopy}>{copied ? "Copied" : "Copy address"}</button>
            <button type="button" onClick={onDisconnect}>Disconnect</button>
          </div>
        </div>
        <div className="wallet-overview-mini-grid">
          <div><span>Activity</span><strong>{activityItems.length}</strong></div>
          <div><span>Network</span><strong>Arc</strong></div>
          <div><span>Gas</span><strong>USDC</strong></div>
          <button type="button" onClick={onAiOpen}><span>AI</span><strong>Ask Copilot</strong></button>
        </div>
      </aside>
    </section>
  );
});

function FastCommandBar({ onSelectView, onReceive, onAskCopilot }) {
  const [command, setCommand] = useState("");
  const [feedback, setFeedback] = useState("Ask about your wallet or open an action instantly.");

  function runCommand(event) {
    event.preventDefault();
    const text = command.trim();
    const lower = text.toLowerCase();
    if (!text) return;

    const route =
      /\bbridge\b|move.*arc/.test(lower) ? "bridge" :
      /\bswap\b|exchange|convert/.test(lower) ? "swap" :
      /\brequest\b|invoice|payment link|qr/.test(lower) ? "request" :
      /\breceive\b|my address/.test(lower) ? "receive" :
      /\bsend\b|\bpay\b|transfer/.test(lower) ? "send" :
      /\bportfolio\b|assets|holdings|tokens/.test(lower) ? "portfolio" :
      /\bactivity\b|history|transactions/.test(lower) ? "activity" :
      /\bcommunity\b|faucet|docs|ecosystem/.test(lower) ? "community" : null;

    if (route === "receive") {
      onReceive?.();
      setFeedback("Receive address opened.");
    } else if (route) {
      onSelectView?.(route);
      setFeedback(`Opening ${route}.`);
    } else {
      onAskCopilot?.(text);
      setFeedback("Sent to Arc AI Copilot.");
    }
    setCommand("");
  }

  return (
    <section className="pro-command-card">
      <div className="pro-command-heading">
        <span className="pro-ai-mark"><FeatureIcon name="ai" /></span>
        <div>
          <span>Arc AI</span>
          <strong>Wallet command</strong>
        </div>
      </div>
      <form onSubmit={runCommand}>
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder='Try “show my balance” or “send 5 USDC”'
          aria-label="Arc AI wallet command"
        />
        <button type="submit">Run</button>
      </form>
      <p>{feedback}</p>
      <div className="pro-command-chips">
        {["Analyze my wallet", "Show my balance", "Explain my last transaction"].map((label) => (
          <button type="button" key={label} onClick={() => onAskCopilot?.(label)}>{label}</button>
        ))}
      </div>
    </section>
  );
}

function WalletReadiness({ walletSnapshot, activityItems = [], onSelectView }) {
  const funded = parseBalance(walletSnapshot?.usdcBalance) > 0;
  const checks = [
    { label: "Wallet", value: walletSnapshot?.address ? "Connected" : "Not connected", ok: Boolean(walletSnapshot?.address) },
    { label: "Network", value: walletSnapshot?.onArc ? "Arc ready" : "Switch required", ok: Boolean(walletSnapshot?.onArc) },
    { label: "USDC", value: funded ? walletSnapshot.usdcBalance : "Get test USDC", ok: funded },
    { label: "Activity", value: activityItems.length ? `${activityItems.length} tracked` : "No activity yet", ok: activityItems.length > 0 }
  ];

  return (
    <article className="pro-dashboard-card readiness-card">
      <div className="pro-card-heading">
        <div><span>Wallet status</span><strong>Ready for Arc</strong></div>
        <button type="button" onClick={() => openExternal(CIRCLE_FAUCET_URL)}>Faucet</button>
      </div>
      <div className="readiness-list">
        {checks.map((item) => (
          <div key={item.label}>
            <span className={`readiness-dot ${item.ok ? "is-ready" : ""}`}>{item.ok ? "✓" : "!"}</span>
            <span><strong>{item.label}</strong><small>{item.value}</small></span>
          </div>
        ))}
      </div>
      {!walletSnapshot?.onArc ? (
        <button className="pro-card-action" type="button" onClick={() => onSelectView?.("send")}>Switch network from Send →</button>
      ) : null}
    </article>
  );
}

function AssetsCard({ walletSnapshot, onSelectView }) {
  const assets = getReadyAssets(walletSnapshot);
  return (
    <article className="pro-dashboard-card assets-card">
      <div className="pro-card-heading">
        <div><span>Assets</span><strong>Arc portfolio</strong></div>
        <button type="button" onClick={() => onSelectView?.("portfolio")}>View all</button>
      </div>
      <div className="pro-asset-list">
        {assets.length ? assets.map((asset) => (
          <div key={asset.symbol}>
            <span className="pro-token-icon">{asset.symbol.slice(0, 1)}</span>
            <span><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
            <span><strong>{asset.balance || `0 ${asset.symbol}`}</strong><small>{formatUsd(asset.valueUsd)}</small></span>
          </div>
        )) : (
          <div className="pro-empty-row"><span>Balances are syncing from Arc.</span></div>
        )}
      </div>
    </article>
  );
}

function RecentCard({ activityItems = [], onSelectView, onAskCopilot }) {
  const items = activityItems.slice(0, 4);
  return (
    <article className="pro-dashboard-card recent-card">
      <div className="pro-card-heading">
        <div><span>Recent activity</span><strong>Latest wallet moves</strong></div>
        <button type="button" onClick={() => onSelectView?.("activity")}>View all</button>
      </div>
      <div className="pro-recent-list">
        {items.length ? items.map((item) => (
          <button type="button" key={item.id || item.txHash} onClick={() => onAskCopilot?.(`Explain transaction ${item.txHash || item.txHashShort || "latest"}`)}>
            <span className="pro-activity-icon">{item.kind === "sent" ? "↑" : item.kind === "received" ? "↓" : item.kind === "swap" ? "⇄" : "↗"}</span>
            <span><strong>{item.type || "Transaction"}</strong><small>{item.timeLabel || "Recently"}</small></span>
            <span><strong>{item.amount || "Tracked"}</strong><small>{item.txHashShort || shorten(item.txHash || "")}</small></span>
          </button>
        )) : (
          <div className="pro-empty-row"><span>Your Arc transactions will appear here.</span></div>
        )}
      </div>
    </article>
  );
}

export function FastDashboardPanel({ walletSnapshot, activityItems = [], onSelectView, onReceive, onAskCopilot }) {
  return (
    <section className="fast-dashboard">
      <FastCommandBar onSelectView={onSelectView} onReceive={onReceive} onAskCopilot={onAskCopilot} />
      <div className="fast-dashboard-grid">
        <WalletReadiness walletSnapshot={walletSnapshot} activityItems={activityItems} onSelectView={onSelectView} />
        <AssetsCard walletSnapshot={walletSnapshot} onSelectView={onSelectView} />
        <RecentCard activityItems={activityItems} onSelectView={onSelectView} onAskCopilot={onAskCopilot} />
      </div>
    </section>
  );
}

export function TransactionGuardianBanner({ mode = "wallet", walletSnapshot }) {
  const labels = {
    send: ["Send protection", "Review address, amount and fee before the wallet signs."],
    swap: ["Swap protection", "Review token, quote and approval before the wallet signs."],
    bridge: ["Bridge protection", "Review source network, amount and Arc destination before signing."]
  };
  const [title, text] = labels[mode] || ["Transaction protection", "Your wallet always controls the final signature."];

  return (
    <section className="pro-guardian">
      <span>✓</span>
      <div><strong>{title}</strong><p>{text}</p></div>
      <small>{walletSnapshot?.onArc ? "Arc ready" : "Network check"} · Self-custody</small>
    </section>
  );
}

export function ActivityInterpreterPanel({ activityItems = [], onAskCopilot }) {
  const latest = activityItems[0];
  return (
    <section className="pro-interpreter">
      <div>
        <span>AI transaction explainer</span>
        <strong>{latest ? `${latest.type || "Transaction"} · ${latest.amount || "Tracked"}` : "No recent transaction"}</strong>
        <p>{latest ? "Ask Arc AI for a plain-English explanation of your latest wallet action." : "Complete an Arc action to start building your activity history."}</p>
      </div>
      <button type="button" disabled={!latest} onClick={() => onAskCopilot?.(`Explain my latest transaction ${latest?.txHash || ""}`)}>Explain with AI</button>
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
    const message = `${amount || "0"} USDC requested on Arc${note ? ` — ${note}` : ""}\n${uri}`;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  return (
    <section className="pro-request-panel">
      <div className="pro-page-heading"><span>Request payment</span><h2>Create an Arc USDC request</h2><p>Generate a QR request without giving any app custody of your funds.</p></div>
      <div className="pro-request-grid">
        <div className="pro-request-form">
          <label><span>Amount (USDC)</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="25.00" /></label>
          <label><span>Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Payment for…" maxLength={80} /></label>
          <label><span>Receive to</span><div className="pro-readonly-field">{address || "Connect wallet first"}</div></label>
          <button className="button button-primary" type="button" onClick={copyRequest} disabled={!address || !amount}>{copied ? "Copied" : "Copy payment request"}</button>
        </div>
        <div className="pro-request-qr">
          <div className="qr-surface">{uri ? <QRCodeSVG value={uri} size={190} level="M" /> : <span>Connect wallet</span>}</div>
          <strong>{amount || "0.00"} USDC</strong>
          <small>Arc Testnet · {shorten(address)}</small>
        </div>
      </div>
    </section>
  );
}

export function CommunityHubPanel({ onSelectView }) {
  const links = [
    { title: "Arc documentation", description: "Network and developer documentation.", url: ARC_DOCS_URL },
    { title: "Arc community", description: "Updates, discussions and ecosystem resources.", url: ARC_COMMUNITY_URL },
    { title: "ArcScan", description: "Inspect wallets, blocks and transactions.", url: ARC_EXPLORER_URL },
    { title: "Circle faucet", description: "Get test USDC for supported test networks.", url: CIRCLE_FAUCET_URL }
  ];

  return (
    <section className="pro-community-panel">
      <div className="pro-page-heading"><span>Arc community</span><h2>Useful Arc resources</h2><p>Only the essentials needed to fund, explore and use the wallet.</p></div>
      <div className="pro-community-grid">
        {links.map((item) => (
          <button type="button" key={item.title} onClick={() => openExternal(item.url)}>
            <span>↗</span><strong>{item.title}</strong><p>{item.description}</p>
          </button>
        ))}
      </div>
      <div className="pro-community-actions">
        <button type="button" className="button button-primary" onClick={() => onSelectView?.("bridge")}>Bridge USDC to Arc</button>
        <button type="button" className="button button-secondary" onClick={() => onSelectView?.("request")}>Request payment</button>
      </div>
    </section>
  );
}
