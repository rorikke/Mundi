// The Campus app (phone): the degree you study for at a university, like the Jobs app for work. Not a student: the
// degrees each school offers (what they take, what they cost, what they open) and enrolling, with the degrees you
// finished or left. A student: the degree, the term and how many days are left of it, the GPA, modules passed and still
// to pass, the scholarship, tuition to pay; this term's modules with their class times, attendance and coursework; the
// pick for next term (or, in a term's first days, changing this one's); the grades of every term; leaving. The engine
// owns every number (sim/degrees.ts, sim/courses.ts); this file only draws and calls. Only in a world whose schools
// offer degrees, with the `institutions` system on.
import { esc, game, toast, notify, saveGame, type Save } from '../core/store.js';
import { getWorld, type WorldDef, type Course } from '../core/world.js';
import { money } from '../sim/needs.js';
import { weekday, advance } from '../sim/time.js';
import { courseOf, stateOf, classWindow, windowText, clashCount } from '../sim/courses.js';
import { skillName } from '../sim/hobbies.js';
import {
    degreeOf, degreesOffered, findDegree, uniOf, enrollBlock, enrollDegree, choosePicks, leaveDegree, payTuition, tuitionFor,
    termsOf, perTermOf, creditsOf, minGpaOf, workCapOf, modulesOf, offeredFor, pickRange, picksBlock, defaultPicks, pickingNow, canChangeNow,
    termEndOf, daysToNextTerm, gpaOf, passedCount, creditsLeft, coreLeft, studyShare, studyWanted, classTimes, clashes, joinsNow, DISTINGUISHED, PICK_DAYS,
    joinDegreeClub, leaveDegreeClub, degreeClubMeeting, clubMeetsNow, type DegreeState,
} from '../sim/degrees.js';
import { refreshPrompt } from '../sim/prompt.js';
import { ACT } from './reg.js';

/** What the app shows (memory only): the modules being picked (null: not touched, so the saved or suggested ones), the
 *  degree whose details are open, and a pending "leave the degree?". */
export const CA = { picks: null as string[] | null, open: '', leave: false };
const bar = (v: number) => `<span class="mu-bond"><i style="width:${Math.max(0, Math.min(100, Math.round(v)))}%"></i></span>`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayWords = (g: Save, d: number) => (d === g.day ? 'today' : d === g.day + 1 ? 'tomorrow' : weekday(d));

/** The badge on the phone's icon: next term's modules waiting to be chosen, or tuition to pay. */
export function campusBadge(g: Save, w: WorldDef): boolean {
    const s = degreeOf(g, w);
    return !!s && (s.due > 0 || (pickingNow(g, s) && !s.next.length && creditsLeft(g, w, s) > 0));
}

export function campusApp(g: Save, w: WorldDef, head: string): string {
    const s = degreeOf(g, w);
    return `${head}<div class="mu-ph-body mu-campus">${s ? studentHtml(g, w, s) : chooseHtml(g, w)}${pastHtml(g, w)}</div>`;
}

/* ---------- not a student: the degrees ---------- */

function chooseHtml(g: Save, w: WorldDef): string {
    const list = degreesOffered(w);
    if (!list.length) return '<p class="mu-muted">No degrees here.</p>';
    const start = joinsNow(g) ? 'Enrolling now joins this term.' : `The next term begins in ${plural(daysToNextTerm(g), 'day')}; you can enroll now and choose its modules.`;
    return `<p class="mu-muted">A degree takes a few modules each term (a term is a season): classes on campus, coursework at home or in a library, and a grade for each module at the end of the term. ${esc(start)}</p>
        ${list.map(({ inst, d }) => {
            const why = enrollBlock(g, w, d.id), open = CA.open === d.id, mods = modulesOf(g, w, d.id);
            const fee = tuitionFor(g, w, { id: d.id, scholarship: undefined, aid: undefined } as unknown as DegreeState, true);
            const wants = w.occupations.filter(o => (o.degree ?? []).includes(d.id)).map(o => o.name);
            const ahead = (d.gives?.jobs ?? []).map(id => w.occupations.find(o => o.id === id)?.name).filter(Boolean) as string[];
            return `<section class="mu-ph-card mu-campus-deg"><b data-notr>${esc(d.name)}</b><small>${esc(inst.name)} · ${esc(plural(termsOf(d), 'term'))} · ${esc(String(perTermOf(d)[0]))}–${esc(String(perTermOf(d)[1]))} modules a term · ${esc(plural(creditsOf(d), 'module'))} to pass</small>
                ${d.desc ? `<small data-notr>${esc(d.desc)}</small>` : ''}
                <small>${fee.fee ? `Tuition ${esc(money(w, fee.fee))} a term${fee.aid ? ` · ${esc(fee.aid.name)}: ${esc(String(Math.round(fee.aid.share * 100)))}%` : ''}` : 'No tuition'}${(d.skills ?? []).length ? ` · finals use ${esc(d.skills!.map(id => skillName(w, id)).join(', '))}` : ''}</small>
                ${wants.length ? `<small class="mu-good">Jobs that want it: ${esc(wants.join(', '))}</small>` : ''}
                ${ahead.length ? `<small>With distinction (GPA ${esc(DISTINGUISHED.toFixed(1))}+), you start a rank up as: ${esc(ahead.join(', '))}</small>` : ''}
                <small class="mu-muted">While you study: at most ${esc(plural(workCapOf(d), 'shift'))} a week at work${w.homes.zones.some(z => z.student) ? ', and student homes only' : ''}.</small>
                ${open ? `<div class="mu-campus-mods">${mods.map(c => `<small>${c.core ? '<b>Required</b> · ' : ''}<span data-notr>${esc(c.name)}</span> · from term ${esc(String(c.term ?? 1))} · ${esc(classTimes(g, w, c))}</small>`).join('')}</div>` : ''}
                <div class="mu-row"><button class="mu-primary" data-act="ca-enroll" data-id="${esc(d.id)}" ${why ? `aria-disabled="true" title="${esc(why)}"` : ''}>Enroll</button><button class="mu-ghost" data-act="ca-mods" data-id="${esc(d.id)}">${open ? 'Hide modules' : `Modules (${esc(String(mods.length))})`}</button></div>
                ${why && !/already/.test(why) ? `<small class="mu-bad">${esc(why)}</small>` : ''}</section>`;
        }).join('')}`;
}

/* ---------- a student ---------- */

function moduleCard(g: Save, w: WorldDef, s: DegreeState, c: Course): string {
    const st = stateOf(g, w, c), ended = s.ended[c.id];
    const att = st ? `Classes: ${st.attended} of ${st.n} · missed ${st.missed}` : ended ? (ended.failed ? 'Failed: too many missed classes' : `All classes done (${ended.attended} of ${ended.n} attended)`) : '';
    const win = st?.next != null ? classWindow(g, w, c, st.next) : null;
    const want = studyWanted(g, s, c), share = studyShare(g, s, c);
    return `<article class="mu-ph-card mu-campus-mod ${ended?.failed ? 'is-bad' : ''}"><b data-notr>${esc(c.name)}</b><small>${c.core ? 'Required · ' : ''}${esc(classTimes(g, w, c, s.termDay || g.day))}</small>
        <small>${esc(att)}${st?.next != null ? ` · next class ${esc(dayWords(g, st.next))}${win ? ` ${esc(windowText(win))}` : ''}` : ''}</small>${st ? bar((st.attended / Math.max(1, st.n)) * 100) : ''}
        ${want ? `<small>Coursework: ${esc(String(Math.round((s.study[c.id] ?? 0) / 60)))} of ${esc(String(Math.round(want / 60)))} hours this term</small>${bar(share * 100)}` : ''}
        ${st?.paused ? '<small class="mu-bad">On hold until the tuition is paid.</small>' : ''}</article>`;
}

function studentHtml(g: Save, w: WorldDef, s: DegreeState): string {
    const x = findDegree(w, s.id)!; const { d, inst } = x;
    const gpa = gpaOf(s), left = creditsLeft(g, w, s), core = coreLeft(g, w, s);
    const days = termEndOf(g) - g.day;
    const t = tuitionFor(g, w, s);
    const head = `<section class="mu-ph-card mu-campus-head"><small data-notr>${esc(inst.name)}</small><b data-notr>${esc(d.name)}</b>
        <small>${s.termDay ? `Term ${esc(String(s.term))} of ${esc(String(Math.max(termsOf(d), s.term)))} · ${days ? `${esc(plural(days, 'day'))} to the end of term (finals)` : 'finals today'}` : `Your first term begins in ${esc(plural(daysToNextTerm(g), 'day'))}`}</small>
        <small>GPA ${gpa === null ? '—' : esc(gpa.toFixed(2))} (at least ${esc(minGpaOf(d).toFixed(1))} a term) · passed ${esc(String(passedCount(s)))} of ${esc(String(creditsOf(d)))}${core.length ? ` · required still to pass: <span data-notr>${esc(core.map(c => c.name).join(', '))}</span>` : ''}</small>
        ${bar((passedCount(s) / Math.max(1, passedCount(s) + left)) * 100)}
        ${s.probation ? `<small class="mu-bad">On academic probation: one more term under ${esc(minGpaOf(d).toFixed(1))} and you are out.</small>` : s.weak ? `<small class="mu-bad">${esc(plural(s.weak, 'weak term'))}: three and you are out.</small>` : ''}
        ${s.scholarship === 'held' ? `<small class="mu-good">Scholarship: your tuition is paid while each term's GPA stays at ${esc(minGpaOf(d).toFixed(1))} or more.</small>` : s.scholarship === 'lost' ? '<small class="mu-bad">Scholarship lost: you pay the tuition.</small>' : t.fee ? `<small>Tuition ${esc(money(w, t.net))} a term${t.aid ? ` (${esc(t.aid.name)}: ${esc(String(Math.round(t.aid.share * 100)))}%${t.aid.pays === 'finish' ? ' back when you graduate' : ''})` : ''}</small>` : ''}
        ${s.due ? `<small class="mu-bad">This term's tuition is unpaid (${esc(money(w, s.due))}): your classes wait.</small><button class="mu-primary" data-act="ca-pay" ${g.player.money >= s.due ? '' : 'aria-disabled="true"'}>Pay ${esc(money(w, s.due))}</button>` : ''}
        <small class="mu-muted">As a student you work ${esc(plural(workCapOf(d), 'shift'))} a week at most${w.homes.zones.some(z => z.student) ? ' and rent student homes only' : ''}.</small></section>`;
    const mods = s.picks.map(id => courseOf(w, id)).filter((c): c is Course => !!c);
    const now = s.termDay ? `<h4>This term</h4>${mods.map(c => moduleCard(g, w, s, c)).join('') || '<p class="mu-muted">No modules this term.</p>'}
        <p class="mu-muted">Classes are on campus (Study, in the things to do there). Coursework: at home, in a library or a café for it; each hour goes to the module furthest behind. Each grade is attendance, coursework and the final.</p>` : '';
    return `${head}${now}${pickHtml(g, w, s)}${clubsHtml(g, w, s, inst.clubs ?? [])}${gradesHtml(g, w, s)}
        <section class="mu-campus-leave">${CA.leave ? `<small class="mu-bad">Leave ${esc(d.name)}? This term's modules end without a grade, and what you passed doesn't make a degree.</small><div class="mu-row"><button class="mu-danger" data-act="ca-leave">Yes, leave</button><button class="mu-ghost" data-act="ca-stay">Stay</button></div>` : '<button class="mu-ghost mu-danger-text" data-act="ca-leave-ask">Leave the degree</button>'}</section>`;
}

// Next term's modules (or this term's, in its first days): the offered ones as chips, the required ones marked, the
// ones that meet at the same time as a chosen one out of reach, and how many classes would fall in your shifts.
function pickHtml(g: Save, w: WorldDef, s: DegreeState): string {
    const changing = canChangeNow(g, s) && !pickingNow(g, s);
    if (!changing && !pickingNow(g, s)) {
        const until = termEndOf(g) - g.day - PICK_DAYS + 1;
        return creditsLeft(g, w, s) > passedThisTerm(g, w, s) ? `<p class="mu-muted">Next term's modules are chosen in the last ${esc(String(PICK_DAYS))} days of this one (in ${esc(plural(until, 'day'))}).</p>` : '';
    }
    const term = changing ? s.term : s.term + 1;
    if (!changing && creditsLeft(g, w, s) <= 0) return '';
    const offered = offeredFor(g, w, s, term), [lo, hi] = pickRange(g, w, s, term);
    const saved = changing ? s.picks : s.next.length ? s.next : defaultPicks(g, w, s, term);
    const picks = (CA.picks ?? saved).filter(id => offered.some(c => c.id === id));
    const why = picksBlock(g, w, s, picks, term), same = picks.length === saved.length && picks.every(id => saved.includes(id));
    const chosen = changing || s.next.length > 0;
    return `<h4>${changing ? 'Change this term\'s modules' : `Term ${esc(String(term))}: choose ${lo === hi ? esc(String(lo)) : `${esc(String(lo))}–${esc(String(hi))}`} module${hi === 1 ? '' : 's'}`}</h4>
        <small class="mu-muted">${changing ? `For ${esc(plural(s.termDay + 3 - g.day, 'more day'))}; classes missed meanwhile still count.` : chosen ? 'Chosen. You can still change them until the term begins.' : 'Not chosen yet: the required ones are suggested. Without a choice, these are taken.'}</small>
        <div class="mu-campus-pick">${offered.map(c => {
            const on = picks.includes(c.id), clash = !on && picks.some(id => { const o = courseOf(w, id); return !!o && clashes(g, w, o, c); });
            const shifts = g.player.job ? clashCount(g, w, c).clashes : 0;
            return `<button class="mu-campus-opt ${on ? 'is-on' : ''}" data-act="ca-pick" data-id="${esc(c.id)}" ${clash || (!on && picks.length >= hi) ? 'aria-disabled="true"' : ''} title="${esc(clash ? 'Meets at the same time as one you chose' : '')}">
                <b data-notr>${esc(c.name)}</b><small>${c.core ? 'Required · ' : ''}${s.grades[c.id] === 'F' ? 'Retake · ' : ''}${esc(classTimes(g, w, c))}</small>
                ${shifts ? `<small class="mu-bad">${esc(plural(shifts, 'class', 'classes'))} in your shifts this month</small>` : ''}${clash ? '<small class="mu-muted">Same time as one you chose</small>' : ''}</button>`;
        }).join('')}</div>
        ${why ? `<small class="mu-bad">${esc(why)}</small>` : ''}
        <button class="mu-primary" data-act="ca-save" ${why || (same && chosen) ? 'aria-disabled="true"' : ''}>${changing ? 'Change modules' : chosen ? 'Save the change' : 'Choose these'}</button>`;
}
// Modules this term that will count if passed (so "next term" isn't offered when this term finishes the degree).
const passedThisTerm = (g: Save, w: WorldDef, s: DegreeState) => s.picks.filter(id => courseOf(w, id)).length;

// The school's clubs: one to join, its meeting once a week at the school.
function clubsHtml(g: Save, w: WorldDef, s: DegreeState, clubs: string[]): string {
    if (!clubs.length) return '';
    if (s.club) return `<h4>Club</h4><div class="mu-campus-term"><b data-notr>${esc(s.club)}</b><small>A meeting once a week at the school${clubMeetsNow(g, w) ? ': you can go now' : s.met === Math.floor((g.day - 1) / 7) ? ' (done for this week)' : ''}.</small></div><button class="mu-ghost" data-act="ca-club-leave">Leave the club</button>`;
    return `<h4>Clubs</h4><small class="mu-muted">A meeting once a week at the school: good for your mood and for knowing people.</small><div class="mu-row">${clubs.map(c => `<button class="mu-ghost" data-act="ca-club" data-v="${esc(c)}">Join the <span data-notr>${esc(c)}</span></button>`).join('')}</div>`;
}

/** The club's meeting on the HUD, at the school, once a week. */
export function campusActs(g: Save, w: WorldDef): string {
    const s = degreeOf(g, w);
    return s?.club && clubMeetsNow(g, w) ? `<button class="mh-act mh-glass" data-act="ca-club-meet"><i>🎭</i><b>Club meeting</b><small><span data-notr>${esc(s.club)}</span> · 1h</small></button>` : '';
}

function gradesHtml(g: Save, w: WorldDef, s: DegreeState): string {
    if (!s.history.length) return '';
    return `<h4>Grades</h4>${[...s.history].reverse().map(h => `<div class="mu-campus-term"><b>Term ${esc(String(h.term))}</b><small>GPA ${esc(h.gpa.toFixed(2))} · ${Object.entries(h.grades).map(([id, gr]) => `<span data-notr>${esc(courseOf(w, id)?.name ?? id)}</span> <b class="${gr === 'F' ? 'mu-bad' : gr === 'A' ? 'mu-good' : ''}">${esc(gr)}</b>`).join(' · ')}</small></div>`).join('')}`;
}

function pastHtml(g: Save, w: WorldDef): string {
    const past = uniOf(g).past; if (!past.length) return '';
    return `<h4>Your degrees</h4>${[...past].reverse().map(r => `<div class="mu-campus-term"><b data-notr>${esc(findDegree(w, r.id)?.d.name ?? r.id)}</b><small>${r.how === 'graduated' ? `Graduated${r.distinguished ? ' with distinction' : ''}` : r.how === 'expelled' ? 'Expelled' : 'Dropped out'} · GPA ${esc(r.gpa.toFixed(2))} · day ${esc(String(r.day))}</small></div>`).join('')}`;
}

/* ---------- handlers ---------- */

const S = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const said = (lines: string[], kind: 'success' | 'info' | 'warn' = 'info') => { for (const m of lines.filter(Boolean)) toast(m, kind); };
function done() { refreshPrompt(); saveGame(); notify(); }
Object.assign(ACT, {
    'ca-mods': (el) => { CA.open = CA.open === el.dataset.id ? '' : el.dataset.id!; notify(); },
    'ca-enroll': (el) => { const c = S(); if (!c) return; const r = enrollDegree(c.g, c.w, el.dataset.id!); said([r.text, ...r.msgs], r.ok ? 'success' : 'warn'); CA.picks = null; done(); },
    'ca-pick': (el) => {
        const c = S(); const s = c && degreeOf(c.g, c.w); if (!c || !s) return;
        const changing = canChangeNow(c.g, s) && !pickingNow(c.g, s), term = changing ? s.term : s.term + 1;
        const base = CA.picks ?? (changing ? s.picks : s.next.length ? s.next : defaultPicks(c.g, c.w, s, term));
        const id = el.dataset.id!;
        CA.picks = base.includes(id) ? base.filter(x => x !== id) : [...base, id];
        notify();
    },
    'ca-save': () => {
        const c = S(); const s = c && degreeOf(c.g, c.w); if (!c || !s) return;
        const changing = canChangeNow(c.g, s) && !pickingNow(c.g, s);
        const ids = CA.picks ?? (changing ? s.picks : s.next.length ? s.next : defaultPicks(c.g, c.w, s, s.term + 1));
        const m = choosePicks(c.g, c.w, ids);
        toast(m, /chosen|changed/.test(m) ? 'success' : 'warn'); if (/chosen|changed/.test(m)) CA.picks = null; done();
    },
    'ca-pay': () => { const c = S(); if (!c) return; const m = payTuition(c.g, c.w); toast(m, /paid/.test(m) ? 'success' : 'warn'); done(); },
    'ca-club': (el) => { const c = S(); if (!c) return; const m = joinDegreeClub(c.g, c.w, el.dataset.v!); if (m) toast(m, 'success'); done(); },
    'ca-club-leave': () => { const c = S(); if (!c) return; leaveDegreeClub(c.g, c.w); done(); },
    'ca-club-meet': () => { const c = S(); if (!c) return; const r = degreeClubMeeting(c.g, c.w); if (r.minutes) said(advance(c.g, c.w, r.minutes)); toast(r.text, r.minutes ? 'success' : 'warn'); done(); },
    'ca-leave-ask': () => { CA.leave = true; notify(); },
    'ca-stay': () => { CA.leave = false; notify(); },
    'ca-leave': () => { const c = S(); if (!c) return; CA.leave = false; CA.picks = null; toast(leaveDegree(c.g, c.w), 'info'); done(); },
});
