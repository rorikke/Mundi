// The photo boards (photography): the small board anyone with a camera has, and the job's full board (the studio's
// two easy briefs at its third rank, three to five for a freelancer, the contacts' briefs after you quit); offering
// briefs (by reputation, contacts, skills, subjects who allow a camera, fair windows of light and weather), taking
// them, setting a shoot with the subject, shooting (the roll and every part that adds to it, by name), one redo,
// editing, delivering (stars, pay, reputation, contacts, the portfolio), extending and missing them; the world's
// weddings ahead offered to a photographer who knows the couple. The engine's actions *Shoot the assignment* and
// *Edit today* come through `photoLink` (sim/life.ts lists them, sim/actions.ts plays them). What the Lens app shows
// comes from the views at the end. Freelance work (sim/freelance.ts) and photobooks (sim/photobooks.ts) hook in through
// `afterDelivery`/`afterMissed`/`youParts`, so this file imports neither.
import { adultOn, nowAbs, residentsOf } from '../core/store.js';
import { systemOn, WEEKDAY_IDS, personPictures } from '../core/world.js';
import { cameraAllows, BRIEF_DAYS, BRIEF_DC, BRIEF_HOURS, BRIEF_REP, ANY_STUDIO } from '../core/photo.js';
import { onDay, onHour, onAction, photoLink, sceneLines, engineActions } from './hooks.js';
import { photoOn, peekPhoto, photoOf, repOf, repWords, smallCap, addRep, clientOf, briefOf, isContact, contactsOf, holdsPhotoJob, noteContacts, gearOf, hasCamera, recordPhoto, photoById, addToPortfolio, portfolioOf, portfolioStrength, shownPhotos, photoKeepsakes, placeCaption, cameraOf, trimPhotos, atHomeNow, photoNote, studioWith, } from './photo.js';
import { studioOf, inStudio, STUDIO_ID, studioZones, rentalOpen } from './studio.js';
import { weddingsAhead } from './longlife.js';
import { myJob, careerOf, freelancePath, rankOf } from './work.js';
import { placeOf } from './places.js';
import { openAt } from './daynight.js';
import { slotAt } from './daynight.js';
import { regionOf, weatherAt } from './worldstate.js';
import { weatherChance, WEATHER_KINDS } from './weather.js';
import { whenHolds, parseWhen, personNamed } from './when.js';
import { festivalsOn } from './festivals.js';
import { eventsOn } from './cityevents.js';
import { levelOf, skillName, trainSkill } from './hobbies.js';
import { rollBonus, rollD20 } from './dice.js';
import { personLevel } from './training.js';
import { fr, ro, gain, lose, YOU } from './rel.js';
import { FRIEND_TIERS, shutOut } from './romance.js';
import { isMinor, romanceBlocked } from './family.js';
import { matchIn, limitsOf } from './private.js';
import { isWith, withYou, social, livePlan } from './social.js';
import { sceneHere } from './homerooms.js';
import { inviteShoot, earliest } from './plans.js';
import { payOf } from './bills.js';
import { effectMul } from './effects.js';
import { book } from './ledger.js';
import { money } from './needs.js';
import { tallyEvent } from './tally.js';
import { hm, weekday, WEEKDAYS } from './time.js';
/** The rules' numbers (first guesses, tuned in L). */
export const PHOTO_RULES = {
    open: 3, openFree: 5, // briefs open at once (a freelancer from the third rank: five)
    studioFull: 2, studioFloor: 20, contactsFull: 2,
    fullEvery: 2, // days between new briefs on the full board (L: one a day let a freelancer deliver six to nine a
    // week, half again the stylist's pay at the top; every other day, about three and a half)
    fair: 0.85, most: 28, // a weather window: at least 85% that it comes within the deadline (28 days at most)
    stay: 4, // days a brief stays on the board
    grace: 2, // days late a delivery is still taken (paid ×0.7)
    late: 0.7, recent: 28, cold: 14, coldMul: 0.5, branchMul: 3, soonMul: 2,
    miss: -5, lateRep: -2,
    editMax: 15, editMinutes: 60, editMore: 20, studioTime: 0.7,
    assistant: 4, flash: 5, light: 5, rig: 6, short: -5,
    rungUp: 3, rungDown: -8, lens: [0, 3, 5, 8],
    feel: { hates: -10, dislikes: -8, wary: -4, stranger: 0, acquaintance: 2, friend: 4, good: 6, best: 8 },
};
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const def = (w) => w.photo;
const nameOf = (g, a) => (a && g.cast[a]?.name) || '';
/* ---------- what other files add ---------- */
/** After a delivery (freelance: a shift, perf, the week; photobooks: the project's count): lines to show. */
export const afterDelivery = [];
/** After a brief is missed (photobooks: two missed end the project; freelance: perf). */
export const afterMissed = [];
/** More of the You tab (photobooks). */
export const youParts = [];
/* ---------- who gets which board ---------- */
/** The boards you have now: the small one's size, the full one's and what it is (`studio`: the first assistant's two
 *  easy briefs; `freelance`: three to five by rank; `contacts`: your contacts' briefs, without the full board), and
 *  why there's none. */
export function boardsOf(g, w) {
    if (!photoOn(w))
        return { kind: 'none', small: 0, full: 0, why: 'No photo gigs here.' };
    if (!hasCamera(g, w))
        return { kind: 'none', small: 0, full: 0, why: 'Get a camera to take gigs (a compact camera is the way in).' };
    const jobs = systemOn(w, 'jobs'), p = def(w), small = p.small?.size ?? 3;
    const o = holdsPhotoJob(g, w) ? myJob(g, w) : null, j = g.player.job;
    if (o && j) {
        const free = freelancePath(g, w);
        if (free) {
            const ranks = careerOf(g, o).ranks, first = Math.max(0, ranks.findIndex(r => r.name === free.ranks[0]?.name));
            const min = p.full?.min ?? 3, max = p.full?.max ?? 5;
            return { kind: 'full', small: 0, full: Math.max(min, Math.min(max, min + (j.rank - first))), mode: 'freelance' };
        }
        if (j.rank >= 2)
            return { kind: 'full', small: 0, full: PHOTO_RULES.studioFull, mode: 'studio' };
    }
    return { kind: 'small', small, full: jobs ? PHOTO_RULES.contactsFull : 0, mode: jobs ? 'contacts' : undefined };
}
/** The most briefs you can have open at once. */
export function openMost(g, w) {
    const o = holdsPhotoJob(g, w) ? myJob(g, w) : null, free = o && freelancePath(g, w);
    if (!o || !free || !g.player.job)
        return PHOTO_RULES.open;
    const ranks = careerOf(g, o).ranks, first = Math.max(0, ranks.findIndex(r => r.name === free.ranks[0]?.name));
    return g.player.job.rank - first >= 2 ? PHOTO_RULES.openFree : PHOTO_RULES.open;
}
/* ---------- subjects ---------- */
const PHOTO_LIMITS = ['photos', 'camera', 'being photographed', 'recording'];
/** Can this person be in front of the camera for this brief: in the game and not gone, their `camera` rule allowing it
 *  (`never` no; `noface` only from behind; `work` never an adult brief), someone you've met who doesn't shut you out;
 *  for an adult brief also never a minor, nobody you can't have romance with, nobody whose limits rule out photos. */
export function subjectOk(g, w, avatar, b) {
    const r = g.cast[avatar];
    if (!r || r.gone || !r.met || shutOut(g, avatar))
        return false;
    if (!cameraAllows(cameraOf(g, w, avatar), b))
        return false;
    if (b.adult && (!adultOn(g) || isMinor(g, avatar) || romanceBlocked(g, avatar) || !!matchIn(g, PHOTO_LIMITS, limitsOf(g, avatar))))
        return false;
    return true;
}
// Who a brief would photograph if it were offered now: nobody (no subject, or an anonymous client), a person by name,
// or someone you know the board picks (`cast`). `couple` comes only with a wedding. null: nobody fits.
function subjectFor(g, w, b, salt) {
    const s = b.subject;
    if (!s || s.who === 'client')
        return {};
    if (s.who === 'couple')
        return null;
    if (s.who === 'cast') {
        const list = residentsOf(g).filter(r => subjectOk(g, w, r.avatar, b)).sort((a, c) => a.avatar.localeCompare(c.avatar));
        return list.length ? { who: list[Math.floor(H(salt) * list.length)].avatar } : null;
    }
    const r = personNamed(g, s.who);
    return r && subjectOk(g, w, r.avatar, b) ? { who: r.avatar } : null;
}
/* ---------- fair windows ---------- */
const condText = (c) => `${c.key}: ${c.not ? 'not ' : ''}${c.values.join(' or ')}`;
/** The deadline (in days from today) a brief comes with when offered for this place now: its own, lengthened (to 28
 *  days at most) until its window's weather comes at least once with an 85% chance by the climate's odds (one roll a
 *  day, on days the rest of the window allows); a festival's or event's window only when it falls inside its own
 *  deadline. null: not offered now. */
export function fairDays(g, w, b, place, day = g.day) {
    const base = b.days ?? BRIEF_DAYS;
    if (!b.window)
        return base;
    const p = parseWhen(b.window);
    if (p.error)
        return null;
    const wx = p.conds.filter(c => c.key === 'weather'), rest = p.conds.filter(c => c.key !== 'weather');
    const restWhen = rest.map(condText).join('; ');
    const fixed = rest.some(c => (c.key === 'festival' || c.key === 'event') && !c.not);
    const map = place === ANY_STUDIO || place.startsWith('home:') ? w.maps[0]?.id : regionOf(g, w, place);
    const at = place === ANY_STUDIO ? undefined : place;
    const dayP = (d) => {
        if (restWhen && !whenHolds(g, w, restWhen, { day: true, at: d * 1440 + 720, place: at, key: `fair|${b.id}` }))
            return 0;
        return wx.reduce((pr, c) => { const ch = weatherChance(g, w, map, d, c.values); return pr * (c.not ? 1 - ch : ch); }, 1);
    };
    const chance = (n) => { let none = 1; for (let d = day; d <= day + n; d++)
        none *= 1 - dayP(d); return 1 - none; };
    if (fixed)
        return chance(base) >= PHOTO_RULES.fair ? base : null;
    for (let n = base; n <= PHOTO_RULES.most; n++)
        if (chance(n) >= PHOTO_RULES.fair)
            return n;
    return null;
}
// A kind of weather and a weekday by their names ("partly cloudy", "Sunday"), not their ids.
const wxWord = (v) => WEATHER_KINDS.find(k => k.id === v.toLowerCase())?.name.toLowerCase() ?? v;
const dayWord = (v) => WEEKDAYS[WEEKDAY_IDS.indexOf(v.toLowerCase().slice(0, 3))] ?? v;
/** A window in words: "in the afternoon, rain or heavy rain", "while Sanja Matsuri is on"; '' with none. */
export function windowWords(g, w, b) {
    if (!b.window)
        return '';
    const p = parseWhen(b.window);
    if (p.error)
        return '';
    const out = [];
    for (const c of p.conds) {
        const not = c.not ? 'not ' : '';
        if (c.key === 'period')
            out.push(`${not}${c.values.map(v => `in the ${(w.time.periods.find(x => x.id === v)?.name ?? v).toLowerCase()}`).join(' or ')}`);
        else if (c.key === 'weather')
            out.push(`${not}${c.values.map(wxWord).join(' or ')}`);
        else if (c.key === 'festival')
            out.push(`${not}while ${c.values.map(v => w.festivals?.find(f => f.id === v)?.name ?? v).join(' or ')} is on`);
        else if (c.key === 'event')
            out.push(`${not}while ${c.values.map(v => w.cityEvents?.find(e => e.id === v)?.name ?? v).join(' or ')} is on`);
        else if (c.key === 'weekend')
            out.push(c.values[0] === 'yes' ? 'on a weekend' : 'on a weekday');
        else if (c.key === 'season')
            out.push(`${not}in ${c.values.join(' or ')}`);
        else if (c.key === 'clock')
            out.push(`${not}${c.values.join(' or ')}`);
        else if (c.key === 'weekday')
            out.push(`${not}on ${c.values.map(dayWord).join(' or ')}`);
    }
    return out.join(', ');
}
// The brief's window ties it to a festival or an event within a week (offered more often then).
function soon(g, w, b) {
    const c = parseWhen(b.window).conds.filter(x => (x.key === 'festival' || x.key === 'event') && !x.not);
    if (!c.length)
        return false;
    for (let d = g.day; d < g.day + 7; d++)
        for (const x of c) {
            if (x.key === 'festival' && festivalsOn(g, w, d).some(f => x.values.includes(f.id) || x.values.includes('any')))
                return true;
            if (x.key === 'event' && eventsOn(g, w, d).some(e => x.values.includes(e.ev.id) || x.values.includes('any')))
                return true;
        }
    return false;
}
/* ---------- offering ---------- */
/** Could this brief be offered on that lane now (its board, adult content, its `when`, the floors, a contact, skills
 *  within two levels, its subject, not already on the boards, not delivered in the last 28 days)? Its place, subject
 *  and deadline when it could. */
export function offerable(g, w, b, lane, mode) {
    const c = clientOf(w, b.client), p = peekPhoto(g);
    if (!c || ((b.adult || c.adult) && !adultOn(g)))
        return null;
    if (lane === 'small' ? b.board !== 'small' : b.board !== 'full')
        return null;
    if (b.book && lane !== 'book')
        return null;
    if (b.subject?.who === 'couple' && lane !== 'wedding')
        return null;
    const rep = p.rep;
    if ((c.floor ?? 0) > rep + 1e-9 || (b.floor ?? 0) > rep + 1e-9)
        return null;
    if (mode === 'studio' && Math.max(c.floor ?? 0, b.floor ?? 0) > PHOTO_RULES.studioFloor)
        return null;
    if ((b.contact || mode === 'contacts') && !isContact(g, w, c.id))
        return null;
    for (const [s, n] of Object.entries(b.needs ?? {}))
        if (levelOf(g, s) < n - 2)
            return null;
    if (b.when && !whenHolds(g, w, b.when, { key: `brief|${b.id}`, place: b.places.find(x => x !== ANY_STUDIO) }))
        return null;
    if (p.board.some(o => o.brief === b.id) || p.open.some(t => t.brief === b.id))
        return null;
    if (lane !== 'book' && g.day - (p.recent?.[b.id] ?? -999) < PHOTO_RULES.recent)
        return null;
    const salt = `${g.world}|${g.day}|${b.id}`;
    const places = b.places;
    const place = places[Math.floor(H(`${salt}|place`) * places.length)];
    const who = subjectFor(g, w, b, `${salt}|who`);
    if (!who)
        return null;
    const days = fairDays(g, w, b, place);
    if (days === null)
        return null;
    return { place, ...who, days };
}
/** Puts a brief on the board (on that lane; `extra`: a photobook's or a wedding's fields). Returns the offer. */
export function offerBrief(g, w, b, lane, x) {
    const p = photoOf(g);
    const o = { id: p.nextId++, brief: b.id, day: g.day, until: g.day + Math.max(0, Math.min(PHOTO_RULES.stay, x.days - 1)), place: x.place, days: x.days, lane,
        ...(x.who ? { who: x.who } : {}), ...(x.who2 ? { who2: x.who2 } : {}), ...(x.pair ? { pair: x.pair } : {}), ...(x.on !== undefined ? { on: x.on } : {}), ...(x.book !== undefined ? { book: x.book } : {}) };
    if (x.until !== undefined)
        o.until = x.until;
    p.board.push(o);
    return o;
}
// One brief drawn for a lane from what could be offered now, by weight (the branch's ×3, a cold client ×0.5, a
// festival or event within a week ×2), seeded by the day.
function draw(g, w, lane, mode) {
    const p = peekPhoto(g), free = freelancePath(g, w);
    const pool = [];
    for (const b of def(w).briefs) {
        const x = offerable(g, w, b, lane, mode);
        if (!x)
            continue;
        let n = 1;
        if (free && b.branches?.includes(free.id))
            n *= PHOTO_RULES.branchMul;
        if ((p.cold?.[b.client] ?? -1) >= g.day)
            n *= PHOTO_RULES.coldMul;
        if (soon(g, w, b))
            n *= PHOTO_RULES.soonMul;
        pool.push({ b, x, n });
    }
    const total = pool.reduce((a, e) => a + e.n, 0);
    if (!total)
        return null;
    let r = H(`${g.world}|${g.day}|${lane}|draw`) * total;
    for (const e of pool) {
        r -= e.n;
        if (r < 0)
            return offerBrief(g, w, e.b, lane, e.x);
    }
    return offerBrief(g, w, pool[pool.length - 1].b, lane, pool[pool.length - 1].x);
}
const laneCount = (g, lane) => { const p = peekPhoto(g); return p.board.filter(o => o.lane === lane).length + p.open.filter(t => t.lane === lane).length; };
/** Each day: the boards fill (one new brief every other day on the full board while it's short, one every few days on
 *  the small board), weddings ahead are offered, offers past their days drop. Lines to show. */
export function fillBoards(g, w) {
    if (!photoOn(w))
        return [];
    const bd = boardsOf(g, w), out = [];
    if (bd.kind === 'none' && !g.photo)
        return out; // (no camera yet: nothing written)
    const p = photoOf(g);
    p.board = p.board.filter(o => o.until >= g.day && !!briefOf(w, o.brief));
    if (bd.kind === 'none')
        return out;
    // the lanes you don't have now drop their offers (the full board after quitting, the small one with the job's)
    p.board = p.board.filter(o => o.lane === 'book' || o.lane === 'wedding' || (o.lane === 'small' ? bd.small > 0 : o.lane === (bd.mode === 'contacts' ? 'contacts' : 'full') && bd.full > 0));
    if (bd.small && laneCount(g, 'small') < bd.small && g.day - (p.smallDay ?? -99) >= (def(w).small?.every ?? 2)) {
        if (draw(g, w, 'small'))
            p.smallDay = g.day;
    }
    const lane = bd.mode === 'contacts' ? 'contacts' : 'full';
    if (bd.full && p.board.filter(o => o.lane === lane).length + p.open.filter(t => t.lane === lane).length < bd.full && g.day - (p.fullDay ?? -99) >= PHOTO_RULES.fullEvery) {
        if (draw(g, w, lane, bd.mode))
            p.fullDay = g.day;
    }
    out.push(...offerWeddings(g, w));
    return out;
}
/* ---------- weddings ---------- */
/** The brief a world's weddings are shot with (`wedding_friends`, else the first with `subject: couple`). */
export const weddingBrief = (w) => def(w).briefs.find(b => b.id === 'wedding_friends' && b.subject?.who === 'couple') ?? def(w).briefs.find(b => b.subject?.who === 'couple');
// The world's weddings set ahead (sim/longlife.ts): a photographer with a camera who knows either of them is asked to
// shoot it, once, at the first of the world's wedding places open that day.
function offerWeddings(g, w) {
    const b = weddingBrief(w), at = def(w).weddingAt ?? [];
    if (!b || !at.length || !hasCamera(g, w))
        return [];
    const p = photoOf(g), out = [];
    for (const x of weddingsAhead(g, w)) {
        if (x.day <= g.day || p.weds?.[x.pair] !== undefined)
            continue;
        const A = g.cast[x.a], B = g.cast[x.b];
        if (!A || !B || !(A.met || B.met))
            continue;
        const place = at.find(pl => openAt(g, w, pl, x.day * 1440 + 12 * 60)) ?? at[0];
        (p.weds ??= {})[x.pair] = x.day;
        offerBrief(g, w, b, 'wedding', { place, who: x.a, who2: x.b, pair: x.pair, on: x.day, days: x.day - g.day + PHOTO_RULES.grace, until: x.day });
        out.push(`📷 ${A.name} and ${B.name} are getting married on ${weekday(x.day)}: they'd love you to take the photos (in Lens).`);
    }
    return out;
}
/* ---------- taking ---------- */
const offerById = (g, id) => peekPhoto(g).board.find(o => o.id === id);
export const takenById = (g, id) => peekPhoto(g).open.find(t => t.id === id);
// Whether the subject says yes to this brief (their `camera: ask`, or a brief that asks first): yes as a friend, half
// the time as an acquaintance (the day's draw), never below.
function subjectYes(g, w, b, who, id) {
    if (cameraOf(g, w, who) !== 'ask' && !b.subject?.consent)
        return true;
    const f = fr(g, who, YOU), friend = FRIEND_TIERS.find(t => t.id === 'friend').lo, acq = FRIEND_TIERS.find(t => t.id === 'acquaintance').lo;
    return f >= friend || (f >= acq && H(`${g.world}|${id}|${g.day}|yes`) < 0.5);
}
/** Takes a brief from the board: it's yours until its deadline (counted from the day it was offered, the client's date).
 *  A subject who's asked first says yes or no now (no: the brief goes). Returns what to tell the player. */
export function takeBrief(g, w, id) {
    const o = offerById(g, id), b = o && briefOf(w, o.brief), c = b && clientOf(w, b.client);
    if (!o || !b || !c || !photoOn(w))
        return '';
    const why = takeWhy(g, w, o);
    if (why)
        return why;
    const p = photoOf(g);
    if (o.who && !subjectYes(g, w, b, o.who, o.id)) {
        p.board = p.board.filter(x => x !== o);
        (p.recent ??= {})[b.id] = g.day - PHOTO_RULES.recent + 14; // (the client asks someone else: not offered for two weeks)
        return `${nameOf(g, o.who)} would rather not be photographed for this. ${c.name} will find someone else.`;
    }
    p.board = p.board.filter(x => x !== o);
    const t = { ...o, taken: g.day, due: o.day + (o.days ?? b.days ?? BRIEF_DAYS), yes: true };
    p.open.push(t);
    const who = o.who ? ` Set the shoot with ${nameOf(g, o.who)}${o.who2 ? ` and ${nameOf(g, o.who2)}` : ''} in Lens.` : '';
    return `You took ${c.name}'s brief: ${b.name}. Due ${dueWords(g, t.due)}.${o.lane === 'wedding' ? '' : who}`;
}
const dueWords = (g, due) => (due === g.day ? 'today' : due === g.day + 1 ? 'tomorrow' : `in ${due - g.day} days (${weekday(due)})`);
function takeWhy(g, w, o) {
    if (!hasCamera(g, w))
        return 'You need a camera of your own.';
    const most = openMost(g, w);
    if (peekPhoto(g).open.length >= most)
        return `You have ${most} briefs open: deliver one first.`;
    return '';
}
/** Gives a brief back before its deadline: it counts as missed (the client remembers). */
export function giveUpBrief(g, w, id) {
    const t = takenById(g, id);
    if (!t)
        return [];
    return missed(g, w, t, true);
}
/* ---------- the shoot with the subject ---------- */
/** Where a brief's shoot can be set: its places (a photo studio: yours, or the hourly rental's place). */
export function shootPlaces(g, w, id) {
    const t = takenById(g, id), b = t && briefOf(w, t.brief);
    if (!t || !b)
        return [];
    const out = [];
    for (const pl of t.lane === 'wedding' ? [t.place] : b.places) {
        if (pl === ANY_STUDIO) {
            if (studioOf(g) && studioZones(w).length)
                out.push({ id: STUDIO_ID, name: 'Your photo studio' });
            const r = rentalOffer(g, w);
            if (r)
                out.push({ id: r.at, name: `${placeOf(g, w, r.at)?.name ?? r.at} (rented by the hour)` });
        }
        else
            out.push({ id: pl, name: placeOf(g, w, pl)?.name ?? pl });
    }
    return out;
}
/** The hourly rental you could take now: the world's, while its condition holds, else its plain fallback. */
export const rentalOffer = (g, w) => rentalOpen(g, w); // (sim/studio.ts's)
/** Sets the shoot with the subject: a plan of kind `shoot` at one of its places, at `from` (absolute minutes), for the
 *  brief's hours; they say yes or no by their day (work, sleep, other plans). */
export function setShoot(g, w, id, place, from) {
    const t = takenById(g, id), b = t && briefOf(w, t.brief);
    if (!t || !b || !t.who)
        return { ok: false, text: '' };
    if (!shootPlaces(g, w, id).some(x => x.id === place))
        return { ok: false, text: 'Not a place for this brief.' };
    if (from < earliest(g))
        return { ok: false, text: 'Pick a time at least half an hour from now.' };
    if (Math.floor(from / 1440) > t.due + PHOTO_RULES.grace)
        return { ok: false, text: 'That is after the deadline.' };
    if (t.on !== undefined && Math.floor(from / 1440) !== t.on)
        return { ok: false, text: 'A wedding is shot on its day.' };
    const ans = inviteShoot(g, w, t.who, place, from, (b.hours ?? BRIEF_HOURS) * 60 + 30, b.name);
    const n = nameOf(g, t.who);
    if (!ans.ok)
        return { ok: false, text: `${n} can't then: ${ans.why.replace(/^They (are|do|work|already have) /, (_m, v) => `${n} ${{ are: 'is', do: 'does', work: 'works', already: 'already has' }[v.split(' ')[0]]} `).replace(/^They /, `${n} `)}` };
    t.plan = ans.id;
    if (place !== STUDIO_ID && b.places.includes(place))
        t.place = place;
    return { ok: true, text: `${n} will be at ${ans.where} ${ans.when} for the shoot.` };
}
const planOf = (g, t) => (t.plan ? social(g).appts.find(a => a.id === t.plan) : undefined);
/* ---------- shooting ---------- */
// ((homerooms) at home with rooms inside, only the room you are in)
const here = (g, w, a) => isWith(g, a) || sceneHere(g, w).some(r => r.avatar === a);
const studioNeed = (b) => (b.studio === 'cyc' || b.studio === 'dressing' ? b.studio : undefined);
// At the brief's place (a studio brief: in a photo studio, with its fixture when it asks for one)?
function atPlace(g, w, t, b) {
    return t.place === ANY_STUDIO || b.studio ? inStudio(g, w, studioNeed(b)) : g.player.loc === t.place;
}
const windowHolds = (g, w, b, at = nowAbs(g)) => !b.window || whenHolds(g, w, b.window, { place: g.player.loc, at, key: `window|${b.id}` });
/** Why a taken brief can't be shot here now ('' when it can): its place, its day (a wedding), the window, the subject
 *  there, the camera good enough, the gear it asks for, the deadline, one redo at most. */
export function shootWhy(g, w, t, at = nowAbs(g)) {
    const b = briefOf(w, t.brief);
    if (!b || !photoOn(w))
        return 'Gone.';
    if (bookedOnSet(g, t))
        return 'Shot on set: take the stills during the shoot.';
    const day = Math.floor(at / 1440);
    if (t.shot?.redo)
        return 'Already shot twice.';
    if (t.shot && (day > t.due || t.shot.day !== day && !windowHolds(g, w, b, at)))
        return 'The window for a second try is gone.';
    if (day > t.due + PHOTO_RULES.grace)
        return 'Too late.';
    if (t.on !== undefined && day !== t.on)
        return `A wedding: on its day (${weekday(t.on)}).`;
    const gear = gearOf(g, w);
    if (!gear.camera)
        return 'You need a camera.';
    if (b.rung && gear.camera.rung < b.rung)
        return 'Your camera isn\'t good enough for this brief.';
    const lack = (b.gear ?? []).filter(k => !gear.kinds.has(k));
    if (lack.length)
        return `You need ${lack.map(gearWords).join(' and ')}.`;
    if (!atPlace(g, w, t, b))
        return t.place === ANY_STUDIO || b.studio ? 'Shot in a photo studio.' : `Only at ${placeOf(g, w, t.place)?.name ?? t.place}.`;
    if (!windowHolds(g, w, b, at))
        return windowWords(g, w, b) ? `Not now: ${windowWords(g, w, b)}.` : 'Not now.';
    if (t.who && t.lane !== 'wedding' && !here(g, w, t.who))
        return `${nameOf(g, t.who)} has to be here (set the shoot).`;
    return '';
}
const GEAR_WORDS = { camera: 'a camera', lens: 'a better lens', flash: 'a flash', drone: 'a camera drone', housing: 'a waterproof housing', rig: 'a lighting rig', cyc: 'a cyclorama wall', dressing: 'a dressing room', desk: 'a retouching desk', darkroom: 'a darkroom' };
export const gearWords = (k) => GEAR_WORDS[k] ?? `a ${k}`;
const HOURS_WORDS = ['', 'an hour', 'two hours', 'three hours'];
const feelTier = (v) => FRIEND_TIERS.find(t => v >= t.lo && v < t.hi)?.id ?? 'stranger';
const GOLDEN = (m) => (m >= 6 * 60 && m < 7.5 * 60) || (m >= 16.5 * 60 && m < 18.5 * 60);
/** The parts that add to a shot's quality besides the roll, each by name (P-21): the camera's level against the
 *  brief's, a lens, the flash at night or in a studio, the light beyond what the window asks, an assistant, the
 *  subject's feeling for you, the studio's lights, other gear, skills the brief asks for that you're short of. */
export function shotParts(g, w, t, b, at = nowAbs(g)) {
    const gear = gearOf(g, w), parts = [], m = ((at % 1440) + 1440) % 1440;
    const studio = t.place === ANY_STUDIO || !!b.studio || g.player.loc === STUDIO_ID;
    const cam = gear.camera;
    if (cam) {
        const d = cam.rung - (b.rung ?? 2);
        if (d)
            parts.push({ name: cam.name, n: d > 0 ? d * PHOTO_RULES.rungUp : -d * PHOTO_RULES.rungDown });
        if (gear.lens && cam.rung >= 3)
            parts.push({ name: gear.lens.name, n: gear.lens.photo.shoot ?? PHOTO_RULES.lens[Math.min(3, gear.lens.rung)] });
    }
    // (gear's own `shoot` points when the world gives them: the flash at night or in a studio, the rig in a studio)
    const flash = gear.items.find(x => x.photo.gear === 'flash'), rig = gear.items.find(x => x.photo.gear === 'rig');
    if (flash && (slotAt(m) === 'night' || studio))
        parts.push({ name: flash.name, n: flash.photo.shoot ?? PHOTO_RULES.flash });
    const conds = parseWhen(b.window).conds;
    if (!studio && conds.some(c => c.key === 'period' && !c.not) && GOLDEN(m))
        parts.push({ name: 'Golden hour', n: PHOTO_RULES.light });
    const wx = weatherAt(g, w, g.player.loc, Math.floor(at / 1440)).id;
    if (!studio && conds.some(c => c.key === 'weather' && !c.not && c.values.some(v => /rain/i.test(v))) && (wx === 'heavyrain' || wx === 'storm'))
        parts.push({ name: 'Real rain', n: PHOTO_RULES.light });
    const helper = withYou(g, w).filter(a => a !== t.who && a !== t.who2).map(a => g.cast[a]).filter((r) => !!r)
        .find(r => Math.max(personLevel(g, w, r, 'photography'), personLevel(g, w, r, 'fashion')) >= 3);
    if (helper)
        parts.push({ name: `${helper.name} assisting`, n: PHOTO_RULES.assistant });
    if (t.who && t.lane !== 'wedding') {
        const n = PHOTO_RULES.feel[feelTier(fr(g, t.who, YOU))] ?? 0;
        if (n)
            parts.push({ name: `How ${nameOf(g, t.who)} feels about you`, n });
    }
    if (studio && rig)
        parts.push({ name: rig.name, n: rig.photo.shoot ?? PHOTO_RULES.rig });
    for (const it of gear.items)
        if (it.photo.shoot && !['camera', 'lens', 'flash', 'rig'].includes(it.photo.gear))
            parts.push({ name: it.name, n: it.photo.shoot });
    for (const [s, need] of Object.entries(b.needs ?? {})) {
        const short = need - levelOf(g, s);
        if (short > 0)
            parts.push({ name: `${skillName(w, s)}: ${short === 1 ? '1 level' : `${short} levels`} short`, n: short * PHOTO_RULES.short });
    }
    return parts;
}
const howWords = (q) => (q >= 85 ? 'brilliantly' : q >= 70 ? 'very well' : q >= 55 ? 'well' : q >= 35 ? 'unevenly' : 'badly');
export const starsOf = (q) => (q < 35 ? 1 : q < 55 ? 2 : q < 70 ? 3 : q < 85 ? 4 : 5);
/** Shoots a brief (the action *Shoot the assignment* runs it once its hours have passed; `began`: the minute it
 *  began, the window judged then): d20 + the photography bonus against the brief's DC, quality 50 + 6 a point over
 *  it plus every part by name, held to 0–100; a failed roll still makes a picture. A second try keeps the better of
 *  the two. The photo is kept in Lens. Returns lines and what the AI is told. */
export function shootNow(g, w, id, began = nowAbs(g), rnd = Math.random) {
    const t = takenById(g, id), b = t && briefOf(w, t.brief), c = b && clientOf(w, b.client);
    if (!t || !b || !c)
        return { lines: [], ai: '' };
    const start = begun && begun.g === g && begun.id === id && begun.at === began ? begun.why : null;
    begun = null;
    const why = start ?? shootWhy(g, w, t, began);
    if (why)
        return { lines: [why], ai: '' };
    const dc = b.dc ?? BRIEF_DC, kind = b.kind;
    const bonus = rollBonus(g, w, { skill: 'photography', tags: ['shoot', kind] }), d20 = rollD20(g, w, bonus, dc, rnd);
    const total = d20 + bonus, ok = d20 === 20 || (d20 > 1 && total >= dc);
    const base = 50 + 6 * (total - dc), parts = shotParts(g, w, t, b, began);
    const q = Math.round(Math.max(0, Math.min(100, base + parts.reduce((a, x) => a + x.n, 0))));
    const look = gearOf(g, w).camera?.look ?? 'digital';
    const expr = ok ? (b.subject?.expr ?? 'joy') : b.subject?.expr === 'back' ? 'back' : H(`${g.world}|${t.id}|${g.minutes}|expr`) < 0.5 ? 'nervousness' : 'embarrassment';
    const outfit = b.subject?.outfit === 'naked' ? 'naked' : undefined;
    const who = [t.who, t.who2].filter((a) => !!a && !!g.cast[a]).map(a => ({ name: g.cast[a].name, expr: t.lane === 'wedding' ? (ok ? 'joy' : 'nervousness') : expr, ...(outfit ? { outfit } : {}) }));
    const placeId = g.player.loc;
    const rec = recordPhoto(g, w, { src: t.lane === 'book' ? 'book' : 'brief', place: placeId, who, q, brief: b.id, client: c.id, adult: !!(b.adult || c.adult), kind, look, at: began,
        cap: `${b.name} · ${placeCaption(g, w, placeId, ((began % 1440) + 1440) % 1440, [])}` });
    const shot = { day: Math.floor(began / 1440), min: ((began % 1440) + 1440) % 1440, place: placeId, total, dc, ok, q, parts, d20, bonus, base, look, ...(rec ? { photo: rec.id } : {}) };
    const lines = [];
    const p = photoOf(g);
    if (t.shot) {
        const keep = t.shot.q >= shot.q ? t.shot : shot, drop = keep === shot ? t.shot : shot;
        keep.redo = true;
        t.shot = keep;
        if (drop.photo !== undefined && drop.photo !== keep.photo)
            p.photos = p.photos.filter(r => r.id !== drop.photo);
        lines.push(keep === shot ? `Better the second time: quality ${shot.q}.` : `The first take was better (${keep.q}); you keep it.`);
        delete t.edited;
        delete t.editParts;
    }
    else {
        t.shot = shot;
        lines.push(`Shot: quality ${q} (${starsOf(q)}★ if you deliver it as it is).`);
    }
    trimPhotos(g);
    lines.push(...trainSkill(g, w, 'photography', ok ? 6 : 3));
    const subject = who.length ? who.map(x => x.name).join(' and ') : 'the brief';
    const placeName = placeOf(g, w, placeId)?.name ?? 'the studio';
    const best = parts.filter(x => x.n > 0).sort((a, x) => x.n - a.n).slice(0, 2).map(x => x.name.toLowerCase());
    const ai = `{{user}} spends ${HOURS_WORDS[b.hours ?? BRIEF_HOURS] ?? 'a while'} shooting ${subject} for ${c.name}'s "${b.name}" at ${placeName}${b.subject?.expr && b.subject.expr !== 'back' ? `; the brief wants ${b.subject.expr}` : ''}. It goes ${howWords(t.shot.q)}${best.length && t.shot.q >= 55 ? ` (${best.join(', ')} helping)` : ''}.${!ok && who.length ? ` ${who[0].name} looks ${expr === 'nervousness' ? 'nervous' : 'self-conscious'} in front of the camera.` : ''}`;
    p.last = { at: nowAbs(g), line: ai, place: placeId };
    return { lines, ai };
}
/* ---------- stills on set (plans/industry-lens.md Part 1) ---------- */
// A brief that booked you onto a title's stills seat (sim/titles.ts: the title's `stills` is the taken brief's id; read
// from the save as sim/onset.ts reads titles, so this file needs nothing of the industry's).
const bookedOnSet = (g, t) => (g.industry?.titles ?? []).some((x) => x.stills === t.id);
// Does a still show what a brief's subject asks for: the person (a name, `roster:<id>`, `roster`; anyone for `client`
// or `cast`) in the outfit (none: anything; `clothes`: their own; else that outfit, or one of that kind)?
function stillFits(w, b, rec) {
    const sub = b.subject, who = rec.who ?? [];
    if (!sub)
        return who.length > 0;
    const roster = w.industry?.roster ?? [];
    const person = (name) => {
        if (sub.who === 'client' || sub.who === 'cast')
            return true;
        if (sub.who === 'roster')
            return roster.some(p => p.name === name);
        if (sub.who.startsWith('roster:'))
            return roster.find(p => p.id === sub.who.slice(7))?.name === name;
        return sub.who.toLowerCase() === name.toLowerCase();
    };
    const dressed = (h) => {
        const o = sub.outfit;
        if (!o)
            return true;
        if (o === 'clothes')
            return !h.outfit;
        return h.outfit === o || (!!h.outfit && personPictures(w, h.name)?.wear?.[h.outfit]?.kind === o);
    };
    return who.some(h => h.expr !== 'back' && person(h.name) && dressed(h));
}
/** A still taken on set (sim/onset.ts) shoots the briefs that want it: the brief that booked you onto this title, and
 *  any other open brief of the title's label (its art department is the client) whose subject and outfit the still
 *  shows (the add-on's back cover in the naked set, a cover in lingerie). The better shot is kept, as a second try
 *  keeps it; a new one undoes the edit. Delivered from the phone as every brief. Lines. */
export function stillsShot(g, w, title, rec, shot) {
    if (!photoOn(w))
        return [];
    const out = [], day = Math.floor(nowAbs(g) / 1440);
    for (const t of peekPhoto(g).open) {
        const b = briefOf(w, t.brief), c = b && clientOf(w, b.client);
        if (!b || !c || ((b.adult || c.adult) && !adultOn(g)) || day > t.due + PHOTO_RULES.grace)
            continue;
        const booked = title.stills === t.id;
        if (!booked && (b.client !== title.label || bookedOnSet(g, t) || t.lane === 'wedding' || !stillFits(w, b, rec)))
            continue;
        if (t.shot && t.shot.q >= shot.q)
            continue;
        t.shot = { ...shot, parts: [...shot.parts] };
        delete t.edited;
        delete t.editParts;
        out.push(`${c.name}'s "${b.name}": a still to deliver (quality ${shot.q}).`);
    }
    if (out.length)
        trimPhotos(g);
    return out;
}
/* ---------- editing ---------- */
const editable = (g, w, t, kinds) => !!t.shot && t.shot.day === g.day && t.edited === undefined && (t.shot.look !== 'film' || kinds.has('darkroom'));
/** Where you can edit now: at home, in your photo studio, in the hours you rented one. */
export const canEditHere = (g, w) => atHomeNow(g) || g.player.loc === STUDIO_ID || inStudio(g, w);
const studioNow = (g, w) => g.player.loc === STUDIO_ID || inStudio(g, w);
/** Today's shots you could edit here now (film needs a darkroom). */
export function toEdit(g, w) {
    if (!photoOn(w) || !canEditHere(g, w))
        return [];
    const kinds = gearOf(g, w).kinds;
    return peekPhoto(g).open.filter(t => editable(g, w, t, kinds));
}
/** The minutes editing them takes: an hour, 20 more for each brief beyond the first, ×0.7 in a studio or with a
 *  retouching desk. */
export function editMinutes(g, w, n = toEdit(g, w).length) {
    if (!n)
        return 0;
    const fast = studioNow(g, w) || gearOf(g, w).kinds.has('desk');
    return Math.max(15, Math.round(((PHOTO_RULES.editMinutes + PHOTO_RULES.editMore * (n - 1)) * (fast ? PHOTO_RULES.studioTime : 1)) / 5) * 5);
}
/** Edits every brief shot today not yet edited, in one sitting: a roll on photography (with logic, +1 per 2 levels;
 *  `edit` effects) against each brief's DC; the lift is at most 15, (100 − quality) × 0.3 (half on a failed roll),
 *  plus what gear adds (a retouching desk), never more than 15. Returns lines and what the AI is told. */
export function editToday(g, w, rnd = Math.random) {
    const list = toEdit(g, w);
    if (!list.length)
        return { lines: ['Nothing shot today to edit here.'], ai: '' };
    const gear = gearOf(g, w), extra = gear.items.filter(x => x.photo.edit).map(x => ({ name: x.name, n: x.photo.edit }));
    const bonus = rollBonus(g, w, { skill: 'photography', tags: ['edit'] }) + Math.floor(levelOf(g, 'logic') / 2);
    const lines = [];
    for (const t of list) {
        const b = briefOf(w, t.brief), dc = b.dc ?? BRIEF_DC, d20 = rollD20(g, w, bonus, dc, rnd), ok = d20 === 20 || (d20 > 1 && d20 + bonus >= dc);
        const q = t.shot.q, lift0 = Math.min(PHOTO_RULES.editMax, (100 - q) * 0.3) * (ok ? 1 : 0.5);
        const parts = [{ name: `Editing roll ${d20 + bonus} vs ${dc}`, n: Math.round(lift0) }, ...extra];
        const lift = Math.max(0, Math.min(PHOTO_RULES.editMax, Math.round(lift0 + extra.reduce((a, x) => a + x.n, 0)), 100 - q));
        t.edited = lift;
        t.editParts = parts;
        const rec = photoById(g, t.shot.photo);
        if (rec)
            rec.q = Math.min(100, q + lift);
        lines.push(`${b.name}: +${lift} from editing (quality ${Math.min(100, q + lift)}).`);
    }
    lines.push(...trainSkill(g, w, 'photography', 2 * list.length));
    return { lines, ai: `{{user}} sits down to edit today's photos (${list.length === 1 ? 'one brief' : `${list.length} briefs`}).` };
}
/* ---------- delivering ---------- */
/** What delivering a shot brief would bring now: its quality (with the edit), stars, pay (late: ×0.7), reputation. */
export function deliveryPreview(g, w, t) {
    const b = briefOf(w, t.brief), c = b && clientOf(w, b.client);
    if (!t.shot || !b || !c)
        return null;
    const q = Math.min(100, t.shot.q + (t.edited ?? 0)), stars = starsOf(q), late = Math.max(0, g.day - t.due);
    const pay = payOf(g, b.pay * (c.pay ?? 1) * (0.5 + q / 100) * (late >= 1 ? PHOTO_RULES.late : 1) * effectMul(g, w, 'pay', ['photo', b.kind]));
    return { q, stars, pay, rep: repFor(b, stars, late >= 1), late };
}
const repFor = (b, stars, late) => {
    const top = b.rep ?? BRIEF_REP[b.board];
    const n = stars >= 5 ? top : stars === 4 ? top * 0.6 : stars === 3 ? top * 0.2 : stars === 2 ? -1 : -3;
    return Math.round((n + (late ? PHOTO_RULES.lateRep : 0)) * 100) / 100;
};
/** Delivers a shot brief from the phone: stars from its quality, the pay booked ("Kirameki Records: album cover
 *  (★★★★)"), reputation by stars (a small gig's never past the small board's cap), the client a contact when you hold
 *  the job, five stars into the portfolio, the subject's feelings, and what freelance and photobooks add. */
export function deliverBrief(g, w, id) {
    const t = takenById(g, id), b = t && briefOf(w, t.brief), c = b && clientOf(w, b.client);
    if (!t || !b || !c || !photoOn(w))
        return { ok: false, lines: [] };
    const pv = deliveryPreview(g, w, t);
    if (!pv)
        return { ok: false, lines: ['Shoot it first.'] };
    const p = photoOf(g), late = pv.late >= 1;
    p.open = p.open.filter(x => x !== t);
    g.player.money += pv.pay;
    book(g, `${c.name}: ${b.name} (${'★'.repeat(pv.stars)})`, pv.pay);
    const moved = addRep(g, w, pv.rep, t.lane === 'small');
    if (c.contact === 'job' && holdsPhotoJob(g, w) && !p.contacts[c.id])
        p.contacts[c.id] = { day: g.day };
    (p.recent ??= {})[b.id] = g.day;
    p.done++;
    const kinds = (p.kinds ??= {});
    kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
    const conds = parseWhen(b.window).conds;
    if (conds.some(x => x.key === 'festival' && !x.not))
        kinds.festival = (kinds.festival ?? 0) + 1;
    if (b.kind !== 'event' && conds.some(x => x.key === 'event' && !x.not))
        kinds.event = (kinds.event ?? 0) + 1;
    p.week ??= { from: g.day, n: 0 };
    p.week.n++;
    const rec = photoById(g, t.shot.photo);
    if (rec) {
        rec.stars = pv.stars;
        rec.q = pv.q;
    }
    const lines = [`Delivered to ${c.name}: ${b.name}. ${'★'.repeat(pv.stars)}${'☆'.repeat(5 - pv.stars)} · +${money(w, pv.pay)}${late ? ' (late)' : ''}${moved ? ` · reputation ${moved > 0 ? '+' : ''}${Math.round(moved * 10) / 10}` : ''}.`];
    const piece = pv.stars >= 5 && !!rec && addToPortfolio(g, rec.id);
    if (piece)
        lines.push('It goes into your portfolio.');
    // how the subject feels about it
    for (const a of [t.who, t.who2].filter((x) => !!x && !!g.cast[x])) {
        if (pv.stars >= 4) {
            gain(g, 'f', a, YOU, t.lane === 'wedding' ? 6 : 4);
            if (t.lane !== 'wedding' && systemOn(w, 'romance') && !romanceBlocked(g, a) && ro(g, a, YOU) > 0)
                gain(g, 'r', a, YOU, 2);
        }
        else if (pv.stars <= 2)
            lose(g, 'f', a, YOU, 3);
    }
    tallyEvent(g, 'photo_delivered');
    photoNote(g, '{u} delivered photos to {0}: {1}.', [c.name, b.name]);
    for (const f of afterDelivery)
        lines.push(...f(g, w, t, b, pv.stars, late));
    trimPhotos(g);
    return { ok: true, lines, stars: pv.stars, pay: pv.pay, q: pv.q, ...(rec ? { photo: rec.id } : {}), ...(piece ? { piece } : {}) };
}
// A brief not delivered in time: the client goes cold, the reputation drops.
function missed(g, w, t, gaveUp = false) {
    const b = briefOf(w, t.brief), c = b && clientOf(w, b.client), p = photoOf(g);
    p.open = p.open.filter(x => x !== t);
    if (!b || !c)
        return [];
    addRep(g, w, PHOTO_RULES.miss);
    (p.cold ??= {})[c.id] = g.day + PHOTO_RULES.cold;
    const out = [gaveUp ? `You gave ${c.name}'s brief back (${b.name}). They won't call for a while.` : `${c.name}: you missed the deadline for ${b.name}. They won't call for a while.`];
    for (const f of afterMissed)
        out.push(...f(g, w, t, b));
    return out;
}
// What a weather window waited for, in words ("the rain never came"; a sunny one "the right weather").
const WX_CAME = { rain: 'the rain', heavyrain: 'the rain', storm: 'the storm', snow: 'the snow' };
/** Each day: briefs past their deadline are missed, or extended once when their window never came (the client gives
 *  the same days again). Lines to show. */
export function settleOpen(g, w) {
    if (!photoOn(w))
        return [];
    const out = [];
    for (const t of [...peekPhoto(g).open]) {
        const b = briefOf(w, t.brief), c = b && clientOf(w, b.client);
        if (!b || !c) {
            photoOf(g).open = photoOf(g).open.filter(x => x !== t);
            continue;
        }
        if (t.lane === 'wedding' && !t.shot && t.on !== undefined && g.day > t.on) {
            out.push(...missed(g, w, t));
            continue;
        } // (a wedding is on its day)
        if (g.day <= t.due)
            continue;
        if (!t.shot && !t.extended && t.lane !== 'wedding' && b.window && !(t.win ?? []).length) {
            const n = t.days ?? b.days ?? BRIEF_DAYS;
            t.due = g.day + n;
            t.extended = true;
            const wx = parseWhen(b.window).conds.find(x => x.key === 'weather' && !x.not);
            out.push(`${c.name}: ${wx ? `${WX_CAME[wx.values[0].toLowerCase()] ?? 'the right weather'} never came` : 'the right moment never came'}; take another ${n} days.`);
            continue;
        }
        if (g.day > t.due + PHOTO_RULES.grace)
            out.push(...missed(g, w, t));
    }
    return out;
}
/** Each hour: the days a taken brief's window held at its place (the extension's rule). */
export function noteWindows(g, w) {
    if (!photoOn(w))
        return;
    for (const t of peekPhoto(g).open) {
        if (t.shot || (t.win ?? []).includes(g.day))
            continue;
        const b = briefOf(w, t.brief);
        if (!b?.window)
            continue;
        const place = t.place === ANY_STUDIO ? undefined : t.place;
        if (place && !openAt(g, w, place))
            continue;
        if (whenHolds(g, w, b.window, { place: place ?? g.player.loc, key: `window|${b.id}` }))
            (t.win ??= []).push(g.day);
    }
}
/* ---------- the engine's actions ---------- */
const act = (x) => ({ icon: '📷', cost: 0, effects: {}, scene: false, tags: ['photo'], ...x });
/** The engine's photo actions here now: *Shoot the assignment* for each brief that can be shot here, *Edit today*
 *  where you can edit and have something shot today. */
export function photoActions(g, w) {
    if (!photoOn(w) || !peekPhoto(g).open.length)
        return [];
    const out = [];
    for (const t of peekPhoto(g).open) {
        if (shootWhy(g, w, t))
            continue;
        const b = briefOf(w, t.brief), h = b.hours ?? BRIEF_HOURS;
        out.push(act({ id: `x-shoot-${t.id}`, name: 'Shoot the assignment', label: `${t.shot ? 'Shoot it again' : 'Shoot the assignment'}: ${b.name}`, minutes: h * 60, effects: { energy: -5 * h } }));
    }
    const n = toEdit(g, w).length;
    if (n)
        out.push(act({ id: 'x-photo-edit', name: 'Edit today', label: n === 1 ? 'Edit today\'s shoot' : `Edit today's ${n} shoots`, icon: '🖥️', minutes: editMinutes(g, w, n), effects: { energy: -3 } }));
    return out;
}
engineActions.push(photoActions);
// The shoot is judged as it begins (the place, the rented hours, the subject there): the action's hours pass before its
// result, and a two-hour rental or a shoot plan ending with the shoot mustn't undo it at the last minute.
let begun = null;
onAction.push((g, w, a) => {
    if (!a.id.startsWith('x-shoot-'))
        return;
    const t = takenById(g, Number(a.id.slice(8)));
    begun = t ? { g, id: t.id, at: nowAbs(g), why: shootWhy(g, w, t) } : null;
});
photoLink.act = (g, w, a, _mates, began) => {
    if (a.id.startsWith('x-shoot-'))
        return shootNow(g, w, Number(a.id.slice(8)), began);
    if (a.id === 'x-photo-edit')
        return editToday(g, w);
    return null;
};
/* ---------- the days ---------- */
onDay.push((g, w) => { if (!photoOn(w))
    return []; noteContacts(g, w); return [...settleOpen(g, w), ...fillBoards(g, w)]; });
onHour.push((g, w) => { noteWindows(g, w); return []; });
// The shoot in progress, for the AI: the subject here for a `shoot` plan, or the hour after shooting.
sceneLines.push((g, w, present) => {
    if (!photoOn(w))
        return [];
    const p = peekPhoto(g), now = nowAbs(g), out = [];
    for (const t of p.open) {
        const a = planOf(g, t), b = briefOf(w, t.brief), c = b && clientOf(w, b.client);
        if (!a || !b || !c || !t.who || a.kind !== 'shoot' || !livePlan(a) || now < a.from || now >= a.to || g.player.loc !== a.place)
            continue;
        if (!present.some(r => r.avatar === t.who) || ((b.adult || c.adult) && !adultOn(g)))
            continue;
        out.push(`This is a photo shoot for ${c.name}: {{user}} is photographing ${nameOf(g, t.who)} for "${b.name}"${b.subject?.expr && b.subject.expr !== 'back' ? `; the brief wants ${b.subject.expr}` : ''}${b.subject?.scene ? ` (${b.subject.scene})` : ''}.`);
    }
    if (p.last && now - p.last.at < 60 && g.player.loc === p.last.place)
        out.push(`Just now: ${p.last.line}`);
    return out;
});
/* ---------- the views (the Lens app) ---------- */
function needsOf(g, w, b, c) {
    const out = [], gear = gearOf(g, w);
    for (const [s, n] of Object.entries(b.needs ?? {}))
        out.push({ text: `${skillName(w, s)} ${n}`, have: levelOf(g, s) >= n });
    if (b.rung)
        out.push({ text: `a camera good enough (level ${b.rung})`, have: (gear.camera?.rung ?? 0) >= b.rung });
    for (const k of b.gear ?? [])
        out.push({ text: gearWords(k), have: gear.kinds.has(k) });
    if (b.studio || b.places.includes(ANY_STUDIO)) {
        const need = studioNeed(b), own = studioWith(g, w, need ?? 'any'), rent = !!rentalOffer(g, w) && need !== 'dressing';
        out.push({ text: need === 'cyc' ? 'a studio with a cyclorama wall' : need === 'dressing' ? 'a studio with a dressing room' : 'a photo studio', have: own || rent, ...(own ? { how: 'yours' } : rent ? { how: 'rental' } : {}) });
    }
    if (b.contact)
        out.push({ text: `${c.name} as a contact`, have: isContact(g, w, c.id) });
    return out;
}
function card(g, w, o) {
    const b = briefOf(w, o.brief), c = b && clientOf(w, b.client);
    if (!b || !c || ((b.adult || c.adult) && !adultOn(g)))
        return null;
    const mul = (c.pay ?? 1) * effectMul(g, w, 'pay', ['photo', b.kind]);
    const due = 'due' in o ? o.due : o.day + (o.days ?? b.days ?? BRIEF_DAYS);
    const rep = repFor(b, 5, false), capped = o.lane === 'small' && repOf(g) >= smallCap(w);
    const subject = o.who ? [o.who, o.who2].filter(Boolean).map(a => nameOf(g, a)).join(' and ') : b.subject?.who === 'client' ? 'a model the client sends' : undefined;
    const why = 'due' in o ? '' : takeWhy(g, w, o);
    return { offer: o, brief: b, client: c, place: o.place === ANY_STUDIO ? 'A photo studio' : placeOf(g, w, o.place)?.name ?? o.place, placeId: o.place, window: o.on !== undefined ? `on ${weekday(o.on)} (the wedding)` : windowWords(g, w, b),
        due: due - g.day, dueDay: due, pay50: payOf(g, b.pay * mul), pay100: payOf(g, b.pay * mul * 1.5), rep, ...(capped ? { capped } : {}), needs: needsOf(g, w, b, c),
        ...(subject ? { subject } : {}), can: !why, ...(why ? { why } : {}), lane: o.lane ?? (b.board === 'small' ? 'small' : 'full') };
}
/** The Board tab: the briefs on offer (with your board's kind, or why there's none). */
export function boardView(g, w) {
    const bd = boardsOf(g, w), p = peekPhoto(g);
    const cards = bd.kind === 'none' ? [] : p.board.map(o => card(g, w, o)).filter((x) => !!x);
    return { kind: bd.kind, cards, ...(bd.why ? { why: bd.why } : {}), ...(bd.small ? { cap: smallCap(w) } : {}), open: p.open.length, most: openMost(g, w) };
}
/** The Open tab: each brief taken, with what can be done about it now. */
export function openView(g, w) {
    if (!photoOn(w))
        return { cards: [] };
    const kinds = gearOf(g, w).kinds, editHere = canEditHere(g, w);
    const cards = peekPhoto(g).open.map(t => {
        const base = card(g, w, t);
        if (!base)
            return null;
        const b = base.brief, why = shootWhy(g, w, t), pv = deliveryPreview(g, w, t), a = planOf(g, t);
        const canEdit = editHere && editable(g, w, t, kinds);
        const editWhy = !t.shot ? 'Shoot it first.' : t.edited !== undefined ? 'Already edited.' : t.shot.day !== g.day ? 'Edited on the day it was shot.' : t.shot.look === 'film' && !kinds.has('darkroom') ? 'Film needs a darkroom.' : !editHere ? 'At home or in a studio.' : '';
        const out = { ...base, open: windowHolds(g, w, b), ...(t.shot ? { shot: t.shot, q: pv?.q } : {}), parts: [...(t.shot?.parts ?? []), ...(t.editParts ?? [])],
            canShoot: !why && !t.shot, ...(why ? { shootWhy: why } : {}), canRedo: !!t.shot && !why, canEdit, ...(editWhy && !canEdit ? { editWhy } : {}), canDeliver: !!pv,
            ...(pv ? { stars: pv.stars, payNow: pv.pay } : {}), late: Math.max(0, g.day - t.due), extended: !!t.extended,
            ...(a && a.state === 'set' ? { plan: `${weekday(Math.floor(a.from / 1440))} at ${hm(a.from % 1440)}, ${placeOf(g, w, a.place)?.name ?? ''}` } : {}),
            needsPlan: !!t.who && t.lane !== 'wedding' && !t.shot && !(a && livePlan(a)) };
        return out;
    }).filter((x) => !!x);
    return { cards };
}
/** The You tab. */
export function youView(g, w) {
    const p = peekPhoto(g), st = studioOf(g), zone = st ? studioZones(w).find(z => z.id === st.zone) : undefined, r = rentalOffer(g, w);
    const o = holdsPhotoJob(g, w) ? myJob(g, w) : null, free = o && freelancePath(g, w);
    const bd = boardsOf(g, w);
    let out = { rep: Math.floor(p.rep), words: repWords(w, p.rep), ...(bd.small && p.rep < smallCap(w) + 1 && !o ? { cap: smallCap(w) } : {}),
        contacts: contactsOf(g, w), done: p.done, kinds: { ...(p.kinds ?? {}) }, strength: portfolioStrength(g), pieces: portfolioOf(g).length,
        studio: st ? { zone: st.zone, name: zone?.name ?? st.zone, way: st.way, ...(st.free ? { free: true } : {}) } : null,
        rental: r ? { place: r.at, name: placeOf(g, w, r.at)?.name ?? r.at, price: payOf(g, r.price) } : null,
        ...(o && free ? { freelance: { path: free.name, rank: rankOf(g, o).name, week: p.week?.n ?? 0, ...(p.freelance ? { how: p.freelance } : {}) } } : {}) };
    for (const f of youParts)
        out = { ...out, ...f(g, w) };
    return out;
}
/** The Photos tab. */
export function photosView(g, w) {
    const port = portfolioOf(g), ids = new Set(port.map(r => r.id));
    const all = shownPhotos(g);
    return { portfolio: port, strength: portfolioStrength(g), rest: all.filter(r => !ids.has(r.id)).sort((a, b) => b.id - a.id), undeveloped: all.filter(r => r.undeveloped).length, keepsakes: photoKeepsakes(g, w) };
}
/** Is the subject of a taken brief here now (the app's hint)? */
export const subjectHere = (g, w, id) => { const t = takenById(g, id); return !!t?.who && here(g, w, t.who); };
