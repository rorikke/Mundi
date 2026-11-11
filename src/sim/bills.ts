// Difficulty and the bills of your home.
// Difficulty changes the economy: how much work pays, what things cost and the money you start with; and a little how
// fast careers go (`career`, a speed that combines with the world's and the save's career speed, sim/work.ts).
// Bills (rent, water, power) are due every week and paid by you, in the Homes app. A bill left unpaid for a week is
// cut off: no water (no shower, no tap, no cooking), no power (no stove, TV, computer, coffee machine…), or, for the
// rent, you are locked out of your home until you pay what's overdue. You can pay part of a bill (toward its oldest
// week), and a bill that's cut off owes no more weeks, so a debt never grows past what you can pay back.
import { cfg, type Save } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { systemOn, getWorld, gameMode } from '../core/world.js';
import { book } from './ledger.js';
import { money } from './needs.js';
import { lex, appRef } from '../core/lexicon.js';
import { effectMul } from './effects.js';

/* ---------- difficulty ---------- */

export type Difficulty = 'easy' | 'normal' | 'hard';
// In a Home (no money) the difficulty is how fast relationships grow (`bond`).
export const DIFFICULTIES: { id: Difficulty; name: string; desc: string; homeDesc: string; pay: number; price: number; start: number; bond: number; career: number }[] = [
    { id: 'easy', name: 'Easy', desc: 'Work pays more, things cost less, you start with more money, and careers go a little faster.', homeDesc: 'Friendship and love grow fast.', pay: 1.25, price: 0.8, start: 1.5, bond: 1.5, career: 1.2 },
    { id: 'normal', name: 'Normal', desc: 'The balance the world was made with.', homeDesc: 'Relationships grow at their usual pace.', pay: 1, price: 1, start: 1, bond: 1, career: 1 },
    { id: 'hard', name: 'Hard', desc: 'Work pays less, everything costs more, you start with little, and careers go a little slower. Every bill counts.', homeDesc: 'Trust is earned slowly: friendship and love take time.', pay: 0.8, price: 1.25, start: 0.6, bond: 0.6, career: 0.85 },
];
export const difficultyOf = (g: Save) => DIFFICULTIES.find(d => d.id === ((cfg(g) as any).difficulty ?? 'normal')) ?? DIFFICULTIES[1];
// A price (what you pay) and an income (what you get), after the difficulty.
export const priceOf = (g: Save, v: number) => (v > 0 ? Math.round(v * difficultyOf(g).price) : v < 0 ? Math.round(v * difficultyOf(g).pay) : 0);
export const payOf = (g: Save, v: number) => Math.round(v * difficultyOf(g).pay);

/* ---------- bills ---------- */

// The expenses of a home besides the rent: a free list in the world (homes.expenses: water, power, firewood,
// servants, 300 taxes…), each charged weekly by every kind of home at its own amount (homes.kinds.<kind>.bills),
// and each stopping some things at home while it is a week unpaid (`blocks`: action ids).
// `rpg`: only billed in the RPG mode (the upkeep of your arms and gear…). An empty name: the Lexicon's word (bill_<id>).
export interface ExpenseDef { id: string; name: string; icon?: string; blocks?: string[]; cut?: string; back?: string; rpg?: boolean }
// Worlds made before free expenses have water and power, as Porto Alto does.
export const DEFAULT_EXPENSES: ExpenseDef[] = [
    { id: 'water', name: 'Water', icon: 'drop', blocks: ['shower', 'basin', 'water', 'cook', 'x-coffee'] },
    { id: 'power', name: 'Power', icon: 'bolt', blocks: ['cook', 'x-coffee', 'x-freelance', 'x-treadmill', 'x-tv'] },
];
export const expensesOf = (w: WorldDef | null | undefined): ExpenseDef[] =>
    (((w as any)?.homes?.expenses as ExpenseDef[] | undefined) ?? DEFAULT_EXPENSES.map(e => ({ ...e, name: '' })))
        .filter(e => !e.rpg || (!!w && gameMode(w) === 'rpg')).map(e => (e.name ? e : { ...e, name: lex(w, `bill_${e.id}`) }));
export type BillId = string;
export interface BillDef { id: string; name: string; icon: string; blocks: string[]; cut?: string; back?: string }
// Every bill of a home: the rent, then the world's expenses (none when the world turned rent and bills off).
export const billList = (w: WorldDef | null | undefined): BillDef[] => (systemOn(w, 'bills') ? allBills(w) : []);
const allBills = (w: WorldDef | null | undefined): BillDef[] => [
    { id: 'rent', name: lex(w, 'bill_rent'), icon: 'home', blocks: [] },
    ...expensesOf(w).filter(e => e.id && e.id !== 'rent').map(e => ({ icon: 'wallet', ...e, blocks: e.blocks ?? [] })),
];
export const billName = (w: WorldDef | null | undefined, id: BillId) => allBills(w).find(b => b.id === id)?.name ?? id;
// `paid`: money already paid toward the oldest week owed (part payments); `warned`: the due date the last day's
// warning was for.
interface Bill { due: number; told?: number; cutTold?: number; warned?: number; paid?: number }
const EVERY = 7;
export function bills(g: Save): Record<BillId, Bill> {
    const x = g as any;
    if (!x.bills) {
        // older saves: the first bills are due a week after the last rent
        const first = (g.player.rentPaidDay ?? g.day) + EVERY;
        x.bills = { rent: { due: first }, water: { due: first }, power: { due: first } };
    }
    return x.bills;
}
// One bill's state; an expense the world added later starts a week from now.
const billOf = (g: Save, id: BillId): Bill => held(g, (bills(g)[id] ??= { due: g.day + EVERY }));
// A bill cut off owes no more weeks (nobody charges rent for a door they locked): at most the week that was cut off and
// the current one. Done wherever a bill is read, so a save from before this rule owes two weeks as soon as it's opened.
function held(g: Save, b: Bill): Bill {
    while (g.day >= b.due + 2 * EVERY) {
        const was = b.due; b.due += EVERY;
        if (b.told === was) b.told = b.due;
        if (b.cutTold === was) b.cutTold = b.due;
        if (b.warned === was) b.warned = b.due;
    }
    return b;
}
const zoneOf = (g: Save, w: WorldDef) => w.homes.zones.find(z => z.id === g.player.home.zone);
export function billAmount(g: Save, w: WorldDef, id: BillId): number {
    const zone = zoneOf(g, w);
    const kind = g.player.home.kind ?? zone?.kind ?? '';
    const own = (w.homes.kinds[kind]?.bills ?? {}) as Record<string, number>;
    // older medieval worlds call their Power bill "firewood"
    // the rent: what your start asks of you in this home (Tokyo born: a share of the family's house), else the home's
    const base = id === 'rent' ? g.player.home.rent ?? zone?.rent ?? 0 : Number(own[id] ?? (id === 'power' ? own.firewood : undefined) ?? 0);
    // what effects (life goals' perks) take off: the rent counts as a price, the other bills only as bills
    return priceOf(g, base * effectMul(g, w, 'price', id === 'rent' ? ['prices', 'rent'] : ['bills', id]));
}
// How many weeks are owed (0 = paid up), whether it is due, and whether it was cut off (a week overdue).
export const owed = (g: Save, id: BillId) => { const b = billOf(g, id); return g.day >= b.due ? Math.floor((g.day - b.due) / EVERY) + 1 : 0; };
export const isDue = (g: Save, id: BillId) => owed(g, id) > 0;
export const isCut = (g: Save, id: BillId) => g.day >= billOf(g, id).due + EVERY;
export const daysLeft = (g: Save, id: BillId) => billOf(g, id).due - g.day;
/** Already paid toward the oldest week owed. */
export const paidToward = (g: Save, id: BillId) => (owed(g, id) ? billOf(g, id).paid ?? 0 : 0);
/** What's left to pay of a bill: every week owed, less what was already paid toward the oldest one. */
export const owedAmount = (g: Save, w: WorldDef, id: BillId) => Math.max(0, billAmount(g, w, id) * owed(g, id) - paidToward(g, id));
/** What ends a cut-off: the overdue weeks (all but the current one), less what was paid toward them; 0 when not cut off. */
export const toGetBackIn = (g: Save, w: WorldDef, id: BillId) => (isCut(g, id) ? Math.max(0, billAmount(g, w, id) * (owed(g, id) - 1) - paidToward(g, id)) : 0);
/** Days until a bill that's due is cut off (0: it is). */
export const daysToCut = (g: Save, id: BillId) => Math.max(0, billOf(g, id).due + EVERY - g.day);
// What paying a bill does now: everything when you have it; else, cut off, what ends the cut-off; else what you have
// toward it, keeping a day of food, so paying never leaves you with nothing to eat.
export type PayPlan = { how: 'all' | 'back' | 'part' | 'none'; amount: number };
export function payPlan(g: Save, w: WorldDef, id: BillId): PayPlan {
    const total = owedAmount(g, w, id), have = Math.max(0, g.player.money);
    if (!total) return { how: 'none', amount: 0 };
    if (have >= total) return { how: 'all', amount: total };
    const back = toGetBackIn(g, w, id);
    if (back && have >= back) return { how: 'back', amount: back };
    const part = Math.min(total, have - foodKeep(g, w));
    return part > 0 ? { how: 'part', amount: part } : { how: 'none', amount: 0 };
}
// A day of food: three of the cheapest things to eat anywhere (a snack), at today's prices.
export function foodKeep(g: Save, w: WorldDef): number {
    const eats = (w.actions ?? []).filter(a => a.anywhere && a.cost > 0 && (a.effects?.hunger ?? 0) > 0).map(a => a.cost);
    return eats.length ? priceOf(g, Math.min(...eats)) * 3 : 0;
}

const LEX_CUT: Record<string, string> = { rent: 'cutRent', water: 'cutWater', power: 'cutPower' };
const LEX_BACK: Record<string, string> = { rent: 'backRent', water: 'backWater', power: 'backPower' };
const LEX_NO: Record<string, string> = { water: 'noWater', power: 'noPower' };
// Pays what `payPlan` says, the oldest week first: each week paid in full moves the due date on a week, and what's
// paid of a week stays toward it. Returns what to tell the player ('' for a plain payment).
export function payBill(g: Save, w: WorldDef, id: BillId): string {
    const n = owed(g, id); if (!n) return '';
    const plan = payPlan(g, w, id);
    if (plan.how === 'none') return `Not enough money (${money(w, toGetBackIn(g, w, id) || owedAmount(g, w, id))}).`;
    const wasCut = isCut(g, id);
    const def = billList(w).find(b => b.id === id);
    const b = billOf(g, id), week = billAmount(g, w, id);
    g.player.money -= plan.amount;
    let credit = (b.paid ?? 0) + plan.amount, weeks = 0;
    while (week > 0 && credit >= week && owed(g, id) > 0) { credit -= week; b.due += EVERY; weeks++; }
    if (credit > 0 && owed(g, id) > 0) b.paid = credit; else delete b.paid;
    book(g, `${billName(w, id)}${plan.how === 'all' ? (n > 1 ? ` (${n} weeks)` : '') : ` (part: ${weeks ? `${weeks} ${weeks > 1 ? 'weeks' : 'week'}` : 'toward a week'})`}`, -plan.amount);
    const left = owedAmount(g, w, id);
    if (!wasCut || isCut(g, id)) return left ? `Paid ${money(w, plan.amount)}: ${money(w, left)} still to pay.` : '';
    return def?.back || (LEX_BACK[id] && def && defaultName(w, def) ? lex(w, LEX_BACK[id]) : lex(w, 'backGeneric', billName(w, id)));
}
/** The bills of your home that cost something (the rent only where the world charges rent). */
export const billsToPay = (g: Save, w: WorldDef): BillDef[] => billList(w).filter(b => billAmount(g, w, b.id) > 0 && (b.id !== 'rent' || !!w.rent));
/** The rewards shop's "Rent holiday": the next payment of the rent and of each bill of your home is skipped (each falls
 *  due a week later; one already owed is a week less). Null when there's nothing to pay. */
export function skipBills(g: Save, w: WorldDef): string[] | null {
    const list = billsToPay(g, w);
    if (!list.length) return null;
    for (const b of list) billOf(g, b.id).due += EVERY;
    return [`No ${list.map(b => b.name.toLowerCase()).join(', ')} to pay this week.`];
}
/** A save begun before starts had a rent of their own (Tokyo born, living with the family): the start's rent from now
 *  on, while you still live in its home. Checked once per save (`startRent`), so moving back later pays the home's rent. */
export function settleStartRent(g: Save, w: WorldDef): string {
    const p = g.player as any, st = (w.starts ?? []).find(s => s.id === p.start);
    if (st?.rent === undefined || p.startRent) return '';
    p.startRent = true;
    if (p.home.rent !== undefined || p.home.zone !== st.home || !systemOn(w, 'bills') || !w.rent) return '';
    p.home.rent = st.rent;
    return `Your rent at home is now ${money(w, priceOf(g, st.rent))} a week (${st.name}).`;
}
// Moving in: the first week is paid with the deposit, so everything starts fresh (what the old home was still owed
// stays behind, with its deposit).
export function resetBills(g: Save, w?: WorldDef | null) {
    const ids = new Set([...Object.keys((g as any).bills ?? {}), ...allBills(w).map(b => b.id)]);
    (g as any).bills = Object.fromEntries([...ids].map(id => [id, { due: g.day + EVERY }]));
}

// Once a day (from the timed rules): the bill that became due, and the one that was cut off.
export function billNews(g: Save, w: WorldDef): string[] {
    const out: string[] = [];
    const on = systemOn(w, 'bills');   // off: every bill stays paid up, so turning it back on owes nothing old
    for (const def of allBills(w)) {
        const b = billOf(g, def.id);
        if (!on || !billAmount(g, w, def.id) || (def.id === 'rent' && !w.rent)) { while (b.due <= g.day) b.due += EVERY; continue; }   // nothing to pay: always paid up
        if (isCut(g, def.id) && b.cutTold !== b.due) {
            b.cutTold = b.due;
            out.push(def.cut ? def.cut.replace('{app}', appRef(w, 'homes')) : LEX_CUT[def.id] && defaultName(w, def) ? lex(w, LEX_CUT[def.id], appRef(w, 'homes')) : lex(w, 'cutGeneric', def.name, appRef(w, 'homes')));
        } else if (isDue(g, def.id) && g.day >= b.due + EVERY - 1 && b.warned !== b.due) {
            // the last day before it's cut off
            b.warned = b.due; b.told = b.due;
            out.push(lex(w, def.id === 'rent' ? 'lastRent' : 'lastBill', def.name, money(w, owedAmount(g, w, def.id)), appRef(w, 'homes')));
        } else if (isDue(g, def.id) && b.told !== b.due) {
            b.told = b.due;
            out.push(lex(w, 'billDue', def.name, money(w, billAmount(g, w, def.id)), appRef(w, 'homes')));
        }
    }
    return out;
}
// Water and power keep their own messages while they keep the preset's name; a renamed or new expense gets a general one.
const defaultName = (w: WorldDef, def: BillDef) => def.id === 'rent' || def.name === lex(w, `bill_${def.id}`);

// What a cut-off bill stops at home.
export function cutReason(g: Save, id: string, w?: WorldDef | null): string {
    if (w && !systemOn(w, 'bills')) return '';
    if (isCut(g, 'rent')) return lex(w, 'lockedOut');
    for (const def of billList(w)) {
        if (def.id === 'rent' || !def.blocks.includes(id) || !isCut(g, def.id)) continue;
        if (w && !billAmount(g, w, def.id)) continue;
        return LEX_NO[def.id] && (!w || defaultName(w, def)) ? lex(w, LEX_NO[def.id]) : lex(w, 'noGeneric', def.name);
    }
    return '';
}
export const lockedOut = (g: Save) => systemOn(getWorld(g.world), 'bills') && isCut(g, 'rent');
/** For the AI: you can't go home. */
export const lockedOutLine = (g: Save, w: WorldDef) => (systemOn(w, 'bills') && isCut(g, 'rent') ? '{{user}} is locked out of home over unpaid rent until it is paid, and cannot sleep or do anything there.' : '');
/** The cheapest home elsewhere with a free spot (`free`: its free spots), at the rent you'd pay there. */
export function cheapestHome(g: Save, w: WorldDef, free: (zone: string) => number): { name: string; rent: number } | null {
    const z = w.homes.zones.filter(x => x.id !== g.player.home.zone && free(x.id) > 0).sort((a, b) => (a.rent ?? 0) - (b.rent ?? 0))[0];
    return z ? { name: z.name, rent: priceOf(g, z.rent ?? 0) } : null;
}
