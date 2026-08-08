import { memo, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { FeatureIcon } from "./wallet-sidebar";
import {
  ARC_CIRBTC_ERC20_ADDRESS,
  ARC_EURC_ERC20_ADDRESS,
  ARC_TESTNET_NETWORK_CONFIG,
  ARC_USDC_ERC20_ADDRESS,
  arcTestnet
} from "../lib/arc-chain";

const CIRCLE_FAUCET_URL = "https://faucet.circle.com";
const ARC_DOCS_URL = "https://docs.arc.network";
const ARC_COMMUNITY_URL = "https://community.arc.network";
const CIRCLE_DEVELOPERS_URL = "https://developers.circle.com";

const MULTICHAIN_USDC = [
  {
    id: "arc",
    label: "Arc Testnet",
    shortLabel: "ARC",
    chainId: arcTestnet.id,
    token: ARC_USDC_ERC20_ADDRESS,
    rpc: ARC_TESTNET_NETWORK_CONFIG.rpcUrl,
    explorer: ARC_TESTNET_NETWORK_CONFIG.explorerUrl,
    source: "snapshot"
  },
  {
    id: "base-sepolia",
    label: "Base Sepolia",
    shortLabel: "BASE",
    chainId: 84532,
    token: "0x036CbD53842c5426634e7929541C2318f3dCF7c",
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org"
  },
  {
    id: "ethereum-sepolia",
    label: "Ethereum Sepolia",
    shortLabel: "ETH",
    chainId: 11155111,
    token: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io"
  }
];

function parseBalance(value) {
  const numeric = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(Number(value || 0));
}

function shortenAddress(value) {
  if (!value) return "Not connected";
  if (value.length < 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function openExternal(url) {
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

async function readUsdcBalance(rpc, token, address) {
  const cleanAddress = String(address || "").toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(cleanAddress)) return 0;

  const data = `0x70a08231${cleanAddress.padStart(64, "0")}`;
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: token, data }, "latest"]
    })
  });

  if (!response.ok) throw new Error(`RPC ${response.status}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error.message || "RPC balance read failed");
  const raw = BigInt(payload?.result || "0x0");
  return Number(raw) / 1_000_000;
}

function StatusIcon({ complete }) {
  return <span className={`suite-status-icon ${complete ? "is-complete" : ""}`}>{complete ? "✓" : "•"}</span>;
}

function OnboardingCenter({ walletSnapshot, activityItems = [], onSelectView, onReceive }) {
  const usdc = parseBalance(walletSnapshot?.usdcBalance);
  const checks = [
    {
      id: "wallet",
      label: "Wallet connected",
      helper: shortenAddress(walletSnapshot?.address),
      complete: Boolean(walletSnapshot?.address),
      action: null
    },
    {
      id: "network",
      label: "Arc network ready",
      helper: walletSnapshot?.onArc ? "Connected to Arc Testnet" : "Switch to Arc before sending",
      complete: Boolean(walletSnapshot?.onArc),
      action: () => onSelectView?.("send")
    },
    {
      id: "funds",
      label: "Test USDC available",
      helper: usdc > 0 ? `${formatNumber(usdc, 4)} USDC detected` : "Fund this wallet with test USDC",
      complete: usdc > 0,
      action: () => openExternal(CIRCLE_FAUCET_URL)
    },
    {
      id: "first-tx",
      label: "First Arc action complete",
      helper: activityItems.length ? `${activityItems.length} wallet event${activityItems.length === 1 ? "" : "s"} tracked` : "Send, receive, swap, or bridge once",
      complete: activityItems.length > 0,
      action: () => onSelectView?.("send")
    }
  ];
  const completed = checks.filter((item) => item.complete).length;
  const progress = Math.round((completed / checks.length) * 100);

  return (
    <article className="card suite-card onboarding-card">
      <div className="suite-card-head">
        <div>
          <p className="section-kicker">Arc Onboarding</p>
          <h2>Get Arc-ready in minutes</h2>
        </div>
        <div className="suite-progress-ring" style={{ "--suite-progress": `${progress * 3.6}deg` }}>
          <strong>{progress}%</strong>
        </div>
      </div>
      <div className="onboarding-list">
        {checks.map((item) => (
          <button
            type="button"
            key={item.id}
            className="onboarding-row"
            onClick={item.action || undefined}
            disabled={!item.action}
          >
            <StatusIcon complete={item.complete} />
            <span>
              <strong>{item.label}</strong>
              <small>{item.helper}</small>
            </span>
            {item.action ? <em>{item.complete ? "Review" : "Fix"}</em> : null}
          </button>
        ))}
      </div>
      <div className="suite-inline-actions">
        <button type="button" className="button button-secondary" onClick={onReceive}>Receive</button>
        <button type="button" className="button button-secondary" onClick={() => onSelectView?.("bridge")}>Bridge to Arc</button>
        <button type="button" className="button" onClick={() => onSelectView?.("community")}>Explore Arc</button>
      </div>
    </article>
  );
}

function UnifiedUsdcCard({ walletSnapshot, onSelectView }) {
  const [remoteBalances, setRemoteBalances] = useState({});
  const [status, setStatus] = useState("idle");
  const address = walletSnapshot?.address;
  const arcBalance = parseBalance(walletSnapshot?.usdcBalance);

  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setRemoteBalances({});
      setStatus("idle");
      return undefined;
    }

    async function load() {
      setStatus("loading");
      const results = await Promise.all(
        MULTICHAIN_USDC.filter((chain) => chain.source !== "snapshot").map(async (chain) => {
          try {
            const value = await readUsdcBalance(chain.rpc, chain.token, address);
            return [chain.id, { value, ok: true }];
          } catch {
            return [chain.id, { value: 0, ok: false }];
          }
        })
      );
      if (!cancelled) {
        setRemoteBalances(Object.fromEntries(results));
        setStatus("ready");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const rows = MULTICHAIN_USDC.map((chain) => {
    if (chain.source === "snapshot") return { ...chain, value: arcBalance, ok: true };
    return { ...chain, ...(remoteBalances[chain.id] || { value: 0, ok: null }) };
  });
  const total = rows.reduce((sum, item) => sum + (item.ok ? Number(item.value || 0) : 0), 0);

  return (
    <article className="card suite-card unified-card">
      <div className="suite-card-head">
        <div>
          <p className="section-kicker">Unified USDC</p>
          <h2>{formatNumber(total, 4)} USDC</h2>
          <p>One view across the Arc testnet routes this wallet supports.</p>
        </div>
        <span className="suite-live-badge">{status === "loading" ? "Syncing" : "Live"}</span>
      </div>
      <div className="unified-chain-list">
        {rows.map((row) => (
          <div className="unified-chain-row" key={row.id}>
            <span className="chain-monogram">{row.shortLabel}</span>
            <span>
              <strong>{row.label}</strong>
              <small>Chain {row.chainId}</small>
            </span>
            <strong>{row.ok === false ? "RPC unavailable" : row.ok == null ? "Syncing…" : `${formatNumber(row.value, 4)} USDC`}</strong>
          </div>
        ))}
      </div>
      <button type="button" className="suite-wide-action" onClick={() => onSelectView?.("bridge")}>Move USDC to Arc →</button>
    </article>
  );
}

export function TransactionGuardianBanner({ mode = "wallet", walletSnapshot }) {
  const copy = {
    send: {
      title: "Send Guardian active",
      text: "Arc AI will keep the transfer self-custodial, show the destination in this screen, and your wallet must approve the final transaction."
    },
    swap: {
      title: "Swap Guardian active",
      text: "Review the quoted output, route, token approval and wallet prompt before signing. Arc AI never signs for you."
    },
    bridge: {
      title: "Bridge Guardian active",
      text: "Check the source network, amount and destination Arc wallet before approving the source-chain transaction."
    },
    wallet: {
      title: "Transaction Guardian",
      text: "Every money-moving action stays review-first and requires your connected wallet to approve the final signature."
    }
  }[mode] || null;

  return (
    <section className="guardian-banner" aria-label="Transaction safety">
      <div className="guardian-shield">✓</div>
      <div>
        <strong>{copy.title}</strong>
        <p>{copy.text}</p>
      </div>
      <div className="guardian-meta">
        <span className={walletSnapshot?.onArc ? "is-safe" : ""}>{walletSnapshot?.onArc ? "Arc ready" : "Check network"}</span>
        <span>Self-custody</span>
      </div>
    </section>
  );
}

function AiCommandCore({ onSelectView, onAskCopilot }) {
  const [command, setCommand] = useState("");
  const [lastAction, setLastAction] = useState("Try: ‘bridge my USDC to Arc’ or ‘show developer tools’.");

  function runCommand(event) {
    event.preventDefault();
    const text = command.trim();
    const lowered = text.toLowerCase();
    if (!text) return;

    const route =
      /\bbridge|move.*arc\b/.test(lowered) ? "bridge" :
      /\bswap|exchange|convert\b/.test(lowered) ? "swap" :
      /\brequest|invoice|payment link|qr\b/.test(lowered) ? "request" :
      /\bsend|pay|transfer\b/.test(lowered) ? "send" :
      /\bdeveloper|rpc|contract|chain id|calldata\b/.test(lowered) ? "developer" :
      /\bcommunity|ecosystem|faucet|docs\b/.test(lowered) ? "community" :
      /\bportfolio|assets|tokens\b/.test(lowered) ? "portfolio" :
      /\bactivity|history|transactions\b/.test(lowered) ? "activity" : null;

    if (route) {
      onSelectView?.(route);
      setLastAction(`Opening ${route} with review-first controls.`);
    } else {
      onAskCopilot?.(text);
      setLastAction("Sent to Arc AI for wallet analysis.");
    }
    setCommand("");
  }

  return (
    <article className="card suite-card command-core-card">
      <div className="suite-card-head">
        <div>
          <p className="section-kicker">Arc AI Command</p>
          <h2>Tell the wallet what you want to do</h2>
        </div>
        <span className="suite-live-badge">Review-first</span>
      </div>
      <form className="suite-command-form" onSubmit={runCommand}>
        <div className="command-orb"><FeatureIcon name="ai" /></div>
        <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Send, swap, bridge, request, inspect…" />
        <button type="submit">Run</button>
      </form>
      <p className="suite-command-feedback">{lastAction}</p>
      <div className="suite-command-examples">
        {["Bridge to Arc", "Request 25 USDC", "Show activity", "Developer mode"].map((label) => (
          <button type="button" key={label} onClick={() => setCommand(label)}>{label}</button>
        ))}
      </div>
    </article>
  );
}

function WalletSafetyCard({ walletSnapshot, activityItems = [], onAskCopilot }) {
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];
  const errors = assets.filter((asset) => asset.status === "error").length;
  const score = Math.max(55, Math.min(100, 76 + (walletSnapshot?.onArc ? 8 : 0) + (walletSnapshot?.address ? 8 : 0) + (errors ? -10 : 8)));

  return (
    <article className="card suite-card safety-card">
      <div className="suite-card-head">
        <div>
          <p className="section-kicker">Wallet Health</p>
          <h2>{score}/100</h2>
        </div>
        <span className="suite-live-badge">Guardian</span>
      </div>
      <div className="safety-metrics">
        <div><span>Network</span><strong>{walletSnapshot?.onArc ? "Arc ready" : "Needs review"}</strong></div>
        <div><span>Asset reads</span><strong>{errors ? `${errors} issue${errors === 1 ? "" : "s"}` : "Healthy"}</strong></div>
        <div><span>Tracked activity</span><strong>{activityItems.length}</strong></div>
        <div><span>Signing policy</span><strong>Always ask</strong></div>
      </div>
      <button type="button" className="suite-wide-action" onClick={() => onAskCopilot?.("Check my wallet health and explain any risks or setup issues you can see.")}>Ask AI for a health check →</button>
    </article>
  );
}

export function ProfessionalDashboardSuite({ walletSnapshot, activityItems = [], onSelectView, onReceive, onAskCopilot }) {
  return (
    <section className="professional-suite">
      <AiCommandCore onSelectView={onSelectView} onAskCopilot={onAskCopilot} />
      <div className="professional-suite-grid">
        <OnboardingCenter walletSnapshot={walletSnapshot} activityItems={activityItems} onSelectView={onSelectView} onReceive={onReceive} />
        <UnifiedUsdcCard walletSnapshot={walletSnapshot} onSelectView={onSelectView} />
        <WalletSafetyCard walletSnapshot={walletSnapshot} activityItems={activityItems} onAskCopilot={onAskCopilot} />
      </div>
      <div className="suite-value-strip">
        <div><span>Gas on Arc</span><strong>USDC-native</strong><small>No ETH required on Arc</small></div>
        <div><span>Transaction policy</span><strong>Review + sign</strong><small>No hidden wallet execution</small></div>
        <div><span>Community mode</span><strong>Built for Arc</strong><small>Faucets, docs and tooling</small></div>
      </div>
    </section>
  );
}

export function ActivityInterpreterPanel({ activityItems = [], onAskCopilot }) {
  const latest = activityItems[0];
  if (!latest) return null;
  const prompt = `Explain this wallet transaction in simple language and highlight any safety concerns: type=${latest.type || latest.kind || "transaction"}, amount=${latest.amount || "unknown"}, hash=${latest.txHash || latest.txHashShort || "unknown"}.`;

  return (
    <section className="activity-interpreter card">
      <div>
        <p className="section-kicker">AI Transaction Interpreter</p>
        <strong>Understand your latest wallet action</strong>
        <span>{latest.type || latest.kind || "Transaction"} · {latest.amount || "Tracked amount"}</span>
      </div>
      <button type="button" className="button" onClick={() => onAskCopilot?.(prompt)}>Explain latest transaction</button>
    </section>
  );
}

export function CommunityHubPanel({ walletSnapshot, onSelectView }) {
  const usdc = parseBalance(walletSnapshot?.usdcBalance);
  const resources = [
    { name: "Arc Documentation", description: "Network, App Kit and developer guides.", url: ARC_DOCS_URL, tag: "BUILD" },
    { name: "Arc Community", description: "Community updates, builders and ecosystem discussions.", url: ARC_COMMUNITY_URL, tag: "JOIN" },
    { name: "ArcScan", description: "Inspect blocks, wallet activity and contracts on Arc Testnet.", url: ARC_TESTNET_NETWORK_CONFIG.explorerUrl, tag: "EXPLORE" },
    { name: "Circle Developers", description: "USDC, CCTP, App Kit and Circle developer resources.", url: CIRCLE_DEVELOPERS_URL, tag: "LEARN" }
  ];

  return (
    <section className="suite-page">
      <div className="suite-page-hero card">
        <div>
          <p className="section-kicker">Arc Community Hub</p>
          <h2>Your launchpad into Arc</h2>
          <p>Get funded, understand the network, inspect transactions and discover the official builder resources without leaving your wallet workflow.</p>
        </div>
        <div className="community-readiness">
          <span>{usdc > 0 ? "Funded" : "Needs test USDC"}</span>
          <strong>{formatNumber(usdc, 4)} USDC</strong>
        </div>
      </div>

      <div className="faucet-assistant card">
        <div className="faucet-orb">+</div>
        <div>
          <p className="section-kicker">Faucet Assistant</p>
          <h3>{usdc > 0 ? "Your Arc wallet has USDC." : "Need test funds?"}</h3>
          <p>{usdc > 0 ? "You can send, swap, or bridge from the tools below." : "Use Circle's faucet for test USDC, then return here and your dashboard will resync automatically."}</p>
        </div>
        <div className="suite-inline-actions">
          <button type="button" className="button" onClick={() => openExternal(CIRCLE_FAUCET_URL)}>Open Circle Faucet</button>
          <button type="button" className="button button-secondary" onClick={() => onSelectView?.("bridge")}>Bridge USDC</button>
        </div>
      </div>

      <div className="ecosystem-grid">
        {resources.map((resource) => (
          <button type="button" key={resource.name} className="ecosystem-card card" onClick={() => openExternal(resource.url)}>
            <span>{resource.tag}</span>
            <strong>{resource.name}</strong>
            <p>{resource.description}</p>
            <em>Open resource ↗</em>
          </button>
        ))}
      </div>

      <div className="community-path card">
        <div><span>01</span><strong>Fund</strong><small>Get test USDC</small></div>
        <i />
        <div><span>02</span><strong>Move</strong><small>Send / bridge / swap</small></div>
        <i />
        <div><span>03</span><strong>Inspect</strong><small>Use Activity + ArcScan</small></div>
        <i />
        <div><span>04</span><strong>Build</strong><small>Open Developer Mode</small></div>
      </div>
    </section>
  );
}

export function PaymentRequestPanel({ walletSnapshot }) {
  const [amount, setAmount] = useState("25");
  const [note, setNote] = useState("Arc payment");
  const [copied, setCopied] = useState(false);
  const numericAmount = Math.max(0, Number(amount || 0));
  const atomicAmount = Number.isFinite(numericAmount) ? Math.round(numericAmount * 1_000_000) : 0;
  const address = walletSnapshot?.address || "";
  const paymentUri = address && atomicAmount > 0
    ? `ethereum:${ARC_USDC_ERC20_ADDRESS}@${arcTestnet.id}/transfer?address=${address}&uint256=${atomicAmount}`
    : address;

  const requestText = `Pay ${formatNumber(numericAmount, 6)} USDC to ${address} on ${arcTestnet.name}${note ? ` — ${note}` : ""}`;

  async function copyRequest() {
    if (!paymentUri) return;
    await navigator.clipboard.writeText(`${requestText}\n${paymentUri}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function shareRequest() {
    if (!paymentUri) return;
    if (navigator.share) {
      await navigator.share({ title: "Arc USDC payment request", text: requestText, url: paymentUri }).catch(() => {});
      return;
    }
    await copyRequest();
  }

  return (
    <section className="suite-page payment-request-page">
      <div className="suite-page-hero card">
        <div>
          <p className="section-kicker">Request USDC</p>
          <h2>Create a payment request</h2>
          <p>Generate a scannable ERC-20 payment request for your connected Arc wallet. The payer still reviews and signs from their own wallet.</p>
        </div>
        <span className="suite-live-badge">Self-custody</span>
      </div>
      <div className="payment-builder-grid">
        <article className="card payment-form-card">
          <label>
            <span>Amount</span>
            <div className="payment-amount-input"><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /><strong>USDC</strong></div>
          </label>
          <label>
            <span>Note</span>
            <input className="suite-text-input" value={note} onChange={(event) => setNote(event.target.value)} maxLength={64} placeholder="What is this payment for?" />
          </label>
          <div className="payment-recipient-preview">
            <span>Receiving wallet</span>
            <strong>{shortenAddress(address)}</strong>
            <small>Arc Testnet · Chain {arcTestnet.id}</small>
          </div>
          <div className="suite-inline-actions">
            <button type="button" className="button" disabled={!address || !atomicAmount} onClick={copyRequest}>{copied ? "Copied" : "Copy request"}</button>
            <button type="button" className="button button-secondary" disabled={!address || !atomicAmount} onClick={shareRequest}>Share</button>
          </div>
        </article>
        <article className="card payment-qr-card">
          <div className="payment-qr-wrap">
            {paymentUri ? <QRCodeSVG value={paymentUri} size={210} bgColor="#ffffff" fgColor="#06101f" level="M" includeMargin /> : <span>Connect wallet</span>}
          </div>
          <p className="section-kicker">Payment QR</p>
          <h3>{formatNumber(numericAmount, 6)} USDC</h3>
          <p>{note || "Arc payment"}</p>
          <small>ERC-20 transfer request · payer must approve</small>
        </article>
      </div>
    </section>
  );
}

export function DeveloperModePanel({ walletSnapshot, activityItems = [] }) {
  const [copied, setCopied] = useState("");
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [dailyCap, setDailyCap] = useState("5");
  const assets = Array.isArray(walletSnapshot?.assets) ? walletSnapshot.assets : [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("arc-ai-agent-controls-v1");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      setAgentEnabled(Boolean(parsed.enabled));
      setDailyCap(String(parsed.dailyCap || "5"));
    } catch {}
  }, []);

  function persistAgent(nextEnabled = agentEnabled, nextCap = dailyCap) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("arc-ai-agent-controls-v1", JSON.stringify({ enabled: nextEnabled, dailyCap: nextCap, approvalMode: "always-ask" }));
  }

  const debugPayload = useMemo(() => ({
    wallet: walletSnapshot?.address || null,
    network: {
      name: arcTestnet.name,
      chainId: arcTestnet.id,
      connectedToArc: Boolean(walletSnapshot?.onArc),
      rpc: ARC_TESTNET_NETWORK_CONFIG.rpcUrl,
      explorer: ARC_TESTNET_NETWORK_CONFIG.explorerUrl
    },
    contracts: {
      USDC: ARC_USDC_ERC20_ADDRESS,
      EURC: ARC_EURC_ERC20_ADDRESS,
      cirBTC: ARC_CIRBTC_ERC20_ADDRESS
    },
    balances: assets.map((asset) => ({ symbol: asset.symbol, balance: asset.balance || null, status: asset.status })),
    activityCount: activityItems.length
  }), [walletSnapshot?.address, walletSnapshot?.onArc, assets, activityItems.length]);

  async function copyValue(label, value) {
    await navigator.clipboard.writeText(String(value));
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1200);
  }

  return (
    <section className="suite-page developer-page">
      <div className="suite-page-hero card">
        <div>
          <p className="section-kicker">Developer Mode</p>
          <h2>Inspect the wallet like a builder</h2>
          <p>Chain configuration, token contracts, wallet state and exportable debug context in one place.</p>
        </div>
        <button type="button" className="button" onClick={() => copyValue("json", JSON.stringify(debugPayload, null, 2))}>{copied === "json" ? "Copied JSON" : "Copy debug JSON"}</button>
      </div>

      <div className="developer-grid">
        <article className="card developer-inspector">
          <p className="section-kicker">Network</p>
          {[
            ["Chain", arcTestnet.name],
            ["Chain ID", arcTestnet.id],
            ["RPC", ARC_TESTNET_NETWORK_CONFIG.rpcUrl],
            ["Explorer", ARC_TESTNET_NETWORK_CONFIG.explorerUrl],
            ["Wallet", walletSnapshot?.address || "Not connected"]
          ].map(([label, value]) => (
            <button type="button" key={label} onClick={() => copyValue(label, value)}>
              <span>{label}</span><strong>{shortenAddress(String(value))}</strong><em>{copied === label ? "Copied" : "Copy"}</em>
            </button>
          ))}
        </article>
        <article className="card developer-inspector">
          <p className="section-kicker">Contracts</p>
          {[
            ["USDC", ARC_USDC_ERC20_ADDRESS],
            ["EURC", ARC_EURC_ERC20_ADDRESS],
            ["cirBTC", ARC_CIRBTC_ERC20_ADDRESS]
          ].map(([label, value]) => (
            <button type="button" key={label} onClick={() => copyValue(label, value)}>
              <span>{label}</span><strong>{shortenAddress(value)}</strong><em>{copied === label ? "Copied" : "Copy"}</em>
            </button>
          ))}
        </article>
      </div>

      <article className="card debug-json-card">
        <div className="suite-card-head"><div><p className="section-kicker">Runtime Snapshot</p><h3>Wallet debug context</h3></div><span className="suite-live-badge">Live</span></div>
        <pre>{JSON.stringify(debugPayload, null, 2)}</pre>
      </article>

      <article className="card agent-controls-card">
        <div>
          <p className="section-kicker">AI Agent Controls</p>
          <h3>Permission planning without silent execution</h3>
          <p>This stores your preferred policy locally. Arc AI still cannot sign or move funds without an explicit wallet approval.</p>
        </div>
        <label className="agent-toggle-row">
          <input type="checkbox" checked={agentEnabled} onChange={(event) => { const next = event.target.checked; setAgentEnabled(next); persistAgent(next, dailyCap); }} />
          <span><strong>Enable agent suggestions</strong><small>Allow AI to suggest actions within your local policy.</small></span>
        </label>
        <label className="agent-limit-row">
          <span>Daily suggestion cap</span>
          <div><input inputMode="decimal" value={dailyCap} onChange={(event) => { setDailyCap(event.target.value); persistAgent(agentEnabled, event.target.value); }} /><strong>USDC</strong></div>
        </label>
        <div className="agent-policy-pill">Signing policy: <strong>Always ask in wallet</strong></div>
      </article>
    </section>
  );
}

export default memo(ProfessionalDashboardSuite);
