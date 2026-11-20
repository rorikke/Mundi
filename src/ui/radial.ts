// Click a character's sprite: a radial menu around them with what you can do with them (the same as their card in
// "Here", except "Play as them"). What they wear isn't yours to pick: the game dresses them for the place (sim/dress.ts).
import { esc, game, notify, type Save, type Resident } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { ACT } from './reg.js';
import { icon } from './icons.js';
import { isWith, bondOf, isPartner, social } from '../sim/social.js';
import { ALONG_BOND, canAlong } from '../sim/plans.js';
import { shutOut } from '../sim/romance.js';
import { featureOn } from '../sim/creator.js';
import { stayButton } from './events.js';
import { romanceButtons } from './relui.js';
import { charOf } from '../st/bridge.js';
import { guestButtons } from './guestsui.js';

export const RAD = { who: '' };

const btn = (act: string, who: string, ic: string, label: string, extra = '') => `<button data-act="${esc(act)}" data-who="${esc(who)}" ${extra}>${icon(ic)}<span>${esc(label)}</span></button>`;
// The buttons of an HTML snippet (romance, stay), so they sit on the arc like the others.
const buttonsIn = (html: string) => html.match(/<button[\s\S]*?<\/button>/g) ?? [];

function actions(g: Save, w: WorldDef, r: Resident): string[] {
    if (!featureOn(w, 'plans')) return [];
    const b = bondOf(g, r.avatar), along = isWith(g, r.avatar), solo = String((social(g) as any).solo ?? '') === r.avatar;
    const out: string[] = [];
    if (!r.met) out.push(btn('pc-intro', r.avatar, 'chat', 'Introduce yourself'));
    out.push(along ? btn('pc-bye', r.avatar, 'back', 'Say goodbye')
        : btn('pc-along', r.avatar, 'users', 'Come with me', canAlong(g, r.avatar) ? '' : `aria-disabled="true" title="${shutOut(g, r.avatar, isPartner(g, r.avatar)) ? 'They do not want to go anywhere with you.' : `Get closer first (${b}/${ALONG_BOND})`}"`));
    out.push(btn('pc-plan', r.avatar, 'pin', 'Make plans'));
    out.push(solo ? `<button data-act="solo-off">${icon('users')}<span>Talk with everyone</span></button>` : btn('solo-on', r.avatar, 'chat', 'Talk only with them'));
    out.push(...buttonsIn(stayButton(r.avatar)), ...guestButtons(g, r.avatar), ...buttonsIn(romanceButtons(r.avatar)));
    out.push(btn('pc-open', r.avatar, 'user', 'Their card'));
    return out;
}
// Puts the buttons on an arc: angle from top to bottom.
const arc = (items: string[]) => {
    const n = items.length, step = n > 1 ? Math.min(17, 100 / (n - 1)) : 0;
    return items.map((h, k) => h.replace('<button', `<button style="--a:${((k - (n - 1) / 2) * step).toFixed(1)}deg;--k:${k}" data-rad="r"`)).join('');
};

// The menu for one sprite (empty when closed). `r` is null for someone who is not one of the world's people (a scenario's card).
export function radialHtml(avatar: string, r: Resident | null): string {
    if (RAD.who !== avatar) return '';
    const g = game(); const w = g && getWorld(g.world); if (!g || !w) return '';
    const right = r ? actions(g, w, r) : [];
    if (!right.length) return '';
    return `<div class="mu-radial" role="menu" aria-label="${esc(r?.name ?? String(charOf(avatar)?.name ?? ''))}">
        <div class="mu-rad-side is-right">${arc(right)}</div></div>`;
}

// The open menu goes over the chat box, but the sprites stay under it (their pictures would cover the text). So the
// menu is drawn in a layer of its own above the box: a copy of the sprite's slot (same classes and place, so the
// buttons sit around them as before) whose picture is invisible and lets clicks through.
export function radialLayer(avatar: string, r: Resident | null, style: string, inner: string): string {
    const menu = radialHtml(avatar, r);
    return menu ? `<div class="mu-sprites mu-rad-layer"><figure class="mu-sprite is-menu" style="${style}">${inner}${menu}</figure></div>` : '';
}

Object.assign(ACT, {
    'spr-menu': (el, e) => {
        if ((e?.target as HTMLElement)?.closest?.('.mu-radial')) return;
        const who = el.dataset.who ?? '';
        RAD.who = RAD.who === who ? '' : who; notify();
    },
    'spr-close': () => { if (RAD.who) { RAD.who = ''; notify(); } },
});
// Any choice in the menu closes it.
document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (!RAD.who) return;
    if (t.closest?.('[data-rad]')) { setTimeout(() => { if (RAD.who) { RAD.who = ''; notify(); } }, 0); return; }
    if (!t.closest?.('.mu-sprite')) { RAD.who = ''; notify(); }
}, true);
