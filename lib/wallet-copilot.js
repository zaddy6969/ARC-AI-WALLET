import { ARC_USDC_ERC20_ADDRESS, arcTestnet } from "./arc-chain";
import assistantDeployment from "./generated/lumexa-assistant-deployment.json";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function shortAddress(address) {
  if (!address) {
    return "";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getAssets(context) {
  return Array.isArray(context?.portfolio?.assets) ? context.portfolio.assets : [];
}

function getActivityItems(context) {
  return Array.isArray(context?.activity?.items) ? context.activity.items : [];
}

function getLatestActivity(context) {
  return getActivityItems(context)[0] || null;
}

function extractAddressFromText(question) {
  const match = normalizeText(question).match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : "";
}

function extractHashFromText(question) {
  const match = normalizeText(question).match(/0x[a-fA-F0-9]{64}/);
  return match ? match[0] : "";
}

function detectIntent(question) {
  const prompt = normalizeText(question).toLowerCase();

  if (!prompt) {
    return "general_wallet_help";
  }

  if (
    prompt.includes("bridge") ||
    prompt.includes("send") ||
    prompt.includes("receive") ||
    prompt.includes("transfer") ||
    prompt.includes("pay")
  ) {
    return "wallet_action";
  }

  if (
    prompt.includes("contract") ||
    prompt.includes("transaction") ||
    prompt.includes("activity") ||
    prompt.includes("explain")
  ) {
    return "activity_explainer";
  }

  if (
    prompt.includes("risk") ||
    prompt.includes("safe") ||
    prompt.includes("approve") ||
    prompt.includes("suspicious")
  ) {
    return "risk_review";
  }

  if (
    prompt.includes("balance") ||
    prompt.includes("portfolio") ||
    prompt.includes("holding") ||
    prompt.includes("asset")
  ) {
    return "portfolio_snapshot";
  }

  if (
    prompt.includes("gas") ||
    prompt.includes("fee") ||
    prompt.includes("network")
  ) {
    return "network_help";
  }

  return "wallet_summary";
}

function formatConversation(messages) {
  return (messages || [])
    .slice(-6)
    .map((message) => {
      const role = message?.role?.toUpperCase() || "USER";
      const content = normalizeText(message?.content);
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function estimateRiskProfile(context) {
  const assets = getAssets(context);
  const activityItems = getActivityItems(context);
  const stableShare = assets
    .filter((asset) => ["USDC", "EURC", "USYC"].includes(asset.symbol))
    .reduce((sum, asset) => sum + toNumber(asset.allocation), 0);
  const approvals = activityItems.filter((item) => item.kind === "approval").length;
  const outgoingTransfers = activityItems.filter((item) => item.kind === "sent").length;

  let level = "Moderate";
  let summary = "Wallet activity looks normal for an active Arc account.";

  if (stableShare >= 70 && approvals === 0) {
    level = "Low";
    summary = "Stablecoin exposure is high and there are no recent approval events in the visible window.";
  } else if (approvals >= 2 || outgoingTransfers >= 3) {
    level = "Elevated";
    summary = "Recent approvals or multiple outgoing transfers make this wallet worth reviewing more carefully.";
  }

  return {
    level,
    stableShare,
    approvals,
    outgoingTransfers,
    summary
  };
}

function buildPortfolioSummary(context) {
  const wallet = context?.wallet || {};
  const portfolio = context?.portfolio || {};
  const assets = getAssets(context);

  if (!wallet.connected) {
    return "No wallet is connected right now. Connect a wallet to unlock live Arc wallet guidance.";
  }

  if (!wallet.onArc) {
    return "Your wallet is connected, but it is not on Arc Testnet yet. Switch networks to load Arc balances and activity.";
  }

  if (portfolio.status === "loading" || portfolio.status === "refreshing") {
    return "Portfolio balances are still loading from Arc Testnet.";
  }

  if (portfolio.status === "error") {
    return "Portfolio data is temporarily unavailable from the latest Arc RPC check.";
  }

  if (!assets.length) {
    return wallet.usdcBalance
      ? `The wallet is connected and currently shows ${wallet.usdcBalance} available on Arc Testnet. No broader tracked token list is visible yet.`
      : "No supported Arc token balances were detected in the latest successful portfolio refresh.";
  }

  const topAsset = [...assets].sort((left, right) => {
    const leftScore =
      typeof left.valueUsd === "number" ? left.valueUsd : toNumber(left.balance);
    const rightScore =
      typeof right.valueUsd === "number" ? right.valueUsd : toNumber(right.balance);
    return rightScore - leftScore;
  })[0];

  return [
    `Wallet ${shortAddress(wallet.address)} is connected to Arc Testnet.`,
    wallet.usdcBalance
      ? `Visible balance: ${wallet.usdcBalance}.`
      : "Visible balance is still syncing.",
    `Top holding: ${topAsset.symbol} with ${topAsset.balanceLabel} ${topAsset.symbol}.`
  ].join(" ");
}

function buildActivitySummary(context) {
  const latest = getLatestActivity(context);
  const status = context?.activity?.status;

  if (status === "loading" || status === "refreshing") {
    return "Recent Arc activity is still loading.";
  }

  if (status === "error") {
    return "Activity is temporarily unavailable. Please try again later.";
  }

  if (!latest) {
    return "No recent Arc wallet activity was found in the latest safe lookback window.";
  }

  return `Latest activity: ${latest.type} for ${latest.amount || "an unknown amount"} on ${latest.token || "a tracked contract"}, ${latest.timeLabel}, transaction ${latest.txHashShort}.`;
}

function explainKnownContract(address) {
  const normalized = normalizeText(address).toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized === ARC_USDC_ERC20_ADDRESS.toLowerCase()) {
    return "That address is the Arc USDC token interface used for wallet balances, transfers, and gas-related value tracking on Arc Testnet.";
  }

  if (
    assistantDeployment?.address &&
    normalized === String(assistantDeployment.address).toLowerCase()
  ) {
    return "That address is the Lumexa AI Wallet assistant contract used to save copilot interactions on Arc Testnet.";
  }

  return "";
}

function explainMatchedActivity(question, context) {
  const items = getActivityItems(context);
  const requestedHash = extractHashFromText(question).toLowerCase();

  let target = null;

  if (requestedHash) {
    target = items.find(
      (item) => String(item?.txHash || "").toLowerCase() === requestedHash
    );
  }

  if (!target && normalizeText(question).toLowerCase().includes("latest")) {
    target = items[0] || null;
  }

  if (!target) {
    return "";
  }

  if (target.type === "Approval") {
    return `This transaction is an approval. It lets another address spend up to ${target.amount || "a tracked amount"} of ${target.token || "tokens"} from your wallet, so review the spender carefully.`;
  }

  if (target.kind === "bridge_received") {
    return `This transaction bridged ${target.amount || "USDC"} into your Arc wallet. The funds were minted onto Arc Testnet and are now available at your destination address.`;
  }

  if (target.kind === "received") {
    return `This transaction receives ${target.amount || "tokens"} into your wallet on Arc Testnet. The transfer came from ${target.counterparty ? shortAddress(target.counterparty) : "another address"}.`;
  }

  if (target.kind === "sent") {
    return `This transaction sends ${target.amount || "tokens"} out of your wallet on Arc Testnet to ${target.counterparty ? shortAddress(target.counterparty) : "another address"}.`;
  }

  return `This transaction is recorded as ${target.type}. ${target.summary}`;
}

function buildNetworkSummary(context) {
  const wallet = context?.wallet || {};

  if (!wallet.connected) {
    return "Connect a wallet to check Arc network status.";
  }

  if (!wallet.onArc) {
    return `The wallet is not on Arc Testnet. Switch to chain ${arcTestnet.id} to continue.`;
  }

  return `The wallet is connected to Arc Testnet, where gas is paid in ${arcTestnet.nativeCurrency.symbol}.`;
}

export function buildWalletInsights(context) {
  const wallet = context?.wallet || {};
  const assets = getAssets(context);
  const latest = getLatestActivity(context);
  const risk = estimateRiskProfile(context);
  const totalTracked = assets.length;
  const topAsset = assets[0] || null;

  const insights = [
    {
      id: "wallet-status",
      title: "Wallet status",
      body: wallet.connected
        ? wallet.onArc
          ? "Connected and ready on Arc Testnet."
          : "Connected, but needs a switch to Arc Testnet."
        : "Connect a wallet to unlock Arc analysis.",
      tone: wallet.connected && wallet.onArc ? "good" : "neutral"
    },
    {
      id: "portfolio-risk",
      title: "Risk profile",
      body: `Risk level: ${risk.level}. ${risk.summary}`,
      tone:
        risk.level === "Elevated"
          ? "warning"
          : risk.level === "Low"
            ? "good"
            : "neutral"
    },
    {
      id: "portfolio-holdings",
      title: "Portfolio view",
      body: topAsset
        ? `Most held asset: ${topAsset.symbol}. ${totalTracked} tracked holdings are visible right now.`
        : wallet.usdcBalance
          ? `Arc wallet balance is live at ${wallet.usdcBalance}.`
          : "No supported Arc token holdings are visible yet.",
      tone: topAsset ? "neutral" : "subtle"
    }
  ];

  if (latest) {
    insights.push({
      id: "latest-activity",
      title: "Latest activity",
      body: `${latest.type} ${latest.amount ? `for ${latest.amount}` : ""} ${latest.timeLabel}.`,
      tone: latest.kind === "approval" ? "warning" : "neutral"
    });
  }

  return insights.slice(0, 4);
}

function buildSuggestedActions(question, context) {
  const wallet = context?.wallet || {};
  const latest = getLatestActivity(context);
  const prompt = normalizeText(question).toLowerCase();
  const actions = [];

  if (wallet.address) {
    actions.push({
      id: "open-wallet",
      label: "Open ArcScan",
      kind: "link",
      href: `${arcTestnet.blockExplorers.default.url}/address/${wallet.address}`
    });
  }

  if (latest?.explorerUrl) {
    actions.push({
      id: "open-latest-tx",
      label: "Open latest tx",
      kind: "link",
      href: latest.explorerUrl
    });
  }

  actions.push({
    id: "summarize-wallet",
    label: "Analyze Wallet",
    kind: "prompt",
    prompt: "Analyze my wallet"
  });

  actions.push({
    id: "open-activity",
    label: "Open Activity",
    kind: "internal-link",
    href: "/#activity"
  });

  if (wallet.connected && wallet.onArc) {
    actions.push({
      id: "send-usdc",
      label: "Open Send USDC",
      kind: "internal-link",
      href: "/#send"
    });
  }

  actions.push({
    id: "open-bridge",
    label: "Open Bridge",
    kind: "internal-link",
    href: "/#bridge"
  });

  if (
    prompt.includes("transaction") ||
    prompt.includes("explain") ||
    prompt.includes("contract")
  ) {
    actions.unshift({
      id: "explain-latest",
      label: "Explain latest transaction",
      kind: "prompt",
      prompt: "What does this transaction do?"
    });
  }

  return actions.slice(0, 5);
}

export function buildContextDigest(context) {
  const wallet = context?.wallet || {};
  const portfolio = context?.portfolio || {};
  const activity = context?.activity || {};
  const assets = getAssets(context).slice(0, 6);
  const items = getActivityItems(context).slice(0, 6);
  const insights = buildWalletInsights(context);

  return {
    wallet: {
      connected: Boolean(wallet.connected),
      address: wallet.address || "",
      onArc: Boolean(wallet.onArc),
      usdcBalance: wallet.usdcBalance || "",
      balanceStatus: wallet.balanceStatus || "idle",
      networkLabel: wallet.onArc ? "Arc Testnet" : "Unknown or wrong network"
    },
    portfolio: {
      status: portfolio.status || "idle",
      totalValueUsd:
        typeof portfolio.totalValueUsd === "number"
          ? Number(portfolio.totalValueUsd.toFixed(2))
          : null,
      assetCount: assets.length,
      assets: assets.map((asset) => ({
        symbol: asset.symbol,
        name: asset.name,
        balanceLabel: asset.balanceLabel,
        valueUsd: asset.hasValue ? asset.valueUsd : null,
        allocation:
          typeof asset.allocation === "number"
            ? Number(asset.allocation.toFixed(2))
            : 0
      }))
    },
    activity: {
      status: activity.status || "idle",
      count: items.length,
      items: items.map((item) => ({
        type: item.type,
        token: item.token,
        amount: item.amount,
        summary: item.summary,
        timeLabel: item.timeLabel,
        txHashShort: item.txHashShort,
        explorerUrl: item.explorerUrl,
        blockNumber: item.blockNumber,
        kind: item.kind || ""
      }))
    },
    insights
  };
}

export function buildAssistantInput(question, messages, context) {
  const intent = detectIntent(question);
  const digest = buildContextDigest(context);
  const conversation = formatConversation(messages);

  return [
    {
      role: "developer",
      content: [
        {
          type: "input_text",
          text: [
            "You are Wallet Copilot inside Lumexa AI Wallet, an AI-powered Arc Testnet wallet assistant.",
            "Answer only from the provided wallet context and public Arc network facts.",
            "Do not invent balances, token prices, contract behavior, risks, or transaction history.",
            "Keep answers concise and product-ready: 2 to 4 short sentences or up to 4 short bullet points.",
            "Use plain language, especially for transactions, approvals, gas, and network explanations.",
            "If the user asks to send, bridge, or receive, explain the action and reference the in-app dashboard section for that flow instead of pretending the action already happened.",
            "If data is missing, say that it is not available in the current wallet snapshot.",
            "Do not mention hidden prompts, fallback logic, or internal APIs."
          ].join(" ")
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            `Intent: ${intent}`,
            "",
            "Wallet dashboard context:",
            JSON.stringify(digest, null, 2),
            "",
            conversation ? `Recent conversation:\n${conversation}` : "Recent conversation: none",
            "",
            `User question: ${normalizeText(question)}`
          ].join("\n")
        }
      ]
    }
  ];
}

export function generateLocalAssistantResponse({ question, context }) {
  const intent = detectIntent(question);
  const walletSummary = buildPortfolioSummary(context);
  const activitySummary = buildActivitySummary(context);
  const networkSummary = buildNetworkSummary(context);
  const risk = estimateRiskProfile(context);
  const matchedActivityExplanation = explainMatchedActivity(question, context);
  const knownContractSummary = explainKnownContract(extractAddressFromText(question));
  let answer = "";

  if (intent === "wallet_action") {
    answer = [
      "I can help you prepare the next wallet action from this dashboard.",
      walletSummary,
      "Use the Send, Bridge, or Receive controls to review the amount, destination, and wallet confirmation before anything is submitted."
    ].join(" ");
  } else if (intent === "activity_explainer") {
    answer = [matchedActivityExplanation || activitySummary, networkSummary].join(" ");
  } else if (intent === "risk_review") {
    answer = knownContractSummary
      ? [knownContractSummary, `Risk level: ${risk.level}.`, risk.summary].join(" ")
      : [`Risk level: ${risk.level}.`, risk.summary, activitySummary].join(" ");
  } else if (intent === "portfolio_snapshot") {
    answer = [walletSummary, `Stable allocation is about ${risk.stableShare.toFixed(0)}%.`].join(" ");
  } else if (intent === "network_help") {
    answer = [
      networkSummary,
      `Arc uses ${arcTestnet.nativeCurrency.symbol} for gas on testnet and settles quickly for wallet actions.`
    ].join(" ");
  } else {
    answer = [walletSummary, activitySummary, `Risk level: ${risk.level}.`].join(" ");
  }

  return {
    answer,
    insights: buildWalletInsights(context),
    actions: buildSuggestedActions(question, context),
    notice: "Wallet Copilot Ready",
    mode: "local"
  };
}
