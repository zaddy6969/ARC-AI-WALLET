# Lumexa AI Wallet

Lumexa AI Wallet is a self-custodial USDC wallet built on Arc and enhanced with AI-assisted wallet actions.

## What it includes

- single-page `Dashboard`
- real `Send USDC`
- real `Receive`
- real `Bridge USDC to Arc`
- integrated `Lumexa AI Agent`
- live `Activity`

The app uses Lumexa as the product brand while Arc remains the underlying network and infrastructure.

## Stack

- Next.js
- React
- RainbowKit
- wagmi
- viem
- Arc App Kit
- OpenAI API

## Routes

- `/` single-page dashboard for all wallet actions
- `/send`, `/bridge`, `/assistant`, `/activity` redirect back to the matching dashboard view for backward compatibility
- `/unified-balance` redirects home because Unified Balance has been removed from the product

## Environment variables

Copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_SITE_URL=https://arc-ai-wallet.vercel.app
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_TESTNET_USDC_ADDRESS=0x3600000000000000000000000000000000000000
NEXT_PUBLIC_ARC_TESTNET_EURC_ADDRESS=0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
NEXT_PUBLIC_ARC_TESTNET_CIRBTC_ADDRESS=0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-mini
```

Notes:

- `OPENAI_API_KEY` is only used server-side through `/api/ai`
- do not put private keys or seed phrases in frontend env vars
- `KIT_KEY` is intentionally not used by the public dashboard today because a secure
  browser-wallet Swap flow needs a larger architecture change before launch

## Local development

```bash
npm install
npm run build
npm run dev
```

Open:

- `http://localhost:3000`

## How to test

### 1. Dashboard

1. Open `/`
2. Connect a wallet with MetaMask or WalletConnect
3. Confirm the wallet address, Arc Testnet status, and USDC balance appear

### 2. Send USDC

1. Open `/`
2. Connect wallet and switch to Arc Testnet
3. Open the `Send` tab
4. Enter a recipient and USDC amount
5. Click `Estimate Fee`
6. Click `Send USDC`
7. Confirm in wallet
8. Check the ArcScan transaction link and then confirm the action appears in the `Activity` tab

### 3. Bridge USDC

1. Open `/`
2. Connect wallet
3. Open the `Bridge` tab
4. Choose `Ethereum Sepolia` or `Base Sepolia`
5. Enter amount and recipient
6. Click `Estimate Bridge`
7. Click `Bridge USDC to Arc`
8. Confirm in wallet
9. Check the step feed and ArcScan/explorer links
10. Confirm the bridge action appears in the `Activity` tab

### 4. Lumexa AI Agent

1. Open `/`
2. Open the Lumexa AI Agent panel
3. Connect wallet for live context, or ask general Arc/App Kit questions without connecting
4. Ask:
   - `Analyze my wallet`
   - `How much USDC do I have?`
   - `Show recent activity`
   - `Explain Arc USDC gas`
5. If `OPENAI_API_KEY` is missing, the assistant falls back to local wallet guidance

### 5. Activity

1. Open `/`
2. Open the `Activity` tab
3. Confirm real wallet events appear for:
   - `Sent USDC`
   - `Received USDC`
   - `Bridge received`
   - `Approval`
4. Confirm in-app Send and Bridge actions are matched to live Arc activity when the tx hash is available

## Deployment

1. Push `main` to GitHub
2. Import the repo into Vercel
3. Set these Vercel environment variables:
   - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
   - `NEXT_PUBLIC_SITE_URL`
   - `NEXT_PUBLIC_ARC_RPC_URL`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
4. Redeploy

## Arc config

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Gas token: `USDC`
- Faucet: `https://faucet.circle.com`
