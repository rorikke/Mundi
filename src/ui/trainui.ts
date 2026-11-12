// Training together on screen, and in the conversation. You suggest it in your own words ("could you teach me
// Japanese?"): after their reply, a tiny question to the AI says whether they agreed, to what, or not; the engine
// starts it or holds it off (sim/training.ts). They suggest it (when hinted, or on their own): a reply of theirs about
// teaching is checked, and an offer comes as a card (Accept / Not now) whose answer goes to the AI. Both checks run only
// when the words are about teaching or learning and someone there could train with you, so ordinary talk costs nothing.
// Also: the Profile's Training section, and the HUD's session buttons.
import { esc, game, notify, saveGame, state, toast, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { ACT } from './reg.js';
import { chat, personaName, quiet, sendCanned, setPrompt, speakerOf, thumb } from '../st/bridge.js';
import { presentAt } from '../sim/people.js';
import { social } from '../sim/social.js';
import { advance } from '../sim/time.js';
import { skillName } from '../sim/hobbies.js';
import { dropMoment, momentsOf } from '../sim/moments.js';
import { TRAIN, trainingOf, trainingOn, activeOf, possible, whyNot, canArrange, bestOffer, arrange, turnedDown, endArrangement,
    session, sessionWhy, sessionsThisWeek, standing, kindWords, whatWords, type Arrangement } from '../sim/training.js';

const KEY = 'mundi_train';
let seq = 0;
// A note for the next reply (cleared after a minute, or by the next one).
function tellAi(text: string, ms = 60000) { const my = ++seq; setPrompt(KEY, text, 0); if (text) setTimeout(() => { if (seq === my) setPrompt(KEY, ''); }, ms); }

/* ---------- the words that start a check ---------- */

// Suggesting it: about teaching each other, lessons, an exchange (English, Portuguese, Spanish).
const PROPOSE = /\b(teach(?:es|ing)? (?:me|you)|(?:could|can|would) teach|teach each other|tutor(?:ing)?|lessons?|language exchange|exchange (?:lessons|languages)|(?:trade|swap) (?:lessons|languages)|help me (?:learn|practi[cs]e|with my)|practi[cs]e (?:together|with (?:me|you))|learn (?:it )?from you|me ensina\w*|ensin(?:ar|o|a|aria)\w*|aulas?|interc[aâ]mbio|aprender com voc[eê]|praticar (?:juntos|com voc[eê])|ens[eé][nñ]a(?:s|me|r|rte|rme)?|te ense[nñ]o|clases?|intercambio|aprender de ti|practicar (?:juntos|contigo))\b/i;
// Offering it: the same, a little wider (a character may "show you how" or offer "a few lessons").
const OFFER = new RegExp(`${PROPOSE.source}|\\b(?:teach|show you how|practi[cs]e)\\b`, 'i');

const clean = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const names = (w: WorldDef, ids: string[]) => ids.map(id => skillName(w, id)).join(', ') || 'nothing';
// The skill an answer names, among those allowed ("Japanese", "japanese", "Japanese language").
function pick(w: WorldDef, said: string, allowed: string[]): string | undefined {
    const s = said.toLowerCase().trim();
    if (!s || /^(none|nothing|-)$/.test(s)) return undefined;
    return allowed.find(id => s.includes(skillName(w, id).toLowerCase()) || s.includes(id.toLowerCase()));
}
// "yes | Chloe teaches: Japanese | Chloe learns: English" → the skills, among what's possible.
function parseTerms(w: WorldDef, out: string, p: { learn: string[]; teach: string[] }) {
    const teaches = /teaches\s*:\s*([^|\n]*)/i.exec(out)?.[1] ?? '', learns = /learns\s*:\s*([^|\n]*)/i.exec(out)?.[1] ?? '';
    return { learn: pick(w, teaches, p.learn), teach: pick(w, learns, p.teach) };
}
const rules = (w: WorldDef, me: string, name: string, p: { learn: string[]; teach: string[] }) =>
    `What could be arranged (the game's rules): ${name} could teach ${me}: ${names(w, p.learn)}. ${me} could teach ${name}: ${names(w, p.teach)}.`;

/* ---------- you suggest it ---------- */

const TR = { avatar: '', name: '', from: 0, start: 0, waits: 0, round: 0, busy: false, checked: {} as Record<string, number> };

/** After each of your lines (index.ts): a suggestion to someone here who could train with you waits for their answer;
 *  someone who can't yet gets a note for the AI, so the reply fits the rules. */
export function detectTrain(text: string) {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || !trainingOn(w) || TR.avatar || !PROPOSE.test(text)) return;
    const people = presentAt(g, w, g.player.loc).filter(r => r.met && !whyNot(g, w, r.avatar, false).startsWith('Not with') && (() => { const p = possible(g, w, r.avatar); return p.learn.length || p.teach.length; })());
    if (!people.length) return;
    // whom: the one you name, else the one you're talking to alone, else whoever spoke last
    const low = text.toLowerCase(), solo = String((social(g) as any).solo ?? '');
    const last = [...chat()].reverse().map(m => speakerOf(m)).find(a => a && people.some(p => p.avatar === a));
    const r = people.find(p => low.includes(p.name.toLowerCase().split(/\s+/)[0])) ?? people.find(p => p.avatar === solo) ?? (people.length === 1 ? people[0] : people.find(p => p.avatar === last) ?? null);
    if (!r) return;
    const why = whyNot(g, w, r.avatar);
    if (why === 'Not again so soon.') { tellAi(`[${r.name} turned down training together with {{user}} not long ago and still isn't up for it; ${r.name} says so kindly.]`); return; }
    if (why === 'You don\'t know each other well enough yet.') { tellAi(`[${r.name} doesn't know {{user}} well enough yet to commit to regular lessons together; ${r.name} kindly puts it off for now.]`); return; }
    if (why) { tellAi(`[${r.name} can't take on regular lessons with {{user}} right now (${why.replace(/\.$/, '').toLowerCase()}); ${r.name} says so kindly.]`); return; }
    Object.assign(TR, { avatar: r.avatar, name: r.name, from: chat().length, start: chat().length, waits: 0, round: 0 });
}

/** When a reply finishes (index.ts): your suggestion's answer, or an offer in their reply. */
export async function checkTrain() {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || !trainingOn(w) || TR.busy) return;
    TR.busy = true;
    try { if (TR.avatar) await answered(g, w); else await offered(g, w); }
    finally { TR.busy = false; }
}

async function answered(g: Save, w: WorldDef) {
    const list = chat(), { avatar, name } = TR;
    const replies = list.slice(TR.from).filter((m: any) => !m.is_user && !m.is_system && !m.extra?.mundi_narrator);
    if (!replies.some((m: any) => speakerOf(m) === avatar) && !(replies.length && new Set(replies.map((m: any) => String(m.name ?? ''))).size === 1)) {
        if (++TR.waits >= 3) { TR.avatar = ''; tellAi(''); }
        return;
    }
    const me = personaName(), p = possible(g, w, avatar);
    const said = list.slice(Math.max(0, TR.start - 1)).filter((m: any) => !m.is_system).map((m: any) => `${m.is_user ? `${me} (the player)` : String(m.name ?? '')}: ${clean(m.mes)}`).join('\n').slice(-2500);
    let out = '';
    try {
        out = (await quiet(`${me} suggested training together to ${name} (regular lessons, or trading lessons). ${rules(w, me, name, p)}\n\nThis is the scene since then (lines by the player may be story directions that decide what happens):\n"""\n${said}\n"""\n\n` +
            `Did ${name} agree? Reply with one line only, one of these:\nyes | ${name} teaches: <a skill, or none> | ${name} learns: <a skill, or none>\nno (${name} refused)\nmaybe (no clear answer yet, or ${name} asked for time)\nnone (nobody really suggested training together)`, 40,
            'You read a scene and say whether a suggestion was accepted, in the exact format asked, with no other words.', { lane: 'now' })).trim();
    } catch { /* not sure: treat it as no clear answer */ }
    const head = out.toLowerCase().split(/[\s|]/)[0];
    if (head !== 'yes' && head !== 'no' && head !== 'none' && TR.round < 2) {
        TR.round++; TR.from = list.length; TR.waits = 0;
        tellAi(`[${name} hasn't clearly answered {{user}}'s suggestion to train together yet. In this reply ${name} gives a clear answer, in their own way: yes, no, or that they need time to think.]`);
        return;
    }
    TR.avatar = ''; tellAi('');
    if (head === 'yes') {
        const t = parseTerms(w, out, p), o = t.learn || t.teach ? t : bestOffer(g, w, avatar) ?? {};
        const msg = arrange(g, w, avatar, o.learn, o.teach);
        toast(msg, /agreed/.test(msg) ? 'success' : 'warn');
    } else if (head === 'no') {
        turnedDown(g, avatar, true);
        toast(`${name} said no to training together. It won't come up with them again for a while.`, 'info');
    }
    saveGame(); notify();
}

/* ---------- they offer it ---------- */

interface Offer { who: string; learn?: string; teach?: string }
let OFFERED: Offer | null = null;
async function offered(g: Save, w: WorldDef) {
    if (OFFERED) return;
    const list = chat();
    let i = list.length - 1; while (i >= 0 && !list[i].is_user) i--;
    const replies = list.slice(i + 1).filter((m: any) => !m.is_system && !m.extra?.mundi_narrator);
    const hinted = new Set(momentsOf(g).filter(m => m.kind === 'train' && m.sent !== undefined).map(m => m.who));
    const m = replies.find((x: any) => { const a = speakerOf(x) ?? ''; return a && canArrange(g, w, a) && (list.length - (TR.checked[a] ?? -99) >= 6) && (OFFER.test(clean(x.mes)) || (hinted.has(a) && PROPOSE.test(clean(x.mes)))); });
    const a = m && speakerOf(m); const r = a && g.cast[a];
    if (!a || !r) return;
    TR.checked[a] = list.length;
    const me = personaName(), p = possible(g, w, a);
    const said = list.slice(Math.max(0, i - 3)).filter((x: any) => !x.is_system).map((x: any) => `${x.is_user ? `${me} (the player)` : String(x.name ?? '')}: ${clean(x.mes)}`).join('\n').slice(-2500);
    let out = '';
    try {
        out = (await quiet(`This is the latest part of a scene between ${me} and ${r.name}:\n"""\n${said}\n"""\n\n${rules(w, me, r.name, p)}\n\n` +
            `In their last line, did ${r.name} offer ${me} to train together (regular lessons, or trading lessons)? Reply with one line only, one of these:\noffer | ${r.name} teaches: <a skill, or none> | ${r.name} learns: <a skill, or none>\nnone (no such offer)`, 40,
            'You read a scene and say whether an offer was made, in the exact format asked, with no other words.', { lane: 'now' })).trim();
    } catch { return; }
    if (!/^offer\b/i.test(out)) return;
    const t = parseTerms(w, out, p), o = t.learn || t.teach ? t : bestOffer(g, w, a);
    if (!o || (!o.learn && !o.teach)) return;
    OFFERED = { who: a, ...o };
    notify();
}
/** The offer's card (in the HUD's slot for cards that wait for an answer). */
export function trainOfferHtml(g: Save, w: WorldDef): string {
    const o = OFFERED, r = o && g.cast[o.who];
    if (!o || !r) return '';
    if (!canArrange(g, w, o.who)) { OFFERED = null; return ''; }
    return `<div class="mh-invite mh-glass mu-tr-offer" role="dialog"><img src="${esc(thumb(r.avatar))}" alt="">
        <div><b data-notr>${esc(r.name)}</b><p>Offers ${esc(kindWords(w, o))}: ${esc(whatWords(g, w, o, 'you'))}. About twice a week, an hour each time.</p></div>
        <div class="mh-invite-btns"><button class="mu-primary" data-act="tr-yes">Accept</button><button data-act="tr-no">Not now</button></div></div>`;
}

/* ---------- the Profile ---------- */

const ago = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);   // ("last today", "last 3 days ago")
function sideHtml(w: WorldDef, label: string, s: { skill: string; now: number; to: number } | null) {
    return s ? `<small>${esc(label)} ${esc(skillName(w, s.skill))}: level ${s.now}${s.now < s.to ? ` → ${s.to}` : ' (done)'}</small>` : '';
}
function rowHtml(g: Save, w: WorldDef, a: Arrangement) {
    const r = g.cast[a.who], st = standing(g, w, a), n = r.name;
    const left = TRAIN.lapse - (g.day - a.last);
    return `<div class="mu-ph-job mu-tr-row"><img src="${esc(thumb(a.who))}" alt=""><span><b data-notr>${esc(n)}</b><small>${esc(kindWords(w, a))}</small>
        ${sideHtml(w, 'You learn', st.learn)}${sideHtml(w, `${n} learns`, st.teach)}
        <small><span>${sessionsThisWeek(g, a)}/${TRAIN.perWeek} this week</span> · <span>${a.sessions ? `last ${ago(g.day - a.last)}` : 'no session yet'}</span>${left <= 4 ? ` · <span>${left <= 1 ? 'lapses tomorrow' : `lapses in ${left} days`}</span>` : ''}</small></span>
        <button class="mu-ghost mu-danger-text" data-act="tr-end" data-id="${a.id}">End</button></div>`;
}
/** Training together, under the skills. */
export function trainingHtml(g: Save, w: WorldDef): string {
    if (!trainingOn(w)) return '';
    const s = trainingOf(g), on = activeOf(g), done = s.list.filter(a => a.done && g.cast[a.who]);
    return `<section class="mu-training"><h4>🤝 Training together</h4>
        ${on.length ? on.map(a => rowHtml(g, w, a)).join('') : `<p class="mu-muted">Talk about it: a friend who's good at something you're not (level ${TRAIN.teacher} or more, ${TRAIN.gap} above you) may teach you, or trade lessons, and you can teach what you know. Up to ${TRAIN.most} at a time, ${TRAIN.perWeek} sessions a week, an hour each with them beside you; unused for ${TRAIN.lapse} days, it lapses.</p>`}
        ${done.length ? `<small class="mu-muted">${esc(`Finished: ${done.map(a => `${g.cast[a.who].name} (${[a.learn, a.teach].filter(Boolean).map(id => skillName(w, id!)).join(' ↔ ')})`).join(', ')}`)}</small>` : ''}</section>`;
}
/** Under a skill's "Where to practise": the arrangement that trains it. */
export function trainingPracticeHtml(g: Save, w: WorldDef, id: string): string {
    const a = trainingOn(w) ? activeOf(g).find(x => x.learn === id) : null;
    return a ? `<small class="mu-muted">${esc(`Lessons with ${g.cast[a.who].name}, ${TRAIN.perWeek} a week (Training together).`)}</small>` : '';
}

/* ---------- the HUD ---------- */

export function trainActs(g: Save, w: WorldDef): string {
    if (!trainingOn(w)) return '';
    return activeOf(g).filter(a => !sessionWhy(g, w, a)).map(a => {
        const n = g.cast[a.who].name;
        const label = a.learn && a.teach ? (kindWords(w, a) === 'a language exchange' ? `Language exchange with ${n}` : `Trade lessons with ${n}`) : a.learn ? `Lesson with ${n}` : `Teach ${n}`;
        const what = [a.learn, a.teach].filter(Boolean).map(id => skillName(w, id!)).join(' ↔ ');
        return `<button class="mh-act mh-glass" data-act="tr-session" data-id="${a.id}"><i>📖</i><b>${esc(label)}</b><small>${esc(`${what} · 1 hour`)}</small></button>`;
    }).join('');
}

const S = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
Object.assign(ACT, {
    'tr-session': (el) => {
        const c = S(); if (!c) return;
        const r = session(c.g, c.w, Number(el.dataset.id));
        if (!r.minutes) { toast(r.text, 'warn'); return; }
        if (state.view === 'scene') setPrompt('mundi_roll', `[Rules — ${r.ai} Narrate it.]`, 0);
        advance(c.g, c.w, r.minutes).forEach(m => toast(m, 'info'));
        r.lines.forEach(m => toast(m, 'success'));
        toast(r.text, 'success'); saveGame(); notify();
    },
    'tr-end': (el) => { const c = S(); if (!c) return; const m = endArrangement(c.g, c.w, Number(el.dataset.id)); if (m) toast(m, 'info'); saveGame(); notify(); },
    'tr-yes': () => {
        const c = S(); const o = OFFERED; OFFERED = null; if (!c || !o) return;
        const r = c.g.cast[o.who]; if (!r) return;
        const msg = arrange(c.g, c.w, o.who, o.learn, o.teach);
        for (const m of momentsOf(c.g, o.who)) if (m.kind === 'train') dropMoment(c.g, m.id);
        if (/agreed/.test(msg) && state.view === 'scene') { tellAi(`[{{user}} accepts ${r.name}'s offer: ${whatWords(c.g, c.w, o)}, about twice a week. Write ${r.name}'s reaction.]`); sendCanned(`*accepts ${r.name}'s offer*`); }
        toast(msg, /agreed/.test(msg) ? 'success' : 'warn'); saveGame(); notify();
    },
    'tr-no': () => {
        const c = S(); const o = OFFERED; OFFERED = null; if (!c || !o) return;
        const r = c.g.cast[o.who]; if (!r) return;
        turnedDown(c.g, o.who);
        for (const m of momentsOf(c.g, o.who)) if (m.kind === 'train') dropMoment(c.g, m.id);
        if (state.view === 'scene') { tellAi(`[{{user}} turns down ${r.name}'s offer to train together, for now. Write ${r.name}'s reaction.]`); sendCanned(`*turns down ${r.name}'s offer, for now*`); }
        toast(`You turned down ${r.name}'s offer.`, 'info'); saveGame(); notify();
    },
});
// (for the tests)
export const _test = { PROPOSE, OFFER, parseTerms };
