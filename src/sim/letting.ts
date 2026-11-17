// Letting a home you own (R-a of end-game revenue, part of the `housing` system): a home you own and don't live in can
// be put up to let, or bought to let (at most three at once). An agent finds a tenant most weeks (a zone's `letting`
// chance, about three in four) and pays you each Monday the week's rent less a share (a fifth); the home's upkeep
// stays on the Home upkeep bill with every home you own. To have a home back you give a week's notice while a tenant is
// in (an empty week gives it back at once); an empty home to let can be let again, lived in, made your second home or
// sold. The fields live in sim/housing.ts (so conditions read them); buying and leaving a home are sim/owning.ts's.
import type { Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { onDay, studentLink } from './hooks.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { money } from './needs.js';
import { payOf, priceOf } from './bills.js';
import { effectMul } from './effects.js';
import { homeAddress, playerHomeId } from './places.js';
import { homeKey } from './homes.js';
import {
    housingOn, zoneOf, ownedAt, ownedHere, secondHome, houses, toLet, canBeSecond, letRent, letChance, letFee, upkeepOf,
    SECOND_HOME_ID, type Owned,
} from './housing.js';
import { letBlock, nextMonday, putUp, canLeave, leaveOwned, moveIn, type Leave } from './owning.js';

/** Who makes a week sure to have a tenant (track 7's "A good tenant" reward pushes here): none now. */
export const tenantSure: ((g: Save, w: WorldDef, o: Owned) => boolean)[] = [];

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
/** The week a day is in (week 0 is days 1–7; day 1 is a Monday). */
export const weekNo = (day: number) => Math.floor((Math.max(1, day) - 1) / 7);
const firstDay = (n: number) => n * 7 + 1;
const isMonday = (day: number) => (day - 1) % 7 === 0;

/** Does this home of yours have a tenant in week `n`? Up to let since that week began, not yet left after notice, and
 *  the agent's luck that week (fixed by the save, the home and the week, so the app can tell you on Monday). */
export function tenantIn(g: Save, w: WorldDef, o: Owned, n: number): boolean {
    const l = o.let;
    if (!l || l.off !== undefined || l.since > firstDay(n) || (l.until !== undefined && l.until <= firstDay(n))) return false;
    if (l.until !== undefined) return true;   // (a tenant serving notice is there to the end)
    if (tenantSure.some(f => f(g, w, o))) return true;
    return H(`${g.world}|${(g as any).seed ?? ''}|let|${homeKey(o)}|${n}`) < letChance(zoneOf(w, o.zone));
}

/** Where a home of yours to let stands now: `soon` (a tenant from Monday), `tenant` (one this week), `vacant` (let, but
 *  empty this week: the agent is showing it), `notice` (the tenant leaves on `until`), `empty` (yours, no tenant). */
export type LetState = 'soon' | 'tenant' | 'vacant' | 'notice' | 'empty';
export function letState(g: Save, w: WorldDef, o: Owned): LetState {
    const l = o.let!;
    if (l.off !== undefined) return 'empty';
    if (l.until !== undefined) return 'notice';
    if (l.since > g.day) return 'soon';
    return tenantIn(g, w, o, weekNo(g.day)) ? 'tenant' : 'vacant';
}

/** What a week of letting this home brings (after the difficulty and the effects): the rent, the agent's share, yours. */
export function letWeek(g: Save, w: WorldDef, o: Owned): { rent: number; fee: number; net: number } {
    const z = zoneOf(w, o.zone);
    const rent = Math.round(payOf(g, letRent(z)) * effectMul(g, w, 'letting', o.zone));
    const fee = Math.round(rent * letFee(z));
    return { rent, fee, net: rent - fee };
}

/** What a home here let brings a week on average (the tenant's weeks less the agent's share, less the upkeep paid
 *  every week), and its parts, for the screens. */
export function letAverage(g: Save, w: WorldDef, zone: string): { rent: number; fee: number; chance: number; upkeep: number; avg: number } {
    const z = zoneOf(w, zone), { rent, fee, net } = letWeek(g, w, { zone } as Owned);
    const chance = letChance(z), upkeep = priceOf(g, upkeepOf(z));
    return { rent, fee, chance, upkeep, avg: Math.round(chance * net - upkeep) };
}

/** Why this home of yours can't be put up to let now ('' when it can). */
export function canLet(g: Save, w: WorldDef, key: string): string {
    const o = ownedAt(g, key);
    if (!o) return "That home isn't yours.";
    if (!housingOn(w)) return "Homes can't be let here.";
    if (key === homeKey(g.player.home)) return 'You live here: move out first, and let it then.';
    if (o.let && o.let.off === undefined) return "It's let already.";
    if (secondHome(g) === o && g.player.loc === SECOND_HOME_ID) return "You're there now: go home first.";
    return letBlock(g, w, o.zone, !!o.let);
}
/** Puts a home of yours up to let (your second home stops being one). Returns why not, or ''. */
export function letHome(g: Save, w: WorldDef, key: string): string {
    const why = canLet(g, w, key);
    if (why) return why;
    putUp(g, w, ownedAt(g, key)!);
    return '';
}

/** The day the tenant would leave if you gave notice today: the first Monday at least a week away. */
export const noticeEnds = (day: number) => nextMonday(day + 6);
/** Asks for a home you let back: with a tenant in this week, a week's notice (they leave on `noticeEnds`); empty this
 *  week or not yet let, it's yours at once. Returns why not, or ''. */
export function takeBack(g: Save, w: WorldDef, key: string): string {
    const o = ownedAt(g, key);
    if (!o?.let || o.let.off !== undefined) return "That home isn't let.";
    if (o.let.until !== undefined) return 'Notice is already given.';
    if (housingOn(w) && letState(g, w, o) === 'tenant') {
        o.let.until = noticeEnds(g.day);
        note(g, '{u} gave a tenant notice: {0}.', [homeAddress(w, o)], [], g.player.loc, 'home');
    } else o.let.off = g.day;
    return '';
}
/** Withdraws a notice given: the tenant stays. */
export function keepLet(g: Save, key: string): string {
    const o = ownedAt(g, key);
    if (o?.let?.until === undefined) return 'No notice was given.';
    delete o.let.until;
    return '';
}

/** Makes an empty home to let your second home. Returns why not, or ''. */
export function makeSecond(g: Save, w: WorldDef, key: string): string {
    const o = ownedAt(g, key);
    if (!o?.let) return "That home isn't one you let.";
    if (o.let.off === undefined) return 'It has a tenant: take it back first.';
    if (secondHome(g)) return 'You already have a second home.';
    if (!canBeSecond(zoneOf(w, o.zone))) return "This home can't be a second home.";
    delete o.let;
    houses(g).second = key;
    return '';
}

/** Moves you into an empty home to let of yours; the home you live in now is left as moving always leaves it (rented:
 *  simply left; owned: `leave` says sold, kept as the second, or let). No deposit: it's yours. Returns why not, or ''. */
export function moveIntoOwned(g: Save, w: WorldDef, key: string, leave?: Leave): string {
    const o = ownedAt(g, key);
    if (!o?.let) return "That home isn't one you let.";
    if (o.let.off === undefined) return 'It has a tenant: take it back first.';
    const student = studentLink.homeBlock(g, w, o.zone);
    if (student) return student;
    // (it stops being one to let first, so the home you leave can take its place among the three)
    const was = o.let;
    delete o.let;
    const why = canLeave(g, w, leave, 0);
    if (why) { o.let = was; return why; }
    if (ownedHere(g) && !leave) { o.let = was; return 'You own this home: sell it, keep it as your second home or let it first.'; }
    leaveOwned(g, w, leave);
    moveIn(g, w, { zone: o.zone, x: o.x, y: o.y, n: o.n, ...(o.unit ? { unit: o.unit } : {}) });
    if (g.player.loc === SECOND_HOME_ID) g.player.loc = playerHomeId;
    note(g, '{u} moved into a home of their own: {0}.', [homeAddress(w, o)], [], g.player.loc, 'home');
    return '';
}

/* ---------- the week ---------- */

// Each Monday, the week just ended: each home let pays its rent less the agent's share; a notice whose day has come
// leaves the home empty. One line in the day's messages and one in the ledger.
onDay.push((g, w) => {
    if (!housingOn(w) || !isMonday(g.day)) return [];
    const list = toLet(g);
    if (!list.length) return [];
    const n = weekNo(g.day) - 1, out: string[] = [];
    let had = 0, let_ = 0, total = 0, fees = 0;
    for (const o of list) {
        const l = o.let!;
        if (l.off !== undefined || l.since > firstDay(n) || l.last?.n === n) continue;
        let_++;
        const tenant = tenantIn(g, w, o, n);
        const week = tenant ? letWeek(g, w, o) : { rent: 0, fee: 0, net: 0 };
        l.last = { n, tenant, rent: week.rent, fee: week.fee };
        if (tenant) {
            had++; total += week.net; fees += week.fee;
            l.weeks = (l.weeks ?? 0) + 1;
            l.got = (l.got ?? 0) + week.net;
        }
    }
    for (const o of list) {
        const l = o.let!;
        if (l.until !== undefined && l.until <= g.day) {
            delete l.until; l.off = g.day;
            out.push(`The tenant at ${homeAddress(w, o)} has left: it's yours to move into, let again or sell.`);
        }
    }
    if (total) {
        g.player.money += total;
        houses(g).rent = Math.round((houses(g).rent ?? 0) + total);
        book(g, "Rent from your tenants, less the agent's share", total);
    }
    if (let_) out.unshift(had ? `Your homes to let, last week: ${had} of ${let_} had a tenant, ${money(w, total)} after the agent's ${money(w, fees)}.` : 'None of your homes to let had a tenant last week.');
    return out;
});
