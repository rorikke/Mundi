// Day and night: the parts of the day the world named (Dawn, Morning… or its own) change what is open, what things
// cost, the mood of the streets, and how places and maps look.
// · Opening hours: a place is closed in some parts of the day (place.closed: the ids of those parts). A place
//   without a list closes like places of its kind do (shops at night, offices at dawn…); parks never close.
//   (E19) A place can also keep hours by the clock (place.open, openBySeason, or openByDay for the nights a club
//   stays open later), close on some weekdays (closedDays) and in some weather (closedIn: a valley on volcanic-gas
//   days), stay open all night on its festivals (festivalOpen), and charge to get in once a day (entry).
// · Prices: each part of the day can make things cost more or less (time.periods[].prices, × as listed).
// · Pictures: a place, a home and a map can have a picture for each part of the day (bgs / images: { partId: url }),
//   and (E7) for a kind of weather or a season, alone or with a part of the day (`rain-night`, `spring-day`, `snow`);
//   without one, the usual picture is used.
import { closedByEvents } from './hooks.js';
export { closedByEvents };
import { nowAbs } from '../core/store.js';
import { WEEKDAY_IDS, systemOn } from '../core/world.js';
import { period, seasonDays, SEASONS } from './time.js';
import { festivalsOn } from './festivals.js';
import { priceOf } from './bills.js';
import { guestAt } from './stays.js';
import { skyOn, regionalOn, isRegional, weatherMatches } from './weather.js';
// The standard part of the day a world's period stands for (a "Vigil" from 0:00 counts as dawn…).
export function partOf(w, minutes) {
    const p = period(w, minutes);
    if (['dawn', 'morning', 'afternoon', 'evening', 'night'].includes(p.id))
        return p.id;
    const h = (p.from ?? minutes) / 60;
    return h < 6 ? 'dawn' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'night';
}
export const periodId = (w, minutes) => period(w, minutes).id;
/* ---------- opening hours ---------- */
// When places of each kind are closed (standard parts). A place is closed only when all its kinds are.
const CLOSED_BY_TAG = {
    food: ['dawn'], shop: ['dawn', 'night'], service: ['dawn', 'evening', 'night'], study: ['dawn', 'night'],
    work: ['dawn', 'night'], sport: ['dawn'], leisure: [], health: [],
};
// The parts of the day (the world's own period ids) a place is closed in.
export function closedOf(w, p) {
    if (Array.isArray(p.closed))
        return p.closed;
    if (p.open || p.openBySeason || p.openByDay)
        return []; // hours by the clock say it better than its kind
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
export function isOpen(w, placeId, minutes) {
    const p = w.places.find(x => x.id === placeId);
    if (!p || p.link)
        return true; // homes and anything not a public place are always "open"
    const m = dayMinute(minutes);
    return !closedOf(w, p).includes(periodId(w, m)) && (!p.open || inHours(p.open, m));
}
// Open at a moment (absolute game minutes): its closed parts, its clock hours (the season's), its closing days, and
// a festival that keeps it open all night. Past midnight, hours that run on from the evening count as the day before
// (a bar open 18–5 and closed on Tuesdays is open at 2:00 on a Tuesday morning).
export function openAt(g, w, placeId, at = nowAbs(g)) {
    const p = w.places.find(x => x.id === placeId);
    if (!p || p.link)
        return true;
    const day = Math.floor(at / 1440), m = dayMinute(at);
    if (festivalNight(g, w, p, day, m))
        return true;
    if (closedOf(w, p).includes(periodId(w, m)))
        return false;
    // past midnight, the night before may still be going (its own hours: a club open until 5 only on Saturdays)
    let biz = day, h = hoursOf(g, p, day);
    const before = hoursOf(g, p, day - 1);
    if (before && wraps(before) && m < toMinute(before[1]) && !p.closedDays?.includes(weekdayOf(day - 1))) {
        biz = day - 1;
        h = before;
    }
    else if (h && wraps(h) && m < toMinute(h[1])) {
        biz = day - 1;
        h = before ?? h;
    }
    if (h && !inHours(h, m))
        return false;
    if (p.closedIn?.length && systemOn(w, 'living') && p.closedIn.some(v => weatherShuts(g, w, p, day, m, v)))
        return false;
    return !p.closedDays?.includes(weekdayOf(biz));
}
const weekdayOf = (day) => WEEKDAY_IDS[(((day - 1) % 7) + 7) % 7];
// (E2) Its weather that day shuts it (a kind, or the region's own: volcanic gas).
const weatherShuts = (g, w, p, day, m, v) => (isRegional(w, v) ? regionalOn(g, w, v, p.map, day, m) : weatherMatches(skyOn(g, w, p.map, day), v));
// (a blood moon or a storm that shuts the town: shops stay closed)
export const openNow = (g, w, placeId) => openAt(g, w, placeId) && !closedByEvents.some(f => f(g, w, placeId));
const dayMinute = (m) => ((m % 1440) + 1440) % 1440;
const toMinute = (h) => dayMinute(Math.round(h * 60));
const wraps = (h) => toMinute(h[0]) > toMinute(h[1]);
// [from, to) by the clock: `to` below `from` runs past midnight; the same hour twice (0 and 24) is all day
function inHours(h, m) {
    const a = toMinute(h[0]), b = toMinute(h[1]);
    return a < b ? m >= a && m < b : a > b ? m >= a || m < b : true;
}
const seasonAt = (g, day) => SEASONS[Math.floor((Math.max(1, day) - 1) / seasonDays(g)) % 4].id;
const hoursOf = (g, p, day) => p.openByDay?.[weekdayOf(day)] ?? p.openBySeason?.[seasonAt(g, day)] ?? p.open ?? null;
// One of its festivals today, or yesterday's still going until the first trains (New Year's Eve at the temple).
function festivalNight(g, w, p, day, m) {
    if (!p.festivalOpen?.length)
        return false;
    const hit = (d) => festivalsOn(g, w, d).some(f => p.festivalOpen.includes(f.id));
    return hit(day) || (m < toMinute(w.transit?.first ?? 5) && hit(day - 1));
}
// What getting in costs today: 0 when it's free, already paid today, or you're staying the night (a Home has no money).
export function entryDue(g, w, placeId) {
    const fee = w.places.find(p => p.id === placeId)?.entry ?? 0;
    if (!(fee > 0) || w.scenario || guestAt(g, w, placeId))
        return 0;
    const paid = g.entry;
    return paid?.day === g.day && paid.list.includes(placeId) ? 0 : priceOf(g, fee);
}
// Pays it (once a day); returns what it cost.
export function payEntry(g, w, placeId) {
    const fee = entryDue(g, w, placeId);
    if (!fee)
        return 0;
    const paid = (g.entry ??= { day: g.day, list: [] });
    if (paid.day !== g.day) {
        paid.day = g.day;
        paid.list = [];
    }
    paid.list.push(placeId);
    g.player.money -= fee;
    return fee;
}
/* ---------- prices ---------- */
export const periodPrice = (w, minutes) => { const v = Number(period(w, minutes).prices); return v > 0 ? v : 1; };
/* ---------- the mood of the streets ---------- */
const PART_MOOD = { dawn: -8, morning: -2, afternoon: 0, evening: 8, night: 3 };
export const partMood = (w, minutes) => PART_MOOD[partOf(w, minutes)] ?? 0;
/* ---------- pictures for each part of the day ---------- */
// Pictures by time of day: three for every world, whatever its periods are called. Day 5:00–12:00, afternoon
// 12:00–18:00, night 18:00–5:00. (Pictures saved under a period's id, before, still work.)
export const TIME_SLOTS = [{ id: 'day', name: 'Day' }, { id: 'afternoon', name: 'Afternoon' }, { id: 'night', name: 'Night' }];
export const slotAt = (minutes) => { const h = Math.floor((((minutes % 1440) + 1440) % 1440) / 60); return h >= 5 && h < 12 ? 'day' : h >= 12 && h < 18 ? 'afternoon' : 'night'; };
// (E7) `looks`: the weather's kinds and the season right there (looksAt in worldstate.ts): a picture for one of them with
// the part of the day first (`rain-night`, then `spring-night`), then one for it alone (`rain`), then the part of the day's.
export function pictureAt(w, minutes, base, byPart, looks) {
    const slot = slotAt(minutes);
    if (byPart && looks?.length) {
        for (const l of looks) {
            const v = byPart[`${l}-${slot}`];
            if (v)
                return v;
        }
        for (const l of looks) {
            const v = byPart[l];
            if (v)
                return v;
        }
    }
    return byPart?.[slot] || byPart?.[periodId(w, minutes)] || base;
}
