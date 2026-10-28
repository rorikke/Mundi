// Puts starting feelings (core/feel.ts) into a save: friendship and romance both ways, a couple's status, the couple
// they used to be, and where someone stands with you. Also the levels the editors pick from: the tier a value is in,
// and choosing a tier without moving a value already inside it; and relations in the old form, while editors still
// write them.
import type { Save } from '../core/store.js';
import { FRIEND_START, ROM_START, APPROVAL_START, COUPLE_APPROVAL, COUPLE_FRIEND, FAMILY_START, FAMILY_APPROVAL, fromOldTie, type FriendLevel, type RomLevel, type StartFeel } from '../core/feel.js';
import { fr, ro, hasMeter, setFr, setRo, setStatus, statusOf, setPast, idOf, PARTNER, COUPLE_ROMANCE, YOU, type Meter } from './rel.js';
import { friendTier, ROMANCE_TIERS } from './romance.js';
import { familyBlocked } from './family.js';
import { setTie } from './living.js';

export const friendLevelOf = (v: number) => friendTier(v).id as FriendLevel;
export const romLevelOf = (v: number) => (ROMANCE_TIERS.find(t => v >= t.lo && v < t.hi) ?? ROMANCE_TIERS[0]).id as RomLevel;

// An editor's level picker: x's meter toward y goes to the level's starting value, unless it's already in that level
// (looking at the picker never moves anything).
export function pickLevel(g: Save, m: Meter, x: string, y: string, level: FriendLevel | RomLevel) {
    if (m === 'f') { if (friendLevelOf(fr(g, x, y)) !== level) setFr(g, x, y, FRIEND_START[level as FriendLevel]); }
    else if (romLevelOf(ro(g, x, y)) !== level) setRo(g, x, y, ROM_START[level as RomLevel]);
}

// Applies one starting feeling. Values go only where the store has none, unless `overwrite` (an editor, or a new
// game's choice made on purpose); romance never where family or minors block it. A couple without levels starts as
// good friends and in love (COUPLE_ROMANCE, Infatuated); something casual with some interest. With you: approval
// follows a's level (a couple adds a little), and your own side (`__you>a`, hidden) is seeded like anyone's.
export function applyStartFeel(g: Save, sf: StartFeel, overwrite = false) {
    let { a, b } = sf;
    if (idOf(g, a) === YOU) [a, b] = [b, a];   // a is never you: their feelings are the ones that are set
    if (!a || !b || idOf(g, a) === idOf(g, b)) return;
    const couple = !!sf.status && PARTNER.includes(sf.status), casual = sf.status === 'casual';
    const f = sf.f ?? (couple ? COUPLE_FRIEND : undefined), back = sf.back ?? f;
    const r = sf.r ?? (couple ? 'infatuated' : casual ? 'interest' : undefined), rback = sf.rback ?? r;
    const put = (m: Meter, x: string, y: string, v: number | undefined) => {
        if (v === undefined || (!overwrite && hasMeter(g, m, x, y))) return;
        if (m === 'f') setFr(g, x, y, v); else setRo(g, x, y, v);
    };
    put('f', a, b, f && FRIEND_START[f]); put('f', b, a, back && FRIEND_START[back]);
    if (!familyBlocked(g, a, b)) { put('r', a, b, r && (couple && !sf.r ? COUPLE_ROMANCE : ROM_START[r])); put('r', b, a, rback && (couple && !sf.rback ? COUPLE_ROMANCE : ROM_START[rback])); }
    if (sf.status && (overwrite || !statusOf(g, a, b))) setStatus(g, a, b, sf.status, g.day);
    else if (!sf.status && sf.was && !statusOf(g, a, b)) setPast(g, a, b, { ...(sf.was === 'ex' ? {} : { status: sf.was }), until: g.day });
    if (idOf(g, b) === YOU && (f || sf.status)) {
        const ap = ((((g as any).living ??= {}).approval ??= {}) as Record<string, number>);
        if (overwrite || ap[a] === undefined) ap[a] = (f ? APPROVAL_START[f] : 0) + (couple ? COUPLE_APPROVAL : 0);
    }
}

// One relation in the old form ({ a, b, type, tone, back? }: the new game, cast presets, world files): family becomes
// a tie (with you, also where they stand with you), anything else starting feelings (core/feel.ts fromOldTie).
// `overwrite`: a choice made on purpose for this game (its relations with you).
export function addOldTie(g: Save, t: { a: string; b: string; type: string; tone?: string; back?: string }, overwrite = false) {
    if (!t.a || !t.b || t.a === t.b) return;
    const { family, feel } = fromOldTie(t);
    if (family) {
        setTie(g, { a: t.a, b: t.b, type: family });
        const other = idOf(g, t.a) === YOU ? t.b : idOf(g, t.b) === YOU ? t.a : '';
        if (other) {   // a feeling of its own (a tone that isn't the usual one) comes below
            const ap = ((((g as any).living ??= {}).approval ??= {}) as Record<string, number>);
            if (overwrite || ap[other] === undefined) ap[other] = FAMILY_APPROVAL[family];
            if (!feel?.f && (overwrite || !hasMeter(g, 'f', other, YOU))) setFr(g, other, YOU, FAMILY_START[family]);
        }
    }
    if (feel) applyStartFeel(g, { a: t.a, b: t.b, ...feel }, overwrite);
}
