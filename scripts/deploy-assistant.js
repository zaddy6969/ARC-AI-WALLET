const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");

const DEPLOYMENT_PATH = path.join(
  __dirname,
  "..",
  "lib",
  "generated",
  "lumexa-assistant-deployment.json"
);

const EXPECTED_CHAIN_ID = 5042002n;
const DEFAULT_RPC_URL = "https://rpc.testnet.arc.network";
const DEFAULT_EXPLORER_URL = "https://testnet.arcscan.app";

function parseConfirmations(value) {
  const parsed = Number.parseInt(String(value || "1"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

async function main() {
  const assistantName = process.env.LUMEXA_ASSISTANT_NAME || "Lumexa AI Agent";
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL || DEFAULT_RPC_URL;
  const explorerUrl = process.env.ARC_TESTNET_EXPLORER_URL || DEFAULT_EXPLORER_URL;
  const confirmations = parseConfirmations(process.env.ARC_DEPLOYMENT_CONFIRMATIONS);

  if (!process.env.ARC_TESTNET_PRIVATE_KEY) {
    throw new Error(
      "Set ARC_TESTNET_PRIVATE_KEY before deploying LumexaWalletAssistant to Arc Testnet."
    );
  }

  const provider = hre.ethers.provider;
  const network = await provider.getNetwork();

  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Refusing deployment: expected Arc Testnet chain ID ${EXPECTED_CHAIN_ID}, received ${network.chainId}.`
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No Arc Testnet deployer signer is configured.");
  }

  const assistantFactory = await hre.ethers.getContractFactory(
    "LumexaWalletAssistant",
    deployer
  );
  const assistant = await assistantFactory.deploy(assistantName);
  const deploymentTransaction = assistant.deploymentTransaction();

  if (!deploymentTransaction) {
    throw new Error("Hardhat did not return a deployment transaction.");
  }

  console.log(`Deployment submitted: ${deploymentTransaction.hash}`);

  const receipt = await deploymentTransaction.wait(confirmations);
  if (!receipt) {
    throw new Error("Deployment transaction did not return a receipt.");
  }

  if (Number(receipt.status) !== 1) {
    throw new Error(
      `Deployment transaction failed onchain with status ${receipt.status}.`
    );
  }

  await assistant.waitForDeployment();
  const deployedAddress = await assistant.getAddress();

  if (
    receipt.contractAddress &&
    receipt.contractAddress.toLowerCase() !== deployedAddress.toLowerCase()
  ) {
    throw new Error(
      `Receipt contract address ${receipt.contractAddress} does not match Hardhat address ${deployedAddress}.`
    );
  }

  const runtimeCode = await provider.getCode(deployedAddress);
  if (!runtimeCode || runtimeCode === "0x") {
    throw new Error(
      `No contract bytecode found at ${deployedAddress} after deployment.`
    );
  }

  const [onchainAssistantName, onchainDeployer] = await Promise.all([
    assistant.assistantName(),
    assistant.deployer()
  ]);

  if (onchainAssistantName !== assistantName) {
    throw new Error(
      `Onchain assistant name mismatch. Expected "${assistantName}", received "${onchainAssistantName}".`
    );
  }

  if (onchainDeployer.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `Onchain deployer mismatch. Expected ${deployer.address}, received ${onchainDeployer}.`
    );
  }

  const deploymentBlock = await provider.getBlock(receipt.blockNumber);
  const deployedAt = deploymentBlock?.timestamp
    ? new Date(Number(deploymentBlock.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  const metadata = {
    network: "arcTestnet",
    chainId: Number(network.chainId),
    rpcUrl,
    explorerUrl,
    assistantName,
    address: deployedAddress,
    txHash: deploymentTransaction.hash,
    txExplorerUrl: `${explorerUrl}/tx/${deploymentTransaction.hash}`,
    contractExplorerUrl: `${explorerUrl}/address/${deployedAddress}`,
    deployedAt,
    sourceCommit: process.env.GITHUB_SHA || "",
    verification: {
      status: "verified",
      receiptStatus: Number(receipt.status),
      confirmations,
      blockNumber: Number(receipt.blockNumber),
      blockHash: receipt.blockHash,
      contractAddress: receipt.contractAddress || deployedAddress,
      deployer: deployer.address,
      runtimeCodeHash: hre.ethers.keccak256(runtimeCode)
    }
  };

  fs.mkdirSync(path.dirname(DEPLOYMENT_PATH), { recursive: true });
  fs.writeFileSync(DEPLOYMENT_PATH, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(`LumexaWalletAssistant deployed and verified at ${deployedAddress}`);
  console.log(`Deployment tx: ${deploymentTransaction.hash}`);
  console.log(`Explorer: ${metadata.txExplorerUrl}`);
  console.log(`Saved verified deployment metadata to ${DEPLOYMENT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
