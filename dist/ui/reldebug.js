// The debug view of relationships (World → Rules → Relationships → "Show the numbers"): the raw values toward you,
// how fast each one grows right now (the pacing weight and rate), the person's pace, and what each message changed,
// with an undo button to correct a misreading. Shown on a person's card and in the People tab; never sent to the AI.
// With the switch off nothing here is drawn.
import { esc, game, notify, saveGame } from '../core/store.js';
import { ACT } from './reg.js';
import { icon } from './icons.js';
import { hm } from '../sim/time.js';
import { meter, fatigue, rateOf, paceOf, relCfg, YOU } from '../sim/rel.js';
import { records, undoRecord } from '../sim/msglog.js';
import { refreshPrompt } from '../sim/prompt.js';
export const relDebugOn = (g) => !!(g && relCfg(g).debug);
const n2 = (v) => v.toFixed(2);
const nm = (g, id) => (id === YOU ? 'You' : g.cast[id]?.name ?? id);
// Friendship and romance toward you, raw.
export function relNumbersHtml(g, avatar) {
    if (!relDebugOn(g))
        return '';
    const row = (m, label) => `<span><b>${label}</b> <span data-notr>${n2(meter(g, m, avatar, YOU))}</span> · weight <span data-notr>${n2(fatigue(g, m, avatar, YOU))}</span> · rate <span data-notr>${n2(rateOf(g, m, avatar, YOU))}</span> · pace ${paceOf(g, avatar, m) ?? 'world default'}</span>`;
    return `<div class="mu-reldbg">${row('f', 'Friendship')}${row('r', 'Romance')}</div>`;
}
// What the messages changed for this person (open records first, then the settled ones kept for a day).
export function relChangesHtml(g, avatar) {
    if (!relDebugOn(g))
        return '';
    const list = records(g).filter(r => r.who === avatar || r.ch.some(c => c.x === avatar)).slice(0, 30);
    const change = (r) => r.undone ? 'undone' : r.ch.map(c => `${nm(g, c.x)} ${c.m === 'r' ? 'romance' : 'friendship'} ${c.d >= 0 ? '+' : ''}${n2(c.d)}`).join(', ') || 'no change';
    return `<section class="mu-reldbg-list"><h4>Changes</h4>
        ${list.length ? `<ul>${list.map(r => `<li class="${r.settled ? 'is-settled' : ''}"><small data-notr>${hm(r.at % 1440)}</small>
            <span><span data-notr>${esc(nm(g, r.who))}</span>${r.kind === 'line' ? ' (your line)' : ''}: <span data-notr>${esc(r.why)}</span> → <span data-notr>${esc(change(r))}</span>${r.settled ? ' · settled' : ''}</span>
            ${!r.undone && r.ch.length && r.id ? `<button class="mu-ibtn mu-ghost" data-act="rd-undo" data-id="${r.id}" title="Undo">${icon('undo')}</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="mu-muted">Nothing recorded for them since the last scene.</p>'}</section>`;
}
Object.assign(ACT, {
    'rd-undo': (el) => { const g = game(); if (!g)
        return; if (undoRecord(g, Number(el.dataset.id))) {
        saveGame();
        refreshPrompt();
    } notify(); },
});
