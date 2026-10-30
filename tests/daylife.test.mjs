// A day in people's lives: routines interrupted (sick, errands, visits, working late, staying in), what places remember
// (visits, who works or comes here, where people last saw you) and crises when a need stays at zero.
// Run: node tests/daylife.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'daylife');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js');
const time = await D('sim/time.js'); const people = await D('sim/people.js'); const DL = await D('sim/daylife.js');
const facts = await D('sim/facts.js'); const living = await D('sim/living.js'); const needs = await D('sim/needs.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));
const open = (s) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = s; return store.game(); };
seed(6);
const modern = world(ext, 'modern'); W.registerWorld(modern);

// interruptions
{
    const g = open(fixture('v0.1.0-modern.json'));
    const kinds = {};
    for (let d = g.day; d < g.day + 60; d++) for (const r of Object.values(g.cast)) { const b = DL.breakOf(g, modern, r, d); if (b) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1; }
    const n = Object.keys(g.cast).length * 60;
    console.log('  interruptions in 60 days:', JSON.stringify(kinds), 'of', n);
    ok(kinds.sick > 0 && kinds.errand > 0 && kinds.visit > 0, 'people get sick, run errands and visit friends');
    ok(Object.values(kinds).reduce((a, b) => a + b, 0) < n * 0.4, 'most days follow the routine');
    // where they are follows the interruption
    let checked = 0;
    const start = g.day;
    for (let d = start; d < start + 30 && checked < 20; d++) for (const r of Object.values(g.cast)) {
        const b = DL.breakOf(g, modern, r, d); if (!b) continue;
        g.day = d; g.minutes = (b.from % 1440) + 10;
        if (people.whereNow(g, modern, r) === b.place) checked++; else ok(false, `${r.name} should be at ${b.place} (${b.kind})`);
    }
    ok(checked >= 10, `people are where the interruption puts them (${checked})`);
    ok(JSON.stringify(DL.breakOf(g, modern, Object.values(g.cast)[0], 40)) === JSON.stringify(DL.breakOf(open(fixture('v0.1.0-modern.json')), modern, Object.values(g.cast)[0], 40)), 'the same day gives the same interruption');
    const off = structuredClone(modern); off.id = 'still'; off.features = { ...off.features, living: false }; W.registerWorld(off);
    ok(Object.values(g.cast).every(r => !DL.breakOf(g, off, r, 40)), 'living world off: routines are never interrupted');
}
// what places remember
{
    const g = open(fixture('v0.1.0-modern.json'));
    g.player.loc = 'cafe'; g.minutes = 10 * 60;
    const someone = Object.values(g.cast)[0]; someone.met = true; someone.routine = { weekday: [[0, 'cafe']], weekend: [[0, 'cafe']] };
    DL.notice(g, modern, people.presentAt(g, modern, 'cafe'));
    ok(DL.visitsTo(g, 'cafe').n === 1 && DL.placeMemoryLines(g, modern, []).some(l => /first time/.test(l)), 'a first visit');
    DL.notice(g, modern, []); ok(DL.visitsTo(g, 'cafe').n === 1, 'staying is not a new visit');
    for (let i = 0; i < 8; i++) { g.player.loc = 'park'; DL.notice(g, modern, []); g.player.loc = 'cafe'; DL.notice(g, modern, []); }
    ok(DL.placeMemoryLines(g, modern, []).some(l => /a regular here \(9 visits\)/.test(l)), 'a regular after many visits');
    ok(DL.lastSeen(g, someone.avatar)?.place === 'cafe', 'people remember where they saw you');
    g.player.loc = 'mall'; g.day += 2;
    ok(DL.placeMemoryLines(g, modern, [someone]).some(l => l.includes(`${someone.name} last saw {{user}} at`) && l.includes('2 days ago')), 'and say so elsewhere');
    const job = modern.occupations.find(o => o.place === 'mall'); someone.occupation = job?.id;
    if (job) ok(DL.placeMemoryLines(g, modern, [someone]).some(l => l === `${someone.name} works here.`), 'who works here');
}
// crises at zero
{
    const g = open(fixture('v0.1.0-modern.json'));
    g.player.loc = 'cafe'; g.minutes = 9 * 60; g.asleep = false;
    const seen = Object.values(g.cast)[1]; seen.met = true; seen.routine = { weekday: [[0, 'cafe']], weekend: [[0, 'cafe']] };
    g.player.stats.hunger = 0; for (const s of ['energy', 'thirst', 'mood', 'hygiene']) g.player.stats[s] = 100;
    const before = facts.facts(g).length;
    let msgs = time.advance(g, modern, 60);
    ok(!msgs.some(m => /faint/.test(m)), 'no crisis right away');
    g.player.stats.hunger = 0;
    msgs = time.advance(g, modern, 150);
    ok(msgs.some(m => /faint from hunger/.test(m)), 'after hours at zero: a crisis');
    ok(g.player.stats.hunger > 0, 'the need comes back up');
    const f = facts.facts(g).slice(before).find(x => x.kind === 'crisis');
    ok(f && f.who.includes(seen.avatar), 'the people who saw it remember it');
    ok(/Just now: .*nearly fainted from hunger/.test(needs.feelings(g, modern)), 'the AI knows it just happened');
    g.player.stats.hunger = 0; msgs = time.advance(g, modern, 30);
    ok(!msgs.some(m => /faint from hunger/.test(m)), 'not again right after');
    // hygiene: people who see it think less of you
    const a0 = living.approvalOf(g, seen.avatar);
    g.player.stats.hygiene = 0; g.player.stats.hunger = 100; g.player.stats.thirst = 100; g.player.loc = 'cafe';
    msgs = time.advance(g, modern, 7 * 60);
    ok(msgs.some(m => /smell/.test(m)) && living.approvalOf(g, seen.avatar) < a0, 'a public crisis costs approval with who saw it');
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
