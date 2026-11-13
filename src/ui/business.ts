// The Business app (phone, system `business`): the ventures you own and the ways in. A venture: its tier and what the
// next one asks, its style (chosen once a tier), its four numbers against the tier's ceiling, this week and last week's
// report, upgrades (ready to buy, waiting where you found them, owned, still to find as hints of where, a later tier's),
// discoveries, the hired hands, a second place, selling. An executive's division: the season's budget and target, the
// board's verdicts, its initiatives. Not yet a venture: the takeover when it's offered, the units to lease (with a name
// of your own). Also the HUD's rows at your venture's place ("Run the counter") and the card for one of its events or a
// calendar card. The engine owns every number (sim/ventures.ts, sim/exec.ts); this file only draws and calls.
import { esc, game, toast, notify, saveGame, state, type Save } from '../core/store.js';
import { getWorld, type WorldDef, type VentureDef, type UpgradeDef } from '../core/world.js';
import { statsOf, statName } from '../core/ventures.js';
import { money } from '../sim/needs.js';
import { placeOf } from '../sim/places.js';
import { refreshPrompt } from '../sim/prompt.js';
import { syncScene } from '../sim/game.js';
import { personaName } from '../st/bridge.js';
import {
    venturesOf, ventureDefs, ventureDef, ventureAt, ventureName, tierOf, placesOf, fill, weekGuess, milestoneOf, stylesNow, styleDue, styleCost,
    chooseStyle, upgradesOf, buyUpgrade, waysOpen, openVenture, closeVenture, sellValue, morePlaces, addPlace, runBlock, stintHours, runStint,
    pendingVentureEvent, chooseVentureEvent, pendingCard, chooseCard, skipCard, type VentureState, type UpgradeState,
} from '../sim/ventures.js';
import { budgetOf, targetOf } from '../sim/exec.js';
import { ACT, INPUT } from './reg.js';
import { finishWork } from './map.js';

/** What the app shows (memory only): the name you're typing for a café of your own, the venture whose finished
 *  upgrades are open, and a pending "sell it?". */
export const BZ = { name: '', owned: '', sell: '' };
const bar = (v: number) => `<span class="mu-bond"><i style="width:${Math.max(0, Math.min(100, Math.round(v)))}%"></i></span>`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pname = (g: Save, w: WorldDef, id: string) => placeOf(g, w, id)?.name ?? id;
const an = (s: string) => (/^[aeiou]/i.test(s) ? 'an' : 'a');

/** The badge on the phone's icon: one of your ventures' events or a calendar card waiting, a style to choose, an upgrade
 *  you found waiting to be bought. */
export function businessBadge(g: Save, w: WorldDef): boolean {
    if (!w.ventures?.length || !venturesOf(g).length) return false;
    if (pendingCard(g, w) || pendingVentureEvent(g, w)) return true;
    return venturesOf(g).some(s => { const d = ventureDef(w, s.id); return !!d && (styleDue(d, s) || upgradesOf(g, w, s).some(x => x.state === 'found')); });
}

export function businessApp(g: Save, w: WorldDef, head: string): string {
    if (!ventureDefs(g, w).length) return `${head}<div class="mu-ph-body mu-biz"><p class="mu-muted">No businesses here.</p></div>`;
    const mine = venturesOf(g).filter(s => ventureDef(w, s.id));
    return `${head}<div class="mu-ph-body mu-biz">${askHtml(g, w, true)}${mine.map(s => ventureHtml(g, w, s)).join('')}${waysHtml(g, w)}${execHint(g, w)}</div>`;
}

/* ---------- a venture ---------- */

function ventureHtml(g: Save, w: WorldDef, s: VentureState): string {
    const d = ventureDef(w, s.id)!, t = tierOf(d, s.tier), exec = d.track === 'exec';
    const where = placesOf(s).map(p => pname(g, w, p)).join(' · ');
    const head = `<section class="mu-ph-card mu-biz-head"><small>${esc(t.name)}${d.tiers.length > 1 ? ` · tier ${esc(String(s.tier))} of ${esc(String(d.tiers.length))}` : ''}</small>
        <b data-notr>${esc(ventureName(w, s))}</b><small data-notr>${esc(where)}</small>${t.desc ? `<small class="mu-muted" data-notr>${esc(t.desc)}</small>` : ''}</section>`;
    return `<div class="mu-biz-venture">${head}${exec ? execHtml(g, w, d, s) : weekHtml(g, w, d, s)}${numbersHtml(g, w, d, s)}${styleHtml(g, w, d, s)}${milestoneHtml(g, w, d, s)}
        ${upgradesHtml(g, w, d, s)}${discoveriesHtml(d, s)}${staffHtml(s)}${exec ? '' : placesHtml(g, w, s)}${exec ? '' : sellHtml(g, w, s)}</div>`;
}
function numbersHtml(g: Save, w: WorldDef, d: VentureDef, s: VentureState): string {
    const cap = tierOf(d, s.tier).ceiling;
    return `<section class="mu-ph-card mu-biz-stats">${statsOf(d).map(k => { const v = Math.round(s.stats[k] ?? 0); return `<div class="mu-biz-stat"><span>${esc(statName(d, k))}</span><small>${esc(String(v))} / ${esc(String(cap))}</small>${bar((v / Math.max(1, cap)) * 100)}</div>`; }).join('')}
        <small class="mu-muted">${Math.round(fill(d, s) * 100) >= 99 ? 'At the ceiling of this tier: the next tier lets it grow.' : `${esc(String(Math.round(fill(d, s) * 100)))}% of what this tier can be.`}</small></section>`;
}
function weekHtml(g: Save, w: WorldDef, d: VentureDef, s: VentureState): string {
    const alone = (tierOf(d, s.tier).alone ?? 0) > 0;
    const guess = weekGuess(g, w, s, alone ? 2 : 4);
    const last = s.last;
    return `<section class="mu-ph-card mu-biz-week"><b>This week</b><small>${esc(money(w, s.week.takings))} so far${s.week.run ? ` · you ran it ${esc(plural(s.week.run, 'day'))}` : ''}${s.rent ? ` · rent ${esc(money(w, s.rent))} a week` : ''}</small>
        <small class="mu-muted">${alone ? `Open every day: hired hands keep it going when you're not there (${esc(String(Math.round(((tierOf(d, s.tier).alone ?? 0) + (s.manager ? 0.15 : 0)) * 100)))}% of a day you run it yourself).` : 'Open only while you run it yourself: go there and run the counter.'} About ${esc(money(w, guess))} a week if you run it ${alone ? 'two' : 'four'} days.</small>
        ${last ? `<small>Last week: ${esc(money(w, last.takings))} in${last.costs ? `, ${esc(money(w, last.costs))} of rent` : ''}${last.run ? ` · you ran it ${esc(plural(last.run, 'day'))}` : ''}</small>` : ''}
        ${[...(s.week.notes ?? [])].reverse().slice(0, 4).map(n => `<small class="mu-biz-note" data-notr>${esc(n)}</small>`).join('')}</section>`;
}
function execHtml(g: Save, w: WorldDef, d: VentureDef, s: VentureState): string {
    const got = Math.round(fill(d, s) * 100), want = Math.round(targetOf(s) * 100);
    return `<section class="mu-ph-card mu-biz-week"><b>This season</b><small>Budget left for initiatives: ${esc(money(w, s.cash))} of ${esc(money(w, budgetOf(g, d, s.tier)))}</small>
        <small>The board's target: ${esc(String(want))}% · the division now: ${esc(String(got))}%</small>${bar(got)}
        <small class="mu-muted">A fuller division makes each shift count for more and the summer and winter bonuses larger. The board looks at it when the season ends.</small>
        ${(s.verdicts ?? []).slice(-3).reverse().map(v => `<small class="${v.got >= v.want ? 'mu-good' : 'mu-bad'}">A season: ${esc(String(v.got))}% against ${esc(String(v.want))}%</small>`).join('')}</section>`;
}
function styleHtml(g: Save, w: WorldDef, d: VentureDef, s: VentureState): string {
    const list = stylesNow(d, s);
    const cur = (d.styles ?? []).find(x => x.id === s.style);
    if (!list.length) return cur ? `<section class="mu-ph-card"><small>Style</small><b data-notr>${esc(cur.name)}</b><small class="mu-muted" data-notr>${esc(cur.desc)}</small></section>` : '';
    const due = styleDue(d, s), cost = styleCost(g, w, s);
    return `<section class="mu-ph-card mu-biz-style"><b>${due ? 'Choose its style' : 'Style'}</b><small class="mu-muted">${due ? 'Once for this tier: about the same money, different guests, different stories, and some upgrades only one style finds.' : `Changing it is a renovation: ${esc(money(w, cost))}.`}</small>
        ${list.map(x => `<button class="mu-biz-opt ${x.id === s.style ? 'is-on' : ''}" data-act="bz-style" data-id="${esc(s.id)}" data-style="${esc(x.id)}" ${x.id === s.style && !due ? 'aria-disabled="true"' : ''}><b data-notr>${esc(x.name)}</b><small data-notr>${esc(x.desc)}</small></button>`).join('')}</section>`;
}
function milestoneHtml(g: Save, w: WorldDef, d: VentureDef, s: VentureState): string {
    const m = milestoneOf(g, w, s);
    if (!m) return '';
    const tick = (ok: boolean) => (ok ? '✓' : '·');
    const story = m.story && (w.stories ?? []).find(x => x.id === m.story!.id);
    return `<section class="mu-ph-card mu-biz-next"><b>Next: ${esc(m.next.name)}</b>${m.next.desc ? `<small class="mu-muted" data-notr>${esc(m.next.desc)}</small>` : ''}
        ${m.upgrade ? `<small class="${m.upgrade.owned ? 'mu-good' : ''}">${tick(m.upgrade.owned)} <span data-notr>${esc(m.upgrade.u.name)}</span></small>` : ''}
        ${m.story ? `<small class="${m.story.seen ? 'mu-good' : ''}">${tick(m.story.seen)} <span data-notr>${esc(story?.title ? story.title.charAt(0).toUpperCase() + story.title.slice(1) : 'A moment at the place')}</span></small>` : ''}
        ${m.when !== undefined ? `<small class="${m.when ? 'mu-good' : ''}">${tick(m.when)} Something more</small>` : ''}</section>`;
}
const STATE_ORDER: UpgradeState[] = ['found', 'ready', 'later', 'hidden', 'owned'];
function upgradesHtml(g: Save, w: WorldDef, d: VentureDef, s: VentureState): string {
    const list = upgradesOf(g, w, s);
    if (!list.length) return '';
    const exec = d.track === 'exec', pay = exec ? s.cash : g.player.money;
    const by = (st: UpgradeState) => list.filter(x => x.state === st);
    const row = ({ u, state: st, price }: { u: UpgradeDef; state: UpgradeState; price: number }) => {
        const atCap = (s.stats[u.stat] ?? 0) >= tierOf(d, s.tier).ceiling;
        const what = `${statName(d, u.stat)} +${u.add}${u.staff ? ` · hires ${u.staff}` : ''}${u.manager ? ' · runs it on its own' : ''}`;
        if (st === 'hidden') return `<div class="mu-biz-up is-hint"><b>${u.how === 'found' ? 'Still to find' : 'To earn'}</b><small data-notr>${esc(u.hint || (u.how === 'found' ? 'somewhere in the city' : 'a step in your life'))} · ${esc(statName(d, u.stat))}</small></div>`;
        if (st === 'later') return `<div class="mu-biz-up is-later"><b data-notr>${esc(u.name)}</b><small>${esc(what)} · from the ${esc(tierOf(d, u.tier).name.toLowerCase())}</small></div>`;
        return `<div class="mu-biz-up ${st === 'found' ? 'is-found' : ''}"><b data-notr>${esc(u.name)}</b><small>${esc(what)}${st === 'found' ? ' · you found it' : u.how === 'earned' ? ' · earned' : ''}</small>
            ${u.desc ? `<small class="mu-muted" data-notr>${esc(u.desc)}</small>` : ''}${atCap ? `<small class="mu-muted">${esc(statName(d, u.stat))} is at this tier's ceiling: it counts once the next opens.</small>` : ''}
            <button class="mu-primary" data-act="bz-buy" data-id="${esc(s.id)}" data-up="${esc(u.id)}" ${price > pay ? 'aria-disabled="true"' : ''}>${price ? `${exec ? 'Fund' : 'Buy'} · ${esc(money(w, price))}` : 'Take it'}</button></div>`;
    };
    const owned = by('owned');
    const open = BZ.owned === s.id;
    return `<section class="mu-ph-card mu-biz-ups"><b>${exec ? 'Initiatives' : 'Upgrades'}</b><small class="mu-muted">${exec ? 'Paid from the season\'s budget. Some turn up around Tokyo, some are earned.' : 'Each costs more than the last of its number. Many are found around Tokyo, or earned; money only buys what\'s there.'}</small>
        ${STATE_ORDER.filter(x => x !== 'owned').flatMap(st => by(st).map(row)).join('')}
        ${owned.length ? `<button class="mu-ghost" data-act="bz-owned" data-id="${esc(s.id)}">${open ? 'Hide' : 'Show'} what you have (${esc(String(owned.length))})</button>${open ? owned.map(x => `<small class="mu-good" data-notr>✓ ${esc(x.u.name)}</small>`).join('') : ''}` : ''}</section>`;
}
function discoveriesHtml(d: VentureDef, s: VentureState): string {
    const all = d.discoveries ?? [];
    if (!all.length) return '';
    const got = all.filter(x => s.disc.includes(x.id)), left = all.length - got.length;
    return `<section class="mu-ph-card mu-biz-disc"><b>Discoveries</b>${got.map(x => `<small data-notr>✦ <b>${esc(x.name)}</b>: ${esc(x.text)}</small>`).join('')}
        <small class="mu-muted">${left ? `${esc(plural(left, 'more', 'more'))} to discover while you run it yourself, at the right time of year or day.` : 'Every one of them found.'}</small></section>`;
}
function staffHtml(s: VentureState): string {
    if (!s.staff.length) return '';
    return `<section class="mu-ph-card mu-biz-staff"><b>Staff</b>${s.staff.map(h => `<small data-notr><b>${esc(h.name)}</b> · ${esc(h.quirk)}</small>`).join('')}${s.manager ? '<small class="mu-muted">The manager runs it on the days you don\'t.</small>' : ''}</section>`;
}
function placesHtml(g: Save, w: WorldDef, s: VentureState): string {
    const more = morePlaces(g, w, s);
    if (!more.length) return '';
    return `<section class="mu-ph-card"><b>A second place</b><small class="mu-muted">This tier runs at two places. Choose where:</small>
        ${more.map(u => `<button class="mu-biz-opt" data-act="bz-place" data-id="${esc(s.id)}" data-place="${esc(u.place)}" ${u.cost > g.player.money ? 'aria-disabled="true"' : ''}><b data-notr>${esc(pname(g, w, u.place))}</b><small>${esc(money(w, u.cost))} to open · ${esc(money(w, u.rent))} a week</small></button>`).join('')}</section>`;
}
function sellHtml(g: Save, w: WorldDef, s: VentureState): string {
    if (BZ.sell !== s.id) return `<div class="mu-row mu-biz-sell"><button class="mu-ghost" data-act="bz-sell-ask" data-id="${esc(s.id)}">Sell or close it…</button></div>`;
    return `<section class="mu-ph-card mu-biz-sell"><small class="mu-bad">Sell ${esc(ventureName(w, s))} for ${esc(money(w, sellValue(g, s)))}, or close it for nothing? What you built there is gone.</small>
        <div class="mu-row"><button class="mu-danger" data-act="bz-sell" data-id="${esc(s.id)}">Sell</button><button class="mu-ghost" data-act="bz-close" data-id="${esc(s.id)}">Close it</button><button data-act="bz-sell-no">Keep it</button></div></section>`;
}

/* ---------- ways in ---------- */

function waysHtml(g: Save, w: WorldDef): string {
    const ways = waysOpen(g, w);
    if (!ways.length) return '';
    const take = ways.filter(x => x.way === 'takeover'), lease = ways.filter(x => x.way === 'lease');
    const tier = (d: VentureDef, way: 'takeover' | 'lease') => tierOf(d, (way === 'takeover' ? d.ways?.takeover?.tier : d.ways?.lease?.tier) ?? 1);
    return `${take.map(x => `<section class="mu-ph-card mu-biz-way"><small>A takeover</small><b data-notr>${esc(x.d.name)}</b>${x.d.desc ? `<small class="mu-muted" data-notr>${esc(x.d.desc)}</small>` : ''}
            <small>Key money ${esc(money(w, x.cost))}${x.rent ? ` · rent ${esc(money(w, x.rent))} a week` : ''} · it starts as ${esc(an(tier(x.d, 'takeover').name))} ${esc(tier(x.d, 'takeover').name.toLowerCase())}</small>
            <button class="mu-primary" data-act="bz-open" data-id="${esc(x.d.id)}" data-way="takeover" data-place="${esc(x.place)}" ${x.cost > g.player.money ? 'aria-disabled="true"' : ''}>Take it over</button></section>`).join('')}
        ${lease.length ? `<section class="mu-ph-card mu-biz-way"><small>A place of your own</small><b data-notr>${esc(lease[0].d.name)}</b>${lease[0].d.desc ? `<small class="mu-muted" data-notr>${esc(lease[0].d.desc)}</small>` : ''}
            <small>It starts as ${esc(an(tier(lease[0].d, 'lease').name))} ${esc(tier(lease[0].d, 'lease').name.toLowerCase())}. Give it a name, then choose a unit:</small>
            <input class="mu-input" data-input="bz-name" maxlength="40" placeholder="Your café's name" value="${esc(BZ.name)}">
            ${lease.map(x => `<button class="mu-biz-opt" data-act="bz-open" data-id="${esc(x.d.id)}" data-way="lease" data-place="${esc(x.place)}" ${x.cost > g.player.money ? 'aria-disabled="true"' : ''}><b data-notr>${esc(pname(g, w, x.place))}</b>
                <small data-notr>${esc((w.places.find(p => p.id === x.place)?.desc ?? '').slice(0, 140))}</small><small>${esc(money(w, x.cost))} to move in · ${esc(money(w, x.rent))} a week</small></button>`).join('')}</section>` : ''}`;
}
// An executive's division isn't opened here: it comes with the first rank above a company's top.
function execHint(g: Save, w: WorldDef): string {
    const divs = ventureDefs(g, w).filter(d => d.track === 'exec' && !venturesOf(g).some(s => s.id === d.id));
    if (!divs.length || venturesOf(g).some(s => ventureDef(w, s.id)?.track === 'exec')) return '';
    const names = divs.map(d => w.occupations.find(o => o.id === d.job)?.name).filter(Boolean) as string[];
    return `<section class="mu-ph-card mu-biz-way"><small>The executive's floor</small><b>A division of your own</b><small class="mu-muted">Above a company's top ranks (${esc(names.join(', '))}): seasons at the top, skills at their best, the leadership program and the board's nomination. The Jobs app shows what your next rank asks.</small></section>`;
}

/* ---------- at the place, and the cards ---------- */

/** The HUD's rows at a venture of yours: run the counter (a stint, hours like a shift) and the app. */
export function ventureActs(g: Save, w: WorldDef): string {
    if (!w.ventures?.length) return '';
    const s = ventureAt(g, w, g.player.loc), d = s && ventureDef(w, s.id);
    if (s && d && d.track !== 'exec') {
        const why = runBlock(g, w, s), h = stintHours(g, w, s);
        return `<button class="mh-act mh-glass" data-act="bz-run" data-id="${esc(s.id)}" ${why ? `aria-disabled="true" title="${esc(why)}"` : ''}><i>☕</i><b>Run the counter</b><small>${why ? esc(why) : `${esc(plural(h, 'hour'))} · `}<span data-notr>${esc(ventureName(w, s))}</span></small></button>
            <button class="mh-act mh-glass" data-act="ph-open-business"><i>📒</i><b>Your business</b><small>${esc(tierOf(d, s.tier).name)}</small></button>`;
    }
    const offer = waysOpen(g, w).find(x => x.way === 'takeover' && x.place === g.player.loc);
    return offer ? `<button class="mh-act mh-glass is-quest" data-act="ph-open-business"><i>🔑</i><b>Take it over</b><small data-notr>${esc(offer.d.name)} · ${esc(money(w, offer.cost))}</small></button>` : '';
}
/** One of your venture's events (at its place) or a calendar card, as a card in the scene (`inApp`: drawn in the app). */
export function ventureAskHtml(g: Save, w: WorldDef): string { return state.view === 'scene' ? askHtml(g, w, false) : ''; }
function askHtml(g: Save, w: WorldDef, inApp: boolean): string {
    if (!w.ventures?.length || !venturesOf(g).length) return '';
    const me = personaName(), say = (t: string) => t.replace(/\{\{user\}\}/g, me);
    const ev = pendingVentureEvent(g, w);
    if (ev && (inApp || placesOf(ev.s).includes(g.player.loc))) return card(`At ${ventureName(w, ev.s)}`, say(ev.ev.setup), ev.choices.map(x => ({ label: x.c.label, roll: x.c.roll?.skill, act: 'bz-ev', i: x.i })), '', inApp);
    const c = pendingCard(g, w);
    if (c) return card(`${ventureName(w, c.s)}: this week`, say(c.card.setup), c.choices.map(x => ({ label: x.c.label, roll: x.c.roll?.skill, act: 'bz-card', i: x.i, mins: x.c.minutes })), 'bz-skip', inApp);
    return '';
}
function card(title: string, setup: string, choices: { label: string; roll?: string; act: string; i: number; mins?: number }[], skip: string, inApp: boolean): string {
    const btns = `${choices.map((x, n) => `<button class="${n ? '' : 'mu-primary'}" data-act="${x.act}" data-i="${x.i}"><span data-notr>${esc(x.label)}</span>${x.roll ? `<small>🎲 ${esc(x.roll)}</small>` : x.mins ? `<small>${esc(plural(Math.round(x.mins / 60) || 1, 'hour'))}</small>` : ''}</button>`).join('')}${skip ? `<button class="mu-ghost" data-act="${skip}">Not this time</button>` : ''}`;
    if (inApp) return `<section class="mu-ph-card mu-biz-ask"><b data-notr>${esc(title)}</b><small data-notr>${esc(setup)}</small><div class="mu-biz-ask-btns">${btns}</div></section>`;
    return `<div class="mh-invite mh-happen mh-story mh-glass" role="dialog" aria-label="${esc(title)}"><span class="mh-story-ic" aria-hidden="true">☕</span>
        <div><b data-notr>${esc(title)}</b><p data-notr>${esc(setup)}</p></div><div class="mh-invite-btns">${btns}</div></div>`;
}

/* ---------- clicks ---------- */

const C = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const done = (m: string | string[], kind: 'info' | 'success' | 'warn' = 'success') => {
    const list = Array.isArray(m) ? m : [m];
    list.filter(Boolean).forEach((t, n) => toast(t, n === 0 && t.startsWith('🎲') ? 'info' : kind));
    saveGame(); refreshPrompt(); notify();
};
const bad = (m: string) => /^(It costs|It takes|Not |Only|You have|A new style means)/.test(m);
Object.assign(ACT, {
    'bz-run': async (el) => {
        const c = C(); if (!c || state.generating) return;
        const s = venturesOf(c.g).find(x => x.id === el.dataset.id); if (!s) return;
        const why = runBlock(c.g, c.w, s); if (why) { toast(why, 'warn'); return; }
        const msgs = runStint(c.g, c.w, s.id);
        if (pendingVentureEvent(c.g, c.w)) msgs.push('Something comes up at the counter.');
        await finishWork(msgs, ventureName(c.w, s));
        refreshPrompt();
    },
    'bz-buy': (el) => { const c = C(); if (!c) return; const m = buyUpgrade(c.g, c.w, el.dataset.id!, el.dataset.up!); done(m, bad(m) ? 'warn' : 'success'); },
    'bz-style': (el) => { const c = C(); if (!c) return; const m = chooseStyle(c.g, c.w, el.dataset.id!, el.dataset.style!); done(m, bad(m) ? 'warn' : 'success'); },
    'bz-owned': (el) => { BZ.owned = BZ.owned === el.dataset.id ? '' : el.dataset.id!; notify(); },
    'bz-open': async (el) => {
        const c = C(); if (!c) return;
        const way = el.dataset.way as 'takeover' | 'lease';
        if (way === 'lease' && !BZ.name.trim()) { toast('Give your café a name first.', 'warn'); return; }
        const m = openVenture(c.g, c.w, el.dataset.id!, way, el.dataset.place!, BZ.name);
        if (!m || bad(m)) { toast(m || 'Not open to you now.', 'warn'); return; }
        BZ.name = '';
        done(m); await syncScene();
    },
    'bz-place': async (el) => { const c = C(); if (!c) return; const m = addPlace(c.g, c.w, el.dataset.id!, el.dataset.place!); done(m, bad(m) ? 'warn' : 'success'); await syncScene(); },
    'bz-sell-ask': (el) => { BZ.sell = el.dataset.id!; notify(); },
    'bz-sell-no': () => { BZ.sell = ''; notify(); },
    'bz-sell': async (el) => { const c = C(); if (!c) return; BZ.sell = ''; done(closeVenture(c.g, c.w, el.dataset.id!, true)); await syncScene(); },
    'bz-close': async (el) => { const c = C(); if (!c) return; BZ.sell = ''; done(closeVenture(c.g, c.w, el.dataset.id!, false), 'info'); await syncScene(); },
    'bz-ev': async (el) => { const c = C(); if (!c) return; done(chooseVentureEvent(c.g, c.w, Number(el.dataset.i))); await syncScene(); },
    'bz-card': async (el) => { const c = C(); if (!c) return; done(chooseCard(c.g, c.w, Number(el.dataset.i))); await syncScene(); },
    'bz-skip': () => { const c = C(); if (!c) return; skipCard(c.g); done('You let it go this time.', 'info'); },
});
Object.assign(INPUT, { 'bz-name': (el: HTMLInputElement) => { BZ.name = el.value; } });
