// (E4) Trains: in a world with `transit` (Tokyo), a trip between two maps goes by train, and no train runs between the
// last one (about 0:30) and the first (about 5:00): then it's a taxi, at its fare, or a wait for the first train. The
// save's "Last train" rule (World → Rules → Advanced) can make taxis cheap or keep the trains running all night.
// Worlds without `transit` have no last train. (E11) On a train you may run into someone you know making the same
// trip, more often at rush hour. (E36) The night a resident misses the last train is in people.ts (lateNight).
import { cfg } from '../core/store.js';
import { isScenario } from '../core/world.js';
import { mapOf } from './places.js';
import { priceOf } from './bills.js';
export const LAST_TRAIN_RULES = [
    { id: 'on', name: 'Last train', desc: 'After the last train, a taxi or a wait for the first one.' },
    { id: 'cheap', name: 'Cheap taxis', desc: 'After the last train, taxis cost a quarter.' },
    { id: 'off', name: 'Trains all night', desc: 'Trains run all night.' },
];
export const lastTrainRule = (g) => cfg(g).lastTrain ?? 'on';
const dayMinute = (m) => ((m % 1440) + 1440) % 1440;
const toMinute = (h) => dayMinute(Math.round(h * 60));
/** The last and the first train (minutes of the day), when the world has them. */
export function trainHours(w) {
    const t = w?.transit;
    if (!t || t.last === undefined)
        return null;
    return { last: toMinute(t.last), first: toMinute(t.first ?? 5) };
}
/** Whether trains run at that minute (always, in a world without a last train). */
export function trainsRun(w, minutes) {
    const h = trainHours(w);
    if (!h || h.last === h.first)
        return true;
    const m = dayMinute(minutes);
    return h.last < h.first ? m < h.last || m >= h.first : m < h.last && m >= h.first;
}
/** Minutes from then until the first train. */
export function untilFirstTrain(w, minutes) {
    const h = trainHours(w);
    return h ? dayMinute(h.first - dayMinute(minutes)) : 0;
}
/** A trip that takes the train: between two maps, in a world with trains (not a Home). */
export const byTrain = (g, w, from, to) => !!w.transit && !isScenario(w) && from !== to && mapOf(g, w, from) !== mapOf(g, w, to);
/** The player's trip now finds no train (and the rule keeps the last train). */
export const missedTrain = (g, w, from, to) => lastTrainRule(g) !== 'off' && byTrain(g, w, from, to) && !trainsRun(w, g.minutes);
/** A taxi for a trip of that many minutes: the world's fare (a base and per minute), with the difficulty's prices. */
export function taxiFare(g, w, minutes) {
    const t = w.transit?.taxi;
    if (!t)
        return 0;
    const fare = priceOf(g, t.base + (t.perMinute ?? 0) * minutes);
    return lastTrainRule(g) === 'cheap' ? Math.round(fare / 4) : fare;
}
/* ---------- chance meetings on the train (E11) ---------- */
// Morning and evening rush (minutes of the day).
export const rushHour = (minutes) => { const m = dayMinute(minutes); return (m >= 420 && m < 570) || (m >= 1050 && m < 1170); };
/** Someone you know who made the same trip just now (from where they were before it to where they are after it), or at
 *  rush hour left your district at the same time (at the station): whom you might run into. `before` and `after`: where
 *  each resident was when you left and is as you arrive. */
export function fellowTravelers(g, w, before, after, from, to, departed) {
    const fromMap = mapOf(g, w, from), toMap = mapOf(g, w, to), rush = rushHour(departed);
    const same = [], station = [];
    for (const r of Object.values(g.cast)) {
        const a = before.get(r.avatar), b = after.get(r.avatar);
        if (!r.met || !a || !b || a === b || mapOf(g, w, a) !== fromMap)
            continue;
        const m = mapOf(g, w, b);
        if (m === toMap)
            same.push(r);
        else if (rush && m !== fromMap)
            station.push(r);
    }
    return same.length ? same : station;
}
/** The odds of running into one of them: better on the same train, best at rush hour. */
export const meetOdds = (sameTrain, departed) => (rushHour(departed) ? (sameTrain ? 0.5 : 0.2) : sameTrain ? 0.25 : 0);
