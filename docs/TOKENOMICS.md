# DARK BAGS: tokenomics and commercial assessment

Everything below is how the code works today (`shared/config.js`, `shared/world.js`,
`shared/room.js`, `shared/cosmetics.js`, `shared/lobby.js`). Numbers come from the code
and from `node scripts/sim.js`.

## 1. Money in the game

| Balance | What it is | In | Out |
|---|---|---|---|
| **Wallet** (coins) | Real tokens the house holds for you (USDC, USDT, STRK, ETH, BTC wrappers, anything priced). Shown in $. | Deposit (public transfer or STRK20 private pool) | Cash out to the address you signed in with (minimum $1) |
| **Shop $** | Store credit, 1 shop $ = 1 USDC/USDT. | Bought with USDC/USDT (packs add 0–30% bonus); duplicates refund 10% of their value | Only spent on bags and crates. **Never withdrawable.** |
| **Rank XP** | Progress only. | Raids and achievements | Nothing: it only moves your rank (1–90). |

Rank-ups pay one thing: a random outfit to wear for 72 hours. There is no currency
reward for ranks, so XP cannot be farmed into money.

Internally every value is an integer in mills ($0.001). Token prices come from USDC
swap quotes (Ekubo through Starkzap); stablecoins are pegged to $1, BTC wrappers to
WBTC; a price older than 10 minutes switches that coin off for staking.

## 2. Where the money goes in a raid

Every entry pays the table stake ($0.10, $1 or $10), escrowed in the coin the player
picked at that moment's price. Winnings go back in the same coin at the **entry** rate,
so price moves during a raid change nothing.

| | Raid (extraction) | Pot modes (battle royale, duel, weapon modes, teams) |
|---|---|---|
| Rake | 5% of each stake | 5% of each stake |
| of which house | 4% | 4% |
| of which room jackpot | 1% (players' stakes only) | 1% |
| The other 95% | half in your bag, half scattered as loot | one prize pot |
| Who gets paid | whoever extracts, with what they carry | the last player (or team) standing; a team splits the pot equally, fallen teammates included |
| Unclaimed money | rolls into the next raid at that table | rolls into the next raid (only if nobody survives) |

Golden raids (every 4th raid) add up to 3× the stake to the loot/pot, **paid from the
room jackpot**, never by the house. Before this change the house paid that bonus out of
nothing: 0.75× stake per raid on average against 0.05× in rake from a lone player,
a guaranteed loss. Now it is self-funding.

Every raid's ledger balances to the mill (`World.audit()`, checked by the tests and by
`scripts/sim.js`): stakes + jackpot bonus + rollover in = rake + payouts + rollover out +
money still inside.

**Bots.** Empty seats are filled by bots, and bot stakes are house money. A human who
beats bots is paid from the house's bot stakes. This is the one place the house takes
risk: it earns the 4% rake on humans, and wins or loses whatever the bots win or lose.
Bots hit humans for 75% damage online (softer in practice), leave humans alone for
their first 8 seconds, and never gang up more than two to one. See §5 for how to watch it.

## 3. The shop

Skins come only from boxes (and rank-up trials). Two families, always sold separately:
**outfit bags** for your runner and **weapon crates** for your guns and knife. Nine tiers
each:

| Tier | Price | Mythic or better | Exotic | Guarantee |
|---|---|---|---|---|
| Street / Scrap | $0.99 | 0% | 0% | Epic+ in 15, Legendary+ in 60 |
| Vault / Armory | $2.99 | 0.3% | 0% | same |
| Golden / Brass | $7.99 | 1.8% | 0.3% | same |
| Elite / Spec Ops | $19.99 | 4% | 0.7% | same |
| Diamond | $49.99 | 10% | 1.5% | same |
| Obsidian | $99 | 20% | 4% | same |
| Royal | $249 | 40% | 8% | **Exotic within 12** |
| Apex | $499 | 60% | 15% | **Exotic within 7** |
| Genesis | $999 | 80% | 30% | **Exotic within 4** |

- Exact odds are printed on every box and rolled on the server.
- Smart drops: you get something you don't own while that rarity has any left.
- Limited editions (for example *First Block #1*, 21 ever; *Multiverse Prime*, 100) are
  numbered as they drop and never over-minted, even across restarts. The dearer the
  box, the larger the share of Exotics that are limited (3% up to 50%).
- Buy 1 to 100 at once; boxes you hold are used first; one charge for the rest.

**Margin.** Digital goods: close to 100% gross margin, less payment and chain costs.

## 4. Other income

- **In-game swap**: 0.3% spread between coins in the game balance (test mode, or real
  money when the operator sets `SWAP_INTERNAL=1` and rebalances the house on chain).
- **Wallet swaps through AVNU** earn nothing for the game (AVNU's own fee applies); they
  are a convenience that keeps players in the app.

## 5. Will it be commercially successful? An honest answer

No design can guarantee success "always". What the code can do is remove the ways a game
like this dies, and what it cannot do is supply players. Here is where it stands.

**What works in its favour**
- Three revenue lines that don't depend on each other: rake (every raid), shop (whales and
  collectors), swap spread.
- The house never funds its own promotions any more (jackpot-funded golden raids).
- Retention systems players already understand: 90 ranks, 39 achievements with titles,
  a collection of 80 outfits and 144 weapon skins with limited editions, and share cards
  for X on every big moment (cheap growth).
- 11 modes on the same engine, 10 languages, runs on a phone browser with no install.
- Trust signals: published odds, server-side rolls, pity, numbered limited editions,
  withdrawals to your own address, an auditable ledger.

**What can sink it**
1. **Liquidity.** Real-money PvP needs humans at the same table at the same time. With
   few players, bots carry the raids and the house carries the risk. Start with the
   $1 table only and one or two modes; open more tables as concurrency grows.
2. **Bot risk.** If good players consistently beat bots, the house bleeds. Watch
   `room.totals` (`stakesIn`, `paidOut`, `sponsorIn`, `rake`) per table and bot win rate
   per player; set a daily cap on house bot exposure; prefer human-only pot modes for
   real money (duel, teams): there the house takes only the rake and has zero risk.
3. **Regulation (the biggest risk).**
   - Staking real money on a game outcome is gambling or skill gaming in most countries:
     you need a licence (for example Malta, Isle of Man, Curaçao, or per-state in the US),
     KYC/AML, age 18+, and geo-blocking where it is not allowed.
   - Paid loot boxes are banned in Belgium, restricted in the Netherlands, need published
     odds in China and South Korea, and are under review in the EU and UK. Selling skins
     **only** through boxes, with boxes up to $999, is the riskiest version of that model;
     the exotic guarantee on the top tiers helps, spending limits help more (not built yet).
   - Get a lawyer before taking real money.
4. **Chain dependencies.** Prices, deposits and withdrawals depend on Starknet RPCs and
   on liquidity in Ekubo/AVNU pools. A dead feed switches a coin off (by design).

**What to measure from day one:** D1/D7/D30 retention (a good target is 35% / 12% / 5%),
raids per daily player, human seats per raid, payer conversion and ARPPU, rake per daily
player, house bot P&L per table, box revenue by tier, refunds and chargebacks.

**Suggested launch order:** free practice + shop (lowest risk, builds a community) →
real-money human-only duel and team modes in licensed regions → raids with bots once the
data shows bot P&L is safe.

**Not built yet, worth adding before real money:** spending and session limits
(responsible gaming), self-exclusion, provably fair box seeds (commit and reveal),
KYC/geo-blocking hooks, an operator dashboard for `room.totals`.
