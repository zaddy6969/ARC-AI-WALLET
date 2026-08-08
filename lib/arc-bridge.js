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
  const message = error instanceof Error ? error.message : "Unable to complete the bridge.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("rejected the request")
  ) {
    return "Bridge cancelled in your wallet.";
  }

  if (normalized.includes("connector not connected") || normalized.includes("connect your wallet")) {
    return "Connect your wallet before bridging.";
  }

  if (normalized.includes("did not switch") || normalized.includes("switchchain")) {
    return "Your wallet could not switch to the source network. Select the source network in the top bar and try again.";
  }

  if (normalized.includes("insufficient")) {
    return "Not enough USDC or source-chain gas for this bridge.";
  }

  if (normalized.includes("allowance") || normalized.includes("approve")) {
    return "USDC approval could not be completed. Confirm the approval in your wallet and try again.";
  }

  if (
    normalized.includes("invalid") ||
    normalized.includes("validation") ||
    normalized.includes("unsupported")
  ) {
    return "This bridge route is not available for the selected network or amount.";
  }

  return message || "Bridge failed. Please try again.";
}

export function getBridgeErrorDetail(error) {
  if (!error) return "";
  return error instanceof Error ? error.message : String(error);
}

export function summarizeBridgeFees(estimate) {
  if (!estimate) return [];

  const gasFees = Array.isArray(estimate.gasFees) ? estimate.gasFees : [];
  const protocolFees = Array.isArray(estimate.fees) ? estimate.fees : [];

  return [
    ...gasFees.map((fee) => ({
      label: fee.name || `${fee.blockchain || "Network"} fee`,
      value: fee.fees?.formatted || fee.fees?.amount || "Included",
      tone: fee.error ? "amber" : "blue"
    })),
    ...protocolFees.map((fee) => ({
      label: fee.type ? `${fee.type} fee` : "Bridge fee",
      value: fee.amount ? `${fee.amount} ${fee.token || ""}`.trim() : "Included",
      tone: fee.error ? "amber" : "violet"
    }))
  ];
}

export function normalizeBridgeSteps(result) {
  if (!result || !Array.isArray(result.steps)) return [];
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
  if (!provider?.request) {
    throw new Error("Wallet provider is unavailable.");
  }

  const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2")
  ]);

  // Match Circle's browser-wallet reference pattern: build the adapter directly
  // from the active EIP-1193 wallet provider instead of pinning adapter capabilities.
  const adapter = await createViemAdapterFromProvider({ provider });
  const appKit = new AppKit();

  return {
    adapter,
    kit: {
      estimateBridge: (params) => appKit.estimateBridge(enableForwardingService(params)),
      bridge: (params) => appKit.bridge(enableForwardingService(params))
    }
  };
}
