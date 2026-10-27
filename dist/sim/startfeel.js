import { FRIEND_START, ROM_START, APPROVAL_START, COUPLE_APPROVAL, COUPLE_FRIEND } from '../core/feel.js';
import { fr, ro, hasMeter, setFr, setRo, setStatus, statusOf, setPast, idOf, PARTNER, COUPLE_ROMANCE, YOU } from './rel.js';
import { friendTier, ROMANCE_TIERS } from './romance.js';
import { familyBlocked } from './family.js';
export const friendLevelOf = (v) => friendTier(v).id;
export const romLevelOf = (v) => (ROMANCE_TIERS.find(t => v >= t.lo && v < t.hi) ?? ROMANCE_TIERS[0]).id;
// An editor's level picker: x's meter toward y goes to the level's starting value, unless it's already in that level
// (looking at the picker never moves anything).
export function pickLevel(g, m, x, y, level) {
    if (m === 'f') {
        if (friendLevelOf(fr(g, x, y)) !== level)
            setFr(g, x, y, FRIEND_START[level]);
    }
    else if (romLevelOf(ro(g, x, y)) !== level)
        setRo(g, x, y, ROM_START[level]);
}
// Applies one starting feeling. Values go only where the store has none, unless `overwrite` (an editor, or a new
// game's choice made on purpose); romance never where family or minors block it. A couple without levels starts as
// good friends and in love (COUPLE_ROMANCE, Infatuated); something casual with some interest. With you: approval
// follows a's level (a couple adds a little), and your own side (`__you>a`, hidden) is seeded like anyone's.
export function applyStartFeel(g, sf, overwrite = false) {
    let { a, b } = sf;
    if (idOf(g, a) === YOU)
        [a, b] = [b, a]; // a is never you: their feelings are the ones that are set
    if (!a || !b || idOf(g, a) === idOf(g, b))
        return;
    const couple = !!sf.status && PARTNER.includes(sf.status), casual = sf.status === 'casual';
    const f = sf.f ?? (couple ? COUPLE_FRIEND : undefined), back = sf.back ?? f;
    const r = sf.r ?? (couple ? 'infatuated' : casual ? 'interest' : undefined), rback = sf.rback ?? r;
    const put = (m, x, y, v) => {
        if (v === undefined || (!overwrite && hasMeter(g, m, x, y)))
            return;
        if (m === 'f')
            setFr(g, x, y, v);
        else
            setRo(g, x, y, v);
    };
    put('f', a, b, f && FRIEND_START[f]);
    put('f', b, a, back && FRIEND_START[back]);
    if (!familyBlocked(g, a, b)) {
        put('r', a, b, r && (couple && !sf.r ? COUPLE_ROMANCE : ROM_START[r]));
        put('r', b, a, rback && (couple && !sf.rback ? COUPLE_ROMANCE : ROM_START[rback]));
    }
    if (sf.status && (overwrite || !statusOf(g, a, b)))
        setStatus(g, a, b, sf.status, g.day);
    else if (!sf.status && sf.was && !statusOf(g, a, b))
        setPast(g, a, b, { ...(sf.was === 'ex' ? {} : { status: sf.was }), until: g.day });
    if (idOf(g, b) === YOU && (f || sf.status)) {
        const ap = ((g.living ??= {}).approval ??= {});
        if (overwrite || ap[a] === undefined)
            ap[a] = (f ? APPROVAL_START[f] : 0) + (couple ? COUPLE_APPROVAL : 0);
    }
}
