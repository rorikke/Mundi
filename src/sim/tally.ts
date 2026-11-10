// Lifetime counters: what you've done, been to and been good at, kept for life goals' objectives and for conditions
// that ask how often something happened (`did`, `attended`, `visited`, `rank: 2 in 3 jobs`, `home: better` in
// sim/when.ts). Kept in the save under `tally` and only ever added to; a goal that counts only while it's active (D-8)
// keeps its own snapshot of these numbers (sim/goals.ts). No module of the engine reads them to change a number.
//
// `count` holds one number per key: `action:<id>` and `tag:<tag>` (an action done, from onAction), `event:<name>` (the
// engine's own moments: TALLY_EVENTS), `people:<name>` (that moment with someone for the first time: dates with three
// people), `with:<id>` and `with:any` (an action done with someone), `roll:<skill>` and `win:<action id>` (rolls that
// went well), `festival:<id>`, `cityevent:<id>` and `attended:any` (festivals celebrated and city events gone to).
import type { Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { onAction, onHour, onLook } from './hooks.js';

/** The engine's own moments, counted by name (`did: meal 15`). Where each is counted:
 *  `meal` (cooking at home), `workout`, `painting` (a painting sold), `shift` (a shift worked; part shifts count their
 *  part), `party` (a party you threw): sim/skills.ts `countUp`; `missed_shift`: sim/work.ts; `missed_train` (a taxi or a
 *  wait after the last train): sim/transit.ts; `date` (a date kept): sim/plans.ts; `overnight` (someone stays the night
 *  with you, or you with them): sim/plans.ts; `night_away` (a night at a hotel, a capsule, a ryokan): sim/stays.ts;
 *  `crisis` and `collapse` (a need at zero too long; collapse: energy): sim/needs.ts; `apprentice`, `lesson`, `taught`
 *  (an apprentice who finished): sim/mentors.ts; `baby`: sim/family.ts; `business` (one opened): sim/holdings.ts. */
export const TALLY_EVENTS = ['meal', 'workout', 'painting', 'shift', 'party', 'missed_shift', 'missed_train', 'date', 'overnight', 'night_away', 'crisis', 'collapse', 'apprentice', 'lesson', 'taught', 'baby', 'business'] as const;
export type TallyEvent = typeof TALLY_EVENTS[number];
/** The prefixes a counted key can have in a condition (`did: tag:karaoke 3`); with none it's an event name or an action id. */
export const TALLY_PREFIXES = ['tag', 'roll', 'win', 'with', 'people'] as const;

/** `count`: the counters (see the top of the file). `visited`: places you've been to (place id → the day you first
 *  were). `best`: the highest rank you reached in each job (1 is the first rank). `home`: where you live now and since
 *  when (a day), and the zone of the first home seen (`home: better`). `met`: who you've had each moment with once. */
export interface Tally { count: Record<string, number>; visited: Record<string, number>; best: Record<string, number>; home?: { at: string; since: number; first: string }; met: Record<string, string[]> }
export function tally(g: Save): Tally {
    const t = ((g as any).tally ??= {}) as Tally;
    t.count ??= {}; t.visited ??= {}; t.best ??= {}; t.met ??= {};
    return t;
}
/** A counter as it is now (0 when it never happened). */
export const tallyOf = (g: Save, key: string): number => ((g as any).tally?.count?.[key] as number | undefined) ?? 0;
const add = (g: Save, key: string, n = 1) => { const c = tally(g).count; c[key] = Math.round(((c[key] ?? 0) + n) * 100) / 100; };

/** One of the engine's moments happened (`n` times); `who`: with this person (an avatar), for `people:<name>`. */
export function tallyEvent(g: Save, name: TallyEvent, n = 1, who?: string) {
    add(g, `event:${name}`, n);
    if (who) { const m = (tally(g).met[name] ??= []); if (!m.includes(who)) { m.push(who); add(g, `people:${name}`); } }
}
/** A festival celebrated or a city event gone to. */
export function tallyAttend(g: Save, kind: 'festival' | 'cityevent', id: string) { add(g, `${kind}:${id}`); add(g, 'attended:any'); }
/** A roll that went well: by its skill (an action's, a story's or a work choice's) and, for an action, by its id. */
export function tallyRoll(g: Save, skill: string | undefined, action?: string) { if (skill) add(g, `roll:${skill}`); if (action) add(g, `win:${action}`); }
/** An action done with someone (time together). */
export function tallyTogether(g: Save, action: string) { add(g, `with:${action}`); add(g, 'with:any'); }

/* ---------- where you've been, your best ranks, your home ---------- */

/** Have you been to this place? */
export const beenTo = (g: Save, place: string) => (g as any).tally?.visited?.[place] !== undefined;
/** The places you've been to. */
export const placesBeen = (g: Save): string[] => Object.keys((g as any).tally?.visited ?? {});
/** Visits that make you a regular somewhere (the living world counts them: sim/daylife.ts, `living.visits`). */
export const REGULAR_VISITS = 8;
export const isRegular = (g: Save, place: string) => (((g as any).living?.visits?.[place]?.n as number | undefined) ?? 0) >= REGULAR_VISITS;
/** The highest rank (1 = the first) you reached in each job. */
export const bestRanks = (g: Save): Record<string, number> => ({ ...((g as any).tally?.best ?? {}) });

// What's true now, noted: the place you're at (not a home, not an outing in a Home), the rank of your job, your home.
function look(g: Save, w?: WorldDef) {
    const t = tally(g), loc = g.player.loc;
    if (loc && !loc.startsWith('home:') && !loc.startsWith('out:') && !(loc in t.visited) && (!w || w.places.some(p => p.id === loc))) t.visited[loc] = g.day;
    const j = g.player.job;
    if (j?.id) t.best[j.id] = Math.max(t.best[j.id] ?? 0, (j.rank ?? 0) + 1);
    const h = g.player.home;
    if (h?.zone) {
        const at = `${h.zone}|${h.x ?? ''}|${h.y ?? ''}|${(h as any).n ?? ''}`;
        if (!t.home) t.home = { at, since: g.day, first: h.zone };
        else if (t.home.at !== at) { t.home.at = at; t.home.since = g.day; }
    }
}

onAction.push((g, w, a) => {
    look(g, w);
    add(g, `action:${a.id}`);
    for (const tag of new Set(a.tags ?? [])) add(g, `tag:${tag}`);
});
onHour.push((g, w) => { look(g, w); return []; });
onLook.push((g, w) => look(g, w));
