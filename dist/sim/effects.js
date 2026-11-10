import { EFFECT_KINDS } from '../core/traits.js';
import { onDay, decayMods } from './hooks.js';
import { addStatus } from './needs.js';
export const effectSources = [];
// An effect applies when it names nothing (or `all`) or one of the targets asked about; `upto:N` applies while the
// skill being trained is below level N.
function matches(e, targets, ctx) {
    const t = e.target;
    if (!t || t === 'all')
        return true;
    if (t.startsWith('upto:'))
        return ctx.level !== undefined && ctx.level < Number(t.slice(5));
    return targets.includes(t);
}
/** The effects of this kind that apply to what's asked about (`target`: one id, or a list: a skill and its action's tags). */
export function effectsFor(g, w, kind, target, ctx = {}) {
    if (!w || !effectSources.length)
        return [];
    const targets = (Array.isArray(target) ? target : [target]).filter((t) => !!t);
    const out = [];
    for (const src of effectSources)
        for (const e of src(g, w))
            if (e.kind === kind && matches(e, targets, ctx))
                out.push(e);
    return out;
}
/** The multiplier for a kind: each effect's (1 + value) multiplied, then held inside the kind's bounds. ×1 with none. */
export function effectMul(g, w, kind, target, ctx) {
    const list = effectsFor(g, w, kind, target, ctx);
    if (!list.length)
        return 1;
    const k = EFFECT_KINDS[kind];
    return Math.max(k.min, Math.min(k.max, list.reduce((m, e) => m * (1 + e.value), 1)));
}
/** The flat amount for a kind: the values added, then held inside the kind's bounds. +0 with none. */
export function effectAdd(g, w, kind, target, ctx) {
    const list = effectsFor(g, w, kind, target, ctx);
    if (!list.length)
        return 0;
    const k = EFFECT_KINDS[kind];
    return Math.max(k.min, Math.min(k.max, list.reduce((s, e) => s + e.value, 0)));
}
// Needs drain at the rate the effects say (the same hook a heatwave uses).
decayMods.push((g, w, status) => effectMul(g, w, 'drain', status));
// Each morning: a flat change of mood (cheerful people wake up better).
onDay.push((g, w) => { const m = effectAdd(g, w, 'morning', 'mood'); if (m)
    addStatus(g, w, 'mood', m); return []; });
