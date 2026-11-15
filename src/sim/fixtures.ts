// Rooms and fixtures of the homes you own (the `housing` system): a sauna, a grand piano, a rooftop terrace, bought once
// for one house and kept while it's yours. They're things of a shop item's shape: they join `thingsOwned` (so the
// shop's effects source with its limits and best-of, `needsItem` on actions, `owns:` and `itemDoes` read them), those
// of the home you live in always and those of your second home while you're there; nothing with the system off or the
// upkeep cut off. A fixture with a `room` opens a place of its own (sim/places.ts). The AI is told of the home you own
// and its fixtures while you're there (`homeLine`). Parties: a home's guest limit and catering.
import { adultOn, type Save } from '../core/store.js';
import type { WorldDef, HomeFixture } from '../core/world.js';
import { thingsOwned } from './hooks.js';
import {
    housingOn, zoneOf, sizeOf, fixturesOf, fixtureOf, ownedHomes, ownedAt, secondHome, houses, SECOND_HOME_ID, guestsOf,
    type Owned,
} from './housing.js';
import { priceOf, isCut, UPKEEP } from './bills.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { money } from './needs.js';
import { whenHolds } from './when.js';
import { homeKey } from './homes.js';
import { homeAddress, playerHomeId } from './places.js';

const isAdult = (f: HomeFixture) => !!f.adult;
const fixOk = (g: Save, f: HomeFixture) => !isAdult(f) || adultOn(g);
/** The fixtures a house has: bought for it, and those that came with it. */
export const fixturesIn = (o: Owned | undefined): string[] => (o ? [...new Set([...(o.got ?? []), ...o.fix])] : []);

/* ---------- what fits, buying ---------- */

/** Does this fixture fit that house (its size, kind and zone, what it needs first)? */
export function fits(w: WorldDef, o: Owned, f: HomeFixture): boolean {
    const z = zoneOf(w, o.zone);
    if (!z) return false;
    if (f.size && sizeOf(w, z) < f.size) return false;
    if (f.kinds?.length && !f.kinds.includes(z.kind)) return false;
    if (f.zones?.length && !f.zones.includes(z.id)) return false;
    if (f.needs && !fixturesIn(o).includes(f.needs)) return false;
    return true;
}
/** A fixture for a house of yours, for the Rooms tab: what it costs now, whether it's there, why it can't be bought. */
export interface FixtureOffer { f: HomeFixture; price: number; have: boolean; came: boolean; why: string }
export function fixturesFor(g: Save, w: WorldDef, key: string): FixtureOffer[] {
    const o = ownedAt(g, key);
    if (!o || !housingOn(w)) return [];
    const z = zoneOf(w, o.zone)!;
    return fixturesOf(w).filter(f => fixOk(g, f) && (!f.kinds?.length || f.kinds.includes(z.kind)) && (!f.zones?.length || f.zones.includes(z.id)))
        .filter(f => fixturesIn(o).includes(f.id) || !f.when || whenHolds(g, w, f.when, { key: `fixture|${f.id}` }))
        .map(f => {
            const have = fixturesIn(o).includes(f.id), came = (o.got ?? []).includes(f.id), price = priceOf(g, Math.max(0, f.price || 0));
            const why = have ? '' : f.size && sizeOf(w, z) < f.size ? 'Needs a bigger home.' : f.needs && !fixturesIn(o).includes(f.needs) ? `Needs ${fixtureOf(w, f.needs)?.name ?? f.needs} first.` : g.player.money < price ? `Not enough money (${money(w, price)}).` : '';
            return { f, price, have, came, why };
        }).sort((a, b) => a.price - b.price || a.f.name.localeCompare(b.f.name));
}
/** Buys a fixture for a house of yours. Returns why not, or ''. Bought once per house; not refunded when it's sold. */
export function buyFixture(g: Save, w: WorldDef, key: string, id: string): string {
    const offer = fixturesFor(g, w, key).find(x => x.f.id === id);
    if (!offer) return "That can't be added to this home.";
    if (offer.have) return 'This home has it already.';
    if (offer.why) return offer.why;
    const o = ownedAt(g, key)!;
    g.player.money -= offer.price;
    book(g, `${offer.f.name} for your home`, -offer.price);
    houses(g);   // (the save's arrays made sure)
    o.fix.push(id);
    note(g, '{u} added to their home: {0}.', [offer.f.name], [], g.player.loc, 'home');
    return '';
}

/* ---------- what counts now ---------- */

/** The houses whose fixtures count right now: the home you live in, and your second home while you're at it or in one
 *  of its rooms. */
export function housesHere(g: Save, w: WorldDef): Owned[] {
    const out: Owned[] = [];
    const live = ownedAt(g, homeKey(g.player.home));
    if (live) out.push(live);
    const s = secondHome(g);
    if (s && (g.player.loc === SECOND_HOME_ID || roomOf(w, g.player.loc)?.homeZone === s.zone)) out.push(s);
    return out;
}
// (a room place: `Place.room` and `Place.homeZone`)
const roomOf = (w: WorldDef, id: string) => w.places.find(p => p.id === id && p.room);
/** The fixtures that count now, in a shop item's shape: nothing with the system off or the upkeep cut off, adult ones
 *  only with adult content on. */
export function fixturesNow(g: Save, w: WorldDef): HomeFixture[] {
    if (!ownedHomes(g).length || !housingOn(w) || isCut(g, UPKEEP)) return [];
    const ids = new Set(housesHere(g, w).flatMap(fixturesIn));
    return fixturesOf(w).filter(f => ids.has(f.id) && fixOk(g, f));
}
thingsOwned.push(fixturesNow);
/** Is this id one of the world's fixtures (not a shop item)? */
export const isFixture = (w: WorldDef, id: string) => !!fixtureOf(w, id);

/* ---------- the AI ---------- */

/** How many fixtures the AI is told of at home. */
export const TOLD_FIXTURES = 5;
const phrase = (f: HomeFixture) => (f.ai?.trim() || f.name).replace(/[.!]$/, '');
/** For the AI, at a home you own or in one of its rooms: whose it is, what it is, its dearest fixtures (adult ones are
 *  the shop's line, under its rules). '' for a rented home, out and about, or with the system off. */
export function homeLine(g: Save, w: WorldDef): string {
    if (!housingOn(w) || !ownedHomes(g).length) return '';
    const loc = g.player.loc, room = roomOf(w, loc);
    const live = ownedAt(g, homeKey(g.player.home)), s = secondHome(g);
    const o = loc === playerHomeId ? live : loc === SECOND_HOME_ID ? s : room ? (live?.zone === room.homeZone ? live : s?.zone === room.homeZone ? s : undefined) : undefined;
    if (!o) return '';
    const z = zoneOf(w, o.zone), kind = z && w.homes.kinds[z.kind];
    const cut = isCut(g, UPKEEP);
    const fx = cut ? [] : fixturesOf(w).filter(f => fixturesIn(o).includes(f.id) && !isAdult(f)).sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, TOLD_FIXTURES);
    const parts = [`{{user}} owns this home${o === s ? ', a second home' : ''}, ${homeAddress(w, o)}${kind?.desc ? `: ${kind.desc}` : ''}.`];
    if (fx.length) parts.push(`It has ${list(fx.map(phrase))}.`);
    if (room) parts.push(`{{user}} is in ${room.name}, part of the home.`);
    if (cut) parts.push("The home's upkeep is unpaid: the staff have stopped coming.");
    return parts.join(' ');
}
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/* ---------- parties ---------- */

/** How many guests can come to a party at the home you live in (null: no limit, as before). */
export const partyGuests = (g: Save, w: WorldDef) => (housingOn(w) ? guestsOf(w, g.player.home.kind) : null);
/** Catering for a party at a big home (size 3 or more): what each guest costs, and how much more the party lifts the
 *  mood (a share, inside the `party` kind's bounds). */
export const CATERING = [
    { id: 'none', name: 'Food and drinks as usual', perGuest: 0, mood: 0 },
    { id: 'caterer', name: 'A caterer', perGuest: 15000, mood: 0.05 },
    { id: 'chef', name: 'A chef and staff', perGuest: 40000, mood: 0.1 },
] as const;
export type Catering = typeof CATERING[number]['id'];
/** The catering a party at the home you live in can have. */
export function cateringFor(g: Save, w: WorldDef) {
    const z = zoneOf(w, g.player.home.zone);
    return housingOn(w) && z && sizeOf(w, z) >= 3 ? CATERING : CATERING.slice(0, 1);
}
/** What the catering costs for so many guests now (after the difficulty). */
export const cateringPrice = (g: Save, id: Catering | undefined, guests: number) => priceOf(g, (CATERING.find(c => c.id === id)?.perGuest ?? 0) * Math.max(0, guests));
/** A party's mood multiplier from its catering (an appointment's `cater`). */
export const cateringMul = (id: unknown) => 1 + (CATERING.find(c => c.id === id)?.mood ?? 0);
/** A party of at least this many who came is a grand party (tally `grand_party`). */
export const GRAND_PARTY = 12;
