// The minutes each message is worth, as a setting of this save: shown in This world → Rules › Time and in This Home ›
// Home (sim/chattime.ts plays it).
import { esc, notify, saveGame, cfg, game, type Save } from '../core/store.js';
import { perMessage, chatRange, CHAT_TOP } from '../sim/chattime.js';
import { refreshPrompt } from '../sim/prompt.js';
import { INPUT } from './reg.js';

export function chatTimeHtml(g: Save): string {
    const on = perMessage(g), [lo, hi] = chatRange(g);
    const slider = (label: string, k: 'msgMin' | 'msgMax', v: number) =>
        `<label class="mu-field slider"><span>${label} · ${esc(String(v))} min</span><input type="range" min="0" max="${CHAT_TOP}" step="1" value="${esc(String(v))}" data-input="chat-min" data-k="${k}"></label>`;
    return `<label class="mu-check"><input type="checkbox" data-input="chat-on" ${on ? 'checked' : ''}><span>Time passes with each message<small>A short message is the fewest minutes, a long one the most. Sending the same message again adds none. Off: time only moves with what you do.</small></span></label>
        ${on ? `${slider('Short message', 'msgMin', lo)}${slider('Long message', 'msgMax', hi)}` : ''}`;
}

const done = () => { saveGame(); refreshPrompt(); notify(); };
Object.assign(INPUT, {
    'chat-on': (el) => { const g = game(); if (!g) return; cfg(g).perMessage = (el as HTMLInputElement).checked; done(); },
    // moving one past the other takes the other along, so the range stays in order
    'chat-min': (el) => {
        const g = game(); if (!g) return;
        const c = cfg(g), v = Number(el.value), [lo, hi] = chatRange(g);
        if (el.dataset.k === 'msgMin') { c.msgMin = v; c.msgMax = Math.max(v, hi); } else { c.msgMax = v; c.msgMin = Math.min(v, lo); }
        done();
    },
});
