import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const setOf = (text, name) => new Set([...text.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`))[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

test('every message the client sends to a match server is one a match server accepts', () => {
  const room = setOf(src('client/region.js'), 'ROOM_MSGS');
  const edge = setOf(src('server/index.js'), 'EDGE_MSGS');
  // ready goes through the stake ticket; everything else must pass the edge's filter
  for (const t of room) if (t !== 'ready') assert.ok(edge.has(t), `${t} is dropped by match servers`);
});

test("room messages never share a name with the lobby's own (they would never reach the room)", () => {
  const lobby = src('shared/lobby.js');
  const own = new Set([...lobby.matchAll(/^ {6}case '([a-z_]+)':/gm)].map((m) => m[1]));
  for (const t of ['in', 'watch', 'buy', 'upgrade', 'bluff', 'pick', 'vote', 'wswap', 'descend']) assert.ok(!own.has(t), `'${t}' is taken by the lobby`);
});
