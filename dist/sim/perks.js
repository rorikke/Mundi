// Life goals' perks and the rewards shop's timed boosts, as two sources of effects (sim/effects.ts) next to the traits'
// one: a finished goal's perk (by the goal's id, never by a trait's name: D-12) and a boost bought with life points,
// each effect held inside its limits (core/goals.ts) and kept only while its own condition holds. Both belong to the
// `goals` system: with it off they give nothing. Also here: the once-a-day reroll a perk can give, and the share a
// perk adds to life points (the points ledger asks `pointsFor`).
import { nowAbs } from '../core/store.js';
import { systemOn, activeStatuses } from '../core/world.js';
import { clampEffect } from '../core/traits.js';
import { goalOf, PERK_LIMITS, BOOST_LIMITS, BOOST_DAYS } from '../core/goals.js';
import { effectSources, effectAdd, effectMul } from './effects.js';
import { whenHolds } from './when.js';
import { onDay } from './hooks.js';
import { goalsState } from './goals.js';
/** The goals whose perks you have, by id: the finished ones (sim/goals.ts; old saves' finished aspirations included,
 *  In top shape as Athlete). Never from a trait's name: a habit called "Athletic" gives nothing (D-12). */
export function perkGoalIds(g, w) { void w; return goalsState(g).done; }
// A perk on a need that isn't in play here does nothing (a drain, a morning's mood: a goal that needs it isn't offered
// either).
const needOff = (g, w, e) => !!e.target && (e.kind === 'drain' || e.kind === 'morning') && w.statuses.some(s => s.id === e.target) && !activeStatuses(w, g).some(s => s.id === e.target);
const holdsNow = (g, w, e, key) => !e.when || whenHolds(g, w, e.when, { key });
/** The effects these goals' perks give right now: each held inside the perk limits, its condition holding. */
export function perkEffects(g, w, ids) {
    const out = [];
    for (const id of new Set(ids)) {
        const p = goalOf(w, id)?.perk;
        for (const [i, e] of (p?.effects ?? []).entries())
            if (!needOff(g, w, e) && holdsNow(g, w, e, `perk|${id}|${i}`))
                out.push(clampEffect(e, PERK_LIMITS));
    }
    return out;
}
export const boostsOf = (g) => (g.boosts ?? []);
/** Starts a boost for `days` days (1–7), its effects held inside the boost limits. Buying it is the shop's business
 *  (sim/rewards.ts): this only keeps it. */
export function addBoost(g, id, effects, days) {
    const d = Math.max(BOOST_DAYS.min, Math.min(BOOST_DAYS.max, Math.round(days)));
    const list = boostsOf(g).filter(b => b.until > nowAbs(g));
    list.push({ id, effects: effects.map(e => clampEffect(e, BOOST_LIMITS)), until: nowAbs(g) + d * 1440 });
    g.boosts = list;
}
/** The effects the boosts going on now give (their conditions holding). */
export function boostEffects(g, w) {
    const now = nowAbs(g), out = [];
    for (const b of boostsOf(g))
        if (b.until > now)
            for (const [i, e] of b.effects.entries())
                if (!needOff(g, w, e) && holdsNow(g, w, e, `boost|${b.id}|${i}`))
                    out.push(e);
    return out;
}
effectSources.push((g, w) => (systemOn(w, 'goals') ? perkEffects(g, w, perkGoalIds(g, w)) : []));
effectSources.push((g, w) => (systemOn(w, 'goals') && g.boosts?.length ? boostEffects(g, w) : []));
// Boosts that ran out are forgotten.
onDay.push(g => { const b = g.boosts; if (b?.length)
    g.boosts = b.filter(x => x.until > nowAbs(g)); return []; });
/* ---------- the reroll and life points ---------- */
/** Once a day per `reroll` effect, a failed roll is rolled again: true (and the reroll used) when one is left today.
 *  Asked only after a roll failed, so with no reroll effect nothing changes, not even the dice. */
export function useReroll(g, w) {
    const n = Math.floor(effectAdd(g, w, 'reroll'));
    if (n < 1)
        return false;
    const r = (g.rerolls ??= { day: g.day, used: 0 });
    if (r.day !== g.day) {
        r.day = g.day;
        r.used = 0;
    }
    if (r.used >= n)
        return false;
    r.used++;
    return true;
}
/** Life points from a source, with what perks add (`points` effects aimed at the source, or at `active` / `passive`). */
export function pointsFor(g, w, source, n) {
    const k = effectMul(g, w, 'points', [source, source === 'step' || source === 'goal' ? 'active' : 'passive']);
    return k === 1 ? n : Math.round(n * k);
}
