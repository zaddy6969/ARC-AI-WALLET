require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_MAINNET_CHAIN_ID = 5042;
const ARC_TESTNET_RPC_URL =
  process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const ARC_TESTNET_PRIVATE_KEY = process.env.ARC_TESTNET_PRIVATE_KEY || "";
const ARC_MAINNET_RPC_URL = process.env.ARC_MAINNET_RPC_URL || "";
const ARC_MAINNET_PRIVATE_KEY = process.env.ARC_MAINNET_PRIVATE_KEY || "";

const networks = {
  arcTestnet: {
    url: ARC_TESTNET_RPC_URL,
    chainId: ARC_TESTNET_CHAIN_ID,
    accounts: ARC_TESTNET_PRIVATE_KEY ? [ARC_TESTNET_PRIVATE_KEY] : [],
    timeout: 120000
  }
};

// Mainnet stays opt-in until official production endpoints are configured.
if (ARC_MAINNET_RPC_URL) {
  networks.arcMainnet = {
    url: ARC_MAINNET_RPC_URL,
    chainId: ARC_MAINNET_CHAIN_ID,
    accounts: ARC_MAINNET_PRIVATE_KEY ? [ARC_MAINNET_PRIVATE_KEY] : [],
    timeout: 120000
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
