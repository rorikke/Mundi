// Digs (track 6 of end-game spending, Nature and Before Edo): a dig comes back every season of its own (Tokyo: Hijiri
// University's, every autumn), its actions count the days you dig and roll for its finds, and a piece of parts (a fossil)
// is put together by the museum's workshop once every part is in. The world data is `w.collection.digs` and the slots'
// `dig` sources, `parts`, `mount` and `partPics` (core/world.ts, made safe by core/collection.ts); the save is
// `g.collection.digs` (each dig's counts), `g.collection.parts` (the parts you have) and `g.collection.museum.mount`
// (pieces being put together). With the collection off, or no digs, nothing here reads or writes anything. Also here,
// for the screens: whether a piece's way comes round this season (`inSeason`) and what could turn up at a place now
// (`findsHere`). (This file may import sim/museum.ts; museum.ts never imports this one.)
import type { Save } from '../core/store.js';
import type { WorldDef, DigDef, SlotDef, PieceSource, ActionDef, When } from '../core/world.js';
import { collectionLink, museumHooks } from './hooks.js';
import { collectionOn, collectionOf, type Got } from './collection.js';
import { museumOn, museumOpen, museumDef, museumOf, museumState, museumPrice, hasPiece, hasUpgrade, wanted, curatorOf,
    displayHere, fillPiece, whereLine, upgradeName, FIND } from './museum.js';
import { whenHolds, parseWhen } from './when.js';
import { seasonDays } from './time.js';
import { withYou } from './social.js';
import { actionsHere, money } from './needs.js';
import { festivalsOn } from './festivals.js';
import { openNow } from './daynight.js';
import { book } from './ledger.js';

/** One dig's counts: `at` the season (its index since day 1) the season's counts are for, `days` dug in it and `found`
 *  in it; `seasons` past seasons with a day dug (the current one counts once it's over), `total` days ever, `found`
 *  ever (`all`), the day last counted. */
export interface DigState { at?: number; days?: number; found?: number; seasons?: number; total?: number; all?: number; last?: number }
/** A piece's parts you have: part → the day it came. */
export type PartsState = Record<string, Record<string, number>>;

/** A dig's numbers when the world doesn't say: one action's odds, the days that make sure of a find, finds a season. */
export const DIG = { chance: 0.2, sure: 3, most: 3 };

/** The world's digs, when the collection is on there. */
export const digsOf = (w: WorldDef | null | undefined): DigDef[] => (collectionOn(w) ? w!.collection!.digs ?? [] : []);
export const digOf = (w: WorldDef | null | undefined, id: string): DigDef | undefined => digsOf(w).find(d => d.id === id);
/** The save's dig counts as they are, without writing anything. */
export const digStatesOf = (g: Save | null | undefined): Record<string, DigState> => ((g ? (collectionOf(g) as any)?.digs : undefined) ?? {});
/** One dig's counts, made on first use (only call it with the collection on and the dig in the world). */
export function digState(g: Save, id: string): DigState {
    const c = ((g as any).collection ??= {});
    c.got ??= {}; c.counted ??= []; c.had ??= [];
    return ((c.digs ??= {})[id] ??= {}) as DigState;
}
/** The parts of a piece you have, without writing anything. */
export const partsOf = (g: Save | null | undefined, slot: string): Record<string, number> => ((g ? (collectionOf(g) as any)?.parts?.[slot] : undefined) ?? {});
/** The save's parts, made on first use. */
export function partsState(g: Save): PartsState {
    const c = ((g as any).collection ??= {});
    c.got ??= {}; c.counted ??= []; c.had ??= [];
    return (c.parts ??= {}) as PartsState;
}

/* ---------- seasons ---------- */

/** A day's season index since day 1 (each run of a dig is counted by it). */
export const seasonIndex = (g: Save, day = g.day): number => Math.floor((Math.max(1, day) - 1) / seasonDays(g));
/** Past seasons dug at a dig: those counted, and the last one dug once it's over (it's counted for good the next day
 *  you dig). */
export function seasonsDug(g: Save, id: string): number {
    const s = digStatesOf(g)[id];
    if (!s) return 0;
    return (s.seasons ?? 0) + (s.at !== undefined && (s.days ?? 0) > 0 && s.at < seasonIndex(g) ? 1 : 0);
}
/** Days dug and finds this season (0 when the save's counts are for an earlier season). */
export function thisSeason(g: Save, id: string): { days: number; found: number } {
    const s = digStatesOf(g)[id];
    return s && s.at === seasonIndex(g) ? { days: s.days ?? 0, found: s.found ?? 0 } : { days: 0, found: 0 };
}

/* ---------- the dig's pieces ---------- */

const slotOf = (w: WorldDef, id: string) => w.collection?.slots.find(s => s.id === id);
/** A piece of parts: put together from its parts, never filled whole by a way. */
const ofParts = (s: SlotDef) => !!s.parts?.length;
/** The parts of a piece still missing. */
export const missingParts = (g: Save, s: SlotDef): string[] => { const have = partsOf(g, s.id); return (s.parts ?? []).filter(p => have[p] === undefined); };
const mounting = (g: Save, id: string) => museumOf(g)?.mount?.[id] !== undefined;
/** The dig's pieces that can come now: missing, their `dig` way's `when` holding, housable (a piece of parts by its
 *  missing parts, which need no housing, and not while it's had or being mounted); each with its weight (the way's
 *  `chance`, 1 by default; a piece of parts once per missing part). */
export function digPool(g: Save, w: WorldDef, d: DigDef): { s: SlotDef; x: PieceSource; weight: number; parts: string[] }[] {
    const out: { s: SlotDef; x: PieceSource; weight: number; parts: string[] }[] = [];
    for (const s of displayHere(g, w)) {
        const x = (s.sources ?? []).find(y => y.kind === 'dig' && y.id === d.id && (!y.when || whenHolds(g, w, y.when)));
        if (!x) continue;
        const weight = Math.max(0.001, x.chance ?? 1);
        if (ofParts(s)) {
            if (hasPiece(g, s.id) || mounting(g, s.id)) continue;
            const parts = missingParts(g, s);
            if (parts.length) out.push({ s, x, weight: weight * parts.length, parts });
        } else if (wanted(g, w, s)) out.push({ s, x, weight, parts: [] });
    }
    return out;
}
/** Can the dig give anything at all now: the collection on, and with `lend` in a museum world, the museum yours (a
 *  world without a museum block lends nothing and needs nothing). */
export const digOpen = (g: Save, w: WorldDef, d: DigDef): boolean => collectionOn(w) && (!d.lend || !museumOn(w) || museumOpen(g, w));

/* ---------- a day at the dig ---------- */

// Stable dice for a save, as finds roll them: the world, the day and minute, a salt.
const rnd = (g: Save, salt: string) => { let h = 2166136261; const s = `${g.world}|${g.day}|${g.minutes}|${salt}`; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const article = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const pieceName = (s: SlotDef) => `${s.icon ? `${s.icon} ` : ''}${s.name}`;
/** The odds of one action's find: the dig's `chance` × the best two of the roll made, the reading room and the curator
 *  with you (track 5's finds), at most `FIND.most` (a higher chance of the world's own stays). */
export function digOdds(g: Save, w: WorldDef, d: DigDef, ok: boolean | null, mates: string[]): number {
    const base = d.chance ?? DIG.chance, cur = curatorOf(g, w), withCur = !!cur && (mates.includes(cur.avatar) || withYou(g, w).includes(cur.avatar));
    const k = [ok === true ? FIND.roll : 1, hasUpgrade(g, w, 'reading') ? FIND.reading : 1, withCur ? FIND.curator : 1].sort((p, q) => q - p);
    return Math.min(base * k[0] * k[1], Math.max(base, FIND.most));
}
/** After an action at a dig in its season: the day counted once (a new season's first day closes the last one), then,
 *  under `most` finds this season, one roll; the action that brings the season's days to `sure` with nothing found yet
 *  finds without a roll. A find is one of the dig's pieces by weight; a piece of parts gets one missing part, and fills
 *  when the last part comes unless the museum's workshop mounts it (`mount`). Lines to show. */
function dug(g: Save, w: WorldDef, a: ActionDef, ok: boolean | null, mates: string[]): string[] {
    const out: string[] = [];
    for (const d of digsOf(w)) {
        if (!d.actions.includes(a.id) || g.player.loc !== d.place || !digOpen(g, w, d) || !whenHolds(g, w, d.season)) continue;
        const st = digState(g, d.id), now = seasonIndex(g);
        if (st.at !== now) {
            if (st.at !== undefined && (st.days ?? 0) > 0) st.seasons = (st.seasons ?? 0) + 1;
            st.at = now; st.days = 0; st.found = 0;
        }
        const newDay = st.last !== g.day;
        if (newDay) { st.days = (st.days ?? 0) + 1; st.total = (st.total ?? 0) + 1; st.last = g.day; }
        if ((st.found ?? 0) >= (d.most ?? DIG.most)) continue;
        const pool = digPool(g, w, d);
        if (!pool.length) continue;
        const sure = d.sure ?? DIG.sure;
        const certain = newDay && sure > 0 && st.days === sure && !st.found;
        if (!certain && rnd(g, `dig|${d.id}|${a.id}`) >= digOdds(g, w, d, ok, mates)) continue;
        // one of them, by weight
        const total = pool.reduce((n, f) => n + f.weight, 0);
        let pick = rnd(g, `digwhich|${d.id}|${a.id}`) * total, f = pool[0];
        for (const y of pool) { pick -= y.weight; if (pick < 0) { f = y; break; } }
        st.found = (st.found ?? 0) + 1; st.all = (st.all ?? 0) + 1;
        out.push(...(ofParts(f.s) ? partFound(g, w, d, f.s, f.parts) : pieceFound(g, w, d, f.s)));
    }
    return out;
}
museumHooks.dug = dug;

// How a dig's piece is written into the collection.
const digEntry = (g: Save, d: DigDef | undefined): Got => ({ day: g.day, src: 'dig', ...(d ? { dig: d.id } : {}) });
// Where a dig's piece goes: to the museum on loan (a lending dig in a museum world), else as any new piece.
const loanLine = (g: Save, w: WorldDef, d: DigDef | undefined, s: SlotDef) => (d?.lend && museumOn(w) ? ` It comes to ${museumDef(w)!.name} on loan.${whereLine(g, w, s, false).replace(/^ It goes into .*'s store\.$/, '')}` : whereLine(g, w, s, false));
function pieceFound(g: Save, w: WorldDef, d: DigDef, s: SlotDef): string[] {
    fillPiece(g, w, s, digEntry(g, d));
    return [`At the dig: ${pieceName(s)}.${loanLine(g, w, d, s)}`];
}
function partFound(g: Save, w: WorldDef, d: DigDef, s: SlotDef, missing: string[]): string[] {
    const part = missing[Math.min(missing.length - 1, Math.floor(rnd(g, `digpart|${s.id}`) * missing.length))];
    const have = ((partsState(g)[s.id] ??= {})[part] = g.day, Object.keys(partsOf(g, s.id)).filter(p => s.parts!.includes(p)).length);
    const out = [`At the dig: ${article(part)} of ${s.name} (${have} of ${s.parts!.length}).`];
    if (have < s.parts!.length) return out;
    if (museumOn(w) && s.mount) out.push(`Every part of ${s.name} is in ${museumDef(w)!.name}'s store: the workshop can mount it.`);
    else { fillPiece(g, w, s, digEntry(g, d)); out.push(`${pieceName(s)} is complete.${loanLine(g, w, d, s)}`); }
    return out;
}

/* ---------- mounting ---------- */

/** A piece of parts with every part in, for the workshop: its fee (`museumPrice`: the difficulty and the Connoisseur
 *  perk, as upgrades), its days, why it can't be mounted now ('' when it can: the workshop, the upgrade the piece
 *  needs, money), or the day it's ready when it's being mounted. */
export interface MountView { id: string; name: string; price: number; days: number; why: string; ready?: number }
export function mountsHere(g: Save, w: WorldDef): MountView[] {
    if (!museumOn(w)) return [];
    const out: MountView[] = [], under = museumOf(g)?.mount ?? {};
    for (const s of displayHere(g, w)) {
        if (!ofParts(s) || !s.mount || hasPiece(g, s.id) || missingParts(g, s).length) continue;
        const price = museumPrice(g, w, s.mount.price), days = s.mount.days;
        if (under[s.id] !== undefined) { out.push({ id: s.id, name: s.name, price, days, why: '', ready: under[s.id] }); continue; }
        const why = !museumOpen(g, w) ? 'The museum isn\'t yours yet.' : !hasUpgrade(g, w, 'workshop') ? `Mounting needs ${upgradeName(w, 'workshop')}.`
            : s.needsUpgrade && !hasUpgrade(g, w, s.needsUpgrade) ? `Needs ${upgradeName(w, s.needsUpgrade)} first.` : g.player.money < price ? `You need ${money(w, price)}.` : '';
        out.push({ id: s.id, name: s.name, price, days, why });
    }
    return out;
}
/** Has the workshop mount a piece whose parts are all in: paid now, the slot filled the day it's ready. */
export function mountPiece(g: Save, w: WorldDef, id: string): { ok: boolean; lines: string[] } {
    const v = mountsHere(g, w).find(x => x.id === id);
    if (!v) return { ok: false, lines: ['There is nothing of that to mount.'] };
    if (v.ready !== undefined) return { ok: false, lines: ['It\'s being mounted already.'] };
    if (v.why) return { ok: false, lines: [v.why] };
    const m = museumDef(w)!;
    g.player.money -= v.price;
    if (v.price) book(g, `${m.name}: mounting ${v.name}`, -v.price);
    (museumState(g).mount ??= {})[id] = g.day + v.days;
    return { ok: true, lines: [`The workshop starts mounting ${v.name}: ready in ${v.days} day${v.days === 1 ? '' : 's'}.`, ...(v.price ? [`−${money(w, v.price)}`] : [])] };
}
// The dig a piece of parts comes from (for its entry), if one of its ways names one.
const digOfSlot = (w: WorldDef, s: SlotDef) => digOf(w, (s.sources ?? []).find(x => x.kind === 'dig' && !!x.id)?.id ?? '');
/** The dig's part of the collection's settle: mounts done fill their slot on the ready day; a piece whose parts are
 *  all in fills at once where nothing mounts it (no museum block, or the slot has no `mount`: the world's data may
 *  change under a save). Lines to show. */
function settleDig(g: Save, w: WorldDef): string[] {
    if (!collectionOn(w)) return [];
    const out: string[] = [], under = museumOf(g)?.mount;
    for (const [id, day] of Object.entries(under ?? {})) {
        if (g.day < day) continue;
        delete under![id];
        const s = slotOf(w, id);
        if (!s || hasPiece(g, id)) continue;
        fillPiece(g, w, s, digEntry(g, digOfSlot(w, s)));
        out.push(`The workshop has mounted ${s.name}.${whereLine(g, w, s, false)}`);
    }
    const parts = (collectionOf(g) as any)?.parts as PartsState | undefined;
    for (const id of Object.keys(parts ?? {})) {
        const s = slotOf(w, id);
        if (!s || !ofParts(s) || hasPiece(g, id) || mounting(g, id) || missingParts(g, s).length || (museumOn(w) && s.mount)) continue;
        if (!displayHere(g, w).some(x => x.id === id)) continue;
        fillPiece(g, w, s, digEntry(g, digOfSlot(w, s)));
        out.push(`${pieceName(s)} is complete.${whereLine(g, w, s, false)}`);
    }
    return out;
}
museumHooks.settleDig = settleDig;

/* ---------- in season (the tiles' mark) ---------- */

// The parts of a condition that follow the calendar by day: a season, a festival, a city event.
const BY_DAY = new Set(['season', 'festival', 'event']), BY_YEAR = new Set(['season', 'festival']);
const dayParts = (when: When | undefined, keys = BY_DAY): string => parseWhen(when).conds.filter(c => keys.has(c.key)).map(c => `${c.key}: ${c.not ? 'not ' : ''}${c.values.join(' or ')}`).join('; ');
/** Can a piece's way come round in the season now (from today to the season's last day)? A pure reading of its find,
 *  sold and festival ways: a way counts when its condition (a find's action's too) has a `season:`, `festival:` or
 *  `event:` part, or it's a festival's stall, and those parts hold on one of those days; a way with none is there all
 *  year and isn't "in season". No dice, nothing written. `yearly` (the tiles' mark, ui/collection.ts): only `season:`
 *  and `festival:` parts count, since a city event can come every week (Yoyogi's Sunday flea market) and would mark a
 *  piece in every season. */
function inSeason(g: Save, w: WorldDef, slot: string, opts: { yearly?: boolean } = {}): boolean {
    const keys = opts.yearly ? BY_YEAR : BY_DAY;
    const s = slotOf(w, slot);
    if (!s || !collectionOn(w)) return false;
    const from = g.day, to = (seasonIndex(g) + 1) * seasonDays(g);
    for (const x of s.sources ?? []) {
        if (x.kind !== 'find' && x.kind !== 'sold' && x.kind !== 'festival') continue;
        const a = x.kind === 'find' && x.action ? w.actions.find(y => y.id === x.action) : undefined;
        const parts = [dayParts(x.when, keys), dayParts(a?.when, keys)].filter(Boolean).join('; ');
        if (!parts && x.kind !== 'festival') continue;
        for (let day = from; day <= to; day++) {
            if (x.kind === 'festival' && (!x.id || !festivalsOn(g, w, day).some(f => f.id === x.id))) continue;
            if (!parts || whenHolds(g, w, parts, { at: day * 1440 + 12 * 60, day: true })) return true;
        }
    }
    return false;
}
museumHooks.inSeason = inSeason;
export { inSeason };

/* ---------- what could turn up here now (the Here tab) ---------- */

export interface FindsHere { id: string; name: string; pieces: { id: string; name: string; icon?: string; pic?: string }[] }
const asPiece = (s: SlotDef) => ({ id: s.id, name: s.name, ...(s.icon ? { icon: s.icon } : {}), ...(s.pic ? { pic: s.pic } : {}) });
/** The actions at a place (the one you're at: those offered now; another: its own actions while it's open and their
 *  `when` holds) with a missing piece that could turn up now: a find whose way's `when` holds, a dig's piece in its
 *  season. Each with the pieces, by name as the tiles show them. */
export function findsHere(g: Save, w: WorldDef, place = g.player.loc): FindsHere[] {
    if (!collectionOn(w) || !place) return [];
    const acts = place === g.player.loc ? actionsHere(g, w)
        : openNow(g, w, place) ? w.actions.filter(a => (a.place === place || !!a.places?.includes(place) || !!w.places.find(p => p.id === place)?.actions?.includes(a.id)) && (!a.when || whenHolds(g, w, a.when, { place, id: a.id, key: a.id }))) : [];
    if (!acts.length) return [];
    const here = displayHere(g, w).filter(s => !ofParts(s) && wanted(g, w, s));
    const out: FindsHere[] = [];
    for (const a of acts) {
        const list: SlotDef[] = here.filter(s => (s.sources ?? []).some(x => x.kind === 'find' && (x.action ? x.action === a.id : !!x.at?.includes(place)) && (!x.when || whenHolds(g, w, x.when, { place }))));
        for (const d of digsOf(w)) {
            if (d.place !== place || !d.actions.includes(a.id) || !digOpen(g, w, d) || !whenHolds(g, w, d.season, { place })) continue;
            if (thisSeason(g, d.id).found >= (d.most ?? DIG.most)) continue;
            for (const f of digPool(g, w, d)) if (!list.includes(f.s)) list.push(f.s);
        }
        if (list.length) out.push({ id: a.id, name: a.label || a.name, pieces: list.map(asPiece) });
    }
    return out;
}

/* ---------- what the AI is told ---------- */

/** At a dig's place while its season runs and you've joined (one of its actions is offered today): the dig is on and
 *  your days this season, for the `you` block. */
export function digLine(g: Save, w: WorldDef): string {
    const out: string[] = [];
    for (const d of digsOf(w)) {
        if (g.player.loc !== d.place || !digOpen(g, w, d) || !whenHolds(g, w, d.season, { day: true })) continue;
        const joined = d.actions.some(id => { const a = w.actions.find(x => x.id === id); return !!a && whenHolds(g, w, a.when, { day: true, id: a.id, key: a.id }); });
        if (!joined) continue;
        const n = thisSeason(g, d.id).days;
        out.push(`${d.name.charAt(0).toUpperCase()}${d.name.slice(1)} is on here; {{user}} volunteers with the team (${n ? `${n} day${n === 1 ? '' : 's'} this season` : 'not a day dug yet this season'}).`);
    }
    return out.join(' ');
}

/* ---------- the condition key `dig:` ---------- */

// `dig: seasons 1` · `days 3` · `found 2`, summed over the world's digs
const DIG_KEY = /^(seasons|days|found)\s+(\d+)$/i;
const countOf = (g: Save, w: WorldDef, what: string): number => {
    const st = digStatesOf(g);
    return digsOf(w).reduce((n, d) => { const s = st[d.id] ?? {}; return n + (what === 'seasons' ? seasonsDug(g, d.id) : what === 'days' ? s.total ?? 0 : s.all ?? 0); }, 0);
};
collectionLink.dig = (g, w, v) => {
    const m = v.match(DIG_KEY); if (!m || !digsOf(w).length) return false;
    return countOf(g, w, m[1].toLowerCase()) >= Number(m[2]);
};
collectionLink.digWords = (g, w, v) => {
    const m = v.match(DIG_KEY); if (!m) return v;
    const n = Number(m[2]), name = digsOf(w)[0]?.name ?? 'the dig';
    const what = m[1].toLowerCase();
    if (what === 'seasons') return n === 1 ? `a season at ${name}` : `${n} seasons at ${name}`;
    if (what === 'days') return n === 1 ? `a day at ${name}` : `${n} days at ${name}`;
    return n === 1 ? `a find at ${name}` : `${n} finds at ${name}`;
};
