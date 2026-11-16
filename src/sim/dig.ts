// Digs (track 6 of end-game spending, Nature and Before Edo): a dig comes back every season of its own (Tokyo: Hijiri
// University's, every autumn), its actions count the days you dig and roll for its finds, and a piece of parts (a fossil)
// is put together by the museum's workshop once every part is in. The world data is `w.collection.digs` and the slots'
// `dig` sources, `parts`, `mount` and `partPics` (core/world.ts, made safe by core/collection.ts); the save is
// `g.collection.digs` (each dig's counts), `g.collection.parts` (the parts you have) and `g.collection.museum.mount`
// (pieces being put together). With the collection off, or no digs, nothing here reads or writes anything.
// (Session N0 declares the state and the condition key; the rolls, parts and mounting are N-A's.)
import type { Save } from '../core/store.js';
import type { WorldDef, DigDef } from '../core/world.js';
import { collectionLink } from './hooks.js';
import { collectionOn, collectionOf } from './collection.js';

/** One dig's counts: `at` the season (its index since day 1) the season's counts are for, `days` dug in it and `found`
 *  in it; `seasons` past seasons with a day dug (the current one counts once it's over), `total` days ever, `found`
 *  ever (`all`), the day last counted. */
export interface DigState { at?: number; days?: number; found?: number; seasons?: number; total?: number; all?: number; last?: number }
/** A piece's parts you have: part → the day it came. */
export type PartsState = Record<string, Record<string, number>>;

/** The world's digs, when the collection is on there. */
export const digsOf = (w: WorldDef | null | undefined): DigDef[] => (collectionOn(w) ? w!.collection!.digs ?? [] : []);
export const digOf = (w: WorldDef | null | undefined, id: string): DigDef | undefined => digsOf(w).find(d => d.id === id);
/** The save's dig counts as they are, without writing anything. */
export const digStatesOf = (g: Save | null | undefined): Record<string, DigState> => ((g ? (collectionOf(g) as any)?.digs : undefined) ?? {});
/** One dig's counts, made on first use (only call it with the collection on and the dig in the world). */
export function digState(g: Save, id: string): DigState {
    const c = ((g as any).collection ??= {});
    c.got ??= {}; c.counted ??= []; c.had ??= [];
    return ((c.digs ??= {})[id] ??= {}) as DigState;
}
/** The parts of a piece you have, without writing anything. */
export const partsOf = (g: Save | null | undefined, slot: string): Record<string, number> => ((g ? (collectionOf(g) as any)?.parts?.[slot] : undefined) ?? {});
/** The save's parts, made on first use. */
export function partsState(g: Save): PartsState {
    const c = ((g as any).collection ??= {});
    c.got ??= {}; c.counted ??= []; c.had ??= [];
    return (c.parts ??= {}) as PartsState;
}

/* ---------- the condition key `dig:` ---------- */

// `dig: seasons 1` · `days 3` · `found 2`, summed over the world's digs
const DIG = /^(seasons|days|found)\s+(\d+)$/i;
const countOf = (g: Save, w: WorldDef, what: string): number => {
    const st = digStatesOf(g);
    return digsOf(w).reduce((n, d) => { const s = st[d.id] ?? {}; return n + (what === 'seasons' ? s.seasons ?? 0 : what === 'days' ? s.total ?? 0 : s.all ?? 0); }, 0);
};
collectionLink.dig = (g, w, v) => {
    const m = v.match(DIG); if (!m || !digsOf(w).length) return false;
    return countOf(g, w, m[1].toLowerCase()) >= Number(m[2]);
};
collectionLink.digWords = (g, w, v) => {
    const m = v.match(DIG); if (!m) return v;
    const n = Number(m[2]), name = digsOf(w)[0]?.name ?? 'the dig';
    const what = m[1].toLowerCase();
    if (what === 'seasons') return n === 1 ? `a season at ${name}` : `${n} seasons at ${name}`;
    if (what === 'days') return n === 1 ? `a day at ${name}` : `${n} days at ${name}`;
    return n === 1 ? `a find at ${name}` : `${n} finds at ${name}`;
};
