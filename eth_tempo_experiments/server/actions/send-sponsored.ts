import { toHex, formatGwei } from "viem";
import { Actions, Abis } from "viem/tempo";
import { accountStore } from "../accounts.js";
import {
  publicClient,
  createTempoWalletClient,
  ALPHA_USD,
  PATH_USD,
  CHAIN_CONFIG,
  TIP20_DECIMALS,
  parseUsdAmount,
  formatUsdAmount,
  shortAddress,
} from "../tempo-client.js";
import { emitLog } from "../instrumented-client.js";
import { annotations } from "../annotations.js";

const ACTION = "send-sponsored";

export async function sendSponsoredAction(params: {
  from: string;
  to: string;
  amount: string;
  memo: string;
}) {
  const { from, to, amount, memo } = params;

  // -----------------------------------------------------------------------
  // Step 1: Parse and validate parameters
  // -----------------------------------------------------------------------
  const senderAcct = accountStore.get(from);
  const recipientAcct = accountStore.get(to);
  const sponsorAcct = accountStore.get("sponsor");
  if (!senderAcct) throw new Error(`Unknown sender account: ${from}`);
  if (!recipientAcct) throw new Error(`Unknown recipient account: ${to}`);
  if (!sponsorAcct) throw new Error("Sponsor account not found — run Setup first");
  if (senderAcct.label === recipientAcct.label) {
    throw new Error("Cannot send to yourself");
  }

  const rawAmount = parseUsdAmount(amount);

  emitLog({
    action: ACTION,
    type: "info",
    label: `Sponsored payment: ${senderAcct.label} sends, Sponsor pays fee`,
    data: {
      sender: `${senderAcct.label} (${shortAddress(senderAcct.address)})`,
      recipient: `${recipientAcct.label} (${shortAddress(recipientAcct.address)})`,
      fee_payer: `Sponsor (${shortAddress(sponsorAcct.address)})`,
      amount: `$${amount}`,
      raw_amount: rawAmount.toString(),
    },
  });

  emitLog({
    action: ACTION,
    type: "annotation",
    label: "KEY CONCEPT",
    data: {},
    annotations: annotations.sponsored.concept,
  });

  // -----------------------------------------------------------------------
  // Step 2: Encode memo
  // -----------------------------------------------------------------------
  const memoHex = toHex(memo);

  emitLog({
    action: ACTION,
    type: "info",
    label: `Encoding memo → bytes32`,
    data: {
      original: memo,
      hex: memoHex,
    },
    indent: 1,
  });

  // -----------------------------------------------------------------------
  // Step 3: Read balances before (sender, recipient, and sponsor)
  // Also read Sponsor's pathUSD balance — fees are paid in pathUSD
  // -----------------------------------------------------------------------
  emitLog({
    action: ACTION,
    type: "rpc_call",
    label: "RPC: eth_call × 4 — reading AlphaUSD + Sponsor's pathUSD balance",
    data: {
      tokens: {
        AlphaUSD: ALPHA_USD,
        pathUSD: PATH_USD,
      },
      note: "Sponsor's fee will be paid in pathUSD (the network's base fee token)",
    },
  });

  const [senderBalanceBefore, recipientBalanceBefore, sponsorAlphaBefore, sponsorPathBefore] =
    await Promise.all([
      publicClient.readContract({
        address: ALPHA_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [senderAcct.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: ALPHA_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [recipientAcct.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: ALPHA_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [sponsorAcct.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: PATH_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [sponsorAcct.address],
      }) as Promise<bigint>,
    ]);

  emitLog({
    action: ACTION,
    type: "rpc_result",
    label: `Balances before`,
    data: {
      [`${senderAcct.label} (AlphaUSD)`]: `$${formatUsdAmount(senderBalanceBefore)}`,
      [`${recipientAcct.label} (AlphaUSD)`]: `$${formatUsdAmount(recipientBalanceBefore)}`,
      ["Sponsor (AlphaUSD)"]: `$${formatUsdAmount(sponsorAlphaBefore)}`,
      ["Sponsor (pathUSD)"]: `$${formatUsdAmount(sponsorPathBefore)}`,
    },
    indent: 1,
  });

  // -----------------------------------------------------------------------
  // Step 4: Execute sponsored transferWithMemo
  // -----------------------------------------------------------------------
  const senderViemAccount = accountStore.getAccount(from);
  const sponsorViemAccount = accountStore.getAccount("sponsor");
  const walletClient = createTempoWalletClient(senderViemAccount);

  emitLog({
    action: ACTION,
    type: "tx_built",
    label: `Building sponsored transferWithMemo transaction`,
    data: {
      contract: ALPHA_USD,
      function: "transferWithMemo(address, uint256, bytes32)",
      args: {
        to: shortAddress(recipientAcct.address),
        amount: `${rawAmount.toString()} (= $${amount})`,
        memo: memoHex,
      },
      signer: `${shortAddress(senderAcct.address)} (${senderAcct.label})`,
      fee_payer: `${shortAddress(sponsorAcct.address)} (Sponsor)`,
      tx_type: "Tempo Transaction with dual signatures",
    },
  });

  emitLog({
    action: ACTION,
    type: "info",
    label: "Two signatures required:",
    data: {
      "1_sender_signature": `${senderAcct.label} signs the payment intent`,
      "2_sponsor_signature": `Sponsor signs the fee authorization`,
      note: "Both signatures are combined into a single Tempo Transaction",
    },
    indent: 1,
  });

  // feePayer: Account triggers the dual-signature flow in Transaction.serialize:
  //   sender signs tx → SDK calculates fee payer payload → sponsor signs → combine → broadcast
  const result = await Actions.token.transferSync(walletClient, {
    token: ALPHA_USD,
    to: recipientAcct.address,
    amount: rawAmount,
    memo: memoHex as `0x${string}`,
    feePayer: sponsorViemAccount,
  } as any);

  const receipt = result.receipt as any;

  emitLog({
    action: ACTION,
    type: "tx_submitted",
    label: `Dual-signed transaction submitted`,
    data: {
      tx_hash: receipt.transactionHash,
      rpc: "eth_sendRawTransaction",
      endpoint: CHAIN_CONFIG.rpcUrl,
      note: "Single transaction with two cryptographic signatures",
    },
    indent: 1,
  });

  emitLog({
    action: ACTION,
    type: "tx_confirmed",
    label: `Confirmed in block #${receipt.blockNumber} ✓`,
    data: {
      status: receipt.status,
      tx_hash: receipt.transactionHash,
      block_number: receipt.blockNumber.toString(),
      gas_used: receipt.gasUsed.toString(),
      fee_payer_in_receipt: receipt.feePayer
        ? shortAddress(receipt.feePayer)
        : "unknown",
      fee_token_in_receipt: receipt.feeToken ?? "default",
      transfer_event: {
        from: shortAddress(result.from),
        to: shortAddress(result.to),
        amount: `${result.amount.toString()} (= $${formatUsdAmount(result.amount)})`,
        memo: memoHex,
      },
      explorer: `${CHAIN_CONFIG.explorerUrl}/tx/${receipt.transactionHash}`,
    },
  });

  emitLog({
    action: ACTION,
    type: "annotation",
    label: "KEY CONCEPT",
    data: {},
    annotations: annotations.sponsored.signatures,
  });

  // -----------------------------------------------------------------------
  // Step 5: Read balances after and show who paid what
  // -----------------------------------------------------------------------
  emitLog({
    action: ACTION,
    type: "rpc_call",
    label: "RPC: eth_call × 4 — reading balances after transfer",
    data: {
      note: "Checking AlphaUSD balances + Sponsor's pathUSD (fee token)",
    },
  });

  const [senderBalanceAfter, recipientBalanceAfter, sponsorAlphaAfter, sponsorPathAfter] =
    await Promise.all([
      publicClient.readContract({
        address: ALPHA_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [senderAcct.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: ALPHA_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [recipientAcct.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: ALPHA_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [sponsorAcct.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: PATH_USD,
        abi: Abis.tip20,
        functionName: "balanceOf",
        args: [sponsorAcct.address],
      }) as Promise<bigint>,
    ]);

  // Update account store (AlphaUSD balances)
  accountStore.updateBalance(senderAcct.label, ALPHA_USD, senderBalanceAfter);
  accountStore.updateBalance(recipientAcct.label, ALPHA_USD, recipientBalanceAfter);
  accountStore.updateBalance(sponsorAcct.label, ALPHA_USD, sponsorAlphaAfter);

  const senderDiff = senderBalanceBefore - senderBalanceAfter;
  const recipientDiff = recipientBalanceAfter - recipientBalanceBefore;
  const sponsorPathDiff = sponsorPathBefore - sponsorPathAfter;

  emitLog({
    action: ACTION,
    type: "rpc_result",
    label: `Balance changes — notice who paid the fee!`,
    data: {
      [senderAcct.label + " (AlphaUSD)"]: {
        before: `$${formatUsdAmount(senderBalanceBefore)}`,
        after: `$${formatUsdAmount(senderBalanceAfter)}`,
        change: `−$${formatUsdAmount(senderDiff)}`,
        note: senderDiff === rawAmount
          ? `✓ Sender lost exactly $${amount} — no fee deducted!`
          : `Sender lost $${formatUsdAmount(senderDiff)}`,
      },
      [recipientAcct.label + " (AlphaUSD)"]: {
        before: `$${formatUsdAmount(recipientBalanceBefore)}`,
        after: `$${formatUsdAmount(recipientBalanceAfter)}`,
        change: `+$${formatUsdAmount(recipientDiff)}`,
      },
      ["Sponsor (pathUSD — fee token)"]: {
        before: `$${formatUsdAmount(sponsorPathBefore)}`,
        after: `$${formatUsdAmount(sponsorPathAfter)}`,
        change: `−$${formatUsdAmount(sponsorPathDiff)}`,
        note: `Sponsor paid $${formatUsdAmount(sponsorPathDiff)} fee in pathUSD`,
      },
    },
  });

  // Fee math breakdown from receipt
  const gasUsed = receipt.gasUsed as bigint;
  const effectiveGasPrice = receipt.effectiveGasPrice as bigint;
  const computedFeeWei = gasUsed * effectiveGasPrice;
  const WEI_TO_TIP20 = BigInt(10 ** 12);
  const computedFeeTip20 = computedFeeWei / WEI_TO_TIP20;

  emitLog({
    action: ACTION,
    type: "info",
    label: "Fee calculation breakdown",
    data: {
      "1_from_receipt": {
        gasUsed: gasUsed.toString(),
        effectiveGasPrice: `${formatGwei(effectiveGasPrice)} Gwei (${effectiveGasPrice.toString()} wei)`,
        feePayer: receipt.feePayer ? `${shortAddress(receipt.feePayer)} (Sponsor)` : "unknown",
        feeToken: receipt.feeToken ?? PATH_USD,
        note: "Gas price is set dynamically by the chain's fee market — not a value we control",
      },
      "2_formula": `fee = gasUsed × effectiveGasPrice`,
      "3_calculation": `${gasUsed} gas × ${formatGwei(effectiveGasPrice)} Gwei = ${formatGwei(computedFeeWei)} Gwei`,
      "4_to_dollars": `${formatGwei(computedFeeWei)} Gwei ÷ 10³ ≈ $${formatUsdAmount(computedFeeTip20)} (TIP-20 uses 6 decimals, Gwei uses 9)`,
      "5_actual_fee": `$${formatUsdAmount(sponsorPathDiff)} (Sponsor's pathUSD balance dropped by this amount)`,
    },
    indent: 1,
  });

  emitLog({
    action: ACTION,
    type: "annotation",
    label: "KEY CONCEPT",
    data: {},
    annotations: [
      `PROOF: ${senderAcct.label} lost exactly $${amount} (the transfer amount). The fee of $${formatUsdAmount(sponsorPathDiff)} was paid by Sponsor in pathUSD.`,
      `FEE MATH: ${gasUsed} gas × ${formatGwei(effectiveGasPrice)} Gwei/gas = ${formatGwei(computedFeeWei)} Gwei ≈ $${formatUsdAmount(computedFeeTip20)} in pathUSD`,
      "The fee was paid in pathUSD — the network's base fee token. The Fee AMM allows fees to be paid in any stablecoin, and the sponsor can choose which one.",
      "On Ethereum, this requires ERC-4337 (Account Abstraction) with a bundler and paymaster contract. On Tempo, it's just a field on the transaction.",
    ],
  });
}
