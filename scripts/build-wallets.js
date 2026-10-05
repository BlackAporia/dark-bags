// Bundles the real-token wallet layer (client/chain/entry.js: get-starknet, Starkzap,
// Cartridge, Privy) into client/vendor/wallets.js. The game never loads it unless the
// server runs with CHAIN set and a player opens the cashier, so practice mode and the
// single-file build stay small. Run by `npm run build:wallets` (and in the Dockerfile).
import { build } from 'esbuild';
import { stat, readFile } from 'node:fs/promises';

const out = 'client/vendor/wallets.js';
await build({
  entryPoints: ['client/chain/entry.js'],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import', 'module'],
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  // node built-ins some deps reference behind runtime checks, and Starkzap's optional
  // peers for features the game does not use (Solana/Hyperlane bridge); the AVNU SDK is
  // bundled: the swap screen uses it
  external: ['node:*', 'fs', 'path', 'crypto', 'os', 'module', 'url', 'worker_threads', 'child_process', '@hyperlane-xyz/*'],
  logLevel: 'warning',
  plugins: [
    {
      // Starkzap gives the Cartridge keychain iframe 10 s to load, then fails with "Cartridge
      // Controller failed to initialize". On a busy browser (many extensions, slow network) it
      // needs longer: give it 45 s.
      name: 'cartridge-wait',
      setup(b) {
        b.onLoad({ filter: /starkzap[\\/]dist[\\/]src[\\/]wallet[\\/]cartridge\.js$/ }, async (args) => {
          const src = await readFile(args.path, 'utf8');
          const out = src.replace('const MAX_CONTROLLER_WAIT_MS = 10000;', 'const MAX_CONTROLLER_WAIT_MS = 45000;');
          if (out === src) console.warn('build-wallets: Starkzap changed, the Cartridge wait patch did not apply');
          return { contents: out, loader: 'js' };
        });
      },
    },
  ],
});
const { size } = await stat(out);
console.log(`${out} ${(size / 1024 / 1024).toFixed(2)} MB`);
