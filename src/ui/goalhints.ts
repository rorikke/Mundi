// How to do a goal's objective, for the Goals app: a line or two under an objective not done yet, worked out from the
// world (where a keepsake comes from and how often, where and when an action is on, when a festival or city event is
// next, what trains a skill, where to ask for a job, how a place becomes yours as a regular). Only reads the world and
// the save; an objective that says enough by itself ("A good friend", "Money saved") gets nothing.
import { adultOk, type Save } from '../core/store.js';
import type { WorldDef, ActionDef } from '../core/world.js';
import type { Objective } from '../sim/goals.js';
import { offeredGoals } from '../sim/goals.js';
import { countedOf } from '../sim/when.js';
import { outcomesOf } from '../sim/actions.js';
import { placesFor, whenWords } from '../sim/practice.js';
import { upcoming } from '../sim/festivals.js';
import { comingEvents } from '../sim/cityevents.js';
import { visitsTo } from '../sim/daylife.js';
import { REGULAR_VISITS, isRegular, beenTo } from '../sim/tally.js';
import { skillName, trainedBy } from '../sim/hobbies.js';
import { offScreen } from '../sim/work.js';
import { trackOf } from '../sim/tracks.js';
import { courseOf } from '../sim/courses.js';
import { SEASONS, seasonDays, WEEKDAYS } from '../sim/time.js';

const MAX_LINES = 4;
const placeName = (w: WorldDef, id: string) => w.places.find(p => p.id === id)?.name ?? id;
const mapName = (w: WorldDef, place: string) => {
    if (w.maps.length < 2) return '';
    const m = w.maps.find(x => x.id === w.places.find(p => p.id === place)?.map);
    return m?.name ?? '';
};
// A place by name, with its map when the world has several ("Jinbōchō book town (Akihabara & Kanda)").
const placeAt = (w: WorldDef, id: string) => { const m = mapName(w, id); return `${placeName(w, id)}${m ? ` (${m})` : ''}`; };
const or = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0] ?? '');
const actionOf = (w: WorldDef, id: string) => w.actions.find(a => a.id === id);
// Where an action is done, in words: "Jinbōchō (Akihabara & Kanda)" (its map, with several), "Jinbōchō or Kanda", "home", "" (anywhere, or nowhere named).
function whereOf(w: WorldDef, a: ActionDef): string {
    if (a.home) return 'home';
    if (a.anywhere) return '';
    const ids = placesFor(w, a);
    if (ids.length === 1) return placeAt(w, ids[0]);
    const names = ids.slice(0, 2).map(id => placeName(w, id));
    return ids.length > 2 ? `${names.join(', ')} and ${ids.length - 2} more` : or(names);
}
const at = (w: WorldDef, a: ActionDef) => { const x = whereOf(w, a); return x ? ` at ${x}` : ''; };
// When an action is on ("When: Late morning, afternoon or evening · Not on Sundays"), or nothing when it always is.
const whenLine = (w: WorldDef, a: ActionDef) => { const x = whenWords(w, a.when); return x.length ? `When: ${x.join(' · ')}` : ''; };
// The map a single-place action is on, when the world has several ("Jinbōchō book town is on the map Akihabara & Kanda.").
const mapLine = (w: WorldDef, a: ActionDef) => {
    const ids = placesFor(w, a); if (ids.length !== 1 || a.home || a.anywhere) return '';
    const m = mapName(w, ids[0]); return m ? `${placeName(w, ids[0])} is on the map ${m}.` : '';
};
const nextIn = (days: number) => (days <= 0 ? 'Next: today.' : days === 1 ? 'Next: tomorrow.' : `Next: in ${days} days.`);

/* ---------- each kind of objective ---------- */

// Where a keepsake comes from: actions (always, when the roll goes well, or one outcome in so many), street stories,
// shops and other goals' steps. The likeliest first.
function keepsakeHints(g: Save, w: WorldDef, id: string): string[] {
    const k = w.keepsakes?.find(x => x.id === id); if (!k) return [];
    const from: { text: string; odds: number; a?: ActionDef }[] = [];
    for (const a of w.actions) {
        if (!adultOk(g, a)) continue;
        const label = `“${a.label}”${at(w, a)}`;
        if (a.keepsake === id) { from.push({ text: `${label} always gives one.`, odds: 1, a }); continue; }
        const outs = outcomesOf(w, a), total = outs.reduce((s, o) => s + Math.max(0, o.weight ?? 0), 0);
        const mine = outs.filter(o => o.keepsake === id).reduce((s, o) => s + Math.max(0, o.weight ?? 0), 0);
        if (mine > 0 && total > 0) {
            const one = Math.max(1, Math.round(total / mine));
            from.push({ text: one === 1 ? `${label} nearly always gives one.` : `About 1 time in ${one}, ${label} gives one.`, odds: mine / total, a });
        } else if (a.roll?.success?.keepsake === id) from.push({ text: `${label} gives one when it goes well.`, odds: 0.5, a });
        else if (a.roll?.fail?.keepsake === id) from.push({ text: `${label} gives one when it goes badly.`, odds: 0.3, a });
    }
    for (const s of w.stories ?? []) {
        if (!adultOk(g, s)) continue;
        if (s.choices.some(c => c.keepsake === id || c.fail?.keepsake === id)) from.push({ text: `A street story at ${placeAt(w, s.place)} can give one.`, odds: 0.1 });
    }
    if ((k.price ?? 0) > 0 && k.at?.length) from.push({ text: `For sale at ${or(k.at.map(p => placeName(w, p)))}.`, odds: 1 });
    for (const goal of offeredGoals(g, w)) if (goal.steps.some(s => s.reward?.keepsake === id)) from.push({ text: `A step of the life goal ${goal.name} gives it.`, odds: 0.05 });
    if (!from.length) return [];
    const best = from.sort((a, b) => b.odds - a.odds).slice(0, 2);
    const out = best.map(x => x.text);
    // when the one likeliest way is an action, when it's on
    if (best[0].a) { const wl = whenLine(w, best[0].a); if (wl) out.push(wl); }
    if (k.gift !== false) out.push('Giving it as a gift uses it up.');
    return out;
}
// A thing to do: where and when it's on; with someone along, or a roll that goes well.
function didHints(g: Save, w: WorldDef, v: string): string[] {
    const x = countedOf('did', v); if (!x) return [];
    const [pre, rest] = x.what.includes(':') ? [x.what.slice(0, x.what.indexOf(':')), x.what.slice(x.what.indexOf(':') + 1)] : ['', x.what];
    if (pre === 'roll') {
        const by = w.actions.filter(a => a.roll?.skill === rest && adultOk(g, a)).slice(0, 3).map(a => `“${a.label}”`);
        return by.length ? [`${skillName(w, rest)} is rolled in things like ${or(by)}.`] : [];
    }
    // a night away: the places that let you book one, the cheapest first
    if (x.what === 'night_away') {
        const beds = w.places.filter(p => (p.sleep?.price ?? 0) > 0 && adultOk(g, p)).sort((a, b) => a.sleep!.price - b.sleep!.price).slice(0, 3);
        return beds.length ? [`Book a night away from home: ${or(beds.map(p => placeAt(w, p.id)))}.`] : [];
    }
    if (pre && pre !== 'with' && pre !== 'win') return [];
    const a = actionOf(w, rest); if (!a || !adultOk(g, a)) return [];
    const out: string[] = [];
    if (pre === 'with') out.push('It counts with someone along: someone you invited, or with you already.');
    if (pre === 'win') out.push(a.roll?.skill ? `It counts when the roll goes well (${skillName(w, a.roll.skill)} helps).` : 'It counts when the roll goes well.');
    const ml = mapLine(w, a), wl = whenLine(w, a);
    if (ml) out.push(ml);
    if (wl) out.push(wl);
    return out;
}
// A festival or a city event: when it's held, where, and how far off the next one is.
function attendHints(g: Save, w: WorldDef, v: string): string[] {
    const x = countedOf('attended', v); if (!x || x.what === 'any') return [];
    const f = w.festivals?.find(y => y.id === x.what);
    if (f) {
        if (!adultOk(g, f)) return [];
        const season = SEASONS.find(s => s.id === f.season)?.name ?? f.season, len = Math.max(1, f.days ?? 1), d = Math.min(f.day, seasonDays(g));
        const held = len > 1 ? `Held from ${season} day ${d} for ${len} days` : `Held on ${season} day ${d}`;
        const next = upcoming(g, w, seasonDays(g) * 4 + 1).find(y => y.f.id === f.id);
        return [`${held}${f.place ? `, at ${placeAt(w, f.place)}` : ''}.`, ...(next ? [nextIn(next.day - g.day)] : []),
            f.place || f.places?.length ? 'Go there while it\'s on and press Celebrate.' : 'Press Celebrate while it\'s on, wherever you are.'];
    }
    const e = w.cityEvents?.find(y => y.id === x.what);
    if (!e || !adultOk(g, e)) return [];
    const day = WEEKDAYS[e.weekday] ?? '', every = Math.max(1, e.every ?? 1);
    const next = comingEvents(g, w, 7 * every + 1).find(y => y.ev.id === e.id);
    return [`${every > 1 ? `Every ${every} weeks on ${day}` : `Every ${day}`} from ${e.from}:00, at ${placeAt(w, e.place)}.`, ...(next ? [nextIn(next.day - g.day)] : []),
        `Go there while it's on and press “${e.action || `Enjoy the ${e.name}`}”.`];
}
// What trains a skill: things to do (those in places you've been to first, then at home or anywhere, then the rest),
// and the jobs that train it.
function skillHints(g: Save, w: WorldDef, v: string): string[] {
    const m = v.match(/^(\S+)\s+\d+$/); if (!m || m[1] === 'any' || m[1] === 'creative') return [];
    const by = w.actions.filter(a => trainedBy(w, a)?.id === m[1] && adultOk(g, a) && a.id !== 'fix')
        .map(a => ({ a, rank: a.home || a.anywhere ? 1 : placesFor(w, a).some(id => beenTo(g, id)) ? 0 : placesFor(w, a).length ? 2 : 3 }))
        .filter(x => x.rank < 3).sort((x, y) => x.rank - y.rank).slice(0, 3)
        .map(({ a }) => `“${a.label}”${a.home ? ' at home' : at(w, a)}`);
    const out: string[] = [];
    if (by.length) out.push(`Trains it: ${or(by)}.`);
    const jobs = w.occupations.filter(o => o.hireable !== false && adultOk(g, o) && o.trains?.includes(m[1])).map(o => o.name);
    if (jobs.length) out.push(`Jobs that train it: ${or(jobs.slice(0, 3))}.`);
    if (w.language?.local === m[1]) out.push('It also grows by itself while you\'re out among people.');
    return out;
}
// A job (on your track, where it has tracks): where to ask for it, and what it wants of you.
function jobHints(g: Save, w: WorldDef, v: string): string[] {
    const job = w.occupations.find(x => x.id === v); if (!job || !adultOk(g, job)) return [];
    const o = trackOf(g, job), out: string[] = [];
    out.push(!offScreen(w, o) && w.places.some(p => p.id === o.place) ? `Ask for the job at ${placeAt(w, o.place)}.` : 'Apply in the Jobs app, under Openings.');
    const needs = Object.entries(o.skills ?? {}).map(([id, n]) => `${skillName(w, id)} ${n}`);
    if (needs.length) out.push(`It wants ${needs.join(', ')} to hire you.`);
    const courses = (o.courses ?? []).map(id => courseOf(w, id)?.name ?? id);
    if (courses.length) out.push(`It needs the course ${or(courses)}.`);
    const hire = (Array.isArray(o.hire) ? o.hire : o.hire ? [o.hire] : []).map(c => whenWords(w, c).join(', ')).filter(Boolean);
    if (hire.length) out.push(hire.length > 1 ? `To be hired, one of: ${hire.join('; ')}.` : `To be hired: ${hire[0]}.`);
    return out;
}
// A place: which map it's on; as a regular, how many visits so far.
function visitHints(g: Save, w: WorldDef, v: string): string[] {
    if (/^\d+\s+regular\b/.test(v)) return [`You become a regular at a place after ${REGULAR_VISITS} visits.`];
    const m = v.match(/^(\S+)(\s+regular)?$/); if (!m || !w.places.some(p => p.id === m[1])) return [];
    const out: string[] = [], map = mapName(w, m[1]);
    if (map) out.push(`${placeName(w, m[1])} is on the map ${map}.`);
    if (m[2] && !isRegular(g, m[1])) out.push(`You become a regular after ${REGULAR_VISITS} visits (${visitsTo(g, m[1])?.n ?? 0} so far).`);
    return out;
}
function stayHints(w: WorldDef, v: string): string[] {
    if (!w.places.some(p => p.id === v)) return [];
    return [`Book a night at ${placeAt(w, v)} and sleep there.`];
}

/** How to do an objective not done yet: up to four short lines (none when it says enough by itself). */
export function howTo(g: Save, w: WorldDef, o: Objective): string[] {
    if (o.ok || o.not) return [];
    const values = o.text.slice(o.text.indexOf(':') + 1).trim().split(/\s+or\s+/);
    // a long list of ways ("one of nine jobs") would bury the step under hints
    if (values.length > 3) return [];
    const out: string[] = [];
    for (const v of values) {
        const lines = o.key === 'holds' && !/^\d+$/.test(v) && !v.startsWith('kind:') ? keepsakeHints(g, w, v)
            : o.key === 'did' ? didHints(g, w, v)
            : o.key === 'attended' ? attendHints(g, w, v)
            : o.key === 'skill' ? skillHints(g, w, v)
            : o.key === 'job' ? jobHints(g, w, v)
            : o.key === 'visited' ? visitHints(g, w, v)
            : o.key === 'stayed' ? stayHints(w, v)
            : o.key === 'partner' && v === 'home' ? ['To live together, move your partner into your household: This world → Households.']
            : [];
        for (const l of lines) if (!out.includes(l)) out.push(l);
    }
    // several ways ("a or b") each say where: keep it short
    return out.slice(0, values.length > 1 ? MAX_LINES + 1 : MAX_LINES);
}
