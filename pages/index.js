import Head from "next/head";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "../components/app-shell";
import WalletLoginScreen from "../components/wallet-login-screen";
import WalletSidebar from "../components/wallet-sidebar";
import { arcTestnet } from "../lib/arc-chain";
import { useArcWalletSnapshot } from "../lib/use-arc-wallet-snapshot";
import { useWalletAppState } from "../lib/use-wallet-app-state";

function PanelLoading() {
  return (
    <section className="card panel-loading" role="status" aria-live="polite">
      <span className="panel-loading-orb" />
      <div>
        <strong>Loading wallet tools</strong>
        <p>Preparing the latest Arc experience…</p>
      </div>
    </section>
  );
}

const BridgeToArcPanel = dynamic(
  () => import("../components/bridge-to-arc-panel"),
  { loading: PanelLoading }
);
const NftComingSoonCard = dynamic(
  () => import("../components/wallet-feature-panels").then((module) => module.NftComingSoonCard),
  { loading: PanelLoading }
);
const PortfolioPanel = dynamic(
  () => import("../components/wallet-feature-panels").then((module) => module.PortfolioPanel),
  { loading: PanelLoading }
);
const PremiumWalletCard = dynamic(
  () => import("../components/premium-wallet-card"),
  { loading: PanelLoading }
);
const SendUsdcPanel = dynamic(
  () => import("../components/send-usdc-panel"),
  { loading: PanelLoading }
);
const SwapUsdcPanel = dynamic(
  () => import("../components/swap-usdc-panel"),
  { loading: PanelLoading }
);
const TransactionActivity = dynamic(
  () => import("../components/transaction-activity"),
  { loading: PanelLoading }
);
const WalletAiDrawer = dynamic(
  () => import("../components/wallet-ai-drawer"),
  { ssr: false }
);
const WalletIntelligencePanel = dynamic(
  () => import("../components/wallet-intelligence-panel"),
  { loading: PanelLoading }
);
const ReceiveModal = dynamic(
  () => import("../components/wallet/ReceiveModal"),
  { ssr: false }
);
const ProfessionalDashboardSuite = dynamic(
  () => import("../components/community-suite").then((module) => module.ProfessionalDashboardSuite),
  { loading: PanelLoading }
);
const TransactionGuardianBanner = dynamic(
  () => import("../components/community-suite").then((module) => module.TransactionGuardianBanner),
  { loading: PanelLoading }
);
const ActivityInterpreterPanel = dynamic(
  () => import("../components/community-suite").then((module) => module.ActivityInterpreterPanel),
  { loading: PanelLoading }
);
const CommunityHubPanel = dynamic(
  () => import("../components/community-suite").then((module) => module.CommunityHubPanel),
  { loading: PanelLoading }
);
const PaymentRequestPanel = dynamic(
  () => import("../components/community-suite").then((module) => module.PaymentRequestPanel),
  { loading: PanelLoading }
);
const DeveloperModePanel = dynamic(
  () => import("../components/community-suite").then((module) => module.DeveloperModePanel),
  { loading: PanelLoading }
);

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://arc-ai-wallet.vercel.app";
const SUPPORTED_VIEWS = new Set([
  "dashboard",
  "send",
  "receive",
  "swap",
  "bridge",
  "activity",
  "portfolio",
  "community",
  "request",
  "developer",
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

function ConnectedWalletExperience({ walletSnapshot }) {
  const {
    mergedActivity,
    liveActivityStatus,
    liveActivityError,
    saveLocalActivity,
    refreshActivity,
    updateLocalActivityByHash
  } = useWalletAppState(walletSnapshot);
  const [activeView, setActiveView] = useState("dashboard");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [copied, setCopied] = useState(false);
  const wasSignedInRef = useRef(false);
  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

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
    const justConnected = walletSnapshot.isSignedIn && walletSnapshot.address && !wasSignedInRef.current;
    wasSignedInRef.current = walletSnapshot.isSignedIn;

    if (justConnected) {
      setShowWelcome(true);
      const timeoutId = window.setTimeout(() => setShowWelcome(false), 3300);
      return () => window.clearTimeout(timeoutId);
    }

    if (!walletSnapshot.isSignedIn) setShowWelcome(false);
    return undefined;
  }, [walletSnapshot.address, walletSnapshot.isSignedIn]);

  const handleSelectView = useCallback((view) => {
    setActiveView(view);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `/#${view}`);
  }, []);

  const handleCopyAddress = useCallback(async () => {
    if (!walletSnapshot.address) return;
    try {
      await navigator.clipboard.writeText(walletSnapshot.address);
      setCopied(true);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [walletSnapshot.address]);

  const openReceive = useCallback(() => setReceiveOpen(true), []);
  const closeReceive = useCallback(() => setReceiveOpen(false), []);
  const openAssistant = useCallback(() => setAssistantOpen(true), []);
  const closeAssistant = useCallback(() => setAssistantOpen(false), []);
  const askCopilot = useCallback((prompt) => {
    setAssistantPrompt({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text: prompt });
    setAssistantOpen(true);
  }, []);

  return (
    <AppShell walletSnapshot={walletSnapshot}>
      {showWelcome ? <WelcomeOverlay /> : null}

      <section className="wallet-dashboard-hero pro-wallet-hero">
        <div>
          <p className="section-kicker">Arc AI Wallet</p>
          <h1>Your intelligent financial layer for Arc.</h1>
          <p>Send. Swap. Bridge. Pay. Understand. Build. One self-custodial command center for the Arc community.</p>
        </div>
        <span className="dashboard-live-pill"><i /> Live on {arcTestnet.name}</span>
      </section>

      <PremiumWalletCard
        walletSnapshot={walletSnapshot}
        activityItems={mergedActivity}
        onCopy={handleCopyAddress}
        copied={copied}
        onDisconnect={walletSnapshot.disconnectWallet}
      />

      <div className="wallet-workspace">
        <WalletSidebar
          activeView={activeView}
          onSelect={handleSelectView}
          onReceive={openReceive}
          onAiOpen={openAssistant}
        />

        <div className="wallet-main-panel">
          {activeView === "dashboard" ? (
            <>
              <ProfessionalDashboardSuite
                walletSnapshot={walletSnapshot}
                activityItems={mergedActivity}
                onSelectView={handleSelectView}
                onReceive={openReceive}
                onAskCopilot={askCopilot}
              />
              <WalletIntelligencePanel
                walletSnapshot={walletSnapshot}
                activityItems={mergedActivity}
                onSelectView={handleSelectView}
                onReceive={openReceive}
                onAiOpen={openAssistant}
                onAskCopilot={askCopilot}
              />
            </>
          ) : activeView === "activity" ? (
            <>
              <ActivityInterpreterPanel activityItems={mergedActivity} onAskCopilot={askCopilot} />
              <TransactionActivity
                walletSnapshot={walletSnapshot}
                items={mergedActivity}
                liveStatus={liveActivityStatus}
                liveError={liveActivityError}
                onRefresh={refreshActivity}
              />
            </>
          ) : activeView === "portfolio" ? (
            <PortfolioPanel walletSnapshot={walletSnapshot} activityItems={mergedActivity} />
          ) : activeView === "community" ? (
            <CommunityHubPanel walletSnapshot={walletSnapshot} onSelectView={handleSelectView} />
          ) : activeView === "request" ? (
            <PaymentRequestPanel walletSnapshot={walletSnapshot} />
          ) : activeView === "developer" || activeView === "settings" ? (
            <DeveloperModePanel walletSnapshot={walletSnapshot} activityItems={mergedActivity} />
          ) : activeView === "nft" ? (
            <NftComingSoonCard />
          ) : activeView === "swap" ? (
            <>
              <TransactionGuardianBanner mode="swap" walletSnapshot={walletSnapshot} />
              <SwapUsdcPanel walletSnapshot={walletSnapshot} onActivitySaved={saveLocalActivity} />
            </>
          ) : activeView === "bridge" ? (
            <>
              <TransactionGuardianBanner mode="bridge" walletSnapshot={walletSnapshot} />
              <BridgeToArcPanel walletSnapshot={walletSnapshot} onActivitySaved={saveLocalActivity} compact />
            </>
          ) : (
            <>
              <TransactionGuardianBanner mode="send" walletSnapshot={walletSnapshot} />
              <SendUsdcPanel
                walletSnapshot={walletSnapshot}
                onActivitySaved={saveLocalActivity}
                onActivityUpdated={updateLocalActivityByHash}
              />
            </>
          )}
        </div>
      </div>

      <ReceiveModal open={receiveOpen} onClose={closeReceive} address={walletSnapshot.address} networkLabel={arcTestnet.name} />

      <WalletAiDrawer
        open={assistantOpen}
        onOpen={openAssistant}
        onClose={closeAssistant}
        walletSnapshot={walletSnapshot}
        activityItems={mergedActivity}
        activityStatus={liveActivityStatus}
        initialPrompt={assistantPrompt}
      />
    </AppShell>
  );
}

export default function Home() {
  const walletSnapshot = useArcWalletSnapshot();

  return (
    <>
      <Head>
        <title>Arc AI Wallet | Intelligent USDC Command Center</title>
        <meta name="description" content="Send, receive, swap, bridge, request, inspect and understand USDC activity on Arc with an AI-powered self-custody wallet built for users and developers." />
        <meta name="theme-color" content="#050811" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="canonical" href={SITE_URL} />
      </Head>

      {walletSnapshot.isSignedIn ? <ConnectedWalletExperience walletSnapshot={walletSnapshot} /> : <WalletLoginScreen />}
    </>
  );
}
