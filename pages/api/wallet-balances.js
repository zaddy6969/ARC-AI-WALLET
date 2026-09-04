import { createPublicClient, erc20Abi, formatUnits, getAddress, http, isAddress } from "viem";
import {
  ARC_PORTFOLIO_TOKENS,
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

function formatUsd(value) {
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(safeNumber(value))}`;
}

async function readSpotPrice(pair) {
  try {
    const response = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3500)
    });
    if (!response.ok) return 0;
    const payload = await response.json();
    return safeNumber(payload?.data?.amount);
  } catch {
    return 0;
  }
}

async function readMarketPrices() {
  const [ethUsd, btcUsd] = await Promise.all([
    readSpotPrice("ETH-USD"),
    readSpotPrice("BTC-USD")
  ]);
  return { ethUsd, btcUsd };
}

function tokenConfigForChain(chain, prices) {
  if (chain.id === arcTestnet.id) {
    return ARC_PORTFOLIO_TOKENS.filter((token) => token?.address).map((token) => ({
      ...token,
      priceUsd:
        token.symbol === "cirBTC" && prices.btcUsd > 0
          ? prices.btcUsd
          : safeNumber(token.priceUsd)
    }));
  }

  const usdcAddress = USDC_BY_CHAIN[chain.id] || "";
  return usdcAddress
    ? [
        {
          symbol: "USDC",
          name: "USD Coin",
          address: usdcAddress,
          decimals: 6,
          priceUsd: 1
        }
      ]
    : [];
}

async function readNetworkBalance(chain, address, prices) {
  const rpcUrl = chain?.rpcUrls?.default?.http?.[0];
  if (!rpcUrl) {
    return {
      chainId: chain.id,
      name: chain.name,
      status: "unavailable",
      assets: [],
      totalUsd: 0,
      totalUsdDisplay: "$0.00",
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

  const configuredTokens = tokenConfigForChain(chain, prices);
  const [nativeResult, tokenResults] = await Promise.all([
    client.getBalance({ address }).then(
      (value) => ({ status: "fulfilled", value }),
      (reason) => ({ status: "rejected", reason })
    ),
    Promise.all(
      configuredTokens.map((token) =>
        client
          .readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address]
          })
          .then(
            (value) => ({ status: "fulfilled", value }),
            (reason) => ({ status: "rejected", reason })
          )
      )
    )
  ]);

  const nativeBalance =
    nativeResult.status === "fulfilled" && typeof nativeResult.value === "bigint"
      ? safeNumber(formatUnits(nativeResult.value, chain.nativeCurrency.decimals))
      : 0;

  const assets = configuredTokens.map((token, index) => {
    const result = tokenResults[index];
    const balanceValue =
      result?.status === "fulfilled" && typeof result.value === "bigint"
        ? safeNumber(formatUnits(result.value, token.decimals))
        : 0;
    const priceUsd = safeNumber(token.priceUsd);
    return {
      symbol: token.symbol,
      name: token.name,
      balanceValue,
      balanceDisplay: `${formatAmount(balanceValue, token.symbol === "USDC" || token.symbol === "EURC" ? 4 : 8)} ${token.symbol}`,
      priceUsd,
      valueUsd: balanceValue * priceUsd,
      valueUsdDisplay: formatUsd(balanceValue * priceUsd),
      status: result?.status === "fulfilled" ? "ready" : "unavailable",
      native: false
    };
  });

  const usdcAsset = assets.find((asset) => asset.symbol === "USDC");

  // Arc uses USDC as its gas asset. If the ERC-20 balance read fails entirely, use the
  // native USDC balance as a fallback, but never count native + ERC-20 USDC twice.
  if (
    chain.id === arcTestnet.id &&
    usdcAsset &&
    usdcAsset.status !== "ready" &&
    nativeResult.status === "fulfilled"
  ) {
    usdcAsset.balanceValue = nativeBalance;
    usdcAsset.balanceDisplay = `${formatAmount(nativeBalance, 4)} USDC`;
    usdcAsset.valueUsd = nativeBalance;
    usdcAsset.valueUsdDisplay = formatUsd(nativeBalance);
    usdcAsset.status = "ready";
  }

  if (chain.id !== arcTestnet.id && nativeResult.status === "fulfilled") {
    const nativePriceUsd = chain.nativeCurrency.symbol === "ETH" ? prices.ethUsd : 0;
    assets.push({
      symbol: chain.nativeCurrency.symbol,
      name: chain.nativeCurrency.name,
      balanceValue: nativeBalance,
      balanceDisplay: `${formatAmount(nativeBalance, 6)} ${chain.nativeCurrency.symbol}`,
      priceUsd: nativePriceUsd,
      valueUsd: nativeBalance * nativePriceUsd,
      valueUsdDisplay: nativePriceUsd > 0 ? formatUsd(nativeBalance * nativePriceUsd) : "Price unavailable",
      status: "ready",
      native: true
    });
  }

  const successfulTokenRead = assets.some((asset) => asset.status === "ready");
  const hasAnySuccessfulRead = nativeResult.status === "fulfilled" || successfulTokenRead;
  const totalUsd = assets.reduce((sum, asset) => sum + safeNumber(asset.valueUsd), 0);
  const positiveAssets = assets.filter((asset) => asset.status === "ready" && asset.balanceValue > 0);
  const assetSummary = positiveAssets.length
    ? positiveAssets.map((asset) => asset.balanceDisplay).join(" · ")
    : "No funded tracked assets";

  return {
    chainId: chain.id,
    name: chain.name,
    status: hasAnySuccessfulRead ? "ready" : "unavailable",
    explorerUrl: chain?.blockExplorers?.default?.url || "",
    assets,
    assetCount: positiveAssets.length,
    assetSummary,
    totalUsd,
    totalUsdDisplay: formatUsd(totalUsd),
    usdcBalance: safeNumber(usdcAsset?.balanceValue),
    usdcDisplay: usdcAsset?.balanceDisplay || "0.00 USDC",
    usdcValueUsd: safeNumber(usdcAsset?.valueUsd),
    nativeBalance,
    nativeDisplay: `${formatAmount(nativeBalance, 6)} ${chain.nativeCurrency.symbol}`,
    nativeSymbol: chain.nativeCurrency.symbol,
    pricingPartial:
      chain.id !== arcTestnet.id &&
      nativeBalance > 0 &&
      chain.nativeCurrency.symbol === "ETH" &&
      prices.ethUsd <= 0
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
  const prices = await readMarketPrices();
  const settled = await Promise.allSettled(
    MULTICHAIN_WALLET_CHAINS.map((chain) => readNetworkBalance(chain, address, prices))
  );

  const networks = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const chain = MULTICHAIN_WALLET_CHAINS[index];
    return {
      chainId: chain.id,
      name: chain.name,
      status: "unavailable",
      explorerUrl: chain?.blockExplorers?.default?.url || "",
      assets: [],
      assetCount: 0,
      assetSummary: "Balance read unavailable",
      totalUsd: 0,
      totalUsdDisplay: "$0.00",
      usdcBalance: 0,
      usdcDisplay: "0.00 USDC",
      usdcValueUsd: 0,
      nativeBalance: 0,
      nativeDisplay: `0.00 ${chain.nativeCurrency.symbol}`,
      nativeSymbol: chain.nativeCurrency.symbol,
      pricingPartial: false
    };
  });

  const readyNetworks = networks.filter((network) => network.status === "ready");
  const totalUsdc = readyNetworks.reduce((sum, network) => sum + safeNumber(network.usdcBalance), 0);
  const totalUsd = readyNetworks.reduce((sum, network) => sum + safeNumber(network.totalUsd), 0);
  const totalAssetCount = readyNetworks.reduce((sum, network) => sum + safeNumber(network.assetCount), 0);
  const pricingPartial = networks.some((network) => network.pricingPartial);

  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(200).json({
    ok: true,
    address,
    totalUsdc,
    totalUsd,
    totalUsdDisplay: formatUsd(totalUsd),
    totalAssetCount,
    networks,
    prices: {
      ethUsd: prices.ethUsd,
      btcUsd: prices.btcUsd
    },
    partial: readyNetworks.length !== networks.length,
    pricingPartial,
    checkedAt: new Date().toISOString()
  });
}
