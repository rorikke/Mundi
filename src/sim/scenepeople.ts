// What the AI is told about the people in a scene besides the relationship blocks: the life around you (staff,
// regulars, passers-by it may describe, E1) and short sheets for the world's people who are here but not speaking
// (E27). Worlds without `staff`, `scene` or `look`/`voice` are told what they were.
import type { Save, Resident } from '../core/store.js';
import { systemOn, type WorldDef, type Place } from '../core/world.js';
import { crowdLevel } from './worldstate.js';
import { exampleOf } from './dayplan.js';
import { companions } from './social.js';
import { fr, ro, YOU } from './rel.js';
import { isHome } from './places.js';

/* ---------- life around you (E1) ---------- */

// A place with its own `staff`, or any place in a world that says so (`scene.background`), with the living world on.
// Homes have no background people.
export const backgroundOn = (w: WorldDef, here: (Place & { home?: boolean }) | null) =>
    !!here && !here.home && !isHome(here.id) && systemOn(w, 'living') && !!(here.staff?.trim() || w.scene?.background);
const CROWD_NOW = ['hardly anyone else now', 'only a few others now', 'some people now', 'busy now', 'packed now'];
// Who's around besides the world's people, and how many of them now (what they may do is in the line about who is here,
// prompt.ts).
export function backgroundLine(g: Save, w: WorldDef, here: Place | null): string {
    if (!here || !backgroundOn(w, here)) return '';
    const lvl = crowdLevel(g, w, here.id);
    const who = here.staff?.trim().replace(/[.\s]+$/, '') || 'staff and other people of the place';
    return `Background: ${who}; ${CROWD_NOW[lvl] ?? CROWD_NOW[0]}.`;
}

/* ---------- who else is here (E27) ---------- */

export const SHEETS_MAX = 5;
// Cut at the last comma or semicolon before `max` characters (a clause stays whole).
function clip(s: string, max: number): string {
    const t = s.replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
    if (t.length <= max) return t;
    const cut = Math.max(t.lastIndexOf(',', max), t.lastIndexOf(';', max));
    return cut > max / 3 ? t.slice(0, cut) : `${t.slice(0, max).replace(/\s+\S*$/, '')}…`;
}
const hasSheet = (w: WorldDef, r: Resident) => { const ex = exampleOf(w, r); return !!(ex?.look?.trim() || ex?.voice?.trim()); };
// Who gets a sheet first: the people with you, the one you talk to alone, then the closest to you.
function sheetOrder(g: Save, present: Resident[]): Resident[] {
    const along = new Set(companions(g)), solo = String((g as any).social?.solo ?? '');
    const rank = (r: Resident) => (along.has(r.avatar) ? 2000 : 0) + (r.avatar === solo ? 1000 : 0) + (r.met ? 500 : 0) + fr(g, r.avatar, YOU) + ro(g, r.avatar, YOU) / 2;
    return [...present].sort((a, b) => rank(b) - rank(a));
}
/** The world's people present who get a short sheet (looks and voice), at most SHEETS_MAX. */
export function sheetPeople(g: Save, w: WorldDef, present: Resident[]): Resident[] {
    return sheetOrder(g, present.filter(r => hasSheet(w, r))).slice(0, SHEETS_MAX);
}
// One line per person, about 25 tokens: looks and voice (why they're here is in the focus block, whyHereLines).
export function castSheet(w: WorldDef, r: Resident): string {
    const ex = exampleOf(w, r);
    const look = ex?.look ? clip(ex.look, 70) : '', voice = ex?.voice ? clip(ex.voice, 42) : '';
    const low = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
    return `- ${r.name}: ${[look && low(look), voice ? `voice ${low(voice)}` : ''].filter(Boolean).join('; ')}.`;
}
