/** Is it a hotel (its tiers count rooms)? */
export const isHotel = (d) => !!d?.tiers.some(t => (t.rooms ?? 0) > 0);
/** A night's and a rest's prices at this tier, the style's over the tier's (0: none). */
export function pricesOf(t, st) {
    return { stay: st?.prices?.stay ?? t?.prices?.stay ?? 0, rest: st?.prices?.rest ?? t?.prices?.rest ?? 0 };
}
