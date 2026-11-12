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
/** Days before you can try the same job again: after a no (tomorrow, as ever), and after a disaster (a 1). (A longer wait
 *  after every no stalled careers whose course was paid for and running: the starter job's shifts failed it meanwhile.) */
export const RETRY_DAYS = 1, DISASTER_DAYS = 3;
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
export function interviewBonus(g, o, traits) {
    o = trackOf(g, o);
    let b = 0;
    if ((o.needs ?? []).some(t => traits.includes(t)))
        b += 4;
    b += Math.min(4, (o.likes ?? []).filter(t => traits.includes(t)).length * 2);
    b += interviewSkill(g, o)?.bonus ?? 0;
    const w = getWorld(g.world), asked = (o.courses ?? []).filter(id => !w || !!courseOf(w, id)); // (a course the world dropped isn't asked for)
    if (asked.length && asked.every(id => learning(g).done.includes(id)))
        b += 2; // you have the course they ask for (not just taking it)
    b += effectAdd(g, w, 'interview', o.id); // what effects add (life goals' perks)
    const s = g.player.stats;
    if ((s.hygiene ?? 100) < 30)
        b -= 3; // nobody hires someone who smells
    if ((s.energy ?? 100) < 25)
        b -= 2;
    if ((s.mood ?? 100) < 25)
        b -= 2;
    return b;
}
export const interviewChance = (g, o, traits) => { o = trackOf(g, o); const b = interviewBonus(g, o, traits), dc = interviewDc(o, getWorld(g.world)); let ok = 0; for (let d = 1; d <= 20; d++)
    if (d === 20 || (d > 1 && d + b >= dc))
        ok++; return ok * 5; };
/** Days until you can apply to this job again (0: now). Today's interview, whatever came of it, waits till tomorrow;
 *  a no waits a few days (`retry`; saves from before kept only the day you tried). */
export function retryIn(g, id) {
    const s = learning(g), next = Math.max((s.interviews[id] ?? -1) + 1, s.retry?.[id] ?? 0);
    return Math.max(0, next - g.day);
}
export const triedToday = (g, id) => retryIn(g, id) > 0;
/** "tomorrow", "in 3 days": when you can try a job again. */
export const retryText = (g, id) => { const n = retryIn(g, id); return n <= 1 ? 'tomorrow' : `in ${n} days`; };
export function interview(g, o, traits, rnd = Math.random) {
    const s = learning(g);
    s.interviews[o.id] = g.day;
    o = trackOf(g, o);
    const d20 = 1 + Math.floor(rnd() * 20), bonus = interviewBonus(g, o, traits), dc = interviewDc(o, getWorld(g.world));
    const ok = d20 === 20 || (d20 > 1 && d20 + bonus >= dc);
    const crit = d20 === 20;
    void nowAbs;
    if (!ok)
        (s.retry ??= {})[o.id] = g.day + (d20 === 1 ? DISASTER_DAYS : RETRY_DAYS);
    else if (s.retry)
        delete s.retry[o.id];
    return { ok, crit, text: ok ? (crit ? 'They loved you: you start with a head start toward your first promotion.' : 'The interview went well.')
            : d20 === 1 ? `The interview was a disaster. They won't see you again for ${DISASTER_DAYS} days.` : 'They chose someone else this time. Try again tomorrow.' };
}
