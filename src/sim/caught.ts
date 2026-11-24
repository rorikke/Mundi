// Getting caught (adult content, Tokyo's adult progression): a private action with a `risk` is done where it shouldn't
// be, and the engine rolls whether you were seen. Not caught: the action plays as usual and the thrill of it adds a
// little mood and fills Desire. Caught: you leave at once (it doesn't play: nothing of the action is done), mood down,
// the action's fee where it has one, the place won't serve you for a week, a rumor about you and who was with you when
// someone was there to see, and a warning at work when it was your own workplace. A work choice can carry a `risk` too
// (the esthe's "a little more"): caught, it's a raid, the job's place shuts for a week, a warning, a rumor, and the
// second time you're let go. The `risk` effects (Shameless a little more, a perk less) read through `riskRoll` in
// sim/dice.ts. At a place that is yours (the museum you own and its rooms, sim/museum.ts through `ownedPlaces`) nobody
// bans you: caught there, someone who works there sees (the world's table `owncaught` says who, and how the one with you
// takes it), word gets around, and that's all; the night guard's rounds double the chance. At a home (yours, theirs, a
// shared house) nobody bans you either: you aren't sent away, and word gets around from the people who live there (else
// the neighbours). Wherever it happens, the people with you may have rows of their own (ExampleCharacter.caught: who saw,
// how they take it, a change in how they feel toward you, the rumor in its own words), drawn instead of the plain line.
// Everything goes through the hooks in sim/hooks.ts; nothing here does anything with adult content off.
import { adultOn, nowAbs, type Save, type Resident, residentsOf } from '../core/store.js';
import { isScenario, systemOn, type WorldDef, type ActionDef, type Occupation, type WorkResult, type CaughtRow } from '../core/world.js';
import { privateChecks, privateResults, actionGates, onDay, ownedPlaces } from './hooks.js';
import type { PrivateCtx, ActionDone, ActionLine } from './actions.js';
import { riskRoll } from './dice.js';
import { addStatus, statusDef, money } from './needs.js';
import { tallyEvent } from './tally.js';
import { priceOf } from './bills.js';
import { book } from './ledger.js';
import { note, placeName } from './facts.js';
import { presentAt } from './people.js';
import { startCaughtRumor } from './living.js';
import { whoJoins, matchIn, limitsOf } from './private.js';
import { myJob, jobPlace, shiftOn, addPerf, jobTags, type JobState } from './work.js';
import { whenHolds } from './when.js';
import { personaName } from '../st/bridge.js';
import { exampleOf } from './dayplan.js';
import { placeOf, playerHomeId, homeKindAt, homeZoneAt } from './places.js';
import { SECOND_HOME_ID } from './housing.js';
import { visitOf } from './visitors.js';
import { gain, lose, YOU } from './rel.js';
import { romanceBlocked } from './family.js';

/** What getting caught costs, and what not getting caught gives. */
export const CAUGHT = {
    mood: -5,               // caught: you leave embarrassed
    days: 7,                // the place won't serve you (a raid shuts the job's place) this long
    thrillMood: 4,          // not caught: the thrill (and Desire full)
    atWork: -10,            // caught at your own workplace: performance, with a warning on record
};
/** Why a place won't serve you: what the screen says next to the actions it leaves out. */
export const BAN_WORDS = "They won't serve you here this week.";
/** The id of the outcome a caught action ends with (`ActionDone.outcome.id`), so a screen can draw its notice. */
export const CAUGHT_ID = 'caught';
export const isCaught = (done: { outcome?: { id?: string } | null } | null | undefined) => done?.outcome?.id === CAUGHT_ID;

/* ---------- the places that won't serve you ---------- */

interface CaughtState { bans: Record<string, number>; raids?: { job: string; n: number; day: number } }
const state = (g: Save): CaughtState => { const c = ((g as any).caught ??= {}) as CaughtState; c.bans ??= {}; return c; };
const names = (g: Save, list: string[]) => { const n = list.map(a => g.cast[a]?.name ?? '').filter(Boolean); return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n.at(-1)}` : n[0] ?? ''; };

/** The place won't serve you for `days` (a later ban only lengthens it). */
export function banPlace(g: Save, place: string, days = CAUGHT.days) {
    if (!place) return;
    const c = state(g);
    c.bans[place] = Math.max(c.bans[place] ?? 0, nowAbs(g) + days * 1440);
}
/** Until when a place won't serve you (absolute minutes), or null when it does. */
export const bannedUntil = (g: Save, place: string): number | null => { const u = (g as any).caught?.bans?.[place] as number | undefined; return u !== undefined && u > nowAbs(g) ? u : null; };
/** Every place that won't serve you now, with the days left (rounded up), for a screen. Nothing with adult content off. */
export function bansNow(g: Save): { place: string; until: number; days: number }[] {
    if (!adultOn(g)) return [];
    return Object.entries((g as any).caught?.bans ?? {}).filter(([p]) => bannedUntil(g, p) !== null)
        .map(([place, until]) => ({ place, until: until as number, days: Math.max(1, Math.ceil(((until as number) - nowAbs(g)) / 1440)) }));
}
/** The ban where you are now, for the screen that shows a place's actions: the words, until when, the days left; null when
 *  the place serves you (or with adult content off). */
export function banHere(g: Save): { text: string; until: number; days: number } | null {
    const b = bansNow(g).find(x => x.place === g.player.loc);
    return b ? { text: BAN_WORDS, until: b.until, days: b.days } : null;
}
/** Lifts a ban (Quiet a rumor about it does): true when there was one. */
export function liftBan(g: Save, place: string): boolean {
    const c = state(g);
    if (bannedUntil(g, place) === null) return false;
    delete c.bans[place];
    return true;
}
// Where you're banned, what's private or risky is left out, and so is everything you'd pay for ("won't serve you").
actionGates.push((g, _w, a) => {
    if (!adultOn(g) || !bannedUntil(g, g.player.loc)) return '';
    return a.private || (a.risk ?? 0) > 0 || a.cost > 0 ? BAN_WORDS : '';
});
onDay.push(g => {
    const c = (g as any).caught as CaughtState | undefined;
    if (c) for (const p of Object.keys(c.bans ?? {})) if (bannedUntil(g, p) === null) delete c.bans[p];
    return [];
});

/* ---------- caught at your own workplace ---------- */

const atMyWork = (g: Save, w: WorldDef, place: string) => { const o = myJob(g, w); return !!o && !!place && jobPlace(g, o) === place; };
// A warning at work: performance down (it may bring its own consequences when low), and a warning on record. (Also
// sim/fame.ts: a coworker who recognized you from adult video.)
export function workWarning(g: Save, w: WorldDef, perf: number): string[] {
    const o = myJob(g, w), j = g.player.job as JobState | null;
    if (!o || !j) return [];
    const out = [`Your boss had a word with you about it at ${o.name}: a warning.`];
    out.push(...addPerf(g, w, perf));
    const again = g.player.job as JobState | null;
    if (again && !again.warn) again.warn = 1;
    note(g, '{u} got a warning at work ({0}).', [o.name], [], o.place, 'work');
    return out;
}

/* ---------- who saw: the rows of the people with you ---------- */

/** (homes) Is this place a home: yours, your second home, someone's (a guest's room is a room of yours)? */
export const isHomeAt = (g: Save, place: string) => place === playerHomeId || place === SECOND_HOME_ID || (place.startsWith('home:') && !!g.cast[place.slice(5)]);
// The home someone lives in: a housemate's is yours, someone who lives with another person is at that person's home.
const ownHome = (g: Save, r: Resident) => { const hw = (r as any).homeWith as string | undefined; return hw === '__you' ? playerHomeId : hw && g.cast[hw] ? `home:${hw}` : `home:${r.avatar}`; };
// The home a place stands for, so two ways of naming the same home compare equal (a guest's room is in your home).
const homeHere = (g: Save, place: string) => {
    if (!place.startsWith('home:') || place === playerHomeId || place === SECOND_HOME_ID) return place;
    const r = g.cast[place.slice(5)];
    return !r ? place : (r as any).guest ? playerHomeId : ownHome(g, r);
};
/** Does a row of someone's fit where you're caught with them (its `where` and `when`), doing `act` (its `action`)? */
export function rowFits(g: Save, w: WorldDef, r: Resident, row: CaughtRow, place: string, act = ''): boolean {
    if (!row?.text || (row.weight ?? 1) <= 0) return false;
    if (row.action && !row.action.split(/\s*,\s*|\s+or\s+/).map(x => x.trim()).includes(act)) return false;
    if (row.when && !whenHolds(g, w, row.when, { place })) return false;
    const at = String(row.where ?? '').trim(), here = homeHere(g, place), home = isHomeAt(g, place);
    if (!at) return true;
    if (at === 'home') return home && here === homeHere(g, ownHome(g, r));
    if (at === 'yours') return here === playerHomeId || here === SECOND_HOME_ID;
    if (at.startsWith('tag:')) { const t = at.slice(4).trim(); return home ? t === 'home' || homeKindAt(g, w, here) === t : (placeOf(g, w, place)?.tags ?? []).includes(t); }
    if (w.homes.zones.some(z => z.id === at)) return home && homeZoneAt(g, w, here) === at;
    return place === at;
}
/** What someone caught with you says of it: a row (ExampleCharacter.caught) of one of the people with you that fits here,
 *  doing `act` (an action's id), drawn by weight, and at a place of yours the world's `owncaught` rows with them; null
 *  when none fits. `who`: the person whose row it is ('' for an `owncaught` row). */
export function caughtRow(g: Save, w: WorldDef, with_: string[], place: string, rnd: () => number = Math.random, own = false, act = ''): { id: string; text: string; who: string; row?: CaughtRow } | null {
    const pool: { id: string; text: string; who: string; weight: number; row?: CaughtRow }[] = [];
    for (const a of with_) {
        const r = g.cast[a], ex = r && exampleOf(w, r);
        for (const row of ex?.caught ?? []) if (rowFits(g, w, r!, row, place, act)) pool.push({ id: row.id, text: row.text, who: a, weight: row.weight ?? 1, row });
    }
    if (own) for (const t of w.tables?.owncaught ?? []) if (t?.text && (t.weight ?? 1) > 0 && (!t.when || whenHolds(g, w, t.when))) pool.push({ id: t.id, text: t.text, who: '', weight: t.weight ?? 1 });
    const total = pool.reduce((n, x) => n + x.weight, 0);
    if (!pool.length || !(total > 0)) return null;
    let x = rnd() * total;
    const hit = pool.find(p => (x -= p.weight) < 0) ?? pool.at(-1)!;
    return { id: hit.id, text: hit.text, who: hit.who, ...(hit.row ? { row: hit.row } : {}) };
}
// A row shown on screen names you; the AI keeps {{user}}.
const shown = (t: string) => t.replace(/\{\{user\}\}/g, personaName());
// How the one with you takes it: a change in how they feel toward you (a rise through the usual gain, a fall in full;
// romance only with that system on and for someone romance is open to).
function reactTo(g: Save, w: WorldDef, hit: { who: string; row?: CaughtRow } | null) {
    const r = hit?.row, a = hit?.who;
    if (!r || !a || !g.cast[a]) return;
    if (r.feels) { if (r.feels > 0) gain(g, 'f', a, YOU, r.feels); else lose(g, 'f', a, YOU, r.feels); }
    if (r.romance && systemOn(w, 'romance') && !romanceBlocked(g, a)) { if (r.romance > 0) gain(g, 'r', a, YOU, r.romance); else lose(g, 'r', a, YOU, r.romance); }
}
// The rumor's words: the row's own (`{u}`: you), else who and where.
const rumorText = (g: Save, hit: { row?: CaughtRow } | null, who: string[], where: string) => {
    const own = hit?.row?.rumor?.trim();
    if (own) return own.replace(/\{u\}|\{\{user\}\}/g, personaName());
    return `${personaName()}${who.length ? ` and ${names(g, who)}` : ''} ${who.length ? 'were' : 'was'} caught being intimate at ${where}.`;
};

/* ---------- a risky action: caught, or the thrill ---------- */

// What the AI is told when you were caught: it happens, they leave at once, and nothing more.
function caughtLine(g: Save, a: ActionDef, who: string[], where: string, row = ''): string {
    const label = a.label.toLowerCase(), people = names(g, who), setting = a.together?.text ? ` (${a.together.text.replace(/[.\s]+$/, '')})` : '';
    return `[Just now ${people ? `{{user}} and ${people}` : '{{user}}'} were about to ${label} at ${where}${setting}, but someone came by and saw them${row ? `: ${row.replace(/[.\s]+$/, '')}` : ''}. They leave at once, embarrassed, and nothing more happens there. Narrate it briefly, in that light; nobody is hurt.]`;
}
/** The action is caught: nothing of it plays. Returns what came of it instead (the caught outcome). */
function caught(g: Save, w: WorldDef, x: PrivateCtx, who: string[]): ActionDone {
    const a = x.a, where = placeName(g, w, x.place), lines: ActionLine[] = [];
    const say = (text: string) => lines.push({ text, kind: 'warn' });
    // who saw, in the words of one of the people with you (their rows), else the plain line
    const hit = caughtRow(g, w, who, x.place, x.rnd, false, a.id);
    if (hit) { say(shown(hit.text)); say('You leave at once.'); } else say('Someone saw you. You leave at once.');
    addStatus(g, w, 'mood', CAUGHT.mood);
    // the fee, taken from what you have
    const fee = Math.min(g.player.money, Math.max(0, priceOf(g, Math.max(0, Number(a.fee) || 0))));
    if (fee > 0) { g.player.money -= fee; book(g, `${a.name}: fee`, -fee); say(`You pay a fee of ${money(w, fee)}.`); }
    banPlace(g, x.place);
    say(`${where} won't serve you for ${CAUGHT.days} days.`);
    // someone must have been there to see who it was (one of the world's people, not one of you; a row says who saw)
    // (and when a row says who saw, word starts there or around there even with none of the world's people in the room)
    const seen = presentAt(g, w, x.place).some(r => !x.with.includes(r.avatar)), o = { with: who, id: `caught:${a.id}:${nowAbs(g)}`, caught: x.place };
    const rumor = hit ? wordAround(g, w, rumorText(g, hit, who, where), x.place, { ...o, seen: true }) : !!startCaughtRumor(g, w, rumorText(g, hit, who, where), x.place, { ...o, seen });
    if (rumor) say('Word may get around.');
    reactTo(g, w, hit);
    if (atMyWork(g, w, x.place)) workWarning(g, w, CAUGHT.atWork).forEach(say);
    note(g, who.length ? '{u} and {0} were caught at {1}.' : '{u} was caught at {1}.', [names(g, who), where], who, x.place, 'action');
    tallyEvent(g, 'caught', 1, who[0]);
    const first = lines[0].text;
    return { lines, roll: null, outcome: { id: CAUGHT_ID, weight: 0, text: first }, keepsake: null, with: who, together: [], ai: caughtLine(g, a, who, where, hit?.text) };
}

/* ---------- caught at a place of your own ---------- */

/** Is this place yours (the museum you own, its rooms)? What being seen there is multiplied by, or null. */
export const ownedHere = (g: Save, w: WorldDef, place: string): { risk: number } | null => {
    for (const f of ownedPlaces) { const o = f(g, w, place); if (o) return o; }
    return null;
};
/** What a world says when you're caught at a place of yours: a row of its `owncaught` table whose `when` holds
 *  (who saw you, and how the one with you takes it), drawn by weight; none: a plain line. */
export function ownCaughtRow(g: Save, w: WorldDef, rnd: () => number = Math.random): { id: string; text: string } {
    const r = caughtRow(g, w, [], '', rnd, true);
    return r ? { id: r.id, text: r.text } : { id: '', text: 'Someone who works here saw you, and looked away.' };
}
// Word starts with `first` when given (a home's people), else with the people of the place, else of its neighbourhood
// (its map's public places): true when it started.
function wordAround(g: Save, w: WorldDef, text: string, place: string, o: { with: string[]; id: string; seen: true; first?: string[]; caught?: string }): boolean {
    if (o.first?.length && startCaughtRumor(g, w, text, place, o)) return true;
    const map = placeOf(g, w, place)?.map, plain = { with: o.with, id: o.id, seen: o.seen, ...(o.caught ? { caught: o.caught } : {}) };
    const near = [...(isHomeAt(g, place) ? [] : [place]), ...w.places.filter(p => p.map === map && p.id !== place && !p.private && !p.link).map(p => p.id)];
    return near.some(p => startCaughtRumor(g, w, text, p, plain));
}
/** Caught at a place of yours: nothing of it plays, but nobody bans you or takes a fee: someone who works there saw, the
 *  one with you is mortified (the world's words, or a row of their own), and word may get around. */
function caughtAtYours(g: Save, w: WorldDef, x: PrivateCtx, who: string[]): ActionDone {
    const a = x.a, where = placeName(g, w, x.place), lines: ActionLine[] = [];
    const say = (text: string) => lines.push({ text, kind: 'warn' });
    const hit = caughtRow(g, w, who, x.place, x.rnd, true, a.id);
    const row = hit?.text ?? 'Someone who works here saw you, and looked away.';
    say(shown(row));
    addStatus(g, w, 'mood', CAUGHT.mood);
    say("It's your own place: nobody asks you to leave.");
    // whoever works there talks: word starts with the people of the place, else of its neighbourhood (its map)
    if (wordAround(g, w, rumorText(g, hit, who, where), x.place, { with: who, id: `caught:${a.id}:${nowAbs(g)}`, seen: true })) say('Word may get around.');
    reactTo(g, w, hit);
    note(g, who.length ? '{u} and {0} were caught at {1}.' : '{u} was caught at {1}.', [names(g, who), where], who, x.place, 'action');
    tallyEvent(g, 'caught', 1, who[0]);
    const label = a.label.toLowerCase(), people = names(g, who);
    const ai = `[Just now ${people ? `{{user}} and ${people}` : '{{user}}'} were about to ${label} at ${where}, a place of {{user}}'s own, but someone who works there came by and saw them: ${row.replace(/[.\s]+$/, '')}. Nobody makes them leave and nothing more happens; narrate it briefly, in that light.]`;
    return { lines, roll: null, outcome: { id: CAUGHT_ID, weight: 0, text: lines[0].text }, keepsake: null, with: who, together: [], ai };
}

/* ---------- caught at a home ---------- */

/** (homes) Who hears first when you're caught at a home: the people who live there or are there now (a guest, someone
 *  staying the night at yours), never the ones with you; with nobody, the neighbours (the people of the same home area). */
export function homeHearers(g: Save, w: WorldDef, place: string, with_: string[]): string[] {
    const here = homeHere(g, place), out = new Set<string>();
    const other = (r: Resident) => !with_.includes(r.avatar) && !(r as any).gone;
    for (const r of residentsOf(g)) if (other(r) && (homeHere(g, ownHome(g, r)) === here || (here === playerHomeId && (!!(r as any).guest || !!visitOf(g, r.avatar))))) out.add(r.avatar);
    for (const r of presentAt(g, w, place)) if (other(r)) out.add(r.avatar);
    if (out.size) return [...out];
    const zone = homeZoneAt(g, w, here);
    return zone ? residentsOf(g).filter(r => other(r) && homeZoneAt(g, w, homeHere(g, ownHome(g, r))) === zone).map(r => r.avatar) : [];
}
/** Caught at a home (yours, theirs, a shared house): nothing of it plays, but it's a home: nobody sends you away or bans
 *  you, and nobody charges a fee. Someone saw or heard (a row of the one with you says who, and how they take it), and
 *  word gets around from the people who live there, else the neighbours, else the neighbourhood's places. */
function caughtAtHome(g: Save, w: WorldDef, x: PrivateCtx, who: string[]): ActionDone {
    const a = x.a, where = placeName(g, w, x.place), lines: ActionLine[] = [];
    const say = (text: string) => lines.push({ text, kind: 'warn' });
    const hit = caughtRow(g, w, who, x.place, x.rnd, false, a.id);
    say(hit ? shown(hit.text) : 'Someone saw or heard you.');
    addStatus(g, w, 'mood', CAUGHT.mood);
    say("It's a home: nobody asks you to leave.");
    const first = homeHearers(g, w, x.place, who);
    if (wordAround(g, w, rumorText(g, hit, who, where), x.place, { with: who, id: `caught:${a.id}:${nowAbs(g)}`, seen: true, first })) say('Word may get around.');
    reactTo(g, w, hit);
    note(g, who.length ? '{u} and {0} were caught at {1}.' : '{u} was caught at {1}.', [names(g, who), where], who, x.place, 'action');
    tallyEvent(g, 'caught', 1, who[0]);
    const label = a.label.toLowerCase(), people = names(g, who), setting = a.together?.text ? ` (${a.together.text.replace(/[.\s]+$/, '')})` : '';
    const ai = `[Just now ${people ? `{{user}} and ${people}` : '{{user}}'} were about to ${label} at ${where}${setting}, but someone saw or heard them${hit ? `: ${hit.text.replace(/[.\s]+$/, '')}` : ''}. It's a home, so nobody makes them leave, but nothing more happens now; narrate it briefly, in that light.]`;
    return { lines, roll: null, outcome: { id: CAUGHT_ID, weight: 0, text: lines[0].text }, keepsake: null, with: who, together: [], ai };
}

privateChecks.push((g, w, x) => {
    if (!adultOn(g) || isScenario(w) || !((x.a.risk ?? 0) > 0)) return;
    // it only matters when it would happen: someone takes part (or it needs nobody), and no hard limit stops it first
    // (sim/private.ts decides both; asked here so the order the checks run in doesn't matter)
    const who = whoJoins(g, w, x.with);
    if (!who.length && x.a.together?.needed) return;
    if (who.some(p => matchIn(g, x.a.matches, limitsOf(g, p)))) return;
    const own = ownedHere(g, w, x.place), a = own && own.risk !== 1 ? { ...x.a, risk: Math.min(1, (x.a.risk ?? 0) * own.risk) } : x.a;
    if (riskRoll(g, w, a, x.rnd).caught) { x.stop = own ? caughtAtYours(g, w, x, who) : isHomeAt(g, x.place) ? caughtAtHome(g, w, x, who) : caught(g, w, x, who); return; }
    x.notes.risky = true; x.notes.riskWith = who;
});

// Not caught: it counts as a risky moment, and the thrill is worth a little mood and Desire full.
privateResults.push((g, w, x, done) => {
    if (!x.notes.risky) return;
    const who = (x.notes.riskWith as string[] | undefined) ?? [];
    tallyEvent(g, 'risky', 1, who[0]);
    addStatus(g, w, 'mood', CAUGHT.thrillMood);
    const d = statusDef(w, 'desire'); if (d) addStatus(g, w, 'desire', d.max);
    done.lines.push({ text: 'Nobody noticed, and the thrill stays with you.', kind: 'success' });
    done.ai = done.ai.replace(/\]$/, ' They were nearly seen, and the risk was part of the thrill; nobody noticed.]');
});

/* ---------- a risky choice at work: a raid ---------- */

const RAID_AGAIN = 4 * 90;   // a raid this many days old (about a year) is forgotten: the first one again
/** A work result with a `risk` (the esthe's "a little more"): rolled as an action's is. Caught, it's a raid: the job's place
 *  shuts for a week (no shifts, no pay, no absence), a warning, a rumor, mood down, and the second time (within a year, in
 *  the same job) you're let go. Not caught: counted as a risky moment. Returns what to tell. */
export function workRisk(g: Save, w: WorldDef, o: Occupation, r: WorkResult, rnd: () => number = Math.random): string[] {
    const risk = Number(r.risk), j = g.player.job as JobState | null;
    if (!adultOn(g) || !(risk > 0) || !j) return [];
    if (!riskRoll(g, w, { id: o.id, tags: ['work', ...jobTags(g, o)], risk }, rnd).caught) { tallyEvent(g, 'risky'); return []; }
    const out: string[] = [], c = state(g), place = jobPlace(g, o);
    const raids = c.raids && c.raids.job === o.id && g.day - c.raids.day < RAID_AGAIN ? c.raids.n : 0;
    c.raids = { job: o.id, n: raids + 1, day: g.day };
    tallyEvent(g, 'caught');
    addStatus(g, w, 'mood', CAUGHT.mood);
    out.push(`${o.name} was raided. Everything is shut for ${CAUGHT.days} days.`);
    // the week's shifts don't happen and don't count against you
    const off = (j.off ??= {});
    for (let d = g.day; d < g.day + CAUGHT.days; d++) { const s = shiftOn(g, w, o, d); if (s && !(j.worked ?? []).includes(d) && !off[d]) off[d] = 'closed'; }
    banPlace(g, place);
    const where = placeName(g, w, place) || o.name;
    startCaughtRumor(g, w, `${personaName()} was at ${where} when it was raided.`, place, { id: `raid:${o.id}:${nowAbs(g)}` });
    if (raids >= 1) {
        g.player.job = null; delete c.raids;
        note(g, '{u} was let go ({0}).', [o.name], [], place, 'work');
        out.push(`You were let go from ${o.name} after the second raid.`);
        return out;
    }
    j.warn = Math.max(j.warn ?? 0, 1);
    note(g, '{u} got a warning at work ({0}).', [o.name], [], place, 'work');
    out.push('A warning at work: another raid and you are out.');
    return out;
}
