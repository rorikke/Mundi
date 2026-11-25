// The phone home screen's Today card, in pages you swipe between (or pick under it): the overview first (the time and
// what's next today, the week's days with marks, what's coming up, the life goal's next objective, your job and studies
// in a line), then the week day by day, the life goal's step in full, your skills, and your work and studies. It reads
// the engine and moves nothing; each part opens the app where you act on it. Folded it stacks; unfolded (the phone's
// container 600px or wider, see 99z-today.css) each page spreads into columns.
import { esc, nowAbs, notify } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { tr } from '../core/tr.js';
import { fmtClock as hm } from '../core/fmt.js';
import { weekday } from '../sim/time.js';
import { activeGoal, goalProgress, stepProgress, suggestedGoals } from '../sim/goals.js';
import { skillsOf, skillXp, progressOf, titleOf } from '../sim/hobbies.js';
import { myJob, rankOf, perfOf, promoNeeds, promoProgress, pendingBranch, isFreelance, bookedJob } from '../sim/work.js';
import { takingNow, stateOf } from '../sim/courses.js';
import { degreeOf, termEndOf, daysToNextTerm, gpaOf, studyShare, allDegrees } from '../sim/degrees.js';
import { perfWord } from './relui.js';
import { PF } from './courses.js';
import { dayItems, AG } from './agenda.js';
import { goalsBadge, objectiveWords, pipsHtml } from './goalsui.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
const DAYS = 7;
/** The page shown (kept while the game runs; the phone opens on the overview), and which way the last swipe went. */
export const TD = { page: 'overview', dir: 0 };
const PAGE_NAME = { overview: 'Overview', soon: 'Coming up', week: 'Calendar', goal: 'Life goal', skills: 'Skills', career: 'Work & study', work: 'Work', study: 'Studies' };
// Shown at most: folded, the CSS hides the rows past three (today) and three (coming up).
const TODAY_MAX = 5, SOON_MAX = 5;
const fmt = (t, ...a) => tr(t).replace(/\{(\d)\}/g, (_, n) => a[Number(n)] ?? '');
// What a day of the week shows as a mark: your own time (work, class), plans with people, and things with a date to
// keep (a bill, a brief, finals…). City events only once you said you'd go, so a busy town doesn't fill every day.
const MARK = { work: 'work', shoot: 'work', class: 'class', plan: 'plan', bill: 'due', brief: 'due', edit: 'due', test: 'due', finals: 'due', term: 'due', release: 'fun', wedding: 'fun', festival: 'fun', event: 'fun' };
const MARK_ICON = { work: 'briefcase', class: 'book', plan: 'heart', due: 'bell', fun: 'star' };
const counts = (it) => !it.done && (it.kind !== 'event' || !!it.going);
// Your own time, plans and deadlines come before festivals and other dates in town, so folded (three rows) they show.
const rank = (it) => (MARK[it.kind] === 'fun' && it.kind !== 'event' ? 1 : 0);
// "Coming up" lists what has a date to keep, not the routine (shifts and classes show on the week's days).
const important = (it) => counts(it) && it.kind !== 'work' && it.kind !== 'class';
const dayBtn = (v) => `data-act="ph-day" data-app="plans" data-nav="root" data-v="${v}"`;
const shortDay = (g, d) => (d === g.day ? tr('Today') : d === g.day + 1 ? tr('Tomorrow') : tr(weekday(d)).slice(0, 3));
// A row: the icon, what it is (a plan with whom), when.
function itemInner(g, it, when) {
    const face = it.emoji ? `<i class="is-emoji" aria-hidden="true">${esc(it.emoji)}</i>` : `<i>${icon(it.icon)}</i>`;
    const who = it.kind === 'plan' && it.who && g.cast[it.who] ? ` · <span data-notr>${esc(g.cast[it.who].name)}</span>` : '';
    return `${face}<span>${it.titleData ? `<span data-notr>${esc(it.title)}</span>` : esc(it.title)}${who}</span><small>${esc(when)}</small>`;
}
// The time and the day, and what's still to come today.
function nowPart(g, w, cal) {
    const clock = `<span class="mu-pt-clock"><b>${esc(hm(g.minutes % 1440))}</b><small>${esc(`${weekday(g.day)} · Day ${g.day}`)}</small></span>`;
    if (!cal)
        return `<div class="mu-pt-part mu-pt-now">${clock}</div>`;
    const now = nowAbs(g), next = dayItems(g, w, g.day).filter(i => counts(i) && (i.allDay || (i.to ?? i.from) > now))
        .map((it, i) => ({ it, i })).sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i).map(x => x.it).slice(0, TODAY_MAX);
    const list = next.length ? `<ul class="mu-pt-list">${next.map(i => `<li>${itemInner(g, i, i.allDay ? '' : i.from <= now ? tr('Now') : hm(i.from % 1440))}</li>`).join('')}</ul>` : `<p>${esc('Nothing else planned today.')}</p>`;
    return `<button class="mu-pt-part mu-pt-now" ${dayBtn(0)}>${clock}${list}</button>`;
}
// The seven days from today, each with marks for what it holds, and how many shifts and classes the week has.
function weekPart(g, w, days) {
    let shifts = 0, classes = 0;
    const cells = days.map((items, i) => {
        const d = g.day + i, marks = [...new Set(items.filter(counts).map(it => MARK[it.kind]).filter(Boolean))];
        shifts += items.filter(it => (it.kind === 'work' || it.kind === 'shoot') && !it.done).length;
        classes += items.filter(it => it.kind === 'class').length;
        const work = items.find(it => it.kind === 'work' && !it.done);
        const tip = items.filter(counts).map(it => it.title).join(' · ');
        return `<button class="${i === 0 ? 'is-today' : ''}" ${dayBtn(i)} title="${esc(tip)}" data-notr><small>${esc(i === 0 ? tr('Today') : tr(weekday(d)).slice(0, 3))}</small><b>${d}</b>
            <span class="mu-pt-marks">${marks.slice(0, 3).map(m => `<i class="is-${m}">${icon(MARK_ICON[m])}</i>`).join('')}</span>${work ? `<em>${esc(hm(work.from % 1440))}</em>` : ''}</button>`;
    }).join('');
    const sum = [shifts ? (shifts === 1 ? tr('1 shift') : fmt('{0} shifts', String(shifts))) : '', classes ? (classes === 1 ? tr('1 class') : fmt('{0} classes', String(classes))) : ''].filter(Boolean).join(' · ');
    return `<div class="mu-pt-part mu-pt-week"><h5>${esc('This week')}${sum ? ` <small>${esc(sum)}</small>` : ''}</h5><nav class="mu-pt-days">${cells}</nav></div>`;
}
// Plans, deadlines and dates of the coming days (from tomorrow): the important ones first, each part in time order.
function soonPart(g, days) {
    // a festival of several days shows once, on its first (and not at all when it's on today)
    const key = (it) => `${it.kind}|${it.title}`, seen = new Set((days[0] ?? []).filter(it => it.allDay).map(key));
    const all = [];
    for (let i = 1; i < days.length; i++)
        for (const it of days[i].filter(important)) {
            if (it.allDay) {
                if (seen.has(key(it)))
                    continue;
                seen.add(key(it));
            }
            all.push({ it, i });
        }
    const rows = all.map((x, n) => ({ ...x, n })).sort((a, b) => rank(a.it) - rank(b.it) || a.n - b.n).slice(0, SOON_MAX)
        .map(({ it, i }) => `<button class="mu-pt-row" ${dayBtn(i)}>${itemInner(g, it, `${shortDay(g, g.day + i)}${it.allDay ? '' : ` ${hm(it.from % 1440)}`}`)}</button>`);
    return `<div class="mu-pt-part mu-pt-soon"><h5>${esc('Coming up')}</h5>${rows.length ? `<div class="mu-pt-list">${rows.join('')}</div>` : `<p>${esc('Nothing planned this week.')}</p>`}</div>`;
}
// The life goal you follow: its step, pips, and the first objective still to do (with how far you are).
function goalPart(g, w) {
    const goal = activeGoal(g, w), open = 'data-act="ph-go" data-app="goals" data-nav="root"';
    if (!goal)
        return goalsBadge(g, w) ? `<button class="mu-pt-part mu-pt-goal is-empty" ${open}><h5>${esc('Your life goal')}</h5>
        <b>Pick a life goal <em class="mu-gl-badge">!</em></b><small>${esc('It guides your days, and finishing it gives you a perk.')}</small></button>` : '';
    const p = goalProgress(g, w, goal.id), i = Math.min(p.done, goal.steps.length - 1), sp = stepProgress(g, w, goal.id);
    const o = sp?.ways.map(way => way.find(x => !x.ok)).find(Boolean), x = o ? objectiveWords(g, w, o) : null;
    const num = x && x.have !== undefined && x.need !== undefined ? ` <span class="mu-pt-num">${esc(`${Math.min(x.have, x.need)}/${x.need}`)}</span>` : '';
    const hold = sp?.hold && !o ? `<small class="mu-pt-next">${esc(fmt('Held {0} of {1} days', String(sp.hold.days), String(sp.hold.need)))}</small>` : '';
    return `<button class="mu-pt-part mu-pt-goal" ${open}><h5>${esc('Your life goal')}</h5>
        <span class="mu-pt-gtitle"><i>${esc(goal.icon ?? '⭐')}</i><b>${esc(goal.name)}</b></span>${pipsHtml(p.done, p.total, p.finished)}
        <small>Step ${esc(String(i + 1))} of ${esc(String(p.total))}: <b>${esc(goal.steps[i].name)}</b></small>
        ${x ? `<small class="mu-pt-next">○ <span>${esc(x.text)}</span>${num}</small>` : hold}</button>`;
}
/* ---------- work and studies: what the overview says in a line, and the page in full ---------- */
const bar = (pct) => `<span class="mu-bond"><i style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></i></span>`;
const pctText = (x) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;
function studyOf(g, w) {
    const job = systemOn(w, 'jobs') ? myJob(g, w) : null;
    const deg = degreeOf(g, w), own = systemOn(w, 'courses') ? takingNow(g, w).filter(c => !c.degree) : [];
    return { job, deg, own };
}
const hasStudy = (s) => !!(s.job || s.deg || s.own.length);
const degName = (w, id) => allDegrees(w).find(x => x.d.id === id);
// "Startup staff · performance 62" and "Economics · GPA 3.20" (or the finals' days, near them): the overview's last part.
function statusPart(g, w, s) {
    if (!hasStudy(s))
        return '';
    const rows = [];
    if (s.job)
        rows.push(`<span><i>${icon('briefcase')}</i><span><span data-notr>${esc(rankOf(g, s.job).name)}</span> · ${esc(fmt('performance {0}', String(perfOf(g))))}</span></span>`);
    if (s.deg) {
        const gpa = gpaOf(s.deg), left = termEndOf(g) - g.day;
        const tail = !s.deg.termDay ? fmt('term 1 in {0} days', String(daysToNextTerm(g))) : left === 0 ? tr('finals today') : left <= 7 ? fmt('finals in {0} days', String(left)) : gpa !== null ? fmt('GPA {0}', gpa.toFixed(2)) : fmt('term {0}', String(s.deg.term));
        rows.push(`<span><i>${icon('cap')}</i><span><span data-notr>${esc(degName(w, s.deg.id)?.d.name ?? '')}</span> · ${esc(tail)}</span></span>`);
    }
    if (s.own.length) {
        const late = s.own.some(c => !!stateOf(g, w, c)?.warn);
        rows.push(`<span><i>${icon('book')}</i><span>${esc(s.own.length === 1 ? tr('1 course') : fmt('{0} courses', String(s.own.length)))}${late ? ` · <b class="mu-bad">${esc(tr('classes missed'))}</b>` : ''}</span></span>`);
    }
    return `<button class="mu-pt-part mu-pt-status" data-act="pt-page" data-v="career">${rows.join('')}</button>`;
}
// Your job (rank, performance, the next rank and what it still needs), your degree (term, finals, GPA, each module's
// classes and coursework) and your own courses (classes attended, missed).
function careerPage(g, w, s, only) {
    const out = [];
    if (s.job && only !== 'study') {
        const o = s.job, j = g.player.job, p = promoNeeds(g, w, o), byTitle = isFreelance(g, w) || bookedJob(g, w, o);
        out.push(`<button class="mu-pt-part mu-pt-job" data-act="ph-go" data-app="jobs" data-nav="root"><h5>${esc('Work')}</h5>
            <b data-notr>${esc(rankOf(g, o).name)}</b><small data-notr>${esc(o.name)}</small>
            ${byTitle ? '' : `<small class="mu-pt-kv"><span>${esc('Performance')}</span><b>${esc(`${perfOf(g)} · ${tr(perfWord(perfOf(g)))}`)}</b></small>${bar(perfOf(g))}`}
            ${p ? `<small class="mu-pt-kv"><span>${esc('Next rank:')} <span data-notr>${esc(p.rank.name)}</span></span><b>${esc(`${promoProgress(p)}%`)}</b></small>${bar(promoProgress(p))}
                ${p.missing.length ? `<small class="mu-muted">${esc('Still needs:')} ${p.missing.map(m => `<span>${esc(m)}</span>`).join(', ')}</small>` : `<small class="mu-good">${esc('Ready for a promotion')}</small>`}`
            : pendingBranch(g, o) ? `<small class="mu-good">${esc('Choose your path in the Work app.')}</small>` : `<small>${esc('Top rank.')}</small>`}
            ${byTitle ? '' : `<small class="mu-muted">${esc(fmt('{0} shifts in this rank', String(Math.floor(j.shifts ?? 0))))}</small>`}</button>`);
    }
    if (s.deg && only !== 'work') {
        const deg = s.deg, x = degName(w, deg.id), gpa = gpaOf(deg), left = termEndOf(g) - g.day, taking = takingNow(g, w);
        const mods = deg.picks.map(id => taking.find(c => c.id === id)).filter((c) => !!c).map(c => {
            const st = stateOf(g, w, c), work = studyShare(g, deg, c);
            return `<li><span data-notr>${esc(c.name)}</span><small>${st ? `${esc(fmt('{0} of {1} classes', String(st.attended), String(st.n)))} · ` : ''}${esc(fmt('coursework {0}', pctText(work)))}</small>${bar(work * 100)}</li>`;
        });
        const when = !deg.termDay ? fmt('Term 1 begins in {0} days', String(daysToNextTerm(g))) : left === 0 ? tr('Finals are today') : fmt('Finals in {0} days', String(left));
        out.push(`<button class="mu-pt-part mu-pt-uni" data-act="ph-go" data-app="campus" data-nav="root"><h5>${esc('University')}</h5>
            <b data-notr>${esc(x?.d.name ?? '')}</b><small><span data-notr>${esc(x?.inst.name ?? '')}</span>${deg.termDay ? ` · ${esc(fmt('term {0}', String(deg.term)))}` : ''}</small>
            <small class="mu-pt-kv"><span>${esc(when)}</span>${gpa !== null ? `<b>${esc(fmt('GPA {0}', gpa.toFixed(2)))}</b>` : ''}</small>
            ${deg.probation ? `<small class="mu-bad">${esc('On academic probation')}</small>` : ''}${deg.due ? `<small class="mu-bad">${esc('Tuition unpaid')}</small>` : ''}
            ${mods.length ? `<ul class="mu-pt-mods">${mods.join('')}</ul>` : ''}</button>`);
    }
    if (s.own.length && only !== 'work') {
        const rows = s.own.map(c => {
            const st = stateOf(g, w, c);
            if (!st)
                return '';
            const of = Math.round(st.of || st.n);
            return `<li><span data-notr>${esc(c.name)}</span><small>${esc(fmt('{0} of {1} classes', String(st.attended), String(of)))}${st.missed ? ` · ${esc(fmt('{0} missed', String(st.missed)))}` : ''}</small>${bar((st.attended / Math.max(1, of)) * 100)}</li>`;
        }).join('');
        out.push(`<button class="mu-pt-part mu-pt-courses" data-act="pt-profile" data-v="courses"><h5>${esc('Courses')}</h5><ul class="mu-pt-mods">${rows}</ul></button>`);
    }
    return out.join('');
}
/* ---------- the other pages ---------- */
// The seven days, each with all it holds (city events only when you're going).
function weekPage(g, days) {
    return `<div class="mu-pt-wdays">${days.map((items, i) => {
        // your own time and plans first (folded, three show: the count of the rest is by the day name)
        const list = items.filter(counts).map((it, n) => ({ it, n })).sort((a, b) => rank(a.it) - rank(b.it) || a.n - b.n).map(x => x.it);
        const more = list.length > 3 ? ` <em class="mu-pt-more">${esc(fmt('+{0} more', String(list.length - 3)))}</em>` : '';
        return `<button class="mu-pt-wday ${i === 0 ? 'is-today' : ''} ${list.length ? '' : 'is-free'}" ${dayBtn(i)}><h5><span>${esc(i === 0 ? tr('Today') : i === 1 ? tr('Tomorrow') : tr(weekday(g.day + i)))}${more}</span><small>${g.day + i}</small></h5>
            ${list.length ? `<span class="mu-pt-list">${list.map(it => `<span class="mu-pt-row">${itemInner(g, it, it.allDay ? '' : hm(it.from % 1440))}</span>`).join('')}</span>` : `<p>${esc('Free day')}</p>`}</button>`;
    }).join('')}</div>`;
}
// The goal's current step with every objective and how far you are, the steps after it, and the perk at the end.
// With none followed, the goals suggested now.
function goalPage(g, w) {
    const goal = activeGoal(g, w), open = 'data-act="ph-go" data-app="goals" data-nav="root"';
    if (!goal) {
        const sug = suggestedGoals(g, w, 3);
        return `<button class="mu-pt-part mu-pt-gnone" ${open}><b>Pick a life goal <em class="mu-gl-badge">!</em></b><small>${esc('It guides your days, and finishing it gives you a perk.')}</small>
            ${sug.length ? `<h5>${esc('Suggested')}</h5>${sug.map(x => `<span class="mu-pt-gtitle"><i>${esc(x.icon ?? '⭐')}</i><b>${esc(x.name)}</b></span>`).join('')}` : ''}</button>`;
    }
    const p = goalProgress(g, w, goal.id), i = Math.min(p.done, goal.steps.length - 1), sp = stepProgress(g, w, goal.id);
    const ways = (sp?.ways ?? []).map(way => `<ul class="mu-pt-objs">${way.map(o => {
        const x = objectiveWords(g, w, o), num = x.have !== undefined && x.need !== undefined;
        return `<li class="${o.ok ? 'is-ok' : ''}"><i>${o.ok ? '✓' : '○'}</i><span><span class="mu-pt-kv"><span>${esc(x.text)}</span>${num ? `<b>${esc(`${Math.min(x.have, x.need)}/${x.need}`)}</b>` : ''}</span>${num && x.need ? bar((x.have / x.need) * 100) : ''}</span></li>`;
    }).join('')}</ul>`).join(`<small class="mu-pt-or">${esc('or')}</small>`);
    const hold = sp?.hold ? `<small class="mu-pt-kv"><span>${esc(fmt('Held {0} of {1} days', String(sp.hold.days), String(sp.hold.need)))}</span></small>${bar((sp.hold.days / Math.max(1, sp.hold.need)) * 100)}` : '';
    const later = goal.steps.slice(i + 1).map((st, k) => `<li><i>${i + k + 2}</i><span>${esc(st.name)}</span></li>`).join('');
    const more = `${later ? `<h5>${esc('Then')}</h5><ol class="mu-pt-steps">${later}</ol>` : ''}${goal.perk ? `<h5>${esc('Perk')}</h5><b>${esc(goal.perk.name)}</b>${goal.perk.desc ? `<small>${esc(goal.perk.desc)}</small>` : ''}` : ''}`;
    return `<button class="mu-pt-part mu-pt-gstep" ${open}><span class="mu-pt-gtitle"><i>${esc(goal.icon ?? '⭐')}</i><b>${esc(goal.name)}</b></span>${pipsHtml(p.done, p.total, p.finished)}
            <small>Step ${esc(String(i + 1))} of ${esc(String(p.total))}: <b>${esc(goal.steps[i].name)}</b></small>${ways}${hold}</button>
        ${more ? `<button class="mu-pt-part mu-pt-gmore" ${open}>${more}</button>` : ''}`;
}
// Your skills, the highest first, with the level, its title and how far to the next.
function skillsPage(g, w) {
    const xp = skillXp(g);
    const list = skillsOf(w, g).filter(s => (xp[s.id] ?? 0) > 0).map(s => ({ s, p: progressOf(g, s.id) })).sort((a, b) => b.p.level - a.p.level || b.p.xp - a.p.xp);
    // hovered: how far into the level, and the xp still to go for the next
    const tip = (p) => (p.next ? fmt('{0}% to level {1} · {2} xp to go', String(p.pct), String(p.level + 1), String(Math.max(0, p.next - p.xp))) : tr('Top level'));
    return `<button class="mu-pt-part mu-pt-skills" data-act="pt-profile" data-v="skills"><ul>${list.map(({ s, p }) => `<li title="${esc(tip(p))}"><span class="mu-pt-kv"><b data-notr>${esc(s.name)}</b><small>${esc(fmt('Level {0}', String(p.level)))} · ${esc(titleOf(p.level))}</small></span>${bar(p.pct)}</li>`).join('')}</ul></button>`;
}
/* ---------- the card ---------- */
function pagesOf(g, w, cal, goals, s) {
    const xp = skillXp(g);
    return ['overview', 'soon', 'week', 'goal', 'career', 'work', 'study', 'skills'].filter(p => p === 'overview' || ((p === 'week' || p === 'soon') && cal) || (p === 'goal' && goals && systemOn(w, 'goals'))
        || (p === 'skills' && skillsOf(w, g).some(x => (xp[x.id] ?? 0) > 0)) || (p === 'career' && hasStudy(s)) || (p === 'work' && !!s.job) || (p === 'study' && !!(s.deg || s.own.length)));
}
// (the pages the card showed last, for the swipe and the arrows). Folded, the overview keeps only the time, today and the
// week's days, so what's coming up has a page of its own there, and work and studies one each (FOLD_ONLY); unfolded the
// overview shows what's coming up, and work and studies share a page (WIDE_ONLY).
const FOLD_ONLY = ['soon', 'work', 'study'], WIDE_ONLY = ['career'];
let shownPages = ['overview'];
/** The card. `cal`: the Calendar app is on the phone (else no week and no coming up); `goals`: the Goals app is. */
export function todayCard(g, w, cal, goals) {
    const s = studyOf(g, w), pages = pagesOf(g, w, cal, goals, s);
    shownPages = pages;
    const page = pages.includes(TD.page) ? TD.page : 'overview';
    const days = cal && (page === 'overview' || page === 'week' || page === 'soon') ? Array.from({ length: DAYS }, (_, i) => dayItems(g, w, g.day + i)) : [];
    let body = '', cls = '';
    if (page === 'overview') {
        const goal = goals ? goalPart(g, w) : '', status = statusPart(g, w, s);
        body = [nowPart(g, w, cal), cal ? weekPart(g, w, days) : '', cal ? soonPart(g, days) : '', goal, status].filter(Boolean).join('');
        cls = `${cal ? 'has-cal' : ''} ${goal || status ? 'has-goal' : ''} ${goal ? '' : 'no-goal'} ${status ? '' : 'no-status'}`;
    }
    else
        body = page === 'soon' ? soonPart(g, days) : page === 'week' ? weekPage(g, days) : page === 'goal' ? goalPage(g, w) : page === 'skills' ? skillsPage(g, w) : page === 'work' || page === 'study' ? careerPage(g, w, s, page) : careerPage(g, w, s);
    const at = pages.indexOf(page);
    const pager = pages.length > 1 ? `<nav class="mu-pt-pager">
        <button class="mu-pt-arrow" data-act="pt-step" data-v="-1" ${at === 0 ? 'aria-disabled="true"' : ''} aria-label="${esc(tr('Previous'))}">${icon('back')}</button>
        ${pages.map(p => `<button class="mu-pt-dot ${p === page ? 'is-on' : ''} ${FOLD_ONLY.includes(p) ? 'is-fold-only' : WIDE_ONLY.includes(p) ? 'is-wide-only' : ''}" data-act="pt-page" data-v="${p}" aria-pressed="${p === page}" title="${esc(tr(PAGE_NAME[p]))}"><i></i><span>${esc(PAGE_NAME[p])}</span></button>`).join('')}
        <button class="mu-pt-arrow is-next" data-act="pt-step" data-v="1" ${at === pages.length - 1 ? 'aria-disabled="true"' : ''} aria-label="${esc(tr('Next'))}">${icon('back')}</button></nav>` : '';
    const head = page === 'overview' || page === 'soon' ? '' : `<h4 class="mu-pt-title">${esc(PAGE_NAME[page])}</h4>`;
    return `<div class="mu-ph-today is-${page}" data-swipe="today"><div class="mu-pt-page is-${page} ${cls} ${TD.dir > 0 ? 'from-right' : TD.dir < 0 ? 'from-left' : ''}" data-i="pt-${page}">${head}${body}</div>${pager}</div>`;
}
/** The phone opened: the card shows its overview again. */
export function resetToday() { TD.page = 'overview'; TD.dir = 0; }
function goPage(p) {
    const from = shownPages.indexOf(TD.page), to = shownPages.indexOf(p);
    if (to < 0 || p === TD.page)
        return;
    TD.dir = to > from ? 1 : -1;
    TD.page = p;
    notify();
}
// the pages whose dot shows (unfolded, the fold-only ones are hidden), in order
function stepPages() {
    const dots = typeof document === 'undefined' ? [] : [...document.querySelectorAll('#mundi-root .mu-pt-dot')].filter(d => d.offsetParent !== null);
    return dots.length ? dots.map(d => d.dataset.v) : shownPages;
}
const step = (by) => { const list = stepPages(), p = list[Math.max(0, list.indexOf(TD.page)) + by]; if (p)
    goPage(p); };
// Swiping the card sideways (a finger, or a mouse dragged) turns its page, and so does a trackpad's sideways swipe. Up
// and down still scroll the phone (touch-action: pan-y in the CSS). The click that ends a swipe is not a click on what's
// under it.
const SWIPE = 45, WHEEL = 60, WHEEL_REST = 450;
export function attachTodaySwipe(root) {
    let x0 = 0, y0 = 0, on = false, swiped = false, wheel = 0, rest = 0;
    const onCard = (e) => !!e.target?.closest?.('[data-swipe="today"]');
    root.addEventListener('pointerdown', (e) => { on = onCard(e) && (e.pointerType !== 'mouse' || e.button === 0); x0 = e.clientX; y0 = e.clientY; swiped = false; });
    root.addEventListener('pointerup', (e) => {
        if (!on)
            return;
        on = false;
        const dx = e.clientX - x0, dy = e.clientY - y0;
        if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.5) {
            swiped = true;
            step(dx < 0 ? 1 : -1);
        }
    });
    root.addEventListener('pointercancel', () => { on = false; });
    root.addEventListener('click', (e) => { if (swiped) {
        swiped = false;
        e.preventDefault();
        e.stopPropagation();
    } }, true);
    root.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || !onCard(e))
            return;
        e.preventDefault();
        const now = Date.now();
        if (now < rest)
            return;
        wheel += e.deltaX;
        if (Math.abs(wheel) > WHEEL) {
            step(wheel > 0 ? 1 : -1);
            wheel = 0;
            rest = now + WHEEL_REST;
        }
    }, { passive: false });
}
Object.assign(ACT, {
    // a day of the card opens the Calendar on that day
    'ph-day': (el, e) => { AG.day = Number(el.dataset.v) || 0; return ACT['ph-go']?.(el, e); },
    'pt-page': (el) => goPage(el.dataset.v),
    'pt-step': (el) => step(Number(el.dataset.v) || 0),
    // skills and courses are the profile's tabs
    'pt-profile': (el, e) => { PF.tab = el.dataset.v === 'courses' ? 'courses' : 'skills'; el.dataset.app = 'profile'; el.dataset.nav = 'root'; return ACT['ph-go']?.(el, e); },
});
