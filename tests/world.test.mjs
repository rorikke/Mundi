// The living world, region by region: how busy places are, public mood, tension, weather and prices.
// Run: node tests/world.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'world');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js');
const time = await D('sim/time.js'); const needs = await D('sim/needs.js'); const bills = await D('sim/bills.js');
const WS = await D('sim/worldstate.js'); const P = await D('sim/prompt.js'); const life = await D('sim/life.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));
const open = (s) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = s; return store.game(); };
const at = (g, day, minutes) => { g.day = day; g.minutes = minutes; };

seed(4);
const modern = world(ext, 'modern'); W.registerWorld(modern);
const medieval = world(ext, 'medieval'); W.registerWorld(medieval);

// regions appear when needed; old saves have none
{
    const g = open(fixture('v0.1.0-medieval.json'));
    ok(!('regions' in fixture('v0.1.0-medieval.json')), 'an old save has no regions');
    const msgs = [];
    for (let d = 0; d < 40; d++) msgs.push(...time.advance(g, medieval, 1440));
    ok(Object.keys(g.regions ?? {}).sort().join() === medieval.maps.map(m => m.id).sort().join(), 'one record per region (map)');
    const vals = Object.values(g.regions);
    ok(vals.every(r => r.mood >= -100 && r.mood <= 100 && r.tension >= 0 && r.tension <= 100), 'mood and tension stay in range');
    ok(vals.every(r => r.price >= 0.85 - 1e-9 && r.price <= 1.3 + 1e-9), 'prices stay near the usual');
    ok(new Set(vals.map(r => r.mood)).size > 1, 'regions do not all feel the same');
    // the same days give the same world
    const g2 = open(fixture('v0.1.0-medieval.json'));
    for (let d = 0; d < 40; d++) time.advance(g2, medieval, 1440);
    ok(JSON.stringify(g2.regions) === JSON.stringify(g.regions), 'deterministic: the same save and days give the same regions');
    console.log('  region news seen:', msgs.filter(m => /edge|unrest|calm|died down|Prices|Goods/i.test(m)).length);
}
// how busy a place is
{
    const g = open(fixture('v0.1.0-modern.json'));
    for (const r of Object.values(g.cast)) r.home = { ...r.home };
    const quiet = (place, day, m) => { at(g, day, m); for (const r of Object.values(g.cast)) r.met = r.met; return WS.crowdLevel(g, modern, place); };
    const mon = g.day + ((7 - ((g.day - 1) % 7)) % 7);   // a Monday on or after today
    ok(quiet('cafe', mon, 19 * 60) > quiet('cafe', mon, 3 * 60), 'a café is busier in the evening than at 3 am');
    ok(quiet('finance', mon + 5, 10 * 60) <= quiet('finance', mon, 10 * 60), 'offices are quieter at the weekend');
    ok(WS.CROWD.includes(WS.crowdWord(quiet('mall', mon, 15 * 60))), 'busy-ness has a word');
    const w2 = structuredClone(modern); w2.id = 'lively'; w2.maps[0].crowd = 3; W.registerWorld(w2); g.world = 'lively';
    ok(quiet('park', mon, 17 * 60) >= quiet('park', mon, 17 * 60) && WS.crowdLevel(g, w2, 'park') >= WS.crowdLevel(g, modern, 'park'), 'a livelier region is busier');
    g.world = 'modern';
}
// prices where you are
{
    const g = open(fixture('v0.1.0-modern.json'));
    WS.regionState(g, modern, 'midtown').price = 1.2;
    g.player.loc = 'cafe'; g.minutes = 12 * 60;   // midday (late at night costs more)
    const plain = modern.actions.filter(a => a.place === 'cafe' || (a.tags ?? []).some(t => ['food', 'work'].includes(t))).find(a => a.cost > 0);
    const got = needs.actionsHere(g, modern).find(a => a.cost > 0);
    const fest = (await import(`${ext}/dist/sim/festivals.js`)).festivalPrice(g, modern);   // a festival in town changes prices too
    if (got) ok(got.cost === Math.round(bills.priceOf(g, modern.actions.find(a => a.id === got.id)?.cost ?? got.cost) * 1.2 * fest) || got.id === 'study', `a café costs the region's prices (${got.id} ${got.cost})`);
    else ok(!plain, 'nothing to buy at the café');
    const it = life.shopItems(modern)[0];
    ok(life.shopPrice(g, modern, it) === Math.round(bills.priceOf(g, it.price) * 1.2), 'the shop costs what it costs where you live');
    g.player.loc = 'home:player';
    const home = needs.actionsHere(g, modern).find(a => a.cost > 0 && a.home);
    if (home) ok(home.cost === bills.priceOf(g, modern.actions.find(a => a.id === home.id).cost), 'at home, nothing changes');
}
// a region with its own weather
{
    const w2 = structuredClone(medieval); w2.id = 'isles'; w2.maps.find(m => m.id === 'mare_alta').ownWeather = true; W.registerWorld(w2);
    const s = fixture('v0.1.0-medieval.json'); s.world = 'isles'; const g = open(s);
    const port = w2.places.find(p => p.map === 'mare_alta' && !p.link).id, town = w2.places.find(p => p.map === 'aurenfort' && !p.link).id;
    let differ = 0;
    for (let d = 1; d <= 60; d++) if (WS.weatherAt(g, w2, port, d).name !== WS.weatherAt(g, w2, town, d).name) differ++;
    ok(differ > 5, `the coast has its own weather (${differ} of 60 days differ)`);
    let same = 0;
    for (let d = 1; d <= 60; d++) if (WS.weatherAt(g, medieval, town, d).name === WS.weatherAt(g, w2, town, d).name) same++;
    ok(same === 60, 'the rest of the world keeps its weather');
}
// for the AI, and off
{
    const g = open(fixture('v0.1.0-modern.json'));
    g.player.loc = 'cafe';
    ok(/^Around Midtown: .+ here right now; the public mood is \w+; people are [\w ]+/.test(WS.worldLine(g, modern)), `the AI hears what it is like around (${WS.worldLine(g, modern)})`);
    ok(P.sceneBlocks().some(b => b.id === 'world' && b.state === 'sent'), 'in its own prompt block');
    const off = structuredClone(modern); off.id = 'still'; off.features = { ...off.features, living: false }; W.registerWorld(off);
    const s = fixture('v0.1.0-modern.json'); s.world = 'still'; const g2 = open(s);
    for (let d = 0; d < 10; d++) time.advance(g2, off, 1440);
    ok(!g2.regions, 'off: no region is kept');
    ok(WS.priceHere(g2, off) === 1 && !WS.worldLine(g2, off), 'off: prices as listed, nothing for the AI');
}
// the Three Crowns: three kingdoms of three towns each; trips between kingdoms are long (a journey)
{
    const PL = await D('sim/places.js');
    const mw = world(ext, 'medieval'); W.registerWorld(mw);
    const kingdoms = mw.maps.filter(m => m.parent === 'realms');
    ok(kingdoms.length === 3 && kingdoms.every(k => mw.maps.filter(c => c.parent === k.id).length === 3), 'three kingdoms, three towns in each');
    ok(kingdoms.every(k => mw.places.some(p => p.map === 'realms' && p.link === k.id)) && mw.maps.filter(c => kingdoms.some(k => k.id === c.parent)).every(c => mw.places.some(p => p.link === c.id && p.name.length)), 'every kingdom and town is reached from the map above it');
    const towns = mw.maps.filter(c => kingdoms.some(k => k.id === c.parent));
    const inK = (k, re) => mw.places.some(p => towns.find(t => t.id === p.map)?.parent === k.id && re.test(p.id));
    ok(kingdoms.every(k => inK(k, /green_circle|rune_academy|arcanum|ps_tower/) && inK(k, /^academy$|warrior_hall|vg_lodge|duel_circle/) && inK(k, /trade_school|pf_trade|ar_school/)), 'every kingdom has a school of magic, of combat and of commerce');
    const g = { cast: {}, player: { home: { zone: 'low', x: 38, y: 73, kind: 'cottage' } }, cfg: {} };
    ok(PL.travelMinutes(g, mw, 'tavern', 'smithy') === 30 && PL.travelMinutes(g, mw, 'tavern', 'harbor') === 120 && PL.travelMinutes(g, mw, 'tavern', 'hr_mead') === 600 && PL.travelMinutes(g, mw, 'hr_mead', 'pf_tavern') === 120,
        'a town 30 min, between towns 2 h, between kingdoms 10 h');
    ok(PL.realmOf(modern, modern.maps[0].id) === '', 'a world without kingdoms has no realms');
}
// nobody is placed in the player's home by chance (only the household chosen at the start)
{
    const G = await D('sim/game.js');
    const mw = world(ext, 'medieval'); W.registerWorld(mw);
    const zone = mw.homes.zones[0]; const mine = { zone: zone.id, x: zone.spots[0][0], y: zone.spots[0][1] };
    let clash = 0;
    for (let i = 0; i < 300; i++) { const taken = new Set(zone.spots.map(s => `${s[0]},${s[1]}`)); const h = G.homeSpot(mw, zone.id, taken, mine); if (h.zone === mine.zone && h.x === mine.x && h.y === mine.y) clash++; }
    ok(clash === 0, `a full zone never puts someone in your home (${clash})`);
}
// a scenario: one house, residents who go out off-screen, outings offered with needs off, the premise in the prompt
{
    const house = world(ext, 'house'); W.registerWorld(house);
    const PE = await D('sim/people.js');
    ok(W.isScenario(house) && !W.isScenario(modern), 'the shared house is a scenario, Porto Alto is not');
    ok(!W.systemOn(house, 'needs') && !W.systemOn(house, 'jobs') && !W.systemOn(house, 'courses') && !W.systemOn(house, 'shop') && W.systemOn(house, 'romance') && W.systemOn(house, 'plans'), 'Home: no needs, jobs, courses or shop; love and plans stay');
    ok(W.gameMode({ ...house, mode: 'rpg' }) === 'lifesim' && !W.worldTags({ ...house, tags: ['lifesim', 'rpg', 'fantasy'] }).includes('rpg'), 'a scenario is always Life-Sim, realistic or fantasy');
    ok(!W.appsShown(house).some(a => W.SCENARIO_APPS_OFF.includes(a.id)) && !W.appsShown(house).some(a => ['jobs', 'bank', 'shop'].includes(a.id)) && W.appsShown(house).some(a => a.id === 'messages'), 'a smaller phone: no jobs, bank, shop, homes or factions');
    ok(['neighbors', 'social', 'crafting'].every(id => !W.systemOn(house, id)) && W.systemOn(modern, 'neighbors') && !W.appsShown(house).some(a => ['social', 'dating', 'workshop'].includes(a.id)), 'a scenario has no neighbors, Chirp, Spark or Recipes');
    ok(W.offScreenWork(house) && !W.offScreenWork(modern) && house.occupations.every(o => o.place === ''), 'scenario jobs are off-screen');
    ok(house.maps.length === 1 && house.homes.zones.every(z => z.map === 'house'), 'one map; the bedrooms are in the house');
    const g = open(fixture('v0.1.0-modern.json'));
    g.world = 'house'; g.player.loc = 'living'; g.cast = {};
    const ex = house.cast.examples.find(e => e.name === 'Rafa');
    g.cast.rafa = { avatar: 'rafa', name: 'Rafa', occupation: null, home: { zone: 'rooms', x: 82, y: 22 }, routine: structuredClone(house.cast.routineTemplates[ex.routine]), leisure: ex.leisure, met: true };
    at(g, 1, 10 * 60);
    ok(PE.whereNow(g, house, g.cast.rafa) === PE.OUT, 'at work hours he is out of the house');
    ok(!PE.presentAt(g, house, 'living').length, 'someone who is out is in no scene');
    ok(!needs.actionsHere(g, house).some(a => a.outing || a.cost < 0) && needs.actionsHere(g, house).every(a => !a.cost), 'Home: no outings (Go out instead), nothing to earn, nothing costs money');
    { const SK = await D('sim/skills.js'); ok(SK.canStudyHere(g, house), 'courses can be followed from anywhere in the house (classes are off-screen)'); }
    const lines = P.scenarioLines(g, house).join(' ');
    ok(lines.includes('Premise:') && lines.includes('Out of the house right now') && lines.includes('Rafa'), 'the prompt has the premise and who is out');
    ok(!P.scenarioLines(g, modern).length, 'no scenario lines in a world');
    g.cfg = { ...(g.cfg ?? {}), start: { id: 'host' } };
    ok(P.scenarioPremise(g, house).includes(house.scenario.premise) && P.scenarioPremise(g, house).includes("guests"), 'a situation adds how you fit in to the scenario\'s premise');
    g.cfg.start = { id: 'custom', text: 'Five old friends rent a cabin; {{user}} brought the keys.' };
    ok(P.scenarioPremise(g, house) === g.cfg.start.text && P.scenarioLines(g, house)[0].includes('cabin'), 'a custom premise replaces the scenario\'s own');
    ok(W.SCENARIO_STARTS.some(s => s.id === 'custom') && W.SCENARIO_STARTS.filter(s => s.met).length === 2, 'the situations: moved in, host, long time, custom');
    delete g.cfg.start;
    { const PL2 = await D('sim/places.js');
      ok(PL2.roomsOn(g, house).includes('bathroom') && PL2.roomsOn(g, house).includes('frontyard'), 'the house has its rooms (and the Entrance outside)');
      g.cfg = { ...(g.cfg ?? {}), rooms: ['living', 'kitchen'] };
      ok(!PL2.pins(g, house).some(p => p.id === 'pool') && PL2.pins(g, house).some(p => p.id === 'kitchen'), 'only the rooms chosen for this game are on the map');
      ok(PL2.travelMinutes(g, house, 'living', 'kitchen') === 0, 'from room to room: no time (Home)');
      for (let h = 0; h < 24; h++) { at(g, 2, h * 60); const loc = PE.whereNow(g, house, g.cast.rafa); ok(loc === PE.OUT || loc.startsWith('home:') || ['living', 'kitchen'].includes(loc), `nobody goes to a room this house does not have (${h}h: ${loc})`); }
      g.cfg.extraRooms = [{ id: 'x-cine', name: 'Home cinema', map: 'house', x: 50, y: 50, tags: ['leisure'], desc: 'a projector', closed: [] }];
      ok(PL2.pins(g, house).some(p => p.id === 'x-cine') && PL2.placeOf(g, house, 'x-cine')?.name === 'Home cinema', 'a room added for this game is in the house');
      g.player.loc = 'kitchen'; g.cfg.roomActs = { kitchen: ['relax'] };
      const here = needs.actionsHere(g, house).map(a => a.id);
      ok(here.includes('relax') && !here.includes('coffee') && here.includes('snack'), 'a room offers the actions chosen for it (and those possible anywhere)');
      delete g.cfg.roomActs; delete g.cfg.extraRooms; g.player.loc = 'living';
      // Home: the people can stay in; a job of your own words with its shift; going out; no checks
      { const HT = await D('sim/hometime.js'); const OUTm = await D('sim/outing.js'); const PLm = await D('sim/places.js'); const dice = await D('sim/dice.js');
        at(g, 1, 10 * 60); g.cfg.npcOut = false;
        ok(PE.whereNow(g, house, g.cast.rafa) !== PE.OUT, 'with "leave the house" off, he stays in at work hours');
        g.cfg.npcOut = true; g.cast.rafa.homeJob = { name: 'nurse', shift: 'night', days: 'all' };
        ok(PE.whereNow(g, house, g.cast.rafa) !== PE.OUT, 'a night nurse is home in the morning');
        at(g, 1, 23 * 60); ok(PE.whereNow(g, house, g.cast.rafa) === PE.OUT, 'and out at night, at work');
        at(g, 2, 3 * 60); ok(PE.whereNow(g, house, g.cast.rafa) === PE.OUT, 'the night shift goes on past midnight');
        ok(/Rafa works as nurse \(night shift, every day\)/.test(P.scenarioLines(g, house).join(' ')), 'the AI is told his job and shift');
        delete g.cast.rafa.homeJob; at(g, 2, 10 * 60); g.cast.rafa.routine.weekday = [[0, 'leisure']]; g.cast.rafa.routine.weekend = [[0, 'leisure']];
        g.player.loc = 'living';
        const id = OUTm.startOuting(g, house, 'the beach', ['rafa'], 'beach.jpg');
        ok(g.player.loc === 'out:the beach' && PLm.placeOf(g, house, id)?.name === 'the beach', 'going out: you are at the place you wrote');
        ok(PE.whereNow(g, house, g.cast.rafa) === id && PE.presentAt(g, house, id).length === 1, 'who came with you is there with you');
        ok(OUTm.endOuting(g) === 'living' && !OUTm.outingOf(g) && PE.whereNow(g, house, g.cast.rafa) !== id, 'back home: where you left from, and he goes on with his day');
        const busk = house.actions.find(a => a.id === 'busk'); ok(dice.rollAction(g, house, busk) === null, 'Home: no checks, what you do just happens');
        ok(PLm.travelMinutes(g, house, 'living', 'kitchen') === 0, 'moving between rooms takes no time'); }
      // Home: two people in one bedroom share it (one name on the plan for both), and a room can be changed
      { const GM = await D('sim/game.js'); const PN = await D('sim/plan.js'); const PLm = await D('sim/places.js');
        g.cast.ivy = { avatar: 'ivy', name: 'Ivy', occupation: null, home: { zone: 'rooms', x: 82, y: 22, unit: 1 }, routine: structuredClone(g.cast.rafa.routine), leisure: [], met: true };
        GM.shareRooms(g); (await D('sim/living.js')).normalizeHomes(g);
        const room = house.plan.rooms.find(r => r.id === 'spot:rooms:0');
        const t = PN.planTarget(g, house, room);
        ok(t && PLm.placeOf(g, house, t.loc)?.name === 'Rafa & Ivy\'s home', `sharing a bedroom: one room for both (${t && PLm.placeOf(g, house, t.loc)?.name})`);
        GM.moveToRoom(g, 'ivy', { zone: 'rooms4', x: 82, y: 85 });
        ok(PN.spotOf(house, g.cast.ivy.home) === 'spot:rooms4:0' && !g.cast.ivy.homeWith, 'moved to a room of her own on the top floor');
        GM.removeResident(g, 'ivy'); ok(!g.cast.ivy, 'someone can move out');
        const DR = await D('sim/dress.js'); DR.dressCodes(g).pool = 'swimsuit'; DR.dressCodes(g).__bedrooms = 'pajamas';
        ok(DR.dressAt(g, 'pool') === 'swimsuit' && DR.dressAt(g, 'home:rafa') === 'pajamas' && DR.dressAt(g, 'kitchen') === '', 'a dress code per room (and one for every bedroom)');
        g.player.loc = 'pool'; ok(/swimsuit/.test(P.scenarioLines(g, house).join(' ')), 'the AI is told the dress code'); g.player.loc = 'living'; delete g.cfg.dress; }
      { const manor = world(ext, 'manor'); W.registerWorld(manor);
        ok(W.isScenario(manor) && W.deviceLook(manor) === 'book' && W.styleOf(manor) === 'medieval' && manor.places.some(p => p.id === 'stable') && !manor.places.some(p => p.id === 'garage'), 'the Old Manor: a medieval Home, with a journal and a stable');
        ok(W.BUILT_IN.includes('manor'), 'it is one of the ready worlds'); }
      { const HPm = await D('sim/houseparty.js'); at(g, 3, 10 * 60);
        ok(!HPm.throwHouseParty(g, house, (3 * 1440) + 21 * 60, 'Pool night') && HPm.houseParty(g)?.title === 'Pool night', 'a house party is set for tonight');
        at(g, 3, 22 * 60); const rooms = HPm.partyRooms(g, house); const spot = PE.whereNow(g, house, g.cast.rafa);
        ok(rooms.includes(spot) && !rooms.includes('laundry') && !spot.startsWith('home:'), `during the party housemates are in the common rooms (${spot})`);
        ok(P.scenarioLines(g, house).join(' ').includes('house party'), 'the prompt knows about the party');
        at(g, 4, 3 * 60); ok(!HPm.partyNow(g, house), 'the party ends after a few hours');
        HPm.cancelHouseParty(g); }
      { const HPm = await D('sim/houseparty.js'); at(g, 3, 10 * 60);
        ok(!HPm.throwHouseParty(g, house, (3 * 1440) + 21 * 60, 'Pool night') && HPm.houseParty(g)?.title === 'Pool night', 'a house party is set for tonight');
        at(g, 3, 22 * 60); const rooms = HPm.partyRooms(g, house); const spot = PE.whereNow(g, house, g.cast.rafa);
        ok(rooms.includes(spot) && !rooms.includes('laundry') && !spot.startsWith('home:'), `during the party housemates are in the common rooms (${spot})`);
        ok(P.scenarioLines(g, house).join(' ').includes('house party'), 'the prompt knows about the party');
        at(g, 4, 3 * 60); ok(!HPm.partyNow(g, house), 'the party ends after a few hours');
        HPm.cancelHouseParty(g); }
      delete g.cfg.rooms; }
    at(g, 1, 21 * 60);
    ok(PE.whereNow(g, house, g.cast.rafa) !== PE.OUT, 'in the evening he is back home');
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
