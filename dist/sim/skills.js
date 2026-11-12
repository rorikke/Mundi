// The job interview, a roll where what you're good at (the best skill the job uses) and the traits it likes are your
// bonus; the traits you gain from courses and life goals (a trait the world maps to a skill gives its levels instead);
// and the counters some life goals are measured with. (Courses themselves are in courses.ts, skills with their levels
// in hobbies.ts.)
import { nowAbs } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { learning, courseOf } from './courses.js';
import { levelOf, setSkillLevel } from './hobbies.js';
import { strengthOf } from './traits.js';
import { parseWhen } from './when.js';
import { effectAdd } from './effects.js';
import { tallyEvent } from './tally.js';
import { trackOf } from './tracks.js';
import { seasonDays } from './time.js';
// Counters for life goals (meals cooked, workouts, shifts…); each is also one of the tally's moments (sim/tally.ts).
const MOMENT = { meals: 'meal', workouts: 'workout', paintings: 'painting', shifts: 'shift', parties: 'party' };
export const countUp = (g, key, n = 1) => { const c = learning(g).count; c[key] = (c[key] ?? 0) + n; if (MOMENT[key])
    tallyEvent(g, MOMENT[key], n); };
export const countOf = (g, key) => learning(g).count[key] ?? 0;
/* ---------- traits you gain ---------- */
// A trait learned in a course or earned with a life goal: kept apart from the ones you chose, so the profile can say where it came from.
// One the world maps to a skill ("Good cook" is Cooking 3) gives those levels instead, since being good at something is a skill.
export function gainTrait(g, trait, from) {
    const t = (g.player.traits ??= {});
    const key = from === 'course' ? 'learned' : 'earned';
    const levels = strengthOf(getWorld(g.world), trait);
    if (levels) {
        for (const [id, n] of Object.entries(levels))
            setSkillLevel(g, id, n);
        return true;
    }
    if (Object.values(t).flat().includes(trait))
        return false;
    (t[key] ??= []).push(trait);
    return true;
}
/* ---------- the job interview ---------- */
// (with a save, on your track of the job: its ranks, likes, courses and skills)
// A job nothing of yours helps with is a long shot (30%): what you're good at and the traits it likes make the difference.
export const INTERVIEW_DC = 15;
/** Days before you can try the same job again after each no in a row there: the first, tomorrow; then longer, so a long
 *  shot can't be had by asking every day. The count lasts a season from its first no (a hiring round: about four tries
 *  a season, so bad luck at an ordinary job costs days, not months), and getting better at what the job looks for
 *  (`interviewMerit` above what it was at the last no) starts it again too. A disaster (a 1) waits at least
 *  `DISASTER_DAYS`. (Waiting days after the first no stalled careers whose course was running: a starter job's shifts
 *  failed it meanwhile; the first no still says tomorrow.) */
export const NO_WAITS = [1, 3, 7, 14, 28], DISASTER_DAYS = 3;
// The world's usual top pay (the median of its jobs' top ranks), so "well paid" means the same in yen and in coins.
const usualTop = new WeakMap();
function usualTopPay(w) {
    if (!w)
        return 0;
    let n = usualTop.get(w);
    if (n === undefined) {
        const t = w.occupations.map(o => o.ranks.at(-1)?.pay ?? 0).sort((a, b) => a - b);
        n = t[Math.floor(t.length / 2)] ?? 0;
        usualTop.set(w, n);
    }
    return n;
}
/** The number to reach on the d20: the base, the job's (or its track's) own `interview`, +3 when it asks for a trait,
 *  and +2 (+4) for a career that pays well above the world's usual (1.4×, 2.5× its usual top pay). */
export function interviewDc(o, w) {
    const top = o.ranks.at(-1)?.pay ?? 0, usual = usualTopPay(w);
    const prestige = usual > 0 ? (top >= usual * 2.5 ? 4 : top >= usual * 1.4 ? 2 : 0) : 0;
    return INTERVIEW_DC + Math.round(o.interview ?? 0) + (o.needs?.length ? 3 : 0) + prestige;
}
/** The skills a job's interview looks at: the ones it needs to be hired, its hobby, and what its first two ranks ask for
 *  (a rank's skill needs, or the skills in its condition). */
export function interviewSkills(o) {
    const ids = new Set([...Object.keys(o.skills ?? {}), ...(o.hobby?.id ? [o.hobby.id] : [])]);
    for (const r of o.ranks.slice(0, 2)) {
        for (const id of Object.keys(r.needs ?? {}))
            if (id !== 'performance')
                ids.add(id);
        for (const c of parseWhen(r.when).conds)
            if (c.key === 'skill' && !c.not)
                for (const v of c.values)
                    ids.add(v.split(/\s+/)[0]);
    }
    return [...ids];
}
/** What you're best at for this job: the skill, your level in it, and what it adds (about +1 per two levels, up to +4). */
export function interviewSkill(g, o) {
    o = trackOf(g, o);
    let best = null;
    for (const id of interviewSkills(o)) {
        const level = levelOf(g, id);
        if (!best || level > best.level)
            best = { id, level, bonus: Math.min(4, Math.floor(level / 2)) };
    }
    return best && best.bonus > 0 ? best : null;
}
/** The interview's bonus: what you bring (`interviewMerit`) and the state you come in (`interviewState`). */
export const interviewBonus = (g, o, traits) => interviewMerit(g, o, traits) + interviewState(g);
/** What you bring to a job's interview: the traits it asks for and likes, the skill it uses most, its course finished,
 *  and what effects add. (Getting better at these starts the count of noes there again: a shower doesn't.) */
export function interviewMerit(g, o, traits) {
    o = trackOf(g, o);
    let b = 0;
    if ((o.needs ?? []).some(t => traits.includes(t)))
        b += 4;
    b += Math.min(4, (o.likes ?? []).filter(t => traits.includes(t)).length * 2);
    b += interviewSkill(g, o)?.bonus ?? 0;
    const w = getWorld(g.world), asked = (o.courses ?? []).filter(id => !w || !!courseOf(w, id)); // (a course the world dropped isn't asked for)
    // the course they ask for, finished or being taken (a job lets you apply while taking it only at a rank for students,
    // which is made for them)
    if (asked.length && asked.every(id => learning(g).done.includes(id) || learning(g).taking.includes(id)))
        b += 2;
    b += effectAdd(g, w, 'interview', o.id); // what effects add (life goals' perks)
    return b;
}
/** The state you come to an interview in: unwashed, exhausted or miserable count against you. */
export function interviewState(g) {
    const s = g.player.stats;
    let b = 0;
    if ((s.hygiene ?? 100) < 30)
        b -= 3; // nobody hires someone who smells
    if ((s.energy ?? 100) < 25)
        b -= 2;
    if ((s.mood ?? 100) < 25)
        b -= 2;
    return b;
}
// A roll of 1 always fails, and a 20 passes only when it reaches the number: a job beyond your reach is 0% until you get
// better at what it looks for (a 20 that passes is still the head start).
const passes = (d20, bonus, dc) => d20 > 1 && d20 + bonus >= dc;
export const interviewChance = (g, o, traits) => { o = trackOf(g, o); const b = interviewBonus(g, o, traits), dc = interviewDc(o, getWorld(g.world)); let ok = 0; for (let d = 1; d <= 20; d++)
    if (passes(d, b, dc))
        ok++; return ok * 5; };
// The streak still counting: not once a season has gone by since its first no, nor when you've got better since its
// last no (with the job and your traits to tell).
function streakOf(g, id, o, traits) {
    const k = learning(g).noes?.[id];
    if (!k)
        return null;
    if (g.day >= (k.since ?? k.until) + seasonDays(g))
        return null;
    if (o && traits && interviewMerit(g, o, traits) > k.merit)
        return null;
    return k;
}
/** Days until you can apply to this job again (0: now). Today's interview, whatever came of it, waits till tomorrow; a
 *  no waits as the count of noes there says (`NO_WAITS`), unless you've got better since (pass the job and your traits
 *  to tell; `retry` is what saves kept for a few days in 2026-11, the day you may try again). */
export function retryIn(g, id, o, traits) {
    const s = learning(g), k = streakOf(g, id, o, traits);
    const next = Math.max((s.interviews[id] ?? -1) + 1, k?.until ?? 0, s.retry?.[id] ?? 0);
    return Math.max(0, next - g.day);
}
export const triedToday = (g, id, o, traits) => retryIn(g, id, o, traits) > 0;
/** "tomorrow", "in 3 days": when you can try a job again. */
export const retryText = (g, id, o, traits) => { const n = retryIn(g, id, o, traits); return n <= 1 ? 'tomorrow' : `in ${n} days`; };
export function interview(g, o, traits, rnd = Math.random) {
    const s = learning(g);
    s.interviews[o.id] = g.day;
    const prev = streakOf(g, o.id, o, traits);
    if (s.retry)
        delete s.retry[o.id];
    o = trackOf(g, o);
    const d20 = 1 + Math.floor(rnd() * 20), merit = interviewMerit(g, o, traits), dc = interviewDc(o, getWorld(g.world));
    const ok = passes(d20, merit + interviewState(g), dc);
    const crit = ok && d20 === 20;
    void nowAbs;
    if (ok) {
        if (s.noes)
            delete s.noes[o.id];
        return { ok, crit, text: crit ? 'They loved you: you start with a head start toward your first promotion.' : 'The interview went well.' };
    }
    // (the wait never runs past the season the count lasts, except a disaster's)
    const n = (prev?.n ?? 0) + 1, since = prev?.since ?? g.day;
    const wait = Math.max(Math.min(NO_WAITS[Math.min(n, NO_WAITS.length) - 1], Math.max(1, since + seasonDays(g) - g.day)), d20 === 1 ? DISASTER_DAYS : 0);
    (s.noes ??= {})[o.id] = { n, merit, until: g.day + wait, since };
    return { ok, crit, text: d20 === 1 ? `The interview was a disaster. They won't see you again for ${wait} days.`
            : n === 1 ? 'They chose someone else this time. Try again tomorrow.'
                : `They chose someone else again. They won't see you for ${wait} days, unless you get better at what the job asks for.` };
}
