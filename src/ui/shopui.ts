// The Shop app (phone, system `shop`): what money buys, in tabs by category (only the ones with something offered;
// Adult and Explicit only with adult content on), Here at a place that sells (its stock, and the gifts sold there as
// keepsakes), and Yours (kept things, services with the days left, stock with the uses left). A card: icon, name,
// description, price, what the engine says the item does, and Buy / Owned / Buy again. Items whose `when` doesn't hold
// are hidden; a category with some says "More by invitation." once. Also the HUD's "Shop here" row at such a place.
// The engine owns every number (sim/shop.ts); this file only draws and calls.
import { esc, game, toast, notify, saveGame, nowAbs, adultOn, adultOk, SAVE, type Save } from '../core/store.js';
import { getWorld, systemOn, type WorldDef, type KeepsakeDef } from '../core/world.js';
import { num } from '../core/safe.js';
import { money } from '../sim/needs.js';
import { refreshPrompt } from '../sim/prompt.js';
import { placeOf } from '../sim/places.js';
import { giftsForSale, giftPrice } from '../sim/social.js';
import { whenHolds } from '../sim/when.js';
import { openNow } from '../sim/daynight.js';
import * as S from '../sim/shop.js';
import { SHOP_CATS, shopItems, offers, ownedDefs, hasItem, catOf, onlineOf, type Item, type ShopCat, type ShopState } from '../sim/shop.js';
import { ACT } from './reg.js';

/* ---------- until A: the engine's pieces that aren't on this branch yet ---------- */
// until A: `itemDoes`, and `where` on `shopPrice` and `buy`, are session A's (plans/shop.md). Until they're merged,
// these call A's version when it's there and stand in for it otherwise; the merge deletes this block and the calls
// below use sim/shop.ts directly.
// until A
const itemDoes = (g: Save, w: WorldDef, it: Item): string[] => ((S as any).itemDoes ? (S as any).itemDoes(g, w, it) : doesStandIn(w, it));
// until A
const priceAt = (g: Save, w: WorldDef, it: Item, where: string): number => (S.shopPrice as any)(g, w, it, where);
// until A
const buyAt = (g: Save, w: WorldDef, id: string, where: string): string => (S.buy as any)(g, w, id, where);
// until A: S0's `offers` lists every item online and nothing at a place; A's filters by adult content, `when`, where
// it's sold and the place's hours. Filtering again here changes nothing once A's is in.
const offeredAt = (g: Save, w: WorldDef, where: string): Item[] => {
    const list = where === 'online' ? offers(g, w, where) : (offers(g, w, where).length ? offers(g, w, where) : shopItems(w));
    return list.filter(it => soldAt(g, w, it, where) && whenHolds(g, w, it.when ?? null));
};
// until A: what the engine will say an item does, from the fields alone.
function doesStandIn(w: WorldDef, it: Item): string[] {
    const out: string[] = [];
    const travel = num(it.travel);
    if (travel > 0 && travel < 1) out.push(`Trips take ${Math.round((1 - travel) * 100)}% less time`);
    if (it.late) out.push('Drive after the last train');
    if (num(it.sleepMood) > 0) out.push(`Mood +${num(it.sleepMood)} on waking at home`);
    const acts = (w.actions ?? []).filter(a => a.needsItem === it.id).map(a => a.label);
    if (acts.length) out.push(`Unlocks: ${acts.join(', ')}`);
    if (num(it.repeat?.days) > 0) out.push(num(it.repeat?.days) === 1 ? 'Lasts a day' : `Lasts ${num(it.repeat?.days)} days`);
    if (num(it.repeat?.stock) > 0) out.push(`${num(it.repeat?.stock)} uses`);
    const k = it.keepsake && (w.keepsakes ?? []).find(x => x.id === it.keepsake);
    if (k) out.push(`Gives: ${k.name}`);
    return out;
}
/* ---------- (end of until A) ---------- */

/** What the app shows (memory only): the tab (`here`, `yours` or a category id; '' picks the first there is). */
export const SH = { tab: '' };
SAVE.hooks.push(() => { SH.tab = ''; });

// Sold `where` as far as the item says (online, or at that place while it's open), adult items only with adult
// content on. Whether its `when` holds is left out: that's what tells offered from "by invitation".
const soldAt = (g: Save, w: WorldDef, it: Item, where: string) => adultOk(g, it) && (where === 'online' ? onlineOf(it) : (it.at ?? []).includes(where) && openNow(g, w, where));
const catShown = (g: Save, c: ShopCat) => !c.adult || adultOn(g);
const peek = (g: Save): Partial<ShopState> => ((g as any).shop ?? {}) as Partial<ShopState>;
// (a kept thing is bought once; a service, stock or a gift is bought again)
const kept = (it: Item) => !it.repeat && !it.keepsake;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('{0}', String(n)));

/** The phone's place: the place you're at, when the shop sells something there (or a gift is sold there). */
const herePlace = (g: Save, w: WorldDef): string => (systemOn(w, 'shop') && g.player.loc && g.player.loc !== 'online' && (offeredAt(g, w, g.player.loc).length || giftsForSale(g, w).length) ? g.player.loc : '');

/** How many of the shop's things are offered where you are (0 elsewhere, or with the system off). */
export const shopHereCount = (g: Save, w: WorldDef): number => (systemOn(w, 'shop') && g.player.loc ? offeredAt(g, w, g.player.loc).length : 0);

/* ---------- a card ---------- */

function leftWords(g: Save, it: Item): string {
    const s = peek(g), until = num(s.until?.[it.id]), stock = num(s.stock?.[it.id]);
    if (until > nowAbs(g)) { const d = Math.ceil((until - nowAbs(g)) / 1440); return plural(d, 'Ends today', '{0} days left'); }
    if (stock > 0) return plural(stock, '1 left', '{0} left');
    return '';
}
function card(g: Save, w: WorldDef, it: Item, where: string, canBuy = true): string {
    const price = priceAt(g, w, it, where), poor = num(g.player.money) < price;
    const owned = kept(it) && hasItem(g, it.id), left = leftWords(g, it);
    const again = !kept(it) && (!!left || num(peek(g).bought?.[it.id]) > 0);
    const does = itemDoes(g, w, it).map(t => `<li>${esc(t)}</li>`).join('');
    const act = owned ? '<em>Owned</em>'
        : canBuy ? `<button data-act="shop-buy" data-id="${esc(it.id)}" data-where="${esc(where)}" ${poor ? 'aria-disabled="true" title="Not enough money"' : ''}>${again ? 'Buy again' : 'Buy'}</button>` : '';
    return `<article class="mu-shop-item ${owned ? 'is-owned' : ''}" data-item="${esc(it.id)}"><i>${esc(it.icon ?? '')}</i>
        <span><b data-notr>${esc(it.name)}</b>${it.desc ? `<small data-notr>${esc(it.desc)}</small>` : ''}${does ? `<ul class="mu-shop-does">${does}</ul>` : ''}
        <small class="mu-shop-price">${esc(money(w, price))}</small>${left ? `<small class="mu-shop-left">${esc(left)}</small>` : ''}</span>${act}</article>`;
}
// A gift sold at the place as a keepsake (its "Buy a gift" row in the scene does the same).
function giftCard(g: Save, w: WorldDef, k: KeepsakeDef): string {
    const price = giftPrice(g, w, k), poor = num(g.player.money) < price;
    return `<article class="mu-shop-item" data-item="${esc(k.id)}"><i>${esc(k.icon ?? '')}</i><span><b data-notr>${esc(k.name)}</b>${k.desc ? `<small data-notr>${esc(k.desc)}</small>` : ''}
        <small class="mu-shop-price">${esc(money(w, price))}</small></span>
        <button data-act="buy-gift" data-id="${esc(k.id)}" ${poor ? 'aria-disabled="true" title="Not enough money"' : ''}>Buy</button></article>`;
}
// (cheapest first, as a shop window would)
const cheapestFirst = (g: Save, w: WorldDef, where: string, list: Item[]) => list.map(it => ({ it, p: priceAt(g, w, it, where) })).sort((a, b) => a.p - b.p).map(x => x.it);
const invite = '<p class="mu-muted mu-shop-invite">More by invitation.</p>';

/* ---------- the tabs ---------- */

function tabsOf(g: Save, w: WorldDef, place: string): { id: string; name: string; icon: string }[] {
    const on = offeredAt(g, w, 'online');
    return [
        ...(place ? [{ id: 'here', name: 'Here', icon: '📍' }] : []),
        ...SHOP_CATS.filter(c => catShown(g, c) && on.some(it => catOf(it) === c.id)).map(c => ({ id: c.id, name: c.name, icon: c.icon })),
        { id: 'yours', name: 'Yours', icon: '🧺' },
    ];
}
function catTab(g: Save, w: WorldDef, cat: string): string {
    const on = cheapestFirst(g, w, 'online', offeredAt(g, w, 'online').filter(it => catOf(it) === cat));
    const ids = new Set(on.map(it => it.id));
    const hidden = shopItems(w).some(it => catOf(it) === cat && !ids.has(it.id) && soldAt(g, w, it, 'online'));
    return `${on.map(it => card(g, w, it, 'online')).join('')}${hidden ? invite : ''}`;
}
function hereTab(g: Save, w: WorldDef, place: string): string {
    const on = cheapestFirst(g, w, place, offeredAt(g, w, place).filter(it => catShown(g, S.shopCat(it))));
    const ids = new Set(on.map(it => it.id));
    const hidden = shopItems(w).some(it => !ids.has(it.id) && soldAt(g, w, it, place));
    const gifts = giftsForSale(g, w, place);
    const name = placeOf(g, w, place)?.name ?? '';
    return `<p class="mu-shop-where"><small>Sold at</small> <b data-notr>${esc(name)}</b></p>${on.map(it => card(g, w, it, place)).join('')}${hidden ? invite : ''}
        ${gifts.length ? `<h4 class="mu-shop-sub">Gifts sold here</h4>${gifts.map(k => giftCard(g, w, k)).join('')}` : ''}`;
}
function yoursTab(g: Save, w: WorldDef): string {
    const mine = ownedDefs(g, w).filter(it => catShown(g, S.shopCat(it)));
    if (!mine.length) return '<p class="mu-muted">Nothing bought yet.</p>';
    // (a service or stock can be bought again from here, where it's sold online)
    const online = new Set(offeredAt(g, w, 'online').map(it => it.id));
    return SHOP_CATS.filter(c => mine.some(it => catOf(it) === c.id)).map(c => `<h4 class="mu-shop-sub">${esc(c.icon)} ${esc(c.name)}</h4>${mine.filter(it => catOf(it) === c.id).map(it => card(g, w, it, 'online', online.has(it.id))).join('')}`).join('');
}

/* ---------- the app ---------- */

/** The Shop app: the tabs and the one open. */
export function shopApp(g: Save, w: WorldDef, head: string): string {
    if (!systemOn(w, 'shop') || !shopItems(w).length) return `${head}<div class="mu-ph-body mu-shop"><p class="mu-muted">Nothing for sale in this world.</p></div>`;
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
export function shopHereRows(g: Save, w: WorldDef): string[] {
    const n = shopHereCount(g, w);
    return n ? [`<button class="mh-act mh-glass mh-shop-here" data-act="ph-open-shop"><i>🛒</i><b>Shop here</b><small>${esc(plural(n, '1 for sale', '{0} for sale'))}</small></button>`] : [];
}

Object.assign(ACT, {
    'sh-tab': (el) => { SH.tab = el.dataset.v ?? ''; notify(); },
    'shop-buy': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const err = buyAt(g, w, el.dataset.id!, el.dataset.where || 'online');
        if (err) { toast(err, 'info'); return; }
        toast('Bought!', 'success'); saveGame(); refreshPrompt(); notify();
    },
});
