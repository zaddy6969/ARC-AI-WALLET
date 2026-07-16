import Image from "next/image";
import Link from "next/link";
import { arcTestnet } from "../lib/arc-chain";

function shortAddress(address) {
  if (!address) {
    return "Wallet disconnected";
  }

  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function AppNav({ walletSnapshot }) {
  const isConnected = Boolean(walletSnapshot?.isSignedIn && walletSnapshot?.address);
  const isOnArc = Boolean(walletSnapshot?.onArc);
  const balance = walletSnapshot?.usdcBalance;

  return (
    <header className="app-nav-shell">
      <div className="app-nav-bar">
        <Link href="/" className="app-nav-brand" aria-label="Arc AI Wallet dashboard">
          <div className="app-nav-logo" aria-hidden="true">
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
          {isConnected ? (
            <div className="app-nav-status" aria-label="Connected wallet summary">
              <span aria-hidden="true" />
              <div>
                <strong>{isOnArc ? "Arc connected" : "Switch to Arc Testnet"}</strong>
                <small>
                  {shortAddress(walletSnapshot.address)}
                  {balance ? ` · ${balance} USDC` : ""}
                </small>
              </div>
            </div>
          ) : (
            <div className="app-nav-status" aria-label="Wallet connection status">
              <span aria-hidden="true" />
              <div>
                <strong>{arcTestnet.name}</strong>
                <small>Connect a wallet to begin</small>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
