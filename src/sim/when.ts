// Conditions: one evaluator for every `when` in a world: conditional lore and world rumors now, and the actions,
// street stories, work events and rituals that come with Tokyo. A condition is text in one grammar (core/world.ts,
// `When`): `period: evening or night; weekday: fri; feels: Kyōko friend`, parsed once and kept. Worlds from before
// give an object (`LoreWhen`), read exactly as the old lore code read it (a period by its name, in the same order).
// Keys whose data the engine doesn't keep yet hold false until their system writes it: `stayed` (E6 writes
// `player.stayed`), `holds` (E14 writes `player.keepsakes`). The story so far is read straight from the save, so this
// file needs neither module: `knows` and `thread` (sim/threads.ts keeps `g.threads`), `seen` and `favor`
// (sim/stories.ts keeps `g.stories`); `perf` reads the player's job (sim/work.ts keeps `player.job.perf`); `course`
// reads the courses finished (sim/courses.ts keeps `player.learning.done`); `degree` reads the degree you study for and
// those you finished (sim/degrees.ts keeps `g.uni`).
// Life goals' keys (their steps are conditions, and actions, jobs and stories can ask for a goal): states, true as soon
// as they hold (`rank`, `money`, `home`, `partner`, `friends`, `visited`, `secrets`, `helped`, `goal`, `need`, `rep`),
// and counts (`did`, `attended`) read from sim/tally.ts's lifetime counters, or from the asker's own counts
// (`WhenCtx.count`: a goal counts only while it's active); `did: overnight with best` counts only what was done with
// someone at that level toward you now. `goal` reads `g.goals` (sim/goals.ts keeps it) and the old
// aspirations finished (`player.aspDone`).
// Business: `venture: cafe [tier 2 | <style>]` and `upgrade: <id>` read the ventures you own (`g.ventures`, kept by
// sim/ventures.ts); `inrank: 42` the days in your current rank (`player.job.since`), for an executive's gate;
// (hospitality) `venture:` names a kind too (`ryokan`), `tenant: Tsubaki [ryokan]` someone renting a room of yours,
// `kept: 3` secrets kept at your hotels' desks.
// The shop: `owns: bike` an item you have, `owns: cat:vehicle [2]` that many things of a category (sim/shop.ts).
// Letting (housing): `let: 3` that many of your homes let now (a tenant's agreement, notice included), `rent: 1440000`
// at least that much rent had from your tenants in all (after the agent's share), read from `g.houses` (sim/housing.ts).
// (track 7, the end game's life goals) `home: owned` (you live in a home you own) and `home: second`; `fixtures: 6` rooms
// and fixtures bought for your homes; `owns: 20` things of the shop's you have, `owns: cat:all` something of every kind
// it sells (not gifts, never adult); `venture: 2 hotel [tier top]`, `venture: cafe tier top`, `venture: cafe discoveries 3`;
// `board: 1` seasons a division met the board's target; (collection) `piece: halls 3`, `piece: all in <group>`,
// `record: 50%` and `record: all in <record hall>`.
import { nowAbs, adultOn, type Save, type Resident, residentsOf, residentIds } from '../core/store.js';
import { systemOn, activeStatuses, WEEKDAY_IDS, type WorldDef, type When, type LoreWhen, type Thread } from '../core/world.js';
import { FOLDED_GOALS, SKILL_GROUPS } from '../core/goals.js';
import { FRIEND_LEVELS, ROM_LEVELS } from '../core/feel.js';
import { period, isWeekend, seasonDays, SEASONS } from './time.js';
import { weatherIs, regionOf, regionState } from './worldstate.js';
import { festivalsOn } from './festivals.js';
import { eventsOn, liveEvents } from './cityevents.js';
import { routineAt, workingAt } from './people.js';
import { visitsTo } from './daylife.js';
import { levelOf, skillsOf, skillName } from './hobbies.js';
import { fr, ro, statusOf, relOf, idOf, YOU } from './rel.js';
import { FRIEND_TIERS, ROMANCE_TIERS } from './romance.js';
import { companions } from './social.js';
import { tallyOf, beenTo, placesBeen, bestRanks, tally, isRegular, TALLY_EVENTS, TALLY_PREFIXES } from './tally.js';
import { careerOf, trackOf, playerTrack } from './work.js';
import { styleOf, knownCount, knownOf } from './intimacy.js';
import { usualPay, money } from './needs.js';
import { courseOf } from './courses.js';
import { myJob, rankOf } from './work.js';
import { exampleOf } from './dayplan.js';
import { REP_WORDS } from './standing.js';
import { haveItem, ownedDefs, catOf, shopItems, SHOP_CATS } from './shop.js';
import { collectionLink, placeGates, photoLink, industryLink } from './hooks.js';
import { homeWorth, housingOn, ownedHere, ownedHomes, secondHome, toLet, isLet, rentHad } from './housing.js';
import { sceneAt } from './homerooms.js';

/** (photography) The photo gigs' keys (sim/photo.ts answers them through `photoLink`), and the kinds `photos:` takes. */
export const PHOTO_KEYS: string[] = ['photorep', 'portfolio', 'contact', 'photobook', 'photos', 'studio', 'freelance'];
/** (adult industry) The industry's keys (sim/industry.ts and sim/stance.ts answer them through `industryLink`). */
export const INDUSTRY_KEYS: string[] = ['titles', 'chart', 'fame', 'stance', 'seat'];
export const PHOTO_DONE = ['wedding', 'festival', 'event', 'magazine', 'portrait', 'stock'];
export const WHEN_KEYS = ['period', 'weekday', 'weekend', 'season', 'seasonDays', 'weather', 'festival', 'event', 'place', 'zone', 'region',
    'daily', 'regular', 'skill', 'feels', 'onShift', 'present', 'after', 'job', 'start', 'chance', 'clock', 'stayed', 'holds', 'companion',
    'knows', 'seen', 'thread', 'favor', 'perf', 'gave', 'course',
    'rank', 'track', 'path', 'gender', 'money', 'home', 'partner', 'friends', 'did', 'visited', 'attended', 'secrets', 'helped', 'goal', 'need', 'rep', 'known', 'degree',
    'venture', 'upgrade', 'inrank', 'tenant', 'kept', 'owns', 'had', 'piece', 'museum', 'tier', 'sales', 'dealer', 'dig', 'let', 'rent',
    'fixtures', 'board', 'record', 'photorep', 'portfolio', 'contact', 'photobook', 'photos', 'studio', 'freelance',
    'titles', 'chart', 'fame', 'stance', 'seat'] as const;
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
// life goals' values (sim/tally.ts, core/goals.ts)
const SKILL = /^(\S+)\s+(\d+)(?:\s+x(\d+))?$/i;                            // cooking 3 · any 5 x3 · creative 5 x2
const RANK = /^(\d+|top|middle|top-\d+)(?:\s+in\s+(\d+)\s+jobs?)?$/i;       // 2 · middle · top-1 · top · 2 in 3 jobs
const MONEY = /^(\d+(?:\.\d+)?)(?:\s+(weeks?|months?|years?))?$|^fortune$/i;
const FRIENDS = /^(\d+)\s+(\S+)(?:\s+(?:in\s+(\S+)|at\s+(regular)))?$/i;    // 3 good · 2 good in yokohama · 1 good at regular
const COUNTED = /^([^\s,;]+)(?:\s+(\d+(?:\.\d+)?))?$/;                      // meal 15 · tag:karaoke 3 · ramen_contest
const DID = /^([^\s,;]+)(?:\s+(\d+(?:\.\d+)?))?(?:\s+with\s+(\S+))?$/i;      // overnight 2 with best: only with someone at that level now
const DEGREE = /^(?:any|graduated|distinction|scholarship|club|term\s+\d+|gpa\s+\d+(?:\.\d+)?)$/i;   // term 3 · gpa 2.5
// cafe · cafe tier 2 · cafe as_it_was · any; (track 7) 2 hotel · 2 hotel tier top · cafe tier top · cafe discoveries 3
const VENTURE = /^(?:(\d+)\s+)?([^\s,;]+)(?:\s+(?:tier\s+(\d+|top)|discoveries\s+(\d+)|([^\s,;]+)))?$/i;
const OWNS = /^(?:cat:([^\s,;]+)(?:\s+(\d+))?|[^\s,;:]+)$/i;                  // bike · cat:vehicle · cat:fashion 3 · (track 7) 20 · cat:all
const VISITED = /^(?:(\d+)(?:\s+(regular))?(?:\s+in\s+(\S+))?|all(?:\s+in\s+(\S+))?|map|maps)$/i;   // 3 regular in home
/** `visited: pk_arcade regular`: a regular at that place. */
export const PLACE_REGULAR = /^([^\s,;]+)\s+regular$/i;
/** `partner:` values besides a number (`partner: 2`: two partners or more, casual ones included). `open`: a partner
 *  whose relationship style is open (their own, else the world's open relationships). */
export const PARTNER_VALUES = ['any', 'none', 'home', 'casual', 'dating', 'engaged', 'married', 'open'];
/** The money `money: 2 weeks` means: weeks of the world's usual pay (40 hours), or the old aspiration's fortune. */
export function moneyAmount(w: WorldDef, v: string): number {
    if (v.toLowerCase() === 'fortune') return usualPay(w) * 3125;
    const m = v.match(MONEY); if (!m) return Infinity;
    const n = Number(m[1]), u = (m[2] ?? '').toLowerCase().replace(/s$/, '');
    return u === 'week' ? n * usualPay(w) * 40 : u === 'month' ? n * usualPay(w) * 40 * 52 / 12 : u === 'year' ? n * usualPay(w) * 40 * 52 : n;
}
/** The counter a counted value reads (`did: tag:karaoke 3` → `tag:karaoke`; an engine moment's name → `event:…`, any
 *  other name → `action:…`; `attended` → `festival:…` or `cityevent:…`, `any` → both). */
export function countKey(w: WorldDef | null | undefined, key: 'did' | 'attended', what: string): string {
    if (key === 'attended') return what === 'any' ? 'attended:any' : w?.festivals?.some(f => f.id === what) ? `festival:${what}` : `cityevent:${what}`;
    if (what.indexOf(':') > 0) return what;
    return (TALLY_EVENTS as readonly string[]).includes(what) ? `event:${what}` : `action:${what}`;
}

/** A counted value read into its parts: what is counted, how many times, and (`did` only) the level toward you of the
 *  people it must have been done with (`did: overnight with best`: counted per person, sim/tally.ts). */
export function countedOf(key: 'did' | 'attended', v: string): { what: string; n: number; with?: string } | null {
    const m = v.match(key === 'did' ? DID : COUNTED);
    return m ? { what: m[1], n: Number(m[2] ?? 1), ...(m[3] ? { with: m[3].toLowerCase() } : {}) } : null;
}

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
        case 'skill': return SKILL.test(v) ? '' : `"${v}" should be a skill and a level, like cooking 3 (or any 5 x3: three skills at 5)`;
        case 'rank': { const m = v.match(RANK); return m && (!m[2] || /^\d+$/.test(m[1])) ? '' : `"${v}" should be a rank (2, middle, top-1, top), or a rank in a number of jobs (2 in 3 jobs)`; }
        case 'money': return MONEY.test(v) ? '' : `"${v}" should be an amount, a time of the usual pay (2 weeks, 6 months) or fortune`;
        case 'home': return ID.test(v) ? '' : `"${v}" should be a kind of home, alone, better, top, season or a number of days`;
        case 'partner': return PARTNER_VALUES.includes(v.toLowerCase()) || /^\d+$/.test(v) ? '' : `"${v}" should be any, none, home, casual, dating, engaged, married, open or a number of partners`;
        case 'friends': { const m = v.match(FRIENDS); return m && LEVELS.includes(m[2].toLowerCase()) ? '' : `"${v}" should be a number and a level, like 3 good (or 2 good in a map)`; }
        case 'did': {
            const m = v.match(DID), p = m && m[1].includes(':') ? m[1].slice(0, m[1].indexOf(':')) : '';
            return m && (!p || (TALLY_PREFIXES as readonly string[]).includes(p)) && (!m[3] || LEVELS.includes(m[3].toLowerCase())) ? ''
                : `"${v}" should be an action, a tag:…, a moment (meal, party…) and how many times (and "with" a level: overnight with best)`;
        }
        case 'attended': return COUNTED.test(v) && !v.includes(':') ? '' : `"${v}" should be a festival or an event, and how many times`;
        case 'visited': return VISITED.test(v) || ID.test(v) || PLACE_REGULAR.test(v) ? '' : `"${v}" should be a place (or a place and regular), a number of places (3 in a map, 3 regular in home), all, map or maps`;
        case 'secrets': return /^\d+$/.test(v) ? '' : `"${v}" should be a number of secrets`;
        case 'known': return KNOWN.test(v) ? '' : `"${v}" should be a number of likes and limits you know (of your lovers, or of one person: Tamaki 5; "likes" or "limits" after it counts only those)`;
        case 'helped': return ID.test(v) ? '' : `"${v}" should be a number of storylines, or a storyline's id`;
        case 'goal': return /^[^\s,;]+(\s+\d+)?$/.test(v) ? '' : `"${v}" should be a goal, a goal and a step (idol 3), or a number of goals`;
        case 'need': return /^\S+\s+\d+$/.test(v) ? '' : `"${v}" should be a need (or all) and a value, like mood 50`;
        case 'rep': return /^-?\d+$/.test(v) || REP_WORDS.some(([, n]) => n === v.toLowerCase()) ? '' : `"${v}" should be a reputation (known, respected, renowned…) or a number`;
        case 'chance': { const p = chanceOf(v); return Number.isFinite(p) && p >= 0 && p <= 1 ? '' : `"${v}" should be between 0 and 1`; }
        case 'clock': return CLOCK.test(v) ? '' : `"${v}" should be hours like 19:00-20:00`;
        case 'companion': return v.toLowerCase() === 'yes' || LEVELS.includes(v.toLowerCase()) ? '' : `"${v}" is not a level (friend, crush, dating…)`;
        case 'feels': return splitLevel(v)[0] ? '' : 'a name is missing';
        case 'course': return ID.test(v) ? '' : `"${v}" should be a course id, or a number of courses`;
        case 'degree': return DEGREE.test(v) ? '' : `"${v}" should be any, term and a number, gpa and a number, scholarship, club, graduated or distinction`;
        case 'festival': case 'event': case 'place': case 'zone': case 'region': case 'after': case 'job': case 'start': case 'stayed': case 'holds': case 'gave': case 'knows': case 'track': case 'gender': case 'path':
            return ID.test(v) ? '' : `"${v}" should be one id`;
        case 'seen': return /^[^\s,;:]+(:\d+)?$/.test(v) || SEEN_ALL.test(v) ? '' : `"${v}" should be a story id (or a work event's), or one and a choice like sb_startup_st_pitch:2, or all in a map`;
        case 'had': return HAD.test(v) ? '' : `"${v}" should be a keepsake id, all and a keepsake kind (all charm), or a number of keepsakes`;
        case 'piece': return PIECE.test(v) ? '' : `"${v}" should be a piece id, a number of pieces, or a number (or all) in a hall, like 10 in art`;
        case 'museum': return MUSEUM.test(v) ? '' : `"${v}" should be open, show, renown and a level, shows and a number, a percentage (50%), or an upgrade id`;
        case 'tier': return TIER.test(v) ? '' : `"${v}" should be a name and a tier, like Tamaki 2`;
        case 'sales': return SALES.test(v) ? '' : `"${v}" should be won, lots or resold and a number, like won 3`;
        case 'dig': return DIG.test(v) ? '' : `"${v}" should be seasons, days or found and a number, like seasons 1`;
        case 'dealer': return DEALER.test(v) ? '' : `"${v}" should be spent and an amount, or bought, asked or visits and a number, like spent 2000000`;
        case 'thread': return /^[^\s,;]+(\s+[^\s,;]+)?$/.test(v) ? '' : `"${v}" should be a thread id, or a thread id and how it ended`;
        case 'venture': return VENTURE.test(v) ? '' : `"${v}" should be a venture (or any), or one and a tier, tier top, discoveries or a style, like cafe tier 2, or how many first, like 2 hotel`;
        case 'upgrade': return ID.test(v) ? '' : `"${v}" should be one upgrade id`;
        case 'inrank': return /^\d+$/.test(v) ? '' : `"${v}" should be a number of days in your rank`;
        case 'tenant': return /^[^,;]+$/.test(v) ? '' : `"${v}" should be a name, or a name and a venture, like Tsubaki ryokan`;
        case 'owns': { const m = v.match(OWNS); return m && (!m[1] || m[1].toLowerCase() === 'all' || SHOP_CATS.some(c => c.id === m[1].toLowerCase())) ? '' : `"${v}" should be an item id, or cat: and a category (and how many), like cat:vehicle 2`; }
        case 'kept': return /^\d+$/.test(v) ? '' :`"${v}" should be a number of secrets kept at your hotels`;
        case 'let': return /^\d+$/.test(v) ? '' : `"${v}" should be a number of homes let`;
        case 'rent': return /^\d+$/.test(v) ? '' : `"${v}" should be an amount of rent had from your tenants`;
        case 'fixtures': return /^\d+$/.test(v) ? '' : `"${v}" should be a number of rooms and fixtures`;
        case 'board': return /^\d+$/.test(v) ? '' : `"${v}" should be a number of seasons on the board's target`;
        case 'record': return RECORD.test(v) ? '' : `"${v}" should be a percentage (50%), or a number (or all) in a record hall, like all in cabinet`;
        // (photography)
        case 'photorep': return /^\d+$/.test(v) && Number(v) <= 100 ? '' : `"${v}" should be a photo reputation from 0 to 100`;
        case 'portfolio': return /^\d+$/.test(v) ? '' : `"${v}" should be a number of portfolio pieces`;
        case 'photobook': return /^\d+$/.test(v) ? '' : `"${v}" should be a number of photobooks published`;
        case 'contact': return ID.test(v) ? '' : `"${v}" should be one client id`;
        case 'photos': return /^\d+$/.test(v) || PHOTO_DONE.includes(v.toLowerCase()) ? '' : `"${v}" should be a number of deliveries, or a kind: ${PHOTO_DONE.join(', ')}`;
        case 'studio': return ['any', 'cyc', 'dressing'].includes(v.toLowerCase()) ? '' : `"${v}" should be any, cyc or dressing`;
        case 'freelance': return ['any', 'blessing', 'fallout'].includes(v.toLowerCase()) ? '' : `"${v}" should be any, blessing or fallout`;
        // (adult industry)
        case 'titles': return /^([^\s,;]+\s+)?\d+$/.test(v) ? '' : `"${v}" should be a number of titles, or a seat (perform, direct, label) or a label's id and a number, like perform 3`;
        case 'chart': return /^([^\s,;]+\s+)?top\s+\d+$/i.test(v) ? '' : `"${v}" should be top and a number, like top 10 (a seat or a label's id first if wanted)`;
        case 'fame': return /^\d+$/.test(v) && Number(v) <= 100 ? '' : `"${v}" should be a fame from 0 to 100`;
        case 'stance': return /^\S.*\s+(fine|uneasy|no)$/i.test(v) ? '' : `"${v}" should be a name and fine, uneasy or no, like Naomi fine`;
        case 'seat': return /^(perform|direct|label)$/i.test(v) ? '' : `"${v}" should be perform, direct or label`;
        default: return '';   // period (a name may have spaces in older worlds), weather, present, onShift
    }
}
const tidy = (key: WhenKey, v: string) => (key === 'weekday' ? weekdayOf(v)! : ['weekend', 'daily'].includes(key) ? (YES.includes(v.toLowerCase()) ? 'yes' : 'no') : ['season', 'companion', 'partner', 'rep', 'rank', 'money', 'degree'].includes(key) ? v.toLowerCase() : v);

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
/** The world's people and threads a condition names (`feels`, `present`, `onShift`, `favor`; `knows`, `thread`,
 *  `helped` with an id): a life goal's step that names any needs another way to be done (D-4), and isn't offered in a
 *  game without them. */
export function namedIn(when: When | null | undefined): { people: string[]; threads: string[] } {
    const people: string[] = [], threads: string[] = [];
    for (const c of parseWhen(when).conds) for (const v of c.values) {
        if (c.key === 'feels') people.push(splitLevel(v)[0]);
        else if (c.key === 'present' || c.key === 'onShift' || c.key === 'favor') people.push(v);
        else if (c.key === 'knows' || c.key === 'thread' || (c.key === 'helped' && !/^\d+$/.test(v))) threads.push(v.split(/\s+/)[0]);
    }
    return { people, threads };
}
/** Why a condition can't be read ('' when it can): for the world creator and the world checks. */
export const whenError = (when: When | null | undefined) => parseWhen(when).error ?? '';

/* ---------- what holds ---------- */

/** Where and when a condition is asked about. `place`: default where the player is; `at`: absolute game minutes,
 *  default now. `key`: a salt of the asker's own for `chance` (each entry rolls its own dice, the same all day).
 *  `id`: what asks (an action), for `daily`. `day`: only what holds for the whole day (a rumor starting): the moment's
 *  and the place's keys are left out. `chance`: the chance when the condition gives none (world rumors: 0.25).
 *  `count`: what a counted key (`did`, `attended`) reads for a counter of sim/tally.ts (`event:meal`, `tag:karaoke`…;
 *  `countKey()` makes the key): a life goal passes the counts it has made while active; missing: the lifetime count. */
export interface WhenCtx { place?: string; at?: number; key?: string; id?: string; day?: boolean; chance?: number; count?: (key: string) => number }
const MOMENT_KEYS = new Set<Cond['key']>(['period', 'clock', 'place', 'zone', 'region', 'present', 'onShift', 'companion', 'after', 'daily', 'regular']);
interface Here { place: string; at: number; day: number; minutes: number; key: string; id?: string; whole: boolean; old: boolean; conds: Cond[]; count?: (key: string) => number }

const warned = new Set<string>();
/** Does the condition hold? None (or an empty one) always holds; one that can't be read never does. */
export function whenHolds(g: Save, w: WorldDef, when: When | null | undefined, ctx: WhenCtx = {}): boolean {
    const p = parseWhen(when);
    if (p.error) {
        if (!warned.has(String(when))) { warned.add(String(when)); console.warn('[Mundi] condition not understood:', when, '·', p.error); }
        return false;
    }
    const at = ctx.at ?? nowAbs(g);
    const x: Here = { place: ctx.place ?? g.player.loc, at, day: Math.floor(at / 1440), minutes: ((at % 1440) + 1440) % 1440, key: ctx.key ?? '', id: ctx.id, whole: !!ctx.day, old: !!p.old, conds: p.conds, count: ctx.count };
    let rolls = 0;
    for (const c of p.conds) {
        if (ctx.day && MOMENT_KEYS.has(c.key)) continue;
        // each `chance` rolls its own dice (the first one with the asker's salt, as the old lore did)
        const hit = c.key === 'chance' ? roll(g, x, chanceOf(c.values[0]), rolls++) : c.key === 'thread' && !c.not ? threadHolds(g, w, c.values, x) : c.values.some(v => holds(g, w, c.key, v, x));
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
            const m = v.match(SKILL)!, id = m[1], n = Number(m[2]), many = Number(m[3] ?? 1);
            if (id !== 'any' && !SKILL_GROUPS[id]) return many <= 1 && skillOn(g, w, id) && levelOf(g, id) >= n;
            return skillIds(g, w, id).filter(s => levelOf(g, s) >= n).length >= many;
        }
        case 'feels': { const [name, level] = splitLevel(v); const r = personNamed(g, name); return !!r && (level ? levelHolds(g, w, r.avatar, level) : !!r.met); }
        case 'present': { const r = personNamed(g, v); return !!r && isHere(g, w, r, x); }
        case 'onShift': { const r = personNamed(g, v); return !!r && atWork(g, w, r, x); }
        case 'after': return doneToday(g, v, x.place, x.day);
        case 'job': { const j = g.player.job; const o = j && w.occupations.find(o => o.id === j.id); return !!j && (v === 'here' ? !!o && trackOf(g, o).place === x.place : v === 'any' || j.id === v); }
        // the track you work your job on (a job with tracks: sim/tracks.ts)
        case 'track': { const j = g.player.job, o = j && w.occupations.find(o => o.id === j.id); return !!o && playerTrack(g, o) === v; }
        // a career path you took in the job you hold (a branch option's id: `path: adult`)
        case 'path': { const j = g.player.job as { path?: string[] } | null; return !!j && (j.path ?? []).includes(v); }
        // your gender (a gender id: woman, man, nonbinary, or one of the world's own)
        case 'gender': return relOf(g).people[idOf(g, YOU)]?.gender === v;
        case 'start': return ((g.player as any).start ?? g.player.origin) === v;
        case 'clock': return inClock(x.minutes, v);
        case 'stayed': { const s = (g.player as any).stayed as { place: string; day: number } | undefined; return !!s && s.place === v && s.day === x.day; }
        // a keepsake you have; a number: that many different ones; `kind:<kind>` (`kind:any`): every keepsake of that kind
        case 'holds': return /^\d+$/.test(v) ? heldIds(g).length >= Number(v) : v.startsWith('kind:') ? fullSet(g, w, v.slice(5)) : Number((g.player as any).keepsakes?.[v] ?? 0) > 0;
        // someone here has this keepsake from you (a gift)
        case 'gave': return Object.entries<string[]>((g as any).social?.given ?? {}).some(([a, ids]) => ids.includes(v) && !!g.cast[a] && isHere(g, w, g.cast[a], x));
        case 'companion': return companions(g).some(a => v === 'yes' || levelHolds(g, w, a, v));
        // the story so far (E22, E17, E28)
        case 'knows': return !!threadState(g, v)?.known;
        case 'thread': { const [id, how] = v.split(/\s+/); const t = threadState(g, id); return !!t?.ended && (!how || t.ended === how); }
        case 'seen': { const all = v.match(SEEN_ALL); if (all) return collectionLink.storiesDone(g, w, all[1]);
            const [id, n] = v.split(':'); const s = (g as any).stories?.seen?.[id] ?? (g.player.job as any)?.seen?.[id]; return !!s && (!n || (s.choice === Number(n) - 1 && s.ok !== false)); }
        case 'favor': return favorOwed(g, v) > 0;
        // a course finished (its id), or at least this many courses (a number)
        case 'course': { if (!systemOn(w, 'courses')) return false; const done: string[] = (g.player as any).learning?.done ?? []; return /^\d+$/.test(v) ? done.length >= Number(v) : done.includes(v); }
        case 'degree': return degreeHolds(g, w, v);
        // the player's performance at their job, at least this (a rank that asks for a high performance)
        case 'perf': { const j = g.player.job as { perf?: number } | null; return !!j && Math.round(j.perf ?? 50) >= Number(v); }
        // life goals (see the top of the file)
        case 'rank': return rankHolds(g, w, v);
        case 'money': return g.player.money >= moneyAmount(w, v);
        case 'home': return homeHolds(g, w, v);
        case 'partner': return partnerHolds(g, w, v);
        case 'friends': return friendsHold(g, w, v);
        case 'did': case 'attended': {
            const c = countedOf(key, v)!, k = countKey(w, key, c.what), n = (id: string) => (x.count ? x.count(id) : tallyOf(g, id));
            // with someone at a level: what was counted with each of them (`<key>|<avatar>`), for those at it now
            const have = c.with ? residentsOf(g).filter(r => r.met && levelHolds(g, w, r.avatar, c.with!)).reduce((a, r) => a + n(`${k}|${r.avatar}`), 0) : n(k);
            return have >= c.n;
        }
        case 'visited': return visitedHolds(g, w, v);
        // (adult) how many likes and hard limits you know of your lovers, in all (a state: counted at once, as skill: is)
        case 'known': { const k = knownHave(g, v); return adultOn(g) && !!k && k.have >= k.need; }
        case 'secrets': return Object.values<{ known?: number }>((g as any).threads ?? {}).filter(t => t?.known !== undefined).length >= Number(v);
        case 'helped': return /^\d+$/.test(v) ? helpedThreads(g, w).length >= Number(v) : helpedThreads(g, w).includes(v);
        case 'goal': return goalHolds(g, w, v);
        case 'need': { const [id, n] = v.split(/\s+/); const on = activeStatuses(w, g).filter(s => !s.rpg); const val = (sid: string) => g.player.stats[sid] ?? on.find(s => s.id === sid)!.start;
            return id === 'all' ? on.length > 0 && on.every(s => val(s.id) >= Number(n)) : on.some(s => s.id === id) && val(id) >= Number(n); }
        case 'rep': { if (!systemOn(w, 'reputation')) return false; const min = /^-?\d+$/.test(v) ? Number(v) : REP_WORDS.find(([, n]) => n === v)![0];
            return Object.values<{ v: number }>((g as any).rep ?? {}).some(r => r.v >= min); }
        // the old object form's own keys
        case 'venture': return ventureHolds(g, w, v);
        case 'upgrade': return systemOn(w, 'business') && ventureList(g).some(s => (s.owned ?? []).includes(v));
        case 'inrank': { const j = g.player.job as { since?: number } | null; return !!j && systemOn(w, 'jobs') && (nowAbs(g) - (j.since ?? nowAbs(g))) / 1440 >= Number(v); }
        case 'tenant': return tenantHolds(g, w, v);
        case 'kept': return systemOn(w, 'business') && ventureList(g).reduce((n, s) => n + (s.kept ?? 0), 0) >= Number(v);
        case 'owns': return ownsHolds(g, w, v);
        case 'let': return housingOn(w) && toLet(g).filter(isLet).length >= Number(v);
        case 'rent': return housingOn(w) && rentHad(g) >= Number(v);
        case 'fixtures': return housingOn(w) && fixturesBought(g) >= Number(v);
        case 'board': return systemOn(w, 'business') && boardMet(g) >= Number(v);
        case 'record': return collectionLink.record(g, w, v);
        case 'photorep': case 'portfolio': case 'contact': case 'photobook': case 'photos': case 'studio': case 'freelance': return photoLink.holds(g, w, key, v);
        case 'titles': case 'chart': case 'fame': case 'stance': case 'seat': return industryLink.holds(g, w, key, v);   // (adult industry)
        case 'had': return hadHolds(g, w, v);
        case 'piece': return collectionLink.piece(g, w, v);
        case 'museum': return collectionLink.museum(g, w, v);
        case 'tier': return tierHolds(g, v);
        case 'sales': case 'dealer': return collectionLink.market(g, w, key, v);
        case 'dig': return collectionLink.dig(g, w, v);
        case 'fromDay': return x.day >= Number(v);
        case 'toDay': return x.day <= Number(v);
        case 'tensionAbove': { const r = regionNow(g, w, x); return !!r && r.tension > Number(v); }
        case 'moodAbove': { const r = regionNow(g, w, x); return !!r && r.mood > Number(v); }
        case 'moodBelow': { const r = regionNow(g, w, x); return !!r && r.mood < Number(v); }
        default: return false;
    }
}

/* ---------- the pieces the keys read ---------- */

// (business) The ventures you own (sim/ventures.ts keeps `g.ventures`, read here so this file needs no venture code):
// `cafe` one you own, `any` any of them, `cafe tier 2` at that tier or past it, `cafe as_it_was` with that style
// (chosen at any tier and not changed since: the love hotel's window after its floors are themed).
const ventureList = (g: Save): { id: string; tier?: number; style?: string; styles?: Record<number, string>; owned?: string[]; disc?: string[]; closed?: number; kept?: number; tenants?: { who: string }[]; verdicts?: { got: number; want: number }[] }[] => ((g as any).ventures?.list ?? []).filter((s: any) => s && !s.closed);
// (a venture's id, its track or its kind: `cafe` for either café, `hotel` for any hotel, `ryokan` for the ryokan)
const ventureIs = (w: WorldDef, s: { id: string }, id: string) => { if (id === 'any' || s.id === id) return true; const d = w.ventures?.find(x => x.id === s.id); return d?.track === id || d?.kind === id; };
function ventureHolds(g: Save, w: WorldDef, v: string): boolean {
    if (!systemOn(w, 'business')) return false;
    const m = v.trim().match(VENTURE); if (!m) return false;
    return venturesLike(g, w, m).length >= Number(m[1] ?? 1);
}
// (track 7) The ventures of yours a `venture:` value names: of that sort, at that tier (`top`: its last), with that many
// discoveries, in that style.
function venturesLike(g: Save, w: WorldDef, m: RegExpMatchArray) {
    const [, , id, tier, disc, style] = m;
    const last = (s: { id: string }) => w.ventures?.find(x => x.id === s.id)?.tiers?.length ?? 1;
    return ventureList(g).filter(s => ventureIs(w, s, id)
        && (tier === undefined || (s.tier ?? 1) >= (tier.toLowerCase() === 'top' ? last(s) : Number(tier)))
        && (disc === undefined || (s.disc?.length ?? 0) >= Number(disc))
        && (style === undefined || s.style === style || Object.values(s.styles ?? {}).includes(style)));
}
// (track 7) What a `venture:` value with a number, a top tier or discoveries asks, in words.
const TRACK_WORDS: Record<string, [string, string]> = { cafe: ['café', 'cafés'], hotel: ['hotel', 'hotels'], exec: ['division', 'divisions'] };
function ventureWords(g: Save, w: WorldDef, v: string): string {
    const m = v.trim().match(VENTURE); if (!m) return 'a business of your own';
    const [, n, id, tier, disc] = m, many = Number(n ?? 1);
    const d = w.ventures?.find(x => x.id === id), sort = d ? d.track : id;
    const [one, more] = d ? [d.name, d.name] : TRACK_WORDS[sort] ?? (w.ventures?.find(x => x.kind === id) ? [id, `${id}s`] : ['business', 'businesses']);
    const what = many > 1 ? `${many} ${more} of your own` : d ? `${one} of your own` : `a ${one} of your own`;
    const at = tier === undefined ? '' : tier.toLowerCase() === 'top' ? ' at the top tier' : ` at tier ${tier}`;
    if (disc !== undefined) { const best = Math.max(0, ...ventureList(g).filter(s => ventureIs(w, s, id)).map(s => s.disc?.length ?? 0)); return `${disc} discoveries at ${d ? d.name : `your ${one}`} (${best} now)`; }
    return `${what}${at}${many > 1 ? ` (${venturesLike(g, w, m).length} now)` : ''}`;
}
// (track 7) Seasons a division of yours met the board's target (the verdicts it keeps).
const boardMet = (g: Save) => ventureList(g).reduce((n, s) => n + (s.verdicts ?? []).filter(x => x.got >= x.want).length, 0);
// (track 7) Rooms and fixtures bought for the homes you own (what came with a home isn't counted).
const fixturesBought = (g: Save) => ownedHomes(g).reduce((n, o) => n + (o.fix?.length ?? 0), 0);
// `owns: bike`: an item you have; `owns: cat:vehicle 2`: that many things of a category (one without a number). Never
// with the shop off.
function ownsHolds(g: Save, w: WorldDef, v: string): boolean {
    if (!systemOn(w, 'shop')) return false;
    if (/^\d+$/.test(v)) return thingsHad(g, w).length >= Number(v);
    const m = v.match(OWNS);
    if (!m?.[1]) return haveItem(g, w, v);
    const cat = m[1].toLowerCase();
    if (cat === 'all') { const k = kindsHad(g, w); return k.all.length > 0 && k.have.length === k.all.length; }
    return ownedDefs(g, w).filter(it => catOf(it) === cat).length >= Number(m[2] ?? 1);
}
// (track 7) The shop's things you have now (rooms and fixtures aren't the shop's), each once.
function thingsHad(g: Save, w: WorldDef): string[] {
    const ids = new Set(shopItems(w).map(it => it.id));
    return [...new Set(ownedDefs(g, w).filter(it => ids.has(it.id)).map(it => it.id))];
}
/** (track 7) The kinds the shop sells that you keep (not gifts, never the adult ones), and those you have something of
 *  now (`owns: cat:all`). */
export function kindsHad(g: Save, w: WorldDef): { all: string[]; have: string[] } {
    const items = shopItems(w).filter(it => !it.adult), ids = new Set(thingsHad(g, w));
    const all = SHOP_CATS.filter(c => !c.adult && c.id !== 'gift' && items.some(it => catOf(it) === c.id)).map(c => c.id);
    return { all, have: all.filter(c => items.some(it => catOf(it) === c && ids.has(it.id))) };
}
// (hospitality) `tenant: Tsubaki` someone renting a room at a venture of yours; `tenant: Tsubaki ryokan` at that one
// (its id, track or kind). The name may have spaces; the venture is its last word when one of yours matches it.
function tenantHolds(g: Save, w: WorldDef, v: string): boolean {
    if (!systemOn(w, 'business')) return false;
    const words = v.trim().split(/\s+/), last = words.length > 1 ? words[words.length - 1] : '';
    const list = ventureList(g), at = last && list.some(s => ventureIs(w, s, last)) ? last : '';
    const who = (at ? words.slice(0, -1) : words).join(' ').toLowerCase();
    return list.some(s => (!at || ventureIs(w, s, at)) && (s.tenants ?? []).some(t => t.who.toLowerCase() === who || t.who.toLowerCase().split(/\s+/)[0] === who));
}

// (life goals) The skills a `skill: any …` or `skill: creative …` looks at.
const skillIds = (g: Save, w: WorldDef, id: string) => (id === 'any' ? skillsOf(w, g).map(s => s.id) : SKILL_GROUPS[id] ?? []);
// An adult skill (Sensuality) counts only with adult content on.
const skillOn = (g: Save, w: WorldDef, id: string) => !w.skills?.some(s => s.id === id && s.adult) || adultOn(g);
// Keepsakes you hold (different ids), and whether you hold every keepsake of a kind (`any`: of some kind).
const heldIds = (g: Save) => Object.entries<number>((g.player as any).keepsakes ?? {}).filter(([, n]) => Number(n) > 0).map(([id]) => id);
function fullSet(g: Save, w: WorldDef, kind: string): boolean {
    const held = new Set(heldIds(g)), kinds = new Set((w.keepsakes ?? []).map(k => k.kind).filter((k): k is string => !!k));
    const full = (k: string) => { const all = (w.keepsakes ?? []).filter(x => x.kind === k); return all.length > 0 && all.every(x => held.has(x.id)); };
    return kind === 'any' ? [...kinds].some(full) : full(kind);
}
// Your rank in your job (1 is the first): at least a number, the middle, one (or N) below the top, the top; with
// "in N jobs", the best rank reached in that many different jobs (sim/tally.ts).
function rankHolds(g: Save, w: WorldDef, v: string): boolean {
    if (!systemOn(w, 'jobs')) return false;
    const m = v.match(RANK)!, what = m[1];
    if (m[2]) return Object.values(bestRanks(g)).filter(r => r >= Number(what)).length >= Number(m[2]);
    const j = g.player.job, o = j && w.occupations.find(x => x.id === j.id);
    if (!j || !o) return false;
    // (your track's top; business: the ranks `beyond` it are above the top, so holding one is past it)
    const c = careerOf(g, trackOf(g, o)), above = c.ranks.findIndex(r => r.beyond), total = c.open ? c.ranks.length + 1 : above < 0 ? c.ranks.length : above;
    const need = what === 'top' ? total : what === 'middle' ? Math.ceil(total / 2) : what.startsWith('top-') ? total - Number(what.slice(4)) : Number(what);
    return j.rank + 1 >= Math.max(1, need);
}
// The world's best kinds of home: the two whose dearest area costs most (one in a world with two kinds or fewer). Only
// rents count, so homes you can only buy (housing) never push the rented ones out of reach.
function topKinds(w: WorldDef): string[] {
    const rent = (k: string) => Math.max(0, ...w.homes.zones.filter(z => z.kind === k).map(z => z.rent ?? 0));
    const kinds = Object.keys(w.homes.kinds ?? {}).sort((a, b) => rent(b) - rent(a));
    return kinds.slice(0, kinds.length > 2 ? 2 : 1);
}
// Your home: a kind, nobody living with you (`alone`), dearer than your first (`better`), one of the best kinds
// (`top`), lived in a season or a number of days.
function homeHolds(g: Save, w: WorldDef, v: string): boolean {
    const h = g.player.home, t = tally(g).home;
    if (!h) return false;
    switch (v.toLowerCase()) {
        case 'alone': return !residentsOf(g).some(r => (r as any).homeWith === '__you');
        case 'better': return !!t && homeWorth(w, h.zone) > homeWorth(w, t.first);
        // (housing) a home you own counts when it's worth at least the best rented kinds' dearest area
        case 'top': return topKinds(w).includes(h.kind) || (housingOn(w) && ownedHere(g) && homeWorth(w, h.zone) >= Math.min(...topKinds(w).map(k => Math.max(0, ...w.homes.zones.filter(z => z.kind === k).map(z => z.rent ?? 0)))));
        case 'season': return !!t && g.day - t.since >= seasonDays(g);
        // (track 7, housing) the home you live in is yours; a second home
        case 'owned': return housingOn(w) && ownedHere(g);
        case 'second': return housingOn(w) && !!secondHome(g);
        default: return /^\d+$/.test(v) ? !!t && g.day - t.since >= Number(v) : h.kind === v;
    }
}
// Someone with you as a couple: anyone (`any`), nobody (`none`), one who lives with you (`home`), or that status.
function partnerHolds(g: Save, w: WorldDef, v: string): boolean {
    const on = systemOn(w, 'romance');
    const list = on ? residentIds(g).filter(a => !!statusOf(g, a, YOU)) : [];
    if (v === 'none') return !list.length;
    if (v === 'any') return list.length > 0;
    if (v === 'home') return list.some(a => (g.cast[a] as any).homeWith === '__you');
    if (v === 'open') return list.some(a => styleOf(g, a) === 'open');
    if (/^\d+$/.test(v)) return list.length >= Number(v);
    return list.some(a => statusOf(g, a, YOU) === v);
}
// How many of the people you know are at a level toward you (or closer), living on a map (or in an area), or working
// at a place where you're a regular.
function friendsHold(g: Save, w: WorldDef, v: string): boolean {
    const m = v.match(FRIENDS)!, n = Number(m[1]), level = m[2].toLowerCase(), map = m[3], atRegular = !!m[4];
    const onMap = (r: Resident) => {
        const zone = (r as any).homeWith === '__you' ? g.player.home?.zone : r.home?.zone;
        const id = w.homes.zones.find(z => z.id === zone)?.map;
        return !!id && (id === map || w.maps.find(x => x.id === id)?.area === map);
    };
    const works = (r: Resident) => { const p = w.occupations.find(o => o.id === r.occupation)?.place; return !!p && isRegular(g, p); };
    return residentsOf(g).filter(r => r.met && levelHolds(g, w, r.avatar, level) && (!map || onMap(r)) && (!atRegular || works(r))).length >= n;
}
// The places a `visited` counts: real places (not a pin to another map, not private, not adult).
// (business: a venture's unit isn't one of the places to visit: it's only there while it's yours)
// (museum) the museum's place isn't a corner of its district: it's hidden until yours, and only one player's
const visitable = (w: WorldDef) => { const own = w.collection?.museum?.place; return w.places.filter(p => !p.link && !p.private && !p.adult && !p.venture && !p.room && p.id !== own); };
/** (the collection) The places `visited: all in <map>` asks for, and how many of them you've been to. */
export function placesToVisit(g: Save, w: WorldDef, map: string): { all: number; been: number } {
    const on = placesOnMap(g, w, map);
    return { all: on.length, been: on.filter(p => p.been).length };
}
/** (the collection) Those places one by one, and whether you've been to each (the Collection app's page of a slot). */
export function placesOnMap(g: Save, w: WorldDef, map: string): { id: string; name: string; been: boolean }[] {
    return visitable(w).filter(p => onMapOf(w, p, mapArg(g, w, map))).map(p => ({ id: p.id, name: p.name, been: beenTo(g, p.id) }));
}
const onMapOf = (w: WorldDef, p: { map: string }, map: string) => !!map && (p.map === map || w.maps.find(m => m.id === p.map)?.area === map);
/** The map `in home` means: the map your home is on ('' with no home). */
export const homeMap = (g: Save, w: WorldDef) => w.homes.zones.find(z => z.id === g.player.home?.zone)?.map ?? '';
const mapArg = (g: Save, w: WorldDef, a: string) => (a.toLowerCase() === 'home' ? homeMap(g, w) : a);
// Places you've been: one by id, a number of them, a number or all on a map (or your home's map), every place on some
// map (`map`), a place on every map (`maps`), every place (`all`); a regular at a place, or at a number of them
// (anywhere, or on a map).
function visitedHolds(g: Save, w: WorldDef, v: string): boolean {
    const m = v.match(VISITED);
    if (!m) { const r = v.match(PLACE_REGULAR); return r ? systemOn(w, 'living') && isRegular(g, r[1]) : beenTo(g, v); }
    const places = visitable(w), been = (id: string) => beenTo(g, id);
    const s = v.toLowerCase(), map = m[3] && mapArg(g, w, m[3]);
    if (m[1] && m[2]) return systemOn(w, 'living') && places.filter(p => (!m[3] || onMapOf(w, p, map as string)) && isRegular(g, p.id)).length >= Number(m[1]);
    if (m[1] && m[3]) return places.filter(p => onMapOf(w, p, map as string) && been(p.id)).length >= Number(m[1]);
    if (m[1]) return placesBeen(g).length >= Number(m[1]);
    if (m[4]) { const on = places.filter(p => onMapOf(w, p, mapArg(g, w, m[4]))); return on.length > 0 && on.every(p => been(p.id)); }
    const maps = [...new Set(places.map(p => p.map))];
    if (s === 'map') return maps.some(id => places.filter(p => p.map === id).every(p => been(p.id)));
    if (s === 'maps') return maps.length > 0 && maps.every(id => places.some(p => p.map === id && been(p.id)));
    return places.length > 0 && places.every(p => been(p.id));   // all
}
// The world's threads (the people's storylines), and the ones you knew that ended well.
const threadsOf = (w: WorldDef): Thread[] => w.cast.examples.flatMap(e => e.threads ?? []);
function helpedThreads(g: Save, w: WorldDef): string[] {
    return threadsOf(w).filter(t => { const s = threadState(g, t.id); return s?.known !== undefined && !!s.ended && !!t.endings?.find(e => e.id === s.ended)?.good; }).map(t => t.id);
}
// A life goal finished (its id; an old aspiration's too), one of its steps done (`idol 3`), or a number of goals
// finished. sim/goals.ts keeps `g.goals.done` (ids) and `g.goals.steps` (steps done per goal).
// (the collection) `seen: all in <map>`, and `had:` a keepsake held at some time (`g.collection.had`, kept by
// sim/collection.ts while the collection is on): one, all of a kind this game can have, or a number of them.
const SEEN_ALL = /^all\s+in\s+([^\s,;]+)$/i, HAD = /^(\d+|all\s+[^,;]+|[^\s,;]+)$/i;
// (museum) `piece: art_great_wave` · `piece: 30` · `piece: 10 in art` · `piece: all in crafts`; `museum: open` · `show` ·
// `renown 3` · `shows 2` · `50%` · an upgrade id; `tier: Tamaki 2` (people who unlock: that person's tier reached).
// (museum, the market) `sales: won 3` (lots won against the other collector) · `lots 5` (every lot bought) · `resold 1`
// (lots she sold you back); `dealer: spent 2000000` (yen) · `bought 4` · `asked 1` · `visits 3` (visits you bought from).
// (C-7) `sales: bested 4` (won over her bid + sold back by her) · `lent 1` (loans to her foundation); `dealer: here` (a visit's day).
const SALES = /^(?:won|lots|resold|bested|lent)\s+\d+$/i, DEALER = /^(?:(?:spent|bought|asked|visits)\s+\d+|here)$/i;
// (nature, the dig) `dig: seasons 1` (past seasons you dug in) · `days 3` (days dug in all) · `found 2` (its finds in all)
const DIG = /^(?:seasons|days|found)\s+\d+$/i;
// (track 7) `piece: halls 3` (display halls complete), `piece: all in shunga` (a hall's group); `record: 50%` (the
// record's percentage), `record: all in cabinet` (a record hall's slots filled, an apart one too)
const RECORD = /^(?:\d+%|(?:\d+|all)\s+in\s+[^\s,;]+)$/i;
const PIECE = /^(?:\d+|halls\s+\d+|(?:\d+|all)\s+in\s+[^\s,;]+|[^\s,;]+)$/i, MUSEUM = /^(?:open|show|renown\s+\d+|shows\s+\d+|\d+%|(?!(?:renown|shows)$)[a-z0-9_]+)$/i, TIER = /^(.*\S)\s+(\d+)$/;
// (adult) `known: 5`: likes and hard limits you know of your lovers, in all; `known: Tamaki 5`: of that person; `likes` or
// `limits` after the number counts only those (`known: Tamaki 2 limits`).
const KNOWN = /^(?:(.*\S)\s+)?(\d+)(?:\s+(likes|limits))?$/i;
/** What a `known:` value asks, and how many you know now (null when it doesn't read). */
export function knownHave(g: Save, v: string): { have: number; need: number } | null {
    const m = v.match(KNOWN); if (!m) return null;
    const what = m[3]?.toLowerCase() as 'likes' | 'limits' | undefined, need = Number(m[2]);
    if (!m[1]) return { have: knownCount(g, YOU, what), need };
    const r = personNamed(g, m[1]), k = r ? knownOf(g, r.avatar) : { likes: [], limits: [] };
    return { have: (what !== 'limits' ? k.likes.length : 0) + (what !== 'likes' ? k.limits.length : 0), need };
}
/** (people who unlock) Has this person reached that tier? Read from the save without writing (sim/tiers.ts keeps it). */
function tierHolds(g: Save, v: string): boolean {
    const m = v.match(TIER); if (!m) return false;
    const r = personNamed(g, m[1]); if (!r) return false;
    const t = (g as any).rel?.people?.[idOf(g, r.avatar)]?.tier as { n?: number } | undefined;
    return (t?.n ?? -1) >= Number(m[2]);
}
const hadOf = (g: Save, w: WorldDef) => new Set<string>(systemOn(w, 'collection') ? ((g as any).collection?.had ?? []) : []);
/** The keepsakes of a kind this game can have (adult ones only with adult content on). */
export const kindHere = (g: Save, w: WorldDef, kind: string) => (w.keepsakes ?? []).filter(k => (k.kind ?? '') === kind && (!k.adult || adultOn(g)));
function hadHolds(g: Save, w: WorldDef, v: string): boolean {
    if (!systemOn(w, 'collection')) return false;
    const had = hadOf(g, w);
    if (/^\d+$/.test(v)) return had.size >= Number(v);
    const m = v.match(/^all\s+(.+)$/i);
    if (!m) return had.has(v);
    const list = kindHere(g, w, m[1].trim());
    return list.length > 0 && list.every(k => had.has(k.id));
}
function hadWords(g: Save, w: WorldDef, v: string): string {
    const had = hadOf(g, w);
    if (/^\d+$/.test(v)) return `${v} keepsakes (${Math.min(had.size, Number(v))} so far)`;
    const m = v.match(/^all\s+(.+)$/i);
    if (!m) return w.keepsakes?.find(k => k.id === v)?.name ?? v.replace(/_/g, ' ');
    const list = kindHere(g, w, m[1].trim());
    return `every ${m[1].trim()} keepsake (${list.filter(k => had.has(k.id)).length} of ${list.length})`;
}
function goalHolds(g: Save, w: WorldDef, v: string): boolean {
    if (!systemOn(w, 'goals')) return false;
    const st = (g as any).goals as { done?: string[]; steps?: Record<string, number> } | undefined;
    const done = new Set([...(st?.done ?? []), ...(((g.player as any).aspDone ?? []) as string[]).map(id => FOLDED_GOALS[id] ?? id)]);
    if (/^\d+$/.test(v)) return done.size >= Number(v);
    if (v === 'all') return collectionLink.goalsAll(g, w);
    const [raw, n] = v.split(/\s+/), id = FOLDED_GOALS[raw] ?? raw;
    return done.has(id) || (n !== undefined && (st?.steps?.[id] ?? 0) >= Number(n));
}
// A degree: `any` (studying for one), `term 3` (its third term begun or later), `gpa 3` (a GPA of 3 or better so far),
// `scholarship` (still held), `club` (one of the school's clubs joined), `graduated`, `distinction` (graduated with a
// GPA of 3.5 or better). A graduate is past every term, with the GPA they graduated with. sim/degrees.ts keeps `g.uni`.
const GRADE_POINTS: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
function degreeHolds(g: Save, w: WorldDef, v: string): boolean {
    if (!systemOn(w, 'institutions') || !systemOn(w, 'courses')) return false;
    const u = (g as any).uni as { cur?: { term?: number; grades?: Record<string, string>; scholarship?: string; club?: string } | null; past?: { how: string; gpa: number; distinguished: boolean }[] } | undefined;
    const cur = u?.cur ?? null, grads = (u?.past ?? []).filter(p => p.how === 'graduated');
    const [what, n] = v.split(/\s+/);
    switch (what) {
        case 'any': return !!cur;
        case 'graduated': return grads.length > 0;
        case 'distinction': return grads.some(p => p.distinguished);
        case 'scholarship': return cur?.scholarship === 'held';
        case 'club': return !!cur?.club;
        case 'term': return (cur?.term ?? 0) >= Number(n) || grads.length > 0;
        case 'gpa': {
            const all = Object.values(cur?.grades ?? {}), gpa = all.length ? Math.round((all.reduce((a, gr) => a + (GRADE_POINTS[gr] ?? 0), 0) / all.length) * 100) / 100 : null;
            return (gpa !== null && gpa >= Number(n)) || grads.some(p => p.gpa >= Number(n));
        }
    }
    return false;
}

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
    const n = plain(name), all = Object.values(g.cast ?? {}).filter(r => !r.onset);   // ((adult industry) never a performer on a set)
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
const isHere = (g: Save, w: WorldDef, r: Resident, x: Here) => (x.at === nowAbs(g) ? sceneAt(g, w, x.place).includes(r) : routineAt(g, w, r, x.at) === x.place);
// At work here: here, and their day says work here (a shift of a job with a schedule, their routine's work hours for
// one without, or working late).
function atWork(g: Save, w: WorldDef, r: Resident, x: Here) {
    return systemOn(w, 'jobs') && workingAt(g, w, r, x.at) === x.place && isHere(g, w, r, x);
}

// (storylines, SL-2) `thread: <id>` with no ending named ("ended, any way") never waits on someone who isn't in the game:
// a storyline nobody here has counts as ended; with alternatives, it waits on those that are here, and holds when none
// is. A named ending (`thread: rina_runway funded`) stays false without its person.
function threadHolds(g: Save, w: WorldDef, values: string[], x: Here): boolean {
    let have: Set<string> | undefined;
    const here = (v: string) => /\s/.test(v) || (have ??= threadsInGame(g, w)).has(v);
    const there = values.filter(here);
    return !there.length || there.some(v => holds(g, w, 'thread', v, x));
}
/** Whether everyone else a storyline needs (`Thread.with`) is in this game too. */
export const withHere = (g: Save, t: Thread) => !t.with?.length || t.with.every(n => !!personNamed(g, n));
/** The storylines of the people in this game (an adult person's, or an adult thread, only with adult content on; one
 *  that needs someone who isn't here, not at all), by id. */
export function threadsInGame(g: Save, w: WorldDef): Set<string> {
    const out = new Set<string>();
    for (const r of Object.values(g.cast ?? {})) { const ex = exampleOf(w, r); for (const t of ex?.threads ?? []) if (t.id && ((!t.adult && !ex?.adult) || adultOn(g)) && withHere(g, t)) out.add(t.id); }
    return out;
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

/* ---------- in words ---------- */

/** (storylines) Keys that only follow the calendar: a stage whose condition asks for nothing else (or nothing) is a
 *  calendar stage, never skipped (sim/threads.ts). */
export const CALENDAR_KEYS = new Set<Cond['key']>(['season', 'seasonDays', 'weekday', 'weekend', 'festival', 'event', 'period', 'clock', 'weather', 'fromDay', 'toDay']);
export const calendarOnly = (when: When | null | undefined) => parseWhen(when).conds.every(c => CALENDAR_KEYS.has(c.key));

// A degree named in a condition (a degree's id is its credential): "a degree in Economics".
const degreeWord = (w: WorldDef, id: string) => { const d = (w.institutions ?? []).flatMap(i => i.degrees ?? []).find(x => x.id === id); return d ? `a degree (${d.name})` : undefined; };
const FRIEND_WORDS: Record<string, string> = { acquaintance: 'Acquaintance', friend: 'Friend', good: 'Good friend', best: 'Best friend' };
// (a couple status in `feels:`, in words: being that couple with them, or closer)
const STATUS_WORDS: Record<string, (who: string) => string> = { casual: (who) => `a fling with ${who}`, dating: (who) => `going out with ${who}`, engaged: (who) => `engaged to ${who}`, married: (who) => `married to ${who}` };
const levelWord = (lvl: string) => FRIEND_WORDS[lvl] ?? [...FRIEND_TIERS, ...ROMANCE_TIERS].find(t => t.id === lvl)?.name ?? lvl;
// "three seasons as Head of Sales" (the rank you hold now), or "20 days in your rank".
function inRankWords(g: Save, w: WorldDef, days: number): string {
    const sd = seasonDays(g), o = myJob(g, w), name = o ? rankOf(g, o).name : '';
    const n = days % sd === 0 ? days / sd : 0, words = ['', 'a season', 'two seasons', 'three seasons', 'four seasons'];
    const span = n ? words[n] ?? `${n} seasons` : `${days} days`;
    return name ? `${span} as ${name}` : `${span} in your rank`;
}
// What a gate calls a story or a work event (`title`), if it gives one.
function seenTitle(w: WorldDef, v: string): string | undefined {
    const id = v.split(':')[0];
    return (w.stories ?? []).find(s => s.id === id)?.title ?? w.occupations.flatMap(o => o.events ?? []).find(e => e.id === id)?.title;
}
// (storylines) A story without a title, in words: where it happens, never its text.
function seenWords(w: WorldDef, v: string): string {
    const t = seenTitle(w, v); if (t) return t;
    const s = (w.stories ?? []).find(x => x.id === v.split(':')[0]);
    const p = s && w.places.find(x => x.id === s.place)?.name;
    return p ? `a moment at ${p}` : 'a moment of its own';
}
// What an `owns:` asks, in words: things by name (cars only: "a car"), or a number of a category's things.
function ownsWords(w: WorldDef, values: string[]): string {
    const items = shopItems(w), words: string[] = [];
    const ids = values.filter(v => !OWNS.exec(v)?.[1]), named = ids.map(id => items.find(x => x.id === id));
    if (ids.length && named.every(it => it?.late)) words.push('a car');
    else for (const [i, it] of named.entries()) words.push(it ? `a ${it.name}` : ids[i]);
    for (const v of values) {
        const m = OWNS.exec(v); if (!m?.[1]) continue;
        const cat = SHOP_CATS.find(x => x.id === m[1].toLowerCase()), n = Number(m[2] ?? 1);
        const what = cat?.id === 'vehicle' ? (n > 1 ? 'vehicles' : 'vehicle') : `${n > 1 ? 'things' : 'thing'} from ${cat?.name ?? m[1]}`;
        words.push(n > 1 ? `${n} ${what}` : `a ${what}`);
    }
    return `${[...new Set(words)].join(' or ')} of your own`;
}
/** Whose storyline a thread is (the world's person's first name). */
export const threadOwner = (w: WorldDef, id: string) => w.cast.examples.find(e => (e.threads ?? []).some(t => t.id === id))?.name.split(/\s+/)[0] ?? 'someone';
/** What a condition still asks, in words. The work screen's keys (skills, courses, friendships, time in the rank, a
 *  story or work event by its title) and "something more" for the rest; with `more` (storylines), what a storyline's
 *  way asks for too: a friendship with where it stands now, a secret, how another storyline ends, a story by where it
 *  happens, how many times something was done, money, a favor, a business, a job. */
export function missingWords(g: Save, w: WorldDef, when: When, place?: string, opts: { more?: boolean } = {}): string[] {
    const out: string[] = [];
    let other = false;
    const more = !!opts.more;
    for (const c of parseWhen(when).conds) {
        const text = `${c.key}: ${c.not ? 'not ' : ''}${c.values.join(' or ')}`;
        if (whenHolds(g, w, text, { place })) continue;
        if (c.key === 'skill' && !c.not) out.push(c.values.map(v => { const [id, n] = v.split(/\s+/); return `${skillName(w, id)} ${n ?? ''}`.trim(); }).join(' or '));
        else if (c.key === 'course' && !c.not) out.push(c.values.map(v => (/^\d+$/.test(v) ? `${v} courses finished` : courseOf(w, v)?.name ?? degreeWord(w, v) ?? v)).join(' or '));
        else if (c.key === 'feels' && !c.not && c.values.length === 1) {
            // (a romance level reads as romance, with the romance it is now; a couple status as the couple, "going out with Tamaki")
            if (!more) { const [who, lvl] = c.values[0].split(/\s+/), l = lvl?.toLowerCase(); out.push(STATUS_WORDS[l] ? STATUS_WORDS[l](who) : ROMANCE_TIERS.some(t => t.id === l) ? `romance with ${who} (${levelWord(l)})` : `friendship with ${who} (${FRIEND_WORDS[lvl] ?? lvl})`); continue; }
            const [who, lvl] = splitLevel(c.values[0]), r = personNamed(g, who);
            if (lvl && STATUS_WORDS[lvl]) { out.push(STATUS_WORDS[lvl](who)); continue; }
            const rom = !!lvl && ROMANCE_TIERS.some(t => t.id === lvl), v = r ? Math.round((rom ? ro : fr)(g, r.avatar, YOU)) : 0;
            const now = r && (rom ? ROMANCE_TIERS : FRIEND_TIERS).find(t => t.lo >= 0 && v >= t.lo && v < t.hi);
            out.push(lvl ? `${rom ? 'romance' : 'friendship'} with ${who} (${levelWord(lvl)}${now ? `; now ${levelWord(now.id)}` : ''})` : `meeting ${who}`);
        }
        // (business) time in the rank, and a story or work event a gate names in words ("the nomination")
        else if (c.key === 'inrank' && !c.not) out.push(inRankWords(g, w, Number(c.values[0])));
        // (the collection) a district's stories, keepsakes held at some time, every life goal
        else if (c.key === 'seen' && !c.not && c.values.every(v => SEEN_ALL.test(v))) out.push(c.values.map(v => collectionLink.storiesWords(g, w, v.match(SEEN_ALL)![1])).join(' or '));
        else if (c.key === 'had' && !c.not) out.push(c.values.map(v => hadWords(g, w, v)).join(' or '));
        else if (c.key === 'goal' && !c.not && c.values.length === 1 && c.values[0] === 'all') out.push(collectionLink.goalsWords(g, w));
        // (museum) a piece or pieces, the museum's state; a person's tier
        else if (c.key === 'piece' && !c.not) out.push(c.values.map(v => collectionLink.pieceWords(g, w, v)).join(' or '));
        else if (c.key === 'museum' && !c.not) out.push(c.values.map(v => collectionLink.museumWords(g, w, v)).join(' or '));
        else if ((c.key === 'sales' || c.key === 'dealer') && !c.not) out.push(c.values.map(v => collectionLink.marketWords(g, w, c.key as 'sales' | 'dealer', v)).join(' or '));
        else if (c.key === 'dig' && !c.not) out.push(c.values.map(v => collectionLink.digWords(g, w, v)).join(' or '));
        else if (c.key === 'tier' && !c.not) out.push(c.values.map(v => { const m = v.match(TIER); return m ? `${m[1]} closer (tier ${m[2]})` : v; }).join(' or '));
        else if (c.key === 'seen' && !c.not && c.values.every(v => !!seenTitle(w, v))) out.push(c.values.map(v => seenTitle(w, v)!).join(' or '));
        // (the shop) "a car of your own", "a Compact camera or a Film camera of your own", "2 vehicles of your own"
        // (track 7) a number of things, something of every kind
        else if (c.key === 'owns' && !c.not && c.values.length === 1 && /^\d+$/.test(c.values[0])) out.push(`${c.values[0]} things of your own (${thingsHad(g, w).length} now)`);
        else if (c.key === 'owns' && !c.not && c.values.length === 1 && /^cat:all$/i.test(c.values[0])) { const k = kindsHad(g, w); out.push(`something of every kind the shops sell (${k.have.length} of ${k.all.length})`); }
        else if (c.key === 'owns' && !c.not) out.push(ownsWords(w, c.values));
        // (letting) "3 homes let", "¥1,440,000 of rent from your tenants"
        else if (c.key === 'let' && !c.not) out.push(c.values.map(v => (Number(v) === 1 ? 'a home let' : `${v} homes let`)).join(' or '));
        else if (c.key === 'rent' && !c.not) out.push(c.values.map(v => `${money(w, Number(v))} of rent from your tenants`).join(' or '));
        // (track 7) a home of your own, rooms and fixtures, ventures, the board, the record
        else if (c.key === 'home' && !c.not && c.values.every(v => /^(owned|second)$/i.test(v))) out.push(c.values.map(v => (v.toLowerCase() === 'owned' ? 'a home of your own' : 'a second home')).join(' or '));
        else if (c.key === 'fixtures' && !c.not) out.push(`${c.values[0]} rooms and fixtures in your homes (${fixturesBought(g)} now)`);
        else if (c.key === 'board' && !c.not) out.push(c.values[0] === '1' ? 'a season on the board\'s target' : `${c.values[0]} seasons on the board's target (${boardMet(g)} now)`);
        else if (c.key === 'record' && !c.not) out.push(c.values.map(v => collectionLink.recordWords(g, w, v)).join(' or '));
        // (photography) "a photo reputation of 30 (12 now)", "Velvet Mode as a contact"
        else if (PHOTO_KEYS.includes(c.key) && !c.not && c.values.every(v => !!photoLink.words(g, w, c.key, v))) out.push(c.values.map(v => photoLink.words(g, w, c.key, v)).join(' or '));
        else if (INDUSTRY_KEYS.includes(c.key) && !c.not && c.values.every(v => !!industryLink.words(g, w, c.key, v))) out.push(c.values.map(v => industryLink.words(g, w, c.key, v)).join(' or '));
        else if (c.key === 'venture' && !c.not && c.values.some(v => /^\d+\s|\stier\s+top$|\sdiscoveries\s/i.test(v))) out.push(c.values.map(v => ventureWords(g, w, v)).join(' or '));
        else if (!more) other = true;
        else if (c.key === 'seen' && !c.not) out.push([...new Set(c.values.map(v => seenWords(w, v)))].join(' or '));
        else if (c.key === 'knows' && !c.not) out.push(c.values.map(v => `${threadOwner(w, v)}'s secret`).join(' or '));
        else if (c.key === 'thread' && !c.not) out.push(c.values.length === 1 && !/\s/.test(c.values[0]) ? `${threadOwner(w, c.values[0])}'s storyline to come to its end` : [...new Set(c.values.map(v => `how ${threadOwner(w, v.split(/\s+/)[0])}'s storyline ends`))].join(' or '));
        else if (c.key === 'did' && !c.not && c.values.length === 1 && countedOf('did', c.values[0])) {
            const d = countedOf('did', c.values[0])!, k = countKey(w, 'did', d.what);
            const a = ((w as any).actions ?? []).find((x: { id: string }) => x.id === d.what) as { name?: string; label?: string } | undefined;
            // (`with:<action>`: done with someone along, Lisa's set with a friend you brought)
            const along = d.what.startsWith('with:') ? ((w as any).actions ?? []).find((x: { id: string }) => x.id === d.what.slice(5)) as { name?: string; label?: string } | undefined : undefined;
            const have = tallyOf(g, k), name = along ? `${along.label ?? along.name} with someone along` : a?.label ?? a?.name ?? d.what.replace(/^[^:]*:/, '').replace(/_/g, ' ');
            out.push(d.n > 1 ? `${name}: ${d.n} times (${Math.min(have, d.n)} so far)` : name);
        }
        else if (c.key === 'attended' && !c.not && c.values.length === 1 && countedOf('attended', c.values[0])) {
            const d = countedOf('attended', c.values[0])!, k = countKey(w, 'attended', d.what);
            const f = w.festivals?.find(x => x.id === d.what) ?? w.cityEvents?.find(x => x.id === d.what);
            const have = tallyOf(g, k), name = d.what === 'any' ? 'a festival or a city event' : f?.name ?? d.what.replace(/_/g, ' ');
            out.push(d.n > 1 ? `${name}: ${d.n} times (${Math.min(have, d.n)} so far)` : name);
        }
        else if (c.key === 'money' && !c.not) out.push(`${money(w, moneyAmount(w, c.values[0]))} (you have ${money(w, g.player.money)})`);
        else if (c.key === 'favor' && !c.not) out.push(`a favor from ${c.values.join(' or ')}`);
        else if (c.key === 'venture' && !c.not) out.push([...new Set(c.values.map(v => { const id = v.split(/\s+/)[0]; const d = w.ventures?.find(x => x.id === id) ?? w.ventures?.find(x => x.track === id || x.kind === id); return d && d.id === id ? `${d.name} of your own` : 'a business of your own'; }))].join(' or '));
        else if (c.key === 'job' && !c.not) out.push(c.values.map(v => `working at ${w.occupations.find(o => o.id === v)?.name ?? v}`).join(' or '));
        else if (c.key === 'rank' && !c.not) out.push(c.values[0] === 'top' ? 'the top of your career' : `rank ${c.values[0]} in your job`);
        else other = true;
    }
    return other || !out.length ? [...out, 'something more'] : out;
}

/** (track 7) An objective of the end game's keys as the Goals app reads it: its words and, for a count, how far you are
 *  (`have`/`need`); null for a value it doesn't word. The collection's keys say how far in their words ("every piece
 *  of Nature (12 of 30)"). */
export function endgameWords(g: Save, w: WorldDef, key: string, v: string): { text: string; have?: number; need?: number } | null {
    const up = (s: string) => s.charAt(0).toUpperCase() + s.slice(1), now = (s: string) => s.replace(/\s*\(\d+ now\)$/, '');
    switch (key) {
        case 'home': return /^owned$/i.test(v) ? { text: 'A home of your own' } : /^second$/i.test(v) ? { text: 'A second home' } : null;
        case 'fixtures': return { text: 'Rooms and fixtures in your homes', have: fixturesBought(g), need: Number(v) };
        case 'owns': {
            if (/^\d+$/.test(v)) return { text: 'Things of your own', have: thingsHad(g, w).length, need: Number(v) };
            if (/^cat:all$/i.test(v)) { const k = kindsHad(g, w); return { text: 'Something of every kind the shops sell', have: k.have.length, need: k.all.length }; }
            return { text: up(ownsWords(w, [v])) };
        }
        case 'venture': {
            const m = v.trim().match(VENTURE); if (!m) return null;
            const text = up(now(ventureWords(g, w, v)));
            if (m[4] !== undefined) return { text, have: Math.max(0, ...ventureList(g).filter(s => ventureIs(w, s, m[2])).map(s => s.disc?.length ?? 0)), need: Number(m[4]) };
            return m[1] ? { text, have: venturesLike(g, w, m).length, need: Number(m[1]) } : { text };
        }
        case 'board': return { text: 'Seasons on the board\'s target', have: boardMet(g), need: Number(v) };
        case 'let': return { text: 'Homes let', have: toLet(g).filter(isLet).length, need: Number(v) };
        case 'rent': return { text: 'Rent from your tenants', have: rentHad(g), need: Number(v) };
        case 'piece': return { text: up(collectionLink.pieceWords(g, w, v)) };
        case 'museum': return { text: up(collectionLink.museumWords(g, w, v)) };
        case 'record': return { text: up(collectionLink.recordWords(g, w, v)) };
        case 'dig': return { text: up(collectionLink.digWords(g, w, v)) };
    }
    if (PHOTO_KEYS.includes(key)) {   // (photography)
        const text = photoLink.words(g, w, key, v), have = photoLink.count(g, w, key, v);
        return text ? { text: up(now(text)), ...(have !== null && /^\d+$/.test(v) ? { have, need: Number(v) } : {}) } : null;
    }
    if (INDUSTRY_KEYS.includes(key)) {   // (adult industry)
        const text = industryLink.words(g, w, key, v), have = industryLink.count(g, w, key, v), n = /(\d+)$/.exec(v);
        return text ? { text: up(now(text)), ...(have !== null && n ? { have, need: Number(n[1]) } : {}) } : null;
    }
    return null;
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

/* ---------- places that are there only while something holds ---------- */

// (museum) A place with `when` is on the maps and in anyone's plans only while it holds (the kura's back room, from
// Tamaki's Lover tier). Kept per world: which places have one (none: the gate answers at once). A condition that asks
// where people are would ask the maps again: while one is being read, the gate lets every place be.
const placeWhens = new WeakMap<WorldDef['places'], Map<string, When>>();
let readingPlace = false;
placeGates.push((g, w, id) => {
    if (!g || readingPlace || !w?.places) return true;
    let m = placeWhens.get(w.places);
    if (!m) placeWhens.set(w.places, m = new Map(w.places.filter(p => p.when).map(p => [p.id, p.when!] as [string, When])));
    const when = m.size ? m.get(id) : undefined;
    if (!when) return true;
    readingPlace = true;
    try { return whenHolds(g, w, when); } finally { readingPlace = false; }
});
