import { systemOn } from '../core/world.js';
import { personaName } from '../st/bridge.js';
import { onDay, onHour, onLook, tierLink } from './hooks.js';
import { exampleOf, adultOn } from './dayplan.js';
import { presentAt, residents } from './people.js';
import { whenHolds, levelHolds, parseWhen, calendarOnly, missingWords, threadOwner } from './when.js';
import { effectAdd } from './effects.js';
import { startRumor, rumorPool, liveTogether, YOU } from './living.js';
import { queueMoment, inviteSoon } from './moments.js';
import { note } from './facts.js';
import { homeSpot, takenHomes, normalizeHomes } from './homes.js';
import { earn } from './points.js';
import { seasonDays, advance } from './time.js';
import { textFrom, social } from './social.js';
import { money } from './needs.js';
import { fr, setFr, attracted, statusOf, isPartner } from './rel.js';
import { FRIEND_TIERS, becomeCouple, jealousOf } from './romance.js';
import { romanceBlocked } from './family.js';
import { playerHomeId } from './places.js';
const rnd = (g, salt) => { let h = 2166136261; const s = `${g.world}|${g.day}|${salt}`; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
export const threadStates = (g) => (g.threads ??= {});
// How long an ending is still news for the AI.
const NEWS_DAYS = 14;
// How likely, each day you're together, someone who trusts you enough tells you their secret.
const TELL = 0.5;
/** Storylines' numbers: days to answer a last chance; the hours a text can come (from `TEXT_FROM`, when you haven't
 *  been together that day) and an in-person one (from `DAY_FROM`); the most last chances (and nudge texts). */
export const STORYLINE = { answer: 3, dayFrom: 9, textFrom: 17, until: 20, nudges: 3, perWeek: 2 };
/** The plain engine nudges, first to last, for a storyline without its own (interface text). */
export const DEFAULT_NUDGES = ["Can we talk soon? It's about something I've kept to myself.", "It's still on my mind. Could we meet this week?", "I have to decide soon, and I'd like to talk to you first."];
/** The threads of the people in this save (an adult person's, or an adult thread, only with adult content on), with whose they are. */
export function threadsOf(g, w) {
    const out = [];
    // (an adult person's storylines are adult too: someone left in the cast when adult content is switched off stays quiet)
    for (const r of residents(g)) {
        const ex = exampleOf(w, r);
        for (const t of ex?.threads ?? [])
            if (t.id && t.stages?.length && ((!t.adult && !ex?.adult) || adultOn(g)))
                out.push({ t, r });
    }
    return out;
}
const findThread = (g, w, id) => threadsOf(g, w).find(x => x.t.id === id) ?? null;
const holds = (g, w, s, id, i) => !s.when || whenHolds(g, w, s.when, { day: true, key: `thread|${id}|${i}` });
/** The stage a thread is at now (null: not begun, or over). */
export function stageOf(g, t) {
    const st = threadStates(g)[t.id];
    return st && !st.ended && st.stage >= 0 ? t.stages[st.stage] ?? null : null;
}
const half = (g) => Math.max(1, Math.floor(seasonDays(g) / 2));
const first = (r) => (r.name ?? '').split(/\s+/)[0] || r.name;
const trim = (s) => s.trim().replace(/[.\s]+$/, '');
// {{user}} made "you" for the player's own screens ("{{user}} knows" → "you know")
const VERBS = { knows: 'know', is: 'are', has: 'have', was: 'were' };
const you = (s) => s.replace(/\{\{user\}\} (knows|is|has|was)\b/g, (_m, v) => `you ${VERBS[v]}`).replace(/\{\{user\}\}'s/g, 'your').replace(/\{\{user\}\}/g, 'you').replace(/^./, c => c.toUpperCase());
/** What the player sees a storyline called ("Mio's exams"; "Mio's storyline" when it has no title). */
export const titleOf = (t, r) => t.title?.trim() || `${first(r)}'s storyline`;
const decideOf = (t) => trim(t.decide?.trim() || `${trim(t.hidden)}; ${trim(t.stages[t.stages.length - 1]?.text ?? '')}`);
const nudgesOf = (t) => (t.nudges?.length ? t.nudges.slice(0, STORYLINE.nudges) : DEFAULT_NUDGES);
const self = (g) => { const s = g.swap; return s ? (s.avatar || s.origCard || '') : ''; };
/* ---------- opening and moving on, day by day ---------- */
// A storyline opens once its person has met you: at friend, through an earlier way of its own, or a secret you know;
// (museum) one marked `opensOnly` only through its own ways.
function opensNow(g, w, t, r, st) {
    if (!r.met || goneFromMap(r))
        return false;
    if (!t.opensOnly && (st.known !== undefined || levelHolds(g, w, r.avatar, 'friend')))
        return true;
    const list = t.opens == null ? [] : Array.isArray(t.opens) ? t.opens : [t.opens];
    return list.some((c, i) => !!c && whenHolds(g, w, c, { key: `thread|${t.id}|opens|${i}` }));
}
/** Opens a storyline now (its first stage, with what it brings), whatever its season. */
export function openThread(g, w, t, r) {
    const st = (threadStates(g)[t.id] ??= { stage: -1, since: g.day });
    if (st.ended || st.stage >= 0)
        return;
    st.stage = 0;
    st.since = g.day;
    st.opened = g.day;
    enterStage(g, w, t, r, 0);
}
// The next stage in order whose condition holds: a stage of yours (a job, a venture, a story) that doesn't hold is
// skipped when a later one holds, a calendar stage never is.
function nextStage(g, w, t, st) {
    for (let i = st.stage + 1; i < t.stages.length; i++) {
        if (holds(g, w, t.stages[i], t.id, i))
            return i;
        if (calendarOnly(t.stages[i].when))
            return -1;
    }
    return -1;
}
// The stage is over: its condition stopped holding (after half a season for the first one), or a season went by for one
// with none.
function stageOver(g, w, t, st) {
    const s = t.stages[st.stage];
    if (!s)
        return true;
    if (st.stage === 0 && g.day - (st.opened ?? st.since) < half(g))
        return false;
    return s.when ? !holds(g, w, s, t.id, st.stage) : g.day - st.since >= seasonDays(g);
}
function step(g, w, t, r) {
    const st = (threadStates(g)[t.id] ??= { stage: -1, since: g.day });
    if (st.ended)
        return [];
    if (st.stage < 0) {
        if (opensNow(g, w, t, r, st))
            openThread(g, w, t, r);
        return [];
    }
    // (pending) the storyline it hangs on ended: its next scene together is a deciding scene again
    if (st.on && threadStates(g)[st.on]?.ended) {
        delete st.on;
        delete st.waiting;
        st.next = Math.max(st.next ?? 0, g.day + half(g));
    }
    if (st.due !== undefined || st.since === g.day)
        return []; // (one stage a day)
    const firstDone = st.stage > 0 || g.day - (st.opened ?? st.since) >= half(g);
    const next = firstDone ? nextStage(g, w, t, st) : -1;
    if (next >= 0) {
        st.stage = next;
        st.since = g.day;
        enterStage(g, w, t, r, next);
        return [];
    }
    if (st.stage === t.stages.length - 1 && stageOver(g, w, t, st)) {
        st.due = g.day;
        st.next = g.day + half(g);
    }
    return [];
}
// What a stage brings: a moment with you (when you know them), a rumor about them, a fact.
function enterStage(g, w, t, r, i) {
    const s = t.stages[i];
    if (s.moment && r.met)
        queueMoment(g, { who: r.avatar, kind: 'thread', tier: `${t.id}:${i}`, text: momentText(r, s.moment), until: g.day + 14 });
    if (s.rumor) {
        // it goes round where they work and spend their time, never through them, and their close friends keep it
        const place = w.occupations.find(o => o.id === r.occupation)?.place ?? r.leisure[0] ?? '';
        startRumor(g, w, s.rumor, place, { about: r.name, secret: s.tell !== 'known', thread: t.id, id: `thread:${t.id}:${i}` });
    }
    if (s.fact)
        note(g, s.fact, [r.name], [r.avatar], `home:${r.avatar}`, 'thread');
}
// A moment written about them ("A collector phones Nanami…"): told as theirs to bring up, in this scene.
const momentText = (r, text) => `${text.replace(/[.\s]+$/, '')}: ${r.name} brings it up with {{user}} in this scene, in their own way.`;
/** One of the world's people takes another job (a storyline's ending, the museum's curator): its rank starts again.
 *  Nothing with jobs off or a job the world doesn't have; true when it changed. */
export function changeJob(g, w, r, job) {
    if (!systemOn(w, 'jobs') || !w.occupations.some(o => o.id === job) || r.occupation === job)
        return false;
    r.occupation = job;
    delete (g.living?.ranks ?? {})[r.avatar];
    return true;
}
// It ends this way: a life that changes (the world's people keep their jobs and homes otherwise, E25, their stories may
// move them), the fact, life points for one you knew, and leaving: the morning after the scene, or at once by text.
function endThread(g, w, t, r, e, by) {
    const st = threadStates(g)[t.id];
    st.ended = e?.id ?? 'over';
    st.endDay = g.day;
    st.endedBy = by;
    for (const k of ['asked', 'talk', 'on', 'waiting', 'next'])
        delete st[k];
    const paid = st.known !== undefined ? earn(g, w, 'thread', t.id) : ''; // a thread you knew reaching its end: life points
    if (!e)
        return paid ? [paid] : [];
    if (e.job)
        changeJob(g, w, r, e.job);
    if (e.home && w.homes.zones.some(z => z.id === e.home) && r.home?.zone !== e.home && r.homeWith !== '__you') {
        r.home = { ...homeSpot(w, e.home, takenHomes(g, r), g.player.home) };
        delete r.homeWith;
        normalizeHomes(g);
    }
    note(g, e.text.replace(/\{\{user\}\}/g, '{u}'), [], [r.avatar], `home:${r.avatar}`, 'thread');
    if (e.fact)
        note(g, e.fact, [r.name], [r.avatar], `home:${r.avatar}`, 'thread');
    const out = [`${first(r)}: ${you(trim(e.text))}.`, ...(paid ? [paid] : []), ...coupleOf(g, w, r, e)];
    if (e.leaves) {
        if (by === 'nudges') {
            // the goodbye comes by text, the ending's own words standing in for the AI's
            if (systemOn(w, 'plans') && r.met)
                void textFrom(g, w, r.avatar, `${r.name} writes to say goodbye to ${personaName()}: ${trim(e.text).replace(/\{\{user\}\}/g, personaName())}. A short, warm goodbye in their own voice.`, `${you(trim(e.text))}. Take care of yourself.`).then(() => unread(g, r.avatar)).catch(() => { });
            out.push(...leaveMap(g, r, e.text));
        }
        else
            st.leaving = g.day;
    }
    return out;
}
// (museum) An ending's couple with the player and their moving in: the highest status at most the ending's that their
// tier allows (never lowering one you are already; nothing with romance off, with someone romance is closed to or not
// drawn to you, or the person you play), then, once partners, they move into your home.
const COUPLE = ['dating', 'engaged', 'married'];
function coupleOf(g, w, r, e) {
    const out = [];
    if (r.avatar === self(g) || goneFromMap(r))
        return out;
    if (e.couple && systemOn(w, 'romance') && !romanceBlocked(g, r.avatar) && attracted(g, r.avatar, YOU)) {
        const have = COUPLE.indexOf(statusOf(g, r.avatar, YOU));
        for (let i = COUPLE.indexOf(e.couple); i > have; i--) {
            if (tierLink.notYet(g, r.avatar, COUPLE[i]))
                continue;
            const hurt = COUPLE[i] === 'dating' ? jealousOf(g, r.avatar, r.name) : [];
            out.push(becomeCouple(g, r.avatar, r.name, COUPLE[i]), ...hurt);
            break;
        }
    }
    if (e.movesIn && isPartner(g, r.avatar, YOU) && r.homeWith !== YOU && g.player.home) {
        liveTogether(g, YOU, r.avatar);
        note(g, '{0} moved in with {u}.', [r.name], [r.avatar], playerHomeId, 'love');
        out.push(`${r.name} moves in with you.`);
    }
    return out;
}
const unread = (g, a) => { const s = social(g); s.unread[a] = (s.unread[a] ?? 0) + 1; };
/** They leave the world's maps for good (the save keeps them): no more plans, company, invitations or placements. */
export function leaveMap(g, r, why) {
    const me = self(g);
    if (r.avatar === me || r.gone || tierLink.reserved(g, r.avatar))
        return []; // (not the one you're playing as; (museum) someone reserved never leaves)
    r.gone = { day: g.day, why };
    const s = g.social;
    if (s) {
        s.with = (s.with ?? []).filter((c) => c.avatar !== r.avatar);
        for (const a of s.appts ?? [])
            if (a.avatar === r.avatar && a.state === 'set')
                a.state = 'cancelled';
        if (s.invite?.avatar === r.avatar)
            s.invite = null;
        if (s.solo === r.avatar)
            s.solo = '';
    }
    if (g.brought)
        delete g.brought[r.avatar];
    return r.met ? [`${r.name}: ${why.replace(/\{\{user\}\}/g, 'you')}`] : [];
}
/** Has someone left the world's maps? */
export const goneFromMap = (r) => !!r?.gone;
/** Moves every thread on (once a day; also on first sight): openings, stages, storylines that hung on one that ended,
 *  and those who leave the morning after their deciding scene. */
export function advanceThreads(g, w) {
    const list = systemOn(w, 'living') ? threadsOf(g, w) : [];
    if (!list.length)
        return []; // (a world without threads keeps nothing in the save)
    const all = threadStates(g), out = [];
    for (const { t, r } of list) {
        out.push(...step(g, w, t, r));
        const st = all[t.id];
        if (st.leaving !== undefined && g.day > st.leaving) {
            delete st.leaving;
            const e = t.endings?.find(x => x.id === st.ended);
            if (e?.leaves)
                out.push(...leaveMap(g, r, e.text));
        }
    }
    return out;
}
/* ---------- the endings, as they are now ---------- */
const condText = (c) => `${c.key}: ${c.not ? 'not ' : ''}${c.values.join(' or ')}`; // (the grammar's own order: `thread: not x`)
const endCtx = (t, i) => ({ day: true, key: `thread|${t.id}|end|${i}` });
const isOpen = (g, id) => { const s = threadStates(g)[id]; return !!s && s.stage >= 0 && !s.ended; };
// The storylines an ending's `thread:` names.
const namedThreads = (e) => parseWhen(e.when).conds.filter(c => c.key === 'thread').flatMap(c => c.values.map(v => v.split(/\s+/)[0]));
// An ending whose other conditions hold and that names a storyline still open hangs on it (`on`); a good one naming a
// storyline not begun whose person you've met will open it at the deciding scene (`link`).
function pendingOf(g, w, t, e, i) {
    const ids = namedThreads(e).filter(id => id !== t.id);
    if (!ids.length)
        return null;
    const rest = parseWhen(e.when).conds.filter(c => c.key !== 'thread').map(condText).join('; ');
    const on = ids.find(id => isOpen(g, id));
    const link = !on && e.good ? ids.find(id => { const x = findThread(g, w, id); const s = threadStates(g)[id]; return !!x && x.r.met && !goneFromMap(x.r) && !(s?.ended) && !(s && s.stage >= 0); }) : undefined;
    if (!on && !link)
        return null;
    if (!rest || whenHolds(g, w, rest, endCtx(t, i)))
        return on ? { on } : { link };
    // a good way that names the other storyline as it must end (not `thread: not …`) also hangs on it while what else it
    // asks can still be done: Natsuki's word for Hina needs an introduction that can't happen before Hina's storyline
    // ends, so it waits on Hina's (and opens it) the way Jake's waits on Rina's, rather than asking you to wait
    const named = parseWhen(e.when).conds.some(c => c.key === 'thread' && !c.not && c.values.some(v => v.split(/\s+/)[0] === (on ?? link)));
    return e.good && named && parseWhen(rest).conds.every(c => condReachable(g, w, c)) ? (on ? { on } : { link }) : null;
}
const endHolds = (g, w, t, e, i) => !!e.when && !e.help?.only && whenHolds(g, w, e.when, endCtx(t, i));
const fallbackOf = (list) => [...list].reverse().find(x => !x.when && !x.help?.only) ?? list.at(-1);
/** How it would end now, with nothing more done: the first ending that holds (one hanging on another storyline left
 *  aside), else the last one without a condition. */
export function wouldEnd(g, w, t) {
    const list = t.endings ?? [];
    return list.find((e, i) => endHolds(g, w, t, e, i) && !pendingOf(g, w, t, e, i)?.on) ?? fallbackOf(list);
}
/** How it ends without the player, once its last chances all went unanswered: the first way that isn't good and holds,
 *  else the last one without a condition. Never a good way: those say what the player did, and they weren't there. */
export function endsWithoutYou(g, w, t) {
    const list = t.endings ?? [];
    return list.find((e, i) => !e.good && endHolds(g, w, t, e, i) && !pendingOf(g, w, t, e, i)?.on) ?? [...list].reverse().find(x => !x.when && !x.good && !x.help?.only) ?? fallbackOf(list);
}
// Keys a player can still do something about (a friendship, a secret, something done, a favor, a course, a skill,
// money, places, a gift, stories not seen yet, storylines not over yet).
const DOABLE = new Set(['feels', 'knows', 'did', 'favor', 'course', 'skill', 'money', 'visited', 'gave', 'secrets', 'helped', 'kept', 'holds', 'attended', 'companion', 'piece', 'museum']);
function condReachable(g, w, c) {
    if (whenHolds(g, w, condText(c), { day: true }))
        return true;
    if (DOABLE.has(c.key) && !c.not)
        return true;
    const seen = (id) => g.stories?.seen?.[id] ?? g.player.job?.seen?.[id];
    if (c.key === 'seen')
        return !c.not && c.values.some(v => !seen(v.split(':')[0]));
    if (c.key === 'thread')
        return !c.not && c.values.some(v => !threadStates(g)[v.split(/\s+/)[0]]?.ended);
    return false;
}
/** Can a good ending still be reached: a business way on its way (`waits` holds), or everything it still asks is
 *  something you can do (a help's condition, for a way taken through Help alone). */
export function reachable(g, w, t, e) {
    const i = (t.endings ?? []).indexOf(e);
    if (e.waits && whenHolds(g, w, e.waits, { day: true, key: `thread|${t.id}|wait|${i}` }))
        return true;
    const when = e.help?.only ? e.help.when : e.when;
    return parseWhen(when).conds.every(c => condReachable(g, w, c));
}
// What a way still asks, in words ("friendship with Mio (Friend; now Acquaintance)", "how Ayaka's storyline ends").
function missingOf(g, w, t, e) {
    const when = e.help?.only ? e.help.when : e.when;
    const words = when ? missingWords(g, w, when, undefined, { more: true }).filter(x => x !== 'something more') : [];
    if (e.help?.only && e.help.money && g.player.money < e.help.money)
        words.push(`${money(w, e.help.money)} (you have ${money(w, g.player.money)})`);
    return words.join(', ') || 'something more';
}
// Why a good way can't be reached any more, in words.
function whyNot(g, w, e) {
    const conds = parseWhen(e.help?.only ? e.help.when : e.when).conds;
    for (const c of conds) {
        if (c.key === 'thread' && !whenHolds(g, w, condText(c), { day: true })) {
            const id = c.values[0].split(/\s+/)[0];
            if (threadStates(g)[id]?.ended)
                return `${threadOwner(w, id)}'s storyline ended another way`;
        }
        if (c.key === 'seen' && !whenHolds(g, w, condText(c), { day: true }))
            return 'a moment went another way';
    }
    return 'it can no longer go that way';
}
const priceText = (w, h) => [h.money ? money(w, h.money) : '', h.hours ? `${h.hours} hour${h.hours === 1 ? '' : 's'} together` : ''].filter(Boolean).join(' and ');
function helpOf(g, w, t, list, remote = false) {
    for (const e of list) {
        const h = e.help, i = (t.endings ?? []).indexOf(e);
        if (!e.good || !h || (remote && !h.remote) || !whenHolds(g, w, h.when, { day: true, key: `thread|${t.id}|help|${i}` }))
            continue;
        return { e, h, price: priceText(w, h), ok: g.player.money >= (h.money ?? 0) };
    }
    return null;
}
export function decideNow(g, w, t) {
    const list = t.endings ?? [];
    let f = -1;
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.when || e.help?.only)
            continue;
        const p = pendingOf(g, w, t, e, i);
        if (p)
            return { kind: 'pending', ...p, ending: wouldEnd(g, w, t), help: helpOf(g, w, t, list), waitFor: [] };
        if (endHolds(g, w, t, e, i)) {
            f = i;
            break;
        }
    }
    const F = f >= 0 ? list[f] : fallbackOf(list), at = F ? list.indexOf(F) : list.length;
    const before = list.slice(0, at).filter(e => e.good && e !== F);
    if (F?.good) {
        const onWay = before.filter(e => e.waits && whenHolds(g, w, e.waits, { day: true, key: `thread|${t.id}|wait|${list.indexOf(e)}` }) && !endHolds(g, w, t, e, list.indexOf(e)));
        if (!onWay.length)
            return { kind: 'happens', now: F, ending: F, waitFor: [] };
        return { kind: 'card', now: F, ending: F, waitFor: onWay.map(e => ({ e, missing: missingOf(g, w, t, e) })), help: null };
    }
    const help = helpOf(g, w, t, before);
    // (the way Help takes is said by its button; it's under Wait too when it can also come without paying, as Kaito's
    // can with his friendship: having the money never takes Wait away. A way taken through Help alone isn't.)
    const waitFor = before.filter(e => (e !== help?.e || !e.help?.only) && reachable(g, w, t, e)).map(e => ({ e, missing: missingOf(g, w, t, e) }));
    const dead = before.filter(e => !reachable(g, w, t, e));
    const why = !waitFor.length && !help ? (dead.length ? `${you(dead.map(e => whyNot(g, w, e)).filter((x, i, a) => a.indexOf(x) === i).join('; '))}.` : 'Nothing can change how it ends now.') : undefined;
    return { kind: 'card', ending: F, help, waitFor, ...(why ? { why } : {}) };
}
/* ---------- the deciding scene ---------- */
// A scene: the same day, place and visit (a visit ends when you leave or sleep, sim/visits.ts).
const sceneKey = (g) => `${g.day}|${g.player.loc}|${g.visitStart ?? 0}`;
const sceneOf = (g) => {
    const k = sceneKey(g), s = (g.threadScene ??= { key: k, looked: [] });
    if (s.key !== k) {
        s.key = k;
        delete s.id;
        s.looked = [];
    }
    return s;
};
const here = (g, w, r) => !g.asleep && r.met && presentAt(g, w, g.player.loc).includes(r);
// Does this storyline's card wait for an answer in this scene?
function cardOpen(g, st) {
    if (st.ended || st.due === undefined)
        return false;
    if (st.talk === sceneKey(g))
        return true;
    return !st.on && (st.waiting === undefined || st.asked?.by === 'card');
}
// The deciding scene with someone present: the secret told, then the endings weighed; one card a scene, the oldest
// due first. After Wait, a later scene looks again: a good way that holds now happens, otherwise nothing is asked.
function decideHere(g, w, list) {
    const all = threadStates(g);
    const due = list.filter(x => { const s = all[x.t.id]; return s && !s.ended && s.due !== undefined; });
    if (!due.length)
        return;
    const sc = sceneOf(g);
    due.sort((a, b) => (all[a.t.id].due ?? 0) - (all[b.t.id].due ?? 0));
    for (const { t, r } of due) {
        const st = all[t.id];
        if (sc.looked.includes(t.id) || !here(g, w, r) || (sc.id && sc.id !== t.id))
            continue;
        sc.looked.push(t.id);
        // a deciding scene tells the secret first (a look again after Wait, or while it hangs on another, doesn't)
        if (st.waiting === undefined && !st.on && st.known === undefined)
            revealThread(g, w, t.id, 'told');
        let d = decideNow(g, w, t);
        if (d.link) {
            const x = findThread(g, w, d.link);
            if (x)
                openThread(g, w, x.t, x.r);
            d = decideNow(g, w, t);
        }
        if (d.kind === 'pending') {
            st.on = d.on;
            continue;
        }
        if (st.on) {
            delete st.on;
            delete st.waiting;
            st.next = Math.max(st.next ?? 0, g.day + half(g));
        } // (what it hung on is over: a deciding scene again)
        if (st.known === undefined)
            revealThread(g, w, t.id, 'told');
        if (d.kind === 'happens') {
            sc.id = t.id;
            endThread(g, w, t, r, d.now, 'scene');
            continue;
        }
        if (cardOpen(g, st))
            sc.id = t.id;
    }
}
function cardOf(g, w, t, r, st) {
    const d = decideNow(g, w, t);
    const choices = [];
    const stake = `${you(trim(t.known ?? t.hidden))}.`;
    const base = { who: r.avatar, name: r.name, thread: t.id, title: titleOf(t, r), stake };
    if (d.kind === 'pending') {
        if (st.talk !== sceneKey(g))
            return null;
        if (d.help)
            choices.push({ id: 'help', label: d.help.h.label, price: d.help.price, ok: d.help.ok });
        choices.push({ id: 'let', label: 'Let it be' });
        return { ...base, choices, pending: d.on ? threadOwner(w, d.on) : undefined };
    }
    if (d.kind === 'happens')
        return { ...base, choices: [{ id: 'now', label: 'Now' }] };
    if (d.now) {
        choices.push({ id: 'now', label: 'Now' }, { id: 'wait', label: 'Wait', missing: d.waitFor.map(x => x.missing) });
        return { ...base, choices };
    }
    if (d.help)
        choices.push({ id: 'help', label: d.help.h.label, price: d.help.price, ok: d.help.ok });
    if (d.waitFor.length || (d.help && !d.help.ok))
        choices.push({ id: 'wait', label: 'Wait', missing: [...d.waitFor.map(x => x.missing), ...(d.help && !d.help.ok ? [`${d.help.price} for "${d.help.h.label}" (you have ${money(w, g.player.money)})`] : [])] });
    choices.push({ id: 'let', label: 'Let it be' });
    return { ...base, choices, ...(d.why ? { why: d.why } : {}) };
}
/** The deciding card of this scene (the person here, its card waiting for an answer), or null. */
export function decideCard(g, w) {
    if (!systemOn(w, 'living'))
        return null;
    const sc = g.threadScene;
    if (!sc?.id || sc.key !== sceneKey(g))
        return null;
    const x = findThread(g, w, sc.id), st = threadStates(g)[sc.id];
    if (!x || !st || !cardOpen(g, st) || !here(g, w, x.r))
        return null;
    return cardOf(g, w, x.t, x.r, st);
}
// Help, Wait or Meet: the count of last chances starts over, the next one a season later.
function answered(g, st) { st.missed = 0; delete st.asked; delete st.talk; st.next = g.day + seasonDays(g); }
// Pays a help: the money, and the hours together pass.
function payHelp(g, w, h) {
    if (!h.ok)
        return false;
    g.player.money -= h.h.money ?? 0;
    if (h.h.hours)
        advance(g, w, h.h.hours * 60);
    return true;
}
/** The player's answer on the deciding card. Returns what to show (`ok` false: nothing changed). The caller refreshes
 *  the AI's prompt (the scene changes at once). */
export function answerDecide(g, w, id, choice) {
    const card = decideCard(g, w);
    if (!card || card.thread !== id || !card.choices.some(c => c.id === choice))
        return { ok: false, lines: [] };
    const x = findThread(g, w, id), st = threadStates(g)[id], d = decideNow(g, w, x.t);
    if (choice === 'wait') {
        answered(g, st);
        st.waiting = g.day;
        return { ok: true, lines: [] };
    }
    if (choice === 'let')
        return { ok: true, lines: endThread(g, w, x.t, x.r, d.kind === 'pending' ? wouldEnd(g, w, x.t) : d.ending, 'let') };
    if (choice === 'now')
        return { ok: true, lines: endThread(g, w, x.t, x.r, d.now, 'scene') };
    if (!d.help || !payHelp(g, w, d.help))
        return { ok: false, lines: d.help ? [`You don't have ${money(w, d.help.h.money ?? 0)}.`] : [] };
    return { ok: true, lines: endThread(g, w, x.t, x.r, d.help.e, 'help') };
}
/** Talk about it (the person's page): brings the card back in this scene, while it waits for you or on another
 *  storyline. */
export function talkAbout(g, w, id) {
    const x = findThread(g, w, id), st = threadStates(g)[id];
    if (!x || !st || st.ended || st.due === undefined || !systemOn(w, 'living'))
        return { ok: false };
    if (!here(g, w, x.r))
        return { ok: false, why: `You need to be with ${first(x.r)}.` };
    const sc = sceneOf(g);
    st.talk = sc.key;
    sc.id = id;
    if (!sc.looked.includes(id))
        sc.looked.push(id);
    return { ok: true };
}
/* ---------- last chances ---------- */
const liveDue = (g, w) => (systemOn(w, 'living') ? threadsOf(g, w) : []).filter(({ t, r }) => {
    const st = threadStates(g)[t.id];
    return !!st && !st.ended && st.due !== undefined && !st.on && r.met && !goneFromMap(r) && r.avatar !== self(g);
}).sort((a, b) => (threadStates(g)[a.t.id].due ?? 0) - (threadStates(g)[b.t.id].due ?? 0));
// One left unanswered (or "not now"): the next a season after it. The last one ends it the way it would without you;
// a storyline marked `ignored: cool` instead cools them toward you by a friendship level and waits again, once; one
// marked `noLast` (museum) never ends this way: its nudges come round again as reminders.
function missOne(g, w, t, r, st) {
    const from = st.asked?.day ?? g.day;
    st.missed = (st.missed ?? 0) + 1;
    delete st.asked;
    st.next = from + seasonDays(g);
    if (t.noLast) {
        st.missed %= nudgesOf(t).length;
        return [];
    }
    if (st.missed < nudgesOf(t).length)
        return [];
    if (t.ignored === 'cool' && st.cooled === undefined) {
        st.cooled = g.day;
        st.missed = 0;
        coolOff(g, r);
        return r.met ? [`${r.name} stopped waiting to hear from you about it, and is cooler toward you now.`] : [];
    }
    return endThread(g, w, t, r, endsWithoutYou(g, w, t), 'nudges');
}
// A friendship level down (just under the level they're at, and at least 10 lower), never below a stranger.
function coolOff(g, r) {
    const v = fr(g, r.avatar, YOU), tier = FRIEND_TIERS.find(x => v >= x.lo && v < x.hi);
    if (!tier || tier.lo < 10)
        return;
    setFr(g, r.avatar, YOU, Math.max(0, Math.min(v - 10, tier.lo - 1)));
}
// The text a last chance sends: the storyline's own nudge in order (the last says it's the last), worded by the AI.
function sendNudge(g, w, t, r, st) {
    const list = nudgesOf(t), n = Math.min(st.missed ?? 0, list.length - 1), last = !t.noLast && n === list.length - 1;
    const ask = (st.asked = { day: g.day, n, by: 'text', text: list[n] });
    const me = personaName();
    const about = st.known !== undefined ? `what is going on (${decideOf(t).replace(/\{\{user\}\}/g, me)})` : 'something they have kept to themselves; they don\'t say what it is by text';
    const brief = `${r.name} texts ${me}: they would like to meet and talk about ${about}.${last ? ' They have to decide soon, and this is the last time they ask.' : ''} A short message in their own voice, like: "${list[n]}"`;
    void textFrom(g, w, r.avatar, brief, list[n]).then(text => { ask.text = text; unread(g, r.avatar); }).catch(() => { });
}
// The days storyline texts went out this past week (`g.threadTexts`): with many storylines waiting at once, the phone
// shouldn't fill with them, so the rest wait their turn (a last chance counts as missed only once it has been sent).
const textsThisWeek = (g) => {
    const a = g, list = (Array.isArray(a.threadTexts) ? a.threadTexts : []).filter((d) => typeof d === 'number' && g.day - d < 7);
    return (a.threadTexts = list);
};
/** Each hour: last chances left unanswered for three days count as missed; a storyline whose last chance is due gets it,
 *  in person when you're together (the card again), else by text later in the day (one storyline text a day and two a
 *  week at most, the oldest due first). Sent with "Characters take the initiative" off too. */
export function lastChances(g, w) {
    const list = liveDue(g, w), out = [];
    for (const { t, r } of list) {
        const st = threadStates(g)[t.id];
        if (st.asked && g.day - st.asked.day >= STORYLINE.answer)
            out.push(...missOne(g, w, t, r, st));
    }
    const h = Math.floor(g.minutes / 60);
    if (g.asleep || h < STORYLINE.dayFrom || h > STORYLINE.until)
        return out;
    const phone = systemOn(w, 'plans');
    const week = textsThisWeek(g);
    let texted = g.threadText === g.day || week.length >= STORYLINE.perWeek;
    for (const { t, r } of list) {
        const st = threadStates(g)[t.id];
        if (st.ended || st.asked || g.day < (st.next ?? st.due + half(g)))
            continue;
        if (here(g, w, r)) {
            st.asked = { day: g.day, n: Math.min(st.missed ?? 0, nudgesOf(t).length - 1), by: 'card' };
            delete st.waiting;
            const sc = sceneOf(g);
            sc.looked = sc.looked.filter(x => x !== t.id); // (this scene looks at it again: the card, or a way that holds now)
            continue;
        }
        if (!phone || texted || h < STORYLINE.textFrom)
            continue;
        sendNudge(g, w, t, r, st);
        g.threadText = g.day;
        week.push(g.day);
        texted = true;
        out.push(`${r.name} sent you a message.`);
    }
    return out;
}
export function nudgeAsk(g, w, who) {
    for (const { t, r } of liveDue(g, w)) {
        const st = threadStates(g)[t.id];
        if (st.asked?.by !== 'text' || (who && r.avatar !== who))
            continue;
        const list = nudgesOf(t), help = helpOf(g, w, t, t.endings ?? [], true);
        return { thread: t.id, who: r.avatar, name: r.name, title: titleOf(t, r), text: st.asked.text ?? list[st.asked.n], n: st.asked.n, last: !t.noLast && st.asked.n === list.length - 1,
            choices: [{ id: 'meet', label: 'Meet them' }, ...(help ? [{ id: 'help', label: help.h.label, price: help.price, ok: help.ok }] : []), { id: 'not', label: 'Not now' }] };
    }
    return null;
}
/** Your answer to a last chance by text: Meet them (they invite you, and the next scene together brings the card),
 *  Help (a help that works by text), Not now (counted as missed). */
export function answerNudge(g, w, id, choice) {
    const x = findThread(g, w, id), mine = x && nudgeAsk(g, w, x.r.avatar);
    if (!x || !mine || mine.thread !== id || !mine.choices.some(c => c.id === choice))
        return { ok: false, lines: [] };
    const st = threadStates(g)[id];
    if (choice === 'not')
        return { ok: true, lines: missOne(g, w, x.t, x.r, st) };
    if (choice === 'meet') {
        answered(g, st);
        delete st.waiting;
        inviteSoon(g, x.r.avatar);
        return { ok: true, lines: [`${first(x.r)} will tell you when and where.`] };
    }
    const h = helpOf(g, w, x.t, x.t.endings ?? [], true);
    if (!h || !payHelp(g, w, h))
        return { ok: false, lines: h ? [`You don't have ${money(w, h.h.money ?? 0)}.`] : [] };
    return { ok: true, lines: endThread(g, w, x.t, x.r, h.e, 'help') };
}
export function storylineOf(g, w, who) {
    if (!systemOn(w, 'living'))
        return null;
    const x = threadsOf(g, w).find(y => y.r.avatar === who), st = x && threadStates(g)[x.t.id];
    if (!x || !st || st.known === undefined)
        return null;
    const base = { thread: x.t.id, title: titleOf(x.t, x.r) };
    if (st.ended) {
        const e = x.t.endings?.find(y => y.id === st.ended);
        return { ...base, state: 'ended', ...(e ? { ending: `${you(trim(e.text))}.` } : {}), talk: false };
    }
    if (st.due === undefined)
        return { ...base, state: 'under way', talk: false };
    const d = decideNow(g, w, x.t), talk = here(g, w, x.r);
    if (st.on || d.kind === 'pending')
        return { ...base, state: 'pending', on: threadOwner(w, st.on ?? d.on ?? ''), talk };
    return { ...base, state: st.waiting !== undefined ? 'waiting' : 'due', missing: d.waitFor.map(y => y.missing), talk };
}
/* ---------- the player learns it ---------- */
/** The player learns a thread (a story's choice, an overheard rumor, being told, Insight, a sighting). Learning about
 *  someone you've met opens their storyline. Returns false when it's unknown or already known. */
export function revealThread(g, w, id, how) {
    const x = findThread(g, w, id);
    if (!x || !systemOn(w, 'living'))
        return false;
    const st = (threadStates(g)[id] ??= { stage: -1, since: g.day });
    if (st.known !== undefined)
        return false;
    st.known = g.day;
    st.how = how;
    if (how !== 'insight')
        earn(g, w, 'secret', id); // a secret learned: life points (not one bought with them)
    if (st.stage < 0 && !st.ended && opensNow(g, w, x.t, x.r, st))
        openThread(g, w, x.t, x.r);
    return true;
}
export const knowsThread = (g, id) => threadStates(g)[id]?.known !== undefined;
// Who tells you, here and now: someone who trusts you enough tells their secret (a moment: they open up in this scene);
// a stage that's out in the open is simply known once you see them; a rumor you overheard tells you too. Storylines
// open as soon as they can, and the deciding scenes come.
export function lookThreads(g, w) {
    const list = systemOn(w, 'living') ? threadsOf(g, w) : [];
    if (!list.length)
        return;
    const all = threadStates(g);
    for (const { t, r } of list) {
        const st = (all[t.id] ??= { stage: -1, since: g.day });
        if (st.stage < 0 && !st.ended && opensNow(g, w, t, r, st))
            openThread(g, w, t, r);
    }
    if (systemOn(w, 'rumors')) {
        for (const rumor of rumorPool(g))
            if (rumor.thread && rumor.knownBy.includes(YOU))
                revealThread(g, w, rumor.thread, 'rumor');
    }
    const present = new Set(presentAt(g, w, g.player.loc).filter(r => r.met).map(r => r.avatar));
    for (const { t, r } of list) {
        const st = all[t.id];
        if (!present.has(r.avatar) || !st || st.known !== undefined || st.ended || st.stage < 0)
            continue;
        if (t.stages[st.stage]?.tell === 'known') {
            revealThread(g, w, t.id, 'open');
            continue;
        }
        const trust = t.reveal ?? `feels: ${r.name} good`;
        if (rnd(g, `tell|${t.id}`) < TELL && whenHolds(g, w, trust, { key: `thread|${t.id}|reveal` })) {
            revealThread(g, w, t.id, 'friend');
            queueMoment(g, { who: r.avatar, kind: 'thread', tier: `${t.id}:tell`, text: `${r.name} trusts {{user}} enough now: in this scene ${r.name} tells {{user}} what they have kept to themselves (${t.hidden.replace(/[.\s]+$/, '')}), in their own way.`, until: g.day + 3 });
        }
    }
    decideHere(g, w, list.filter(x => present.has(x.r.avatar)));
}
/** Does a thread moment still fit (the stage it came with is still on, or the secret is still being told)? */
export function threadMomentFits(g, tier) {
    const [id, i] = tier.split(':');
    const st = threadStates(g)[id];
    if (!st || st.ended)
        return false;
    return i === 'tell' ? st.known !== undefined : st.stage === Number(i);
}
/* ---------- for the AI ---------- */
/** The `threads` block: for each person here, their storyline as the player knows it (or doesn't), a recent ending,
 *  an ending played in this scene, the deciding scene, a storyline waiting for you or on another. A secret the player
 *  hasn't learned is never told as something {{user}} knows. */
export function threadLines(g, w, present) {
    if (!systemOn(w, 'living'))
        return [];
    const here = new Set(present.map(r => r.avatar)), all = threadStates(g), out = [];
    // a `hint` effect (Trusted, a life goal's perk): a friend's hidden stage shows in small signs too
    let h;
    const hint = () => (h ??= effectAdd(g, w, 'hint') >= 1);
    const sc = g.threadScene, key = sceneKey(g);
    for (const { t, r } of threadsOf(g, w)) {
        const st = all[t.id];
        if (!here.has(r.avatar) || !st)
            continue;
        const n = r.name;
        if (st.ended) {
            const e = t.endings?.find(x => x.id === st.ended);
            if (e && st.endDay === g.day && ['scene', 'let', 'help'].includes(st.endedBy ?? ''))
                out.push(`In this scene: ${trim(e.text)}. ${n} lives it now with {{user}}.`);
            else if (e && g.day - (st.endDay ?? 0) <= NEWS_DAYS)
                out.push(`Lately for ${n}: ${trim(e.text)}.`);
            continue;
        }
        const s = st.stage >= 0 ? t.stages[st.stage] : null;
        if (!s)
            continue;
        const now = ` Right now: ${trim(s.text)}.`;
        if (st.known !== undefined) {
            // ('saw': at the desk of a hotel of theirs, B-14; they don't know {{user}} saw)
            const from = st.how === 'rumor' ? ' (heard around town)' : st.how === 'story' || st.how === 'insight' ? ' (found out)' : st.how === 'friend' || st.how === 'told' ? ` (${n} told them)` : st.how === 'saw' ? ` (seen at {{user}}'s hotel; ${n} doesn't know {{user}} saw)` : '';
            out.push(`${trim(t.known ?? `{{user}} knows: ${t.hidden}`)}${from}.${now}`);
        }
        else if (s.tell === 'known')
            out.push(`${n} no longer hides it: ${trim(t.hidden)}.${now} ${n} tells {{user}} if it comes up.`);
        else if (s.tell === 'hinted' || (hint() && levelHolds(g, w, r.avatar, 'friend')))
            out.push(`${n} keeps something from {{user}}, but small signs show: ${trim(t.hidden)}.${now} ${n} doesn't say it outright; {{user}} doesn't know it.`);
        else
            out.push(`${n} keeps a secret, and nothing gives it away: ${trim(t.hidden)}.${now} {{user}} doesn't know it; ${n} doesn't tell.`);
        if (st.cooled !== undefined && !st.ended)
            out.push(`${n} reached out to {{user}} several times lately and never heard back, and is a little cooler toward {{user}} for it.`);
        if (st.due === undefined || st.known === undefined)
            continue;
        if (sc?.id === t.id && sc.key === key && cardOpen(g, st))
            out.push(`${decideOf(t)}. ${n} brings it up with {{user}} in this scene, in their own way. What {{user}} does about it is shown to the player and decided apart: don't settle it in the story.`);
        else if (st.on)
            out.push(`${t.title?.trim() ? `For ${n}, ${t.title.trim()}` : `${n}'s storyline`} hangs on how ${threadOwner(w, st.on)}'s storyline ends.`);
        else if (st.waiting !== undefined) {
            const d = decideNow(g, w, t);
            const m = d.waitFor.map(x => x.missing).join('; ');
            out.push(`${n} is waiting to see whether {{user}} can help${m ? `: ${m}` : ''}.`);
        }
    }
    return out;
}
/* ---------- old saves (schema 7) ---------- */
/** (schema 7, ST-7) Old saves meet storylines that wait for the player, once the world is known (`g.threadsTodo`, set
 *  by the migration in core/saves.ts): ended ones stay as they ended; one under way whose person you haven't met goes
 *  back to not begun (a secret learned stays learned); one under way with someone you've met keeps its stage and opens
 *  from its stage's day, due today if its last stage is over. `waitFrom` goes. Returns what moved (null: nothing to
 *  do). A second run finds no flag and changes nothing. */
export function settleThreads(g, w) {
    if (!g.threadsTodo)
        return null;
    const all = threadStates(g);
    let reset = 0, kept = 0;
    for (const r of residents(g))
        for (const t of exampleOf(w, r)?.threads ?? []) {
            const st = all[t.id];
            if (!st || typeof st !== 'object' || !t.stages?.length)
                continue;
            if (st.ended) {
                st.endedBy ??= 'calendar';
                continue;
            }
            if (!(st.stage >= 0))
                continue;
            if (!r.met) {
                st.stage = -1;
                st.since = g.day;
                delete st.opened;
                reset++;
                continue;
            }
            st.opened ??= st.since;
            kept++;
            if (st.stage >= t.stages.length - 1 && st.due === undefined) {
                st.stage = t.stages.length - 1;
                const s = t.stages[st.stage];
                if (s.when ? !holds(g, w, s, t.id, st.stage) : g.day - st.since >= seasonDays(g)) {
                    st.due = g.day;
                    st.next = g.day + half(g);
                }
            }
        }
    for (const st of Object.values(all))
        if (st && typeof st === 'object')
            delete st.waitFrom;
    delete g.threadsTodo;
    return { reset, kept };
}
onDay.push((g, w) => advanceThreads(g, w));
onHour.push((g, w) => lastChances(g, w));
onLook.push((g, w) => lookThreads(g, w));
