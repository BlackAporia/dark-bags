// STRK20 Shadow Accounts (Starknet Wallet API 0.10.4): playing from a persistent, pseudonymous
// DARK BAGS account that nothing on chain links to the player's main wallet.
//
// The wallet derives the player's shadow account for this game from their private STRK20 state
// (the dapp name scopes it: another app gets another one). We never learn the main wallet:
//
//   1. sign-in: the browser asks the wallet for the partial commitment of our dapp
//      (wallet_strk20ShadowAccountCommitment). We look up the shadow address it maps to on the
//      canonical ShadowAccountAnonymizer (get_shadow_accounts), then ask for proof of control: the
//      wallet runs one shadow_account_invoke that sends 0 of a coin from the shadow account to a
//      random address we picked. Only the owner can make the shadow account do that; the commitment
//      alone (which StarkWare says may be shared) is never enough to sign in.
//   2. deposit: one STRK20 transaction withdraws from the shielded notes to the shadow account and,
//      through it, transfers to the house. On chain: shadow account → house, nothing about who.
//   3. cash-out: the house pays the shadow account (a plain transfer). The wallet then collects the
//      shadow account's balance back into a shielded note of the main wallet (collect_policy 'all').
//
// What stays public (StarkWare's privacy boundary): the shadow address, its balances, the calls it
// makes and their amounts and timing. Not the link to the main wallet.
import { num, shortString, hash } from 'starknet';

export const SHADOW_DAPP = 'darkbags';
export const SHADOW_NONCE = '0x0';
// the canonical ShadowAccountAnonymizer per network (strk20-shadow-account-starter, verified daily)
export const ANONYMIZER = {
  mainnet: '0x04f33230dc57855c6e7eabe66dfa0fde82c5458fd0e54827cdb7cb4c474888a7',
  sepolia: '0x010a2285310c107c731d997afc147afb7495daff6397c2d242133d9fe8d9b147',
};
const MAX_FELT = 2n ** 251n + 17n * 2n ** 192n + 1n;
// the cashier's address form (its own normAddr; imported from there it would be a cycle)
function normAddr(x) {
  try {
    const v = BigInt(x);
    return v > 0n && v < MAX_FELT ? `0x${v.toString(16).padStart(64, '0')}` : null;
  } catch {
    return null;
  }
}
const TRANSFER = normAddr(hash.getSelectorFromName('Transfer'));

export const dappFelt = (name = SHADOW_DAPP) => shortString.encodeShortString(name);

// a felt the wallet returned (the partial commitment), or null
export function feltOf(x) {
  try {
    const v = BigInt(x);
    return v > 0n && v < MAX_FELT ? num.toHex(v) : null;
  } catch {
    return null;
  }
}

// The shadow account a partial commitment maps to, read from the anonymizer:
// get_shadow_accounts(partial, from_nonce, to_nonce, 0) → [count, nonce, address, deployed, …]
export async function shadowAccountOf(callContract, anonymizer, partial, nonce = SHADOW_NONCE) {
  const n = BigInt(nonce);
  const r = await callContract({ contractAddress: anonymizer, entrypoint: 'get_shadow_accounts', calldata: [partial, num.toHex(n), num.toHex(n + 1n), '0x0'] });
  if (!Array.isArray(r) || r.length < 4 || BigInt(r[0] ?? 0) !== 1n || BigInt(r[1]) !== n) throw new Error('The shadow account anonymizer returned no account for that commitment.');
  const address = normAddr(r[2]);
  if (!address) throw new Error('The shadow account anonymizer returned a malformed address.');
  return { address, deployed: BigInt(r[3]) !== 0n };
}

// a fresh challenge: a random address the proof of control sends 0 to
export const newChallenge = (rand) => normAddr(`0x0${rand(31).toString('hex')}`) ?? '0x1';

// Does this receipt carry the proof: a Transfer of 0 of one of our coins from the shadow account
// to the challenge address?
export function proves(receipt, { shadow, challenge, tokens }) {
  if (!receipt || receipt.execution_status === 'REVERTED') return false;
  return (receipt.events ?? []).some((ev) => {
    if (!tokens.has(normAddr(ev.from_address)) || normAddr(ev.keys?.[0]) !== TRANSFER) return false;
    const [from, to] = ev.keys.length >= 3 ? [ev.keys[1], ev.keys[2]] : [ev.data[0], ev.data[1]];
    return normAddr(from) === shadow && normAddr(to) === challenge;
  });
}
