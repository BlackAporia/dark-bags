import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// A local `t` (a lerp factor, a token) inside a file that translates with t() turns every t('…')
// in that scope into "t is not a function": a frame that throws draws nothing (the raid froze
// whenever a titled player came on screen). No such shadowing in client or shared code.
function enclosing(s, i) {
  let depth = 0;
  let j = i;
  while (j > 0) {
    const c = s[--j];
    if (c === '}') depth++;
    else if (c === '{') {
      if (depth === 0) break;
      depth--;
    }
  }
  depth = 0;
  for (let k = j; k < s.length; k++) {
    if (s[k] === '{') depth++;
    else if (s[k] === '}' && --depth === 0) return k;
  }
  return s.length;
}

test('no local t shadows the translator where t() is called', () => {
  const hits = [];
  for (const dir of ['client', 'shared']) {
    for (const f of readdirSync(new URL(`../${dir}/`, import.meta.url)).filter((x) => x.endsWith('.js'))) {
      const s = readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8');
      if (!/import \{[^}]*\bt\b[^}]*\} from '\.\/i18n\.js'/.test(s)) continue;
      for (const m of s.matchAll(/(?:const|let|var)\s+t\s*=|[(,]\s*t\s*[,)]\s*=>|\bt\s*=>/g)) {
        const from = m.index + m[0].length;
        const to = m[0].includes('=>') ? s.indexOf('\n', from) : enclosing(s, m.index);
        for (const c of s.slice(from, to).matchAll(/(?<![\w.$])t\(/g)) hits.push(`${dir}/${f}:${s.slice(0, from + c.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});
