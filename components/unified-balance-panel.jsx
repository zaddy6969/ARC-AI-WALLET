import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  createArcAppKitClient,
  formatAppKitError,
  formatUnifiedBalanceBreakdown
} from "../lib/arc-app-kit";
import {
  ARC_APP_KIT_READY,
  ARC_MAINNET_REQUESTED,
  UNIFIED_BALANCE_SOURCE_OPTIONS,
  arcTestnet
} from "../lib/arc-chain";

const UNIFIED_BALANCE_DOCS = "https://docs.arc.io/app-kit/unified-balance";
const UNIFIED_BALANCE_FEES = "https://docs.arc.io/app-kit/concepts/unified-balance-fees";
const SUPPORTED_CHAINS = UNIFIED_BALANCE_SOURCE_OPTIONS
  .map((option) => option.appKitChain)
  .filter(Boolean);
const NETWORK_TYPE = ARC_MAINNET_REQUESTED ? "mainnet" : "testnet";
const UNIFIED_BALANCE_READY =
  (!ARC_MAINNET_REQUESTED || ARC_APP_KIT_READY) && SUPPORTED_CHAINS.length > 0;

function openExternal(url) {
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}

function formatAmount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(number);
}

function shortAddress(value) {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function UnifiedBalancePanel({ walletSnapshot, onSelectView }) {
  const { connector } = useAccount();
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const breakdown = useMemo(
    () => formatUnifiedBalanceBreakdown(result).filter((item) => Number(item.confirmedBalance || 0) > 0 || Number(item.pendingBalance || 0) > 0),
    [result]
  );

  const loadBalance = useCallback(async () => {
    if (!UNIFIED_BALANCE_READY) {
      setStatus("locked");
      setResult(null);
      setError(
        ARC_MAINNET_REQUESTED
          ? "Unified Balance is locked until Circle App Kit production chain identifiers are configured."
          : "Unified Balance configuration is unavailable."
      );
      return;
    }

    if (!connector || !walletSnapshot?.address) {
      setStatus("idle");
      setResult(null);
      setError("");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const provider = await connector.getProvider();
      if (!provider) throw new Error("Connected wallet provider is unavailable.");
      const { kit, adapter } = await createArcAppKitClient(provider);
      const balances = await kit.unifiedBalance.getBalances({
        sources: { adapter, chains: SUPPORTED_CHAINS },
        networkType: NETWORK_TYPE,
        includePending: true
      });
      setResult(balances);
      setStatus("ready");
    } catch (nextError) {
      setError(formatAppKitError(nextError, "Unified Balance is temporarily unavailable."));
      setStatus("error");
    }
  }, [connector, walletSnapshot?.address]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  const confirmed = result?.totalConfirmedBalance || "0";
  const pending = result?.totalPendingBalance || "0";
  const environmentLabel = arcTestnet.testnet ? "Testnet" : "Mainnet";
  const supportedNames = UNIFIED_BALANCE_SOURCE_OPTIONS.map((option) => option.shortName).join(", ");

  return (
    <section className="arc-ub-page">
      <div className="arc-ub-hero">
        <div>
          <p className="section-kicker">Circle App Kit · Unified Balance</p>
          <h2>One spendable USDC balance across chains.</h2>
          <p>
            This reads your actual App Kit Unified Balance. It does not add ordinary wallet balances together or double-count Arc&apos;s native and ERC-20 USDC views.
          </p>
        </div>
        <div className="arc-ub-total">
          <span>Confirmed</span>
          <strong>{status === "loading" ? "Syncing…" : `${formatAmount(confirmed)} USDC`}</strong>
          <small>{Number(pending || 0) > 0 ? `${formatAmount(pending)} USDC pending` : "No pending Unified Balance"}</small>
        </div>
      </div>

      <div className="arc-ub-toolbar">
        <div>
          <span className={`arc-status-dot ${status === "ready" ? "is-live" : ""}`} />
          <strong>
            {status === "loading"
              ? "Querying App Kit"
              : status === "locked"
                ? "Mainnet integration locked"
                : status === "error"
                  ? "App Kit check failed"
                  : "Unified Balance ready"}
          </strong>
          <small>{shortAddress(walletSnapshot?.address)}</small>
        </div>
        <div>
          <button type="button" className="button button-secondary" onClick={loadBalance} disabled={status === "loading" || !walletSnapshot?.address || !UNIFIED_BALANCE_READY}>Refresh</button>
          <button type="button" className="button button-secondary" onClick={() => openExternal(UNIFIED_BALANCE_DOCS)}>How it works ↗</button>
        </div>
      </div>

      {error ? <div className="arc-ub-error">{error}</div> : null}

      <div className="arc-ub-grid">
        <article className="arc-ub-card">
          <div className="arc-ub-card-head">
            <div><span>Deposited sources</span><strong>USDC breakdown</strong></div>
            <small>{environmentLabel}</small>
          </div>
          <div className="arc-ub-chain-list">
            {status === "locked" ? (
              <div className="arc-ub-empty">
                <strong>Mainnet Unified Balance is not enabled yet.</strong>
                <span>The wallet will wait for verified production App Kit chain identifiers instead of guessing them.</span>
              </div>
            ) : status === "loading" ? (
              <div className="arc-ub-empty">Loading {supportedNames || "supported chains"} deposits…</div>
            ) : breakdown.length ? (
              breakdown.map((item) => (
                <div className="arc-ub-chain-row" key={`${item.account}-${item.appKitChain}`}>
                  <span className="arc-chain-badge">{String(item.chain || item.appKitChain).slice(0, 1)}</span>
                  <div><strong>{item.chain || item.appKitChain}</strong><small>{shortAddress(item.account)}</small></div>
                  <div><strong>{formatAmount(item.confirmedBalance)} USDC</strong><small>{Number(item.pendingBalance || 0) > 0 ? `${formatAmount(item.pendingBalance)} pending` : "Confirmed"}</small></div>
                </div>
              ))
            ) : (
              <div className="arc-ub-empty">
                <strong>No deposited Unified Balance yet.</strong>
                <span>Your normal wallet USDC is separate until you deposit it into Unified Balance through App Kit.</span>
              </div>
            )}
          </div>
        </article>

        <article className="arc-ub-card arc-ub-how-card">
          <div className="arc-ub-card-head">
            <div><span>What this unlocks</span><strong>Chain-abstracted payments</strong></div>
          </div>
          <div className="arc-ub-benefits">
            <div><span>01</span><p><strong>Deposit</strong> USDC from supported chains into one balance.</p></div>
            <div><span>02</span><p><strong>Spend</strong> the combined balance on another supported chain.</p></div>
            <div><span>03</span><p><strong>Route</strong> source liquidity through App Kit instead of manually bridging first.</p></div>
          </div>
          <div className="arc-ub-actions">
            <button type="button" className="button button-primary" onClick={() => onSelectView?.("bridge")} disabled={!UNIFIED_BALANCE_READY}>Move USDC</button>
            <button type="button" className="button button-secondary" onClick={() => openExternal(UNIFIED_BALANCE_FEES)}>Review fees ↗</button>
          </div>
          <p className="arc-ub-note">Deposits and spends still require wallet approval. This screen performs the safe read-only balance query; money-moving Unified Balance actions are not silently executed.</p>
        </article>
      </div>
    </section>
  );
}
