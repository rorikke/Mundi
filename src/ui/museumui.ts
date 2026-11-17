// The museum's screens (track 5 of end-game spending), drawn inside the Collection app (ui/collection.ts): the Museum
// tab (the cases at home, the offer, then renown and its next level, last week's visitors, the show, the workshop's
// restorations and replicas, the upgrades), the Dealer tab (this week's stock, the days left, asking for a piece), the
// Sales tab (the next sale, its lots with estimates and the four top bids, the other collector's likely lots once the
// curator is close enough to say, an in-person card, past results) and the Here tab (pieces sold where you are, or at a
// festival's stall). Also the scene's "Museum pieces" row and the sale's in-person card, and a person's tier on their
// People page. (nature) The Museum tab's Dig card (on now or when it comes back, days dug and finds this season, what's
// left of its pieces) and the workshop's Mount row for a piece of parts; the Here tab's "Could turn up here now". The
// engine owns every number (sim/museum.ts, sim/market.ts, sim/tiers.ts, sim/dig.ts); this file only draws and calls,
// and every value from the world goes through esc() (names and plaques in data-notr), pictures through safeUrl.
import { esc, game, toast, notify, saveGame, type Save } from '../core/store.js';
import { getWorld, worldFile, type WorldDef, type DigDef, type SlotDef } from '../core/world.js';
import { money } from '../sim/needs.js';
import { refreshPrompt } from '../sim/prompt.js';
import { setPrompt } from '../st/bridge.js';
import { percentOf } from '../sim/collection.js';
import * as M from '../sim/museum.js';
import * as K from '../sim/market.js';
import { digOf, digsOf, digStatesOf, digPool, thisSeason, seasonsDug, missingParts, findsHere, mountsHere, mountPiece, DIG } from '../sim/dig.js';
import { whenHolds, parseWhen } from '../sim/when.js';
import { tierOf, tierReached } from '../sim/tiers.js';
import { tierNo } from '../sim/romance.js';
import { SEASONS, seasonDays } from '../sim/time.js';
import { ACT, INPUT } from './reg.js';
import { loanCard } from './rivalui.js';   // (C-7)

/** In memory only: the piece picked in the Dealer tab's "Ask for a piece". */
export const MU = { ask: '' };

const n = (x: number) => String(Math.round(x));
const plural = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('{0}', n(k)));
const slotOf = (w: WorldDef, id: string) => w.collection?.slots.find(s => s.id === id);
const off = (why: string) => (why ? `aria-disabled="true" title="${esc(why.replace(/\.$/, ''))}"` : '');
/** A piece's picture (the art track's, through the world's files), else its emoji. */
export function piecePic(w: WorldDef, pic: string | undefined, icon: string | undefined, cls = 'mu-mu-pic'): string {
    const src = pic ? worldFile(w, pic) : '';
    return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy">` : `<i class="${cls} is-emoji" aria-hidden="true">${esc(icon ?? '❔')}</i>`;
}
/** A price band for a missing piece: ¥ to ¥¥¥¥¥ by its rung (none for a free one). */
export const priceBand = (rung: number) => (rung > 0 ? '¥'.repeat(Math.min(5, rung)) : '');
const seasonWord = (g: Save, day: number) => SEASONS[Math.floor((Math.max(1, day) - 1) / seasonDays(g)) % 4].name.toLowerCase();
/** How a piece came, in words ("From the dealer, day 212", "Won at the spring sale for ¥620,000"). */
export function howItCame(g: Save, w: WorldDef, got: { day: number; src?: string; paid?: number; back?: boolean; replica?: boolean; dig?: string }): string {
    if (got.back) return 'Before the record began';
    const d = n(got.day), paid = got.paid ? money(w, got.paid) : '';
    switch (got.replica ? 'replica' : got.src) {
        case 'find': return `Found on day ${d}`;
        case 'sold': return paid ? `Bought for ${paid} on day ${d}` : `Bought on day ${d}`;
        case 'festival': return paid ? `From a festival stall for ${paid}, day ${d}` : `From a festival stall, day ${d}`;
        case 'dealer': return paid ? `From the dealer for ${paid}, day ${d}` : `From the dealer, day ${d}`;
        case 'auction': return paid ? `Won at the ${seasonWord(g, got.day)} sale for ${paid}` : `Won at the ${seasonWord(g, got.day)} sale`;
        case 'replica': return `Made by the workshop, day ${d}`;
        case 'story': return `A gift, day ${d}`;
        case 'dig': {   // (nature) on long loan from a lending dig in a museum world
            const dg = got.dig ? digOf(w, got.dig) : undefined, year = n(Math.floor((Math.max(1, got.day) - 1) / (seasonDays(g) * 4)) + 1);
            if (!dg) return `From a dig, day ${d}`;
            return dg.lend && M.museumOn(w) ? `On long loan from ${dg.name}, ${seasonWord(g, got.day)} of year ${year}` : `From ${dg.name}, ${seasonWord(g, got.day)} of year ${year}`;
        }
        default: return `Day ${d}`;
    }
}
/** Where a piece of yours is: on show in its wing, in the first room, in a case at home, or boxed. */
export const whereWords = (at: string | undefined, open: boolean) => (at === 'wing' ? 'On show' : at === 'room' ? 'In the first room' : at === 'home' ? 'In a case at home' : at === 'loan' ? 'On loan for the season' : open ? 'In the store' : 'Boxed');

/* ---------- the Museum tab ---------- */

// What the next renown level brings, from the museum's own numbers.
function nextBrings(g: Save, w: WorldDef, level: number): string[] {
    const m = M.museumDef(w)!, out: string[] = [];
    if (level === 1 && m.auctions) out.push('a catalogue before every sale');
    if (m.dealer?.more && m.dealer.more[0] === level) out.push(`${n(m.dealer.more[1])} pieces at each of the dealer's visits`);
    if (m.auctions?.more && m.auctions.more[0] === level) out.push(`${n(m.auctions.more[1])} lots at every sale`);
    if (level === 3 && (m.dealer || m.auctions) && M.displayHere(g, w).some(s => M.rungOf(s) >= 5)) out.push('the rarest pieces at the dealer\'s and the sales');
    if ((m.renown?.income ?? M.MUSEUM_RENOWN.income) > 0) out.push('more visitors');
    return out;
}
function renownCard(g: Save, w: WorldDef): string {
    const r = M.renownOf(g, w), lv = M.renownLevel(g, w), levels = [...(M.museumDef(w)!.renown?.levels ?? [])].sort((a, b) => a.at - b.at);
    const from = lv.n ? levels[lv.n - 1].at : 0, to = lv.next?.at;
    const bar = to !== undefined ? Math.max(0, Math.min(1, (r - from) / Math.max(1, to - from))) : 1;
    const brings = lv.next ? nextBrings(g, w, lv.n + 1) : [];
    return `<section class="mu-mu-card mu-mu-renown"><h4>Renown</h4>
        <div class="mu-mu-renown-top"><b class="mu-mu-big">${esc(n(r))}</b><span>${lv.n ? `<b data-notr>${esc(lv.name)}</b><small>${esc(`Level ${n(lv.n)} of ${n(levels.length)}`)}</small>` : '<b>Not known yet</b>'}</span></div>
        <span class="mu-cl-bar mu-mu-bar"><b style="width:${Math.round(bar * 100)}%"></b></span>
        ${lv.next ? `<small>${esc(`Next at ${n(lv.next.at)}:`)} <span data-notr>${esc(lv.next.name)}</span>${brings.length ? ` · ${esc(brings.join(', '))}` : ''}</small>` : '<small>The highest level.</small>'}
    </section>${loanCard(g, w)}`;   // (C-7) the rival's foundation borrowing a piece, beside the renown it costs
}
function visitorsLine(g: Save, w: WorldDef): string {
    const st = M.museumOf(g);
    return st?.income !== undefined ? `<small>${esc(`Last week's visitors: ${money(w, st.income)}`)}</small>` : '<small>Visitors pay on Mondays.</small>';
}
function showCard(g: Save, w: WorldDef): string {
    const m = M.museumDef(w)!, s = m.shows;
    if (!s) return '';
    const now = M.showNow(g, w), themes = M.showThemes(g, w);
    if (now) {
        const t = themes.find(x => x.id === now.theme);
        return `<section class="mu-mu-card mu-mu-show is-on"><h4>The show</h4><p><b data-notr>${esc(t?.name ?? now.theme)}</b> <small>${esc(`On until day ${n(now.until)} · renown +${n(s.renown ?? 10)} while it's on`)}</small></p></section>`;
    }
    const why = M.whyNoShow(g, w), min = s.min ?? 6;
    if (!M.hasUpgrade(g, w, 'exhibition')) return `<section class="mu-mu-card mu-mu-show"><h4>The show</h4><p class="mu-muted">${esc(why)}</p></section>`;
    const list = [...themes].sort((a, b) => Number(b.pieces >= min) - Number(a.pieces >= min) || b.pieces - a.pieces);
    return `<section class="mu-mu-card mu-mu-show"><h4>The show</h4><p class="mu-muted">${esc(`Pick a theme: a group with at least ${n(min)} pieces on show. ${money(w, M.museumPrice(g, w, s.price))}, on until the season's end.`)}</p>
        ${why && why !== `You need ${money(w, M.museumPrice(g, w, s.price))}.` ? `<p class="mu-muted">${esc(why)}</p>` : ''}
        <ul class="mu-mu-list">${list.map(t => {
            const no = t.pieces < min ? `${n(t.pieces)} of ${n(min)} on show` : why;
            return `<li class="mu-mu-row ${t.pieces < min ? 'is-off' : ''}" data-theme="${esc(t.id)}"><span><b data-notr>${esc(t.name)}</b><small>${esc(plural(t.pieces, '1 piece on show', '{0} pieces on show'))}${t.held ? ' · shown before' : ''}</small></span>
                <button data-act="mus-show" data-id="${esc(t.id)}" ${off(no)}>Open a show</button></li>`;
        }).join('')}</ul></section>`;
}
function workshopCard(g: Save, w: WorldDef): string {
    const fix = M.toRestore(g, w), reps = M.replicasHere(g, w), mounts = mountsHere(g, w), shop = M.hasUpgrade(g, w, 'workshop');
    if (!fix.length && !reps.length && !mounts.length) return '';
    return `<section class="mu-mu-card"><h4>The workshop</h4><ul class="mu-mu-list">
        ${fix.map(r => `<li class="mu-mu-row" data-piece="${esc(r.id)}"><span><b data-notr>${esc(r.name)}</b><small>${esc(r.find ? 'Damaged find: it counts once restored' : 'Damaged: off the show until restored')}</small></span>
            ${r.ready !== undefined ? `<small>${esc(`Ready on day ${n(r.ready)}`)}</small>` : `<button data-act="mus-restore" data-id="${esc(r.id)}" ${off(!shop ? 'Needs the restoration workshop.' : g.player.money < r.fee ? `You need ${money(w, r.fee)}.` : '')}>${esc(`Restore · ${money(w, r.fee)}`)}</button>`}</li>`).join('')}
        ${reps.map(r => `<li class="mu-mu-row" data-piece="${esc(r.id)}"><span><b data-notr>${esc(r.name)}</b><small>A replica: it fills the slot, at half the renown; the real piece replaces it if it ever comes</small></span>
            <button data-act="mus-replica" data-id="${esc(r.id)}" ${off(g.player.money < r.price ? `You need ${money(w, r.price)}.` : '')}>${esc(`Make a replica · ${money(w, r.price)}`)}</button></li>`).join('')}
        ${mounts.map(v => `<li class="mu-mu-row mu-mu-mount ${v.ready === undefined && v.why ? 'is-off' : ''}" data-piece="${esc(v.id)}"><span><b data-notr>${esc(v.name)}</b>
            <small>${esc(v.ready !== undefined ? 'Every part is in: the workshop is putting it together' : `Every part is in: the workshop can mount it in ${plural(v.days, '1 day', '{0} days')}`)}</small>${v.ready === undefined && v.why ? `<small class="mu-mu-why">${esc(v.why)}</small>` : ''}</span>
            ${v.ready !== undefined ? `<small>${esc(`Ready on day ${n(v.ready)}`)}</small>` : `<button data-act="mus-mount" data-id="${esc(v.id)}" ${off(v.why)}>${esc(`Mount · ${money(w, v.price)}`)}</button>`}</li>`).join('')}
    </ul></section>`;
}
function upgradesCard(g: Save, w: WorldDef): string {
    const list = M.upgradesHere(g, w);
    if (!list.length) return '';
    const hall = (id?: string) => (id ? w.collection?.halls.find(h => h.id === id)?.name : undefined);
    return `<section class="mu-mu-card"><h4>Upgrades</h4><ul class="mu-mu-list">${list.map(v => {
        const opens = hall(v.u.opens), renown = v.u.renown ? `renown +${n(v.u.renown)}` : '';
        return `<li class="mu-mu-row mu-mu-up ${v.owned ? 'is-owned' : v.why ? 'is-off' : ''}" data-up="${esc(v.u.id)}"><i aria-hidden="true">${esc(v.u.icon ?? '🏗️')}</i>
            <span><b data-notr>${esc(v.u.name)}</b>${v.u.desc ? `<small data-notr>${esc(v.u.desc)}</small>` : ''}<small>${opens && !v.u.desc ? `${esc('Puts the whole of')} <span data-notr>${esc(opens)}</span> ${esc('on show')}${renown ? ' · ' : ''}` : ''}${esc(renown)}</small>${!v.owned && v.why ? `<small class="mu-mu-why">${esc(v.why)}</small>` : ''}</span>
            ${v.owned ? '<em>Built</em>' : `<button data-act="mus-up" data-id="${esc(v.u.id)}" ${off(v.why)}>${esc(`Build · ${money(w, v.price)}`)}</button>`}</li>`;
    }).join('')}</ul></section>`;
}
// (nature) A dig's card shows once its story is seen, read from the `seen:` parts of its actions' conditions (Tokyo:
// the notice at Hijiri), or once a day has been dug there.
function digKnown(g: Save, w: WorldDef, d: DigDef): boolean {
    if (digStatesOf(g)[d.id]) return true;
    const seen = d.actions.flatMap(id => parseWhen(w.actions.find(a => a.id === id)?.when).conds.filter(c => c.key === 'seen'));
    return seen.length > 0 && seen.every(c => whenHolds(g, w, `seen: ${c.not ? 'not ' : ''}${c.values.join(' or ')}`));
}
// When a dig comes back, from its condition's `season:` part ("autumn"); '' when it has none.
export function digSeasonWord(d: DigDef): string {
    const c = parseWhen(d.season).conds.find(x => x.key === 'season' && !x.not);
    return c ? c.values.map(v => SEASONS.find(x => x.id === v.toLowerCase())?.name.toLowerCase() ?? v).join(' or ') : '';
}
// One of a dig's pieces you haven't got: its picture, its name, and how far along it is (parts, mounting, not yet).
function digPieceHtml(g: Save, w: WorldDef, d: DigDef, s: SlotDef, pool: Set<string>): string {
    const x = (s.sources ?? []).find(y => y.kind === 'dig' && y.id === d.id), parts = s.parts ?? [];
    const have = parts.length - missingParts(g, s).length, mount = M.museumOf(g)?.mount?.[s.id];
    const state = mount !== undefined ? `Mounting: ready day ${n(mount)}`
        : parts.length && have === parts.length ? 'Ready to mount'
        : parts.length && have ? `${n(have)} of ${n(parts.length)} parts` : '';
    const later = !state && !pool.has(s.id) && !!x?.when && !whenHolds(g, w, x.when) ? 'Not yet' : '';
    return `<li class="mu-mu-chip ${later ? 'is-later' : ''}" data-piece="${esc(s.id)}">${piecePic(w, s.pic, s.icon, 'mu-mu-chip-pic')}<span><b data-notr>${esc(s.name)}</b>${state || later ? `<small>${esc(state || later)}</small>` : ''}</span></li>`;
}
/** (nature) A dig's card in the Museum tab: on now (days dug and finds this season, of its most) or when it comes
 *  back, the seasons dug, and what's left of its pieces. */
function digCard(g: Save, w: WorldDef, d: DigDef): string {
    const now = whenHolds(g, w, d.season, { day: true }), t = thisSeason(g, d.id), most = d.most ?? DIG.most, back = digSeasonWord(d);
    const days = plural(t.days, '1 day dug', '{0} days dug');
    const status = !now ? (back ? `Back in ${back}` : 'Not on now')
        : t.found >= most ? `On now · ${days} · this season's finds are all in (${n(t.found)} of ${n(most)})`
        : `On now · ${days}, ${n(t.found)} of ${n(most)} finds this season`;
    const dug = seasonsDug(g, d.id), place = w.places.find(p => p.id === d.place)?.name ?? d.place;
    const mine = M.displayHere(g, w).filter(s => (s.sources ?? []).some(x => x.kind === 'dig' && x.id === d.id));
    const left = mine.filter(s => !M.hasPiece(g, s.id)), pool = new Set(digPool(g, w, d).map(f => f.s.id));
    const what = !mine.length ? '' : left.length
        ? `<small>${esc(`Still to come: ${n(left.length)} of ${n(mine.length)}`)}</small><ul class="mu-mu-chips">${left.map(s => digPieceHtml(g, w, d, s, pool)).join('')}</ul>`
        : '<small>Everything from this dig is yours.</small>';
    return `<section class="mu-mu-card mu-mu-dig ${now ? 'is-on' : ''}" data-dig="${esc(d.id)}"><h4>The dig</h4><p><b data-notr>${esc(d.name)}</b></p>
        <small>${esc('At')} <span data-notr>${esc(place)}</span></small>
        <p class="mu-mu-dig-now">${esc(status)}</p>
        <small>${esc(dug ? plural(dug, '1 season dug so far', '{0} seasons dug so far') : now && t.days ? 'Your first season' : 'No season dug yet')}${d.lend && M.museumOn(w) ? ` · <span>${esc('its finds come to the museum on long loan')}</span>` : ''}</small>
        ${what}</section>`;
}
const digCards = (g: Save, w: WorldDef) => digsOf(w).filter(d => digKnown(g, w, d)).map(d => digCard(g, w, d)).join('');
/** The Museum tab: before it's yours, the cases at home and the offer; then the museum itself. */
export function museumTab(g: Save, w: WorldDef): string {
    const m = M.museumDef(w)!, st = M.museumOf(g), offer = M.museumOffer(g, w);
    if (!M.museumOpen(g, w)) {
        const shown = M.onShow(g, w), home = [...shown.values()].filter(x => x === 'home').length, had = M.piecesHad(g, w).length;
        const cases = `<section class="mu-mu-card"><h4>At home</h4><p>${esc(`${plural(home, '1 piece', '{0} pieces')} in your display cases (room for ${n(m.cases ?? 6)})${had > home ? `, ${plural(had - home, '1 boxed', '{0} boxed')}` : ''}.`)}</p><small class="mu-muted">At home they're yours to look at; they bring no renown until they're on show in a museum.</small></section>`;
        const take = offer ? `<section class="mu-mu-card mu-mu-offer"><b class="mu-mu-name" data-notr>${esc(offer.name)}</b>
            <p>${esc(`Paid once, with no weekly upkeep. Its first room shows ${n(m.room ?? 12)} pieces; wings, upgrades and shows follow.`)}</p>
            <button class="mu-mu-go" data-act="mus-open" ${off(offer.why)}>${esc(`Take it on · ${money(w, offer.price)}`)}</button>${offer.why ? `<small class="mu-mu-why">${esc(offer.why)}</small>` : ''}</section>`
            : '<p class="mu-muted">No museum of your own yet: keep collecting, and a place may be offered.</p>';
        return `${cases}${take}`;
    }
    const p = percentOf(g, w, false), cur = M.curatorOf(g, w);
    const head = `<section class="mu-mu-card mu-mu-head"><b class="mu-mu-name" data-notr>${esc(m.name)}</b><p><b class="mu-mu-big">${esc(n(p.pct))}%</b> <small>${esc(`${n(p.filled)} of ${n(p.counted)} pieces`)}</small></p>
        <small>${esc(`Yours since day ${n(st!.opened!)}`)}${cur ? ` · ${esc('curator:')} <span data-notr>${esc(cur.name)}</span>` : ''}</small>${visitorsLine(g, w)}</section>`;
    return `${head}${renownCard(g, w)}${showCard(g, w)}${digCards(g, w)}${workshopCard(g, w)}${upgradesCard(g, w)}`;
}

/* ---------- the Dealer tab ---------- */

export function dealerTab(g: Save, w: WorldDef): string {
    const v = K.dealerView(g, w);
    if (!v.on) return '<p class="mu-muted">The dealer calls once the museum is yours.</p>';
    const stock = v.stock.length ? `<ul class="mu-mu-cards">${v.stock.map(x => {
        return `<li class="mu-mu-piece" data-piece="${esc(x.id)}">${piecePic(w, x.pic, x.icon)}<span><b data-notr>${esc(x.name)}</b>
            <small>${esc(money(w, x.price))}${x.asked ? ' · asked for' : ''}${x.late ? ' · back from a sale' : ''}${x.extra ? ' · from the back of the van' : ''}</small></span>
            <button data-act="mus-buy-dealer" data-id="${esc(x.id)}" ${off(x.why)}>Buy</button></li>`;
    }).join('')}</ul>` : '<p class="mu-muted">Nothing left this week.</p>';
    const days = v.days ?? 0;
    const when = `<p class="mu-mu-when">${esc(days ? `${plural(days, '1 day left', '{0} days left')}: the next visit on day ${n(v.next!)}` : 'The next visit is today')}</p>`
        // (C-7) the dealer as a person, and her van at the museum on a visit's day
        + (v.who ? `<p class="mu-mu-who"><span data-notr>${esc(v.who)}</span> ${esc(v.here ? 'is the dealer: her van is outside the museum today.' : 'is the dealer.')}</p>` : '');
    const ask = v.ask ? `<p class="mu-muted">${esc('Asked for:')} <b data-notr>${esc(v.ask.name)}</b> ${esc('— it comes within two visits.')}</p>`
        : v.askable.length ? (() => {
            const pick = v.askable.some(a => a.id === MU.ask) ? MU.ask : v.askable[0].id;
            return `<div class="mu-mu-ask"><label><small>Ask for a piece (it comes within two visits, at 10% more)</small>
                <select data-input="mus-ask-pick">${v.askable.map(a => `<option value="${esc(a.id)}" ${a.id === pick ? 'selected' : ''}>${esc(`${a.name} · ${money(w, a.price)}`)}</option>`).join('')}</select></label>
                <button data-act="mus-ask" data-id="${esc(pick)}">Ask</button></div>`;
        })() : '';
    return `${when}${stock}<section class="mu-mu-card"><h4>Ask the dealer</h4>${ask || '<p class="mu-muted">Nothing to ask for now.</p>'}</section>`;
}

/* ---------- the Sales tab ---------- */

// The curator reads the catalogue once they're close enough (their first tier past the first): the lots the other
// collector will want.
function rivalReader(g: Save, w: WorldDef): string {
    const cur = M.curatorOf(g, w);
    return cur && tierReached(g, cur.avatar) >= 1 ? cur.name : '';
}
const whyLost: Record<string, string> = { outbid: 'outbid by the other collector', money: 'not enough money at the hammer', nobid: 'no bid', unsold: 'not bought back', card: 'let go in the saleroom' };
export function salesTab(g: Save, w: WorldDef): string {
    const v = K.salesView(g, w);
    if (!v.on) return '<p class="mu-muted">The sales know you once the museum is yours.</p>';
    const reader = rivalReader(g, w), next = v.next;
    const head = next !== undefined ? `<section class="mu-mu-card mu-mu-sale"><h4>${esc(`The next sale: day ${n(next)}, ${n(v.hour ?? 0)}:00`)}</h4>
        <small>${esc('At')} <span data-notr>${esc(v.placeName ?? '')}</span> ${esc('· bid by phone with your top bids, or be there as it starts to answer if you are outbid')}</small>${v.who ? `<small><span data-notr>${esc(v.who)}</span> ${esc('is the other collector.')}</small>` : ''}</section>` : '';
    const cards = v.card.map(c => `<section class="mu-mu-card mu-mu-salecard" data-piece="${esc(c.id)}"><p>${esc('The other collector outbids you on')} <b data-notr>${esc(c.name)}</b>.</p>
        <div class="mu-mu-btns"><button data-act="mus-card" data-id="${esc(c.id)}" data-v="1">${esc(`One more step · ${money(w, c.price)}`)}</button><button data-act="mus-card" data-id="${esc(c.id)}" data-v="0">Let it go</button></div></section>`).join('');
    // no lots: the catalogue is still to come, or (after the first) none comes before renown's first level
    const lvl1 = [...(M.museumDef(w)!.renown?.levels ?? [])].sort((a, b) => a.at - b.at)[0];
    const unknown = !!lvl1 && M.renownLevel(g, w).n < 1 && !!(M.museumOf(g)?.sales as K.SalesState | undefined)?.cats;
    const noCatalogue = unknown ? `<p class="mu-muted">${esc('No catalogue this time: the auction houses send them once the museum is')} <span data-notr>${esc(lvl1.name)}</span>.</p>`
        : '<p class="mu-muted">The catalogue comes a week before the sale.</p>';
    const lots = v.lots.length ? `<ul class="mu-mu-cards">${v.lots.map(l => {
        const wants = reader && next !== undefined && K.rivalAt(g, w, next, { id: l.id, est: l.est, back: l.back }).wants;
        return `<li class="mu-mu-piece mu-mu-lot ${wants ? 'is-wanted' : ''}" data-piece="${esc(l.id)}">${piecePic(w, l.pic, l.icon)}<span><b data-notr>${esc(l.name)}</b>
            <small>${esc(l.back ? `Offered back by the other collector at ${money(w, l.est)}` : `Estimate ${money(w, l.est)}`)}</small>
            <small>${esc(l.bid !== undefined ? `Your top bid: ${money(w, l.bid)}` : 'No bid yet')}</small>
            ${wants ? `<small class="mu-mu-rival"><span data-notr>${esc(reader)}</span> ${esc('thinks the other collector wants this one.')}</small>` : ''}</span>
            <div class="mu-mu-bids">${l.bids.map((b, i) => `<button class="${l.bid === b.amount ? 'is-on' : ''}" data-act="mus-bid" data-id="${esc(l.id)}" data-v="${esc(b.mult)}" ${off(b.why)} aria-pressed="${l.bid === b.amount}">${esc(i === 0 ? money(w, b.amount) : `+${n((b.mult - 1) * 100)}%`)}</button>`).join('')}
                ${l.bid !== undefined ? `<button data-act="mus-bid" data-id="${esc(l.id)}" data-v="">No bid</button>` : ''}</div></li>`;
    }).join('')}</ul>` : noCatalogue;
    const past = v.past.length ? `<section class="mu-mu-card"><h4>Past results</h4><ul class="mu-mu-list">${v.past.map(r => `<li class="mu-mu-row ${r.won ? 'is-won' : 'is-lost'}"><span><b data-notr>${esc(r.name)}</b>
        <small>${esc(r.won ? `Day ${n(r.day)} · won for ${money(w, r.paid ?? r.est)}` : `Day ${n(r.day)} · ${r.rival && r.why === 'nobid' ? 'went to the other collector' : whyLost[r.why ?? ''] ?? 'not won'}`)}</small></span></li>`).join('')}</ul></section>` : '';
    return `${head}${cards}${lots}${past}`;
}

/* ---------- the Here tab and the scene's row ---------- */

/** The pieces sold where you are (a place's own while it's open, a festival's stall during its days), and (nature)
 *  what could turn up here now: the things to do here with a missing piece in its window, by name as the tiles say. */
export function hereTab(g: Save, w: WorldDef): string {
    const list = M.piecesHere(g, w), finds = findsHere(g, w);
    if (!list.length && !finds.length) return '<p class="mu-muted">Nothing for the collection is sold here now.</p>';
    const sold = list.length ? `<ul class="mu-mu-cards">${list.sort((a, b) => a.price - b.price).map(o => `<li class="mu-mu-piece" data-piece="${esc(o.id)}">${piecePic(w, o.slot.pic, o.icon)}<span><b data-notr>${esc(o.name)}</b>
        <small>${esc(`${money(w, o.price)}${o.src === 'festival' ? ' · a festival stall' : ''}`)}</small></span>
        <button data-act="mus-buy-here" data-id="${esc(o.id)}" ${off(g.player.money < o.price ? `You need ${money(w, o.price)}.` : '')}>Buy</button></li>`).join('')}</ul>` : '';
    const could = finds.length ? `<section class="mu-mu-card mu-mu-could"><h4>Could turn up here now</h4><ul class="mu-mu-list">${finds.map(f => `<li class="mu-mu-could-row" data-action="${esc(f.id)}"><b data-notr>${esc(f.name)}</b>
        <ul class="mu-mu-chips">${f.pieces.map(p => `<li class="mu-mu-chip" data-piece="${esc(p.id)}">${piecePic(w, p.pic, p.icon, 'mu-mu-chip-pic')}<span><b data-notr>${esc(p.name)}</b></span></li>`).join('')}</ul></li>`).join('')}</ul></section>` : '';
    return `${sold}${could}`;
}
/** (nature) Has the Here tab anything where you are: pieces sold, or a find that could turn up now. */
export const hereHasAny = (g: Save, w: WorldDef): boolean => !!g.player.loc && (M.piecesHere(g, w).length > 0 || findsHere(g, w).length > 0);
/** How many pieces are sold where you are now (0 elsewhere, with the collection off, or none to sell). */
export const piecesHereCount = (g: Save, w: WorldDef): number => (g.player.loc ? M.piecesHere(g, w).length : 0);
/** The scene's rows: "Museum pieces" where a place (or a festival's stall) sells some, as the shop's "Shop here"; and
 *  at the saleroom, the in-person card when the other collector has just outbid you. */
export function museumRows(g: Save, w: WorldDef): string[] {
    const k = piecesHereCount(g, w), out: string[] = [];
    if (k) {
        const stall = M.piecesHere(g, w).every(o => o.src === 'festival');
        out.push(`<button class="mh-act mh-glass mh-pieces-here" data-act="ph-open-collection" data-v="here"><i>🏺</i><b>Museum pieces</b><small>${esc(`${plural(k, '1 for sale', '{0} for sale')}${stall ? ' · a festival stall' : ''}`)}</small></button>`);
    }
    const a = M.museumDef(w)?.auctions;
    if (a && g.player.loc === a.place) for (const c of K.salesView(g, w).card)
        out.push(`<div class="mh-act mh-glass mh-sale-card" role="group" data-piece="${esc(c.id)}"><i>🔨</i><b>${esc('Outbid on')} <span data-notr>${esc(c.name)}</span></b>
            <small><button data-act="mus-card" data-id="${esc(c.id)}" data-v="1">${esc(`One more step · ${money(w, c.price)}`)}</button> <button data-act="mus-card" data-id="${esc(c.id)}" data-v="0">Let it go</button></small></div>`);
    return out;
}

/* ---------- a person's tier (People page) ---------- */

/** Someone who unlocks in tiers (the curator): "Confidante · Tier 1 of 4 · the next at 50%", and what isn't open to ask
 *  yet. Nothing for anyone without tiers. */
export function tierHtml(g: Save, w: WorldDef, avatar: string): string {
    const t = tierOf(g, w, avatar);
    if (!t) return '';
    const pct = typeof t.next?.when === 'string' ? t.next.when.match(/museum:\s*(\d+)%/)?.[1] : undefined;
    const next = t.next ? (pct ? `the next at ${pct}%` : t.needs?.length ? `the next: ${t.needs.join('; ')}` : 'the next one later') : 'the last';
    const line = t.n >= 0 ? `<b data-notr>${esc(t.tier?.name ?? '')}</b> <small>${esc(`· Tier ${n(t.n)} of ${n(t.of - 1)} · ${next}`)}</small>`
        : `<small>${esc(t.needs?.length ? `Closer in tiers: the first once ${t.needs.join('; ')}` : 'Closer in tiers, later')}</small>`;
    const no = tierNo(g, avatar, 'date');
    const yet = no && !no.ever ? `<small class="mu-muted">${esc(no.when ? `Not yet: being together waits until ${no.when}.` : 'Not yet: being together waits.')}</small>` : '';
    return `<p class="mu-mu-tier">${line}${yet}</p>`;
}

/* ---------- handlers ---------- */

const C = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const said = (lines: string[], ok: boolean) => {
    lines.filter(Boolean).forEach((t, i) => toast(t, !ok ? 'warn' : i === 0 ? 'success' : 'info'));
    if (ok) { saveGame(); refreshPrompt(); }
    notify();
};
const one = (why: string, ok: string) => said([why || ok], !why);
const blocked = (el: HTMLElement) => { if (el.getAttribute('aria-disabled') !== 'true') return false; toast(el.title || 'Not now.', 'info'); return true; };
Object.assign(ACT, {
    'mus-open': (el) => { const c = C(); if (!c || blocked(el)) return; const r = M.openMuseum(c.g, c.w); said(r.lines, r.ok); },
    'mus-up': (el) => { const c = C(); if (!c || blocked(el)) return; const r = M.buyUpgrade(c.g, c.w, el.dataset.id!); said(r.lines, r.ok); },
    'mus-show': (el) => { const c = C(); if (!c || blocked(el)) return; const r = M.startShow(c.g, c.w, el.dataset.id!); said(r.lines, r.ok); },
    'mus-restore': (el) => { const c = C(); if (!c || blocked(el)) return; const r = M.restorePiece(c.g, c.w, el.dataset.id!); said(r.lines, r.ok); },
    'mus-replica': (el) => { const c = C(); if (!c || blocked(el)) return; const r = M.makeReplica(c.g, c.w, el.dataset.id!); said(r.lines, r.ok); },
    'mus-mount': (el) => { const c = C(); if (!c || blocked(el)) return; const r = mountPiece(c.g, c.w, el.dataset.id!); said(r.lines, r.ok); },
    'mus-buy-here': (el) => { const c = C(); if (!c || blocked(el)) return; const r = M.buyPiece(c.g, c.w, el.dataset.id!); said(r.lines, r.ok); },
    'mus-buy-dealer': (el) => {
        const c = C(); if (!c || blocked(el)) return;
        const name = slotOf(c.w, el.dataset.id!)?.name ?? '';
        one(K.buyFromDealer(c.g, c.w, el.dataset.id!), `The dealer will deliver ${name}.`);
    },
    'mus-ask': (el) => {
        const c = C(); if (!c) return;
        const id = MU.ask || el.dataset.id!, name = slotOf(c.w, id)?.name ?? '';
        MU.ask = '';
        one(K.askDealer(c.g, c.w, id), `You ask the dealer for ${name}.`);
    },
    'mus-bid': (el) => {
        const c = C(); if (!c || blocked(el)) return;
        const v = el.dataset.v, mult = v ? Number(v) : null;
        one(K.setBid(c.g, c.w, el.dataset.id!, mult), mult === null ? 'Bid withdrawn.' : 'Top bid set.');
    },
    'mus-card': (el) => {
        const c = C(); if (!c) return;
        const lines = K.answerCard(c.g, c.w, el.dataset.id!, el.dataset.v === '1');
        if (lines.length) setPrompt('mundi_roll', `[Rules — at the sale: ${lines.join(' ')} Play the saleroom briefly; do not change the outcome.]`, 0);
        said(lines, true);
    },
});
Object.assign(INPUT, {
    'mus-ask-pick': (el) => { MU.ask = el.value; notify(); },
});
