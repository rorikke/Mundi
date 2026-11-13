// The world map: full screen, zoom and drag, a pin for every place. Hovering a pin opens a small card next to it
// (what the place is, who is there; at your own place, what you can do). Clicking a pin goes there.
import { lex, appRef } from '../core/lexicon.js';
import { safeUrl, setHtml } from '../core/safe.js';
import { showTransition } from './lifeui.js';
import { lockedOut, toGetBackIn } from '../sim/bills.js';
import { doorAnswer, sleepMood } from '../sim/life.js';
import { hobbyNeed } from '../sim/hobbies.js';
import { doAction, playsInScene, isPrivateAct } from '../sim/actions.js';
import { bansNow, BAN_WORDS } from '../sim/caught.js';
import { startInScene, finishFirst } from './sceneact.js';
import { sleepHere, bookNight, bookedHere, nightMinutes, wakeUpAt, restAfterNight } from '../sim/stays.js';

import { state, notify, esc, game, toast, saveGame, ROOT_ID, nowAbs, uiZoom, UI } from '../core/store.js';
import { runPlans } from './plans.js';
import { maybeBump, dropBump, BUMP } from './bump.js';
import { withYou } from '../sim/social.js';
import { approachOn } from '../sim/approach.js';
import { gradeName } from '../sim/dice.js';
import { setPrompt, sendCanned, cannedText, addUserLine } from '../st/bridge.js';
import { beforeTravel, beforeSleep } from '../sim/plans.js';
import { getWorld, worldFile, systemOn, type WorldDef, isScenario } from '../core/world.js';
import { openNow, pictureAt, entryDue, payEntry } from '../sim/daynight.js';
import { looksAt } from '../sim/worldstate.js';
import { isRpg, longRest } from '../sim/rpg.js';
import { journeyOf, travelRoad } from '../sim/journey.js';
import type { Save } from '../core/store.js';
import { thumb } from '../st/bridge.js';
import { pins, placeOf, mapOf, travelMinutes, playerHomeId, isOuting, outingName } from '../sim/places.js';
import { missedTrain, taxiFare, untilFirstTrain, byTrain, fellowTravelers, meetOdds, tookLateTrip } from '../sim/transit.js';
import { planOn, floorsOn, planTarget, unplaced, floorOf } from '../sim/plan.js';
import { presentAt, whereNow } from '../sim/people.js';
import { writeDiary, diaryOn, markDayStart } from '../sim/diary.js';
import { verdictNow, daySnapshot, dayChanges } from '../sim/verdict.js';
import { openWork, diaryWaiting, diaryReady, showDayRecap, shiftLabel, nextRankLine, perfWord, askTrack } from './relui.js';
import { askAboutPlans } from './appts.js';
import { doing, isDoing } from './doing.js';
import { stayOf } from './events.js';
import { actionSound, lifeSound } from './sfx.js';
import { refreshPrompt } from '../sim/prompt.js';
import { canAfford, money, actionsHere, tooTired } from '../sim/needs.js';
import { book } from '../sim/ledger.js';
import { fits, hire, trackOf, rankOf, pendingBranch, jobDef, jobPlace, openJobs, hourlyPay, weekText, perfOf, realDays, canWork, atWork } from '../sim/work.js';
import { advance, weekday, hm } from '../sim/time.js';
import { syncScene } from '../sim/game.js';
import { endVisit } from '../sim/visits.js';
import { toolsHtml } from './tools.js';
import { ACT, INPUT } from './reg.js';
import { featureOn } from '../sim/creator.js';
import { icon } from './icons.js';

const KMAX = 5;
const ctxW = () => { const g = game()!; return { g, w: getWorld(g.world)! }; };
// The map on screen: the one you are on, unless you opened another (a link pin, or "up" to the bigger map).
let viewMap: string | null = null;
const youMap = (g: Save, w: WorldDef) => w.maps.find(m => m.id === placeOf(g, w, g.player.loc)?.map) ?? w.maps[0];
const curMap = (g: Save, w: WorldDef) => (viewMap && w.maps.find(m => m.id === viewMap)) || youMap(g, w);

function pinsHtml(g: Save, w: WorldDef) {
    const map = curMap(g, w);
    const sel = state.sel ?? g.player.loc;
    return pins(g, w).filter(p => p.map === map.id).map(p => {
        const here = presentAt(g, w, p.id);
        const known = here.filter(r => r.met), strangers = here.length - known.length;
        if (p.link) return `<button class="mu-pin is-link" data-act="pin" data-loc="${esc(p.id)}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(p.name)}"><span class="dot">${icon('map')}</span><span class="label">${esc(p.name)}</span></button>`;
        const shut = !p.home && systemOn(w, 'living') && !openNow(g, w, p.id);
        return `<button class="mu-pin ${p.home ? 'is-home' : ''} ${shut ? 'is-closed' : ''} ${p.id === sel ? 'is-sel' : ''} ${p.id === g.player.loc ? 'is-you' : ''}" data-act="pin" data-loc="${esc(p.id)}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(p.name)}">
            <span class="dot"></span><span class="label">${esc(p.name)}</span>
            ${here.length ? `<span class="faces">${known.slice(0, 3).map(r => `<img draggable="false" src="${esc(thumb(r.avatar))}" alt="" title="${esc(r.name)}">`).join('')}${strangers || known.length > 3 ? `<i>+${strangers + Math.max(0, known.length - 3)}</i>` : ''}</span>` : ''}
        </button>`;
    }).join('');
}

// Jobs at this place: work a shift at yours (your rank's place), or apply for one.
function jobCard(g: Save, w: WorldDef, sel: string, you: boolean) {
    if (!featureOn(w, 'jobs')) return '';
    const mine = jobDef(w, g.player.job?.id);
    const here = mine && jobPlace(g, mine) === sel ? mine : null;
    const jobs = openJobs(g, w).filter(o => o.place === sel && o.id !== mine?.id);
    if (here) {
        const l = shiftLabel(g, w, here), next = nextRankLine(g, w, here);
        return `<div class="mu-card"><h4>Work</h4><p><b>${esc(rankOf(g, here).name)}</b> · ${esc(here.name)}</p>
            <small class="mu-muted">${money(w, hourlyPay(g, w, here))}/h · ${esc(weekText(g, w, here))}${pendingBranch(g, here) ? ` · ${esc(lex(w, 'choosePathTitle'))}` : ''}</small>
            <small class="mu-muted">Performance ${perfOf(g)} (${perfWord(perfOf(g))})${next ? ` · ${esc(next)}` : ''}</small>
            ${you ? `<button class="mu-primary" data-act="work" ${l.ok ? '' : 'aria-disabled="true"'}>Work a shift · ${esc(l.text)}</button>` : ''}</div>`;
    }
    if (!jobs.length) return '';
    return `<div class="mu-card"><h4>${lex(w, 'jobsHere')}</h4>${jobs.map(job => trackOf(g, job)).map(o => `<div class="mu-jobrow"><span><b>${esc(o.name)}</b><small>${money(w, o.ranks[0].pay)}/h · ${realDays(o, o.ranks[0])} days a week${o.needs?.length ? ` · ${esc(o.needs.join(' / '))}` : ''}${hobbyNeed(g, w, o) ? ` · ${esc(hobbyNeed(g, w, o))}` : ''}</small></span>
        ${you ? `<button data-act="apply" data-id="${esc(o.id)}" ${fits(g, o) ? '' : 'aria-disabled="true"'}>${lex(w, 'jobApply')}</button>` : ''}</div>`).join('')}
        ${you ? '' : `<small class="mu-muted">${lex(w, 'applyThere')}</small>`}</div>`;
}

// The card that opens next to a pin.
function popHtml(g: Save, w: WorldDef, loc: string, touch: boolean) {
    const p = placeOf(g, w, loc);
    if (!p) return '';
    if (p.link) {
        const m = w.maps.find(x => x.id === p.link);
        return `<h3>${esc(p.name)}</h3><small class="mu-muted">${esc(m?.name ?? '')} · click to open the map</small>${touch ? `<button class="mu-primary" data-act="open-map" data-map="${esc(p.link)}">Open the map</button>` : ''}`;
    }
    const you = loc === g.player.loc;
    const here = presentAt(g, w, loc);
    const people = here.length ? `<div class="mu-pop-people">${here.map(r => `<span class="mu-pop-person"><img src="${esc(thumb(r.avatar))}" alt=""><b>${esc(r.met ? r.name : 'Someone')}</b></span>`).join('')}</div>`
        : '<small class="mu-muted">Nobody here right now.</small>';
    return `<h3>${esc(p.name)}</h3>
        ${p.desc ? `<p>${esc(p.desc)}</p>` : ''}${p.event ? `<p class="mu-muted">${esc(p.event)}</p>` : ''}
        ${people}
        ${you ? `<span class="mu-badge">You are here</span>` : `<small class="mu-muted">${travelMinutes(g, w, g.player.loc, loc)} min away · click to go</small>`}
        ${touch || you ? `<button class="mu-primary" data-act="go" data-loc="${esc(loc)}" data-sfx="open">${you ? 'Enter the scene' : 'Go here'}</button>` : ''}
        ${banLine(g, loc)}
        ${you ? '' : jobCard(g, w, loc, false)}`;
}
// (adult) A place that won't serve you after you were caught there: why, and for how long.
function banLine(g: Save, loc: string): string {
    const b = bansNow(g).find(x => x.place === loc);
    return b ? `<small class="mu-ban">${icon('lock')}<span>${esc(BAN_WORDS)} ${esc(b.days === 1 ? '1 more day.' : `${b.days} more days.`)}</span></small>` : '';
}

// Shows the card beside the pin where it covers none of the HUD's cards (above, below, right, left, in that order) and
// fits the screen; with no such side, where it covers the least. It's drawn above the HUD (css/50-phone.css), so a card
// that has to cover something is still seen whole.
const HUD_CARDS = '.mh-persona, .mh-house, .mh-swapback, .mh-clock, .mh-where, .mh-corner, .mh-event, .mh-people, .mh-acts, .mh-here, .mu-mapnav, .mu-hud, .mu-top';
let popFor = '', hideTimer = 0;
function showPop(pin: HTMLElement, touch: boolean) {
    const mapEl = pin.closest<HTMLElement>('.mu-map'); const g = game(); const w = g && getWorld(g.world);
    if (!mapEl || !g || !w) return;
    clearTimeout(hideTimer);
    let pop = mapEl.querySelector<HTMLElement>('.mu-pop');
    if (!pop) { pop = document.createElement('div'); pop.className = 'mu-pop'; pop.setAttribute('role', 'dialog'); mapEl.appendChild(pop); }
    const loc = pin.dataset.loc!;
    popFor = loc;
    setHtml(pop, popHtml(g, w, loc, touch));
    pop.classList.toggle('is-here', loc === g.player.loc);
    const zz = uiZoom(), b0 = mapEl.getBoundingClientRect(), r = pin.querySelector('.dot')!.getBoundingClientRect(), whole = pin.getBoundingClientRect();
    const box = { width: b0.width / zz, height: b0.height / zz };
    const cx = (r.left + r.width / 2 - b0.left) / zz, top = (r.top - b0.top) / zz, bottom = (whole.bottom - b0.top) / zz;   // below: under the label
    pop.style.visibility = 'hidden'; pop.style.left = '0'; pop.style.top = '0';
    pop.classList.add('is-open');
    const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 14, m = 8;
    // the HUD's cards on screen, in the map's coordinates
    const root = mapEl.closest('#' + ROOT_ID) ?? document;
    const cards = [...root.querySelectorAll<HTMLElement>(HUD_CARDS)].filter(el => !el.contains(pin) && el.offsetParent !== null).map(el => el.getBoundingClientRect())
        .filter(c => c.width > 0 && c.height > 0).map(c => ({ x: (c.left - b0.left) / zz, y: (c.top - b0.top) / zz, w: c.width / zz, h: c.height / zz }));
    const covered = (x: number, y: number) => cards.reduce((n, c) => n + Math.max(0, Math.min(x + pw, c.x + c.w) - Math.max(x, c.x)) * Math.max(0, Math.min(y + ph, c.y + c.h) - Math.max(y, c.y)), 0);
    const fits = (x: number, y: number) => x >= m && y >= m && x + pw <= box.width - m && y + ph <= box.height - m;
    const midX = Math.max(m, Math.min(box.width - pw - m, cx - pw / 2)), midY = Math.max(m, Math.min(box.height - ph - m, top - ph / 2));
    const sides = [
        { kind: 'above', x: midX, y: top - gap - ph },
        { kind: 'below', x: midX, y: bottom + gap },
        { kind: 'side', x: cx + 26, y: midY },
        { kind: 'side', x: cx - 26 - pw, y: midY },   // (beside the pin, so the pin can still be clicked)
    ].map(c => ({ ...c, fit: fits(c.x, c.y), cover: covered(c.x, c.y) }));
    const pick = sides.find(c => c.fit && !c.cover) ?? [...sides].sort((a, b) => Number(b.fit) - Number(a.fit) || a.cover - b.cover)[0];
    const x = Math.max(m, Math.min(pick.x, box.width - pw - m)), y = Math.max(m, Math.min(pick.y, box.height - ph - m));
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
    pop.style.setProperty('--ax', `${Math.max(16, Math.min(pw - 16, cx - x))}px`);
    pop.classList.toggle('is-below', pick.kind === 'below');
    pop.classList.toggle('is-side', pick.kind === 'side');
    // a card shown on hover has nothing to click: it never takes the click meant for the pin under it
    pop.style.pointerEvents = touch || loc === g.player.loc ? '' : 'none';
    pop.style.visibility = '';
}
function hidePop(delay = 160) {
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { document.getElementById(ROOT_ID)?.querySelector('.mu-pop')?.classList.remove('is-open'); popFor = ''; }, delay);
}

// Who you know is on a map right now (their faces under its name).
function knownHtml(g: Save, w: WorldDef, mapId: string) {
    const list = Object.values(g.cast).filter(r => r.met && placeOf(g, w, whereNow(g, w, r))?.map === mapId);
    if (!list.length) return '';
    return `<span class="mu-world-known" title="${esc(list.map(r => r.name).join(', '))}">${list.slice(0, 4).map(r => `<img src="${esc(thumb(r.avatar))}" alt="">`).join('')}${list.length > 4 ? `<em>+${list.length - 4}</em>` : ''}</span>`;
}
// All the world's maps as round pictures, like choosing a neighborhood in The Sims: click one to look at it.
let mapsPicker = false;
function mapsPickerHtml(g: Save, w: WorldDef, shown: string) {
    const here = youMap(g, w).id;
    const top = w.maps.filter(m => !m.parent || !w.maps.some(x => x.id === m.parent));
    const order = top.flatMap(t => [t, ...w.maps.filter(m => m.parent === t.id), ...w.maps.filter(m => m.parent && m.parent !== t.id && w.maps.find(x => x.id === m.parent)?.parent === t.id)]);
    const list = [...order, ...w.maps.filter(m => !order.includes(m))];
    return `<div class="mu-worlds-veil" data-act="maps-pick"><section class="mu-worlds mh-glass" role="dialog" aria-label="Maps" data-keep="maps">
        <header><h3>${icon('home')} ${esc(w.realm?.name ?? w.name)}</h3><button class="mu-ibtn mu-ghost" data-act="maps-pick" title="Close">${icon('x')}</button></header>
        <div class="mu-worlds-grid">${list.map(m => `<button class="mu-world-dot ${m.id === shown ? 'is-on' : ''}" data-act="maps-go" data-map="${esc(m.id)}">
            <i style="background-image:url('${safeUrl(worldFile(w, pictureAt(w, g.minutes, m.image, m.images)!))}')">${m.id === here ? `<em>${icon('pin')} You</em>` : ''}</i>
            <b data-notr>${esc(m.name)}</b><small data-notr>${esc(m.area ?? (m.parent ? w.maps.find(x => x.id === m.parent)?.name ?? '' : 'Main map'))}${m.trip ? ` · ${m.trip} min` : ''}</small>${knownHtml(g, w, m.id)}</button>`).join('')}</div></section></div>`;
}

// A scenario: no floor plan, the rooms of the house as pictures (as they look now); click one to go there.
function roomsHtml(g: Save, w: WorldDef) {
    const kindPic = (p: any) => { const k = p.home ? w.homes.kinds[p.id === playerHomeId ? g.player.home.kind : (w.homes.zones.find(z => z.id === g.cast[String(p.id).slice(5)]?.home.zone)?.kind ?? '')] : null; return k ? pictureAt(w, g.minutes, k.image, k.images) : ''; };
    const list = pins(g, w).filter(p => !p.link);
    const yours = list.filter(p => p.id === playerHomeId), rooms = list.filter(p => !p.home), beds = list.filter(p => p.home && p.id !== playerHomeId);
    const card = (p: any) => { const pic = p.home ? kindPic(p) : pictureAt(w, g.minutes, p.bg, p.bgs, looksAt(g, w, p.id)); const here = presentAt(g, w, p.id); const you = p.id === g.player.loc;
        return `<button class="mu-room ${you ? 'is-you' : ''}" data-act="go" data-loc="${esc(p.id)}" title="${you ? 'Back to this room' : 'Go here'}"><i style="${pic ? `background-image:url('${safeUrl(worldFile(w, pic))}')` : ''}">${you ? `<em>${icon('pin')} You</em>` : ''}</i>
            <b data-notr>${esc(p.id === playerHomeId ? 'Your room' : String(p.name).replace(/'s home$/, "'s room"))}</b>${here.length ? `<span class="faces">${here.slice(0, 5).map(r => `<img src="${esc(thumb(r.avatar))}" alt="" title="${esc(r.met ? r.name : 'Someone')}">`).join('')}${here.length > 5 ? `<i>+${here.length - 5}</i>` : ''}</span>` : ''}</button>`; };
    const head = `<div class="mu-rooms-head"><h3 data-notr>${esc(w.name)}</h3></div>`;
    // floors set in the creator (no picture of the plan): the rooms floor by floor, one block above the other
    if (floorsOn(w)) {
        const all = [...yours, ...rooms, ...beds];
        // a room not put on any floor is on the first one
        const first = w.plan.floors[0].id;
        const blocks = w.plan.floors.map(f => [f.name, all.filter(p => (floorOf(g, w, p.id) || first) === f.id)] as const).filter(([, l]) => l.length);
        const rest: typeof all = [];
        return `<div class="mu-map is-rooms"><div class="mu-rooms" data-keep="rooms">${head}
            ${blocks.map(([name, l]) => `<h4 class="mu-rooms-floor" ${/^Floor \d+$/.test(name) ? '' : 'data-notr'}>${esc(name)}</h4><div class="mu-rooms-grid">${l.map(card).join('')}</div>`).join('')}
            ${rest.length ? `<h4 class="mu-rooms-floor">Other rooms</h4><div class="mu-rooms-grid">${rest.map(card).join('')}</div>` : ''}</div>${toolsHtml()}</div>`;
    }
    return `<div class="mu-map is-rooms"><div class="mu-rooms" data-keep="rooms">${head}
        <div class="mu-rooms-grid">${[...yours, ...rooms].map(card).join('')}</div>
        ${beds.length ? `<h4>Bedrooms</h4><div class="mu-rooms-grid">${beds.map(card).join('')}</div>` : ''}</div>${toolsHtml()}</div>`;
}

// A scenario with a floor plan: the floor you are on, each room where it is (click to go there), the floors at the
// bottom left, and the rooms not on the plan yet with a red "!".
export const PV = { floor: '', at: '' };
function planHtml(g: Save, w: WorldDef & { plan: NonNullable<WorldDef['plan']> }) {
    const plan = w.plan;
    if (PV.at !== g.player.loc) { PV.at = g.player.loc; PV.floor = ''; }
    const floor = plan.floors.find(f => f.id === PV.floor) ?? plan.floors.find(f => f.id === floorOf(g, w, g.player.loc)) ?? plan.floors[0];
    const kindPic = (loc: string) => { const k = loc === playerHomeId ? w.homes.kinds[g.player.home.kind] : w.homes.kinds[w.homes.zones.find(z => z.id === g.cast[loc.slice(5)]?.home.zone)?.kind ?? '']; return k ? pictureAt(w, g.minutes, k.image, k.images) : ''; };
    const faces = (loc: string) => { const here = presentAt(g, w, loc); return here.length ? `<span class="faces">${here.slice(0, 4).map(r => `<img src="${esc(thumb(r.avatar))}" alt="" title="${esc(r.met ? r.name : 'Someone')}">`).join('')}${here.length > 4 ? `<i>+${here.length - 4}</i>` : ''}</span>` : ''; };
    const rooms = plan.rooms.filter(r => r.floor === floor.id).map(r => {
        const t = planTarget(g, w, r); const box = `left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%`;
        if (!t) return `<div class="mu-plan-room is-off" style="${box}"><b>${esc(r.id.startsWith('spot:') ? 'Empty bedroom' : w.places.find(p => p.id === r.id)?.name ?? '')}</b></div>`;
        if (!t.known) return `<div class="mu-plan-room is-off" style="${box}" title="You have not met who sleeps here"><b>A bedroom</b></div>`;
        const p = placeOf(g, w, t.loc); if (!p) return '';
        const pic = (p as any).home ? kindPic(t.loc) : pictureAt(w, g.minutes, p.bg, p.bgs);
        const you = t.loc === g.player.loc;
        const name = t.loc === playerHomeId ? 'Your room' : String(p.name).replace(/'s home$/, "'s room");
        return `<button class="mu-plan-room ${you ? 'is-you' : ''}" style="${box}" data-act="go" data-loc="${esc(t.loc)}" title="${you ? 'You are here' : `Go to ${esc(name)}`}">
            <i style="${pic ? `background-image:url('${safeUrl(worldFile(w, pic))}')` : ''}"></i><b data-notr>${esc(name)}</b>${faces(t.loc)}${you ? `<em>${icon('pin')} You</em>` : ''}</button>`;
    }).join('');
    const lost = unplaced(g, w);
    const ratio = floor.ratio ?? 1.6;
    return `<div class="mu-map is-plan"><div class="mu-plan-stage"><div class="mu-plan ${floor.image ? 'has-pic' : ''} ${plan.labels === false ? 'no-labels' : ''}" style="--r:${ratio};${plan.glow ? `--glow:${esc(plan.glow)};` : ''}${floor.image ? `background-image:url('${safeUrl(worldFile(w, pictureAt(w, g.minutes, floor.image, floor.images) ?? floor.image))}')` : ''}">${rooms}</div></div>
        <div class="mu-plan-bar">${lost.length ? `<div class="mu-plan-lost"><small>Not on the plan</small>${lost.map(p => { const name = p.id === playerHomeId ? 'Your room' : String(p.name).replace(/'s home$/, "'s room");
            return `<button data-act="go" data-loc="${esc(p.id)}" class="${p.id === g.player.loc ? 'is-you' : ''}" title="${esc(name)}: where this room is on the floor plan is not set yet (World creator › Maps › Floor plan). Click to go there."><b class="mu-plan-bang">!</b><span data-notr>${esc(name)}</span></button>`; }).join('')}</div>` : ''}
            ${plan.floors.length > 1 ? `<nav class="mu-plan-floors" aria-label="Floors">${plan.floors.map(f => { const who = Object.values(g.cast).filter(r => r.met && floorOf(g, w, whereNow(g, w, r)) === f.id);
                return `<button class="${f.id === floor.id ? 'is-on' : ''}" data-act="plan-floor" data-id="${esc(f.id)}">${who.length ? `<span class="mu-floor-faces">${who.slice(0, 5).map(r => `<img src="${esc(thumb(r.avatar))}" alt="" title="${esc(r.name)}">`).join('')}${who.length > 5 ? `<i>+${who.length - 5}</i>` : ''}</span>` : ''}${floorOf(g, w, g.player.loc) === f.id ? icon('pin') : ''}<span ${/^Floor \d+$/.test(f.name) ? '' : 'data-notr'}>${esc(f.name)}</span></button>`; }).join('')}</nav>` : ''}</div>
        ${toolsHtml()}</div>`;
}

// Find a place: a search box under the map's bar. Every place you could click on any map (homes of people you know
// too) whose name has the words typed, the closest first, with its map and the trip there.
const FIND = { open: false, q: '', at: 0, focus: false, scroll: false };
let findNext = '';   // a place picked from the list: the map turns to it, zooms in and opens its card
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
type Found = { p: ReturnType<typeof pins>[number]; rank: number; mins: number };
function findList(g: Save, w: WorldDef): Found[] {
    const q = fold(FIND.q).trim();
    if (!q) return [];
    const words = q.split(/\s+/);
    return pins(g, w).filter(p => !p.link).flatMap(p => {
        const name = fold(p.name), mapName = fold(w.maps.find(m => m.id === p.map)?.name ?? '');
        const hay = `${name} ${mapName} ${fold((p.tags ?? []).join(' '))}`;
        if (!words.every(x => hay.includes(x))) return [];
        // its name starting with it, then a word of its name, then anywhere in it, then only its map or tags
        const rank = name.startsWith(q) ? 0 : name.split(/[^a-z0-9]+/).some(x => x.startsWith(q)) ? 1 : name.includes(q) ? 2 : 3;
        return [{ p, rank, mins: travelMinutes(g, w, g.player.loc, p.id) }];
    }).sort((a, b) => a.rank - b.rank || a.mins - b.mins || a.p.name.localeCompare(b.p.name)).slice(0, 40);
}
const tripText = (mins: number) => mins < 60 ? `${mins} min` : mins % 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins / 60} h`;
// The name with the typed text marked ("cafe" marks "Café"): folded letter by letter, so the places line up
function markName(name: string): string {
    const chars = [...name], folded = chars.map(fold), q = fold(FIND.q).trim();
    if (!q || folded.some(c => c.length !== 1)) return esc(name);
    const i = folded.join('').indexOf(q);
    if (i < 0) return esc(name);
    const part = (a: number, b?: number) => esc(chars.slice(a, b).join(''));
    return `${part(0, i)}<mark>${part(i, i + q.length)}</mark>${part(i + q.length)}`;
}
function findHtml(g: Save, w: WorldDef) {
    const list = findList(g, w);
    FIND.at = Math.max(0, Math.min(FIND.at, list.length - 1));
    const row = ({ p }: Found, i: number) => {
        const m = w.maps.find(x => x.id === p.map), up = m?.parent ? w.maps.find(x => x.id === m.parent) : null;
        const you = p.id === g.player.loc, shut = !p.home && systemOn(w, 'living') && !openNow(g, w, p.id);
        const where = [...new Set([m?.name, m?.area ?? up?.name].filter(Boolean))].map(x => esc(x)).join(' · ');
        return `<li class="${i === FIND.at ? 'is-on' : ''}"><button class="mu-ghost mu-find-row" data-act="find-pick" data-loc="${esc(p.id)}">
            <b ${p.id === playerHomeId ? '' : 'data-notr'}>${markName(p.name)}</b><small data-notr>${where}</small></button>
            <span class="mu-find-trip">${you ? '<em>You are here</em>' : `<span>${esc(tripText(travelMinutes(g, w, g.player.loc, p.id)))}</span>`}${shut ? '<small>Closed now</small>' : ''}</span>
            <button class="mu-ibtn mu-find-go" data-act="find-go" data-loc="${esc(p.id)}" data-sfx="open" title="${you ? 'Enter the scene' : 'Go here'}">${icon(you ? 'check' : 'forward')}</button></li>`;
    };
    return `<div class="mu-find mh-glass" role="dialog" aria-label="Find a place">
        <input class="mu-search" type="search" data-input="map-find" data-focus="map-find" placeholder="Find a place" value="${esc(FIND.q)}" autocomplete="off">
        ${!FIND.q.trim() ? '<small class="mu-muted">Type part of a name: every place on every map that has it.</small>'
            : list.length ? `<ol class="mu-find-list" data-keep="map-find">${list.map(row).join('')}</ol>` : '<small class="mu-muted">No place has that name.</small>'}
    </div>`;
}
function pickFound(loc: string) {
    const { g, w } = ctxW();
    const map = placeOf(g, w, loc)?.map;
    if (!map) return;
    FIND.open = false;
    viewMap = map === youMap(g, w).id ? null : map;
    state.sel = loc; focusNext = loc; findNext = loc; popFor = '';
    notify();
}
Object.assign(INPUT, { 'map-find': (el: HTMLInputElement) => { FIND.q = el.value; FIND.at = 0; notify(); } });
/** Esc with the search open (focus outside its box): closes it. */
export function mapEscape(): boolean {
    if (!FIND.open || state.view !== 'map') return false;
    FIND.open = false; notify();
    return true;
}

export function mapHtml() {
    const { g, w } = ctxW();
    if (planOn(w)) return planHtml(g, w);
    if (isScenario(w)) return roomsHtml(g, w);
    const map = curMap(g, w);
    const parent = map.parent ? w.maps.find(m => m.id === map.parent) : null;
    const away = map.id !== youMap(g, w).id;
    const many = w.maps.length > 1;
    const nav = `<div class="mu-mapnav"><button class="${FIND.open ? 'is-on' : ''}" data-act="find-open" title="Find a place">${icon('search')}<span>Find</span></button>${many ? `<button data-act="maps-pick" title="All maps">${icon('map')}<span>Maps</span></button>` : ''}${parent ? `<button data-act="open-map" data-map="${esc(parent.id)}">${icon('up')}<span>${esc(parent.name)}</span></button>` : ''}
        ${away ? `<button data-act="open-map" data-map="">${icon('pin')}<span>Back to where you are</span></button>` : ''}<b data-notr>${esc(map.name)}</b>${FIND.open ? findHtml(g, w) : ''}</div>`;
    return `<div class="mu-map">${nav}${mapsPicker ? mapsPickerHtml(g, w, map.id) : ''}
        <div class="mu-stage" data-stage>
            <div class="mu-mapimg" style="--r:${map.ratio};background-image:url('${safeUrl(worldFile(w, pictureAt(w, g.minutes, map.image, map.images, looksAt(g, w, undefined, map.id))!))}')">${pinsHtml(g, w)}</div>
            <div class="mu-zoom">
                <button data-act="zoom" data-d="in" title="Zoom in">+</button>
                <button data-act="zoom" data-d="out" title="Zoom out">−</button>
                <button data-act="zoom-fit" title="Fit">⌖</button>
            </div>
        </div>
        ${toolsHtml()}
    </div>`;
}

/* ---------- zoom and drag ---------- */

const els = () => {
    const stage = document.getElementById(ROOT_ID)?.querySelector<HTMLElement>('[data-stage]');
    const map = stage?.querySelector<HTMLElement>('.mu-mapimg');
    return stage && map ? { stage, map } : null;
};
type V = { z: number; x: number; y: number; k?: number };

function clampView(v: V, stage: HTMLElement, map: HTMLElement) {
    const sw = stage.clientWidth, sh = stage.clientHeight, W0 = map.offsetWidth, H0 = map.offsetHeight;
    const kmin = Math.max(1, sw / W0, sh / H0);
    const k = Math.max(kmin, Math.min(kmin * KMAX, v.k || 0));
    const mx = Math.max(0, (W0 * k - sw) / 2), my = Math.max(0, (H0 * k - sh) / 2);
    return { z: 1, k, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
}

let focusNext: string | null = null;
export function applyMapView(reset = false) {
    const e = els();
    if (!e) return;
    const cur = state.mapView as V;
    let v = clampView(reset || !cur.k ? { z: 1, k: 0, x: 0, y: 0 } : cur, e.stage, e.map);
    // a place found by name: close enough to see where it is among its neighbours
    if (findNext) v = clampView({ ...v, k: Math.max(v.k!, clampView({ z: 1, k: 0, x: 0, y: 0 }, e.stage, e.map).k * 2) }, e.stage, e.map);
    const target = focusNext ?? (reset || !cur.k ? game()?.player.loc ?? null : null);
    focusNext = null;
    if (target) {   // brings the pin into the free area left of the side card
        const pin = e.map.querySelector<HTMLElement>(`.mu-pin[data-loc="${CSS.escape(target)}"]`);
        if (pin) {
            const px = parseFloat(pin.style.left) / 100, py = parseFloat(pin.style.top) / 100;
            const sh = e.stage.clientHeight, card = 0;
            v = clampView({ ...v, x: -card / 2 - (px - 0.5) * e.map.offsetWidth * v.k!, y: -(py - 0.5) * e.map.offsetHeight * v.k! + sh * 0 }, e.stage, e.map);
        }
    }
    state.mapView = v;
    e.map.style.setProperty('--ik', String(1 / v.k!));
    e.map.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    // smooth while it moves; once it stops, the browser draws the map again at the new size (sharp, not a stretched copy)
    e.map.style.willChange = 'transform';
    clearTimeout(sharpTimer);
    sharpTimer = setTimeout(() => { const m = els()?.map; if (m) m.style.willChange = 'auto'; }, 180);
    if (findNext) {   // its card, with "Go here", once the map has moved to it
        const pin = e.map.querySelector<HTMLElement>(`.mu-pin[data-loc="${CSS.escape(findNext)}"]`);
        findNext = '';
        if (pin) showPop(pin, true);
    }
    if (FIND.focus) {   // the search just opened: type straight away
        FIND.focus = false;
        const box = document.getElementById(ROOT_ID)?.querySelector<HTMLInputElement>('[data-focus="map-find"]');
        if (box) { box.focus(); box.select(); }
    }
    if (FIND.scroll) { FIND.scroll = false; document.getElementById(ROOT_ID)?.querySelector('.mu-find-list > li.is-on')?.scrollIntoView({ block: 'nearest' }); }
}
let sharpTimer: any = null;

function zoomBy(f: number, cx = 0, cy = 0) {
    const e = els(); const v = state.mapView as V;
    if (!e || !v.k) return applyMapView();
    const k2 = clampView({ z: 1, k: v.k * f, x: 0, y: 0 }, e.stage, e.map).k;
    const r = k2 / v.k;
    state.mapView = { z: 1, k: k2, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r } as any;
    applyMapView();
}

let pan: any = null, moved = false;
const pts = new Map<number, { x: number; y: number }>();
let pinch: any = null;

export const mapInput = {
    click(_e: Event) { return false; },
    attach(r: HTMLElement) {
        r.addEventListener('wheel', (e) => {
            const stage = (e.target as HTMLElement).closest?.('[data-stage]');
            if (!stage) return;
            e.preventDefault();
            const rc = stage.getBoundingClientRect();
            const zz = uiZoom(); zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, (e.clientX - rc.left - rc.width / 2) / zz, (e.clientY - rc.top - rc.height / 2) / zz);
        }, { passive: false });
        r.addEventListener('pointerdown', (e) => {
            const stage = (e.target as HTMLElement).closest?.<HTMLElement>('[data-stage]');
            if (!stage || (e.target as HTMLElement).closest('.mu-zoom')) return;
            moved = false;
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const v = state.mapView as V;
            if (!v.k) return;
            if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: v.k }; pan = null; return; }
            pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, stage };
        });
        r.addEventListener('pointermove', (e) => {
            if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pinch && pts.size === 2) {
                const [a, b] = [...pts.values()];
                state.mapView = { ...(state.mapView as V), k: pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d || 1) } as any;
                moved = true; applyMapView(); return;
            }
            if (!pan || e.pointerId !== pan.id) return;
            const zz = uiZoom(), dx = (e.clientX - pan.sx) / zz, dy = (e.clientY - pan.sy) / zz;
            if (!moved && Math.hypot(dx, dy) < 5) return;
            if (!moved) { moved = true; pan.stage.setPointerCapture?.(e.pointerId); pan.stage.classList.add('is-panning'); }
            state.mapView = { z: 1, k: (state.mapView as V).k, x: pan.vx + dx, y: pan.vy + dy } as any;
            applyMapView();
        });
        const end = (e: PointerEvent) => {
            pts.delete(e.pointerId);
            if (pts.size < 2) pinch = null;
            if (pan && e.pointerId === pan.id) { pan.stage.classList.remove('is-panning'); pan = null; }
        };
        r.addEventListener('pointerup', end);
        r.addEventListener('pointercancel', end);
        window.addEventListener('resize', () => applyMapView());
        // in the search box: ↑ ↓ choose a place, Enter shows it on the map, Esc closes
        r.addEventListener('keydown', (e) => {
            if ((e.target as HTMLElement).dataset?.focus !== 'map-find' || e.isComposing) return;
            const g = game(), w = g && getWorld(g.world);
            if (!g || !w) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); FIND.open = false; notify(); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const n = findList(g, w).length;
                if (n) { FIND.at = (FIND.at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; FIND.scroll = true; notify(); }
                return;
            }
            if (e.key === 'Enter') { e.preventDefault(); const hit = findList(g, w)[FIND.at]; if (hit) pickFound(hit.p.id); }
        });
        // hover a pin: its card opens next to it; leaving pin and card closes it
        r.addEventListener('pointerover', (e) => {
            if ((e as PointerEvent).pointerType === 'touch' || pan) return;
            const t = e.target as HTMLElement;
            if (t.closest?.('.mu-pop')) { clearTimeout(hideTimer); return; }
            const pin = t.closest?.<HTMLElement>('.mu-pin');
            if (pin && pin.dataset.loc !== popFor) showPop(pin, false);
            else if (pin) clearTimeout(hideTimer);
        });
        r.addEventListener('pointerout', (e) => {
            if ((e as PointerEvent).pointerType === 'touch') return;
            const from = (e.target as HTMLElement).closest?.('.mu-pin, .mu-pop');
            const to = (e.relatedTarget as HTMLElement | null)?.closest?.('.mu-pin, .mu-pop');
            if (from && !to) hidePop();
        });
    },
};

/* ---------- actions ---------- */

// Moves the player: time passes, the scene follows (who is there now), and the screen goes to the scene.
// A long journey (RPG, between regions): first, how you go (making camp, or pushing on).
// (E4) After the last train, a trip to another map: first, a taxi or a wait for the first train (`late`).
export const JOURNEY = { to: '', minutes: 0, camps: 0 };
export const LATE = { to: '', minutes: 0, fare: 0, wait: 0 };
export async function travelTo(loc: string, road?: 'camp' | 'push', late?: 'taxi' | 'wait') {
    const { g, w } = ctxW();
    if (loc === g.player.loc) return;
    if (state.generating) { toast('Wait until they finish speaking.', 'info'); return; }   // nobody walks out mid-sentence
    finishFirst(g, w);   // (E14.6) what you were doing in the scene ends first (the rest of its time passes)
    const fee = entryDue(g, w, loc);   // (E19) a gate to pay at, once a day
    if (fee && g.player.money < fee) { toast(`Getting into ${placeOf(g, w, loc)?.name ?? 'there'} costs ${money(w, fee)}. Not enough money.`, 'info'); return; }
    const mins = travelMinutes(g, w, g.player.loc, loc);
    if (!late && missedTrain(g, w, g.player.loc, loc)) { Object.assign(LATE, { to: loc, minutes: mins, fare: taxiFare(g, w, mins), wait: untilFirstTrain(w, g.minutes) }); notify(); return; }
    const fare = late === 'taxi' ? taxiFare(g, w, mins) : 0;
    if (fare && g.player.money < fare + fee) { toast(`A taxi there costs ${money(w, fare)}. Not enough money.`, 'info'); return; }
    LATE.to = '';
    const trip = journeyOf(g, w, g.player.loc, loc, mins);
    if (trip && trip.camps > 0 && !road) { Object.assign(JOURNEY, { to: loc, minutes: mins, camps: trip.camps }); notify(); return; }
    // the scene you leave closes; the next one starts clean. Not in a Home: walking from room to room (often with
    // the same people) is one long scene, and closing it made them forget what was just said.
    if (!isScenario(w)) await endVisit(g, w);
    beforeTravel(g, w, loc).forEach(m => toast(m, 'info'));
    if (late) tookLateTrip(g);
    const from = g.player.loc;
    const waited = late === 'wait' ? advance(g, w, untilFirstTrain(w, g.minutes)) : [];   // at the station until the first train
    if (fare) { g.player.money -= fare; book(g, 'Taxi', -fare); toast(`The taxi cost ${money(w, fare)}.`, 'info'); }
    dropBump();   // a meeting you did not answer stays behind
    // (E11) who is where as you leave: someone you know may be on the same train
    const train = !fare && byTrain(g, w, from, loc) && systemOn(w, 'living');
    const departed = g.minutes;
    const before = train ? new Map(Object.values(g.cast).filter(r => r.met).map(r => [r.avatar, whereNow(g, w, r)])) : null;
    (g as any).traveling = true;   // the trip itself costs no energy (only what you do does)
    const msgs = [...waited, ...(road ? travelRoad(g, w, mins, road === 'camp') : advance(g, w, mins))];
    delete (g as any).traveling;
    JOURNEY.to = '';
    if (g.player.loc === from) g.player.loc = loc;   // unless something on the way moved you (passing out…)
    viewMap = null;
    msgs.forEach(m => toast(m, 'warn'));
    if (before && g.player.loc === loc) meetOnTrain(g, w, before, from, loc, departed);
    if (g.player.loc === loc && openNow(g, w, loc)) {   // the gate is shut when it's closed: nothing to pay
        const paid = payEntry(g, w, loc);
        if (paid) { book(g, placeOf(g, w, loc)?.name ?? 'Entry', -paid); toast(`You paid ${money(w, paid)} to get in.`, 'info'); }
    }
    runPlans();
    state.sel = null;
    saveGame();
    await syncScene();
    state.view = 'scene';   // arriving somewhere opens its scene (with its things to do), even when nobody is there
    // (the elevator ride on arriving at an apartment is gone: it only got in the way)
    notify();
}

// (E11) Someone you know made the same trip (or, at rush hour, left from the same station): now and then you run into
// them on the way, and they can come along for a while (the encounter's own choices, ui/bump.ts).
function meetOnTrain(g: Save, w: WorldDef, before: Map<string, string>, from: string, to: string, departed: number) {
    const after = new Map(Object.values(g.cast).filter(r => r.met).map(r => [r.avatar, whereNow(g, w, r)]));
    const list = fellowTravelers(g, w, before, after, from, to, departed);
    if (!list.length) return;
    const same = list.some(r => mapOf(g, w, after.get(r.avatar)!) === mapOf(g, w, to));
    if (Math.random() >= meetOdds(same, departed)) return;
    BUMP.who = list[Math.floor(Math.random() * list.length)].avatar;
    BUMP.on = same ? 'train' : 'station';
    BUMP.at = to; BUMP.come = false;
}

// The journey dialog: the road takes hours; make camp at night, or push on without rest.
// (E4) After the last train: a taxi, or a wait for the first train.
export function journeyHtml(): string {
    const g = game(); const w = g && getWorld(g.world);
    if (g && w && LATE.to) return lateHtml(g, w);
    if (!g || !w || !JOURNEY.to) return '';
    const p = placeOf(g, w, JOURNEY.to); const h = Math.round(JOURNEY.minutes / 60);
    return `<div class="mu-recap-veil"><section class="mu-recap mh-glass mu-journey" role="dialog" aria-label="Journey">
        <header><small>${esc(lex(w, 'journey'))}</small><h3>${esc(p?.name ?? '')}</h3></header>
        <p>${esc(lex(w, 'journeyText', String(h), String(JOURNEY.camps)))}</p>
        <div class="mu-work-modes">
            <button class="mu-work-mode" data-act="jr-road" data-v="camp"><i>🏕️</i><b>${esc(lex(w, 'makeCamp'))}</b><small>Rest at night: half your hit points and focus back. A Survival check decides how the night goes.</small></button>
            <button class="mu-work-mode" data-act="jr-road" data-v="push"><i>🌙</i><b>${esc(lex(w, 'pushOn'))}</b><small>Arrive sooner, but exhausted (no rest).</small></button>
        </div>
        <button class="mu-ghost" data-act="jr-cancel">Stay here</button></section></div>`;
}
function lateHtml(g: Save, w: WorldDef): string {
    const p = placeOf(g, w, LATE.to);
    const first = hm(g.minutes + LATE.wait);
    return `<div class="mu-recap-veil"><section class="mu-recap mh-glass mu-journey" role="dialog" aria-label="The last train has gone">
        <header><small>The last train has gone</small><h3 data-notr>${esc(p?.name ?? '')}</h3></header>
        <p>${esc(`No trains run until ${first}.`)} <span class="mu-muted">You could also find somewhere to sleep around here.</span></p>
        <div class="mu-work-modes">
            ${LATE.fare ? `<button class="mu-work-mode" data-act="lt-go" data-v="taxi"><i>🚕</i><b>Take a taxi</b><small>${esc(`${money(w, LATE.fare)} · ${LATE.minutes} min`)}</small></button>` : ''}
            <button class="mu-work-mode" data-act="lt-go" data-v="wait"><i>🚉</i><b>Wait for the first train</b><small>${esc(`At ${first}, then ${LATE.minutes} min`)}</small></button>
        </div>
        <button class="mu-ghost" data-act="lt-cancel">Stay here</button></section></div>`;
}

// Goes to a place and straight into its scene.
async function goTo(loc: string) {
    const { g, w } = ctxW();
    popFor = '';
    // Home: a plan somewhere out of the house: going there is going out (who comes, the background)
    if (isScenario(w) && isOuting(loc) && loc !== g.player.loc) { const { openGoOut } = await import('./outing.js'); openGoOut(outingName(loc)); return; }
    const door = doorAnswer(g, w, loc);
    if (!door.ok) { toast(door.text, 'info'); notify(); return; }
    if (door.text) toast(door.text, 'info');
    if (loc !== g.player.loc) await travelTo(loc);
    state.view = 'scene';
    notify();
}

// (E6) The place's own bed (a capsule, a ryokan) when you sleep here and not at home or at someone's place.
const innHere = (g: Save, w: WorldDef, away: boolean) => (g.player.loc !== playerHomeId && !away ? sleepHere(g, w) : null);
const sleepMinutes = (g: Save, w: WorldDef, inn: ReturnType<typeof sleepHere>) => {
    if (inn) return nightMinutes(g, w, inn);
    const until = w.sleep.until;
    return g.minutes < until ? until - g.minutes : 1440 - g.minutes + until;
};

// `wakeAt`: wake up at that moment (absolute minutes) instead of in the morning ("Sleep until the party"): a nap
// rests you in proportion to how long it lasted, and the day goes on (no diary unless a new day began).
export const sleepUntil = (wakeAt: number) => sleep(wakeAt);
async function sleep(wakeAt?: number) {
    const { g, w } = ctxW();
    const stay = stayOf(g); const away = !!stay && stay.where === g.player.loc && g.player.loc !== playerHomeId;
    const inn = innHere(g, w, away);   // (E6) a capsule, a manga café, a ryokan…
    if (w.sleep.homeOnly && g.player.loc !== playerHomeId && !away && !inn) { toast('You can only sleep at home.', 'info'); return; }
    if (g.player.loc === playerHomeId && !away && lockedOut(g)) { toast(lex(w, 'lockedOutGo', appRef(w, 'homes'), money(w, toGetBackIn(g, w, 'rent'))), 'warn'); return; }
    if (inn && !bookedHere(g, w)) { const why = bookNight(g, w); if (why) { toast(why, 'info'); return; } }
    finishFirst(g, w);   // (E14.6) what you were doing in the scene ends first
    const night = sleepMinutes(g, w, inn);
    const mins = wakeAt !== undefined ? Math.max(0, Math.min(night, wakeAt - nowAbs(g))) : night;
    const part = wakeAt !== undefined ? Math.min(1, mins / (8 * 60)) : 1;   // how much of a full night's rest
    const at = g.player.loc;
    const dayEnded = g.day;
    const judged = await endVisit(g, w);
    const start = daySnapshot(g, dayEnded);   // before the night: a change after midnight starts a new day
    beforeSleep(g).forEach(m => toast(m, 'info'));
    g.asleep = true;
    const msgs = advance(g, w, mins);
    g.asleep = false;
    // a bed away from home gives back part of a night at home (a capsule less than a ryokan); a nap, part of a night
    const rest = inn ? wakeUpAt(g, w, at, inn) : null;
    restAfterNight(g, w, rest, rest || part < 0.5 ? 0 : sleepMood(g, w), part);   // (a good bed at home lifts the mood)
    if (isRpg(w) && part >= 0.75) longRest(g, w);   // RPG: a long rest (hit points, focus, preparing spells)
    msgs.forEach(m => toast(m, 'warn'));
    runPlans();
    saveGame();
    await syncScene();
    lifeSound('sleep');
    if (isScenario(w)) state.view = 'scene';   // Home: you wake up where you were
    if (g.day === dayEnded) { showTransition('Rested', `${weekday(g.day)} · ${hm(g.minutes)}`, 'night'); notify(); return; }   // a nap: the same day goes on
    showTransition(`Day ${g.day}`, weekday(g.day), 'night');
    notify();
    // the day becomes a diary entry (one AI call), while the night passes on screen; then how the day went with
    // everyone (every source of the day, with the reasons the scene verdicts gave)
    const recap = (ok: boolean) => judged.done.then(v => dayChanges(g, start, v)).catch(() => dayChanges(g, start, null))
        .then(changes => (ok ? diaryReady(dayEnded, changes, true) : changes.length ? (diaryReady(dayEnded, [], false), showDayRecap(dayEnded, changes)) : diaryReady(dayEnded, [], false)));
    if (diaryOn() && systemOn(w, 'diary')) {
        setTimeout(() => diaryWaiting(dayEnded), 2600);   // after the night: "writing your diary…" until it is done
        writeDiary(g, w, dayEnded)
            .then(res => { markDayStart(g); saveGame(); refreshPrompt(); if (res.ok) toast(`Diary updated — day ${dayEnded}. Read it in the Journal.`, 'success'); void recap(res.ok); })
            .catch((e: any) => { void recap(false); toast(`The diary could not be written (${String(e?.message ?? e)}). The facts of the day are still in the Journal.`, 'warn'); });
    } else { markDayStart(g); setTimeout(() => void recap(false), 2600); }
}

// After a shift: time has passed; a short transition shows how it went.
export async function finishWork(msgs: string[], jobName: string) {
    { const { g, w } = ctxW(); await verdictNow(g, w, 'a work shift'); }   // the time at work ends the scene
    msgs.forEach((m, i) => toast(m, i ? 'success' : 'info'));
    runPlans();
    saveGame(); await syncScene();
    lifeSound('work');
    showTransition(jobName, msgs[0] ?? 'Shift done', 'work');
    notify();
}

Object.assign(ACT, {
    'plan-floor': (el) => { PV.floor = el.dataset.id ?? ''; notify(); },
    'jr-road': async (el) => { const to = JOURNEY.to; if (!to) return; await travelTo(to, el.dataset.v as 'camp' | 'push'); },
    'jr-cancel': () => { JOURNEY.to = ''; notify(); },
    'lt-go': async (el) => { const to = LATE.to; if (!to) return; await travelTo(to, undefined, el.dataset.v as 'taxi' | 'wait'); },
    'lt-cancel': () => { LATE.to = ''; notify(); },
});
Object.assign(ACT, {
    work: async () => {
        const { g, w } = ctxW();
        const job = jobDef(w, g.player.job?.id);
        if (!job || !atWork(g, w, job)) return;
        const c = canWork(g, w, job);
        if (c.kind === 'none') { toast(c.why ?? 'No shift now.', 'info'); return; }
        const tired = tooTired(g, w, job.cost ?? {}, 'work a shift'); if (tired) { toast(tired, 'warn'); return; }
        const mins = c.shift ? Math.max(0, c.shift.start - nowAbs(g)) + Math.min(c.shift.hours * 60, c.shift.end - Math.max(nowAbs(g), c.shift.start)) : job.shift * 60;
        if (askAboutPlans(g, mins, 'work')) return;   // a plan during the shift: ask first
        openWork();   // the work screen: how you spend the shift (like The Sims)
    },
    apply: (el) => {
        const { g, w } = ctxW();
        if (g.player.job && !el.dataset.force) { toast(lex(w, 'quitFirst'), 'info'); return; }
        const r = hire(g, w, el.dataset.id!);
        if (r.pick) { askTrack(el.dataset.id!, r.pick); return; }   // (job tracks) pick yours first
        toast(r.text, r.ok ? 'success' : 'warn'); saveGame(); notify();
    },
    // a click goes to the place (on a touch screen the first tap shows its card, with a "Go here" button)
    'maps-pick': (el, e) => { if (e && el.classList.contains('mu-worlds-veil') && (e.target as HTMLElement).closest('.mu-worlds')) return; mapsPicker = !mapsPicker; notify(); },
    'maps-go': (el) => { mapsPicker = false; const { g, w } = ctxW(); viewMap = el.dataset.map === youMap(g, w).id ? null : el.dataset.map || null; popFor = ''; state.mapView = {} as any; notify(); setTimeout(() => applyMapView(true), 0); },
    'find-open': () => { FIND.open = !FIND.open; FIND.focus = FIND.open; mapsPicker = false; hidePop(0); notify(); },
    'find-pick': (el) => pickFound(el.dataset.loc!),
    'find-go': (el) => { FIND.open = false; return goTo(el.dataset.loc!); },
    'open-map': (el) => { viewMap = el.dataset.map || null; popFor = ''; state.mapView = {} as any; notify(); setTimeout(() => applyMapView(true), 0); },
    pin: (el, e) => {
        if (moved) return;
        const { g, w } = ctxW();
        const link = placeOf(g, w, el.dataset.loc!)?.link;
        if (link) { viewMap = link; popFor = ''; state.mapView = {} as any; notify(); setTimeout(() => applyMapView(true), 0); return; }
        if ((e as PointerEvent).pointerType === 'touch' && popFor !== el.dataset.loc) { showPop(el, true); return; }
        return goTo(el.dataset.loc!);
    },
    go: (el) => goTo(el.dataset.loc!),
    travel: (el) => goTo(el.dataset.loc!),
    sleep: () => {
        const { g, w } = ctxW();
        const stay = stayOf(g);
        const mins = sleepMinutes(g, w, innHere(g, w, !!stay && stay.where === g.player.loc && g.player.loc !== playerHomeId));
        if (askAboutPlans(g, mins, 'sleep')) return;
        return sleep();
    },
    do: async (el) => {
        const { g, w } = ctxW();
        const a = actionsHere(g, w).find(x => x.id === el.dataset.id);
        if (!a) return;
        if (!canAfford(g, a)) { toast('Not enough money.', 'info'); return; }
        const tired = tooTired(g, w, Object.fromEntries(Object.entries(a.effects ?? {}).map(([k, v]) => [k, -v])), a.label.toLowerCase()); if (tired) { toast(tired, 'warn'); return; }
        if (isDoing()) return;
        actionSound(a.effects, a.id);
        // (E14.6) played out in the scene: it becomes the scene's focus while the clock runs (ui/sceneact.ts)
        if (state.view === 'scene' && playsInScene(g, w, a)) return startInScene(g, w, a);
        finishFirst(g, w, true);   // one going on in the scene ends first
        if (a.minutes >= 60) await verdictNow(g, w, 'a long action');   // an hour or more ends the scene
        // (adult) a private action can be stopped before it plays (not in the mood, a hard limit, getting caught): the
        // engine decides first, and a stopped one (no time spent) skips the wait and shows what happened instead
        const priv = isPrivateAct(g, a);
        if (!priv) await doing(a.label, a.icon ?? '⏳', a.minutes);   // a moment on screen while the time passes
        // what it does (the roll, an outcome, a keepsake, time together, the fact) is decided in sim/actions.ts
        const done = doAction(g, w, a);
        const stopped = !!done.stopped;
        if (priv && !stopped) await doing(a.label, a.icon ?? '⏳', a.minutes);
        done.lines.forEach(l => toast(l.text, l.kind));   // a stopped one's notice (getting caught: its fee, the ban, the word going round)
        runPlans();
        saveGame();
        await syncScene();
        const roll = done.roll;
        if (roll) toast(`${gradeName(roll.grade)} — ${roll.text}`, roll.grade.includes('success') ? 'success' : 'warn');
        else if (!done.outcome) toast(`${a.name}: done.`, 'success');
        // the AI only tells the story of what the engine decided
        if (state.view === 'scene') setPrompt('mundi_roll', done.ai);
        await narrateNow(g, w, a.label);
        maybeBump(g, w, a);   // then maybe someone here comes over, or someone arrives (the engine decides)
        notify();
    },
    // (E6) Book the night here (to use what it includes before sleeping), then sleep when you like
    'book-night': () => {
        const { g, w } = ctxW();
        const why = bookNight(g, w);
        if (why) { toast(why, 'info'); return; }
        toast('The night is booked: you can stay and sleep here.', 'success');
        saveGame(); notify();
    },
    zoom: (el) => zoomBy(el.dataset.d === 'in' ? 1.3 : 1 / 1.3),
    'zoom-fit': () => applyMapView(true),
});

// "The AI narrates what you do right away" (Settings → Game, on by default): the action goes into the chat as what you
// do, and the people with you answer with how it goes (the hint above tells them the result). Done on your own, it
// goes into the story without a reply: a narration would only retell what the screen already showed, with nothing
// decided by it. (The hint stays for the next reply.)
async function narrateNow(g: Save, w: WorldDef, label: string) {
    if (state.view !== 'scene' || state.generating || UI().narrateActions === false) return;
    const line = `*${label.charAt(0).toLowerCase()}${label.slice(1)}*`;
    if (!approachOn(w) || withYou(g, w).length) { sendCanned(line); return; }
    await addUserLine(await cannedText(line));
}
