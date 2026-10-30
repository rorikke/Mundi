// City events and hobbies: events on their weekdays, called off by rain, in the calendar and the prompt, crowds at
// the place, the "I'll go" reminder, something to do there; hobbies that level with practice, add to their rolls,
// pay more, open jobs and are known by the AI. Run: node tests/hobbies.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'hobbies');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js');
const CE = await D('sim/cityevents.js'); const H = await D('sim/hobbies.js'); const needs = await D('sim/needs.js');
const people = await D('sim/people.js'); const P = await D('sim/prompt.js'); const T = await D('sim/time.js');
const dice = await D('sim/dice.js'); const work = await D('sim/work.js'); const UI = await D('ui/cityui.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));
const open = (s) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = s; return store.game(); };
seed(4);
const w = world(ext, 'modern'); W.registerWorld(w);
const g = open(fixture('v0.1.0-modern.json'));
const wd = (d) => (d - 1) % 7;

// events happen on their weekday, every N weeks
const foot = w.cityEvents.find(e => e.id === 'football'), fest = w.cityEvents.find(e => e.id === 'beachfest');
for (let d = 1; d <= 28; d++) {
    const list = CE.eventsOn(g, w, d).map(x => x.ev.id);
    ok(list.includes('football') === (wd(d) === foot.weekday), `day ${d}: the match only on its weekday`);
    ok(list.includes('beachfest') === (wd(d) === fest.weekday && Math.floor((d - 1) / 7) % 2 === 0), `day ${d}: the beach festival every 2 weeks`);
}
// a sunday with the match: live at 17h, people gather there, the AI knows, there is something to do
let sun = g.day; while (wd(sun) !== 6) sun++;
g.day = sun; g.minutes = 17 * 60; g.player.loc = 'stadium';
const live = CE.eventHere(g, w);
ok(live?.ev.id === 'football', 'the match is on at the stadium at 17h');
ok(/Happening here now: the Football Match/.test(P.sceneText()), 'the AI is told about it');
const acts = needs.actionsHere(g, w).map(a => a.id);
ok(acts.includes('x-ev-football'), `you can watch it (${acts.join(',')})`);
{
    const free = Object.values(g.cast).filter(r => people.routineStep(r, T.nowAbs ? T.nowAbs(g) : g.day * 1440 + g.minutes)[1] === 'leisure');
    const at = g.day * 1440 + g.minutes;
    const there = free.filter(r => people.routineAt(g, w, r, at) === 'stadium').length;
    ok(!free.length || there > 0, `people with free time go to the match (${there} of ${free.length})`);
}
const a = needs.actionsHere(g, w).find(x => x.id === 'x-ev-football');
CE.afterEvent(g, w, a);
ok(!needs.actionsHere(g, w).some(x => x.id === 'x-ev-football'), 'once per event');
// the calendar and "I'll go"
g.minutes = 9 * 60; let sat = g.day; while (wd(sat) !== 5) sat++;
const coming = CE.comingEvents(g, w, 7);
ok(coming.length >= 3, `the calendar lists the week's events (${coming.map(x => x.ev.id).join(',')})`);
ok(/In the city/.test(UI.cityEventsHtml(g, w)), 'the Calendar shows them');
const mic = coming.find(x => x.ev.id === 'openmic');
ok(!!mic, 'the open mic is in the week');
CE.toggleGoing(g, mic.key); ok(CE.isGoing(g, mic.key), "I'll go");
g.day = mic.day; g.minutes = 18 * 60 + 30;
const msgs = T.advance(g, w, 60);
ok(msgs.some(m => /Open Mic Night starts at 20:00/.test(m)), `a reminder an hour before (${msgs.join(' | ')})`);
// an outdoor one is called off in the rain
{
    let d = 1, found = null; for (; d < 200 && !found; d++) found = CE.eventsOn(g, w, d).find(x => x.ev.outdoor && x.off);
    ok(!!found, 'an outdoor event is called off when it rains');
    if (found) { g.day = found.day; g.minutes = (found.ev.from + 1) * 60; g.player.loc = found.ev.place; ok(!CE.eventHere(g, w), 'and is not on'); }
}

// hobbies
const xp = H.hobbyXp(g); for (const k of Object.keys(xp)) delete xp[k];
const busk = w.actions.find(x => x.id === 'busk');
const b0 = dice.bonusFor(g, busk);
for (let i = 0; i < 17; i++) H.practice(g, w, busk, true);
ok(H.levelOf(g, 'music') === 4, `17 good sessions: Guitar 4 (${H.levelOf(g, 'music')})`);
ok(dice.bonusFor(g, busk) === b0 + 2, 'level 4 is +2 on its roll');
ok(Math.abs(H.hobbyPay(g, w, busk) - 1.48) < 1e-9, 'and pays 48% more');
const mus = w.occupations.find(o => o.id === 'musician');
delete xp.music; ok(!work.fits(g, mus, w), 'the bar musician job needs Guitar 4');
xp.music = H.LEVELS[4]; ok(work.fits(g, mus, w), 'and opens at level 4');
ok(/hobbies: guitar \(decent, level 4/.test(H.hobbyLine(g, w)), 'the AI knows how good you are');
const msg = H.practice(g, w, busk, true); void msg;
xp.music = H.LEVELS[5] - 1; const up = H.practice(g, w, busk, false);
ok(up.some(m => /Guitar: level 5/.test(m)), 'a new level is announced');
g.day = sat; g.minutes = 15 * 60; g.player.loc = 'beach';
if (!CE.eventsOn(g, w, sat).some(x => x.ev.id === 'beachfest')) { g.day = sat + 7; }
const st = CE.eventHere(g, w);
if (st && st.ev.id === 'beachfest') ok(needs.actionsHere(g, w).some(x => x.id === 'x-evs-beachfest'), 'Guitar 5: you can play a set at the beach festival');
// off: nothing
{
    const c = structuredClone(w); c.id = 'nohob'; c.features = { ...c.features, hobbies: false, events: false }; W.registerWorld(c);
    ok(H.hobbyBonus(g, c, busk) === 0 && H.hobbyFits(g, c, mus) && !CE.eventsOn(g, c, sun).length, 'with the systems off, nothing');
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
