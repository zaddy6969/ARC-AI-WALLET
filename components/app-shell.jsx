import { useEffect, useState } from "react";
import AppNav from "./app-nav";

const WALLET_THEME_KEY = "lumexa-wallet-theme";

function getPreferredTheme() {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(WALLET_THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}

export default function AppShell({ children, walletSnapshot }) {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(getPreferredTheme());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.walletTheme = theme;
    document.body.dataset.walletTheme = theme;
    window.localStorage.setItem(WALLET_THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  return (
    <main className="page-shell wallet-v4-shell" data-wallet-theme={theme}>
      <div className="wallet-v4-header-wrap">
        <div className="wallet-v4-header-inner">
          <AppNav walletSnapshot={walletSnapshot} theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </div>
      <div className="page-frame wallet-v4-page-frame">
        {children}
      </div>
    </main>
  );
}
