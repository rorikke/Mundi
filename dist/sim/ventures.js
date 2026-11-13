import { systemOn } from '../core/world.js';
import { adultOn } from '../core/store.js';
import { statsOf } from '../core/ventures.js';
import { onDay, ventureLink } from './hooks.js';
const EMPTY = [];
/** The ventures you own now (closed ones left out); reading never writes to the save. */
export const venturesOf = (g) => g.ventures?.list?.filter(s => s && !s.closed) ?? EMPTY;
/** The save's ventures, made when first written. */
export function ventureStore(g) {
    const v = (g.ventures ??= {});
    v.list ??= [];
    for (const s of v.list) {
        s.stats ??= {};
        s.owned ??= [];
        s.found ??= [];
        s.disc ??= [];
        s.staff ??= [];
        s.cash ??= 0;
        s.tier ??= 1;
        s.week ??= { n: weekOf(g.day), takings: 0, costs: 0, run: 0, notes: [] };
    }
    return v;
}
export const weekOf = (day) => Math.floor((Math.max(1, day) - 1) / 7);
/** The world's ventures this game can have (adult ones only with adult content on; none with the system off). */
export function ventureDefs(g, w) {
    if (!systemOn(w, 'business'))
        return [];
    return (w.ventures ?? []).filter(v => !v.adult || (!!g && adultOn(g)));
}
export const ventureDef = (w, id) => (w.ventures ?? []).find(v => v.id === id) ?? null;
/** The venture you own that runs at this place, if any. */
export function ventureAt(g, w, place) {
    if (!systemOn(w, 'business'))
        return null;
    return venturesOf(g).find(s => s.place === place || (s.places ?? []).includes(place)) ?? null;
}
/** Are you running this venture yourself right now (a stint at its counter)? */
export function isRunning(g, id) {
    const r = g.ventures?.running;
    return !!r && (!id || r.id === id);
}
/** Points added to one of a venture's numbers (below 0 taken away), held between 0 and its tier's ceiling. Returns
 *  what was really added. */
export function addStat(g, w, s, stat, n) {
    const d = ventureDef(w, s.id);
    if (!d || !statsOf(d).includes(stat) || !n)
        return 0;
    const cap = d.tiers[Math.min(d.tiers.length, Math.max(1, s.tier)) - 1]?.ceiling ?? 0;
    const was = s.stats[stat] ?? 0, now = Math.max(0, Math.min(Math.max(cap, was), was + n));
    s.stats[stat] = now;
    return now - was;
}
/** What the AI is told about the venture at this place (empty elsewhere, and until there is one). */
export function ventureLine(g, w) {
    if (!systemOn(w, 'business') || !venturesOf(g).length)
        return '';
    return '';
}
// An upgrade turned up by a story: kept as found in the venture it belongs to, if you own that venture.
ventureLink.find = (g, w, id) => {
    if (!systemOn(w, 'business'))
        return [];
    for (const s of venturesOf(g)) {
        const u = ventureDef(w, s.id)?.upgrades?.find(x => x.id === id);
        if (!u || s.owned.includes(id) || s.found.includes(id))
            continue;
        s.found.push(id);
        return [`Found for ${s.name || ventureDef(w, s.id).name}: ${u.name}. It waits in the Business app.`];
    }
    return [];
};
// The day's takings and the week's report (the growth model): nothing until a venture is yours.
onDay.push((g, w) => {
    if (!systemOn(w, 'business') || !venturesOf(g).length)
        return [];
    return [];
});
