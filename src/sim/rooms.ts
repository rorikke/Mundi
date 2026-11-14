// Rooms and occupancy (business, hospitality: plans/business-hospitality.md H2): a hotel's day counted in rooms, not in
// a café's takings. Rooms open follow Capacity; how full they are follows the other numbers (by the style) and the
// calendar; the night's stays and the day's rests are paid at the tier's and the style's prices, and running costs
// take their share. A venture whose tiers have no `rooms` isn't a hotel and earns as a café does (sim/ventures.ts).
// Pure numbers: the caller gives the day's demand, so this file needs no other module of the game.
import type { VentureDef, TierDef, StyleDef } from '../core/world.js';

/** The model's numbers (tuned by the long run): `floor` how full a hotel is with its numbers at nothing (the city
 *  always sends someone), the rest of the way coming from its appeal; `open` the share of rooms open with Capacity at
 *  nothing (the rest open as Capacity grows). */
export const ROOMS = { floor: 0.35, open: 0.5 };

/** Is it a hotel (its tiers count rooms)? */
export const isHotel = (d: VentureDef | null | undefined): boolean => !!d?.tiers.some(t => (t.rooms ?? 0) > 0);

/** A night's and a rest's prices at this tier, the style's over the tier's (0: none). */
export function pricesOf(t: TierDef | null | undefined, st?: StyleDef | null): { stay: number; rest: number } {
    return { stay: st?.prices?.stay ?? t?.prices?.stay ?? 0, rest: st?.prices?.rest ?? t?.prices?.rest ?? 0 };
}

/** A hotel's day: the rooms it has at this tier, those open (by Capacity), how full they are (0–1, by its appeal and
 *  the day's demand), and what comes in before (`gross`) and after (`net`) the running costs. `stats`: its numbers;
 *  `mul`: the style's multiplier for a number; `capacity`: the id of the number that counts rooms. */
export interface HotelDay { rooms: number; open: number; occupancy: number; stays: number; rests: number; gross: number; net: number }
export function hotelDay(t: TierDef, st: StyleDef | null, statIds: string[], stats: Record<string, number>, mul: (k: string) => number, demand: number, capacity = 'capacity'): HotelDay {
    const cap = Math.max(1, t.ceiling), rooms = t.rooms ?? 0;
    const capShare = Math.min(1, (stats[capacity] ?? 0) * mul(capacity) / cap);
    const open = Math.round(rooms * (ROOMS.open + (1 - ROOMS.open) * capShare));
    const others = statIds.filter(k => k !== capacity);
    const appeal = others.length ? Math.min(1, others.reduce((a, k) => a + Math.min(cap, stats[k] ?? 0) * mul(k), 0) / (others.length * cap)) : 0;
    const occupancy = Math.max(0, Math.min(1, (ROOMS.floor + (1 - ROOMS.floor) * appeal) * demand));
    const p = pricesOf(t, st);
    const stays = open * occupancy, rests = open * occupancy * (t.rests ?? 0);
    const gross = stays * p.stay + rests * p.rest;
    return { rooms, open, occupancy, stays, rests, gross, net: gross * (1 - (t.costs ?? 0)) };
}

/** How busy the hours make it now: the venture's `hours` rows `[from, to, multiplier]` that hold at this hour (a row
 *  may run past midnight, 20–6), multiplied; 1 with none. */
export function hourMul(d: VentureDef, hour: number): number {
    let m = 1;
    for (const [a, b, x] of d.demand?.hours ?? []) if (a <= b ? hour >= a && hour < b : hour >= a || hour < b) m *= x;
    return m;
}
