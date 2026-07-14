import { getWalletActivity } from "../../lib/wallet-activity";
import { isAddress } from "viem";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { address } = req.query || {};
  const walletAddress = typeof address === "string" ? address.trim() : "";

  if (!walletAddress || !isAddress(walletAddress)) {
    return res.status(400).json({ error: "A valid wallet address is required." });
  }

  try {
    const activity = await getWalletActivity(walletAddress);

    if (process.env.NODE_ENV !== "production") {
      console.info("[arc-wallet-activity]", "api-response", {
        address: walletAddress,
        fetchedCount: activity.length
      });
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=15, stale-while-revalidate=45"
    );

    return res.status(200).json({ activity });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[arc-wallet-activity]", "api-error", {
        address: walletAddress,
        message: error instanceof Error ? error.message : "Unknown RPC error"
      });
    }

    return res.status(503).json({
      error: "Activity temporarily unavailable. Please try again later."
    });
  }
}
