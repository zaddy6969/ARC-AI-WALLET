const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 7
  },
  webpack(config) {
    config.resolve.alias["wagmi/chains$"] = path.resolve(
      __dirname,
      "lib/rainbowkit-mainnet-chain.js"
    );
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /ox[\\/]_esm[\\/]tempo[\\/]internal[\\/]virtualMasterPool\.js$/,
        message: /Critical dependency/
      }
    ];
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
