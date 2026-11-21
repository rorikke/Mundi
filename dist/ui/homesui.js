// Owning a home, on the phone's Homes app: the home you own (its upkeep, what it would sell for, its rooms), your
// second home, homes for sale, the Rooms view (the fixtures that fit a house of yours), and the questions a purchase or
// a move out of a home you own asks first (sell it, keep it as your second home, or let it). The HUD's Rooms row walks
// you to a room of your home that's a place (the terrace, the bath). Homes you let (R-a): each one's state, last week
// and what it brought, Buy to let, taking one back with a week's notice, moving into an empty one. (photography) Your
// photo studio: yours (rented or bought, what it costs a week, its fixtures, Give it up) or the studios to rent or buy,
// shown with the homes for sale. The numbers are the engine's (sim/owning.ts, sim/fixtures.ts, sim/letting.ts,
// sim/studio.ts); nothing here counts anything.
import { esc, game, toast, notify, saveGame, nowAbs } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { safeUrl } from '../core/safe.js';
import { worldFile } from '../core/world.js';
import { money } from '../sim/needs.js';
import { refreshPrompt } from '../sim/prompt.js';
import { homeAddress, placeOn, playerHomeId } from '../sim/places.js';
import { homeKey } from '../sim/homes.js';
import { moveTo } from '../sim/work.js';
import { itemDoes } from '../sim/shop.js';
import { billAmount, UPKEEP, priceOf, owed, owedAmount } from '../sim/bills.js';
import { housingOn, ownedAt, ownedHere, secondHome, zoneOf, sizeOf, guestsOf, resaleOf, SECOND_HOME_ID, lettable, toLet, keptHomes, isLet, MAX_LET, zonePrice, upkeepOf } from '../sim/housing.js';
import { forSale, buyHome, sellHome, saleValue, canLeave, letBlock, MAX_HOMES } from '../sim/owning.js';
import { letState, letAverage, canLet, letHome, takeBack, keepLet, makeSecond, moveIntoOwned, noticeEnds, weekNo } from '../sim/letting.js';
import { fixturesFor, buyFixture, fixturesIn } from '../sim/fixtures.js';
import { ownedHomes } from '../sim/housing.js';
import { STUDIO_ID, myStudio, studioOf, studioOffers, studioSale, giveUpBlock, rentStudio, buyStudio, giveUpStudio, studioFixtureIds, studioCut, studioZoneOf } from '../sim/studio.js';
import { studioWeekNow } from '../sim/fixtures.js';
import { STUDIO_RENT } from '../sim/bills.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
import { homeRooms, roomNow, enterRoom, roomDoor, roomOf, asleepAt } from '../sim/homerooms.js';
import { syncScene } from '../sim/game.js';
import { itemIco } from './itempic.js';
export const HU = { rooms: '', ask: null };
const pct = (v) => `${Math.round(v * 100)}%`;
const kindPic = (w, kind) => { const im = w.homes.kinds[kind]?.image; return im ? `style="background-image:url('${safeUrl(worldFile(w, im))}')"` : ''; };
const kindName = (w, kind) => w.homes.kinds[kind]?.name ?? kind;
/** The lines under your home's card: owned (its upkeep, what it sells for, Rooms, Sell…), and your second home. */
export function ownedHtml(g, w) {
    if (!housingOn(w))
        return '';
    const live = ownedAt(g, homeKey(g.player.home)), s = secondHome(g);
    if (!live && !s)
        return '';
    const card = (o, second) => {
        const z = zoneOf(w, o.zone), n = fixturesIn(o).length;
        return `<div class="mu-home-owned">
            ${second ? `<article class="mu-home-card"><span class="mu-home-pic" ${kindPic(w, z?.kind ?? '')}></span><div class="mu-home-info"><span><b>${esc(homeAddress(w, o))}</b><small>${esc(kindName(w, z?.kind ?? ''))} · Your second home</small></span></div></article>` : ''}
            <p><b>${second ? 'Yours' : 'You own this home'}</b> · upkeep ${money(w, upkeepWeek(g, w, o))} a week · sells for ${money(w, saleValue(w, o))} (${pct(resaleOf(z))} of what you paid)</p>
            <div class="mu-row"><button class="mu-ghost" data-act="hu-rooms" data-k="${esc(homeKey(o))}">${icon('home')}<span>Rooms and fixtures${n ? ` · ${n}` : ''}</span></button>
            <button class="mu-ghost" data-act="hu-sell" data-k="${esc(homeKey(o))}">${icon('wallet')}<span>Sell…</span></button>
            ${second && lettable(z) ? `<button class="mu-ghost" data-act="hu-let" data-k="${esc(homeKey(o))}" ${btnWhy(canLet(g, w, homeKey(o)))}>${icon('lock')}<span>Let it out…</span></button>` : ''}</div></div>`;
    };
    return `${live ? card(live, false) : ''}${s ? `<h4>Second home</h4>${card(s, true)}` : ''}`;
}
// A button's disabled state and why, when there's a reason.
const btnWhy = (why) => (why ? `aria-disabled="true" title="${esc(why)}"` : '');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** (letting) Homes you let: each one's card, its state this week, last week, what it brought, what you can do. */
export function letHtml(g, w) {
    if (!housingOn(w))
        return '';
    const list = toLet(g);
    if (!list.length)
        return '';
    const card = (o) => {
        const z = zoneOf(w, o.zone), l = o.let, k = esc(homeKey(o)), st = letState(g, w, o);
        const state = st === 'soon' ? 'Let · a tenant from Monday' : st === 'tenant' ? 'Let · a tenant this week' : st === 'vacant' ? 'Let · empty this week: the agent is showing it'
            : st === 'notice' ? `Notice given: the tenant leaves on Monday, in ${plural(l.until - g.day, 'day')}` : 'Empty: yours to let again, move into or sell';
        const last = l.last && l.last.n === weekNo(g.day) - 1 ? (l.last.tenant ? `Last week: ${money(w, l.last.rent - l.last.fee)} after the agent's ${money(w, l.last.fee)}` : 'Last week: no tenant') : '';
        const all = l.weeks ? `${money(w, l.got ?? 0)} in all, over ${plural(l.weeks, 'week')} with a tenant` : '';
        const buttons = st === 'empty'
            ? [`<button class="mu-home-move" data-act="hu-let-go" data-k="${k}" ${btnWhy(canLet(g, w, homeKey(o)))}>Let it again</button>`,
                `<button class="mu-ghost" data-act="hu-movein" data-k="${k}">${icon('home')}<span>Move in…</span></button>`,
                `<button class="mu-ghost" data-act="hu-second" data-k="${k}" ${btnWhy(secondHome(g) ? 'You already have a second home.' : '')}>${icon('home')}<span>Make it my second home</span></button>`]
            : st === 'notice' ? [`<button class="mu-ghost" data-act="hu-keep" data-k="${k}">${icon('lock')}<span>Keep it let</span></button>`]
                : [`<button class="mu-ghost" data-act="hu-take" data-k="${k}">${icon('lock')}<span>Take it back…</span></button>`];
        return `<div class="mu-home-owned mu-home-let"><article class="mu-home-card"><span class="mu-home-pic" ${kindPic(w, z?.kind ?? '')}></span><div class="mu-home-info"><span><b>${esc(homeAddress(w, o))}</b><small>${esc(kindName(w, z?.kind ?? ''))} · ${esc(state)}</small></span></div></article>
            <p>${last ? `<b>${esc(last)}</b> · ` : ''}upkeep ${money(w, upkeepWeek(g, w, o))} a week, on the Home upkeep bill${all ? ` · ${esc(all)}` : ''}</p>
            <div class="mu-row">${buttons.join('')}<button class="mu-ghost" data-act="hu-sell" data-k="${k}">${icon('wallet')}<span>Sell…</span></button></div></div>`;
    };
    return `<section><h4>Homes you let</h4>${list.map(card).join('')}
        <p class="mu-muted">${esc(`An agent finds a tenant most weeks and pays you on Mondays, less a share. You can let ${MAX_LET} homes at most; to have one back, give a week's notice.`)}</p></section>`;
}
// One home's share of the upkeep bill (what it would cost alone).
function upkeepWeek(g, w, o) {
    const all = billAmount(g, w, UPKEEP), list = ownedHomes(g);
    if (list.length <= 1)
        return all;
    const raw = (x) => zoneOf(w, x.zone)?.upkeep ?? 0, sum = list.reduce((a, x) => a + raw(x), 0);
    return sum ? Math.round(all * raw(o) / sum) : 0;
}
/** (photography) The photo studio: yours (how you hold it, what it costs a week and on which bill, its fixtures, Give it
 *  up…), then the studios you could rent or buy instead. '' with housing off or a world without studios. */
export function studioHtml(g, w) {
    if (!housingOn(w))
        return '';
    const m = myStudio(g, w), offers = studioOffers(g, w);
    if (!m && !offers.length)
        return '';
    const mine = m ? (() => {
        const n = studioFixtureIds(g, w).length, week = studioWeekNow(g, w);
        const how = m.st.free ? 'Given to you' : m.st.way === 'rent' ? 'Rented by the week' : 'Yours';
        const pays = m.st.way === 'rent' ? `rent ${money(w, week)} a week, on the Studio rent bill` : `upkeep ${money(w, week)} a week, on the Home upkeep bill`;
        const back = m.st.way === 'buy' && !m.st.free ? ` · sells for ${money(w, studioSale(w, m.st))} (${pct(resaleOf(m.z))} of what you paid)` : '';
        return `<div class="mu-home-owned mu-home-studio"><article class="mu-home-card"><span class="mu-home-pic" ${studioPic(w, m.z)}></span><div class="mu-home-info"><span><b data-notr>${esc(m.z.name)}</b><small><span data-notr>${esc(kindName(w, m.z.kind))}</span> · ${esc(how)}</small></span></div></article>
            <p><b>Your photo studio</b> · ${esc(pays)}${esc(back)}</p>
            ${studioCut(g) ? `<p class="mu-bad">${esc(m.st.way === 'rent' ? "Its rent is a week overdue: pay it to work there again." : "The upkeep is a week overdue: the studio's fixtures are off and you can't work there until it's paid.")}</p>` : ''}
            <div class="mu-row"><button class="mu-ghost" data-act="hu-rooms" data-k="${esc(STUDIO_ID)}">${icon('home')}<span>Fixtures${n ? ` · ${n}` : ''}</span></button>
            <button class="mu-ghost" data-act="hu-studio-off" ${btnWhy(giveUpBlock(g, w))}>${icon('wallet')}<span>Give it up…</span></button></div></div>`;
    })() : '';
    const card = (o) => {
        const size = sizeOf(w, o.z), map = w.maps.find(x => x.id === o.z.map)?.name ?? '';
        const names = [kindName(w, o.z.kind), ...(map ? [map] : [])].map(x => `<span data-notr>${esc(x)}</span>`);
        const facts = [...names, ...[...(o.whyRent !== null ? [`${money(w, o.rent)}/wk`] : []), ...(o.whyBuy !== null ? [`${money(w, o.price)} to buy`, `upkeep ${money(w, o.upkeep)}/wk`] : []), `size ${size}`].map(esc)];
        return `<article class="mu-home-card is-sale"><span class="mu-home-pic" ${studioPic(w, o.z)}></span>
            <div class="mu-home-info"><span><b data-notr>${esc(o.z.name)}</b><small>${facts.join(' · ')}</small>${o.z.desc ? `<small data-notr>${esc(o.z.desc)}</small>` : ''}</span>
            <span class="mu-row">${o.whyRent !== null ? `<button class="mu-home-move" data-act="hu-studio" data-z="${esc(o.z.id)}" data-way="rent" ${btnWhy(o.whyRent)}>Rent</button>` : ''}
            ${o.whyBuy !== null ? `<button class="${o.whyRent !== null ? 'mu-ghost' : 'mu-home-move'}" data-act="hu-studio" data-z="${esc(o.z.id)}" data-way="buy" ${btnWhy(o.whyBuy)}>Buy</button>` : ''}</span></div></article>`;
    };
    return `<section class="mu-studios"><h4>Photo studio</h4>${mine}${offers.length ? `${m ? '<h4>Other studios</h4>' : ''}${offers.map(card).join('')}` : ''}
        <p class="mu-muted">A place to work, never to live in: it isn't one of your homes. One studio at a time: taking another gives up the one you have. Rented, it's a weekly rent; bought, a weekly upkeep, and sold back it returns part of what you paid (its fixtures stay with it).</p></section>`;
}
// A studio's picture: its own, else its kind's.
const studioPic = (w, z) => { const im = z.image ?? w.homes.kinds[z.kind]?.image; return im ? `style="background-image:url('${safeUrl(worldFile(w, im))}')"` : ''; };
/** Homes for sale, one card per zone (its cheapest free spot): price, upkeep, size, guests, the two ways to buy.
 *  (photography) The photo studio's section comes first, so the Homes app (ui/phone.ts) shows it without a change. */
export function forSaleHtml(g, w, city = '') {
    return `${studioHtml(g, w)}${homesForSale(g, w, city)}`;
}
function homesForSale(g, w, city) {
    if (!housingOn(w))
        return '';
    const all = forSale(g, w);
    if (!all.length && !w.homes.zones.some(z => (z.price ?? 0) > 0))
        return '';
    const byZone = new Map();
    for (const s of all)
        byZone.set(s.zone, [...(byZone.get(s.zone) ?? []), s]);
    const cards = [...byZone.values()].filter(l => !city || zoneOf(w, l[0].zone)?.map === city).map(l => {
        const s = l[0], z = zoneOf(w, s.zone), guests = guestsOf(w, z.kind);
        const live = whyNotBuy(g, w, s, 'live'), second = s.second && whyNotBuy(g, w, s, 'second'), toLetWhy = s.let && whyNotBuy(g, w, s, 'let');
        return `<article class="mu-home-card is-sale"><span class="mu-home-pic" ${kindPic(w, z.kind)}></span>
            <div class="mu-home-info"><span><b>${esc(z.name)}</b><small>${esc(kindName(w, z.kind))} · ${money(w, s.price)} · upkeep ${money(w, s.upkeep)}/wk · size ${s.size}${guests ? ` · parties of ${guests}` : ''} · ${l.length} for sale</small>${(z.rent ?? 0) > 0 ? '' : '<small>Only for sale</small>'}</span>
            <span class="mu-row"><button class="mu-home-move" data-act="hu-buy" data-k="${esc(s.key)}" data-as="live" ${live ? `aria-disabled="true" title="${esc(live)}"` : ''}>Buy</button>
            ${s.second ? `<button class="mu-ghost" data-act="hu-buy" data-k="${esc(s.key)}" data-as="second" ${second ? `aria-disabled="true" title="${esc(second)}"` : ''}>As a second home</button>` : ''}
            ${s.let ? `<button class="mu-ghost" data-act="hu-buy" data-k="${esc(s.key)}" data-as="let" ${btnWhy(toLetWhy || '')}>Buy to let</button>` : ''}</span></div></article>`;
    });
    return `<section><h4>Homes for sale</h4>${cards.join('') || '<p class="mu-muted">Nothing for sale here right now.</p>'}
        <p class="mu-muted">Bought outright, no rent: a weekly upkeep instead. You can own two homes: the one you live in and a second. Sold back, a home returns part of what you paid; its rooms and fixtures stay with it.</p></section>`;
}
// Why a purchase can't happen now, without asking the questions a purchase asks (selling or keeping your home).
function whyNotBuy(g, w, s, as) {
    if (as === 'let')
        return letBlock(g, w, s.zone) || (g.player.money < s.price ? 'Not enough money.' : '');
    if (as === 'second')
        return secondHome(g) ? 'You already have a second home.' : keptHomes(g).length >= MAX_HOMES ? 'You can own two homes at most.' : g.player.money < s.price ? 'Not enough money.' : '';
    const living = ownedHere(g), sale = living ? saleValue(w, ownedAt(g, homeKey(g.player.home))) : 0;
    if (keptHomes(g).length >= MAX_HOMES && !living)
        return 'You can own two homes at most.';
    return g.player.money + sale < s.price ? 'Not enough money.' : '';
}
/** The Rooms view of a house of yours (or your photo studio's fixtures): what it has, what fits, Buy. */
export function roomsHtml(g, w) {
    const studio = HU.rooms === STUDIO_ID ? myStudio(g, w) : null;
    const o = studio ? null : ownedAt(g, HU.rooms);
    if (!o && !studio) {
        HU.rooms = '';
        return '';
    }
    const z = o ? zoneOf(w, o.zone) : studio.z, list = fixturesFor(g, w, HU.rooms);
    const row = (x) => {
        const does = itemDoes(g, w, x.f);
        const room = x.f.room && w.places.find(p => p.id === x.f.room);
        return `<article class="mu-fix ${x.have ? 'is-have' : ''}">${itemIco(w, x.f, '🏠')}
            <span><b>${esc(x.f.name)}</b>${x.f.desc ? `<small>${esc(x.f.desc)}</small>` : ''}${does.length ? `<small>${does.map(esc).join(' · ')}</small>` : ''}${room ? `<small>${esc(`Opens ${room.name}`)}</small>` : ''}</span>
            ${x.have ? `<em>${x.came ? (studio ? 'Came with the studio' : 'Came with the house') : 'Yours'}</em>` : `<button class="mu-home-move" data-act="hu-fix" data-id="${esc(x.f.id)}" ${x.why ? `aria-disabled="true" title="${esc(x.why)}"` : ''}>${money(w, x.price)}</button>`}</article>`;
    };
    if (studio)
        return `<section class="mu-rooms"><header class="mu-row"><h4 data-notr>${esc(studio.z.name)}</h4></header>
        <p class="mu-muted"><span data-notr>${esc(kindName(w, studio.z.kind))}</span> · size ${sizeOf(w, studio.z)}. Fixtures are bought for this studio and stay with it; they work while you're there and its bill is paid.</p>
        ${list.length ? list.map(row).join('') : '<p class="mu-muted">Nothing fits this studio.</p>'}</section>`;
    return `<section class="mu-rooms"><header class="mu-row"><h4>${esc(homeAddress(w, o))}</h4></header>
        <p class="mu-muted">${esc(kindName(w, z?.kind ?? ''))} · size ${sizeOf(w, z)}. Rooms and fixtures are bought for this house and stay with it; of what you own, only the best of each kind of help counts.</p>
        ${list.length ? list.map(row).join('') : '<p class="mu-muted">Nothing fits this home.</p>'}</section>`;
}
/** The question a purchase, a sale or a move out of a home you own asks first. */
export function askHtml(g, w) {
    const a = HU.ask;
    if (!a)
        return '';
    const box = (title, body, buttons) => `<div class="mu-dlg-veil" data-act="hu-cancel"></div><div class="mu-panel mu-scpick mu-hu-ask" role="dialog"><header><h3>${esc(title)}</h3><button class="mu-ibtn mu-ghost" data-act="hu-cancel" aria-label="Close">${icon('x')}</button></header>${body}<div class="mu-row">${buttons}<button class="mu-ghost" data-act="hu-cancel">Cancel</button></div></div>`;
    const mine = ownedAt(g, homeKey(g.player.home)), mineValue = mine ? saleValue(w, mine) : 0;
    const leaveButtons = (act, extra, cost) => [
        `<button class="mu-primary" data-act="${act}" ${extra} data-leave="sell" ${canLeave(g, w, 'sell', cost) ? 'aria-disabled="true"' : ''}>Sell my home (${money(w, mineValue)})</button>`,
        `<button class="mu-ghost" data-act="${act}" ${extra} data-leave="second" ${canLeave(g, w, 'second', cost) ? `aria-disabled="true" title="${esc(canLeave(g, w, 'second', cost))}"` : ''}>Keep it as my second home</button>`,
        ...(mine && lettable(zoneOf(w, mine.zone)) ? [`<button class="mu-ghost" data-act="${act}" ${extra} data-leave="let" ${btnWhy(canLeave(g, w, 'let', cost))}>Let it out</button>`] : []),
    ].join('');
    const letTerms = (zone) => { const a = letAverage(g, w, zone); return `A tenant about ${pct(a.chance)} of weeks pays ${money(w, a.rent)} a week, less the agent's ${money(w, a.fee)}; the upkeep, ${money(w, a.upkeep)} a week, is yours either way: about ${money(w, a.avg)} a week on average.`; };
    if (a.kind === 'buy') {
        const s = forSale(g, w).find(x => x.key === a.key);
        if (!s) {
            HU.ask = null;
            return '';
        }
        const z = zoneOf(w, s.zone);
        const body = `<p>${esc(s.name)}: ${money(w, s.price)}, then ${money(w, s.upkeep)} a week of upkeep. Sold back, it returns ${pct(resaleOf(z))} of what you paid.</p>${a.as === 'let' ? `<p>${esc(letTerms(s.zone))} The first tenant can come on Monday.</p>` : ''}${a.as === 'live' && mine ? `<p>You own the home you live in now. Sell it, keep it as your second home, or let it?</p>` : ''}`;
        return box(a.as === 'live' ? 'Buy and move in' : a.as === 'let' ? 'Buy to let' : 'Buy a second home', body, a.as === 'live' && mine ? leaveButtons('hu-buy-go', `data-k="${esc(a.key)}" data-as="live"`, s.price) : `<button class="mu-primary" data-act="hu-buy-go" data-k="${esc(a.key)}" data-as="${a.as}">Buy for ${money(w, s.price)}</button>`);
    }
    if (a.kind === 'sell') {
        const o = ownedAt(g, a.key);
        if (!o) {
            HU.ask = null;
            return '';
        }
        const living = a.key === homeKey(g.player.home), s = secondHome(g);
        const body = `<p>${esc(homeAddress(w, o))} sells for ${money(w, saleValue(w, o))} (${pct(resaleOf(zoneOf(w, o.zone)))} of the ${money(w, o.paid)} you paid). Its rooms and fixtures go with it; what's owed on the upkeep is paid from the sale.</p>${isLet(o) ? '<p>Its tenant stays with the new owner.</p>' : ''}${living ? (s ? `<p>You'd move into your second home, ${esc(homeAddress(w, s))}.</p>` : '<p>You live here: to sell it, move out (rent a home below, or buy one), and say you sell it then.</p>') : ''}`;
        return box('Sell this home', body, !living || s ? `<button class="mu-primary" data-act="hu-sell-go" data-k="${esc(a.key)}">Sell for ${money(w, saleValue(w, o))}</button>` : '');
    }
    if (a.kind === 'let') {
        const o = ownedAt(g, a.key);
        if (!o) {
            HU.ask = null;
            return '';
        }
        return box('Let it out', `<p>${esc(`${homeAddress(w, o)} stops being your second home.`)} ${esc(letTerms(o.zone))} The first tenant can come on Monday.</p>`, `<button class="mu-primary" data-act="hu-let-go" data-k="${esc(a.key)}" ${btnWhy(canLet(g, w, a.key))}>Let it out</button>`);
    }
    if (a.kind === 'take') {
        const o = ownedAt(g, a.key);
        if (!o?.let) {
            HU.ask = null;
            return '';
        }
        const tenant = letState(g, w, o) === 'tenant', n = noticeEnds(g.day) - g.day;
        return box('Take it back', tenant ? `<p>${esc(`A tenant lives at ${homeAddress(w, o)} this week. With a week's notice they leave on Monday, in ${plural(n, 'day')}, paying the rent to the end.`)}</p>` : `<p>${esc(`Nobody lives at ${homeAddress(w, o)} this week: it's yours again at once.`)}</p>`, `<button class="mu-primary" data-act="hu-take-go" data-k="${esc(a.key)}">${tenant ? 'Give notice' : 'Take it back'}</button>`);
    }
    if (a.kind === 'movein') {
        const o = ownedAt(g, a.key);
        if (!o?.let) {
            HU.ask = null;
            return '';
        }
        return box('Move in', `<p>${esc(`Move into ${homeAddress(w, o)}? No deposit: it's yours.`)}</p>${mine ? '<p>You own the home you live in now. Sell it, keep it as your second home, or let it?</p>' : ''}`, mine ? leaveButtons('hu-movein-go', `data-k="${esc(a.key)}"`, 0) : `<button class="mu-primary" data-act="hu-movein-go" data-k="${esc(a.key)}">Move in</button>`);
    }
    if (a.kind === 'studio') {
        const o = studioOffers(g, w).find(x => x.z.id === a.zone), rented = studioOf(g)?.zone === a.zone ? studioZoneOf(w, a.zone) : undefined;
        if (!o && !(rented && a.way === 'buy')) {
            HU.ask = null;
            return '';
        }
        const z = o?.z ?? rented, cost = a.way === 'rent' ? o.rent : priceOf(g, zonePrice(z));
        const mine = myStudio(g, w), why = a.way === 'rent' ? o.whyRent : o ? o.whyBuy : '';
        const terms = a.way === 'rent' ? `${z.name}: ${money(w, cost)} a week, the first week paid now; the Studio rent bill comes every week after.` : `${z.name}: ${money(w, cost)}, then ${money(w, priceOf(g, upkeepOf(z)))} a week of upkeep on the Home upkeep bill. Sold back, it returns ${pct(resaleOf(z))} of what you paid.`;
        const before = mine && mine.z.id !== z.id ? (mine.st.way === 'rent' ? `You rent ${mine.z.name} now: its rent ends.` : mine.st.free ? `${mine.z.name} was given to you: given up, it's gone for good.` : `${mine.z.name} is sold for ${money(w, studioSale(w, mine.st))}.`) : mine && a.way === 'buy' ? 'The studio you rent becomes yours: its rent ends.' : '';
        return box(a.way === 'rent' ? 'Rent a photo studio' : 'Buy a photo studio', `<p>${esc(terms)}</p>${before ? `<p>${esc(before)}</p>` : ''}`, `<button class="mu-primary" data-act="hu-studio-go" data-z="${esc(z.id)}" data-way="${a.way}" ${btnWhy(why ?? '')}>${a.way === 'rent' ? `Rent for ${money(w, cost)}` : `Buy for ${money(w, cost)}`}</button>`);
    }
    if (a.kind === 'studio-off') {
        const m = myStudio(g, w);
        if (!m) {
            HU.ask = null;
            return '';
        }
        const body = m.st.way === 'rent' ? `The rent of ${m.z.name} ends today${owedNow(g, w) ? `; what's owed, ${money(w, owedNow(g, w))}, is paid first` : ''}. Its fixtures stay with the studio.`
            : m.st.free ? `${m.z.name} was given to you: given up, it's gone for good, with its fixtures.` : `${m.z.name} sells for ${money(w, studioSale(w, m.st))} (${pct(resaleOf(m.z))} of the ${money(w, m.st.paid)} you paid). Its fixtures go with it; what's owed on the upkeep is paid from the sale.`;
        return box('Give up your photo studio', `<p>${esc(body)}</p>`, `<button class="mu-primary" data-act="hu-studio-off-go" ${btnWhy(giveUpBlock(g, w))}>${m.st.way === 'buy' && !m.st.free ? `Sell for ${money(w, studioSale(w, m.st))}` : 'Give it up'}</button>`);
    }
    const z = zoneOf(w, a.zone);
    return box('Move out of a home you own', `<p>You own the home you live in. Before moving to ${esc(z?.name ?? '')}: sell it, keep it as your second home, or let it?</p>`, leaveButtons('hu-move-go', `data-zone="${esc(a.zone)}"`, 0));
}
/** The HUD's room rows, one list from two sources: the rooms inside the home you're at (homerooms: no time passes,
 *  the scene stays) and the rooms of a home you own that are places (housing: the terrace, the onsen), with back
 *  inside from one of those. */
export function roomRows(g, w) {
    return [...innerRooms(g, w), ...placeRooms(g, w)];
}
// (homerooms) every other room of the home you're at; a bedroom says whose it is
function innerRooms(g, w) {
    const here = roomNow(g, w);
    if (!here)
        return [];
    return homeRooms(g, w, g.player.loc).filter(r => r.id !== here.id).map(r => {
        const small = r.bed === 'you' ? 'Your own room' : r.bed ? bedLine(g, w, r.bed, r.id) : 'A room of the house';
        return `<button class="mh-act mh-glass mh-room" data-act="hr-room" data-room="${esc(r.id)}"><i>${r.bed ? '🛏️' : '🚪'}</i><b>${esc(r.bed === 'you' ? 'Go to your room' : `Go to ${r.name}`)}</b><small>${esc(small)}</small></button>`;
    });
}
// (homerooms) a bedroom's row says whether its person is in (and asleep)
function bedLine(g, w, avatar, id) {
    const r = g.cast[avatar];
    if (!r)
        return 'A bedroom';
    if (roomOf(g, w, r) !== id)
        return 'Nobody inside';
    return asleepAt(g, w, r, nowAbs(g)) ? 'Asleep inside' : 'In their room';
}
// (housing) the rooms of a home you own that are places
function placeRooms(g, w) {
    if (!housingOn(w) || !ownedHomes(g).length)
        return [];
    const loc = g.player.loc, here = loc === playerHomeId ? g.player.home.zone : loc === SECOND_HOME_ID ? secondHome(g)?.zone : w.places.find(p => p.id === loc && p.room)?.homeZone;
    if (!here)
        return [];
    const inside = loc === playerHomeId || loc === SECOND_HOME_ID;
    const home = g.player.home.zone === here ? playerHomeId : SECOND_HOME_ID;
    const rooms = w.places.filter(p => p.room && p.homeZone === here && p.id !== loc && placeOn(g, w, p.id));
    return [
        ...rooms.map(p => `<button class="mh-act mh-glass mh-room" data-act="hu-go" data-loc="${esc(p.id)}"><i>🚪</i><b>${esc(`Go to ${p.name}`)}</b><small>A room of your home</small></button>`),
        ...(inside ? [] : [`<button class="mh-act mh-glass mh-room" data-act="hu-go" data-loc="${esc(home)}"><i>🏠</i><b>Back inside</b><small>Your home</small></button>`]),
    ];
}
const asOf = (el) => (el.dataset.as === 'second' ? 'second' : el.dataset.as === 'let' ? 'let' : 'live');
const C = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const done = (msg, ok) => {
    if (msg) {
        toast(msg, 'warn');
        return;
    }
    HU.ask = null;
    toast(ok, 'success');
    saveGame();
    refreshPrompt();
    notify();
};
Object.assign(ACT, {
    // (homerooms) walking to another room inside: no time passes; the scene follows the room
    'hr-room': (el) => {
        const c = C();
        if (!c)
            return;
        const door = roomDoor(c.g, c.w, el.dataset.room ?? ''); // (someone's bedroom: you knock first)
        const why = door.ok ? enterRoom(c.g, c.w, el.dataset.room ?? '') : door.text;
        if (why) {
            toast(why, 'info');
            return;
        }
        if (door.text)
            toast(door.text, 'info');
        saveGame();
        void syncScene().then(notify);
        notify();
    },
    'hu-rooms': (el) => { HU.rooms = el.dataset.k ?? ''; notify(); },
    'hu-cancel': () => { HU.ask = null; notify(); },
    'hu-buy': (el) => { if (el.getAttribute('aria-disabled') === 'true') {
        toast(el.title || 'Not now.', 'info');
        return;
    } HU.ask = { kind: 'buy', key: el.dataset.k, as: asOf(el) }; notify(); },
    'hu-buy-go': (el) => {
        const c = C();
        if (!c)
            return;
        if (el.getAttribute('aria-disabled') === 'true') {
            toast(el.title || 'Not now.', 'info');
            return;
        }
        const as = asOf(el), leave = (el.dataset.leave || undefined);
        const name = forSale(c.g, c.w).find(x => x.key === el.dataset.k)?.name ?? '';
        done(buyHome(c.g, c.w, el.dataset.k, as, leave), as === 'live' ? `${name} is yours. Welcome home.` : as === 'let' ? `${name} is yours, to let from Monday.` : `${name} is your second home.`);
    },
    // (letting) putting a home up, taking it back, keeping it let, an empty one made the second or moved into
    'hu-let': (el) => { if (el.getAttribute('aria-disabled') === 'true') {
        toast(el.title || 'Not now.', 'info');
        return;
    } HU.ask = { kind: 'let', key: el.dataset.k }; notify(); },
    'hu-let-go': (el) => {
        const c = C();
        if (!c)
            return;
        if (el.getAttribute('aria-disabled') === 'true') {
            toast(el.title || 'Not now.', 'info');
            return;
        }
        done(letHome(c.g, c.w, el.dataset.k), 'Let from Monday.');
    },
    'hu-take': (el) => { HU.ask = { kind: 'take', key: el.dataset.k }; notify(); },
    'hu-take-go': (el) => {
        const c = C();
        if (!c)
            return;
        const o = ownedAt(c.g, el.dataset.k), tenant = !!o?.let && letState(c.g, c.w, o) === 'tenant';
        done(takeBack(c.g, c.w, el.dataset.k), tenant ? 'Notice given.' : "It's yours again.");
    },
    'hu-keep': (el) => { const c = C(); if (!c)
        return; done(keepLet(c.g, el.dataset.k), 'The tenant stays.'); },
    'hu-second': (el) => {
        const c = C();
        if (!c)
            return;
        if (el.getAttribute('aria-disabled') === 'true') {
            toast(el.title || 'Not now.', 'info');
            return;
        }
        done(makeSecond(c.g, c.w, el.dataset.k), "It's your second home now.");
    },
    'hu-movein': (el) => { HU.ask = { kind: 'movein', key: el.dataset.k }; notify(); },
    'hu-movein-go': (el) => {
        const c = C();
        if (!c)
            return;
        if (el.getAttribute('aria-disabled') === 'true') {
            toast(el.title || 'Not now.', 'info');
            return;
        }
        const leave = (el.dataset.leave || undefined);
        if (HU.rooms === homeKey(c.g.player.home) && leave === 'sell')
            HU.rooms = '';
        done(moveIntoOwned(c.g, c.w, el.dataset.k, leave), 'Welcome home.');
    },
    'hu-sell': (el) => { HU.ask = { kind: 'sell', key: el.dataset.k }; notify(); },
    'hu-sell-go': (el) => {
        const c = C();
        if (!c)
            return;
        const key = el.dataset.k, o = ownedAt(c.g, key), got = o ? saleValue(c.w, o) : 0;
        if (HU.rooms === key)
            HU.rooms = '';
        done(sellHome(c.g, c.w, key, key === homeKey(c.g.player.home) ? 'second' : undefined), `Sold for ${money(c.w, got)}.`);
    },
    'hu-move-go': (el) => {
        const c = C();
        if (!c)
            return;
        if (el.getAttribute('aria-disabled') === 'true') {
            toast(el.title || 'Not now.', 'info');
            return;
        }
        const leave = el.dataset.leave;
        if (HU.rooms === homeKey(c.g.player.home) && leave === 'sell')
            HU.rooms = '';
        done(moveTo(c.g, c.w, el.dataset.zone, leave), 'You moved.');
    },
    'hu-fix': (el) => {
        const c = C();
        if (!c)
            return;
        if (el.getAttribute('aria-disabled') === 'true') {
            toast(el.title || 'Not now.', 'info');
            return;
        }
        const err = buyFixture(c.g, c.w, HU.rooms, el.dataset.id);
        if (err) {
            toast(err, 'warn');
            return;
        }
        toast(HU.rooms === STUDIO_ID ? 'Added to your studio.' : 'Added to your home.', 'success');
        saveGame();
        refreshPrompt();
        notify();
    },
    'hu-go': async (el) => { const { travelTo } = await import('./map.js'); await travelTo(el.dataset.loc); },
    // (photography) the photo studio: renting or buying one, giving yours up
    'hu-studio': (el) => { if (el.getAttribute('aria-disabled') === 'true') {
        toast(el.title || 'Not now.', 'info');
        return;
    } HU.ask = { kind: 'studio', zone: el.dataset.z, way: el.dataset.way === 'buy' ? 'buy' : 'rent' }; notify(); },
    'hu-studio-go': (el) => {
        const c = C();
        if (!c)
            return;
        if (el.getAttribute('aria-disabled') === 'true') {
            toast(el.title || 'Not now.', 'info');
            return;
        }
        const zone = el.dataset.z, name = studioZoneOf(c.w, zone)?.name ?? '', rent = el.dataset.way !== 'buy';
        if (HU.rooms === STUDIO_ID)
            HU.rooms = '';
        done(rent ? rentStudio(c.g, c.w, zone) : buyStudio(c.g, c.w, zone), rent ? `${name} is your photo studio, by the week.` : `${name} is your photo studio.`);
    },
    'hu-studio-off': (el) => { if (el.getAttribute('aria-disabled') === 'true') {
        toast(el.title || 'Not now.', 'info');
        return;
    } HU.ask = { kind: 'studio-off' }; notify(); },
    'hu-studio-off-go': (el) => {
        const c = C();
        if (!c)
            return;
        if (el.getAttribute('aria-disabled') === 'true') {
            toast(el.title || 'Not now.', 'info');
            return;
        }
        if (HU.rooms === STUDIO_ID)
            HU.rooms = '';
        done(giveUpStudio(c.g, c.w), 'You gave up your photo studio.');
    },
});
// (photography) What's owed now on your studio's rent.
const owedNow = (g, w) => (owed(g, STUDIO_RENT) ? owedAmount(g, w, STUDIO_RENT) : 0);
/** The Homes app's Move button: a home you own asks first (sell it, or keep it as the second). */
export function askLeave(g, w, zone) {
    if (!housingOn(w) || !ownedHere(g))
        return false;
    HU.ask = { kind: 'leave', zone };
    notify();
    return true;
}
