// The Calendar's agenda: a strip of the next seven days, and the chosen day with everything in it in time order: your
// shifts and classes, plans with people (and photo shoots), what's on in town, festivals, weddings of people you know,
// bills coming due, Lens briefs due. Each opens where you act on it. It reads the engine and moves nothing; the buttons
// are the ones the other apps already have.
import { esc, nowAbs, notify } from '../core/store.js';
import { systemOn, isScenario } from '../core/world.js';
import { thumb } from '../st/bridge.js';
import { tr } from '../core/tr.js';
import { fmtClock as hm } from '../core/fmt.js';
import { weekday } from '../sim/time.js';
import { placeOf } from '../sim/places.js';
import { upcoming } from '../sim/plans.js';
import { myJob, shiftOn, isFreelance } from '../sim/work.js';
import { takingNow, classWindow } from '../sim/courses.js';
import { comingEvents, isGoing } from '../sim/cityevents.js';
import { upcoming as festivalsAhead } from '../sim/festivals.js';
import { weddingsAhead } from '../sim/longlife.js';
import { billList, billAmount, billName, owed, daysLeft, billsApp } from '../sim/bills.js';
import { peekPhoto, briefOf, photoOn } from '../sim/photo.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
export const AG = { day: 0 }; // the day shown, from today (0) to six days ahead
const DAYS = 7;
const fmt = (t, ...a) => tr(t).replace(/\{(\d)\}/g, (_, n) => a[Number(n)] ?? '');
const where = (g, w, id) => (id.startsWith('home:') ? tr('Your home') : placeOf(g, w, id)?.name ?? '');
const span = (from, to) => (to ? `${hm(from % 1440)}–${hm(to % 1440)}` : hm(from % 1440));
const KIND_NAME = { date: 'Date', party: 'Party', shoot: 'Photo shoot', hangout: 'Hang out' };
/** Everything on a day (an absolute day number), all-day things first, then by time. */
export function dayItems(g, w, d) {
    const out = [], now = nowAbs(g), start = d * 1440, end = start + 1440;
    // your shifts
    const job = systemOn(w, 'jobs') && !isFreelance(g, w) ? myJob(g, w) : null;
    const s = job ? shiftOn(g, w, job, d) : null; // (a night shift shows on the day it starts)
    if (job && s) {
        const j = g.player.job, off = j?.off?.[s.day], done = (j?.worked ?? []).includes(s.day);
        out.push({ from: s.start, to: s.end, kind: 'work', icon: 'briefcase', title: fmt('Work: {0}', job.name), sub: off === 'vacation' ? tr('Day off') : off === 'sick' ? tr('Called in sick') : done ? tr('Worked ✓') : span(s.start, s.end), tap: 'data-act="ph-go" data-app="jobs"', done: done || !!off });
    }
    // your classes (courses of your own and a degree's modules)
    if (systemOn(w, 'courses') || systemOn(w, 'institutions'))
        for (const c of takingNow(g, w)) {
            const win = classWindow(g, w, c, d);
            if (!win)
                continue;
            out.push({ from: start + win.from, to: start + win.to, kind: 'class', icon: 'book', title: c.name, titleData: true, sub: `${span(start + win.from, start + win.to)}${c.at ? ` · ${where(g, w, c.at)}` : ''}`, tap: c.degree ? 'data-act="ph-go" data-app="campus"' : 'data-act="course-open"' });
        }
    // plans with people, photo shoots
    for (const a of upcoming(g).filter(x => x.from >= start && x.from < end)) {
        const name = g.cast[a.avatar]?.name ?? '';
        out.push({ from: a.from, to: a.to, kind: 'plan', icon: a.kind === 'date' ? 'heart' : a.kind === 'shoot' ? 'camera' : a.kind === 'party' ? 'users' : 'calendar',
            title: a.title ? a.title : a.come ? tr('Coming over') : tr(KIND_NAME[a.kind] ?? 'Hang out'), titleData: !!a.title,
            sub: `${span(a.from)} · ${where(g, w, a.place)}`, who: a.avatar, tap: `data-act="ph-person" data-who="${esc(a.avatar)}"`,
            btn: `<button class="mu-ghost" data-act="pl-cancel" data-id="${esc(a.id)}" title="${esc(fmt('Cancel with {0}', name))}">${esc(tr('Cancel'))}</button>` });
    }
    // what's on in town
    for (const x of comingEvents(g, w, DAYS).filter(x => x.from >= start && x.from < end)) {
        const going = isGoing(g, x.key), live = x.from <= now && x.to > now && !x.off;
        out.push({ from: x.from, to: x.to, kind: 'event', icon: 'star', emoji: x.ev.icon || '🎉', title: x.ev.name, titleData: true, sub: x.off ? tr('Called off: rain') : `${span(x.from, x.to)} · ${where(g, w, x.ev.place)}`, done: x.off,
            btn: x.off ? '' : live && g.player.loc !== x.ev.place ? `<button class="mu-primary" data-act="go" data-loc="${esc(x.ev.place)}">${esc(tr('Go now'))}</button>`
                : live ? '' : `<button class="${going ? 'mu-primary' : 'mu-ghost'}" data-act="ce-go" data-key="${esc(x.key)}">${esc(going ? tr('✓ Going') : tr("I'll go"))}</button>` });
    }
    // festivals, weddings, bills and briefs: all day
    for (const x of festivalsAhead(g, w, DAYS).filter(x => x.day <= d && d < x.day + (x.f.days ?? 1)))
        out.push({ from: start, allDay: true, kind: 'festival', icon: 'sparkles', emoji: x.f.icon || '🎊', title: x.f.name, titleData: true, sub: x.f.desc ?? '' });
    if (systemOn(w, 'romance'))
        for (const x of weddingsAhead(g, w).filter(x => x.day === d && (g.cast[x.a]?.met || g.cast[x.b]?.met)))
            out.push({ from: start, allDay: true, kind: 'wedding', icon: 'heart', title: fmt('{0} and {1} get married', g.cast[x.a]?.name ?? '', g.cast[x.b]?.name ?? ''), sub: '', who: g.cast[x.a]?.met ? x.a : x.b });
    if (systemOn(w, 'bills')) {
        const due = billList(w).filter(b => billAmount(g, w, b.id) && (owed(g, b.id) ? d === g.day : g.day + daysLeft(g, b.id) === d));
        if (due.length)
            out.push({ from: start, allDay: true, kind: 'bill', icon: 'wallet', title: due.length === 1 ? fmt('{0} due', billName(w, due[0].id)) : tr('Bills due'),
                sub: due.length === 1 ? '' : due.map(b => billName(w, b.id)).join(' · '), tap: `data-act="ph-go" data-app="${billsApp(w)}"` });
    }
    if (photoOn(w))
        for (const t of peekPhoto(g).open.filter(t => t.due === d))
            out.push({ from: start, allDay: true, kind: 'brief', icon: 'camera', title: fmt('Brief due: {0}', briefOf(w, t.brief)?.name ?? ''), sub: '', tap: 'data-act="ph-go" data-app="photos"' });
    return out.sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || a.from - b.from);
}
const dayName = (g, d) => (d === g.day ? tr('Today') : d === g.day + 1 ? tr('Tomorrow') : tr(weekday(d)));
function itemHtml(g, it) {
    const face = it.who ? `<img src="${esc(thumb(it.who))}" alt="">` : it.emoji ? `<i class="mu-ag-ic is-emoji" aria-hidden="true">${esc(it.emoji)}</i>` : `<i class="mu-ag-ic">${icon(it.icon)}</i>`;
    const title = it.titleData ? `<span data-notr>${esc(it.title)}</span>` : esc(it.title);
    const who = it.who && it.kind === 'plan' ? `<small class="mu-ag-who" data-notr>${esc(g.cast[it.who]?.name ?? '')}</small>` : '';
    const body = `${face}<span><b>${title}</b>${who}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>`;
    return `<li class="mu-ag-item is-${it.kind} ${it.done ? 'is-done' : ''} ${it.allDay ? 'is-allday' : ''}">${it.tap ? `<button class="mu-ag-open" ${it.tap}>${body}</button>` : `<div class="mu-ag-open">${body}</div>`}${it.btn ?? ''}</li>`;
}
/** The strip of days (each with how many things it holds) and the chosen day's agenda. */
export function agendaHtml(g, w) {
    AG.day = Math.max(0, Math.min(DAYS - 1, AG.day));
    const days = Array.from({ length: DAYS }, (_, i) => g.day + i);
    const counts = days.map(d => dayItems(g, w, d).length);
    const d = g.day + AG.day, items = dayItems(g, w, d), now = nowAbs(g);
    const strip = `<nav class="mu-ag-days">${days.map((x, i) => `<button class="${i === AG.day ? 'is-on' : ''} ${i === 0 ? 'is-today' : ''}" data-act="ag-day" data-v="${i}" aria-pressed="${i === AG.day}">
        <small>${esc(i === 0 ? tr('Today') : tr(weekday(x)).slice(0, 3))}</small><b>${x}</b>${counts[i] ? `<i>${counts[i]}</i>` : '<i class="is-none"></i>'}</button>`).join('')}</nav>`;
    // today: a line where the time is now, between what's over and what's next
    let rows = '', marked = AG.day !== 0;
    for (const it of items) {
        if (!marked && !it.allDay && it.from > now) {
            rows += `<li class="mu-ag-now"><span>${esc(hm(now % 1440))}</span></li>`;
            marked = true;
        }
        rows += itemHtml(g, it);
    }
    return `${strip}<section class="mu-ag"><h4>${esc(dayName(g, d))}${AG.day > 1 ? ` <small>${esc(fmt('Day {0}', String(d)))}</small>` : ''}</h4>
        ${items.length ? `<ol class="mu-ag-list">${rows}</ol>` : `<p class="mu-muted mu-ag-empty">${esc(isScenario(w) ? tr('Nothing planned that day.') : tr('Nothing planned that day. Open someone in People to invite them out.'))}</p>`}</section>`;
}
Object.assign(ACT, { 'ag-day': (el) => { AG.day = Number(el.dataset.v) || 0; notify(); } });
