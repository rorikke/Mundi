// Life points (save key `points`): what the rewards shop (sim/rewards.ts) spends. The active goal pays the most: each
// step (the step's own `reward.points`, else 100) and finishing it (200, twice that with a daruma bought for it), through
// the `onGoalStep` hook sim/goals.ts calls. Second sources pay a little, so goals stay the main way: a festival or a city
// event the first time each year (10), a street story finished (15), a secret learned (20), a thread you knew reaching
// its end (40), a keepsake you never had before (10); at most 60 a day from these together, so nothing can be farmed.
// Every gain goes through `pointsFor()` (sim/perks.ts), so perks with a `points` effect add their share. All of it
// belongs to the `goals` system: with it off nothing is earned. Read with `??=` (no new schema).
import { type Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { goalOf, GOAL_POINTS } from '../core/goals.js';
import { pointsFor, type PointSource } from './perks.js';
import { seasonDays } from './time.js';
import { onGoalStep } from './hooks.js';

/** What a second source pays (before perks), and how much of them a day counts at most. */
export const SECOND_POINTS: Record<'festival' | 'event' | 'story' | 'secret' | 'thread' | 'keepsake', number> = { festival: 10, event: 10, story: 15, secret: 20, thread: 40, keepsake: 10 };
export const DAILY_CAP = 60;

/** One thing bought in the rewards shop: the item, the day, for whom, during which goal. Kept for the items' limits
 *  (sim/rewards.ts). */
export interface Bought { id: string; day: number; person?: string; goal?: string }
/** The ledger. `have`: points to spend; `earned`: all ever earned; `today`: what second sources gave on `day`; `years`:
 *  festivals and city events already paid this year (`festival:<id>` → the year); `kinds`: keepsakes already paid
 *  for; `bought`: what was bought (for limits); `double`: goals a daruma was bought for; `log`: the last gains and
 *  spendings, newest last (for the Rewards tab); `told`: what Insight has told about each person. */
export interface Points {
    have: number; earned: number; today: { day: number; n: number }; years: Record<string, number>; kinds: string[];
    bought: Bought[]; double: string[]; log: { day: number; n: number; why: string }[]; told: Record<string, string[]>;
}
export function pointsState(g: Save): Points {
    const p = ((g as any).points ??= {}) as Points;
    p.have ??= 0; p.earned ??= 0; p.today ??= { day: g.day, n: 0 }; p.years ??= {}; p.kinds ??= []; p.bought ??= []; p.double ??= []; p.log ??= []; p.told ??= {};
    return p;
}
/** Points you have to spend (0 without a ledger yet; reading doesn't make one). */
export const pointsOf = (g: Save): number => ((g as any).points?.have ?? 0) as number;
export const yearOf = (g: Save, day = g.day) => Math.floor((Math.max(1, day) - 1) / (4 * seasonDays(g)));

const LOG = 30;
function log(p: Points, day: number, n: number, why: string) { p.log.push({ day, n, why }); if (p.log.length > LOG) p.log.splice(0, p.log.length - LOG); }
/** Adds `n` points (already counted) to the ledger. */
function credit(g: Save, n: number, why: string): number {
    if (!(n > 0)) return 0;
    const p = pointsState(g);
    p.have += n; p.earned += n; log(p, g.day, n, why);
    return n;
}
/** Takes `n` points to spend (false when there aren't enough). */
export function spendPoints(g: Save, n: number, why: string): boolean {
    const p = pointsState(g);
    if (n > p.have) return false;
    p.have -= n; if (n) log(p, g.day, -n, why);
    return true;
}
export const pointsLine = (n: number) => `+${n} life point${n === 1 ? '' : 's'}`;

/* ---------- the active goal ---------- */

let skipping = false;
/** While the rewards shop's "Skip a step" does its step, that step pays nothing (points would buy it back). */
export function whileSkipping<T>(f: () => T): T { skipping = true; try { return f(); } finally { skipping = false; } }

/** A step of the active goal was done (the `onGoalStep` hook): its points, and the goal's when it was the last. */
export function payStep(g: Save, w: WorldDef, goal: string, step: number, last: boolean): string[] {
    if (!systemOn(w, 'goals')) return [];
    const def = goalOf(w, goal), out: string[] = [];
    const raw = skipping ? 0 : def?.steps[step]?.reward?.points ?? GOAL_POINTS.step;
    const n = credit(g, pointsFor(g, w, 'step', raw), `step:${goal}:${step}`);
    if (n) out.push(pointsLine(n));
    if (last) {
        const p = pointsState(g), twice = p.double.includes(goal);
        const m = credit(g, pointsFor(g, w, 'goal', GOAL_POINTS.goal * (twice ? 2 : 1)), `goal:${goal}`);
        if (twice) p.double = p.double.filter(x => x !== goal);
        if (m) out.push(`${pointsLine(m)} for finishing it${twice ? ' (doubled)' : ''}`);
    }
    return out;
}
onGoalStep.push(payStep);

/* ---------- second sources ---------- */

// What the line says where the source isn't plain from what came before it (a secret, an ending in the day's news).
const SAID: Partial<Record<PointSource, string>> = { secret: ' (a secret learned)', thread: ' (a story you followed came to its end)' };
/** Points from a second source, once each where the source says so (`key`: a festival or event id, a keepsake id),
 *  inside the day's cap. Returns the line to show ('' when nothing was paid). */
export function earn(g: Save, w: WorldDef | null | undefined, source: Exclude<PointSource, 'step' | 'goal'>, key = ''): string {
    if (!w || !systemOn(w, 'goals')) return '';
    const p = pointsState(g);
    if (source === 'festival' || source === 'event') { const k = `${source}:${key}`; if (p.years[k] === yearOf(g)) return ''; p.years[k] = yearOf(g); }
    if (source === 'keepsake') { if (!key || p.kinds.includes(key)) return ''; p.kinds.push(key); }
    if (p.today.day !== g.day) p.today = { day: g.day, n: 0 };
    const n = Math.min(pointsFor(g, w, source, SECOND_POINTS[source]), DAILY_CAP - p.today.n);
    if (!(n > 0)) return '';
    p.today.n += n;
    return `${pointsLine(credit(g, n, key ? `${source}:${key}` : source))}${SAID[source] ?? ''}`;
}
