import { priceOf, resetBills, startBill, owedAmount, owed, UPKEEP, bills } from './bills.js';
import { book } from './ledger.js';
import { note } from './facts.js';
import { tallyEvent } from './tally.js';
import { studentLink } from './hooks.js';
import { money } from './needs.js';
import { homeAddress, playerHomeId } from './places.js';
import { homeKey } from './homes.js';
import { housingOn, zoneOf, zonePrice, buyable, resaleOf, upkeepOf, sizeOf, canBeSecond, comesWith, fixtureOf, takenSpots, houses, ownedHomes, ownedAt, ownedHere, secondHome, peekHouses, SECOND_HOME_ID, } from './housing.js';
/** At most this many homes: the one you live in and a second. */
export const MAX_HOMES = 2;
/** What a home of yours sells for: a share of what you paid. */
export const saleValue = (w, o) => Math.round(o.paid * resaleOf(zoneOf(w, o.zone)));
/** Every home you could buy now (free spots of zones with a price), cheapest first; nothing with the system off. */
export function forSale(g, w) {
    if (!housingOn(w))
        return [];
    const taken = takenSpots(g);
    const out = [];
    for (const z of w.homes.zones) {
        if (!buyable(z))
            continue;
        z.spots.forEach(([x, y], i) => {
            if (taken.has(`${z.id}:${x},${y}`))
                return;
            const h = { zone: z.id, x, y, n: i + 1 };
            out.push({ key: homeKey(h), ...h, name: homeAddress(w, h), price: priceOf(g, zonePrice(z)), upkeep: priceOf(g, upkeepOf(z)), size: sizeOf(w, z), second: canBeSecond(z) });
        });
    }
    return out.sort((a, b) => a.price - b.price || a.key.localeCompare(b.key));
}
/** Why you can't leave the home you live in this way ('' when you can). `cost`: what the move needs besides (a deposit,
 *  a price), paid from what you have plus a sale's money. */
export function canLeave(g, w, leave, cost = 0) {
    const o = housingOn(w) && ownedHere(g) ? ownedAt(g, homeKey(g.player.home)) : undefined;
    if (!o)
        return '';
    if (!leave)
        return 'You own this home: sell it or keep it as your second home first.';
    if (leave === 'second' && secondHome(g))
        return 'You already have a second home: sell one of them first.';
    if (leave === 'second' && !canBeSecond(zoneOf(w, o.zone)))
        return "This home can't be a second home: sell it instead.";
    const have = g.player.money + (leave === 'sell' ? saleValue(w, o) - owedAmount(g, w, UPKEEP) : 0);
    return have < cost ? 'Not enough money.' : '';
}
/** Leaves the home you own and live in as `canLeave` allowed: sold, or kept as the second home. */
export function leaveOwned(g, w, leave) {
    const key = homeKey(g.player.home);
    const o = housingOn(w) && ownedHere(g) ? ownedAt(g, key) : undefined;
    if (!o || !leave)
        return;
    if (leave === 'second') {
        houses(g).second = key;
        return;
    }
    sell(g, w, o);
}
/** Buys a home (`key` from `forSale`): to live in (`as: 'live'`, moving in at once; `leave` for a home you own and live
 *  in now) or as a second home. Returns why not, or ''. */
export function buyHome(g, w, key, as, leave) {
    const s = forSale(g, w).find(x => x.key === key);
    if (!s)
        return 'That home is not for sale.';
    const z = zoneOf(w, s.zone);
    const mine = ownedHomes(g).length, livingInOwn = ownedHere(g);
    if (as === 'second') {
        if (!s.second)
            return "This home can't be a second home.";
        if (secondHome(g))
            return 'You already have a second home: sell it first.';
        if (mine >= MAX_HOMES)
            return 'You can own two homes at most: sell one first.';
        if (g.player.money < s.price)
            return `Not enough money (${money(w, s.price)}).`;
    }
    else {
        const student = studentLink.homeBlock(g, w, z.id);
        if (student)
            return student;
        // the home you leave: sold, kept as the second, or (rented) left as moving always did
        const freed = livingInOwn && leave === 'sell' ? 1 : 0;
        if (mine - freed >= MAX_HOMES)
            return 'You can own two homes at most: sell one first.';
        const why = canLeave(g, w, leave, s.price);
        if (why)
            return why;
        if (!livingInOwn && g.player.money < s.price)
            return `Not enough money (${money(w, s.price)}).`;
        leaveOwned(g, w, leave);
    }
    g.player.money -= s.price;
    book(g, `${s.name}: bought`, -s.price);
    houses(g).owned.push({ zone: s.zone, x: s.x, y: s.y, n: s.n, paid: s.price, day: g.day, fix: [], got: comesWith(w, z.kind) });
    tallyEvent(g, 'home_bought');
    if (as === 'second') {
        houses(g).second = key;
        startBill(g, UPKEEP);
        note(g, '{u} bought a second home: {0}.', [s.name], [], g.player.loc, 'home');
    }
    else {
        moveIn(g, w, { zone: s.zone, x: s.x, y: s.y, n: s.n });
        note(g, '{u} bought a home and moved in: {0}.', [s.name], [], g.player.loc, 'home');
    }
    return '';
}
/** Sells a home of yours. The one you live in needs where you go: your second home (`to: 'second'`); to move to a
 *  rented home instead, `moveTo(…, 'sell')` in sim/work.ts sells it on the way. What's owed on the upkeep is paid from
 *  the money first. Returns why not, or ''. */
export function sellHome(g, w, key, to) {
    const o = ownedAt(g, key);
    if (!o)
        return "That home isn't yours.";
    const living = homeKey(g.player.home) === key;
    if (living) {
        const s = secondHome(g);
        if (to !== 'second' || !s)
            return 'Choose where to live first: a home to rent, or your second home.';
        sell(g, w, o);
        houses(g).second = undefined;
        moveIn(g, w, { zone: s.zone, x: s.x, y: s.y, n: s.n, unit: s.unit });
        if (g.player.loc === SECOND_HOME_ID)
            g.player.loc = playerHomeId; // (there now: it's home)
        return '';
    }
    sell(g, w, o);
    return '';
}
// The sale: its money, the upkeep owed paid from it, the house gone with its fixtures.
function sell(g, w, o) {
    const h = houses(g), key = homeKey(o), got = saleValue(w, o);
    const due = owed(g, UPKEEP) ? owedAmount(g, w, UPKEEP) : 0;
    const name = homeAddress(w, o);
    g.player.money += got;
    book(g, `${name}: sold`, got);
    if (due) {
        g.player.money -= due;
        book(g, 'Upkeep owed, paid from the sale', -due);
        const b = bills(g)[UPKEEP];
        if (b) {
            while (owed(g, UPKEEP))
                b.due += 7;
            delete b.paid;
        }
    }
    h.owned = h.owned.filter(x => x !== o);
    if (h.second === key) {
        h.second = undefined;
        if (g.player.loc === SECOND_HOME_ID)
            g.player.loc = playerHomeId;
    } // (sold while you're there: you go home)
    h.sold = (h.sold ?? 0) + 1;
    tallyEvent(g, 'home_sold');
    note(g, '{u} sold a home: {0}.', [name], [], g.player.loc, 'home');
}
// Moving into a home: as `moveTo` does (the rent counts from today, every bill starts fresh; housemates follow you).
function moveIn(g, w, h) {
    const z = zoneOf(w, h.zone);
    g.player.home = { zone: h.zone, kind: z?.kind ?? g.player.home.kind, x: h.x, y: h.y, n: h.n, ...(h.unit ? { unit: h.unit } : {}) };
    g.player.rentPaidDay = g.day;
    resetBills(g, w);
}
/* ---------- an old save, once the world is known ---------- */
/** Schema 8, once the world is known: a tenant paying a zone's rent that a version raised is told once (the flag set by
 *  the migration); and every time, homes the world no longer has are paid back at what you paid, fixtures it no longer
 *  has are dropped (with a line: their price isn't known any more), and a home you own but neither live in nor keep as the second becomes the second (or, with one
 *  already, is sold back at what you paid). Returns what to tell the player ('' when nothing needs saying). */
export function settleHomes(g, w) {
    const p = g.player, said = [];
    if (p.homesTodo) {
        delete p.homesTodo;
        const z = zoneOf(w, p.home?.zone);
        if (z && typeof z.was === 'number' && z.was !== z.rent && z.rent > 0 && p.home.rent === undefined && !ownedHere(g))
            said.push(`Rent at ${z.name} is now ${money(w, priceOf(g, z.rent))} a week (it was ${money(w, priceOf(g, z.was))}).${housingOn(w) && w.homes.zones.some(buyable) ? ' Homes can be bought now: see the Homes app.' : ''}`);
    }
    if (!peekHouses(g).owned?.length)
        return said.join(' ');
    const h = houses(g), live = homeKey(g.player.home);
    for (const o of [...h.owned]) {
        if (!zoneOf(w, o.zone)) {
            g.player.money += o.paid;
            book(g, 'A home the world no longer has, paid back', o.paid);
            h.owned = h.owned.filter(x => x !== o);
            if (h.second === homeKey(o))
                h.second = undefined;
            said.push('A home you owned is gone from this world: what you paid for it was paid back.');
            continue;
        }
        const gone = o.fix.filter(id => !fixtureOf(w, id));
        if (gone.length) {
            o.fix = o.fix.filter(id => fixtureOf(w, id));
            said.push(`${gone.length === 1 ? 'A room or fixture' : `${gone.length} rooms or fixtures`} of your home ${gone.length === 1 ? 'is' : 'are'} gone from this world.`);
        }
        if (o.got)
            o.got = o.got.filter(id => fixtureOf(w, id));
    }
    for (const o of [...h.owned]) {
        const k = homeKey(o);
        if (k === live || k === h.second)
            continue;
        if (!h.second) {
            h.second = k;
            continue;
        }
        g.player.money += o.paid;
        book(g, `${homeAddress(w, o)}: sold back`, o.paid);
        h.owned = h.owned.filter(x => x !== o);
    }
    return said.join(' ');
}
