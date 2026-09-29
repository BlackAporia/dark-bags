# DARK BAGS

A browser extraction game played for sats. Think agar.io crossed with Escape from Tarkov: you walk into a 3-minute raid with a sats stake, grab the orange loot, shoot other runners for their bags, and get to a green exit before the raid seals. Die, and everything you carried drops on the floor for whoever gets there first.

**The hook is privacy.** Nobody can see how much anyone is carrying. A fat target and an empty bluffer look the same, and you choose how big your own bag *looks*. Without that, every match turns into "everyone shoots the leader".

> **Test build.** All sats are play money: no deposits, no withdrawals. See [Before real sats](#before-real-sats).

## Run it

```bash
npm install
npm start            # http://localhost:8080
```

The lobby has two modes:

- **Online**: humans on the same server share raids; bots fill each raid to ~10 runners.
- **Practice vs bots**: the same game code running entirely in your browser tab. Works with no server.

Other commands:

```bash
npm test             # rules, economy, privacy, netcode, rooms (node:test, no deps)
npm run sim -- 4     # headless bot raids, prints the ledger per raid
npm run build        # dist/index.html: the whole game in one ~85 KB file (practice mode)
npm run dev          # server with auto-restart
```

Env vars for the server: `PORT` (8080), `ROUND_SECONDS` (180), `BOTS` (`0` to disable), `WALLET_FILE` (path to persist test balances as JSON; in-memory otherwise).

## A raid

| | |
|---|---|
| **Stake** | Pick a table: 100, 1,000 or 10,000 sats. 5% rake. Half of the rest rides in your bag, half is scattered on the map as loot. You start in the red and have to farm or fight to profit. |
| **Loot** | Orange dust (2% of the stake), stacks (8%), and chests (30%) that spawn only inside walled vaults. |
| **Vision** | You see ~52 m around you and never through walls. Runners behind cover are not even sent to your client. |
| **Fight** | 5 hits to drop someone. Dash to dodge. 3 s spawn shield, gone the moment you fire. |
| **Bluff** | `Q` switches your bag's look between small, medium and fat. Purely cosmetic: look broke and slip out, or look rich and bait a fight. |
| **Drops** | A dead runner's bag lies on the floor with a **?**. Only the one who opens it learns what was inside. |
| **Extract** | Stand in a green exit for 3 s. Any hit resets the timer. You cash out your whole bag. |
| **Seal** | Entry closes at 1:00. At 0:00 anyone still inside loses their bag to the next raid's loot pool. |
| **Golden raid** | Every 4th raid at a table gets a sponsor bonus (3× stake) in extra loot. |

Controls: `WASD` move · mouse aim · click shoot · `Space` dash · `Q` bag look · `M` sound. On phones: left thumb moves, right thumb aims and fires.

## Economy

Everything is integer sats and conserved. For a 1,000 stake: 50 rake, 475 in your bag, 475 into the loot pool.

Every raid keeps a ledger and the tests assert, tick by tick through full bot raids:

```
stakes + sponsor bonus + rollover in  ==  rake + payouts + rollover out + sats still inside
```

What leaves a raid unclaimed (bags of runners who didn't make it, loot on the floor, unspawned pool) rolls into the next raid at that table, so pots grow when people get greedy. All tuning lives in [`shared/config.js`](shared/config.js).

## Privacy model

What "private" means in this build:

- The server is authoritative and **never serialises another runner's bag**. Your snapshot holds your own bag and nothing else ([`World.snapshotFor`](shared/world.js)); a test checks the JSON for leaks.
- The public feed says who dropped whom and who extracted, **never amounts**. Pickups, drop contents and payouts are private events to the one player involved.
- Visibility is culled on the server by distance **and** line of sight, so a modified client can't reveal runners behind walls.
- The bag's look is self-chosen, so size on screen proves nothing.

Limitation: the server operator can see everything. A trust-minimised version would commit bags as hashes and prove payouts with ZK proofs (a good fit for Starknet); that is roadmap, not code.

## Code map

```
shared/            runs identically on server and in the browser
  config.js        every tunable number
  world.js         one raid: movement, bullets, loot, extraction, ledger, per-player snapshots
  movement.js      deterministic movement, shared with client prediction
  bot.js, nav.js   bots (vision-limited, A* on a grid) that farm, fight, flee and extract
  map.js           seeded procedural maps: vaults, cover, 3 of 8 exits
  room.js          a table: raids back to back, wallet in/out, message routing
  lobby.js         sessions + tables; the whole client protocol
  wallet.js        test-sats wallet (the adapter to replace for real money)
server/index.js    static files + WebSocket + 30 Hz loop
client/            canvas renderer, prediction/interpolation, HUD, touch controls
test/              node:test suites
scripts/           headless sim, single-file build
```

Netcode: 30 Hz authoritative simulation, 15 Hz snapshots (~0.5 KB each), client-side prediction with input replay for your own runner, 110 ms interpolation for everyone else.

## Deploy for playtests

**Render (simplest).** `render.yaml` is a blueprint: Render → New → Blueprint → pick this repo. The free plan supports WebSockets but sleeps after ~15 idle minutes, so the first visit after a pause takes ~50 s.

**Docker (Fly.io, Railway, a VPS).**

```bash
docker build -t dark-bags .
docker run -p 8080:8080 dark-bags
```

**Static demo.** Every CI run attaches `dark-bags-single-file` (the practice build) to the run. If GitHub Pages is enabled (Settings → Pages → Source: GitHub Actions; private repos need a paid plan), `pages.yml` publishes it on every push. Set the repo variable `DARK_BAGS_SERVER=wss://your-server` and that build's Online tab connects to your game server. Any build also accepts `?server=wss://…` in the URL.

## Before real sats

1. **Wallet adapter.** Replace `MemoryWallet` with the same four methods (`ensure`, `balance`, `debit`, `credit`) backed by Lightning (instant, sats-native) or BTC on Starknet (on-chain settlement, better path to provable fairness).
2. **Accounts and persistence.** Test tokens live in localStorage and balances in memory/JSON. Real money needs auth, a database, idempotent payouts, and an audit log fed from the per-raid ledger.
3. **Bots.** House bots must not play for real money (or must be disclosed and funded separately). Set `BOTS=0` on real-money tables.
4. **Integrity.** Anti-collusion (teaming in a free-for-all), per-IP limits, one process per region to start.
5. **Legal.** Wagering real money on game outcomes is regulated differently by country (gambling vs skill-gaming rules, licensing, age and geo checks). Get advice before turning deposits on.

## Next up

- Playtest the numbers: bot lethality, rake, bag share, loot curve (`npm run sim` helps).
- Skins as the first cosmetic purchase; golden raids sold to sponsors.
- Share cards: a generated image of your best extraction for X.
- Raid replays/clips for streamers.
