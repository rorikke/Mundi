// Home: guests. People from outside the house (your SillyTavern characters who do not live here) can come over:
// - a visit, invited from the Calendar: they arrive about an hour later and stay at the house until you say goodbye;
// - a party: they arrive when it starts and go home when it ends, unless you ask them to stay on (then they are
//   visitors like the others).
// While here, a guest is one of the cast (marked `guest`): bond, romance and memories work as with anyone, and they
// stay after the guest leaves (they are kept by name in the save). A guest is all the time in the house: in the
// common rooms by day, asleep at night on the living-room sofa or sharing a bedroom (yours or a housemate's).
import { nowAbs } from '../core/store.js';
import { isScenario, getWorld } from '../core/world.js';
import { planSlots, spotOf } from './plan.js';
import { onHour } from './hooks.js';
import { resident } from './game.js';
import { normalizeHomes } from './homes.js';
import { note } from './facts.js';
import { houseParty, partyRooms } from './houseparty.js';
import { placeOf, isOuting, placeOn, outingId } from './places.js';
import { charOf } from '../st/bridge.js';
/** How long after the invitation a visitor arrives (game minutes). */
export const VISIT_DELAY = 60;
const NOWHERE = { zone: '__guest', x: 0, y: 0 }; // a guest on the sofa has no bedroom of their own
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return h >>> 0; };
export const guestOf = (g, avatar) => (g.cast[avatar]?.guest ?? null);
export const isGuest = (g, avatar) => !!guestOf(g, avatar);
/** The people who live in the house (guests left out). */
export const housemates = (g) => Object.values(g.cast).filter(r => !r.guest);
export const guestsNow = (g, kind) => Object.values(g.cast).filter(r => { const x = r.guest; return !!x && (!kind || x.kind === kind); });
export const pendingVisits = (g) => (g.visitsPending ??= []);
const nameOf = (g, a) => g.cast[a]?.name ?? String(charOf(a)?.name ?? a);
// The room with the sofa: a common room named like a living room, else the first common room.
const SOFA_RE = /living|lounge|sitting|sofa|couch|family|common|parlou?r|den\b|sala|salón|salon|estar/i;
export function sofaRoom(g, w) {
    const rooms = partyRooms(g, w);
    return rooms.find(id => SOFA_RE.test(placeOf(g, w, id)?.name ?? '')) ?? rooms[0] ?? '';
}
export const sofaName = (g, w) => { const id = sofaRoom(g, w); return id ? placeOf(g, w, id)?.name ?? '' : ''; };
// Where a guest sleeps tonight.
function bedOf(g, w, r, x) {
    if (x.sleep.kind === 'share' || x.sleep.kind === 'room') {
        const hw = r.homeWith;
        return hw === '__you' ? 'home:player' : hw && g.cast[hw] ? `home:${hw}` : `home:${r.avatar}`;
    }
    return sofaRoom(g, w) || 'home:player';
}
/** Where a guest is now (null: not a guest). A house party, plans and company are decided before this (people.ts). */
export function guestSpot(g, w, r, at = nowAbs(g)) {
    const x = guestOf(g, r.avatar);
    if (!x)
        return null;
    if (doorbell(g).includes(r.avatar))
        return doorRoom(g, w); // ringing at the door, waiting for someone to open
    const h = Math.floor((at % 1440) / 60);
    if (h >= 23 || h < 8)
        return bedOf(g, w, r, x);
    const rooms = partyRooms(g, w);
    if (!rooms.length)
        return bedOf(g, w, r, x);
    return rooms[hash(`${r.avatar}|guest|${Math.floor(at / 120)}`) % rooms.length]; // a common room, changing every 2 hours
}
/** Someone comes in as a guest (a visit, or for the party). */
export function arrive(g, w, avatar, kind, sleep) {
    if (g.cast[avatar] || !charOf(avatar))
        return null;
    const r = resident(w, avatar, new Set(), g.player.home);
    r.occupation = null;
    r.met = true; // you invited them: you know each other
    r.guest = { kind, since: g.day, sleep };
    g.cast[avatar] = r;
    putToBed(g, r, sleep);
    if (kind !== 'outing')
        note(g, kind === 'party' ? '{0} came over for {u}\'s party.' : '{0} arrived to stay at the house for a while, as {u}\'s guest.', [r.name], [avatar], g.player.loc, 'event');
    return r;
}
// Where a guest sleeps: sharing a bedroom takes that bedroom's address (so the house knows they share it); the sofa has none.
function putToBed(g, r, sleep) {
    let bed = sleep;
    if (bed.kind === 'share' && bed.host !== '__you' && (!g.cast[bed.host] || isGuest(g, bed.host)))
        bed = { kind: 'sofa' };
    const room = bed.kind === 'room' ? spotHome(w0(g), bed.spot) : null;
    if (bed.kind === 'room' && !room)
        bed = { kind: 'sofa' };
    const h = bed.kind === 'share' ? (bed.host === '__you' ? g.player.home : g.cast[bed.host].home) : room ?? NOWHERE;
    r.home = { zone: h.zone, x: h.x, y: h.y, ...(h.n ? { n: h.n } : {}), ...(h.unit ? { unit: h.unit } : {}) };
    delete r.homeWith;
    r.guest.sleep = bed;
    normalizeHomes(g);
}
// A bedroom spot (`spot:<area>:<n>`) as a home address.
function spotHome(w, spot) {
    const [, zone, k] = spot.split(':');
    const z = w?.homes.zones.find(x => x.id === zone);
    const s = z?.spots[Number(k)];
    return z && s ? { zone: z.id, x: s[0], y: s[1], n: Number(k) + 1 } : null;
}
const w0 = (g) => getWorld(g.world);
/** The bedrooms nobody sleeps in (not you, not a housemate, not another guest): `except` is the guest asking. */
export function freeRooms(g, w, except = '') {
    const taken = new Set([spotOf(w, g.player.home), ...Object.values(g.cast).filter(r => r.avatar !== except).map(r => spotOf(w, r.home)),
        ...pendingVisits(g).filter(v => v.avatar !== except && v.sleep.kind === 'room').map(v => v.sleep.spot)].filter(Boolean)); // (a guest on the way has it too)
    return planSlots(w).filter(s => s.bedroom && !taken.has(s.id)).map(s => ({ spot: s.id, name: roomName(w, s.id, s.name) }));
}
// A bedroom's name, with its floor when the house has a plan (Floor 3 · Room 2).
export function roomName(w, spot, fallback = '') {
    const name = fallback || planSlots(w).find(s => s.id === spot)?.name || spot;
    const pr = w.plan?.rooms.find(r => r.id === spot);
    const f = pr ? w.plan.floors.find(x => x.id === pr.floor)?.name : '';
    return f ? `${f} · ${name}` : name;
}
/** Changes where a guest sleeps: one staying at the house, or one still on their way (from the Visits tab). */
export function setSleep(g, avatar, sleep) {
    const r = g.cast[avatar];
    if (r && guestOf(g, avatar)) {
        putToBed(g, r, sleep);
        return;
    }
    const v = pendingVisits(g).find(x => x.avatar === avatar);
    if (v)
        v.sleep = sleep;
}
/** A guest goes home (their card, chats, bond, romance and memories stay). Returns their name. */
export function sendHome(g, avatar, why = 'bye') {
    const r = g.cast[avatar];
    const x = guestOf(g, avatar);
    if (!r || !x)
        return '';
    const soc = g.social;
    if (soc) {
        soc.with = (soc.with ?? []).filter((c) => c.avatar !== avatar);
        for (const a of soc.appts ?? [])
            if (a.avatar === avatar && (a.state === 'set' || a.state === 'met'))
                a.state = 'cancelled';
        if (soc.solo === avatar)
            soc.solo = '';
    }
    for (const o of Object.values(g.cast))
        if (o.homeWith === avatar)
            delete o.homeWith;
    // you are in their room: it stays (empty) around you until you walk out, then it is shut again
    if (g.player.loc === `home:${avatar}` && r.home.zone !== '__guest')
        g.vacated = { id: `home:${avatar}`, home: { zone: r.home.zone, x: r.home.x, y: r.home.y } };
    delete g.cast[avatar];
    const d = doorbell(g).indexOf(avatar);
    if (d >= 0)
        doorbell(g).splice(d, 1);
    normalizeHomes(g);
    const days = Math.max(0, g.day - x.since);
    if (why === 'party')
        note(g, '{0} went home after {u}\'s party.', [r.name], [avatar], g.player.loc, 'event');
    else if (why === 'outing')
        note(g, '{0} went home after going out with {u}.', [r.name], [avatar], g.player.loc, 'event');
    else
        note(g, days ? '{0} said goodbye to {u} and went home, after staying {1} days at the house.' : '{0} said goodbye to {u} and went home after the visit.', [r.name, String(days)], [avatar], g.player.loc, 'event');
    return r.name;
}
/** A party guest stays on after the party: from now on a visitor (until you say goodbye). */
export function stayAfterParty(g, avatar) {
    const x = guestOf(g, avatar);
    if (!x || x.kind !== 'party')
        return false;
    x.kind = 'visit';
    x.since = g.day;
    const w = w0(g);
    if (w)
        putToBed(g, g.cast[avatar], defaultBed(g, w, avatar)); // a visitor sleeps in a bedroom
    note(g, '{u} asked {0} to stay on after the party, and {0} is staying at the house as a guest.', [nameOf(g, avatar)], [avatar], g.player.loc, 'event');
    return true;
}
/** Invites people for a visit: they arrive VISIT_DELAY minutes from now. Returns how many were invited. */
export function inviteVisit(g, w, avatars, sleep) {
    if (!isScenario(w))
        return 0;
    const list = pendingVisits(g);
    const at = nowAbs(g) + VISIT_DELAY;
    const ok = avatars.filter(a => !g.cast[a] && !list.some(v => v.avatar === a) && !!charOf(a));
    for (const a of ok)
        list.push({ avatar: a, at, sleep: sleep && sleep.kind !== 'sofa' ? sleep : defaultBed(g, w, a) }); // one by one: each takes the next free room
    if (ok.length)
        note(g, '{u} invited {0} to come and stay at the house.', [ok.map(a => nameOf(g, a)).join(', ')], ok, g.player.loc, 'plan');
    return ok.length;
}
/** Where a visitor sleeps unless you choose: a free bedroom of their own, else your bedroom (visitors never get the sofa). */
export function defaultBed(g, w, avatar) {
    const free = freeRooms(g, w, avatar)[0];
    return free ? { kind: 'room', spot: free.spot } : { kind: 'share', host: '__you' };
}
export function cancelVisit(g, avatar) { const list = pendingVisits(g); const i = list.findIndex(v => v.avatar === avatar); if (i >= 0)
    list.splice(i, 1); }
/* ---------- changing who comes to a party already planned ---------- */
// Someone from outside invited to (or uninvited from) the party: once it has started, they arrive at once, or go home.
export function partyGuest(g, w, avatar, add) {
    const p = houseParty(g);
    if (!p)
        return;
    p.guests ??= [];
    const now = nowAbs(g), on = now >= p.from && now < p.until;
    if (add) {
        if (p.guests.includes(avatar) || (g.cast[avatar] && !isGuest(g, avatar)))
            return;
        p.guests.push(avatar);
        if (on && arrive(g, w, avatar, 'party', { kind: 'sofa' }))
            joinIfThere(g, p, avatar);
    }
    else {
        p.guests = p.guests.filter((a) => a !== avatar);
        if (guestOf(g, avatar)?.kind === 'party')
            sendHome(g, avatar, 'party');
    }
}
// Someone of the house going (or not) to a party out of the house.
export function partyPerson(g, avatar) {
    const p = houseParty(g);
    if (!p?.out)
        return;
    const i = p.out.people.indexOf(avatar);
    if (i >= 0) {
        p.out.people.splice(i, 1);
        const s = g.social;
        if (s && g.player.loc === outingId(p.out.place))
            s.with = (s.with ?? []).filter((c) => c.avatar !== avatar);
    }
    else {
        p.out.people.push(avatar);
        if (nowAbs(g) >= p.from && nowAbs(g) < p.until)
            joinIfThere(g, p, avatar);
    }
}
// You are at the party out of the house already: whoever joins now is there with you.
function joinIfThere(g, p, avatar) {
    if (!p.out || !isOuting(g.player.loc) || g.player.loc !== outingId(p.out.place))
        return;
    const s = g.social ??= {};
    s.with ??= [];
    if (!s.with.some((c) => c.avatar === avatar))
        s.with.push({ avatar, until: p.until });
}
/* ---------- the doorbell ---------- */
/** Visitors at the door, waiting for you to open (the first one is asked about first). */
export const doorbell = (g) => (g.doorbell ??= []);
const ringSince = (g) => (g.doorbellAt ??= {});
// The room by the front door: an entrance hall (or foyer…) of the house; else the living room.
const DOOR_RE = /entrance|entry|hall|foyer|lobby|vestib|door|porch|entrada|recibidor/i;
export function doorRoom(g, w) {
    const rooms = w.places.filter(p => !p.link && placeOn(g, w, p.id));
    const by = (p) => DOOR_RE.test(p.id) || DOOR_RE.test(p.name);
    const inside = rooms.find(p => by(p) && !(p.tags ?? []).includes('outdoor')) ?? rooms.find(by);
    return inside?.id ?? sofaRoom(g, w) ?? 'home:player';
}
/** You answer the door: go and greet them (they stay with you for a while), or just open it (they come in by themselves). */
export function answerDoor(g, avatar, greet, byOthers = false) {
    const list = doorbell(g);
    const i = list.indexOf(avatar);
    if (i < 0)
        return false;
    list.splice(i, 1);
    delete ringSince(g)[avatar];
    const name = nameOf(g, avatar);
    if (greet) {
        const s = g.social ??= {};
        s.with ??= [];
        if (!s.with.some((c) => c.avatar === avatar))
            s.with.push({ avatar, until: nowAbs(g) + 120 });
        note(g, '{u} went to the door and welcomed {0} in.', [name], [avatar], g.player.loc, 'event');
    }
    else
        note(g, byOthers ? 'Someone in the house opened the door and {0} came in.' : '{u} opened the door and {0} came in.', [name], [avatar], g.player.loc, 'event');
    return true;
}
/** For the AI: who among the people here is a guest (so they are not taken for housemates). */
export function guestLine(g, present) {
    const vis = present.filter(r => guestOf(g, r.avatar)?.kind === 'visit').map(r => r.name);
    const par = present.filter(r => guestOf(g, r.avatar)?.kind === 'party').map(r => r.name);
    const out = present.filter(r => guestOf(g, r.avatar)?.kind === 'outing').map(r => r.name);
    return [
        vis.length ? `Guests, not housemates: ${vis.join(', ')} ${vis.length === 1 ? 'is' : 'are'} visiting {{user}} and staying at the house for a while; they stay until {{user}} says goodbye.` : '',
        par.length ? `Party guests from outside the house: ${par.join(', ')} came over for the party and will go home when it ends.` : '',
        out.length ? `Not housemates: ${out.join(', ')} came out with {{user}} and will go home afterwards.` : '',
    ].filter(Boolean).join(' ');
}
// Every hour: visitors who arrive, party guests who come and who go home.
/** Arrivals, the doorbell and who goes home. Every hour of the game and every time plans are checked (like plans made
 * with someone: minute by minute), so a visitor arrives on time and the screen hears about it. */
export function guestTick(g, w) {
    if (!isScenario(w))
        return [];
    const now = nowAbs(g);
    const out = [];
    if (g.vacated && g.player.loc !== g.vacated.id)
        delete g.vacated; // you walked out: the room is shut
    const list = pendingVisits(g);
    // visitors never sleep on the sofa (from older saves: a bedroom for them)
    for (const r of guestsNow(g, 'visit'))
        if (guestOf(g, r.avatar).sleep.kind === 'sofa')
            putToBed(g, r, defaultBed(g, w, r.avatar));
    for (const v of list)
        if (v.sleep.kind === 'sofa')
            v.sleep = defaultBed(g, w, v.avatar);
    for (const v of [...list]) {
        if (v.at > now)
            continue;
        list.splice(list.indexOf(v), 1);
        const r = arrive(g, w, v.avatar, 'visit', v.sleep);
        if (!r)
            continue;
        // you are home: they ring the doorbell (you go and greet them, or just open the door); out: someone lets them in
        if (!isOuting(g.player.loc)) {
            doorbell(g).push(r.avatar);
            ringSince(g)[r.avatar] = now;
            out.push(`${r.name} is at the door.`);
        }
        else
            out.push(`${r.name} arrived for the visit.`);
    }
    // nobody answered for an hour: someone in the house opens the door
    for (const a of [...doorbell(g)])
        if (now - (ringSince(g)[a] ?? now) >= 60 && answerDoor(g, a, false, true))
            out.push(`${nameOf(g, a)} came in (someone opened the door).`);
    const p = houseParty(g);
    if (p?.guests?.length && !p.came && now >= p.from && now < p.until) {
        p.came = true;
        const came = p.guests.map(a => arrive(g, w, a, 'party', { kind: 'sofa' })).filter(Boolean);
        if (came.length)
            out.push(`Party guests arrived: ${came.map(r => r.name).join(', ')}.`);
    }
    if (!isOuting(g.player.loc))
        for (const r of guestsNow(g, 'outing')) {
            const n = sendHome(g, r.avatar, 'outing');
            if (n)
                out.push(`${n} went home.`);
        }
    if (!p || now >= p.until)
        for (const r of guestsNow(g, 'party')) {
            const n = sendHome(g, r.avatar, 'party');
            if (n)
                out.push(`${n} went home after the party.`);
        }
    return out;
}
onHour.push(guestTick);
