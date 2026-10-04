# DARK BAGS vault (Cairo)

`DarkBagsVault` holds the game's private money on Starknet. It plugs into the **STRK20 privacy
pool** the same way StarkWare's own anonymizers do (`ekubo_swap_anonymizer` in
[starkware-libs/starknet-privacy](https://github.com/starkware-libs/starknet-privacy)): the pool
calls `privacy_invoke` on it inside a private transaction, after the private actions ran, and
applies the open-note deposits it returns.

Privacy is an extra. The plain public deposit and cash-out (a token transfer to and from the house
wallet) stay available to every player.

## What goes on chain, and what does not

| Flow | Transaction | On chain | Hidden |
|---|---|---|---|
| Private deposit | player's wallet: STRK20 `withdraw` to the vault + `invoke` `DEPOSIT [token, amount, reference]` | vault received X of a coin for a random reference | which wallet paid (the sender is encrypted in the pool), which player it was (the reference is random and only the server knows whose it is) |
| Private cash-out | house: STRK20 open note for the player + `invoke` `PAYOUT [id, token, n, (note, amount)…, sig]` | vault paid X into a note | whose note it is (the owner is encrypted); the money lands in the player's shielded balance |
| Staked match | house: `open_match(id, pots)` then `settle_match(id, rakes, root)` | each coin's whole pot, the house cut, a Poseidon root | who played, who staked what, who won |

The contract guarantees:

- only the pool can call `privacy_invoke`, and a deposit is credited only for funds that actually
  arrived;
- every payout carries the operator's signature over its note ids and amounts, and each payout id
  can be paid once;
- a locked pot cannot be paid out until it is settled or voided, and its house cut can never go
  over **5%** (`MAX_RAKE_BPS`);
- `result_root` is a Poseidon hash over each player's `(salt, coin, stake)` leaf. The game sends
  every player their own leaf and salt in the match result, so a player can check that their stake
  was counted without anyone else learning it.

What it does not change: the game is custodial and the server decides who won. The operator can
also move free funds to the house wallet (`sweep`) to pay public cash-outs. The owner (a separate
wallet, ideally a multisig) can pause the vault and rotate the operator.

## Build and test

Scarb 2.17 and Starknet Foundry 0.63:

```sh
cd contracts
scarb build
snforge test        # 15 tests, including a mock STRK20 pool that applies invokes like the real one
```

`payout_hash_matches_the_server` and `test/vault.test.js` check the same hash value, so the
server's signatures (`server/cashier/vault.js`) are the ones the contract accepts.

## Deploy

```sh
cd contracts && scarb build && cd ..
CHAIN=sepolia RPC_URL=… HOUSE_ADDRESS=… HOUSE_PRIVATE_KEY=… \
VAULT_OWNER=… VAULT_TREASURY=… STRK20_POOL=… npm run vault:deploy
```

Then set `VAULT_ADDRESS` and `VAULT_FROM_BLOCK` on the game server (Railway Variables). Keys go
only in the host's variables, never in git or chat.

Before mainnet:

1. **Screening.** The pool screens open-note depositors. By default a contract that fills open
   notes needs a screening attestation for its own address. Ask the STRK20 pool admins to set the
   vault's policy (`Exempt` or `Delegated`) or get it screened, or private cash-outs will revert.
2. **Audit.** Get the vault reviewed before it holds real money, and keep the beta caps on.
3. Private cash-outs also need `STRK20_VIEWING_KEY` and `STRK20_PROVER_URL` (the house registers
   in the pool once with `npm run house -- register`).
