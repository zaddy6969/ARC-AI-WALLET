// RainbowKit reads `mainnet.id` for optional ENS helpers. Keeping this small
// avoids pulling Viem's complete chain catalogue into the wallet entry bundle.
export const mainnet = {
  id: 1,
  name: "Ethereum",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["https://ethereum-rpc.publicnode.com"]
    }
  },
  blockExplorers: {
    default: {
      name: "Etherscan",
      url: "https://etherscan.io"
    }
  }
};
