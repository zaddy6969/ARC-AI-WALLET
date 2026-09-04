import { getMultichainWalletActivity } from "../../lib/multichain-wallet-activity";
import { isAddress } from "viem";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { address, limit, lookbackBlocks } = req.query || {};
  const walletAddress = typeof address === "string" ? address.trim() : "";

  if (!walletAddress || !isAddress(walletAddress)) {
    return res.status(400).json({ error: "A valid wallet address is required." });
  }

  try {
    const result = await getMultichainWalletActivity(walletAddress, {
      limit: Number(limit) || undefined,
      lookbackBlocks: Number(lookbackBlocks) || undefined
    });

    if (process.env.NODE_ENV !== "production") {
      console.info("[wallet-activity]", "multichain-api-response", {
        address: walletAddress,
        fetchedCount: result.activity.length,
        networks: result.networks.map((network) => ({
          chainId: network.chainId,
          status: network.status,
          count: network.count
        }))
      });
    }

    res.setHeader("Cache-Control", "private, max-age=0, s-maxage=10, stale-while-revalidate=20");
    return res.status(200).json({
      activity: result.activity,
      networks: result.networks,
      scope: "multichain"
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[wallet-activity]", "multichain-api-error", {
        address: walletAddress,
        message: error instanceof Error ? error.message : "Unknown RPC error"
      });
    }

    return res.status(503).json({
      error: "Activity temporarily unavailable. Please try again later."
    });
  }
}
