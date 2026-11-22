// The adult industry's save and the few things everything in it shares (plans/adult-industry.md): `g.industry` read
// with defaults (`peekIndustry` never writes, `industryOf` fills them in on first write), whether the industry plays
// in this game (the world's `industry` block, the `industry` system and adult content on), the seats you hold now
// (performing, directing, a label of your own), the law's month and four months scaled to the season's length, fame
// as the seats keep it (sim/fame.ts writes it), and the line the AI is told. Titles and offers are sim/titles.ts's,
// bookings sim/bookings.ts's; with the industry off nothing here reads or writes the save.
import { adultOn, type Save, type Resident } from '../core/store.js';
import { systemOn, type WorldDef, type Occupation, type LabelDef, type GenreDef, type SetDef, type RosterPerson } from '../core/world.js';
import type { Seat, TitleRec, TitleScene } from '../core/industry.js';
import { seasonDays } from './time.js';
import { myJob, jobDef, bookedJob, careerOf, rankOf, trackOf } from './work.js';

/** A contract you're under (the actress's exclusive: its ContractDef's id, the label, since when, the fee multiple with
 *  its raises, the season it was last renewed in). */
export interface ContractState { id: string; label: string; since: number; fee: number; season: number }
/** A seat you have held: titles made in it, the last one's shoot day, the fan base (the performer's: grows with each
 *  release), the contract (the actress's exclusive; none: freelance), `lens`: a director who came from the lens. (Fame
 *  is sim/fame.ts's, in `IndustryState.fame`.) */
export interface SeatState { titles: number; last?: number; fans?: number; contract?: ContractState; lens?: true; exclusiveAsked?: number; meetings?: number }
/** An offer in Take: a performer's `title`, a director's `brief` (`own`: the star-producer's own, with herself in the
 *  cast), an `exclusive` contract, a contract's `renewal`, a `fans` meeting, an `entry` (the lens). Kept until `until`. */
export type OfferKind = 'title' | 'brief' | 'exclusive' | 'renewal' | 'fans' | 'entry';
export interface Offer {
    id: number; kind: OfferKind; day: number; until: number;
    label?: string; genre?: string; name?: string; scenes?: TitleScene[]; cast?: string[]; set?: string; fee?: number;
    /** scenes the word test left out of the contract (a limit of someone in them), by kind */ dropped?: string[];
    /** a brief's named star (a roster id) */ star?: string; own?: true; entry?: string; contract?: string;
    result?: 'raise' | 'same' | 'dropped'; amount?: number; seen?: true;
}
/** A title as the save keeps it: core/industry.ts's TitleRec and what A keeps beside it: the fee (paid at the wrap),
 *  the `set` plans made with Tokyo's people, the best chart place is `peak`, weeks in the top 10, last week's sales, the
 *  brief it came from, Kanon's script, whether the shoot began (`started`), it was released (`out`), each week's sales
 *  (`hist`, the Take app's sparkline; older titles have none). */
export interface Title extends TitleRec { fee?: number; plans?: string[]; charts?: number; lastWeek?: number; brief?: true; script?: true; started?: true; out?: true; warned?: true; cut?: number; hist?: number[] }
export interface ChartRow { name: string; label: string; sales: number; title?: string }
export interface IndustryState {
    seats: { perform?: SeatState; direct?: SeatState };
    offers: Offer[];
    titles: Title[];
    /** titles folded out of the list (older than a year, past the 80 kept), their sales, the best seller's name */
    totals: { titles: number; sales: number; best?: string; bestSold?: number };
    chart: { week: number; rows: ChartRow[] };
    trend: { month: number; hot: string[]; cold: string; line?: string };
    /** the day of the last monthly test */
    test: number;
    /** (sim/stance.ts) per person */
    stance?: Record<string, any>;
    /** (sim/fame.ts) fame per seat, 0–100 */
    fame?: { perform?: number; direct?: number; label?: number };
    /** (sim/fame.ts) how many fans approached you */
    fans?: number;
    /** per roster performer: titles with you, the last one's day */
    roster: Record<string, { titles: number; last?: number }>;
    /** the last Monday's sales: the day, what each label sold (sim/label.ts reads it), your shares paid */
    week: { day?: number; labels?: Record<string, number>; pay?: { name: string; amount: number }[]; paid?: number };
    nextId: number;
    /** your own limits: a scene whose words match one is never in your contracts (set in Take) */
    limits: string[];
    /** per label: your standing (+1 a title, −1 a scene asked off), and the day its offers come again after one */
    standing: Record<string, { n: number; until?: number }>;
    /** Tokyo's people who said yes to being in your titles (avatar → the day) */
    yes: Record<string, number>;
    /** the last Monday offers were drawn */
    drawn?: number;
    /** scripts you've been given and not used yet (Kanon's: +2 to every scene of the title that uses one) */
    scripts?: number;
}

// (a record another part of the industry began, sim/fame.ts or sim/stance.ts writing only their own keys, is read with
// the rest defaulted, never written: industryOf fills it in for good on the first write)
export const peekIndustry = (g: Save): IndustryState => { const s = (g as any).industry; return (!s ? EMPTY : s.seats && s.offers && s.titles && s.totals && s.chart && s.trend ? s : { ...EMPTY, ...s }) as IndustryState; };
const EMPTY: IndustryState = Object.freeze({ seats: {}, offers: [], titles: [], totals: { titles: 0, sales: 0 }, chart: { week: -1, rows: [] }, trend: { month: -1, hot: [], cold: '' }, test: -9999, roster: {}, week: {}, nextId: 1, limits: [], standing: {}, yes: {} }) as any;
export function industryOf(g: Save): IndustryState {
    const s = ((g as any).industry ??= {}) as IndustryState;
    s.seats ??= {}; s.offers ??= []; s.titles ??= []; s.totals ??= { titles: 0, sales: 0 }; s.chart ??= { week: -1, rows: [] };
    s.trend ??= { month: -1, hot: [], cold: '' }; s.test ??= g.day; s.roster ??= {}; s.week ??= {}; s.nextId ??= 1;
    s.limits ??= []; s.standing ??= {}; s.yes ??= {};
    return s;
}

/* ---------- is it on ---------- */

/** The industry plays in this game: the world has it, the system and adult content are on. */
export const industryOn = (g: Save, w: WorldDef) => !!w.industry && systemOn(w, 'industry') && adultOn(g);
/** The industry's job (`w.industry.job`), as written. */
export const industryJob = (w: WorldDef): Occupation | null => (w.industry ? jobDef(w, w.industry.job) : null);
/** You work in the industry now: you hold its job, booked (no shifts). */
export const inIndustry = (g: Save, w: WorldDef) => industryOn(g, w) && g.player.job?.id === w.industry!.job && bookedJob(g, w, myJob(g, w));

/* ---------- the world's data ---------- */

export const genresOf = (w: WorldDef): GenreDef[] => w.industry?.genres ?? [];
export const labelsOf = (w: WorldDef): LabelDef[] => w.industry?.labels ?? [];
export const setsOf = (w: WorldDef): SetDef[] => w.industry?.sets ?? [];
export const rosterOf = (w: WorldDef): RosterPerson[] => w.industry?.roster ?? [];
export const genreOf = (w: WorldDef, id?: string) => genresOf(w).find(x => x.id === id);
export const labelOf = (w: WorldDef, id?: string) => labelsOf(w).find(x => x.id === id);
export const setOf = (w: WorldDef, id?: string) => setsOf(w).find(x => x.id === id);
export const rosterPerson = (w: WorldDef, id?: string) => rosterOf(w).find(x => x.id === id);
/** The director's label (the first offer, brief or the lens's offer is always its): the first label naming a director,
 *  else the first. */
export const homeLabel = (w: WorldDef): LabelDef | undefined => labelsOf(w).find(l => l.director) ?? labelsOf(w)[0];

/* ---------- the law's time, scaled to the season ---------- */

// (at the default 14-day season: a month 5 days, the wait 5, the release 20, a title selling 2 weeks)
const scale = (g: Save, n: number) => Math.max(1, Math.round((n * seasonDays(g)) / 14));
/** A month: a third of a season. */
export const monthDays = (g: Save) => Math.max(1, Math.round(seasonDays(g) / 3));
/** The law's month between a contract and its shoot. */
export const waitDays = (g: Save) => scale(g, 5);
/** The law's four months between a shoot and its release. */
export const releaseDays = (g: Save) => scale(g, 20);
/** Which month a day is in (0 first). */
export const monthOf = (g: Save, day = g.day) => Math.floor((Math.max(1, day) - 1) / monthDays(g));
/** Which season a day is in (0 first, counted on). */
export const seasonIndex = (g: Save, day = g.day) => Math.floor((Math.max(1, day) - 1) / seasonDays(g));
export const isMonday = (day: number) => (day - 1) % 7 === 0;

/* ---------- seats ---------- */

/** The paths that are directing (behind the camera; an entry's path, the lens's), and the actress's star-producer. */
export const DIRECT_PATH = 'director', STAR_PATH = 'starproducer';
/** You're on this path of your job from its first rank on (chosen at the branch, you're still at the rank before). */
export function onPath(g: Save, w: WorldDef, path: string): boolean {
    const j = g.player.job, o = myJob(g, w);
    if (!j?.path?.includes(path) || !o) return false;
    const opt = (o.branches ?? []).flatMap(b => b.options ?? []).find(x => x.id === path);
    if (!opt) return false;
    const first = careerOf(g, o).ranks.findIndex(r => opt.ranks.includes(r) || opt.ranks.some(x => x.name === r.name && x.pay === r.pay));
    return first >= 0 && j.rank >= first;
}
/** The paths of the job that are directing: Behind the camera, and any entry's (the lens). */
export const directPaths = (w: WorldDef) => { const o = industryJob(w); const p = new Set([DIRECT_PATH]); for (const t of [o, ...Object.values(o?.tracks ?? {})]) for (const e of t?.entries ?? []) p.add(e.path); return p; };
/** Directing now (on a directing path from its first rank). */
export const directing = (g: Save, w: WorldDef) => inIndustry(g, w) && [...directPaths(w)].some(p => onPath(g, w, p));
/** A venture of kind `label` is yours and open (read as sim/ventures.ts keeps it; not imported, so the order modules
 *  load in stays as it was). */
export const ownsLabel = (g: Save, w: WorldDef) => ((g as any).ventures?.list ?? []).some((v: any) => v && !v.closed && (w.ventures ?? []).some(d => d.id === v.id && (d.kind ?? d.track) === 'label'));
/** The seats you hold now: performing (the job, not directing), directing, a label of your own (a venture of kind `label`). */
export function seatsNow(g: Save, w: WorldDef): Seat[] {
    if (!industryOn(g, w)) return [];
    const out: Seat[] = [];
    if (inIndustry(g, w)) out.push(directing(g, w) ? 'direct' : 'perform');
    if (ownsLabel(g, w)) out.push('label');
    return out;
}
/** Fame in a seat, 0–100 (sim/fame.ts keeps it in `g.industry.fame`). */
export const fameOf = (g: Save, seat: Seat) => Math.max(0, Math.min(100, peekIndustry(g).fame?.[seat] ?? 0));
/** Your job's track's rank, as words ("Rookie, AV actress"). */
export function rankWords(g: Save, w: WorldDef): string {
    const o = myJob(g, w);
    return o ? `${rankOf(g, o).name} (${(trackOf(g, o) as any).title ?? o.name})` : '';
}

/* ---------- what the AI is told ---------- */

/** (sim/titles.ts) The day's shoot and the latest titles, in words. */
export const titleWords: ((g: Save, w: WorldDef) => string[])[] = [];
/** For the AI (the `you` block): your seats and ranks, fame, today's shoot and latest title, the label. (The stances of
 *  the people present are sim/stance.ts's own scene lines.) Nothing with adult content off, the system off or a world
 *  without the industry. */
export function industryLine(g: Save, w: WorldDef, _present: Resident[] = []): string {
    if (!industryOn(g, w)) return '';
    const parts: string[] = [];
    const seats = seatsNow(g, w);
    if (seats.includes('perform') || seats.includes('direct')) {
        const st = peekIndustry(g), seat = seats.includes('direct') ? 'direct' : 'perform', n = st.seats[seat]?.titles ?? 0;
        const fame = fameOf(g, seat), c = st.seats.perform?.contract;
        parts.push(`{{user}} works in adult video, ${seat === 'direct' ? 'directing' : 'performing'}: ${rankWords(g, w)}, ${n === 1 ? 'one title' : `${n} titles`} so far${c && seat === 'perform' ? `, exclusive to ${labelOf(w, c.label)?.name ?? c.label}` : ''}${fame >= 60 ? '; well known, recognized often in Akihabara and Kabukichō' : fame >= 25 ? '; recognized now and then' : ''}.`);
    }
    if (seats.includes('label')) parts.push('{{user}} runs an adult video label of their own.');
    for (const f of titleWords) parts.push(...f(g, w));
    return parts.filter(Boolean).join(' ');
}
