import { Interface, JsonRpcProvider, ZeroAddress, formatUnits, getAddress } from "ethers";
import {
  ARC_MAINNET_REQUESTED,
  ARC_MAINNET_READY,
  ARC_USDC_ERC20_ADDRESS,
  arcTestnet
} from "./arc-chain";

let provider;

function getArcRpcUrl() {
  const rpcUrl = arcTestnet?.rpcUrls?.default?.http?.[0] || "";
  if (ARC_MAINNET_REQUESTED && !ARC_MAINNET_READY) {
    throw new Error("Arc Mainnet activity is locked until the official mainnet configuration is complete and enabled.");
  }
  if (!rpcUrl) throw new Error(`${arcTestnet?.name || "Arc"} RPC is not configured.`);
  return rpcUrl;
}

function getProvider() {
  if (!provider) {
    provider = new JsonRpcProvider(getArcRpcUrl(), arcTestnet.id, { staticNetwork: true });
  }
  return provider;
}

const usdcInterface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

const DEFAULT_LOOKBACK_BLOCKS = 9000;
const LOG_CHUNK_SIZE = 9000;
const USDC_DECIMALS = 6;
const NATIVE_USDC_DECIMALS = 18;
const EXPLORER_MAX_PAGES = 8;
const EXPLORER_RESULT_LIMIT = 250;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const ARC_NETWORK_LABEL = arcTestnet.name || "Arc";

function normalizeAddress(address) {
  try {
    return address ? getAddress(address) : "";
  } catch {
    return "";
  }
}

function addressToTopic(address) {
  return `0x000000000000000000000000${address.slice(2).toLowerCase()}`;
}

function shortAddress(address) {
  if (!address) return "unknown";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  if (!hash) return "";
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatAmount(value, decimals) {
  try {
    const [whole = "0", fractional = ""] = formatUnits(value, decimals).split(".");
    const wholeWithCommas = BigInt(whole || "0").toLocaleString();
    const trimmedFractional = fractional.replace(/0+$/, "").slice(0, 6);
    return trimmedFractional ? `${wholeWithCommas}.${trimmedFractional}` : `${wholeWithCommas}.00`;
  } catch {
    return "0.00";
  }
}

function formatRelativeTime(timestampMs) {
  if (!timestampMs) return "Recently";
  const diffSeconds = Math.round((timestampMs - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, secondsPerUnit] of [["day", 86400], ["hour", 3600], ["minute", 60]]) {
    if (Math.abs(diffSeconds) >= secondsPerUnit || unit === "minute") {
      return formatter.format(Math.round(diffSeconds / secondsPerUnit), unit);
    }
  }
  return "just now";
}

function getExplorerBaseUrl() {
  return String(arcTestnet?.blockExplorers?.default?.url || "").replace(/\/$/, "");
}

function buildExplorerUrl(txHash) {
  const explorerUrl = getExplorerBaseUrl();
  return explorerUrl && txHash ? `${explorerUrl}/tx/${txHash}` : "";
}

function getEntityAddress(value) {
  if (!value) return "";
  if (typeof value === "string") return normalizeAddress(value);
  return normalizeAddress(value.hash || value.address_hash || "");
}

function getEntityName(value) {
  if (!value || typeof value === "string") return "";
  return value.name || value.implementation_name || value.metadata?.name || "";
}

function debugActivityLog(event, detail) {
  if (IS_DEVELOPMENT) console.info("[arc-wallet-activity]", event, detail);
}

function normalizedMethod(transaction, transfers = []) {
  return String(
    transaction?.method ||
    transaction?.decoded_input?.method_call ||
    transfers.find((item) => item?.method)?.method ||
    ""
  ).toLowerCase();
}

function transactionHash(transaction) {
  return transaction?.hash || transaction?.transaction_hash || "";
}

function transferHash(transfer) {
  return transfer?.transaction_hash || transfer?.transaction?.hash || "";
}

function transferToken(transfer) {
  const token = transfer?.token || {};
  return {
    symbol: token.symbol || "TOKEN",
    name: token.name || token.symbol || "Token",
    address: token.address_hash || token.address || "",
    decimals: Number(transfer?.total?.decimals ?? token.decimals ?? 18)
  };
}

function transferAmountValue(transfer) {
  const raw = transfer?.total?.value ?? transfer?.value ?? "0";
  const decimals = transferToken(transfer).decimals;
  try {
    return Number(formatUnits(BigInt(String(raw || "0")), decimals));
  } catch {
    return 0;
  }
}

function transferAmountLabel(transfer) {
  const token = transferToken(transfer);
  const raw = transfer?.total?.value ?? transfer?.value ?? "0";
  try {
    return `${formatAmount(BigInt(String(raw || "0")), token.decimals)} ${token.symbol}`;
  } catch {
    return `0.00 ${token.symbol}`;
  }
}

function isZeroAddress(address) {
  return Boolean(address && address.toLowerCase() === ZeroAddress.toLowerCase());
}

function isBridgeMethod(method) {
  return [
    "bridge",
    "depositforburn",
    "deposit_for_burn",
    "burn",
    "receivemessage",
    "receive_message",
    "gatewaymint",
    "mint",
    "tokenmessenger",
    "messagetransmitter",
    "forward"
  ].some((needle) => method.includes(needle));
}

function isSwapMethod(method) {
  return ["swap", "exacttokensfortokens", "exactinput", "exactoutput"].some((needle) => method.includes(needle));
}

function statusFromTransaction(transaction) {
  if (!transaction) return "Confirmed";
  const status = String(transaction.status ?? transaction.txreceipt_status ?? "").toLowerCase();
  if (["error", "failed", "0", "false"].includes(status)) return "Failed";
  return "Confirmed";
}

function timestampFrom(transaction, transfers) {
  const raw = transaction?.timestamp || transfers.find((item) => item?.timestamp)?.timestamp || "";
  return Date.parse(raw) || 0;
}

function nativeValue(transaction) {
  try {
    return BigInt(String(transaction?.value || "0"));
  } catch {
    return 0n;
  }
}

function mapExplorerHistoryItem(transaction, transfers, walletAddress) {
  const hash = transactionHash(transaction) || transferHash(transfers[0]);
  if (!hash) return null;

  const wallet = walletAddress.toLowerCase();
  const from = getEntityAddress(transaction?.from) || getEntityAddress(transfers[0]?.from);
  const to = getEntityAddress(transaction?.to) || getEntityAddress(transfers[0]?.to);
  const outgoing = transfers.filter((item) => getEntityAddress(item?.from).toLowerCase() === wallet);
  const incoming = transfers.filter((item) => getEntityAddress(item?.to).toLowerCase() === wallet);
  const method = normalizedMethod(transaction, transfers);
  const timestampMs = timestampFrom(transaction, transfers);
  const blockNumber = Number(transaction?.block_number || transfers[0]?.block_number || 0);
  const status = statusFromTransaction(transaction);
  const createdContract = getEntityAddress(transaction?.created_contract);
  const targetName = getEntityName(transaction?.to) || getEntityName(transaction?.created_contract);

  let kind = "contract";
  let type = "Contract interaction";
  let amount = "";
  let token = "";
  let counterparty = to || from || "";
  let summary = "Onchain contract interaction on Arc";
  let operation = "contract";

  const outgoingTokens = new Set(outgoing.map((item) => transferToken(item).symbol));
  const incomingTokens = new Set(incoming.map((item) => transferToken(item).symbol));
  const tokenChanged = [...outgoingTokens].some((symbol) => !incomingTokens.has(symbol)) || [...incomingTokens].some((symbol) => !outgoingTokens.has(symbol));
  const zeroBurn = outgoing.some((item) => isZeroAddress(getEntityAddress(item?.to)));
  const zeroMint = incoming.some((item) => isZeroAddress(getEntityAddress(item?.from)));

  if ((outgoing.length && incoming.length && tokenChanged) || isSwapMethod(method)) {
    const paid = outgoing[0];
    const received = incoming[0];
    kind = "swap";
    type = "Swap";
    operation = "swap";
    amount = `${paid ? transferAmountLabel(paid) : "Token"} → ${received ? transferAmountLabel(received) : "Token"}`;
    token = transferToken(paid || received).symbol;
    counterparty = to || "Arc liquidity";
    summary = `Swapped assets${method ? ` via ${method.split("(")[0]}` : ""} on ${ARC_NETWORK_LABEL}`;
  } else if (isBridgeMethod(method) || zeroBurn || zeroMint) {
    const moved = outgoing[0] || incoming[0];
    kind = zeroMint ? "bridge_received" : "bridge";
    type = zeroMint ? "Bridge received" : "Bridge";
    operation = "bridge";
    amount = moved ? transferAmountLabel(moved) : "Tracked";
    token = moved ? transferToken(moved).symbol : "USDC";
    counterparty = to || from || "Circle bridge";
    summary = zeroMint
      ? `Bridged ${token || "asset"} landed on ${ARC_NETWORK_LABEL}`
      : `Cross-chain bridge transaction on ${ARC_NETWORK_LABEL}`;
  } else if (outgoing.length) {
    const moved = outgoing[0];
    kind = "sent";
    type = `Sent ${transferToken(moved).symbol}`;
    operation = "send";
    amount = transferAmountLabel(moved);
    token = transferToken(moved).symbol;
    counterparty = getEntityAddress(moved?.to);
    summary = `Sent ${amount} to ${shortAddress(counterparty)}`;
  } else if (incoming.length) {
    const moved = incoming[0];
    kind = "received";
    type = `Received ${transferToken(moved).symbol}`;
    operation = "receive";
    amount = transferAmountLabel(moved);
    token = transferToken(moved).symbol;
    counterparty = getEntityAddress(moved?.from);
    summary = `Received ${amount} from ${shortAddress(counterparty)}`;
  } else if (createdContract) {
    kind = "contract";
    type = "Contract deployed";
    operation = "contract_deploy";
    counterparty = createdContract;
    summary = `Deployed ${targetName || "contract"} at ${shortAddress(createdContract)}`;
  } else if (nativeValue(transaction) > 0n) {
    const sentByWallet = from.toLowerCase() === wallet;
    kind = sentByWallet ? "sent" : "received";
    type = sentByWallet ? "Sent USDC" : "Received USDC";
    operation = sentByWallet ? "send" : "receive";
    amount = `${formatAmount(nativeValue(transaction), NATIVE_USDC_DECIMALS)} USDC`;
    token = "USDC";
    counterparty = sentByWallet ? to : from;
    summary = sentByWallet
      ? `Sent ${amount} to ${shortAddress(counterparty)}`
      : `Received ${amount} from ${shortAddress(counterparty)}`;
  } else {
    const methodLabel = String(transaction?.method || "").trim();
    type = createdContract ? "Contract deployed" : "Contract interaction";
    summary = methodLabel
      ? `${methodLabel} on ${targetName || shortAddress(to) || ARC_NETWORK_LABEL}`
      : `Onchain interaction with ${targetName || shortAddress(to) || "Arc contract"}`;
  }

  return {
    id: `explorer-${hash}`,
    type,
    kind,
    token: token || "",
    amount,
    amountValue: outgoing[0] ? transferAmountValue(outgoing[0]) : incoming[0] ? transferAmountValue(incoming[0]) : 0,
    chain: ARC_NETWORK_LABEL,
    chainId: arcTestnet.id,
    blockNumber,
    timeLabel: formatRelativeTime(timestampMs),
    txHash: hash,
    txHashShort: shortHash(hash),
    summary,
    from,
    to,
    counterparty,
    explorerUrl: buildExplorerUrl(hash),
    status,
    timestampMs,
    metadata: {
      operation,
      method: transaction?.method || transfers[0]?.method || "",
      contractName: targetName || "",
      contractAddress: createdContract || to || "",
      source: "arc-explorer-history",
      transferCount: transfers.length
    }
  };
}

async function fetchExplorerPages(path, initialParams = {}) {
  const explorer = getExplorerBaseUrl();
  if (!explorer) return [];
  let cursor = {};
  const items = [];

  for (let page = 0; page < EXPLORER_MAX_PAGES; page += 1) {
    const url = new URL(`${explorer}${path}`);
    Object.entries({ ...initialParams, ...cursor }).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Arc explorer returned ${response.status}`);
    const payload = await response.json();
    const pageItems = Array.isArray(payload?.items) ? payload.items : [];
    items.push(...pageItems);

    const next = payload?.next_page_params;
    if (!next || typeof next !== "object" || !Object.keys(next).length || !pageItems.length) break;
    cursor = next;
  }

  return items;
}

async function getExplorerDeepActivity(walletAddress, limit = EXPLORER_RESULT_LIMIT) {
  const encoded = encodeURIComponent(walletAddress);
  const [transactions, tokenTransfers] = await Promise.all([
    fetchExplorerPages(`/api/v2/addresses/${encoded}/transactions`),
    fetchExplorerPages(`/api/v2/addresses/${encoded}/token-transfers`, { type: "ERC-20" })
  ]);

  const transactionByHash = new Map();
  transactions.forEach((transaction) => {
    const hash = transactionHash(transaction);
    if (hash) transactionByHash.set(hash.toLowerCase(), transaction);
  });

  const transfersByHash = new Map();
  tokenTransfers.forEach((transfer) => {
    const hash = transferHash(transfer);
    if (!hash) return;
    const key = hash.toLowerCase();
    if (!transfersByHash.has(key)) transfersByHash.set(key, []);
    transfersByHash.get(key).push(transfer);
  });

  const allHashes = new Set([...transactionByHash.keys(), ...transfersByHash.keys()]);
  const rows = [...allHashes]
    .map((hash) => mapExplorerHistoryItem(transactionByHash.get(hash), transfersByHash.get(hash) || [], walletAddress))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.timestampMs !== left.timestampMs) return right.timestampMs - left.timestampMs;
      return right.blockNumber - left.blockNumber;
    })
    .slice(0, Math.max(1, Number(limit) || EXPLORER_RESULT_LIMIT));

  debugActivityLog("explorer-history", {
    walletAddress,
    transactionPagesItems: transactions.length,
    tokenTransferItems: tokenTransfers.length,
    mergedCount: rows.length
  });

  return rows;
}

async function getLogsInChunks({ address, topics, fromBlock, toBlock }) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, toBlock);
    logs.push(...await getProvider().getLogs({ address, topics, fromBlock: start, toBlock: end }));
  }
  return logs;
}

async function getTimestampMs(blockNumber, blockCache) {
  if (!blockCache.has(blockNumber)) {
    blockCache.set(blockNumber, getProvider().getBlock(blockNumber).then((block) => Number(block?.timestamp || 0) * 1000).catch(() => 0));
  }
  return blockCache.get(blockNumber);
}

async function mapTransferLog(log, walletAddress, blockCache) {
  const parsed = usdcInterface.parseLog(log);
  const from = normalizeAddress(parsed.args.from);
  const to = normalizeAddress(parsed.args.to);
  const blockNumber = Number(log.blockNumber);
  const timestampMs = await getTimestampMs(blockNumber, blockCache);
  const amount = `${formatAmount(parsed.args.value, USDC_DECIMALS)} USDC`;
  const sentByWallet = from === walletAddress;
  const receivedByWallet = to === walletAddress;
  const mintedToWallet = receivedByWallet && from === ZeroAddress;
  let type = "USDC transfer";
  let summary = `USDC moved on ${ARC_NETWORK_LABEL}`;
  let kind = "other";
  let counterparty = "";

  if (mintedToWallet) {
    type = "Bridge received";
    summary = `Bridged USDC landed on ${ARC_NETWORK_LABEL}`;
    kind = "bridge_received";
  } else if (receivedByWallet) {
    type = "Received USDC";
    summary = `Received from ${shortAddress(from)}`;
    kind = "received";
    counterparty = from;
  } else if (sentByWallet) {
    type = "Sent USDC";
    summary = `Sent to ${shortAddress(to)}`;
    kind = "sent";
    counterparty = to;
  }

  return {
    id: `${log.transactionHash}:${log.index}`,
    type,
    kind,
    token: "USDC",
    contract: ARC_USDC_ERC20_ADDRESS,
    amount,
    amountValue: Number(formatUnits(parsed.args.value, USDC_DECIMALS)),
    chain: ARC_NETWORK_LABEL,
    chainId: arcTestnet.id,
    blockNumber,
    timeLabel: formatRelativeTime(timestampMs),
    txHash: log.transactionHash,
    txHashShort: shortHash(log.transactionHash),
    summary,
    from,
    to,
    counterparty,
    explorerUrl: buildExplorerUrl(log.transactionHash),
    status: "Confirmed",
    timestampMs,
    metadata: { source: "arc-rpc-fallback" }
  };
}

async function getRpcFallbackActivity(address, { lookbackBlocks = DEFAULT_LOOKBACK_BLOCKS, limit = 50 } = {}) {
  const walletAddress = normalizeAddress(address);
  const currentBlock = await getProvider().getBlockNumber();
  const boundedLookback = Math.min(Math.max(Number(lookbackBlocks) || DEFAULT_LOOKBACK_BLOCKS, 1), DEFAULT_LOOKBACK_BLOCKS);
  const fromBlock = Math.max(currentBlock - (boundedLookback - 1), 0);
  const userTopic = addressToTopic(walletAddress);
  const blockCache = new Map();

  const [incomingLogs, outgoingLogs] = await Promise.all([
    getLogsInChunks({ address: ARC_USDC_ERC20_ADDRESS, topics: [usdcInterface.getEvent("Transfer").topicHash, null, userTopic], fromBlock, toBlock: currentBlock }),
    getLogsInChunks({ address: ARC_USDC_ERC20_ADDRESS, topics: [usdcInterface.getEvent("Transfer").topicHash, userTopic], fromBlock, toBlock: currentBlock })
  ]);

  const deduped = new Map();
  [...incomingLogs, ...outgoingLogs].forEach((log) => deduped.set(`${log.transactionHash}:${log.index}`, log));
  const activity = await Promise.all([...deduped.values()].map((log) => mapTransferLog(log, walletAddress, blockCache)));
  return activity.sort((a, b) => b.blockNumber - a.blockNumber).slice(0, limit);
}

export async function getWalletActivity(address, options = {}) {
  const walletAddress = normalizeAddress(address);
  if (!walletAddress) throw new Error("A valid wallet address is required.");

  try {
    const explorerActivity = await getExplorerDeepActivity(walletAddress, options.limit || EXPLORER_RESULT_LIMIT);
    if (explorerActivity.length) return explorerActivity;
  } catch (error) {
    debugActivityLog("explorer-history-error", {
      walletAddress,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  return getRpcFallbackActivity(walletAddress, options);
}

export async function getTransactionStatus(txHash) {
  const receipt = await getProvider().getTransactionReceipt(txHash);
  if (!receipt) return { status: "Pending", blockNumber: null };
  return {
    status: receipt.status === 1 ? "Confirmed" : "Failed",
    blockNumber: Number(receipt.blockNumber || 0)
  };
}
