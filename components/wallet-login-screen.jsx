import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { arcTestnet } from "../lib/arc-chain";

export default function WalletLoginScreen() {
  const [connectError, setConnectError] = useState("");

  return (
    <main className="login-page-shell">
      <span className="login-blob login-blob-left" />
      <span className="login-blob login-blob-right" />
      <section className="login-card-premium">
        <div className="login-brand-mark">
          <img src="/arc-ai-wallet-logo.png" alt="Arc AI Wallet" />
        </div>

        <p className="login-built-label">Built on Arc</p>
        <h1>Arc AI Wallet</h1>
        <p className="login-tagline">
          Send, bridge, and manage USDC on Arc with AI.
        </p>
        <p className="login-description">
          A cleaner way to connect, receive, send USDC, and understand wallet
          activity on Arc Testnet.
        </p>

        <ConnectButton.Custom>
          {({ mounted, openConnectModal }) => {
            const handleConnect = () => {
              setConnectError("");

              if (!mounted || typeof openConnectModal !== "function") {
                setConnectError(
                  "Wallet connection is still initializing. Please try again in a moment."
                );
                return;
              }

              openConnectModal();
            };

            return (
              <>
                <button
                  type="button"
                  className="button button-primary login-connect-button"
                  onClick={handleConnect}
                >
                  Connect Wallet
                </button>
                {connectError ? (
                  <p className="helper-copy login-connect-error" role="alert">
                    {connectError}
                  </p>
                ) : null}
              </>
            );
          }}
        </ConnectButton.Custom>

        <div className="login-meta-row">
          <span className="status-badge status-good">{arcTestnet.name}</span>
          <span>USDC powered payments on Arc</span>
        </div>
      </section>
    </main>
  );
}
