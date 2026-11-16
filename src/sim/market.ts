// The museum's market (track 5 of end-game spending): the dealer who calls at the museum every week with a few pieces
// (a pity timer so no piece waits too long, a piece asked for, R-6's later and dearer pieces) and the sales four times
// a year, where another collector bids against you and a lot she takes comes back. The world data is
// `w.collection.museum.dealer` and `.auctions` and the slots' `dealer`/`auction` sources; the save is
// `g.collection.museum.dealer` and `.sales`. Both women are words only until their cards (C-7). Everything is seeded
// from the world, the day and the piece, so a save shows the same stock and the same sale when opened again. With the
// collection off, no museum, or the museum not yours yet, nothing here reads or writes anything.
import type { Save } from '../core/store.js';
import type { WorldDef, SlotDef, PieceSource, MuseumDef } from '../core/world.js';
import { onHour, collectionLink, museumLink } from './hooks.js';
import { museumDef, museumOf, museumState, museumOpen } from './museum.js';
import { slotsHere, collectionOf } from './collection.js';
import { whenHolds } from './when.js';
import { priceOf } from './bills.js';
import { book } from './ledger.js';
import { money } from './needs.js';

/* ---------- the save ---------- */

/** A piece in the dealer's stock: its price this visit; `asked`: the one you asked for (+`ask`); `late`: a lot the other
 *  collector took and never sold back (+`late`). */
export interface StockItem { id: string; price: number; asked?: boolean; late?: boolean }
/** The dealer's part of the save (M0's fields and the market's own): `calls` visits made; `late` pieces from lost lots
 *  (id → the estimate they were lost at); the counters her tiers will read: yen `spent`, pieces `bought`, pieces
 *  `asked` for, `visits` you bought from (`last`: the visit's day you last bought on). */
export interface DealerState {
    next?: number; stock?: StockItem[]; waited?: Record<string, number>; ask?: string; askd?: number;
    calls?: number; late?: Record<string, number>; spent?: number; bought?: number; asked?: number; visits?: number; last?: number;
}
/** A lot at the next sale: its estimate (a lot coming back: its price, the estimate +`again`), your top bid, `back`: a
 *  lot she sells you back (she doesn't bid). */
export interface Lot { id: string; est: number; bid?: number; back?: boolean }
/** One lot's result, for the Sales tab (the last few). `why` when you didn't get it: `outbid`, `money` (short at the
 *  hammer), `nobid` (she took it), `unsold` (a lot coming back that you didn't buy), `card` (in person, the extra step
 *  turned down or not enough). */
export interface LotResult { day: number; id: string; est: number; won: boolean; paid?: number; rival?: boolean; back?: boolean; why?: string }
/** A card in person: she outbid you; one more step (`price`: your top bid + a step) may still win it. */
export interface SaleCard { id: string; est: number; bid: number; her: number; step: number; day: number; hour: number }
/** The sales' part of the save: the sale the catalogue is for, its lots, lots she took (sales left until they're back),
 *  sales held; `cats` catalogues received; the counters her tiers will read: lots `won` against her, lots bought
 *  (`lots`), lots she `resold` you; the open in-person cards; the last results. */
export interface SalesState {
    next?: number; lots?: Lot[]; lost?: Record<string, number>; held?: number;
    cats?: number; won?: number; lots_won?: number; resold?: number; card?: SaleCard[]; past?: LotResult[];
}

/** Top bids offered for a lot: the estimate, +25%, +50%, +100%. */
export const BID_STEPS = [1, 1.25, 1.5, 2] as const;
// How many results the Sales tab keeps.
const PAST = 16;
// The rival's odds of wanting a lot of rung R4 and above, as a share of her usual odds (0.4 → 0.6).
const DEAR_WANTS = 1.5;
// A catalogue comes this many days before its sale.
const CATALOGUE_DAYS = 7;

const dealerOf = (g: Save): DealerState => ((museumState(g).dealer ??= {}) as DealerState);
const salesOf = (g: Save): SalesState => ((museumState(g).sales ??= {}) as SalesState);
const peekDealer = (g: Save) => (museumOf(g)?.dealer ?? {}) as DealerState;
const peekSales = (g: Save) => (museumOf(g)?.sales ?? {}) as SalesState;

/* ---------- small helpers ---------- */

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// A seeded number in [0, 1) for this world, a visit or sale (`at`) and a piece.
const rnd = (g: Save, at: string, id: string) => hash(`${g.world}|${at}|${id}`) / 4294967296;
const hourOf = (g: Save) => Math.floor(g.minutes / 60);
const seasonLen = (g: Save) => Math.max(1, Math.round((g as any).cfg?.seasonDays ?? 14));

/** A piece's rung from its yen before difficulty (the shop's rungs: R1 ¥1,000–9,000 … R5 ¥5,000,000–15,000,000; 0 free). */
export function pieceRung(price: number | undefined): number {
    const p = price ?? 0;
    return p >= 5_000_000 ? 5 : p >= 500_000 ? 4 : p >= 80_000 ? 3 : p >= 10_000 ? 2 : p > 0 ? 1 : 0;   // as museum.ts's rungOf
}
/** The museum's renown level now (M-A's engine; 0 until it says). */
export const renownLevel = (g: Save, w: WorldDef): number => museumLink.level?.(g, w) ?? 0;
/** Can the museum house this piece now? */
export function canHouse(g: Save, w: WorldDef, s: SlotDef): boolean {
    if (museumLink.canHouse) return museumLink.canHouse(g, w, s);
    if (!s.needsUpgrade) return true;
    const ups = museumOf(g)?.ups ?? {}, m = museumDef(w);
    return Object.keys(ups).some(id => id === s.needsUpgrade || m?.upgrades.find(u => u.id === id)?.does === s.needsUpgrade);
}
/** A museum price from its yen before difficulty. */
export const marketPrice = (g: Save, w: WorldDef, base: number): number => Math.max(0, Math.round(museumLink.price ? museumLink.price(g, w, base) : priceOf(g, base)));
/** Is this piece still to be had (not yours, or yours only as a replica)? A damaged piece is yours. */
export function missing(g: Save, id: string): boolean {
    const got = collectionOf(g)?.got?.[id] as { replica?: boolean } | undefined;
    return !got || !!got.replica;
}
// The piece becomes yours (the museum's engine writes it; without it, the collection's own entry).
function give(g: Save, w: WorldDef, id: string, src: 'dealer' | 'auction', paid: number): string[] {
    if (museumLink.give) return museumLink.give(g, w, id, { src, paid });
    museumState(g);
    (collectionOf(g)!.got as Record<string, unknown>)[id] = { day: g.day, src, paid };
    return [];
}
const slotOf = (w: WorldDef, id: string) => w.collection?.slots.find(s => s.id === id);
const housable = (g: Save, w: WorldDef, id: string) => { const s = slotOf(w, id); return !!s && canHouse(g, w, s); };
const nameOf = (w: WorldDef, id: string) => slotOf(w, id)?.name ?? id;
const sourcesOf = (s: SlotDef, kind: PieceSource['kind']) => (s.sources ?? []).filter(x => x.kind === kind);
// Weighted draw without putting back (each piece's key is u^(1/weight), the highest keys win), seeded.
function weighted<T extends { id: string; weight: number }>(g: Save, at: string, list: T[], n: number): T[] {
    if (n <= 0) return [];
    return list.map(x => ({ x, k: Math.pow(Math.max(1e-12, rnd(g, at, x.id)), 1 / Math.max(0.01, x.weight)) }))
        .sort((a, b) => b.k - a.k || (a.x.id < b.x.id ? -1 : 1)).slice(0, n).map(e => e.x);
}

/* ---------- the dealer ---------- */

/** A piece the dealer can bring: its slot, its yen before difficulty (premiums included), its rarity weight, and
 *  whether it's a lot the other collector never sold back. */
export interface Pooled { id: string; base: number; weight: number; late?: boolean }

/** The dealer's pool now: missing pieces this game has that the museum can house (R5 only from renown 3), with a
 *  `dealer` source whose `when` holds (one with a `when` is R-6's later way: +`late`), or a lot lost and never sold
 *  back (its estimate +`late`). The cheapest way of each piece. */
export function dealerPool(g: Save, w: WorldDef): Pooled[] {
    const m = museumDef(w), d = m?.dealer;
    if (!m || !d || !museumOpen(g, w)) return [];
    const late = 1 + (d.late ?? 0), lateLots = peekDealer(g).late ?? {}, level = renownLevel(g, w), out: Pooled[] = [];
    for (const s of slotsHere(g, w)) {
        if (!s.sources?.length || !missing(g, s.id) || !canHouse(g, w, s)) continue;
        let best: Pooled | null = null;
        for (const src of sourcesOf(s, 'dealer')) {
            const raw = src.price ?? s.price;
            if (raw === undefined || !whenHolds(g, w, src.when)) continue;
            if (pieceRung(s.price ?? raw) >= 5 && level < 3) continue;
            const base = Math.round(raw * (src.when ? late : 1));
            if (!best || base < best.base) best = { id: s.id, base, weight: src.chance ?? 1 };
        }
        if (!best && lateLots[s.id] !== undefined && !(pieceRung(s.price ?? lateLots[s.id]) >= 5 && level < 3))
            best = { id: s.id, base: Math.round(lateLots[s.id] * late), weight: 1, late: true };
        if (best) out.push(best);
    }
    return out;
}
/** How many pieces a visit brings now (`more` from a renown level). */
export function stockSize(g: Save, w: WorldDef): number {
    const d = museumDef(w)?.dealer; if (!d) return 0;
    return d.more && renownLevel(g, w) >= d.more[0] ? d.more[1] : d.stock;
}

// A visit. No pooled piece waits longer than `max(pity, pool ÷ stock)` visits (the longest a full round of the pool
// takes): the pieces that would wait longer if not offered now come first (the longest waits first), then every piece
// that has waited `pity` visits, then by rarity. The piece asked for comes on top of the stock (one more than `stock`),
// so it never takes a place the pity timer needs.
function dealerVisit(g: Save, w: WorldDef, d: NonNullable<MuseumDef['dealer']>): string[] {
    const st = dealerOf(g), at = `visit${g.day}`;
    st.calls = (st.calls ?? 0) + 1;
    const pool = dealerPool(g, w), byId = new Map(pool.map(p => [p.id, p]));
    const waited: Record<string, number> = {};
    for (const p of pool) waited[p.id] = (st.waited?.[p.id] ?? 0) + 1;
    const n = stockSize(g, w), picks: { p: Pooled; asked?: boolean }[] = [];
    const order = [...pool].sort((a, b) => waited[b.id] - waited[a.id] || rnd(g, at, a.id) - rnd(g, at, b.id));
    // how many must come now: for each visit ahead, the pieces that reach the longest wait by then, less what the
    // visits before it can take
    const most = Math.max(d.pity, Math.ceil(pool.length / Math.max(1, n)));
    let must = 0;
    for (let j = 1, k = 0; j <= most; j++) {
        while (k < order.length && waited[order[k].id] >= most - j + 1) k++;
        must = Math.max(must, k - n * (j - 1));
    }
    const asked = st.ask && byId.has(st.ask) ? byId.get(st.ask)! : null;
    const room = n + (asked ? 1 : 0);   // (the piece asked for is an extra one)
    const take = (p: Pooled, ask = false) => { if (picks.length < room && !picks.some(x => x.p.id === p.id)) picks.push({ p, ...(ask ? { asked: true } : {}) }); };
    if (asked) take(asked, true);
    delete st.ask; delete st.askd;   // (askd: a second-visit mark older saves may still have)
    for (const p of order.slice(0, Math.min(n, must))) take(p);
    for (const p of order) if (waited[p.id] >= d.pity) take(p);
    const left = new Set(picks.map(x => x.p.id));
    for (const p of weighted(g, at, pool.filter(x => !left.has(x.id)), room - picks.length)) take(p);
    st.stock = picks.map(({ p, asked }) => ({ id: p.id, price: marketPrice(g, w, p.base * (asked ? 1 + (d.ask ?? 0) : 1)),
        ...(asked ? { asked: true } : {}), ...(p.late ? { late: true } : {}) }));
    for (const x of picks) waited[x.p.id] = 0;
    st.waited = waited;
    st.next = g.day + d.every;
    if (!st.stock.length) return [];
    return [st.stock.length === 1 ? 'The dealer\'s van is outside the museum: one piece this week.' : `The dealer's van is outside the museum: ${st.stock.length} pieces this week.`];
}

/** Why this stock piece can't be bought ('' when it can). */
export function whyNotBuyPiece(g: Save, w: WorldDef, id: string): string {
    if (!museumDef(w)?.dealer || !museumOpen(g, w)) return 'The dealer doesn\'t call yet.';
    const it = (peekDealer(g).stock ?? []).find(x => x.id === id);
    if (!it) return 'The dealer hasn\'t brought that.';
    if (!missing(g, id)) return 'You already have it.';
    const s = slotOf(w, id);
    if (!s || !canHouse(g, w, s)) return 'The museum can\'t house it yet.';
    if (g.player.money < it.price) return 'Not enough money.';
    return '';
}
/** Buy a piece of this week's stock (she delivers it). Returns why not, or '' and the piece is yours. */
export function buyFromDealer(g: Save, w: WorldDef, id: string): string {
    const why = whyNotBuyPiece(g, w, id);
    if (why) return why;
    const st = dealerOf(g), i = st.stock!.findIndex(x => x.id === id), it = st.stock![i];
    g.player.money -= it.price; book(g, `The dealer: ${nameOf(w, id)}`, -it.price);
    st.stock!.splice(i, 1);
    st.spent = (st.spent ?? 0) + it.price; st.bought = (st.bought ?? 0) + 1;
    const visit = (st.next ?? g.day) - (museumDef(w)!.dealer!.every);
    if (st.last !== visit) { st.last = visit; st.visits = (st.visits ?? 0) + 1; }
    if (st.late?.[id] !== undefined) delete st.late[id];
    if (st.waited) delete st.waited[id];
    give(g, w, id, 'dealer', it.price);
    return '';
}
/** What can be asked for: the dealer's pool less this week's stock. */
export function askable(g: Save, w: WorldDef): Pooled[] {
    const stock = new Set((peekDealer(g).stock ?? []).map(x => x.id));
    return dealerPool(g, w).filter(p => !stock.has(p.id));
}
/** Ask the dealer for a piece: it comes with her next visit, at +`ask`. One at a time. Returns why not, or ''. */
export function askDealer(g: Save, w: WorldDef, id: string): string {
    if (!museumDef(w)?.dealer || !museumOpen(g, w)) return 'The dealer doesn\'t call yet.';
    if (peekDealer(g).ask) return 'You\'ve already asked for a piece.';
    if (!askable(g, w).some(p => p.id === id)) return 'The dealer can\'t bring that.';
    const st = dealerOf(g);
    st.ask = id; st.asked = (st.asked ?? 0) + 1;
    return '';
}

/* ---------- the sales ---------- */

/** The first sale on or after this moment (a sale day before its hour counts). */
export function saleAfter(g: Save, w: WorldDef, day = g.day, hour = hourOf(g)): number | undefined {
    const a = museumDef(w)?.auctions; if (!a) return undefined;
    const len = seasonLen(g), days = [...new Set(a.days.filter(d => d <= len))].sort((x, y) => x - y);
    if (!days.length) return undefined;
    for (let k = Math.floor((Math.max(1, day) - 1) / len); ; k++)
        for (const d of days) { const s = k * len + d; if (s > day || (s === day && hour < a.from)) return s; }
}

/** A piece that can come up at a sale: its estimate's yen before difficulty and rarity weight. */
function auctionPool(g: Save, w: WorldDef): { id: string; base: number; weight: number }[] {
    const lost = peekSales(g).lost ?? {}, late = peekDealer(g).late ?? {}, level = renownLevel(g, w), out: { id: string; base: number; weight: number }[] = [];
    for (const s of slotsHere(g, w)) {
        if (!s.sources?.length || lost[s.id] !== undefined || late[s.id] !== undefined || !missing(g, s.id) || !canHouse(g, w, s)) continue;
        let best: { id: string; base: number; weight: number } | null = null;
        for (const src of sourcesOf(s, 'auction')) {
            const raw = src.price ?? s.price;
            if (raw === undefined || !whenHolds(g, w, src.when)) continue;
            if (pieceRung(s.price ?? raw) >= 5 && level < 3) continue;
            if (!best || raw < best.base) best = { id: s.id, base: raw, weight: src.chance ?? 1 };
        }
        if (best) out.push(best);
    }
    return out;
}
// The estimate a lost lot was taken at (its auction source's yen before difficulty).
const auctionBase = (w: WorldDef, id: string): number => {
    const s = slotOf(w, id); if (!s) return 0;
    const ps = sourcesOf(s, 'auction').map(x => x.price ?? s.price).filter((v): v is number => Number.isFinite(v));
    return ps.length ? Math.min(...ps) : s.price ?? 0;
};
/** How many lots a sale has now (`more` from a renown level). */
export function lotCount(g: Save, w: WorldDef): number {
    const a = museumDef(w)?.auctions; if (!a) return 0;
    return a.more && renownLevel(g, w) >= a.more[0] ? a.more[1] : a.lots;
}
// The catalogue: lots coming back first (the fewest sales left first), then by rarity.
function catalogue(g: Save, w: WorldDef, a: NonNullable<MuseumDef['auctions']>, sale: number): Lot[] {
    const s = salesOf(g), n = lotCount(g, w), again = 1 + (a.again ?? 0), lots: Lot[] = [];
    const back = Object.entries(s.lost ?? {}).filter(([id]) => missing(g, id)).sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));
    for (const [id] of back) if (lots.length < n) {
        const sl = slotOf(w, id);
        if (sl && canHouse(g, w, sl)) lots.push({ id, est: marketPrice(g, w, auctionBase(w, id) * again), back: true });
    }
    for (const p of weighted(g, `sale${sale}`, auctionPool(g, w).filter(p => !lots.some(l => l.id === p.id)), n - lots.length))
        lots.push({ id: p.id, est: marketPrice(g, w, p.base) });
    return lots;
}

/** The other collector at a lot (seeded per sale and lot): does she want it, and her top bid (yen). None for a lot she
 *  sells back. Her odds rise for R4 and above, her top with the museum's renown. */
export function rivalAt(g: Save, w: WorldDef, sale: number, lot: Lot): { wants: boolean; top: number } {
    const r = museumDef(w)?.auctions?.rival;
    if (!r || lot.back) return { wants: false, top: 0 };
    const at = `sale${sale}`, rung = pieceRung(slotOf(w, lot.id)?.price ?? auctionBase(w, lot.id));
    const odds = Math.min(1, r.wants * (rung >= 4 ? DEAR_WANTS : 1));
    const share = r.top[0] + (r.top[1] - r.top[0]) * rnd(g, at, `${lot.id}|top`) + (r.perLevel ?? 0) * renownLevel(g, w);
    return { wants: rnd(g, at, `${lot.id}|wants`) < odds, top: Math.round(lot.est * share) };
}
const stepOf = (lot: Lot) => Math.max(1, Math.round(lot.est * 0.1));

// One lot's outcome at the hammer (or a card, in person). Returns lines.
function settleLot(g: Save, w: WorldDef, sale: number, lot: Lot, inPerson: boolean, out: LotResult[]): string[] {
    const s = salesOf(g), a = museumDef(w)!.auctions!, name = nameOf(w, lot.id);
    // had another way since the catalogue (or a damaged find waiting for the workshop): nothing to sell
    if (!missing(g, lot.id) || !housable(g, w, lot.id)) { if (lot.back && s.lost) delete s.lost[lot.id]; return []; }
    const r = rivalAt(g, w, sale, lot), step = stepOf(lot), bid = lot.bid;
    const win = (paid: number, against: boolean): string[] => {
        g.player.money -= paid; book(g, `The sale: ${name}`, -paid);
        s.lots_won = (s.lots_won ?? 0) + 1;
        if (against) s.won = (s.won ?? 0) + 1;
        if (lot.back) { s.resold = (s.resold ?? 0) + 1; if (s.lost) delete s.lost[lot.id]; }
        out.push({ day: sale, id: lot.id, est: lot.est, won: true, paid, ...(against ? { rival: true } : {}), ...(lot.back ? { back: true } : {}) });
        return [`Won at the sale: ${name} for ${money(w, paid)}.`, ...give(g, w, lot.id, 'auction', paid)];
    };
    const lose = (why: string, rival: boolean): string[] => {
        out.push({ day: sale, id: lot.id, est: lot.est, won: false, why, ...(rival ? { rival: true } : {}), ...(lot.back ? { back: true } : {}) });
        if (lot.back) { if (s.lost) delete s.lost[lot.id]; dealerOf(g).late = { ...(dealerOf(g).late ?? {}), [lot.id]: auctionBase(w, lot.id) }; return []; }
        if (rival || why === 'money') { (s.lost ??= {})[lot.id] = a.back ?? 2; }
        return why === 'money' ? [`The bid for ${name} fell through: not enough money at the hammer.`] : rival ? [`Lost at the sale: ${name} went to the other collector.`] : [];
    };
    if (!r.wants) {
        if (bid === undefined) { if (lot.back) return lose('unsold', false); out.push({ day: sale, id: lot.id, est: lot.est, won: false, why: 'nobid' }); return []; }
        return g.player.money >= lot.est ? win(lot.est, false) : lose('money', false);
    }
    if (bid !== undefined && bid >= r.top + step) return g.player.money >= r.top + step ? win(r.top + step, true) : lose('money', true);
    if (bid !== undefined && inPerson && g.player.money >= bid + step) {
        (s.card ??= []).push({ id: lot.id, est: lot.est, bid, her: r.top, step, day: g.day, hour: hourOf(g) });
        return [`The other collector outbids you on ${name}. One more step, ${money(w, bid + step)}?`];
    }
    return lose(bid === undefined ? 'nobid' : 'outbid', true);
}
const keepPast = (s: SalesState, res: LotResult[]) => { s.past = [...res, ...(s.past ?? [])].slice(0, PAST); };

/** Answer an in-person card: one more step, or let it go. Returns lines. */
export function answerCard(g: Save, w: WorldDef, id: string, yes: boolean): string[] {
    const s = salesOf(g), i = (s.card ?? []).findIndex(c => c.id === id);
    if (i < 0) return [];
    const c = s.card!.splice(i, 1)[0], a = museumDef(w)?.auctions, name = nameOf(w, id), res: LotResult[] = [];
    if (!s.card!.length) delete s.card;
    const lose = (why: string): string[] => {
        res.push({ day: c.day, id, est: c.est, won: false, why, rival: true }); keepPast(s, res);
        if (missing(g, id)) (s.lost ??= {})[id] = a?.back ?? 2;
        return [`Lost at the sale: ${name} went to the other collector.`];
    };
    if (!missing(g, id) || !housable(g, w, id)) return [];
    if (!yes) return lose('card');
    const mine = c.bid + c.step, paid = c.her + c.step;
    if (mine < paid || g.player.money < paid) return lose('card');
    g.player.money -= paid; book(g, `The sale: ${name}`, -paid);
    s.lots_won = (s.lots_won ?? 0) + 1; s.won = (s.won ?? 0) + 1;
    res.push({ day: c.day, id, est: c.est, won: true, paid, rival: true }); keepPast(s, res);
    return [`Won at the sale: ${name} for ${money(w, paid)}.`, ...give(g, w, id, 'auction', paid)];
}

// The sale at the hammer: each lot, lost lots counting down, cards in person.
function holdSale(g: Save, w: WorldDef, a: NonNullable<MuseumDef['auctions']>): string[] {
    const s = salesOf(g), sale = s.next!, lots = s.lots ?? [], res: LotResult[] = [], out: string[] = [];
    const inPerson = g.day === sale && hourOf(g) - a.from < 1 && g.player.loc === a.place;   // at the saleroom as it starts
    const before = { ...(s.lost ?? {}) }, here = new Set(lots.map(l => l.id));
    for (const lot of lots) out.push(...settleLot(g, w, sale, lot, inPerson, res));
    // lost lots not in this sale come one sale nearer; one whose sales ran out goes to the dealer
    for (const id of Object.keys(before)) {
        if (here.has(id) || !s.lost || s.lost[id] === undefined) continue;
        if (!missing(g, id)) { delete s.lost[id]; continue; }
        s.lost[id] -= 1;
        if (s.lost[id] <= 0) { delete s.lost[id]; dealerOf(g).late = { ...(dealerOf(g).late ?? {}), [id]: auctionBase(w, id) }; }
    }
    if (s.lost && !Object.keys(s.lost).length) delete s.lost;
    if (lots.length) { s.held = (s.held ?? 0) + 1; keepPast(s, res); }
    delete s.lots; delete s.next;
    return out;
}

/* ---------- time ---------- */

/** The market's hour: the dealer's visit, a catalogue, the sale at its hour, cards left unanswered. */
export function settleMarket(g: Save, w: WorldDef): string[] {
    const m = museumDef(w);
    if (!m || (!m.dealer && !m.auctions) || !museumOpen(g, w)) return [];
    const out: string[] = [], opened = museumOf(g)!.opened!;
    if (m.dealer) {
        const st = dealerOf(g);
        st.next ??= opened + m.dealer.every;
        if (g.day >= st.next) out.push(...dealerVisit(g, w, m.dealer));
    }
    const a = m.auctions;
    if (a) {
        const s = salesOf(g);
        for (const c of [...(s.card ?? [])]) if (c.day !== g.day || c.hour !== hourOf(g)) out.push(...answerCard(g, w, c.id, false));
        if (s.next === undefined || (s.lots === undefined && (g.day > s.next || (g.day === s.next && hourOf(g) >= a.from)))) s.next = saleAfter(g, w);
        if (s.next === undefined) return out;
        // a catalogue a week before, from renown 1; the first one right after the opening
        if (s.lots === undefined && (!s.cats || (renownLevel(g, w) >= 1 && g.day >= s.next - CATALOGUE_DAYS))) {
            s.lots = catalogue(g, w, a, s.next);
            s.cats = (s.cats ?? 0) + 1;
            if (s.lots.length) out.push(`A catalogue for the sale on day ${s.next} at ${placeName(w, a.place)}: ${s.lots.length} ${s.lots.length === 1 ? 'lot' : 'lots'}.`);
        }
        if (s.lots !== undefined && (g.day > s.next || (g.day === s.next && hourOf(g) >= a.from))) out.push(...holdSale(g, w, a));
    }
    return out;
}
const placeName = (w: WorldDef, id: string) => w.places.find(p => p.id === id)?.name ?? id;

onHour.push((g, w) => settleMarket(g, w));

/* ---------- bidding ---------- */

/** Why this top bid can't be set ('' when it can): no such lot, above your money. `mult`: one of BID_STEPS, or null for
 *  no bid. */
export function whyNotBid(g: Save, w: WorldDef, id: string, mult: number | null): string {
    if (!museumOpen(g, w)) return 'The sales don\'t know you yet.';
    const lot = (peekSales(g).lots ?? []).find(l => l.id === id);
    if (!lot) return 'That isn\'t in the catalogue.';
    if (mult === null) return '';
    if (!(BID_STEPS as readonly number[]).includes(mult)) return 'That isn\'t a bid you can set.';
    if (Math.round(lot.est * mult) > g.player.money) return 'Not enough money.';
    return '';
}
/** Set (or clear, `mult` null) your top bid for a lot before the sale. Returns why not, or ''. */
export function setBid(g: Save, w: WorldDef, id: string, mult: number | null): string {
    const why = whyNotBid(g, w, id, mult);
    if (why) return why;
    const lot = salesOf(g).lots!.find(l => l.id === id)!;
    if (mult === null) delete lot.bid; else lot.bid = Math.round(lot.est * mult);
    return '';
}

/* ---------- for the screens (read without writing) ---------- */

export interface DealerView { on: boolean; next?: number; days?: number;
    stock: { id: string; name: string; icon?: string; pic?: string; price: number; asked?: boolean; late?: boolean; why: string }[];
    ask?: { id: string; name: string }; askable: { id: string; name: string; price: number }[] }
/** The Dealer tab: this week's stock and why each can't be bought, the next visit, the piece asked for, what can be
 *  asked for (its price with the premium). */
export function dealerView(g: Save, w: WorldDef): DealerView {
    const d = museumDef(w)?.dealer;
    if (!d || !museumOpen(g, w)) return { on: false, stock: [], askable: [] };
    const st = peekDealer(g), next = st.next ?? museumOf(g)!.opened! + d.every;
    const ask = st.ask;
    return { on: true, next, days: Math.max(0, next - g.day),
        stock: (st.stock ?? []).map(x => { const s = slotOf(w, x.id); return { id: x.id, name: s?.name ?? x.id, icon: s?.icon, pic: s?.pic, price: x.price, ...(x.asked ? { asked: true } : {}), ...(x.late ? { late: true } : {}), why: whyNotBuyPiece(g, w, x.id) }; }),
        ...(ask ? { ask: { id: ask, name: nameOf(w, ask) } } : {}),
        askable: ask ? [] : askable(g, w).map(p => ({ id: p.id, name: nameOf(w, p.id), price: marketPrice(g, w, p.base * (1 + (d.ask ?? 0))) })) };
}
export interface SalesView { on: boolean; next?: number; hour?: number; place?: string; placeName?: string;
    lots: { id: string; name: string; icon?: string; pic?: string; est: number; bid?: number; back?: boolean; bids: { mult: number; amount: number; why: string }[] }[];
    card: { id: string; name: string; price: number }[]; past: (LotResult & { name: string })[] }
/** The Sales tab: the next sale (day, hour, place), its catalogue's lots with your top bid and the bids you can set,
 *  an open card, the last results. */
export function salesView(g: Save, w: WorldDef): SalesView {
    const a = museumDef(w)?.auctions;
    if (!a || !museumOpen(g, w)) return { on: false, lots: [], card: [], past: [] };
    const s = peekSales(g), next = s.next ?? saleAfter(g, w);
    return { on: true, next, hour: a.from, place: a.place, placeName: placeName(w, a.place),
        lots: (s.lots ?? []).map(l => { const sl = slotOf(w, l.id); return { id: l.id, name: sl?.name ?? l.id, icon: sl?.icon, pic: sl?.pic, est: l.est, ...(l.bid !== undefined ? { bid: l.bid } : {}), ...(l.back ? { back: true } : {}),
            bids: BID_STEPS.map(mult => ({ mult, amount: Math.round(l.est * mult), why: whyNotBid(g, w, l.id, mult) })) }; }),
        card: (s.card ?? []).map(c => ({ id: c.id, name: nameOf(w, c.id), price: c.bid + c.step })),
        past: (s.past ?? []).map(r => ({ ...r, name: nameOf(w, r.id) })) };
}

/* ---------- the condition keys (`sales:`, `dealer:`) ---------- */

const COUNT = /^(\S+)\s+(\d+)$/;
function marketCount(g: Save, w: WorldDef, key: 'sales' | 'dealer', what: string): number {
    if (!museumDef(w)) return 0;
    if (key === 'sales') { const s = peekSales(g); return what === 'won' ? s.won ?? 0 : what === 'lots' ? s.lots_won ?? 0 : what === 'resold' ? s.resold ?? 0 : 0; }
    const d = peekDealer(g);
    return what === 'spent' ? d.spent ?? 0 : what === 'bought' ? d.bought ?? 0 : what === 'asked' ? d.asked ?? 0 : what === 'visits' ? d.visits ?? 0 : 0;
}
collectionLink.market = (g, w, key, v) => { const m = v.match(COUNT); return !!m && !!museumDef(w) && museumOf(g) !== undefined && marketCount(g, w, key, m[1].toLowerCase()) >= Number(m[2]); };
collectionLink.marketWords = (g, w, key, v) => {
    const m = v.match(COUNT); if (!m) return v;
    const n = Number(m[2]), what = m[1].toLowerCase(), s = n === 1 ? '' : 's';
    if (key === 'sales') return what === 'won' ? `${n} lot${s} won against the other collector` : what === 'lots' ? `${n} lot${s} won at the sales` : `${n} lot${s} the other collector sold back to you`;
    return what === 'spent' ? `${money(w, n)} spent with the dealer` : what === 'bought' ? `${n} piece${s} bought from the dealer`
        : what === 'asked' ? `${n} piece${s} asked of the dealer` : `${n} visit${s} of the dealer's you bought from`;
};

