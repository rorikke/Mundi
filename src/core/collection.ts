// The collection's world data made safe (halls, groups and slots from someone else's file) and its fixed numbers.
// The format is in core/world.ts (WorldCollection); what plays it is sim/collection.ts.
import type { WorldCollection, HallDef, SlotDef, PieceSource, WorldDef, SystemId, VentureDef } from './world.js';
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

/** A plain record for a world, from its own data (the World creator's quick-add, and Tokyo's data script, which dresses
 *  it): a slot per storyline (the night world's mementos for adult people's), festival, city event, district (its
 *  street stories and its places), keepsake kind, your start's own life goal (a slot per start), five, ten and twenty
 *  goals, and each venture track at its top (one slot for every hotel kind, R-2). Names are plain; no emoji or plaques. */
export function draftRecord(w: WorldDef, { night = true } = {}): WorldCollection {
    const groups: [string, string][] = [['storylines', 'Storylines'], ['festivals', 'Festivals'], ['events', 'City events'], ['stories', 'District stories'],
        ['districts', 'Districts'], ['goals', 'Life goals'], ['ventures', 'Ventures'], ['keepsakes', 'Keepsakes']];
    const halls: HallDef[] = [{ id: 'memories', name: `${w.name} memories`, record: true, groups: groups.map(([id, name]) => ({ id, name })) }];
    const slots: SlotDef[] = [];
    const add = (s: SlotDef) => slots.push(s);
    const plainId = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    for (const e of w.cast?.examples ?? []) for (const t of e.threads ?? []) {
        const adult = !!t.adult || !!e.adult, first = e.name.split(/\s+/)[0];
        const base = { name: first, who: first, when: `thread: ${t.id}`, needs: ['living' as SystemId] };
        if (adult && night) add({ id: `nw_${plainId(first)}${(e.threads ?? []).filter(x => x.adult || e.adult).indexOf(t) > 0 ? `_${plainId(t.id)}` : ''}`, hall: 'night', group: 'mementos', adult: true, ...base });
        else add({ id: `mem_sl_${t.id}`, hall: 'memories', group: 'storylines', ...(adult ? { adult: true } : {}), ...base });
    }
    if (slots.some(s => s.hall === 'night')) halls.push({ id: 'night', name: 'The night world', adult: true, groups: [{ id: 'mementos', name: 'Mementos' }] });
    for (const f of w.festivals ?? []) add({ id: `mem_fe_${f.id}`, hall: 'memories', group: 'festivals', name: f.name, when: `attended: ${f.id}`, needs: ['festivals'] });
    for (const x of w.cityEvents ?? []) add({ id: `mem_ev_${x.id}`, hall: 'memories', group: 'events', name: x.name, ...(x.icon ? { icon: x.icon } : {}), when: `attended: ${x.id}`, needs: ['events'] });
    for (const m of w.maps ?? []) {
        if (!(w.places ?? []).some(p => p.map === m.id && !p.link && !String(p.id).startsWith('link_'))) continue;
        add({ id: `mem_ds_${m.id}`, hall: 'memories', group: 'stories', name: `Stories of ${m.name}`, when: `seen: all in ${m.id}` });
        add({ id: `mem_dk_${m.id}`, hall: 'memories', group: 'districts', name: `${m.name}, every corner`, when: `visited: all in ${m.id}` });
    }
    // your start's own goal (the one suggested first for it; any start may follow it, but this slot asks for its own)
    for (const st of w.starts ?? []) {
        const x = (w.goals?.add ?? []).find(gl => gl.starts?.includes(st.id));
        if (x) add({ id: `mem_go_start_${st.id}`, hall: 'memories', group: 'goals', name: "Your start's goal", starts: [st.id], when: `goal: ${x.id}`, needs: ['goals'] });
    }
    add({ id: 'mem_go_5', hall: 'memories', group: 'goals', name: 'Five life goals', when: 'goal: 5', needs: ['goals'] });
    add({ id: 'mem_go_10', hall: 'memories', group: 'goals', name: 'Ten life goals', when: 'goal: 10', needs: ['goals'] });
    // (CO-1: the long run showed every goal out of reach in six game years, so the top tier is twenty; `goal: all` stays
    // in the grammar for a world that wants it)
    add({ id: 'mem_go_20', hall: 'memories', group: 'goals', name: 'Twenty life goals', when: 'goal: 20', needs: ['goals'] });
    // one value per key (the grammar has `or` between values of one key): a kind and its top tier, or another
    const top = (list: VentureDef[]) => `venture: ${[...new Set(list.map(v => `${v.kind ?? v.track} tier ${v.tiers?.length ?? 1}`))].join(' or ')}`;
    const ven = w.ventures ?? [], kindOf = (v: VentureDef) => v.kind ?? v.track;
    const cafes = ven.filter(v => kindOf(v) === 'cafe'), execs = ven.filter(v => v.track === 'exec'), hotels = ven.filter(v => ['capsule', 'ryokan', 'lovehotel'].includes(String(v.kind)));
    if (cafes.length) add({ id: 'mem_vt_cafe', hall: 'memories', group: 'ventures', name: 'A café at its top', when: top(cafes), needs: ['business'] });
    if (execs.length) add({ id: 'mem_vt_exec', hall: 'memories', group: 'ventures', name: "An executive's floor at its top", when: top(execs), needs: ['business'] });
    if (hotels.length) add({ id: 'mem_vt_hotel', hall: 'memories', group: 'ventures', name: 'A hotel at its top', when: top(hotels), needs: ['business'] });
    for (const k of [...new Set((w.keepsakes ?? []).map(x => x.kind).filter((x): x is string => !!x))]) {
        add({ id: `mem_kk_${plainId(k)}`, hall: 'memories', group: 'keepsakes', name: k[0].toUpperCase() + k.slice(1), when: `had: all ${k}`, ...((w.keepsakes ?? []).filter(x => x.kind === k).every(x => x.adult) ? { adult: true } : {}) });
    }
    return { halls, slots };
}
/** What the quick-add would add to a world's collection: the draft's halls and slots it doesn't have yet (by id). */
export function missingFromRecord(w: WorldDef): { halls: HallDef[]; slots: SlotDef[] } {
    const d = draftRecord(w), c = w.collection;
    const halls = d.halls.filter(h => !(c?.halls ?? []).some(x => x.id === h.id));
    const slots = d.slots.filter(s => !(c?.slots ?? []).some(x => x.id === s.id));
    return { halls, slots };
}
