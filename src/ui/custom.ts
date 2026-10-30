// "Something else…": an action you name yourself (go skateboarding, read a book), short, medium or long.
// Time passes, it costs a little energy and lifts the mood; it goes into the journal (and the diary) and the AI
// is told about it, like any other action.
import { esc, game, notify, saveGame, toast, state } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { setPrompt } from '../st/bridge.js';
import { advance } from '../sim/time.js';
import { addStatus, tooTired } from '../sim/needs.js';
import { note } from '../sim/facts.js';
import { syncScene } from '../sim/game.js';
import { refreshPrompt } from '../sim/prompt.js';
import { runPlans } from './plans.js';
import { doing, isDoing } from './doing.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

const LENGTHS = [
    { id: 'short', name: 'Short', mins: 30, energy: -3, mood: 3 },
    { id: 'medium', name: 'Medium', mins: 90, energy: -8, mood: 6 },
    { id: 'long', name: 'Long', mins: 180, energy: -15, mood: 9 },
];
const C = { open: false, text: '', len: 'medium' };

export function customActionRow(): string {
    return `<button class="mh-act mh-glass mh-act-custom" data-act="ca-open"><i>${icon('plus')}</i><b>Something else…</b><small>Name it and choose how long</small></button>`;
}
// The window, in the middle of the screen: what you do, for how long, and "Do it". It is a one-off: it does not
// become one of the "Things to do".
export function customModalHtml(): string {
    if (!C.open) return '';
    return `<div class="mu-recap-veil" data-act="ca-bg"><section class="mu-recap mh-glass mu-ca-modal" role="dialog" aria-label="Something else">
        <header><small>Something else</small><h3>What do you want to do?</h3></header>
        <div class="mu-ca-body">
            <input type="text" placeholder="Go skateboarding, read a book, call my mom…" maxlength="80" value="${esc(C.text)}" data-input="ca-text" data-focus="ca-text">
            <small class="mu-muted">For how long?</small>
            <div class="mh-ca-lens">${LENGTHS.map(l => `<button class="${C.len === l.id ? 'is-on' : ''}" data-act="ca-len" data-v="${esc(l.id)}"><b>${l.name}</b><small>${l.mins < 60 ? `${l.mins} min` : `${l.mins / 60} h`}</small></button>`).join('')}</div>
            <small class="mu-muted">A one-time thing: it passes the time, lifts your mood a little, and goes into your journal.</small>
        </div>
        <footer class="mh-ca-row"><button class="mu-ghost" data-act="ca-close">Cancel</button><button class="mu-primary" data-act="ca-go" ${C.text.trim() ? '' : 'aria-disabled="true"'}>${icon('check')}<span>Do it</span></button></footer>
    </section></div>`;
}

Object.assign(ACT, {
    'ca-open': () => { C.open = true; notify(); setTimeout(() => document.querySelector<HTMLInputElement>('#mundi-root [data-focus="ca-text"]')?.focus(), 30); },
    'ca-close': () => { C.open = false; notify(); },
    'ca-bg': (el, e) => { if (e.target === el) { C.open = false; notify(); } },
    'ca-len': (el) => { C.len = el.dataset.v!; notify(); },
    'ca-go': async () => {
        const g = game(); const w = g && getWorld(g.world);
        const what = C.text.trim().replace(/[.!]+$/, '');
        if (!g || !w || !what || isDoing()) return;
        const l = LENGTHS.find(x => x.id === C.len) ?? LENGTHS[1];
        const tired = tooTired(g, w, { energy: -l.energy }, what.toLowerCase()); if (tired) { toast(tired, 'warn'); return; }
        C.open = false; C.text = '';
        await doing(what, '✨', l.mins);
        addStatus(g, w, 'energy', l.energy); addStatus(g, w, 'mood', l.mood);
        advance(g, w, l.mins).forEach(m => toast(m, 'warn'));
        note(g, '{u} spent some time doing this: {0}.', [what]);
        runPlans();
        saveGame(); await syncScene(); refreshPrompt();
        // the AI hears about it, like the result of any other action
        if (state.view === 'scene') setPrompt('mundi_roll', `[{{user}} just spent ${l.mins < 60 ? `${l.mins} minutes` : `${l.mins / 60} hours`} doing this: ${what}. Take it into account if it comes up.]`);
        toast(`${what}: done.`, 'success');
        notify();
    },
});
Object.assign(INPUT, { 'ca-text': (el) => { C.text = el.value; const b = document.querySelector<HTMLButtonElement>('#mundi-root [data-act="ca-go"]'); if (b) b.toggleAttribute('aria-disabled', !el.value.trim()); } });
