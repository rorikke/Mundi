// Doing something at a place (E14): its price and needs, the time it takes, its roll, then one of its weighted
// outcomes, the keepsake it leaves, the time together with whoever is with you, the fact that's remembered, and a
// line telling the AI what just happened. ui/map.ts runs it once the waiting screen is done; the tests run it as is.
import type { Save } from '../core/store.js';
import { isScenario, type WorldDef, type ActionDef, type ActionOutcome, type RollOutcome } from '../core/world.js';
import { applyAction, addStatus, money } from './needs.js';
import { advance } from './time.js';
import { rollAction, gradeName, type RollResult } from './dice.js';
import { afterAction } from './life.js';
import { afterEvent } from './cityevents.js';
import { practice } from './hobbies.js';
import { payOf, priceOf } from './bills.js';
import { book } from './ledger.js';
import { facts, note, placeName } from './facts.js';
import { whenHolds, markDone } from './when.js';
import { withYou, doneTogether, feelsFrom, addKeepsake, keepsakeDef, type TogetherGain } from './social.js';
import { playerHomeId } from './places.js';
import { startRumor } from './living.js';

export interface ActionLine { text: string; kind: 'success' | 'warn' | 'info' }
/** What doing an action came to: messages for the screen, the roll, the outcome drawn, the keepsake, who was with
 *  you and what it did between you, and the line for the AI. */
export interface ActionDone { lines: ActionLine[]; roll: RollResult | null; outcome: ActionOutcome | null; keepsake: string | null; with: string[]; together: TogetherGain[]; ai: string }

// One of the outcomes whose own condition holds, by weight.
export function drawOutcome(g: Save, w: WorldDef, a: ActionDef, place: string, rnd = Math.random): ActionOutcome | null {
    const list = (a.outcomes ?? []).filter((o, i) => !o.when || whenHolds(g, w, o.when, { place, id: a.id, key: `${a.id}#${i}` }));
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
const names = (g: Save, list: string[]) => { const n = list.map(a => g.cast[a]?.name ?? '').filter(Boolean); return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n.at(-1)}` : n[0] ?? ''; };
const cashText = (w: WorldDef, cash: number) => (cash ? ` (${cash > 0 ? '+' : '−'}${money(w, Math.abs(cash))})` : '');

/** Does an action, everything after the waiting screen. `rnd` for the roll and the outcome (tests). */
export function doAction(g: Save, w: WorldDef, a: ActionDef, rnd = Math.random): ActionDone {
    const loc = g.player.loc, where = placeName(g, w, loc), home = loc === playerHomeId;
    const mates = a.together ? withYou(g, w) : [];
    const last = facts(g).at(-1)?.id;
    const lines: ActionLine[] = [];
    applyAction(g, w, a);
    advance(g, w, a.minutes).forEach(m => lines.push({ text: m, kind: 'warn' }));
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
    feelsFrom(g, w, res?.feels); feelsFrom(g, w, outcome?.feels);
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
    return { lines, roll, outcome, keepsake: keep, with: mates, together, ai: actionLine(g, w, a, roll, said, mates) };
}

// What the AI is told just happened. It only tells the story of what the engine decided.
export function actionLine(g: Save, w: WorldDef, a: ActionDef, roll: RollResult | null, said: string, mates: string[]): string {
    const label = a.label.toLowerCase();
    const who = mates.length ? `{{user}} and ${names(g, mates)}` : '{{user}}';
    const why = mates.length && a.together?.text ? ` (${a.together.text.replace(/[.\s]+$/, '')})` : '';
    const what = roll ? `${who} tried to ${label}${why}: ${gradeName(roll.grade).toLowerCase()}. ${roll.text}` : `${who} chose to ${label}${why}.`;
    const then = said ? ` ${said}` : '';
    return `[Just now ${what}${then} ${isScenario(w) ? 'Narrate how it goes, in the scene.' : 'Narrate it in that light if it comes up.'}]`;
}
