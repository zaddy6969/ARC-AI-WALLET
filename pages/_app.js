import "@rainbow-me/rainbowkit/styles.css";
import AppErrorBoundary from "../components/app-error-boundary";
import AppProviders from "../components/app-providers";
import "../styles/globals.css";
import "../styles/wallet-pro.css";
import "../styles/wallet-light.css";
import "../styles/bridge-fix.css";
import "../styles/bridge-networks.css";
import "../styles/swap-fix.css";
import "../styles/action-pages.css";
import "../styles/copilot.css";
import "../styles/arc-community.css";
import "../styles/arc-community-upgrade.css";
import "../styles/agent-upgrade.css";
import "../styles/wallet-polish.css";
import "../styles/wallet-entry-polish.css";
import "../styles/premium-rebuild.css";
import "../styles/premium-header.css";
import "../styles/premium-wallet-v2.css";
import "../styles/premium-ai-assistant.css";
import "../styles/assistant-layout-fix.css";
import "../styles/wallet-v3.css";
import "../styles/wallet-v3-bridge.css";
import "../styles/wallet-v4.css";
import "../styles/wallet-v5.css";

export default function App({ Component, pageProps }) {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <Component {...pageProps} />
      </AppProviders>
    </AppErrorBoundary>
  );
}
