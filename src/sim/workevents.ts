// The work-event format, shared by jobs (sim/work.ts) and ventures (sim/ventures.ts): which events can come now, a
// choice's roll, and what a result does (performance, money, needs, feelings, a fact, a rumor, a timed boost, a raid's
// risk, and whatever the caller adds: a venture's numbers, an upgrade found). One way to roll, so a shift at work and a
// stint at your own counter play alike.
import { adultOn, type Save } from '../core/store.js';
import type { WorldDef, WorkEvent, WorkChoice, WorkResult } from '../core/world.js';
import { cleanEffects } from '../core/traits.js';
import { BOOST_LIMITS } from '../core/goals.js';
import { whenHolds, personNamed } from './when.js';
import { rollBonus, rollD20, bonusLabel } from './dice.js';
import { tallyRoll } from './tally.js';
import { addStatus, money } from './needs.js';
import { payOf, priceOf } from './bills.js';
import { book } from './ledger.js';
import { bump } from './social.js';
import { note } from './facts.js';
import { startRumor } from './living.js';
import { addBoost } from './perks.js';

/** The events of a list that can come now at this place: adult ones only with adult content on, with choices, and their
 *  condition holding (`key`: the condition's salt for its chances, `work|<event id>` at a job). */
export function eventsReady(g: Save, w: WorldDef, events: WorkEvent[] | undefined, place: string, key: (e: WorkEvent) => string): WorkEvent[] {
    return (events ?? []).filter(e => (!e.adult || adultOn(g)) && e.choices?.length && (!e.when || whenHolds(g, w, e.when, { place, key: key(e) })));
}
/** A choice's roll, if it has one: d20 + the roll bonus (with `tags`: what effects aimed at this kind of roll add)
 *  against its difficulty. `res`: what it leads to (its `fail` when the roll didn't work); `line`: the die for the screen. */
export function rollChoice(g: Save, w: WorldDef, c: WorkChoice, tags: string[], rnd = Math.random): { ok: boolean | null; res: WorkResult; line?: string } {
    if (!c.roll) return { ok: null, res: c };
    const bonus = rollBonus(g, w, { skill: c.roll.skill, tags }), d20 = rollD20(g, w, bonus, c.roll.dc, rnd);
    const ok = d20 === 20 || (d20 > 1 && d20 + bonus >= c.roll.dc);
    if (ok) tallyRoll(g, c.roll.skill);
    return { ok, res: ok ? c : c.fail ?? { text: 'It did not work out.' }, line: `🎲 ${d20}${bonusLabel(bonus)} against ${c.roll.dc}: ${ok ? 'it worked.' : 'it did not work.'}` };
}

/** Where a result lands. `place`: where it happens (facts, rumors); `name`: what a fact calls it; `label`: the bank
 *  ledger's line; `key`: the rumor's and boost's id (`work:<job id>`), `boost` the boost's own. `gentle`: nothing turns
 *  out badly (the gentle work rules). `tips`: what money it gives is multiplied by; `perf`: performance points (−10…10)
 *  as the job takes them; `risk`: a raid's chance rolled (jobs); `more`: what the caller adds (a venture's numbers, an
 *  upgrade found), given the result and the gentle filter. */
export interface ResultCtx {
    place: string; name: () => string; label: string; key: string; boost: string; gentle: boolean;
    tips?: () => number;
    perf?: (n: number) => string[];
    risk?: (r: WorkResult, rnd: () => number) => string[];
    more?: (r: WorkResult, ok: (n: number | undefined) => number) => string[];
}
/** Everything a result does, in order: its text, performance, money, needs, feelings, a fact, a rumor, a boost, the
 *  risk, then the caller's own. Returns the lines for the screen. */
export function applyWorkResult(g: Save, w: WorldDef, r: WorkResult, x: ResultCtx, rnd = Math.random): string[] {
    const out: string[] = [];
    const ok = (n: number | undefined) => (n === undefined ? 0 : x.gentle ? Math.max(0, n) : n);
    if (r.text) out.push(r.text);
    if (ok(r.perf) && x.perf) out.push(...x.perf(ok(r.perf) * 5));
    if (ok(r.money)) { const m = ok(r.money) > 0 ? payOf(g, ok(r.money) * (x.tips ? x.tips() : 1)) : -priceOf(g, -ok(r.money)); g.player.money += m; book(g, x.label, m); out.push(m > 0 ? `+${money(w, m)}` : `−${money(w, -m)}`); }
    for (const [id, v] of Object.entries(r.effects ?? {})) if (ok(v)) addStatus(g, w, id, ok(v));
    for (const [name, v] of Object.entries(r.feels ?? {})) { const who = personNamed(g, name); if (who && ok(v)) bump(g, who.avatar, ok(v)); }
    if (r.fact) note(g, r.fact, [x.name()], [], x.place, 'work');
    if (r.rumor) startRumor(g, w, r.rumor, x.place, { you: true, id: `${x.key}:${r.rumor.slice(0, 24)}` });   // (E31) it goes round from there
    // a timed effect (a ranking's better pay for a week), kept as a boost
    const fx = r.boost ? cleanEffects(r.boost.effects, BOOST_LIMITS).filter(e => !x.gentle || e.value >= 0) : [];
    if (fx.length) addBoost(g, x.boost, fx, r.boost!.days);
    if (r.risk && !x.gentle && x.risk) out.push(...x.risk(r, rnd));   // (adult) caught: a raid
    if (x.more) out.push(...x.more(r, ok));
    return out;
}
/** A choice is offered when its condition holds (`present: Mio`). */
export const choiceOpen = (g: Save, w: WorldDef, c: WorkChoice, place: string, key: string) => !c.when || whenHolds(g, w, c.when, { place, key });
