export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  // Never expose or synthesize a client-side Circle key. This endpoint is
  // diagnostics-only and reports whether a server-only production key exists.
  const kitKey = process.env.CIRCLE_KIT_KEY || process.env.KIT_KEY || "";

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({
    configured: Boolean(kitKey),
    scope: "server-only"
  });
}
