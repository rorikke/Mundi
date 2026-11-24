// A photo call (plans/industry-lens.md Part 2): a performer of the industry's roster comes to a photo shoot's place for
// its window, the way she comes on set (sim/onset.ts): in the cast, marked `onset` with no title (`title: ''`, which is
// what tells a photo call from a shoot), with a home nobody has, so she's in the scene, its sprites and its dress, and
// never one of the world's people (core/store.ts residentsOf); her card is made or found as the set's are. No plan, no
// routine: she's there from `from` to `to`, in the brief's outfit, and gone after. `setLink.visit` books the call
// (sim/assignments.ts's *Set the shoot* for a roster subject); the hours and looks seat her when the window opens and
// send her away when it closes. One call at a time for each performer (a new one replaces one not begun yet); never on
// a day she's booked on a title's set, never while she's on a set. With the `industry` system or adult content off
// nobody is called and anyone here on a call leaves.
import { nowAbs, adultOn, game } from '../core/store.js';
import { setLink, onHour, onLook, onDay, sceneLines } from './hooks.js';
import { rosterOf, rosterId, rosterCard, onsetOf, setOn } from './onset.js';
import { relOf } from './rel.js';
import { cleanPerson, applyPerson } from './gender.js';
import { ensureProfile } from './profiles.js';
import { placeName } from './facts.js';
import { dressRules } from './dress.js';
import { adultOutfit } from './assignments.js';
const peekCalls = (g) => (g.photoCalls ?? []);
function setCalls(g, list) { if (list.length)
    g.photoCalls = list;
else
    delete g.photoCalls; }
const NOWHERE = { zone: '__guest', x: 0, y: 0 };
/** Is this one of the cast here on a photo call (not on a set)? */
export const onCall = (r) => !!r?.onset && r.onset.title === '';
/** Everyone here on a photo call now (avatars). */
export const onCallNow = (g) => Object.keys(g.cast ?? {}).filter(a => onCall(g.cast[a]));
/** The calls booked (still to come or under way). */
export const callsOf = (g) => [...peekCalls(g)];
/** Her call under way now, if any. */
export const callNow = (g, who, at = nowAbs(g)) => peekCalls(g).find(c => c.who === rosterId(who) && at >= c.from && at < c.to);
// A day she's booked on a title's set (a shoot not shot yet).
const onSetThatDay = (g, id, day) => (g.industry?.titles ?? [])
    .some(t => !t.cancelled && t.shoot === day && t.q === undefined && t.cast.includes(`roster:${id}`));
// She comes: in the cast with no title, no home of her own; her profile from the roster, never over what the save
// learned since; you meet her at the shoot.
function seat(g, w, p, avatar, c) {
    const had = g.cast[avatar];
    if (had && !onCall(had))
        return null; // (one of the world's people, or on a set: never over them)
    onsetOf(g).cards[p.id] = avatar;
    if (had) {
        had.onset = { title: '', place: c.place };
        return had;
    }
    const routine = structuredClone(Object.values(w.cast.routineTemplates)[0]);
    const r = { avatar, name: p.name, occupation: null, home: { ...NOWHERE }, routine, leisure: [], met: true, onset: { title: '', place: c.place } };
    g.cast[avatar] = r;
    const people = relOf(g).people;
    if (!people[avatar])
        applyPerson(g, avatar, cleanPerson(p));
    if (Number.isFinite(p.age))
        (people[avatar] ??= {}).age = p.age;
    ensureProfile(g, w, avatar);
    return r;
}
// She goes: out of the cast (what you learned of her stays in `rel`), out of what you're doing together.
function unseat(g, avatar) {
    if (!onCall(g.cast[avatar]))
        return;
    const soc = g.social;
    if (soc) {
        soc.with = (soc.with ?? []).filter((c) => c.avatar !== avatar);
        if (soc.solo === avatar)
            soc.solo = '';
    }
    delete g.cast[avatar];
}
// Cards still being made (one job per performer) and the promise the tests wait on.
const bringing = new Map();
let settled = Promise.resolve();
/** Resolves once every performer called has her card and pictures (tests). */
export const callsSettled = () => settled;
// Her card made (the first time) or found, her pictures and outfits uploaded (the adult ones only with adult content
// on); then seated if her window is on.
function bringIn(g, w, p) {
    const k = `${g.world}|${p.id}`;
    if (bringing.has(k))
        return;
    const job = (async () => {
        const G = await import('./game.js');
        const found = G.foundCard(w, p);
        const avatar = found ?? (await G.exampleCards(w, [p]))[0];
        if (!avatar)
            return;
        if (found)
            await G.examplePictures(w, p, avatar);
        for (const [o, f] of Object.entries(p.outfits ?? {}))
            if (typeof f === 'string' && (adultOn(g) || !adultOutfit(p, o)))
                await G.uploadOutfit(w, p, avatar, o).catch(() => false);
        onsetOf(g).cards[p.id] = avatar;
        tick(g, w);
        if (game() === g)
            await G.syncScene();
    })().catch(e => console.warn('[Mundi] photo call:', p.name, e)).finally(() => bringing.delete(k));
    bringing.set(k, job);
    settled = Promise.all([...bringing.values()]);
}
/** Books a photo call (`setLink.visit`): she comes to `place` from `from` to `to`. `avatar`: her card, seated for the
 *  window (now, if it's on); null when she can't come (with why in `lines`); `waiting`: her card is still being made,
 *  the call is kept and she comes once it is. */
export function visit(g, w, call) {
    const p = rosterOf(w, call?.who ?? ''), no = (why) => ({ avatar: null, lines: why ? [why] : [] });
    if (!setOn(g, w) || !p)
        return no('');
    const from = Math.round(Number(call.from)), to = Math.round(Number(call.to)), now = nowAbs(g);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to <= now || !call.place)
        return no('');
    if ((p.debut ?? 0) > Math.floor(from / 1440))
        return no(`${p.name} hasn't started working yet.`);
    const days = new Set([Math.floor(from / 1440), Math.floor((to - 1) / 1440)]);
    if ([...days].some(d => onSetThatDay(g, p.id, d)))
        return no(`${p.name} is on a set that day.`);
    const list = peekCalls(g).filter(c => c.who !== p.id || c.from <= now); // (one not begun yet is replaced)
    if (list.some(c => c.who === p.id && c.from < to && from < c.to))
        return no(`${p.name} is already on another shoot then.`);
    const c = { who: p.id, place: call.place, from, to, ...(call.outfit ? { outfit: call.outfit } : {}) };
    list.push(c);
    setCalls(g, list);
    const card = rosterCard(g, w, p.id);
    if (!card) {
        bringIn(g, w, p);
        tick(g, w);
        return { avatar: null, waiting: true, lines: [] };
    }
    tick(g, w);
    return { avatar: card, lines: [] };
}
setLink.visit = visit;
/** The calls kept up with: each performer seated while her window is on (her card made if it isn't yet), sent away
 *  once it's over; the calls past their window dropped. Nobody with the industry or adult content off. */
export function tick(g, w) {
    if (!peekCalls(g).length && !onCallNow(g).length)
        return; // (every look and hour: nothing to do without a call)
    if (!setOn(g, w)) {
        for (const a of onCallNow(g))
            unseat(g, a);
        if (peekCalls(g).length)
            setCalls(g, []);
        return;
    }
    const now = nowAbs(g), live = new Set();
    for (const c of peekCalls(g)) {
        if (now < c.from || now >= c.to)
            continue;
        const p = rosterOf(w, c.who);
        if (!p)
            continue;
        const card = rosterCard(g, w, p.id);
        if (!card) {
            bringIn(g, w, p);
            continue;
        }
        if (seat(g, w, p, card, c))
            live.add(card);
    }
    for (const a of onCallNow(g))
        if (!live.has(a))
            unseat(g, a);
    setCalls(g, peekCalls(g).filter(c => c.to > now));
}
onLook.push(tick);
onHour.push((g, w) => { tick(g, w); return []; });
onDay.push((g, w) => { tick(g, w); return []; });
// (dress) On a call she wears the shoot's outfit: naked (with adult content on) or one of hers.
dressRules.push((g, w, avatar) => {
    const r = g.cast[avatar];
    if (!onCall(r))
        return null;
    const p = rosterOf(w, Object.entries(onsetOf(g).cards).find(([, a]) => a === avatar)?.[0] ?? '');
    const c = p && callNow(g, p.id);
    if (!p || !c?.outfit || c.outfit === 'clothes' || (adultOutfit(p, c.outfit) && !adultOn(g)))
        return null;
    if (c.outfit === 'naked')
        return { code: 'naked' };
    return p.outfits?.[c.outfit] ? { outfit: c.outfit } : null;
});
// What the AI is told: she's here only for the photo shoot.
sceneLines.push((g, w, present) => {
    if (!setOn(g, w))
        return [];
    const here = present.filter(onCall).filter(r => r.onset.place === g.player.loc).map(r => r.name);
    if (!here.length)
        return [];
    const names = here.length > 1 ? `${here.slice(0, -1).join(', ')} and ${here.at(-1)}` : here[0];
    return [`${names} ${here.length > 1 ? 'are performers' : 'is a performer'} here at ${placeName(g, w, g.player.loc)} only for a photo shoot (not one of the city's people).`];
});
