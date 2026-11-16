// The Collection app (phone, Profile section, next to Goals): the halls this game has, the record's percentage and new
// slots, and each group folded with its slots: a filled one with its emoji or the person's portrait, its plaque, the
// day and a gold frame for a good ending; an empty one greyed with its hint and how far along it is. Drawn from
// sim/collection.ts alone (`recordView`, `percentOf`); it holds no numbers of its own. With the collection system off,
// or a world without halls, the app isn't on the phone and this draws only a line.
// (museum) Once the museum has begun, its tabs come first (Museum, Dealer, Sales: ui/museumui.ts), then the display
// halls with their pieces as picture tiles (how each came, where it's on show, Replica, Damaged · restore; a missing
// one darkened with its hint and price band; a bonus piece in a gold frame), then the record. A Here tab shows where
// you are sells pieces. The app opens on the Museum tab once the museum's offer has come, else on the first hall.
import { esc, notify } from '../core/store.js';
import { ACT } from './reg.js';
import { thumb } from '../st/bridge.js';
import { worldFile } from '../core/world.js';
import { recordView, percentOf, collectionOn, collectionOf, markSeen, settleCollection } from '../sim/collection.js';
import { personNamed } from '../sim/when.js';
import { money } from '../sim/needs.js';
import { museumOn, museumOf, museumOpen, museumDef, hasUpgrade } from '../sim/museum.js';
import { museumTab, dealerTab, salesTab, hereTab, piecesHereCount, howItCame, whereWords, priceBand } from './museumui.js';
/** In memory only: the hall shown, the groups opened, and the day the app was last opened before now (a slot filled
 *  since is marked as just in). */
export const CL = { hall: '', open: new Set(), since: -1, game: '' };
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
function tileHtml(g, w, t) {
    const got = !!t.got, fresh = got && CL.since >= 0 && !t.got.back && t.got.day > CL.since;
    const cls = ['mu-cl-tile', got ? 'is-got' : 'is-empty', t.gold ? 'is-gold' : '', t.fresh ? 'is-new' : '', fresh ? 'is-just' : ''].filter(Boolean).join(' ');
    const count = t.count ? `<span class="mu-cl-count">${n(Math.min(t.count.have, t.count.need))}/${n(t.count.need)}</span>` : '';
    const bar = t.count && t.count.need ? `<span class="mu-cl-bar"><b style="width:${Math.round(Math.min(1, t.count.have / t.count.need) * 100)}%"></b></span>` : '';
    const gone = t.count?.gone ? `<small class="mu-cl-gone">${esc(plural(t.count.gone, "1 can't happen any more", "{0} can't happen any more"))}</small>` : '';
    const marks = `${t.fresh ? '<em class="mu-cl-mark">New</em>' : ''}${fresh ? '<em class="mu-cl-mark is-just">Just in</em>' : ''}`;
    const body = got
        ? `${t.plaque ? `<span class="mu-cl-plaque" data-notr>${esc(t.plaque)}</span>` : ''}${t.away ? '<small class="mu-cl-away">You weren\'t there when it ended.</small>' : ''}<small class="mu-cl-day">${esc(dayWords(t))}</small>`
        : `<small class="mu-cl-hint" data-notr>${esc(t.hint)}</small>${bar}${gone}`;
    return `<li class="${cls}">${picOf(g, w, t)}<span class="mu-cl-text">
        <span class="mu-cl-name"><b data-notr>${esc(t.name)}</b>${t.title ? ` <small class="mu-cl-title" data-notr>${esc(t.title)}</small>` : ''}${count}${marks}</span>${body}</span></li>`;
}
// (museum) A display piece's tile: its picture, name, plaque, how it came and where it's on show, Replica, Damaged with
// the restoring (or the day it's back); missing: darkened, its hint, its price band and the upgrade it waits for; a
// bonus piece in a gold frame. A damaged find isn't filled yet (MU-4): it shows as yours, waiting for the workshop.
function pieceHtml(g, w, t) {
    const p = (t.piece ?? {}), got = t.got, bonus = !!w.collection?.slots.find(s => s.id === t.id)?.bonus;
    const fresh = !!got && CL.since >= 0 && !got.back && got.day > CL.since, open = museumOpen(g, w), shop = hasUpgrade(g, w, 'workshop');
    const hurt = !!p.damaged, waiting = hurt && !got;
    const cls = ['mu-cl-tile', 'mu-cl-piece', got || waiting ? 'is-got' : 'is-empty', t.gold || bonus ? 'is-gold' : '', bonus ? 'is-bonus' : '', hurt ? 'is-damaged' : '', p.replica ? 'is-replica' : '', p.needs && !got ? 'is-needs' : '', t.fresh ? 'is-new' : '', fresh ? 'is-just' : ''].filter(Boolean).join(' ');
    const marks = `${bonus ? '<em class="mu-cl-mark is-bonus">Bonus</em>' : ''}${p.replica ? '<em class="mu-cl-mark is-replica">Replica</em>' : ''}${t.fresh ? '<em class="mu-cl-mark">New</em>' : ''}${fresh ? '<em class="mu-cl-mark is-just">Just in</em>' : ''}`;
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
        body = `<small class="mu-cl-hint ${p.needs ? 'is-needs' : ''}" data-notr>${esc(t.hint)}</small>${priceBand(p.rung ?? 0) ? `<small class="mu-cl-band" title="${esc(`About ${money(w, p.price ?? 0)}`)}">${esc(priceBand(p.rung ?? 0))}</small>` : ''}${p.needs && !said(t.hint, p.needs) ? `<small class="mu-cl-needs">${esc('Needs')} <span data-notr>${esc(p.needs)}</span></small>` : ''}`;
    return `<li class="${cls}" data-piece="${esc(t.id)}">${picOf(g, w, t)}<span class="mu-cl-text">
        <span class="mu-cl-name"><b data-notr>${esc(t.name)}</b>${t.title ? ` <small class="mu-cl-title" data-notr>${esc(t.title)}</small>` : ''}${marks}</span>${body}</span></li>`;
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
function hallHtml(g, w, h) {
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
        head = `<div class="mu-cl-sum"><b class="mu-cl-pct">${n(pct)}%</b><span><span>${esc(`${n(have)} of ${n(tiles.length)} pieces`)}</span>${h.desc ? `<small data-notr>${esc(h.desc)}</small>` : ''}${showLine(w, h)}</span></div>`;
    }
    const groups = h.groups.map(gr => {
        const key = `${h.id}/${gr.id}`, open = CL.open.has(key), pieces = gr.tiles.some(t => t.piece);
        return `<section class="mu-cl-group ${open ? 'is-open' : ''}">
            <button class="mu-cl-ghead" data-act="cl-fold" data-v="${esc(key)}" aria-expanded="${open}"><i aria-hidden="true">${esc(gr.icon ?? '')}</i><b data-notr>${esc(gr.name)}</b><span class="mu-cl-gnum">${n(gr.filled)}/${n(gr.tiles.length)}</span></button>
            ${open ? `<ul class="mu-cl-tiles ${pieces ? 'is-pieces' : ''}">${gr.tiles.map(t => (t.piece ? pieceHtml(g, w, t) : tileHtml(g, w, t))).join('')}</ul>` : ''}</section>`;
    }).join('');
    return `${head}${groups}`;
}
/** The tabs besides the halls: Here (pieces sold where you are), and the museum's once it has begun. */
function extraTabs(g, w) {
    const m = museumDef(w), begun = museumOn(w) && museumOf(g)?.begun !== undefined;
    return [
        ...(begun ? [{ id: 'kura', name: 'Museum', icon: '🏛️' }] : []),
        ...(begun && m?.dealer ? [{ id: 'dealer', name: 'Dealer', icon: '🚐' }] : []),
        ...(begun && m?.auctions ? [{ id: 'sales', name: 'Sales', icon: '🔨' }] : []),
        ...(piecesHereCount(g, w) ? [{ id: 'here', name: 'Here', icon: '📍' }] : []),
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
/** The app's body under the header. */
export function collectionApp(g, w, head) {
    if (!collectionOn(w))
        return `${head}<div class="mu-ph-body mu-cl"><p class="mu-muted">Nothing to collect in this world.</p></div>`;
    if (CL.game !== g.world + '|' + g.seed) {
        // a game seen for the first time here: back to the first hall, the first group open, the last visit remembered
        CL.game = g.world + '|' + g.seed;
        CL.hall = '';
        CL.open = new Set();
        CL.since = collectionOf(g)?.seen ?? -1;
    }
    const halls = recordView(g, w), extra = extraTabs(g, w);
    if (!halls.length && !extra.length)
        return `${head}<div class="mu-ph-body mu-cl"><p class="mu-muted">Nothing to collect yet.</p></div>`;
    const ids = [...extra.map(t => t.id), ...halls.map(h => h.id)];
    if (!ids.includes(CL.hall))
        CL.hall = firstTab(g, w, extra, halls);
    const h = halls.find(x => x.id === CL.hall);
    if (h && !CL.open.size && h.groups[0])
        CL.open.add(`${h.id}/${h.groups[0].id}`);
    const tab = (id, name, icon, notr) => `<button class="${id === CL.hall ? 'is-on' : ''}" data-act="cl-hall" data-v="${esc(id)}" aria-pressed="${id === CL.hall}"><i aria-hidden="true">${esc(icon ?? '')}</i><span${notr ? ' data-notr' : ''}>${esc(name)}</span></button>`;
    const tabs = ids.length > 1
        ? `<nav class="mu-cl-tabs" data-keep="cl-tabs">${extra.map(t => tab(t.id, t.name, t.icon, false)).join('')}${extra.length && halls.length ? '<span class="mu-cl-tabsep" aria-hidden="true"></span>' : ''}${halls.map(x => tab(x.id, x.name, x.icon, true)).join('')}</nav>`
        : h ? `<h3 class="mu-cl-hname"><i aria-hidden="true">${esc(h.icon ?? '')}</i> <span data-notr>${esc(h.name)}</span></h3>` : '';
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
    'cl-hall': (el) => { CL.hall = el.dataset.v ?? ''; CL.open = new Set(); notify(); },
    'cl-fold': (el) => { const k = el.dataset.v ?? ''; if (CL.open.has(k))
        CL.open.delete(k);
    else
        CL.open.add(k); notify(); },
});
