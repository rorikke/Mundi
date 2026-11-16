// The rival's foundation borrowing your pieces (C-7, RR-1 of the end-game revenue): `w.collection.museum.loans`
// (LoanDef in core/world.ts). At the start of each season (its first three days), once her condition holds and she's in
// the game, she asks for one piece of yours on show that you took from her at a sale (won over her bid, or bought back
// from her; sim/market.ts keeps them) or one the world names (`also`), of rung `min` or more, not lent in the last
// `again` days: the dearest fee first. The ask waits `wait` days for Lend or Refuse in the Museum tab, then lapses. Lent,
// the fee is paid at once and the piece is away until the season's last day: not on show (sim/museum.ts `onShow`), so
// it brings no renown, can't be in a show and can't be stolen, but it's still yours (the museum's percentage, and what
// reads it, count it). One loan at a time; `sales: lent <n>` counts them. The save: `g.collection.museum.loans`
// ({ ask, now, back: id → the day it came back, n, season }). With the collection off, no museum, the museum not yours
// yet, or her not in the game, nothing here reads or writes anything.
import type { Save, Resident } from '../core/store.js';
import type { WorldDef, SlotDef, LoanDef } from '../core/world.js';
import { onHour, sceneLines, museumHooks } from './hooks.js';
import { museumDef, museumOf, museumState, museumOpen, onShow, rungOf, basePrice, hasPiece } from './museum.js';
import { castNamed, takenFromRival } from './market.js';
import { whenHolds } from './when.js';
import { payOf } from './bills.js';
import { book } from './ledger.js';
import { money } from './needs.js';
import { note } from './facts.js';
import { seasonDays } from './time.js';

/** A loan asked for (`day` asked, the fee it brings) or under way (`from`, away until `until`, the season's last day). */
export interface Loan { id: string; fee: number; day: number; until: number; from?: number }
export interface LoansState { ask?: Loan; now?: Loan; back?: Record<string, number>; n?: number; season?: number }

/** Days to answer, days before the same piece is asked again, the lowest rung, the first days of a season she asks in. */
export const LOAN = { wait: 7, again: 56, min: 3, askDays: 3 };

const loansDef = (w: WorldDef): LoanDef | undefined => museumDef(w)?.loans;
const peek = (g: Save): LoansState => ((museumOf(g) as any)?.loans ?? {}) as LoansState;
const state = (g: Save): LoansState => (((museumState(g) as any).loans ??= {}) as LoansState);
const slotOf = (w: WorldDef, id: string) => w.collection?.slots.find(s => s.id === id);
const nameOf = (w: WorldDef, id: string) => slotOf(w, id)?.name ?? id;
const len = (g: Save) => Math.max(1, seasonDays(g));
const seasonOf = (g: Save, day = g.day) => Math.floor((Math.max(1, day) - 1) / len(g));
const seasonEnd = (g: Save, day = g.day) => (seasonOf(g, day) + 1) * len(g);
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Who borrows (the resident made from `loans.who`), when the world has loans and she's in this game. */
export const lender = (g: Save, w: WorldDef): Resident | undefined => castNamed(g, w, loansDef(w)?.who);
const labelOf = (w: WorldDef) => loansDef(w)?.label ?? 'an exhibition';
/** The fee a piece would bring for a season (after the difficulty's pay; 0: never asked for). */
export function loanFee(g: Save, w: WorldDef, s: SlotDef): number {
    const L = loansDef(w), r = rungOf(s);
    return L && r >= (L.min ?? LOAN.min) ? payOf(g, L.fees[r - 1] ?? 0) : 0;
}
/** The pieces she would ask for now, the first the one she asks for: on show, yours for real, taken from her or named,
 *  a fee above 0, not lent in the last `again` days; the dearest fee first, then the dearest piece, then seeded. */
export function loanable(g: Save, w: WorldDef): SlotDef[] {
    const L = loansDef(w); if (!L || !museumOpen(g, w)) return [];
    const st = peek(g), again = L.again ?? LOAN.again, wanted = new Set([...takenFromRival(g), ...(L.also ?? [])]);
    const out: SlotDef[] = [];
    for (const [id, at] of onShow(g, w)) {
        const s = slotOf(w, id);
        if (!s || at === 'home' || !wanted.has(id) || !hasPiece(g, id) || !(loanFee(g, w, s) > 0)) continue;
        const back = st.back?.[id];
        if (back !== undefined && g.day - back < again) continue;
        out.push(s);
    }
    const seed = (id: string) => hash(`${g.world}|loan${seasonOf(g)}|${id}`);
    return out.sort((a, b) => loanFee(g, w, b) - loanFee(g, w, a) || basePrice(b) - basePrice(a) || seed(a.id) - seed(b.id));
}

/** The hour: a loan back on the morning after the season's last day, an ask lapsing, and a new ask in a season's first
 *  days (once a season). Returns the lines to show. */
export function settleLoans(g: Save, w: WorldDef): string[] {
    const L = loansDef(w);
    if (!L || !museumOpen(g, w)) return [];
    const out: string[] = [], who = lender(g, w);
    const st0 = peek(g);
    if (st0.now && g.day > st0.now.until) {
        const st = state(g), id = st.now!.id;
        (st.back ??= {})[id] = g.day; delete st.now;
        out.push(`${nameOf(w, id)} is back from ${labelOf(w)}, and in its case again.`);
    }
    if (st0.ask && (g.day >= st0.ask.day + (L.wait ?? LOAN.wait) || !hasPiece(g, st0.ask.id))) {
        const st = state(g), id = st.ask!.id; delete st.ask;
        out.push(`${who?.name ?? 'The foundation'} doesn't ask twice: ${nameOf(w, id)} stays with you this season.`);
    }
    const dayIn = (g.day - 1) % len(g) + 1, season = seasonOf(g);
    if (who && !peek(g).ask && !peek(g).now && peek(g).season !== season && dayIn <= LOAN.askDays && whenHolds(g, w, L.when, { key: 'loans' })) {
        const st = state(g); st.season = season;
        const pick = loanable(g, w)[0];
        if (pick) {
            const fee = loanFee(g, w, pick);
            st.ask = { id: pick.id, fee, day: g.day, until: seasonEnd(g) };
            out.push(`${who.name} asks to borrow ${pick.name} for ${labelOf(w)}: ${money(w, fee)} for the season. Lend or refuse in the Museum tab within ${L.wait ?? LOAN.wait} days.`);
        }
    }
    return out;
}
onHour.push(settleLoans);

/** Why the piece asked for can't be lent now ('' when it can). */
export function whyNotLend(g: Save, w: WorldDef): string {
    const a = peek(g).ask;
    if (!loansDef(w) || !museumOpen(g, w) || !a) return 'Nobody has asked to borrow a piece.';
    if (!hasPiece(g, a.id) || !onShow(g, w).has(a.id)) return 'That piece isn\'t on show.';
    return '';
}
/** Lend the piece asked for: the fee now, away until the season's last day. Returns why not, or '' and its lines. */
export function lendPiece(g: Save, w: WorldDef): { ok: boolean; lines: string[] } {
    const why = whyNotLend(g, w);
    if (why) return { ok: false, lines: [why] };
    const st = state(g), a = st.ask!, name = nameOf(w, a.id), who = lender(g, w);
    delete st.ask;
    st.now = { ...a, from: g.day, until: Math.max(a.until, g.day) };
    st.n = (st.n ?? 0) + 1;
    g.player.money += a.fee; book(g, `Loan of ${name}`, a.fee);
    note(g, '{u} lent {0} to {1}.', [name, labelOf(w)], who ? [who.avatar] : [], g.player.loc, 'event');
    return { ok: true, lines: [`${name} goes to ${labelOf(w)} until day ${st.now.until}: +${money(w, a.fee)}.`] };
}
/** Refuse the piece asked for (nothing paid; she doesn't ask again this season). */
export function refuseLoan(g: Save, w: WorldDef): { ok: boolean; lines: string[] } {
    const st = peek(g);
    if (!loansDef(w) || !st.ask) return { ok: false, lines: ['Nobody has asked to borrow a piece.'] };
    const name = nameOf(w, st.ask.id), who = lender(g, w);
    delete state(g).ask;
    return { ok: true, lines: [`You keep ${name}. ${who ? `${who.name} will hear of it.` : ''}`.trim()] };
}

/** The piece away now, if any (its id and the day it comes back). */
export const onLoan = (g: Save): { id: string; until: number } | null => { const n = peek(g).now; return n ? { id: n.id, until: n.until } : null; };

export interface LoanView { on: boolean; who?: string; label?: string;
    ask?: { id: string; name: string; fee: number; until: number; days: number; why: string };
    now?: { id: string; name: string; until: number }; n: number }
/** The Museum tab's card: the piece asked for (its fee, the days left to answer, why it can't be lent) or the piece
 *  away and until when, and how many have been lent. */
export function loanView(g: Save, w: WorldDef): LoanView {
    const L = loansDef(w), who = lender(g, w);
    if (!L || !museumOpen(g, w) || !who) return { on: false, n: 0 };
    const st = peek(g);
    return { on: true, who: who.name, label: labelOf(w), n: st.n ?? 0,
        ...(st.ask ? { ask: { id: st.ask.id, name: nameOf(w, st.ask.id), fee: st.ask.fee, until: st.ask.until, days: Math.max(0, st.ask.day + (L.wait ?? LOAN.wait) - g.day), why: whyNotLend(g, w) } } : {}),
        ...(st.now ? { now: { id: st.now.id, name: nameOf(w, st.now.id), until: st.now.until } } : {}) };
}

/** For the AI: where the piece is shown (`loans.place`), it's there with {{user}}'s name on its label; at the museum,
 *  its case is empty until it's back. */
export function loanLines(g: Save, w: WorldDef): string[] {
    const L = loansDef(w), n = peek(g).now, m = museumDef(w);
    if (!L || !n || !museumOpen(g, w)) return [];
    const name = nameOf(w, n.id);
    if (L.place && g.player.loc === L.place) return [`On show here for the season: ${name}, lent by {{user}}, with {{user}}'s name on its label.`];
    if (m && g.player.loc === m.place) return [`${name}'s case stands empty: it's lent to ${labelOf(w)} until day ${n.until}.`];
    return [];
}
sceneLines.push((g, w) => loanLines(g, w));
// A piece away shows on its tile as on loan (the museum's tile, wrapped: sim/museum.ts sets it first, this file imports it)
const tileOf = museumHooks.tile;
museumHooks.tile = (g, w, id) => { const t = tileOf(g, w, id); return onLoan(g)?.id === id ? { ...t, at: 'loan' } : t; };
