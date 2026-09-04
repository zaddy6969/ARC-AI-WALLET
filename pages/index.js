import Head from "next/head";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import AppShell from "../components/app-shell";
import WalletLoginScreen from "../components/wallet-login-screen";
import WalletSidebar from "../components/wallet-sidebar";
import { ARC_NETWORK_MODE, MULTICHAIN_WALLET_CHAINS, arcTestnet } from "../lib/arc-chain";
import { useArcWalletSnapshot } from "../lib/use-arc-wallet-snapshot";
import { useWalletAppState } from "../lib/use-wallet-app-state";
import { switchWalletNetwork } from "../lib/wallet-network";

function PanelLoading() {
  return (
    <section className="card panel-loading" role="status" aria-live="polite">
      <span className="panel-loading-orb" />
      <div><strong>Loading wallet</strong><p>Syncing wallet data…</p></div>
    </section>
  );
}

const WalletDashboardV4 = dynamic(() => import("../components/wallet-dashboard-v4"), { loading: PanelLoading });
const BridgeToArcPanel = dynamic(() => import("../components/bridge-to-arc-panel-v4"), { loading: PanelLoading });
const PortfolioPanel = dynamic(() => import("../components/wallet-feature-panels").then((module) => module.PortfolioPanel), { loading: PanelLoading });
const SendUsdcPanel = dynamic(() => import("../components/send-usdc-panel"), { loading: PanelLoading });
const SwapUsdcPanel = dynamic(() => import("../components/swap-usdc-panel-v4"), { loading: PanelLoading });
const TransactionActivity = dynamic(() => import("../components/transaction-activity"), { loading: PanelLoading });
const TokenApprovalsPanel = dynamic(() => import("../components/token-approvals-panel"), { loading: PanelLoading });
const AiAgentWorkspace = dynamic(() => import("../components/ai-agent-workspace"), { ssr: false, loading: PanelLoading });
const ReceiveModal = dynamic(() => import("../components/wallet/ReceiveModal"), { ssr: false });
const UnifiedBalancePanel = dynamic(() => import("../components/unified-balance-panel"), { loading: PanelLoading });
const ArcCommunityHubPanel = dynamic(() => import("../components/arc-community-hub"), { loading: PanelLoading });
const TransactionGuardianBanner = dynamic(() => import("../components/wallet-pro-suite").then((module) => module.TransactionGuardianBanner), { loading: PanelLoading });
const PaymentRequestPanel = dynamic(() => import("../components/wallet-pro-suite").then((module) => module.PaymentRequestPanel), { loading: PanelLoading });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://lumexa-aiwallet.vercel.app";
const SUPPORTED_VIEWS = new Set(["dashboard", "send", "receive", "swap", "bridge", "unified", "activity", "approvals", "portfolio", "community", "request", "agent"]);

function copilotNetworkChainId(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "arc") return arcTestnet.id;
  if (ARC_NETWORK_MODE === "mainnet") {
    if (normalized === "ethereum" || normalized === "ethereum-mainnet") return 1;
    if (normalized === "base" || normalized === "base-mainnet") return 8453;
    return null;
  }
  if (normalized === "ethereum-sepolia") return 11155111;
  if (normalized === "base-sepolia") return 84532;
  return null;
}

function ConnectedWalletExperience({ walletSnapshot }) {
  const {
    mergedActivity,
    liveActivityNetworks,
    liveActivityStatus,
    liveActivityError,
    saveLocalActivity,
    refreshActivity,
    updateLocalActivityByHash
  } = useWalletAppState(walletSnapshot);
  const { connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [activeView, setActiveView] = useState("dashboard");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState(null);
  const [copilotAction, setCopilotAction] = useState(null);

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
  }, [updateViewLocation]);

  const openReceive = useCallback(() => setReceiveOpen(true), []);
  const closeReceive = useCallback(() => setReceiveOpen(false), []);

  const handleCopilotAction = useCallback(async (action) => {
    if (!action?.tool) return;
    if (action.tool === "prepare_send") return openCopilotView("send", action);
    if (action.tool === "prepare_swap") return openCopilotView("swap", action);
    if (action.tool === "prepare_bridge") return openCopilotView("bridge", action);
    if (action.tool === "open_wallet_view") {
      const view = action?.args?.view;
      if (view === "receive") setReceiveOpen(true);
      else if (SUPPORTED_VIEWS.has(view)) handleSelectView(view);
      return;
    }
    if (action.tool === "switch_network") {
      const chainId = copilotNetworkChainId(action?.args?.network);
      const chain = MULTICHAIN_WALLET_CHAINS.find((item) => item.id === Number(chainId));
      if (!chain || !connector) return;
      try {
        await switchWalletNetwork({ connector, chain, switchChainAsync });
      } catch {
        setAssistantPrompt({ id: `${Date.now()}-switch-error`, text: "My wallet did not complete the requested network switch. Tell me what to check next." });
        handleSelectView("agent");
      }
    }
  }, [connector, handleSelectView, openCopilotView, switchChainAsync]);

  return (
    <AppShell walletSnapshot={walletSnapshot}>
      <div className="wallet-workspace premium-wallet-workspace">
        <WalletSidebar activeView={activeView} onSelect={handleSelectView} onReceive={openReceive} />

        <div className="wallet-main-panel premium-wallet-main">
          {activeView === "dashboard" ? (
            <WalletDashboardV4 walletSnapshot={walletSnapshot} activityItems={mergedActivity} onSelectView={handleSelectView} onReceive={openReceive} />
          ) : activeView === "agent" ? (
            <AiAgentWorkspace walletSnapshot={walletSnapshot} activityItems={mergedActivity} activityStatus={liveActivityStatus} initialPrompt={assistantPrompt} onWalletAction={handleCopilotAction} />
          ) : activeView === "activity" ? (
            <TransactionActivity walletSnapshot={walletSnapshot} items={mergedActivity} networkStatuses={liveActivityNetworks} liveStatus={liveActivityStatus} liveError={liveActivityError} onRefresh={refreshActivity} />
          ) : activeView === "approvals" ? (
            <TokenApprovalsPanel walletSnapshot={walletSnapshot} onActivitySaved={saveLocalActivity} />
          ) : activeView === "portfolio" ? (
            <PortfolioPanel walletSnapshot={walletSnapshot} activityItems={mergedActivity} />
          ) : activeView === "unified" ? (
            <UnifiedBalancePanel walletSnapshot={walletSnapshot} onSelectView={handleSelectView} />
          ) : activeView === "community" ? (
            <ArcCommunityHubPanel walletSnapshot={walletSnapshot} />
          ) : activeView === "request" ? (
            <PaymentRequestPanel walletSnapshot={walletSnapshot} />
          ) : activeView === "swap" ? (
            <>
              <TransactionGuardianBanner mode="swap" walletSnapshot={walletSnapshot} />
              <SwapUsdcPanel walletSnapshot={walletSnapshot} onActivitySaved={saveLocalActivity} copilotAction={copilotAction} />
            </>
          ) : activeView === "bridge" ? (
            <>
              <TransactionGuardianBanner mode="bridge" walletSnapshot={walletSnapshot} />
              <BridgeToArcPanel walletSnapshot={walletSnapshot} onActivitySaved={saveLocalActivity} copilotAction={copilotAction} />
            </>
          ) : (
            <>
              <TransactionGuardianBanner mode="send" walletSnapshot={walletSnapshot} />
              <SendUsdcPanel walletSnapshot={walletSnapshot} onActivitySaved={saveLocalActivity} onActivityUpdated={updateLocalActivityByHash} copilotAction={copilotAction} />
            </>
          )}
        </div>
      </div>

      <ReceiveModal open={receiveOpen} onClose={closeReceive} address={walletSnapshot.address} networkLabel={walletSnapshot?.activeChainName || arcTestnet.name} />
    </AppShell>
  );
}

export default function Home() {
  const walletSnapshot = useArcWalletSnapshot();
  return (
    <>
      <Head>
        <title>Lumexa AI Wallet | USDC, Unified Balance & AI Assistant</title>
        <meta name="description" content="Lumexa AI Wallet is a self-custodial multichain USDC wallet built on Arc, with send, receive, swap, bridge, Unified Balance, activity tracking, token approval security and one AI Assistant that prepares wallet actions for user approval." />
        <meta name="theme-color" content="#070b12" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="canonical" href={SITE_URL} />
      </Head>
      {walletSnapshot.isSignedIn ? <ConnectedWalletExperience walletSnapshot={walletSnapshot} /> : <WalletLoginScreen />}
    </>
  );
}
