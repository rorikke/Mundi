// Life goals' perks and the rewards shop's timed boosts, as two sources of effects (sim/effects.ts) next to the traits'
// one: a finished goal's perk (by the goal's id, never by a trait's name: D-12) and a boost bought with life points,
// each effect held inside its limits (core/goals.ts) and kept only while its own condition holds. Both belong to the
// `goals` system: with it off they give nothing. Also here: the once-a-day reroll a perk can give, and the share a
// perk adds to life points (the points ledger asks `pointsFor`).
import { nowAbs, type Save } from '../core/store.js';
import { systemOn, activeStatuses, type WorldDef } from '../core/world.js';
import { clampEffect, type EffectDef } from '../core/traits.js';
import { goalOf, PERK_LIMITS, BOOST_LIMITS, BOOST_DAYS } from '../core/goals.js';
import { effectSources, effectAdd, effectMul } from './effects.js';
import { whenHolds } from './when.js';
import { onDay } from './hooks.js';

/** The goals whose perks you have, by id (the finished ones). Life goals' state (sim/goals.ts) fills this in; until it
 *  does, nobody has a perk. */
export function perkGoalIds(g: Save, w: WorldDef): string[] { void g; void w; return []; }

// A perk on a need that isn't in play here does nothing (a goal that needs it isn't offered either).
const needOff = (g: Save, w: WorldDef, e: EffectDef) => e.kind === 'drain' && !!e.target && !activeStatuses(w, g).some(s => s.id === e.target);
const holdsNow = (g: Save, w: WorldDef, e: EffectDef, key: string) => !e.when || whenHolds(g, w, e.when, { key });

/** The effects these goals' perks give right now: each held inside the perk limits, its condition holding. */
export function perkEffects(g: Save, w: WorldDef, ids: string[]): EffectDef[] {
    const out: EffectDef[] = [];
    for (const id of new Set(ids)) {
        const p = goalOf(w, id)?.perk;
        for (const [i, e] of (p?.effects ?? []).entries()) if (!needOff(g, w, e) && holdsNow(g, w, e, `perk|${id}|${i}`)) out.push(clampEffect(e, PERK_LIMITS));
    }
    return out;
}

/* ---------- timed boosts ---------- */

/** A boost bought in the rewards shop: its item's id, its effects, until when (absolute game minutes). */
export interface Boost { id: string; effects: EffectDef[]; until: number }
export const boostsOf = (g: Save): Boost[] => ((g as any).boosts ?? []) as Boost[];
/** Starts a boost for `days` days (1–7), its effects held inside the boost limits. Buying it is the shop's business
 *  (sim/rewards.ts): this only keeps it. */
export function addBoost(g: Save, id: string, effects: EffectDef[], days: number) {
    const d = Math.max(BOOST_DAYS.min, Math.min(BOOST_DAYS.max, Math.round(days)));
    const list = boostsOf(g).filter(b => b.until > nowAbs(g));
    list.push({ id, effects: effects.map(e => clampEffect(e, BOOST_LIMITS)), until: nowAbs(g) + d * 1440 });
    (g as any).boosts = list;
}
/** The effects the boosts going on now give (their conditions holding). */
export function boostEffects(g: Save, w: WorldDef): EffectDef[] {
    const now = nowAbs(g), out: EffectDef[] = [];
    for (const b of boostsOf(g)) if (b.until > now) for (const [i, e] of b.effects.entries()) if (!needOff(g, w, e) && holdsNow(g, w, e, `boost|${b.id}|${i}`)) out.push(e);
    return out;
}

effectSources.push((g, w) => (systemOn(w, 'goals') ? perkEffects(g, w, perkGoalIds(g, w)) : []));
effectSources.push((g, w) => (systemOn(w, 'goals') && (g as any).boosts?.length ? boostEffects(g, w) : []));
// Boosts that ran out are forgotten.
onDay.push(g => { const b = (g as any).boosts as Boost[] | undefined; if (b?.length) (g as any).boosts = b.filter(x => x.until > nowAbs(g)); return []; });

/* ---------- the reroll and life points ---------- */

/** Once a day per `reroll` effect, a failed roll is rolled again: true (and the reroll used) when one is left today.
 *  Asked only after a roll failed, so with no reroll effect nothing changes, not even the dice. */
export function useReroll(g: Save, w: WorldDef | null | undefined): boolean {
    const n = Math.floor(effectAdd(g, w, 'reroll'));
    if (n < 1) return false;
    const r = ((g as any).rerolls ??= { day: g.day, used: 0 }) as { day: number; used: number };
    if (r.day !== g.day) { r.day = g.day; r.used = 0; }
    if (r.used >= n) return false;
    r.used++;
    return true;
}
/** Where life points come from: a step or a finished goal (the active goal's gains), or a second source. */
export type PointSource = 'step' | 'goal' | 'festival' | 'event' | 'story' | 'secret' | 'thread' | 'keepsake';
/** Life points from a source, with what perks add (`points` effects aimed at the source, or at `active` / `passive`). */
export function pointsFor(g: Save, w: WorldDef | null | undefined, source: PointSource, n: number): number {
    const k = effectMul(g, w, 'points', [source, source === 'step' || source === 'goal' ? 'active' : 'passive']);
    return k === 1 ? n : Math.round(n * k);
}
