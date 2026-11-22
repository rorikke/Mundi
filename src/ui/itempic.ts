// An item's picture in a list or a card (keepsakes, shop items, home fixtures, rewards, museum upgrades): the picture
// inside the `<i>` the layouts already size for an emoji, marked `has-pic` so css/99z-itempics.css can make room for it,
// or the emoji when the item has no picture. Where a picture can be looked at (the Shop app's cards, the keepsakes you
// have had in the Collection app) a tap opens it large over everything, with the item's name and description.
import type { WorldDef } from '../core/world.js';
import { itemPic } from '../core/world.js';
import { esc, notify } from '../core/store.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';

type ItemLike = { icon?: string; pic?: string; keepsake?: string; name?: string; desc?: string };

/** `look`: the picture opens large when tapped (no effect on an emoji). */
export function itemIco(w: WorldDef | null | undefined, it: ItemLike | null | undefined, fallback = '', look = false): string {
    const src = w && it ? itemPic(w, it) : '';
    if (!src) return `<i aria-hidden="true">${esc(it?.icon || fallback)}</i>`;
    const img = `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`;
    if (!look) return `<i class="has-pic" aria-hidden="true">${img}</i>`;
    return `<i class="has-pic is-look" role="button" tabindex="0" title="${esc('See it full size')}" data-act="iv-open" data-src="${esc(src)}"
        data-name="${esc(it?.name ?? '')}" data-desc="${esc(it?.desc ?? '')}">${img}</i>`;
}

/* ---------- the picture looked at ---------- */

// In memory only: the picture open, with its item's name and description (empty: closed).
const IV = { src: '', name: '', desc: '' };

/** The open picture over everything (drawn after the phone, so it sits above it). */
export function itemViewHtml(): string {
    if (!IV.src) return '';
    return `<div class="mu-itemview" data-act="iv-bg" role="dialog" aria-label="${esc(IV.name)}"><figure><img src="${esc(IV.src)}" alt="" draggable="false">
        ${IV.name || IV.desc ? `<figcaption>${IV.name ? `<b data-notr>${esc(IV.name)}</b>` : ''}${IV.desc ? `<small data-notr>${esc(IV.desc)}</small>` : ''}</figcaption>` : ''}</figure>
        <button class="mu-itemview-x" data-act="iv-close" title="Close">${icon('x')}</button></div>`;
}
/** Escape closes the open picture first (true when there was one). */
export function closeItemView(): boolean { if (!IV.src) return false; IV.src = ''; notify(); return true; }

// (the picture is a focusable role=button, so Enter and Space open it as a click would)
document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && t?.matches?.('#mundi-root i.is-look')) { e.preventDefault(); t.click(); }
});

Object.assign(ACT, {
    'iv-open': (el) => { Object.assign(IV, { src: el.dataset.src ?? '', name: el.dataset.name ?? '', desc: el.dataset.desc ?? '' }); notify(); },
    'iv-close': () => { closeItemView(); },
    'iv-bg': (el, e) => { if (e.target === el) closeItemView(); },
});
