// (kept here, not in core/world.ts, which imports core/presets.ts, which imports this file)
export const CAMERA_RULES = ['ask', 'work', 'noface', 'never'];
export const PHOTO_KINDS = ['magazine', 'wedding', 'event', 'portrait', 'stock'];
export const CLIENT_KINDS = ['magazine', 'wedding', 'event', 'portrait', 'small'];
export const GEAR_KINDS = ['camera', 'lens', 'flash', 'drone', 'housing', 'rig', 'cyc', 'dressing', 'desk', 'darkroom'];
/** The reputation in words when a world gives none (from these floors up). */
export const PHOTO_WORDS = [{ at: 0, text: 'unknown' }, { at: 20, text: 'getting noticed' }, { at: 50, text: 'in demand' }, { at: 80, text: 'a name' }];
/** The small board's and the full board's numbers when a world gives none. */
export const SMALL_BOARD = { size: 3, every: 2, cap: 28 }, FULL_BOARD = { min: 3, max: 5 };
/** A brief's defaults: deadline in days, the roll's DC, hours, reputation at five stars by board. */
export const BRIEF_DAYS = 5, BRIEF_DC = 12, BRIEF_HOURS = 1, BRIEF_REP = { small: 3, full: 5 };
/** The most a brief or a photobook may pay (at quality 50; a week of royalties). */
export const PHOTO_PAY_MAX = 1_000_000;
/** The place value that means "any photo studio" (yours or the hourly rental). */
export const ANY_STUDIO = 'studio';
/** Subjects that aren't a person by name. */
export const SUBJECT_KINDS = ['couple', 'cast', 'client'];
const ID = /^[^\s,;]+$/;
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const strs = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && ID.test(x.trim())).map(x => x.trim()))] : []);
const when = (v) => (typeof v === 'string' ? (v.trim() || undefined) : v && typeof v === 'object' && !Array.isArray(v) ? v : undefined);
const num = (v, lo, hi, whole = true) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
        return undefined;
    const n = Math.max(lo, Math.min(hi, v));
    return whole ? Math.round(n) : n;
};
const uniq = (list) => { const seen = new Set(); return list.filter(x => !seen.has(x.id) && !!seen.add(x.id)); };
/** The strictest of two camera rules (missing: free). */
export const stricter = (a, b) => (a && b ? CAMERA_RULES[Math.max(CAMERA_RULES.indexOf(a), CAMERA_RULES.indexOf(b))] : a ?? b);
/** The freest of two camera rules (missing: free, so missing wins). */
export const looser = (a, b) => (a && b ? CAMERA_RULES[Math.min(CAMERA_RULES.indexOf(a), CAMERA_RULES.indexOf(b))] : undefined);
/** A step's rule as a rule (`free`: none). */
export const stepRule = (c) => (c.camera === 'free' ? undefined : c.camera);
export function cameraStepsOf(ex) {
    if (!ex)
        return [];
    const own = (ex.cameraSteps ?? []).map((s, i) => ({ ...s, key: `s${i}` }));
    const tiers = (ex.tiers ?? []).flatMap((t, i) => (t.camera && (t.camera.camera === 'free' || CAMERA_RULES.includes(t.camera.camera)) ? [{ ...t.camera, key: `t:${t.id}`, tier: i }] : []));
    return [...own, ...tiers];
}
/** The freest rule someone can ever reach (their world's rule, or a step's): what a brief naming them is kept for. */
export const loosestCamera = (ex) => cameraStepsOf(ex).reduce((r, s) => looser(r, stepRule(s)), ex?.camera);
const cleanWords = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string').map(x => x.replace(/\s+/g, ' ').trim().slice(0, 120)).filter(Boolean))] : []);
/** A camera change made safe (null: no rule it could be). */
export function cameraChange(c) {
    if (!c || typeof c !== 'object' || !(c.camera === 'free' || CAMERA_RULES.includes(c.camera)))
        return null;
    const out = { camera: c.camera };
    for (const k of ['lifts', 'adds']) {
        const l = cleanWords(c[k]);
        if (l.length)
            out[k] = l;
    }
    if (str(c.line))
        out.line = String(c.line).replace(/\s+/g, ' ').trim().slice(0, 300);
    if (c.adult === true)
        out.adult = true;
    return out;
}
/** A person's camera steps made safe, in place: each a rule and a condition, its lists words; no key when none is left. */
export function upgradeCameraSteps(ex) {
    if (!ex || typeof ex !== 'object' || !('cameraSteps' in ex))
        return;
    const list = (Array.isArray(ex.cameraSteps) ? ex.cameraSteps : []).map((s) => {
        const c = cameraChange(s), w = when(s?.when);
        return c && w ? { when: w, ...c } : null;
    }).filter(Boolean);
    if (list.length)
        ex.cameraSteps = list;
    else
        delete ex.cameraSteps;
}
/** Does this camera rule let a person be the subject of this brief (`never`: no; `noface`: only from behind; `work`:
 *  never an adult brief)? `ask` lets them in: they're asked when it's taken. */
export function cameraAllows(rule, b) {
    if (rule === 'never')
        return false;
    if (rule === 'noface' && b.subject?.expr !== 'back')
        return false;
    if (rule === 'work' && b.adult)
        return false;
    return true;
}
function client(c) {
    if (!c || typeof c !== 'object' || !ID.test(c.id ?? '') || !str(c.name) || !CLIENT_KINDS.includes(c.kind))
        return null;
    const out = { id: c.id, name: str(c.name), kind: c.kind };
    for (const k of ['icon', 'desc'])
        if (str(c[k]))
            out[k] = str(c[k]);
    const floor = num(c.floor, 0, 100);
    if (floor !== undefined)
        out.floor = floor;
    if (c.contact === 'job' || c.contact === 'always')
        out.contact = c.contact;
    else if (when(c.contact))
        out.contact = when(c.contact);
    const pay = num(c.pay, 0.1, 3, false);
    if (pay !== undefined)
        out.pay = pay;
    if (c.adult === true)
        out.adult = true;
    return out;
}
function subject(s) {
    if (!s || typeof s !== 'object' || !str(s.who))
        return undefined;
    const out = { who: str(s.who) };
    if (str(s.expr))
        out.expr = str(s.expr).toLowerCase();
    if (s.outfit === 'clothes' || s.outfit === 'naked')
        out.outfit = s.outfit;
    if (s.consent === true)
        out.consent = true;
    if (str(s.scene))
        out.scene = str(s.scene);
    return out;
}
function brief(b, places, clients) {
    if (!b || typeof b !== 'object' || !ID.test(b.id ?? '') || !str(b.name) || !clients.has(b.client))
        return null;
    if ((b.board !== 'small' && b.board !== 'full') || !PHOTO_KINDS.includes(b.kind))
        return null;
    const at = strs(b.places).filter(p => p === ANY_STUDIO || places.has(p));
    const pay = num(b.pay, 0, PHOTO_PAY_MAX);
    if (!at.length || pay === undefined)
        return null;
    const out = { id: b.id, client: b.client, name: str(b.name), text: str(b.text) ?? '', board: b.board, kind: b.kind, places: at, pay };
    const branches = strs(b.branches);
    if (branches.length)
        out.branches = branches;
    if (when(b.window))
        out.window = when(b.window);
    if (when(b.when))
        out.when = when(b.when);
    const days = num(b.days, 1, 28);
    if (days !== undefined)
        out.days = days;
    const rep = num(b.rep, 0, 100);
    if (rep !== undefined)
        out.rep = rep;
    const floor = num(b.floor, 0, 100);
    if (floor !== undefined)
        out.floor = floor;
    if (b.contact === true)
        out.contact = true;
    const needs = {};
    for (const [k, v] of Object.entries(b.needs && typeof b.needs === 'object' ? b.needs : {})) {
        const n = num(v, 0, 10);
        if (ID.test(k) && n)
            needs[k] = n;
    }
    if (Object.keys(needs).length)
        out.needs = needs;
    const rung = num(b.rung, 1, 5);
    if (rung !== undefined)
        out.rung = rung;
    const gear = strs(b.gear);
    if (gear.length)
        out.gear = gear;
    if (b.studio === true || b.studio === 'cyc' || b.studio === 'dressing')
        out.studio = b.studio;
    const sub = subject(b.subject);
    if (sub)
        out.subject = sub;
    const dc = num(b.dc, 1, 30);
    if (dc !== undefined)
        out.dc = dc;
    const hours = num(b.hours, 1, 3);
    if (hours !== undefined)
        out.hours = hours;
    if (str(b.book))
        out.book = str(b.book);
    if (b.adult === true)
        out.adult = true;
    return out;
}
function book(b) {
    if (!b || typeof b !== 'object' || !ID.test(b.id ?? '') || !str(b.name) || !['city', 'person', 'season'].includes(b.kind))
        return null;
    const pay = num(b.pay, 0, PHOTO_PAY_MAX);
    if (pay === undefined)
        return null;
    const out = { id: b.id, name: str(b.name), kind: b.kind, briefs: num(b.briefs, 1, 8) ?? 4, pay };
    if (str(b.who))
        out.who = str(b.who);
    const weeks = num(b.weeks, 1, 520);
    if (weeks !== undefined)
        out.weeks = weeks;
    if (b.adult === true)
        out.adult = true;
    if (str(b.ai))
        out.ai = str(b.ai);
    if (when(b.when))
        out.when = when(b.when);
    return out;
}
function rental(r, places) {
    const one = (x) => (x && typeof x === 'object' && places.has(x.at) ? { at: x.at, price: num(x.price, 0, PHOTO_PAY_MAX) ?? 0 } : undefined);
    const main = one(r);
    if (!main)
        return undefined;
    const out = { ...main };
    if (when(r.when))
        out.when = when(r.when);
    const fb = one(r.fallback);
    if (fb)
        out.fallback = fb;
    return out;
}
function gear(x) {
    if (!x || typeof x !== 'object' || !GEAR_KINDS.includes(x.gear))
        return undefined;
    const out = { gear: x.gear };
    const rung = num(x.rung, 1, 5);
    if (rung !== undefined)
        out.rung = rung;
    const shoot = num(x.shoot, -20, 20);
    if (shoot)
        out.shoot = shoot;
    const edit = num(x.edit, -20, 20);
    if (edit)
        out.edit = edit;
    if (str(x.studio))
        out.studio = str(x.studio);
    return out;
}
/** `w.photo` made safe (in place): clients and briefs that can't be played dropped (a brief's client, its places, a
 *  subject whose `camera` rules the brief out, even at their freest step), numbers inside their bounds, the words sorted, the boards' numbers given
 *  their defaults; and the photo fields elsewhere cleaned where they are. Idempotent. */
export function upgradePhoto(w) {
    const people = new Map((w.cast?.examples ?? []).map(ex => [ex.name, ex]));
    for (const ex of w.cast?.examples ?? []) {
        if ('camera' in ex && !CAMERA_RULES.includes(ex.camera))
            delete ex.camera;
        upgradeCameraSteps(ex);
    }
    const items = [...(w.catalogs?.shop ?? []), ...(w.homes?.fixtures ?? [])];
    for (const it of items)
        if (it && 'photo' in it) {
            const g = gear(it.photo);
            if (g)
                it.photo = g;
            else
                delete it.photo;
        }
    for (const o of w.occupations ?? [])
        for (const b of o.branches ?? [])
            for (const opt of b.options ?? [])
                if ('freelance' in opt && opt.freelance !== true)
                    delete opt.freelance;
    if (!('photo' in w))
        return;
    const p = w.photo;
    if (!p || typeof p !== 'object') {
        delete w.photo;
        return;
    }
    const places = new Set((w.places ?? []).map(x => x.id));
    const clients = uniq((Array.isArray(p.clients) ? p.clients : []).map(client).filter(Boolean));
    const books = uniq((Array.isArray(p.books) ? p.books : []).map(book).filter(Boolean));
    const ids = new Set(clients.map(c => c.id)), bookIds = new Set(books.map(b => b.id));
    const briefs = uniq((Array.isArray(p.briefs) ? p.briefs : []).map((b) => brief(b, places, ids)).filter(Boolean))
        .filter(b => { const who = b.subject?.who; return !who || SUBJECT_KINDS.includes(who) || cameraAllows(loosestCamera(people.get(who)), b); });
    for (const b of briefs)
        if (b.book && !bookIds.has(b.book))
            delete b.book;
    const out = { clients, briefs };
    const words = (Array.isArray(p.words) ? p.words : []).map((x) => ({ at: num(x?.at, 0, 100), text: str(x?.text) }))
        .filter((x) => x.at !== undefined && x.text);
    out.words = words.length ? [...new Map(words.map(x => [x.at, x])).values()].sort((a, b) => a.at - b.at) : PHOTO_WORDS.map(x => ({ ...x }));
    const s = p.small && typeof p.small === 'object' ? p.small : {};
    out.small = { size: num(s.size, 1, 8) ?? SMALL_BOARD.size, every: num(s.every, 1, 28) ?? SMALL_BOARD.every, cap: num(s.cap, 0, 100) ?? SMALL_BOARD.cap };
    const f = p.full && typeof p.full === 'object' ? p.full : {};
    const min = num(f.min, 1, 8) ?? FULL_BOARD.min, max = num(f.max, 1, 8) ?? FULL_BOARD.max;
    out.full = { min: Math.min(min, max), max: Math.max(min, max) };
    if (books.length)
        out.books = books;
    const keep = strs(p.keepsakes);
    if (keep.length)
        out.keepsakes = keep;
    const r = rental(p.rental, places);
    if (r)
        out.rental = r;
    if (str(p.job) && ID.test(str(p.job)))
        out.job = str(p.job);
    const wed = strs(p.weddingAt).filter(x => places.has(x));
    if (wed.length)
        out.weddingAt = wed;
    // (session A) the freelance mentor and her leaving, the photobooks' publisher (a client)
    if (str(p.mentor))
        out.mentor = str(p.mentor);
    if (when(p.leaving))
        out.leaving = when(p.leaving);
    if (str(p.publisher) && ids.has(str(p.publisher)))
        out.publisher = str(p.publisher);
    w.photo = out;
}
// (housing) A photo studio's zone from someone else's file: an id no home zone has, a name, a map the world has, one
// spot (the first good one, else the middle of the map), its kind, money in bounds, its pictures, the fixtures it
// comes with (those the world has), `given`. The fields only a home has (a second home, letting) are left out.
function studio(z, maps, homes, fixtures) {
    if (!z || typeof z !== 'object' || !str(z.id) || !ID.test(str(z.id)) || homes.has(str(z.id)) || !str(z.name) || !maps.has(z.map))
        return undefined;
    const spot = (Array.isArray(z.spots) ? z.spots : []).find((s) => Array.isArray(s) && num(s[0], 0, 100, false) !== undefined && num(s[1], 0, 100, false) !== undefined);
    const out = { id: str(z.id), name: str(z.name), map: z.map, kind: str(z.kind) ?? 'photostudio', rent: num(z.rent, 0, PHOTO_PAY_MAX * 10) ?? 0,
        spots: [spot ? [Math.max(0, Math.min(100, spot[0])), Math.max(0, Math.min(100, spot[1]))] : [50, 50]] };
    if (str(z.desc))
        out.desc = str(z.desc);
    for (const k of ['price', 'upkeep']) {
        const v = num(z[k], 0, 1_000_000_000);
        if (v)
            out[k] = v;
    }
    const resale = num(z.resale, 0, 1, false);
    if (resale)
        out.resale = resale;
    const size = num(z.size, 1, 5);
    if (size !== undefined)
        out.size = size;
    if (str(z.image))
        out.image = str(z.image);
    if (z.images && typeof z.images === 'object' && !Array.isArray(z.images)) {
        const im = Object.fromEntries(Object.entries(z.images).filter(([k, v]) => str(k) && str(v)).map(([k, v]) => [k, str(v)]));
        if (Object.keys(im).length)
            out.images = im;
    }
    const fx = strs(z.fixtures).filter(id => fixtures.has(id));
    if (fx.length)
        out.fixtures = fx;
    if (z.given === true)
        out.given = true;
    return out;
}
/** (housing) The photo studios (`homes.studios`) and the kinds' `work` flag made safe, in place (called from
 *  `upgradeWorld()` after `upgradePhoto`); no key is added where a world has none. Idempotent. */
export function upgradeStudios(w) {
    const h = w.homes;
    if (!h || typeof h !== 'object')
        return;
    for (const k of Object.values(h.kinds ?? {}))
        if (k && typeof k === 'object' && 'work' in k && k.work !== true)
            delete k.work;
    if (!('studios' in h))
        return;
    const maps = new Set((w.maps ?? []).map(m => m.id)), homes = new Set((h.zones ?? []).map((z) => z?.id));
    const fixtures = new Set((Array.isArray(h.fixtures) ? h.fixtures : []).map((f) => f?.id).filter(Boolean));
    const list = uniq((Array.isArray(h.studios) ? h.studios : []).map((z) => studio(z, maps, homes, fixtures)).filter(Boolean));
    if (list.length)
        h.studios = list;
    else
        delete h.studios;
}
