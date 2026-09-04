import {
  ARC_MAINNET_REQUESTED,
  ARC_USDC_ERC20_ADDRESS,
  MULTICHAIN_WALLET_CHAINS,
  arcTestnet
} from "./arc-chain";

// Circle-issued USDC addresses for the networks Lumexa currently supports.
// Keep this map explicit so balance/activity code never guesses a token contract.
const TESTNET_USDC_BY_CHAIN_ID = {
  [arcTestnet.id]: ARC_USDC_ERC20_ADDRESS,
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
};

const MAINNET_USDC_BY_CHAIN_ID = {
  [arcTestnet.id]: ARC_USDC_ERC20_ADDRESS,
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
};

export const USDC_ADDRESS_BY_CHAIN_ID = ARC_MAINNET_REQUESTED
  ? MAINNET_USDC_BY_CHAIN_ID
  : TESTNET_USDC_BY_CHAIN_ID;

export const WALLET_ACTIVITY_NETWORKS = MULTICHAIN_WALLET_CHAINS
  .map((chain) => ({
    id: chain.id,
    name: chain.name,
    shortName:
      chain.id === arcTestnet.id
        ? "Arc"
        : [1, 11155111].includes(chain.id)
          ? "Ethereum"
          : [8453, 84532].includes(chain.id)
            ? "Base"
            : chain.name,
    rpcUrl: chain.rpcUrls?.default?.http?.[0] || "",
    explorerUrl: chain.blockExplorers?.default?.url || "",
    usdcAddress: USDC_ADDRESS_BY_CHAIN_ID[chain.id] || "",
    testnet: Boolean(chain.testnet)
  }))
  .filter((network) => network.rpcUrl && network.usdcAddress);

export function getWalletActivityNetwork(chainId) {
  return WALLET_ACTIVITY_NETWORKS.find((network) => network.id === Number(chainId)) || null;
}
