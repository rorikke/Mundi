// Festivals: fixed days of a season (the Harvest Festival, Midwinter, New Year…). While one lasts, prices change, the
// people with free time gather at its place in the afternoon and evening, the AI knows, and you can celebrate there
// once a day (mood, and a little reputation in town). Several can fall on the same day, each at its own place.
import { changes, type Save } from '../core/store.js';
import { systemOn, type WorldDef, type FestivalDef } from '../core/world.js';
import { seasonDays, SEASONS } from './time.js';
import { addStatus } from './needs.js';
import { note } from './facts.js';

const on = (w: WorldDef) => systemOn(w, 'festivals') && !!w.festivals?.length;
const seasonAt = (g: Save, day: number) => SEASONS[Math.floor((Math.max(1, day) - 1) / seasonDays(g)) % 4].id;
const daySeason = (g: Save, day: number) => ((Math.max(1, day) - 1) % seasonDays(g)) + 1;
// The festivals of a day (several towns can celebrate on the same day). Asked for each time someone's free time is
// worked out, so each day's list is kept (it depends on the world's festivals and the length of the seasons; a world
// edit comes with a click, changes() in core/store.ts).
const kept = new WeakMap<WorldDef, { list: FestivalDef[]; len: number; n: number; by: Map<string, FestivalDef[]> }>();
export function festivalsOn(g: Save, w: WorldDef, day = g.day): FestivalDef[] {
    if (!on(w)) return [];
    const n = changes();
    let k = kept.get(w);
    if (!k || k.list !== w.festivals || k.len !== w.festivals!.length || k.n !== n || k.by.size > 400) kept.set(w, k = { list: w.festivals!, len: w.festivals!.length, n, by: new Map() });
    const key = `${seasonDays(g)}|${day}`;
    let list = k.by.get(key);
    if (!list) {
        const s = seasonAt(g, day), d = daySeason(g, day);
        k.by.set(key, list = w.festivals!.filter(f => f.season === s && d >= Math.min(f.day, seasonDays(g)) && d < Math.min(f.day, seasonDays(g)) + Math.max(1, f.days ?? 1)));
    }
    return list.slice();
}
// A festival belongs to the town of its place: the maps of the same city (the same "area"), or its own map. One
// without a place is for everyone.
const mapOfPlace = (g: Save, w: WorldDef, id: string) => {
    if (id === 'home:player') return w.homes.zones.find(z => z.id === g.player.home?.zone)?.map;
    if (id.startsWith('home:')) { const r = g.cast[id.slice(5)]; const h = (r as any)?.homeWith === '__you' ? g.player.home : r?.home; return w.homes.zones.find(z => z.id === h?.zone)?.map; }
    return w.places.find(p => p.id === id)?.map;
};
const townOf = (w: WorldDef, mapId?: string) => { const m = w.maps.find(x => x.id === mapId); return m ? m.area ?? m.id : ''; };
// (E19) The places a festival fills: its place and its `places`.
const spotsOf = (f: FestivalDef) => [...(f.place ? [f.place] : []), ...(f.places ?? [])];
// The festivals of a day that count for someone at a place (the player's place by default), or on a map (`{ map }`):
// those of its town, and those for everyone. Several can fall on one day (hanami and the start of the work year).
export function festivalsHere(g: Save, w: WorldDef, day = g.day, place: string | { map?: string } = g.player.loc): FestivalDef[] {
    const list = festivalsOn(g, w, day); if (!list.length) return [];
    const here = townOf(w, typeof place === 'string' ? mapOfPlace(g, w, place) : place.map);
    return list.filter(f => !spotsOf(f).length || w.maps.length < 2 || spotsOf(f).some(id => townOf(w, mapOfPlace(g, w, id)) === here));
}
// The festival of a day for someone at a place: the one held at that very place, or else the town's first.
export function festivalOn(g: Save, w: WorldDef, day = g.day, place: string | { map?: string } = g.player.loc): FestivalDef | null {
    const list = festivalsHere(g, w, day, place);
    return (typeof place === 'string' ? list.find(f => spotsOf(f).includes(place)) : undefined) ?? list[0] ?? null;
}
// Where people gather (afternoon and evening, from noon to 22h): the festival of their own town. A festival that says
// who comes (`audience` or `crowd`, E23) doesn't gather everyone: people go one by one, for a few hours
// (sim/dayplan.ts).
export function festivalSpot(g: Save, w: WorldDef, at: number, home?: string | { map?: string }): string | null {
    const day = Math.floor(at / 1440), h = Math.floor((at % 1440) / 60), where = home ?? g.player.loc;
    if (h < 12 || h >= 22) return null;
    const here = townOf(w, typeof where === 'string' ? mapOfPlace(g, w, where) : where.map);
    const f = festivalsOn(g, w, day).find(x => !!x.place && !x.audience?.length && x.crowd === undefined && w.places.some(p => p.id === x.place) && (w.maps.length < 2 || townOf(w, mapOfPlace(g, w, x.place)) === here));
    return f?.place ?? null;
}
/** Is a festival celebrated in the town of this map (one without a place: everywhere)? */
export const inTown = (g: Save, w: WorldDef, f: FestivalDef, map?: string) => !f.place || w.maps.length < 2 || townOf(w, mapOfPlace(g, w, f.place)) === townOf(w, map);
export const festivalPrice = (g: Save, w: WorldDef, place = g.player.loc) => festivalOn(g, w, g.day, place)?.prices ?? 1;
// The next festivals (for the calendar).
export function upcoming(g: Save, w: WorldDef, days = 28) {
    if (!on(w)) return [];
    const out: { f: FestivalDef; day: number }[] = [];
    for (let d = g.day; d < g.day + days; d++) for (const f of festivalsOn(g, w, d)) if (!out.some(x => x.f.id === f.id && d - x.day < (f.days ?? 1))) out.push({ f, day: d });
    return out;
}
// Festivals celebrated ("id|day"; one string in older saves).
const celebrated = (g: Save): string[] => { const c = (g as any).celebrated; return Array.isArray(c) ? c : c ? [String(c)] : []; };
// A festival you can join here today: at its place (or one without a place), each once a day.
export function canCelebrate(g: Save, w: WorldDef): FestivalDef | null {
    const done = celebrated(g);
    return festivalsHere(g, w).find(f => !done.includes(`${f.id}|${g.day}`) && (!spotsOf(f).length || spotsOf(f).includes(g.player.loc))) ?? null;
}
export function celebrate(g: Save, w: WorldDef, addRep: (d: number) => void): string {
    const f = canCelebrate(g, w); if (!f) return '';
    (g as any).celebrated = [...celebrated(g).filter(k => Number(k.split('|')[1]) >= g.day), `${f.id}|${g.day}`];
    addStatus(g, w, 'mood', f.mood ?? 15); addStatus(g, w, 'energy', -8);
    addRep(1);
    note(g, '{u} celebrated the {0}.', [f.name], [], g.player.loc, 'social');
    return `You join the ${f.name}!`;
}
// Every festival of the town today (the one held here first).
export function festivalLine(g: Save, w: WorldDef): string {
    const here = festivalOn(g, w); if (!here) return '';
    return [here, ...festivalsHere(g, w).filter(f => f !== here)].map(f => {
        const place = w.places.find(p => p.id === f.place)?.name;
        // "Today: Cherry Blossoms" reads for any name ("Today is the Cherry Blossoms" didn't)
        return `Today: ${f.name}${f.desc ? ` (${f.desc.replace(/[.\s]+$/, '')})` : ''}.${place ? ` People gather at ${place} in the afternoon and evening.` : ''}`;
    }).join(' ');
}
