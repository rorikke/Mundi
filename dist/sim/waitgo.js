// Waiting for something you're going to: a city event you said you'd go to, a plan with someone. When to leave for it
// (its start, less the trip from where you are), and what waiting until then would make you miss: a shift of yours,
// another plan or event, the place you're at closing, the people with you going their own way. The screens ask
// (ui/waitgo.ts), then let the time pass and, from the Calendar, make the trip, so you arrive as it starts.
import { nowAbs } from '../core/store.js';
import { systemOn, isScenario } from '../core/world.js';
import { travelMinutes, placeOf, playerHomeId } from './places.js';
import { upcoming } from './plans.js';
import { comingEvents, isGoing } from './cityevents.js';
import { myJob, shiftOn, isFreelance } from './work.js';
import { openAt } from './daynight.js';
import { social } from './social.js';
import { hm, weekday } from './time.js';
const KIND = { date: 'Date', party: 'Party', shoot: 'Photo shoot', hangout: 'Hang out' };
/** What you're going to in the next week, soonest first: plans you go to (not someone coming over to you) and the city
 *  events you said you'd go to (not called off). Nothing in a Home: everything there is in the house. */
export function targets(g, w) {
    if (isScenario(w))
        return [];
    const now = nowAbs(g);
    const plans = upcoming(g).filter(a => a.from > now && !a.come && g.cast[a.avatar])
        .map(a => ({ kind: 'plan', id: a.id, title: a.title || `${KIND[a.kind] ?? 'Hang out'} with ${g.cast[a.avatar].name}`, place: a.place, at: a.from, who: a.avatar }));
    const events = systemOn(w, 'events') ? comingEvents(g, w, 7).filter(x => isGoing(g, x.key) && !x.off && x.from > now)
        .map(x => ({ kind: 'event', id: x.key, title: x.ev.name, place: x.ev.place, at: x.from })) : [];
    return [...plans, ...events].sort((a, b) => a.at - b.at);
}
export const findTarget = (g, w, kind, id) => targets(g, w).find(t => t.kind === kind && t.id === id) ?? null;
/** The trip there from where you are (none when you're there). */
export const tripTo = (g, w, place) => (place === g.player.loc ? 0 : travelMinutes(g, w, g.player.loc, place));
/** When to leave to be there as it starts (now or earlier: it's too late to wait). */
export const leaveAt = (g, w, t) => t.at - tripTo(g, w, t.place);
/** The next thing to wait for, from the clock: the first one whose time to leave is still ahead. */
export const nextTarget = (g, w) => targets(g, w).find(t => leaveAt(g, w, t) > nowAbs(g)) ?? null;
const when = (g, at) => { const d = Math.floor(at / 1440); return `${d === g.day ? 'today' : d === g.day + 1 ? 'tomorrow' : weekday(d)} ${hm(at % 1440)}`; };
/** What waiting from now until `until` would make you miss (each in a sentence), `except` the one you wait for. */
export function wouldMiss(g, w, until, except) {
    const now = nowAbs(g), out = [];
    if (until <= now)
        return out;
    // your shifts starting before then
    const job = systemOn(w, 'jobs') && !isFreelance(g, w) ? myJob(g, w) : null, j = g.player.job;
    if (job)
        for (let d = Math.floor(now / 1440); d <= Math.floor(until / 1440); d++) {
            const s = shiftOn(g, w, job, d);
            if (s && s.start > now && s.start < until && !j?.off?.[s.day] && !(j?.worked ?? []).includes(s.day))
                out.push(`Your shift at ${job.name} (${when(g, s.start)})`);
        }
    // other plans and events before then
    for (const t of targets(g, w))
        if (t.at < until && !(except && t.kind === except.kind && t.id === except.id))
            out.push(`${t.title} (${when(g, t.at)})`);
    // the place you're at closing meanwhile (you'd wait outside)
    const here = g.player.loc;
    if (here !== playerHomeId && !here.startsWith('home:') && systemOn(w, 'living') && openAt(g, w, here, now)) {
        for (let t = now - (now % 30) + 30; t < until; t += 30)
            if (!openAt(g, w, here, t)) {
                out.push(`${placeOf(g, w, here)?.name ?? 'This place'} closes at ${hm(t % 1440)}`);
                break;
            }
    }
    // the people with you go their own way
    for (const c of social(g).with)
        if (g.cast[c.avatar] && c.until < until)
            out.push(`${g.cast[c.avatar].name} goes their own way`);
    return out;
}
