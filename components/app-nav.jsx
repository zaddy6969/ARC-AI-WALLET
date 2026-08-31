import Image from "next/image";
import Link from "next/link";
import { ARC_MAINNET_REQUESTED } from "../lib/arc-chain";
import NetworkSwitcher from "./network-switcher";

function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function AppNav({ walletSnapshot }) {
  const isConnected = Boolean(walletSnapshot?.isSignedIn && walletSnapshot?.address);

  return (
    <header className="app-nav-shell">
      <div className="app-nav-bar simple-wallet-nav">
        <Link href="/" className="app-nav-brand" aria-label="Arc AI Wallet dashboard">
          <div className="app-nav-logo" aria-hidden="true">
            <Image
              src="/arc-ai-wallet-mark-v2.png"
              alt=""
              width={44}
              height={44}
              sizes="44px"
              priority
            />
          </div>
          <div className="app-nav-copy">
            <strong>Arc AI Wallet</strong>
          </div>
        </Link>

        <div className="app-nav-actions simple-wallet-nav-actions">
          {!ARC_MAINNET_REQUESTED ? (
            <span className="status-badge" title="Arc Mainnet support is prepared for public launch">
              MAINNET READY · SEP 16
            </span>
          ) : null}
          <NetworkSwitcher compact />
          {isConnected ? (
            <span className="simple-wallet-address" title={walletSnapshot.address}>
              {shortAddress(walletSnapshot.address)}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
