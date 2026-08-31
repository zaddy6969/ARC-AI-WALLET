import AppNav from "./app-nav";

export default function AppShell({ children, walletSnapshot }) {
  return (
    <main className="page-shell">
      <div className="page-frame">
        <AppNav walletSnapshot={walletSnapshot} />
        {children}
      </div>
    </main>
  );
}
