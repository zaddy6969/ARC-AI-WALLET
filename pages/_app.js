import "@rainbow-me/rainbowkit/styles.css";
import AppErrorBoundary from "../components/app-error-boundary";
import AppProviders from "../components/app-providers";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <Component {...pageProps} />
      </AppProviders>
    </AppErrorBoundary>
  );
}
