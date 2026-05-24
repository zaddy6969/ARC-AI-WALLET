import Link from "next/link";
import { arcTestnet } from "../lib/arc-chain";

export default function AppNav() {
  return (
    <header className="app-nav-shell">
      <div className="app-nav-bar">
        <Link href="/" className="app-nav-brand">
          <div className="app-nav-logo">
            <img
              src="/arc-ai-wallet-mark.png"
              alt="Arc AI Wallet"
            />
          </div>
          <div className="app-nav-copy">
            <span>AI Native Wallet</span>
            <strong>Arc AI Wallet</strong>
            <small>Built on {arcTestnet.name}</small>
          </div>
        </Link>

        <div className="app-nav-status" aria-label="Arc Testnet status">
          <span />
          <strong>Live on Arc Testnet</strong>
        </div>
      </div>
    </header>
  );
}
