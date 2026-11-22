// A label of your own (plans/adult-industry.md "The label"): a venture of kind `label` whose earnings are its titles'
// sales, not a tier's takings. The tier sets how many titles a month it makes without you (commissioned: an anonymous
// director from the staff pool, the label's exclusives and the roster, at a quality around 45 lifted by its Quality and
// Crew; Naomi and Airi direct one each after their storylines end that way); the titles you direct or star in for it
// are on top, any number, the brief your own. Exclusives are signed for a fee a month (paid with the upkeep, as the
// venture's rent) and their fame counts double in its titles; the way it's run (by the law's spirit or cutting corners)
// moves sales, decides whether a cancellation is accepted and, cutting corners, brings a scandal now and then. What the
// label keeps of a title's week: commissioned titles little (the production company keeps the rest), yours most of it,
// so it pays well only while you run it (AV-4). It opens once Naomi's storyline has ended (the venture's `ways.when`).
// With the `industry` or `business` system or adult content off, nothing here reads or writes the save.
import { adultOn, residentsOf, type Save } from '../core/store.js';
import { systemOn, type WorldDef, type VentureDef, type GenreDef, type UpgradeDef } from '../core/world.js';
import type { Seat } from '../core/industry.js';
import { onDay, kindEarn, industryLink } from './hooks.js';
import {
    peekIndustry, industryOf, industryOn, inIndustry, genresOf, genreOf, setsOf, setOf, rosterPerson, monthDays, monthOf, seasonIndex, isMonday, fameOf,
    titleWords, type Title,
} from './industry.js';
import { TITLES, weekSales, trendOf, rosterNow, tokyoCast, castChoices, buildScenes, shootDays, setShootDay, setPlace, setFor, madeUpName, makeTitle, cancelLink, performerName } from './titles.js';
import { testDue } from './bookings.js';
import { venturesOf, ventureDefs, ventureDef, ventureName, kindOf, tierOf, upgradesOf, buyUpgrade, ventureReport, type VentureState } from './ventures.js';
import { whenHolds, threadOwner } from './when.js';
import { threadStates } from './threads.js';
import { startRumor } from './living.js';
import { npcRank } from './longlife.js';
import { genderOf } from './gender.js';
import { placeOf } from './places.js';
import { payOf } from './bills.js';
import { effectMul } from './effects.js';
import { money } from './needs.js';
import { note } from './facts.js';
import { YOU } from './rel.js';
import { personaName } from '../st/bridge.js';

/** The label's numbers (first guesses, tuned by the long run). */
export const LABEL = {
    /** commissioned titles a month by tier (tier 1 first) */
    monthly: [0, 1, 2, 4],
    /** a commissioned title's quality: the base, and what the label's Quality and Crew add at the last tier's ceiling */
    q: 45, lift: { quality: 10, atmosphere: 5 } as Record<string, number>,
    /** what the label keeps of a commissioned title's sales (the production company that made it keeps the rest) */
    keep: [0, 0.08, 0.055, 0.045],
    /** the label's reach (its Output and Name against the last tier's ceiling): from, to */
    reach: [0.75, 1.25],
    /** the way it's run: sales × */
    lawful: 0.9, corners: 1.15,
    /** cutting corners: the chance of a scandal each season, the days a raid shuts the set */
    scandal: 1 / 3, raid: 7,
    /** an exclusive's fee a month for each rank (rank 0 counts as 1), and how many a tier can sign */
    fee: 20000, exclusives: [0, 1, 2, 4],
    /** the storylines whose endings give the label a director (one commissioned title a month each, at that quality) */
    named: [{ thread: 'naomi_story', ending: 'comes', q: 65 }, { thread: 'airi_retirement', ending: 'directs', q: 60 }],
    /** the ending whose gift is an upgrade (the earned upgrade whose condition is that ending is given) */
    gift: { thread: 'naomi_story', ending: 'blessing' },
    /** the performer whose storyline a scandal can end badly while she's signed */
    momo: 'momo_family',
    /** weeks of the label's report kept */
    weeks: 12,
};
export type LabelWay = 'lawful' | 'corners';
/** An exclusive: who (`roster:<id>` or a Tokyo avatar), since when, the rank the fee was set by, the fee a month. */
export interface Exclusive { who: string; since: number; rank: number; fee: number }
/** A week of the label's sales (each sales Monday): the day, what it kept of its commissioned titles and of yours, how
 *  many of each sold. */
export interface LabelWeek { day: number; commissioned: number; own: number; nc: number; no: number }
/** The label's own record, kept on its venture (`s.label`): the venture's rent before exclusives (`base`), the day the
 *  way was last changed, exclusives, this month's commissioned titles (`made`: how many, the named directors who made
 *  one), the season last looked at (scandals), a raid's end (`shut`), the last scandal, the weeks' sales, the gift. */
export interface LabelState {
    base: number; wayDay?: number; exclusives: Exclusive[];
    made: { month: number; n: number; named: string[] };
    season: number; shut?: number; scandal?: { kind: 'rumor' | 'raid' | 'momo'; day: number; text: string };
    weeks: LabelWeek[]; gift?: true; lastWeek?: number;
}
/** A title as the label keeps it: who directed a commissioned one. */
export interface LabelTitle extends Title { by?: string }

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const isLabel = (d: VentureDef | null | undefined) => kindOf(d) === 'label';
// (the label in a line: its own name when you gave it one, else "your label" / "their label")
const yours = (s: VentureState) => s.name || 'your label', theirs = (s: VentureState) => s.name || 'their label';
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1), low = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

/* ---------- is it open ---------- */

/** The label plays in this game: the world has an industry, the `industry` and `business` systems and adult content on. */
export const labelsOn = (g: Save, w: WorldDef) => industryOn(g, w) && systemOn(w, 'business') && adultOn(g);
/** The label kind this game can open (the world's venture of kind `label`, while it plays). */
export const labelDef = (g: Save, w: WorldDef): VentureDef | null => (labelsOn(g, w) ? ventureDefs(g, w).find(isLabel) ?? null : null);
/** Your label, open (null without one, or while the industry doesn't play). */
export function myLabel(g: Save, w: WorldDef): VentureState | null {
    if (!labelsOn(g, w)) return null;
    return venturesOf(g).find(s => isLabel(ventureDef(w, s.id)) && ventureDefs(g, w).some(d => d.id === s.id)) ?? null;
}
/** The label's record, made on first write (an old label: every field read with a default). */
export function labelState(g: Save, s: VentureState): LabelState {
    const L = ((s as any).label ??= {}) as LabelState;
    L.base ??= s.rent ?? 0; L.exclusives ??= []; L.weeks ??= [];
    L.made ??= { month: monthOf(g), n: Math.floor(perMonth(s) * ((g.day - 1) % monthDays(g)) / monthDays(g)), named: [] };
    L.season ??= seasonIndex(g);
    return L;
}
const peekLabel = (s: VentureState): Partial<LabelState> => (s as any).label ?? {};
const perMonth = (s: VentureState) => LABEL.monthly[Math.min(LABEL.monthly.length - 1, Math.max(1, s.tier))] ?? 0;
/** The last tier's ceiling: the label's numbers are read against it (a small label's are far from it). */
const top = (d: VentureDef) => Math.max(1, d.tiers.at(-1)?.ceiling ?? 80);
const stat = (d: VentureDef, s: VentureState, k: string) => Math.max(0, Math.min(top(d), s.stats[k] ?? 0));

/* ---------- the way it's run ---------- */

// (its two styles: the ones named for it, else the first two of its first tier)
function wayStyles(d: VentureDef): Record<LabelWay, string> {
    const first = (d.styles ?? []).filter(x => x.tier === 1);
    const by = (re: RegExp, i: number) => first.find(x => re.test(x.id))?.id ?? first[i]?.id ?? '';
    return { lawful: by(/lawful|law/i, 0), corners: by(/corner/i, 1) };
}
/** The way the label is run: cutting corners when its style says so, else by the law's spirit. */
export function wayOf(w: WorldDef, s: VentureState): LabelWay {
    const d = ventureDef(w, s.id);
    return d && s.style && s.style === wayStyles(d).corners ? 'corners' : 'lawful';
}
/** Whether the way can be changed now: once a season (the first choice is the venture's style when it opens). */
export const wayCan = (g: Save, s: VentureState) => { const at = peekLabel(s).wayDay; return at === undefined || seasonIndex(g, at) < seasonIndex(g); };
/** Changes the way the label is run (once a season). */
export function setWay(g: Save, w: WorldDef, way: LabelWay): { ok: boolean; text: string } {
    const s = myLabel(g, w), d = s && ventureDef(w, s.id);
    if (!s || !d) return { ok: false, text: '' };
    if (wayOf(w, s) === way) return { ok: false, text: 'It is already run that way.' };
    if (!wayCan(g, s)) return { ok: false, text: 'The way the label is run can change once a season: next season.' };
    const id = wayStyles(d)[way];
    if (!id) return { ok: false, text: '' };
    s.style = id; s.styles = { ...(s.styles ?? {}), 1: id };
    if (s.tier === 1) s.styleTier = 1;
    labelState(g, s).wayDay = g.day;
    const name = d.styles?.find(x => x.id === id)?.name ?? way;
    ventureReport(s, `From now on: ${name}.`);
    note(g, '{u} runs {0} {1} now.', [theirs(s), way === 'corners' ? 'cutting corners' : 'by the law\'s spirit'], [], s.place, 'work');
    return { ok: true, text: `${cap(yours(s))}: ${name}.` };
}
// (the law's spirit: a performer's cancellation is accepted; cutting corners: refused)
{
    const prev = cancelLink.accepts;
    cancelLink.accepts = (g, w, t) => {
        const s = labelsOn(g, w) ? venturesOf(g).find(x => x.id === t.label && isLabel(ventureDef(w, x.id))) : undefined;
        return s ? wayOf(w, s) !== 'corners' : prev(g, w, t);
    };
}

/* ---------- what a title earns the label ---------- */

/** A performer's fame for sales, as titles.ts counts it (yours performing, a roster performer's by rank, a Tokyo
 *  person's by their job rank), doubled for the label's exclusives (at most 100). */
function starFame(g: Save, w: WorldDef, t: Title, who: string, ex: Set<string>): number {
    const base = who === YOU ? (t.you.includes('perform') ? fameOf(g, 'perform') : 0)
        : who.startsWith('roster:') ? Math.min(100, (rosterPerson(w, who.slice(7))?.rank ?? 0) * TITLES.rosterFame)
        : g.cast[who] ? Math.min(100, npcRank(g, who) * TITLES.npcFame) : 0;
    return ex.has(who) ? Math.min(100, 2 * base) : base;
}
/** How many times a title's sales its exclusives' doubled fame makes them (1 without exclusives in it). */
export function exclusiveLift(g: Save, w: WorldDef, s: VentureState, t: Title): number {
    const ex = new Set((peekLabel(s).exclusives ?? []).map(x => x.who));
    if (!t.cast.some(x => ex.has(x))) return 1;
    const plain = Math.max(0, ...t.cast.map(x => starFame(g, w, t, x, new Set())));
    const lifted = Math.max(0, ...t.cast.map(x => starFame(g, w, t, x, ex)));
    return (1 + lifted / 100) / (1 + plain / 100);
}
/** The label's reach: its Output and Name against the last tier's ceiling. */
export function reachOf(d: VentureDef, s: VentureState): number {
    const [lo, hi] = LABEL.reach;
    return lo + (hi - lo) * (stat(d, s, 'capacity') + stat(d, s, 'fame')) / (2 * top(d));
}
/** Is this one of the titles you made for the label (directing or starring), not a commissioned one? */
export const isOwn = (t: Title) => t.you.includes('direct') || t.you.includes('perform');
/** What the label keeps of a title's week of sales, as a multiple: the way it's run, its reach, its exclusives' fame;
 *  yours by the label's tier (as the industry's labels sell), a commissioned one only the label's keep. */
export function takeOf(g: Save, w: WorldDef, s: VentureState, t: Title): number {
    const d = ventureDef(w, s.id);
    if (!d) return 0;
    const way = wayOf(w, s) === 'corners' ? LABEL.corners : LABEL.lawful;
    const k = Math.min(3, Math.max(1, s.tier)), share = isOwn(t) ? TITLES.tier[k] ?? 1 : LABEL.keep[k] ?? 0;
    return share * way * reachOf(d, s) * exclusiveLift(g, w, s, t);
}
/** The label's titles (made for it: commissioned and yours). */
export const labelTitles = (g: Save, s: VentureState) => (peekIndustry(g).titles as LabelTitle[]).filter(t => t.label === s.id);
/** What the label earns on a day: a sales Monday's week of its titles (what each sold × the label's take); on a Monday
 *  still to come, a guess from what they'd sell; nothing on other days. */
export function labelDay(g: Save, w: WorldDef, s: VentureState, day: number): { commissioned: number; own: number; nc: number; no: number } {
    const out = { commissioned: 0, own: 0, nc: 0, no: 0 };
    if (!isMonday(day)) return out;
    const st = peekIndustry(g), past = st.week.day === day;
    if (!past && day < g.day) return out;
    for (const t of labelTitles(g, s)) {
        const n = past ? t.lastWeek ?? 0 : weekSales(g, w, t);
        if (!n) continue;
        const v = n * takeOf(g, w, s, t);
        if (isOwn(t)) { out.own += v; out.no++; } else { out.commissioned += v; out.nc++; }
    }
    return out;
}
// (sim/ventures.ts) a label's day's earnings are its titles' sales; nothing while the industry doesn't play
kindEarn.push((g, w, d, day) => {
    if (!isLabel(d)) return null;
    const s = labelsOn(g, w) ? venturesOf(g).find(x => x.id === d.id) : undefined;
    if (!s) return 0;
    const v = labelDay(g, w, s, day);
    return v.commissioned + v.own;
});

/* ---------- commissioned titles ---------- */

/** The directors from the storylines' endings who direct for the label now (name, quality). */
export function namedDirectors(g: Save, w: WorldDef): { name: string; q: number; thread: string }[] {
    return LABEL.named.filter(x => whenHolds(g, w, `thread: ${x.thread} ${x.ending}`)).map(x => ({ name: threadOwner(w, x.thread), q: x.q, thread: x.thread }));
}
/** A commissioned title's quality now: the base and what the label's Quality and Crew lift it by. */
export function commissionQ(w: WorldDef, s: VentureState): number {
    const d = ventureDef(w, s.id);
    if (!d) return LABEL.q;
    return Math.round(LABEL.q + Object.entries(LABEL.lift).reduce((a, [k, v]) => a + v * stat(d, s, k) / top(d), 0));
}
function pickW<T>(list: T[], weight: (x: T) => number, r: number): T | undefined {
    const ws = list.map(x => Math.max(0, weight(x))), sum = ws.reduce((a, b) => a + b, 0);
    if (!list.length || sum <= 0) return undefined;
    let t = r * sum;
    for (let i = 0; i < list.length; i++) { t -= ws[i]; if (t < 0) return list[i]; }
    return list[list.length - 1];
}
const genresFor = (g: Save, who: string, w: WorldDef) => (who.startsWith('roster:') ? rosterPerson(w, who.slice(7))?.genres ?? [] : []);
const genderOfCast = (g: Save, w: WorldDef, who: string) => (who.startsWith('roster:') ? rosterPerson(w, who.slice(7))?.gender : genderOf(g, who));
/** Makes one commissioned title: its lead an exclusive (in turn) or a roster performer, a co-star of the other gender
 *  from the roster, the genre by the lead's and the month's trend, a director (a named one first, once a month each,
 *  else an anonymous one from the staff pool), released at +20 days through titles.ts. */
function commissionOne(g: Save, w: WorldDef, s: VentureState, L: LabelState, salt: string): LabelTitle | null {
    const ex = L.exclusives.map(x => x.who).filter(x => x.startsWith('roster:') ? !!rosterPerson(w, x.slice(7)) : !!g.cast[x] && !(g.cast[x] as any).gone);
    const roster = rosterNow(g, w).map(p => `roster:${p.id}`);
    const lead = ex.length ? ex[L.made.n % ex.length] : pickW(roster, x => 1 + (rosterPerson(w, x.slice(7))?.rank ?? 0), H(`${salt}|lead`));
    if (!lead) return null;
    const gs = genresOf(w), mine = genresFor(g, lead, w);
    const genre = pickW(gs, x => trendOf(g, w, x.id) ** 3 * (mine.includes(x.id) ? 2 : 1), H(`${salt}|genre`));
    if (!genre) return null;
    const other = roster.filter(x => x !== lead && genderOfCast(g, w, x) !== genderOfCast(g, w, lead));
    const co = pickW(other, x => ((rosterPerson(w, x.slice(7))?.genres ?? []).includes(genre.id) ? 2 : 1), H(`${salt}|co`));
    const named = namedDirectors(g, w).find(x => !L.made.named.includes(x.name));
    const base = commissionQ(w, s), q = named ? Math.max(named.q, base) : base;
    const t = makeTitle(g, w, { label: s.id, genre: genre.id, q, cast: [lead, ...(co ? [co] : [])], you: ['label'] }) as LabelTitle | null;
    if (!t) return null;
    t.set = setAt(w, s, genre)?.id ?? '';
    const pool = w.staffPool?.names ?? [];
    t.by = named?.name ?? (pool.length ? pool[Math.floor(H(`${salt}|by`) * pool.length)] : '');
    if (named) L.made.named.push(named.name);
    return t;
}
/** The set a label's title is shot at: the one at the label's place, else one suiting the genre. */
const setAt = (w: WorldDef, s: VentureState, genre?: GenreDef) => setsOf(w).find(x => x.place && x.place === s.place) ?? setFor(w, undefined, genre);
/** The commissioned titles due by today this month (the tier's count spread over the month), made. Lines. */
function commission(g: Save, w: WorldDef, s: VentureState, L: LabelState): string[] {
    const m = monthOf(g), md = monthDays(g);
    if (L.made.month !== m) L.made = { month: m, n: 0, named: [] };
    if ((L.shut ?? 0) > g.day) return [];
    const due = Math.floor(perMonth(s) * ((g.day - 1) % md + 1) / md);
    const made: LabelTitle[] = [];
    for (let i = 0; L.made.n < due && i < 8; i++) {
        const t = commissionOne(g, w, s, L, `${g.world}|lbl|${s.id}|${m}|${L.made.n}`);
        L.made.n++;
        if (t) made.push(t);
    }
    if (!made.length) return [];
    const names = made.map(t => `"${t.name}"${t.by ? ` (${t.by})` : ''}`).join(', ');
    ventureReport(s, `Made without you: ${names}.`);
    return [];
}

/* ---------- the titles you make for it ---------- */

/** Who you can cast in a title of your label's: you, the roster working now, Tokyo's people who can be in titles. */
export const labelCast = (g: Save, w: WorldDef) => castChoices(g, w);
/** Plans a title of your own for the label: you direct it (and star when you're in the cast), the genre, cast and set
 *  your own (at least one performer besides you), its shoot day the first free one after the law's wait; the rest is a
 *  title like any other (the set, the edit, the release at +20), its sales the label's. */
export function planLabelTitle(g: Save, w: WorldDef, plan: { genre: string; cast: string[]; set?: string; name?: string }): { ok: boolean; text: string; title?: string } {
    const s = myLabel(g, w);
    if (!s) return { ok: false, text: '' };
    const genre = genreOf(w, plan.genre);
    if (!genre) return { ok: false, text: 'Choose a genre.' };
    const ok = new Set(labelCast(g, w).map(c => c.id));
    const cast = [...new Set(plan.cast)].filter(x => ok.has(x));
    if (cast.filter(x => x !== YOU).length < 1) return { ok: false, text: 'Cast at least one performer.' };
    if (cast.includes(YOU) && inIndustry(g, w) && testDue(g)) return { ok: false, text: 'Your monthly test is overdue: take it at a clinic first.' };
    const set = setOf(w, plan.set) ?? setAt(w, s, genre);
    const L = labelState(g, s);
    if ((L.shut ?? 0) > g.day && setPlace(w, set) === s.place) return { ok: false, text: `The set at ${placeOf(g, w, s.place)?.name ?? 'the label'} is shut after the raid: it reopens in ${L.shut! - g.day} day${L.shut! - g.day === 1 ? '' : 's'}.` };
    const st = industryOf(g), salt = `${g.world}|own|${s.id}|${st.nextId}`;
    const built = buildScenes(g, w, genre, cast, salt);
    if (!built.scenes.length) return { ok: false, text: 'Nothing in this genre fits everyone\'s limits.' };
    const you: Seat[] = cast.includes(YOU) ? ['perform', 'direct', 'label'] : ['direct', 'label'];
    const name = plan.name?.replace(/\s+/g, ' ').trim().slice(0, 60) || madeUpName(w, `${salt}|name`);
    const t: Title = { id: `t${st.nextId++}`, name, genre: genre.id, label: s.id, you, cast, scenes: built.scenes, set: set?.id ?? '', contract: g.day, shoot: 0, release: 0, sold: 0, weeks: 0, adult: true, brief: true };
    st.titles.push(t);
    const days = shootDays(g, w, t.id).filter(d => (L.shut ?? 0) <= d || setPlace(w, set) !== s.place);
    if (!days.length) { st.titles = st.titles.filter(x => x !== t); return { ok: false, text: 'Nobody in the cast is free for a shoot day soon.' }; }
    const r = setShootDay(g, w, t.id, days[0]);
    note(g, '{u} planned "{0}" for {1}.', [t.name, theirs(s)], [], g.player.loc, 'work');
    const who = cast.map(x => performerName(g, w, x, 'you'));
    return { ok: true, text: `"${t.name}" for ${yours(s)}: ${who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who.at(-1)}` : who[0]}, ${built.scenes.length} scenes.${built.dropped.length ? ` (${built.dropped.join(', ')} left out: someone's limits.)` : ''} ${r.text}`, title: t.id };
}

/* ---------- exclusives ---------- */

/** Someone's rank for an exclusive's fee: a roster performer's, a Tokyo person's job rank. */
const rankFor = (g: Save, w: WorldDef, who: string) => (who.startsWith('roster:') ? rosterPerson(w, who.slice(7))?.rank ?? 0 : npcRank(g, who));
/** An exclusive's fee a month: her rank × the label's fee (a rookie's as rank 1). */
export const exclusiveFee = (g: Save, w: WorldDef, who: string) => Math.max(1, rankFor(g, w, who)) * LABEL.fee;
/** How many exclusives the label can have at its tier. */
export const exclusivesMax = (s: VentureState) => LABEL.exclusives[Math.min(LABEL.exclusives.length - 1, Math.max(1, s.tier))] ?? 0;
/** Who the label could sign now: the roster working now and Tokyo's people who can be in titles, not signed yet. */
export function exclusiveChoices(g: Save, w: WorldDef): { who: string; name: string; rank: number; fee: number; tokyo?: true }[] {
    const s = myLabel(g, w);
    if (!s) return [];
    const have = new Set(peekLabel(s).exclusives?.map(x => x.who) ?? []);
    return [...rosterNow(g, w).map(p => `roster:${p.id}`), ...tokyoCast(g, w)].filter(x => !have.has(x))
        .map(x => ({ who: x, name: performerName(g, w, x), rank: rankFor(g, w, x), fee: exclusiveFee(g, w, x), ...(x.startsWith('roster:') ? {} : { tokyo: true as const }) }));
}
// (the venture's rent: the way's own, plus each exclusive's fee a month counted by the week)
function settleRent(g: Save, s: VentureState, L: LabelState) {
    s.rent = Math.round(L.base + L.exclusives.reduce((a, x) => a + x.fee * 7 / monthDays(g), 0));
}
/** Signs an exclusive: a roster performer, or one of Tokyo's people who can be in titles; her fee a month goes on
 *  the label's upkeep. */
export function signExclusive(g: Save, w: WorldDef, who: string): { ok: boolean; text: string } {
    const s = myLabel(g, w);
    const c = s && exclusiveChoices(g, w).find(x => x.who === who);
    if (!s || !c) return { ok: false, text: '' };
    const L = labelState(g, s);
    if (L.exclusives.length >= exclusivesMax(s)) return { ok: false, text: `${tierOf(ventureDef(w, s.id)!, s.tier).name} can have ${exclusivesMax(s) === 1 ? 'one exclusive' : `${exclusivesMax(s)} exclusives`}.` };
    L.exclusives.push({ who, since: g.day, rank: c.rank, fee: c.fee });
    settleRent(g, s, L);
    ventureReport(s, `Signed: ${c.name}.`);
    note(g, '{0} signed exclusive with {1}.', [c.name, s.name || '{u}\'s label'], c.tokyo ? [who] : [], s.place, 'work');
    return { ok: true, text: `${c.name} is exclusive to ${yours(s)}: ${money(w, c.fee)} a month, on its upkeep.` };
}
/** Lets an exclusive go. */
export function releaseExclusive(g: Save, w: WorldDef, who: string): { ok: boolean; text: string } {
    const s = myLabel(g, w);
    const L = s && labelState(g, s), x = L?.exclusives.find(e => e.who === who);
    if (!s || !L || !x) return { ok: false, text: '' };
    L.exclusives = L.exclusives.filter(e => e !== x);
    settleRent(g, s, L);
    const name = performerName(g, w, who) || who;
    ventureReport(s, `${name}'s exclusive contract ended.`);
    return { ok: true, text: `${name} is no longer exclusive to ${yours(s)}.` };
}

/* ---------- cutting corners: scandals ---------- */

// (Momo: the performer whose storyline a scandal can end badly, while she's signed)
function momoOf(g: Save, w: WorldDef): string {
    const ex = w.cast.examples.find(e => (e.threads ?? []).some(t => t.id === LABEL.momo));
    return ex ? residentsOf(g).find(r => r.name === ex.name)?.avatar ?? '' : '';
}
/** A season's scandal, cutting corners (1 in 3): a rumor about the label, a raid that shuts its set for a week, or Momo's
 *  storyline ending badly while she's signed. Lines. */
function scandal(g: Save, w: WorldDef, s: VentureState, L: LabelState): string[] {
    const idx = seasonIndex(g);
    if (L.season === idx) return [];
    L.season = idx;
    if (wayOf(w, s) !== 'corners' || H(`${g.world}|scandal|${s.id}|${idx}`) >= LABEL.scandal) return [];
    const momo = momoOf(g, w), th = threadStates(g)[LABEL.momo];
    const kinds: NonNullable<LabelState['scandal']>['kind'][] = ['rumor', 'raid'];
    if (momo && L.exclusives.some(x => x.who === momo) && !th?.ended) kinds.push('momo');
    const kind = kinds[Math.floor(H(`${g.world}|scandal|${s.id}|${idx}|kind`) * kinds.length)];
    let text = '';
    if (kind === 'rumor') {
        text = `Word is going round that ${yours(s)} cuts corners: contracts nobody reads, a performer who wasn't told what the scene was.`;
        const first = residentsOf(g).filter(r => r.met && !(r as any).gone).sort((a, b) => H(`${idx}|${a.avatar}`) - H(`${idx}|${b.avatar}`)).slice(0, 2).map(r => r.avatar);
        const r = first.length ? startRumor(g, w, `Word is going round that ${s.name || `${personaName()}'s adult video label`} cuts corners: contracts nobody reads, a performer who wasn't told what the scene was.`, s.place, { first, id: `lbl:scandal:${s.id}:${idx}` }) : null;
        if (r) { (r as any).adult = true; r.about = [YOU]; }
    } else if (kind === 'raid') {
        L.shut = g.day + LABEL.raid;
        text = `The police raid ${yours(s)}'s set over a contract: it's shut for a week, and nothing is made there until it reopens.`;
        for (const t of labelTitles(g, s)) if (t.q === undefined && !t.cancelled && t.shoot && t.shoot < L.shut && setPlace(w, setOf(w, t.set)) === s.place) {
            const day = shootDays(g, w, t.id).find(d => d >= L.shut!);
            if (day) setShootDay(g, w, t.id, day);
        }
    } else {
        const ex = w.cast.examples.find(e => (e.threads ?? []).some(t => t.id === LABEL.momo));
        const thread = ex?.threads?.find(t => t.id === LABEL.momo), bad = [...(thread?.endings ?? [])].reverse().find(e => !e.good);
        const r = g.cast[momo];
        if (thread && bad && r) {
            const st = (threadStates(g)[LABEL.momo] ??= { stage: -1, since: g.day });
            st.ended = bad.id; st.endDay = g.day; st.endedBy = 'calendar';
            for (const k of ['asked', 'talk', 'on', 'waiting', 'next'] as const) delete st[k];
            note(g, bad.text.replace(/\{\{user\}\}/g, '{u}'), [], [momo], `home:${momo}`, 'thread');
        }
        L.exclusives = L.exclusives.filter(x => x.who !== momo);
        settleRent(g, s, L);
        text = `A tabloid prints ${r?.name ?? 'your performer'}'s real name beside one of ${yours(s)}'s titles. Her family reads it; she leaves the label${bad?.text ? `: ${low(bad.text.replace(/\{\{user\}\}/g, 'you').replace(/\.$/, ''))}` : ''}.`;
    }
    L.scandal = { kind, day: g.day, text };
    ventureReport(s, `Scandal: ${text}`);
    note(g, 'A scandal at {0}.', [s.name || '{u}\'s label'], [], s.place, 'work');
    return [text];
}

/* ---------- the days ---------- */

// (the weeks' sales, recorded once after each sales Monday)
function recordWeek(g: Save, w: WorldDef, s: VentureState, L: LabelState) {
    const day = peekIndustry(g).week.day;
    if (day === undefined || L.lastWeek === day || day > g.day) return;
    L.lastWeek = day;
    const v = labelDay(g, w, s, day), d = ventureDef(w, s.id)!;
    const mul = payOf(g, 1000) / 1000 * (s.way === 'partner' ? tierOf(d, s.tier)?.share ?? 0.5 : 1) * effectMul(g, w, 'venture', [d.id, d.track, d.kind].filter((x): x is string => !!x));
    const wk: LabelWeek = { day, commissioned: Math.round(v.commissioned * mul), own: Math.round(v.own * mul), nc: v.nc, no: v.no };
    L.weeks = [...L.weeks, wk].slice(-LABEL.weeks);
    if (v.nc + v.no) ventureReport(s, `Sales this week: ${money(w, wk.own + wk.commissioned)} (${v.no ? `${v.no} of your titles ${money(w, wk.own)}` : ''}${v.no && v.nc ? ', ' : ''}${v.nc ? `${v.nc} made without you ${money(w, wk.commissioned)}` : ''}).`);
}
// (the gift: Naomi's blessing gives the upgrade it earns)
function gift(g: Save, w: WorldDef, s: VentureState, L: LabelState): string[] {
    if (L.gift || !whenHolds(g, w, `thread: ${LABEL.gift.thread} ${LABEL.gift.ending}`)) return [];
    const want = `thread: ${LABEL.gift.thread} ${LABEL.gift.ending}`.replace(/\s+/g, ' ');
    const u: UpgradeDef | undefined = upgradesOf(g, w, s).map(x => x.u).find(x => x.how === 'earned' && typeof x.when === 'string' && x.when.replace(/\s+/g, ' ').trim() === want);
    L.gift = true;
    if (!u || s.owned.includes(u.id)) return [];
    const cost = upgradesOf(g, w, s).find(x => x.u.id === u.id)?.price ?? 0;
    if (cost > 0) return [];
    const line = buyUpgrade(g, w, s.id, u.id);
    return line ? [`${threadOwner(w, LABEL.gift.thread)}'s gift: ${line}`] : [];
}
/** The label's day (an onDay hook; the checks call it alone): the upkeep settled, last Monday's sales in its report,
 *  Naomi's gift, the season's scandal, the commissioned titles due. Lines. */
export function labelTick(g: Save, w: WorldDef): string[] {
    const s = myLabel(g, w);
    if (!s) return [];
    const L = labelState(g, s);
    settleRent(g, s, L);
    recordWeek(g, w, s, L);
    return [...gift(g, w, s, L), ...scandal(g, w, s, L), ...commission(g, w, s, L)];
}
onDay.push(labelTick);

/* ---------- the condition keys and what the AI is told ---------- */

// `seat: label`: a label of yours that plays (the industry, business and adult content on), not just one in the save
{
    const prev = industryLink.holds;
    industryLink.holds = (g, w, k, v) => (k === 'seat' && v.trim().toLowerCase() === 'label' ? !!myLabel(g, w) : prev(g, w, k, v));
}
titleWords.push((g, w) => {
    const s = myLabel(g, w), d = s && ventureDef(w, s.id);
    if (!s || !d) return [];
    const ex = (peekLabel(s).exclusives ?? []).map(x => performerName(g, w, x.who)).filter(Boolean);
    return [`{{user}}'s label${s.name ? `, ${s.name},` : ''} is ${tierOf(d, s.tier).name.toLowerCase()}, run ${wayOf(w, s) === 'corners' ? 'cutting corners' : 'by the law\'s spirit'}${ex.length ? `; exclusive to it: ${ex.join(', ')}` : ''}.`];
});

/* ---------- the view (the Business app's label section, Take's Label tab) ---------- */

export interface LabelView {
    on: boolean; id?: string; name?: string; tier?: number; tierName?: string; way?: LabelWay; wayCan?: boolean;
    month?: { made: number; of: number }; q?: number; reach?: number; shut?: number; scandal?: LabelState['scandal'];
    exclusives?: { who: string; name: string; rank: number; fee: number; since: number }[]; max?: number;
    choices?: ReturnType<typeof exclusiveChoices>; named?: string[]; upkeep?: number;
    titles?: { id: string; name: string; genre: string; by: string; own: boolean; q?: number; release: number; out: boolean; sold: number; lastWeek: number; cancelled: boolean }[];
    weeks?: LabelWeek[];
}
/** What the label section shows: the label, its way, this month's commissioned titles, exclusives and who could be
 *  signed, its titles (newest first) and the weeks' sales. */
export function labelView(g: Save, w: WorldDef): LabelView {
    const s = myLabel(g, w), d = s && ventureDef(w, s.id);
    if (!s || !d) return { on: !!labelDef(g, w) };
    const L = peekLabel(s);
    return {
        on: true, id: s.id, name: ventureName(w, s), tier: s.tier, tierName: tierOf(d, s.tier).name, way: wayOf(w, s), wayCan: wayCan(g, s),
        month: { made: L.made?.month === monthOf(g) ? L.made.n : 0, of: perMonth(s) }, q: commissionQ(w, s), reach: Math.round(reachOf(d, s) * 100) / 100,
        ...(L.shut && L.shut > g.day ? { shut: L.shut } : {}), ...(L.scandal ? { scandal: { ...L.scandal } } : {}),
        exclusives: (L.exclusives ?? []).map(x => ({ who: x.who, name: performerName(g, w, x.who), rank: x.rank, fee: x.fee, since: x.since })), max: exclusivesMax(s),
        choices: exclusiveChoices(g, w), named: namedDirectors(g, w).map(x => x.name), upkeep: s.rent ?? 0,
        titles: [...labelTitles(g, s)].reverse().map(t => ({ id: t.id, name: t.name, genre: genreOf(w, t.genre)?.name ?? t.genre, by: isOwn(t) ? 'You' : t.by ?? '', own: isOwn(t), ...(t.q !== undefined ? { q: t.q } : {}), release: t.release, out: !!t.out, sold: t.sold, lastWeek: t.lastWeek ?? 0, cancelled: !!t.cancelled })),
        weeks: [...(L.weeks ?? [])],
    };
}
