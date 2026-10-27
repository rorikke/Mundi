import { systemOn } from '../core/world.js';
import { onDay } from './hooks.js';
import { fr, ro, gain, lose, relCfg, idOf, YOU } from './rel.js';
import { approve } from './living.js';
import { romanceBlocked } from './family.js';
import { initiativeOn, seat } from './moments.js';
export const SPREAD = { step: 0.5, perDay: 1, friend: 55, news: 5, best: 80, infatuated: 70, dislikes: -30 };
export const spreadOn = (g, w) => initiativeOn(g) && relCfg(g).spread !== false && systemOn(w, 'relations');
// +1 for someone who adores you, −1 for someone who dislikes you, 0 otherwise.
function opinion(g, w, s) {
    const f = fr(g, s, YOU);
    if (f < SPREAD.dislikes)
        return -1;
    if (f >= SPREAD.best || (systemOn(w, 'romance') && !romanceBlocked(g, s) && ro(g, s, YOU) >= SPREAD.infatuated))
        return 1;
    return 0;
}
export function spreadOpinions(g, w) {
    if (!spreadOn(g, w))
        return [];
    const moved = (seat(g).spread ??= {});
    const used = {};
    const out = [];
    const ids = Object.keys(g.cast).filter(a => idOf(g, a) !== YOU);
    for (const s of ids) {
        const o = opinion(g, w, s);
        if (!o)
            continue;
        for (const f of ids) {
            if (f === s || fr(g, f, s) < SPREAD.friend || (used[f] ?? 0) >= SPREAD.perDay)
                continue;
            let d = 0;
            if (o > 0) {
                if (fr(g, f, YOU) < SPREAD.friend - SPREAD.step)
                    d = gain(g, 'f', f, YOU, SPREAD.step).d;
            }
            else if (fr(g, f, YOU) > SPREAD.dislikes + SPREAD.step)
                d = -lose(g, 'f', f, YOU, SPREAD.step);
            if (!d)
                continue;
            approve(g, f, o);
            used[f] = (used[f] ?? 0) + Math.abs(d);
            const k = `${s}>${f}`;
            moved[k] = (moved[k] ?? 0) + Math.abs(d);
            if (moved[k] >= SPREAD.news) {
                moved[k] = 0;
                const S = g.cast[s], F = g.cast[f];
                if (S?.met || F?.met)
                    out.push(`${S.name} has been talking about you to ${F.name}${o > 0 ? ', and it shows: they think better of you.' : ', and not kindly.'}`);
            }
        }
    }
    return out;
}
onDay.push((g, w) => spreadOpinions(g, w));
