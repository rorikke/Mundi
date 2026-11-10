// Small effects on the game's numbers from where you are in life: personality and habits now, finished life goals'
// perks and timed boosts later. Systems ask one question at the place they own a number ("how much faster does this
// drain?", "what's added to this roll?") and every source that has an answer is combined here: percentages multiply,
// flat amounts add, and the total stays inside the bounds in core/traits.ts. With no source giving anything, the
// answer is exactly ×1 or +0, so a hook call in the middle of an existing formula changes nothing until a source speaks.
import type { Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { EFFECT_KINDS, type EffectDef, type EffectKind } from '../core/traits.js';
import { onDay, decayMods } from './hooks.js';
import { addStatus } from './needs.js';

/** Who gives effects: a function of the game and the world listing the effects that hold right now (conditions
 *  included). The traits register theirs when `sim/traits.ts` loads, perks and boosts when life goals do. */
export type EffectSource = (g: Save, w: WorldDef) => EffectDef[];
export const effectSources: EffectSource[] = [];

/** What a hook call says about the moment: `level` is the level of the skill being trained (for `upto:3`). */
export interface EffectCtx { level?: number }

// An effect applies when it names nothing (or `all`) or one of the targets asked about; `upto:N` applies while the
// skill being trained is below level N.
function matches(e: EffectDef, targets: string[], ctx: EffectCtx): boolean {
    const t = e.target;
    if (!t || t === 'all') return true;
    if (t.startsWith('upto:')) return ctx.level !== undefined && ctx.level < Number(t.slice(5));
    return targets.includes(t);
}
/** The effects of this kind that apply to what's asked about (`target`: one id, or a list: a skill and its action's tags). */
export function effectsFor(g: Save, w: WorldDef | null | undefined, kind: EffectKind, target?: string | (string | undefined)[], ctx: EffectCtx = {}): EffectDef[] {
    if (!w || !effectSources.length) return [];
    const targets = (Array.isArray(target) ? target : [target]).filter((t): t is string => !!t);
    const out: EffectDef[] = [];
    for (const src of effectSources) for (const e of src(g, w)) if (e.kind === kind && matches(e, targets, ctx)) out.push(e);
    return out;
}
/** The multiplier for a kind: each effect's (1 + value) multiplied, then held inside the kind's bounds. ×1 with none. */
export function effectMul(g: Save, w: WorldDef | null | undefined, kind: EffectKind, target?: string | (string | undefined)[], ctx?: EffectCtx): number {
    const list = effectsFor(g, w, kind, target, ctx);
    if (!list.length) return 1;
    const k = EFFECT_KINDS[kind];
    return Math.max(k.min, Math.min(k.max, list.reduce((m, e) => m * (1 + e.value), 1)));
}
/** The flat amount for a kind: the values added, then held inside the kind's bounds. +0 with none. */
export function effectAdd(g: Save, w: WorldDef | null | undefined, kind: EffectKind, target?: string | (string | undefined)[], ctx?: EffectCtx): number {
    const list = effectsFor(g, w, kind, target, ctx);
    if (!list.length) return 0;
    const k = EFFECT_KINDS[kind];
    return Math.max(k.min, Math.min(k.max, list.reduce((s, e) => s + e.value, 0)));
}

// Needs drain at the rate the effects say (the same hook a heatwave uses).
decayMods.push((g, w, status) => effectMul(g, w, 'drain', status));
// Each morning: a flat change of mood (cheerful people wake up better).
onDay.push((g, w) => { const m = effectAdd(g, w, 'morning', 'mood'); if (m) addStatus(g, w, 'mood', m); return []; });
