// Photobooks (photography): from the third freelance rank, or with a photo reputation of 70 and the publisher as a
// contact, a publisher offers a book that fits (a city book once four city pieces are in your portfolio, a person's
// when they're your friend and their `camera` allows it, a season's in its season: the book's `when`), one at a time;
// a refused one, nothing for 28 days. Accepted, its briefs come on the board one at a time; each delivered at three
// stars or more counts, two missed end it. Published: its pages kept, a keepsake, a news line, and royalties each
// Monday (its own royalty source, gated by photography): from `pay × (0.6 + quality × 0.8)` held to ¥5,000–20,000,
// falling in a straight line to nothing over its weeks (two game years by default).
import { adultOn, type Save } from '../core/store.js';
import type { WorldDef, PhotobookDef, BriefDef } from '../core/world.js';
import { cameraAllows } from '../core/photo.js';
import { onDay } from './hooks.js';
import { photoOn, peekPhoto, photoOf, repOf, isContact, cameraOf, portfolioOf, cityPiece, photoById, clientOf, trimPhotos, photoNote, type Book } from './photo.js';
import { afterDelivery, afterMissed, youParts, offerable, offerBrief } from './assignments.js';
import { ROYALTY_SOURCES } from './royalties.js';
import { isFreelance, freelancePath, myJob, careerOf } from './work.js';
import { whenHolds, personNamed } from './when.js';
import { fr, YOU } from './rel.js';
import { FRIEND_TIERS } from './romance.js';
import { seasonDays } from './time.js';
import { addKeepsake, keepsakeDef } from './social.js';
import { payOf } from './bills.js';
import { effectMul } from './effects.js';
import { tallyEvent } from './tally.js';

/** The rules' numbers. */
export const BOOKS = { min: 5000, max: 20000, refused: 28, rep: 70, city: 4, missed: 2, rank: 2, keepsake: 'gk_my_photobook' };
const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const defOf = (w: WorldDef, id: string) => w.photo?.books?.find(d => d.id === id);
const shown = (g: Save, d: PhotobookDef | undefined) => !!d && (!d.adult || adultOn(g));

/** Does a publisher offer photobooks to you now (the third freelance rank, or reputation 70 with the publisher as a
 *  contact)? */
export function booksOpen(g: Save, w: WorldDef): boolean {
    if (!photoOn(w) || !w.photo!.books?.length) return false;
    const o = myJob(g, w), free = freelancePath(g, w);
    if (o && free && isFreelance(g, w)) {
        const ranks = careerOf(g, o).ranks, first = Math.max(0, ranks.findIndex(r => r.name === free.ranks[0]?.name));
        if ((g.player.job?.rank ?? 0) - first >= BOOKS.rank) return true;
    }
    return !!w.photo!.publisher && repOf(g) >= BOOKS.rep && isContact(g, w, w.photo!.publisher);
}
/** Does this photobook fit you now: adult content for an adult one, its `when`, four city pieces for a city book, its
 *  person a friend whose `camera` allows it for a person's; never one already out or under way. */
export function bookFits(g: Save, w: WorldDef, d: PhotobookDef): boolean {
    if (d.adult && !adultOn(g)) return false;
    if (peekPhoto(g).books.some(b => b.def === d.id && (b.state !== 'declined' && b.state !== 'ended'))) return false;
    if (d.when && !whenHolds(g, w, d.when, { key: `book|${d.id}` })) return false;
    if (d.kind === 'city' && portfolioOf(g).filter(cityPiece).length < BOOKS.city) return false;
    if (d.kind === 'person') {
        const r = d.who ? personNamed(g, d.who) : undefined;
        if (!r || !r.met || fr(g, r.avatar, YOU) < FRIEND_TIERS.find(t => t.id === 'friend')!.lo || !cameraAllows(cameraOf(g, w, r.avatar), { adult: d.adult })) return false;
    }
    return true;
}
const busy = (g: Save) => peekPhoto(g).books.some(b => b.state === 'offered' || b.state === 'project');
// A publisher's offer, now and then (one at a time; none for 28 days after one was turned down).
function offerBook(g: Save, w: WorldDef): string[] {
    if (busy(g) || !booksOpen(g, w)) return [];
    const p = peekPhoto(g);
    if (p.books.some(b => b.state === 'declined' && g.day - b.day < BOOKS.refused)) return [];
    const fit = (w.photo!.books ?? []).filter(d => bookFits(g, w, d));
    if (!fit.length) return [];
    const d = fit[Math.floor(H(`${g.world}|${g.day}|book`) * fit.length)], st = photoOf(g);
    st.books.push({ id: st.nextId++, def: d.id, state: 'offered', briefs: 0, day: g.day });
    const pub = clientOf(w, w.photo!.publisher)?.name ?? 'A publisher';
    return [`📚 ${pub} would like to publish a photobook of yours: ${d.name} (in Lens).`];
}
/** Accepts an offered photobook: its briefs start coming on the board. */
export function acceptBook(g: Save, w: WorldDef, id: number): string {
    const b = peekPhoto(g).books.find(x => x.id === id && x.state === 'offered'), d = b && defOf(w, b.def);
    if (!b || !d) return '';
    b.state = 'project'; b.day = g.day; b.briefs = 0; b.missed = 0;
    return `You said yes to ${d.name}: ${d.briefs} pieces to shoot. The first brief comes on your board soon.`;
}
/** Turns an offered photobook down (no offer for 28 days). */
export function declineBook(g: Save, w: WorldDef, id: number): string {
    const b = peekPhoto(g).books.find(x => x.id === id && x.state === 'offered'), d = b && defOf(w, b.def);
    if (!b || !d) return '';
    b.state = 'declined'; b.day = g.day;
    return `You turned down ${d.name}.`;
}
// The briefs a project is shot with: the world's briefs for that book, else plain full-board ones (a person's book
// with someone the board picks: its person instead).
function bookBriefs(w: WorldDef, d: PhotobookDef): BriefDef[] {
    const own = w.photo!.briefs.filter(b => b.book === d.id);
    if (own.length) return own;
    return w.photo!.briefs.filter(b => b.board === 'full' && !b.book && b.kind !== 'wedding' && (d.kind === 'person' ? b.subject?.who === 'cast' : !b.subject || b.subject.who === 'client') && !!b.adult === !!d.adult);
}
// The next brief of a project, when none of its is on the board or open.
function nextBookBrief(g: Save, w: WorldDef, bk: Book): void {
    const p = peekPhoto(g), d = defOf(w, bk.def);
    if (!d || p.board.some(o => o.book === bk.id) || p.open.some(t => t.book === bk.id)) return;
    const list = bookBriefs(w, d);
    for (let i = 0; i < list.length; i++) {
        const b = list[(bk.briefs + (bk.missed ?? 0) + i) % list.length];
        const x = offerable(g, w, b, 'book');
        if (!x) continue;
        const who = d.kind === 'person' && b.subject?.who === 'cast' && d.who ? personNamed(g, d.who)?.avatar : x.who;
        offerBrief(g, w, b, 'book', { ...x, ...(who ? { who } : {}), book: bk.id });
        return;
    }
}
/** Publishes a finished project: its pages kept, the keepsake, the news, and its royalties from now on. */
export function publish(g: Save, w: WorldDef, bk: Book): string[] {
    const d = defOf(w, bk.def); if (!d) return [];
    const pages = (bk.pages ?? []).map(id => photoById(g, id)).filter(Boolean);
    const avg = pages.length ? pages.reduce((a, r) => a + (r!.q ?? 50), 0) / pages.length : 50;
    bk.state = 'published'; bk.day = g.day; bk.paid = 0;
    bk.pay = Math.round(Math.max(BOOKS.min, Math.min(BOOKS.max, d.pay * (0.6 + (avg / 100) * 0.8))));
    bk.weeks = d.weeks ?? Math.max(1, Math.round((8 * seasonDays(g)) / 7));
    const out = [`📚 ${d.name} is out: your photobook is in the shops.`];
    if ((w.keepsakes ?? []).some(k => k.id === BOOKS.keepsake)) { addKeepsake(g, BOOKS.keepsake); out.push(`You keep: ${keepsakeDef(w, BOOKS.keepsake).icon} ${keepsakeDef(w, BOOKS.keepsake).name}.`); }
    tallyEvent(g, 'photobook');
    photoNote(g, '{u} published a photobook: {0}.', [d.name]);
    trimPhotos(g);
    return out;
}
afterDelivery.push((g, w, t, _b, stars) => {
    if (t.lane !== 'book' || t.book === undefined) return [];
    const bk = peekPhoto(g).books.find(x => x.id === t.book && x.state === 'project'), d = bk && defOf(w, bk.def);
    if (!bk || !d) return [];
    if (stars < 3) return [`${d.name}: that one isn't good enough for the book (three stars at least).`];
    bk.briefs++;
    if (t.shot?.photo !== undefined) (bk.pages ??= []).push(t.shot.photo);
    if (bk.briefs >= d.briefs) return publish(g, w, bk);
    return [`${d.name}: ${bk.briefs} of ${d.briefs} pieces done.`];
});
afterMissed.push((g, w, t) => {
    if (t.lane !== 'book' || t.book === undefined) return [];
    const bk = peekPhoto(g).books.find(x => x.id === t.book && x.state === 'project'), d = bk && defOf(w, bk.def);
    if (!bk || !d) return [];
    bk.missed = (bk.missed ?? 0) + 1;
    if (bk.missed >= BOOKS.missed) { bk.state = 'ended'; bk.day = g.day; return [`${d.name} is off: the publisher has given up on it after two missed deadlines.`]; }
    return [];
});
onDay.push((g, w) => {
    if (!photoOn(w) || !(g as any).photo) return [];
    const out = offerBook(g, w);
    for (const bk of peekPhoto(g).books) if (bk.state === 'project') nextBookBrief(g, w, bk);
    return out;
});

/* ---------- royalties ---------- */

/** What a published book pays this week (its pay falling in a straight line to nothing over its weeks), after the
 *  difficulty and the `royalty` effects aimed at photobooks (or at all royalties). */
export function bookWeek(g: Save, w: WorldDef, bk: Book): number {
    if (bk.state !== 'published' || !bk.pay || !bk.weeks || (bk.paid ?? 0) >= bk.weeks) return 0;
    return payOf(g, bk.pay * (1 - (bk.paid ?? 0) / bk.weeks) * effectMul(g, w, 'royalty', 'photobook'));
}
const paying = (g: Save, w: WorldDef) => peekPhoto(g).books.filter(bk => shown(g, defOf(w, bk.def))).map(bk => ({ bk, amount: bookWeek(g, w, bk) })).filter(x => x.amount > 0);
// (the Monday loop in sim/royalties.ts asks `weekly` and then, at once, `paid` with the same amounts: the books are
// kept from one to the other)
let week: { g: Save; list: { bk: Book; amount: number }[] } | null = null;
ROYALTY_SOURCES.push({
    id: 'photobook',
    on: (g, w) => photoOn(w) && !!(g as any).photo && peekPhoto(g).books.some(b => b.state === 'published'),
    weekly: (g, w) => { const list = paying(g, w); week = { g, list }; return list.map(x => ({ name: defOf(w, x.bk.def)!.name, amount: x.amount })); },
    paidOn: g => peekPhoto(g).bookPaid,
    paid: (g, day) => {
        photoOf(g).bookPaid = day;
        for (const x of week?.g === g ? week.list : []) { x.bk.last = x.amount; x.bk.paid = (x.bk.paid ?? 0) + 1; x.bk.paidDay = day; }
        week = null;
    },
});

/* ---------- the You tab ---------- */

/** A photobook as the app shows it: offered (accept or decline), under way (pieces of N, missed), published (last
 *  week's royalties, weeks left), ended. */
export interface BookView { id: number; def: string; name: string; kind: PhotobookDef['kind']; state: Book['state']; done: number; of: number; missed: number; last?: number; weeksLeft?: number; pay?: number; pages: number }
export function booksView(g: Save, w: WorldDef): BookView[] {
    return peekPhoto(g).books.filter(bk => shown(g, defOf(w, bk.def)) && bk.state !== 'declined').map(bk => {
        const d = defOf(w, bk.def)!;
        return { id: bk.id, def: d.id, name: d.name, kind: d.kind, state: bk.state, done: bk.briefs, of: d.briefs, missed: bk.missed ?? 0, pages: bk.pages?.length ?? 0,
            ...(bk.last !== undefined ? { last: bk.last } : {}), ...(bk.state === 'published' && bk.weeks ? { weeksLeft: Math.max(0, bk.weeks - (bk.paid ?? 0)), pay: bk.pay } : {}) };
    });
}
youParts.push((g, w) => ({ books: booksView(g, w) }));
