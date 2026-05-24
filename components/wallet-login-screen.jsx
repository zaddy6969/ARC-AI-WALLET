import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";

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

        <h1 className="sr-only">Arc AI Wallet</h1>
        <p className="login-tagline">
          AI-powered wallet built on Arc
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

      </section>
    </main>
  );
}
