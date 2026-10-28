// Relationships between people (the `relations` system): how the world's people feel about each other changes on its
// own. Time spent at the same place makes people like each other a little more (up to good friends), rivals and
// people who already dislike each other drift further apart, and romance grows between people with chemistry. Couples
// form when both have a crush, their romance follows their chemistry, and they move on or split by how they feel
// (`coupleOdds`, used by sim/longlife.ts). Feelings are directed: A can like B while B can't stand A. People whose
// intimacy needs are met toward each other may start something casual, which becomes dating with friendship or ends
// quietly when romance fades (R-6); open people may have a second partner when every partner is open too (R-9). With
// the system off nothing here runs; romance and couples also need the romance system. Each game draws its own
// chemistry (a seed in the save); the world's hints and starting feelings keep its own pairs' pull, and a large age gap
// keeps pairs it didn't write from drifting together (E25).
import type { Save, Resident } from '../core/store.js';
import { systemOn, getWorld, isScenario, type WorldDef } from '../core/world.js';
import { onHour, onDay } from './hooks.js';
import { residents, whereNow, OUT } from './people.js';
import { fr, ro, gain, lose, idOf, touch, statusOf, setStatus, partnersOf, casualsOf, couplePairs, casualPairs, directedAbove, attracted, PARTNER, YOU, type Status } from './rel.js';
import { cfg } from '../core/store.js';
import { styleOf, needsMetToward } from './intimacy.js';
import { bondOf } from './social.js';
import { friendTier, ROMANCE_TIERS, DISLIKES, HATES, CRUSH, INFATUATED } from './romance.js';
import { familyBlocked } from './family.js';
import { ties, homeKey, normalizeHomes } from './living.js';
import { homeSpot, takenHomes } from './homes.js';
import { note } from './facts.js';
import { lifeMoment } from './happenings.js';
import { rivalsForYou } from './jealousy.js';
import { exampleOf } from './dayplan.js';
import { seasonDays } from './time.js';

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rnd = (g: Save, salt: string) => H(`${g.world}|${g.day}|${salt}`);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The numbers (first guesses, tuned with .private/tests/couples.mjs). Per hour together, while both are awake. */
export const TOGETHER = {
    f: 0.1,         // friendship, each way (paced), up to the pair's cap: 40 + 25 × how well they click (`affinity`);
                    // time alone makes friends, good friends at most, and more takes real moments (the scene verdict)
    drift: 0.1,     // friendship lost each way by rivals and people who dislike each other, down to Hates
    r: 0.2,         // romance, × chemistry (paced), between single people who like each other, up to `rCap` (0.1 before fading: too few couples)
    rCap: 60,
    crowd: 12,      // in a bigger crowd only people who already know each other count
};

/* ---------- chemistry ---------- */

// Each game draws its own chemistry and affinities: a seed kept in the save (the world's people have the same card
// names in every game, so without it every game would pair the same people). A save already under way when seeds came
// keeps the old draws (an empty seed), so its couples don't change under it.
export function saveSeed(g: Save, w?: WorldDef | null): string {
    const x = g as any;
    if (typeof x.seed !== 'string') { const wd = w ?? getWorld(g.world); x.seed = !wd || g.day - wd.time.startDay <= 2 ? Math.random().toString(36).slice(2, 10) : ''; }
    return x.seed;
}
const salted = (seed: string, s: string) => (seed ? `${seed}|${s}` : s);
// How much x can fall for y: fixed for the two people in a game (mostly low), part shared by the pair and part
// one-sided, so a crush can stay one-sided. With the save (`g`): its own draw, at least what the world's hints and
// starting feelings say for the pair, and damped across a large age gap the world didn't write.
export function chemistry(x: string, y: string, g?: Save, w?: WorldDef | null): number {
    if (!g) return drawn(x, y, '');
    const wd = w ?? getWorld(g.world), seed = saveSeed(g, wd);
    let k = chemKept.get(g);
    if (!k || k.seed !== seed || k.w !== wd) chemKept.set(g, k = { seed, w: wd, m: new Map() });
    const key = `${x}>${y}`;
    let c = k.m.get(key);
    if (c === undefined) {
        c = drawn(x, y, seed);
        const hint = wd ? hintOf(g, wd, x, y) : null;
        c = hint !== null ? Math.max(c, hint) : wd ? c * ageDamp(g, wd, x, y) : c;
        k.m.set(key, c);
    }
    return c;
}
const chemKept = new WeakMap<Save, { seed: string; w: WorldDef | null | undefined; m: Map<string, number> }>();
const drawn = (x: string, y: string, seed: string) => { const pair = H(salted(seed, `chem|${[x, y].sort().join('|')}`)), own = H(salted(seed, `chem|${x}>${y}`)); return 0.5 * pair * pair + 0.5 * own * own; };
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const isNamed = (name: string, r: Resident) => { const n = plain(name), full = plain(r.name ?? ''); return n === full || n === full.split(/\s+/)[0]; };
const ROM_FLOOR: Record<string, number> = { interest: 0.45, crush: 0.65, infatuated: 0.85 };
// What the world says about x's pull toward y: a chemistry hint, a starting romance (either side's line about the
// pair), a couple it starts as. Null when it says nothing.
function hintOf(g: Save, w: WorldDef, x: string, y: string): number | null {
    const X = g.cast[x], Y = g.cast[y]; if (!X || !Y) return null;
    const ex = exampleOf(w, X), ey = exampleOf(w, Y);
    let best: number | null = null;
    const up = (v: number | undefined) => { if (v !== undefined) best = Math.max(best ?? 0, v); };
    for (const [n, v] of Object.entries(ex?.chemistry ?? {})) if (isNamed(n, Y)) up(v);
    for (const f of ex?.feelings ?? []) if (isNamed(f.to, Y)) { up(ROM_FLOOR[f.r ?? '']); if (f.status && f.status !== 'casual') up(0.75); }
    for (const f of ey?.feelings ?? []) if (isNamed(f.to, X)) { up(ROM_FLOOR[f.rback ?? '']); if (f.status && f.status !== 'casual') up(0.75); }
    return best;
}
// Across a large age gap (both ages known from the world), chemistry fades: none from ten years apart to twenty.
function ageDamp(g: Save, w: WorldDef, x: string, y: string): number {
    const a = exampleOf(w, g.cast[x])?.age, b = exampleOf(w, g.cast[y])?.age;
    if (!a || !b) return 1;
    const gap = Math.abs(a - b);
    return gap <= 10 ? 1 : gap >= 20 ? 0 : (20 - gap) / 10;
}

// How well x gets on with y as a friend (0..1, fixed for the two people in a game, partly one-sided).
export const affinity = (x: string, y: string, g?: Save) => { const s = g ? saveSeed(g) : ''; return 0.6 * H(salted(s, `aff|${[x, y].sort().join('|')}`)) + 0.4 * H(salted(s, `aff|${x}>${y}`)); };
export const friendCap = (x: string, y: string, g?: Save) => 40 + 25 * affinity(x, y, g);

/* ---------- time together ---------- */

const tieOf = (g: Save, a: string, b: string) => ties(g).find(t => (t.a === a && t.b === b) || (t.a === b && t.b === a));
// Free to start something new (R-9): nobody yet; or one partner when they and every partner they have are open
// (you count as open only with the world's open relationships), two at most.
export function freeToPair(g: Save, a: string): boolean {
    const ps = partnersOf(g, a);
    if (!ps.length) return true;
    if (ps.length >= 2 || styleOf(g, a) !== 'open') return false;
    return ps.every(p => (p === YOU ? !!cfg(g).poly : styleOf(g, p) === 'open'));
}
const romanceOn = (w: WorldDef) => systemOn(w, 'romance');

// x spends an hour with y.
function meet(g: Save, w: WorldDef, x: string, y: string) {
    const f = fr(g, x, y);
    if (f < DISLIKES) { if (f > HATES) lose(g, 'f', x, y, TOGETHER.drift); }
    else if (rivalsForYou(g, w, x, y)) { if (f > DISLIKES) lose(g, 'f', x, y, TOGETHER.drift); }   // both have a crush on you (A-5)
    else if (f < friendCap(x, y, g)) gain(g, 'f', x, y, TOGETHER.f);
    if (ro(g, x, y) > 0 || ro(g, y, x) > 0) touch(g, x, y);   // time together is contact (romance doesn't fade)
    const together = PARTNER.includes(statusOf(g, x, y) as Status);
    if (romanceOn(w) && f >= 10 && ro(g, x, y) < TOGETHER.rCap && !together && freeToPair(g, x) && freeToPair(g, y) && !familyBlocked(g, x, y))
        gain(g, 'r', x, y, TOGETHER.r * chemistry(x, y, g, w));
}
// Each waking hour: the people at the same place (a workplace, a café, a shared home) get to know each other.
export function timeTogether(g: Save, w: WorldDef) {
    const h = Math.floor(g.minutes / 60);
    if (h < 8 || h >= 23) return;
    const at = new Map<string, string[]>();
    for (const r of residents(g)) {
        if (idOf(g, r.avatar) === YOU) continue;   // the person you play: their feelings wait for you to leave
        const loc = whereNow(g, w, r);
        if (loc === OUT && !isScenario(w)) continue;   // away at an off-screen job: on no map, with nobody
        const list = at.get(loc); if (list) list.push(r.avatar); else at.set(loc, [r.avatar]);
    }
    for (const list of at.values()) {
        if (list.length < 2) continue;
        const crowd = list.length > TOGETHER.crowd;
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
            const a = list[i], b = list[j];
            if (crowd && !tieOf(g, a, b) && !statusOf(g, a, b) && Math.abs(fr(g, a, b)) < 10 && Math.abs(fr(g, b, a)) < 10) continue;
            meet(g, w, a, b); meet(g, w, b, a);
        }
    }
}

/* ---------- couples ---------- */

export interface CoupleFeel { status: Status; days: number; rab: number; rba: number; fab: number; fba: number; /** a couple the world wrote, in its first season: it doesn't split */ keep?: boolean }
// A couple's daily chances from both directions: `up` (dating → engaged → married) and `split`. Getting engaged or
// married needs both to love and like each other; splitting grows as the colder side's romance or friendship falls.
// Engaged and married couples split only when feelings collapse (the lower romance under 20, or either one's
// friendship below 0), and more slowly.
export function coupleOdds(c: CoupleFeel): { up: number; split: number } {
    const r = Math.min(c.rab, c.rba), f = Math.min(c.fab, c.fba);
    const apart = Math.max(clamp01((55 - r) / 55), clamp01((35 - f) / 85));
    const warm = (rMin: number, fMin: number) => (r >= rMin && f >= fMin ? clamp01(((r - rMin) / (100 - rMin) + (f - fMin) / (100 - fMin)) / 2) : -1);
    const collapsed = r < 20 || f < 0;
    if (c.keep) return { ...coupleOdds({ ...c, keep: false }), split: 0 };
    if (c.status === 'dating') { const k = warm(55, 35); return { up: c.days >= 14 && k >= 0 ? 0.03 + 0.07 * k : 0, split: 0.002 + 0.15 * apart * apart }; }
    if (c.status === 'engaged') { const k = warm(65, 45); return { up: c.days >= 14 && k >= 0 ? 0.04 + 0.08 * k : 0, split: collapsed ? 0.03 + 0.1 * apart * apart : 0 }; }
    if (c.status === 'married') return { up: 0, split: collapsed ? 0.01 + 0.05 * apart * apart : 0 };
    return { up: 0, split: 0 };
}
export const feelOf = (g: Save, a: string, b: string, status: Status, since: number): CoupleFeel =>
    ({ status, days: g.day - since, rab: ro(g, a, b), rba: ro(g, b, a), fab: fr(g, a, b), fba: fr(g, b, a), keep: firstSeason(g, a, b) });
// A couple the world starts as (Rina and Shizuka) holds through the game's first season, so its story survives the
// first fortnight.
function firstSeason(g: Save, a: string, b: string): boolean {
    const w = getWorld(g.world); if (!w) return false;
    if (g.day - w.time.startDay >= seasonDays(g)) return false;
    const A = g.cast[a], B = g.cast[b]; if (!A || !B) return false;
    const says = (X: Resident, Y: Resident) => (exampleOf(w, X)?.feelings ?? []).some(f => isNamed(f.to, Y) && !!f.status && PARTNER.includes(f.status as Status));
    return says(A, B) || says(B, A);
}

// A couple splits: the one who still cared more is hurt more (and likes the other less); a marriage that ends undoes
// moving in together. The store remembers them as exes (setStatus).
export function splitUp(g: Save, w: WorldDef, a: string, b: string) {
    const married = statusOf(g, a, b) === 'married';
    setStatus(g, a, b, null);
    const [left, leaver] = ro(g, a, b) >= ro(g, b, a) ? [a, b] : [b, a];
    lose(g, 'r', leaver, left, 20); lose(g, 'f', leaver, left, 5);
    lose(g, 'r', left, leaver, 15); lose(g, 'f', left, leaver, 15);
    if (married) moveOut(g, w, a, b);
}
function moveOut(g: Save, w: WorldDef, a: string, b: string) {
    const A: any = g.cast[a], B: any = g.cast[b];
    if (!A || !B || homeKey(A.home) !== homeKey(B.home) || A.homeWith === YOU || B.homeWith === YOU) return;
    const guest = B.homeWith === a ? B : A.homeWith === b ? A : B;
    const zone = w.homes.zones.find(z => z.id === guest.home.zone) ?? w.homes.zones[0];
    if (!zone) return;
    guest.home = { ...homeSpot(w, zone.id, takenHomes(g), g.player.home) };
    delete guest.homeWith;
    normalizeHomes(g);
}

// Each day: a couple's romance moves toward what their chemistry makes it (from 10 with none to 100 with all of it), so
// a couple without much of it cools down over the weeks.
function couplesFeel(g: Save, w: WorldDef) {
    for (const p of couplePairs(g)) for (const [x, y] of [[p.a, p.b], [p.b, p.a]]) {
        if (idOf(g, x) === YOU) continue;
        const d = (10 + 90 * chemistry(x, y, g, w) - ro(g, x, y)) * 0.02;
        if (d > 0) gain(g, 'r', x, y, d); else if (d < 0) lose(g, 'r', x, y, -d);
    }
}
const isPerson = (g: Save, a: string) => a !== YOU && !!g.cast[a];
// Two people free to pair (R-9) with a crush on each other may get together (a small chance each day); never against
// either one's attraction (a crush set by hand, or from before, doesn't pair them). Something casual becomes dating
// the same way, once they're also friends both ways (R-6).
function couplesForm(g: Save, w: WorldDef): string[] {
    const out: string[] = [];
    for (const { x, y } of directedAbove(g, 'r', CRUSH)) {
        if (x > y || !isPerson(g, x) || !isPerson(g, y) || ro(g, y, x) < CRUSH || !attracted(g, x, y) || !attracted(g, y, x)) continue;
        const st = statusOf(g, x, y);
        if (st && st !== 'casual') continue;
        if (st === 'casual' && (fr(g, x, y) < FRIEND_AT || fr(g, y, x) < FRIEND_AT)) continue;
        if (!freeToPair(g, x) || !freeToPair(g, y) || familyBlocked(g, x, y) || rnd(g, salted(saveSeed(g, w), `pair|${x}|${y}`)) >= 0.05) continue;
        setStatus(g, x, y, 'dating');
        const X = g.cast[x], Y = g.cast[y];
        note(g, '{0} and {1} started dating.', [X.name, Y.name], [x, y], X.leisure[0] ?? `home:${x}`, 'life');
        const text = `${X.name} and ${Y.name} started dating.`;
        if (X.met || Y.met) out.push(text);
        for (const a of [x, y]) lifeMoment(g, w, a, text, 'good');
    }
    return out;
}
/* ---------- something casual between people (R-6) ---------- */

const FRIEND_AT = 30, KNOWN_WELL = 55;
const knowWell = (g: Save, a: string, b: string) => g.cast[a]?.met && bondOf(g, a) >= KNOWN_WELL || g.cast[b]?.met && bondOf(g, b) >= KNOWN_WELL;
// Two people whose intimacy needs are met toward each other (neither keeping it for a partner) may start something
// casual: a small chance each day, never against attraction, family or minors; free to pair (R-9), and one casual
// relationship at a time.
function casualForm(g: Save, w: WorldDef): string[] {
    const out: string[] = [];
    for (const { x, y } of directedAbove(g, 'r', ROMANCE_TIERS[1].lo)) {
        if (x > y || !isPerson(g, x) || !isPerson(g, y) || statusOf(g, x, y) || !attracted(g, x, y) || !attracted(g, y, x)) continue;
        if (!needsMetToward(g, x, y) || !needsMetToward(g, y, x) || familyBlocked(g, x, y)) continue;
        if (!freeToPair(g, x) || !freeToPair(g, y) || casualsOf(g, x).length || casualsOf(g, y).length || rnd(g, salted(saveSeed(g, w), `casual|${x}|${y}`)) >= 0.05) continue;
        setStatus(g, x, y, 'casual');
        const X = g.cast[x], Y = g.cast[y];
        note(g, '{0} and {1} started something casual.', [X.name, Y.name], [x, y], `home:${x}`, 'love');
        if (knowWell(g, x, y)) out.push(`${X.name} and ${Y.name} have started something casual.`);
    }
    return out;
}
// It ends quietly when either one's romance fades below Interest: no break-up loss, news only if you know them well.
function casualEnd(g: Save): string[] {
    const out: string[] = [];
    for (const { a, b } of casualPairs(g)) {
        if (ro(g, a, b) >= ROMANCE_TIERS[1].lo && ro(g, b, a) >= ROMANCE_TIERS[1].lo) continue;
        setStatus(g, a, b, null);
        const A = g.cast[a], B = g.cast[b];
        note(g, '{0} and {1} stopped seeing each other.', [A.name, B.name], [a, b], `home:${a}`, 'love');
        if (knowWell(g, a, b)) out.push(`${A.name} and ${B.name} aren't seeing each other anymore.`);
    }
    return out;
}

// A crush that isn't returned reaches you as news once, when you know either of them.
const told = (g: Save): string[] => (((g as any).living ??= {}).crushes ??= []);
function crushNews(g: Save): string[] {
    const out: string[] = [];
    for (const { x, y } of directedAbove(g, 'r', CRUSH)) {
        const k = `${x}>${y}`;
        if (!isPerson(g, x) || !isPerson(g, y) || !attracted(g, x, y) || ro(g, y, x) >= ROMANCE_TIERS[1].lo || PARTNER.includes(statusOf(g, x, y) as Status) || told(g).includes(k)) continue;
        told(g).push(k);
        const X = g.cast[x], Y = g.cast[y];
        note(g, '{0} has a crush on {1}.', [X.name, Y.name], [x], `home:${x}`, 'love');
        if (X.met || Y.met) out.push(`${X.name} has a crush on ${Y.name}, who doesn't seem to feel the same way.`);
    }
    return out;
}

onHour.push((g, w) => { if (systemOn(w, 'relations')) timeTogether(g, w); return []; });
onDay.push((g, w) => {
    if (!systemOn(w, 'relations') || !romanceOn(w)) return [];
    couplesFeel(g, w);
    return [...couplesForm(g, w), ...casualForm(g, w), ...casualEnd(g), ...crushNews(g)];
});

/* ---------- for the AI ---------- */

// How x feels about y in a sentence (directed), and two people who feel the same (said once).
const ONE_WAY: Record<string, string> = { hates: 'hates', dislikes: "can't stand", wary: 'is wary of', stranger: 'barely knows', acquaintance: 'knows', friend: 'likes', good: 'is fond of', best: 'is very close to' };
const BOTH: Record<string, string> = { hates: 'hate each other', dislikes: "can't stand each other", wary: 'are wary of each other', stranger: 'barely know each other', acquaintance: 'are acquaintances', friend: 'are friends', good: 'are good friends', best: 'are best friends' };
const romTier = (v: number) => (v >= INFATUATED ? 'infatuated' : v >= CRUSH ? 'crush' : v >= ROMANCE_TIERS[1].lo ? 'interest' : '');
const LOVE: Record<string, [string, string]> = { infatuated: ['is infatuated with', 'are infatuated with each other'], crush: ['has a crush on', 'have a crush on each other'], interest: ['is attracted to', 'are attracted to each other'] };

// For the people in this scene: how each pair feels about each other (both directions when they differ by a tier),
// crushes (and whether they're returned), and a partner who has fallen out of love. Also with "Relationships between
// people" off: feelings then stay where they started, but they are still how these people get along.
export function feelingsLine(g: Save, w: WorldDef, present: Resident[]): string {
    const out: string[] = [];
    const people = present.filter(r => idOf(g, r.avatar) !== YOU);
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
        const A = people[i], B = people[j], a = A.avatar, b = B.avatar;
        const ta = friendTier(fr(g, a, b)).id, tb = friendTier(fr(g, b, a)).id;
        const love = romanceOn(w) && !familyBlocked(g, a, b);
        const ra = love ? romTier(ro(g, a, b)) : '', rb = love ? romTier(ro(g, b, a)) : '';
        const couple = PARTNER.includes(statusOf(g, a, b) as Status);
        if (ta === 'stranger' && tb === 'stranger' && !ra && !rb && !couple) continue;
        out.push(ta === tb ? `${A.name} and ${B.name} ${BOTH[ta]}` : `${A.name} ${ONE_WAY[ta]} ${B.name}; ${B.name} ${ONE_WAY[tb]} ${A.name}`);
        if (couple) {
            if (love && ro(g, a, b) < ROMANCE_TIERS[1].lo) out.push(`${A.name} has fallen out of love with ${B.name}`);
            if (love && ro(g, b, a) < ROMANCE_TIERS[1].lo) out.push(`${B.name} has fallen out of love with ${A.name}`);
        } else if (ra && ra === rb) out.push(`${A.name} and ${B.name} ${LOVE[ra][1]}`);
        else {
            if (ra) out.push(`${A.name} ${LOVE[ra][0]} ${B.name}${rb ? '' : ' (not returned)'}`);
            if (rb) out.push(`${B.name} ${LOVE[rb][0]} ${A.name}${ra ? '' : ' (not returned)'}`);
        }
    }
    return out.length ? `How they feel about each other: ${out.join('; ')}.` : '';
}
