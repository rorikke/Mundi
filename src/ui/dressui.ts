// This Home › Dress code: for each room, the outfit people wear there (the name of an outfit folder in their
// Expressions, like "swimsuit" or "pajamas"). Someone without that outfit, or for whom it's bolder than they go,
// keeps what they wear. Also, in any game: whether what people have on follows the story (sim/storydress.ts).
import { notify, esc, saveGame, game, cfg, type Save } from '../core/store.js';
import { type WorldDef } from '../core/world.js';
import { pins } from '../sim/places.js';
import { dressCodes } from '../sim/dress.js';
import { refreshPrompt } from '../sim/prompt.js';
import { syncScene } from '../sim/game.js';
import { outfitsOf, savedOutfits, outfitLabel } from './outfits.js';
import { INPUT } from './reg.js';

export function dressHtml(g: Save, w: WorldDef): string {
    const codes = dressCodes(g);
    const rooms = pins(g, w).filter(p => !p.link && !p.home);
    // the outfit names the people of this house have (for suggestions)
    const names = [...new Set(Object.keys(g.cast).flatMap(a => [...(outfitsOf(a) ?? []), ...savedOutfits(a)]).map(n => n.toLowerCase()))].sort();
    const row = (id: string, name: string) => `<label class="mu-dress-row"><b data-notr>${esc(name)}</b><input type="text" list="mu-dress-names" maxlength="40" placeholder="their usual clothes" value="${esc(codes[id] ?? '')}" data-input="dress" data-id="${esc(id)}" data-focus="dress-${esc(id)}"></label>`;
    return `<section class="mu-wc-sec"><h4>Dress code</h4>
        <p class="mu-muted">What people wear in each room: the name of an outfit folder in their Expressions (a "swimsuit" folder for the pool, "pajamas" for the bedrooms…). Anyone who has it puts it on while in that room with you, as far as their comfort goes (Library › Expressions: how bold they go, and how bold each outfit is), and the AI is told; anyone it's too bold for, or who doesn't have it, keeps their clothes. Empty: their usual clothes.</p>
        <datalist id="mu-dress-names">${names.map(n => `<option value="${esc(n)}">${esc(outfitLabel(n))}</option>`).join('')}</datalist>
        <div class="mu-dress">${rooms.map(p => row(p.id, p.name)).join('')}${row('__bedrooms', 'Bedrooms')}</div></section>`;
}
// Outfits that follow the story: on unless turned off (it costs a small AI call per reply where it can matter).
export function storyDressHtml(g: Save): string {
    return `<section class="mu-wc-sec"><h4>Outfits</h4>
        <label class="mu-check"><input type="checkbox" data-input="wc-storydress" ${(cfg(g) as any).storyDress !== false ? 'checked' : ''}><span>Outfits follow the story
            <small>When a reply clearly has someone undress, dress again or change clothes, their picture follows and the AI is told. Undressing only in a private place with adult content on; changing into another outfit only where they can change (their home). One short AI call after a reply, only when someone in it could change. Off: only places, things to do and private moments change what people wear.</small></span></label></section>`;
}
Object.assign(INPUT, {
    'wc-storydress': (el) => {
        const g = game(); if (!g) return;
        if ((el as HTMLInputElement).checked) delete (cfg(g) as any).storyDress; else (cfg(g) as any).storyDress = false;
        saveGame(); void syncScene().then(notify);
    },
    dress: (el) => {
        const g = game(); if (!g) return;
        const codes = dressCodes(g); const id = el.dataset.id!; const v = el.value.trim();
        if (v) codes[id] = v; else delete codes[id];
        saveGame(); refreshPrompt();
        clearTimeout((INPUT as any).__dressT); (INPUT as any).__dressT = setTimeout(() => { void syncScene().then(notify); }, 600);
    },
});
