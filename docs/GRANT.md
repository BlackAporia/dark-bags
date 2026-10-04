# DARK BAGS: a Starknet grant brief

**One line:** a fast top-down extraction shooter in the browser where every stake, deposit, swap
and cash-out is private by default. It is built on Starknet's zero-knowledge stack (the STRK20
shielded pool), and players can play with Bitcoin on Starknet.

This brief follows what the Foundation looks for today: a working MVP, a business model that
does not depend on the grant, a go-to-market plan with measurable traction, and a fit with the
ecosystem's priorities (**privacy** and **Bitcoin**). Every claim below points to code in this
repository or to a live endpoint.

---

## 1. Why this belongs on Starknet now

| Starknet priority | What DARK BAGS does with it | Where |
|---|---|---|
| **Privacy (STRK20)** | Private deposits: a player tops up from their shielded balance and the house reads the note with its viewing key. Nobody on chain sees who paid or how much. | `server/cashier/strk20.js`, cashier route `private` |
| **Privacy (STRK20)** | Private cash-outs: winnings go back into the player's shielded balance (Privacy SDK, STARK proof from the proving service). | `server/cashier/strk20.js` |
| **Privacy (product)** | Private stakes: a table is a stake range. Each player's stake is known only to them; the ready room shows only the whole pool. Pot modes split like poker side pots, so mixed stakes stay fair. | `shared/stakes.js`, `World.payPot` |
| **Privacy (product)** | Private swaps: coins swap inside the game balance at the live price and never touch the chain, so no explorer shows them. Public swaps run through AVNU for players who want them. | `shared/lobby.js` swap, `client/swap.js` |
| **Bitcoin** | BTC on Starknet (WBTC and other BTC wrappers) stakes like any coin. Winnings come back in BTC at the entry rate. Players bring BTC over with Atomiq or Garden, linked from the cashier. | `shared/assets.js`, `client/bridge.js` |
| **Onboarding** | Sign in with any Starknet wallet, Cartridge (passkey, gasless) or email (Privy). Buy with a card through AVNU, or bridge in from StarkGate, Layerswap, Atomiq, Garden and others. | `client/cashier.js`, `client/bridge.js` |

The players stay in the game because it is a good game. Privacy and Bitcoin are simply how the
money works, and that money is what puts users, volume and TVL on Starknet.

## 2. The product (live)

- **The game.** 20 maps and 17 modes:
  - extraction raid, battle royale, duel, deathmatch, hardcore, weapon-only modes;
  - 2v2, 4v4 and 8v8 teams, ranked, zombies, gold rush.
- **Server-authoritative play.** Every hit, drop and payout is decided on the server; every
  match's ledger balances to the mill (`World.audit()`).
- **Retention.** Ranks 1–90, achievements and titles, battle pass, daily calendar and tasks,
  ranked seasons with a leaderboard.
- **Social.** Friends, guilds, chat, in-match voice, invites with a referral share.
- **Reach.** Phone and desktop, 11 languages including Arabic (RTL) and Swahili, and the
  language follows the player's country. Nyx, the guide, walks every new player through the
  game and plays their first match with them.
- **Practice.** Free play against bots, no account needed: the top of the funnel.

Play: the landing page links straight into the game. Tests: `npm test` (180+).

## 3. Business model (no grant needed to run)

| Revenue | How it works | Rate |
|---|---|---|
| Rake on stakes | Every staked entry, any mode. 4% to the house, 1% to the room's jackpot (paid back to players as golden raids). The house never stakes money of its own and cannot lose on a match. | 5% of stakes (`CFG.RAKE`) |
| Shop | Cosmetic bags and crates ($0.49–$999), featured daily store, starter pack ($1.99), Insider card ($4.99 / 30 days), battle pass. Cosmetics never change the fight. | List prices in `shared/cosmetics.js`, `shared/store.js` |
| Swaps | In-game swaps between coins. | 0.3% spread (`CFG.SWAP_FEE`) |
| Fortune wheel | $0.05 spins, part of each spin fills a bank paid out to players. | `shared/fortune.js` |

Full numbers, simulations and the economy audit are in `docs/TOKENOMICS.md`.

Unit economics: revenue grows linearly with staked volume ($ staked × 4%), plus shop
conversion. Costs are servers (Railway, about tens of dollars a month at the current scale)
and Starknet fees, which the paymaster can sponsor.

## 4. Go-to-market

1. **Free practice as the funnel.** No wallet and no sign-up; the guided first match ends with
   a prompt to go online.
2. **Starknet-native distribution.** Starknet Gaming channels (X, Telegram community), wallet
   partners (Ready, Xverse, Cartridge) and privacy-focused communities around STRK20.
3. **Referrals.** Inviters earn a share of the house cut on their friends' stakes, as shop credit.
4. **Bitcoin holders.** "Play with your BTC, privately": campaigns with the BTC bridges (Atomiq,
   Garden) and BTCfi communities on Starknet.
5. **Tournaments and ranked seasons.** Sponsored seasons with prizes for the leaderboard.
6. **Global reach on day one.** Mobile-first, 11 languages, so it works in markets that are
   underserved by English-only crypto games (Turkey, India, LATAM, Africa, the Arab world).

## 5. Traction: live, public, verifiable

`GET /api/impact` on the game server returns totals only, never a player:
- players (total, active in the last 7 and 30 days) and the online peak;
- matches played and the $ staked in them;
- deposits and cash-outs on chain, and **how many went privately through STRK20**;
- **BTC deposited**;
- the value players hold in the game (TVL);
- a 30-day daily series.

The same numbers show on the landing page and on the in-game **Starknet** page. Revenue (rake and
shop) stays private: it is on the team's analytics page (`/api/admin/stats`, admin wallets only)
and can be shared with the Foundation directly.

> Fill in from `/api/impact` at the time of applying: players, 7-day actives, matches,
> $ staked, private transfers, TVL. Attach the 30-day chart.

## 6. Milestones the grant would accelerate (proposed)

| Milestone | KPI | Target (fill in) |
|---|---|---|
| Mainnet closed beta → open | Players with a wallet, 7-day actives | … |
| Privacy adoption | Share of deposits and cash-outs through STRK20 | … % |
| Bitcoin | BTC staked per month | … |
| Volume | $ staked per month (drives rake revenue) | … |
| TVL | $ held in the game | … |
| Retention | D7 retention of online players | … % |

## 7. Use of funds (fill in)

| Item | Share |
|---|---|
| User acquisition (creators, tournaments, referral boosts) | … |
| Security review of the cashier and the STRK20 integration | … |
| Legal (real-money play, licensing by market) | … |
| Infrastructure and regional match servers | … |

## 8. Risks and how they are handled

- **Real-money play is regulated.** It launches as a capped closed beta (per-player and total
  balance limits, an allowlist), 18+, only where the law allows. Legal advice comes before any
  public real-money launch.
- **Custody.** The house wallet is separate from the team's. Cash-outs only go back to the
  address the player signed in with. Withdrawals over the limits are held for a manual check.
- **Fairness.** The server decides every hit and payout. Matches are humans only online (bots
  only in free practice), so the house never plays against its players. Every ledger is audited.
