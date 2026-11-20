// Traits: ready-made descriptions picked as chips (e.g. Personality: calm, kind), up to a limit per group. A strengths
// group (the world maps its options to skills) names the skill on each chip ("Good cook · Cooking 3", or "Cooking 2 → 4"
// over what the start gives), a trait's opposite can't be picked with it (Outgoing and Shy), and what a trait does is
// its description, shown under the group for the ones picked.
import { esc } from '../core/store.js';
import type { TraitGroup, WorldDef } from '../core/world.js';
import { strengthText, strengthsOver, strengthOf, clashOf, STRENGTH_STEP, DRIVE_GROUP } from '../sim/traits.js';
import { skillDef } from '../sim/hobbies.js';

/** The chip's words: the option, and for a strength the skill it starts. `from`: the skills the start gives, so the
 *  chip says what the pick makes of them ("Cooking 2 → 4"). */
export function chipText(w: WorldDef | null | undefined, g: TraitGroup, option: string, from?: Record<string, number>): string {
    if (!g.skills || !w) return option;
    if (!from || !strengthOf(w, option)) { const skills = strengthText(w, option); return skills ? `${option} · ${skills}` : option; }
    const to = strengthsOver(w, [option], from);
    return `${option} · ${Object.entries(to).map(([id, n]) => `${skillDef(w, id)?.name ?? id} ${from[id] ? `${from[id]} → ${n}` : n}`).join(', ')}`;
}

/** `from`: the skills the chosen start gives (a new game), for the strengths' chips. */
export function traitsHtml(groups: TraitGroup[], picked: Record<string, string[]>, act: string, w?: WorldDef | null, from?: Record<string, number>) {
    return groups.map(g => {
        const mine = picked?.[g.id] ?? [];
        const strengths = !!(g.skills && w && g.options.some(o => strengthText(w, o)));
        const said = mine.map(o => [o, w?.traitInfo?.[o]?.desc] as const).filter(([, d]) => !!d);
        const hint = from ? `Pick ${g.max}: each raises its skill ${STRENGTH_STEP} levels over your start, or to the level shown. Two on one skill add 1 more.` : `Pick ${g.max}: each starts its skill at the level shown. Two on one skill add only 1 more.`;
        return `<div class="mu-field mu-traits"><span>${esc(g.label)} <small>${mine.length}/${g.max}</small></span>
            ${strengths ? `<small class="mu-muted">${esc(hint)}</small>` : ''}
            ${g.adult && g.id === DRIVE_GROUP ? '<small class="mu-muted">How often you want someone: Desire drains faster with a higher drive. No pick: average.</small>' : ''}
            <div class="mu-chips">${g.options.map(o => {
                const on = mine.includes(o), desc = w?.traitInfo?.[o]?.desc, clash = on ? '' : clashOf(w, o, mine);
                const tip = clash ? `Not with ${clash}` : desc;
                return `<button class="mu-chip ${on ? 'is-on' : ''}" data-act="${esc(act)}" data-k="${esc(g.id)}" data-v="${esc(o)}" ${tip ? `title="${esc(tip)}"` : ''} ${!on && (mine.length >= g.max || clash) ? 'aria-disabled="true"' : ''}>${esc(chipText(w, g, o, from))}</button>`;
            }).join('')}</div>
            ${said.map(([o, d]) => `<small class="mu-muted"><b data-notr>${esc(o)}:</b> ${esc(d!)}</small>`).join('')}</div>`;
    }).join('');
}

/** Picks or drops one option; a pick past the group's limit, or one that clashes with a pick of yours (`w`'s
 *  opposites), is refused. */
export function toggleTrait(groups: TraitGroup[], picked: Record<string, string[]>, id: string, value: string, w?: WorldDef | null) {
    const g = groups.find(x => x.id === id);
    if (!g) return;
    const mine = (picked[id] ??= []);
    const i = mine.indexOf(value);
    if (i >= 0) mine.splice(i, 1);
    else if (mine.length < g.max && !clashOf(w, value, Object.values(picked).flat())) mine.push(value);
}

export const traitLines = (groups: TraitGroup[], picked: Record<string, string[]>) =>
    groups.filter(g => picked?.[g.id]?.length).map(g => `${g.label}: ${picked[g.id].join(', ')}`);
