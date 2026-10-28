// Day and night: the parts of the day the world named (Dawn, Morning… or its own) change what is open, what things
// cost, the mood of the streets, and how places and maps look.
// · Opening hours: a place is closed in some parts of the day (place.closed: the ids of those parts). A place
//   without a list closes like places of its kind do (shops at night, offices at dawn…); parks never close.
//   (E19) A place can also keep hours by the clock (place.open, or openBySeason), close on some weekdays
//   (closedDays), stay open all night on its festivals (festivalOpen), and charge to get in once a day (entry).
// · Prices: each part of the day can make things cost more or less (time.periods[].prices, × as listed).
// · Pictures: a place, a home and a map can have a picture for each part of the day (bgs / images: { partId: url });
//   without one, the usual picture is used.
import { closedByEvents } from './hooks.js';
export { closedByEvents };
import { nowAbs, type Save } from '../core/store.js';
import { WEEKDAY_IDS, systemOn, type WorldDef, type Place } from '../core/world.js';
import { period, seasonDays, SEASONS } from './time.js';
import { festivalsOn } from './festivals.js';
import { priceOf } from './bills.js';
import { guestAt } from './stays.js';
import { skyOn, regionalOn, isRegional, weatherMatches } from './weather.js';

// The standard part of the day a world's period stands for (a "Vigil" from 0:00 counts as dawn…).
export function partOf(w: WorldDef, minutes: number): 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' {
    const p = period(w, minutes);
    if (['dawn', 'morning', 'afternoon', 'evening', 'night'].includes(p.id)) return p.id as any;
    const h = (p.from ?? minutes) / 60;
    return h < 6 ? 'dawn' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'night';
}
export const periodId = (w: WorldDef, minutes: number) => period(w, minutes).id;

/* ---------- opening hours ---------- */

// When places of each kind are closed (standard parts). A place is closed only when all its kinds are.
const CLOSED_BY_TAG: Record<string, string[]> = {
    food: ['dawn'], shop: ['dawn', 'night'], service: ['dawn', 'evening', 'night'], study: ['dawn', 'night'],
    work: ['dawn', 'night'], sport: ['dawn'], leisure: [], health: [],
};
// The parts of the day (the world's own period ids) a place is closed in.
export function closedOf(w: WorldDef, p: Place): string[] {
    if (Array.isArray(p.closed)) return p.closed;
    if (p.open || p.openBySeason) return [];   // hours by the clock say it better than its kind
    // tags that say nothing about hours (contracts, a tower…) do not count
    const kinds = (p.tags ?? []).filter(t => t in CLOSED_BY_TAG);
    const tags = kinds.length ? kinds : ['leisure'];
    return w.time.periods.filter(per => {
        const part = partOf(w, per.from);
        return tags.every(t => (CLOSED_BY_TAG[t] ?? []).includes(part));
    }).map(per => per.id);
}
// Open at this time of day, by its closed parts and its all-year clock hours: what doesn't depend on the day (for
// closing days, seasons and festivals, openAt).
export function isOpen(w: WorldDef, placeId: string, minutes: number): boolean {
    const p = w.places.find(x => x.id === placeId);
    if (!p || p.link) return true;   // homes and anything not a public place are always "open"
    const m = dayMinute(minutes);
    return !closedOf(w, p).includes(periodId(w, m)) && (!p.open || inHours(p.open, m));
}
// Open at a moment (absolute game minutes): its closed parts, its clock hours (the season's), its closing days, and
// a festival that keeps it open all night. Past midnight, hours that run on from the evening count as the day before
// (a bar open 18–5 and closed on Tuesdays is open at 2:00 on a Tuesday morning).
export function openAt(g: Save, w: WorldDef, placeId: string, at = nowAbs(g)): boolean {
    const p = w.places.find(x => x.id === placeId);
    if (!p || p.link) return true;
    const day = Math.floor(at / 1440), m = dayMinute(at);
    if (festivalNight(g, w, p, day, m)) return true;
    if (closedOf(w, p).includes(periodId(w, m))) return false;
    let biz = day, h = hoursOf(g, p, day);
    if (h && wraps(h) && m < toMinute(h[1])) { biz = day - 1; h = hoursOf(g, p, biz) ?? h; }
    if (h && !inHours(h, m)) return false;
    if (p.closedIn?.length && systemOn(w, 'living') && p.closedIn.some(v => weatherShuts(g, w, p, day, m, v))) return false;
    return !p.closedDays?.includes(weekdayOf(biz));
}
const weekdayOf = (day: number) => WEEKDAY_IDS[(((day - 1) % 7) + 7) % 7];
// (E2) Its weather that day shuts it (a kind, or the region's own: volcanic gas).
const weatherShuts = (g: Save, w: WorldDef, p: Place, day: number, m: number, v: string) => (isRegional(w, v) ? regionalOn(g, w, v, p.map, day, m) : weatherMatches(skyOn(g, w, p.map, day), v));
// (a blood moon or a storm that shuts the town: shops stay closed)
export const openNow = (g: Save, w: WorldDef, placeId: string) => openAt(g, w, placeId) && !closedByEvents.some(f => f(g, w, placeId));

const dayMinute = (m: number) => ((m % 1440) + 1440) % 1440;
const toMinute = (h: number) => dayMinute(Math.round(h * 60));
const wraps = (h: [number, number]) => toMinute(h[0]) > toMinute(h[1]);
// [from, to) by the clock: `to` below `from` runs past midnight; the same hour twice (0 and 24) is all day
function inHours(h: [number, number], m: number) {
    const a = toMinute(h[0]), b = toMinute(h[1]);
    return a < b ? m >= a && m < b : a > b ? m >= a || m < b : true;
}
const seasonAt = (g: Save, day: number) => SEASONS[Math.floor((Math.max(1, day) - 1) / seasonDays(g)) % 4].id;
const hoursOf = (g: Save, p: Place, day: number) => p.openBySeason?.[seasonAt(g, day)] ?? p.open ?? null;
// One of its festivals today, or yesterday's still going until the first trains (New Year's Eve at the temple).
function festivalNight(g: Save, w: WorldDef, p: Place, day: number, m: number) {
    if (!p.festivalOpen?.length) return false;
    const hit = (d: number) => festivalsOn(g, w, d).some(f => p.festivalOpen!.includes(f.id));
    return hit(day) || (m < toMinute(w.transit?.first ?? 5) && hit(day - 1));
}

/* ---------- entry fees (E19) ---------- */

interface Paid { day: number; list: string[] }
// What getting in costs today: 0 when it's free, already paid today, or you're staying the night (a Home has no money).
export function entryDue(g: Save, w: WorldDef, placeId: string): number {
    const fee = w.places.find(p => p.id === placeId)?.entry ?? 0;
    if (!(fee > 0) || w.scenario || guestAt(g, w, placeId)) return 0;
    const paid = (g as any).entry as Paid | undefined;
    return paid?.day === g.day && paid.list.includes(placeId) ? 0 : priceOf(g, fee);
}
// Pays it (once a day); returns what it cost.
export function payEntry(g: Save, w: WorldDef, placeId: string): number {
    const fee = entryDue(g, w, placeId);
    if (!fee) return 0;
    const paid = ((g as any).entry ??= { day: g.day, list: [] }) as Paid;
    if (paid.day !== g.day) { paid.day = g.day; paid.list = []; }
    paid.list.push(placeId);
    g.player.money -= fee;
    return fee;
}

/* ---------- prices ---------- */

export const periodPrice = (w: WorldDef, minutes: number) => { const v = Number((period(w, minutes) as any).prices); return v > 0 ? v : 1; };

/* ---------- the mood of the streets ---------- */

const PART_MOOD: Record<string, number> = { dawn: -8, morning: -2, afternoon: 0, evening: 8, night: 3 };
export const partMood = (w: WorldDef, minutes: number) => PART_MOOD[partOf(w, minutes)] ?? 0;

/* ---------- pictures for each part of the day ---------- */

// Pictures by time of day: three for every world, whatever its periods are called. Day 5:00–12:00, afternoon
// 12:00–18:00, night 18:00–5:00. (Pictures saved under a period's id, before, still work.)
export const TIME_SLOTS = [{ id: 'day', name: 'Day' }, { id: 'afternoon', name: 'Afternoon' }, { id: 'night', name: 'Night' }];
export const slotAt = (minutes: number) => { const h = Math.floor((((minutes % 1440) + 1440) % 1440) / 60); return h >= 5 && h < 12 ? 'day' : h >= 12 && h < 18 ? 'afternoon' : 'night'; };
export const pictureAt = (w: WorldDef, minutes: number, base: string | undefined, byPart?: Record<string, string>) => byPart?.[slotAt(minutes)] || byPart?.[periodId(w, minutes)] || base;
