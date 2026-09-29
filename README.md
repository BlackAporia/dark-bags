# DARK BAGS

A browser extraction game played for sats. Think Escape from Tarkov crossed with Counter-Strike's Arms Race and a battle-royale storm: everyone stakes, readies up and drops in together with a knife and 100 health. Kill to climb from knife to laser sniper, grab the orange loot, outrun the shrinking storm and get out through an exit it hasn't swallowed yet. Die, and everything you carried drops on the floor for whoever gets there first.

**The hook is privacy.** Nobody can see how much anyone is carrying. A fat target and an empty bluffer look the same, and you choose how big your own bag *looks*. Without that, every match turns into "everyone shoots the leader".

> **Test build by default.** Without `CHAIN` set, every token is play money: no deposits, no withdrawals. With `CHAIN=sepolia` or `mainnet` the server runs a real cashier on Starknet (see [Real tokens](#real-tokens)); read [Before real money](#before-real-money) first.

## Run it

```bash
npm install
npm start            # http://localhost:8080
```

The lobby has two modes:

- **Online**: humans on the same server share raids; bots fill each raid to ~10 runners.
- **Practice vs bots**: the same game code running entirely in your browser tab. Works with no server. Every bot is for itself (they fight each other from the first second), they are softer (slower to react, sloppier aim, bursts with pauses, half damage on you) and the raid ends the moment you die or get out.

Other commands:

```bash
npm test             # rules, economy, privacy, netcode, rooms (node:test, no deps)
npm run sim -- 4     # headless bot raids, prints the ledger per raid
npm run build        # dist/index.html: the whole game in one ~190 KB file (practice mode)
npm run build:wallets # client/vendor/wallets.js: the wallet layer for real-token mode
npm run dev          # server with auto-restart
npm run house -- status   # operator console for real-token mode
```

Env vars for the server: `PORT` (8080), `ROUND_SECONDS` (180), `PREP_SECONDS` (20, the ready-room countdown), `BOTS` (`0` to disable), `WALLET_FILE` (path to persist test balances as JSON; in-memory otherwise), `RANKS_FILE` (path to persist career ranks), and `CHAIN` plus the cashier settings under [Real tokens](#real-tokens).

## A raid

| | |
|---|---|
| **Ready room** | Pick a table (100, 1,000 or 10,000 sats) and a token, then press *Stake & ready*. The stake is escrowed and your icon lights up. The first Ready starts a 20 s countdown (5 s once every human in the room is ready); bots light up in the last seconds; the pot grows in the middle. Cancel before the start and you get the stake back. Nobody joins mid-raid. |
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
| **Bots** | Nobody gets piled on: bots leave humans alone for the first 8 s, then at most two press one human at a time (unless you start it), and they hit humans for 75% damage online, 50% in practice. Online they keep a truce with each other for 30 s so they don't farm guns off each other. |
| **Rank** | Every raid pays career rank XP, win or lose: 40 for showing up, 50 a kill, damage, time alive, first blood, multi-kills, a full arsenal lap, and 120 plus a profit bonus for extracting (practice pays half). 90 ranks from Lance Corporal I to Legend, each with its own insignia drawn in code; rank 2 takes one raid, Legend about 1.8 M XP. Your badge sits on your name tag, in the ready room and on the result card. |

Controls: `WASD` move · mouse aim · click attack · `Space` dash · `Q` bag look · `M` sound · `N` music. On phones: left thumb moves, right thumb aims and fires.

**18+ mode** (lobby checkbox, off by default): as health drops a runner loses one leg, then the other and crawls; the head pops on death; blood stays on the floor. Off, hits throw sparks and armour chips instead. Either way the dead are dragged into a grave that cracks open under them.

## Look and sound

- Runners are single-line stick figures in the spirit of Gravity Defied, standing upright on a top-down map, with walk cycles, recoil, knife swings and per-weapon line art. Health bars over everyone go green → yellow → red.
- The map is drawn from procedural textures (concrete slabs, diamond-plate vaults with hazard-striped doorways, brick, cinder block, crates, shipping containers, painted roads, puddles, manholes, a perimeter fence). Everything that looks solid is solid; everything on the floor is flat paint. It renders once into cached chunks per zoom level, and quality steps down on its own if frames get slow.
- Every sound is synthesized (no audio files): layered gunshots per weapon through a generated reverb, stereo placement by where things happen, flesh and armour hits, bone cracks, ricochets, coin clinks, footsteps, a heartbeat at low health, a storm drone that swells near the edge. The soundtrack is generated live too: a dark pulse in the lobby, a build-up in the ready room, techno/drum & bass in the raid that speeds up with each storm stage and hits harder when enemies are close or you're extracting.

## Economy

Tables are priced in sats; you pay in any token you hold. At the moment you press Ready the stake is quoted in your token (rounded up, so the house is never short) and escrowed at that rate; an extraction pays back in the same token at that same entry rate, so price moves during a raid change nothing. The test wallet holds a basket (sats, STRK, ETH, USDC, USDT, strkBTC) at fixed test prices; in real-token mode the list and prices are live (see below).

Inside the raid everything is integer sats and conserved. For a 1,000 stake: 50 rake, 475 in your bag, 475 into the loot pool.

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

Limitation: the server operator can see everything. A trust-minimised version would commit bags as hashes and prove payouts with ZK proofs (a good fit for Starknet); that is roadmap, not code. On the money side, private STRK20 deposits and cash-outs already keep amounts and counterparties off the public chain (below).

## Real tokens

Start the server with `CHAIN=sepolia` (or `mainnet`) and the lobby turns into a cashier on Starknet. The house is one Starknet account; players sign in, deposit to it, play from an in-game balance and cash out to the address they signed in with. It is custodial, like a casino cage: the house holds deposits between raids.

### Signing in

| Way in | How it works |
|---|---|
| **Any Starknet wallet** | Found with get-starknet v6: wallet-standard wallets (Ready, Braavos, Xverse, OKX, Keplr…), injected `window.starknet_*`, MetaMask through its Starknet snap. Missing ones are listed with install links. The player signs a SNIP-12 login message (free); the server checks it on chain with the account's `is_valid_signature`, so the account must be deployed. |
| **Cartridge** | Cartridge Controller through Starkzap: passkey or social login, gasless, with deposits pre-approved as session policies. |
| **Privy** | Email code, Google, X, Discord or Apple through Privy's JS SDK. The server verifies the Privy access token, creates one Privy server wallet on Starknet per user (ArgentX v0.5 account, the Starkzap default) and derives the address; the browser drives that wallet through Starkzap's `PrivySigner`, which asks `POST /api/privy/sign` to sign, and the server signs only for the wallet owned by the token's user. |

A session is bound to the address. A leaked session token can play with that balance but cannot move money anywhere else: cash-outs go only to the signed-in address.

### Deposits and cash-outs

- **Private (STRK20).** From a privacy wallet (Ready, Xverse) the deposit is a private transfer inside the STRK20 pool (`wallet_strk20InvokeTransaction`). Observers see an encrypted note, not who paid the house or how much. The house discovers its notes with its viewing key (`strk20-discovery`, which verifies the pool state it downloads against the chain) and credits each note to its sender. Private cash-outs are private transfers from the house, built and proved with the official Privacy SDK; the player must be registered in the pool.
- **Public.** A plain ERC-20 `transfer` to the house from any wallet (Starkzap for Cartridge and Privy). The client reports the tx hash; the server reads the receipt, and each `Transfer` into the house is credited once, always to its sender, never to whoever reported it. With a paymaster key, Privy and Cartridge deposits are gasless through `POST /api/paymaster`, which keeps the key on the server and only sponsors deploys and transfers of table tokens to the house (20 a day per account).
- **Cash-outs** are debited first and paid one at a time. The journal entry is on disk before anything is signed. A payout that failed before sending (preflight or proof error) is refunded; one that may have reached the chain is held as *review* and never retried automatically, so nothing is paid twice. `npm run house -- review` lists them.
- **Prices.** Every minute each token is quoted against WBTC through Ekubo (Starkzap swap provider, no API key): WBTC base units are sats. BTC wrappers sit at par unless the pool says otherwise within ±10%. A price older than 10 minutes switches that token off for staking. `FIXED_PRICES` overrides the feed (useful on Sepolia).

### Settings

| Env | |
|---|---|
| `CHAIN` | `off` (default), `sepolia`, `mainnet` |
| `HOUSE_ADDRESS`, `HOUSE_PRIVATE_KEY` | The house account (an existing deployed account). Without the key, deposits work and cash-outs are off. |
| `CASHIER_FILE` | JSON journal: balances, sessions, deposits, payouts. Required for anything real; put it on a persistent disk (`/data` in Docker). |
| `RPC_URL`, `CLIENT_RPC_URL` | Server and browser RPC (default: Starkzap's presets). |
| `TOKENS`, `EXTRA_TOKENS` | Preset symbols (default `STRK,ETH,USDC,USDT,WBTC`) and extras as `SYMBOL:0xaddress:decimals[:btc]`, e.g. strkBTC. |
| `FIXED_PRICES`, `PRICE_SECONDS`, `MIN_WITHDRAW_SATS` | `STRK=150,USDC=1000`, feed period (60), smallest cash-out (100 sats). |
| `STRK20_VIEWING_KEY`, `STRK20_PROVER_URL`, `STRK20_POOL`, `STRK20_FEED_URL`, `STRK20_CACHE_DIR` | Private deposits need the viewing key (pool defaults to mainnet `0x0403…812a`); private cash-outs also need the prover and the house key. Needs Node 24+ and the optional `strk20-discovery` package (the Docker image has both). |
| `PAYMASTER_API_KEY`, `PAYMASTER_URL` | AVNU paymaster for gasless house payouts and sponsored player deposits. |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_CLIENT_ID` | Privy sign-in. Add the game's origin to the app's allowed origins and enable the login methods you want. |
| `CARTRIDGE=0` | Hides the Cartridge option. |

The browser wallet layer is a separate 2.5 MB bundle (`npm run build:wallets`, done by the Dockerfile and the Render blueprint) loaded only when a player opens the cashier. The static single-file build can point at a real-token server (`DARK_BAGS_SERVER`); the server allows it cross-origin for `/api/*` and `/vendor/*`.

### House console

`npm run house -- <command>` with the same env as the server:

- `status`: tokens held vs owed to players per token (flags any shortfall), and payouts in review.
- `review`, `resolve <id> sent <0xtx>`, `resolve <id> refund`: settle held payouts (stop the server first).
- `register`: publish the house viewing key in the STRK20 pool, once, before taking private deposits.
- `pools <staker>`, `stake <pool> <amount> [token]`, `position <pool>`, `claim <pool>`, `unstake <pool> <amount> [token]`, `exit <pool>`: delegate idle house funds with Starkzap staking.
- `swap <from> <to> <amount>`: rebalance the treasury through Ekubo.

`stake` and `swap` refuse to touch more than the house's own surplus (held minus owed) unless given `--force`.

### What comes from Starkzap

Used: network and token presets, `StarkSigner` house wallet, ERC-20 transfers with preflight, paymaster fee mode, Ekubo swap quotes and swaps, Cartridge onboarding, the Privy signer and account presets, validator staking. Not used, on purpose: the Ethereum/Solana bridges (need Layerswap/Hyperlane keys and are a deposit UX of their own), lending, DCA and Troves (nothing to do with a game's treasury yet), and Tongo confidential transfers (STRK20 covers privacy here). Starkzap 4.0.0 declares a `starkzap/privacy` export that is missing from the published package, so the STRK20 pieces use the official Privacy SDK and the wallet API directly.

### Not verified here

This was built without network access to Starknet RPCs, Ekubo, Privy or the STRK20 feed, so everything that talks to them is covered by tests against fakes and by the published type definitions, not by live transactions. Before real money: run it on Sepolia end to end (sign in with each option, a public and a private deposit, both cash-outs, a restart mid-payout).

## Code map

```
shared/            runs identically on server and in the browser
  config.js        every tunable number
  world.js         one raid: movement, weapons, loot, storm, extraction, streaks, ledger, per-player snapshots
  weapons.js       the Arms Race ladder and experience values
  ranks.js         career ranks 1-90, the XP curve, what a raid is worth
  zone.js          the storm plan: nested circles collapsing onto the last exit
  movement.js      deterministic movement, shared with client prediction
  bot.js, nav.js   bots (vision-limited, A* on a grid) that farm, fight, flee and extract
  map.js           seeded procedural maps: vaults, cover, 3 of 8 exits
  room.js          a table: ready room → raid → results, stake escrow, message routing
  lobby.js         sessions + tables; the whole client protocol (including the cashier messages)
  wallet.js        test wallet, also the ledger behind the real cashier
  assets.js        tokens, prices, sats ↔ token units
server/index.js    static files + WebSocket + 30 Hz loop + /api routes
server/cashier/    real tokens: cashier.js (ledger, sign-in, deposits, payouts), starknet.js (Starkzap),
                   strk20.js (private pool), privy.js, prices.js, config.js, index.js (journal, HTTP)
client/            canvas renderer, stick figures, fx (blood, graves, sparks), textures + chunked map layer,
                   synthesized sfx and music, prediction/interpolation, HUD, touch controls,
                   cashier.js (sign-in and cashier UI), rankbadge.js (rank insignia as SVG)
client/chain/      wallet layer (get-starknet, Starkzap, Cartridge, Privy) → client/vendor/wallets.js
test/              node:test suites
scripts/           headless sim, single-file build, wallet bundle, house console
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

## Before real money

1. **Sepolia first.** Everything chain-facing is tested against fakes only (see *Not verified here*). Run full cycles on Sepolia with each sign-in option.
2. **Persistence and ops.** `CASHIER_FILE` on a persistent volume with backups; one server process per journal; alerts on `house status` shortfalls and on payouts in review. A database with idempotent payouts is the next step past a JSON journal.
3. **Bots.** House bots must not play for real money (or must be disclosed and funded separately). Set `BOTS=0` on real-money tables.
4. **Integrity.** Anti-collusion (teaming in a free-for-all), per-IP limits, one process per region to start.
5. **Legal.** Wagering real money on game outcomes is regulated differently by country (gambling vs skill-gaming rules, licensing, age and geo checks), and a custodial cashier adds money-transmission questions. Get advice before turning it on for real players.

## Next up

- Playtest the numbers: bot lethality, rake, bag share, loot curve (`npm run sim` helps).
- Skins as the first cosmetic purchase; golden raids sold to sponsors.
- Share cards: a generated image of your best extraction for X.
- Raid replays/clips for streamers.
