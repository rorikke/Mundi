// The world's new people in a running game: a card once, when a game lacks people its world has gained since it began
// (Bring them in or Not now), and a lasting button in This world → People for anyone the game doesn't have yet. The
// engine does the bringing in (sim/game.ts addWorldPeople); this file only asks.
import { esc, game, notify, saveGame, state, toast, TUT, SAVE } from '../core/store.js';
import { getWorld, worldFile, isScenario, type WorldDef, type ExampleCharacter } from '../core/world.js';
import { addWorldPeople, markPeopleSeen, missingWorldPeople, peopleToOffer } from '../sim/game.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';

const S = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const names = (list: ExampleCharacter[]) => list.map(e => e.name).join(', ');
const face = (w: WorldDef, e: ExampleCharacter) => e.avatar
    ? `<img src="${esc(worldFile(w, e.avatar))}" alt="" title="${esc(e.name)}" loading="lazy">`
    : `<em>${esc(e.name.slice(0, 1).toUpperCase())}</em>`;

/** The card, among the ones that come to you (after the others). */
export function newPeopleHtml(): string {
    const c = S(); if (!c || TUT.save || SAVE.readOnly || state.busy) return '';
    const list = peopleToOffer(c.g, c.w);
    if (!list.length) return '';
    return `<div class="mh-invite mh-glass mu-np-offer" role="dialog"><i class="mu-np-ic">${icon('users')}</i>
        <div><b>New people in ${esc(c.w.name)}</b><p>${esc(c.w.name)} has people this game doesn't have yet: ${esc(names(list))}. Bring them into your game? They get a home, a routine and the ties a new game would give them; nobody already here changes.</p>
        <span class="mu-np-faces" data-notr>${list.slice(0, 8).map(e => face(c.w, e)).join('')}</span></div>
        <div class="mh-invite-btns"><button class="mu-primary" data-act="np-add">Bring them in</button><button data-act="np-later">Not now</button></div></div>`;
}

/** This world → People: who the game doesn't have yet, whether or not the card asked. */
export function newPeopleBox(): string {
    const c = S(); if (!c || TUT.save || SAVE.readOnly || isScenario(c.w)) return '';   // a Home has Who lives here
    const list = missingWorldPeople(c.g, c.w);
    if (!list.length) return '';
    return `<div class="mu-np-box"><small>Not in this game yet: ${esc(names(list))}</small><button class="mu-ghost" data-act="np-add">${icon('plus')}<span>Bring them in</span></button></div>`;
}

Object.assign(ACT, {
    'np-add': async () => {
        const c = S(); if (!c || state.busy) return;
        state.busy = 'Bringing them in'; notify();
        try {
            const added = await addWorldPeople(c.g, c.w);
            if (added.length) toast(`${added.join(', ')} now live in ${c.w.name}.`, 'success');
        } catch (e) { console.error('[Mundi] new people', e); toast(`Could not bring them in: ${(e as Error)?.message ?? e}`, 'warn'); }
        finally { state.busy = ''; notify(); }
    },
    'np-later': () => {
        const c = S(); if (!c) return;
        markPeopleSeen(c.g, c.w, peopleToOffer(c.g, c.w));
        toast('You can bring them in later: ☰ → This world → People.', 'info');
        saveGame(); notify();
    },
});
