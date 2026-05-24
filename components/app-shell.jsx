import AppNav from "./app-nav";
import SiteFooter from "./site-footer";

export default function AppShell({ children, walletSnapshot }) {
  return (
    <main className="page-shell">
      <div className="page-frame">
        <AppNav walletSnapshot={walletSnapshot} />
        {children}
        <SiteFooter />
      </div>
    </main>
  );
}
