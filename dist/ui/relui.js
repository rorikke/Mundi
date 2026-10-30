// Relationships on screen: the asking buttons on a person's card (ask out, propose, marry, break up, divorce), the
// milestone pop-up ("You and Samantha are now dating"), the end-of-day recap after sleeping (each person's bars
// moving, a new tier filling the bar and changing its color), and the work screen with its choices.
import { esc, game, notify, saveGame, toast, state, nowAbs } from '../core/store.js';
import { getWorld, systemOn } from '../core/world.js';
import { sysOn } from '../sim/romance.js';
import { chat, quiet, sendCanned, setPrompt, thumb, speakerOf } from '../st/bridge.js';
import { momentsOf, dropMoment } from '../sim/moments.js';
import { ASK_WHAT } from '../sim/initiative.js';
import { setCooldown, YOU } from '../sim/rel.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
import { ASKS, canAsk, coolingDown, readiness, stayReadiness, forcedNo, applyAnswer, pushTooSoon, endRelationship, romOf, friendTier, romanceTier, tierPct, labelToward, addRomance, slowedDown, FRIEND_TIERS, ROMANCE_TIERS } from '../sim/romance.js';
import { bondOf, social } from '../sim/social.js';
import { presentAt } from '../sim/people.js';
import { WORK_MODES, workShift, jobDef, rankOf, canWork, atWork, offScreen, promoNeeds, promoProgress, perfOf, pendingEvent, chooseEvent, dropEvent, shiftOn, shiftHours, scheduleOf, vacationLeft, sickNo, workRules, weekText, jobPlace, bookOff, callSick, chooseShift, whenText as shiftWhen } from '../sim/work.js';
import { placeOf } from '../sim/places.js';
import { skillName } from '../sim/hobbies.js';
import { hm } from '../sim/time.js';
import { tooTired } from '../sim/needs.js';
import { note } from '../sim/facts.js';
import { diaryTtsButton } from './addons.js';
import { INPUT } from './reg.js';
import { createCharacter, personaName } from '../st/bridge.js';
import { kidOf, stageOf, canCelebrate, celebrate, daysToBirthday, pregnancy, daysLeft, birthDue, conceive, welcomeBaby, romanceBlocked, STAGES } from '../sim/family.js';
import { resident, syncScene } from '../sim/game.js';
import { refreshPrompt } from '../sim/prompt.js';
import { diaryShown } from '../sim/diary.js';
/* ---------- the friendship bar, the same everywhere (card, phone, HUD) ---------- */
// Fills up within the current tier and starts again, in the tier's color, at each new tier (like The Sims).
export function relBar(avatar, romance = true) {
    const g = game();
    if (!g)
        return '';
    const b = bondOf(g, avatar);
    const ft = friendTier(b);
    const rt = romanceTier(g, avatar);
    // both bars, always (high romance with low friendship is a real state), unless romance can't be: off, family, a child
    return `<span class="mu-tierbar" title="${esc(ft.name)}"><i style="width:${tierPct(ft, b)}%;background:${ft.color}"></i></span>${romance && sysOn(g, 'romance') && !romanceBlocked(g, avatar) ? `<span class="mu-tierbar is-love" title="${esc(rt.name)}"><i style="width:${tierPct(rt, romOf(g, avatar).value)}%;background:${rt.color}"></i></span>` : ''}`;
}
// Under a person's name: their friendship tier, their romance tier or status, and the label from both ("In love").
export function relSubtitle(g, avatar) {
    const b = bondOf(g, avatar), rt = romanceTier(g, avatar);
    const lab = romOf(g, avatar).status !== 'none' && labelToward(g, avatar)?.id === 'platonic' ? null : labelToward(g, avatar); // "platonic" can't describe someone you're seeing
    const slow = slowedDown(g, avatar);
    return `${esc(friendTier(b).name)}${rt.id !== 'none' && sysOn(g, 'romance') ? ` · <span class="mu-love-tag">${esc(rt.name)}</span>` : ''}${lab ? ` · <em class="mu-rel-label">${esc(lab.name)}</em>` : ''}${slow ? ` · <span class="mu-rel-slow" title="${slow === 'r' ? 'Their feelings have grown a lot lately: more will come, slowly, after some time.' : 'You have grown close quickly lately: more will come, slowly, after some time.'}">Needs some time</span>` : ''}`;
}
/* ---------- the buttons on a person's card ---------- */
export function romanceButtons(avatar) {
    const g = game();
    if (!g)
        return '';
    // your child: their stage of life and the weekly birthday instead of any romance
    const k = kidOf(g, avatar);
    if (k) {
        const st = stageOf(k), last = k.stage >= STAGES.length - 1;
        return `<div class="mu-pc-love mu-pc-kid"><small class="mu-muted">👶 Your child · ${esc(st.name)}</small>
            ${canCelebrate(g, k) ? `<button data-act="kid-bday" data-who="${esc(avatar)}">🎂<span>Celebrate their birthday</span></button>`
            : last ? '' : `<small class="mu-muted">Next birthday in ${daysToBirthday(g, k)} day${daysToBirthday(g, k) === 1 ? '' : 's'}.</small>`}</div>`;
    }
    if (romanceBlocked(g, avatar) || !sysOn(g, 'romance'))
        return '';
    const r = romOf(g, avatar);
    const p = pregnancy(g);
    const kinds = Object.keys(ASKS).filter(k => canAsk(g, avatar, k));
    const end = r.status === 'married' ? 'Ask for a divorce' : r.status === 'casual' ? 'Stop seeing each other' : r.status !== 'none' ? (r.status === 'engaged' ? 'Call off the engagement' : 'Break up') : '';
    const busy = !!ASK.avatar;
    return `<div class="mu-pc-love">
        ${kinds.map(k => `<button data-act="rm-ask" data-who="${esc(avatar)}" data-k="${esc(k)}" ${busy ? 'aria-disabled="true"' : ''}>${icon('heart')}<span>${ASKS[k].label}</span></button>`).join('')}
        ${end ? `<button class="mu-ghost mu-danger-text" data-act="rm-end" data-who="${esc(avatar)}">${icon('x')}<span>${end}</span></button>` : ''}
        ${p && p.partner === avatar ? `<small class="mu-pc-baby">👶 Expecting a baby · ${daysLeft(g) ? `${daysLeft(g)} day${daysLeft(g) === 1 ? '' : 's'} left` : 'any moment now'}</small>` : ''}
        ${coolingDown(g, avatar) ? '<small class="mu-muted">They need some time before you ask again.</small>' : ''}
    </div>`;
}
const ASK = { avatar: '', name: '', kind: 'date', from: 0, waits: 0, round: 0, start: 0, mine: true, onYes: null };
const END = { avatar: '' };
const askWhat = (k) => k === 'date' ? 'to be a couple' : k === 'casual' ? 'to keep things casual between them' : k === 'stay' ? (ASK.mine ? 'to stay the night' : 'to let them sleep at their place tonight')
    : k === 'baby' ? 'about trying for a baby together' : k === 'propose' ? 'to marry them' : 'to set the date and get married';
const ASK_FACT = { casual: '{u} asked {0} to keep things casual.', date: '{u} asked {0} to be a couple.', propose: '{u} proposed to {0}.', marry: '{u} asked {0} to set the date and get married.', baby: '{u} asked {0} about trying for a baby.' };
function startAsk(g, avatar, kind, from) {
    const r = g.cast[avatar];
    Object.assign(ASK, { avatar, name: r.name, kind, from, waits: 0, round: 0, start: from });
    // the question itself is a fact (the diary and the Journal know it was asked, whatever the answer)
    if (kind !== 'stay')
        note(g, ASK_FACT[kind], [r.name], [avatar], g.player.loc, kind === 'baby' ? 'family' : 'love');
    saveGame();
    setPrompt('mundi_ask', kind === 'stay' ? stayReadiness(g, avatar, r.name, ASK.mine) : readiness(g, avatar, r.name, kind), 0);
}
// Asking someone to stay the night (or to sleep at theirs): the scene plays it, then the same yes/no question; a yes
// runs `onYes`.
export function askStay(avatar, mine, line, onYes) {
    const g = game();
    if (!g || ASK.avatar || !g.cast[avatar])
        return false;
    Object.assign(ASK, { mine, onYes });
    startAsk(g, avatar, 'stay', chat().length);
    if (!sendCanned(line)) {
        Object.assign(ASK, { avatar: '', onYes: null });
        setPrompt('mundi_ask', '');
        return false;
    }
    notify();
    return true;
}
async function ask(avatar, kind) {
    const g = game();
    if (!g || ASK.avatar)
        return;
    const r = g.cast[avatar];
    if (!r)
        return;
    if (coolingDown(g, avatar)) {
        toast(pushTooSoon(g, avatar, r.name), 'warn');
        saveGame();
        notify();
        return;
    }
    startAsk(g, avatar, kind, chat().length);
    if (!sendCanned(ASKS[kind].line(r.name))) {
        Object.assign(ASK, { avatar: '' });
        setPrompt('mundi_ask', '');
        toast('SillyTavern\'s message box was not found.', 'error');
    }
    notify();
}
// Asked in your own words ("will you be my girlfriend?", "quer namorar comigo?"): the same as the button.
const ASK_WORDS = [
    ['propose', /\b(marry me|will you marry|be my (wife|husband)|casa comigo|quer casar comigo|aceita casar|se casar comigo|c[aá]sate conmigo|casarte conmigo)\b/i],
    ['date', /\b(be my (girl ?friend|boy ?friend|partner|girl|boy)|date me|be (a|in a) couple|be together\?|go steady|namorar comigo|namora comigo|quer namorar|ser minha namorada|ser meu namorado|ser (o )?meu par|sermos um casal|ser mi novi[ao]|ser novios|salir conmigo en serio)\b/i],
];
export function detectAsk(text) {
    const g = game();
    const w = g && getWorld(g.world);
    if (!g || !w || ASK.avatar || !text)
        return;
    const hit = ASK_WORDS.find(([, re]) => re.test(text));
    if (!hit)
        return;
    const people = presentAt(g, w, g.player.loc).filter(r => canAsk(g, r.avatar, hit[0]));
    if (!people.length)
        return;
    const low = text.toLowerCase();
    const solo = String(social(g).solo ?? '');
    const r = people.find(p => low.includes(p.name.toLowerCase().split(/\s+/)[0])) ?? people.find(p => p.avatar === solo) ?? (people.length === 1 ? people[0] : null);
    if (!r || coolingDown(g, r.avatar))
        return;
    startAsk(g, r.avatar, hit[0], chat().length);
    notify();
}
// Called when a reply finishes (index.ts): if someone was just asked, find their answer and let the engine apply it.
export async function checkAsk() {
    const g = game();
    if (!ASK.avatar || !g)
        return;
    const list = chat();
    // their reply: by name (ignoring case and extra words), or the only other person who answered
    const others = list.slice(ASK.from).filter((m) => !m.is_user && !m.is_system && !m.extra?.mundi_narrator);
    const low = ASK.name.toLowerCase().trim(), first = low.split(/\s+/)[0];
    const named = (m) => { const n = String(m.name ?? '').toLowerCase().trim(); return n === low || n.split(/\s+/)[0] === first; };
    const speakers = new Set(others.map((m) => String(m.name ?? '')));
    const reply = [...others].reverse().find(named) ?? (speakers.size === 1 ? others.at(-1) : undefined);
    if (!reply) {
        if (++ASK.waits >= 3) {
            setPrompt('mundi_ask', '');
            ASK.avatar = '';
            notify();
        }
        return;
    }
    const { avatar, name, kind, onYes } = ASK;
    // everything since the question (their words, and yours: a story direction like "she says yes" counts too)
    const clean = (t) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const said = list.slice(Math.max(0, ASK.start - 1)).filter((m) => !m.is_system)
        .map((m) => `${m.is_user ? `${personaName()} (the player)` : String(m.name ?? '')}: ${clean(m.mes)}`).join('\n').slice(-2500);
    let answer = 'maybe';
    try {
        const out = (await quiet(`${personaName()} asked ${name} ${askWhat(kind)}. This is the scene since then (lines by the player may be story directions that decide what happens):\n"""\n${said}\n"""\n\nHas ${name} accepted? Reply with one word only: yes (accepted), no (refused), or maybe (no clear answer yet, or asked for time).`, 20, 'You read a scene and say whether the person accepted. One word: yes, no, or maybe.', { lane: 'now' })).toLowerCase();
        answer = /\byes\b/.test(out) ? 'yes' : /\bno\b/.test(out) ? 'no' : 'maybe';
    }
    catch { /* not sure: treat it as "maybe" */ }
    if (answer === 'maybe' && ASK.round < 2) {
        // not clear yet: the question stays open for a couple more replies, and they are nudged to answer
        ASK.round++;
        ASK.from = list.length;
        ASK.waits = 0;
        setPrompt('mundi_ask', `[${name} has not clearly answered {{user}}'s question yet (${askWhat(kind)}). In this reply ${name} gives a clear answer, in their own way: yes, no, or that they need time to think.]`, 0);
        toast(`Waiting for ${name}'s answer…`, 'info');
        notify();
        return;
    }
    ASK.avatar = '';
    ASK.onYes = null;
    setPrompt('mundi_ask', '');
    for (const m of momentsOf(g, avatar))
        if (m.kind === 'ask')
            dropMoment(g, m.id); // a question they meant to ask you is answered too
    if (kind === 'stay') { // no answer yet after a few tries counts as a no
        if (answer === 'yes') {
            onYes?.();
            toast(ASK.mine ? `${name} is staying the night.` : `You are staying at ${name}'s tonight.`, 'success');
        }
        else
            toast(`${name} said no.`, 'info');
        saveGame();
        notify();
        return;
    }
    if (forcedNo(g, avatar, kind))
        answer = 'no'; // "only with a partner": the engine's own no
    let msg = applyAnswer(g, avatar, name, kind, answer);
    if (kind === 'baby' && answer === 'yes') {
        msg = conceive(g, avatar, name);
        saveGame();
        refreshPrompt();
        if (pregnancy(g))
            milestone(avatar, msg);
        else
            toast(msg, 'info');
        notify();
        return;
    }
    saveGame();
    if (answer === 'yes')
        milestone(avatar, msg);
    else
        toast(msg, answer === 'no' ? 'warn' : 'info');
    notify();
}
export const asking = () => ASK.avatar ? { avatar: ASK.avatar, kind: ASK.kind } : null;
/* ---------- they asked you (A-2): did you accept? ---------- */
const REV = { busy: false };
// After each of your lines: someone who was going to ask you something in this scene, and has spoken since, may have
// asked; the AI says whether, and what you answered. Three of your lines without an answer, and it's left to the
// scene's verdict. A yes is exactly your own accepted ask; a no costs them a little romance and starts the cooldown.
export async function checkReverse() {
    const g = game();
    const w = g && getWorld(g.world);
    if (!g || !w || REV.busy || ASK.avatar)
        return;
    const m = momentsOf(g).find(x => x.kind === 'ask' && x.sent !== undefined && (x.tries ?? 0) < 3);
    const r = m && g.cast[m.who];
    if (!m || !r || !m.ask)
        return;
    const since = chat().slice(m.sent).filter((x) => !x.is_system);
    const theirs = since.findIndex((x) => !x.is_user && speakerOf(x) === m.who);
    if (theirs < 0 || !since.slice(theirs + 1).some((x) => x.is_user))
        return;
    const k = m.ask, me = personaName();
    const clean = (t) => String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const said = since.map((x) => `${x.is_user ? `${me} (the player)` : String(x.name ?? '')}: ${clean(x.mes)}`).join('\n').slice(-2500);
    let answer = 'notyet';
    REV.busy = true;
    try {
        const out = (await quiet(`${r.name} was going to ask ${me} ${ASK_WHAT[k]} in this scene. This is the scene since then (lines by the player may be story directions that decide what happens):\n"""\n${said}\n"""\n\nHas ${r.name} asked, and what did ${me} answer? Reply with one word only: yes (${me} accepted), no (${me} refused), maybe (no clear answer, or ${me} asked for time), or notyet (${r.name} has not asked yet).`, 20, 'You read a scene and say whether a question was asked and answered. One word: yes, no, maybe or notyet.', { lane: 'now' })).toLowerCase();
        answer = /not\s*yet/.test(out) ? 'notyet' : /\byes\b/.test(out) ? 'yes' : /\bno\b/.test(out) ? 'no' : /\bmaybe\b/.test(out) ? 'maybe' : 'notyet';
    }
    catch { /* not sure: wait for the next line */ }
    finally {
        REV.busy = false;
    }
    if (answer === 'notyet') {
        m.tries = (m.tries ?? 0) + 1;
        saveGame();
        return;
    }
    dropMoment(g, m.id);
    if (answer === 'yes') {
        if (k === 'stay' || k === 'staytheirs') {
            const { beginStay } = await import('./events.js');
            beginStay(g, r.avatar, k === 'stay');
            toast(k === 'stay' ? `${r.name} is staying the night.` : `You are staying at ${r.name}'s tonight.`, 'success');
        }
        else {
            let msg = applyAnswer(g, r.avatar, r.name, k, 'yes');
            if (k === 'baby')
                msg = conceive(g, r.avatar, r.name);
            if (k !== 'baby' || pregnancy(g))
                milestone(r.avatar, msg);
            else
                toast(msg, 'info');
        }
    }
    else if (answer === 'no') {
        addRomance(g, r.avatar, -3);
        setCooldown(g, r.avatar, YOU, nowAbs(g) + 3 * 1440);
        note(g, '{u} turned down {0}.', [r.name], [r.avatar], g.player.loc, 'love');
        toast(`You said no to ${r.name}.`, 'info');
    }
    saveGame();
    refreshPrompt();
    notify();
}
/* ---------- a milestone ---------- */
const MS = { avatar: '', text: '', until: 0 };
export function milestone(avatar, text) { Object.assign(MS, { avatar, text, until: Date.now() + 4200 }); setTimeout(notify, 4300); notify(); }
function milestoneHtml() {
    if (Date.now() > MS.until)
        return '';
    return `<div class="mu-milestone" data-act="ms-close"><div class="mu-milestone-card"><img src="${esc(thumb(MS.avatar))}" alt=""><b>${esc(MS.text)}</b>${icon('heart')}</div></div>`;
}
/* ---------- the end-of-day recap ---------- */
const DAY = { day: 0, changes: [], open: false };
export function showDayRecap(day, changes) {
    const g = game();
    const entry = g && (g.journalProse ?? {})[day];
    if (!changes.length && !entry)
        return;
    Object.assign(DAY, { day, changes, open: true });
    notify();
}
// While the night's diary is being written: a "writing the diary" screen after the night, with a way to skip it.
const WAIT = { day: 0, on: false, skipped: false, done: -1 };
export function diaryWaiting(day) { if (WAIT.done === day)
    return; Object.assign(WAIT, { day, on: true, skipped: false }); notify(); }
export function diaryReady(day, changes, ok) {
    const skipped = WAIT.skipped;
    WAIT.on = false;
    WAIT.done = day;
    if (ok)
        showDayRecap(day, changes);
    else
        notify();
    void skipped;
}
function waitHtml() {
    if (!WAIT.on || WAIT.skipped)
        return '';
    return `<div class="mu-recap-veil mu-diary-wait"><section class="mu-recap mh-glass"><span class="mu-spin"></span><h3>Writing your diary…</h3>
        <p class="mu-muted">The day ${WAIT.day} is becoming a diary entry. Then you will see how the day went with everyone.</p>
        <button class="mu-ghost" data-act="diary-skip">Skip and keep playing</button></section></div>`;
}
// One bar: from its old value to the new one; a new tier fills the bar up, empties it and changes its color.
function animBar(label, t0, t1, v0, v1) {
    const up = t1.lo > t0.lo, down = t1.lo < t0.lo;
    const a = tierPct(t0, v0), b = tierPct(t1, v1);
    const cls = up ? 'is-up' : down ? 'is-down' : v1 > v0 ? 'is-more' : v1 < v0 ? 'is-less' : '';
    return `<div class="mu-rb ${cls}"><span class="mu-rb-head"><small>${label}</small><b style="color:${t1.color}">${esc(t1.name)}</b>${up ? '<em>New level!</em>' : down ? '<em class="is-bad">Went down</em>' : ''}</span>
        <span class="mu-rb-bar" style="--a:${a}%;--b:${b}%;--c0:${t0.color};--c1:${t1.color}"><i></i></span></div>`;
}
function recapHtml() {
    const g = game();
    if (!DAY.open || !g)
        return '';
    return `<div class="mu-recap-veil"><section class="mu-recap mh-glass" role="dialog" aria-label="How the day went">
        <header><small>Day ${DAY.day}</small><h3>How the day went</h3></header>
        ${(g.journalProse ?? {})[DAY.day] ? `<div class="mu-recap-diary"><blockquote data-notr>${esc(diaryShown(g, DAY.day))}</blockquote>${diaryTtsButton(DAY.day)}</div>` : ''}
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
export const perfWord = (n) => (n >= 80 ? 'excellent' : n >= 60 ? 'good' : n >= 40 ? 'fair' : n >= 25 ? 'poor' : 'very poor');
/** What the next promotion still asks for, in a line ('' at the top). */
export function nextRankLine(g, w, o) {
    const p = promoNeeds(g, w, o);
    if (!p)
        return '';
    if (p.ready)
        return `Next: ${p.rank.name} (ready after this shift)`;
    const skills = p.skills.map(s => `${s.name} ${s.need} (you: ${s.have})`).join(', ');
    return `Next: ${p.rank.name} · ${promoProgress(p)}% of the time${skills ? ` · ${skills}` : ''}${p.perf > perfOf(g) ? ` · performance ${p.perf}` : ''}${p.traits.length && p.missing.includes(p.traits.join(' or ')) ? ` · ${p.traits.join(' or ')}` : ''}`;
}
// The shift as the work button and the work screen say it.
export function shiftLabel(g, w, o) {
    const c = canWork(g, w, o);
    if (c.kind === 'overtime')
        return { ok: true, text: 'Overtime · +25% pay' };
    if (c.kind === 'none')
        return { ok: false, text: c.why ?? '' };
    const s = c.shift, wait = s.start - nowAbs(g);
    return { ok: true, text: `${hm(s.start % 1440)}–${hm(s.end % 1440)}${c.early ? ` · starts in ${wait} min` : c.late ? ' · you are late' : ''}` };
}
/** The work button where you can work (at your rank's place, or anywhere for an off-screen job). */
export function workButton(g, w) {
    const o = jobDef(w, g.player.job?.id);
    if (!o || !systemOn(w, 'jobs') || !atWork(g, w, o))
        return '';
    const l = shiftLabel(g, w, o);
    return `<button class="mh-act is-work mh-glass ${offScreen(w, o) ? 'is-outing' : ''}" data-act="work" ${l.ok ? '' : 'aria-disabled="true"'}><i>${icon('briefcase')}</i><b>${offScreen(w, o) ? 'Go to work' : 'Work a shift'}</b><small>${esc(l.text)}</small></button>`;
}
// Your shifts this week (also in the Calendar and the Jobs app): days off to book or give back, calling in sick, and
// the shift you'd rather work in a job worked round the clock.
export function workWeekHtml(g, w) {
    const o = jobDef(w, g.player.job?.id);
    if (!o || !systemOn(w, 'jobs'))
        return '';
    const j = g.player.job, now = nowAbs(g);
    const list = [];
    for (let d = g.day - 1; d <= g.day + 6; d++) {
        const s = shiftOn(g, w, o, d);
        if (s && s.end - 60 > now)
            list.push(s);
    }
    const vac = vacationLeft(g, w), sick = sickNo(g, w), shifts = scheduleOf(o).shifts ?? [];
    const mine = shiftHours(g, o);
    const row = (s) => {
        const off = j.off?.[s.day], done = (j.worked ?? []).includes(s.day);
        return `<div class="mu-ph-job"><span><b>${esc(shiftWhen(g, s))}</b><small>${done ? 'Worked ✓' : off === 'vacation' ? 'Day off' : off === 'sick' ? 'Called in sick' : esc(placeOf(g, w, offScreen(w, o) ? '' : jobPlace(g, o))?.name ?? (offScreen(w, o) ? 'off-screen' : ''))}</small></span>
            ${done || off === 'sick' ? '' : `<button class="mu-ghost" data-act="wk-off" data-day="${s.day}" ${off || (vac >= 1 && s.start > now) ? '' : 'aria-disabled="true"'}>${off ? 'Work it' : 'Take the day off'}</button>`}</div>`;
    };
    return `<section class="mu-workweek"><h4>${icon('briefcase')} Work this week</h4>
        <small class="mu-muted">${esc(o.name)} · ${esc(weekText(g, w, o))}</small>
        ${shifts.length > 1 ? `<div class="mu-chips">${shifts.map(x => `<button class="mu-chip ${x.id === mine.id ? 'is-on' : ''}" data-act="wk-shift" data-id="${esc(x.id)}">${esc(x.name ?? x.id)} ${hm(Math.round(x.from * 60) % 1440)}–${hm(Math.round(x.to * 60) % 1440)}</button>`).join('')}</div>` : ''}
        ${list.map(row).join('') || '<p class="mu-muted">No shifts this week.</p>'}
        <small class="mu-muted">Vacation days: ${vac === Infinity ? 'as many as you like' : vac}${workRules(g, w).vacation ? ` (one more every ${workRules(g, w).vacation} days)` : ''}</small>
        <button data-act="wk-sick" ${sick ? `aria-disabled="true" title="${esc(sick)}"` : ''}>${icon('heart')}<span>Call in sick</span></button></section>`;
}
function workHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    if (!g || !w)
        return '';
    const job = jobDef(w, g.player.job?.id);
    if (!job)
        return '';
    const ev = pendingEvent(g, w);
    if (ev)
        return `<div class="mu-recap-veil"><section class="mu-recap mu-workpick mh-glass" role="dialog" aria-label="At work">
        <header><small>${esc(job.name)} · at work</small><h3>${esc(ev.ev.setup)}</h3></header>
        <div class="mu-work-modes">${ev.choices.map(x => `<button class="mu-work-mode" data-act="work-ev" data-i="${x.i}"><b>${esc(x.c.label)}</b>${x.c.roll ? `<small>🎲 ${esc(x.c.roll.skill ? skillName(w, x.c.roll.skill) : 'Luck')} against ${esc(String(x.c.roll.dc))}</small>` : ''}</button>`).join('')}</div>
        <button class="mu-ghost" data-act="work-ev-skip">Let it go</button></section></div>`;
    if (!WORK.open)
        return '';
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
    const g = game();
    if (!g || !birthDue(g) || DAY.open)
        return '';
    const p = pregnancy(g);
    return `<div class="mu-recap-veil"><section class="mu-recap mu-birth mh-glass" role="dialog" aria-label="The baby is here">
        <header><small>Day ${g.day}</small><h3>👶 The baby is here!</h3></header>
        <p>You and <b data-notr>${esc(p.name)}</b> are parents now. What will you call them?</p>
        <input type="text" class="text_pole" placeholder="The baby's name" value="${esc(BIRTH.name)}" data-input="birth-name" data-focus="birth-name" maxlength="40">
        <small class="mu-muted">They become a person of this world and live with you. You can give them a picture in the Library.</small>
        <button class="mu-primary" data-act="birth-go" ${BIRTH.name.trim() && !BIRTH.busy ? '' : 'aria-disabled="true"'}>${BIRTH.busy ? 'One moment…' : 'Welcome them'}</button></section></div>`;
}
export function relOverlays() { return `${workHtml()}${waitHtml()}${recapHtml()}${birthHtml()}${milestoneHtml()}`; }
Object.assign(INPUT, { 'birth-name': (el) => { BIRTH.name = el.value; notify(); } });
Object.assign(ACT, {
    'rm-ask': (el) => ask(el.dataset.who, el.dataset.k),
    'rm-end': (el) => { END.avatar = el.dataset.who; notify(); },
    'rm-end-no': () => { END.avatar = ''; notify(); },
    'rm-end-yes': () => {
        const g = game();
        const r = g && g.cast[END.avatar];
        END.avatar = '';
        if (!g || !r)
            return;
        const was = romOf(g, r.avatar).status;
        const msg = endRelationship(g, r.avatar, r.name);
        saveGame();
        if (msg) {
            toast(msg, 'warn');
            // the scene plays the moment (the engine already decided it)
            if (state.view === 'scene') {
                setPrompt('mundi_ask', `[{{user}} is ending the relationship with ${r.name}${was === 'married' ? ' (asking for a divorce)' : ''}. It is decided. Write ${r.name}'s reaction.]`, 0);
                sendCanned(`*${was === 'married' ? `tells ${r.name} they want a divorce` : `breaks up with ${r.name}`}*`);
                setTimeout(() => setPrompt('mundi_ask', ''), 60000);
            }
        }
        notify();
    },
    'ms-close': () => { MS.until = 0; notify(); },
    'diary-skip': () => { WAIT.skipped = true; toast('The diary is still being written. "How the day went" will show up when it is ready.', 'info'); notify(); },
    'birth-go': async () => {
        const g = game();
        const w = g && getWorld(g.world);
        const p = g && pregnancy(g);
        const name = BIRTH.name.trim();
        if (!g || !w || !p || !name || BIRTH.busy)
            return;
        BIRTH.busy = true;
        notify();
        try {
            const me = personaName();
            const avatar = await createCharacter({ name, description: `${name} is the child of ${me} and ${p.name}, born in ${w.name}.`,
                tags: ['Mundi'], extensions: { mundi: { world: w.id, child: true } } });
            const taken = new Set();
            welcomeBaby(g, w, avatar, name, resident(w, avatar, taken));
            BIRTH.name = '';
            saveGame();
            await syncScene();
            refreshPrompt();
            milestone(avatar, `Welcome, ${name}!`);
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        BIRTH.busy = false;
        notify();
    },
    'kid-bday': (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        const k = g && kidOf(g, el.dataset.who);
        if (!g || !w || !k)
            return;
        const msg = celebrate(g, w, k);
        if (!msg)
            return;
        saveGame();
        refreshPrompt();
        milestone(k.avatar, `🎂 ${msg}`);
        if (state.view === 'scene') {
            setPrompt('mundi_ask', `[{{user}} is celebrating ${k.name}'s birthday. ${k.name} is now ${stageOf(k).desc}. Write the moment.]`, 0);
            sendCanned(`*celebrates ${k.name}'s birthday*`);
            setTimeout(() => setPrompt('mundi_ask', ''), 60000);
        }
        notify();
    },
    'recap-close': () => { DAY.open = false; notify(); },
    'work-cancel': () => { WORK.open = false; notify(); },
    'work-cancel-bg': (el, e) => { if (e.target === el) {
        WORK.open = false;
        notify();
    } },
    'work-go': async (el) => {
        WORK.open = false;
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const job = jobDef(w, g.player.job?.id);
        if (!job)
            return;
        const tired = tooTired(g, w, job.cost ?? {}, 'work a shift');
        if (tired) {
            toast(tired, 'warn');
            notify();
            return;
        }
        const { finishWork } = await import('./map.js');
        await finishWork(workShift(g, w, el.dataset.mode), job.name);
    },
    'work-ev': (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        chooseEvent(g, w, Number(el.dataset.i)).forEach((m, i) => toast(m, i ? 'success' : 'info'));
        saveGame();
        refreshPrompt();
        notify();
    },
    'work-ev-skip': () => { const g = game(); if (g) {
        dropEvent(g);
        saveGame();
    } notify(); },
    'wk-off': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w)
        return; const m = bookOff(g, w, Number(el.dataset.day)); if (m)
        toast(m, 'info'); saveGame(); notify(); },
    'wk-sick': () => { const g = game(); const w = g && getWorld(g.world); if (!g || !w)
        return; const m = callSick(g, w); if (m)
        toast(m, 'info'); saveGame(); refreshPrompt(); notify(); },
    'wk-shift': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w)
        return; const m = chooseShift(g, w, el.dataset.id); if (m)
        toast(m, 'success'); saveGame(); notify(); },
});
// the confirmation for ending a relationship
export function endConfirmHtml() {
    const g = game();
    const r = g && END.avatar ? g.cast[END.avatar] : null;
    if (!g || !r)
        return '';
    const st = romOf(g, r.avatar).status;
    return `<div class="mu-dlg-veil is-fixed" data-act="rm-end-no"></div><div class="mu-panel mu-confirm" role="dialog"><h3>${st === 'married' ? `Divorce ${esc(r.name)}?` : `End it with ${esc(r.name)}?`}</h3>
        <p class="mu-muted">Your romance ends and your friendship takes a hit. ${esc(r.name)} will remember it.</p>
        <div class="mu-row"><button class="mu-danger" data-act="rm-end-yes">${st === 'married' ? 'Ask for a divorce' : 'End it'}</button><button data-act="rm-end-no">Cancel</button></div></div>`;
}
void bondOf;
void FRIEND_TIERS;
void ROMANCE_TIERS;
