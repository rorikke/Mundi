// Getting caught with someone, anywhere (adult content; sim/caught.ts): the rows of the person with you
// (ExampleCharacter.caught) say who saw and how they take it wherever they fit (a place, their home, your home, a home
// area, a place's tag, anywhere; a condition; a weight), with a reaction (their feelings toward you, the rumor in its
// own words); at a home (theirs, a shared house, yours) nobody bans you or takes a fee, and word starts with the people
// who live there, else the neighbours; at a place of yours (the owned-places hook) the world's `owncaught` rows and theirs
// share one draw. Where no row fits, everything is as before (the plain line, a week's ban, the fee, the plain rumor).
// Adult content off: nothing. upgradeWorld() cleans the rows, and the World creator edits every field.
// Each block ends with `[n/total] · avg Xs · ~N min left`. Run: node tests/caught.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'caught');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); const PR = await D('core/presets.js'); await D('core/saves.js');
for (const f of fs.readdirSync(path.join(ext, 'dist', 'sim'))) await D(`sim/${f}`);   // every system's hooks, as in the game
const gm = await D('sim/game.js'); const homes = await D('sim/homes.js'); const R = await D('sim/rel.js'); const AC = await D('sim/actions.js');
const CT = await D('sim/caught.js'); const LV = await D('sim/living.js'); const PE = await D('sim/people.js'); const H = await D('sim/hooks.js');
const T = await D('sim/tally.js'); const SAVES = await D('core/saves.js');
const YOU = R.YOU;
seed(11);

let fails = 0, passes = 0, block = 0;
const BLOCKS = 9, T0 = performance.now();
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const done = (name) => { block++; const el = performance.now() - T0, avg = el / block; console.log(`[${block}/${BLOCKS}] · avg ${secs(avg)} · ~${Math.round(avg * (BLOCKS - block) / 60000)} min left  (${name})`); };
const has = (s, t) => String(s ?? '').includes(t);

// Tokyo with a few fixtures: Sumire's rows (the VIP room at Velvet, her flat, a share house, your home, anywhere at night,
// one that never draws), Mio with none, and three risky private actions (Velvet, anywhere, the love hotel)
const raw = world(ext, 'tokyo'); raw.id = 'tokyo-caught';
const sumireEx = raw.cast.examples.find(e => e.name === 'Sumire');
sumireEx.caught = [
    { id: 'sumire_boysan', where: 'sj_hostess', action: 'z_vip or z_vip2', text: "Velvet's boy-san opens the VIP room door on Sumire and {{user}}; by the next night every hostess knows.", rumor: 'Sumire from Velvet takes someone home: {u}, seen in the VIP room.', feels: -3, romance: -2, junk: 1 },
    { id: 'sumire_flat', where: 'home', text: 'A neighbour across the street raises a glass at Sumire and {{user}}.', feels: 2 },
    { id: 'sumire_shared', where: 'hz_sharehouse', text: 'A housemate knocks on the wall, twice.' },
    { id: 'sumire_yours', where: 'yours', text: 'Your neighbour coughs very loudly on the stairs.' },
    { id: 'sumire_night', when: 'period: latenight', text: 'A night bus slows down beside them.', weight: 5 },
    { id: 'sumire_never', where: 'sb_lovehotel', text: 'never drawn', weight: 0 },
    { id: '', text: 'no id: dropped' }, { id: 'sumire_boysan', text: 'the same id again: dropped' }, { id: 'no_text' },
];
const risky = (id, more) => ({ id, name: id, label: `Do ${id}`, cost: 0, minutes: 40, adult: true, private: true, risk: 0.2, dc: 13, fee: 5000, tags: ['private'], effects: { mood: 2 },
    together: { needed: true, text: 'a door that may open' }, outcomes: [{ id: `${id}_o`, text: 'It goes as it goes.', weight: 1 }], ...more });
raw.actions.push(risky('z_vip', { place: 'sj_hostess' }), risky('z_lift', { place: 'sj_hostess' }), risky('z_any', { anywhere: true }), risky('z_hotel', { place: 'sb_lovehotel' }));
const w = PR.upgradeWorld(raw); W.registerWorld(w);
const act = (id) => w.actions.find(a => a.id === id);
const sumire = () => w.cast.examples.find(e => e.name === 'Sumire');

// a save with the world's people, the households sharing a home (as a new game makes them)
const chars = []; globalThis.__ctx.characters = chars;
function tokyoSave() {
    const taken = new Set(), zone = 'hz_mansion', home = homes.homeSpot(w, zone, taken);
    const g = { v: 1, world: w.id, lang: 'en', day: w.time.startDay, minutes: 14 * 60, speed: 0,
        player: { loc: 'home:player', home: { ...home, kind: 'mansion' }, stats: Object.fromEntries(w.statuses.map(s => [s.id, s.start])), money: 100000, traits: {}, origin: '', job: null, rentPaidDay: w.time.startDay },
        cast: {}, tick: {}, log: [], cfg: { difficulty: 'normal', adult: true }, schema: SAVES.SCHEMA };
    for (const ex of w.cast.examples) {
        const a = `${ex.name}.png`;
        if (!chars.some(c => c.avatar === a)) chars.push({ avatar: a, name: ex.name, data: { extensions: { mundi: { example: W.exampleTag(w, ex), world: w.id } } } });
        g.cast[a] = gm.resident(w, a, taken, g.player.home);
    }
    const groups = {};
    for (const ex of w.cast.examples) if (ex.household) (groups[ex.household] ??= []).push(`${ex.name}.png`);
    for (const [head, ...rest] of Object.values(groups)) for (const a of rest) { g.cast[a].home = { ...g.cast[head].home }; g.cast[a].homeWith = head; }
    homes.normalizeHomes(g);
    for (const a of Object.keys(g.cast)) g.cast[a].met = true;
    return g;
}
const g0 = tokyoSave();
const S = 'Sumire.png', M = 'Mio.png';
for (const a of [S, M]) { R.setRo(g0, a, YOU, 60); R.setFr(g0, a, YOU, 40); }
// a game with `mates` beside you at `loc`, everyone else far away (so nobody of the world saw, unless put there)
function fresh({ mates = [S], loc = 'sj_hostess', minutes = 14 * 60, adult = true, witness = null } = {}) {
    const x = structuredClone(g0);
    if (adult) x.cfg.adult = true; else delete x.cfg.adult;
    x.player.loc = loc; x.minutes = minutes;
    x.social = { with: mates.map(a => ({ avatar: a, until: 10 ** 9 })) };
    meta.mundi = x;
    for (const a of Object.keys(x.cast)) if (!mates.includes(a)) PE.stayHere(x, a, a === witness ? loc : 'sb_yoyogi', 20000);
    for (const a of mates) PE.stayHere(x, a, loc, 20000);
    return x;
}
const caughtNow = () => 0;   // every draw: caught, and the first row that fits
const rumors = (x) => LV.rumorsAboutYou(x);

/* ---------- upgradeWorld() cleans the rows ---------- */
{
    const rows = sumire().caught;
    ok(rows.length === 6 && rows.map(r => r.id).join() === 'sumire_boysan,sumire_flat,sumire_shared,sumire_yours,sumire_night,sumire_never', `rows without an id or a text, or with an id seen before, are dropped (${rows.map(r => r.id)})`);
    ok(!('junk' in rows[0]) && rows[0].feels === -3 && rows[0].romance === -2 && rows[0].rumor.startsWith('Sumire from Velvet'), 'only the known fields are kept on a row');
    const y = PR.upgradeWorld({ ...structuredClone(raw), id: 'tk2', cast: { ...raw.cast, examples: [{ ...structuredClone(sumireEx), caught: [{ id: 'a', text: '  two   spaces ', feels: 99, romance: -50.4, weight: -3, where: 'tag:  bar', rumor: '  ', when: '' }] }] } });
    const r = y.cast.examples[0].caught[0];
    ok(r.text === 'two spaces' && r.feels === 20 && r.romance === -20 && r.weight === 0 && r.where === 'tag:bar' && !('rumor' in r) && !('when' in r), `texts trimmed, feelings held to ±20, weight at least 0, "tag: bar" read as tag:bar (${JSON.stringify(r)})`);
    const z = PR.upgradeWorld({ ...structuredClone(raw), id: 'tk3', cast: { ...raw.cast, examples: [{ ...structuredClone(sumireEx), caught: [{ id: 'x' }] }] } });
    ok(!('caught' in z.cast.examples[0]), 'no row left: no key');
    ok(PR.upgradeWorld(world(ext, 'tokyo')).cast.examples.every(e => !('caught' in e) && !('door' in e) && !('doorLine' in e)), 'a world without them gets no key');
    done('cleaning');
}

/* ---------- where no row fits: as before ---------- */
{
    // Mio has no rows: the plain line, the week's ban, the fee, the plain rumor (someone of the world there to see)
    const x = fresh({ mates: [M], loc: 'sb_lovehotel', witness: 'Ren.png' });
    const out = AC.doAction(x, w, act('z_hotel'), caughtNow);
    ok(CT.isCaught(out) && out.lines[0].text === 'Someone saw you. You leave at once.', `the plain line (${out.lines[0]?.text})`);
    ok(CT.bansNow(x).length === 1 && CT.bansNow(x)[0].place === 'sb_lovehotel' && x.player.money === 100000 - 5000, 'a week\'s ban and the fee');
    ok(rumors(x).length === 1 && has(rumors(x)[0].text, 'were caught being intimate at') && has(rumors(x)[0].text, 'Mio'), 'the plain rumor');
    ok(has(out.ai, 'someone came by and saw them. They leave at once'), 'the AI is told as before');
    // Sumire at the love hotel: her rows for Velvet, her flat and the rest don't fit, the weight-0 one never draws
    const y = fresh({ loc: 'sb_lovehotel' });
    const o2 = AC.doAction(y, w, act('z_hotel'), caughtNow);
    ok(o2.lines[0].text === 'Someone saw you. You leave at once.' && rumors(y).length === 0, 'Sumire where none of hers fits (and nobody there): the plain line, no rumor');
    done('no row: as before');
}

/* ---------- her row at a place: who saw, the ban and fee as ever, her rumor, her reaction ---------- */
{
    const x = fresh();
    const f0 = R.fr(x, S, YOU), r0 = R.ro(x, S, YOU), m0 = x.player.stats.mood;
    const out = AC.doAction(x, w, act('z_vip'), caughtNow);
    ok(CT.isCaught(out) && has(out.lines[0].text, "Velvet's boy-san") && !has(out.lines[0].text, '{{user}}') && out.lines[1].text === 'You leave at once.', `her row, naming you on screen (${out.lines[0].text})`);
    ok(has(out.ai, "Velvet's boy-san") && has(out.ai, '{{user}}') && has(out.ai, 'someone came by and saw them:'), 'the AI hears her row');
    ok(CT.bansNow(x).length === 1 && CT.bansNow(x)[0].place === 'sj_hostess' && x.player.money === 100000 - 5000 && x.player.stats.mood === m0 - 5, 'Velvet still won\'t serve you for a week, the fee, mood −5');
    const rm = rumors(x);
    ok(rm.length === 1 && rm[0].text.startsWith('Sumire from Velvet takes someone home') && !has(rm[0].text, '{u}') && rm[0].caught === 'sj_hostess' && !rm[0].knownBy.includes(S), `the rumor in her own words, though nobody of the world was in the room (the row says who saw) (${rm[0]?.text})`);
    ok(R.fr(x, S, YOU) === f0 - 3 && R.ro(x, S, YOU) === r0 - 2, `her reaction: friendship −3 and romance −2, in full (${f0}→${R.fr(x, S, YOU)}, ${r0}→${R.ro(x, S, YOU)})`);
    ok(T.tallyOf(x, 'event:caught') === 1 && T.tallyOf(x, `event:caught|${S}`) === 1, 'counted as caught, with her');
    // a row's condition: late at night her "anywhere" row joins, by weight
    const y = fresh({ minutes: 1 * 60 + 30 });
    const o2 = AC.doAction(y, w, act('z_vip'), () => 0.99);
    ok(!CT.isCaught(o2), 'not caught: it plays');
    const z = fresh({ minutes: 1 * 60 + 30 }); let night = 0, vip = 0;
    for (let i = 0; i < 60; i++) { const q = CT.caughtRow(z, w, [S], 'sj_hostess', () => i / 60, false, 'z_vip'); if (q?.id === 'sumire_night') night++; if (q?.id === 'sumire_boysan') vip++; }
    ok(night === 50 && vip === 10, `late at night: her Velvet row (1) and her night row (5) share the draw by weight (${vip}/${night})`);
    ok(CT.caughtRow(fresh(), w, [S], 'sj_hostess', () => 0.999, false, 'z_vip')?.id === 'sumire_boysan', 'in the afternoon the night row isn\'t drawn');
    // a row for some actions only: another risky action at Velvet doesn't draw it
    const q = fresh(), o3 = AC.doAction(q, w, act('z_lift'), caughtNow);
    ok(CT.isCaught(o3) && o3.lines[0].text === 'Someone saw you. You leave at once.' && CT.caughtRow(q, w, [S], 'sj_hostess', () => 0, false, 'z_vip2')?.id === 'sumire_boysan', `her Velvet row is for the VIP room's actions only (z_vip or z_vip2): caught at the lift, the plain line (${o3.lines[0].text})`);
    done('her row at a place');
}

/* ---------- at a home: nobody bans you, word starts with the people who live there ---------- */
{
    // her own flat (she lives alone): no ban, no fee, her "home" row; word starts with the neighbours of her home area
    const x = fresh({ loc: `home:${S}` }), m0 = x.player.stats.mood, f0 = R.fr(x, S, YOU);
    const out = AC.doAction(x, w, act('z_any'), caughtNow);
    ok(CT.isCaught(out) && has(out.lines[0].text, 'raises a glass') && out.lines.some(l => l.text === "It's a home: nobody asks you to leave."), `her flat: her home row, and nobody sends you away (${out.lines.map(l => l.text).join(' | ')})`);
    ok(CT.bansNow(x).length === 0 && x.player.money === 100000 && x.player.stats.mood === m0 - 5, 'no ban and no fee at a home; mood −5');
    ok(!out.lines.some(l => has(l.text, "won't serve you")), 'no "won\'t serve you" line');
    const rm = rumors(x), zone = x.cast[S].home.zone;
    ok(rm.length === 1 && rm[0].knownBy.filter(a => a !== YOU).every(a => x.cast[a].home.zone === zone && a !== S) && rm[0].knownBy.length > 1 && !rm[0].caught, `word starts with her neighbours (the people of ${zone}), and there's no ban for Quiet a rumor to lift`);
    ok(R.fr(x, S, YOU) === f0 + 2 || R.fr(x, S, YOU) > f0, 'her reaction there: friendship up through the usual gain');
    ok(has(out.ai, "It's a home, so nobody makes them leave") && has(out.ai, 'raises a glass'), 'the AI is told it\'s a home');
    // the share house: Sumire living with Mio's household; the housemates hear first, never the ones with you
    const y = fresh({ loc: `home:${M}` });
    y.cast[S].home = { ...y.cast[M].home }; y.cast[S].homeWith = M;
    const mates = Object.values(y.cast).filter(r => r.homeWith === M || r.avatar === M).map(r => r.avatar).filter(a => a !== S);
    const o2 = AC.doAction(y, w, act('z_any'), caughtNow);
    ok(CT.isCaught(o2) && ['sumire_flat', 'sumire_shared'].some(id => has(o2.lines[0].text, id === 'sumire_flat' ? 'raises a glass' : 'knocks on the wall')), `the share house is her home now: her home row or the share house's (${o2.lines[0].text})`);
    const r2 = rumors(y);
    ok(r2.length === 1 && r2[0].knownBy.filter(a => a !== YOU).every(a => mates.includes(a)) && r2[0].knownBy.length === mates.length + 1 && !r2[0].knownBy.includes(S), `her housemates hear it first (${mates.map(a => y.cast[a].name)}), not her`);
    ok(CT.bansNow(y).length === 0, 'and nobody bans you from the share house');
    const rowsThere = new Set(); for (let i = 0; i < 20; i++) rowsThere.add(CT.caughtRow(y, w, [S], `home:${M}`, () => i / 20)?.id);
    ok(rowsThere.has('sumire_flat') && rowsThere.has('sumire_shared') && !rowsThere.has('sumire_yours') && !rowsThere.has('sumire_boysan'), `there: "home" and the share house's area fit, "yours" and Velvet don't (${[...rowsThere]})`);
    // your home, Mio living with you: she hears; Sumire's "yours" row fits
    const z = fresh({ loc: 'home:player' });
    z.cast[M].homeWith = '__you'; z.cast[M].home = { ...z.player.home }; PE.stayHere(z, M, 'sb_yoyogi', 20000);
    const o3 = AC.doAction(z, w, act('z_any'), caughtNow);
    ok(CT.isCaught(o3) && has(o3.lines[0].text, 'coughs very loudly') && CT.bansNow(z).length === 0, 'your home: her "yours" row, no ban');
    ok(rumors(z)[0]?.knownBy.includes(M), 'whoever lives with you hears it, even out');
    done('at a home');
}

/* ---------- no row at a home: the plain home line ---------- */
{
    const x = fresh({ mates: [M], loc: `home:${M}` });
    const out = AC.doAction(x, w, act('z_any'), caughtNow);
    ok(CT.isCaught(out) && out.lines[0].text === 'Someone saw or heard you.' && CT.bansNow(x).length === 0 && x.player.money === 100000, `Mio at her share house, no rows: the plain home line, no ban, no fee (${out.lines[0].text})`);
    ok(rumors(x).length === 1 && has(rumors(x)[0].text, 'were caught being intimate at'), 'the plain rumor, from her housemates');
    done('a home without rows');
}

/* ---------- at a place of yours: her rows and the world's owncaught share one draw ---------- */
{
    let mine = true;
    H.ownedPlaces.push((g, _w, place) => (mine && place === 'sj_hostess' ? { risk: 1 } : null));
    const x = fresh();
    const out = AC.doAction(x, w, act('z_vip'), caughtNow);
    ok(CT.isCaught(out) && has(out.lines[0].text, "Velvet's boy-san") && out.lines.some(l => l.text === "It's your own place: nobody asks you to leave.") && CT.bansNow(x).length === 0 && x.player.money === 100000, 'a place of yours: her row, nobody bans you, no fee');
    ok(rumors(x)[0]?.text.startsWith('Sumire from Velvet'), 'her rumor there too');
    const y = fresh({ mates: [M] });
    const o2 = AC.doAction(y, w, act('z_vip'), caughtNow);
    const plain = CT.ownCaughtRow(y, w, () => 0).text;
    ok(o2.lines[0].text === plain && (w.tables.owncaught ?? []).some(r => r.text === plain), `with nobody's rows: the world's owncaught row as before (${o2.lines[0].text})`);
    const w3 = { ...w, tables: { ...w.tables, owncaught: [] } };
    ok(CT.ownCaughtRow(y, w3).text === 'Someone who works here saw you, and looked away.', 'no owncaught rows: the plain line, as before');
    mine = false;
    done('a place of yours');
}

/* ---------- adult content off, rumors off ---------- */
{
    const x = fresh({ adult: false });
    const out = AC.doAction(x, w, act('z_vip'), caughtNow);
    ok(!CT.isCaught(out) && CT.bansNow(x).length === 0 && rumors(x).length === 0, 'adult content off: never caught, no rows, no ban');
    const w2 = { ...w, id: 'tokyo-norumors', features: { ...w.features, rumors: false } }; W.registerWorld(w2);
    const y = fresh({ loc: `home:${S}` }); y.world = w2.id; const f0 = R.fr(y, S, YOU);
    const o2 = AC.doAction(y, w2, w2.actions.find(a => a.id === 'z_any'), caughtNow);
    ok(CT.isCaught(o2) && has(o2.lines[0].text, 'raises a glass') && rumors(y).length === 0 && !o2.lines.some(l => l.text === 'Word may get around.') && R.fr(y, S, YOU) > f0, 'rumors off: her row and her reaction, no rumor');
    done('switched off');
}

/* ---------- the World creator edits every field ---------- */
{
    store.state.view = 'creator';
    const cw = await D('ui/creator.js');
    cw.CW.w = structuredClone(w); cw.CW.tab = 'people';
    const i = cw.CW.w.cast.examples.findIndex(e => e.name === 'Sumire'); cw.CW.sel.people = i;
    cw.CW.w.cast.examples[i].door = 'never'; cw.CW.w.cast.examples[i].doorLine = 'Not here.';
    const html = cw.creatorHtml(), paths = new Set([...html.matchAll(/data-path="([^"]+)"/g)].map(m => m[1].replace(/\.\d+(?=\.|$)/g, '.*')));
    const want = ['door', 'doorLine', 'caught.*.where', 'caught.*.action', 'caught.*.when', 'caught.*.text', 'caught.*.weight', 'caught.*.feels', 'caught.*.romance', 'caught.*.rumor'].map(f => `cast.examples.*.${f}`);
    const miss = want.filter(p => !paths.has(p));
    ok(!miss.length, `every new field has a form field (${miss.join(', ') || 'all there'})`);
    ok(has(html, 'sumire_boysan') && has(html, 'Getting caught with them'), 'the rows are listed with their ids');
    done('the creator');
}

/* ---------- an old save opens and plays ---------- */
{
    const x = fresh(); delete x.caught;
    for (let h = 0; h < 24; h++) for (const f of H.onHour) f(x, w);
    ok(!('caught' in x) || typeof x.caught === 'object', 'nothing new is kept in the save for rows (read with defaults)');
    ok(CT.caughtRow(x, w, [S], 'sj_hostess', () => 0, false, 'z_vip')?.id === 'sumire_boysan', 'and rows read straight from the world');
    done('old saves');
}

console.log(fails ? `${fails} FAILED, ${passes} passed` : `caught: all ${passes} checks passed`);
process.exit(fails ? 1 : 0);
