// Who comes over to you while you're busy. Being in the same place isn't being together: doing something with people
// around plays alone, and after it the engine rolls whether one of them comes over (closer people more often, a busy
// bar more than a library, a drink more than studying, nobody twice in a row). The screen then asks you: talk, or nod
// and keep going. "Keep to myself" makes it rare, and only friends still do. It needs the living world, and the
// initiative setting scales it ('off': nobody comes over). Running into someone who arrives (ui/bump.ts) shares the
// same pause and switch.
import { nowAbs, TUT } from '../core/store.js';
import { systemOn, isScenario } from '../core/world.js';
import { presentAt, workingAt } from './people.js';
import { social, bondOf, isWith, talkingWith, withYou } from './social.js';
import { statusOf, YOU } from './rel.js';
import { initiativeOf } from './moments.js';
import { placeOf } from './places.js';
import { grudgeOf } from './grudges.js';
export const APPROACH = {
    /** the most it can be in one go, everyone here together */ max: 0.5,
    /** game minutes before the same person comes over again, and before anyone does */ per: 180, gap: 45,
    /** "Keep to myself": this much of the chance, and only from people at least this close */ keep: 0.15, keepBond: 30,
    /** a chance meeting with someone arriving (ui/bump.ts), before the place and the switch */ runIn: 0.15,
};
// How likely each kind of person is to come over (before the place and what you're doing).
const BY_BOND = [[55, 0.22], [30, 0.15], [10, 0.08], [0, 0.04]];
const PARTNER = 0.3, STRANGER = 0.02, COLD = 0.02;
const LEVEL = { off: 0, rarely: 0.5, normal: 1, often: 1.5 };
// Places where people keep to themselves, and places where they mix (a place's tags; quiet wins). `work` says
// nothing: a bar is a workplace too, and the people working there never come over anyway.
const QUIET = ['study', 'health', 'service'], LIVELY = ['leisure', 'food', 'nightworld', 'music', 'karaoke'];
// What you're doing: something you do with others invites company, something you focus on keeps it away. (A generic
// action's tags name the places that offer it, not what it is: only a place's own action, or `solo`, says so.)
const FOCUSED = ['study', 'work', 'art'];
const focused = (a) => (a.tags ?? []).includes('solo') || (!!(a.place || a.places?.length) && (a.tags ?? []).some(t => FOCUSED.includes(t)));
export const keepToMyself = (g) => !!social(g).keep;
export function setKeepToMyself(g, on) { social(g).keep = on || undefined; }
/** Is any of this on in this world (the living world, not a Home)? */
export const approachOn = (w) => systemOn(w, 'living') && !isScenario(w);
// The place and the switch, for everyone here; 0 when nobody may come over now.
function setting(g, w) {
    if (!approachOn(w) || TUT.save || g.asleep)
        return 0;
    const s = social(g);
    if (s.cameAny !== undefined && nowAbs(g) - s.cameAny < APPROACH.gap)
        return 0;
    return LEVEL[initiativeOf(g)] ?? 1;
}
function placeMul(g, w) {
    const tags = placeOf(g, w, g.player.loc)?.tags ?? [];
    return tags.some(t => QUIET.includes(t)) ? 0.35 : tags.some(t => LIVELY.includes(t)) ? 1.3 : tags.includes('sport') ? 0.8 : 1;
}
const actionMul = (a) => (!a ? 1 : focused(a) ? 0.4 : a.together ? 1.4 : 1);
/** How likely this person is to come over to you after this action (0–1). */
export function approachChance(g, w, r, a) {
    const base = setting(g, w);
    const loc = g.player.loc, now = nowAbs(g), last = social(g).came?.[r.avatar];
    if (!base || workingAt(g, w, r, now) === loc || isWith(g, r.avatar) || talkingWith(g, r.avatar) || (last !== undefined && now - last < APPROACH.per))
        return 0;
    const b = bondOf(g, r.avatar), close = !!statusOf(g, r.avatar, YOU);
    if (keepToMyself(g) && !close && (!r.met || b < APPROACH.keepBond))
        return 0;
    const who = !r.met ? STRANGER : close ? PARTNER : b < 0 || grudgeOf(g, r.avatar) ? COLD : BY_BOND.find(([at]) => b >= at)?.[1] ?? STRANGER;
    return who * base * placeMul(g, w) * actionMul(a) * (keepToMyself(g) ? APPROACH.keep : 1);
}
/** After an action: maybe one of the people here (who isn't with you already) comes over. Everyone's chance together
 *  is held under `max`; who it is goes by their chance. Returns them, or null. */
export function rollApproach(g, w, a, rnd = Math.random) {
    const mine = new Set(withYou(g, w));
    const list = presentAt(g, w, g.player.loc).filter(r => !mine.has(r.avatar)).map(r => ({ r, p: approachChance(g, w, r, a) })).filter(x => x.p > 0);
    if (!list.length)
        return null;
    const none = list.reduce((s, x) => s * (1 - x.p), 1), total = list.reduce((s, x) => s + x.p, 0);
    if (rnd() >= Math.min(APPROACH.max, 1 - none))
        return null;
    let x = rnd() * total;
    for (const { r, p } of list) {
        x -= p;
        if (x < 0)
            return r.avatar;
    }
    return list[list.length - 1].r.avatar;
}
/** Someone came over (or crossed your path): nobody comes over again for a while, and not them for longer. */
export function cameOver(g, avatar) {
    const s = social(g), now = nowAbs(g);
    (s.came ??= {})[avatar] = now;
    s.cameAny = now;
}
/** The chance of running into someone arriving here after an action (ui/bump.ts): a lively place more, a quiet one less,
 *  less while you keep to yourself, never right after someone came over. */
export function runInChance(g, w) {
    const s = social(g);
    if (TUT.save || (s.cameAny !== undefined && nowAbs(g) - s.cameAny < APPROACH.gap))
        return 0;
    return APPROACH.runIn * placeMul(g, w) * (keepToMyself(g) ? APPROACH.keep : 1);
}
