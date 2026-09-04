import {
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  formatUnits,
  getAddress
} from "ethers";
import { arcTestnet } from "./arc-chain";
import { getWalletActivity as getArcWalletActivity } from "./wallet-activity";
import { WALLET_ACTIVITY_NETWORKS } from "./wallet-networks";

const usdcInterface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

const TRANSFER_TOPIC = usdcInterface.getEvent("Transfer").topicHash;
const DEFAULT_LOOKBACK_BLOCKS = 12_000;
const MAX_LOOKBACK_BLOCKS = 50_000;
const LOG_CHUNK_SIZE = 4_000;
const PER_NETWORK_LIMIT = 32;
const DEFAULT_LIMIT = 75;

function normalizeAddress(value) {
  return getAddress(value);
}

function addressToTopic(address) {
  return `0x000000000000000000000000${address.slice(2).toLowerCase()}`;
}

function shortAddress(value) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function shortHash(value) {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function formatAmount(value) {
  const numeric = Number(formatUnits(value, 6));
  if (!Number.isFinite(numeric)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  }).format(numeric);
}

function formatRelativeTime(timestampMs) {
  if (!timestampMs) return "Recently";
  const seconds = Math.round((timestampMs - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, divisor] of [["day", 86400], ["hour", 3600], ["minute", 60]]) {
    if (Math.abs(seconds) >= divisor || unit === "minute") {
      return formatter.format(Math.round(seconds / divisor), unit);
    }
  }
  return "Recently";
}

async function getLogsInChunks(provider, request) {
  const rows = [];
  for (let start = request.fromBlock; start <= request.toBlock; start += LOG_CHUNK_SIZE) {
    const end = Math.min(start + LOG_CHUNK_SIZE - 1, request.toBlock);
    const batch = await provider.getLogs({
      address: request.address,
      topics: request.topics,
      fromBlock: start,
      toBlock: end
    });
    rows.push(...batch);
  }
  return rows;
}

async function getBlockTimestamp(provider, blockNumber, cache) {
  if (!cache.has(blockNumber)) {
    cache.set(
      blockNumber,
      provider
        .getBlock(blockNumber)
        .then((block) => Number(block?.timestamp || 0) * 1000)
        .catch(() => 0)
    );
  }
  return cache.get(blockNumber);
}

async function getNetworkUsdcActivity(network, walletAddress, lookbackBlocks) {
  const provider = new JsonRpcProvider(network.rpcUrl, network.id, { staticNetwork: true });
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - lookbackBlocks + 1);
  const walletTopic = addressToTopic(walletAddress);

  const [incoming, outgoing] = await Promise.all([
    getLogsInChunks(provider, {
      address: network.usdcAddress,
      topics: [TRANSFER_TOPIC, null, walletTopic],
      fromBlock,
      toBlock: currentBlock
    }),
    getLogsInChunks(provider, {
      address: network.usdcAddress,
      topics: [TRANSFER_TOPIC, walletTopic],
      fromBlock,
      toBlock: currentBlock
    })
  ]);

  const deduped = new Map();
  [...incoming, ...outgoing].forEach((log) => {
    deduped.set(`${log.transactionHash}:${log.index}`, log);
  });

  const logs = [...deduped.values()]
    .sort((left, right) => {
      const blockDiff = Number(right.blockNumber) - Number(left.blockNumber);
      if (blockDiff) return blockDiff;
      return Number(right.index || 0) - Number(left.index || 0);
    })
    .slice(0, PER_NETWORK_LIMIT);

  const blockCache = new Map();
  return Promise.all(
    logs.map(async (log) => {
      const parsed = usdcInterface.parseLog(log);
      const from = normalizeAddress(parsed.args.from);
      const to = normalizeAddress(parsed.args.to);
      const sentByWallet = from === walletAddress;
      const receivedByWallet = to === walletAddress;
      const mintedToWallet = receivedByWallet && from === ZeroAddress;
      const timestampMs = await getBlockTimestamp(provider, Number(log.blockNumber), blockCache);
      const amount = `${formatAmount(parsed.args.value)} USDC`;

      let type = "USDC transfer";
      let kind = "other";
      let summary = `USDC moved on ${network.name}`;
      let counterparty = "";

      if (mintedToWallet) {
        type = "Bridge received";
        kind = "bridge_received";
        summary = `Bridge settlement received on ${network.name}`;
      } else if (sentByWallet && receivedByWallet) {
        type = "Internal transfer";
        kind = "internal";
        summary = `Moved USDC within this wallet on ${network.name}`;
      } else if (receivedByWallet) {
        type = "Received USDC";
        kind = "received";
        counterparty = from;
        summary = `Received from ${shortAddress(from)} on ${network.name}`;
      } else if (sentByWallet) {
        type = "Sent USDC";
        kind = "sent";
        counterparty = to;
        summary = `Sent to ${shortAddress(to)} on ${network.name}`;
      }

      return {
        id: `${network.id}:${log.transactionHash}:${log.index}`,
        type,
        kind,
        token: "USDC",
        contract: network.usdcAddress,
        amount,
        amountValue: Number(formatUnits(parsed.args.value, 6)),
        chain: network.name,
        chainId: network.id,
        blockNumber: Number(log.blockNumber),
        timeLabel: formatRelativeTime(timestampMs),
        txHash: log.transactionHash,
        txHashShort: shortHash(log.transactionHash),
        summary,
        from,
        to,
        counterparty,
        explorerUrl: network.explorerUrl ? `${network.explorerUrl}/tx/${log.transactionHash}` : "",
        status: "Confirmed",
        timestampMs,
        metadata: {
          assetType: "erc20",
          source: "rpc",
          network: network.name
        }
      };
    })
  );
}

function networkState(network, status, count = 0, error = "") {
  return {
    chainId: network.id,
    name: network.name,
    shortName: network.shortName,
    status,
    count,
    error
  };
}

export async function getMultichainWalletActivity(
  address,
  { lookbackBlocks = DEFAULT_LOOKBACK_BLOCKS, limit = DEFAULT_LIMIT } = {}
) {
  const walletAddress = normalizeAddress(address);
  const boundedLookback = Math.min(
    Math.max(Number(lookbackBlocks) || DEFAULT_LOOKBACK_BLOCKS, 1_000),
    MAX_LOOKBACK_BLOCKS
  );
  const boundedLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 150);

  const networks = WALLET_ACTIVITY_NETWORKS;
  const arcNetwork = networks.find((network) => network.id === arcTestnet.id);
  const otherNetworks = networks.filter((network) => network.id !== arcTestnet.id);
  const activity = [];
  const networkStatuses = [];

  if (arcNetwork) {
    try {
      const arcRows = await getArcWalletActivity(walletAddress, {
        lookbackBlocks: Math.min(boundedLookback, 9_000),
        limit: PER_NETWORK_LIMIT
      });
      const normalizedArcRows = arcRows.map((item) => ({
        ...item,
        chain: item.chain || arcNetwork.name,
        chainId: item.chainId || arcNetwork.id,
        metadata: { ...(item.metadata || {}), network: arcNetwork.name }
      }));
      activity.push(...normalizedArcRows);
      networkStatuses.push(networkState(arcNetwork, "ready", normalizedArcRows.length));
    } catch (error) {
      networkStatuses.push(networkState(arcNetwork, "error", 0, error instanceof Error ? error.message : "Arc sync failed"));
    }
  }

  const settled = await Promise.allSettled(
    otherNetworks.map((network) => getNetworkUsdcActivity(network, walletAddress, boundedLookback))
  );

  settled.forEach((result, index) => {
    const network = otherNetworks[index];
    if (result.status === "fulfilled") {
      activity.push(...result.value);
      networkStatuses.push(networkState(network, "ready", result.value.length));
    } else {
      networkStatuses.push(
        networkState(
          network,
          "error",
          0,
          result.reason instanceof Error ? result.reason.message : "Network sync failed"
        )
      );
    }
  });

  const deduped = new Map();
  activity.forEach((item) => {
    const key = `${Number(item.chainId || arcTestnet.id)}:${String(item.txHash || item.id || "").toLowerCase()}:${item.id || ""}`;
    if (!deduped.has(key)) deduped.set(key, item);
  });

  return {
    activity: [...deduped.values()]
      .sort((left, right) => {
        const timeDiff = Number(right.timestampMs || 0) - Number(left.timestampMs || 0);
        if (timeDiff) return timeDiff;
        return Number(right.blockNumber || 0) - Number(left.blockNumber || 0);
      })
      .slice(0, boundedLimit),
    networks: networkStatuses.sort((left, right) => left.chainId - right.chainId)
  };
}
