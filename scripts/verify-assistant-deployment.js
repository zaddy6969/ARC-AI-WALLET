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
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const VERIFY_ABI = [
  "function assistantName() view returns (string)",
  "function deployer() view returns (address)"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(fs.existsSync(DEPLOYMENT_PATH), "Deployment metadata file is missing.");

  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
  assert(ADDRESS_PATTERN.test(deployment.address || ""), "Invalid contract address in deployment metadata.");
  assert(HASH_PATTERN.test(deployment.txHash || ""), "Invalid transaction hash in deployment metadata.");

  const provider = hre.ethers.provider;
  const network = await provider.getNetwork();

  assert(
    network.chainId === EXPECTED_CHAIN_ID,
    `Connected to chain ${network.chainId}; expected Arc Testnet ${EXPECTED_CHAIN_ID}.`
  );
  assert(
    Number(deployment.chainId) === Number(EXPECTED_CHAIN_ID),
    `Deployment metadata chain ID ${deployment.chainId} does not match Arc Testnet.`
  );

  const [transaction, receipt, runtimeCode] = await Promise.all([
    provider.getTransaction(deployment.txHash),
    provider.getTransactionReceipt(deployment.txHash),
    provider.getCode(deployment.address)
  ]);

  assert(transaction, `Transaction ${deployment.txHash} was not found on Arc Testnet.`);
  assert(receipt, `Receipt ${deployment.txHash} was not found on Arc Testnet.`);
  assert(Number(receipt.status) === 1, `Deployment receipt status is ${receipt.status}, not success.`);
  assert(transaction.to === null, "Recorded deployment transaction is not a contract-creation transaction.");
  assert(runtimeCode && runtimeCode !== "0x", `No runtime bytecode exists at ${deployment.address}.`);

  if (receipt.contractAddress) {
    assert(
      receipt.contractAddress.toLowerCase() === deployment.address.toLowerCase(),
      `Receipt contract address ${receipt.contractAddress} does not match ${deployment.address}.`
    );
  }

  if (deployment.verification?.blockHash) {
    assert(
      receipt.blockHash === deployment.verification.blockHash,
      "Deployment block hash does not match recorded metadata."
    );
  }

  if (deployment.verification?.runtimeCodeHash) {
    assert(
      hre.ethers.keccak256(runtimeCode) === deployment.verification.runtimeCodeHash,
      "Runtime bytecode hash does not match recorded metadata."
    );
  }

  const assistant = new hre.ethers.Contract(
    deployment.address,
    VERIFY_ABI,
    provider
  );
  const [assistantName, deployer] = await Promise.all([
    assistant.assistantName(),
    assistant.deployer()
  ]);

  assert(
    assistantName === deployment.assistantName,
    `Assistant name mismatch: onchain "${assistantName}" vs metadata "${deployment.assistantName}".`
  );

  if (deployment.verification?.deployer) {
    assert(
      deployer.toLowerCase() === deployment.verification.deployer.toLowerCase(),
      `Deployer mismatch: onchain ${deployer} vs metadata ${deployment.verification.deployer}.`
    );
  }

  console.log("Lumexa ARC deployment verification passed.");
  console.log(`Chain ID: ${network.chainId}`);
  console.log(`Contract: ${deployment.address}`);
  console.log(`Transaction: ${deployment.txHash}`);
  console.log(`Block: ${receipt.blockNumber}`);
  console.log(`Runtime code hash: ${hre.ethers.keccak256(runtimeCode)}`);
  if (deployment.txExplorerUrl) console.log(`Explorer: ${deployment.txExplorerUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
