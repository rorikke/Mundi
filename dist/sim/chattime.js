// Time passes as you talk: every line you send in the scene is a few game minutes, more for a longer line, within a
// range set per save (This world → Rules › Time, or This Home › Home). The minutes are added once the reply is done,
// so the scene doesn't change under a reply being written; a line sent again word for word adds nothing.
import { game, saveGame, cfg, toast, state, clockMode } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { advance } from './time.js';
import { sceneAct } from './actions.js';
import { fpOf, textOf } from './msglog.js';
export const CHAT_MIN = 2, CHAT_MAX = 5, CHAT_TOP = 15;
// a line this short (in words) is the fewest minutes, this long or longer the most
const SHORT = 10, LONG = 100;
// lines remembered, so sending one again isn't counted twice
const SEEN = 40;
export const perMessage = (g) => cfg(g).perMessage !== false;
const clampMin = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(CHAT_TOP, n)) : d; };
/** The minutes a line is worth, shortest to longest (the longest never below the shortest). */
export function chatRange(g) {
    const lo = clampMin(cfg(g).msgMin, CHAT_MIN);
    return [lo, Math.max(lo, clampMin(cfg(g).msgMax, CHAT_MAX))];
}
/** How many minutes a line of `words` words is worth. */
export function chatMinutes(g, words) {
    const [lo, hi] = chatRange(g);
    const t = Math.max(0, Math.min(1, (words - SHORT) / (LONG - SHORT)));
    return Math.round(lo + (hi - lo) * t);
}
const wordsOf = (text) => (text.match(/\S+/g) ?? []).length;
// Talking moves the clock only in the scene, with the clock off (a running clock already moves) and no action going on
// (it moves its own clock with each line, sim/actions.ts).
const counts = (g) => perMessage(g) && clockMode(g) !== 'live' && state.view === 'scene' && !sceneAct(g);
let pending = 0;
/** A line you sent (SillyTavern's MESSAGE_SENT): its minutes wait for the reply to end. Returns them (0: none). */
export function chatSent(g, m) {
    if (!counts(g))
        return 0;
    const fp = fpOf(m), seen = (g.chatSeen ??= []);
    if (seen.includes(fp))
        return 0;
    seen.push(fp);
    if (seen.length > SEEN)
        seen.splice(0, seen.length - SEEN);
    const n = chatMinutes(g, wordsOf(textOf(m)));
    pending += n;
    saveGame();
    return n;
}
/** The reply ended (or was stopped, or never came and you send again): the waiting minutes pass. Returns whether any did. */
export async function chatSettle() {
    const n = pending;
    pending = 0;
    const g = game();
    const w = g && getWorld(g.world);
    if (!n || !g || !w || clockMode(g) === 'live' || sceneAct(g))
        return false;
    advance(g, w, n).forEach(x => toast(x, 'warn'));
    const { runPlans } = await import('../ui/plans.js');
    runPlans();
    const { syncScene } = await import('./game.js');
    await syncScene();
    saveGame();
    return true;
}
