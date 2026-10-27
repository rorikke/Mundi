import { systemOn } from '../core/world.js';
import { onDay } from './hooks.js';
import { social, textFrom } from './social.js';
import { personaName } from '../st/bridge.js';
import { records } from './msglog.js';
import { facts, factText } from './facts.js';
import { rumorPool } from './living.js';
import { styleOf } from './intimacy.js';
import { ro, pairOf, partnersOf, idOf, YOU } from './rel.js';
import { CRUSH } from './romance.js';
import { romanceBlocked } from './family.js';
import { initiativeOn, canSpend, spend, queueMoment, seat } from './moments.js';
const exclusive = (g, a) => styleOf(g, a) === 'exclusive';
const myPartners = (g) => partnersOf(g, YOU).filter(a => g.cast[a] && idOf(g, a) !== YOU);
// In the scene: someone's romance toward you rose (their reply), and a partner of yours is here and sees it.
export function confrontations(g, w, present) {
    if (!initiativeOn(g) || !systemOn(w, 'romance'))
        return;
    const here = new Set(present.map(r => r.avatar));
    const warmed = new Set(records(g).filter(r => !r.settled && !r.undone).flatMap(r => r.ch.filter(c => c.m === 'r' && c.d > 0 && !c.y).map(c => c.x)));
    for (const p of myPartners(g)) {
        if (!here.has(p) || !exclusive(g, p))
            continue;
        const other = [...warmed].find(x => x !== p && here.has(x));
        if (!other || !canSpend(g, p))
            continue;
        const P = g.cast[p].name, X = g.cast[other]?.name ?? '';
        if (queueMoment(g, { who: p, kind: 'jealous', text: `${P} has noticed the way ${X} and {{user}} are flirting, and confronts {{user}} about it in this scene, hurt and jealous.` }))
            spend(g, p);
    }
}
// Through the grapevine: what a partner may hear about you and someone else.
const CHEATING = ['{u} and {0} had a date at {1}, as planned.', '{u} and {0} started something casual.', '{u} and {0} started dating.'];
export function rumorTexts(g, w) {
    if (!initiativeOn(g) || !systemOn(w, 'romance') || !systemOn(w, 'rumors') || !systemOn(w, 'plans'))
        return [];
    const told = (seat(g).told ??= []);
    const s = social(g), me = personaName();
    for (const rumor of rumorPool(g)) {
        const f = facts(g).find(x => x.id === rumor.id);
        if (!f || !CHEATING.includes(f.t))
            continue;
        const other = f.who[0];
        for (const p of myPartners(g)) {
            const since = pairOf(g, p, YOU)?.since ?? 0;
            const k = `${rumor.id}|${p}`;
            if (p === other || told.includes(k) || !rumor.knownBy.includes(p) || !exclusive(g, p) || Math.floor(f.at / 1440) < since || !canSpend(g, p))
                continue;
            told.push(k);
            spend(g, p);
            const P = g.cast[p].name;
            void textFrom(g, w, p, `${P} heard around town that ${factText(f, me)} ${P} is ${me}'s partner and expected to be the only one: a short, hurt and suspicious message asking ${me} about it.`, 'I heard something about you. Is it true?')
                .then(() => { s.unread[p] = (s.unread[p] ?? 0) + 1; }).catch(() => { });
            break;
        }
    }
    if (told.length > 60)
        told.splice(0, told.length - 60);
    return [];
}
// Rivals: both have a crush on you (and may have romance at all).
export const rivalsForYou = (g, w, a, b) => systemOn(w, 'romance') && !romanceBlocked(g, a) && !romanceBlocked(g, b) && ro(g, a, YOU) >= CRUSH && ro(g, b, YOU) >= CRUSH;
export function rivalsLine(g, w, present) {
    const ps = present.filter(r => idOf(g, r.avatar) !== YOU), out = [];
    for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++)
            if (rivalsForYou(g, w, ps[i].avatar, ps[j].avatar))
                out.push(`${ps[i].name} and ${ps[j].name}`);
    return out.length ? `Rivals for {{user}}'s affection (both have feelings for {{user}}, and it shows between them): ${out.join('; ')}.` : '';
}
onDay.push((g, w) => rumorTexts(g, w));
