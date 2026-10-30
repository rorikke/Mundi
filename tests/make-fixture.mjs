// Plays two weeks of a game with a given build of Mundi (no AI, no SillyTavern) and writes the save it leaves.
// Run with an OLD build to get a save exactly as players of that version have it:
//   node tests/make-fixture.mjs <repo-or-worktree> <world> <out.json> [seed]
import fs from 'node:fs';
import { stage, browser, seed, world } from './env.mjs';

const [root, worldId, out, n = '7'] = process.argv.slice(2);
const ext = stage(root, 'fixture');
browser({}); seed(Number(n));
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js');
const time = await D('sim/time.js'); const needs = await D('sim/needs.js'); const work = await D('sim/work.js');
const bills = await D('sim/bills.js'); const social = await D('sim/social.js'); const facts = await D('sim/facts.js');
const plans = await D('sim/plans.js'); const skills = await D('sim/skills.js'); const life = await D('sim/life.js');
const romance = await D('sim/romance.js');
const w = world(ext, worldId);
if (W.registerWorld) W.registerWorld(w);

// the save, the way startNewGame makes it
const zone = w.homes.zones.find(z => z.id === (w.catalogs.origins?.[0]?.home ?? '')) ?? w.homes.zones[0];
const g = { v: 1, world: w.id, lang: 'en', day: w.time.startDay, minutes: w.time.startMinutes, speed: w.time.speed,
    player: { loc: 'home:player', home: { zone: zone.id, kind: zone.kind, x: zone.spots[0][0], y: zone.spots[0][1], n: 1 },
        stats: Object.fromEntries(w.statuses.map(s => [s.id, s.start])), money: w.catalogs.origins?.[0]?.money ?? 500,
        traits: { proficiency: (w.sheet.traits?.[0]?.options ?? []).slice(0, 2), personality: ['Kind', 'Calm'] }, origin: w.catalogs.origins?.[0]?.id ?? '', job: null, rentPaidDay: w.time.startDay },
    cast: {}, tick: {}, log: [], cfg: { difficulty: 'normal' } };
w.cast.examples.forEach((ex, i) => {
    const z = w.homes.zones.find(x => x.id === ex.home) ?? w.homes.zones[0];
    const s = z.spots[(i + 1) % z.spots.length];
    g.cast[`ex${i}.png`] = { avatar: `ex${i}.png`, name: ex.name, occupation: ex.occupation, home: { zone: z.id, x: s[0], y: s[1], n: ((i + 1) % z.spots.length) + 1 },
        routine: structuredClone(w.cast.routineTemplates[ex.routine] ?? Object.values(w.cast.routineTemplates)[0]), leisure: ex.leisure ?? [], met: i < 3 };
});
store.setGame(g);
const people = Object.values(g.cast);
const until = (h) => { const m = ((h * 60 - g.minutes) + 1440) % 1440 || 1440; time.advance(g, w, m); };

// a job that needs no course and fits your traits
const job = w.occupations.find(o => !(o.courses ?? []).length && work.fits(g, o));
for (let tries = 0; tries < 10 && !g.player.job; tries++) { work.hire(g, w, job.id); g.day += 0; if (!g.player.job) until(9); }
const course = skills.coursesOf(w)[0];
for (let d = 0; d < 14; d++) {
    until(8);
    const home = needs.actionsHere(g, w).find(a => a.home && (a.effects?.hunger ?? 0) > 0);
    if (home) needs.applyAction(g, w, home);
    if (g.player.job && work.isOpen(g, work.jobDef(w, g.player.job.id))) { g.player.loc = work.jobDef(w, g.player.job.id).place; work.workShift(g, w, 'normal'); }
    if (d === 1 && course && g.player.money >= course.cost) skills.enroll(g, w, course.id);
    if (d === 3) { const it = life.shopItems(w).sort((a, b) => a.price - b.price)[0]; if (it) life.buy(g, w, it.id); }
    const r = people[d % people.length];
    r.met = true; social.addBond(g, r.avatar, 8); romance.addRomance(g, r.avatar, d % 3);
    facts.note(g, '{u} spent time with {0}.', [r.name], [r.avatar], g.player.loc, 'social');
    (social.social(g).threads[r.avatar] ??= []).push({ me: true, text: `Day ${d}: hi ${r.name}!`, at: store.nowAbs(g) }, { me: false, text: 'Hey!', at: store.nowAbs(g) + 2 });
    if (d === 5) { const p = w.places.find(x => (x.tags ?? []).includes('leisure')); plans.add(g, r.avatar, p.id, store.nowAbs(g) + 2 * 1440, 'hangout'); }
    for (const b of (bills.billList ? bills.billList(w) : bills.BILLS)) if (bills.owed(g, b.id)) bills.payBill(g, w, b.id);
    g.player.loc = 'home:player';
    until(23);
}
fs.writeFileSync(out, JSON.stringify(g, null, 1));
console.log(`${out}: day ${g.day}, money ${g.player.money}, job ${g.player.job?.id ?? '-'}, facts ${facts.facts(g).length}, keys ${Object.keys(g).join(',')}`);
