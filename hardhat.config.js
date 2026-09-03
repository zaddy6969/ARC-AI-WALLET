require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

const ARC_TESTNET_RPC_URL =
  process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const ARC_TESTNET_PRIVATE_KEY = process.env.ARC_TESTNET_PRIVATE_KEY || "";
const ARC_MAINNET_RPC_URL = process.env.ARC_MAINNET_RPC_URL || "";
const ARC_MAINNET_PRIVATE_KEY = process.env.ARC_MAINNET_PRIVATE_KEY || "";

const networks = {
  arcTestnet: {
    url: ARC_TESTNET_RPC_URL,
    chainId: 5042002,
    accounts: ARC_TESTNET_PRIVATE_KEY ? [ARC_TESTNET_PRIVATE_KEY] : []
  }
};

// Lumexa contract deployments use the configured Arc Testnet deployer account.
// Mainnet is intentionally opt-in. There is no guessed/fallback Arc mainnet RPC.
if (ARC_MAINNET_RPC_URL) {
  networks.arcMainnet = {
    url: ARC_MAINNET_RPC_URL,
    chainId: 5042,
    accounts: ARC_MAINNET_PRIVATE_KEY ? [ARC_MAINNET_PRIVATE_KEY] : []
  };
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks
};
