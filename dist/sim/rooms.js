/** The model's numbers (tuned by the long run): `floor` how full a hotel is with its numbers at nothing (the city
 *  always sends someone), the rest of the way coming from its appeal; `open` the share of rooms open with Capacity at
 *  nothing (the rest open as Capacity grows). */
export const ROOMS = { floor: 0.35, open: 0.5 };
/** Is it a hotel (its tiers count rooms)? */
export const isHotel = (d) => !!d?.tiers.some(t => (t.rooms ?? 0) > 0);
/** A night's and a rest's prices at this tier, the style's over the tier's (0: none). */
export function pricesOf(t, st) {
    return { stay: st?.prices?.stay ?? t?.prices?.stay ?? 0, rest: st?.prices?.rest ?? t?.prices?.rest ?? 0 };
}
export function hotelDay(t, st, statIds, stats, mul, demand, capacity = 'capacity') {
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
export function hourMul(d, hour) {
    let m = 1;
    for (const [a, b, x] of d.demand?.hours ?? [])
        if (a <= b ? hour >= a && hour < b : hour >= a || hour < b)
            m *= x;
    return m;
}
