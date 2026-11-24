// The player's photography (the `photography` system): photo reputation and contacts, the photos kept in the Lens app
// (records of a place, its looks and who was in the frame, drawn again from the world's pictures), the portfolio, the
// gear you carry (read from `ShopItem.photo`, not as effects, so a shoot can name what added), and what the AI is told.
// The boards and briefs are sim/assignments.ts, freelance work sim/freelance.ts, photobooks sim/photobooks.ts, the
// photo studio sim/studio.ts. The save: `g.photo` (PhotoState), read with defaults (old saves have none). With the
// system off, or a world without `photo`, nothing here writes anything.
import { adultOn, nowAbs } from '../core/store.js';
import { systemOn, worldFile, personPictures } from '../core/world.js';
import { stricter, looser, stepRule, cameraStepsOf } from '../core/photo.js';
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
/** Is photography played in this world (the system on, and the world has photo gigs)? */
export const photoOn = (w) => !!w?.photo && systemOn(w, 'photography');
/** The save's photography, never written (a fresh one for a save that has none). */
export const peekPhoto = (g) => g.photo ?? blank();
/** The save's photography, created with its defaults the first time (only call this once something happens). */
export function photoOf(g) {
    const p = (g.photo ??= blank());
    p.rep ??= 0;
    p.contacts ??= {};
    p.board ??= [];
    p.open ??= [];
    p.photos ??= [];
    p.portfolio ??= [];
    p.books ??= [];
    p.done ??= 0;
    p.week ??= { from: g.day, n: 0 };
    p.nextId ??= 1;
    return p;
}
function blank() { return { rep: 0, contacts: {}, board: [], open: [], photos: [], portfolio: [], books: [], done: 0, week: { from: 0, n: 0 }, nextId: 1 }; }
/** Your photo reputation, 0–100. */
export const repOf = (g) => peekPhoto(g).rep;
/** The world's person behind someone in this game (by name), if any. */
export const cameraPerson = (g, w, avatar) => {
    const r = g.cast?.[avatar];
    return r ? (w.cast?.examples ?? []).find(e => e.name === r.name) : undefined;
};
/** Does this camera change count now: photography on, and an adult one only with adult content on. */
export const stepCounts = (g, w, s) => systemOn(w, 'photography') && (!s.adult || adultOn(g));
/** The camera step that holds for someone now (sim/camera.ts latches them): the last of theirs latched in the save that
 *  counts now; undefined before any. */
export function cameraStepNow(g, w, avatar, ex = cameraPerson(g, w, avatar)) {
    const got = relOf(g).people[idOf(g, avatar)]?.camSteps;
    if (!got || !ex)
        return undefined;
    return cameraStepsOf(ex).filter(s => got[s.key] !== undefined && stepCounts(g, w, s)).at(-1);
}
/** How someone stands in front of a camera; missing: free. `avatar` is a store id. Someone the game made (no world
 *  person behind them): their own rule. The world's people: the world's rule loosened to the camera step that holds
 *  now (none: the world's rule); a card's own rule stricter than the world's is the card's choice and stays (the
 *  stricter of the two), while one the same as the world's (the copy a new game keeps) loosens with the steps. */
export function cameraOf(g, w, avatar) {
    const ex = cameraPerson(g, w, avatar);
    const own = relOf(g).people[idOf(g, avatar)]?.camera;
    if (!ex)
        return own;
    const step = cameraStepNow(g, w, avatar, ex);
    const world = step ? looser(ex.camera, stepRule(step)) : ex.camera;
    return stricter(world, own === ex.camera || stricter(own, ex.camera) === ex.camera ? undefined : own);
}
/* ---------- reputation and contacts ---------- */
/** A reputation in the world's words (from its floors up). */
export function repWords(w, rep) {
    const list = w.photo?.words ?? [];
    let out = list[0]?.text ?? '';
    for (const x of list)
        if (rep + 1e-9 >= x.at)
            out = x.text;
    return out;
}
/** The small board's cap: the reputation small gigs can raise you to. */
export const smallCap = (w) => w.photo?.small?.cap ?? 28;
/** Reputation up or down by `n` (`small`: a small-board gig's gain, never past the cap; a loss always applies). Returns
 *  the change made. Nothing with photography off. */
export function addRep(g, w, n, small = false) {
    if (!photoOn(w) || !n)
        return 0;
    const p = photoOf(g), before = p.rep;
    let to = before + n;
    if (n > 0 && small)
        to = before >= smallCap(w) ? before : Math.min(smallCap(w), to);
    p.rep = Math.round(Math.max(0, Math.min(100, to)) * 100) / 100;
    return p.rep - before;
}
export const clientOf = (w, id) => w.photo?.clients.find(c => c.id === id);
export const briefOf = (w, id) => w.photo?.briefs.find(b => b.id === id);
/** Do you hold the world's photo job (any rank)? */
export const holdsPhotoJob = (g, w) => !!w.photo?.job && systemOn(w, 'jobs') && g.player.job?.id === w.photo.job;
/** Is this client a contact of yours: `always` ones from the start, `job` ones once you delivered for them while you
 *  held the job, a condition's while it holds (and from the first time it held, kept: recorded by `noteContacts`). */
export function isContact(g, w, id) {
    const c = clientOf(w, id);
    if (!c || !photoOn(w) || (c.adult && !adultOn(g)))
        return false;
    if (c.contact === 'always' || peekPhoto(g).contacts[id])
        return true;
    return c.contact !== undefined && c.contact !== 'job' && whenHolds(g, w, c.contact, { key: `contact|${c.id}` });
}
/** Clients whose condition holds now become contacts for good (the overlay's gravure weekly, through a job you had). */
export function noteContacts(g, w) {
    if (!photoOn(w))
        return;
    for (const c of w.photo.clients) {
        if (c.contact === undefined || c.contact === 'job' || c.contact === 'always' || peekPhoto(g).contacts[c.id])
            continue;
        if (whenHolds(g, w, c.contact, { key: `contact|${c.id}` }))
            photoOf(g).contacts[c.id] = { day: g.day };
    }
}
/** Your contacts (the clients that keep calling), with the day each became one (always ones: day 0). */
export function contactsOf(g, w) {
    return (w.photo?.clients ?? []).filter(c => isContact(g, w, c.id)).map(c => ({ id: c.id, name: c.name, ...(c.icon ? { icon: c.icon } : {}), day: peekPhoto(g).contacts[c.id]?.day ?? 0 }));
}
export const lookOf = (id) => (/film/i.test(id) ? 'film' : /instant|cheki/i.test(id) ? 'instant' : /phone/i.test(id) ? 'phone' : 'digital');
export function gearOf(g, w) {
    const items = new Map();
    // (what you own that counts here: the shop's things anywhere, a home's fixtures while you're there, your studio's
    // while you're in it and it's paid up: sim/fixtures.ts's `housesHere`)
    for (const it of ownedDefs(g, w)) {
        const ph = it.photo;
        if (ph?.gear)
            items.set(it.id, { id: it.id, name: it.name, photo: ph });
    }
    const kinds = new Set([...items.values()].map(x => x.photo.gear));
    const best = (kind) => [...items.values()].filter(x => x.photo.gear === kind).sort((a, b) => (b.photo.rung ?? 1) - (a.photo.rung ?? 1))[0];
    const cam = best('camera'), lens = best('lens');
    return { items: [...items.values()], kinds,
        ...(cam ? { camera: { ...cam, rung: cam.photo.rung ?? 1, look: lookOf(cam.id) } } : {}),
        ...(lens ? { lens: { ...lens, rung: lens.photo.rung ?? 1 } } : {}) };
}
/** Do you have a camera of your own (the phone counts)? */
export const hasCamera = (g, w) => !!gearOf(g, w).camera;
/* ---------- photos ---------- */
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
/** The photos the app shows: adult ones only with adult content on. */
export const shownPhotos = (g) => peekPhoto(g).photos.filter(r => !r.adult || adultOn(g));
export const photoById = (g, id) => peekPhoto(g).photos.find(r => r.id === id);
// A minute of each slot to draw it at (the picture for that part of the day).
const SLOT_MINUTE = { day: 9 * 60, afternoon: 15 * 60, night: 21 * 60 };
const SLOT_NOUN = { day: 'morning', afternoon: 'afternoon', night: 'night' };
const LOOK_WORDS = { rain: 'rainy', heavyrain: 'stormy', storm: 'stormy', snow: 'snowy', sunny: 'sunny', fair: 'clear', cloudy: 'grey', partly: 'cloudy', hot: 'hot', humid: 'muggy' };
/** The engine's caption for a place at a moment: "Shibuya Crossing, a rainy night". */
export function placeCaption(g, w, place, min, looks) {
    const name = place === playerHomeId ? 'Home' : place === STUDIO_ID ? 'The studio' : placeOf(g, w, place)?.name ?? place;
    const slot = slotAt(min), wx = looks.map(l => LOOK_WORDS[l]).find(Boolean);
    const noun = SLOT_NOUN[slot];
    return isHome(place) ? name : `${name}, ${wx ? `a ${wx} ${noun}` : `${noun === 'afternoon' ? 'an' : 'a'} ${noun}`}`;
}
/** Keeps a photo of now: the place and its looks, who was in the frame (two at most), the camera's look (film stays
 *  undeveloped until a roll is developed), framed by its id. Returns it (nothing with photography off). */
export function recordPhoto(g, w, x) {
    if (!photoOn(w))
        return null;
    const p = photoOf(g), place = x.place ?? g.player.loc, at = x.at ?? nowAbs(g), min = ((at % 1440) + 1440) % 1440;
    const looks = looksAt(g, w, place), id = p.nextId++;
    const look = x.look ?? gearOf(g, w).camera?.look ?? 'phone';
    const who = (x.who ?? []).slice(0, 2);
    const rec = { id, day: Math.floor(at / 1440), min, src: x.src, place, slot: slotAt(min), looks,
        ...(who.length ? { who } : {}),
        frame: [Math.round(35 + H(`${g.world}|${id}|x`) * 30), Math.round(40 + H(`${g.world}|${id}|y`) * 20), Math.round((1 + H(`${g.world}|${id}|z`) * 0.25) * 100) / 100],
        look, cap: (x.cap ?? placeCaption(g, w, place, min, looks)).slice(0, 160) };
    if (isHome(place)) {
        const st = place === STUDIO_ID ? studioOf(g) : null, sz = st ? (w.homes?.studios ?? []).find(z => z.id === st.zone) : undefined;
        rec.home = st ? { kind: sz?.kind ?? 'photostudio', zone: st.zone } : { kind: homeKindAt(g, w, place), ...(place === playerHomeId ? { zone: g.player.home.zone } : {}) };
    }
    if (x.q !== undefined)
        rec.q = Math.round(x.q);
    if (x.stars)
        rec.stars = x.stars;
    if (x.brief)
        rec.brief = x.brief;
    if (x.client)
        rec.client = x.client;
    if (x.kind)
        rec.kind = x.kind;
    if (x.piece)
        rec.piece = true;
    if (x.adult || x.src === 'private' || who.some(h => h.outfit === 'naked'))
        rec.adult = true;
    if (look === 'film')
        rec.undeveloped = true;
    p.photos.push(rec);
    trimPhotos(g);
    return rec;
}
/** The most starred photos kept, and the most others. */
export const PHOTO_KEEP = { starred: 24, others: 60 };
/** Keeps what the app shows: the portfolio's, every photobook's pages, the starred (24 at most, the newest) and the
 *  last 60 others; older ones drop. */
export function trimPhotos(g) {
    const p = photoOf(g);
    const kept = new Set([...p.portfolio, ...p.books.flatMap(b => b.pages ?? []), ...p.open.map(t => t.shot?.photo).filter((x) => x !== undefined)]);
    const must = new Set(kept);
    const starred = p.photos.filter(r => r.star && !must.has(r.id)).slice(-PHOTO_KEEP.starred).map(r => r.id);
    for (const id of starred)
        must.add(id);
    const rest = p.photos.filter(r => !must.has(r.id)).slice(-PHOTO_KEEP.others).map(r => r.id);
    for (const id of rest)
        must.add(id);
    // (a starred photo kept for its own reason, a page or an open brief's shot such as a still that's a title's cover,
    // keeps its star: only the starred beyond the 24 lose theirs)
    for (const r of p.photos)
        if (r.star && !starred.includes(r.id) && !kept.has(r.id))
            delete r.star;
    p.photos = p.photos.filter(r => must.has(r.id));
}
/** Stars a photo or takes its star away (24 starred at most: the oldest star goes). Returns whether it's starred now. */
export function starPhoto(g, id) {
    const r = photoById(g, id);
    if (!r)
        return false;
    if (r.star)
        delete r.star;
    else
        r.star = true;
    trimPhotos(g);
    return !!photoById(g, id)?.star;
}
/** Develops every photo of the film still waiting (the darkroom's or a roll's), starring the best of them when
 *  `star`. Returns how many were developed. */
export function developRoll(g, star = false) {
    const list = peekPhoto(g).photos.filter(r => r.undeveloped);
    for (const r of list)
        delete r.undeveloped;
    if (star && list.length) {
        const best = [...list].sort((a, b) => (b.q ?? 0) - (a.q ?? 0))[0];
        best.star = true;
        trimPhotos(g);
    }
    return list.length;
}
// The sprite files each folder lists (its `sprites.json`), once loaded (loadPhotoSprites); a folder not loaded yet
// is read as the 28 expressions in `.avif`, the built-in worlds' way.
const SETS = new Map();
export const LABELS = ['admiration', 'amusement', 'anger', 'annoyance', 'approval', 'caring', 'confusion', 'curiosity', 'desire', 'disappointment', 'disapproval', 'disgust', 'embarrassment', 'excitement',
    'fear', 'gratitude', 'grief', 'joy', 'love', 'nervousness', 'neutral', 'optimism', 'pride', 'realization', 'relief', 'remorse', 'sadness', 'surprise'];
const folderOf = (f) => f.replace(/\/*$/, '/');
/** The sprite folders some photos need (for `loadPhotoSprites` before drawing them). */
export function photoSpriteFolders(w, recs) {
    const out = new Set();
    for (const r of recs)
        for (const h of r.who ?? []) {
            const ex = personPictures(w, h.name);
            const f = h.outfit ? ex?.outfits?.[h.outfit] : ex?.sprites;
            if (f)
                out.add(folderOf(f));
        }
    return [...out].filter(f => !SETS.has(f));
}
/** Reads the lists of sprite folders (`sprites.json`) so photos draw the expressions each set really has. */
export async function loadPhotoSprites(w, folders) {
    for (const f of folders) {
        if (SETS.has(f))
            continue;
        try {
            const res = await fetch(worldFile(w, `${f}sprites.json`), { cache: 'no-cache' });
            const raw = res.ok ? await res.json() : null;
            const list = Array.isArray(raw) ? raw : Array.isArray(raw?.files) ? raw.files : null;
            SETS.set(f, (list ?? []).filter((x) => typeof x === 'string' && /^[\w .-]+\.(png|webp|avif|gif|jpe?g)$/i.test(x)));
        }
        catch {
            SETS.set(f, []);
        }
    }
}
/** Gives a folder's list directly (tests; a world whose list is known). */
export const setPhotoSprites = (folder, files) => { SETS.set(folderOf(folder), files); };
/** The nearest expression a set has to the one wanted (`NEAR`), else neutral, else its first. */
export const NEAR = {
    excitement: ['desire', 'joy'], curiosity: ['surprise', 'embarrassment'], admiration: ['love', 'joy'],
    nervousness: ['embarrassment', 'fear'], fear: ['nervousness', 'embarrassment'], surprise: ['embarrassment', 'joy'],
    confusion: ['embarrassment', 'surprise'], realization: ['surprise', 'embarrassment'], remorse: ['sadness', 'embarrassment'],
    caring: ['love'], gratitude: ['love', 'joy'], relief: ['love', 'joy'], approval: ['love', 'joy'], optimism: ['joy', 'love'],
    amusement: ['joy'], pride: ['joy'], desire: ['love'], love: ['desire', 'caring'], embarrassment: ['nervousness'],
};
/** The expression to draw from a set that has `have`: the one wanted, else the nearest, else neutral, else the first. */
export function nearestExpr(want, have) {
    const w = (want || 'neutral').toLowerCase(), set = new Set(have.map(h => h.toLowerCase()));
    return [w, ...(NEAR[w] ?? []), 'neutral'].find(x => set.has(x)) ?? have[0];
}
/** The layers of a photo: the place's picture for its part of the day and its looks (a home's or the studio's from
 *  its kind or zone), each person's sprite (their outfit's set if they wore one; the nearest expression the set has),
 *  the camera's look, the frame. People are the world's or the industry's roster's (`personPictures`). A card person (not one of them), an outfit the world doesn't have, or a naked
 *  outfit with adult content off draws nobody and is named in `missing`. Pure: pictures go through `worldFile`. */
export function photoLayers(g, w, rec) {
    const minute = SLOT_MINUTE[rec.slot] ?? 12 * 60;
    let file;
    if (rec.home) {
        const zone = (w.homes?.studios ?? []).find(z => z.id === rec.home.zone), kind = w.homes?.kinds?.[rec.home.kind];
        file = (zone?.image || zone?.images ? pictureAt(w, minute, zone.image, zone.images, rec.looks) : undefined) ?? (kind ? pictureAt(w, minute, kind.image, kind.images, rec.looks) : undefined);
    }
    else {
        const p = w.places.find(x => x.id === rec.place);
        file = p ? pictureAt(w, minute, p.bg, p.bgs, rec.looks) : undefined;
        if (!file && p) {
            const m = w.maps.find(x => x.id === p.map);
            file = m ? pictureAt(w, minute, m.image, m.images, rec.looks) : undefined;
        }
    }
    const sprites = [], missing = [];
    const who = rec.who ?? [];
    who.forEach((h, i) => {
        const ex = personPictures(w, h.name);
        const naked = h.outfit === 'naked' && !adultOn(g);
        const folder = naked ? undefined : h.outfit ? ex?.outfits?.[h.outfit] : ex?.sprites;
        if (h.expr === 'back')
            return; // (from behind: nobody's face, no sprite)
        if (!ex || !folder) {
            missing.push(`${h.name}, not in the picture`);
            return;
        }
        const f = folderOf(folder), list = SETS.get(f) ?? LABELS.map(l => `${l}.avif`);
        const byLabel = new Map(list.map(x => [x.replace(/\.[^.]+$/, '').toLowerCase(), x]));
        const label = nearestExpr(h.expr === 'back' ? 'neutral' : h.expr, [...byLabel.keys()]);
        const url = label ? safeUrl(worldFile(w, f + byLabel.get(label))) : '';
        if (!url) {
            missing.push(`${h.name}, not in the picture`);
            return;
        }
        sprites.push({ url, side: who.length === 1 ? 'center' : i === 0 ? 'left' : 'right' });
    });
    return { bg: file ? safeUrl(worldFile(w, file)) : '', sprites, look: rec.look, frame: rec.frame, missing, ...(rec.undeveloped ? { undeveloped: true } : {}) };
}
/* ---------- the portfolio ---------- */
/** The portfolio's size. */
export const PORTFOLIO_SIZE = 12;
const rank = (r) => [r.stars ?? 0, r.q ?? 0, r.id];
const better = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < 3; i++)
    if (x[i] !== y[i])
        return y[i] - x[i]; return 0; };
/** Puts a photo in the portfolio if it's among the best twelve (by stars, then quality, then the newest). */
export function addToPortfolio(g, id) {
    const p = photoOf(g), rec = photoById(g, id);
    if (!rec || p.portfolio.includes(id))
        return false;
    rec.piece = true;
    const list = [...p.portfolio.map(x => photoById(g, x)).filter((r) => !!r), rec].sort(better).slice(0, PORTFOLIO_SIZE);
    p.portfolio = list.map(r => r.id);
    return p.portfolio.includes(id);
}
/** The portfolio's pieces you can see (adult ones only with adult content on), best first. */
export const portfolioOf = (g) => peekPhoto(g).portfolio.map(id => photoById(g, id)).filter((r) => !!r && (!r.adult || adultOn(g))).sort(better);
/** The portfolio's strength, 0–100: 8 a piece, scaled by variety (kinds among them: one ×0.7, two ×0.85, three or
 *  more ×1), +4 when every piece is five stars. */
export function portfolioStrength(g) {
    const list = portfolioOf(g);
    if (!list.length)
        return 0;
    const kinds = new Set(list.map(r => r.kind ?? 'street')).size;
    const s = 8 * Math.min(PORTFOLIO_SIZE, list.length) * (kinds >= 3 ? 1 : kinds === 2 ? 0.85 : 0.7) + (list.every(r => (r.stars ?? 0) >= 5) ? 4 : 0);
    return Math.round(Math.min(100, s));
}
/** A city piece (a photobook of the city needs four): nobody in the frame, out in the city. */
export const cityPiece = (r) => !r.who?.length && !isHome(r.place);
/* ---------- photos from actions and work events ---------- */
const name = (g, a) => g.cast[a]?.name ?? '';
// What a photo action does: develops the film (its item is a camera: a roll; a darkroom: prints, starring the best),
// or takes a photo of here with whoever is with you in the frame.
function fromAction(g, w, a, ok, mates, roll) {
    const item = a.needsItem ? [...(w.catalogs?.shop ?? []), ...(w.homes?.fixtures ?? [])].find((x) => x.id === a.needsItem) : null;
    if (item?.photo?.gear === 'camera' || item?.photo?.gear === 'darkroom') {
        const n = developRoll(g, item.photo.gear === 'darkroom');
        return n ? [`📷 ${n} photo${n === 1 ? '' : 's'} developed: they're in Lens.`] : [];
    }
    if (ok === false)
        return [];
    const q = roll ? Math.max(0, Math.min(100, 50 + 6 * (roll.total - roll.dc))) : undefined;
    // who is in the frame: only people whose camera rule lets a friend's snapshot have them (not `never`, not `noface`: it's
    // their face, not `work`: it isn't work); a private action's photo is a private one (adult, its own expression, the
    // outfit a private action puts on), and someone who's asked first is in it only there, where they're asked
    const priv = !!a.private;
    const inFrame = mates.filter(m => { const r = cameraOf(g, w, m); return !r || (r === 'ask' && priv); });
    const who = inFrame.slice(0, 2).map(m => ({ name: name(g, m), expr: priv ? 'love' : 'joy', ...(priv && adultOn(g) ? { outfit: 'naked' } : {}) })).filter(h => h.name);
    const rec = recordPhoto(g, w, { src: priv ? 'private' : 'spot', who, q, adult: priv || !!a.adult, kind: priv ? 'private' : 'street',
        ...(q !== undefined ? { stars: q >= 85 ? 5 : q >= 70 ? 4 : q >= 55 ? 3 : q >= 35 ? 2 : 1 } : {}) });
    if (!rec)
        return [];
    const out = [`📷 A photo for Lens: ${rec.cap}${rec.undeveloped ? ' (on film: develop the roll to see it)' : ''}.`];
    // good enough to show: a shot of your own joins the portfolio (photography 7 and a roll beaten by 5)
    if (roll && levelOf(g, 'photography') >= 7 && roll.total - roll.dc >= 5 && addToPortfolio(g, rec.id))
        out.push('It goes into your portfolio.');
    return out;
}
// A work event's choice that takes a photo, when it works: at the job's place, kept as the event's.
// (an adult event's photo is an adult one: found by the choice among the world's adult work events, the choice itself or
// a copy of it named for a colleague, by its label)
const adultChoice = (w, c) => (w.occupations ?? []).some(o => (o.events ?? []).some(e => e.adult && (e.choices ?? []).some(x => x === c || (!!c.label && x.label === c.label))));
function fromChoice(g, w, c, ok) {
    if (ok === false)
        return [];
    const o = myJob(g, w);
    const rec = recordPhoto(g, w, { src: 'event', place: g.player.loc, kind: 'event', adult: adultChoice(w, c), cap: `${o?.name ?? 'Work'}: ${(c.label ?? '').replace(/[.!]$/, '')}` });
    return rec ? [`📷 The shot is in Lens.`] : [];
}
/* ---------- the condition keys ---------- */
const KIND_WORDS = { wedding: 'a wedding shot', festival: 'a festival shot', event: 'an event shot', magazine: 'a magazine story delivered', portrait: 'a portrait shoot delivered', stock: 'a stock photo delivered' };
const FIX_WORDS = { any: 'a photo studio of your own', cyc: 'a photo studio of your own with a cyclorama wall', dressing: 'a photo studio of your own with a dressing room' };
/** Published photobooks. */
export const publishedBooks = (g, w) => peekPhoto(g).books.filter(b => b.state === 'published' && (!w.photo?.books?.find(d => d.id === b.def)?.adult || adultOn(g)));
/** Does your photo studio have a fixture of this gear kind (`cyc`, `dressing`; `any`: a studio at all)? */
export function studioWith(g, w, v) {
    // (sim/studio.ts: a studio that's yours, and its working fixtures, the ones it came with included)
    return v === 'any' ? !!myStudio(g, w) : studioHas(g, w, v);
}
/** Did you go freelance (and how you left: `blessing`, `fallout`; `any`)? Kept after quitting. */
export function wentFreelance(g, w, v) {
    if (!systemOn(w, 'jobs'))
        return false;
    const how = peekPhoto(g).freelance ?? (isFreelance(g, w) ? 'blessing' : undefined);
    return v === 'any' ? !!how || isFreelance(g, w) : how === v;
}
function keyHolds(g, w, key, v) {
    const s = v.toLowerCase();
    if (key === 'studio')
        return systemOn(w, 'photography') && studioWith(g, w, s);
    if (key === 'freelance')
        return systemOn(w, 'photography') && wentFreelance(g, w, s);
    if (!photoOn(w))
        return false;
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
function keyWords(g, w, key, v) {
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
function keyCount(g, w, key, v) {
    if (!/^\d+$/.test(v))
        return null;
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
    if (!photoOn(w))
        return [];
    if (from.action)
        return fromAction(g, w, from.action, from.ok, from.mates, from.roll);
    if (from.choice)
        return fromChoice(g, w, from.choice, from.ok);
    return [];
};
/* ---------- what the AI is told ---------- */
const quote = (r, w) => { const c = clientOf(w, r.client), b = briefOf(w, r.brief); return `'${(r.ai || r.cap).replace(/'/g, '’')}'${c ? ` (${b ? `${b.name}, ` : ''}${c.name})` : ''}`; };
/** For the AI (the `you` block, after the job's line): your photography in a line; '' with nothing to say. */
export function photoLine(g, w) {
    if (!photoOn(w))
        return '';
    const p = peekPhoto(g), words = repWords(w, p.rep), adult = adultOn(g);
    const parts = [];
    const o = holdsPhotoJob(g, w) ? myJob(g, w) : null, free = o ? freelancePath(g, w) : null;
    if (o && free)
        parts.push(`{{user}} is a photographer, ${words} (freelance, ${free.name}: ${rankOf(g, o).name}).`);
    else if (o)
        parts.push(`{{user}} is ${rankOf(g, o).name.toLowerCase()} at ${placeOf(g, w, o.place)?.name ?? o.name}${p.rep >= 10 ? `, a photographer ${words}` : ''}.`);
    else if (p.rep > 10)
        parts.push(`{{user}} sells photos now and then (${words}).`);
    const briefs = p.open.filter(t => { const b = briefOf(w, t.brief); return b && (!b.adult || adult); }).slice(0, 2);
    for (const t of briefs) {
        const b = briefOf(w, t.brief), c = clientOf(w, b.client), left = t.due - g.day;
        const where = t.place === 'studio' ? 'a studio' : placeOf(g, w, t.place)?.name ?? '';
        const who = t.who && g.cast[t.who] ? `, photographing ${g.cast[t.who].name}${t.who2 && g.cast[t.who2] ? ` and ${g.cast[t.who2].name}` : ''}` : '';
        parts.push(`On a brief for ${c?.name ?? 'a client'}: ${b.name}${where ? ` at ${where}` : ''}${who}, ${t.shot ? 'shot, not delivered yet' : left > 1 ? `due in ${left} days` : left === 1 ? 'due tomorrow' : left === 0 ? 'due today' : 'late'}.`);
    }
    const best = portfolioOf(g).slice(0, 3);
    if (best.length)
        parts.push(`Best work: ${best.map(r => quote(r, w)).join(', ')}.`);
    for (const b of publishedBooks(g, w)) {
        const d = w.photo.books?.find(x => x.id === b.def);
        if (d)
            parts.push(`A photobook out: *${d.name}*.${d.ai ? ` ${d.ai}` : ''}`);
    }
    return parts.join(' ');
}
/* ---------- the keepsakes the app shows ---------- */
/** The photo keepsakes you have (every keepsake of kind `photo`, and the world's `photo.keepsakes`): the app's row. */
export function photoKeepsakes(g, w) {
    const extra = new Set(w.photo?.keepsakes ?? []);
    return Object.entries(keepsakesOf(g)).filter(([id, n]) => n > 0 && (extra.has(id) || (w.keepsakes ?? []).find(k => k.id === id)?.kind === 'photo'))
        .filter(([id]) => { const k = (w.keepsakes ?? []).find(x => x.id === id); return !k?.adult || adultOn(g); })
        .map(([id, n]) => { const k = keepsakeDef(w, id); return { id, name: k.name, icon: k.icon, n }; });
}
/** Writes a fact about your photography (deliveries, books). */
export const photoNote = (g, t, args, place = g.player.loc) => note(g, t, args, [], place, 'work');
/** Your home and your second home: where you can edit (and the studio, and the rental's hours). */
export const atHomeNow = (g) => g.player.loc === playerHomeId || g.player.loc === SECOND_HOME_ID;
/** The AI's caption for a portfolio piece (asked by the UI through `quiet()`, never from here): kept when it comes
 *  back clean (plain text, 24 words at most, no markup or braces), the engine's otherwise. Returns whether it was kept. */
export function setCaption(g, id, text) {
    const r = photoById(g, id);
    const s = String(text ?? '').replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '').replace(/\s+/g, ' ').trim();
    if (!r || !s || s.length > 200 || /[<>{}[\]\|*_#`]|https?:/i.test(s) || s.split(' ').length > 24)
        return false;
    r.ai = s;
    return true;
}
