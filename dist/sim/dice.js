import { payOf, priceOf } from './bills.js';
import { addStatus, money, restGain } from './needs.js';
import { book } from './ledger.js';
import { traitsOf } from './work.js';
import { note } from './facts.js';
import { addXp } from './rpg.js';
import { hobbyFor, hobbyPay, levelOf } from './hobbies.js';
import { effectAdd } from './effects.js';
import { groupsOf } from '../core/goals.js';
import { useReroll } from './perks.js';
import { tallyRoll } from './tally.js';
import { getWorld, isScenario } from '../core/world.js';
// The one bonus every roll gets (an action, a street story's choice, a choice at work): +1 for every 2 levels of its
// skill, −2 each for very low energy and very low mood, the traits a custom world lists (+2 each), and what the
// effects add (traits, life goals' perks, boosts: aimed at the skill, its group such as `creative`, or a tag).
export function rollBonus(g, w, r) {
    const mine = traitsOf(g);
    let bonus = (r.traits ?? []).filter(t => mine.includes(t)).length * 2;
    if (r.skill)
        bonus += Math.floor(levelOf(g, r.skill) / 2);
    bonus += effectAdd(g, w, 'roll', [r.skill, ...groupsOf(r.skill), ...(r.tags ?? [])]);
    if ((g.player.stats.energy ?? 100) <= 20)
        bonus -= 2;
    if ((g.player.stats.mood ?? 100) <= 20)
        bonus -= 2;
    return bonus;
}
/** The die of a roll against `dc` with `bonus`: a natural 20 always works, a natural 1 always fails. A failed one is
 *  rolled again once a day per `reroll` effect (the second die stands); with none, one die is rolled, as always. */
export function rollD20(g, w, bonus, dc, rnd = Math.random) {
    const d = 1 + Math.floor(rnd() * 20);
    return d === 20 || (d > 1 && d + bonus >= dc) || !useReroll(g, w) ? d : 1 + Math.floor(rnd() * 20);
}
/** " + 3" / " − 2" after the die on the screen ('' for nothing). */
export const bonusLabel = (b) => (b ? ` ${b > 0 ? '+' : '−'} ${Math.abs(b)}` : '');
// An action's roll: the skill it names, else the one it trains (the hobby it belongs to, or `trains`).
export const actionRoll = (w, a) => ({ skill: a.roll?.skill ?? hobbyFor(w, a)?.id, traits: a.roll?.traits, tags: a.tags });
export const bonusFor = (g, a) => { const w = getWorld(g.world); return rollBonus(g, w, actionRoll(w, a)); };
// The chance of success shown before trying (a natural 1 always fails, a natural 20 always works).
export function chanceOf(g, a) {
    if (!a.roll)
        return 100;
    const b = bonusFor(g, a);
    let ok = 0;
    for (let d = 1; d <= 20; d++)
        if (d === 20 || (d > 1 && d + b >= a.roll.dc))
            ok++;
    return ok * 5;
}
export function rollAction(g, w, a, rnd = Math.random) {
    const r = a.roll;
    if (!r || isScenario(w))
        return null; // Home: no checks, what you do just happens (the AI tells how)
    const bonus = bonusFor(g, a);
    const d20 = rollD20(g, w, bonus, r.dc, rnd);
    const total = d20 + bonus;
    const grade = d20 === 1 ? 'critical-fail' : d20 === 20 ? 'critical-success' : total >= r.dc ? 'success' : 'fail';
    const ok = grade === 'success' || grade === 'critical-success';
    if (ok)
        tallyRoll(g, actionRoll(w, a).skill, a.id);
    const out = ok ? r.success : r.fail;
    const mult = grade === 'critical-success' || grade === 'critical-fail' ? 2 : 1;
    const raw = Math.round((out.money ?? 0) * (grade === 'critical-success' ? 2 : 1) * ((out.money ?? 0) > 0 ? hobbyPay(g, w, a) : 1));
    const cash = raw > 0 ? payOf(g, raw) : -priceOf(g, -raw); // the difficulty
    if (cash) {
        g.player.money = Math.max(0, g.player.money + cash);
        book(g, a.name, cash);
    }
    for (const [id, v] of Object.entries(out.effects ?? {})) {
        const x = v * ((v < 0 && grade === 'critical-fail') || (v > 0 && grade === 'critical-success') ? mult : 1);
        addStatus(g, w, id, x > 0 ? restGain(g, w, a, id, x) : x);
    }
    const text = `${out.text}${cash ? ` (${cash > 0 ? '+' : '−'}${money(w, Math.abs(cash))})` : ''}`;
    if (ok)
        addXp(g, w, grade === 'critical-success' ? 20 : 10, a.name); // RPG: experience for what you do well
    note(g, ok ? '{u} tried to {0} — it worked. {1}' : '{u} tried to {0} — it did not work. {1}', [a.label.toLowerCase(), out.text], [], g.player.loc, 'skill');
    return { d20, bonus, total, dc: r.dc, grade, text };
}
export const gradeName = (gr) => ({ 'critical-fail': 'Critical failure', fail: 'Failure', success: 'Success', 'critical-success': 'Critical success' })[gr];
