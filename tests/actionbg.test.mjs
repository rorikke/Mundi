// An action's own background (E-5, sim/actionbg.ts): `ActionDef.bg` and `bgs` (by part of the day) show in the scene
// instead of the place's or the room's while the action plays, and stay until the scene moves on: another action
// without a picture, leaving the place or the room, the visit ending, or (once it's over) an hour passing or the part
// of the day changing. It never sticks (a save reloaded, adult content off, a world without the picture) and a missing
// picture leaves the usual one showing (drawn under it). A world without the fields plays exactly as before.
// upgradeWorld() cleans the fields; the creator edits them.
// Each block ends with `[n/total] · avg Xs · ~N min left`. Run: node tests/actionbg.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'actionbg');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); const PR = await D('core/presets.js'); const SAVES = await D('core/saves.js');
const OV = await D('core/overlay.js');
for (const f of fs.readdirSync(path.join(ext, 'dist', 'sim'))) await D(`sim/${f}`);   // every system's hooks, as in the game
const homes = await D('sim/homes.js'); const HR = await D('sim/homerooms.js'); const ACT = await D('sim/actions.js'); const AB = await D('sim/actionbg.js');
const TIME = await D('sim/time.js');
const SC = await D('ui/scene.js'); const CW = await D('ui/creator.js');
seed(7);

let fails = 0, passes = 0, block = 0;
const BLOCKS = 11, T0 = performance.now();
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const done = (name) => { block++; const el = performance.now() - T0, avg = el / block; console.log(`[${block}/${BLOCKS}] · avg ${secs(avg)} · ~${Math.round(avg * (BLOCKS - block) / 60000)} min left  (${name})`); };
const has = (s, t) => String(s ?? '').includes(t);

// Tokyo with a few actions of its own: a love hotel's jungle room (by part of the day), its spa room (adult), a plain
// drink there, a closet studio at home (night only), and fields that need cleaning
const BAR = 'sb_lovehotel';
// (worldFile only gives web addresses: the world is read as if served)
const served = (x) => { x.base = 'http://localhost:8000/scripts/extensions/third-party/Mundi/worlds/tokyo/'; return x; };
const raw = served(world(ext, 'tokyo')); raw.id = 'tokyo-actionbg';
const base = { cost: 0, minutes: 30, effects: {}, place: BAR };
raw.actions.push(
    { ...base, id: 't_jungle', name: 'Jungle room', label: 'Take the jungle room', minutes: 120, bg: '  bg/t-jungle.avif ', bgs: { night: 'bg/t-jungle-night.avif', evening: 'bg/t-jungle-evening.avif', 'rain-night': 'bg/x.avif', noon: 'bg/y.avif', afternoon: 7, day: '  ' } },
    { ...base, id: 't_spa', name: 'Spa room', label: 'Take the spa room', adult: true, bg: 'bg/t-spa.avif' },
    { ...base, id: 't_mirror', name: 'Mirrored room', label: 'Take the mirrored room', bg: 'bg/t-mirror.avif' },
    { ...base, id: 't_drink', name: 'Drink', label: 'Have a drink' },
    { ...base, id: 't_empty', name: 'Empty', label: 'Nothing', bg: '   ', bgs: 'night' },
    { ...base, id: 't_closet', name: 'Closet studio', label: 'Shoot in the closet studio', place: undefined, home: true, bgs: { night: 'bg/t-closet-night.avif' } },
);
const w = PR.upgradeWorld(raw); W.registerWorld(w);
const A = (id) => w.actions.find(a => a.id === id);
const P = (x) => AB.actionPicture(x, w);
const bgOf = (x) => SC.sceneBackground(x, w);
const file = (f) => W.worldFile(w, f);

function save(at = BAR) {
    const home = homes.homeSpot(w, 'hz_sharehouse', new Set());
    const g = { v: 1, world: w.id, lang: 'en', day: w.time.startDay, minutes: 14 * 60, speed: 0,
        player: { loc: at, home: { ...home, kind: 'sharehouse' }, stats: Object.fromEntries(w.statuses.map(s => [s.id, s.start])), money: 100000, traits: {}, origin: '', job: null, rentPaidDay: w.time.startDay },
        cast: {}, tick: {}, log: [], cfg: { difficulty: 'normal', adult: true }, schema: SAVES.SCHEMA };
    meta.mundi = g; store.state.game = g;
    return g;
}
const at = (x, h, m = 0) => { x.minutes = h * 60 + m; };

/* ---------- the fields, cleaned ---------- */
{
    const j = A('t_jungle');
    ok(j.bg === 'bg/t-jungle.avif', `bg trimmed (${j.bg})`);
    ok(JSON.stringify(j.bgs) === JSON.stringify({ night: 'bg/t-jungle-night.avif', evening: 'bg/t-jungle-evening.avif' }), `bgs: the parts of the day and the world's periods, strings only (${JSON.stringify(j.bgs)})`);
    ok(!('bg' in A('t_empty')) && !('bgs' in A('t_empty')), 'empty ones: no key');
    ok(!('bg' in A('t_drink')) && !('bgs' in A('t_drink')), 'an action without them gets none');
    ok(w.actions.filter(a => !a.id.startsWith('t_')).every(a => !('bg' in a) && !('bgs' in a)), "Tokyo's own actions: no key added");
    ok(PR.upgradeWorld(structuredClone(w)).actions.every((a, i) => JSON.stringify(a) === JSON.stringify(w.actions[i])), 'cleaning twice changes nothing');
    done('cleaning');
}

/* ---------- off-screen: shows, stays an hour, not past the part of the day ---------- */
{
    const x = save(); at(x, 14);
    const usual = bgOf(x);
    ok(P(x) === null && !('actPic' in x), 'nothing done yet: the usual picture, no record');
    ACT.doAction(x, w, A('t_mirror'), () => 0.5);
    ok(P(x) === 'bg/t-mirror.avif', `after it, its picture (${P(x)})`);
    const s = bgOf(x);
    ok(s.startsWith(`background-image:url('${file('bg/t-mirror.avif')}'),`) && has(s, usual.replace(/^background-image:/, '').split(';')[0]), `drawn over the usual one (${s.slice(0, 160)})`);
    ok(x.actPic?.id === 't_mirror' && x.actPic.loc === BAR && x.actPic.to === x.day * 1440 + x.minutes, `the record (${JSON.stringify(x.actPic)})`);
    TIME.advance(x, w, 59); ok(P(x) === 'bg/t-mirror.avif', 'still there 59 minutes after');
    TIME.advance(x, w, 2); ok(P(x) === null && bgOf(x) === usual, 'an hour after: the usual picture again');
    ok(!('actPic' in x), 'the record is gone once it no longer holds');
    // ending at 11:50: the afternoon starts at 12:00, as the place's own picture changes
    const y = save(); at(y, 11, 20);
    ACT.doAction(y, w, A('t_mirror'), () => 0.5);
    ok(P(y) === 'bg/t-mirror.avif', 'at 11:50, its picture');
    TIME.advance(y, w, 15); ok(P(y) === null, 'at 12:05, the part of the day changed: the usual one');
    done('off-screen');
}

/* ---------- played in the scene: while it plays, through the parts of the day, and after ---------- */
{
    const x = save(); at(x, 17, 0);
    ACT.startSceneAction(x, w, A('t_jungle'), () => 0.5);
    ok(ACT.sceneAct(x) && P(x) === 'bg/t-jungle.avif', `while it plays, in the afternoon: its picture (${P(x)})`);
    TIME.advance(x, w, 30); ok(P(x) === 'bg/t-jungle-evening.avif', `17:30: the world's evening period picks its evening picture (${P(x)})`);
    TIME.advance(x, w, 60); ok(P(x) === 'bg/t-jungle-night.avif', `18:30: the night (${P(x)})`);
    ACT.finishSceneAction(x, w, { rnd: () => 0.5 });
    ok(!ACT.sceneAct(x) && x.minutes === 19 * 60 && P(x) === 'bg/t-jungle-night.avif', 'over at 19:00: it stays while the scene goes on');
    // another action without a picture: back to the usual one at once
    ACT.doAction(x, w, A('t_drink'), () => 0.5);
    ok(P(x) === null && !('actPic' in x), 'a drink after it: the usual picture, no record');
    // one with a picture takes over from another
    const y = save(); at(y, 15);
    ACT.startSceneAction(y, w, A('t_jungle'), () => 0.5);
    ACT.finishSceneAction(y, w, { rnd: () => 0.5 });
    ACT.startSceneAction(y, w, A('t_mirror'), () => 0.5);
    ok(P(y) === 'bg/t-mirror.avif', 'the next action with a picture: its own');
    // finishing it now (the rest of its time passes): still there after
    const z = save(); at(z, 13);
    ACT.startSceneAction(z, w, A('t_mirror'), () => 0.5); ACT.finishSceneAction(z, w, { rnd: () => 0.5 });
    ok(P(z) === 'bg/t-mirror.avif', 'finished now: it stays');
    done('in the scene');
}

/* ---------- leaving, the visit ending, sleeping ---------- */
{
    const x = save(); at(x, 14);
    ACT.startSceneAction(x, w, A('t_mirror'), () => 0.5);
    x.player.loc = 'sb_crossing'; ACT.lookSceneAction(x, w);
    ok(P(x) === null && !ACT.sceneAct(x) && !('actPic' in x), 'left the place: the usual picture, the action over, no record');
    x.player.loc = BAR; ok(P(x) === null, 'back within the hour: a new scene, the usual picture');
    const y = save(); at(y, 14);
    ACT.doAction(y, w, A('t_mirror'), () => 0.5);
    y.visitStart = 12;   // (endVisit: the scene was closed, as leaving and sleeping do)
    ok(P(y) === null, 'the visit ended: the usual picture');
    const z = save(); at(z, 22);
    ACT.doAction(z, w, A('t_mirror'), () => 0.5);
    TIME.advance(z, w, 8 * 60);
    ok(P(z) === null, 'a night later: the usual picture');
    done('leaving');
}

/* ---------- by part of the day ---------- */
{
    const x = save('home:player'); at(x, 10);
    ACT.doAction(x, w, A('t_closet'), () => 0.5);
    ok(P(x) === null, 'a picture only for the night, done in the morning: the usual one');
    const y = save('home:player'); at(y, 21);
    ACT.doAction(y, w, A('t_closet'), () => 0.5);
    ok(P(y) === 'bg/t-closet-night.avif', `at night: the night picture (${P(y)})`);
    const z = save(); at(z, 9);
    ACT.doAction(z, w, A('t_jungle'), () => 0.5);
    ok(P(z) === 'bg/t-jungle.avif', 'the morning, with no day picture: its own picture');
    done('part of the day');
}

/* ---------- at a home with rooms ---------- */
{
    const x = save('home:player'); at(x, 21);
    const rooms = HR.homeRooms(x, w, 'home:player').map(r => r.id);
    ok(rooms.includes('common') && rooms.includes('kitchen'), `the share house has rooms (${rooms.join(', ')})`);
    ok(HR.roomNow(x, w)?.id === 'common', 'you come in to the common room');
    const usual = bgOf(x);
    ok(has(usual, file('bg/home-sharehouse-common-night.avif')), `the room's own picture (${usual.slice(0, 140)})`);
    ACT.doAction(x, w, A('t_closet'), () => 0.5);
    const s = bgOf(x);
    ok(s.startsWith(`background-image:url('${file('bg/t-closet-night.avif')}'),url('${file('bg/home-sharehouse-common-night.avif')}')`), `the action's picture over the room's (${s.slice(0, 200)})`);
    ok(x.actPic?.room === 'common', 'the record keeps the room');
    ok(HR.enterRoom(x, w, 'kitchen') === '' && P(x) === null && has(bgOf(x), file('bg/home-sharehouse-kitchen-night.avif')), 'walked into the kitchen: its picture');
    HR.enterRoom(x, w, 'common'); ok(P(x) === null && bgOf(x) === usual, 'back in the common room: the usual one');
    // the homerooms system off: the home's picture is what the action replaces
    const w2 = structuredClone(w); w2.id = 'tokyo-actionbg-norooms'; w2.features.homerooms = false; W.registerWorld(w2);
    const y = save('home:player'); y.world = w2.id; at(y, 21);
    ACT.doAction(y, w2, w2.actions.find(a => a.id === 't_closet'), () => 0.5);
    ok(AB.actionPicture(y, w2) === 'bg/t-closet-night.avif' && !('room' in y.actPic), `rooms off: shown over the home's picture, no room kept (${JSON.stringify(y.actPic)})`);
    done('home rooms');
}

/* ---------- a missing picture ---------- */
{
    const x = save(); at(x, 14);
    ACT.doAction(x, w, A('t_mirror'), () => 0.5);
    // the world no longer has its picture, or the action
    const w2 = structuredClone(w); w2.id = 'tokyo-actionbg-2'; delete w2.actions.find(a => a.id === 't_mirror').bg; W.registerWorld(w2);
    const w3 = structuredClone(w); w3.id = 'tokyo-actionbg-3'; w3.actions = w3.actions.filter(a => a.id !== 't_mirror'); W.registerWorld(w3);
    ok(AB.actionPicture(x, w2) === null && SC.sceneBackground(x, w2) === SC.sceneBackground(save(), w2), 'its world lost the picture: the usual one, as if nothing had been done');
    let threw = null; try { ok(AB.actionPicture(x, w3) === null, 'its world lost the action: the usual one'); } catch (e) { threw = e; }
    ok(!threw, `quietly (${threw})`);
    // a file that isn't there: the usual picture is drawn under it, so it shows through
    const s = bgOf(x);
    ok(/^background-image:url\('[^']+'\),url\('[^']+'\);background-size:cover,cover;background-position:center,center$/.test(s), `two layers, the usual one under (${s})`);
    // a record that's broken
    const y = save(); y.actPic = 'nonsense'; ok(P(y) === null && !('actPic' in y), 'a broken record: dropped, quietly');
    const z = save(); z.actPic = { id: 't_mirror', loc: BAR, from: 'x', to: null, visit: 0 }; ok(P(z) === null, 'a record with no times: nothing shown');
    done('missing');
}

/* ---------- an overlay's absolute picture ---------- */
{
    const raw2 = served(world(ext, 'tokyo')); raw2.id = 'tokyo-actionbg-ov';
    const target = raw2.actions.find(a => a.place === 'sb_crossing') ?? raw2.actions[0];
    const ov = { world: raw2.id, adult: true, actions: [{ id: target.id, bg: '/user/files/priv/tokyo/back-room.avif', bgs: { night: "/user/files/priv/tokyo/it's(night).avif" } }] };
    const r = OV.applyOverlay(raw2, ov);
    const w4 = PR.upgradeWorld(r.world); W.registerWorld(w4);
    const a = w4.actions.find(x => x.id === target.id);
    ok(r.changed === 1 && a.bg === '/user/files/priv/tokyo/back-room.avif' && a.adult === undefined, `an overlay gives a base action a picture (not adult: it changed, it didn't add) (${a.bg}, ${a.adult})`);
    const x = save(a.place ?? 'sb_crossing'); x.world = w4.id; at(x, 14);
    ACT.doAction(x, w4, a, () => 0.5);
    const u = W.worldFile(w4, AB.actionPicture(x, w4));
    ok(u.endsWith('/user/files/priv/tokyo/back-room.avif') && u === 'http://localhost:8000/user/files/priv/tokyo/back-room.avif', `an absolute address, resolved on the site's root (${u})`);
    at(x, 19);   // (later the same day, a new action at night)
    ACT.doAction(x, w4, a, () => 0.5);
    const s = SC.sceneBackground(x, w4);
    ok(has(s, '/user/files/priv/tokyo/it%27s%28night%29.avif') && !/it's|\(night\)/.test(s), `quotes and brackets can't leave the url() (${s.slice(0, 160)})`);
    done('overlay');
}

/* ---------- adult content ---------- */
{
    const x = save(); at(x, 14);
    ACT.startSceneAction(x, w, A('t_spa'), () => 0.5);
    ok(P(x) === 'bg/t-spa.avif', 'an adult action with adult content on: its picture');
    x.cfg.adult = false;
    ok(P(x) === null && bgOf(x) === bgOf(save()), 'adult content switched off mid-way: the usual picture');
    x.cfg.adult = true; ACT.finishSceneAction(x, w, { rnd: () => 0.5 }); x.cfg.adult = false;
    ok(P(x) === null, 'and after it');
    done('adult');
}

/* ---------- a save reloaded mid-way ---------- */
{
    const x = save(); at(x, 20);
    ACT.startSceneAction(x, w, A('t_jungle'), () => 0.5);
    TIME.advance(x, w, 20);
    const y = JSON.parse(JSON.stringify(x)); meta.mundi = y; store.state.game = y;
    ok(ACT.sceneAct(y) && P(y) === 'bg/t-jungle-night.avif', 'reloaded while it plays: its picture');
    ACT.finishSceneAction(y, w, { rnd: () => 0.5 });
    const z = JSON.parse(JSON.stringify(y));
    ok(P(z) === 'bg/t-jungle-night.avif', 'reloaded just after: still there');
    TIME.advance(z, w, 61); ok(P(z) === null, 'and gone an hour later');
    // a save from before (no record) plays as before
    const old = save(); delete old.actPic; ok(P(old) === null && !('actPic' in old), 'an old save: nothing to read');
    done('reloaded');
}

/* ---------- a world without the fields, exactly as before; the creator ---------- */
{
    const raw3 = served(world(ext, 'tokyo')); raw3.id = 'tokyo-actionbg-plain';
    const w5 = PR.upgradeWorld(raw3); W.registerWorld(w5);
    const a = w5.actions.find(x => x.place === 'sb_crossing' && !x.adult && x.minutes >= 20) ?? w5.actions.find(x => x.anywhere);
    const x = save(a.place ?? 'sb_crossing'); x.world = w5.id; at(x, 14);
    const before = SC.sceneBackground(x, w5);
    ACT.doAction(x, w5, a, () => 0.5);
    ACT.startSceneAction(x, w5, a, () => 0.5); TIME.advance(x, w5, 5);
    ok(!('actPic' in x) && AB.actionPicture(x, w5) === null, 'no picture on any action: nothing written to the save, nothing shown');
    at(x, 14); ok(SC.sceneBackground(x, w5) === before && /^background-image:url\('[^',]+'\);background-size:cover;background-position:center$/.test(before), `the background as before (${before})`);
    // the creator edits them on an action
    CW.CW.w = structuredClone(w); CW.CW.tab = 'actions'; CW.CW.sel.actions = w.actions.findIndex(x => x.id === 't_jungle');
    const html = CW.creatorHtml(); const i = CW.CW.sel.actions;
    ok(['bg', 'bgs.day', 'bgs.afternoon', 'bgs.night'].every(k => has(html, `data-path="actions.${i}.${k}"`)), "the creator's action form has its own background, by part of the day");
    ok(has(html, 'Its own background'), 'under its own heading');
    done('as before');
}

console.log(`actionbg: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
