// Doing something at a place (E14): its price and needs, the time it takes, its roll, then one of its weighted
// outcomes (its own, or a row of one of the world's shared tables told in its own words, like an omikuji), the keepsake
// it leaves, the time together with whoever is with you, the fact that's remembered, and a line telling the AI what
// just happened. ui/map.ts runs it once the waiting screen is done; the tests run it as is.
// (E14.6) An action can also be played out in the scene: it starts at once (price and needs), becomes the scene's
// focus while the clock runs (a step with each line you send, or the live clock), and ends once its time is up, with
// the same results; its time passes once, whatever moved the clock. ui/sceneact.ts is its screen side.
import { nowAbs, toast, clockMode, type Save } from '../core/store.js';
import { isScenario, systemOn, type WorldDef, type ActionDef, type ActionOutcome, type RollOutcome } from '../core/world.js';
import { setPrompt } from '../st/bridge.js';
import { applyAction, addStatus, money } from './needs.js';
import { advance } from './time.js';
import { rollAction, gradeName, type RollResult } from './dice.js';
import { afterAction } from './life.js';
import { afterEvent } from './cityevents.js';
import { practice } from './hobbies.js';
import { payOf, priceOf } from './bills.js';
import { book } from './ledger.js';
import { facts, note, placeName, toldAs } from './facts.js';
import { whenHolds, markDone, doneToday } from './when.js';
import { withYou, doneTogether, feelsFrom, addKeepsake, keepsakeDef, type TogetherGain } from './social.js';
import { playerHomeId } from './places.js';
import { presentAt } from './people.js';
import { startRumor } from './living.js';
import { onLook } from './hooks.js';

export interface ActionLine { text: string; kind: 'success' | 'warn' | 'info' }
/** What doing an action came to: messages for the screen, the roll, the outcome drawn, the keepsake, who was with
 *  you and what it did between you, and the line for the AI. */
export interface ActionDone { lines: ActionLine[]; roll: RollResult | null; outcome: ActionOutcome | null; keepsake: string | null; with: string[]; together: TogetherGain[]; ai: string }

// The outcomes an action can draw from: its own, or (E14) a shared table's rows in this action's words.
export function outcomesOf(w: WorldDef, a: ActionDef): ActionOutcome[] {
    if (!a.table) return a.outcomes ?? [];
    return (w.tables?.[a.table] ?? []).map(r => { const x = a.words?.[r.id]; return typeof x === 'string' ? { ...r, text: x } : x ? { ...r, ...x } : r; });
}
// One of the outcomes whose own condition holds, by weight.
export function drawOutcome(g: Save, w: WorldDef, a: ActionDef, place: string, rnd = Math.random): ActionOutcome | null {
    const list = outcomesOf(w, a).filter((o, i) => !o.when || whenHolds(g, w, o.when, { place, id: a.id, key: `${a.id}#${i}` }));
    const total = list.reduce((s, o) => s + Math.max(0, o.weight ?? 0), 0);
    if (!list.length || !(total > 0)) return null;
    let x = rnd() * total;
    for (const o of list) { x -= Math.max(0, o.weight ?? 0); if (x < 0) return o; }
    return list[list.length - 1];
}
// An outcome's money and needs (money after the difficulty, as a roll's is); returns the money it made or cost.
function applyOutcome(g: Save, w: WorldDef, a: ActionDef, o: RollOutcome): number {
    const raw = o.money ?? 0;
    const cash = raw > 0 ? payOf(g, raw) : -priceOf(g, -raw);
    if (cash) { g.player.money = Math.max(0, g.player.money + cash); book(g, a.name, cash); }
    for (const [id, v] of Object.entries(o.effects ?? {})) addStatus(g, w, id, v);
    return cash;
}
// How a result changes some of the world's people's feelings. `feelsDaily`: a gain toward someone counts the first
// time that day this action gives one (playing pachinko next to Kaito all afternoon is one "this one's due"); the
// text is still told, and a loss always counts.
function resultFeels(g: Save, w: WorldDef, a: ActionDef, o: RollOutcome | null | undefined, place: string) {
    if (!o?.feels) return;
    if (!o.feelsDaily) { feelsFrom(g, w, o.feels); return; }
    const key = (name: string) => `feels:${a.id}:${name}`;
    const now = Object.fromEntries(Object.entries(o.feels).filter(([name, n]) => n < 0 || !doneToday(g, key(name))));
    for (const [name, n] of Object.entries(now)) if (n > 0) markDone(g, key(name), place);
    feelsFrom(g, w, now);
}
const names = (g: Save, list: string[]) => { const n = list.map(a => g.cast[a]?.name ?? '').filter(Boolean); return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n.at(-1)}` : n[0] ?? ''; };
const cashText = (w: WorldDef, cash: number) => (cash ? ` (${cash > 0 ? '+' : '−'}${money(w, Math.abs(cash))})` : '');

/** Does an action, everything after the waiting screen. `rnd` for the roll and the outcome (tests). */
export function doAction(g: Save, w: WorldDef, a: ActionDef, rnd = Math.random): ActionDone {
    const mates = a.together ? withYou(g, w) : [];
    const last = facts(g).at(-1)?.id;
    const lines: ActionLine[] = [];
    applyAction(g, w, a);
    advance(g, w, a.minutes).forEach(m => lines.push({ text: m, kind: 'warn' }));
    return results(g, w, a, { place: g.player.loc, mates, last, lines, rnd });
}

// What came of an action once its time has passed: the roll, an outcome, feelings, a rumor, a keepsake, the time
// together, the fact and the AI's line. `last`: the newest fact before it began (a roll or an event that wrote its
// own fact means no plain one); `ended`: it was played out in the scene.
function results(g: Save, w: WorldDef, a: ActionDef, o: { place: string; mates: string[]; last?: string; lines: ActionLine[]; rnd: () => number; ended?: boolean }): ActionDone {
    const { place: loc, mates, last, lines, rnd } = o;
    const where = placeName(g, w, loc), home = loc === playerHomeId;
    const roll = rollAction(g, w, a, rnd);
    const ok = roll ? roll.grade.includes('success') : null;
    afterAction(g, w, a, ok).forEach(m => lines.push({ text: m, kind: 'success' }));
    afterEvent(g, w, a);
    practice(g, w, a, ok, roll?.grade === 'critical-success').forEach(m => lines.push({ text: m, kind: 'success' }));
    // what came of it: the roll's result, then one of the outcomes
    const res = roll && a.roll ? (ok ? a.roll.success : a.roll.fail) : null;
    const outcome = drawOutcome(g, w, a, loc, rnd);
    let said = '';
    if (outcome) {
        const cash = applyOutcome(g, w, a, outcome);
        said = `${outcome.text}${cashText(w, cash)}`;
        if (outcome.text) lines.push({ text: said, kind: 'success' });
    }
    resultFeels(g, w, a, res, loc); resultFeels(g, w, a, outcome, loc);
    // (E31) a rumor it starts among the people here
    for (const t of [res?.rumor, outcome?.rumor]) if (t) startRumor(g, w, t, loc, { you: true, id: `act:${a.id}:${t.slice(0, 24)}` });
    const keep = outcome?.keepsake ?? res?.keepsake ?? a.keepsake ?? null;
    if (keep) { addKeepsake(g, keep); const k = keepsakeDef(w, keep); lines.push({ text: `You keep: ${k.icon} ${k.name}.`, kind: 'success' }); }
    const together = doneTogether(g, w, mates, a.minutes);
    // remembered: its own fact (the outcome's, the roll's, the action's), or a plain one when nothing else wrote one
    const own = outcome?.fact ?? res?.fact ?? a.fact;
    const withWho = mates.length ? names(g, mates) : '';
    const t = own ? (mates.length ? own.replace(/(\.?)\s*$/, ' with {1}$1') : own)
        : facts(g).at(-1)?.id !== last ? '' : home ? (mates.length ? '{u} chose to {0} with {1}.' : '{u} chose to {0}.') : (mates.length ? '{u} chose to {0} at {2} with {1}.' : '{u} chose to {0} at {2}.');
    const args = own ? (mates.length ? [where, withWho] : [where]) : [a.label.toLowerCase(), withWho, where];
    // (the same thing twice in a day at the same place is one fact)
    if (t && !facts(g).some(f => f.place === loc && f.t === t && JSON.stringify(f.a) === JSON.stringify(args) && Math.floor(f.at / 1440) === g.day)) note(g, t, args, mates, loc, 'action');
    markDone(g, a.id, loc);
    return { lines, roll, outcome, keepsake: keep, with: mates, together, ai: actionLine(g, w, a, roll, said, mates, o.ended) };
}

// What the AI is told just happened. It only tells the story of what the engine decided. `ended`: an action played out
// in the scene has just ended, so the reply tells how.
export function actionLine(g: Save, w: WorldDef, a: ActionDef, roll: RollResult | null, said: string, mates: string[], ended = false): string {
    const label = a.label.toLowerCase();
    const who = mates.length ? `{{user}} and ${names(g, mates)}` : '{{user}}';
    const why = mates.length && a.together?.text ? ` (${a.together.text.replace(/[.\s]+$/, '')})` : '';
    const what = roll ? `${who} tried to ${label}${why}: ${gradeName(roll.grade).toLowerCase()}. ${toldAs(roll.text)}` : `${who} chose to ${label}${why}.`;
    const then = said ? ` ${toldAs(said)}` : '';
    const tail = ended ? 'That is how it ended: narrate the end of it, in the scene; do not change the outcome.' : isScenario(w) ? 'Narrate how it goes, in the scene.' : 'Narrate it in that light if it comes up.';
    return `[Just now ${what}${then} ${tail}]`;
}

/* ---------- played out in the scene (E14.6) ---------- */

/** An action going on in the scene: the action as it was offered (its price already paid), where, from when until
 *  when (absolute game minutes), who was with you, and the lines you sent while it ran (fingerprints, sim/msglog.ts:
 *  a line moves its clock once). */
export interface SceneAct { a: ActionDef; place: string; start: number; until: number; with: string[]; lines: string[] }
export const sceneAct = (g: Save): SceneAct | undefined => (g as any).act ?? undefined;
// `min`: the shortest action a world's `scene.actions` plays out (a ten-minute omikuji is just done); `lines`: about
// how many of your lines it lasts; `step`: the clock moves in steps of this many minutes.
export const SCENE_ACT = { min: 20, lines: 3, step: 5 };

/** Is this action played out in the scene? Its own `scene`, else the world's `scene.actions` when it takes a while and
 *  someone you've met is here. Never an outing, never in a Home, and only with the living world on (off: everything is
 *  done off-screen, as before). */
export function playsInScene(g: Save, w: WorldDef, a: ActionDef): boolean {
    if (a.scene === false || a.outing || isScenario(w) || !systemOn(w, 'living')) return false;
    if (a.scene) return true;
    return !!w.scene?.actions && a.minutes >= SCENE_ACT.min && presentAt(g, w, g.player.loc).some(r => r.met);
}

/** Starts an action in the scene: its price and needs now, then it's the scene's focus until its time is up. (The
 *  screen finishes one that's going on first.) */
export function startSceneAction(g: Save, w: WorldDef, a: ActionDef): SceneAct {
    applyAction(g, w, a);
    const now = nowAbs(g);
    const act: SceneAct = { a, place: g.player.loc, start: now, until: now + Math.max(0, a.minutes), with: a.together ? withYou(g, w) : [], lines: [] };
    (g as any).act = act;
    markDone(g, a.id, act.place);   // done today (`daily`, `after`) from the moment it starts
    setPrompt('mundi_roll', '');   // an earlier action's "just now" is over
    return act;
}

/** Minutes left of the action going on. */
export const sceneActLeft = (g: Save) => { const act = sceneAct(g); return act ? Math.max(0, act.until - nowAbs(g)) : 0; };
// How far one of your lines moves its clock: its time over about `lines` lines, in whole steps.
export const stepOf = (a: ActionDef) => Math.max(SCENE_ACT.step, Math.round(a.minutes / SCENE_ACT.lines / SCENE_ACT.step) * SCENE_ACT.step);

/** A line you sent while the action goes on (`fp`: its fingerprint): the clock moves one step (never past the
 *  action's end, and not with the live clock, which runs by itself), and once its time is up it ends. A line already
 *  counted moves nothing. Returns what the clock brought and how it ended, if it did. */
export function sceneActStep(g: Save, w: WorldDef, fp = '', rnd = Math.random): { lines: string[]; done: ActionDone | null } | null {
    const act = sceneAct(g);
    if (!act || g.player.loc !== act.place || (fp && act.lines.includes(fp))) return null;
    if (fp) act.lines.push(fp);
    const n = clockMode(g) === 'live' ? 0 : Math.min(stepOf(act.a), sceneActLeft(g));
    const lines = n > 0 ? advance(g, w, n) : [];
    lines.forEach(m => toast(m, 'warn'));
    const done = sceneAct(g) === act && nowAbs(g) >= act.until ? finishSceneAction(g, w, { rnd }) : null;
    return { lines, done };
}

/** Ends the action going on: what's left of its time passes (`rest`, while you're still there), then its results (the
 *  roll, an outcome, the keepsake, time together with whoever is still with you, the fact), told on the screen and to
 *  the AI. `judge`: the scene so far is judged once the reply that tells the end has come (sim/msglog.ts); leaving and
 *  sleeping judge it themselves. */
export function finishSceneAction(g: Save, w: WorldDef, { rest = true, judge = true, rnd = Math.random } = {}): ActionDone | null {
    const act = sceneAct(g);
    if (!act) return null;
    delete (g as any).act;   // first: the clock below may look at the scene again
    const there = g.player.loc === act.place;
    const last = facts(g).at(-1)?.id;
    const lines: ActionLine[] = [];
    const left = Math.max(0, act.until - nowAbs(g));
    if (rest && there && left > 0) advance(g, w, left).forEach(m => lines.push({ text: m, kind: 'warn' }));
    const mates = there ? act.with.filter(a => withYou(g, w).includes(a)) : [];
    const done = results(g, w, act.a, { place: act.place, mates, last, lines, rnd, ended: true });
    done.lines.forEach(l => toast(l.text, l.kind));
    if (done.roll) toast(`${gradeName(done.roll.grade)} — ${done.roll.text}`, done.roll.grade.includes('success') ? 'success' : 'warn');
    else if (!done.outcome) toast(`${act.a.name}: done.`, 'success');
    if (there) setPrompt('mundi_roll', done.ai);
    if (judge && there) (g as any).actJudge = nowAbs(g);
    return done;
}

// The scene's focus while it goes on: what they're doing, for about how long, and that the game decides how it ends.
export function sceneActLine(g: Save, w: WorldDef): string {
    const act = sceneAct(g);
    if (!act || g.player.loc !== act.place) return '';
    const mates = act.with.filter(a => presentAt(g, w, act.place).some(r => r.avatar === a));
    const who = mates.length ? `{{user}} and ${names(g, mates)}` : '{{user}}';
    const why = mates.length && act.a.together?.text ? ` (${act.a.together.text.replace(/[.\s]+$/, '')})` : '';
    const left = sceneActLeft(g);
    return `Scene focus: ${who} chose to ${act.a.label.toLowerCase()} and ${mates.length ? 'are' : 'is'} doing it now${why}${left ? `, for about ${left} more minutes` : ''}. Play the scene around it; the game decides how it turns out, so do not end it or tell how it went.`;
}

// After anything changed: an action whose time has passed (a time skip, the live clock) ends, with nothing more added
// to the clock; so does one you're no longer at (you were moved away).
export function lookSceneAction(g: Save, w: WorldDef) {
    const act = sceneAct(g);
    if (act && (nowAbs(g) >= act.until || g.player.loc !== act.place)) finishSceneAction(g, w, { rest: false });
}
onLook.push((g, w) => lookSceneAction(g, w));
