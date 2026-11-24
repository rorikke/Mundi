// The adult industry's save and the few things everything in it shares (plans/adult-industry.md): `g.industry` read
// with defaults (`peekIndustry` never writes, `industryOf` fills them in on first write), whether the industry plays
// in this game (the world's `industry` block, the `industry` system and adult content on), the seats you hold now
// (performing, directing, a label of your own), the law's month and four months scaled to the season's length, fame
// as the seats keep it (sim/fame.ts writes it), and the line the AI is told. Titles and offers are sim/titles.ts's,
// bookings sim/bookings.ts's; with the industry off nothing here reads or writes the save.
import { adultOn } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { seasonDays } from './time.js';
import { myJob, jobDef, bookedJob, careerOf, rankOf, trackOf } from './work.js';
// (a record another part of the industry began, sim/fame.ts or sim/stance.ts writing only their own keys, is read with
// the rest defaulted, never written: industryOf fills it in for good on the first write)
export const peekIndustry = (g) => { const s = g.industry; return (!s ? EMPTY : s.seats && s.offers && s.titles && s.totals && s.chart && s.trend ? s : { ...EMPTY, ...s }); };
const EMPTY = Object.freeze({ seats: {}, offers: [], titles: [], totals: { titles: 0, sales: 0 }, chart: { week: -1, rows: [] }, trend: { month: -1, hot: [], cold: '' }, test: -9999, roster: {}, week: {}, nextId: 1, limits: [], standing: {}, yes: {} });
export function industryOf(g) {
    const s = (g.industry ??= {});
    s.seats ??= {};
    s.offers ??= [];
    s.titles ??= [];
    s.totals ??= { titles: 0, sales: 0 };
    s.chart ??= { week: -1, rows: [] };
    s.trend ??= { month: -1, hot: [], cold: '' };
    s.test ??= g.day;
    s.roster ??= {};
    s.week ??= {};
    s.nextId ??= 1;
    s.limits ??= [];
    s.standing ??= {};
    s.yes ??= {};
    return s;
}
/* ---------- "Play as" ---------- */
// The world's part of the record stays with the save: the chart, the month's trend, the Monday's sales and pay, the ids
// (never given twice), and the label's (a venture, shared like the money): its commissioned titles, its fame and its
// folded count. The rest is the person's: seats, contract, offers, titles, fame, fans, stances, limits, the test.
const WORLD_KEYS = ['chart', 'trend', 'week', 'nextId'];
const labelOnly = (t) => !(t.you ?? []).some(s => s !== 'label');
const titleNo = (t) => Number(String(t.id).replace(/^\D+/, '')) || 0;
/** (sim/playas.ts) Switching who you play: puts `theirs` (the person you take over's own part, null for someone who
 *  never worked in it) in `g.industry` with the world's part kept, and returns the one you leave's own part (null when
 *  the save has no record). */
export function swapIndustry(g, theirs) {
    const s = g.industry;
    let mine = null;
    if (s) {
        mine = { ...s };
        for (const k of WORLD_KEYS)
            delete mine[k];
        if (s.titles)
            mine.titles = s.titles.filter(t => !labelOnly(t));
        if (s.fame) {
            mine.fame = { ...s.fame };
            delete mine.fame.label;
        }
        if (s.totals) {
            mine.totals = { ...s.totals };
            delete mine.totals.label;
        }
        if (s.out?.rel) {
            mine.out = { ...s.out, rel: { ...s.out.rel } };
            delete mine.out.rel.label;
        }
    }
    const next = { ...(theirs ?? {}) };
    if (s) {
        for (const k of WORLD_KEYS)
            if (s[k] !== undefined)
                next[k] = s[k];
        const shared = (s.titles ?? []).filter(labelOnly);
        if (shared.length || next.titles)
            next.titles = [...(next.titles ?? []), ...shared].sort((a, b) => titleNo(a) - titleNo(b));
        if (s.fame?.label !== undefined)
            next.fame = { ...(next.fame ?? {}), label: s.fame.label };
        if (s.totals?.label !== undefined)
            next.totals = { titles: 0, sales: 0, ...(next.totals ?? {}), label: s.totals.label };
        if (s.out?.rel?.label !== undefined)
            next.out = { ...(next.out ?? {}), rel: { ...(next.out?.rel ?? {}), label: s.out.rel.label } };
        next.nextId = Math.max(Number(s.nextId) || 1, Number(theirs?.nextId) || 1);
    }
    if (Object.keys(next).length)
        g.industry = next;
    else
        delete g.industry;
    return mine;
}
/* ---------- is it on ---------- */
/** The industry plays in this game: the world has it, the system and adult content are on. */
export const industryOn = (g, w) => !!w.industry && systemOn(w, 'industry') && adultOn(g);
/** The industry's job (`w.industry.job`), as written. */
export const industryJob = (w) => (w.industry ? jobDef(w, w.industry.job) : null);
/** You work in the industry now: you hold its job, booked (no shifts). */
export const inIndustry = (g, w) => industryOn(g, w) && g.player.job?.id === w.industry.job && bookedJob(g, w, myJob(g, w));
/* ---------- the world's data ---------- */
export const genresOf = (w) => w.industry?.genres ?? [];
export const labelsOf = (w) => w.industry?.labels ?? [];
export const setsOf = (w) => w.industry?.sets ?? [];
export const rosterOf = (w) => w.industry?.roster ?? [];
export const genreOf = (w, id) => genresOf(w).find(x => x.id === id);
// (a label of your own is a venture, not one of the world's labels: named by its venture)
export const labelOf = (w, id) => labelsOf(w).find(x => x.id === id)
    ?? (() => { const v = (w.ventures ?? []).find(x => x.id === id && (x.track === 'label' || x.kind === 'label')); return v ? { id: v.id, name: v.name } : undefined; })();
export const setOf = (w, id) => setsOf(w).find(x => x.id === id);
export const rosterPerson = (w, id) => rosterOf(w).find(x => x.id === id);
/** The director's label (the first offer, brief or the lens's offer is always its): the first label naming a director,
 *  else the first. */
export const homeLabel = (w) => labelsOf(w).find(l => l.director) ?? labelsOf(w)[0];
/* ---------- the law's time, scaled to the season ---------- */
// (at the default 14-day season: a month 5 days, the wait 5, the release 20, a title selling 2 weeks)
const scale = (g, n) => Math.max(1, Math.round((n * seasonDays(g)) / 14));
/** A month: a third of a season. */
export const monthDays = (g) => Math.max(1, Math.round(seasonDays(g) / 3));
/** The law's month between a contract and its shoot. */
export const waitDays = (g) => scale(g, 5);
/** The law's four months between a shoot and its release. */
export const releaseDays = (g) => scale(g, 20);
/** Which month a day is in (0 first). */
export const monthOf = (g, day = g.day) => Math.floor((Math.max(1, day) - 1) / monthDays(g));
/** Which season a day is in (0 first, counted on). */
export const seasonIndex = (g, day = g.day) => Math.floor((Math.max(1, day) - 1) / seasonDays(g));
export const isMonday = (day) => (day - 1) % 7 === 0;
/* ---------- seats ---------- */
/** The paths that are directing (behind the camera; an entry's path, the lens's), and the actress's star-producer. */
export const DIRECT_PATH = 'director', STAR_PATH = 'starproducer';
/** You're on this path of your job from its first rank on (chosen at the branch, you're still at the rank before). */
export function onPath(g, w, path) {
    const j = g.player.job, o = myJob(g, w);
    if (!j?.path?.includes(path) || !o)
        return false;
    const opt = (o.branches ?? []).flatMap(b => b.options ?? []).find(x => x.id === path);
    if (!opt)
        return false;
    const first = careerOf(g, o).ranks.findIndex(r => opt.ranks.includes(r) || opt.ranks.some(x => x.name === r.name && x.pay === r.pay));
    return first >= 0 && j.rank >= first;
}
/** The paths of the job that are directing: Behind the camera, and any entry's (the lens). */
export const directPaths = (w) => { const o = industryJob(w); const p = new Set([DIRECT_PATH]); for (const t of [o, ...Object.values(o?.tracks ?? {})])
    for (const e of t?.entries ?? [])
        p.add(e.path); return p; };
/** Directing now (on a directing path from its first rank). */
export const directing = (g, w) => inIndustry(g, w) && [...directPaths(w)].some(p => onPath(g, w, p));
/** A venture of kind `label` is yours and open (read as sim/ventures.ts keeps it; not imported, so the order modules
 *  load in stays as it was). */
export const ownsLabel = (g, w) => (g.ventures?.list ?? []).some((v) => v && !v.closed && (w.ventures ?? []).some(d => d.id === v.id && (d.kind ?? d.track) === 'label'));
/** The seats you hold now: performing (the job, not directing), directing, a label of your own (a venture of kind `label`). */
export function seatsNow(g, w) {
    if (!industryOn(g, w))
        return [];
    const out = [];
    if (inIndustry(g, w))
        out.push(directing(g, w) ? 'direct' : 'perform');
    if (ownsLabel(g, w))
        out.push('label');
    return out;
}
/** Fame in a seat, 0–100 (sim/fame.ts keeps it in `g.industry.fame`). */
export const fameOf = (g, seat) => Math.max(0, Math.min(100, peekIndustry(g).fame?.[seat] ?? 0));
/** Your job's track's rank, as words ("Rookie, AV actress"). */
export function rankWords(g, w) {
    const o = myJob(g, w);
    return o ? `${rankOf(g, o).name} (${trackOf(g, o).title ?? o.name})` : '';
}
/* ---------- what the AI is told ---------- */
/** (sim/titles.ts) The day's shoot and the latest titles, in words. */
export const titleWords = [];
/** For the AI (the `you` block): your seats and ranks, fame, today's shoot and latest title, the label. (The stances of
 *  the people present are sim/stance.ts's own scene lines.) Nothing with adult content off, the system off or a world
 *  without the industry. */
export function industryLine(g, w, _present = []) {
    if (!industryOn(g, w))
        return '';
    const parts = [];
    const seats = seatsNow(g, w);
    if (seats.includes('perform') || seats.includes('direct')) {
        const st = peekIndustry(g), seat = seats.includes('direct') ? 'direct' : 'perform', n = st.seats[seat]?.titles ?? 0;
        const fame = fameOf(g, seat), c = st.seats.perform?.contract;
        parts.push(`{{user}} works in adult video, ${seat === 'direct' ? 'directing' : 'performing'}: ${rankWords(g, w)}, ${n === 1 ? 'one title' : `${n} titles`} so far${c && seat === 'perform' ? `, exclusive to ${labelOf(w, c.label)?.name ?? c.label}` : ''}${fame >= 60 ? '; well known, recognized often in Akihabara and Kabukichō' : fame >= 25 ? '; recognized now and then' : ''}.`);
    }
    if (seats.includes('label'))
        parts.push('{{user}} runs an adult video label of their own.');
    for (const f of titleWords)
        parts.push(...f(g, w));
    return parts.filter(Boolean).join(' ');
}
