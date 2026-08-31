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
        <Link href="/#dashboard" className="app-nav-brand" aria-label="Arc AI Wallet dashboard">
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
              Mainnet ready
            </span>
          ) : null}
          <NetworkSwitcher compact />
          {isConnected ? (
            <div className="premium-wallet-account">
              <span className="premium-wallet-avatar" aria-hidden="true">
                <Image src="/arc-ai-wallet-mark-v2.png" alt="" width={24} height={24} sizes="24px" />
              </span>
              <span className="premium-wallet-address" title={walletSnapshot.address}>{shortAddress(walletSnapshot.address)}</span>
              <button type="button" className="premium-wallet-disconnect" onClick={walletSnapshot.disconnectWallet} title="Disconnect wallet" aria-label="Disconnect wallet">↗</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
