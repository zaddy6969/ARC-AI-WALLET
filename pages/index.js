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
        <strong>Loading wallet</strong>
        <p>Syncing Arc data…</p>
      </div>
    </section>
  );
}

const BridgeToArcPanel = dynamic(() => import("../components/bridge-to-arc-panel"), { loading: PanelLoading });
const PortfolioPanel = dynamic(
  () => import("../components/wallet-feature-panels").then((module) => module.PortfolioPanel),
  { loading: PanelLoading }
);
const SendUsdcPanel = dynamic(() => import("../components/send-usdc-panel"), { loading: PanelLoading });
const SwapUsdcPanel = dynamic(() => import("../components/swap-usdc-panel"), { loading: PanelLoading });
const TransactionActivity = dynamic(() => import("../components/transaction-activity"), { loading: PanelLoading });
const WalletAiDrawer = dynamic(() => import("../components/wallet-ai-drawer"), { ssr: false });
const ReceiveModal = dynamic(() => import("../components/wallet/ReceiveModal"), { ssr: false });
const WalletOverviewCard = dynamic(
  () => import("../components/wallet-pro-suite").then((module) => module.WalletOverviewCard),
  { loading: PanelLoading }
);
const FastDashboardPanel = dynamic(
  () => import("../components/wallet-pro-suite").then((module) => module.FastDashboardPanel),
  { loading: PanelLoading }
);
const TransactionGuardianBanner = dynamic(
  () => import("../components/wallet-pro-suite").then((module) => module.TransactionGuardianBanner),
  { loading: PanelLoading }
);
const ActivityInterpreterPanel = dynamic(
  () => import("../components/wallet-pro-suite").then((module) => module.ActivityInterpreterPanel),
  { loading: PanelLoading }
);
const CommunityHubPanel = dynamic(
  () => import("../components/wallet-pro-suite").then((module) => module.CommunityHubPanel),
  { loading: PanelLoading }
);
const PaymentRequestPanel = dynamic(
  () => import("../components/wallet-pro-suite").then((module) => module.PaymentRequestPanel),
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
  "request"
]);

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
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef(null);

  useEffect(() => () => {
    if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
  }, []);

  useEffect(() => {
    const syncViewFromHash = () => {
      const nextHash = String(window.location.hash || "").replace(/^#/, "");

      if (nextHash === "receive") {
        setReceiveOpen(true);
        return;
      }

      if (SUPPORTED_VIEWS.has(nextHash)) {
        setActiveView(nextHash);
      } else if (nextHash) {
        setActiveView("dashboard");
        window.history.replaceState(null, "", "/#dashboard");
      }
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  const handleSelectView = useCallback((view) => {
    if (!SUPPORTED_VIEWS.has(view) || view === "receive") {
      if (view === "receive") setReceiveOpen(true);
      return;
    }

    setActiveView(view);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/#${view}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleCopyAddress = useCallback(async () => {
    if (!walletSnapshot.address) return;
    try {
      await navigator.clipboard.writeText(walletSnapshot.address);
      setCopied(true);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  }, [walletSnapshot.address]);

  const openReceive = useCallback(() => setReceiveOpen(true), []);
  const closeReceive = useCallback(() => setReceiveOpen(false), []);
  const openAssistant = useCallback(() => setAssistantOpen(true), []);
  const closeAssistant = useCallback(() => setAssistantOpen(false), []);
  const askCopilot = useCallback((prompt) => {
    setAssistantPrompt({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text: prompt
    });
    setAssistantOpen(true);
  }, []);

  return (
    <AppShell walletSnapshot={walletSnapshot}>
      <section className="wallet-dashboard-hero pro-wallet-hero">
        <div>
          <p className="section-kicker">Arc AI Wallet</p>
          <h1>Your wallet, simplified by AI.</h1>
          <p>Manage USDC, bridge across supported chains, and understand every move.</p>
        </div>
        <span className="dashboard-live-pill"><i /> {arcTestnet.name}</span>
      </section>

      <WalletOverviewCard
        walletSnapshot={walletSnapshot}
        activityItems={mergedActivity}
        onCopy={handleCopyAddress}
        copied={copied}
        onDisconnect={walletSnapshot.disconnectWallet}
        onSelectView={handleSelectView}
        onReceive={openReceive}
        onAiOpen={openAssistant}
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
            <FastDashboardPanel
              walletSnapshot={walletSnapshot}
              activityItems={mergedActivity}
              onSelectView={handleSelectView}
              onReceive={openReceive}
              onAskCopilot={askCopilot}
            />
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
            <CommunityHubPanel onSelectView={handleSelectView} />
          ) : activeView === "request" ? (
            <PaymentRequestPanel walletSnapshot={walletSnapshot} />
          ) : activeView === "swap" ? (
            <>
              <TransactionGuardianBanner mode="swap" walletSnapshot={walletSnapshot} />
              <SwapUsdcPanel walletSnapshot={walletSnapshot} onActivitySaved={saveLocalActivity} />
            </>
          ) : activeView === "bridge" ? (
            <>
              <TransactionGuardianBanner mode="bridge" walletSnapshot={walletSnapshot} />
              <BridgeToArcPanel walletSnapshot={walletSnapshot} onActivitySaved={saveLocalActivity} />
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

      <ReceiveModal
        open={receiveOpen}
        onClose={closeReceive}
        address={walletSnapshot.address}
        networkLabel={arcTestnet.name}
      />

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
        <title>Arc AI Wallet | Professional USDC Wallet</title>
        <meta
          name="description"
          content="A self-custodial USDC wallet for Arc with Send, Receive, Swap, Bridge, portfolio, activity and Arc AI assistance."
        />
        <meta name="theme-color" content="#f5f7fb" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="canonical" href={SITE_URL} />
      </Head>

      {walletSnapshot.isSignedIn ? (
        <ConnectedWalletExperience walletSnapshot={walletSnapshot} />
      ) : (
        <WalletLoginScreen />
      )}
    </>
  );
}
