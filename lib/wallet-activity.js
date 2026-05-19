import { Interface, JsonRpcProvider, ZeroAddress, formatUnits, getAddress } from "ethers";
import { ARC_USDC_ERC20_ADDRESS, arcTestnet } from "./arc-chain";

const provider = new JsonRpcProvider(arcTestnet.rpcUrls.default.http[0]);

const usdcInterface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

const DEFAULT_LOOKBACK_BLOCKS = 9000;
const DEFAULT_LIMIT = 25;
const LOG_CHUNK_SIZE = 9000;
const USDC_DECIMALS = 6;
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

function normalizeAddress(address) {
  return getAddress(address);
}

function addressToTopic(address) {
  return `0x000000000000000000000000${address.slice(2).toLowerCase()}`;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function formatAmount(value, decimals) {
  const [whole = "0", fractional = ""] = formatUnits(value, decimals).split(".");
  const wholeWithCommas = BigInt(whole || "0").toLocaleString();
  const trimmedFractional = fractional.replace(/0+$/, "").slice(0, 4);

  if (!trimmedFractional) {
    return `${wholeWithCommas}.00`;
  }

  return `${wholeWithCommas}.${trimmedFractional}`;
}

function formatRelativeTime(timestampMs) {
  if (!timestampMs) {
    return "Recently";
  }

  const diffMs = timestampMs - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto"
  });
  const ranges = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
  ];

  for (const [unit, secondsPerUnit] of ranges) {
    if (Math.abs(diffSeconds) >= secondsPerUnit || unit === "minute") {
      return formatter.format(
        Math.round(diffSeconds / secondsPerUnit),
        unit
      );
    }
  }

  return "just now";
}

async function getLogsInChunks({ address, topics, fromBlock, toBlock }) {
  const logs = [];

  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, toBlock);
    const batch = await provider.getLogs({
      address,
      topics,
      fromBlock: start,
      toBlock: end
    });

    logs.push(...batch);
  }

  return logs;
}

async function getTimestampMs(blockNumber, blockCache) {
  if (!blockCache.has(blockNumber)) {
    blockCache.set(
      blockNumber,
      provider
        .getBlock(blockNumber)
        .then((block) => Number(block?.timestamp || 0) * 1000)
        .catch(() => 0)
    );
  }

  return blockCache.get(blockNumber);
}

function buildExplorerUrl(txHash) {
  return `${arcTestnet.blockExplorers.default.url}/tx/${txHash}`;
}

function debugActivityLog(event, detail) {
  if (!IS_DEVELOPMENT) {
    return;
  }

  console.info("[arc-wallet-activity]", event, detail);
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
  let summary = "USDC moved on Arc Testnet";
  let kind = "other";
  let counterparty = "";

  if (mintedToWallet) {
    type = "Bridge received";
    summary = "Bridged USDC landed on Arc Testnet";
    kind = "bridge_received";
  } else if (sentByWallet && receivedByWallet) {
    type = "Internal transfer";
    summary = "Moved USDC within this wallet";
    kind = "internal";
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
    sortIndex: Number(log.index || 0)
  };
}

export async function getWalletActivity(
  address,
  { lookbackBlocks = DEFAULT_LOOKBACK_BLOCKS, limit = DEFAULT_LIMIT } = {}
) {
  const walletAddress = normalizeAddress(address);
  const currentBlock = await provider.getBlockNumber();
  const boundedLookback = Math.min(
    Math.max(Number(lookbackBlocks) || DEFAULT_LOOKBACK_BLOCKS, 1),
    DEFAULT_LOOKBACK_BLOCKS
  );
  const fromBlock = Math.max(currentBlock - (boundedLookback - 1), 0);
  const userTopic = addressToTopic(walletAddress);
  const blockCache = new Map();

  const [incomingLogs, outgoingLogs] = await Promise.all([
    getLogsInChunks({
      address: ARC_USDC_ERC20_ADDRESS,
      topics: [usdcInterface.getEvent("Transfer").topicHash, null, userTopic],
      fromBlock,
      toBlock: currentBlock
    }),
    getLogsInChunks({
      address: ARC_USDC_ERC20_ADDRESS,
      topics: [usdcInterface.getEvent("Transfer").topicHash, userTopic],
      fromBlock,
      toBlock: currentBlock
    })
  ]);

  debugActivityLog("rpc-transfer-logs", {
    walletAddress,
    chainId: arcTestnet.id,
    fromBlock,
    toBlock: currentBlock,
    incomingCount: incomingLogs.length,
    outgoingCount: outgoingLogs.length
  });

  const dedupedTransferLogs = [...incomingLogs, ...outgoingLogs].reduce(
    (accumulator, log) => {
      accumulator.set(`${log.transactionHash}:${log.index}`, log);
      return accumulator;
    },
    new Map()
  );

  const activity = await Promise.all([
    ...[...dedupedTransferLogs.values()].map((log) =>
      mapTransferLog(log, walletAddress, blockCache)
    )
  ]);

  return activity
    .sort((left, right) => {
      if (right.blockNumber !== left.blockNumber) {
        return right.blockNumber - left.blockNumber;
      }

      return right.sortIndex - left.sortIndex;
    })
    .slice(0, limit)
    .map(({ sortIndex, ...item }) => item);
}

export async function getTransactionStatus(txHash) {
  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt) {
    return {
      status: "Pending",
      blockNumber: null
    };
  }

  return {
    status: receipt.status === 1 ? "Confirmed" : "Failed",
    blockNumber: Number(receipt.blockNumber || 0)
  };
}
