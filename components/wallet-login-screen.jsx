import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import { useEffect, useState } from "react";
import { arcTestnet, hasWalletConnectProjectId } from "../lib/arc-chain";

const LOGIN_FEATURES = [
  {
    icon: "S",
    title: "Send with confidence",
    body: "Preview fees and validate every transfer before you sign."
  },
  {
    icon: "B",
    title: "Bridge in one flow",
    body: "Move testnet USDC from Ethereum or Base into Arc."
  },
  {
    icon: "AI",
    title: "Understand your wallet",
    body: "Get plain-English answers about balances, risk, and activity."
  }
];

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
    <main className="login-page-shell login-experience">
      <span className="login-grid-glow" aria-hidden="true" />
      <span className="login-blob login-blob-left" aria-hidden="true" />
      <span className="login-blob login-blob-right" aria-hidden="true" />

      <header className="login-topbar">
        <div className="login-wordmark">
          <span className="login-wordmark-icon">
            <Image
              src="/arc-ai-wallet-mark-v2.png"
              alt=""
              width={48}
              height={48}
              priority
              sizes="48px"
            />
          </span>
          <span>
            <strong>Arc AI Wallet</strong>
            <small>Intelligence for your onchain life</small>
          </span>
        </div>
        <span className="login-network-pill">
          <i /> {arcTestnet.name}
        </span>
      </header>

      <section className="login-layout">
        <div className="login-hero-copy">
          <p className="login-eyebrow">
            <span>AI-native</span> · USDC-first · Self-custodial
          </p>
          <h1>One wallet.<br />Every move, explained.</h1>
          <p className="login-hero-description">
            A faster way to send, swap, and bridge on Arc—with live portfolio
            context and an AI copilot that turns complex transactions into clear
            decisions.
          </p>

          <div className="login-trust-row" aria-label="Product benefits">
            <span>Non-custodial</span>
            <span>Live Arc data</span>
            <span>Human-readable checks</span>
          </div>

          <div className="login-feature-grid">
            {LOGIN_FEATURES.map((feature) => (
              <article key={feature.title} className="login-feature-card">
                <span className="login-feature-icon">{feature.icon}</span>
                <div>
                  <strong>{feature.title}</strong>
                  <p>{feature.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="login-connect-panel">
          <div className="login-connect-aura" aria-hidden="true">
            <span />
            <Image
              src="/arc-ai-wallet-mark-v2.png"
              alt="Arc AI Wallet"
              width={104}
              height={104}
              priority
              sizes="104px"
            />
          </div>
          <p className="section-kicker">Open your workspace</p>
          <h2>Connect your wallet</h2>
          <p className="login-connect-copy">
            Your keys stay in your wallet. Arc AI Wallet only reads public data
            and requests approval when you choose an action.
          </p>

        {providerUnavailable ? (
          <>
            <button
              type="button"
              className="button button-primary login-connect-button"
              onClick={() => window.location.reload()}
            >
              Reload wallet app
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
                    disabled={!canOpenWallet}
                  >
                    {canOpenWallet ? "Connect wallet" : "Preparing wallet options…"}
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

          <div className="login-wallet-options">
            <span>Works with</span>
            <strong>
              Browser wallets · Safe
              {hasWalletConnectProjectId ? " · WalletConnect" : ""}
            </strong>
          </div>

          <p className="login-security-note">
            <span aria-hidden="true">✓</span>
            No seed phrase. No custody. No hidden approvals.
          </p>
        </aside>
      </section>

      <footer className="login-footer-bar">
        <span>Built for Arc Testnet</span>
        <span>USDC-native gas</span>
        <span>AI guidance, not financial advice</span>
      </footer>
    </main>
  );
}
