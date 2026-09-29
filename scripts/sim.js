// Headless raid: runs full rounds with bots only and prints the ledger.
// Usage: node scripts/sim.js [rounds] [stake]
import { World } from '../shared/world.js';

const rounds = Number(process.argv[2] || 3);
const stake = Number(process.argv[3] || 1000);
let rollover = 0;
for (let r = 1; r <= rounds; r++) {
  const t0 = performance.now();
  const w = new World({ stake, seed: 1000 + r, roundNo: r, rolloverIn: rollover, golden: r % 4 === 0 });
  let ticks = 0;
  let bad = null;
  while (w.phase === 'live') {
    w.step();
    ticks++;
    if (ticks % 30 === 0) {
      const a = w.audit();
      if (!a.ok && !bad) bad = { tick: ticks, ...a };
    }
    w.events.length = 0;
  }
  const ms = performance.now() - t0;
  const ps = [...w.players.values()];
  const count = (s) => ps.filter((p) => p.status === s).length;
  const a = w.audit();
  console.log(
    `raid ${r}${w.golden ? ' (golden)' : ''}: runners=${ps.length} extracted=${count('extracted')} dead=${count('dead')} mia=${count('mia')} ` +
      `| in=${a.inflow} rake=${w.ledger.rake} out=${w.ledger.botPaidOut + w.ledger.paidOut} rollover=${w.ledger.rolloverOut} ` +
      `| audit=${a.ok ? 'OK' : 'FAIL'} ${bad ? JSON.stringify(bad) : ''} | ${ms.toFixed(0)}ms for ${ticks} ticks (${(ms / ticks).toFixed(2)}ms/tick)`,
  );
  const storm = ps.filter((p) => p.cause === 'storm').length;
  const exits = ps.filter((p) => p.status === 'extracted').map((p) => Math.round(p.endedAt));
  const lastExit = ps.filter((p) => p.status === 'extracted' && p.extId === w.zonePlan.finalExit).length;
  console.log(`   storm deaths=${storm} · extraction times=[${exits.sort((a, b) => a - b).join(',')}]s · via last exit=${lastExit}`);
  const best = ps.filter((p) => p.status === 'extracted').sort((a, b) => b.payout - a.payout)[0];
  if (best) console.log(`   best exit: ${best.name} ${best.payout} sats on ${best.stake} stake, kills=${best.kills}`);
  rollover = w.ledger.rolloverOut;
}
