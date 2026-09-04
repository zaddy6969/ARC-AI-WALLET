import { BrowserProvider, Contract, formatUnits } from "ethers";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseAbiItem } from "viem";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { ARC_PORTFOLIO_TOKENS, MULTICHAIN_WALLET_CHAINS, arcTestnet } from "../lib/arc-chain";
import { createWalletActionRecord } from "../lib/local-activity";
import { switchWalletNetwork } from "../lib/wallet-network";
import { FeatureIcon } from "./wallet-sidebar";

const APPROVAL_EVENT = parseAbiItem("event Approval(address indexed owner, address indexed spender, uint256 value)");
const ALLOWANCE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  }
];
const APPROVE_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)"
];
const LOOKBACK_BLOCKS = 50_000n;
const LOG_CHUNK = 5_000n;
const UNLIMITED_THRESHOLD = 1n << 255n;

function shortAddress(value) {
  if (!value) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatAllowance(raw, token) {
  if (raw >= UNLIMITED_THRESHOLD) return "Unlimited";
  const numeric = Number(formatUnits(raw, token.decimals));
  if (!Number.isFinite(numeric)) return `${raw.toString()} units`;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(numeric)} ${token.symbol}`;
}

function approvalRisk(raw) {
  if (raw >= UNLIMITED_THRESHOLD) return { label: "Unlimited", tone: "high" };
  return { label: "Limited", tone: "normal" };
}

async function getApprovalLogs(publicClient, tokenAddress, owner) {
  const latest = await publicClient.getBlockNumber();
  const from = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;
  const rows = [];

  for (let start = from; start <= latest; start += LOG_CHUNK) {
    const end = start + LOG_CHUNK - 1n > latest ? latest : start + LOG_CHUNK - 1n;
    const chunk = await publicClient.getLogs({
      address: tokenAddress,
      event: APPROVAL_EVENT,
      args: { owner },
      fromBlock: start,
      toBlock: end
    });
    rows.push(...chunk);
  }

  return rows;
}

async function loadApprovals(publicClient, owner) {
  const tokens = ARC_PORTFOLIO_TOKENS.filter((token) => token.address);
  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const logs = await getApprovalLogs(publicClient, token.address, owner);
      const spenders = [...new Set(logs.map((log) => String(log.args?.spender || "").toLowerCase()).filter(Boolean))];
      const allowances = await Promise.all(
        spenders.map(async (spender) => ({
          spender,
          raw: await publicClient.readContract({
            address: token.address,
            abi: ALLOWANCE_ABI,
            functionName: "allowance",
            args: [owner, spender]
          })
        }))
      );

      return allowances
        .filter((item) => item.raw > 0n)
        .map((item) => ({
          id: `${token.symbol}:${item.spender}`,
          token,
          spender: item.spender,
          raw: item.raw,
          allowance: formatAllowance(item.raw, token),
          risk: approvalRisk(item.raw)
        }));
    })
  );

  const approvals = [];
  let failedTokens = 0;
  results.forEach((result) => {
    if (result.status === "fulfilled") approvals.push(...result.value);
    else failedTokens += 1;
  });

  return { approvals, failedTokens, tokenCount: tokens.length };
}

export default function TokenApprovalsPanel({ walletSnapshot, onActivitySaved }) {
  const { connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const [status, setStatus] = useState("idle");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [scanMeta, setScanMeta] = useState({ failedTokens: 0, tokenCount: 0 });
  const [revokingId, setRevokingId] = useState("");
  const [lastTx, setLastTx] = useState("");

  const unlimitedCount = useMemo(() => rows.filter((item) => item.risk.tone === "high").length, [rows]);

  const refresh = useCallback(async () => {
    if (!walletSnapshot?.address || !publicClient) {
      setRows([]);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const result = await loadApprovals(publicClient, walletSnapshot.address);
      setRows(result.approvals);
      setScanMeta({ failedTokens: result.failedTokens, tokenCount: result.tokenCount });
      setStatus("ready");
    } catch (nextError) {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Unable to scan token approvals.");
    }
  }, [publicClient, walletSnapshot?.address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revoke = async (item) => {
    if (!connector || !walletSnapshot?.address) return;
    const arcChain = MULTICHAIN_WALLET_CHAINS.find((chain) => Number(chain.id) === Number(arcTestnet.id));
    if (!arcChain) return;

    setRevokingId(item.id);
    setError("");
    setLastTx("");
    try {
      const { provider: injectedProvider } = await switchWalletNetwork({ connector, chain: arcChain, switchChainAsync });
      const provider = new BrowserProvider(injectedProvider);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== Number(arcTestnet.id)) throw new Error("Wallet did not switch to Arc before revoke.");
      const signer = await provider.getSigner();
      const contract = new Contract(item.token.address, APPROVE_ABI, signer);

      const simulation = await contract.approve.staticCall(item.spender, 0n);
      if (simulation === false) throw new Error("Approval revoke simulation failed.");

      const transaction = await contract.approve(item.spender, 0n);
      setLastTx(transaction.hash);
      onActivitySaved?.(createWalletActionRecord({
        walletAddress: walletSnapshot.address,
        type: "Approval revoked",
        kind: "approval",
        amount: item.allowance,
        chain: arcTestnet.name,
        chainId: arcTestnet.id,
        sender: walletSnapshot.address,
        receiver: item.spender,
        recipient: item.spender,
        status: "Pending",
        txHash: transaction.hash,
        explorerUrl: arcTestnet.blockExplorers?.default?.url ? `${arcTestnet.blockExplorers.default.url}/tx/${transaction.hash}` : "",
        summary: `Revoked ${item.token.symbol} spending permission for ${shortAddress(item.spender)}.`,
        metadata: {
          operation: "revoke-approval",
          token: item.token.symbol,
          tokenAddress: item.token.address,
          spender: item.spender,
          previousAllowance: item.raw.toString(),
          simulation: "passed"
        }
      }));

      const receipt = await transaction.wait();
      if (receipt?.status !== 1) throw new Error("Approval revoke transaction failed.");
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to revoke this approval.");
    } finally {
      setRevokingId("");
    }
  };

  return (
    <section className="wallet-v3-page-card wallet-v5-approvals-page">
      <header className="wallet-v3-page-head">
        <div>
          <span className="wallet-v3-eyebrow">Wallet security</span>
          <h2>Token approvals</h2>
          <p>Review contracts that can currently spend your Arc tokens. Revoking sets that spender&apos;s allowance to zero after your wallet confirms the transaction.</p>
        </div>
        <button type="button" className="wallet-v3-secondary-button" onClick={refresh} disabled={status === "loading" || Boolean(revokingId)}>{status === "loading" ? "Scanning…" : "Rescan"}</button>
      </header>

      <div className="wallet-v5-approval-summary">
        <div><span>Active approvals</span><strong>{rows.length}</strong></div>
        <div className={unlimitedCount ? "is-warning" : ""}><span>Unlimited</span><strong>{unlimitedCount}</strong></div>
        <div><span>Tokens scanned</span><strong>{scanMeta.tokenCount || ARC_PORTFOLIO_TOKENS.length}</strong></div>
        <div><span>Network</span><strong>{arcTestnet.name}</strong></div>
      </div>

      <div className="wallet-v5-security-note">
        <FeatureIcon name="security" />
        <div><strong>Only revoke permissions you no longer trust or need.</strong><span>A revoke is an onchain transaction. Lumexa simulates it first, but your wallet always controls the final signature.</span></div>
      </div>

      {scanMeta.failedTokens > 0 ? <div className="wallet-v3-inline-warning"><strong>Partial scan</strong><span>{scanMeta.failedTokens} token contract{scanMeta.failedTokens === 1 ? "" : "s"} could not be scanned. The approvals below are the ones Lumexa could verify.</span></div> : null}
      {error ? <div className="wallet-v4-alert is-error"><strong>Approval manager needs attention</strong><span>{error}</span></div> : null}
      {lastTx ? <div className="wallet-v4-result"><div><span>Latest revoke</span><code>{lastTx}</code></div>{arcTestnet.blockExplorers?.default?.url ? <a href={`${arcTestnet.blockExplorers.default.url}/tx/${lastTx}`} target="_blank" rel="noreferrer">Open transaction ↗</a> : null}</div> : null}

      {status === "loading" && !rows.length ? (
        <div className="wallet-v3-empty"><strong>Scanning recent approval events…</strong><span>Checking current allowances for USDC and other supported Arc assets.</span></div>
      ) : status === "ready" && !rows.length ? (
        <div className="wallet-v3-empty"><strong>No active token approvals found.</strong><span>No non-zero allowances were found in the recent Arc approval window for supported Lumexa assets.</span></div>
      ) : (
        <div className="wallet-v5-approval-list">
          {rows.map((item) => (
            <article key={item.id} className="wallet-v5-approval-row">
              <div className="wallet-v5-token-mark">{item.token.symbol.slice(0, 1)}</div>
              <div className="wallet-v5-approval-token"><strong>{item.token.symbol}</strong><span>{item.token.name}</span></div>
              <div className="wallet-v5-approval-spender"><span>Spender</span><strong title={item.spender}>{shortAddress(item.spender)}</strong><a href={`${arcTestnet.blockExplorers.default.url}/address/${item.spender}`} target="_blank" rel="noreferrer">Inspect ↗</a></div>
              <div className="wallet-v5-approval-amount"><span>Allowance</span><strong>{item.allowance}</strong><small className={`is-${item.risk.tone}`}>{item.risk.label}</small></div>
              <button type="button" className="wallet-v5-revoke-button" onClick={() => revoke(item)} disabled={Boolean(revokingId)}>{revokingId === item.id ? "Confirming…" : "Revoke"}</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
