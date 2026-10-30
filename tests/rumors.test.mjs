// The rumor pool, lore that switches on with the world, and people's lives over the weeks.
// Run: node tests/rumors.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'rumors');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js');
const time = await D('sim/time.js'); const living = await D('sim/living.js'); const LL = await D('sim/longlife.js');
const WS = await D('sim/worldstate.js'); const DL = await D('sim/daylife.js'); const people = await D('sim/people.js');
await D('sim/prompt.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));
const open = (s) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = s; return store.game(); };
seed(8);
const base = world(ext, 'modern');

// lore that switches on with the world
{
    const w = structuredClone(base); w.id = 'lore1';
    const season = 'spring';
    w.lore.push({ keys: ['x'], content: 'SEASONAL', when: { season } }, { keys: ['y'], content: 'TENSE', when: { tensionAbove: 50 } },
        { keys: ['z'], content: 'RARE', when: { chance: 0.3 } }, { keys: ['r'], content: 'REGIONAL', when: { region: 'nowhere' } },
        { keys: ['q'], content: 'LATER', when: { fromDay: 999 } });
    W.registerWorld(w);
    const s = fixture('v0.1.0-modern.json'); s.world = w.id; const g = open(s);
    const lore = () => living.activeWorldLore(g, w);
    const sea = (await D('sim/time.js')).seasonOf(g).id;
    ok(lore().includes('SEASONAL') === (sea === season), 'a season switches lore on');
    WS.regionState(g, w, 'midtown').tension = 80; ok(lore().includes('TENSE'), 'tension above switches lore on');
    WS.regionState(g, w, 'midtown').tension = 10; ok(!lore().includes('TENSE'), 'and off');
    ok(!lore().includes('REGIONAL') && !lore().includes('LATER'), 'another region, a later day: off');
    let on = 0; const d0 = g.day; for (let d = 0; d < 100; d++) { g.day = d0 + d; if (lore().includes('RARE')) on++; } g.day = d0;
    ok(on > 15 && on < 45, `a chance each day (${on} of 100)`);
}
// world rumors, spreading, overhearing
{
    const w = structuredClone(base); w.id = 'lore2';
    w.lore.push({ keys: ['ghost'], content: 'They say the old lighthouse is haunted.', rumor: true, when: { chance: 1 } });
    W.registerWorld(w);
    const s = fixture('v0.1.0-modern.json'); s.world = w.id; const g = open(s);
    ok(!living.activeWorldLore(g, w).some(t => /lighthouse/.test(t)), 'a rumor is not told to the AI as lore');
    time.advance(g, w, 1440);
    const r = living.rumorPool(g).find(x => x.world);
    ok(r && r.knownBy.length >= 2, 'a world rumor starts with two people');
    for (let d = 0; d < 4; d++) time.advance(g, w, 1440);
    ok(r.knownBy.length > 2, `and spreads (${r.knownBy.length} know it)`);
    ok(Object.values(r.hops).some(h => h >= 2), 'passing from mouth to mouth');
    const teller = Object.values(g.cast).find(x => r.knownBy.includes(x.avatar) && (r.hops[x.avatar] ?? 1) >= 2);
    if (teller) { const all = g.living.rumors; g.living.rumors = [r]; ok(living.rumorLines(g, [teller]).some(l => /lighthouse.*(secondhand|fourth)/.test(l)), 'secondhand rumors say so'); g.living.rumors = all; }
    // overhearing: someone who knows it, in a public place, a few hours
    const knower = g.cast[r.knownBy.find(a => g.cast[a])];
    knower.routine = { weekday: [[0, 'cafe']], weekend: [[0, 'cafe']] };
    g.player.loc = 'cafe'; g.asleep = false; for (const st of w.statuses) g.player.stats[st.id] = st.max;
    let heard = []; for (let h = 0; h < 24 && !living.heardRumors(g).some(x => x.id === r.id); h++) heard.push(...time.advance(g, w, 60));
    ok(living.heardRumors(g).some(x => x.id === r.id) && heard.some(m => /overhear/.test(m)), 'you overhear it, and it goes to your journal');
    // rumors cool down and die
    for (let d = 0; d < 16; d++) time.advance(g, w, 1440);
    ok(!living.rumorPool(g).some(x => x.id === r.id && x.at === r.at), 'an old rumor dies out');
}
// people's lives over the weeks
{
    const s = fixture('v0.1.0-modern.json'); const g = open(s); const w = base; W.registerWorld(w);
    const [a, b] = Object.keys(g.cast).slice(2, 4);
    g.cast[a].met = true;
    g.living = g.living ?? {}; g.living.pairs = [[a, b]];
    const news = [];
    for (let d = 0; d < 120; d++) news.push(...time.advance(g, w, 1440));
    const st = LL.pairStage(g, a, b);
    const split = !st;
    ok(split ? news.some(m => /broke up/.test(m)) : ['engaged', 'married', 'dating'].includes(st), `a couple moves on (${st ?? 'broke up'})`);
    if (st === 'married') ok(living.homeKey(g.cast[a].home) === living.homeKey(g.cast[b].home), 'married couples live together');
    const promos = news.filter(m => /promoted/.test(m)).length + Object.keys(g.living.ranks ?? {}).length;
    ok(promos > 0, `people get promoted (${Object.keys(g.living.ranks ?? {}).length} have a higher rank)`);
    console.log('  news in 120 days:', news.filter(m => /engaged|married|broke up|promoted|new job|moved|dating/.test(m)).length);
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
