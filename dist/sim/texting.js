// Texting the world's people (the Messages app). A message that asks to meet ("dinner tomorrow at 8?") becomes a real
// invitation: a tiny follow-up question reads where and when out of it, and the plan rules (sim/plans.ts) answer yes or
// no, as the plan form would. Someone at work or asleep reads your message later: at work they answer when they get a
// moment, asleep in the morning (the clock sends it, ui/phone.ts). The AI writes the words, never the outcome.
import { nowAbs } from '../core/store.js';
import { systemOn, isScenario } from '../core/world.js';
import { quiet, personaName } from '../st/bridge.js';
import { social, loseBond, textFrom } from './social.js';
import { canPlan, isWorking, isSleeping, earliest } from './plans.js';
import { placeOf, playerHomeId } from './places.js';
import { breakNow } from './daylife.js';
import { weekday, hm } from './time.js';
/* ---------- asking to meet, by text ---------- */
// Words of a plan to meet (English, Portuguese, Spanish): only then is the AI asked, so most texts cost nothing extra.
const ASK_WORDS = /\b(hang ?out|meet(ing)? up|meet me|go out|a date|on a date|dinner|lunch|breakfast|brunch|coffee|a drink|drinks|the movies?|cinema|come over|come with me|are you free|free (tonight|tomorrow|on)|tonight|tomorrow|this (evening|weekend)|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|sair|encontrar|jantar|almoçar|almoço|tomar um café|amanhã|hoje à noite|fim de semana|vem (aqui|pra cá)|salir|quedar|cenar|comer juntos|mañana|esta noche|finde|fin de semana|ven a)\b/i;
export const looksLikeAsk = (text) => ASK_WORDS.test(text);
/** Asking to meet by text is a plan: only with plans on, outside a Home, with someone you can make plans with. */
export const canAskByText = (g, w, avatar) => systemOn(w, 'plans') && !isScenario(w) && !!g.cast[avatar] && canPlan(g, avatar);
// The places a plan can be at: the map's (not the links between maps) and your home, as on the plan form.
const planPlaces = (g, w) => [...w.places.filter(p => !p.link).map(p => ({ id: p.id, name: p.name })),
    ...(placeOf(g, w, playerHomeId) ? [{ id: playerHomeId, name: `${personaName()}'s home` }] : [])];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
/** Where and when a text asks to meet, read by the AI (one short line), or null when it isn't an invitation. What
 *  it leaves out the engine fills in: a place they like to go, seven in the evening. */
export async function readAsk(g, w, r, text) {
    const places = planPlaces(g, w);
    const me = personaName();
    const prompt = [`${me} texted ${r.name}: """${text.replace(/"""/g, '"')}"""`,
        `It is ${weekday(g.day)} ${hm(g.minutes)}.`,
        `Is ${me} asking ${r.name} to meet (hang out, or a date) at some time? If not, reply: no`,
        'If yes, reply on one line: yes | place | day | time | kind',
        '- place: the number of the place below, or 0 if none is named or it is unclear',
        '- day: now (come over right now), today, tomorrow, or a weekday name',
        '- time: HH:MM (24 h), or 0 if not said',
        '- kind: date or hangout',
        `Places: ${places.map((p, i) => `${i + 1}. ${p.name}`).join(' · ')}`].join('\n');
    let out = '';
    try {
        out = await quiet(prompt, 40, 'You read a text message and answer in the exact format asked, nothing else.', { lane: 'now' });
    }
    catch {
        return null;
    }
    const m = /\byes\s*\|\s*(\d+)\s*\|\s*([a-z]+)\s*\|\s*([\d:]+)\s*\|\s*(date|hangout)/i.exec(out);
    if (!m)
        return null;
    const kind = m[4].toLowerCase() === 'date' ? 'date' : 'hangout';
    const day = m[2].toLowerCase();
    if (day === 'now')
        return { now: true, place: g.player.loc, at: nowAbs(g), kind };
    const wd = WEEKDAYS.indexOf(day), today = WEEKDAYS.indexOf(weekday(g.day).toLowerCase());
    const d = day === 'tomorrow' ? g.day + 1 : wd >= 0 && today >= 0 ? g.day + ((wd - today + 7) % 7) : g.day;
    const t = /^(\d{1,2}):(\d{2})$/.exec(m[3]);
    let at = d * 1440 + (t ? Math.min(23, Number(t[1])) * 60 + Math.min(59, Number(t[2])) : 19 * 60);
    at -= at % 30; // plans start on the half hour, like the form's
    if (at < earliest(g))
        at = earliest(g);
    const n = Number(m[1]);
    const liked = (r.leisure ?? []).find(id => places.some(p => p.id === id));
    const place = places[n - 1]?.id ?? liked ?? w.places.find(p => (p.tags ?? []).includes('leisure') && !p.link)?.id ?? places[0]?.id;
    return place ? { now: false, place, at, kind } : null;
}
/** Messages read later: who, when they answer, and why not now. */
export const laterOf = (g) => (social(g).later ??= []);
export const waitingOn = (g, avatar) => laterOf(g).find(l => l.who === avatar) ?? null;
const AT_WORK_WAIT = 90; // at work they look at their phone within an hour and a half (or when the shift ends)
/** Why they can't answer right now: at work (not on a break) or asleep; '' when they can (always, with the `busy`
 *  system off). */
export function awayNow(g, w, r) {
    if (!systemOn(w, 'busy'))
        return '';
    const t = nowAbs(g);
    if (isSleeping(r, t))
        return 'sleep';
    if (isWorking(g, w, r, t) && !breakNow(g, w, r))
        return 'work';
    return '';
}
// The first half hour they're free (within a day).
function freeAt(g, w, r) {
    const now = nowAbs(g);
    for (let t = now + 30; t <= now + 1440; t += 30)
        if (!isSleeping(r, t) && !isWorking(g, w, r, t))
            return t;
    return now + 1440;
}
/** Someone who can't answer now (your message is already sent, social.ts's textOut): their answer waits. One wait
 *  per person, the first one. */
export function answerLater(g, w, avatar, why) {
    const r = g.cast[avatar];
    if (!r)
        return null;
    const was = waitingOn(g, avatar);
    if (was)
        return was;
    const at = why === 'work' ? Math.min(freeAt(g, w, r), nowAbs(g) + AT_WORK_WAIT) : freeAt(g, w, r);
    const l = { who: avatar, at, why };
    laterOf(g).push(l);
    return l;
}
/** The answers whose time has come, taken off the list (the phone writes them). Someone no longer in the world drops. */
export function dueLater(g) {
    const list = laterOf(g), now = nowAbs(g);
    const due = list.filter(l => l.at <= now || !g.cast[l.who]);
    if (!due.length)
        return [];
    social(g).later = list.filter(l => !due.includes(l));
    return due.map(l => l.who).filter(a => g.cast[a]);
}
/* ---------- a heart on their message ---------- */
// A heart on bad news, a worry, an apology or a hurt feeling lands badly: friendship down instead of up, and they
// say so. The AI only reads which one it is (once per message, kept on it); the engine moves the numbers.
export const HEART = { ok: 1, wrong: 2 };
export async function heartTone(g, r, text) {
    const me = personaName();
    try {
        const out = await quiet(`${r.name} texted ${me}: """${text.replace(/"""/g, '"')}"""\n\n${me} answered it with nothing but a heart (a like). Would that feel wrong to ${r.name}: is the message sad, bad news, hurt, angry, a worry, an apology or a confession of something painful? Reply with one word: ok or wrong.`, 10, 'You judge how a reaction lands. One word: ok or wrong.', { lane: 'now' });
        return /\bwrong\b/i.test(out) ? 'wrong' : 'ok';
    }
    catch {
        return 'ok';
    } // not sure: a heart is a kind thing
}
/** The heart landed badly: friendship lost, and their answer (the AI's words, or a short ready-made one). */
export async function heartBackfired(g, w, avatar, text) {
    const r = g.cast[avatar];
    if (!r)
        return '';
    loseBond(g, avatar, HEART.wrong);
    return textFrom(g, w, avatar, `${personaName()} reacted to ${r.name}'s message ("${text.replace(/\s+/g, ' ').slice(0, 200)}") with nothing but a heart. It felt wrong to ${r.name}: it was not something to like. ${r.name} answers in one short message, hurt or puzzled, in character.`, 'A heart? Really?');
}
