// A person's door (ExampleCharacter.door, sim/homerooms.ts doorShut): their own rule for letting you into their home,
// read before how close you are. `never`: nobody comes in (a partner and a best friend neither, no key while they're
// out), with their own line at the door or the world's (lexicon `doorKept`); a condition: closed until it holds, then the
// usual rules (15 to be let in, 50 or a partner for the key). Every other way in asks it too: their bedroom in a home with
// rooms and in a Home, staying the night at theirs (their ask and yours), and their texted "come over tonight?".
// Someone without a rule is let in exactly as before; upgradeWorld() cleans the fields; the creator edits them.
// Each block ends with `[n/total] · avg Xs · ~N min left`. Run: node tests/door.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'door');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); const PR = await D('core/presets.js'); const SAVES = await D('core/saves.js');
const LX = await D('core/lexicon.js');
for (const f of fs.readdirSync(path.join(ext, 'dist', 'sim'))) await D(`sim/${f}`);   // every system's hooks, as in the game
const gm = await D('sim/game.js'); const homes = await D('sim/homes.js'); const R = await D('sim/rel.js'); const PE = await D('sim/people.js');
const LIFE = await D('sim/life.js'); const HR = await D('sim/homerooms.js'); const IN = await D('sim/initiative.js'); const SO = await D('sim/social.js');
const EV = await D('ui/events.js');
const YOU = R.YOU;
seed(5);

let fails = 0, passes = 0, block = 0;
const BLOCKS = 8, T0 = performance.now();
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const done = (name) => { block++; const el = performance.now() - T0, avg = el / block; console.log(`[${block}/${BLOCKS}] · avg ${secs(avg)} · ~${Math.round(avg * (BLOCKS - block) / 60000)} min left  (${name})`); };
const has = (s, t) => String(s ?? '').includes(t);

// Tokyo with Sumire's door never (and her line), Tsubaki's closed until her storyline ends a way, Kanon as usual
const raw = world(ext, 'tokyo'); raw.id = 'tokyo-door';
const ex = (n) => raw.cast.examples.find(e => e.name === n);
ex('Sumire').door = '  NEVER '; ex('Sumire').doorLine = '  {name} meets you downstairs:   nobody comes up. ';
ex('Tsubaki').door = 'thread: priv_tsubaki_hands your_hands';
ex('Kanon').door = '   '; ex('Kanon').doorLine = '';
const w = PR.upgradeWorld(raw); W.registerWorld(w);
const wex = (n) => w.cast.examples.find(e => e.name === n);

const chars = []; globalThis.__ctx.characters = chars;
function tokyoSave() {
    const taken = new Set(), home = homes.homeSpot(w, 'hz_mansion', taken);
    const g = { v: 1, world: w.id, lang: 'en', day: w.time.startDay, minutes: 14 * 60, speed: 0,
        player: { loc: 'home:player', home: { ...home, kind: 'mansion' }, stats: Object.fromEntries(w.statuses.map(s => [s.id, s.start])), money: 100000, traits: {}, origin: '', job: null, rentPaidDay: w.time.startDay },
        cast: {}, tick: {}, log: [], cfg: { difficulty: 'normal', adult: true }, schema: SAVES.SCHEMA };
    for (const e of w.cast.examples) {
        const a = `${e.name}.png`;
        if (!chars.some(c => c.avatar === a)) chars.push({ avatar: a, name: e.name, data: { extensions: { mundi: { example: W.exampleTag(w, e), world: w.id } } } });
        g.cast[a] = gm.resident(w, a, taken, g.player.home);
    }
    const groups = {};
    for (const e of w.cast.examples) if (e.household) (groups[e.household] ??= []).push(`${e.name}.png`);
    for (const [head, ...rest] of Object.values(groups)) for (const a of rest) { g.cast[a].home = { ...g.cast[head].home }; g.cast[a].homeWith = head; }
    homes.normalizeHomes(g);
    for (const a of Object.keys(g.cast)) g.cast[a].met = true;
    return g;
}
const g0 = tokyoSave();
const S = 'Sumire.png', T = 'Tsubaki.png', K = 'Kanon.png', M = 'Mio.png';
const fresh = (minutes = 14 * 60) => { const x = structuredClone(g0); x.minutes = minutes; x.player.loc = 'home:player'; meta.mundi = x; return x; };
const atHome = (x, a, yes = true) => PE.stayHere(x, a, yes ? `home:${a}` : 'sb_yoyogi', 20000);
const door = (x, a) => LIFE.doorAnswer(x, w, `home:${a}`);

/* ---------- the fields, cleaned ---------- */
{
    ok(wex('Sumire').door === 'never' && wex('Sumire').doorLine === '{name} meets you downstairs: nobody comes up.', `"never" in any case, the line trimmed (${wex('Sumire').door} / ${wex('Sumire').doorLine})`);
    ok(wex('Tsubaki').door === 'thread: priv_tsubaki_hands your_hands', 'a condition kept as written');
    ok(!('door' in wex('Kanon')) && !('doorLine' in wex('Kanon')), 'empty ones: no key');
    ok(has(LX.lex(w, 'doorKept', 'Aoi'), "nobody comes into Aoi's home"), 'the world\'s words for a closed door (lexicon doorKept)');
    done('cleaning');
}

/* ---------- someone without a rule: as before ---------- */
{
    const x = fresh(); atHome(x, K);
    R.setFr(x, K, YOU, 0); ok(!door(x, K).ok && door(x, K).text === LX.lex(w, 'doorOut', 'Kanon'), 'a stranger talks to you through the door');
    R.setFr(x, K, YOU, 20); ok(door(x, K).ok && door(x, K).text === LX.lex(w, 'doorIn', 'Kanon'), 'a friend (15+) lets you in');
    atHome(x, K, false); ok(!door(x, K).ok, 'out, and only a friend: nobody answers');
    R.setFr(x, K, YOU, 55); ok(door(x, K).ok && has(door(x, K).text, 'you know where the key is'), 'a close friend (50+): the key');
    ok(!HR.doorShut(x, w, x.cast[K]) && !HR.doorShut(x, null, x.cast[S]), 'no rule: never shut (and no world: nothing asked)');
    done('no rule');
}

/* ---------- never ---------- */
{
    const x = fresh(); atHome(x, S);
    R.setFr(x, S, YOU, 90); R.setRo(x, S, YOU, 90); R.setStatus(x, S, YOU, 'dating');
    const d = door(x, S);
    ok(!d.ok && d.text === 'Sumire meets you downstairs: nobody comes up.', `a best friend and partner, at home: kept at the door with her own line (${d.text})`);
    atHome(x, S, false);
    ok(!door(x, S).ok && door(x, S).text === LX.lex(w, 'doorNobody', 'Sumire'), 'out: no key, nobody answers');
    // the world's words when she has no line of her own
    const w2 = structuredClone(w); w2.id = 'tokyo-door2'; delete w2.cast.examples.find(e => e.name === 'Sumire').doorLine; W.registerWorld(w2);
    const y = fresh(); y.world = w2.id; atHome(y, S);
    ok(LIFE.doorAnswer(y, w2, `home:${S}`).text === LX.lex(w2, 'doorKept', 'Sumire'), 'no line of hers: the world\'s words');
    // disliking you still comes first
    const z = fresh(); atHome(z, S); R.setFr(z, S, YOU, -50);
    ok(door(z, S).text === LX.lex(w, 'doorOut', 'Sumire'), 'someone who dislikes you: as before');
    done('never');
}

/* ---------- a condition ---------- */
{
    const x = fresh(); atHome(x, T); R.setFr(x, T, YOU, 60);
    ok(!door(x, T).ok && door(x, T).text === LX.lex(w, 'doorKept', 'Tsubaki'), 'until her storyline ends that way: closed, even to a close friend');
    x.threads = { ...(x.threads ?? {}), priv_tsubaki_hands: { ended: 'other_way' } };
    ok(!door(x, T).ok, 'another ending: still closed');
    x.threads.priv_tsubaki_hands.ended = 'your_hands';
    ok(door(x, T).ok, 'once it holds: the usual rules, a close friend walks in');
    R.setFr(x, T, YOU, 5); ok(!door(x, T).ok && door(x, T).text === LX.lex(w, 'doorOut', 'Tsubaki'), '…and a near stranger is still kept out by them');
    done('a condition');
}

/* ---------- their bedroom: a home with rooms, and a Home ---------- */
{
    const x = fresh(); const r = x.cast[S];
    R.setStatus(x, S, YOU, 'dating');
    ok(!HR.bedroomDoor(x, r, true, false, w).ok && HR.bedroomDoor(x, r, true, false, w).text === 'Sumire meets you downstairs: nobody comes up.', 'her bedroom, her in it: kept at the door, partner or not');
    ok(!HR.bedroomDoor(x, r, false, false, w).ok && has(HR.bedroomDoor(x, r, false, false, w).text, 'locked'), 'out: locked');
    ok(HR.bedroomDoor(x, r, true, false).ok, 'without the world (an older caller): as before, a partner walks in');
    ok(HR.bedroomDoor(x, x.cast[K], true, false, w).ok === HR.bedroomDoor(x, x.cast[K], true, false).ok, 'someone without a rule: the same either way');
    // a Home: the door down the hall is their bedroom door
    const h = { ...structuredClone(w), id: 'tokyo-door-home', kind: 'scenario', features: { ...w.features } }; h.scenario = true;
    W.registerWorld(h);
    const y = fresh(); y.world = h.id; atHome(y, S); R.setFr(y, S, YOU, 90); atHome(y, K); R.setFr(y, K, YOU, 90);
    ok(W.isScenario(h) && !LIFE.doorAnswer(y, h, `home:${S}`).ok && LIFE.doorAnswer(y, h, `home:${K}`).ok, "in a Home: her room stays closed to a best friend, Kanon's opens");
    done('bedrooms');
}

/* ---------- staying the night at theirs ---------- */
{
    // her ask (a moment): never "stay at mine" while her door is closed; Kanon's can be
    const ready = (x, a) => { R.setFr(x, a, YOU, 80); R.setRo(x, a, YOU, 80); R.setStatus(x, a, YOU, 'dating'); };
    const ask = (x, a) => IN.fits(x, w, { who: a, kind: 'ask', ask: 'staytheirs', text: '' });
    const x = fresh(21 * 60); ready(x, S); ready(x, K);
    x.player.loc = `home:${K}`; atHome(x, K);
    ok(ask(x, K), 'Kanon at her place in the evening: her ask to stay the night fits');
    x.player.loc = `home:${S}`; atHome(x, S);
    ok(!ask(x, S), 'Sumire: never, her door is closed');
    // your ask: the button on her card
    ok(EV.stayButton(S) === '', 'no "Ask to sleep here tonight" at hers');
    x.player.loc = `home:${K}`;
    ok(has(EV.stayButton(K), 'Ask to sleep here tonight'), 'at Kanon\'s it is there');
    x.player.loc = 'home:player';
    ok(has(EV.stayButton(S), 'Ask them to stay the night'), 'at your home Sumire may still stay with you');
    done('staying the night');
}

/* ---------- "come over tonight?" ---------- */
{
    // a casual partner texts you to come over to theirs: Kanon may, Sumire never (her place is closed)
    const count = (a) => {
        const x = fresh(); let n = 0;
        for (const b of [S, K]) { R.setFr(x, b, YOU, 60); R.setRo(x, b, YOU, 70); R.setStatus(x, b, YOU, 'casual'); PE.stayHere(x, b, 'sb_yoyogi', 10 ** 7); }
        for (const o of Object.keys(x.cast)) if (![S, K].includes(o)) x.cast[o].met = false;
        for (let d = 0; d < 60; d++) for (let h = 10; h <= 19; h++) {
            x.day = g0.day + d; x.minutes = h * 60;
            SO.social(x).invite = null;
            IN.textAsks(x, w);
            const inv = SO.social(x).invite;
            if (inv && inv.avatar === a && inv.initiative === 'casual' && inv.place === `home:${a}`) n++;
        }
        return n;
    };
    const k = count(K), s = count(S);
    ok(k > 0, `Kanon texts "come over tonight?" to her place now and then (${k} in 60 days)`);
    ok(s === 0, `Sumire never asks you over to hers (${s})`);
    done('come over tonight');
}

/* ---------- the World creator ---------- */
{
    store.state.view = 'creator';
    const cw = await D('ui/creator.js');
    cw.CW.w = structuredClone(w); cw.CW.tab = 'people';
    const i = cw.CW.w.cast.examples.findIndex(e => e.name === 'Tsubaki'); cw.CW.sel.people = i;
    const html = cw.creatorHtml();
    const paths = [...html.matchAll(/data-path="([^"]+)"/g)].map(m => m[1]);
    ok(paths.includes(`cast.examples.${i}.door`) && paths.includes(`cast.examples.${i}.doorLine`), 'her door and its line have form fields');
    ok(has(html, 'Only once a condition holds') && has(html, 'thread: priv_tsubaki_hands your_hands'), 'a condition shows as "only once", with the condition to edit');
    cw.CW.sel.people = cw.CW.w.cast.examples.findIndex(e => e.name === 'Kanon');
    const h2 = cw.creatorHtml();
    ok(has(h2, 'Their door') && !/cast\.examples\.\d+\.doorLine/.test(h2.split('Their door')[1]?.split('</h4>').slice(0, 3).join('') ?? ''), 'as usual: no line to write');
    done('the creator');
}

console.log(fails ? `${fails} FAILED, ${passes} passed` : `door: all ${passes} checks passed`);
process.exit(fails ? 1 : 0);
