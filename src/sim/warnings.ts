// Warning signs before a breakup, and friends who check in (requirement A-3). A partner you haven't seen for 3 days
// (when their romance starts fading) texts that they miss you; on the first day their feelings are low enough to
// leave you (romance under 20, or friendship at Dislikes), they text that you need to talk, and the next scene with
// them has them bring it up. Meeting them ends the first, feelings rising again end the second. Friends (Friend or
// above) you haven't seen for a week check in with an invitation. Texts need the phone (the plans system); everything
// but "we need to talk" waits for the initiative budget.
import { nowAbs, type Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { onHour } from './hooks.js';
import { social, bondOf, textFrom } from './social.js';
import { personaName } from '../st/bridge.js';
import { lastContact, pairOf, idOf, PARTNER, YOU, type Status } from './rel.js';
import { romValue, DISLIKES } from './romance.js';
import { grudgeOf } from './grudges.js';
import { initiativeOn, canSpend, spend, queueMoment, seat } from './moments.js';

export const WARN = { miss: 3, checkIn: 7, friend: 30 };
const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
interface Warn { miss?: number; talk?: number }
const warnOf = (g: Save) => (((seat(g) as any).warn ??= {}) as Record<string, Warn>);
const seenOf = (g: Save) => (((seat(g) as any).seen ??= {}) as Record<string, number>);
export const warning = (g: Save, a: string): Warn | null => { const x = warnOf(g)[a]; return x && (x.miss !== undefined || x.talk !== undefined) ? x : null; };
// You were with them (a reply in a scene, a text, a plan kept): the clock of "haven't seen you for a while" restarts.
export function sawYou(g: Save, a: string) { seenOf(g)[a] = g.day; }
export const lowFor = (g: Save, a: string) => romValue(g, a) < 20 || bondOf(g, a) < DISLIKES;

function text(g: Save, w: WorldDef, a: string, note: string, fallback: string) {
    const s = social(g);
    void textFrom(g, w, a, note, fallback).then(() => { s.unread[a] = (s.unread[a] ?? 0) + 1; }).catch(() => { /* offline */ });
}
export function warnings(g: Save, w: WorldDef): string[] {
    if (!initiativeOn(g) || !systemOn(w, 'romance')) return [];
    const phone = systemOn(w, 'plans'), me = personaName(), warn = warnOf(g);
    for (const r of Object.values(g.cast)) {
        const a = r.avatar, st = pairOf(g, a, YOU)?.status;
        if (idOf(g, a) === YOU || !st || !PARTNER.includes(st as Status)) { delete warn[a]; continue; }
        const x = (warn[a] ??= {});
        const last = lastContact(g, a, YOU) ?? g.day;
        // 1. three days without seeing you
        if (g.day - last < WARN.miss) delete x.miss;
        else if (x.miss === undefined && phone && canSpend(g, a)) {
            x.miss = g.day; spend(g, a);
            text(g, w, a, `${r.name} hasn't seen ${me}, their partner, for ${g.day - last} days and misses them. A short, warm message: they miss ${me}, or suggest meeting up soon.`, 'I miss you. When can I see you?');
        }
        // 2. feelings low enough to leave: "we need to talk" (always), and they bring it up when you meet
        if (!lowFor(g, a)) { delete x.talk; const s = seat(g); s.moments = s.moments.filter(m => !(m.who === a && m.kind === 'talk')); }
        else if (x.talk === undefined) {
            x.talk = g.day; spend(g, a);
            if (phone) text(g, w, a, `${r.name} is unhappy with how things are going with ${me} and writes that they need to talk. One or two short, serious sentences; no breakup yet.`, 'We need to talk.');
            queueMoment(g, { who: a, kind: 'talk', text: `${r.name} is unhappy with how things are going between them and brings it up with {{user}} in this scene: they need to talk about the relationship.` });
        }
        if (x.miss === undefined && x.talk === undefined) delete warn[a];
    }
    return [];
}
// A friend you haven't seen for a week checks in with an invitation (the usual invitation card).
function checkIns(g: Save, w: WorldDef): string[] {
    const s = social(g) as any, seen = seenOf(g);
    if (!systemOn(w, 'plans') || s.invite) return [];
    for (const r of Object.values(g.cast)) {
        const a = r.avatar;
        if (!r.met || idOf(g, a) === YOU || PARTNER.includes(pairOf(g, a, YOU)?.status as Status)) continue;
        if (seen[a] === undefined) { seen[a] = g.day; continue; }   // first seen: start counting from today
        if (g.day - seen[a] < WARN.checkIn || bondOf(g, a) < WARN.friend || grudgeOf(g, a) || !r.leisure.length || !canSpend(g, a)) continue;
        spend(g, a); seen[a] = g.day;
        const now = nowAbs(g), from = now + 120 - (now % 30), place = r.leisure[0];
        s.invite = { avatar: a, place, from, kind: 'hangout' };
        text(g, w, a, `${r.name} hasn't seen ${personaName()} for a while and checks in: a short, friendly message asking how they are, and whether they'd like to meet up today.`, "Hey, it's been a while! Want to meet up today?");
        break;
    }
    return [];
}

// Late morning, once a day, the partners; friends check in during the day (a small chance each hour).
onHour.push((g, w) => {
    const h = Math.floor(g.minutes / 60);
    if (!initiativeOn(g)) return [];
    if (h === 11) warnings(g, w);
    if (h >= 10 && h <= 19 && H(`${g.world}|${g.day}|${h}|checkin`) < 0.15) checkIns(g, w);
    return [];
});
