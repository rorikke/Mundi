// The Shop app (phone, system `shop`): what money buys, in tabs by category (only the ones with something offered;
// Adult and Explicit only with adult content on), Here at a place that sells (its stock, and the gifts sold there as
// keepsakes), and Yours (kept things, services with the days left, stock with the uses left). A card: icon, name,
// description, price, what the engine says the item does, and Buy / Owned / Buy again; tapping its picture opens it large. Items whose `when` doesn't hold
// are hidden; a category with some says "More by invitation." once. Hide owned leaves out the kept things you have.
// Unfolded, like Messages: your money and the tabs as a list on the left (how many for sale, how many yours), the tab's
// cards side by side on the right. Also the HUD's "Shop here" row at such a place. The engine owns every number
// (sim/shop.ts); this file only draws and calls.
import { esc, game, toast, notify, saveGame, adultOn, SAVE } from '../core/store.js';
import { getWorld, systemOn } from '../core/world.js';
import { num } from '../core/safe.js';
import { money } from '../sim/needs.js';
import { refreshPrompt } from '../sim/prompt.js';
import { placeOf } from '../sim/places.js';
import { giftsForSale, giftPrice } from '../sim/social.js';
import * as S from '../sim/shop.js';
import { SHOP_CATS, shopItems, offers, ownedDefs, hasItem, catOf } from '../sim/shop.js';
import { ACT, INPUT } from './reg.js';
import { itemDoes, isKept as kept, whyNotBuy as whyNot, moreByInvitation as invitedCats, daysLeft as daysOf, serviceLeft, stockLeft as stockOf, shopPrice as priceAt, buy as buyAt } from '../sim/shop.js';
import { itemIco } from './itempic.js';
const offeredAt = offers;
/** What the app shows (memory only): the tab (`here`, `yours` or a category id; '' picks the first there is), and
 *  Hide owned. */
export const SH = { tab: '', hideOwned: false };
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
        return d === 1 ? '1 day left' : serviceLeft(d);
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
    return `<article class="mu-shop-item ${owned ? 'is-owned' : ''}" data-item="${esc(it.id)}">${itemIco(w, it, '', true)}
        <span><b data-notr>${esc(it.name)}</b>${it.desc ? `<small data-notr>${esc(it.desc)}</small>` : ''}${does ? `<ul class="mu-shop-does">${does}</ul>` : ''}
        <small class="mu-shop-price">${esc(money(w, price))}</small>${left ? `<small class="mu-shop-left">${esc(left)}</small>` : ''}</span>${act}</article>`;
}
// A gift sold at the place as a keepsake (its "Buy a gift" row in the scene does the same).
function giftCard(g, w, k) {
    const price = giftPrice(g, w, k), poor = num(g.player.money) < price;
    return `<article class="mu-shop-item" data-item="${esc(k.id)}">${itemIco(w, k, '', true)}<span><b data-notr>${esc(k.name)}</b>${k.desc ? `<small data-notr>${esc(k.desc)}</small>` : ''}
        <small class="mu-shop-price">${esc(money(w, price))}</small></span>
        <button data-act="buy-gift" data-id="${esc(k.id)}" ${poor ? 'aria-disabled="true" title="Not enough money"' : ''}>Buy</button></article>`;
}
// (cheapest first, as a shop window would)
const cheapestFirst = (g, w, where, list) => list.map(it => ({ it, p: priceAt(g, w, it, where) })).sort((a, b) => a.p - b.p).map(x => x.it);
const invite = '<p class="mu-muted mu-shop-invite">More by invitation.</p>';
// A kept thing you have (left out with Hide owned; services and stock can always be bought again).
const isOwned = (g, it) => kept(it) && hasItem(g, it.id);
const unowned = (g, list) => (SH.hideOwned ? list.filter(it => !isOwned(g, it)) : list);
const allOwned = '<p class="mu-muted mu-shop-allown">You own everything here.</p>';
const hideToggle = () => `<label class="mu-shop-hide"><input type="checkbox" data-input="sh-hide" ${SH.hideOwned ? 'checked' : ''}><span>${esc('Hide owned')}</span></label>`;
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
    const all = offeredAt(g, w, 'online').filter(it => catOf(it) === cat), on = cheapestFirst(g, w, 'online', unowned(g, all));
    return `${on.length || !all.length ? on.map(it => card(g, w, it, 'online')).join('') : allOwned}${invitedCats(g, w, 'online').includes(cat) ? invite : ''}`;
}
function hereTab(g, w, place) {
    const all = offeredAt(g, w, place).filter(it => catShown(g, S.shopCat(it))), on = cheapestFirst(g, w, place, unowned(g, all));
    const hidden = invitedCats(g, w, place).some(c => catShown(g, SHOP_CATS.find(x => x.id === c) ?? SHOP_CATS[0]));
    const gifts = giftsForSale(g, w, place);
    const name = placeOf(g, w, place)?.name ?? '';
    return `<p class="mu-shop-where"><small>Sold at</small> <b data-notr>${esc(name)}</b></p>${on.length || !all.length ? on.map(it => card(g, w, it, place)).join('') : allOwned}${hidden ? invite : ''}
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
// How many a tab holds, for the unfolded list: for sale (and how many of them are yours), or yours.
function tabCount(g, w, id, place) {
    if (id === 'yours')
        return String(ownedDefs(g, w).filter(it => catShown(g, S.shopCat(it))).length);
    const list = id === 'here' ? offeredAt(g, w, place).filter(it => catShown(g, S.shopCat(it))) : offeredAt(g, w, 'online').filter(it => catOf(it) === id);
    const n = list.length + (id === 'here' ? giftsForSale(g, w, place).length : 0), mine = list.filter(it => isOwned(g, it)).length;
    return mine ? `${mine}/${n}` : String(n);
}
// Unfolded: your money and the tabs on the left, the open tab's cards on the right (its key changes with the tab, so
// each opens at its top).
function wideShop(g, w, head, tabs, tab, place, body) {
    const t = tabs.find(x => x.id === tab);
    const rows = tabs.map(x => `<button class="mu-shop-row ${x.id === tab ? 'is-on' : ''}" data-act="sh-tab" data-v="${esc(x.id)}" aria-pressed="${x.id === tab}">
        <i aria-hidden="true">${esc(x.icon)}</i><b>${esc(x.name)}</b><small>${esc(tabCount(g, w, x.id, place))}</small></button>`).join('');
    return `${head}<div class="mu-ph-split mu-shop-split"><div class="mu-ph-pane is-list" data-keep="sh-pane-list"><div class="mu-ph-body mu-shop">
            <section class="mu-ph-card mu-shop-wallet"><small>${esc('Your money')}</small><b>${esc(money(w, num(g.player.money)))}</b></section>
            ${tab === 'yours' ? '' : hideToggle()}<nav class="mu-shop-rows">${rows}</nav></div></div>
        <div class="mu-ph-pane is-open" data-keep="sh-pane-${esc(tab)}"><div class="mu-ph-body mu-shop">
            <h3 class="mu-shop-title"><i aria-hidden="true">${esc(t.icon)}</i><b>${esc(t.name)}</b></h3><div class="mu-shop-list is-grid">${body}</div></div></div></div>`;
}
/** The Shop app: the tabs and the one open; `wide`: the unfolded phone (the tabs listed beside the open one). */
export function shopApp(g, w, head, wide = false) {
    if (!systemOn(w, 'shop') || !shopItems(w).length)
        return `${head}<div class="mu-ph-body mu-shop"><p class="mu-muted">Nothing for sale in this world.</p></div>`;
    const place = herePlace(g, w), tabs = tabsOf(g, w, place);
    const tab = tabs.find(t => t.id === SH.tab)?.id ?? (tabs.length > 1 ? tabs[0].id : 'yours');
    const body = tab === 'here' ? hereTab(g, w, place) : tab === 'yours' ? yoursTab(g, w) : catTab(g, w, tab);
    if (wide)
        return wideShop(g, w, head, tabs, tab, place, body);
    return `${head}<div class="mu-ph-body mu-shop">
        <nav class="mu-shop-tabs" data-keep="shop-tabs">${tabs.map(t => `<button class="${t.id === tab ? 'is-on' : ''}" data-act="sh-tab" data-v="${esc(t.id)}" aria-pressed="${t.id === tab}"><i>${esc(t.icon)}</i><span>${esc(t.name)}</span></button>`).join('')}</nav>
        ${tab === 'yours' ? '' : hideToggle()}<div class="mu-shop-list">${body}</div></div>`;
}
/* ---------- the HUD's row at a place that sells ---------- */
/** "Shop here" in the scene's things to do, where the shop sells something (beside "Buy a gift"); it opens the
 *  phone's Shop app on Here. */
export function shopHereRows(g, w) {
    const n = shopHereCount(g, w);
    return n ? [`<button class="mh-act mh-glass mh-shop-here" data-act="ph-open-shop"><i>🛒</i><b>Shop here</b><small>${esc(plural(n, '1 for sale', '{0} for sale'))}</small></button>`] : [];
}
Object.assign(INPUT, { 'sh-hide': (el) => { SH.hideOwned = el.checked; notify(); } });
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
