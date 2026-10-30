// A scenario's house party: no plans or dates out (one house), but you can throw a party at home. While it lasts the
// housemates leave their routines (and their bedrooms) and spread over the common rooms: living room, kitchen, pool…
import { nowAbs, type Save } from '../core/store.js';
import { isScenario, type WorldDef } from '../core/world.js';
import { roomsOn, extraRooms } from './places.js';
import { note } from './facts.js';
import { charOf } from '../st/bridge.js';

// guests: people from outside the house invited to it (they come when it starts and go home when it ends, see guests.ts);
// out: a party out of the house (a place in your words, a background, and who of the house comes along).
export interface HouseParty { from: number; until: number; title?: string; guests?: string[]; came?: boolean; out?: { place: string; bg?: string; people: string[] } }
export const PARTY_HOURS = 4;
export const houseParty = (g: Save): HouseParty | null => (g as any).houseParty ?? null;
export const partyNow = (g: Save, w: WorldDef, at = nowAbs(g)) => { const p = houseParty(g); return !!p && isScenario(w) && at >= p.from && at < p.until; };

// The rooms where a party happens: the ones of this game for free time or food (not chores, not the bedrooms).
export function partyRooms(g: Save, w: WorldDef): string[] {
    const on = new Set(roomsOn(g, w));
    const fun = (p: { tags?: string[] }) => (p.tags ?? []).some(t => t === 'leisure' || t === 'food');
    return [...w.places.filter(p => on.has(p.id) && !p.link && fun(p)).map(p => p.id), ...extraRooms(g).filter(fun).map(p => p.id)];
}
// Where a housemate is during the party: one of the party rooms, changing every hour.
export function partySpot(g: Save, w: WorldDef, avatar: string, at = nowAbs(g)): string | null {
    if (!partyNow(g, w, at)) return null;
    // a party out of the house: who goes is out there (off-screen, until you join them); the others keep their day
    const o = houseParty(g)!.out;
    if (o) return o.people.includes(avatar) || (houseParty(g)!.guests ?? []).includes(avatar) ? 'out' : null;
    const rooms = partyRooms(g, w); if (!rooms.length) return null;
    let h = Math.floor(at / 60) * 31;
    for (const c of avatar) h = (h * 33 + c.charCodeAt(0)) >>> 0;
    return rooms[h % rooms.length];
}
export function throwHouseParty(g: Save, w: WorldDef, from: number, title = '', extra: { guests?: string[]; out?: { place: string; bg?: string; people: string[] } } = {}): string {
    if (!isScenario(w)) return 'Parties at home are for scenarios.';
    const cur = houseParty(g);
    if (cur && cur.until > nowAbs(g)) return 'A party is already planned.';
    const out = extra.out && extra.out.place.trim() ? { place: extra.out.place.trim().slice(0, 80), ...(extra.out.bg ? { bg: extra.out.bg } : {}), people: [...new Set(extra.out.people)] } : undefined;
    const guests = [...new Set(extra.guests ?? [])].filter(a => !g.cast[a]);
    (g as any).houseParty = { from, until: from + PARTY_HOURS * 60, ...(title.trim() ? { title: title.trim().slice(0, 80) } : {}), ...(guests.length ? { guests } : {}), ...(out ? { out } : {}) } satisfies HouseParty;
    const t = title.trim();
    note(g, out ? (t ? '{u} is throwing a party at {1}: "{0}".' : '{u} is throwing a party at {1}.') : (t ? '{u} is throwing a house party: "{0}".' : '{u} is throwing a house party.'), [t, out?.place ?? ''], [], g.player.loc, 'event');
    return '';
}
export const cancelHouseParty = (g: Save) => { delete (g as any).houseParty; };
export function partyLine(g: Save, w: WorldDef): string {
    const p = houseParty(g); if (!p || !isScenario(w)) return '';
    const now = nowAbs(g);
    const guests = (p.guests ?? []).map(a => g.cast[a]?.name ?? String(charOf(a)?.name ?? '')).filter(Boolean);
    const who = guests.length ? ` Guests from outside the house: ${guests.join(', ')}.` : '';
    if (p.out) {
        if (now >= p.from && now < p.until) return `{{user}}'s party${p.title ? ` ("${p.title}")` : ''} is going on out of the house, at ${p.out.place}.${who}`;
        if (now < p.from && p.from - now < 1440) return `{{user}} is throwing a party later today${p.title ? ` ("${p.title}")` : ''}, out of the house at ${p.out.place}; the people invited know.${who}`;
        return '';
    }
    if (now >= p.from && now < p.until) return `A house party is going on${p.title ? ` ("${p.title}")` : ''}: the housemates are out of their rooms, all over the living spaces, music on, drinks out.${who}`;
    if (now < p.from && p.from - now < 1440) return `{{user}} is throwing a house party later today${p.title ? ` ("${p.title}")` : ''}; everyone in the house knows.${who}`;
    return '';
}
