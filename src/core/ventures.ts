// Ventures as world data (business): the usual numbers and their names, what an executive's division counts instead,
// and the cleaning every world gets as it loads (`upgradeVentures`, from upgradeWorld in core/presets.ts): entries
// without an id dropped, numbers inside sensible bounds, ids made unique. A world without ventures gets no key.
import type { WorldDef, VentureDef, TierDef, UpgradeDef, NoteDef } from './world.js';

/** The four numbers a venture has unless it says otherwise, and an executive's division's. */
export const VENTURE_STATS = ['quality', 'atmosphere', 'capacity', 'fame'];
export const EXEC_STATS = ['results', 'team', 'network', 'standing'];
export const STAT_NAMES: Record<string, string> = {
    quality: 'Quality', atmosphere: 'Atmosphere', capacity: 'Capacity', fame: 'Fame',
    results: 'Results', team: 'Team', network: 'Network', standing: 'Standing',
};
export const UPGRADE_HOWS = ['basic', 'found', 'earned'] as const;
/** Bounds for world numbers (what a venture can ask, earn or hold). */
export const VENTURE_BOUNDS = { ceiling: 1000, cost: 1e9, add: 100, base: 1e7, stint: 12, rooms: 999 };

export const statsOf = (v: VentureDef): string[] => (v.stats?.length ? v.stats : v.track === 'exec' ? EXEC_STATS : VENTURE_STATS);
export const statName = (v: VentureDef | null | undefined, id: string): string => v?.statNames?.[id] ?? STAT_NAMES[id] ?? id;

const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const num = (x: unknown, lo: number, hi: number, d: number) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const uniq = <T extends { id: string }>(list: T[]) => { const seen = new Set<string>(); return list.filter(x => !seen.has(x.id) && !!seen.add(x.id)); };
const okId = (x: any) => !!x && typeof x.id === 'string' && !!x.id.trim();

function cleanTier(t: TierDef): TierDef {
    t.ceiling = num(t.ceiling, 1, VENTURE_BOUNDS.ceiling, 50);
    if (t.alone !== undefined) t.alone = num(t.alone, 0, 1, 0);
    if (t.places !== undefined) t.places = Math.round(num(t.places, 1, 9, 1));
    if (t.base !== undefined) t.base = num(t.base, 0, VENTURE_BOUNDS.base, 0);
    if (t.rooms !== undefined) t.rooms = Math.round(num(t.rooms, 1, VENTURE_BOUNDS.rooms, 1));
    if (t.prices !== undefined) t.prices = cleanPrices(t.prices, true) as { stay: number; rest?: number };
    if (t.rests !== undefined) t.rests = num(t.rests, 0, 12, 0);
    if (t.share !== undefined) t.share = num(t.share, 0, 1, 1);
    t.name = str(t.name) ?? t.id;
    return t;
}
// A night's and a rest's prices (a tier's always has a night's).
function cleanPrices(p: unknown, stay: boolean): { stay?: number; rest?: number } {
    const o = (p && typeof p === 'object' ? p : {}) as { stay?: unknown; rest?: unknown }, out: { stay?: number; rest?: number } = {};
    if (stay || o.stay !== undefined) out.stay = Math.round(num(o.stay, 0, VENTURE_BOUNDS.cost, 0));
    if (o.rest !== undefined) out.rest = Math.round(num(o.rest, 0, VENTURE_BOUNDS.cost, 0));
    return out;
}
const cleanNote = (n: NoteDef | undefined): NoteDef | undefined => (n && typeof n === 'object' ? { down: num(n.down, 0, 1, 1), weeks: Math.round(num(n.weeks, 1, 520, 1)) } : undefined);
const names = (x: unknown): string[] => (Array.isArray(x) ? x.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim()) : []);
function cleanUpgrade(u: UpgradeDef, tiers: number): UpgradeDef {
    u.name = str(u.name) ?? u.id;
    u.add = num(u.add, -VENTURE_BOUNDS.add, VENTURE_BOUNDS.add, 1);
    u.cost = Math.round(num(u.cost, 0, VENTURE_BOUNDS.cost, 0));
    u.tier = Math.round(num(u.tier, 1, Math.max(1, tiers), 1));
    if (!UPGRADE_HOWS.includes(u.how)) u.how = 'basic';
    return u;
}
// (hospitality) The fields the hotels added (kinds, ways, the note, tenancies, sightings, buyers, the calendar's
// weekdays, festivals and hours): only what a world has is touched, so a café's entry comes out as it went in.
function cleanHospitality(v: VentureDef) {
    if (v.kind !== undefined) { const k = str(v.kind); if (k) v.kind = k; else delete v.kind; }
    const w = v.ways;
    if (w?.takeover?.note) w.takeover.note = cleanNote(w.takeover.note);
    for (const k of ['buy', 'partner'] as const) {
        const x = w?.[k]; if (!x) continue;
        if (typeof x !== 'object') { delete w![k]; continue; }
        x.cost = Math.round(num(x.cost, 0, VENTURE_BOUNDS.cost, 0));
        if (x.rent !== undefined) x.rent = Math.round(num(x.rent, 0, VENTURE_BOUNDS.cost, 0));
        if (x.tier !== undefined) x.tier = Math.round(num(x.tier, 1, v.tiers.length, 1));
        if (k === 'buy' && w!.buy!.note) w!.buy!.note = cleanNote(w!.buy!.note);
    }
    if (w?.partner) { const p = str(w.partner.with); if (p) w.partner.with = p; else delete w.partner; }
    for (const s of v.styles ?? []) if (s.prices !== undefined) s.prices = cleanPrices(s.prices, false);
    const dm = v.demand;
    if (dm?.days) dm.days = Object.fromEntries(Object.entries(dm.days).filter(([d]) => WEEKDAYS.includes(d)).map(([d, n]) => [d, num(n, 0, 10, 1)]));
    if (dm?.festivals) dm.festivals = Object.fromEntries(Object.entries(dm.festivals).filter(([f]) => !!str(f)).map(([f, n]) => [f, num(n, 0, 10, 1)]));
    if (dm?.hours) dm.hours = (Array.isArray(dm.hours) ? dm.hours : []).filter(r => Array.isArray(r) && r.length >= 3).map(r => [num(r[0], 0, 24, 0), num(r[1], 0, 24, 24), num(r[2], 0, 10, 1)] as [number, number, number]);
    if (v.tenancies) v.tenancies = uniq(v.tenancies.filter(t => okId(t) && !!str(t.who))).map(t => ({ ...t, who: t.who.trim(), rent: Math.round(num(t.rent, 0, VENTURE_BOUNDS.cost, 0)) }));
    if (v.sightings) v.sightings = uniq(v.sightings.filter(s => okId(s) && names(s.who).length > 0 && !!str(s.line))).map(s => ({ ...s, who: names(s.who).slice(0, 2) }));
    if (v.buyers) v.buyers = uniq(v.buyers.filter(b => okId(b))).map(b => ({ ...b, name: str(b.name) ?? b.id, mul: num(b.mul, 0, 5, 1) }));
    if (v.notebook && !str(v.notebook.who)) delete v.notebook;
    if (v.run && typeof v.run !== 'object') delete v.run;
}
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** A world's ventures made safe to play (in place); none: nothing added. */
export function upgradeVentures(w: WorldDef): void {
    if (!Array.isArray(w.ventures)) { delete w.ventures; return; }
    w.ventures = uniq(w.ventures.filter(v => okId(v) && Array.isArray(v.tiers)));
    for (const v of w.ventures) {
        v.name = str(v.name) ?? v.id;
        v.track = str(v.track) ?? 'cafe';
        v.tiers = uniq(v.tiers.filter(okId)).map(cleanTier);
        if (!v.tiers.length) v.tiers = [cleanTier({ id: 't1', name: 'Open', ceiling: 50 })];
        if (v.styles) v.styles = uniq(v.styles.filter(okId)).map(s => ({ ...s, name: str(s.name) ?? s.id, desc: str(s.desc) ?? '', tier: Math.round(num(s.tier, 1, v.tiers.length, 1)) }));
        if (v.upgrades) v.upgrades = uniq(v.upgrades.filter(u => okId(u) && typeof u.stat === 'string')).map(u => cleanUpgrade(u, v.tiers.length));
        if (v.discoveries) v.discoveries = uniq(v.discoveries.filter(okId)).map(d => ({ ...d, add: d.add && typeof d.add === 'object' ? d.add : {}, text: str(d.text) ?? '' }));
        if (v.events) v.events = uniq(v.events.filter(e => okId(e) && Array.isArray(e.choices)));
        if (v.cards) v.cards = uniq(v.cards.filter(c => okId(c) && Array.isArray(c.choices)));
        if (v.stint !== undefined) v.stint = Math.round(num(v.stint, 1, VENTURE_BOUNDS.stint, 4));
        for (const u of v.ways?.lease?.units ?? []) { u.cost = Math.round(num(u.cost, 0, VENTURE_BOUNDS.cost, 0)); u.rent = Math.round(num(u.rent, 0, VENTURE_BOUNDS.cost, 0)); }
        if (v.ways?.lease) v.ways.lease.units = (v.ways.lease.units ?? []).filter(u => typeof u?.place === 'string');
        if (v.more) v.more = v.more.filter(u => typeof u?.place === 'string').map(u => ({ place: u.place, cost: Math.round(num(u.cost, 0, VENTURE_BOUNDS.cost, 0)), rent: Math.round(num(u.rent, 0, VENTURE_BOUNDS.cost, 0)) }));
        if (v.ways?.takeover) v.ways.takeover.cost = Math.round(num(v.ways.takeover.cost, 0, VENTURE_BOUNDS.cost, 0));
        cleanHospitality(v);
    }
    if (!w.ventures.length) delete w.ventures;
    if (w.staffPool) w.staffPool = { names: (w.staffPool.names ?? []).filter(n => typeof n === 'string' && n.trim()), quirks: (w.staffPool.quirks ?? []).filter(n => typeof n === 'string' && n.trim()) };
}
