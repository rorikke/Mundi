import { itemPic } from '../core/world.js';
import { esc } from '../core/store.js';
export function itemIco(w, it, fallback = '') {
    const src = w && it ? itemPic(w, it) : '';
    return src ? `<i class="has-pic" aria-hidden="true"><img src="${esc(src)}" alt="" loading="lazy" decoding="async"></i>`
        : `<i aria-hidden="true">${esc(it?.icon || fallback)}</i>`;
}
