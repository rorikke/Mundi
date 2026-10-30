// Home: "Go out". Where you go (in your words), who comes with you (whoever is in the house), and a background from
// SillyTavern's; the scene out there is a free one, like a chat. "Back home" asks first, then brings you back.
import { state, notify, esc, game, saveGame, toast, nowAbs } from '../core/store.js';
import { safeUrl } from '../core/safe.js';
import { advance, hm } from '../sim/time.js';
import { runPlans } from './plans.js';
const OUTING_MIN = 240;   // the shortest time out, in game minutes
import { getWorld, isScenario, styleOf } from '../core/world.js';
import { thumb, charOf } from '../st/bridge.js';
import { arrive, guestOf, guestsNow, sendHome } from '../sim/guests.js';
import { bgHead, bgGrid, bgHref } from './bgpick.js';
import { outingName, isOuting } from '../sim/places.js';
import { startOuting, endOuting, outingOf, outingBgs } from '../sim/outing.js';
import { syncScene } from '../sim/game.js';
import { refreshPrompt } from '../sim/prompt.js';
import { showTransition } from './lifeui.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

// lib: people from your library (not in the house) who come out with you (they go home when you come back)
export const OD = { move: false, open: false, bgOnly: false, place: '', with: [] as string[], lib: [] as string[], bg: '', q: '', back: false, miss: false };
export const bgStyle = (file: string) => (file ? `background-image:url('${safeUrl(bgHref(file))}');background-size:cover;background-position:center` : '');

// Who can come: anyone of the house (and its guests), wherever they are now (out at work, they meet you there).
function canCome(): { avatar: string; name: string }[] {
    const g = game(); const w = g && getWorld(g.world); if (!g || !w) return [];
    return Object.values(g.cast).filter(r => guestOf(g, r.avatar)?.kind !== 'outing').sort((a, b) => Number(b.met) - Number(a.met) || a.name.localeCompare(b.name)).map(r => ({ avatar: r.avatar, name: r.name }));
}

export function outingHtml(): string {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || !isScenario(w)) return '';
    if (OD.back) return `<div class="mu-dlg-veil" data-act="out-back-no"></div><div class="mu-panel mu-dlg mu-glassdlg mu-outback" role="dialog"><h3>Go back home?</h3>
        <p class="mu-muted">${(outingOf(g)?.with ?? []).length ? `${esc((outingOf(g)!.with).map(a => g.cast[a]?.name).filter(Boolean).join(', '))} ${outingOf(g)!.with.length === 1 ? 'comes' : 'come'} back with you.` : 'You head back to the house.'} <span>Some hours go by while you are out (4 at least).</span></p>
        <div class="mu-row mu-dlg-btns"><button data-act="out-back-no">Stay out</button><button class="mu-primary" data-act="out-back-yes">${icon('home')}<span>Back home</span></button></div></div>`;
    if (!OD.open) return '';
    const people = canCome();
    const grid = `${bgHead('out-bgq', 'outbgq', OD.q)}${bgGrid({ act: 'out-bg', q: OD.q, keep: 'outbg', sel: OD.bg, none: `<span class="mu-out-nobg">${icon('x')}</span>`, extra: 'mu-out-bgs' })}`;
    if (OD.bgOnly) return `<div class="mu-dlg-veil" data-act="out-close"></div><div class="mu-panel mu-scpick mu-glassdlg mu-outdlg" role="dialog"><header><h3>Background</h3><button class="mu-ibtn mu-ghost" data-act="out-close" aria-label="Close">${icon('x')}</button></header>${grid}
        <div class="mu-row mu-dlg-btns"><button data-act="out-close">Cancel</button><button class="mu-primary" data-act="out-bg-save">Use it</button></div></div>`;
    if (OD.move) {   // out already: on to another place (the cinema, then the mall, then a restaurant…), the same company
        const withYou = (outingOf(g)?.with ?? []).map(a => g.cast[a]?.name).filter(Boolean) as string[];
        return `<div class="mu-dlg-veil" data-act="out-close"></div><div class="mu-panel mu-scpick mu-glassdlg mu-outdlg" role="dialog"><header><h3>${icon('map')} Go somewhere else</h3><button class="mu-ibtn mu-ghost" data-act="out-close" aria-label="Close">${icon('x')}</button></header>
        <label class="mu-field mu-out-place ${OD.miss ? 'is-missing' : ''}"><span>Where to now?</span><input type="text" maxlength="80" data-input="out-place" data-focus="outplace" placeholder="${styleOf(w) === 'medieval' ? 'the inn, the old bridge…' : 'the mall, a restaurant, the park…'}" value="${esc(OD.place)}">${OD.miss ? '<small class="mu-miss-note">Write where you are going first.</small>' : ''}</label>
        ${withYou.length ? `<p class="mu-muted">${esc(withYou.join(', '))} ${withYou.length === 1 ? 'comes' : 'come'} along.</p>` : ''}
        <div class="mu-field"><span>Background</span>${grid}</div>
        <div class="mu-row mu-dlg-btns"><button data-act="out-close">Cancel</button><button class="mu-primary ${OD.place.trim() ? '' : 'is-dim'}" data-act="out-go">${icon('map')}<span>Go</span></button></div></div>`;
    }
    return `<div class="mu-dlg-veil" data-act="out-close"></div><div class="mu-panel mu-scpick mu-glassdlg mu-outdlg" role="dialog"><header><h3>${icon('map')} Go out</h3><button class="mu-ibtn mu-ghost" data-act="out-close" aria-label="Close">${icon('x')}</button></header>
        <label class="mu-field mu-out-place ${OD.miss ? 'is-missing' : ''}"><span>Where are you going?</span><input type="text" maxlength="80" data-input="out-place" data-focus="outplace" placeholder="${styleOf(w) === 'medieval' ? 'the market square, the village tavern, the riverbank…' : 'the beach, a café downtown, the cinema…'}" value="${esc(OD.place)}">${OD.miss ? '<small class="mu-miss-note">Write where you are going first.</small>' : ''}</label>
        <div class="mu-field"><span>Who comes with you</span><div class="mu-out-people">${people.map(p => `<button class="mu-chip ${OD.with.includes(p.avatar) ? 'is-on' : ''}" data-act="out-with" data-who="${esc(p.avatar)}"><img src="${esc(thumb(p.avatar))}" alt=""><span data-notr>${esc(p.name)}</span></button>`).join('')}${OD.lib.map(a => `<button class="mu-chip is-on mu-out-lib" data-act="out-lib-del" data-who="${esc(a)}" title="Remove"><img src="${esc(thumb(a))}" alt=""><span data-notr>${esc(String(charOf(a)?.name ?? a))}</span>${icon('x')}</button>`).join('')}<button class="mu-chip mu-out-libbtn" data-act="gp-open" data-for="outing">${icon('plus')}<span>From your library</span></button></div></div>
        <div class="mu-field"><span>Background</span>${grid}</div>
        <div class="mu-row mu-dlg-btns"><button data-act="out-close">Cancel</button><button class="mu-primary ${OD.place.trim() ? '' : 'is-dim'}" data-act="out-go">${icon('map')}<span>Go</span></button></div></div>`;
}

// Opens the dialog; `place` fills in where (a plan made somewhere out).
export function openGoOut(place = '') { Object.assign(OD, { open: true, bgOnly: false, move: false, place, with: [], lib: [], q: '', back: false, miss: false }); const g = game(); OD.bg = (place && g && outingBgs(g)[place]) || ''; notify(); setTimeout(() => document.querySelector<HTMLInputElement>('[data-input="out-place"]')?.focus(), 40); }

Object.assign(ACT, {
    'out-open': () => openGoOut(),
    'out-move': () => { if (state.generating) { toast('Wait until they finish speaking.', 'info'); return; } Object.assign(OD, { open: true, bgOnly: false, move: true, place: '', with: [], lib: [], q: '', back: false, miss: false, bg: '' }); notify(); setTimeout(() => document.querySelector<HTMLInputElement>('[data-input="out-place"]')?.focus(), 40); },
    'out-close': () => { OD.open = false; notify(); },
    'out-lib-del': (el) => { OD.lib = OD.lib.filter(a => a !== el.dataset.who); notify(); },
    'out-with': (el) => { const a = el.dataset.who!; OD.with = OD.with.includes(a) ? OD.with.filter(x => x !== a) : [...OD.with, a]; notify(); },
    'out-bg': (el) => { OD.bg = el.dataset.file ?? ''; notify(); },
    'out-bg-open': () => { const g = game(); Object.assign(OD, { open: true, bgOnly: true, q: '', bg: outingOf(g)?.bg ?? '' }); notify(); },
    'out-bg-save': () => { const g = game(); const o = outingOf(g); if (o) { o.bg = OD.bg; saveGame(); } OD.open = false; notify(); },
    'out-go': async () => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const place = OD.place.trim();
        if (!place) { OD.miss = true; toast('Write where you are going first.', 'warn'); notify(); setTimeout(() => document.querySelector<HTMLInputElement>('[data-input="out-place"]')?.focus(), 30); return; }
        if (state.generating) { toast('Wait until they finish speaking.', 'info'); return; }
        // the conversation goes on out there (and back home): nothing is hidden from the AI
        // people from your library come along as guests of this outing (they go home when you come back)
        const lib = OD.lib.map(a => arrive(g, w, a, 'outing', { kind: 'sofa' })?.avatar).filter(Boolean) as string[];
        const moving = OD.move && isOuting(g.player.loc);
        if (moving) advance(g, w, 30).forEach(m => toast(m, 'warn'));   // getting there takes a little while
        const people = moving ? (outingOf(g)?.with ?? []) : [...OD.with.filter(a => g.cast[a]), ...lib];
        startOuting(g, w, place, moving ? [] : people, OD.bg || (moving ? '' : OD.bg));
        if (moving) { const o = outingOf(g); if (o) o.bg = OD.bg; }   // a new place: its own picture (none, if you chose none)
        OD.move = false;
        OD.open = false; saveGame(); await syncScene(); refreshPrompt();
        state.view = 'scene';
        showTransition(place, people.length ? `With ${people.map(a => g.cast[a]?.name).filter(Boolean).join(', ')}` : 'Out of the house', 'time');
        OD.lib = [];
        notify();
    },
    'out-back': () => { if (state.generating) { toast('Wait until they finish speaking.', 'info'); return; } OD.back = true; notify(); },
    'out-back-no': (el, e) => { if (e && el.classList.contains('mu-dlg-veil') && e.target !== el) return; OD.back = false; notify(); },
    'out-back-yes': async () => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        OD.back = false;
        // the conversation goes on out there (and back home): nothing is hidden from the AI
        const where = outingName(g.player.loc);
        // a trip out takes a while: at least 4 hours pass from leaving to coming back
        const o = outingOf(g); const away = o ? nowAbs(g) - o.at : OUTING_MIN;
        if (away < OUTING_MIN) advance(g, w, OUTING_MIN - away).forEach(m => toast(m, 'warn'));
        endOuting(g);
        for (const r of guestsNow(g, 'outing')) { const n = sendHome(g, r.avatar, 'outing'); if (n) toast(`${n} went home.`, 'info'); }   // who came from your library goes home
        runPlans(); saveGame(); await syncScene(); refreshPrompt();
        state.view = 'scene';
        showTransition('Back home', `${where ? `From ${where} · ` : ''}${hm(g.minutes)}`, 'time');
        notify();
    },
});
Object.assign(INPUT, {
    'out-place': (el) => { OD.place = el.value; document.querySelector('[data-act="out-go"]')?.classList.toggle('is-dim', !el.value.trim()); if (OD.miss && el.value.trim()) { OD.miss = false; el.closest('.mu-field')?.classList.remove('is-missing'); el.parentElement?.querySelector('.mu-miss-note')?.remove(); } },
    'out-bgq': (el) => { OD.q = el.value; notify(); },
});
