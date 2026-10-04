// The house's side of the DARK BAGS vault (contracts/src/vault.cairo): the game's private money
// on Starknet, plugged into the STRK20 privacy pool.
//
// Private deposit: the player's wallet sends one STRK20 transaction that withdraws from their
// shielded notes to the vault and invokes it with DEPOSIT and a one-time reference we handed them.
// We read the vault's Deposited events (plain RPC, no pool scan) and credit whoever asked for that
// reference. On chain nobody can tell which wallet paid.
//
// Private cash-out: the house sends one STRK20 transaction that creates an open note owned by the
// player (the owner is encrypted on chain) and invokes the vault with PAYOUT, signed by the
// operator key. The pool pulls the funds from the vault into the note, so the money lands in the
// player's shielded balance.
//
// Private stakes: each staked match locks its whole pot per coin in the vault and settles it with
// the house cut (the contract caps it at 5%). Only pot totals reach the chain, never who staked what.
// These run in the background, one at a time, and never hold up a match.
import { CallData, ec, hash, num, shortString } from 'starknet';
import { normAddr } from './cashier.js';

export const OP = { DEPOSIT: shortString.encodeShortString('DEPOSIT'), PAYOUT: shortString.encodeShortString('PAYOUT') };
export const PAYOUT_DOMAIN = shortString.encodeShortString('DARKBAGS_PAYOUT_V1');
export const CHAIN_FELT = { SN_MAIN: '0x534e5f4d41494e', SN_SEPOLIA: '0x534e5f5345504f4c4941' };
export const MAX_RAKE_BPS = 500n;
const DEPOSITED = num.toHex(hash.getSelectorFromName('Deposited'));
const U128 = 2n ** 128n;

// the same hash as DarkBagsVault.payout_hash
export function payoutHash({ chainId, vault, payoutId, token, notes }) {
  const msg = [PAYOUT_DOMAIN, CHAIN_FELT[chainId] ?? chainId, vault, payoutId, token, notes.length];
  for (const n of notes) msg.push(n.noteId, n.amount);
  return hash.computePoseidonHashOnElements(msg.map((x) => num.toHex(BigInt(x))));
}

export function signPayout(key, h) {
  const sig = ec.starkCurve.sign(num.toHex(h), key);
  return { r: num.toHex(sig.r), s: num.toHex(sig.s) };
}

export const operatorKey = (key) => ec.starkCurve.getStarkKey(key);

// a fresh reference for one private deposit: random, so it says nothing about the player
export const newReference = (rand) => num.toHex(BigInt(`0x${rand(31).toString('hex')}`) || 1n);

// [op, len, ...data]: how `privacy_invoke(op, data: Span<felt252>)` reads its calldata
export const invokeCalldata = (op, data) => [op, num.toHex(data.length), ...data.map((x) => num.toHex(BigInt(x)))];

// the STRK20 wallet actions for a private deposit into the vault (wallet API wire format)
export function depositActions({ vault, token, amount, reference }) {
  const units = num.toHex(BigInt(amount));
  return [
    { type: 'withdraw', token, amount: units, recipient: vault },
    { type: 'invoke', contract: vault, calldata: invokeCalldata(OP.DEPOSIT, [token, units, reference]) },
  ];
}

// the house cut a pot may carry on chain: the game's cut, never above the contract's cap
export function chainRake(units, houseShare) {
  const u = BigInt(units);
  const want = BigInt(Math.floor(Number(u) * houseShare));
  const cap = (u * MAX_RAKE_BPS) / 10000n;
  return want < cap ? want : cap;
}

export const matchFelt = (key) => num.toHex(hash.starknetKeccak(String(key)));

export function createVault({ cfg, account, provider, strk20, log = console }) {
  const v = cfg.vault;
  if (!v?.address) return null;
  const vault = normAddr(v.address);
  const key = cfg.houseKey;
  if (!vault) {
    log.warn('vault: VAULT_ADDRESS is not a Starknet address');
    return null;
  }
  let fromBlock = v.fromBlock ?? 0;
  let queue = Promise.resolve();
  const serial = (fn) => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => {});
    return p;
  };
  const call = (entrypoint, calldata) => provider.callContract({ contractAddress: vault, entrypoint, calldata });

  return {
    address: vault,
    canPay: !!(key && strk20?.canInvoke),
    canRecord: !!account?.execute,

    get cursor() {
      return fromBlock;
    },
    set cursor(b) {
      if (Number(b) > fromBlock) fromBlock = Number(b);
    },

    // every Deposited event since the cursor: [{ id, reference, token, amount }]
    async scan() {
      const out = [];
      let token;
      let last = fromBlock;
      do {
        const r = await provider.getEvents({ address: vault, keys: [[DEPOSITED]], from_block: { block_number: fromBlock }, to_block: 'latest', chunk_size: 200, ...(token ? { continuation_token: token } : {}) });
        for (const e of r.events ?? []) {
          const [, reference, tok] = e.keys;
          out.push({ id: `vault:${e.transaction_hash}:${reference}`, reference: num.toHex(reference), token: normAddr(tok), amount: BigInt(e.data[0]) });
          if (e.block_number > last) last = e.block_number;
        }
        token = r.continuation_token;
      } while (token);
      // re-read the last block next time (events there may still be arriving); ids dedupe
      fromBlock = last;
      return out;
    },

    // private cash-out: an open note for `to`, filled by the vault
    pay({ token, to, amount, payoutId }) {
      if (!this.canPay) return Promise.reject(Object.assign(new Error('vault cash-outs need HOUSE_PRIVATE_KEY and the STRK20 prover'), { notSent: true }));
      if (BigInt(amount) >= U128) return Promise.reject(Object.assign(new Error('amount too large'), { notSent: true }));
      return serial(() =>
        strk20.invokeWithOpenNote({
          token,
          to,
          contract: vault,
          calldata: ({ noteId }) => {
            const h = payoutHash({ chainId: cfg.chainId, vault, payoutId, token, notes: [{ noteId, amount }] });
            const { r, s } = signPayout(key, h);
            return invokeCalldata(OP.PAYOUT, [payoutId, token, 1, noteId, amount, r, s]);
          },
        }),
      );
    },

    async freeBalance(token) {
      const r = await call('free_balance', [token]);
      return BigInt(r[0]);
    },

    // lock a match's pot per coin; tops the vault up from the house wallet first if it is short
    openMatch({ matchId, pots }) {
      if (!this.canRecord) return Promise.resolve(null);
      return serial(async () => {
        const calls = [];
        for (const p of pots) {
          const free = await this.freeBalance(p.token);
          const short = BigInt(p.amount) - free;
          if (short > 0n) {
            calls.push({ contractAddress: p.token, entrypoint: 'approve', calldata: CallData.compile([vault, { low: short, high: 0n }]) });
            calls.push({ contractAddress: vault, entrypoint: 'fund', calldata: [p.token, num.toHex(short)] });
          }
        }
        calls.push({ contractAddress: vault, entrypoint: 'open_match', calldata: CallData.compile([matchId, pots.map((p) => ({ token: p.token, amount: BigInt(p.amount) }))]) });
        const r = await account.execute(calls);
        return r.transaction_hash;
      });
    },

    settleMatch({ matchId, rakes, root }) {
      if (!this.canRecord) return Promise.resolve(null);
      return serial(async () => {
        const r = await account.execute([{ contractAddress: vault, entrypoint: 'settle_match', calldata: CallData.compile([matchId, rakes.map((p) => ({ token: p.token, amount: BigInt(p.amount) })), root]) }]);
        return r.transaction_hash;
      });
    },

    voidMatch({ matchId }) {
      if (!this.canRecord) return Promise.resolve(null);
      return serial(async () => (await account.execute([{ contractAddress: vault, entrypoint: 'void_match', calldata: [matchId] }])).transaction_hash);
    },
  };
}

// Room → vault: what a staked match puts on chain. Pots per coin at the start, the house cut and a
// root over every player's (salt, coin, stake) at the end. Failures are logged, never thrown: the
// match itself is already settled in the game's books.
export function createPotRecorder({ vault, houseShare, rand, log = console }) {
  const open = new Map(); // match key → { matchId, pots, leaves }
  return {
    start(key, stakes) {
      const pots = new Map();
      const leaves = [];
      for (const s of stakes) {
        const token = normAddr(s.asset);
        if (!token || BigInt(s.units) <= 0n) continue;
        pots.set(token, (pots.get(token) ?? 0n) + BigInt(s.units));
        const salt = num.toHex(BigInt(`0x${rand(31).toString('hex')}`));
        leaves.push({ account: s.account, salt, token, units: String(s.units), leaf: hash.computePoseidonHashOnElements([salt, token, num.toHex(BigInt(s.units))]) });
      }
      if (!pots.size) return null;
      const matchId = matchFelt(key);
      const list = [...pots].map(([token, amount]) => ({ token, amount }));
      open.set(key, { matchId, pots: list, leaves });
      vault.openMatch({ matchId, pots: list }).then(
        (tx) => tx && log.log?.(`vault: match ${matchId.slice(0, 10)} locked ${list.length} pot(s) (${tx})`),
        (e) => {
          log.error('vault: open_match failed', e?.message ?? e);
          open.delete(key);
        },
      );
      // each player's own receipt: their leaf and salt, so they can check the root on chain
      return { matchId, receipts: leaves.map(({ account, salt, leaf }) => ({ account, salt, leaf })) };
    },
    end(key, { voided = false } = {}) {
      const m = open.get(key);
      if (!m) return;
      open.delete(key);
      if (voided) {
        vault.voidMatch({ matchId: m.matchId }).catch((e) => log.error('vault: void_match failed', e?.message ?? e));
        return;
      }
      const rakes = m.pots.map((p) => ({ token: p.token, amount: chainRake(p.amount, houseShare) }));
      const root = m.leaves.length ? hash.computePoseidonHashOnElements(m.leaves.map((l) => l.leaf)) : '0x0';
      vault.settleMatch({ matchId: m.matchId, rakes, root }).then(
        (tx) => tx && log.log?.(`vault: match ${m.matchId.slice(0, 10)} settled (${tx})`),
        (e) => log.error('vault: settle_match failed', e?.message ?? e),
      );
    },
  };
}
