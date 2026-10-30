// Traits: ready-made descriptions picked as chips (e.g. Proficiency: strong, smart), up to a limit per group.
import { esc } from '../core/store.js';
import type { TraitGroup } from '../core/world.js';

export function traitsHtml(groups: TraitGroup[], picked: Record<string, string[]>, act: string) {
    return groups.map(g => {
        const mine = picked?.[g.id] ?? [];
        return `<div class="mu-field mu-traits"><span>${esc(g.label)} <small>${mine.length}/${g.max}</small></span>
            <div class="mu-chips">${g.options.map(o => {
                const on = mine.includes(o);
                return `<button class="mu-chip ${on ? 'is-on' : ''}" data-act="${esc(act)}" data-k="${esc(g.id)}" data-v="${esc(o)}" ${!on && mine.length >= g.max ? 'aria-disabled="true"' : ''}>${esc(o)}</button>`;
            }).join('')}</div></div>`;
    }).join('');
}

export function toggleTrait(groups: TraitGroup[], picked: Record<string, string[]>, id: string, value: string) {
    const g = groups.find(x => x.id === id);
    if (!g) return;
    const mine = (picked[id] ??= []);
    const i = mine.indexOf(value);
    if (i >= 0) mine.splice(i, 1);
    else if (mine.length < g.max) mine.push(value);
}

export const traitLines = (groups: TraitGroup[], picked: Record<string, string[]>) =>
    groups.filter(g => picked?.[g.id]?.length).map(g => `${g.label}: ${picked[g.id].join(', ')}`);
