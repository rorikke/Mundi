// Romance fades without contact, and partners who stopped loving you leave (requirements R-12, R-8). Each day without
// contact (a scene or a text with you, a plan kept; between people, time together) romance fades toward a floor:
// 0 after 2 days for anyone who isn't a partner (something casual included), 10 after 3 days for partners, a little
// each day (a loss: never paced). A person's romance pace and the save's setting scale it; the feelings of the person
// you play never fade. A partner whose romance toward you stays under 20, or whose friendship stays at Dislikes or
// worse, for days in a row (casual 2, dating 3, engaged 5, married 7) ends it, and tells you.
import { nowAbs } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { onDay } from './hooks.js';
import { directedAbove, lose, lastContact, touch, tidyContact, pairOf, setStatus, setLow, relCfg, paceOf, relOf, idOf, PARTNER, YOU } from './rel.js';
import { PACE } from './pace.js';
import { romValue, addRomance, DISLIKES } from './romance.js';
import { bondOf, bump, social } from './social.js';
import { approve } from './living.js';
import { note } from './facts.js';
import { feel } from './life.js';
export const FADE = {
    other: { grace: 2, rate: 3, floor: 0 }, // anyone who isn't a partner
    partner: { grace: 3, rate: 2, floor: 10 }, // dating, engaged, married: stays under 20, so an ignored partner leaves
};
export const LEAVE_AFTER = { casual: 2, dating: 3, engaged: 5, married: 7 };
// Each day: romance toward you (romance system) and between people (also "Relationships between people") fades
// where there has been no contact.
export function fadeRomance(g, w) {
    const k = relCfg(g).fade ?? 1;
    if (!(k > 0) || !systemOn(w, 'romance'))
        return;
    const between = systemOn(w, 'relations');
    for (const { x, y, v } of directedAbove(g, 'r', 0.0001)) {
        if (x === YOU || !g.cast[x] || (y !== YOU && (!between || !g.cast[y])))
            continue;
        const last = lastContact(g, x, y);
        if (last === undefined) {
            touch(g, x, y);
            continue;
        } // first seen: start counting from today
        const f = PARTNER.includes(pairOf(g, x, y)?.status) ? FADE.partner : FADE.other;
        if (g.day - last <= f.grace || v <= f.floor)
            continue;
        lose(g, 'r', x, y, Math.min(v - f.floor, f.rate * k * (PACE[paceOf(g, x, 'r') ?? 'normal'] ?? 1)));
    }
    tidyContact(g);
}
// What they text you when they end it (canned: the moment is the engine's).
const GOODBYE = {
    casual: "Hey… I don't think we should keep seeing each other. Take care.",
    dating: "We need to talk. I don't think this is working anymore. I'm sorry, but it's over.",
    engaged: "I can't marry you. I'm sorry. I'm calling off the engagement.",
    married: "I want a divorce. I'm sorry. I can't do this anymore.",
};
// Partners who have felt too little for too long leave you.
export function partnersLeave(g, w) {
    if (!systemOn(w, 'romance'))
        return [];
    const out = [];
    for (const [key, p] of Object.entries(relOf(g).pairs)) {
        const st = p.status;
        if (!st)
            continue;
        const [a, b] = key.split('|');
        const other = a === YOU ? b : b === YOU ? a : '';
        const r = other && g.cast[other];
        if (!r || idOf(g, other) === YOU)
            continue;
        const low = romValue(g, other) < 20 || bondOf(g, other) < DISLIKES;
        const n = low ? (p.low ?? 0) + 1 : 0;
        setLow(g, other, YOU, n);
        if (n < LEAVE_AFTER[st])
            continue;
        setStatus(g, other, YOU, null);
        if (st === 'casual') {
            addRomance(g, other, -15);
            bump(g, other, -5);
            approve(g, other, -3);
        }
        else {
            addRomance(g, other, -45);
            bump(g, other, st === 'married' ? -30 : -20);
            approve(g, other, -10);
        }
        const fact = st === 'married' ? '{0} asked {u} for a divorce.' : st === 'engaged' ? '{0} called off the engagement with {u}.' : st === 'casual' ? '{0} stopped seeing {u}.' : '{0} broke up with {u}.';
        note(g, fact, [r.name], [other], `home:${other}`, 'love');
        feel(g, other, st === 'married' ? 'Divorcing you' : 'Ended things with you', 7);
        const s = social(g);
        (s.threads[other] ??= []).push({ me: false, text: GOODBYE[st], at: nowAbs(g) });
        s.unread[other] = (s.unread[other] ?? 0) + 1;
        out.push(st === 'married' ? `${r.name} asked you for a divorce.` : st === 'engaged' ? `${r.name} called off your engagement.` : st === 'casual' ? `${r.name} doesn't want to keep seeing you.` : `${r.name} broke up with you.`);
    }
    return out;
}
onDay.push((g, w) => { fadeRomance(g, w); return partnersLeave(g, w); });
