// The collection: halls of slots and the completion record (Tokyo memories). A record slot fills by itself, for good,
// the first time its condition holds; R-1 leaves out what this game can't have; old saves are filled once from what they
// remember. The world data is `w.collection` (core/world.ts, made safe by core/collection.ts); the save is
// `g.collection`. With the system off, or a world without halls, nothing here reads or writes anything.
import type { Save } from '../core/store.js';
import { systemOn, getWorld, type WorldDef, type SlotDef } from '../core/world.js';
import { onHour, onKeepsake, collectionLink } from './hooks.js';

/** What the save keeps: the slots filled (the day; a storyline's ending, whether it was good and how it came; `back`:
 *  filled by the first settle from what the save already remembered), the slots the percentages count, the keepsakes
 *  held at some time, the day the app was last opened, and `v` once the first settle has run. */
export interface Got { day: number; how?: string; good?: boolean; by?: string; back?: boolean }
export interface CollectionState { got: Record<string, Got>; counted: string[]; had: string[]; seen?: number; v?: number }

/** The system on and something to collect in this world. */
export const collectionOn = (w: WorldDef | null | undefined): boolean => !!w && systemOn(w, 'collection') && !!w.collection?.halls?.length;
/** The save's collection as it is, without writing anything. */
export const collectionOf = (g: Save): CollectionState | undefined => (g as any).collection;
/** The save's collection, made on first use. */
export function collectionState(g: Save): CollectionState {
    const c = ((g as any).collection ??= {}) as CollectionState;
    c.got ??= {}; c.counted ??= []; c.had ??= [];
    return c;
}

/** The slots this game has (R-1). */
export function slotsHere(g: Save, w: WorldDef): SlotDef[] {
    if (!collectionOn(w)) return [];
    return [];
}
/** Fill what holds now (an hourly hook; the first run is the backfill). Returns lines to show. */
export function settleCollection(g: Save, w: WorldDef): string[] {
    if (!collectionOn(w)) return [];
    return [];
}

onHour.push((g, w) => settleCollection(g, w));
onKeepsake.push((g, id) => {
    if (!collectionOn(getWorld(g.world))) return;
    const c = collectionState(g);
    if (!c.had.includes(id)) c.had.push(id);
});
collectionLink.storiesDone = () => false;
collectionLink.goalsAll = () => false;
