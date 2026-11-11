// Who you are: strengths (what you're good at when a game starts: they become skill levels), personality (small effects
// on the game's numbers, through the effects engine), interests (doing something that fits one lifts your mood a
// little more), habits (their skill trains a little faster while you keep them) and, with adult content and Desire in
// play, the Drive (how fast Desire drains and what a night gives: sim/drive.ts uses it). Also what the AI is told about
// you every turn, swapping a trait later (life goals' "Change a trait"), and `settleTraits`, which brings a save made
// under the old rules (every trait a flat bonus, courses and goals handing out traits) onto the new ones once its
// world is known.
import { adultOn, type Save } from '../core/store.js';
import { systemOn, activeStatuses, getWorld, type WorldDef, type TraitGroup } from '../core/world.js';
import { clampEffect, TRAIT_LIMITS, OUT_OF_WORK, type EffectDef } from '../core/traits.js';
import { effectSources } from './effects.js';
import { onAction } from './hooks.js';
import { habitsOf, habitTraits, syncHabitTraits } from './habits.js';
import { setSkillLevel, skillDef, hobbyFor, MAX_LEVEL } from './hobbies.js';
import { whenHolds } from './when.js';
import { placeOf } from './places.js';
import { addStatus } from './needs.js';
import { note } from './facts.js';

/** How much more mood a matching interest gives (once per action, however many interests match). */
export const INTEREST_MOOD = 3;
/** A habit trains its skill this much faster while you keep it. */
export const HABIT_LEARN = 0.1;

const names = (list: unknown): string[] => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
/** Every trait name the player has, once each, whatever the group. */
export const traitNames = (g: Save): string[] => [...new Set(Object.values(g.player.traits ?? {}).flatMap(names))];

/* ---------- adult groups and options ---------- */

// The trait names only adult content offers: an adult group's options, every group's `adultOptions`.
const adultNames = (w: WorldDef): Set<string> => new Set((w.sheet?.traits ?? []).flatMap(t => [...(t.adult ? t.options ?? [] : []), ...names(t.adultOptions)]));
/** Is this trait name one only adult content offers? */
export const isAdultTrait = (w: WorldDef | null | undefined, name: string) => !!w && adultNames(w).has(name);
/** The character sheet's groups as a game shows them: with adult content on, adult groups too and each group's adult
 *  options after its own; with it off, neither (the groups given back as they are). `desire` false: Desire won't be in
 *  play (a new game with the need switched off), so no Drive group either (`desireOffered`). */
export const sheetGroups = (w: WorldDef | null | undefined, adult: boolean, desire = true): TraitGroup[] =>
    (w?.sheet?.traits ?? []).filter(t => (adult || !t.adult) && (desire || !isDriveGroup(t))).map(t => (adult && t.adultOptions?.length ? { ...t, options: [...t.options, ...t.adultOptions.filter(o => !t.options.includes(o))] } : t));
/** The options of a group you can have in this game (adult ones only with adult content on; the Drive's only with Desire
 *  in play). */
export const groupOptions = (g: Save, t: TraitGroup): string[] => (isDriveGroup(t) && !desireOn(g, getWorld(g.world)) ? [] : adultOn(g) ? [...t.options, ...names(t.adultOptions).filter(o => !t.options.includes(o))] : t.adult ? [] : t.options);
/** The trait names the player has that count in this game: adult ones only with adult content on (a game can switch it
 *  off later; what you have stays, and counts again when it's back on). */
export const traitsInPlay = (g: Save, w: WorldDef): string[] => { const all = traitNames(g), s = adultNames(w); return !s.size || adultOn(g) ? all : all.filter(t => !s.has(t)); };

/* ---------- strengths: picks that become skill levels ---------- */

/** The groups of a world's character sheet that are strengths (their options stand for skill levels). */
export const strengthGroups = (w: WorldDef | null | undefined): TraitGroup[] => (w?.sheet?.traits ?? []).filter(t => t.skills && Object.keys(t.skills).length);

/** What a strengths option gives, only for skills the world has; null when the world maps it to nothing (it stays a
 *  trait). Options no longer offered (`formerly`) still map, so old saves and persona sheets convert. */
export function strengthOf(w: WorldDef | null | undefined, name: string): Record<string, number> | null {
    const lower = name.toLowerCase();
    for (const grp of strengthGroups(w)) {
        const key = Object.keys(grp.skills!).find(k => k === name) ?? Object.keys(grp.skills!).find(k => k.toLowerCase() === lower);
        if (!key) continue;
        const out: Record<string, number> = {};
        for (const [id, n] of Object.entries(grp.skills![key] ?? {})) if (skillDef(w, id) && Number.isFinite(Number(n))) out[id] = Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(n))));
        return Object.keys(out).length ? out : null;
    }
    return null;
}
/** A strengths option as chips say it: "Cooking 3" ('' for an option that isn't one). */
export const strengthText = (w: WorldDef | null | undefined, name: string): string => Object.entries(strengthOf(w, name) ?? {}).map(([id, n]) => `${skillDef(w, id)?.name ?? id} ${n}`).join(', ');

/** The skill levels a set of picks gives (a list of names, or a hero's `traits` by group; only strengths groups count).
 *  Two picks on one skill don't stack past the better one plus 1 (Strong and Athletic: Fitness 4). */
export function strengthLevels(w: WorldDef | null | undefined, picks: string[] | Record<string, string[]>): Record<string, number> {
    const list = Array.isArray(picks) ? picks : strengthGroups(w).flatMap(grp => names((picks as Record<string, string[]>)?.[grp.id]));
    const per: Record<string, number[]> = {};
    for (const name of new Set(list)) for (const [id, n] of Object.entries(strengthOf(w, name) ?? {})) (per[id] ??= []).push(n);
    const out: Record<string, number> = {};
    for (const [id, ns] of Object.entries(per)) out[id] = Math.min(MAX_LEVEL, Math.max(...ns) + (ns.length > 1 ? 1 : 0));
    return out;
}
/** The picks a world maps to skills, and the rest: only the rest stays a trait. */
export function splitStrengths(w: WorldDef | null | undefined, list: string[]): { mapped: string[]; rest: string[] } {
    const mapped = list.filter(n => strengthOf(w, n)), rest = list.filter(n => !strengthOf(w, n));
    return { mapped, rest };
}
/** A new game's traits as the save keeps them: picks the world maps to skills are gone (they became levels). */
export function withoutStrengths(w: WorldDef, traits: Record<string, string[]>): Record<string, string[]> {
    const out: Record<string, string[]> = JSON.parse(JSON.stringify(traits ?? {}));
    for (const [k, v] of Object.entries(out)) out[k] = splitStrengths(w, names(v)).rest;
    return out;
}
/** Raises the skills the picks stand for to at least their levels (never lowers one); the notes say what rose. */
export function applyStrengths(g: Save, w: WorldDef, picks: string[] | Record<string, string[]>): void {
    for (const [id, n] of Object.entries(strengthLevels(w, picks))) setSkillLevel(g, id, n);
}

/* ---------- the Drive (adult content, with Desire in play) ---------- */

/** How much Desire the player has (design 2c): the adult trait group `drive`, one pick, Average without one. */
export type Drive = 'low' | 'average' | 'high';
export const DRIVE_GROUP = 'drive';
/** What each drive does. `drain`: Desire's drain (×); `restless`: the world's empty-Desire mood drain, its amount and its
 *  period (×); `afterglow`: how much slower mood drains while Desire is 70 or more; `alone`: what being alone (an action
 *  tagged `solo`) gives back of Desire (×; the world writes Average's); `mood` and `romance`: a private action's mood (×)
 *  and the romance it gives (a `gain` effect aimed at `intimate`). `ai`: what the AI is told. Every drive has a cost:
 *  per night, the afterglow comes out about the same (72 h × 5%, 36 h × 10%, 22 h × 15%). */
export const PLAYER_DRIVE: Record<Drive, { drain: number; restless: { amount: number; every: number }; afterglow: number; alone: number; mood: number; romance: number; ai: string }> = {
    low: { drain: 0.5, restless: { amount: 0.5, every: 1 }, afterglow: 0.05, alone: 4 / 3, mood: 0.8, romance: -0.1, ai: "{{user}} doesn't think about sex much; when it happens it's nice, not urgent." },
    average: { drain: 1, restless: { amount: 1, every: 1 }, afterglow: 0.1, alone: 1, mood: 1, romance: 0, ai: '' },
    high: { drain: 1.6, restless: { amount: 1, every: 2 / 3 }, afterglow: 0.15, alone: 2 / 3, mood: 1.25, romance: 0.1, ai: '{{user}} has a high sex drive: thinks about it a lot, wants it often, ready again soon.' },
};
/** Is Desire in play in this game (adult content on, the need on)? Without it there is no Drive and no afterglow. */
export const desireOn = (g: Save, w: WorldDef | null | undefined): boolean => !!w && adultOn(g) && activeStatuses(w, g).some(s => s.id === 'desire');
/** Will Desire be in play in a new game of this world (for the new game's sheet, before there's a save)? */
export const desireOffered = (w: WorldDef | null | undefined, adult: boolean): boolean => !!w && adult && activeStatuses(w, { cfg: { adult: true } }).some(s => s.id === 'desire');
const isDriveGroup = (t: TraitGroup) => t.id === DRIVE_GROUP && !!t.adult;
const driveGroup = (w: WorldDef) => (w.sheet?.traits ?? []).find(isDriveGroup);
/** The player's drive, or null while Desire isn't in play. A pick is read by its words (Low drive, High…), else by its
 *  place among the group's three options; no pick (or no such group) is Average. */
export function playerDrive(g: Save, w: WorldDef | null | undefined): Drive | null {
    if (!desireOn(g, w)) return null;
    const grp = driveGroup(w!), pick = grp ? names((g.player.traits as Record<string, unknown> | undefined)?.[grp.id])[0] : undefined;
    if (!grp || !pick) return 'average';
    const word = (['low', 'average', 'high'] as Drive[]).find(d => new RegExp(`\\b${d}\\b`, 'i').test(pick));
    if (word) return word;
    const i = grp.options.indexOf(pick);
    return grp.options.length === 3 && i >= 0 ? (['low', 'average', 'high'] as Drive[])[i] : 'average';
}
// The Drive's own options, kept out of trait info's effects: the drive's numbers come from one place (design 8).
const driveNames = (w: WorldDef) => new Set(driveGroup(w)?.options ?? []);

/* ---------- the trait source for the effects engine ---------- */

const holds = (g: Save, w: WorldDef, e: EffectDef) => !e.when || (e.when === OUT_OF_WORK ? systemOn(w, 'jobs') && !g.player.job : whenHolds(g, w, e.when, { key: `trait|${e.kind}|${e.target ?? ''}` }));
// Personality's effects (from the world's `traitInfo`), the habits' faster learning while they hold, and the Drive's
// Desire drain and romance from private actions (a choice with a cost each way: past a trait's ±15%).
effectSources.push((g, w) => {
    const out: EffectDef[] = [];
    const info = w.traitInfo, drives = driveNames(w);
    if (info) for (const t of traitsInPlay(g, w)) if (!drives.has(t)) for (const e of info[t]?.effects ?? []) if (holds(g, w, e)) out.push(clampEffect(e, TRAIT_LIMITS));
    if (systemOn(w, 'habits')) for (const id of habitsOf(g).has) { const h = w.habits?.find(x => x.id === id); if (h?.learn && (!h.adult || adultOn(g))) out.push({ kind: 'learn', target: h.learn, value: HABIT_LEARN }); }
    const d = playerDrive(g, w);
    if (d && d !== 'average') out.push({ kind: 'drain', target: 'desire', value: PLAYER_DRIVE[d].drain - 1 }, { kind: 'gain', target: 'intimate', value: PLAYER_DRIVE[d].romance });
    return out;
});

// Interests: an action that fits one (a skill it trains or rolls, a tag of the action or of the place) lifts mood a little more.
onAction.push((g, w, a) => {
    const info = w.traitInfo; if (!info || !activeStatuses(w, g).some(x => x.id === 'mood')) return;   // (no mood in play: nothing to lift)
    const x = a as { id: string; tags?: string[]; hobby?: string; trains?: string; roll?: { skill?: string } };
    const skills = new Set([hobbyFor(w, x)?.id, x.roll?.skill, x.trains, x.hobby].filter((s): s is string => !!s));
    const tags = new Set([...(x.tags ?? []), ...(placeOf(g, w, g.player.loc)?.tags ?? [])]);
    for (const t of traitsInPlay(g, w)) {
        const c = info[t]?.covers;
        if (c && (c.skills?.some(s => skills.has(s)) || c.tags?.some(s => tags.has(s)))) { addStatus(g, w, 'mood', INTEREST_MOOD); return; }
    }
});

/* ---------- what the AI is told ---------- */

/** One short line every turn: personality, interests, habits, the lines a world gives its traits for the AI (`ai`) and
 *  the drive (the persona card says them once at the new game and goes stale; this stays true). Empty when there's
 *  nothing to say. */
export function traitLine(g: Save, w: WorldDef): string {
    const t = (g.player.traits ?? {}) as Record<string, unknown>;
    const lower = (l: string[]) => l.map(x => x.toLowerCase()).join(', ');
    const on = adultOn(g), shown = (l: string[]) => (on ? l : l.filter(x => !isAdultTrait(w, x)));
    const per = shown(names(t.personality)), fun = shown(names(t.interests)), habits = habitTraits(g, w);
    const drive = playerDrive(g, w), drives = driveNames(w), ai = (n: string) => w.traitInfo?.[n]?.ai ?? '';
    // a trait's own line for the AI (the world's words: In bed's, an overlay's), a drive's in place of the engine's
    const pick = drive ? names(t[DRIVE_GROUP]).find(x => drives.has(x)) : undefined;
    const lines = [...new Set([...traitsInPlay(g, w), ...habits])].filter(x => !drives.has(x)).map(ai).filter(Boolean);
    const parts = [per.length ? `{{user}} is ${lower(per)}.` : '', fun.length ? `Interests: ${lower(fun)}.` : '', habits.length ? `Habits: ${lower(habits)}.` : '', ...lines, drive ? (pick && ai(pick)) || PLAYER_DRIVE[drive].ai : ''].filter(Boolean);
    return parts.join(' ');
}

/* ---------- changing a trait ---------- */

/** Swaps one trait you have for another from the same group of the character sheet (life goals' "Change a trait"): a
 *  personality or an interest, never a strength (those are skill levels now). The persona card is refreshed by
 *  `refreshPersona` in game.ts. */
export function swapTrait(g: Save, w: WorldDef, groupId: string, from: string, to: string): { ok: boolean; text: string } {
    const grp = (w.sheet?.traits ?? []).find(x => x.id === groupId);
    if (!grp || strengthGroups(w).includes(grp)) return { ok: false, text: 'That kind of trait cannot be changed.' };
    const mine = ((g.player.traits ??= {}) as Record<string, string[]>)[groupId];
    const i = Array.isArray(mine) ? mine.indexOf(from) : -1;
    if (i < 0) return { ok: false, text: `You are not ${from.toLowerCase()}.` };
    if (!groupOptions(g, grp).includes(to)) return { ok: false, text: `${to} is not something you can become.` };
    if (traitNames(g).includes(to)) return { ok: false, text: `You already are ${to.toLowerCase()}.` };
    mine[i] = to;
    note(g, '{u} changed: no longer {0}, now {1}.', [from.toLowerCase(), to.toLowerCase()], [], g.player.loc, 'skill');
    return { ok: true, text: `You are no longer ${from.toLowerCase()}. You are now ${to.toLowerCase()}.` };
}

/* ---------- a save from before: the new rules ---------- */

// The twelve old life goals' rewards, as they were when traits were handed out for them (a migration must do the same
// on every old save, so this stays here even when the goals change): their perks are the reward now (TC-8).
const OLD_GOAL_REWARDS: Record<string, string> = { rich: 'Good with numbers', romance: 'Romantic', career: 'Ambitious', worker: 'Serious', social: 'Charming', host: 'Outgoing', home: 'Calm', scholar: 'Smart', chef: 'Good cook', athlete: 'Athletic', fit: 'Strong', artist: 'Creative' };

// What the built-in worlds' courses taught as traits before courses taught skills (TC-3), by world and course: a save
// that finished one of them loses the trait (courses teach skills now; a credential is the finished course itself).
// The ones their strengths group maps (Smart, Charming…) have become skill levels already.
const OLD_COURSE_TRAITS: Record<string, Record<string, string[]>> = {
    tokyo: { care: ['Kind'], japanese: ['Speaks Japanese'], english: ['Speaks English'], teaching: ['Patient'], beauty: ['Stylish'], nursing: ['Kind'], medicine: ['Smart'], museum: ['Curious'], mixology: ['Charming'] },
    modern: { cooking: ['Good cook'], fitness: ['Athletic'], firstaid: ['Calm'], programming: ['Tech-savvy'], finance: ['Good with numbers'], engineering: ['Handy', 'Smart'], medicine: ['Smart'], nursing: ['Kind'], education: ['Kind'], science: ['Curious'], mechanics: ['Handy'], publicadmin: ['Serious'], hospitality: ['Charming'], music: ['Musical'], art: ['Creative'], speaking: ['Outgoing'] },
};

/** Rank numbers move up by one, once, for each job the world says got a new bottom rank (`Occupation.shifted`), in the
 *  save and in the jobs kept for "Play as". `player.shifts` remembers what was done ("job:shift"); a save without that
 *  list isn't one that came through the migration (or a new game), so nothing moves. */
export function settleShifts(g: Save, w: WorldDef): string[] {
    const p = g.player as any;
    if (!Array.isArray(p.shifts)) return [];
    const done = new Set<string>(p.shifts.map(String)), moved: string[] = [];
    for (const o of w.occupations) for (const s of o.shifted ?? []) {
        const key = `${o.id}:${s}`;
        if (done.has(key)) continue;
        done.add(key);
        for (const j of [p.job, ...Object.values<any>((g as any).swap?.jobs ?? {})]) if (j && typeof j === 'object' && j.id === o.id && Number.isFinite(j.rank)) j.rank += 1;
        moved.push(o.name);
    }
    if (moved.length) p.shifts = [...done];
    return moved;
}

/** Brings a save made under the old rules onto the new ones, once (`player.traitsTodo`, set by migration 5): strengths
 *  and learned or school traits the world maps to a skill become levels (never lowering one), finished courses give their
 *  levels, the old life goals' reward traits go, habits are rebuilt from the habits you have. Picks the world doesn't
 *  map stay (custom worlds, worlds without skills). The old lists are kept in `player.traitsBefore`. Idempotent. */
export function settleTraits(g: Save, w: WorldDef): string[] {
    const p = g.player as any;
    const notes: string[] = [];
    if (p.traitsTodo) {
        const t = ((p.traits ??= {}) as Record<string, string[]>);
        // 1. life goals' old reward traits: the finished goal's perk is the reward, not a trait you never chose
        if (Array.isArray(t.earned)) for (const id of names(p.aspDone)) if (OLD_GOAL_REWARDS[id]) t.earned = t.earned.filter(x => x !== OLD_GOAL_REWARDS[id]);
        // 2. strengths picked at the new game
        for (const grp of strengthGroups(w)) {
            const mine = names(t[grp.id]), { mapped, rest } = splitStrengths(w, mine);
            if (!mapped.length) continue;
            applyStrengths(g, w, mapped);
            t[grp.id] = rest;
            notes.push(`${mapped.join(', ')} became skill levels.`);
        }
        // 3. traits a course or a school gave: each one is its levels now
        for (const key of ['learned', 'school']) {
            const mine = names(t[key]);
            if (!mine.length) continue;
            for (const n of mine) for (const [id, lv] of Object.entries(strengthOf(w, n) ?? {})) setSkillLevel(g, id, lv);
            t[key] = splitStrengths(w, mine).rest;
        }
        // 3b. what a finished course taught as a trait in the built-in worlds' old data
        const old = OLD_COURSE_TRAITS[w.id] ?? {}, gone = names(p.learning?.done).flatMap(id => old[id] ?? []);
        if (Array.isArray(t.learned) && t.learned.some(x => gone.includes(x))) {
            notes.push(`${t.learned.filter(x => gone.includes(x)).join(', ')}, from your courses, ${t.learned.filter(x => gone.includes(x)).length === 1 ? 'is' : 'are'} gone: courses teach skills now.`);
            t.learned = t.learned.filter(x => !gone.includes(x));
        }
        // 4. the courses you finished teach their levels
        const courses = ((w.catalogs as any)?.courses ?? []) as { id: string; skills?: Record<string, number> }[];
        for (const id of names(p.learning?.done)) for (const [s, lv] of Object.entries(courses.find(c => c.id === id)?.skills ?? {})) if (skillDef(w, s)) setSkillLevel(g, s, lv);
        delete p.traitsTodo;
    }
    settleShifts(g, w);
    syncHabitTraits(g, w);
    return notes;
}
