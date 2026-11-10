// The boss's message about a course. When you are one rank below a rank that needs a course you don't have, doing well
// and about halfway through the rank, the highest-ranked person of your job in the world (else "the manager", in the
// work app) writes to suggest it: where it is taught, how long it takes and what help you would get. The engine decides
// when, who and which course and writes the facts; the AI only words the message (the engine's own words stand in when
// it can't), and no number in it is ever read back. Once per course per job, and once more a season later if you
// haven't enrolled. The job page also names a rank two steps ahead that needs a course, and a job that asks for a
// course tells you what to do when it turns you away.
import { nowAbs, type Save } from '../core/store.js';
import { systemOn, aiVoice, type WorldDef, type Occupation, type Course } from '../core/world.js';
import { lex } from '../core/lexicon.js';
import { personaName, sayLine } from '../st/bridge.js';
import { aiLangName } from '../core/i18n.js';
import { onDay } from './hooks.js';
import { seasonDays } from './time.js';
import { textFrom, social } from './social.js';
import { whenHolds } from './when.js';
import { jobDef, nextRankOf, careerOf, bossOf, rankDays, PROMO_PERF } from './work.js';
import { courseOf, hasCourse, isTaking, learning, spanOf, factsOf, whereWords, type WorkMsg } from './courses.js';
import type { Resident } from '../core/store.js';

/** Messages kept in the work app per save (the newest). */
const KEEP = 8;

/** Why the boss writes now: the course the next rank asks for, when it is the moment. */
export interface Nudge { course: Course; job: Occupation; rank: string; key: string }
export function nudgeFor(g: Save, w: WorldDef): Nudge | null {
    if (!systemOn(w, 'courses') || !systemOn(w, 'jobs')) return null;
    const j = g.player.job as { id: string; rank: number; perf?: number; since?: number } | null, o = jobDef(w, j?.id);
    if (!j || !o) return null;
    const next = nextRankOf(g, o), c = next?.course ? courseOf(w, next.course) : undefined;
    if (!next || !c || c.retired || hasCourse(g, c.id) || isTaking(g, c.id)) return null;
    if (c.needs && !whenHolds(g, w, c.needs)) return null;
    if (Math.round(j.perf ?? 50) < PROMO_PERF) return null;
    // about halfway through the rank, at once when the rank is shorter than the course
    const rank = rankDays(g, w, o, j.rank), inRank = (nowAbs(g) - (j.since ?? nowAbs(g))) / 1440;
    if (rank >= spanOf(g, w, c) && inRank < rank * 0.5) return null;
    const key = `${o.id}|${c.id}`, sent = learning(g).nudged[key] ?? [];
    if (sent.length >= 2 || (sent.length === 1 && g.day - sent[0] < seasonDays(g))) return null;
    return { course: c, job: o, rank: next.name, key };
}

/** The engine's own words (what the message says when the AI can't word it). */
const fallbackText = (n: Nudge) => `I have been pleased with your work. The next step, ${n.rank}, asks for "${n.course.name}". If you want to go further, think about taking it.`;
// What the AI is told to say: who writes, about what, and that the numbers are not its to give.
function brief(n: Nudge, from: string, me: string): string {
    return `${from} thinks well of ${me}'s work at ${n.job.name} and writes to suggest the course "${n.course.name}", which the next step, ${n.rank}, asks for. A short, warm message in their own voice: they appreciate ${me}'s work and suggest the course if ${me} wants to go further. Do not give any numbers, prices or dates: those are shown to ${me} separately.`;
}
// The manager has no card: one quiet line from the AI in a made-up voice, or the engine's words.
async function managerWords(g: Save, w: WorldDef, n: Nudge, fallback: string): Promise<string> {
    const me = personaName();
    const prompt = [`[The work app of ${n.job.name} in ${w.name}. The manager writes ${me} a short message (one to three sentences), ${aiVoice(w)}, written in ${aiLangName(g.lang)}.]`,
        `[${brief(n, 'The manager', me)}]`, 'The manager:'].join('\n');
    try { const t = await sayLine(prompt, 'The manager', ['The manager', me], 320, 120, 'later'); return t || fallback; } catch { return fallback; }
}

/** Writes the message now: to the boss's thread when there is a boss in the world (and a phone), else the work app. */
export function sendNudge(g: Save, w: WorldDef, n: Nudge): string {
    const l = learning(g);
    (l.nudged[n.key] ??= []).push(g.day);
    const boss: Resident | null = bossOf(g, w, n.job);
    const phone = !!boss && boss.met && systemOn(w, 'plans');
    const from = phone ? boss!.name : 'The manager';
    const msg: WorkMsg = { day: g.day, from, job: n.job.id, course: n.course.id, text: fallbackText(n), facts: factsOf(g, w, n.course) };
    l.inbox.push(msg); if (l.inbox.length > KEEP) l.inbox.splice(0, l.inbox.length - KEEP);
    const me = personaName();
    if (phone) {
        const a = boss!.avatar;
        void textFrom(g, w, a, brief(n, boss!.name, me), msg.text).then(t => { msg.text = t; const s = social(g); s.unread[a] = (s.unread[a] ?? 0) + 1; }).catch(() => { /* offline */ });
    } else void managerWords(g, w, n, msg.text).then(t => { msg.text = t; }).catch(() => { /* offline */ });
    return `${from} sent you a message about a course.`;
}
onDay.push((g, w) => { const n = nudgeFor(g, w); return n ? [sendNudge(g, w, n)] : []; });

/** The messages about courses for the job you hold (newest first), for the job page. */
export const nudgesFor = (g: Save, jobId: string): WorkMsg[] => learning(g).inbox.filter(m => m.job === jobId).reverse();

/** A rank two steps ahead that needs a course you don't have: the job page says so early. */
export function aheadCourse(g: Save, w: WorldDef, o: Occupation): { rank: string; course: Course } | null {
    const j = g.player.job; if (!j || j.id !== o.id || !systemOn(w, 'courses')) return null;
    const r = careerOf(g, o).ranks[j.rank + 2], c = r?.course ? courseOf(w, r.course) : undefined;
    return r && c && !c.retired && !hasCourse(g, c.id) ? { rank: r.name, course: c } : null;
}

/** What the work screen says when a job turns you away for a course: the way in, if its first rank is a student's. */
export function needCourseText(g: Save, w: WorldDef, o: Occupation, missing: string[]): string {
    const base = lex(w, 'needCourse', missing.join('", "'));
    const ids = ((o as any).courses ?? []) as string[];
    const open = ids.map(id => courseOf(w, id)).find(c => c && !c.retired && !hasCourse(g, c.id) && (!c.needs || whenHolds(g, w, c.needs)));
    if (o.ranks[0]?.student && open) return `${base} But you can start as ${o.ranks[0].name} while you study: enroll in ${open.name} (${whereWords(g, w, open)}) first.`;
    return base;
}
