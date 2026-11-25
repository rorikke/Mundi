// Closed places (the living world). You get into a closed public place only with a reason to be there: your shift
// (from two hours before it starts), a class of a course you're taking held there, a plan with someone or a city event
// there (from an hour before), a business of your own, a night you booked there. Last orders come half an hour before
// a place closes; once it's closed and you have no reason left, you're shown out (ui/map.ts asks where to: the nearest
// open place on the same map, home, or the map). Homes, places that never close, Home scenarios and worlds with the
// living world off aren't touched.
import { nowAbs, adultOn } from '../core/store.js';
import { systemOn, isScenario } from '../core/world.js';
import { openAt, closedOf, closedByEvents } from './daynight.js';
import { placeOf, travelMinutes } from './places.js';
import { placeOk } from './dayplan.js';
import { myJob, shiftOn, jobPlace, offScreen, trackOf, EARLY } from './work.js';
import { takingNow, classWindow, studiedToday, learning } from './courses.js';
import { social } from './social.js';
import { comingEvents, isGoing } from './cityevents.js';
import { venturesOf, placesOf } from './ventures.js';
import { peekPhoto, photoOn } from './photo.js';
import { guestAt } from './stays.js';
import { arrestOf } from './prison.js';
import { hm, weekday } from './time.js';
/** Minutes before a plan, an event or a class that you may be there; half an hour of last orders before closing. */
export const CLOSING = { early: 60, lastOrders: 30, step: 15 };
const placeDef = (w, id) => w.places.find(p => p.id === id);
/** A place the rule is about: a public place on a map, in a world with the living world on (not a home or a room). */
export function gated(w, id) {
    if (isScenario(w) || !systemOn(w, 'living') || id.startsWith('home:'))
        return false;
    const p = placeDef(w, id);
    return !!p && !p.link && !p.home && !p.room;
}
// Open at that moment; what shuts a place for an event (a storm, a blood moon) is only known for now.
const openThen = (g, w, id, at) => openAt(g, w, id, at) && !closedByEvents.some(f => f(g, w, id));
/** Why you may be at a place at `at` while it's closed (a few words), or null. */
export function reasonAt(g, w, id, at = nowAbs(g)) {
    if (arrestOf(g))
        return 'held';
    // your shift there, from when you may set off for it until it ends
    const o = systemOn(w, 'jobs') ? myJob(g, w) : null, j = g.player.job;
    if (o && !offScreen(w, trackOf(g, o)) && jobPlace(g, o) === id) {
        const d = Math.floor(at / 1440);
        for (const day of [d - 1, d, d + 1]) {
            const s = shiftOn(g, w, o, day);
            if (s && at >= s.start - EARLY && at <= s.end && !j?.off?.[day])
                return 'shift';
        }
    }
    // a class of a course you're taking, taught there (scheduled: around its hours; else until today's class is done)
    for (const c of takingNow(g, w)) {
        if (c.at !== id || studiedToday(g, c.id))
            continue;
        if (!learning(g).plan[c.id]?.sched)
            return 'class';
        const day = Math.floor(at / 1440), win = classWindow(g, w, c, day);
        if (win && at >= day * 1440 + win.from - CLOSING.early && at < day * 1440 + win.to)
            return 'class';
    }
    // a plan with someone there
    if (social(g).appts.some(a => a.state === 'set' && a.place === id && at >= a.from - CLOSING.early && at <= a.to))
        return 'plan';
    // a city event there (from an hour before when you said you'd go)
    if (systemOn(w, 'events') && comingEvents(g, w, 2).some(x => !x.off && x.ev.place === id && at >= x.from - (isGoing(g, x.key) ? CLOSING.early : 0) && at <= x.to))
        return 'event';
    // a business of your own, a night you booked, a brief to shoot there, a studio you rented
    if (venturesOf(g).some(s => placesOf(s).includes(id)))
        return 'yours';
    if (guestAt(g, w, id))
        return 'guest';
    if (photoOn(w)) {
        const ph = peekPhoto(g);
        if (ph.open.some(t => t.place === id && !t.shot))
            return 'brief';
        if (ph.rental && ph.rental.at === id && at < ph.rental.until)
            return 'rental';
    }
    return null;
}
/** The first moment from `from` (absolute minutes) the place is open, within a week; null when it never opens. */
export function opensAt(g, w, id, from = nowAbs(g)) {
    const s = CLOSING.step;
    for (let t = Math.ceil(from / s) * s; t < from + 8 * 1440; t += s)
        if (openAt(g, w, id, t))
            return t;
    return null;
}
/** When it closes within `within` minutes from now (absolute minutes), or null. */
export function closesWithin(g, w, id, within) {
    const now = nowAbs(g), s = CLOSING.step;
    if (!openThen(g, w, id, now))
        return null;
    for (let t = Math.floor(now / s) * s + s; t <= now + within; t += s)
        if (!openAt(g, w, id, t))
            return t;
    return null;
}
/** "18:00", "tomorrow at 18:00", "on Monday at 18:00". */
export function whenWords(g, at) {
    const d = Math.floor(at / 1440), t = hm(at % 1440);
    return d === g.day ? t : d === g.day + 1 ? `tomorrow at ${t}` : `on ${weekday(d)} at ${t}`;
}
/** Words for a closed place: "Closed · opens 18:00" ('Closed' when it doesn't open again this week). */
export function closedWords(g, w, id, from = nowAbs(g)) {
    const t = opensAt(g, w, id, from);
    return t === null ? 'Closed' : `Closed · opens ${whenWords(g, t)}`;
}
/** Why you can't go to a place now, arriving at `arrive` ('' when you can): it's closed then and you've no reason. */
export function closedTo(g, w, id, arrive = nowAbs(g)) {
    if (!gated(w, id) || openThen(g, w, id, arrive) || reasonAt(g, w, id, arrive))
        return '';
    const t = opensAt(g, w, id, arrive);
    const name = placeOf(g, w, id)?.name ?? 'It';
    return t === null ? `${name} is closed.` : `${name} is closed until ${whenWords(g, t)}.`;
}
/** Last orders where you are: the time it closes, when that's within half an hour and you'll have no reason to stay. */
export function lastOrders(g, w) {
    const id = g.player.loc;
    if (!gated(w, id))
        return null;
    const t = closesWithin(g, w, id, CLOSING.lastOrders);
    return t !== null && !reasonAt(g, w, id, t) ? t : null;
}
/** You're at a closed place with no reason to be there: time to go. */
export const shownOut = (g, w) => { const id = g.player.loc; return gated(w, id) && !openThen(g, w, id, nowAbs(g)) && !reasonAt(g, w, id); };
// Never closes: no closed parts of the day, no clock hours, no closing days (a crossing, a street).
const alwaysOpen = (w, p) => !closedOf(w, p).length && !p.open && !p.openBySeason && !p.openByDay && !p.closedDays?.length && !p.closedSeasons?.length && !p.closedIn?.length;
/** Where to go when you're shown out: the nearest place on the same map open as you'd get there, those that never
 *  close first (out onto the street, not into another bar); null when nothing nearby is open. */
export function wayOut(g, w) {
    const here = placeDef(w, g.player.loc);
    if (!here)
        return null;
    const now = nowAbs(g);
    const list = w.places.filter(p => p.map === here.map && p.id !== here.id && gated(w, p.id) && !p.private && !p.venture && !p.entry && placeOk(g, w, p.id) && (!p.adult || adultOn(g)))
        .map(p => ({ p, minutes: travelMinutes(g, w, here.id, p.id) }))
        .filter(x => openThen(g, w, x.p.id, now + x.minutes));
    list.sort((a, b) => Number(alwaysOpen(w, b.p)) - Number(alwaysOpen(w, a.p)) || a.minutes - b.minutes);
    return list[0] ? { id: list[0].p.id, minutes: list[0].minutes } : null;
}
