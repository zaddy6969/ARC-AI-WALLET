export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const kitKey =
    process.env.VITE_KIT_KEY ||
    process.env.KIT_KEY ||
    process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY ||
    "";

  return res.status(200).json({
    hasKitKey: Boolean(kitKey),
    kitKey: kitKey ? "KIT_KEY:arc-ai-wallet:server-proxy" : ""
  });
}
