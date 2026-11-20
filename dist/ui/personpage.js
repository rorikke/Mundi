// A person's page on the phone, in tabs: About (where they are, their work and week, plans, their story), Memories
// (what you went through together, from the facts), Circle (the people you know in their life) and Notes (your own
// note about them, the gifts you gave, what you learned of them). Only what you could know: their week and free time
// once you're friends, no crushes, no secret couples. Reads the engine, never moves a number; the phone draws the rest.
import { esc, game, notify, saveGame } from '../core/store.js';
import { systemOn, isScenario } from '../core/world.js';
import { thumb } from '../st/bridge.js';
import { fmtClock as hm } from '../core/fmt.js';
import { weekday } from '../sim/time.js';
import { placeOf } from '../sim/places.js';
import { OUT } from '../sim/people.js';
import { jobOf, rankName, shiftOn, onVacation, scheduled, secretCouple, ruleOn } from '../sim/dayplan.js';
import { knowsJob } from '../sim/jobknown.js';
import { fr, statusOf, pastOf, PARTNER } from '../sim/rel.js';
import { friendTier } from '../sim/romance.js';
import { ties, TIE_TYPES } from '../sim/living.js';
import { FAMILY_FLIP } from '../core/feel.js';
import { facts } from '../sim/facts.js';
import { factUi } from './journal.js';
import { social, bondOf, giftsGiven, giftFit, keepsakeDef } from '../sim/social.js';
import { activeFeelings } from '../sim/life.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
export const PP = { tab: 'about', more: false };
const FRIEND_AT = 30; // a Friend knows your week and where you go in your free time (FRIEND_TIERS' Friend)
// The tabs, each with how many things it holds (Memories, Circle).
export function personTabs(g, w, a) {
    const tab = (id, name, count = 0) => `<button class="${PP.tab === id ? 'is-on' : ''}" data-act="pp-tab" data-v="${id}" aria-pressed="${PP.tab === id}">${esc(name)}${count ? ` <small>${count}</small>` : ''}</button>`;
    return `<nav class="mu-pp-tabs">${tab('about', 'About')}${tab('memories', 'Memories', memoriesOf(g, a).length)}${tab('circle', 'Circle', circleOf(g, w, a).length)}${tab('notes', 'Notes')}</nav>`;
}
// How they feel toward you for a while, with the days left ("Hurt · 3 days").
export function feelingsNow(g, a) {
    const list = activeFeelings(g, a);
    if (!list.length)
        return '';
    const left = (until) => Math.max(1, Math.ceil((until - (g.day * 1440 + g.minutes)) / 1440));
    return `<div class="mu-chips mu-pp-feel">${list.map(f => { const d = left(f.until); return `<span class="mu-chip">${esc(f.tag)} <small>${esc(d === 1 ? '1 day' : `${d} days`)}</small></span>`; }).join('')}</div>`;
}
/* ---------- About ---------- */
const placeWord = (g, w, id) => (id === OUT ? 'away' : placeOf(g, w, id)?.name ?? '');
const span = (from, to) => `${hm(from % 1440)}–${hm(to % 1440)}`;
// Their work: the job and rank, where, and today's shift; their week (a Friend), a day at a time. Only once you know
// what they do (sim/jobknown.ts); before that the same line for everyone, so it doesn't tell who has a job at all.
function workHtml(g, w, a) {
    const r = g.cast[a];
    if (!r)
        return '';
    if (!knowsJob(g, r))
        return ruleOn(w, 'jobs') ? `<section class="mu-pp-sec"><h5>${icon('briefcase')}<span>Work</span></h5><small class="mu-muted">You don't know what they do yet.</small></section>` : '';
    const o = jobOf(g, w, r);
    if (!o)
        return '';
    const rank = rankName(g, w, r), timed = scheduled(g, w, r);
    const today = timed ? shiftOn(g, w, r, g.day) : null;
    const now = timed ? (onVacation(g, w, r, g.day) ? 'On vacation today' : today ? `Works today ${span(today.from, today.to)}` : 'Day off today') : '';
    const where = today?.place ?? (o.place || '');
    const week = timed && bondOf(g, a) >= FRIEND_AT ? `<ol class="mu-pp-week">${Array.from({ length: 7 }, (_, i) => g.day + i).map(d => {
        const s = shiftOn(g, w, r, d);
        return `<li class="${s ? 'is-work' : 'is-off'} ${d === g.day ? 'is-today' : ''}"><b>${esc(weekday(d).slice(0, 3))}</b><small>${s ? esc(span(s.from, s.to)) : esc(onVacation(g, w, r, d) ? 'Away' : 'Day off')}</small></li>`;
    }).join('')}</ol>` : timed ? '<small class="mu-muted">Become friends to know their week.</small>' : '';
    return `<section class="mu-pp-sec"><h5>${icon('briefcase')}<span>Work</span></h5>
        <b><span data-notr>${esc(rank ? `${rank} · ${o.name}` : o.name)}</span></b>${where && where !== OUT ? `<small>${esc(`Works at ${placeWord(g, w, where)}`)}</small>` : ''}
        ${now ? `<small>${esc(now)}</small>` : ''}${week}</section>`;
}
// Where they go in their free time (a Friend knows): a hint for running into them, and for a gift.
function freeTimeHtml(g, w, a) {
    const r = g.cast[a];
    if (!r || isScenario(w))
        return '';
    const spots = [...new Set(r.leisure ?? [])].map(id => placeOf(g, w, id)?.name).filter(Boolean);
    if (!spots.length)
        return '';
    if (bondOf(g, a) < FRIEND_AT)
        return `<section class="mu-pp-sec"><h5>${icon('map')}<span>Free time</span></h5><small class="mu-muted">Become friends to know where they like to go.</small></section>`;
    return `<section class="mu-pp-sec"><h5>${icon('map')}<span>Free time</span></h5><small>Likes to go to</small><div class="mu-chips">${spots.map(s => `<span class="mu-chip" data-notr>${esc(s)}</span>`).join('')}</div></section>`;
}
/** The About tab: where they are now, their work and free time, then what the phone puts under it (plans, story). */
export function aboutHtml(g, w, a, now, rest) {
    return `${now}${workHtml(g, w, a)}${freeTimeHtml(g, w, a)}${rest}`;
}
/* ---------- Memories ---------- */
// What you went through with them (the facts about them, the ones they forgot too: you remember), newest first.
const memoriesOf = (g, a) => facts(g).filter(f => f.who.includes(a)).sort((x, y) => y.at - x.at);
const SHOWN = 30;
export function memoriesHtml(g, w, a) {
    const all = memoriesOf(g, a);
    if (!all.length)
        return '<p class="mu-muted mu-pp-empty">Nothing remembered together yet. What you do with them shows here.</p>';
    const list = PP.more ? all : all.slice(0, SHOWN);
    const dayName = (d) => (d === g.day ? 'Today' : d === g.day - 1 ? 'Yesterday' : `${weekday(d)} · Day ${d}`);
    let last = -1, out = '';
    for (const f of list) {
        const d = Math.floor(f.at / 1440);
        if (d !== last) {
            out += `<li class="mu-pp-day">${esc(dayName(d))}</li>`;
            last = d;
        }
        const where = f.place ? placeWord(g, w, f.place) : '';
        out += `<li class="mu-pp-mem is-${esc(f.kind ?? 'event')}"><span>${esc(factUi(f))}</span><small>${esc(hm(f.at % 1440))}${where ? ` · <span data-notr>${esc(where)}</span>` : ''}</small></li>`;
    }
    return `<ol class="mu-pp-mems">${out}</ol>${all.length > list.length ? `<button class="mu-ghost" data-act="pp-more">${icon('down')}<span>${esc(`All ${all.length}`)}</span></button>` : ''}`;
}
/* ---------- Circle ---------- */
const STATUS_WORD = { casual: 'Casual', dating: 'Dating', engaged: 'Engaged', married: 'Married' };
const PAST_WORD = { casual: 'Ex (casual)', dating: 'Ex', engaged: 'Ex-fiancé(e)', married: 'Ex-spouse', ex: 'Ex' };
const familyWord = (t) => { const s = (TIE_TYPES.find(x => x[0] === t)?.[1] ?? t).replace(/ of$/, ''); return s.charAt(0).toUpperCase() + s.slice(1); };
// The people you have met in their life, and what anyone around them would know: family, a couple (not a secret
// one), an ex, friends both ways, and people they don't get along with. Crushes stay hidden.
export function circleOf(g, w, a) {
    const out = new Map();
    // one row per person with every label they have ("Child · Don't get along"), coloured and sorted by the first
    const add = (avatar, label, kind, rank) => {
        const was = out.get(avatar);
        if (!was)
            out.set(avatar, { avatar, labels: [label], kind, rank });
        else if (rank < was.rank)
            out.set(avatar, { avatar, labels: [label, ...was.labels], kind, rank });
        else
            was.labels.push(label);
    };
    const known = (x) => x !== a && !!g.cast[x]?.met;
    for (const t of ties(g)) {
        if (t.a !== a && t.b !== a)
            continue;
        const other = t.a === a ? t.b : t.a;
        if (!known(other))
            continue;
        // `a` is the <type> of `b`: on b's page the other one is that; on a's page, the tie told from the other side
        const type = (t.b === a ? t.type : FAMILY_FLIP[t.type] ?? t.type);
        add(other, familyWord(type), 'family', 0);
    }
    const love = systemOn(w, 'romance');
    for (const x of Object.keys(g.cast)) {
        if (!known(x))
            continue;
        const st = statusOf(g, a, x);
        if (love && st && PARTNER.includes(st) && !secretCouple(g, w, a, x))
            add(x, STATUS_WORD[st], 'partner', 1);
        const past = pastOf(g, a, x);
        if (love && past && !st)
            add(x, PAST_WORD[past.status ?? 'ex'], 'ex', 2);
        const lo = Math.min(fr(g, a, x), fr(g, x, a));
        if (lo >= FRIEND_AT) {
            const t = friendTier(lo);
            add(x, t.id === 'best' ? 'Best friends' : t.id === 'good' ? 'Good friends' : 'Friends', 'friend', t.id === 'best' ? 3 : t.id === 'good' ? 4 : 5);
        }
        else if (lo <= -30)
            add(x, "Don't get along", 'bad', 6);
    }
    return [...out.values()].sort((x, y) => x.rank - y.rank || g.cast[x.avatar].name.localeCompare(g.cast[y.avatar].name));
}
export function circleHtml(g, w, a) {
    const list = circleOf(g, w, a);
    if (!list.length)
        return '<p class="mu-muted mu-pp-empty">No one you know is close to them, as far as you can tell.</p>';
    return `<div class="mu-ph-list mu-pp-circle">${list.map(t => `<button class="mu-ph-row is-${t.kind}" data-act="ph-person" data-who="${esc(t.avatar)}"><img src="${esc(thumb(t.avatar))}" alt="">
        <span><b data-notr>${esc(g.cast[t.avatar].name)}</b><small>${t.labels.map(l => `<span>${esc(l)}</span>`).join(' · ')}</small></span></button>`).join('')}</div>`;
}
/* ---------- Notes ---------- */
const notesOf = (g) => (social(g).notes ??= {});
const FIT_WORD = { loves: 'Loved it', fits: 'Liked it', kind: 'A kind thought', hates: 'Not their thing' };
function giftsHtml(g, w, a) {
    const given = giftsGiven(g)[a] ?? [];
    if (!given.length)
        return '';
    return `<section class="mu-pp-sec"><h5>${icon('heart')}<span>Gifts you gave</span></h5><ul class="mu-pp-gifts">${given.map(id => {
        const k = keepsakeDef(w, id), fit = giftFit(g, w, k, a);
        return `<li class="is-${fit}"><i aria-hidden="true">${esc(k.icon ?? '🎁')}</i><span data-notr>${esc(k.name)}</span><small>${esc(FIT_WORD[fit])}</small></li>`;
    }).join('')}</ul></section>`;
}
/** The Notes tab: your own note (only for you: the AI never reads it), the gifts you gave, then `known` (what you
 *  learned of them in bed, from the phone). */
export function notesHtml(g, w, a, known) {
    return `<section class="mu-pp-sec"><h5>${icon('pen')}<span>Your note</span></h5>
        <textarea rows="4" data-input="pp-note" data-who="${esc(a)}" data-focus="pp-note" placeholder="Only for you: how you met, what to remember…">${esc(notesOf(g)[a] ?? '')}</textarea></section>
        ${giftsHtml(g, w, a)}${known}`;
}
Object.assign(ACT, {
    'pp-tab': (el) => { PP.tab = ['about', 'memories', 'circle', 'notes'].find(t => t === el.dataset.v) ?? 'about'; PP.more = false; notify(); },
    'pp-more': () => { PP.more = true; notify(); },
});
Object.assign(INPUT, {
    'pp-note': (el) => { const g = game(); const a = el.dataset.who; if (!g || !a)
        return; const t = el.value; if (t.trim())
        notesOf(g)[a] = t;
    else
        delete notesOf(g)[a]; saveGame(); },
});
