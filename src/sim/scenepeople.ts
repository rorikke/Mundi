// What the AI is told about the people in a scene besides the relationship blocks: the life around you (staff,
// regulars, passers-by it may describe, E1), short sheets for the world's people who are here but not speaking (E27),
// and how people address you as you get closer (E8). Worlds without `staff`, `scene`, `look`/`voice` or `address` are
// told what they were.
import type { Save, Resident } from '../core/store.js';
import { systemOn, type WorldDef, type Place } from '../core/world.js';
import { crowdLevel } from './worldstate.js';
import { exampleOf } from './dayplan.js';
import { companions } from './social.js';
import { fr, ro, statusOf, YOU } from './rel.js';
import { friendTier, INTEREST, CRUSH, INFATUATED } from './romance.js';
import { isHome } from './places.js';
import { jobDef, colleaguesOf } from './work.js';
import { npcRank } from './longlife.js';

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

/* ---------- how they address you (E8) ---------- */

const ROM_ORDER: [string, number][] = [['interest', INTEREST], ['crush', CRUSH], ['infatuated', INFATUATED]];
const list = (names: string[]) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

// The world's words for how someone addresses you: a couple's status (or a romance tier the world names), a senior or
// junior at work (until they're good friends), else their friendship level.
export function addressOf(g: Save, w: WorldDef, r: Resident): string {
    const ad = w.address; if (!ad) return '';
    const f = Math.round(fr(g, r.avatar, YOU)), love = systemOn(w, 'romance');
    const st = love ? statusOf(g, r.avatar, YOU) : null;
    if (st && ad.romance?.[st]) return ad.romance[st];
    const rt = love ? ROM_ORDER.filter(t => ro(g, r.avatar, YOU) >= t[1]).pop()?.[0] : undefined;
    if (rt && ad.romance?.[rt]) return ad.romance[rt];
    const tier = friendTier(f).id as keyof NonNullable<typeof ad.friend>;
    if (systemOn(w, 'jobs') && f < 55 && !st && (ad.senior || ad.junior)) {
        const j = g.player.job as { id: string; rank?: number } | null, o = jobDef(w, j?.id);
        if (j && o && colleaguesOf(g, w, o).includes(r)) {
            const theirs = npcRank(g, r.avatar), mine = j.rank ?? 0;
            if (theirs > mine && ad.senior) return ad.senior;
            if (theirs < mine && ad.junior) return ad.junior;
        }
    }
    return ad.friend?.[tier] ?? '';
}
/** For the romance block: how the people here (who know {{user}}) address {{user}}, grouped by the words (no names
 *  when they all do it the same way). */
export function addressLine(g: Save, w: WorldDef, met: Resident[]): string {
    if (!w.address) return '';
    const by = new Map<string, string[]>();
    for (const r of met) { const a = addressOf(g, w, r); if (a) by.set(a, [...(by.get(a) ?? []), r.name]); }
    if (!by.size) return '';
    if (by.size === 1) return `How they address {{user}}: ${[...by.keys()][0]}.`;
    return `How they address {{user}}: ${[...by].map(([a, names]) => `${list(names)} — ${a}`).join('; ')}.`;
}
