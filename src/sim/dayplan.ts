// What the world's people do on a given day besides their routine template:
// · J5: the shifts of a job with a weekly schedule (days off spread across the team so a workplace is never empty,
//   a vacation now and then), and their rank.
// · E21: standing appointments of the world's own people (rituals): Reiko's Friday karaoke, the band's gigs.
// · E23: parts in festivals and city events (roles), and the one event or festival someone with free time goes to
//   when it says who comes (`audience`) and how many (`crowd`).
// · E29: couples between people going out together (secret couples keep away from the family).
// · E28: someone a street story brings to its place while it lasts (`bringTo`, for the stories module).
// It all comes from the day itself (nothing stored but a story's placement), worked out once per day for everyone and
// kept until anything it reads changes (who works where, a click, the rules). A job without a schedule, a world
// without rituals, roles or audiences: nothing here changes, the routine templates play as before.
import { nowAbs, changes, type Save, type Resident, adultOn } from '../core/store.js';
import { systemOn, isScenario, exampleTag, WEEKDAY_IDS, type WorldDef, type Occupation, type ExampleCharacter, type Ritual, type FestivalDef, type When } from '../core/world.js';
import { charOf } from '../st/bridge.js';
import { onDay } from './hooks.js';
import { isWeekend, seasonDays } from './time.js';
import { isOpen } from './daynight.js';
import { placeOn } from './places.js';
import { festivalsOn, inTown } from './festivals.js';
import { eventsOn } from './cityevents.js';
import { routineStep, homeMapOf } from './people.js';
import { whenHolds, personNamed } from './when.js';
import { couplePairs, casualPairs, statusOf, idOf, YOU } from './rel.js';
import { saveSeed } from './relations.js';
import { ties } from './living.js';
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
export { adultOn };
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
const homeIdOf = (r: Resident) => ((r as any).homeWith === '__you' ? 'home:player' : (r as any).homeWith ? `home:${(r as any).homeWith}` : `home:${r.avatar}`);

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

interface Plan { days: boolean[]; from: number; to: number; i: number; fixed: Set<number>; open: boolean[] }
// A ritual of someone at their own workplace during their shift hours is a day they work (Kyōko behind the bar on
// Reiko's Fridays); one elsewhere that their shift would cut short is a day off (Mio's Friday karaoke). Then the other
// days off: colleagues share their working days as much as they can (they get to know each other), on the usual week
// (from Monday on), and a place that opens every day (a shop, a restaurant, a bar, a hospital, not an office) has one
// of them on its other days, as far as each covering one extra day a week allows.
// A schedule's hours longer than a shift are when it can be worked: their shift is the part of it closest to their
// routine's work hours, at least the job's `shift` long.
// The days that keep a place open beyond the usual week are shared out, one each, and by turns week by week.
const plansKept = new WeakMap<Stamp, Map<string, Map<string, Plan>>>();
function teamPlans(g: Save, w: WorldDef, o: Occupation, st: Stamp, busy = new Set<string>(), week = 0): Map<string, Plan> {
    let byJob = plansKept.get(st); if (!byJob) plansKept.set(st, byJob = new Map());
    const key = `${o.id}|${week}`;
    const have = byJob.get(key); if (have) return have;
    const out = new Map<string, Plan>();
    const s = scheduleOf(o); if (!s) return out;
    if (busy.has(o.id)) return out;   // a loop through rituals on each other's days off: no fixed days this time
    busy.add(o.id);
    const team = st.list.filter(r => r.occupation === o.id).sort((a, b) => (a.avatar < b.avatar ? -1 : 1));
    const closed = (w.places.find(p => p.id === o.place) as any)?.closedDays as string[] | undefined;
    const work = new Map<string, boolean[]>(), must = new Map<string, Set<number>>(), offs = new Map<string, Set<number>>();
    const cover = Array(7).fill(0);
    team.forEach((r, i) => {
        const rits = ritualsFor(g, w, r.avatar, st).filter(x => weekly(x.rit)).map(x => ({ x, days: ritualWeekdays(g, w, x, st, busy, week) }));
        // their shift: the window that covers their rituals at work (Mio behind the counter at 5:00: the night shift),
        // then the one closest to their routine's work hours, then by turns
        const atWork = (win: [number, number]) => rits.reduce((n, { x }) => n + (x.rit.place === o.place ? Math.max(...[0, -24].map(dd => overlap(x.rit.from, x.rit.to, win[0] + dd, win[1] + dd))) : 0), 0);
        const hrs = new Set(r.routine.weekday.flatMap((x, k, all) => (x[1] === 'work' ? range(x[0], all[k + 1]?.[0] ?? 24) : [])));
        const fit = (win: [number, number]) => range(win[0], win[1]).filter(h => hrs.has(h % 24)).length;
        const turn = (k: number) => (((k - i) % s.windows.length) + s.windows.length) % s.windows.length;
        const order = s.windows.map((win, k) => ({ win, k, a: atWork(win), f: fit(win) })).sort((a, b) => b.a - a.a || b.f - a.f || turn(a.k) - turn(b.k));
        let [from, to] = order[0].win;
        if (!o.schedule?.shifts?.length) [from, to] = blockOf(from, to, o.shift, hrs);
        const m = new Set<number>(), off = new Set<number>();
        out.set(r.avatar, { days: [], from, to, i, fixed: off, open: [] });
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
    // fixed days first, for everyone, then the rest
    const usual = usualWeek(s), daily = opensDaily(w, o.place);
    const needed = (k: number) => daily ? !closed?.includes(WEEKDAY_IDS[k]) : usual.includes(k);
    for (const r of team) { const days = Array(7).fill(true); for (const k of offs.get(r.avatar)!) if (!must.get(r.avatar)!.has(k)) days[k] = false; work.set(r.avatar, days); days.forEach((on, k) => { if (on) cover[k]++; }); }
    const turns = [...team].sort((a, b) => H(`${a.avatar}|${o.id}|turn|${week}`) - H(`${b.avatar}|${o.id}|turn|${week}`));
    // (one extra day each at most: a small team keeps the place open most days and still shares most of its week;
    // the other staff are background)
    const duty = new Set<string>();
    if (!Array.isArray(s.days) && team.length > 1) [0, 1, 2, 3, 4, 5, 6].filter(k => needed(k) && !usual.includes(k)).forEach((k, j) => {
        for (let t = 0; t < turns.length; t++) { const r = turns[(j + t) % turns.length]; if (!duty.has(r.avatar) && work.get(r.avatar)![k]) { must.get(r.avatar)!.add(k); duty.add(r.avatar); return; } }
    });
    for (const r of turns) {
        const days = work.get(r.avatar)!, want = Array.isArray(s.days) ? -1 : Math.max(1, Math.min(7, Math.round(s.days)));
        if (want < 0) { const list = s.days as string[]; for (let k = 0; k < 7; k++) { const on = list.includes(WEEKDAY_IDS[k]) && !offs.get(r.avatar)!.has(k) || must.get(r.avatar)!.has(k); if (days[k] && !on) cover[k]--; days[k] = on; } }
        else {
            while (days.filter(Boolean).length > want) {
                const cand = [0, 1, 2, 3, 4, 5, 6].filter(k => days[k] && !must.get(r.avatar)!.has(k));
                if (!cand.length) break;
                // off the usual week first (its extra days are covered by turns, above); not the last one there on a day of
                // it; where colleagues are off too
                const rank = (k: number) => [usual.includes(k) ? 1 : 0, usual.includes(k) && cover[k] <= 1 ? 1 : 0, cover[k], H(`${r.avatar}|${o.id}|off|${k}`)];
                cand.sort((a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
                days[cand[0]] = false; cover[cand[0]]--;
            }
        }
        out.get(r.avatar)!.days = days;
        out.get(r.avatar)!.open = [0, 1, 2, 3, 4, 5, 6].map(needed);
    }
    busy.delete(o.id);
    byJob.set(key, out);
    return out;
}
// The job's usual working weekdays (0 Monday): its own, an office week for a full-time job, or days spread over the
// week from Monday (four days: Monday, Tuesday, Thursday, Saturday), the same for every job, so people who work at the
// same place share their days, and colleagues are never more than two days apart (romance between people fades after
// two days without seeing each other, sim/fading.ts). The days a place that opens daily needs beyond it are shared out
// (above).
function usualWeek(s: Week): number[] {
    if (Array.isArray(s.days)) return s.days.map(d => WEEKDAY_IDS.indexOf(d as any)).filter(k => k >= 0);
    const n = Math.max(1, Math.min(7, Math.round(s.days)));
    return n >= 5 ? [0, 1, 2, 3, 4, 5, 6].slice(0, n) : [...new Set(Array.from({ length: n }, (_, k) => Math.floor((k * 7) / n)))];
}
// A place open every day it isn't closed: anything but an office or a school (only work or study among its tags).
const opensDaily = (w: WorldDef, id: string) => { const t = w.places.find(p => p.id === id)?.tags ?? []; return !t.length || t.some(x => x !== 'work' && x !== 'study'); };
// The part of [from, to) someone works: their routine's work hours inside it, at least `shift` long (as early as fits).
function blockOf(from: number, to: number, shift: number | undefined, hrs: Set<number>): [number, number] {
    const span = to - from, inside = range(from, to).filter(h => hrs.has(h % 24)).length;
    const len = Math.min(span, Math.max(shift ?? span, inside || (shift ?? span)));
    if (len >= span) return [from, to];
    let best = from, most = -1;
    for (let a = from; a + len <= to; a++) { const n = range(a, a + len).filter(h => hrs.has(h % 24)).length; if (n > most) { most = n; best = a; } }
    return [best, best + len];
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
    const plans = teamPlans(g, w, o, st, undefined, Math.floor((day - 1) / 7)), p = plans.get(r.avatar), wd = wdOf(day);
    if (!p || onVacation(g, w, r, day, st)) return null;
    if (!p.days[wd]) {
        // someone covers for a colleague on vacation: on a day the place is open, when the ones who'd work it are all
        // away, the first one free (and not off for a ritual) does
        if (plans.size < 2 || !p.open[wd]) return null;
        const away = (a: string) => onVacation(g, w, g.cast[a], day, st);
        if (![...plans].some(([a, q]) => q.days[wd] && away(a)) || [...plans].some(([a, q]) => q.days[wd] && !away(a))) return null;
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
onDay.push((g, w) => { if (systemOn(w, 'jobs')) seedRanks(g, w); dropStories(g); return []; });
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
function ritualWeekdays(g: Save, w: WorldDef, x: RitualRef, st: Stamp, busy?: Set<string>, week = 0): number[] {
    if (x.rit.days?.length) return x.rit.days.map(d => WEEKDAY_IDS.indexOf(d)).filter(k => k >= 0);
    const r = g.cast[x.owner], o = r && jobOf(g, w, r);
    if (!r || !o || !scheduleOf(o)) return [5, 6];
    const p = teamPlans(g, w, o, st, busy, week).get(x.owner);
    return p ? [0, 1, 2, 3, 4, 5, 6].filter(k => !p.days[k]) : [5, 6];
}
const daySeason = (g: Save, day: number) => ((Math.max(1, day) - 1) % seasonDays(g)) + 1;
/** When a ritual happens on that day: its hours (absolute minutes) and its place; null when it doesn't. (Its own `when`
 *  is asked when someone asks where they are: it can read things that change during the day.) */
export function ritualOn(g: Save, w: WorldDef, x: RitualRef, day: number, st = stampOf(g, w)): Shift | null {
    const rit = x.rit, wd = wdOf(day), week = Math.floor((day - 1) / 7);
    const days = ritualWeekdays(g, w, x, st, undefined, week);
    if (rit.festival && !festivalsOn(g, w, day).some(f => f.id === rit.festival)) return null;
    if (rit.event && !eventsOn(g, w, day).some(e => e.ev.id === rit.event && !e.off)) return null;
    if (!rit.festival && !rit.event && !days.includes(wd)) return null;
    if ((rit.festival || rit.event) && rit.days?.length && !days.includes(wd)) return null;
    const every = rit.every;
    if (typeof every === 'number' && every > 1 && week % every !== (((rit.week ?? 0) % every) + every) % every) return null;
    if (every === 'month') {
        const ds = daySeason(g, day), weeks = Math.ceil(seasonDays(g) / 7), want = (rit.week ?? 1) < 0 ? weeks + 1 + (rit.week ?? 1) : rit.week ?? 1;
        const weekOf = (s: number) => Math.floor((s - 1) / 7) + 1;
        if (weekOf(ds) !== want) return null;
        // once that week: on the first of its days when the owner isn't working (moved, not skipped, when it can be)
        const free = (d: number) => { const sh = shiftOn(g, w, g.cast[x.owner], d, st); return !sh || sh.place === rit.place || overlap(sh.from, sh.to, d * 1440 + rit.from * 60, d * 1440 + rit.to * 60) === 0; };
        const all: number[] = [];
        for (let s = (want - 1) * 7 + 1; s <= Math.min(want * 7, seasonDays(g)); s++) if (sameDay(g, w, x, day - ds + s, days)) all.push(day - ds + s);
        const pickDay = all.find(free) ?? all[0];
        if (pickDay !== day) return null;
    }
    if (every === 'year' && !rit.festival && !rit.event && !rit.when) return null;
    if (rit.chance !== undefined && rit.chance < 1 && H(`${g.world}|${day}|ritual|${x.owner}|${x.i}`) >= rit.chance) return null;
    const list = [rit.place, ...(rit.places ?? [])];
    const pick = list[Math.floor(H(`${g.world}|${week}|ritplace|${x.owner}|${x.i}`) * list.length)];
    const place = pick === 'home' ? homeIdOf(g.cast[x.owner]) : pick;
    if (!placeOk(g, w, place) || (!place.startsWith('home:') && !isOpen(w, place, (Math.round(rit.from * 60) % 1440)))) return null;
    return { from: day * 1440 + Math.round(rit.from * 60), to: day * 1440 + Math.round(rit.to * 60), place };
}
const sameDay = (g: Save, w: WorldDef, x: RitualRef, d: number, days: number[]) => (x.rit.festival ? festivalsOn(g, w, d).some(f => f.id === x.rit.festival) : x.rit.event ? eventsOn(g, w, d).some(e => e.ev.id === x.rit.event && !e.off) : days.includes(wdOf(d)));

/* ---------- the day's plan for everyone ---------- */

export type SlotKind = 'role' | 'ritual' | 'date' | 'outing';
/** Something that takes someone somewhere for a while: [from, to) in absolute minutes, the place, what kind, what they
 *  do (for the AI), and who else is part of it. */
export interface Slot { from: number; to: number; place: string; kind: SlotKind; why: string; with: string[]; secret?: boolean; partner?: string; when?: When; key?: string }
// The plans are kept until the stamp changes, a click, or a couple forms, moves on or ends (that happens during the day
// without a click: looked at once a game minute, like the stamp).
interface Day { st: Stamp; n: number; at: number; pairs: string; days: Map<number, Map<string, Slot[]>> }
const dayKept = new WeakMap<Save, Day>();
const pairsOf = (g: Save) => { const all = (g as any).rel?.pairs; let s = ''; if (all) for (const k in all) { const p = all[k]; if (p.status) s += `${k}:${p.status}:${p.since};`; } return s; };
function plansOf(g: Save, w: WorldDef, st: Stamp): Day {
    const n = changes(), at = nowAbs(g);
    let k = dayKept.get(g);
    if (k && k.st === st && k.n === n && k.at === at) return k;
    const pairs = ruleOn(w, 'relations') && ruleOn(w, 'romance') ? pairsOf(g) : '';
    if (!k || k.st !== st || k.n !== n || k.pairs !== pairs) dayKept.set(g, k = { st, n, at, pairs, days: new Map() });
    else k.at = at;
    return k;
}
function dayPlan(g: Save, w: WorldDef, day: number, st: Stamp, k = plansOf(g, w, st)): Map<string, Slot[]> {
    let m = k.days.get(day);
    if (!m) {
        if (k.days.size > 8) k.days.clear();
        k.days.set(day, m = new Map());   // (set before it's filled: asking about a day while planning it finds it empty)
        fill(g, w, day, st, m);
    }
    return m;
}
/** What takes them somewhere at that moment (a role, a ritual, a date, an outing), if anything. Breaks, plans with you
 *  and company come first (people.ts); a work shift is never overridden except by a role. */
export function slotAt(g: Save, w: WorldDef, r: Resident, at: number, st = stampOf(g, w)): Slot | null {
    if (isScenario(w)) return null;
    const d = Math.floor(at / 1440), k = plansOf(g, w, st);
    for (const day of [d, d - 1]) {
        for (const s of dayPlan(g, w, day, st, k).get(r.avatar) ?? []) {
            if (s.from > at || at >= s.to) continue;
            if (s.kind === 'date' && s.partner && !together(g, r.avatar, s.partner)) continue;   // they broke up in this minute
            if (s.when && !whenHolds(g, w, s.when, { at: s.from, place: s.place, key: s.key, day: true })) continue;
            return s;
        }
    }
    return null;
}

const together = (g: Save, a: string, b: string) => { const s = statusOf(g, a, b); return s === 'dating' || s === 'engaged' || s === 'married' || s === 'casual'; };

function fill(g: Save, w: WorldDef, day: number, st: Stamp, m: Map<string, Slot[]>) {
    const add = (a: string, s: Slot) => { const l = m.get(a); if (l) l.push(s); else m.set(a, [s]); };
    const busy = (a: string, from: number, to: number) => (m.get(a) ?? []).some(s => s.from < to && from < s.to);
    const r = (a: string) => g.cast[a];
    const workClash = (a: string, from: number, to: number, place: string) => {
        for (const d of [day - 1, day, day + 1]) { const s = shiftOn(g, w, r(a), d, st); if (s && s.from < to && from < s.to) return s.place === place ? 'here' : s; }
        return null;
    };
    // roles in festivals and events (E23) first: they win over everything, a shift included
    for (const x of rolesOn(g, w, day)) if (!busy(x.avatar, x.from, x.to)) add(x.avatar, { from: x.from, to: x.to, place: x.place, kind: 'role', why: x.text, with: [] });
    // rituals (E21): not over a shift (a small overlap moves it; a big one skips it that week); without its owner it
    // doesn't happen
    const seen = new Set<RitualRef>();
    for (const list of ritualIndex(g, w, st).values()) for (const x of list) {
        if (seen.has(x)) continue; seen.add(x);
        const t = ritualOn(g, w, x, day, st); if (!t) continue;
        const go: [string, number, number][] = [];
        let owner = false;
        for (const a of x.who) {
            let from = t.from, to = t.to;
            // once a year (New Year's Eve at the bell) they take the night off, as for a role
            const c = x.rit.every === 'year' ? null : workClash(a, from, to, t.place);
            if (c === 'here') { owner ||= a === x.owner; continue; }   // at work there anyway (Kyōko behind her bar)
            if (c) { if (c.to > from && c.to < to) from = c.to; else if (c.from < to && c.from > from) to = c.from; else from = to; }
            if (to - from < Math.min(90, 0.6 * (t.to - t.from)) || busy(a, from, to)) { if (a === x.owner) { owner = false; break; } continue; }
            owner ||= a === x.owner;
            go.push([a, from, to]);
        }
        if (!owner) continue;
        for (const [a, from, to] of go) add(a, { from, to, place: t.place, kind: 'ritual', why: x.rit.text, with: x.who.filter(b => b !== a), ...(x.rit.when ? { when: x.rit.when, key: `ritual|${x.owner}|${x.i}` } : {}) });
    }
    // couples going out (E29)
    if (systemOn(w, 'relations') && systemOn(w, 'romance')) for (const d of datesOn(g, w, day, st, busy, workClash)) for (const [a, b] of [[d.a, d.b], [d.b, d.a]])
        add(a, { from: d.from, to: d.to, place: d.place, kind: 'date', why: d.casual ? 'spending the evening with' : 'out on a date with', with: [b], partner: b, secret: d.secret });
    // the one event or festival someone with free time goes to, when it says who comes (E23)
    for (const p of st.list) { const o = outingOn(g, w, p, day, st, busy); if (o) add(p.avatar, o); }
}

/* ---------- roles (E23) ---------- */

function rolesOn(g: Save, w: WorldDef, day: number): { avatar: string; from: number; to: number; place: string; text: string }[] {
    const out: { avatar: string; from: number; to: number; place: string; text: string }[] = [];
    const at = (h: number) => day * 1440 + Math.round(h * 60);
    for (const f of festivalsOn(g, w, day)) for (const x of f.roles ?? []) {
        const r = personNamed(g, x.who), place = x.place ?? f.place;
        if (r && place && placeOk(g, w, place)) out.push({ avatar: r.avatar, from: at(x.from ?? 12), to: at(x.to ?? 22), place, text: x.text });
    }
    for (const e of eventsOn(g, w, day)) if (!e.off) for (const x of e.ev.roles ?? []) {
        const r = personNamed(g, x.who), place = x.place ?? e.ev.place;
        if (r && placeOk(g, w, place)) out.push({ avatar: r.avatar, from: x.from !== undefined ? at(x.from) : e.from, to: x.to !== undefined ? at(x.to) : e.to, place, text: x.text });
    }
    return out;
}

/* ---------- couples going out (E29) ---------- */

/** A couple kept secret (the world's starting feelings say so): their dates keep away from their family. */
export function secretCouple(g: Save, w: WorldDef, a: string, b: string): boolean {
    const A = g.cast[a], B = g.cast[b]; if (!A || !B) return false;
    const say = (x: Resident, y: Resident) => (exampleOf(w, x)?.feelings ?? []).some(f => (f as any).secret && personNamed(g, f.to)?.avatar === y.avatar);
    return say(A, B) || say(B, A);
}
const DATE_ODDS: Record<string, number> = { dating: 0.3, engaged: 0.25, married: 0.15, casual: 0.2 };
// About two evenings a week for a dating couple (fewer once married), at a place both like, when both are free; a
// couple formed today waits for tomorrow.
function datesOn(g: Save, w: WorldDef, day: number, st: Stamp, busy: (a: string, f: number, t: number) => boolean, clash: (a: string, f: number, t: number, p: string) => unknown) {
    const out: { a: string; b: string; from: number; to: number; place: string; casual: boolean; secret: boolean }[] = [];
    const seed = saveSeed(g, w);
    const pairs = [...couplePairs(g).map(p => ({ ...p, casual: false })), ...casualPairs(g).map(p => ({ ...p, status: 'casual', casual: true }))];
    const fest = festivalsOn(g, w, day).some(f => f.custom?.kind === 'couples' || (!f.place && (f.audience?.length || f.crowd !== undefined)));
    for (const p of pairs) {
        if (p.since >= day || idOf(g, p.a) === YOU || idOf(g, p.b) === YOU) continue;
        if (H(`${g.world}|${seed}|${day}|date|${p.a}|${p.b}`) >= (DATE_ODDS[p.status] ?? 0.2) * (fest ? 2 : 1)) continue;
        const A = g.cast[p.a], B = g.cast[p.b];
        const off = dayOff(g, w, A, day, st) && dayOff(g, w, B, day, st);
        const wins: [number, number][] = off ? [[14, 18], [19, 22]] : [[19, 22], [20, 23]];
        const secret = secretCouple(g, w, p.a, p.b);
        for (const [h1, h2] of wins) {
            const from = day * 1440 + h1 * 60, to = day * 1440 + h2 * 60;
            if ([p.a, p.b].some(a => busy(a, from, to) || clash(a, from, to, ''))) continue;
            const place = datePlace(g, w, A, B, day, h1, secret, st);
            if (place) { out.push({ a: p.a, b: p.b, from, to, place, casual: p.casual, secret }); break; }
        }
    }
    return out;
}
function datePlace(g: Save, w: WorldDef, A: Resident, B: Resident, day: number, h: number, secret: boolean, st: Stamp): string {
    const ok = (id: string) => w.places.some(p => p.id === id && !p.link) && placeOk(g, w, id) && isOpen(w, id, h * 60);
    let list = A.leisure.filter(id => B.leisure.includes(id) && ok(id));
    if (!list.length) list = [...new Set([...A.leisure, ...B.leisure])].filter(ok);
    if (secret) {
        // keep away from where their family is then, and from their family's workplaces
        const fam = ties(g).filter(t => [A.avatar, B.avatar].includes(t.a) || [A.avatar, B.avatar].includes(t.b)).flatMap(t => [t.a, t.b]).filter(a => a !== A.avatar && a !== B.avatar && g.cast[a]);
        const away = new Set(fam.flatMap(a => [routineStepPlace(g, w, g.cast[a], day * 1440 + h * 60, st), jobOf(g, w, g.cast[a])?.place ?? '']));
        list = list.filter(id => !away.has(id));
    }
    return list.length ? list[Math.floor(H(`${g.world}|${day}|dateplace|${A.avatar}|${B.avatar}`) * list.length)] : '';
}
// Roughly where someone will be (their shift or the kind of step their routine has): enough to stay out of their way.
function routineStepPlace(g: Save, w: WorldDef, r: Resident, at: number, st: Stamp): string {
    const s = shiftAt(g, w, r, at, st); if (s) return s.place;
    const t = routineStep(r, at)[1];
    return t === 'home' ? homeIdOf(r) : t === 'work' ? jobOf(g, w, r)?.place ?? '' : t;
}

/* ---------- going to an event or a festival (E23) ---------- */

// Who an event or festival draws: each word of its audience that fits the person weighs their chance (× its crowd in
// 100); none fits, they don't go (unless it's for everyone).
function weightFor(g: Save, w: WorldDef, r: Resident, audience: string[], place: string, roleHolders: string[]): number {
    let best = 0;
    const map = w.places.find(p => p.id === place)?.map;
    const studies = () => [...r.routine.weekday, ...r.routine.weekend].some(s => w.places.find(p => p.id === s[1])?.tags?.includes('study')) || r.leisure.some(id => w.places.find(p => p.id === id)?.tags?.includes('study'));
    for (const a0 of audience) {
        const a = a0.toLowerCase().trim();
        const v = a === 'everyone' ? 1
            : a === 'neighbors' ? (homeMapOf(g, w, r) === map ? 2 : 0)
            : a === 'fans' ? (r.leisure.includes(place) ? 5 : 0)
            : a === 'colleagues' ? (jobOf(g, w, r)?.place === place ? 5 : jobOf(g, w, r) ? 1.5 : 0)
            : a === 'couples' ? (couplePairs(g).some(p => p.a === r.avatar || p.b === r.avatar) || casualPairs(g).some(p => p.a === r.avatar || p.b === r.avatar) ? 2.5 : 0)
            : a === 'friends' ? (roleHolders.some(b => b !== r.avatar && close(g, w, r, b)) ? 3 : 0)
            : a === 'students' ? (studies() ? 3 : 0)
            : a.startsWith('job:') ? (r.occupation === a.slice(4) ? 5 : 0)
            : a.startsWith('hobby:') ? (r.leisure.includes(place) ? 3 : 0)
            : 0;
        best = Math.max(best, v);
    }
    return best;
}
// Close to someone taking part, in ways that don't change during the day: family, a home or a workplace shared, or
// friends from the world's own starting feelings.
function close(g: Save, w: WorldDef, r: Resident, b: string): boolean {
    const o = g.cast[b]; if (!o) return false;
    if (ties(g).some(t => (t.a === r.avatar && t.b === b) || (t.b === r.avatar && t.a === b))) return true;
    if (homeIdOf(r) === homeIdOf(o) || (!!r.occupation && r.occupation === o.occupation)) return true;
    const good = ['friend', 'good', 'best'];
    const says = (x: Resident, y: Resident) => (exampleOf(w, x)?.feelings ?? []).some(f => personNamed(g, f.to)?.avatar === y.avatar && (good.includes(f.f ?? '') || good.includes(f.back ?? '')));
    return says(r, o) || says(o, r);
}
const opted = (x: { audience?: string[]; crowd?: number }) => !!x.audience?.length;
/** Does this festival say who comes (`audience`, or a `crowd` of its own)? Then people go to it one by one, for a few
 *  hours (here); otherwise everyone free gathers there as before (festivalSpot). */
export const festivalOpted = (f: FestivalDef) => !!f.audience?.length || f.crowd !== undefined;
function outingOn(g: Save, w: WorldDef, r: Resident, day: number, st: Stamp, busy: (a: string, f: number, t: number) => boolean): Slot | null {
    if (!systemOn(w, 'living') && !systemOn(w, 'events') && !systemOn(w, 'festivals')) return null;
    if (idOf(g, r.avatar) === YOU) return null;
    const at = (h: number) => day * 1440 + Math.round(h * 60);
    const cands: { key: string; place: string; from: number; to: number; crowd: number; audience: string[]; name: string; roles: string[] }[] = [];
    for (const e of eventsOn(g, w, day)) if (!e.off && opted(e.ev)) cands.push({ key: e.key, place: e.ev.place, from: e.from, to: e.to, crowd: e.ev.crowd ?? 10, audience: e.ev.audience!, name: e.ev.name, roles: (e.ev.roles ?? []).map(x => personNamed(g, x.who)?.avatar ?? '') });
    const home = homeMapOf(g, w, r);
    for (const f of festivalsOn(g, w, day)) {
        if (!festivalOpted(f) || !f.place || !inTown(g, w, f, home)) continue;
        const places = [f.place, ...(f.places ?? [])].filter(id => placeOk(g, w, id));
        if (!places.length) continue;
        const place = places[Math.floor(H(`${g.world}|${day}|fplace|${r.avatar}|${f.id}`) * places.length)];
        cands.push({ key: `${f.id}@${day}`, place, from: at(12), to: at(22), crowd: f.crowd ?? 15, audience: f.audience?.length ? f.audience : ['everyone'], name: f.name, roles: (f.roles ?? []).map(x => personNamed(g, x.who)?.avatar ?? '') });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => H(`${g.world}|${r.avatar}|${a.key}|order`) - H(`${g.world}|${r.avatar}|${b.key}|order`));
    for (const c of cands) {
        if (!placeOk(g, w, c.place)) continue;
        const p = Math.min(0.9, (c.crowd / 100) * weightFor(g, w, r, c.audience, c.place, c.roles));
        if (!p || H(`${g.world}|${r.avatar}|${c.key}|go`) >= p) continue;
        const dur = Math.min(c.to - c.from, H(`${g.world}|${r.avatar}|${c.key}|long`) < 0.5 ? 120 : 180);
        const steps = Math.floor((c.to - c.from - dur) / 30);
        const from = c.from + 30 * Math.floor(H(`${g.world}|${r.avatar}|${c.key}|when`) * (steps + 1)), to = from + dur;
        if (busy(r.avatar, from, to) || !freeAt(g, w, r, from, st) || !freeAt(g, w, r, to - 1, st)) continue;
        return { from, to, place: c.place, kind: 'outing', why: `came for the ${c.name}`, with: [] };
    }
    return null;
}
// Free at that moment: no shift, and their routine has free time (leisure) then.
function freeAt(g: Save, w: WorldDef, r: Resident, at: number, st: Stamp): boolean {
    if (shiftAt(g, w, r, at, st)) return false;
    const t = dayStep(g, w, r, at, st)[1];
    return t === 'leisure' || (t === 'work' && scheduled(g, w, r));
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

/* ---------- placed by a story (E28) ---------- */

/** A street story brings someone to its place until `until` (absolute minutes), with what they're doing for the AI. */
export function bringTo(g: Save, avatar: string, place: string, until: number, why: string) { ((g as any).brought ??= {})[avatar] = { place, until, why }; }
/** Where a story has placed them right now, if anywhere. */
export function broughtNow(g: Save, avatar: string): { place: string; until: number; why: string } | null {
    const b = (g as any).brought?.[avatar];
    return b && nowAbs(g) < b.until ? b : null;
}
function dropStories(g: Save) { const b = (g as any).brought; if (b) for (const a of Object.keys(b)) if (nowAbs(g) >= b[a].until) delete b[a]; }
