// Characters take the initiative (requirements A-0): most of what they start is a *moment*, a one-time instruction to
// the AI for the next scene with that person ("Kaho confesses she likes {{user}}, in her own way"). Moments wait in a
// queue per person; only the oldest one per person is sent, two per scene at most, in the `moments` block. A moment
// is done once a scene verdict has read a scene it was sent in (the verdict is told about it, to judge how you
// responded); it's dropped when it no longer fits, or after 3 days unsent. Initiatives a character starts on their
// own (asking you, texting you) share one budget, scaled by the "Characters take the initiative" setting (off turns
// all of Feature 4 off). Everything here belongs to the seat of the person you play (`social`), so "Play as" swaps it.
import { TUT } from '../core/store.js';
import { social } from './social.js';
import { relCfg, idOf, YOU } from './rel.js';
export const initiativeOf = (g) => relCfg(g).initiative ?? 'normal';
export const initiativeOn = (g) => !TUT.save && initiativeOf(g) !== 'off';
export function seat(g) {
    const s = (social(g).init ??= {});
    s.moments ??= [];
    s.next ??= 1;
    s.budget ??= { day: -1, used: 0, last: {} };
    return s;
}
export const momentsOf = (g, who) => seat(g).moments.filter(m => !who || m.who === who);
/* ---------- the budget (A-0) ---------- */
// Initiatives a day across everyone, days between two of them (rarely), and days between two by the same person.
export const LIMITS = {
    rarely: { perDay: 1, gap: 3, per: 6 },
    normal: { perDay: 1, gap: 0, per: 3 },
    often: { perDay: 2, gap: 0, per: 2 },
};
function budget(g) { const b = seat(g).budget; if (b.day !== g.day) {
    b.day = g.day;
    b.used = 0;
} return b; }
export function canSpend(g, who) {
    const lv = initiativeOf(g);
    if (!initiativeOn(g) || lv === 'off')
        return false;
    const L = LIMITS[lv], b = budget(g);
    if (b.used >= L.perDay || (b.any !== undefined && g.day - b.any < L.gap))
        return false;
    return b.last[who] === undefined || g.day - b.last[who] >= L.per;
}
export function spend(g, who) { const b = budget(g); b.used++; b.any = g.day; b.last[who] = g.day; }
export const usedToday = (g) => budget(g).used;
/* ---------- the queue ---------- */
// Adds a moment (one of each kind and tier per person at a time). Returns it, or null when one like it is waiting.
export function queueMoment(g, m) {
    const s = seat(g);
    if (s.moments.some(x => x.who === m.who && x.kind === m.kind && (x.tier ?? '') === (m.tier ?? '')))
        return null;
    const out = { ...m, id: s.next++, day: g.day };
    s.moments.push(out);
    return out;
}
export function dropMoment(g, id) { const s = seat(g); s.moments = s.moments.filter(m => m.id !== id); }
// Drops what no longer fits (the rule that queued it says so) and what waited 3 days unsent.
export function tidyMoments(g, fits) {
    const s = seat(g);
    s.moments = s.moments.filter(m => (m.sent !== undefined || g.day - m.day <= 3) && fits(m));
}
// The moments for this scene: the oldest one per person here, two at most (the oldest first).
export function momentsHere(g, present, fits) {
    if (!initiativeOn(g))
        return [];
    const here = new Set(present.filter(r => r.met && idOf(g, r.avatar) !== YOU).map(r => r.avatar));
    const out = [];
    for (const m of [...seat(g).moments].sort((a, b) => a.day - b.day || a.id - b.id)) {
        if (out.length >= 2)
            break;
        if (here.has(m.who) && !out.some(x => x.who === m.who) && fits(m))
            out.push(m);
    }
    return out;
}
// They went out to the AI with the scene's prompt (first time only: the reverse ask reads from there).
export function markSent(list, chatLength) { for (const m of list)
    m.sent ??= chatLength; }
// A verdict read the scene: the moments sent to people who spoke in it are done. Returns them, for the verdict to
// judge how you responded.
export function finishMoments(g, spoke) {
    const s = seat(g);
    const done = s.moments.filter(m => m.sent !== undefined && spoke.includes(m.who));
    s.moments = s.moments.filter(m => !done.includes(m));
    return done;
}
