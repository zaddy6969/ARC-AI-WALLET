import {
  connectorsForWallets,
  darkTheme,
  RainbowKitProvider
} from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  safeWallet,
  walletConnectWallet
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, useMemo, useState } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import {
  MULTICHAIN_WALLET_CHAINS,
  arcTestnet,
  hasWalletConnectProjectId,
  walletConnectProjectId
} from "../lib/arc-chain";
import WalletLoginScreen from "./wallet-login-screen";

function ProviderFallback({ message }) {
  return (
    <WalletLoginScreen
      providerUnavailable
      providerError={
        message ||
        "Wallet provider initialization failed, but the app is still available."
      }
    />
  );
}

class ProviderErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[arc-wallet-provider]", error);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ProviderFallback
          message={
            this.state.error instanceof Error
              ? this.state.error.message
              : "Unable to initialize wallet provider."
          }
        />
      );
    }

    return this.props.children;
  }
}

function createWalletConfig() {
  const wallets = [injectedWallet, safeWallet];

  if (hasWalletConnectProjectId) {
    wallets.push(walletConnectWallet);
  }

  const connectors = connectorsForWallets(
    [
      {
        groupName: "Recommended",
        wallets
      }
    ],
    {
      appName: "arc-ai-wallet",
      ...(hasWalletConnectProjectId
        ? { projectId: walletConnectProjectId }
        : {})
    }
  );

  return createConfig({
    connectors,
    chains: MULTICHAIN_WALLET_CHAINS,
    ssr: true,
    transports: Object.fromEntries(
      MULTICHAIN_WALLET_CHAINS.map((chain) => [
        chain.id,
        http(chain.rpcUrls.default.http[0])
      ])
    )
  });
}

const rainbowTheme = darkTheme({
  accentColor: "#61d8ff",
  accentColorForeground: "#06131d",
  borderRadius: "large",
  fontStack: "system",
  overlayBlur: "small"
});

export default function AppProviders({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 10_000
          }
        }
      })
  );
  const walletConfigState = useMemo(() => {
    try {
      return { config: createWalletConfig(), error: null };
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[arc-wallet-provider]", error);
      }

      return { config: null, error };
    }
  }, []);

  if (!walletConfigState.config) {
    return (
      <ProviderFallback
        message={
          walletConfigState.error instanceof Error
            ? walletConfigState.error.message
            : "Unable to initialize wallet provider."
        }
      />
    );
  }

  return (
    <ProviderErrorBoundary>
      <WagmiProvider config={walletConfigState.config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider initialChain={arcTestnet} theme={rainbowTheme}>
            {children}
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ProviderErrorBoundary>
  );
}
