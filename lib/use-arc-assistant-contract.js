import {
  BrowserProvider,
  Contract,
  JsonRpcProvider
} from "ethers";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  LUMEXA_WALLET_ASSISTANT_ABI,
  LUMEXA_WALLET_ASSISTANT_CONTRACT_ADDRESS,
  LUMEXA_WALLET_ASSISTANT_LIMITS,
  buildAssistantExplorerUrl,
  formatAssistantTimestamp,
  isAssistantContractConfigured,
  trimAssistantText
} from "./arc-assistant-contract";
import { arcTestnet } from "./arc-chain";

const arcReadProvider = new JsonRpcProvider(arcTestnet.rpcUrls.default.http[0]);

function normalizeInteraction(result) {
  if (!result || !result[0]) {
    return null;
  }

  return {
    interactionId: Number(result[1]),
    user: result[2],
    prompt: result[3],
    response: result[4],
    createdAt: Number(result[5]),
    createdAtLabel: formatAssistantTimestamp(result[5])
  };
}

export function useLumexaAssistantContract() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [assistantName, setAssistantName] = useState("");
  const [interactionCount, setInteractionCount] = useState(0);
  const [latestInteraction, setLatestInteraction] = useState(null);
  const [contractStatus, setContractStatus] = useState(
    isAssistantContractConfigured() ? "loading" : "unconfigured"
  );
  const [contractError, setContractError] = useState("");
  const [saveStatus, setSaveStatus] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [lastTransactionHash, setLastTransactionHash] = useState("");

  const contractConfigured = useMemo(
    () => isAssistantContractConfigured(),
    []
  );

  const contractAddress = LUMEXA_WALLET_ASSISTANT_CONTRACT_ADDRESS;

  const refreshContract = useCallback(async () => {
    if (!contractConfigured) {
      setContractStatus("unconfigured");
      setContractError("");
      setAssistantName("");
      setInteractionCount(0);
      setLatestInteraction(null);
      return;
    }

    try {
      setContractStatus("loading");
      setContractError("");

      const contract = new Contract(
        contractAddress,
        LUMEXA_WALLET_ASSISTANT_ABI,
        arcReadProvider
      );

      const [name, totalInteractions, latest] = await Promise.all([
        contract.assistantName(),
        contract.interactionCount(),
        address
          ? contract.getLatestInteractionForUser(address)
          : Promise.resolve(null)
      ]);

      setAssistantName(name);
      setInteractionCount(Number(totalInteractions));
      setLatestInteraction(normalizeInteraction(latest));
      setContractStatus("ready");
    } catch (error) {
      setContractStatus("error");
      setContractError(
        error?.message || "Unable to load the Lumexa assistant contract."
      );
    }
  }, [address, contractAddress, contractConfigured]);

  useEffect(() => {
    refreshContract();
  }, [refreshContract]);

  const saveInteraction = useCallback(
    async ({ prompt, response }) => {
      if (!contractConfigured) {
        throw new Error(
          "Deploy the Lumexa assistant contract first so the frontend has an address to use."
        );
      }

      if (!isConnected || !address) {
        throw new Error("Connect your wallet before saving onchain.");
      }

      if (chainId !== arcTestnet.id) {
        throw new Error("Switch your wallet to Arc Testnet before saving.");
      }

      const trimmedPrompt = trimAssistantText(
        prompt,
        LUMEXA_WALLET_ASSISTANT_LIMITS.prompt
      );
      const trimmedResponse = trimAssistantText(
        response,
        LUMEXA_WALLET_ASSISTANT_LIMITS.response
      );

      if (!trimmedPrompt || !trimmedResponse) {
        throw new Error(
          "Ask the assistant something first so there is a prompt and answer to store."
        );
      }

      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("A browser wallet is required for contract writes.");
      }

      try {
        setSaveStatus("awaiting-wallet");
        setSaveError("");

        const browserProvider = new BrowserProvider(window.ethereum);
        const signer = await browserProvider.getSigner();
        const connectedNetwork = await browserProvider.getNetwork();

        if (Number(connectedNetwork.chainId) !== arcTestnet.id) {
          throw new Error("Your wallet is connected to the wrong network.");
        }

        const contract = new Contract(
          contractAddress,
          LUMEXA_WALLET_ASSISTANT_ABI,
          signer
        );

        const transaction = await contract.logInteraction(
          trimmedPrompt,
          trimmedResponse
        );

        setSaveStatus("confirming");
        setLastTransactionHash(transaction.hash);

        await transaction.wait();

        setSaveStatus("success");
        await refreshContract();

        return transaction.hash;
      } catch (error) {
        setSaveStatus("error");
        setSaveError(
          error?.message || "Unable to save the Lumexa assistant interaction."
        );
        throw error;
      }
    },
    [address, chainId, contractAddress, contractConfigured, isConnected, refreshContract]
  );

  return {
    assistantName,
    contractAddress,
    contractConfigured,
    contractError,
    contractExplorerUrl: buildAssistantExplorerUrl(contractAddress, "address"),
    contractStatus,
    interactionCount,
    lastTransactionHash,
    latestInteraction,
    latestTransactionUrl: buildAssistantExplorerUrl(lastTransactionHash, "tx"),
    saveError,
    saveInteraction,
    saveStatus
  };
}

// Backward-compatible alias for any Arc-network UI that still imports the old hook name.
export const useArcAssistantContract = useLumexaAssistantContract;
