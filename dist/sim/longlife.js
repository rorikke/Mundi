import { systemOn } from '../core/world.js';
import { onDay } from './hooks.js';
import { note } from './facts.js';
import { npcCareer } from './work.js';
import { lifeMoment } from './happenings.js';
import { setTie, removeTie, liveTogether, homeKey, ties } from './living.js';
import { couplePairs, setStatus, statusOf, gain } from './rel.js';
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
function couplesMoveOn(g, w) {
    const out = [];
    for (const { a, b, status, since } of couplePairs(g)) {
        const k = key(a, b), A = g.cast[a], B = g.cast[b];
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
        else if (status === 'engaged' && rnd(g, `marry|${k}`) < odds.up) {
            setStatus(g, a, b, 'married');
            const old = ties(g).find(t => (t.a === a && t.b === b) || (t.a === b && t.b === a));
            removeTie(g, a, b);
            setTie(g, { a, b, type: 'spouse', tone: old?.tone ?? 'close' });
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
function careersMoveOn(g, w) {
    const out = [];
    const st = store(g);
    for (const r of Object.values(g.cast)) {
        const o = w.occupations.find(x => x.id === r.occupation);
        const ranks = o ? npcCareer(o, r.avatar).ranks : [];
        if (!o || ranks.length < 2)
            continue;
        const rank = st.ranks[r.avatar] ?? 0;
        if (rank >= ranks.length - 1 || rnd(g, `promo|${r.avatar}`) >= 0.012)
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
