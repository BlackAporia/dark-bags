# DARK BAGS

A browser extraction game played for sats. Think Escape from Tarkov crossed with Counter-Strike's Arms Race and a battle-royale storm: everyone stakes, readies up and drops in together with a knife and 100 health. Kill to climb from knife to laser sniper, grab the orange loot, outrun the shrinking storm and get out through an exit it hasn't swallowed yet. Die, and everything you carried drops on the floor for whoever gets there first.

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
npm run build        # dist/index.html: the whole game in one ~160 KB file (practice mode)
npm run dev          # server with auto-restart
```

Env vars for the server: `PORT` (8080), `ROUND_SECONDS` (180), `PREP_SECONDS` (20, the ready-room countdown), `BOTS` (`0` to disable), `WALLET_FILE` (path to persist test balances as JSON; in-memory otherwise).

## A raid

| | |
|---|---|
| **Ready room** | Pick a table (100, 1,000 or 10,000 sats) and press *Stake & ready*. The stake is escrowed and your icon lights up. The first Ready starts a 20 s countdown (5 s once every human in the room is ready); bots light up in the last seconds; the pot grows in the middle. Cancel before the start and you get the stake back. Nobody joins mid-raid. |
| **Arms race** | Everyone starts equal: knife, 100 health. Kills are worth a weapon each (damage and loot add a little experience): knife → pistol → shotgun → SMG → rifle → laser sniper → knife again with a ★. The sniper's laser is visible to others, so it gives you away. |
| **Storm** | The circle shrinks four times and collapses onto one exit, the *last exit*. Exits it swallows close for good. Outside the circle you lose health every second, more each stage. New loot only lands inside the next circle. |
| **Stake** | 5% rake. Half of the rest rides in your bag, half is scattered on the map as loot. You start in the red and have to farm or fight to profit. |
| **Loot** | Orange dust (2% of the stake), stacks (8%), and chests (30%) that spawn only inside walled vaults. |
| **Vision** | You see ~52 m around you and never through walls. Runners behind cover are not even sent to your client. |
| **Bluff** | `Q` switches your bag's look between small, medium and fat. Purely cosmetic: look broke and slip out, or look rich and bait a fight. |
| **Drops** | A dead runner's bag lies on the floor with a **?**. Only the one who opens it learns what was inside. |
| **Extract** | Stand in an open exit for 3 s. Any hit resets the timer. You cash out your whole bag. Still inside at 0:00, you lose it to the next raid's pot. |
| **Streaks** | First blood (announced to everyone), then double kill, triple kill, rampage, godlike for kills chained within 4 s. Each has its own animation, sting and announcer line. |
| **Golden raid** | Every 4th raid at a table gets a sponsor bonus (3× stake) in extra loot. |

Controls: `WASD` move · mouse aim · click attack · `Space` dash · `Q` bag look · `M` sound · `N` music. On phones: left thumb moves, right thumb aims and fires.

**18+ mode** (lobby checkbox, off by default): as health drops a runner loses one leg, then the other and crawls; the head pops on death; blood stays on the floor. Off, hits throw sparks and armour chips instead. Either way the dead are dragged into a grave that cracks open under them.

## Look and sound

- Runners are single-line stick figures in the spirit of Gravity Defied, standing upright on a top-down map, with walk cycles, recoil, knife swings and per-weapon line art. Health bars over everyone go green → yellow → red.
- The map is drawn from procedural textures (concrete slabs, diamond-plate vaults with hazard-striped doorways, brick, cinder block, crates, shipping containers, painted roads, puddles, manholes, a perimeter fence). Everything that looks solid is solid; everything on the floor is flat paint. It renders once into cached chunks per zoom level, and quality steps down on its own if frames get slow.
- Every sound is synthesized (no audio files): layered gunshots per weapon through a generated reverb, stereo placement by where things happen, flesh and armour hits, bone cracks, ricochets, coin clinks, footsteps, a heartbeat at low health, a storm drone that swells near the edge. The soundtrack is generated live too: a dark pulse in the lobby, a build-up in the ready room, techno/drum & bass in the raid that speeds up with each storm stage and hits harder when enemies are close or you're extracting.

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
  world.js         one raid: movement, weapons, loot, storm, extraction, streaks, ledger, per-player snapshots
  weapons.js       the Arms Race ladder and experience values
  zone.js          the storm plan: nested circles collapsing onto the last exit
  movement.js      deterministic movement, shared with client prediction
  bot.js, nav.js   bots (vision-limited, A* on a grid) that farm, fight, flee and extract
  map.js           seeded procedural maps: vaults, cover, 3 of 8 exits
  room.js          a table: ready room → raid → results, stake escrow, message routing
  lobby.js         sessions + tables; the whole client protocol
  wallet.js        test-sats wallet (the adapter to replace for real money)
server/index.js    static files + WebSocket + 30 Hz loop
client/            canvas renderer, stick figures, fx (blood, graves, sparks), textures + chunked map layer,
                   synthesized sfx and music, prediction/interpolation, HUD, touch controls
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
