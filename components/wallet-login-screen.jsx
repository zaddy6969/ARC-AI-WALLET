import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import { useEffect, useState } from "react";
import { arcTestnet, hasWalletConnectProjectId } from "../lib/arc-chain";

export default function WalletLoginScreen({
  providerError = "",
  providerUnavailable = false
}) {
  const [connectError, setConnectError] = useState("");
  const [fallbackReady, setFallbackReady] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setFallbackReady(true), 2500);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <main className="login-page-shell wallet-entry-page">
      <header className="wallet-entry-topbar">
        <div className="wallet-entry-brand">
          <span className="wallet-entry-logo">
            <Image
              src="/arc-ai-wallet-mark-v2.png"
              alt=""
              width={42}
              height={42}
              priority
              sizes="42px"
            />
          </span>
          <strong>Arc AI Wallet</strong>
        </div>
        <span className="wallet-entry-network"><i /> {arcTestnet.name}</span>
      </header>

      <section className="wallet-entry-main">
        <div className="wallet-entry-copy">
          <h1>Your Arc wallet.</h1>
          <p>Manage USDC on Arc Testnet from one place.</p>
        </div>

        <aside className="wallet-entry-card">
          <div className="wallet-entry-card-logo" aria-hidden="true">
            <Image
              src="/arc-ai-wallet-mark-v2.png"
              alt=""
              width={76}
              height={76}
              priority
              sizes="76px"
            />
          </div>

          <h2>Connect wallet</h2>
          <p>Connect your wallet to view balances and manage your assets.</p>

          {providerUnavailable ? (
            <button
              type="button"
              className="button button-primary wallet-entry-connect"
              onClick={() => window.location.reload()}
            >
              Reload wallet
            </button>
          ) : (
            <ConnectButton.Custom>
              {({ mounted, openConnectModal }) => {
                const canOpenWallet = typeof openConnectModal === "function" && (mounted || fallbackReady);
                const handleConnect = () => {
                  setConnectError("");
                  if (!canOpenWallet) {
                    setConnectError(providerError || "Wallet connection is unavailable. Refresh and try again.");
                    return;
                  }
                  openConnectModal();
                };

                return (
                  <button
                    type="button"
                    className="button button-primary wallet-entry-connect"
                    onClick={handleConnect}
                    disabled={!canOpenWallet}
                  >
                    {canOpenWallet ? "Connect wallet" : "Preparing…"}
                  </button>
                );
              }}
            </ConnectButton.Custom>
          )}

          {connectError || (providerUnavailable && providerError) ? (
            <p className="wallet-entry-error" role="alert">{connectError || providerError}</p>
          ) : null}

          <div className="wallet-entry-meta">
            <span>Self-custodial</span>
            <span>USDC gas</span>
            <span>Testnet</span>
          </div>

          <small className="wallet-entry-note">
            Never share your seed phrase or private key.
          </small>

          <small className="wallet-entry-wallets">
            Browser wallets · Safe{hasWalletConnectProjectId ? " · WalletConnect" : ""}
          </small>
        </aside>
      </section>
    </main>
  );
}
