// One store for relationships (save key `rel`). Friendship (−100..100) and romance (0..100) are kept per direction
// ("x>y": how x feels about y), the status of a couple (dating, engaged, married) and its cooldowns per unordered pair
// ("a|b"), for the player and between characters alike. `'__you'` is whoever you play, as in ties and households:
// "Play as" rewrites the ids (`swapIds`), so everyone's feelings stay with the person. The store is sparse: a
// missing entry is the default (0, no status), and a write that lands on the default removes it.
// Only this file touches `rel.m`, `rel.fat` and `rel.pairs`; the older names (bondOf, addBond, romOf…) read through it.
import { nowAbs, cfg, type Save } from '../core/store.js';
import { getWorld, isScenario } from '../core/world.js';
import { difficultyOf } from './bills.js';
import type { TieType, TieTone } from './living.js';

export const YOU = '__you';
export type Meter = 'f' | 'r';
export type Status = 'casual' | 'dating' | 'engaged' | 'married';
/** The pair's state. `status` absent: not a couple (an entry may hold only a cooldown after a "no"). */
export interface PairState { status?: Status; since?: number; cooldown?: number; low?: number }
export type Pace = 'slow' | 'normal' | 'fast';
/** A person's own settings (more come with later features). */
export interface Person { pace?: { f?: Pace; r?: Pace } }
export interface RelStore {
    m: Record<string, { f?: number; r?: number }>;            // "x>y": x's friendship and romance toward y
    fat: Record<string, { f?: number; r?: number; at: number }>;   // "x>y": gains still weighing (pacing)
    pairs: Record<string, PairState>;                          // "a|b", sorted
    people: Record<string, Person>;
    log?: unknown;                                             // records per message (sim/msglog.ts)
}

export function relOf(g: Save): RelStore {
    const r = ((g as any).rel ??= {}) as RelStore;
    r.m ??= {}; r.fat ??= {}; r.pairs ??= {}; r.people ??= {};
    return r;
}
// The person you play is `'__you'` in the store, whichever id a caller uses (the same rule as `selfAvatar` in
// playas.ts, repeated here so the store doesn't depend on "Play as").
const self = (g: Save) => { const s = (g as any).swap; return s ? String(s.avatar || s.origCard || '') : ''; };
export const idOf = (g: Save, a: string) => (a && a === self(g) ? YOU : a);
const dk = (x: string, y: string) => `${x}>${y}`;
const pk = (a: string, b: string) => [a, b].sort().join('|');
const LO: Record<Meter, number> = { f: -100, r: 0 };
const clean = (v: number) => Math.round(v * 10000) / 10000;   // decimals, without float dust in the save

/* ---------- meters ---------- */

export const meter = (g: Save, m: Meter, x: string, y: string): number => relOf(g).m[dk(idOf(g, x), idOf(g, y))]?.[m] ?? 0;
export const hasMeter = (g: Save, m: Meter, x: string, y: string) => relOf(g).m[dk(idOf(g, x), idOf(g, y))]?.[m] !== undefined;
export const fr = (g: Save, x: string, y: string) => meter(g, 'f', x, y);
export const ro = (g: Save, x: string, y: string) => meter(g, 'r', x, y);
// friendship toward you doesn't go below 0 yet (people who dislike you come with directional relationships)
const floor = (m: Meter, y: string) => (m === 'f' && y === YOU ? 0 : LO[m]);

// An explicit value: starting values, editors, the migration.
export function setMeter(g: Save, m: Meter, x: string, y: string, v: number) {
    x = idOf(g, x); y = idOf(g, y);
    if (!x || !y || x === y || !Number.isFinite(v)) return;
    const st = relOf(g); const k = dk(x, y);
    const val = clean(Math.max(floor(m, y), Math.min(100, v)));
    const e = (st.m[k] ??= {});
    if (val === 0) delete e[m]; else e[m] = val;
    if (e.f === undefined && e.r === undefined) delete st.m[k];
}
export const setFr = (g: Save, x: string, y: string, v: number) => setMeter(g, 'f', x, y, v);
export const setRo = (g: Save, x: string, y: string, v: number) => setMeter(g, 'r', x, y, v);

/** What a gain or loss actually changed: the meter by `d`, the pacing weight by `fat` (so it can be undone). */
export interface Applied { d: number; fat: number }
const NONE: Applied = { d: 0, fat: 0 };

// A gain. Paced gains (talk, reactions, texts…) count against what was gained recently; milestones (an accepted ask,
// a kept date, a story event) apply in full. The person you play gains nothing: their feelings wait for you to leave.
// For now friendship keeps the old rule: at most `bondCap` (15) paced points a day with each person, scaled by the
// Home difficulty; romance isn't paced.
export function gain(g: Save, m: Meter, x: string, y: string, raw: number, paced = true): Applied {
    x = idOf(g, x); y = idOf(g, y);
    if (!x || !y || x === YOU || x === y || !(raw > 0)) return NONE;
    const before = meter(g, m, x, y);
    let add = raw, fat = 0;
    if (paced && m === 'f') {
        const mult = isScenario(getWorld(g.world)) ? difficultyOf(g).bond : 1;
        if (mult !== 1) add = Math.max(1, Math.round(add * mult));
        const f = relOf(g).fat[dk(x, y)];
        const today = f && Math.floor(f.at / 1440) === g.day ? f.f ?? 0 : 0;
        add = Math.min(add, Math.max(0, Math.round((cfg(g).bondCap ?? 15) * mult) - today));
        if (add <= 0) return NONE;
        fat = add;
        relOf(g).fat[dk(x, y)] = { f: today + add, at: nowAbs(g) };
    }
    setMeter(g, m, x, y, before + add);
    return { d: clean(meter(g, m, x, y) - before), fat };
}
// A loss: in full, never paced. Returns how much it went down.
export function lose(g: Save, m: Meter, x: string, y: string, n: number): number {
    const before = meter(g, m, x, y);
    setMeter(g, m, x, y, before - Math.abs(n));
    return clean(before - meter(g, m, x, y));
}
// Takes back exactly what a gain applied (sim/msglog.ts): the meter, and the pacing weight it added.
export function undoGain(g: Save, m: Meter, x: string, y: string, a: Applied) {
    x = idOf(g, x); y = idOf(g, y);
    if (a.d) setMeter(g, m, x, y, meter(g, m, x, y) - a.d);
    const f = relOf(g).fat[dk(x, y)];
    if (a.fat && f && Math.floor(f.at / 1440) === g.day) { f.f = clean(Math.max(0, (f.f ?? 0) - a.fat)); if (!f.f) delete relOf(g).fat[dk(x, y)]; }
}

/* ---------- pairs ---------- */

export const PARTNER: Status[] = ['dating', 'engaged', 'married'];
export const pairOf = (g: Save, a: string, b: string): PairState | undefined => relOf(g).pairs[pk(idOf(g, a), idOf(g, b))];
export const statusOf = (g: Save, a: string, b: string): Status | null => pairOf(g, a, b)?.status ?? null;
function tidyPair(st: RelStore, k: string) { const p = st.pairs[k]; if (p && !p.status && !p.cooldown) delete st.pairs[k]; }
// Sets (or ends, with null) the status of a pair; a new status starts counting from today.
export function setStatus(g: Save, a: string, b: string, status: Status | null, since = g.day) {
    a = idOf(g, a); b = idOf(g, b);
    if (!a || !b || a === b) return;
    const st = relOf(g); const k = pk(a, b); const p = (st.pairs[k] ??= {});
    if (status) { if (p.status !== status) p.since = since; p.status = status; }
    else { delete p.status; delete p.since; delete p.low; }
    tidyPair(st, k);
}
export function setCooldown(g: Save, a: string, b: string, until: number) {
    a = idOf(g, a); b = idOf(g, b);
    if (!a || !b || a === b) return;
    const st = relOf(g); const k = pk(a, b); const p = (st.pairs[k] ??= {});
    if (until > 0) p.cooldown = until; else delete p.cooldown;
    tidyPair(st, k);
}
// Everyone `id` is with (dating, engaged or married).
export function partnersOf(g: Save, id = YOU): string[] {
    id = idOf(g, id);
    const out: string[] = [];
    for (const [k, p] of Object.entries(relOf(g).pairs)) {
        if (!p.status || !PARTNER.includes(p.status)) continue;
        const [a, b] = k.split('|');
        if (a === id) out.push(b); else if (b === id) out.push(a);
    }
    return out;
}
export const isPartner = (g: Save, a: string, b = YOU) => PARTNER.includes(statusOf(g, a, b) as Status);
// Couples between two people of the world (not you).
export function couplePairs(g: Save): { a: string; b: string; status: Status; since: number }[] {
    const out: { a: string; b: string; status: Status; since: number }[] = [];
    for (const [k, p] of Object.entries(relOf(g).pairs)) {
        if (!p.status || !PARTNER.includes(p.status)) continue;
        const [a, b] = k.split('|');
        if (a !== YOU && b !== YOU && g.cast[a] && g.cast[b]) out.push({ a, b, status: p.status, since: p.since ?? g.day });
    }
    return out;
}

/* ---------- "Play as": the store follows the people ---------- */

// Rewrites every id in the store (the same mapping "Play as" applies to ties and households).
export function swapIds(g: Save, map: (id: string) => string) {
    const st = relOf(g);
    const re = <T>(o: Record<string, T>, sep: string, sort: boolean) => {
        const out: Record<string, T> = {};
        for (const [k, v] of Object.entries(o)) { const ids = k.split(sep).map(map); out[(sort ? ids.sort() : ids).join(sep)] = v; }
        return out;
    };
    st.m = re(st.m, '>', false); st.fat = re(st.fat, '>', false); st.pairs = re(st.pairs, '|', true);
    st.people = Object.fromEntries(Object.entries(st.people).map(([k, v]) => [map(k), v]));
}

/* ---------- where relationships start (one table) ---------- */

// The tone of a tie gives the starting friendship; its type gives the starting approval, the tone when none is
// chosen, and romance for couples. Used wherever a relationship starts: a new game, the migration, "Play as".
export const TONE_FRIENDSHIP: Record<TieTone, number> = { close: 75, good: 55, neutral: 30, tense: 0, hostile: -50 };
export const COUPLE_ROMANCE = 70;
export const TYPE_START: Record<TieType, { approval: number; tone: TieTone; couple?: true }> = {
    bestfriend: { approval: 30, tone: 'close' }, friend: { approval: 15, tone: 'good' }, ally: { approval: 20, tone: 'good' },
    colleague: { approval: 5, tone: 'neutral' }, dating: { approval: 25, tone: 'good', couple: true }, partner: { approval: 25, tone: 'close', couple: true },
    spouse: { approval: 30, tone: 'close', couple: true }, parent: { approval: 20, tone: 'close' }, child: { approval: 20, tone: 'close' },
    sibling: { approval: 15, tone: 'good' }, cousin: { approval: 10, tone: 'neutral' }, roommate: { approval: 5, tone: 'neutral' },
    rival: { approval: -20, tone: 'tense' }, enemy: { approval: -50, tone: 'hostile' }, ex: { approval: -10, tone: 'tense' },
    mentor: { approval: 25, tone: 'good' }, apprentice: { approval: 25, tone: 'good' },
};
const TONES: TieTone[] = ['hostile', 'tense', 'neutral', 'good', 'close'];
// A couple starts at least on good terms.
export const coupleTone = (t: TieTone): TieTone => (TONES.indexOf(t) < TONES.indexOf('good') ? 'good' : t);
export const startFriendship = (tone: TieTone | undefined, type?: TieType) => TONE_FRIENDSHIP[tone ?? (type ? TYPE_START[type]?.tone : undefined) ?? 'neutral'] ?? 30;
// Starting values from ties, for every direction that has none yet (a new game, the migration): friendship from the
// tone, and for couples (by tie type or by status) romance and at least good terms. Toward you nothing is seeded
// here (that comes from the game's start or the save); your own hidden feelings (`__you>x`) are. `skip(x, y)` leaves
// a direction alone (the migration: people whose view of others was already stored).
export function seedFromTies(g: Save, ties: { a: string; b: string; type: TieType; tone: TieTone }[], skip: (x: string, y: string) => boolean = () => false) {
    const st = relOf(g);
    const seed = (x: string, y: string, f: number, r?: number) => {
        if (x === y || y === YOU || skip(x, y)) return;
        const e = st.m[dk(x, y)];
        if (e?.f === undefined) setMeter(g, 'f', x, y, f);
        if (r !== undefined && e?.r === undefined) setMeter(g, 'r', x, y, r);
    };
    for (const t of ties) {
        const a = idOf(g, t.a), b = idOf(g, t.b);
        const couple = !!TYPE_START[t.type]?.couple || PARTNER.includes(statusOf(g, a, b) as Status);
        const tone = t.tone ?? TYPE_START[t.type]?.tone ?? 'neutral';
        const f = startFriendship(couple ? coupleTone(tone) : tone);
        seed(a, b, f, couple ? COUPLE_ROMANCE : undefined); seed(b, a, f, couple ? COUPLE_ROMANCE : undefined);
    }
    // couples without a tie between them
    for (const [k, p] of Object.entries(st.pairs)) {
        if (!p.status || !PARTNER.includes(p.status)) continue;
        const [a, b] = k.split('|');
        seed(a, b, TONE_FRIENDSHIP.good, COUPLE_ROMANCE); seed(b, a, TONE_FRIENDSHIP.good, COUPLE_ROMANCE);
    }
}
// "How each sees you" in cast presets (approval words) as a tone.
export const toneOfApproval = (v: number): TieTone => (v >= 50 ? 'close' : v >= 15 ? 'good' : v > -15 ? 'neutral' : v > -50 ? 'tense' : 'hostile');
