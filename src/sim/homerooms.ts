// (homerooms) Rooms inside a home: a kind of home (or one area) lists its shared rooms, and every person living at the
// address gets a bedroom. At home you are in one room: its picture, its things to do, the AI told where you are.
// A room is a detail of the home, never a place: `g.player.loc` stays the home, `whereNow` is untouched, and the room
// you're in (`g.player.room`) is kept with the home it belongs to, so leaving the home in any way makes it stale.
import { adultOn, changes, nowAbs, type Save, type Resident, residentsOf } from '../core/store.js';
import { systemOn, type WorldDef, type Place, type HomeRoom } from '../core/world.js';
import { placeOf, homeKindAt, homeZoneAt, playerHomeId, isHome } from './places.js';
import { secondHome, SECOND_HOME_ID } from './housing.js';
import { homeKey } from './homes.js';
import { exampleOf } from './dayplan.js';
import { isPartner, fr, statusOf, YOU } from './rel.js';
import { pictureAt } from './daynight.js';
import { presentAt, routineAt } from './people.js';
import { social, isWith, appointmentNow, bondOf, livePlan } from './social.js';
import { breakNow } from './daylife.js';
import { isSleeping } from './plans.js';
import { FRIEND_TIERS } from './romance.js';
import { roomRules, partyRooms } from './hooks.js';
import { whenHolds } from './when.js';
import { lex } from '../core/lexicon.js';
export { roomRules, partyRooms };

/** What a room can be for, as tags the World creator offers (besides the place tags). Bedrooms are made, never
 *  written, so `bed` isn't one of them. */
export const ROOM_TAGS = ['kitchen', 'living', 'bath', 'gym'];

/** A room of the home you're at, as the game uses it: a written room, or a bedroom (`bed`: its person's avatar, or
 *  'you'). */
export interface RoomHere {
    id: string; name: string; desc?: string; tags: string[]; image?: string; images?: Record<string, string>;
    sofa?: boolean; actions?: string[]; bed?: string;
}

export const homeRoomsOn = (w: WorldDef | null | undefined) => systemOn(w, 'homerooms');

// The written rooms of the home at `loc`: its area's own when it lists any, else its kind's.
function writtenRooms(g: Save, w: WorldDef, loc: string): HomeRoom[] {
    const zone = w.homes.zones.find(z => z.id === homeZoneAt(g, w, loc));
    if (zone?.rooms?.length) return zone.rooms;
    return w.homes.kinds[homeKindAt(g, w, loc)]?.rooms ?? [];
}
// The address a home's place is at (homeKey), '' when it isn't a home.
function addressOf(g: Save, loc: string): string {
    if (loc === playerHomeId) return homeKey(g.player.home);
    if (loc === SECOND_HOME_ID) { const s = secondHome(g); return s ? homeKey(s) : ''; }
    if (!isHome(loc)) return '';
    const r = g.cast[loc.slice(5)];
    return r ? homeKey(r.home) : '';
}

// Asked many times per refresh (the HUD, the prompt, the actions): kept per save, home and change.
const kept = new WeakMap<Save, Map<string, { w: WorldDef; n: number; at: string; list: RoomHere[] }>>();
/** The rooms of the home at `loc` (yours or anyone's): its written rooms, then a bedroom per person living at that
 *  address (yours first at your home). `[]`: no rooms (none written, not a home, or the system off). */
export function homeRooms(g: Save, w: WorldDef, loc: string): RoomHere[] {
    if (!homeRoomsOn(w) || !isHome(loc)) return [];
    const written = writtenRooms(g, w, loc);
    if (!written.length) return [];
    const at = addressOf(g, loc);
    let m = kept.get(g); if (!m) kept.set(g, m = new Map());
    const k = m.get(loc);
    if (k && k.w === w && k.n === changes() && k.at === at) return k.list;
    const kind = w.homes.kinds[homeKindAt(g, w, loc)];
    const list: RoomHere[] = written.map(r => ({ ...r, tags: [...(r.tags ?? [])] }));
    const mine = loc === playerHomeId;
    if (mine) list.push({ id: 'bed:you', name: 'Your room', tags: ['bed'], image: kind?.image, images: kind?.images, bed: 'you' });
    const people = residentsOf(g).filter(r => at && homeKey(r.home) === at && !(r as any).guest && !(mine && isPartner(g, r.avatar, YOU)))
        .sort((a, b) => (a.avatar < b.avatar ? -1 : a.avatar > b.avatar ? 1 : 0));
    for (const r of people) {
        const b = exampleOf(w, r)?.bedroom;
        const own = !!(b?.image || b?.images && Object.keys(b.images).length);
        list.push({ id: `bed:${r.avatar}`, name: `${r.name}'s room`, desc: b?.desc, tags: ['bed'], image: own ? b!.image : kind?.image, images: own ? b!.images : kind?.images, bed: r.avatar });
    }
    m.set(loc, { w, n: changes(), at, list });
    return list;
}

/** The room you're in, or null when you aren't at a home with rooms. A room kept for another place, or no longer
 *  there, reads as the entry (the first room). */
export function roomNow(g: Save, w: WorldDef): RoomHere | null {
    // a room kept for a home you've left is forgotten as soon as anything looks (and by the clock, sim/time.ts), so
    // coming back later starts at the entry again
    if (g.player.room && g.player.room.loc !== g.player.loc) delete g.player.room;
    const list = homeRooms(g, w, g.player.loc);
    if (!list.length) return null;
    const r = g.player.room;
    return (r && r.loc === g.player.loc && list.find(x => x.id === r.id)) || list[0];
}
/** Walks you into another room of the home you're at: no time passes and the scene stays (the caller syncs it).
 *  '' when done, else why not. */
export function enterRoom(g: Save, w: WorldDef, id: string): string {
    const d = roomDoor(g, w, id);
    if (!d.ok) return d.text;
    g.player.room = { loc: g.player.loc, id };
    return '';
}
/** Whether you can walk into a room of the home you're at, and what happens at the door: a shared room or your own
 *  is always open; someone's bedroom follows bedroomDoor. */
export function roomDoor(g: Save, w: WorldDef, id: string): { ok: boolean; text: string } {
    const to = homeRooms(g, w, g.player.loc).find(x => x.id === id);
    if (!to) return { ok: false, text: 'There is no such room here.' };
    const r = to.bed && to.bed !== 'you' ? g.cast[to.bed] : null;
    if (!r) return { ok: true, text: '' };
    const inside = roomOf(g, w, r) === to.id;
    return bedroomDoor(g, r, inside, inside && asleepAt(g, w, r, nowAbs(g)), w);
}
/** Does someone's own rule keep their door closed to you now (ExampleCharacter.door: `never`, or a condition that
 *  doesn't hold yet)? Asked before how close you are, so a partner or a best friend is kept out too; only the world's
 *  people have one. Every way into their home asks it: the door (sim/life.ts doorAnswer), their bedroom here, staying
 *  the night at theirs and their "come over tonight?" (sim/initiative.ts, ui/events.ts). A rule marked `doorAdult` is
 *  kept only with adult content on: with it off, nothing here shuts the door and the usual rules decide. */
export function doorShut(g: Save, w: WorldDef | null | undefined, r: Resident): boolean {
    const ex = w ? exampleOf(w, r) : undefined, rule = ex?.door?.trim();
    if (!w || !rule || (ex!.doorAdult === true && !adultOn(g))) return false;
    return rule.toLowerCase() === 'never' || !whenHolds(g, w, rule);
}
/** What you're told at a door their rule keeps closed: their own line, else the world's words. */
export const doorWords = (w: WorldDef, r: Resident) => {
    const own = exampleOf(w, r)?.doorLine?.trim();
    return own ? own.replace(/\{name\}/g, r.name) : lex(w, 'doorKept', r.name);
};
/** Someone's bedroom door (a Home's rooms down the hall, and a bedroom inside a home with rooms): your partner's or a
 *  close friend's (50+) you walk into; someone you know a little (15+) lets you in when you knock; anyone else talks
 *  to you through it. Asleep inside, a knock gets no answer and the door stays shut, unless you're partners. Their own
 *  rule (doorShut, with the world given) comes before all of that. */
export function bedroomDoor(g: Save, r: Resident, inside: boolean, asleep: boolean, w?: WorldDef): { ok: boolean; text: string } {
    // their own rule first: at the door they talk to you there (their words), and their room is locked while they're out
    if (doorShut(g, w, r)) return { ok: false, text: inside ? doorWords(w!, r) : `${r.name}'s room is locked, and you don't know where the key is.` };
    if (isPartner(g, r.avatar, YOU)) return { ok: true, text: inside ? '' : `${r.name} is not in, but the door is not locked.` };
    if (inside && asleep) return { ok: false, text: `You knock on ${r.name}'s door. No answer: they're asleep.` };
    if (bondOf(g, r.avatar) >= 50) return { ok: true, text: inside ? '' : `${r.name} is not in, but the door is not locked.` };
    if (!inside) return { ok: false, text: `${r.name}'s room is locked, and you don't know where the key is.` };
    if (bondOf(g, r.avatar) >= 15) return { ok: true, text: `You knock on ${r.name}'s door and they let you in.` };
    return { ok: false, text: `You knock on ${r.name}'s door. They talk to you through it, but don't let you in.` };
}
/** Before sleeping at home: you go to your own room (and wake up there, since the room stays set). */
export function sleepRoom(g: Save, w: WorldDef): void {
    if (g.player.loc !== playerHomeId) return;
    if (homeRooms(g, w, g.player.loc).some(x => x.id === 'bed:you')) g.player.room = { loc: g.player.loc, id: 'bed:you' };
}

/** The place you're at with the room laid over it ("My home › Kitchen", the room's words and tags), for the scene, its
 *  pictures and the AI. The id stays the home's; the room is carried as `inRoom` (a place's own `room` is a fixture's
 *  id, `Place.room`). Without a room it is placeOf's own answer, unchanged. */
export function scenePlace(g: Save, w: WorldDef): (Place & { home?: boolean; owner?: string; inRoom?: RoomHere }) | null {
    const p = placeOf(g, w, g.player.loc);
    const room = p && roomNow(g, w);
    if (!p || !room) return p;
    return { ...p, name: `${p.name} › ${room.name}`, desc: [p.desc, room.desc].filter(Boolean).join(' '), tags: [...new Set(['home', ...room.tags])], inRoom: room };
}
/** The picture of the room you're in at this time of day (null: no room, or a room with no picture of its own,
 *  so the caller keeps the home's). */
export function roomPicture(g: Save, w: WorldDef, looks?: string[]): string | null {
    const room = roomNow(g, w);
    return (room && pictureAt(w, g.minutes, room.image, room.images, looks)) || null;
}

/* ---------- the people in the rooms ---------- */

// (FNV-1a, then mixed: keys that differ only in their last characters, the hour, must still land anywhere in 0..1)
const H = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};
// (read when asked: this module is imported in a cycle with romance.ts)
const friendLo = () => FRIEND_TIERS.find(t => t.id === 'friend')?.lo ?? 30;
/** A short stay in your room: someone who came to find you (a knock on your door, walking into the kitchen). */
export interface DropIn { avatar: string; loc: string; room: string; until: number }
const dropIns = (g: Save): DropIn[] => ((social(g) as any).dropIn ?? []) as DropIn[];
// (the hook lists `roomRules` and `partyRooms` live in sim/hooks.ts, so the parts that fill them can import nothing of
// this file's: visitors.ts is imported by people.ts, which this file imports)
// The house's rhythm: how likely each kind of room is at this hour. The hour before bed stays social (it's often the
// only evening hour everyone is home): the common room first, a bath or their room. Tuned with the user 2026-11-18.
const rhythmAt = (h: number, bedtime: boolean): Record<'kitchen' | 'living' | 'bath' | 'own', number> =>
    bedtime ? { kitchen: 0, living: 2, bath: 1, own: 1 }
        : h >= 6 && h < 9 ? { kitchen: 3, living: 0, bath: 1, own: 2 }
        : h === 12 ? { kitchen: 2, living: 1, bath: 0, own: 2 }
        : h >= 18 && h < 20 ? { kitchen: 3, living: 2, bath: 0, own: 1 }
        : h >= 20 && h < 23 ? { kitchen: 1, living: 3, bath: 0, own: 2 }
        : { kitchen: 1, living: 1, bath: 0, own: 4 };
/** How likely a friend or partner joins the other's shared room, each hour (two in three). */
export const LEAN = 2 / 3;
// The home id a person sleeps at (their routine's "home"): yours when they live with you, else their household's.
const homeIdOf = (r: Resident) => ((r as any).homeWith === '__you' ? playerHomeId : (r as any).homeWith ? `home:${(r as any).homeWith}` : `home:${r.avatar}`);

// Asleep at home: the routine's night (home before 7 or from 23), or home since a late return (between 23:00 and
// 08:00, less than 8 hours ago: the konbini's night shift, the livehouse until midnight). Kept per person and hour.
const sleepKept = new WeakMap<Save, { w: WorldDef; n: number; by: Map<string, boolean> }>();
export function asleepAt(g: Save, w: WorldDef, r: Resident, at: number): boolean {
    if (isSleeping(r, at)) return true;
    const hour = Math.floor(at / 60);
    let k = sleepKept.get(g);
    if (!k || k.w !== w || k.n !== changes()) sleepKept.set(g, k = { w, n: changes(), by: new Map() });
    const key = `${r.avatar}|${hour}`;
    const have = k.by.get(key);
    if (have !== undefined) return have;
    const home = homeIdOf(r);
    let out = false;
    if (routineAt(g, w, r, hour * 60) === home) {
        let back = 0;
        while (back < 9 && routineAt(g, w, r, (hour - back - 1) * 60) === home) back++;
        const came = hour - back, h = ((came % 24) + 24) % 24;
        out = back < 9 && (h >= 23 || h < 8) && hour - came < 8;
    }
    k.by.set(key, out);
    return out;
}

// Who is in which room of the home at `loc`, worked out for everyone at once (friends lean toward the same room) in a
// stable order, from presentAt (so where people are is never touched). Kept per minute and per change.
const mapKept = new WeakMap<Save, Map<string, { w: WorldDef; key: string; map: Map<string, string> }>>();
export function homeRoomMap(g: Save, w: WorldDef, loc: string = g.player.loc): Map<string, string> {
    const rooms = homeRooms(g, w, loc);
    if (!rooms.length) return new Map();
    const at = nowAbs(g), here = loc === g.player.loc;
    const lock = (social(g) as any).lock as { loc: string; who: string[]; until: number; room?: string } | undefined;
    const drops = dropIns(g);
    const mine = here ? (roomNow(g, w)?.id ?? rooms[0].id) : rooms[0].id;
    const key = `${at}|${changes()}|${mine}|${lock?.until ?? ''}|${lock?.room ?? ''}|${drops.map(d => `${d.avatar}${d.until}`).join(',')}`;
    let m = mapKept.get(g); if (!m) mapKept.set(g, m = new Map());
    const kept = m.get(loc);
    if (kept && kept.w === w && kept.key === key) return kept.map;
    const map = new Map<string, string>();
    const people = presentAt(g, w, loc).sort((a, b) => (a.avatar < b.avatar ? -1 : a.avatar > b.avatar ? 1 : 0));
    const ids = new Set(rooms.map(r => r.id));
    const tagged = (t: string) => rooms.find(r => !r.bed && r.tags.includes(t))?.id;
    const sofa = rooms.find(r => r.sofa)?.id ?? tagged('living') ?? rooms[0].id;
    const bath = tagged('bath');
    const lives = new Set(rooms.filter(r => r.bed && r.bed !== 'you').map(r => r.bed!));
    const sharesYours = (r: Resident) => loc === playerHomeId && homeIdOf(r) === playerHomeId && isPartner(g, r.avatar, YOU);
    const bedOf = (r: Resident) => (lives.has(r.avatar) ? `bed:${r.avatar}` : sharesYours(r) ? 'bed:you' : null);
    const host = !here || !isHome(loc) || loc === playerHomeId || loc === SECOND_HOME_ID ? '' : loc.slice(5);
    const free: Resident[] = [];
    for (const r of people) {
        const a = r.avatar;
        // 1. with you, or a plan with you here (not a party: a guest at your party is with you only for the plan's sake,
        // and is somewhere in the party)
        const appt = here ? appointmentNow(g, a) : null, guest = appt?.kind === 'party' && appt.place === loc;
        if (here && !guest && (isWith(g, a) || (appt && appt.place === loc))) { map.set(a, mine); continue; }
        // 2. in the scene when you last spoke: where you were talking, until the lock ends (even if you walked out)
        if (here && lock?.room && lock.loc === loc && at < lock.until && lock.who.includes(a) && ids.has(lock.room)) { map.set(a, lock.room); continue; }
        // 3. a party at home
        const party = partyRooms.map(f => f(g, w, r, { loc, rooms, at })).find(x => x && ids.has(x));
        if (party) { map.set(a, party); continue; }
        // 4. came to find you
        const drop = drops.find(d => d.avatar === a && d.loc === loc && at < d.until && ids.has(d.room));
        if (drop) { map.set(a, drop.room); continue; }
        // 5. the one whose home you're visiting stays with you, room to room (never following you out: nothing stored)
        if (a === host) { map.set(a, mine); continue; }
        // 6. what other parts of the game say (a friend staying over)
        const ruled = roomRules.map(f => f(g, w, r, { loc, rooms, at, mine })).find(x => x && ids.has(x));
        if (ruled) { map.set(a, ruled); continue; }
        // 7. asleep or off sick: their bed (someone without one: the sofa)
        if (asleepAt(g, w, r, at) || breakNow(g, w, r, at)?.kind === 'sick') { map.set(a, bedOf(r) ?? sofa); continue; }
        // someone who doesn't live here, with nothing above: where you come in
        if (!bedOf(r)) { map.set(a, rooms[0].id); continue; }
        free.push(r);
    }
    // 8. the house's rhythm for the hour: a hash of (person, day, hour) between its rooms, so it holds for the hour
    const day = Math.floor(at / 1440), h = Math.floor((at % 1440) / 60);
    let bathTaken = !!bath && [...map.values()].includes(bath);
    for (const r of free) {
        const own = bedOf(r)!;
        const wt = rhythmAt(h, asleepAt(g, w, r, at + 60));
        const opts: [string, number][] = [];
        let toOwn = wt.own;
        for (const t of ['kitchen', 'living', 'bath'] as const) {
            const id = tagged(t);
            if (id && !(t === 'bath' && bathTaken)) opts.push([id, wt[t]]); else toOwn += wt[t];   // a room the home lacks: their own
        }
        opts.push([own, toOwn]);
        const total = opts.reduce((n, [, x]) => n + x, 0);
        let pick = own, roll = H(`${r.avatar}|${day}|${h}`) * total;
        for (const [id, x] of opts) { if (roll < x) { pick = id; break; } roll -= x; }
        if (pick === bath) bathTaken = true;
        map.set(r.avatar, pick);
    }
    // friends and couples lean toward the same shared room
    for (const r of free) {
        if (map.get(r.avatar) === bath) continue;
        for (const o of people) {
            const there = map.get(o.avatar);
            if (o === r || !there || there.startsWith('bed:') || there === bath || there === map.get(r.avatar)) continue;
            if ((fr(g, r.avatar, o.avatar) >= friendLo() || statusOf(g, r.avatar, o.avatar)) && H(`${r.avatar}|${o.avatar}|${day}|${h}`) < LEAN) { map.set(r.avatar, there); break; }
        }
    }
    m.set(loc, { w, key, map });
    return map;
}
/** The room someone is in at the home at `loc` (yours by default), or null (not there, or no rooms). */
export const roomOf = (g: Save, w: WorldDef, r: Resident, loc: string = g.player.loc): string | null => homeRoomMap(g, w, loc).get(r.avatar) ?? null;
/** Your scene: the people at your place, narrowed to the room you're in at a home with rooms. */
export function sceneHere(g: Save, w: WorldDef): Resident[] {
    const list = presentAt(g, w, g.player.loc);
    const room = roomNow(g, w);
    if (!room) return list;
    const map = homeRoomMap(g, w);
    return list.filter(r => map.get(r.avatar) === room.id);
}
/** The scene at a place: your scene when it's where you are, else everyone there. */
export const sceneAt = (g: Save, w: WorldDef, loc: string): Resident[] => (loc === g.player.loc ? sceneHere(g, w) : presentAt(g, w, loc));
/** The people you've met elsewhere in the home you're at: which room, and whether they're asleep. */
export function elsewhereHere(g: Save, w: WorldDef): { r: Resident; room: RoomHere; asleep: boolean }[] {
    const room = roomNow(g, w);
    if (!room) return [];
    const map = homeRoomMap(g, w), rooms = homeRooms(g, w, g.player.loc), at = nowAbs(g);
    const out: { r: Resident; room: RoomHere; asleep: boolean }[] = [];
    for (const r of presentAt(g, w, g.player.loc)) {
        const there = rooms.find(x => x.id === map.get(r.avatar));
        if (r.met && there && there.id !== room.id) out.push({ r, room: there, asleep: asleepAt(g, w, r, at) });
    }
    return out;
}
/** For the live clock: changes when you or anyone at your home changes room, and when the people you were talking
 *  with stop being held (the scene lock ends: what they said is judged then). '' at a place without rooms. */
export function roomSig(g: Save, w: WorldDef): string {
    const room = roomNow(g, w);
    if (!room) return '';
    return `${room.id}|${heldHere(g, w).join(',')}|${[...homeRoomMap(g, w)].map(([a, id]) => `${a}=${id}`).join(',')}`;
}
/** The people you were talking with in another room of this home, still where you left them (the scene lock, an hour
 *  after your last line): walking away from them isn't judged yet, so a quick trip to your room and back is still one
 *  conversation. It's judged when the lock ends or when you leave the home (the visit ends). */
export function heldHere(g: Save, w: WorldDef): string[] {
    const room = roomNow(g, w);
    const lock = (social(g) as any).lock as { loc: string; who: string[]; until: number; room?: string } | undefined;
    if (!room || !lock?.room || lock.loc !== g.player.loc || nowAbs(g) >= lock.until) return [];
    const map = homeRoomMap(g, w);
    return lock.who.filter(a => map.get(a) === lock.room);
}
/** Someone comes to find you in the room you're in, and stays there a while (unless the scene keeps them longer). */
export function dropIn(g: Save, w: WorldDef, avatar: string, minutes = 45): void {
    const room = roomNow(g, w);
    if (!room) return;
    const now = nowAbs(g), soc = social(g) as any;
    soc.dropIn = dropIns(g).filter(d => d.avatar !== avatar && now < d.until);
    soc.dropIn.push({ avatar, loc: g.player.loc, room: room.id, until: now + minutes });
}
/** For the AI: who is elsewhere in the house (only people you've met), so the story doesn't walk them in. */
export function elsewhereLine(g: Save, w: WorldDef): string {
    const list = elsewhereHere(g, w);
    if (!list.length) return '';
    const words = list.map(x => `${x.r.name} (${x.room.bed === x.r.avatar ? 'their room' : x.room.bed === 'you' ? "{{user}}'s room" : `the ${x.room.name.toLowerCase()}`}${x.asleep ? ', asleep' : ''})`);
    return `Elsewhere in the house, not in this scene (they don't walk in unless the game brings them): ${words.join(', ')}.`;
}

/* ---------- parties across the rooms ---------- */

// The party appointments at your home going on now (Tokyo's party: one per guest, two hours).
const partiesNow = (g: Save, at: number) => social(g).appts.filter(a => a.kind === 'party' && a.place === playerHomeId && livePlan(a) && a.from <= at && at < a.to);
// During a party at home, the guests and everyone who lives there spread over the rooms for fun or food (leisure, food),
// one each, changing every hour; bedrooms stay out (unless with you, which comes first).
partyRooms.push((g, w, r, x) => {
    if (x.loc !== playerHomeId) return null;
    const live = partiesNow(g, x.at);
    if (!live.length || (!live.some(a => a.avatar === r.avatar) && homeIdOf(r) !== playerHomeId)) return null;
    const fun = x.rooms.filter(o => !o.bed && o.tags.some(t => t === 'leisure' || t === 'food'));
    return fun.length ? fun[Math.floor(H(`${r.avatar}|${Math.floor(x.at / 60)}`) * fun.length)].id : null;
});
/** For the AI, during a party at a home with rooms: it's on all over the home, and who is where. */
export function partyRoomsLine(g: Save, w: WorldDef): string {
    const room = roomNow(g, w);
    if (!room || g.player.loc !== playerHomeId || !partiesNow(g, nowAbs(g)).length) return '';
    const by = new Map<string, string[]>();
    for (const x of elsewhereHere(g, w)) if (!x.room.bed) by.set(x.room.name, [...(by.get(x.room.name) ?? []), x.r.name]);
    const where = [...by].map(([n, names]) => `${names.join(' and ')} in the ${n.toLowerCase()}`).join('; ');
    return `A party is on all over {{user}}'s home: people move between the rooms, and the ${room.name.toLowerCase()} is only part of it${where ? ` (elsewhere: ${where})` : ''}.`;
}
