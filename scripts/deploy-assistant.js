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

async function main() {
  const assistantName = process.env.LUMEXA_ASSISTANT_NAME || "Lumexa AI Agent";
  const rpcUrl =
    process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";

  if (!process.env.ARC_TESTNET_PRIVATE_KEY) {
    throw new Error(
      "Set ARC_TESTNET_PRIVATE_KEY before deploying LumexaWalletAssistant to Arc Testnet."
    );
  }

  const assistantFactory = await hre.ethers.getContractFactory(
    "LumexaWalletAssistant"
  );
  const assistant = await assistantFactory.deploy(assistantName);

  await assistant.waitForDeployment();

  const deploymentTransaction = assistant.deploymentTransaction();
  const deployedAddress = await assistant.getAddress();

  fs.mkdirSync(path.dirname(DEPLOYMENT_PATH), { recursive: true });
  fs.writeFileSync(
    DEPLOYMENT_PATH,
    JSON.stringify(
      {
        network: "arcTestnet",
        chainId: 5042002,
        rpcUrl,
        assistantName,
        address: deployedAddress,
        txHash: deploymentTransaction ? deploymentTransaction.hash : "",
        deployedAt: new Date().toISOString()
      },
      null,
      2
    ) + "\n"
  );

  console.log(`LumexaWalletAssistant deployed to ${deployedAddress}`);
  if (deploymentTransaction) {
    console.log(`Deployment tx: ${deploymentTransaction.hash}`);
  }
  console.log(`Saved frontend config to ${DEPLOYMENT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
