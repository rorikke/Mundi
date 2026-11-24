// (kept here, not in core/world.ts, which imports core/presets.ts, which imports this file)
export const STANCES = ['fine', 'uneasy', 'no'];
/** A job's stigma: 0 nobody minds, 1 a warning when a coworker recognizes you, 2 a warning and then you're let go. */
export const STIGMA = [0, 1, 2];
/** The numbers when a world gives none (first guesses, tuned by the long run). */
export const INDUSTRY = {
    /** a title's weekly sales at quality 60 on a tier-2 label, the weeks they fade over (0: a season), hot and cold trends */
    sales: { base: 60000, weeks: 0, hot: 1.3, cold: 0.7 },
    /** fame per release at quality 60, lost a week without one, recognition by place tag (× the base chance) */
    fame: { titles: 4, fade: 1, places: { otaku: 2, nightlife: 2, shrine: 0.3 } },
    /** a Name director's share of their titles' sales, by rank on the path from its first */
    share: [0, 0, 0.05],
    /** scenes a title has, at least and at most */
    scenes: [1, 4],
};
/** The most a title may pay or sell in a week. */
export const INDUSTRY_PAY_MAX = 1_000_000;
const ID = /^[^\s,;]+$/;
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const id = (v) => { const s = str(v); return s && ID.test(s) ? s : undefined; };
const strs = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && !!x.trim()).map(x => x.trim()))] : []);
const ids = (v) => strs(v).filter(x => ID.test(x));
const when = (v) => (typeof v === 'string' ? (v.trim() || undefined) : v && typeof v === 'object' && !Array.isArray(v) ? v : undefined);
const num = (v, lo, hi, whole = true) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
        return undefined;
    const n = Math.max(lo, Math.min(hi, v));
    return whole ? Math.round(n) : n;
};
const uniq = (list) => { const seen = new Set(); return list.filter(x => !seen.has(x.id) && !!seen.add(x.id)); };
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const set = (o, k, v) => { if (v === undefined || (Array.isArray(v) && !v.length))
    delete o[k];
else
    o[k] = v; };
function genre(x) {
    const g = obj(x);
    const i = id(g?.id), name = str(g?.name);
    if (!i || !name)
        return null;
    const out = { id: i, name };
    set(out, 'skill', id(g.skill));
    set(out, 'words', strs(g.words));
    set(out, 'scenes', strs(g.scenes));
    set(out, 'pay', num(g.pay, 0.1, 5, false));
    set(out, 'dc', num(g.dc, 1, 30));
    if (g.adult === true)
        out.adult = true;
    return out;
}
function label(x) {
    const l = obj(x);
    const i = id(l?.id), name = str(l?.name);
    if (!i || !name)
        return null;
    const out = { id: i, name };
    set(out, 'tier', num(l.tier, 1, 3));
    set(out, 'pay', num(l.pay, 0.1, 5, false));
    set(out, 'genres', ids(l.genres));
    set(out, 'set', id(l.set));
    set(out, 'director', str(l.director));
    set(out, 'desc', str(l.desc));
    return out;
}
function setDef(x, places) {
    const s = obj(x);
    const i = id(s?.id), name = str(s?.name);
    if (!i || !name)
        return null;
    const out = { id: i, name };
    const p = id(s.place);
    if (p && places.has(p))
        out.place = p;
    set(out, 'zone', id(s.zone));
    set(out, 'genres', ids(s.genres));
    set(out, 'fee', num(s.fee, 0, INDUSTRY_PAY_MAX));
    set(out, 'risk', num(s.risk, 0, 1, false));
    return out.place || out.zone ? out : null;
}
function rosterPerson(x) {
    const r = obj(x);
    const i = id(r?.id), name = str(r?.name);
    if (!i || !name)
        return null;
    // the person's own fields (art, profile, words) are an ExampleCharacter's and are kept as written: the cast's own
    // cleaning (sim/gender.ts) reads them when the performer's card is made
    const out = { ...r, id: i, name };
    set(out, 'rank', num(r.rank, 0, 4));
    set(out, 'genres', ids(r.genres));
    set(out, 'debut', num(r.debut, 0, 100000));
    set(out, 'stories', ids(r.stories));
    if (typeof r.age === 'number' && r.age < 18)
        return null; // never anyone under 18
    return out;
}
function pic(x) {
    const p = obj(x);
    const who = id(p?.who), file = str(p?.file);
    if (!who || !file)
        return null;
    const out = { who, file };
    set(out, 'with', ids(p.with));
    set(out, 'genre', id(p.genre));
    set(out, 'words', strs(p.words));
    return out;
}
function entry(x) {
    const e = obj(x);
    const i = id(e?.id), name = str(e?.name), path = id(e?.path);
    if (!i || !name || !path)
        return null;
    const out = { id: i, name, path };
    set(out, 'when', when(e.when));
    return out;
}
function contract(x) {
    const c = obj(x);
    const i = id(c?.id), name = str(c?.name);
    if (!i || !name)
        return null;
    const out = { id: i, name };
    set(out, 'titles', num(c.titles, 1, 30));
    set(out, 'fee', num(c.fee, 0.1, 10, false));
    set(out, 'counts', num(c.counts, 0.5, 5, false));
    set(out, 'fame', num(c.fame, 0.1, 5, false));
    set(out, 'renew', num(c.renew, 0, INDUSTRY_PAY_MAX * 13));
    if (c.exclusive === true)
        out.exclusive = true;
    return out;
}
// a job's or a track's industry fields, cleaned only where they are
function jobFields(o) {
    const x = o;
    if ('bookings' in x && x.bookings !== true)
        delete x.bookings;
    if ('entries' in x) {
        const v = uniq((Array.isArray(x.entries) ? x.entries : []).map(entry).filter(Boolean));
        if (v.length)
            x.entries = v;
        else
            delete x.entries;
    }
    if ('contracts' in x) {
        const v = uniq((Array.isArray(x.contracts) ? x.contracts : []).map(contract).filter(Boolean));
        if (v.length)
            x.contracts = v;
        else
            delete x.contracts;
    }
    if ('stigma' in x && !STIGMA.includes(x.stigma))
        delete x.stigma;
}
export function upgradeIndustry(w) {
    for (const o of w.occupations ?? []) {
        jobFields(o);
        for (const t of Object.values(o.tracks ?? {}))
            if (t)
                jobFields(t);
    }
    for (const ex of w.cast?.examples ?? []) {
        const x = ex;
        if (!('stance' in x))
            continue;
        const s = obj(x.stance), perform = STANCES.includes(s?.perform) ? s.perform : undefined;
        if (!perform) {
            delete x.stance;
            continue;
        }
        x.stance = { perform, ...(STANCES.includes(s.direct) ? { direct: s.direct } : {}) };
    }
    for (const v of w.ventures ?? []) {
        const ways = v.ways;
        if (ways && 'when' in ways) {
            const c = when(ways.when);
            if (c)
                ways.when = c;
            else
                delete ways.when;
        }
    }
    if (!('industry' in w))
        return;
    const d = w.industry;
    if (!obj(d) || !id(d.job)) {
        delete w.industry;
        return;
    }
    const places = new Set((w.places ?? []).map(p => p.id));
    const out = { job: id(d.job) };
    set(out, 'genres', uniq((Array.isArray(d.genres) ? d.genres : []).map(genre).filter(Boolean)));
    set(out, 'labels', uniq((Array.isArray(d.labels) ? d.labels : []).map(label).filter(Boolean)));
    set(out, 'sets', uniq((Array.isArray(d.sets) ? d.sets : []).map((x) => setDef(x, places)).filter(Boolean)));
    set(out, 'roster', uniq((Array.isArray(d.roster) ? d.roster : []).map(rosterPerson).filter(Boolean)));
    set(out, 'pictures', (Array.isArray(d.pictures) ? d.pictures : []).map(pic).filter(Boolean));
    const s = obj(d.sales);
    if (s)
        out.sales = { base: num(s.base, 0, INDUSTRY_PAY_MAX) ?? INDUSTRY.sales.base, weeks: num(s.weeks, 0, 52) ?? INDUSTRY.sales.weeks, hot: num(s.hot, 1, 3, false) ?? INDUSTRY.sales.hot, cold: num(s.cold, 0.1, 1, false) ?? INDUSTRY.sales.cold };
    const f = obj(d.fame);
    if (f) {
        const places2 = {};
        for (const [k, v] of Object.entries(obj(f.places) ?? {})) {
            const n = num(v, 0, 5, false);
            if (ID.test(k) && n !== undefined)
                places2[k] = n;
        }
        out.fame = { titles: num(f.titles, 0, 50, false) ?? INDUSTRY.fame.titles, fade: num(f.fade, 0, 20, false) ?? INDUSTRY.fame.fade, places: Object.keys(places2).length ? places2 : { ...INDUSTRY.fame.places } };
    }
    const p = obj(d.pay);
    if (p) {
        const share = (Array.isArray(p.share) ? p.share : []).map((x) => num(x, 0, 0.5, false)).filter((x) => x !== undefined);
        if (share.length)
            out.pay = { share };
    }
    const c = obj(d.covers);
    if (c && str(c.layout))
        out.covers = { layout: str(c.layout) };
    const ch = obj(d.chart);
    if (ch) {
        const names = strs(ch.names);
        if (names.length)
            out.chart = { names };
    }
    set(out, 'label', id(d.label));
    w.industry = out;
}
