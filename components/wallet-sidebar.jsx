import { memo } from "react";

const ACTIONS = [
  { id: "dashboard", label: "Home", icon: "dashboard" },
  { id: "send", label: "Send", icon: "send" },
  { id: "receive", label: "Receive", icon: "receive" },
  { id: "swap", label: "Swap", icon: "swap" },
  { id: "bridge", label: "Bridge", icon: "bridge" },
  { id: "unified", label: "Unified", icon: "unified" },
  { id: "request", label: "Request", icon: "request" },
  { id: "portfolio", label: "Assets", icon: "portfolio" },
  { id: "activity", label: "Activity", icon: "activity" },
  { id: "community", label: "Explore", icon: "community" },
  { id: "agent", label: "Assistant", icon: "ai" }
];

export function FeatureIcon({ name }) {
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
    case "receive":
      return <svg {...commonProps}><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></svg>;
    case "request":
      return <svg {...commonProps}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 9h8" /><path d="M8 13h5" /><path d="M8 17h3" /></svg>;
    case "community":
      return <svg {...commonProps}><circle cx="9" cy="9" r="3" /><circle cx="17" cy="8" r="2" /><path d="M4 19c.6-3 2.3-5 5-5s4.4 2 5 5" /><path d="M14 14c2.8-.3 4.8 1.2 5.5 4" /></svg>;
    case "unified":
      return <svg {...commonProps}><circle cx="8" cy="8" r="4" /><circle cx="16" cy="16" r="4" /><path d="M10.8 10.8 13.2 13.2" /><path d="M13 7h4v4" /></svg>;
    case "ai":
      return <svg {...commonProps}><path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="m5.6 5.6 2.1 2.1" /><path d="m16.3 16.3 2.1 2.1" /><path d="m18.4 5.6-2.1 2.1" /><path d="m7.7 16.3-2.1 2.1" /><circle cx="12" cy="12" r="3.5" /></svg>;
    case "send":
      return <svg {...commonProps}><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /><path d="M5 18v-3.5" /></svg>;
    case "swap":
      return <svg {...commonProps}><path d="M7 7h10" /><path d="m14 4 3 3-3 3" /><path d="M17 17H7" /><path d="m10 14-3 3 3 3" /></svg>;
    case "bridge":
      return <svg {...commonProps}><path d="M5 16c2.2-4 4.5-6 7-6s4.8 2 7 6" /><path d="M4 19h16" /><path d="M7 16v3" /><path d="M12 11v8" /><path d="M17 16v3" /></svg>;
    case "activity":
      return <svg {...commonProps}><path d="M4 14h4l2-7 4 11 2-7h4" /><path d="M4 20h16" /></svg>;
    case "portfolio":
      return <svg {...commonProps}><path d="M5 9h14v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Z" /><path d="M8 9V7a4 4 0 0 1 8 0v2" /><path d="M9 14h6" /></svg>;
    default:
      return <svg {...commonProps}><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>;
  }
}

function WalletSidebar({ activeView, onSelect, onReceive }) {
  return (
    <aside className="wallet-sidebar floating-wallet-dock pro-wallet-sidebar">
      <nav aria-label="Wallet actions">
        {ACTIONS.map((action) => {
          const isActive = action.id === activeView;
          const handleClick = () => {
            if (action.id === "receive") return onReceive?.();
            onSelect?.(action.id);
          };

          return (
            <button
              key={action.id}
              type="button"
              className={`sidebar-action ${isActive ? "sidebar-action-active" : ""}`}
              onClick={handleClick}
              aria-label={action.label}
              aria-current={isActive ? "page" : undefined}
              title={action.label}
            >
              <span className="dock-icon"><FeatureIcon name={action.icon} /></span>
              <span>{action.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export default memo(WalletSidebar);
