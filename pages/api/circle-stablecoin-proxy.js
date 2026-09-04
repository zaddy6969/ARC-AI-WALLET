export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Allow", "POST");

  // Retained temporarily so older cached clients get an explicit safe failure
  // instead of an opaque 404. Current Lumexa uses Circle App Kit directly and
  // does not proxy arbitrary Stablecoin Kit paths from the browser.
  return res.status(410).json({
    error: "Legacy Circle proxy removed. Refresh Lumexa and use the current App Kit flow."
  });
}
