// Homes you own (the `housing` system, track 3 of end-game spending): buying a home outright, selling it back at a
// loss, its weekly upkeep, a second home, and the rooms and fixtures bought for a house (a sauna, a grand piano, a
// rooftop terrace), which work as the shop's things do (they join `thingsOwned`, so the shop's effects source, the AI
// line and `needsItem` read them). The world's housing fields are read here with their defaults, never written into
// the world; the save keeps what you own in `g.houses`, created by the first purchase. `property` (sim/holdings.ts,
// houses to rent out, loans) is another system and isn't used here.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type HomeZone, type HomeFixture } from '../core/world.js';
import { homeKey } from './homes.js';

/* ---------- what the world says (read with defaults) ---------- */

export const housingOn = (w: WorldDef | null | undefined) => !!w && systemOn(w, 'housing');
export const zoneOf = (w: WorldDef, id: string | undefined): HomeZone | undefined => w.homes.zones.find(z => z.id === id);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** What a home in this zone costs to buy, before the difficulty (0: not for sale). */
export const zonePrice = (z: HomeZone | undefined) => Math.max(0, Math.round(num(z?.price)));
/** Homes here can be bought. */
export const buyable = (z: HomeZone | undefined) => zonePrice(z) > 0;
/** Homes here can only be bought, never rented (no rent). Nobody is placed in one by chance. */
export const buyOnly = (z: HomeZone | undefined) => buyable(z) && !(num(z?.rent) > 0);
/** The share of what you paid that selling gives back, held to 0.5–0.9. */
export const RESALE = { min: 0.5, max: 0.9, usual: 0.7 };
export const resaleOf = (z: HomeZone | undefined) => (num(z?.resale) > 0 ? Math.min(RESALE.max, Math.max(RESALE.min, num(z!.resale))) : RESALE.usual);
/** What a home here you own costs a week, before the difficulty. */
export const upkeepOf = (z: HomeZone | undefined) => Math.max(0, Math.round(num(z?.upkeep)));
/** How big a home here is, 1–5: the zone's, else its kind's, else 1. */
export const SIZES = { min: 1, max: 5 };
export function sizeOf(w: WorldDef, z: HomeZone | undefined): number {
    const v = num(z?.size) || num(z && w.homes.kinds[z.kind]?.size) || 1;
    return Math.min(SIZES.max, Math.max(SIZES.min, Math.round(v)));
}
/** How many guests can come to a party in a home of this kind (null: no limit, as before). */
export const guestsOf = (w: WorldDef, kind: string | undefined): number | null => { const n = Math.round(num(kind ? w.homes.kinds[kind]?.guests : 0)); return n > 0 ? n : null; };
/** Fixtures a home of this kind comes with. */
export const comesWith = (w: WorldDef, kind: string | undefined): string[] => (kind ? (w.homes.kinds[kind]?.fixtures ?? []).filter(id => typeof id === 'string') : []);
/** A home here can be a second home: as the zone says, else any home you can buy. */
export const canBeSecond = (z: HomeZone | undefined) => (z?.second ?? buyable(z)) === true;
/** (letting) The defaults and bounds of a zone's `letting`: a tenant about three weeks in four, the agent's fifth
 *  (sim/holdings.ts's numbers); at most three homes to let at once (RQ-6). */
export const LETTING = { chance: 0.75, fee: 0.2, chanceMin: 0.1, chanceMax: 1, feeMax: 0.5 };
export const MAX_LET = 3;
/** The rent a tenant pays a week for a home here, before the difficulty (0: it can't be let). */
export const letRent = (z: HomeZone | undefined) => (z?.letting && typeof z.letting === 'object' ? Math.max(0, Math.round(num(z.letting.rent) || num(z.rent))) : 0);
/** Homes here you own can be let: the zone is for sale, says so, and has a rent to charge. */
export const lettable = (z: HomeZone | undefined) => buyable(z) && letRent(z) > 0;
/** How likely a week is to have a tenant, held to 0.1–1. */
export const letChance = (z: HomeZone | undefined) => { const v = num(z?.letting?.chance); return v > 0 ? Math.min(LETTING.chanceMax, Math.max(LETTING.chanceMin, v)) : LETTING.chance; };
/** The agent's share of the rent, held to 0–0.5. */
export const letFee = (z: HomeZone | undefined) => { const v = z?.letting?.fee; return typeof v === 'number' && Number.isFinite(v) ? Math.min(LETTING.feeMax, Math.max(0, v)) : LETTING.fee; };
/** The world's rooms and fixtures (a world without them has none). */
export const fixturesOf = (w: WorldDef): HomeFixture[] => (Array.isArray(w.homes.fixtures) ? w.homes.fixtures : []).filter(f => !!f && typeof f.id === 'string' && !!f.id);
export const fixtureOf = (w: WorldDef, id: string) => fixturesOf(w).find(f => f.id === id);
/** A zone's worth a week, to compare homes (`home: better`, the best kinds, the screens): its rent, else a share of its
 *  price (`WORTH_WEEKS`, the old property rule's 30 weeks), else 0. With every zone rented, exactly the rent. */
export const WORTH_WEEKS = 30;
export function homeWorth(w: WorldDef, zoneId: string | undefined): number {
    const z = zoneOf(w, zoneId);
    const rent = num(z?.rent);
    return rent > 0 ? rent : buyable(z) ? Math.round(zonePrice(z) / WORTH_WEEKS) : 0;
}

/* ---------- the save (`g.houses`) ---------- */

/** A home you own: its spot, what you paid (after the difficulty), the day you bought it, the fixtures bought for it
 *  (`fix`) and those that came with it (`got`). */
export interface Owned { zone: string; x: number; y: number; n: number; unit?: number; paid: number; day: number; fix: string[]; got?: string[]; let?: Letting }
/** (letting) A home of yours to let: `since` the first day a tenant can be in (the Monday after it was put up); `until`
 *  the Monday the tenant leaves after notice; `off` the day it became empty (still yours to let); `weeks` weeks it had
 *  a tenant; `got` the rent you had from it (after the agent); `last` the last week's report (its week number). */
export interface Letting { since: number; until?: number; off?: number; weeks?: number; got?: number; last?: { n: number; tenant: boolean; rent: number; fee: number } }
/** What you own: the home you live in and a second home (`second`, its home key), and up to three to let; `sold`:
 *  homes sold; `told`: notes already given; `rent`: rent had from tenants in all (after the agent's share). */
/** (track 7) `sure`: the last week a good tenant from the rewards shop covers (every home you let has a tenant). */
export interface Houses { owned: Owned[]; second?: string; sold?: number; told?: string[]; rent?: number; sure?: number }
const NONE: Readonly<Houses> = Object.freeze({ owned: Object.freeze([]) as unknown as Owned[] });
/** Read what you own without writing anything into the save (asked on every effect query). */
export const peekHouses = (g: Save): Readonly<Houses> => ((g as any).houses as Houses | undefined) ?? NONE;
/** What you own, for writing: created the first time. */
export function houses(g: Save): Houses {
    const h = ((g as any).houses ??= { owned: [] }) as Houses;
    if (!Array.isArray(h.owned)) h.owned = [];
    for (const o of h.owned) if (!Array.isArray(o.fix)) o.fix = [];
    return h;
}
export const ownedHomes = (g: Save): readonly Owned[] => peekHouses(g).owned ?? [];
export const ownedAt = (g: Save, key: string) => ownedHomes(g).find(o => homeKey(o) === key);
/** (letting) Your homes to let (let, under notice, or empty), and the others: the one you live in and the second. */
export const toLet = (g: Save): readonly Owned[] => ownedHomes(g).filter(o => !!o.let);
export const keptHomes = (g: Save): readonly Owned[] => ownedHomes(g).filter(o => !o.let);
/** A home of yours with a tenant's agreement now: let, or under notice (not empty). */
export const isLet = (o: Owned | undefined) => !!o?.let && o.let.off === undefined;
/** Rent had from tenants in all (the `rent:` key). */
export const rentHad = (g: Save) => num(peekHouses(g).rent);
/** Do you own the home you live in? */
export const ownedHere = (g: Save) => !!g.player?.home && !!ownedAt(g, homeKey(g.player.home));
/** Your second home, when you have one (never the one you live in). */
export function secondHome(g: Save): Owned | undefined {
    const k = peekHouses(g).second;
    return k && k !== homeKey(g.player.home) ? ownedAt(g, k) : undefined;
}
/** Does a home of yours in this zone have this fixture (bought or come with it)? The rooms that are places read it. */
export const ownsFixtureIn = (g: Save, zone: string, id: string) => ownedHomes(g).some(o => o.zone === zone && (o.fix.includes(id) || (o.got ?? []).includes(id)));

/** The place id of your second home (built by `placeOf` in sim/places.ts while you have one). */
export const SECOND_HOME_ID = 'home:second';
/** Every spot someone lives at or you own, as `zone:x,y` (a resident's extra flat counted at its address): what can't
 *  be rented or bought. */
export function takenSpots(g: Save): Set<string> {
    const k = (h: { zone: string; x: number; y: number }) => `${h.zone}:${h.x},${h.y}`;
    return new Set([g.player.home, ...Object.values(g.cast).map(r => r.home), ...ownedHomes(g)].filter(Boolean).map(k));
}

/* ---------- hooks ---------- */

// (the rooms and fixtures of the homes you own join `thingsOwned` in sim/fixtures.ts)
