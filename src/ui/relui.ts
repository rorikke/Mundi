// Relationships on screen: the asking buttons on a person's card (ask out, propose, marry, break up, divorce), the
// milestone pop-up ("You and Samantha are now dating"), the end-of-day recap after sleeping (each person's bars
// moving, a new tier filling the bar and changing its color), and the work screen with its choices.
import { esc, game, notify, saveGame, toast, state, nowAbs } from '../core/store.js';
import type { Save } from '../core/store.js';
import { getWorld, systemOn, type WorldDef, type Occupation } from '../core/world.js';
import { sysOn } from '../sim/romance.js';
import { chat, quiet, sendCanned, setPrompt, thumb, speakerOf, turnsSince } from '../st/bridge.js';
import { momentsOf, dropMoment } from '../sim/moments.js';
import { ASK_WHAT } from '../sim/initiative.js';
import { setCooldown, YOU } from '../sim/rel.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
import { ASKS, canAsk, coolingDown, readiness, stayReadiness, forcedNo, tierNo, notYetAnswer, applyAnswer, pushTooSoon, endRelationship, romOf, friendTier, romanceTier, tierPct, labelToward, addRomance, slowedDown, FRIEND_TIERS, ROMANCE_TIERS, type AskKind, type Change, type Tier } from '../sim/romance.js';
import { bondOf, social, isPartner, textFrom } from '../sim/social.js';
import { visitAnswer, askToStay, visitOf, sayGoodbye, atTheDoor, letIn, visitWhen, nightsOf, visitsOn, type Visitor, type VisitNights, type VisitSleep } from '../sim/visitors.js';
import { myJob, hire, feeOf, waitDays, realDays, WORK_MODES, workShift, jobDef, rankOf, canWork, atWork, offScreen, promoNeeds, promoProgress, perfOf, pendingEvent, chooseEvent, dropEvent, shiftOn, shiftHours, scheduleOf, vacationLeft, sickNo, workRules, weekText, jobPlace, bookOff, callSick, chooseShift, whenText as shiftWhen, isFreelance, type WorkMode, type JobState, type ShiftTime } from '../sim/work.js';
import { placeOf } from '../sim/places.js';
import { skillName } from '../sim/hobbies.js';
import { hm } from '../sim/time.js';
import { tooTired, money } from '../sim/needs.js';
import { payOf } from '../sim/bills.js';
import { layTrack } from '../sim/tracks.js';
import { note } from '../sim/facts.js';
import { diaryTtsButton } from './addons.js';
import { INPUT } from './reg.js';
import { createCharacter, personaName } from '../st/bridge.js';
import { kidOf, stageOf, canCelebrate, celebrate, daysToBirthday, pregnancy, daysLeft, birthDue, conceive, welcomeBaby, romanceBlocked, STAGES } from '../sim/family.js';
import { resident, syncScene } from '../sim/game.js';
import { refreshPrompt } from '../sim/prompt.js';
import { diaryShown } from '../sim/diary.js';
import { sceneHere, roomNow, dropIn } from '../sim/homerooms.js';

/* ---------- the friendship bar, the same everywhere (card, phone, HUD) ---------- */

// Fills up within the current tier and starts again, in the tier's color, at each new tier (like The Sims).
export function relBar(avatar: string, romance = true): string {
    const g = game(); if (!g) return '';
    const b = bondOf(g, avatar); const ft = friendTier(b);
    const rt = romanceTier(g, avatar);
    // both bars, always (high romance with low friendship is a real state), unless romance can't be: off, family, a child
    return `<span class="mu-tierbar" title="${esc(ft.name)}"><i style="width:${tierPct(ft, b)}%;background:${ft.color}"></i></span>${romance && sysOn(g, 'romance') && !romanceBlocked(g, avatar) ? `<span class="mu-tierbar is-love" title="${esc(rt.name)}"><i style="width:${tierPct(rt, romOf(g, avatar).value)}%;background:${rt.color}"></i></span>` : ''}`;
}

// Under a person's name: their friendship tier, their romance tier or status, and the label from both ("In love").
export function relSubtitle(g: Save, avatar: string): string {
    const b = bondOf(g, avatar), rt = romanceTier(g, avatar);
    const lab = romOf(g, avatar).status !== 'none' && labelToward(g, avatar)?.id === 'platonic' ? null : labelToward(g, avatar);   // "platonic" can't describe someone you're seeing
    const slow = slowedDown(g, avatar);
    return `${esc(friendTier(b).name)}${rt.id !== 'none' && sysOn(g, 'romance') ? ` · <span class="mu-love-tag">${esc(rt.name)}</span>` : ''}${lab ? ` · <em class="mu-rel-label">${esc(lab.name)}</em>` : ''}${slow ? ` · <span class="mu-rel-slow" title="${slow === 'r' ? 'Their feelings have grown a lot lately: more will come, slowly, after some time.' : 'You have grown close quickly lately: more will come, slowly, after some time.'}">Needs some time</span>` : ''}`;
}

/* ---------- the buttons on a person's card ---------- */

export function romanceButtons(avatar: string): string {
    const g = game(); if (!g) return '';
    return `${visitRow(g, getWorld(g.world), avatar)}${loveButtons(g, avatar)}`;
}
function loveButtons(g: Save, avatar: string): string {
    // your child: their stage of life and the weekly birthday instead of any romance
    const k = kidOf(g, avatar);
    if (k) {
        const st = stageOf(k), last = k.stage >= STAGES.length - 1;
        return `<div class="mu-pc-love mu-pc-kid"><small class="mu-muted">👶 Your child · ${esc(st.name)}</small>
            ${canCelebrate(g, k) ? `<button data-act="kid-bday" data-who="${esc(avatar)}">🎂<span>Celebrate their birthday</span></button>`
            : last ? '' : `<small class="mu-muted">Next birthday in ${daysToBirthday(g, k)} day${daysToBirthday(g, k) === 1 ? '' : 's'}.</small>`}</div>`;
    }
    if (romanceBlocked(g, avatar) || !sysOn(g, 'romance')) return '';
    const r = romOf(g, avatar);
    const p = pregnancy(g);
    const kinds = (Object.keys(ASKS) as AskKind[]).filter(k => canAsk(g, avatar, k));
    const end = r.status === 'married' ? 'Ask for a divorce' : r.status === 'casual' ? 'Stop seeing each other' : r.status !== 'none' ? (r.status === 'engaged' ? 'Call off the engagement' : 'Break up') : '';
    const busy = !!ASK.avatar;
    return `<div class="mu-pc-love">
        ${kinds.map(k => `<button data-act="rm-ask" data-who="${esc(avatar)}" data-k="${esc(k)}" ${busy ? 'aria-disabled="true"' : ''}>${icon('heart')}<span>${ASKS[k].label}</span></button>`).join('')}
        ${end ? `<button class="mu-ghost mu-danger-text" data-act="rm-end" data-who="${esc(avatar)}">${icon('x')}<span>${end}</span></button>` : ''}
        ${p && p.partner === avatar ? `<small class="mu-pc-baby">👶 Expecting a baby · ${daysLeft(g) ? `${daysLeft(g)} day${daysLeft(g) === 1 ? '' : 's'} left` : 'any moment now'}</small>` : ''}
        ${coolingDown(g, avatar) ? '<small class="mu-muted">They need some time before you ask again.</small>' : ''}
    </div>`;
}

/* ---------- (plans) a friend staying over: asking, the doorbell, saying goodbye (sim/visitors.ts) ---------- */

// The open form: whose, how many nights, where they sleep.
const VIS = { who: '', nights: 2 as VisitNights, sleep: 'sofa' as VisitSleep, busy: false };
const NIGHT_CHOICES: [VisitNights, string][] = [[1, '1 night'], [2, '2 nights'], [3, '3 nights'], ['open', 'For a while']];
const visitWhat = (n: VisitNights) => (n === 'open' ? 'a while' : n === 1 ? 'the night' : `${n} nights`);
const ORDS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'];
/** Where a stay is at, in a few words ("Second night of 3 · until Friday at 10:00", "Arrives today at 19:00"). */
export function visitStatus(g: Save, v: Visitor): string {
    const t = visitWhen(g, v), now = nowAbs(g);
    if (now < v.from) return `Arrives ${t.arrives}`;
    if (!v.arrived) return 'On the way to your place';
    const n = Math.min(nightsOf(v), (v.nights ?? 0) + 1), word = ORDS[n - 1] ?? `Night ${n}`;
    return v.open ? `${word} night · until you say goodbye (${t.until} at most)` : `${word} night of ${nightsOf(v)} · until ${t.until}`;
}
/** The row on a person's card and their page in People: asking them to stay a few days, or how their stay goes. */
export function visitRow(g: Save, w: WorldDef | null, avatar: string): string {
    const r = g.cast[avatar];
    if (!w || !r || !r.met || !visitsOn(w)) return '';
    const v = visitOf(g, avatar);
    if (v) return `<div class="mu-pc-visit"><small class="mu-muted">${icon('home')} <span>${v.arrived ? 'Staying with you' : 'Coming to stay'}</span> · ${esc(visitStatus(g, v))}</small>
        <button class="mu-ghost" data-act="vis-bye" data-who="${esc(avatar)}">${icon('back')}<span>Say goodbye</span></button></div>`;
    const ans = visitAnswer(g, w, avatar);
    if (!ans.ok && (!ans.why || (bondOf(g, avatar) < 30 && !isPartner(g, avatar)))) return '';   // (not shown to people you barely know)
    return `<div class="mu-pc-visit"><button data-act="vis-open" data-who="${esc(avatar)}" ${ans.ok ? '' : 'aria-disabled="true"'}>${icon('home')}<span>Ask to stay a few days</span></button>${ans.ok ? '' : `<small class="mu-muted">${esc(ans.why)}</small>`}</div>`;
}
// The form (over everything, from a card, the radial menu or People): how many nights, where they sleep.
function visitFormHtml(): string {
    const g = game(); const r = g && VIS.who ? g.cast[VIS.who] : null;
    if (!g || !r) return '';
    return `<div class="mu-recap-veil" data-act="vis-cancel-bg"><section class="mu-recap mu-workpick mu-visitform mh-glass" role="dialog" aria-label="${esc(r.name)}">
        <h3><span>Ask</span> <span data-notr>${esc(r.name)}</span> <span>to stay</span></h3>
        <small class="mu-muted">How long</small>
        <div class="mu-chips">${NIGHT_CHOICES.map(([n, label]) => `<button class="mu-chip ${VIS.nights === n ? 'is-on' : ''}" data-act="vis-nights" data-v="${esc(String(n))}">${label}</button>`).join('')}</div>
        <small class="mu-muted">${VIS.nights === 'open' ? 'Until you say goodbye, a week at most.' : 'They keep their own job and days, going out from your place.'}</small>
        <small class="mu-muted">Where they sleep</small>
        <div class="mu-chips"><button class="mu-chip ${VIS.sleep === 'sofa' ? 'is-on' : ''}" data-act="vis-sleep" data-v="sofa">On the sofa</button><button class="mu-chip ${VIS.sleep === 'yours' ? 'is-on' : ''}" data-act="vis-sleep" data-v="yours">In your room</button></div>
        <div class="mu-row"><button class="mu-primary" data-act="vis-ask" data-who="${esc(r.avatar)}" ${VIS.busy ? 'aria-disabled="true"' : ''}>${icon('home')}<span>Ask them</span></button><button class="mu-ghost" data-act="vis-cancel">Cancel</button></div></section></div>`;
}
/** The doorbell (the HUD, under who is here): someone come to stay is at your door. */
export function doorbellHtml(g: Save, w: WorldDef): string {
    if (state.view !== 'scene') return '';
    const v = atTheDoor(g, w); const r = v && g.cast[v.avatar];
    if (!v || !r) return '';
    const what = v.open ? 'Come to stay for a while' : nightsOf(v) === 1 ? 'Come to stay the night' : `Come to stay ${nightsOf(v)} nights`;
    return `<aside class="mh-doorbell mh-glass" role="dialog" aria-label="${esc(r.name)}"><img src="${esc(thumb(r.avatar))}" alt=""><span><b><span data-notr>${esc(r.name)}</span> <span>is at the door</span></b><small>${esc(what)}</small></span>
        <button class="mu-primary" data-act="vis-door" data-who="${esc(r.avatar)}">Open the door</button><button class="mu-ghost" data-act="vis-later" data-who="${esc(r.avatar)}">Later</button></aside>`;
}
// The scene plays a decided moment (the engine already chose), then the line for the AI is taken back.
function playVisit(line: string, act: string) {
    setPrompt('mundi_visit', line, 0);
    if (!sendCanned(act)) toast('SillyTavern\'s message box was not found.', 'error');
    setTimeout(() => setPrompt('mundi_visit', ''), 60000);
}
async function askVisit(avatar: string) {
    const g = game(); const w = g && getWorld(g.world); const r = g && g.cast[avatar];
    if (!g || !w || !r || VIS.busy) return;
    const n = VIS.nights, sleep = VIS.sleep, what = visitWhat(n);
    const here = sceneHere(g, w).includes(r) && state.view === 'scene';
    const why = askToStay(g, w, avatar, n, sleep);
    VIS.who = '';
    if (why) { toast(why, 'info'); notify(); return; }
    const v = visitOf(g, avatar)!, when = visitWhen(g, v).arrives;
    const where = sleep === 'yours' ? "in {{user}}'s room" : 'on the sofa';
    saveGame(); refreshPrompt(); notify();
    if (here) {
        playVisit(`[{{user}} asks ${r.name} to come and stay at {{user}}'s place for ${what}. It is decided: ${r.name} says yes, and will sleep ${where}${v.from > nowAbs(g) ? `, coming over ${when} with their things` : ''}. Write ${r.name}'s answer.]`,
            `*asks ${r.name} if they'd like to come and stay at my place for ${what}*`);
        return;
    }
    // asked by phone: they answer by text
    VIS.busy = true;
    { const { P } = await import('./phone.js'); P.open = true; P.app = 'thread'; P.who = avatar; P.typing = avatar; }
    notify();
    try {
        await textFrom(g, w, avatar, `${r.name} happily agrees to come and stay at ${personaName()}'s place for ${what}, sleeping ${sleep === 'yours' ? `in ${personaName()}'s room` : 'on the sofa'}, and says they'll be there ${when}, in one short message.`,
            'Yes! I\'ll bring my things.', n === 'open' ? 'Do you want to come and stay at my place for a while?' : `Do you want to come and stay at my place for ${what}?`);
        toast(`${r.name} is coming to stay (${when}).`, 'success');
    } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
    { const { P } = await import('./phone.js'); P.typing = ''; }
    VIS.busy = false; saveGame(); notify();
}

/* ---------- asking: the scene plays it, then the engine reads the answer ---------- */

// An ask in progress: a romance ask, or staying the night ('stay', with what to do on a yes).
type Asked = AskKind | 'stay';
const ASK = { avatar: '', name: '', kind: 'date' as Asked, from: 0, round: 0, start: 0, mine: true, onYes: null as null | (() => void) };
const END = { avatar: '' };
const askWhat = (k: Asked) => k === 'date' ? 'to be a couple' : k === 'casual' ? 'to keep things casual between them' : k === 'stay' ? (ASK.mine ? 'to stay the night' : 'to let them sleep at their place tonight')
    : k === 'baby' ? 'about trying for a baby together' : k === 'propose' ? 'to marry them' : 'to set the date and get married';
const ASK_FACT: Record<AskKind, string> = { casual: '{u} asked {0} to keep things casual.', date: '{u} asked {0} to be a couple.', propose: '{u} proposed to {0}.', marry: '{u} asked {0} to set the date and get married.', baby: '{u} asked {0} about trying for a baby.' };

function startAsk(g: Save, avatar: string, kind: Asked, from: number) {
    const r = g.cast[avatar];
    Object.assign(ASK, { avatar, name: r.name, kind, from, round: 0, start: from });
    // the question itself is a fact (the diary and the Journal know it was asked, whatever the answer)
    if (kind !== 'stay') note(g, ASK_FACT[kind], [r.name], [avatar], g.player.loc, kind === 'baby' ? 'family' : 'love');
    saveGame();
    setPrompt('mundi_ask', kind === 'stay' ? stayReadiness(g, avatar, r.name, ASK.mine) : readiness(g, avatar, r.name, kind), 0);
}
// Asking someone to stay the night (or to sleep at theirs): the scene plays it, then the same yes/no question; a yes
// runs `onYes`.
export function askStay(avatar: string, mine: boolean, line: string, onYes: () => void): boolean {
    const g = game(); if (!g || ASK.avatar || !g.cast[avatar]) return false;
    Object.assign(ASK, { mine, onYes });
    startAsk(g, avatar, 'stay', chat().length);
    if (!sendCanned(line)) { Object.assign(ASK, { avatar: '', onYes: null }); setPrompt('mundi_ask', ''); return false; }
    notify();
    return true;
}
async function ask(avatar: string, kind: AskKind) {
    const g = game(); if (!g || ASK.avatar) return;
    const r = g.cast[avatar]; if (!r) return;
    if (coolingDown(g, avatar)) { toast(pushTooSoon(g, avatar, r.name), 'warn'); saveGame(); notify(); return; }
    startAsk(g, avatar, kind, chat().length);
    if (!sendCanned(ASKS[kind].line(r.name))) { Object.assign(ASK, { avatar: '' }); setPrompt('mundi_ask', ''); toast('SillyTavern\'s message box was not found.', 'error'); }
    notify();
}

// Asked in your own words ("will you be my girlfriend?", "quer namorar comigo?"): the same as the button.
const ASK_WORDS: [AskKind, RegExp][] = [
    ['propose', /\b(marry me|will you marry|be my (wife|husband)|casa comigo|quer casar comigo|aceita casar|se casar comigo|c[aá]sate conmigo|casarte conmigo)\b/i],
    ['date', /\b(be my (girl ?friend|boy ?friend|partner|girl|boy)|date me|be (a|in a) couple|be together\?|go steady|namorar comigo|namora comigo|quer namorar|ser minha namorada|ser meu namorado|ser (o )?meu par|sermos um casal|ser mi novi[ao]|ser novios|salir conmigo en serio)\b/i],
];
export function detectAsk(text: string) {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || ASK.avatar || !text) return;
    const hit = ASK_WORDS.find(([, re]) => re.test(text)); if (!hit) return;
    const people = sceneHere(g, w).filter(r => canAsk(g, r.avatar, hit[0]));
    if (!people.length) return;
    const low = text.toLowerCase();
    const solo = String((social(g) as any).solo ?? '');
    const r = people.find(p => low.includes(p.name.toLowerCase().split(/\s+/)[0])) ?? people.find(p => p.avatar === solo) ?? (people.length === 1 ? people[0] : null);
    if (!r || coolingDown(g, r.avatar)) return;
    startAsk(g, r.avatar, hit[0], chat().length);
    notify();
}

// Called when a reply finishes (index.ts): if someone was just asked, find their answer and let the engine apply it.
export async function checkAsk() {
    const g = game();
    if (!ASK.avatar || !g) return;
    const list = chat();
    // their reply: by name (ignoring case and extra words), or the only other person who answered
    const others = list.slice(ASK.from).filter((m: any) => !m.is_user && !m.is_system && !m.extra?.mundi_narrator);
    const low = ASK.name.toLowerCase().trim(), first = low.split(/\s+/)[0];
    const named = (m: any) => { const n = String(m.name ?? '').toLowerCase().trim(); return n === low || n.split(/\s+/)[0] === first; };
    const speakers = new Set(others.map((m: any) => String(m.name ?? '')));
    const reply = [...others].reverse().find(named) ?? (speakers.size === 1 ? others.at(-1) : undefined);
    // no answer from them yet: after three turns of the scene without one, the question is let go
    if (!reply) { if (turnsSince(ASK.from) >= 3) { setPrompt('mundi_ask', ''); ASK.avatar = ''; notify(); } return; }
    const { avatar, name, kind, onYes } = ASK;
    // everything since the question (their words, and yours: a story direction like "she says yes" counts too)
    const clean = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const said = list.slice(Math.max(0, ASK.start - 1)).filter((m: any) => !m.is_system)
        .map((m: any) => `${m.is_user ? `${personaName()} (the player)` : String(m.name ?? '')}: ${clean(m.mes)}`).join('\n').slice(-2500);
    let answer: 'yes' | 'no' | 'maybe' = 'maybe';
    try {
        const out = (await quiet(`${personaName()} asked ${name} ${askWhat(kind)}. This is the scene since then (lines by the player may be story directions that decide what happens):\n"""\n${said}\n"""\n\nHas ${name} accepted? Reply with one word only: yes (accepted), no (refused), or maybe (no clear answer yet, or asked for time).`, 20,
            'You read a scene and say whether the person accepted. One word: yes, no, or maybe.', { lane: 'now' })).toLowerCase();
        answer = /\byes\b/.test(out) ? 'yes' : /\bno\b/.test(out) ? 'no' : 'maybe';
    } catch { /* not sure: treat it as "maybe" */ }
    if (answer === 'maybe' && ASK.round < 2) {
        // not clear yet: the question stays open for a couple more replies, and they are nudged to answer
        ASK.round++; ASK.from = list.length;
        setPrompt('mundi_ask', `[${name} has not clearly answered {{user}}'s question yet (${askWhat(kind)}). In this reply ${name} gives a clear answer, in their own way: yes, no, or that they need time to think.]`, 0);
        toast(`Waiting for ${name}'s answer…`, 'info'); notify(); return;
    }
    ASK.avatar = ''; ASK.onYes = null; setPrompt('mundi_ask', '');
    for (const m of momentsOf(g, avatar)) if (m.kind === 'ask') dropMoment(g, m.id);   // a question they meant to ask you is answered too
    if (kind === 'stay') {   // no answer yet after a few tries counts as a no
        if (answer === 'yes') { onYes?.(); toast(ASK.mine ? `${name} is staying the night.` : `You are staying at ${name}'s tonight.`, 'success'); }
        else toast(`${name} said no.`, 'info');
        saveGame(); notify(); return;
    }
    if (tierNo(g, avatar, kind)) { const msg = notYetAnswer(g, avatar, name, kind); saveGame(); toast(msg, 'info'); notify(); return; }   // (museum) their tier: "not yet"
    if (forcedNo(g, avatar, kind)) answer = 'no';   // "only with a partner": the engine's own no
    let msg = applyAnswer(g, avatar, name, kind, answer);
    if (kind === 'baby' && answer === 'yes') {
        msg = conceive(g, avatar, name);
        saveGame(); refreshPrompt();
        if (pregnancy(g)) milestone(avatar, msg); else toast(msg, 'info');
        notify(); return;
    }
    saveGame();
    if (answer === 'yes') milestone(avatar, msg); else toast(msg, answer === 'no' ? 'warn' : 'info');
    notify();
}
export const asking = () => ASK.avatar ? { avatar: ASK.avatar, kind: ASK.kind } : null;

/* ---------- they asked you (A-2): did you accept? ---------- */

const REV = { busy: false };
// After each of your lines: someone who was going to ask you something in this scene, and has spoken since, may have
// asked; the AI says whether, and what you answered. Three of your lines without an answer, and it's left to the
// scene's verdict. A yes is exactly your own accepted ask; a no costs them a little romance and starts the cooldown.
export async function checkReverse() {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || REV.busy || ASK.avatar) return;
    const m = momentsOf(g).find(x => x.kind === 'ask' && x.sent !== undefined && (x.tries ?? 0) < 3);
    const r = m && g.cast[m.who]; if (!m || !r || !m.ask) return;
    const since = chat().slice(m.sent).filter((x: any) => !x.is_system);
    const theirs = since.findIndex((x: any) => !x.is_user && speakerOf(x) === m.who);
    if (theirs < 0 || !since.slice(theirs + 1).some((x: any) => x.is_user)) return;
    const k = m.ask, me = personaName();
    const clean = (t: unknown) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const said = since.map((x: any) => `${x.is_user ? `${me} (the player)` : String(x.name ?? '')}: ${clean(x.mes)}`).join('\n').slice(-2500);
    let answer: 'yes' | 'no' | 'maybe' | 'notyet' = 'notyet';
    REV.busy = true;
    try {
        const out = (await quiet(`${r.name} was going to ask ${me} ${ASK_WHAT[k]} in this scene. This is the scene since then (lines by the player may be story directions that decide what happens):\n"""\n${said}\n"""\n\nHas ${r.name} asked, and what did ${me} answer? Reply with one word only: yes (${me} accepted), no (${me} refused), maybe (no clear answer, or ${me} asked for time), or notyet (${r.name} has not asked yet).`, 20,
            'You read a scene and say whether a question was asked and answered. One word: yes, no, maybe or notyet.', { lane: 'now' })).toLowerCase();
        answer = /not\s*yet/.test(out) ? 'notyet' : /\byes\b/.test(out) ? 'yes' : /\bno\b/.test(out) ? 'no' : /\bmaybe\b/.test(out) ? 'maybe' : 'notyet';
    } catch { /* not sure: wait for the next line */ } finally { REV.busy = false; }
    if (answer === 'notyet') { m.tries = (m.tries ?? 0) + 1; saveGame(); return; }
    dropMoment(g, m.id);
    if (answer === 'yes') {
        if (k === 'stay' || k === 'staytheirs') { const { beginStay } = await import('./events.js'); beginStay(g, r.avatar, k === 'stay'); toast(k === 'stay' ? `${r.name} is staying the night.` : `You are staying at ${r.name}'s tonight.`, 'success'); }
        else {
            let msg = applyAnswer(g, r.avatar, r.name, k, 'yes');
            if (k === 'baby') msg = conceive(g, r.avatar, r.name);
            if (k !== 'baby' || pregnancy(g)) milestone(r.avatar, msg); else toast(msg, 'info');
        }
    } else if (answer === 'no') {
        addRomance(g, r.avatar, -3); setCooldown(g, r.avatar, YOU, nowAbs(g) + 3 * 1440);
        note(g, '{u} turned down {0}.', [r.name], [r.avatar], g.player.loc, 'love');
        toast(`You said no to ${r.name}.`, 'info');
    }
    saveGame(); refreshPrompt(); notify();
}

/* ---------- a milestone ---------- */

const MS = { avatar: '', text: '', until: 0 };
export function milestone(avatar: string, text: string) { Object.assign(MS, { avatar, text, until: Date.now() + 4200 }); setTimeout(notify, 4300); notify(); }
function milestoneHtml() {
    if (Date.now() > MS.until) return '';
    return `<div class="mu-milestone" data-act="ms-close"><div class="mu-milestone-card"><img src="${esc(thumb(MS.avatar))}" alt=""><b>${esc(MS.text)}</b>${icon('heart')}</div></div>`;
}

/* ---------- the end-of-day recap ---------- */

const DAY = { day: 0, changes: [] as Change[], open: false };
export function showDayRecap(day: number, changes: Change[]) {
    const g = game(); const entry = g && ((g as any).journalProse ?? {})[day];
    if (!changes.length && !entry) return;
    Object.assign(DAY, { day, changes, open: true }); notify();
}

// While the night's diary is being written: a "writing the diary" screen after the night, with a way to skip it.
const WAIT = { day: 0, on: false, skipped: false, done: -1 };
export function diaryWaiting(day: number) { if (WAIT.done === day) return; Object.assign(WAIT, { day, on: true, skipped: false }); notify(); }
export function diaryReady(day: number, changes: Change[], ok: boolean) {
    const skipped = WAIT.skipped; WAIT.on = false; WAIT.done = day;
    if (ok) showDayRecap(day, changes);
    else notify();
    void skipped;
}
function waitHtml() {
    if (!WAIT.on || WAIT.skipped) return '';
    return `<div class="mu-recap-veil mu-diary-wait"><section class="mu-recap mh-glass"><span class="mu-spin"></span><h3>Writing your diary…</h3>
        <p class="mu-muted">The day ${WAIT.day} is becoming a diary entry. Then you will see how the day went with everyone.</p>
        <button class="mu-ghost" data-act="diary-skip">Skip and keep playing</button></section></div>`;
}

// One bar: from its old value to the new one; a new tier fills the bar up, empties it and changes its color.
function animBar(label: string, t0: Tier, t1: Tier, v0: number, v1: number) {
    const up = t1.lo > t0.lo, down = t1.lo < t0.lo;
    const a = tierPct(t0, v0), b = tierPct(t1, v1);
    const cls = up ? 'is-up' : down ? 'is-down' : v1 > v0 ? 'is-more' : v1 < v0 ? 'is-less' : '';
    return `<div class="mu-rb ${cls}"><span class="mu-rb-head"><small>${label}</small><b style="color:${t1.color}">${esc(t1.name)}</b>${up ? '<em>New level!</em>' : down ? '<em class="is-bad">Went down</em>' : ''}</span>
        <span class="mu-rb-bar" style="--a:${a}%;--b:${b}%;--c0:${t0.color};--c1:${t1.color}"><i></i></span></div>`;
}
function recapHtml() {
    const g = game();
    if (!DAY.open || !g) return '';
    return `<div class="mu-recap-veil"><section class="mu-recap mh-glass" role="dialog" aria-label="How the day went">
        <header><small>Day ${DAY.day}</small><h3>How the day went</h3></header>
        ${((g as any).journalProse ?? {})[DAY.day] ? `<div class="mu-recap-diary"><blockquote data-notr>${esc(diaryShown(g, DAY.day))}</blockquote>${diaryTtsButton(DAY.day)}</div>` : ''}
        <div class="mu-recap-list">${DAY.changes.map((c, i) => {
            const fT0 = friendTier(c.f0), fT1 = friendTier(c.f1);
            const rT0 = romanceTier(g, c.avatar, c.r0), rT1 = romanceTier(g, c.avatar, c.r1);
            return `<article class="mu-recap-p" style="--d:${i * 0.35}s"><img src="${esc(thumb(c.avatar))}" alt="">
                <div><b data-notr>${esc(c.name)}</b><p data-notr>${esc(c.why)}</p>
                ${animBar('Friendship', fT0, fT1, c.f0, c.f1)}
                ${c.r0 || c.r1 || romOf(g, c.avatar).status !== 'none' ? animBar('Romance', rT0, rT1, c.r0, c.r1) : ''}</div></article>`;
        }).join('')}</div>
        <button class="mu-primary" data-act="recap-close">Continue</button></section></div>`;
}

/* ---------- the work screen ---------- */

// How you spend a shift (like The Sims), with your shift's hours, your performance and what the next rank asks for.
// After a shift, something that happened at work waits here for your choice.
const WORK = { open: false };
export const openWork = () => { WORK.open = true; notify(); };
export const perfWord = (n: number) => (n >= 80 ? 'excellent' : n >= 60 ? 'good' : n >= 40 ? 'fair' : n >= 25 ? 'poor' : 'very poor');
/** What the next promotion still asks for, in a line ('' at the top). */
export function nextRankLine(g: Save, w: WorldDef, o: Occupation): string {
    const p = promoNeeds(g, w, o); if (!p) return '';
    if (p.ready) return `Next: ${p.rank.name} (ready after this shift)`;
    const skills = p.skills.map(s => `${s.name} ${s.need} (you: ${s.have})`).join(', ');
    return `Next: ${p.rank.name} · ${promoProgress(p)}% of the time${skills ? ` · ${skills}` : ''}${p.perf > perfOf(g) ? ` · performance ${p.perf}` : ''}${p.traits.length && p.missing.includes(p.traits.join(' or ')) ? ` · ${p.traits.join(' or ')}` : ''}`;
}
// The shift as the work button and the work screen say it.
export function shiftLabel(g: Save, w: WorldDef, o: Occupation): { ok: boolean; text: string } {
    const c = canWork(g, w, o);
    if (c.kind === 'overtime') return { ok: true, text: 'Overtime · +25% pay' };
    if (c.kind === 'none') return { ok: false, text: c.why ?? '' };
    const s = c.shift!, wait = s.start - nowAbs(g);
    return { ok: true, text: `${hm(s.start % 1440)}–${hm(s.end % 1440)}${c.early ? ` · starts in ${wait} min` : c.late ? ' · you are late' : ''}` };
}
/** The work button where you can work (at your rank's place, or anywhere for an off-screen job). */
export function workButton(g: Save, w: WorldDef): string {
    const o = myJob(g, w);
    if (!o || !systemOn(w, 'jobs') || !atWork(g, w, o) || isFreelance(g, w)) return '';   // (a freelancer has no shifts)
    const l = shiftLabel(g, w, o);
    return `<button class="mh-act is-work mh-glass ${offScreen(w, o) ? 'is-outing' : ''}" data-act="work" ${l.ok ? '' : 'aria-disabled="true"'}><i>${icon('briefcase')}</i><b>${offScreen(w, o) ? 'Go to work' : 'Work a shift'}</b><small>${esc(l.text)}</small></button>`;
}
// Your shifts this week (also in the Calendar and the Jobs app): days off to book or give back, calling in sick, and
// the shift you'd rather work in a job worked round the clock.
export function workWeekHtml(g: Save, w: WorldDef): string {
    const o = myJob(g, w); if (!o || !systemOn(w, 'jobs') || isFreelance(g, w)) return '';   // (freelance: no work week)
    const j = g.player.job as JobState, now = nowAbs(g);
    const list: ShiftTime[] = [];
    for (let d = g.day - 1; d <= g.day + 6; d++) { const s = shiftOn(g, w, o, d); if (s && s.end - 60 > now) list.push(s); }
    const vac = vacationLeft(g, w), sick = sickNo(g, w), shifts = scheduleOf(o).shifts ?? [];
    const mine = shiftHours(g, o);
    const row = (s: ShiftTime) => {
        const off = j.off?.[s.day], done = (j.worked ?? []).includes(s.day);
        // (adult) a raid shut the place for the week: nothing to work or take off
        return `<div class="mu-ph-job"><span><b>${esc(shiftWhen(g, s))}</b><small>${done ? 'Worked ✓' : off === 'vacation' ? 'Day off' : off === 'sick' ? 'Called in sick' : off === 'closed' ? 'Closed (raid)' : esc(placeOf(g, w, offScreen(w, o) ? '' : jobPlace(g, o))?.name ?? (offScreen(w, o) ? 'off-screen' : ''))}</small></span>
            ${done || off === 'sick' || off === 'closed' ? '' : `<button class="mu-ghost" data-act="wk-off" data-day="${s.day}" ${off || (vac >= 1 && s.start > now) ? '' : 'aria-disabled="true"'}>${off ? 'Work it' : 'Take the day off'}</button>`}</div>`;
    };
    return `<section class="mu-workweek"><h4>${icon('briefcase')} Work this week</h4>
        <small class="mu-muted">${esc(o.name)} · ${esc(weekText(g, w, o))}</small>
        ${shifts.length > 1 ? `<div class="mu-chips">${shifts.map(x => `<button class="mu-chip ${x.id === mine.id ? 'is-on' : ''}" data-act="wk-shift" data-id="${esc(x.id)}">${esc(x.name ?? x.id)} ${hm(Math.round(x.from * 60) % 1440)}–${hm(Math.round(x.to * 60) % 1440)}</button>`).join('')}</div>` : ''}
        ${list.map(row).join('') || '<p class="mu-muted">No shifts this week.</p>'}
        <small class="mu-muted">Vacation days: ${vac === Infinity ? 'as many as you like' : vac}${workRules(g, w).vacation ? ` (one more every ${workRules(g, w).vacation} days)` : ''}</small>
        <button data-act="wk-sick" ${sick ? `aria-disabled="true" title="${esc(sick)}"` : ''}>${icon('heart')}<span>Call in sick</span></button></section>`;
}
function workHtml() {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w) return '';
    const job = jobDef(w, g.player.job?.id); if (!job) return '';
    const ev = pendingEvent(g, w);
    if (ev) return `<div class="mu-recap-veil"><section class="mu-recap mu-workpick mh-glass" role="dialog" aria-label="At work">
        <header><small>${esc(job.name)} · at work</small><h3>${esc(ev.ev.setup)}</h3></header>
        <div class="mu-work-modes">${ev.choices.map(x => `<button class="mu-work-mode" data-act="work-ev" data-i="${x.i}"><b>${esc(x.c.label)}</b>${x.c.roll ? `<small>🎲 ${esc(x.c.roll.skill ? skillName(w, x.c.roll.skill) : 'Luck')} against ${esc(String(x.c.roll.dc))}</small>` : ''}</button>`).join('')}</div>
        <button class="mu-ghost" data-act="work-ev-skip">Let it go</button></section></div>`;
    if (!WORK.open) return '';
    const rank = rankOf(g, job), perf = perfOf(g), l = shiftLabel(g, w, job), next = nextRankLine(g, w, job);
    return `<div class="mu-recap-veil" data-act="work-cancel-bg"><section class="mu-recap mu-workpick mh-glass" role="dialog" aria-label="Work">
        <header><small>${esc(job.name)} · ${esc(rank.name)} · ${esc(l.text)}</small><h3>How will you work today?</h3></header>
        ${systemOn(w, 'jobs') ? `<div class="mu-work-perf"><small>Performance: ${perf} (${perfWord(perf)})</small><span class="mu-bond"><i style="width:${perf}%"></i></span>${next ? `<small class="mu-muted">${esc(next)}</small>` : ''}</div>` : ''}
        <div class="mu-work-modes">${WORK_MODES.map(m => `<button class="mu-work-mode" data-act="work-go" data-mode="${esc(m.id)}"><i>${m.icon}</i><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></button>`).join('')}</div>
        <button class="mu-ghost" data-act="work-cancel">Not now</button></section></div>`;
}

/* ---------- the birth ---------- */

const BIRTH = { name: '', busy: false };
function birthHtml() {
    const g = game(); if (!g || !birthDue(g) || DAY.open) return '';
    const p = pregnancy(g)!;
    return `<div class="mu-recap-veil"><section class="mu-recap mu-birth mh-glass" role="dialog" aria-label="The baby is here">
        <header><small>Day ${g.day}</small><h3>👶 The baby is here!</h3></header>
        <p>You and <b data-notr>${esc(p.name)}</b> are parents now. What will you call them?</p>
        <input type="text" class="text_pole" placeholder="The baby's name" value="${esc(BIRTH.name)}" data-input="birth-name" data-focus="birth-name" maxlength="40">
        <small class="mu-muted">They become a person of this world and live with you. You can give them a picture in the Library.</small>
        <button class="mu-primary" data-act="birth-go" ${BIRTH.name.trim() && !BIRTH.busy ? '' : 'aria-disabled="true"'}>${BIRTH.busy ? 'One moment…' : 'Welcome them'}</button></section></div>`;
}

/* ---------- (job tracks) the track you'll work on, picked once when hired ---------- */

const PICK = { job: '', list: [] as { id: string; name: string }[] };
/** `hire()` asked for a pick (`pick`): the choice opens over the screen, and hiring runs again with it. */
export function askTrack(job: string, list: { id: string; name: string }[]) { PICK.job = job; PICK.list = list; notify(); }
function trackPickHtml(): string {
    const g = game(); const w = g && getWorld(g.world); const o = g && w && PICK.job ? jobDef(w, PICK.job) : null;
    if (!g || !w || !o) return '';
    const line = (id: string) => {
        const t = layTrack(o, id), fee = feeOf(g, w, t), wait = waitDays(g, t);
        return `${money(w, payOf(g, t.ranks[0].pay))}–${money(w, payOf(g, t.ranks.at(-1)!.pay))}/h · ${realDays(t, t.ranks[0])} ${realDays(t, t.ranks[0]) === 1 ? 'day' : 'days'} a week to start${fee ? ` · a fee of ${money(w, fee)}` : ''}${wait ? ` · first shift ${wait} ${wait === 1 ? 'day' : 'days'} after signing` : ''}`;
    };
    return `<div class="mu-recap-veil" data-act="tp-cancel-bg"><section class="mu-recap mu-workpick mu-trackpick mh-glass" role="dialog" aria-label="Choose a track">
        <header><small>${esc(o.name)}</small><h3>Which track will you work on?</h3></header>
        <p class="mu-muted">Each has its own ranks, pay and hours. It can't be changed later.</p>
        <div class="mu-work-modes">${PICK.list.map(t => `<button class="mu-work-mode" data-act="tp-pick" data-id="${esc(t.id)}"><b>${esc(t.name)}</b><small>${esc(line(t.id))}</small></button>`).join('')}</div>
        <button class="mu-ghost" data-act="tp-cancel">Not now</button></section></div>`;
}
Object.assign(ACT, {
    'tp-cancel': () => { PICK.job = ''; notify(); },
    'tp-cancel-bg': (el, e) => { if (e.target === el) { PICK.job = ''; notify(); } },
    'tp-pick': (el) => {
        const g = game(); const w = g && getWorld(g.world); const job = PICK.job; PICK.job = '';
        if (!g || !w || !job) { notify(); return; }
        const r = hire(g, w, job, el.dataset.id!);
        toast(r.text, r.ok ? 'success' : 'warn'); saveGame(); notify();
    },
});

export function relOverlays() { return `${visitFormHtml()}${trackPickHtml()}${workHtml()}${waitHtml()}${recapHtml()}${birthHtml()}${milestoneHtml()}`; }

Object.assign(INPUT, { 'birth-name': (el) => { BIRTH.name = el.value; notify(); } });

Object.assign(ACT, {
    'vis-open': (el) => { const g = game(); const who = el.dataset.who!; Object.assign(VIS, { who, nights: 2, sleep: g && isPartner(g, who) ? 'yours' : 'sofa' }); notify(); },
    'vis-cancel': () => { VIS.who = ''; notify(); },
    'vis-cancel-bg': (el, e) => { if (e.target === el) { VIS.who = ''; notify(); } },
    'vis-nights': (el) => { const v = el.dataset.v!; VIS.nights = v === 'open' ? 'open' : (Number(v) as VisitNights); notify(); },
    'vis-sleep': (el) => { VIS.sleep = el.dataset.v === 'yours' ? 'yours' : 'sofa'; notify(); },
    'vis-ask': (el) => askVisit(el.dataset.who!),
    'vis-bye': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const r = g.cast[el.dataset.who!], here = !!r && state.view === 'scene' && sceneHere(g, w).includes(r);
        const t = sayGoodbye(g, el.dataset.who!);
        if (!t) return;
        toast(t, 'info'); saveGame(); refreshPrompt();
        if (here) playVisit(`[{{user}} says goodbye to ${r.name}, whose stay at {{user}}'s place is over. ${r.name} gathers their things and leaves. Write the goodbye.]`, `*says goodbye to ${r.name}*`);
        void syncScene(); notify();
    },
    'vis-door': (el) => {
        const g = game(); const r = g && g.cast[el.dataset.who!];
        if (!g || !r || !letIn(g, r.avatar)) return;
        { const w = getWorld(g.world); if (w && roomNow(g, w)) dropIn(g, w, r.avatar); }   // (homerooms) they come in to where you are
        saveGame(); refreshPrompt(); notify();
        playVisit(`[The doorbell: ${r.name} has arrived at {{user}}'s place with their things, to stay. {{user}} opens the door. Write ${r.name} at the door, coming in.]`, '*opens the door*');
    },
    'vis-later': (el) => {
        const g = game(); const r = g && g.cast[el.dataset.who!];
        if (!g || !r || !letIn(g, r.avatar)) return;
        toast(`${r.name} came in and settled in.`, 'info'); saveGame(); refreshPrompt(); notify();
    },
    'rm-ask': (el) => ask(el.dataset.who!, el.dataset.k as AskKind),
    'rm-end': (el) => { END.avatar = el.dataset.who!; notify(); },
    'rm-end-no': () => { END.avatar = ''; notify(); },
    'rm-end-yes': () => {
        const g = game(); const r = g && g.cast[END.avatar]; END.avatar = '';
        if (!g || !r) return;
        const was = romOf(g, r.avatar).status;
        const msg = endRelationship(g, r.avatar, r.name); saveGame();
        if (msg) {
            toast(msg, 'warn');
            // the scene plays the moment (the engine already decided it)
            if (state.view === 'scene') { setPrompt('mundi_ask', `[{{user}} is ending the relationship with ${r.name}${was === 'married' ? ' (asking for a divorce)' : ''}. It is decided. Write ${r.name}'s reaction.]`, 0); sendCanned(`*${was === 'married' ? `tells ${r.name} they want a divorce` : `breaks up with ${r.name}`}*`); setTimeout(() => setPrompt('mundi_ask', ''), 60000); }
        }
        notify();
    },
    'ms-close': () => { MS.until = 0; notify(); },
    'diary-skip': () => { WAIT.skipped = true; toast('The diary is still being written. "How the day went" will show up when it is ready.', 'info'); notify(); },
    'birth-go': async () => {
        const g = game(); const w = g && getWorld(g.world); const p = g && pregnancy(g);
        const name = BIRTH.name.trim();
        if (!g || !w || !p || !name || BIRTH.busy) return;
        BIRTH.busy = true; notify();
        try {
            const me = personaName();
            const avatar = await createCharacter({ name, description: `${name} is the child of ${me} and ${p.name}, born in ${w.name}.`,
                tags: ['Mundi'], extensions: { mundi: { world: w.id, child: true } } });
            const taken = new Set<string>();
            welcomeBaby(g, w, avatar, name, resident(w, avatar, taken));
            BIRTH.name = '';
            saveGame(); await syncScene(); refreshPrompt();
            milestone(avatar, `Welcome, ${name}!`);
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        BIRTH.busy = false; notify();
    },
    'kid-bday': (el) => {
        const g = game(); const w = g && getWorld(g.world); const k = g && kidOf(g, el.dataset.who!);
        if (!g || !w || !k) return;
        const msg = celebrate(g, w, k); if (!msg) return;
        saveGame(); refreshPrompt();
        milestone(k.avatar, `🎂 ${msg}`);
        if (state.view === 'scene') { setPrompt('mundi_ask', `[{{user}} is celebrating ${k.name}'s birthday. ${k.name} is now ${stageOf(k).desc}. Write the moment.]`, 0); sendCanned(`*celebrates ${k.name}'s birthday*`); setTimeout(() => setPrompt('mundi_ask', ''), 60000); }
        notify();
    },
    'recap-close': () => { DAY.open = false; notify(); },
    'work-cancel': () => { WORK.open = false; notify(); },
    'work-cancel-bg': (el, e) => { if (e.target === el) { WORK.open = false; notify(); } },
    'work-go': async (el) => {
        WORK.open = false;
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const job = jobDef(w, g.player.job?.id); if (!job) return;
        const tired = tooTired(g, w, job.cost ?? {}, 'work a shift'); if (tired) { toast(tired, 'warn'); notify(); return; }
        const { finishWork } = await import('./map.js');
        await finishWork(workShift(g, w, el.dataset.mode as WorkMode), job.name);
    },
    'work-ev': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        chooseEvent(g, w, Number(el.dataset.i)).forEach((m, i) => toast(m, i ? 'success' : 'info'));
        saveGame(); refreshPrompt(); notify();
    },
    'work-ev-skip': () => { const g = game(); if (g) { dropEvent(g); saveGame(); } notify(); },
    'wk-off': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; const m = bookOff(g, w, Number(el.dataset.day)); if (m) toast(m, 'info'); saveGame(); notify(); },
    'wk-sick': () => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; const m = callSick(g, w); if (m) toast(m, 'info'); saveGame(); refreshPrompt(); notify(); },
    'wk-shift': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; const m = chooseShift(g, w, el.dataset.id!); if (m) toast(m, 'success'); saveGame(); notify(); },
});

// the confirmation for ending a relationship
export function endConfirmHtml() {
    const g = game(); const r = g && END.avatar ? g.cast[END.avatar] : null;
    if (!g || !r) return '';
    const st = romOf(g, r.avatar).status;
    return `<div class="mu-dlg-veil is-fixed" data-act="rm-end-no"></div><div class="mu-panel mu-confirm" role="dialog"><h3>${st === 'married' ? `Divorce ${esc(r.name)}?` : `End it with ${esc(r.name)}?`}</h3>
        <p class="mu-muted">Your romance ends and your friendship takes a hit. ${esc(r.name)} will remember it.</p>
        <div class="mu-row"><button class="mu-danger" data-act="rm-end-yes">${st === 'married' ? 'Ask for a divorce' : 'End it'}</button><button data-act="rm-end-no">Cancel</button></div></div>`;
}
void bondOf; void FRIEND_TIERS; void ROMANCE_TIERS;
