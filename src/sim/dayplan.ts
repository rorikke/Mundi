// What the world's people do on a given day besides their routine template:
// · J5: the shifts of a job with a weekly schedule (days off spread across the team so a workplace is never empty,
//   a vacation now and then), and their rank. The weekdays of the world's own people's standing appointments (E21,
//   rituals) are days off, or working days when the appointment is at their own workplace.
// It all comes from the day itself (nothing stored), kept until anything it reads changes (who works where, a click,
// the rules). A job without a schedule: nothing here changes, the routine templates play as before.
import { nowAbs, changes, cfg, type Save, type Resident } from '../core/store.js';
import { systemOn, isScenario, exampleTag, WEEKDAY_IDS, type WorldDef, type Occupation, type ExampleCharacter, type Ritual } from '../core/world.js';
import { charOf } from '../st/bridge.js';
import { onDay } from './hooks.js';
import { isWeekend, seasonDays } from './time.js';
import { placeOn } from './places.js';
import { routineStep } from './people.js';
import { personNamed } from './when.js';
import { npcCareer } from './work.js';
import { npcRank } from './longlife.js';

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const wdOf = (day: number) => (((day - 1) % 7) + 7) % 7;   // 0 = Monday (day 1 is a Monday)
const overlap = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c));

/* ---------- who is who ---------- */

// The world's example character a resident was made from: their card's tag, or the same name.
const exKept = new WeakMap<WorldDef, Map<string, ExampleCharacter | null>>();
export function exampleOf(w: WorldDef, r: Resident): ExampleCharacter | null {
    let m = exKept.get(w); if (!m) exKept.set(w, m = new Map());
    const k = `${r.avatar}|${r.name}`;
    const have = m.get(k);
    if (have !== undefined) return have;
    const tag = charOf(r.avatar)?.data?.extensions?.mundi?.example;
    const ex = (tag ? w.cast.examples.find(e => exampleTag(w, e) === tag) : undefined) ?? w.cast.examples.find(e => e.name === r.name) ?? null;
    m.set(k, ex);
    return ex;
}
/** (E15) Adult content for this save (off unless the save turns it on). */
export const adultOn = (g: Save) => (cfg(g) as any).adult === true;
const adultKept = new WeakMap<WorldDef, { list: unknown; n: number; ids: Set<string> }>();
/** The world's adult places (kept while its places stay the same). */
export function adultPlaces(w: WorldDef): Set<string> {
    let k = adultKept.get(w);
    if (!k || k.list !== w.places || k.n !== w.places.length) adultKept.set(w, k = { list: w.places, n: w.places.length, ids: new Set(w.places.filter(p => p.adult).map(p => p.id)) });
    return k.ids;
}
const adultPlace = (w: WorldDef, id: string) => adultPlaces(w).has(id);
/** Can people of this save be sent to this place (it exists in this game, and isn't adult with adult content off)? */
export const placeOk = (g: Save, w: WorldDef, id: string) => (id.startsWith('home:') || w.places.some(p => p.id === id)) && placeOn(g, w, id) && (adultOn(g) || !adultPlace(w, id));

/* ---------- what everything here reads ---------- */

// The people of the save as they are: who lives here, their job, name, routine, leisure and home, and the rules. A new
// stamp means every plan here is worked out again. The rules are checked on every ask; the people once a game minute
// and after every click (where everyone is gets asked tens of thousands of times a day: rumors spreading ask about
// every pair). So a change the engine makes to someone (a new job, a move) reaches the others' plans the next minute.
export interface Stamp { id: number; w: WorldDef; code: number; sd: number; adult: boolean; swap: string; list: Resident[]; sig: unknown[] }
let stamps = 0;
const kept = new WeakMap<Save, Stamp>();
// The systems it reads, as one number (what each one's switch says: on, off or unset), so systemOn (a search through
// every system) is asked again only when a switch changes.
const RULES = ['jobs', 'living', 'events', 'festivals', 'relations', 'romance'] as const;
const sw = (v: unknown) => (v === true ? 1 : v === false ? 2 : 0);
const codeOf = (w: WorldDef) => { const f = w.features as any; return f ? ((((sw(f.jobs) * 3 + sw(f.living)) * 3 + sw(f.events)) * 3 + sw(f.festivals)) * 3 + sw(f.relations)) * 3 + sw(f.romance) : 0; };
const onKept = new WeakMap<WorldDef, { code: number; on: Record<string, boolean> }>();
/** systemOn for the systems the day plans read, kept while their switches stay as they are. */
export function ruleOn(w: WorldDef, id: typeof RULES[number]): boolean {
    const code = codeOf(w);
    let k = onKept.get(w);
    if (!k || k.code !== code) onKept.set(w, k = { code, on: Object.fromEntries(RULES.map(x => [x, systemOn(w, x)])) });
    return k.on[id];
}
const SIG = 7;
const sigOf = (r: Resident, out: unknown[], i: number) => { out[i] = r; out[i + 1] = r.occupation; out[i + 2] = r.name; out[i + 3] = r.routine; out[i + 4] = r.leisure; out[i + 5] = r.home?.zone; out[i + 6] = (r as any).homeWith; };
const checked = new WeakMap<Save, { at: number; n: number }>();
export function stampOf(g: Save, w: WorldDef): Stamp {
    const s = kept.get(g), code = codeOf(w), sd = seasonDays(g), adult = adultOn(g), swap = (g as any).swap?.avatar ?? '';
    const at = nowAbs(g), n = changes(), c = checked.get(g);
    if (s && s.w === w && s.code === code && s.sd === sd && s.adult === adult && s.swap === swap && c && c.at === at && c.n === n) return s;
    checked.set(g, { at, n });
    if (s && s.w === w && s.code === code && s.sd === sd && s.adult === adult && s.swap === swap) {
        let i = 0, same = true;
        for (const a in g.cast) {
            const r = g.cast[a], x = s.sig;
            if (x[i] !== r || x[i + 1] !== r.occupation || x[i + 2] !== r.name || x[i + 3] !== r.routine || x[i + 4] !== r.leisure || x[i + 5] !== r.home?.zone || x[i + 6] !== (r as any).homeWith) { same = false; break; }
            i += SIG;
        }
        if (same && i === s.sig.length) return s;
    }
    const list = Object.values(g.cast), sig: unknown[] = [];
    list.forEach((r, i) => sigOf(r, sig, i * SIG));
    const made: Stamp = { id: ++stamps, w, code, sd, adult, swap, list, sig };
    kept.set(g, made);
    return made;
}

/* ---------- shifts (J5) ---------- */

/** A job's week: how many days or which weekdays, and its shift windows in hours [from, to) (`to` past 24 runs into the
 *  next day). Null for a job without a schedule: its people keep their routine template's work hours, as before. A
 *  schedule without hours takes the job's opening hours (a shift as long as the job's `shift`). */
type Week = { days: number | string[]; windows: [number, number][] };
const weekKept = new WeakMap<Occupation, { s: unknown; week: Week | null }>();
export function scheduleOf(o: Occupation | null | undefined): Week | null {
    const s = o?.schedule; if (!o || !s) return null;
    const k = weekKept.get(o); if (k && k.s === s) return k.week;
    const week = weekOf(o, s);
    weekKept.set(o, { s, week });
    return week;
}
function weekOf(o: Occupation, s: NonNullable<Occupation['schedule']>): Week {
    const fix = (a: number, b: number): [number, number] => [a, b <= a ? b + 24 : b];
    let windows = (s.shifts ?? []).map(x => fix(x.from, x.to));
    if (!windows.length) {
        const from = s.from ?? o.hours?.[0] ?? 9;
        const open = o.hours ? (o.hours[1] <= o.hours[0] ? o.hours[1] + 24 : o.hours[1]) : from + 8;
        windows = [fix(from, s.to ?? Math.min(open, from + (o.shift ?? 8)))];
    }
    return { days: s.days, windows };
}
// Their job in this game (an adult job, or one at an adult place, only with adult content on).
const jobsKept = new WeakMap<WorldDef, { list: Occupation[]; n: number; by: Map<string, Occupation> }>();
export function jobOf(g: Save, w: WorldDef, r: Resident): Occupation | null {
    if (!r.occupation || !ruleOn(w, 'jobs')) return null;
    let k = jobsKept.get(w);
    if (!k || k.list !== w.occupations || k.n !== w.occupations.length) jobsKept.set(w, k = { list: w.occupations, n: w.occupations.length, by: new Map(w.occupations.map(o => [o.id, o])) });
    const o = k.by.get(r.occupation) ?? null;
    return o && (adultOn(g) || (!o.adult && !adultPlace(w, o.place))) ? o : null;
}
/** Does this person's job follow a weekly schedule (their shifts come from it, not from their routine)? */
export const scheduled = (g: Save, w: WorldDef, r: Resident) => !isScenario(w) && !!scheduleOf(jobOf(g, w, r));

interface Plan { days: boolean[]; from: number; to: number; i: number; fixed: Set<number> }
// A ritual of someone at their own workplace during their shift hours is a day they work (Kyōko behind the bar on
// Reiko's Fridays); one elsewhere that their shift would cut short is a day off (Mio's Friday karaoke). Then the other
// days off go where most of the team is working, so the place is never empty.
const plansKept = new WeakMap<Stamp, Map<string, Map<string, Plan>>>();
function teamPlans(g: Save, w: WorldDef, o: Occupation, st: Stamp, busy = new Set<string>()): Map<string, Plan> {
    let byJob = plansKept.get(st); if (!byJob) plansKept.set(st, byJob = new Map());
    const have = byJob.get(o.id); if (have) return have;
    const out = new Map<string, Plan>();
    const s = scheduleOf(o); if (!s) return out;
    if (busy.has(o.id)) return out;   // a loop through rituals on each other's days off: no fixed days this time
    busy.add(o.id);
    const team = st.list.filter(r => r.occupation === o.id).sort((a, b) => (a.avatar < b.avatar ? -1 : 1));
    const closed = (w.places.find(p => p.id === o.place) as any)?.closedDays as string[] | undefined;
    const work = new Map<string, boolean[]>(), must = new Map<string, Set<number>>(), offs = new Map<string, Set<number>>();
    const cover = Array(7).fill(0);
    team.forEach((r, i) => {
        const rits = ritualsFor(g, w, r.avatar, st).filter(x => weekly(x.rit)).map(x => ({ x, days: ritualWeekdays(g, w, x, st, busy) }));
        // their shift: the window that covers their rituals at work (Mio behind the counter at 5:00: the night shift),
        // then the one closest to their routine's work hours, then by turns
        const atWork = (win: [number, number]) => rits.reduce((n, { x }) => n + (x.rit.place === o.place ? Math.max(...[0, -24].map(dd => overlap(x.rit.from, x.rit.to, win[0] + dd, win[1] + dd))) : 0), 0);
        const hrs = new Set(r.routine.weekday.flatMap((x, k, all) => (x[1] === 'work' ? range(x[0], all[k + 1]?.[0] ?? 24) : [])));
        const fit = (win: [number, number]) => range(win[0], win[1]).filter(h => hrs.has(h % 24)).length;
        const turn = (k: number) => (((k - i) % s.windows.length) + s.windows.length) % s.windows.length;
        const order = s.windows.map((win, k) => ({ win, k, a: atWork(win), f: fit(win) })).sort((a, b) => b.a - a.a || b.f - a.f || turn(a.k) - turn(b.k));
        const [from, to] = order[0].win;
        const m = new Set<number>(), off = new Set<number>();
        out.set(r.avatar, { days: [], from, to, i, fixed: off });
        closed?.forEach(d => { const k = WEEKDAY_IDS.indexOf(d as any); if (k >= 0) off.add(k); });
        for (const { x, days } of rits) {
            for (const wd of days) for (const d of [wd - 1, wd, wd + 1]) {
                const sf = (d - wd) * 24 + from, sto = (d - wd) * 24 + to, k = ((d % 7) + 7) % 7;
                const ov = overlap(x.rit.from, x.rit.to, sf, sto);
                if (!ov) continue;
                if (x.rit.place === o.place) m.add(k);
                else if (x.rit.to - x.rit.from - ov < Math.min(1.5, 0.6 * (x.rit.to - x.rit.from))) off.add(k);   // a small overlap only moves it
            }
        }
        must.set(r.avatar, m); offs.set(r.avatar, off);
    });
    // fixed days first, for everyone, then the rest where most are working
    for (const r of team) { const days = Array(7).fill(true); for (const k of offs.get(r.avatar)!) if (!must.get(r.avatar)!.has(k)) days[k] = false; work.set(r.avatar, days); days.forEach((on, k) => { if (on) cover[k]++; }); }
    for (const r of team) {
        const days = work.get(r.avatar)!, want = Array.isArray(s.days) ? -1 : Math.max(1, Math.min(7, Math.round(s.days)));
        if (want < 0) { const list = s.days as string[]; for (let k = 0; k < 7; k++) { const on = list.includes(WEEKDAY_IDS[k]) && !offs.get(r.avatar)!.has(k) || must.get(r.avatar)!.has(k); if (days[k] && !on) cover[k]--; days[k] = on; } }
        else {
            while (days.filter(Boolean).length > want) {
                const cand = [0, 1, 2, 3, 4, 5, 6].filter(k => days[k] && !must.get(r.avatar)!.has(k));
                if (!cand.length) break;
                cand.sort((a, b) => cover[b] - cover[a] || H(`${r.avatar}|${o.id}|off|${a}`) - H(`${r.avatar}|${o.id}|off|${b}`));
                days[cand[0]] = false; cover[cand[0]]--;
            }
        }
        out.get(r.avatar)!.days = days;
    }
    busy.delete(o.id);
    byJob.set(o.id, out);
    return out;
}
const range = (a: number, b: number) => { const out: number[] = []; for (let h = Math.floor(a); h < b; h++) out.push(h); return out; };

/** On vacation that day (J5): now and then (about every other pair of seasons) three days off work in a row; never two
 *  of a team at once. Only people whose job has a schedule. */
export function onVacation(g: Save, w: WorldDef, r: Resident, day: number, st = stampOf(g, w)): boolean {
    const o = jobOf(g, w, r); if (!o || !scheduleOf(o) || isScenario(w)) return false;
    const block = 2 * seasonDays(g), b = Math.floor((day - 1) / block);
    if (block < 7 || H(`${g.world}|${r.avatar}|vac|${b}`) >= 0.5) return false;
    const i = teamPlans(g, w, o, st).get(r.avatar)?.i ?? 0;
    const start = (Math.floor(H(`${g.world}|${o.id}|vac|${b}`) * block) + i * 4) % (block - 3);
    const d = (day - 1) % block;
    return d >= start && d < start + 3;
}
export interface Shift { from: number; to: number; place: string }
/** The shift that starts on that day (absolute minutes), if they work then. */
export function shiftOn(g: Save, w: WorldDef, r: Resident, day: number, st = stampOf(g, w)): Shift | null {
    const o = jobOf(g, w, r); if (!o || isScenario(w) || !scheduleOf(o)) return null;
    const plans = teamPlans(g, w, o, st), p = plans.get(r.avatar), wd = wdOf(day);
    if (!p || onVacation(g, w, r, day, st)) return null;
    if (!p.days[wd]) {
        // someone covers for a colleague on vacation: when nobody else works that day, the first one free (and not off for
        // a ritual) does
        if (plans.size < 2) return null;
        const away = (a: string) => onVacation(g, w, g.cast[a], day, st);
        if ([...plans].some(([a, q]) => q.days[wd] && !away(a))) return null;
        const cover = [...plans].find(([a, q]) => !away(a) && !q.fixed.has(wd)) ?? [...plans].find(([a]) => !away(a));
        if (cover?.[0] !== r.avatar) return null;
    }
    return { from: day * 1440 + Math.round(p.from * 60), to: day * 1440 + Math.round(p.to * 60), place: o.place };
}
/** The shift going on at that moment (one that started the day before may still be on), if any. */
export function shiftAt(g: Save, w: WorldDef, r: Resident, at: number, st = stampOf(g, w)): Shift | null {
    const d = Math.floor(at / 1440);
    for (const day of [d, d - 1]) { const s = shiftOn(g, w, r, day, st); if (s && s.from <= at && at < s.to) return s; }
    return null;
}
/** A day off for them: no shift that day (for a job with a schedule), or the weekend (anyone else). */
export const dayOff = (g: Save, w: WorldDef, r: Resident, day: number, st = stampOf(g, w)) => (scheduled(g, w, r) ? !shiftOn(g, w, r, day, st) : isWeekend(day));

/* ---------- ranks (J5) ---------- */

// The world's people start at the rank the world gives them (once, while they still hold that job).
export function seedRanks(g: Save, w: WorldDef) {
    const l = ((g as any).living ??= {}); l.ranks ??= {}; l.ranked ??= [];
    for (const r of Object.values(g.cast)) {
        if (l.ranked.includes(r.avatar)) continue;
        const ex = exampleOf(w, r), o = jobOf(g, w, r);
        if (!ex || ex.rank === undefined || !o || ex.occupation !== o.id) continue;
        l.ranked.push(r.avatar);
        if (r.avatar in l.ranks) continue;
        const ranks = npcCareer(o, r.avatar).ranks;
        const n = typeof ex.rank === 'number' ? ex.rank : ranks.findIndex(x => x.name === ex.rank);
        if (n > 0) l.ranks[r.avatar] = Math.min(n, Math.max(0, ranks.length - 1));
    }
}
onDay.push((g, w) => { if (systemOn(w, 'jobs')) seedRanks(g, w); return []; });
/** The name of the rank someone holds at their job ('' without one). */
export function rankName(g: Save, w: WorldDef, r: Resident): string {
    const o = jobOf(g, w, r); if (!o) return '';
    seedRanks(g, w);
    const ranks = npcCareer(o, r.avatar).ranks;
    return ranks.length > 1 ? ranks[Math.min(npcRank(g, r.avatar), ranks.length - 1)]?.name ?? '' : '';
}

/* ---------- rituals (E21) ---------- */

/** A ritual of one of the world's people (its owner), and who comes: the owner, then those of `with` in this save. */
export interface RitualRef { owner: string; i: number; rit: Ritual; who: string[] }
const ritKept = new WeakMap<Stamp, Map<string, RitualRef[]>>();
// Rituals exist for the world's people in this save only (adult ones with adult content on).
function ritualIndex(g: Save, w: WorldDef, st: Stamp): Map<string, RitualRef[]> {
    let m = ritKept.get(st); if (m) return m;
    m = new Map();
    if (systemOn(w, 'living') && !isScenario(w)) for (const r of st.list) {
        const ex = exampleOf(w, r);
        (ex?.rituals ?? []).forEach((rit, i) => {
            if (rit.adult && !adultOn(g)) return;
            const who = [r.avatar, ...(rit.with ?? []).map(n => personNamed(g, n)?.avatar ?? '')].filter((a, k, all) => a && g.cast[a] && all.indexOf(a) === k);
            const ref: RitualRef = { owner: r.avatar, i, rit, who };
            for (const a of who) { const list = m!.get(a); if (list) list.push(ref); else m!.set(a, [ref]); }
        });
    }
    ritKept.set(st, m);
    return m;
}
export const ritualsFor = (g: Save, w: WorldDef, avatar: string, st = stampOf(g, w)) => ritualIndex(g, w, st).get(avatar) ?? [];
const weekly = (rit: Ritual) => rit.every === undefined || rit.every === 'week' || typeof rit.every === 'number';
// The weekdays of a ritual: its own, or (none given) the owner's days off.
function ritualWeekdays(g: Save, w: WorldDef, x: RitualRef, st: Stamp, busy?: Set<string>): number[] {
    if (x.rit.days?.length) return x.rit.days.map(d => WEEKDAY_IDS.indexOf(d)).filter(k => k >= 0);
    const r = g.cast[x.owner], o = r && jobOf(g, w, r);
    if (!r || !o || !scheduleOf(o)) return [5, 6];
    const p = teamPlans(g, w, o, st, busy).get(x.owner);
    return p ? [0, 1, 2, 3, 4, 5, 6].filter(k => !p.days[k]) : [5, 6];
}
/** The step of their routine at that moment, by their own week: a day off of a job with a schedule follows the
 *  weekend steps, a working day the weekday ones (anyone else: the calendar's weekend). */
export function dayStep(g: Save, w: WorldDef, r: Resident, at: number, st = stampOf(g, w)): [number, string] {
    if (!scheduled(g, w, r)) return routineStep(r, at);
    const day = Math.floor(at / 1440), h = Math.floor((at % 1440) / 60);
    const steps = dayOff(g, w, r, day, st) ? r.routine.weekend : r.routine.weekday;
    let cur = steps[0];
    for (const s of steps) if (s[0] <= h) cur = s;
    return cur as [number, string];
}
