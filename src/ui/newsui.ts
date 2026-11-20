// The news in the Messages app (in place of the old social app): what's coming up in town (city events, festivals),
// what happened in the lives of the people you know (new jobs, promotions, couples, weddings, moves: the engine's
// facts), and what people post (written by the AI, sim/feed.ts). Read-only: no likes, replies or posts of yours. A
// strip of the newest at the top of Messages, all of it a tap away. With the `social` system off, none of it.
import { esc, game, notify, saveGame, toast, nowAbs, type Save } from '../core/store.js';
import { systemOn, getWorld, type WorldDef } from '../core/world.js';
import { lex } from '../core/lexicon.js';
import { thumb } from '../st/bridge.js';
import { tr } from '../core/tr.js';
import { safeUrl } from '../core/safe.js';
import { fmtClock as hm } from '../core/fmt.js';
import { weekday } from '../sim/time.js';
import { facts } from '../sim/facts.js';
import { feed, feedPrefs, generatePosts } from '../sim/feed.js';
import { comingEvents } from '../sim/cityevents.js';
import { upcoming as festivalsAhead } from '../sim/festivals.js';
import { factUi } from './journal.js';
import { whenText } from './plans.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';

export interface NewsItem { at: number; kind: 'post' | 'life' | 'city'; text: string; notr: boolean; who?: string; img?: string; icon: string }
export const NEWS = { busy: false };
const DAYS_BACK = 14, DAYS_AHEAD = 7;
// Facts that are news anyone would hear: a person's life (new job, couples, weddings, moves) and work (promotions),
// never one with you in it, nor love that isn't public (crushes, something casual: kind "love").
const NEWS_KINDS = ['life', 'work'];
const fmt = (t: string, ...a: string[]) => tr(t).replace(/\{(\d)\}/g, (_, n) => a[Number(n)] ?? '');

export const newsOn = (w: WorldDef | null | undefined) => !!w && systemOn(w, 'social');
/** What's coming up in town in the next days: city events and festivals, soonest first. */
export function comingNews(g: Save, w: WorldDef): NewsItem[] {
    const ev = comingEvents(g, w, DAYS_AHEAD).filter(x => !x.off).map(x => ({ at: x.from, kind: 'city' as const, icon: 'star',
        text: fmt('{0} at {1}, {2}', x.ev.name, w.places.find(p => p.id === x.ev.place)?.name ?? '', whenText(g, x.from)), notr: false }));
    const fe = festivalsAhead(g, w, DAYS_AHEAD).map(x => ({ at: x.day * 1440, kind: 'city' as const, icon: 'sparkles',
        text: x.day === g.day ? fmt('{0}: today', x.f.name) : fmt('{0}: {1}', x.f.name, x.day === g.day + 1 ? tr('tomorrow') : tr(weekday(x.day))), notr: false }));
    return [...fe, ...ev].sort((a, b) => a.at - b.at);
}
/** What happened lately: people's posts and the news of their lives, newest first. Only people you have met. */
export function latestNews(g: Save): NewsItem[] {
    const since = nowAbs(g) - DAYS_BACK * 1440;
    const posts = feed(g).posts.filter(p => p.by !== 'me' && g.cast[p.by]?.met && p.at >= since)
        .map(p => ({ at: p.at, kind: 'post' as const, icon: 'chat', text: p.text, notr: true, who: p.by, img: p.image }));
    const life = facts(g).filter(f => NEWS_KINDS.includes(f.kind ?? '') && !f.t.includes('{u}') && f.at >= since && f.who.some(a => g.cast[a]?.met))
        .map(f => ({ at: f.at, kind: 'life' as const, icon: 'users', text: factUi(f), notr: false, who: f.who.find(a => g.cast[a]?.met) }));
    return [...posts, ...life].sort((a, b) => b.at - a.at);
}

const when = (g: Save, at: number) => { const d = Math.floor(at / 1440); return d === g.day ? hm(at % 1440) : d === g.day - 1 ? tr('Yesterday') : `${tr(weekday(d)).slice(0, 3)} ${hm(at % 1440)}`; };
const face = (it: NewsItem) => it.who ? `<img src="${esc(thumb(it.who))}" alt="">` : `<i class="mu-nw-ic">${icon(it.icon)}</i>`;
const words = (it: NewsItem) => (it.notr ? `<span data-notr>${esc(it.text)}</span>` : `<span>${esc(it.text)}</span>`);
const whoName = (g: Save, it: NewsItem) => (it.kind === 'post' && it.who ? `<b data-notr>${esc(g.cast[it.who]?.name ?? '')}</b>` : '');
// "More news" (posts are written when you ask, unless they come on their own or when Messages opens: game settings)
const moreBtn = () => (feedPrefs().mode === 'button' ? `<button class="mu-ibtn mu-ghost" data-act="nw-more" ${NEWS.busy ? 'disabled' : ''} aria-label="More news" title="More news">${NEWS.busy ? '<span class="mu-spin"></span>' : icon('redo')}</button>` : '');

/** The strip at the top of Messages: the next thing in town, then the two newest news, a line each. */
export function newsStripHtml(g: Save, w: WorldDef): string {
    if (!newsOn(w)) return '';
    const list = [...comingNews(g, w).slice(0, 1), ...latestNews(g).slice(0, 2)];
    return `<section class="mu-nw-strip"><header><b>${esc(lex(w, 'news'))}</b>${moreBtn()}<button class="mu-ghost mu-nw-all" data-act="ph-go" data-app="news">${esc(tr('All'))}</button></header>
        ${list.length ? `<div class="mu-nw-cards">${list.map(it => `<button class="mu-nw-card is-${it.kind}" ${it.who ? `data-act="ph-person" data-who="${esc(it.who)}"` : 'data-act="ph-go" data-app="news"'}>
            ${face(it)}<span>${whoName(g, it)}${words(it)}</span><small>${it.kind === 'city' ? '' : esc(when(g, it.at))}</small></button>`).join('')}</div>`
        : `<p class="mu-muted">${esc(lex(w, 'noNews'))}</p>`}</section>`;
}

/** All the news: coming up in town, then the last two weeks a day at a time. */
export function newsApp(g: Save, w: WorldDef, head: string): string {
    if (!newsOn(w)) return `${head}<div class="mu-ph-body"><p class="mu-muted">${esc(lex(w, 'noNews'))}</p></div>`;
    const coming = comingNews(g, w), latest = latestNews(g);
    const row = (it: NewsItem) => `<li class="mu-nw-row is-${it.kind}">${it.who ? `<button class="mu-nw-who" data-act="ph-person" data-who="${esc(it.who)}">${face(it)}</button>` : face(it)}
        <span>${whoName(g, it)}${words(it)}${it.img ? `<img class="mu-nw-img" src="${esc(safeUrl(it.img))}" alt="">` : ''}<small>${it.kind === 'city' ? '' : esc(when(g, it.at))}</small></span></li>`;
    let last = -1, days = '';
    for (const it of latest) {
        const d = Math.floor(it.at / 1440);
        if (d !== last) { days += `<li class="mu-nw-day">${esc(d === g.day ? tr('Today') : d === g.day - 1 ? tr('Yesterday') : `${tr(weekday(d))} · ${fmt('Day {0}', String(d))}`)}</li>`; last = d; }
        days += row(it);
    }
    return `${head.replace(/<span><\/span><\/div>$/, `<span class="mu-row">${moreBtn()}</span></div>`)}<div class="mu-ph-body mu-nw">
        ${coming.length ? `<section><h4>${esc(tr('Coming up'))}</h4><ul class="mu-nw-list">${coming.map(row).join('')}</ul></section>` : ''}
        <section><h4>${esc(lex(w, 'news'))}</h4>${latest.length ? `<ul class="mu-nw-list">${days}</ul>` : `<p class="mu-muted">${esc(lex(w, 'noNews'))}</p>`}</section></div>`;
}

/** New posts by the people you know (the AI writes two), when you ask or when Messages opens (game settings). */
export async function refreshNews(force = false) {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || !newsOn(w) || NEWS.busy) return;
    if (!force && !(feedPrefs().mode === 'open' && nowAbs(g) - feed(g).last >= 120)) return;
    NEWS.busy = true; notify();
    try { await generatePosts(g, w); } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
    NEWS.busy = false; saveGame(); notify();
}
Object.assign(ACT, { 'nw-more': () => refreshNews(true) });
