// Intimate profiles for everyone (Tokyo's adult progression, X20 and X21). The world's own people carry a profile in
// the world file; people made in the game (a new resident, a guest) and people from the player's own cards usually
// have none, so with adult content on they draw one from the world's plain pool (`WorldDef.intimatePool`): a few likes,
// a few limits, a role and a drive. It is drawn from a seed made of the world and the person, so the same person gets
// the same profile in every game and in every run, and only fills what a card or the player hasn't already said.
// Also the repair that gives world characters of games started earlier the `role` and `drive` their world holds.
import { adultOn, type Save } from '../core/store.js';
import { systemOn, exampleTag, INTIMATE_ROLES, INTIMATE_DRIVES, type WorldDef, type ExampleCharacter, type IntimateRole, type IntimateDrive } from '../core/world.js';
import { relOf, idOf, YOU } from './rel.js';
import { isMinor } from './family.js';
import { charOf } from '../st/bridge.js';

/** How the world's own cast is spread (Tokyo's 30: 11 lead, 10 follow, 9 switch; 8 low, 10 average, 12 high). */
export const ROLE_WEIGHTS: Record<IntimateRole, number> = { lead: 11, follow: 10, switch: 9 };
export const DRIVE_WEIGHTS: Record<IntimateDrive, number> = { low: 8, average: 10, high: 12 };
export const LIKES_RANGE = [3, 5] as const, LIMITS_RANGE = [1, 3] as const;

export interface Pool { prefs: string[]; limits: string[] }
/** The world's pool, cleaned; null when it has nothing (a world without a pool gives generated people nothing). */
export function poolOf(w: WorldDef | null | undefined): Pool | null {
    const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean))] : []);
    const prefs = list(w?.intimatePool?.prefs), limits = list(w?.intimatePool?.limits);
    return prefs.length || limits.length ? { prefs, limits } : null;
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// a small seeded generator (mulberry32)
function rng(seed: number) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function weighted<T extends string>(weights: Record<T, number>, r: number): T {
    const keys = Object.keys(weights) as T[], total = keys.reduce((n, k) => n + weights[k], 0);
    let x = r * total;
    for (const k of keys) { x -= weights[k]; if (x < 0) return k; }
    return keys[keys.length - 1];
}
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x => x.length > 3);
// a like and a limit must never name the same thing ("being tied up" and "tied up")
const clash = (a: string, b: string) => { const wb = new Set(words(b)); return a.toLowerCase() === b.toLowerCase() || words(a).some(x => wb.has(x)); };

export interface Drawn { role: IntimateRole; drive: IntimateDrive; prefs: string[]; limits: string[] }
/** What the pool gives one person: the same every time for the same world and person. `avoid`: words they already like
 *  (a card's own likes), which a limit never repeats. */
export function drawProfile(w: WorldDef, avatar: string, pool: Pool, avoid: string[] = []): Drawn {
    const r = rng(hash(`${w.id}|${avatar}|profile`));
    const role = weighted(ROLE_WEIGHTS, r()), drive = weighted(DRIVE_WEIGHTS, r());
    const shuffled = (xs: string[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const nLikes = LIKES_RANGE[0] + Math.floor(r() * (LIKES_RANGE[1] - LIKES_RANGE[0] + 1));
    const nLimits = LIMITS_RANGE[0] + Math.floor(r() * (LIMITS_RANGE[1] - LIMITS_RANGE[0] + 1));
    const prefs = shuffled(pool.prefs).slice(0, nLikes);
    const taken = [...prefs, ...avoid];
    const limits: string[] = [];
    for (const l of shuffled(pool.limits)) { if (limits.length >= nLimits) break; if (!taken.some(t => clash(l, t))) limits.push(l); }
    return { role, drive, prefs, limits };
}

/** The world's own person a card is (by the tag the card carries), if any. */
export function exampleOf(w: WorldDef, avatar: string): ExampleCharacter | undefined {
    const tag = charOf(avatar)?.data?.extensions?.mundi?.example;
    return tag ? w.cast.examples.find(e => exampleTag(w, e) === tag) : undefined;
}

// Who draws a profile: with adult content and romance on, someone who isn't you, isn't a minor, has a card here (the
// world's own people keep what their world says) and isn't one of the world's own.
function eligible(g: Save, w: WorldDef, avatar: string): boolean {
    if (!adultOn(g) || !systemOn(w, 'romance')) return false;
    if (avatar === YOU || idOf(g, avatar) === YOU || !charOf(avatar) || exampleOf(w, avatar)) return false;
    return !isMinor(g, avatar);
}

/** Gives one person what their profile lacks (likes, limits, role, drive) from the world's pool, never over what is
 *  there. True when something was added. */
export function ensureProfile(g: Save, w: WorldDef, avatar: string): boolean {
    const pool = poolOf(w);
    if (!pool || !eligible(g, w, avatar)) return false;
    const people = relOf(g).people, id = idOf(g, avatar);
    const have = people[id]?.intimate;
    const d = drawProfile(w, avatar, pool, have?.prefs ?? []);
    const add: Record<string, unknown> = {};
    if (!have?.prefs?.length && d.prefs.length) add.prefs = d.prefs;
    if (!have?.limits?.length && d.limits.length) add.limits = d.limits;
    if (!have?.role) add.role = d.role;
    if (!have?.drive) add.drive = d.drive;
    if (!Object.keys(add).length) return false;
    ((people[id] ??= {}).intimate ??= {});
    Object.assign(people[id].intimate!, add);
    return true;
}
/** Everyone in the game (the player's own cards and the people made in it). True when anyone changed. */
export function ensureProfiles(g: Save, w: WorldDef): boolean {
    let did = false;
    for (const a of Object.keys(g.cast)) if (ensureProfile(g, w, a)) did = true;
    return did;
}

/** (X21) World characters of a game started before the world gave them a role and a drive: filled from the loaded
 *  world's example cast, never over a value already in the save. True when anyone changed. */
export function fillWorldRoles(g: Save, w: WorldDef): boolean {
    let did = false;
    for (const a of Object.keys(g.cast)) {
        const ex = exampleOf(w, a)?.intimate; if (!ex) continue;
        const people = relOf(g).people, id = idOf(g, a);
        const role = INTIMATE_ROLES.includes(ex.role as IntimateRole) ? ex.role : undefined;
        const drive = INTIMATE_DRIVES.includes(ex.drive as IntimateDrive) ? ex.drive : undefined;
        const have = people[id]?.intimate;
        if (role && !have?.role) { ((people[id] ??= {}).intimate ??= {}).role = role; did = true; }
        if (drive && !have?.drive) { ((people[id] ??= {}).intimate ??= {}).drive = drive; did = true; }
    }
    return did;
}

/** What opening a save does for profiles (`repair` in core/saves.ts): the world's own people first, then the pool for
 *  everyone else (only with adult content on). Safe to run on every load. */
export function repairProfiles(g: Save, w: WorldDef): boolean {
    const a = fillWorldRoles(g, w), b = ensureProfiles(g, w);
    return a || b;
}
