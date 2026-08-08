import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { getPrimaryExplorerUrl, getPrimaryTxHash } from "../lib/arc-app-kit";
import { ARC_BRIDGE_DESTINATION, ARC_BRIDGE_SOURCE_OPTIONS } from "../lib/arc-chain";
import {
  createArcBridgeClient,
  formatBridgeError,
  summarizeBridgeFees
} from "../lib/arc-bridge";
import { createWalletActionRecord } from "../lib/local-activity";

function cleanAmount(value) {
  const next = String(value || "").replace(/[^\d.]/g, "");
  const [whole, ...rest] = next.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 6)}` : whole;
}

function validAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function sourceFromId(chainId) {
  return ARC_BRIDGE_SOURCE_OPTIONS.find((item) => item.id === Number(chainId)) || ARC_BRIDGE_SOURCE_OPTIONS[0];
}

async function verifyProviderChain(provider, expectedChainId) {
  if (!provider?.request) return;
  const value = await provider.request({ method: "eth_chainId" });
  const active = typeof value === "string" ? Number.parseInt(value, 16) : Number(value);
  if (active !== expectedChainId) {
    throw new Error("Wallet did not switch to the selected source network.");
  }
}

export default function BridgeToArcPanel({ walletSnapshot, onActivitySaved }) {
  const { connector } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const connectedAddress = walletSnapshot?.address || "";
  const supportedCurrentSource = ARC_BRIDGE_SOURCE_OPTIONS.some((item) => item.id === currentChainId);

  const [sourceChainId, setSourceChainId] = useState(
    supportedCurrentSource ? currentChainId : ARC_BRIDGE_SOURCE_OPTIONS[0].id
  );
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState("idle");
  const [estimate, setEstimate] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const sourceChain = useMemo(() => sourceFromId(sourceChainId), [sourceChainId]);
  const feeRows = useMemo(() => summarizeBridgeFees(estimate).slice(0, 4), [estimate]);
  const txHash = useMemo(() => getPrimaryTxHash(result), [result]);
  const explorerUrl = useMemo(() => getPrimaryExplorerUrl(result), [result]);
  const canContinue = Boolean(connector && connectedAddress && validAmount(amount));

  useEffect(() => {
    if (
      ARC_BRIDGE_SOURCE_OPTIONS.some((item) => item.id === currentChainId) &&
      status !== "bridging"
    ) {
      setSourceChainId(currentChainId);
    }
  }, [currentChainId, status]);

  const resetQuote = () => {
    setEstimate(null);
    setResult(null);
    setError("");
    setStatus("idle");
  };

  const getReadyProvider = async () => {
    if (!connector) throw new Error("Connect your wallet first.");

    if (currentChainId !== sourceChain.id) {
      setStatus("switching");
      await switchChainAsync({ chainId: sourceChain.id });
    }

    const provider = await connector.getProvider();
    if (!provider) throw new Error("Wallet provider is unavailable.");
    await verifyProviderChain(provider, sourceChain.id);
    return provider;
  };

  const createQuote = async () => {
    if (!canContinue) throw new Error("Enter a valid USDC amount.");

    const provider = await getReadyProvider();
    setStatus("estimating");
    const bridgeClient = await createArcBridgeClient(provider);
    const nextEstimate = await bridgeClient.kit.estimateBridge({
      from: {
        adapter: bridgeClient.adapter,
        chain: sourceChain.appKitChain
      },
      to: {
        adapter: bridgeClient.adapter,
        chain: ARC_BRIDGE_DESTINATION.appKitChain,
        recipientAddress: connectedAddress
      },
      amount
    });

    setEstimate(nextEstimate);
    setStatus("ready");
    return { bridgeClient, provider };
  };

  const handleReview = async () => {
    setError("");
    setResult(null);

    try {
      await createQuote();
    } catch (nextError) {
      setEstimate(null);
      setStatus("error");
      setError(formatBridgeError(nextError));
    }
  };

  const handleBridge = async () => {
    if (!canContinue) return;

    setError("");
    setResult(null);

    try {
      let bridgeClient;

      if (!estimate) {
        ({ bridgeClient } = await createQuote());
      } else {
        const provider = await getReadyProvider();
        bridgeClient = await createArcBridgeClient(provider);
      }

      setStatus("bridging");
      const nextResult = await bridgeClient.kit.bridge({
        from: {
          adapter: bridgeClient.adapter,
          chain: sourceChain.appKitChain
        },
        to: {
          adapter: bridgeClient.adapter,
          chain: ARC_BRIDGE_DESTINATION.appKitChain,
          recipientAddress: connectedAddress
        },
        amount
      });

      setResult(nextResult);

      if (nextResult?.state === "error") {
        setStatus("error");
        setError("Bridge could not be completed. Check your source USDC and source-chain gas, then try again.");
        return;
      }

      setStatus(nextResult?.state === "success" ? "success" : "submitted");
      onActivitySaved?.(
        createWalletActionRecord({
          walletAddress: connectedAddress,
          type: "Bridge",
          amount: `${amount} USDC`,
          chain: `${sourceChain.name} -> ${ARC_BRIDGE_DESTINATION.name}`,
          recipient: connectedAddress,
          status: nextResult?.state === "success" ? "Confirmed" : "Submitted",
          txHash: getPrimaryTxHash(nextResult),
          explorerUrl: getPrimaryExplorerUrl(nextResult),
          summary: `Bridged ${amount} USDC from ${sourceChain.name} to Arc Testnet.`
        })
      );
    } catch (nextError) {
      setStatus("error");
      setError(formatBridgeError(nextError));
    }
  };

  const busy = isSwitching || ["switching", "estimating", "bridging"].includes(status);

  return (
    <section className="bridge-wallet-card wallet-page-card">
      <div className="bridge-wallet-head">
        <div>
          <h2>Bridge USDC</h2>
          <p>{sourceChain.shortName} → Arc</p>
        </div>
        <span className="bridge-destination-pill">Arc Testnet</span>
      </div>

      <div className="bridge-route-box">
        <div className="bridge-network-select">
          <span>From</span>
          <div className="bridge-source-options">
            {ARC_BRIDGE_SOURCE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.id}
                className={option.id === sourceChainId ? "is-active" : ""}
                onClick={() => {
                  setSourceChainId(option.id);
                  resetQuote();
                }}
                disabled={busy}
              >
                {option.shortName}
              </button>
            ))}
          </div>
        </div>

        <div className="bridge-arrow" aria-hidden="true">↓</div>

        <div className="bridge-network-fixed">
          <span>To</span>
          <strong>Arc Testnet</strong>
        </div>
      </div>

      <label className="bridge-amount-field">
        <span>Amount</span>
        <div>
          <input
            value={amount}
            onChange={(event) => {
              setAmount(cleanAmount(event.target.value));
              resetQuote();
            }}
            inputMode="decimal"
            placeholder="0.00"
          />
          <strong>USDC</strong>
        </div>
      </label>

      <div className="bridge-recipient-row">
        <span>Receive on Arc</span>
        <strong>{connectedAddress ? `${connectedAddress.slice(0, 6)}…${connectedAddress.slice(-4)}` : "Connect wallet"}</strong>
      </div>

      {estimate ? (
        <div className="bridge-quote">
          <div><span>Route</span><strong>{sourceChain.shortName} → Arc</strong></div>
          {feeRows.map((fee, index) => (
            <div key={`${fee.label}-${index}`}><span>{fee.label}</span><strong>{fee.value}</strong></div>
          ))}
        </div>
      ) : null}

      {error ? <p className="bridge-error" role="alert">{error}</p> : null}

      {status === "success" || status === "submitted" ? (
        <div className="bridge-success">
          <strong>{status === "success" ? "Bridge complete" : "Bridge submitted"}</strong>
          {txHash ? <span>{txHash.slice(0, 10)}…{txHash.slice(-6)}</span> : null}
          {explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer">View transaction</a> : null}
        </div>
      ) : null}

      <div className="bridge-actions">
        {!estimate ? (
          <button type="button" className="button button-primary" onClick={handleReview} disabled={!canContinue || busy}>
            {status === "switching" || isSwitching ? `Switching to ${sourceChain.shortName}…` : status === "estimating" ? "Getting quote…" : "Review bridge"}
          </button>
        ) : (
          <button type="button" className="button button-primary" onClick={handleBridge} disabled={!canContinue || busy}>
            {status === "bridging" ? "Confirm in wallet…" : `Bridge ${amount} USDC`}
          </button>
        )}
      </div>

      <p className="bridge-footnote">Source wallet needs test USDC and source-chain gas.</p>
    </section>
  );
}
