// The Lens app (phone, system `photography`): your photography in four tabs. Board: the briefs on offer (the small
// board, or the job's full one), each with its client, place, window, deadline, pay at quality 50 and 100, the
// reputation it brings and what it asks for marked have/miss. Open: the briefs taken, with the shoot to set with the
// subject, the shot and what added to it (P-21: the roll, then each part by name), Shoot and Edit when the place's
// actions offer them, Deliver with its stars and pay. Photos: the portfolio first with its strength, then the rest
// newest first, each a layered picture (the place's background, the people's sprites, the camera's look, the frame),
// opening large; the photo keepsakes as a small row. You: reputation, freelance standing, deliveries, contacts, the
// photo studio and the hourly rental, photobooks, Sell your photos. The engine owns every number (sim/photo.ts,
// sim/assignments.ts, sim/freelance.ts, sim/photobooks.ts, sim/studio.ts); this file only draws and calls, and asks the
// AI for a portfolio piece's caption (the engine keeps its own when the answer isn't clean).
import { esc, game, toast, notify, saveGame, SAVE } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { PHOTO_WORDS } from '../core/photo.js';
import { num, safeUrl } from '../core/safe.js';
import { quiet, personaName } from '../st/bridge.js';
import { money, actionsHere } from '../sim/needs.js';
import { priceOf } from '../sim/bills.js';
import { refreshPrompt } from '../sim/prompt.js';
import { placeOf, playerHomeId } from '../sim/places.js';
import { weekday, hm } from '../sim/time.js';
import { earliest } from '../sim/plans.js';
import { photoOn, peekPhoto, photoById, clientOf, briefOf, photoLayers, photoSpriteFolders, loadPhotoSprites, setCaption, starPhoto } from '../sim/photo.js';
import { boardView, openView, youView, photosView, takeBrief, giveUpBrief, shootPlaces, setShoot, deliverBrief, PHOTO_RULES } from '../sim/assignments.js';
import { retainerNow } from '../sim/freelance.js';
import { acceptBook, declineBook } from '../sim/photobooks.js';
import { myStudio, studioZones, rentalOpen, RENTAL_HOURS } from '../sim/studio.js';
import { studioWeekNow } from '../sim/fixtures.js';
import { ACT, INPUT } from './reg.js';
import { itemIco } from './itempic.js';
/** What the app shows (memory only): the tab, the photo open large, the brief whose shoot is being set (its place,
 *  day and time), the brief about to be given back. */
export const LS = { tab: 'board', photo: 0, shoot: 0, place: '', day: 0, time: 0, back: 0 };
SAVE.hooks.push(() => { Object.assign(LS, { tab: 'board', photo: 0, shoot: 0, place: '', day: 0, time: 0, back: 0 }); });
const n = (x) => String(Math.round(num(x)));
const plural = (k, one, many) => (k === 1 ? one : many.replace('{0}', n(k)));
const off = (why) => (why ? `aria-disabled="true" title="${esc(why.replace(/\.$/, ''))}"` : '');
const cash = (w, v) => esc(money(w, num(v)));
const starsText = (k) => { const s = Math.max(0, Math.min(5, Math.round(num(k)))); return `${'★'.repeat(s)}${'☆'.repeat(5 - s)}`; };
const placeName = (g, w, id) => (id === playerHomeId ? 'Home' : placeOf(g, w, id)?.name ?? id);
const KIND_WORDS = { magazine: 'Magazine', wedding: 'Wedding', event: 'Event', portrait: 'Portrait', stock: 'Stock', street: 'Street', festival: 'Festival' };
const kindWord = (k) => KIND_WORDS[k] ?? k;
const dueWords = (d) => (d < 0 ? plural(-d, '1 day late', '{0} days late') : d === 0 ? 'Due today' : d === 1 ? 'Due tomorrow' : `Due in ${n(d)} days`);
const dayWords = (day) => `Day ${n(day)} · ${weekday(day)}`;
/** The action the place offers now with that id (a brief's shoot, the edit, selling photos), if any. */
const actHere = (g, w, id) => actionsHere(g, w).find(a => a.id === id);
/* ---------- the picture ---------- */
const LOOKS = ['phone', 'digital', 'film', 'instant'];
const loading = new Set();
// Reads the sprite lists the photos need (once), then draws again with the expressions each set really has.
export function wantSprites(w, recs) {
    const folders = photoSpriteFolders(w, recs).filter(f => !loading.has(f));
    if (!folders.length)
        return;
    folders.forEach(f => loading.add(f));
    loadPhotoSprites(w, folders).then(() => notify()).catch(() => { });
}
/** A photo drawn from its layers: the place's picture framed and zoomed, the people's sprites on it, the camera's look
 *  (a CSS class); an undeveloped roll as a film canister. */
export function photoPic(g, w, rec, big = false) {
    const L = photoLayers(g, w, rec), size = big ? 'is-big' : '';
    if (L.undeveloped)
        return `<span class="mu-lens-pic is-roll ${size}"><i aria-hidden="true">🎞️</i><small>Not developed yet</small></span>`;
    const x = Math.max(0, Math.min(100, num(L.frame?.[0], 50))), y = Math.max(0, Math.min(100, num(L.frame?.[1], 50))), z = Math.max(1, Math.min(2, num(L.frame?.[2], 1)));
    const bg = safeUrl(L.bg), look = LOOKS.includes(L.look) ? L.look : 'phone';
    const style = `${bg ? `background-image:url("${bg}");` : ''}background-position:${x}% ${y}%;transform:scale(${z});transform-origin:${x}% ${y}%`;
    const sprites = L.sprites.map(s => { const u = safeUrl(s.url); return u ? `<img class="mu-lens-spr is-${s.side === 'left' || s.side === 'right' ? s.side : 'center'}" src="${esc(u)}" alt="" loading="lazy">` : ''; }).join('');
    return `<span class="mu-lens-pic is-${look} ${size} ${bg ? '' : 'is-blank'}"><span class="mu-lens-in"><i class="mu-lens-bg" style="${esc(style)}"></i>${sprites}</span></span>`;
}
const capOf = (r) => r.ai || r.cap;
function thumb(g, w, r) {
    return `<button class="mu-lens-thumb ${r.star ? 'is-starred' : ''}" data-act="lens-photo" data-id="${n(r.id)}">${photoPic(g, w, r)}
        <small data-notr>${esc(capOf(r))}</small>${r.stars ? `<em class="mu-lens-stars">${starsText(r.stars)}</em>` : r.star ? '<em class="mu-lens-stars">★</em>' : ''}</button>`;
}
/* ---------- the Board ---------- */
function needsHtml(list) {
    if (!list.length)
        return '';
    const how = (x) => (x.how === 'yours' ? ' (yours)' : x.how === 'rental' ? ' (rental)' : '');
    return `<ul class="mu-lens-needs">${list.map(x => `<li class="${x.have ? 'is-have' : 'is-miss'}"><i aria-hidden="true">${x.have ? '✓' : '✗'}</i>${esc(x.text)}${esc(how(x))}</li>`).join('')}</ul>`;
}
// What every brief card says: the client, the kind, the brief, where and when, the deadline.
function briefTop(g, w, c) {
    return `<header class="mu-lens-client"><i aria-hidden="true">${esc(c.client.icon ?? '📷')}</i><b data-notr>${esc(c.client.name)}</b><small>${esc(kindWord(c.brief.kind))}</small></header>
        <b class="mu-lens-name" data-notr>${esc(c.brief.name)}</b>${c.brief.text ? `<small class="mu-lens-text" data-notr>${esc(c.brief.text)}</small>` : ''}
        <small class="mu-lens-where"><span data-notr>${esc(c.place)}</span>${c.window ? ` · <span>${esc(c.window)}</span>` : ''} · <span>${esc(dueWords(c.due))}</span></small>
        ${c.subject ? `<small>With <span data-notr>${esc(c.subject)}</span></small>` : ''}`;
}
function boardCard(g, w, c) {
    const rep = c.capped ? 'No more reputation from small gigs' : `Reputation +${esc(String(Math.round(num(c.rep) * 10) / 10))} at five stars`;
    return `<article class="mu-lens-brief" data-offer="${n(c.offer.id)}">${briefTop(g, w, c)}
        <small class="mu-lens-pay">${cash(w, c.pay50)} at quality 50 · ${cash(w, c.pay100)} at 100</small><small>${rep}</small>
        ${needsHtml(c.needs)}
        <button data-act="lens-take" data-id="${n(c.offer.id)}" ${off(c.why)}>Take it</button>${c.why ? `<small class="mu-lens-why">${esc(c.why)}</small>` : ''}</article>`;
}
const LANES = [['wedding', 'A wedding'], ['book', 'For your photobook'], ['full', 'Briefs'], ['small', 'Small gigs'], ['contacts', 'From your contacts']];
function boardTab(g, w) {
    const v = boardView(g, w);
    if (v.kind === 'none')
        return `<p class="mu-muted">${esc(v.why ?? '')}</p>`;
    const head = `<p class="mu-lens-line"><small>${esc(`${n(v.open)} of ${n(v.most)} briefs open`)}</small>${v.kind === 'small' && v.cap ? `<small>${esc(`Small gigs raise your reputation up to ${n(v.cap)}.`)}</small>` : ''}</p>`;
    if (!v.cards.length)
        return `${head}<p class="mu-muted">Nothing on the board right now: new briefs come every few days.</p>`;
    const groups = LANES.map(([lane, name]) => ({ name, list: v.cards.filter(c => c.lane === lane) })).filter(x => x.list.length);
    return `${head}${groups.map(x => `${groups.length > 1 ? `<h4 class="mu-lens-sub">${esc(x.name)}</h4>` : ''}${x.list.map(c => boardCard(g, w, c)).join('')}`).join('')}`;
}
/* ---------- Open ---------- */
/** What added to a shot (P-21): "photography roll 17 vs 12 → 80", then each part by name, then the quality. */
function rollHtml(c) {
    const s = c.shot;
    if (!s)
        return '';
    const sign = (k) => (k > 0 ? `+${n(k)}` : n(k));
    const roll = `photography roll ${n(s.total)} vs ${n(s.dc)}${s.base !== undefined ? ` → ${n(s.base)}` : ''}${s.ok ? '' : ' (missed)'}`;
    return `<div class="mu-lens-roll"><small>${esc(roll)}</small>${c.parts.length ? `<ul>${c.parts.map(p => `<li><span>${esc(p.name)}</span><b>${esc(sign(p.n))}</b></li>`).join('')}</ul>` : ''}
        <small class="mu-lens-q">${esc(`Quality ${n(c.q ?? s.q)}`)}${c.stars ? ` · ${starsText(c.stars)}` : ''}</small></div>`;
}
// The days and times a shoot can be set for: from now to the deadline (a week at most), every half hour 7:00–22:00.
function shootSlots(g, c) {
    const last = Math.min(c.dueDay + PHOTO_RULES.grace, g.day + 6), first = earliest(g), days = [];
    for (let d = g.day; d <= last; d++)
        if (d * 1440 + 22 * 60 >= first)
            days.push(d);
    const day = days.includes(LS.day) ? LS.day : days[0] ?? g.day, times = [];
    for (let m = 7 * 60; m <= 22 * 60; m += 30)
        if (day * 1440 + m >= first)
            times.push(m);
    return { days, times };
}
function shootForm(g, w, c) {
    const id = c.offer.id;
    if (LS.shoot !== id)
        return `<button class="mu-ghost" data-act="lens-shoot-set" data-id="${n(id)}">Set the shoot</button>`;
    const places = shootPlaces(g, w, id), sl = shootSlots(g, c);
    const place = places.some(p => p.id === LS.place) ? LS.place : places[0]?.id ?? '';
    const day = sl.days.includes(LS.day) ? LS.day : sl.days[0], time = sl.times.includes(LS.time) ? LS.time : sl.times[0];
    if (!places.length || day === undefined || time === undefined)
        return `<small class="mu-lens-why">No time left to set a shoot.</small>`;
    return `<div class="mu-lens-form">
        <label class="mu-field"><span>Where</span><select data-input="lens-place">${places.map(p => `<option value="${esc(p.id)}" ${p.id === place ? 'selected' : ''} data-notr>${esc(p.name)}</option>`).join('')}</select></label>
        <div class="mu-row2"><label class="mu-field"><span>Day</span><select data-input="lens-day">${sl.days.map(d => `<option value="${n(d)}" ${d === day ? 'selected' : ''}>${d === g.day ? 'Today' : d === g.day + 1 ? 'Tomorrow' : esc(weekday(d))}</option>`).join('')}</select></label>
            <label class="mu-field"><span>Time</span><select data-input="lens-time">${sl.times.map(t => `<option value="${n(t)}" ${t === time ? 'selected' : ''}>${esc(hm(t))}</option>`).join('')}</select></label></div>
        <span class="mu-lens-btns"><button data-act="lens-shoot-go" data-id="${n(id)}">Ask them</button><button class="mu-ghost" data-act="lens-shoot-cancel">Not now</button></span></div>`;
}
function openCard(g, w, c) {
    const id = c.offer.id, shoot = actHere(g, w, `x-shoot-${id}`), edit = c.canEdit ? actHere(g, w, 'x-photo-edit') : undefined;
    const late = c.late > 0 ? `<small class="mu-lens-why">${esc(c.late === 1 ? 'A day late: paid less if you deliver now.' : `${n(c.late)} days late: paid less if you deliver now.`)}</small>` : '';
    const win = c.brief.window ? `<small class="${c.open ? 'mu-good' : 'mu-muted'}">${esc(c.open ? 'The window is open now.' : `Not now: ${c.window}.`)}</small>` : '';
    const plan = c.plan ? `<small>${esc(`The shoot: ${c.plan}`)}</small>` : c.needsPlan ? shootForm(g, w, c) : '';
    const shootBtn = shoot ? `<button data-act="lens-do" data-id="${esc(shoot.id)}">${esc(c.shot ? 'Shoot it again' : 'Shoot it now')}</button>` : '';
    // (a second try only while it's still allowed: once shot twice, or its window gone, nothing more is said)
    const shootWhy = !shoot && c.shootWhy && !(c.shot && /twice|second try/i.test(c.shootWhy)) ? `<small class="mu-lens-why">${esc(c.shot ? `To shoot it again: ${c.shootWhy}` : c.shootWhy)}</small>` : '';
    const editBtn = edit ? `<button class="mu-ghost" data-act="lens-do" data-id="${esc(edit.id)}">Edit today's shoot</button>` : c.shot && c.editWhy ? `<small class="mu-muted">${esc(`Edit: ${c.editWhy}`)}</small>` : '';
    const deliver = c.canDeliver ? `<button class="mu-primary" data-act="lens-deliver" data-id="${n(id)}">${esc(`Deliver · ${starsText(c.stars ?? 0)} · ${money(w, num(c.payNow))}`)}</button>` : '';
    const back = LS.back === id
        ? `<span class="mu-lens-btns"><small>Give it back? It counts as missed.</small><button class="mu-danger" data-act="lens-back-go" data-id="${n(id)}">Give it back</button><button class="mu-ghost" data-act="lens-back-no">Keep it</button></span>`
        : `<button class="mu-ghost mu-lens-giveup" data-act="lens-back" data-id="${n(id)}">Give it back…</button>`;
    return `<article class="mu-lens-brief is-open" data-open="${n(id)}">${briefTop(g, w, c)}
        ${c.extended ? '<small class="mu-good">The client gave you more days: the weather never came.</small>' : ''}${late}${win}${plan}
        ${needsHtml(c.needs.filter(x => !x.have))}
        ${rollHtml(c)}
        <span class="mu-lens-btns">${shootBtn}${editBtn}${deliver}</span>${shootWhy}${back}</article>`;
}
function openTab(g, w) {
    const v = openView(g, w);
    if (!v.cards.length)
        return '<p class="mu-muted">No briefs open. Take one from the Board.</p>';
    return v.cards.map(c => openCard(g, w, c)).join('');
}
/* ---------- Photos ---------- */
function bigPhoto(g, w, r) {
    const L = photoLayers(g, w, r), c = clientOf(w, r.client), b = briefOf(w, r.brief);
    return `<section class="mu-lens-big">${photoPic(g, w, r, true)}
        <b class="mu-lens-cap" data-notr>${esc(capOf(r))}</b>
        ${c || b ? `<small>${c ? `<span data-notr>${esc(c.name)}</span>` : ''}${c && b ? ' · ' : ''}${b ? `<span data-notr>${esc(b.name)}</span>` : ''}</small>` : ''}
        <small><span data-notr>${esc(placeName(g, w, r.place))}</span> · ${esc(dayWords(r.day))}, ${esc(hm(r.min))}</small>
        ${r.stars ? `<small class="mu-lens-stars">${starsText(r.stars)}${r.q !== undefined ? ` · ${esc(`quality ${n(r.q)}`)}` : ''}</small>` : ''}
        ${L.missing.map(m => `<small class="mu-muted">${esc(m)}</small>`).join('')}
        <button class="mu-ghost" data-act="lens-star" data-id="${n(r.id)}" aria-pressed="${!!r.star}">${r.star ? '★ Starred' : '☆ Star it'}</button></section>`;
}
function photosTab(g, w) {
    const v = photosView(g, w);
    const big = LS.photo ? [...v.portfolio, ...v.rest].find(r => r.id === LS.photo) : undefined;
    wantSprites(w, big ? [big] : [...v.portfolio, ...v.rest]);
    if (big)
        return bigPhoto(g, w, big);
    const keep = v.keepsakes.length ? `<h4 class="mu-lens-sub">Photo keepsakes</h4><div class="mu-lens-keeps">${v.keepsakes.map(k => `<span class="mu-lens-keep">${itemIco(w, w.keepsakes?.find(x => x.id === k.id) ?? k)}<span data-notr>${esc(k.name)}</span>${k.n > 1 ? `<small>×${n(k.n)}</small>` : ''}</span>`).join('')}</div>` : '';
    if (!v.portfolio.length && !v.rest.length)
        return `<p class="mu-muted">No photos yet. Take photos at the city's photo spots, or shoot a brief.</p>${keep}`;
    const roll = v.undeveloped ? `<p class="mu-lens-line"><small>${esc(plural(v.undeveloped, '1 photo waits on an undeveloped roll.', '{0} photos wait on an undeveloped roll.'))}</small></p>` : '';
    const port = v.portfolio.length ? `<h4 class="mu-lens-sub">Portfolio</h4><p class="mu-lens-line"><small>${esc(`Strength ${n(v.strength)} of 100 · ${n(v.portfolio.length)} of 12 pieces`)}</small></p>
        <div class="mu-lens-grid is-portfolio">${v.portfolio.map(r => thumb(g, w, r)).join('')}</div>` : '';
    const rest = v.rest.length ? `${v.portfolio.length ? '<h4 class="mu-lens-sub">Your photos</h4>' : ''}<div class="mu-lens-grid">${v.rest.map(r => thumb(g, w, r)).join('')}</div>` : '';
    return `${roll}${port}${rest}${keep}`;
}
/* ---------- You ---------- */
function bookRow(w, b) {
    const what = b.state === 'offered' ? 'Offered' : b.state === 'project' ? `${n(b.done)} of ${n(b.of)} pieces${b.missed ? ` · ${n(b.missed)} missed` : ''}`
        : b.state === 'published' ? `Published${b.last !== undefined ? ` · last week ${money(w, num(b.last))}` : ''}${b.weeksLeft !== undefined ? ` · ${plural(b.weeksLeft, '1 week left', '{0} weeks left')}` : ''}` : 'Ended';
    const btns = b.state === 'offered' ? `<span class="mu-lens-btns"><button data-act="lens-book-yes" data-id="${n(b.id)}">Accept</button><button class="mu-ghost" data-act="lens-book-no" data-id="${n(b.id)}">Decline</button></span>` : '';
    return `<li class="mu-lens-row" data-book="${n(b.id)}"><span><b data-notr>${esc(b.name)}</b><small>${esc(what)}</small></span>${btns}</li>`;
}
// The home action that sells your photos (a photography roll that pays): run from here when you're home.
const sellAct = (g, w) => actionsHere(g, w).find(a => a.roll?.skill === 'photography' && num(a.roll.success?.money) > 0 && !a.photo);
const sellsAtHome = (w) => (w.actions ?? []).some(a => a.home && a.roll?.skill === 'photography' && num(a.roll.success?.money) > 0 && !a.photo);
function youTab(g, w) {
    const v = youView(g, w), bar = Math.max(0, Math.min(100, num(v.rep)));
    const worldWords = !PHOTO_WORDS.some(x => x.text === v.words) ? ' data-notr' : '';
    const rep = `<section class="mu-lens-card"><h4>Reputation</h4><div class="mu-lens-rep"><b class="mu-lens-big-n">${n(v.rep)}</b><span${worldWords}>${esc(v.words)}</span></div>
        <span class="mu-bond"><i style="width:${bar}%"></i></span>${v.cap !== undefined ? `<small class="mu-muted">${esc(`Small gigs raise it up to ${n(v.cap)}; the job's briefs go further.`)}</small>` : ''}</section>`;
    const fl = v.freelance ? `<section class="mu-lens-card"><h4>Freelance</h4><small><span data-notr>${esc(v.freelance.path)}</span>: <span data-notr>${esc(v.freelance.rank)}</span></small>
        <small>${esc(`${money(w, retainerNow(g, w))} a week with a delivery`)} · ${esc(plural(v.freelance.week, '1 delivery this week', '{0} deliveries this week'))}</small>
        ${v.freelance.how ? `<small class="mu-muted">${esc(v.freelance.how === 'blessing' ? 'You went out on your own with your mentor\'s blessing.' : 'You went out on your own after a falling-out.')}</small>` : ''}</section>` : '';
    const kinds = Object.entries(v.kinds).filter(([, k]) => k > 0);
    const work = `<section class="mu-lens-card"><h4>Your work</h4><small>${esc(plural(v.done, '1 brief delivered', '{0} briefs delivered'))}${kinds.length ? ` · ${kinds.map(([k, x]) => `${esc(kindWord(k))} ${n(x)}`).join(', ')}` : ''}</small>
        <small>${esc(`Portfolio: ${plural(v.pieces, '1 piece', '{0} pieces')} · strength ${n(v.strength)}`)}</small></section>`;
    const contacts = `<section class="mu-lens-card"><h4>Contacts</h4>${v.contacts.length ? `<ul class="mu-lens-list">${v.contacts.map(c => `<li class="mu-lens-row"><i aria-hidden="true">${esc(c.icon ?? '📇')}</i><span><b data-notr>${esc(c.name)}</b>${num(c.day) > 0 ? `<small>${esc(`Since day ${n(c.day)}`)}</small>` : ''}</span></li>`).join('')}</ul>` : '<small class="mu-muted">None yet: clients you work for through the job remember you.</small>'}</section>`;
    const books = (v.books ?? []);
    const bk = books.length ? `<section class="mu-lens-card"><h4>Photobooks</h4><ul class="mu-lens-list">${books.map(b => bookRow(w, b)).join('')}</ul></section>` : '';
    const sell = sellAct(g, w), sells = sellsAtHome(w);
    const sellRow = sell ? `<section class="mu-lens-card"><h4>Sell your photos</h4><button data-act="lens-do" data-id="${esc(sell.id)}">${esc(sell.label)}</button></section>`
        : sells ? '<section class="mu-lens-card"><h4>Sell your photos</h4><small class="mu-muted">From home, now and then: a stock agency buys a set.</small></section>' : '';
    return `${rep}${fl}${work}${studioCard(g, w)}${bk}${contacts}${sellRow}`;
}
function studioCard(g, w) {
    const m = myStudio(g, w), r = rentalOpen(g, w), rows = [];
    if (m)
        rows.push(`<small><b data-notr>${esc(m.z.name)}</b></small><small>${esc(m.st.free ? `Given to you · upkeep ${money(w, studioWeekNow(g, w))} a week` : m.st.way === 'rent' ? `Rented · ${money(w, studioWeekNow(g, w))} a week` : `Yours · upkeep ${money(w, studioWeekNow(g, w))} a week`)}</small>`);
    else if (studioZones(w).length)
        rows.push('<small class="mu-muted">None: rent one in the Homes app.</small>');
    if (r)
        rows.push(`<small>${esc('By the hour:')} <span data-notr>${esc(placeName(g, w, r.at))}</span> · ${esc(`${money(w, priceOf(g, num(r.price)))} an hour, ${n(RENTAL_HOURS)} h at a time`)}</small>`);
    return rows.length ? `<section class="mu-lens-card"><h4>Photo studio</h4>${rows.join('')}</section>` : '';
}
/* ---------- the app ---------- */
/** Something waits in Lens: a book offered, or a brief shot and ready to deliver (the home grid's badge). */
export function lensBadge(g, w) {
    if (!photoOn(w) || !g.photo)
        return false;
    const p = peekPhoto(g);
    return p.books.some(b => b.state === 'offered') || p.open.some(t => !!t.shot);
}
const TABS = [['board', 'Board'], ['open', 'In progress'], ['photos', 'Photos'], ['you', 'You']];
/** The Lens app: the four tabs and the one open (nothing in a world without photo gigs or with the system off). */
export function lensApp(g, w, head) {
    if (!photoOn(w))
        return `${head}<div class="mu-ph-body mu-lens"><p class="mu-muted">No photography in this world.</p></div>`;
    const open = peekPhoto(g).open.length;
    const body = LS.tab === 'open' ? openTab(g, w) : LS.tab === 'photos' ? photosTab(g, w) : LS.tab === 'you' ? youTab(g, w) : boardTab(g, w);
    return `${head}<div class="mu-ph-body mu-lens">
        <nav class="mu-lens-tabs" data-keep="lens-tabs">${TABS.map(([id, name]) => `<button class="${id === LS.tab ? 'is-on' : ''}" data-act="lens-tab" data-v="${id}" aria-pressed="${id === LS.tab}">${esc(name)}${id === 'open' && open ? ` <em>${n(open)}</em>` : ''}</button>`).join('')}</nav>
        <div class="mu-lens-list-body">${body}</div></div>`;
}
/* ---------- the AI's caption for a portfolio piece ---------- */
// One line for the portfolio, asked once the piece is in; the engine's caption stays when the answer isn't clean.
async function askCaption(w, id) {
    const g0 = game(), r = g0 && photoById(g0, id);
    if (!g0 || !r)
        return;
    const c = clientOf(w, r.client), b = briefOf(w, r.brief);
    const who = (r.who ?? []).map(h => h.name).join(' and ');
    const prompt = `${personaName()}, a photographer in ${w.name}, shot this for ${c?.name ?? 'a client'}${b ? `: "${b.name}" (${b.text})` : ''}. `
        + `Where and when: ${r.cap}.${who ? ` In the frame: ${who}.` : ''}\n\nWrite the caption for this photo in their portfolio: one line, at most 24 words, plain text, no quotes, no markup. Reply with the caption only.`;
    try {
        const out = String(await quiet(prompt, 80)).split('\n').map(s => s.trim()).find(Boolean) ?? '';
        const g = game();
        if (!g || g !== g0)
            return;
        if (setCaption(g, id, out)) {
            saveGame();
            notify();
        }
    }
    catch { /* the AI may be offline: the engine's caption stays */ }
}
/* ---------- the buttons ---------- */
const ctxW = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const done = () => { saveGame(); refreshPrompt(); notify(); };
Object.assign(ACT, {
    'lens-tab': (el) => { LS.tab = (TABS.find(t => t[0] === el.dataset.v)?.[0] ?? 'board'); LS.photo = 0; LS.back = 0; notify(); },
    'lens-photo': (el) => { LS.photo = Number(el.dataset.id) || 0; notify(); },
    'lens-star': (el) => { const x = ctxW(); if (!x)
        return; starPhoto(x.g, Number(el.dataset.id)); saveGame(); notify(); },
    'lens-take': (el) => {
        const x = ctxW();
        if (!x)
            return;
        const before = peekPhoto(x.g).open.length, t = takeBrief(x.g, x.w, Number(el.dataset.id));
        if (!t)
            return;
        toast(t, peekPhoto(x.g).open.length > before ? 'success' : 'info');
        if (peekPhoto(x.g).open.length > before)
            LS.tab = 'open';
        done();
    },
    'lens-shoot-set': (el) => { const x = ctxW(); LS.shoot = Number(el.dataset.id) || 0; LS.place = ''; LS.day = x ? x.g.day : 0; LS.time = 0; notify(); },
    'lens-shoot-cancel': () => { LS.shoot = 0; notify(); },
    'lens-shoot-go': (el) => {
        const x = ctxW();
        if (!x)
            return;
        const id = Number(el.dataset.id), c = openView(x.g, x.w).cards.find(k => k.offer.id === id);
        if (!c)
            return;
        const places = shootPlaces(x.g, x.w, id), sl = shootSlots(x.g, c);
        const place = places.some(p => p.id === LS.place) ? LS.place : places[0]?.id, day = sl.days.includes(LS.day) ? LS.day : sl.days[0];
        const times = sl.times, time = times.includes(LS.time) ? LS.time : times[0];
        if (!place || day === undefined || time === undefined)
            return;
        const r = setShoot(x.g, x.w, id, place, day * 1440 + time);
        if (!r.text)
            return;
        toast(r.text, r.ok ? 'success' : 'info');
        if (r.ok)
            LS.shoot = 0;
        done();
    },
    // (the place's own actions: shooting and editing take their time like any action, through the scene's handler)
    'lens-do': (el, e) => { const x = ctxW(); if (!x || !actHere(x.g, x.w, el.dataset.id ?? ''))
        return; return ACT.do?.(el, e); },
    'lens-deliver': (el) => {
        const x = ctxW();
        if (!x)
            return;
        const r = deliverBrief(x.g, x.w, Number(el.dataset.id));
        for (const l of r.lines)
            toast(l, r.ok ? 'success' : 'info'); // (a line a notice, so each is translated whole)
        if (!r.ok)
            return;
        done();
        if (r.piece && r.photo !== undefined)
            void askCaption(x.w, r.photo);
    },
    'lens-back': (el) => { LS.back = Number(el.dataset.id) || 0; notify(); },
    'lens-back-no': () => { LS.back = 0; notify(); },
    'lens-back-go': (el) => { const x = ctxW(); if (!x)
        return; const lines = giveUpBrief(x.g, x.w, Number(el.dataset.id)); LS.back = 0; for (const l of lines)
        toast(l, 'info'); done(); },
    'lens-book-yes': (el) => { const x = ctxW(); if (!x)
        return; const t = acceptBook(x.g, x.w, Number(el.dataset.id)); if (t)
        toast(t, 'success'); done(); },
    'lens-book-no': (el) => { const x = ctxW(); if (!x)
        return; const t = declineBook(x.g, x.w, Number(el.dataset.id)); if (t)
        toast(t, 'info'); done(); },
});
Object.assign(INPUT, {
    'lens-place': (el) => { LS.place = el.value; },
    'lens-day': (el) => { LS.day = Number(el.value) || 0; LS.time = 0; notify(); },
    'lens-time': (el) => { LS.time = Number(el.value) || 0; },
});
