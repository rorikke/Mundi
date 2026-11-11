// Traits: ready-made descriptions picked as chips (e.g. Personality: calm, kind), up to a limit per group. A strengths
// group (the world maps its options to skills) names the skill on each chip ("Good cook · Cooking 3"), and what a trait
// does is its description, shown under the group for the ones picked.
import { esc } from '../core/store.js';
import type { TraitGroup, WorldDef } from '../core/world.js';
import { strengthText, DRIVE_GROUP } from '../sim/traits.js';

/** The chip's words: the option, and for a strength the skill it starts. */
export function chipText(w: WorldDef | null | undefined, g: TraitGroup, option: string): string {
    const skills = g.skills && w ? strengthText(w, option) : '';
    return skills ? `${option} · ${skills}` : option;
}

export function traitsHtml(groups: TraitGroup[], picked: Record<string, string[]>, act: string, w?: WorldDef | null) {
    return groups.map(g => {
        const mine = picked?.[g.id] ?? [];
        const strengths = !!(g.skills && w && g.options.some(o => strengthText(w, o)));
        const said = mine.map(o => [o, w?.traitInfo?.[o]?.desc] as const).filter(([, d]) => !!d);
        return `<div class="mu-field mu-traits"><span>${esc(g.label)} <small>${mine.length}/${g.max}</small></span>
            ${strengths ? `<small class="mu-muted">Pick ${g.max}: each starts its skill at the level shown. Two on one skill add only 1 more.</small>` : ''}
            ${g.adult && g.id === DRIVE_GROUP ? '<small class="mu-muted">How often you want someone: Desire drains faster with a higher drive. No pick: average.</small>' : ''}
            <div class="mu-chips">${g.options.map(o => {
                const on = mine.includes(o), desc = w?.traitInfo?.[o]?.desc;
                return `<button class="mu-chip ${on ? 'is-on' : ''}" data-act="${esc(act)}" data-k="${esc(g.id)}" data-v="${esc(o)}" ${desc ? `title="${esc(desc)}"` : ''} ${!on && mine.length >= g.max ? 'aria-disabled="true"' : ''}>${esc(chipText(w, g, o))}</button>`;
            }).join('')}</div>
            ${said.map(([o, d]) => `<small class="mu-muted"><b data-notr>${esc(o)}:</b> ${esc(d!)}</small>`).join('')}</div>`;
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
