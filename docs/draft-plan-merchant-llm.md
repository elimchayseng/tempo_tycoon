# Draft Plan: LLM-Powered Merchant Agent

> Saved for future reference. Not yet implemented.

## Overview

Add a `MerchantBrain` that replaces the deterministic restock logic in `MerchantAgent` with LLM-powered inventory management decisions via Heroku Managed Inference.

## Current Deterministic Logic

- Every 5s cycle, check inventory for items with `stock <= restock_threshold` (1)
- Restock all low items to `max_stock` (5) by paying Zoo Master
- No reasoning about demand patterns, pricing, or strategic restocking

## Proposed MerchantBrain

### What the LLM would see
- Current inventory levels (stock per SKU)
- Recent sales data (which items selling fastest)
- Current balance (restock budget)
- Restock costs per item

### Tools
- `acp_restock_item` — Restock a specific SKU with a chosen quantity
- `acp_skip_restock` — Wait and don't restock this cycle

### Decision factors
- **Demand:** Restock fastest-selling items first
- **Budget:** Don't over-invest in inventory when funds are low
- **Efficiency:** Maybe restock multiple units at once instead of one-at-a-time
- **Priority:** Ensure popular items never go to zero stock

### Architecture
- Reuses same `LLMClient` (shared inference endpoint)
- New `MerchantBrain` class in `agents/llm/merchant-brain.ts`
- New system prompt in `agents/llm/prompts/merchant-system.ts`
- Wired in `MerchantAgent` same way as `BuyerBrain` in `BuyerAgent`

### Prerequisites
- Buyer LLM brain working and validated (this is done)
- Sales tracking data available to merchant agent
- Fun merchant added (optional, but would make merchant decisions more interesting)

## Extensibility

The `BuyerBrain` system prompt already accepts `availableMerchants` parameter.
When adding a fun merchant:
1. Pass `['food', 'fun']` to `buildBuyerSystemPrompt()`
2. The `acp_select_and_purchase` tool already has `merchant_category` field
3. Add `fun_need` to LLM context
4. No structural changes needed
