// A photo studio of your own (photography with housing): one at a time, rented by the week or bought, kept in its own
// slot (`g.houses.studio`) and its own zone list (`w.homes.studios`), outside `houses.owned` and `homes.zones`, so no
// rule or list of homes (settling homes, the two-home and let limits, homes for sale, where people live, moving) ever
// sees it. Its place is `home:studio` (private, on the map, never a home: home actions don't run there); its rent is a
// weekly bill of its own (`studio`, sim/bills.ts) and a bought one's upkeep joins the homes' (`house`); either cut off,
// its fixtures stop and it doesn't count as a studio until paid. Fixtures are bought for it as for a home
// (sim/fixtures.ts). An ending can give one (`ThreadEnding.studio`). The hourly rental at someone else's studio is
// `g.photo.rental` (the photography system's): an action at the world's `photo.rental` place, or its fallback once its
// condition no longer holds (a falling-out, the owner gone).
import { nowAbs, adultOn, type Save } from '../core/store.js';
import { systemOn, type WorldDef, type StudioZone, type HomeFixture, type Place, type ActionDef } from '../core/world.js';
import { onAction, engineActions, sceneLines } from './hooks.js';
import { housingOn, zonePrice, buyable, resaleOf, upkeepOf, comesWith, fixtureOf, houses, type Owned } from './housing.js';
import { priceOf, startBill, owed, owedAmount, bills, isCut, UPKEEP, STUDIO_RENT } from './bills.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { money } from './needs.js';
import { whenHolds } from './when.js';
import { photoOn, photoOf, peekPhoto } from './photo.js';
import { pictureAt } from './daynight.js';
import { hm } from './time.js';
import { playerHomeId } from './places.js';

/** The place of your own photo studio. */
export const STUDIO_ID = 'home:studio';
/** Your photo studio: its zone, rented or bought, since when, what you paid, its fixtures; `free`: given by an ending. */
export interface StudioState { zone: string; way: 'rent' | 'buy'; day: number; paid: number; fix: string[]; free?: true }

/** Your photo studio, if you have one. */
export const studioOf = (g: Save): StudioState | null => (((g as any).houses?.studio as StudioState | undefined) ?? null);
/** The photo studios a world has (with `housing` on). */
export const studioZones = (w: WorldDef): StudioZone[] => (systemOn(w, 'housing') ? w.homes?.studios ?? [] : []);
/** A photo studio's zone by id, whatever the systems say. */
export const studioZoneOf = (w: WorldDef, id: string | undefined): StudioZone | undefined => (id ? (w.homes?.studios ?? []).find(z => z.id === id) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** A studio's rent a week, before the difficulty (0: it can't be rented). */
export const studioRent = (z: StudioZone | undefined) => Math.max(0, Math.round(num(z?.rent)));
/** Studios offered to rent or buy: the world's (housing on), never one only an ending gives. */
export const studiosOffered = (w: WorldDef): StudioZone[] => studioZones(w).filter(z => !z.given && (studioRent(z) > 0 || buyable(z)));
/** Where a studio is on its map: its one spot. */
export const studioSpot = (z: StudioZone): [number, number] => (Array.isArray(z.spots?.[0]) ? z.spots[0] : [50, 50]);

/** Your studio with its zone, while housing is on and the world still has it. */
export function myStudio(g: Save, w: WorldDef): { st: StudioState; z: StudioZone } | null {
    const st = studioOf(g);
    const z = st && housingOn(w) ? studioZoneOf(w, st.zone) : undefined;
    return st && z ? { st, z } : null;
}
/** Is your studio's bill cut off (the rent of a rented one, the homes' upkeep for one you own)? Then its fixtures stop and
 *  it isn't a studio to work in until it's paid. */
export function studioCut(g: Save): boolean {
    const st = studioOf(g);
    return !!st && isCut(g, st.way === 'rent' ? STUDIO_RENT : UPKEEP);
}
/** What your studio pays a week before the difficulty: its rent (rented) or its upkeep (bought or given). */
export const studioWeek = (w: WorldDef, st: StudioState) => (st.way === 'rent' ? studioRent(studioZoneOf(w, st.zone)) : upkeepOf(studioZoneOf(w, st.zone)));
/** The fixtures a studio comes with: its kind's and its zone's. */
export const studioCame = (w: WorldDef, z: StudioZone): string[] => [...new Set([...comesWith(w, z.kind), ...(z.fixtures ?? [])])].filter(id => !!fixtureOf(w, id));
/** Every fixture your studio has: those it came with and those you bought for it. */
export function studioFixtureIds(g: Save, w: WorldDef): string[] {
    const m = myStudio(g, w);
    return m ? [...new Set([...studioCame(w, m.z), ...m.st.fix])].filter(id => !!fixtureOf(w, id)) : [];
}
/** Your studio's fixtures that work now (not cut off; adult ones only with adult content on), wherever you are. */
export function studioFixtures(g: Save, w: WorldDef): HomeFixture[] {
    if (studioCut(g)) return [];
    return studioFixtureIds(g, w).map(id => fixtureOf(w, id)!).filter(f => !f.adult || adultOn(g));
}
/** Does your studio have a working fixture with this photo gear (`cyc`, `dressing`, `rig`, `desk`, `darkroom`)? */
export const studioHas = (g: Save, w: WorldDef, gear: string) => studioFixtures(g, w).some(f => f.photo?.gear === gear);
/** Your studio in the shape of a home you own, for the fixtures' rules (sim/fixtures.ts): its spot, what it came with. */
export function studioAsOwned(g: Save, w: WorldDef): Owned | null {
    const m = myStudio(g, w);
    if (!m) return null;
    const [x, y] = studioSpot(m.z);
    return { zone: m.z.id, x, y, n: 1, paid: m.st.paid, day: m.st.day, fix: m.st.fix, got: studioCame(w, m.z) };
}

/* ---------- being in a studio ---------- */

/** What the hourly rental has besides the room: a cyclorama wall, no boudoir set or anything else of a studio's own. */
export const RENTAL_HAS = ['cyc'];
/** Are you in a photo studio now: your own (its bill paid), or one you rented by the hour (at its place, within its
 *  hours)? With `need` (a fixture's photo gear: `cyc`, `dressing`…), only where there's one: your own studio's fixtures,
 *  or the rental's cyclorama. */
export function inStudio(g: Save, w: WorldDef, need?: string): boolean {
    const loc = g.player.loc;
    if (loc === STUDIO_ID) return !!myStudio(g, w) && !studioCut(g) && (!need || studioHas(g, w, need));
    return !!rentalNow(g, w) && (!need || RENTAL_HAS.includes(need));
}

/* ---------- renting, buying, giving up ---------- */

/** What giving up your studio would bring now (a sale less the upkeep owed; for a rented one, minus the rent owed). */
function releaseValue(g: Save, w: WorldDef): number {
    const st = studioOf(g);
    if (!st) return 0;
    if (st.way === 'rent') return -(owed(g, STUDIO_RENT) ? owedAmount(g, w, STUDIO_RENT) : 0);
    return studioSale(w, st) - (owed(g, UPKEEP) ? owedAmount(g, w, UPKEEP) : 0);
}
/** What your studio sells for: a share of what you paid (nothing for one that was given). */
export const studioSale = (w: WorldDef, st: StudioState) => (st.way === 'buy' ? Math.round(st.paid * resaleOf(studioZoneOf(w, st.zone))) : 0);
/** A studio on offer, for the Homes app: its rent and price now (after the difficulty), its upkeep, and why each way
 *  can't be taken now ('' when it can; `rent`/`buy` null when the studio isn't offered that way). */
export interface StudioOffer { z: StudioZone; rent: number; price: number; upkeep: number; whyRent: string | null; whyBuy: string | null }
export function studioOffers(g: Save, w: WorldDef): StudioOffer[] {
    const mine = studioOf(g)?.zone, have = g.player.money + releaseValue(g, w);
    return studiosOffered(w).filter(z => z.id !== mine).map(z => {
        const rent = priceOf(g, studioRent(z)), price = priceOf(g, zonePrice(z)), upkeep = priceOf(g, upkeepOf(z));
        const why = (cost: number) => (have < cost ? `Not enough money (${money(w, cost)}).` : '');
        return { z, rent, price, upkeep, whyRent: rent > 0 ? why(rent) : null, whyBuy: buyable(z) ? why(price) : null };
    }).sort((a, b) => (a.rent || a.price) - (b.rent || b.price) || a.z.name.localeCompare(b.z.name));
}
/** Why you can't give up your studio now ('' when you can): a rented one's rent owed is paid first, from what you have. */
export function giveUpBlock(g: Save, w: WorldDef): string {
    const st = studioOf(g);
    if (!st) return "You don't have a photo studio.";
    return g.player.money + releaseValue(g, w) < 0 ? `Pay what's owed on the studio's rent first (${money(w, -releaseValue(g, w))}).` : '';
}
/** Rents a studio by the week (the first week paid now, the bill from a week on). A studio you have is given up first.
 *  Returns why not, or ''. */
export function rentStudio(g: Save, w: WorldDef, zone: string): string {
    const o = studioOffers(g, w).find(x => x.z.id === zone);
    if (studioOf(g)?.zone === zone) return 'This studio is yours already.';
    if (!o || o.whyRent === null) return "That studio can't be rented.";
    if (o.whyRent) return o.whyRent;
    release(g, w);
    g.player.money -= o.rent;
    book(g, `${o.z.name}: the first week's rent`, -o.rent);
    take(g, { zone, way: 'rent', day: g.day, paid: 0, fix: [] });
    bills(g)[STUDIO_RENT] = { due: g.day + 7 };
    note(g, '{u} rented a photo studio: {0}.', [o.z.name], [], g.player.loc, 'work');
    return '';
}
/** Buys a studio outright (a weekly upkeep from then on, on the homes' upkeep bill). A studio you have is given up first
 *  (sold, or its rent ended). Returns why not, or ''. */
export function buyStudio(g: Save, w: WorldDef, zone: string): string {
    const o = studioOffers(g, w).find(x => x.z.id === zone);
    if (studioOf(g)?.zone === zone && studioOf(g)?.way === 'buy') return 'This studio is yours already.';
    if (studioOf(g)?.zone === zone) {
        // the studio you rent, bought: no move, the rent ends
        const z = studioZoneOf(w, zone), price = priceOf(g, zonePrice(z));
        if (!z || !buyable(z) || z.given || !housingOn(w)) return "That studio isn't for sale.";
        if (g.player.money + releaseValue(g, w) < price) return `Not enough money (${money(w, price)}).`;
        const fix = studioOf(g)!.fix;
        release(g, w, false, true);
        g.player.money -= price;
        book(g, `${z.name}: bought`, -price);
        take(g, { zone, way: 'buy', day: g.day, paid: price, fix });
        startBill(g, UPKEEP);
        note(g, '{u} bought the photo studio they rented: {0}.', [z.name], [], g.player.loc, 'work');
        return '';
    }
    if (!o || o.whyBuy === null) return "That studio isn't for sale.";
    if (o.whyBuy) return o.whyBuy;
    release(g, w);
    g.player.money -= o.price;
    book(g, `${o.z.name}: bought`, -o.price);
    take(g, { zone, way: 'buy', day: g.day, paid: o.price, fix: [] });
    startBill(g, UPKEEP);
    note(g, '{u} bought a photo studio: {0}.', [o.z.name], [], g.player.loc, 'work');
    return '';
}
/** Gives up your studio: bought, it's sold at its resale share (its fixtures with it, as a home's; the upkeep owed paid
 *  from the sale); rented, the rent ends at once (what's owed paid first). Returns why not, or ''. */
export function giveUpStudio(g: Save, w: WorldDef): string {
    const why = giveUpBlock(g, w);
    if (why) return why;
    release(g, w);
    return '';
}
const take = (g: Save, st: StudioState) => { (houses(g) as any).studio = st; };
// Lets the studio go: its money (a sale, the rent or upkeep owed), its bill, you out of it. `forced`: an ending gives
// another, so a rent owed is paid as far as the money goes. `keepFix`: the rented studio is being bought (its fixtures
// stay). Returns the line saying what happened ('' with no studio).
function release(g: Save, w: WorldDef, forced = false, keepFix = false): string {
    const st = studioOf(g);
    if (!st) return '';
    const z = studioZoneOf(w, st.zone), name = z?.name ?? st.zone;
    let said: string;
    if (st.way === 'rent') {
        const due = owed(g, STUDIO_RENT) ? Math.min(owedAmount(g, w, STUDIO_RENT), forced ? Math.max(0, g.player.money) : Infinity) : 0;
        if (due) { g.player.money -= due; book(g, `${name}: rent owed`, -due); }
        delete bills(g)[STUDIO_RENT];
        said = `${name}: its rent has ended.`;
        if (!keepFix) note(g, '{u} gave up a photo studio: {0}.', [name], [], g.player.loc, 'work');
    } else {
        const got = studioSale(w, st), due = owed(g, UPKEEP) ? owedAmount(g, w, UPKEEP) : 0;
        if (got) { g.player.money += got; book(g, `${name}: sold`, got); }
        if (due) {
            g.player.money -= due;
            book(g, 'Upkeep owed, paid from the sale', -due);
            const b = bills(g)[UPKEEP];
            if (b) { while (owed(g, UPKEEP)) b.due += 7; delete b.paid; }
        }
        said = st.free ? `${name}: given up, it's gone for good.` : `${name}: sold for ${money(w, got)}.`;
        note(g, st.free ? '{u} gave up a photo studio: {0}.' : '{u} sold a photo studio: {0}.', [name], [], g.player.loc, 'work');
    }
    delete (houses(g) as any).studio;
    if (g.player.loc === STUDIO_ID) g.player.loc = playerHomeId;   // (given up while you're there: you go home)
    return said;
}
/** (storylines) An ending gives you this studio for free (`ThreadEnding.studio`): one you had is given up first, with a
 *  message; its upkeep is yours from then on. Nothing with housing off, a zone the world doesn't have, or that studio
 *  yours already. Returns the lines to show. */
export function giveStudio(g: Save, w: WorldDef, zone: string): string[] {
    const z = studioZoneOf(w, zone);
    if (!housingOn(w) || !z || studioOf(g)?.zone === zone) return [];
    const out: string[] = [];
    const was = release(g, w, true);
    if (was) out.push(`You gave up your photo studio, ${was}`);
    take(g, { zone, way: 'buy', day: g.day, paid: 0, fix: [], free: true });
    startBill(g, UPKEEP);
    note(g, '{u} was given a photo studio: {0}.', [z.name], [], g.player.loc, 'work');
    out.push(`${z.name} is your photo studio now (see the Homes app).`);
    return out;
}

/* ---------- an old save, once the world is known ---------- */

/** On every load, once the world is known: a studio the world no longer has is paid back at what you paid, one rented
 *  that can't be rented any more ends, fixtures the world no longer has are dropped. Returns what to tell the player. */
export function settleStudio(g: Save, w: WorldDef): string {
    const st = studioOf(g);
    if (!st) return '';
    if (!Array.isArray(st.fix)) st.fix = [];
    const z = studioZoneOf(w, st.zone);
    if (!z) {
        if (st.paid > 0) { g.player.money += st.paid; book(g, 'A photo studio the world no longer has, paid back', st.paid); }
        if (st.way === 'rent') delete bills(g)[STUDIO_RENT];
        delete (houses(g) as any).studio;
        if (g.player.loc === STUDIO_ID) g.player.loc = playerHomeId;
        return `A photo studio you had is gone from this world${st.paid > 0 ? ': what you paid for it was paid back' : ''}.`;
    }
    if (st.way === 'rent' && !(studioRent(z) > 0)) {
        delete bills(g)[STUDIO_RENT];
        delete (houses(g) as any).studio;
        if (g.player.loc === STUDIO_ID) g.player.loc = playerHomeId;
        return `${z.name} can't be rented any more: its rent has ended.`;
    }
    const gone = st.fix.filter(id => !fixtureOf(w, id));
    if (!gone.length) return '';
    st.fix = st.fix.filter(id => fixtureOf(w, id));
    return `${gone.length === 1 ? 'A fixture' : `${gone.length} fixtures`} of your photo studio ${gone.length === 1 ? 'is' : 'are'} gone from this world.`;
}

/* ---------- its place ---------- */

/** Your studio as a place: on its zone's map at its spot, its own pictures (the kind's otherwise), private, for work. */
export function studioPlace(g: Save, w: WorldDef): (Place & { home?: boolean }) | null {
    const m = myStudio(g, w);
    if (!m) return null;
    const [x, y] = studioSpot(m.z), kind = w.homes.kinds[m.z.kind];
    const bg = m.z.image ? pictureAt(w, g.minutes, m.z.image, m.z.images) : pictureAt(w, g.minutes, kind?.image, kind?.images);
    const map = w.maps.some(x => x.id === m.z.map) ? m.z.map : w.maps[0]?.id ?? '';
    return { id: STUDIO_ID, name: 'My photo studio', map, x, y, tags: ['work', 'private'], desc: `${m.z.name}: ${m.z.desc ?? kind?.desc ?? 'a photo studio'}`, home: true, ...(bg ? { bg } : {}) };
}
/** The map your studio is on (asked often: no picture worked out). */
export const studioMap = (g: Save, w: WorldDef) => myStudio(g, w)?.z.map;

/* ---------- the hourly rental (photography) ---------- */

/** The engine's action that rents the studio here by the hour, and the block it rents. */
export const RENTAL_ID = 'x-studio-rent', RENTAL_HOURS = 2, RENTAL_MINUTES = 5;
/** The hourly studio open to you: the world's (while its condition holds), else its fallback; null with photography off
 *  or a world without one. */
export function rentalOpen(g: Save, w: WorldDef): { at: string; price: number } | null {
    const r = photoOn(w) ? w.photo!.rental : undefined;
    if (!r) return null;
    if (!r.when || whenHolds(g, w, r.when, { key: 'photo-rental' })) return { at: r.at, price: r.price };
    return r.fallback ?? null;
}
/** The hours you rented, while you're there within them. */
export function rentalNow(g: Save, w: WorldDef): { until: number; at: string } | null {
    const r = photoOn(w) ? peekPhoto(g).rental : undefined;
    return r && r.at === g.player.loc && nowAbs(g) < r.until ? r : null;
}
// Where the block you'd rent now ends: two hours from when the booking is done, after what's left of hours you have.
const rentalEnd = (g: Save, w: WorldDef) => Math.max(nowAbs(g) + RENTAL_MINUTES, rentalNow(g, w)?.until ?? 0) + RENTAL_HOURS * 60;
engineActions.push((g, w) => {
    const r = rentalOpen(g, w);
    if (!r || g.player.loc !== r.at) return [];
    const more = !!rentalNow(g, w);
    return [{ id: RENTAL_ID, name: 'Studio rental', label: more ? `Rent the studio ${RENTAL_HOURS} more hours` : `Rent the studio (${RENTAL_HOURS} h)`, icon: '📷',
        cost: r.price * RENTAL_HOURS, minutes: RENTAL_MINUTES, effects: {}, outcomes: [{ weight: 1, text: `The studio is yours until ${hm(rentalEnd(g, w) % 1440)}.` }] } as ActionDef];
});
onAction.push((g, w, a) => {
    if (a.id !== RENTAL_ID) return;
    const r = rentalOpen(g, w);
    if (r && r.at === g.player.loc) photoOf(g).rental = { until: rentalEnd(g, w), at: r.at };
});
sceneLines.push((g, w) => {
    const r = rentalNow(g, w);
    return r ? [`{{user}} has rented the studio here by the hour, until ${hm(r.until % 1440)}: it's theirs to shoot in.`] : [];
});
