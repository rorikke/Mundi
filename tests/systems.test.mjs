// Systems on and off: a world can turn each of its systems off (features.<id> = false). Then it is gone from the
// apps and the AI's prompt, the engine stops running it, and the save keeps its data so turning it back on picks up
// cleanly (no pile of old bills, nothing lost). Run: node tests/systems.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'systems');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js');
const time = await D('sim/time.js'); const needs = await D('sim/needs.js'); const bills = await D('sim/bills.js');
const prompt = await D('sim/prompt.js'); const skills = await D('sim/courses.js'); const life = await D('sim/life.js');
const romance = await D('sim/romance.js'); const goals = await D('sim/goals.js'); const hr = await D('sim/homerooms.js');
let ui = null;
try { ui = { hud: await D('ui/hud.js'), phone: await D('ui/phone.js'), creator: await D('ui/creator.js') }; } catch (e) { console.log('note: screens not drawn in Node:', e.message); }

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const step = async (name, f) => { try { await f(); } catch (e) { fails++; console.log(`  FAIL ${name}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); } };
const open = (save) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = save; return store.game(); };
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));

for (const [id, file] of [['modern', 'v0.1.0-modern.json'], ['medieval', 'v0.1.0-medieval.json']]) {
    const base = world(ext, id);
    for (const sys of W.SYSTEMS) {
        console.log(`${id}: ${sys.id} off`);
        seed(5);
        await step(`${id} ${sys.id}`, async () => {
            const w = structuredClone(base); w.id = `${id}-no-${sys.id}`; w.features = { ...(w.features ?? {}), [sys.id]: false };
            W.registerWorld(w);
            const s = fixture(file); s.world = w.id;
            const g = open(s);
            const before = structuredClone(g);
            ok(!W.systemOn(w, sys.id), 'the system reads as off');
            for (const a of sys.apps) ok(!W.appsShown(w).some(x => x.id === a), `the ${a} app is gone`);
            for (const b of sys.blocks) ok(!prompt.blocksOf(w).some(x => x.id === b) && !prompt.sceneBlocks().some(x => x.id === b), `the ${b} prompt block is gone`);
            // two weeks without paying anything or doing anything
            for (let d = 0; d < 14; d++) {
                time.advance(g, w, 24 * 60);
                if (ui) { ui.hud.hudHtml(); ui.phone.P.open = true; for (const a of ['home', ...W.appsShown(w).map(x => x.id)]) { ui.phone.P.app = a; ui.phone.phoneHtml(); } ui.phone.P.open = false; }
            }
            if (sys.id === 'needs') {
                ok(W.activeStatuses(w).every(x => x.rpg), 'only RPG needs (health) are left');
                ok(w.statuses.filter(x => !x.rpg).every(x => g.player.stats[x.id] === before.player.stats[x.id]), 'needs do not drop with time');
                ok(!needs.feelings(g, w), 'nothing about needs for the AI');
            }
            if (sys.id === 'bills') {
                ok(!bills.billList(w).length && !bills.lockedOut(g) && !bills.cutReason(g, 'shower', w), 'nothing to pay and nothing cut off');
                const w2 = structuredClone(w); w2.id = `${w.id}-back`; delete w2.features.bills; W.registerWorld(w2); g.world = w2.id;
                ok(bills.billList(w2).every(b => !bills.owed(g, b.id)), 'turned back on: no old bills owed');
                g.world = w.id;
            }
            if (sys.id === 'courses') ok(!skills.coursesOf(w).length && w.occupations.every(o => !skills.missingCourses(g, w, o).length), 'no courses, and no job asks for one');
            if (sys.id === 'shop') ok(!life.shopItems(w).length, 'nothing in the shop');
            if (sys.id === 'breakdowns') ok(!life.brokenThings(g, w).length && JSON.stringify(life.lifeOf(g).broken) === JSON.stringify(life.lifeOf(before).broken), 'nothing breaks');
            if (sys.id === 'romance' || sys.id === 'family') {
                const someone = Object.keys(g.cast)[0];
                ok(!romance.canAsk(g, someone, sys.id === 'family' ? 'baby' : 'date'), 'nobody can be asked');
            }
            if (sys.id === 'romance') ok(!W.systemOn(w, 'family'), 'children need romance');
            if (sys.id === 'rumors') ok(JSON.stringify(g.living?.rumors ?? []) === JSON.stringify(before.living?.rumors ?? []), 'no new rumors');
            if (sys.id === 'goals') { goals.pickGoal(g, w, 'rich'); g.player.money = 1e9; time.advance(g, w, 120); const gs = goals.goalsState(g); ok(!gs.done.includes('rich') && !(gs.steps.rich > 0) && gs.active === null, 'a life goal is never reached'); }
            if (sys.id === 'homerooms') {
                // rooms written everywhere, but the system off: no room, the same things to do and the same place
                g.player.loc = 'home:player'; const plain = needs.actionsHere(g, w).map(a => `${a.id}:${a.cost}`).join(',');
                const rooms = [{ id: 'lounge', name: 'Lounge', tags: ['living', 'leisure'] }, { id: 'kitchen', name: 'Kitchen', tags: ['kitchen', 'food'] }];
                for (const k of Object.values(w.homes.kinds)) k.rooms = rooms;
                for (const z of w.homes.zones) z.rooms = rooms;
                store.changed();
                ok(hr.homeRooms(g, w, 'home:player').length === 0 && hr.roomNow(g, w) === null, 'no rooms inside');
                ok(needs.actionsHere(g, w).map(a => `${a.id}:${a.cost}`).join(',') === plain, 'the same things to do at home');
                ok(hr.scenePlace(g, w)?.name === 'My home', 'the scene is the whole home');
                if (ui) { const hs = await D('ui/homesui.js'); ok(hs.roomsCard(g, w) === '', 'no Rooms card'); }
            }
            // nothing in the save was lost while it was off
            for (const k of Object.keys(before)) ok(k in g, `the save still has ${k}`);
            if (ui) { ok(ui.creator !== null, 'creator loads'); }
        });
    }
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
