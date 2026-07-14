import Link from "next/link";
import Image from "next/image";
import { arcTestnet } from "../lib/arc-chain";

export default function AppNav({ walletSnapshot }) {
  return (
    <header className="app-nav-shell">
      <div className="app-nav-bar">
        <Link href="/" className="app-nav-brand">
          <div className="app-nav-logo">
            <Image
              src="/arc-ai-wallet-mark-v2.png"
              alt=""
              width={56}
              height={56}
              sizes="56px"
              priority
            />
          </div>
          <div className="app-nav-copy">
            <span>Smart USDC wallet</span>
            <strong>Arc AI Wallet</strong>
            <small>Powered by Arc + AI</small>
          </div>
        </Link>

        <div className="app-nav-actions">
          <div className="app-nav-status" aria-label="Arc Testnet status">
            <span />
            <strong>{walletSnapshot?.onArc ? "Arc online" : arcTestnet.name}</strong>
          </div>
        </div>
      </div>
    </header>
  );
}
