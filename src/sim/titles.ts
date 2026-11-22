// The adult industry's titles (plans/adult-industry.md, "Titles"): offers to a performer and briefs to a director each
// Monday (by rank, performance, the labels that know you, the month's hot and cold genres), each with a contract that
// lists every scene and co-star, checked against everyone's limits with the private moments' word test (yours too: a
// list of your own, empty at first); asking for a scene off; the law's month of waiting, then a shoot day at a set (a
// `set` plan with Tokyo's people in it, the call at 09:00, the set itself played by sim/onset.ts through `setLink`);
// the director's edit; the release four months on; sales each Monday by quality, label, genre, fame and the trend,
// fading over a season; the weekly chart among made-up titles; the month's hot and cold genres in the news; cancelling a
// title; the `industry` royalty source (a name director's share, the star-producer's fan club). `performingLink` and
// the condition keys `titles`, `chart` and `seat` are answered here. What the Take app shows comes from the views at
// the end. With the industry off (no block, the system or adult content off) nothing here reads or writes the save.
import { nowAbs, residentsOf, type Save } from '../core/store.js';
import type { WorldDef, ActionDef, LabelDef, GenreDef, SetDef, ThreadStage } from '../core/world.js';
import { INDUSTRY, INDUSTRY_PAY_MAX, type Seat, type TitleScene, type SetCall } from '../core/industry.js';
import { onDay, onHour, onAction, onWrap, onRelease, setLink, performingLink, industryLink, engineActions, stageGives } from './hooks.js';
import {
    peekIndustry, industryOf, industryOn, inIndustry, directing, seatsNow, labelsOf, genresOf, setsOf, rosterOf, labelOf, genreOf, setOf, rosterPerson,
    homeLabel, monthDays, waitDays, releaseDays, monthOf, isMonday, onPath, fameOf, STAR_PATH, titleWords,
    type Title, type Offer, type ChartRow, type IndustryState,
} from './industry.js';
import {
    BOOKINGS, burnout, testDue, testNext, offerExclusive, answerContract, renewContract, releaseFans, offerMeeting, fanClubWeek, takeEntry, offerEntry,
    contractDef, titleQuality,
} from './bookings.js';
import { myJob, rankOf, trackOf, realDays, payMul, perfOf, addPerf } from './work.js';
import { ROYALTY_SOURCES } from './royalties.js';
import { inviteSet, check } from './plans.js';
import { social } from './social.js';
import { matchIn, limitsOf } from './private.js';
import { fr, YOU } from './rel.js';
import { FRIEND_TIERS, shutOut } from './romance.js';
import { isMinor } from './family.js';
import { genderOf } from './gender.js';
import { rollBonus, rollD20 } from './dice.js';
import { npcRank } from './longlife.js';
import { placeOf } from './places.js';
import { atHomeNow } from './photo.js';
import { seasonDays, hm } from './time.js';
import { payOf } from './bills.js';
import { effectMul } from './effects.js';
import { money } from './needs.js';
import { book } from './ledger.js';
import { note } from './facts.js';

/** The rules' numbers (first guesses, tuned by the long run). */
export const TITLES = {
    /** offers kept, titles kept (older ones folded into the totals), days an offer is kept */
    offers: 6, keep: 80, offerDays: 7,
    /** the call time and the latest the shoot can begin (hours), a shoot day's length (minutes, for the `set` plan) */
    call: 9, lastCall: 18, shootMinutes: 9 * 60,
    /** a label's tier as a multiple of sales (tier 2 is 1) */
    tier: [0, 0.6, 1, 1.6],
    /** the trend's hot and cold genres' weight when offers and briefs pick a genre; your own top genres' */
    hotPick: 2, coldPick: 0.5, minePick: 1.5,
    /** made-up titles on the chart, at least and at most; the chart's rows */
    madeUp: [8, 12], rows: 10,
    /** the edit: hours a scene, its lift at most, days before the label's editor takes it */
    editHours: 2, lift: 15, editDays: 7,
    /** a cover shot by a director from the lens: week one's sales × this */
    lensCover: 1.05,
    /** a roster performer's fame by rank; a Tokyo co-star's by job rank */
    rosterFame: 18, npcFame: 12,
    /** how far ahead a shoot day can be found for Tokyo's co-stars (days after the wait), the choices offered */
    search: 10, choices: 3,
};
const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
function pickW<T>(list: T[], weight: (x: T) => number, r: number): T | undefined {
    const ws = list.map(x => Math.max(0, weight(x))), sum = ws.reduce((a, b) => a + b, 0);
    if (!list.length || sum <= 0) return undefined;
    let t = r * sum;
    for (let i = 0; i < list.length; i++) { t -= ws[i]; if (t < 0) return list[i]; }
    return list[list.length - 1];
}
const listed = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? '');
const newId = (g: Save) => () => industryOf(g).nextId++;
const titleById = (g: Save, id: string) => peekIndustry(g).titles.find(t => t.id === id);
const offerById = (g: Save, id: number) => peekIndustry(g).offers.find(o => o.id === id);

/* ---------- performers ---------- */

/** The roster id a cast entry stands for: `roster:<id>`, or the card of a roster performer on set (by name); else ''. */
export function rosterIdOf(g: Save, w: WorldDef, who: string): string {
    if (who.startsWith('roster:')) return who.slice(7);
    const r = g.cast[who];
    return r && (r as any).onset ? rosterOf(w).find(p => p.name === r.name)?.id ?? '' : '';
}
/** A cast entry's name: you, a roster performer, one of Tokyo's people. */
export function performerName(g: Save, w: WorldDef, who: string, you = 'You'): string {
    if (who === YOU) return you;
    const rid = rosterIdOf(g, w, who);
    return (rid && rosterPerson(w, rid)?.name) || g.cast[who]?.name || '';
}
/** Someone's hard limits as the word test reads them: yours (your own list for contracts), a roster performer's profile,
 *  one of Tokyo's people's (as private moments read them). */
export function performerLimits(g: Save, w: WorldDef, who: string): string[] {
    if (who === YOU) return peekIndustry(g).limits;
    const rid = rosterIdOf(g, w, who);
    if (rid) return (rosterPerson(w, rid)?.intimate?.limits ?? []).filter(s => typeof s === 'string' && s.trim());
    return limitsOf(g, who);
}
/** The words a scene is tested by: its kind (whole, and each of its longer words: a "rough take" meets "nothing rough")
 *  and its genre's words. */
const sceneWords = (genre: GenreDef | undefined, kind: string) => [...new Set([kind, ...kind.split(/[^\p{L}\p{N}]+/u).filter(x => x.length >= 4), ...(genre?.words ?? [])].filter(Boolean))];
/** The first limit of someone in the scene its words match ('' when it fits everyone): the private moments' word test. */
export function sceneLimit(g: Save, w: WorldDef, genre: GenreDef | undefined, s: TitleScene): string {
    const words = sceneWords(genre, s.kind);
    for (const who of s.with) { const hit = matchIn(g, words, performerLimits(g, w, who)); if (hit) return hit; }
    return '';
}
/** A performer's fame for sales: yours (performing), a roster performer's by rank, a Tokyo co-star's by their job rank. */
function starFame(g: Save, w: WorldDef, who: string): number {
    if (who === YOU) return fameOf(g, 'perform');
    const rid = rosterIdOf(g, w, who);
    if (rid) return Math.min(100, (rosterPerson(w, rid)?.rank ?? 0) * TITLES.rosterFame);
    return g.cast[who] ? Math.min(100, npcRank(g, who) * TITLES.npcFame) : 0;
}
const acquaintance = () => FRIEND_TIERS.find(t => t.id === 'acquaintance')?.lo ?? 15;
/** Tokyo's people who can be in your titles: those in the industry's job you've met (acquaintances or closer), and
 *  those who said yes (a deciding scene); never a minor, someone gone, or someone who shuts you out. */
export function tokyoCast(g: Save, w: WorldDef): string[] {
    const yes = peekIndustry(g).yes, job = w.industry?.job;
    return residentsOf(g).filter(r => !(r as any).gone && r.met && !isMinor(g, r.avatar) && !shutOut(g, r.avatar)
        && ((r.occupation === job && fr(g, r.avatar, YOU) >= acquaintance()) || yes[r.avatar] !== undefined)).map(r => r.avatar);
}
/** Roster performers working now (debuted). */
export const rosterNow = (g: Save, w: WorldDef) => rosterOf(w).filter(p => (p.debut ?? 0) <= g.day);
const genderOfCast = (g: Save, w: WorldDef, who: string) => (who.startsWith('roster:') ? rosterPerson(w, who.slice(7))?.gender : genderOf(g, who));

/* ---------- the trend ---------- */

/** The month's hot and cold genres: drawn on the month's first look (two hot, one cold; never hot two months running),
 *  with a line for the news. Lines (the news) when it changes. */
export function settleTrend(g: Save, w: WorldDef): string[] {
    const gs = genresOf(w), m = monthOf(g), st = industryOf(g);
    if (st.trend.month === m || gs.length < 2) return [];
    const last = new Set(st.trend.hot), hot: string[] = [];
    const pool = gs.filter(x => !last.has(x.id));
    for (let i = 0; i < 2 && pool.length; i++) { const x = pickW(pool, gx => gx.pay ?? 1, H(`${g.world}|trend|${m}|${i}`)); if (!x) break; hot.push(x.id); pool.splice(pool.indexOf(x), 1); }
    const rest = gs.filter(x => !hot.includes(x.id)), cold = rest[Math.floor(H(`${g.world}|cold|${m}`) * rest.length)]?.id ?? '';
    const names = (ids: string[]) => listed(ids.map(id => genreOf(w, id)?.name ?? id));
    const line = `This month in adult video: ${names(hot)} ${hot.length > 1 ? 'are' : 'is'} selling${cold ? `, ${genreOf(w, cold)?.name ?? cold} has gone quiet` : ''}.`;
    st.trend = { month: m, hot, cold, line };
    return inIndustry(g, w) || seatsNow(g, w).length ? [line] : [];
}
/** The trend's multiple for a genre now (hot, cold or neither). */
export function trendOf(g: Save, w: WorldDef, genre: string): number {
    const t = peekIndustry(g).trend, s = w.industry?.sales ?? INDUSTRY.sales;
    return t.month !== monthOf(g) ? 1 : t.hot.includes(genre) ? s.hot : t.cold === genre ? s.cold : 1;
}

/* ---------- offers and briefs ---------- */

/** The labels that know you: the director's label always, any you've made a title with, and the tiers your rank reaches
 *  (rank 1 tier 1, 3 tier 2, 5 tier 3); one whose standing you spent (a scene asked off) waits out its week. */
export function knownLabels(g: Save, w: WorldDef): LabelDef[] {
    const st = peekIndustry(g), made = new Set(st.titles.map(t => t.label)), rank = g.player.job?.rank ?? 0, home = homeLabel(w);
    return labelsOf(w).filter(l => (l === home || made.has(l.id) || (l.tier ?? 2) <= 1 + Math.floor(rank / 2)) && !((st.standing[l.id]?.until ?? 0) > g.day));
}
/** Your top genres: the three you've made most. */
export function topGenres(g: Save): string[] {
    const n = new Map<string, number>();
    for (const t of peekIndustry(g).titles) if (!t.cancelled) n.set(t.genre, (n.get(t.genre) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(x => x[0]);
}
function genreFor(g: Save, w: WorldDef, label: LabelDef, salt: string): GenreDef | undefined {
    const own = (label.genres ?? []).map(id => genreOf(w, id)).filter((x): x is GenreDef => !!x);
    const pool = own.length ? own : genresOf(w), mine = topGenres(g), t = peekIndustry(g).trend, now = t.month === monthOf(g);
    return pickW(pool, x => (now && t.hot.includes(x.id) ? TITLES.hotPick : now && t.cold === x.id ? TITLES.coldPick : 1) * (mine.includes(x.id) ? TITLES.minePick : 1), H(salt));
}
/** Where a label shoots a genre: its own set, else one suiting the genre, else the first; one with a place first. */
export function setFor(w: WorldDef, label: LabelDef | undefined, genre: GenreDef | undefined): SetDef | undefined {
    const sets = setsOf(w), placed = sets.filter(s => s.place);
    const own = label?.set ? setOf(w, label.set) : undefined;
    return (own?.place ? own : undefined) ?? placed.find(s => !!genre && (s.genres ?? []).includes(genre.id)) ?? placed[0] ?? own ?? sets[0];
}
/** The place a set's shoot is at ('' none: an off-screen shoot, begun wherever you are). */
export const setPlace = (w: WorldDef, set: SetDef | undefined) => (set?.place && w.places.some(p => p.id === set.place) ? set.place : '');
/** Co-stars for a performer's title: roster performers near your rank (their genres first) and Tokyo's people in the
 *  industry, of the other gender (a player with none: anyone), each one only once. */
function coStars(g: Save, w: WorldDef, genre: GenreDef | undefined, n: number, salt: string, avoid: string[] = []): string[] {
    const mine = genderOf(g, YOU), rank = g.player.job?.rank ?? 0, out: string[] = [];
    const cands = [...rosterNow(g, w).map(p => `roster:${p.id}`), ...tokyoCast(g, w)].filter(x => !avoid.includes(x));
    const fits = (x: string) => !mine || genderOfCast(g, w, x) !== mine;
    const pool = cands.filter(fits).length ? cands.filter(fits) : cands;
    for (let i = 0; i < n; i++) {
        const x = pickW(pool.filter(p => !out.includes(p)), p => {
            const rid = p.startsWith('roster:') ? p.slice(7) : '', rp = rid ? rosterPerson(w, rid) : undefined;
            const near = rp ? 1 / (1 + Math.abs((rp.rank ?? 0) - Math.min(4, rank))) : 0.8;
            return near * (genre && (rp?.genres ?? []).includes(genre.id) ? 2 : 1);
        }, H(`${salt}|co|${i}`));
        if (x) out.push(x);
    }
    return out;
}
/** The scenes of a title: two to four of its genre's kinds, each with you (when you're in it) and a co-star in turn;
 *  any scene past someone's limit is left out (`dropped`, by kind), never offered. */
export function buildScenes(g: Save, w: WorldDef, genre: GenreDef | undefined, cast: string[], salt: string, count?: number): { scenes: TitleScene[]; dropped: string[] } {
    const kinds = genre?.scenes?.length ? genre.scenes : ['scene'], [lo, hi] = INDUSTRY.scenes;
    const n = Math.max(lo, Math.min(hi, count ?? 2 + Math.floor(H(`${salt}|n`) * 3)));
    const you = cast.includes(YOU), others = cast.filter(x => x !== YOU), scenes: TitleScene[] = [], dropped: string[] = [];
    for (let i = 0; i < n; i++) {
        const kind = kinds[(Math.floor(H(`${salt}|k`) * kinds.length) + i) % kinds.length];
        const pair = others.length ? [others[i % others.length]] : [];
        const extra = others.length > 2 && i === n - 1 ? others.filter(x => !pair.includes(x)).slice(0, 1) : [];
        const s: TitleScene = { kind, with: [...(you ? [YOU] : []), ...pair, ...extra] };
        if (!s.with.length) continue;
        if (sceneLimit(g, w, genre, s)) dropped.push(kind); else scenes.push(s);
    }
    return { scenes, dropped };
}
/** A title's fee for you: the rank's pay × the job's shift, × the genre's and label's pay, an exclusive's fee for its
 *  label, the pay effects and the difficulty. */
export function titleFee(g: Save, w: WorldDef, label: string, genre: string, seat: Seat = 'perform'): number {
    const o = myJob(g, w);
    if (!o) return 0;
    const t = trackOf(g, o), c = peekIndustry(g).seats.perform?.contract;
    const ex = seat === 'perform' && c && c.label === label ? c.fee : 1;
    return Math.min(INDUSTRY_PAY_MAX, payOf(g, rankOf(g, o).pay * (t.shift || 8) * (genreOf(w, genre)?.pay ?? 1) * (labelOf(w, label)?.pay ?? 1) * ex * payMul(g, w, o, 'wage')));
}
const NAMES = ['Midnight', 'Lessons', 'Secret', 'Summer', 'Heat', 'Velvet', 'Afterhours', 'Desire', 'Weekend', 'Close', 'Neon', 'Diary', 'Rain', 'Hotel', 'Sweet', 'Temptation'];
/** A made-up title's name: two of the chart's words (the world's list, else plain ones); a list of whole titles (any
 *  entry with a space: "Housewarming" beside "Late Checkout" is a whole title too) is used as it is. */
export function madeUpName(w: WorldDef, salt: string): string {
    const list = w.industry?.chart?.names?.length ? w.industry.chart.names : NAMES;
    if (list.some(x => /\s/.test(x))) return list[Math.floor(H(salt) * list.length)];
    const a = list[Math.floor(H(`${salt}|a`) * list.length)], b = list[Math.floor(H(`${salt}|b`) * list.length)];
    return a === b ? a : `${a} ${b}`;
}
/** A new title's name: a made-up one, numbered as a sequel when one of your titles or offers has it already ("Late
 *  Checkout 2"). */
export function titleName(g: Save, w: WorldDef, salt: string): string {
    const name = madeUpName(w, salt), st = peekIndustry(g);
    const taken = new Set([...st.titles.map(t => t.name), ...st.offers.map(o => o.name ?? '')]);
    if (!taken.has(name)) return name;
    for (let n = 2; n < 100; n++) if (!taken.has(`${name} ${n}`)) return `${name} ${n}`;
    return name;
}
/** Offers a week: your rank's days (fewer with a low performance: offers dry up to one a week instead of a sack); an
 *  exclusive's titles a month. */
export function offersAWeek(g: Save, w: WorldDef): number {
    const o = myJob(g, w);
    if (!o || !inIndustry(g, w)) return 0;
    const c = peekIndustry(g).seats.perform?.contract, d = contractDef(g, w);
    if (c && d && !directing(g, w)) { const n = ((d.titles ?? 2) * 7) / monthDays(g); return Math.floor(n) + (H(`${g.world}|ex|${g.day}`) < n % 1 ? 1 : 0); }
    const perf = perfOf(g);
    // (never above the rank's days, so promotion keeps the shift job's pace; never below one: performance only comes back
    // through titles)
    return Math.max(1, realDays(trackOf(g, o), rankOf(g, o)) - (perf < 40 ? 1 : 0) - (perf < 20 ? 1 : 0));
}
/** One offer (a performer's title) or brief (a director's) from a label, or null when nothing fits (no genre, no
 *  co-star, every scene past a limit). */
export function drawOffer(g: Save, w: WorldDef, kind: 'title' | 'brief', label: LabelDef, salt: string, own = false): Offer | null {
    const genre = genreFor(g, w, label, `${salt}|g`);
    if (!genre) return null;
    const set = setFor(w, label, genre), st = industryOf(g);
    const name = titleName(g, w, `${salt}|name`);
    if (kind === 'brief') {
        const star = own ? undefined : H(`${salt}|star`) < 1 / 3 ? rosterNow(g, w).filter(p => (p.genres ?? []).includes(genre.id) || !p.genres?.length)[0]?.id : undefined;
        return { id: st.nextId++, kind: 'brief', day: g.day, until: g.day + TITLES.offerDays, label: label.id, genre: genre.id, name, set: set?.id, fee: titleFee(g, w, label.id, genre.id, 'direct'), ...(star ? { star } : {}), ...(own ? { own: true as const } : {}) };
    }
    for (let tries = 0; tries < 3; tries++) {
        const co = coStars(g, w, genre, genre.id === 'ensemble' || /ensemble/i.test(genre.name) ? 2 : 1, `${salt}|${tries}`);
        if (!co.length) return null;
        const cast = [YOU, ...co], built = buildScenes(g, w, genre, cast, `${salt}|${tries}`);
        if (!built.scenes.length) continue;
        return { id: st.nextId++, kind: 'title', day: g.day, until: g.day + TITLES.offerDays, label: label.id, genre: genre.id, name, set: set?.id, cast, scenes: built.scenes,
            fee: titleFee(g, w, label.id, genre.id), ...(built.dropped.length ? { dropped: built.dropped } : {}) };
    }
    return null;
}
/** Monday's offers and briefs (offers dried up when performance is low; an exclusive's from its label only; the very
 *  first always from the director's label), the actress's exclusive offer, renewal and fan meeting. Lines. */
export function fillOffers(g: Save, w: WorldDef): string[] {
    if (!inIndustry(g, w)) return [];
    const st = industryOf(g);
    if (st.drawn === g.day) return [];
    st.drawn = g.day;
    const out: string[] = [];
    out.push(...renewContract(g, w, newId(g)));
    const dir = directing(g, w), star = !dir && onPath(g, w, STAR_PATH), c = st.seats.perform?.contract;
    const first = !st.titles.length && !st.totals.titles && !st.offers.some(o => o.kind === 'title' || o.kind === 'brief');
    let labels = knownLabels(g, w);
    if (c && !dir) labels = labels.filter(l => l.id === c.label).length ? labels.filter(l => l.id === c.label) : [labelOf(w, c.label)!].filter(Boolean);
    const n = Math.min(TITLES.offers, offersAWeek(g, w)), made: Offer[] = [];
    for (let i = 0; i < n && labels.length; i++) {
        const label = first && i === 0 && homeLabel(w) && !c ? homeLabel(w)! : pickW(labels, l => 1 + (st.standing[l.id]?.n ?? 0) * 0.1, H(`${g.world}|lab|${g.day}|${i}`))!;
        const o = drawOffer(g, w, dir ? 'brief' : 'title', label, `${g.world}|${g.day}|${i}`);
        if (o) made.push(o);
    }
    if (star) { const lb = (c && labelOf(w, c.label)) || homeLabel(w); const o = lb && drawOffer(g, w, 'brief', lb, `${g.world}|${g.day}|own`, true); if (o) made.push(o); }
    for (const o of [offerExclusive(g, w, newId(g)), offerMeeting(g, w, newId(g))]) if (o) made.push(o);
    st.offers.push(...made);
    st.offers = st.offers.slice(-(TITLES.offers + 4));
    const titles = made.filter(o => o.kind === 'title' || o.kind === 'brief').length;
    if (titles) out.push(`${titles === 1 ? 'A new offer' : `${titles} new offers`} in Take.`);
    if (made.some(o => o.kind === 'exclusive')) out.push(`${labelOf(w, made.find(o => o.kind === 'exclusive')!.label)?.name ?? 'A label'} offers you an exclusive contract: see Take.`);
    if (made.some(o => o.kind === 'fans')) out.push('Your agency set up a fan meeting this month: see Take.');
    return out;
}

/* ---------- taking an offer, the contract, the wait ---------- */

const takenTitles = (g: Save) => peekIndustry(g).titles.filter(t => !t.cancelled && t.q === undefined);
/** The days a title can be shot: from the law's wait on, the next free days (no other shoot that day) on which every
 *  Tokyo co-star is free for the day; at most three. */
export function shootDays(g: Save, w: WorldDef, id: string): number[] {
    const t = titleById(g, id);
    if (!t || t.q !== undefined || t.cancelled) return [];
    const from = Math.max(g.day + 1, t.contract + waitDays(g)), busy = new Set(takenTitles(g).filter(x => x !== t).map(x => x.shoot)), out: number[] = [];
    const place = setPlace(w, setOf(w, t.set));
    for (let d = from; d < from + TITLES.search && out.length < TITLES.choices; d++) {
        if (busy.has(d)) continue;
        if (place && t.cast.some(x => x !== YOU && !x.startsWith('roster:') && !freeFor(g, w, x, place, d, t))) continue;
        out.push(d);
    }
    return out;
}
const callOf = (day: number) => day * 1440 + TITLES.call * 60;
// (a Tokyo co-star's answer for that day, as the `set` plan would ask it, their own plan for this title set aside)
function freeFor(g: Save, w: WorldDef, who: string, place: string, day: number, t: Title): boolean {
    const s = social(g), mine = new Set(t.plans ?? []), keep = s.appts.filter(a => mine.has(a.id));
    s.appts = s.appts.filter(a => !mine.has(a.id));
    try { return check(g, w, who, place, callOf(day), callOf(day) + TITLES.shootMinutes, 'set', -100).ok; }
    finally { s.appts.push(...keep); }
}
/** Sets (or moves) a title's shoot day: one of `shootDays`, while the monthly test isn't overdue; Tokyo's co-stars get a
 *  `set` plan for the day at the set (their old one for this title called off, nobody blamed). */
export function setShootDay(g: Save, w: WorldDef, id: string, day: number): { ok: boolean; text: string } {
    const t = titleById(g, id);
    if (!t || !industryOn(g, w)) return { ok: false, text: '' };
    if (testDue(g)) return { ok: false, text: 'Your monthly test is overdue: take it at a clinic first.' };
    if (!shootDays(g, w, id).includes(day)) return { ok: false, text: 'That day is not free.' };
    const s = social(g), place = setPlace(w, setOf(w, t.set));
    for (const a of s.appts) if ((t.plans ?? []).includes(a.id) && a.state === 'set') a.state = 'cancelled';
    t.plans = [];
    for (const x of t.cast) if (x !== YOU && !x.startsWith('roster:') && place) { const r = inviteSet(g, w, x, place, callOf(day), TITLES.shootMinutes, t.name); if (r.id) t.plans.push(r.id); }
    t.shoot = day;
    return { ok: true, text: `The shoot for "${t.name}" is set: ${dayWords(g, day)} from ${hm(TITLES.call * 60)}${place ? ` at ${placeOf(g, w, place)?.name ?? place}` : ''}.` };
}
const dayWords = (g: Save, day: number) => (day === g.day ? 'today' : day === g.day + 1 ? 'tomorrow' : `in ${day - g.day} days`);
function newTitle(g: Save, w: WorldDef, o: Offer, you: Seat[], cast: string[], scenes: TitleScene[], fee: number, extra: Partial<Title> = {}): Title {
    const st = industryOf(g);
    const t: Title = { id: `t${st.nextId++}`, name: o.name ?? titleName(g, w, `${g.day}|${o.id}`), genre: o.genre ?? '', label: o.label ?? '', you, cast, scenes, set: o.set ?? '',
        contract: g.day, shoot: 0, release: 0, sold: 0, weeks: 0, adult: true, ...(fee ? { fee } : {}), ...extra };
    st.titles.push(t);
    return t;
}
/** Takes an offer: a performer's title (its contract signed, the shoot set on the first free day after the wait), an
 *  exclusive or a renewal (yes), a fan meeting (its pay), the lens's entry. */
export function takeOffer(g: Save, w: WorldDef, id: number): { ok: boolean; text: string; title?: string } {
    const o = offerById(g, id);
    if (!o || !industryOn(g, w)) return { ok: false, text: '' };
    const st = industryOf(g);
    if (o.kind === 'exclusive' || o.kind === 'renewal') return { ok: true, text: answerContract(g, w, o, true) };
    if (o.kind === 'entry') return takeEntry(g, w, o);
    if (o.kind === 'fans') {
        st.offers = st.offers.filter(x => x !== o);
        const pay = o.amount ?? 0;
        if (pay > 0) { g.player.money += pay; book(g, 'Fan meeting', pay); }
        note(g, '{u} held a fan meeting in Akihabara.', [], [], g.player.loc, 'work');
        return { ok: true, text: `Your fan meeting: handshakes, cheki and a long line${pay ? `: +${money(w, pay)}` : ''}.` };
    }
    if (o.kind === 'brief') return { ok: false, text: 'Plan the title first: pick the cast and the set.' };
    if (!inIndustry(g, w)) return { ok: false, text: '' };
    if (testDue(g)) return { ok: false, text: 'Your monthly test is overdue: take it at a clinic first.' };
    const genre = genreOf(w, o.genre), scenes = (o.scenes ?? []).filter(s => !sceneLimit(g, w, genre, s));
    if (!scenes.length) return { ok: false, text: 'Nothing is left in this contract that everyone in it agrees to.' };
    const t = newTitle(g, w, o, ['perform'], o.cast ?? [YOU], scenes, o.fee ?? 0);
    st.offers = st.offers.filter(x => x !== o);
    const days = shootDays(g, w, t.id);
    if (!days.length) { st.titles = st.titles.filter(x => x !== t); return { ok: false, text: 'Nobody in the cast is free for a shoot day soon.' }; }
    const r = setShootDay(g, w, t.id, days[0]);
    note(g, '{u} signed a contract for "{0}" with {1}.', [t.name, labelOf(w, t.label)?.name ?? t.label], [], g.player.loc, 'work');
    return { ok: true, text: `You signed the contract for "${t.name}" (${labelOf(w, t.label)?.name ?? t.label}). ${r.text}`, title: t.id };
}
/** Turns an offer down (an exclusive or a renewal: no). */
export function declineOffer(g: Save, w: WorldDef, id: number): string {
    const o = offerById(g, id);
    if (!o) return '';
    if (o.kind === 'exclusive' || o.kind === 'renewal') return answerContract(g, w, o, false);
    industryOf(g).offers = industryOf(g).offers.filter(x => x !== o);
    return o.kind === 'entry' ? 'You turn the offer down for now.' : '';
}
/** Asks for a scene off your contract (never the last one): it goes, and that label's standing drops (its offers stop
 *  for a week). */
export function askSceneOff(g: Save, w: WorldDef, id: number, i: number): { ok: boolean; text: string } {
    const o = offerById(g, id), st = industryOf(g);
    if (!o || o.kind !== 'title' || !o.scenes?.[i]) return { ok: false, text: '' };
    if (o.scenes.length < 2) return { ok: false, text: 'That is the only scene: turn the offer down instead.' };
    const [s] = o.scenes.splice(i, 1);
    const lb = (st.standing[o.label!] ??= { n: 0 }); lb.n--; lb.until = g.day + 7;
    return { ok: true, text: `${labelOf(w, o.label)?.name ?? 'The label'} takes the ${s.kind} scene off your contract. They'll remember it for a while.` };
}
/** Your own limits (set in Take): a scene whose words match one is never in your contracts. */
export function setLimits(g: Save, list: string[]) { industryOf(g).limits = [...new Set(list.map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 20); }
/** Tokyo's person said yes to being in your titles (a deciding scene: sim/stance.ts or a storyline). */
export function castYes(g: Save, avatar: string, yes = true) { const st = industryOf(g); if (yes) st.yes[avatar] = g.day; else delete st.yes[avatar]; }

/* ---------- briefs (the director, the star-producer) ---------- */

/** Who a brief can cast: roster performers working now, Tokyo's people who can, and you. */
export function castChoices(g: Save, w: WorldDef): { id: string; name: string; rank?: number; tokyo?: true; you?: true; titles: number }[] {
    const st = peekIndustry(g);
    return [
        { id: YOU, name: 'You', you: true as const, titles: 0 },
        ...rosterNow(g, w).map(p => ({ id: `roster:${p.id}`, name: p.name, rank: p.rank ?? 0, titles: st.roster[p.id]?.titles ?? 0 })),
        ...tokyoCast(g, w).map(a => ({ id: a, name: g.cast[a]?.name ?? '', tokyo: true as const, titles: st.titles.filter(t => t.cast.includes(a)).length })),
    ];
}
/** A script for one of your titles (Kanon's, a storyline's or a scene's gift): kept until a brief uses it. */
export function giveScript(g: Save, n = 1) { const st = industryOf(g); st.scripts = Math.max(0, (st.scripts ?? 0) + n); }
/** Plans a brief into a title: the cast (at least one performer besides you; the star-producer is always in it), the
 *  set (one with a place), a script you were given (used up). Every scene past a limit is left out. */
export function planBrief(g: Save, w: WorldDef, id: number, plan: { cast: string[]; set?: string; script?: boolean }): { ok: boolean; text: string; title?: string } {
    const o = offerById(g, id), st = industryOf(g);
    if (!o || o.kind !== 'brief' || !inIndustry(g, w)) return { ok: false, text: '' };
    if (testDue(g) && (o.own || plan.cast.includes(YOU))) return { ok: false, text: 'Your monthly test is overdue: take it at a clinic first.' };
    const ok = new Set(castChoices(g, w).map(c => c.id));
    const cast = [...new Set([...(o.own ? [YOU] : []), ...plan.cast])].filter(x => ok.has(x));
    if (cast.filter(x => x !== YOU).length < 1) return { ok: false, text: 'Cast at least one performer.' };
    if (o.star && !cast.includes(`roster:${o.star}`)) return { ok: false, text: `The label wants ${rosterPerson(w, o.star)?.name ?? 'its star'} in it.` };
    const set = setOf(w, plan.set ?? o.set) ?? setFor(w, labelOf(w, o.label), genreOf(w, o.genre));
    const genre = genreOf(w, o.genre), built = buildScenes(g, w, genre, cast, `${g.world}|brief|${o.id}`);
    if (!built.scenes.length) return { ok: false, text: 'Nothing in this genre fits everyone\'s limits.' };
    if (plan.script && !(st.scripts ?? 0)) return { ok: false, text: 'You have no script to use.' };
    const you: Seat[] = cast.includes(YOU) ? ['perform', 'direct'] : ['direct'];
    const t = newTitle(g, w, { ...o, set: set?.id }, you, cast, built.scenes, o.fee ?? 0, { brief: true, ...(plan.script ? { script: true as const } : {}) });
    if (plan.script) st.scripts = (st.scripts ?? 1) - 1;
    st.offers = st.offers.filter(x => x !== o);
    const days = shootDays(g, w, t.id);
    if (!days.length) { st.titles = st.titles.filter(x => x !== t); st.offers.push(o); if (plan.script) st.scripts = (st.scripts ?? 0) + 1; return { ok: false, text: 'Nobody in the cast is free for a shoot day soon.' }; }
    const r = setShootDay(g, w, t.id, days[0]);
    return { ok: true, text: `"${t.name}" is planned: ${listed(cast.map(x => performerName(g, w, x, 'you')))}, ${built.scenes.length} scenes.${built.dropped.length ? ` (${listed(built.dropped)} left out: someone's limits.)` : ''} ${r.text}`, title: t.id };
}

/* ---------- the shoot day ---------- */

/** The call for a title's shoot (what the set needs): the title, its place, 09:00 that day, the roster performers. */
export function callFor(g: Save, w: WorldDef, t: Title): SetCall {
    return { title: t, place: setPlace(w, setOf(w, t.set)), call: callOf(t.shoot), roster: t.cast.map(x => rosterIdOf(g, w, x)).filter(Boolean) };
}
/** A title to be shot today whose call has come and that hasn't begun: begun once you're at the set's place (or anywhere
 *  for a set without a place), from the call time until the last call. Lines. */
export function callTick(g: Save, w: WorldDef): string[] {
    if (!industryOn(g, w)) return [];
    const now = nowAbs(g), out: string[] = [];
    for (const t of peekIndustry(g).titles as Title[]) {
        if (t.shoot !== g.day || t.q !== undefined || t.cancelled || t.started) continue;
        const call = callOf(t.shoot), place = setPlace(w, setOf(w, t.set));
        if (!t.warned && now >= call - 60 && now < call) { t.warned = true; out.push(`Shoot today: "${t.name}"${place ? ` at ${placeOf(g, w, place)?.name ?? place}` : ''}, call at ${hm(TITLES.call * 60)}.`); }
        if (now < call || now >= g.day * 1440 + TITLES.lastCall * 60 || (place && g.player.loc !== place) || setLink.current(g)) continue;
        t.started = true;
        out.push(`The shoot for "${t.name}" begins.`, ...setLink.start(g, w, callFor(g, w, t)));
    }
    return out;
}
/** Plays a shoot's scenes no set played (each a d20 + the genre's skill, burnout and Kanon's script against the genre's
 *  difficulty, one harder each scene), the parts named as the set's are. */
export function rollScenes(g: Save, w: WorldDef, t: Title, rnd = Math.random) {
    const genre = genreOf(w, t.genre), skill = genre?.skill ?? (t.you.includes('direct') && !t.you.includes('perform') ? 'logic' : 'sensuality');
    const bonus = rollBonus(g, w, { skill, tags: ['set', t.genre] }), tired = burnout(g, w), script = t.script ? 2 : 0;
    t.scenes.forEach((s, i) => {
        if (s.grade) return;
        const dc = (genre?.dc ?? 12) + i, d = rollD20(g, w, bonus - tired + script, dc, rnd), total = d + bonus - tired + script;
        s.grade = d === 20 || total >= dc + 5 ? 'great' : total >= dc ? 'good' : 'poor';
        s.q = Math.max(5, Math.min(100, Math.round(50 + 6 * (total - dc))));
        s.parts = [{ name: 'The roll', add: d }, { name: genre?.skill ? `Your ${genre.skill}` : 'You', add: bonus }, ...(tired ? [{ name: 'Burnout', add: -tired }] : []), ...(script ? [{ name: 'The script', add: script }] : [])];
    });
}
/** Ends a shoot now: the set wraps it when it's the one being played (sim/onset.ts calls the `onWrap` steps), else its
 *  scenes are rolled here and the steps called. Lines. */
export function wrapNow(g: Save, w: WorldDef, id: string, rnd = Math.random): string[] {
    const t = titleById(g, id);
    if (!t || t.q !== undefined || t.cancelled) return [];
    const out: string[] = [];
    if (setLink.current(g)?.title.id === t.id) out.push(...setLink.wrap(g, w));
    if (t.q === undefined) { rollScenes(g, w, t, rnd); for (const f of onWrap) out.push(...f(g, w, t)); }
    return out;
}
/** A shoot day gone by: wrapped if it began (whatever the set left unplayed is rolled), else missed: the title is
 *  dropped, the label remembers, performance drops. Lines. */
function pastShoots(g: Save, w: WorldDef): string[] {
    const st = industryOf(g), out: string[] = [];
    for (const t of [...st.titles] as Title[]) {
        if (t.q !== undefined || t.cancelled || !t.shoot || t.shoot >= g.day) continue;
        if (t.started) { out.push(...wrapNow(g, w, t.id)); continue; }
        st.titles = st.titles.filter(x => x !== t);
        const lb = (st.standing[t.label] ??= { n: 0 }); lb.n += BOOKINGS.missed.standing; lb.until = g.day + 7;
        for (const a of social(g).appts) if ((t.plans ?? []).includes(a.id) && a.state === 'set') a.state = 'cancelled';
        out.push(`You missed the shoot for "${t.name}": ${labelOf(w, t.label)?.name ?? 'the label'} recast it, and won't forget.`);
        if (inIndustry(g, w)) out.push(...addPerf(g, w, BOOKINGS.missed.perf));
    }
    return out;
}

/* ---------- the edit ---------- */

export const EDIT_ID = 'x-ind-edit-';
/** Titles you directed waiting for your edit (within a week of the wrap). */
export const toEdit = (g: Save) => (peekIndustry(g).titles as Title[]).filter(t => t.you.includes('direct') && t.q !== undefined && t.edited === undefined && !t.cancelled);
/** Where you can edit: at home, or at your label's set. */
export const canEditHere = (g: Save, w: WorldDef, t: Title) => atHomeNow(g) || g.player.loc === setPlace(w, setOf(w, labelOf(w, t.label)?.set));
/** Edits a title you directed: the takes chosen and the mosaic done, a lift of up to +15 by Logic and Photography (in
 *  full for a director from the lens). Lines. */
export function editTitle(g: Save, w: WorldDef, id: string, rnd = Math.random): string[] {
    const t = titleById(g, id) as Title | undefined;
    if (!t || !toEdit(g).includes(t)) return [];
    const lens = !!peekIndustry(g).seats.direct?.lens;
    const bonus = rollBonus(g, w, { skill: 'logic', tags: ['edit'] }) + (lens ? rollBonus(g, w, { skill: 'photography', tags: ['edit'] }) : Math.floor(rollBonus(g, w, { skill: 'photography', tags: ['edit'] }) / 2));
    const d = rollD20(g, w, bonus, 12, rnd), lift = Math.max(0, Math.min(TITLES.lift, Math.round((d + bonus - 8) * 1.2)));
    t.q = Math.min(100, (t.q ?? 50) + lift); t.cut = lift; t.edited = g.day;
    note(g, '{u} edited "{0}".', [t.name], [], g.player.loc, 'work');
    return [`You edited "${t.name}": ${lift ? `quality +${lift}, now ${t.q}` : `it stays at ${t.q}`}.`];
}
engineActions.push((g, w) => {
    if (!inIndustry(g, w)) return [];
    return toEdit(g).filter(t => canEditHere(g, w, t)).map(t => ({ id: `${EDIT_ID}${t.id}`, name: 'Edit the title', label: `Edit "${t.name}"`, icon: '🎞️', cost: 0, effects: { energy: -3 }, scene: false, tags: ['industry'],
        minutes: Math.max(60, t.scenes.length * TITLES.editHours * 60), outcomes: [{ weight: 1, text: 'You go through the takes and do the mosaic: the cut is done.' }] }) as unknown as ActionDef);
});
// (the edit is judged as it begins: the hours pass after)
onAction.push((g, w, a) => { if (a.id.startsWith(EDIT_ID) && inIndustry(g, w)) editTitle(g, w, a.id.slice(EDIT_ID.length)); });
function editTimeouts(g: Save): string[] {
    const out: string[] = [];
    for (const t of toEdit(g)) if (t.shoot && g.day - t.shoot >= TITLES.editDays) { t.edited = g.day; t.cut = 0; out.push(`The label's editor finished "${t.name}" without you.`); }
    return out;
}

/* ---------- release, sales, the chart ---------- */

/** The weeks a title sells over (the world's, else a season). */
export const salesWeeks = (g: Save, w: WorldDef) => Math.max(1, w.industry?.sales?.weeks || Math.max(2, Math.round(seasonDays(g) / 7)));
/** A title's sales for its next week: base × genre × label tier and pay × quality/60 × (1 + the stars' best fame/100) ×
 *  the trend, falling in a straight line to nothing over its weeks (week one ×1.05 with a lens director's cover). */
export function weekSales(g: Save, w: WorldDef, t: Title): number {
    const W = salesWeeks(g, w);
    if (!t.out || t.cancelled || t.weeks >= W) return 0;
    const s = w.industry?.sales ?? INDUSTRY.sales, lb = labelOf(w, t.label), gn = genreOf(w, t.genre);
    const fame = Math.max(0, ...t.cast.map(x => (x === YOU && !t.you.includes('perform') ? 0 : starFame(g, w, x))));
    const lens = t.weeks === 0 && t.you.includes('direct') && peekIndustry(g).seats.direct?.lens ? TITLES.lensCover : 1;
    const v = s.base * (gn?.pay ?? 1) * (TITLES.tier[lb?.tier ?? 2] ?? 1) * (lb?.pay ?? 1) * ((t.q ?? 50) / 60) * (1 + fame / 100) * trendOf(g, w, t.genre) * (1 - t.weeks / W) * lens;
    return Math.min(INDUSTRY_PAY_MAX, Math.round(v * effectMul(g, w, 'royalty', 'industry')));
}
/** Releases due: the title out, its fans, the `onRelease` steps (sim/fame.ts, sim/stance.ts). Lines. */
export function releases(g: Save, w: WorldDef): string[] {
    const st = industryOf(g), out: string[] = [];
    for (const t of st.titles as Title[]) {
        if (t.out || t.cancelled || t.q === undefined || !t.release || t.release > g.day) continue;
        t.out = true;
        if (t.edited === undefined) { t.edited = g.day; t.cut = 0; }
        const fans = releaseFans(g, w, t);
        if (fans) { const s = (st.seats.perform ??= { titles: 0 }); s.fans = (s.fans ?? 0) + fans; }
        out.push(`"${t.name}" is out today (${labelOf(w, t.label)?.name ?? t.label}).`);
        for (const f of onRelease) out.push(...f(g, w, t));
    }
    return out;
}
/** Monday's sales (once a Monday): each title's week, what each label sold, your shares (a name director's share of the
 *  titles you directed, the star-producer's fan club) for the royalty source, the chart. */
export function salesWeek(g: Save, w: WorldDef) {
    const st = industryOf(g);
    if (st.week.day === g.day) return;
    const labels: Record<string, number> = {}, pay: { name: string; amount: number }[] = [];
    const share = directorShare(g, w);
    let shares = 0;
    for (const t of st.titles as Title[]) {
        const n = weekSales(g, w, t);
        t.lastWeek = n;
        if (!n) continue;
        t.sold += n; t.weeks++;
        (t.hist ??= []).push(n);   // (Take's sparkline: a title sells a season's weeks at most)
        labels[t.label] = (labels[t.label] ?? 0) + n;
        if (share && t.you.includes('direct')) shares += Math.round(n * share);
    }
    if (shares) pay.push({ name: 'Your share as a name director', amount: payOf(g, shares) });
    const club = fanClubWeek(g, w);
    if (club) pay.push({ name: 'Your fan club', amount: club });
    st.week = { day: g.day, labels, pay };
    chartWeek(g, w);
    fold(g);
}
/** A name director's share of their titles' sales: the world's table by rank on the directing path (from its first). */
export function directorShare(g: Save, w: WorldDef): number {
    const o = myJob(g, w), j = g.player.job;
    if (!o || !j || !directing(g, w)) return 0;
    const table = w.industry?.pay?.share ?? INDUSTRY.share;
    const path = (o.branches ?? []).flatMap(b => b.options ?? []).find(x => j.path?.includes(x.id) && x.ranks.some(r => r.name === rankOf(g, o).name));
    const k = path ? path.ranks.findIndex(r => r.name === rankOf(g, o).name) : -1;
    return k >= 0 ? table[Math.min(k, table.length - 1)] ?? 0 : 0;
}
/** This week's chart: your titles that sold this week and eight to twelve made-up ones around the week's base, the top
 *  10 kept; each of yours there counts a chart week and its best place. */
export function chartWeek(g: Save, w: WorldDef) {
    const st = industryOf(g), week = Math.floor((g.day - 1) / 7), base = (w.industry?.sales ?? INDUSTRY.sales).base, labs = labelsOf(w);
    const rows: ChartRow[] = (st.titles as Title[]).filter(t => (t.lastWeek ?? 0) > 0).map(t => ({ name: t.name, label: t.label, sales: t.lastWeek!, title: t.id }));
    const [lo, hi] = TITLES.madeUp, n = lo + Math.floor(H(`${g.world}|chart|${week}`) * (hi - lo + 1));
    for (let i = 0; i < n; i++) {
        const r = H(`${g.world}|chart|${week}|${i}`);
        // (a name once a chart: drawn again when this week's rows have it already)
        let name = madeUpName(w, `${g.world}|c|${week}|${i}`);
        for (let k = 1; k < 6 && rows.some(x => x.name === name); k++) name = madeUpName(w, `${g.world}|c|${week}|${i}|${k}`);
        rows.push({ name, label: labs[Math.floor(H(`${g.world}|cl|${week}|${i}`) * labs.length)]?.id ?? '', sales: Math.round(base * (0.35 + 1.9 * r * r)) });
    }
    rows.sort((a, b) => b.sales - a.sales);
    st.chart = { week, rows: rows.slice(0, TITLES.rows) };
    st.chart.rows.forEach((row, i) => { const t = row.title ? titleById(g, row.title) as Title : undefined; if (t) { t.charts = (t.charts ?? 0) + 1; t.peak = Math.min(t.peak ?? 99, i + 1); } });
}
// (a title older than a year that's done selling, or past the 80 kept, is folded into the totals)
function fold(g: Save) {
    const st = industryOf(g), year = 4 * seasonDays(g);
    const done = (t: Title) => t.cancelled || (t.out && t.weeks > 0 && (t.lastWeek ?? 0) === 0);
    const old = (st.titles as Title[]).filter(t => done(t) && g.day - (t.release || t.contract) > year);
    const over = Math.max(0, st.titles.length - old.length - TITLES.keep);
    const gone = new Set([...old, ...(st.titles as Title[]).filter(t => done(t) && !old.includes(t)).slice(0, over)]);
    for (const t of gone) { st.totals.titles++; st.totals.sales += t.sold; if (t.sold > (st.totals.bestSold ?? 0)) { st.totals.bestSold = t.sold; st.totals.best = t.name; } }
    if (gone.size) st.titles = st.titles.filter(t => !gone.has(t as Title));
    // a title done selling keeps its scenes' grades, not their rolls' parts or the shoot day's bookkeeping (most of a
    // title's bytes: 80 kept stay well under 40 KB)
    for (const t of st.titles as Title[]) if (done(t)) { for (const s of t.scenes) delete s.parts; delete t.plans; delete t.warned; delete t.started; }
}
// the `industry` royalty source: your shares, paid Mondays (computed then, once)
ROYALTY_SOURCES.push({
    id: 'industry',
    on: (g, w) => industryOn(g, w) && !!(g as any).industry,
    weekly: (g, w) => { if (isMonday(g.day)) salesWeek(g, w); return peekIndustry(g).week.day === g.day ? peekIndustry(g).week.pay ?? [] : []; },
    paidOn: g => peekIndustry(g).week.paid,
    paid: (g, day) => { industryOf(g).week.paid = day; },
});

/* ---------- cancelling ---------- */

/** (sim/label.ts) Whether a label lets a title be cancelled (the law's spirit: yes; cutting corners: no). */
export const cancelLink: { accepts: (g: Save, w: WorldDef, t: Title) => boolean } = { accepts: () => true };
/** A performer's right to cancel a title within a year of its release: it stops selling (the label may refuse). */
export function cancelTitle(g: Save, w: WorldDef, id: string): { ok: boolean; text: string } {
    const t = titleById(g, id) as Title | undefined;
    if (!t || t.cancelled) return { ok: false, text: '' };
    if (t.out && g.day - t.release > 4 * seasonDays(g)) return { ok: false, text: 'It has been out for more than a year.' };
    if (!cancelLink.accepts(g, w, t)) return { ok: false, text: `${labelOf(w, t.label)?.name ?? 'The label'} refuses to pull "${t.name}".` };
    t.cancelled = true;
    for (const a of social(g).appts) if ((t.plans ?? []).includes(a.id) && a.state === 'set') a.state = 'cancelled';
    note(g, '"{0}" was cancelled: it will not be sold.', [t.name], [], g.player.loc, 'work');
    return { ok: true, text: `"${t.name}" is cancelled: it won't be sold.` };
}
// a storyline stage's `offer` (an entry: the lens) and `cancel` (`true` or `latest`: the latest title with its person,
// within a year of its release)
stageGives.push((g, w, s: ThreadStage, _thread: string, avatar: string) => {
    if (!industryOn(g, w)) return;
    if (typeof s.offer === 'string' && s.offer.trim()) offerEntry(g, w, s.offer.trim());
    if (s.cancel === true || s.cancel === 'latest') {
        const t = [...peekIndustry(g).titles].reverse().find(t => !t.cancelled && t.cast.includes(avatar) && (!t.out || g.day - t.release <= 4 * seasonDays(g)));
        if (t) cancelTitle(g, w, t.id);
    }
});

/* ---------- the days ---------- */

onHour.push((g, w) => callTick(g, w));
onDay.push((g, w) => {
    if (!industryOn(g, w)) return [];
    const has = !!(g as any).industry;
    if (!has && !inIndustry(g, w)) return [];
    const st = industryOf(g), out: string[] = [];
    st.offers = st.offers.filter(o => o.until >= g.day);
    out.push(...settleTrend(g, w), ...pastShoots(g, w), ...editTimeouts(g), ...releases(g, w));
    if (isMonday(g.day)) { salesWeek(g, w); out.push(...fillOffers(g, w)); }
    // a new hire's first offers (hired in the last two days) come on their first day in the job, not the next Monday (the law's month before the shoot
    // is wait enough; Monday deals as usual): so a booked career starts at the shift job's pace
    else if (st.drawn === undefined && inIndustry(g, w) && nowAbs(g) - ((g.player.job as { since?: number } | null)?.since ?? -Infinity) <= 2 * 1440) out.push(...fillOffers(g, w));
    return out;
});
// what the AI is told: today's shoot, the latest release
titleWords.push((g, w) => {
    const st = peekIndustry(g), out: string[] = [];
    const today = st.titles.find(t => t.shoot === g.day && t.q === undefined && !t.cancelled);
    if (today) out.push(`Today {{user}} has a shoot for ${labelOf(w, today.label)?.name ?? today.label}'s "${today.name}" (${genreOf(w, today.genre)?.name ?? today.genre}), call at ${hm(TITLES.call * 60)}.`);
    const out1 = (st.titles as Title[]).filter(t => t.out && !t.cancelled).sort((a, b) => b.release - a.release)[0];
    if (out1 && g.day - out1.release <= 7) out.push(`{{user}}'s latest title, "${out1.name}", came out ${g.day === out1.release ? 'today' : `${g.day - out1.release} days ago`}${out1.peak && out1.peak <= 10 ? ` and reached number ${out1.peak} on the chart` : ''}.`);
    return out;
});

/* ---------- performingLink and the condition keys ---------- */

performingLink.now = (g, w) => {
    if (!industryOn(g, w)) return false;
    return peekIndustry(g).titles.some(t => !t.cancelled && t.you.includes('perform') && (t.q === undefined || g.day - t.shoot <= 30));
};
performingLink.lastDay = g => { const d = peekIndustry(g).titles.filter(t => t.you.includes('perform') && t.q !== undefined).map(t => t.shoot); return d.length ? Math.max(...d) : null; };

const SEATS = ['perform', 'direct', 'label'];
const MINE = new Set(['titles', 'chart', 'seat']);
// `titles: 3`, `titles: perform 3`, `titles: kurobara 1` (titles made: shot and wrapped, cancelled ones too)
function titlesCount(g: Save, w: WorldDef, v: string): { have: number; need: number; what: string } | null {
    const m = /^\s*(?:(\S+)\s+)?(\d+)\s*$/.exec(v);
    if (!m) return null;
    const by = m[1]?.toLowerCase(), need = Number(m[2]), st = peekIndustry(g);
    const list = st.titles.filter(t => t.q !== undefined && (!by || (SEATS.includes(by) ? t.you.includes(by as Seat) : t.label.toLowerCase() === by)));
    const folded = !by ? st.totals.titles : 0;
    return { have: list.length + folded, need, what: by ? (SEATS.includes(by) ? by : labelOf(w, by)?.name ?? by) : '' };
}
// `chart: top 10`, `chart: perform top 3` (a title of yours reached that place)
function chartHolds(g: Save, v: string): { ok: boolean; n: number; seat?: string } | null {
    const m = /^\s*(?:(\S+)\s+)?top\s+(\d+)\s*$/i.exec(v);
    if (!m) return null;
    const seat = m[1]?.toLowerCase(), n = Number(m[2]);
    return { ok: (peekIndustry(g).titles as Title[]).some(t => (t.peak ?? 99) <= n && (!seat || t.you.includes(seat as Seat))), n, seat };
}
{
    const prev = { holds: industryLink.holds, words: industryLink.words, count: industryLink.count };
    industryLink.holds = (g, w, k, v) => {
        if (!MINE.has(k)) return prev.holds(g, w, k, v);
        if (!industryOn(g, w)) return false;
        if (k === 'titles') { const c = titlesCount(g, w, v); return !!c && c.have >= c.need; }
        if (k === 'chart') return !!chartHolds(g, v)?.ok;
        return seatsNow(g, w).includes(v.trim().toLowerCase() as Seat);
    };
    industryLink.words = (g, w, k, v) => {
        if (!MINE.has(k)) return prev.words(g, w, k, v);
        if (k === 'titles') { const c = titlesCount(g, w, v); if (!c) return ''; const what = c.what === 'perform' ? ' performing' : c.what === 'direct' ? ' directed' : c.what === 'label' ? ' for your label' : c.what ? ` for ${c.what}` : ''; return `${c.need === 1 ? 'a title' : `${c.need} titles`}${what} (${c.have} now)`; }
        if (k === 'chart') { const c = chartHolds(g, v); return c ? `a title${c.seat === 'perform' ? ' you star in' : c.seat === 'direct' ? ' you directed' : ''} in the chart's top ${c.n}` : ''; }
        const s = v.trim().toLowerCase();
        return s === 'perform' ? 'performing in adult video' : s === 'direct' ? 'directing adult video' : s === 'label' ? 'a label of your own' : '';
    };
    industryLink.count = (g, w, k, v) => {
        if (!MINE.has(k)) return prev.count(g, w, k, v);
        if (k === 'titles') return titlesCount(g, w, v)?.have ?? null;
        return null;
    };
}

/* ---------- views for the Take app ---------- */

export interface SceneView { kind: string; with: string[]; grade?: string; q?: number; parts?: { name: string; add: number }[]; pic?: string }
export interface OfferCard { id: number; kind: Offer['kind']; label: string; genre: string; name: string; set: string; fee: number; until: number; days: number; scenes: SceneView[]; cast: string[]; dropped: string[]; star?: string; own?: boolean; result?: string; amount?: number; can: boolean; why?: string }
export interface OffersView { on: boolean; seat: Seat | null; offers: OfferCard[]; testDue: boolean; testNext: number; limits: string[]; hot: string[]; cold: string; perWeek: number; contract?: { label: string; since: number; fee: number }; fans: number }
export interface TitleCard { id: string; name: string; label: string; genre: string; you: Seat[]; cast: string[]; set: string; place: string; scenes: SceneView[]; contract: number; shoot: number; release: number; q?: number; edited?: number; cut?: number; sold: number; weeks: number; lastWeek: number; peak?: number; charts: number; fee: number; cancelled: boolean;
    state: 'waiting' | 'shoot' | 'edit' | 'coming' | 'out' | 'done' | 'cancelled'; days: number[]; canEdit: boolean; canCancel: boolean }
export interface TitlesView { titles: TitleCard[]; totals: IndustryState['totals']; made: number; sold: number }
export interface ChartView { week: number; rows: { pos: number; name: string; label: string; sales: number; mine?: string }[]; hot: string[]; cold: string; line: string }
export interface RosterCard { id: string; name: string; rank: number; genres: string[]; titles: number; last?: number; fame: number; avatar?: string; debut: boolean }
export interface RosterView { people: RosterCard[]; tokyo: { avatar: string; name: string; titles: number }[] }

const scenesView = (g: Save, w: WorldDef, list: TitleScene[]): SceneView[] => list.map(s => ({ kind: s.kind, with: s.with.map(x => performerName(g, w, x)), ...(s.grade ? { grade: s.grade } : {}), ...(s.q !== undefined ? { q: s.q } : {}), ...(s.parts ? { parts: s.parts } : {}), ...(s.pic ? { pic: s.pic } : {}) }));
/** Take's Offers (or Briefs) tab: every offer as a card, whether it can be taken now, the test, your limits. */
export function offersView(g: Save, w: WorldDef): OffersView {
    const st = peekIndustry(g), seats = seatsNow(g, w), seat = seats.find(s => s !== 'label') ?? (seats.includes('label') ? 'label' : null);
    const t = st.trend, now = t.month === monthOf(g), c = st.seats.perform?.contract;
    const offers = industryOn(g, w) ? st.offers.map((o): OfferCard => {
        const why = o.kind === 'title' && testDue(g) ? 'Your monthly test is overdue.' : o.kind === 'title' && !inIndustry(g, w) ? 'Not while you are out of the job.' : '';
        return { id: o.id, kind: o.kind, label: labelOf(w, o.label)?.name ?? '', genre: genreOf(w, o.genre)?.name ?? '', name: o.name ?? '', set: setOf(w, o.set)?.name ?? '', fee: o.fee ?? 0, until: o.until, days: Math.max(0, o.until - g.day),
            scenes: scenesView(g, w, o.scenes ?? []), cast: (o.cast ?? []).map(x => performerName(g, w, x)), dropped: o.dropped ?? [], ...(o.star ? { star: rosterPerson(w, o.star)?.name ?? '' } : {}), ...(o.own ? { own: true } : {}),
            ...(o.result ? { result: o.result } : {}), ...(o.amount !== undefined ? { amount: o.amount } : {}), can: !why, ...(why ? { why } : {}) };
    }) : [];
    return { on: industryOn(g, w), seat, offers, testDue: inIndustry(g, w) && testDue(g), testNext: testNext(g), limits: [...st.limits], hot: now ? t.hot.map(id => genreOf(w, id)?.name ?? id) : [], cold: now ? genreOf(w, t.cold)?.name ?? '' : '',
        perWeek: offersAWeek(g, w), ...(c ? { contract: { label: labelOf(w, c.label)?.name ?? c.label, since: c.since, fee: c.fee } } : {}), fans: st.seats.perform?.fans ?? 0 };
}
/** Take's Schedule and Titles tabs: every title, newest first, with what it waits for. */
export function titlesView(g: Save, w: WorldDef): TitlesView {
    const st = peekIndustry(g);
    const titles = ([...st.titles] as Title[]).reverse().map((t): TitleCard => {
        const state: TitleCard['state'] = t.cancelled ? 'cancelled' : t.q === undefined ? (t.shoot === g.day ? 'shoot' : 'waiting') : t.you.includes('direct') && t.edited === undefined ? 'edit' : !t.out ? 'coming' : (t.lastWeek ?? 1) > 0 && t.weeks < salesWeeks(g, w) ? 'out' : 'done';
        const place = setPlace(w, setOf(w, t.set));
        return { id: t.id, name: t.name, label: labelOf(w, t.label)?.name ?? t.label, genre: genreOf(w, t.genre)?.name ?? t.genre, you: [...t.you], cast: t.cast.map(x => performerName(g, w, x)), set: setOf(w, t.set)?.name ?? '', place: place ? placeOf(g, w, place)?.name ?? '' : '',
            scenes: scenesView(g, w, t.scenes), contract: t.contract, shoot: t.shoot, release: t.release, ...(t.q !== undefined ? { q: t.q } : {}), ...(t.edited !== undefined ? { edited: t.edited } : {}), ...(t.cut !== undefined ? { cut: t.cut } : {}),
            sold: t.sold, weeks: t.weeks, lastWeek: t.lastWeek ?? 0, ...(t.peak ? { peak: t.peak } : {}), charts: t.charts ?? 0, fee: t.fee ?? 0, cancelled: !!t.cancelled, state,
            days: state === 'waiting' ? shootDays(g, w, t.id) : [], canEdit: state === 'edit' && canEditHere(g, w, t), canCancel: !t.cancelled && t.you.includes('perform') && (!t.out || g.day - t.release <= 4 * seasonDays(g)) };
    });
    return { titles, totals: { ...st.totals }, made: st.titles.filter(t => t.q !== undefined).length + st.totals.titles, sold: st.titles.reduce((a, t) => a + t.sold, 0) + st.totals.sales };
}
/** Take's Chart tab: this week's top 10, yours marked; the month's hot and cold genres and the news line. */
export function chartView(g: Save, w: WorldDef): ChartView {
    const st = peekIndustry(g), t = st.trend, now = t.month === monthOf(g);
    return { week: st.chart.week, rows: st.chart.rows.map((r, i) => ({ pos: i + 1, name: r.name, label: labelOf(w, r.label)?.name ?? r.label, sales: r.sales, ...(r.title ? { mine: r.title } : {}) })),
        hot: now ? t.hot.map(id => genreOf(w, id)?.name ?? id) : [], cold: now ? genreOf(w, t.cold)?.name ?? '' : '', line: now ? t.line ?? '' : '' };
}
/** Take's Roster tab: the roster's performers (those you've worked with first), and Tokyo's people in your titles. */
export function rosterView(g: Save, w: WorldDef): RosterView {
    const st = peekIndustry(g);
    const people = rosterOf(w).map((p): RosterCard => ({ id: p.id, name: p.name, rank: p.rank ?? 0, genres: (p.genres ?? []).map(id => genreOf(w, id)?.name ?? id), titles: st.roster[p.id]?.titles ?? 0, ...(st.roster[p.id]?.last ? { last: st.roster[p.id].last } : {}),
        fame: Math.min(100, (p.rank ?? 0) * TITLES.rosterFame), ...(p.avatar ? { avatar: p.avatar } : {}), debut: (p.debut ?? 0) <= g.day }))
        .filter(p => p.debut).sort((a, b) => b.titles - a.titles || b.rank - a.rank || a.name.localeCompare(b.name));
    const tokyo = [...new Set(st.titles.flatMap(t => t.cast).filter(x => x !== YOU && !x.startsWith('roster:') && g.cast[x]))].map(a => ({ avatar: a, name: g.cast[a].name, titles: st.titles.filter(t => t.cast.includes(a)).length }));
    return { people, tokyo };
}
/** For sim/label.ts: a title's sales so far and last week (0 when unknown). */
export const titleSales = (g: Save, id: string) => { const t = titleById(g, id) as Title | undefined; return { sold: t?.sold ?? 0, last: t?.lastWeek ?? 0 }; };
/** For sim/label.ts: makes a title the engine shoots alone (a commissioned title: no shoot day of yours), released four
 *  months on at the quality given. */
export function makeTitle(g: Save, w: WorldDef, x: { label: string; genre: string; q: number; cast?: string[]; name?: string; you?: Seat[] }): Title | null {
    if (!industryOn(g, w) || !labelOf(w, x.label) && !x.you?.includes('label')) return null;
    const st = industryOf(g);
    const t: Title = { id: `t${st.nextId++}`, name: x.name ?? titleName(g, w, `${g.world}|make|${st.nextId}`), genre: x.genre, label: x.label, you: x.you ?? ['label'], cast: x.cast ?? [], scenes: [], set: '',
        contract: g.day, shoot: g.day, release: g.day + releaseDays(g), q: Math.max(0, Math.min(100, Math.round(x.q))), edited: g.day, sold: 0, weeks: 0, adult: true };
    st.titles.push(t);
    return t;
}
export { titleQuality };
