// Street stories on screen (E17): what is happening where you are, as a card like the happenings' (ui/lifeui.ts), with
// the story's choices and a way to walk away. What a choice does is decided in sim/stories.ts; the AI tells it.
import { esc, game, toast, notify, saveGame, state } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { ACT } from './reg.js';
import { thumb, personaName } from '../st/bridge.js';
import { currentStory, storyChoices, chooseStory, leaveStory, castOf } from '../sim/stories.js';
import { syncScene } from '../sim/game.js';
/** The card, while a story here waits for your choice (in the scene only). */
export function storyHtml(g, w) {
    const cur = state.view === 'scene' ? currentStory(g, w) : null;
    if (!cur || cur.now.choice !== undefined)
        return '';
    const who = castOf(g, cur.s)[0];
    const me = personaName();
    const setup = cur.s.setup.replace(/\{\{user\}\}/g, me);
    const pic = who ? `<img src="${esc(thumb(who.avatar))}" alt="">` : '<span class="mh-story-ic" aria-hidden="true">✨</span>';
    const choices = storyChoices(g, w, cur.s);
    return `<div class="mh-invite mh-happen mh-story mh-glass" role="dialog" aria-label="Something is happening here">${pic}
        <div><b>Something is happening here</b><p data-notr>${esc(setup)}</p></div>
        <div class="mh-invite-btns">${choices.map(({ c, i }, n) => `<button class="${n ? '' : 'mu-primary'}" data-act="story-pick" data-i="${i}"><span data-notr>${esc(c.label)}</span>${c.roll ? `<small>🎲 ${esc(c.roll.skill ?? '')}</small>` : ''}</button>`).join('')}
            <button class="mu-ghost" data-act="story-leave">Walk away</button></div></div>`;
}
Object.assign(ACT, {
    'story-pick': async (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const lines = chooseStory(g, w, Number(el.dataset.i));
        lines.forEach((t, n) => toast(t, n === 0 && t.startsWith('🎲') ? 'info' : 'success'));
        saveGame();
        await syncScene();
        notify();
    },
    'story-leave': async () => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        leaveStory(g, w);
        saveGame();
        await syncScene();
        notify();
    },
});
