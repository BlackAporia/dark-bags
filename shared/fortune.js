// The shop's fortune wheel: $0.05 a spin, paid in any coin you hold (STRK, USDT, USDS, strkBTC,
// WBTC, ETH, …). Every spin pays something temporary (a 72h runner skin or weapon skin), now and then
// a real skin to keep, and a share of every spin builds the fortune bank. When the bank reaches its
// next mark ($0.50, then $1, $1.50, $2 … up to $5, then back to $0.50) the spin that gets it there
// wins the whole bank in real coins (USDC, else USDT, else STRK).
//
// The house always keeps (1 − FORTUNE.bank) of every spin: the bank is the only cash that goes back
// out, and it is made of 30% of what came in since the last win. Skins are ours to give.
//
// Pure bookkeeping, no I/O: the lobby debits the spin, credits wins, and the server persists toJSON().
export const FORTUNE = {
  price: 50, // mills: $0.05
  bank: 0.3, // share of each spin into the fortune bank
  marks: [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000], // mills: the bank pays out at the next mark
  // the reel: w = weight; a real skin is rare, everything else is a 72h trial
  slots: [
    { k: 'trial', w: 470 },
    { k: 'wtrial', w: 460 },
    { k: 'outfit', rarity: 'common', w: 30 }, // real skins, kept for good
    { k: 'outfit', rarity: 'rare', w: 18 },
    { k: 'wskin', rarity: 'rare', w: 15 },
    { k: 'outfit', rarity: 'epic', w: 5 },
    { k: 'wskin', rarity: 'epic', w: 2 },
  ],
};

export class FortuneBook {
  constructor({ data = {}, onChange = null, now = () => Date.now(), rnd = Math.random } = {}) {
    this.pool = data.pool ?? 0; // mills in the bank
    this.step = data.step ?? 0; // which mark is next
    this.spins = data.spins ?? 0;
    this.taken = data.taken ?? 0; // mills that came in
    this.paid = data.paid ?? 0; // mills that went back out as jackpots
    this.wins = data.wins ?? []; // last jackpots: { at, name, mills, asset }
    this.onChange = onChange;
    this.now = now;
    this.rnd = rnd;
  }

  toJSON() {
    return { pool: this.pool, step: this.step, spins: this.spins, taken: this.taken, paid: this.paid, wins: this.wins };
  }

  mark() {
    return FORTUNE.marks[this.step % FORTUNE.marks.length];
  }

  view() {
    return { price: FORTUNE.price, pool: this.pool, mark: this.mark(), wins: this.wins.slice(0, 8), slots: FORTUNE.slots.map(({ k, rarity }) => ({ k, rarity })) };
  }

  // one paid spin: which slot the reel lands on, and the jackpot if this spin fills the bank
  spin() {
    const total = FORTUNE.slots.reduce((s, x) => s + x.w, 0);
    let roll = this.rnd() * total;
    let slot = FORTUNE.slots.length - 1;
    for (let i = 0; i < FORTUNE.slots.length; i++) {
      if (roll < FORTUNE.slots[i].w) {
        slot = i;
        break;
      }
      roll -= FORTUNE.slots[i].w;
    }
    this.spins++;
    this.taken += FORTUNE.price;
    this.pool += Math.floor(FORTUNE.price * FORTUNE.bank);
    let jackpot = null;
    if (this.pool >= this.mark()) {
      jackpot = this.pool;
      this.paid += jackpot;
      this.pool = 0;
      this.step++;
    }
    this.onChange?.(this);
    return { slot, jackpot };
  }

  // remember a jackpot for the winners' list (the lobby knows the name and the coin)
  won(name, mills, asset) {
    this.wins.unshift({ at: this.now(), name: String(name ?? 'runner').slice(0, 24), mills, asset });
    if (this.wins.length > 20) this.wins.length = 20;
    this.onChange?.(this);
  }
}
