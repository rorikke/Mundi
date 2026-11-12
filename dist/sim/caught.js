// Getting caught (adult content, Tokyo's adult progression): a private action with a `risk` is done where it shouldn't
// be, and the engine rolls whether you were seen. Not caught: the action plays as usual and the thrill of it adds a
// little mood and fills Desire. Caught: you leave at once (it doesn't play: nothing of the action is done), mood down,
// the action's fee where it has one, the place won't serve you for a week, a rumor about you and who was with you when
// someone was there to see, and a warning at work when it was your own workplace. A work choice can carry a `risk` too
// (the esthe's "a little more"): caught, it's a raid, the job's place shuts for a week, a warning, a rumor, and the
// second time you're let go. The `risk` effects (Shameless a little more, a perk less) read through `riskRoll` in
// sim/dice.ts. Everything goes through the hooks in sim/hooks.ts; nothing here does anything with adult content off.
import { adultOn, nowAbs } from '../core/store.js';
import { isScenario } from '../core/world.js';
import { privateChecks, privateResults, actionGates, onDay } from './hooks.js';
import { riskRoll } from './dice.js';
import { addStatus, statusDef, money } from './needs.js';
import { tallyEvent } from './tally.js';
import { priceOf } from './bills.js';
import { book } from './ledger.js';
import { note, placeName } from './facts.js';
import { presentAt } from './people.js';
import { startCaughtRumor } from './living.js';
import { whoJoins, matchIn, limitsOf } from './private.js';
import { myJob, jobPlace, shiftOn, addPerf, jobTags } from './work.js';
import { personaName } from '../st/bridge.js';
/** What getting caught costs, and what not getting caught gives. */
export const CAUGHT = {
    mood: -5, // caught: you leave embarrassed
    days: 7, // the place won't serve you (a raid shuts the job's place) this long
    thrillMood: 4, // not caught: the thrill (and Desire full)
    atWork: -10, // caught at your own workplace: performance, with a warning on record
};
/** Why a place won't serve you: what the screen says next to the actions it leaves out. */
export const BAN_WORDS = "They won't serve you here this week.";
/** The id of the outcome a caught action ends with (`ActionDone.outcome.id`), so a screen can draw its notice. */
export const CAUGHT_ID = 'caught';
export const isCaught = (done) => done?.outcome?.id === CAUGHT_ID;
const state = (g) => { const c = (g.caught ??= {}); c.bans ??= {}; return c; };
const names = (g, list) => { const n = list.map(a => g.cast[a]?.name ?? '').filter(Boolean); return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n.at(-1)}` : n[0] ?? ''; };
/** The place won't serve you for `days` (a later ban only lengthens it). */
export function banPlace(g, place, days = CAUGHT.days) {
    if (!place)
        return;
    const c = state(g);
    c.bans[place] = Math.max(c.bans[place] ?? 0, nowAbs(g) + days * 1440);
}
/** Until when a place won't serve you (absolute minutes), or null when it does. */
export const bannedUntil = (g, place) => { const u = g.caught?.bans?.[place]; return u !== undefined && u > nowAbs(g) ? u : null; };
/** Every place that won't serve you now, with the days left (rounded up), for a screen. Nothing with adult content off. */
export function bansNow(g) {
    if (!adultOn(g))
        return [];
    return Object.entries(g.caught?.bans ?? {}).filter(([p]) => bannedUntil(g, p) !== null)
        .map(([place, until]) => ({ place, until: until, days: Math.max(1, Math.ceil((until - nowAbs(g)) / 1440)) }));
}
/** The ban where you are now, for the screen that shows a place's actions: the words, until when, the days left; null when
 *  the place serves you (or with adult content off). */
export function banHere(g) {
    const b = bansNow(g).find(x => x.place === g.player.loc);
    return b ? { text: BAN_WORDS, until: b.until, days: b.days } : null;
}
/** Lifts a ban (Quiet a rumor about it does): true when there was one. */
export function liftBan(g, place) {
    const c = state(g);
    if (bannedUntil(g, place) === null)
        return false;
    delete c.bans[place];
    return true;
}
// Where you're banned, what's private or risky is left out, and so is everything you'd pay for ("won't serve you").
actionGates.push((g, _w, a) => {
    if (!adultOn(g) || !bannedUntil(g, g.player.loc))
        return '';
    return a.private || (a.risk ?? 0) > 0 || a.cost > 0 ? BAN_WORDS : '';
});
onDay.push(g => {
    const c = g.caught;
    if (c)
        for (const p of Object.keys(c.bans ?? {}))
            if (bannedUntil(g, p) === null)
                delete c.bans[p];
    return [];
});
/* ---------- caught at your own workplace ---------- */
const atMyWork = (g, w, place) => { const o = myJob(g, w); return !!o && !!place && jobPlace(g, o) === place; };
// A warning at work: performance down (it may bring its own consequences when low), and a warning on record.
function workWarning(g, w, perf) {
    const o = myJob(g, w), j = g.player.job;
    if (!o || !j)
        return [];
    const out = [`Your boss had a word with you about it at ${o.name}: a warning.`];
    out.push(...addPerf(g, w, perf));
    const again = g.player.job;
    if (again && !again.warn)
        again.warn = 1;
    note(g, '{u} got a warning at work ({0}).', [o.name], [], o.place, 'work');
    return out;
}
/* ---------- a risky action: caught, or the thrill ---------- */
// What the AI is told when you were caught: it happens, they leave at once, and nothing more.
function caughtLine(g, a, who, where) {
    const label = a.label.toLowerCase(), people = names(g, who), setting = a.together?.text ? ` (${a.together.text.replace(/[.\s]+$/, '')})` : '';
    return `[Just now ${people ? `{{user}} and ${people}` : '{{user}}'} were about to ${label} at ${where}${setting}, but someone came by and saw them. They leave at once, embarrassed, and nothing more happens there. Narrate it briefly, in that light; nobody is hurt.]`;
}
/** The action is caught: nothing of it plays. Returns what came of it instead (the caught outcome). */
function caught(g, w, x, who) {
    const a = x.a, where = placeName(g, w, x.place), me = personaName(), lines = [];
    const say = (text) => lines.push({ text, kind: 'warn' });
    say('Someone saw you. You leave at once.');
    addStatus(g, w, 'mood', CAUGHT.mood);
    // the fee, taken from what you have
    const fee = Math.min(g.player.money, Math.max(0, priceOf(g, Math.max(0, Number(a.fee) || 0))));
    if (fee > 0) {
        g.player.money -= fee;
        book(g, `${a.name}: fee`, -fee);
        say(`You pay a fee of ${money(w, fee)}.`);
    }
    banPlace(g, x.place);
    say(`${where} won't serve you for ${CAUGHT.days} days.`);
    // someone must have been there to see who it was (one of the world's people, not one of you)
    const seen = presentAt(g, w, x.place).some(r => !x.with.includes(r.avatar));
    const text = `${me}${who.length ? ` and ${names(g, who)}` : ''} ${who.length ? 'were' : 'was'} caught being intimate at ${where}.`;
    const rumor = startCaughtRumor(g, w, text, x.place, { with: who, id: `caught:${a.id}:${nowAbs(g)}`, caught: x.place, seen });
    if (rumor)
        say('Word may get around.');
    if (atMyWork(g, w, x.place))
        workWarning(g, w, CAUGHT.atWork).forEach(say);
    note(g, who.length ? '{u} and {0} were caught at {1}.' : '{u} was caught at {1}.', [names(g, who), where], who, x.place, 'action');
    tallyEvent(g, 'caught', 1, who[0]);
    const first = lines[0].text;
    return { lines, roll: null, outcome: { id: CAUGHT_ID, weight: 0, text: first }, keepsake: null, with: who, together: [], ai: caughtLine(g, a, who, where) };
}
privateChecks.push((g, w, x) => {
    if (!adultOn(g) || isScenario(w) || !((x.a.risk ?? 0) > 0))
        return;
    // it only matters when it would happen: someone takes part (or it needs nobody), and no hard limit stops it first
    // (sim/private.ts decides both; asked here so the order the checks run in doesn't matter)
    const who = whoJoins(g, w, x.with);
    if (!who.length && x.a.together?.needed)
        return;
    if (who.some(p => matchIn(g, x.a.matches, limitsOf(g, p))))
        return;
    if (riskRoll(g, w, x.a, x.rnd).caught) {
        x.stop = caught(g, w, x, who);
        return;
    }
    x.notes.risky = true;
    x.notes.riskWith = who;
});
// Not caught: it counts as a risky moment, and the thrill is worth a little mood and Desire full.
privateResults.push((g, w, x, done) => {
    if (!x.notes.risky)
        return;
    const who = x.notes.riskWith ?? [];
    tallyEvent(g, 'risky', 1, who[0]);
    addStatus(g, w, 'mood', CAUGHT.thrillMood);
    const d = statusDef(w, 'desire');
    if (d)
        addStatus(g, w, 'desire', d.max);
    done.lines.push({ text: 'Nobody noticed, and the thrill stays with you.', kind: 'success' });
    done.ai = done.ai.replace(/\]$/, ' They were nearly seen, and the risk was part of the thrill; nobody noticed.]');
});
/* ---------- a risky choice at work: a raid ---------- */
const RAID_AGAIN = 4 * 90; // a raid this many days old (about a year) is forgotten: the first one again
/** A work result with a `risk` (the esthe's "a little more"): rolled as an action's is. Caught, it's a raid: the job's place
 *  shuts for a week (no shifts, no pay, no absence), a warning, a rumor, mood down, and the second time (within a year, in
 *  the same job) you're let go. Not caught: counted as a risky moment. Returns what to tell. */
export function workRisk(g, w, o, r, rnd = Math.random) {
    const risk = Number(r.risk), j = g.player.job;
    if (!adultOn(g) || !(risk > 0) || !j)
        return [];
    if (!riskRoll(g, w, { id: o.id, tags: ['work', ...jobTags(g, o)], risk }, rnd).caught) {
        tallyEvent(g, 'risky');
        return [];
    }
    const out = [], c = state(g), place = jobPlace(g, o);
    const raids = c.raids && c.raids.job === o.id && g.day - c.raids.day < RAID_AGAIN ? c.raids.n : 0;
    c.raids = { job: o.id, n: raids + 1, day: g.day };
    tallyEvent(g, 'caught');
    addStatus(g, w, 'mood', CAUGHT.mood);
    out.push(`${o.name} was raided. Everything is shut for ${CAUGHT.days} days.`);
    // the week's shifts don't happen and don't count against you
    const off = (j.off ??= {});
    for (let d = g.day; d < g.day + CAUGHT.days; d++) {
        const s = shiftOn(g, w, o, d);
        if (s && !(j.worked ?? []).includes(d) && !off[d])
            off[d] = 'closed';
    }
    banPlace(g, place);
    const where = placeName(g, w, place) || o.name;
    startCaughtRumor(g, w, `${personaName()} was at ${where} when it was raided.`, place, { id: `raid:${o.id}:${nowAbs(g)}` });
    if (raids >= 1) {
        g.player.job = null;
        delete c.raids;
        note(g, '{u} was let go ({0}).', [o.name], [], place, 'work');
        out.push(`You were let go from ${o.name} after the second raid.`);
        return out;
    }
    j.warn = Math.max(j.warn ?? 0, 1);
    note(g, '{u} got a warning at work ({0}).', [o.name], [], place, 'work');
    out.push('A warning at work: another raid and you are out.');
    return out;
}
