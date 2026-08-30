import Head from "next/head";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSwitchChain } from "wagmi";
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
const WalletAssistant = dynamic(() => import("../components/wallet-assistant"), { ssr: false, loading: PanelLoading });
const ReceiveModal = dynamic(() => import("../components/wallet/ReceiveModal"), { ssr: false });
const UnifiedBalancePanel = dynamic(() => import("../components/unified-balance-panel"), { loading: PanelLoading });
const ArcCommunityHubPanel = dynamic(() => import("../components/arc-community-hub"), { loading: PanelLoading });
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
  "unified",
  "activity",
  "portfolio",
  "community",
  "request",
  "agent"
]);

function copilotNetworkChainId(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "arc") return 5042002;
  if (normalized === "ethereum-sepolia") return 11155111;
  if (normalized === "base-sepolia") return 84532;
  return null;
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
  const { switchChainAsync } = useSwitchChain();
  const [activeView, setActiveView] = useState("dashboard");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState(null);
  const [copilotAction, setCopilotAction] = useState(null);
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
        setCopilotAction(null);
        setActiveView(nextHash);
      } else if (nextHash) {
        setCopilotAction(null);
        setActiveView("dashboard");
        window.history.replaceState(null, "", "/#dashboard");
      }
    };

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  const updateViewLocation = useCallback((view) => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/#${view}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleSelectView = useCallback((view) => {
    setCopilotAction(null);
    if (!SUPPORTED_VIEWS.has(view) || view === "receive") {
      if (view === "receive") setReceiveOpen(true);
      return;
    }

    setActiveView(view);
    updateViewLocation(view);
  }, [updateViewLocation]);

  const openCopilotView = useCallback((view, action) => {
    if (!SUPPORTED_VIEWS.has(view) || view === "receive") {
      if (view === "receive") setReceiveOpen(true);
      return;
    }
    setCopilotAction({ ...action, id: action.id || `${Date.now()}-${Math.random()}` });
    setActiveView(view);
    updateViewLocation(view);
    setAssistantOpen(false);
  }, [updateViewLocation]);

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

  const handleCopilotAction = useCallback(async (action) => {
    if (!action?.tool) return;

    if (action.tool === "prepare_send") {
      openCopilotView("send", action);
      return;
    }
    if (action.tool === "prepare_swap") {
      openCopilotView("swap", action);
      return;
    }
    if (action.tool === "prepare_bridge") {
      openCopilotView("bridge", action);
      return;
    }
    if (action.tool === "open_wallet_view") {
      const view = action?.args?.view;
      if (view === "receive") {
        setAssistantOpen(false);
        setReceiveOpen(true);
      } else if (SUPPORTED_VIEWS.has(view)) {
        setAssistantOpen(false);
        handleSelectView(view);
      }
      return;
    }
    if (action.tool === "switch_network") {
      const chainId = copilotNetworkChainId(action?.args?.network);
      if (!chainId || !switchChainAsync) return;
      try {
        await switchChainAsync({ chainId });
        setAssistantOpen(false);
      } catch {
        setAssistantPrompt({
          id: `${Date.now()}-switch-error`,
          text: "My wallet did not complete the requested network switch. Tell me what to check next."
        });
      }
    }
  }, [handleSelectView, openCopilotView, switchChainAsync]);

  return (
    <AppShell walletSnapshot={walletSnapshot}>
      <section className="wallet-dashboard-hero pro-wallet-hero">
        <div>
          <p className="section-kicker">Arc AI Wallet</p>
          <h1>Your wallet, powered by an AI Agent.</h1>
          <p>Manage USDC, use Unified Balance, inspect live Arc data, and let the AI Agent prepare wallet actions for your approval.</p>
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
        onAiOpen={() => handleSelectView("agent")}
      />

      <div className="wallet-workspace">
        <WalletSidebar
          activeView={activeView}
          onSelect={handleSelectView}
          onReceive={openReceive}
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
          ) : activeView === "agent" ? (
            <WalletAssistant
              walletSnapshot={walletSnapshot}
              activityItems={mergedActivity}
              activityStatus={liveActivityStatus}
              initialPrompt={assistantPrompt}
              onWalletAction={handleCopilotAction}
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
          ) : activeView === "unified" ? (
            <UnifiedBalancePanel walletSnapshot={walletSnapshot} onSelectView={handleSelectView} />
          ) : activeView === "community" ? (
            <ArcCommunityHubPanel walletSnapshot={walletSnapshot} onAskCopilot={askCopilot} />
          ) : activeView === "request" ? (
            <PaymentRequestPanel walletSnapshot={walletSnapshot} />
          ) : activeView === "swap" ? (
            <>
              <TransactionGuardianBanner mode="swap" walletSnapshot={walletSnapshot} />
              <SwapUsdcPanel
                walletSnapshot={walletSnapshot}
                onActivitySaved={saveLocalActivity}
                copilotAction={copilotAction}
              />
            </>
          ) : activeView === "bridge" ? (
            <>
              <TransactionGuardianBanner mode="bridge" walletSnapshot={walletSnapshot} />
              <BridgeToArcPanel
                walletSnapshot={walletSnapshot}
                onActivitySaved={saveLocalActivity}
                copilotAction={copilotAction}
              />
            </>
          ) : (
            <>
              <TransactionGuardianBanner mode="send" walletSnapshot={walletSnapshot} />
              <SendUsdcPanel
                walletSnapshot={walletSnapshot}
                onActivitySaved={saveLocalActivity}
                onActivityUpdated={updateLocalActivityByHash}
                copilotAction={copilotAction}
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

      {activeView !== "agent" ? (
        <WalletAiDrawer
          open={assistantOpen}
          onOpen={openAssistant}
          onClose={closeAssistant}
          walletSnapshot={walletSnapshot}
          activityItems={mergedActivity}
          activityStatus={liveActivityStatus}
          initialPrompt={assistantPrompt}
          onWalletAction={handleCopilotAction}
        />
      ) : null}
    </AppShell>
  );
}

export default function Home() {
  const walletSnapshot = useArcWalletSnapshot();

  return (
    <>
      <Head>
        <title>Arc AI Wallet | USDC, Unified Balance & AI Agent</title>
        <meta
          name="description"
          content="A self-custodial Arc wallet with USDC send, receive, swap, bridge, Circle App Kit Unified Balance, live Arc data, community tools and a real AI Agent that prepares wallet actions for user approval."
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
