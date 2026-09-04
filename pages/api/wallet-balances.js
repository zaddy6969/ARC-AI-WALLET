import { createPublicClient, erc20Abi, formatUnits, getAddress, http, isAddress } from "viem";
import {
  ARC_USDC_ERC20_ADDRESS,
  MULTICHAIN_WALLET_CHAINS,
  arcTestnet
} from "../../lib/arc-chain";

const USDC_BY_CHAIN = {
  [arcTestnet.id]: ARC_USDC_ERC20_ADDRESS,
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
};

function safeNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatAmount(value, maximumFractionDigits = 6) {
  const numeric = safeNumber(value);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: numeric >= 1000 ? 0 : 2,
    maximumFractionDigits
  }).format(numeric);
}

async function readNetworkBalance(chain, address) {
  const rpcUrl = chain?.rpcUrls?.default?.http?.[0];
  if (!rpcUrl) {
    return {
      chainId: chain.id,
      name: chain.name,
      status: "unavailable",
      usdcBalance: 0,
      usdcDisplay: "0.00 USDC",
      nativeBalance: 0,
      nativeDisplay: `0.00 ${chain.nativeCurrency.symbol}`,
      nativeSymbol: chain.nativeCurrency.symbol
    };
  }

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { timeout: 9000, retryCount: 1 })
  });

  const usdcAddress = USDC_BY_CHAIN[chain.id] || "";
  const [nativeResult, usdcResult] = await Promise.allSettled([
    client.getBalance({ address }),
    usdcAddress
      ? client.readContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address]
        })
      : Promise.resolve(null)
  ]);

  const nativeBalance =
    nativeResult.status === "fulfilled" && typeof nativeResult.value === "bigint"
      ? safeNumber(formatUnits(nativeResult.value, chain.nativeCurrency.decimals))
      : 0;

  let usdcBalance =
    usdcResult.status === "fulfilled" && typeof usdcResult.value === "bigint"
      ? safeNumber(formatUnits(usdcResult.value, 6))
      : 0;

  // Arc uses USDC as the native gas asset. Keep the ERC-20 predeploy as the primary
  // balance source, but use the native balance as a fallback if the token read is unavailable.
  if (chain.id === arcTestnet.id && usdcBalance === 0 && nativeBalance > 0 && usdcResult.status !== "fulfilled") {
    usdcBalance = nativeBalance;
  }

  const hasAnySuccessfulRead = nativeResult.status === "fulfilled" || usdcResult.status === "fulfilled";

  return {
    chainId: chain.id,
    name: chain.name,
    status: hasAnySuccessfulRead ? "ready" : "unavailable",
    explorerUrl: chain?.blockExplorers?.default?.url || "",
    usdcBalance,
    usdcDisplay: `${formatAmount(usdcBalance, 4)} USDC`,
    usdcValueUsd: usdcBalance,
    nativeBalance,
    nativeDisplay: `${formatAmount(nativeBalance, 6)} ${chain.nativeCurrency.symbol}`,
    nativeSymbol: chain.nativeCurrency.symbol
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const rawAddress = String(req.query?.address || "").trim();
  if (!isAddress(rawAddress)) {
    return res.status(400).json({ error: "A valid wallet address is required." });
  }

  const address = getAddress(rawAddress);
  const settled = await Promise.allSettled(
    MULTICHAIN_WALLET_CHAINS.map((chain) => readNetworkBalance(chain, address))
  );

  const networks = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const chain = MULTICHAIN_WALLET_CHAINS[index];
    return {
      chainId: chain.id,
      name: chain.name,
      status: "unavailable",
      explorerUrl: chain?.blockExplorers?.default?.url || "",
      usdcBalance: 0,
      usdcDisplay: "0.00 USDC",
      usdcValueUsd: 0,
      nativeBalance: 0,
      nativeDisplay: `0.00 ${chain.nativeCurrency.symbol}`,
      nativeSymbol: chain.nativeCurrency.symbol
    };
  });

  const readyNetworks = networks.filter((network) => network.status === "ready");
  const totalUsdc = readyNetworks.reduce((sum, network) => sum + safeNumber(network.usdcBalance), 0);

  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(200).json({
    ok: true,
    address,
    totalUsdc,
    totalUsd: totalUsdc,
    networks,
    partial: readyNetworks.length !== networks.length,
    checkedAt: new Date().toISOString()
  });
}
