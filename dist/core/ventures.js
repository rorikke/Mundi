/** The four numbers a venture has unless it says otherwise, and an executive's division's. */
export const VENTURE_STATS = ['quality', 'atmosphere', 'capacity', 'fame'];
export const EXEC_STATS = ['results', 'team', 'network', 'standing'];
export const STAT_NAMES = {
    quality: 'Quality', atmosphere: 'Atmosphere', capacity: 'Capacity', fame: 'Fame',
    results: 'Results', team: 'Team', network: 'Network', standing: 'Standing',
};
export const UPGRADE_HOWS = ['basic', 'found', 'earned'];
/** Bounds for world numbers (what a venture can ask, earn or hold). */
export const VENTURE_BOUNDS = { ceiling: 1000, cost: 1e9, add: 100, base: 1e7, stint: 12 };
export const statsOf = (v) => (v.stats?.length ? v.stats : v.track === 'exec' ? EXEC_STATS : VENTURE_STATS);
export const statName = (v, id) => v?.statNames?.[id] ?? STAT_NAMES[id] ?? id;
const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const num = (x, lo, hi, d) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const uniq = (list) => { const seen = new Set(); return list.filter(x => !seen.has(x.id) && !!seen.add(x.id)); };
const okId = (x) => !!x && typeof x.id === 'string' && !!x.id.trim();
function cleanTier(t) {
    t.ceiling = num(t.ceiling, 1, VENTURE_BOUNDS.ceiling, 50);
    if (t.alone !== undefined)
        t.alone = num(t.alone, 0, 1, 0);
    if (t.places !== undefined)
        t.places = Math.round(num(t.places, 1, 9, 1));
    if (t.base !== undefined)
        t.base = num(t.base, 0, VENTURE_BOUNDS.base, 0);
    t.name = str(t.name) ?? t.id;
    return t;
}
function cleanUpgrade(u, tiers) {
    u.name = str(u.name) ?? u.id;
    u.add = num(u.add, -VENTURE_BOUNDS.add, VENTURE_BOUNDS.add, 1);
    u.cost = Math.round(num(u.cost, 0, VENTURE_BOUNDS.cost, 0));
    u.tier = Math.round(num(u.tier, 1, Math.max(1, tiers), 1));
    if (!UPGRADE_HOWS.includes(u.how))
        u.how = 'basic';
    return u;
}
/** A world's ventures made safe to play (in place); none: nothing added. */
export function upgradeVentures(w) {
    if (!Array.isArray(w.ventures)) {
        delete w.ventures;
        return;
    }
    w.ventures = uniq(w.ventures.filter(v => okId(v) && Array.isArray(v.tiers)));
    for (const v of w.ventures) {
        v.name = str(v.name) ?? v.id;
        v.track = str(v.track) ?? 'cafe';
        v.tiers = uniq(v.tiers.filter(okId)).map(cleanTier);
        if (!v.tiers.length)
            v.tiers = [cleanTier({ id: 't1', name: 'Open', ceiling: 50 })];
        if (v.styles)
            v.styles = uniq(v.styles.filter(okId)).map(s => ({ ...s, name: str(s.name) ?? s.id, desc: str(s.desc) ?? '', tier: Math.round(num(s.tier, 1, v.tiers.length, 1)) }));
        if (v.upgrades)
            v.upgrades = uniq(v.upgrades.filter(u => okId(u) && typeof u.stat === 'string')).map(u => cleanUpgrade(u, v.tiers.length));
        if (v.discoveries)
            v.discoveries = uniq(v.discoveries.filter(okId)).map(d => ({ ...d, add: d.add && typeof d.add === 'object' ? d.add : {}, text: str(d.text) ?? '' }));
        if (v.events)
            v.events = uniq(v.events.filter(e => okId(e) && Array.isArray(e.choices)));
        if (v.cards)
            v.cards = uniq(v.cards.filter(c => okId(c) && Array.isArray(c.choices)));
        if (v.stint !== undefined)
            v.stint = Math.round(num(v.stint, 1, VENTURE_BOUNDS.stint, 4));
        for (const u of v.ways?.lease?.units ?? []) {
            u.cost = Math.round(num(u.cost, 0, VENTURE_BOUNDS.cost, 0));
            u.rent = Math.round(num(u.rent, 0, VENTURE_BOUNDS.cost, 0));
        }
        if (v.ways?.lease)
            v.ways.lease.units = (v.ways.lease.units ?? []).filter(u => typeof u?.place === 'string');
        if (v.more)
            v.more = v.more.filter(u => typeof u?.place === 'string').map(u => ({ place: u.place, cost: Math.round(num(u.cost, 0, VENTURE_BOUNDS.cost, 0)), rent: Math.round(num(u.rent, 0, VENTURE_BOUNDS.cost, 0)) }));
        if (v.ways?.takeover)
            v.ways.takeover.cost = Math.round(num(v.ways.takeover.cost, 0, VENTURE_BOUNDS.cost, 0));
    }
    if (!w.ventures.length)
        delete w.ventures;
    if (w.staffPool)
        w.staffPool = { names: (w.staffPool.names ?? []).filter(n => typeof n === 'string' && n.trim()), quirks: (w.staffPool.quirks ?? []).filter(n => typeof n === 'string' && n.trim()) };
}
