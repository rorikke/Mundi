// Places: the world's public places plus homes (the player's and each resident's). Distances and travel time.
import { travelFactor } from './life.js';
import { cfg, type Save } from '../core/store.js';
import { isScenario, systemOn, type WorldDef, type Place } from '../core/world.js';
import { effectMul } from './effects.js';
import { housingOn, ownsFixtureIn, secondHome, SECOND_HOME_ID } from './housing.js';
import { placeGates } from './hooks.js';

export const playerHomeId = 'home:player';
export const isHome = (id: string) => id.startsWith('home:');
// "North Suburbs, House 4": every home spot of the map has a fixed number.
// The kind of home is named by the world (Apartment, House / Cottage, Manor…).
export const homeKindName = (w: WorldDef, kind: string) => w.homes.kinds[kind]?.name ?? (kind === 'house' ? 'House' : 'Apartment');
export function homeAddress(w: WorldDef, h: { zone: string; x: number; y: number; n?: number; kind?: string; unit?: number }) {
    const zone = w.homes.zones.find(z => z.id === h.zone);
    if (!zone) return '';
    const n = h.n ?? (zone.spots.findIndex(s => s[0] === h.x && s[1] === h.y) + 1);
    return `${zone.name}, ${homeKindName(w, h.kind ?? zone.kind)} ${n || 1}${h.unit ? String.fromCharCode(65 + h.unit) : ''}`;
}

/** The kind of home a home's place is (yours, your second home, a resident's), '' for any other place. */
export function homeKindAt(g: Save, w: WorldDef, id: string): string {
    if (id === playerHomeId) return g.player.home.kind;
    if (id === SECOND_HOME_ID) { const s = secondHome(g); return (s && w.homes.zones.find(z => z.id === s.zone)?.kind) ?? ''; }
    if (!isHome(id)) return '';
    const zone = g.cast[id.slice(5)]?.home.zone ?? (g as any).vacated?.home?.zone;
    return w.homes.zones.find(z => z.id === zone)?.kind ?? '';
}
/** The area (zone id) a home's place is in, by the same branches as homeKindAt; '' for any other place. */
export function homeZoneAt(g: Save, w: WorldDef, id: string): string {
    if (id === playerHomeId) return g.player.home.zone;
    if (id === SECOND_HOME_ID) return secondHome(g)?.zone ?? '';
    if (!isHome(id)) return '';
    return g.cast[id.slice(5)]?.home.zone ?? (g as any).vacated?.home?.zone ?? '';
}
// (housing) Your second home: on the map while you have one (and the system is on).
function secondPlace(g: Save, w: WorldDef): (Place & { home?: boolean }) | null {
    const s = housingOn(w) ? secondHome(g) : undefined;
    const zone = s && w.homes.zones.find(z => z.id === s.zone);
    if (!s || !zone) return null;
    return { id: SECOND_HOME_ID, name: 'My second home', map: zone.map, x: s.x, y: s.y, tags: ['home'], desc: `${homeAddress(w, s)}: ${w.homes.kinds[zone.kind]?.desc ?? ''}`, home: true };
}
export function placeOf(g: Save, w: WorldDef, id: string): (Place & { home?: boolean; owner?: string }) | null {
    if (id === SECOND_HOME_ID) return secondPlace(g, w);
    if (id === playerHomeId) {
        const h = g.player.home, kind = w.homes.kinds[h.kind];
        const zone = w.homes.zones.find(z => z.id === h.zone);
        return { id, name: 'My home', map: zone?.map ?? w.maps[0].id, x: h.x, y: h.y, tags: ['home'], desc: `${homeAddress(w, h)}: ${kind?.desc ?? ''}`, home: true };
    }
    if (isHome(id)) {
        const r = g.cast[id.slice(5)];
        if (!r) {
            // a guest who just left the room you are in (you said goodbye there): it stays, empty, until you walk out
            const v = (g as any).vacated as { id: string; home: { zone: string; x: number; y: number } } | undefined;
            if (!v || v.id !== id || g.player.loc !== id) return null;
            const zone = w.homes.zones.find(z => z.id === v.home.zone);
            return { id, name: 'Empty bedroom', map: zone?.map ?? w.maps[0].id, x: v.home.x, y: v.home.y, tags: ['home'], desc: zone?.desc ?? '', home: true };
        }
        // someone who lives with another person is at that person's home (or yours)
        const w2 = (r as any).homeWith as string | undefined;
        if (w2 === '__you') return placeOf(g, w, playerHomeId);
        if (w2 && w2 !== r.avatar && g.cast[w2]) return placeOf(g, w, `home:${w2}`);
        const zone = w.homes.zones.find(z => z.id === r.home.zone);
        const mates = Object.values(g.cast).filter(x => x.home.zone === r.home.zone && x.home.x === r.home.x && x.home.y === r.home.y && (x.home.unit ?? 0) === (r.home.unit ?? 0) && (x.met || x === r)).map(x => x.name);
        const label = mates.length <= 1 ? r.name : mates.length === 2 ? `${mates[0]} & ${mates[1]}` : `${r.name} & family`;
        return { id, name: `${label}'s home`, map: zone?.map ?? w.maps[0].id, x: r.home.x, y: r.home.y, tags: ['home'], desc: `${homeAddress(w, r.home)}: ${zone?.desc ?? ''}`, home: true, owner: r.avatar };
    }
    if (isOuting(id)) return { id, name: outingName(id), map: w.maps[0]?.id ?? '', x: 50, y: 50, tags: ['outing'], desc: `out of the house: ${outingName(id)}` };
    const p = w.places.find(x => x.id === id);
    // (business) a unit you lease goes by the name you gave your café
    const named = p?.venture ? ((g as any)?.ventures?.list ?? []).find((v: any) => v && !v.closed && v.name && (v.place === id || (v.places ?? []).includes(id) || (v.opened ?? []).includes(id))) : null;
    if (named) return { ...p!, name: named.name };
    return p ?? extraRooms(g).find(x => x.id === id) ?? null;
}
// The map a place is on: the same answer as placeOf(…)?.map without building a home's name (asked very often: the
// region of everyone's home, every time someone's day is worked out).
export function mapOf(g: Save, w: WorldDef, id: string): string | undefined {
    if (id === playerHomeId) return w.homes.zones.find(z => z.id === g.player.home.zone)?.map ?? w.maps[0].id;
    if (id === SECOND_HOME_ID) return secondPlace(g, w)?.map;
    if (isHome(id)) {
        const r = g.cast[id.slice(5)];
        if (!r) return undefined;
        const w2 = (r as any).homeWith as string | undefined;
        if (w2 === '__you') return mapOf(g, w, playerHomeId);
        if (w2 && w2 !== r.avatar && g.cast[w2]) return mapOf(g, w, `home:${w2}`);
        return w.homes.zones.find(z => z.id === r.home.zone)?.map ?? w.maps[0].id;
    }
    if (isOuting(id)) return w.maps[0]?.id ?? '';
    return (w.places.find(p => p.id === id) ?? extraRooms(g).find(p => p.id === id))?.map;
}
/** Home: a place out of the house, named by the player ("out:the beach"). Going out, or a plan made somewhere out. */
export const OUTING = 'out:';
export const isOuting = (id: string | null | undefined) => !!id && id.startsWith(OUTING);
export const outingName = (id: string) => id.slice(OUTING.length);
export const outingId = (name: string) => `${OUTING}${name.trim().replace(/\s+/g, ' ').slice(0, 80)}`;
/** A scenario: rooms the player added for this game (a name, a picture, what it is for). */
export const extraRooms = (g: Save | null | undefined): Place[] => ((g as any)?.cfg?.extraRooms ?? []) as Place[];

// Every point on the map: public places, your home, and the homes of people you know.
// A scenario's rooms are chosen per game (cfg.rooms); without a choice, every room but those off by default.
// A room the Home got after the game began (an update of the world) is on, unless it is off by default.
export const roomsOn = (g: Save | null | undefined, w: WorldDef): string[] => {
    const own = (g as any)?.cfg?.rooms as string[] | undefined;
    const seen = (g as any)?.cfg?.roomsSeen as string[] | undefined;
    const fresh = own && seen ? w.places.filter(p => !p.scenarioOff && !p.link && !seen.includes(p.id) && !own.includes(p.id)).map(p => p.id) : [];
    return [...(own ?? w.places.filter(p => !p.scenarioOff && !p.link).map(p => p.id)), ...fresh, ...extraRooms(g).map(p => p.id)];
};
export const placeOn = (g: Save | null | undefined, w: WorldDef, id: string) => ventureHere(g, w, id) && roomHere(g, w, id) && (!isScenario(w) || !w.places.some(p => p.id === id) || roomsOn(g, w).includes(id)) && placeGates.every(f => f(g, w, id));
// (housing) A room of a home (the penthouse's terrace, the villa's bath: `Place.room`) is in the game only while a home
// of yours in its zone has that fixture, with the system on.
const roomKept = new WeakMap<WorldDef, { list: unknown; n: number; ids: Map<string, { room: string; home: string }> }>();
function roomPlaces(w: WorldDef) {
    let k = roomKept.get(w);
    if (!k || k.list !== w.places || k.n !== w.places.length) roomKept.set(w, k = { list: w.places, n: w.places.length, ids: new Map(w.places.filter(p => p.room).map(p => [p.id, { room: p.room!, home: p.homeZone ?? '' }])) });
    return k.ids;
}
function roomHere(g: Save | null | undefined, w: WorldDef, id: string): boolean {
    const r = roomPlaces(w).get(id);
    if (!r) return true;
    return !!g && housingOn(w) && ownsFixtureIn(g, r.home, r.room);
}
// (business) A venture's own place (a café unit you lease) is in the game only while that venture is yours and runs
// there (`g.ventures`, kept by sim/ventures.ts, read here so this file needs no venture code).
const ventureKept = new WeakMap<WorldDef, { list: unknown; n: number; ids: Map<string, string> }>();
export function venturePlaces(w: WorldDef): Map<string, string> {
    let k = ventureKept.get(w);
    if (!k || k.list !== w.places || k.n !== w.places.length) ventureKept.set(w, k = { list: w.places, n: w.places.length, ids: new Map(w.places.filter(p => p.venture).map(p => [p.id, p.venture!])) });
    return k.ids;
}
function ventureHere(g: Save | null | undefined, w: WorldDef, id: string): boolean {
    const v = venturePlaces(w).get(id);
    if (!v) return true;
    if (!systemOn(w, 'business')) return false;
    return ((g as any)?.ventures?.list ?? []).some((s: any) => s && !s.closed && (s.place === id || (s.places ?? []).includes(id) || (s.opened ?? []).includes(id)));
}
export function pins(g: Save, w: WorldDef) {
    const out: (Place & { home?: boolean; owner?: string })[] = [...w.places.filter(p => placeOn(g, w, p.id)), ...(isScenario(w) ? extraRooms(g) : [])];
    const mine = placeOf(g, w, playerHomeId);
    if (mine) out.push(mine);
    const second = secondPlace(g, w);
    if (second) out.push(second);
    // (a guest with no bedroom of their own, zone '__guest', has no room to show)
    for (const r of Object.values(g.cast)) if (r.met && r.home.zone !== '__guest') { const p = placeOf(g, w, `home:${r.avatar}`); if (p && !out.some(x => x.id === p.id)) out.push(p); }
    return out;
}

// Travel time, rounded to the world's steps (15, 20, 30…), so the clock stays readable. Between maps (two cities
// on a region map), the trip goes through the link pins on the bigger map.
// Travel takes a fixed time: 30 minutes inside a town (a local map, or its own `local`), 2 hours between towns or across a region map
// (a map that other maps hang from), 10 hours between realms (in a world of realms: a top map whose maps have towns
// of their own, like the Three Crowns). A district or a village with its own `trip` takes that long from the town.
// (E4) A town of districts on a rail map (`town` with `minutesPerUnit`): a trip between two districts takes the train's
// time for the distance between their pins, plus the walk to the station (`transit.walk`); a getaway, its `trip`.
// The world's "travel" rule (advanced settings) scales them all.
export const LOCAL_TRIP = 30, GLOBAL_TRIP = 120, REALM_TRIP = 600;
// The realm a map belongs to: the map right under the top one, when it has maps of its own ('' otherwise).
export function realmOf(w: WorldDef, mapId?: string): string {
    let m = w.maps.find(x => x.id === mapId);
    for (let i = 0; m && m.parent && i < 10; i++) {
        const up = w.maps.find(x => x.id === m!.parent);
        if (!up) break;
        if (!up.parent) return w.maps.some(x => x.parent === m!.id) ? m.id : '';
        m = up;
    }
    return '';
}
export function travelMinutes(g: Save, w: WorldDef, from: string, to: string): number {
    if (from === to) return 0;
    if (isScenario(w)) return 0;   // Home: from one room to another takes no time
    if (sameHome(g, w, from, to)) return ROOM_TRIP;   // (housing) a room of your home and the home: a few steps
    // (what effects take off: life goals' perks, boosts)
    return Math.max(5, Math.round(tripMinutes(g, w, from, to) * (cfg(g).travel ?? 1) * travelFactor(g, w) * effectMul(g, w, 'travel') / 5) * 5);
}
/** (housing) From a home of yours to one of its rooms (the terrace, the bath), or between two of its rooms. */
export const ROOM_TRIP = 2;
function sameHome(g: Save, w: WorldDef, a: string, b: string): boolean {
    const zoneAt = (id: string) => {
        if (id === playerHomeId) return g.player.home.zone;
        if (id === SECOND_HOME_ID) return secondHome(g)?.zone;
        const p = roomPlaces(w).get(id);
        return p ? p.home : undefined;
    };
    if (!roomPlaces(w).has(a) && !roomPlaces(w).has(b)) return false;
    const za = zoneAt(a);
    return !!za && za === zoneAt(b);
}
/** The world's own time for a trip (minutes), before the "travel" rule and what you own (a car) change it. */
export function tripMinutes(g: Save, w: WorldDef, from: string, to: string): number {
    if (from === to || isScenario(w)) return 0;
    const a = placeOf(g, w, from), b = placeOf(g, w, to);
    const isRegion = (mapId?: string) => !!mapId && w.maps.some(m => m.parent === mapId) && !w.maps.find(m => m.id === mapId)?.town;
    const local = !!a && !!b && a.map === b.map && !isRegion(a.map);
    // districts and nearby villages: their own trip time to the town they hang from (siblings: the longer of the two)
    if (a && b && a.map !== b.map) {
        const ma = w.maps.find(m => m.id === a.map), mb = w.maps.find(m => m.id === b.map);
        const near = ma && mb && (ma.parent === mb.id || mb.parent === ma.id || (!!ma.parent && ma.parent === mb.parent));
        const t = near ? Math.max(ma.parent === mb.id || ma.parent === mb.parent ? ma.trip ?? 0 : 0, mb.parent === ma.id || ma.parent === mb.parent ? mb.trip ?? 0 : 0) : 0;
        if (t) return t;
        const rail = near ? railMinutes(w, a, b) : 0;
        if (rail) return rail;
    }
    const ra = realmOf(w, a?.map), rb = realmOf(w, b?.map);
    if (ra && rb && ra !== rb) return REALM_TRIP;
    return local ? (w.maps.find(m => m.id === a!.map)?.local ?? LOCAL_TRIP) : GLOBAL_TRIP;
}
// (E4) By train between two districts of a town on a rail map: the distance between their pins on it (a district's
// link pin, or the place's own pin when it's on the town's map) × its minutes per unit, plus the walk to the station.
// 0 when the town has no speed of its own.
function railMinutes(w: WorldDef, a: Place, b: Place): number {
    const ma = w.maps.find(m => m.id === a.map), mb = w.maps.find(m => m.id === b.map);
    const town = ma?.parent === mb?.id ? mb : mb?.parent === ma?.id ? ma : w.maps.find(m => m.id === ma?.parent);
    if (!town?.town || !(Number(town.minutesPerUnit) > 0)) return 0;
    const pin = (p: Place) => (p.map === town.id ? p : w.places.find(x => x.map === town.id && x.link === p.map));
    const pa = pin(a), pb = pin(b);
    if (!pa || !pb) return 0;
    const d = Math.hypot(pa.x - pb.x, (pa.y - pb.y) / (town.ratio || 1));
    return d * Number(town.minutesPerUnit) + (w.transit?.walk ?? 0);
}
