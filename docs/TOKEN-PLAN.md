# DARK BAGS token: the plan for later

**Status: on hold.** We launch a token only once the game is known and has regular players.
Until then, DARK BAGS has no token: the pinned scam warning on X stays true
(`brand/x/SCAM.md`).

## When to come back to it

Launch only when the game already gives a coin real demand. The signs, all at once:
- **Daily players:** steady, around 100 to 200 people a day.
- **A core that returns:** the same players come back day after day (`/admin.html`).
- **Community:** X and Telegram where players talk about the game on their own.
- **Real stakes:** matches regularly played for real coins (USDC, STRK, STACHE).

## The token (StarkLaunchy, starklaunchy.fun)

| Field | Plan | Why |
|---|---|---|
| Name | DARK BAGS | The official name |
| Symbol | **DBAGS** | Not `DARK` (the fake one used it). Not `BAGS` (another launchpad's name) |
| Supply | **1,000,000**, fixed | Every Launchy token starts at a $5,000 market cap, so supply only sets the unit price: $0.005 at launch, and game prices stay in readable numbers |
| Pair | Token / STRK | STRK is already on the tables |
| First buy | 3–5% | The only way to hold a reserve. It is the public **rewards wallet**: paid out to players as prizes, never sold |
| Trading | Public and protected | Protected trading on shielded balances fits our Shadow Accounts story |

**What Launchy fixes:**
- At least 95% of the supply starts in the Ekubo pool (locked liquidity).
- 1% pool fee: 0.50% creator, 0.30% Launchy, 0.20% Ekubo.
- For the first 15 minutes, one buy can take at most 2% of the supply.

**Costs:**
- Deployment: about 20 STRK.
- A first buy of 5%: about $260–300 in STRK. The wallet shows the final amount.

## What it does in the game: spending, never income

1. **Stake coin.** It works like USDC, STRK or STACHE (the STACHE code, `shared/stache.js`, is the template).
2. **DBAGS Case.** Exclusive skins, sold only in DBAGS at the live price. Part of what is spent goes to the rewards wallet, part is burned.
3. **Descent tickets.** Cheaper in DBAGS than in dollars.
4. **Holder title.** Anyone holding a set amount in a connected wallet gets a title and a name colour. Cosmetic only.
5. **The first 100 DBAGS stakers.** They get a title and 2 cases, as with STACHE.
6. **Prizes.** Weekly tournaments and ranked season prizes, paid from the rewards wallet and the creator fee.

**Never do any of these.** They make a token look like a security:
- share game revenue with holders;
- promise staking yield or buybacks;
- promise the price will go up.

## Launch day

**Before:**
- Legal advice: a token plus a real-money game.
- In the game, DBAGS sits behind a Railway variable (`DBAGS_ADDRESS`). Nothing turns on until it is set.
- The X thread, an updated pinned post, and a block on dark-bags.com that names the one official contract.

**On the day:**
1. Deploy from a **separate** wallet. Never use the game's house wallet.
2. Put the contract address in Railway right away, then redeploy.
3. Post on X and Telegram with the contract address and pin it. Say plainly: "Until now there was no token. This is the only official one; its address is only here."

## Risks, said plainly

- At $5k the pool is small, so the price will swing hard.
- Most launchpad tokens fall close to zero.
- Ours stands a chance only if the game needs it.
- Put into the first buy only what you can afford to lose.
