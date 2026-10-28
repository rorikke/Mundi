// Jobs: getting hired, a weekly schedule of shifts at the job's place (or off-screen), pay per hour (more for night
// hours, raised when the work rules give you fewer days), performance, days off, promotions that ask for time in the
// rank, performance and skills, careers that take about a game year to the top, and things that happen at work.
// The work rules (presets Realistic, Reduced, Relaxed, or your own) ease or switch off each pressure per save.
// Moving home and the bank's ledger live here too (the money side of the world).
import { hobbyFits, hobbyNeed, levelOf, trainSkill, skillName } from './hobbies.js';
import { addRep } from './standing.js';
import { lex } from '../core/lexicon.js';
import { bump, bondOf } from './social.js';
import { approvalOf } from './living.js';
import { npcRank } from './longlife.js';
import { missingCourses, triedToday, interview, countUp, hasCourse, courseOf } from './skills.js';
import { payOf, priceOf, resetBills, difficultyOf } from './bills.js';
import { note } from './facts.js';
import { cfg, nowAbs, type Save, type Resident } from '../core/store.js';
import { career, systemOn, getWorld, offScreenWork, isScenario, WEEKDAY_IDS, type WorldDef, type Occupation, type Branch, type Career, type Rank, type WorkEvent, type WorkChoice, type WorkResult } from '../core/world.js';
import { scheduleOf } from '../core/presets.js';
import { advance, hour, hm, seasonDays, WEEKDAYS } from './time.js';
import { addStatus, money } from './needs.js';
import { book } from './ledger.js';
import { onHour, onDay } from './hooks.js';
import { whenHolds, personNamed } from './when.js';
import { presentAt } from './people.js';
import { placeOf, travelMinutes } from './places.js';
import { ailOf } from './afflictions.js';
import { fr, YOU } from './rel.js';
export { ledger, book } from './ledger.js';
export { scheduleOf } from '../core/presets.js';

/** The player's job as the save keeps it. `shifts`: shifts worked in this rank (parts count for their part); `perf`:
 *  performance 0–100; `since`: when this rank began (absolute minutes); `shift`: the shift you work in a job worked
 *  round the clock; `worked`: recent days whose shift you worked (by the day it starts); `off`: days booked off
 *  (vacation or sick); `vac`: vacation days saved up; `checked`: the last day whose shift was looked at (missed or
 *  not); `warn`: steps taken for low performance; `event`: something that happened on the last shift, waiting for
 *  your choice. */
export interface JobState {
    id: string; rank: number; shifts: number; path?: string[]; referral?: string;
    perf?: number; since?: number; shift?: string; worked?: number[]; off?: Record<string, 'vacation' | 'sick'>;
    vac?: number; vacAt?: number; sickAt?: number; checked?: number; warn?: number; told?: number; bonus?: number;
    event?: { id: string; day: number };
}
const jobOf = (g: Save) => g.player.job as JobState | null;
export const jobDef = (w: WorldDef, id?: string | null) => w.occupations.find(o => o.id === id) ?? null;
export const traitsOf = (g: Save) => Object.values(g.player.traits ?? {}).flat();
export const fits = (g: Save, o: Occupation, w?: WorldDef | null) => (!o.needs?.length || o.needs.some(t => traitsOf(g).includes(t))) && hobbyFits(g, w ?? getWorld(g.world), o);
export const likes = (g: Save, o: Occupation) => careerOf(g, o).likes.filter(t => traitsOf(g).includes(t));
// The job's opening hours (whether it is open at all now).
export const isOpen = (g: Save, o: Occupation) => { const [a, b] = o.hours ?? [0, 24]; const h = hour(g); return a <= b ? h >= a && h < b : h >= a || h < b; };
// Adult content (E15): its switch is the new game's; until then, a save setting.
const adultOn = (g: Save) => !!(cfg(g) as any).adult;
/** (E20) Jobs open to the player: not the ones only the world's people have, nor adult ones without adult content. */
export const openJobs = (g: Save, w: WorldDef) => w.occupations.filter(o => o.hireable !== false && (!o.adult || adultOn(g)));
/** (E20) Worked off-screen: every job in a Home, and jobs marked so (you go to work from anywhere). */
export const offScreen = (w: WorldDef, o: Occupation | null | undefined) => offScreenWork(w) || !!o?.offScreen;
/** (E20) Where a rank works: its own place (an idol's top ranks at the TV studio), or the job's. */
export const rankPlace = (o: Occupation, rank: Rank | null | undefined) => rank?.place || o.place;
/** Where you work now (your rank's place). */
export const jobPlace = (g: Save, o: Occupation) => rankPlace(o, rankOf(g, o));
/** At the place where you can work your shift (anywhere for an off-screen job). */
export const atWork = (g: Save, w: WorldDef, o: Occupation) => offScreen(w, o) || g.player.loc === jobPlace(g, o);

/* ---------- the work rules (J9) ---------- */

export type PresetId = 'realistic' | 'reduced' | 'relaxed';
/** The rules work follows. `days`: share of each job's days you work (at least one); `missed`: performance lost for a
 *  missed shift; `grace`: minutes late before it counts (null: never); `low`: how far low performance goes (a
 *  warning, then a demotion, then being fired); `vacation`: days of work for each vacation day saved up (0: as many as
 *  you like); `sick`: when you may call in sick (only when really ill, now and then, any time); `events`: the chance
 *  of something happening on a shift (and of the boss asking for overtime); `gentle`: nothing at work turns out
 *  badly; `speed`: the save's career speed (×). */
export interface WorkRules { days: number; missed: number; grace: number | null; low: 'fire' | 'demote' | 'warn'; vacation: number; sick: 'ill' | 'sometimes' | 'any'; events: number; gentle: boolean; speed: number }
export const WORK_PRESETS: { id: PresetId; name: string; desc: string; rules: WorkRules }[] = [
    { id: 'realistic', name: 'Realistic', desc: 'Every job keeps its real days. A missed shift costs you, lateness counts after 15 minutes, and low performance can get you fired.',
        rules: { days: 1, missed: 10, grace: 15, low: 'fire', vacation: 14, sick: 'ill', events: 0.35, gentle: false, speed: 1 } },
    { id: 'reduced', name: 'Reduced', desc: 'About three quarters of the days, paid more per shift so a week earns the same. Gentler on absences and lateness; careers a little faster.',
        rules: { days: 0.75, missed: 5, grace: 30, low: 'demote', vacation: 7, sick: 'sometimes', events: 0.2, gentle: false, speed: 1.25 } },
    { id: 'relaxed', name: 'Relaxed', desc: 'About half the days, paid more per shift so a week earns the same. Skip a shift whenever you like; nothing at work goes badly; careers faster.',
        rules: { days: 0.5, missed: 0, grace: null, low: 'warn', vacation: 0, sick: 'any', events: 0.1, gentle: true, speed: 1.5 } },
];
interface WorkCfg { preset?: PresetId; custom?: Partial<WorkRules> }
const workCfg = (g: Save): WorkCfg => (((cfg(g) as any).work ??= {}) as WorkCfg);
/** The preset a world starts with: its own, or Relaxed in a Home (work is off-screen there), Realistic elsewhere. */
export const worldPreset = (w: WorldDef | null | undefined): PresetId => w?.workPreset ?? (isScenario(w) ? 'relaxed' : 'realistic');
export const presetOf = (g: Save, w: WorldDef) => WORK_PRESETS.find(p => p.id === (workCfg(g).preset ?? worldPreset(w))) ?? WORK_PRESETS[0];
/** The preset shown: 'custom' once one of its rules was changed. */
export const presetShown = (g: Save, w: WorldDef): PresetId | 'custom' => (Object.keys(workCfg(g).custom ?? {}).length ? 'custom' : presetOf(g, w).id);
export const workRules = (g: Save, w: WorldDef): WorkRules => ({ ...presetOf(g, w).rules, ...(workCfg(g).custom ?? {}) });
export function setPreset(g: Save, id: PresetId) { const c = workCfg(g); c.preset = id; delete c.custom; }
export function setRule<K extends keyof WorkRules>(g: Save, w: WorldDef, k: K, v: WorkRules[K]) {
    const c = workCfg(g); c.preset ??= presetOf(g, w).id;
    const custom = (c.custom ??= {});
    if (presetOf(g, w).rules[k] === v) delete custom[k]; else custom[k] = v;
    if (!Object.keys(custom).length) delete c.custom;
}
export const resetRules = (g: Save) => { delete (cfg(g) as any).work; };
/** (J4) How fast careers go: the world's career speed × the save's (the work rules) × the difficulty's. */
export const careerSpeed = (g: Save, w: WorldDef) => Math.max(0.05, (w.careerSpeed ?? 1) * workRules(g, w).speed * (difficultyOf(g).career ?? 1));

/* ---------- the schedule (J1) ---------- */

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const wdOf = (day: number) => (((day - 1) % 7) + 7) % 7;   // 0 Monday … 6 Sunday
/** The days a week the job lists (the realistic ones). */
export const realDays = (o: Occupation) => { const d = scheduleOf(o).days; return Math.max(1, Math.min(7, Array.isArray(d) ? d.length : Math.round(d))); };
/** The days a week you work it under the work rules (at least one). */
export const daysAWeek = (g: Save, w: WorldDef, o: Occupation) => Math.max(1, Math.min(realDays(o), Math.round(realDays(o) * workRules(g, w).days)));
/** Your working weekdays (0 Monday … 6 Sunday): the job's own weekdays, the first ones when you work fewer; for a
 *  number of days, an office week (Monday on) for a full-time job worked four days or more, and otherwise the days
 *  spread over the week (from Monday for a full-time job; shops and restaurants work weekends), the same for the same
 *  job. */
export function workdays(g: Save, w: WorldDef, o: Occupation): number[] {
    const s = scheduleOf(o), n = daysAWeek(g, w, o);
    if (Array.isArray(s.days)) return s.days.map(d => WEEKDAY_IDS.indexOf(d)).filter(i => i >= 0).slice(0, n).sort((a, b) => a - b);
    if (realDays(o) >= 5 && n >= 4) return [0, 1, 2, 3, 4, 5, 6].slice(0, n);
    const off = realDays(o) >= 5 ? 0 : H(o.id) % 7;
    return [...new Set(Array.from({ length: n }, (_, k) => (off + Math.floor((k * 7) / n)) % 7))].sort((a, b) => a - b);
}
/** The hours of your shift [from, to): the shift you work in a job worked round the clock, or the schedule's. */
export function shiftHours(g: Save, o: Occupation): { id?: string; name?: string; from: number; to: number } {
    const s = scheduleOf(o);
    if (s.shifts?.length) return s.shifts.find(x => x.id === jobOf(g)?.shift) ?? s.shifts[0];
    const [a, b] = o.hours ?? [0, 24];
    return { from: s.from ?? a, to: s.to ?? b };
}
const span = (from: number, to: number) => (((to - from) % 24) + 24) % 24 || 24;
/** A day's shift (by the day it starts): when it opens and closes (absolute minutes) and how long it is. A window
 *  longer than the shift lets you start any time it still fits (`latest`: the last start on time). */
export interface ShiftTime { day: number; start: number; end: number; hours: number; latest: number }
export function shiftOn(g: Save, w: WorldDef, o: Occupation, day: number): ShiftTime | null {
    if (!workdays(g, w, o).includes(wdOf(day))) return null;
    const sh = shiftHours(g, o), long = span(sh.from, sh.to);
    const hours = Math.max(1, Math.min(o.shift, long));
    const start = day * 1440 + Math.round(sh.from * 60), end = start + long * 60;
    return { day, start, end, hours, latest: end - hours * 60 };
}
const EARLY = 120;   // you may set off for work up to two hours before your shift (the time waits until it starts)
const worked = (j: JobState, day: number) => (j.worked ?? []).includes(day);
const offOn = (j: JobState, day: number) => j.off?.[day];
/** The shift you can work now: today's, or last night's still going; null when there's none (or it was worked). */
export function shiftNow(g: Save, w: WorldDef, o: Occupation): ShiftTime | null {
    const j = jobOf(g); if (!j) return null;
    const now = nowAbs(g);
    for (const d of [g.day, g.day - 1, g.day + 1]) {
        const s = shiftOn(g, w, o, d);
        if (s && now >= s.start - EARLY && now <= s.end - 60 && !worked(j, d) && !offOn(j, d)) return s;
    }
    return null;
}
/** Your next shift from now (not worked, not booked off). */
export function nextShift(g: Save, w: WorldDef, o: Occupation, from = nowAbs(g)): ShiftTime | null {
    const j = jobOf(g); if (!j) return null;
    for (let d = Math.floor(from / 1440) - 1; d <= Math.floor(from / 1440) + 8; d++) {
        const s = shiftOn(g, w, o, d);
        if (s && s.end - 60 > from && !worked(j, d) && !offOn(j, d)) return s;
    }
    return null;
}
/** What the work button can do now: work your shift (`early`: waiting for it to start; `late`: past the grace),
 *  overtime outside it (the job allows it and the place is open), or nothing (`why`). */
export function canWork(g: Save, w: WorldDef, o: Occupation): { kind: 'shift' | 'overtime' | 'none'; shift?: ShiftTime; early?: boolean; late?: boolean; why?: string } {
    const s = shiftNow(g, w, o), now = nowAbs(g), grace = workRules(g, w).grace;
    if (s) return { kind: 'shift', shift: s, early: now < s.start, late: grace !== null && now > s.latest + grace };
    const j = jobOf(g);
    if (o.overtime && isOpen(g, o) && (j as any)?.extraDay !== g.day) return { kind: 'overtime' };   // one overtime shift a day
    const n = nextShift(g, w, o);
    return { kind: 'none', why: n ? `Your next shift: ${whenText(g, n)}.` : 'No shift this week.' };
}
/** "today 09:00–18:00", "Tuesday 22:00–07:00". */
export function whenText(g: Save, s: ShiftTime) {
    const d = s.day === g.day ? 'today' : s.day === g.day + 1 ? 'tomorrow' : s.day === g.day - 1 ? 'last night' : WEEKDAYS[wdOf(s.day)];
    return `${d} ${hm(s.start % 1440)}–${hm(s.end % 1440)}`;
}
/** Your week: each working weekday with its hours. */
export function weekText(g: Save, w: WorldDef, o: Occupation) {
    const sh = shiftHours(g, o);
    return `${workdays(g, w, o).map(i => WEEKDAYS[i].slice(0, 3)).join(', ')} · ${hm(Math.round(sh.from * 60) % 1440)}–${hm(Math.round(sh.to * 60) % 1440)}`;
}
/** Pay per hour for this rank: the rank's pay, raised so a week earns the same with fewer days (J9). */
export const payFactor = (g: Save, w: WorldDef, o: Occupation) => realDays(o) / daysAWeek(g, w, o);
export const hourlyPay = (g: Save, w: WorldDef, o: Occupation) => rankOf(g, o).pay * payFactor(g, w, o);
// Minutes of a stretch of time that fall in the night (22:00–5:00), for night pay (E20).
function nightMinutes(start: number, minutes: number) {
    let n = 0;
    for (let t = start; t < start + minutes; t += 15) { const h = (t % 1440) / 60; if (h >= 22 || h < 5) n += Math.min(15, start + minutes - t); }
    return n;
}

/* ---------- a good word from someone high up (a referral) ---------- */

// Someone you know who holds a high rank (3 or more) at their job can recommend you there, if they like you enough.
export const REFER_RANK = 2, REFER_BOND = 40;
export function canRefer(g: Save, w: WorldDef, avatar: string): Occupation | null {
    const r = g.cast[avatar]; const o = r && jobDef(w, r.occupation);
    if (!r || !o || !r.met || !systemOn(w, 'jobs') || g.player.job?.id === o.id || o.hireable === false) return null;
    if (npcRank(g, avatar) < REFER_RANK || bondOf(g, avatar) < REFER_BOND) return null;
    return o;
}
const asked = (g: Save) => (((g as any).living ??= {}).refAsked ??= {}) as Record<string, number>;
export const askedThisWeek = (g: Save, avatar: string) => g.day - (asked(g)[avatar] ?? -99) < 7;
export function referralFor(g: Save, jobId: string): string | null {
    const ref = (g as any).referral;
    return ref && ref.job === jobId && g.day <= ref.until && g.cast[ref.avatar] ? ref.avatar : null;
}
export function askReferral(g: Save, w: WorldDef, avatar: string): { ok: boolean; text: string } {
    const o = canRefer(g, w, avatar); const r = g.cast[avatar];
    if (!o || !r) return { ok: false, text: '' };
    if (askedThisWeek(g, avatar)) return { ok: false, text: `You already asked ${r.name} this week.` };
    asked(g)[avatar] = g.day;
    const chance = 0.35 + bondOf(g, avatar) / 200 + approvalOf(g, avatar) / 200;
    if (Math.random() >= chance) { note(g, '{u} asked {0} for a good word at {1}; {0} could not promise anything.', [r.name, o.name], [avatar], g.player.loc, 'work'); return { ok: false, text: `${r.name} would rather not vouch for anyone at ${o.name} right now.` }; }
    (g as any).referral = { job: o.id, avatar, until: g.day + 14 };
    note(g, '{0} agreed to put in a good word for {u} at {1}.', [r.name, o.name], [avatar], g.player.loc, 'work');
    return { ok: true, text: `${r.name} will put in a good word for you at ${o.name}: apply within two weeks and you are in (if you have the courses it asks for).` };
}

/* ---------- careers and their branches ---------- */

export { career, type Career } from '../core/world.js';
const jobPath = (g: Save) => g.player.job?.path ?? [];
// Your career in this job (for someone else's: a path picked for them, the same every time).
export const careerOf = (g: Save, o: Occupation) => career(o, g.player.job?.id === o.id ? jobPath(g) : []);
export function npcCareer(o: Occupation, avatar: string): Career {
    const path: string[] = [];
    for (let n = 0; n < 4; n++) {
        const c = career(o, path);
        if (!c.open) return c;
        path.push(c.open.options[H(`${avatar}|${o.id}|${n}`) % c.open.options.length].id);
    }
    return career(o, path);
}
// The whole career from a path: the paths not chosen yet taken as their first option (what the top is measured on).
function fullCareer(o: Occupation, path: string[]): Career {
    const p = [...path];
    for (let n = 0; n < 6; n++) { const c = career(o, p); if (!c.open) return c; p.push(c.open.options[0].id); }
    return career(o, p);
}
// The rank you hold (its name and pay), and the one after it.
export const rankOf = (g: Save, o: Occupation) => { const c = careerOf(g, o); return c.ranks[Math.min(g.player.job?.rank ?? 0, c.ranks.length - 1)]; };
export const nextRankOf = (g: Save, o: Occupation) => careerOf(g, o).ranks[(g.player.job?.rank ?? 0) + 1] ?? null;
// A branch waiting for you: you are at its rank.
export function pendingBranch(g: Save, o: Occupation): Branch | null {
    const j = g.player.job; if (!j || j.id !== o.id) return null;
    const c = careerOf(g, o);
    return c.open && j.rank >= c.ranks.length - 1 ? c.open : null;
}
// Choosing a path: it decides the ranks that come next.
export function choosePath(g: Save, w: WorldDef, optionId: string): string {
    const j = g.player.job; const o = jobDef(w, j?.id);
    if (!j || !o) return '';
    const b = pendingBranch(g, o); const opt = b?.options.find(x => x.id === optionId);
    if (!b || !opt) return '';
    (j.path ??= []).push(opt.id); delete (j as any).toldBranch;
    note(g, '{u} chose a path at work: {0} ({1}).', [opt.name, o.name], [], o.place, 'work');
    return `You chose ${opt.name}. Next: ${opt.ranks[0]?.name ?? ''}.`;
}

/* ---------- how long a career takes (J4) ---------- */

/** A game year in days (four seasons), so a career follows the season length. */
export const yearDays = (g: Save) => 4 * seasonDays(g);
/** Days to reach the top, played well: a year × the job's length, at the career speed. */
export const topDays = (g: Save, w: WorldDef, o: Occupation) => (yearDays(g) * (o.length ?? 1)) / careerSpeed(g, w);
/** The days a rank takes, played well: the career's time shared out by its promotion weights (`promote`: entry ranks
 *  short, the last ones long). Liked traits make each a little shorter. */
export function rankDays(g: Save, w: WorldDef, o: Occupation, rank: number, path: string[] = jobPath(g), traits = traitsOf(g)): number {
    const c = fullCareer(o, path);
    const weights = c.promote.slice(0, Math.max(0, c.ranks.length - 1));
    const sum = weights.reduce((a, b) => a + Math.max(0.1, b), 0);
    if (!sum || rank >= weights.length) return 0;
    const liked = Math.min(3, c.likes.filter(t => traits.includes(t)).length);
    return (topDays(g, w, o) * Math.max(0.1, weights[rank]) / sum) * (1 - 0.05 * liked);
}
// What a promotion asks of the performance, unless the rank says otherwise.
export const PROMO_PERF = 60;
export const perfOf = (g: Save) => Math.round(jobOf(g)?.perf ?? 50);
/** What the next promotion asks for, and where you stand: shifts in the rank (fewer with a high performance: played
 *  well, a full week of shifts is a week), the time in the rank (overtime can shorten it by half at most), the
 *  performance, skill levels, one of some traits, a course, a condition. null at the top, or with a path to choose. */
export interface PromoNeeds { rank: Rank; shifts: number; have: number; days: number; inRank: number; perf: number; skills: { id: string; name: string; need: number; have: number }[]; traits: string[]; course?: string; when?: boolean; ready: boolean; missing: string[] }
export function promoNeeds(g: Save, w: WorldDef, o: Occupation): PromoNeeds | null {
    const j = jobOf(g); const next = nextRankOf(g, o);
    if (!j || j.id !== o.id || !next || pendingBranch(g, o)) return null;
    const d = rankDays(g, w, o, j.rank);
    const perf = perfOf(g), want = next.needs?.performance ?? PROMO_PERF;
    const shifts = (d * daysAWeek(g, w, o)) / 7 * (1.3 - (0.3 * perf) / 100);
    const days = d * 0.5, inRank = (nowAbs(g) - (j.since ?? nowAbs(g))) / 1440;
    const skills = Object.entries(next.needs ?? {}).filter(([id]) => id !== 'performance').map(([id, need]) => ({ id, name: skillName(w, id), need, have: levelOf(g, id) }));
    const traits = next.traits ?? [];
    const missing: string[] = [];
    if (j.shifts + 1e-6 < shifts) missing.push('more shifts');
    if (inRank + 1e-6 < days) missing.push('more time in the rank');
    if (perf < want) missing.push(`performance ${want}`);
    for (const s of skills) if (s.have < s.need) missing.push(`${s.name} ${s.need}`);
    if (traits.length && !traits.some(t => traitsOf(g).includes(t))) missing.push(traits.join(' or '));
    if (next.course && courseOf(w, next.course) && !hasCourse(g, next.course)) missing.push(courseOf(w, next.course)!.name);
    const when = next.when ? whenHolds(g, w, next.when, { place: rankPlace(o, next), key: `promo|${o.id}|${j.rank}` }) : undefined;
    if (when === false) missing.push('something more');
    return { rank: next, shifts, have: j.shifts, days, inRank, perf: want, skills, traits, course: next.course, when, ready: !missing.length, missing };
}
// Shifts still needed for the next rank. null: no next rank (or a path to choose).
export function shiftsToPromote(g: Save, o: Occupation, _rank?: number): number | null {
    const w = getWorld(g.world); const p = w && promoNeeds(g, w, o);
    return p ? Math.max(1, Math.ceil(p.shifts * 100) / 100) : null;
}
/** Progress to the next rank, 0–100 (the slowest of shifts and time; skills and the rest shown apart). */
export function promoProgress(p: PromoNeeds) { return Math.max(0, Math.min(100, Math.floor(Math.min(p.have / Math.max(0.01, p.shifts), p.inRank / Math.max(0.01, p.days)) * 100))); }

/* ---------- getting hired, quitting ---------- */

// Applying is a job interview: a d20 where the traits the job looks for are your bonus. Some jobs need a course first.
export function hire(g: Save, w: WorldDef, id: string): { ok: boolean; text: string } {
    const o = jobDef(w, id);
    if (!o || o.hireable === false || (o.adult && !adultOn(g))) return { ok: false, text: o ? 'They are not hiring.' : '' };
    const miss = missingCourses(g, w, o);
    if (miss.length) return { ok: false, text: lex(w, 'needCourse', miss.join('", "')) };
    if (!hobbyFits(g, w, o)) return { ok: false, text: `They are looking for someone better at it: ${hobbyNeed(g, w, o)}.` };
    if (triedToday(g, id)) return { ok: false, text: 'You already had an interview there today. Try again tomorrow.' };
    // a word from someone high up there gets you in without the interview
    const ref = referralFor(g, id);
    const r = ref ? { ok: true, crit: false, text: `${g.cast[ref]?.name ?? 'Someone'} put in a good word for you.` } : interview(g, o, traitsOf(g));
    if (ref) delete (g as any).referral;
    if (!r.ok) { note(g, '{u} had a job interview for {0}, but did not get it.', [o.name], [], o.place, 'work'); return { ok: false, text: r.text }; }
    // today's shift counts if it hasn't started yet
    const today = shiftOn(g, w, o, g.day);
    const j: JobState = { id, rank: 0, shifts: 0, perf: r.crit ? 65 : 50, since: nowAbs(g), checked: today && today.start > nowAbs(g) ? g.day - 1 : g.day, vac: 0, vacAt: g.day };
    g.player.job = j as any;
    note(g, '{u} got hired: {0} at {1}.', [o.ranks[0].name, o.name], [], o.place, 'work');
    const s = nextShift(g, w, o);
    return { ok: true, text: `You got the job! ${r.text}${systemOn(w, 'jobs') ? ` Your week: ${weekText(g, w, o)}.${s ? ` First shift: ${whenText(g, s)}.` : ''}` : ''}` };
}
export function quitJob(g: Save, w?: WorldDef) { const o = w && jobDef(w, g.player.job?.id); if (o) note(g, '{u} quit the job ({0}).', [o.name], [], g.player.loc, 'work'); g.player.job = null; }
// Round the clock: the shift you'd rather work (from your next one on).
export function chooseShift(g: Save, w: WorldDef, id: string): string {
    const j = jobOf(g); const o = jobDef(w, j?.id); const s = o && scheduleOf(o).shifts?.find(x => x.id === id);
    if (!j || !o || !s) return '';
    j.shift = s.id;
    return `From now on you work the ${(s.name ?? s.id).toLowerCase()} shift (${hm(s.from * 60 % 1440)}–${hm(s.to * 60 % 1440)}).`;
}

/* ---------- performance (J2) ---------- */

/** Performance up or down (0–100); low performance brings a warning, then a demotion, then being fired, as far as
 *  the work rules go. Returns what happened. */
export function addPerf(g: Save, w: WorldDef, n: number): string[] {
    const j = jobOf(g); const o = jobDef(w, j?.id); if (!j || !o) return [];
    j.perf = Math.max(0, Math.min(100, (j.perf ?? 50) + n));
    const low = workRules(g, w).low, out: string[] = [];
    if (j.perf >= 60) delete j.warn;
    const warn = j.warn ?? 0;
    if (j.perf < 25 && warn === 0) {
        j.warn = 1;
        out.push(`Your boss had a word with you about your work at ${o.name}. Your performance is low.`);
        note(g, '{u} got a warning at work ({0}).', [o.name], [], o.place, 'work');
    } else if (j.perf < 15 && warn >= 1 && low !== 'warn') {
        if (low === 'fire' && (warn >= 2 || j.rank === 0)) {
            g.player.job = null;
            out.push(`You were let go from ${o.name}. Your performance was too low for too long.`);
            note(g, '{u} was fired ({0}).', [o.name], [], o.place, 'work');
        } else if (j.rank > 0) {
            j.rank--; j.shifts = 0; j.since = nowAbs(g); j.perf = 35; j.warn = 2;
            out.push(`You were moved down to ${rankOf(g, o).name} at ${o.name}.`);
            note(g, '{u} was demoted to {0}.', [rankOf(g, o).name], [], o.place, 'work');
        } else { j.perf = 35; j.warn = 2; out.push(`A last warning at ${o.name}: things have to get better.`); }
    }
    return out;
}
// What a shift does to your performance: how you worked, how you came in (rested, fed, clean, in a good mood), whether
// you have the skills your rank asks for, and how the boss feels about you (J7).
const MODE_PERF: Record<WorkMode, number> = { normal: 4, hard: 8, social: 2, easy: -4 };
function shiftPerf(g: Save, w: WorldDef, o: Occupation, mode: WorkMode, part: number): number {
    const s = g.player.stats;
    let n = MODE_PERF[mode];
    const low = ['energy', 'mood', 'hunger', 'hygiene'].filter(k => typeof s[k] === 'number' && s[k] < 25).length;
    n += low ? -2 * low : (s.energy ?? 100) >= 50 && (s.mood ?? 100) >= 50 ? 1 : 0;
    const needs = Object.entries(rankOf(g, o).needs ?? {}).filter(([id]) => id !== 'performance');
    if (needs.length && needs.every(([id, v]) => levelOf(g, id) >= v)) n += 1;
    const b = bossOf(g, w, o);
    if (b) { const f = fr(g, b.avatar, YOU); n += f >= 40 ? 1 : f < 0 ? -1 : 0; }
    return n * part;
}

/* ---------- colleagues (J7) ---------- */

/** The world's people with your job (or working at your place), by rank. */
export const colleaguesOf = (g: Save, w: WorldDef, o: Occupation): Resident[] =>
    Object.values(g.cast).filter(r => r.occupation && (r.occupation === o.id || jobDef(w, r.occupation)?.place === o.place)).sort((a, b) => npcRank(g, b.avatar) - npcRank(g, a.avatar));
/** Colleagues on shift with you: here, at the place you work, now (an off-screen job has none you can see). */
export const onShiftWith = (g: Save, w: WorldDef, o: Occupation): Resident[] =>
    (offScreen(w, o) ? [] : presentAt(g, w, jobPlace(g, o)).filter(r => colleaguesOf(g, w, o).includes(r)));
/** The boss: the colleague with your job who ranks highest, above you. */
export function bossOf(g: Save, w: WorldDef, o: Occupation): Resident | null {
    const mine = jobOf(g)?.rank ?? 0;
    return colleaguesOf(g, w, o).find(r => r.occupation === o.id && npcRank(g, r.avatar) > mine) ?? null;
}
/** Seniors (senpai): colleagues a rank or more above you, among these people. */
export const seniorsOf = (g: Save, w: WorldDef, o: Occupation, among: Resident[]) => among.filter(r => colleaguesOf(g, w, o).includes(r) && npcRank(g, r.avatar) > (jobOf(g)?.rank ?? 0));

/* ---------- a shift ---------- */

// How you spend the shift (chosen on the work screen, like The Sims): it changes your performance, how tired you get,
// your mood, and your coworkers.
export type WorkMode = 'normal' | 'hard' | 'social' | 'easy';
export const WORK_MODES: { id: WorkMode; name: string; desc: string; icon: string }[] = [
    { id: 'normal', name: 'Do the job', desc: 'A normal shift.', icon: '💼' },
    { id: 'hard', name: 'Work hard', desc: 'Your performance grows fastest, with a chance of a bonus. More tiring, a bit stressful.', icon: '🔥' },
    { id: 'social', name: 'Chat with coworkers', desc: 'Better mood, closer to the colleagues on shift with you. Performance grows slowly.', icon: '💬' },
    { id: 'easy', name: 'Take it easy', desc: 'Less tiring, but your performance drops and the boss notices.', icon: '😌' },
];
const OVERTIME_PAY = 0.25;
// `hours`: a shorter shift (leaving early for a date): pay, tiredness and progress are for the hours worked.
export function workShift(g: Save, w: WorldDef, mode: WorkMode = 'normal', hours?: number): string[] {
    const j = jobOf(g); const o = jobDef(w, j?.id);
    if (!j || !o) return [];
    const rules = workRules(g, w), sched = systemOn(w, 'jobs');
    const can = canWork(g, w, o);
    const out: string[] = [];
    // waiting for the shift to start, then whether you came in late
    if (can.kind === 'shift' && can.early) out.push(...advance(g, w, can.shift!.start - nowAbs(g)));
    const s = can.kind === 'shift' ? can.shift! : null;
    const overtime = !s && can.kind === 'overtime';
    const room = s ? Math.floor((s.end - nowAbs(g)) / 60) : o.shift;
    const h = Math.max(1, Math.min(s?.hours ?? o.shift, room, Math.round(hours ?? o.shift)));
    const part = h / (s?.hours ?? o.shift);
    let perf = 0;
    if (s && can.late) { const lateBy = Math.round(nowAbs(g) - s.latest); perf -= rules.missed ? Math.max(2, Math.round(rules.missed / 2)) : 3; out.push(`You came in ${lateBy} minutes late.`); }
    if (s) { j.worked = [...(j.worked ?? []).filter(d => d > g.day - 15), s.day]; }   // before the time passes: a night shift goes past midnight
    if (overtime) (j as any).extraDay = g.day;
    const start = nowAbs(g);
    const mates = onShiftWith(g, w, o);
    out.unshift(...advance(g, w, h * 60));
    const k = mode === 'hard' ? 1.35 : mode === 'easy' ? 0.6 : 1;
    for (const [id, v] of Object.entries(o.cost ?? {})) addStatus(g, w, id, -v * part * (id === 'energy' ? k : 1));
    if (mode === 'hard') addStatus(g, w, 'mood', -5 * part);
    if (mode === 'social') addStatus(g, w, 'mood', 8 * part);
    // pay: per hour, raised for fewer days a week, more for night hours (E20) and overtime
    const rk = rankOf(g, o);
    const night = nightMinutes(start, h * 60) / 60;
    const base = rk.pay * payFactor(g, w, o) * (overtime ? 1 + OVERTIME_PAY : 1);
    let pay = payOf(g, base * h + base * night * (o.nightPay ?? 0));
    countUp(g, 'shifts', part);
    const bonus = mode === 'hard' && Math.random() < 0.3 ? Math.round(pay * 0.25) : 0;
    pay += bonus;
    g.player.money += pay;
    book(g, `${rk.name}: ${h} h${overtime ? ' (overtime)' : ''}${bonus ? ' (+ bonus)' : ''}`, pay);
    out.unshift(`You worked ${h} hour${h === 1 ? '' : 's'}${overtime ? ' of overtime' : ''} and earned ${money(w, pay)}${bonus ? ` (a bonus of ${money(w, bonus)} for the hard work)` : ''}${night >= 1 && o.nightPay ? ' (with night pay)' : ''}.`);
    j.shifts = Math.round((j.shifts + part) * 100) / 100;
    for (const id of o.trains ?? []) out.push(...trainSkill(g, w, id, (mode === 'hard' ? 6 : mode === 'easy' ? 2 : 4) * part));
    if (mode === 'social' && mates.length) {
        for (const r of mates) bump(g, r.avatar, 3);
        out.push(`You got closer to ${mates.map(r => r.name).join(', ')}.`);
    }
    if (sched) {
        perf += shiftPerf(g, w, o, mode, part);
        if (mode === 'easy' && !rules.gentle && Math.random() < 0.25) { perf -= 3; out.push('Your boss noticed you were slacking.'); }
        out.push(...addPerf(g, w, rules.gentle ? Math.max(0, perf) : perf));
        if (!g.player.job) return out;   // fired
        rollWorkEvent(g, w, o);
    }
    out.push(...tryPromote(g, w, o));
    if (pendingBranch(g, o) && !(j as any).toldBranch) { (j as any).toldBranch = j.rank; out.push(lex(w, 'choosePath', o.name)); }
    return out;
}
// A promotion when everything it asks for is there (what's left over of the shifts counts toward the next rank).
function tryPromote(g: Save, w: WorldDef, o: Occupation): string[] {
    const j = jobOf(g); const p = promoNeeds(g, w, o);
    if (!j || !p?.ready) return [];
    j.rank++; j.shifts = Math.max(0, Math.round((j.shifts - p.shifts) * 100) / 100); j.since = nowAbs(g);
    const name = rankOf(g, o).name, moved = rankPlace(o, rankOf(g, o)) !== rankPlace(o, careerOf(g, o).ranks[j.rank - 1]);
    note(g, '{u} got promoted to {0}.', [name], [], o.place, 'work');
    addRep(g, w, 3, 'promotion', o.place);
    return [`Promotion! You are now ${name}.${moved ? ` You work at ${placeOf(g, w, jobPlace(g, o))?.name ?? 'a new place'} from now on.` : ''}`];
}

/* ---------- things that happen at work (J6) ---------- */

// The boss asking you to stay longer (jobs with overtime): a work event of the engine's own.
const OVERTIME_ASK: WorkEvent = { id: '_overtime', setup: 'Your boss asks if you can stay two more hours tonight.', choices: [
    { label: 'Stay (overtime pay)', perf: 1, text: 'You stayed. The boss noticed.' },
    { label: 'Go home on time', perf: -1, text: 'You left on time. The boss did not say anything.' },
] };
const eventDef = (o: Occupation, id: string) => (id === OVERTIME_ASK.id ? OVERTIME_ASK : (o.events ?? []).find(e => e.id === id) ?? null);
const choiceOk = (g: Save, w: WorldDef, o: Occupation, c: WorkChoice, i: number) => !c.when || whenHolds(g, w, c.when, { place: jobPlace(g, o), key: `workc|${o.id}|${i}` });
// After a shift, now and then (as often as the work rules say): one of the job's events whose condition holds, or the
// boss asking for overtime. It waits for your choice on the work screen.
function rollWorkEvent(g: Save, w: WorldDef, o: Occupation) {
    const j = jobOf(g)!; const chance = workRules(g, w).events;
    delete j.event;
    if (Math.random() >= chance) return;
    const list = (o.events ?? []).filter(e => (!e.adult || adultOn(g)) && e.choices?.length && (!e.when || whenHolds(g, w, e.when, { place: jobPlace(g, o), key: `work|${e.id}` })));
    if (o.overtime && Math.random() < (list.length ? 0.3 : 0.6)) { j.event = { id: OVERTIME_ASK.id, day: g.day }; return; }
    if (list.length) j.event = { id: list[Math.floor(Math.random() * list.length)].id, day: g.day };
}
/** The event waiting for your choice (with the choices you can make now), if any. */
export function pendingEvent(g: Save, w: WorldDef): { ev: WorkEvent; choices: { c: WorkChoice; i: number }[] } | null {
    const j = jobOf(g); const o = jobDef(w, j?.id); const e = j?.event && o ? eventDef(o, j.event.id) : null;
    if (!j || !o || !e || j.event!.day < g.day - 1) return null;
    const choices = e.choices.map((c, i) => ({ c, i })).filter(x => choiceOk(g, w, o, x.c, x.i));
    return choices.length ? { ev: e, choices } : null;
}
export const dropEvent = (g: Save) => { const j = jobOf(g); if (j) delete j.event; };
/** Your choice: a roll if it has one (d20 + half your skill level against its difficulty), then what it does:
 *  performance, money, needs, how people feel about you, a fact. With the gentle rules nothing turns out badly. */
export function chooseEvent(g: Save, w: WorldDef, i: number, rnd = Math.random): string[] {
    const j = jobOf(g); const o = jobDef(w, j?.id); const p = pendingEvent(g, w);
    const pick = p?.choices.find(x => x.i === i);
    if (!j || !o || !p || !pick) return [];
    delete j.event;
    const c = pick.c, out: string[] = [];
    let res: WorkResult = c;
    if (c.roll) {
        const d20 = 1 + Math.floor(rnd() * 20), bonus = c.roll.skill ? Math.floor(levelOf(g, c.roll.skill) / 2) : 0;
        const ok = d20 === 20 || (d20 > 1 && d20 + bonus >= c.roll.dc);
        out.push(`🎲 ${d20}${bonus ? ` + ${bonus}` : ''} against ${c.roll.dc}: ${ok ? 'it worked.' : 'it did not work.'}`);
        if (!ok) res = c.fail ?? { text: 'It did not work out.' };
    }
    out.push(...applyResult(g, w, o, res, workRules(g, w).gentle));
    if (p.ev.id === OVERTIME_ASK.id && i === 0) out.push(...overtimeHours(g, w, o, 2));
    return out;
}
function applyResult(g: Save, w: WorldDef, o: Occupation, r: WorkResult, gentle: boolean): string[] {
    const out: string[] = [];
    const ok = (n: number | undefined) => (n === undefined ? 0 : gentle ? Math.max(0, n) : n);
    if (r.text) out.push(r.text);
    if (ok(r.perf)) out.push(...addPerf(g, w, ok(r.perf) * 5));
    if (ok(r.money)) { const m = ok(r.money) > 0 ? payOf(g, ok(r.money)) : -priceOf(g, -ok(r.money)); g.player.money += m; book(g, o.name, m); out.push(m > 0 ? `+${money(w, m)}` : `−${money(w, -m)}`); }
    for (const [id, v] of Object.entries(r.effects ?? {})) if (ok(v)) addStatus(g, w, id, ok(v));
    for (const [name, v] of Object.entries(r.feels ?? {})) { const who = personNamed(g, name); if (who && ok(v)) bump(g, who.avatar, ok(v)); }
    if (r.fact) note(g, r.fact, [placeOf(g, w, jobPlace(g, o))?.name ?? o.name], [], jobPlace(g, o), 'work');
    return out;
}
// Staying longer: the hours pass, paid as overtime.
function overtimeHours(g: Save, w: WorldDef, o: Occupation, h: number): string[] {
    const start = nowAbs(g);
    const out = advance(g, w, h * 60);
    addStatus(g, w, 'energy', -((o.cost?.energy ?? 20) / o.shift) * h);
    const base = rankOf(g, o).pay * payFactor(g, w, o) * (1 + OVERTIME_PAY);
    const pay = payOf(g, base * h + base * (nightMinutes(start, h * 60) / 60) * (o.nightPay ?? 0));
    g.player.money += pay; book(g, `${rankOf(g, o).name}: ${h} h (overtime)`, pay);
    return [`You worked ${h} more hours and earned ${money(w, pay)}.`, ...out];
}

/* ---------- days off: vacation and sick days (J2) ---------- */

export const vacationLeft = (g: Save, w: WorldDef) => (workRules(g, w).vacation ? Math.floor(jobOf(g)?.vac ?? 0) : Infinity);
/** Book a day off (a vacation day) for a shift today (not started) or later this week, or give it back. */
export function bookOff(g: Save, w: WorldDef, day: number): string {
    const j = jobOf(g); const o = jobDef(w, j?.id); if (!j || !o) return '';
    const off = (j.off ??= {});
    if (off[day] === 'vacation') { delete off[day]; if (workRules(g, w).vacation) j.vac = (j.vac ?? 0) + 1; return 'Day off cancelled: you work that day.'; }
    const s = shiftOn(g, w, o, day);
    if (!s || worked(j, day) || off[day] || s.start <= nowAbs(g)) return 'You can only book a shift that hasn\'t started.';
    if (vacationLeft(g, w) < 1) return 'You have no vacation days left.';
    if (workRules(g, w).vacation) j.vac = (j.vac ?? 0) - 1;
    off[day] = 'vacation';
    return `Day off booked: ${WEEKDAYS[wdOf(day)]}.`;
}
/** Too ill to work: hurt, under a curse or a poison, or with nothing left in you. */
export function reallyIll(g: Save, w: WorldDef) {
    const a = ailOf(g), s = g.player.stats;
    return a.injuries.some(i => i.until > g.day) || a.debuffs.length > 0 || (s.energy ?? 100) < 10 || (typeof s.health === 'number' && s.health < 30) || (a.stress ?? 0) >= 80;
}
/** May you call in sick today: only when really ill (Realistic), now and then (once every two weeks, or when ill),
 *  or any time. '' when you may; why not otherwise. */
export function sickNo(g: Save, w: WorldDef): string {
    const j = jobOf(g); if (!j) return 'No job.';
    const rule = workRules(g, w).sick, ill = reallyIll(g, w);
    if (rule === 'ill' && !ill) return 'You are not ill enough to call in sick.';
    if (rule === 'sometimes' && !ill && g.day - (j.sickAt ?? -99) < 14) return 'You called in sick not long ago.';
    return '';
}
export function callSick(g: Save, w: WorldDef): string {
    const j = jobOf(g); const o = jobDef(w, j?.id); if (!j || !o) return '';
    const why = sickNo(g, w); if (why) return why;
    const s = shiftNow(g, w, o) ?? nextShift(g, w, o);
    if (!s || s.day > g.day + 1) return 'You have no shift to call in sick for.';
    (j.off ??= {})[s.day] = 'sick'; j.sickAt = g.day;
    note(g, '{u} called in sick ({0}).', [o.name], [], g.player.loc, 'work');
    return `You called in sick for ${whenText(g, s)}.`;
}

/* ---------- the days going by: missed shifts, vacation, bonuses, reminders ---------- */

// Every hour: shifts that ended without you (an absence, unless booked off), and a reminder before the next one
// (with the trip there: living far away means leaving earlier).
export function workHour(g: Save, w: WorldDef): string[] {
    const j = jobOf(g); const o = jobDef(w, j?.id);
    if (!j || !o || !systemOn(w, 'jobs')) return [];
    const out: string[] = [], now = nowAbs(g), rules = workRules(g, w);
    for (let d = (j.checked ?? g.day) + 1; d <= g.day; d++) {
        const s = shiftOn(g, w, o, d);
        if (s && s.end > now) break;
        j.checked = d;
        if (!s || worked(j, d) || offOn(j, d)) continue;
        if (rules.missed) {
            out.push(`You missed your shift at ${o.name} (${WEEKDAYS[wdOf(d)]}).${rules.low === 'fire' ? ' Your boss is not happy.' : ''}`);
            note(g, '{u} missed a shift at work ({0}).', [o.name], [], o.place, 'work');
            out.push(...addPerf(g, w, -rules.missed));
            if (!g.player.job) return out;
        }
    }
    // days off already over are forgotten
    for (const k of Object.keys(j.off ?? {})) if (Number(k) < g.day - 7) delete j.off![k];
    const n = nextShift(g, w, o);
    if (n && j.told !== n.day && n.start > now) {
        const trip = offScreen(w, o) || g.player.loc === jobPlace(g, o) ? 0 : travelMinutes(g, w, g.player.loc, jobPlace(g, o));
        if (n.start - now <= 60 + trip) { j.told = n.day; out.push(`Your shift at ${o.name} starts at ${hm(n.start % 1440)}${trip ? ` (${trip} min away)` : ''}.`); }
    }
    return out;
}
// Every day: a vacation day saved up every so often, and the summer and winter bonuses of full-time jobs (J8),
// paid on the first day of summer and of winter: a week's pay, more with a good performance.
export function workDay(g: Save, w: WorldDef): string[] {
    const j = jobOf(g); const o = jobDef(w, j?.id);
    if (!j || !o || !systemOn(w, 'jobs')) return [];
    const rules = workRules(g, w), out: string[] = [];
    if (rules.vacation) { while (g.day - (j.vacAt ?? g.day) >= rules.vacation) { j.vacAt = (j.vacAt ?? g.day) + rules.vacation; j.vac = Math.min(10, (j.vac ?? 0) + 1); } }
    else j.vacAt = g.day;
    const sd = seasonDays(g), season = Math.floor((g.day - 1) / sd) % 4, first = (g.day - 1) % sd === 0;
    if (first && (season === 1 || season === 3) && realDays(o) >= 5 && j.bonus !== g.day && g.day - Math.floor((j.since ?? 0) / 1440) >= 7) {
        j.bonus = g.day;
        const pay = payOf(g, rankOf(g, o).pay * o.shift * realDays(o) * (0.5 + perfOf(g) / 100));
        g.player.money += pay; book(g, `${o.name}: ${season === 1 ? 'summer' : 'winter'} bonus`, pay);
        note(g, '{u} got the {0} bonus at work.', [season === 1 ? 'summer' : 'winter'], [], o.place, 'work');
        out.push(`Your ${season === 1 ? 'summer' : 'winter'} bonus from ${o.name}: ${money(w, pay)}.`);
    }
    return out;
}
onHour.push(workHour);
onDay.push(workDay);

/* ---------- for the AI ---------- */

/** Your job, rank and shift, and which colleagues here are your seniors (J7). */
export function workLine(g: Save, w: WorldDef, present: Resident[]): string {
    const j = jobOf(g); const o = jobDef(w, j?.id);
    if (!j || !o || !systemOn(w, 'jobs') || isScenario(w)) return '';
    const c = careerOf(g, o);
    const seniors = seniorsOf(g, w, o, present);
    const boss = bossOf(g, w, o);
    return `{{user}} works as ${rankOf(g, o).name} (${o.name}, rank ${j.rank + 1} of ${c.ranks.length + (c.open ? 1 : 0)}).${seniors.length ? ` At work, ${seniors.map(r => r.name).join(' and ')} ${seniors.length > 1 ? 'are' : 'is'} senior to {{user}} (senpai)${boss && seniors.includes(boss) ? `; ${boss.name} is the boss` : ''}.` : ''}`;
}

/* ---------- moving ---------- */

export function freeSpots(g: Save, w: WorldDef, zoneId: string): number[][] {
    const zone = w.homes.zones.find(z => z.id === zoneId);
    if (!zone) return [];
    const taken = new Set([g.player.home, ...Object.values(g.cast).map(r => r.home)].map(h => `${h.x},${h.y}`));
    return zone.spots.filter(s => !taken.has(`${s[0]},${s[1]}`));
}
// Moving costs one week of the new rent; rent then counts from today.
export function moveTo(g: Save, w: WorldDef, zoneId: string): string {
    const zone = w.homes.zones.find(z => z.id === zoneId);
    const spot = freeSpots(g, w, zoneId)[0];
    if (!zone || !spot) return 'There is no free home there.';
    const deposit = priceOf(g, zone.rent);
    if (g.player.money < deposit) return 'Not enough money.';
    g.player.money -= deposit;
    book(g, `${zone.name}: deposit`, -deposit);
    g.player.home = { zone: zone.id, kind: zone.kind, x: spot[0], y: spot[1], n: zone.spots.findIndex(s => s[0] === spot[0] && s[1] === spot[1]) + 1 };
    g.player.rentPaidDay = g.day; resetBills(g, w);
    note(g, '{u} moved to a new home: {0}.', [zone.name], [], g.player.loc, 'home');
    return '';
}
