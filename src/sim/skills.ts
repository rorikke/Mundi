// The job interview, a roll where the traits a job looks for are your bonus; the traits you gain from courses and life
// goals; and the counters some life goals are measured with. The traits you have are what the d20 rolls use (each
// matching trait is +2), so learning one helps everywhere. (Courses themselves are in courses.ts, skills with their
// levels in hobbies.ts.)
import { nowAbs, type Save } from '../core/store.js';
import type { Occupation } from '../core/world.js';
import { learning } from './courses.js';

// Counters for life goals (meals cooked, workouts, shifts…).
export const countUp = (g: Save, key: string, n = 1) => { const c = learning(g).count; c[key] = (c[key] ?? 0) + n; };
export const countOf = (g: Save, key: string) => learning(g).count[key] ?? 0;

/* ---------- traits you gain ---------- */

// A trait learned in a course or earned with a life goal: kept apart from the ones you chose, so the profile can say where it came from.
export function gainTrait(g: Save, trait: string, from: 'course' | 'goal'): boolean {
    const t = (g.player.traits ??= {}) as Record<string, string[]>;
    const key = from === 'course' ? 'learned' : 'earned';
    if (Object.values(t).flat().includes(trait)) return false;
    (t[key] ??= []).push(trait);
    return true;
}

/* ---------- the job interview ---------- */

export function interviewDc(o: Occupation) { const top = o.ranks.at(-1)?.pay ?? 0; return 9 + (o.needs?.length ? 3 : 0) + (top >= 50 ? 2 : 0); }
export function interviewBonus(g: Save, o: Occupation, traits: string[]) {
    let b = 0;
    if ((o.needs ?? []).some(t => traits.includes(t))) b += 4;
    b += Math.min(6, (o.likes ?? []).filter(t => traits.includes(t)).length * 2);
    if (((o as any).courses ?? []).length) b += 2;   // you have the course they ask for
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
