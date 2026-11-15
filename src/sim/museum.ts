// The museum of your own (track 5 of end-game spending): the display halls' pieces and where they come from, display
// cases at home, the museum's place taken on through its offer, upgrades and renown, visitors, shows, replicas and the
// workshop. The world data is `w.collection.museum` and the slots' `sources` (core/world.ts, made safe by
// core/collection.ts); the save is `g.collection.museum`, and a piece you have is track 4's `got` entry with its source.
// A world whose display slots have sources but no museum block keeps a plain collection: finds, shops, festival
// stalls, endings, milestones and stories, nothing on show, no renown, `needsUpgrade` ignored. With the collection
// system off, or no display pieces, nothing here reads or writes anything. (The dealer and the sales are
// sim/market.ts's, in `MuseumState.dealer` and `.sales`.)
import { adultOn, type Save, type Resident } from '../core/store.js';
import type { WorldDef, MuseumDef, MuseumUpgrade, SlotDef, PieceSource, HallDef, ActionDef } from '../core/world.js';
import { placeGates, collectionLink, museumLink, museumHooks, onDay, ownedPlaces } from './hooks.js';
import { collectionOn, collectionOf, slotsHere, percentOf, type Got } from './collection.js';
import { whenHolds, personNamed, missingWords } from './when.js';
import { threadsOf, changeJob, goneFromMap } from './threads.js';
import { priceOf, payOf } from './bills.js';
import { effectMul } from './effects.js';
import { book } from './ledger.js';
import { money } from './needs.js';
import { earn } from './points.js';
import { note } from './facts.js';
import { festivalsOn } from './festivals.js';
import { openNow } from './daynight.js';
import { withYou } from './social.js';
import { playerHomeId } from './places.js';
import { seasonDays } from './time.js';

/** What the save keeps for the museum (all read with defaults): the day it began (the first display piece or the offer),
 *  the day its offer came and the day it opened; upgrades bought (id → day); lasting renown from milestones; the show
 *  (a hall's group as its theme, from and until, `told` once its close was said) and the themes held; the dealer's
 *  and the sales' state (sim/market.ts); last week's visitors' money and the day it was paid; the highest renown level
 *  reached (its line and points once); damaged finds waiting for the workshop (not filled until restored, MU-4) and
 *  restorations under way (id → the day it's ready); `v` once the display pieces have been filled from what the save
 *  remembers. */
export interface MuseumState {
    begun?: number; offered?: number; opened?: number;
    ups?: Record<string, number>;
    renownAdd?: number;
    show?: { theme: string; from: number; until: number; told?: boolean }; shows?: string[];
    dealer?: { next?: number; stock?: { id: string; price: number }[]; waited?: Record<string, number>; ask?: string };
    sales?: { next?: number; lots?: { id: string; est: number; bid?: number }[]; lost?: Record<string, number>; held?: number };
    income?: number; paidDay?: number;
    lv?: number;
    damaged?: Record<string, { day: number; src: string; paid?: number }>;
    fix?: Record<string, number>;
    v?: number;
}

/** The world's museum, when the collection is on there and it has one. */
export const museumDef = (w: WorldDef | null | undefined): MuseumDef | undefined => (collectionOn(w) ? w!.collection!.museum : undefined);
/** The collection on and a museum in this world. */
export const museumOn = (w: WorldDef | null | undefined): boolean => !!museumDef(w);
/** The save's museum as it is, without writing anything. */
export const museumOf = (g: Save | null | undefined): MuseumState | undefined => (g ? (collectionOf(g) as any)?.museum : undefined);
/** The save's museum, made on first use (only call it with the museum on). */
export function museumState(g: Save): MuseumState {
    const c = ((g as any).collection ??= {});
    c.got ??= {}; c.counted ??= []; c.had ??= [];
    return (c.museum ??= {}) as MuseumState;
}
/** Is the museum yours (its offer taken)? */
export const museumOpen = (g: Save | null | undefined, w: WorldDef | null | undefined): boolean => museumOn(w) && museumOf(g)?.opened !== undefined;

// The museum's place is off the maps, out of place pickers and nobody goes there until it's yours.
placeGates.push((g, w, id) => { const m = museumDef(w); return !m || m.place !== id || museumOpen(g, w); });

/** The museum's places: its own and its rooms (a place there only while the museum is open: `museum:` in its `when`). */
export function museumPlaces(w: WorldDef): string[] {
    const m = museumDef(w); if (!m) return [];
    const rooms = w.places.filter(p => p.id !== m.place && typeof p.when === 'string' && /(^|;)\s*museum\s*:/.test(p.when)).map(p => p.id);
    return [m.place, ...rooms];
}
/** Twice the chance of being seen at a museum you own once a night guard does the rounds. */
export const GUARD_RISK = 2;
// Caught at the museum you own (sim/caught.ts asks): nobody bans you from your own place; the guard's rounds double the risk.
ownedPlaces.push((g, w, place) => (museumOpen(g, w) && museumPlaces(w).includes(place) ? { risk: hasUpgrade(g, w, 'guard') ? GUARD_RISK : 1 } : null));

/* ---------- numbers ---------- */

/** Renown per piece on show by rung (free, R1…R5) and yen a week per renown point, when the world doesn't say. */
export const MUSEUM_RENOWN = { rung: [1, 1, 1, 2, 4, 10], income: 150 };
/** The shop's rungs (plans/shop.md): a price from this much is R2, R3, R4, R5; anything above 0 below the first is R1. */
const RUNG_FROM = [10_000, 80_000, 500_000, 5_000_000];
/** Restoring a damaged piece: a quarter of its price, at least this, and so many days in the workshop. */
export const RESTORE = { share: 0.25, least: 20_000, days: 3 };
/** Finds: the most a find's odds become with its multipliers (a world's own higher chance stays), and each one. */
export const FIND = { most: 0.5, roll: 2, reading: 1.5, curator: 1.5 };
/** Cases at home and the first room, when the world doesn't say. */
const CASES = 6, ROOM = 12;

const hallOf = (w: WorldDef, id: string): HallDef | undefined => w.collection?.halls.find(h => h.id === id);
const isDisplay = (w: WorldDef, s: SlotDef) => !hallOf(w, s.hall)?.record;
/** A piece's price before difficulty: its own, else the dearest of its ways'. */
export const basePrice = (s: SlotDef): number => s.price ?? Math.max(0, ...(s.sources ?? []).map(x => x.price ?? 0));
/** A piece's rung by its price: 0 free, 1…5 the shop's R1…R5. */
export function rungOf(s: SlotDef): number {
    const p = basePrice(s);
    return p > 0 ? 1 + RUNG_FROM.filter(t => p >= t).length : 0;
}
/** What a museum price costs you: the difficulty (`priceOf`) and perks aimed at `museum` (Connoisseur), not where you live. */
export const museumPrice = (g: Save, w: WorldDef, v: number): number => (v > 0 ? Math.round(priceOf(g, v) * effectMul(g, w, 'price', ['museum'], { exact: true })) : 0);

// Stable dice for a save: the world, the day and minute, a salt.
const rnd = (g: Save, salt: string) => { let h = 2166136261; const s = `${g.world}|${g.day}|${g.minutes}|${salt}`; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const seasonOfDay = (g: Save, day: number) => Math.floor((Math.max(1, day) - 1) / seasonDays(g));
const isMonday = (day: number) => (day - 1) % 7 === 0;

/* ---------- what you have ---------- */

const gotOf = (g: Save, id: string) => collectionOf(g)?.got[id] as Got | undefined;
const damagedOf = (g: Save) => museumOf(g)?.damaged ?? {};
/** Do you have the real piece (not a replica; a damaged find isn't filled until restored)? */
export const hasPiece = (g: Save, id: string) => { const x = gotOf(g, id); return !!x && !x.replica; };
/** The display slots this game has. */
export const displayHere = (g: Save, w: WorldDef): SlotDef[] => slotsHere(g, w).filter(s => isDisplay(w, s));
/** Display pieces you have: their slots filled (a replica too). */
export const piecesHad = (g: Save, w: WorldDef): SlotDef[] => displayHere(g, w).filter(s => !!gotOf(g, s.id));
// Does this world have anything for the museum's rules to do (display pieces with ways, or a museum)?
const piecesOn = (w: WorldDef): boolean => collectionOn(w) && (!!w.collection!.museum || w.collection!.slots.some(s => !!s.sources?.length && isDisplay(w, s)));

/** Upgrades this game can have: adult ones with adult content on. */
const upsHere = (g: Save, w: WorldDef): MuseumUpgrade[] => (museumDef(w)?.upgrades ?? []).filter(u => !u.adult || adultOn(g));
/** Is an upgrade built (by id, or by what it does: `climate`, `workshop`…)? Nothing before the museum is yours. */
export function hasUpgrade(g: Save, w: WorldDef, key: string): boolean {
    if (!museumOpen(g, w)) return false;
    const ups = museumOf(g)?.ups ?? {};
    return upsHere(g, w).some(u => (u.id === key || u.does === key) && ups[u.id] !== undefined);
}
/** Can a piece be housed (the upgrade it needs is built)? Without a museum `needsUpgrade` is ignored. */
export const canHouse = (g: Save, w: WorldDef, s: SlotDef): boolean => !s.needsUpgrade || !museumOn(w) || hasUpgrade(g, w, s.needsUpgrade);
/** Can this piece still come to you: not had for real, not a damaged find waiting, and housed? (A replica can be
 *  replaced by the real piece.) The market's pools use it too. */
export const wanted = (g: Save, w: WorldDef, s: SlotDef): boolean => !hasPiece(g, s.id) && !damagedOf(g)[s.id] && canHouse(g, w, s);
const upgradeName = (w: WorldDef, key: string) => museumDef(w)?.upgrades.find(u => u.id === key || u.does === key)?.name ?? key;

// A piece comes: filled (a replica it replaces is gone), or a damaged find kept aside until the workshop restores it.
function give(g: Save, w: WorldDef, s: SlotDef, entry: Got, damaged = false): void {
    const m = museumState(g), c = collectionOf(g)!;
    if (museumOn(w)) m.begun ??= g.day;   // (the first display piece begins the museum)
    if (damaged) { (m.damaged ??= {})[s.id] = { day: entry.day, src: entry.src ?? '', ...(entry.paid ? { paid: entry.paid } : {}) }; return; }
    c.got[s.id] = entry;
    if (m.damaged?.[s.id]) delete m.damaged[s.id];
    if (!c.counted.includes(s.id)) c.counted.push(s.id);   // (R-8: a slot joins the count when it fills)
}
/** A piece is yours (the dealer, a sale won, anything else that hands one over): filled with how it came and what it
 *  cost (a replica it replaces is gone), or kept aside damaged (MU-4). Returns the line to show. Nothing for a slot the
 *  world doesn't have or a piece you can't have now (`wanted`). */
export function receivePiece(g: Save, w: WorldDef, id: string, how: { src: string; paid?: number; damaged?: boolean }): string {
    const s = w.collection?.slots.find(x => x.id === id);
    if (!s || !piecesOn(w) || !isDisplay(w, s) || !wanted(g, w, s)) return '';
    give(g, w, s, { day: g.day, src: how.src, ...(how.paid ? { paid: how.paid } : {}) }, !!how.damaged && museumOn(w));
    return `${s.icon ? `${s.icon} ` : ''}${s.name} is yours.${whereLine(g, w, s, !!how.damaged && museumOn(w))}`;
}
// Where a new piece goes, said after its name.
function whereLine(g: Save, w: WorldDef, s: SlotDef, damaged: boolean): string {
    const m = museumDef(w);
    if (!m) return '';
    if (damaged) return ' It came damaged: it waits, boxed, for the restoration workshop.';
    if (!canHouse(g, w, s)) return '';
    const at = onShow(g, w).get(s.id);
    return at === 'home' ? ' It goes in a glass case at home.' : at === 'wing' || at === 'room' ? ` It goes on show at ${m.name}.` : museumOpen(g, w) ? ` It goes into ${m.name}'s store.` : ' It goes into a box at home.';
}

/* ---------- on show and renown ---------- */

export type ShowWhere = 'home' | 'wing' | 'room';
// A wing for a hall (an upgrade that opens it), when the world has one.
const wingOf = (g: Save, w: WorldDef, hall: string) => upsHere(g, w).find(u => u.opens === hall);
/** Is a whole hall on show (its wing built; a hall without a wing: its `open` holds, or always)? */
export function hallOnShow(g: Save, w: WorldDef, hall: string): boolean {
    if (!museumOpen(g, w)) return false;
    const h = hallOf(w, hall), wing = wingOf(g, w, hall);
    if (!h || h.record) return false;
    if (wing) return (museumOf(g)?.ups ?? {})[wing.id] !== undefined;
    return h.open ? whenHolds(g, w, h.open) : true;
}
const renownOfPiece = (w: WorldDef, s: SlotDef, x: Got) => {
    const rung = museumDef(w)?.renown?.rung ?? MUSEUM_RENOWN.rung, r = rungOf(s);
    return (rung[r] ?? rung[rung.length - 1] ?? 0) * (x.replica ? 0.5 : 1);
};
const dearestFirst = (a: SlotDef, b: SlotDef) => basePrice(b) - basePrice(a) || a.id.localeCompare(b.id);
/** Where each piece you have is on show: before the museum opens, the dearest `cases` at home; once it's open, every
 *  piece of a hall whose wing is built, and the first room's `room` from the other halls (the most renown first). A
 *  damaged piece or one being restored shows nothing. Pieces not in the map are boxed. */
export function onShow(g: Save, w: WorldDef): Map<string, ShowWhere> {
    const out = new Map<string, ShowWhere>(), m = museumDef(w);
    if (!m) return out;
    const fix = museumOf(g)?.fix ?? {};
    const mine = piecesHad(g, w).filter(s => !gotOf(g, s.id)!.damaged && fix[s.id] === undefined);
    if (!museumOpen(g, w)) { for (const s of mine.sort(dearestFirst).slice(0, m.cases ?? CASES)) out.set(s.id, 'home'); return out; }
    const rest: SlotDef[] = [];
    for (const s of mine) (hallOnShow(g, w, s.hall) ? out.set(s.id, 'wing') : rest.push(s));
    rest.sort((a, b) => renownOfPiece(w, b, gotOf(g, b.id)!) - renownOfPiece(w, a, gotOf(g, a.id)!) || dearestFirst(a, b));
    for (const s of rest.slice(0, m.room ?? ROOM)) out.set(s.id, 'room');
    return out;
}
/** Is a show on now? */
export const showNow = (g: Save, w: WorldDef) => { const s = museumOf(g)?.show; return museumOpen(g, w) && !!s && g.day >= s.from && g.day < s.until ? s : null; };
/** Renown: the pieces on show (by rung, half for a replica), the upgrades built, milestones' lasting renown, the
 *  themes shown (up to `most`), and more while a show is on. Computed, never stored; 0 until the museum is yours. */
export function renownOf(g: Save, w: WorldDef): number {
    const m = museumDef(w), st = museumOf(g);
    if (!m || !museumOpen(g, w) || !st) return 0;
    let n = 0;
    for (const [id, at] of onShow(g, w)) if (at !== 'home') { const s = w.collection!.slots.find(x => x.id === id); if (s) n += renownOfPiece(w, s, gotOf(g, id)!); }
    for (const u of upsHere(g, w)) if (st.ups?.[u.id] !== undefined) n += u.renown ?? 0;
    n += st.renownAdd ?? 0;
    if (m.shows) n += Math.min(m.shows.most ?? 12, (m.shows.lasting ?? 0) * (st.shows?.length ?? 0)) + (showNow(g, w) ? m.shows.renown ?? 0 : 0);
    return Math.max(0, Math.floor(n));
}
const levelsOf = (w: WorldDef) => [...(museumDef(w)?.renown?.levels ?? [])].sort((a, b) => a.at - b.at);
/** The renown level now (0: none yet) and its name. */
export function renownLevel(g: Save, w: WorldDef): { n: number; name: string; next?: { at: number; name: string } } {
    const r = renownOf(g, w), list = levelsOf(w), n = list.filter(l => r >= l.at).length;
    return { n, name: n ? list[n - 1].name : '', ...(list[n] ? { next: list[n] } : {}) };
}

/* ---------- the offer and the opening ---------- */

/** The offer while it waits (it came and the museum isn't yours yet): its price and why it can't be taken now. */
export function museumOffer(g: Save, w: WorldDef): { name: string; price: number; why: string } | null {
    const m = museumDef(w), st = museumOf(g);
    if (!m || st?.offered === undefined || st.opened !== undefined) return null;
    const price = museumPrice(g, w, m.offer.price);
    return { name: m.name, price, why: g.player.money < price ? `You need ${money(w, price)}.` : '' };
}
/** Takes the museum on: paid once, the place appears, the first room shows its pieces; the curator, if they're in the
 *  game, takes the museum's job (as a storyline's ending changes a job). */
export function openMuseum(g: Save, w: WorldDef): { ok: boolean; lines: string[] } {
    const m = museumDef(w), offer = museumOffer(g, w);
    if (!m || !offer) return { ok: false, lines: ['There is nothing to take on.'] };
    if (offer.why) return { ok: false, lines: [offer.why] };
    g.player.money -= offer.price;
    if (offer.price) book(g, m.name, -offer.price);
    const st = museumState(g);
    st.opened = g.day; st.begun ??= g.day;
    const r = curatorOf(g, w);
    if (r && m.curatorJob) changeJob(g, w, r, m.curatorJob);
    note(g, r ? '{u} took on {0} as a private museum; {1} is its curator.' : '{u} took on {0} as a private museum.', [m.name, r?.name ?? ''], r ? [r.avatar] : [], g.player.loc, 'event');
    return { ok: true, lines: [`${m.name} is yours.${r ? ` ${r.name} will be its curator.` : ''}`, ...(offer.price ? [`−${money(w, offer.price)}`] : [])] };
}
/** The museum's curator, when they're in the game and still on the map. */
export function curatorOf(g: Save, w: WorldDef): Resident | undefined {
    const name = museumDef(w)?.curator;
    const r = name ? personNamed(g, name) : undefined;
    return r && !goneFromMap(r) ? r : undefined;
}

/* ---------- upgrades ---------- */

export interface UpgradeView { u: MuseumUpgrade; owned: boolean; price: number; why: string }
/** The upgrades this game has (adult ones with adult content on), each built, or its price and why it can't be built
 *  now ('' when it can): the museum not yours, upgrades it needs first, its condition, money. */
export function upgradesHere(g: Save, w: WorldDef): UpgradeView[] {
    const st = museumOf(g), open = museumOpen(g, w);
    return upsHere(g, w).map(u => {
        const owned = st?.ups?.[u.id] !== undefined, price = museumPrice(g, w, u.price);
        const first = (u.needs ?? []).filter(n => st?.ups?.[n] === undefined).map(n => upgradeName(w, n));
        const why = owned ? '' : !open ? 'The museum isn\'t yours yet.' : first.length ? `Needs ${first.join(' and ')} first.`
            : u.when && !whenHolds(g, w, u.when) ? `Needs ${missingWords(g, w, u.when).join('; ') || 'more'}.` : g.player.money < price ? `You need ${money(w, price)}.` : '';
        return { u, owned, price, why };
    });
}
/** Builds an upgrade. */
export function buyUpgrade(g: Save, w: WorldDef, id: string): { ok: boolean; lines: string[] } {
    const v = upgradesHere(g, w).find(x => x.u.id === id);
    if (!v) return { ok: false, lines: ['There is no such upgrade here.'] };
    if (v.owned) return { ok: false, lines: ['It\'s built already.'] };
    if (v.why) return { ok: false, lines: [v.why] };
    const m = museumDef(w)!;
    g.player.money -= v.price;
    if (v.price) book(g, `${m.name}: ${v.u.name}`, -v.price);
    (museumState(g).ups ??= {})[id] = g.day;
    const wing = v.u.opens ? hallOf(w, v.u.opens) : undefined;
    return { ok: true, lines: [`${m.name}: ${v.u.name} is built.${wing ? ` The whole of ${wing.name} is on show.` : ''}`, ...(v.price ? [`−${money(w, v.price)}`] : [])] };
}

/* ---------- shows ---------- */

export interface ShowTheme { id: string; hall: string; group: string; name: string; pieces: number; held: boolean }
/** The themes a show can have: each group of a display hall, with its pieces on show (a theme needs `min`) and
 *  whether it was shown before (lasting renown only the first time). */
export function showThemes(g: Save, w: WorldDef): ShowTheme[] {
    if (!museumDef(w)?.shows || !museumOpen(g, w)) return [];
    const shown = onShow(g, w), held = new Set(museumOf(g)?.shows ?? []), here = displayHere(g, w);
    const out: ShowTheme[] = [];
    for (const h of w.collection!.halls) {
        if (h.record || !here.some(s => s.hall === h.id)) continue;
        for (const gr of h.groups) {
            const id = `${h.id}:${gr.id}`;
            out.push({ id, hall: h.id, group: gr.id, name: gr.name, pieces: here.filter(s => s.hall === h.id && s.group === gr.id && shown.has(s.id)).length, held: held.has(id) });
        }
    }
    return out;
}
/** Why a show can't start now ('' when it can): no exhibition hall, one on, one already this season, money. */
export function whyNoShow(g: Save, w: WorldDef): string {
    const m = museumDef(w), st = museumOf(g);
    if (!m?.shows || !museumOpen(g, w)) return 'The museum has no shows.';
    if (!hasUpgrade(g, w, 'exhibition')) return `Shows need ${upgradeName(w, 'exhibition')}.`;
    if (showNow(g, w)) return 'A show is on.';
    if (st?.show && seasonOfDay(g, st.show.from) === seasonOfDay(g, g.day)) return 'One show a season: the next one next season.';
    const price = museumPrice(g, w, m.shows.price);
    return g.player.money < price ? `You need ${money(w, price)}.` : '';
}
/** Starts a show on a theme (a hall's group with at least `min` pieces on show), until the season's end and at least a
 *  week. */
export function startShow(g: Save, w: WorldDef, theme: string): { ok: boolean; lines: string[] } {
    const why = whyNoShow(g, w);
    if (why) return { ok: false, lines: [why] };
    const m = museumDef(w)!, s = m.shows!, t = showThemes(g, w).find(x => x.id === theme);
    if (!t) return { ok: false, lines: ['There is no such theme.'] };
    if (t.pieces < (s.min ?? 6)) return { ok: false, lines: [`A show on ${t.name} needs ${s.min ?? 6} pieces on show (${t.pieces} now).`] };
    const price = museumPrice(g, w, s.price), st = museumState(g);
    g.player.money -= price;
    if (price) book(g, `${m.name}: a show`, -price);
    const end = (seasonOfDay(g, g.day) + 1) * seasonDays(g) + 1;
    st.show = { theme, from: g.day, until: Math.max(end, g.day + 7) };
    if (!(st.shows ??= []).includes(theme)) st.shows.push(theme);
    note(g, '{u} opened a show at {0}: {1}.', [m.name, t.name], [], g.player.loc, 'event');
    return { ok: true, lines: [`A show on ${t.name} opens at ${m.name}.`, ...(price ? [`−${money(w, price)}`] : [])] };
}
const themeName = (w: WorldDef, theme: string) => { const [h, gr] = theme.split(':'); return hallOf(w, h)?.groups.find(x => x.id === gr)?.name ?? theme; };

/* ---------- finds, shops, stalls ---------- */

/** After an action (its roll done): one roll for its finds, then one missing piece among them you can house. The odds
 *  are the best of its finds' `chance`, times the best two of: the action's roll succeeded (×2), the reading room
 *  (×1.5), the curator with you (×1.5), at most `FIND.most`; with the curator a find's damaged odds are halved, and
 *  the museum's `eye` (once its condition holds) lowers them for good. */
function found(g: Save, w: WorldDef, a: ActionDef, ok: boolean | null, mates: string[]): string[] {
    if (!piecesOn(w)) return [];
    const place = g.player.loc;
    const list: { s: SlotDef; x: PieceSource }[] = [];
    for (const s of displayHere(g, w)) {
        if (!wanted(g, w, s)) continue;
        const x = (s.sources ?? []).find(y => y.kind === 'find' && (y.action ? y.action === a.id : !!y.at?.includes(place)) && (!y.when || whenHolds(g, w, y.when)));
        if (x) list.push({ s, x });
    }
    if (!list.length) return [];
    const cur = curatorOf(g, w), withCur = !!cur && (mates.includes(cur.avatar) || withYou(g, w).includes(cur.avatar));
    const base = Math.max(...list.map(f => f.x.chance ?? 0));
    const k = [ok === true ? FIND.roll : 1, hasUpgrade(g, w, 'reading') ? FIND.reading : 1, withCur ? FIND.curator : 1].sort((p, q) => q - p);
    const odds = Math.min(base * k[0] * k[1], Math.max(base, FIND.most));
    if (rnd(g, `find|${a.id}|${place}`) >= odds) return [];
    // one of them, by their chances
    const total = list.reduce((n, f) => n + Math.max(0.001, f.x.chance ?? 0), 0);
    let pick = rnd(g, `findwhich|${a.id}`) * total, f = list[0];
    for (const y of list) { pick -= Math.max(0.001, y.x.chance ?? 0); if (pick < 0) { f = y; break; } }
    const eye = w.collection?.museum?.eye, sharp = eye && whenHolds(g, w, eye.when) ? eye.damaged : 1;   // (her lessons' eye, for good)
    const bad = museumOn(w) && rnd(g, `finddamaged|${f.s.id}`) < (f.x.damaged ?? 0) * (withCur ? 0.5 : 1) * sharp;
    give(g, w, f.s, { day: g.day, src: 'find' }, bad);
    return [`A find: ${f.s.icon ? `${f.s.icon} ` : ''}${f.s.name}.${whereLine(g, w, f.s, bad)}`];
}
museumHooks.found = found;

export interface PieceOffer { id: string; name: string; icon?: string; price: number; src: 'sold' | 'festival'; slot: SlotDef }
/** The pieces sold at a place now (its "Museum pieces" row while it's open, their `when` holding) and at a festival's
 *  stall there during its days, the cheapest way of each; only pieces you don't have and can house. */
export function piecesHere(g: Save, w: WorldDef, place = g.player.loc): PieceOffer[] {
    if (!piecesOn(w)) return [];
    const out: PieceOffer[] = [];
    let open: boolean | undefined, fests: ReturnType<typeof festivalsOn> | undefined;
    for (const s of displayHere(g, w)) {
        if (!wanted(g, w, s)) continue;
        let best: PieceOffer | null = null;
        for (const x of s.sources ?? []) {
            let ok = false;
            if (x.kind === 'sold' && x.at?.includes(place)) ok = (open ??= openNow(g, w, place)) && (!x.when || whenHolds(g, w, x.when));
            else if (x.kind === 'festival' && x.id) ok = (fests ??= festivalsOn(g, w)).some(f => f.id === x.id && (f.place === place || !!f.places?.includes(place)));
            if (!ok) continue;
            const price = museumPrice(g, w, x.price ?? s.price ?? 0);
            if (!best || price < best.price) best = { id: s.id, name: s.name, icon: s.icon, price, src: x.kind as 'sold' | 'festival', slot: s };
        }
        if (best) out.push(best);
    }
    return out;
}
/** Buys a piece sold here. */
export function buyPiece(g: Save, w: WorldDef, id: string, place = g.player.loc): { ok: boolean; lines: string[] } {
    const o = piecesHere(g, w, place).find(x => x.id === id);
    if (!o) return { ok: false, lines: ['That isn\'t sold here.'] };
    if (g.player.money < o.price) return { ok: false, lines: [`You need ${money(w, o.price)}.`] };
    g.player.money -= o.price;
    if (o.price) book(g, o.name, -o.price);
    give(g, w, o.slot, { day: g.day, src: o.src, ...(o.price ? { paid: o.price } : {}) });
    return { ok: true, lines: [`You buy ${o.name}.${whereLine(g, w, o.slot, false)}`, ...(o.price ? [`−${money(w, o.price)}`] : [])] };
}

/* ---------- replicas and the workshop ---------- */

/** The replicas the workshop can make: a piece you don't have at all whose `replica` way's condition holds (its
 *  one-time way has passed). Only with the workshop built. */
export function replicasHere(g: Save, w: WorldDef): { id: string; name: string; price: number }[] {
    if (!hasUpgrade(g, w, 'workshop')) return [];
    const out: { id: string; name: string; price: number }[] = [];
    for (const s of displayHere(g, w)) {
        if (gotOf(g, s.id) || damagedOf(g)[s.id] || !canHouse(g, w, s)) continue;
        const x = (s.sources ?? []).find(y => y.kind === 'replica' && (!y.when || whenHolds(g, w, y.when)));
        if (x) out.push({ id: s.id, name: s.name, price: museumPrice(g, w, x.price ?? 0) });
    }
    return out;
}
/** Has the workshop make a replica (CO-2): it fills the slot, gives half the renown and no gold; the real piece, if it
 *  ever comes, replaces it. */
export function makeReplica(g: Save, w: WorldDef, id: string): { ok: boolean; lines: string[] } {
    const r = replicasHere(g, w).find(x => x.id === id), s = w.collection?.slots.find(x => x.id === id);
    if (!r || !s) return { ok: false, lines: ['The workshop can\'t make that.'] };
    if (g.player.money < r.price) return { ok: false, lines: [`You need ${money(w, r.price)}.`] };
    g.player.money -= r.price;
    if (r.price) book(g, `${museumDef(w)!.name}: a replica`, -r.price);
    give(g, w, s, { day: g.day, src: 'replica', replica: true, ...(r.price ? { paid: r.price } : {}) });
    return { ok: true, lines: [`The workshop makes a replica of ${s.name}.${whereLine(g, w, s, false)}`, ...(r.price ? [`−${money(w, r.price)}`] : [])] };
}
/** What restoring a piece costs: a quarter of its price, at least `RESTORE.least` (after the difficulty and perks). */
export const restoreFee = (g: Save, w: WorldDef, s: SlotDef) => museumPrice(g, w, Math.max(RESTORE.least, Math.round(basePrice(s) * RESTORE.share)));
/** Pieces waiting for the workshop: damaged finds (not filled yet) and pieces damaged on show; each with its fee, or
 *  the day it's ready when it's being restored. */
export function toRestore(g: Save, w: WorldDef): { id: string; name: string; fee: number; find: boolean; ready?: number }[] {
    if (!museumOn(w)) return [];
    const fix = museumOf(g)?.fix ?? {}, out: { id: string; name: string; fee: number; find: boolean; ready?: number }[] = [];
    for (const s of displayHere(g, w)) {
        const find = !!damagedOf(g)[s.id], hurt = !!gotOf(g, s.id)?.damaged;
        if (find || hurt) out.push({ id: s.id, name: s.name, fee: restoreFee(g, w, s), find, ...(fix[s.id] !== undefined ? { ready: fix[s.id] } : {}) });
    }
    return out;
}
/** Sends a damaged piece to the workshop: paid now, ready in `RESTORE.days` days. */
export function restorePiece(g: Save, w: WorldDef, id: string): { ok: boolean; lines: string[] } {
    const r = toRestore(g, w).find(x => x.id === id);
    if (!r) return { ok: false, lines: ['That needs no restoring.'] };
    if (r.ready !== undefined) return { ok: false, lines: ['It\'s in the workshop already.'] };
    if (!hasUpgrade(g, w, 'workshop')) return { ok: false, lines: [`Restoring needs ${upgradeName(w, 'workshop')}.`] };
    if (g.player.money < r.fee) return { ok: false, lines: [`You need ${money(w, r.fee)}.`] };
    g.player.money -= r.fee;
    if (r.fee) book(g, `${museumDef(w)!.name}: restoring`, -r.fee);
    (museumState(g).fix ??= {})[id] = g.day + RESTORE.days;
    return { ok: true, lines: [`${r.name} goes to the workshop: ready in ${RESTORE.days} days.`, ...(r.fee ? [`−${money(w, r.fee)}`] : [])] };
}

/* ---------- milestone stories ---------- */

// A street story's result for the museum: lasting renown; the theft's damage (the dearest real piece on show needs
// restoring, never taken: its slot stays filled).
museumHooks.story = (g, w, r) => {
    if (!museumOpen(g, w)) return [];
    const st = museumState(g), out: string[] = [];
    if (r.renown) st.renownAdd = Math.max(0, (st.renownAdd ?? 0) + r.renown);
    if (r.damage) {
        const shown = onShow(g, w);
        const s = displayHere(g, w).filter(x => shown.has(x.id) && !gotOf(g, x.id)!.replica).sort(dearestFirst)[0];
        if (s) { gotOf(g, s.id)!.damaged = true; out.push(`${s.name} was damaged: it's off the show until the workshop restores it.`); }
    }
    return out;
};

/* ---------- settling: endings, milestones, stories, the backfill ---------- */

const threadsRead = (g: Save) => ((g as any).threads ?? {}) as Record<string, { ended?: string; endDay?: number; endedBy?: string }>;
const seenRead = (g: Save) => ((g as any).stories?.seen ?? {}) as Record<string, { day: number; choice?: number }>;
// A storyline's ending as a piece's entry (R-3: any ending; gold for a good one).
function endingEntry(g: Save, w: WorldDef, id: string): Partial<Got> {
    const st = threadsRead(g)[id], e = threadsOf(g, w).find(x => x.t.id === id)?.t.endings?.find(x => x.id === st?.ended);
    return { how: st?.ended, ...(e?.good ? { good: true } : {}), ...(st?.endedBy ? { by: st.endedBy } : {}) };
}
// The way a piece comes by itself now, if one does: a storyline ended, a milestone that holds, a story seen.
function cameBy(g: Save, w: WorldDef, s: SlotDef): { x: PieceSource; day?: number } | null {
    for (const x of s.sources ?? []) {
        if (x.kind === 'ending' && x.id) { const t = threadsRead(g)[x.id]; if (t?.ended) return { x, day: t.endDay }; }
        if (x.kind === 'milestone' && x.when && whenHolds(g, w, x.when)) return { x };
        if (x.kind === 'story') {
            const seen = x.id ? seenRead(g)[x.id] : undefined;
            if (seen && (seen.choice ?? -1) >= 0) return { x, day: seen.day };
            if (!x.id && x.when && whenHolds(g, w, x.when)) return { x };
        }
    }
    return null;
}
/** The museum's part of the collection's settle (every hour, when a save opens, when the app opens): pieces that came
 *  by themselves (endings, milestones, stories), restorations done, the museum begun, the offer, renown levels, a show
 *  closing. The first run is the display backfill (an old save's cast things and milestones, one line). */
function settleMuseum(g: Save, w: WorldDef): string[] {
    if (!piecesOn(w)) return [];
    const st = museumState(g), first = !st.v, m = museumDef(w), out: string[] = [];
    let came = 0;
    for (const s of displayHere(g, w)) {
        if (!wanted(g, w, s)) continue;
        const c = cameBy(g, w, s);
        if (!c) continue;
        const entry: Got = { day: c.day ?? g.day, src: c.x.kind, ...(c.x.kind === 'ending' ? endingEntry(g, w, c.x.id!) : {}), ...(first && c.day === undefined ? { back: true } : {}) };
        give(g, w, s, entry);
        came++;
        if (!first) out.push(`Into the collection: ${s.icon ? `${s.icon} ` : ''}${s.name}.${whereLine(g, w, s, false)}`);
    }
    st.v = 1;
    if (first && came) out.push(`Your collection begins with ${came} piece${came === 1 ? '' : 's'}.`);
    if (!m) return out;
    // restorations done: a damaged find is filled the day it's restored (MU-4), a piece damaged on show is back
    for (const [id, day] of Object.entries(st.fix ?? {})) {
        if (g.day < day) continue;
        const s = w.collection!.slots.find(x => x.id === id), d = st.damaged?.[id];
        delete st.fix![id];
        if (!s) continue;
        if (d) give(g, w, s, { day: g.day, src: d.src, ...(d.paid ? { paid: d.paid } : {}) });
        else { const x = gotOf(g, id); if (x) delete x.damaged; }
        out.push(`The workshop has restored ${s.name}.${whereLine(g, w, s, false)}`);
    }
    if (st.begun === undefined && piecesHad(g, w).length) st.begun = g.day;   // (a memento filled by its condition)
    if (st.offered === undefined && whenHolds(g, w, m.offer.when)) {
        st.offered = g.day; st.begun ??= g.day;
        out.push(`${m.name} can be yours: take it on in the Collection app (${money(w, museumPrice(g, w, m.offer.price))}).`);
    }
    if (museumOpen(g, w)) {
        const lv = renownLevel(g, w), list = levelsOf(w);
        while ((st.lv ?? 0) < lv.n) {
            st.lv = (st.lv ?? 0) + 1;
            out.push(`${m.name} is ${list[st.lv - 1].name} now.`);
            const paid = earn(g, w, 'museum', `renown:${st.lv}`);
            if (paid) out.push(paid);
        }
        const show = st.show;
        if (show && !show.told && g.day >= show.until) { show.told = true; out.push(`The show on ${themeName(w, show.theme)} at ${m.name} has closed.`); }
    }
    return out;
}
museumHooks.settle = settleMuseum;

/* ---------- visitors ---------- */

// Each Monday, the week's visitors: renown × `income`, twice that while a show is on.
onDay.push((g, w) => {
    const m = museumDef(w);
    if (!m || !museumOpen(g, w) || !isMonday(g.day)) return [];
    const st = museumState(g);
    if (st.paidDay === g.day) return [];
    st.paidDay = g.day;
    const n = payOf(g, renownOf(g, w) * (m.renown?.income ?? MUSEUM_RENOWN.income) * (showNow(g, w) ? 2 : 1));
    st.income = n;
    if (!(n > 0)) return [];
    g.player.money += n;
    book(g, `${m.name}: visitors`, n);
    return [`${m.name}'s visitors: +${money(w, n)}`];
});

/* ---------- conditions ---------- */

const PIECE_IN = /^(\d+|all)\s+in\s+(\S+)$/i;
collectionLink.piece = (g, w, v) => {
    if (!collectionOn(w)) return false;
    const n = v.match(PIECE_IN);
    if (n) {
        const inHall = displayHere(g, w).filter(s => s.hall === n[2] && !s.bonus), have = inHall.filter(s => !!gotOf(g, s.id)).length;
        return n[1].toLowerCase() === 'all' ? inHall.length > 0 && have === inHall.length : have >= Number(n[1]);
    }
    if (/^\d+$/.test(v)) return piecesHad(g, w).length >= Number(v);
    return hasPiece(g, v);
};
collectionLink.pieceWords = (g, w, v) => {
    const n = v.match(PIECE_IN), hall = n ? hallOf(w, n[2])?.name ?? n[2] : '';
    if (n) {
        const inHall = displayHere(g, w).filter(s => s.hall === n[2] && !s.bonus), have = inHall.filter(s => !!gotOf(g, s.id)).length;
        return n[1].toLowerCase() === 'all' ? `every piece of ${hall} (${have} of ${inHall.length})` : `${n[1]} pieces of ${hall} (${have} now)`;
    }
    if (/^\d+$/.test(v)) return `${v} display pieces (${piecesHad(g, w).length} now)`;
    return w.collection?.slots.find(s => s.id === v)?.name ?? v;
};
collectionLink.museum = (g, w, v) => {
    const m = museumDef(w), st = museumOf(g);
    if (!m) return false;
    const x = v.trim().toLowerCase();
    if (x === 'open') return museumOpen(g, w);
    if (x === 'show') return !!showNow(g, w);
    let k = x.match(/^renown\s+(\d+)$/);
    if (k) return museumOpen(g, w) && renownLevel(g, w).n >= Number(k[1]);
    if ((k = x.match(/^shows\s+(\d+)$/))) return (st?.shows?.length ?? 0) >= Number(k[1]);
    if ((k = x.match(/^(\d+)%$/))) return percentOf(g, w, false).counted > 0 && percentOf(g, w, false).pct >= Number(k[1]);
    return m.upgrades.some(u => u.id === x) && hasUpgrade(g, w, x);
};
collectionLink.museumWords = (g, w, v) => {
    const m = museumDef(w), name = m?.name ?? 'the museum', x = v.trim().toLowerCase();
    if (x === 'open') return `${name} yours`;
    if (x === 'show') return `a show on at ${name}`;
    let k = x.match(/^renown\s+(\d+)$/);
    if (k) { const l = levelsOf(w)[Number(k[1]) - 1]; return `${name} ${l ? l.name : `at renown level ${k[1]}`}`; }
    if ((k = x.match(/^shows\s+(\d+)$/))) return `${k[1]} show${k[1] === '1' ? '' : 's'} held at ${name} (${museumOf(g)?.shows?.length ?? 0} now)`;
    if ((k = x.match(/^(\d+)%$/))) return `${name} ${k[1]}% complete (${percentOf(g, w, false).pct}% now)`;
    return `${name}'s ${upgradeName(w, x)}`;
};

/* ---------- for the screen ---------- */

/** A display piece's tile, beyond track 4's: where it is on show (missing: boxed, or not yours), a replica, damaged (on
 *  show and off it, or a find not filled yet), in the workshop until a day, its restoring fee, how it came, its price
 *  (after difficulty) and rung, and the upgrade it waits for. */
export interface PieceTile { at?: ShowWhere; replica?: boolean; damaged?: boolean; find?: boolean; ready?: number; fee?: number; src?: string; price: number; rung: number; needs?: string }
export function pieceTile(g: Save, w: WorldDef, id: string): PieceTile {
    const s = w.collection?.slots.find(x => x.id === id);
    if (!s) return { price: 0, rung: 0 };
    const x = gotOf(g, id), d = damagedOf(g)[id], fix = museumOf(g)?.fix?.[id], out: PieceTile = { price: museumPrice(g, w, basePrice(s)), rung: rungOf(s) };
    if (x) {
        const at = onShow(g, w).get(id);
        Object.assign(out, at ? { at } : {}, x.src ? { src: x.src } : {}, x.replica ? { replica: true } : {}, x.damaged ? { damaged: true, fee: restoreFee(g, w, s) } : {});
    } else if (d) Object.assign(out, { damaged: true, find: true, src: d.src, fee: restoreFee(g, w, s) });
    if (fix !== undefined) out.ready = fix;
    if (!x && !canHouse(g, w, s)) out.needs = upgradeName(w, s.needsUpgrade!);
    return out;
}
museumHooks.tile = (g, w, id) => ({ ...pieceTile(g, w, id) });
/** How a display hall is on show: whole (its wing), its pieces in the first room, at home in the cases, boxed; the wing
 *  to build (its upgrade id) when there is one and it isn't built. */
export interface HallShow { wing: boolean; room: number; home: number; boxed: number; build?: string }
export function hallShow(g: Save, w: WorldDef, hall: string): HallShow {
    const shown = onShow(g, w), mine = piecesHad(g, w).filter(s => s.hall === hall), wing = wingOf(g, w, hall);
    const count = (k: ShowWhere) => mine.filter(s => shown.get(s.id) === k).length;
    const on = hallOnShow(g, w, hall);
    return { wing: on, room: count('room'), home: count('home'), boxed: mine.filter(s => !shown.has(s.id)).length, ...(wing && !on ? { build: wing.id } : {}) };
}
museumHooks.hall = (g, w, hall) => (museumOn(w) ? { ...hallShow(g, w, hall) } : undefined);
museumHooks.begun = (g, w) => (museumOn(w) ? museumOf(g)?.begun !== undefined : null);

// What the market (sim/market.ts) asks: renown's level, housing (a damaged find waiting for the workshop counts as
// housed already: it isn't offered again), prices, and a piece handed over.
museumLink.level = (g, w) => renownLevel(g, w).n;
museumLink.canHouse = (g, w, s) => canHouse(g, w, s) && !damagedOf(g)[s.id];
museumLink.price = (g, w, base) => museumPrice(g, w, base);
museumLink.give = (g, w, id, x) => { const l = receivePiece(g, w, id, x); return l ? [l] : []; };

/* ---------- what the AI is told ---------- */

const names = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? '');
/** The museum in the `you` block (after the home's line): yours, its renown level, its pieces, a show, its curator; at
 *  its place, the most notable pieces on show and any damaged; before it opens, at home, the cases' pieces. Facts only. */
export function museumLine(g: Save, w: WorldDef): string {
    const m = museumDef(w);
    if (!m || !museumOf(g)) return '';
    const shown = onShow(g, w), slot = (id: string) => w.collection!.slots.find(s => s.id === id);
    if (!museumOpen(g, w)) {
        if (g.player.loc !== playerHomeId) return '';
        const here = [...shown.keys()].map(id => slot(id)?.name).filter((n): n is string => !!n);
        return here.length ? `At {{user}}'s home, a glass display case holds ${names(here)}.` : '';
    }
    const lv = renownLevel(g, w), show = showNow(g, w), cur = curatorOf(g, w);
    const facts = [lv.n ? lv.name : 'not known yet', `${piecesHad(g, w).length} pieces`, ...(show ? [`a show on: ${themeName(w, show.theme)}`] : [])];
    const lines = [`{{user}} owns ${m.name}, a private museum (${facts.join('; ')})${cur ? `; its curator is ${cur.name}` : ''}.`];
    if (g.player.loc === m.place) {
        const top = [...shown.keys()].map(slot).filter((s): s is SlotDef => !!s).sort((a, b) => rungOf(b) - rungOf(a) || dearestFirst(a, b)).slice(0, 5).map(s => s.name);
        if (top.length) lines.push(`On show here: ${names(top)}.`);
        const hurt = toRestore(g, w).map(r => r.name);
        if (hurt.length) lines.push(`Damaged, waiting for the workshop: ${names(hurt)}.`);
    }
    return lines.join(' ');
}
