import deployment from "./generated/lumexa-assistant-deployment.json";
import { ARC_MAINNET_REQUESTED, arcActiveChain } from "./arc-chain";

export const LUMEXA_WALLET_ASSISTANT_LIMITS = {
  prompt: 280,
  response: 560
};

export const LUMEXA_WALLET_ASSISTANT_ABI = [
  "function assistantName() view returns (string)",
  "function interactionCount() view returns (uint256)",
  "function logInteraction(string prompt, string response) returns (uint256)",
  "function getLatestInteractionForUser(address user) view returns (bool found, uint256 interactionId, address interactionUser, string prompt, string response, uint64 createdAt)",
  "function getInteraction(uint256 interactionId) view returns (address user, string prompt, string response, uint64 createdAt)",
  "function getUserInteractionIds(address user) view returns (uint256[])"
];

export const LUMEXA_WALLET_ASSISTANT_CONTRACT_ADDRESS = ARC_MAINNET_REQUESTED
  ? process.env.NEXT_PUBLIC_LUMEXA_MAINNET_ASSISTANT_CONTRACT_ADDRESS || ""
  : process.env.NEXT_PUBLIC_LUMEXA_ASSISTANT_CONTRACT_ADDRESS || deployment.address || "";

export function isAssistantContractConfigured() {
  return /^0x[a-fA-F0-9]{40}$/.test(
    LUMEXA_WALLET_ASSISTANT_CONTRACT_ADDRESS
  );
}

export function trimAssistantText(value, maxLength) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function formatAssistantTimestamp(timestamp) {
  if (!timestamp) {
    return "Not recorded yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(Number(timestamp) * 1000));
}

export function buildAssistantExplorerUrl(value, type = "address") {
  if (!value || !arcActiveChain.blockExplorers?.default?.url) {
    return "";
  }

  const path = type === "tx" ? "tx" : "address";
  return `${arcActiveChain.blockExplorers.default.url}/${path}/${value}`;
}
