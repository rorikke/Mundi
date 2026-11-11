import { onAction, onHour, onLook } from './hooks.js';
/** The engine's own moments, counted by name (`did: meal 15`). Where each is counted:
 *  `meal` (cooking at home), `workout`, `painting` (a painting sold), `shift` (a shift worked; part shifts count their
 *  part), `party` (a party you threw): sim/skills.ts `countUp`; `missed_shift`: sim/work.ts; `missed_train` (a taxi or a
 *  wait after the last train): sim/transit.ts; `date` (a date kept): sim/plans.ts; `overnight` (someone stays the night
 *  with you, or you with them): sim/plans.ts; `night_away` (a night at a hotel, a capsule, a ryokan): sim/stays.ts;
 *  `crisis` and `collapse` (a need at zero too long; collapse: energy): sim/needs.ts; `apprentice`, `lesson`, `taught`
 *  (an apprentice who finished): sim/mentors.ts; `baby`: sim/family.ts; `business` (one opened): sim/holdings.ts. */
export const TALLY_EVENTS = ['meal', 'workout', 'painting', 'shift', 'party', 'missed_shift', 'missed_train', 'date', 'overnight', 'night_away', 'crisis', 'collapse', 'apprentice', 'lesson', 'taught', 'baby', 'business'];
/** The prefixes a counted key can have in a condition (`did: tag:karaoke 3`); with none it's an event name or an action id. */
export const TALLY_PREFIXES = ['tag', 'roll', 'win', 'with', 'people'];
export function tally(g) {
    const t = (g.tally ??= {});
    t.count ??= {};
    t.visited ??= {};
    t.best ??= {};
    t.met ??= {};
    return t;
}
/** A counter as it is now (0 when it never happened). */
export const tallyOf = (g, key) => g.tally?.count?.[key] ?? 0;
const add = (g, key, n = 1) => { const c = tally(g).count; c[key] = Math.round(((c[key] ?? 0) + n) * 100) / 100; };
/** One of the engine's moments happened (`n` times); `who`: with this person (an avatar), for `people:<name>`. */
export function tallyEvent(g, name, n = 1, who) {
    add(g, `event:${name}`, n);
    if (who) {
        const m = (tally(g).met[name] ??= []);
        if (!m.includes(who)) {
            m.push(who);
            add(g, `people:${name}`);
        }
    }
}
/** A festival celebrated or a city event gone to. */
export function tallyAttend(g, kind, id) { add(g, `${kind}:${id}`); add(g, 'attended:any'); }
/** A roll that went well: by its skill (an action's, a story's or a work choice's) and, for an action, by its id. */
export function tallyRoll(g, skill, action) { if (skill)
    add(g, `roll:${skill}`); if (action)
    add(g, `win:${action}`); }
/** An action done with someone (time together). */
export function tallyTogether(g, action) { add(g, `with:${action}`); add(g, 'with:any'); }
/* ---------- where you've been, your best ranks, your home ---------- */
/** Have you been to this place? */
export const beenTo = (g, place) => g.tally?.visited?.[place] !== undefined;
/** The places you've been to. */
export const placesBeen = (g) => Object.keys(g.tally?.visited ?? {});
/** Visits that make you a regular somewhere (the living world counts them: sim/daylife.ts, `living.visits`). */
export const REGULAR_VISITS = 8;
export const isRegular = (g, place) => (g.living?.visits?.[place]?.n ?? 0) >= REGULAR_VISITS;
/** The highest rank (1 = the first) you reached in each job. */
export const bestRanks = (g) => ({ ...(g.tally?.best ?? {}) });
// What's true now, noted: the place you're at (not a home, not an outing in a Home), the rank of your job, your home.
function look(g, w) {
    const t = tally(g), loc = g.player.loc;
    if (loc && !loc.startsWith('home:') && !loc.startsWith('out:') && !(loc in t.visited) && (!w || w.places.some(p => p.id === loc)))
        t.visited[loc] = g.day;
    const j = g.player.job;
    if (j?.id)
        t.best[j.id] = Math.max(t.best[j.id] ?? 0, (j.rank ?? 0) + 1);
    const h = g.player.home;
    if (h?.zone) {
        const at = `${h.zone}|${h.x ?? ''}|${h.y ?? ''}|${h.n ?? ''}`;
        if (!t.home)
            t.home = { at, since: g.day, first: h.zone };
        else if (t.home.at !== at) {
            t.home.at = at;
            t.home.since = g.day;
        }
    }
}
onAction.push((g, w, a) => {
    look(g, w);
    add(g, `action:${a.id}`);
    for (const tag of new Set(a.tags ?? []))
        add(g, `tag:${tag}`);
});
onHour.push((g, w) => { look(g, w); return []; });
onLook.push((g, w) => look(g, w));
