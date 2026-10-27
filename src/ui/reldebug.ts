// The debug view of relationships (World → Rules → Relationships → "Show the numbers"): the raw values toward you,
// how fast each one grows right now (the pacing weight and rate), the person's pace and attraction, and what each message changed,
// with an undo button to correct a misreading. Shown on a person's card and in the People tab; never sent to the AI.
// With the switch off nothing here is drawn.
import { esc, game, notify, saveGame, type Save } from '../core/store.js';
import { ACT } from './reg.js';
import { icon } from './icons.js';
import { hm } from '../sim/time.js';
import { meter, fatigue, rateOf, paceOf, relCfg, attraction, YOU, type Meter } from '../sim/rel.js';
import { records, undoRecord } from '../sim/msglog.js';
import { momentsOf, initiativeOf, usedToday } from '../sim/moments.js';
import { refreshPrompt } from '../sim/prompt.js';

export const relDebugOn = (g: Save | null) => !!(g && relCfg(g).debug);
const n2 = (v: number) => v.toFixed(2);
const nm = (g: Save, id: string) => (id === YOU ? 'You' : g.cast[id]?.name ?? id);

// Friendship and romance toward you, raw.
export function relNumbersHtml(g: Save, avatar: string): string {
    if (!relDebugOn(g)) return '';
    const row = (m: Meter, label: string) => `<span><b>${label}</b> <span data-notr>${n2(meter(g, m, avatar, YOU))}</span> · weight <span data-notr>${n2(fatigue(g, m, avatar, YOU))}</span> · rate <span data-notr>${n2(rateOf(g, m, avatar, YOU))}</span> · pace ${paceOf(g, avatar, m) ?? 'world default'} · attraction <span data-notr>×${n2(attraction(g, avatar, YOU, m))}</span></span>`;
    const ms = momentsOf(g, avatar).map(m => `<span>${m.sent !== undefined ? 'sent' : 'queued'} · ${m.kind}${m.tier ? ` ${m.tier}` : ''}${m.ask ? ` ${m.ask}` : ''} (day ${m.day}): <span data-notr>${esc(m.text)}</span></span>`);
    return `<div class="mu-reldbg">${row('f', 'Friendship')}${row('r', 'Romance')}<span><b>Initiative</b> ${initiativeOf(g)} · used today <span data-notr>${usedToday(g)}</span></span>${ms.join('')}</div>`;
}

// What the messages changed for this person (open records first, then the settled ones kept for a day).
export function relChangesHtml(g: Save, avatar: string): string {
    if (!relDebugOn(g)) return '';
    const list = records(g).filter(r => r.who === avatar || r.ch.some(c => c.x === avatar)).slice(0, 30);
    const change = (r: (typeof list)[number]) => r.undone ? 'undone' : r.ch.map(c => `${nm(g, c.x)} ${c.m === 'r' ? 'romance' : 'friendship'} ${c.d >= 0 ? '+' : ''}${n2(c.d)}`).join(', ') || 'no change';
    return `<section class="mu-reldbg-list"><h4>Changes</h4>
        ${list.length ? `<ul>${list.map(r => `<li class="${r.settled ? 'is-settled' : ''}"><small data-notr>${hm(r.at % 1440)}</small>
            <span><span data-notr>${esc(nm(g, r.who))}</span>${r.kind === 'line' ? ' (your line)' : r.kind === 'verdict' ? ' (scene verdict)' : ''}: <span data-notr>${esc(r.why)}</span> → <span data-notr>${esc(change(r))}</span>${r.settled ? ' · settled' : ''}</span>
            ${!r.undone && r.ch.length && r.id ? `<button class="mu-ibtn mu-ghost" data-act="rd-undo" data-id="${r.id}" title="Undo">${icon('undo')}</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="mu-muted">Nothing recorded for them since the last scene.</p>'}</section>`;
}

Object.assign(ACT, {
    'rd-undo': (el) => { const g = game(); if (!g) return; if (undoRecord(g, Number(el.dataset.id))) { saveGame(); refreshPrompt(); } notify(); },
});
