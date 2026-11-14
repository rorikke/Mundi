// Ventures (business): what you own or run, a café of your own or an executive's division, growing like an
// incremental game (requirements/business.md B-15): four numbers inside a tier's ceiling, upgrades that last (bought,
// found in the city, earned), a milestone story to the next tier, a style per tier, discoveries kept for good,
// calendar cards, the week's takings and report, running it yourself, hired hands from the world's pool, and a place
// your friends come to. The world says what can be owned (`w.ventures`, core/world.ts); the save keeps what is
// (`g.ventures`, read with defaults, no schema change). Everything waits on the `business` system: off, or with no
// ventures in the world, nothing happens. The engine owns every number; the AI is told the state (`ventureLine`).
import { nowAbs, adultOn, type Save, type Resident } from '../core/store.js';
import { systemOn, type WorldDef, type VentureDef, type TierDef, type UpgradeDef, type StyleDef, type WorkEvent, type CardDef, type WorkResult, type SeasonId } from '../core/world.js';
import { statsOf, statName } from '../core/ventures.js';
import { onDay, onLook, ventureLink } from './hooks.js';
import { advance, isWeekend, seasonDays, SEASONS } from './time.js';
import { openAt } from './daynight.js';
import { festivalsOn } from './festivals.js';
import { regionState, regionOf } from './worldstate.js';
import { addStatus, money } from './needs.js';
import { payOf, priceOf } from './bills.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { tallyEvent } from './tally.js';
import { trainSkill } from './hobbies.js';
import { whenHolds, levelHolds } from './when.js';
import { placeOf } from './places.js';
import { myJob, shiftNow, quitJob, choicePractice, addPerf } from './work.js';
import { eventsReady, rollChoice, applyWorkResult, choiceOpen } from './workevents.js';
import { isHotel, hotelDay, hourMul, pricesOf, type HotelDay } from './rooms.js';
import { personNamed } from './when.js';
import { effectSources } from './effects.js';
import type { EffectDef } from '../core/traits.js';

/** A venture as the save keeps it. `id`: its world entry's; `place`: where it runs (the unit you lease, the takeover's
 *  place, the company's office), `places` more of them from a later tier; `name`: what you called it; `way`: how it
 *  became yours; `since`: that day; `tier`: 1 the first; `style` the current style and `styleTier` the tier it was
 *  chosen at; `stats`: its numbers; `owned`, `found`, `disc`: upgrades bought, upgrades turned up and waiting,
 *  discoveries made; `staff`: hired hands (a name, a quirk, the upgrade that brought them); `cash`: this week's takings
 *  so far (paid at the week's end); `ran`: days you ran it yourself (the last two weeks); `spent`: what it has cost you
 *  (what selling it gives back a share of); `week`/`last`: this week's and last week's report; `event`: one of its
 *  events waiting for your choice; `closed`: the day it was sold or closed (kept, it does nothing). */
export interface VentureState {
    id: string; place: string; places?: string[]; name?: string; way: 'takeover' | 'lease' | 'rank' | 'buy' | 'partner';
    since: number; tier: number; style?: string; styleTier?: number;
    stats: Record<string, number>; owned: string[]; found: string[]; disc: string[];
    staff: { name: string; quirk: string; for: string }[];
    manager?: boolean; cash: number; rent?: number; ran?: number[]; spent?: number;
    week: WeekReport; last?: WeekReport; event?: { id: string; day: number }; closed?: number;
    /** the last day one of its events came (one a day at most) */
    evDay?: number;
    /** (exec, sim/exec.ts) the season its budget (`cash`) is for, and the board's verdicts on the seasons before */
    season?: number; verdicts?: { season: number; got: number; want: number }[];
    /** (hospitality) what's still owed on the owner's note and the weekly instalment taken from the takings (H-2) */
    owes?: number; instalment?: number;
    /** (hospitality) partners beside you (the ryokan's family: their share of the takings) and tenants (B-19) */
    partners?: { who: string; share: number }[];
    tenants?: { id: string; who: string; since: number }[];
    /** (love hotel) secrets kept and let slip at the desk, sightings already heard, and whether you want to hear them
     *  (`never`: no sightings; default: only when it matters) */
    kept?: number; slipped?: number; sighted?: string[]; tell?: 'matters' | 'never';
    /** (hospitality) places an upgrade opened (the owner's suite, the detached rooms): part of it, on the map */
    opened?: string[];
    /** the style chosen at each tier (tier → style id); `style` is the latest */
    styles?: Record<number, string>;
}
/** A week's report: its number (week 0 is days 1–7), what came in and went out, days you ran it, lines worth telling. */
export interface WeekReport { n: number; takings: number; costs: number; run: number; notes: string[]; /** paid on the owner's note */ note?: number }
/** The save's ventures: the list, the stint you're working now (`running`: until when, in absolute minutes), the week a
 *  calendar card was last put to you and the one waiting, and today's friends who may come by (`hang`: avatar → the
 *  venture places that suit them, made once a day). */
export interface Ventures {
    list: VentureState[]; running?: { id: string; until: number }; cardWeek?: number; card?: { venture: string; id: string; day: number };
    hang?: { day: number; who: Record<string, string[]> };
    /** cards already put to you this year (`venture:card:year`), so a festival's card comes once a year */
    seen?: string[];
    /** (love hotel) couples you know of (`a|b`, sorted), the week a sighting last came, and the one waiting for your
     *  choice (sim/sightings.ts) */
    pairs?: string[]; sightWeek?: number; sightN?: number; sighting?: { venture: string; id: string; who: string[]; day: number; via: 'desk' | 'notebook' };
}

/** The engine's numbers (tuned by the long run, tokyo-business-long.mjs). `stint`: hours a stint takes unless the
 *  venture says; `events`: the chance one of its events comes after a stint; `rise`: each upgrade of a number costs
 *  this many times the one before it; `manager`: what a manager adds to the share it earns on its own; `sell`: the
 *  share of what it cost you that selling gives back; `renovate`: a new style within a tier costs this many days of
 *  its takings at the ceiling; `cost`: what an hour at the counter takes of your needs; `train`: practice per stint
 *  hour; `noise`: the day's takings vary by this much either way; `festival`: a festival elsewhere in the world. */
export const VENTURE = {
    stint: 4, events: 0.2, rise: 1.6, manager: 0.15, sell: 0.4, renovate: 10,
    cost: { energy: 2.5, hygiene: 1, hunger: 1.5, thirst: 1.5 } as Record<string, number>,
    train: 1.2, noise: 0.1, festival: 1.1, weekend: 1.2,
};

/** (exec, sim/exec.ts) The season's target for an executive's division: how full the board wants it (0–1), higher at
 *  each tier. Here so the AI's line and the division's verdict read the same numbers. */
export const EXEC_TARGET = { from: 0.4, per: 0.12 };
export const execTarget = (tier: number) => Math.min(0.95, EXEC_TARGET.from + EXEC_TARGET.per * (tier - 1));

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rnd = (g: Save, salt: string) => H(`${g.world}|${salt}`);

const EMPTY: VentureState[] = [];
/** The ventures you own now (closed ones left out); reading never writes to the save. */
export const venturesOf = (g: Save): VentureState[] => ((g as any).ventures?.list as VentureState[] | undefined)?.filter(s => s && !s.closed) ?? EMPTY;
/** The save's ventures, made when first written (old saves: every field read with a default). */
export function ventureStore(g: Save): Ventures {
    const v = ((g as any).ventures ??= {}) as Ventures;
    v.list ??= [];
    for (const s of v.list) { s.stats ??= {}; s.owned ??= []; s.found ??= []; s.disc ??= []; s.staff ??= []; s.cash ??= 0; s.tier ??= 1; s.week ??= blankWeek(weekOf(g.day)); }
    return v;
}
export const weekOf = (day: number) => Math.floor((Math.max(1, day) - 1) / 7);
const blankWeek = (n: number): WeekReport => ({ n, takings: 0, costs: 0, run: 0, notes: [] });

/** The world's ventures this game can have (adult ones only with adult content on; none with the system off). */
export function ventureDefs(g: Save | null | undefined, w: WorldDef): VentureDef[] {
    if (!systemOn(w, 'business')) return [];
    return (w.ventures ?? []).filter(v => !v.adult || (!!g && adultOn(g)));
}
export const ventureDef = (w: WorldDef, id: string) => (w.ventures ?? []).find(v => v.id === id) ?? null;
/** The venture as the game plays it: its world entry, while that entry is there and the system is on (a venture whose
 *  entry is gone, a world edited, is kept and does nothing). */
const live = (g: Save, w: WorldDef, s: VentureState) => (systemOn(w, 'business') ? ventureDefs(g, w).find(v => v.id === s.id) ?? null : null);
export const tierOf = (d: VentureDef, tier: number): TierDef => d.tiers[Math.min(d.tiers.length, Math.max(1, tier)) - 1];
export const ventureName = (w: WorldDef, s: VentureState) => s.name || ventureDef(w, s.id)?.name || s.id;
export const placesOf = (s: VentureState) => [s.place, ...(s.places ?? []), ...(s.opened ?? [])];
// (the places it runs at as a business, a second hotel or café; not the rooms an upgrade opened)
const sitesOf = (s: VentureState) => [s.place, ...(s.places ?? [])];
/** What kind of venture it is: one of each kind at a time (H-1); a café's kind is its track. */
export const kindOf = (d: VentureDef | null | undefined) => d?.kind ?? d?.track ?? '';
/** The venture you own that runs at this place, if any. */
export function ventureAt(g: Save, w: WorldDef, place: string): VentureState | null {
    if (!systemOn(w, 'business')) return null;
    return venturesOf(g).find(s => placesOf(s).includes(place) && !!live(g, w, s)) ?? null;
}
/** Are you running this venture yourself right now (a stint at its counter)? */
export function isRunning(g: Save, id?: string): boolean {
    const r = ((g as any).ventures as Ventures | undefined)?.running;
    return !!r && (!id || r.id === id);
}
/** What a result's `add` gives a venture (its points, inside the ceiling) and its `finds`: lines to show. */
export function resultAdds(g: Save, w: WorldDef, s: VentureState, r: WorkResult, ok: (n: number | undefined) => number = n => n ?? 0): string[] {
    const got = addAll(g, w, s, Object.fromEntries(Object.entries(r.add ?? {}).map(([k, v]) => [k, ok(v)])));
    const out = got.length ? [got.join(', ')] : [];
    if (r.finds) out.push(...ventureLink.find(g, w, r.finds));
    return out;
}
/** Points added to one of a venture's numbers (below 0 taken away), held between 0 and its tier's ceiling. Returns
 *  what was really added. */
export function addStat(g: Save, w: WorldDef, s: VentureState, stat: string, n: number): number {
    const d = ventureDef(w, s.id);
    if (!d || !statsOf(d).includes(stat) || !n) return 0;
    const cap = tierOf(d, s.tier)?.ceiling ?? 0;
    const was = s.stats[stat] ?? 0, now = Math.round(Math.max(0, Math.min(Math.max(cap, was), was + n)) * 10) / 10;
    s.stats[stat] = now;
    return now - was;
}
const addAll = (g: Save, w: WorldDef, s: VentureState, add: Record<string, number> | undefined): string[] => {
    const d = ventureDef(w, s.id), out: string[] = [];
    for (const [k, v] of Object.entries(add ?? {})) { const got = addStat(g, w, s, k, v); if (got) out.push(`${statName(d, k)} ${got > 0 ? '+' : '−'}${Math.abs(Math.round(got * 10) / 10)}`); }
    return out;
};

/* ---------- the growth model (B-15) ---------- */

/** A style's multiplier for one of the numbers (1 without a style, or one that doesn't say). */
const styleMul = (d: VentureDef, s: VentureState, stat: string) => styleDef(d, s.style)?.mul?.[stat] ?? 1;
const styleDef = (d: VentureDef, id?: string): StyleDef | null => (id ? d.styles?.find(x => x.id === id) ?? null : null);
/** How full the venture is, 0–1: its numbers (each by its style) against the tier's ceiling, the four as one. */
export function fill(d: VentureDef, s: VentureState, extra: Record<string, number> = {}): number {
    const t = tierOf(d, s.tier), stats = statsOf(d);
    if (!t || !stats.length) return 0;
    const sum = stats.reduce((a, k) => a + Math.min(t.ceiling, (s.stats[k] ?? 0) + (extra[k] ?? 0)) * styleMul(d, s, k), 0);
    return Math.max(0, sum / (stats.length * t.ceiling));
}
/** How busy the calendar makes a day at the venture: weekends, festivals (in its part of town, or anywhere), the
 *  season, how busy its place is and the mood of its part of town. 1 is an ordinary weekday. */
export function demandOn(g: Save, w: WorldDef, d: VentureDef, s: VentureState, day: number): number {
    const dm = d.demand ?? {};
    // (a weekday of its own, `days`, comes before the weekend rule)
    const wd = WD[((day - 1) % 7 + 7) % 7];
    let m = dm.days?.[wd] ?? (isWeekend(day) ? dm.weekend ?? VENTURE.weekend : 1);
    const region = regionOf(g, w, s.place);
    const fests = festivalsOn(g, w, day);
    // (a festival named in `festivals` counts for what it says, wherever it is: Christmas Eve fills every love hotel)
    const named = fests.map(f => dm.festivals?.[f.id]).filter((x): x is number => x !== undefined);
    if (named.length) m *= Math.max(...named);
    else if (fests.some(f => !f.place || (f.places ?? [f.place]).some(p => regionOf(g, w, p) === region))) m *= dm.festival ?? 1.3;
    else if (fests.length) m *= VENTURE.festival;
    const season = SEASONS[Math.floor((Math.max(1, day) - 1) / seasonDays(g)) % 4].id as SeasonId;
    m *= dm.season?.[season] ?? 1;
    m *= Math.sqrt(Math.max(0.3, placeOf(g, w, s.place)?.crowd ?? 1));
    if (systemOn(w, 'living')) m *= 1 + Math.max(-0.1, Math.min(0.1, (regionState(g, w, region).mood - 15) / 500));
    return m;
}
/** The share of a day's takings it earns: everything on a day you ran it, else its tier's share on its own (a
 *  manager raises it); 0 at a tier that only opens while you run it. */
export function shareOf(d: VentureDef, s: VentureState, ran: boolean): number {
    if (ran) return 1;
    const a = tierOf(d, s.tier)?.alone ?? 0;
    return a > 0 ? Math.min(0.95, a + (s.manager ? VENTURE.manager : 0)) : 0;
}
/** A day's takings (before the noise): the tier's `base` × how full it is × the day's demand × the share it earns; a
 *  hotel's by its rooms (sim/rooms.ts); a partnership's, your share of them. */
export const dayValue = (g: Save, w: WorldDef, d: VentureDef, s: VentureState, day: number, ran: boolean, extra?: Record<string, number>) =>
    (isHotel(d) ? hotelOn(g, w, d, s, day, extra).net : (tierOf(d, s.tier)?.base ?? 0) * fill(d, s, extra) * demandOn(g, w, d, s, day))
        * shareOf(d, s, ran) * mineOf(d, s) * closedOn(g, w, s, day);
/** (hospitality) A hotel's day at its tier: rooms, rooms open, how full, what comes in (sim/rooms.ts). */
export function hotelOn(g: Save, w: WorldDef, d: VentureDef, s: VentureState, day: number, extra: Record<string, number> = {}): HotelDay {
    const t = tierOf(d, s.tier), stats: Record<string, number> = { ...s.stats };
    for (const [k, v] of Object.entries(extra)) stats[k] = (stats[k] ?? 0) + v;
    const ids = statsOf(d);
    return hotelDay(t, tierStyle(d, s), ids, stats, k => styleMul(d, s, k), demandOn(g, w, d, s, day), ids.includes('capacity') ? 'capacity' : ids[2]);
}
// (a style's own prices count at its own tier only: the next tier's prices are its own)
const tierStyle = (d: VentureDef, s: VentureState) => { const st = styleDef(d, s.style); return st && st.tier === s.tier ? st : null; };
/** (hospitality) A night's and a rest's prices at the hotel's tier and style, as its day counts them (0: none). */
export const hotelPrices = (d: VentureDef, s: VentureState) => pricesOf(tierOf(d, s.tier), tierStyle(d, s));
/** (hospitality) How full a hotel is this week, about: the days' occupancy, this week's seven, as one. */
export function occupancyWeek(g: Save, w: WorldDef, d: VentureDef, s: VentureState): number {
    const from = weekOf(g.day) * 7 + 1;
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += hotelOn(g, w, d, s, from + i).occupancy;
    return sum / 7;
}
/** (hospitality) How full a hotel is right now: the day's occupancy by the hour (`demand.hours`), at most full. */
export const occupancyNow = (g: Save, w: WorldDef, d: VentureDef, s: VentureState) => Math.min(1, hotelOn(g, w, d, s, g.day).occupancy * hourMul(d, Math.floor(g.minutes / 60)));
/** Your share of what it earns: all of it, or in a partnership the tier's `share` (the ryokan: a third, then half). */
export const mineOf = (d: VentureDef, s: VentureState) => (s.way === 'partner' ? tierOf(d, s.tier)?.share ?? 0.5 : 1);
// A place closed all day on its weekday earns nothing that day.
const WD = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const closedOn = (g: Save, w: WorldDef, s: VentureState, day: number) => ((placeOf(g, w, s.place) as any)?.closedDays ?? []).includes(WD[((day - 1) % 7 + 7) % 7]) ? 0 : 1;
/** What a week would bring in, about (no noise; `run`: days you'd run it yourself, the rest on its own; `extra`:
 *  points you might add, for "what the next step would give"). Rent not taken off. */
export function weekGuess(g: Save, w: WorldDef, s: VentureState, run = 0, extra?: Record<string, number>): number {
    const d = ventureDef(w, s.id); if (!d || d.track === 'exec') return 0;
    const from = weekOf(g.day) * 7 + 1;
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += dayValue(g, w, d, s, from + i, i < run, extra);
    return Math.round(payOf(g, sum));
}
const ranOn = (s: VentureState, day: number) => (s.ran ?? []).includes(day);
// Each new day: yesterday's takings into the till; at a week's end the till paid to you, the rent taken, the report kept.
function dayEnds(g: Save, w: WorldDef, s: VentureState, d: VentureDef): string[] {
    const day = g.day - 1, out: string[] = [];
    if (d.track !== 'exec' && day >= s.since) {
        const noise = 1 - VENTURE.noise + 2 * VENTURE.noise * rnd(g, `venture|${s.id}|${day}`);
        const got = Math.round(payOf(g, dayValue(g, w, d, s, day, ranOn(s, day)) * noise));
        s.cash += got; s.week.takings += got;
    }
    if (weekOf(g.day) !== s.week.n) { if (d.track === 'exec') { s.last = s.week; s.week = blankWeek(weekOf(g.day)); } else out.push(...weekEnds(g, w, s, d)); }
    s.ran = (s.ran ?? []).filter(x => x > g.day - 15);
    return out;
}
function weekEnds(g: Save, w: WorldDef, s: VentureState, d: VentureDef): string[] {
    const name = ventureName(w, s), hotel = isHotel(d);
    // (tenants pay their rooms' rent with the week, B-19)
    const lets = tenantRent(g, w, s, d);
    if (lets) { s.cash += lets; s.week.takings += lets; }
    const rent = Math.round(priceOf(g, s.rent ?? 0));
    s.week.costs += rent;
    let net = s.cash - rent;
    // (the owner's note, H-2: its instalment out of what's left of the week, never out of your own money)
    const pay = s.owes ? Math.max(0, Math.min(s.owes, s.instalment ?? s.owes, net)) : 0;
    if (pay) { s.owes = Math.round(s.owes! - pay); net -= pay; s.week.costs += pay; s.week.note = pay; }
    g.player.money = Math.max(0, g.player.money + net);
    if (s.cash) book(g, `${name}: the week's takings`, s.cash);
    if (rent) book(g, `${name}: ${hotel ? 'upkeep' : 'rent'}`, -rent);
    if (pay) book(g, `${name}: the owner's note`, -pay);
    s.cash = 0;
    s.last = s.week; s.week = blankWeek(weekOf(g.day));
    const paid = pay ? (s.owes ? `, ${money(w, pay)} paid on the note (${money(w, s.owes)} still owed)` : `, ${money(w, pay)} paid on the note: it's paid off`) : '';
    if (pay && !s.owes) { delete s.owes; delete s.instalment; report(s, "The note is paid off: it's all yours."); }
    return [`${name}'s week: ${money(w, s.last.takings)} came in${rent ? `, ${money(w, rent)} of ${hotel ? 'upkeep' : 'rent'} went out` : ''}${paid}${s.last.run ? ` (you ran it ${s.last.run} day${s.last.run === 1 ? '' : 's'})` : ''}.`];
}
const report = (s: VentureState, line: string) => { s.week.notes = [...s.week.notes, line].slice(-8); };
/** A line in the venture's week's report (sim/sightings.ts: the notebook's). */
export const ventureReport = report;

/* ---------- tiers, milestones and styles ---------- */

/** What the next tier asks (its milestone, on the current tier): an upgrade owned, a story seen, a condition; null at
 *  the last tier, or for an executive's division (its tiers are ranks). */
export function milestoneOf(g: Save, w: WorldDef, s: VentureState): { next: TierDef; upgrade?: { u: UpgradeDef; owned: boolean }; story?: { id: string; seen: boolean }; when?: boolean; ready: boolean } | null {
    const d = live(g, w, s); if (!d || d.track === 'exec' || s.tier >= d.tiers.length) return null;
    const m = tierOf(d, s.tier).milestone ?? {}, next = d.tiers[s.tier];
    const u = m.upgrade ? d.upgrades?.find(x => x.id === m.upgrade) : undefined;
    const upgrade = u ? { u, owned: s.owned.includes(u.id) } : undefined;
    const story = m.story ? { id: m.story, seen: whenHolds(g, w, `seen: ${m.story}`) } : undefined;
    const when = m.when ? whenHolds(g, w, m.when, { place: s.place, key: `milestone|${s.id}|${s.tier}` }) : undefined;
    return { next, upgrade, story, when, ready: (!upgrade || upgrade.owned) && (!story || story.seen) && when !== false };
}
/** A new tier set from outside (an executive's division follows your rank): what upgrades held back counts now. */
export function retier(g: Save, w: WorldDef, s: VentureState, tier: number) { if (s.tier === tier) return; s.tier = tier; catchUp(g, w, s); }
/** The next tier when its milestone is met: the numbers keep what they have, the ceiling rises. */
function tierUp(g: Save, w: WorldDef, s: VentureState): string[] {
    const m = milestoneOf(g, w, s);
    if (!m?.ready) return [];
    s.tier++;
    catchUp(g, w, s);
    const d = ventureDef(w, s.id);
    if (d && s.partners?.length) s.partners = s.partners.map((p, i) => (i ? p : { ...p, share: Math.round((1 - mineOf(d, s)) * 100) / 100 }));
    const line = /^(the|with)\b/i.test(m.next.name) ? `${ventureName(w, s)} has moved up a tier: ${m.next.name}.` : `${ventureName(w, s)} is now ${tierWords(m.next.name)}.`;
    report(s, line);
    note(g, '{u}\'s {0} became {1}.', [ventureName(w, s), m.next.name.toLowerCase()], [], s.place, 'work');
    return [line];
}
/** A tier's name in a sentence: "a kissaten", "an old inn", or as it is when it reads on its own ("with the open-air
 *  bath", "the detached rooms"). */
export const tierWords = (name: string) => (/^(the|with)\b/i.test(name) ? name.toLowerCase() : `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name.toLowerCase()}`);
/** A day's takings with every number at the tier's ceiling and a full house (what a renovation is priced by): a
 *  hotel's rooms at its prices less its running costs, else the tier's `base`. */
const tierDay = (t: TierDef | undefined) => (t?.rooms ? t.rooms * ((t.prices?.stay ?? 0) + (t.rests ?? 0) * (t.prices?.rest ?? 0)) * (1 - (t.costs ?? 0)) : t?.base ?? 0);
/** The styles to choose from at the current tier (none: the one chosen before stays). */
export const stylesNow = (d: VentureDef, s: VentureState) => (d.styles ?? []).filter(x => x.tier === s.tier);
/** A style still to choose at this tier (free the first time). */
export const styleDue = (d: VentureDef, s: VentureState) => stylesNow(d, s).length > 0 && (s.styleTier ?? 0) < s.tier;
/** What a new style costs: nothing the first time at a tier, else a renovation. */
export function styleCost(g: Save, w: WorldDef, s: VentureState): number {
    const d = ventureDef(w, s.id); if (!d || styleDue(d, s)) return 0;
    return Math.round(priceOf(g, tierDay(tierOf(d, s.tier)) * VENTURE.renovate));
}
export function chooseStyle(g: Save, w: WorldDef, id: string, style: string): string {
    const s = venturesOf(g).find(x => x.id === id), d = s && live(g, w, s);
    const st = d && stylesNow(d, s!).find(x => x.id === style);
    if (!s || !d || !st) return '';
    if (s.style === style && !styleDue(d, s)) return `It is already ${st.name}.`;
    const cost = styleCost(g, w, s);
    if (cost > g.player.money) return `A new style means a renovation: ${money(w, cost)}.`;
    if (cost) { g.player.money -= cost; book(g, `${ventureName(w, s)}: renovation`, -cost); s.spent = (s.spent ?? 0) + cost; }
    s.style = style; s.styleTier = s.tier;
    // (each tier's choice is kept: the love hotel's window stays its window once its floors are themed)
    s.styles = { ...(s.styles ?? {}), [s.tier]: style };
    report(s, `New style: ${st.name}.`);
    note(g, '{u} made {0} {1}.', [ventureName(w, s), st.name], [], s.place, 'work');
    return cost ? `${ventureName(w, s)} is renovated: ${st.name}.` : `${ventureName(w, s)}: ${st.name}.`;
}

/* ---------- upgrades (B-16) ---------- */

export type UpgradeState = 'owned' | 'ready' | 'found' | 'hidden' | 'later';
/** Can this venture have this upgrade at all (its style, its places)? */
// (an upgrade only one style can find: its own `style`, or a style listing it in `finds`)
const styleOnly = (d: VentureDef, u: UpgradeDef) => u.style ?? (d.styles ?? []).find(x => x.finds?.includes(u.id))?.id;
const fits = (d: VentureDef, s: VentureState, u: UpgradeDef) => { const only = styleOnly(d, u); return (!only || only === s.style) && (!u.place || placesOf(s).includes(u.place)); };
/** Every upgrade of the venture as you'd see it: owned; ready to buy (basic, found, or earned and its condition holds);
 *  hidden (found ones still to find, earned ones whose condition doesn't hold yet: shown as hints); later (its tier
 *  isn't reached yet). With the price it would cost now. */
export function upgradesOf(g: Save, w: WorldDef, s: VentureState): { u: UpgradeDef; state: UpgradeState; price: number }[] {
    const d = live(g, w, s); if (!d) return [];
    return (d.upgrades ?? []).filter(u => s.owned.includes(u.id) || fits(d, s, u)).map(u => ({ u, state: upgradeState(g, w, d, s, u), price: upgradePrice(g, d, s, u) }));
}
function upgradeState(g: Save, w: WorldDef, d: VentureDef, s: VentureState, u: UpgradeDef): UpgradeState {
    if (s.owned.includes(u.id)) return 'owned';
    const open = u.how === 'basic' || (u.how === 'found' && s.found.includes(u.id)) || (u.how === 'earned' && (!u.when || whenHolds(g, w, u.when, { place: s.place, key: `upgrade|${s.id}|${u.id}` })));
    if (!open) return 'hidden';
    return u.tier > s.tier ? 'later' : u.how === 'found' ? 'found' : 'ready';
}
/** What an upgrade costs now: its price, raised for each upgrade of the same number you already own (B-15: each costs
 *  more than the last of its number), by the game's difficulty. */
export function upgradePrice(g: Save, d: VentureDef, s: VentureState, u: UpgradeDef): number {
    const before = s.owned.filter(id => id !== u.id && d.upgrades?.find(x => x.id === id)?.stat === u.stat).length;
    // (a partnership: you pay your share of it, as you're paid your share of the takings)
    return Math.round(priceOf(g, u.cost * VENTURE.rise ** before * mineOf(d, s)) / 100) * 100;
}
export function buyUpgrade(g: Save, w: WorldDef, id: string, upgrade: string): string {
    const s = venturesOf(g).find(x => x.id === id), d = s && live(g, w, s);
    const it = s && upgradesOf(g, w, s).find(x => x.u.id === upgrade);
    if (!s || !d || !it) return '';
    if (it.state === 'owned') return 'You have it already.';
    if (it.state === 'hidden') return it.u.how === 'found' ? 'Not found yet.' : 'Not yet: it has to be earned.';
    if (it.state === 'later') return `Only from the ${tierOf(d, it.u.tier).name.toLowerCase()} on.`;
    // (an executive's initiatives come out of the division's budget for the season, not your money)
    if (d.track === 'exec') {
        if (it.price > s.cash) return `It takes ${money(w, it.price)} of the budget; ${money(w, s.cash)} is left this season.`;
        s.cash -= it.price;
    } else {
        if (it.price > g.player.money) return `It costs ${money(w, it.price)}.`;
        g.player.money -= it.price; book(g, `${ventureName(w, s)}: ${it.u.name}`, -it.price);
        s.spent = (s.spent ?? 0) + it.price;
    }
    s.owned.push(it.u.id); s.found = s.found.filter(x => x !== it.u.id);
    const out = [`${ventureName(w, s)}: ${it.u.name}.`];
    const got = addStat(g, w, s, it.u.stat, it.u.add);
    if (got) out.push(`${statName(d, it.u.stat)} +${Math.round(got * 10) / 10}.`);
    else if (it.u.add > 0) out.push(`${statName(d, it.u.stat)} is at the ceiling of this tier: it counts once the next one opens.`);
    if (it.u.manager) { s.manager = true; out.push('A manager runs it on the days you don\'t.'); }
    if (it.u.opens && w.places.some(p => p.id === it.u.opens) && !placesOf(s).includes(it.u.opens)) { s.opened = [...(s.opened ?? []), it.u.opens]; out.push(`${placeOf(g, w, it.u.opens)?.name ?? it.u.opens} is open to you now.`); }
    if (it.u.staff) { const h = hire(g, w, s, it.u); if (h) out.push(`${h.name} joins: ${it.u.staff} (${h.quirk}).`); }
    report(s, `Bought: ${it.u.name}.`);
    note(g, '{u} got {0} for {1}.', [it.u.name, ventureName(w, s)], [], s.place, 'work');
    out.push(...tierUp(g, w, s));
    return out.join(' ');
}
// What an upgrade beyond the ceiling held back: a tier opened makes room for what was bought before it.
function catchUp(g: Save, w: WorldDef, s: VentureState) {
    const d = ventureDef(w, s.id); if (!d) return;
    const wanted: Record<string, number> = {};
    for (const id of s.owned) { const u = d.upgrades?.find(x => x.id === id); if (u) wanted[u.stat] = (wanted[u.stat] ?? 0) + u.add; }
    for (const id of s.disc) { const x = d.discoveries?.find(y => y.id === id); for (const [k, v] of Object.entries(x?.add ?? {})) wanted[k] = (wanted[k] ?? 0) + v; }
    const start = startOf(d, s.way, wayOf(d, s.way)?.tier ?? 1);
    for (const k of statsOf(d)) { const due = (start[k] ?? 0) + (wanted[k] ?? 0); if (due > (s.stats[k] ?? 0)) addStat(g, w, s, k, due - (s.stats[k] ?? 0)); }
}

/* ---------- staff (B-1) ---------- */

/** A hire from the world's pool: a name nobody else at your ventures has, and a quirk, seeded by the upgrade. */
function hire(g: Save, w: WorldDef, s: VentureState, u: UpgradeDef): { name: string; quirk: string } | null {
    const pool = w.staffPool;
    if (!pool?.names.length) return null;
    const taken = new Set(venturesOf(g).flatMap(x => x.staff.map(h => h.name)));
    const free = pool.names.filter(n => !taken.has(n));
    const list = free.length ? free : pool.names;
    const name = list[Math.floor(rnd(g, `hire|${s.id}|${u.id}`) * list.length)];
    const quirk = pool.quirks.length ? pool.quirks[Math.floor(rnd(g, `quirk|${s.id}|${u.id}`) * pool.quirks.length)] : '';
    const h = { name, quirk, for: u.id };
    s.staff.push(h);
    return h;
}

/* ---------- becoming yours (the takeover, a lease), selling ---------- */

type Way = 'takeover' | 'lease' | 'buy' | 'partner';
/** A way in's own entry in the world (its tier, its starting numbers, its note). */
const wayOf = (d: VentureDef, way: VentureState['way']) => (way === 'rank' ? undefined : d.ways?.[way]) as { tier?: number; start?: Record<string, number>; note?: { down: number; weeks: number }; endsJob?: string } | undefined;
/** The numbers a venture starts with: the way's own, else a third of the starting tier's ceiling each. */
export function startOf(d: VentureDef, way: VentureState['way'], tier: number): Record<string, number> {
    const own = wayOf(d, way)?.start;
    const cap = tierOf(d, tier)?.ceiling ?? 0;
    return Object.fromEntries(statsOf(d).map(k => [k, Math.min(cap, own?.[k] ?? Math.round(cap / 3))]));
}
/** A way in on offer: the venture, the way, its place, its price, its weekly rent or upkeep, and what you pay now
 *  (`down`: all of it, or the owner's note's down payment, the rest owed from the takings). */
export interface WayOpen { d: VentureDef; way: Way; place: string; cost: number; rent: number; down: number; note?: { weeks: number }; with?: string }
/** The ways in this game offers now: a takeover, a purchase or a partnership whose condition holds and story was seen,
 *  the units to lease. One venture of a kind at a time (H-1): a café you took over or a café of your own, not both
 *  (the café stays a life, not an empire); a capsule hotel, a ryokan and a love hotel beside each other. */
export function waysOpen(g: Save, w: WorldDef): WayOpen[] {
    const out: WayOpen[] = [];
    for (const d of ventureDefs(g, w)) {
        if (d.track === 'exec' || venturesOf(g).some(s => s.id === d.id || kindOf(ventureDef(w, s.id)) === kindOf(d))) continue;
        for (const way of ['takeover', 'buy', 'partner'] as const) {
            const t = d.ways?.[way] as { place?: string; when?: string; story?: string; cost: number; rent?: number; note?: { down: number; weeks: number }; with?: string } | undefined;
            if (!t || (t.when && !whenHolds(g, w, t.when, { place: t.place ?? d.place, key: `${way}|${d.id}` })) || (t.story && !whenHolds(g, w, `seen: ${t.story}`))) continue;
            const cost = Math.round(priceOf(g, t.cost)), down = t.note ? Math.round(cost * t.note.down / 100) * 100 : cost;
            out.push({ d, way, place: t.place ?? d.place ?? '', cost, rent: t.rent ?? 0, down, ...(t.note && down < cost ? { note: { weeks: t.note.weeks } } : {}), ...(t.with ? { with: t.with } : {}) });
        }
        for (const u of d.ways?.lease?.units ?? []) if (w.places.some(p => p.id === u.place)) { const cost = priceOf(g, u.cost); out.push({ d, way: 'lease', place: u.place, cost, rent: u.rent, down: cost }); }
    }
    return out;
}
/** It becomes yours: the key money or the move-in paid, its numbers as it starts, the week's report begun. `name`: a
 *  name of your own (a lease). */
const PAID_FOR: Record<Way, string> = { takeover: 'key money', lease: 'moving in', buy: 'the purchase', partner: 'buying in' };
export function openVenture(g: Save, w: WorldDef, id: string, way: Way, place: string, name?: string): string {
    const o = waysOpen(g, w).find(x => x.d.id === id && x.way === way && x.place === place);
    if (!o) return '';
    if (o.down > g.player.money) return `It takes ${money(w, o.down)} to start.`;
    const d = o.d, tier = wayOf(d, way)?.tier ?? 1;
    g.player.money -= o.down; book(g, `${d.name}: ${o.note ? 'the down payment' : PAID_FOR[way]}`, -o.down);
    const st = ventureStore(g);
    st.list = st.list.filter(x => x.id !== id);   // a closed one before it gives way
    const s: VentureState = { id, place, way, since: g.day, tier, stats: startOf(d, way, tier), owned: [], found: [], disc: [], staff: [], cash: 0, rent: o.rent, spent: o.cost, week: blankWeek(weekOf(g.day)) };
    // (the owner's note: what's left is paid from the takings, an instalment a week)
    if (o.note) { s.owes = o.cost - o.down; s.instalment = Math.ceil(s.owes / Math.max(1, o.note.weeks) / 100) * 100; }
    if (way === 'partner' && o.with) s.partners = [{ who: o.with, share: Math.round((1 - mineOf(d, s)) * 100) / 100 }];
    const own = name?.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (own && way === 'lease') s.name = own;
    st.list.push(s);
    const out = [way === 'partner' ? `You're a partner in ${ventureName(w, s)} now.` : `${ventureName(w, s)} is yours.`];
    if (s.owes) out.push(`The rest, ${money(w, s.owes)}, comes out of its takings: about ${money(w, s.instalment ?? 0)} a week.`);
    const job = wayOf(d, way)?.endsJob;
    if (job && g.player.job?.id === job) { quitJob(g, w); out.push('You run the place now, not a shift at it.'); }
    tallyEvent(g, 'business');
    report(s, { takeover: 'You took it over.', lease: 'You moved in.', buy: 'You bought it.', partner: 'You went into partnership.' }[way]);
    note(g, way === 'lease' ? '{u} opened {0}.' : way === 'partner' ? '{u} went into partnership in {0}.' : way === 'buy' ? '{u} bought {0}.' : '{u} took over {0}.', [ventureName(w, s)], [], place, 'work');
    hangouts(g, w, true);
    return out.join(' ');
}
/** What selling it would give back: a share of what it cost you. */
export const sellValue = (g: Save, s: VentureState) => Math.round(payOf(g, (s.spent ?? 0) * VENTURE.sell) / 100) * 100;
/** Who would buy it now for more than selling gives (a hotel chain): a buyer whose condition holds and story was seen. */
export function buyersOf(g: Save, w: WorldDef, s: VentureState): { id: string; name: string; price: number; text?: string }[] {
    const d = live(g, w, s); if (!d) return [];
    return (d.buyers ?? []).filter(b => (!b.when || whenHolds(g, w, b.when, { place: s.place, key: `buyer|${s.id}|${b.id}` })) && (!b.story || whenHolds(g, w, `seen: ${b.story}`)))
        .map(b => ({ id: b.id, name: b.name, price: Math.round(sellValue(g, s) * b.mul / 100) * 100, text: b.text }));
}
/** Sell it (a share of what it cost you back, or a buyer's price, less what's owed on the note) or close it (nothing
 *  back): it's kept as closed and does nothing. */
export function closeVenture(g: Save, w: WorldDef, id: string, sell = true, buyer?: string): string {
    const s = venturesOf(g).find(x => x.id === id);
    if (!s) return '';
    const b = buyer ? buyersOf(g, w, s).find(x => x.id === buyer) : undefined;
    if (buyer && !b) return '';
    const back = sell ? Math.max(0, (b?.price ?? sellValue(g, s)) - (s.owes ?? 0)) : 0;
    delete s.owes; delete s.instalment;
    s.cash = 0; s.closed = g.day; delete s.event;
    if (back) { g.player.money += back; book(g, `${ventureName(w, s)}: sold`, back); }
    note(g, sell ? '{u} sold {0}.' : '{u} closed {0}.', [ventureName(w, s)], [], s.place, 'work');
    hangouts(g, w, true);
    return sell ? `You sold ${ventureName(w, s)}${b ? ` to ${b.name}` : ''} for ${money(w, back)}.` : `You closed ${ventureName(w, s)}.`;
}
/** A later tier runs at more places: the units it could open at next (not the one it runs at). */
export function morePlaces(g: Save, w: WorldDef, s: VentureState): { place: string; cost: number; rent: number }[] {
    const d = live(g, w, s); if (!d) return [];
    if (sitesOf(s).length >= (tierOf(d, s.tier)?.places ?? 1)) return [];
    return (d.more ?? d.ways?.lease?.units ?? []).filter(u => !placesOf(s).includes(u.place) && w.places.some(p => p.id === u.place)).map(u => ({ place: u.place, cost: priceOf(g, u.cost), rent: u.rent }));
}
export function addPlace(g: Save, w: WorldDef, id: string, place: string): string {
    const s = venturesOf(g).find(x => x.id === id);
    const u = s && morePlaces(g, w, s).find(x => x.place === place);
    if (!s || !u) return '';
    if (u.cost > g.player.money) return `It takes ${money(w, u.cost)} to open there.`;
    g.player.money -= u.cost; book(g, `${ventureName(w, s)}: a second place`, -u.cost);
    s.spent = (s.spent ?? 0) + u.cost; s.places = [...(s.places ?? []), place]; s.rent = (s.rent ?? 0) + u.rent;
    const where = placeOf(g, w, place)?.name ?? place;
    report(s, `Opened at ${where}.`);
    note(g, '{u} opened {0} at {1}.', [ventureName(w, s), where], [], place, 'work');
    hangouts(g, w, true);
    return `${ventureName(w, s)} opens at ${where} too.`;
}

/* ---------- running it yourself (P-2) ---------- */

/** Its hours today: the venture's own, else its place's opening hours. */
const hoursOf = (g: Save, w: WorldDef, d: VentureDef, s: VentureState): [number, number] | null => styleDef(d, s.style)?.hours ?? d.hours ?? (placeOf(g, w, g.player.loc) ?? placeOf(g, w, s.place) as any)?.open ?? null;
/** Why you can't run it now ('' when you can): you're not there, it's closed, you're on a shift at your job, you're
 *  already at it, or it's an executive's division (worked through the job). */
export function runBlock(g: Save, w: WorldDef, s: VentureState): string {
    const d = live(g, w, s);
    if (!d || d.track === 'exec') return 'There is no counter to run.';
    if (!placesOf(s).includes(g.player.loc)) return `You run it at ${placeOf(g, w, s.place)?.name ?? 'its place'}.`;
    if (isRunning(g)) return 'You are already at it.';
    const o = myJob(g, w);
    if (o && shiftNow(g, w, o)) return 'You are due at work.';
    const h = hoursOf(g, w, d, s), now = g.minutes / 60;
    if (h ? !(h[0] <= h[1] ? now >= h[0] && now < h[1] : now >= h[0] || now < h[1]) : !openAt(g, w, g.player.loc)) return 'It is closed at this hour.';
    return '';
}
/** How many hours a stint would be now: the venture's stint, cut short by closing time and by your next shift. */
export function stintHours(g: Save, w: WorldDef, s: VentureState): number {
    const d = ventureDef(w, s.id); if (!d) return 0;
    let h = d.stint ?? VENTURE.stint;
    const o = hoursOf(g, w, d, s), now = g.minutes / 60;
    if (o) { const left = ((o[1] - now) % 24 + 24) % 24; if (left > 0) h = Math.min(h, left); }
    return Math.max(1, Math.floor(h));
}
/** A stint at your own counter: the hours pass (like a shift), your needs pay for them, you practise its skills, the day
 *  counts as run (all the day's takings, and the first tier opens at all), and now and then one of its events comes,
 *  or a discovery. Returns the lines for the screen. */
export function runStint(g: Save, w: WorldDef, id: string, hours?: number): string[] {
    const s = venturesOf(g).find(x => x.id === id), d = s && live(g, w, s);
    if (!s || !d || runBlock(g, w, s)) return [];
    const h = Math.max(1, Math.min(stintHours(g, w, s), Math.round(hours ?? stintHours(g, w, s))));
    const st = ventureStore(g), day = g.day;
    st.running = { id, until: nowAbs(g) + h * 60 };
    const out: string[] = [];
    try { out.push(...advance(g, w, h * 60)); } finally { delete st.running; }
    for (const [k, v] of Object.entries(VENTURE.cost)) addStatus(g, w, k, -v * h);
    if (!ranOn(s, day)) { s.ran = [...(s.ran ?? []), day]; (s.week.n === weekOf(day) ? s.week : (s.last ??= blankWeek(weekOf(day)))).run++; }
    out.unshift(isHotel(d) ? `You worked the front desk at ${ventureName(w, s)} for ${h} hour${h === 1 ? '' : 's'}.` : `You ran ${ventureName(w, s)} for ${h} hour${h === 1 ? '' : 's'}.`);
    for (const k of d.trains ?? []) out.push(...trainSkill(g, w, k, VENTURE.train * h));
    out.push(...discover(g, w, s, d));
    out.push(...ventureLink.stint(g, w, s.id));
    rollEvent(g, w, s, d);
    out.push(...tierUp(g, w, s));
    return out;
}
// While you run it yourself: the first discovery whose condition holds now (one a stint), kept for good.
function discover(g: Save, w: WorldDef, s: VentureState, d: VentureDef): string[] {
    const x = (d.discoveries ?? []).find(x => !s.disc.includes(x.id) && (!x.when || whenHolds(g, w, x.when, { place: g.player.loc, key: `disc|${s.id}|${x.id}` })));
    if (!x) return [];
    s.disc.push(x.id);
    const got = addAll(g, w, s, x.add);
    report(s, `Discovered: ${x.name}.`);
    return [`✦ ${x.name}: ${x.text}${got.length ? ` (${got.join(', ')})` : ''}`];
}

/* ---------- its events (the work-event format, sim/workevents.ts) ---------- */

const ventureEvents = (g: Save, w: WorldDef, s: VentureState, d: VentureDef): WorkEvent[] =>
    eventsReady(g, w, d.events, g.player.loc, e => `venture|${s.id}|${e.id}`);
// After a stint, now and then (one day in five or so, never twice a day): one of its events whose condition holds,
// waiting for your choice.
function rollEvent(g: Save, w: WorldDef, s: VentureState, d: VentureDef) {
    delete s.event;
    if (s.evDay === g.day || rnd(g, `vevent|${s.id}|${nowAbs(g)}`) >= VENTURE.events) return;
    const list = ventureEvents(g, w, s, d);
    if (list.length) { s.event = { id: list[Math.floor(rnd(g, `vpick|${s.id}|${nowAbs(g)}`) * list.length)].id, day: g.day }; s.evDay = g.day; }
}
/** The venture event waiting for your choice (with the choices you can make now), if any. */
export function pendingVentureEvent(g: Save, w: WorldDef): { s: VentureState; ev: WorkEvent; choices: { c: WorkEvent['choices'][number]; i: number }[] } | null {
    for (const s of venturesOf(g)) {
        const d = live(g, w, s), ev = s.event && d?.events?.find(e => e.id === s.event!.id);
        if (!d || !ev || s.event!.day < g.day - 1) continue;
        const choices = ev.choices.map((c, i) => ({ c, i })).filter(x => choiceOpen(g, w, x.c, s.place, `vchoice|${s.id}|${ev.id}|${x.i}`));
        if (choices.length) return { s, ev, choices };
    }
    return null;
}
/** Where a venture's results land: the place, its name in the ledger, its numbers (`add`), an upgrade found. */
const resultCtx = (g: Save, w: WorldDef, s: VentureState, from: string) => ({
    place: s.place, name: () => ventureName(w, s), label: ventureName(w, s), key: `venture:${s.id}`, boost: `venture:${s.id}:${from}`, gentle: false,
    // (an executive's cards and events move your performance at the job, as its own events do)
    perf: ventureDef(w, s.id)?.track === 'exec' ? (n: number) => addPerf(g, w, n) : undefined,
    more: (r: WorkResult, ok: (n: number | undefined) => number) => resultAdds(g, w, s, r, ok),
});
export function chooseVentureEvent(g: Save, w: WorldDef, i: number, rand = Math.random): string[] {
    const p = pendingVentureEvent(g, w), pick = p?.choices.find(x => x.i === i);
    if (!p || !pick) return [];
    delete p.s.event;
    const d = ventureDef(w, p.s.id)!;
    const { ok, res, line } = rollChoice(g, w, pick.c, ['venture', p.s.id, d.track], rand);
    const out = line ? [line] : [];
    out.push(...applyWorkResult(g, w, res, resultCtx(g, w, p.s, p.ev.id), rand));
    out.push(...choicePractice(g, w, pick.c.roll?.skill, ok, res.trains));
    report(p.s, `${p.ev.setup.split(/(?<=[.!?])\s/)[0]} → ${pick.c.label}.`);
    return out;
}
export const dropVentureEvent = (g: Save) => { for (const s of venturesOf(g)) delete s.event; };

/* ---------- calendar cards (B-17: at most one choice a week, none required) ---------- */

/** The card waiting for you this week, if any (with its venture and the choices open now). */
export function pendingCard(g: Save, w: WorldDef): { s: VentureState; card: CardDef; choices: { c: CardDef['choices'][number]; i: number }[] } | null {
    const c = ((g as any).ventures as Ventures | undefined)?.card;
    const s = c && venturesOf(g).find(x => x.id === c.venture), d = s && live(g, w, s);
    const card = d?.cards?.find(x => x.id === c!.id);
    if (!c || !s || !card || c.day < g.day - 1 || (card.adult && !adultOn(g))) return null;
    const choices = card.choices.map((x, i) => ({ c: x, i })).filter(x => choiceOpen(g, w, x.c, s.place, `cchoice|${s.id}|${card.id}|${x.i}`));
    return choices.length ? { s, card, choices } : null;
}
// Each day: a card whose day it is, when none was put to you this week (seeded, one of all your ventures' cards).
function drawCard(g: Save, w: WorldDef) {
    const st = ventureStore(g), wk = weekOf(g.day);
    if (st.card && st.card.day < g.day - 1) delete st.card;
    if (st.cardWeek === wk || st.card) return;
    const year = Math.floor((g.day - 1) / (4 * seasonDays(g))), seen = new Set(st.seen ?? []);
    const all = venturesOf(g).flatMap(s => { const d = live(g, w, s); return (d?.cards ?? []).filter(c => (!c.adult || adultOn(g)) && !seen.has(`${s.id}:${c.id}:${year}`)
        && (!c.when || whenHolds(g, w, c.when, { place: s.place, key: `card|${s.id}|${c.id}`, day: true }))).map(c => ({ s, c })); });
    if (!all.length) return;
    const pick = all[Math.floor(rnd(g, `card|${g.day}`) * all.length)];
    st.card = { venture: pick.s.id, id: pick.c.id, day: g.day }; st.cardWeek = wk;
    st.seen = [...seen, `${pick.s.id}:${pick.c.id}:${year}`].slice(-40);
}
/** Your choice on the card: its roll if it has one, then what it does (money, the venture's numbers, needs, feelings);
 *  `minutes`: the time it takes. */
export function chooseCard(g: Save, w: WorldDef, i: number, rand = Math.random): string[] {
    const p = pendingCard(g, w), pick = p?.choices.find(x => x.i === i);
    if (!p || !pick) return [];
    delete ventureStore(g).card;
    const d = ventureDef(w, p.s.id)!;
    const { res, line } = rollChoice(g, w, pick.c, ['venture', p.s.id, d.track], rand);
    const out = line ? [line] : [];
    out.push(...applyWorkResult(g, w, res, resultCtx(g, w, p.s, p.card.id), rand));
    report(p.s, `${pick.c.label}.`);
    if (pick.c.minutes) out.push(...advance(g, w, pick.c.minutes));
    return out;
}
/** Let the card go (it costs only what it would have given). */
export const skipCard = (g: Save) => { delete ventureStore(g).card; };

/* ---------- a place your friends come to (V10) ---------- */

// The kinds of place a place is (its tags but the general ones).
const kinds = (w: WorldDef, id: string) => (w.places.find(p => p.id === id)?.tags ?? []).filter(t => t !== 'work' && t !== 'leisure');
/** Today's friends who may come by your ventures: people at Good friend or closer whose leisure places include one
 *  of the same kind (a café for someone who goes to cafés), made once a day (and again when a venture opens or
 *  closes, from a click) so where people are stays the same through the day. */
function hangouts(g: Save, w: WorldDef, force = false) {
    const st = ((g as any).ventures as Ventures | undefined);
    if (!st || (!force && st.hang?.day === g.day)) return;
    const who: Record<string, string[]> = {};
    const open = venturesOf(g).map(s => ({ s, d: live(g, w, s) })).filter(x => x.d && x.d.track !== 'exec' && x.d.hangout !== false && ((tierOf(x.d, x.s.tier)?.alone ?? 0) > 0 || x.s.tier > 1));
    if (open.length) for (const r of Object.values(g.cast) as Resident[]) {
        if (!r.met || (r as any).gone || !levelHolds(g, w, r.avatar, 'good')) continue;
        const liked = new Set(r.leisure.flatMap(id => kinds(w, id)));
        const places = open.flatMap(x => sitesOf(x.s)).filter(p => kinds(w, p).some(k => liked.has(k)) && !r.leisure.includes(p));
        if (places.length) who[r.avatar] = places;
    }
    st.hang = { day: g.day, who };
}
/** The venture places someone may spend their free time at today (sim/people.ts adds them to their favorites). */
export const hangoutsOf = (g: Save, avatar: string): string[] => {
    const h = ((g as any).ventures as Ventures | undefined)?.hang;
    return h && h.day === g.day ? h.who[avatar] ?? [] : [];
};

/* ---------- tenants (B-19: a room for a business of their own, never staff) ---------- */

/** The rooms you could let now: a tenancy of a venture of yours whose person is in the game (met, not gone), not
 *  renting anywhere yet, whose condition holds and story was seen (adult ones only with adult content on). */
export function tenancyOffers(g: Save, w: WorldDef): { s: VentureState; d: VentureDef; t: NonNullable<VentureDef['tenancies']>[number]; r: Resident }[] {
    const out: { s: VentureState; d: VentureDef; t: NonNullable<VentureDef['tenancies']>[number]; r: Resident }[] = [];
    const renting = new Set(venturesOf(g).flatMap(s => (s.tenants ?? []).map(x => x.who.toLowerCase())));
    for (const s of venturesOf(g)) {
        const d = live(g, w, s); if (!d) continue;
        for (const t of d.tenancies ?? []) {
            if (t.adult && !adultOn(g)) continue;
            const r = personNamed(g, t.who);
            if (!r || !r.met || (r as any).gone || renting.has(r.name.toLowerCase()) || (s.tenants ?? []).some(x => x.id === t.id)) continue;
            if (t.when && !whenHolds(g, w, t.when, { place: s.place, key: `tenancy|${s.id}|${t.id}` })) continue;
            if (t.story && !whenHolds(g, w, `seen: ${t.story}`)) continue;
            out.push({ s, d, t, r });
        }
    }
    return out;
}
/** Let the room: they move their business in (their own job, their own hours), its numbers get what they bring. */
export function letRoom(g: Save, w: WorldDef, id: string, tenancy: string): string {
    const o = tenancyOffers(g, w).find(x => x.s.id === id && x.t.id === tenancy);
    if (!o) return '';
    o.s.tenants = [...(o.s.tenants ?? []), { id: o.t.id, who: o.r.name, since: g.day }];
    // (their business moves in: the job it is theirs from today, as their story's ending would give it)
    if (o.t.job && systemOn(w, 'jobs') && w.occupations.some(x => x.id === o.t.job) && o.r.occupation !== o.t.job) { o.r.occupation = o.t.job; delete ((g as any).living?.ranks ?? {})[o.r.avatar]; }
    const got = addAll(g, w, o.s, o.t.add);
    report(o.s, `${o.r.name} rents a room.`);
    note(g, '{0} rents a room at {u}\'s {1}.', [o.r.name, ventureName(w, o.s)], [o.r.avatar], o.s.place, 'work');
    return [o.t.text ?? `${o.r.name} rents a room at ${ventureName(w, o.s)}.`, got.length ? `(${got.join(', ')})` : ''].filter(Boolean).join(' ');
}
// What the tenants pay a week (their tenancy's rent, by the game's prices), for those still in the game.
function tenantRent(g: Save, w: WorldDef, s: VentureState, d: VentureDef): number {
    let n = 0;
    for (const x of s.tenants ?? []) { const t = d.tenancies?.find(y => y.id === x.id), r = personNamed(g, x.who); if (t && r && !(r as any).gone) n += priceOf(g, t.rent); }
    return Math.round(n);
}
// A tenant works at the venture's place while it's yours and their job is the tenancy's (sim/dayplan.ts asks).
ventureLink.workPlace = (g, w, avatar) => {
    if (!systemOn(w, 'business')) return null;
    const r = g.cast[avatar]; if (!r) return null;
    for (const s of venturesOf(g)) {
        const x = (s.tenants ?? []).find(t => t.who.toLowerCase() === r.name.toLowerCase()); if (!x) continue;
        const d = live(g, w, s), t = d?.tenancies?.find(y => y.id === x.id);
        if (t && (!t.adult || adultOn(g)) && (!t.job || r.occupation === t.job)) return s.place;
    }
    return null;
};

// (hospitality) The owner's rate: at a hotel of yours, a room and what the place charges cost you as little as prices
// can go (the laundry and the room's upkeep), through the effects every price reads (sim/worldstate.ts pricePerk).
effectSources.push((g, w): EffectDef[] => {
    if (!systemOn(w, 'business') || !w.ventures) return [];
    return venturesOf(g).filter(s => isHotel(live(g, w, s))).flatMap(s => placesOf(s).map(p => ({ kind: 'price' as const, value: -0.5, target: p })));
});

/* ---------- what the AI is told ---------- */

/** What the AI is told about the venture at this place (empty elsewhere): you own it, its tier and style in a phrase,
 *  today's crowd, the hired hands on, the event waiting; while you run it yourself, that you're behind the counter. */
export function ventureLine(g: Save, w: WorldDef): string {
    if (!systemOn(w, 'business') || !venturesOf(g).length) return '';
    const s = ventureAt(g, w, g.player.loc), d = s && live(g, w, s);
    // (an executive at the office: the division and what's at stake this season, the board's target against how it stands)
    if (s && d?.track === 'exec') { const want = execTarget(s.tier); return `{{user}} runs ${d.name} here, as ${tierOf(d, s.tier).name}. This season the board wants the division at ${Math.round(want * 100)}%; it stands at ${Math.round(fill(d, s) * 100)}%.`; }
    if (!s || !d) return '';
    const t = tierOf(d, s.tier), st = styleDef(d, s.style), hotel = isHotel(d);
    const busy = demandOn(g, w, d, s, g.day) * fill(d, s);
    const crowd = busy > 0.9 ? 'busy, every seat taken' : busy > 0.5 ? 'a steady crowd' : busy > 0.25 ? 'a few customers' : 'quiet';
    // (a hotel: how many of its rooms are taken at this hour)
    const h = hotel ? hotelOn(g, w, d, s, g.day) : null, taken = h ? Math.round(h.open * occupancyNow(g, w, d, s)) : 0;
    const today = h ? `Right now ${taken} of its ${h.open} rooms are taken${taken >= h.open ? ' (full)' : ''}.` : `Today it's ${crowd}.`;
    const staff = s.staff.slice(0, 3).map(h => `${h.name} (${h.quirk})`);
    const ev = pendingVentureEvent(g, w);
    const owns = s.way === 'partner' ? `{{user}} is a partner in this place${s.partners?.[0] ? ` beside ${s.partners[0].who}'s family, who keep an equal say` : ''}` : '{{user}} owns this place';
    const lets = (s.tenants ?? []).map(x => x.who).filter(n => personNamed(g, n));
    return [`${owns}: ${ventureName(w, s)}, ${tierWords(t.name)}${st ? ` (${st.name}: ${st.desc})` : ''}. ${today}`,
        isRunning(g, s.id) || ranOn(s, g.day) ? (hotel ? '{{user}} is working the front desk.' : '{{user}} is working behind the counter.') : '',
        staff.length ? `Hired hands working here (background, not characters): ${staff.join('; ')}.` : '',
        lets.length ? `Renting a room here for a business of their own (tenants, not staff): ${lets.join(', ')}.` : '',
        // (a love hotel's house rule: who stays here is never told, B-14)
        d.sightings?.length || d.notebook ? 'The house rule: who comes in with whom is never told to anyone.' : '',
        ev?.s === s ? `Something going on: ${ev.ev.setup}` : ''].filter(Boolean).join(' ');
}

// An upgrade turned up by a story (or an event): kept as found in the venture it belongs to, if you own that venture.
ventureLink.find = (g, w, id) => {
    if (!systemOn(w, 'business')) return [];
    for (const s of venturesOf(g)) {
        const d = live(g, w, s), u = d?.upgrades?.find(x => x.id === id);
        if (!d || !u || s.owned.includes(id) || s.found.includes(id)) continue;
        s.found.push(id);
        report(s, `Found: ${u.name}.`);
        return [`Found for ${ventureName(w, s)}: ${u.name}${u.cost ? ` (${money(w, upgradePrice(g, d, s, u))})` : ''}. It waits in the Business app.`];
    }
    return [];
};

// Each new day: the takings, the week's report, a tier whose milestone came, a calendar card, today's friends.
onDay.push((g, w) => {
    if (!systemOn(w, 'business') || !venturesOf(g).length) return [];
    const out: string[] = [];
    ventureStore(g);
    for (const s of venturesOf(g)) {
        const d = live(g, w, s); if (!d) continue;
        out.push(...dayEnds(g, w, s, d));
        out.push(...tierUp(g, w, s));
    }
    drawCard(g, w);
    hangouts(g, w);
    return out;
});
// After a story or anything else: a milestone met moves the tier up at once (its scene was the story).
onLook.push((g, w) => {
    if (!systemOn(w, 'business') || !venturesOf(g).length) return;
    for (const s of venturesOf(g)) tierUp(g, w, s);
});
