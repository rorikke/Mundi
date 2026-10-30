// Batch 5 and the worlds' tags: Life-Sim/RPG and realistic/fantasy tags (fantasy systems only in fantasy worlds),
// Porto Alto as a realistic RPG (martial arts and Ki, urban crime), its urban fantasy copy (witches, hunters, the
// night), towers, contracts boards, crafting, gear mods, consumables, sentient relics, the preset upgrade.
// Run: node tests/adventure.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'adventure');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); await D('core/saves.js');
const RD = await D('core/rpgdef.js'); const PRE = await D('core/presets.js');
const R = await D('sim/rpg.js'); const C = await D('sim/combat.js'); const TW = await D('sim/towers.js'); const CT = await D('sim/contracts.js');
const AR = await D('sim/artifacts.js'); const AF = await D('sim/afflictions.js'); const EC = await D('sim/economy.js'); const H = await D('sim/hooks.js');
const DN = await D('sim/daynight.js'); const P = await D('sim/prompt.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));
const open = (s) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = s; return store.game(); };
seed(11);
const modern = world(ext, 'modern'); W.registerWorld(modern);
const urban = world(ext, 'urban'); W.registerWorld(urban);
const medieval = world(ext, 'medieval'); W.registerWorld(medieval);
const rpgSave = (w, cls) => { const s = fixture('v0.1.0-modern.json'); s.schema = 1; s.world = w.id; s.cfg = { ...(s.cfg ?? {}), mode: 'rpg' }; const g = open(s); g.world = w.id; g.rpg = R.makeSheet(w, { cls }); R.longRest(g, w); return g; };
const hour = (g, w) => H.onHour.flatMap(f => f(g, w) ?? []);

// tags
{
    ok(JSON.stringify(W.worldTags(modern)) === JSON.stringify(['lifesim', 'rpg', 'realistic']), 'Porto Alto: Life-Sim, RPG, realistic');
    ok(W.hasTag(urban, 'fantasy') && !W.hasTag(urban, 'realistic') && W.hasTag(urban, 'lifesim') && urban.mode === 'lifesim', 'Porto Alto After Dark: fantasy, still a Life-Sim');
    ok(W.hasTag(medieval, 'fantasy'), 'Valdoria: fantasy');
    const old = structuredClone(modern); old.id = 'oldmodern'; delete old.tags; delete old.rpg;
    ok(JSON.stringify(W.worldTags(old)) === JSON.stringify(['lifesim', 'realistic']), 'a world from before tags gets them from what it has');
    for (const id of ['soulbound', 'sentient', 'fatigue', 'faith']) ok(!W.systemOn(modern, id) && W.systemOn(urban, id), `${id}: only in fantasy worlds`);
    ok(W.systemOn(modern, 'towers') && W.systemOn(modern, 'crafting') && W.systemOn(modern, 'prison'), 'towers, crafting and prison work in a realistic world');
    const nolife = structuredClone(modern); nolife.id = 'norpg'; nolife.tags = ['lifesim', 'realistic'];
    ok(!W.systemOn(nolife, 'towers') && !W.systemOn(nolife, 'talents'), 'RPG systems stay off in a world without the RPG tag');
    const pan = structuredClone(modern); pan.id = 'modernfaith'; pan.features = { ...pan.features, faith: true, sentient: true };
    ok(W.systemOn(pan, 'faith') && W.systemOn(pan, 'sentient') && !W.systemOn(pan, 'soulbound'), 'a realistic world can still turn on any fantasy system (anything in the creator, for any world)');
    ok(W.appSystem('contracts') === 'contracts' && W.appSystem('trophies') === 'trophies', 'the contracts and trophies apps belong to their own systems');
}
// the realistic RPG: martial arts, Ki, urban crime
{
    const r = RD.rpgOf(modern);
    ok(r.focusName === 'Ki' && r.schools.map(s => s.id).join() === 'karate,kungfu,capoeira,boxing', 'Ki and four martial arts');
    ok(r.classes.length === 6 && r.classes.find(c => c.id === 'martial').subclasses.length === 4, 'six modern classes; the martial artist has a style per school');
    ok(!r.attributes.some(a => a.faith), 'no faith attributes without gods');
    ok(r.bestiary.some(f => f.id === 'boss' && f.tags.includes('boss')) && r.bestiary.every(f => !/dragon|undead|skeleton/i.test(f.name)), 'urban crime: muggers to gang bosses');
    ok(modern.catalogs.origins.every(o => o.skills?.length === 2 && o.feature), 'every background gives two skills and a feature');
    const g = rpgSave(modern, 'martial');
    const s = R.sheetOf(g); s.prepared = r.spells.filter(sp => sp.school === 'karate').map(sp => sp.id); s.known = [...s.prepared];
    const sp = C.combatSpells(g, modern).map(x => x.id);
    ok(sp.includes('focused_strike') && sp.includes('iron_body'), 'techniques are combat moves (a blow, a guard)');
    g.player.loc = 'downtown';
    const c = C.startCombat(g, modern, { why: 'test', tags: ['town'] });
    ok(c && c.list.some(f => f.side === 'them'), 'a street fight starts');
    if (c) { C.chooseMode(g, modern, 'quick'); ok(C.combatOf(g).over, 'and resolves'); C.closeCombat(g); }
}
// towers and boards
{
    const t = TW.towerAt(modern, 'industrial');
    ok(t && t.floors === 50, 'The Abandoned Tower stands in the industrial zone');
    const ids = TW.floorFoes(modern, t, 10);
    ok(ids.includes('boss'), 'floor 10 has a boss');
    const g = rpgSave(modern, 'soldier'); g.player.loc = 'industrial';
    ok(/Floor 1/.test(TW.enterFloor(g, modern, t.id)) && C.inCombat(g), 'climbing starts a fight');
    delete g.combat;
    ok(CT.isBoard(g, modern, 'civic') && !CT.isBoard(g, modern, 'mall'), 'contracts are posted at City Hall');
    ok(CT.isBoard(g, urban, 'civic'), 'with powers, the Department posts villain bounties there too');
    ok(W.placeIs({ id: 'station', name: 'Train Station' }, 'guarded') && !W.placeIs({ id: 'station', name: 'Train Station', roles: [] }, 'guarded'), 'a place\'s roles are guessed from its name until the creator sets them');
    ok(modern.places.find(p => p.id === 'civic').roles.includes('contracts'), 'City Hall is a contracts board by its roles');
    const shop = { id: 'x', name: 'X', tags: ['shop', 'contracts'] };
    ok(DN.closedOf(modern, shop).length > 0, 'a tag that says nothing about hours does not keep a shop open all night');
}
// crafting, mods, consumables
{
    const g = rpgSave(modern, 'medic'); g.player.loc = 'hospital';
    ok(AR.craftable(g, modern).some(r => r.id === 'medkit'), 'first aid kits are made at the hospital');
    EC.addGood(g, 'supplies', 2);
    const res = AR.craft(g, modern, 'medkit');
    ok(res.ok ? (EC.bagOf(g).items.medkit ?? 0) >= 1 : (EC.bagOf(g).items.supplies ?? 0) === 1, 'crafting uses the supplies');
    EC.addGood(g, 'medkit', 1);
    AF.carryDebuff?.(g, modern, 'poison', 3);
    const s = R.sheetOf(g); s.hp = 1;
    const m = AF.useGood(g, modern, 'medkit');
    ok(/First aid kit/.test(m) && s.hp > 1, 'a first aid kit heals');
    ok(!AF.ailOf(g).debuffs.length, 'and cures');
    EC.addGood(g, 'scope', 1);
    ok(/set/.test(AR.setGem(g, modern, 'scope')) && AR.gemBonus(g, modern, 'attack') === 1, 'a red-dot sight on your weapon: +1 to hit');
    ok(modern.pets.some(p => p.mount && p.where.includes('farms')), 'a horse to ride, kept at the farms');
}
// superpowers (fantasy, public: powers, not magic)
{
    const r = RD.rpgOf(urban);
    ok(urban.name === 'Nova Vega' && /superpower/i.test(urban.setting) && !/\bVeil\b/.test(urban.setting), 'Nova Vega: powers everyone knows about');
    ok(['speedster', 'powerhouse', 'elemental', 'psychic'].every(id => r.classes.some(c => c.id === id)) && r.classes.some(c => c.id === 'martial'), 'speedsters, powerhouses, elementals and psychics next to the modern classes');
    ok(r.focusName === 'Power' && r.schools.length === 8 && r.spells.some(sp => sp.id === 'lightning_arc' && sp.combat === 'damage'), 'powers are the schools, and they work in fights');
    ok(!JSON.stringify(r).match(/\b(magic|spell|witch|vampire)\b/i), 'the word is "powers", never magic');
    ok(r.bestiary.some(f => f.tags.includes('boss') && f.id === 'mastermind') && r.bestiary.some(f => f.id === 'mugger'), 'villains and muggers');
    ok(!urban.realm.pantheon.length && W.systemOn(urban, 'sentient') && W.systemOn(urban, 'soulbound'), 'no gods, but weapons with a mind and soul bonds');
    ok(urban.institutions.some(i => i.id === 'herouni' && i.place === 'herouni') && urban.institutions.some(i => i.id === 'heroschool'), 'a hero university and a hero school');
    ok(urban.factions.some(f => f.id === 'department') && urban.factions.some(f => f.id === 'syndicate' && f.secret), 'a hero team, a villain syndicate, the Department');
    ok(urban.features.apps.find(a => a.id === 'grimoire')?.name === 'Powers' && modern.features.apps.find(a => a.id === 'grimoire')?.name === 'Techniques', 'the spell book is "Powers" there and "Techniques" in Porto Alto');
    const g = rpgSave(urban, 'psychic');
    EC.addGood(g, 'aria_gauntlet', 1);
    hour(g, urban);
    ok(AR.bladeOf(g) && !EC.bagOf(g).items.aria_gauntlet, 'a gauntlet with an AI wakes in your hands');
    const gm = rpgSave(modern, 'soldier'); EC.addGood(gm, 'aria_gauntlet', 1); hour(gm, modern);
    ok(!AR.bladeOf(gm), 'no weapons with a mind in a realistic world');
    ok(urban.maps.every(m => !m.image || m.image.startsWith('../modern/')), 'it reuses Porto Alto\'s pictures');
}
// homes: only a household shares one
{
    const HM = await D('sim/homes.js');
    const g = rpgSave(modern, 'soldier');
    const keys = Object.values(g.cast).map(r => HM.homeKey(r.home));
    const heads = Object.values(g.cast).filter(r => !r.homeWith);
    ok(new Set(heads.map(r => HM.homeKey(r.home))).size === heads.length, 'people with no household live in homes of their own');
    void keys;
    const tiny = structuredClone(modern); tiny.homes.zones = [{ ...tiny.homes.zones[0], spots: tiny.homes.zones[0].spots.slice(0, 2) }];
    const taken = new Set(); const a = HM.homeSpot(tiny, tiny.homes.zones[0].id, taken), b = HM.homeSpot(tiny, tiny.homes.zones[0].id, taken), c = HM.homeSpot(tiny, tiny.homes.zones[0].id, taken);
    ok(new Set([a, b, c].map(HM.homeKey)).size === 3 && c.unit === 1, 'when every home is taken, a new flat opens (never someone else\'s home)');
    const PL = await D('sim/places.js');
    ok(/1B$|2B$/.test(PL.homeAddress(tiny, c)), 'it gets its own address (House 2B)');
    const avoid = { zone: tiny.homes.zones[0].id, x: tiny.homes.zones[0].spots[0][0], y: tiny.homes.zones[0].spots[0][1] };
    const t2 = new Set(); for (let i = 0; i < 5; i++) { const h = HM.homeSpot(tiny, avoid.zone, t2, avoid); ok(!(h.x === avoid.x && h.y === avoid.y), 'never the player\'s address'); }
}
// the preset upgrade
{
    const old = structuredClone(modern); delete old.rpg; delete old.recipes; delete old.towers; delete old.presetAdventure;
    old.goods = old.goods.filter(x => !x.socket && !x.cures && !['scrap', 'supplies'].includes(x.id)); old.pets = old.pets.filter(p => !p.mount);
    for (const o of old.catalogs.origins) { delete o.skills; delete o.feature; delete o.attributes; }
    PRE.upgradeWorld(old);
    ok(old.rpg?.focusName === 'Ki' && old.recipes?.length && old.towers?.length && old.goods.some(x => x.id === 'medkit') && old.pets.some(p => p.mount) && old.catalogs.origins[0].skills?.length && old.presetAdventure, 'a modern world from before gets its RPG, crafting, tower and horse once');
    const again = structuredClone(old); again.recipes = []; PRE.upgradeWorld(again);
    ok(again.recipes.length === 0, 'and removed ones stay removed');
}
// the AI sees it
{
    const g = rpgSave(modern, 'martial'); g.player.loc = 'industrial';
    ok(/Abandoned Tower/.test(P.sceneText()), 'the tower is in the scene');
}
// Porto Alto's maps: Midtown at the center, its districts and villages around it
{
    const PL = await D('sim/places.js'); const SV = await D('core/saves.js');
    const g = rpgSave(modern, 'soldier');
    const ids = ['pinecrest', 'greenvalley', 'maple', 'palmcoast'];
    ok(!modern.maps.some(m => m.id === 'city') && modern.maps[0].id === 'midtown' && modern.maps[0].town, 'the old overview is gone: Midtown is the main map');
    ok(ids.every(id => modern.maps.some(m => m.id === id && m.parent === 'midtown' && m.trip)) && ids.every(id => urban.maps.some(m => m.id === id)), 'four maps hang from Midtown (in both worlds)');
    ok(modern.places.filter(p => !p.link).every(p => modern.maps.some(m => m.id === p.map)) && modern.homes.zones.every(z => modern.maps.some(m => m.id === z.map)), 'every place and home is on a map');
    ok(['downtown', 'east', 'waterfront', 'north', 'south'].every(id => modern.homes.zones.some(z => z.id === id)), 'the old neighborhoods keep their ids (saves still find them)');
    ok(modern.places.filter(p => !p.link).every(p => Array.isArray(p.closed)), 'every place has its hours');
    ok(PL.travelMinutes(g, modern, 'cafe', 'civic') === 30, 'trips inside the center stay short');
    ok(PL.travelMinutes(g, modern, 'cafe', 'park') === 30, 'a district is its own trip away');
    ok(PL.travelMinutes(g, modern, 'cafe', 'pc_square') === 90 && PL.travelMinutes(g, modern, 'gv_store', 'pc_square') === 90, 'the mountain village is an hour and a half up the road');
    ok(PL.travelMinutes(g, modern, 'pc_square', 'pc_lodge') === 30, 'and short walks inside it');
    ok(PL.travelMinutes(g, medieval, 'monastery', 'fort') === 120, 'a region map without the town flag keeps its long trips');
    ok(urban.places.find(p => p.id === 'herouni').map === 'maple', 'the hero university stands in Maple Heights');
    // an old save: its home on the old map moves to the home with its number
    const old = rpgSave(modern, 'soldier'); const [a, b] = Object.values(old.cast);
    old.player.home = { zone: 'north', kind: 'house', x: 4.5, y: 67.4, n: 1 };
    a.home = { zone: 'south', x: 1, y: 1, n: 3 }; b.home = { zone: 'south', x: 1, y: 1, n: 3 };
    SV.repair(old, modern);
    const north = modern.homes.zones.find(z => z.id === 'north'), south = modern.homes.zones.find(z => z.id === 'south');
    ok(old.player.home.x === north.spots[0][0] && old.player.home.y === north.spots[0][1], 'an old home lands on its numbered home in the new map');
    ok(a.home.x === b.home.x && a.home.y === b.home.y && south.spots.some(s => s[0] === a.home.x && s[1] === a.home.y), 'people who shared an address still share it');
}
// character creation: what the world asks for
{
    const w2 = structuredClone(modern); w2.id = 'askless'; w2.sheet.ask = { origin: false, traits: false };
    ok(w2.sheet.ask.origin === false, 'a world can leave out the origin and the traits');
}
// words by style and tone
{
    const LX = await D('core/lexicon.js');
    ok(LX.lex(modern, 'whichSpell') === 'Which technique?' && LX.lex(urban, 'whichSpell') === 'Which power?' && LX.lex(medieval, 'whichSpell') === 'Which spell?', 'a technique, a power or a spell, by style and tone');
    ok(/police/.test(LX.lex(modern, 'guardsTitle')) || LX.lex(modern, 'guardsTitle') === 'The police', 'the police in Porto Alto, the guards in Valdoria');
    const own = structuredClone(modern); own.id = 'ownwords'; own.lexicon = { whichSpell: 'Which kata?' };
    ok(LX.lex(own, 'whichSpell') === 'Which kata?', 'a world can still use its own word');
}
// the country, its towns, jobs and festivals
{
    ok(modern.realm.name === 'Costa Serena' && /Costa Serena/.test(modern.setting) && modern.maps.find(m => m.id === 'pinecrest').area === 'North Highlands', 'the cities belong to one country');
    for (const id of ['pc_cablecar', 'gv_ranch', 'pl_marina', 'mt_court', 'mt_tower', 'mh_market']) ok(modern.occupations.some(o => o.place === id), `jobs at ${id}`);
    ok(['harvest', 'snowfest', 'arenashow', 'blockparty', 'artwalk'].every(id => modern.festivals.some(f => f.id === id)), 'each town has its festival');
    ok(modern.cast.examples.some(e => e.home === 'pc_homes') && modern.cast.examples.some(e => e.home === 'gv_homes'), 'people live in Pinecrest and Green Valley');
}
// a town's festival is its own
{
    const F = await D('sim/festivals.js');
    const g = rpgSave(modern, 'soldier');
    const w2 = structuredClone(modern); w2.id = 'fest'; w2.festivals = [{ id: 'snow', name: 'Snow', season: 'spring', day: 1, days: 28, place: 'pc_square', prices: 2, mood: 10 }];
    g.day = 1;
    ok(F.festivalOn(g, w2, 1, 'pc_lodge')?.id === 'snow' && !F.festivalOn(g, w2, 1, 'cafe'), 'a Pinecrest festival happens in Pinecrest only');
    ok(F.festivalPrice(g, w2, 'cafe') === 1, 'and does not change prices in Midtown');
}
// love: jealousy, or open relationships
{
    const RO = await D('sim/romance.js'); const SO = await D('sim/social.js');
    for (const poly of [false, true]) {
        const g = rpgSave(modern, 'soldier'); const [a, b] = Object.values(g.cast);
        if (poly) g.cfg.poly = true;
        RO.applyAnswer(g, a.avatar, a.name, 'date', 'yes');
        const before = SO.bondOf(g, a.avatar);
        const msg = RO.applyAnswer(g, b.avatar, b.name, 'date', 'yes');
        if (!poly) ok(SO.bondOf(g, a.avatar) < before && /found out/.test(msg), 'a new romance hurts the partner you already have');
        else ok(SO.bondOf(g, a.avatar) === before && RO.partnersOf(g).length === 2 && /open/.test(RO.romanceLine(g, [a, b])), 'with open relationships nobody is jealous, and the AI knows');
    }
}
// free time near home on weekdays
{
    const PE = await D('sim/people.js'); const TM = await D('sim/time.js');
    const g = rpgSave(modern, 'soldier'); const r = Object.values(g.cast)[0];
    r.home = { zone: 'north', x: 6, y: 6, n: 1 }; delete r.homeWith; r.leisure = [];
    r.routine = { weekday: [[0, 'leisure']], weekend: [[0, 'leisure']] };
    let weekdayHome = true;
    for (let d = 0; d < 14; d++) { if (TM.isWeekend(d)) continue; for (const h of [10, 14, 19]) { const at = PE.routineAt(g, modern, r, d * 1440 + h * 60); const p = modern.places.find(x => x.id === at); if (p && p.map !== 'maple') weekdayHome = false; } }
    ok(weekdayHome, 'on weekdays she spends her free time in her own neighborhood');
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
