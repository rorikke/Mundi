import { adultOn } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { onDay, onAction, moduleLink, studentLink } from './hooks.js';
import { coursesOf, courseOf, learning, startModule, endModule, moduleTally, classWindow, windowText, scheduleWords, canStudyHere } from './courses.js';
import { seasonDays, WEEKDAYS } from './time.js';
import { note } from './facts.js';
import { book } from './ledger.js';
import { money } from './needs.js';
import { priceOf } from './bills.js';
import { rollBonus, rollD20 } from './dice.js';
import { setSkillLevel, skillDef, trainSkill } from './hobbies.js';
import { whenHolds } from './when.js';
import { schoolOf } from './institutions.js';
import { milestonePoints } from './points.js';
import { addStatus } from './needs.js';
import { presentAt } from './people.js';
import { addBond } from './social.js';
export const GRADE_POINTS = { A: 4, B: 3, C: 2, D: 1, F: 0 };
export function uniOf(g) {
    const u = (g.uni ??= {});
    u.cur ??= null;
    u.past ??= [];
    const c = u.cur;
    if (c) {
        c.picks ??= [];
        c.next ??= [];
        c.grades ??= {};
        c.history ??= [];
        c.study ??= {};
        c.ended ??= {};
        c.weak ??= 0;
        c.probation ??= false;
        c.due ??= 0;
        c.paid ??= 0;
        c.term ??= 0;
        c.termDay ??= 0;
    }
    return u;
}
/** The degree you study for (null when none, or with the system off). */
export const degreeOf = (g, w) => (on(w) ? uniOf(g).cur : null);
/* ---------- the world's degrees ---------- */
const on = (w) => systemOn(w, 'institutions') && systemOn(w, 'courses') && allDegrees(w).length > 0;
/** Every degree the world's schools offer, with its school. */
export const allDegrees = (w) => (w.institutions ?? []).flatMap(inst => (inst.degrees ?? []).map(d => ({ inst, d })));
/** The degrees offered now (none with the system off). */
export const degreesOffered = (w) => (on(w) ? allDegrees(w) : []);
export const findDegree = (w, id) => allDegrees(w).find(x => x.d.id === id) ?? null;
export const degreeName = (w, id) => findDegree(w, id)?.d.name ?? id;
export const termsOf = (d) => d.terms ?? 4;
export const perTermOf = (d) => d.perTerm ?? [2, 3];
export const creditsOf = (d) => d.credits ?? termsOf(d) * perTermOf(d)[0];
export const minGpaOf = (d) => d.minGpa ?? 2;
export const workCapOf = (d) => d.workCap ?? 3;
/** A distinguished degree: a GPA of at least this. */
export const DISTINGUISHED = 3.5;
/** Modules of a degree (not retired; adult ones only with adult content on). */
export const modulesOf = (g, w, id) => coursesOf(w).filter(c => c.degree === id && !c.retired && (!c.adult || adultOn(g)));
export const studyAsk = (c) => Math.max(0, c.study ?? 3);
/* ---------- terms ---------- */
const seasonNo = (g, day) => Math.floor((Math.max(1, day) - 1) / seasonDays(g));
/** The first and last day of the term (season) a day is in. */
export const termStartOf = (g, day = g.day) => seasonNo(g, day) * seasonDays(g) + 1;
export const termEndOf = (g, day = g.day) => termStartOf(g, day) + seasonDays(g) - 1;
/** Enrolling this early in a season joins its term; later, you wait for the next. */
export const joinsNow = (g) => g.day - termStartOf(g) < Math.ceil(seasonDays(g) / 4);
/** Days until the next term begins. */
export const daysToNextTerm = (g) => termEndOf(g) + 1 - g.day;
/** The days before a term's end when next term's modules are chosen. */
export const PICK_DAYS = 7;
export const pickingNow = (g, s) => s.termDay === 0 || termEndOf(g) - g.day < PICK_DAYS;
/** You may change this term's modules in its first days (classes missed meanwhile still count). */
export const CHANGE_DAYS = 3;
export const canChangeNow = (g, s) => s.termDay > 0 && g.day - s.termDay < CHANGE_DAYS;
const passedOf = (s) => Object.entries(s.grades).filter(([, gr]) => gr !== 'F').map(([id]) => id);
export const passedCount = (s) => passedOf(s).length;
/** The GPA over every module taken (its latest grade); null before the first grade. */
export function gpaOf(s) {
    const all = Object.values(s.grades);
    return all.length ? Math.round((all.reduce((a, gr) => a + GRADE_POINTS[gr], 0) / all.length) * 100) / 100 : null;
}
/** Required modules not passed yet. */
export const coreLeft = (g, w, s) => modulesOf(g, w, s.id).filter(c => c.core && (!s.grades[c.id] || s.grades[c.id] === 'F'));
/** Modules still to pass: the credits left, at least the required ones not passed yet. */
export function creditsLeft(g, w, s) {
    const d = findDegree(w, s.id)?.d;
    if (!d)
        return 0;
    return Math.max(creditsOf(d) - passedCount(s), coreLeft(g, w, s).length);
}
/** The modules you may take in a term (`term`: its number): from that term on, not passed yet. */
// (next term's choice leaves out this term's modules: they may be passed by then; one failed is taken again later)
export const offeredFor = (g, w, s, term) => modulesOf(g, w, s.id).filter(c => (c.term ?? 1) <= term && !passedOf(s).includes(c.id) && !(term > s.term && s.termDay > 0 && s.picks.includes(c.id)));
/** How many modules a term takes: [least, most] (fewer when fewer are left or offered). */
export function pickRange(g, w, s, term) {
    const d = findDegree(w, s.id)?.d;
    if (!d)
        return [0, 0];
    const [a, b] = perTermOf(d), n = offeredFor(g, w, s, term).length, left = Math.max(1, creditsLeft(g, w, s));
    return [Math.min(a, n, left), Math.min(b, n)];
}
/* ---------- when classes meet ---------- */
// A module's class hours on each weekday of a week from `from` (weekday index 0 Monday → its window, if it meets).
function weekOf(g, w, c, from) {
    const out = new Map();
    for (let d = from; d < from + 7; d++) {
        const win = classWindow(g, w, c, d);
        if (win)
            out.set((((d - 1) % 7) + 7) % 7, win);
    }
    return out;
}
/** Two modules whose classes meet at the same time on some weekday (you can't be in both). */
export function clashes(g, w, a, b, from = g.day) {
    const x = weekOf(g, w, a, from), y = weekOf(g, w, b, from);
    for (const [wd, u] of x) {
        const v = y.get(wd);
        if (v && u.from < v.to && v.from < u.to)
            return true;
    }
    return false;
}
/** A module's classes in words ("Mon, Thu · 10:00–12:00"). */
export function classTimes(g, w, c, from = g.day) {
    const wk = weekOf(g, w, c, from);
    if (!wk.size)
        return scheduleWords(c);
    const first = [...wk.values()][0];
    return `${[...wk.keys()].sort((a, b) => a - b).map(i => WEEKDAYS[i].slice(0, 3)).join(', ')} · ${windowText(first)}`;
}
/** Why this set of modules can't be next term's ('' when it can). */
export function picksBlock(g, w, s, ids, term = s.term + 1) {
    const offered = offeredFor(g, w, s, term), [lo, hi] = pickRange(g, w, s, term);
    const list = ids.map(id => offered.find(c => c.id === id));
    if (list.some(c => !c))
        return 'One of those modules is not offered that term.';
    if (ids.length < lo)
        return `Choose at least ${lo} module${lo === 1 ? '' : 's'}.`;
    if (ids.length > hi)
        return `${hi} module${hi === 1 ? '' : 's'} at most in a term.`;
    for (let i = 0; i < list.length; i++)
        for (let k = i + 1; k < list.length; k++)
            if (clashes(g, w, list[i], list[k]))
                return `${list[i].name} and ${list[k].name} meet at the same time.`;
    return '';
}
/** The modules chosen for you: the required ones first (earliest term first), then the others, as many as the term's
 *  least, skipping any that meet at the same time as one already chosen. */
export function defaultPicks(g, w, s, term = s.term + 1) {
    const [lo] = pickRange(g, w, s, term);
    const order = offeredFor(g, w, s, term).sort((a, b) => Number(!!b.core) - Number(!!a.core) || (a.term ?? 1) - (b.term ?? 1));
    const out = [];
    for (const c of order) {
        if (out.length >= lo)
            break;
        if (!out.some(x => clashes(g, w, x, c)))
            out.push(c);
    }
    return out.map(c => c.id);
}
/* ---------- money: tuition, the scholarship, aid ---------- */
const tenureOk = (g, a) => { const t = learning(g).tenure, j = g.player.job; return !a.held || (!!j && !!t && t.job === j.id && g.day - t.day >= a.held * seasonDays(g)); };
function bestAid(g, w, s, d, enrolling) {
    const list = (d.aid ?? []).filter(a => a.share > 0 && (a.kind !== 'merit' || (enrolling ? whenHolds(g, w, a.when) : s.aid?.id === a.id))
        && (a.kind === 'merit' || ((a.kind !== 'employer' || !!g.player.job) && (!a.jobless || !g.player.job) && tenureOk(g, a) && whenHolds(g, w, a.when))));
    return list.sort((a, b) => b.share - a.share)[0] ?? null;
}
const paysAt = (a) => a.pays ?? (a.kind === 'public' ? 'finish' : 'enroll');
/** A term's tuition for you: nothing while the scholarship holds, else the fee less the aid that comes off at once. */
export function tuitionFor(g, w, s, enrolling = false) {
    const d = findDegree(w, s.id)?.d;
    const fee = d ? priceOf(g, d.tuition ?? 0) : 0;
    if (!d || !fee)
        return { fee: 0, net: 0, aid: null, scholarship: false };
    if (s.scholarship === 'held')
        return { fee, net: 0, aid: null, scholarship: true };
    const a = bestAid(g, w, s, d, enrolling);
    return { fee, net: a && paysAt(a) === 'enroll' ? Math.round(fee * (1 - a.share)) : fee, aid: a, scholarship: false };
}
function chargeTuition(g, w, s, out) {
    const t = tuitionFor(g, w, s, s.term <= 1), name = degreeName(w, s.id);
    if (t.aid)
        s.aid = { id: t.aid.id, name: t.aid.name, share: t.aid.share, pays: paysAt(t.aid) };
    if (t.scholarship) {
        out.push(`Your scholarship pays this term's tuition (${money(w, t.fee)}).`);
        return;
    }
    if (!t.net)
        return;
    if (g.player.money >= t.net) {
        g.player.money -= t.net;
        book(g, `${name}: tuition`, -t.net);
        s.paid += t.net;
        out.push(`Tuition for the term: ${money(w, t.net)}${t.aid && paysAt(t.aid) === 'enroll' ? ` (${t.aid.name} paid ${Math.round(t.aid.share * 100)}%)` : ''}.`);
    }
    else {
        s.due = t.net;
        out.push(`Tuition for the term is ${money(w, t.net)} and you don't have it: your classes wait until it's paid (in the Campus app).`);
    }
}
/** Pay the term's tuition still owed (when you have it). */
export function payTuition(g, w) {
    const s = degreeOf(g, w);
    if (!s?.due)
        return '';
    if (g.player.money < s.due)
        return 'Not enough money.';
    g.player.money -= s.due;
    book(g, `${degreeName(w, s.id)}: tuition`, -s.due);
    s.paid += s.due;
    const paid = s.due;
    s.due = 0;
    return `You paid ${money(w, paid)}: classes go on.`;
}
moduleLink.held = (g, w, course) => { const s = degreeOf(g, w); return s && s.due > 0 && s.picks.includes(course) ? `This term's tuition is unpaid (${money(w, s.due)}): pay it in the Campus app.` : ''; };
/* ---------- enrolling, terms, leaving ---------- */
/** Why you can't enroll in this degree ('' when you can). */
export function enrollBlock(g, w, id) {
    const x = findDegree(w, id);
    if (!x || !on(w))
        return 'This degree is not offered.';
    const u = uniOf(g);
    if (u.cur)
        return u.cur.id === id ? 'You already study for this degree.' : `You already study for ${degreeName(w, u.cur.id)}. Leave it first.`;
    if (learning(g).done.includes(id))
        return 'You already hold this degree.';
    if (u.past.some(r => r.id === id && r.how === 'expelled' && g.day - r.day < 4 * seasonDays(g)))
        return 'You were expelled from it less than a year ago.';
    if (!modulesOf(g, w, id).length)
        return 'This degree has no modules yet.';
    return '';
}
/** Enroll in a degree: its first term starts now when the season is young, else when the next one begins. `scholarship`:
 *  the tuition is paid while your grades hold (the student start). A place on a school's old ladder there ends. */
export function enrollDegree(g, w, id, opts = {}) {
    const why = enrollBlock(g, w, id);
    if (why)
        return { ok: false, text: why, msgs: [] };
    const { inst, d } = findDegree(w, id);
    const s = { inst: inst.id, id, since: g.day, term: 0, termDay: 0, picks: [], next: [], grades: {}, history: [], study: {}, ended: {}, weak: 0, probation: false, due: 0, paid: 0 };
    if (opts.scholarship)
        s.scholarship = 'held';
    uniOf(g).cur = s;
    if (schoolOf(g)[inst.id])
        delete schoolOf(g)[inst.id]; // (the weekly tuition of the old ladder stops)
    if (!opts.quiet)
        note(g, '{u} enrolled in a degree: {0} at {1}.', [d.name, inst.name], [], g.player.loc, 'study');
    const msgs = [];
    if (joinsNow(g))
        startTerm(g, w, s, msgs);
    else
        s.next = defaultPicks(g, w, s, 1);
    const when = s.termDay ? `Term 1 has begun: ${s.picks.map(m => courseOf(w, m)?.name ?? m).join(', ')}.` : `Your first term begins in ${daysToNextTerm(g)} day${daysToNextTerm(g) === 1 ? '' : 's'}: choose its modules in the Campus app.`;
    return { ok: true, text: `You are a student of ${d.name} at ${inst.name}. ${when}`, msgs };
}
function startTerm(g, w, s, out) {
    const term = s.term + 1;
    const picks = s.next.length && !picksBlock(g, w, s, s.next, term) ? s.next : defaultPicks(g, w, s, term);
    s.term = term;
    s.termDay = termStartOf(g);
    s.picks = picks;
    s.next = [];
    s.study = {};
    s.ended = {};
    for (const id of picks)
        startModule(g, w, id);
    const name = degreeName(w, s.id);
    note(g, '{u} began term {0} of {1}.', [String(term), name], [], g.player.loc, 'study');
    out.push(`Term ${term} of ${name} begins: ${picks.map(id => courseOf(w, id)?.name ?? id).join(', ')}.`);
    chargeTuition(g, w, s, out);
}
/** Choose next term's modules (or, in a term's first days, change this term's). */
export function choosePicks(g, w, ids) {
    const s = degreeOf(g, w);
    if (!s)
        return '';
    ids = [...new Set(ids)];
    if (canChangeNow(g, s) && !pickingNow(g, s)) {
        const why = picksBlock(g, w, s, ids, s.term);
        if (why)
            return why;
        for (const id of s.picks.filter(x => !ids.includes(x))) {
            endModule(g, id);
            delete s.ended[id];
            delete s.study[id];
        }
        for (const id of ids.filter(x => !s.picks.includes(x)))
            startModule(g, w, id);
        s.picks = ids;
        return 'This term\'s modules are changed.';
    }
    if (!pickingNow(g, s))
        return `Next term's modules are chosen in the last ${PICK_DAYS} days of this one.`;
    const why = picksBlock(g, w, s, ids, s.term + 1);
    if (why)
        return why;
    s.next = ids;
    return 'Next term\'s modules are chosen.';
}
// A module's classes ended before the term (all done, or failed for misses): what the grade needs is kept.
moduleLink.ended = (g, w, course, how) => {
    const s = degreeOf(g, w);
    if (!s || !s.picks.includes(course))
        return;
    const t = moduleTally(g, w, course);
    if (!t)
        return;
    s.ended[course] = { ...t, ...(how === 'failed' ? { failed: true } : {}) };
};
/** Leave the degree: this term's modules end ungraded; what you passed stays on record only as experience. */
export function leaveDegree(g, w, how = 'left') {
    const u = uniOf(g), s = u.cur;
    if (!s)
        return '';
    for (const id of s.picks)
        endModule(g, id);
    u.past.push({ inst: s.inst, id: s.id, day: g.day, gpa: gpaOf(s) ?? 0, distinguished: false, how });
    u.cur = null;
    const name = degreeName(w, s.id);
    note(g, how === 'expelled' ? '{u} was expelled from {0}.' : '{u} dropped out of {0}.', [name], [], g.player.loc, 'study');
    return how === 'expelled' ? `You were expelled from ${name}: three weak terms.` : `You left ${name}.`;
}
/* ---------- coursework ---------- */
// (a module whose classes ended before the term keeps its days in `ended`)
const termWeeks = (g, s, id) => Math.max(1, (learning(g).plan[id]?.span ?? s.ended[id]?.span ?? seasonDays(g)) / 7);
/** Minutes of coursework a module asks for over this term. */
export const studyWanted = (g, s, c) => Math.round(studyAsk(c) * 60 * termWeeks(g, s, c.id));
/** How far along a module's coursework is (0–1, 1 when it asks for none). */
export const studyShare = (g, s, c) => { const want = studyWanted(g, s, c); return want ? Math.min(1, (s.study[c.id] ?? 0) / want) : 1; };
/** The module coursework goes to: the one furthest behind (by share of what it asks for so far). */
export function courseworkFor(g, w, s) {
    if (!s.termDay)
        return null;
    const list = s.picks.map(id => courseOf(w, id)).filter((c) => !!c && studyShare(g, s, c) < 1);
    return list.sort((a, b) => studyShare(g, s, a) - studyShare(g, s, b))[0] ?? null;
}
/** Minutes of coursework, to the module furthest behind (a little practice in its skill too). */
export function addCoursework(g, w, minutes) {
    const s = degreeOf(g, w);
    const c = s && courseworkFor(g, w, s);
    if (!s || !c)
        return [];
    s.study[c.id] = (s.study[c.id] ?? 0) + minutes;
    const skill = moduleSkill(w, c);
    const out = skill ? trainSkill(g, w, skill, Math.round(minutes / 15)) : [];
    out.unshift(`Coursework for ${c.name}: ${Math.round(studyShare(g, s, c) * 100)}% of the term's done.`);
    return out;
}
export const COURSEWORK_MINUTES = 60;
/** The engine's coursework action, where you can study (home, the library, a café for it). */
export function courseworkAction(g, w) {
    const s = degreeOf(g, w);
    const c = s && courseworkFor(g, w, s);
    if (!c || !canStudyHere(g, w))
        return null;
    return { id: 'x-coursework', name: `Coursework: ${c.name}`, label: `Coursework: ${c.name}`, icon: '📝', cost: 0, minutes: COURSEWORK_MINUTES, effects: { energy: -6, mood: -2, hunger: -3 } };
}
// A world's own studying (an action tagged `study`: the library, a quiet room) counts as coursework too.
onAction.push((g, w, a) => {
    if (!(a.tags ?? []).includes('study') || a.id === 'x-coursework')
        return;
    addCoursework(g, w, Number(a.minutes) || COURSEWORK_MINUTES);
});
/* ---------- grades, the end of a term ---------- */
const moduleSkill = (w, c) => Object.keys(c.skills ?? {}).find(id => skillDef(w, id)) ?? (findDegree(w, c.degree)?.d.skills ?? []).find(id => skillDef(w, id));
/** A grade from a score of 0–100: attendance (50), coursework (30) and the final (20). */
export const gradeFor = (score) => (score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F');
/** A module's grade at the term's end: attendance share, coursework share and the final, a d20 with the one roll bonus
 *  on its skill. Failed for missed classes: F. */
export function gradeModule(g, w, s, c, rnd = Math.random) {
    const t = s.ended[c.id] ?? moduleTally(g, w, c.id) ?? { attended: 0, n: 1, missed: 0 };
    if (t.failed)
        return { grade: 'F', score: 0, parts: [0, 0, 0] };
    const att = Math.min(1, t.attended / Math.max(1, t.n)), work = studyShare(g, s, c);
    const skill = moduleSkill(w, c), bonus = rollBonus(g, w, { skill });
    const exam = Math.max(0, Math.min(1, (rollD20(g, w, bonus, 15, rnd) + bonus) / 20));
    const score = Math.round(50 * att + 30 * work + 20 * exam);
    return { grade: gradeFor(score), score, parts: [att, work, exam] };
}
// The term is over: each module graded, the GPA, weak terms (probation, expelled), the scholarship, graduating.
function endTerm(g, w, s, out) {
    const x = findDegree(w, s.id);
    if (!x)
        return;
    const { d, inst } = x;
    const grades = {};
    for (const id of s.picks) {
        const c = courseOf(w, id);
        if (!c) {
            endModule(g, id);
            continue;
        }
        // (the grade reads the term's study before the module leaves the courses engine and its plan)
        const r = gradeModule(g, w, s, c);
        endModule(g, id);
        grades[id] = r.grade;
        s.grades[id] = r.grade;
        if (r.grade !== 'F')
            for (const [sid, n] of Object.entries(c.skills ?? {}))
                setSkillLevel(g, sid, n);
    }
    const list = Object.values(grades);
    const gpa = list.length ? Math.round((list.reduce((a, gr) => a + GRADE_POINTS[gr], 0) / list.length) * 100) / 100 : 0;
    s.history.push({ term: s.term, day: g.day, gpa, grades });
    s.picks = [];
    s.study = {};
    s.ended = {};
    s.due = 0;
    out.push(`Term ${s.term} of ${d.name} is over: ${Object.entries(grades).map(([id, gr]) => `${courseOf(w, id)?.name ?? id} ${gr}`).join(', ') || 'no modules'} · GPA ${gpa.toFixed(2)}.`);
    note(g, '{u} finished term {0} of {1} with a GPA of {2}.', [String(s.term), d.name, gpa.toFixed(2)], [], g.player.loc, 'study');
    if (list.length && gpa < minGpaOf(d)) {
        s.weak++;
        if (s.scholarship === 'held') {
            s.scholarship = 'lost';
            out.push(`Your GPA was under ${minGpaOf(d).toFixed(1)}: you lost your scholarship. You pay the tuition from next term.`);
        }
        if (s.weak >= 3) {
            out.push(leaveDegree(g, w, 'expelled'));
            return;
        }
        if (s.weak === 2) {
            s.probation = true;
            out.push(`You are on academic probation: one more term under a ${minGpaOf(d).toFixed(1)} GPA and you are out.`);
        }
        else
            out.push(`A weak term (under a ${minGpaOf(d).toFixed(1)} GPA). Two more and you are out.`);
    }
    if (creditsLeft(g, w, s) <= 0)
        graduate(g, w, s, inst, d, out);
}
function graduate(g, w, s, inst, d, out) {
    const l = learning(g), gpa = gpaOf(s) ?? 0, distinguished = gpa >= DISTINGUISHED;
    if (!l.done.includes(d.id))
        l.done.push(d.id);
    if (s.aid?.pays === 'finish' && s.paid > 0) {
        const back = Math.round(s.paid * s.aid.share);
        if (back > 0) {
            g.player.money += back;
            book(g, `Refund: ${s.aid.name}`, back);
            out.push(`${s.aid.name} paid back ${money(w, back)}.`);
        }
    }
    const u = uniOf(g);
    u.past.push({ inst: inst.id, id: d.id, day: g.day, gpa, distinguished, how: 'graduated' });
    u.cur = null;
    note(g, distinguished ? '{u} graduated from {0} with distinction (GPA {1}).' : '{u} graduated from {0} (GPA {1}).', [`${d.name}, ${inst.name}`, gpa.toFixed(2)], [], inst.place, 'study');
    const jobs = (d.gives?.jobs ?? []).map(id => w.occupations.find(o => o.id === id)?.name).filter(Boolean);
    out.push(`You graduated: ${d.name}${distinguished ? ', with distinction' : ''} (GPA ${gpa.toFixed(2)})! A ceremony at ${inst.name}, a photo with the class.${distinguished && jobs.length ? ` A distinguished degree starts you a rank up as: ${jobs.join(', ')}.` : ''}`);
    const pts = milestonePoints(g, w, GRADUATE_POINTS * (distinguished ? 2 : 1), `degree:${d.id}`, 'for graduating');
    if (pts)
        out.push(pts);
}
/** Life points for graduating (twice with distinction). */
export const GRADUATE_POINTS = 100;
onDay.push((g, w) => {
    if (!on(w))
        return [];
    const s = uniOf(g).cur;
    if (!s)
        return [];
    const out = [];
    if (!findDegree(w, s.id)) {
        for (const id of s.picks)
            endModule(g, id);
        uniOf(g).cur = null;
        return ['A degree you studied for is not offered any more.'];
    }
    // a term ended (one or more seasons may have passed): grade it, then start the one beginning today
    if (s.termDay && seasonNo(g, g.day) > seasonNo(g, s.termDay))
        endTerm(g, w, s, out);
    const cur = uniOf(g).cur;
    if (cur && (!cur.termDay || seasonNo(g, g.day) > seasonNo(g, cur.termDay)) && joinsNow(g) && creditsLeft(g, w, cur) > 0)
        startTerm(g, w, cur, out);
    if (cur?.due && g.player.money >= cur.due)
        out.push(payTuition(g, w));
    if (cur?.termDay && termEndOf(g) - g.day === PICK_DAYS - 1 && !cur.next.length && creditsLeft(g, w, cur) > 0)
        out.push(`Choose next term's modules in the Campus app (term ${cur.term + 1} begins in ${PICK_DAYS} days).`);
    return out;
});
/* ---------- clubs ---------- */
/** Join one of your school's clubs ('' when it's not one of them); a meeting a week, at the school. */
export function joinDegreeClub(g, w, club) {
    const s = degreeOf(g, w);
    const inst = s && (w.institutions ?? []).find(i => i.id === s.inst);
    if (!s || !inst || !(inst.clubs ?? []).includes(club))
        return '';
    s.club = club;
    delete s.met;
    return `You joined the ${club}.`;
}
export function leaveDegreeClub(g, w) { const s = degreeOf(g, w); if (s) {
    delete s.club;
    delete s.met;
} }
const weekNo = (g) => Math.floor((g.day - 1) / 7);
/** The club's meeting can be held now (at the school, once a week). */
export const clubMeetsNow = (g, w) => { const s = degreeOf(g, w); const inst = s?.club && (w.institutions ?? []).find(i => i.id === s.inst); return !!inst && g.player.loc === inst.place && s.met !== weekNo(g); };
/** The week's club meeting: mood, and a little closer to the club's people who are there. */
export function degreeClubMeeting(g, w) {
    const s = degreeOf(g, w);
    const inst = s?.club && (w.institutions ?? []).find(i => i.id === s.inst);
    if (!s || !inst)
        return { text: '', minutes: 0 };
    if (g.player.loc !== inst.place)
        return { text: 'The club meets at the school.', minutes: 0 };
    if (s.met === weekNo(g))
        return { text: 'The club already met this week.', minutes: 0 };
    s.met = weekNo(g);
    addStatus(g, w, 'mood', 10);
    for (const r of presentAt(g, w, inst.place).filter(r => r.met))
        addBond(g, r.avatar, 3);
    note(g, '{u} went to a meeting of the {0}.', [s.club], [], inst.place, 'study');
    return { text: `A good meeting of the ${s.club}.`, minutes: 60 };
}
/* ---------- being a student ---------- */
const startOf = (g, w) => (w.starts ?? []).find(x => x.id === g.player.start);
studentLink.workCap = (g, w) => { const s = degreeOf(g, w); const d = s && findDegree(w, s.id)?.d; return d && systemOn(w, 'jobs') ? workCapOf(d) : null; };
studentLink.homeBlock = (g, w, zone) => {
    const s = degreeOf(g, w);
    if (!s || startOf(g, w)?.anyHome)
        return '';
    const z = w.homes.zones.find(x => x.id === zone);
    if (!z || z.student || !w.homes.zones.some(x => x.student))
        return '';
    return `While you study for a degree you can only rent student homes (${w.homes.zones.filter(x => x.student).map(x => x.name).join(', ')}), unless your family pays.`;
};
studentLink.headStart = (g, w, job) => (uniOf(g).past.some(r => r.how === 'graduated' && r.distinguished && (findDegree(w, r.id)?.d.gives?.jobs ?? []).includes(job)) && on(w) ? 1 : 0);
/** A home a student may rent now (any home when you don't study, or when your family pays). */
export const homeOk = (g, w, zone) => !studentLink.homeBlock(g, w, zone);
/* ---------- what the AI is told ---------- */
const behind = (g, w, s) => {
    const elapsed = Math.max(0, Math.min(1, (g.day - s.termDay + 1) / seasonDays(g)));
    return s.picks.map(id => courseOf(w, id)).filter((c) => !!c && studyShare(g, s, c) + 0.15 < elapsed);
};
/** "{{user}} is a student at Hijiri University: Economics, year 1, term 2 of 4 …" (nothing when not a student). */
export function degreeLine(g, w) {
    const s = degreeOf(g, w);
    const x = s && findDegree(w, s.id);
    if (!s || !x)
        return '';
    const { d, inst } = x, terms = termsOf(d), year = Math.max(1, Math.ceil(Math.max(1, s.term) / 4));
    if (!s.termDay)
        return `{{user}} has enrolled at ${inst.name} to study ${d.name}; the first term begins in ${daysToNextTerm(g)} day${daysToNextTerm(g) === 1 ? '' : 's'}.`;
    const left = termEndOf(g) - g.day, late = behind(g, w, s), gpa = gpaOf(s);
    const parts = [`{{user}} is a university student at ${inst.name}, studying ${d.name} (year ${year}, term ${s.term} of ${Math.max(terms, s.term)})`,
        `This term: ${s.picks.map(id => courseOf(w, id)?.name ?? id).join(', ')}`,
        late.length ? `behind on coursework for ${late.map(c => c.name).join(' and ')}` : '',
        left <= 3 ? (left === 0 ? 'finals are today' : `finals in ${left} day${left === 1 ? '' : 's'}`) : '',
        gpa !== null ? `GPA so far ${gpa.toFixed(1)}` : '',
        s.probation ? 'on academic probation' : '',
        s.due ? 'tuition unpaid' : ''].filter(Boolean);
    return `${parts.join('; ')}.`;
}
