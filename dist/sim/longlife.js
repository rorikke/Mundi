// People's lives over the weeks (also while you sleep or skip time): couples get engaged, marry and move in
// together, or break up, by how they feel about each other (sim/relations.ts); people get promoted at work. What
// happens to someone you know reaches you as news. Everything is the engine's, day by day, the same for the same days.
// An engaged pair whose marriage roll passes sets a wedding day, the first Saturday or Sunday a week or two ahead
// (`PairState.wedding`), and marries on it, with or without a photographer there (the photo boards offer to shoot it:
// `weddingsAhead`); a split before the day calls it off.
import { cfg, residentsOf } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { seasonDays, isWeekend, weekday } from './time.js';
import { exampleOf, seedRanks } from './dayplan.js';
import { onDay } from './hooks.js';
import { note } from './facts.js';
import { npcCareer, trackOf } from './work.js';
import { lifeMoment } from './happenings.js';
import { liveTogether, homeKey } from './living.js';
import { couplePairs, setStatus, statusOf, gain, relOf } from './rel.js';
import { coupleOdds, feelOf, splitUp } from './relations.js';
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const rnd = (g, salt) => H(`${g.world}|${g.day}|${salt}`);
const store = (g) => { const l = (g.living ??= {}); l.ranks ??= {}; return l; };
const key = (a, b) => [a, b].sort().join('|');
// The stage of a couple between two people of the world (the relationships store, sim/rel.ts).
export const pairStage = (g, a, b) => { const s = statusOf(g, a, b); return s === 'dating' || s === 'engaged' || s === 'married' ? s : null; };
export const npcRank = (g, avatar) => store(g).ranks[avatar] ?? 0;
/** The days from a passed marriage roll to the wedding: the first Saturday or Sunday this many days ahead or more. */
export const WEDDING_AHEAD = { min: 7, max: 14 };
/** The wedding day for a roll passed on `day`: the first weekend day from a week ahead (always within two weeks). */
export function weddingDay(day) {
    for (let d = day + WEDDING_AHEAD.min; d <= day + WEDDING_AHEAD.max; d++)
        if (isWeekend(d))
            return d;
    return day + WEDDING_AHEAD.min;
}
/** The world's weddings set ahead, soonest first, today's included (on the day they're already married): what the photo
 *  boards offer to shoot. None with relations or romance off. */
export function weddingsAhead(g, w) {
    if (!systemOn(w, 'relations') || !systemOn(w, 'romance'))
        return [];
    const out = [];
    for (const { a, b, status } of couplePairs(g)) {
        const p = relOf(g).pairs[key(a, b)], day = p?.wedding;
        if (day === undefined || day < g.day || (status !== 'engaged' && !(status === 'married' && day === g.day && p.since === day)))
            continue;
        out.push({ pair: key(a, b), a, b, day });
    }
    return out.sort((x, y) => x.day - y.day || x.pair.localeCompare(y.pair));
}
function couplesMoveOn(g, w) {
    const out = [];
    for (const { a, b, status, since } of couplePairs(g)) {
        const k = key(a, b), A = g.cast[a], B = g.cast[b], pair = relOf(g).pairs[k];
        if (status === 'married' && pair.wedding !== undefined && pair.wedding < g.day)
            delete pair.wedding; // (the day is over)
        const known = A.met || B.met;
        const tell = (t, kind, tone = 'good') => {
            note(g, t, [A.name, B.name], [a, b], `home:${a}`, kind);
            const text = t.replace('{0}', A.name).replace('{1}', B.name);
            if (known)
                out.push(text);
            for (const x of [a, b])
                lifeMoment(g, w, x, text, tone); // the people close to you tell you
        };
        const odds = coupleOdds(feelOf(g, a, b, status, since));
        if (rnd(g, `split|${k}`) < odds.split) {
            splitUp(g, w, a, b);
            tell(status === 'married' ? '{0} and {1} got divorced.' : status === 'engaged' ? '{0} and {1} called off their engagement.' : '{0} and {1} broke up.', 'life', 'bad');
        }
        else if (status === 'dating' && rnd(g, `engage|${k}`) < odds.up) {
            setStatus(g, a, b, 'engaged');
            tell('{0} and {1} got engaged!', 'life');
        }
        else if (status === 'engaged' && pair.wedding === undefined && rnd(g, `marry|${k}`) < odds.up) {
            // the roll sets the day (no second roll while it's ahead); the news says when
            const day = pair.wedding = weddingDay(g.day);
            const t = '{0} and {1} set a date: they marry on {2}, in {3} days.';
            note(g, t, [A.name, B.name, weekday(day), String(day - g.day)], [a, b], `home:${a}`, 'life');
            if (known)
                out.push(t.replace('{0}', A.name).replace('{1}', B.name).replace('{2}', weekday(day)).replace('{3}', String(day - g.day)));
        }
        else if (status === 'engaged' && pair.wedding !== undefined && g.day >= pair.wedding) {
            setStatus(g, a, b, 'married');
            pair.wedding = g.day; // (kept through the day: the photographer shooting it finds it)
            for (const [x, y] of [[a, b], [b, a]])
                gain(g, 'f', x, y, 5, false); // the wedding brings them closer
            // they move in together (unless one of them lives with you: then nobody moves)
            const withYou = (x) => x.homeWith === '__you';
            if (!withYou(A) && !withYou(B) && homeKey(A.home) !== homeKey(B.home))
                liveTogether(g, a, b);
            tell('{0} and {1} got married!', 'life');
        }
    }
    return out;
}
// Promotions come at a pace like yours (J5): the top of a career in about a game year (four seasons) × the job's
// length, faster with the world's and the save's career speed. The world's own people climb at a quarter of that pace,
// so the people it wrote stay who they are for a while.
function promoteOdds(g, w, o, ranks, avatar) {
    const year = 4 * seasonDays(g) * (o.length ?? 1) * (o.pace ?? 1) / ((w.careerSpeed ?? 1) * (cfg(g).careerSpeed ?? 1));
    const r = g.cast[avatar];
    return Math.min(0.5, (ranks - 1) / Math.max(1, year)) * (r && exampleOf(w, r) ? 0.25 : 1);
}
function careersMoveOn(g, w) {
    const out = [];
    seedRanks(g, w);
    const st = store(g);
    for (const r of residentsOf(g)) {
        const job = w.occupations.find(x => x.id === r.occupation), o = job && trackOf(g, job, r.avatar); // (their gender's track)
        const ranks = o ? npcCareer(o, r.avatar, g).ranks : [];
        if (!o || ranks.length < 2)
            continue;
        const rank = st.ranks[r.avatar] ?? 0;
        if (rank >= ranks.length - 1 || rnd(g, `promo|${r.avatar}`) >= promoteOdds(g, w, o, ranks.length, r.avatar))
            continue;
        st.ranks[r.avatar] = rank + 1;
        const t = '{0} was promoted to {1}.';
        note(g, t, [r.name, ranks[rank + 1].name], [r.avatar], o.place, 'work');
        if (r.met)
            out.push(t.replace('{0}', r.name).replace('{1}', ranks[rank + 1].name));
        lifeMoment(g, w, r.avatar, t.replace('{0}', r.name).replace('{1}', ranks[rank + 1].name), 'good');
    }
    return out;
}
onDay.push((g, w) => [
    ...(systemOn(w, 'relations') && systemOn(w, 'romance') ? couplesMoveOn(g, w) : []),
    ...(systemOn(w, 'living') && systemOn(w, 'jobs') ? careersMoveOn(g, w) : []),
]);
