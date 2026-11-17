// The player's photography (the `photography` system): photo reputation and contacts, the photos kept in the Lens app
// (records of a place, its looks and who was in the frame, drawn again from the world's pictures), the portfolio, the
// gear you carry (read from `ShopItem.photo`, not as effects, so a shoot can name what added), and what the AI is told.
// The boards and briefs are sim/assignments.ts, freelance work sim/freelance.ts, photobooks sim/photobooks.ts, the
// photo studio sim/studio.ts. The save: `g.photo` (PhotoState), read with defaults (old saves have none). With the
// system off, or a world without `photo`, nothing here writes anything.
import { adultOn, nowAbs, type Save } from '../core/store.js';
import { systemOn, worldFile, type WorldDef, type CameraRule, type PhotoClient, type BriefDef } from '../core/world.js';
import type { PhotoGear } from '../core/world.js';
import { stricter } from '../core/photo.js';
import { safeUrl } from '../core/safe.js';
import { relOf, idOf } from './rel.js';
import { photoLink } from './hooks.js';
import { ownedDefs } from './shop.js';
import { studioOf, STUDIO_ID, myStudio, studioHas } from './studio.js';
import { myJob, rankOf, freelancePath, isFreelance } from './work.js';
import { placeOf, playerHomeId, homeKindAt, isHome } from './places.js';
import { SECOND_HOME_ID } from './housing.js';
import { pictureAt, slotAt } from './daynight.js';
import { looksAt } from './worldstate.js';
import { keepsakesOf, keepsakeDef } from './social.js';
import { levelOf } from './hobbies.js';
import { whenHolds } from './when.js';
import { note } from './facts.js';

/** A brief on offer (either board): `brief` its id, offered on `day` until `until`, its subject (an avatar) and place.
 *  `days`: its deadline once taken (the fair-window rule may have lengthened the brief's own); `lane`: which part of
 *  the boards it came from (`small`, `full`, `contacts` after quitting, `book` a photobook's, `wedding` a friend's);
 *  `who2`: a wedding's second; `pair`: the wedding's key; `on`: the only day it can be shot (a wedding). */
export interface Offer { id: number; brief: string; day: number; until: number; who?: string; place: string;
    days?: number; lane?: 'small' | 'full' | 'contacts' | 'book' | 'wedding'; who2?: string; pair?: string; on?: number; book?: number }
/** A shot: the roll's total and DC, the quality, and what added to it by name (the camera, the light, an assistant…). */
export interface Shot { day: number; min: number; place: string; total: number; dc: number; ok: boolean; q: number; parts: { name: string; n: number }[]; photo?: number; redo?: boolean;
    /** the die itself and the roll's bonus (the app shows "photography roll 17 vs 12 → 80"), the quality from the roll
     *  alone (`base`, before the parts), the camera's look */ d20?: number; bonus?: number; base?: number; look?: PhotoRec['look'] }
/** A brief taken: due on `due`; shot, edited (the lift), extended once; `win`: days its window held while it was open. */
export interface Taken extends Offer { taken: number; due: number; shot?: Shot; edited?: number; extended?: boolean; win?: number[]; plan?: string; yes?: boolean;
    /** the edit's own parts ("editing roll 14 vs 12 → +9", "retouching desk +5") */ editParts?: { name: string; n: number }[] }
/** A photo kept in the Lens app: the place and its looks at that moment, who was in the frame, the camera's look. */
export interface PhotoRec {
    id: number; day: number; min: number; src: 'spot' | 'brief' | 'event' | 'book' | 'private';
    place: string; slot: 'day' | 'afternoon' | 'night'; looks: string[];
    who?: { name: string; expr: string; outfit?: string }[];
    frame: [number, number, number];
    look: 'phone' | 'digital' | 'film' | 'instant';
    cap: string; q?: number; stars?: number; brief?: string; client?: string;
    adult?: true; star?: true; undeveloped?: true;
    /** (a home's place: yours, your studio) its kind of home and zone, drawn from their pictures */ home?: { kind: string; zone?: string };
    /** the brief's kind (`wedding`, `portrait`…) or `street` for a shot of your own: the portfolio's variety */ kind?: string;
    /** a five-star brief or a shot good enough to show: it can be in the portfolio */ piece?: true;
    /** the caption the AI gave a portfolio piece (kept instead of the engine's when it came back clean) */ ai?: string;
}
/** A photobook: offered, in progress or published (`def` its PhotobookDef id). `briefs`: pieces done (★3+); `missed`;
 *  `day`: when it was offered (declined: when it was turned down; published: the day); `pay`: the first week's royalties;
 *  `weeks`: weeks it pays over; `paid`: weeks paid so far; `last`: the last week's amount; `pages`: photo ids. */
export interface Book { id: number; def: string; state: 'offered' | 'project' | 'published' | 'declined' | 'ended'; briefs: number; missed?: number; day: number; pay?: number; weeks?: number; paidDay?: number; last?: number; pages?: number[]; said?: boolean; paid?: number }
/** What the save keeps of your photography. */
export interface PhotoState {
    rep: number;
    contacts: Record<string, { day: number; cold?: number }>;
    board: Offer[];
    open: Taken[];
    photos: PhotoRec[];
    portfolio: number[];
    books: Book[];
    done: number;
    week: { from: number; n: number };
    nextId: number;
    /** deliveries by kind (`photos: wedding`), and clients met through a condition (kept once it held) */
    kinds?: Record<string, number>;
    /** the hourly studio you're in: until (absolute minutes), where */
    rental?: { until: number; at: string };
    /** (freelance) how you left the studio: Erika's blessing or a falling-out */
    freelance?: 'blessing' | 'fallout';
    /** the small board's last new gig (day) and the last days a missed or late brief was said */
    smallDay?: number;
    /** the full board's (or the contacts' lane's) last new brief (day): one every `PHOTO_RULES.fullEvery` days */
    fullDay?: number;
    /** clients offering less until that day (a missed brief), contact or not */
    cold?: Record<string, number>;
    /** briefs delivered and the day (none offered again for 28 days) */
    recent?: Record<string, number>;
    /** weddings already offered (the pair's key → the wedding day) */
    weds?: Record<string, number>;
    /** the Monday the freelance retainer was last looked at (paid or not) */
    retainDay?: number;
    /** the Monday photobooks' royalties were last paid */
    bookPaid?: number;
    /** the last shoot: when it ended (absolute minutes) and what the AI is told of it for an hour */
    last?: { at: number; line: string; place: string };
}

/** Is photography played in this world (the system on, and the world has photo gigs)? */
export const photoOn = (w: WorldDef | null | undefined) => !!w?.photo && systemOn(w, 'photography');
/** The save's photography, never written (a fresh one for a save that has none). */
export const peekPhoto = (g: Save): PhotoState => ((g as any).photo as PhotoState | undefined) ?? blank();
/** The save's photography, created with its defaults the first time (only call this once something happens). */
export function photoOf(g: Save): PhotoState {
    const p = ((g as any).photo ??= blank()) as PhotoState;
    p.rep ??= 0; p.contacts ??= {}; p.board ??= []; p.open ??= []; p.photos ??= []; p.portfolio ??= [];
    p.books ??= []; p.done ??= 0; p.week ??= { from: g.day, n: 0 }; p.nextId ??= 1;
    return p;
}
function blank(): PhotoState { return { rep: 0, contacts: {}, board: [], open: [], photos: [], portfolio: [], books: [], done: 0, week: { from: 0, n: 0 }, nextId: 1 }; }
/** Your photo reputation, 0–100. */
export const repOf = (g: Save) => peekPhoto(g).rep;

/** How someone stands in front of a camera: the strictest of what the world says of them and what the game keeps (a
 *  card's own settings); missing: free. `avatar` is a store id. */
export function cameraOf(g: Save, w: WorldDef, avatar: string): CameraRule | undefined {
    const r = g.cast?.[avatar], ex = r ? (w.cast?.examples ?? []).find(e => e.name === r.name) : undefined;
    const own = relOf(g).people[idOf(g, avatar)]?.camera;
    return stricter(ex?.camera, own);
}

/* ---------- reputation and contacts ---------- */

/** A reputation in the world's words (from its floors up). */
export function repWords(w: WorldDef, rep: number): string {
    const list = w.photo?.words ?? [];
    let out = list[0]?.text ?? '';
    for (const x of list) if (rep + 1e-9 >= x.at) out = x.text;
    return out;
}
/** The small board's cap: the reputation small gigs can raise you to. */
export const smallCap = (w: WorldDef) => w.photo?.small?.cap ?? 28;
/** Reputation up or down by `n` (`small`: a small-board gig's gain, never past the cap; a loss always applies). Returns
 *  the change made. Nothing with photography off. */
export function addRep(g: Save, w: WorldDef, n: number, small = false): number {
    if (!photoOn(w) || !n) return 0;
    const p = photoOf(g), before = p.rep;
    let to = before + n;
    if (n > 0 && small) to = before >= smallCap(w) ? before : Math.min(smallCap(w), to);
    p.rep = Math.round(Math.max(0, Math.min(100, to)) * 100) / 100;
    return p.rep - before;
}
export const clientOf = (w: WorldDef, id: string | undefined): PhotoClient | undefined => w.photo?.clients.find(c => c.id === id);
export const briefOf = (w: WorldDef, id: string | undefined): BriefDef | undefined => w.photo?.briefs.find(b => b.id === id);
/** Do you hold the world's photo job (any rank)? */
export const holdsPhotoJob = (g: Save, w: WorldDef) => !!w.photo?.job && systemOn(w, 'jobs') && g.player.job?.id === w.photo.job;
/** Is this client a contact of yours: `always` ones from the start, `job` ones once you delivered for them while you
 *  held the job, a condition's while it holds (and from the first time it held, kept: recorded by `noteContacts`). */
export function isContact(g: Save, w: WorldDef, id: string): boolean {
    const c = clientOf(w, id);
    if (!c || !photoOn(w) || (c.adult && !adultOn(g))) return false;
    if (c.contact === 'always' || peekPhoto(g).contacts[id]) return true;
    return c.contact !== undefined && c.contact !== 'job' && whenHolds(g, w, c.contact, { key: `contact|${c.id}` });
}
/** Clients whose condition holds now become contacts for good (the overlay's gravure weekly, through a job you had). */
export function noteContacts(g: Save, w: WorldDef) {
    if (!photoOn(w)) return;
    for (const c of w.photo!.clients) {
        if (c.contact === undefined || c.contact === 'job' || c.contact === 'always' || peekPhoto(g).contacts[c.id]) continue;
        if (whenHolds(g, w, c.contact, { key: `contact|${c.id}` })) photoOf(g).contacts[c.id] = { day: g.day };
    }
}
/** Your contacts (the clients that keep calling), with the day each became one (always ones: day 0). */
export function contactsOf(g: Save, w: WorldDef): { id: string; name: string; icon?: string; day: number }[] {
    return (w.photo?.clients ?? []).filter(c => isContact(g, w, c.id)).map(c => ({ id: c.id, name: c.name, ...(c.icon ? { icon: c.icon } : {}), day: peekPhoto(g).contacts[c.id]?.day ?? 0 }));
}

/* ---------- gear ---------- */

/** A piece of photo gear you have here: its id, name and what it is. */
export interface GearItem { id: string; name: string; photo: PhotoGear }
/** What you shoot with right now: the best camera (its rung, its look), the best lens, every gear kind you have (what
 *  you carry, your home's fixtures while you're there, your studio's while you're in it, the rental's lights), and all
 *  the items. */
export interface Gear { camera?: GearItem & { rung: number; look: PhotoRec['look'] }; lens?: GearItem & { rung: number }; kinds: Set<string>; items: GearItem[] }
export const lookOf = (id: string): PhotoRec['look'] => (/film/i.test(id) ? 'film' : /instant|cheki/i.test(id) ? 'instant' : /phone/i.test(id) ? 'phone' : 'digital');
export function gearOf(g: Save, w: WorldDef): Gear {
    const items = new Map<string, GearItem>();
    // (what you own that counts here: the shop's things anywhere, a home's fixtures while you're there, your studio's
    // while you're in it and it's paid up: sim/fixtures.ts's `housesHere`)
    for (const it of ownedDefs(g, w)) { const ph = (it as any).photo as PhotoGear | undefined; if (ph?.gear) items.set(it.id, { id: it.id, name: it.name, photo: ph }); }
    const kinds = new Set([...items.values()].map(x => x.photo.gear));
    const best = (kind: string) => [...items.values()].filter(x => x.photo.gear === kind).sort((a, b) => (b.photo.rung ?? 1) - (a.photo.rung ?? 1))[0];
    const cam = best('camera'), lens = best('lens');
    return { items: [...items.values()], kinds,
        ...(cam ? { camera: { ...cam, rung: cam.photo.rung ?? 1, look: lookOf(cam.id) } } : {}),
        ...(lens ? { lens: { ...lens, rung: lens.photo.rung ?? 1 } } : {}) };
}
/** Do you have a camera of your own (the phone counts)? */
export const hasCamera = (g: Save, w: WorldDef) => !!gearOf(g, w).camera;

/* ---------- photos ---------- */

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
/** The photos the app shows: adult ones only with adult content on. */
export const shownPhotos = (g: Save): PhotoRec[] => peekPhoto(g).photos.filter(r => !r.adult || adultOn(g));
export const photoById = (g: Save, id: number | undefined) => peekPhoto(g).photos.find(r => r.id === id);
// A minute of each slot to draw it at (the picture for that part of the day).
const SLOT_MINUTE: Record<PhotoRec['slot'], number> = { day: 9 * 60, afternoon: 15 * 60, night: 21 * 60 };
const SLOT_NOUN: Record<PhotoRec['slot'], string> = { day: 'morning', afternoon: 'afternoon', night: 'night' };
const LOOK_WORDS: Record<string, string> = { rain: 'rainy', heavyrain: 'stormy', storm: 'stormy', snow: 'snowy', sunny: 'sunny', fair: 'clear', cloudy: 'grey', partly: 'cloudy', hot: 'hot', humid: 'muggy' };
/** The engine's caption for a place at a moment: "Shibuya Crossing, a rainy night". */
export function placeCaption(g: Save, w: WorldDef, place: string, min: number, looks: string[]): string {
    const name = place === playerHomeId ? 'Home' : place === STUDIO_ID ? 'The studio' : placeOf(g, w, place)?.name ?? place;
    const slot = slotAt(min) as PhotoRec['slot'], wx = looks.map(l => LOOK_WORDS[l]).find(Boolean);
    const noun = SLOT_NOUN[slot];
    return isHome(place) ? name : `${name}, ${wx ? `a ${wx} ${noun}` : `${noun === 'afternoon' ? 'an' : 'a'} ${noun}`}`;
}
/** Keeps a photo of now: the place and its looks, who was in the frame (two at most), the camera's look (film stays
 *  undeveloped until a roll is developed), framed by its id. Returns it (nothing with photography off). */
export function recordPhoto(g: Save, w: WorldDef, x: { src: PhotoRec['src']; place?: string; who?: PhotoRec['who']; cap?: string; q?: number; stars?: number; brief?: string; client?: string; adult?: boolean; kind?: string; look?: PhotoRec['look']; at?: number; piece?: boolean }): PhotoRec | null {
    if (!photoOn(w)) return null;
    const p = photoOf(g), place = x.place ?? g.player.loc, at = x.at ?? nowAbs(g), min = ((at % 1440) + 1440) % 1440;
    const looks = looksAt(g, w, place), id = p.nextId++;
    const look = x.look ?? gearOf(g, w).camera?.look ?? 'phone';
    const who = (x.who ?? []).slice(0, 2);
    const rec: PhotoRec = { id, day: Math.floor(at / 1440), min, src: x.src, place, slot: slotAt(min) as PhotoRec['slot'], looks,
        ...(who.length ? { who } : {}),
        frame: [Math.round(35 + H(`${g.world}|${id}|x`) * 30), Math.round(40 + H(`${g.world}|${id}|y`) * 20), Math.round((1 + H(`${g.world}|${id}|z`) * 0.25) * 100) / 100],
        look, cap: (x.cap ?? placeCaption(g, w, place, min, looks)).slice(0, 160) };
    if (isHome(place)) {
        const st = place === STUDIO_ID ? studioOf(g) : null, sz = st ? (w.homes?.studios ?? []).find(z => z.id === st.zone) : undefined;
        rec.home = st ? { kind: sz?.kind ?? 'photostudio', zone: st.zone } : { kind: homeKindAt(g, w, place), ...(place === playerHomeId ? { zone: g.player.home.zone } : {}) };
    }
    if (x.q !== undefined) rec.q = Math.round(x.q);
    if (x.stars) rec.stars = x.stars;
    if (x.brief) rec.brief = x.brief;
    if (x.client) rec.client = x.client;
    if (x.kind) rec.kind = x.kind;
    if (x.piece) rec.piece = true;
    if (x.adult || x.src === 'private' || who.some(h => h.outfit === 'naked')) rec.adult = true;
    if (look === 'film') rec.undeveloped = true;
    p.photos.push(rec);
    trimPhotos(g);
    return rec;
}
/** The most starred photos kept, and the most others. */
export const PHOTO_KEEP = { starred: 24, others: 60 };
/** Keeps what the app shows: the portfolio's, every photobook's pages, the starred (24 at most, the newest) and the
 *  last 60 others; older ones drop. */
export function trimPhotos(g: Save) {
    const p = photoOf(g);
    const must = new Set<number>([...p.portfolio, ...p.books.flatMap(b => b.pages ?? []), ...p.open.map(t => t.shot?.photo).filter((x): x is number => x !== undefined)]);
    const starred = p.photos.filter(r => r.star && !must.has(r.id)).slice(-PHOTO_KEEP.starred).map(r => r.id);
    for (const id of starred) must.add(id);
    const rest = p.photos.filter(r => !must.has(r.id)).slice(-PHOTO_KEEP.others).map(r => r.id);
    for (const id of rest) must.add(id);
    for (const r of p.photos) if (r.star && !starred.includes(r.id) && !p.portfolio.includes(r.id)) delete r.star;
    p.photos = p.photos.filter(r => must.has(r.id));
}
/** Stars a photo or takes its star away (24 starred at most: the oldest star goes). Returns whether it's starred now. */
export function starPhoto(g: Save, id: number): boolean {
    const r = photoById(g, id); if (!r) return false;
    if (r.star) delete r.star; else r.star = true;
    trimPhotos(g);
    return !!photoById(g, id)?.star;
}
/** Develops every photo of the film still waiting (the darkroom's or a roll's), starring the best of them when
 *  `star`. Returns how many were developed. */
export function developRoll(g: Save, star = false): number {
    const list = peekPhoto(g).photos.filter(r => r.undeveloped);
    for (const r of list) delete r.undeveloped;
    if (star && list.length) { const best = [...list].sort((a, b) => (b.q ?? 0) - (a.q ?? 0))[0]; best.star = true; trimPhotos(g); }
    return list.length;
}

/* ---------- photos as pictures ---------- */

/** A photo as layers to draw (sim/photo.ts builds it, ui/photoui.ts draws it): the place's picture, the sprites, the
 *  look's class, the frame, and who couldn't be drawn ("Hina, not in the picture"). */
export interface PhotoLayers { bg: string; sprites: { url: string; side: 'left' | 'right' | 'center' }[]; look: PhotoRec['look']; frame: [number, number, number]; missing: string[]; undeveloped?: boolean }
// The sprite files each folder lists (its `sprites.json`), once loaded (loadPhotoSprites); a folder not loaded yet
// is read as the 28 expressions in `.avif`, the built-in worlds' way.
const SETS = new Map<string, string[]>();
const LABELS = ['admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring', 'confusion', 'curiosity', 'desire', 'disappointment', 'disapproval', 'disgust', 'embarrassment', 'excitement',
    'fear', 'gratitude', 'grief', 'joy', 'love', 'nervousness', 'neutral', 'optimism', 'pride', 'realization', 'relief', 'remorse', 'sadness', 'surprise'];
const folderOf = (f: string) => f.replace(/\/*$/, '/');
/** The sprite folders some photos need (for `loadPhotoSprites` before drawing them). */
export function photoSpriteFolders(w: WorldDef, recs: PhotoRec[]): string[] {
    const out = new Set<string>();
    for (const r of recs) for (const h of r.who ?? []) { const ex = (w.cast?.examples ?? []).find(e => e.name === h.name); const f = h.outfit ? ex?.outfits?.[h.outfit] : ex?.sprites; if (f) out.add(folderOf(f)); }
    return [...out].filter(f => !SETS.has(f));
}
/** Reads the lists of sprite folders (`sprites.json`) so photos draw the expressions each set really has. */
export async function loadPhotoSprites(w: WorldDef, folders: string[]): Promise<void> {
    for (const f of folders) {
        if (SETS.has(f)) continue;
        try {
            const res = await fetch(worldFile(w, `${f}sprites.json`), { cache: 'no-cache' });
            const raw: any = res.ok ? await res.json() : null;
            const list = Array.isArray(raw) ? raw : Array.isArray(raw?.files) ? raw.files : null;
            SETS.set(f, (list ?? []).filter((x: unknown): x is string => typeof x === 'string' && /^[\w .-]+\.(png|webp|avif|gif|jpe?g)$/i.test(x)));
        } catch { SETS.set(f, []); }
    }
}
/** Gives a folder's list directly (tests; a world whose list is known). */
export const setPhotoSprites = (folder: string, files: string[]) => { SETS.set(folderOf(folder), files); };
/** The nearest expression a set has to the one wanted (`NEAR`), else neutral, else its first. */
export const NEAR: Record<string, string[]> = {
    excitement: ['desire', 'joy'], curiosity: ['surprise', 'embarrassment'], admiration: ['love', 'joy'],
    nervousness: ['embarrassment', 'fear'], fear: ['nervousness', 'embarrassment'], surprise: ['embarrassment', 'joy'],
    confusion: ['embarrassment', 'surprise'], realization: ['surprise', 'embarrassment'], remorse: ['sadness', 'embarrassment'],
    caring: ['love'], gratitude: ['love', 'joy'], relief: ['love', 'joy'], approval: ['love', 'joy'], optimism: ['joy', 'love'],
    amusement: ['joy'], pride: ['joy'], desire: ['love'], love: ['desire', 'caring'], embarrassment: ['nervousness'],
};
/** The expression to draw from a set that has `have`: the one wanted, else the nearest, else neutral, else the first. */
export function nearestExpr(want: string, have: string[]): string | undefined {
    const w = (want || 'neutral').toLowerCase(), set = new Set(have.map(h => h.toLowerCase()));
    return [w, ...(NEAR[w] ?? []), 'neutral'].find(x => set.has(x)) ?? have[0];
}
/** The layers of a photo: the place's picture for its part of the day and its looks (a home's or the studio's from
 *  its kind or zone), each person's sprite (their outfit's set if they wore one; the nearest expression the set has),
 *  the camera's look, the frame. A card person (not one of the world's), an outfit the world doesn't have, or a naked
 *  outfit with adult content off draws nobody and is named in `missing`. Pure: pictures go through `worldFile`. */
export function photoLayers(g: Save, w: WorldDef, rec: PhotoRec): PhotoLayers {
    const minute = SLOT_MINUTE[rec.slot] ?? 12 * 60;
    let file: string | undefined;
    if (rec.home) {
        const zone = (w.homes?.studios ?? []).find(z => z.id === rec.home!.zone) as any, kind = w.homes?.kinds?.[rec.home.kind];
        file = (zone?.image || zone?.images ? pictureAt(w, minute, zone.image, zone.images, rec.looks) : undefined) ?? (kind ? pictureAt(w, minute, kind.image, kind.images, rec.looks) : undefined);
    } else {
        const p = w.places.find(x => x.id === rec.place);
        file = p ? pictureAt(w, minute, p.bg, p.bgs, rec.looks) : undefined;
        if (!file && p) { const m = w.maps.find(x => x.id === p.map); file = m ? pictureAt(w, minute, m.image, m.images, rec.looks) : undefined; }
    }
    const sprites: PhotoLayers['sprites'] = [], missing: string[] = [];
    const who = rec.who ?? [];
    who.forEach((h, i) => {
        const ex = (w.cast?.examples ?? []).find(e => e.name === h.name);
        const naked = h.outfit === 'naked' && !adultOn(g);
        const folder = naked ? undefined : h.outfit ? ex?.outfits?.[h.outfit] : ex?.sprites;
        if (h.expr === 'back') return;   // (from behind: nobody's face, no sprite)
        if (!ex || !folder) { missing.push(`${h.name}, not in the picture`); return; }
        const f = folderOf(folder), list = SETS.get(f) ?? LABELS.map(l => `${l}.avif`);
        const byLabel = new Map(list.map(x => [x.replace(/\.[^.]+$/, '').toLowerCase(), x]));
        const label = nearestExpr(h.expr === 'back' ? 'neutral' : h.expr, [...byLabel.keys()]);
        const url = label ? safeUrl(worldFile(w, f + byLabel.get(label))) : '';
        if (!url) { missing.push(`${h.name}, not in the picture`); return; }
        sprites.push({ url, side: who.length === 1 ? 'center' : i === 0 ? 'left' : 'right' });
    });
    return { bg: file ? safeUrl(worldFile(w, file)) : '', sprites, look: rec.look, frame: rec.frame, missing, ...(rec.undeveloped ? { undeveloped: true } : {}) };
}

/* ---------- the portfolio ---------- */

/** The portfolio's size. */
export const PORTFOLIO_SIZE = 12;
const rank = (r: PhotoRec) => [r.stars ?? 0, r.q ?? 0, r.id];
const better = (a: PhotoRec, b: PhotoRec) => { const x = rank(a), y = rank(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
/** Puts a photo in the portfolio if it's among the best twelve (by stars, then quality, then the newest). */
export function addToPortfolio(g: Save, id: number): boolean {
    const p = photoOf(g), rec = photoById(g, id);
    if (!rec || p.portfolio.includes(id)) return false;
    rec.piece = true;
    const list = [...p.portfolio.map(x => photoById(g, x)).filter((r): r is PhotoRec => !!r), rec].sort(better).slice(0, PORTFOLIO_SIZE);
    p.portfolio = list.map(r => r.id);
    return p.portfolio.includes(id);
}
/** The portfolio's pieces you can see (adult ones only with adult content on), best first. */
export const portfolioOf = (g: Save): PhotoRec[] => peekPhoto(g).portfolio.map(id => photoById(g, id)).filter((r): r is PhotoRec => !!r && (!r.adult || adultOn(g))).sort(better);
/** The portfolio's strength, 0–100: 8 a piece, scaled by variety (kinds among them: one ×0.7, two ×0.85, three or
 *  more ×1), +4 when every piece is five stars. */
export function portfolioStrength(g: Save): number {
    const list = portfolioOf(g);
    if (!list.length) return 0;
    const kinds = new Set(list.map(r => r.kind ?? 'street')).size;
    const s = 8 * Math.min(PORTFOLIO_SIZE, list.length) * (kinds >= 3 ? 1 : kinds === 2 ? 0.85 : 0.7) + (list.every(r => (r.stars ?? 0) >= 5) ? 4 : 0);
    return Math.round(Math.min(100, s));
}
/** A city piece (a photobook of the city needs four): nobody in the frame, out in the city. */
export const cityPiece = (r: PhotoRec) => !r.who?.length && !isHome(r.place);

/* ---------- photos from actions and work events ---------- */

const name = (g: Save, a: string) => g.cast[a]?.name ?? '';
// What a photo action does: develops the film (its item is a camera: a roll; a darkroom: prints, starring the best),
// or takes a photo of here with whoever is with you in the frame.
function fromAction(g: Save, w: WorldDef, a: NonNullable<Parameters<typeof photoLink.photo>[2]['action']>, ok: boolean | null, mates: string[], roll?: { total: number; dc: number }): string[] {
    const item = a.needsItem ? [...((w.catalogs as any)?.shop ?? []), ...(w.homes?.fixtures ?? [])].find((x: any) => x.id === a.needsItem) as any : null;
    if (item?.photo?.gear === 'camera' || item?.photo?.gear === 'darkroom') {
        const n = developRoll(g, item.photo.gear === 'darkroom');
        return n ? [`📷 ${n} photo${n === 1 ? '' : 's'} developed: they're in Lens.`] : [];
    }
    if (ok === false) return [];
    const q = roll ? Math.max(0, Math.min(100, 50 + 6 * (roll.total - roll.dc))) : undefined;
    const rec = recordPhoto(g, w, { src: 'spot', who: mates.slice(0, 2).map(m => ({ name: name(g, m), expr: 'joy' })).filter(h => h.name), q, adult: !!(a as any).adult, kind: 'street',
        ...(q !== undefined ? { stars: q >= 85 ? 5 : q >= 70 ? 4 : q >= 55 ? 3 : q >= 35 ? 2 : 1 } : {}) });
    if (!rec) return [];
    const out = [`📷 A photo for Lens: ${rec.cap}${rec.undeveloped ? ' (on film: develop the roll to see it)' : ''}.`];
    // good enough to show: a shot of your own joins the portfolio (photography 7 and a roll beaten by 5)
    if (roll && levelOf(g, 'photography') >= 7 && roll.total - roll.dc >= 5 && addToPortfolio(g, rec.id)) out.push('It goes into your portfolio.');
    return out;
}
// A work event's choice that takes a photo, when it works: at the job's place, kept as the event's.
function fromChoice(g: Save, w: WorldDef, c: { label?: string; text?: string }, ok: boolean | null): string[] {
    if (ok === false) return [];
    const o = myJob(g, w);
    const rec = recordPhoto(g, w, { src: 'event', place: g.player.loc, kind: 'event', cap: `${o?.name ?? 'Work'}: ${(c.label ?? '').replace(/[.!]$/, '')}` });
    return rec ? [`📷 The shot is in Lens.`] : [];
}

/* ---------- the condition keys ---------- */

const KIND_WORDS: Record<string, string> = { wedding: 'a wedding shot', festival: 'a festival shot', event: 'an event shot', magazine: 'a magazine story delivered', portrait: 'a portrait shoot delivered', stock: 'a stock photo delivered' };
const FIX_WORDS: Record<string, string> = { any: 'a photo studio of your own', cyc: 'a photo studio of your own with a cyclorama wall', dressing: 'a photo studio of your own with a dressing room' };
/** Published photobooks. */
export const publishedBooks = (g: Save, w: WorldDef) => peekPhoto(g).books.filter(b => b.state === 'published' && (!w.photo?.books?.find(d => d.id === b.def)?.adult || adultOn(g)));
/** Does your photo studio have a fixture of this gear kind (`cyc`, `dressing`; `any`: a studio at all)? */
export function studioWith(g: Save, w: WorldDef, v: string): boolean {
    // (sim/studio.ts: a studio that's yours, and its working fixtures, the ones it came with included)
    return v === 'any' ? !!myStudio(g, w) : studioHas(g, w, v);
}
/** Did you go freelance (and how you left: `blessing`, `fallout`; `any`)? Kept after quitting. */
export function wentFreelance(g: Save, w: WorldDef, v: string): boolean {
    if (!systemOn(w, 'jobs')) return false;
    const how = peekPhoto(g).freelance ?? (isFreelance(g, w) ? 'blessing' : undefined);
    return v === 'any' ? !!how || isFreelance(g, w) : how === v;
}
function keyHolds(g: Save, w: WorldDef, key: string, v: string): boolean {
    const s = v.toLowerCase();
    if (key === 'studio') return systemOn(w, 'photography') && studioWith(g, w, s);
    if (key === 'freelance') return systemOn(w, 'photography') && wentFreelance(g, w, s);
    if (!photoOn(w)) return false;
    const n = Number(v);
    switch (key) {
        case 'photorep': return repOf(g) + 1e-9 >= n;
        case 'portfolio': return portfolioOf(g).length >= n;
        case 'contact': return isContact(g, w, v);
        case 'photobook': return publishedBooks(g, w).length >= n;
        case 'photos': return /^\d+$/.test(v) ? peekPhoto(g).done >= n : (peekPhoto(g).kinds?.[s] ?? 0) > 0;
    }
    return false;
}
function keyWords(g: Save, w: WorldDef, key: string, v: string): string {
    const s = v.toLowerCase(), n = Number(v);
    switch (key) {
        case 'photorep': return `a photo reputation of ${n} (${Math.floor(repOf(g))} now)`;
        case 'portfolio': return `a portfolio of ${n} piece${n === 1 ? '' : 's'} (${portfolioOf(g).length} now)`;
        case 'contact': return `${clientOf(w, v)?.name ?? v} as a contact`;
        case 'photobook': return n === 1 ? `a photobook published (${publishedBooks(g, w).length} now)` : `${n} photobooks published (${publishedBooks(g, w).length} now)`;
        case 'photos': return /^\d+$/.test(v) ? `${n} photo brief${n === 1 ? '' : 's'} delivered (${peekPhoto(g).done} now)` : KIND_WORDS[s] ?? '';
        case 'studio': return FIX_WORDS[s] ?? '';
        case 'freelance': return s === 'blessing' ? 'going freelance with your mentor\'s blessing' : s === 'fallout' ? 'going freelance after a falling-out' : 'going freelance';
    }
    return '';
}
function keyCount(g: Save, w: WorldDef, key: string, v: string): number | null {
    if (!/^\d+$/.test(v)) return null;
    switch (key) {
        case 'photorep': return Math.floor(repOf(g));
        case 'portfolio': return portfolioOf(g).length;
        case 'photobook': return publishedBooks(g, w).length;
        case 'photos': return peekPhoto(g).done;
    }
    return null;
}
photoLink.holds = keyHolds;
photoLink.words = keyWords;
photoLink.count = keyCount;
photoLink.rep = (g, w, n) => { const d = addRep(g, w, n); return d ? [`Your photo reputation ${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}.`] : []; };
photoLink.photo = (g, w, from) => {
    if (!photoOn(w)) return [];
    if (from.action) return fromAction(g, w, from.action, from.ok, from.mates, from.roll);
    if (from.choice) return fromChoice(g, w, from.choice, from.ok);
    return [];
};

/* ---------- what the AI is told ---------- */

const quote = (r: PhotoRec, w: WorldDef) => { const c = clientOf(w, r.client), b = briefOf(w, r.brief); return `'${(r.ai || r.cap).replace(/'/g, '’')}'${c ? ` (${b ? `${b.name}, ` : ''}${c.name})` : ''}`; };
/** For the AI (the `you` block, after the job's line): your photography in a line; '' with nothing to say. */
export function photoLine(g: Save, w: WorldDef): string {
    if (!photoOn(w)) return '';
    const p = peekPhoto(g), words = repWords(w, p.rep), adult = adultOn(g);
    const parts: string[] = [];
    const o = holdsPhotoJob(g, w) ? myJob(g, w) : null, free = o ? freelancePath(g, w) : null;
    if (o && free) parts.push(`{{user}} is a photographer, ${words} (freelance, ${free.name}: ${rankOf(g, o).name}).`);
    else if (o) parts.push(`{{user}} is ${rankOf(g, o).name.toLowerCase()} at ${placeOf(g, w, o.place)?.name ?? o.name}${p.rep >= 10 ? `, a photographer ${words}` : ''}.`);
    else if (p.rep > 10) parts.push(`{{user}} sells photos now and then (${words}).`);
    const briefs = p.open.filter(t => { const b = briefOf(w, t.brief); return b && (!b.adult || adult); }).slice(0, 2);
    for (const t of briefs) {
        const b = briefOf(w, t.brief)!, c = clientOf(w, b.client), left = t.due - g.day;
        const where = t.place === 'studio' ? 'a studio' : placeOf(g, w, t.place)?.name ?? '';
        const who = t.who && g.cast[t.who] ? `, photographing ${g.cast[t.who].name}${t.who2 && g.cast[t.who2] ? ` and ${g.cast[t.who2].name}` : ''}` : '';
        parts.push(`On a brief for ${c?.name ?? 'a client'}: ${b.name}${where ? ` at ${where}` : ''}${who}, ${t.shot ? 'shot, not delivered yet' : left > 1 ? `due in ${left} days` : left === 1 ? 'due tomorrow' : left === 0 ? 'due today' : 'late'}.`);
    }
    const best = portfolioOf(g).slice(0, 3);
    if (best.length) parts.push(`Best work: ${best.map(r => quote(r, w)).join(', ')}.`);
    for (const b of publishedBooks(g, w)) { const d = w.photo!.books?.find(x => x.id === b.def); if (d) parts.push(`A photobook out: *${d.name}*.${d.ai ? ` ${d.ai}` : ''}`); }
    return parts.join(' ');
}

/* ---------- the keepsakes the app shows ---------- */

/** The photo keepsakes you have (every keepsake of kind `photo`, and the world's `photo.keepsakes`): the app's row. */
export function photoKeepsakes(g: Save, w: WorldDef): { id: string; name: string; icon: string; n: number }[] {
    const extra = new Set(w.photo?.keepsakes ?? []);
    return Object.entries(keepsakesOf(g)).filter(([id, n]) => n > 0 && (extra.has(id) || (w.keepsakes ?? []).find(k => k.id === id)?.kind === 'photo'))
        .filter(([id]) => { const k = (w.keepsakes ?? []).find(x => x.id === id) as any; return !k?.adult || adultOn(g); })
        .map(([id, n]) => { const k = keepsakeDef(w, id); return { id, name: k.name, icon: k.icon, n }; });
}

/** Writes a fact about your photography (deliveries, books). */
export const photoNote = (g: Save, t: string, args: string[], place = g.player.loc) => note(g, t, args, [], place, 'work');
/** Your home and your second home: where you can edit (and the studio, and the rental's hours). */
export const atHomeNow = (g: Save) => g.player.loc === playerHomeId || g.player.loc === SECOND_HOME_ID;

/** The AI's caption for a portfolio piece (asked by the UI through `quiet()`, never from here): kept when it comes
 *  back clean (plain text, 24 words at most, no markup or braces), the engine's otherwise. Returns whether it was kept. */
export function setCaption(g: Save, id: number, text: unknown): boolean {
    const r = photoById(g, id);
    const s = String(text ?? '').replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '').replace(/\s+/g, ' ').trim();
    if (!r || !s || s.length > 200 || /[<>{}[\]\|*_#`]|https?:/i.test(s) || s.split(' ').length > 24) return false;
    r.ai = s;
    return true;
}
