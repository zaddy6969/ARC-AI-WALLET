import "@rainbow-me/rainbowkit/styles.css";
import AppErrorBoundary from "../components/app-error-boundary";
import AppProviders from "../components/app-providers";
import "../styles/globals.css";
import "../styles/wallet-pro.css";
import "../styles/wallet-light.css";
import "../styles/bridge-fix.css";
import "../styles/swap-fix.css";

export default function App({ Component, pageProps }) {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <Component {...pageProps} />
      </AppProviders>
    </AppErrorBoundary>
  );
}
