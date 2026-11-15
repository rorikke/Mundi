// The museum of your own (track 5 of end-game spending): the display halls' pieces and where they come from, display
// cases at home, the museum's place taken on through its offer, upgrades and renown, visitors, shows, replicas and the
// workshop. The world data is `w.collection.museum` and the slots' `sources` (core/world.ts, made safe by
// core/collection.ts); the save is `g.collection.museum`. With the collection system off, or a world without a museum,
// nothing here reads or writes anything. (M0: the state, the accessors and the place gate; the rules come with M-A.)
import type { Save } from '../core/store.js';
import type { WorldDef, MuseumDef } from '../core/world.js';
import { placeGates } from './hooks.js';
import { collectionOn, collectionOf } from './collection.js';

/** What the save keeps for the museum (all read with defaults): the day it began (the first display piece or the offer)
 *  and the day it opened; upgrades bought (id → day); lasting renown from milestones; the show on (a hall's group as
 *  its theme, from and until) and the themes held; the dealer's next visit, stock, visits each piece has waited and the
 *  piece asked for; the next sale's lots (estimate, your top bid), lots lost (sales left until they're back) and sales
 *  held; last week's visitors' money; `v` once the display pieces have been filled from what the save remembers. */
export interface MuseumState {
    begun?: number; opened?: number;
    ups?: Record<string, number>;
    renownAdd?: number;
    show?: { theme: string; from: number; until: number }; shows?: string[];
    dealer?: { next?: number; stock?: { id: string; price: number }[]; waited?: Record<string, number>; ask?: string };
    sales?: { next?: number; lots?: { id: string; est: number; bid?: number }[]; lost?: Record<string, number>; held?: number };
    income?: number;
    v?: number;
}

/** The world's museum, when the collection is on there and it has one. */
export const museumDef = (w: WorldDef | null | undefined): MuseumDef | undefined => (collectionOn(w) ? w!.collection!.museum : undefined);
/** The collection on and a museum in this world. */
export const museumOn = (w: WorldDef | null | undefined): boolean => !!museumDef(w);
/** The save's museum as it is, without writing anything. */
export const museumOf = (g: Save | null | undefined): MuseumState | undefined => (g ? (collectionOf(g) as any)?.museum : undefined);
/** The save's museum, made on first use (only call it with the museum on). */
export function museumState(g: Save): MuseumState {
    const c = ((g as any).collection ??= {});
    c.got ??= {}; c.counted ??= []; c.had ??= [];
    return (c.museum ??= {}) as MuseumState;
}
/** Is the museum yours (its offer taken)? */
export const museumOpen = (g: Save | null | undefined, w: WorldDef | null | undefined): boolean => museumOn(w) && museumOf(g)?.opened !== undefined;

// The museum's place is off the maps, out of place pickers and nobody goes there until it's yours.
placeGates.push((g, w, id) => { const m = museumDef(w); return !m || m.place !== id || museumOpen(g, w); });
