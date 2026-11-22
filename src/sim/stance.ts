// Stances (adult industry, the life outside the shoots): what each of the world's people thinks of your work in adult
// video, by seat (performing weighs most, directing less, the label least): fine, uneasy or a deal-breaker ("no"). From
// the world (`ExampleCharacter.stance`), else from their profile. It counts only once they know (a rumor reaching them,
// being told, seeing it, fame of 60) and only while it applies: performing (A's `performingLink`), else directing or a
// label of your own. Uneasy: romance toward you grows more slowly (`stanceLink.gain`) and a partner may have a jealous
// moment after a shoot day. No: they won't start or move up a couple status while you perform (`stanceLink.notYet`), and
// a partner has *the talk* (a card with three answers). Nobody is locked out for good (AV-5): directing or a label is at
// most uneasy for anyone; a season without performing lifts every no and uneasy about performing (an ex who left over it
// can be asked again); a stance softens a step a season at friendship 60+ and through the talk, two steps moving no to
// uneasy and uneasy to fine; friendship never moves with a stance, and storylines never read one unless their own
// condition does (`stance:`). Telling them yourself, first, halves the stance's weight for a season. Nothing here does
// anything with the `industry` system or adult content off, or in a world without an industry.
import { nowAbs, residentsOf, type Save, type Resident } from '../core/store.js';
import type { WorldDef, Stance, ActionDef } from '../core/world.js';
import { getWorld } from '../core/world.js';
import { STANCES, type Seat, type TitleRec } from '../core/industry.js';
import { onDay, onAction, onRelease, onWrap, stanceLink, industryLink, performingLink, engineActions, sceneLines } from './hooks.js';
import { industryOn, peekInd, indOf, outOf, fameOf, fameWords, familyOf, familyLearns, stanceBridge, metPeople, FAME } from './fame.js';
import { exampleOf } from './dayplan.js';
import { needsOf, ownStyle } from './intimacy.js';
import { limitsOf } from './private.js';
import { bondOf } from './social.js';
import { pairOf, setStatus, YOU } from './rel.js';
import { addRomance } from './romance.js';
import { approve, rumorPool } from './living.js';
import { presentAt } from './people.js';
import { seasonDays } from './time.js';
import { note } from './facts.js';
import { tallyEvent } from './tally.js';

/** The numbers (first guesses, tuned by the long run). */
export const STANCE = {
    /** what a romance gain toward you is multiplied by while a stance applies */
    gain: { uneasy: 0.6, told: 0.8, no: 0.5, direct: 0.8, label: 0.9 },
    friend: 30,        // telling someone yourself: at friend or more
    soften: 60,        // friendship at which a stance softens a step a season
    softMax: 4,        // steps (two move no to uneasy, four no to fine)
    jealous: 1 / 3,    // a partner uneasy about it, after a shoot day you performed in (told first: half that)
    hurt: { romance: 10, approval: 7 },   // a jealous moment: half of a partner's jealousy, friendship never
    breakup: 15,       // the talk's Keep working: romance down as the couple ends (friendship never)
    chartSeen: 0.07,   // a week with a title of yours on the chart: each partner who doesn't know sees it (about 1 in 4 a month)
};
export type StanceHow = 'rumor' | 'told' | 'seen' | 'fame' | 'industry';
export type TalkAnswer = 'keep' | 'stop' | 'time';
/** One person's record (`g.industry.stance[avatar]`). Days are game days. `knows`: the day they learned of your work
 *  (`how`); `told`: you told them yourself, first; `soft`: steps softened; `fsoft`: when friendship 60+ began counting
 *  (or last softened it); `talk`: the last talk; `promise`: you said you'd stop performing; `wait`: they give it time
 *  until then; `left`: they ended it over your work (can be asked again once it lifts); `jealous`: the last jealous moment. */
export interface StanceRec { knows?: number; how?: StanceHow; told?: number; soft?: number; fsoft?: number; talk?: number; promise?: number; wait?: number; left?: number; jealous?: number }
/** The talk waiting for its card (`talkNow`), answered by `answerTalk`. `partner`: they're your partner (Keep working
 *  ends it); `broken`: you said you'd stop and performed again. */
export interface TalkCard { who: string; name: string; at: number; partner: boolean; broken: boolean; stance: Stance }
/** How a stance applies right now: the seat it's about, the stance after softening (a no told first counts as uneasy
 *  for a season), and whether you told them first. */
export interface Applied { seat: Seat; stance: Stance; told: boolean }

const recs = (g: Save): Record<string, StanceRec> | undefined => peekInd(g)?.stance as Record<string, StanceRec> | undefined;
const recOf = (g: Save, who: string): StanceRec => (((indOf(g).stance ??= {}) as Record<string, StanceRec>)[who] ??= {});
const peekRec = (g: Save, who: string): StanceRec | undefined => recs(g)?.[who];
const W = (g: Save) => getWorld(g.world);
const rank = (s: Stance) => STANCES.indexOf(s);
const atMost = (s: Stance, cap: Stance): Stance => (rank(s) > rank(cap) ? cap : s);
const COUPLE = ['casual', 'dating', 'engaged', 'married'];
const partnerOf = (g: Save, who: string) => COUPLE.includes(pairOf(g, who, YOU)?.status ?? '');
const nameOf = (g: Save, who: string) => g.cast[who]?.name ?? who;

/* ---------- what they think ---------- */

const NO_WORDS = /\bcameras?\b|nobody can know|no one can know|no cameras|never on camera|filmed/i;
/** From someone's profile, when the world sets no stance: a free spirit or an open style is fine; limits about cameras
 *  or nobody knowing, or a devoted style, a deal-breaker; anyone else uneasy. */
export function profileStance(g: Save, who: string): Stance {
    if (limitsOf(g, who).some(l => NO_WORDS.test(l))) return 'no';
    const n = needsOf(g, who);
    if (n.preset === 'free' || ownStyle(g, who) === 'open') return 'fine';
    if (n.preset === 'devoted') return 'no';
    return 'uneasy';
}
/** Their own stance on a seat of yours, before softening: the world's, else from the profile. Directing is at most
 *  uneasy (a step under performing when the world doesn't say); the label at most uneasy, fine unless performing is a no. */
export function baseStance(g: Save, w: WorldDef, who: string, seat: Seat = 'perform'): Stance {
    const r = g.cast[who];
    const set = r ? exampleOf(w, r)?.stance : undefined;
    const perform = set?.perform ?? profileStance(g, who);
    if (seat === 'perform') return perform;
    if (seat === 'direct') return atMost(set?.direct ?? (perform === 'no' ? 'uneasy' : 'fine'), 'uneasy');
    return perform === 'no' ? 'uneasy' : 'fine';
}
/** Their stance on a seat now, softened (two steps a stance). */
export function stanceOf(g: Save, w: WorldDef, who: string, seat: Seat = 'perform'): Stance {
    const s = baseStance(g, w, who, seat), soft = Math.min(STANCE.softMax, peekRec(g, who)?.soft ?? 0);
    return STANCES[Math.max(0, rank(s) - Math.floor(soft / 2))];
}

/* ---------- when it applies ---------- */

/** Days since you last performed (null: never, or A has nothing to say). */
export function sincePerformed(g: Save): number | null {
    const d = performingLink.lastDay(g);
    return d === null || d === undefined ? null : Math.max(0, g.day - d);
}
/** Are you performing now, for stances: A says so, and a season hasn't passed since your last performing day (a
 *  season without performing lifts every stance about it, whatever else A counts). */
export function performingNow(g: Save, w: WorldDef): boolean {
    if (!performingLink.now(g, w)) return false;
    const since = sincePerformed(g);
    return since === null || since < seasonDays(g);
}
/** The seat a stance is about now: performing, else directing, else a label; null with none. */
export function activeSeat(g: Save, w: WorldDef): Seat | null {
    if (performingNow(g, w)) return 'perform';
    if (industryLink.holds(g, w, 'seat', 'direct')) return 'direct';
    if (industryLink.holds(g, w, 'seat', 'label')) return 'label';
    return null;
}
/** Do they know of your work? */
export const knows = (g: Save, who: string) => !!peekRec(g, who)?.knows;
/** How their stance applies now (null: it doesn't: they don't know, you hold no seat, or the system or adult is off). */
export function applied(g: Save, w: WorldDef | null | undefined, who: string): Applied | null {
    if (!industryOn(g, w)) return null;
    const rec = peekRec(g, who);
    if (!rec?.knows) return null;
    const seat = activeSeat(g, w);
    if (!seat) return null;
    const told = rec.told !== undefined && g.day - rec.told < seasonDays(g);
    let stance = stanceOf(g, w, who, seat);
    if (told && stance === 'no') stance = 'uneasy';
    return { seat, stance, told };
}

/* ---------- the romance hooks ---------- */

/** What a romance gain toward you is multiplied by (1: nothing in your work slows it). */
export function stanceGain(g: Save, who: string): number {
    const a = applied(g, W(g), who);
    if (!a || a.stance === 'fine') return 1;
    if (a.seat === 'perform') return a.stance === 'no' ? STANCE.gain.no : a.told ? STANCE.gain.told : STANCE.gain.uneasy;
    return a.seat === 'direct' ? STANCE.gain.direct : STANCE.gain.label;
}
/** Words for "not yet": what lifts a deal-breaker (never `ever`: it always lifts). */
export const NOT_YET_WHEN = 'you\'ve gone a season without performing';
/** Why they won't start (or move up to) a couple status with you now: a deal-breaker while you perform. */
export function stanceNotYet(g: Save, who: string): { ever: boolean; when: string } | null {
    const a = applied(g, W(g), who);
    return a && a.seat === 'perform' && a.stance === 'no' ? { ever: false, when: NOT_YET_WHEN } : null;
}
stanceLink.gain = (g, x) => stanceGain(g, x);
stanceLink.notYet = (g, x) => stanceNotYet(g, x);

/* ---------- learning of it ---------- */

/** Do you have work for anyone to know of: fame, performing (or having performed), a seat? */
export function hasWork(g: Save, w: WorldDef): boolean {
    return fameOf(g) > 0 || performingLink.now(g, w) || performingLink.lastDay(g) !== null || industryLink.holds(g, w, 'seat', 'direct') || industryLink.holds(g, w, 'seat', 'label');
}
/** People learn of your work (`how`): remembered once, the first way it reached them. Family takes it as family does
 *  (sim/fame.ts); a partner for whom it's a deal-breaker while you perform has the talk. Lines. */
export function learn(g: Save, w: WorldDef, who: string[], how: StanceHow): string[] {
    if (!industryOn(g, w)) return [];
    const out: string[] = [], fam = familyOf(g);
    for (const a of new Set(who)) {
        const r = g.cast[a];
        if (!r || r.onset || a === YOU || peekRec(g, a)?.knows) continue;
        const rec = recOf(g, a);
        rec.knows = g.day; rec.how = how;
        if (how === 'told') rec.told = g.day;
        if (fam.includes(a)) out.push(...familyLearns(g, w, a));
    }
    out.push(...openTalk(g, w));
    return out;
}
stanceBridge.learn = (g, w, who, how) => learn(g, w, who, how);
stanceBridge.knows = (g, who) => knows(g, who);

/** Tell someone yourself (the scene action *Tell them about your work*): they know, told first (their stance weighs
 *  half for a season). Lines; [] when they knew already. */
export function tell(g: Save, w: WorldDef, who: string): string[] {
    if (!industryOn(g, w) || !g.cast[who] || knows(g, who)) return [];
    const out = learn(g, w, [who], 'told');
    const name = nameOf(g, who), s = stanceOf(g, w, who, activeSeat(g, w) ?? 'perform');
    note(g, '{u} told {0} about {u}\'s work in adult video.', [name], [who], g.player.loc, 'life');
    return [`You told ${name} about your work yourself. ${REACT[s](name)}`, ...out];
}
const REACT: Record<Stance, (n: string) => string> = {
    fine: n => `${n} takes it in stride.`,
    uneasy: n => `${n} is uneasy about it, but glad you said it first.`,
    no: n => `${n} doesn't like it at all, but glad you said it first: it'll weigh less for a while.`,
};

/* ---------- the talk ---------- */

// Is the talk due with a partner: a deal-breaker that applies now, not while they give it time, once a season (or
// at once when you said you'd stop and performed again).
function talkDue(g: Save, w: WorldDef, who: string): boolean {
    const a = applied(g, w, who);
    if (!a || a.seat !== 'perform' || a.stance !== 'no' || !partnerOf(g, who)) return false;
    const rec = peekRec(g, who)!;
    if (rec.wait !== undefined && g.day < rec.wait) return false;
    if (brokenPromise(g, rec)) return true;
    return rec.talk === undefined || g.day - rec.talk >= seasonDays(g);
}
const brokenPromise = (g: Save, rec: StanceRec) => rec.promise !== undefined && (performingLink.lastDay(g) ?? -Infinity) > rec.promise;
// The first partner whose talk is due gets it (one card at a time). Lines.
function openTalk(g: Save, w: WorldDef): string[] {
    const o = peekInd(g)?.out;
    if (o?.talk && talkNow(g, w)) return [];
    const who = Object.keys(recs(g) ?? {}).find(a => talkDue(g, w, a));
    if (!who) { if (o?.talk) delete o.talk; return []; }
    return startTalk(g, w, who);
}
/** The talk begins with someone (a partner it's a deal-breaker for, by itself; anyone through the scene action *Talk
 *  about your work*). Lines. */
export function startTalk(g: Save, w: WorldDef, who: string): string[] {
    if (!industryOn(g, w) || !g.cast[who]) return [];
    const rec = recOf(g, who), broken = brokenPromise(g, rec);
    rec.talk = g.day;
    outOf(g).talk = { who, at: nowAbs(g), ...(broken ? { broken: true as const } : {}) };
    return [`${nameOf(g, who)} wants to talk about your work in adult video.`];
}
/** The talk waiting for its card now (null: none, or it no longer applies). Nothing is written. */
export function talkNow(g: Save, w: WorldDef): TalkCard | null {
    const t = industryOn(g, w) ? peekInd(g)?.out?.talk : undefined;
    if (!t || !g.cast[t.who]) return null;
    const a = applied(g, w, t.who);
    if (!a || a.stance === 'fine') return null;
    return { who: t.who, name: nameOf(g, t.who), at: t.at, partner: partnerOf(g, t.who), broken: !!t.broken, stance: a.stance };
}
/** The talk's three answers. *Keep working*: a partner ends it (a breakup that can be mended: `was`, romance down,
 *  friendship untouched), anyone else's mind stays as it is. *Stop performing*: they're relieved (a promise; performing
 *  again brings the talk back at once). *Give it time*: a partner stays a season whatever happens. Stop and time soften
 *  the stance a step. Lines; [] with no talk now. */
export function answerTalk(g: Save, w: WorldDef, how: TalkAnswer): string[] {
    const t = talkNow(g, w);
    const o = peekInd(g)?.out;
    if (o?.talk) delete o.talk;
    if (!t) return [];
    const rec = recOf(g, t.who), name = t.name;
    if (how === 'keep') {
        if (!t.partner || t.stance !== 'no') return [`${name} listens, but it doesn't change how they feel about it.`];
        setStatus(g, t.who, YOU, null);
        addRomance(g, t.who, -STANCE.breakup);
        rec.left = g.day; delete rec.wait; delete rec.promise;
        note(g, '{0} ended it with {u} over {u}\'s work in adult video.', [name], [t.who], g.player.loc, 'love');
        return [`${name} ended it: they can't be with someone who performs. Once you've stopped for a season, the door is open again.`];
    }
    rec.soft = Math.min(STANCE.softMax, (rec.soft ?? 0) + 1);
    if (how === 'stop') {
        rec.promise = g.day; delete rec.wait;
        note(g, '{u} told {0} they would stop performing.', [name], [t.who], g.player.loc, 'love');
        return [`${name} is relieved: you said you'd stop performing.`];
    }
    if (t.partner) rec.wait = g.day + seasonDays(g);
    note(g, '{0} agreed to give {u}\'s work some time.', [name], [t.who], g.player.loc, 'love');
    return [t.partner ? `${name} will give it time: a season, and then you'll talk again.` : `${name} will give it some thought.`];
}

/* ---------- after a shoot ---------- */

/** A shoot wrapped (`onWrap`): a partner uneasy about it may have a jealous moment (half a partner's jealousy: romance
 *  and approval, never friendship). Lines. */
export function afterShoot(g: Save, w: WorldDef, t: TitleRec, rnd: () => number = Math.random): string[] {
    if (!industryOn(g, w) || !t.you.includes('perform') || t.cancelled) return [];
    const out: string[] = [];
    for (const who of Object.keys(recs(g) ?? {})) {
        const a = applied(g, w, who);
        if (!a || a.seat !== 'perform' || a.stance !== 'uneasy' || !partnerOf(g, who)) continue;
        if (!(rnd() < STANCE.jealous * (a.told ? 0.5 : 1))) continue;
        const rec = recOf(g, who), name = nameOf(g, who);
        addRomance(g, who, -STANCE.hurt.romance); approve(g, who, -STANCE.hurt.approval);
        rec.jealous = g.day;
        tallyEvent(g, 'jealous', 1, who);
        note(g, '{0} was jealous after {u}\'s shoot.', [name], [who], g.player.loc, 'love');
        out.push(`${name} had a hard time with your shoot today: romance −${STANCE.hurt.romance}.`);
    }
    return out;
}
onWrap.push((g, w, t) => afterShoot(g, w, t));
// A release: the people of Tokyo in it know (they were there).
onRelease.push((g, w, t) => (industryOn(g, w) ? learn(g, w, t.cast.filter(a => a !== YOU && !!g.cast[a] && !g.cast[a].onset), 'seen') : []));

/* ---------- day by day ---------- */

/** The day's settling (also called by tests with a roll): word reaching people (a rumor about your work, being in the
 *  industry, fame of 60, a title on the chart while they're your partner), softening by friendship, the talk. Lines. */
export function stanceDay(g: Save, w: WorldDef, rnd: () => number = Math.random): string[] {
    if (!industryOn(g, w) || !peekInd(g) || !hasWork(g, w)) return [];
    const out: string[] = [];
    // a rumor about your work (sim/fame.ts starts them with ids beginning `av:`)
    for (const r of rumorPool(g)) if (r.id.startsWith('av:')) { const who = r.knownBy.filter(a => a !== YOU && !knows(g, a)); if (who.length) out.push(...learn(g, w, who, 'rumor')); }
    // the industry's own people know everyone in it
    const inside = residentsOf(g).filter(r => r.occupation === w.industry!.job && !knows(g, r.avatar)).map(r => r.avatar);
    if (inside.length) out.push(...learn(g, w, inside, 'industry'));
    if (fameOf(g) >= FAME.knows) { const met = metPeople(g).filter(a => !knows(g, a)); if (met.length) out.push(...learn(g, w, met, 'fame')); }
    if (g.day % 7 === 0 && industryLink.holds(g, w, 'chart', 'top 10')) {
        const seen = residentsOf(g).filter(r => partnerOf(g, r.avatar) && !knows(g, r.avatar) && rnd() < STANCE.chartSeen).map(r => r.avatar);
        if (seen.length) out.push(...learn(g, w, seen, 'seen'));
    }
    // softening: a step each season at friendship 60+
    for (const [who, rec] of Object.entries(recs(g) ?? {})) {
        if (!g.cast[who]) continue;
        if (rec.wait !== undefined && g.day >= rec.wait) delete rec.wait;
        if (bondOf(g, who) < STANCE.soften) { delete rec.fsoft; continue; }
        if (rec.fsoft === undefined) { rec.fsoft = g.day; continue; }
        if (g.day - rec.fsoft >= seasonDays(g)) { rec.fsoft = g.day; if ((rec.soft ?? 0) < STANCE.softMax) rec.soft = (rec.soft ?? 0) + 1; }
    }
    out.push(...openTalk(g, w));
    return out;
}
onDay.push((g, w) => stanceDay(g, w));

/* ---------- the scene actions: telling them, talking it through ---------- */

const TELL = 'x-avtell-', TALK = 'x-avtalk-';
/** The actions offered where you are: *Tell <name> about your work* (someone here at friend or more who doesn't know),
 *  *Talk about your work with <name>* (someone here who knows and is uneasy or against it, once a season). */
export function stanceActions(g: Save, w: WorldDef): ActionDef[] {
    if (!industryOn(g, w) || !hasWork(g, w) || peekInd(g)?.out?.talk) return [];
    const out: ActionDef[] = [];
    for (const r of presentAt(g, w, g.player.loc).filter(x => !x.onset && x.avatar !== YOU)) {
        if (!knows(g, r.avatar)) {
            if (bondOf(g, r.avatar) < STANCE.friend) continue;
            const s = stanceOf(g, w, r.avatar, activeSeat(g, w) ?? 'perform');
            out.push({ id: TELL + r.avatar, name: 'Your work', label: `Tell ${r.name} about your work`, icon: '🎬', cost: 0, minutes: 20, effects: {},
                outcomes: [{ weight: 1, text: `{{user}} tells ${r.name} about their work in adult video, before ${r.name} hears it from someone else. ${REACT[s](r.name)}` }] } as ActionDef);
            continue;
        }
        const a = applied(g, w, r.avatar), rec = peekRec(g, r.avatar)!;
        if (!a || a.stance === 'fine' || (rec.talk !== undefined && g.day - rec.talk < seasonDays(g))) continue;
        out.push({ id: TALK + r.avatar, name: 'Your work', label: `Talk about your work with ${r.name}`, icon: '🎬', cost: 0, minutes: 30, effects: {},
            outcomes: [{ weight: 1, text: `{{user}} and ${r.name} talk openly about {{user}}'s work in adult video and how ${r.name} feels about it.` }] } as ActionDef);
    }
    return out;
}
engineActions.push(stanceActions);
onAction.push((g, w, a) => {
    if (a.id.startsWith(TELL)) tell(g, w, a.id.slice(TELL.length));
    else if (a.id.startsWith(TALK)) startTalk(g, w, a.id.slice(TALK.length));
});

/* ---------- what the AI is told ---------- */

const SEAT_WORDS: Record<Seat, string> = { perform: 'work in adult video', direct: 'directing adult video', label: 'adult video label' };
/** For each person here who knows: their stance in words ("Kaho is uneasy about {{user}}'s work in adult video"), and
 *  an ex who left over it once it has lifted. */
export function stanceLines(g: Save, w: WorldDef, present: Resident[]): string[] {
    if (!industryOn(g, w)) return [];
    const parts: string[] = [];
    for (const r of present) {
        const rec = peekRec(g, r.avatar);
        if (!rec?.knows) continue;
        const a = applied(g, w, r.avatar);
        if (a) {
            const what = `{{user}}'s ${SEAT_WORDS[a.seat]}`;
            parts.push(a.stance === 'fine' ? `${r.name} knows about ${what} and is fine with it`
                : a.stance === 'uneasy' ? `${r.name} is uneasy about ${what}${a.told ? ', but glad {{user}} told them first' : ''}${rec.jealous !== undefined && g.day - rec.jealous < 3 ? ' (hurt after the last shoot)' : ''}`
                : `${r.name} can't accept ${what}: no romance with {{user}} while {{user}} performs`);
        } else if (rec.left !== undefined && !performingNow(g, w)) parts.push(`${r.name} ended it with {{user}} over performing, but {{user}} has stopped since, and ${r.name} could be open to trying again`);
        else parts.push(`${r.name} knows about {{user}}'s past work in adult video`);
    }
    const t = talkNow(g, w), here = t && present.some(r => r.avatar === t.who);
    if (here) parts.push(`${t!.name} wants to talk seriously about {{user}}'s work${t!.broken ? ': {{user}} said they would stop, and didn\'t' : ''}`);
    return parts.length ? [`About {{user}}'s work in adult video: ${parts.join('; ')}.`] : [];
}
sceneLines.push((g, w, present) => stanceLines(g, w, present));

/* ---------- the condition keys `fame` and `stance` ---------- */

/** The person a `stance:` value names (full name, or first name, any case). */
function named(g: Save, n: string) {
    const s = n.trim().toLowerCase();
    return residentsOf(g).find(r => r.name.toLowerCase() === s) ?? residentsOf(g).find(r => r.name.toLowerCase().split(/\s+/)[0] === s) ?? null;
}
const STANCE_V = /^(.*\S)\s+(fine|uneasy|no)$/i;
/** Their stance on what you do now (performing, else directing, else a label; performing with none), softened. */
export function stanceNow(g: Save, w: WorldDef, who: string): Stance {
    return stanceOf(g, w, who, activeSeat(g, w) ?? 'perform');
}
const prev = { holds: industryLink.holds, words: industryLink.words, count: industryLink.count };
industryLink.holds = (g, w, key, v) => {
    if (key === 'fame') return industryOn(g, w) && /^\d+$/.test(v) && fameOf(g) >= Number(v);
    if (key === 'stance') {
        const m = STANCE_V.exec(v), r = m ? named(g, m[1]) : null;
        return industryOn(g, w) && !!r && stanceNow(g, w, r.avatar) === m![2].toLowerCase();
    }
    return prev.holds(g, w, key, v);
};
industryLink.words = (g, w, key, v) => {
    if (key === 'fame') return /^\d+$/.test(v) ? `a fame of ${Number(v)} (${Math.floor(fameOf(g))} now)` : '';
    if (key === 'stance') {
        const m = STANCE_V.exec(v);
        if (!m) return '';
        const r = named(g, m[1]), s = m[2].toLowerCase();
        return `${r?.name ?? m[1]} ${s === 'fine' ? 'fine with' : s === 'uneasy' ? 'uneasy about' : 'against'} your work in adult video`;
    }
    return prev.words(g, w, key, v);
};
industryLink.count = (g, w, key, v) => {
    if (key === 'fame') return /^\d+$/.test(v) ? Math.floor(fameOf(g)) : null;
    if (key === 'stance') return null;
    return prev.count(g, w, key, v);
};

/** Everyone's stance as a screen might list it (people who know, or anyone with a record): who, the stance now, whether
 *  it applies, how they learned. */
export function stancesView(g: Save, w: WorldDef): { who: string; name: string; stance: Stance; applies: boolean; knows: boolean; how?: StanceHow; told: boolean; left: boolean }[] {
    if (!industryOn(g, w)) return [];
    return Object.entries(recs(g) ?? {}).filter(([a]) => !!g.cast[a]).map(([a, rec]) => {
        const ap = applied(g, w, a);
        return { who: a, name: nameOf(g, a), stance: ap?.stance ?? stanceNow(g, w, a), applies: !!ap && ap.stance !== 'fine', knows: !!rec.knows, how: rec.how, told: rec.told !== undefined, left: rec.left !== undefined };
    });
}
export { fameWords };
