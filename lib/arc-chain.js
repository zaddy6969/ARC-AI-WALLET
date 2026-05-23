import { baseSepolia, sepolia } from "viem/chains";

export const ARC_TESTNET_NETWORK_CONFIG = {
  chainId: 5042002,
  rpcUrl:
    process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network",
  currencySymbol: "USDC",
  explorerUrl: "https://testnet.arcscan.app"
};

export const ARC_MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

export const arcTestnet = {
  id: ARC_TESTNET_NETWORK_CONFIG.chainId,
  name: "Arc Testnet",
  iconBackground: "#06131d",
  nativeCurrency: {
    name: "USDC",
    symbol: ARC_TESTNET_NETWORK_CONFIG.currencySymbol,
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [ARC_TESTNET_NETWORK_CONFIG.rpcUrl],
      webSocket: ["wss://rpc.testnet.arc.network"]
    },
    public: {
      http: [ARC_TESTNET_NETWORK_CONFIG.rpcUrl],
      webSocket: ["wss://rpc.testnet.arc.network"]
    }
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: ARC_TESTNET_NETWORK_CONFIG.explorerUrl
    }
  },
  contracts: {
    multicall3: {
      address: ARC_MULTICALL3_ADDRESS,
      blockCreated: 1n
    }
  },
  testnet: true
};

export const ARC_NETWORK_DETAILS = [
  { label: "RPC", value: ARC_TESTNET_NETWORK_CONFIG.rpcUrl },
  { label: "Explorer", value: ARC_TESTNET_NETWORK_CONFIG.explorerUrl },
  { label: "Faucet", value: "https://faucet.circle.com" }
];

export const ARC_TESTNET_INFO_ITEMS = [
  {
    label: "Chain ID",
    value: String(ARC_TESTNET_NETWORK_CONFIG.chainId)
  },
  {
    label: "Gas Token",
    value: ARC_TESTNET_NETWORK_CONFIG.currencySymbol
  },
  {
    label: "RPC",
    value: ARC_TESTNET_NETWORK_CONFIG.rpcUrl,
    href: ARC_TESTNET_NETWORK_CONFIG.rpcUrl
  },
  {
    label: "Explorer",
    value: ARC_TESTNET_NETWORK_CONFIG.explorerUrl,
    href: ARC_TESTNET_NETWORK_CONFIG.explorerUrl
  },
  {
    label: "Faucet",
    value: "https://faucet.circle.com",
    href: "https://faucet.circle.com"
  }
];

export const ARC_USDC_ERC20_ADDRESS =
  process.env.NEXT_PUBLIC_ARC_TESTNET_USDC_ADDRESS ||
  "0x3600000000000000000000000000000000000000";

export const APP_KIT_EVM_CHAIN_OPTIONS = [
  {
    id: arcTestnet.id,
    name: arcTestnet.name,
    shortName: "Arc",
    appKitChain: "Arc_Testnet",
    gasToken: arcTestnet.nativeCurrency.symbol,
    explorerUrl: arcTestnet.blockExplorers.default.url,
    helper: "Use Arc Testnet for USDC send, receive, and activity."
  },
  {
    id: sepolia.id,
    name: "Ethereum Sepolia",
    shortName: "ETH Sepolia",
    appKitChain: "Ethereum_Sepolia",
    gasToken: "ETH",
    explorerUrl: sepolia.blockExplorers.default.url,
    helper:
      "Bridge testnet USDC from Ethereum Sepolia into Arc Testnet."
  },
  {
    id: baseSepolia.id,
    name: "Base Sepolia",
    shortName: "Base Sepolia",
    appKitChain: "Base_Sepolia",
    gasToken: "ETH",
    explorerUrl: baseSepolia.blockExplorers.default.url,
    helper: "Bridge testnet USDC from Base Sepolia into Arc Testnet."
  }
];

export const MULTICHAIN_WALLET_CHAINS = [arcTestnet, sepolia, baseSepolia];

export const ARC_BRIDGE_SOURCE_OPTIONS = APP_KIT_EVM_CHAIN_OPTIONS.filter(
  (option) => option.id !== arcTestnet.id
);

export const UNIFIED_BALANCE_SOURCE_OPTIONS = APP_KIT_EVM_CHAIN_OPTIONS;

export const ARC_BRIDGE_DESTINATION = {
  id: arcTestnet.id,
  name: arcTestnet.name,
  appKitChain: "Arc_Testnet",
  gasToken: arcTestnet.nativeCurrency.symbol,
  explorerUrl: arcTestnet.blockExplorers.default.url
};

export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID";

export const hasWalletConnectProjectId =
  walletConnectProjectId !== "YOUR_PROJECT_ID";
