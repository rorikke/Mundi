// Photobooks (photography): from the third freelance rank, or with a photo reputation of 70 and the publisher as a
// contact, a publisher offers a book that fits (a city book once four city pieces are in your portfolio, a person's
// when they're your friend and their `camera` allows it, a season's in its season: the book's `when`), one at a time;
// a refused one, nothing for 28 days. Accepted, its briefs come on the board one at a time; each delivered at three
// stars or more counts, two missed end it. Published: its pages kept, a keepsake, a news line, and royalties each
// Monday (its own royalty source, gated by photography): from `pay × (0.6 + quality × 0.8)` held to ¥5,000–20,000,
// falling in a straight line to nothing over its weeks (two game years by default).
// (plans/industry-lens.md Part 2) Two more, with the adult industry in play (its system and adult content): a
// performer's photobook, once a performer of the roster has reached rank 3 and you're a photographer with Kurobara or
// Peach Pages as a contact (the publisher offers it; its briefs name her; small royalties); and *Star and producer*'s
// own book (requirements §4.3): the publisher's photographer shoots her in a studio, three sittings she plays as an
// engine action (*Sit for your photobook*), each a scene with the AI. She's never in a picture: its photos keep the
// studio and the words (what was shot, the outfit, the stars), with nobody drawn.
import { adultOn, nowAbs, type Save } from '../core/store.js';
import type { WorldDef, PhotobookDef, BriefDef, ActionDef, RosterPerson } from '../core/world.js';
import { cameraAllows } from '../core/photo.js';
import { onDay, engineActions, photoLink } from './hooks.js';
import { photoOn, peekPhoto, photoOf, repOf, isContact, cameraOf, portfolioOf, cityPiece, photoById, clientOf, trimPhotos, photoNote, recordPhoto, hasCamera, holdsPhotoJob, type Book } from './photo.js';
import { afterDelivery, afterMissed, youParts, offerable, offerBrief, rosterOk, rosterPerformer, isRosterWho, starsOf } from './assignments.js';
import { industryOn, onPath, STAR_PATH } from './industry.js';
import { rentalOpen } from './studio.js';
import { openAt } from './daynight.js';
import { rollBonus, rollD20 } from './dice.js';
import { trainSkill } from './hobbies.js';
import { placeName } from './facts.js';
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
export const BOOKS = { min: 5000, max: 20000, refused: 28, rep: 70, city: 4, missed: 2, rank: 2, keepsake: 'gk_my_photobook',
    /** a performer's book: her rank, the clients that bring it (as contacts; any of the industry's labels too), pieces, pay */
    performer: { rank: 3, via: ['kurobara', 'peach_pages'], briefs: 3, pay: 6000 },
    /** her own book: sittings, pay, a sitting's difficulty and minutes */
    own: { briefs: 3, pay: 15000, dc: 12, minutes: 120 } };
/** The id of *Star and producer*'s own photobook (a book the save keeps by this `def`). */
export const OWN_BOOK = 'own';
const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
/** A performer's photobook when the world names none for her: `roster:<id>`, a person's book, adult, small royalties. */
const rosterBook = (p: RosterPerson): PhotobookDef => ({ id: `roster:${p.id}`, name: `${p.name}: Between Takes`, kind: 'person', who: `roster:${p.id}`, briefs: BOOKS.performer.briefs, pay: BOOKS.performer.pay, adult: true,
    ai: `{{user}} shot ${p.name}: Between Takes, the photobook of the adult video actress ${p.name}.` });
const ownBook = (): PhotobookDef => ({ id: OWN_BOOK, name: 'In Her Own Light', kind: 'person', who: YOU, briefs: BOOKS.own.briefs, pay: BOOKS.own.pay, adult: true,
    ai: '{{user}}\'s own photobook, In Her Own Light, is in the bookshops: the actress shot by a publisher\'s photographer.' });
/** A photobook by id: the world's, a roster performer's (`roster:<id>`, the world's own book for her first), her own. */
export function bookDef(w: WorldDef, id: string): PhotobookDef | undefined {
    const own = w.photo?.books?.find(d => d.id === id);
    if (own) return own;
    if (id === OWN_BOOK) return w.photo ? ownBook() : undefined;
    const p = isRosterWho(id) ? rosterPerformer(w, id) : undefined;
    return p ? rosterBook(p) : undefined;
}
const defOf = bookDef;
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
 *  person a friend whose `camera` allows it for a person's; never one already out or under way. A performer's
 *  (`who: roster:<id>`): a woman of rank 3 or more and briefs that can name her; your own (`who: you`): always, once offered. */
export function bookFits(g: Save, w: WorldDef, d: PhotobookDef): boolean {
    if (d.adult && !adultOn(g)) return false;
    if (peekPhoto(g).books.some(b => b.def === d.id && (b.state !== 'declined' && b.state !== 'ended'))) return false;
    if (d.when && !whenHolds(g, w, d.when, { key: `book|${d.id}` })) return false;
    if (d.kind === 'city' && portfolioOf(g).filter(cityPiece).length < BOOKS.city) return false;
    if (d.kind === 'person' && d.who === YOU) return d.id === OWN_BOOK && ownBooksOpen(g, w);
    if (d.kind === 'person' && isRosterWho(d.who)) {
        const p = rosterPerformer(w, d.who);
        return !!p && p.gender !== 'man' && (p.rank ?? 0) >= BOOKS.performer.rank && performerBooksOpen(g, w) && bookBriefs(w, d).some(b => rosterOk(g, w, p, b));
    }
    if (d.kind === 'person') {
        const r = d.who ? personNamed(g, d.who) : undefined;
        if (!r || !r.met || fr(g, r.avatar, YOU) < FRIEND_TIERS.find(t => t.id === 'friend')!.lo || !cameraAllows(cameraOf(g, w, r.avatar), { adult: d.adult })) return false;
    }
    return true;
}
/** Does the publisher offer a performer's photobook now: the adult industry in play, the world's publisher, a camera, a
 *  photo job (or the photobooks' own way in), and Kurobara or Peach Pages (or any of the industry's labels) as a contact? */
export function performerBooksOpen(g: Save, w: WorldDef): boolean {
    if (!photoOn(w) || !w.photo!.publisher || !industryOn(g, w) || !hasCamera(g, w)) return false;
    if (!holdsPhotoJob(g, w) && !booksOpen(g, w)) return false;
    const via = new Set([...BOOKS.performer.via, ...(w.industry?.labels ?? []).map(l => l.id)]);
    return [...via].some(id => !!clientOf(w, id) && isContact(g, w, id));
}
/** Does the publisher offer *Star and producer* her own photobook now (the adult industry in play, the world's
 *  publisher, that path of the actress's track)? No camera needed: she's the one photographed. */
export const ownBooksOpen = (g: Save, w: WorldDef): boolean => photoOn(w) && !!w.photo!.publisher && industryOn(g, w) && onPath(g, w, STAR_PATH);
// The performers' books the publisher could offer: the world's own naming a performer, else one made for each
// performer of the roster (a woman: "her photobook").
function performerBooks(w: WorldDef): PhotobookDef[] {
    const own = (w.photo?.books ?? []).filter(d => d.kind === 'person' && isRosterWho(d.who));
    const named = new Set(own.map(d => d.who));
    return [...own, ...(w.industry?.roster ?? []).filter(p => p.gender !== 'man' && !named.has(`roster:${p.id}`)).map(rosterBook)];
}
const busy = (g: Save) => peekPhoto(g).books.some(b => b.state === 'offered' || b.state === 'project');
// A publisher's offer, now and then (one at a time; none for 28 days after one was turned down): one of the world's
// books once photobooks are open to you; a performer's or your own (the adult industry) when those are.
function offerBook(g: Save, w: WorldDef): string[] {
    if (busy(g)) return [];
    const open = booksOpen(g, w), perf = performerBooksOpen(g, w), self = ownBooksOpen(g, w);
    if (!open && !perf && !self) return [];
    const p = peekPhoto(g);
    if (p.books.some(b => b.state === 'declined' && g.day - b.day < BOOKS.refused)) return [];
    const fit = [...(open ? (w.photo!.books ?? []).filter(d => !(d.kind === 'person' && (isRosterWho(d.who) || d.who === YOU))) : []), ...(perf ? performerBooks(w) : []), ...(self ? [ownBook()] : [])]
        .filter(d => bookFits(g, w, d));
    if (!fit.length) return [];
    const d = fit[Math.floor(H(`${g.world}|${g.day}|book`) * fit.length)], st = photoOf(g);
    st.books.push({ id: st.nextId++, def: d.id, state: 'offered', briefs: 0, day: g.day });
    const pub = clientOf(w, w.photo!.publisher)?.name ?? 'A publisher';
    if (d.who === YOU) return [`📚 ${pub} would like to publish your own photobook: ${d.name}, ${d.briefs} sittings in a studio with their photographer (in Lens).`];
    const perfP = isRosterWho(d.who) ? rosterPerformer(w, d.who) : undefined;
    if (perfP) return [`📚 ${pub} would like you to shoot ${perfP.name}'s photobook: ${d.name} (in Lens).`];
    return [`📚 ${pub} would like to publish a photobook of yours: ${d.name} (in Lens).`];
}
/** Accepts an offered photobook: its briefs start coming on the board (your own: its sittings at the studio). */
export function acceptBook(g: Save, w: WorldDef, id: number): string {
    const b = peekPhoto(g).books.find(x => x.id === id && x.state === 'offered'), d = b && defOf(w, b.def);
    if (!b || !d) return '';
    b.state = 'project'; b.day = g.day; b.briefs = 0; b.missed = 0;
    if (d.id === OWN_BOOK) { const at = sittingAt(g, w); return `You said yes to ${d.name}: ${d.briefs} sittings with the publisher's photographer${at ? ` at ${placeName(g, w, at)}` : ''}, one a day, whenever you go.`; }
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
// with someone the board picks: its person instead; a performer's: the briefs naming her or any performer).
function bookBriefs(w: WorldDef, d: PhotobookDef): BriefDef[] {
    const own = w.photo!.briefs.filter(b => b.book === d.id);
    if (own.length) return own;
    if (d.kind === 'person' && d.who === YOU) return [];
    if (d.kind === 'person' && isRosterWho(d.who)) return w.photo!.briefs.filter(b => b.board === 'full' && !b.book && b.kind !== 'wedding' && (b.subject?.who === 'roster' || b.subject?.who === d.who));
    return w.photo!.briefs.filter(b => b.board === 'full' && !b.book && b.kind !== 'wedding' && (d.kind === 'person' ? b.subject?.who === 'cast' : !b.subject || b.subject.who === 'client') && !!b.adult === !!d.adult);
}
// The next brief of a project, when none of its is on the board or open.
function nextBookBrief(g: Save, w: WorldDef, bk: Book): void {
    const p = peekPhoto(g), d = defOf(w, bk.def);
    if (!d || d.who === YOU || p.board.some(o => o.book === bk.id) || p.open.some(t => t.book === bk.id)) return;
    const list = bookBriefs(w, d), star = isRosterWho(d.who) ? rosterPerformer(w, d.who) : undefined;
    for (let i = 0; i < list.length; i++) {
        const b = list[(bk.briefs + (bk.missed ?? 0) + i) % list.length];
        if (star && !rosterOk(g, w, star, b)) continue;
        const x = offerable(g, w, b, 'book');
        if (!x) continue;
        const who = star ? `roster:${star.id}` : d.kind === 'person' && b.subject?.who === 'cast' && d.who ? personNamed(g, d.who)?.avatar : x.who;
        offerBrief(g, w, b, 'book', { ...x, ...(who ? { who } : {}), book: bk.id });
        return;
    }
}

/* ---------- her own photobook: the sittings ---------- */

/** What each sitting is shot in, in words (the photos say it; nobody is drawn). */
export const SITTINGS = ['a white shirt and nothing else', 'black lingerie', 'nothing at all'];
/** Where her sittings are: the hourly rental's studio (the publisher's photographer books it). */
export const sittingAt = (g: Save, w: WorldDef): string => rentalOpen(g, w)?.at ?? '';
const ownProject = (g: Save) => peekPhoto(g).books.find(b => b.def === OWN_BOOK && b.state === 'project') as (Book & { sat?: number }) | undefined;
/** Why she can't sit for her book here now ('' when she can): a project under way, at the studio while it's open, once a day. */
export function sitWhy(g: Save, w: WorldDef): string {
    const bk = ownProject(g);
    if (!bk || !ownBooksOpen(g, w)) return 'No photobook of your own under way.';
    const at = sittingAt(g, w);
    if (!at || g.player.loc !== at) return at ? `At ${placeName(g, w, at)}.` : 'No studio to sit in.';
    if (!openAt(g, w, at)) return 'The studio is closed.';
    if (bk.sat === g.day) return 'One sitting a day.';
    return '';
}
/** A sitting (the action *Sit for your photobook*): the photographer shoots her for two hours; her roll (the world's
 *  adult skill, else Charisma) against the sitting's difficulty makes its quality, held to 0–100, three stars or more a
 *  page of the book. The photo records the studio and the words, nobody drawn. Lines and what the AI is told. */
export function sit(g: Save, w: WorldDef, began = nowAbs(g), rnd = Math.random): { lines: string[]; ai: string } {
    const bk = ownProject(g), d = bk && defOf(w, bk.def), at = g.player.loc;
    if (!bk || !d) return { lines: [], ai: '' };
    const skill = (w.skills ?? []).find(s => s.adult)?.id ?? 'charisma', dc = BOOKS.own.dc;
    const bonus = rollBonus(g, w, { skill, tags: ['photobook', 'pose'] }), d20 = rollD20(g, w, bonus, dc, rnd);
    const total = d20 + bonus, ok = d20 === 20 || (d20 > 1 && total >= dc);
    const q = Math.round(Math.max(0, Math.min(100, 50 + 6 * (total - dc)))), stars = starsOf(q);
    const n = bk.briefs + 1, outfit = SITTINGS[Math.min(SITTINGS.length - 1, bk.briefs)];
    const rec = recordPhoto(g, w, { src: 'book', place: at, who: [], q, stars, client: w.photo!.publisher, adult: true, kind: 'portrait', look: 'digital', at: began,
        cap: `${d.name}, sitting ${n}: you in ${outfit} · ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}` });
    bk.sat = g.day;
    const lines = [`${d.name}, sitting ${n} of ${d.briefs}: quality ${q} (${'★'.repeat(stars)}).`];
    if (stars >= 3) {
        bk.briefs++;
        if (rec) (bk.pages ??= []).push(rec.id);
        if (bk.briefs >= d.briefs) lines.push(...publish(g, w, bk));
        else lines.push(`It goes in the book: ${bk.briefs} of ${d.briefs}.`);
    } else lines.push('Not one for the book: the photographer wants another sitting.');
    lines.push(...trainSkill(g, w, skill, ok ? 4 : 2));
    const how = q >= 85 ? 'brilliantly' : q >= 70 ? 'very well' : q >= 55 ? 'well' : q >= 35 ? 'unevenly' : 'badly';
    const ai = `{{user}} sits for her own photobook, "${d.name}", at ${placeName(g, w, at)}: the publisher's photographer, someone she has never worked with, shoots her in ${outfit} for two hours. It goes ${how}.`;
    return { lines, ai };
}
const sitAct = (bk: Book, d: PhotobookDef): ActionDef => ({ id: `x-book-sit-${bk.id}`, name: 'Sit for your photobook', label: `Sit for your photobook: ${d.name} (${bk.briefs + 1} of ${d.briefs})`, icon: '📚',
    minutes: BOOKS.own.minutes, cost: 0, effects: { energy: -8 }, scene: false, adult: true, tags: ['photo', 'photobook'], fact: '{u} sat for a photobook at {0}.' } as ActionDef);
engineActions.push((g, w) => {
    if (sitWhy(g, w)) return [];
    const bk = ownProject(g)!, d = defOf(w, bk.def);
    return d ? [sitAct(bk, d)] : [];
});
const beforeAct = photoLink.act;
photoLink.act = (g, w, a, mates, began) => (a.id.startsWith('x-book-sit-') ? sit(g, w, began) : beforeAct(g, w, a, mates, began));

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
    if (!photoOn(w) || (!(g as any).photo && !ownBooksOpen(g, w))) return [];   // (her own book needs no camera)
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
