// Sleeping away from home (E6): a capsule hotel, a manga café's booth, a room at a ryokan. A place with `sleep` lets
// you book the night (its price), sleep there until its check-out hour, and use what the night includes (the ryokan's
// dinner, baths and breakfast) from booking until you leave the next morning; a guest is never locked out. Waking up
// there sets `player.stayed` (the `stayed` condition in sim/when.ts). How well you rest depends on the bed.
// A collapse that takes you to a hospital (a need's crisis with `stay`) keeps you there for the night: a free bed until
// the morning, and the shifts until then are sick days. You may still walk out; nothing waits for you.
import { nowAbs, type Save } from '../core/store.js';
import { addStatus } from './needs.js';
import { isScenario, type WorldDef, type PlaceSleep } from '../core/world.js';
import { onHour, onLook } from './hooks.js';
import { sickLeave } from './work.js';
import { priceOf } from './bills.js';
import { whenHolds } from './when.js';
import { note } from './facts.js';
import { book } from './ledger.js';

/** A night booked at a place: `day` is the evening it starts. `stayed` (on the player) is the morning after. `ward`:
 *  kept in a hospital bed after a collapse (the place needs no `sleep` of its own). */
export interface Booking { place: string; day: number; ward?: boolean }
/** A hospital bed for the night after a collapse: free, a fair rest, out by ten. */
export const WARD: PlaceSleep = { price: 0, rest: 'fair', until: 10 };
/** What a night gives back of a night at home (energy, the world's other sleep restores), and the mood it leaves. */
export const REST: Record<PlaceSleep['rest'], { share: number; mood: number }> = {
    poor: { share: 0.45, mood: -4 }, fair: { share: 0.7, mood: 0 }, good: { share: 0.9, mood: 2 }, great: { share: 1, mood: 6 },
};

const bookingOf = (g: Save) => (g.player as any).booked as Booking | undefined;
// The place's own beds, or the ward's when you were kept there (that night, until the morning's check-out).
const placeSleep = (w: WorldDef, place: string, g?: Save): PlaceSleep | null => {
    const b = g && bookingOf(g);
    if (b?.ward && b.place === place && (b.day === g!.day || (b.day === g!.day - 1 && g!.minutes < checkOut(w, WARD)))) return WARD;
    return w.places.find(p => p.id === place)?.sleep ?? null;
};
const stayedOf = (g: Save) => (g.player as any).stayed as { place: string; day: number } | undefined;
/** The hour you must leave in the morning (minutes after midnight). */
export const checkOut = (w: WorldDef, s: PlaceSleep) => (s.until !== undefined ? Math.round(s.until * 60) : w.sleep.until);

/** Can you sleep here (a place with `sleep` whose own condition holds)? Never in a Home: its rooms are the house's. */
export function sleepHere(g: Save, w: WorldDef, place = g.player.loc): PlaceSleep | null {
    const s = placeSleep(w, place, g);
    return s && !isScenario(w) && whenHolds(g, w, s.when, { place, key: `sleep|${place}` }) ? s : null;
}
/** What a night costs here now (after the difficulty). */
export const nightPrice = (g: Save, s: PlaceSleep) => Math.max(0, priceOf(g, s.price ?? 0));
/** Is a night booked here (tonight's, not slept yet: booked today, or before midnight and still up)? */
export function bookedHere(g: Save, w: WorldDef, place = g.player.loc): boolean {
    const b = bookingOf(g), s = placeSleep(w, place, g);
    return !!b && !!s && b.place === place && (b.day === g.day || (b.day === g.day - 1 && g.minutes < checkOut(w, s)));
}
/** A guest here: booked tonight, or slept here and not yet past the check-out hour. */
export function guestAt(g: Save, w: WorldDef, place = g.player.loc): boolean {
    const s = placeSleep(w, place, g);
    if (!s) return false;
    if (bookedHere(g, w, place)) return true;
    const st = stayedOf(g);
    return !!st && st.place === place && st.day === g.day && g.minutes < checkOut(w, s);
}
/** Actions this place's night includes, free for a guest. */
export const includedHere = (g: Save, w: WorldDef, place = g.player.loc): string[] => (guestAt(g, w, place) ? placeSleep(w, place, g)?.includes ?? [] : []);

/** Books tonight here: pays and remembers it. Returns '' when done, or why it can't be. */
export function bookNight(g: Save, w: WorldDef, place = g.player.loc): string {
    const s = sleepHere(g, w, place);
    if (!s) return 'You can\'t stay the night here.';
    if (bookedHere(g, w, place)) return '';
    const cost = nightPrice(g, s);
    if (g.player.money < cost) return 'Not enough money for the night.';
    g.player.money -= cost;
    if (cost) book(g, w.places.find(p => p.id === place)?.name ?? 'A night away', -cost);
    (g.player as any).booked = { place, day: g.day } as Booking;
    return '';
}
/** Minutes of sleep from now to the morning: you wake at the usual hour (the world's `sleep.until`), or at the check-out
 *  hour when it comes first; a later check-out leaves time for breakfast. */
export function nightMinutes(g: Save, w: WorldDef, s: PlaceSleep): number {
    const until = Math.min(checkOut(w, s), w.sleep.until);
    return g.minutes < until ? until - g.minutes : 1440 - g.minutes + until;
}
/** After the night: what it gave back (share of a night at home, by the bed), and you remember where you woke up. */
export function wakeUpAt(g: Save, w: WorldDef, place: string, s: PlaceSleep) {
    delete (g.player as any).booked;
    (g.player as any).stayed = { place, day: g.day };
    const name = w.places.find(p => p.id === place)?.name ?? place;
    note(g, '{u} spent the night at {0}.', [name], [], place, 'stay');
    return REST[s.rest] ?? REST.fair;
}
/* ---------- kept in hospital after a collapse ---------- */

/** Are you kept in a hospital bed tonight (here, or at `place`)? */
export const inWard = (g: Save, w: WorldDef, place = g.player.loc) => placeSleep(w, place, g) === WARD;
/** You're kept for the night where the collapse took you: a free bed until the morning (sleep there as anywhere), and
 *  the shifts until you're let out are sick days. */
export function admit(g: Save, w: WorldDef, place: string) {
    (g.player as any).booked = { place, day: g.minutes < WARD.until! * 60 ? g.day - 1 : g.day, ward: true } as Booking;
    const out = (g.day + (g.minutes < WARD.until! * 60 ? 0 : 1)) * 1440 + WARD.until! * 60;
    sickLeave(g, w, out);
    note(g, '{u} was kept overnight at {0} after collapsing.', [w.places.find(p => p.id === place)?.name ?? place], [], place, 'crisis');
}
// After a crisis that takes you somewhere to stay (a collapse: the hospital), once, while you're there.
export function lookCollapse(g: Save, w: WorldDef) {
    const c = (g as any).lastCrisis as { need: string; at: number; ward?: boolean } | undefined;
    if (!c || c.ward || nowAbs(g) - c.at > 120) return;
    const crisis = w.statuses.find(s => s.id === c.need)?.zero?.crisis;
    if (!crisis?.stay || !crisis.place || crisis.place === 'home' || g.player.loc !== crisis.place || isScenario(w)) return;
    c.ward = true;
    admit(g, w, crisis.place);
}
onHour.push((g, w) => { lookCollapse(g, w); return []; });
onLook.push(lookCollapse);

/** The night's restores (the world's `sleep.restore`): in full at home (`rest` null), its share in a bed elsewhere
 *  (energy never drops below what you had). A night leaves you hungry, thirsty and in need of a wash; the bed sets
 *  the mood (`homeMood`: what your own bed gives). */
export function restAfterNight(g: Save, w: WorldDef, rest: { share: number; mood: number } | null, homeMood = 0, part = 1) {
    for (const [id, v] of Object.entries(w.sleep.restore)) {
        const d = w.statuses.find(s => s.id === id);
        if (!d) continue;
        const cur = g.player.stats[id] ?? d.start, got = rest ? Math.round(v * rest.share) : v;
        const night = id === 'energy' ? (rest ? Math.max(cur, got) : v) : cur + got;
        // a nap (`part` of a full night, "Sleep until the party") gives back that part of it
        g.player.stats[id] = Math.min(d.max, part >= 1 ? night : id === 'energy' ? Math.max(cur, cur + (night - cur) * part) : cur + got * part);
        if (d.decay?.awakeOnly) g.tick[`decay:${id}`] = nowAbs(g);   // the waking day starts counting now
    }
    for (const [id, v] of Object.entries({ hunger: -20, thirst: -25, hygiene: -25 })) addStatus(g, w, id, Math.round(v * part));
    const m = rest ? rest.mood : homeMood;
    if (m && part >= 0.5) addStatus(g, w, 'mood', m);
}
