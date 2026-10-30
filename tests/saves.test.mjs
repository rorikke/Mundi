// Save safety tests: every fixture (saves made by released versions of Mundi) must open with this build without
// losing anything, keep a backup, play on, and draw its screens. Run: node tests/saves.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'test');
const meta = {}; const io = browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); const saves = await D('core/saves.js');
const time = await D('sim/time.js'); const needs = await D('sim/needs.js'); const work = await D('sim/work.js'); const bills = await D('sim/bills.js');
let ui = null;
try { ui = { hud: await D('ui/hud.js'), phone: await D('ui/phone.js') }; } catch (e) { console.log('note: screens not drawn in Node:', e.message); }

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const step = (name, f) => { try { f(); } catch (e) { fails++; console.log(`  FAIL ${name}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); } };
// Everything the old save had is still there with the same value (new fields may be added).
function kept(a, b, at = '') {
    if (a === null || typeof a !== 'object') return Object.is(a, b) ? [] : [`${at}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`];
    if (b === null || typeof b !== 'object') return [`${at}: was an object, now ${JSON.stringify(b)}`];
    return Object.keys(a).flatMap(k => kept(a[k], b[k], `${at}.${k}`));
}
const open = (save) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = save; return store.game(); };
const worlds = { modern: world(ext, 'modern'), medieval: world(ext, 'medieval') };
for (const w of Object.values(worlds)) W.registerWorld(w);
function play(g, w, days) {
    for (let d = 0; d < days; d++) {
        time.advance(g, w, 8 * 60);
        const a = needs.actionsHere(g, w).find(x => x.home); if (a) needs.applyAction(g, w, a);
        const o = work.jobDef(w, g.player.job?.id);
        if (o && work.isOpen(g, o)) { g.player.loc = o.place; work.workShift(g, w, 'normal'); g.player.loc = 'home:player'; }
        for (const b of (bills.billList ? bills.billList(w) : bills.BILLS)) if (bills.owed(g, b.id)) bills.payBill(g, w, b.id);
        time.advance(g, w, 16 * 60);
        if (ui) { ui.hud.hudHtml(); ui.phone.P.open = true; for (const app of ['home', 'messages', 'people', 'jobs', 'bank', 'homes', 'social', 'plans', 'journal', 'shop', 'goals']) { ui.phone.P.app = app; ui.phone.phoneHtml(); } ui.phone.P.open = false; }
    }
    ok(Number.isFinite(g.player.money), 'money is a number');
    for (const s of w.statuses) ok(g.player.stats[s.id] >= 0 && g.player.stats[s.id] <= s.max, `need ${s.id} in range (${g.player.stats[s.id]})`);
}

const priv = path.join(here, 'fixtures', 'private');   // real saves, kept only on your machine (not in git)
const fixtures = [...fs.readdirSync(path.join(here, 'fixtures')).filter(f => f.endsWith('.json')).sort(),
    ...(fs.existsSync(priv) ? fs.readdirSync(priv).filter(f => f.endsWith('.json')).sort().map(f => `private/${f}`) : [])];
for (const f of fixtures) {
    const orig = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));
    const w = worlds[orig.world];
    console.log(`\n${f} (${orig.world}, day ${orig.day})`);
    seed(3);
    step('open', () => {
        const g = open(structuredClone(orig));
        ok(saves.schemaOf(g) === saves.SCHEMA, `migrated to format ${saves.SCHEMA}`);
        // a redrawn map of homes moves where a home sits (its area stays), and a retired map's region data moves to its heir
        const moved = (x) => /\.home\.(x|y|n)$/.test(x.split(':')[0]) || /^\.(regions|bounty|rep)\.city/.test(x);
        const lost = kept(orig, g).filter(x => !moved(x)); ok(!lost.length, `nothing lost (${lost.slice(0, 3).join('; ')})`);
        ok(g.player.home.zone === orig.player.home.zone && Object.keys(orig.cast).every(a => g.cast[a].home.zone === orig.cast[a].home.zone), 'everyone keeps their neighborhood');
        const key = (h) => `${h.zone}:${h.x},${h.y}`;
        const pairs = Object.keys(orig.cast).flatMap(a => Object.keys(orig.cast).filter(b => b > a && key(orig.cast[a].home) === key(orig.cast[b].home)).map(b => [a, b]));
        ok(pairs.every(([a, b]) => key(g.cast[a].home) === key(g.cast[b].home)), 'people who lived together still do');
        if (saves.schemaOf(orig) < saves.SCHEMA) ok(meta.mundi_backups?.length === 1 && !kept(orig, meta.mundi_backups[0].data).length && !kept(meta.mundi_backups[0].data, orig).length, 'an exact backup was kept');
        else ok(!meta.mundi_backups?.length || meta.mundi_backups.length === 1, 'a save already up to date keeps at most a repair backup');
        play(g, w, 7);
        // opening again does nothing more
        const again = structuredClone(g); const before = meta.mundi_backups?.length ?? 0;
        meta.mundi = again; store.game();
        ok((meta.mundi_backups?.length ?? 0) === before, 'opening a current save again keeps no new backup');
        ok(!kept(g, again).length, 'opening a current save again changes nothing');
    });
    step('world changed', () => {
        // the world lost the player's job, home area and a place; ranks shrank
        const w2 = structuredClone(w); w2.id = `${w.id}-changed`;
        const job = orig.player.job?.id;
        w2.occupations = w2.occupations.filter(o => o.id !== job);
        for (const o of w2.occupations) o.ranks = o.ranks.slice(0, 1), o.promote = [];
        w2.homes.zones = w2.homes.zones.filter(z => z.id !== orig.player.home.zone);
        const gone = Object.values(orig.cast).flatMap(r => r.leisure)[0];
        w2.places = w2.places.filter(p => p.id !== gone);
        W.registerWorld(w2);
        const s = structuredClone(orig); s.world = w2.id; if (gone) s.player.loc = gone;
        const g = open(s);
        ok(g.player.job === null, 'a job the world lost is let go');
        ok(w2.homes.zones.some(z => z.id === g.player.home.zone), 'the home moves to an area that exists');
        ok(!gone || g.player.loc === 'home:player', 'a place that is gone sends you home');
        ok(meta.mundi_backups?.length >= 1, 'a backup was kept before the repair');
        play(g, w2, 3);
    });
}
step('newer save is never written', () => {
    const orig = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', fixtures[0]), 'utf8')); orig.schema = 99;
    const writes = io.writes;
    const g = open(structuredClone(orig));
    ok(g !== meta.mundi, 'plays a detached copy');
    time.advance(g, worlds[orig.world], 600); g.player.money += 1000; store.saveGame();
    ok(io.writes === writes, 'saveGame does not write');
    ok(!kept(orig, meta.mundi).length && !kept(meta.mundi, orig).length, 'the original is untouched');
    ok(!meta.mundi_backups, 'no backup written into it');
});
step('world gained a need', () => {
    const orig = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', fixtures[0]), 'utf8')); orig.schema = saves.SCHEMA;
    const w2 = structuredClone(worlds[orig.world]); w2.id = 'gained'; w2.statuses.push({ id: 'focus', name: 'Focus', icon: '🎯', color: '#fff', start: 70, max: 100 });
    W.registerWorld(w2); orig.world = 'gained';
    const g = open(orig);
    ok(g.player.stats.focus === 70, 'a new need starts at its usual value');
    ok(meta.mundi_backups?.length === 1, 'and the save was backed up first');
});
step('expenses', () => {
    const orig = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'v0.1.0-medieval.json'), 'utf8'));
    // a manor whose servants go unpaid: nobody cooks
    const w = worlds.medieval; const manor = w.homes.zones.find(z => z.kind === 'manor');
    const g = open(structuredClone(orig)); g.player.home = { zone: manor.id, kind: 'manor', x: manor.spots[0][0], y: manor.spots[0][1] }; g.player.loc = 'home:player';
    ok(bills.billAmount(g, w, 'servants') > 0, 'the manor pays its servants');
    bills.bills(g).servants = { due: g.day - 8 };
    ok(bills.isCut(g, 'servants') && /servants/i.test(bills.cutReason(g, 'cook', w) + bills.billNews(g, w).join(' ')), 'unpaid servants stop cooking at home');
    // an old custom world without the list still pays water and firewood
    const old = structuredClone(w); delete old.homes.expenses; old.id = 'oldcustom';
    for (const k of Object.values(old.homes.kinds)) if (k.bills?.power !== undefined) { k.bills.firewood = k.bills.power; delete k.bills.power; }
    W.registerWorld(old);
    const s2 = structuredClone(orig); s2.world = 'oldcustom'; const g2 = open(s2);
    ok(bills.billList(old).map(b => b.id).join() === 'rent,water,power' && bills.billAmount(g2, old, 'power') > 0, 'a world without expenses keeps water and power (firewood)');
    // an expense the world adds later starts a week from now
    const more = structuredClone(w); more.id = 'more'; more.homes.expenses.push({ id: 'tax', name: 'Royal tax', blocks: [] });
    for (const k of Object.values(more.homes.kinds)) k.bills = { ...(k.bills ?? {}), tax: 5 };
    W.registerWorld(more);
    const s3 = structuredClone(orig); s3.world = 'more'; const g3 = open(s3);
    ok(!bills.isDue(g3, 'tax') && bills.daysLeft(g3, 'tax') === 7, 'a new expense is first due a week later');
});
step('new save', () => {
    const orig = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', fixtures[0]), 'utf8')); orig.schema = saves.SCHEMA;
    open(orig); ok(!meta.mundi_backups, 'a save already in the current format keeps no backup');
});
step('restore', () => {
    const orig = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', fixtures[0]), 'utf8'));
    const g = open(structuredClone(orig)); g.player.money = -1;
    ok(saves.restoreBackup(0), 'restore works');
    ok(meta.mundi.player.money === orig.player.money, 'the restored save is the backup');
    ok(meta.mundi_backups.some(b => b.data.player.money === -1), 'the state before restoring is kept as a backup');
});
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
