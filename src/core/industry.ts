// The adult industry's world data made safe: `w.industry`'s genres, labels, sets, job-only performers, pay, sales,
// fame, scene pictures and the chart's words from someone else's file, with their defaults; and the industry's fields
// elsewhere (a job's `bookings`, `entries`, `contracts` and `stigma`, a person's `stance`, a venture's ways' `when`).
// The format is in core/world.ts (IndustryDef); what plays it is sim/industry.ts and the files beside it. A world
// without `industry` gets no key, and the other fields are only cleaned where they already are, so a world that
// uses none of them comes out of upgradeWorld() exactly as before.
import type { WorldDef, IndustryDef, GenreDef, LabelDef, SetDef, RosterPerson, ScenePic, EntryDef, ContractDef, Stance, Occupation, JobTrack } from './world.js';

// (kept here, not in core/world.ts, which imports core/presets.ts, which imports this file)
export const STANCES: Stance[] = ['fine', 'uneasy', 'no'];
/** A job's stigma: 0 nobody minds, 1 a warning when a coworker recognizes you, 2 a warning and then you're let go. */
export const STIGMA = [0, 1, 2] as const;
/** The numbers when a world gives none (first guesses, tuned by the long run). */
export const INDUSTRY = {
    /** a title's weekly sales at quality 60 on a tier-2 label, the weeks they fade over (0: a season), hot and cold trends */
    sales: { base: 60000, weeks: 0, hot: 1.3, cold: 0.7 },
    /** fame per release at quality 60, lost a week without one, recognition by place tag (× the base chance) */
    fame: { titles: 4, fade: 1, places: { otaku: 2, nightlife: 2, shrine: 0.3 } as Record<string, number> },
    /** a Name director's share of their titles' sales, by rank on the path from its first */
    share: [0, 0, 0.05],
    /** scenes a title has, at least and at most */
    scenes: [1, 4] as [number, number],
};
/** The most a title may pay or sell in a week. */
export const INDUSTRY_PAY_MAX = 1_000_000;

const ID = /^[^\s,;]+$/;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const id = (v: unknown) => { const s = str(v); return s && ID.test(s) ? s : undefined; };
const strs = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()))] : []);
const ids = (v: unknown) => strs(v).filter(x => ID.test(x));
const when = (v: unknown) => (typeof v === 'string' ? (v.trim() || undefined) : v && typeof v === 'object' && !Array.isArray(v) ? v as any : undefined);
const num = (v: unknown, lo: number, hi: number, whole = true) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    const n = Math.max(lo, Math.min(hi, v));
    return whole ? Math.round(n) : n;
};
const uniq = <T extends { id: string }>(list: T[]) => { const seen = new Set<string>(); return list.filter(x => !seen.has(x.id) && !!seen.add(x.id)); };
const obj = (v: unknown): any => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const set = <T extends object, K extends keyof T>(o: T, k: K, v: T[K] | undefined) => { if (v === undefined || (Array.isArray(v) && !v.length)) delete o[k]; else o[k] = v; };

function genre(x: any): GenreDef | null {
    const g = obj(x); const i = id(g?.id), name = str(g?.name);
    if (!i || !name) return null;
    const out: GenreDef = { id: i, name };
    set(out, 'skill', id(g.skill)); set(out, 'words', strs(g.words)); set(out, 'scenes', strs(g.scenes));
    set(out, 'pay', num(g.pay, 0.1, 5, false)); set(out, 'dc', num(g.dc, 1, 30)); if (g.adult === true) out.adult = true;
    return out;
}
function label(x: any): LabelDef | null {
    const l = obj(x); const i = id(l?.id), name = str(l?.name);
    if (!i || !name) return null;
    const out: LabelDef = { id: i, name };
    set(out, 'tier', num(l.tier, 1, 3)); set(out, 'pay', num(l.pay, 0.1, 5, false)); set(out, 'genres', ids(l.genres));
    set(out, 'set', id(l.set)); set(out, 'director', str(l.director)); set(out, 'desc', str(l.desc));
    return out;
}
function setDef(x: any, places: Set<string>): SetDef | null {
    const s = obj(x); const i = id(s?.id), name = str(s?.name);
    if (!i || !name) return null;
    const out: SetDef = { id: i, name };
    const p = id(s.place); if (p && places.has(p)) out.place = p;
    set(out, 'zone', id(s.zone)); set(out, 'genres', ids(s.genres));
    set(out, 'fee', num(s.fee, 0, INDUSTRY_PAY_MAX)); set(out, 'risk', num(s.risk, 0, 1, false));
    return out.place || out.zone ? out : null;
}
function rosterPerson(x: any): RosterPerson | null {
    const r = obj(x); const i = id(r?.id), name = str(r?.name);
    if (!i || !name) return null;
    // the person's own fields (art, profile, words) are an ExampleCharacter's and are kept as written: the cast's own
    // cleaning (sim/gender.ts) reads them when the performer's card is made
    const out: RosterPerson = { ...r, id: i, name };
    set(out, 'rank', num(r.rank, 0, 4)); set(out, 'genres', ids(r.genres)); set(out, 'debut', num(r.debut, 0, 100000));
    set(out, 'stories', ids(r.stories));
    if (typeof r.age === 'number' && r.age < 18) return null;   // never anyone under 18
    return out;
}
function pic(x: any): ScenePic | null {
    const p = obj(x); const who = id(p?.who), file = str(p?.file);
    if (!who || !file) return null;
    const out: ScenePic = { who, file };
    set(out, 'with', ids(p.with)); set(out, 'genre', id(p.genre)); set(out, 'words', strs(p.words));
    return out;
}

function entry(x: any): EntryDef | null {
    const e = obj(x); const i = id(e?.id), name = str(e?.name), path = id(e?.path);
    if (!i || !name || !path) return null;
    const out: EntryDef = { id: i, name, path };
    set(out, 'when', when(e.when));
    return out;
}
function contract(x: any): ContractDef | null {
    const c = obj(x); const i = id(c?.id), name = str(c?.name);
    if (!i || !name) return null;
    const out: ContractDef = { id: i, name };
    set(out, 'titles', num(c.titles, 1, 30)); set(out, 'fee', num(c.fee, 0.1, 10, false)); set(out, 'counts', num(c.counts, 0.5, 5, false));
    set(out, 'fame', num(c.fame, 0.1, 5, false)); set(out, 'renew', num(c.renew, 0, INDUSTRY_PAY_MAX * 13));
    if (c.exclusive === true) out.exclusive = true;
    return out;
}
// a job's or a track's industry fields, cleaned only where they are
function jobFields(o: Occupation | JobTrack) {
    const x: any = o;
    if ('bookings' in x && x.bookings !== true) delete x.bookings;
    if ('entries' in x) { const v = uniq((Array.isArray(x.entries) ? x.entries : []).map(entry).filter(Boolean) as EntryDef[]); if (v.length) x.entries = v; else delete x.entries; }
    if ('contracts' in x) { const v = uniq((Array.isArray(x.contracts) ? x.contracts : []).map(contract).filter(Boolean) as ContractDef[]); if (v.length) x.contracts = v; else delete x.contracts; }
    if ('stigma' in x && !STIGMA.includes(x.stigma)) delete x.stigma;
}

export function upgradeIndustry(w: WorldDef) {
    for (const o of w.occupations ?? []) { jobFields(o); for (const t of Object.values(o.tracks ?? {})) if (t) jobFields(t); }
    for (const ex of w.cast?.examples ?? []) {
        const x: any = ex;
        if (!('stance' in x)) continue;
        const s = obj(x.stance), perform = STANCES.includes(s?.perform) ? s.perform as Stance : undefined;
        if (!perform) { delete x.stance; continue; }
        x.stance = { perform, ...(STANCES.includes(s.direct) ? { direct: s.direct as Stance } : {}) };
    }
    for (const v of w.ventures ?? []) { const ways: any = (v as any).ways; if (ways && 'when' in ways) { const c = when(ways.when); if (c) ways.when = c; else delete ways.when; } }
    if (!('industry' in w)) return;
    const d: any = (w as any).industry;
    if (!obj(d) || !id(d.job)) { delete (w as any).industry; return; }
    const places = new Set((w.places ?? []).map(p => p.id));
    const out: IndustryDef = { job: id(d.job)! };
    set(out, 'genres', uniq((Array.isArray(d.genres) ? d.genres : []).map(genre).filter(Boolean) as GenreDef[]));
    set(out, 'labels', uniq((Array.isArray(d.labels) ? d.labels : []).map(label).filter(Boolean) as LabelDef[]));
    set(out, 'sets', uniq((Array.isArray(d.sets) ? d.sets : []).map((x: any) => setDef(x, places)).filter(Boolean) as SetDef[]));
    set(out, 'roster', uniq((Array.isArray(d.roster) ? d.roster : []).map(rosterPerson).filter(Boolean) as RosterPerson[]));
    set(out, 'pictures', (Array.isArray(d.pictures) ? d.pictures : []).map(pic).filter(Boolean) as ScenePic[]);
    const s = obj(d.sales); if (s) out.sales = { base: num(s.base, 0, INDUSTRY_PAY_MAX) ?? INDUSTRY.sales.base, weeks: num(s.weeks, 0, 52) ?? INDUSTRY.sales.weeks, hot: num(s.hot, 1, 3, false) ?? INDUSTRY.sales.hot, cold: num(s.cold, 0.1, 1, false) ?? INDUSTRY.sales.cold };
    const f = obj(d.fame); if (f) {
        const places2: Record<string, number> = {};
        for (const [k, v] of Object.entries(obj(f.places) ?? {})) { const n = num(v, 0, 5, false); if (ID.test(k) && n !== undefined) places2[k] = n; }
        out.fame = { titles: num(f.titles, 0, 50, false) ?? INDUSTRY.fame.titles, fade: num(f.fade, 0, 20, false) ?? INDUSTRY.fame.fade, places: Object.keys(places2).length ? places2 : { ...INDUSTRY.fame.places } };
    }
    const p = obj(d.pay); if (p) { const share = (Array.isArray(p.share) ? p.share : []).map((x: unknown) => num(x, 0, 0.5, false)).filter((x: number | undefined): x is number => x !== undefined); if (share.length) out.pay = { share }; }
    const c = obj(d.covers); if (c && str(c.layout)) out.covers = { layout: str(c.layout) };
    const ch = obj(d.chart); if (ch) { const names = strs(ch.names); if (names.length) out.chart = { names }; }
    set(out, 'label', id(d.label));
    (w as any).industry = out;
}

/* ---------- the contract between the sessions (A: titles and bookings, S: the set, R: life outside, U, V) ---------- */

/** A seat on a title: performing, directing, the label above it, or taking its stills (a photographer on the set of
 *  someone else's title, plans/industry-lens.md Part 1: no share of the sales, no fame as a performer, no stance
 *  about performing). */
export type Seat = 'perform' | 'direct' | 'label' | 'stills';
/** How a scene went (the private moments' three results). */
export type SceneGrade = 'great' | 'good' | 'poor';
/** One part of a scene's roll, by name, as the photo shoot's parts (shown in a scene's result). */
export interface ShotPart { name: string; add: number }
/** A scene of a title: its kind (a genre's scene words), who is in it (avatars; the player is YOU), and once played
 *  its quality (0–100), grade, the roll's parts and the drawn picture shown (a ScenePic's file). */
export interface TitleScene { kind: string; with: string[]; q?: number; grade?: SceneGrade; parts?: ShotPart[]; pic?: string }
/** A title (the save's record, sim/titles.ts writes it; sim/onset.ts plays its scenes; the Take app shows it). Days are
 *  game days; `you` the seats the player holds on it; `cast` avatars (Tokyo's people and roster performers' cards);
 *  `cover`: the photo it's sold with (a still's id in the photo records, sim/photo.ts), drawn instead of the automatic
 *  cover (sim/covers.ts). */
export interface TitleRec {
    id: string; name: string; genre: string; label: string; you: Seat[]; cast: string[]; scenes: TitleScene[];
    set: string; contract: number; shoot: number; release: number;
    q?: number; edited?: number; sold: number; weeks: number; peak?: number; cancelled?: true; adult: true;
    cover?: number;
}
/** What the set needs to know of a title to play its shoot day (sim/titles.ts hands it to sim/onset.ts through
 *  `setLink.start`): the title, the place the set is at, the call time (absolute minutes), and the roster performers to
 *  bring on set (their ids in `w.industry.roster`; Tokyo's people come by their `set` plan, not by this list). */
export interface SetCall { title: TitleRec; place: string; call: number; roster: string[] }
/** A photo call (plans/industry-lens.md Part 2): a roster performer (`who`: her id, bare or `roster:<id>`) comes to
 *  `place` for a photo shoot from `from` to `to` (absolute minutes), the set's way: in the cast with `onset` for the
 *  window and gone after, with no plan or routine of her own (sim/photocall.ts fills `setLink.visit`). `outfit`: what
 *  the shoot puts her in (`naked` or one of her outfits; worn on set for the window). */
export interface PhotoCall { who: string; place: string; from: number; to: number; outfit?: string }
/** What a photo call gives: her avatar in the cast for the window (null: she can't come; `waiting`: her card is still
 *  being made, ask again), and lines for the player. */
export interface PhotoCallResult { avatar: string | null; waiting?: true; lines: string[] }
