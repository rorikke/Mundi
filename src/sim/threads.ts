// Threads (E22): the world's people's secrets and storylines, moving in stages over game time. Each example character
// may have threads (core/world.ts, `Thread`): a stage begins when its condition holds (`season: summer; seasonDays:
// 8-14`) and stages only move forward; once the last one is over the thread ends the way what happened says (the
// first ending whose condition holds), which may change the person's job or home. A stage can bring a moment (they
// bring it up with you), a rumor about them, a fact.
// What the AI is told, for the people present only: a secret not yet known to the player is told as hidden (they
// keep it) or hinted (small signs show), never as something {{user}} knows; a stage told `known` is out in the open
// (they don't hide it any more). The player learns a thread when its owner trusts them enough while they're together
// (`reveal`, by default a good friend), from a street story's choice, or by overhearing a rumor one of its stages
// started. It all belongs to the living world (`living`); nothing moves with it off.
import { type Save, type Resident } from '../core/store.js';
import { systemOn, type WorldDef, type Thread, type ThreadStage } from '../core/world.js';
import { onDay, onLook } from './hooks.js';
import { exampleOf, adultOn } from './dayplan.js';
import { presentAt, residents } from './people.js';
import { whenHolds } from './when.js';
import { startRumor, rumorPool, YOU } from './living.js';
import { queueMoment } from './moments.js';
import { note } from './facts.js';
import { homeSpot, takenHomes, normalizeHomes } from './homes.js';

const rnd = (g: Save, salt: string) => { let h = 2166136261; const s = `${g.world}|${g.day}|${salt}`; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/** A thread's state in the save (`g.threads`, by thread id): the stage it's at (-1: not begun), since which day,
 *  the day the player learned it (`known`) and how (`how`), how it ended and when. */
export interface ThreadState { stage: number; since: number; known?: number; how?: 'friend' | 'story' | 'rumor' | 'open'; ended?: string; endDay?: number }
export const threadStates = (g: Save) => ((g as any).threads ??= {}) as Record<string, ThreadState>;
// How long an ending is still news for the AI.
const NEWS_DAYS = 14;
// How likely, each day you're together, someone who trusts you enough tells you their secret.
const TELL = 0.5;

/** The threads of the people in this save (adult ones only with adult content on), with whose they are. */
export function threadsOf(g: Save, w: WorldDef): { t: Thread; r: Resident }[] {
    const out: { t: Thread; r: Resident }[] = [];
    for (const r of residents(g)) for (const t of exampleOf(w, r)?.threads ?? []) if (t.id && t.stages?.length && (!t.adult || adultOn(g))) out.push({ t, r });
    return out;
}
const findThread = (g: Save, w: WorldDef, id: string) => threadsOf(g, w).find(x => x.t.id === id) ?? null;
const holds = (g: Save, w: WorldDef, s: ThreadStage, id: string, i: number) => !s.when || whenHolds(g, w, s.when, { day: true, key: `thread|${id}|${i}` });
/** The stage a thread is at now (null: not begun, or over). */
export function stageOf(g: Save, t: Thread): ThreadStage | null {
    const st = threadStates(g)[t.id];
    return st && !st.ended && st.stage >= 0 ? t.stages[st.stage] ?? null : null;
}

/* ---------- moving on, day by day ---------- */

// The highest stage after the current one whose condition holds; on first sight, where the thread is now, without
// what the stages before it brought (a game that starts in summer doesn't replay spring).
function step(g: Save, w: WorldDef, t: Thread, r: Resident, first: boolean): string[] {
    const all = threadStates(g);
    const st = (all[t.id] ??= { stage: -1, since: g.day });
    if (st.ended) return [];
    let next = -1;
    for (let i = t.stages.length - 1; i > st.stage; i--) if (holds(g, w, t.stages[i], t.id, i)) { next = i; break; }
    if (next >= 0) {
        st.stage = next; st.since = g.day;
        if (!first) enterStage(g, w, t, r, next);
        return [];
    }
    // the last stage is over: the thread ends
    if (st.stage === t.stages.length - 1 && !holds(g, w, t.stages[st.stage], t.id, st.stage)) return endThread(g, w, t, r);
    return [];
}
// What a stage brings: a moment with you (when you know them), a rumor about them, a fact.
function enterStage(g: Save, w: WorldDef, t: Thread, r: Resident, i: number) {
    const s = t.stages[i];
    if (s.moment && r.met) queueMoment(g, { who: r.avatar, kind: 'thread', tier: `${t.id}:${i}`, text: momentText(r, s.moment), until: g.day + 14 });
    if (s.rumor) {
        // it goes round where they work and spend their time, never through them, and their close friends keep it
        const place = w.occupations.find(o => o.id === r.occupation)?.place ?? r.leisure[0] ?? '';
        startRumor(g, w, s.rumor, place, { about: r.name, secret: s.tell !== 'known', thread: t.id, id: `thread:${t.id}:${i}` });
    }
    if (s.fact) note(g, s.fact, [r.name], [r.avatar], `home:${r.avatar}`, 'thread');
}
// A moment written about them ("A collector phones Nanami…"): told as theirs to bring up, in this scene.
const momentText = (r: Resident, text: string) => `${text.replace(/[.\s]+$/, '')}: ${r.name} brings it up with {{user}} in this scene, in their own way.`;
// The first ending whose condition holds (what happened), else the last one without a condition.
function endThread(g: Save, w: WorldDef, t: Thread, r: Resident): string[] {
    const st = threadStates(g)[t.id];
    const list = t.endings ?? [];
    const e = list.find((x, i) => !!x.when && whenHolds(g, w, x.when, { day: true, key: `thread|${t.id}|end|${i}` })) ?? [...list].reverse().find(x => !x.when) ?? list.at(-1);
    st.ended = e?.id ?? 'over'; st.endDay = g.day;
    if (!e) return [];
    // a life that changes: the world's people keep their jobs and homes otherwise (E25), their stories may move them
    if (e.job && systemOn(w, 'jobs') && w.occupations.some(o => o.id === e.job) && r.occupation !== e.job) {
        r.occupation = e.job;
        delete ((g as any).living?.ranks ?? {})[r.avatar];
    }
    if (e.home && w.homes.zones.some(z => z.id === e.home) && r.home?.zone !== e.home && (r as any).homeWith !== '__you') {
        r.home = { ...homeSpot(w, e.home, takenHomes(g, r), g.player.home) };
        delete (r as any).homeWith;
        normalizeHomes(g);
    }
    note(g, e.text.replace(/\{\{user\}\}/g, '{u}'), [], [r.avatar], `home:${r.avatar}`, 'thread');
    if (e.fact) note(g, e.fact, [r.name], [r.avatar], `home:${r.avatar}`, 'thread');
    return [];
}
/** Moves every thread on (once a day; also on first sight). */
export function advanceThreads(g: Save, w: WorldDef): string[] {
    const list = systemOn(w, 'living') ? threadsOf(g, w) : [];
    if (!list.length) return [];   // (a world without threads keeps nothing in the save)
    const all = threadStates(g), out: string[] = [];
    for (const { t, r } of list) out.push(...step(g, w, t, r, !all[t.id]));
    return out;
}

/* ---------- the player learns it ---------- */

/** The player learns a thread (a story's choice, an overheard rumor, being told). Returns false when it's unknown or
 *  already known. */
export function revealThread(g: Save, w: WorldDef, id: string, how: ThreadState['how']): boolean {
    const x = findThread(g, w, id);
    if (!x || !systemOn(w, 'living')) return false;
    if (!threadStates(g)[id]) advanceThreads(g, w);   // first sight: where it is now
    const st = threadStates(g)[id];
    if (st.known) return false;
    st.known = g.day; st.how = how;
    return true;
}
export const knowsThread = (g: Save, id: string) => !!threadStates(g)[id]?.known;
// Who tells you, here and now: someone who trusts you enough tells their secret (a moment: they open up in this scene);
// a stage that's out in the open is simply known once you see them; a rumor you overheard tells you too.
export function lookThreads(g: Save, w: WorldDef) {
    const list = systemOn(w, 'living') ? threadsOf(g, w) : [];
    if (!list.length) return;
    const all = threadStates(g);
    if (!list.every(x => all[x.t.id])) advanceThreads(g, w);   // a new game, or someone new in it
    if (systemOn(w, 'rumors')) {
        for (const rumor of rumorPool(g)) if (rumor.thread && rumor.knownBy.includes(YOU)) revealThread(g, w, rumor.thread, 'rumor');
    }
    const here = new Set(presentAt(g, w, g.player.loc).filter(r => r.met).map(r => r.avatar));
    for (const { t, r } of list) {
        const st = all[t.id];
        if (!here.has(r.avatar) || !st || st.known || st.ended || st.stage < 0) continue;
        if (t.stages[st.stage]?.tell === 'known') { revealThread(g, w, t.id, 'open'); continue; }
        const trust = t.reveal ?? `feels: ${r.name} good`;
        if (rnd(g, `tell|${t.id}`) < TELL && whenHolds(g, w, trust, { key: `thread|${t.id}|reveal` })) {
            revealThread(g, w, t.id, 'friend');
            queueMoment(g, { who: r.avatar, kind: 'thread', tier: `${t.id}:tell`, text: `${r.name} trusts {{user}} enough now: in this scene ${r.name} tells {{user}} what they have kept to themselves (${t.hidden.replace(/[.\s]+$/, '')}), in their own way.`, until: g.day + 3 });
        }
    }
}
/** Does a thread moment still fit (the stage it came with is still on, or the secret is still being told)? */
export function threadMomentFits(g: Save, tier: string): boolean {
    const [id, i] = tier.split(':'); const st = threadStates(g)[id];
    if (!st || st.ended) return false;
    return i === 'tell' ? !!st.known : st.stage === Number(i);
}

/* ---------- for the AI ---------- */

const trim = (s: string) => s.trim().replace(/[.\s]+$/, '');
/** The `threads` block: for each person here, their storyline as the player knows it (or doesn't), and a recent
 *  ending. A secret the player hasn't learned is never told as something {{user}} knows. */
export function threadLines(g: Save, w: WorldDef, present: Resident[]): string[] {
    if (!systemOn(w, 'living')) return [];
    const here = new Set(present.map(r => r.avatar)), all = threadStates(g), out: string[] = [];
    for (const { t, r } of threadsOf(g, w)) {
        const st = all[t.id];
        if (!here.has(r.avatar) || !st) continue;
        const n = r.name;
        if (st.ended) {
            const e = t.endings?.find(x => x.id === st.ended);
            if (e && g.day - (st.endDay ?? 0) <= NEWS_DAYS) out.push(`Lately for ${n}: ${trim(e.text)}.`);
            continue;
        }
        const s = st.stage >= 0 ? t.stages[st.stage] : null;
        if (!s) continue;
        const now = ` Right now: ${trim(s.text)}.`;
        if (st.known) {
            const from = st.how === 'rumor' ? ' (heard around town)' : st.how === 'story' ? ' (found out)' : st.how === 'friend' ? ` (${n} told them)` : '';
            out.push(`${trim(t.known ?? `{{user}} knows: ${t.hidden}`)}${from}.${now}`);
        } else if (s.tell === 'known') out.push(`${n} no longer hides it: ${trim(t.hidden)}.${now} ${n} tells {{user}} if it comes up.`);
        else if (s.tell === 'hinted') out.push(`${n} keeps something from {{user}}, but small signs show: ${trim(t.hidden)}.${now} ${n} doesn't say it outright; {{user}} doesn't know it.`);
        else out.push(`${n} keeps a secret, and nothing gives it away: ${trim(t.hidden)}.${now} {{user}} doesn't know it; ${n} doesn't tell.`);
    }
    return out;
}

onDay.push((g, w) => advanceThreads(g, w));
onLook.push((g, w) => lookThreads(g, w));
