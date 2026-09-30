import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STRINGS } from '../client/strings.js';
import { ACHIEVEMENTS } from '../shared/achievements.js';
import { WEAPONS } from '../shared/weapons.js';
import { RARITY_ORDER } from '../shared/cosmetics.js';

const en = STRINGS.en;
const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();

test('every language has every string, with the same placeholders', () => {
  assert.equal(Object.keys(STRINGS).length, 10);
  for (const [lang, d] of Object.entries(STRINGS)) {
    for (const k of Object.keys(en)) {
      assert.ok(typeof d[k] === 'string' && d[k].length, `${lang} is missing ${k}`);
      assert.equal(vars(d[k]), vars(en[k]), `${lang} ${k} placeholders`);
    }
  }
});

test('every key the client uses exists', () => {
  const used = new Set();
  const html = readFileSync(new URL('../client/index.html', import.meta.url), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-html|-ph|-title)?="([^"]+)"/g)) used.add(m[1]);
  for (const f of readdirSync(new URL('../client/', import.meta.url)).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(new URL(`../client/${f}`, import.meta.url), 'utf8');
    if (!/from '\.\/i18n\.js'/.test(src)) continue;
    for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  }
  for (const a of ACHIEVEMENTS) used.add(`ach.${a.id}`).add(`achd.${a.stat}`);
  for (const w of WEAPONS) used.add(`w.${w.name}`);
  for (const r of RARITY_ORDER) used.add(`r.${r}`);
  for (let i = 1; i <= 5; i++) used.add(`streak.${i}`);
  for (let i = 0; i <= 2; i++) used.add(`bluff.${i}`);
  used.add('q.short').add('q.shortDeposit');
  for (const k of used) assert.ok(k in en, `missing string ${k}`);
});
