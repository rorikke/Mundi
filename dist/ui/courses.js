// Courses (a window in the middle of the screen, like Help) and the phone's Profile app: what you know, the courses
// you took, your life goals and your career, like a professional profile page.
import { hobbiesHtml } from './cityui.js';
import { lex, appRef } from '../core/lexicon.js';
import { esc, game, notify, saveGame, toast } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { personaName, personaThumb } from '../st/bridge.js';
import { money } from '../sim/needs.js';
import { priceOf } from '../sim/bills.js';
import { weekday } from '../sim/time.js';
import { skillName } from '../sim/hobbies.js';
import { offeredOf, courseOf, learning, enroll, dropCourse, payDue, canStudyHere, takingNow, stateOf, planFor, needsText, perSeason, extraWhileTwo, clashCount, aidText, scheduleWords, whereWords, windowText, classWindow, courseWarnings, classWord } from '../sim/courses.js';
import { nudgesFor, aheadCourse } from '../sim/coursenudge.js';
import { countOf } from '../sim/skills.js';
import { jobDef, traitsOf, rankOf } from '../sim/work.js';
import { ASPIRATIONS, lifeOf } from '../sim/life.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
const CS = { open: false, area: '', drop: '' };
export const openCourses = () => { CS.open = true; CS.drop = ''; notify(); };
// "Things to do": take a course, or how the ones you take are going (the study buttons are in the list).
export function courseRow(g, w) {
    const mine = takingNow(g, w);
    if (!offeredOf(w).length && !mine.length)
        return '';
    if (!canStudyHere(g, w) && !mine.some(c => c.at === g.player.loc))
        return '';
    if (mine.length) {
        const lines = mine.map(c => { const s = stateOf(g, w, c); return `<span data-notr>${esc(c.name)}</span>: class ${s.attended} of ${s.of}${s.studied ? ' · studied today' : ''}${s.paused ? ' · on hold' : ''}`; });
        return `<button class="mh-act mh-glass ${courseWarnings(g, w).length ? 'is-warn' : ''}" data-act="course-open"><i>${esc(mine[0].icon || '🎓')}</i><b>${lex(w, 'courses')} · ${mine.length} of 2</b><small>${lines.join(' · ')}</small></button>`;
    }
    return `<button class="mh-act mh-glass" data-act="course-open"><i>🎓</i><b>${lex(w, 'takeCourse')}</b><small>Learn a skill over a few weeks</small></button>`;
}
// A day as words: today, tomorrow, or the weekday.
const dayWords = (g, d) => (d === g.day ? 'today' : d === g.day + 1 ? 'tomorrow' : `${weekday(d)} (in ${d - g.day} days)`);
const skillChips = (w, c) => Object.entries(c.skills ?? {}).map(([id, n]) => `<span class="mu-chip is-on">+ ${esc(skillName(w, id))} ${esc(String(n))}</span>`).join('');
const pctOf = (s) => Math.max(0, Math.min(100, Math.round((s.credit / s.n) * 100)));
const warnOf = (g, w, c, s) => (s.warn ? courseWarnings(g, w).find(t => t.startsWith(`${c.name}:`)) ?? '' : '');
// One course you are taking: where it stands, what is next, what missing classes would cost.
function takingCard(g, w, c, s) {
    const l = learning(g), a = l.aid[c.id];
    const win = s.next !== null ? classWindow(g, w, c, s.next) : null;
    const warn = warnOf(g, w, c, s);
    return `<article class="mu-course is-on">
        <header><i>${esc(c.icon)}</i><span><b>${esc(c.name)}</b><small>${esc(c.area)} · class ${esc(String(s.attended))} of ${esc(String(s.of))}${s.toGo ? ` · about ${esc(String(s.toGo))} to go` : ''}</small></span></header>
        <span class="mu-bond"><i style="width:${pctOf(s)}%"></i></span>
        <small>${s.sched ? `${s.next !== null ? `Next class: ${esc(dayWords(g, s.next))}${win ? `, ${esc(windowText(win))}` : ''}.` : 'No class coming up.'} ${esc(scheduleWords(c))}` : `Five classes a week, any days, one a day (${esc(whereWords(g, w, c))}).`}</small>
        <small>Missed ${esc(String(s.missed))}${s.behind ? ` (and ${esc(String(s.behind))} more that won't fit in the ${esc(String(s.daysLeft))} days left)` : ''}: ${esc(String(s.freeLeft))} free left · make-up classes ${esc(String(s.makeups))} of ${esc(String(s.cap))}</small>
        ${warn ? `<small class="mu-bad">${esc(warn)}</small>` : ''}
        ${s.paused ? `<small class="mu-bad">On hold: ${esc(money(w, s.due))} is unpaid. ${g.player.money >= s.due ? '' : 'Earn it first.'}</small><button class="mu-primary" data-act="course-pay" data-id="${esc(c.id)}" ${g.player.money >= s.due ? '' : 'aria-disabled="true"'}>Pay ${esc(money(w, s.due))}</button>` : ''}
        ${l.taking.length > 1 ? `<small class="mu-muted">While you take two, each class counts ${esc(String(Math.round(s.worth * 100) / 100))}${s.extra ? ` (+${esc(classWord(s.extra))})` : ''}.</small>` : ''}
        ${a ? `<small class="mu-good">${esc(a.name)}: ${esc(String(Math.round(a.share * 100)))}% ${a.pays === 'finish' ? 'back at the end' : 'paid for you'}${a.stay ? ', and you stay a season after' : ''}.</small>` : ''}
        ${CS.drop === c.id ? `<small class="mu-bad">Drop it? What you paid is gone. Enroll again within a year and half your classes count (once).</small><div class="mu-row"><button class="mu-danger" data-act="course-drop" data-id="${esc(c.id)}">Yes, drop it</button><button class="mu-ghost" data-act="course-keep">Keep it</button></div>`
        : `<button class="mu-ghost" data-act="course-ask-drop" data-id="${esc(c.id)}">Drop it</button>`}
    </article>`;
}
export function coursesHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    if (!CS.open || !g || !w)
        return '';
    const l = learning(g), all = offeredOf(w), mine = takingNow(g, w);
    const areas = [...new Set(all.map(c => c.area))];
    const list = all.filter(c => !CS.area || c.area === CS.area);
    const forJobs = (id) => w.occupations.filter(o => (o.courses ?? []).includes(id) || [...o.ranks, ...(o.branches ?? []).flatMap(b => b.options.flatMap(x => x.ranks))].some(r => r.course === id)).map(o => o.name);
    const top = mine.length
        ? `<div class="mu-course-top"><p class="mu-course-now">Taking ${mine.length} of 2. ${l.taking.length > 1 ? 'Two at once is slower: each class counts less. ' : ''}One class a day for each, ${esc(lex(w, 'studyWhere'))}.</p><div class="mu-course-grid">${mine.map(c => takingCard(g, w, c, stateOf(g, w, c))).join('')}</div></div>`
        : `<div class="mu-course-top"><p class="mu-muted">Pay, then go to class: a course lasts weeks and has a set number of classes (2 h each, ${esc(lex(w, 'studyWhere'))}). Every class teaches you a little of its skills, and finishing gives you their levels for good. You can miss a few classes; miss too many and the course runs long, or you fail. Some jobs ask for a course first.</p></div>`;
    return `<div class="mu-recap-veil mu-help-veil" data-act="course-bg"><section class="mu-recap mh-glass mu-help mu-courses" role="dialog" aria-label="${esc(lex(w, 'courses'))}">
        <header class="mu-row"><div><small>${lex(w, 'courses')}</small><h3>What do you want to learn?</h3></div><button class="mu-ibtn mu-ghost mu-right" data-act="course-close" aria-label="Close">${icon('x')}</button></header>
        ${top}
        <div class="mu-chips">${['', ...areas].map(a => `<button class="mu-chip ${CS.area === a ? 'is-on' : ''}" data-act="course-area" data-v="${esc(a)}">${esc(a || 'All')}</button>`).join('')}</div>
        <div class="mu-course-grid">${list.map(c => {
        const done = l.done.includes(c.id), on = l.taking.includes(c.id), jobs = forJobs(c.id);
        const price = priceOf(g, c.cost), p = planFor(g, w, c), seasonal = perSeason(g, w, c);
        const needs = needsText(g, w, c), clash = clashCount(g, w, c), aid = aidText(g, w, c), when = scheduleWords(c);
        const block = on ? '' : l.taking.length >= 2 ? 'You can take two courses at most. Finish or drop one first.' : needs ? `Asks for ${needs} first.` : g.player.money < price ? 'Not enough money' : '';
        return `<article class="mu-course ${done ? 'is-done' : ''} ${on ? 'is-on' : ''}">
                <header><i>${esc(c.icon)}</i><span><b>${esc(c.name)}</b><small>${esc(c.area)} · ${esc(classWord(p.n))} · about ${esc(String(p.span))} day${p.span === 1 ? '' : 's'} · ${esc(money(w, price))}${seasonal ? ' a season' : ''}</small></span></header>
                <p>${esc(c.desc)}</p>
                <small>${esc(whereWords(g, w, c))}${when ? ` · ${esc(when)}` : ' · any five days a week'}</small>
                ${seasonal ? '<small class="mu-muted">Paid when you enroll and at the start of each season; unpaid, the course waits.</small>' : ''}
                ${c.needs ? `<small class="${needs ? 'mu-bad' : 'mu-good'}">Needs: ${esc(needs || 'you have it')}${needs ? '' : ' ✓'}</small>` : ''}
                ${clash.clashes ? `<small class="mu-bad">${esc(String(clash.clashes))} of ${esc(String(clash.of))} classes clash with your shifts (a missed class: no excuse for work).</small>` : ''}
                <small class="mu-muted">With two courses at once, each class counts less: about ${esc(classWord(extraWhileTwo(g, w, p.n)))} more.</small>
                ${aid ? `<small class="mu-good">${esc(aid)}</small>` : ''}
                ${jobs.length ? `<small class="mu-muted">${lex(w, 'neededFor')}: ${esc(jobs.join(', '))}</small>` : ''}
                <div class="mu-chips">${skillChips(w, c)}${(c.grants ?? []).map(t => `<span class="mu-chip is-on">+ ${esc(t)}</span>`).join('')}</div>
                ${done ? '<em>✓ Finished</em>' : on ? '<em>Taking it</em>'
            : `<button class="mu-primary" data-act="course-enroll" data-id="${esc(c.id)}" ${block ? 'aria-disabled="true"' : ''} title="${esc(block)}">Enroll · ${esc(money(w, price))}</button>`}
            </article>`;
    }).join('')}</div>
    </section></div>`;
}
// The courses you take, for the profile page.
export function takingRows(g, w) {
    return takingNow(g, w).map(c => {
        const s = stateOf(g, w, c), warn = warnOf(g, w, c, s);
        return `<div class="mu-pf-row"><b>${esc(c.icon)} ${esc(c.name)}</b><small>In progress · class ${esc(String(s.attended))} of ${esc(String(s.of))}${s.studied ? ' · studied today' : ''}${s.paused ? ' · on hold' : ''}</small><span class="mu-bond"><i style="width:${pctOf(s)}%"></i></span>${warn ? `<small class="mu-bad">${esc(warn)}</small>` : ''}</div>`;
    }).join('');
}
// The job page's course lines: the boss's message, and a course two ranks ahead.
export function jobCourseHtml(g, w, jobId) {
    const o = jobDef(w, jobId);
    if (!o)
        return '';
    const msg = nudgesFor(g, jobId)[0], ahead = aheadCourse(g, w, o);
    return (msg ? `<small class="mu-good"><b data-notr>${esc(msg.from)}</b> (day ${esc(String(msg.day))}): <span data-notr>${esc(msg.text)}</span></small><small class="mu-muted">${esc(msg.facts)}</small>` : '') +
        (ahead ? `<small class="mu-muted">Two ranks ahead, ${esc(ahead.rank)} asks for the course ${esc(ahead.course.name)} (${esc(whereWords(g, w, ahead.course))}).</small>` : '');
}
/* ---------- the Profile app ---------- */
// Who you are, then what a world's other groups hold (a proficiency its world didn't turn into skills, what courses or schools gave).
const TRAIT_GROUPS = (w) => [['personality', 'Personality'], ['interests', 'Interests'], ['habits', 'Habits'],
    ...(w.sheet?.traits ?? []).filter(x => !['personality', 'interests'].includes(x.id)).map(x => [x.id, x.label]),
    ['learned', lex(w, 'learnedIn')], ['earned', 'Earned with life goals'], ['school', 'From school'], ['education', 'Education']];
// What a finished course taught: its skills ("Japanese 4"), or the traits an older world's course grants.
const taught = (w, c) => Object.entries(c.skills ?? {}).map(([id, n]) => `${skillName(w, id)} ${n}`).join(', ') || (c.grants ?? []).join(', ');
export function profileApp(g, w, head) {
    const l = learning(g);
    const life = lifeOf(g);
    const t = (g.player.traits ?? {});
    const j = g.player.job;
    const o = j && jobDef(w, j.id);
    const seen = new Set();
    const groups = TRAIT_GROUPS(w).filter(([k]) => { if (seen.has(k))
        return false; seen.add(k); return (t[k] ?? []).length > 0; });
    const other = Object.keys(t).filter(k => !seen.has(k) && (t[k] ?? []).length);
    const goals = ASPIRATIONS.filter(a => (life.aspDone ?? []).includes(a.id));
    const taking = takingRows(g, w);
    return `${head}<div class="mu-ph-body mu-profile">
        <section class="mu-pf-top"><div class="mu-pf-cover"></div><img src="${esc(personaThumb())}" alt=""><b data-notr>${esc(personaName())}</b>
            <small>${o ? `${esc(rankOf(g, o).name)} · ${esc(o.name)}` : lex(w, 'openToWork')}</small>
            <span class="mu-pf-stats"><span><b>${traitsOf(g).length}</b><small>traits</small></span><span><b>${l.done.length}</b><small>${lex(w, 'coursesShort')}</small></span><span><b>${goals.length}</b><small>goals</small></span><span><b>${Math.round(countOf(g, 'shifts'))}</b><small>shifts</small></span></span></section>
        <section><h4>${icon('briefcase')} Experience</h4>${o ? `<div class="mu-pf-row"><b>${esc(o.name)}</b><small>${esc(rankOf(g, o).name)} · rank ${j.rank + 1} of ${o.ranks.length}</small></div>` : `<p class="mu-muted">${lex(w, 'noJobYet', appRef(w, 'jobs'))}</p>`}</section>
        <section><h4>${icon('star')} Who you are</h4><p class="mu-muted">Your personality nudges small things, your interests lift your mood when you do them, and your skills are on the skills list below.</p>
            ${[...groups, ...other.map(k => [k, k[0].toUpperCase() + k.slice(1)])].map(([k, name]) => `<div class="mu-pf-group"><small>${esc(name)}</small><div class="mu-chips">${(t[k] ?? []).map(x => `<span class="mu-chip ${k === 'learned' || k === 'earned' ? 'is-on' : ''}" ${w.traitInfo?.[x]?.desc ? `title="${esc(w.traitInfo[x].desc)}"` : ''}>${esc(x)}</span>`).join('')}</div>
                ${(t[k] ?? []).filter(x => w.traitInfo?.[x]?.desc).map(x => `<small class="mu-muted"><b data-notr>${esc(x)}:</b> ${esc(w.traitInfo[x].desc)}</small>`).join('')}</div>`).join('') || '<p class="mu-muted">No traits yet.</p>'}
        </section>
        <section><h4>${icon('book')} ${lex(w, 'courses')}</h4>
            ${taking}
            ${l.done.map(id => courseOf(w, id)).filter(Boolean).map(c => `<div class="mu-pf-row"><b>${esc(c.icon)} ${esc(c.name)}</b><small>✓ Finished${taught(w, c) ? ` · ${esc(taught(w, c))}` : ''}</small></div>`).join('')}
            ${!taking && !l.done.length ? `<p class="mu-muted">${lex(w, 'noCourses')}</p>` : ''}
            <button class="mu-primary" data-act="course-open">${icon('plus')}<span>${lex(w, 'browseCourses')}</span></button></section>
        <section><h4>${icon('heart')} Life goals reached</h4>${goals.map(a => `<div class="mu-pf-row"><b>${esc(a.name)}</b><small>${a.reward ? `Earned: ${esc(a.reward)}` : esc(a.desc)}</small></div>`).join('') || `<p class="mu-muted">${lex(w, 'noGoalYet', appRef(w, 'goals'))}</p>`}</section>
        ${hobbiesHtml(g, w)}
        <section><h4>${icon('bolt')} Activity</h4><small class="mu-muted">Fitness ${life.fitness}/100 · ${countOf(g, 'meals')} meals cooked · ${countOf(g, 'workouts')} good workouts · ${countOf(g, 'parties')} parties</small></section>
    </div>`;
}
Object.assign(ACT, {
    'course-open': () => openCourses(),
    'course-close': () => { CS.open = false; notify(); },
    'course-bg': (el, e) => { if (e.target === el) {
        CS.open = false;
        notify();
    } },
    'course-area': (el) => { CS.area = el.dataset.v ?? ''; notify(); },
    'course-enroll': (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const id = el.dataset.id, err = enroll(g, w, id);
        if (err) {
            toast(err, 'warn');
            return;
        }
        const c = courseOf(w, id), p = learning(g).plan[id];
        toast(`Enrolled: ${c.name}. ${p ? `${classWord(p.n)} over about ${p.span} day${p.span === 1 ? '' : 's'}. ` : ''}One class a day at most, ${p?.sched ? scheduleWords(c) : lex(w, 'studyWhere')}.`, 'success');
        saveGame();
        notify();
    },
    'course-ask-drop': (el) => { CS.drop = el.dataset.id ?? ''; notify(); },
    'course-keep': () => { CS.drop = ''; notify(); },
    'course-drop': (el) => { const g = game(); if (!g)
        return; dropCourse(g, el.dataset.id); CS.drop = ''; toast('You dropped the course. Enroll again within a year and half your classes count (once).', 'info'); saveGame(); notify(); },
    'course-pay': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w)
        return; const t = payDue(g, w, el.dataset.id); toast(t || 'Nothing to pay.', t.startsWith('Not') ? 'warn' : 'success'); saveGame(); notify(); },
});
