// Casual encounters ("bump-in"): doing something out of the house, there is a small chance of running into one of
// the world's people who is free and around. Nobody is dropped into the scene: the player chooses what happens.
// After an action, someone who is already here may come over instead (sim/approach.ts decides who and how often):
// the same card asks whether to talk or to nod and keep going.
import { feel } from '../sim/life.js';
import { markMet } from '../sim/game.js';
import { state, notify, esc, game, saveGame, nowAbs, toast, type Save } from '../core/store.js';
import { getWorld, type WorldDef, type ActionDef } from '../core/world.js';
import { tr } from '../core/tr.js';
import { residents, whereNow, presentAt, stayHere } from '../sim/people.js';
import { playerHomeId } from '../sim/places.js';
import { isWorking } from '../sim/plans.js';
import { bump as addBond, isWith, talkedWith } from '../sim/social.js';
import { rollApproach, cameOver, runInChance } from '../sim/approach.js';
import { setAsk, replyAs } from '../st/bridge.js';
import { note, placeName } from '../sim/facts.js';
import { syncScene } from '../sim/game.js';
import { thumb } from '../st/bridge.js';
import { ACT } from './reg.js';

// `on`: where it happens when it isn't here (E11: on the train, at the station). `at`: the place it belongs to; the
// card can wait behind another one (hud.ts shows one at a time), and once you have left it is gone. `come`: they were
// already here and came over to you.
export const BUMP = { who: '', on: '' as '' | 'train' | 'station', at: '', come: false };
const TALK_MINUTES = 60;

// Called after an action. First, maybe someone here comes over (at home too: a housemate); else, away from home,
// maybe you run into someone free (not working, not here already), preferring people who like this place.
export function maybeBump(g: Save, w: WorldDef, a?: ActionDef) {
    if (BUMP.who && BUMP.at !== g.player.loc) dropBump();
    if (BUMP.who) return;
    const come = rollApproach(g, w, a);
    if (come) { cameOver(g, come); Object.assign(BUMP, { who: come, on: '', at: g.player.loc, come: true }); return; }
    if (g.player.loc === playerHomeId || Math.random() >= runInChance(g, w)) return;
    const now = nowAbs(g);
    const here = new Set(presentAt(g, w, g.player.loc).map(r => r.avatar));
    const free = residents(g).filter(r => !here.has(r.avatar) && !isWith(g, r.avatar) && !isWorking(g, w, r, now) && whereNow(g, w, r) !== playerHomeId);
    if (!free.length) return;
    const fond = free.filter(r => r.leisure.includes(g.player.loc));
    const pool = fond.length && Math.random() < 0.7 ? fond : free;
    BUMP.who = pool[Math.floor(Math.random() * pool.length)].avatar;
    BUMP.on = ''; BUMP.at = g.player.loc; BUMP.come = false;
    cameOver(g, BUMP.who);   // (nobody else comes over right after)
}
/** Leaving without answering: you just missed each other (nobody is hurt). */
export function dropBump() { BUMP.who = ''; BUMP.on = ''; BUMP.at = ''; BUMP.come = false; }
const MET_ON = { train: 'You run into each other on the train.', station: 'You run into each other at the station.' } as const;
// The fact of meeting: where you met, here or on the way here, is part of the text so that it can be translated.
const MET_AT = { '': 'at {1}', train: 'on the train to {1}', station: 'at the station, on the way to {1}' } as const;
const metNote = (g: Save, w: WorldDef, r: { name: string; avatar: string }, end: string) => note(g, `{u} ran into {0} ${MET_AT[BUMP.on]} ${end}`, [r.name, placeName(g, w, g.player.loc)], [r.avatar], g.player.loc, 'meet');

export function bumpHtml(): string {
    const g = game(); const w = g && getWorld(g.world);
    const r = g && BUMP.who ? g.cast[BUMP.who] : null;
    if (!g || !w || !r || state.view !== 'scene' || BUMP.at !== g.player.loc) return '';
    const name = r.met ? r.name : tr('Someone');
    if (BUMP.come) return `<div class="mu-bump" role="dialog"><img src="${esc(thumb(r.avatar))}" alt="">
        <div><b data-notr>${esc(name)}</b><p>${r.met ? 'They come over to you.' : 'Someone here comes over to you.'}</p></div>
        <div class="mu-bump-btns"><button class="mu-primary" data-act="come-talk">Talk</button><button class="mu-ghost" data-act="come-nod">Nod and keep going</button></div></div>`;
    return `<div class="mu-bump" role="dialog"><img src="${esc(thumb(r.avatar))}" alt="">
        <div><b data-notr>${esc(name)}</b><p>${r.met ? (BUMP.on ? MET_ON[BUMP.on] : 'You run into each other here.') :'Someone you do not know yet crosses your path.'}</p></div>
        <div class="mu-bump-btns"><button class="mu-primary" data-act="bump-talk">Stop and talk</button><button data-act="bump-greet">Say hi and move on</button><button class="mu-ghost" data-act="bump-ignore">Ignore</button></div></div>`;
}

Object.assign(ACT, {
    // someone here came over: they speak first (the AI is told they came over on their own), and while you talk they're
    // with you (sim/social.ts)
    'come-talk': async () => {
        const g = game(); const r = g && g.cast[BUMP.who];
        if (state.generating) { toast('Wait until they finish speaking.', 'info'); return; }
        dropBump();
        if (!g || !r) return notify();
        stayHere(g, r.avatar, g.player.loc, TALK_MINUTES);
        markMet(g, r.avatar);
        talkedWith(g, r.avatar);
        saveGame(); await syncScene(); notify();
        setAsk(`[${r.name} has just come over to {{user}} on their own, to talk. Write ${r.name} speaking first: a natural opening, in the scene.]`);
        await replyAs(r.avatar);
    },
    // nodding back costs nothing: they go back to what they were doing
    'come-nod': () => { dropBump(); notify(); },
    'bump-talk': async () => {
        const g = game(); const w = g && getWorld(g.world); const r = g && g.cast[BUMP.who];
        BUMP.who = '';
        if (!g || !w || !r) { BUMP.on = ''; return notify(); }
        // they stay here a while to talk (an hour), but do not follow you: leave, and they are still here
        stayHere(g, r.avatar, g.player.loc, TALK_MINUTES);
        markMet(g, r.avatar);   // stopping to talk: now you know each other
        talkedWith(g, r.avatar);
        metNote(g, w, r, 'and stopped to talk.');
        BUMP.on = '';
        saveGame(); await syncScene(); notify();
    },
    'bump-greet': () => {
        const g = game(); const w = g && getWorld(g.world); const r = g && g.cast[BUMP.who];
        BUMP.who = '';
        if (g && w && r) {
            if (r.met) { addBond(g, r.avatar, 2); metNote(g, w, r, 'and said hi.'); }
            else markMet(g, r.avatar);   // a hello is enough to know each other's name
            saveGame();
        }
        BUMP.on = '';
        notify();
    },
    'bump-ignore': () => { const g = game(); if (g && BUMP.who && g.cast[BUMP.who]?.met) feel(g, BUMP.who, 'A bit hurt you ignored them', 1); BUMP.who = ''; BUMP.on = ''; notify(); },
});
