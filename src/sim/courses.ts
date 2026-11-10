// Courses you take (at home, online, or at the university). A course lasts as long as the calendar says (a share of a
// game year, or its days), has classes inside that span (its schedule, else five a week), teaches its skills a little
// with every class you attend and gives their levels for good when it's finished. Up to two at once. Missing classes
// is allowed up to a point (10% free), then they cost make-up classes and, past a cap, the course fails. Long programs
// are paid by the season, and aid (an employer, a school, the public benefit) can pay part of a fee. What the save
// keeps is `player.learning` (see `Learning`). (Skills themselves, with their levels, are in hobbies.ts; the job
// interview and the traits you gain are in skills.ts; the boss's message about a course is in coursenudge.ts.)
import type { Save } from '../core/store.js';
import type { WorldDef, Occupation, Course, CourseAid } from '../core/world.js';
import { systemOn, isScenario } from '../core/world.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { priceOf } from './bills.js';
import { playerHomeId, placeOf } from './places.js';
import { setSkillLevel, skillName, trainSkill, LEVELS } from './hobbies.js';
import { gainTrait } from './skills.js';
import { effectMul } from './effects.js';
import { whenHolds, parseWhen } from './when.js';
import { onDay } from './hooks.js';
import { seasonDays, hm } from './time.js';
import { money } from './needs.js';
import { lex } from '../core/lexicon.js';
import { workRules, jobDef, shiftOn } from './work.js';

export const coursesOf = (w: WorldDef): Course[] => (systemOn(w, 'courses') ? (w.catalogs as any).courses ?? [] : []) as Course[];
/** What a world offers now: its courses except the retired ones (a save taking a retired one can still finish it). */
export const offeredOf = (w: WorldDef): Course[] => coursesOf(w).filter(c => !c.retired);

/** The aid a player took with a course: what was received (`got`), so a stay commitment and a refund can be worked out. */
export interface TakenAid { id: string; name: string; kind: CourseAid['kind']; share: number; pays: 'enroll' | 'finish'; stay: boolean; job?: string; got: number }
/** A message in the work app (the manager's, when no one in the world is the boss). */
export interface WorkMsg { day: number; from: string; job: string; course: string; text: string; facts: string }
/** What the save keeps for courses and life goals' counters. */
export interface Learning {
    /** The old single course (saves before two at once); read once into `taking` and dropped. */
    current?: string;
    /** Per course being taken: the credit gained (a class is worth 1, less while two are taken, more with *Well read*). */
    progress: Record<string, number>; lastDay: Record<string, number>; done: string[]; count: Record<string, number>; interviews: Record<string, number>; earned: string[];
    /** The courses being taken (two at most). */
    taking: string[];
    /** Per course: the last season whose fee is paid, the day it started, classes missed, make-up classes owed. */
    paid: Record<string, number>; start: Record<string, number>; missed: Record<string, number>; makeups: Record<string, number>;
    /** Per course and skill: the experience the course has given in all, across every attempt. */
    gave: Record<string, Record<string, number>>;
    /** Per course being taken: the plan fixed at enrollment (days, classes, scheduled or not), classes attended (the credited
     *  half of a failed attempt included), the last day settled, days paused, money owed, fees charged (before aid), the aid. */
    plan: Record<string, { span: number; n: number; sched: boolean }>; attended: Record<string, number>; settled: Record<string, number>;
    held: Record<string, number>; due: Record<string, number>; fees: Record<string, number>; aid: Record<string, TakenAid>;
    /** Per course: the warning said last (so each is said once). */
    warned: Record<string, number>;
    /** Per course left unfinished: the day, the classes attended, and whether the half credit was used (once per course). */
    failed: Record<string, { day: number; attended: number; used?: boolean }>;
    /** Stay commitments after full aid (leaving that job before `until` pays back what is left of the season), and what is owed. */
    stay: { course: string; job: string; until: number; amount: number; name: string }[]; owed: number;
    /** The job you hold and since when (for aid that asks for a job held a season), as seen once a day. */
    tenure?: { job: string; day: number };
    /** The boss's messages: per `job|course`, the days they were sent; and the manager's own, shown in the work app. */
    nudged: Record<string, number[]>; inbox: WorkMsg[];
}
export function learning(g: Save): Learning {
    const p = g.player as any;
    const s = (p.learning ??= {});
    s.progress ??= {}; s.lastDay ??= {}; s.done ??= []; s.count ??= {}; s.interviews ??= {}; s.earned ??= [];
    s.paid ??= {}; s.start ??= {}; s.missed ??= {}; s.makeups ??= {}; s.gave ??= {}; s.plan ??= {}; s.attended ??= {}; s.settled ??= {};
    s.held ??= {}; s.due ??= {}; s.fees ??= {}; s.aid ??= {}; s.warned ??= {}; s.failed ??= {}; s.stay ??= []; s.owed ??= 0; s.nudged ??= {}; s.inbox ??= [];
    // a save from before two at once: the one course becomes the list (a migration may have done it already)
    if (!Array.isArray(s.taking)) s.taking = s.current ? [s.current] : [];
    if (s.current !== undefined) delete s.current;
    return s as Learning;
}

export const courseOf = (w: WorldDef, id?: string) => coursesOf(w).find(c => c.id === id);
export const hasCourse = (g: Save, id: string) => learning(g).done.includes(id);
export const isTaking = (g: Save, id: string) => learning(g).taking.includes(id);
/** The courses you are taking that the world still has (retired ones too). */
export const takingNow = (g: Save, w: WorldDef): Course[] => learning(g).taking.map(id => courseOf(w, id)).filter((c): c is Course => !!c);
export const canStudyHere = (g: Save, w: WorldDef) => isScenario(w) || g.player.loc === playerHomeId || (placeOf(g, w, g.player.loc)?.tags ?? []).includes('study');
export const studiedToday = (g: Save, id: string) => learning(g).lastDay[id] === g.day;

/* ---------- how long a course is, and its classes ---------- */

/** The days a course lasts in this game: a share of the game year (so it follows the season length) at the work preset's
 *  speed, else its `days`. */
export function spanOf(g: Save, w: WorldDef, c: Course): number {
    if (!c.length) return Math.max(1, Math.round(c.days));
    return Math.max(1, Math.round((4 * seasonDays(g) * c.length) / Math.max(0.05, workRules(g, w).speed)));
}
/** Without a schedule a course asks for five classes in every seven days, any days. */
const PACE = 5 / 7;
const STEP = 30;
/** The hours of a scheduled class on a day (minutes of the day), or null when there's none (or no schedule). */
export function classWindow(g: Save, w: WorldDef, c: Course, day: number): { from: number; to: number } | null {
    if (!c.when || parseWhen(c.when).error) return null;
    const place = c.at ?? g.player.loc;
    if (!whenHolds(g, w, c.when, { place, at: day * 1440, day: true })) return null;
    let from = -1, to = -1;
    for (let m = 0; m < 1440; m += STEP) if (whenHolds(g, w, c.when, { place, at: day * 1440 + m })) { if (from < 0) from = m; to = m + STEP; }
    return from < 0 ? null : { from, to };
}
/** A class's hours as words ("19:00–21:00"). */
export const windowText = (win: { from: number; to: number }) => `${hm(win.from)}–${hm(win.to % 1440)}`;
// Today's class is no use for a plan if its hours are over.
const overToday = (g: Save, w: WorldDef, c: Course, day: number) => { const win = classWindow(g, w, c, day); return !!win && day === g.day && g.minutes >= win.to; };
/** The plan for a course that starts today: its span, how many classes it has (the scheduled days in the span, else five a
 *  week) and whether they are scheduled. A schedule that never meets is read as none. */
export function planFor(g: Save, w: WorldDef, c: Course): { span: number; n: number; sched: boolean } {
    const span = spanOf(g, w, c);
    if (c.when) {
        let n = 0;
        for (let d = g.day; d < g.day + span; d++) if (classWindow(g, w, c, d) && !overToday(g, w, c, d)) n++;
        if (n > 0) return { span, n, sched: true };
    }
    return { span, n: Math.max(1, Math.round(span * PACE)), sched: false };
}
/** Misses allowed without a penalty (10% of the classes, at least one), and make-up classes allowed (20%, at least two). */
export const freeOf = (n: number) => Math.max(1, Math.floor(n * 0.1 + 1e-9));
export const capOf = (n: number) => Math.max(2, Math.floor(n * 0.2 + 1e-9));
/** Taking two courses makes each class count 0.85; *Well read* and the like multiply it. */
export const TWO_AT_ONCE = 0.85;
export const classWorth = (g: Save, w: WorldDef, taking = learning(g).taking.length) => (taking >= 2 ? TWO_AT_ONCE : 1) * effectMul(g, w, 'study');
/** Classes a course runs over its plan while two are taken (14 become 17), shown from enrollment. */
export const extraWhileTwo = (g: Save, w: WorldDef, n: number) => Math.max(0, Math.ceil(n / (TWO_AT_ONCE * effectMul(g, w, 'study')) - 1e-9) - n);

/* ---------- shifts, places and hours ---------- */

/** A scheduled class that falls in your shift that day (a day off, a vacation, takes the clash away). */
export function clashOn(g: Save, w: WorldDef, c: Course, day: number): boolean {
    if (!c.when || !systemOn(w, 'jobs')) return false;
    const j = g.player.job as any; const o = j && jobDef(w, j.id);
    if (!o || j.off?.[day]) return false;
    const win = classWindow(g, w, c, day); if (!win) return false;
    const a = day * 1440 + win.from, b = day * 1440 + win.to;
    return [day - 1, day].some(d => { const s = shiftOn(g, w, o, d); return !!s && s.start < b && s.end > a && !j.off?.[d]; });
}
/** How many of a course's classes (from today, over its span) clash with your shifts: said before you enroll. */
export function clashCount(g: Save, w: WorldDef, c: Course): { clashes: number; of: number } {
    const p = planFor(g, w, c);
    if (!p.sched) return { clashes: 0, of: p.n };
    let k = 0;
    for (let d = g.day; d < g.day + p.span; d++) if (!overToday(g, w, c, d) && clashOn(g, w, c, d)) k++;
    return { clashes: k, of: p.n };
}
/** Why you can't study this course right now ('' when you can). */
export function studyBlock(g: Save, w: WorldDef, c: Course): string {
    const l = learning(g);
    if (!l.taking.includes(c.id)) return 'You are not taking this course.';
    if (studiedToday(g, c.id)) return 'You already studied today. Come back tomorrow.';
    if (dueOf(l, c.id) > 0) return `The fee for ${c.name} is unpaid (${money(w, dueOf(l, c.id))}): the course is on hold.`;
    if (c.at ? g.player.loc !== c.at : !canStudyHere(g, w)) return c.at ? `${c.name} is taught at ${placeOf(g, w, c.at)?.name ?? 'its own place'}.` : 'You can study at home or at a place for it.';
    const p = l.plan[c.id];
    if (p?.sched) {
        const win = classWindow(g, w, c, g.day);
        if (!win) return 'There is no class today.';
        if (g.minutes < win.from || g.minutes >= win.to) return `Class is ${windowText(win)}.`;
        if (clashOn(g, w, c, g.day)) return 'You are due at work then.';
    }
    return '';
}
const dueOf = (l: Learning, id: string) => l.due[id] ?? 0;

/* ---------- money: fees, make-up classes, aid ---------- */

const seasonNo = (g: Save, day: number) => Math.floor((Math.max(1, day) - 1) / seasonDays(g));
/** Charged by the season: a course that says so, or one longer than a season. */
export const perSeason = (g: Save, w: WorldDef, c: Course) => c.perSeason ?? spanOf(g, w, c) > seasonDays(g);
const feeOf = (g: Save, c: Course) => priceOf(g, c.cost);
/** What you pay now, or owe when you can't (the course is on hold until it's paid). */
function charge(g: Save, w: WorldDef, l: Learning, id: string, amount: number, text: string) {
    amount = Math.round(amount); if (amount <= 0) return;
    if (g.player.money >= amount) { g.player.money -= amount; book(g, text, -amount); } else l.due[id] = dueOf(l, id) + amount;
}
// A season's days over which the classes run, for pro rata charges.
const classesPerSeason = (g: Save, p: { span: number; n: number }) => Math.max(1, (p.n * seasonDays(g)) / Math.max(1, p.span));

const tenureDays = (g: Save) => { const j = g.player.job, t = learning(g).tenure; return j && t && t.job === j.id ? g.day - t.day : 0; };
/** Does this aid apply to you now? `merit` aid is decided when you enroll and kept. */
function qualifies(g: Save, w: WorldDef, c: Course, a: CourseAid, enrolling: boolean): boolean {
    const l = learning(g), j = g.player.job;
    // a merit scholarship is decided when you enroll and kept for the later fees, whatever your skills do after
    if (a.kind === 'merit' && !enrolling) return l.aid[c.id]?.id === a.id;
    if (a.kind === 'employer' && !j) return false;
    if (a.jobless && j) return false;
    if (a.held && tenureDays(g) < a.held * seasonDays(g)) return false;
    return whenHolds(g, w, a.when);
}
const paysAt = (a: CourseAid): 'enroll' | 'finish' => a.pays ?? (a.kind === 'public' ? 'finish' : 'enroll');
/** The one aid that helps most (the biggest share; paid at enrollment before one refunded at the end); never two. */
export function bestAid(g: Save, w: WorldDef, c: Course, enrolling = false): CourseAid | null {
    const list = (c.aid ?? []).filter(a => a.share > 0 && qualifies(g, w, c, a, enrolling));
    list.sort((a, b) => b.share - a.share || (paysAt(a) === 'enroll' ? -1 : 1) - (paysAt(b) === 'enroll' ? -1 : 1));
    return list[0] ?? null;
}
/** A fee after the aid that comes off at once; keeps what the aid paid. */
function netFee(g: Save, w: WorldDef, c: Course, nominal: number, enrolling: boolean): number {
    const l = learning(g); const a = bestAid(g, w, c, enrolling);
    if (!a) return nominal;
    const j = g.player.job;
    // (the aid you took stays on record with what it paid, even when another one helps more at a later fee)
    const taken = (l.aid[c.id] ??= { id: a.id, name: a.name, kind: a.kind, share: a.share, pays: paysAt(a), stay: !!a.stay, job: j?.id, got: 0 });
    Object.assign(taken, { id: a.id, name: a.name, kind: a.kind, share: a.share, pays: paysAt(a), stay: !!a.stay, job: j?.id });
    if (paysAt(a) !== 'enroll') return nominal;
    const off = Math.round(nominal * a.share);
    taken.got += off;
    return nominal - off;
}
/** What the best aid would do for this course now, in words (the window and the boss's message). */
export function aidText(g: Save, w: WorldDef, c: Course): string {
    const a = bestAid(g, w, c, true); if (!a) return '';
    const pct = `${Math.round(a.share * 100)}%`;
    const stay = a.stay ? `, if you stay a season at ${a.kind === 'employer' ? 'your job' : 'it'} after finishing` : '';
    return `${a.name}: ${pct} of the fee ${paysAt(a) === 'finish' ? 'back when you finish' : 'paid for you'}${stay}.`;
}

/* ---------- the state of a course you take ---------- */

/** Where a course you take stands: the screens' and the warnings' one source. */
export interface CourseState {
    id: string; n: number; span: number; start: number; endDay: number; sched: boolean; attended: number; credit: number; missed: number;
    free: number; freeLeft: number; makeups: number; cap: number; extra: number; toGo: number; worth: number;
    paused: boolean; due: number; warn: '' | 'half' | 'all' | 'edge'; studied: boolean; next: number | null;
}
const ensure = (g: Save, w: WorldDef, c: Course) => {
    const l = learning(g);
    // a course taken before the plan existed starts from today with the world's numbers
    if (!l.plan[c.id]) { l.plan[c.id] = planFor(g, w, c); l.start[c.id] ??= g.day; l.settled[c.id] ??= g.day - 1; }
    l.start[c.id] ??= g.day; l.settled[c.id] ??= g.day - 1;
    l.progress[c.id] ??= 0; l.attended[c.id] ??= Math.floor(l.progress[c.id]); l.missed[c.id] ??= 0; l.makeups[c.id] ??= 0;
    return l.plan[c.id];
};
const warnLevel = (missed: number, free: number, makeups: number, cap: number): 0 | 1 | 2 | 3 =>
    makeups >= cap ? 3 : missed >= free ? 2 : free > 1 && missed >= Math.ceil(free / 2) ? 1 : 0;
export function nextClass(g: Save, w: WorldDef, c: Course): number | null {
    if (!c.when) return null;
    for (let d = g.day; d < g.day + 40; d++) { const win = classWindow(g, w, c, d); if (win && !(d === g.day && (g.minutes >= win.to || studiedToday(g, c.id)))) return d; }
    return null;
}
export function stateOf(g: Save, w: WorldDef, c: Course): CourseState | null {
    const l = learning(g); if (!l.taking.includes(c.id)) return null;
    const p = ensure(g, w, c), n = p.n, free = freeOf(n), cap = capOf(n);
    const credit = l.progress[c.id] ?? 0, worth = classWorth(g, w), missed = l.missed[c.id] ?? 0, makeups = l.makeups[c.id] ?? 0;
    const endDay = l.start[c.id] + p.span + (l.held[c.id] ?? 0) - 1;
    const w2 = warnLevel(missed, free, makeups, cap);
    return { id: c.id, n, span: p.span, start: l.start[c.id], endDay, sched: p.sched, attended: l.attended[c.id] ?? 0, credit, missed, free, freeLeft: Math.max(0, free - missed), makeups, cap,
        extra: extraWhileTwo(g, w, n), toGo: Math.max(0, Math.ceil((n - credit) / worth - 1e-9)), worth, paused: dueOf(l, c.id) > 0, due: dueOf(l, c.id),
        warn: (['', 'half', 'all', 'edge'] as const)[w2], studied: studiedToday(g, c.id), next: nextClass(g, w, c) };
}
/** The warning in words ('' when there's none), for the phone and the day's messages. */
export function warningText(g: Save, w: WorldDef, c: Course, s: CourseState): string {
    const cost = perSeason(g, w, c) ? 'a make-up class (charged by the class if it runs into a new season)' : `a make-up class, ${money(w, Math.round(feeOf(g, c) / s.n))}`;
    if (s.warn === 'edge') return `${c.name}: one more missed class and you fail the course (${s.makeups} of ${s.cap} make-up classes used).`;
    if (s.warn === 'all') return `${c.name}: you have used all ${s.free} free missed class${s.free === 1 ? '' : 'es'}. The next one adds ${cost}.`;
    if (s.warn === 'half') return `${c.name}: you have missed ${s.missed} of ${s.free} free classes.`;
    return '';
}
/** All the warnings for the courses you take (the phone's courses page). */
export const courseWarnings = (g: Save, w: WorldDef): string[] =>
    takingNow(g, w).map(c => { const s = stateOf(g, w, c); return s ? warningText(g, w, c, s) : ''; }).filter(Boolean);

/* ---------- enrolling, studying, finishing, failing ---------- */

/** What a course asks for before you can enroll, in words (skills and courses by name; anything else "something more"). */
export function needsText(g: Save, w: WorldDef, c: Course): string {
    if (!c.needs) return '';
    const out: string[] = [];
    for (const cond of parseWhen(c.needs).conds) {
        const text = `${cond.not ? 'not ' : ''}${cond.key}: ${cond.values.join(' or ')}`;
        if (whenHolds(g, w, text)) continue;
        if (cond.key === 'skill' && !cond.not) out.push(cond.values.map(v => { const [id, n] = v.split(/\s+/); return `${skillName(w, id)} ${n ?? ''}`.trim(); }).join(' or '));
        else if (cond.key === 'course' && !cond.not) out.push(cond.values.map(v => (/^\d+$/.test(v) ? `${v} courses finished` : courseOf(w, v)?.name ?? v)).join(' or '));
        else out.push('something more');
    }
    return [...new Set(out)].join(', ');
}
export function enroll(g: Save, w: WorldDef, id: string): string {
    const c = courseOf(w, id); if (!c) return '';
    if (c.retired) return 'This course is not offered any more.';
    const l = learning(g);
    if (l.taking.includes(id)) return 'You are already taking this course.';
    if (l.taking.length >= 2) return 'You can take two courses at most. Finish or drop one first.';
    if (l.done.includes(id)) return 'You already finished this course.';
    if (c.needs && !whenHolds(g, w, c.needs)) return `This course asks for ${needsText(g, w, c) || 'more'} first.`;
    const nominal = feeOf(g, c);
    const wasAid = l.aid[id]; delete l.aid[id];
    const price = netFee(g, w, c, nominal, true);
    if (g.player.money < price) { if (wasAid) l.aid[id] = wasAid; else delete l.aid[id]; return 'Not enough money.'; }
    g.player.money -= price; book(g, `Course: ${c.name}`, -price);
    l.taking.push(id); l.start[id] = g.day; l.fees[id] = nominal; l.paid[id] = seasonNo(g, g.day);
    l.plan[id] = planFor(g, w, c);
    l.missed[id] = 0; l.makeups[id] = 0; l.held[id] = 0; delete l.due[id]; delete l.warned[id];
    l.settled[id] = overToday(g, w, c, g.day) ? g.day : g.day - 1;
    // a course left half-done counts half the classes you attended, once per course, within a year
    const f = l.failed[id], year = 4 * seasonDays(g);
    const credited = f && !f.used && g.day - f.day <= year ? Math.floor(f.attended / 2) : 0;
    if (f && !f.used && credited > 0) f.used = true;
    l.progress[id] = credited; l.attended[id] = credited;
    const a = l.aid[id];
    note(g, '{u} enrolled in a course: {0}.', [c.name], [], g.player.loc, 'study');
    if (a) note(g, '{0} helped {u} with the course "{1}".', [a.name, c.name], [], g.player.loc, 'study');
    return '';
}
const clear = (l: Learning, id: string) => {
    l.taking = l.taking.filter(x => x !== id);
    for (const k of ['progress', 'start', 'missed', 'makeups', 'plan', 'attended', 'settled', 'held', 'due', 'fees', 'paid', 'warned'] as const) delete (l[k] as any)[id];
    delete l.warned[`${id}|hold`];
};
// Leaving a course unfinished (dropped or failed): the classes attended stay on record for the half credit, once.
function leave(g: Save, l: Learning, id: string) {
    const attended = l.attended[id] ?? 0, prev = l.failed[id];
    l.failed[id] = { day: g.day, attended, used: !!prev?.used };
    delete l.aid[id];
    clear(l, id);
}
export function dropCourse(g: Save, id?: string) {
    const l = learning(g); const which = id ?? (l.taking.length === 1 ? l.taking[0] : '');
    if (which && l.taking.includes(which)) leave(g, l, which);
}
function fail(g: Save, w: WorldDef, c: Course, out: string[]) {
    leave(g, learning(g), c.id);
    note(g, '{u} failed the course "{0}": too many missed classes.', [c.name], [], g.player.loc, 'study');
    out.push(`You failed ${c.name}: too many missed classes. What you learned stays, but there is no certificate. If you enroll again within a year, half the classes you attended count (once).`);
}
function finish(g: Save, w: WorldDef, c: Course, out: string[]) {
    const l = learning(g);
    const taken = l.aid[c.id], fees = l.fees[c.id] ?? 0;
    clear(l, c.id); delete l.failed[c.id];
    l.done.push(c.id);
    const got = (c.grants ?? []).filter(t => gainTrait(g, t, 'course'));
    for (const [sid, n] of Object.entries(c.skills ?? {})) setSkillLevel(g, sid, n);
    const taught = Object.entries(c.skills ?? {}).map(([sid, n]) => `${skillName(w, sid)} ${n}`);
    note(g, '{u} finished the course "{0}".', [c.name], [], g.player.loc, 'study');
    let extra = '';
    if (taken) {
        if (taken.pays === 'finish') {
            const back = Math.round(fees * taken.share);
            if (back > 0) { g.player.money += back; book(g, `Refund: ${taken.name}`, back); extra += ` ${taken.name} paid back ${back}.`; }
            taken.got += back;
        }
        if (taken.stay && taken.job && taken.got > 0) {
            l.stay.push({ course: c.id, job: taken.job, until: g.day + seasonDays(g), amount: taken.got, name: taken.name });
            extra += ` You promised ${taken.name} to stay a season: leaving sooner pays back the rest of it.`;
        }
        delete l.aid[c.id];
    }
    out.push(`You finished ${c.name}!${got.length ? ` You are now ${got.join(' and ')}.` : ''}${taught.length ? ` Skills: ${taught.join(', ')}.` : ''}${extra}`);
}
/** One class (once a day): credit, experience toward the course's skills (never more than its full amount in all), and the
 *  last class finishes the course. Without an id, the one course you take. */
export function studySession(g: Save, w: WorldDef, id?: string): string[] {
    const l = learning(g);
    const c = courseOf(w, id ?? (l.taking.length === 1 ? l.taking[0] : '')); if (!c || !l.taking.includes(c.id)) return [];
    if (studiedToday(g, c.id)) return ['You already studied today. Come back tomorrow.'];
    const p = ensure(g, w, c), worth = classWorth(g, w);
    l.lastDay[c.id] = g.day;
    l.attended[c.id] = (l.attended[c.id] ?? 0) + 1;
    l.progress[c.id] = (l.progress[c.id] ?? 0) + worth;
    const out: string[] = [];
    // a make-up class that runs into a season not paid yet costs that season's fee by the class
    const end = l.start[c.id] + p.span + (l.held[c.id] ?? 0) - 1;
    if (perSeason(g, w, c) && g.day > end && seasonNo(g, g.day) > (l.paid[c.id] ?? -1)) {
        const nominal = feeOf(g, c) / classesPerSeason(g, p);
        l.fees[c.id] = (l.fees[c.id] ?? 0) + nominal;
        charge(g, w, l, c.id, netFee(g, w, c, nominal, false), `Make-up class: ${c.name}`);
    }
    for (const [sid, level] of Object.entries(c.skills ?? {})) {
        const full = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.round(level)))];
        const gave = (l.gave[c.id] ??= {}), room = full - (gave[sid] ?? 0);
        const amount = Math.min((full / p.n) * worth, room);
        if (amount <= 0) continue;
        gave[sid] = (gave[sid] ?? 0) + amount;
        out.push(...trainSkill(g, w, sid, amount));
    }
    if (l.progress[c.id] >= p.n - 1e-6) { finish(g, w, c, out); return out; }
    const s = stateOf(g, w, c)!;
    out.unshift(`${c.name}: class ${s.attended} of ${s.n} done.${s.freeLeft ? ` You can still miss ${s.freeLeft} without a penalty.` : ''}`);
    return out;
}

/* ---------- every day: classes missed, fees, aid ---------- */

// A class missed: free ones count as attended (without the experience), later ones add a make-up class and its cost;
// past the cap the course is failed. Returns what ended it.
function miss(g: Save, w: WorldDef, c: Course, out: string[]): 'done' | 'failed' | null {
    const l = learning(g), p = l.plan[c.id];
    l.missed[c.id] = (l.missed[c.id] ?? 0) + 1;
    if (l.missed[c.id] <= freeOf(p.n)) {
        l.progress[c.id] = (l.progress[c.id] ?? 0) + classWorth(g, w);
        if (l.progress[c.id] >= p.n - 1e-6) { finish(g, w, c, out); return 'done'; }
        return null;
    }
    l.makeups[c.id] = (l.makeups[c.id] ?? 0) + 1;
    if (!perSeason(g, w, c)) charge(g, w, l, c.id, feeOf(g, c) / p.n, `Make-up class: ${c.name}`);
    if (l.makeups[c.id] > capOf(p.n)) { fail(g, w, c, out); return 'failed'; }
    return null;
}
// The days since the last settling, in order: paused days don't count and push the end; a scheduled class with no
// attendance is missed; without a schedule the count behind is taken at the end of the span, then every day of the
// five-in-seven pace.
function settle(g: Save, w: WorldDef, c: Course, out: string[]) {
    const l = learning(g), p = ensure(g, w, c);
    for (let d = (l.settled[c.id] ?? g.day - 1) + 1; d <= g.day - 1; d++) {
        l.settled[c.id] = d;
        if (dueOf(l, c.id) > 0) { l.held[c.id] = (l.held[c.id] ?? 0) + 1; continue; }
        const end = l.start[c.id] + p.span + (l.held[c.id] ?? 0) - 1, attended = l.lastDay[c.id] === d;
        let n = 0;
        if (p.sched) n = classWindow(g, w, c, d) && !attended ? 1 : 0;
        else if (d === end) n = Math.max(0, p.n - (l.attended[c.id] ?? 0));
        else if (d > end) n = (d - l.start[c.id]) % 7 < 5 && !attended ? 1 : 0;
        for (let i = 0; i < n; i++) if (miss(g, w, c, out)) return;
    }
    l.settled[c.id] = Math.max(l.settled[c.id] ?? 0, g.day - 1);
}
// The season's fee, once per season while the course is running (past its planned end, make-ups pay by the class).
function seasonFees(g: Save, w: WorldDef, c: Course) {
    const l = learning(g), p = ensure(g, w, c);
    if (!perSeason(g, w, c)) return;
    const end = l.start[c.id] + p.span + (l.held[c.id] ?? 0) - 1;
    for (let s = (l.paid[c.id] ?? seasonNo(g, g.day)) + 1; s <= seasonNo(g, g.day); s++) {
        if (s * seasonDays(g) + 1 > end) break;
        l.paid[c.id] = s;
        const nominal = feeOf(g, c);
        l.fees[c.id] = (l.fees[c.id] ?? 0) + nominal;
        charge(g, w, l, c.id, netFee(g, w, c, nominal, false), `Course fee: ${c.name}`);
    }
}
function payUp(g: Save, w: WorldDef, l: Learning, out: string[]) {
    if (l.owed > 0 && g.player.money > 0) { const pay = Math.min(g.player.money, l.owed); g.player.money -= pay; l.owed -= pay; book(g, 'Paying back a course sponsorship', -pay); if (!l.owed) out.push('You have paid back your course sponsorship.'); }
    for (const id of Object.keys(l.due)) {
        const d = l.due[id];
        if (d > 0 && l.taking.includes(id) && g.player.money >= d) { g.player.money -= d; book(g, `Course fee: ${courseOf(w, id)?.name ?? id}`, -d); delete l.due[id]; delete l.warned[`${id}|hold`]; out.push(`You paid ${money(w, d)} for ${courseOf(w, id)?.name ?? id}: classes go on.`); }
    }
}
/** Pay what a course is waiting for (when you have it). */
export function payDue(g: Save, w: WorldDef, id: string): string {
    const l = learning(g), d = dueOf(l, id);
    if (!d) return '';
    if (g.player.money < d) return 'Not enough money.';
    g.player.money -= d; book(g, `Course fee: ${courseOf(w, id)?.name ?? id}`, -d); delete l.due[id]; delete l.warned[`${id}|hold`];
    return `You paid ${money(w, d)}: classes go on.`;
}
// Aid with a stay: leaving that job before the season is out pays back what is left of it.
function stays(g: Save, w: WorldDef, l: Learning, out: string[]) {
    for (const s of [...l.stay]) {
        if (g.day >= s.until) { l.stay.splice(l.stay.indexOf(s), 1); continue; }
        if (g.player.job?.id === s.job) continue;
        const back = Math.round(s.amount * (s.until - g.day) / seasonDays(g));
        l.stay.splice(l.stay.indexOf(s), 1);
        const pay = Math.min(g.player.money, back);
        g.player.money -= pay; if (pay) book(g, `Paying back: ${s.name}`, -pay);
        l.owed += back - pay;
        out.push(`You left before the season you promised ${s.name}: you owe them ${money(w, back)}${back > pay ? ` (${money(w, back - pay)} still to pay)` : ''}.`);
    }
}
function courseDay(g: Save, w: WorldDef): string[] {
    if (!systemOn(w, 'courses')) return [];
    const l = learning(g), out: string[] = [];
    const j = g.player.job;
    if (!j) delete l.tenure; else if (l.tenure?.job !== j.id) l.tenure = { job: j.id, day: g.day };
    // yesterday's classes are settled as they were (a fee unpaid yesterday held them), then what you can pay is paid
    for (const id of [...l.taking]) {
        const c = courseOf(w, id);
        if (!c) { clear(l, id); continue; }   // the world dropped it
        settle(g, w, c, out);
    }
    payUp(g, w, l, out);
    for (const id of [...l.taking]) {
        const c = courseOf(w, id)!;
        seasonFees(g, w, c);
        const s = stateOf(g, w, c)!, lvl = ['', 'half', 'all', 'edge'].indexOf(s.warn);
        if (lvl > (l.warned[id] ?? 0)) { l.warned[id] = lvl; out.push(warningText(g, w, c, s)); }
        const hold = `${id}|hold`;
        if (s.paused && l.warned[hold] !== s.due) { l.warned[hold] = s.due; out.push(`${c.name} is on hold until you pay ${money(w, s.due)}.`); }
    }
    stays(g, w, l, out);
    return out;
}
onDay.push(courseDay);

// (a course the world no longer offers is not asked for: the job would be out of reach forever; a course being taken
// counts for a job whose first rank is a student's, which you leave by finishing it)
export const missingCourses = (g: Save, w: WorldDef, o: Occupation) =>
    ((o as any).courses ?? []).filter((id: string) => { const c = courseOf(w, id); return !!c && !c.retired && !hasCourse(g, id) && !(o.ranks[0]?.student && isTaking(g, id)); }).map((id: string) => courseOf(w, id)?.name ?? id);

/* ---------- words for the screens and the boss's message ---------- */

const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A course's schedule as words ("Tue, Thu · 19:00–21:00"), '' without one. */
export function scheduleWords(c: Course): string {
    if (!c.when) return '';
    const p = parseWhen(c.when); if (p.error) return '';
    const days = p.conds.find(x => x.key === 'weekday' && !x.not)?.values.map(cap1).join(', ') ?? (p.conds.some(x => x.key === 'weekend' && !x.not && x.values[0] === 'yes') ? 'Weekends' : '');
    const hours = p.conds.find(x => x.key === 'clock' && !x.not)?.values.join(', ').replace(/-/g, '–') ?? '';
    return [days, hours].filter(Boolean).join(' · ');
}
/** Where a course is taught, in words. */
export const whereWords = (g: Save, w: WorldDef, c: Course) => (c.at ? `at ${placeOf(g, w, c.at)?.name ?? 'its own place'}` : lex(w, 'studyWhere'));
/** What a course is, as the engine says it (the boss's message, the window): classes, days, where, when, fee, aid. */
export function factsOf(g: Save, w: WorldDef, c: Course): string {
    const p = planFor(g, w, c), when = scheduleWords(c), fee = money(w, feeOf(g, c)), aid = aidText(g, w, c);
    return `${c.name}: ${p.n} classes over about ${p.span} days, ${whereWords(g, w, c)}${when ? `, ${when}` : ''}. Fee ${fee}${perSeason(g, w, c) ? ' a season' : ''}.${aid ? ` ${aid}` : ''}`;
}
