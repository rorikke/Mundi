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
// The stills (plans/industry-lens.md Part 1): between scenes, the director or the photographer in the title's `stills`
// seat can *Take the stills*, rolled as a photo shoot (Photography, the camera and gear, the set's lights) and kept in
// Lens as real photos of the performers as they are (their robe, lingerie or naked set, an expression from the last
// take); the best one becomes the title's cover at the wrap, and a photo brief that wants it is shot by it. A photo call
// (`setLink.visit`) brings a roster performer to a photo shoot's place the set's way, for its window.
import { nowAbs, adultOn, game } from '../core/store.js';
import { systemOn, exampleTag } from '../core/world.js';
import { BRIEF_DC } from '../core/photo.js';
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
import { dressRules, adultWear } from './dress.js';
import { riskRoll } from './dice.js';
import { CAUGHT, banPlace, bannedUntil, workWarning } from './caught.js';
import { startCaughtRumor } from './living.js';
import { social } from './social.js';
import { addStatus, statusDef } from './needs.js';
import { photoOn, peekPhoto, hasCamera, recordPhoto, placeCaption, briefOf, clientOf, trimPhotos, photoById } from './photo.js';
import { shotParts, starsOf, stillsShot } from './assignments.js';
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
export const peekOnset = (g) => g.onset;
export function onsetOf(g) {
    const o = (g.onset ??= {});
    o.cards ??= {};
    o.shown ??= {};
    return o;
}
const liveOf = (g) => peekOnset(g)?.live ?? null;
/** Is the set in play (the `industry` system, adult content and a world with an industry)? */
export const setOn = (g, w) => !!g && !!w?.industry && systemOn(w, 'industry') && adultOn(g);
/* ---------- the world's data ---------- */
/** A roster id as a title names it: `roster:<id>` (sim/titles.ts's way) or the bare id. */
export const rosterId = (x) => (x.startsWith('roster:') ? x.slice(7) : x);
/** A performer of the world's roster, by id (bare or `roster:<id>`). */
export const rosterOf = (w, id) => { const k = rosterId(id); return w.industry?.roster?.find(p => p.id === k); };
const genreOf = (w, id) => w.industry?.genres?.find(x => x.id === id);
const labelOf = (w, id) => w.industry?.labels?.find(x => x.id === id);
/** The skill a performer's scene leans on: the world's adult skill (Sensuality), else Charisma. */
const craftSkill = (w) => (w.skills ?? []).find(s => s.adult)?.id ?? 'charisma';
const has = (w, id) => !!skillDef(w, id);
const titlesOf = (g) => (g.industry?.titles ?? []);
/** The title a shoot is for: the industry's own record, else the copy the set kept. */
const titleOfShoot = (g, s) => titlesOf(g).find(t => t.id === s.title) ?? s.rec ?? null;
/** A roster performer's card (avatar), once made: the one remembered, else one carrying their tag. */
export function rosterCard(g, w, id) {
    const known = peekOnset(g)?.cards?.[rosterId(id)];
    if (known && charOf(known))
        return known;
    const p = rosterOf(w, id);
    if (!p)
        return null;
    const tag = exampleTag(w, p);
    return characters().find(c => c.data?.extensions?.mundi?.example === tag)?.avatar ?? null;
}
/** The roster performer a card is (by the card remembered or its tag), if any. */
export function rosterByCard(g, w, avatar) {
    const cards = peekOnset(g)?.cards ?? {};
    const id = Object.keys(cards).find(k => cards[k] === avatar);
    if (id)
        return rosterOf(w, id);
    const tag = charOf(avatar)?.data?.extensions?.mundi?.example;
    return tag ? w.industry?.roster?.find(p => exampleTag(w, p) === tag) : undefined;
}
/** Someone named on a title (YOU, a roster id or a card's avatar) as the avatar in the cast: a roster id becomes their
 *  card (null while there's none yet). */
export function castAvatar(g, w, x) {
    if (x === YOU)
        return YOU;
    if (rosterOf(w, x))
        return rosterCard(g, w, x);
    return x;
}
/** Their name (`you`: what to call you; {{user}} for the AI). */
export function castName(g, w, x, you = '{{user}}') {
    if (x === YOU)
        return you;
    const p = rosterOf(w, x) ?? rosterByCard(g, w, x);
    return p?.name ?? g.cast[x]?.name ?? String(charOf(x)?.name ?? x);
}
const listed = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? '');
const others = (s) => s.with.filter(x => x !== YOU);
/* ---------- performers coming on set and leaving ---------- */
const NOWHERE = { zone: '__guest', x: 0, y: 0 };
// One roster performer on set: in the cast, marked `onset`, with no home of their own; their profile (gender, likes,
// limits, role) from the roster, never over what the save learned since; you meet them on set.
function arrive(g, w, s, p, avatar) {
    const had = g.cast[avatar];
    if (had && !had.onset)
        return null; // never over one of the world's people
    onsetOf(g).cards[p.id] = avatar;
    if (had)
        return had;
    const routine = structuredClone(Object.values(w.cast.routineTemplates)[0]);
    const r = { avatar, name: p.name, occupation: null, home: { ...NOWHERE }, routine, leisure: [], met: true, onset: { title: s.title, place: s.place } };
    g.cast[avatar] = r;
    const people = relOf(g).people;
    if (!people[avatar])
        applyPerson(g, avatar, cleanPerson(p));
    if (Number.isFinite(p.age))
        (people[avatar] ??= {}).age = p.age;
    ensureProfile(g, w, avatar);
    return r;
}
// A performer leaves the set: out of the cast (their likes learned, titles together and everything in `rel` stay), out
// of what you're doing together right now.
function leave(g, avatar) {
    const soc = g.social;
    if (soc) {
        soc.with = (soc.with ?? []).filter((c) => c.avatar !== avatar);
        if (soc.solo === avatar)
            soc.solo = '';
    }
    delete g.cast[avatar];
}
/** The roster performers on set now (avatars). */
export const onSetNow = (g) => Object.keys(g.cast).filter(a => !!g.cast[a].onset && !isVisit(g.cast[a].onset.title));
// (a photo call's performer is marked `onset` with this title: the set's way, never one of the shoot's)
const VISIT = 'photo:';
const isVisit = (title) => title.startsWith(VISIT);
// Cards still being made or their pictures uploaded (one job per performer), the ones done this session (a card's
// pictures are looked at once a session, as the world's people's are), and the promise the tests wait on.
const bringing = new Map();
const brought = new Set();
let settled = Promise.resolve();
/** Resolves once every performer called has their card and pictures (tests). */
export const onsetSettled = () => settled;
// A performer's card made (the first time) or found, their portrait, sprites and outfits uploaded as the world's
// people's are (sim/game.ts, loaded when needed so this file adds nothing to the order modules load in), the outfits
// a shoot puts on (their robe, and their naked set with adult content on) not waiting to be worn first; then on set,
// if the shoot is still on, and the scene synced.
function bringIn(g, w, id) {
    const k = `${g.world}|${id}`;
    if (bringing.has(k) || (brought.has(k) && rosterCard(g, w, id)))
        return;
    const p = rosterOf(w, id);
    if (!p)
        return;
    const job = (async () => {
        const G = await import('./game.js');
        const found = G.foundCard(w, p);
        const avatar = found ?? (await G.exampleCards(w, [p]))[0];
        if (!avatar)
            return;
        if (found)
            await G.examplePictures(w, p, avatar);
        // every outfit her entry names (the robe, a swimsuit, lingerie, the naked set), the adult ones only with adult content on
        for (const [o, f] of Object.entries(p.outfits ?? {}))
            if (typeof f === 'string' && (adultOn(g) || (o !== 'naked' && !p.wear?.[o]?.adult)))
                await G.uploadOutfit(w, p, avatar, o).catch(() => false);
        const s = liveOf(g);
        brought.add(k);
        if (s && s.roster.includes(id) && setOn(g, w)) {
            arrive(g, w, s, p, avatar);
            if (game() === g)
                await G.syncScene();
        }
    })().catch(e => console.warn('[Mundi] on set:', p.name, e)).finally(() => bringing.delete(k));
    bringing.set(k, job);
    settled = Promise.all([...bringing.values()]);
}
// Everyone called who isn't on set yet: on set now when their card is known, else as soon as it's made.
function callIn(g, w, s) {
    for (const id of s.roster) {
        const p = rosterOf(w, id);
        if (!p)
            continue;
        const card = rosterCard(g, w, id);
        if (card && !g.cast[card])
            arrive(g, w, s, p, card);
        // (a save opened mid-shoot: its repairs gave them a home, which they never have)
        else if (card && g.cast[card]?.onset && g.cast[card].home.zone !== NOWHERE.zone)
            g.cast[card].home = { ...NOWHERE };
        bringIn(g, w, id); // (pictures and outfits, once; a card that isn't there yet is made)
    }
}
/* ---------- the shoot's state ---------- */
/** The shoot being played now and its title, or null. */
export function liveShoot(g, w) {
    const s = liveOf(g);
    if (!s || !setOn(g, w))
        return null;
    const t = titleOfShoot(g, s);
    return t ? { s, t } : null;
}
/** Are you on the set of the shoot being played? */
export const atSet = (g, w) => { const x = liveShoot(g, w); return !!x && g.player.loc === x.s.place; };
// The people in a scene who aren't on set yet (names): the scene waits for them.
function missing(g, w, s, scene) {
    const here = new Set(presentAt(g, w, s.place).map(r => r.avatar));
    return others(scene).filter(x => { const a = castAvatar(g, w, x); return !a || !here.has(a); }).map(x => castName(g, w, x));
}
/** Starts a shoot (the call time has come): the performers called come on set. Lines to show. */
export function startShoot(g, w, call) {
    if (!setOn(g, w) || !call?.title?.id || !call.place)
        return [];
    const out = [];
    const o = onsetOf(g);
    if (o.live && o.live.title !== call.title.id)
        out.push(...wrapShoot(g, w, 'late'));
    if (o.live?.title === call.title.id)
        return out;
    const stopped = setRisk(g, w, call.title, call.place);
    if (stopped)
        return [...out, ...stopped];
    const inStore = titlesOf(g).some(t => t.id === call.title.id);
    const s = { title: call.title.id, place: call.place, call: call.call, roster: [...new Set((call.roster ?? []).map(rosterId))].filter(id => !!rosterOf(w, id)), next: 0,
        ready: Math.max(nowAbs(g), call.call) + SET.makeup, ...(inStore ? {} : { rec: call.title }) };
    if (g.player.loc === s.place)
        s.here = true;
    o.live = s;
    callIn(g, w, s);
    const t = titleOfShoot(g, s);
    const names = s.roster.map(id => rosterOf(w, id).name);
    out.push(`Call time for "${t.name}" at ${placeName(g, w, s.place)}${names.length ? `: ${listed(names)} ${names.length > 1 ? 'are' : 'is'} on set` : ''}. Hair and make-up first.`);
    return out;
}
/* ---------- a risky set ---------- */
/** A set's `risk` at the call, rolled once as a risky private action's is (riskRoll: the `risk` effects count). Caught, or
 *  the place still closed from last time: the shoot is stopped (the title dropped, nobody's fault but the set's: no
 *  standing lost, no fee), and caught, word may get around (an adult rumor about you and the city's people in it), the
 *  place closed for a week (sim/caught.ts's ban) and a warning at work. Returns those lines; null when the shoot goes on
 *  (not caught: performing there is the thrill, mood and Desire full, as a risky private action gives). */
export function setRisk(g, w, t, place, rnd = Math.random) {
    const set = w.industry?.sets?.find(x => x.id === t.set), risk = Number(set?.risk) || 0;
    if (!setOn(g, w) || !set || !(risk > 0) || !place)
        return null;
    const where = placeName(g, w, place), out = [];
    const drop = () => {
        const st = g.industry, plans = new Set(t.plans ?? []);
        if (st?.titles)
            st.titles = st.titles.filter((x) => x.id !== t.id);
        for (const a of social(g).appts)
            if (plans.has(a.id) && a.state === 'set')
                a.state = 'cancelled';
    };
    if (bannedUntil(g, place)) {
        drop();
        return [`${where} is closed to shoots this week: the shoot for "${t.name}" is called off.`];
    }
    if (!riskRoll(g, w, { id: set.id, tags: ['set', 'work', t.genre], risk }, rnd).caught) {
        if (!t.you?.includes('perform'))
            return null;
        tallyEvent(g, 'risky');
        addStatus(g, w, 'mood', CAUGHT.thrillMood);
        const d = statusDef(w, 'desire');
        if (d)
            addStatus(g, w, 'desire', d.max);
        return null;
    }
    drop();
    tallyEvent(g, 'caught');
    addStatus(g, w, 'mood', CAUGHT.mood);
    out.push(`Someone saw the crew setting up at ${where}: the shoot for "${t.name}" is stopped.`);
    const city = (t.cast ?? []).filter(x => x !== YOU && !!g.cast[x]);
    if (startCaughtRumor(g, w, `${personaName()} was caught shooting an adult video at ${where}.`, place, { with: city, id: `caught:set:${t.id}:${nowAbs(g)}`, caught: place }))
        out.push('Word may get around.');
    banPlace(g, place);
    out.push(`${where} is closed to shoots for ${CAUGHT.days} days.`);
    out.push(...workWarning(g, w, CAUGHT.atWork));
    return out;
}
/** A scene's difficulty: the genre's (12 when it sets none), one more for each scene after the first. */
export const sceneDc = (w, t, i) => (genreOf(w, t.genre)?.dc ?? SET.dc) + Math.max(0, i);
const gradeOf = (total, dc, d20) => (d20 === 20 || (d20 !== 1 && total >= dc + SET.great) ? 'great' : d20 !== 1 && total >= dc ? 'good' : 'poor');
const qOf = (total, dc) => Math.max(0, Math.min(100, Math.round(SET.q.base + SET.q.per * (total - dc))));
/** The words a scene is tested by against limits and likes: its kind and the genre's words. */
const wordsOf = (w, t, sc) => [sc.kind, ...(genreOf(w, t.genre)?.words ?? [])].filter(Boolean);
const part = (name, add) => ({ name, add });
// Chemistry with a co-star: a Tokyo person's friendship and romance with you, a performer's titles with you.
function chemistry(g, w, x) {
    const p = rosterOf(w, x) ?? (x !== YOU ? rosterByCard(g, w, x) : undefined);
    if (p) {
        const n = Number(g.industry?.roster?.[p.id]?.titles ?? 0) || 0;
        return n >= SET.titles[1] ? 2 : n >= SET.titles[0] ? 1 : 0;
    }
    const a = castAvatar(g, w, x);
    if (!a || a === YOU)
        return 0;
    if (statusOf(g, a, YOU) || (systemOn(w, 'romance') && ro(g, a, YOU) >= CRUSH))
        return 2;
    return fr(g, a, YOU) >= FRIEND_START.friend ? 1 : 0;
}
// Titles you performed in over the last seven days (this one included) against the days of your rank: −2 a title over.
function burnout(g, w, t) {
    const o = myJob(g, w);
    if (!o || o.id !== w.industry?.job)
        return 0;
    const sd = o.schedule?.days, days = rankOf(g, o)?.days ?? (typeof sd === 'number' ? sd : Array.isArray(sd) ? sd.length : 3);
    const recent = titlesOf(g).filter(x => x.id !== t.id && !x.cancelled && x.you?.includes('perform') && x.shoot <= g.day && x.shoot > g.day - 7).length + 1;
    return -SET.burnout * Math.max(0, recent - (days + 1));
}
// What the title brings to every scene: Kanon's script, a set that suits the genre, a name director at the label.
function titleParts(g, w, t, directing) {
    const out = [];
    if (t.script)
        out.push(part('The script', SET.script));
    const set = w.industry?.sets?.find(x => x.id === t.set);
    if (set?.genres?.includes(t.genre))
        out.push(part('The set', SET.set));
    if (!directing && labelOf(w, t.label)?.director)
        out.push(part('The director\'s notes', SET.name));
    return out;
}
function performerRoll(g, w, t, i, sc, rnd, directing) {
    const genre = genreOf(w, t.genre), skill = craftSkill(w), words = wordsOf(w, t, sc), co = others(sc);
    const parts = [];
    const lvl = (id, per) => (has(w, id) ? Math.floor(levelOf(g, id) / per) : 0);
    const add = (name, n) => { if (n)
        parts.push(part(name, n)); };
    if (genre?.skill && genre.skill !== skill && has(w, genre.skill))
        add(skillName(w, genre.skill), lvl(genre.skill, 3));
    if (genre?.skill !== 'fitness' && skill !== 'fitness')
        add('Stamina', lvl('fitness', 4));
    if (genre?.skill !== 'charisma' && skill !== 'charisma')
        add('On camera', lvl('charisma', 4));
    const avatars = co.map(x => castAvatar(g, w, x)).filter((a) => !!a && a !== YOU);
    if (avatars.length) {
        const fit = avatars.reduce((n, a) => n + roleFit(yourRole(g, w), roleOf(g, a)), 0) / avatars.length;
        add('Your role and theirs', Math.trunc(fit));
        if (avatars.some(a => { const known = knownOf(g, a).likes; return likesOf(g, a).some(l => known.includes(l) && matchIn(g, words, [l])); }))
            add('A like you know', SET.knownLike);
        add('Chemistry', Math.max(0, ...co.map(x => chemistry(g, w, x))));
    }
    if (!directing && peekOnset(g)?.noted)
        add('Noted last time', SET.noted);
    add('Burnout', burnout(g, w, t));
    for (const p of titleParts(g, w, t, directing))
        parts.push(p);
    const bonus = rollBonus(g, w, { skill, tags: ['set', t.genre, sc.kind].filter(Boolean) });
    const sum = parts.reduce((n, p) => n + p.add, 0);
    const d20 = rollD20(g, w, bonus + sum, sceneDc(w, t, i), rnd);
    return { d20, total: d20 + bonus + sum, head: [part('The die', d20), part(skillName(w, skill), bonus)], parts };
}
// A co-star's own take, rolled by the engine: a roster performer's rank, a Tokyo person's rank in the industry's job.
function takeOf(g, w, x, dc, rnd) {
    const p = rosterOf(w, x) ?? rosterByCard(g, w, x);
    const a = castAvatar(g, w, x);
    const bonus = p ? 2 * (p.rank ?? 0) : a && g.cast[a]?.occupation === w.industry?.job ? 2 * npcRank(g, a) : 0;
    const d20 = 1 + Math.floor(rnd() * 20), total = d20 + bonus;
    return { d20, margin: total - dc, grade: gradeOf(total, dc, d20) };
}
// The scene directed by you: your Charisma with the cast, your Logic with the schedule, your Photography with the
// camera (half of it; in full when you came through the lens), the title's parts, and the cast's takes (yours too,
// when you're in it) as one part.
function directorRoll(g, w, t, i, sc, rnd) {
    const dc = sceneDc(w, t, i), parts = [];
    const add = (name, n) => { if (n)
        parts.push(part(name, n)); };
    const lens = !!g.industry?.seats?.direct?.lens;
    if (has(w, 'logic'))
        add('The schedule', Math.floor(levelOf(g, 'logic') / 4));
    if (has(w, 'photography'))
        add(lens ? 'The camera (your eye from the lens)' : 'The camera', Math.floor(levelOf(g, 'photography') / (lens ? 2 : 4)));
    for (const p of titleParts(g, w, t, true))
        parts.push(p);
    const takes = [], margins = [];
    for (const x of sc.with) {
        if (x === YOU) {
            const r = performerRoll(g, w, t, i, sc, rnd, true);
            margins.push(r.total - dc);
            takes.push({ who: YOU, grade: gradeOf(r.total, dc, r.d20) });
            continue;
        }
        const k = takeOf(g, w, x, dc, rnd);
        margins.push(k.margin);
        takes.push({ who: x, grade: k.grade });
    }
    if (margins.length)
        add('The cast\'s takes', Math.round(margins.reduce((a, b) => a + b, 0) / margins.length / 2));
    const bonus = rollBonus(g, w, { skill: has(w, 'charisma') ? 'charisma' : undefined, tags: ['set', 'direct', t.genre, sc.kind].filter(Boolean) });
    const sum = parts.reduce((n, p) => n + p.add, 0);
    const d20 = rollD20(g, w, bonus + sum, dc, rnd);
    return { d20, total: d20 + bonus + sum, head: [part('The die', d20), part(has(w, 'charisma') ? `${skillName(w, 'charisma')} (directing)` : 'Directing', bonus)], parts, takes };
}
// A scene you're neither in nor directing: the cast's takes (their mean) and the title's parts; no die of yours.
function castRoll(g, w, t, i, sc, rnd) {
    const dc = sceneDc(w, t, i), takes = sc.with.map(x => ({ x, k: takeOf(g, w, x, dc, rnd) }));
    const mean = takes.length ? Math.round(takes.reduce((n, y) => n + y.k.margin + dc, 0) / takes.length) : dc;
    const parts = titleParts(g, w, t, false);
    return { d20: 10, total: mean + parts.reduce((n, p) => n + p.add, 0), head: [part("The cast's takes", mean)], parts, takes: takes.map(y => ({ who: y.x, grade: y.k.grade })) };
}
/** Rolls scene `i` of a title (nothing written): a co-star's hard limit that its words match stops it first. */
export function rollScene(g, w, t, i, rnd = Math.random) {
    const sc = t.scenes[i];
    if (!sc)
        return null;
    const dc = sceneDc(w, t, i), words = wordsOf(w, t, sc);
    for (const x of others(sc)) {
        const a = castAvatar(g, w, x);
        if (!a)
            continue;
        const l = matchIn(g, words, limitsOf(g, a));
        if (l)
            return { d20: 0, total: 0, dc, q: 0, grade: 'poor', parts: [], stop: { who: x, limit: l } };
    }
    const directing = t.you?.includes('direct');
    const r = directing ? directorRoll(g, w, t, i, sc, rnd) : sc.with.includes(YOU) ? performerRoll(g, w, t, i, sc, rnd, false) : castRoll(g, w, t, i, sc, rnd);
    const grade = gradeOf(r.total, dc, r.d20);
    const skill = directing ? 'charisma' : craftSkill(w);
    for (const f of onRoll)
        f({ skill: has(w, skill) ? skillName(w, skill) : 'The scene', d20: r.d20, total: r.total, dc, grade: grade === 'great' ? 'critical-success' : grade === 'good' ? 'success' : 'fail' });
    return { d20: r.d20, total: r.total, dc, q: qOf(r.total, dc), grade, head: r.head, parts: [...r.head, ...r.parts], ...(r.takes ? { takes: r.takes } : {}) };
}
/* ---------- a scene's drawn picture ---------- */
// The ids a picture's `who` may name for someone in the cast: a roster id, or a Tokyo person's name (whole, first,
// without spaces), lower case.
function picIds(g, w, x) {
    const p = rosterOf(w, x) ?? rosterByCard(g, w, x);
    if (p)
        return [p.id.toLowerCase()];
    const name = castName(g, w, x).toLowerCase();
    return [...new Set([name, name.split(/\s+/)[0], name.replace(/\s+/g, '')])].filter(Boolean);
}
/** The drawn picture a scene shows: one of `w.industry.pictures` of a co-star in it (never you) for the title's genre
 *  or matching the scene's words (a picture naming neither fits any scene of theirs), the least shown first. Undefined:
 *  none (the cover only). */
export function pickPicture(g, w, t, sc) {
    const pics = w.industry?.pictures ?? [];
    if (!pics.length || !adultOn(g))
        return undefined;
    const ids = new Set(others(sc).flatMap(x => picIds(g, w, x)));
    const words = wordsOf(w, t, sc);
    const fit = pics.filter(p => ids.has(p.who.toLowerCase()) && ((!p.genre && !p.words?.length) || p.genre === t.genre || (!!p.words?.length && !!matchIn(g, words, p.words))));
    if (!fit.length)
        return undefined;
    const shown = peekOnset(g)?.shown ?? {};
    return fit.reduce((a, b) => ((shown[b.file] ?? 0) < (shown[a.file] ?? 0) ? b : a)).file;
}
/* ---------- playing it ---------- */
const GRADE_WORDS = { great: 'great', good: 'well', poor: 'poorly' };
const HOW = { great: 'It goes brilliantly: everyone is in sync and the take is one to keep.', good: 'It goes well: a solid, usable take.', poor: 'It goes poorly: stiff, out of step, the take barely usable.' };
const whoLine = (g, w, sc) => listed(sc.with.map(x => castName(g, w, x)));
const tellParts = (parts, head) => parts.slice(head).filter(p => p.add).map(p => `${p.name} ${p.add > 0 ? '+' : '−'}${Math.abs(p.add)}`).join(', ');
// Writes a scene's roll into the title, and what follows from it: the take on screen (its people undressed while the
// AI plays it), the next one's set-up, the picture shown, your skill trained, being noted.
function shoot(g, w, x, rnd, extra) {
    const { s, t } = x, i = s.next, sc = t.scenes[i], now = nowAbs(g);
    const r = rollScene(g, w, t, i, rnd);
    if (!sc || !r)
        return { lines: [], ai: '' };
    if (r.stop) {
        // a hard limit: a kind no, the scene dropped (it isn't offered with them again: you know it now)
        const a = castAvatar(g, w, r.stop.who), name = castName(g, w, r.stop.who);
        if (systemOn(w, 'romance'))
            lose(g, 'r', a, YOU, 2);
        if (learn(g, a, 'limit', r.stop.limit))
            tallyEvent(g, 'learned', 1, a);
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
    if (pic) {
        sc.pic = pic;
        const sh = onsetOf(g).shown;
        sh[pic] = (sh[pic] ?? 0) + 1;
    }
    const performing = sc.with.includes(YOU), directing = !!t.you?.includes('direct');
    if (performing && !directing)
        onsetOf(g).noted = grade === 'poor';
    s.next = i + 1;
    s.ready = now + SET.setup;
    s.last = { n: i + 1, kind: sc.kind, grade, q, at: now };
    const take = sc.with.map(y => castAvatar(g, w, y)).filter((a) => !!a && a !== YOU);
    s.take = { who: take, until: now + SET.take };
    const lines = [`Scene ${i + 1} of ${t.scenes.length} (${sc.kind})${others(sc).length ? ` with ${whoLine(g, w, { ...sc, with: others(sc) })}` : ''}: ${grade} — quality ${q}.${tellParts(parts, r.head?.length ?? 0) ? ` (${tellParts(parts, r.head?.length ?? 0)})` : ''}`];
    if (performing || directing)
        lines.push(...trainSkill(g, w, directing ? 'charisma' : craftSkill(w), grade === 'great' ? 6 : grade === 'good' ? 4 : 2));
    const seat = directing ? (performing ? 'directing and performing in' : 'directing') : performing ? 'performing in' : t.you?.includes('stills') ? 'taking the stills on' : 'watching';
    const takes = (r.takes ?? []).filter(k => k.who !== YOU).map(k => `${castName(g, w, k.who)}'s take ${k.grade}`);
    const ai = `On the set of "${t.name}" (${genreOf(w, t.genre)?.name ?? t.genre}) for ${labelOf(w, t.label)?.name ?? t.label}, they shoot scene ${i + 1} of ${t.scenes.length}: ${sc.kind}, with ${whoLine(g, w, sc)}; {{user}} is ${seat} it. ${HOW[grade]}${takes.length ? ` (${takes.join('; ')}.)` : ''}`;
    return { lines, ai };
}
/** Plays the next scene of the shoot here: its roll, written into the title; the last one wraps the shoot. */
export function playScene(g, w, rnd = Math.random) {
    const x = liveShoot(g, w);
    if (!x || g.player.loc !== x.s.place)
        return { lines: [], ai: '' };
    const sc = x.t.scenes[x.s.next];
    if (!sc)
        return { lines: wrapShoot(g, w, 'done'), ai: '' };
    const out = shoot(g, w, x, rnd);
    if (x.s.next >= x.t.scenes.length) {
        out.lines.push(...wrapShoot(g, w, 'done'));
        out.ai += ' That was the last scene: the shoot wraps.';
    }
    return out;
}
/** Shoots every scene left, one after another, the result of each in a line; then it wraps. `why`: you left the set,
 *  or the day ended (A's wrap): the rest are shot without you at your best (a part by name). */
function shootRest(g, w, rnd, extra) {
    const lines = [], ai = [];
    for (let guard = 0; guard < 8; guard++) {
        const x = liveShoot(g, w);
        if (!x || x.s.next >= x.t.scenes.length)
            break;
        const r = shoot(g, w, x, rnd, extra);
        lines.push(...r.lines);
        if (r.ai)
            ai.push(r.ai);
    }
    return { lines, ai };
}
/** Skip to the result: the scenes left are rolled, and the shoot wraps. */
export function skipShoot(g, w, rnd = Math.random) {
    const x = liveShoot(g, w);
    if (!x)
        return { lines: [], ai: '' };
    const n = x.t.scenes.length - x.s.next;
    const r = shootRest(g, w, rnd);
    const grades = x.t.scenes.filter(s => s.grade).map(s => s.grade);
    const lines = [...r.lines, ...wrapShoot(g, w, 'done')];
    return { lines, ai: `{{user}} works through the rest of the shoot of "${x.t.name}" (${n} scene${n === 1 ? '' : 's'}): ${grades.length ? `the scenes went ${grades.join(', ')}` : 'nothing more was shot'}. Tell it briefly, as the day winding down.` };
}
/* ---------- the end of a shoot ---------- */
/** Wraps the shoot: the scenes left are shot (with a part by name when you left, or the day ran out), the performers
 *  leave, `onWrap` runs. Lines to show. */
export function wrapShoot(g, w, how = 'late', rnd = Math.random) {
    const o = peekOnset(g), s = o?.live;
    if (!o || !s)
        return [];
    const t = titleOfShoot(g, s);
    const lines = [];
    if (t && s.next < t.scenes.length && setOn(g, w)) {
        lines.push(how === 'left' ? 'You left the set: the scenes left are shot in a hurry without you at your best.' : 'The day ran out: the scenes left are rushed through.');
        lines.push(...shootRest(g, w, rnd, part(how === 'left' ? 'You left the set' : 'Out of time', how === 'left' ? SET.left : SET.late)).lines);
    }
    for (const a of onSetNow(g))
        leave(g, a); // (one shoot at a time: anyone on a set is on this one)
    delete o.live;
    if (!t)
        return lines;
    const shot = t.scenes.filter(x => x.q !== undefined);
    const q = shot.length ? Math.round(shot.reduce((n, x) => n + (x.q ?? 0), 0) / shot.length) : 0;
    lines.push(`That's a wrap on "${t.name}"${shot.length ? `: ${shot.length} scene${shot.length === 1 ? '' : 's'}, quality ${q} before the edit` : ''}.`);
    lines.push(...coverFromStills(g, s, t));
    for (const f of onWrap)
        lines.push(...f(g, w, t));
    if (game() === g)
        void import('./game.js').then(G => G.syncScene());
    return lines;
}
/* ---------- the stills (plans/industry-lens.md Part 1) ---------- */
/** The stills' numbers: a round's minutes and energy, the set's lights (a set is lit for video), the last take's part
 *  (a great take shows in the faces). The cover's sales bonus is sim/titles.ts's. */
export const STILLS = { minutes: 30, energy: 3, light: 2, take: { great: 3, good: 0, poor: -3 } };
export const STILLS_ID = 'x-set-stills';
// (the expression the last take leaves on their faces; before any take, a calm one)
const STILLS_EXPR = { great: 'desire', good: 'joy', poor: 'nervousness' };
/** The photo brief that booked you onto a title's stills seat (sim/titles.ts writes `stills`: the taken brief's id). */
export const stillsBrief = (g, t) => { const id = t.stills; return id === undefined ? undefined : peekPhoto(g).open.find(x => x.id === id); };
// A roster performer's outfit of a kind from her entry (the set's robe, her lingerie) with a picture folder, an adult one
// only with adult content on; the naked set is its own name.
function setOutfit(g, w, avatar, kind) {
    const p = rosterByCard(g, w, avatar);
    if (!p)
        return undefined;
    if (kind === 'naked')
        return typeof p.outfits?.naked === 'string' && adultOn(g) ? 'naked' : undefined;
    const wear = (p.wear ?? {});
    return Object.keys(wear).find(o => wear[o]?.kind === kind && typeof p.outfits?.[o] === 'string' && (adultOn(g) || !adultWear(wear[o])));
}
const takeOn = (g, s) => !!s.take && nowAbs(g) < s.take.until;
// The next scene's performers once the crew is ready for it: they wait for the call in lingerie (if they have one).
function readyFor(g, w, x, avatar) {
    const sc = x.t.scenes[x.s.next];
    return !!sc && x.s.ready <= nowAbs(g) && !takeOn(g, x.s) && sc.with.some(y => castAvatar(g, w, y) === avatar);
}
// You were in the scene whose take is still playing: mid-scene.
const midScene = (g, s, t) => takeOn(g, s) && !!s.last && !!t.scenes[s.last.n - 1]?.with.includes(YOU);
/** What someone on set is wearing now, as the stills record it (the set's dress rule): undressed in the take still
 *  playing (`naked`), in lingerie waiting for the next scene, else the set's robe; one of Tokyo's people between takes
 *  wears their own clothes (undefined). */
export function stillOutfit(g, w, x, avatar) {
    if (takeOn(g, x.s) && x.s.take.who.includes(avatar))
        return adultOn(g) ? 'naked' : undefined;
    if (g.cast[avatar]?.onset?.title !== x.s.title)
        return undefined;
    return (readyFor(g, w, x, avatar) ? setOutfit(g, w, avatar, 'lingerie') : undefined) ?? setOutfit(g, w, avatar, 'robe');
}
/** Who the stills can show now (avatars on set, two at most, never you): the people of the take still playing, else
 *  the next scene's, else anyone of the cast; never the label's own director (nothing of her on her own set). */
export function stillsWho(g, w, x) {
    const { s, t } = x, here = new Set(presentAt(g, w, s.place).map(r => r.avatar));
    const director = String(labelOf(w, t.label)?.director ?? '').trim().toLowerCase();
    const sc = t.scenes[s.next];
    const pool = takeOn(g, s) ? s.take.who : [...(sc ? others(sc) : []), ...t.cast.filter(y => y !== YOU)].map(y => castAvatar(g, w, y));
    const notDirector = (a) => { const n = castName(g, w, a).toLowerCase(); return !director || (n !== director && n.split(/\s+/)[0] !== director); };
    return [...new Set(pool)].filter((a) => !!a && a !== YOU && here.has(a) && notDirector(a)).slice(0, 2);
}
/** Why you can't take the stills now ('' you can): on set in a world with photography, directing or in the stills
 *  seat, a camera of your own, not in the middle of a scene you're in, one round between two scenes, someone to shoot. */
export function stillsWhy(g, w) {
    const x = liveShoot(g, w);
    if (!x || g.player.loc !== x.s.place || !photoOn(w))
        return 'Only on set.';
    const { s, t } = x;
    if (!t.you?.includes('direct') && !t.you?.includes('stills'))
        return 'The director or the stills photographer takes the stills.';
    if (!hasCamera(g, w))
        return 'You need a camera.';
    if (midScene(g, s, t))
        return 'Not in the middle of a scene.';
    if (!t.scenes[s.next])
        return 'Every scene is shot.';
    if (s.stillsAt === s.next)
        return 'This round\'s stills are taken: the next ones after the next scene.';
    if (!stillsWho(g, w, x).length)
        return 'Nobody on set to photograph yet.';
    return '';
}
/** The stills' roll, a photo shoot's: d20 + Photography (half of it for a director who didn't come through the lens)
 *  against the brief's DC (12 without one); quality 50 + 6 a point over it plus every part by name: the camera and
 *  gear as sim/assignments.ts's `shotParts` names them (the set lit as a studio is), the set's lights, the last take. */
export function stillsRoll(g, w, x, rnd = Math.random) {
    const { s, t } = x, tk = stillsBrief(g, t), b = tk ? briefOf(w, tk.brief) : undefined;
    const dc = b?.dc ?? BRIEF_DC, lens = !!g.industry?.seats?.direct?.lens, lvl = levelOf(g, 'photography');
    const half = t.you?.includes('direct') && !lens && has(w, 'photography') ? Math.floor(lvl / 2) - Math.floor(lvl / 4) : 0;
    const bonus = rollBonus(g, w, { skill: 'photography', tags: ['shoot', 'portrait', 'set'] }) - half;
    const d20 = rollD20(g, w, bonus, dc, rnd), total = d20 + bonus, ok = d20 === 20 || (d20 > 1 && total >= dc);
    const base = 50 + 6 * (total - dc);
    const brief = { ...(b ?? { id: 'set', client: t.label, name: 'Stills', text: '', board: 'full', kind: 'portrait', places: [s.place], pay: 0 }), studio: true, window: undefined };
    const parts = shotParts(g, w, { place: s.place, lane: 'full' }, brief);
    parts.push({ name: 'The set\'s lights', n: STILLS.light });
    const take = s.last ? STILLS.take[s.last.grade] : 0;
    if (take)
        parts.push({ name: 'The last take', n: take });
    const q = Math.round(Math.max(0, Math.min(100, base + parts.reduce((a, p) => a + p.n, 0))));
    const skill = has(w, 'photography') ? skillName(w, 'photography') : 'Photography';
    return { d20, bonus, total, dc, ok, base, q, parts, head: [{ name: 'The die', n: d20 }, { name: half ? `${skill} (half: a director's eye)` : skill, n: bonus }] };
}
const OUTFIT_WORDS = { naked: 'naked', robe: 'in a robe', lingerie: 'in lingerie' };
/** Takes a round of stills: a photo kept in Lens (src `set`, adult, the title's) of the performers as they are, what it
 *  does for a brief that wants it (sim/assignments.ts's `stillsShot`), Photography trained. Lines and the AI's. */
export function takeStills(g, w, rnd = Math.random) {
    const why = stillsWhy(g, w);
    if (why)
        return { lines: [why], ai: '' };
    const x = liveShoot(g, w), { s, t } = x;
    const people = stillsWho(g, w, x), r = stillsRoll(g, w, x, rnd);
    const expr = s.last ? STILLS_EXPR[s.last.grade] : 'neutral';
    const who = people.map(a => { const outfit = stillOutfit(g, w, x, a); return { name: castName(g, w, a), expr, ...(outfit ? { outfit } : {}) }; });
    const tk = stillsBrief(g, t), b = tk ? briefOf(w, tk.brief) : undefined, now = nowAbs(g);
    const rec = recordPhoto(g, w, { src: 'set', place: s.place, who, q: r.q, stars: starsOf(r.q), adult: true, kind: 'portrait', ...(b ? { brief: b.id } : {}), ...(clientOf(w, t.label) ? { client: t.label } : {}),
        cap: `Stills · "${t.name}" · ${placeCaption(g, w, s.place, ((now % 1440) + 1440) % 1440, [])}` });
    if (!rec)
        return { lines: [], ai: '' };
    rec.title = t.id;
    (s.stills ??= []).push(rec.id);
    s.stillsAt = s.next;
    const names = listed(who.map(h => `${h.name}${h.outfit && OUTFIT_WORDS[h.outfit] ? ` ${OUTFIT_WORDS[h.outfit]}` : ''}`));
    const told = r.parts.filter(p => p.n).map(p => `${p.name} ${p.n > 0 ? '+' : '−'}${Math.abs(p.n)}`).join(', ');
    const lines = [`Stills of ${names}: quality ${r.q} (${'★'.repeat(starsOf(r.q))}).${told ? ` (${told})` : ''}`];
    lines.push(...stillsShot(g, w, t, rec, { day: Math.floor(now / 1440), min: rec.min, place: s.place, total: r.total, dc: r.dc, ok: r.ok, q: r.q, parts: r.parts, d20: r.d20, bonus: r.bonus, base: r.base, look: rec.look, photo: rec.id }));
    lines.push(...trainSkill(g, w, 'photography', r.ok ? 4 : 2));
    const how = r.q >= 85 ? 'brilliantly' : r.q >= 70 ? 'very well' : r.q >= 55 ? 'well' : r.q >= 35 ? 'unevenly' : 'badly';
    return { lines, ai: `Between takes on the set of "${t.name}", {{user}} takes the stills: ${names}, under the set's lights, the crew out of frame. It goes ${how}.` };
}
// At the wrap: the best still taken on this shoot (still kept in Lens, and developed) becomes the title's cover,
// starred so Lens keeps it.
function coverFromStills(g, s, t) {
    const recs = (s.stills ?? []).map(id => photoById(g, id)).filter((r) => !!r && !r.undeveloped);
    if (!recs.length)
        return [];
    const best = recs.reduce((a, b) => ((b.q ?? 0) > (a.q ?? 0) ? b : a));
    t.cover = best.id;
    best.star = true;
    trimPhotos(g);
    return [`The best still (${'★'.repeat(best.stars ?? starsOf(best.q ?? 0))}) is the cover of "${t.name}".`];
}
/* ---------- a photo call (plans/industry-lens.md Part 2: setLink.visit) ---------- */
/** A roster performer comes to a photo shoot's place the set's way: in the cast marked `onset` (titled `photo:<from>`,
 *  never one of a shoot's), with no home, for the window, and gone once it's over. Her card is made the first time
 *  (`waiting`: ask again once it's there). Nothing with the industry or adult content off. */
export function visit(g, w, call) {
    const p = call && rosterOf(w, call.who);
    if (!p || !setOn(g, w) || !call.place || !(call.to > call.from) || nowAbs(g) >= call.to)
        return { avatar: null, lines: [] };
    const card = rosterCard(g, w, p.id);
    if (!card) {
        bringIn(g, w, p.id);
        return { avatar: null, waiting: true, lines: [] };
    }
    const had = g.cast[card];
    if (had && !had.onset)
        return { avatar: null, lines: [] };
    if (had?.onset && !isVisit(had.onset.title))
        return { avatar: null, lines: [`${p.name} is on a shoot right now.`] };
    const o = onsetOf(g), title = `${VISIT}${call.from}`;
    o.visits = [...(o.visits ?? []).filter(v => v.avatar !== card), { who: p.id, avatar: card, place: call.place, from: call.from, to: call.to }];
    if (had) {
        had.onset = { title, place: call.place };
        return { avatar: card, lines: [] };
    }
    arrive(g, w, { title, place: call.place }, p, card);
    bringIn(g, w, p.id); // (her pictures and outfits, once a session)
    return { avatar: card, lines: [`${p.name} is here for the shoot.`] };
}
// Photo calls whose window is over: the performer leaves.
function visitsOver(g) {
    const o = peekOnset(g);
    if (!o?.visits?.length)
        return;
    const now = nowAbs(g);
    for (const v of o.visits)
        if (now >= v.to && g.cast[v.avatar]?.onset && isVisit(g.cast[v.avatar].onset.title))
            leave(g, v.avatar);
    o.visits = o.visits.filter(v => now < v.to && !!g.cast[v.avatar]);
    if (!o.visits.length)
        delete o.visits;
}
/* ---------- the hooks ---------- */
setLink.start = startShoot;
setLink.current = (g) => {
    const s = liveOf(g);
    if (!s)
        return null;
    const t = titleOfShoot(g, s);
    if (!t)
        return null;
    return { title: t, place: s.place, call: s.call, roster: [...s.roster] };
};
setLink.wrap = (g, w) => wrapShoot(g, w, 'late');
setLink.visit = visit;
// You walked away from the set (once you'd been on it): it wraps. On it: anyone called who isn't there yet is sent for.
function watch(g, w) {
    visitsOver(g);
    const s = liveOf(g);
    if (!s) {
        for (const a of onSetNow(g))
            leave(g, a);
        return;
    } // (nobody stays on a set with no shoot on)
    if (!setOn(g, w)) {
        wrapShoot(g, w, 'late');
        return;
    }
    if (g.player.loc === s.place) {
        s.here = true;
        callIn(g, w, s);
        return;
    }
    if (s.here)
        wrapShoot(g, w, 'left');
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
    if (!x || g.player.loc !== x.s.place || !adultOn(g))
        return null;
    const take = x.s.take;
    if (take && nowAbs(g) < take.until && take.who.includes(avatar))
        return { code: 'naked' };
    if (g.cast[avatar]?.onset?.title !== x.s.title)
        return null;
    const lingerie = readyFor(g, w, x, avatar) ? setOutfit(g, w, avatar, 'lingerie') : undefined;
    return lingerie ? { code: lingerie } : { kind: 'robe' };
});
// The engine's actions on set.
const act = (x) => ({ icon: '🎬', cost: 0, effects: {}, scene: false, adult: true, tags: ['set'], fact: '{u} spent the day on set at {0}.', ...x });
const step5 = (n) => Math.max(5, Math.round(n / 5) * 5);
/** What you can do on set now: play the next scene (once it's ready and its cast is here), wait for your call, or skip
 *  to the result. */
export function setActions(g, w) {
    const x = liveShoot(g, w);
    if (!x || g.player.loc !== x.s.place)
        return [];
    const { s, t } = x, sc = t.scenes[s.next];
    if (!sc)
        return [];
    const now = nowAbs(g), wait = s.ready - now, miss = missing(g, w, s, sc);
    const out = [];
    if (wait <= 0 && !miss.length) {
        const stop = others(sc).some(y => { const a = castAvatar(g, w, y); return !!a && !!matchIn(g, wordsOf(w, t, sc), limitsOf(g, a)); });
        out.push(act({ id: 'x-set-scene', name: 'Play the next scene', label: `Play the next scene: ${sc.kind} (${s.next + 1} of ${t.scenes.length})`, minutes: stop ? SET.stop : SET.scene, effects: stop ? {} : { energy: -SET.energy, hunger: -SET.hunger } }));
    }
    else
        out.push(act({ id: 'x-set-wait', name: 'Wait for your call', label: miss.length && wait <= 0 ? `Wait for your call (waiting for ${listed(miss)})` : 'Wait for your call', icon: '⏳', minutes: step5(Math.min(60, Math.max(5, wait > 0 ? wait : 30))), effects: { energy: -1 } }));
    const left = t.scenes.length - s.next;
    if (!stillsWhy(g, w))
        out.push(act({ id: STILLS_ID, name: 'Take the stills', label: `Take the stills (${s.next ? `after scene ${s.next}` : 'before the first scene'})`, icon: '📷', minutes: STILLS.minutes, effects: { energy: -STILLS.energy }, tags: ['set', 'photo'] }));
    out.push(act({ id: 'x-set-skip', name: 'Skip to the result', label: `Skip to the result (${left} scene${left === 1 ? '' : 's'} left)`, icon: '⏭️', minutes: step5(Math.max(0, wait) + left * SET.scene + (left - 1) * SET.setup), effects: { energy: -SET.energy * left, hunger: -SET.hunger * left } }));
    return out;
}
engineActions.push(setActions);
const before = industryLink.act;
industryLink.act = (g, w, a, mates) => {
    if (a.id === 'x-set-scene')
        return playScene(g, w);
    if (a.id === 'x-set-skip')
        return skipShoot(g, w);
    if (a.id === STILLS_ID)
        return takeStills(g, w);
    if (a.id === 'x-set-wait') {
        const x = liveShoot(g, w);
        if (!x)
            return { lines: [], ai: '' };
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
    if (!x || g.player.loc !== x.s.place)
        return [];
    const { s, t } = x, sc = t.scenes[s.next], n = t.scenes.length;
    const label = labelOf(w, t.label)?.name ?? t.label, genre = genreOf(w, t.genre)?.name ?? t.genre;
    const seat = t.you?.includes('direct') ? (t.you.includes('perform') ? 'directing and performing' : 'directing') : t.you?.includes('stills') ? 'taking the stills (a photographer, in no scene)' : 'performing';
    const out = [`This is a shoot for ${label}'s "${t.name}" (${genre}): ${sc ? `scene ${s.next + 1} of ${n}, ${sc.kind}, with ${whoLine(g, w, sc)}` : 'every scene is shot'}; {{user}} is ${seat}${s.last ? `; the last scene went ${GRADE_WORDS[s.last.grade]}` : ''}.`];
    const set = present.filter(r => r.onset?.title === s.title).map(r => r.name);
    if (set.length)
        out.push(`${listed(set)} ${set.length > 1 ? 'are performers' : 'is a performer'} here only for this shoot (not one of the city's people).`);
    const now = nowAbs(g);
    if (s.take && now < s.take.until)
        out.push('The scene just shot is still being played: the performers in it are undressed.');
    else if (sc && s.ready > now)
        out.push(`The crew is setting up the next scene (about ${step5(s.ready - now)} minutes).`);
    return out;
});
export function shootView(g, w) {
    const x = liveShoot(g, w);
    if (!x)
        return null;
    const { s, t } = x, sc = t.scenes[s.next];
    const seat = t.you?.includes('direct') ? (t.you.includes('perform') ? 'both' : 'direct') : t.you?.includes('perform') ? 'perform' : t.you?.includes('stills') ? 'stills' : 'watch';
    return { title: t.id, name: t.name, label: labelOf(w, t.label)?.name ?? t.label, genre: genreOf(w, t.genre)?.name ?? t.genre, place: placeName(g, w, s.place), at: g.player.loc === s.place, seat,
        scenes: scenesView(g, w, t),
        next: sc ? { n: s.next + 1, kind: sc.kind, with: sc.with.map(y => castName(g, w, y, 'You')), ready: Math.max(0, s.ready - nowAbs(g)), waiting: missing(g, w, s, sc) } : null,
        onSet: onSetNow(g).filter(a => g.cast[a].onset?.title === s.title).map(a => g.cast[a].name),
        stopped: (s.stopped ?? []).map(y => ({ kind: y.kind, who: castName(g, w, y.who) })), stills: (s.stills ?? []).filter(id => !!photoById(g, id)), stillsWhy: stillsWhy(g, w) };
}
/** A title's scenes as the app shows them (any title: played ones carry their results, the parts adding up to the roll). */
export const scenesView = (g, w, t) => t.scenes.map((sc, i) => ({ n: i + 1, kind: sc.kind, with: sc.with.map(y => castName(g, w, y, 'You')), ...(sc.q !== undefined ? { q: sc.q } : {}), ...(sc.grade ? { grade: sc.grade } : {}), parts: sc.parts ?? [], ...(sc.pic ? { pic: sc.pic } : {}), dc: sceneDc(w, t, i) }));
