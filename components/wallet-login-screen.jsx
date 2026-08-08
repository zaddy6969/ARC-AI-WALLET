import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import { useEffect, useState } from "react";
import { hasWalletConnectProjectId } from "../lib/arc-chain";

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
    <main className="login-page-shell login-minimal">
      <section className="login-minimal-card">
        <div className="login-minimal-logo">
          <Image
            src="/arc-ai-wallet-mark-v2.png"
            alt="Arc AI Wallet"
            width={74}
            height={74}
            priority
            sizes="74px"
          />
        </div>

        <h1>Arc AI Wallet</h1>
        <p>Connect your wallet to continue.</p>

        {providerUnavailable ? (
          <button
            type="button"
            className="button button-primary login-connect-button"
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
                  className="button button-primary login-connect-button"
                  onClick={handleConnect}
                  disabled={!canOpenWallet}
                >
                  {canOpenWallet ? "Connect wallet" : "Loading…"}
                </button>
              );
            }}
          </ConnectButton.Custom>
        )}

        {connectError || (providerUnavailable && providerError) ? (
          <p className="login-connect-error" role="alert">{connectError || providerError}</p>
        ) : null}

        <div className="login-minimal-meta">
          <span>Self-custodial</span>
          <span>Arc Testnet</span>
          {hasWalletConnectProjectId ? <span>WalletConnect</span> : null}
        </div>
      </section>
    </main>
  );
}
