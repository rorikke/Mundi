// The Collection app (phone, Profile section, next to Goals): the halls this game has, the record's percentage and new
// slots, and each group folded with its slots: a filled one with its emoji or the person's portrait, its plaque, the
// day and a gold frame for a good ending; an empty one greyed with its hint and how far along it is. Drawn from
// sim/collection.ts alone (`recordView`, `percentOf`); it holds no numbers of its own. With the collection system off,
// or a world without halls, the app isn't on the phone and this draws only a line.
import { esc, notify, type Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { ACT } from './reg.js';
import { thumb } from '../st/bridge.js';
import { recordView, percentOf, collectionOn, collectionOf, markSeen, settleCollection, type Tile, type HallView } from '../sim/collection.js';
import { personNamed } from '../sim/when.js';

/** In memory only: the hall shown, the groups opened, and the day the app was last opened before now (a slot filled
 *  since is marked as just in). */
export const CL = { hall: '', open: new Set<string>(), since: -1, game: '' };

const n = (x: number) => String(Math.round(x));
const plural = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('{0}', n(k)));
// A tile's picture: the slot's own (the museum's pieces, from the art track), else the person's portrait, else its emoji.
function picOf(g: Save, w: WorldDef, t: Tile): string {
    if (t.pic) return `<img class="mu-cl-pic" src="${esc(t.pic)}" alt="" loading="lazy">`;
    const r = t.who ? personNamed(g, t.who) : undefined;
    if (r) return `<img class="mu-cl-pic is-face" src="${esc(thumb(r.avatar))}" alt="">`;
    return `<i class="mu-cl-pic is-emoji" aria-hidden="true">${esc(t.icon ?? '❔')}</i>`;
}
function dayWords(t: Tile): string {
    if (!t.got) return '';
    return t.got.back ? 'Before the record began' : `Day ${n(t.got.day)}`;
}
function tileHtml(g: Save, w: WorldDef, t: Tile): string {
    const got = !!t.got, fresh = got && CL.since >= 0 && !t.got!.back && t.got!.day > CL.since;
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
function hallHtml(g: Save, w: WorldDef, h: HallView): string {
    const p = percentOf(g, w, h.record);
    const head = `<div class="mu-cl-sum"><b class="mu-cl-pct">${n(p.pct)}%</b><span><span>${esc(`${n(p.filled)} of ${n(p.counted)} filled`)}</span>${p.fresh ? `<small>${esc(plural(p.fresh, '1 new', '{0} new'))}</small>` : ''}${h.desc ? `<small data-notr>${esc(h.desc)}</small>` : ''}</span></div>`;
    const groups = h.groups.map(gr => {
        const key = `${h.id}/${gr.id}`, open = CL.open.has(key);
        return `<section class="mu-cl-group ${open ? 'is-open' : ''}">
            <button class="mu-cl-ghead" data-act="cl-fold" data-v="${esc(key)}" aria-expanded="${open}"><i aria-hidden="true">${esc(gr.icon ?? '')}</i><b data-notr>${esc(gr.name)}</b><span class="mu-cl-gnum">${n(gr.filled)}/${n(gr.tiles.length)}</span></button>
            ${open ? `<ul class="mu-cl-tiles">${gr.tiles.map(t => tileHtml(g, w, t)).join('')}</ul>` : ''}</section>`;
    }).join('');
    return `${head}${groups}`;
}
/** The app's body under the header. */
export function collectionApp(g: Save, w: WorldDef, head: string): string {
    if (!collectionOn(w)) return `${head}<div class="mu-ph-body mu-cl"><p class="mu-muted">Nothing to collect in this world.</p></div>`;
    if (CL.game !== g.world + '|' + (g as any).seed) {
        // a game seen for the first time here: back to the first hall, the first group open, the last visit remembered
        CL.game = g.world + '|' + (g as any).seed; CL.hall = ''; CL.open = new Set(); CL.since = collectionOf(g)?.seen ?? -1;
    }
    const halls = recordView(g, w);
    if (!halls.length) return `${head}<div class="mu-ph-body mu-cl"><p class="mu-muted">Nothing to collect yet.</p></div>`;
    const h = halls.find(x => x.id === CL.hall) ?? halls[0];
    if (!CL.open.size && h.groups[0]) CL.open.add(`${h.id}/${h.groups[0].id}`);
    const tabs = halls.length > 1 ? `<nav class="mu-cl-tabs">${halls.map(x => `<button class="${x.id === h.id ? 'is-on' : ''}" data-act="cl-hall" data-v="${esc(x.id)}" aria-pressed="${x.id === h.id}"><i aria-hidden="true">${esc(x.icon ?? '')}</i><span data-notr>${esc(x.name)}</span></button>`).join('')}</nav>` : `<h3 class="mu-cl-hname"><i aria-hidden="true">${esc(h.icon ?? '')}</i> <span data-notr>${esc(h.name)}</span></h3>`;
    return `${head}<div class="mu-ph-body mu-cl">${tabs}${hallHtml(g, w, h)}</div>`;
}
/** Opening the app: the record catches up first (a click since the hour may have filled something), the last visit
 *  is remembered for "Just in", and this visit is the new last one. */
export function openCollection(g: Save, w: WorldDef) {
    if (!collectionOn(w)) return;
    settleCollection(g, w);
    CL.game = g.world + '|' + (g as any).seed; CL.since = collectionOf(g)?.seen ?? -1;
    markSeen(g);
}

Object.assign(ACT, {
    'cl-hall': (el) => { CL.hall = el.dataset.v ?? ''; CL.open = new Set(); notify(); },
    'cl-fold': (el) => { const k = el.dataset.v ?? ''; if (CL.open.has(k)) CL.open.delete(k); else CL.open.add(k); notify(); },
});
