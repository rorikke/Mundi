// The lifestyle shop: what the world sells (catalogs.shop), online or at the places that sell it, what you have, and
// what having it does. Vehicles shorten trips (a car drives you home after the last train), a good bed lifts your mood
// each morning, some items unlock things to do (an action with `needsItem`), services last some days, a case of wine
// holds six bottles, and a few things help a little (small effects, the best item per kind counting). The AI is told
// what you own in a line of its own (`shopLine`). Everything that reads what you own goes through `ownedDefs` (the
// `thingsOwned` hook in sim/hooks.ts), so a home's rooms and fixtures can join later in the same shape. There is no
// selling back and nothing is charged weekly. sim/life.ts re-exports the older names for its callers.
import { adultOn, nowAbs, toast, type Save } from '../core/store.js';
import { systemOn, type WorldDef, type ActionDef } from '../core/world.js';
import type { ShopItem } from '../core/presets.js';
import { cleanEffects, EFFECT_KINDS, type EffectDef } from '../core/traits.js';
import { priceOf } from './bills.js';
import { priceHere } from './worldstate.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { playerHomeId } from './places.js';
import { lifeOf } from './life.js';
import { thingsOwned, onDay, onHour, onAction, privateResults } from './hooks.js';
import { effectSources, effectMul } from './effects.js';
import { openNow } from './daynight.js';
import { whenHolds, parseWhen } from './when.js';
import { addStatus } from './needs.js';
import { addKeepsake, keepsakeDef, giftsGiven, drawnToYou } from './social.js';
import { earn } from './points.js';
import { presentAt } from './people.js';
import { skillName } from './hobbies.js';
import { sceneAct, isPrivateAct } from './actions.js';

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
/** The most a service's end may be ahead, in its own lengths (a week's flowers: two weeks at most). */
export const SHOP_AHEAD = 2;
/** A need changed at once by a purchase (a spa day): at most this much each way. */
export const SHOP_NOW_MAX = 40;
/** The chance, on a day someone spends time at your home with you, that they come across one of your put-away adult
 *  things they didn't know of (once per thing and person). */
export const SHOP_FIND = 0.1;
// How many things the AI is told of: out and about, at home, and adult things at home (one sentence).
const TOLD = { out: 3, home: 4, services: 3, adult: 3 };
// Kinds where less is better (a need draining slower, a lower price…): an item's best effect is its lowest.
const LOWER_IS_BETTER = new Set(['drain', 'price', 'risk', 'jealousy', 'fade']);

// The defaults of an item's optional fields (core/presets.ts), read here so worlds stay as they were written.
/** Its category: the one it names, `vehicle` when it has `travel`, else `home` (an unknown one reads as `home`). */
export const catOf = (it: Item): string => (it.cat ? (SHOP_CATS.some(c => c.id === it.cat) ? it.cat : 'home') : Number(it.travel) > 0 ? 'vehicle' : 'home');
export const shopCat = (it: Item): ShopCat => SHOP_CATS.find(c => c.id === catOf(it))!;
/** Sold in the phone's Shop app: as it says, else when it isn't sold at places. */
export const onlineOf = (it: Item): boolean => it.online ?? !it.at?.length;
/** When the AI is told of it: as it says, else as its category. */
export const toldOf = (it: Item): 'always' | 'home' | 'no' => it.told ?? shopCat(it).told;
/** Adult content: marked so, or in an adult category. */
export const isAdultItem = (it: Item) => !!it.adult || !!shopCat(it).adult;
const itemOk = (g: Save, it: Item) => !isAdultItem(it) || adultOn(g);
/** Kept for good once bought (into `player.items`): not a service, stock, something used at once or a gift to give. */
export const isKept = (it: Item) => !it.repeat && !it.keepsake && !it.now;
const daysOf = (it: Item) => Math.max(0, Math.round(Number(it.repeat?.days) || 0));
const stockOf = (it: Item) => Math.max(0, Math.round(Number(it.repeat?.stock) || 0));

/* ---------- the save ---------- */

/** What the shop keeps in the save besides `player.items` (the kept things): when each service ends (`until`, an
 *  absolute minute), the uses left of each stock item, how many times each was bought, the money spent by category,
 *  and who knows of which put-away adult item (`known[avatar]`: item ids). `looked[avatar]`: the last day they might
 *  have come across one; `found`: the last one found (who, what, when), told to the AI for a little while. */
export interface ShopState { until: Record<string, number>; stock: Record<string, number>; bought: Record<string, number>; spent: Record<string, number>; known: Record<string, string[]>;
    looked?: Record<string, number>; found?: { who: string; item: string; at: number } }
/** The shop's part of the save, for writing: created when first written, each part read with a default. */
export function shopOf(g: Save): ShopState {
    const s = ((g as any).shop ??= {}) as Partial<ShopState>;
    s.until ??= {}; s.stock ??= {}; s.bought ??= {}; s.spent ??= {}; s.known ??= {};
    return s as ShopState;
}
// For reading: the same, without writing anything into a save that has bought nothing yet.
const peek = (g: Save): Partial<ShopState> => ((g as any).shop ?? {}) as Partial<ShopState>;

/* ---------- what's sold ---------- */

export const shopItems = (w: WorldDef): Item[] => (systemOn(w, 'shop') ? (w.catalogs as any).shop ?? [] : []) as Item[];
// The catalog by id, kept with the list it was made from: made again when the list's length changes (an item added in
// the World creator) or an id isn't where it was (one renamed, or held but missing).
const byIdCache = new WeakMap<Item[], { n: number; map: Map<string, Item> }>();
function itemsById(w: WorldDef, fresh = false): Map<string, Item> {
    const list = shopItems(w), c = byIdCache.get(list);
    if (c && c.n === list.length && !fresh) return c.map;
    const map = new Map<string, Item>();
    for (const it of list) if (!map.has(it.id)) map.set(it.id, it);
    byIdCache.set(list, { n: list.length, map });
    return map;
}
/** A kept thing you bought (`player.items`). */
export const hasItem = (g: Save, id: string) => lifeOf(g).items.includes(id);
/** Days left of a service (rounded up; 0 when none is running). */
export const daysLeft = (g: Save, id: string) => Math.max(0, Math.ceil(((peek(g).until?.[id] ?? 0) - nowAbs(g)) / 1440));
/** Uses left of a stock item (a case of wine: bottles). */
export const stockLeft = (g: Save, id: string) => Math.max(0, peek(g).stock?.[id] ?? 0);
// Its `when` holds now (an item without one always does).
const invited = (g: Save, w: WorldDef, it: Item) => !it.when || whenHolds(g, w, it.when, { key: `shop|${it.id}` });
// Sold `where` ('online', or the place you're at while it's open), adult content aside.
function soldAt(g: Save, w: WorldDef, it: Item, where: string): boolean {
    if (where === 'online') return onlineOf(it);
    return g.player.loc === where && !!it.at?.includes(where) && openNow(g, w, where);
}
/** What's offered `where`: `'online'` (the phone's Shop app) or a place id (you there, the place open). Adult items only
 *  with adult content on; an item whose `when` doesn't hold is hidden, unless you already have it (kept once bought). */
export function offers(g: Save, w: WorldDef, where: string): Item[] {
    return shopItems(w).filter(it => itemOk(g, it) && soldAt(g, w, it, where) && (invited(g, w, it) || holding(g, it.id)));
}
/** The categories with something sold `where` that its `when` still hides ("More by invitation."). */
export function moreByInvitation(g: Save, w: WorldDef, where: string): string[] {
    const out = new Set<string>();
    for (const it of shopItems(w)) if (it.when && itemOk(g, it) && soldAt(g, w, it, where) && !holding(g, it.id) && !invited(g, w, it)) out.add(catOf(it));
    return SHOP_CATS.map(c => c.id).filter(id => out.has(id));
}
/** What an item costs now: the difficulty, then the prices where it's sold (online: where you live; at a place: that
 *  place), then what effects aimed at the shop take off (`shop`, `shop:<category>`: a perk, a service). */
export function shopPrice(g: Save, w: WorldDef, it: Item, where = 'online'): number {
    const place = where === 'online' ? playerHomeId : where;
    return Math.round(priceOf(g, it.price) * priceHere(g, w, place) * effectMul(g, w, 'price', ['shop', `shop:${catOf(it)}`], { exact: true }));
}
/** Why it can't be bought `where` right now ('' when it can): not sold here, kept already, a service already paid
 *  far enough ahead, not enough money. */
export function whyNotBuy(g: Save, w: WorldDef, it: Item, where = 'online'): string {
    if (!offers(g, w, where).some(x => x.id === it.id)) return 'That isn\'t sold here.';
    if (isKept(it) && hasItem(g, it.id)) return 'You already have it.';
    const d = daysOf(it);
    if (d && (peek(g).until?.[it.id] ?? 0) - nowAbs(g) > d * 1440 * (SHOP_AHEAD - 1)) return `You have it for ${daysLeft(g, it.id)} more days.`;
    if (g.player.money < shopPrice(g, w, it, where)) return 'Not enough money.';
    return '';
}

/* ---------- buying ---------- */

/** Buys an item `where` ('online' or the place you're at). Returns '' when bought, else why not. A kept thing goes into
 *  `player.items`; a service starts or runs longer (from its end, never more than two of its lengths ahead); stock adds
 *  its uses; `now` changes the needs at once; a gift to give adds its keepsake (a new one pays its life points). */
export function buy(g: Save, w: WorldDef, id: string, where = 'online'): string {
    const it = shopItems(w).find(x => x.id === id);
    if (!it) return 'That isn\'t sold here.';
    const why = whyNotBuy(g, w, it, where);
    if (why) return why;
    const price = shopPrice(g, w, it, where);
    g.player.money -= price; book(g, it.name, -price);
    const s = shopOf(g), now = nowAbs(g), cat = catOf(it);
    if (isKept(it)) lifeOf(g).items.push(id);
    const d = daysOf(it);
    if (d) s.until[id] = Math.min(now + SHOP_AHEAD * d * 1440, Math.max(now, s.until[id] ?? 0) + d * 1440);
    const n = stockOf(it);
    if (n) s.stock[id] = (s.stock[id] ?? 0) + n;
    for (const [need, v] of Object.entries(it.now ?? {})) if (Number.isFinite(Number(v))) addStatus(g, w, need, Math.max(-SHOP_NOW_MAX, Math.min(SHOP_NOW_MAX, Number(v))));
    if (it.keepsake) { addKeepsake(g, it.keepsake); const p = earn(g, w, 'keepsake', it.keepsake); if (p) toast(p, 'success'); }
    s.bought[id] = (s.bought[id] ?? 0) + 1;
    s.spent[cat] = (s.spent[cat] ?? 0) + price;
    note(g, '{u} bought: {0}.', [it.name], [], g.player.loc, 'shop');
    return '';
}

/* ---------- what you have ---------- */

// Holding an item of the shop: kept, a service not yet ended, or stock left.
const holding = (g: Save, id: string) => hasItem(g, id) || (peek(g).until?.[id] ?? 0) > nowAbs(g) || (peek(g).stock?.[id] ?? 0) > 0;
// The shop's entry: its items you hold, with the shop on and (adult ones) adult content on.
// (asked on every effect query, so it looks up only the ids you hold, not the whole catalog)
thingsOwned.push((g, w) => {
    const p = g.player as any, s = peek(g);
    if (!p.items?.length && !s.until && !s.stock) return [];
    const now = nowAbs(g);
    const ids = [...(Array.isArray(p.items) ? p.items as string[] : []), ...Object.keys(s.until ?? {}).filter(id => s.until![id] > now), ...Object.keys(s.stock ?? {}).filter(id => s.stock![id] > 0)];
    if (!ids.length) return [];
    let byId = itemsById(w);
    if (ids.some(id => byId.get(id)?.id !== id)) byId = itemsById(w, true);
    const seen = new Set<string>(), out: Item[] = [];
    for (const id of ids) { const it = byId.get(id); if (it && it.id === id && !seen.has(id) && itemOk(g, it)) { seen.add(id); out.push(it); } }
    return out;
});
/** Everything you own that counts right now, in a shop item's shape, from every `thingsOwned` entry. */
export const ownedDefs = (g: Save, w: WorldDef): Item[] => thingsOwned.flatMap(f => f(g, w));
/** Do you have it (an action's `needsItem`, `owns:`): anything you own by that id that counts right now (nothing with
 *  the shop off, and adult things nothing with adult content off). */
export const haveItem = (g: Save, w: WorldDef | null | undefined, id: string) => !!w && ownedDefs(g, w).some(it => it.id === id);
/** What you have of the shop, for the Yours tab: each with how it's held (kept, days left, uses left). */
export function yours(g: Save, w: WorldDef): { it: Item; kept: boolean; days: number; stock: number }[] {
    return shopItems(w).filter(it => itemOk(g, it) && holding(g, it.id)).map(it => ({ it, kept: hasItem(g, it.id), days: daysLeft(g, it.id), stock: stockLeft(g, it.id) }));
}

// Vehicles shorten every trip (the best one you own).
// (a mount you keep well fed counts too)
export const travelFactor = (g: Save, w?: WorldDef | null) => (w ? Math.min(1, ...ownedDefs(g, w).map(it => (Number(it.travel) > 0 ? Number(it.travel) : 1)), ...mountSpeeds(g, w)) : 1);
const mountSpeeds = (g: Save, w: WorldDef) => ((w.features as any)?.mounts === false ? [] : ((g as any).pets ?? []).map((p: any) => { const d = (w.pets ?? []).find(x => x.id === p.kind); return d?.mount && p.hunger > 20 ? Math.max(0.3, (d.speed ?? 0.6) - (p.bound ? Math.min(0.2, (p.level ?? 1) * 0.02) : 0)) : 1; }));
/** Mood gained when you wake up at home: the best bed you own (two beds don't add up). */
export const sleepMood = (g: Save, w: WorldDef) => Math.max(0, ...ownedDefs(g, w).map(it => Number(it.sleepMood) || 0));
/** You drive after the last train: a car of yours (`late`), with the shop on. */
export const drivesLate = (g: Save, w: WorldDef | null | undefined) => !!w && ownedDefs(g, w).some(it => !!it.late);

// A stock item is used up by the action that needs it (one use each time it's done); none left, it isn't offered.
onAction.push((g, w, a) => {
    const id = (w.actions.find(x => x.id === a.id) as ActionDef | undefined)?.needsItem;
    const s = peek(g).stock;
    if (!id || !s || !(s[id] > 0) || !systemOn(w, 'shop')) return;
    s[id]--;
    if (s[id] <= 0) delete s[id];
});
// Each morning: services that ended are forgotten (and said so).
onDay.push((g, w) => {
    const u = peek(g).until; if (!u) return [];
    const now = nowAbs(g), out: string[] = [];
    for (const [id, end] of Object.entries(u)) if (!(end > now)) {
        delete u[id];
        const it = shopItems(w).find(x => x.id === id);
        if (it && itemOk(g, it) && !it.now) out.push(`${it.icon ?? ''} ${it.name} has ended.`.trim());
    }
    return out;
});

/* ---------- what having it does ---------- */

const LIMITS = { pct: SHOP_LIMITS.mul, flat: SHOP_LIMITS.add };
// one effect is better than another of the same kind and target
const better = (a: EffectDef, b: EffectDef) => (LOWER_IS_BETTER.has(a.kind) ? a.value < b.value : a.value > b.value);
/** The small effects of what you own (sim/effects.ts): each item's held inside `SHOP_LIMITS` and kept while its `when`
 *  holds; per kind and target only the best item's counts (three good knives don't stack). */
// (housing) a home's rooms and fixtures are things of the same shape: they count here too, with the same limits and
// best-of, while the shop is off as well (they're the house's; sim/fixtures.ts says when they count)
export function shopEffects(g: Save, w: WorldDef): EffectDef[] {
    const shopOn = systemOn(w, 'shop'), fixtures = new Set((Array.isArray(w.homes?.fixtures) ? w.homes.fixtures : []).map(f => f?.id));
    if (!shopOn && !fixtures.size) return [];
    const best = new Map<string, EffectDef>();
    for (const it of ownedDefs(g, w)) {
        if (!it.effects?.length || (!shopOn && !fixtures.has(it.id))) continue;
        for (const e of cleanEffects(it.effects, LIMITS)) {
            if (e.when && !whenHolds(g, w, e.when, { key: `shop|${it.id}|${e.kind}` })) continue;
            const k = `${e.kind}|${e.target ?? ''}`, cur = best.get(k);
            if (!cur || better(e, cur)) best.set(k, e);
        }
    }
    return [...best.values()];
}
effectSources.push(shopEffects);

/* ---------- in words: what an item does (the Shop app's cards) ---------- */

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
const plus = (v: number) => `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
const needName = (w: WorldDef, id: string) => w.statuses.find(s => s.id === id)?.name ?? id;
// An action's name as offered.
const actName = (a: ActionDef) => a.label || a.name;
// One effect in words ("Photography trains 5% faster").
function effectWords(w: WorldDef, e: EffectDef): string {
    const t = e.target ?? '', v = e.value;
    switch (e.kind) {
        case 'learn': return `${t && t !== 'all' ? skillName(w, t) : 'Every skill'} trains ${pct(v)} ${v >= 0 ? 'faster' : 'slower'}`;
        case 'drain': return `${t ? needName(w, t) : 'Needs'} ${t ? 'drains' : 'drain'} ${pct(v)} ${v <= 0 ? 'slower' : 'faster'}`;
        case 'warm': return t === 'new' ? `${plus(v)} on first impressions` : `${plus(v)} warmth (${t})`;
        case 'interview': return `${plus(v)} at job interviews`;
        case 'morning': return `${plus(v)} ${needName(w, t || 'mood').toLowerCase()} each morning`;
        case 'roll': return t === 'private' ? `${plus(v)} on private moments` : `${plus(v)} on ${t ? skillName(w, t) : 'every'} rolls`;
        case 'rest': {
            const what = t === 'sleep home' ? 'Sleep at home' : t === 'sleep together' ? 'Sleeping together' : t === 'bath' ? 'A bath' : t === 'food' ? 'A meal' : t ? `${t[0].toUpperCase()}${t.slice(1)}` : 'Rest';
            return `${what} restores ${pct(v)} more`;
        }
        case 'letting': return `Rent from your tenants ${v >= 0 ? '+' : '−'}${pct(v)}`;
        case 'price': return `Prices ${pct(v)} ${v <= 0 ? 'lower' : 'higher'}${t ? ` (${t})` : ''}`;
        case 'royalty': return `The museum's royalties ${v >= 0 ? '+' : '−'}${pct(v)}`;
        // (track 7)
        case 'venture': return `${t === 'cafe' ? 'Your café takes' : t === 'hotel' ? 'Your hotels take' : t ? `${w.ventures?.find(x => x.id === t)?.name ?? t} takes` : 'Your ventures take'} ${pct(v)} ${v >= 0 ? 'more' : 'less'}`;
        case 'find': return `Finds ${pct(v)} ${v >= 0 ? 'likelier' : 'less likely'}`;
        case 'renown': return `Renown ${v >= 0 ? '+' : '−'}${pct(v)}`;
        default: return `${e.kind} ${EFFECT_KINDS[e.kind]?.mode === 'mul' ? `${v >= 0 ? '+' : '−'}${pct(v)}` : plus(v)}${t ? ` (${t})` : ''}`;
    }
}
/** What an item does, in words for its card: trips, driving late, mood on waking, its effects, what it unlocks, how
 *  long a service lasts or how many uses it holds, what it changes at once, the keepsake it gives. English interface
 *  text (the screens translate it). */
export function itemDoes(g: Save, w: WorldDef, it: Item): string[] {
    const out: string[] = [];
    if (Number(it.travel) > 0 && Number(it.travel) < 1) out.push(`Trips take ${pct(1 - Number(it.travel))} less time`);
    if (it.late) out.push('Drive after the last train');
    if (Number(it.sleepMood) > 0) out.push(`${plus(Number(it.sleepMood))} mood waking up at home`);
    for (const e of cleanEffects(it.effects, LIMITS)) out.push(effectWords(w, e));
    // what it unlocks: actions that need it, or name it in an `owns:` (adult ones only with adult content on)
    const named = (a: ActionDef) => parseWhen(a.when).conds.some(c => c.key === 'owns' && !c.not && c.values.includes(it.id));
    const unlocks = w.actions.filter(a => (!a.adult || adultOn(g)) && (a.needsItem === it.id || (!!a.when && named(a))));
    if (unlocks.length) out.push(`Unlocks: ${[...new Set(unlocks.map(actName))].join(', ')}`);
    const d = daysOf(it), n = stockOf(it);
    if (d && !it.now) out.push(d === 1 ? 'Lasts a day' : `Lasts ${d} days`);
    if (n) out.push(n === 1 ? 'One use' : `${n} uses`);
    const now = Object.entries(it.now ?? {}).filter(([, v]) => Number(v)).map(([id, v]) => `${needName(w, id)} ${plus(Math.max(-SHOP_NOW_MAX, Math.min(SHOP_NOW_MAX, Number(v))))}`);
    if (now.length) out.push(`At once: ${now.join(', ')}`);
    if (it.keepsake) out.push(`Gives: ${keepsakeDef(w, it.keepsake).name}`);
    return out;
}

/* ---------- what the AI is told ---------- */

const dearest = (a: Item, b: Item) => (Number(b.price) || 0) - (Number(a.price) || 0);
// The verb for something seen on you (a car is driven, a bike ridden, clothes and a watch worn).
const verbOf = (it: Item) => (catOf(it) === 'vehicle' ? (it.late ? 'drives' : Number(it.travel) > 0 ? 'rides' : 'owns') : catOf(it) === 'fashion' || catOf(it) === 'luxury' ? 'wears' : 'has');
// Items told in one sentence: their own `ai` lines, then the rest by verb ("{{user}} wears: …; drives: …").
function toldWords(list: Item[], head: (parts: string) => string): string {
    const own = list.filter(it => it.ai?.trim()).map(it => it.ai!.trim().replace(/([^.!?])$/, '$1.'));
    const byVerb = new Map<string, string[]>();
    for (const it of list.filter(x => !x.ai?.trim())) { const v = verbOf(it); byVerb.set(v, [...(byVerb.get(v) ?? []), it.name]); }
    const rest = [...byVerb].map(([v, names]) => `${v}: ${names.join(', ')}`).join('; ');
    return [rest ? head(rest) : '', ...own].filter(Boolean).join(' ');
}
// How long a service paid ahead still lasts: whole weeks as weeks ("two more weeks"), else days ("10 more days").
const WEEKS = ['', 'one more week', 'two more weeks', 'three more weeks', 'four more weeks'];
export const serviceLeft = (d: number): string => (d <= 1 ? 'today' : d % 7 ? `${d} more days` : WEEKS[d / 7] ?? `${d / 7} more weeks`);
const serviceWords = (g: Save, it: Item) => `${it.name} (${serviceLeft(daysLeft(g, it.id))})`;
// Adult things you have: owned ones, and those whose keepsake you hold (a blindfold bought as a gift to give).
// (housing) a home's adult fixtures (a bedroom suite) are adult things of yours too, told under the same rules; their
// `ai` is a noun phrase (the home's line lists fixtures), so it stands for their name here
const fixtureList = (w: WorldDef): Item[] => (Array.isArray(w.homes?.fixtures) ? w.homes.fixtures : []).filter(f => !!f?.id);
const isFixtureOf = (w: WorldDef, it: Item) => fixtureList(w).some(f => f.id === it.id);
const thingName = (w: WorldDef, it: Item) => (isFixtureOf(w, it) ? it.ai?.trim().replace(/[.!]$/, '') || it.name : it.name);
function adultThings(g: Save, w: WorldDef): Item[] {
    const held = new Set(Object.entries(((g.player as any).keepsakes ?? {}) as Record<string, number>).filter(([, n]) => n > 0).map(([id]) => id));
    const owned = new Set(ownedDefs(g, w).map(it => it.id));
    return [...shopItems(w), ...fixtureList(w)].filter(it => isAdultItem(it) && toldOf(it) !== 'no' && (owned.has(it.id) || (!!it.keepsake && held.has(it.keepsake)))).sort(dearest);
}
const seenOf = (it: Item) => it.seen ?? 'away';
/** Who knows of a put-away thing: from a private action with them that used it, finding it, or having it as a gift. */
export function knowsOf(g: Save, w: WorldDef, avatar: string, it: Item): boolean {
    return !!peek(g).known?.[avatar]?.includes(it.id) || (!!it.keepsake && !!giftsGiven(g)[avatar]?.includes(it.keepsake));
}
// The people at your home with you, when every one of them is a partner or drawn to you (else none: adult things
// aren't told with a friend, family or a colleague over, nor with nobody there to see them).
function intimateCompany(g: Save, w: WorldDef): { avatar: string; name: string }[] {
    if (g.player.loc !== playerHomeId || !adultOn(g)) return [];
    const here = presentAt(g, w, playerHomeId);
    return here.length && here.every(r => drawnToYou(g, w, r.avatar)) ? here.map(r => ({ avatar: r.avatar, name: r.name.split(/\s+/)[0] })) : [];
}
// The adult part: what's in sight in the bedroom, and what's put away with who knows of it. One sentence at most.
function adultLine(g: Save, w: WorldDef): string {
    const who = intimateCompany(g, w);
    if (!who.length) return '';
    const list = adultThings(g, w).slice(0, TOLD.adult);
    if (!list.length) return '';
    const out = list.filter(it => seenOf(it) === 'out'), away = list.filter(it => seenOf(it) === 'away');
    const parts: string[] = [], said = out.filter(it => it.ai?.trim() && !isFixtureOf(w, it)).map(it => it.ai!.trim().replace(/([^.!?])$/, '$1.'));
    const plain = out.filter(it => !it.ai?.trim() || isFixtureOf(w, it));
    if (plain.length) parts.push(`In {{user}}'s bedroom, in plain sight: ${plain.map(it => thingName(w, it)).join(', ')}`);
    if (away.length) {
        const known = (it: Item) => who.filter(p => knowsOf(g, w, p.avatar, it)).map(p => p.name);
        const words = away.map(it => {
            const k = known(it), unknown = who.filter(p => !k.includes(p.name)).map(p => p.name);
            return `${thingName(w, it)} (${!unknown.length ? `${k.join(' and ')} ${k.length > 1 ? 'know' : 'knows'} of it` : k.length ? `${k.join(' and ')} ${k.length > 1 ? 'know' : 'knows'} of it; ${unknown.join(' and ')} not` : `unknown to ${unknown.join(' and ')}`})`;
        });
        parts.push(`put away out of sight, where nobody sees them unless {{user}} brings them out: ${words.join(', ')}`);
    }
    const s = parts.join('; ');
    return [s ? `${s[0].toUpperCase()}${s.slice(1)}.` : '', ...said].filter(Boolean).join(' ');
}
// Just now someone came across one of your put-away things (for an hour, while they're still here with you).
function foundLine(g: Save, w: WorldDef): string {
    const f = peek(g).found;
    if (!f || nowAbs(g) - f.at > 60 || !adultOn(g) || g.player.loc !== playerHomeId) return '';
    const r = g.cast[f.who], it = shopItems(w).find(x => x.id === f.item);
    if (!r || !it || !presentAt(g, w, playerHomeId).includes(r)) return '';
    const name = r.name.split(/\s+/)[0];
    return `Just now ${name} came across {{user}}'s ${it.name} put away in a drawer: play ${name}'s reaction.`;
}
/** What the AI is told of what you own (sim/prompt.ts, after the ventures' line). Out and about, the dearest things
 *  people can see on you; at home, the dearest things there and the services running. Adult things only at home with
 *  partners or people drawn to you there (in sight, or put away with who knows of them); during a private action,
 *  only what it uses. Gifts to give are never told. Nothing with the shop off. */
export function shopLine(g: Save, w: WorldDef): string {
    if (!systemOn(w, 'shop')) return '';
    // a private action going on: what it uses, in use (the rest is left out): the item it needs, and those whose
    // keepsake its condition asks you to hold (a blindfold bought as a gift)
    const act = sceneAct(g);
    if (act && isPrivateAct(g, act.a)) {
        const holds = parseWhen(act.a.when).conds.filter(c => c.key === 'holds' && !c.not).flatMap(c => c.values);
        const used = [...shopItems(w), ...fixtureList(w)].filter(x => itemOk(g, x) && (x.id === act.a.needsItem || (!!x.keepsake && holds.includes(x.keepsake) && ((g.player as any).keepsakes?.[x.keepsake] ?? 0) > 0))).slice(0, TOLD.adult);
        const said = used.filter(it => it.ai?.trim() && !isFixtureOf(w, it)).map(it => it.ai!.trim().replace(/([^.!?])$/, '$1.')), plain = used.filter(it => !it.ai?.trim() || isFixtureOf(w, it));
        return [plain.length ? `In use right now: ${plain.map(it => thingName(w, it)).join(', ')}.` : '', ...said].filter(Boolean).join(' ');
    }
    // (a home's own fixtures are told by its own line, sim/fixtures.ts; adult ones stay here, under the rules below)
    const fixtures = new Set((Array.isArray(w.homes?.fixtures) ? w.homes.fixtures : []).map(f => f?.id));
    const owned = ownedDefs(g, w).filter(it => !isAdultItem(it) && catOf(it) !== 'gift' && !fixtures.has(it.id));
    const atHome = g.player.loc === playerHomeId;
    const parts: string[] = [];
    if (!atHome) parts.push(toldWords(owned.filter(it => toldOf(it) === 'always').sort(dearest).slice(0, TOLD.out), s => `{{user}} ${s}.`));
    else {
        const things = owned.filter(it => toldOf(it) === 'home' && isKept(it)).sort(dearest).slice(0, TOLD.home);
        const services = owned.filter(it => toldOf(it) === 'home' && !isKept(it) && daysLeft(g, it.id) > 0 && !it.now).sort(dearest).slice(0, TOLD.services);
        const own = things.filter(it => it.ai?.trim()).map(it => it.ai!.trim().replace(/([^.!?])$/, '$1.'));
        const list = [...things.filter(it => !it.ai?.trim()).map(it => it.name), ...services.map(it => serviceWords(g, it))];
        if (list.length) parts.push(`At {{user}}'s home: ${list.join(', ')}.`);
        parts.push(...own, adultLine(g, w), foundLine(g, w));
    }
    return parts.filter(Boolean).join(' ');
}

/* ---------- who knows of your put-away things ---------- */

const learnOf = (g: Save, avatar: string, id: string) => { const k = (shopOf(g).known[avatar] ??= []); if (!k.includes(id)) k.push(id); };
// A private action done with someone, using one of your things: they know of it now.
privateResults.push((g, w, x, done) => {
    const id = x.a.needsItem;
    if (!id || done.stopped || !systemOn(w, 'shop') || ![...shopItems(w), ...fixtureList(w)].some(it => it.id === id && isAdultItem(it))) return;
    for (const a of done.with) learnOf(g, a, id);
});
// On a day someone spends time at your home with you (everyone there drawn to you), a small chance they come across one
// of your put-away things they didn't know of; the AI is told it just happened.
onHour.push((g, w) => {
    if (!systemOn(w, 'shop') || g.player.loc !== playerHomeId || !adultOn(g)) return [];
    const who = intimateCompany(g, w);
    if (!who.length) return [];
    const away = adultThings(g, w).filter(it => seenOf(it) === 'away' && !isFixtureOf(w, it));   // (a room isn't found in a drawer)
    if (!away.length) return [];
    for (const p of who) {
        const looked = peek(g).looked?.[p.avatar];
        if (looked === g.day) continue;
        const left = away.filter(it => !knowsOf(g, w, p.avatar, it));
        if (!left.length) continue;
        const s = shopOf(g); (s.looked ??= {})[p.avatar] = g.day;
        if (Math.random() >= SHOP_FIND) continue;
        const it = left[Math.floor(Math.random() * left.length)];
        learnOf(g, p.avatar, it.id);
        s.found = { who: p.avatar, item: it.id, at: nowAbs(g) };
        return [`${p.name} came across your ${it.name}.`];
    }
    return [];
});
