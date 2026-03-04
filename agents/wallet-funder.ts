import { createLogger } from '../shared/logger.js';
import { privateKeyToAccount } from 'viem/accounts';
import { Actions } from 'viem/tempo';
import { publicClient, createTempoWalletClient, ALPHA_USD, parseAlphaUsd, formatAlphaUsd } from '../server/tempo-client.js';
import { batchAction } from '../server/actions/batch.js';
import type { GeneratedWallet } from './wallet-generator.js';

const log = createLogger('WalletFunder');

export type ProgressCallback = (step: string, detail?: string) => void;

const FUNDING_AMOUNTS: Record<string, string> = {
  merchant_a: '100.00',
  guest_1: '50.00',
  guest_2: '50.00',
  guest_3: '50.00',
};

const FAUCET_POLL_TIMEOUT_MS = 30_000;
const FAUCET_POLL_INTERVAL_MS = 2_000;

async function getBalance(address: `0x${string}`): Promise<bigint> {
  return await publicClient.readContract({
    address: ALPHA_USD as `0x${string}`,
    abi: [
      {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      },
    ],
    functionName: 'balanceOf',
    args: [address],
  }) as bigint;
}

export async function fundZooWallets(
  wallets: GeneratedWallet[],
  onProgress?: ProgressCallback
): Promise<void> {
  const zooMaster = wallets.find(w => w.storeKey === 'zoo_master');
  if (!zooMaster) {
    throw new Error('Zoo Master wallet not found in generated wallets');
  }

  // Step 1: Request faucet funds for Zoo Master
  onProgress?.('Requesting faucet funds for Zoo Master...', zooMaster.address);
  log.info(`Requesting faucet funds for Zoo Master (${zooMaster.address})...`);

  const zooMasterAccount = privateKeyToAccount(zooMaster.privateKey);
  const initialBalance = await getBalance(zooMaster.address);

  try {
    const hashes = await Actions.faucet.fund(publicClient, {
      account: zooMasterAccount,
    });
    log.info(`Faucet submitted ${hashes.length} transaction(s). Waiting for balance...`);
    onProgress?.('Waiting for faucet confirmation...', `${hashes.length} tx(s) submitted`);

    // Poll until balance increases
    const deadline = Date.now() + FAUCET_POLL_TIMEOUT_MS;
    let funded = false;
    while (Date.now() < deadline) {
      const bal = await getBalance(zooMaster.address);
      if (bal > initialBalance) {
        funded = true;
        log.info(`Faucet confirmed. Zoo Master balance: ${formatAlphaUsd(bal)} AlphaUSD`);
        onProgress?.('Faucet funded successfully', `Balance: $${formatAlphaUsd(bal)}`);
        break;
      }
      await new Promise(r => setTimeout(r, FAUCET_POLL_INTERVAL_MS));
    }

    if (!funded) {
      throw new Error('Faucet transactions submitted but balance did not increase within 30s. Try again or visit https://faucet.moderato.tempo.xyz');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('balance did not increase')) {
      throw error;
    }
    throw new Error(`Faucet request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Step 2: Distribute funds via batch payment
  const recipients = wallets.filter(w => w.storeKey !== 'zoo_master');
  const payments = recipients.map(w => ({
    to: w.storeKey,
    amount: FUNDING_AMOUNTS[w.storeKey] || '50.00',
    memo: `Zoo Init: ${w.label}`,
  }));

  const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  onProgress?.(
    `Distributing via batch payment (Tempo batch action)`,
    `Merchant $100, Attendees $50 each — Total: $${totalAmount}`
  );
  log.info(`Distributing $${totalAmount} to ${recipients.length} wallets via batch payment...`);

  const batchResult = await batchAction({
    from: 'zoo_master',
    payments,
  });

  log.info(`Batch distribution complete: ${batchResult.txHashes?.length ?? 0} transactions`);
  onProgress?.('Wallet funding complete', `${batchResult.txHashes?.length ?? 0} transfers executed`);
}
