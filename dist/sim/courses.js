import { systemOn, isScenario } from '../core/world.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { priceOf } from './bills.js';
import { playerHomeId, placeOf } from './places.js';
import { setSkillLevel, skillName } from './hobbies.js';
import { gainTrait } from './skills.js';
export const coursesOf = (w) => (systemOn(w, 'courses') ? w.catalogs.courses ?? [] : []);
export function learning(g) {
    const p = g.player;
    const s = (p.learning ??= {});
    s.progress ??= {};
    s.lastDay ??= {};
    s.done ??= [];
    s.count ??= {};
    s.interviews ??= {};
    s.earned ??= [];
    return s;
}
export const courseOf = (w, id) => coursesOf(w).find(c => c.id === id);
export const hasCourse = (g, id) => learning(g).done.includes(id);
export const canStudyHere = (g, w) => isScenario(w) || g.player.loc === playerHomeId || (placeOf(g, w, g.player.loc)?.tags ?? []).includes('study');
export const studiedToday = (g, id) => learning(g).lastDay[id] === g.day;
export function enroll(g, w, id) {
    const c = courseOf(w, id);
    if (!c)
        return '';
    const l = learning(g);
    if (l.current)
        return 'Finish the course you are taking first.';
    if (l.done.includes(id))
        return 'You already finished this course.';
    const price = priceOf(g, c.cost);
    if (g.player.money < price)
        return 'Not enough money.';
    g.player.money -= price;
    book(g, `Course: ${c.name}`, -price);
    l.current = id;
    l.progress[id] ??= 0;
    note(g, '{u} enrolled in a course: {0}.', [c.name], [], g.player.loc, 'study');
    return '';
}
export function dropCourse(g) { learning(g).current = undefined; }
// One study session (once a day): a day of the course. The last one finishes it and teaches its traits.
export function studySession(g, w) {
    const l = learning(g);
    const c = courseOf(w, l.current);
    if (!c)
        return [];
    if (studiedToday(g, c.id))
        return ['You already studied today. Come back tomorrow.'];
    l.lastDay[c.id] = g.day;
    l.progress[c.id] = (l.progress[c.id] ?? 0) + 1;
    if (l.progress[c.id] < c.days)
        return [`${c.name}: day ${l.progress[c.id]} of ${c.days} done.`];
    l.done.push(c.id);
    l.current = undefined;
    const got = (c.grants ?? []).filter(t => gainTrait(g, t, 'course'));
    for (const [id, n] of Object.entries(c.skills ?? {}))
        setSkillLevel(g, id, n);
    const taught = Object.entries(c.skills ?? {}).map(([id, n]) => `${skillName(w, id)} ${n}`);
    note(g, '{u} finished the course "{0}".', [c.name], [], g.player.loc, 'study');
    return [`You finished ${c.name}!${got.length ? ` You are now ${got.join(' and ')}.` : ''}${taught.length ? ` Skills: ${taught.join(', ')}.` : ''}`];
}
// (a course the world no longer offers is not asked for: the job would be out of reach forever)
export const missingCourses = (g, w, o) => (o.courses ?? []).filter((id) => !!courseOf(w, id) && !hasCourse(g, id)).map((id) => courseOf(w, id)?.name ?? id);
