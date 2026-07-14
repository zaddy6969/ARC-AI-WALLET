const CIRCLE_API_BASE_URL = "https://api.circle.com";
const ALLOWED_PATH_PREFIX = "/v1/stablecoinKits/";

function getKitKey() {
  return (
    process.env.VITE_KIT_KEY ||
    process.env.KIT_KEY ||
    process.env.NEXT_PUBLIC_CIRCLE_KIT_KEY ||
    ""
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const kitKey = getKitKey();

  if (!kitKey) {
    return res.status(500).json({
      error: "Circle App Kit key is not configured."
    });
  }

  const { path, method = "GET", body } = req.body || {};

  if (!path || typeof path !== "string" || !path.startsWith(ALLOWED_PATH_PREFIX)) {
    return res.status(400).json({
      error: "Invalid Circle stablecoin service path."
    });
  }

  const targetUrl = `${CIRCLE_API_BASE_URL}${path}`;
  const requestMethod = String(method || "GET").toUpperCase();

  if (!["GET", "POST"].includes(requestMethod)) {
    return res.status(400).json({
      error: "Unsupported Circle stablecoin service method."
    });
  }

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: requestMethod,
      signal: AbortSignal.timeout(12_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${kitKey}`
      },
      body: requestMethod === "GET" ? undefined : body || undefined
    });
    const responseText = await upstreamResponse.text();
    const contentType =
      upstreamResponse.headers.get("content-type") || "application/json";

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", contentType);
    return res.status(upstreamResponse.status).send(responseText);
  } catch {
    return res.status(502).json({
      error: "Circle stablecoin service is temporarily unavailable."
    });
  }
}
