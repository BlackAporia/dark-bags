// Declare and deploy the DARK BAGS vault (contracts/) from the house account.
//
//   (uses the committed contracts/build; the server can also do all this itself with VAULT_AUTO=1)
//   CHAIN=sepolia HOUSE_ADDRESS=0x… HOUSE_PRIVATE_KEY=0x… RPC_URL=https://… \
//   STRK20_POOL=0x… VAULT_OWNER=0x… VAULT_TREASURY=0x… npm run vault:deploy
//
// The operator is the house account; its Stark key signs every private payout, so it must be the
// key in HOUSE_PRIVATE_KEY. VAULT_OWNER (a separate wallet, ideally a multisig) can pause the vault
// and rotate the operator. Prints the VAULT_ADDRESS and VAULT_FROM_BLOCK to set on the server.
// Keys only ever come from the environment: never paste them anywhere else.
import { readFileSync } from 'node:fs';
import { Account, RpcProvider, ec, json } from 'starknet';
import { STRK20_POOL_MAINNET, STRK20_POOL_SEPOLIA } from '../server/cashier/config.js';

const env = process.env;
const need = (k) => env[k] || (console.error(`set ${k}`), process.exit(1));
const network = need('CHAIN');
const pool = env.STRK20_POOL || (network === 'mainnet' ? STRK20_POOL_MAINNET : STRK20_POOL_SEPOLIA);
const house = need('HOUSE_ADDRESS');
const key = need('HOUSE_PRIVATE_KEY');
const owner = need('VAULT_OWNER');
const treasury = env.VAULT_TREASURY || house;

const provider = new RpcProvider({ nodeUrl: need('RPC_URL') });
const account = new Account({ provider, address: house, signer: key });
const dir = new URL('../contracts/build/', import.meta.url); // committed build (scarb build + copy)
const sierra = json.parse(readFileSync(new URL('dark_bags_DarkBagsVault.contract_class.json', dir), 'utf8'));
const casm = json.parse(readFileSync(new URL('dark_bags_DarkBagsVault.compiled_contract_class.json', dir), 'utf8'));
const operatorKey = ec.starkCurve.getStarkKey(key);

console.log(`deploying DarkBagsVault on ${network}: pool ${pool}, owner ${owner}, operator ${house}, treasury ${treasury}`);
const r = await account.declareAndDeploy({ contract: sierra, casm, constructorCalldata: [pool, owner, house, operatorKey, treasury] });
await provider.waitForTransaction(r.deploy.transaction_hash);
const rc = await provider.getTransactionReceipt(r.deploy.transaction_hash);
console.log(`\nVAULT_ADDRESS=${r.deploy.contract_address}\nVAULT_FROM_BLOCK=${rc.block_number ?? 0}\n`);
console.log('Next: ask the STRK20 pool admins to set the vault\'s open-note screening policy (see contracts/README.md).');
