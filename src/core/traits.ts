// What a trait can mean in a world besides its name: a short description, what it does (effects from a fixed list) and,
// for an interest, what it covers. This file holds the shapes, the list of effect kinds and the bounds every source of
// effects stays inside; sim/effects.ts reads them, and the values for the standard names (Calm, Shy, Music…) are filled
// in by the traits session. Life goals' perks use the same `EffectDef`, with bounds of their own in core/goals.ts.

/** What an effect changes. `mul` kinds are percentages that multiply (+0.1 is +10%); `add` kinds are flat amounts that
 *  add (`roll`, `warm`, `morning`, `reroll`). `target` says which one: a need for `drain`, a skill for `learn`/`roll`,
 *  `friend`/`romance` for `gain`… A world's `traitInfo` may use the kinds the traits need (all but the last six); the rest are
 *  for life goals' perks. */
export type EffectKind =
    | 'drain'    // how fast a need drops (target: a need id; a `when` of `period: night` for night only)
    | 'learn'    // skill training (target: a skill id, `all`, or `upto:3`: only while the skill is below level 3)
    | 'roll'     // a flat bonus on rolls (target: a skill id or an action tag; none: every roll)
    | 'perf'     // performance gains at work
    | 'career'   // days a rank takes
    | 'warm'     // friendship points you start with someone you first meet (target: `new`; negative: a cooler first impression)
    | 'gain'     // friendship or romance gains toward you (target: `friend`, `romance`, `dates`, `gifts`, `good friends`)
    | 'fade'     // how fast friendship or romance fades (target: `friend`, `romance`)
    | 'morning'  // a flat mood change each morning (a `when` can limit it: out of work)
    | 'party'    // the mood a party gives
    | 'study'    // what a study session is worth
    | 'price' | 'pay' | 'travel' | 'rest' | 'reroll' | 'points';   // life goals' perks fill in the last six

export interface EffectDef {
    kind: EffectKind;
    target?: string;
    /** `mul` kinds: a share (−0.1 is −10%). `add` kinds: an amount. */
    value: number;
    /** Only while this holds (the condition grammar, `sim/when.ts`); read by the source that lists the effect. */
    when?: string;
}

interface Kind { mode: 'mul' | 'add'; min: number; max: number }
/** How each kind combines, and the most any pile of effects may make it: a product of (1 + value) for `mul`, a sum for
 *  `add`. Keeps a stack of small effects from running away. */
export const EFFECT_KINDS: Record<EffectKind, Kind> = {
    drain: { mode: 'mul', min: 0.4, max: 2 }, learn: { mode: 'mul', min: 0.5, max: 2.5 }, roll: { mode: 'add', min: -4, max: 6 },
    perf: { mode: 'mul', min: 0.5, max: 2 }, career: { mode: 'mul', min: 0.5, max: 1.5 }, warm: { mode: 'add', min: -3, max: 5 },
    gain: { mode: 'mul', min: 0.5, max: 2 }, fade: { mode: 'mul', min: 0.3, max: 2 }, morning: { mode: 'add', min: -10, max: 10 },
    party: { mode: 'mul', min: 0.5, max: 2 }, study: { mode: 'mul', min: 0.5, max: 2 }, price: { mode: 'mul', min: 0.5, max: 1.5 },
    pay: { mode: 'mul', min: 0.75, max: 1.5 }, travel: { mode: 'mul', min: 0.5, max: 1.5 }, rest: { mode: 'mul', min: 0.5, max: 2 },
    reroll: { mode: 'add', min: 0, max: 3 }, points: { mode: 'mul', min: 0.5, max: 2 },
};
export const isEffectKind = (k: unknown): k is EffectKind => typeof k === 'string' && Object.prototype.hasOwnProperty.call(EFFECT_KINDS, k);

/** What one source may give per effect: a trait's effect stays within ±15% (flat ±1). Perks get their own, larger
 *  limits in core/goals.ts. */
export interface EffectLimits { pct: number; flat: number }
export const TRAIT_LIMITS: EffectLimits = { pct: 0.15, flat: 1 };

/** An effect with its value held inside a source's limits. */
export function clampEffect(e: EffectDef, lim: EffectLimits): EffectDef {
    const m = EFFECT_KINDS[e.kind].mode === 'mul' ? lim.pct : lim.flat;
    return { ...e, value: Math.max(-m, Math.min(m, e.value)) };
}
/** A list of effects from a world file, made safe: unknown kinds and values that aren't numbers are dropped, the rest
 *  held inside the limits. */
export function cleanEffects(list: unknown, lim: EffectLimits = TRAIT_LIMITS): EffectDef[] {
    if (!Array.isArray(list)) return [];
    const out: EffectDef[] = [];
    for (const e of list) {
        if (!e || typeof e !== 'object' || !isEffectKind(e.kind) || typeof e.value !== 'number' || !Number.isFinite(e.value)) continue;
        out.push(clampEffect({ kind: e.kind, ...(typeof e.target === 'string' && e.target ? { target: e.target } : {}), value: e.value, ...(typeof e.when === 'string' && e.when ? { when: e.when } : {}) }, lim));
    }
    return out;
}

/** What an interest covers: doing something that fits it lifts mood a little more (skills it trains, tags of the
 *  action or its place). */
export interface TraitCovers { skills?: string[]; tags?: string[] }
/** A trait's meaning in a world (`WorldDef.traitInfo`, by trait name). */
export interface TraitInfo { desc?: string; effects?: EffectDef[]; covers?: TraitCovers }

/** The standard names' info (Calm, Shy, Music…), given to every world that has those names unless its own `traitInfo`
 *  has an entry for the name. Empty until the traits session fills in the values. */
export const STANDARD_TRAIT_INFO: Record<string, TraitInfo> = {};

/** A world's `traitInfo` made safe (bad effects dropped, values inside the limits), with the standard names it
 *  doesn't override added for the trait names the world's character sheet offers. Nothing to add and nothing there:
 *  undefined, so a world stays exactly as it was. */
export function upgradeTraitInfo(own: Record<string, TraitInfo> | undefined, offered: string[]): Record<string, TraitInfo> | undefined {
    const out: Record<string, TraitInfo> = {};
    for (const [name, info] of Object.entries(own ?? {})) {
        if (!info || typeof info !== 'object') continue;
        const x: TraitInfo = {};
        if (typeof info.desc === 'string') x.desc = info.desc;
        if (info.effects !== undefined) x.effects = cleanEffects(info.effects);
        if (info.covers && typeof info.covers === 'object') x.covers = { ...(Array.isArray(info.covers.skills) ? { skills: info.covers.skills.filter(s => typeof s === 'string') } : {}), ...(Array.isArray(info.covers.tags) ? { tags: info.covers.tags.filter(s => typeof s === 'string') } : {}) };
        out[name] = x;
    }
    for (const name of offered) if (!(name in out) && Object.prototype.hasOwnProperty.call(STANDARD_TRAIT_INFO, name)) out[name] = structuredClone(STANDARD_TRAIT_INFO[name]);
    return Object.keys(out).length ? out : undefined;
}
