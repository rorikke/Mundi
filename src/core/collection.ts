// The collection's world data made safe (halls, groups and slots from someone else's file) and its fixed numbers.
// The format is in core/world.ts (WorldCollection); what plays it is sim/collection.ts.
import type { WorldCollection, HallDef, SlotDef, PieceSource, WorldDef, SystemId, VentureDef, MuseumDef, MuseumUpgrade, DigDef } from './world.js';
import { safeUrl } from './safe.js';
import { upgradeRival } from './rival.js';   // (C-7) the dealer's and the rival's names, the loans
import { upgradeRoyalties } from './royalties.js';   // (R-b) the museum's royalties

/** A keepsake kind gets a record slot only when this game can have at least this many of it. */
export const MIN_KIND = 3;
const ID = /^[a-z0-9_]+$/;
const SOURCE_KINDS = ['find', 'sold', 'dealer', 'auction', 'festival', 'ending', 'milestone', 'story', 'replica', 'dig'];
const UPGRADE_DOES = ['climate', 'security', 'guard', 'workshop', 'reading', 'exhibition'];
/** (museum) The most a world's museum price may be (a world's own numbers stay inside it). */
export const MUSEUM_PRICE_MAX = 100_000_000;
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
    if (h.record === true && h.apart === true) out.apart = true;   // (a record hall's: a display hall is the museum's)
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
    if (typeof s.damaged === 'number' && isFinite(s.damaged)) out.damaged = Math.max(0, Math.min(1, s.damaged));
    return out;
}
function slot(s: any, halls: Map<string, HallDef>): SlotDef | null {
    if (!s || typeof s !== 'object' || !ID.test(s.id ?? '') || !str(s.name)) return null;
    const h = halls.get(s.hall);
    if (!h || !h.groups.some(g => g.id === s.group)) return null;
    const out: SlotDef = { id: s.id, hall: s.hall, group: s.group, name: s.name };
    for (const k of ['icon', 'who', 'hint', 'needsUpgrade', 'plaque'] as const) if (str(s[k])) out[k] = s[k];
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
    const parts = strs(s.parts)?.filter(x => ID.test(x)); if (parts?.length) out.parts = [...new Set(parts)];
    // (nature) a piece of parts: put together for a price in days; a picture per part it has
    if (out.parts && s.mount && typeof s.mount === 'object') {
        const price = numIn(s.mount.price, 0, MUSEUM_PRICE_MAX), days = numIn(s.mount.days, 1, 60);
        if (price !== undefined && days !== undefined) out.mount = { price, days };
    }
    if (out.parts && s.partPics && typeof s.partPics === 'object' && !Array.isArray(s.partPics)) {
        const pics = Object.fromEntries(out.parts.map(x => [x, str(s.partPics[x]) && safeUrl(s.partPics[x])]).filter(([, v]) => v)) as Record<string, string>;
        if (Object.keys(pics).length) out.partPics = pics;
    }
    if (s.bonus === true) out.bonus = true;
    return out;
}
// (museum) A number from someone else's file held to a range; not a number: nothing.
const numIn = (v: unknown, lo: number, hi: number, round = true) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, round ? Math.round(v) : v)) : undefined);
const pair = (v: unknown, lo: number, hi: number, round = true): [number, number] | undefined => {
    if (!Array.isArray(v) || v.length !== 2) return undefined;
    const a = numIn(v[0], lo, hi, round), b = numIn(v[1], lo, hi, round);
    return a === undefined || b === undefined ? undefined : [Math.min(a, b), Math.max(a, b)];
};
function upgrade(u: any, halls: Map<string, HallDef>): MuseumUpgrade | null {
    if (!u || typeof u !== 'object' || !ID.test(u.id ?? '') || !str(u.name)) return null;
    const out: MuseumUpgrade = { id: u.id, name: u.name, price: numIn(u.price, 0, MUSEUM_PRICE_MAX) ?? 0 };
    for (const k of ['icon', 'desc'] as const) if (str(u[k])) out[k] = u[k];
    const renown = numIn(u.renown, 0, 1000); if (renown) out.renown = renown;
    if (str(u.opens) && halls.has(u.opens)) out.opens = u.opens;
    const needs = strs(u.needs)?.filter(x => ID.test(x)); if (needs?.length) out.needs = needs;
    if (UPGRADE_DOES.includes(u.does)) out.does = u.does;
    if (when(u.when)) out.when = u.when;
    if (u.adult === true) out.adult = true;
    return out;
}
/** (museum) A world's museum made safe: a place, a name and an offer with a condition (else none), upgrades with unique
 *  ids (a `needs` naming no upgrade dropped), numbers held to their ranges, a dealer, sales or shows only when whole. */
function museum(m: any, halls: Map<string, HallDef>): MuseumDef | undefined {
    if (!m || typeof m !== 'object' || !str(m.place) || !str(m.name) || !m.offer || typeof m.offer !== 'object' || !when(m.offer.when)) return undefined;
    const ups: MuseumUpgrade[] = [], ids = new Set<string>();
    for (const u of Array.isArray(m.upgrades) ? m.upgrades : []) { const x = upgrade(u, halls); if (x && !ids.has(x.id)) { ids.add(x.id); ups.push(x); } }
    for (const u of ups) if (u.needs) { u.needs = u.needs.filter(n => ids.has(n) && n !== u.id); if (!u.needs.length) delete u.needs; }
    const out: MuseumDef = { place: m.place, name: m.name, offer: { when: m.offer.when, price: numIn(m.offer.price, 0, MUSEUM_PRICE_MAX) ?? 0 }, upgrades: ups };
    const cases = numIn(m.cases, 0, 50); if (cases !== undefined) out.cases = cases;
    const room = numIn(m.room, 0, 200); if (room !== undefined) out.room = room;
    for (const k of ['curator', 'curatorJob'] as const) if (str(m[k])) out[k] = m[k];
    if (m.eye && typeof m.eye === 'object' && when(m.eye.when)) { const d = numIn(m.eye.damaged, 0, 1, false); if (d !== undefined) out.eye = { when: m.eye.when, damaged: d }; }
    if (m.renown && typeof m.renown === 'object') {
        const levels = (Array.isArray(m.renown.levels) ? m.renown.levels : []).filter((l: any) => l && str(l.name) && numIn(l.at, 0, 1e6) !== undefined)
            .map((l: any) => ({ at: numIn(l.at, 0, 1e6)!, name: l.name as string })).sort((a: { at: number }, b: { at: number }) => a.at - b.at);
        const r: NonNullable<MuseumDef['renown']> = { levels };
        if (Array.isArray(m.renown.rung)) { const rung = m.renown.rung.slice(0, 6).map((v: unknown) => numIn(v, 0, 100) ?? 0); if (rung.length) r.rung = rung; }
        const income = numIn(m.renown.income, 0, 100_000); if (income !== undefined) r.income = income;
        out.renown = r;
    }
    if (m.dealer && typeof m.dealer === 'object') {
        const d = m.dealer, every = numIn(d.every, 1, 112), stock = numIn(d.stock, 1, 12), pity = numIn(d.pity, 1, 100);
        if (every && stock && pity) {
            const x: NonNullable<MuseumDef['dealer']> = { every, stock, pity };
            const more = pair(d.more, 0, 100); if (more) x.more = more;
            const ask = numIn(d.ask, 0, 5, false); if (ask !== undefined) x.ask = ask;
            const late = numIn(d.late, 0, 5, false); if (late !== undefined) x.late = late;
            out.dealer = x;
        }
    }
    if (m.auctions && typeof m.auctions === 'object' && str(m.auctions.place)) {
        const a = m.auctions, days = (Array.isArray(a.days) ? a.days : []).map((v: unknown) => numIn(v, 1, 365)).filter((v: number | undefined): v is number => !!v);
        const lots = numIn(a.lots, 1, 20), from = numIn(a.from, 0, 23.99, false);
        if (days.length && lots && from !== undefined) {
            const x: NonNullable<MuseumDef['auctions']> = { place: a.place, days, from, lots };
            const more = pair(a.more, 0, 100); if (more) x.more = more;
            if (a.rival && typeof a.rival === 'object') {
                const wants = numIn(a.rival.wants, 0, 1, false), top = pair(a.rival.top, 1, 10, false);
                if (wants !== undefined && top) { x.rival = { wants, top }; const per = numIn(a.rival.perLevel, 0, 1, false); if (per !== undefined) x.rival.perLevel = per; }
            }
            const back = numIn(a.back, 1, 20); if (back !== undefined) x.back = back;
            const again = numIn(a.again, 0, 5, false); if (again !== undefined) x.again = again;
            out.auctions = x;
        }
    }
    if (m.shows && typeof m.shows === 'object') {
        const s = m.shows, price = numIn(s.price, 0, MUSEUM_PRICE_MAX);
        if (price !== undefined) {
            const x: NonNullable<MuseumDef['shows']> = { price };
            for (const k of ['renown', 'lasting', 'most', 'min'] as const) { const v = numIn(s[k], 0, 1000); if (v !== undefined) x[k] = v; }
            out.shows = x;
        }
    }
    return upgradeRoyalties(m, upgradeRival(m, out));
}
/** (nature) A world's digs made safe: an id, a place, at least one action and a season each (else dropped), ids unique,
 *  numbers held to their ranges. */
function digs(list: unknown): DigDef[] {
    const out: DigDef[] = [], ids = new Set<string>();
    for (const d of Array.isArray(list) ? list as any[] : []) {
        if (!d || typeof d !== 'object' || !ID.test(d.id ?? '') || ids.has(d.id) || !str(d.place) || !when(d.season)) continue;
        const actions = strs(d.actions); if (!actions?.length) continue;
        const x: DigDef = { id: d.id, name: str(d.name) ?? d.id, place: d.place, actions: [...new Set(actions)], season: d.season };
        const chance = numIn(d.chance, 0, 1, false); if (chance !== undefined) x.chance = chance;
        const sure = numIn(d.sure, 0, 60); if (sure !== undefined) x.sure = sure;
        const most = numIn(d.most, 1, 50); if (most !== undefined) x.most = most;
        if (d.lend === true) x.lend = true;
        ids.add(x.id); out.push(x);
    }
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
    if ('museum' in raw) { const m = museum(raw.museum, halls); if (m) out.museum = m; }
    if ('digs' in raw) { const d = digs(raw.digs); if (d.length) out.digs = d; }
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
        // (a memento is the night world's own people's: an adult storyline of anyone else is the record's, adult)
        if (e.adult && night) add({ id: `nw_${plainId(first)}${(e.threads ?? []).filter(x => x.adult || e.adult).indexOf(t) > 0 ? `_${plainId(t.id)}` : ''}`, hall: 'night', group: 'mementos', adult: true, ...base });
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
