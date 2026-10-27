// The switch and the list for each speaker's dialogue colour (Chat look), and the colour field in a person's page
// (People tab). A character's colour is saved on their card; yours is kept per persona. Clearing one gives that person
// a colour chosen by your AI again (sim/talkcolors.ts).
import { esc, notify, game, toast, UI, saveSettings } from '../core/store.js';
import { charOf, saveCardColor, personaName } from '../st/bridge.js';
import { ME, TALK, talkOn, colorOf, sourceOf, setMyColor, noteCardColor, ensure, cleanHex, myPersona } from '../sim/talkcolors.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
const SOURCE = { mine: 'Your choice', card: 'Set on the card', ai: 'Chosen by your AI', auto: 'Automatic', '': 'Not chosen yet' };
const nameOf = (id) => { const g = game(); return id === ME ? personaName(myPersona(g)) : g?.cast[id]?.name ?? charOf(id)?.name ?? id; };
const canSet = (id) => id === ME || !!charOf(id);
function rowHtml(id) {
    const g = game();
    const c = colorOf(g, id), src = sourceOf(g, id), own = src === 'mine' || src === 'card';
    return `<div class="mu-talk-row">
        <input type="color" value="${esc(c || '#ffffff')}" data-input="talk-color" data-id="${esc(id)}" title="${own ? 'Change' : 'Choose a color of your own'}" ${canSet(id) ? '' : 'disabled'}>
        <b data-notr style="${c ? `color:${esc(c)}` : ''}">${esc(nameOf(id))}</b><small>${esc(SOURCE[src] ?? '')}</small>
        ${own ? `<button class="mu-ghost mu-ibtn" data-act="talk-reset" data-id="${esc(id)}" title="Back to a color your AI chooses">${icon('undo')}</button>` : ''}</div>`;
}
// The body of Chat look's "Speakers' colors" part.
export function talkLookHtml() {
    const on = talkOn(), g = game();
    const people = g ? Object.values(g.cast).sort((a, b) => Number(b.met) - Number(a.met) || a.name.localeCompare(b.name)).map(r => r.avatar) : [];
    return `<label class="mu-check"><input type="checkbox" data-input="talk-on" ${on ? 'checked' : ''}><span>Color each speaker's dialogue<small>Quotes ("…") in a line, and the speaker's name, take that person's color. Leave it off if your preset or regex scripts already color quotes. The narrator keeps the quoted text color.</small></span></label>
        ${!on ? '' : !g ? '<p class="mu-muted">Open a game to see its people\'s colors.</p>' : `<div class="mu-talk-list">${[ME, ...people].map(rowHtml).join('')}</div>
            <div class="mu-row"><button class="mu-ghost" data-act="talk-again" ${TALK.busy ? 'aria-disabled="true"' : ''}>${icon('undo')}<span>Pick colors again</span></button>
                <small class="mu-muted">${TALK.busy ? 'Your AI is choosing colors…' : TALK.failed ? 'Your AI could not choose: automatic colors are used for now.' : 'Colors set on a card (or yours) stay; your AI chooses the others, and Mundi keeps them readable and apart.'}</small></div>`}`;
}
// The colour field in a person's page (People tab), while the switch is on.
export function talkFieldHtml(id) {
    const g = game();
    if (!g || !talkOn() || !canSet(id))
        return '';
    const c = colorOf(g, id), src = sourceOf(g, id), own = src === 'mine' || src === 'card';
    return `<div class="mu-field mu-talk-field"><span>Dialogue color</span><div class="mu-row">
        <input type="color" value="${esc(c || '#ffffff')}" data-input="talk-color" data-id="${esc(id)}">
        ${own ? `<button class="mu-ghost mu-ibtn" data-act="talk-reset" data-id="${esc(id)}" title="Back to a color your AI chooses">${icon('undo')}</button>` : ''}
        <small class="mu-muted">${esc(SOURCE[src] ?? '')}</small>${id === ME ? '' : '<small class="mu-muted">A color you choose is saved on their card.</small>'}</div></div>`;
}
// A colour picked by dragging changes many times a second: the open copy of the card follows at once, the card file
// is written once it stops.
const writes = new Map();
function toCard(avatar, hex) {
    const c = charOf(avatar);
    if (c) {
        const ext = (c.data ??= {}).extensions ??= {};
        ext.mundi = { ...(ext.mundi ?? {}), color: hex };
    }
    clearTimeout(writes.get(avatar));
    writes.set(avatar, window.setTimeout(() => {
        writes.delete(avatar);
        saveCardColor(avatar, hex).catch((e) => toast(String(e?.message ?? e), 'error'));
    }, 700));
}
Object.assign(INPUT, {
    'talk-on': (el) => {
        UI().talkColors = el.checked;
        saveSettings();
        const g = game();
        if (g && talkOn())
            void ensure(g);
        notify();
    },
    'talk-color': (el) => {
        const g = game(), id = el.dataset.id, hex = cleanHex(el.value);
        if (!g || !hex)
            return;
        if (id === ME)
            setMyColor(g, hex);
        else {
            noteCardColor(g, id, hex);
            toCard(id, hex);
        }
        notify();
    },
});
Object.assign(ACT, {
    'talk-reset': (el) => {
        const g = game(), id = el.dataset.id;
        if (!g)
            return;
        if (id === ME)
            setMyColor(g, '');
        else {
            noteCardColor(g, id, '');
            toCard(id, null);
        }
        notify();
    },
    'talk-again': () => { const g = game(); if (g && !TALK.busy)
        void ensure(g, true); },
});
