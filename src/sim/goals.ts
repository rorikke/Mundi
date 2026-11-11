// Life goals: the one goal you follow (D-1), its steps done in order, what a step and a finished goal give, and the
// goals a game offers. A step is a condition (sim/when.ts); a counted objective ("cook 15 meals") counts only while
// its goal is the active one (D-8): when a goal becomes active the save notes the tally's counters it reads, and when
// it's paused what changed is added to that goal's own counts, so switching never resets anything and never hands out
// what was done for another goal. States ("Cooking 5", "rank 4") count at once. A step with `hold` must keep holding for
// that long; a counted objective it says `not` of ("no missed shift") counts from when the hold began, so a miss starts
// it over. Finishing a goal gives its perk for good (sim/perks.ts reads `done`: by goal id, never a trait: D-12).
// Points are the ledger's (sim/points.ts listens to `onGoalStep`); the screens are ui/'s. Everything belongs to the
// `goals` system: with it off nothing moves. Old saves: the old aspiration and the ones finished (`player.aspiration`,
// `player.aspDone`) are read once into this state and left where they are.
import { nowAbs, adultOk, adultOn, type Save } from '../core/store.js';
import { systemOn, activeStatuses, getWorld, type WorldDef, type GoalDef, type GoalStep, type When } from '../core/world.js';
import { goalsOf, goalOf, isSystemNeed, FOLDED_GOALS, SKILL_GROUPS, GENERAL_GOALS, GOAL_CATEGORIES } from '../core/goals.js';
import type { EffectDef } from '../core/traits.js';
import { whenHolds, parseWhen, namedIn, personNamed, countKey, countedOf, moneyAmount, homeMap, PLACE_REGULAR } from './when.js';
import { tally, tallyOf, placesBeen, isRegular } from './tally.js';
import { onHour, onGoalStep, goalLink } from './hooks.js';
import { addStatus } from './needs.js';
import { addKeepsake } from './social.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { seasonDays } from './time.js';
import { skillsOf, levelOf } from './hobbies.js';
import { offeredOf } from './courses.js';
import { threadsOf } from './threads.js';
import { placeOk } from './dayplan.js';

/** The mood a step gives when it says nothing of its own reward (the general goals' steps), and the mood a finished
 *  goal gives on top. */
export const STEP_MOOD = 10, GOAL_MOOD = 30;

/* ---------- the state (save key `goals`) ---------- */

/** `active`: the goal you follow (null: none). `done`: goals finished (their perks are yours). `steps`: steps done per
 *  goal (the `goal` condition reads both). `counts`: what paused goals counted while they were active (by tally key).
 *  `snap`/`bases`: the tally's counters the active goal reads, as they were when it became active (`bases`: the keys
 *  noted; a key `base|avatar` belongs to its base). `hold`: the current step's hold (since when; the counters it reads as
 *  they were then). `told`: the last "pick a goal" notice given (`pick:<goals finished>`), `notice` its text for the
 *  phone. `read`: the old aspirations were read. */
export interface GoalsState {
    active: string | null; done: string[]; steps: Record<string, number>;
    counts: Record<string, Record<string, number>>; snap: Record<string, number>; bases: string[];
    hold: { goal: string; step: number; from: number; snap: Record<string, number>; bases: string[] } | null;
    told: string; notice?: { text: string; day: number }; read?: boolean;
}
export function goalsState(g: Save): GoalsState {
    const s = ((g as any).goals ??= {}) as GoalsState;
    s.active ??= null; s.done ??= []; s.steps ??= {}; s.counts ??= {}; s.snap ??= {}; s.bases ??= []; s.hold ??= null; s.told ??= '';
    if (!s.read) readOld(g, s);
    return s;
}
const fold = (id: string) => FOLDED_GOALS[id] ?? id;
// Old saves (G7): the aspirations finished count as goals finished (In top shape as Athlete), and the one followed is the
// active goal, counting from now (D-8). The old fields stay where they are.
function readOld(g: Save, s: GoalsState) {
    s.read = true;
    const p = g.player as { aspiration?: string; aspDone?: string[] } | undefined;
    for (const id of Array.isArray(p?.aspDone) ? p!.aspDone : []) if (typeof id === 'string' && !s.done.includes(fold(id))) s.done.push(fold(id));
    const a = typeof p?.aspiration === 'string' && p.aspiration ? fold(p.aspiration) : '';
    if (!a || s.active || s.done.includes(a)) return;
    const w = getWorld(g.world), goal = w ? goalOf(w, a) : null;
    s.active = a;
    if (w && goal) noteCounts(g, s, w, goal);
}

/* ---------- counting while active (D-8) ---------- */

const baseOf = (key: string) => key.split('|')[0];
const round2 = (n: number) => Math.round(n * 100) / 100;
// Notes the tally's counters of one base (and its per-person keys) into a snapshot, once.
function noteBase(g: Save, snap: Record<string, number>, bases: string[], base: string) {
    if (bases.includes(base)) return;
    bases.push(base);
    const c = tally(g).count;
    for (const k of Object.keys(c)) if (k === base || k.startsWith(`${base}|`)) snap[k] = c[k];
}
// The counters a way of doing a step reads (`did`, `attended`), and those it says `not` of.
function readsOf(w: WorldDef, when: When | undefined): { all: string[]; not: string[] } {
    const all: string[] = [], not: string[] = [];
    for (const c of parseWhen(when).conds) {
        if (c.key !== 'did' && c.key !== 'attended') continue;
        for (const v of c.values) { const x = countedOf(c.key, v); if (!x) continue; const k = countKey(w, c.key, x.what); all.push(k); if (c.not) not.push(k); }
    }
    return { all, not };
}
const waysOf = (st: GoalStep) => [st.when, ...(st.or ?? [])];
function noteCounts(g: Save, s: GoalsState, w: WorldDef, goal: GoalDef) {
    s.snap = {}; s.bases = [];
    for (const st of goal.steps) for (const way of waysOf(st)) for (const k of readsOf(w, way).all) noteBase(g, s.snap, s.bases, k);
}
/** What a goal has counted for a tally key (`event:meal`, `tag:karaoke`…): its paused counts, plus what changed since
 *  it became active when it is the active one. */
export function goalCount(g: Save, id: string, key: string): number {
    const s = goalsState(g), own = s.counts[id]?.[key] ?? 0;
    if (s.active !== id) return own;
    noteBase(g, s.snap, s.bases, baseOf(key));   // a key the goal didn't read when it was picked starts counting now
    return round2(own + Math.max(0, tallyOf(g, key) - (s.snap[key] ?? 0)));
}
// Pausing the active goal: what it counted is added to its own counts.
function pause(g: Save, s: GoalsState) {
    const id = s.active;
    if (!id) return;
    const c = tally(g).count, own = (s.counts[id] ??= {});
    for (const k of Object.keys(c)) {
        if (!s.bases.includes(baseOf(k))) continue;
        const d = c[k] - (s.snap[k] ?? 0);
        if (d > 0) own[k] = round2((own[k] ?? 0) + d);
    }
    if (!Object.keys(own).length) delete s.counts[id];
    s.active = null; s.snap = {}; s.bases = []; s.hold = null;
}

/* ---------- what a game offers ---------- */

// Threads in this game whose people are all in it (the owner and everyone their conditions name), with the living world on.
// What a game offers is asked every game hour and at every redraw of the phone (the badge), and finding each person a
// storyline's conditions name is the slow part, so the answer is kept until something it depends on changes: the day,
// the living world, adult content, or who is in the game, by which name, and who has left the maps.
const keptThreads = new WeakMap<Save, { w: WorldDef; key: string; list: ReturnType<typeof threadsOf> }>();
function threadsHere(g: Save, w: WorldDef) {
    if (!systemOn(w, 'living')) return [];
    const key = `${g.day}|${adultOn(g)}|${Object.values(g.cast).map(r => `${r.avatar}:${r.name}:${(r as any).gone ? 1 : 0}`).join(',')}`;
    const k = keptThreads.get(g);
    if (k && k.w === w && k.key === key) return k.list;
    const list = threadsOf(g, w).filter(({ t, r }) => !(r as any).gone && [t.reveal, ...t.stages.map(x => x.when), ...(t.endings ?? []).map(x => x.when)]
        .every(c => namedIn(c).people.every(n => { const p = personNamed(g, n); return !!p && !(p as any).gone; })));
    keptThreads.set(g, { w, key, list });
    return list;
}
const SKILL = /^(\S+)\s+(\d+)(?:\s+x(\d+))?$/i;
const VISITED_N = /^(\d+)(\s+regular)?(?:\s+in\s+(\S+))?$/i;
// Places a `visited` count can be about, on a map or area (`home`: whichever map has homes), and a place one can be
// at in this game (not a pin to another map, not private, its adult content on).
const countable = (w: WorldDef, map?: string) => w.places.filter(p => !p.link && !p.private && !p.adult && (!map || p.map === map || w.maps.find(x => x.id === p.map)?.area === map));
const reachable = (g: Save, w: WorldDef, id: string) => { const p = w.places.find(x => x.id === id); return !!p && !p.link && !p.private && placeOk(g, w, id); };
// Could this value of a condition ever hold in this game? (A course count beyond the world's courses, a skill it lacks,
// a need off in this game, more keepsakes or places than it has, a place it doesn't have or can't reach, regulars with
// the living world off, more secrets than its threads can give, a better home than a first one in the dearest area.)
function canHold(g: Save, w: WorldDef, key: string, v: string, inPlay: Set<string>): boolean {
    switch (key) {
        case 'course': return /^\d+$/.test(v) ? offeredOf(w).length >= Number(v) : offeredOf(w).some(c => c.id === v);
        case 'skill': {
            const m = v.match(SKILL); if (!m) return true;
            const have = new Set(skillsOf(w).map(x => x.id)), many = Number(m[3] ?? 1);
            if (m[1] === 'any') return have.size >= many;
            if (SKILL_GROUPS[m[1]]) return SKILL_GROUPS[m[1]].filter(x => have.has(x)).length >= many;
            return have.has(m[1]);
        }
        case 'need': { const id = v.split(/\s+/)[0]; return id === 'all' ? inPlay.size > 0 : inPlay.has(id); }
        // more keepsakes, or places, than the world has
        case 'holds': { const ks = w.keepsakes ?? []; return /^\d+$/.test(v) ? ks.length >= Number(v) : v.startsWith('kind:') ? ks.some(k => !!k.kind && (v === 'kind:any' || k.kind === v.slice(5))) : ks.some(k => k.id === v); }
        case 'visited': {
            const m = v.match(VISITED_N);
            if (m) {
                if (m[2] && !systemOn(w, 'living')) return false;
                const maps = !m[3] ? [undefined] : m[3].toLowerCase() === 'home' ? [...new Set(w.homes.zones.map(z => z.map))] : [m[3]];
                return maps.some(map => countable(w, map).length >= Number(m[1]));
            }
            if (/^(all(\s+in\s+\S+)?|map|maps)$/i.test(v)) return true;
            const r = v.match(PLACE_REGULAR);
            return (!r || systemOn(w, 'living')) && reachable(g, w, r ? r[1] : v);
        }
        // a better home than your first: not when the first was already in the dearest area (Porto Alto's heir)
        case 'home': {
            if (v.toLowerCase() !== 'better') return true;
            const rent = (zone: string | undefined) => w.homes.zones.find(z => z.id === zone)?.rent ?? 0;
            const first = tally(g).home?.first ?? g.player.home?.zone;
            return w.homes.zones.some(z => (z.rent ?? 0) > rent(first));
        }
        case 'secrets': return threadsHere(g, w).length >= Number(v);
        case 'helped': {
            const good = threadsHere(g, w).filter(({ t }) => (t.endings ?? []).some(e => e.good));
            return /^\d+$/.test(v) ? good.length >= Number(v) : good.some(({ t }) => t.id === v);
        }
        default: return true;
    }
}
// One way of doing a step: possible here unless it can't be read (or says nothing: it would hold at once), names
// someone or a thread not in this game (D-4), or asks for something this game can't give.
function wayPossible(g: Save, w: WorldDef, way: When | undefined, inPlay: Set<string>): boolean {
    const p = parseWhen(way);
    if (p.error || !p.conds.length) return false;
    const named = namedIn(way);
    if (named.people.some(n => { const p = personNamed(g, n); return !p || !!(p as any).gone; })) return false;
    if (named.threads.length) { const here = new Set(threadsHere(g, w).map(x => x.t.id)); if (named.threads.some(t => !here.has(t))) return false; }
    return p.conds.every(c => c.not || c.values.some(v => canHold(g, w, c.key, v, inPlay)));
}
/** Does this game offer the goal? Adult goals only with adult content on; a need it can't do without must be in play
 *  in this game; and every step must have a way that can be done here. (Systems the world has off: `goalsOf`.) */
export function goalFits(g: Save, w: WorldDef, goal: GoalDef): boolean {
    if (!adultOk(g, goal)) return false;
    const inPlay = new Set(activeStatuses(w, g).filter(x => !x.rpg).map(x => x.id));
    if ((goal.needs ?? []).some(id => !isSystemNeed(id) && !inPlay.has(id))) return false;
    return goal.steps.every(st => waysOf(st).some(way => wayPossible(g, w, way, inPlay)));
}
/** The goals this game offers (finished ones included: the Goals app shows them with a check). */
export function offeredGoals(g: Save, w: WorldDef): GoalDef[] {
    return goalsOf(w).filter(x => goalFits(g, w, x));
}
const offered = (g: Save, w: WorldDef, id: string | null) => (id ? offeredGoals(g, w).find(x => x.id === id) ?? null : null);
/** Can this goal be picked now (offered, not finished, not the one you follow)? */
export function canPick(g: Save, w: WorldDef, id: string): boolean {
    const s = goalsState(g);
    return systemOn(w, 'goals') && !!offered(g, w, id) && !s.done.includes(id) && s.active !== id;
}

/* ---------- picking, steps, finishing ---------- */

/** The goal you follow now, if this game offers it. */
export function activeGoal(g: Save, w: WorldDef): GoalDef | null {
    return systemOn(w, 'goals') ? offered(g, w, goalsState(g).active) : null;
}
/** Follow this goal (switching needs no warning: the one you followed is paused and keeps its progress). Returns what
 *  happened at once (a step whose objectives already hold is done). */
export function pickGoal(g: Save, w: WorldDef, id: string): string[] {
    if (!canPick(g, w, id)) return [];
    const s = goalsState(g), goal = offered(g, w, id)!;
    pause(g, s);
    s.active = id;
    noteCounts(g, s, w, goal);
    note(g, '{u} set a life goal: {0}.', [goal.name], [], g.player.loc, 'goal');
    return checkGoals(g, w);
}
const holdMinutes = (g: Save, h: number | 'season') => (h === 'season' ? seasonDays(g) : h) * 1440;
// What a held step's way reads: counts it says `not` of from when the hold began (0 before it begins), the rest as the
// goal counts them.
function heldCount(g: Save, s: GoalsState, id: string, not: string[]) {
    const h = s.hold;
    return (key: string) => {
        if (!not.includes(baseOf(key))) return goalCount(g, id, key);
        if (!h) return 0;
        noteBase(g, h.snap, h.bases, baseOf(key));
        return Math.max(0, tallyOf(g, key) - (h.snap[key] ?? 0));
    };
}
// Is the active goal's current step done now? (Starts or ends its hold as its objectives hold or stop holding.)
function stepDone(g: Save, w: WorldDef, s: GoalsState, goal: GoalDef): boolean {
    const i = s.steps[goal.id] ?? 0, st = goal.steps[i];
    if (!st) return false;
    const key = `goal|${goal.id}|${i}`;
    if (!st.hold) return waysOf(st).some(way => whenHolds(g, w, way, { key, count: k => goalCount(g, goal.id, k) }));
    if (s.hold && (s.hold.goal !== goal.id || s.hold.step !== i)) s.hold = null;
    const ok = waysOf(st).some(way => whenHolds(g, w, way, { key, count: heldCount(g, s, goal.id, readsOf(w, way).not) }));
    if (!ok) { s.hold = null; return false; }
    if (!s.hold) {
        s.hold = { goal: goal.id, step: i, from: nowAbs(g), snap: {}, bases: [] };
        for (const way of waysOf(st)) for (const k of readsOf(w, way).not) noteBase(g, s.hold.snap, s.hold.bases, k);
        return false;
    }
    return nowAbs(g) - s.hold.from >= holdMinutes(g, st.hold);
}
const moodInPlay = (g: Save, w: WorldDef) => activeStatuses(w, g).some(x => x.id === 'mood');
// The current step counts as done: its reward, a fact, the goal finished after the last one, and whatever listens
// (`onGoalStep`: the points ledger). A skipped step goes the same way.
function finishStep(g: Save, w: WorldDef, s: GoalsState, goal: GoalDef): string[] {
    const i = s.steps[goal.id] ?? 0, st = goal.steps[i], last = i >= goal.steps.length - 1;
    s.steps[goal.id] = i + 1;
    s.hold = null;
    const r = st.reward, out: string[] = [];
    const mood = r ? r.mood ?? 0 : STEP_MOOD;
    if (mood && moodInPlay(g, w)) addStatus(g, w, 'mood', mood);
    const k = r?.keepsake && (w.keepsakes ?? []).find(x => x.id === r.keepsake);
    if (k) addKeepsake(g, k.id);
    if (r?.money && r.money > 0) { g.player.money += r.money; book(g, goal.name, r.money); }
    note(g, '{u} reached a step of a life goal ({0}): {1}.', [goal.name, st.name], [], g.player.loc, 'goal');
    out.push(`Life goal step done: ${st.name} (${goal.name}).${k ? ` You got: ${k.name}.` : ''}`);
    if (last) {
        if (!s.done.includes(goal.id)) s.done.push(goal.id);
        delete s.counts[goal.id];
        s.active = null; s.snap = {}; s.bases = [];
        if (moodInPlay(g, w)) addStatus(g, w, 'mood', GOAL_MOOD);
        note(g, '{u} reached a life goal: {0}!', [goal.name], [], g.player.loc, 'goal');
        out.push(`Life goal reached: ${goal.name}!${goal.perk ? ` Perk: ${goal.perk.name}.` : ''}`);
    }
    for (const f of onGoalStep) out.push(...f(g, w, goal.id, i, last));
    return out;
}
/** Moves the active goal on: every step that's done now, in order (a held one waits for its time). Then the notice when
 *  there's no goal to follow. Runs every game hour; returns the lines to show. */
export function checkGoals(g: Save, w: WorldDef): string[] {
    if (!systemOn(w, 'goals')) return [];
    const s = goalsState(g), out: string[] = [];
    const goal = activeGoal(g, w);
    for (let n = 0; goal && s.active === goal.id && n < goal.steps.length && stepDone(g, w, s, goal); n++) out.push(...finishStep(g, w, s, goal));
    out.push(...pickNotice(g, w));
    return out;
}
/** Can the active goal's current step be skipped (a step that isn't its last)? */
export function canSkip(g: Save, w: WorldDef): boolean {
    const goal = activeGoal(g, w);
    return !!goal && (goalsState(g).steps[goal.id] ?? 0) < goal.steps.length - 1;
}
/** Counts the active goal's current step as done, with its reward, the way a real step is (the rewards shop's Skip a
 *  step; its once-per-goal limit is the shop's). */
export function skipStep(g: Save, w: WorldDef): string[] {
    if (!canSkip(g, w)) return [];
    const out = finishStep(g, w, goalsState(g), activeGoal(g, w)!);
    return [...out, ...checkGoals(g, w)];
}

/* ---------- leading you to a goal (D-7) ---------- */

/** No goal followed and one to pick: the Goals app's badge. */
export function needsPick(g: Save, w: WorldDef): boolean {
    if (!systemOn(w, 'goals')) return false;
    const s = goalsState(g);
    return !activeGoal(g, w) && offeredGoals(g, w).some(x => !s.done.includes(x.id));
}
// One notice each time you're left without a goal (a new game, a goal just finished); never blocks anything.
function pickNotice(g: Save, w: WorldDef): string[] {
    const s = goalsState(g), at = `pick:${s.done.length}`;
    if (s.told === at || !needsPick(g, w)) return [];
    s.told = at;
    const text = s.done.length ? 'Pick your next life goal in the Goals app.' : 'Pick a life goal in the Goals app: it guides your days, and finishing it gives you a perk.';
    s.notice = { text, day: g.day };
    return [text];
}

/* ---------- for the screens ---------- */

/** Steps done of a goal, how many it has, and whether it's finished, followed, or paused with progress kept. */
export function goalProgress(g: Save, w: WorldDef, id: string): { done: number; total: number; finished: boolean; active: boolean; paused: boolean } {
    const s = goalsState(g), goal = goalOf(w, id), total = goal?.steps.length ?? 0, finished = s.done.includes(fold(id));
    const done = finished ? total : Math.min(total, s.steps[fold(id)] ?? 0);
    return { done, total, finished, active: s.active === fold(id), paused: !finished && s.active !== fold(id) && (done > 0 || !!s.counts[fold(id)]) };
}
/** One objective of a step as the Goals app shows it: the condition's text, whether it holds, and where a number says
 *  how far you are (`have` of `need`: meals cooked 6 of 15, Cooking 3 of 5, places visited, money saved). */
export interface Objective { text: string; key: string; not: boolean; ok: boolean; have?: number; need?: number }
/** The current step of a goal (or `step`), each way of doing it with its objectives, and its hold (days held so far, days
 *  it needs). Counts are the goal's own (D-8). */
export function stepProgress(g: Save, w: WorldDef, id: string, step?: number): { step: number; name: string; ways: Objective[][]; hold?: { days: number; need: number } } | null {
    const goal = goalOf(w, id); if (!goal) return null;
    const s = goalsState(g), i = step ?? Math.min(goal.steps.length - 1, s.steps[goal.id] ?? 0), st = goal.steps[i];
    if (!st) return null;
    const live = st.hold && s.active === goal.id && (s.steps[goal.id] ?? 0) === i;
    const ways = waysOf(st).map(way => parseWhen(way).conds.map(c => {
        const text = `${c.key}: ${c.not ? 'not ' : ''}${c.values.join(' or ')}`;
        const count = live ? heldCount(g, s, goal.id, readsOf(w, way).not) : (k: string) => goalCount(g, goal.id, k);
        const o: Objective = { text, key: c.key, not: c.not, ok: whenHolds(g, w, text, { count }) };
        const v = c.values[0];
        if ((c.key === 'did' || c.key === 'attended') && !c.not && c.values.length === 1) {
            const x = countedOf(c.key, v);
            if (x && !x.with) { o.have = count(countKey(w, c.key, x.what)); o.need = x.n; }
        } else if (c.key === 'skill' && !c.not) {
            const m = v.match(SKILL);
            if (m && m[1] !== 'any' && !SKILL_GROUPS[m[1]]) { o.have = levelOf(g, m[1]); o.need = Number(m[2]); }
        } else if (c.key === 'money' && !c.not) { o.have = g.player.money; o.need = moneyAmount(w, v); }
        else if (c.key === 'visited' && /^\d+$/.test(v)) { o.have = placesBeen(g).length; o.need = Number(v); }
        else if (c.key === 'visited' && !c.not && c.values.length === 1) {
            const m = v.match(VISITED_N), map = m?.[3] ? (m[3].toLowerCase() === 'home' ? homeMap(g, w) : m[3]) : undefined;
            if (m && (m[2] || m[3])) { const on = map === '' ? [] : countable(w, map); o.have = on.filter(p => (m[2] ? isRegular(g, p.id) : placesBeen(g).includes(p.id))).length; o.need = Number(m[1]); }
        }
        return o;
    }));
    const h = st.hold ? { days: s.hold && s.hold.goal === goal.id && s.hold.step === i ? Math.floor((nowAbs(g) - s.hold.from) / 1440) : 0, need: st.hold === 'season' ? seasonDays(g) : st.hold } : undefined;
    return { step: i, name: st.name, ways, ...(h ? { hold: h } : {}) };
}
/** Goals to suggest (D-7): those made for your start first, then those with progress, then the ones in the categories
 *  you've finished least; never a finished one or the one you follow. */
export function suggestedGoals(g: Save, w: WorldDef, n = 3): GoalDef[] {
    const s = goalsState(g), start = (g.player as any).start ?? g.player.origin;
    const list = offeredGoals(g, w).filter(x => !s.done.includes(x.id) && s.active !== x.id);
    const doneIn = (cat: string) => s.done.filter(id => goalOf(w, id)?.category === cat).length;
    const tier = (x: GoalDef) => ((x.starts ?? []).includes(start) ? 0 : goalProgress(g, w, x.id).paused ? 1 : 2);
    return list.map((x, i) => ({ x, i })).sort((a, b) => tier(a.x) - tier(b.x) || doneIn(a.x.category) - doneIn(b.x.category) || a.i - b.i).slice(0, n).map(y => y.x);
}
/** The perks you have, from the goals you finished (in the order you finished them). */
export function perksOf(g: Save, w: WorldDef): { goal: string; goalName: string; name: string; desc: string; effects: EffectDef[] }[] {
    return goalsState(g).done.map(id => goalOf(w, id)).filter((x): x is GoalDef => !!x?.perk)
        .map(x => ({ goal: x.id, goalName: x.name, name: x.perk!.name, desc: x.perk!.desc ?? '', effects: x.perk!.effects }));
}
export { GOAL_CATEGORIES };

/* ---------- the AI (G12) ---------- */

/** What the AI is told about your goal (the `you` block): its name, nothing about perks (D-5). */
export function goalLine(g: Save, w: WorldDef): string {
    const goal = activeGoal(g, w);
    return goal ? `{{user}}'s life goal: ${goal.name.toLowerCase()}.` : '';
}

/* ---------- the old names (until the Goals app and the profile are drawn from this file) ---------- */

/** The shape the old Goals app reads: a goal and its progress in steps. */
export interface Aspiration { id: string; name: string; icon: string; desc: string; reward?: string; check: (g: Save, w: WorldDef) => [number, number] }
export const ASPIRATIONS: Aspiration[] = GENERAL_GOALS.map(x => ({ id: x.id, name: x.name, icon: x.icon ?? '⭐', desc: x.desc ?? '', reward: x.perk?.name,
    check: (g: Save, w: WorldDef) => { const p = goalProgress(g, w, x.id); return [p.done, p.total]; } }));
export const aspirationOf = (g: Save): Aspiration | null => ASPIRATIONS.find(a => a.id === goalsState(g).active) ?? null;
export function setAspiration(g: Save, id: string) { const w = getWorld(g.world); if (w) pickGoal(g, w, id); }

/* ---------- hooks ---------- */

onHour.push((g, w) => checkGoals(g, w));
goalLink.active = g => goalsState(g).active;
goalLink.canSkip = canSkip;
goalLink.skip = skipStep;
