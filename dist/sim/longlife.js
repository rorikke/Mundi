import { systemOn } from '../core/world.js';
import { onDay } from './hooks.js';
import { note } from './facts.js';
import { npcCareer } from './work.js';
import { lifeMoment } from './happenings.js';
import { setTie, removeTie, liveTogether, homeKey } from './living.js';
import { couplePairs, setStatus, statusOf } from './rel.js';
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
        const days = g.day - since, known = A.met || B.met;
        const tell = (t, kind, tone = 'good') => {
            note(g, t, [A.name, B.name], [a, b], `home:${a}`, kind);
            const text = t.replace('{0}', A.name).replace('{1}', B.name);
            if (known)
                out.push(text);
            for (const x of [a, b])
                lifeMoment(g, w, x, text, tone); // the people close to you tell you
        };
        if (status === 'dating') {
            if (days >= 14 && rnd(g, `engage|${k}`) < 0.05) {
                setStatus(g, a, b, 'engaged');
                tell('{0} and {1} got engaged!', 'life');
            }
            else if (rnd(g, `split|${k}`) < 0.012) {
                setStatus(g, a, b, null);
                removeTie(g, a, b);
                setTie(g, { a, b, type: 'ex', tone: 'tense' });
                tell('{0} and {1} broke up.', 'life', 'bad');
            }
        }
        else if (status === 'engaged' && days >= 14 && rnd(g, `marry|${k}`) < 0.07) {
            setStatus(g, a, b, 'married');
            removeTie(g, a, b);
            setTie(g, { a, b, type: 'spouse', tone: 'close' });
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
    ...(systemOn(w, 'living') && systemOn(w, 'romance') ? couplesMoveOn(g, w) : []),
    ...(systemOn(w, 'living') && systemOn(w, 'jobs') ? careersMoveOn(g, w) : []),
]);
