import { AnimatePresence, motion } from "framer-motion";
import WalletAssistant from "./wallet-assistant";

export default function WalletAiDrawer({
  open,
  onOpen,
  onClose,
  walletSnapshot,
  activityItems,
  activityStatus,
  initialPrompt
}) {
  return (
    <>
      <button
        type="button"
        className="ai-fab"
        onClick={open ? onClose : onOpen}
        aria-expanded={open}
      >
        <span className="ai-fab-orb" />
        <span>Copilot</span>
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.button
              type="button"
              aria-label="Close AI assistant"
              className="ai-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="ai-drawer"
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="ai-drawer-glow" aria-hidden="true" />
              <button
                type="button"
                className="receive-close-button ai-close-button"
                onClick={onClose}
                aria-label="Close AI assistant"
              >
                x
              </button>
              <WalletAssistant
                walletSnapshot={walletSnapshot}
                activityItems={activityItems}
                activityStatus={activityStatus}
                initialPrompt={initialPrompt}
              />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
