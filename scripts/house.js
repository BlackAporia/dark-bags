// House operator console (same env as the server: CHAIN, HOUSE_ADDRESS, HOUSE_PRIVATE_KEY, CASHIER_FILE, …).
//
//   node scripts/house.js status                     on-chain balances vs what players are owed
//   node scripts/house.js review                     payouts held for a human after a crash or unclear error
//   node scripts/house.js resolve <id> sent <0xtx>   mark a held payout as delivered
//   node scripts/house.js resolve <id> refund        give a held payout back to the player's balance
//   node scripts/house.js register                   publish the house viewing key in the STRK20 pool (once)
//   node scripts/house.js pools <staker>             a validator's delegation pools (Starkzap staking)
//   node scripts/house.js stake <pool> <amount> [token]   delegate idle house STRK (default) or BTC (surplus only)
//   node scripts/house.js position <pool>            staked amount and unclaimed rewards
//   node scripts/house.js claim <pool>               claim rewards
//   node scripts/house.js unstake <pool> <amount> [token] start the exit window;  exit <pool> finishes it
//   node scripts/house.js swap <from> <to> <amount>  rebalance the treasury through Ekubo (surplus only)
//
// Stop the server before `resolve`: both write CASHIER_FILE.
// The surplus guard counts only balances in CASHIER_FILE; stakes inside a live raid are on top.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as starkzap from 'starkzap';
import { readConfig } from '../server/cashier/config.js';
import { createStarknetChain } from '../server/cashier/starknet.js';
import { normAddr } from '../server/cashier/cashier.js';

const [cmd, ...args] = process.argv.slice(2);
const force = args.includes('--force');
const cfg = readConfig();
if (!cfg) {
  console.error('Set CHAIN=sepolia|mainnet and the house env first.');
  process.exit(1);
}
const { Amount, fromAddress } = starkzap;
const data = cfg.file && existsSync(cfg.file) ? JSON.parse(readFileSync(cfg.file, 'utf8')) : {};
const needsChain = !['review', 'resolve'].includes(cmd);
const chain = needsChain ? await createStarknetChain({ cfg, starkzap, log: { warn() {}, error: console.error, log() {} } }) : null;
const tokenBy = (s) => chain.tokens.find((t) => t.symbol.toUpperCase() === String(s).toUpperCase() || t.id === normAddr(s));
const fmt = (t, units) => Amount.fromRaw(BigInt(units), t).toFormatted();

function owed() {
  const out = {};
  for (const bal of Object.values(data.ledger ?? {})) for (const [k, v] of Object.entries(bal)) out[k] = (out[k] ?? 0n) + BigInt(v);
  for (const w of data.withdrawals ?? []) if (w.status === 'review' || w.status === 'sending') out[w.token] = (out[w.token] ?? 0n) + BigInt(w.amount);
  return out;
}

async function surplus(t) {
  const bal = (await chain.wallet.balanceOf(t)).toBase();
  return bal - (owed()[t.id] ?? 0n);
}

async function guard(t, amount) {
  const free = await surplus(t);
  if (amount > free && !force) {
    console.error(`Only ${fmt(t, free > 0n ? free : 0n)} of ${t.symbol} is the house's own; the rest belongs to players. Add --force to override.`);
    process.exit(1);
  }
}

const needWallet = () => {
  if (!chain.wallet) {
    console.error('HOUSE_PRIVATE_KEY is required for this command.');
    process.exit(1);
  }
  return chain.wallet;
};

switch (cmd) {
  case 'status': {
    const o = owed();
    console.log(`${cfg.network} house ${chain.info().house}`);
    for (const t of chain.tokens) {
      const bal = chain.wallet ? (await chain.wallet.balanceOf(t)).toBase() : null;
      const due = o[t.id] ?? 0n;
      console.log(`  ${t.symbol.padEnd(8)} held ${bal === null ? '?' : fmt(t, bal)}  owed ${fmt(t, due)}${bal !== null && bal < due ? '  ⚠ SHORT' : ''}`);
    }
    const review = (data.withdrawals ?? []).filter((w) => w.status === 'review').length;
    if (review) console.log(`  ${review} payout(s) need review: node scripts/house.js review`);
    console.log('  (STRK20 notes are private balances and are not included in "held")');
    break;
  }
  case 'review':
    for (const w of (data.withdrawals ?? []).filter((x) => x.status === 'review' || x.status === 'sending')) {
      console.log(`${w.id}  ${new Date(w.at).toISOString()}  ${w.route}  ${w.amount} of ${w.token} → ${w.to}  ${w.err ?? ''}`);
    }
    break;
  case 'resolve': {
    const [id, how, tx] = args;
    const w = (data.withdrawals ?? []).find((x) => x.id === id);
    if (!w || (w.status !== 'review' && w.status !== 'sending')) {
      console.error('No held payout with that id.');
      process.exit(1);
    }
    if (how === 'sent' && tx) Object.assign(w, { status: 'sent', tx });
    else if (how === 'refund') {
      w.status = 'failed';
      const acct = (data.ledger[w.account] ??= {});
      acct[w.token] = (BigInt(acct[w.token] ?? 0) + BigInt(w.amount)).toString();
    } else {
      console.error('resolve <id> sent <0xtx> | resolve <id> refund');
      process.exit(1);
    }
    writeFileSync(cfg.file, JSON.stringify(data));
    console.log(`${id} → ${w.status}`);
    break;
  }
  case 'register': {
    if (!chain.strk20) throw new Error('STRK20 is not configured (STRK20_VIEWING_KEY, STRK20_PROVER_URL, Node 24 + strk20-discovery)');
    const r = await chain.strk20.register();
    console.log('registered:', r.transaction_hash);
    break;
  }
  case 'pools': {
    const pools = await chain.sdk.getStakerPools(fromAddress(args[0]));
    for (const p of pools) console.log(`${p.poolContract}  ${p.token.symbol}  delegated ${p.amount.toFormatted()}`);
    break;
  }
  case 'stake': {
    const w = needWallet();
    const [pool, amt, sym = 'STRK'] = args;
    const t = tokenBy(sym);
    const amount = Amount.parse(amt, t);
    await guard(t, amount.toBase());
    const tx = await w.stake(fromAddress(pool), amount);
    console.log('staked:', tx.explorerUrl ?? tx.hash);
    break;
  }
  case 'position': {
    const p = await needWallet().getPoolPosition(fromAddress(args[0]));
    console.log(p ? JSON.stringify(p, (k, v) => (v?.toFormatted ? v.toFormatted() : typeof v === 'bigint' ? v.toString() : v), 2) : 'not a member of that pool');
    break;
  }
  case 'claim': {
    const tx = await needWallet().claimPoolRewards(fromAddress(args[0]));
    console.log('claimed:', tx.explorerUrl ?? tx.hash);
    break;
  }
  case 'unstake': {
    const w = needWallet();
    const t = tokenBy(args[2] ?? 'STRK');
    const tx = await w.exitPoolIntent(fromAddress(args[0]), Amount.parse(args[1], t));
    console.log('exit window started:', tx.explorerUrl ?? tx.hash);
    break;
  }
  case 'exit': {
    const tx = await needWallet().exitPool(fromAddress(args[0]));
    console.log('exited:', tx.explorerUrl ?? tx.hash);
    break;
  }
  case 'swap': {
    const w = needWallet();
    const [from, to, amt] = args;
    const tokenIn = tokenBy(from);
    const tokenOut = tokenBy(to);
    if (!tokenIn || !tokenOut) throw new Error('swap <from> <to> <amount> with table tokens');
    const amountIn = Amount.parse(amt, tokenIn);
    await guard(tokenIn, amountIn.toBase());
    const q = await w.getQuote({ tokenIn, tokenOut, amountIn });
    console.log(`quote: ${amountIn.toFormatted()} → ${fmt(tokenOut, q.amountOutBase)}`);
    const tx = await w.swap({ tokenIn, tokenOut, amountIn, slippageBps: 100n });
    console.log('swapped:', tx.explorerUrl ?? tx.hash);
    break;
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n'));
}
process.exit(0);
