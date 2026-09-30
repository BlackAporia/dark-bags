// Builds the static site for GitHub Pages:
//   dist/index.html, site.css, site.js, media/  the landing page (site/)
//   dist/play/index.html  the game as one file (practice mode works with no server)
//   dist/artifact.html    body-only fragment of the game for embedding hosts that supply the <head>
// Set DARK_BAGS_SERVER=wss://your-server to point the static build's Online mode at a game server.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';

const bundle = await build({
  entryPoints: ['client/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: ['es2020'],
  legalComments: 'none',
});
const code = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('client/style.css', 'utf8');
const html = await readFile('client/index.html', 'utf8');
const server = process.env.DARK_BAGS_SERVER || '';

function page(artifact) {
  const flags = [
    'window.DARK_BAGS_STATIC=true;',
    artifact ? 'window.DARK_BAGS_ARTIFACT=true;' : '',
    server ? `window.DARK_BAGS_SERVER=${JSON.stringify(server)};` : '',
  ].join('');
  // function replacers: the minified bundle may contain "$&"-style sequences
  let out = html
    .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`)
    .replace('<script type="module" src="main.js"></script>', () => `<script>${flags}</script>\n<script>${code}</script>`);
  if (artifact) {
    const a = out.indexOf('<!--@page-->');
    const b = out.indexOf('<!--@end-->');
    out = `${out.slice(a + '<!--@page-->'.length, b).replace(/<\/head>\s*<body>/, '').trim()}\n`;
  }
  return out;
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist/play', { recursive: true });
await cp('site', 'dist', { recursive: true });
await writeFile('dist/play/index.html', page(false));
await cp('client/voice', 'dist/play/voice', { recursive: true }); // Nyx's voice lines, loaded on demand
await writeFile('dist/artifact.html', page(true));
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`dist/index.html (landing), dist/play/index.html ${kb(page(false))}, dist/artifact.html ${kb(page(true))}${server ? `, online → ${server}` : ''}`);
