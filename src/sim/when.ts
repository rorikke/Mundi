// Conditions: one evaluator for every `when` in a world: conditional lore and world rumors now, and the actions,
// street stories, work events and rituals that come with Tokyo. A condition is text in one grammar (core/world.ts,
// `When`): `period: evening or night; weekday: fri; feels: Kyōko friend`, parsed once and kept. Worlds from before
// give an object (`LoreWhen`), read exactly as the old lore code read it (a period by its name, in the same order).
// Keys whose data the engine doesn't keep yet hold false until their system writes it: `stayed` (E6 writes
// `player.stayed`), `holds` (E14 writes `player.keepsakes`). The story so far is read straight from the save, so this
// file needs neither module: `knows` and `thread` (sim/threads.ts keeps `g.threads`), `seen` and `favor`
// (sim/stories.ts keeps `g.stories`); `perf` reads the player's job (sim/work.ts keeps `player.job.perf`).
import { nowAbs, type Save, type Resident } from '../core/store.js';
import { systemOn, WEEKDAY_IDS, type WorldDef, type When, type LoreWhen } from '../core/world.js';
import { FRIEND_LEVELS, ROM_LEVELS } from '../core/feel.js';
import { period, isWeekend, seasonDays, SEASONS } from './time.js';
import { weatherIs, regionOf, regionState } from './worldstate.js';
import { festivalsOn } from './festivals.js';
import { eventsOn, liveEvents } from './cityevents.js';
import { presentAt, routineAt, workingAt } from './people.js';
import { visitsTo } from './daylife.js';
import { levelOf } from './hobbies.js';
import { fr, ro, statusOf, YOU } from './rel.js';
import { FRIEND_TIERS, ROMANCE_TIERS } from './romance.js';
import { companions } from './social.js';

export const WHEN_KEYS = ['period', 'weekday', 'weekend', 'season', 'seasonDays', 'weather', 'festival', 'event', 'place', 'zone', 'region',
    'daily', 'regular', 'skill', 'feels', 'onShift', 'present', 'after', 'job', 'start', 'chance', 'clock', 'stayed', 'holds', 'companion',
    'knows', 'seen', 'thread', 'favor', 'perf'] as const;
export type WhenKey = typeof WHEN_KEYS[number];
// Keys only the old object form has (the region's mood and tension, a range of absolute days).
type OldKey = 'tensionAbove' | 'moodAbove' | 'moodBelow' | 'fromDay' | 'toDay';
/** One condition: its key, whether `not` excludes its values, and the values (any one of them holds). */
export interface Cond { key: WhenKey | OldKey; not: boolean; values: string[] }
/** A parsed condition. `old`: from the old object form (a period matches by name). `error`: why the text can't be read
 *  (such a condition never holds). */
export interface ParsedWhen { conds: Cond[]; old?: boolean; error?: string }

/** The levels `feels` and `companion` take: friendship tiers, romance tiers, and couple statuses (each at that level or
 *  closer; a level below Stranger means that bad or worse). */
export const STATUS_LEVELS = ['casual', 'dating', 'engaged', 'married'];
export const LEVELS: string[] = [...FRIEND_LEVELS, ...ROM_LEVELS, ...STATUS_LEVELS];   // (core/feel.ts: loaded before any sim file)
const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const ID = /^[^\s,;]+$/;
const DAYS = /^(\d+)(?:\s*[-–]\s*(\d+))?$/;
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?$/;
const YES = ['yes', 'true'], NO = ['no', 'false'];

/* ---------- reading the text ---------- */

const keyOf = (k: string) => WHEN_KEYS.find(x => x.toLowerCase() === k.toLowerCase());
const weekdayOf = (v: string) => { const s = v.toLowerCase(); const i = WEEKDAY_NAMES.findIndex(n => n === s || n.slice(0, 3) === s); return i < 0 ? null : WEEKDAY_IDS[i]; };
const splitLevel = (v: string): [string, string | null] => { const m = v.match(/^(.*\S)\s+(\S+)$/); return m && LEVELS.includes(m[2].toLowerCase()) ? [m[1], m[2].toLowerCase()] : [v, null]; };
const chanceOf = (v: string) => (v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v));
// What's wrong with a value for its key ('' when it's fine).
function badValue(key: WhenKey, v: string): string {
    switch (key) {
        case 'weekday': return weekdayOf(v) ? '' : `"${v}" is not a weekday (mon … sun)`;
        case 'weekend': case 'daily': return [...YES, ...NO].includes(v.toLowerCase()) ? '' : `"${v}" should be yes or no`;
        case 'season': return SEASONS.some(s => s.id === v.toLowerCase()) ? '' : `"${v}" is not a season`;
        case 'seasonDays': return DAYS.test(v) ? '' : `"${v}" should be days like 3-6`;
        case 'regular': return /^\d+$/.test(v) && Number(v) >= 1 ? '' : `"${v}" should be a number of visits`;
        case 'perf': return /^\d+$/.test(v) && Number(v) <= 100 ? '' : `"${v}" should be a performance from 0 to 100`;
        case 'skill': return /^\S+\s+\d+$/.test(v) ? '' : `"${v}" should be a skill and a level, like cooking 3`;
        case 'chance': { const p = chanceOf(v); return Number.isFinite(p) && p >= 0 && p <= 1 ? '' : `"${v}" should be between 0 and 1`; }
        case 'clock': return CLOCK.test(v) ? '' : `"${v}" should be hours like 19:00-20:00`;
        case 'companion': return v.toLowerCase() === 'yes' || LEVELS.includes(v.toLowerCase()) ? '' : `"${v}" is not a level (friend, crush, dating…)`;
        case 'feels': return splitLevel(v)[0] ? '' : 'a name is missing';
        case 'festival': case 'event': case 'place': case 'zone': case 'region': case 'after': case 'job': case 'start': case 'stayed': case 'holds': case 'knows':
            return ID.test(v) ? '' : `"${v}" should be one id`;
        case 'seen': return /^[^\s,;:]+(:\d+)?$/.test(v) ? '' : `"${v}" should be a story id, or a story id and a choice like sb_startup_st_pitch:2`;
        case 'thread': return /^[^\s,;]+(\s+[^\s,;]+)?$/.test(v) ? '' : `"${v}" should be a thread id, or a thread id and how it ended`;
        default: return '';   // period (a name may have spaces in older worlds), weather, present, onShift
    }
}
const tidy = (key: WhenKey, v: string) => (key === 'weekday' ? weekdayOf(v)! : ['weekend', 'daily'].includes(key) ? (YES.includes(v.toLowerCase()) ? 'yes' : 'no') : key === 'season' || key === 'companion' ? v.toLowerCase() : v);

function parseText(text: string): ParsedWhen {
    // backticks from design tables; an outcome's own condition may be written `when: present: Kaito`
    const s = text.replace(/`/g, '').trim().replace(/^when\s*:\s*/i, '');
    const conds: Cond[] = [];
    for (const part of s.split(';')) {
        const p = part.trim(); if (!p) continue;
        const i = p.indexOf(':');
        if (i < 0) return { conds, error: `"${p}" has no key (write key: value)` };
        const key = keyOf(p.slice(0, i).trim());
        if (!key) return { conds, error: `unknown key "${p.slice(0, i).trim()}"` };
        let rest = p.slice(i + 1).trim();
        const not = /^not\s+/i.test(rest);
        if (not) rest = rest.replace(/^not\s+/i, '');
        // `or` between alternatives (`|` and `\|` in files written before the grammar settled)
        const values = rest.split(/\s+or\s+|\s*\\?\|\s*/i).map(v => v.trim()).filter(Boolean);
        if (!values.length) return { conds, error: `"${key}" has no value` };
        for (const v of values) { const bad = badValue(key, v); if (bad) return { conds, error: `${key}: ${bad}` }; }
        conds.push({ key, not, values: values.map(v => tidy(key, v)) });
    }
    return { conds };
}
// The old object, as conditions in the order the old lore code checked them (the order matters: the region's mood
// and tension are only looked up, and kept in the save, when everything before held).
function fromObject(c: LoreWhen): ParsedWhen {
    const conds: Cond[] = [];
    const add = (key: Cond['key'], v: unknown) => conds.push({ key, not: false, values: [String(v)] });
    const num = (v: unknown) => String(Number(v));
    if (c.period) add('period', c.period);
    if (c.place) add('place', c.place);
    if (c.region) add('region', c.region);
    if (c.weather) add('weather', c.weather);
    if (c.weekend !== undefined) add('weekend', c.weekend ? 'yes' : 'no');
    if (c.season) add('season', c.season);
    if (c.fromDay) add('fromDay', num(c.fromDay));
    if (c.toDay) add('toDay', num(c.toDay));
    if (c.tensionAbove !== undefined) add('tensionAbove', num(c.tensionAbove));
    if (c.moodAbove !== undefined) add('moodAbove', num(c.moodAbove));
    if (c.moodBelow !== undefined) add('moodBelow', num(c.moodBelow));
    if (c.chance !== undefined) add('chance', num(c.chance));
    return { conds, old: true };
}
const cache = new Map<string, ParsedWhen>();
/** A condition read into its parts (text is read once and kept; the old object form is read each time, it's cheap). */
export function parseWhen(when: When | null | undefined): ParsedWhen {
    if (when == null) return { conds: [] };
    if (typeof when !== 'string') return fromObject(when);
    let p = cache.get(when);
    if (!p) { p = parseText(when); cache.set(when, p); }
    return p;
}
/** Why a condition can't be read ('' when it can): for the world creator and the world checks. */
export const whenError = (when: When | null | undefined) => parseWhen(when).error ?? '';

/* ---------- what holds ---------- */

/** Where and when a condition is asked about. `place`: default where the player is; `at`: absolute game minutes,
 *  default now. `key`: a salt of the asker's own for `chance` (each entry rolls its own dice, the same all day).
 *  `id`: what asks (an action), for `daily`. `day`: only what holds for the whole day (a rumor starting): the moment's
 *  and the place's keys are left out. `chance`: the chance when the condition gives none (world rumors: 0.25). */
export interface WhenCtx { place?: string; at?: number; key?: string; id?: string; day?: boolean; chance?: number }
const MOMENT_KEYS = new Set<Cond['key']>(['period', 'clock', 'place', 'zone', 'region', 'present', 'onShift', 'companion', 'after', 'daily', 'regular']);
interface Here { place: string; at: number; day: number; minutes: number; key: string; id?: string; whole: boolean; old: boolean; conds: Cond[] }

const warned = new Set<string>();
/** Does the condition hold? None (or an empty one) always holds; one that can't be read never does. */
export function whenHolds(g: Save, w: WorldDef, when: When | null | undefined, ctx: WhenCtx = {}): boolean {
    const p = parseWhen(when);
    if (p.error) {
        if (!warned.has(String(when))) { warned.add(String(when)); console.warn('[Mundi] condition not understood:', when, '·', p.error); }
        return false;
    }
    const at = ctx.at ?? nowAbs(g);
    const x: Here = { place: ctx.place ?? g.player.loc, at, day: Math.floor(at / 1440), minutes: ((at % 1440) + 1440) % 1440, key: ctx.key ?? '', id: ctx.id, whole: !!ctx.day, old: !!p.old, conds: p.conds };
    let rolls = 0;
    for (const c of p.conds) {
        if (ctx.day && MOMENT_KEYS.has(c.key)) continue;
        // each `chance` rolls its own dice (the first one with the asker's salt, as the old lore did)
        const hit = c.key === 'chance' ? roll(g, x, chanceOf(c.values[0]), rolls++) : c.values.some(v => holds(g, w, c.key, v, x));
        if (hit === c.not) return false;
    }
    if (ctx.chance !== undefined && !p.conds.some(c => c.key === 'chance')) return roll(g, x, ctx.chance, 0);
    return true;
}
// Same world, day and salt: the same roll (FNV-1a, as sim/living.ts rolls).
const rnd = (g: Save, day: number, salt: string) => { let h = 2166136261; const s = `${g.world}|${day}|${salt}`; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const roll = (g: Save, x: Here, p: number, n: number) => p >= 1 || rnd(g, x.day, n ? `${x.key}|${n}` : x.key) < p;
const seasonAt = (g: Save, day: number) => SEASONS[Math.floor((Math.max(1, day) - 1) / seasonDays(g)) % 4].id;
const inDays = (d: number, v: string) => { const m = v.match(DAYS)!; const a = Number(m[1]), b = Number(m[2] ?? m[1]); return d >= a && d <= b; };
function inClock(minutes: number, v: string) {
    const m = v.match(CLOCK)!;
    const from = Number(m[1]) * 60 + Number(m[2] ?? 0), to = Number(m[3]) * 60 + Number(m[4] ?? 0);
    const a = from % 1440, b = to % 1440;
    return a < b ? minutes >= a && minutes < b : a > b ? minutes >= a || minutes < b : true;   // 23:30-0:30 goes past midnight
}
// The region an old condition's mood and tension are read in: its own region, or the place's.
const moodRegion = (g: Save, w: WorldDef, x: Here) => x.conds.find(c => c.key === 'region' && !c.not)?.values[0] ?? regionOf(g, w, x.place);
function regionNow(g: Save, w: WorldDef, x: Here) { return systemOn(w, 'living') ? regionState(g, w, moodRegion(g, w, x)) : null; }

function holds(g: Save, w: WorldDef, key: Cond['key'], v: string, x: Here): boolean {
    switch (key) {
        case 'period': {
            const per = period(w, x.minutes);
            // by id; by name in older worlds (and always for the old object form, as before)
            return !x.old && w.time.periods.some(p => p.id === v) ? per.id === v : per.name.toLowerCase() === v.toLowerCase();
        }
        case 'weekday': return WEEKDAY_IDS[(((x.day - 1) % 7) + 7) % 7] === v;
        case 'weekend': return isWeekend(x.day) === (v === 'yes');
        case 'season': return seasonAt(g, x.day) === v;
        case 'seasonDays': return inDays(((Math.max(1, x.day) - 1) % seasonDays(g)) + 1, v);
        // a kind of weather, or the region's own (a view of Mt. Fuji: the same for every place that day, in the morning light)
        case 'weather': return weatherIs(g, w, x.place, x.day, v, x.whole ? undefined : x.minutes);
        case 'festival': return festivalsOn(g, w, x.day).some(f => f.id === v);
        // a city event going on now (or, for the whole day, on today and not called off)
        case 'event': return x.whole ? eventsOn(g, w, x.day).some(e => e.ev.id === v && !e.off) : liveEvents(g, w, x.at).some(e => e.ev.id === v);
        case 'place': return x.place === v;
        case 'zone': return zoneOf(g, x.place) === v;
        case 'region': return regionOf(g, w, x.place) === v;
        case 'daily': return v === 'no' || (!!x.id && !doneToday(g, x.id, undefined, x.day));
        case 'regular': return (visitsTo(g, x.place)?.n ?? 0) >= Number(v);
        case 'skill': { const [id, n] = v.split(/\s+/); return levelOf(g, id) >= Number(n); }
        case 'feels': { const [name, level] = splitLevel(v); const r = personNamed(g, name); return !!r && (level ? levelHolds(g, w, r.avatar, level) : !!r.met); }
        case 'present': { const r = personNamed(g, v); return !!r && isHere(g, w, r, x); }
        case 'onShift': { const r = personNamed(g, v); return !!r && atWork(g, w, r, x); }
        case 'after': return doneToday(g, v, x.place, x.day);
        case 'job': { const j = g.player.job; return !!j && (v === 'here' ? w.occupations.find(o => o.id === j.id)?.place === x.place : j.id === v); }
        case 'start': return ((g.player as any).start ?? g.player.origin) === v;
        case 'clock': return inClock(x.minutes, v);
        case 'stayed': { const s = (g.player as any).stayed as { place: string; day: number } | undefined; return !!s && s.place === v && s.day === x.day; }
        case 'holds': return Number((g.player as any).keepsakes?.[v] ?? 0) > 0;
        case 'companion': return companions(g).some(a => v === 'yes' || levelHolds(g, w, a, v));
        // the story so far (E22, E17, E28)
        case 'knows': return !!threadState(g, v)?.known;
        case 'thread': { const [id, how] = v.split(/\s+/); const t = threadState(g, id); return !!t?.ended && (!how || t.ended === how); }
        case 'seen': { const [id, n] = v.split(':'); const s = (g as any).stories?.seen?.[id]; return !!s && (!n || (s.choice === Number(n) - 1 && s.ok !== false)); }
        case 'favor': return favorOwed(g, v) > 0;
        // the player's performance at their job, at least this (a rank that asks for a high performance)
        case 'perf': { const j = g.player.job as { perf?: number } | null; return !!j && Math.round(j.perf ?? 50) >= Number(v); }
        // the old object form's own keys
        case 'fromDay': return x.day >= Number(v);
        case 'toDay': return x.day <= Number(v);
        case 'tensionAbove': { const r = regionNow(g, w, x); return !!r && r.tension > Number(v); }
        case 'moodAbove': { const r = regionNow(g, w, x); return !!r && r.mood > Number(v); }
        case 'moodBelow': { const r = regionNow(g, w, x); return !!r && r.mood < Number(v); }
        default: return false;
    }
}

/* ---------- the pieces the keys read ---------- */

// The home zone of a place: your home's, or the home of the person whose home it is (someone living with another
// person is at that person's home); '' for a place that isn't a home.
function zoneOf(g: Save, place: string, depth = 0): string {
    if (place === 'home:player') return g.player.home?.zone ?? '';
    if (!place.startsWith('home:') || depth > 3) return '';
    const r = g.cast[place.slice(5)]; if (!r) return '';
    const with_ = (r as any).homeWith as string | undefined;
    if (with_ === '__you') return zoneOf(g, 'home:player', depth + 1);
    if (with_ && with_ !== r.avatar && g.cast[with_]) return zoneOf(g, `home:${with_}`, depth + 1);
    return r.home?.zone ?? '';
}
// One of the world's people by name (the full name, or the first one: "Kyōko" for Kyōko Shirai; accents and case
// don't matter). A full name wins over a first name.
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
export function personNamed(g: Save, name: string): Resident | undefined {
    const n = plain(name), all = Object.values(g.cast);
    return all.find(r => plain(r.name ?? '') === n) ?? all.find(r => plain(r.name ?? '').split(/\s+/)[0] === n);
}
/** Is someone toward you at this level or closer (a friendship tier, a romance tier, a couple status)? Below Stranger,
 *  a level means that bad or worse. Romance levels and statuses need the romance system. */
export function levelHolds(g: Save, w: WorldDef, avatar: string, level: string): boolean {
    const ft = FRIEND_TIERS.find(t => t.id === level);
    if (ft) { const v = Math.round(fr(g, avatar, YOU)); return ft.lo >= 0 ? v >= ft.lo : v < ft.hi; }
    if (!systemOn(w, 'romance')) return false;
    const rt = ROMANCE_TIERS.find(t => t.id === level);
    if (rt) return Math.round(ro(g, avatar, YOU)) >= rt.lo;
    const s = statusOf(g, avatar, YOU), i = STATUS_LEVELS.indexOf(level);
    return i >= 0 && !!s && STATUS_LEVELS.indexOf(s) >= i;
}
// Here now (as everyone else sees it), or at another moment by their routine.
const isHere = (g: Save, w: WorldDef, r: Resident, x: Here) => (x.at === nowAbs(g) ? presentAt(g, w, x.place).includes(r) : routineAt(g, w, r, x.at) === x.place);
// At work here: here, and their day says work here (a shift of a job with a schedule, their routine's work hours for
// one without, or working late).
function atWork(g: Save, w: WorldDef, r: Resident, x: Here) {
    return systemOn(w, 'jobs') && workingAt(g, w, r, x.at) === x.place && isHere(g, w, r, x);
}

// A thread's state (sim/threads.ts): `known` the day the player learned it, `ended` how it ended.
const threadState = (g: Save, id: string) => (g as any).threads?.[id] as { known?: number; ended?: string } | undefined;
/** How many favors someone (a name of the world's people, or a stranger's id) owes you (sim/stories.ts keeps them,
 *  by a person's avatar or the stranger's id). */
export function favorOwed(g: Save, who: string): number {
    const f = (g as any).stories?.favors as Record<string, number> | undefined;
    if (!f) return 0;
    const r = personNamed(g, who);
    return (r ? f[r.avatar] : undefined) ?? f[who] ?? 0;
}

/* ---------- what was done today (`after`, `daily`) ---------- */

// The things done today (action ids at places). E14 records each action with markDone; nothing else writes it, and
// it holds only today's.
interface Done { day: number; list: string[] }
/** Has `id` been done today (at `place`, or anywhere)? */
export function doneToday(g: Save, id: string, place?: string, day = g.day): boolean {
    const d = (g as any).done as Done | undefined;
    return !!d && d.day === day && d.list.some(x => (place ? x === `${id}@${place}` : x.startsWith(`${id}@`)));
}
/** Remember that `id` was done at `place` today. */
export function markDone(g: Save, id: string, place = g.player.loc) {
    const d = ((g as any).done ??= { day: g.day, list: [] }) as Done;
    if (d.day !== g.day) { d.day = g.day; d.list = []; }
    if (!d.list.includes(`${id}@${place}`)) d.list.push(`${id}@${place}`);
}

/* ---------- for the rumors ---------- */

/** The place a condition names (its first `place`), if any: where a world rumor's weather is looked up. */
export function whenPlace(when: When | null | undefined): string | undefined {
    if (when && typeof when === 'object') return when.place;
    return parseWhen(when).conds.find(c => c.key === 'place' && !c.not)?.values[0];
}
/** Does a region meet the condition's `region` parts (none: any region)? Who starts a world rumor. */
export const whenRegionOk = (when: When | null | undefined, region: string) => parseWhen(when).conds.filter(c => c.key === 'region').every(c => c.values.includes(region) !== c.not);
