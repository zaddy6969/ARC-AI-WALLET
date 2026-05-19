import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { ARC_USDC_ERC20_ADDRESS, arcTestnet } from "../lib/arc-chain";
import { createWalletActionRecord } from "../lib/local-activity";

const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

function normalizeAmount(value) {
  return String(value || "").replace(/[^\d.]/g, "");
}

function shortAddress(address) {
  if (!address) {
    return "";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatGasFee(value) {
  return `${Number(formatUnits(value, arcTestnet.nativeCurrency.decimals)).toFixed(6)} ${
    arcTestnet.nativeCurrency.symbol
  }`;
}

function formatSendError(error, fallback) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("rejected the request")
  ) {
    return "Transaction rejected by user.";
  }

  if (normalized.includes("insufficient")) {
    return "Insufficient USDC balance.";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("chain") ||
    normalized.includes("unsupported")
  ) {
    return "Wrong network, please switch to Arc Testnet.";
  }

  return fallback;
}

async function getTransferContext(connector, sender, recipient, amount) {
  const injectedProvider = await connector.getProvider();
  const provider = new BrowserProvider(injectedProvider);
  const signer = await provider.getSigner();
  const contract = new Contract(ARC_USDC_ERC20_ADDRESS, USDC_ABI, signer);
  const decimals = Number(await contract.decimals());
  const parsedAmount = parseUnits(amount, decimals);
  const balance = await contract.balanceOf(sender);

  return {
    provider,
    signer,
    contract,
    decimals,
    parsedAmount,
    balance
  };
}

export default function SendUsdcPanel({
  walletSnapshot,
  onActivitySaved,
  onActivityUpdated
}) {
  const { connector } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [result, setResult] = useState(null);

  const recipientValid = Boolean(recipient) && isAddress(recipient);
  const amountValue = Number(amount || 0);
  const amountValid = Number.isFinite(amountValue) && amountValue > 0;
  const isSignedIn = walletSnapshot?.isSignedIn;
  const needsArcSwitch = isSignedIn && chainId !== arcTestnet.id;
  const feeReady = Boolean(estimate);

  useEffect(() => {
    setEstimate(null);
    setResult(null);
    setError("");
    setStatus("idle");
  }, [recipient, amount]);

  const explorerUrl = useMemo(
    () => (result?.hash ? `${arcTestnet.blockExplorers.default.url}/tx/${result.hash}` : ""),
    [result]
  );

  const ensureArcNetwork = async () => {
    if (chainId === arcTestnet.id || !switchChainAsync) {
      return;
    }

    await switchChainAsync({ chainId: arcTestnet.id });
  };

  const validateTransfer = async () => {
    if (!connector || !isSignedIn) {
      throw new Error("Wallet not connected.");
    }

    if (needsArcSwitch) {
      throw new Error("Wrong network, please switch to Arc Testnet.");
    }

    if (!recipientValid) {
      throw new Error("Invalid wallet address.");
    }

    if (!amountValid) {
      throw new Error("Enter valid USDC amount.");
    }

    const context = await getTransferContext(
      connector,
      walletSnapshot.address,
      recipient,
      amount
    );

    if (context.balance < context.parsedAmount) {
      throw new Error("Insufficient USDC balance.");
    }

    return context;
  };

  const estimateFee = async ({ silent = false } = {}) => {
    if (!recipientValid || !amountValid || !isSignedIn || needsArcSwitch || !connector) {
      return;
    }

    if (!silent) {
      setStatus("estimating");
    }
    setError("");

    try {
      const { contract, provider, parsedAmount } = await validateTransfer();
      const gasLimit = await contract.transfer.estimateGas(recipient, parsedAmount);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;

      if (!gasPrice) {
        throw new Error("RPC fee estimation failed.");
      }

      setEstimate({
        gasLimit,
        gasPrice,
        fee: gasLimit * gasPrice
      });
      setStatus("ready");
    } catch (nextError) {
      setEstimate(null);
      setStatus("error");
      setError(
        formatSendError(
          nextError,
          nextError instanceof Error && nextError.message
            ? nextError.message
            : "RPC fee estimation failed."
        )
      );
    }
  };

  useEffect(() => {
    if (!recipientValid || !amountValid || !isSignedIn || needsArcSwitch) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void estimateFee({ silent: true });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [recipient, amount, isSignedIn, needsArcSwitch]);

  const handleEstimate = async () => {
    if (!isSignedIn) {
      setError("Wallet not connected.");
      return;
    }

    if (needsArcSwitch) {
      try {
        await ensureArcNetwork();
      } catch {
        setError("Wrong network, please switch to Arc Testnet.");
        return;
      }
    }

    await estimateFee();
  };

  const handleSend = async (event) => {
    event.preventDefault();

    if (!feeReady) {
      return;
    }

    setStatus("sending");
    setError("");
    setResult(null);

    try {
      const { contract, parsedAmount } = await validateTransfer();
      const transaction = await contract.transfer(recipient, parsedAmount);
      setResult({ hash: transaction.hash });

      onActivitySaved?.(
        createWalletActionRecord({
          walletAddress: walletSnapshot.address,
          type: "Sent USDC",
          kind: "sent",
          amount: `${amount} USDC`,
          chain: arcTestnet.name,
          sender: walletSnapshot.address,
          receiver: recipient,
          recipient,
          status: "Pending",
          txHash: transaction.hash,
          explorerUrl: `${arcTestnet.blockExplorers.default.url}/tx/${transaction.hash}`,
          summary: `Sent ${amount} USDC to ${shortAddress(recipient)} on Arc Testnet.`,
          metadata: {
            token: "USDC",
            network: "Arc_Testnet"
          }
        })
      );

      setStatus("confirming");
      const receipt = await transaction.wait();
      const confirmed = receipt?.status === 1;
      onActivityUpdated?.(transaction.hash, {
        status: confirmed ? "Confirmed" : "Failed",
        blockNumber: Number(receipt?.blockNumber || 0)
      });
      setStatus(confirmed ? "success" : "error");

      if (!confirmed) {
        setError("Transaction failed.");
      }
    } catch (nextError) {
      setStatus("error");
      setError(formatSendError(nextError, "Unable to send USDC."));
    }
  };

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="section-kicker">USDC Transfer</p>
          <h2>Send USDC on Arc Testnet</h2>
        </div>
        <span className="status-badge">
          {!isSignedIn
            ? "Wallet required"
            : needsArcSwitch
              ? "Switch required"
              : status === "sending"
                ? "Sending USDC"
                : status === "confirming"
                  ? "Confirming transaction"
                  : "Ready"}
        </span>
      </div>

      {!isSignedIn ? (
        <div className="empty-state">
          <strong>Wallet not connected.</strong>
          <p>Connect your wallet to send real Arc Testnet USDC.</p>
        </div>
      ) : (
        <>
          <div className="wallet-summary-grid">
            <div className="wallet-summary-item">
              <span className="field-label">Sender</span>
              <strong>{walletSnapshot.address}</strong>
            </div>
            <div className="wallet-summary-item">
              <span className="field-label">Token being sent</span>
              <strong>USDC</strong>
            </div>
            <div className="wallet-summary-item">
              <span className="field-label">USDC balance</span>
              <strong>{walletSnapshot.usdcBalance || "Syncing..."}</strong>
            </div>
            <div className="wallet-summary-item">
              <span className="field-label">Estimated gas units</span>
              <strong>{estimate ? estimate.gasLimit.toString() : "Estimate first"}</strong>
            </div>
            <div className="wallet-summary-item">
              <span className="field-label">Estimated network fee</span>
              <strong>{estimate ? formatGasFee(estimate.fee) : "Estimate first"}</strong>
            </div>
          </div>

          <form className="composer-form" onSubmit={handleSend}>
            <label className="composer-field">
              <span className="field-label">Receiver address</span>
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value.trim())}
                placeholder="0x..."
                className="composer-input"
              />
            </label>

            <label className="composer-field">
              <span className="field-label">USDC Amount</span>
              <input
                value={amount}
                onChange={(event) => setAmount(normalizeAmount(event.target.value))}
                inputMode="decimal"
                placeholder="1.00"
                className="composer-input"
              />
            </label>

            <div className="empty-state empty-state-compact">
              <strong>Transaction check</strong>
              <p>
                {!recipientValid
                  ? "Invalid wallet address."
                  : !amountValid
                    ? "Enter valid USDC amount."
                    : needsArcSwitch
                      ? "Wrong network, please switch to Arc Testnet."
                      : !feeReady
                        ? "Estimate the real Arc network fee before sending."
                        : "This will submit a real Arc Testnet USDC transfer after wallet confirmation."}
              </p>
            </div>

            <div className="composer-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={handleEstimate}
                disabled={status === "estimating" || status === "sending" || status === "confirming"}
              >
                {status === "estimating" ? "Estimating fee..." : "Estimate Fee"}
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={
                  !recipientValid ||
                  !amountValid ||
                  !feeReady ||
                  needsArcSwitch ||
                  status === "estimating" ||
                  status === "sending" ||
                  status === "confirming" ||
                  isSwitchingChain
                }
              >
                {status === "sending"
                  ? "Sending USDC..."
                  : status === "confirming"
                    ? "Confirming transaction..."
                    : "Send USDC"}
              </button>
            </div>
          </form>
        </>
      )}

      {error ? (
        <div className="empty-state empty-state-compact">
          <strong>Send unavailable</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {result?.hash ? (
        <div className="empty-state empty-state-compact">
          <strong>{status === "success" ? "USDC sent" : "Transaction submitted"}</strong>
          <p>
            {amount} USDC to {shortAddress(recipient)}
          </p>
          <code>{result.hash}</code>
          {explorerUrl ? (
            <a href={explorerUrl} target="_blank" rel="noreferrer">
              View transaction on ArcScan
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
