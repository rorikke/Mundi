// Conditions: one evaluator for every `when` in a world: conditional lore and world rumors now, and the actions,
// street stories, work events and rituals that come with Tokyo. A condition is text in one grammar (core/world.ts,
// `When`): `period: evening or night; weekday: fri; feels: Kyōko friend`, parsed once and kept. Worlds from before
// give an object (`LoreWhen`), read exactly as the old lore code read it (a period by its name, in the same order).
// Keys whose data the engine doesn't keep yet hold false until their system writes it: `stayed` (E6 writes
// `player.stayed`), `holds` (E14 writes `player.keepsakes`). The story so far is read straight from the save, so this
// file needs neither module: `knows` and `thread` (sim/threads.ts keeps `g.threads`), `seen` and `favor`
// (sim/stories.ts keeps `g.stories`); `perf` reads the player's job (sim/work.ts keeps `player.job.perf`); `course`
// reads the courses finished (sim/courses.ts keeps `player.learning.done`).
// Life goals' keys (their steps are conditions, and actions, jobs and stories can ask for a goal): states, true as soon
// as they hold (`rank`, `money`, `home`, `partner`, `friends`, `visited`, `secrets`, `helped`, `goal`, `need`, `rep`),
// and counts (`did`, `attended`) read from sim/tally.ts's lifetime counters, or from the asker's own counts
// (`WhenCtx.count`: a goal counts only while it's active); `did: overnight with best` counts only what was done with
// someone at that level toward you now. `goal` reads `g.goals` (sim/goals.ts keeps it) and the old
// aspirations finished (`player.aspDone`).
import { nowAbs, adultOn } from '../core/store.js';
import { systemOn, activeStatuses, WEEKDAY_IDS } from '../core/world.js';
import { FOLDED_GOALS, SKILL_GROUPS } from '../core/goals.js';
import { FRIEND_LEVELS, ROM_LEVELS } from '../core/feel.js';
import { period, isWeekend, seasonDays, SEASONS } from './time.js';
import { weatherIs, regionOf, regionState } from './worldstate.js';
import { festivalsOn } from './festivals.js';
import { eventsOn, liveEvents } from './cityevents.js';
import { presentAt, routineAt, workingAt } from './people.js';
import { visitsTo } from './daylife.js';
import { levelOf, skillsOf } from './hobbies.js';
import { fr, ro, statusOf, YOU } from './rel.js';
import { FRIEND_TIERS, ROMANCE_TIERS } from './romance.js';
import { companions } from './social.js';
import { tallyOf, beenTo, placesBeen, bestRanks, tally, isRegular, TALLY_EVENTS, TALLY_PREFIXES } from './tally.js';
import { careerOf, trackOf } from './work.js';
import { styleOf } from './intimacy.js';
import { usualPay } from './needs.js';
import { REP_WORDS } from './standing.js';
export const WHEN_KEYS = ['period', 'weekday', 'weekend', 'season', 'seasonDays', 'weather', 'festival', 'event', 'place', 'zone', 'region',
    'daily', 'regular', 'skill', 'feels', 'onShift', 'present', 'after', 'job', 'start', 'chance', 'clock', 'stayed', 'holds', 'companion',
    'knows', 'seen', 'thread', 'favor', 'perf', 'gave', 'course',
    'rank', 'money', 'home', 'partner', 'friends', 'did', 'visited', 'attended', 'secrets', 'helped', 'goal', 'need', 'rep'];
/** The levels `feels` and `companion` take: friendship tiers, romance tiers, and couple statuses (each at that level or
 *  closer; a level below Stranger means that bad or worse). */
export const STATUS_LEVELS = ['casual', 'dating', 'engaged', 'married'];
export const LEVELS = [...FRIEND_LEVELS, ...ROM_LEVELS, ...STATUS_LEVELS]; // (core/feel.ts: loaded before any sim file)
const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const ID = /^[^\s,;]+$/;
const DAYS = /^(\d+)(?:\s*[-–]\s*(\d+))?$/;
const CLOCK = /^(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?$/;
const YES = ['yes', 'true'], NO = ['no', 'false'];
// life goals' values (sim/tally.ts, core/goals.ts)
const SKILL = /^(\S+)\s+(\d+)(?:\s+x(\d+))?$/i; // cooking 3 · any 5 x3 · creative 5 x2
const RANK = /^(\d+|top|middle|top-\d+)(?:\s+in\s+(\d+)\s+jobs?)?$/i; // 2 · middle · top-1 · top · 2 in 3 jobs
const MONEY = /^(\d+(?:\.\d+)?)(?:\s+(weeks?|months?|years?))?$|^fortune$/i;
const FRIENDS = /^(\d+)\s+(\S+)(?:\s+(?:in\s+(\S+)|at\s+(regular)))?$/i; // 3 good · 2 good in yokohama · 1 good at regular
const COUNTED = /^([^\s,;]+)(?:\s+(\d+(?:\.\d+)?))?$/; // meal 15 · tag:karaoke 3 · ramen_contest
const DID = /^([^\s,;]+)(?:\s+(\d+(?:\.\d+)?))?(?:\s+with\s+(\S+))?$/i; // overnight 2 with best: only with someone at that level now
const VISITED = /^(?:(\d+)(?:\s+(regular))?(?:\s+in\s+(\S+))?|all(?:\s+in\s+(\S+))?|map|maps)$/i; // 3 regular in home
/** `visited: pk_arcade regular`: a regular at that place. */
export const PLACE_REGULAR = /^([^\s,;]+)\s+regular$/i;
/** `partner:` values besides a number (`partner: 2`: two partners or more, casual ones included). `open`: a partner
 *  whose relationship style is open (their own, else the world's open relationships). */
export const PARTNER_VALUES = ['any', 'none', 'home', 'casual', 'dating', 'engaged', 'married', 'open'];
/** The money `money: 2 weeks` means: weeks of the world's usual pay (40 hours), or the old aspiration's fortune. */
export function moneyAmount(w, v) {
    if (v.toLowerCase() === 'fortune')
        return usualPay(w) * 3125;
    const m = v.match(MONEY);
    if (!m)
        return Infinity;
    const n = Number(m[1]), u = (m[2] ?? '').toLowerCase().replace(/s$/, '');
    return u === 'week' ? n * usualPay(w) * 40 : u === 'month' ? n * usualPay(w) * 40 * 52 / 12 : u === 'year' ? n * usualPay(w) * 40 * 52 : n;
}
/** The counter a counted value reads (`did: tag:karaoke 3` → `tag:karaoke`; an engine moment's name → `event:…`, any
 *  other name → `action:…`; `attended` → `festival:…` or `cityevent:…`, `any` → both). */
export function countKey(w, key, what) {
    if (key === 'attended')
        return what === 'any' ? 'attended:any' : w?.festivals?.some(f => f.id === what) ? `festival:${what}` : `cityevent:${what}`;
    if (what.indexOf(':') > 0)
        return what;
    return TALLY_EVENTS.includes(what) ? `event:${what}` : `action:${what}`;
}
/** A counted value read into its parts: what is counted, how many times, and (`did` only) the level toward you of the
 *  people it must have been done with (`did: overnight with best`: counted per person, sim/tally.ts). */
export function countedOf(key, v) {
    const m = v.match(key === 'did' ? DID : COUNTED);
    return m ? { what: m[1], n: Number(m[2] ?? 1), ...(m[3] ? { with: m[3].toLowerCase() } : {}) } : null;
}
/* ---------- reading the text ---------- */
const keyOf = (k) => WHEN_KEYS.find(x => x.toLowerCase() === k.toLowerCase());
const weekdayOf = (v) => { const s = v.toLowerCase(); const i = WEEKDAY_NAMES.findIndex(n => n === s || n.slice(0, 3) === s); return i < 0 ? null : WEEKDAY_IDS[i]; };
const splitLevel = (v) => { const m = v.match(/^(.*\S)\s+(\S+)$/); return m && LEVELS.includes(m[2].toLowerCase()) ? [m[1], m[2].toLowerCase()] : [v, null]; };
const chanceOf = (v) => (v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v));
// What's wrong with a value for its key ('' when it's fine).
function badValue(key, v) {
    switch (key) {
        case 'weekday': return weekdayOf(v) ? '' : `"${v}" is not a weekday (mon … sun)`;
        case 'weekend':
        case 'daily': return [...YES, ...NO].includes(v.toLowerCase()) ? '' : `"${v}" should be yes or no`;
        case 'season': return SEASONS.some(s => s.id === v.toLowerCase()) ? '' : `"${v}" is not a season`;
        case 'seasonDays': return DAYS.test(v) ? '' : `"${v}" should be days like 3-6`;
        case 'regular': return /^\d+$/.test(v) && Number(v) >= 1 ? '' : `"${v}" should be a number of visits`;
        case 'perf': return /^\d+$/.test(v) && Number(v) <= 100 ? '' : `"${v}" should be a performance from 0 to 100`;
        case 'skill': return SKILL.test(v) ? '' : `"${v}" should be a skill and a level, like cooking 3 (or any 5 x3: three skills at 5)`;
        case 'rank': {
            const m = v.match(RANK);
            return m && (!m[2] || /^\d+$/.test(m[1])) ? '' : `"${v}" should be a rank (2, middle, top-1, top), or a rank in a number of jobs (2 in 3 jobs)`;
        }
        case 'money': return MONEY.test(v) ? '' : `"${v}" should be an amount, a time of the usual pay (2 weeks, 6 months) or fortune`;
        case 'home': return ID.test(v) ? '' : `"${v}" should be a kind of home, alone, better, top, season or a number of days`;
        case 'partner': return PARTNER_VALUES.includes(v.toLowerCase()) || /^\d+$/.test(v) ? '' : `"${v}" should be any, none, home, casual, dating, engaged, married, open or a number of partners`;
        case 'friends': {
            const m = v.match(FRIENDS);
            return m && LEVELS.includes(m[2].toLowerCase()) ? '' : `"${v}" should be a number and a level, like 3 good (or 2 good in a map)`;
        }
        case 'did': {
            const m = v.match(DID), p = m && m[1].includes(':') ? m[1].slice(0, m[1].indexOf(':')) : '';
            return m && (!p || TALLY_PREFIXES.includes(p)) && (!m[3] || LEVELS.includes(m[3].toLowerCase())) ? ''
                : `"${v}" should be an action, a tag:…, a moment (meal, party…) and how many times (and "with" a level: overnight with best)`;
        }
        case 'attended': return COUNTED.test(v) && !v.includes(':') ? '' : `"${v}" should be a festival or an event, and how many times`;
        case 'visited': return VISITED.test(v) || ID.test(v) || PLACE_REGULAR.test(v) ? '' : `"${v}" should be a place (or a place and regular), a number of places (3 in a map, 3 regular in home), all, map or maps`;
        case 'secrets': return /^\d+$/.test(v) ? '' : `"${v}" should be a number of secrets`;
        case 'helped': return ID.test(v) ? '' : `"${v}" should be a number of storylines, or a storyline's id`;
        case 'goal': return /^[^\s,;]+(\s+\d+)?$/.test(v) ? '' : `"${v}" should be a goal, a goal and a step (idol 3), or a number of goals`;
        case 'need': return /^\S+\s+\d+$/.test(v) ? '' : `"${v}" should be a need (or all) and a value, like mood 50`;
        case 'rep': return /^-?\d+$/.test(v) || REP_WORDS.some(([, n]) => n === v.toLowerCase()) ? '' : `"${v}" should be a reputation (known, respected, renowned…) or a number`;
        case 'chance': {
            const p = chanceOf(v);
            return Number.isFinite(p) && p >= 0 && p <= 1 ? '' : `"${v}" should be between 0 and 1`;
        }
        case 'clock': return CLOCK.test(v) ? '' : `"${v}" should be hours like 19:00-20:00`;
        case 'companion': return v.toLowerCase() === 'yes' || LEVELS.includes(v.toLowerCase()) ? '' : `"${v}" is not a level (friend, crush, dating…)`;
        case 'feels': return splitLevel(v)[0] ? '' : 'a name is missing';
        case 'course': return ID.test(v) ? '' : `"${v}" should be a course id, or a number of courses`;
        case 'festival':
        case 'event':
        case 'place':
        case 'zone':
        case 'region':
        case 'after':
        case 'job':
        case 'start':
        case 'stayed':
        case 'holds':
        case 'gave':
        case 'knows':
            return ID.test(v) ? '' : `"${v}" should be one id`;
        case 'seen': return /^[^\s,;:]+(:\d+)?$/.test(v) ? '' : `"${v}" should be a story id, or a story id and a choice like sb_startup_st_pitch:2`;
        case 'thread': return /^[^\s,;]+(\s+[^\s,;]+)?$/.test(v) ? '' : `"${v}" should be a thread id, or a thread id and how it ended`;
        default: return ''; // period (a name may have spaces in older worlds), weather, present, onShift
    }
}
const tidy = (key, v) => (key === 'weekday' ? weekdayOf(v) : ['weekend', 'daily'].includes(key) ? (YES.includes(v.toLowerCase()) ? 'yes' : 'no') : ['season', 'companion', 'partner', 'rep', 'rank', 'money'].includes(key) ? v.toLowerCase() : v);
function parseText(text) {
    // backticks from design tables; an outcome's own condition may be written `when: present: Kaito`
    const s = text.replace(/`/g, '').trim().replace(/^when\s*:\s*/i, '');
    const conds = [];
    for (const part of s.split(';')) {
        const p = part.trim();
        if (!p)
            continue;
        const i = p.indexOf(':');
        if (i < 0)
            return { conds, error: `"${p}" has no key (write key: value)` };
        const key = keyOf(p.slice(0, i).trim());
        if (!key)
            return { conds, error: `unknown key "${p.slice(0, i).trim()}"` };
        let rest = p.slice(i + 1).trim();
        const not = /^not\s+/i.test(rest);
        if (not)
            rest = rest.replace(/^not\s+/i, '');
        // `or` between alternatives (`|` and `\|` in files written before the grammar settled)
        const values = rest.split(/\s+or\s+|\s*\\?\|\s*/i).map(v => v.trim()).filter(Boolean);
        if (!values.length)
            return { conds, error: `"${key}" has no value` };
        for (const v of values) {
            const bad = badValue(key, v);
            if (bad)
                return { conds, error: `${key}: ${bad}` };
        }
        conds.push({ key, not, values: values.map(v => tidy(key, v)) });
    }
    return { conds };
}
// The old object, as conditions in the order the old lore code checked them (the order matters: the region's mood
// and tension are only looked up, and kept in the save, when everything before held).
function fromObject(c) {
    const conds = [];
    const add = (key, v) => conds.push({ key, not: false, values: [String(v)] });
    const num = (v) => String(Number(v));
    if (c.period)
        add('period', c.period);
    if (c.place)
        add('place', c.place);
    if (c.region)
        add('region', c.region);
    if (c.weather)
        add('weather', c.weather);
    if (c.weekend !== undefined)
        add('weekend', c.weekend ? 'yes' : 'no');
    if (c.season)
        add('season', c.season);
    if (c.fromDay)
        add('fromDay', num(c.fromDay));
    if (c.toDay)
        add('toDay', num(c.toDay));
    if (c.tensionAbove !== undefined)
        add('tensionAbove', num(c.tensionAbove));
    if (c.moodAbove !== undefined)
        add('moodAbove', num(c.moodAbove));
    if (c.moodBelow !== undefined)
        add('moodBelow', num(c.moodBelow));
    if (c.chance !== undefined)
        add('chance', num(c.chance));
    return { conds, old: true };
}
const cache = new Map();
/** A condition read into its parts (text is read once and kept; the old object form is read each time, it's cheap). */
export function parseWhen(when) {
    if (when == null)
        return { conds: [] };
    if (typeof when !== 'string')
        return fromObject(when);
    let p = cache.get(when);
    if (!p) {
        p = parseText(when);
        cache.set(when, p);
    }
    return p;
}
/** The world's people and threads a condition names (`feels`, `present`, `onShift`, `favor`; `knows`, `thread`,
 *  `helped` with an id): a life goal's step that names any needs another way to be done (D-4), and isn't offered in a
 *  game without them. */
export function namedIn(when) {
    const people = [], threads = [];
    for (const c of parseWhen(when).conds)
        for (const v of c.values) {
            if (c.key === 'feels')
                people.push(splitLevel(v)[0]);
            else if (c.key === 'present' || c.key === 'onShift' || c.key === 'favor')
                people.push(v);
            else if (c.key === 'knows' || c.key === 'thread' || (c.key === 'helped' && !/^\d+$/.test(v)))
                threads.push(v.split(/\s+/)[0]);
        }
    return { people, threads };
}
/** Why a condition can't be read ('' when it can): for the world creator and the world checks. */
export const whenError = (when) => parseWhen(when).error ?? '';
const MOMENT_KEYS = new Set(['period', 'clock', 'place', 'zone', 'region', 'present', 'onShift', 'companion', 'after', 'daily', 'regular']);
const warned = new Set();
/** Does the condition hold? None (or an empty one) always holds; one that can't be read never does. */
export function whenHolds(g, w, when, ctx = {}) {
    const p = parseWhen(when);
    if (p.error) {
        if (!warned.has(String(when))) {
            warned.add(String(when));
            console.warn('[Mundi] condition not understood:', when, '·', p.error);
        }
        return false;
    }
    const at = ctx.at ?? nowAbs(g);
    const x = { place: ctx.place ?? g.player.loc, at, day: Math.floor(at / 1440), minutes: ((at % 1440) + 1440) % 1440, key: ctx.key ?? '', id: ctx.id, whole: !!ctx.day, old: !!p.old, conds: p.conds, count: ctx.count };
    let rolls = 0;
    for (const c of p.conds) {
        if (ctx.day && MOMENT_KEYS.has(c.key))
            continue;
        // each `chance` rolls its own dice (the first one with the asker's salt, as the old lore did)
        const hit = c.key === 'chance' ? roll(g, x, chanceOf(c.values[0]), rolls++) : c.values.some(v => holds(g, w, c.key, v, x));
        if (hit === c.not)
            return false;
    }
    if (ctx.chance !== undefined && !p.conds.some(c => c.key === 'chance'))
        return roll(g, x, ctx.chance, 0);
    return true;
}
// Same world, day and salt: the same roll (FNV-1a, as sim/living.ts rolls).
const rnd = (g, day, salt) => { let h = 2166136261; const s = `${g.world}|${day}|${salt}`; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const roll = (g, x, p, n) => p >= 1 || rnd(g, x.day, n ? `${x.key}|${n}` : x.key) < p;
const seasonAt = (g, day) => SEASONS[Math.floor((Math.max(1, day) - 1) / seasonDays(g)) % 4].id;
const inDays = (d, v) => { const m = v.match(DAYS); const a = Number(m[1]), b = Number(m[2] ?? m[1]); return d >= a && d <= b; };
function inClock(minutes, v) {
    const m = v.match(CLOCK);
    const from = Number(m[1]) * 60 + Number(m[2] ?? 0), to = Number(m[3]) * 60 + Number(m[4] ?? 0);
    const a = from % 1440, b = to % 1440;
    return a < b ? minutes >= a && minutes < b : a > b ? minutes >= a || minutes < b : true; // 23:30-0:30 goes past midnight
}
// The region an old condition's mood and tension are read in: its own region, or the place's.
const moodRegion = (g, w, x) => x.conds.find(c => c.key === 'region' && !c.not)?.values[0] ?? regionOf(g, w, x.place);
function regionNow(g, w, x) { return systemOn(w, 'living') ? regionState(g, w, moodRegion(g, w, x)) : null; }
function holds(g, w, key, v, x) {
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
        case 'festival': return festivalsOn(g, w, x.day).some(f => v === 'any' || f.id === v);
        // a city event going on now (or, for the whole day, on today and not called off); `any`: whichever
        case 'event': return x.whole ? eventsOn(g, w, x.day).some(e => (v === 'any' || e.ev.id === v) && !e.off) : liveEvents(g, w, x.at).some(e => v === 'any' || e.ev.id === v);
        case 'place': return x.place === v;
        case 'zone': return zoneOf(g, x.place) === v;
        case 'region': return regionOf(g, w, x.place) === v;
        case 'daily': return v === 'no' || (!!x.id && !doneToday(g, x.id, undefined, x.day));
        case 'regular': return (visitsTo(g, x.place)?.n ?? 0) >= Number(v);
        // a skill at a level; `any` or a group (`creative`) for whichever of them, `x3` for that many of them
        case 'skill': {
            const m = v.match(SKILL), id = m[1], n = Number(m[2]), many = Number(m[3] ?? 1);
            if (id !== 'any' && !SKILL_GROUPS[id])
                return many <= 1 && skillOn(g, w, id) && levelOf(g, id) >= n;
            return skillIds(g, w, id).filter(s => levelOf(g, s) >= n).length >= many;
        }
        case 'feels': {
            const [name, level] = splitLevel(v);
            const r = personNamed(g, name);
            return !!r && (level ? levelHolds(g, w, r.avatar, level) : !!r.met);
        }
        case 'present': {
            const r = personNamed(g, v);
            return !!r && isHere(g, w, r, x);
        }
        case 'onShift': {
            const r = personNamed(g, v);
            return !!r && atWork(g, w, r, x);
        }
        case 'after': return doneToday(g, v, x.place, x.day);
        case 'job': {
            const j = g.player.job;
            return !!j && (v === 'here' ? w.occupations.find(o => o.id === j.id)?.place === x.place : v === 'any' || j.id === v);
        }
        case 'start': return (g.player.start ?? g.player.origin) === v;
        case 'clock': return inClock(x.minutes, v);
        case 'stayed': {
            const s = g.player.stayed;
            return !!s && s.place === v && s.day === x.day;
        }
        // a keepsake you have; a number: that many different ones; `kind:<kind>` (`kind:any`): every keepsake of that kind
        case 'holds': return /^\d+$/.test(v) ? heldIds(g).length >= Number(v) : v.startsWith('kind:') ? fullSet(g, w, v.slice(5)) : Number(g.player.keepsakes?.[v] ?? 0) > 0;
        // someone here has this keepsake from you (a gift)
        case 'gave': return Object.entries(g.social?.given ?? {}).some(([a, ids]) => ids.includes(v) && !!g.cast[a] && isHere(g, w, g.cast[a], x));
        case 'companion': return companions(g).some(a => v === 'yes' || levelHolds(g, w, a, v));
        // the story so far (E22, E17, E28)
        case 'knows': return !!threadState(g, v)?.known;
        case 'thread': {
            const [id, how] = v.split(/\s+/);
            const t = threadState(g, id);
            return !!t?.ended && (!how || t.ended === how);
        }
        case 'seen': {
            const [id, n] = v.split(':');
            const s = g.stories?.seen?.[id];
            return !!s && (!n || (s.choice === Number(n) - 1 && s.ok !== false));
        }
        case 'favor': return favorOwed(g, v) > 0;
        // a course finished (its id), or at least this many courses (a number)
        case 'course': {
            if (!systemOn(w, 'courses'))
                return false;
            const done = g.player.learning?.done ?? [];
            return /^\d+$/.test(v) ? done.length >= Number(v) : done.includes(v);
        }
        // the player's performance at their job, at least this (a rank that asks for a high performance)
        case 'perf': {
            const j = g.player.job;
            return !!j && Math.round(j.perf ?? 50) >= Number(v);
        }
        // life goals (see the top of the file)
        case 'rank': return rankHolds(g, w, v);
        case 'money': return g.player.money >= moneyAmount(w, v);
        case 'home': return homeHolds(g, w, v);
        case 'partner': return partnerHolds(g, w, v);
        case 'friends': return friendsHold(g, w, v);
        case 'did':
        case 'attended': {
            const c = countedOf(key, v), k = countKey(w, key, c.what), n = (id) => (x.count ? x.count(id) : tallyOf(g, id));
            // with someone at a level: what was counted with each of them (`<key>|<avatar>`), for those at it now
            const have = c.with ? Object.values(g.cast).filter(r => r.met && levelHolds(g, w, r.avatar, c.with)).reduce((a, r) => a + n(`${k}|${r.avatar}`), 0) : n(k);
            return have >= c.n;
        }
        case 'visited': return visitedHolds(g, w, v);
        case 'secrets': return Object.values(g.threads ?? {}).filter(t => t?.known !== undefined).length >= Number(v);
        case 'helped': return /^\d+$/.test(v) ? helpedThreads(g, w).length >= Number(v) : helpedThreads(g, w).includes(v);
        case 'goal': return goalHolds(g, w, v);
        case 'need': {
            const [id, n] = v.split(/\s+/);
            const on = activeStatuses(w, g).filter(s => !s.rpg);
            const val = (sid) => g.player.stats[sid] ?? on.find(s => s.id === sid).start;
            return id === 'all' ? on.length > 0 && on.every(s => val(s.id) >= Number(n)) : on.some(s => s.id === id) && val(id) >= Number(n);
        }
        case 'rep': {
            if (!systemOn(w, 'reputation'))
                return false;
            const min = /^-?\d+$/.test(v) ? Number(v) : REP_WORDS.find(([, n]) => n === v)[0];
            return Object.values(g.rep ?? {}).some(r => r.v >= min);
        }
        // the old object form's own keys
        case 'fromDay': return x.day >= Number(v);
        case 'toDay': return x.day <= Number(v);
        case 'tensionAbove': {
            const r = regionNow(g, w, x);
            return !!r && r.tension > Number(v);
        }
        case 'moodAbove': {
            const r = regionNow(g, w, x);
            return !!r && r.mood > Number(v);
        }
        case 'moodBelow': {
            const r = regionNow(g, w, x);
            return !!r && r.mood < Number(v);
        }
        default: return false;
    }
}
/* ---------- the pieces the keys read ---------- */
// (life goals) The skills a `skill: any …` or `skill: creative …` looks at.
const skillIds = (g, w, id) => (id === 'any' ? skillsOf(w, g).map(s => s.id) : SKILL_GROUPS[id] ?? []);
// An adult skill (Sensuality) counts only with adult content on.
const skillOn = (g, w, id) => !w.skills?.some(s => s.id === id && s.adult) || adultOn(g);
// Keepsakes you hold (different ids), and whether you hold every keepsake of a kind (`any`: of some kind).
const heldIds = (g) => Object.entries(g.player.keepsakes ?? {}).filter(([, n]) => Number(n) > 0).map(([id]) => id);
function fullSet(g, w, kind) {
    const held = new Set(heldIds(g)), kinds = new Set((w.keepsakes ?? []).map(k => k.kind).filter((k) => !!k));
    const full = (k) => { const all = (w.keepsakes ?? []).filter(x => x.kind === k); return all.length > 0 && all.every(x => held.has(x.id)); };
    return kind === 'any' ? [...kinds].some(full) : full(kind);
}
// Your rank in your job (1 is the first): at least a number, the middle, one (or N) below the top, the top; with
// "in N jobs", the best rank reached in that many different jobs (sim/tally.ts).
function rankHolds(g, w, v) {
    if (!systemOn(w, 'jobs'))
        return false;
    const m = v.match(RANK), what = m[1];
    if (m[2])
        return Object.values(bestRanks(g)).filter(r => r >= Number(what)).length >= Number(m[2]);
    const j = g.player.job, o = j && w.occupations.find(x => x.id === j.id);
    if (!j || !o)
        return false;
    const c = careerOf(g, trackOf(g, o)), total = c.open ? c.ranks.length + 1 : c.ranks.length; // (your track's top)
    const need = what === 'top' ? total : what === 'middle' ? Math.ceil(total / 2) : what.startsWith('top-') ? total - Number(what.slice(4)) : Number(what);
    return j.rank + 1 >= Math.max(1, need);
}
// The world's best kinds of home: the two whose dearest area costs most (one in a world with two kinds or fewer).
function topKinds(w) {
    const rent = (k) => Math.max(0, ...w.homes.zones.filter(z => z.kind === k).map(z => z.rent ?? 0));
    const kinds = Object.keys(w.homes.kinds ?? {}).sort((a, b) => rent(b) - rent(a));
    return kinds.slice(0, kinds.length > 2 ? 2 : 1);
}
// Your home: a kind, nobody living with you (`alone`), dearer than your first (`better`), one of the best kinds
// (`top`), lived in a season or a number of days.
function homeHolds(g, w, v) {
    const h = g.player.home, t = tally(g).home;
    if (!h)
        return false;
    const rent = (zone) => w.homes.zones.find(z => z.id === zone)?.rent ?? 0;
    switch (v.toLowerCase()) {
        case 'alone': return !Object.values(g.cast).some(r => r.homeWith === '__you');
        case 'better': return !!t && rent(h.zone) > rent(t.first);
        case 'top': return topKinds(w).includes(h.kind);
        case 'season': return !!t && g.day - t.since >= seasonDays(g);
        default: return /^\d+$/.test(v) ? !!t && g.day - t.since >= Number(v) : h.kind === v;
    }
}
// Someone with you as a couple: anyone (`any`), nobody (`none`), one who lives with you (`home`), or that status.
function partnerHolds(g, w, v) {
    const on = systemOn(w, 'romance');
    const list = on ? Object.keys(g.cast).filter(a => !!statusOf(g, a, YOU)) : [];
    if (v === 'none')
        return !list.length;
    if (v === 'any')
        return list.length > 0;
    if (v === 'home')
        return list.some(a => g.cast[a].homeWith === '__you');
    if (v === 'open')
        return list.some(a => styleOf(g, a) === 'open');
    if (/^\d+$/.test(v))
        return list.length >= Number(v);
    return list.some(a => statusOf(g, a, YOU) === v);
}
// How many of the people you know are at a level toward you (or closer), living on a map (or in an area), or working
// at a place where you're a regular.
function friendsHold(g, w, v) {
    const m = v.match(FRIENDS), n = Number(m[1]), level = m[2].toLowerCase(), map = m[3], atRegular = !!m[4];
    const onMap = (r) => {
        const zone = r.homeWith === '__you' ? g.player.home?.zone : r.home?.zone;
        const id = w.homes.zones.find(z => z.id === zone)?.map;
        return !!id && (id === map || w.maps.find(x => x.id === id)?.area === map);
    };
    const works = (r) => { const p = w.occupations.find(o => o.id === r.occupation)?.place; return !!p && isRegular(g, p); };
    return Object.values(g.cast).filter(r => r.met && levelHolds(g, w, r.avatar, level) && (!map || onMap(r)) && (!atRegular || works(r))).length >= n;
}
// The places a `visited` counts: real places (not a pin to another map, not private, not adult).
const visitable = (w) => w.places.filter(p => !p.link && !p.private && !p.adult);
const onMapOf = (w, p, map) => !!map && (p.map === map || w.maps.find(m => m.id === p.map)?.area === map);
/** The map `in home` means: the map your home is on ('' with no home). */
export const homeMap = (g, w) => w.homes.zones.find(z => z.id === g.player.home?.zone)?.map ?? '';
const mapArg = (g, w, a) => (a.toLowerCase() === 'home' ? homeMap(g, w) : a);
// Places you've been: one by id, a number of them, a number or all on a map (or your home's map), every place on some
// map (`map`), a place on every map (`maps`), every place (`all`); a regular at a place, or at a number of them
// (anywhere, or on a map).
function visitedHolds(g, w, v) {
    const m = v.match(VISITED);
    if (!m) {
        const r = v.match(PLACE_REGULAR);
        return r ? systemOn(w, 'living') && isRegular(g, r[1]) : beenTo(g, v);
    }
    const places = visitable(w), been = (id) => beenTo(g, id);
    const s = v.toLowerCase(), map = m[3] && mapArg(g, w, m[3]);
    if (m[1] && m[2])
        return systemOn(w, 'living') && places.filter(p => (!m[3] || onMapOf(w, p, map)) && isRegular(g, p.id)).length >= Number(m[1]);
    if (m[1] && m[3])
        return places.filter(p => onMapOf(w, p, map) && been(p.id)).length >= Number(m[1]);
    if (m[1])
        return placesBeen(g).length >= Number(m[1]);
    if (m[4]) {
        const on = places.filter(p => onMapOf(w, p, mapArg(g, w, m[4])));
        return on.length > 0 && on.every(p => been(p.id));
    }
    const maps = [...new Set(places.map(p => p.map))];
    if (s === 'map')
        return maps.some(id => places.filter(p => p.map === id).every(p => been(p.id)));
    if (s === 'maps')
        return maps.length > 0 && maps.every(id => places.some(p => p.map === id && been(p.id)));
    return places.length > 0 && places.every(p => been(p.id)); // all
}
// The world's threads (the people's storylines), and the ones you knew that ended well.
const threadsOf = (w) => w.cast.examples.flatMap(e => e.threads ?? []);
function helpedThreads(g, w) {
    return threadsOf(w).filter(t => { const s = threadState(g, t.id); return s?.known !== undefined && !!s.ended && !!t.endings?.find(e => e.id === s.ended)?.good; }).map(t => t.id);
}
// A life goal finished (its id; an old aspiration's too), one of its steps done (`idol 3`), or a number of goals
// finished. sim/goals.ts keeps `g.goals.done` (ids) and `g.goals.steps` (steps done per goal).
function goalHolds(g, w, v) {
    if (!systemOn(w, 'goals'))
        return false;
    const st = g.goals;
    const done = new Set([...(st?.done ?? []), ...(g.player.aspDone ?? []).map(id => FOLDED_GOALS[id] ?? id)]);
    if (/^\d+$/.test(v))
        return done.size >= Number(v);
    const [raw, n] = v.split(/\s+/), id = FOLDED_GOALS[raw] ?? raw;
    return done.has(id) || (n !== undefined && (st?.steps?.[id] ?? 0) >= Number(n));
}
// The home zone of a place: your home's, or the home of the person whose home it is (someone living with another
// person is at that person's home); '' for a place that isn't a home.
function zoneOf(g, place, depth = 0) {
    if (place === 'home:player')
        return g.player.home?.zone ?? '';
    if (!place.startsWith('home:') || depth > 3)
        return '';
    const r = g.cast[place.slice(5)];
    if (!r)
        return '';
    const with_ = r.homeWith;
    if (with_ === '__you')
        return zoneOf(g, 'home:player', depth + 1);
    if (with_ && with_ !== r.avatar && g.cast[with_])
        return zoneOf(g, `home:${with_}`, depth + 1);
    return r.home?.zone ?? '';
}
// One of the world's people by name (the full name, or the first one: "Kyōko" for Kyōko Shirai; accents and case
// don't matter). A full name wins over a first name.
const plain = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
export function personNamed(g, name) {
    const n = plain(name), all = Object.values(g.cast);
    return all.find(r => plain(r.name ?? '') === n) ?? all.find(r => plain(r.name ?? '').split(/\s+/)[0] === n);
}
/** Is someone toward you at this level or closer (a friendship tier, a romance tier, a couple status)? Below Stranger,
 *  a level means that bad or worse. Romance levels and statuses need the romance system. */
export function levelHolds(g, w, avatar, level) {
    const ft = FRIEND_TIERS.find(t => t.id === level);
    if (ft) {
        const v = Math.round(fr(g, avatar, YOU));
        return ft.lo >= 0 ? v >= ft.lo : v < ft.hi;
    }
    if (!systemOn(w, 'romance'))
        return false;
    const rt = ROMANCE_TIERS.find(t => t.id === level);
    if (rt)
        return Math.round(ro(g, avatar, YOU)) >= rt.lo;
    const s = statusOf(g, avatar, YOU), i = STATUS_LEVELS.indexOf(level);
    return i >= 0 && !!s && STATUS_LEVELS.indexOf(s) >= i;
}
// Here now (as everyone else sees it), or at another moment by their routine.
const isHere = (g, w, r, x) => (x.at === nowAbs(g) ? presentAt(g, w, x.place).includes(r) : routineAt(g, w, r, x.at) === x.place);
// At work here: here, and their day says work here (a shift of a job with a schedule, their routine's work hours for
// one without, or working late).
function atWork(g, w, r, x) {
    return systemOn(w, 'jobs') && workingAt(g, w, r, x.at) === x.place && isHere(g, w, r, x);
}
// A thread's state (sim/threads.ts): `known` the day the player learned it, `ended` how it ended.
const threadState = (g, id) => g.threads?.[id];
/** How many favors someone (a name of the world's people, or a stranger's id) owes you (sim/stories.ts keeps them,
 *  by a person's avatar or the stranger's id). */
export function favorOwed(g, who) {
    const f = g.stories?.favors;
    if (!f)
        return 0;
    const r = personNamed(g, who);
    return (r ? f[r.avatar] : undefined) ?? f[who] ?? 0;
}
/** Has `id` been done today (at `place`, or anywhere)? */
export function doneToday(g, id, place, day = g.day) {
    const d = g.done;
    return !!d && d.day === day && d.list.some(x => (place ? x === `${id}@${place}` : x.startsWith(`${id}@`)));
}
/** Remember that `id` was done at `place` today. */
export function markDone(g, id, place = g.player.loc) {
    const d = (g.done ??= { day: g.day, list: [] });
    if (d.day !== g.day) {
        d.day = g.day;
        d.list = [];
    }
    if (!d.list.includes(`${id}@${place}`))
        d.list.push(`${id}@${place}`);
}
/* ---------- for the rumors ---------- */
/** The place a condition names (its first `place`), if any: where a world rumor's weather is looked up. */
export function whenPlace(when) {
    if (when && typeof when === 'object')
        return when.place;
    return parseWhen(when).conds.find(c => c.key === 'place' && !c.not)?.values[0];
}
/** Does a region meet the condition's `region` parts (none: any region)? Who starts a world rumor. */
export const whenRegionOk = (when, region) => parseWhen(when).conds.filter(c => c.key === 'region').every(c => c.values.includes(region) !== c.not);
