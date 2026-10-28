// An action played out in the scene (E14.6), on the screen: starting it from the things to do, the row that shows it
// going on (click it to finish now), the clock's step with each line you send, and finishing it before you leave,
// sleep or do something else. What it does is in sim/actions.ts.
import { esc, game, toast, notify, saveGame } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { ACT } from './reg.js';
import { sceneAct, sceneActLeft, startSceneAction, sceneActStep, finishSceneAction } from '../sim/actions.js';
import { fpOf } from '../sim/msglog.js';
import { refreshPrompt } from '../sim/prompt.js';
import { syncScene } from '../sim/game.js';
import { runPlans } from './plans.js';
const names = (g, list) => list.map(a => g.cast[a]?.name ?? '').filter(Boolean).join(', ');
/** Starts an action in the scene (one already going on ends first). */
export async function startInScene(g, w, a) {
    if (sceneAct(g))
        finishSceneAction(g, w);
    const act = startSceneAction(g, w, a);
    toast(`${a.label}${act.with.length ? ` with ${names(g, act.with)}` : ''}: it plays out here, about ${a.minutes} min. Keep talking; it ends when its time is up.`, 'info');
    saveGame();
    refreshPrompt(); // the scene's focus
    notify();
}
/** The row at the top of the things to do while an action goes on. */
export function sceneActRow(g, w) {
    const act = sceneAct(g);
    if (!act || act.place !== g.player.loc)
        return '';
    void w;
    const left = sceneActLeft(g);
    return `<button class="mh-act mh-glass is-quest" data-act="act-finish" title="Finish it now (the rest of its time passes)"><i>${esc(act.a.icon ?? '⏳')}</i><b>${esc(act.a.label)}</b><small>Going on${act.with.length ? ` · with <span data-notr>${esc(names(g, act.with))}</span>` : ''} · about ${esc(String(left))} min left · Finish now</small></button>`;
}
/** A line you sent (SillyTavern's MESSAGE_SENT): the clock of the action going on moves one step, and it may end
 *  (then the reply tells how). Returns whether anything changed. */
export async function sceneActTick(m) {
    const g = game();
    const w = g && getWorld(g.world);
    if (!g || !w || !sceneAct(g))
        return false;
    const r = sceneActStep(g, w, fpOf(m));
    if (!r)
        return false;
    runPlans();
    await syncScene(); // who is here now, and the prompt
    saveGame();
    return true;
}
/** Before you leave, sleep or do something else: the action going on ends first (the rest of its time passes).
 *  Leaving and sleeping judge the scene themselves; `judge`: the scene goes on, so it's judged as when it ends. */
export function finishFirst(g, w, judge = false) {
    if (!sceneAct(g))
        return;
    finishSceneAction(g, w, { judge });
    saveGame();
}
Object.assign(ACT, {
    'act-finish': async () => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w || !sceneAct(g))
            return;
        finishSceneAction(g, w);
        runPlans();
        saveGame();
        await syncScene();
        notify();
    },
});
