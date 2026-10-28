// (E15) Adult content in a game's settings (globe → Rules): the same switch the new game asks about, for this save.
import { game, adultOn } from '../core/store.js';
import { setAdult } from '../sim/game.js';
import { INPUT } from './reg.js';
export function adultSettingHtml(g) {
    return `<section class="mu-wc-sec"><h4>Adult content</h4>
        <label class="mu-check"><input type="checkbox" data-input="wc-adult" ${adultOn(g) ? 'checked' : ''}><span>Adult content in this game
            <small>On: the places, jobs, things to do, lore and people the world marks as adult are part of the game, and people's intimate profiles can be seen and changed. Off: all of it is left out (nothing is deleted: turning it on again brings it back). The world's adult-only people come only into a new game started with it on. Everyone in Mundi's worlds is an adult.</small></span></label></section>`;
}
Object.assign(INPUT, {
    'wc-adult': (el) => { const g = game(); if (g)
        void setAdult(g, el.checked); },
});
