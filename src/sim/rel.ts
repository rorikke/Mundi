// One store for relationships (save key `rel`). Friendship (−100..100) and romance (0..100) are kept per direction
// ("x>y": how x feels about y), the status of a couple (dating, engaged, married), its cooldowns and the couple they
// used to be per unordered pair ("a|b"), for the player and between characters alike. `'__you'` is whoever you play, as in ties and households:
// "Play as" rewrites the ids (`swapIds`), so everyone's feelings stay with the person. The store is sparse: a
// missing entry is the default (0, no status), and a write that lands on the default removes it.
// Only this file touches `rel.m`, `rel.fat` and `rel.pairs`; the older names (bondOf, addBond, romOf…) read through it.
import { nowAbs, cfg, type Save, type RelCfg } from '../core/store.js';
import { getWorld, isScenario } from '../core/world.js';
import { difficultyOf } from './bills.js';
import { CURVES, HALF_LIFE, PACE, faded, paced, rateAt, type Curve, type PaceId } from './pace.js';
import { onCoupleEnd } from './hooks.js';
import type { TieType, TieTone } from './living.js';
import type { Intimacy, RelStyle } from './intimacy.js';

export const YOU = '__you';
export type Meter = 'f' | 'r';
export type Status = 'casual' | 'dating' | 'engaged' | 'married';
/** The pair's state. `status` absent: not a couple (an entry may hold only a cooldown after a "no", or `was`).
 *  `was`: the couple they used to be and the day it ended. */
export interface PairState { status?: Status; since?: number; cooldown?: number; low?: number; was?: Past }
/** A couple that ended. `status` missing: exes from before this was kept (what they were is unknown). */
export interface Past { status?: Status; until: number }
export type Pace = PaceId;
/** A person's own settings. `age` from the world's example cast; `minor` set in the People tab: minors are left out of
 *  every romance. `gender`: one of the world's gender ids (unset: nobody's attraction depends on it). */
export interface Person { pace?: { f?: Pace; r?: Pace }; age?: number; minor?: boolean; intimacy?: Intimacy; style?: RelStyle; looking?: string; gender?: string; att?: Attraction }
/** Per gender id: how much of the normal rate this person's friendship (`f`) and romance (`r`) grow toward people of
 *  that gender, 0..1 (missing: 1). */
export type Attraction = Record<string, { f?: number; r?: number }>;
export interface RelStore {
    m: Record<string, { f?: number; r?: number }>;            // "x>y": x's friendship and romance toward y
    fat: Record<string, { f?: number; r?: number; at: number }>;   // "x>y": gains still weighing (pacing)
    pairs: Record<string, PairState>;                          // "a|b", sorted
    people: Record<string, Person>;
    contact?: Record<string, number>;                          // "a|b": the last day they had contact (romance fading)
    log?: unknown;                                             // records per message (sim/msglog.ts)
    day?: DaySnap;                                             // today's start values toward you (the recap)
}
/** Values toward you when today's first change came (x → [friendship, romance]), and the reasons the day's verdicts
 *  gave per person: the end-of-day recap compares with it, whatever the source of each change. */
export interface DaySnap { day: number; snap: Record<string, [number, number]>; why: Record<string, string[]> }

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

// The start of today's values toward you, kept at the first change of the day.
function markDay(g: Save, st: RelStore) {
    if (st.day?.day === g.day) return;
    const snap: Record<string, [number, number]> = {};
    for (const [k, e] of Object.entries(st.m)) if (k.endsWith(`>${YOU}`)) snap[k.slice(0, -YOU.length - 1)] = [e.f ?? 0, e.r ?? 0];
    st.day = { day: g.day, snap, why: {} };
}
// An explicit value: starting values, editors, the migration.
export function setMeter(g: Save, m: Meter, x: string, y: string, v: number) {
    x = idOf(g, x); y = idOf(g, y);
    if (!x || !y || x === y || !Number.isFinite(v)) return;
    const st = relOf(g); const k = dk(x, y);
    if (y === YOU) markDay(g, st);
    const val = clean(Math.max(LO[m], Math.min(100, v)));
    const e = (st.m[k] ??= {});
    if (val === 0) delete e[m]; else e[m] = val;
    if (e.f === undefined && e.r === undefined) delete st.m[k];
}
export const setFr = (g: Save, x: string, y: string, v: number) => setMeter(g, 'f', x, y, v);
export const setRo = (g: Save, x: string, y: string, v: number) => setMeter(g, 'r', x, y, v);

// Every direction whose meter is at least `min` (a daily look over the store: crushes, couples forming).
export function directedAbove(g: Save, m: Meter, min: number): { x: string; y: string; v: number }[] {
    const out: { x: string; y: string; v: number }[] = [];
    for (const [k, e] of Object.entries(relOf(g).m)) { const v = e[m]; if (v !== undefined && v >= min) { const [x, y] = k.split('>'); out.push({ x, y, v }); } }
    return out;
}

/* ---------- pacing (sim/pace.ts) ---------- */

export const relCfg = (g: Save): RelCfg => (cfg(g).rel ?? {});
const halfLife = (g: Save) => relCfg(g).halfLife ?? HALF_LIFE;
// Home: the difficulty is how fast relationships grow (gains only; losses stay as they are)
const homeMult = (g: Save) => (isScenario(getWorld(g.world)) ? difficultyOf(g).bond : 1);
export const paceOf = (g: Save, x: string, m: Meter): Pace | undefined => relOf(g).people[idOf(g, x)]?.pace?.[m];
// x's curve for a meter: the save's settings, x's own pace, and (the easy points only) the Home difficulty.
export function curveOf(g: Save, x: string, m: Meter): Curve {
    const set = relCfg(g).pace?.[m] ?? {};
    const k = PACE[paceOf(g, x, m) ?? 'normal'] ?? 1;
    return { E: (set.E ?? CURVES[m].E) * k * homeMult(g), H: (set.H ?? CURVES[m].H) * k };
}
// x's fatigue toward y for a meter, faded to now.
export function fatigue(g: Save, m: Meter, x: string, y: string): number {
    const f = relOf(g).fat[dk(idOf(g, x), idOf(g, y))];
    return f ? faded(f[m] ?? 0, nowAbs(g) - f.at, halfLife(g)) : 0;
}
// The rate of x's next paced point toward y (1 = full), for the debug view.
export const rateOf = (g: Save, m: Meter, x: string, y: string) => rateAt(fatigue(g, m, x, y), curveOf(g, x, m));
// Moves fatigue by `delta` (both meters faded to now first); tiny leftovers are dropped.
function addFatigue(g: Save, m: Meter, x: string, y: string, delta: number) {
    const st = relOf(g); const k = dk(x, y); const now = nowAbs(g);
    const f = st.fat[k];
    const next: { f?: number; r?: number; at: number } = { at: now };
    for (const mm of ['f', 'r'] as Meter[]) {
        const v = clean(faded(f?.[mm] ?? 0, now - (f?.at ?? now), halfLife(g)) + (mm === m ? delta : 0));
        if (v >= 0.05) next[mm] = v;
    }
    if (next.f === undefined && next.r === undefined) delete st.fat[k]; else st.fat[k] = next;
}

/** What a gain or loss actually changed: the meter by `d`, the pacing weight by `fat` (so it can be undone). */
export interface Applied { d: number; fat: number }
const NONE: Applied = { d: 0, fat: 0 };

// How much of a gain x feels toward y: x's attraction for y's gender, per meter (0..1; 1 when y has no gender or x
// set nothing for it). Starting values and losses never read it.
export function attraction(g: Save, x: string, y: string, m: Meter): number {
    const people = relOf(g).people, gy = people[idOf(g, y)]?.gender;
    if (!gy) return 1;
    const v = people[idOf(g, x)]?.att?.[gy]?.[m];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}
// x can fall for y at all (romance attraction above 0).
export const attracted = (g: Save, x: string, y: string) => attraction(g, x, y, 'r') > 0;

// A gain. Paced gains (talk, reactions, texts, the verdict…) slow down with what was gained recently; milestones (an
// accepted ask, a kept date, a story event) apply in full and add no fatigue. Attraction scales it first (zero: it
// never rises), then the Home difficulty. The person you play gains nothing: their feelings wait for you to leave.
export function gain(g: Save, m: Meter, x: string, y: string, raw: number, isPaced = true): Applied {
    x = idOf(g, x); y = idOf(g, y);
    if (!x || !y || x === YOU || x === y || !(raw > 0)) return NONE;
    raw *= attraction(g, x, y, m) * homeMult(g);
    if (!(raw > 0)) return NONE;
    const before = meter(g, m, x, y);
    const add = isPaced ? paced(raw, fatigue(g, m, x, y), curveOf(g, x, m)) : raw;
    setMeter(g, m, x, y, before + add);
    const d = clean(meter(g, m, x, y) - before);
    const fat = isPaced ? clean(add) : 0;
    if (fat) addFatigue(g, m, x, y, fat);
    return { d, fat };
}
/** What each everyday source is worth (raw points, before pacing). Other sources pass their own amounts. */
export const SOURCES = {
    talk: 0.5,      // each line you say, to each resident present who has spoken in the scene
    verdict: 2,     // each step of a scene verdict (−3..+3), friendship and romance (sim/verdict.ts)
};
// A loss: in full, never paced. Returns how much it went down.
export function lose(g: Save, m: Meter, x: string, y: string, n: number): number {
    const before = meter(g, m, x, y);
    setMeter(g, m, x, y, before - Math.abs(n));
    return clean(before - meter(g, m, x, y));
}
// Takes back what a gain applied (sim/msglog.ts): the meter, and the pacing weight it added (unless `meterOnly`:
// a correction made after the scene, when that weight has already faded).
export function undoGain(g: Save, m: Meter, x: string, y: string, a: Applied, meterOnly = false) {
    x = idOf(g, x); y = idOf(g, y);
    if (a.d) setMeter(g, m, x, y, meter(g, m, x, y) - a.d);
    if (a.fat && !meterOnly) addFatigue(g, m, x, y, -Math.min(a.fat, fatigue(g, m, x, y)));
}

/* ---------- pairs ---------- */

export const PARTNER: Status[] = ['dating', 'engaged', 'married'];
export const pairOf = (g: Save, a: string, b: string): PairState | undefined => relOf(g).pairs[pk(idOf(g, a), idOf(g, b))];
export const statusOf = (g: Save, a: string, b: string): Status | null => pairOf(g, a, b)?.status ?? null;
function tidyPair(st: RelStore, k: string) { const p = st.pairs[k]; if (p && !p.status && !p.cooldown && !p.was) delete st.pairs[k]; }
// Sets (or ends, with null) the status of a pair; a new status starts counting from today. An ending is remembered as
// the couple they used to be (`was`), unless `remember` is off: a change made by hand in an editor isn't a break-up.
export function setStatus(g: Save, a: string, b: string, status: Status | null, since = g.day, remember = true) {
    a = idOf(g, a); b = idOf(g, b);
    if (!a || !b || a === b) return;
    const st = relOf(g); const k = pk(a, b); const p = (st.pairs[k] ??= {});
    if (status) { if (p.status !== status) p.since = since; p.status = status; delete p.was; }
    else {
        const ended = p.status;
        if (ended && remember) p.was = { status: ended, until: g.day };
        delete p.status; delete p.since; delete p.low;
        if (ended) for (const f of onCoupleEnd) f(g, a, b);
    }
    tidyPair(st, k);
}
// Days in a row a partner has felt too little (a partner leaving you counts them; 0 clears it).
export function setLow(g: Save, a: string, b: string, n: number) {
    a = idOf(g, a); b = idOf(g, b);
    const p = relOf(g).pairs[pk(a, b)];
    if (!p) return;
    if (n > 0) p.low = n; else delete p.low;
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
// Everyone `id` has something casual with (not partners: no key, no moving in, no baby).
export function casualsOf(g: Save, id = YOU): string[] {
    id = idOf(g, id);
    const out: string[] = [];
    for (const [k, p] of Object.entries(relOf(g).pairs)) {
        if (p.status !== 'casual') continue;
        const [a, b] = k.split('|');
        if (a === id) out.push(b); else if (b === id) out.push(a);
    }
    return out;
}
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

// Something casual between two people of the world (not you).
export function casualPairs(g: Save): { a: string; b: string; since: number }[] {
    const out: { a: string; b: string; since: number }[] = [];
    for (const [k, p] of Object.entries(relOf(g).pairs)) {
        if (p.status !== 'casual') continue;
        const [a, b] = k.split('|');
        if (a !== YOU && b !== YOU && g.cast[a] && g.cast[b]) out.push({ a, b, since: p.since ?? g.day });
    }
    return out;
}

/* ---------- couples that ended ---------- */

export const pastOf = (g: Save, a: string, b: string): Past | undefined => pairOf(g, a, b)?.was;
export function forgetPast(g: Save, a: string, b: string) {
    a = idOf(g, a); b = idOf(g, b);
    const st = relOf(g); const k = pk(a, b);
    if (st.pairs[k]?.was) { delete st.pairs[k].was; tidyPair(st, k); }
}
// Everyone `id` used to be a couple with (`casual`: flings that ended too).
export function exesOf(g: Save, id = YOU, casual = true): string[] {
    id = idOf(g, id);
    const out: string[] = [];
    for (const [k, p] of Object.entries(relOf(g).pairs)) {
        if (!p.was || (!casual && p.was.status === 'casual')) continue;
        const [a, b] = k.split('|');
        if (a === id) out.push(b); else if (b === id) out.push(a);
    }
    return out;
}
// Couples that ended between two people of the world (not you).
export function pastPairs(g: Save): { a: string; b: string; was: Past }[] {
    const out: { a: string; b: string; was: Past }[] = [];
    for (const [k, p] of Object.entries(relOf(g).pairs)) {
        if (!p.was) continue;
        const [a, b] = k.split('|');
        if (a !== YOU && b !== YOU && g.cast[a] && g.cast[b]) out.push({ a, b, was: p.was });
    }
    return out;
}
const PAST_WORDS: Record<Status | 'ex', string> = { casual: 'used to have something casual', dating: 'used to date', engaged: 'were engaged once', married: 'used to be married', ex: 'are exes' };
// For the AI: "used to date", and whether it's recent (a week or less).
export const pastWords = (g: Save, p: Past) => `${PAST_WORDS[p.status ?? 'ex']}${g.day - p.until <= 7 ? ' (it ended recently)' : ''}`;

/* ---------- contact (romance fades without it) ---------- */

// The last day a and b had contact: a scene or a text with you, a plan kept, time together between people.
export function touch(g: Save, a: string, b = YOU) {
    a = idOf(g, a); b = idOf(g, b);
    if (!a || !b || a === b) return;
    const c = (relOf(g).contact ??= {}); const k = pk(a, b);
    if (c[k] !== g.day) c[k] = g.day;
}
export const lastContact = (g: Save, a: string, b = YOU): number | undefined => relOf(g).contact?.[pk(idOf(g, a), idOf(g, b))];
// Forgets contact days of pairs with no romance either way and no status (nothing would fade).
export function tidyContact(g: Save) {
    const st = relOf(g); if (!st.contact) return;
    for (const k of Object.keys(st.contact)) {
        const [a, b] = k.split('|');
        if (!st.m[dk(a, b)]?.r && !st.m[dk(b, a)]?.r && !st.pairs[k]?.status) delete st.contact[k];
    }
    if (!Object.keys(st.contact).length) delete st.contact;
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
    if (st.contact) st.contact = re(st.contact, '|', true);
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
// tone (a's toward b; b's toward a from `back` when they see each other differently), and for couples (by tie type
// or by status) romance and at least good terms. Toward you nothing is seeded
// here (that comes from the game's start or the save); your own hidden feelings (`__you>x`) are. `skip(x, y)` leaves
// a direction alone (the migration: people whose view of others was already stored).
export function seedFromTies(g: Save, ties: { a: string; b: string; type: TieType; tone: TieTone; back?: TieTone }[], skip: (x: string, y: string) => boolean = () => false) {
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
        const tone = t.tone ?? TYPE_START[t.type]?.tone ?? 'neutral', back = t.back ?? tone;
        const f = (x: TieTone) => startFriendship(couple ? coupleTone(x) : x);
        seed(a, b, f(tone), couple ? COUPLE_ROMANCE : undefined); seed(b, a, f(back), couple ? COUPLE_ROMANCE : undefined);
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
