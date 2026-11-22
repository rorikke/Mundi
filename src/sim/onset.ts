// The set (adult industry, plans/adult-industry.md "The set"): a shoot day as it's played. At the call time
// (sim/titles.ts calls `setLink.start`) the title's job-only performers from the world's roster come on set: in the
// cast, marked `onset`, with a home nobody has (`__guest`), so they're in the scene, its sprites, its dress and the
// group, and never one of the world's people (core/store.ts residentsOf); their cards are made or found the way the
// world's people's are (sim/game.ts). Tokyo's people come by the title's `set` plan. Then the scenes, one by one: *Play
// the next scene* rolls it (d20, the scene's skill, and parts by name: your role and theirs, a like you know,
// chemistry, the director's notes, burnout, the script, the set) against the genre's difficulty, one more for each
// scene after the first; great, good or poor, written into the title with its quality and a drawn picture of it.
// Directing, your roll is the director's (Charisma, the schedule's Logic, the camera's Photography: in full when you
// came through the lens) with each performer's own take rolled by the engine. A co-star's hard limit stops a scene as
// it stops a private moment. *Wait for your call* passes the time to the next one, *Skip to the result* rolls the
// rest. When the last scene is shot, or you leave the set, it wraps: the performers leave (their `rel` data stays, as
// Home mode's guests' does) and `onWrap` runs. The AI is told about the shoot while it's live (`sceneLines`) and plays
// each scene the engine rolled; it never sets a result. A set with a `risk` (a beach after dark, a mixed bath after
// closing) rolls once at the call, by the caught rules (sim/caught.ts): caught, the shoot is stopped, word may get
// around, the place is closed for a week and the label warns you; not caught, performing there is a little thrill. With
// the `industry` system or adult content off nothing here happens and nobody is ever on set.
import { nowAbs, adultOn, game, type Save, type Resident } from '../core/store.js';
import { systemOn, exampleTag, type WorldDef, type ActionDef, type RosterPerson, type GenreDef, type LabelDef } from '../core/world.js';
import type { TitleRec, TitleScene, SceneGrade, ShotPart, SetCall } from '../core/industry.js';
import { setLink, onWrap, industryLink, engineActions, sceneLines, onLook, onHour, onDay, roomRules, onRoll } from './hooks.js';
import { characters, charOf, personaName } from '../st/bridge.js';
import { presentAt } from './people.js';
import { rollBonus, rollD20 } from './dice.js';
import { levelOf, skillDef, skillName, trainSkill } from './hobbies.js';
import { matchIn, likesOf, limitsOf, roleFit, yourRole } from './private.js';
import { knownOf, learn, roleOf } from './intimacy.js';
import { relOf, fr, ro, statusOf, lose, YOU } from './rel.js';
import { CRUSH } from './romance.js';
import { FRIEND_START } from '../core/feel.js';
import { npcRank } from './longlife.js';
import { myJob, rankOf } from './work.js';
import { placeName } from './facts.js';
import { cleanPerson, applyPerson } from './gender.js';
import { ensureProfile } from './profiles.js';
import { tallyEvent } from './tally.js';
import { dressRules } from './dress.js';
import { riskRoll } from './dice.js';
import { CAUGHT, banPlace, bannedUntil, workWarning } from './caught.js';
import { startCaughtRumor } from './living.js';
import { social } from './social.js';
import { addStatus, statusDef } from './needs.js';

/** The set's numbers (minutes, roll parts, quality). First guesses, tuned by the long run (L). */
export const SET = {
    /** from the call to the first scene (hair and make-up), a scene, setting up the next one, how long the scene just
     *  shot stays the scene's focus (its performers undressed while the AI plays it) */
    makeup: 60, scene: 90, setup: 60, take: 60,
    /** a talk instead of a scene when a co-star's hard limit stops it */
    stop: 15,
    /** a genre's difficulty when it sets none; great: the roll beats it by this much */
    dc: 12, great: 5,
    /** quality from the roll: base at the difficulty, per point above or below */
    q: { base: 55, per: 5 },
    knownLike: 2, script: 2, set: 1, name: 1, noted: -1, burnout: 2, left: -3, late: -2,
    /** chemistry: a performer's titles with you (+1 at 3, +2 at 8) */
    titles: [3, 8],
    /** what a shot scene costs (per scene) */
    energy: 10, hunger: 5,
};

/* ---------- the save's part (g.onset; g.industry is sim/industry.ts's) ---------- */

/** The shoot being played: the title (its id; `rec`, a copy, only when the industry's store doesn't hold it), the set's
 *  place, the call (absolute minutes), the roster performers called (ids) and their cards, the next scene to shoot,
 *  when it's ready, whether you've been on set, the last scene shot and the take still playing (its people
 *  undressed), and the scenes a hard limit stopped. */
export interface ShootState {
    title: string; place: string; call: number; roster: string[]; next: number; ready: number;
    here?: boolean; last?: { n: number; kind: string; grade: SceneGrade; q: number; at: number };
    take?: { who: string[]; until: number }; stopped?: { kind: string; who: string; limit: string }[]; rec?: TitleRec;
}
/** What the set remembers between shoots: the live shoot, each roster performer's card (id → avatar), how often each
 *  drawn picture has been shown, and whether you were noted (a poor scene) last time you performed. */
export interface OnsetState { live?: ShootState; cards: Record<string, string>; shown: Record<string, number>; noted?: boolean }
export const peekOnset = (g: Save): OnsetState | undefined => (g as any).onset;
export function onsetOf(g: Save): OnsetState {
    const o = ((g as any).onset ??= {}) as OnsetState;
    o.cards ??= {}; o.shown ??= {};
    return o;
}
const liveOf = (g: Save): ShootState | null => peekOnset(g)?.live ?? null;

/** Is the set in play (the `industry` system, adult content and a world with an industry)? */
export const setOn = (g: Save | null | undefined, w: WorldDef | null | undefined): boolean => !!g && !!w?.industry && systemOn(w, 'industry') && adultOn(g);

/* ---------- the world's data ---------- */

/** A roster id as a title names it: `roster:<id>` (sim/titles.ts's way) or the bare id. */
export const rosterId = (x: string) => (x.startsWith('roster:') ? x.slice(7) : x);
/** A performer of the world's roster, by id (bare or `roster:<id>`). */
export const rosterOf = (w: WorldDef, id: string): RosterPerson | undefined => { const k = rosterId(id); return w.industry?.roster?.find(p => p.id === k); };
const genreOf = (w: WorldDef, id: string): GenreDef | undefined => w.industry?.genres?.find(x => x.id === id);
const labelOf = (w: WorldDef, id: string): LabelDef | undefined => w.industry?.labels?.find(x => x.id === id);
/** The skill a performer's scene leans on: the world's adult skill (Sensuality), else Charisma. */
const craftSkill = (w: WorldDef): string => (w.skills ?? []).find(s => s.adult)?.id ?? 'charisma';
const has = (w: WorldDef, id: string) => !!skillDef(w, id);
const titlesOf = (g: Save): TitleRec[] => ((g as any).industry?.titles ?? []) as TitleRec[];
/** The title a shoot is for: the industry's own record, else the copy the set kept. */
const titleOfShoot = (g: Save, s: ShootState): TitleRec | null => titlesOf(g).find(t => t.id === s.title) ?? s.rec ?? null;

/** A roster performer's card (avatar), once made: the one remembered, else one carrying their tag. */
export function rosterCard(g: Save, w: WorldDef, id: string): string | null {
    const known = peekOnset(g)?.cards?.[rosterId(id)];
    if (known && charOf(known)) return known;
    const p = rosterOf(w, id); if (!p) return null;
    const tag = exampleTag(w, p);
    return characters().find(c => c.data?.extensions?.mundi?.example === tag)?.avatar ?? null;
}
/** The roster performer a card is (by the card remembered or its tag), if any. */
export function rosterByCard(g: Save, w: WorldDef, avatar: string): RosterPerson | undefined {
    const cards = peekOnset(g)?.cards ?? {};
    const id = Object.keys(cards).find(k => cards[k] === avatar);
    if (id) return rosterOf(w, id);
    const tag = charOf(avatar)?.data?.extensions?.mundi?.example;
    return tag ? w.industry?.roster?.find(p => exampleTag(w, p) === tag) : undefined;
}
/** Someone named on a title (YOU, a roster id or a card's avatar) as the avatar in the cast: a roster id becomes their
 *  card (null while there's none yet). */
export function castAvatar(g: Save, w: WorldDef, x: string): string | null {
    if (x === YOU) return YOU;
    if (rosterOf(w, x)) return rosterCard(g, w, x);
    return x;
}
/** Their name (`you`: what to call you; {{user}} for the AI). */
export function castName(g: Save, w: WorldDef, x: string, you = '{{user}}'): string {
    if (x === YOU) return you;
    const p = rosterOf(w, x) ?? rosterByCard(g, w, x);
    return p?.name ?? g.cast[x]?.name ?? String(charOf(x)?.name ?? x);
}
const listed = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? '');
const others = (s: TitleScene) => s.with.filter(x => x !== YOU);

/* ---------- performers coming on set and leaving ---------- */

const NOWHERE = { zone: '__guest', x: 0, y: 0 };
// One roster performer on set: in the cast, marked `onset`, with no home of their own; their profile (gender, likes,
// limits, role) from the roster, never over what the save learned since; you meet them on set.
function arrive(g: Save, w: WorldDef, s: ShootState, p: RosterPerson, avatar: string): Resident | null {
    const had = g.cast[avatar];
    if (had && !had.onset) return null;   // never over one of the world's people
    onsetOf(g).cards[p.id] = avatar;
    if (had) return had;
    const routine = structuredClone(Object.values(w.cast.routineTemplates)[0]);
    const r: Resident = { avatar, name: p.name, occupation: null, home: { ...NOWHERE }, routine, leisure: [], met: true, onset: { title: s.title, place: s.place } };
    g.cast[avatar] = r;
    const people = relOf(g).people;
    if (!people[avatar]) applyPerson(g, avatar, cleanPerson(p));
    if (Number.isFinite(p.age)) (people[avatar] ??= {}).age = p.age;
    ensureProfile(g, w, avatar);
    return r;
}
// A performer leaves the set: out of the cast (their likes learned, titles together and everything in `rel` stay), out
// of what you're doing together right now.
function leave(g: Save, avatar: string) {
    const soc: any = (g as any).social;
    if (soc) { soc.with = (soc.with ?? []).filter((c: any) => c.avatar !== avatar); if (soc.solo === avatar) soc.solo = ''; }
    delete g.cast[avatar];
}
/** The roster performers on set now (avatars). */
export const onSetNow = (g: Save): string[] => Object.keys(g.cast).filter(a => !!g.cast[a].onset);

// Cards still being made or their pictures uploaded (one job per performer), the ones done this session (a card's
// pictures are looked at once a session, as the world's people's are), and the promise the tests wait on.
const bringing = new Map<string, Promise<void>>();
const brought = new Set<string>();
let settled: Promise<unknown> = Promise.resolve();
/** Resolves once every performer called has their card and pictures (tests). */
export const onsetSettled = () => settled;
// A performer's card made (the first time) or found, their portrait, sprites and outfits uploaded as the world's
// people's are (sim/game.ts, loaded when needed so this file adds nothing to the order modules load in), the outfits
// a shoot puts on (their robe, and their naked set with adult content on) not waiting to be worn first; then on set,
// if the shoot is still on, and the scene synced.
function bringIn(g: Save, w: WorldDef, id: string) {
    const k = `${g.world}|${id}`;
    if (bringing.has(k) || (brought.has(k) && rosterCard(g, w, id))) return;
    const p = rosterOf(w, id); if (!p) return;
    const job = (async () => {
        const G = await import('./game.js');
        const found = G.foundCard(w, p);
        const avatar = found ?? (await G.exampleCards(w, [p]))[0];
        if (!avatar) return;
        if (found) await G.examplePictures(w, p, avatar);
        for (const o of ['robe', 'naked']) if (typeof p.outfits?.[o] === 'string' && (o !== 'naked' || adultOn(g))) await G.uploadOutfit(w, p, avatar, o).catch(() => false);
        const s = liveOf(g);
        brought.add(k);
        if (s && s.roster.includes(id) && setOn(g, w)) { arrive(g, w, s, p, avatar); if (game() === g) await G.syncScene(); }
    })().catch(e => console.warn('[Mundi] on set:', p.name, e)).finally(() => bringing.delete(k));
    bringing.set(k, job);
    settled = Promise.all([...bringing.values()]);
}
// Everyone called who isn't on set yet: on set now when their card is known, else as soon as it's made.
function callIn(g: Save, w: WorldDef, s: ShootState) {
    for (const id of s.roster) {
        const p = rosterOf(w, id); if (!p) continue;
        const card = rosterCard(g, w, id);
        if (card && !g.cast[card]) arrive(g, w, s, p, card);
        // (a save opened mid-shoot: its repairs gave them a home, which they never have)
        else if (card && g.cast[card]?.onset && g.cast[card].home.zone !== NOWHERE.zone) g.cast[card].home = { ...NOWHERE };
        bringIn(g, w, id);   // (pictures and outfits, once; a card that isn't there yet is made)
    }
}

/* ---------- the shoot's state ---------- */

/** The shoot being played now and its title, or null. */
export function liveShoot(g: Save, w: WorldDef): { s: ShootState; t: TitleRec } | null {
    const s = liveOf(g); if (!s || !setOn(g, w)) return null;
    const t = titleOfShoot(g, s);
    return t ? { s, t } : null;
}
/** Are you on the set of the shoot being played? */
export const atSet = (g: Save, w: WorldDef): boolean => { const x = liveShoot(g, w); return !!x && g.player.loc === x.s.place; };
// The people in a scene who aren't on set yet (names): the scene waits for them.
function missing(g: Save, w: WorldDef, s: ShootState, scene: TitleScene): string[] {
    const here = new Set(presentAt(g, w, s.place).map(r => r.avatar));
    return others(scene).filter(x => { const a = castAvatar(g, w, x); return !a || !here.has(a); }).map(x => castName(g, w, x));
}

/** Starts a shoot (the call time has come): the performers called come on set. Lines to show. */
export function startShoot(g: Save, w: WorldDef, call: SetCall): string[] {
    if (!setOn(g, w) || !call?.title?.id || !call.place) return [];
    const out: string[] = [];
    const o = onsetOf(g);
    if (o.live && o.live.title !== call.title.id) out.push(...wrapShoot(g, w, 'late'));
    if (o.live?.title === call.title.id) return out;
    const stopped = setRisk(g, w, call.title, call.place);
    if (stopped) return [...out, ...stopped];
    const inStore = titlesOf(g).some(t => t.id === call.title.id);
    const s: ShootState = { title: call.title.id, place: call.place, call: call.call, roster: [...new Set((call.roster ?? []).map(rosterId))].filter(id => !!rosterOf(w, id)), next: 0,
        ready: Math.max(nowAbs(g), call.call) + SET.makeup, ...(inStore ? {} : { rec: call.title }) };
    if (g.player.loc === s.place) s.here = true;
    o.live = s;
    callIn(g, w, s);
    const t = titleOfShoot(g, s)!;
    const names = s.roster.map(id => rosterOf(w, id)!.name);
    out.push(`Call time for "${t.name}" at ${placeName(g, w, s.place)}${names.length ? `: ${listed(names)} ${names.length > 1 ? 'are' : 'is'} on set` : ''}. Hair and make-up first.`);
    return out;
}

/* ---------- a risky set ---------- */

/** A set's `risk` at the call, rolled once as a risky private action's is (riskRoll: the `risk` effects count). Caught, or
 *  the place still closed from last time: the shoot is stopped (the title dropped, nobody's fault but the set's: no
 *  standing lost, no fee), and caught, word may get around (an adult rumor about you and the city's people in it), the
 *  place closed for a week (sim/caught.ts's ban) and a warning at work. Returns those lines; null when the shoot goes on
 *  (not caught: performing there is the thrill, mood and Desire full, as a risky private action gives). */
export function setRisk(g: Save, w: WorldDef, t: TitleRec, place: string, rnd: () => number = Math.random): string[] | null {
    const set = w.industry?.sets?.find(x => x.id === t.set), risk = Number(set?.risk) || 0;
    if (!setOn(g, w) || !set || !(risk > 0) || !place) return null;
    const where = placeName(g, w, place), out: string[] = [];
    const drop = () => {
        const st = (g as any).industry, plans = new Set((t as any).plans ?? []);
        if (st?.titles) st.titles = st.titles.filter((x: TitleRec) => x.id !== t.id);
        for (const a of social(g).appts) if (plans.has(a.id) && a.state === 'set') a.state = 'cancelled';
    };
    if (bannedUntil(g, place)) { drop(); return [`${where} is closed to shoots this week: the shoot for "${t.name}" is called off.`]; }
    if (!riskRoll(g, w, { id: set.id, tags: ['set', 'work', t.genre], risk }, rnd).caught) {
        if (!t.you?.includes('perform')) return null;
        tallyEvent(g, 'risky');
        addStatus(g, w, 'mood', CAUGHT.thrillMood);
        const d = statusDef(w, 'desire'); if (d) addStatus(g, w, 'desire', d.max);
        return null;
    }
    drop();
    tallyEvent(g, 'caught');
    addStatus(g, w, 'mood', CAUGHT.mood);
    out.push(`Someone saw the crew setting up at ${where}: the shoot for "${t.name}" is stopped.`);
    const city = (t.cast ?? []).filter(x => x !== YOU && !!g.cast[x]);
    if (startCaughtRumor(g, w, `${personaName()} was caught shooting an adult video at ${where}.`, place, { with: city, id: `caught:set:${t.id}:${nowAbs(g)}`, caught: place })) out.push('Word may get around.');
    banPlace(g, place);
    out.push(`${where} is closed to shoots for ${CAUGHT.days} days.`);
    out.push(...workWarning(g, w, CAUGHT.atWork));
    return out;
}

/* ---------- the roll ---------- */

/** One scene's roll: the die, the skill's bonus and the parts by name (`parts` adds up to `total`), the difficulty, the
 *  quality and the grade; `stop`: a co-star's hard limit stopped it (nothing rolled). */
export interface SceneRoll { d20: number; total: number; dc: number; q: number; grade: SceneGrade; parts: ShotPart[]; head?: ShotPart[]; takes?: { who: string; grade: SceneGrade }[]; stop?: { who: string; limit: string } }
/** A scene's difficulty: the genre's (12 when it sets none), one more for each scene after the first. */
export const sceneDc = (w: WorldDef, t: TitleRec, i: number): number => (genreOf(w, t.genre)?.dc ?? SET.dc) + Math.max(0, i);
const gradeOf = (total: number, dc: number, d20: number): SceneGrade => (d20 === 20 || (d20 !== 1 && total >= dc + SET.great) ? 'great' : d20 !== 1 && total >= dc ? 'good' : 'poor');
const qOf = (total: number, dc: number) => Math.max(0, Math.min(100, Math.round(SET.q.base + SET.q.per * (total - dc))));
/** The words a scene is tested by against limits and likes: its kind and the genre's words. */
const wordsOf = (w: WorldDef, t: TitleRec, sc: TitleScene) => [sc.kind, ...(genreOf(w, t.genre)?.words ?? [])].filter(Boolean);
const part = (name: string, add: number): ShotPart => ({ name, add });

// Chemistry with a co-star: a Tokyo person's friendship and romance with you, a performer's titles with you.
function chemistry(g: Save, w: WorldDef, x: string): number {
    const p = rosterOf(w, x) ?? (x !== YOU ? rosterByCard(g, w, x) : undefined);
    if (p) { const n = Number((g as any).industry?.roster?.[p.id]?.titles ?? 0) || 0; return n >= SET.titles[1] ? 2 : n >= SET.titles[0] ? 1 : 0; }
    const a = castAvatar(g, w, x); if (!a || a === YOU) return 0;
    if (statusOf(g, a, YOU) || (systemOn(w, 'romance') && ro(g, a, YOU) >= CRUSH)) return 2;
    return fr(g, a, YOU) >= FRIEND_START.friend ? 1 : 0;
}
// Titles you performed in over the last seven days (this one included) against the days of your rank: −2 a title over.
function burnout(g: Save, w: WorldDef, t: TitleRec): number {
    const o = myJob(g, w); if (!o || o.id !== w.industry?.job) return 0;
    const sd = o.schedule?.days, days = rankOf(g, o)?.days ?? (typeof sd === 'number' ? sd : Array.isArray(sd) ? sd.length : 3);
    const recent = titlesOf(g).filter(x => x.id !== t.id && !x.cancelled && x.you?.includes('perform') && x.shoot <= g.day && x.shoot > g.day - 7).length + 1;
    return -SET.burnout * Math.max(0, recent - (days + 1));
}
// What the title brings to every scene: Kanon's script, a set that suits the genre, a name director at the label.
function titleParts(g: Save, w: WorldDef, t: TitleRec, directing: boolean): ShotPart[] {
    const out: ShotPart[] = [];
    if ((t as any).script) out.push(part('The script', SET.script));
    const set = w.industry?.sets?.find(x => x.id === t.set);
    if (set?.genres?.includes(t.genre)) out.push(part('The set', SET.set));
    if (!directing && labelOf(w, t.label)?.director) out.push(part('The director\'s notes', SET.name));
    return out;
}
// Your own roll as a performer in a scene: the craft (Sensuality), stamina and the camera (Fitness, Charisma), the
// genre's own skill, and the parts by name.
interface Rolled { d20: number; total: number; head: ShotPart[]; parts: ShotPart[]; takes?: { who: string; grade: SceneGrade }[] }
function performerRoll(g: Save, w: WorldDef, t: TitleRec, i: number, sc: TitleScene, rnd: () => number, directing: boolean): Rolled {
    const genre = genreOf(w, t.genre), skill = craftSkill(w), words = wordsOf(w, t, sc), co = others(sc);
    const parts: ShotPart[] = [];
    const lvl = (id: string, per: number) => (has(w, id) ? Math.floor(levelOf(g, id) / per) : 0);
    const add = (name: string, n: number) => { if (n) parts.push(part(name, n)); };
    if (genre?.skill && genre.skill !== skill && has(w, genre.skill)) add(skillName(w, genre.skill), lvl(genre.skill, 3));
    if (genre?.skill !== 'fitness' && skill !== 'fitness') add('Stamina', lvl('fitness', 4));
    if (genre?.skill !== 'charisma' && skill !== 'charisma') add('On camera', lvl('charisma', 4));
    const avatars = co.map(x => castAvatar(g, w, x)).filter((a): a is string => !!a && a !== YOU);
    if (avatars.length) {
        const fit = avatars.reduce((n, a) => n + roleFit(yourRole(g, w), roleOf(g, a)), 0) / avatars.length;
        add('Your role and theirs', Math.trunc(fit));
        if (avatars.some(a => { const known = knownOf(g, a).likes; return likesOf(g, a).some(l => known.includes(l) && matchIn(g, words, [l])); })) add('A like you know', SET.knownLike);
        add('Chemistry', Math.max(0, ...co.map(x => chemistry(g, w, x))));
    }
    if (!directing && peekOnset(g)?.noted) add('Noted last time', SET.noted);
    add('Burnout', burnout(g, w, t));
    for (const p of titleParts(g, w, t, directing)) parts.push(p);
    const bonus = rollBonus(g, w, { skill, tags: ['set', t.genre, sc.kind].filter(Boolean) });
    const sum = parts.reduce((n, p) => n + p.add, 0);
    const d20 = rollD20(g, w, bonus + sum, sceneDc(w, t, i), rnd);
    return { d20, total: d20 + bonus + sum, head: [part('The die', d20), part(skillName(w, skill), bonus)], parts };
}
// A co-star's own take, rolled by the engine: a roster performer's rank, a Tokyo person's rank in the industry's job.
function takeOf(g: Save, w: WorldDef, x: string, dc: number, rnd: () => number): { d20: number; margin: number; grade: SceneGrade } {
    const p = rosterOf(w, x) ?? rosterByCard(g, w, x);
    const a = castAvatar(g, w, x);
    const bonus = p ? 2 * (p.rank ?? 0) : a && g.cast[a]?.occupation === w.industry?.job ? 2 * npcRank(g, a) : 0;
    const d20 = 1 + Math.floor(rnd() * 20), total = d20 + bonus;
    return { d20, margin: total - dc, grade: gradeOf(total, dc, d20) };
}
// The scene directed by you: your Charisma with the cast, your Logic with the schedule, your Photography with the
// camera (half of it; in full when you came through the lens), the title's parts, and the cast's takes (yours too,
// when you're in it) as one part.
function directorRoll(g: Save, w: WorldDef, t: TitleRec, i: number, sc: TitleScene, rnd: () => number): Rolled {
    const dc = sceneDc(w, t, i), parts: ShotPart[] = [];
    const add = (name: string, n: number) => { if (n) parts.push(part(name, n)); };
    const lens = !!(g as any).industry?.seats?.direct?.lens;
    if (has(w, 'logic')) add('The schedule', Math.floor(levelOf(g, 'logic') / 4));
    if (has(w, 'photography')) add(lens ? 'The camera (your eye from the lens)' : 'The camera', Math.floor(levelOf(g, 'photography') / (lens ? 2 : 4)));
    for (const p of titleParts(g, w, t, true)) parts.push(p);
    const takes: { who: string; grade: SceneGrade }[] = [], margins: number[] = [];
    for (const x of sc.with) {
        if (x === YOU) { const r = performerRoll(g, w, t, i, sc, rnd, true); margins.push(r.total - dc); takes.push({ who: YOU, grade: gradeOf(r.total, dc, r.d20) }); continue; }
        const k = takeOf(g, w, x, dc, rnd); margins.push(k.margin); takes.push({ who: x, grade: k.grade });
    }
    if (margins.length) add('The cast\'s takes', Math.round(margins.reduce((a, b) => a + b, 0) / margins.length / 2));
    const bonus = rollBonus(g, w, { skill: has(w, 'charisma') ? 'charisma' : undefined, tags: ['set', 'direct', t.genre, sc.kind].filter(Boolean) });
    const sum = parts.reduce((n, p) => n + p.add, 0);
    const d20 = rollD20(g, w, bonus + sum, dc, rnd);
    return { d20, total: d20 + bonus + sum, head: [part('The die', d20), part(has(w, 'charisma') ? `${skillName(w, 'charisma')} (directing)` : 'Directing', bonus)], parts, takes };
}
// A scene you're neither in nor directing: the cast's takes (their mean) and the title's parts; no die of yours.
function castRoll(g: Save, w: WorldDef, t: TitleRec, i: number, sc: TitleScene, rnd: () => number): Rolled {
    const dc = sceneDc(w, t, i), takes = sc.with.map(x => ({ x, k: takeOf(g, w, x, dc, rnd) }));
    const mean = takes.length ? Math.round(takes.reduce((n, y) => n + y.k.margin + dc, 0) / takes.length) : dc;
    const parts = titleParts(g, w, t, false);
    return { d20: 10, total: mean + parts.reduce((n, p) => n + p.add, 0), head: [part("The cast's takes", mean)], parts, takes: takes.map(y => ({ who: y.x, grade: y.k.grade })) };
}
/** Rolls scene `i` of a title (nothing written): a co-star's hard limit that its words match stops it first. */
export function rollScene(g: Save, w: WorldDef, t: TitleRec, i: number, rnd: () => number = Math.random): SceneRoll | null {
    const sc = t.scenes[i]; if (!sc) return null;
    const dc = sceneDc(w, t, i), words = wordsOf(w, t, sc);
    for (const x of others(sc)) {
        const a = castAvatar(g, w, x); if (!a) continue;
        const l = matchIn(g, words, limitsOf(g, a));
        if (l) return { d20: 0, total: 0, dc, q: 0, grade: 'poor', parts: [], stop: { who: x, limit: l } };
    }
    const directing = t.you?.includes('direct');
    const r = directing ? directorRoll(g, w, t, i, sc, rnd) : sc.with.includes(YOU) ? performerRoll(g, w, t, i, sc, rnd, false) : castRoll(g, w, t, i, sc, rnd);
    const grade = gradeOf(r.total, dc, r.d20);
    const skill = directing ? 'charisma' : craftSkill(w);
    for (const f of onRoll) f({ skill: has(w, skill) ? skillName(w, skill) : 'The scene', d20: r.d20, total: r.total, dc, grade: grade === 'great' ? 'critical-success' : grade === 'good' ? 'success' : 'fail' });
    return { d20: r.d20, total: r.total, dc, q: qOf(r.total, dc), grade, head: r.head, parts: [...r.head, ...r.parts], ...(r.takes ? { takes: r.takes } : {}) };
}

/* ---------- a scene's drawn picture ---------- */

// The ids a picture's `who` may name for someone in the cast: a roster id, or a Tokyo person's name (whole, first,
// without spaces), lower case.
function picIds(g: Save, w: WorldDef, x: string): string[] {
    const p = rosterOf(w, x) ?? rosterByCard(g, w, x);
    if (p) return [p.id.toLowerCase()];
    const name = castName(g, w, x).toLowerCase();
    return [...new Set([name, name.split(/\s+/)[0], name.replace(/\s+/g, '')])].filter(Boolean);
}
/** The drawn picture a scene shows: one of `w.industry.pictures` of a co-star in it (never you) for the title's genre
 *  or matching the scene's words (a picture naming neither fits any scene of theirs), the least shown first. Undefined:
 *  none (the cover only). */
export function pickPicture(g: Save, w: WorldDef, t: TitleRec, sc: TitleScene): string | undefined {
    const pics = w.industry?.pictures ?? [];
    if (!pics.length || !adultOn(g)) return undefined;
    const ids = new Set(others(sc).flatMap(x => picIds(g, w, x)));
    const words = wordsOf(w, t, sc);
    const fit = pics.filter(p => ids.has(p.who.toLowerCase()) && ((!p.genre && !p.words?.length) || p.genre === t.genre || (!!p.words?.length && !!matchIn(g, words, p.words))));
    if (!fit.length) return undefined;
    const shown = peekOnset(g)?.shown ?? {};
    return fit.reduce((a, b) => ((shown[b.file] ?? 0) < (shown[a.file] ?? 0) ? b : a)).file;
}

/* ---------- playing it ---------- */

const GRADE_WORDS: Record<SceneGrade, string> = { great: 'great', good: 'well', poor: 'poorly' };
const HOW: Record<SceneGrade, string> = { great: 'It goes brilliantly: everyone is in sync and the take is one to keep.', good: 'It goes well: a solid, usable take.', poor: 'It goes poorly: stiff, out of step, the take barely usable.' };
const whoLine = (g: Save, w: WorldDef, sc: TitleScene) => listed(sc.with.map(x => castName(g, w, x)));
const tellParts = (parts: ShotPart[], head: number) => parts.slice(head).filter(p => p.add).map(p => `${p.name} ${p.add > 0 ? '+' : '−'}${Math.abs(p.add)}`).join(', ');

// Writes a scene's roll into the title, and what follows from it: the take on screen (its people undressed while the
// AI plays it), the next one's set-up, the picture shown, your skill trained, being noted.
function shoot(g: Save, w: WorldDef, x: { s: ShootState; t: TitleRec }, rnd: () => number, extra?: ShotPart): { lines: string[]; ai: string } {
    const { s, t } = x, i = s.next, sc = t.scenes[i], now = nowAbs(g);
    const r = rollScene(g, w, t, i, rnd);
    if (!sc || !r) return { lines: [], ai: '' };
    if (r.stop) {
        // a hard limit: a kind no, the scene dropped (it isn't offered with them again: you know it now)
        const a = castAvatar(g, w, r.stop.who)!, name = castName(g, w, r.stop.who);
        if (systemOn(w, 'romance')) lose(g, 'r', a, YOU, 2);
        if (learn(g, a, 'limit', r.stop.limit)) tallyEvent(g, 'learned', 1, a);
        (s.stopped ??= []).push({ kind: sc.kind, who: r.stop.who, limit: r.stop.limit });
        t.scenes.splice(i, 1);
        s.ready = now;
        const text = `${name} doesn't want to do ${sc.kind}, and says so kindly: it's one of ${name}'s hard limits. The scene is dropped; the shoot moves on.`;
        return { lines: [text], ai: `On the set of "${t.name}", ${name} says a clear, kind no to the next scene (${sc.kind}): it goes against one of ${name}'s hard limits (${r.stop.limit}). The crew moves on without it. Narrate it gently; it isn't a fight, and the scene doesn't happen.` };
    }
    const parts = extra ? [...r.parts, extra] : r.parts;
    const total = r.total + (extra?.add ?? 0), grade = extra ? gradeOf(total, r.dc, r.d20) : r.grade, q = extra ? qOf(total, r.dc) : r.q;
    Object.assign(sc, { q, grade, parts });
    const pic = pickPicture(g, w, t, sc);
    if (pic) { sc.pic = pic; const sh = onsetOf(g).shown; sh[pic] = (sh[pic] ?? 0) + 1; }
    const performing = sc.with.includes(YOU), directing = !!t.you?.includes('direct');
    if (performing && !directing) onsetOf(g).noted = grade === 'poor';
    s.next = i + 1; s.ready = now + SET.setup;
    s.last = { n: i + 1, kind: sc.kind, grade, q, at: now };
    const take = sc.with.map(y => castAvatar(g, w, y)).filter((a): a is string => !!a && a !== YOU);
    s.take = { who: take, until: now + SET.take };
    const lines = [`Scene ${i + 1} of ${t.scenes.length} (${sc.kind})${others(sc).length ? ` with ${whoLine(g, w, { ...sc, with: others(sc) })}` : ''}: ${grade} — quality ${q}.${tellParts(parts, r.head?.length ?? 0) ? ` (${tellParts(parts, r.head?.length ?? 0)})` : ''}`];
    if (performing || directing) lines.push(...trainSkill(g, w, directing ? 'charisma' : craftSkill(w), grade === 'great' ? 6 : grade === 'good' ? 4 : 2));
    const seat = directing ? (performing ? 'directing and performing in' : 'directing') : performing ? 'performing in' : 'watching';
    const takes = (r.takes ?? []).filter(k => k.who !== YOU).map(k => `${castName(g, w, k.who)}'s take ${k.grade}`);
    const ai = `On the set of "${t.name}" (${genreOf(w, t.genre)?.name ?? t.genre}) for ${labelOf(w, t.label)?.name ?? t.label}, they shoot scene ${i + 1} of ${t.scenes.length}: ${sc.kind}, with ${whoLine(g, w, sc)}; {{user}} is ${seat} it. ${HOW[grade]}${takes.length ? ` (${takes.join('; ')}.)` : ''}`;
    return { lines, ai };
}
/** Plays the next scene of the shoot here: its roll, written into the title; the last one wraps the shoot. */
export function playScene(g: Save, w: WorldDef, rnd: () => number = Math.random): { lines: string[]; ai: string } {
    const x = liveShoot(g, w);
    if (!x || g.player.loc !== x.s.place) return { lines: [], ai: '' };
    const sc = x.t.scenes[x.s.next];
    if (!sc) return { lines: wrapShoot(g, w, 'done'), ai: '' };
    const out = shoot(g, w, x, rnd);
    if (x.s.next >= x.t.scenes.length) { out.lines.push(...wrapShoot(g, w, 'done')); out.ai += ' That was the last scene: the shoot wraps.'; }
    return out;
}
/** Shoots every scene left, one after another, the result of each in a line; then it wraps. `why`: you left the set,
 *  or the day ended (A's wrap): the rest are shot without you at your best (a part by name). */
function shootRest(g: Save, w: WorldDef, rnd: () => number, extra?: ShotPart): { lines: string[]; ai: string[] } {
    const lines: string[] = [], ai: string[] = [];
    for (let guard = 0; guard < 8; guard++) {
        const x = liveShoot(g, w); if (!x || x.s.next >= x.t.scenes.length) break;
        const r = shoot(g, w, x, rnd, extra);
        lines.push(...r.lines); if (r.ai) ai.push(r.ai);
    }
    return { lines, ai };
}
/** Skip to the result: the scenes left are rolled, and the shoot wraps. */
export function skipShoot(g: Save, w: WorldDef, rnd: () => number = Math.random): { lines: string[]; ai: string } {
    const x = liveShoot(g, w); if (!x) return { lines: [], ai: '' };
    const n = x.t.scenes.length - x.s.next;
    const r = shootRest(g, w, rnd);
    const grades = x.t.scenes.filter(s => s.grade).map(s => s.grade!);
    const lines = [...r.lines, ...wrapShoot(g, w, 'done')];
    return { lines, ai: `{{user}} works through the rest of the shoot of "${x.t.name}" (${n} scene${n === 1 ? '' : 's'}): ${grades.length ? `the scenes went ${grades.join(', ')}` : 'nothing more was shot'}. Tell it briefly, as the day winding down.` };
}

/* ---------- the end of a shoot ---------- */

/** Wraps the shoot: the scenes left are shot (with a part by name when you left, or the day ran out), the performers
 *  leave, `onWrap` runs. Lines to show. */
export function wrapShoot(g: Save, w: WorldDef, how: 'done' | 'left' | 'late' = 'late', rnd: () => number = Math.random): string[] {
    const o = peekOnset(g), s = o?.live; if (!o || !s) return [];
    const t = titleOfShoot(g, s);
    const lines: string[] = [];
    if (t && s.next < t.scenes.length && setOn(g, w)) {
        lines.push(how === 'left' ? 'You left the set: the scenes left are shot in a hurry without you at your best.' : 'The day ran out: the scenes left are rushed through.');
        lines.push(...shootRest(g, w, rnd, part(how === 'left' ? 'You left the set' : 'Out of time', how === 'left' ? SET.left : SET.late)).lines);
    }
    for (const a of onSetNow(g)) leave(g, a);   // (one shoot at a time: anyone on a set is on this one)
    delete o.live;
    if (!t) return lines;
    const shot = t.scenes.filter(x => x.q !== undefined);
    const q = shot.length ? Math.round(shot.reduce((n, x) => n + (x.q ?? 0), 0) / shot.length) : 0;
    lines.push(`That's a wrap on "${t.name}"${shot.length ? `: ${shot.length} scene${shot.length === 1 ? '' : 's'}, quality ${q} before the edit` : ''}.`);
    for (const f of onWrap) lines.push(...f(g, w, t));
    if (game() === g) void import('./game.js').then(G => G.syncScene());
    return lines;
}

/* ---------- the hooks ---------- */

setLink.start = startShoot;
setLink.current = (g) => {
    const s = liveOf(g); if (!s) return null;
    const t = titleOfShoot(g, s); if (!t) return null;
    return { title: t, place: s.place, call: s.call, roster: [...s.roster] };
};
setLink.wrap = (g, w) => wrapShoot(g, w, 'late');

// You walked away from the set (once you'd been on it): it wraps. On it: anyone called who isn't there yet is sent for.
function watch(g: Save, w: WorldDef) {
    const s = liveOf(g);
    if (!s) { for (const a of onSetNow(g)) leave(g, a); return; }   // (nobody stays on a set with no shoot on)
    if (!setOn(g, w)) { wrapShoot(g, w, 'late'); return; }
    if (g.player.loc === s.place) { s.here = true; callIn(g, w, s); return; }
    if (s.here) wrapShoot(g, w, 'left');
}
onLook.push(watch);
onHour.push((g, w) => { const had = !!liveOf(g); watch(g, w); return had && !liveOf(g) ? ['The shoot is over.'] : []; });
// (a shoot is a day's: one still on the next day wraps, if sim/titles.ts didn't)
onDay.push((g, w) => { const s = liveOf(g); return s && Math.floor(s.call / 1440) < g.day ? wrapShoot(g, w, 'late') : []; });

// (homerooms) A set at a home with rooms: the performers are in the room you're in.
roomRules.push((g, _w, r, x) => (r.onset && r.onset.place === x.loc ? x.mine : null));

// (dress) The people of the scene just shot are undressed while the AI plays it (their naked set: the overlay's, so in
// base they keep their clothes); between takes, the roster's performers wear a robe if they have one.
dressRules.push((g, w, avatar) => {
    const x = liveShoot(g, w);
    if (!x || g.player.loc !== x.s.place || !adultOn(g)) return null;
    const take = x.s.take;
    if (take && nowAbs(g) < take.until && take.who.includes(avatar)) return { code: 'naked' };
    return g.cast[avatar]?.onset?.title === x.s.title ? { kind: 'robe' } : null;
});

// The engine's actions on set.
const act = (x: Partial<ActionDef> & { id: string; name: string; label: string; minutes: number }): ActionDef => ({ icon: '🎬', cost: 0, effects: {}, scene: false, adult: true, tags: ['set'], fact: '{u} spent the day on set at {0}.', ...x } as ActionDef);
const step5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
/** What you can do on set now: play the next scene (once it's ready and its cast is here), wait for your call, or skip
 *  to the result. */
export function setActions(g: Save, w: WorldDef): ActionDef[] {
    const x = liveShoot(g, w);
    if (!x || g.player.loc !== x.s.place) return [];
    const { s, t } = x, sc = t.scenes[s.next];
    if (!sc) return [];
    const now = nowAbs(g), wait = s.ready - now, miss = missing(g, w, s, sc);
    const out: ActionDef[] = [];
    if (wait <= 0 && !miss.length) {
        const stop = others(sc).some(y => { const a = castAvatar(g, w, y); return !!a && !!matchIn(g, wordsOf(w, t, sc), limitsOf(g, a)); });
        out.push(act({ id: 'x-set-scene', name: 'Play the next scene', label: `Play the next scene: ${sc.kind} (${s.next + 1} of ${t.scenes.length})`, minutes: stop ? SET.stop : SET.scene, effects: stop ? {} : { energy: -SET.energy, hunger: -SET.hunger } }));
    } else out.push(act({ id: 'x-set-wait', name: 'Wait for your call', label: miss.length && wait <= 0 ? `Wait for your call (waiting for ${listed(miss)})` : 'Wait for your call', icon: '⏳', minutes: step5(Math.min(60, Math.max(5, wait > 0 ? wait : 30))), effects: { energy: -1 } }));
    const left = t.scenes.length - s.next;
    out.push(act({ id: 'x-set-skip', name: 'Skip to the result', label: `Skip to the result (${left} scene${left === 1 ? '' : 's'} left)`, icon: '⏭️', minutes: step5(Math.max(0, wait) + left * SET.scene + (left - 1) * SET.setup), effects: { energy: -SET.energy * left, hunger: -SET.hunger * left } }));
    return out;
}
engineActions.push(setActions);
const before = industryLink.act;
industryLink.act = (g, w, a, mates) => {
    if (a.id === 'x-set-scene') return playScene(g, w);
    if (a.id === 'x-set-skip') return skipShoot(g, w);
    if (a.id === 'x-set-wait') {
        const x = liveShoot(g, w); if (!x) return { lines: [], ai: '' };
        const sc = x.t.scenes[x.s.next], miss = sc ? missing(g, w, x.s, sc) : [];
        const ready = x.s.ready <= nowAbs(g) && !miss.length;
        return { lines: [ready ? 'The crew is ready for the next scene.' : miss.length ? `Still waiting for ${listed(miss)}.` : 'The crew is still setting up.'],
            ai: `{{user}} waits on the set of "${x.t.name}" while the crew ${ready ? 'gets ready for the next scene' : 'sets up lights and resets the room'}.` };
    }
    return before(g, w, a, mates);
};

// What the AI is told while the shoot is live, on set: the title, the scene next, who is in it and who you are on it,
// how the last one went; the performers here only for the shoot. Nothing with adult content off (no shoot happens).
sceneLines.push((g, w, present) => {
    const x = liveShoot(g, w);
    if (!x || g.player.loc !== x.s.place) return [];
    const { s, t } = x, sc = t.scenes[s.next], n = t.scenes.length;
    const label = labelOf(w, t.label)?.name ?? t.label, genre = genreOf(w, t.genre)?.name ?? t.genre;
    const seat = t.you?.includes('direct') ? (t.you.includes('perform') ? 'directing and performing' : 'directing') : 'performing';
    const out = [`This is a shoot for ${label}'s "${t.name}" (${genre}): ${sc ? `scene ${s.next + 1} of ${n}, ${sc.kind}, with ${whoLine(g, w, sc)}` : 'every scene is shot'}; {{user}} is ${seat}${s.last ? `; the last scene went ${GRADE_WORDS[s.last.grade]}` : ''}.`];
    const set = present.filter(r => r.onset?.title === s.title).map(r => r.name);
    if (set.length) out.push(`${listed(set)} ${set.length > 1 ? 'are performers' : 'is a performer'} here only for this shoot (not one of the city's people).`);
    const now = nowAbs(g);
    if (s.take && now < s.take.until) out.push('The scene just shot is still being played: the performers in it are undressed.');
    else if (sc && s.ready > now) out.push(`The crew is setting up the next scene (about ${step5(s.ready - now)} minutes).`);
    return out;
});

/* ---------- what the Take app shows of a shoot (U) ---------- */

/** A scene as the app shows it. */
export interface SceneView { n: number; kind: string; with: string[]; q?: number; grade?: SceneGrade; parts: ShotPart[]; pic?: string; dc: number }
/** The shoot being played, as the app shows it: the title, the set's place, your seat, the scenes (played ones with
 *  their results), the next one (ready in minutes, or who it waits for), the performers on set, the scenes a hard limit
 *  stopped. Null: no shoot on. */
export interface ShootView { title: string; name: string; label: string; genre: string; place: string; at: boolean; seat: 'perform' | 'direct' | 'both' | 'watch';
    scenes: SceneView[]; next: { n: number; kind: string; with: string[]; ready: number; waiting: string[] } | null; onSet: string[]; stopped: { kind: string; who: string }[] }
export function shootView(g: Save, w: WorldDef): ShootView | null {
    const x = liveShoot(g, w); if (!x) return null;
    const { s, t } = x, sc = t.scenes[s.next];
    const seat = t.you?.includes('direct') ? (t.you.includes('perform') ? 'both' : 'direct') : t.you?.includes('perform') ? 'perform' : 'watch';
    return { title: t.id, name: t.name, label: labelOf(w, t.label)?.name ?? t.label, genre: genreOf(w, t.genre)?.name ?? t.genre, place: placeName(g, w, s.place), at: g.player.loc === s.place, seat,
        scenes: scenesView(g, w, t),
        next: sc ? { n: s.next + 1, kind: sc.kind, with: sc.with.map(y => castName(g, w, y, 'You')), ready: Math.max(0, s.ready - nowAbs(g)), waiting: missing(g, w, s, sc) } : null,
        onSet: onSetNow(g).filter(a => g.cast[a].onset?.title === s.title).map(a => g.cast[a].name),
        stopped: (s.stopped ?? []).map(y => ({ kind: y.kind, who: castName(g, w, y.who) })) };
}
/** A title's scenes as the app shows them (any title: played ones carry their results, the parts adding up to the roll). */
export const scenesView = (g: Save, w: WorldDef, t: TitleRec): SceneView[] =>
    t.scenes.map((sc, i) => ({ n: i + 1, kind: sc.kind, with: sc.with.map(y => castName(g, w, y, 'You')), ...(sc.q !== undefined ? { q: sc.q } : {}), ...(sc.grade ? { grade: sc.grade } : {}), parts: sc.parts ?? [], ...(sc.pic ? { pic: sc.pic } : {}), dc: sceneDc(w, t, i) }));
