import { systemOn } from '../core/world.js';
import { onAction, onDay } from './hooks.js';
import { addStatus } from './needs.js';
import { note } from './facts.js';
import { placeOf } from './places.js';
export const habitsOf = (g) => (g.habits ??= { log: {}, has: [] });
const on = (w) => systemOn(w, 'habits') && !!w.habits?.length;
/** Rebuilds `traits.habits` from `habits.has`, with the habits' own names. A habit named like a trait you have from
 *  another group (a chosen one) adds nothing, as it never did. Returns whether the list changed. */
export function syncHabitTraits(g, w) {
    const t = (g.player.traits ??= {});
    if (!g.habits && !t.habits)
        return false; // never had one: nothing to rebuild (and no empty store made)
    const others = new Set(Object.entries(t).filter(([k]) => k !== 'habits').flatMap(([, v]) => (Array.isArray(v) ? v : [])));
    const next = habitTraits(g, w).filter(n => !others.has(n)), cur = Array.isArray(t.habits) ? t.habits : [];
    const same = cur.length === next.length && cur.every((n, i) => n === next[i]);
    if (!same)
        t.habits = next;
    return !same;
}
/** Forgets a habit you have (life goals' "Change a trait" can drop one): its recent log goes too, so it doesn't come
 *  back the next morning. */
export function resetHabit(g, w, id) {
    const hs = habitsOf(g);
    if (!hs.has.includes(id))
        return false;
    hs.has = hs.has.filter(x => x !== id);
    hs.log[id] = [];
    syncHabitTraits(g, w);
    return true;
}
export function matches(h, a, minutes, placeTags = []) {
    const byAction = h.actions?.length ? h.actions.includes(a.id) : true;
    const byTag = h.tags?.length ? placeTags.some(t => h.tags.includes(t)) : true;
    const hr = Math.floor(minutes / 60) % 24;
    const hours = h.hours && typeof h.hours[0] === 'number' && typeof h.hours[1] === 'number' ? h.hours : null;
    const byHour = !hours ? true : hours[0] <= hours[1] ? hr >= hours[0] && hr < hours[1] : hr >= hours[0] || hr < hours[1];
    return byAction && byTag && byHour && (!!h.actions?.length || !!h.tags?.length || !!hours);
}
onAction.push((g, w, a) => {
    if (!on(w))
        return;
    const hs = habitsOf(g);
    const tags = placeOf(g, w, g.player.loc)?.tags ?? [];
    for (const h of w.habits)
        if (matches(h, a, g.minutes, tags)) {
            const l = (hs.log[h.id] ??= []);
            if (l.filter(d => d === g.day).length < 2)
                l.push(g.day); // at most twice a day counts
        }
});
// Each morning: habits that stuck, habits that faded, and what they do to you.
export function habitDay(g, w) {
    if (!on(w))
        return [];
    const hs = habitsOf(g);
    const out = [];
    for (const h of w.habits) {
        const l = (hs.log[h.id] ?? []).filter(d => g.day - d < Math.max(h.days, h.lose ?? h.days * 2));
        hs.log[h.id] = l;
        const recent = l.filter(d => g.day - d < h.days).length;
        const has = hs.has.includes(h.id);
        if (!has && recent >= h.count) {
            hs.has.push(h.id);
            note(g, '{u} has become: {0}.', [h.trait.toLowerCase()], [], g.player.loc, 'skill');
            out.push(`New trait from a habit: ${h.trait}.`);
        }
        else if (has && !l.some(d => g.day - d < (h.lose ?? h.days * 2))) {
            hs.has = hs.has.filter(x => x !== h.id);
            note(g, '{u} is no longer {0}.', [h.trait.toLowerCase()], [], g.player.loc, 'skill');
            out.push(`A habit faded: you are no longer "${h.trait}".`);
        }
        if (hs.has.includes(h.id))
            for (const [id, v] of Object.entries(h.daily ?? {}))
                addStatus(g, w, id, v);
    }
    syncHabitTraits(g, w);
    return out;
}
onDay.push(habitDay);
export const habitTraits = (g, w) => (on(w) ? habitsOf(g).has.map(id => w.habits.find(h => h.id === id)?.trait).filter(Boolean) : []);
// How close you are to each habit (for the Reputation app).
export function habitProgress(g, w) {
    if (!on(w))
        return [];
    const hs = habitsOf(g);
    return w.habits.map(h => ({ h, n: (hs.log[h.id] ?? []).filter(d => g.day - d < h.days).length, has: hs.has.includes(h.id) }));
}
