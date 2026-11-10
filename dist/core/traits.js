// What a trait can mean in a world besides its name: a short description, what it does (effects from a fixed list) and,
// for an interest, what it covers. This file holds the shapes, the list of effect kinds and the bounds every source of
// effects stays inside; sim/effects.ts reads them, and the values for the standard names (Calm, Shy, Music…) are filled
// in by the traits session. Life goals' perks use the same `EffectDef`, with bounds of their own in core/goals.ts.
/** How each kind combines, and the most any pile of effects may make it: a product of (1 + value) for `mul`, a sum for
 *  `add`. Keeps a stack of small effects from running away. */
export const EFFECT_KINDS = {
    drain: { mode: 'mul', min: 0.4, max: 2 }, learn: { mode: 'mul', min: 0.5, max: 2.5 }, roll: { mode: 'add', min: -4, max: 6 },
    perf: { mode: 'mul', min: 0.5, max: 2 }, career: { mode: 'mul', min: 0.5, max: 1.5 }, warm: { mode: 'add', min: -3, max: 5 },
    gain: { mode: 'mul', min: 0.5, max: 2 }, fade: { mode: 'mul', min: 0.3, max: 2 }, morning: { mode: 'add', min: -10, max: 10 },
    party: { mode: 'mul', min: 0.5, max: 2 }, study: { mode: 'mul', min: 0.5, max: 2 }, price: { mode: 'mul', min: 0.5, max: 1.5 },
    pay: { mode: 'mul', min: 0.75, max: 1.5 }, travel: { mode: 'mul', min: 0.5, max: 1.5 }, rest: { mode: 'mul', min: 0.5, max: 2 },
    reroll: { mode: 'add', min: 0, max: 3 }, points: { mode: 'mul', min: 0.5, max: 2 },
};
export const isEffectKind = (k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(EFFECT_KINDS, k);
export const TRAIT_LIMITS = { pct: 0.15, flat: 1 };
/** An effect with its value held inside a source's limits. */
export function clampEffect(e, lim) {
    const m = EFFECT_KINDS[e.kind].mode === 'mul' ? lim.pct : lim.flat;
    return { ...e, value: Math.max(-m, Math.min(m, e.value)) };
}
/** A list of effects from a world file, made safe: unknown kinds and values that aren't numbers are dropped, the rest
 *  held inside the limits. */
export function cleanEffects(list, lim = TRAIT_LIMITS) {
    if (!Array.isArray(list))
        return [];
    const out = [];
    for (const e of list) {
        if (!e || typeof e !== 'object' || !isEffectKind(e.kind) || typeof e.value !== 'number' || !Number.isFinite(e.value))
            continue;
        out.push(clampEffect({ kind: e.kind, ...(typeof e.target === 'string' && e.target ? { target: e.target } : {}), value: e.value, ...(typeof e.when === 'string' && e.when ? { when: e.when } : {}) }, lim));
    }
    return out;
}
/** The standard names' info (Calm, Shy, Music…), given to every world that has those names unless its own `traitInfo`
 *  has an entry for the name. Empty until the traits session fills in the values. */
export const STANDARD_TRAIT_INFO = {};
/** A world's `traitInfo` made safe (bad effects dropped, values inside the limits), with the standard names it
 *  doesn't override added for the trait names the world's character sheet offers. Nothing to add and nothing there:
 *  undefined, so a world stays exactly as it was. */
export function upgradeTraitInfo(own, offered) {
    const out = {};
    for (const [name, info] of Object.entries(own ?? {})) {
        if (!info || typeof info !== 'object')
            continue;
        const x = {};
        if (typeof info.desc === 'string')
            x.desc = info.desc;
        if (info.effects !== undefined)
            x.effects = cleanEffects(info.effects);
        if (info.covers && typeof info.covers === 'object')
            x.covers = { ...(Array.isArray(info.covers.skills) ? { skills: info.covers.skills.filter(s => typeof s === 'string') } : {}), ...(Array.isArray(info.covers.tags) ? { tags: info.covers.tags.filter(s => typeof s === 'string') } : {}) };
        out[name] = x;
    }
    for (const name of offered)
        if (!(name in out) && Object.prototype.hasOwnProperty.call(STANDARD_TRAIT_INFO, name))
            out[name] = structuredClone(STANDARD_TRAIT_INFO[name]);
    return Object.keys(out).length ? out : undefined;
}
