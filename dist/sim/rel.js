// One store for relationships (save key `rel`). Friendship (−100..100) and romance (0..100) are kept per direction
// ("x>y": how x feels about y), the status of a couple (dating, engaged, married) and its cooldowns per unordered pair
// ("a|b"), for the player and between characters alike. `'__you'` is whoever you play, as in ties and households:
// "Play as" rewrites the ids (`swapIds`), so everyone's feelings stay with the person. The store is sparse: a
// missing entry is the default (0, no status), and a write that lands on the default removes it.
// Only this file touches `rel.m`, `rel.fat` and `rel.pairs`; the older names (bondOf, addBond, romOf…) read through it.
import { nowAbs, cfg } from '../core/store.js';
import { getWorld, isScenario } from '../core/world.js';
import { difficultyOf } from './bills.js';
import { CURVES, HALF_LIFE, PACE, faded, paced, rateAt } from './pace.js';
export const YOU = '__you';
export function relOf(g) {
    const r = (g.rel ??= {});
    r.m ??= {};
    r.fat ??= {};
    r.pairs ??= {};
    r.people ??= {};
    return r;
}
// The person you play is `'__you'` in the store, whichever id a caller uses (the same rule as `selfAvatar` in
// playas.ts, repeated here so the store doesn't depend on "Play as").
const self = (g) => { const s = g.swap; return s ? String(s.avatar || s.origCard || '') : ''; };
export const idOf = (g, a) => (a && a === self(g) ? YOU : a);
const dk = (x, y) => `${x}>${y}`;
const pk = (a, b) => [a, b].sort().join('|');
const LO = { f: -100, r: 0 };
const clean = (v) => Math.round(v * 10000) / 10000; // decimals, without float dust in the save
/* ---------- meters ---------- */
export const meter = (g, m, x, y) => relOf(g).m[dk(idOf(g, x), idOf(g, y))]?.[m] ?? 0;
export const hasMeter = (g, m, x, y) => relOf(g).m[dk(idOf(g, x), idOf(g, y))]?.[m] !== undefined;
export const fr = (g, x, y) => meter(g, 'f', x, y);
export const ro = (g, x, y) => meter(g, 'r', x, y);
// The start of today's values toward you, kept at the first change of the day.
function markDay(g, st) {
    if (st.day?.day === g.day)
        return;
    const snap = {};
    for (const [k, e] of Object.entries(st.m))
        if (k.endsWith(`>${YOU}`))
            snap[k.slice(0, -YOU.length - 1)] = [e.f ?? 0, e.r ?? 0];
    st.day = { day: g.day, snap, why: {} };
}
// An explicit value: starting values, editors, the migration.
export function setMeter(g, m, x, y, v) {
    x = idOf(g, x);
    y = idOf(g, y);
    if (!x || !y || x === y || !Number.isFinite(v))
        return;
    const st = relOf(g);
    const k = dk(x, y);
    if (y === YOU)
        markDay(g, st);
    const val = clean(Math.max(LO[m], Math.min(100, v)));
    const e = (st.m[k] ??= {});
    if (val === 0)
        delete e[m];
    else
        e[m] = val;
    if (e.f === undefined && e.r === undefined)
        delete st.m[k];
}
export const setFr = (g, x, y, v) => setMeter(g, 'f', x, y, v);
export const setRo = (g, x, y, v) => setMeter(g, 'r', x, y, v);
// Every direction whose meter is at least `min` (a daily look over the store: crushes, couples forming).
export function directedAbove(g, m, min) {
    const out = [];
    for (const [k, e] of Object.entries(relOf(g).m)) {
        const v = e[m];
        if (v !== undefined && v >= min) {
            const [x, y] = k.split('>');
            out.push({ x, y, v });
        }
    }
    return out;
}
/* ---------- pacing (sim/pace.ts) ---------- */
export const relCfg = (g) => (cfg(g).rel ?? {});
const halfLife = (g) => relCfg(g).halfLife ?? HALF_LIFE;
// Home: the difficulty is how fast relationships grow (gains only; losses stay as they are)
const homeMult = (g) => (isScenario(getWorld(g.world)) ? difficultyOf(g).bond : 1);
export const paceOf = (g, x, m) => relOf(g).people[idOf(g, x)]?.pace?.[m];
// x's curve for a meter: the save's settings, x's own pace, and (the easy points only) the Home difficulty.
export function curveOf(g, x, m) {
    const set = relCfg(g).pace?.[m] ?? {};
    const k = PACE[paceOf(g, x, m) ?? 'normal'] ?? 1;
    return { E: (set.E ?? CURVES[m].E) * k * homeMult(g), H: (set.H ?? CURVES[m].H) * k };
}
// x's fatigue toward y for a meter, faded to now.
export function fatigue(g, m, x, y) {
    const f = relOf(g).fat[dk(idOf(g, x), idOf(g, y))];
    return f ? faded(f[m] ?? 0, nowAbs(g) - f.at, halfLife(g)) : 0;
}
// The rate of x's next paced point toward y (1 = full), for the debug view.
export const rateOf = (g, m, x, y) => rateAt(fatigue(g, m, x, y), curveOf(g, x, m));
// Moves fatigue by `delta` (both meters faded to now first); tiny leftovers are dropped.
function addFatigue(g, m, x, y, delta) {
    const st = relOf(g);
    const k = dk(x, y);
    const now = nowAbs(g);
    const f = st.fat[k];
    const next = { at: now };
    for (const mm of ['f', 'r']) {
        const v = clean(faded(f?.[mm] ?? 0, now - (f?.at ?? now), halfLife(g)) + (mm === m ? delta : 0));
        if (v >= 0.05)
            next[mm] = v;
    }
    if (next.f === undefined && next.r === undefined)
        delete st.fat[k];
    else
        st.fat[k] = next;
}
const NONE = { d: 0, fat: 0 };
// A gain. Paced gains (talk, reactions, texts, the verdict…) slow down with what was gained recently; milestones (an
// accepted ask, a kept date, a story event) apply in full and add no fatigue. The person you play gains nothing:
// their feelings wait for you to leave.
export function gain(g, m, x, y, raw, isPaced = true) {
    x = idOf(g, x);
    y = idOf(g, y);
    if (!x || !y || x === YOU || x === y || !(raw > 0))
        return NONE;
    raw *= homeMult(g);
    const before = meter(g, m, x, y);
    const add = isPaced ? paced(raw, fatigue(g, m, x, y), curveOf(g, x, m)) : raw;
    setMeter(g, m, x, y, before + add);
    const d = clean(meter(g, m, x, y) - before);
    const fat = isPaced ? clean(add) : 0;
    if (fat)
        addFatigue(g, m, x, y, fat);
    return { d, fat };
}
/** What each everyday source is worth (raw points, before pacing). Other sources pass their own amounts. */
export const SOURCES = {
    talk: 0.5, // each line you say, to each resident present who has spoken in the scene
    verdict: 2, // each step of a scene verdict (−3..+3), friendship and romance (sim/verdict.ts)
};
// A loss: in full, never paced. Returns how much it went down.
export function lose(g, m, x, y, n) {
    const before = meter(g, m, x, y);
    setMeter(g, m, x, y, before - Math.abs(n));
    return clean(before - meter(g, m, x, y));
}
// Takes back what a gain applied (sim/msglog.ts): the meter, and the pacing weight it added (unless `meterOnly`:
// a correction made after the scene, when that weight has already faded).
export function undoGain(g, m, x, y, a, meterOnly = false) {
    x = idOf(g, x);
    y = idOf(g, y);
    if (a.d)
        setMeter(g, m, x, y, meter(g, m, x, y) - a.d);
    if (a.fat && !meterOnly)
        addFatigue(g, m, x, y, -Math.min(a.fat, fatigue(g, m, x, y)));
}
/* ---------- pairs ---------- */
export const PARTNER = ['dating', 'engaged', 'married'];
export const pairOf = (g, a, b) => relOf(g).pairs[pk(idOf(g, a), idOf(g, b))];
export const statusOf = (g, a, b) => pairOf(g, a, b)?.status ?? null;
function tidyPair(st, k) { const p = st.pairs[k]; if (p && !p.status && !p.cooldown)
    delete st.pairs[k]; }
// Sets (or ends, with null) the status of a pair; a new status starts counting from today.
export function setStatus(g, a, b, status, since = g.day) {
    a = idOf(g, a);
    b = idOf(g, b);
    if (!a || !b || a === b)
        return;
    const st = relOf(g);
    const k = pk(a, b);
    const p = (st.pairs[k] ??= {});
    if (status) {
        if (p.status !== status)
            p.since = since;
        p.status = status;
    }
    else {
        delete p.status;
        delete p.since;
        delete p.low;
    }
    tidyPair(st, k);
}
// Days in a row a partner has felt too little (a partner leaving you counts them; 0 clears it).
export function setLow(g, a, b, n) {
    a = idOf(g, a);
    b = idOf(g, b);
    const p = relOf(g).pairs[pk(a, b)];
    if (!p)
        return;
    if (n > 0)
        p.low = n;
    else
        delete p.low;
}
export function setCooldown(g, a, b, until) {
    a = idOf(g, a);
    b = idOf(g, b);
    if (!a || !b || a === b)
        return;
    const st = relOf(g);
    const k = pk(a, b);
    const p = (st.pairs[k] ??= {});
    if (until > 0)
        p.cooldown = until;
    else
        delete p.cooldown;
    tidyPair(st, k);
}
// Everyone `id` is with (dating, engaged or married).
export function partnersOf(g, id = YOU) {
    id = idOf(g, id);
    const out = [];
    for (const [k, p] of Object.entries(relOf(g).pairs)) {
        if (!p.status || !PARTNER.includes(p.status))
            continue;
        const [a, b] = k.split('|');
        if (a === id)
            out.push(b);
        else if (b === id)
            out.push(a);
    }
    return out;
}
export const isPartner = (g, a, b = YOU) => PARTNER.includes(statusOf(g, a, b));
// Everyone `id` has something casual with (not partners: no key, no moving in, no baby).
export function casualsOf(g, id = YOU) {
    id = idOf(g, id);
    const out = [];
    for (const [k, p] of Object.entries(relOf(g).pairs)) {
        if (p.status !== 'casual')
            continue;
        const [a, b] = k.split('|');
        if (a === id)
            out.push(b);
        else if (b === id)
            out.push(a);
    }
    return out;
}
// Couples between two people of the world (not you).
export function couplePairs(g) {
    const out = [];
    for (const [k, p] of Object.entries(relOf(g).pairs)) {
        if (!p.status || !PARTNER.includes(p.status))
            continue;
        const [a, b] = k.split('|');
        if (a !== YOU && b !== YOU && g.cast[a] && g.cast[b])
            out.push({ a, b, status: p.status, since: p.since ?? g.day });
    }
    return out;
}
/* ---------- contact (romance fades without it) ---------- */
// The last day a and b had contact: a scene or a text with you, a plan kept, time together between people.
export function touch(g, a, b = YOU) {
    a = idOf(g, a);
    b = idOf(g, b);
    if (!a || !b || a === b)
        return;
    const c = (relOf(g).contact ??= {});
    const k = pk(a, b);
    if (c[k] !== g.day)
        c[k] = g.day;
}
export const lastContact = (g, a, b = YOU) => relOf(g).contact?.[pk(idOf(g, a), idOf(g, b))];
// Forgets contact days of pairs with no romance either way and no status (nothing would fade).
export function tidyContact(g) {
    const st = relOf(g);
    if (!st.contact)
        return;
    for (const k of Object.keys(st.contact)) {
        const [a, b] = k.split('|');
        if (!st.m[dk(a, b)]?.r && !st.m[dk(b, a)]?.r && !st.pairs[k]?.status)
            delete st.contact[k];
    }
    if (!Object.keys(st.contact).length)
        delete st.contact;
}
/* ---------- "Play as": the store follows the people ---------- */
// Rewrites every id in the store (the same mapping "Play as" applies to ties and households).
export function swapIds(g, map) {
    const st = relOf(g);
    const re = (o, sep, sort) => {
        const out = {};
        for (const [k, v] of Object.entries(o)) {
            const ids = k.split(sep).map(map);
            out[(sort ? ids.sort() : ids).join(sep)] = v;
        }
        return out;
    };
    st.m = re(st.m, '>', false);
    st.fat = re(st.fat, '>', false);
    st.pairs = re(st.pairs, '|', true);
    if (st.contact)
        st.contact = re(st.contact, '|', true);
    st.people = Object.fromEntries(Object.entries(st.people).map(([k, v]) => [map(k), v]));
}
/* ---------- where relationships start (one table) ---------- */
// The tone of a tie gives the starting friendship; its type gives the starting approval, the tone when none is
// chosen, and romance for couples. Used wherever a relationship starts: a new game, the migration, "Play as".
export const TONE_FRIENDSHIP = { close: 75, good: 55, neutral: 30, tense: 0, hostile: -50 };
export const COUPLE_ROMANCE = 70;
export const TYPE_START = {
    bestfriend: { approval: 30, tone: 'close' }, friend: { approval: 15, tone: 'good' }, ally: { approval: 20, tone: 'good' },
    colleague: { approval: 5, tone: 'neutral' }, dating: { approval: 25, tone: 'good', couple: true }, partner: { approval: 25, tone: 'close', couple: true },
    spouse: { approval: 30, tone: 'close', couple: true }, parent: { approval: 20, tone: 'close' }, child: { approval: 20, tone: 'close' },
    sibling: { approval: 15, tone: 'good' }, cousin: { approval: 10, tone: 'neutral' }, roommate: { approval: 5, tone: 'neutral' },
    rival: { approval: -20, tone: 'tense' }, enemy: { approval: -50, tone: 'hostile' }, ex: { approval: -10, tone: 'tense' },
    mentor: { approval: 25, tone: 'good' }, apprentice: { approval: 25, tone: 'good' },
};
const TONES = ['hostile', 'tense', 'neutral', 'good', 'close'];
// A couple starts at least on good terms.
export const coupleTone = (t) => (TONES.indexOf(t) < TONES.indexOf('good') ? 'good' : t);
export const startFriendship = (tone, type) => TONE_FRIENDSHIP[tone ?? (type ? TYPE_START[type]?.tone : undefined) ?? 'neutral'] ?? 30;
// Starting values from ties, for every direction that has none yet (a new game, the migration): friendship from the
// tone (a's toward b; b's toward a from `back` when they see each other differently), and for couples (by tie type
// or by status) romance and at least good terms. Toward you nothing is seeded
// here (that comes from the game's start or the save); your own hidden feelings (`__you>x`) are. `skip(x, y)` leaves
// a direction alone (the migration: people whose view of others was already stored).
export function seedFromTies(g, ties, skip = () => false) {
    const st = relOf(g);
    const seed = (x, y, f, r) => {
        if (x === y || y === YOU || skip(x, y))
            return;
        const e = st.m[dk(x, y)];
        if (e?.f === undefined)
            setMeter(g, 'f', x, y, f);
        if (r !== undefined && e?.r === undefined)
            setMeter(g, 'r', x, y, r);
    };
    for (const t of ties) {
        const a = idOf(g, t.a), b = idOf(g, t.b);
        const couple = !!TYPE_START[t.type]?.couple || PARTNER.includes(statusOf(g, a, b));
        const tone = t.tone ?? TYPE_START[t.type]?.tone ?? 'neutral', back = t.back ?? tone;
        const f = (x) => startFriendship(couple ? coupleTone(x) : x);
        seed(a, b, f(tone), couple ? COUPLE_ROMANCE : undefined);
        seed(b, a, f(back), couple ? COUPLE_ROMANCE : undefined);
    }
    // couples without a tie between them
    for (const [k, p] of Object.entries(st.pairs)) {
        if (!p.status || !PARTNER.includes(p.status))
            continue;
        const [a, b] = k.split('|');
        seed(a, b, TONE_FRIENDSHIP.good, COUPLE_ROMANCE);
        seed(b, a, TONE_FRIENDSHIP.good, COUPLE_ROMANCE);
    }
}
// "How each sees you" in cast presets (approval words) as a tone.
export const toneOfApproval = (v) => (v >= 50 ? 'close' : v >= 15 ? 'good' : v > -15 ? 'neutral' : v > -50 ? 'tense' : 'hostile');
