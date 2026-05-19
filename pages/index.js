import Head from "next/head";
import { useEffect, useRef, useState } from "react";
import AppShell from "../components/app-shell";
import BridgeToArcPanel from "../components/bridge-to-arc-panel";
import {
  NftComingSoonCard,
  PortfolioPanel
} from "../components/wallet-feature-panels";
import PremiumWalletCard from "../components/premium-wallet-card";
import SendUsdcPanel from "../components/send-usdc-panel";
import SwapUsdcPanel from "../components/swap-usdc-panel";
import TransactionActivity from "../components/transaction-activity";
import WalletAiDrawer from "../components/wallet-ai-drawer";
import WalletIntelligencePanel from "../components/wallet-intelligence-panel";
import WalletLoginScreen from "../components/wallet-login-screen";
import WalletSidebar from "../components/wallet-sidebar";
import ReceiveModal from "../components/wallet/ReceiveModal";
import WalletConnect from "../components/wallet-connect";
import { arcTestnet } from "../lib/arc-chain";
import { useWalletAppState } from "../lib/use-wallet-app-state";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://arc-ai-wallet.vercel.app";
const SUPPORTED_VIEWS = new Set([
  "dashboard",
  "send",
  "receive",
  "swap",
  "bridge",
  "activity",
  "portfolio",
  "nft",
  "settings"
]);

function WelcomeOverlay() {
  return (
    <div className="welcome-overlay" role="status" aria-live="polite">
      <span>Welcome to</span>
      <strong>AI Wallet built on Arc</strong>
    </div>
  );
}

export default function Home() {
  const {
    walletSnapshot,
    mergedActivity,
    liveActivityStatus,
    liveActivityError,
    saveLocalActivity,
    refreshActivity,
    updateLocalActivityByHash
  } = useWalletAppState();
  const [activeView, setActiveView] = useState("dashboard");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [copied, setCopied] = useState(false);
  const wasSignedInRef = useRef(false);

  useEffect(() => {
    const syncViewFromHash = () => {
      const nextHash = String(window.location.hash || "").replace(/^#/, "");

      if (SUPPORTED_VIEWS.has(nextHash)) {
        if (nextHash === "receive") {
          setReceiveOpen(true);
          return;
        }

        setActiveView(nextHash);
      }
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);

    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  useEffect(() => {
    const justConnected =
      walletSnapshot.isSignedIn &&
      walletSnapshot.address &&
      !wasSignedInRef.current;

    wasSignedInRef.current = walletSnapshot.isSignedIn;

    if (justConnected) {
      setShowWelcome(true);
      const timeoutId = window.setTimeout(() => setShowWelcome(false), 4500);
      return () => window.clearTimeout(timeoutId);
    }

    if (!walletSnapshot.isSignedIn) {
      setShowWelcome(false);
    }

    return undefined;
  }, [walletSnapshot.address, walletSnapshot.isSignedIn]);

  const handleSelectView = (view) => {
    setActiveView(view);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/#${view}`);
    }
  };

  const handleCopyAddress = async () => {
    if (!walletSnapshot.address) {
      return;
    }

    try {
      await navigator.clipboard.writeText(walletSnapshot.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  if (!walletSnapshot.isSignedIn) {
    return (
      <>
        <Head>
          <title>Arc AI Wallet | Built on Arc</title>
          <meta
            name="description"
            content="Send, bridge, and manage USDC on Arc with AI."
          />
          <meta name="theme-color" content="#070b14" />
          <link rel="canonical" href={SITE_URL} />
        </Head>
        <WalletLoginScreen />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Arc AI Wallet | Built on Arc</title>
        <meta
          name="description"
          content="Send, receive, and understand USDC wallet activity on Arc with AI."
        />
        <meta name="theme-color" content="#070b14" />
        <link rel="canonical" href={SITE_URL} />
      </Head>

      <AppShell>
        {showWelcome ? <WelcomeOverlay /> : null}

        <section className="wallet-dashboard-hero">
          <div>
            <p className="section-kicker">Arc AI Wallet</p>
            <h1>Welcome to your AI-powered wallet built on Arc.</h1>
            <p>
              A focused USDC wallet for Arc: send, receive, review activity, and
              ask the copilot when a blockchain action needs plain language.
            </p>
          </div>
          <div className="hero-meta">
            <span>{arcTestnet.name}</span>
            <span>USDC gas</span>
          </div>
        </section>

        <PremiumWalletCard
          walletSnapshot={walletSnapshot}
          activityItems={mergedActivity}
          onCopy={handleCopyAddress}
          copied={copied}
        />

        <div className="wallet-workspace">
          <WalletSidebar
            activeView={activeView}
            onSelect={handleSelectView}
            onReceive={() => setReceiveOpen(true)}
            onAiOpen={() => setAssistantOpen(true)}
          />

          <div className="wallet-main-panel">
            {activeView === "dashboard" ? (
              <>
                <WalletConnect
                  walletSnapshot={walletSnapshot}
                  onReceiveClick={() => setReceiveOpen(true)}
                />
                <WalletIntelligencePanel
                  walletSnapshot={walletSnapshot}
                  activityItems={mergedActivity}
                  onSelectView={handleSelectView}
                  onReceive={() => setReceiveOpen(true)}
                  onAiOpen={() => setAssistantOpen(true)}
                />
              </>
            ) : activeView === "activity" ? (
              <TransactionActivity
                walletSnapshot={walletSnapshot}
                items={mergedActivity}
                liveStatus={liveActivityStatus}
                liveError={liveActivityError}
                onRefresh={refreshActivity}
              />
            ) : activeView === "portfolio" ? (
              <PortfolioPanel
                walletSnapshot={walletSnapshot}
                activityItems={mergedActivity}
              />
            ) : activeView === "swap" ? (
              <SwapUsdcPanel
                walletSnapshot={walletSnapshot}
                onActivitySaved={saveLocalActivity}
              />
            ) : activeView === "nft" ? (
              <NftComingSoonCard />
            ) : activeView === "settings" ? (
              <WalletConnect
                walletSnapshot={walletSnapshot}
                onReceiveClick={() => setReceiveOpen(true)}
              />
            ) : activeView === "bridge" ? (
              <BridgeToArcPanel
                walletSnapshot={walletSnapshot}
                onActivitySaved={saveLocalActivity}
                compact
              />
            ) : (
              <SendUsdcPanel
                walletSnapshot={walletSnapshot}
                onActivitySaved={saveLocalActivity}
                onActivityUpdated={updateLocalActivityByHash}
              />
            )}
          </div>
        </div>

        <ReceiveModal
          open={receiveOpen}
          onClose={() => setReceiveOpen(false)}
          address={walletSnapshot.address}
          networkLabel={arcTestnet.name}
        />

        <WalletAiDrawer
          open={assistantOpen}
          onOpen={() => setAssistantOpen(true)}
          onClose={() => setAssistantOpen(false)}
          walletSnapshot={walletSnapshot}
          activityItems={mergedActivity}
          activityStatus={liveActivityStatus}
        />
      </AppShell>
    </>
  );
}
