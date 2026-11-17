// The photo gigs' world data made safe (photography): `w.photo`'s clients, briefs and photobooks from someone else's
// file, the boards' numbers with their defaults, and the photo fields elsewhere (a person's `camera`, a shop item's or
// fixture's `photo` gear, a freelance path's flag). The format is in core/world.ts (PhotoDef); what plays it is
// sim/photo.ts and sim/assignments.ts. A world without `photo` gets no key; the other fields are only cleaned where
// they already are.
import type { WorldDef, PhotoDef, PhotoClient, BriefDef, SubjectDef, PhotobookDef, PhotoGear, CameraRule, PhotoKind, ClientKind } from './world.js';

// (kept here, not in core/world.ts, which imports core/presets.ts, which imports this file)
export const CAMERA_RULES: CameraRule[] = ['ask', 'work', 'noface', 'never'];
export const PHOTO_KINDS: PhotoKind[] = ['magazine', 'wedding', 'event', 'portrait', 'stock'];
export const CLIENT_KINDS: ClientKind[] = ['magazine', 'wedding', 'event', 'portrait', 'small'];
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
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ID.test(x.trim())).map(x => x.trim()))] : []);
const when = (v: unknown) => (typeof v === 'string' ? (v.trim() || undefined) : v && typeof v === 'object' && !Array.isArray(v) ? v as any : undefined);
const num = (v: unknown, lo: number, hi: number, whole = true) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    const n = Math.max(lo, Math.min(hi, v));
    return whole ? Math.round(n) : n;
};
const uniq = <T extends { id: string }>(list: T[]) => { const seen = new Set<string>(); return list.filter(x => !seen.has(x.id) && !!seen.add(x.id)); };

/** The strictest of two camera rules (missing: free). */
export const stricter = (a?: CameraRule, b?: CameraRule): CameraRule | undefined =>
    (a && b ? CAMERA_RULES[Math.max(CAMERA_RULES.indexOf(a), CAMERA_RULES.indexOf(b))] : a ?? b);
/** Does this camera rule let a person be the subject of this brief (`never`: no; `noface`: only from behind; `work`:
 *  never an adult brief)? `ask` lets them in: they're asked when it's taken. */
export function cameraAllows(rule: CameraRule | undefined, b: { adult?: boolean; subject?: { expr?: string } }): boolean {
    if (rule === 'never') return false;
    if (rule === 'noface' && b.subject?.expr !== 'back') return false;
    if (rule === 'work' && b.adult) return false;
    return true;
}

function client(c: any): PhotoClient | null {
    if (!c || typeof c !== 'object' || !ID.test(c.id ?? '') || !str(c.name) || !CLIENT_KINDS.includes(c.kind)) return null;
    const out: PhotoClient = { id: c.id, name: str(c.name)!, kind: c.kind };
    for (const k of ['icon', 'desc'] as const) if (str(c[k])) out[k] = str(c[k]);
    const floor = num(c.floor, 0, 100); if (floor !== undefined) out.floor = floor;
    if (c.contact === 'job' || c.contact === 'always') out.contact = c.contact;
    else if (when(c.contact)) out.contact = when(c.contact);
    const pay = num(c.pay, 0.1, 3, false); if (pay !== undefined) out.pay = pay;
    if (c.adult === true) out.adult = true;
    return out;
}
function subject(s: any): SubjectDef | undefined {
    if (!s || typeof s !== 'object' || !str(s.who)) return undefined;
    const out: SubjectDef = { who: str(s.who)! };
    if (str(s.expr)) out.expr = str(s.expr)!.toLowerCase();
    if (s.outfit === 'clothes' || s.outfit === 'naked') out.outfit = s.outfit;
    if (s.consent === true) out.consent = true;
    if (str(s.scene)) out.scene = str(s.scene);
    return out;
}
function brief(b: any, places: Set<string>, clients: Set<string>): BriefDef | null {
    if (!b || typeof b !== 'object' || !ID.test(b.id ?? '') || !str(b.name) || !clients.has(b.client)) return null;
    if ((b.board !== 'small' && b.board !== 'full') || !PHOTO_KINDS.includes(b.kind)) return null;
    const at = strs(b.places).filter(p => p === ANY_STUDIO || places.has(p));
    const pay = num(b.pay, 0, PHOTO_PAY_MAX);
    if (!at.length || pay === undefined) return null;
    const out: BriefDef = { id: b.id, client: b.client, name: str(b.name)!, text: str(b.text) ?? '', board: b.board, kind: b.kind, places: at, pay };
    const branches = strs(b.branches); if (branches.length) out.branches = branches;
    if (when(b.window)) out.window = when(b.window);
    if (when(b.when)) out.when = when(b.when);
    const days = num(b.days, 1, 28); if (days !== undefined) out.days = days;
    const rep = num(b.rep, 0, 100); if (rep !== undefined) out.rep = rep;
    const floor = num(b.floor, 0, 100); if (floor !== undefined) out.floor = floor;
    if (b.contact === true) out.contact = true;
    const needs: Record<string, number> = {};
    for (const [k, v] of Object.entries<any>(b.needs && typeof b.needs === 'object' ? b.needs : {})) { const n = num(v, 0, 10); if (ID.test(k) && n) needs[k] = n; }
    if (Object.keys(needs).length) out.needs = needs;
    const rung = num(b.rung, 1, 5); if (rung !== undefined) out.rung = rung;
    const gear = strs(b.gear); if (gear.length) out.gear = gear;
    if (b.studio === true || b.studio === 'cyc' || b.studio === 'dressing') out.studio = b.studio;
    const sub = subject(b.subject); if (sub) out.subject = sub;
    const dc = num(b.dc, 1, 30); if (dc !== undefined) out.dc = dc;
    const hours = num(b.hours, 1, 3); if (hours !== undefined) out.hours = hours;
    if (str(b.book)) out.book = str(b.book);
    if (b.adult === true) out.adult = true;
    return out;
}
function book(b: any): PhotobookDef | null {
    if (!b || typeof b !== 'object' || !ID.test(b.id ?? '') || !str(b.name) || !['city', 'person', 'season'].includes(b.kind)) return null;
    const pay = num(b.pay, 0, PHOTO_PAY_MAX);
    if (pay === undefined) return null;
    const out: PhotobookDef = { id: b.id, name: str(b.name)!, kind: b.kind, briefs: num(b.briefs, 1, 8) ?? 4, pay };
    if (str(b.who)) out.who = str(b.who);
    const weeks = num(b.weeks, 1, 520); if (weeks !== undefined) out.weeks = weeks;
    if (b.adult === true) out.adult = true;
    if (str(b.ai)) out.ai = str(b.ai);
    if (when(b.when)) out.when = when(b.when);
    return out;
}
function rental(r: any, places: Set<string>): PhotoDef['rental'] | undefined {
    const one = (x: any) => (x && typeof x === 'object' && places.has(x.at) ? { at: x.at as string, price: num(x.price, 0, PHOTO_PAY_MAX) ?? 0 } : undefined);
    const main = one(r);
    if (!main) return undefined;
    const out: NonNullable<PhotoDef['rental']> = { ...main };
    if (when(r.when)) out.when = when(r.when);
    const fb = one(r.fallback); if (fb) out.fallback = fb;
    return out;
}
function gear(x: any): PhotoGear | undefined {
    if (!x || typeof x !== 'object' || !GEAR_KINDS.includes(x.gear)) return undefined;
    const out: PhotoGear = { gear: x.gear };
    const rung = num(x.rung, 1, 5); if (rung !== undefined) out.rung = rung;
    const shoot = num(x.shoot, -20, 20); if (shoot) out.shoot = shoot;
    const edit = num(x.edit, -20, 20); if (edit) out.edit = edit;
    if (str(x.studio)) out.studio = str(x.studio);
    return out;
}

/** `w.photo` made safe (in place): clients and briefs that can't be played dropped (a brief's client, its places, a
 *  subject whose `camera` rules the brief out), numbers inside their bounds, the words sorted, the boards' numbers given
 *  their defaults; and the photo fields elsewhere cleaned where they are. Idempotent. */
export function upgradePhoto(w: WorldDef) {
    const people = new Map((w.cast?.examples ?? []).map(ex => [ex.name, ex]));
    for (const ex of w.cast?.examples ?? []) if ('camera' in ex && !CAMERA_RULES.includes(ex.camera as CameraRule)) delete ex.camera;
    const items = [...(((w.catalogs as any)?.shop ?? []) as any[]), ...(w.homes?.fixtures ?? [])];
    for (const it of items) if (it && 'photo' in it) { const g = gear(it.photo); if (g) it.photo = g; else delete it.photo; }
    for (const o of w.occupations ?? []) for (const b of o.branches ?? []) for (const opt of b.options ?? []) if ('freelance' in opt && opt.freelance !== true) delete opt.freelance;
    if (!('photo' in w)) return;
    const p: any = w.photo;
    if (!p || typeof p !== 'object') { delete w.photo; return; }
    const places = new Set((w.places ?? []).map(x => x.id));
    const clients = uniq((Array.isArray(p.clients) ? p.clients : []).map(client).filter(Boolean) as PhotoClient[]);
    const books = uniq((Array.isArray(p.books) ? p.books : []).map(book).filter(Boolean) as PhotobookDef[]);
    const ids = new Set(clients.map(c => c.id)), bookIds = new Set(books.map(b => b.id));
    const briefs = uniq((Array.isArray(p.briefs) ? p.briefs : []).map((b: any) => brief(b, places, ids)).filter(Boolean) as BriefDef[])
        .filter(b => { const who = b.subject?.who; return !who || SUBJECT_KINDS.includes(who) || cameraAllows(people.get(who)?.camera, b); });
    for (const b of briefs) if (b.book && !bookIds.has(b.book)) delete b.book;
    const out: PhotoDef = { clients, briefs };
    const words = (Array.isArray(p.words) ? p.words : []).map((x: any) => ({ at: num(x?.at, 0, 100), text: str(x?.text) }))
        .filter((x: any) => x.at !== undefined && x.text) as { at: number; text: string }[];
    out.words = words.length ? [...new Map(words.map(x => [x.at, x])).values()].sort((a, b) => a.at - b.at) : PHOTO_WORDS.map(x => ({ ...x }));
    const s = p.small && typeof p.small === 'object' ? p.small : {};
    out.small = { size: num(s.size, 1, 8) ?? SMALL_BOARD.size, every: num(s.every, 1, 28) ?? SMALL_BOARD.every, cap: num(s.cap, 0, 100) ?? SMALL_BOARD.cap };
    const f = p.full && typeof p.full === 'object' ? p.full : {};
    const min = num(f.min, 1, 8) ?? FULL_BOARD.min, max = num(f.max, 1, 8) ?? FULL_BOARD.max;
    out.full = { min: Math.min(min, max), max: Math.max(min, max) };
    if (books.length) out.books = books;
    const keep = strs(p.keepsakes); if (keep.length) out.keepsakes = keep;
    const r = rental(p.rental, places); if (r) out.rental = r;
    if (str(p.job) && ID.test(str(p.job)!)) out.job = str(p.job);
    const wed = strs(p.weddingAt).filter(x => places.has(x)); if (wed.length) out.weddingAt = wed;
    // (session A) the freelance mentor and her leaving, the photobooks' publisher (a client)
    if (str(p.mentor)) out.mentor = str(p.mentor);
    if (when(p.leaving)) out.leaving = when(p.leaving);
    if (str(p.publisher) && ids.has(str(p.publisher)!)) out.publisher = str(p.publisher);
    w.photo = out;
}
