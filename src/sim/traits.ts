// Who you are: strengths (what you're good at when a game starts: they become skill levels), personality (small effects
// on the game's numbers, through the effects engine), interests (doing something that fits one lifts your mood a
// little more) and habits (their skill trains a little faster while you keep them). Also what the AI is told about
// you every turn, swapping a trait later (life goals' "Change a trait"), and `settleTraits`, which brings a save made
// under the old rules (every trait a flat bonus, courses and goals handing out traits) onto the new ones once its
// world is known.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type TraitGroup } from '../core/world.js';
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

/* ---------- the trait source for the effects engine ---------- */

const holds = (g: Save, w: WorldDef, e: EffectDef) => !e.when || (e.when === OUT_OF_WORK ? systemOn(w, 'jobs') && !g.player.job : whenHolds(g, w, e.when, { key: `trait|${e.kind}|${e.target ?? ''}` }));
// Personality's effects (from the world's `traitInfo`) and the habits' faster learning, while they hold.
effectSources.push((g, w) => {
    const out: EffectDef[] = [];
    const info = w.traitInfo;
    if (info) for (const t of traitNames(g)) for (const e of info[t]?.effects ?? []) if (holds(g, w, e)) out.push(clampEffect(e, TRAIT_LIMITS));
    if (systemOn(w, 'habits')) for (const id of habitsOf(g).has) { const skill = w.habits?.find(h => h.id === id)?.learn; if (skill) out.push({ kind: 'learn', target: skill, value: HABIT_LEARN }); }
    return out;
});

// Interests: an action that fits one (a skill it trains or rolls, a tag of the action or of the place) lifts mood a little more.
onAction.push((g, w, a) => {
    const info = w.traitInfo; if (!info) return;
    const x = a as { id: string; tags?: string[]; hobby?: string; trains?: string; roll?: { skill?: string } };
    const skills = new Set([hobbyFor(w, x)?.id, x.roll?.skill, x.trains, x.hobby].filter((s): s is string => !!s));
    const tags = new Set([...(x.tags ?? []), ...(placeOf(g, w, g.player.loc)?.tags ?? [])]);
    for (const t of traitNames(g)) {
        const c = info[t]?.covers;
        if (c && (c.skills?.some(s => skills.has(s)) || c.tags?.some(s => tags.has(s)))) { addStatus(g, w, 'mood', INTEREST_MOOD); return; }
    }
});

/* ---------- what the AI is told ---------- */

/** One short line every turn: personality, interests, habits (the persona card says them once at the new game and goes
 *  stale; this stays true). Empty when there's nothing to say. */
export function traitLine(g: Save, w: WorldDef): string {
    const t = (g.player.traits ?? {}) as Record<string, unknown>;
    const lower = (l: string[]) => l.map(x => x.toLowerCase()).join(', ');
    const per = names(t.personality), fun = names(t.interests), habits = habitTraits(g, w);
    const parts = [per.length ? `{{user}} is ${lower(per)}.` : '', fun.length ? `Interests: ${lower(fun)}.` : '', habits.length ? `Habits: ${lower(habits)}.` : ''].filter(Boolean);
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
    if (!grp.options.includes(to)) return { ok: false, text: `${to} is not something you can become.` };
    if (traitNames(g).includes(to)) return { ok: false, text: `You already are ${to.toLowerCase()}.` };
    mine[i] = to;
    note(g, '{u} changed: no longer {0}, now {1}.', [from.toLowerCase(), to.toLowerCase()], [], g.player.loc, 'skill');
    return { ok: true, text: `You are no longer ${from.toLowerCase()}. You are now ${to.toLowerCase()}.` };
}

/* ---------- a save from before: the new rules ---------- */

// The twelve old life goals' rewards, as they were when traits were handed out for them (a migration must do the same
// on every old save, so this stays here even when the goals change): their perks are the reward now (TC-8).
const OLD_GOAL_REWARDS: Record<string, string> = { rich: 'Good with numbers', romance: 'Romantic', career: 'Ambitious', worker: 'Serious', social: 'Charming', host: 'Outgoing', home: 'Calm', scholar: 'Smart', chef: 'Good cook', athlete: 'Athletic', fit: 'Strong', artist: 'Creative' };

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
        // 4. the courses you finished teach their levels
        const courses = ((w.catalogs as any)?.courses ?? []) as { id: string; skills?: Record<string, number> }[];
        for (const id of names(p.learning?.done)) for (const [s, lv] of Object.entries(courses.find(c => c.id === id)?.skills ?? {})) if (skillDef(w, s)) setSkillLevel(g, s, lv);
        delete p.traitsTodo;
    }
    settleShifts(g, w);
    syncHabitTraits(g, w);
    return notes;
}
