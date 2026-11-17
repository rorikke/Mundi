// Owning a home, on the phone's Homes app: the home you own (its upkeep, what it would sell for, its rooms), your
// second home, homes for sale, the Rooms view (the fixtures that fit a house of yours), and the questions a purchase or
// a move out of a home you own asks first (sell it, keep it as your second home, or let it). The HUD's Rooms row walks
// you to a room of your home that's a place (the terrace, the bath). Homes you let (R-a): each one's state, last week
// and what it brought, Buy to let, taking one back with a week's notice, moving into an empty one. The numbers are the
// engine's (sim/owning.ts, sim/fixtures.ts, sim/letting.ts); nothing here counts anything.
import { esc, game, toast, notify, saveGame } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { safeUrl } from '../core/safe.js';
import { worldFile } from '../core/world.js';
import { money } from '../sim/needs.js';
import { refreshPrompt } from '../sim/prompt.js';
import { homeAddress, placeOn, playerHomeId } from '../sim/places.js';
import { homeKey } from '../sim/homes.js';
import { moveTo } from '../sim/work.js';
import { itemDoes } from '../sim/shop.js';
import { billAmount, UPKEEP } from '../sim/bills.js';
import { housingOn, ownedAt, ownedHere, secondHome, zoneOf, sizeOf, guestsOf, resaleOf, SECOND_HOME_ID, lettable, toLet, keptHomes, isLet, MAX_LET } from '../sim/housing.js';
import { forSale, buyHome, sellHome, saleValue, canLeave, letBlock, MAX_HOMES } from '../sim/owning.js';
import { letState, letAverage, canLet, letHome, takeBack, keepLet, makeSecond, moveIntoOwned, noticeEnds, weekNo } from '../sim/letting.js';
import { fixturesFor, buyFixture, fixturesIn } from '../sim/fixtures.js';
import { ownedHomes } from '../sim/housing.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
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
/** Homes for sale, one card per zone (its cheapest free spot): price, upkeep, size, guests, the two ways to buy. */
export function forSaleHtml(g, w, city = '') {
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
/** The Rooms view of a house of yours: what it has, what fits, Buy. */
export function roomsHtml(g, w) {
    const o = ownedAt(g, HU.rooms);
    if (!o) {
        HU.rooms = '';
        return '';
    }
    const z = zoneOf(w, o.zone), list = fixturesFor(g, w, HU.rooms);
    const row = (x) => {
        const does = itemDoes(g, w, x.f);
        const room = x.f.room && w.places.find(p => p.id === x.f.room);
        return `<article class="mu-fix ${x.have ? 'is-have' : ''}"><i>${esc(x.f.icon || '🏠')}</i>
            <span><b>${esc(x.f.name)}</b>${x.f.desc ? `<small>${esc(x.f.desc)}</small>` : ''}${does.length ? `<small>${does.map(esc).join(' · ')}</small>` : ''}${room ? `<small>${esc(`Opens ${room.name}`)}</small>` : ''}</span>
            ${x.have ? `<em>${x.came ? 'Came with the house' : 'Yours'}</em>` : `<button class="mu-home-move" data-act="hu-fix" data-id="${esc(x.f.id)}" ${x.why ? `aria-disabled="true" title="${esc(x.why)}"` : ''}>${money(w, x.price)}</button>`}</article>`;
    };
    return `<section class="mu-rooms"><header class="mu-row"><button class="mu-ghost" data-act="hu-rooms" data-k="">${icon('back')}<span>Back</span></button><h4>${esc(homeAddress(w, o))}</h4></header>
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
    const z = zoneOf(w, a.zone);
    return box('Move out of a home you own', `<p>You own the home you live in. Before moving to ${esc(z?.name ?? '')}: sell it, keep it as your second home, or let it?</p>`, leaveButtons('hu-move-go', `data-zone="${esc(a.zone)}"`, 0));
}
/** The HUD's rows at a home of yours: the rooms that are places (walk there), and back inside from one. */
export function roomRows(g, w) {
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
        toast('Added to your home.', 'success');
        saveGame();
        refreshPrompt();
        notify();
    },
    'hu-go': async (el) => { const { travelTo } = await import('./map.js'); await travelTo(el.dataset.loc); },
});
/** The Homes app's Move button: a home you own asks first (sell it, or keep it as the second). */
export function askLeave(g, w, zone) {
    if (!housingOn(w) || !ownedHere(g))
        return false;
    HU.ask = { kind: 'leave', zone };
    notify();
    return true;
}
