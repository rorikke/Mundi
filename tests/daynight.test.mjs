// Day and night: opening hours, prices by the part of the day, the mood of the streets, and pictures for each part
// of the day. Run: node tests/daynight.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'daynight');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js');
const DN = await D('sim/daynight.js'); const WS = await D('sim/worldstate.js'); const needs = await D('sim/needs.js');
const people = await D('sim/people.js'); const P = await D('sim/prompt.js'); const DL = await D('sim/daylife.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));
const open = (s) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = s; return store.game(); };
seed(9);
const w = world(ext, 'modern'); W.registerWorld(w);
const night = 23 * 60 + 30, noon = 12 * 60;

// opening hours
ok(w.places.filter(p => !p.link).every(p => Array.isArray(p.closed)), 'every built-in place has its own hours (editable)');
ok(!DN.isOpen(w, 'finance', night) && DN.isOpen(w, 'finance', noon), 'offices close at night');
ok(DN.isOpen(w, 'park', night) && DN.isOpen(w, 'hospital', night), 'parks and the hospital never close');
{
    const c = structuredClone(w); c.id = 'nohours'; for (const p of c.places) delete p.closed; W.registerWorld(c);
    ok(!DN.isOpen(c, 'civic', night) && DN.isOpen(c, 'beach', 3 * 60), 'a place without hours closes like its kind');
}
{
    const g = open(fixture('v0.1.0-modern.json'));
    g.player.loc = 'mall'; g.minutes = noon; const day = needs.actionsHere(g, w).length;
    g.player.loc = 'civic'; g.minutes = night;
    const acts = needs.actionsHere(g, w);
    ok(acts.every(a => a.anywhere), `at a closed place, only what can be done anywhere (${acts.map(a => a.id).join(',')})`);
    ok(WS.crowdLevel(g, w, 'civic') <= 1, 'a closed place is empty');
    ok(/closed at this hour/.test(P.sceneText()), 'the AI is told it is closed');
    ok(day > 0, 'an open place has things to do');
    // nobody spends free time at a closed place
    let bad = 0, seen = 0;
    const d0 = g.day;
    for (let d = d0; d < d0 + 3; d++) for (let h = 0; h < 24; h++) {
        g.day = d; g.minutes = h * 60 + 30;
        for (const r of Object.values(g.cast)) {
            const at = people.whereNow(g, w, r);
            const job = w.occupations.find(o => o.id === r.occupation);
            if (at.startsWith('home:') || at === job?.place || DL.breakNow(g, w, r)) continue;
            seen++; if (!DN.isOpen(w, at, g.minutes)) { bad++; if (bad < 3) console.log('   ', r.name, at, h); }
        }
    }
    ok(bad === 0, `people out for leisure are always somewhere open (${seen} checked)`);
}
// prices by the part of the day
{
    const g = open(fixture('v0.1.0-modern.json'));
    const w0 = w; { const w = { ...w0, festivals: [] };   // (no festival in town that day)
    WS.regionState(g, w, 'midtown').price = 1;
    g.player.loc = 'cafe'; g.minutes = noon;
    ok(Math.abs(WS.priceHere(g, w) - 1) < 1e-9, 'by day: as listed');
    g.minutes = night; ok(Math.abs(WS.priceHere(g, w) - 1.15) < 1e-9, 'late at night: more');
    g.player.loc = 'home:player'; ok(WS.priceHere(g, w) === 1, 'at home: as listed');
    // the mood of the streets
    g.player.loc = 'cafe'; WS.regionState(g, w, 'midtown').mood = 20;
    g.minutes = 19 * 60; const eve = WS.moodNow(g, w, 'midtown'); g.minutes = 4 * 60; const dawn = WS.moodNow(g, w, 'midtown');
    ok(eve > dawn, 'the evening is livelier than dawn');
    }
}
// pictures for each part of the day
{
    const pl = { bg: 'day.jpg', bgs: { night: 'night.jpg' } };
    ok(DN.pictureAt(w, night, pl.bg, pl.bgs) === 'night.jpg' && DN.pictureAt(w, noon, pl.bg, pl.bgs) === 'day.jpg', 'a picture for the night, the usual one by day');
    ok(DN.pictureAt(w, night, 'day.jpg', undefined) === 'day.jpg', 'without one, the usual picture');
}
// pictures by time of day: three slots (day, afternoon, night) in every world; old period keys still work
{
    const w0 = world(ext, 'modern');
    ok(DN.slotAt(6 * 60) === 'day' && DN.slotAt(13 * 60) === 'afternoon' && DN.slotAt(20 * 60) === 'night' && DN.slotAt(2 * 60) === 'night', 'day 5–12, afternoon 12–18, night 18–5');
    ok(DN.pictureAt(w0, 21 * 60, 'base.jpg', { night: 'n.jpg' }) === 'n.jpg' && DN.pictureAt(w0, 9 * 60, 'base.jpg', { night: 'n.jpg' }) === 'base.jpg', 'the night picture at night, the usual one by day');
    ok(DN.pictureAt(w0, 7 * 60, 'base.jpg', { morning: 'm.jpg' }) === 'm.jpg', 'a picture saved under a period id still shows');
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
