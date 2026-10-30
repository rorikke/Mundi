// Casual encounters ("bump-in"): doing something out of the house, there is a small chance of running into one of
// the world's people who is free and around. Nobody is dropped into the scene: the player chooses what happens.
import { feel } from '../sim/life.js';
import { markMet } from '../sim/game.js';
import { state, notify, esc, game, saveGame, nowAbs } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { tr } from '../core/tr.js';
import { residents, whereNow, presentAt, stayHere } from '../sim/people.js';
import { playerHomeId } from '../sim/places.js';
import { isWorking } from '../sim/plans.js';
import { bump as addBond, isWith } from '../sim/social.js';
import { note, placeName } from '../sim/facts.js';
import { syncScene } from '../sim/game.js';
import { thumb } from '../st/bridge.js';
import { ACT } from './reg.js';
// `on`: where it happens when it isn't here (E11: on the train, at the station).
export const BUMP = { who: '', on: '' };
const CHANCE = 0.3;
const TALK_MINUTES = 60;
// Called after an action away from home. Picks someone free (not working, not here already), preferring people
// who like this place.
export function maybeBump(g, w) {
    if (g.player.loc === playerHomeId || BUMP.who || Math.random() > CHANCE)
        return;
    const now = nowAbs(g);
    const here = new Set(presentAt(g, w, g.player.loc).map(r => r.avatar));
    const free = residents(g).filter(r => !here.has(r.avatar) && !isWith(g, r.avatar) && !isWorking(g, w, r, now) && whereNow(g, w, r) !== playerHomeId);
    if (!free.length)
        return;
    const fond = free.filter(r => r.leisure.includes(g.player.loc));
    const pool = fond.length && Math.random() < 0.7 ? fond : free;
    BUMP.who = pool[Math.floor(Math.random() * pool.length)].avatar;
    BUMP.on = '';
}
const MET_ON = { train: 'You run into each other on the train.', station: 'You run into each other at the station.' };
// The fact of meeting: where you met, here or on the way here, is part of the text so that it can be translated.
const MET_AT = { '': 'at {1}', train: 'on the train to {1}', station: 'at the station, on the way to {1}' };
const metNote = (g, w, r, end) => note(g, `{u} ran into {0} ${MET_AT[BUMP.on]} ${end}`, [r.name, placeName(g, w, g.player.loc)], [r.avatar], g.player.loc, 'meet');
export function bumpHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    const r = g && BUMP.who ? g.cast[BUMP.who] : null;
    if (!g || !w || !r || state.view !== 'scene')
        return '';
    const name = r.met ? r.name : tr('Someone');
    return `<div class="mu-bump" role="dialog"><img src="${esc(thumb(r.avatar))}" alt="">
        <div><b data-notr>${esc(name)}</b><p>${r.met ? (BUMP.on ? MET_ON[BUMP.on] : 'You run into each other here.') : 'Someone you do not know yet crosses your path.'}</p></div>
        <div class="mu-bump-btns"><button class="mu-primary" data-act="bump-talk">Stop and talk</button><button data-act="bump-greet">Say hi and move on</button><button class="mu-ghost" data-act="bump-ignore">Ignore</button></div></div>`;
}
Object.assign(ACT, {
    'bump-talk': async () => {
        const g = game();
        const w = g && getWorld(g.world);
        const r = g && g.cast[BUMP.who];
        BUMP.who = '';
        if (!g || !w || !r) {
            BUMP.on = '';
            return notify();
        }
        // they stay here a while to talk (an hour), but do not follow you: leave, and they are still here
        stayHere(g, r.avatar, g.player.loc, TALK_MINUTES);
        markMet(g, r.avatar); // stopping to talk: now you know each other
        metNote(g, w, r, 'and stopped to talk.');
        BUMP.on = '';
        saveGame();
        await syncScene();
        notify();
    },
    'bump-greet': () => {
        const g = game();
        const w = g && getWorld(g.world);
        const r = g && g.cast[BUMP.who];
        BUMP.who = '';
        if (g && w && r) {
            if (r.met) {
                addBond(g, r.avatar, 2);
                metNote(g, w, r, 'and said hi.');
            }
            else
                markMet(g, r.avatar); // a hello is enough to know each other's name
            saveGame();
        }
        BUMP.on = '';
        notify();
    },
    'bump-ignore': () => { const g = game(); if (g && BUMP.who && g.cast[BUMP.who]?.met)
        feel(g, BUMP.who, 'A bit hurt you ignored them', 1); BUMP.who = ''; BUMP.on = ''; notify(); },
});
