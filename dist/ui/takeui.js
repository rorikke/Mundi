// The Take app (phone, system `industry`, adult content only): the adult video work in six tabs. Offers (Briefs for a
// director): each title's contract with its scenes, co-stars, fee and how long it's kept, a scene to ask off, turning
// it down; a brief planned with its cast, set and a script; the exclusive contract, its renewal, a fan meeting and the
// lens's offer as cards of their own; your own limits; the talk a partner asked for. Schedule: the shoot on set now, the
// monthly test, shoot days to move, edits, releases. Titles: every title as its cover (the set's picture, the stars'
// sprites, the title, label and stars' names over them), opening a title's page with each scene's picture and roll (the
// parts by name), sales week by week as a text sparkline and its chart weeks, and cancelling. Chart: this week's top 10
// with yours marked, the month's hot and cold genres and the news line. Roster: the performers you've worked with and
// Tokyo's people in your titles. Label: your own label, when you have one. Unfolded like Lens: your seats and fame with
// the tabs and their counts on the left, the open tab on the right. Also the HUD's cards for a fan who recognizes you
// and the talk, the trend's line at Messages' top, and the badge. The engine owns every number (sim/titles.ts,
// sim/bookings.ts, sim/onset.ts, sim/covers.ts, sim/fame.ts, sim/stance.ts); this file only draws and calls.
// (plans/industry-lens.md) The stills: on set, *Take the stills* for the director or the stills photographer (the
// set's engine action, run as Edit is) with the stills taken so far; a title's page shows its stills (Lens's pictures,
// each opening in Lens) and its photo cover with the still's stars and the bonus it gives the first week; a title you
// took the stills on shows that seat, has its own heading in Titles and a shoot day you don't move (the label's).
import { esc, game, toast, notify, saveGame, state, adultOn, SAVE } from '../core/store.js';
import { getWorld, worldFile, appsShown } from '../core/world.js';
import { num, safeUrl } from '../core/safe.js';
import { refreshPrompt } from '../sim/prompt.js';
import { money, actionsHere } from '../sim/needs.js';
import { weekday } from '../sim/time.js';
import { myJob, trackOf, rankOf } from '../sim/work.js';
import { peekIndustry, industryOn, inIndustry, seatsNow, fameOf, rankWords, industryJob, setsOf, labelOf, monthOf, } from '../sim/industry.js';
import { fanBase, testNext, entriesOf } from '../sim/bookings.js';
import { offersView, titlesView, chartView, rosterView, castChoices, takeOffer, declineOffer, askSceneOff, planBrief, setShootDay, cancelTitle, setLimits, salesWeeks, setPlace, isCommissioned, holdsStills, coverBonus, TITLES, EDIT_ID, } from '../sim/titles.js';
import { fanNow, answerFan } from '../sim/fame.js';
import { talkNow, answerTalk } from '../sim/stance.js';
import { venturesOf, ventureDef, ventureName, tierOf } from '../sim/ventures.js';
import { photoSpriteFolders, loadPhotoSprites, photoById, shownPhotos } from '../sim/photo.js';
import { YOU } from '../sim/rel.js';
import { ACT, INPUT } from './reg.js';
import { photoPic, wantSprites, LS } from './photoui.js'; // (loaded before this file by phone.ts: no module moves)
/** What the app shows (memory only): the tab, the title whose page is open, the brief being planned (its cast, set and
 *  script), the day picked to move a shoot to, the title about to be cancelled, the limits being typed. */
export const TK = { tab: 'offers', title: '', plan: 0, cast: [], set: '', script: false, day: {}, cancel: '', limits: null };
SAVE.hooks.push(() => { Object.assign(TK, { tab: 'offers', title: '', plan: 0, cast: [], set: '', script: false, day: {}, cancel: '', limits: null }); });
let MODS = null, asking = null;
/** The set's and the covers' modules, once loaded (tests await it). */
export function takeReady() {
    asking ??= Promise.all([import('../sim/onset.js'), import('../sim/covers.js')]).then(([on, cv]) => { MODS = { on, cv }; notify(); }).catch(() => { asking = null; });
    return asking;
}
const mods = () => { if (!MODS)
    void takeReady(); return MODS; };
/* ---------- small words ---------- */
const n = (x) => String(Math.round(num(x)));
const plural = (k, one, many) => (Math.round(num(k)) === 1 ? one : many.replace('{0}', n(k)));
const cash = (w, v) => esc(money(w, num(v)));
const off = (why) => (why ? `aria-disabled="true" title="${esc(why.replace(/\.$/, ''))}"` : '');
const W = (s) => `<span data-notr>${esc(s)}</span>`; // (world text: names, genres, labels, places)
const dayText = (g, d) => (d === g.day ? 'Today' : d === g.day + 1 ? 'Tomorrow' : `${weekday(d)}, day ${n(d)}`);
const listed = (names) => names.map(W).join(', ');
const bar = (v) => `<span class="mu-bond"><i style="width:${Math.max(0, Math.min(100, Math.round(num(v))))}%"></i></span>`;
const SEAT_WORDS = { perform: 'Performing', direct: 'Directing', label: 'Your label' };
const STATE_WORDS = { waiting: 'Shoot coming', shoot: 'Shoot today', edit: 'To edit', coming: 'Coming out', out: 'Out now', done: 'Finished selling', cancelled: 'Cancelled' };
const GRADE_WORDS = { great: 'Great', good: 'Good', poor: 'Poor' };
/** A text sparkline of a title's weekly sales: a block per week, scaled to its best. */
export function sparkline(list) {
    const B = '▁▂▃▄▅▆▇█', hi = Math.max(0, ...list.map(x => num(x)));
    return list.map(x => B[hi > 0 ? Math.max(0, Math.min(7, Math.round((num(x) / hi) * 7))) : 0]).join('');
}
// The action the place offers now with that id (a title's edit), if any.
const actHere = (g, w, id) => actionsHere(g, w).find(a => a.id === id);
const takeShown = (g, w) => adultOn(g) && appsShown(w).some(a => a.id === 'take');
/* ---------- a cover ---------- */
// Reads the sprite lists the covers' stars need (once a folder), then draws again with the expressions each set has:
// a star's naked set with adult content on when they have one, else their own sprites (sim/covers.ts draws them so).
const loadingSprites = new Set();
function wantCoverSprites(g, w, list) {
    const m = mods();
    if (!m)
        return;
    const who = list.flatMap(t => (t?.cast ?? []).filter(x => x !== YOU).slice(0, 2)).map(x => {
        const ex = m.on.rosterOf(w, x) ?? m.on.rosterByCard(g, w, x) ?? w.cast.examples.find(e => e.name === g.cast[x]?.name);
        return ex ? { name: ex.name, ...(adultOn(g) && typeof ex.outfits?.naked === 'string' ? { outfit: 'naked' } : {}) } : null;
    }).filter((x) => !!x);
    // (a roster performer's folders are found by name: sim/photo.ts reads the roster too)
    const folders = photoSpriteFolders(w, [{ who }]).filter(f => !loadingSprites.has(f));
    if (!folders.length)
        return;
    folders.forEach(f => loadingSprites.add(f));
    loadPhotoSprites(w, folders).then(() => notify()).catch(() => { });
}
/** A title's cover from its layers: the set's picture, up to two stars' sprites, the title, the label and the stars'
 *  names over them (words only while the layers' module loads). */
export function coverHtml(g, w, t, name, label, big = false) {
    const m = mods(), L = m && t ? m.cv.coverLayers(g, w, t) : null;
    const bg = L ? safeUrl(L.bg) : '', lay = String(L?.layout ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const sprites = (L?.sprites ?? []).map(s => { const u = safeUrl(s.url); return u ? `<img class="mu-take-spr is-${s.side === 'left' || s.side === 'right' ? s.side : 'center'}" src="${esc(u)}" alt="" loading="lazy">` : ''; }).join('');
    const stars = L?.stars ?? [];
    return `<span class="mu-take-cover ${big ? 'is-big' : ''} ${bg ? '' : 'is-blank'} ${lay ? `is-${esc(lay)}` : ''}"><span class="mu-take-in">${bg ? `<i class="mu-take-bg" style="background-image:url(&quot;${esc(bg)}&quot;)"></i>` : '<i class="mu-take-bg"></i>'}${sprites}</span>
        <span class="mu-take-words"><small data-notr>${esc(L?.label ?? label)}</small><b data-notr>${esc(L?.title ?? name)}</b>${stars.length ? `<em data-notr>${esc(stars.join(' · '))}</em>` : ''}</span></span>`;
}
/* ---------- Offers (Briefs) ---------- */
const rawOffer = (g, id) => peekIndustry(g).offers.find(o => o.id === id);
// What every title offer and brief says: the label, the genre, the title, the set, the fee and how long it's kept.
function offerTop(w, c, what) {
    return `<header class="mu-take-label"><b data-notr>${esc(c.label)}</b>${c.genre ? `<small data-notr>${esc(c.genre)}</small>` : ''}</header>
        <b class="mu-take-name" data-notr>${esc(c.name)}</b>${c.set ? `<small>${W(c.set)}</small>` : ''}
        ${c.risk ? `<small class="mu-take-risk">${esc(`A risky set: a ${n(Math.max(1, num(c.risk) * 100))}% chance of being caught at the call, and the shoot stopped`)}</small>` : ''}
        <small class="mu-take-pay">${esc(what.replace('{0}', money(w, num(c.fee))))} · ${esc(c.days <= 0 ? 'Last day to answer' : plural(c.days, 'Kept 1 more day', 'Kept {0} more days'))}</small>`;
}
function titleOffer(g, w, c) {
    const others = c.cast.filter(x => x !== 'You');
    // (every scene of your contract has you in it: it names who else)
    const scenes = c.scenes.map((s, i) => ({ s, i, co: s.with.filter(x => x !== 'You') })).map(({ s, i, co }) => `<li><span>${W(s.kind)}${co.length ? ` <small>with ${listed(co)}</small>` : ''}</span>${c.scenes.length > 1 ? `<button class="mu-ghost" data-act="tk-off" data-id="${n(c.id)}" data-i="${n(i)}">Ask for it off</button>` : ''}</li>`).join('');
    return `<article class="mu-take-offer" data-offer="${n(c.id)}">${offerTop(w, c, '{0} for the title')}
        ${others.length ? `<small>With ${listed(others)}</small>` : ''}
        <ul class="mu-take-scenes">${scenes}</ul>
        ${c.dropped.length ? `<small class="mu-muted">Left out of the contract for someone's limits: ${listed(c.dropped)}</small>` : ''}
        <span class="mu-take-btns"><button class="mu-primary" data-act="tk-take" data-id="${n(c.id)}" ${off(c.why)}>Sign the contract</button><button class="mu-ghost" data-act="tk-decline" data-id="${n(c.id)}">Turn it down</button></span>
        ${c.why ? `<small class="mu-take-why">${esc(c.why)}</small>` : ''}</article>`;
}
function planForm(g, w, c, o) {
    const choices = castChoices(g, w), chosen = new Set(TK.cast);
    const sets = setsOf(w).filter(s => setPlace(w, s)), set = sets.some(s => s.id === TK.set) ? TK.set : (sets.find(s => s.id === o.set)?.id ?? sets[0]?.id ?? '');
    const row = (x) => {
        const fixed = x.you && c.own, on = fixed || chosen.has(x.id);
        const about = x.you ? '' : [x.rank !== undefined ? `rank ${n(x.rank + 1)}` : x.tokyo ? 'from the city' : '', plural(x.titles, '1 title with you', '{0} titles with you')].filter(Boolean).join(' · ');
        return `<label class="mu-check"><input type="checkbox" data-input="tk-cast" value="${esc(x.id)}" ${on ? 'checked' : ''} ${fixed ? 'disabled' : ''}><span>${x.you ? 'You' : W(x.name)}${about ? ` <small>${esc(about)}</small>` : ''}</span></label>`;
    };
    const scripts = peekIndustry(g).scripts ?? 0;
    return `<div class="mu-take-form"><small>Who's in it</small><div class="mu-take-cast">${choices.map(row).join('')}</div>
        ${sets.length ? `<label class="mu-field"><span>The set</span><select data-input="tk-set">${sets.map(s => `<option value="${esc(s.id)}" ${s.id === set ? 'selected' : ''} data-notr>${esc(s.name)}</option>`).join('')}</select></label>` : ''}
        ${scripts > 0 ? `<label class="mu-check"><input type="checkbox" data-input="tk-script" ${TK.script ? 'checked' : ''}><span>Use a script <small>${esc(plural(scripts, '1 left', '{0} left'))}</small></span></label>` : ''}
        <span class="mu-take-btns"><button class="mu-primary" data-act="tk-plan-go" data-id="${n(c.id)}">Plan it</button><button class="mu-ghost" data-act="tk-plan-cancel">Not now</button></span></div>`;
}
function briefOffer(g, w, c) {
    const o = rawOffer(g, c.id);
    if (!o)
        return '';
    const form = TK.plan === c.id ? planForm(g, w, c, o) : `<span class="mu-take-btns"><button class="mu-primary" data-act="tk-plan" data-id="${n(c.id)}">Plan the title</button><button class="mu-ghost" data-act="tk-decline" data-id="${n(c.id)}">Turn it down</button></span>`;
    return `<article class="mu-take-offer is-brief" data-offer="${n(c.id)}">${offerTop(w, c, '{0} to direct')}
        ${c.own ? '<small>Your own title: you star in every scene.</small>' : ''}${c.star ? `<small>The label wants ${W(c.star)} in it.</small>` : ''}
        ${form}</article>`;
}
// The exclusive contract, its renewal, a fan meeting and the lens's offer: a card each, with their answers.
function specialOffer(g, w, c) {
    const o = rawOffer(g, c.id);
    if (!o)
        return '';
    const card = (cls, kind, title, lines, yes, no) => `<article class="mu-take-offer is-${cls}" data-offer="${n(c.id)}"><header class="mu-take-label"><b>${esc(kind)}</b></header>
        <b class="mu-take-name">${title}</b>${lines.map(l => `<small>${l}</small>`).join('')}
        <span class="mu-take-btns"><button class="mu-primary" data-act="tk-take" data-id="${n(c.id)}">${esc(yes)}</button>${no ? `<button class="mu-ghost" data-act="tk-decline" data-id="${n(c.id)}">${esc(no)}</button>` : ''}</span></article>`;
    const label = W(c.label);
    if (o.kind === 'exclusive') {
        const job = myJob(g, w), d = job ? (trackOf(g, job).contracts ?? []).find(x => x.id === o.contract) : undefined;
        const titles = num(d?.titles, 2), fee = num(d?.fee, 3);
        return card('contract', 'An exclusive contract', `${label} wants you exclusive`, [
            esc(`${plural(titles, '1 title', '{0} titles')} a month for that label only, each a big release: ${String(Math.round(fee * 10) / 10)} times a title's fee and more fame.`),
            esc('Renewed each season by your sales; turn it down and you stay freelance: any label, any genre.')
        ], 'Sign exclusive', 'Stay freelance');
    }
    if (o.kind === 'renewal') {
        const sold = esc(`Your titles for them sold ${money(w, num(c.amount))} this season.`);
        if (c.result === 'dropped')
            return card('contract', 'Your contract', `${label} didn't renew your exclusive`, [sold, esc('You are freelance from today: any label, any genre.')], 'All right', '');
        return card('contract', 'Your contract', c.result === 'raise' ? `${label} renews your exclusive with a raise` : `${label} renews your exclusive as it is`, [sold], 'Stay with them', 'Go freelance');
    }
    if (o.kind === 'fans')
        return card('fans', 'Your fans', esc('A fan meeting this month'), [esc(`Handshakes and cheki in Akihabara: ${money(w, num(c.amount))}.`), esc(plural(c.days, 'Kept 1 more day', 'Kept {0} more days'))], 'Hold it', 'Not this month');
    if (o.kind === 'entry') {
        const e = entriesOf(g, w).find(x => x.id === o.entry), job = industryJob(w);
        const path = job ? [job, ...Object.values(job.tracks ?? {})].flatMap(t => t?.branches ?? []).flatMap(b => b.options ?? []).find(x => x.id === e?.path) : undefined;
        const first = path?.ranks?.[0]?.name;
        const mine = g.player.job ? myJob(g, w) : null;
        return card('entry', 'Behind the camera', `${label} asks you to direct`, [
            ...(e?.name ? [W(e.name)] : []),
            ...(first ? [`Hired as ${W(first)}: you direct their titles and never perform in them.`] : [esc('You direct their titles and never perform in them.')]),
            ...(mine ? [`You would leave your job as ${W(rankOf(g, mine).name)}.`] : []),
            esc(plural(c.days, 'Kept 1 more day', 'Kept {0} more days'))
        ], 'Take it', 'Not now');
    }
    return '';
}
// The talk a partner (or someone who knows) asked for: in Take and on the HUD.
function talkLines(t) {
    const nm = W(t.name);
    const text = t.broken ? `You said you'd stop. ${nm} knows you performed again.`
        : t.partner && t.stance === 'no' ? `${nm} can't be with someone who performs, and wants to know where this is going.`
            : t.stance === 'uneasy' ? `${nm} is uneasy about your work and wants to talk it through.` : `${nm} is against your work and wants to talk it through.`;
    const keep = t.partner && t.stance === 'no' ? esc('They will end it.') : esc('Nothing changes between you.');
    return { title: `${nm} wants to talk about your work`, text, keep };
}
const talkBtns = (keep) => `<button data-act="tk-talk" data-how="keep"><span>Keep working</span><small>${keep}</small></button><button class="mu-primary" data-act="tk-talk" data-how="stop"><span>Stop performing</span></button><button data-act="tk-talk" data-how="time"><span>Give it time</span></button>`;
function talkInApp(g, w) {
    const t = talkNow(g, w);
    if (!t)
        return '';
    const x = talkLines(t);
    return `<article class="mu-take-offer is-talk"><header class="mu-take-label"><b>${esc('A talk')}</b></header><b class="mu-take-name">${x.title}</b><small>${x.text}</small><span class="mu-take-btns">${talkBtns(x.keep)}</span></article>`;
}
function limitsCard(g, w) {
    if (!inIndustry(g, w))
        return '';
    const v = peekIndustry(g).limits, text = TK.limits ?? v.join(', ');
    return `<section class="mu-take-card"><h4>Your limits</h4><small class="mu-muted">A scene that matches one is never in your contracts.</small>
        ${v.length ? `<span class="mu-take-chips">${v.map(x => `<span class="mu-take-chip" data-notr>${esc(x)}</span>`).join('')}</span>` : '<small>None yet.</small>'}
        <label class="mu-field"><span>Separated by commas</span><input type="text" data-input="tk-limits" value="${esc(text)}" maxlength="400"></label>
        <button class="mu-ghost" data-act="tk-limits-save">Save your limits</button></section>`;
}
function offersTab(g, w) {
    const v = offersView(g, w);
    const lines = [];
    if (v.perWeek)
        lines.push(esc(plural(v.perWeek, 'About 1 offer a week', 'About {0} offers a week')));
    if (v.contract)
        lines.push(`Exclusive to ${W(v.contract.label)} since day ${esc(n(v.contract.since))}`);
    else if (inIndustry(g, w) && v.seat === 'perform')
        lines.push(esc('Freelance: any label, any genre'));
    if (v.hot.length)
        lines.push(`Hot this month: ${listed(v.hot)}${v.cold ? ` · cold: ${W(v.cold)}` : ''}`);
    const head = `${v.testDue ? `<p class="mu-take-why">${esc('Your monthly test is overdue: take it at a clinic before you can sign or shoot.')}</p>` : ''}${lines.length ? `<p class="mu-take-line">${lines.map(l => `<small>${l}</small>`).join('')}</p>` : ''}`;
    const special = v.offers.filter(c => c.kind !== 'title' && c.kind !== 'brief').map(c => specialOffer(g, w, c)).join('');
    const titles = v.offers.filter(c => c.kind === 'title').map(c => titleOffer(g, w, c)).join('');
    const briefs = v.offers.filter(c => c.kind === 'brief').map(c => briefOffer(g, w, c)).join('');
    const none = !special && !titles && !briefs ? `<p class="mu-muted">${esc(inIndustry(g, w) ? 'Nothing right now: offers come on Mondays.' : 'No offers: they come once you work in the industry.')}</p>` : '';
    return `${head}${talkInApp(g, w)}${special}${titles}${briefs}${none}${limitsCard(g, w)}`;
}
/* ---------- Schedule ---------- */
function liveShoot(g, w) {
    const m = mods(), s = m?.on.shootView(g, w);
    if (!s)
        return '';
    const seat = s.seat === 'both' ? 'You direct and perform.' : s.seat === 'direct' ? 'You direct.' : s.seat === 'perform' ? 'You perform.' : s.seat === 'stills' ? 'You take the stills.' : 'You watch.';
    const played = s.scenes.filter(x => x.grade).map(x => `<li><span>${esc(`Scene ${n(x.n)}`)}: ${W(x.kind)}</span><b>${esc(GRADE_WORDS[x.grade] ?? '')}${x.q !== undefined ? ` · ${esc(n(x.q))}` : ''}</b></li>`).join('');
    const next = s.next ? `<small>${esc(`Next: scene ${n(s.next.n)}`)}, ${W(s.next.kind)}${s.next.with.length ? ` with ${listed(s.next.with)}` : ''} · ${s.next.waiting.length ? `waiting for ${listed(s.next.waiting)}` : s.next.ready > 0 ? esc(`ready in ${n(s.next.ready)} min`) : esc('ready now')}</small>` : '';
    return `<section class="mu-take-card is-live"><h4>On set now</h4><b data-notr>${esc(s.name)}</b><small>${W(s.label)} · ${W(s.genre)} · ${W(s.place)}</small><small>${esc(seat)}</small>
        ${played ? `<ul class="mu-take-list">${played}</ul>` : ''}${next}
        ${s.stopped.length ? `<small class="mu-muted">Dropped on set: ${s.stopped.map(x => `${W(x.kind)} (${W(x.who)})`).join(', ')}</small>` : ''}
        ${s.at ? '' : `<small class="mu-take-why">Go to ${W(s.place)} to shoot.</small>`}${stillsLive(g, w, s)}
        <button class="mu-ghost" data-act="tk-title" data-id="${esc(s.title)}">The title</button></section>`;
}
// The stills on set, for whoever takes them (the director, the stills seat): those taken so far as Lens draws them, then
// *Take the stills* when the place offers the set's action now, else why not (where you are, every scene shot: nothing).
function stillsLive(g, w, s) {
    const m = mods();
    if (!m || (s.seat !== 'direct' && s.seat !== 'both' && s.seat !== 'stills'))
        return '';
    const recs = s.stills.map(id => photoById(g, id)).filter((r) => !!r && (!r.adult || adultOn(g)));
    if (recs.length)
        wantSprites(w, recs);
    const act = actHere(g, w, m.on.STILLS_ID);
    const why = !act && s.at && s.stillsWhy && s.next ? `<small class="mu-muted"><i aria-hidden="true">📷</i> ${esc(s.stillsWhy)}</small>` : '';
    return `${recs.length ? `<small>${esc(plural(recs.length, '1 still taken', '{0} stills taken'))}</small><div class="mu-take-stills">${recs.map(r => stillThumb(g, w, r)).join('')}</div>` : ''}
        ${act ? `<button data-act="tk-do" data-id="${esc(act.id)}">${esc('Take the stills')}</button>` : why}`;
}
const stillThumb = (g, w, r) => `<button class="mu-take-still" data-act="tk-photo" data-id="${n(r.id)}" data-app="photos">${photoPic(g, w, r)}${r.stars ? `<em>${esc('★'.repeat(Math.max(0, Math.min(5, Math.round(num(r.stars))))))}</em>` : ''}</button>`;
function scheduleRows(g, w, list) {
    const rows = [];
    const open = (t) => `<button class="mu-take-link" data-act="tk-title" data-id="${esc(t.id)}" data-notr>${esc(t.name)}</button>`;
    for (const t of list) {
        if (t.state === 'waiting' || t.state === 'shoot') {
            // (the stills seat: the label's shoot day, not yours to move)
            const stills = holdsStills(t), days = stills ? [] : t.days.filter(d => d !== t.shoot), pick = days.includes(TK.day[t.id]) ? TK.day[t.id] : days[0];
            const move = t.state === 'waiting' && days.length ? `<span class="mu-take-btns"><select data-input="tk-day" data-id="${esc(t.id)}">${days.map(d => `<option value="${n(d)}" ${d === pick ? 'selected' : ''}>${esc(dayText(g, d))}</option>`).join('')}</select><button class="mu-ghost" data-act="tk-move" data-id="${esc(t.id)}">Move the shoot</button></span>` : '';
            const what = stills ? (t.state === 'shoot' ? 'The stills, today from 09:00' : 'The stills') : t.state === 'shoot' ? 'Shoot today from 09:00' : 'Shoot';
            rows.push({ day: t.shoot, html: `<span>${esc(what)}${t.place ? ` at ${W(t.place)}` : t.set ? ` at ${W(t.set)}` : ''}</span>${move}` });
        }
        else if (t.state === 'edit') {
            const act = actHere(g, w, `${EDIT_ID}${t.id}`);
            rows.push({ day: t.shoot + TITLES.editDays, html: `<span>${esc('Edit it by this day, or the label\'s editor will')}</span>${act ? `<button data-act="tk-do" data-id="${esc(act.id)}">${esc('Edit it now')}</button>` : `<small class="mu-muted">${esc('Edit it at home or at the set.')}</small>`}` });
        }
        else if (t.state === 'coming')
            rows.push({ day: t.release, html: `<span>${esc('Out in the shops')}</span>` });
        if (rows.length)
            rows[rows.length - 1].html = `${open(t)}${rows[rows.length - 1].html}`;
    }
    return rows;
}
function scheduleTab(g, w) {
    const v = titlesView(g, w), rows = scheduleRows(g, w, v.titles.filter(t => ['waiting', 'shoot', 'edit', 'coming'].includes(t.state)));
    if (inIndustry(g, w))
        rows.push({ day: testNext(g), html: `<span>${esc('The monthly test, at a clinic')}</span>` });
    rows.sort((a, b) => a.day - b.day);
    const list = rows.length ? `<ul class="mu-take-sched">${rows.map(r => `<li><small class="mu-take-day ${r.day < g.day ? 'is-late' : ''}">${esc(r.day < g.day ? `Day ${n(r.day)}: late` : dayText(g, r.day))}</small><div>${r.html}</div></li>`).join('')}</ul>` : '';
    return `${liveShoot(g, w)}${list || `<p class="mu-muted">${esc('Nothing booked. Sign a contract to set a shoot.')}</p>`}`;
}
/* ---------- Titles ---------- */
const rawTitle = (g, id) => peekIndustry(g).titles.find(t => t.id === id);
function titleThumb(g, w, t) {
    return `<button class="mu-take-thumb is-${esc(t.state)}" data-act="tk-title" data-id="${esc(t.id)}">${coverHtml(g, w, rawTitle(g, t.id), t.name, t.label)}
        <small>${esc(STATE_WORDS[t.state])}${t.q !== undefined ? ` · ${esc(`quality ${n(t.q)}`)}` : ''}</small></button>`;
}
/** A scene's roll as Lens's: "roll 17 vs 13 → quality 70", then each part by name. */
function rollHtml(sc) {
    if (!sc.grade)
        return '';
    const parts = sc.parts ?? [], total = parts.reduce((a, p) => a + num(p.add), 0), sign = (k) => (k > 0 ? `+${n(k)}` : n(k));
    const roll = sc.dc !== undefined && parts.length ? `${esc(`Roll ${n(total)} vs ${n(sc.dc)}`)} → ` : '';
    return `<div class="mu-take-roll"><small>${roll}${esc(`${GRADE_WORDS[sc.grade] ?? ''}, quality ${n(sc.q)}`)}</small>${parts.length ? `<ul>${parts.map(p => `<li><span data-notr>${esc(p.name)}</span><b>${esc(sign(num(p.add)))}</b></li>`).join('')}</ul>` : ''}</div>`;
}
function scenesHtml(g, w, t) {
    const raw = rawTitle(g, t.id), m = mods();
    const list = raw && m ? m.on.scenesView(g, w, raw) : t.scenes.map((s, i) => ({ n: i + 1, ...s }));
    if (!list.length)
        return '';
    return `<h4 class="mu-take-sub">Scenes</h4>${list.map(sc => {
        const pic = sc.pic ? worldFile(w, sc.pic) : '';
        return `<section class="mu-take-scene">${pic ? `<img class="mu-take-pic" src="${esc(pic)}" alt="" loading="lazy">` : ''}<b>${esc(`Scene ${n(sc.n)}`)}: ${W(sc.kind)}</b>${sc.with.length ? `<small>With ${listed(sc.with)}</small>` : ''}${rollHtml(sc)}</section>`;
    }).join('')}`;
}
function salesHtml(g, w, t) {
    if (t.cancelled || !t.weeks && !t.sold)
        return '';
    const hist = (rawTitle(g, t.id)?.hist ?? []).map(x => num(x));
    const weeks = hist.map((x, i) => `<li><span>${esc(`Week ${n(i + 1)}`)}</span><b>${cash(w, x)}</b></li>`).join('');
    return `<section class="mu-take-card"><h4>Title sales</h4><b class="mu-take-big-n">${cash(w, t.sold)}</b><small>${esc(`${plural(t.weeks, '1 week', '{0} weeks')} of ${plural(salesWeeks(g, w), '1', '{0}')} · last week ${money(w, num(t.lastWeek))}`)}</small>
        ${hist.length ? `<span class="mu-take-spark" aria-label="${esc('Sales week by week')}">${esc(sparkline(hist))}</span><ul class="mu-take-list">${weeks}</ul>` : ''}</section>`;
}
function chartHtml(t) {
    if (t.state !== 'out' && t.state !== 'done' && !t.charts)
        return '';
    return `<small>${esc(t.charts ? `${plural(t.charts, '1 week', '{0} weeks')} in the top 10 · best place ${n(t.peak)}` : 'Not in the top 10 yet')}</small>`;
}
// A title's stills (the photos taken on its set, still in Lens), its cover first when it's one of them, with the still's
// stars and what the cover adds to the first week's sales (sim/titles.ts's `coverBonus`).
function stillsHtml(g, w, raw) {
    if (!raw)
        return '';
    const cover = raw.cover === undefined ? undefined : photoById(g, raw.cover);
    const recs = shownPhotos(g).filter(r => r.src === 'set' && r.title === raw.id).sort((a, b) => (a.id === cover?.id ? -1 : b.id === cover?.id ? 1 : (b.q ?? 0) - (a.q ?? 0)));
    if (!recs.length)
        return '';
    wantSprites(w, recs);
    const bonus = cover && cover.src === 'set' && !cover.undeveloped && recs.includes(cover) ? coverBonus(g, raw) : 0;
    const pct = String(Math.round((bonus - 1) * 1000) / 10);
    const stars = '★'.repeat(Math.max(1, Math.min(5, Math.round(num(cover?.stars ?? 1)))));
    const said = pct === '0' ? `The cover is a still (${stars}): one star adds nothing to its first week.`
        : raw.weeks > 0 ? `The cover is a still (${stars}): its first week sold ${pct}% more for it.` : `The cover is a still (${stars}): its first week sells ${pct}% more for it.`;
    const coverLine = bonus ? `<small class="mu-good">${esc(said)}</small>` : '';
    return `<h4 class="mu-take-sub">${esc('Stills')}</h4>${coverLine}<small>${esc(plural(recs.length, '1 still from the set, in Lens', '{0} stills from the set, in Lens'))}</small>
        <div class="mu-take-stills">${recs.map(r => `${stillThumb(g, w, r)}`).join('')}</div>`;
}
function titlePage(g, w, t) {
    const raw = rawTitle(g, t.id);
    wantCoverSprites(g, w, [raw]);
    const seats = t.you.map(s => (s === 'perform' ? 'You perform' : s === 'direct' ? 'You direct' : s === 'stills' ? 'You take the stills' : 'Your label')).join(' · ');
    const cast = t.cast.filter(x => x !== 'You');
    const facts = [`${W(t.label)}${t.genre ? ` · ${W(t.genre)}` : ''}${t.set ? ` · ${W(t.set)}` : ''}${t.place ? ` · ${W(t.place)}` : ''}`, esc(seats), cast.length ? `With ${listed(cast)}` : '',
        esc(`Signed on day ${n(t.contract)}${t.shoot ? ` · shot on day ${n(t.shoot)}` : ''}${t.release ? ` · ${t.release <= g.day ? 'out since' : 'out on'} day ${n(t.release)}` : ''}`),
        t.fee ? esc(`Your fee ${money(w, num(t.fee))}`) : '', t.q !== undefined ? esc(`Quality ${n(t.q)}${t.cut ? ` (the edit added ${n(t.cut)})` : ''}`) : ''].filter(Boolean);
    const cancel = !t.canCancel ? '' : TK.cancel === t.id
        ? `<span class="mu-take-btns"><small>${esc('Cancel it? It is never sold again.')}</small><button class="mu-danger" data-act="tk-cancel-go" data-id="${esc(t.id)}">Cancel the title</button><button class="mu-ghost" data-act="tk-cancel-no">Keep it</button></span>`
        : `<button class="mu-ghost mu-take-cancel" data-act="tk-cancel" data-id="${esc(t.id)}">Cancel this title…</button>`;
    const m = mods(), missing = raw && m ? m.cv.coverLayers(g, w, raw).missing : [];
    return `<section class="mu-take-page"><button class="mu-take-close" data-act="tk-title-close"><i aria-hidden="true">‹</i> <span>${esc('Titles')}</span></button>
        ${coverHtml(g, w, raw, t.name, t.label, true)}${missing.map(x => `<small class="mu-muted" data-notr>${esc(x)}</small>`).join('')}
        <b class="mu-take-name" data-notr>${esc(t.name)}</b><small class="mu-take-state">${esc(STATE_WORDS[t.state])}</small>
        ${facts.map(f => `<small>${f}</small>`).join('')}${chartHtml(t)}
        ${salesHtml(g, w, t)}${stillsHtml(g, w, raw)}${scenesHtml(g, w, t)}${cancel}</section>`;
}
function titlesTab(g, w) {
    const v = titlesView(g, w), open = TK.title ? v.titles.find(t => t.id === TK.title) : undefined;
    if (open)
        return titlePage(g, w, open);
    const head = `<p class="mu-take-line"><small>${esc(`${plural(v.made, '1 title made', '{0} titles made')} · ${money(w, num(v.sold))} sold`)}</small>${v.totals.best ? `<small>${esc('Best seller of the older ones:')} ${W(v.totals.best)}</small>` : ''}</p>`;
    // yours first; the label's commissioned titles (shot without you) under their own heading
    // (the titles you took the stills on, for a label's art department: their own heading)
    const mine = v.titles.filter(t => !isCommissioned(t)), stills = v.titles.filter(t => holdsStills(t)), label = v.titles.filter(t => isCommissioned(t) && !holdsStills(t));
    if (!v.titles.length)
        return `${head}<p class="mu-muted">${esc('No titles yet.')}</p>`;
    wantCoverSprites(g, w, v.titles.map(t => rawTitle(g, t.id)));
    const grid = (list) => `<div class="mu-take-grid">${list.map(t => titleThumb(g, w, t)).join('')}</div>`;
    return `${head}${mine.length ? grid(mine) : stills.length ? '' : `<p class="mu-muted">${esc('No titles yet.')}</p>`}
        ${stills.length ? `<h4 class="mu-take-sub">${esc('Your stills')}</h4><p class="mu-take-line"><small>${esc(plural(stills.length, '1 title you took the stills on', '{0} titles you took the stills on'))}</small></p>${grid(stills)}` : ''}
        ${label.length ? `<h4 class="mu-take-sub">${esc('Made for your label')}</h4><p class="mu-take-line"><small>${esc(plural(label.length, '1 title your label commissioned, shot without you', '{0} titles your label commissioned, shot without you'))}</small></p>${grid(label)}` : ''}`;
}
/* ---------- Chart ---------- */
function chartTab(g, w) {
    const v = chartView(g, w);
    const trend = `${v.line ? `<p class="mu-take-news" data-notr>${esc(v.line)}</p>` : ''}${v.hot.length ? `<p class="mu-take-line"><small>Hot this month: ${listed(v.hot)}</small>${v.cold ? `<small>Cold: ${W(v.cold)}</small>` : ''}</p>` : ''}`;
    if (!v.rows.length)
        return `${trend}<p class="mu-muted">${esc('The chart comes out on Mondays.')}</p>`;
    const row = (r) => `<li class="${r.by === 'label' ? 'is-label' : r.mine ? 'is-mine' : ''}"><b class="mu-take-pos">${esc(n(r.pos))}</b><span>${r.mine ? `<button class="mu-take-link" data-act="tk-title" data-id="${esc(r.mine)}" data-notr>${esc(r.name)}</button>` : `<b data-notr>${esc(r.name)}</b>`}<small data-notr>${esc(r.label)}</small></span><small>${cash(w, r.sales)}</small>${r.mine ? `<em>${esc(r.by === 'label' ? "Your label's" : 'Yours')}</em>` : ''}</li>`;
    return `<h4 class="mu-take-sub">${esc(`Week ${n(v.week + 1)}`)}</h4><ol class="mu-take-chart">${v.rows.map(row).join('')}</ol>${trend}`;
}
/* ---------- Roster ---------- */
function rosterTab(g, w) {
    const v = rosterView(g, w);
    const pic = (p) => { const u = p.avatar ? worldFile(w, p.avatar) : ''; return u ? `<img class="mu-take-face" src="${esc(u)}" alt="" loading="lazy">` : '<span class="mu-take-face is-blank" aria-hidden="true">🎬</span>'; };
    const people = v.people.map(p => `<li class="mu-take-person">${pic(p)}<span><b data-notr>${esc(p.name)}</b><small>${esc(`Rank ${n(p.rank + 1)} of 5`)}${p.genres.length ? ` · ${listed(p.genres)}` : ''}</small>
        <small>${esc(p.titles ? `${plural(p.titles, '1 title with you', '{0} titles with you')}${p.last ? `, the last on day ${n(p.last)}` : ''}` : 'No titles with you yet')}</small>${bar(p.fame)}</span></li>`).join('');
    const city = v.tokyo.map(p => `<li class="mu-take-person"><button class="mu-take-link" data-act="ph-person" data-who="${esc(p.avatar)}" data-notr>${esc(p.name)}</button><small>${esc(plural(p.titles, '1 title with you', '{0} titles with you'))}</small></li>`).join('');
    if (!people && !city)
        return `<p class="mu-muted">${esc('Nobody yet: the performers you work with show here.')}</p>`;
    return `${people ? `<h4 class="mu-take-sub">Performers</h4><ul class="mu-take-people">${people}</ul>` : ''}${city ? `<h4 class="mu-take-sub">From the city</h4><ul class="mu-take-people">${city}</ul>` : ''}`;
}
/* ---------- Label ---------- */
const myLabels = (g, w) => venturesOf(g).filter(s => { const d = ventureDef(w, s.id); return !!d && (d.kind ?? d.track) === 'label'; });
function labelTab(g, w) {
    const v = titlesView(g, w), month = monthOf(g), mine = v.titles.filter(t => t.you.includes('label'));
    const now = mine.filter(t => monthOf(g, t.contract) === month), last = mine.reduce((a, t) => a + num(t.lastWeek), 0);
    wantCoverSprites(g, w, now.map(t => rawTitle(g, t.id)));
    const cards = myLabels(g, w).map(s => {
        const d = ventureDef(w, s.id);
        return `<section class="mu-take-card"><h4 data-notr>${esc(ventureName(w, s))}</h4><small data-notr>${esc(tierOf(d, s.tier)?.name ?? '')}</small>
        <small>${esc(`${plural(now.length, '1 title this month', '{0} titles this month')} · ${plural(mine.length, '1 title in all', '{0} titles in all')} · last week ${money(w, last)}`)}</small>
        <button class="mu-ghost" data-act="ph-go" data-app="business">The report in Business</button></section>`;
    }).join('');
    return `${cards}${now.length ? `<h4 class="mu-take-sub">This month</h4><div class="mu-take-grid">${now.map(t => titleThumb(g, w, t)).join('')}</div>` : ''}`;
}
/* ---------- the app ---------- */
/** Something new in Take: an offer you haven't seen, or a title of yours released since you last looked (not one the
 *  label commissioned: those come out every few days, and its weekly report tells of them). */
export function takeBadge(g, w) {
    if (!industryOn(g, w) || !g.industry)
        return false;
    const st = peekIndustry(g), looked = num(st.looked, -1);
    return st.offers.some(o => !o.seen) || st.titles.some(t => t.out && !t.cancelled && !isCommissioned(t) && num(t.release) > looked);
}
/** Opening Take: what it shows is seen (the badge goes). Written only into a save that has the industry's record. */
export function seeTake(g, w) {
    const st = g.industry;
    if (!industryOn(g, w) || !st)
        return false;
    for (const o of st.offers ?? [])
        o.seen = true;
    st.looked = g.day;
    return true;
}
const TABS = [['offers', 'Offers'], ['schedule', 'Schedule'], ['titles', 'Titles'], ['chart', 'Chart'], ['roster', 'Roster'], ['label', 'Label']];
const tabsOf = (g, w) => TABS.filter(([id]) => id !== 'label' || myLabels(g, w).length > 0).map(([id, name]) => [id, id === 'offers' && offersView(g, w).seat === 'direct' ? 'Briefs' : name]);
function counts(g, w) {
    const t = titlesView(g, w).titles, c = chartView(g, w).rows, r = rosterView(g, w);
    const sched = t.filter(x => ['waiting', 'shoot', 'edit', 'coming'].includes(x.state)).length;
    return { offers: n(offersView(g, w).offers.length), schedule: n(sched), titles: n(t.filter(x => !isCommissioned(x)).length), chart: n(c.filter(x => x.by === 'you').length), roster: n(r.people.filter(p => p.titles > 0).length + r.tokyo.length), label: n(myLabels(g, w).length) };
}
// Your seats: each with its rank and fame; the fans, the contract and the test under them.
function seatsCard(g, w) {
    const seats = seatsNow(g, w);
    const rows = seats.map(s => `<div class="mu-take-seat"><span><b>${esc(SEAT_WORDS[s])}</b>${s !== 'label' && rankWords(g, w) ? `<small data-notr>${esc(rankWords(g, w))}</small>` : ''}</span><small>${esc(`Fame ${n(fameOf(g, s))}`)}</small>${bar(fameOf(g, s))}</div>`).join('');
    const fans = fanBase(g), c = peekIndustry(g).seats.perform?.contract;
    const more = [fans ? esc(plural(fans, '1 fan', '{0} fans')) : '', seats.includes('perform') ? (c ? `Exclusive to ${W(labelOf(w, c.label)?.name ?? c.label)}` : esc('Freelance')) : '',
        inIndustry(g, w) ? esc(`Monthly test: ${testNext(g) <= g.day ? 'due now' : `day ${n(testNext(g))}`}`) : ''].filter(Boolean);
    return `<section class="mu-take-card">${rows || `<small class="mu-muted">${esc('You don\'t work in the industry.')}</small>`}${more.map(x => `<small>${x}</small>`).join('')}</section>`;
}
function bodyOf(g, w, tab) {
    return tab === 'schedule' ? scheduleTab(g, w) : tab === 'titles' ? titlesTab(g, w) : tab === 'chart' ? chartTab(g, w) : tab === 'roster' ? rosterTab(g, w) : tab === 'label' ? labelTab(g, w) : offersTab(g, w);
}
/** The Take app: the tabs and the one open (nothing with the industry off); `wide`: the unfolded phone (your seats and
 *  the tabs with their counts on the left, the open tab on the right). */
export function takeApp(g, w, head, wide = false) {
    if (!industryOn(g, w))
        return `${head}<div class="mu-ph-body mu-take"><p class="mu-muted">${esc('No adult industry in this game.')}</p></div>`;
    const tabs = tabsOf(g, w), tab = tabs.some(t => t[0] === TK.tab) ? TK.tab : 'offers', count = counts(g, w), body = bodyOf(g, w, tab);
    const fresh = takeBadge(g, w) && peekIndustry(g).offers.some(o => !o.seen);
    if (wide) {
        const rows = tabs.map(([id, name]) => `<button class="mu-take-row-tab ${id === tab ? 'is-on' : ''}" data-act="tk-tab" data-v="${id}" aria-pressed="${id === tab}"><b>${esc(name)}</b>${id === 'offers' && fresh ? '<em class="mu-sec-badge">!</em>' : '<span></span>'}<small>${esc(count[id])}</small></button>`).join('');
        return `${head}<div class="mu-ph-split mu-take-split"><div class="mu-ph-pane is-list" data-keep="take-pane-list"><div class="mu-ph-body mu-take">${seatsCard(g, w)}<nav class="mu-take-rows">${rows}</nav></div></div>
            <div class="mu-ph-pane is-open" data-keep="take-pane-${tab}${TK.title ? `-${esc(TK.title)}` : ''}"><div class="mu-ph-body mu-take"><div class="mu-take-body">${body}</div></div></div></div>`;
    }
    return `${head}<div class="mu-ph-body mu-take">${seatsCard(g, w)}
        <nav class="mu-take-tabs" data-keep="take-tabs">${tabs.map(([id, name]) => `<button class="${id === tab ? 'is-on' : ''}" data-act="tk-tab" data-v="${id}" aria-pressed="${id === tab}">${esc(name)}${count[id] !== '0' && id !== 'label' ? ` <em>${esc(count[id])}</em>` : ''}</button>`).join('')}</nav>
        <div class="mu-take-body">${body}</div></div>`;
}
/** What Back closes inside Take first: a title's page. */
export function takeBack() { if (TK.title) {
    TK.title = '';
    TK.cancel = '';
    return true;
} return false; }
/** The month's trend for Messages' top, while you work in the industry ('' otherwise). */
export function takeNewsHtml(g, w) {
    if (!inIndustry(g, w))
        return '';
    const line = chartView(g, w).line;
    return line && takeShown(g, w) ? `<button class="mu-take-strip" data-act="ph-go" data-app="take"><span aria-hidden="true">🎬</span><span data-notr>${esc(line)}</span></button>` : '';
}
/* ---------- the HUD's cards: a fan, the talk ---------- */
const FAN_WORDS = { perform: 'A fan recognizes you from your videos.', direct: 'A fan recognizes you as a director.', label: 'A fan recognizes you as the head of a label.' };
/** A fan who recognized you here (three hours at most), or the talk someone asked for: a card that waits for an answer. */
export function takeAskHtml(g, w) {
    if (state.view !== 'scene' || !industryOn(g, w))
        return '';
    const f = fanNow(g, w);
    if (f)
        return `<div class="mh-invite mh-happen mh-story mh-glass mh-take" role="dialog" aria-label="${esc('A fan')}"><span class="mh-story-ic" aria-hidden="true">🎬</span>
        <div><b>${esc(FAN_WORDS[f.seat] ?? FAN_WORDS.perform)}</b><p>${esc('They ask, a little shy, for a photo together or a signature.')}</p></div>
        <div class="mh-invite-btns"><button class="mu-primary" data-act="tk-fan" data-how="photo"><span>A photo</span></button><button data-act="tk-fan" data-how="sign"><span>A signature</span></button><button class="mu-ghost" data-act="tk-fan" data-how="walk"><span>Walk away</span></button></div></div>`;
    const t = talkNow(g, w);
    if (!t)
        return '';
    const x = talkLines(t);
    return `<div class="mh-invite mh-happen mh-story mh-glass mh-take" role="dialog" aria-label="${esc('A talk')}"><span class="mh-story-ic" aria-hidden="true">🎬</span>
        <div><b>${x.title}</b><p>${x.text}</p></div><div class="mh-invite-btns">${talkBtns(x.keep)}</div></div>`;
}
/* ---------- the buttons ---------- */
const ctxW = () => { const g = game(); const w = g && getWorld(g.world); return g && w && industryOn(g, w) ? { g, w } : null; };
const done = () => { saveGame(); refreshPrompt(); notify(); };
const say = (lines, kind = 'info') => { for (const l of lines.filter(Boolean))
    toast(l, kind); };
Object.assign(ACT, {
    'tk-tab': (el) => { TK.tab = (TABS.find(t => t[0] === el.dataset.v)?.[0] ?? 'offers'); TK.title = ''; TK.cancel = ''; TK.plan = 0; notify(); },
    'tk-title': (el) => { TK.title = el.dataset.id ?? ''; TK.cancel = ''; TK.tab = 'titles'; notify(); },
    'tk-title-close': () => { TK.title = ''; TK.cancel = ''; notify(); },
    // (a still: Lens opens it large, through the phone's handler)
    'tk-photo': (el, e) => { const x = ctxW(); const id = Number(el.dataset.id) || 0; if (!x || !photoById(x.g, id))
        return; LS.tab = 'photos'; LS.photo = id; return ACT['ph-go']?.(el, e); },
    'tk-take': (el) => {
        const x = ctxW();
        if (!x)
            return;
        const r = takeOffer(x.g, x.w, Number(el.dataset.id));
        say([r.text], r.ok ? 'success' : 'info');
        if (r.ok)
            done();
        else
            notify();
    },
    'tk-decline': (el) => { const x = ctxW(); if (!x)
        return; say([declineOffer(x.g, x.w, Number(el.dataset.id))]); if (TK.plan === Number(el.dataset.id))
        TK.plan = 0; done(); },
    'tk-off': (el) => { const x = ctxW(); if (!x)
        return; const r = askSceneOff(x.g, x.w, Number(el.dataset.id), Number(el.dataset.i)); say([r.text]); if (r.ok)
        done(); },
    'tk-plan': (el) => {
        const x = ctxW();
        if (!x)
            return;
        const o = rawOffer(x.g, Number(el.dataset.id));
        TK.plan = o?.id ?? 0;
        TK.set = o?.set ?? '';
        TK.script = false;
        TK.cast = o?.star ? [`roster:${o.star}`] : [];
        notify();
    },
    'tk-plan-cancel': () => { TK.plan = 0; notify(); },
    'tk-plan-go': (el) => {
        const x = ctxW();
        if (!x)
            return;
        const r = planBrief(x.g, x.w, Number(el.dataset.id), { cast: [...TK.cast], ...(TK.set ? { set: TK.set } : {}), script: TK.script });
        say([r.text], r.ok ? 'success' : 'info');
        if (!r.ok)
            return;
        TK.plan = 0;
        done();
    },
    'tk-move': (el) => {
        const x = ctxW();
        if (!x)
            return;
        const id = el.dataset.id ?? '', t = titlesView(x.g, x.w).titles.find(k => k.id === id);
        if (!t)
            return;
        const days = t.days.filter(d => d !== t.shoot), day = days.includes(TK.day[id]) ? TK.day[id] : days[0];
        if (day === undefined)
            return;
        const r = setShootDay(x.g, x.w, id, day);
        say([r.text], r.ok ? 'success' : 'info');
        if (r.ok)
            done();
    },
    'tk-cancel': (el) => { TK.cancel = el.dataset.id ?? ''; notify(); },
    'tk-cancel-no': () => { TK.cancel = ''; notify(); },
    'tk-cancel-go': (el) => { const x = ctxW(); if (!x)
        return; const r = cancelTitle(x.g, x.w, el.dataset.id ?? ''); TK.cancel = ''; say([r.text], r.ok ? 'success' : 'info'); done(); },
    'tk-limits-save': () => { const x = ctxW(); if (!x || TK.limits === null)
        return; setLimits(x.g, TK.limits.split(',')); TK.limits = null; toast('Your limits are saved.', 'success'); done(); },
    // (the place's own action: the edit takes its time like any action, through the scene's handler)
    'tk-do': (el, e) => { const x = ctxW(); if (!x || !actHere(x.g, x.w, el.dataset.id ?? ''))
        return; return ACT.do?.(el, e); },
    'tk-fan': (el) => { const x = ctxW(); if (!x)
        return; const how = el.dataset.how; if (how !== 'photo' && how !== 'sign' && how !== 'walk')
        return; say(answerFan(x.g, x.w, how)); done(); },
    'tk-talk': (el) => { const x = ctxW(); if (!x)
        return; const how = el.dataset.how; if (how !== 'keep' && how !== 'stop' && how !== 'time')
        return; say(answerTalk(x.g, x.w, how)); done(); },
});
Object.assign(INPUT, {
    'tk-cast': (el) => { const id = el.value; TK.cast = el.checked ? [...new Set([...TK.cast, id])] : TK.cast.filter(x => x !== id); },
    'tk-set': (el) => { TK.set = el.value; },
    'tk-script': (el) => { TK.script = !!el.checked; },
    'tk-day': (el) => { const id = el.dataset.id; if (id)
        TK.day[id] = Number(el.value) || 0; },
    'tk-limits': (el) => { TK.limits = el.value; },
});
