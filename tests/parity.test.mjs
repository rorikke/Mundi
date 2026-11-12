// Parity: everything a built-in world has can be made in the world creator. Every field of worlds/*/world.json must be
// either a field the creator shows (any tab, any item selected: every place's pin, work event, track, table and climate
// too) or edited by one of the creator's tools (TOOLS). A Remove, move or Add button doesn't count for the fields inside
// what it names. Porto Alto, Urban, Medieval, the Shared House and Tokyo (the world with the most kinds of field).
// A new field nobody can edit fails the build. Run: node tests/parity.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'parity'); browser({});
const D = (p) => import(`${ext}/dist/${p}`);
const W = await D('core/world.js'); const store = await D('core/store.js'); const cw = await D('ui/creator.js'); const me = await D('ui/mapedit.js');
store.state.view = 'creator';

// Keys that are names chosen by the world, not fields: they become "*".
const DYNAMIC = [/^homes\.kinds\.[^.]+/, /^cast\.routineTemplates\.[^.]+/, /^lexicon\.[^.]+/, /^music\.[^.]+/, /^sleep\.restore\.[^.]+/,
    /^actions\.\*\.effects\.[^.]+/, /^occupations\.\*\.cost\.[^.]+/, /^occupations\.\*\.requires\.[^.]+/, /^homes\.kinds\.\*\.bills\.[^.]+/, /^catalogs\.origins\.\*\.attributes\.[^.]+/,
    /^actions\.\*\.roll\.(success|fail)\.effects\.[^.]+/, /^cast\.routineTemplates\.\*\.(weekday|weekend)/, /^traitInfo\.[^.]+/,
    /^goals\.names\.[^.]+/, /^rewards\.(names|prices)\.[^.]+/, /^tables\.[^.]+/, /^occupations\.\*\.tracks\.[^.]+/];
const norm = (p) => { let s = p.replace(/\.\d+(?=\.|$)/g, '.*'); for (const re of DYNAMIC) s = s.replace(re, m => m.replace(/[^.]+$/, '*')); return s; };
const leaves = (o, at = '') => (o === null || typeof o !== 'object' ? [at] : Array.isArray(o) ? o.flatMap((x, i) => leaves(x, `${at}.${i}`)) : Object.keys(o).length ? Object.entries(o).flatMap(([k, v]) => leaves(v, at ? `${at}.${k}` : k)) : [at]);

// Fields edited by the creator's own tools rather than a form field (and why).
const TOOLS = {
    'format': 'set by the creator', 'id': 'set by the creator', 'version': 'set by the creator', 'kind': 'the style picked at the start', 'base': 'set by the loader', 'i18n': 'set by the loader',
    'presetActions': 'set when the preset actions are added', 'presetRpg': 'set when the preset RPG is added',
    'rpg.attributes.*.id': 'set by the creator', 'rpg.skills.*.id': 'set by the creator', 'rpg.classes.*.id': 'set by the creator', 'rpg.classes.*.subclasses.*.id': 'set by the creator',
    'rpg.schools.*.id': 'set by the creator', 'rpg.spells.*.id': 'set by the creator', 'rpg.titles.*.id': 'set by the creator', 'rpg.bestiary.*.id': 'set by the creator', 'presetCombat': 'set when the preset combat data is added', 'presetLife2': 'set when the preset habits, festivals and animals are added', 'habits.*.id': 'set by the creator', 'festivals.*.id': 'set by the creator', 'cityEvents.*.id': 'set by the creator', 'hobbies.*.id': 'set by the creator', 'pets.*.id': 'set by the creator', 'factions.*.id': 'set by the creator', 'realm.pantheon.*.id': 'set by the creator', 'institutions.*.id': 'set by the creator', 'goods.*.id': 'set by the creator', 'crops.*.id': 'set by the creator', 'businesses.*.id': 'set by the creator', 'skies.events.*.id': 'set by the creator', 'skies.hazards.*.id': 'set by the creator', 'presetEconomy': 'set when the preset economy and skies are added', 'rpg.talents.*.id': 'set by the creator', 'presetSchools': 'set when the preset schools and talents are added', 'presetRealm': 'set when the preset factions and realm are added', 'realm.pantheon': 'the Pantheon list (Realm & factions)', 'presetCrises': 'set when the preset crises are added', 'presetAdventure': 'set when the preset crafting, towers, weapons and mounts are added', 'recipes.*.id': 'set by the creator', 'towers.*.id': 'set by the creator', 'blades.*.id': 'set by the creator', 'cover': 'Choose a picture / Use the first map', 'mode': 'Game mode cards', 'retired': 'written by Mundi when a built-in world retires an id (not a creator field)',
    'plan.*': 'Maps & places › Floor plan: floors, their pictures, and the rooms drawn on them', 'maps.*': 'Maps & places: the map editor (add a map, picture, name, parent)', 'places.*.id': 'set by the creator', 'places.*.map': 'Maps & places: the map a pin is put on', 'places.*.x': 'Maps & places: the pin, dragged on the map', 'places.*.y': 'Maps & places: the pin, dragged on the map',
    'places.*.closed': 'Maps & places › a place: Closed at (chips)', 'places.*.roles': 'Maps & places › a place: What it is for the game (chips)', 'places.*.bg': 'Maps & places › a place: Background of the scene (From Backgrounds / Upload)',
    'places.*.bgs': 'Maps & places › a place: the background at other times of the day, seasons and weather (From Backgrounds / Upload)',
    'homes.zones.*.spots': 'Place the homes on the map', 'homes.kinds.*.image': 'Inside picture (scene)', 'homes.zones.*.id': 'set by the creator',
    'statuses.*.id': 'set by the creator', 'actions.*.id': 'set by the creator', 'occupations.*.id': 'set by the creator', 'catalogs.origins.*.id': 'set by the creator',
    'catalogs.courses.*.id': 'set by the creator', 'occupations.*.branches.*.options.*.id': 'set by the creator', 'catalogs.shop.*.id': 'set by the creator', 'homes.expenses.*.id': 'set by the creator', 'homes.breakables.*.id': 'set by the creator',
    'actions.*.home': 'Where', 'actions.*.anywhere': 'Where', 'actions.*.place': 'Where', 'actions.*.tags': 'Where',
    'features.apps': 'the apps list (Features)', 'time.periods.*.id': 'set by the creator',
    'occupations.*.courses': 'Courses tab: Required for these jobs', 'occupations.*.likes': 'Jobs tab / Courses tab', 'cast.routineTemplates.*': 'Routines tab',
    'goals.add.*.id': 'set by the creator', 'rewards.add.*.id': 'set by the creator',
    'presetStarts': 'set when the origins become the first starts (upgradeWorld)',
    'genders.*.id': 'set by the creator', 'sheet.appearance.*.id': 'set by the creator', 'sheet.traits.*.id': 'set by the creator', 'skills.*.id': 'set by the creator',
    'starts.*.id': 'set by the creator', 'stories.*.id': 'set by the creator', 'keepsakes.*.id': 'set by the creator', 'tables.*.*.id': 'set by the creator',
    'occupations.*.events.*.id': 'set by the creator', 'occupations.*.schedule.shifts.*.id': 'set by the creator', 'catalogs.courses.*.aid.*.id': 'set by the creator', 'institutions.*.degrees.*.id': 'set by the creator', 'institutions.*.degrees.*.aid.*.id': 'set by the creator',
    'cast.examples.*.threads.*.id': 'set by the creator', 'cast.examples.*.threads.*.endings.*.id': 'set by the creator',
    'homes.kinds.*.images': 'Homes & rent › a kind of home: Inside picture at other times of the day (upload)',
    // the shared person panel (ui/personui.ts) writes a person's ways whole through its scope, not field by field
    'cast.examples.*.gender': 'People › the person panel: Gender', 'cast.examples.*.attraction': 'People › the person panel: Who they are drawn to',
    'cast.examples.*.pace': 'People › the person panel: Their ways', 'cast.examples.*.style': 'People › the person panel: Their ways', 'cast.examples.*.intimacy': 'People › the person panel: Their ways',
    'cast.examples.*.intimate': 'People › the person panel: the intimate profile, In bed and Drive',
};
// (an empty map, `effects: {}`, is covered when its keys are: `actions.*.effects` by `actions.*.effects.*`)
const covered = (leaf, shown) => shown.some(s => leaf === s || leaf.startsWith(`${s}.`) || s.startsWith(`${leaf}.`)) || Object.keys(TOOLS).some(t => leaf === t || leaf.startsWith(`${t.replace(/\.\*$/, '')}.`) || leaf === t.replace(/\.\*$/, ''));

let fails = 0;
for (const id of ['modern', 'urban', 'medieval', 'house', 'tokyo']) {
    const w = world(ext, id); W.registerWorld(w);
    cw.CW.w = structuredClone(w);
    const shown = new Set();
    // (a Remove, move or Add button names a whole item or list: it doesn't make the fields inside editable)
    const grab = () => { for (const m of cw.creatorHtml().matchAll(/<[^<>]*data-path="([^"]+)"[^<>]*>/g)) if (!/data-act="cw-(del|move|add)"/.test(m[0])) shown.add(norm(m[1])); };
    const lists = { needs: 'statuses', actions: 'actions', jobs: 'occupations', zones: 'homes.zones', origins: 'catalogs.origins', people: 'cast.examples', lore: 'lore', courses: 'catalogs.courses', shop: 'catalogs.shop', expenses: 'homes.expenses', breakables: 'homes.breakables', rattr: 'rpg.attributes', rskill: 'rpg.skills', rclass: 'rpg.classes', rschool: 'rpg.schools', rspell: 'rpg.spells', rtitle: 'rpg.titles', rfoe: 'rpg.bestiary', habit: 'habits', festival: 'festivals', cevent: 'cityEvents', hobby: 'hobbies', pet: 'pets', god: 'realm.pantheon', faction: 'factions', inst: 'institutions', rtal: 'rpg.talents', good: 'goods', recipe: 'recipes', tower: 'towers', blade: 'blades', crop: 'crops', biz: 'businesses', sky: 'skies.events', hazard: 'skies.hazards', goal: 'goals.add', reward: 'rewards.add', skill: 'skills', story: 'stories', keep: 'keepsakes', start: 'starts' };
    for (const tab of ['general', 'features', 'needs', 'maps', 'homes', 'actions', 'jobs', 'goals', 'courses', 'shop', 'words', 'character', 'rpg', 'customs', 'realm', 'economy', 'people', 'lore', 'books']) {
        cw.CW.tab = tab; grab();
        for (const [key, p] of Object.entries(lists)) { const n = (p.split('.').reduce((o, k) => o?.[k], cw.CW.w) ?? []).length; for (let i = 0; i < n; i++) { cw.CW.sel[key] = i; grab(); } cw.CW.sel[key] = 0; }
        for (const r of Object.keys(cw.CW.w.cast.routineTemplates)) { cw.CW.sel.routine = r; grab(); }
        // each job's work events, its tracks and theirs (an event's form opens below its list)
        if (tab === 'jobs') for (let i = 0; i < cw.CW.w.occupations.length; i++) {
            const o = cw.CW.w.occupations[i]; cw.CW.sel.jobs = i;
            (o.events ?? []).forEach((_e, k) => { cw.CW.sel.wev = `occupations.${i}.events.${k}`; grab(); });
            for (const t of Object.keys(o.tracks ?? {})) { cw.CW.sel.track = t; grab(); (o.tracks[t].events ?? []).forEach((_e, k) => { cw.CW.sel.wev = `occupations.${i}.tracks.${t}.events.${k}`; grab(); }); }
            cw.CW.sel.track = ''; cw.CW.sel.wev = '';
        }
        if (tab === 'actions') for (const t of Object.keys(cw.CW.w.tables ?? {})) { cw.CW.sel.table = t; grab(); }   // each shared table
        if (tab === 'maps') { for (const p of cw.CW.w.places) { me.ME.map = p.map; me.ME.pin = p.id; grab(); } me.ME.pin = ''; }   // each place
        if (tab === 'economy') for (const c of Object.keys(cw.CW.w.climates ?? {})) { cw.CW.sel.climate = c; grab(); }   // each climate
        if (tab === 'character') for (const n of Object.keys(cw.CW.w.traitInfo ?? {})) { cw.CW.sel.tinfo = n; grab(); }   // what each trait does
    }
    const all = [...new Set(leaves(cw.CW.w).map(norm))].filter(Boolean).sort();
    const miss = all.filter(l => !covered(l, [...shown]));
    console.log(`${id}: ${all.length} kinds of field, ${miss.length} not editable${miss.length ? `:\n  ${miss.join('\n  ')}` : ''}`);
    fails += miss.length;
}
process.exit(fails ? 1 : 0);
