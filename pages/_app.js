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

export default function App({ Component, pageProps }) {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <Component {...pageProps} />
      </AppProviders>
    </AppErrorBoundary>
  );
}
