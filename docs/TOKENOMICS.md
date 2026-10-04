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

Rank-ups pay one thing: a random outfit to wear for 1 hour. There is no currency
reward for ranks, so XP cannot be farmed into money.

Internally every value is an integer in mills ($0.001). Token prices come from USDC
swap quotes (Ekubo through Starkzap); stablecoins are pegged to $1, BTC wrappers to
WBTC; a price older than 10 minutes switches that coin off for staking.

## 2. Where the money goes in a raid

Every entry pays the player's own **private stake**: a table is a stake band ($0.10–$0.99, $1–$9.99,
$10–$99.99, $100–$10,000) and each player picks any amount inside it. Only they are told it; the
ready room shows the whole pool. The stake is escrowed in the coin the player
picked at that moment's price. Winnings go back in the same coin at the **entry** rate,
so price moves during a raid change nothing.

| | Raid (extraction) | Pot modes (battle royale, duel, deathmatch, guns + lasers, hardcore, weapon modes, teams) |
|---|---|---|
| Rake | 5% of each stake | 5% of each stake |
| of which house | 4% | 4% |
| of which room jackpot | 1% (players' stakes only) | 1% |
| The other 95% | half in your bag, half scattered as loot | one prize pot |
| Who gets paid | whoever extracts, with what they carry | the last player (or team) standing; a team splits the pot equally, fallen teammates included. Deathmatch modes: the most kills when time runs out (a tie splits it). With stakes of different sizes the pot splits like poker side pots: a winner takes from each runner at most what they risked themselves, and the part of a bigger stake that nobody matched goes back to its owner (`World.payPot`) |
| Unclaimed money | rolls into the next raid at that table | rolls into the next raid (only if nobody survives, or nobody in a deathmatch scores a kill) |

Guns + Lasers credits (for medkits, turrets and tripmines) are earned only by kills inside
the match, cannot be bought, and vanish at the end: no pay-to-win, and nothing to cash out.

Golden raids (every 4th raid) add up to 3× the stake to the loot/pot, **paid from the
room jackpot**, never by the house. Before this change the house paid that bonus out of
nothing: 0.75× stake per raid on average against 0.05× in rake from a lone player,
a guaranteed loss. Now it is self-funding.

Every raid's ledger balances to the mill (`World.audit()`, checked by the tests and by
`scripts/sim.js`): stakes + jackpot bonus + rollover in = rake + payouts + rollover out +
money still inside.

**Bots play only in practice.** Online every seat is a real player: a raid starts once
at least two players are ready (the room waits, with no timer, until someone presses
Start or it fills up). The house never stakes money of its own, so it cannot lose on a
raid: its income is the 4% rake on every stake, whoever wins.

We simulated the alternative before removing it (one bot-driven "player" per raid,
100 raids per mode). With house bots in online rooms the economics were broken in
both directions at once:
- bots held a truce among themselves and hunted humans, so an average player extracted in
  0% of raids and won 0% of battle royales (a player-hostile, rigged-looking game);
- in deathmatch, guns + lasers and hardcore, the human-only advantages (softer bot hits,
  the grace period, bots climbing the weapon ladder three times slower) let an average
  player win 2–9× their fair share, and the house lost $0.60–$2.50 per $1 raid.
Making bots fair fixed the first and made the second worse. Real players against real
players has neither problem.

## 3. The shop

Skins come from boxes, the featured store (bought outright), the battle pass and ranked. Two families, always sold separately:
**outfit bags** for your runner and **weapon crates** for your guns and knife. Nine tiers
each:

| Tier | Price | Mythic or better | Exotic | ≈ $ per Exotic | Guarantee |
|---|---|---|---|---|---|
| Street / Scrap | $0.49 | 0% | 0% | — | Epic+ in 15, Legendary+ in 60 |
| Vault / Armory | $0.99 | 0.2% | 0% | — | same |
| Golden / Brass | $1.99 | 0.9% | 0.08% | $2,490 | same |
| Elite / Spec Ops | $3.99 | 2% | 0.18% | $2,220 | same |
| Diamond | $7.99 | 4.4% | 0.4% | $2,000 | same |
| Obsidian | $14.99 | 8.9% | 0.85% | $1,760 | same |
| Royal | $29.99 | 20% | 2% | $1,500 | **Exotic within 60** |
| Apex | $59.99 | 39.5% | 4.5% | $1,330 | **Exotic within 30** |
| Genesis | $99.99 | 63% | 8% | $1,250 | **Exotic within 16** |

- Exact odds are printed on every box and rolled on the server.
- Smart drops: you get something you don't own while that rarity has any left.
- Limited editions (for example *First Block #1*, 21 ever; *Multiverse Prime*, 100) are
  numbered as they drop and never over-minted, even across restarts. The dearer the
  box, the larger the share of Exotics that are limited (2% up to 35%).
- Buy 1 to 100 at once; boxes you hold are used first; one charge for the rest, and
  **every 10th box is free** (10 for the price of 9).

**Why these prices.** The old ladder ran $0.99 → $999. It now runs $0.49 → $99.99:
- *Entry*: $0.49 is an impulse buy, which matters most for the first purchase (the
  single biggest step in conversion).
- *Ceiling*: nobody buys a single $999 box; whales buy ×10 or ×100 of the $99.99 one,
  with the 10% bulk bonus, so the top-end spend is still there and spread over many
  opens (more reveals, more share cards).
- *Up-sell*: every tier is better value than the one below (an Exotic's expected price
  falls from ~$2,490 to ~$1,250, a Mythic's from ~$250 to ~$160), which pulls players up
  the ladder.
- *Scarcity*: an Exotic still costs over $1,000 in expectation, and a smaller share of
  them are limited editions than before, so numbered skins stay rare.
- *Cost to us*: duplicates refund 10% of their rarity's value in shop $ (never cash).
  That is at most ~2% of the price on the top tier and ~15% on the $0.49 box, and only
  once a player has the whole rarity; everything else is margin.

**First top-up doubles.** A player's first shop $ pack comes with the same amount again,
up to $25 extra (the $5 pack gives $10 of shop $; capped so the bigger packs' own bonus
still matters on the second top-up). Turning a free player into a paying
one is the biggest single step in conversion, and shop $ costs nothing to mint: it can
only be spent on boxes, never withdrawn.

**Margin.** Digital goods: close to 100% gross margin, less payment and chain costs.

### Offers next to the cases (`shared/store.js`)

| Offer | Price | What you get | Why |
|---|---|---|---|
| **Featured store** | $1.49 Rare · $3.99 Epic · $14.99 Legendary · $39.99 Mythic | six skins a day (2 outfits, 2 weapon skins, 2 style), the same for everyone, new set at 00:00 UTC; never limited, Exotic or season items | buy the exact skin you want, no roll; a timer creates urgency; lowers the loot-box-only regulatory risk |
| **Insider card** | $4.99 / 30 days | $1 shop $ at once, $0.15 shop $ + 1 wheel spin a day (claimed), +25% pass XP, the card-only Insider frame | the best retention tool in mobile games: a reason to log in every day; ~$5.50 of shop $ + 30 spins for $4.99 |
| **Starter pack** | $1.99, once | an Epic outfit, 2 Vault bags + 1 Armory crate (full odds), 5 spins, an Epic frame (~$11 at shop prices) | a second, cheap first-purchase moment for players who never top up |
| **Pass tiers** | $0.99 each, 10 for $8.99 | battle-pass tiers outright | the end-of-season push for the last rewards |

### VIP levels (`shared/vip.js`)

Ten levels by real money paid over all time (shop $ packs plus the USDC/USDT part of any
purchase; free shop $ never counts): $5, $20, $50, $100, $250, $500, $1,000, $2,500, $5,000,
$10,000. Perks are comfort and status, never power in a match: +2% to +15% extra shop $ on
every top-up, 1 to 5 free wheel spins a day (from VIP 3), the VIP Gold frame at VIP 5 and
VIP Diamond at VIP 8, and a VIP badge next to your rank.

### Free versus paid

Free play (the calendar, daily/weekly tasks, achievements, invites, the free pass track,
free wheel spins) tops out at **Epic**: free boxes are gift boxes that roll no higher than
Epic, free style items are Common to Epic, and a player who does everything every day
gets about **$3 of shop $** and ~58 wheel spins a month (free shop $ is kept small because
it buys full-odds boxes). Legendary, Mythic and Exotic come from paid boxes, the premium
pass, ranked division prizes and the featured store. Wheel trial skins last 1 hour.

The **fortune wheel** ($0.05 a spin, or free spins) has 18 slots, all Epic or lower: 1-hour
skins, real skins, shop $, pass XP, XP boosts, style, gift boxes, extra spins. Paid spins
put 30% into the fortune bank, paid out in real coins when it reaches its mark; free spins
never touch the bank.

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
- 14 modes on the same engine (including deathmatch, a CSDM-style guns + lasers mode and hardcore), 10 languages, runs on a phone browser with no install.
- Trust signals: published odds, server-side rolls, pity, numbered limited editions,
  withdrawals to your own address, an auditable ledger.

**What can sink it**
1. **Liquidity (the main risk now).** With no bots online, a raid needs two or more
   players at the same table at the same time. 14 modes × 3 tables split a small crowd
   into empty rooms. At launch, feature one table ($1) and two or three modes (duel,
   battle royale, deathmatch), show where people wait (done: waiting counts, invites,
   friends and guilds), and schedule "raid hours" so players meet. Open more tables and
   modes as concurrency grows.
2. **Rake is small per raid.** 4% of a $1 stake is $0.04: rake alone needs volume
   (1,000 raids a day ≈ $40 at $1). The shop is where the margin is; the game's job is to
   keep people playing long enough to want a look.
3. **Regulation (the biggest risk).**
   - Staking real money on a game outcome is gambling or skill gaming in most countries:
     you need a licence (for example Malta, Isle of Man, Curaçao, or per-state in the US),
     KYC/AML, age 18+, and geo-blocking where it is not allowed.
   - Paid loot boxes are banned in Belgium, restricted in the Netherlands, need published
     odds in China and South Korea, and are under review in the EU and UK. Selling skins
     **only** through boxes is the riskiest version of that model (the $99.99 ceiling helps);
     the exotic guarantee on the top tiers helps, spending limits help more (not built yet).
   - Get a lawyer before taking real money.
4. **Chain dependencies.** Prices, deposits and withdrawals depend on Starknet RPCs and
   on liquidity in Ekubo/AVNU pools. A dead feed switches a coin off (by design).

**What to measure from day one:** D1/D7/D30 retention (a good target is 35% / 12% / 5%),
raids per daily player, players per raid and time waiting for a raid, payer conversion
(first top-up) and ARPPU, rake per daily player, box revenue by tier, refunds and
chargebacks.

**Where the money comes from, in order:**
1. **Shop** (bags and crates for shop $): nearly all margin, no risk. Levers in place:
   a free first bag, $0.49 entry box, first top-up doubled, bulk (10th box free), pity,
   limited numbered editions, share cards.
2. **Rake** (4% house + 1% table jackpot on every stake): grows with players per raid
   and raids per player.
3. **Swap spread** (0.3%, in-game swaps).

**Suggested launch order:** free practice + shop (lowest risk, builds a community) →
public testnet with real players → real-money tables in licensed regions.

**Not built yet, worth adding before real money:** spending and session limits
(responsible gaming), self-exclusion, provably fair box seeds (commit and reveal),
KYC/geo-blocking hooks. Built since: the daily calendar and tasks, the battle pass, the
featured store, the Insider card, the starter pack.

**Next levers (not built):** a trade-up contract (10 duplicates → one rarity up), collection
sets with a completion reward, gifting boxes and skins to friends, VIP levels by lifetime
spend, two-week event cases, kill-counter add-ons. A player-to-player market would add a
fee line but is the riskiest one legally (skin gambling): only with legal advice.
