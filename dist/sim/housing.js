import { systemOn } from '../core/world.js';
import { homeKey } from './homes.js';
/* ---------- what the world says (read with defaults) ---------- */
export const housingOn = (w) => !!w && systemOn(w, 'housing');
export const zoneOf = (w, id) => w.homes.zones.find(z => z.id === id);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** What a home in this zone costs to buy, before the difficulty (0: not for sale). */
export const zonePrice = (z) => Math.max(0, Math.round(num(z?.price)));
/** Homes here can be bought. */
export const buyable = (z) => zonePrice(z) > 0;
/** Homes here can only be bought, never rented (no rent). Nobody is placed in one by chance. */
export const buyOnly = (z) => buyable(z) && !(num(z?.rent) > 0);
/** The share of what you paid that selling gives back, held to 0.5–0.9. */
export const RESALE = { min: 0.5, max: 0.9, usual: 0.7 };
export const resaleOf = (z) => (num(z?.resale) > 0 ? Math.min(RESALE.max, Math.max(RESALE.min, num(z.resale))) : RESALE.usual);
/** What a home here you own costs a week, before the difficulty. */
export const upkeepOf = (z) => Math.max(0, Math.round(num(z?.upkeep)));
/** How big a home here is, 1–5: the zone's, else its kind's, else 1. */
export const SIZES = { min: 1, max: 5 };
export function sizeOf(w, z) {
    const v = num(z?.size) || num(z && w.homes.kinds[z.kind]?.size) || 1;
    return Math.min(SIZES.max, Math.max(SIZES.min, Math.round(v)));
}
/** How many guests can come to a party in a home of this kind (null: no limit, as before). */
export const guestsOf = (w, kind) => { const n = Math.round(num(kind ? w.homes.kinds[kind]?.guests : 0)); return n > 0 ? n : null; };
/** Fixtures a home of this kind comes with. */
export const comesWith = (w, kind) => (kind ? (w.homes.kinds[kind]?.fixtures ?? []).filter(id => typeof id === 'string') : []);
/** A home here can be a second home: as the zone says, else any home you can buy. */
export const canBeSecond = (z) => (z?.second ?? buyable(z)) === true;
/** The world's rooms and fixtures (a world without them has none). */
export const fixturesOf = (w) => (Array.isArray(w.homes.fixtures) ? w.homes.fixtures : []).filter(f => !!f && typeof f.id === 'string' && !!f.id);
export const fixtureOf = (w, id) => fixturesOf(w).find(f => f.id === id);
/** A zone's worth a week, to compare homes (`home: better`, the best kinds, the screens): its rent, else a share of its
 *  price (`WORTH_WEEKS`, the old property rule's 30 weeks), else 0. With every zone rented, exactly the rent. */
export const WORTH_WEEKS = 30;
export function homeWorth(w, zoneId) {
    const z = zoneOf(w, zoneId);
    const rent = num(z?.rent);
    return rent > 0 ? rent : buyable(z) ? Math.round(zonePrice(z) / WORTH_WEEKS) : 0;
}
const NONE = Object.freeze({ owned: Object.freeze([]) });
/** Read what you own without writing anything into the save (asked on every effect query). */
export const peekHouses = (g) => g.houses ?? NONE;
/** What you own, for writing: created the first time. */
export function houses(g) {
    const h = (g.houses ??= { owned: [] });
    if (!Array.isArray(h.owned))
        h.owned = [];
    for (const o of h.owned)
        if (!Array.isArray(o.fix))
            o.fix = [];
    return h;
}
export const ownedHomes = (g) => peekHouses(g).owned ?? [];
export const ownedAt = (g, key) => ownedHomes(g).find(o => homeKey(o) === key);
/** Do you own the home you live in? */
export const ownedHere = (g) => !!g.player?.home && !!ownedAt(g, homeKey(g.player.home));
/** Your second home, when you have one (never the one you live in). */
export function secondHome(g) {
    const k = peekHouses(g).second;
    return k && k !== homeKey(g.player.home) ? ownedAt(g, k) : undefined;
}
/** Does a home of yours in this zone have this fixture (bought or come with it)? The rooms that are places read it. */
export const ownsFixtureIn = (g, zone, id) => ownedHomes(g).some(o => o.zone === zone && (o.fix.includes(id) || (o.got ?? []).includes(id)));
/** The place id of your second home (built by `placeOf` in sim/places.ts while you have one). */
export const SECOND_HOME_ID = 'home:second';
/** Every spot someone lives at or you own, as `zone:x,y` (a resident's extra flat counted at its address): what can't
 *  be rented or bought. */
export function takenSpots(g) {
    const k = (h) => `${h.zone}:${h.x},${h.y}`;
    return new Set([g.player.home, ...Object.values(g.cast).map(r => r.home), ...ownedHomes(g)].filter(Boolean).map(k));
}
/* ---------- hooks ---------- */
// (the rooms and fixtures of the homes you own join `thingsOwned` in sim/fixtures.ts)
