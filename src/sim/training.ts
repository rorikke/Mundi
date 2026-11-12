// Training together: you and one of the world's people set up lessons, one way (they teach you a skill they're good
// at, or you teach them one of yours) or both ways (an exchange: a Japanese speaker learning English from you while
// teaching you Japanese). It's agreed in conversation (ui/trainui.ts reads the replies); the engine says what's
// possible, keeps the arrangement and owns the numbers. Sessions are an hour together, twice a week at most: the learner
// gains experience by the gap between them, and never past a level below the teacher; both grow closer. Unused for 14
// days, it lapses. Rarely, someone who'd make a good arrangement with you is hinted to the AI as a moment, to offer when
// the talk turns that way. Belongs to the `mentors` system (which needs skills): off, none of it.
import type { Save, Resident } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { onDay, onHour } from './hooks.js';
import { note } from './facts.js';
import { fr, ro, gain, lose, touch, YOU } from './rel.js';
import { isMinor, romanceBlocked } from './family.js';
import { LEVELS, MAX_LEVEL, levelFor, levelOf, skillXp, skillsOf, skillName, trainSkill } from './hobbies.js';
import { speaks } from './language.js';
import { exampleOf } from './dayplan.js';
import { npcRank } from './longlife.js';
import { npcCareer } from './work.js';
import { presentAt } from './people.js';
import { isWith } from './social.js';
import { addStatus } from './needs.js';
import { effectMul } from './effects.js';
import { tallyEvent } from './tally.js';
import { initiativeOn, canSpend, spend, queueMoment, momentsOf } from './moments.js';
import { FRIEND_TIERS } from './romance.js';

/** The rules' numbers (requirements `training.md`, T-4). */
export const TRAIN = {
    teacher: 6,        // a teacher's level, at least
    gap: 3,            // levels above the learner, at least
    friends: FRIEND_TIERS.find(t => t.id === 'friend')!.lo,   // how they feel about you, at least (Friend)
    most: 2,           // arrangements at a time
    perWeek: 2,        // sessions in any 7 days, per arrangement
    minutes: 60,
    xp: 16, perLevel: 4, gapCap: 5,  // a session: 16 + 4 a level of gap (up to 5 levels): Japanese 1 → 4 in 5 sessions
    friendship: 3, romance: 1, finish: 6,
    lapse: 14,         // days without a session before it lapses
    lapseCost: 3,
    wait: 28,          // days before it can come up again with someone who said no, or whom you turned down
    noCost: 2,
    hintGap: 10,       // days between two hints, across everyone
    hintChance: 0.25,  // a day's chance for someone here who qualifies
    energy: 5,
};

/** An arrangement. `learn`: the skill they teach you; `teach`: the skill you teach them (an exchange has both). */
export interface Arrangement { id: number; who: string; learn?: string; teach?: string; since: number; last: number; sessions: number; days: number[]; done?: number; ended?: number }
interface Store {
    list: Arrangement[]; next: number;
    /** what people learned from you: experience per skill, on top of what they knew */
    learned: Record<string, Record<string, number>>;
    /** the last day a hint was given; the day each person was last hinted */
    hint: number; hinted: Record<string, number>;
    /** until which day nothing new comes up with them (a no, either way) */
    wait: Record<string, number>;
    /** apprentices from before training together (they finished learning a trait from you) */
    former?: { who: string; what: string }[];
}
export function trainingOf(g: Save): Store {
    const s = ((g as any).training ??= {}) as Store;
    s.list ??= []; s.next ??= 1; s.learned ??= {}; s.hint ??= -999; s.hinted ??= {}; s.wait ??= {};
    return s;
}
export const trainingOn = (w: WorldDef | null | undefined) => !!w && systemOn(w, 'mentors');
export const activeOf = (g: Save) => trainingOf(g).list.filter(a => !a.done && !a.ended && g.cast[a.who]);
export const arrangementWith = (g: Save, who: string) => activeOf(g).find(a => a.who === who) ?? null;

/* ---------- what someone knows ---------- */

// The skills arrangements are about: the world's own, none of the adult ones.
const trainable = (g: Save, w: WorldDef) => skillsOf(w, g).filter(s => !(s as { adult?: boolean }).adult);
const isLanguage = (w: WorldDef, id: string) => id === w.language?.local || !!w.language?.others?.includes(id);
/** Their level in a skill: the highest of what the world says they're good at, their languages, what their job's rank
 *  asks (a broth cook cooks at 5 or better), and what they learned from you. */
export function personLevel(g: Save, w: WorldDef, r: Resident, id: string): number {
    const ex = exampleOf(w, r);
    let n = ex?.skills?.[id] ?? 0;
    if (isLanguage(w, id)) n = Math.max(n, speaks(w, r, id));
    const o = r.occupation ? w.occupations.find(x => x.id === r.occupation) : null;
    if (o) {
        n = Math.max(n, o.skills?.[id] ?? 0);
        const ranks = npcCareer(o, r.avatar, g).ranks, top = Math.min(npcRank(g, r.avatar), ranks.length - 1);
        for (let i = 0; i <= top; i++) n = Math.max(n, Number(ranks[i]?.needs?.[id]) || 0);
    }
    const xp = trainingOf(g).learned[r.avatar]?.[id];
    return Math.min(MAX_LEVEL, Math.max(n, xp ? levelFor(xp) : 0));
}
const canTeach = (teacher: number, learner: number) => teacher >= TRAIN.teacher && teacher - learner >= TRAIN.gap;

/** What could be arranged with them, skill by skill: what they could teach you, what you could teach them (each list
 *  with the biggest gap first). Says nothing of whether they'd want to. */
export function possible(g: Save, w: WorldDef, who: string): { learn: string[]; teach: string[] } {
    const r = g.cast[who];
    if (!trainingOn(w) || !r) return { learn: [], teach: [] };
    const rows = trainable(g, w).map(s => ({ id: s.id, me: levelOf(g, s.id), them: personLevel(g, w, r, s.id) }));
    const learn = rows.filter(x => canTeach(x.them, x.me)).sort((a, b) => (b.them - b.me) - (a.them - a.me)).map(x => x.id);
    const teach = rows.filter(x => canTeach(x.me, x.them)).sort((a, b) => (b.me - b.them) - (a.me - a.them)).map(x => x.id);
    return { learn, teach };
}
/** Why nothing can be set up with them now ('' if it can): the rules on who, not on skills. `friends`: their feelings
 *  count (off: only whether it's worth checking a conversation at all). */
export function whyNot(g: Save, w: WorldDef, who: string, friends = true): string {
    const r = g.cast[who], s = trainingOf(g);
    if (!trainingOn(w)) return 'Off in this world.';
    if (!r || !r.met || (r as any).gone || isMinor(g, who) || (r as any).guest) return 'Not with them.';
    if (arrangementWith(g, who)) return 'You already train together.';
    if (activeOf(g).length >= TRAIN.most) return `You can keep ${TRAIN.most} arrangements at a time.`;
    if ((s.wait[who] ?? -1) >= g.day) return 'Not again so soon.';
    if (friends && fr(g, who, YOU) < TRAIN.friends) return 'You don\'t know each other well enough yet.';
    return '';
}
/** Anything to set up with them, under every rule. */
export function canArrange(g: Save, w: WorldDef, who: string): boolean {
    if (whyNot(g, w, who)) return false;
    const p = possible(g, w, who); return !!(p.learn.length || p.teach.length);
}

/* ---------- words ---------- */

const lower = (w: WorldDef, id: string) => (isLanguage(w, id) ? skillName(w, id) : skillName(w, id).toLowerCase());
/** What it is, in a few words ("a language exchange", "lessons in cooking"). */
export function kindWords(w: WorldDef, a: Pick<Arrangement, 'learn' | 'teach'>): string {
    if (a.learn && a.teach) return isLanguage(w, a.learn) && isLanguage(w, a.teach) ? 'a language exchange' : 'an exchange of lessons';
    return `lessons in ${lower(w, (a.learn ?? a.teach)!)}`;
}
/** Who teaches what, for screens and the AI ("Chloe teaches {{user}} Japanese and {{user}} teaches Chloe English"). */
export function whatWords(g: Save, w: WorldDef, a: Pick<Arrangement, 'who' | 'learn' | 'teach'>, me = '{{user}}'): string {
    const n = g.cast[a.who]?.name ?? '';
    const parts = [a.learn ? `${n} teaches ${me} ${lower(w, a.learn)}` : '', a.teach ? `${me} ${me === 'you' ? 'teach' : 'teaches'} ${n} ${lower(w, a.teach)}` : ''].filter(Boolean);
    return parts.join(' and ');
}

/* ---------- starting and ending ---------- */

// What's remembered (a fact: fixed English templates, so they translate; {u} is you).
const FACTS = {
    agreed: { both: '{u} and {0} agreed on {1}: {0} teaches {u} {2} and {u} teaches {0} {3}.', learn: '{u} and {0} agreed on lessons: {0} teaches {u} {2}.', teach: '{u} and {0} agreed on lessons: {u} teaches {0} {3}.' },
    finished: { both: '{u} and {0} finished {1}: {0} taught {u} {2} and {u} taught {0} {3}.', learn: '{0} finished teaching {u} {2}.', teach: '{u} finished teaching {0} {3}.' },
};
function remember(g: Save, w: WorldDef, a: Arrangement, what: keyof typeof FACTS) {
    const t = FACTS[what][a.learn && a.teach ? 'both' : a.learn ? 'learn' : 'teach'];
    note(g, t, [g.cast[a.who].name, what === 'agreed' ? kindWords(w, a) : kindWords(w, a).replace(/^an? /, 'their '), a.learn ? lower(w, a.learn) : '', a.teach ? lower(w, a.teach) : ''], [a.who], g.player.loc, what === 'agreed' ? 'meet' : 'goal');
}

/** Sets one up (it was agreed in a scene). Checks the rules again, and that the skills are still possible. */
export function arrange(g: Save, w: WorldDef, who: string, learn?: string, teach?: string): string {
    const why = whyNot(g, w, who); if (why) return why;
    const p = possible(g, w, who);
    if (learn && !p.learn.includes(learn)) learn = undefined;
    if (teach && !p.teach.includes(teach)) teach = undefined;
    if (!learn && !teach) return 'Nothing to teach each other there.';
    const s = trainingOf(g);
    const a: Arrangement = { id: s.next++, who, ...(learn ? { learn } : {}), ...(teach ? { teach } : {}), since: g.day, last: g.day, sessions: 0, days: [] };
    s.list.push(a);
    if (teach) { tallyEvent(g, 'apprentice', 1, who); (s.learned[who] ??= {})[teach] ??= LEVELS[personLevel(g, w, g.cast[who], teach)]; }
    remember(g, w, a, 'agreed');
    return `You and ${g.cast[who].name} agreed on ${kindWords(w, a)}.`;
}
/** A no, either way: nothing comes up with them for a while, and it's a little awkward. */
export function turnedDown(g: Save, who: string, romance = false) {
    trainingOf(g).wait[who] = g.day + TRAIN.wait;
    lose(g, 'f', who, YOU, TRAIN.noCost);
    if (romance && ro(g, who, YOU) > 0) lose(g, 'r', who, YOU, 1);
}
/** Not now, and it isn't anyone's fault (they don't know you well enough yet): only the wait. */
export const putOff = (g: Save, who: string) => { trainingOf(g).wait[who] = g.day + TRAIN.wait; };
export function endArrangement(g: Save, w: WorldDef, id: number, why = ''): string {
    const a = trainingOf(g).list.find(x => x.id === id && !x.done && !x.ended); if (!a) return '';
    a.ended = g.day;
    const n = g.cast[a.who]?.name ?? '';
    note(g, why ? '{u} and {0} stopped their {1} ({2}).' : '{u} and {0} stopped their {1}.', [n, kindWords(w, a).replace(/^an? /, ''), why], [a.who], g.player.loc, 'meet');
    return `You and ${n} stopped your ${kindWords(w, a).replace(/^an? /, '')}.`;
}

/* ---------- sessions ---------- */

export const sessionsThisWeek = (g: Save, a: Arrangement) => a.days.filter(d => g.day - d < 7).length;
const here = (g: Save, w: WorldDef, who: string) => isWith(g, who) || presentAt(g, w, g.player.loc).some(r => r.avatar === who);
/** Why there can't be a session now ('' if there can). */
export function sessionWhy(g: Save, w: WorldDef, a: Arrangement): string {
    const n = g.cast[a.who]?.name ?? '';
    if (!here(g, w, a.who)) return `${n} has to be with you.`;
    if (a.days.includes(g.day)) return 'Once a day.';
    if (sessionsThisWeek(g, a) >= TRAIN.perWeek) return `${TRAIN.perWeek} sessions a week at most.`;
    return '';
}
/** Where each side stands: your level and theirs in what's taught, and the level it takes you (them) to. */
export function standing(g: Save, w: WorldDef, a: Arrangement) {
    const r = g.cast[a.who];
    const side = (skill: string | undefined, learner: number, teacher: number) => skill ? { skill, now: learner, to: Math.max(learner, teacher - 1) } : null;
    return {
        learn: a.learn ? side(a.learn, levelOf(g, a.learn), personLevel(g, w, r, a.learn)) : null,
        teach: a.teach ? side(a.teach, personLevel(g, w, r, a.teach), levelOf(g, a.teach)) : null,
    };
}
const sessionXp = (gap: number) => TRAIN.xp + TRAIN.perLevel * Math.max(0, Math.min(TRAIN.gapCap, gap));
/** An hour together. Returns what to tell the player and the AI, and the minutes it takes (0: it didn't happen). */
export function session(g: Save, w: WorldDef, id: number): { text: string; minutes: number; ai: string; lines: string[] } {
    const a = activeOf(g).find(x => x.id === id), r = a && g.cast[a.who];
    if (!a || !r) return { text: '', minutes: 0, ai: '', lines: [] };
    const why = sessionWhy(g, w, a); if (why) return { text: why, minutes: 0, ai: '', lines: [] };
    const lines: string[] = [];
    const st = standing(g, w, a);
    if (st.learn && st.learn.now < st.learn.to) {
        const xp = skillXp(g), before = xp[st.learn.skill] ?? 0;
        lines.push(...trainSkill(g, w, st.learn.skill, sessionXp(st.learn.to + 1 - st.learn.now)));
        xp[st.learn.skill] = Math.max(before, Math.min(xp[st.learn.skill] ?? 0, LEVELS[st.learn.to]));
    }
    if (st.teach && st.teach.now < st.teach.to) {
        const s = trainingOf(g), mine = (s.learned[a.who] ??= {});
        const from = Math.max(mine[st.teach.skill] ?? 0, LEVELS[st.teach.now]);
        // (what effects add to a lesson you give: a `study` effect aimed at `teach`, the Mentor goal's perk)
        mine[st.teach.skill] = Math.min(LEVELS[st.teach.to], from + sessionXp(st.teach.to + 1 - st.teach.now) * effectMul(g, w, 'study', 'teach'));
        tallyEvent(g, 'lesson');
    }
    a.days = [...a.days.filter(d => g.day - d < 7), g.day]; a.last = g.day; a.sessions++;
    addStatus(g, w, 'energy', -TRAIN.energy);
    gain(g, 'f', a.who, YOU, TRAIN.friendship);
    if (systemOn(w, 'romance') && !romanceBlocked(g, a.who) && ro(g, a.who, YOU) > 0) gain(g, 'r', a.who, YOU, TRAIN.romance);
    touch(g, a.who);
    const kind = kindWords(w, a), what = whatWords(g, w, a);
    const ai = `{{user}} and ${r.name} spend an hour on their ${kind.replace(/^an? /, '')} (${what}).`;
    const after = standing(g, w, a);
    const doneLearn = !after.learn || after.learn.now >= after.learn.to, doneTeach = !after.teach || after.teach.now >= after.teach.to;
    if (doneLearn && doneTeach) return { text: finish(g, w, a), minutes: TRAIN.minutes, ai: `${ai} It's their last one: there's nothing more to teach each other for now.`, lines };
    return { text: `An hour of ${kind.replace(/^an? /, '')} with ${r.name}.`, minutes: TRAIN.minutes, ai, lines };
}
function finish(g: Save, w: WorldDef, a: Arrangement): string {
    a.done = g.day;
    const n = g.cast[a.who].name;
    gain(g, 'f', a.who, YOU, TRAIN.finish, false);
    if (a.teach) tallyEvent(g, 'taught', 1, a.who);
    if (a.learn) tallyEvent(g, 'taught_you', 1, a.who);
    remember(g, w, a, 'finished');
    return `You and ${n} have taught each other all you can for now.`;
}
/** Someone you taught to the end (a lesson plan or, before it, an apprentice). */
export const graduated = (g: Save, who: string) => trainingOf(g).list.some(a => a.who === who && a.teach && a.done) || !!trainingOf(g).former?.some(f => f.who === who);

/* ---------- the days ---------- */

// Unused for two weeks, an arrangement lapses (a little cooler between you); someone who no longer feels like a friend
// ends it; someone gone, too.
onDay.push((g, w) => {
    if (!trainingOn(w)) return [];
    const out: string[] = [];
    for (const a of activeOf(g)) {
        const r = g.cast[a.who];
        if ((r as any).gone) { endArrangement(g, w, a.id, 'they left'); continue; }
        if (g.day - a.last > TRAIN.lapse) { endArrangement(g, w, a.id, 'it lapsed'); lose(g, 'f', a.who, YOU, TRAIN.lapseCost); out.push(`Your ${kindWords(w, a).replace(/^an? /, '')} with ${r.name} lapsed: no session in ${TRAIN.lapse} days.`); continue; }
        if (fr(g, a.who, YOU) < TRAIN.friends - 10) { endArrangement(g, w, a.id, 'they called it off'); out.push(`${r.name} called off your ${kindWords(w, a).replace(/^an? /, '')}.`); }
    }
    return out;
});

/* ---------- a hint for the AI (they might offer) ---------- */

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
/** The arrangement they'd offer: an exchange when both sides have something, else what they can teach you, else what
 *  they could learn from you. */
export function bestOffer(g: Save, w: WorldDef, who: string): { learn?: string; teach?: string } | null {
    const p = possible(g, w, who);
    if (!p.learn.length && !p.teach.length) return null;
    return { ...(p.learn[0] ? { learn: p.learn[0] } : {}), ...(p.teach[0] ? { teach: p.teach[0] } : {}) };
}
/** The moment's words: what they might offer, if the talk gets there. */
export function hintText(g: Save, w: WorldDef, who: string, o: { learn?: string; teach?: string }): string {
    const n = g.cast[who].name;
    const topics = [...new Set([o.learn, o.teach].filter(Boolean).map(id => lower(w, id!)))].join(' or ');
    const offer = o.learn && o.teach ? `to trade lessons: ${n} teaching {{user}} ${lower(w, o.learn)}, {{user}} teaching ${n} ${lower(w, o.teach)}`
        : o.learn ? `to teach {{user}} some ${lower(w, o.learn)}, now and then` : `to learn some ${lower(w, o.teach!)} from {{user}}, now and then`;
    return `If the conversation turns to ${topics} or to learning things, ${n} might offer ${offer}. Only if it comes up naturally; don't force it.`;
}
/** Each hour: rarely, someone here who'd make a good arrangement with you gets it as a moment (once a day each, by a
 *  fixed chance; one hint in 10 days, the same person every 28), within the initiative budget. */
export function checkHint(g: Save, w: WorldDef) {
    if (!trainingOn(w) || !initiativeOn(g)) return;
    const s = trainingOf(g);
    if (g.day - s.hint < TRAIN.hintGap || momentsOf(g).some(m => m.kind === 'train')) return;
    for (const r of presentAt(g, w, g.player.loc)) {
        if ((s.hinted[r.avatar] ?? -999) > g.day - TRAIN.wait || momentsOf(g, r.avatar).length || !canArrange(g, w, r.avatar)) continue;
        if (H(`${g.world}|${g.day}|train|${r.avatar}`) >= TRAIN.hintChance || !canSpend(g, r.avatar)) continue;
        const o = bestOffer(g, w, r.avatar); if (!o) continue;
        if (queueMoment(g, { who: r.avatar, kind: 'train', text: hintText(g, w, r.avatar, o) })) { spend(g, r.avatar); s.hint = g.day; s.hinted[r.avatar] = g.day; return; }
    }
}
onHour.push((g, w) => { checkHint(g, w); return []; });

/* ---------- for the AI ---------- */

/** The arrangements of the people here, and what was finished with them. */
export function trainingLine(g: Save, w: WorldDef, present: string[]): string {
    if (!trainingOn(w)) return '';
    const s = trainingOf(g), out: string[] = [];
    for (const a of s.list) {
        if (!present.includes(a.who) || !g.cast[a.who] || a.ended) continue;
        const n = g.cast[a.who].name;
        if (a.done) out.push(`${n} and {{user}} once had ${kindWords(w, a)} (${whatWords(g, w, a).replace(/ teaches /g, ' taught ')}).`);
        else out.push(`${n} and {{user}} have ${kindWords(w, a)}, about twice a week: ${whatWords(g, w, a)}; ${a.sessions} session${a.sessions === 1 ? '' : 's'} so far${a.sessions ? `, the last ${g.day - a.last === 0 ? 'today' : g.day - a.last === 1 ? 'yesterday' : `${g.day - a.last} days ago`}` : ''}.`);
    }
    for (const f of s.former ?? []) if (present.includes(f.who) && g.cast[f.who]) out.push(`${g.cast[f.who].name} is a former apprentice of {{user}} (${f.what}).`);
    return out.join(' ');
}

