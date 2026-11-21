// An item's picture in a list or a card (keepsakes, shop items, home fixtures, rewards, museum upgrades): the picture
// inside the `<i>` the layouts already size for an emoji, marked `has-pic` so css/99z-itempics.css can make room for it,
// or the emoji when the item has no picture.
import type { WorldDef } from '../core/world.js';
import { itemPic } from '../core/world.js';
import { esc } from '../core/store.js';

export function itemIco(w: WorldDef | null | undefined, it: { icon?: string; pic?: string; keepsake?: string } | null | undefined, fallback = ''): string {
    const src = w && it ? itemPic(w, it) : '';
    return src ? `<i class="has-pic" aria-hidden="true"><img src="${esc(src)}" alt="" loading="lazy" decoding="async"></i>`
        : `<i aria-hidden="true">${esc(it?.icon || fallback)}</i>`;
}
