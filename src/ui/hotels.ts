// The Business app's hotel parts (business, hospitality): a hotel's rooms (open of all, how full this week and right
// now, a night's and a rest's prices at its tier and style), the owner's note still owed, a partnership's shares, the
// rooms an upgrade opened and a second hotel; the tenants and the rooms you could let; and, at a love hotel with adult
// content on, the hotel's discretion (your setting, secrets kept and let slip, couples you know of) and the sighting
// waiting for your choice. The engine owns every number (sim/ventures.ts, sim/rooms.ts, sim/sightings.ts); this file
// only draws, and ui/business.ts puts these parts in the app and handles their clicks.
import { esc, adultOn, type Save } from '../core/store.js';
import type { WorldDef, VentureDef } from '../core/world.js';
import { statName } from '../core/ventures.js';
import { money } from '../sim/needs.js';
import { priceOf } from '../sim/bills.js';
import { placeOf } from '../sim/places.js';
import { personNamed } from '../sim/when.js';
import { isHotel } from '../sim/rooms.js';
import { tierOf, ventureName, placesOf, hotelOn, occupancyNow, occupancyWeek, hotelPrices, mineOf, tenancyOffers, type VentureState } from '../sim/ventures.js';
import { sightingsOn, pendingSighting, knownPairs } from '../sim/sightings.js';

const bar = (v: number) => `<span class="mu-bond"><i style="width:${Math.max(0, Math.min(100, Math.round(v)))}%"></i></span>`;
const pct = (v: number) => `${esc(String(Math.round(v * 100)))}%`;
const pname = (g: Save, w: WorldDef, id: string) => placeOf(g, w, id)?.name ?? id;
const first = (name: string) => name.split(/\s+/)[0];
// What a tenancy adds to the hotel's numbers, in words ("Atmosphere +6").
const adds = (d: VentureDef, add: Record<string, number> | undefined) => Object.entries(add ?? {}).filter(([, v]) => v).map(([k, v]) => `${statName(d, k)} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(', ');

/** A hotel's rooms: how many are open of all of them, how full this week and right now, its prices, and the places it
 *  runs at besides the first (a second hotel, rooms an upgrade opened). */
export function roomsHtml(g: Save, w: WorldDef, d: VentureDef, s: VentureState): string {
    if (!isHotel(d)) return '';
    const t = tierOf(d, s.tier), h = hotelOn(g, w, d, s, g.day), now = occupancyNow(g, w, d, s), week = occupancyWeek(g, w, d, s), p = hotelPrices(d, s);
    const taken = Math.round(h.open * now);
    const names = (ids: string[] | undefined) => (ids ?? []).map(id => pname(g, w, id)).join(' · ');
    return `<section class="mu-ph-card mu-biz-rooms"><b>The rooms</b><small>${esc(String(h.open))} of ${esc(String(h.rooms))} rooms open</small>
        ${h.open < h.rooms ? '<small class="mu-muted">More of them open as Capacity grows.</small>' : ''}
        <div class="mu-biz-stat"><span>This week</span><small>about ${pct(week)} full</small>${bar(week * 100)}</div>
        <div class="mu-biz-stat"><span>Right now</span><small>${esc(String(taken))} of ${esc(String(h.open))} taken</small>${bar(now * 100)}</div>
        <small>${esc(money(w, p.stay))} a night${p.rest && t.rests ? ` · ${esc(money(w, p.rest))} a rest` : ''}</small>
        ${s.places?.length ? `<small>A second hotel: <span data-notr>${esc(names(s.places))}</span></small>` : ''}
        ${s.opened?.length ? `<small>Opened by an upgrade: <span data-notr>${esc(names(s.opened))}</span></small>` : ''}</section>`;
}

/** The owner's note (H-2): what's still owed, the weekly instalment out of the takings and about how many weeks are left,
 *  and last week's payment. */
export function noteHtml(w: WorldDef, s: VentureState): string {
    if (!s.owes) return '';
    const left = Math.ceil(s.owes / Math.max(1, s.instalment ?? s.owes));
    return `<section class="mu-ph-card mu-biz-owes"><b>The owner's note</b><small>Still owed: ${esc(money(w, s.owes))}</small>
        <small>${esc(money(w, s.instalment ?? s.owes))} a week out of the takings · about ${esc(String(left))} ${left === 1 ? 'week' : 'weeks'} left</small>
        ${s.last?.note ? `<small>Last week: ${esc(money(w, s.last.note))} paid on the note</small>` : ''}
        <small class="mu-muted">Paid only from what the hotel takes in, never from your own money: a thin week pays less.</small></section>`;
}

/** A partnership: your share of the takings and the partner family's (with one partner, the rest of it), what an upgrade
 *  costs you, the next tier's share. */
export function partnerHtml(d: VentureDef, s: VentureState): string {
    if (s.way !== 'partner') return '';
    const mine = mineOf(d, s), next = d.tiers[s.tier]?.share;
    return `<section class="mu-ph-card mu-biz-partner"><b>A partnership</b><small>Your share of the takings: ${pct(mine)}</small>
        ${(s.partners ?? []).map((p, _, all) => // (one text with the name in it, so a translation can put the name where its language wants it)
            `<small>${esc(`${p.who}'s family: ${Math.round((all.length === 1 ? 1 - mine : p.share) * 100)}%`)}</small>`).join('')}
        <small class="mu-muted">The takings shown are your share. An upgrade costs you your share of its price; the family pays the rest and keeps an equal say.</small>
        ${next && next > mine ? `<small class="mu-muted">At the next tier your share grows to ${pct(next)}.</small>` : ''}</section>`;
}

/** Tenants (B-19): who rents a room now and for how much, and the rooms you could let (the person, the rent, what their
 *  business adds), each with its button. */
export function tenantsHtml(g: Save, w: WorldDef, d: VentureDef, s: VentureState): string {
    const offers = tenancyOffers(g, w).filter(x => x.s.id === s.id);
    const now = (s.tenants ?? []).map(x => ({ x, t: d.tenancies?.find(y => y.id === x.id), r: personNamed(g, x.who) }))
        .filter(o => o.t && o.r && !(o.r as any).gone && (!o.t.adult || adultOn(g)));
    if (!offers.length && !now.length) return '';
    const what = (rent: number, add: Record<string, number> | undefined) => `${esc(money(w, Math.round(priceOf(g, rent))))} a week${adds(d, add) ? ` · ${esc(adds(d, add))}` : ''}`;
    return `<section class="mu-ph-card mu-biz-tenants"><b>Tenants</b><small class="mu-muted">A room let for a business of their own: they pay rent with the week and keep their own hours. Not staff.</small>
        ${now.map(o => `<div class="mu-biz-up"><b data-notr>${esc(o.r!.name)}</b><small>Renting a room · ${esc(money(w, Math.round(priceOf(g, o.t!.rent))))} a week</small>${o.t!.text ? `<small class="mu-muted" data-notr>${esc(o.t!.text)}</small>` : ''}</div>`).join('')}
        ${offers.map(o => `<div class="mu-biz-up is-found"><b data-notr>${esc(o.r.name)}</b><small>Would rent a room: ${what(o.t.rent, o.t.add)}</small>${o.t.text ? `<small class="mu-muted" data-notr>${esc(o.t.text)}</small>` : ''}
            <button class="mu-primary" data-act="bz-let" data-id="${esc(s.id)}" data-t="${esc(o.t.id)}">Let the room</button></div>`).join('')}</section>`;
}

/** A love hotel's discretion (adult content only): whether you want to hear who came in with whom, the secrets kept and
 *  let slip, and the couples you know of. */
export function discretionHtml(g: Save, w: WorldDef, d: VentureDef, s: VentureState): string {
    if (!sightingsOn(g, w) || !(d.sightings?.length || d.notebook)) return '';
    const never = s.tell === 'never';
    const pairs = knownPairs(g).map(k => k.split('|').map(a => g.cast[a])).filter(([a, b]) => a && b).map(([a, b]) => `${first(a.name)} and ${first(b.name)}`);
    const opt = (tell: 'matters' | 'never', on: boolean, label: string, note: string) =>
        `<button class="mu-biz-opt ${on ? 'is-on' : ''}" data-act="bz-tell" data-id="${esc(s.id)}" data-tell="${tell}" ${on ? 'aria-disabled="true"' : ''}><b>${label}</b><small>${note}</small></button>`;
    return `<section class="mu-ph-card mu-biz-discretion"><b>Discretion</b><small class="mu-muted">Who comes in with whom stays at the desk. You hear of it at the desk during your own hours, or from the night desk's notebook.</small>
        ${opt('matters', !never, 'Tell me only when it matters', 'A secret you don\'t know yet, or a couple you didn\'t know was one.')}
        ${opt('never', never, 'Never tell me', 'Nothing comes to you from this hotel.')}
        <small>Secrets kept: ${esc(String(s.kept ?? 0))} · let slip: ${esc(String(s.slipped ?? 0))}</small>
        ${pairs.length ? `<small>Couples you know of: <span data-notr>${esc(pairs.join(', '))}</span></small>` : ''}</section>`;
}

/** The sighting waiting for your choice, as a card's parts (in the app anywhere, in the scene only at that hotel): its
 *  title, the line you heard, the three choices. */
export function sightingAsk(g: Save, w: WorldDef, inApp: boolean): { title: string; setup: string; icon: string; choices: { label: string; how: string; note: string }[] } | null {
    const x = pendingSighting(g, w);
    if (!x || (!inApp && !placesOf(x.s).includes(g.player.loc))) return null;
    const keeper = x.via === 'notebook' && x.d.notebook ? personNamed(g, x.d.notebook.who) : undefined;
    const title = keeper ? `${ventureName(w, x.s)}: ${first(keeper.name)}'s notebook` : `${ventureName(w, x.s)}: at the desk`;
    return { title, setup: x.line, icon: x.d.run?.icon ?? '🔑', choices: [
        { label: 'Keep it', how: 'keep', note: 'The hotel\'s discretion' },
        { label: 'Use it', how: 'use', note: 'You know; they don\'t know you know' },
        { label: 'Let it slip', how: 'slip', note: 'A rumor, and the hotel\'s name with it' },
    ] };
}
