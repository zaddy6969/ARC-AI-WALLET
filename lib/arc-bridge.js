import { ARC_BRIDGE_DESTINATION, ARC_BRIDGE_SOURCE_OPTIONS } from "./arc-chain";

const BRIDGE_SOURCE_BY_ID = new Map(
  ARC_BRIDGE_SOURCE_OPTIONS.map((option) => [option.id, option])
);

export function getBridgeSourceOption(chainId) {
  return BRIDGE_SOURCE_BY_ID.get(chainId) || ARC_BRIDGE_SOURCE_OPTIONS[0];
}

export function getBridgeSourceOptions() {
  return ARC_BRIDGE_SOURCE_OPTIONS;
}

export function getBridgeDestination() {
  return ARC_BRIDGE_DESTINATION;
}

export function formatBridgeError(error) {
  const message =
    error instanceof Error ? error.message : "Unable to complete the bridge request.";

  const normalized = message.toLowerCase();

  if (
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("rejected the request")
  ) {
    return "The bridge request was canceled in your wallet.";
  }

  if (normalized.includes("connector not connected")) {
    return "Connect your wallet before starting a bridge.";
  }

  if (normalized.includes("switchchain")) {
    return "Switch to the selected source chain, then try the bridge again.";
  }

  if (normalized.includes("insufficient")) {
    return "Your wallet does not have enough balance to complete this bridge.";
  }

  if (
    normalized.includes("invalid") ||
    normalized.includes("validation") ||
    normalized.includes("unsupported")
  ) {
    return "The bridge input is not valid for the selected route. Check the source chain, recipient address, and USDC amount, then try again.";
  }

  return message;
}

export function getBridgeErrorDetail(error) {
  if (!error) {
    return "";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function summarizeBridgeFees(estimate) {
  if (!estimate) {
    return [];
  }

  const gasFees = Array.isArray(estimate.gasFees) ? estimate.gasFees : [];
  const protocolFees = Array.isArray(estimate.fees) ? estimate.fees : [];

  return [
    ...gasFees.map((fee) => ({
      label: fee.name || `${fee.blockchain} gas`,
      value: fee.fees?.formatted || fee.fees?.amount || "Estimating",
      tone: fee.error ? "amber" : "blue"
    })),
    ...protocolFees.map((fee) => ({
      label: `${fee.type} fee`,
      value: fee.amount ? `${fee.amount} ${fee.token}` : "Included",
      tone: fee.error ? "amber" : "violet"
    }))
  ];
}

export function normalizeBridgeSteps(result) {
  if (!result || !Array.isArray(result.steps)) {
    return [];
  }

  return result.steps.map((step, index) => ({
    id: `${step.name || "step"}-${index}`,
    name: step.name || `Step ${index + 1}`,
    state: step.state || "pending",
    txHash: step.txHash || "",
    explorerUrl: step.explorerUrl || ""
  }));
}

function enableForwardingService(params) {
  return {
    ...params,
    to: {
      ...params.to,
      useForwarder: params.to?.useForwarder ?? true
    }
  };
}

export async function createArcBridgeClient(provider) {
  const [{ AppKit }, { createViemAdapterFromProvider }, chainModule] =
    await Promise.all([
      import("@circle-fin/app-kit"),
      import("@circle-fin/adapter-viem-v2"),
      import("@circle-fin/app-kit/chains")
    ]);

  const supportedChains = [
    chainModule.ArcTestnet,
    chainModule.EthereumSepolia,
    chainModule.BaseSepolia
  ];

  const chainLookup = {
    Arc_Testnet: chainModule.ArcTestnet,
    Ethereum_Sepolia: chainModule.EthereumSepolia,
    Base_Sepolia: chainModule.BaseSepolia
  };

  const adapter = await createViemAdapterFromProvider({
    provider,
    capabilities: {
      addressContext: "user-controlled",
      supportedChains
    }
  });
  const appKit = new AppKit();

  return {
    adapter,
    chainLookup,
    kit: {
      estimateBridge: (params) => appKit.estimateBridge(enableForwardingService(params)),
      bridge: (params) => appKit.bridge(enableForwardingService(params))
    }
  };
}