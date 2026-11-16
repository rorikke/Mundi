// The end-game women's part of the Museum tab (C-7): the rival's foundation asking to borrow a piece (Lend / Refuse,
// the fee, the days left to answer) or the piece away and until when (sim/loans.ts owns every number); and the lines the
// Dealer and Sales tabs add once the dealer and the other collector are people in the game. This file only draws and
// calls; every value from the world goes through esc() (names in data-notr).
import { esc, game, toast, notify, saveGame, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { money } from '../sim/needs.js';
import { refreshPrompt } from '../sim/prompt.js';
import { loanView, lendPiece, refuseLoan } from '../sim/loans.js';
import { ACT } from './reg.js';

const n = (x: number) => String(Math.round(x));
const off = (why: string) => (why ? `aria-disabled="true" title="${esc(why.replace(/\.$/, ''))}"` : '');

/** The loan card: the piece asked for (Lend · fee / Refuse, days left) or the piece away until a day. Empty when the
 *  world has no loans, she isn't in the game, or there's nothing to say. */
export function loanCard(g: Save, w: WorldDef): string {
    const v = loanView(g, w);
    if (!v.on || (!v.ask && !v.now)) return '';
    const who = `<span data-notr>${esc(v.who ?? '')}</span>`, label = `<span data-notr>${esc(v.label ?? '')}</span>`;
    if (v.now) return `<section class="mu-mu-card mu-mu-loan"><h4>${esc('On loan')}</h4>
        <p><b data-notr>${esc(v.now.name)}</b> ${esc('is lent to')} ${label} ${esc(`until day ${n(v.now.until)}`)}.</p>
        <small class="mu-muted">${esc('Away from your halls: no renown from it until it\'s back, but it still counts as yours.')}</small></section>`;
    const a = v.ask!;
    return `<section class="mu-mu-card mu-mu-loan"><h4>${esc('A loan asked for')}</h4>
        <p>${who} ${esc('asks to borrow')} <b data-notr>${esc(a.name)}</b> ${esc('for')} ${label}.</p>
        <small>${esc(`${money(w, a.fee)} for the season, back the day after day ${n(a.until)}. ${a.days === 1 ? '1 day to answer.' : `${n(a.days)} days to answer.`}`)}</small>
        <small class="mu-muted">${esc('While it\'s away it brings no renown, but it still counts as yours.')}</small>
        <div class="mu-mu-btns"><button data-act="mus-lend" ${off(a.why)}>${esc(`Lend · ${money(w, a.fee)}`)}</button><button data-act="mus-refuse">${esc('Refuse')}</button></div></section>`;
}

const C = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const said = (lines: string[], ok: boolean) => {
    lines.filter(Boolean).forEach((t, i) => toast(t, !ok ? 'warn' : i === 0 ? 'success' : 'info'));
    if (ok) { saveGame(); refreshPrompt(); }
    notify();
};
Object.assign(ACT, {
    'mus-lend': (el: HTMLElement) => { const c = C(); if (!c) return; if (el.getAttribute('aria-disabled') === 'true') { toast(el.title || 'Not now.', 'info'); return; } const r = lendPiece(c.g, c.w); said(r.lines, r.ok); },
    'mus-refuse': () => { const c = C(); if (!c) return; const r = refuseLoan(c.g, c.w); said(r.lines, r.ok); },
});
