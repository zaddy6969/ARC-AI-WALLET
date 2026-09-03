import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";

type ReceiveModalProps = {
  open: boolean;
  onClose: () => void;
  address?: string;
  networkLabel?: string;
};

type FeedbackState =
  | {
      tone: "success" | "error";
      message: string;
    }
  | null;

const RECEIVE_ASSETS = ["USDC", "EURC", "cirBTC"];

function shortenAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function ReceiveModal({
  open,
  onClose,
  address = "",
  networkLabel = "Arc Testnet"
}: ReceiveModalProps) {
  const [mounted, setMounted] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSharing, setIsSharing] = useState(false);
  const hasAddress = Boolean(address);
  const shortAddress = useMemo(() => shortenAddress(address), [address]);
  const canShare = useMemo(
    () =>
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      hasAddress,
    [hasAddress]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timeoutId = window.setTimeout(() => setFeedback(null), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!open) {
      setFeedback(null);
      setIsSharing(false);
    }
  }, [open]);

  useEffect(() => {
    setFeedback(null);
  }, [address]);

  const handleCopy = async () => {
    if (!hasAddress) {
      setFeedback({ tone: "error", message: "Wallet address is still loading." });
      return;
    }

    try {
      await copyTextToClipboard(address);
      setFeedback({ tone: "success", message: "Copied!" });
    } catch {
      setFeedback({ tone: "error", message: "Unable to copy the address right now." });
    }
  };

  const handleShare = async () => {
    if (!canShare) return;

    try {
      setIsSharing(true);
      await navigator.share({
        title: "Lumexa AI Wallet address",
        text: `Receive on ${networkLabel}: ${address}`
      });
      setFeedback({ tone: "success", message: "Address shared." });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("abort")) {
        setFeedback({ tone: "error", message: "Unable to share the address right now." });
      }
    } finally {
      setIsSharing(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="receive-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="receive-modal-title"
            className="receive-modal"
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="receive-modal-header">
              <div>
                <p className="section-kicker">Receive</p>
                <h2 id="receive-modal-title">Receive assets</h2>
              </div>
              <button type="button" className="receive-close-button" onClick={onClose} aria-label="Close receive modal">×</button>
            </div>

            <div className="receive-network-row">
              <span className="status-badge status-good">{networkLabel}</span>
              <span className="receive-short-address">{shortAddress || "Loading address"}</span>
            </div>

            <div className="receive-asset-row" aria-label="Supported receive assets">
              {RECEIVE_ASSETS.map((asset) => <span key={asset}>{asset}</span>)}
            </div>

            <div className="receive-qr-shell">
              {hasAddress ? (
                <QRCodeSVG
                  value={address}
                  size={196}
                  bgColor="#ffffff"
                  fgColor="#101828"
                  level="M"
                  includeMargin
                />
              ) : (
                <div className="receive-qr-loading">
                  <strong>Connect wallet to show address</strong>
                  <p>Connect your wallet to generate a QR code.</p>
                </div>
              )}
            </div>

            <div className="receive-address-card">
              <span className="field-label">Wallet address</span>
              <strong>{address || "Wallet address unavailable"}</strong>
            </div>

            <div className="receive-actions">
              <button
                type="button"
                className="button button-primary receive-copy-button"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleCopy();
                }}
                disabled={!hasAddress}
              >
                {feedback?.tone === "success" ? "Copied!" : "Copy address"}
              </button>
              {canShare ? (
                <button type="button" className="button button-secondary" onClick={handleShare} disabled={!hasAddress || isSharing}>
                  {isSharing ? "Sharing..." : "Share"}
                </button>
              ) : null}
              <a className="button button-secondary" href="https://faucet.circle.com" target="_blank" rel="noreferrer">Faucet</a>
            </div>

            <div className="receive-warning">
              <strong>Use Arc Testnet for this address.</strong>
              <p>Supported wallet assets shown here are USDC, EURC and cirBTC. Check the network before sending.</p>
            </div>

            <AnimatePresence>
              {feedback ? (
                <motion.div
                  className={`receive-toast receive-toast-${feedback.tone}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                >
                  {feedback.message}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
