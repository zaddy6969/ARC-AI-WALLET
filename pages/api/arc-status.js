const ARC_RPC_URL = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";

async function rpc(method, params = []) {
  const response = await fetch(ARC_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
    signal: AbortSignal.timeout(6000)
  });

  if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error.message || `${method} failed`);
  return payload?.result;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const startedAt = Date.now();

  try {
    const [chainIdHex, blockHex] = await Promise.all([
      rpc("eth_chainId"),
      rpc("eth_blockNumber")
    ]);

    const chainId = Number.parseInt(chainIdHex, 16);
    const blockNumber = Number.parseInt(blockHex, 16);

    res.setHeader("Cache-Control", "s-maxage=8, stale-while-revalidate=20");
    return res.status(200).json({
      ok: chainId === 5042002,
      network: "Arc Testnet",
      chainId,
      blockNumber,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      rpc: "official"
    });
  } catch (error) {
    return res.status(503).json({
      ok: false,
      network: "Arc Testnet",
      error: error instanceof Error ? error.message : "Arc RPC unavailable",
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString()
    });
  }
}
