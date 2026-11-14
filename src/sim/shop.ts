// The lifestyle shop: what the world sells (catalogs.shop), what you have, and what having it does. Vehicles shorten
// trips, a good bed lifts your mood each morning, and some items unlock things to do (an action with `needsItem`).
// Everything that reads what you own goes through `ownedDefs` (the `thingsOwned` hook in sim/hooks.ts), so a home's
// rooms and fixtures can join later in the same shape. sim/life.ts re-exports the older names for its callers.
import { adultOk, nowAbs, type Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import type { ShopItem } from '../core/presets.js';
import type { EffectDef } from '../core/traits.js';
import { priceOf } from './bills.js';
import { priceHere } from './worldstate.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { playerHomeId } from './places.js';
import { lifeOf } from './life.js';
import { thingsOwned } from './hooks.js';
import { effectSources } from './effects.js';

export type Item = ShopItem;

/* ---------- categories and limits ---------- */

/** A category of the shop: its English name and icon, when the AI is told of what you own in it, and whether it's
 *  adult content (shown only with adult content on). */
export interface ShopCat { id: string; name: string; icon: string; told: 'always' | 'home' | 'no'; adult?: boolean }
/** The categories, in the order the Shop app shows them. A fixed list: a world's items name one of these. */
export const SHOP_CATS: ShopCat[] = [
    { id: 'home', name: 'Home & furniture', icon: '🛋️', told: 'home' },
    { id: 'kitchen', name: 'Kitchen', icon: '🍳', told: 'home' },
    { id: 'tech', name: 'Tech', icon: '💻', told: 'home' },
    { id: 'hobby', name: 'Hobbies & instruments', icon: '🎸', told: 'home' },
    { id: 'fashion', name: 'Fashion & accessories', icon: '👜', told: 'always' },
    { id: 'vehicle', name: 'Vehicles', icon: '🚲', told: 'always' },
    { id: 'luxury', name: 'Luxury', icon: '💎', told: 'always' },
    { id: 'wellness', name: 'Wellness & services', icon: '🧖', told: 'home' },
    { id: 'gift', name: 'Gifts to give', icon: '🎁', told: 'no' },
    { id: 'adult', name: 'Adult', icon: '🌹', told: 'home', adult: true },
    { id: 'explicit', name: 'Explicit', icon: '🔞', told: 'home', adult: true },
];
/** How far one item's effects may go (per kind and target only the best item counts): a share for `mul` kinds
 *  (±10%), an amount for `add` kinds (±1). */
export const SHOP_LIMITS = { mul: 0.1, add: 1 };

// The defaults of an item's optional fields (core/presets.ts), read here so worlds stay as they were written.
/** Its category: the one it names, `vehicle` when it has `travel`, else `home` (an unknown one reads as `home`). */
export const catOf = (it: Item): string => (it.cat ? (SHOP_CATS.some(c => c.id === it.cat) ? it.cat : 'home') : Number(it.travel) > 0 ? 'vehicle' : 'home');
export const shopCat = (it: Item): ShopCat => SHOP_CATS.find(c => c.id === catOf(it))!;
/** Sold in the phone's Shop app: as it says, else when it isn't sold at places. */
export const onlineOf = (it: Item): boolean => it.online ?? !it.at?.length;
/** When the AI is told of it: as it says, else as its category. */
export const toldOf = (it: Item): 'always' | 'home' | 'no' => it.told ?? shopCat(it).told;

/* ---------- the save ---------- */

/** What the shop keeps in the save besides `player.items` (the kept things): when each service ends (`until`, an
 *  absolute minute), the uses left of each stock item, how many times each was bought, the money spent by category,
 *  and who knows of which put-away adult item (`known[avatar]`: item ids). */
export interface ShopState { until: Record<string, number>; stock: Record<string, number>; bought: Record<string, number>; spent: Record<string, number>; known: Record<string, string[]> }
/** The shop's part of the save, for writing: created when first written, each part read with a default. */
export function shopOf(g: Save): ShopState {
    const s = ((g as any).shop ??= {}) as Partial<ShopState>;
    s.until ??= {}; s.stock ??= {}; s.bought ??= {}; s.spent ??= {}; s.known ??= {};
    return s as ShopState;
}
// For reading: the same, without writing anything into a save that has bought nothing yet.
const peek = (g: Save): Partial<ShopState> => ((g as any).shop ?? {}) as Partial<ShopState>;

/* ---------- what's sold, and buying ---------- */

export const shopItems = (w: WorldDef): Item[] => (systemOn(w, 'shop') ? (w.catalogs as any).shop ?? [] : []) as Item[];
/** A kept thing you bought (`player.items`). */
export const hasItem = (g: Save, id: string) => lifeOf(g).items.includes(id);
// What an item costs now: the difficulty, then the prices where you live (the living world).
export const shopPrice = (g: Save, w: WorldDef, it: Item) => Math.round(priceOf(g, it.price) * priceHere(g, w, playerHomeId));
/** What's offered `where` (`'online'`: the phone's Shop app; or a place id). For now every item online, as the Shop app
 *  has always listed them, and nothing at a place. */
export function offers(g: Save, w: WorldDef, where: string): Item[] {
    return where === 'online' ? shopItems(w) : [];
}
export function buy(g: Save, w: WorldDef, id: string): string {
    const it = shopItems(w).find(x => x.id === id);
    if (!it) return '';
    if (hasItem(g, id)) return 'You already have it.';
    const price = shopPrice(g, w, it);
    if (g.player.money < price) return 'Not enough money.';
    g.player.money -= price; book(g, it.name, -price);
    lifeOf(g).items.push(id);
    note(g, '{u} bought: {0}.', [it.name], [], g.player.loc, 'shop');
    return '';
}

/* ---------- what you have ---------- */

// Holding an item of the shop: kept, a service not yet ended, or stock left.
const holding = (g: Save, id: string) => hasItem(g, id) || (peek(g).until?.[id] ?? 0) > nowAbs(g) || (peek(g).stock?.[id] ?? 0) > 0;
// The shop's entry: its items you hold, with the shop on and (adult ones) adult content on.
thingsOwned.push((g, w) => shopItems(w).filter(it => holding(g, it.id) && adultOk(g, it)));
/** Everything you own that counts right now, in a shop item's shape, from every `thingsOwned` entry. */
export const ownedDefs = (g: Save, w: WorldDef): Item[] => thingsOwned.flatMap(f => f(g, w));
/** Do you have it (an action's `needsItem`): an item of the shop you hold, or anything else you own by that id. */
export const haveItem = (g: Save, w: WorldDef | null | undefined, id: string) => holding(g, id) || (!!w && ownedDefs(g, w).some(it => it.id === id));

// Vehicles shorten every trip (the best one you own).
// (a mount you keep well fed counts too)
export const travelFactor = (g: Save, w?: WorldDef | null) => (w ? Math.min(1, ...ownedDefs(g, w).map(it => (Number(it.travel) > 0 ? Number(it.travel) : 1)), ...mountSpeeds(g, w)) : 1);
const mountSpeeds = (g: Save, w: WorldDef) => ((w.features as any)?.mounts === false ? [] : ((g as any).pets ?? []).map((p: any) => { const d = (w.pets ?? []).find(x => x.id === p.kind); return d?.mount && p.hunger > 20 ? Math.max(0.3, (d.speed ?? 0.6) - (p.bound ? Math.min(0.2, (p.level ?? 1) * 0.02) : 0)) : 1; }));
// Mood gained when you wake up at home (a good bed…).
export const sleepMood = (g: Save, w: WorldDef) => ownedDefs(g, w).reduce((a, it) => a + (it.sleepMood ?? 0), 0);

/* ---------- what having it does ---------- */

/** The small effects of what you own (sim/effects.ts). Nothing yet. */
export function shopEffects(_g: Save, _w: WorldDef): EffectDef[] { return []; }
effectSources.push(shopEffects);
/** What the AI is told of what you own (sim/prompt.ts, after the ventures' line). Nothing yet. */
export function shopLine(_g: Save, _w: WorldDef): string { return ''; }
