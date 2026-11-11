// What a trait can mean in a world besides its name: a short description, what it does (effects from a fixed list) and,
// for an interest, what it covers. This file holds the shapes, the list of effect kinds and the bounds every source of
// effects stays inside; sim/effects.ts reads them, and the values for the standard names (Calm, Shy, Music…) are at the
// bottom. Life goals' perks use the same `EffectDef`, with bounds of their own in core/goals.ts.

/** What an effect changes. `mul` kinds are percentages that multiply (+0.1 is +10%); `add` kinds are flat amounts that
 *  add (`roll`, `warm`, `morning`, `reroll`, `interview`). `target` says which one: a need for `drain`, a skill for
 *  `learn`/`roll`, `friend`/`romance` for `gain`… An effect with no target (or `all`) counts everywhere its kind is asked.
 *  A world's `traitInfo` may use the kinds the traits need (all but the last eight); the rest are for life goals' perks
 *  and timed boosts. */
export type EffectKind =
    | 'drain'    // how fast a need drops (target: a need id; a `when` of `period: night` for night only)
    | 'learn'    // skill training (target: a skill id, a group of skills such as `creative`, `all`, or `upto:3`: only while the skill is below level 3)
    | 'roll'     // a flat bonus on rolls (target: a skill id or its group (`creative`), an action tag, `work` for a choice at work; none: every roll)
    | 'perf'     // performance gains at work
    | 'career'   // days a rank takes
    | 'warm'     // friendship points you start with someone you first meet (target: `new`; negative: a cooler first impression)
    | 'gain'     // friendship or romance gains toward you (target: `friend`, `romance`, `dates`, `gifts`, `good friends`)
    | 'fade'     // how fast romance toward you fades (target: `romance`; `partner`: only your partners')
    | 'morning'  // a flat mood change each morning (a `when` can limit it: out of work)
    | 'party'    // the mood a party gives
    | 'study'    // what a study session is worth (target: `class`, a course's class; `teach`, a lesson you give an apprentice)
    // the rest: life goals' perks and timed boosts
    | 'price'    // what things cost (target: `prices` for what places and actions charge, a place id or tag, a map id or area, `regular` where you're a regular; `rent`, `bills`)
    | 'pay'      // what work pays (target: `wage`, `bonus` for the seasonal bonuses, `tips` for money from a choice at work; a job id, its place id or tag)
    | 'travel'   // how long trips take
    | 'rest'     // what a night, a bath or food gives back (target: `sleep`, `sleep home`, `sleep away`; `bath`; `food`; an action id or tag)
    | 'reroll'   // failed rolls rolled again, this many a day
    | 'points'   // life points (target: where they come from: `step`, `goal`, `festival`, `event`, `story`, `secret`, `thread`, `keepsake`; a group: `festivals` (festival, event), `secrets` (secret, story, thread); or `active`, `passive`)
    | 'interview'   // a flat bonus on job interviews (target: a job id)
    | 'hint';   // on at 1 or more: a friend's hidden secret shows in small signs (told to the AI as hinted; no target)

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
    reroll: { mode: 'add', min: 0, max: 3 }, points: { mode: 'mul', min: 0.5, max: 2 }, interview: { mode: 'add', min: -4, max: 6 },
    hint: { mode: 'add', min: 0, max: 1 },
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
 *  has an entry for the name. Small on purpose: a trait's effect is about half a life-goal perk. Where a number in the
 *  requirements' table has no base in the engine, it is a flat amount:
 *  - `warm new`: friendship points at a first meeting; ±1 point stands for "±10%" of what a first meeting is worth (a
 *    line you say is worth 0.5).
 *  - `fade romance`: today only romance fades (friendship toward you never does), so Shy's "friendships fade slower"
 *    holds on to love, by the most a trait may give (−15%).
 *  - a flat value is held to ±1, so Ambitious's "mood −2" is −1.
 *  `when: OUT_OF_WORK` is read by the trait source itself (sim/traits.ts): the condition grammar has no such key. */
export const OUT_OF_WORK = 'out of work';
export const STANDARD_TRAIT_INFO: Record<string, TraitInfo> = {
    // personality
    'Outgoing': { desc: 'Easy with new people: a warmer first impression, and friendships grow a little faster.', effects: [{ kind: 'warm', target: 'new', value: 1 }, { kind: 'gain', target: 'friend', value: 0.05 }] },
    'Shy': { desc: 'Slow to open up, but holds on to love: a cooler first impression, and romance fades more slowly.', effects: [{ kind: 'warm', target: 'new', value: -1 }, { kind: 'fade', target: 'romance', value: -0.15 }] },
    'Calm': { desc: 'Hard to rattle: mood drains 10% slower.', effects: [{ kind: 'drain', target: 'mood', value: -0.1 }] },
    'Hot-headed': { desc: 'Quick to act: +1 on fitness and dance, but mood drains 10% faster.', effects: [{ kind: 'roll', target: 'fitness', value: 1 }, { kind: 'roll', target: 'dance', value: 1 }, { kind: 'drain', target: 'mood', value: 0.1 }] },
    'Cheerful': { desc: 'Wakes up in a good mood: +1 mood every morning.', effects: [{ kind: 'morning', target: 'mood', value: 1 }] },
    'Serious': { desc: 'Takes work seriously: performance grows 10% faster, but parties give 10% less mood.', effects: [{ kind: 'perf', target: 'gain', value: 0.1 }, { kind: 'party', target: 'mood', value: -0.1 }] },
    'Romantic': { desc: 'Makes dates count: romance from dates +10%.', effects: [{ kind: 'gain', target: 'dates', value: 0.1 }] },
    'Ambitious': { desc: 'Wants to rise: ranks take 5% less time, but a morning without a job costs 1 mood.', effects: [{ kind: 'career', target: 'rank', value: -0.05 }, { kind: 'morning', target: 'mood', value: -1, when: OUT_OF_WORK }] },
    'Lazy': { desc: 'Takes it easy: energy drains 10% slower, but performance grows 10% slower.', effects: [{ kind: 'drain', target: 'energy', value: -0.1 }, { kind: 'perf', target: 'gain', value: -0.1 }] },
    'Curious': { desc: 'Always learning: skills train 15% faster up to level 3.', effects: [{ kind: 'learn', target: 'upto:3', value: 0.15 }] },
    'Kind': { desc: 'Generous: gifts give 10% more friendship.', effects: [{ kind: 'gain', target: 'gifts', value: 0.1 }] },
    'Sarcastic': { desc: 'A sharp tongue: friendships with good friends grow 10% faster, first impressions are cooler.', effects: [{ kind: 'gain', target: 'good friends', value: 0.1 }, { kind: 'warm', target: 'new', value: -1 }] },
    // interests: doing something that fits one lifts mood a little more
    'Music': { desc: 'Playing or singing lifts your mood a little more.', covers: { skills: ['music', 'singing'] } },
    'Karaoke': { desc: 'Singing lifts your mood a little more.', covers: { skills: ['singing'], tags: ['karaoke'] } },
    'Games': { desc: 'Playing games lifts your mood a little more.', covers: { skills: ['gaming'] } },
    'Technology': { desc: 'Tinkering and puzzling lift your mood a little more.', covers: { skills: ['logic', 'gaming'], tags: ['tech'] } },
    'Books': { desc: 'Reading and writing lift your mood a little more.', covers: { skills: ['writing'], tags: ['library', 'books'] } },
    'Reading': { desc: 'Reading lifts your mood a little more.', covers: { tags: ['library', 'books'] } },
    'Anime & manga': { desc: 'Drawing and everything anime lift your mood a little more.', covers: { skills: ['drawing'], tags: ['anime', 'manga'] } },
    'Art': { desc: 'Making art lifts your mood a little more.', covers: { skills: ['drawing', 'painting'], tags: ['gallery', 'museum'] } },
    'Cooking': { desc: 'Cooking lifts your mood a little more.', covers: { skills: ['cooking'] } },
    'Fashion': { desc: 'Clothes and style lift your mood a little more.', covers: { skills: ['fashion'], tags: ['fashion'] } },
    'Sports': { desc: 'Working out and playing sports lift your mood a little more.', covers: { skills: ['fitness'], tags: ['sport'] } },
    'Nightlife': { desc: 'A night out lifts your mood a little more.', covers: { tags: ['bar', 'club', 'nightlife'] } },
    'Nature': { desc: 'Being out in nature lifts your mood a little more.', covers: { tags: ['park', 'nature', 'garden'] } },
    'Movies': { desc: 'A film lifts your mood a little more.', covers: { tags: ['cinema', 'movies'] } },
    'Travel': { desc: 'Getting away lifts your mood a little more.', covers: { tags: ['travel'] } },
    'Dancing': { desc: 'Dancing lifts your mood a little more.', covers: { skills: ['dance'] } },
    'Swordplay': { desc: 'Training with a blade lifts your mood a little more.', covers: { tags: ['sword', 'arms'] } },
    'Riding': { desc: 'Riding lifts your mood a little more.', covers: { tags: ['riding', 'stable'] } },
    'Hunting': { desc: 'The hunt lifts your mood a little more.', covers: { tags: ['hunting', 'forest'] } },
    'Herbs': { desc: 'Herb lore lifts your mood a little more.', covers: { tags: ['herbs', 'garden'] } },
    'Fishing': { desc: 'A day by the water lifts your mood a little more.', covers: { tags: ['fishing', 'water'] } },
    'Faith': { desc: 'Prayer and quiet places lift your mood a little more.', covers: { tags: ['temple', 'shrine', 'church'] } },
    'Crafts': { desc: 'Making things by hand lifts your mood a little more.', covers: { tags: ['craft', 'workshop'] } },
    'Cards and dice': { desc: 'A game of chance lifts your mood a little more.', covers: { tags: ['tavern', 'casino'] } },
};

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
