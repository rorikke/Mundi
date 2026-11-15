// The collection's world data made safe (halls, groups and slots from someone else's file) and its fixed numbers.
// The format is in core/world.ts (WorldCollection); what plays it is sim/collection.ts.
import type { WorldCollection, HallDef, SlotDef, PieceSource } from './world.js';
import { safeUrl } from './safe.js';

/** A keepsake kind gets a record slot only when this game can have at least this many of it. */
export const MIN_KIND = 3;
const ID = /^[a-z0-9_]+$/;
const SOURCE_KINDS = ['find', 'sold', 'dealer', 'auction', 'festival', 'ending', 'milestone', 'story', 'dig'];
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : undefined);
const when = (v: unknown) => (typeof v === 'string' || (v && typeof v === 'object' && !Array.isArray(v)) ? v as any : undefined);

function hall(h: any): HallDef | null {
    if (!h || typeof h !== 'object' || !ID.test(h.id ?? '') || !str(h.name)) return null;
    const groups = (Array.isArray(h.groups) ? h.groups : []).filter((x: any) => x && ID.test(x.id ?? '') && str(x.name))
        .map((x: any) => ({ id: x.id, name: x.name, ...(str(x.icon) ? { icon: x.icon } : {}) }));
    if (!groups.length) return null;
    const out: HallDef = { id: h.id, name: h.name, groups };
    for (const k of ['icon', 'desc'] as const) if (str(h[k])) out[k] = h[k];
    if (h.record === true) out.record = true;
    if (h.adult === true) out.adult = true;
    const needs = strs(h.needs); if (needs?.length) out.needs = needs as any;
    if (when(h.open)) out.open = h.open;
    return out;
}
function source(s: any): PieceSource | null {
    if (!s || typeof s !== 'object' || !SOURCE_KINDS.includes(s.kind)) return null;
    const out: PieceSource = { kind: s.kind };
    const at = strs(s.at); if (at?.length) out.at = at;
    for (const k of ['action', 'id'] as const) if (str(s[k])) out[k] = s[k];
    if (when(s.when)) out.when = s.when;
    if (typeof s.chance === 'number' && isFinite(s.chance)) out.chance = Math.max(0, Math.min(1, s.chance));
    if (typeof s.price === 'number' && isFinite(s.price)) out.price = Math.max(0, Math.round(s.price));
    return out;
}
function slot(s: any, halls: Map<string, HallDef>): SlotDef | null {
    if (!s || typeof s !== 'object' || !ID.test(s.id ?? '') || !str(s.name)) return null;
    const h = halls.get(s.hall);
    if (!h || !h.groups.some(g => g.id === s.group)) return null;
    const out: SlotDef = { id: s.id, hall: s.hall, group: s.group, name: s.name };
    for (const k of ['icon', 'who', 'hint', 'needsUpgrade'] as const) if (str(s[k])) out[k] = s[k];
    if (s.adult === true) out.adult = true;
    const needs = strs(s.needs); if (needs?.length) out.needs = needs as any;
    const starts = strs(s.starts); if (starts?.length) out.starts = starts;
    if (when(s.when)) out.when = s.when;
    if (s.plaques && typeof s.plaques === 'object' && !Array.isArray(s.plaques)) {
        const p = Object.fromEntries(Object.entries(s.plaques).filter(([, v]) => typeof v === 'string' && v.trim())) as Record<string, string>;
        if (Object.keys(p).length) out.plaques = p;
    }
    const pic = str(s.pic) && safeUrl(s.pic); if (pic) out.pic = pic;
    if (Array.isArray(s.sources)) { const list = s.sources.map(source).filter(Boolean) as PieceSource[]; if (list.length) out.sources = list; }
    if (typeof s.price === 'number' && isFinite(s.price)) out.price = Math.max(0, Math.round(s.price));
    const parts = strs(s.parts)?.filter(x => ID.test(x)); if (parts?.length) out.parts = parts;
    return out;
}
/** A world's collection made safe: unknown halls and groups dropped with their slots, ids `[a-z0-9_]` and unique,
 *  numbers held to their range. Nothing (undefined) when there's no hall left: the world gets no key. */
export function upgradeCollection(c: unknown): WorldCollection | undefined {
    if (!c || typeof c !== 'object') return undefined;
    const raw = c as any, halls = new Map<string, HallDef>();
    for (const h of Array.isArray(raw.halls) ? raw.halls : []) { const x = hall(h); if (x && !halls.has(x.id)) halls.set(x.id, x); }
    if (!halls.size) return undefined;
    const seen = new Set<string>(), slots: SlotDef[] = [];
    for (const s of Array.isArray(raw.slots) ? raw.slots : []) { const x = slot(s, halls); if (x && !seen.has(x.id)) { seen.add(x.id); slots.push(x); } }
    const out: WorldCollection = { halls: [...halls.values()], slots };
    if (typeof raw.minKind === 'number' && isFinite(raw.minKind)) out.minKind = Math.max(1, Math.min(10, Math.round(raw.minKind)));
    return out;
}
