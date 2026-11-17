import { onHour, collectionLink, museumLink, sceneLines } from './hooks.js';
import { museumDef, museumOf, museumState, museumOpen } from './museum.js';
import { slotsHere, collectionOf } from './collection.js';
import { whenHolds } from './when.js';
import { priceOf } from './bills.js';
import { book } from './ledger.js';
import { money } from './needs.js';
import { exampleOf } from './dayplan.js';
import { tierReached } from './tiers.js';
/** Top bids offered for a lot: the estimate, +25%, +50%, +100%. */
export const BID_STEPS = [1, 1.25, 1.5, 2];
// How many results the Sales tab keeps.
const PAST = 16;
// The rival's odds of wanting a lot of rung R4 and above, as a share of her usual odds (0.4 → 0.6).
const DEAR_WANTS = 1.5;
// A catalogue comes this many days before its sale.
const CATALOGUE_DAYS = 7;
const dealerOf = (g) => (museumState(g).dealer ??= {});
const salesOf = (g) => (museumState(g).sales ??= {});
const peekDealer = (g) => (museumOf(g)?.dealer ?? {});
const peekSales = (g) => (museumOf(g)?.sales ?? {});
/* ---------- small helpers ---------- */
/** (C-7) The resident made from one of the world's people (by the example's name), if this game has them. */
export function castNamed(g, w, name) {
    if (!name)
        return undefined;
    return Object.values(g.cast ?? {}).find(r => exampleOf(w, r)?.name === name);
}
/** (C-7) The dealer and the other collector as people in this game (undefined: words only). */
export const dealerPerson = (g, w) => castNamed(g, w, museumDef(w)?.dealer?.who);
export const rivalPerson = (g, w) => castNamed(g, w, museumDef(w)?.auctions?.rival?.who);
const rivalWord = (g, w) => rivalPerson(g, w)?.name ?? 'the other collector';
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return h >>> 0; };
// A seeded number in [0, 1) for this world, a visit or sale (`at`) and a piece.
const rnd = (g, at, id) => hash(`${g.world}|${at}|${id}`) / 4294967296;
const hourOf = (g) => Math.floor(g.minutes / 60);
const seasonLen = (g) => Math.max(1, Math.round(g.cfg?.seasonDays ?? 14));
/** A piece's rung from its yen before difficulty (the shop's rungs: R1 ¥1,000–9,000 … R5 ¥5,000,000–15,000,000; 0 free). */
export function pieceRung(price) {
    const p = price ?? 0;
    return p >= 5_000_000 ? 5 : p >= 500_000 ? 4 : p >= 80_000 ? 3 : p >= 10_000 ? 2 : p > 0 ? 1 : 0; // as museum.ts's rungOf
}
/** The museum's renown level now (M-A's engine; 0 until it says). */
export const renownLevel = (g, w) => museumLink.level?.(g, w) ?? 0;
/** Can the museum house this piece now? */
export function canHouse(g, w, s) {
    if (museumLink.canHouse)
        return museumLink.canHouse(g, w, s);
    if (!s.needsUpgrade)
        return true;
    const ups = museumOf(g)?.ups ?? {}, m = museumDef(w);
    return Object.keys(ups).some(id => id === s.needsUpgrade || m?.upgrades.find(u => u.id === id)?.does === s.needsUpgrade);
}
/** A museum price from its yen before difficulty. */
export const marketPrice = (g, w, base) => Math.max(0, Math.round(museumLink.price ? museumLink.price(g, w, base) : priceOf(g, base)));
/** Is this piece still to be had (not yours, or yours only as a replica)? A damaged piece is yours. */
export function missing(g, id) {
    const got = collectionOf(g)?.got?.[id];
    return !got || !!got.replica;
}
// The piece becomes yours (the museum's engine writes it; without it, the collection's own entry).
function give(g, w, id, src, paid) {
    if (museumLink.give)
        return museumLink.give(g, w, id, { src, paid });
    museumState(g);
    collectionOf(g).got[id] = { day: g.day, src, paid };
    return [];
}
const slotOf = (w, id) => w.collection?.slots.find(s => s.id === id);
const housable = (g, w, id) => { const s = slotOf(w, id); return !!s && canHouse(g, w, s); };
const nameOf = (w, id) => slotOf(w, id)?.name ?? id;
const sourcesOf = (s, kind) => (s.sources ?? []).filter(x => x.kind === kind);
// Weighted draw without putting back (each piece's key is u^(1/weight), the highest keys win), seeded.
function weighted(g, at, list, n) {
    if (n <= 0)
        return [];
    return list.map(x => ({ x, k: Math.pow(Math.max(1e-12, rnd(g, at, x.id)), 1 / Math.max(0.01, x.weight)) }))
        .sort((a, b) => b.k - a.k || (a.x.id < b.x.id ? -1 : 1)).slice(0, n).map(e => e.x);
}
/** The dealer's pool now: missing pieces this game has that the museum can house (R5 only from renown 3), with a
 *  `dealer` source whose `when` holds (one with a `when` is R-6's later way: +`late`), or a lot lost and never sold
 *  back (its estimate +`late`). The cheapest way of each piece. */
export function dealerPool(g, w) {
    const m = museumDef(w), d = m?.dealer;
    if (!m || !d || !museumOpen(g, w))
        return [];
    const late = 1 + (d.late ?? 0), lateLots = peekDealer(g).late ?? {}, level = renownLevel(g, w), out = [];
    for (const s of slotsHere(g, w)) {
        if (!s.sources?.length || !missing(g, s.id) || !canHouse(g, w, s))
            continue;
        let best = null;
        for (const src of sourcesOf(s, 'dealer')) {
            const raw = src.price ?? s.price;
            if (raw === undefined || !whenHolds(g, w, src.when))
                continue;
            if (pieceRung(s.price ?? raw) >= 5 && level < 3)
                continue;
            const base = Math.round(raw * (src.when ? late : 1));
            if (!best || base < best.base)
                best = { id: s.id, base, weight: src.chance ?? 1 };
        }
        if (!best && lateLots[s.id] !== undefined && !(pieceRung(s.price ?? lateLots[s.id]) >= 5 && level < 3))
            best = { id: s.id, base: Math.round(lateLots[s.id] * late), weight: 1, late: true };
        if (best)
            out.push(best);
    }
    return out;
}
/** How many pieces a visit brings now (`more` from a renown level). */
export function stockSize(g, w) {
    const d = museumDef(w)?.dealer;
    if (!d)
        return 0;
    return (d.more && renownLevel(g, w) >= d.more[0] ? d.more[1] : d.stock) + extraPieces(g, w);
}
/** (C-7) The pieces a visit adds from the dealer's tier (`extra`: [tier, pieces]; 0 without her in the game). */
export function extraPieces(g, w) {
    const e = museumDef(w)?.dealer?.extra, r = e && dealerPerson(g, w);
    return e && r && tierReached(g, r.avatar) >= e[0] ? e[1] : 0;
}
/** (C-7) Is the dealer at the museum today (a visit's day)? */
export function dealerHere(g, w) {
    const d = museumDef(w)?.dealer, st = peekDealer(g);
    return !!d && museumOpen(g, w) && !!st.calls && st.next !== undefined && st.next - d.every === g.day;
}
// A visit. No pooled piece waits longer than `max(pity, pool ÷ stock)` visits (the longest a full round of the pool
// takes): the pieces that would wait longer if not offered now come first (the longest waits first), then every piece
// that has waited `pity` visits, then by rarity. The piece asked for comes on top of the stock (one more than `stock`),
// so it never takes a place the pity timer needs.
function dealerVisit(g, w, d) {
    const st = dealerOf(g), at = `visit${g.day}`;
    st.calls = (st.calls ?? 0) + 1;
    const pool = dealerPool(g, w), byId = new Map(pool.map(p => [p.id, p]));
    const waited = {};
    for (const p of pool)
        waited[p.id] = (st.waited?.[p.id] ?? 0) + 1;
    const n = stockSize(g, w), picks = [];
    const order = [...pool].sort((a, b) => waited[b.id] - waited[a.id] || rnd(g, at, a.id) - rnd(g, at, b.id));
    // how many must come now: for each visit ahead, the pieces that reach the longest wait by then, less what the
    // visits before it can take
    const most = Math.max(d.pity, Math.ceil(pool.length / Math.max(1, n)));
    let must = 0;
    for (let j = 1, k = 0; j <= most; j++) {
        while (k < order.length && waited[order[k].id] >= most - j + 1)
            k++;
        must = Math.max(must, k - n * (j - 1));
    }
    const asked = st.ask && byId.has(st.ask) ? byId.get(st.ask) : null;
    // (track 7) a tip from the rewards shop: another piece on top, on the ask's terms
    const tip = st.tip && st.tip !== st.ask && byId.has(st.tip) ? byId.get(st.tip) : null;
    const room = n + (asked ? 1 : 0) + (tip ? 1 : 0); // (the piece asked for is an extra one)
    const take = (p, ask = false) => { if (picks.length < room && !picks.some(x => x.p.id === p.id))
        picks.push({ p, ...(ask ? { asked: true } : {}) }); };
    if (asked)
        take(asked, true);
    if (tip)
        take(tip, true);
    delete st.ask;
    delete st.askd;
    delete st.tip; // (askd: a second-visit mark older saves may still have)
    for (const p of order.slice(0, Math.min(n, must)))
        take(p);
    for (const p of order)
        if (waited[p.id] >= d.pity)
            take(p);
    const left = new Set(picks.map(x => x.p.id));
    for (const p of weighted(g, at, pool.filter(x => !left.has(x.id)), room - picks.length))
        take(p);
    st.stock = picks.map(({ p, asked }) => ({ id: p.id, price: marketPrice(g, w, p.base * (asked ? 1 + (d.ask ?? 0) : 1)),
        ...(asked ? { asked: true } : {}), ...(p.late ? { late: true } : {}) }));
    for (const x of picks)
        waited[x.p.id] = 0;
    // (C-7) the last pieces of a full visit are the ones her tier added
    const extra = extraPieces(g, w);
    if (extra && picks.length === room)
        for (const it of st.stock.filter(x => !x.asked).slice(-extra))
            it.extra = true;
    st.waited = waited;
    st.next = g.day + d.every;
    if (!st.stock.length)
        return [];
    const who = dealerPerson(g, w)?.name;
    if (who)
        return [st.stock.length === 1 ? `${who}'s van is outside the museum: one piece this week.` : `${who}'s van is outside the museum: ${st.stock.length} pieces this week.`];
    return [st.stock.length === 1 ? 'The dealer\'s van is outside the museum: one piece this week.' : `The dealer's van is outside the museum: ${st.stock.length} pieces this week.`];
}
/** Why this stock piece can't be bought ('' when it can). */
export function whyNotBuyPiece(g, w, id) {
    if (!museumDef(w)?.dealer || !museumOpen(g, w))
        return 'The dealer doesn\'t call yet.';
    const it = (peekDealer(g).stock ?? []).find(x => x.id === id);
    if (!it)
        return 'The dealer hasn\'t brought that.';
    if (!missing(g, id))
        return 'You already have it.';
    const s = slotOf(w, id);
    if (!s || !canHouse(g, w, s))
        return 'The museum can\'t house it yet.';
    if (g.player.money < it.price)
        return 'Not enough money.';
    return '';
}
/** Buy a piece of this week's stock (she delivers it). Returns why not, or '' and the piece is yours. */
export function buyFromDealer(g, w, id) {
    const why = whyNotBuyPiece(g, w, id);
    if (why)
        return why;
    const st = dealerOf(g), i = st.stock.findIndex(x => x.id === id), it = st.stock[i];
    g.player.money -= it.price;
    book(g, `The dealer: ${nameOf(w, id)}`, -it.price);
    st.stock.splice(i, 1);
    st.spent = (st.spent ?? 0) + it.price;
    st.bought = (st.bought ?? 0) + 1;
    const visit = (st.next ?? g.day) - (museumDef(w).dealer.every);
    if (st.last !== visit) {
        st.last = visit;
        st.visits = (st.visits ?? 0) + 1;
    }
    if (st.late?.[id] !== undefined)
        delete st.late[id];
    if (st.waited)
        delete st.waited[id];
    give(g, w, id, 'dealer', it.price);
    return '';
}
/** What can be asked for: the dealer's pool less this week's stock. */
export function askable(g, w) {
    const stock = new Set((peekDealer(g).stock ?? []).map(x => x.id));
    return dealerPool(g, w).filter(p => !stock.has(p.id));
}
/** Ask the dealer for a piece: it comes with her next visit, at +`ask`. One at a time. Returns why not, or ''. */
export function askDealer(g, w, id) {
    if (!museumDef(w)?.dealer || !museumOpen(g, w))
        return 'The dealer doesn\'t call yet.';
    if (peekDealer(g).ask)
        return 'You\'ve already asked for a piece.';
    if (!askable(g, w).some(p => p.id === id))
        return 'The dealer can\'t bring that.';
    const st = dealerOf(g);
    st.ask = id;
    st.asked = (st.asked ?? 0) + 1;
    return '';
}
/** (track 7) What a dealer's tip can ask for: what can be asked, less the piece already asked; each at the ask's price. */
export function tippable(g, w) {
    const d = museumDef(w)?.dealer;
    if (!d || !museumOpen(g, w))
        return [];
    const ask = peekDealer(g).ask;
    return askable(g, w).filter(p => p.id !== ask).map(p => ({ id: p.id, name: nameOf(w, p.id), price: marketPrice(g, w, p.base * (1 + (d.ask ?? 0))) }));
}
/** (track 7) Why a tip can't be given now ('' when it can). */
export function whyNoTip(g, w) {
    if (!museumDef(w)?.dealer || !museumOpen(g, w))
        return 'The dealer doesn\'t call yet.';
    if (peekDealer(g).tip)
        return 'A tip is already waiting for her next visit.';
    return tippable(g, w).length ? '' : 'Nothing she can bring.';
}
/** (track 7) The rewards shop's dealer's tip: this piece comes with her next visit on top of the stock (and of any piece
 *  asked), at the asked price. Returns why not, or ''. */
export function tipDealer(g, w, id) {
    const why = whyNoTip(g, w);
    if (why)
        return why;
    if (!tippable(g, w).some(p => p.id === id))
        return 'The dealer can\'t bring that.';
    dealerOf(g).tip = id;
    return '';
}
/* ---------- the sales ---------- */
/** The first sale on or after this moment (a sale day before its hour counts). */
export function saleAfter(g, w, day = g.day, hour = hourOf(g)) {
    const a = museumDef(w)?.auctions;
    if (!a)
        return undefined;
    const len = seasonLen(g), days = [...new Set(a.days.filter(d => d <= len))].sort((x, y) => x - y);
    if (!days.length)
        return undefined;
    for (let k = Math.floor((Math.max(1, day) - 1) / len);; k++)
        for (const d of days) {
            const s = k * len + d;
            if (s > day || (s === day && hour < a.from))
                return s;
        }
}
/** A piece that can come up at a sale: its estimate's yen before difficulty and rarity weight. */
function auctionPool(g, w) {
    const lost = peekSales(g).lost ?? {}, late = peekDealer(g).late ?? {}, level = renownLevel(g, w), out = [];
    for (const s of slotsHere(g, w)) {
        if (!s.sources?.length || lost[s.id] !== undefined || late[s.id] !== undefined || !missing(g, s.id) || !canHouse(g, w, s))
            continue;
        let best = null;
        for (const src of sourcesOf(s, 'auction')) {
            const raw = src.price ?? s.price;
            if (raw === undefined || !whenHolds(g, w, src.when))
                continue;
            if (pieceRung(s.price ?? raw) >= 5 && level < 3)
                continue;
            if (!best || raw < best.base)
                best = { id: s.id, base: raw, weight: src.chance ?? 1 };
        }
        if (best)
            out.push(best);
    }
    return out;
}
// The estimate a lost lot was taken at (its auction source's yen before difficulty).
const auctionBase = (w, id) => {
    const s = slotOf(w, id);
    if (!s)
        return 0;
    const ps = sourcesOf(s, 'auction').map(x => x.price ?? s.price).filter((v) => Number.isFinite(v));
    return ps.length ? Math.min(...ps) : s.price ?? 0;
};
/** How many lots a sale has now (`more` from a renown level). */
export function lotCount(g, w) {
    const a = museumDef(w)?.auctions;
    if (!a)
        return 0;
    return a.more && renownLevel(g, w) >= a.more[0] ? a.more[1] : a.lots;
}
// The catalogue: lots coming back first (the fewest sales left first), then by rarity.
function catalogue(g, w, a, sale) {
    const s = salesOf(g), n = lotCount(g, w), again = 1 + (a.again ?? 0), lots = [];
    const back = Object.entries(s.lost ?? {}).filter(([id]) => missing(g, id)).sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));
    for (const [id] of back)
        if (lots.length < n) {
            const sl = slotOf(w, id);
            if (sl && canHouse(g, w, sl))
                lots.push({ id, est: marketPrice(g, w, auctionBase(w, id) * again), back: true });
        }
    // (track 7) the early catalogue's piece is one lot more: the draw leaves it out
    for (const p of weighted(g, `sale${sale}`, auctionPool(g, w).filter(p => !lots.some(l => l.id === p.id) && p.id !== s.early), n - lots.length))
        lots.push({ id: p.id, est: marketPrice(g, w, p.base) });
    const early = s.early && !lots.some(l => l.id === s.early) ? auctionPool(g, w).find(p => p.id === s.early) : undefined;
    if (early)
        lots.push({ id: early.id, est: marketPrice(g, w, early.base), early: true });
    delete s.early;
    return lots;
}
/** (track 7) What an early catalogue can bring: missing pieces the sales could bring, not in the catalogue already;
 *  each with its estimate now. */
export function earlyPieces(g, w) {
    if (!museumDef(w)?.auctions || !museumOpen(g, w))
        return [];
    const lots = new Set((peekSales(g).lots ?? []).map(l => l.id));
    return auctionPool(g, w).filter(p => !lots.has(p.id)).map(p => ({ id: p.id, name: nameOf(w, p.id), price: marketPrice(g, w, p.base) }));
}
/** (track 7) Why an early catalogue can't be had now ('' when it can). */
export function whyNoEarly(g, w) {
    if (!museumDef(w)?.auctions || !museumOpen(g, w))
        return 'The sales don\'t know you yet.';
    if (peekSales(g).early || (peekSales(g).lots ?? []).some(l => l.early))
        return 'An early lot is already coming.';
    return earlyPieces(g, w).length ? '' : 'Nothing the sales can bring.';
}
/** (track 7) The rewards shop's early catalogue: one more lot of this piece at the next sale, in its catalogue now if it's
 *  out, else when it comes out. Returns why not, or ''. */
export function earlyLot(g, w, id) {
    const why = whyNoEarly(g, w);
    if (why)
        return why;
    const p = earlyPieces(g, w).find(x => x.id === id);
    if (!p)
        return 'The sales can\'t bring that.';
    const s = salesOf(g);
    if (s.lots)
        s.lots.push({ id, est: p.price, early: true });
    else
        s.early = id;
    return '';
}
/** The other collector at a lot (seeded per sale and lot): does she want it, and her top bid (yen). None for a lot she
 *  sells back. Her odds rise for R4 and above, her top with the museum's renown. */
export function rivalAt(g, w, sale, lot) {
    const r = museumDef(w)?.auctions?.rival;
    if (!r || lot.back)
        return { wants: false, top: 0 };
    const at = `sale${sale}`, rung = pieceRung(slotOf(w, lot.id)?.price ?? auctionBase(w, lot.id));
    const odds = Math.min(1, r.wants * (rung >= 4 ? DEAR_WANTS : 1));
    const share = r.top[0] + (r.top[1] - r.top[0]) * rnd(g, at, `${lot.id}|top`) + (r.perLevel ?? 0) * renownLevel(g, w);
    return { wants: rnd(g, at, `${lot.id}|wants`) < odds, top: Math.round(lot.est * share) };
}
const stepOf = (lot) => Math.max(1, Math.round(lot.est * 0.1));
// One lot's outcome at the hammer (or a card, in person). Returns lines.
function settleLot(g, w, sale, lot, inPerson, out) {
    const s = salesOf(g), a = museumDef(w).auctions, name = nameOf(w, lot.id);
    // had another way since the catalogue (or a damaged find waiting for the workshop): nothing to sell
    if (!missing(g, lot.id) || !housable(g, w, lot.id)) {
        if (lot.back && s.lost)
            delete s.lost[lot.id];
        return [];
    }
    const r = rivalAt(g, w, sale, lot), step = stepOf(lot), bid = lot.bid;
    const win = (paid, against) => {
        g.player.money -= paid;
        book(g, `The sale: ${name}`, -paid);
        s.lots_won = (s.lots_won ?? 0) + 1;
        if (against)
            s.won = (s.won ?? 0) + 1;
        if (lot.back) {
            s.resold = (s.resold ?? 0) + 1;
            if (s.lost)
                delete s.lost[lot.id];
        }
        if (against || lot.back)
            tookFrom(s, lot.id);
        out.push({ day: sale, id: lot.id, est: lot.est, won: true, paid, ...(against ? { rival: true } : {}), ...(lot.back ? { back: true } : {}) });
        return [`Won at the sale: ${name} for ${money(w, paid)}.`, ...give(g, w, lot.id, 'auction', paid)];
    };
    const lose = (why, rival) => {
        out.push({ day: sale, id: lot.id, est: lot.est, won: false, why, ...(rival ? { rival: true } : {}), ...(lot.back ? { back: true } : {}) });
        if (lot.back) {
            if (s.lost)
                delete s.lost[lot.id];
            dealerOf(g).late = { ...(dealerOf(g).late ?? {}), [lot.id]: auctionBase(w, lot.id) };
            return [];
        }
        if (rival || why === 'money') {
            (s.lost ??= {})[lot.id] = a.back ?? 2;
        }
        return why === 'money' ? [`The bid for ${name} fell through: not enough money at the hammer.`] : rival ? [rivalPerson(g, w) ? `Lost at the sale: ${name} went to ${rivalWord(g, w)}.` : `Lost at the sale: ${name} went to the other collector.`] : [];
    };
    if (!r.wants) {
        if (bid === undefined) {
            if (lot.back)
                return lose('unsold', false);
            out.push({ day: sale, id: lot.id, est: lot.est, won: false, why: 'nobid' });
            return [];
        }
        return g.player.money >= lot.est ? win(lot.est, false) : lose('money', false);
    }
    if (bid !== undefined && bid >= r.top + step)
        return g.player.money >= r.top + step ? win(r.top + step, true) : lose('money', true);
    if (bid !== undefined && inPerson && g.player.money >= bid + step) {
        (s.card ??= []).push({ id: lot.id, est: lot.est, bid, her: r.top, step, day: g.day, hour: hourOf(g) });
        return [rivalPerson(g, w) ? `${rivalWord(g, w)} outbids you on ${name}. One more step, ${money(w, bid + step)}?` : `The other collector outbids you on ${name}. One more step, ${money(w, bid + step)}?`];
    }
    return lose(bid === undefined ? 'nobid' : 'outbid', true);
}
const keepPast = (s, res) => { s.past = [...res, ...(s.past ?? [])].slice(0, PAST); };
// (C-7) a piece taken from her, kept for good (the results keep only the last few)
const tookFrom = (s, id) => { if (!(s.took ??= []).includes(id))
    s.took.push(id); };
/** (C-7) The pieces you took from the other collector: won over her bid or bought back from her (older saves: what
 *  the last results show). */
export function takenFromRival(g) {
    const s = peekSales(g);
    return [...new Set([...(s.took ?? []), ...(s.past ?? []).filter(r => r.won && (r.rival || r.back)).map(r => r.id)])];
}
/** Answer an in-person card: one more step, or let it go. Returns lines. */
export function answerCard(g, w, id, yes) {
    const s = salesOf(g), i = (s.card ?? []).findIndex(c => c.id === id);
    if (i < 0)
        return [];
    const c = s.card.splice(i, 1)[0], a = museumDef(w)?.auctions, name = nameOf(w, id), res = [];
    if (!s.card.length)
        delete s.card;
    const lose = (why) => {
        res.push({ day: c.day, id, est: c.est, won: false, why, rival: true });
        keepPast(s, res);
        if (missing(g, id))
            (s.lost ??= {})[id] = a?.back ?? 2;
        return [rivalPerson(g, w) ? `Lost at the sale: ${name} went to ${rivalWord(g, w)}.` : `Lost at the sale: ${name} went to the other collector.`];
    };
    if (!missing(g, id) || !housable(g, w, id))
        return [];
    if (!yes)
        return lose('card');
    const mine = c.bid + c.step, paid = c.her + c.step;
    if (mine < paid || g.player.money < paid)
        return lose('card');
    g.player.money -= paid;
    book(g, `The sale: ${name}`, -paid);
    s.lots_won = (s.lots_won ?? 0) + 1;
    s.won = (s.won ?? 0) + 1;
    tookFrom(s, id);
    res.push({ day: c.day, id, est: c.est, won: true, paid, rival: true });
    keepPast(s, res);
    return [`Won at the sale: ${name} for ${money(w, paid)}.`, ...give(g, w, id, 'auction', paid)];
}
// The sale at the hammer: each lot, lost lots counting down, cards in person.
function holdSale(g, w, a) {
    const s = salesOf(g), sale = s.next, lots = s.lots ?? [], res = [], out = [];
    const inPerson = g.day === sale && hourOf(g) - a.from < 1 && g.player.loc === a.place; // at the saleroom as it starts
    const before = { ...(s.lost ?? {}) }, here = new Set(lots.map(l => l.id));
    for (const lot of lots)
        out.push(...settleLot(g, w, sale, lot, inPerson, res));
    // lost lots not in this sale come one sale nearer; one whose sales ran out goes to the dealer
    for (const id of Object.keys(before)) {
        if (here.has(id) || !s.lost || s.lost[id] === undefined)
            continue;
        if (!missing(g, id)) {
            delete s.lost[id];
            continue;
        }
        s.lost[id] -= 1;
        if (s.lost[id] <= 0) {
            delete s.lost[id];
            dealerOf(g).late = { ...(dealerOf(g).late ?? {}), [id]: auctionBase(w, id) };
        }
    }
    if (s.lost && !Object.keys(s.lost).length)
        delete s.lost;
    if (lots.length) {
        s.held = (s.held ?? 0) + 1;
        keepPast(s, res);
    }
    delete s.lots;
    delete s.next;
    return out;
}
/* ---------- time ---------- */
/** The market's hour: the dealer's visit, a catalogue, the sale at its hour, cards left unanswered. */
export function settleMarket(g, w) {
    const m = museumDef(w);
    if (!m || (!m.dealer && !m.auctions) || !museumOpen(g, w))
        return [];
    const out = [], opened = museumOf(g).opened;
    if (m.dealer) {
        const st = dealerOf(g);
        st.next ??= opened + m.dealer.every;
        if (g.day >= st.next)
            out.push(...dealerVisit(g, w, m.dealer));
    }
    const a = m.auctions;
    if (a) {
        const s = salesOf(g);
        for (const c of [...(s.card ?? [])])
            if (c.day !== g.day || c.hour !== hourOf(g))
                out.push(...answerCard(g, w, c.id, false));
        if (s.next === undefined || (s.lots === undefined && (g.day > s.next || (g.day === s.next && hourOf(g) >= a.from))))
            s.next = saleAfter(g, w);
        if (s.next === undefined)
            return out;
        // a catalogue a week before, from renown 1; the first one right after the opening
        if (s.lots === undefined && (!s.cats || (renownLevel(g, w) >= 1 && g.day >= s.next - CATALOGUE_DAYS))) {
            s.lots = catalogue(g, w, a, s.next);
            s.cats = (s.cats ?? 0) + 1;
            if (s.lots.length)
                out.push(`A catalogue for the sale on day ${s.next} at ${placeName(w, a.place)}: ${s.lots.length} ${s.lots.length === 1 ? 'lot' : 'lots'}.`);
        }
        if (s.lots !== undefined && (g.day > s.next || (g.day === s.next && hourOf(g) >= a.from)))
            out.push(...holdSale(g, w, a));
    }
    return out;
}
const placeName = (w, id) => w.places.find(p => p.id === id)?.name ?? id;
onHour.push((g, w) => settleMarket(g, w));
/* ---------- bidding ---------- */
/** Why this top bid can't be set ('' when it can): no such lot, above your money. `mult`: one of BID_STEPS, or null for
 *  no bid. */
export function whyNotBid(g, w, id, mult) {
    if (!museumOpen(g, w))
        return 'The sales don\'t know you yet.';
    const lot = (peekSales(g).lots ?? []).find(l => l.id === id);
    if (!lot)
        return 'That isn\'t in the catalogue.';
    if (mult === null)
        return '';
    if (!BID_STEPS.includes(mult))
        return 'That isn\'t a bid you can set.';
    if (Math.round(lot.est * mult) > g.player.money)
        return 'Not enough money.';
    return '';
}
/** Set (or clear, `mult` null) your top bid for a lot before the sale. Returns why not, or ''. */
export function setBid(g, w, id, mult) {
    const why = whyNotBid(g, w, id, mult);
    if (why)
        return why;
    const lot = salesOf(g).lots.find(l => l.id === id);
    if (mult === null)
        delete lot.bid;
    else
        lot.bid = Math.round(lot.est * mult);
    return '';
}
/** The Dealer tab: this week's stock and why each can't be bought, the next visit, the piece asked for, what can be
 *  asked for (its price with the premium). */
export function dealerView(g, w) {
    const d = museumDef(w)?.dealer;
    if (!d || !museumOpen(g, w))
        return { on: false, stock: [], askable: [] };
    const st = peekDealer(g), next = st.next ?? museumOf(g).opened + d.every;
    const ask = st.ask;
    const who = dealerPerson(g, w)?.name;
    return { on: true, next, days: Math.max(0, next - g.day), ...(who ? { who } : {}), ...(dealerHere(g, w) ? { here: true } : {}),
        stock: (st.stock ?? []).map(x => { const s = slotOf(w, x.id); return { id: x.id, name: s?.name ?? x.id, icon: s?.icon, pic: s?.pic, price: x.price, ...(x.asked ? { asked: true } : {}), ...(x.late ? { late: true } : {}), ...(x.extra ? { extra: true } : {}), why: whyNotBuyPiece(g, w, x.id) }; }),
        ...(ask ? { ask: { id: ask, name: nameOf(w, ask) } } : {}),
        askable: ask ? [] : askable(g, w).map(p => ({ id: p.id, name: nameOf(w, p.id), price: marketPrice(g, w, p.base * (1 + (d.ask ?? 0))) })) };
}
/** The Sales tab: the next sale (day, hour, place), its catalogue's lots with your top bid and the bids you can set,
 *  an open card, the last results. */
export function salesView(g, w) {
    const a = museumDef(w)?.auctions;
    if (!a || !museumOpen(g, w))
        return { on: false, lots: [], card: [], past: [] };
    const s = peekSales(g), next = s.next ?? saleAfter(g, w);
    const who = rivalPerson(g, w)?.name;
    return { on: true, next, hour: a.from, place: a.place, placeName: placeName(w, a.place), ...(who ? { who } : {}),
        lots: (s.lots ?? []).map(l => {
            const sl = slotOf(w, l.id);
            return { id: l.id, name: sl?.name ?? l.id, icon: sl?.icon, pic: sl?.pic, est: l.est, ...(l.bid !== undefined ? { bid: l.bid } : {}), ...(l.back ? { back: true } : {}),
                bids: BID_STEPS.map(mult => ({ mult, amount: Math.round(l.est * mult), why: whyNotBid(g, w, l.id, mult) })) };
        }),
        card: (s.card ?? []).map(c => ({ id: c.id, name: nameOf(w, c.id), price: c.bid + c.step })),
        past: (s.past ?? []).map(r => ({ ...r, name: nameOf(w, r.id) })) };
}
/* ---------- the condition keys (`sales:`, `dealer:`) ---------- */
const COUNT = /^(\S+)\s+(\d+)$/;
function marketCount(g, w, key, what) {
    if (!museumDef(w))
        return 0;
    if (key === 'sales') {
        const s = peekSales(g);
        return what === 'won' ? s.won ?? 0 : what === 'lots' ? s.lots_won ?? 0 : what === 'resold' ? s.resold ?? 0
            : what === 'bested' ? (s.won ?? 0) + (s.resold ?? 0) : what === 'lent' ? (museumOf(g)?.loans?.n ?? 0) : 0;
    }
    const d = peekDealer(g);
    return what === 'spent' ? d.spent ?? 0 : what === 'bought' ? d.bought ?? 0 : what === 'asked' ? d.asked ?? 0 : what === 'visits' ? d.visits ?? 0 : 0;
}
collectionLink.market = (g, w, key, v) => {
    if (key === 'dealer' && v.trim().toLowerCase() === 'here')
        return dealerHere(g, w);
    const m = v.match(COUNT);
    return !!m && !!museumDef(w) && museumOf(g) !== undefined && marketCount(g, w, key, m[1].toLowerCase()) >= Number(m[2]);
};
collectionLink.marketWords = (g, w, key, v) => {
    if (key === 'dealer' && v.trim().toLowerCase() === 'here')
        return 'the dealer\'s visit';
    const m = v.match(COUNT);
    if (!m)
        return v;
    const n = Number(m[2]), what = m[1].toLowerCase(), s = n === 1 ? '' : 's';
    if (key === 'sales')
        return what === 'won' ? `${n} lot${s} won against the other collector` : what === 'lots' ? `${n} lot${s} won at the sales`
            : what === 'bested' ? `${n} lot${s} taken from the other collector` : what === 'lent' ? `${n} piece${s} lent to the other collector's foundation`
                : `${n} lot${s} the other collector sold back to you`;
    return what === 'spent' ? `${money(w, n)} spent with the dealer` : what === 'bought' ? `${n} piece${s} bought from the dealer`
        : what === 'asked' ? `${n} piece${s} asked of the dealer` : `${n} visit${s} of the dealer's you bought from`;
};
/* ---------- (C-7) what the AI is told at a sale and at the van ---------- */
const listOf = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] ?? '');
/** At the saleroom on a sale's day (until two hours after the hammer): the lots with {{user}}'s top bids, today's
 *  results, and the other collector, here in person or bidding by phone. At the dealer's van on a visit's day, with her
 *  here: this week's pieces at their prices (the game's) and the one asked for. Facts only: her manner is her tier's. */
export function marketLines(g, w, present) {
    const m = museumDef(w);
    if (!m || !museumOpen(g, w))
        return [];
    const out = [], here = new Set(present.map(r => r.avatar)), a = m.auctions, s = peekSales(g), h = hourOf(g);
    if (a && g.player.loc === a.place && h < a.from + 2) {
        const due = s.next === g.day && !!s.lots?.length, today = (s.past ?? []).filter(r => r.day === g.day);
        if (due)
            out.push(`The museum sale is here today at ${a.from}:00. The lots: ${listOf(s.lots.map(l => `${nameOf(w, l.id)} (estimate ${money(w, l.est)}${l.bid !== undefined ? `; {{user}}'s top bid ${money(w, l.bid)}` : ''}${l.back ? '; sold back by the other collector' : ''})`))}. The prices are the game's: nobody in the scene changes them.`);
        const mine = today.filter(r => r.won).map(r => nameOf(w, r.id)), hers = today.filter(r => !r.won && r.rival).map(r => nameOf(w, r.id));
        if (mine.length)
            out.push(`At today's sale {{user}} won ${listOf(mine)}.`);
        if (hers.length)
            out.push(`At today's sale ${rivalWord(g, w)} took ${listOf(hers)}.`);
        if (due || today.length) {
            const r = rivalPerson(g, w);
            out.push(r && here.has(r.avatar) ? `${r.name}, the other collector, is here in person for the sale.` : 'The other collector bids by phone.');
        }
    }
    const d = dealerPerson(g, w);
    if (d && here.has(d.avatar) && dealerHere(g, w)) {
        const stock = (peekDealer(g).stock ?? []).filter(x => missing(g, x.id));
        out.push(stock.length
            ? `${d.name}'s van holds this week's pieces: ${listOf(stock.map(x => `${nameOf(w, x.id)} (${money(w, x.price)}${x.asked ? ', the one {{user}} asked for' : x.extra ? ', from the back of the van' : ''})`))}. The prices are the game's and she delivers what {{user}} buys; she may tell each piece's story, but never sells below its price.`
            : `${d.name}'s van is here; {{user}} has bought everything she brought this week.`);
    }
    return out;
}
sceneLines.push(marketLines);
