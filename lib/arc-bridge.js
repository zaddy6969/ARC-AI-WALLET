import {
  APP_KIT_EVM_CHAIN_OPTIONS,
  ARC_APP_KIT_READY,
  ARC_BRIDGE_DESTINATION,
  ARC_BRIDGE_SOURCE_OPTIONS,
  ARC_MAINNET_REQUESTED
} from "./arc-chain";

const BRIDGE_SOURCE_BY_ID = new Map(ARC_BRIDGE_SOURCE_OPTIONS.map((option) => [option.id, option]));

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

  if (normalized.includes("user rejected") || normalized.includes("user denied") || normalized.includes("rejected the request")) {
    return "Bridge cancelled in your wallet.";
  }
  if (normalized.includes("connector not connected") || normalized.includes("connect your wallet")) {
    return "Connect your wallet before bridging.";
  }
  if (normalized.includes("did not switch") || normalized.includes("switchchain") || normalized.includes("source network")) {
    return "Your wallet could not switch to the selected source network. Switch the network in the top bar and try again.";
  }
  if (normalized.includes("insufficient")) {
    return "Not enough USDC or source-chain gas for this bridge.";
  }
  if (normalized.includes("allowance") || normalized.includes("approve")) {
    return "USDC approval could not be completed. Confirm the approval in your wallet and try again.";
  }
  if (normalized.includes("invalid") || normalized.includes("validation") || normalized.includes("unsupported") || normalized.includes("route")) {
    return "This bridge route is not currently available for the selected network or amount.";
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

function buildSupportedChains(chainModule) {
  return APP_KIT_EVM_CHAIN_OPTIONS.map((option) => {
    if (!option.appKitModuleKey) return null;
    return chainModule[option.appKitModuleKey] || null;
  }).filter(Boolean);
}

async function validateBridgeRoute(appKit, params) {
  if (typeof appKit?.getSupportedChains !== "function") return;
  try {
    const supported = await appKit.getSupportedChains("bridge");
    if (!Array.isArray(supported) || !supported.length) return;
    const source = params?.from?.chain;
    const destination = params?.to?.chain;
    const values = supported.map((value) => String(value?.id || value?.chain || value));
    if (!values.includes(String(source)) || !values.includes(String(destination))) {
      throw new Error("Selected bridge route is unsupported by Circle App Kit.");
    }
  } catch (error) {
    if (String(error?.message || "").includes("unsupported by Circle")) throw error;
  }
}

export async function createArcBridgeClient(provider) {
  if (!provider?.request) throw new Error("Wallet provider is unavailable.");
  if (ARC_MAINNET_REQUESTED && !ARC_APP_KIT_READY) {
    throw new Error("Arc Mainnet bridge support is locked until official production App Kit chain identifiers are configured.");
  }

  const [{ AppKit }, { createViemAdapterFromProvider }, chainModule] = await Promise.all([
    import("@circle-fin/app-kit"),
    import("@circle-fin/adapter-viem-v2"),
    import("@circle-fin/app-kit/chains")
  ]);

  const supportedChains = buildSupportedChains(chainModule);
  const adapter = await createViemAdapterFromProvider({
    provider,
    ...(supportedChains.length
      ? {
          capabilities: {
            addressContext: "user-controlled",
            supportedChains
          }
        }
      : {})
  });
  const appKit = new AppKit();

  return {
    adapter,
    kit: {
      estimateBridge: async (params) => {
        const next = enableForwardingService(params);
        await validateBridgeRoute(appKit, next);
        return appKit.estimateBridge(next);
      },
      bridge: async (params) => {
        const next = enableForwardingService(params);
        await validateBridgeRoute(appKit, next);
        return appKit.bridge(next);
      }
    }
  };
}
