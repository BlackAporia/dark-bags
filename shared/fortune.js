// The shop's fortune wheel: $0.05 a spin, paid in any coin you hold (STRK, USDT, USDS, strkBTC,
// WBTC, ETH, …), or free with the spins from tasks, the calendar and mail. Every spin pays something:
// a 1-hour skin, shop $, pass XP, an XP boost, style, a gift box, another spin, now and then a real
// skin. A share of every paid spin builds the fortune bank. When the bank reaches its next mark ($0.50, then $1, $1.50, $2 … up to $5, then back to $0.50) the spin that gets it there
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
  // the wheel, segment by segment (w = weight, so the chance is w / the sum of all w). Nothing
  // here rolls above Epic: free spins (tasks, the calendar, mail) turn this same wheel.
  //   trial / wtrial: a 1-hour runner or weapon skin    outfit / wskin: a real skin to keep
  //   credit: shop cents   pass: pass XP   boost: matches at ×2 XP   spin: one more turn
  //   style: a frame, banner, kill effect or name colour   box: a gift bag or crate (up to Epic)
  slots: [
    { k: 'trial', w: 190 },
    { k: 'credit', v: 2, w: 150 },
    { k: 'style', rarity: 'common', w: 60 },
    { k: 'wtrial', w: 180 },
    { k: 'pass', v: 100, w: 90 },
    { k: 'outfit', rarity: 'common', w: 40 },
    { k: 'spin', n: 1, w: 50 },
    { k: 'credit', v: 5, w: 60 },
    { k: 'box', id: 'street', w: 14 },
    { k: 'style', rarity: 'rare', w: 30 },
    { k: 'boost', n: 1, w: 50 },
    { k: 'outfit', rarity: 'rare', w: 18 },
    { k: 'box', id: 'w-scrap', w: 12 },
    { k: 'wskin', rarity: 'rare', w: 12 },
    { k: 'credit', v: 25, w: 8 },
    { k: 'style', rarity: 'epic', w: 6 },
    { k: 'outfit', rarity: 'epic', w: 4 },
    { k: 'wskin', rarity: 'epic', w: 2 },
  ],
};

export class FortuneBook {
  constructor({ data = {}, onChange = null, now = () => Date.now(), rnd = Math.random } = {}) {
    this.pool = data.pool ?? 0; // mills in the bank
    this.step = data.step ?? 0; // which mark is next
    this.spins = data.spins ?? 0;
    this.frees = data.frees ?? 0; // free spins turned
    this.taken = data.taken ?? 0; // mills that came in
    this.paid = data.paid ?? 0; // mills that went back out as jackpots
    this.wins = data.wins ?? []; // last jackpots: { at, name, mills, asset }
    this.onChange = onChange;
    this.now = now;
    this.rnd = rnd;
  }

  toJSON() {
    return { pool: this.pool, step: this.step, spins: this.spins, frees: this.frees, taken: this.taken, paid: this.paid, wins: this.wins };
  }

  mark() {
    return FORTUNE.marks[this.step % FORTUNE.marks.length];
  }

  view() {
    const total = FORTUNE.slots.reduce((n, x) => n + x.w, 0);
    return { price: FORTUNE.price, pool: this.pool, mark: this.mark(), wins: this.wins.slice(0, 8), slots: FORTUNE.slots.map(({ w, ...x }) => ({ ...x, p: Math.round((w / total) * 1000) / 10 })) };
  }

  // which slot the wheel stops on
  roll() {
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
    return slot;
  }

  // a free spin (tasks, calendar, mail): the same wheel, but no money came in, so no bank
  free() {
    this.frees = (this.frees ?? 0) + 1;
    this.onChange?.(this);
    return { slot: this.roll(), jackpot: null };
  }

  // one paid spin: which slot the wheel stops on, and the jackpot if this spin fills the bank
  spin() {
    const slot = this.roll();
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
