// Rooms and occupancy (business, hospitality: plans/business-hospitality.md H2): a hotel's day counted in rooms, not in
// a café's takings. Rooms open follow Capacity, how full they are follows the other numbers and the calendar (each
// weekday, named festivals, the hours), and the night's stays and the day's rests are paid at the tier's and the
// style's prices. A venture whose tiers have no `rooms` isn't a hotel and earns as a café does (sim/ventures.ts).
// Phase H0: the shape only; the model comes in session A.
import type { VentureDef, TierDef, StyleDef } from '../core/world.js';

/** Is it a hotel (its tiers count rooms)? */
export const isHotel = (d: VentureDef | null | undefined): boolean => !!d?.tiers.some(t => (t.rooms ?? 0) > 0);

/** A night's and a rest's prices at this tier, the style's over the tier's (0: none). */
export function pricesOf(t: TierDef | null | undefined, st?: StyleDef | null): { stay: number; rest: number } {
    return { stay: st?.prices?.stay ?? t?.prices?.stay ?? 0, rest: st?.prices?.rest ?? t?.prices?.rest ?? 0 };
}
