// The Shop app (phone, system `shop`): what money buys, in tabs by category (only the ones with something offered;
// Adult and Explicit only with adult content on), Here at a place that sells (its stock, and the gifts sold there as
// keepsakes), and Yours (kept things, services with the days left, stock with the uses left). A card: icon, name,
// description, price, what the engine says the item does, and Buy / Owned / Buy again. Items whose `when` doesn't hold
// are hidden; a category with some says "More by invitation." once. Also the HUD's "Shop here" row at such a place.
// The engine owns every number (sim/shop.ts); this file only draws and calls.
import { esc, game, toast, notify, saveGame, adultOn, SAVE } from '../core/store.js';
import { getWorld, systemOn } from '../core/world.js';
import { num } from '../core/safe.js';
import { money } from '../sim/needs.js';
import { refreshPrompt } from '../sim/prompt.js';
import { placeOf } from '../sim/places.js';
import { giftsForSale, giftPrice } from '../sim/social.js';
import * as S from '../sim/shop.js';
import { SHOP_CATS, shopItems, offers, ownedDefs, hasItem, catOf } from '../sim/shop.js';
import { ACT } from './reg.js';
import { itemDoes, isKept as kept, whyNotBuy as whyNot, moreByInvitation as invitedCats, daysLeft as daysOf, stockLeft as stockOf, shopPrice as priceAt, buy as buyAt } from '../sim/shop.js';
const offeredAt = offers;
/** What the app shows (memory only): the tab (`here`, `yours` or a category id; '' picks the first there is). */
export const SH = { tab: '' };
SAVE.hooks.push(() => { SH.tab = ''; });
const catShown = (g, c) => !c.adult || adultOn(g);
const peek = (g) => (g.shop ?? {});
const plural = (n, one, many) => (n === 1 ? one : many.replace('{0}', String(n)));
/** The phone's place: the place you're at, when the shop sells something there (or a gift is sold there). */
const herePlace = (g, w) => (systemOn(w, 'shop') && g.player.loc && g.player.loc !== 'online' && (offeredAt(g, w, g.player.loc).length || giftsForSale(g, w).length) ? g.player.loc : '');
/** How many of the shop's things are offered where you are (0 elsewhere, or with the system off). */
export const shopHereCount = (g, w) => (systemOn(w, 'shop') && g.player.loc ? offeredAt(g, w, g.player.loc).length : 0);
/* ---------- a card ---------- */
function leftWords(g, it) {
    const d = daysOf(g, it.id), stock = stockOf(g, it.id);
    if (d > 0)
        return plural(d, '1 day left', '{0} days left');
    if (stock > 0)
        return plural(stock, '1 left', '{0} left');
    return '';
}
function card(g, w, it, where, canBuy = true) {
    const price = priceAt(g, w, it, where), why = whyNot(g, w, it, where);
    const owned = kept(it) && hasItem(g, it.id), left = leftWords(g, it);
    const again = !kept(it) && (!!left || num(peek(g).bought?.[it.id]) > 0);
    const does = itemDoes(g, w, it).map(t => `<li>${esc(t)}</li>`).join('');
    const act = owned ? '<em>Owned</em>'
        : canBuy ? `<button data-act="shop-buy" data-id="${esc(it.id)}" data-where="${esc(where)}" ${why ? `aria-disabled="true" title="${esc(why.replace(/\.$/, ''))}"` : ''}>${again ? 'Buy again' : 'Buy'}</button>` : '';
    return `<article class="mu-shop-item ${owned ? 'is-owned' : ''}" data-item="${esc(it.id)}"><i>${esc(it.icon ?? '')}</i>
        <span><b data-notr>${esc(it.name)}</b>${it.desc ? `<small data-notr>${esc(it.desc)}</small>` : ''}${does ? `<ul class="mu-shop-does">${does}</ul>` : ''}
        <small class="mu-shop-price">${esc(money(w, price))}</small>${left ? `<small class="mu-shop-left">${esc(left)}</small>` : ''}</span>${act}</article>`;
}
// A gift sold at the place as a keepsake (its "Buy a gift" row in the scene does the same).
function giftCard(g, w, k) {
    const price = giftPrice(g, w, k), poor = num(g.player.money) < price;
    return `<article class="mu-shop-item" data-item="${esc(k.id)}"><i>${esc(k.icon ?? '')}</i><span><b data-notr>${esc(k.name)}</b>${k.desc ? `<small data-notr>${esc(k.desc)}</small>` : ''}
        <small class="mu-shop-price">${esc(money(w, price))}</small></span>
        <button data-act="buy-gift" data-id="${esc(k.id)}" ${poor ? 'aria-disabled="true" title="Not enough money"' : ''}>Buy</button></article>`;
}
// (cheapest first, as a shop window would)
const cheapestFirst = (g, w, where, list) => list.map(it => ({ it, p: priceAt(g, w, it, where) })).sort((a, b) => a.p - b.p).map(x => x.it);
const invite = '<p class="mu-muted mu-shop-invite">More by invitation.</p>';
/* ---------- the tabs ---------- */
function tabsOf(g, w, place) {
    const on = offeredAt(g, w, 'online');
    return [
        ...(place ? [{ id: 'here', name: 'Here', icon: '📍' }] : []),
        ...SHOP_CATS.filter(c => catShown(g, c) && on.some(it => catOf(it) === c.id)).map(c => ({ id: c.id, name: c.name, icon: c.icon })),
        { id: 'yours', name: 'Yours', icon: '🧺' },
    ];
}
function catTab(g, w, cat) {
    const on = cheapestFirst(g, w, 'online', offeredAt(g, w, 'online').filter(it => catOf(it) === cat));
    return `${on.map(it => card(g, w, it, 'online')).join('')}${invitedCats(g, w, 'online').includes(cat) ? invite : ''}`;
}
function hereTab(g, w, place) {
    const on = cheapestFirst(g, w, place, offeredAt(g, w, place).filter(it => catShown(g, S.shopCat(it))));
    const hidden = invitedCats(g, w, place).some(c => catShown(g, SHOP_CATS.find(x => x.id === c) ?? SHOP_CATS[0]));
    const gifts = giftsForSale(g, w, place);
    const name = placeOf(g, w, place)?.name ?? '';
    return `<p class="mu-shop-where"><small>Sold at</small> <b data-notr>${esc(name)}</b></p>${on.map(it => card(g, w, it, place)).join('')}${hidden ? invite : ''}
        ${gifts.length ? `<h4 class="mu-shop-sub">Gifts sold here</h4>${gifts.map(k => giftCard(g, w, k)).join('')}` : ''}`;
}
function yoursTab(g, w) {
    const mine = ownedDefs(g, w).filter(it => catShown(g, S.shopCat(it)));
    if (!mine.length)
        return '<p class="mu-muted">Nothing bought yet.</p>';
    // (a service or stock can be bought again from here, where it's sold online)
    const online = new Set(offeredAt(g, w, 'online').map(it => it.id));
    return SHOP_CATS.filter(c => mine.some(it => catOf(it) === c.id)).map(c => `<h4 class="mu-shop-sub">${esc(c.icon)} ${esc(c.name)}</h4>${mine.filter(it => catOf(it) === c.id).map(it => card(g, w, it, 'online', online.has(it.id))).join('')}`).join('');
}
/* ---------- the app ---------- */
/** The Shop app: the tabs and the one open. */
export function shopApp(g, w, head) {
    if (!systemOn(w, 'shop') || !shopItems(w).length)
        return `${head}<div class="mu-ph-body mu-shop"><p class="mu-muted">Nothing for sale in this world.</p></div>`;
    const place = herePlace(g, w), tabs = tabsOf(g, w, place);
    const tab = tabs.find(t => t.id === SH.tab)?.id ?? (tabs.length > 1 ? tabs[0].id : 'yours');
    const body = tab === 'here' ? hereTab(g, w, place) : tab === 'yours' ? yoursTab(g, w) : catTab(g, w, tab);
    return `${head}<div class="mu-ph-body mu-shop">
        <nav class="mu-shop-tabs" data-keep="shop-tabs">${tabs.map(t => `<button class="${t.id === tab ? 'is-on' : ''}" data-act="sh-tab" data-v="${esc(t.id)}" aria-pressed="${t.id === tab}"><i>${esc(t.icon)}</i><span>${esc(t.name)}</span></button>`).join('')}</nav>
        <div class="mu-shop-list">${body}</div></div>`;
}
/* ---------- the HUD's row at a place that sells ---------- */
/** "Shop here" in the scene's things to do, where the shop sells something (beside "Buy a gift"); it opens the
 *  phone's Shop app on Here. */
export function shopHereRows(g, w) {
    const n = shopHereCount(g, w);
    return n ? [`<button class="mh-act mh-glass mh-shop-here" data-act="ph-open-shop"><i>🛒</i><b>Shop here</b><small>${esc(plural(n, '1 for sale', '{0} for sale'))}</small></button>`] : [];
}
Object.assign(ACT, {
    'sh-tab': (el) => { SH.tab = el.dataset.v ?? ''; notify(); },
    'shop-buy': (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const err = buyAt(g, w, el.dataset.id, el.dataset.where || 'online');
        if (err) {
            toast(err, 'info');
            return;
        }
        toast('Bought!', 'success');
        saveGame();
        refreshPrompt();
        notify();
    },
});
