// City events in the Calendar ("I'll go", go there now) and hobbies in the Profile.
import { esc, game, notify, saveGame, toast, nowAbs } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { ACT } from './reg.js';
import { money } from '../sim/needs.js';
import { weekday } from '../sim/time.js';
import { comingEvents, isGoing, toggleGoing, placeName, eventHere } from '../sim/cityevents.js';
import { hobbiesOf, skillsOf, progressOf, titleOf, MAX_LEVEL } from '../sim/hobbies.js';
import { practiceFor } from '../sim/practice.js';
const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function when(g, x) {
    const now = nowAbs(g);
    if (x.from <= now)
        return `on now, until ${hm(x.to % 1440)}`;
    const day = x.day === g.day ? 'Today' : x.day === g.day + 1 ? 'Tomorrow' : weekday(x.day);
    return `${day} · ${hm(x.from % 1440)}–${hm(x.to % 1440)}`;
}
// The Calendar's "In the city" list: the next 7 days.
export function cityEventsHtml(g, w) {
    const list = comingEvents(g, w, 7);
    if (!list.length)
        return '';
    const now = nowAbs(g);
    return `<section class="mu-city"><h4>In the city</h4>${list.map(x => {
        const live = x.from <= now && !x.off, going = isGoing(g, x.key), soon = x.day <= g.day + 1;
        const price = x.ev.price ? money(w, x.ev.price) : 'Free';
        return `<div class="mu-city-row ${going ? 'is-going' : ''} ${live ? 'is-live' : ''}">
            <i>${esc(x.ev.icon ?? '🎉')}</i><span><b>${esc(x.ev.name)}</b><small>${esc(placeName(w, x.ev.place))} · ${esc(when(g, x))} · ${esc(price)}</small>
            ${x.off && soon ? '<small class="mu-bad">Called off: rain</small>' : x.ev.desc ? `<small class="mu-muted">${esc(x.ev.desc)}</small>` : ''}
            ${x.ev.stage ? `<small class="mu-muted">🎤 <span>${esc(x.ev.stage.label)}</span> (<span>${esc(hobbiesOf(w).find(h => h.id === x.ev.stage.hobby)?.name ?? x.ev.stage.hobby)}</span> ${x.ev.stage.level}+)</small>` : ''}</span>
            ${x.off && soon ? '' : live && g.player.loc !== x.ev.place ? `<button class="mu-primary" data-act="go" data-loc="${esc(x.ev.place)}">Go now</button>`
            : live ? '<em class="mu-good">You are here</em>' : `<button class="${going ? 'mu-primary' : 'mu-ghost'}" data-act="ce-go" data-key="${esc(x.key)}">${going ? '✓ Going' : "I'll go"}</button>`}
        </div>`;
    }).join('')}</section>`;
}
// The HUD chip while an event is on where you are.
export const eventChip = (g, w) => { const x = eventHere(g, w); return x ? `<small class="mh-crowd mh-fest" title="${esc(x.ev.desc ?? '')}">${esc(x.ev.icon ?? '🎉')}<span>${esc(x.ev.name)}</span></small>` : ''; };
export const cityBadge = (g, w) => comingEvents(g, w, 1).filter(x => isGoing(g, x.key) && !x.off && x.from - nowAbs(g) <= 120 && x.to > nowAbs(g)).length;
// The Profile's skills and hobbies: level, title and a bar to the next level.
export function hobbiesHtml(g, w) {
    const list = skillsOf(w, g);
    if (!list.length)
        return '';
    return `<section class="mu-hobbies"><h4>🎯 ${w.skills?.length ? 'Skills' : 'Hobbies'}</h4><p class="mu-muted">Practice levels them up: each 2 levels are +1 on their rolls, each level pays more, and jobs and promotions ask for them.</p>
        ${list.map(h => {
        const p = progressOf(g, h.id);
        return `<div class="mu-pf-row mu-hobby"><b>${esc(h.icon ?? '⭐')} ${esc(h.name)} <em>Lv ${p.level}</em></b>
            <small>${esc(titleOf(p.level))}${p.level < MAX_LEVEL ? ` · ${p.xp}/${p.next} xp` : ' · top level'}${h.desc ? ` · ${esc(h.desc)}` : ''}</small>
            <span class="mu-bond"><i style="width:${p.pct}%"></i></span>${practiceHtml(g, w, h.id)}</div>`;
    }).join('')}</section>`;
}
// (kept open across redraws, which happen every game minute; this session only)
const PRACTICE_OPEN = new Set();
// Under a skill: what trains it in the places you've been to and at home, folded. Places you haven't been to are only
// counted, so it points you somewhere without listing the whole city.
function practiceHtml(g, w, id) {
    const p = practiceFor(g, w, id);
    if (!p.spots.length && !p.unseen && !p.jobs.length && !p.immersion)
        return '';
    const where = (s) => s.home ? `Home${s.item ? ` · needs ${esc(s.item)}` : ''}` : s.anywhere ? 'Anywhere'
        : `<span data-notr>${esc(s.where.slice(0, 3).join(', '))}</span>${s.where.length > 3 ? ` +${s.where.length - 3}` : ''}${s.more ? ` · ${s.more === 1 ? '1 more place' : `${s.more} more places`}` : ''}`;
    const list = p.spots.map(s => `<li><b><span>${esc(s.icon)}</span> <span data-notr>${esc(s.label)}</span></b><small>${where(s)}</small></li>`).join('');
    const itself = p.immersion ? '<small class="mu-muted">It also grows by itself, every hour you spend out among people who speak it.</small>' : '';
    const jobs = p.jobs.length ? `<small class="mu-muted">Jobs that train it each shift: <span data-notr>${esc(p.jobs.slice(0, 5).join(', '))}</span>${p.jobs.length > 5 ? ` +${p.jobs.length - 5}` : ''}</small>` : '';
    const more = p.spots.length ? ' more' : ''; // (with nothing found yet, these are all there is)
    const unseen = p.unseen ? `<small class="mu-muted">${p.unseen === 1 ? `1${more} in a place you haven't been to yet.` : `${p.unseen}${more} in places you haven't been to yet.`}</small>` : '';
    return `<details class="mu-practice" ${PRACTICE_OPEN.has(id) ? 'open' : ''}><summary data-act="practice-fold" data-id="${esc(id)}">Where to practise${p.spots.length ? ` (${p.spots.length})` : ''}</summary>
        ${list ? `<ul>${list}</ul>` : p.unseen ? '' : `<small class="mu-muted">Nothing in the places you've been to yet.</small>`}${unseen}${itself}${jobs}</details>`;
}
Object.assign(ACT, {
    'practice-fold': (el, e) => {
        e.preventDefault();
        const id = el.dataset.id;
        if (!PRACTICE_OPEN.delete(id))
            PRACTICE_OPEN.add(id);
        notify();
    },
    'ce-go': (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const key = el.dataset.key;
        const x = comingEvents(g, w, 7).find(e => e.key === key);
        if (!x)
            return;
        const on = toggleGoing(g, key);
        toast(on ? `You'll go to the ${x.ev.name}. You get a reminder an hour before.` : `Not going to the ${x.ev.name}.`, on ? 'success' : 'info');
        saveGame();
        notify();
    },
});
