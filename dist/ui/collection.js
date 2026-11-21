// The Collection app (its own icon on the phone): the halls this game has, the record's percentage and new slots, and
// each group folded with its slots: a filled one with its emoji or the person's portrait, its plaque, the day and a gold
// frame for a good ending; an empty one greyed with its hint and how far along it is. Tapping a slot opens its page:
// the slot large, and what it's made of (a keepsake kind's keepsakes, had or missing, with where each comes from; a
// district's places, and the street stories still to find there), or how to fill it. "Missing only" hides what's
// filled. Unfolded, the groups are a list on the left and the open group's slots (or a slot's page) on the right, like
// Messages. Drawn from sim/collection.ts alone (`recordView`, `percentOf`, `slotParts`); it holds no numbers of its own.
// With the collection system off, or a world without halls, the app isn't on the phone and this draws only a line.
// (museum) Once the museum has begun, its tabs come first (Museum, Dealer, Sales: ui/museumui.ts), then the display
// halls with their pieces as picture tiles (how each came, where it's on show, Replica, Damaged · restore; a missing
// one darkened with its hint and price band; a bonus piece in a gold frame), then the record. A Here tab shows where
// you are sells pieces. The app opens on the Museum tab once the museum's offer has come, else on the first hall.
// (nature) A missing piece whose way comes round this season is marked In season, and its hall says how many; a piece
// of parts shows its parts as small pictures (darkened while missing), then Ready to mount or the day it's mounted.
// Here also lists what could turn up where you are now.
import { esc, notify } from '../core/store.js';
import { ACT, INPUT } from './reg.js';
import { thumb } from '../st/bridge.js';
import { worldFile } from '../core/world.js';
import { itemIco } from './itempic.js';
import { hintsFor, keepsakeHints } from './goalhints.js';
import { recordView, percentOf, collectionOn, collectionOf, markSeen, settleCollection, slotParts } from '../sim/collection.js';
import { personNamed } from '../sim/when.js';
import { money } from '../sim/needs.js';
import { museumOn, museumOf, museumOpen, museumDef, hasUpgrade } from '../sim/museum.js';
import { inSeason } from '../sim/dig.js';
import { museumTab, dealerTab, salesTab, hereTab, hereHasAny, howItCame, whereWords, priceBand } from './museumui.js';
/** In memory only: the hall shown, the groups opened (folded) or the group shown (unfolded), the slot whose page is
 *  open, Missing only, and the day the app was last opened before now (a slot filled since is marked as just in). */
export const CL = { hall: '', open: new Set(), since: -1, game: '', seeded: '', group: '', slot: '', missing: false,
    // seeded: the hall whose first group was opened on arrival; back: where the list was scrolled, to come back to it
    back: null };
const n = (x) => String(Math.round(x));
const plural = (k, one, many) => (k === 1 ? one : many.replace('{0}', n(k)));
// A tile's picture: the slot's own (the museum's pieces, from the art track, through the world's files), else the
// person's portrait, else its emoji.
function picOf(g, w, t) {
    const src = t.pic ? worldFile(w, t.pic) : '';
    if (src)
        return `<img class="mu-cl-pic" src="${esc(src)}" alt="" loading="lazy">`;
    const r = t.who ? personNamed(g, t.who) : undefined;
    if (r)
        return `<img class="mu-cl-pic is-face" src="${esc(thumb(r.avatar))}" alt="">`;
    return `<i class="mu-cl-pic is-emoji" aria-hidden="true">${esc(t.icon ?? '❔')}</i>`;
}
function dayWords(t) {
    if (!t.got)
        return '';
    return t.got.back ? 'Before the record began' : `Day ${n(t.got.day)}`;
}
// The whole tile opens the slot's page: a button laid over it (a piece's own buttons sit above it).
const hit = (t, link) => (link ? `<button class="mu-cl-hit" data-act="cl-slot" data-id="${esc(t.id)}" aria-label="${esc(t.name)}" data-notr></button>` : '');
function tileHtml(g, w, t, link = true) {
    const got = !!t.got, fresh = got && CL.since >= 0 && !t.got.back && t.got.day > CL.since;
    const cls = ['mu-cl-tile', got ? 'is-got' : 'is-empty', t.gold ? 'is-gold' : '', t.fresh ? 'is-new' : '', fresh ? 'is-just' : ''].filter(Boolean).join(' ');
    const count = t.count ? `<span class="mu-cl-count">${n(Math.min(t.count.have, t.count.need))}/${n(t.count.need)}</span>` : '';
    const bar = t.count && t.count.need ? `<span class="mu-cl-bar"><b style="width:${Math.round(Math.min(1, t.count.have / t.count.need) * 100)}%"></b></span>` : '';
    const gone = t.count?.gone ? `<small class="mu-cl-gone">${esc(plural(t.count.gone, "1 can't happen any more", "{0} can't happen any more"))}</small>` : '';
    const marks = `${t.fresh ? '<em class="mu-cl-mark">New</em>' : ''}${fresh ? '<em class="mu-cl-mark is-just">Just in</em>' : ''}`;
    const body = got
        ? `${t.plaque ? `<span class="mu-cl-plaque" data-notr>${esc(t.plaque)}</span>` : ''}${t.away ? '<small class="mu-cl-away">You weren\'t there when it ended.</small>' : ''}<small class="mu-cl-day">${esc(dayWords(t))}</small>`
        : `<small class="mu-cl-hint" data-notr>${esc(t.hint)}</small>${bar}${gone}`;
    return `<li class="${cls}${link ? ' is-link' : ''}">${hit(t, link)}${picOf(g, w, t)}<span class="mu-cl-text">
        <span class="mu-cl-name"><b data-notr>${esc(t.name)}</b>${t.title ? ` <small class="mu-cl-title" data-notr>${esc(t.title)}</small>` : ''}${count}${marks}</span>${body}</span></li>`;
}
// (museum) A display piece's tile: its picture, name, plaque, how it came and where it's on show, Replica, Damaged with
// the restoring (or the day it's back); missing: darkened, its hint, its price band and the upgrade it waits for; a
// bonus piece in a gold frame. A damaged find isn't filled yet (MU-4): it shows as yours, waiting for the workshop.
function pieceHtml(g, w, t, link = true) {
    const p = (t.piece ?? {}), got = t.got, bonus = !!w.collection?.slots.find(s => s.id === t.id)?.bonus;
    const fresh = !!got && CL.since >= 0 && !got.back && got.day > CL.since, open = museumOpen(g, w), shop = hasUpgrade(g, w, 'workshop');
    const hurt = !!p.damaged, waiting = hurt && !got, season = !got && !waiting && seasonal(g, w, t.id);
    const cls = ['mu-cl-tile', 'mu-cl-piece', got || waiting ? 'is-got' : 'is-empty', t.gold || bonus ? 'is-gold' : '', bonus ? 'is-bonus' : '', hurt ? 'is-damaged' : '', p.replica ? 'is-replica' : '', p.needs && !got ? 'is-needs' : '', season ? 'is-season' : '', t.fresh ? 'is-new' : '', fresh ? 'is-just' : ''].filter(Boolean).join(' ');
    const marks = `${bonus ? '<em class="mu-cl-mark is-bonus">Bonus</em>' : ''}${p.replica ? '<em class="mu-cl-mark is-replica">Replica</em>' : ''}${season ? '<em class="mu-cl-mark is-season">In season</em>' : ''}${t.fresh ? '<em class="mu-cl-mark">New</em>' : ''}${fresh ? '<em class="mu-cl-mark is-just">Just in</em>' : ''}`;
    const fix = !hurt ? '' : p.ready !== undefined ? `<small class="mu-cl-fix">${esc(`In the workshop until day ${n(p.ready)}`)}</small>`
        : shop && p.fee ? `<button class="mu-cl-fix" data-act="mus-restore" data-id="${esc(t.id)}" ${g.player.money < p.fee ? `aria-disabled="true" title="${esc(`You need ${money(w, p.fee)}`)}"` : ''}>${esc(`Damaged · restore ${money(w, p.fee)}`)}</button>`
            : `<small class="mu-cl-fix">${esc(waiting ? 'Damaged: it counts once the workshop restores it' : 'Damaged: off the show until the workshop restores it')}</small>`;
    let body;
    if (got)
        body = `${t.plaque ? `<span class="mu-cl-plaque" data-notr>${esc(t.plaque)}</span>` : ''}${t.away ? '<small class="mu-cl-away">You weren\'t there when it ended.</small>' : ''}
        <small class="mu-cl-day">${esc(howItCame(g, w, got))}</small>${museumOn(w) && !hurt ? `<small class="mu-cl-at">${esc(whereWords(p.at, open))}</small>` : ''}${fix}`;
    else if (waiting)
        body = `<small class="mu-cl-day">${esc(howItCame(g, w, { day: (museumOf(g)?.damaged?.[t.id]?.day ?? g.day), src: p.src }))}</small>${fix}`;
    else
        body = `<small class="mu-cl-hint ${p.needs ? 'is-needs' : ''}" data-notr>${esc(t.hint)}</small>${priceBand(p.rung ?? 0) ? `<small class="mu-cl-band" title="${esc(`About ${money(w, p.price ?? 0)}`)}">${esc(priceBand(p.rung ?? 0))}</small>` : ''}${p.needs && !said(t.hint, p.needs) ? `<small class="mu-cl-needs">${esc('Needs')} <span data-notr>${esc(p.needs)}</span></small>` : ''}${partsHtml(w, p)}`;
    return `<li class="${cls}${link ? ' is-link' : ''}" data-piece="${esc(t.id)}">${hit(t, link)}${picOf(g, w, t)}<span class="mu-cl-text">
        <span class="mu-cl-name"><b data-notr>${esc(t.name)}</b>${t.title ? ` <small class="mu-cl-title" data-notr>${esc(t.title)}</small>` : ''}${marks}</span>${body}</span></li>`;
}
// (nature) Does a missing piece's way come round this season (sim/dig.ts `inSeason`, a pure reading of its ways; only
// yearly windows, seasons and festivals: a weekly market would mark a piece all year)?
const seasonal = (g, w, id) => collectionOn(w) && inSeason(g, w, id, { yearly: true });
// (nature) A piece of parts not had yet: each part as a small picture (the part's own, else the piece's emoji),
// darkened while missing, how many are in, then Ready to mount or the day the workshop has it ready.
function partsHtml(w, p) {
    if (!p.parts?.length)
        return '';
    const have = p.parts.filter(x => x.have).length, of = p.parts.length;
    const pics = p.parts.map(x => {
        const src = x.pic ? worldFile(w, x.pic) : '';
        const img = src ? `<img src="${esc(src)}" alt="" loading="lazy">` : '<i aria-hidden="true">🦴</i>';
        return `<span class="mu-cl-part ${x.have ? 'is-have' : 'is-missing'}" data-part="${esc(x.id)}" title="${esc(x.id)}">${img}</span>`;
    }).join('');
    const state = p.mounting !== undefined ? `<small class="mu-cl-mount">${esc(`Mounting: ready day ${n(p.mounting)}`)}</small>`
        : p.toMount ? '<small class="mu-cl-mount is-ready">Ready to mount</small>' : '';
    return `<span class="mu-cl-parts" data-notr>${pics}</span><small class="mu-cl-partnum">${esc(`${n(have)} of ${n(of)} parts`)}</small>${state}`;
}
// (a world's hint may already say what the piece waits for: "… Needs security.")
const said = (hint, needs) => hint.toLowerCase().includes(needs.toLowerCase().replace(/^(the|a|an) /, ''));
// (museum) How a display hall is on show: whole in its wing, its pieces in the first room, in the cases at home, boxed.
function showLine(w, h) {
    const s = h.show;
    if (!s)
        return '';
    const wing = s.build ? museumDef(w)?.upgrades.find(u => u.id === s.build)?.name : undefined;
    const parts = [
        ...(s.wing ? ['On show in its wing'] : []),
        ...(s.room ? [`In the first room: ${n(s.room)}`] : []),
        ...(s.home ? [`In the cases at home: ${n(s.home)}`] : []),
        ...(s.boxed ? [`Boxed: ${n(s.boxed)}`] : []),
    ];
    return `${parts.length ? `<small>${esc(parts.join(' · '))}</small>` : ''}${wing && (s.boxed || s.room) ? `<small>${esc('Build')} <span data-notr>${esc(wing)}</span> ${esc('to show it all')}</small>` : ''}`;
}
// A hall's head: its percentage and counts, and Missing only.
function hallHead(g, w, h) {
    let head;
    if (h.apart) {
        // a record hall of its own: its own share, in neither percentage
        const tiles = h.groups.flatMap(gr => gr.tiles), have = tiles.filter(t => t.got).length;
        const pct = tiles.length ? Math.floor((have / tiles.length) * 100) : 0;
        head = `<div class="mu-cl-sum"><b class="mu-cl-pct">${n(pct)}%</b><span><span>${esc(`${n(have)} of ${n(tiles.length)} filled`)}</span>${h.desc ? `<small data-notr>${esc(h.desc)}</small>` : ''}</span></div>`;
    }
    else if (h.record || !h.groups.some(gr => gr.tiles.some(t => t.piece))) {
        const p = percentOf(g, w, h.record);
        head = `<div class="mu-cl-sum"><b class="mu-cl-pct">${n(p.pct)}%</b><span><span>${esc(`${n(p.filled)} of ${n(p.counted)} filled`)}</span>${p.fresh ? `<small>${esc(plural(p.fresh, '1 new', '{0} new'))}</small>` : ''}${h.desc ? `<small data-notr>${esc(h.desc)}</small>` : ''}${showLine(w, h)}</span></div>`;
    }
    else {
        // a display hall: its own share of the pieces this game has (a bonus piece never counted)
        const bonus = new Set((w.collection?.slots ?? []).filter(s => s.bonus).map(s => s.id));
        const tiles = h.groups.flatMap(gr => gr.tiles).filter(t => !bonus.has(t.id)), have = tiles.filter(t => t.got).length;
        const pct = tiles.length ? Math.floor((have / tiles.length) * 100) : 0;
        // (nature) how many of those you haven't got come round this season
        const now = tiles.filter(t => !t.got && !t.piece?.damaged && seasonal(g, w, t.id)).length;
        const season = now ? `<small class="mu-cl-season">${esc(`In season now: ${n(now)} you haven't got`)}</small>` : '';
        head = `<div class="mu-cl-sum"><b class="mu-cl-pct">${n(pct)}%</b><span><span>${esc(`${n(have)} of ${n(tiles.length)} pieces`)}</span>${h.desc ? `<small data-notr>${esc(h.desc)}</small>` : ''}${season}${showLine(w, h)}</span></div>`;
    }
    const only = `<label class="mu-cl-only"><input type="checkbox" data-input="cl-missing" ${CL.missing ? 'checked' : ''}><span>${esc('Missing only')}</span></label>`;
    return `${head}${only}`;
}
const tilesHtml = (g, w, gr, grid) => {
    const list = CL.missing ? gr.tiles.filter(t => !t.got) : gr.tiles, pieces = gr.tiles.some(t => t.piece);
    if (!list.length)
        return `<p class="mu-cl-alldone">${esc('Every one is filled.')}</p>`;
    return `<ul class="mu-cl-tiles ${pieces ? 'is-pieces' : ''} ${grid ? 'is-grid' : ''}">${list.map(t => (t.piece ? pieceHtml(g, w, t) : tileHtml(g, w, t))).join('')}</ul>`;
};
const gnum = (gr) => `<span class="mu-cl-gnum">${n(gr.filled)}/${n(gr.tiles.length)}</span>`;
const isDone = (gr) => gr.filled >= gr.tiles.length;
// Folded: each group opens where it is.
function hallHtml(g, w, h) {
    const groups = h.groups.map(gr => {
        const key = `${h.id}/${gr.id}`, open = CL.open.has(key);
        return `<section class="mu-cl-group ${open ? 'is-open' : ''} ${isDone(gr) ? 'is-done' : ''}">
            <button class="mu-cl-ghead" data-act="cl-fold" data-v="${esc(key)}" aria-expanded="${open}"><i aria-hidden="true">${esc(gr.icon ?? '')}</i><b data-notr>${esc(gr.name)}</b>${gnum(gr)}</button>
            ${open ? tilesHtml(g, w, gr, false) : ''}</section>`;
    }).join('');
    return `${hallHead(g, w, h)}${groups}`;
}
// Unfolded: the groups as a list (the one shown marked, a bar each), its slots on the right.
const groupKey = (h) => (h.groups.some(gr => `${h.id}/${gr.id}` === CL.group) ? CL.group : `${h.id}/${h.groups[0]?.id ?? ''}`);
function groupList(h) {
    const on = groupKey(h);
    return `<nav class="mu-cl-glist">${h.groups.map(gr => {
        const key = `${h.id}/${gr.id}`, pct = gr.tiles.length ? Math.round((gr.filled / gr.tiles.length) * 100) : 0;
        return `<button class="mu-cl-grow ${key === on ? 'is-on' : ''} ${isDone(gr) ? 'is-done' : ''}" data-act="cl-group" data-v="${esc(key)}" aria-pressed="${key === on}">
            <i aria-hidden="true">${esc(gr.icon ?? '')}</i><span><b data-notr>${esc(gr.name)}</b><span class="mu-cl-bar"><b style="width:${pct}%"></b></span></span>${gnum(gr)}</button>`;
    }).join('')}</nav>`;
}
const groupPane = (g, w, gr) => `<h3 class="mu-cl-gtitle"><i aria-hidden="true">${esc(gr.icon ?? '')}</i><b data-notr>${esc(gr.name)}</b>${gnum(gr)}</h3>${tilesHtml(g, w, gr, true)}`;
/* ---------- a slot's page ---------- */
// Where a keepsake comes from (the Goals app's hints); giving one away doesn't matter here: it was held.
const fromLines = (g, w, id) => keepsakeHints(g, w, id).filter(l => l !== 'Giving it as a gift uses it up.');
const line = (l) => `<small class="mu-cl-from">${esc(l)}</small>`;
// A keepsake kind's keepsakes, the missing first, each with where it comes from.
function keepsakesHtml(g, w, list) {
    const rows = [...list].sort((a, b) => Number(a.had) - Number(b.had)).map(k => {
        const state = k.holding ? `Yours now: ${n(k.holding)}` : k.had ? 'Had' : 'Not yet';
        const from = k.had ? [] : fromLines(g, w, k.id);
        const how = k.had ? '' : from.length ? from.map(line).join('') : line('No known way to get it yet.');
        return `<li class="mu-cl-item ${k.had ? 'is-had' : 'is-missing'}">${itemIco(w, k, '🎁')}<span><span class="mu-cl-iname"><b data-notr>${esc(k.name)}</b><small class="mu-cl-istate">${esc(state)}</small></span>${how}</span></li>`;
    }).join('');
    const had = list.filter(k => k.had).length;
    return `<section class="mu-cl-sec"><h4>${esc('The keepsakes')} <small>${esc(`${n(had)} of ${n(list.length)} held at some time`)}</small></h4><ul class="mu-cl-items">${rows}</ul></section>`;
}
// A district's places, those not been to yet first.
function placesHtml(list) {
    const been = list.filter(p => p.been).length;
    const chips = [...list].sort((a, b) => Number(a.been) - Number(b.been)).map(p => `<li class="${p.been ? 'is-done' : ''}"><i aria-hidden="true">${p.been ? '✓' : '•'}</i><span data-notr>${esc(p.name)}</span></li>`).join('');
    return `<section class="mu-cl-sec"><h4>${esc('Places')} <small>${esc(`${n(been)} of ${n(list.length)} been to`)}</small></h4><ul class="mu-cl-chips">${chips}</ul></section>`;
}
// A district's street stories: where the ones still to find happen (never what they are).
function storiesHtml(s) {
    const rows = s.open.map(x => `<li><span data-notr>${esc(x.place)}</span><small>${esc(plural(x.n, '1 to find', '{0} to find'))}</small></li>`).join('');
    return `<section class="mu-cl-sec"><h4>${esc('Street stories')} <small>${esc(`${n(s.seen)} seen`)}</small></h4>
        ${rows ? `<ul class="mu-cl-where">${rows}</ul>` : `<p class="mu-muted">${esc('None left to find.')}</p>`}
        ${s.gone ? `<small class="mu-cl-gone">${esc(plural(s.gone, "1 can't happen any more", "{0} can't happen any more"))}</small>` : ''}</section>`;
}
function slotPage(g, w, t, gr) {
    const p = slotParts(g, w, t.id) ?? {};
    const back = `<button class="mu-cl-back" data-act="cl-back"><i aria-hidden="true">‹</i> <span data-notr>${esc(gr.name)}</span></button>`;
    const card = `<ul class="mu-cl-tiles is-detail ${t.piece ? 'is-pieces' : ''}">${t.piece ? pieceHtml(g, w, t, false) : tileHtml(g, w, t, false)}</ul>`;
    const parts = `${p.keepsakes?.length ? keepsakesHtml(g, w, p.keepsakes) : ''}${p.places?.length ? placesHtml(p.places) : ''}${p.stories ? storiesHtml(p.stories) : ''}`;
    // nothing to list: how to fill it, as the Goals app says it (a festival's days, a place's map…)
    const how = !t.got && !parts && p.cond ? hintsFor(g, w, p.cond.key, p.cond.values) : [];
    const howHtml = how.length ? `<section class="mu-cl-sec"><h4>${esc('How')}</h4>${how.map(line).join('')}</section>` : '';
    return `<div class="mu-cl-page">${back}${card}${parts}${howHtml}</div>`;
}
// The slot whose page is open, and its group, in the hall shown.
function openSlot(h) {
    if (!h || !CL.slot)
        return undefined;
    for (const gr of h.groups) {
        const t = gr.tiles.find(x => x.id === CL.slot);
        if (t)
            return { t, gr };
    }
    return undefined;
}
/** Closing a slot's page (its Back, or the phone's): the list again, where it was scrolled to. */
export function closeSlot() {
    if (!CL.slot)
        return false;
    const b = CL.back;
    CL.slot = '';
    CL.back = null;
    if (b)
        setTimeout(() => { const el = document.querySelector(b.sel); if (el)
            el.scrollTop = b.top; }, 30);
    return true;
}
/** The tabs besides the halls: Here (pieces sold where you are, or a find that could turn up there now), and the
 *  museum's once it has begun. */
function extraTabs(g, w) {
    const m = museumDef(w), begun = museumOn(w) && museumOf(g)?.begun !== undefined;
    return [
        ...(begun ? [{ id: 'kura', name: 'Museum', icon: '🏛️' }] : []),
        ...(begun && m?.dealer ? [{ id: 'dealer', name: 'Dealer', icon: '🚐' }] : []),
        ...(begun && m?.auctions ? [{ id: 'sales', name: 'Sales', icon: '🔨' }] : []),
        ...(hereHasAny(g, w) ? [{ id: 'here', name: 'Here', icon: '📍' }] : []),
    ];
}
// The tab the app opens on in a game seen for the first time: the museum once its offer has come (or it's yours),
// else the first hall (the display halls come first once the museum has begun, then the record).
function firstTab(g, w, extra, halls) {
    const st = museumOf(g);
    if (extra.some(t => t.id === 'kura') && (st?.offered !== undefined || st?.opened !== undefined))
        return 'kura';
    return halls[0]?.id ?? extra[0]?.id ?? '';
}
/** The app's body under the header; `wide`: the unfolded phone (groups and slots side by side). */
export function collectionApp(g, w, head, wide = false) {
    if (!collectionOn(w))
        return `${head}<div class="mu-ph-body mu-cl"><p class="mu-muted">Nothing to collect in this world.</p></div>`;
    if (CL.game !== g.world + '|' + g.seed) {
        // a game seen for the first time here: back to the first hall, the first group open, the last visit remembered
        CL.game = g.world + '|' + g.seed;
        CL.hall = '';
        CL.open = new Set();
        CL.seeded = '';
        CL.group = '';
        CL.slot = '';
        CL.since = collectionOf(g)?.seen ?? -1;
    }
    const halls = recordView(g, w), extra = extraTabs(g, w);
    if (!halls.length && !extra.length)
        return `${head}<div class="mu-ph-body mu-cl"><p class="mu-muted">Nothing to collect yet.</p></div>`;
    const ids = [...extra.map(t => t.id), ...halls.map(h => h.id)];
    if (!ids.includes(CL.hall))
        CL.hall = firstTab(g, w, extra, halls);
    const h = halls.find(x => x.id === CL.hall);
    // arriving at a hall opens its first group, once: closing every group afterwards leaves them closed
    if (h && CL.seeded !== h.id) {
        CL.seeded = h.id;
        if (!CL.open.size && h.groups[0])
            CL.open.add(`${h.id}/${h.groups[0].id}`);
    }
    const tab = (id, name, icon, notr) => `<button class="${id === CL.hall ? 'is-on' : ''}" data-act="cl-hall" data-v="${esc(id)}" aria-pressed="${id === CL.hall}"><i aria-hidden="true">${esc(icon ?? '')}</i><span${notr ? ' data-notr' : ''}>${esc(name)}</span></button>`;
    const tabs = ids.length > 1
        ? `<nav class="mu-cl-tabs" data-keep="cl-tabs">${extra.map(t => tab(t.id, t.name, t.icon, false)).join('')}${extra.length && halls.length ? '<span class="mu-cl-tabsep" aria-hidden="true"></span>' : ''}${halls.map(x => tab(x.id, x.name, x.icon, true)).join('')}</nav>`
        : h ? `<h3 class="mu-cl-hname"><i aria-hidden="true">${esc(h.icon ?? '')}</i> <span data-notr>${esc(h.name)}</span></h3>` : '';
    const open = openSlot(h);
    if (!open)
        CL.slot = '';
    if (wide && h) {
        // the right pane's key changes with what it shows, so each opens at its top
        const key = groupKey(h), gr = h.groups.find(x => `${h.id}/${x.id}` === key);
        return `${head}<div class="mu-ph-split mu-cl-split"><div class="mu-ph-pane is-list" data-keep="cl-pane-list"><div class="mu-ph-body mu-cl">${tabs}${hallHead(g, w, h)}${groupList(h)}</div></div>
            <div class="mu-ph-pane is-open" data-keep="cl-pane-${esc(open ? `slot/${open.t.id}` : key)}"><div class="mu-ph-body mu-cl">${open ? slotPage(g, w, open.t, open.gr) : groupPane(g, w, gr)}</div></div></div>`;
    }
    if (open)
        return `${head}<div class="mu-ph-body mu-cl">${slotPage(g, w, open.t, open.gr)}</div>`;
    const body = h ? hallHtml(g, w, h) : CL.hall === 'kura' ? museumTab(g, w) : CL.hall === 'dealer' ? dealerTab(g, w) : CL.hall === 'sales' ? salesTab(g, w) : CL.hall === 'here' ? hereTab(g, w) : '';
    return `${head}<div class="mu-ph-body mu-cl">${tabs}${body}</div>`;
}
/** Opening the app: the record catches up first (a click since the hour may have filled something), the last visit
 *  is remembered for "Just in", and this visit is the new last one. */
export function openCollection(g, w) {
    if (!collectionOn(w))
        return;
    settleCollection(g, w);
    CL.game = g.world + '|' + g.seed;
    CL.since = collectionOf(g)?.seen ?? -1;
    markSeen(g);
}
Object.assign(ACT, {
    'cl-hall': (el) => { CL.hall = el.dataset.v ?? ''; CL.open = new Set(); CL.seeded = ''; CL.group = ''; CL.slot = ''; notify(); },
    'cl-fold': (el) => { const k = el.dataset.v ?? ''; if (CL.open.has(k))
        CL.open.delete(k);
    else
        CL.open.add(k); notify(); },
    'cl-group': (el) => { CL.group = el.dataset.v ?? ''; CL.slot = ''; CL.back = null; notify(); },
    'cl-slot': (el) => {
        const pane = el.closest?.('.mu-ph-pane'), box = pane ?? el.closest?.('.mu-ph-screen');
        CL.back = box ? { sel: pane ? '#mundi-root .mu-cl-split .mu-ph-pane.is-open' : '#mundi-root .mu-ph-screen', top: box.scrollTop } : null;
        CL.slot = el.dataset.id ?? '';
        notify();
        // folded, the page shows in the same screen as the list: from its top
        if (!pane)
            setTimeout(() => { const s = document.querySelector('#mundi-root .mu-ph-screen'); if (s)
                s.scrollTop = 0; }, 30);
    },
    'cl-back': () => { if (closeSlot())
        notify(); },
});
Object.assign(INPUT, { 'cl-missing': (el) => { CL.missing = el.checked; notify(); } });
