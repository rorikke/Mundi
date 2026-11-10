// Courses you take (at home, online, or at the university): enrolling, the study sessions that finish them, the skill
// levels and traits they teach, and the courses a job or a rank asks for. What the save keeps is `player.learning`
// (the course being taken, its progress, the ones finished, and the counters some life goals are measured with).
// (Skills themselves, with their levels, are in hobbies.ts; the job interview and the traits you gain are in skills.ts.)
import type { Save } from '../core/store.js';
import type { WorldDef, Occupation, Course } from '../core/world.js';
import { systemOn, isScenario } from '../core/world.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { priceOf } from './bills.js';
import { playerHomeId, placeOf } from './places.js';
import { setSkillLevel, skillName } from './hobbies.js';
import { gainTrait } from './skills.js';

export const coursesOf = (w: WorldDef): Course[] => (systemOn(w, 'courses') ? (w.catalogs as any).courses ?? [] : []) as Course[];

/** What the save keeps for courses and life goals' counters. `taking` and what follows it are the shape courses grow
 *  into (two at a time, attendance, fees by the season); nothing writes them until `current` is replaced. */
export interface Learning {
    current?: string; progress: Record<string, number>; lastDay: Record<string, number>; done: string[]; count: Record<string, number>; interviews: Record<string, number>; earned: string[];
    /** The courses being taken (two at most). */
    taking?: string[];
    /** Per course: the last season whose fee is paid, the day it started, classes missed, make-up classes owed. */
    paid?: Record<string, number>; start?: Record<string, number>; missed?: Record<string, number>; makeups?: Record<string, number>;
    /** Per course and skill: the experience the course has given in all, across every attempt. */
    gave?: Record<string, Record<string, number>>;
}
export function learning(g: Save): Learning {
    const p = g.player as any;
    const s = (p.learning ??= {});
    s.progress ??= {}; s.lastDay ??= {}; s.done ??= []; s.count ??= {}; s.interviews ??= {}; s.earned ??= [];
    return s as Learning;
}

export const courseOf = (w: WorldDef, id?: string) => coursesOf(w).find(c => c.id === id);
export const hasCourse = (g: Save, id: string) => learning(g).done.includes(id);
export const canStudyHere = (g: Save, w: WorldDef) => isScenario(w) || g.player.loc === playerHomeId || (placeOf(g, w, g.player.loc)?.tags ?? []).includes('study');
export const studiedToday = (g: Save, id: string) => learning(g).lastDay[id] === g.day;

export function enroll(g: Save, w: WorldDef, id: string): string {
    const c = courseOf(w, id); if (!c) return '';
    const l = learning(g);
    if (l.current) return 'Finish the course you are taking first.';
    if (l.done.includes(id)) return 'You already finished this course.';
    const price = priceOf(g, c.cost);
    if (g.player.money < price) return 'Not enough money.';
    g.player.money -= price; book(g, `Course: ${c.name}`, -price);
    l.current = id; l.progress[id] ??= 0;
    note(g, '{u} enrolled in a course: {0}.', [c.name], [], g.player.loc, 'study');
    return '';
}
export function dropCourse(g: Save) { learning(g).current = undefined; }
// One study session (once a day): a day of the course. The last one finishes it and teaches its traits.
export function studySession(g: Save, w: WorldDef): string[] {
    const l = learning(g); const c = courseOf(w, l.current); if (!c) return [];
    if (studiedToday(g, c.id)) return ['You already studied today. Come back tomorrow.'];
    l.lastDay[c.id] = g.day;
    l.progress[c.id] = (l.progress[c.id] ?? 0) + 1;
    if (l.progress[c.id] < c.days) return [`${c.name}: day ${l.progress[c.id]} of ${c.days} done.`];
    l.done.push(c.id); l.current = undefined;
    const got = (c.grants ?? []).filter(t => gainTrait(g, t, 'course'));
    for (const [id, n] of Object.entries(c.skills ?? {})) setSkillLevel(g, id, n);
    const taught = Object.entries(c.skills ?? {}).map(([id, n]) => `${skillName(w, id)} ${n}`);
    note(g, '{u} finished the course "{0}".', [c.name], [], g.player.loc, 'study');
    return [`You finished ${c.name}!${got.length ? ` You are now ${got.join(' and ')}.` : ''}${taught.length ? ` Skills: ${taught.join(', ')}.` : ''}`];
}

// (a course the world no longer offers is not asked for: the job would be out of reach forever)
export const missingCourses = (g: Save, w: WorldDef, o: Occupation) => ((o as any).courses ?? []).filter((id: string) => !!courseOf(w, id) && !hasCourse(g, id)).map((id: string) => courseOf(w, id)?.name ?? id);
