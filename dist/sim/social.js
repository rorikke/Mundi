// Relationships, meet-ups and text messages. Bond grows when you talk to someone (in a scene or by phone);
// a meet-up puts her at a place you chose for two hours; at a high bond you can ask her to be your partner.
// Things done together count as time together (E14), and keepsakes can be given as gifts (E35).
import { notify, nowAbs, UI } from '../core/store.js';
import { messageKind, aiVoice, systemOn } from '../core/world.js';
import { fr, ro, gain, lose, setFr, touch, statusOf, YOU, isPartner as partnerOfYou } from './rel.js';
import { charOf, personaName, sayLine, translateTo } from '../st/bridge.js';
import { whereNow, presentAt, workingAt } from './people.js';
import { personNamed } from './when.js';
import { romanceBlocked } from './family.js';
import { CRUSH } from './romance.js';
import { note } from './facts.js';
import { aiLangName } from '../core/i18n.js';
import { hm, weekday } from './time.js';
import { placeOf } from './places.js';
import { sawYou } from './warnings.js';
export function social(g) {
    const s = (g.social ??= {});
    s.threads ??= {};
    s.unread ??= {};
    s.appts ??= [];
    s.with ??= [];
    for (const a of s.appts) {
        a.id ??= `a${a.from}${a.avatar}`;
        a.kind ??= 'hangout';
        a.state ??= 'set';
    } // saves from before plans
    return s;
}
// Friendship toward you, as screens and the AI see it (whole points; the store keeps decimals).
// It can be negative (−100..100): below 0 they dislike you, and gates that need a bond treat that as below them.
export const bondOf = (g, avatar) => Math.round(fr(g, avatar, YOU));
export const isPartner = (g, avatar) => partnerOfYou(g, avatar);
export function bondLabel(g, avatar) {
    if (isPartner(g, avatar))
        return 'Partner';
    const b = bondOf(g, avatar);
    return b >= 80 ? 'Best friend' : b >= 55 ? 'Good friend' : b >= 30 ? 'Friend' : b >= 10 ? 'Acquaintance' : b >= 0 ? 'Stranger' // the same tiers as romance.ts
        : b >= -30 ? 'Wary' : b >= -60 ? 'Dislikes' : 'Hates';
}
// Where someone stands with you in a sentence, for the AI: "Kaho and Ro are friend", "Kaho dislikes Ro".
const COLD = { Wary: 'is wary of', Dislikes: 'dislikes', Hates: 'hates' };
export function standsWith(g, avatar, name, me) {
    const l = bondLabel(g, avatar);
    return COLD[l] ? `${name} ${COLD[l]} ${me}` : `${name} and ${me} are ${l.toLowerCase()}`;
}
// A milestone (keeping or missing a date, a match, a story event): applied in full, up or down.
export function bump(g, avatar, delta) {
    if (delta > 0)
        gain(g, 'f', avatar, YOU, delta, false);
    else if (delta < 0)
        lose(g, 'f', avatar, YOU, delta);
}
// Sets friendship toward you to at least `v` (a dating-app match makes you contacts).
export const bondAtLeast = (g, avatar, v) => { if (fr(g, avatar, YOU) < v)
    setFr(g, avatar, YOU, v); };
// Friendship from everyday things (talking, texting, running into someone): paced, so talking all day does not max
// it out (sim/rel.ts). Returns what was gained.
export function addBond(g, avatar, amount) { return gain(g, 'f', avatar, YOU, amount).d; }
// Friendship also goes down (a fight, a broken promise): in full, never paced. Returns how much it went down.
export function loseBond(g, avatar, amount) { return lose(g, 'f', avatar, YOU, amount); }
/* ---------- meet-ups ---------- */
export const MEET_BOND = 35;
export const PARTNER_BOND = 85;
export const livePlan = (a) => a.state === 'set' || a.state === 'met';
export function appointmentNow(g, avatar) {
    const now = nowAbs(g);
    return social(g).appts.find(a => a.avatar === avatar && livePlan(a) && a.from <= now && now < a.to) ?? null;
}
export const isWith = (g, avatar) => social(g).with.some(c => c.avatar === avatar);
export const companions = (g) => social(g).with.map(c => c.avatar).filter(a => g.cast[a]);
// (E14) Who does something with you here: the people who came with you and are here, and the one you talk to alone;
// with neither, the one person you know here who isn't working (Chloe at the karaoke joins your hour of singing).
export function withYou(g, w) {
    const met = presentAt(g, w, g.player.loc).filter(r => r.met);
    const solo = String(social(g).solo ?? '');
    const mine = met.filter(r => isWith(g, r.avatar) || r.avatar === solo).map(r => r.avatar);
    if (mine.length)
        return mine;
    const free = met.filter(r => workingAt(g, w, r, nowAbs(g)) !== g.player.loc);
    return free.length === 1 ? [free[0].avatar] : [];
}
/* ---------- things done together (E14) ---------- */
// Time spent doing something together counts like the rest of everyday life: a paced gain (sim/rel.ts), worth more
// the longer it lasts (`per30` raw points each half hour, between `min` and `max`), half again on a date or with
// your partner. Romance grows too with a partner, on a date, or when they already have a crush on you (half then).
export const TOGETHER_GAIN = { per30: 1, min: 1, max: 5, date: 1.5 };
export function doneTogether(g, w, avatars, minutes) {
    const base = Math.max(TOGETHER_GAIN.min, Math.min(TOGETHER_GAIN.max, (minutes / 30) * TOGETHER_GAIN.per30));
    return avatars.filter(a => g.cast[a]).map(a => {
        const close = !!statusOf(g, a, YOU) || appointmentNow(g, a)?.kind === 'date';
        const raw = base * (close ? TOGETHER_GAIN.date : 1);
        const f = gain(g, 'f', a, YOU, raw).d;
        const romantic = systemOn(w, 'romance') && !romanceBlocked(g, a) && (close || ro(g, a, YOU) >= CRUSH);
        const r = romantic ? gain(g, 'r', a, YOU, close ? raw : raw / 2).d : 0;
        touch(g, a);
        return { avatar: a, f, r };
    });
}
// A small change in how some of the world's people (by name) feel about you, from an outcome or a story: up paced,
// down in full.
export function feelsFrom(g, w, feels) {
    if (!feels)
        return;
    for (const [name, n] of Object.entries(feels)) {
        const r = personNamed(g, name);
        if (!r || !n)
            continue;
        if (n > 0)
            gain(g, 'f', r.avatar, YOU, n);
        else
            lose(g, 'f', r.avatar, YOU, n);
    }
}
/* ---------- gifts (E35) ---------- */
// A keepsake given to someone means what it means to them: one they'd love (their name on it, `loves`), one that fits
// what they do or where they spend their free time (a word of `loves` in their job or leisure places), or just a
// kind thought. Friendship grows by that (paced), once per kind of keepsake per person; the AI is told how it landed.
export const GIFT = { loves: 8, fits: 4, kind: 1.5 };
export const keepsakesOf = (g) => (g.player.keepsakes ??= {});
export const keepsakeDef = (w, id) => w.keepsakes?.find(k => k.id === id) ?? { id, name: id, icon: '🎁' };
export function addKeepsake(g, id, n = 1) { const k = keepsakesOf(g); k[id] = (k[id] ?? 0) + n; if (k[id] <= 0)
    delete k[id]; }
const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
export function giftFit(g, w, k, avatar) {
    const r = g.cast[avatar];
    if (!r)
        return 'kind';
    const loves = k.loves ?? [];
    if (loves.some(l => personNamed(g, l)?.avatar === avatar))
        return 'loves';
    const job = w.occupations.find(o => o.id === r.occupation);
    const spots = (r.leisure ?? []).map(id => w.places.find(p => p.id === id)).filter(Boolean);
    const hay = new Set([...(r.occupation ? [r.occupation] : []), ...words(job?.name ?? ''), ...spots.flatMap(p => [p.id, ...words(p.name), ...(p.tags ?? [])])].map(s => s.toLowerCase()));
    return loves.some(l => !personNamed(g, l) && hay.has(l.toLowerCase())) ? 'fits' : 'kind';
}
/** What you could give: keepsakes you hold that can be given. */
export const giftable = (g, w) => Object.entries(keepsakesOf(g)).filter(([id, n]) => n > 0 && keepsakeDef(w, id).gift !== false).map(([id]) => keepsakeDef(w, id));
export function giveKeepsake(g, w, id, avatar) {
    const r = g.cast[avatar], k = keepsakeDef(w, id);
    if (!r?.met)
        return { ok: false, text: '' };
    if (!(keepsakesOf(g)[id] > 0) || k.gift === false)
        return { ok: false, text: 'You don\'t have that to give.' };
    if (!presentAt(g, w, g.player.loc).includes(r))
        return { ok: false, text: `${r.name} isn't here.` };
    addKeepsake(g, id, -1);
    const s = social(g);
    const kinds = ((s.gifts ??= {})[avatar] ??= []), kind = k.kind ?? k.id, first = !kinds.includes(kind);
    const fit = giftFit(g, w, k, avatar);
    const d = first ? gain(g, 'f', avatar, YOU, GIFT[fit]).d : 0;
    if (first)
        kinds.push(kind);
    touch(g, avatar);
    sawYou(g, avatar);
    note(g, '{u} gave {0} a gift: {1}.', [r.name, k.name], [avatar], g.player.loc, 'gift');
    const how = fit === 'loves' ? 'loves it: it is exactly the kind of thing they treasure' : fit === 'fits' ? 'likes it: it fits what they enjoy' : 'takes it kindly, though it means little to them';
    const text = !first ? `${r.name} already has something like it from you.` : fit === 'loves' ? `${r.name} loves the ${k.name}!` : fit === 'fits' ? `${r.name} likes the ${k.name}.` : `${r.name} thanks you for the ${k.name}.`;
    const ai = `[Just now {{user}} gave ${r.name} a gift: ${k.name}. ${r.name} ${how}${first ? '' : ` (${r.name} already has something like it from {{user}})`}. Narrate how ${r.name} reacts.]`;
    return { ok: true, text, fit, first, d, ai };
}
/* ---------- text messages ---------- */
// A text reply: the chat so far as a transcript that ends with her name, so the model writes her next message.
function textTranscript(g, w, r, note = '') {
    const c = charOf(r.avatar);
    const me = personaName();
    const thread = social(g).threads[r.avatar] ?? [];
    const about = String(c?.description ?? '').replace(/{{char}}/g, r.name).replace(/{{user}}/g, me).replace(/\s+/g, ' ').slice(0, 900);
    const letters = messageKind(w) === 'letters';
    return [
        (letters
            ? `[Letters in ${w.name}, ${weekday(g.day)} ${hm(g.minutes)}. ${r.name} and ${me} write each other short letters, carried by a courier;`
            : `[Phone chat in ${w.name}, ${weekday(g.day)} ${hm(g.minutes)}. ${r.name} and ${me} text each other;`) + ` ${standsWith(g, r.avatar, r.name, me)} (${bondOf(g, r.avatar)}/100). ${r.name} is ${nowDoing(g, w, r)}.]`,
        `[They are ${letters ? 'writing letters' : 'texting'}, not together. ${r.name} talks about their own day (what they are doing, how they feel, what they will do today) and answers what ${me} wrote. ${r.name} does not know where ${me} is or what ${me} is doing unless ${me} said it in these messages (never guess it, never mention ${me}'s place or home on their own), and does not keep repeating plans they already agreed on, unless ${me} brings them up.]`,
        `[${r.name}: ${about}${c?.personality ? ` Personality: ${String(c.personality).replace(/\s+/g, ' ').slice(0, 300)}` : ''}]`,
        `[Each ${letters ? 'letter' : 'message'} is short (one to three sentences), ${aiVoice(w)}, written in ${aiLangName(g.lang)}, and answers the ${letters ? 'letter' : 'message'} right before it.]`,
        ...thread.slice(-14).map(t => `${t.me ? me : r.name}: ${t.text.replace(/\s+/g, ' ')}`),
        ...(note ? [`[${note}]`] : []),
    ].join('\n');
}
// What she is doing right now, for her texts (so she has something of her own to talk about).
function nowDoing(g, w, r) {
    const at = whereNow(g, w, r);
    const p = at === `home:${r.avatar}` || at.startsWith('home:') ? 'at home' : placeOf(g, w, at)?.name ? `at ${placeOf(g, w, at).name}` : 'out';
    return p;
}
export async function sendText(g, w, avatar, text) {
    const s = social(g);
    const r = g.cast[avatar];
    if (!r)
        return '';
    (s.threads[avatar] ??= []).push({ me: true, text, at: nowAbs(g) });
    addBond(g, avatar, 2);
    touch(g, avatar);
    sawYou(g, avatar);
    ((g.post ??= { queue: [], contact: {} }).contact)[avatar] = g.day; // keeping in touch (letters from afar)
    const reply = await sayLine(textTranscript(g, w, r), r.name, [r.name, personaName()], 320, 120, 'now');
    if (reply)
        s.threads[avatar].push({ me: false, text: reply, at: nowAbs(g) });
    return reply;
}
// She texts you (an answer to an invitation, or on her own), following `note` (what she must convey).
// `mine` is your message, when there is one. Without the AI, they send `fallback`.
export async function textFrom(g, w, avatar, note, fallback, mine = '') {
    const s = social(g);
    const r = g.cast[avatar];
    if (!r)
        return '';
    const t = (s.threads[avatar] ??= []);
    if (mine) {
        mine = await translateTo(mine);
        t.push({ me: true, text: mine, at: nowAbs(g) });
        notify();
    } // your message shows right away (in the chat's language)
    let reply = '';
    if (UI().aiTexts !== false) {
        try {
            reply = await sayLine(textTranscript(g, w, r, note), r.name, [r.name, personaName()], 320, 120, 'now');
        }
        catch { /* offline */ }
    } // off (This world → AI context): the ready-made reply
    t.push({ me: false, text: reply || fallback, at: nowAbs(g) });
    return reply || fallback;
}
// A line for the AI about the people in the scene and how close they are to the player.
export function relationsLine(g, present) {
    const parts = present.map(r => `${r.name} — ${bondLabel(g, r.avatar).toLowerCase()}`);
    return parts.length ? `How they relate to {{user}}: ${parts.join('; ')}.` : '';
}
