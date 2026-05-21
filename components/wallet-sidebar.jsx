const ACTIONS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "send", label: "Send", icon: "send" },
  { id: "swap", label: "Swap", icon: "swap" },
  { id: "bridge", label: "Bridge", icon: "bridge" },
  { id: "activity", label: "Activity", icon: "activity" },
  { id: "portfolio", label: "Portfolio", icon: "portfolio" },
  { id: "nft", label: "NFT", icon: "nft" }
];

function FeatureIcon({ name }) {
  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  };

  switch (name) {
    case "send":
      return (
        <svg {...commonProps}>
          <path d="M5 12h13" />
          <path d="m13 6 6 6-6 6" />
          <path d="M5 18v-3.5" />
        </svg>
      );
    case "swap":
      return (
        <svg {...commonProps}>
          <path d="M7 7h10" />
          <path d="m14 4 3 3-3 3" />
          <path d="M17 17H7" />
          <path d="m10 14-3 3 3 3" />
        </svg>
      );
    case "bridge":
      return (
        <svg {...commonProps}>
          <path d="M5 16c2.2-4 4.5-6 7-6s4.8 2 7 6" />
          <path d="M4 19h16" />
          <path d="M7 16v3" />
          <path d="M12 11v8" />
          <path d="M17 16v3" />
        </svg>
      );
    case "activity":
      return (
        <svg {...commonProps}>
          <path d="M4 14h4l2-7 4 11 2-7h4" />
          <path d="M4 20h16" />
        </svg>
      );
    case "portfolio":
      return (
        <svg {...commonProps}>
          <path d="M5 9h14v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Z" />
          <path d="M8 9V7a4 4 0 0 1 8 0v2" />
          <path d="M9 14h6" />
        </svg>
      );
    case "nft":
      return (
        <svg {...commonProps}>
          <path d="m12 3 7 4v10l-7 4-7-4V7l7-4Z" />
          <path d="m9 10 3-2 3 2v4l-3 2-3-2v-4Z" />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <rect x="4" y="4" width="7" height="7" rx="2" />
          <rect x="13" y="4" width="7" height="7" rx="2" />
          <rect x="4" y="13" width="7" height="7" rx="2" />
          <rect x="13" y="13" width="7" height="7" rx="2" />
        </svg>
      );
  }
}

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
              <span className="dock-icon">
                <FeatureIcon name={action.icon} />
              </span>
              <span>{action.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
