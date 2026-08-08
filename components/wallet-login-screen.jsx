import { ConnectButton } from "@rainbow-me/rainbowkit";
import Image from "next/image";
import { useEffect, useState } from "react";
import { arcTestnet, hasWalletConnectProjectId } from "../lib/arc-chain";

const LOGIN_FEATURES = [
  {
    icon: "S",
    title: "Send",
    body: "Send USDC with clear transaction review."
  },
  {
    icon: "B",
    title: "Bridge",
    body: "Move test USDC from Ethereum or Base into Arc."
  },
  {
    icon: "AI",
    title: "Arc AI",
    body: "Understand balances, activity and wallet actions."
  }
];

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
    <main className="login-page-shell login-experience">
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
            <small>Smart USDC wallet for Arc</small>
          </span>
        </div>
        <span className="login-network-pill">
          <i /> {arcTestnet.name}
        </span>
      </header>

      <section className="login-layout">
        <div className="login-hero-copy">
          <p className="login-eyebrow">Self-custodial · USDC-first · AI-assisted</p>
          <h1>A smarter way to use Arc.</h1>
          <p className="login-hero-description">
            Send, receive, swap and bridge from one wallet with clear controls and AI assistance when you need it.
          </p>

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
            <Image
              src="/arc-ai-wallet-mark-v2.png"
              alt="Arc AI Wallet"
              width={92}
              height={92}
              priority
              sizes="92px"
            />
          </div>
          <h2>Connect wallet</h2>
          <p className="login-connect-copy">
            Your wallet keeps control of your keys and every transaction approval.
          </p>

          {providerUnavailable ? (
            <button
              type="button"
              className="button button-primary login-connect-button"
              onClick={() => window.location.reload()}
            >
              Reload wallet app
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
                    {canOpenWallet ? "Connect wallet" : "Preparing wallet…"}
                  </button>
                );
              }}
            </ConnectButton.Custom>
          )}

          {connectError || (providerUnavailable && providerError) ? (
            <p className="login-connect-error" role="alert">{connectError || providerError}</p>
          ) : null}

          <div className="login-wallet-options">
            <span>Works with</span>
            <strong>Browser wallets · Safe{hasWalletConnectProjectId ? " · WalletConnect" : ""}</strong>
          </div>
          <p className="login-security-note"><span>✓</span> No custody. No seed phrase sharing.</p>
        </aside>
      </section>
    </main>
  );
}
