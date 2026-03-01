# Tempo Explorer — Implementation Spec

A local web app for learning Tempo by doing. Trigger wallet actions, watch the blockchain mechanics unfold in real time.

---

## 1. Project Overview

**What it is:** A two-panel web app. Left panel has action buttons (create account, send payment, etc.). Right panel is a real-time interaction log that shows every RPC call, contract interaction, transaction field, and receipt — decoded and annotated with explanations of what makes Tempo different from a vanilla EVM chain.

**What it is not:** A production wallet. No real money. No actual security. Accounts are throwaway testnet accounts stored in memory.

**Stack:**
- Backend: TypeScript, Hono (lightweight HTTP + WebSocket server), Node.js
- Frontend: Single-page React app (Vite), minimal styling (Tailwind)
- Chain interaction: `viem` with Tempo extensions (`viem/tempo`, `viem/chains`)
- Target: Tempo Testnet (chain ID `42431`, RPC `https://rpc.moderato.tempo.xyz`)

---

## 2. Architecture

```
Browser (localhost:5173)                    Server (localhost:4000)
┌─────────────────────────────┐            ┌──────────────────────────────┐
│                             │            │                              │
│  ┌───────────┐ ┌─────────┐ │   REST +   │  Hono server                 │
│  │  Action   │ │Interact.│ │   WebSocket │                              │
│  │  Panel    │ │  Log    │ │◄──────────►│  InstrumentedClient          │
│  │           │ │         │ │            │  ├─ wraps viem client         │
│  │ [Create]  │ │ → tx... │ │            │  ├─ intercepts all RPC calls  │
│  │ [Send]    │ │ → conf..│ │            │  ├─ decodes tx fields         │
│  │ [Batch]   │ │ → ✓     │ │            │  └─ streams steps via WS     │
│  └───────────┘ └─────────┘ │            │                              │
└─────────────────────────────┘            │  AccountStore (in-memory)    │
                                           │  ├─ generated private keys   │
                                           │  └─ labels ("Alice", "Bob")  │
                                           │                              │
                                           │         viem + viem/tempo    │
                                           │              │               │
                                           └──────────────┼───────────────┘
                                                          │
                                                          ▼
                                              Tempo Testnet (42431)
                                              rpc.moderato.tempo.xyz
```

### Key design decision: Instrumented Client

The backend wraps viem's client with a logging layer. Every call to the RPC or SDK method gets intercepted and emits structured log events over WebSocket before/after execution. This is the core of the learning experience — you see the raw mechanics, not just the result.

```typescript
// Pseudocode for the instrumented wrapper
async function instrumentedCall(label: string, fn: () => Promise<any>, annotations: string[]) {
  ws.send({ type: 'step_start', label, timestamp: Date.now() })
  try {
    const result = await fn()
    ws.send({ type: 'step_complete', label, result: decode(result), annotations })
    return result
  } catch (err) {
    ws.send({ type: 'step_error', label, error: err.message })
    throw err
  }
}
```

---

## 3. Data Model

### LogEntry (streamed to frontend via WebSocket)

```typescript
type LogEntry = {
  id: string                    // unique ID for React keys
  timestamp: number
  action: string                // parent action ("send_payment", "create_account", etc.)
  type: 'info' | 'rpc_call' | 'rpc_result' | 'tx_built' | 'tx_submitted' |
        'tx_confirmed' | 'error' | 'annotation'
  label: string                 // human-readable step name
  data: Record<string, any>     // decoded fields (varies by type)
  annotations?: string[]        // "KEY CONCEPT" explanations
  indent?: number               // nesting level for visual hierarchy
}
```

### AccountState (server-side, in-memory)

```typescript
type Account = {
  label: string                 // "Alice", "Bob", "Merchant", "Sponsor"
  address: `0x${string}`
  privateKey: `0x${string}`
  balances: Record<string, bigint>  // token address → balance (refreshed on demand)
}
```

Pre-generated on startup:
- **Alice** — primary user account
- **Bob** — recipient for P2P payments
- **Merchant** — payment recipient with order ID memos
- **Sponsor** — fee payer account (funds gas for Alice)

All get faucet funds on first boot.

---

## 4. Actions (Build Order)

Each action is a REST endpoint that executes against testnet and streams log entries over WebSocket. The frontend just renders the log.

---

### Action 1: Setup — Create & Fund Accounts

**Endpoint:** `POST /api/setup`

**What happens:**
1. Generate 4 private keys using viem's `privateKeyToAccount`
2. Hit the testnet faucet for each account to get AlphaUSD
3. Read back balances via TIP-20 `balanceOf`

**Log output:**
```
→ Generating accounts...
  ┌ Alice:    0xAl1c...  (private key generated locally)
  ├ Bob:      0xB0b0...
  ├ Merchant: 0xMerc...
  └ Sponsor:  0xSp0n...

→ Requesting faucet funds for Alice...
  ┌ POST https://faucet.moderato.tempo.xyz (or equivalent)
  └ Response: 1000 AlphaUSD sent to 0xAl1c...

→ Reading Alice's balance...
  ┌ RPC: eth_call
  ├ to: 0x20c0000000000000000000000000000000000001 (AlphaUSD TIP-20)
  ├ function: balanceOf(0xAl1c...)
  ├ raw result: 0x00000000000000000000000000000000000000000000000000000000003d0900
  └ decoded: 4,000,000 (= 4.000000 USD, 6 decimals)

💡 TIP-20 tokens use 6 decimals (like USDC), not 18 (like ETH).
   Amount 4000000 = $4.00. This matches real-world stablecoin conventions.
```

**Tempo concepts taught:**
- No native gas token (accounts don't need ETH)
- TIP-20 uses 6 decimals
- AlphaUSD contract address: `0x20c0000000000000000000000000000000000001`

---

### Action 2: Check Balance

**Endpoint:** `POST /api/balance`

**What happens:**
1. Call `balanceOf` on the TIP-20 contract for each account
2. Show the raw RPC call and decoded result

**Log output:**
```
→ Reading balances via TIP-20 contract...
  ┌ contract: 0x20c0000000000000000000000000000000000001
  ├ standard: TIP-20 (extends ERC-20)
  ├ function: balanceOf(address) → uint256
  │
  ├ Alice:    1,000,000,000 raw = $1,000.00
  ├ Bob:      1,000,000,000 raw = $1,000.00
  ├ Merchant: 1,000,000,000 raw = $1,000.00
  └ Sponsor:  1,000,000,000 raw = $1,000.00

💡 This is a standard ERC-20 balanceOf call — TIP-20 extends ERC-20,
   so all existing ERC-20 tooling works out of the box.
```

---

### Action 3: Send Payment with Memo

**Endpoint:** `POST /api/send`
**Params:** `{ from: "alice", to: "bob", amount: "5.00", memo: "dinner last night" }`

**What happens:**
1. Encode the memo as bytes32 using `toHex(memo, { size: 32 })`
2. Build a `transferWithMemo` call on the TIP-20 contract
3. Sign and submit the transaction
4. Wait for receipt
5. Decode the `TransferWithMemo` event from the receipt

**Log output:**
```
→ Encoding memo...
  ┌ input: "dinner last night"
  ├ hex: 0x64696e6e6572206c617374206e69676874000000000000000000000000000000
  └ size: 32 bytes (padded with zeros)

→ Building TIP-20 transferWithMemo...
  ┌ contract: 0x20c0000000000000000000000000000000000001 (AlphaUSD)
  ├ function: transferWithMemo(to, amount, memo)
  ├ to: 0xB0b0... (Bob)
  ├ amount: 5000000 (= $5.00, 6 decimals)
  └ memo: 0x64696e6e6572206c617374206e69676874...

→ Signing transaction...
  ┌ signer: 0xAl1c... (Alice)
  ├ tx_type: Tempo Transaction (EIP-2718 type 0x42)
  ├ chain_id: 42431
  ├ fee_token: AlphaUSD ← Alice pays fee in the same stablecoin!
  └ max_fee: 0.000800 AlphaUSD (~$0.0008)

→ Submitting to Tempo testnet...
  ┌ RPC: eth_sendRawTransaction
  ├ endpoint: https://rpc.moderato.tempo.xyz
  └ tx_hash: 0xabc123...

→ Waiting for confirmation...

→ Confirmed in block #1,847,293 (1.2s)
  ┌ status: success ✓
  ├ gas_used: 48,211
  ├ fee_paid: $0.0007 (in AlphaUSD)
  ├ block_lane: PAYMENT (dedicated blockspace)
  │
  ├ Event: Transfer(from, to, value)
  │   from: 0xAl1c... → to: 0xB0b0... → value: 5000000
  │
  ├ Event: TransferWithMemo(from, to, value, memo)
  │   memo: 0x64696e6e6572... → decoded: "dinner last night"
  │
  └ Explorer: https://explore.tempo.xyz/tx/0xabc123...

💡 KEY CONCEPTS:
   • The memo traveled ON-CHAIN as part of the transfer — not in a
     separate transaction or off-chain database. This is native to TIP-20.
   • Fee was paid in AlphaUSD (a stablecoin), not a native gas token.
     Tempo has NO native token. The Fee AMM converts between stablecoins
     if the validator wants a different one.
   • This tx landed in the PAYMENT LANE — reserved blockspace that
     can't be consumed by other activity. Even if the chain is congested
     from DeFi or NFT activity, this payment goes through.

  COMPARISON TO ETHEREUM:
   • On Ethereum, you'd need a separate gas token (ETH) to send USDC.
   • There's no memo field — you'd need a custom contract or event.
   • No guaranteed blockspace — your tx competes with everything else.
```

**Tempo concepts taught:**
- TIP-20 memos (32-byte, on-chain payment references)
- Fee payment in stablecoins (no native token)
- Payment lanes (dedicated blockspace)
- Tempo transaction type

---

### Action 4: Send with Fee Sponsorship

**Endpoint:** `POST /api/send-sponsored`
**Params:** `{ from: "alice", to: "merchant", amount: "3.50", memo: "ORD-10042" }`

**What happens:**
1. Build the same transfer as Action 3
2. But now use the Sponsor account as `feePayer`
3. Two signatures are visible: Alice signs the intent, Sponsor signs the fee

**Log output (delta from Action 3):**
```
→ Building sponsored transaction...
  ┌ sender: 0xAl1c... (Alice) — signs the payment intent
  ├ fee_payer: 0xSp0n... (Sponsor) — pays the gas
  │
  ├ Step 1: Alice signs the transaction body
  │   ┌ signs: {to, value, data, feeToken, ...}
  │   └ Alice's signature: 0x1a2b3c...
  │
  ├ Step 2: Sponsor signs the fee authorization
  │   ┌ signs: {sender_address, fee_token, gas_limit, ...}
  │   └ Sponsor's signature: 0x4d5e6f...
  │
  └ Combined into single Tempo Transaction with both signatures

→ Confirmed in block #1,847,301
  ┌ Alice balance change: -$3.50 (payment only, no fee deducted)
  ├ Sponsor balance change: -$0.0007 (fee only)
  └ Bob balance change: +$3.50

💡 KEY CONCEPT: Fee sponsorship is native to Tempo's transaction type.
   The sender and fee payer are cryptographically separate — Alice never
   needs to hold extra tokens for gas. On Ethereum, this requires
   ERC-4337 (account abstraction) with a bundler and paymaster contract.
   On Tempo, it's a field on the transaction.
```

**Tempo concepts taught:**
- Native fee sponsorship (no smart contract middleware)
- Two-signature model (sender + sponsor)
- Comparison to ERC-4337 account abstraction

---

### Action 5: Batch Payment

**Endpoint:** `POST /api/batch`
**Params:** `{ from: "sponsor", payments: [{ to: "alice", amount: "10", memo: "PAYROLL-001" }, { to: "bob", amount: "15", memo: "PAYROLL-002" }, { to: "merchant", amount: "8.50", memo: "PAYROLL-003" }] }`

**What happens:**
1. Build multiple `transferWithMemo` calls
2. Submit as a single batched Tempo Transaction using `sendTransaction({ calls: [...] })`
3. All execute atomically

**Log output:**
```
→ Building batch transaction with 3 payments...
  ┌ call[0]: transfer $10.00 → Alice   memo: PAYROLL-001
  ├ call[1]: transfer $15.00 → Bob     memo: PAYROLL-002
  └ call[2]: transfer $8.50  → Merchant memo: PAYROLL-003

→ Encoding as single Tempo Transaction...
  ┌ tx_type: Tempo Transaction (batched)
  ├ calls: 3 operations
  ├ execution: ATOMIC (all succeed or all revert)
  └ single fee for entire batch

→ Confirmed in block #1,847,305
  ┌ status: success ✓ (all 3 calls succeeded)
  ├ gas_used: 98,442 (for ALL 3 transfers)
  ├ fee_paid: $0.0015 total
  ├ cost per payment: ~$0.0005
  │
  ├ Events emitted: 3x Transfer, 3x TransferWithMemo
  └ All in single transaction hash: 0xdef456...

💡 KEY CONCEPT: Three payments, one transaction, one fee. If this were
   Ethereum, you'd need 3 separate transactions (3x gas) or a custom
   multicall contract. On Tempo, batching is native to the transaction
   type. Atomic execution means no partial failures — critical for
   payroll where you can't have 2 of 3 employees get paid.
```

---

### Action 6: Read Transaction History

**Endpoint:** `POST /api/history`
**Params:** `{ account: "alice" }`

**What happens:**
1. Query `TransferWithMemo` events filtered by Alice's address
2. Decode memos back to strings
3. Show both sends and receives

**Log output:**
```
→ Querying TransferWithMemo events for Alice...
  ┌ RPC: eth_getLogs
  ├ address: 0x20c0000000000000000000000000000000000001
  ├ event: TransferWithMemo(address indexed from, address indexed to,
  │        uint256 value, bytes32 indexed memo)
  ├ filter: from=Alice OR to=Alice
  └ blocks: latest 1000

→ Found 4 transactions:

  #1  SENT    -$5.00  → Bob       memo: "dinner last night"     block: 1847293
  #2  SENT    -$3.50  → Merchant  memo: "ORD-10042"             block: 1847301
  #3  RECV   +$10.00  ← Sponsor   memo: "PAYROLL-001"           block: 1847305
  #4  RECV    +$3.00  ← Bob       memo: "splitwise-settle"      block: 1847312

💡 KEY CONCEPT: The memo field is INDEXED in the event, meaning you can
   filter by memo value directly. An exchange could query all deposits
   with a specific customer ID without scanning every transfer event.
   This is how TIP-20 enables payment reconciliation natively — no
   off-chain database needed to match payments to invoices.
```

---

### Action 7 (Stretch): Stablecoin Swap on DEX

**Endpoint:** `POST /api/swap`
**Params:** `{ from: "alice", sell: "AlphaUSD", buy: "pathUSD", amount: "50" }`

**What happens:**
1. Approve the DEX contract to spend AlphaUSD
2. Place a sell order on the enshrined DEX
3. Show the orderbook interaction

**Tempo concepts taught:**
- Enshrined DEX (precompile, not a deployed contract)
- Orderbook model (not AMM like Uniswap)
- pathUSD as the quote token
- How the DEX enables cross-stablecoin fee payment

---

### Action 8 (Stretch): Scheduled Payment

**Endpoint:** `POST /api/schedule`
**Params:** `{ from: "alice", to: "merchant", amount: "50", executeAfter: "+60s" }`

**What happens:**
1. Build a transfer with a `validAfter` timestamp
2. Submit to mempool
3. Show it pending, then executing when the time window opens

**Tempo concepts taught:**
- Native scheduling (no external cron or keeper network)
- Time-window transaction validity

---

## 5. Frontend Design

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  Tempo Explorer                              [Clear Log] │
├────────────────────┬─────────────────────────────────────┤
│                    │                                     │
│  ACCOUNTS          │  INTERACTION LOG                    │
│  ──────────        │                                     │
│  Alice  $994.50    │  → Encoding memo...                 │
│  Bob    $1,005.00  │    ┌ input: "dinner last night"     │
│  Merchant $1,003.50│    └ hex: 0x64696e6e...             │
│  Sponsor  $997.20  │                                     │
│                    │  → Building TIP-20 transfer...      │
│  ACTIONS           │    ┌ contract: 0x20c0...0001        │
│  ──────────        │    ├ function: transferWithMemo     │
│  [Setup Accounts]  │    └ amount: 5000000 ($5.00)        │
│  [Check Balances]  │                                     │
│                    │  → Submitting to testnet...          │
│  Send Payment      │    ┌ tx_hash: 0xabc123...           │
│  From: [Alice  v]  │    └ waiting...                     │
│  To:   [Bob    v]  │                                     │
│  Amt:  [5.00    ]  │  → Confirmed ✓ block #1,847,293    │
│  Memo: [dinner  ]  │    ┌ fee: $0.0007 (AlphaUSD)       │
│  Fee:  [●self ○sp] │    └ lane: PAYMENT                  │
│  [Send →]          │                                     │
│                    │  ┌─────────────────────────────────┐│
│  [Batch Payroll]   │  │ 💡 The memo traveled ON-CHAIN   ││
│  [View History]    │  │ as part of the transfer...      ││
│  [Swap Stables]    │  └─────────────────────────────────┘│
│  [Schedule Pay]    │                                     │
└────────────────────┴─────────────────────────────────────┘
```

### Interaction Log rendering rules

- Each `LogEntry` renders as a collapsible tree node
- `rpc_call` and `rpc_result` entries show raw JSON (expandable)
- `annotation` entries render in a highlighted box (blue background)
- `error` entries render in red
- Auto-scroll to bottom as new entries stream in
- "Clear Log" button resets the log
- Entries grouped by parent `action`

### Real-time updates

- WebSocket connection from frontend to backend on `ws://localhost:4000/ws`
- Backend streams `LogEntry` objects as JSON
- Frontend appends to a React state array and renders
- Balances refresh after each action completes

---

## 6. Project Structure

```
tempo-explorer/
├── package.json
├── tsconfig.json
│
├── server/
│   ├── index.ts                 # Hono server, REST routes, WS setup
│   ├── tempo-client.ts          # viem client config for Tempo testnet
│   ├── instrumented-client.ts   # Logging wrapper around viem calls
│   ├── accounts.ts              # AccountStore — generate, fund, track
│   ├── actions/
│   │   ├── setup.ts             # Action 1: create & fund accounts
│   │   ├── balance.ts           # Action 2: check balances
│   │   ├── send.ts              # Action 3: send with memo
│   │   ├── send-sponsored.ts    # Action 4: sponsored send
│   │   ├── batch.ts             # Action 5: batch payment
│   │   ├── history.ts           # Action 6: transaction history
│   │   ├── swap.ts              # Action 7: DEX swap (stretch)
│   │   └── schedule.ts          # Action 8: scheduled payment (stretch)
│   └── annotations.ts           # "KEY CONCEPT" text for each action
│
├── web/
│   ├── index.html
│   ├── App.tsx                  # Two-panel layout
│   ├── components/
│   │   ├── ActionPanel.tsx      # Left side: accounts + action buttons
│   │   ├── InteractionLog.tsx   # Right side: streaming log entries
│   │   ├── LogEntry.tsx         # Single log entry (tree node, collapsible)
│   │   └── AnnotationBox.tsx    # Highlighted concept explanation
│   ├── hooks/
│   │   └── useWebSocket.ts      # WS connection + log state management
│   └── lib/
│       └── types.ts             # Shared types (LogEntry, etc.)
```

---

## 7. Key Dependencies

```json
{
  "dependencies": {
    "viem": "latest",
    "hono": "latest",
    "@hono/node-server": "latest",
    "@hono/node-ws": "latest"
  },
  "devDependencies": {
    "typescript": "^5",
    "vite": "latest",
    "@vitejs/plugin-react": "latest",
    "react": "^19",
    "react-dom": "^19",
    "tailwindcss": "^4",
    "tsx": "latest",
    "concurrently": "latest"
  }
}
```

`viem` ships with Tempo chain definitions (`viem/chains` → `tempoModerato`) and Tempo-specific ABIs/actions (`viem/tempo` → `Abis`, `Actions`, `Addresses`).

---

## 8. Key Contract Addresses (Testnet)

| Contract | Address |
|----------|---------|
| AlphaUSD (TIP-20) | `0x20c0000000000000000000000000000000000001` |
| pathUSD (quote token) | `0x20c0000000000000000000000000000000000000` |
| BetaUSD (TIP-20) | `0x20c0000000000000000000000000000000000002` |
| TIP-20 Factory | Look up via `Addresses.tip20Factory` |
| Stablecoin DEX | `0xdec0000000000000000000000000000000000000` |
| Fee AMM | Look up via `Addresses.feeAmm` |

---

## 9. Build Order

| Phase | What | Est. Effort |
|-------|------|-------------|
| 0 | Scaffold project, install deps, verify testnet connectivity | 30 min |
| 1 | Backend: viem client + instrumented wrapper + WS server | 1-2 hrs |
| 2 | Backend: Setup action (account gen + faucet) | 1 hr |
| 3 | Frontend: Two-panel layout + WS log rendering | 1-2 hrs |
| 4 | Backend: Balance + Send with Memo actions | 1 hr |
| 5 | Backend: Fee Sponsorship action | 1 hr |
| 6 | Backend: Batch Payment action | 45 min |
| 7 | Backend: Transaction History action | 45 min |
| 8 | Polish: annotations, error handling, balance refresh | 1 hr |
| 9 | Stretch: DEX swap, scheduled payment | 2 hrs |

Total core (phases 0-8): ~8-10 hours of building

---

## 10. Open Questions to Resolve During Build

1. **Faucet API** — Need to confirm the exact faucet endpoint and request format for the moderato testnet. May need to use the web faucet manually and fund accounts with a pre-funded key instead.
2. **Payment lane visibility** — The receipt may or may not explicitly indicate which blockspace lane was used. If not exposed in the receipt, we annotate it conceptually rather than reading it from chain data.
3. **Scheduled transactions** — Need to verify SDK support for `validAfter`/`validBefore` fields on testnet. May be limited in current SDK version.
4. **WebSocket library** — Hono's WS support via `@hono/node-ws` should work but if it's flaky, fall back to `ws` directly alongside Hono.
