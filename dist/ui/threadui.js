// Storylines on screen: the deciding card in the HUD (a storyline's end waits for you: Help, Now, Wait or Let it be),
// the last chance by text (a small HUD card, and the answers under the text in the phone conversation), the person's
// page line "Their story" (only once you know their secret), and the Help topic. The rules are in sim/threads.ts; this
// only draws what it hands over and calls its answers, then refreshes the AI's prompt (the scene changed at once).
// Names, titles and story text sit in data-notr elements; the engine's own wording (what is missing, why) is
// interface text and translates.
import { esc, game, notify, saveGame, state, toast } from '../core/store.js';
import { getWorld, systemOn } from '../core/world.js';
import { thumb } from '../st/bridge.js';
import { money } from '../sim/needs.js';
import { refreshPrompt } from '../sim/prompt.js';
import { syncScene } from '../sim/game.js';
import { answerDecide, answerNudge, decideCard, nudgeAsk, storylineOf, talkAbout } from '../sim/threads.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
import { P, closePhone } from './phone.js';
const S = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const haveWord = (g, w) => `you have ${money(w, g.player.money)}`;
/* ---------- the deciding card ---------- */
// One button: Help shows its price (and, short of money, what you have), Wait is just Wait (what is missing is above).
function buttonHtml(g, w, id, c, n) {
    const short = c.id === 'help' && c.ok === false;
    const label = c.id === 'help' ? `<span data-notr>${esc(c.label)}</span>` : `<span>${esc(c.label)}</span>`;
    const price = c.price ? `<small>${esc(c.price)}${short ? ` · ${esc(haveWord(g, w))}` : ''}</small>` : '';
    return `<button class="${n === 0 ? 'mu-primary' : c.id === 'let' ? 'mu-ghost' : ''}" data-act="th-decide" data-id="${esc(id)}" data-c="${esc(c.id)}" ${short ? 'aria-disabled="true"' : ''}>${label}${price}</button>`;
}
/** The deciding card of this scene, in the HUD's ask cards (while you're in the scene with them). */
export function decideHtml(g, w) {
    if (state.view !== 'scene')
        return '';
    const c = decideCard(g, w);
    if (!c)
        return '';
    // (Help's own price and what you have are on its button: the engine repeats them in Wait's list)
    const missing = (c.choices.find(x => x.id === 'wait')?.missing ?? []).filter(m => !(c.choices.some(x => x.id === 'help' && x.price && m.startsWith(x.price)) && / \(you have /.test(m)));
    return `<div class="mh-invite mh-story mu-th-card mh-glass" role="dialog" aria-label="A storyline is waiting for you"><img src="${esc(thumb(c.who))}" alt="">
        <div><b data-notr>${esc(c.name)}</b><small class="mu-th-title" data-notr>${esc(c.title)}</small>
            <p data-notr>${esc(c.stake)}</p>
            ${c.pending ? `<p>${esc(`This hangs on how ${c.pending}'s storyline ends.`)}</p>` : ''}
            ${c.why ? `<p class="mu-th-why">${esc(c.why)}</p>` : ''}
            ${missing.length ? `<small class="mu-th-help">What would help:</small><ul class="mu-th-miss">${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}</div>
        <div class="mh-invite-btns">${c.choices.map((x, n) => buttonHtml(g, w, c.thread, x, n)).join('')}</div></div>`;
}
/* ---------- a last chance by text ---------- */
/** The small HUD card while a text waits for your answer (the answers are under the text in the conversation). */
export function nudgeCardHtml(g, w) {
    if (!w.features?.phone)
        return '';
    const n = nudgeAsk(g, w);
    if (!n || (P.open && P.app === 'thread' && P.who === n.who))
        return '';
    return `<div class="mh-invite mu-th-nudge mh-glass" role="dialog" aria-label="A message is waiting for an answer"><img src="${esc(thumb(n.who))}" alt="">
        <div><b data-notr>${esc(n.name)}</b><small class="mu-th-title" data-notr>${esc(n.title)}</small><p class="mu-th-text" data-notr>${esc(n.text)}</p></div>
        <div class="mh-invite-btns"><button class="mu-primary" data-act="th-read" data-who="${esc(n.who)}">Answer</button></div></div>`;
}
function nudgeButton(g, w, n, c, i) {
    const short = c.id === 'help' && c.ok === false;
    return `<button class="${i === 0 ? 'mu-primary' : c.id === 'not' ? 'mu-ghost' : ''}" data-act="th-nudge" data-id="${esc(n.thread)}" data-c="${esc(c.id)}" ${short ? 'aria-disabled="true"' : ''}>${c.id === 'help' ? `<span data-notr>${esc(c.label)}</span>` : `<span>${esc(c.label)}</span>`}${c.price ? `<small>${esc(c.price)}${short ? ` · ${esc(haveWord(g, w))}` : ''}</small>` : ''}</button>`;
}
/** The answers under their text in the phone conversation with them (nothing when no last chance waits). */
export function nudgeAnswersHtml(g, w, avatar) {
    const n = nudgeAsk(g, w, avatar);
    if (!n)
        return '';
    return `<div class="mu-th-answers"><small class="mu-th-title" data-notr>${esc(n.title)}</small>
        <div class="mu-th-btns">${n.choices.map((c, i) => nudgeButton(g, w, n, c, i)).join('')}</div>
        ${n.last ? '<small>The last time they ask: Not now lets it end the way it would.</small>' : ''}</div>`;
}
/* ---------- the person's page ---------- */
const STATE_WORD = { 'under way': 'Under way', due: 'Waiting for you', waiting: 'Waiting to see if you can help', pending: 'Hangs on someone else', ended: 'Ended' };
/** "Their story" on the person's page: nothing until their secret is known. */
export function theirStoryHtml(g, w, avatar) {
    const s = storylineOf(g, w, avatar);
    if (!s)
        return '';
    const name = g.cast[avatar]?.name ?? '';
    const first = name.split(/\s+/)[0] || name;
    const live = s.state !== 'ended' && s.state !== 'under way';
    const stateLine = s.state === 'pending' && s.on ? `Hangs on ${s.on}'s storyline` : STATE_WORD[s.state];
    return `<section class="mu-th-story is-${s.state.replace(' ', '-')}"><h5>${icon('book')}<span>Their story</span></h5>
        <b data-notr>${esc(s.title)}</b>
        <small class="mu-th-state">${esc(stateLine)}</small>
        ${s.state === 'ended' && s.ending ? `<small>How it ended: <span data-notr>${esc(s.ending)}</span></small>` : ''}
        ${s.missing?.length ? `<small class="mu-th-help">What would help:</small><ul class="mu-th-miss">${s.missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${live ? `<button data-act="th-talk" data-id="${esc(s.thread)}" ${s.talk ? '' : 'aria-disabled="true"'}>${icon('chat')}<span>Talk about it</span></button>${s.talk ? '' : `<small class="mu-muted">${esc(`You need to be with ${first}.`)}</small>`}` : ''}</section>`;
}
/* ---------- the Help topic ---------- */
/** The Help app's "Storylines" topic (ui/help.ts adds it where the living system is on). */
export const STORYLINES_HELP = {
    title: 'Storylines',
    intro: 'Some people carry a story of their own: a debt, an exam, a lease, a leaving. It starts once you know them, runs on its own time, and in the end it waits for you.',
    items: [
        ['Starting', 'A storyline opens once you have met the person and you are friends, or you learn their secret, or something they ask for comes first. Until you know the secret, you only see signs of it. Once you do, their page in People shows "Their story".'],
        ['On its own time', 'It moves through its stages week by week, whether you are around or not.'],
        ['The deciding moment', 'When the stages are over and you are with them, a card asks what you will do: Help (with its price, and what you have if you are short), Now (a good ending is within reach), Wait (it lists what each way still needs) or Let it be (it ends the way it would). An unanswered card comes back in your next scene together.'],
        ['Last chances', 'If you wait, they come back to you about once a season: in person when you are together, or by text from the evening. Answer a text with Meet them, Help (when it works by text) or Not now; a text left three days counts as missed. After three last chances the story ends the way it would without you, never one of its good endings. A few stories instead cool off toward you, a friendship level down, and wait for you once more.'],
        ['Hanging on someone else', 'Some stories depend on how another one ends. They wait, and the card says so; you can still Help or Let it be from "Talk about it" on their page.'],
        ['Talk about it', 'On their page, when you are with them: brings the card back in this scene.'],
        ['How it ends', 'A story ends one way, and the news keeps it. Some people leave the maps when it does. Learning a secret and seeing a story to its end give life points.'],
        ['A second chance', "A story that didn't end well can begin again with A second chance, in the Goals app's Rewards. It starts over from its first stage, and what you knew of it stays known. What its ending changed stays, but someone it took away comes back. Their slot in the collection follows how it ends next time."],
    ],
};
/* ---------- what the buttons do ---------- */
const after = async (lines, ok) => {
    lines.forEach(t => toast(t, ok ? 'success' : 'warn'));
    if (ok) {
        refreshPrompt();
        saveGame();
        await syncScene();
    }
    notify();
};
Object.assign(ACT, {
    'th-decide': async (el) => {
        const c = S();
        if (!c)
            return;
        const r = answerDecide(c.g, c.w, el.dataset.id, el.dataset.c);
        await after(r.lines, r.ok);
    },
    'th-nudge': async (el) => {
        const c = S();
        if (!c)
            return;
        const r = answerNudge(c.g, c.w, el.dataset.id, el.dataset.c);
        await after(r.lines, r.ok);
    },
    // the small card: open the conversation where the answers are
    'th-read': (el) => { P.who = el.dataset.who; P.app = 'thread'; P.draft = ''; P.open = true; notify(); },
    'th-talk': (el) => {
        const c = S();
        if (!c)
            return;
        const r = talkAbout(c.g, c.w, el.dataset.id);
        if (!r.ok) {
            if (r.why)
                toast(r.why, 'warn');
            return;
        }
        refreshPrompt();
        saveGame();
        closePhone();
        notify();
    },
});
export const storylinesOn = (w) => systemOn(w, 'living');
