// The job interview, a roll where what you're good at (the best skill the job uses) and the traits it likes are your
// bonus; the traits you gain from courses and life goals (a trait the world maps to a skill gives its levels instead);
// and the counters some life goals are measured with. (Courses themselves are in courses.ts, skills with their levels
// in hobbies.ts.)
import { nowAbs, type Save } from '../core/store.js';
import { getWorld, type Occupation } from '../core/world.js';
import { learning, courseOf } from './courses.js';
import { levelOf, setSkillLevel } from './hobbies.js';
import { strengthOf } from './traits.js';
import { parseWhen } from './when.js';

// Counters for life goals (meals cooked, workouts, shifts…).
export const countUp = (g: Save, key: string, n = 1) => { const c = learning(g).count; c[key] = (c[key] ?? 0) + n; };
export const countOf = (g: Save, key: string) => learning(g).count[key] ?? 0;

/* ---------- traits you gain ---------- */

// A trait learned in a course or earned with a life goal: kept apart from the ones you chose, so the profile can say where it came from.
// One the world maps to a skill ("Good cook" is Cooking 3) gives those levels instead, since being good at something is a skill.
export function gainTrait(g: Save, trait: string, from: 'course' | 'goal'): boolean {
    const t = (g.player.traits ??= {}) as Record<string, string[]>;
    const key = from === 'course' ? 'learned' : 'earned';
    const levels = strengthOf(getWorld(g.world), trait);
    if (levels) { for (const [id, n] of Object.entries(levels)) setSkillLevel(g, id, n); return true; }
    if (Object.values(t).flat().includes(trait)) return false;
    (t[key] ??= []).push(trait);
    return true;
}

/* ---------- the job interview ---------- */

export function interviewDc(o: Occupation) { const top = o.ranks.at(-1)?.pay ?? 0; return 9 + (o.needs?.length ? 3 : 0) + (top >= 50 ? 2 : 0); }
/** The skills a job's interview looks at: the ones it needs to be hired, its hobby, and what its first two ranks ask for
 *  (a rank's skill needs, or the skills in its condition). */
export function interviewSkills(o: Occupation): string[] {
    const ids = new Set<string>([...Object.keys(o.skills ?? {}), ...(o.hobby?.id ? [o.hobby.id] : [])]);
    for (const r of o.ranks.slice(0, 2)) {
        for (const id of Object.keys(r.needs ?? {})) if (id !== 'performance') ids.add(id);
        for (const c of parseWhen(r.when).conds) if (c.key === 'skill' && !c.not) for (const v of c.values) ids.add(v.split(/s+/)[0]);
    }
    return [...ids];
}
/** What you're best at for this job: the skill, your level in it, and what it adds (about +1 per two levels, up to +4). */
export function interviewSkill(g: Save, o: Occupation): { id: string; level: number; bonus: number } | null {
    let best: { id: string; level: number; bonus: number } | null = null;
    for (const id of interviewSkills(o)) { const level = levelOf(g, id); if (!best || level > best.level) best = { id, level, bonus: Math.min(4, Math.floor(level / 2)) }; }
    return best && best.bonus > 0 ? best : null;
}
export function interviewBonus(g: Save, o: Occupation, traits: string[]) {
    let b = 0;
    if ((o.needs ?? []).some(t => traits.includes(t))) b += 4;
    b += Math.min(4, (o.likes ?? []).filter(t => traits.includes(t)).length * 2);
    b += interviewSkill(g, o)?.bonus ?? 0;
    const w = getWorld(g.world), asked = (((o as any).courses ?? []) as string[]).filter(id => !w || !!courseOf(w, id));   // (a course the world dropped isn't asked for)
    if (asked.length && asked.every(id => learning(g).done.includes(id))) b += 2;   // you have the course they ask for (not just taking it)
    const s = g.player.stats;
    if ((s.hygiene ?? 100) < 30) b -= 3;   // nobody hires someone who smells
    if ((s.energy ?? 100) < 25) b -= 2;
    if ((s.mood ?? 100) < 25) b -= 2;
    return b;
}
export const interviewChance = (g: Save, o: Occupation, traits: string[]) => { const b = interviewBonus(g, o, traits), dc = interviewDc(o); let ok = 0; for (let d = 1; d <= 20; d++) if (d === 20 || (d > 1 && d + b >= dc)) ok++; return ok * 5; };
export const triedToday = (g: Save, id: string) => learning(g).interviews[id] === g.day;
export function interview(g: Save, o: Occupation, traits: string[], rnd = Math.random): { ok: boolean; crit: boolean; text: string } {
    learning(g).interviews[o.id] = g.day;
    const d20 = 1 + Math.floor(rnd() * 20), bonus = interviewBonus(g, o, traits), dc = interviewDc(o);
    const ok = d20 === 20 || (d20 > 1 && d20 + bonus >= dc);
    const crit = d20 === 20;
    void nowAbs;
    return { ok, crit, text: ok ? (crit ? 'They loved you: you start with a head start toward your first promotion.' : 'The interview went well.')
        : d20 === 1 ? 'The interview was a disaster.' : 'They chose someone else this time. Try again tomorrow.' };
}
