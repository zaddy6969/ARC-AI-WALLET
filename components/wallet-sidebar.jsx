const ACTIONS = [
  { id: "dashboard", label: "Dashboard", icon: "D" },
  { id: "send", label: "Send", icon: "S" },
  { id: "swap", label: "Swap", icon: "X" },
  { id: "bridge", label: "Bridge", icon: "B" },
  { id: "activity", label: "Activity", icon: "A" },
  { id: "portfolio", label: "Portfolio", icon: "P" },
  { id: "nft", label: "NFT", icon: "N" }
];

export default function WalletSidebar({
  activeView,
  onSelect,
  onReceive,
  onAiOpen
}) {
  return (
    <aside className="wallet-sidebar floating-wallet-dock">
      <nav aria-label="Wallet actions">
        {ACTIONS.map((action) => {
          const isActive = action.id === activeView;

          return (
            <button
              key={action.id}
              type="button"
              className={`sidebar-action ${isActive ? "sidebar-action-active" : ""}`}
              onClick={() => onSelect(action.id)}
            >
              <span className="dock-icon">{action.icon}</span>
              <span>{action.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
