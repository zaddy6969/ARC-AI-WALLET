import { handleWalletChat } from "../../lib/chat-api";

function shortAddress(value) {
  if (typeof value !== "string" || value.length < 12) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function sanitizeWalletContext(context) {
  if (!context || typeof context !== "object") return {};
  const wallet = context.wallet || {};
  const portfolio = context.portfolio || {};
  const activity = context.activity || {};

  return {
    wallet: {
      connected: Boolean(wallet.connected),
      addressShort: shortAddress(wallet.address),
      chainId: wallet.chainId || null,
      network: wallet.network || "",
      onArc: Boolean(wallet.onArc),
      usdcBalance: wallet.usdcBalance || "",
      nativeBalance: wallet.nativeBalance || "",
      balanceStatus: wallet.balanceStatus || "idle"
    },
    portfolio: {
      totalValueUsd: Number(portfolio.totalValueUsd) || 0,
      assets: (Array.isArray(portfolio.assets) ? portfolio.assets : []).slice(0, 12).map((asset) => ({
        symbol: asset?.symbol || "",
        balance: asset?.balance || "",
        valueUsd: Number(asset?.valueUsd) || 0,
        allocation: Number(asset?.allocation) || 0
      }))
    },
    activity: {
      status: activity.status || "idle",
      items: (Array.isArray(activity.items) ? activity.items : []).slice(0, 8).map((item) => ({
        type: item?.type || "",
        kind: item?.kind || "",
        amount: item?.amount || "",
        chain: item?.chain || "",
        chainId: item?.chainId || null,
        status: item?.status || "",
        timeLabel: item?.timeLabel || "",
        txHashShort: item?.txHashShort || ""
      }))
    }
  };
}

export default async function handler(req, res) {
  const runtimeOidc = req.headers?.["x-vercel-oidc-token"];

  if (runtimeOidc && !process.env.VERCEL_OIDC_TOKEN) {
    process.env.VERCEL_OIDC_TOKEN = String(runtimeOidc);
  }

  if (req.method === "POST" && req.body && typeof req.body === "object") {
    req.body = {
      ...req.body,
      context: sanitizeWalletContext(req.body.context)
    };
  }

  return handleWalletChat(req, res);
}
