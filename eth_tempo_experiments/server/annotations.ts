/**
 * KEY CONCEPT annotations for each action.
 * These are displayed in highlighted boxes in the interaction log
 * to teach users what makes Tempo different from a vanilla EVM chain.
 */

export const annotations = {
  setup: {
    accounts: [
      "Tempo accounts don't need ETH or any native gas token. There IS no native token. Gas fees are paid in stablecoins (like AlphaUSD) directly.",
    ],
    faucet: [
      "The faucet sends AlphaUSD — a TIP-20 stablecoin. TIP-20 extends ERC-20 with memos, sponsorship, and 6 decimals (like USDC, not 18 like ETH).",
    ],
    balance: [
      "TIP-20 tokens use 6 decimals (like USDC), not 18 (like ETH). Amount 4000000 = $4.00. This matches real-world stablecoin conventions.",
      "This is a standard ERC-20 balanceOf call — TIP-20 extends ERC-20, so all existing ERC-20 tooling works out of the box.",
    ],
  },

  send: {
    memo: [
      "The memo traveled ON-CHAIN as part of the transfer — not in a separate transaction or off-chain database. This is native to TIP-20.",
    ],
    fee: [
      "Fee was paid in AlphaUSD $$$ (a stablecoin), not a native gas token. Tempo has NO native token. The Fee AMM converts between stablecoins if the validator wants a different one.",
    ],
    lane: [
      "This tx landed in the PAYMENT LANE — reserved blockspace that can't be consumed by other activity. Even if the chain is congested from DeFi or NFT activity, this payment goes through.",
    ],
    comparison: [
      "COMPARISON TO ETHEREUM:",
      "On Ethereum, you'd need a separate gas token (ETH) to send USDC.",
      "There's no memo field — you'd need a custom contract or event.",
      "No guaranteed blockspace — your tx competes with everything else.",
    ],
  },

  sponsored: {
    concept: [
      "Fee sponsorship is native to Tempo's transaction type. The sender and fee payer are cryptographically separate — Alice never needs to hold extra tokens for gas.",
      "On Ethereum, this requires ERC-4337 (account abstraction) with a bundler and paymaster contract. On Tempo, it's a field on the transaction.",
    ],
    signatures: [
      "Two-signature model: the sender signs the payment intent, and the sponsor signs the fee authorization. Both are combined into a single Tempo Transaction.",
    ],
  },

  batch: {
    concept: [
      "Three payments, one transaction, one fee. If this were Ethereum, you'd need 3 separate transactions (3x gas) or a custom multicall contract.",
      "On Tempo, batching is native to the transaction type. Atomic execution means no partial failures — critical for payroll where you can't have 2 of 3 employees get paid.",
    ],
  },

  history: {
    concept: [
      "The memo field is INDEXED in the event, meaning you can filter by memo value directly. An exchange could query all deposits with a specific customer ID without scanning every transfer event.",
      "This is how TIP-20 enables payment reconciliation natively — no off-chain database needed to match payments to invoices.",
    ],
  },

  swap: {
    concept: [
      "The DEX is enshrined — it's a precompile (built into the chain), not a deployed contract. It uses an orderbook model (not AMM like Uniswap).",
      "pathUSD is the quote token — all stablecoin pairs trade against it. This is also how the Fee AMM enables cross-stablecoin fee payment.",
    ],
  },

  schedule: {
    concept: [
      "Native scheduling — no external cron job or keeper network needed. The transaction has a validAfter timestamp and sits in the mempool until the time window opens.",
    ],
  },
} as const;
