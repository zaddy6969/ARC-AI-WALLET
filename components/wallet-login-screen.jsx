import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";
import { arcTestnet } from "../lib/arc-chain";

export default function WalletLoginScreen({
  providerError = "",
  providerUnavailable = false
}) {
  const [connectError, setConnectError] = useState("");
  const [fallbackReady, setFallbackReady] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setFallbackReady(true), 3000);

    return () => window.clearTimeout(timeoutId);
  }, []);

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

        {providerUnavailable ? (
          <>
            <button
              type="button"
              className="button button-primary login-connect-button"
              onClick={() =>
                setConnectError(
                  providerError ||
                    "Wallet connection is temporarily unavailable. Refresh or check your browser wallet."
                )
              }
            >
              Connect Wallet
            </button>
            {connectError || providerError ? (
              <p className="helper-copy login-connect-error" role="alert">
                {connectError || providerError}
              </p>
            ) : null}
          </>
        ) : (
          <ConnectButton.Custom>
            {({ mounted, openConnectModal }) => {
              const canOpenWallet =
                typeof openConnectModal === "function" &&
                (mounted || fallbackReady);
              const handleConnect = () => {
                setConnectError("");

                if (typeof openConnectModal !== "function") {
                  setConnectError(
                    providerError ||
                      "Wallet connection is temporarily unavailable. Refresh or check your browser wallet."
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
                    aria-busy={!canOpenWallet}
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
        )}

        <div className="login-meta-row">
          <span className="status-badge status-good">{arcTestnet.name}</span>
          <span>USDC powered payments on Arc</span>
        </div>
      </section>
    </main>
  );
}
