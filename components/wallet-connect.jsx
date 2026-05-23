import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useRef, useState } from "react";
import { ARC_TESTNET_INFO_ITEMS, arcTestnet } from "../lib/arc-chain";
import NetworkSwitcher from "./network-switcher";

function truncateAddress(address) {
  if (!address) {
    return "";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatUsdBalance(balance) {
  const numeric = Number(String(balance || "").replace(/[^\d.-]/g, ""));

  if (!Number.isFinite(numeric)) {
    return "$0.00";
  }

  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(numeric)}`;
}

export function WalletConnectCta({ className = "hero-actions" }) {
  const [fallbackReady, setFallbackReady] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setFallbackReady(true), 3000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <ConnectButton.Custom>
      {({
        account,
        authenticationStatus,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal
      }) => {
        const ready =
          (mounted || fallbackReady) && authenticationStatus !== "loading";
        const connected =
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === "authenticated");
        const onArc = chain?.id === arcTestnet.id;

        const handleClick = () => {
          if (!connected) {
            if (typeof openConnectModal === "function") {
              openConnectModal();
            }
            return;
          }

          if (!onArc) {
            if (typeof openChainModal === "function") {
              openChainModal();
            }
            return;
          }

          if (typeof openAccountModal === "function") {
            openAccountModal();
          }
        };

        return (
          <div className={className}>
            <button
              type="button"
              className="button button-primary"
              aria-busy={!ready}
              onClick={handleClick}
            >
              {!connected
                ? "Connect Wallet"
                : !onArc
                  ? "Switch to Arc Testnet"
                  : "Open Wallet"}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

export default function WalletConnect({ walletSnapshot, onReceiveClick }) {
  const [copied, setCopied] = useState(false);
  const [fallbackReady, setFallbackReady] = useState(false);
  const copyTimeoutRef = useRef(null);
  const {
    address,
    isSignedIn,
    onArc,
    usdcBalance,
    balanceStatus,
    balanceError,
    balanceSource,
    disconnectWallet
  } = walletSnapshot || {};

  const handleCopy = async () => {
    if (!address) {
      return;
    }

    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setFallbackReady(true), 3000);

    return () => {
      window.clearTimeout(timeoutId);

      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  return (
    <ConnectButton.Custom>
      {({
        account,
        authenticationStatus,
        chain,
        mounted,
        openChainModal,
        openConnectModal
      }) => {
        const ready =
          (mounted || fallbackReady) && authenticationStatus !== "loading";
        const connected =
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === "authenticated");
        const arcReady = chain?.id === arcTestnet.id;

        return (
          <section className="card wallet-card" id="section-wallet">
            <div className="section-heading">
              <div>
                <p className="section-kicker">Connect Wallet</p>
                <h2>Wallet login and network status</h2>
              </div>
              <span
                className={
                  connected && arcReady ? "status-badge status-good" : "status-badge"
                }
              >
                {!connected
                  ? "Not connected"
                  : arcReady
                    ? "Signed in with wallet"
                    : "Wrong network"}
              </span>
            </div>

            {!connected ? (
              <div className="empty-state">
                <strong>Connect wallet to continue.</strong>
                <p>
                  Use your wallet to sign in and unlock Arc USDC balance,
                  App Kit actions, recent activity, and AI wallet assistance.
                </p>
                <button
                  type="button"
                  className="button button-primary"
                  aria-busy={!ready}
                  onClick={() => {
                    if (typeof openConnectModal === "function") {
                      openConnectModal();
                    }
                  }}
                >
                  Connect Wallet
                </button>
              </div>
            ) : (
              <>
                <div className="wallet-summary-grid">
                  <div className="wallet-summary-item">
                    <span className="field-label">Wallet address</span>
                    <strong>{address || account.address}</strong>
                  </div>
                  <div className="wallet-summary-item">
                    <span className="field-label">Network</span>
                    <strong>{arcReady ? "Arc Testnet" : chain?.name || "Unknown"}</strong>
                  </div>
                  <div className="wallet-summary-item">
                    <span className="field-label">Network status</span>
                    <strong>{arcReady ? "Arc ready" : "Switch to Arc Testnet"}</strong>
                  </div>
                  <div className="wallet-summary-item">
                    <NetworkSwitcher />
                  </div>
                  <div className="wallet-summary-item">
                    <span className="field-label">Arc wallet balance</span>
                    <strong>
                      {balanceStatus === "loading" || balanceStatus === "refreshing"
                        ? "Loading..."
                        : balanceStatus === "ready"
                          ? formatUsdBalance(usdcBalance)
                          : "Syncing..."}
                    </strong>
                    <small>
                      {balanceStatus === "ready"
                        ? balanceSource === "erc20"
                          ? "Using Arc USDC token interface"
                          : "Using Arc native balance"
                        : balanceError || "Reading your latest Arc balance"}
                    </small>
                  </div>
                </div>

                <div className="wallet-actions">
                  {isSignedIn && onReceiveClick ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={onReceiveClick}
                    >
                      Receive
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={handleCopy}
                  >
                    {copied ? "Copied" : `Copy ${truncateAddress(address || account.address)}`}
                  </button>
                  {!onArc ? (
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => {
                        if (typeof openChainModal === "function") {
                          openChainModal();
                        }
                      }}
                    >
                      Switch to Arc Testnet
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => disconnectWallet?.()}
                  >
                    Disconnect
                  </button>
                </div>

                {isSignedIn ? (
                  <p className="helper-copy">
                    Signed in with wallet. You can now use Send, Bridge, Receive,
                    AI Assistant, and Activity with live Arc wallet context.
                  </p>
                ) : null}
              </>
            )}

            <div className="network-facts-grid">
              {ARC_TESTNET_INFO_ITEMS.map((item) => (
                <div key={item.label} className="network-fact">
                  <span className="field-label">{item.label}</span>
                  {item.href ? (
                    <a href={item.href} target="_blank" rel="noreferrer">
                      {item.value}
                    </a>
                  ) : (
                    <strong>{item.value}</strong>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      }}
    </ConnectButton.Custom>
  );
}
