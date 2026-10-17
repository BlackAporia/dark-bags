# Security

DARK BAGS handles accounts, balances and on-chain money, so we take reports seriously.

## Reporting a vulnerability

Please report it privately:

- GitHub: **Security → Report a vulnerability** on this repository (a private advisory only the team sees), or
- a direct message to [@play_dark_bags](https://x.com/play_dark_bags) on X asking for a private channel.

Do not open a public issue, post in the Telegram group or test against other players' accounts or funds. Include what you found, how to reproduce it and what it affects. We will confirm receipt, keep you posted, and credit you when it is fixed if you wish.

## In scope

- The game server (`server/`, `shared/`): accounts, sessions, balances, the cashier, stakes and payouts, fair-play checks
- The web client (`client/`, `site/`)
- The vault contract (`contracts/`)

Denial of service by flooding, social engineering and issues in third-party services (wallets, Privy, hosting) are out of scope.

## How secrets are kept

- No keys, passwords or admin tokens are stored in this repository or its history. The server reads them from its environment only (`HOUSE_PRIVATE_KEY`, `ADMIN_KEY`, `REGION_SECRET`, `BACKUP_SECRET` and the rest).
- The admin key is sent in a request header, never in a URL.
- The simulation is server-authoritative: clients send only inputs, so speed, teleport and damage cheats have nothing to change.

## Scams

DARK BAGS has **no token**, airdrop or presale. Nobody from the team will DM you first, ask for a seed phrase or ask you to send funds. Official news comes only from [@play_dark_bags](https://x.com/play_dark_bags).
