// Sleeping away from home (E6): a capsule hotel, a manga café's booth, a room at a ryokan. A place with `sleep` lets
// you book the night (its price), sleep there until its check-out hour, and use what the night includes (the ryokan's
// dinner, baths and breakfast) from booking until you leave the next morning; a guest is never locked out. Waking up
// there sets `player.stayed` (the `stayed` condition in sim/when.ts). How well you rest depends on the bed.
import { nowAbs } from '../core/store.js';
import { addStatus } from './needs.js';
import { isScenario } from '../core/world.js';
import { priceOf } from './bills.js';
import { whenHolds } from './when.js';
import { note } from './facts.js';
import { book } from './ledger.js';
/** What a night gives back of a night at home (energy, the world's other sleep restores), and the mood it leaves. */
export const REST = {
    poor: { share: 0.45, mood: -4 }, fair: { share: 0.7, mood: 0 }, good: { share: 0.9, mood: 2 }, great: { share: 1, mood: 6 },
};
const placeSleep = (w, place) => w.places.find(p => p.id === place)?.sleep ?? null;
const bookingOf = (g) => g.player.booked;
const stayedOf = (g) => g.player.stayed;
/** The hour you must leave in the morning (minutes after midnight). */
export const checkOut = (w, s) => (s.until !== undefined ? Math.round(s.until * 60) : w.sleep.until);
/** Can you sleep here (a place with `sleep` whose own condition holds)? Never in a Home: its rooms are the house's. */
export function sleepHere(g, w, place = g.player.loc) {
    const s = placeSleep(w, place);
    return s && !isScenario(w) && whenHolds(g, w, s.when, { place, key: `sleep|${place}` }) ? s : null;
}
/** What a night costs here now (after the difficulty). */
export const nightPrice = (g, s) => Math.max(0, priceOf(g, s.price ?? 0));
/** Is a night booked here (tonight's, not slept yet: booked today, or before midnight and still up)? */
export function bookedHere(g, w, place = g.player.loc) {
    const b = bookingOf(g), s = placeSleep(w, place);
    return !!b && !!s && b.place === place && (b.day === g.day || (b.day === g.day - 1 && g.minutes < checkOut(w, s)));
}
/** A guest here: booked tonight, or slept here and not yet past the check-out hour. */
export function guestAt(g, w, place = g.player.loc) {
    const s = placeSleep(w, place);
    if (!s)
        return false;
    if (bookedHere(g, w, place))
        return true;
    const st = stayedOf(g);
    return !!st && st.place === place && st.day === g.day && g.minutes < checkOut(w, s);
}
/** Actions this place's night includes, free for a guest. */
export const includedHere = (g, w, place = g.player.loc) => (guestAt(g, w, place) ? placeSleep(w, place)?.includes ?? [] : []);
/** Books tonight here: pays and remembers it. Returns '' when done, or why it can't be. */
export function bookNight(g, w, place = g.player.loc) {
    const s = sleepHere(g, w, place);
    if (!s)
        return 'You can\'t stay the night here.';
    if (bookedHere(g, w, place))
        return '';
    const cost = nightPrice(g, s);
    if (g.player.money < cost)
        return 'Not enough money for the night.';
    g.player.money -= cost;
    if (cost)
        book(g, w.places.find(p => p.id === place)?.name ?? 'A night away', -cost);
    g.player.booked = { place, day: g.day };
    return '';
}
/** Minutes of sleep from now to the morning: you wake at the usual hour (the world's `sleep.until`), or at the check-out
 *  hour when it comes first; a later check-out leaves time for breakfast. */
export function nightMinutes(g, w, s) {
    const until = Math.min(checkOut(w, s), w.sleep.until);
    return g.minutes < until ? until - g.minutes : 1440 - g.minutes + until;
}
/** After the night: what it gave back (share of a night at home, by the bed), and you remember where you woke up. */
export function wakeUpAt(g, w, place, s) {
    delete g.player.booked;
    g.player.stayed = { place, day: g.day };
    const name = w.places.find(p => p.id === place)?.name ?? place;
    note(g, '{u} spent the night at {0}.', [name], [], place, 'stay');
    return REST[s.rest] ?? REST.fair;
}
/** The night's restores (the world's `sleep.restore`): in full at home (`rest` null), its share in a bed elsewhere
 *  (energy never drops below what you had). A night leaves you hungry, thirsty and in need of a wash; the bed sets
 *  the mood (`homeMood`: what your own bed gives). */
export function restAfterNight(g, w, rest, homeMood = 0) {
    for (const [id, v] of Object.entries(w.sleep.restore)) {
        const d = w.statuses.find(s => s.id === id);
        if (!d)
            continue;
        const cur = g.player.stats[id] ?? d.start, got = rest ? Math.round(v * rest.share) : v;
        g.player.stats[id] = Math.min(d.max, (id === 'energy' ? (rest ? Math.max(cur, got) : v) : cur + got));
        if (d.decay?.awakeOnly)
            g.tick[`decay:${id}`] = nowAbs(g); // the waking day starts counting now
    }
    for (const [id, v] of Object.entries({ hunger: -20, thirst: -25, hygiene: -25 }))
        addStatus(g, w, id, v);
    const m = rest ? rest.mood : homeMood;
    if (m)
        addStatus(g, w, 'mood', m);
}
