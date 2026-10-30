// Home: guests on screen. The Calendar's "Visits" tab (invite people from outside, where they sleep, who is here, who
// is on the way), the picker of characters from outside the house (for a visit or a party), the background picker of a
// plan out of the house (a party, a date), and the buttons on a guest (say goodbye; at a party, ask them to stay on).
import { state, notify, esc, game, saveGame, toast, nowAbs } from '../core/store.js';
import { getWorld, isScenario } from '../core/world.js';
import { characters, thumb, charOf } from '../st/bridge.js';
import { charPicker, resetPick } from './charpick.js';
import { bgHead, bgGrid } from './bgpick.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
import { guestOf, guestsNow, housemates, pendingVisits, inviteVisit, cancelVisit, sendHome, setSleep, freeRooms, roomName, doorbell, answerDoor, doorRoom, partyGuest, partyPerson, stayAfterParty, VISIT_DELAY } from '../sim/guests.js';
import { houseParty, partyNow } from '../sim/houseparty.js';
import { startOuting } from '../sim/outing.js';
import { outingId } from '../sim/places.js';
import { syncScene } from '../sim/game.js';
import { refreshPrompt } from '../sim/prompt.js';
import { hm, weekday } from '../sim/time.js';
import { HP, showTransition } from './lifeui.js';
import { PL } from './plans.js';
import { OD } from './outing.js';
/** The Calendar's tab (Home only). */
export const CAL = { tab: 'plans' };
// The visit being prepared; the picker of people from outside (for a visit or the party); the background picker.
const GV = { sel: [] };
const GP = { for: '' };
// the planned party's card: changing who comes
const PE = { open: false };
const GB = { for: '', q: '', sel: '' };
const nm = (g, a) => g.cast[a]?.name ?? String(charOf(a)?.name ?? '');
// "Arrives today at 20:30" (each form whole, so it is translated whole)
const arrives = (g, at) => { const d = Math.floor(at / 1440), t = hm(at % 1440); return d === g.day ? `Arrives today at ${t}` : d === g.day + 1 ? `Arrives tomorrow at ${t}` : `Arrives ${weekday(d)} at ${t}`; };
const chosen = (g, list, del) => list.length ? `<div class="mu-chips mu-guest-chips">${list.map(a => `<span class="mu-chip is-on"><img src="${esc(thumb(a))}" alt=""><span data-notr>${esc(nm(g, a))}</span><button class="mu-ibtn mu-ghost" data-act="${esc(del)}" data-who="${esc(a)}" title="Remove">${icon('x')}</button></span>`).join('')}</div>` : '';
/* ---------- the Calendar's tabs (Home) ---------- */
export function calendarTabs(w) {
    if (!isScenario(w))
        return '';
    return `<div class="mu-chips mu-cal-tabs"><button class="mu-chip ${CAL.tab === 'plans' ? 'is-on' : ''}" data-act="cal-tab" data-v="plans">${icon('calendar')}<span>Calendar</span></button>
        <button class="mu-chip ${CAL.tab === 'visits' ? 'is-on' : ''}" data-act="cal-tab" data-v="visits">${icon('users')}<span>Visits</span></button></div>`;
}
// Where they sleep, as a choice on each guest's row: the sofa, your bedroom, or a housemate's.
function bedSelect(g, w, avatar, s) {
    const cur = s.kind === 'share' ? s.host : s.kind === 'room' ? s.spot : '__you';
    // a bedroom of their own: the empty ones (and the one they have, if they have one)
    const own = freeRooms(g, w, avatar).map(r => [r.spot, `A free bedroom: ${r.name}`, false]);
    if (s.kind === 'room' && !own.some(([v]) => v === s.spot))
        own.unshift([s.spot, `A free bedroom: ${roomName(w, s.spot)}`, false]);
    const opts = [...own, ['__you', 'In your bedroom', false],
        ...housemates(g).map(r => [r.avatar, `In ${r.name}'s bedroom`, false])];
    return `<label class="mu-guest-bed"><span>${icon('moon')}</span><select data-input="gv-bed" data-who="${esc(avatar)}" title="Where they sleep">${opts.map(([v, l, notr]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''} ${notr ? 'data-notr' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
}
export function visitsTab(g, w, tabs = '') {
    const here = guestsNow(g, 'visit'), party = guestsNow(g, 'party');
    const coming = pendingVisits(g);
    GV.sel = GV.sel.filter(a => !g.cast[a] && !coming.some(v => v.avatar === a));
    // a guest: picture, name, when (since / arrives), where they sleep, and a button
    const card = (a, sub, bed, btn) => `<div class="mu-guest-row"><img src="${esc(thumb(a))}" alt=""><div><b data-notr>${esc(nm(g, a))}</b><small>${sub}</small></div>${btn}${bed}</div>`;
    return `<div class="mu-ph-body mu-visits">${tabs}
        ${coming.length ? `<section><h4>On their way</h4>${coming.map(v => card(v.avatar, esc(arrives(g, v.at)), bedSelect(g, w, v.avatar, v.sleep), `<button class="mu-ghost" data-act="gv-cancel" data-who="${esc(v.avatar)}">Call it off</button>`)).join('')}</section>` : ''}
        ${here.length ? `<section><h4>Staying at the house</h4>${here.map(r => card(r.avatar, `Since day ${guestOf(g, r.avatar).since}`, bedSelect(g, w, r.avatar, guestOf(g, r.avatar).sleep), `<button class="mu-ghost" data-act="guest-bye" data-who="${esc(r.avatar)}">Say goodbye</button>`)).join('')}</section>` : ''}
        ${party.length ? `<section><h4>At the party</h4>${party.map(r => card(r.avatar, 'They go home when the party ends.', '', `<button class="mu-ghost" data-act="guest-stay" data-who="${esc(r.avatar)}">Ask to stay</button>`)).join('')}</section>` : ''}
        <section class="mu-ph-card mu-visit-new"><h4>${icon('users')} Invite someone over</h4>
            <small class="mu-muted">Characters from your library who don't live here. They arrive in about an hour and stay at the house (in the common rooms by day) until you say goodbye. Once invited, choose where each one sleeps.</small>
            ${chosen(g, GV.sel, 'gv-del')}
            <button data-act="gp-open" data-for="visit">${icon('plus')}<span>${GV.sel.length ? 'Choose more' : 'Choose who comes'}</span></button>
            <button class="mu-primary" data-act="gv-go" ${GV.sel.length ? '' : 'aria-disabled="true"'}>${icon('send')}<span>Invite</span></button></section>
    </div>`;
}
/* ---------- the party: guests from outside, out of the house ---------- */
// The part of the party form about who comes from outside and where it is (lifeui.ts's housePartyHtml).
export function partyExtraHtml(g, w) {
    HP.guests = HP.guests.filter(a => !g.cast[a]);
    const mates = housemates(g).filter(r => r.met);
    return `<div class="mu-field"><span>Where</span><div class="mu-chips">
            <button class="mu-chip ${HP.where === 'home' ? 'is-on' : ''}" data-act="hp-where" data-v="home">${icon('home')}<span>At home</span></button>
            <button class="mu-chip ${HP.where === 'out' ? 'is-on' : ''}" data-act="hp-where" data-v="out">${icon('map')}<span>Out of the house</span></button></div></div>
        ${HP.where === 'out' ? `<label class="mu-field"><span>Where out</span><input type="text" maxlength="80" data-input="hp-place" data-focus="hpplace" placeholder="a bar downtown, the beach, a rented hall…" value="${esc(HP.place)}"></label>
            ${bgButton('party', HP.bg)}
            <div class="mu-field"><span>Who from the house comes</span>${mates.length ? `<div class="mu-chips">${mates.map(r => `<button class="mu-chip ${HP.people.includes(r.avatar) ? 'is-on' : ''}" data-act="hp-person" data-who="${esc(r.avatar)}"><span data-notr>${esc(r.name)}</span></button>`).join('')}</div>` : '<small class="mu-muted">Nobody you know in the house yet.</small>'}</div>` : ''}
        <div class="mu-field"><span>Guests from outside</span>${chosen(g, HP.guests, 'hp-guest-del')}
            <button data-act="gp-open" data-for="party">${icon('plus')}<span>Invite from outside</span></button>
            <small class="mu-muted">They come when the party starts and go home when it ends (unless you ask them to stay on).</small></div>`;
}
// For the planned party's card: who comes from outside, where, and the way there when it is out of the house.
export function partyCardExtra(g, w) {
    const p = houseParty(g);
    if (!p)
        return '';
    const guests = (p.guests ?? []).map(a => nm(g, a)).filter(Boolean);
    const there = p.out && g.player.loc === outingId(p.out.place);
    if (PE.open) { // changing who comes: the people of the house (out of the house), the guests from outside
        const mates = housemates(g).filter(r => r.met);
        return `${p.out ? `<small>${icon('map')} Out of the house: <b data-notr>${esc(p.out.place)}</b></small>
            <div class="mu-field"><span>Who from the house comes</span><div class="mu-chips">${mates.map(r => `<button class="mu-chip ${p.out.people.includes(r.avatar) ? 'is-on' : ''}" data-act="pe-person" data-who="${esc(r.avatar)}"><span data-notr>${esc(r.name)}</span></button>`).join('')}</div></div>` : ''}
            <div class="mu-field"><span>Guests from outside</span>${chosen(g, p.guests ?? [], 'pe-guest-del')}
                <button data-act="gp-open" data-for="partyEdit">${icon('plus')}<span>Invite from outside</span></button></div>
            <button class="mu-primary" data-act="pe-close">${icon('check')}<span>Done</span></button>`;
    }
    return `${p.out ? `<small>${icon('map')} Out of the house: <b data-notr>${esc(p.out.place)}</b>${p.out.people.length ? ` · with <span data-notr>${esc(p.out.people.map(a => nm(g, a)).filter(Boolean).join(', '))}</span>` : ''}</small>` : ''}
        ${guests.length ? `<small>Guests from outside: <span data-notr>${esc(guests.join(', '))}</span></small>` : ''}
        ${p.out && partyNow(g, w) && !there ? `<button class="mu-primary" data-act="hp-goout">${icon('map')}<span>Go to the party</span></button>` : ''}`;
}
// The planned party's buttons, in one row: call it off (red, on the left, before it starts) and edit the guests (blue, on the right).
export function partyCardButtons(cancel) {
    if (PE.open)
        return '';
    return `<div class="mu-row mu-party-btns">${cancel ? '<button class="mu-danger" data-act="hp-cancel">Call it off</button>' : ''}<button class="mu-primary mu-party-edit" data-act="pe-open">${icon('users')}<span>Edit guests</span></button></div>`;
}
/* ---------- a background for a plan out of the house ---------- */
export function bgButton(target, bg) {
    return `<div class="mu-field"><span>Background</span><button class="mu-ghost mu-plan-bg" data-act="gbg-open" data-for="${esc(target)}">${icon('image')}<span>${bg ? esc(bg.split('/').pop().replace(/\.[a-z0-9]+$/i, '')) : 'Choose a background'}</span></button></div>`;
}
/* ---------- the dialogs (on top of the phone) ---------- */
export function guestDialogsHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    if (!g || !w || !isScenario(w))
        return '';
    if (GP.for) {
        const coming = new Set(pendingVisits(g).map(v => v.avatar));
        const sel = GP.for === 'visit' ? GV.sel : GP.for === 'outing' ? OD.lib : GP.for === 'partyEdit' ? (houseParty(g)?.guests ?? []) : HP.guests;
        const mine = new Set(GP.for === 'partyEdit' ? sel : []); // (guests already at the party stay in the list, to take them off)
        return `<div class="mu-dlg-veil" data-keep="gp-veil" data-act="gp-close"></div><div class="mu-panel mu-scpick mu-glassdlg is-chars" data-keep="gp-dlg" role="dialog"><header><h3>${GP.for === 'visit' ? 'Who comes to stay' : GP.for === 'partyEdit' ? 'Party guests from outside' : GP.for === 'outing' ? 'Who comes out with you' : 'Party guests from outside'}</h3><button class="mu-ibtn mu-ghost" data-act="gp-close" aria-label="Close">${icon('x')}</button></header>
            <p class="mu-muted">Your characters who don't live in the house. Pick one or more.</p>
            ${charPicker({ key: 'guestpick', list: characters().filter(c => (!g.cast[c.avatar] || mine.has(c.avatar)) && !coming.has(c.avatar)), selected: sel, act: 'gp-toggle', multi: true, placeholder: 'Search your characters' })}
            <div class="mu-row mu-dlg-btns"><button class="mu-primary" data-act="gp-close">${icon('check')}<span>Done (${sel.length})</span></button></div></div>`;
    }
    if (GB.for) {
        const grid = `${bgHead('gbg-q', 'gbgq', GB.q)}${bgGrid({ act: 'gbg-pick', q: GB.q, keep: 'gbg', sel: GB.sel, none: `<span class="mu-out-nobg">${icon('x')}</span>`, extra: 'mu-out-bgs' })}`;
        return `<div class="mu-dlg-veil" data-keep="gbg-veil" data-act="gbg-close"></div><div class="mu-panel mu-scpick mu-glassdlg mu-outdlg" data-keep="gbg-dlg" role="dialog"><header><h3>Background</h3><button class="mu-ibtn mu-ghost" data-act="gbg-close" aria-label="Close">${icon('x')}</button></header>${grid}
            <div class="mu-row mu-dlg-btns"><button data-act="gbg-close">Cancel</button><button class="mu-primary" data-act="gbg-use">Use it</button></div></div>`;
    }
    // a visitor at the door: who it is, and how you answer
    const ring = doorbell(g)[0];
    if (ring && g.cast[ring] && !state.generating)
        return `<div class="mu-dlg-veil" data-keep="door-veil"></div><div class="mu-panel mu-dlg mu-glassdlg mu-doorbell" data-keep="door-dlg" role="dialog" aria-label="Doorbell">
        <div class="mu-doorbell-ring">${icon('bell')}</div><h3>Someone is ringing the doorbell</h3>
        <img class="mu-doorbell-face" src="${esc(thumb(ring))}" alt=""><b data-notr>${esc(nm(g, ring))}</b>
        <div class="mu-row mu-dlg-btns"><button data-act="door-open" data-who="${esc(ring)}">${icon('home')}<span>Just open the door</span></button><button class="mu-primary" data-act="door-greet" data-who="${esc(ring)}">${icon('users')}<span>Go and greet them</span></button></div></div>`;
    return '';
}
/* ---------- the buttons on a guest (sprite menu, card) ---------- */
export function guestButtons(g, avatar) {
    const x = guestOf(g, avatar);
    const w = getWorld(g.world);
    if (!x || !w)
        return [];
    if (x.kind === 'visit')
        return [`<button data-act="guest-bye" data-who="${esc(avatar)}">${icon('back')}<span>Say goodbye (end the visit)</span></button>`];
    return partyNow(g, w) ? [`<button data-act="guest-stay" data-who="${esc(avatar)}">${icon('moon')}<span>Ask to stay after the party</span></button>`] : [];
}
/* ---------- actions ---------- */
const gw = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const after = async () => { saveGame(); await syncScene(); refreshPrompt(); notify(); };
Object.assign(ACT, {
    'cal-tab': (el) => { CAL.tab = el.dataset.v === 'visits' ? 'visits' : 'plans'; notify(); },
    'gv-del': (el) => { GV.sel = GV.sel.filter(a => a !== el.dataset.who); notify(); },
    'gv-go': () => {
        const c = gw();
        if (!c || !GV.sel.length)
            return;
        const n = inviteVisit(c.g, c.w, GV.sel);
        if (!n) {
            toast('Nobody to invite: they are here already, or on their way.', 'info');
            return;
        }
        toast(`Invitation sent: they arrive around ${hm((nowAbs(c.g) + VISIT_DELAY) % 1440)}. Choose where they sleep in Visits.`, 'success');
        GV.sel = [];
        saveGame();
        notify();
    },
    'door-open': async (el) => {
        const c = gw();
        if (!c)
            return;
        const a = el.dataset.who;
        if (answerDoor(c.g, a, false))
            toast(`${nm(c.g, a)} came in.`, 'success');
        await after();
    },
    'door-greet': async (el) => {
        const c = gw();
        if (!c)
            return;
        const a = el.dataset.who;
        if (state.generating) {
            toast('Wait until they finish speaking.', 'info');
            return;
        }
        if (!answerDoor(c.g, a, true))
            return;
        const door = doorRoom(c.g, c.w);
        if (door && door !== c.g.player.loc) {
            const { travelTo } = await import('./map.js');
            await travelTo(door);
        }
        state.view = 'scene';
        await after();
    },
    'gv-cancel': (el) => { const c = gw(); if (!c)
        return; cancelVisit(c.g, el.dataset.who); saveGame(); notify(); },
    'guest-bye': async (el) => {
        const c = gw();
        if (!c)
            return;
        if (state.generating) {
            toast('Wait until they finish speaking.', 'info');
            return;
        }
        const n = sendHome(c.g, el.dataset.who);
        if (n)
            toast(`${n} said goodbye and went home.`, 'success');
        await after();
    },
    'guest-stay': async (el) => {
        const c = gw();
        if (!c)
            return;
        if (stayAfterParty(c.g, el.dataset.who))
            toast(`${nm(c.g, el.dataset.who)} is staying on after the party.`, 'success');
        await after();
    },
    'gp-open': (el) => { const f = el.dataset.for; GP.for = f === 'party' || f === 'outing' || f === 'partyEdit' ? f : 'visit'; resetPick('guestpick'); notify(); },
    'gp-close': (el, e) => { if (e && el.classList.contains('mu-dlg-veil') && e.target !== el)
        return; GP.for = ''; notify(); },
    'gp-toggle': (el) => {
        const a = el.dataset.avatar;
        if (GP.for === 'partyEdit') {
            const c = gw();
            if (!c)
                return;
            const on = (houseParty(c.g)?.guests ?? []).includes(a);
            partyGuest(c.g, c.w, a, !on);
            void after();
            return;
        }
        const list = GP.for === 'party' ? HP.guests : GP.for === 'outing' ? OD.lib : GV.sel;
        const i = list.indexOf(a);
        if (i >= 0)
            list.splice(i, 1);
        else
            list.push(a);
        notify();
    },
    'pe-open': () => { PE.open = true; notify(); },
    'pe-close': () => { PE.open = false; notify(); },
    'pe-person': (el) => { const c = gw(); if (!c)
        return; partyPerson(c.g, el.dataset.who); void after(); },
    'pe-guest-del': (el) => { const c = gw(); if (!c)
        return; partyGuest(c.g, c.w, el.dataset.who, false); void after(); },
    'hp-guest-del': (el) => { HP.guests = HP.guests.filter(a => a !== el.dataset.who); notify(); },
    'hp-where': (el) => { HP.where = el.dataset.v === 'out' ? 'out' : 'home'; notify(); },
    'hp-person': (el) => { const a = el.dataset.who; HP.people = HP.people.includes(a) ? HP.people.filter(x => x !== a) : [...HP.people, a]; notify(); },
    'hp-goout': async () => {
        const c = gw();
        if (!c)
            return;
        const p = houseParty(c.g);
        if (!p?.out)
            return;
        if (state.generating) {
            toast('Wait until they finish speaking.', 'info');
            return;
        }
        const people = [...p.out.people, ...(p.guests ?? [])].filter(a => c.g.cast[a]);
        startOuting(c.g, c.w, p.out.place, people, p.out.bg ?? '');
        await after();
        state.view = 'scene';
        showTransition(p.out.place, p.title || 'The party', 'time');
        notify();
    },
    'gbg-open': (el) => { GB.for = el.dataset.for === 'date' ? 'date' : 'party'; GB.q = ''; GB.sel = GB.for === 'date' ? PL.bg : HP.bg; notify(); },
    'gbg-close': (el, e) => { if (e && el.classList.contains('mu-dlg-veil') && e.target !== el)
        return; GB.for = ''; notify(); },
    'gbg-pick': (el) => { GB.sel = el.dataset.file ?? ''; notify(); },
    'gbg-use': () => { if (GB.for === 'date')
        PL.bg = GB.sel;
    else
        HP.bg = GB.sel; GB.for = ''; notify(); },
});
Object.assign(INPUT, {
    'gv-bed': (el) => {
        const c = gw();
        if (!c)
            return;
        const v = el.value;
        setSleep(c.g, el.dataset.who, v === 'sofa' ? { kind: 'sofa' } : v.startsWith('spot:') ? { kind: 'room', spot: v } : { kind: 'share', host: v });
        void after();
    },
    'hp-place': (el) => { HP.place = el.value; },
    'gbg-q': (el) => { GB.q = el.value; notify(); },
});
