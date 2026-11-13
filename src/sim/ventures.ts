// Ventures (business): what you own or run, a café of your own or an executive's division, growing like an
// incremental game (requirements/business.md B-15): four numbers inside a tier's ceiling, upgrades that last (bought,
// found in the city, earned), a milestone story to the next tier, a style per tier, discoveries kept for good,
// calendar cards, the week's takings and report, running it yourself, hired hands from the world's pool. The world
// says what can be owned (`w.ventures`, core/world.ts); the save keeps what is (`g.ventures`, read with defaults, no
// schema change). Everything waits on the `business` system: off, or with no ventures in the world, nothing happens.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type VentureDef } from '../core/world.js';
import { adultOn } from '../core/store.js';
import { statsOf } from '../core/ventures.js';
import { onDay, ventureLink } from './hooks.js';

/** A venture as the save keeps it. `id`: its world entry's; `place`: where it runs (the unit you lease, the takeover's
 *  place, the company's office), `places` more of them from a later tier; `name`: what you called it; `way`: how it
 *  became yours; `since`: that day; `tier`: 1 the first; `style`: the current tier's; `stats`: its numbers; `owned`,
 *  `found`, `disc`: upgrades bought, upgrades turned up and waiting, discoveries made; `staff`: hired hands (a name, a
 *  quirk, the upgrade that brought them); `cash`: this week's takings so far (paid at the week's end); `week`/`last`:
 *  this week's and last week's report; `closed`: the day it was sold or closed (kept, it does nothing). */
export interface VentureState {
    id: string; place: string; places?: string[]; name?: string; way: 'takeover' | 'lease' | 'rank';
    since: number; tier: number; style?: string;
    stats: Record<string, number>; owned: string[]; found: string[]; disc: string[];
    staff: { name: string; quirk: string; for: string }[];
    manager?: boolean; cash: number; rent?: number;
    week: WeekReport; last?: WeekReport; closed?: number;
}
/** A week's report: its number (week 0 is days 1–7), what came in and went out, days you ran it, lines worth telling. */
export interface WeekReport { n: number; takings: number; costs: number; run: number; notes: string[] }
/** The save's ventures: the list, the stint you're working now (`running`: until when, in absolute minutes), the week a
 *  calendar card was last put to you and the one waiting. */
export interface Ventures { list: VentureState[]; running?: { id: string; until: number }; cardWeek?: number; card?: { venture: string; id: string; day: number } }

const EMPTY: VentureState[] = [];
/** The ventures you own now (closed ones left out); reading never writes to the save. */
export const venturesOf = (g: Save): VentureState[] => ((g as any).ventures?.list as VentureState[] | undefined)?.filter(s => s && !s.closed) ?? EMPTY;
/** The save's ventures, made when first written. */
export function ventureStore(g: Save): Ventures {
    const v = ((g as any).ventures ??= {}) as Ventures;
    v.list ??= [];
    for (const s of v.list) { s.stats ??= {}; s.owned ??= []; s.found ??= []; s.disc ??= []; s.staff ??= []; s.cash ??= 0; s.tier ??= 1; s.week ??= { n: weekOf(g.day), takings: 0, costs: 0, run: 0, notes: [] }; }
    return v;
}
export const weekOf = (day: number) => Math.floor((Math.max(1, day) - 1) / 7);

/** The world's ventures this game can have (adult ones only with adult content on; none with the system off). */
export function ventureDefs(g: Save | null | undefined, w: WorldDef): VentureDef[] {
    if (!systemOn(w, 'business')) return [];
    return (w.ventures ?? []).filter(v => !v.adult || (!!g && adultOn(g)));
}
export const ventureDef = (w: WorldDef, id: string) => (w.ventures ?? []).find(v => v.id === id) ?? null;
/** The venture you own that runs at this place, if any. */
export function ventureAt(g: Save, w: WorldDef, place: string): VentureState | null {
    if (!systemOn(w, 'business')) return null;
    return venturesOf(g).find(s => s.place === place || (s.places ?? []).includes(place)) ?? null;
}
/** Are you running this venture yourself right now (a stint at its counter)? */
export function isRunning(g: Save, id?: string): boolean {
    const r = ((g as any).ventures as Ventures | undefined)?.running;
    return !!r && (!id || r.id === id);
}
/** Points added to one of a venture's numbers (below 0 taken away), held between 0 and its tier's ceiling. Returns
 *  what was really added. */
export function addStat(g: Save, w: WorldDef, s: VentureState, stat: string, n: number): number {
    const d = ventureDef(w, s.id);
    if (!d || !statsOf(d).includes(stat) || !n) return 0;
    const cap = d.tiers[Math.min(d.tiers.length, Math.max(1, s.tier)) - 1]?.ceiling ?? 0;
    const was = s.stats[stat] ?? 0, now = Math.max(0, Math.min(Math.max(cap, was), was + n));
    s.stats[stat] = now;
    return now - was;
}
/** What the AI is told about the venture at this place (empty elsewhere, and until there is one). */
export function ventureLine(g: Save, w: WorldDef): string {
    if (!systemOn(w, 'business') || !venturesOf(g).length) return '';
    return '';
}

// An upgrade turned up by a story: kept as found in the venture it belongs to, if you own that venture.
ventureLink.find = (g, w, id) => {
    if (!systemOn(w, 'business')) return [];
    for (const s of venturesOf(g)) {
        const u = ventureDef(w, s.id)?.upgrades?.find(x => x.id === id);
        if (!u || s.owned.includes(id) || s.found.includes(id)) continue;
        s.found.push(id);
        return [`Found for ${s.name || ventureDef(w, s.id)!.name}: ${u.name}. It waits in the Business app.`];
    }
    return [];
};

// The day's takings and the week's report (the growth model): nothing until a venture is yours.
onDay.push((g, w) => {
    if (!systemOn(w, 'business') || !venturesOf(g).length) return [];
    return [];
});
