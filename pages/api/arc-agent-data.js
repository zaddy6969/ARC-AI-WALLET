const ARC_NODE_RELEASES_URL = "https://api.github.com/repos/circlefin/arc-node/releases/latest";
const FALLBACK_RELEASE = {
  tag: "v0.8.0",
  name: "Arc Node v0.8.0",
  publishedAt: "2026-08-28T00:00:00Z",
  url: "https://github.com/circlefin/arc-node/releases/tag/v0.8.0",
  body: "Arc Node v0.8.0 includes Zero8 activation readiness, reth 2.2 / revm 38 upgrades, transaction relay failover improvements, safer RPC defaults, database migration tooling, and additional consensus/forensics metrics. Arc Testnet operators were instructed to upgrade before the Zero8 testnet activation window."
};

let cachedRelease = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function normalizeRelease(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    tag: payload.tag_name || payload.name || "latest",
    name: payload.name || payload.tag_name || "Arc Node release",
    publishedAt: payload.published_at || payload.created_at || null,
    url: payload.html_url || "https://github.com/circlefin/arc-node/releases",
    body: String(payload.body || "").slice(0, 6000)
  };
}

async function getLatestArcNodeRelease() {
  const now = Date.now();
  if (cachedRelease && now - cachedAt < CACHE_MS) return cachedRelease;

  try {
    const response = await fetch(ARC_NODE_RELEASES_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "arc-ai-wallet-agent"
      }
    });

    if (!response.ok) throw new Error(`GitHub release lookup failed with ${response.status}`);
    const release = normalizeRelease(await response.json());
    if (!release) throw new Error("Invalid GitHub release response");

    cachedRelease = { ...release, source: "github-live" };
    cachedAt = now;
    return cachedRelease;
  } catch (error) {
    console.error("[arc-agent-data] release fallback", error instanceof Error ? error.message : error);
    return { ...FALLBACK_RELEASE, source: "known-release-fallback" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const tool = String(req.query?.tool || "").toLowerCase();
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");

  if (tool === "node-release") {
    const release = await getLatestArcNodeRelease();
    return res.status(200).json({ ok: true, release });
  }

  return res.status(400).json({ error: "Unknown Arc Agent data tool." });
}
