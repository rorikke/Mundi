// Sightings and discretion (business, the love hotel, adult content only: plans/business-hospitality.md H6,
// requirements/business.md B-14, B-20): a hotel sees who comes in with whom. The world's couples come and go without a
// word; one you'd notice becomes a sighting only when it moves a story: a written one of the hotel's (a secret not yet
// known, a storyline walking through the lobby) or a couple you didn't know was one. At most one a week (two in a week
// of the year-end or Christmas Eve). You hear it at the desk during your own hours, or, while the hotel's notebook
// holds (Kaoru at the window), as a line of the week's report. Your choice: keep it (the hotel's discretion), use it (you
// learn it: the secret, the couple), let it slip (a rumor, the couple hurt, the hotel's name with it). A hotel can be set
// to never tell you. Nothing here runs with the `business` system off or adult content off; the engine owns it all,
// and the AI is told only what you learned.
import { adultOn } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { onDay, ventureLink } from './hooks.js';
import { festivalsOn } from './festivals.js';
import { whenHolds, personNamed } from './when.js';
import { couplePairs, casualPairs, lose, YOU } from './rel.js';
import { secretCouple, workPlace } from './dayplan.js';
import { revealThread, knowsThread, threadStates } from './threads.js';
import { startRumor } from './living.js';
import { note } from './facts.js';
import { venturesOf, ventureDef, ventureStore, ventureName, placesOf, addStat, ventureReport, weekOf } from './ventures.js';
/** The engine's numbers: the chance a day brings a sighting when one could come and none has this week; the weeks
 *  that allow two (festivals); what keeping and letting slip do to the hotel's Fame; how much a couple's romance and
 *  their feelings toward you lose when it slips. */
export const SIGHT = { day: 0.3, busy: ['christmas', 'bonenkai', 'omisoka'], keep: 1, slip: -2, hurt: 8, cold: 5 };
/** Can this game have sightings at all: the system on, adult content on, and a venture in the world that has them. */
export const sightingsOn = (g, w) => systemOn(w, 'business') && adultOn(g) && (w.ventures ?? []).some(v => !!v.sightings?.length || !!v.notebook);
const H = (x) => { let h = 2166136261; for (let i = 0; i < x.length; i++) {
    h ^= x.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const rnd = (g, salt) => H(`${g.world}|${salt}`);
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const first = (r) => r.name.split(/\s+/)[0];
const pairKey = (a, b) => [a, b].sort().join('|');
const st = (g) => g.ventures;
/** The couples you know of (seen at your hotel and used: `a|b` by avatar). */
export const knownPairs = (g) => st(g)?.pairs ?? [];
// The hotels of yours that can have sightings (live, adult content on, not set to never tell).
function hotels(g, w) {
    if (!sightingsOn(g, w))
        return [];
    return venturesOf(g).map(s => ({ s, d: ventureDef(w, s.id) })).filter(x => x.d && (x.d.sightings?.length || x.d.notebook) && (!x.d.adult || adultOn(g)) && x.s.tell !== 'never');
}
// (someone of the world's you've met, still around; you and your own partners are never a sighting)
const inGame = (r) => !!r && !!r.met && !r.gone;
/** What could be seen at this hotel now, in the order it would be told: its written sightings whose people you know,
 *  whose condition holds and that still move a story; then the world's couples you didn't know were one. */
export function candidates(g, w, s, d) {
    const seen = new Set(s.sighted ?? []), out = [];
    const known = new Set(knownPairs(g));
    const written = new Set();
    for (const x of d.sightings ?? []) {
        if ((x.adult && !adultOn(g)) || seen.has(x.id))
            continue;
        const who = x.who.map(n => personNamed(g, n));
        if (!who.every(inGame))
            continue;
        if (who.length === 2)
            written.add(pairKey(who[0].avatar, who[1].avatar));
        if (x.learn && (knowsThread(g, x.learn) || !threadStates(g)[x.learn] || threadStates(g)[x.learn].ended))
            continue;
        if (x.when && !whenHolds(g, w, x.when, { place: s.place, key: `sight|${s.id}|${x.id}`, day: true }))
            continue;
        out.push(written1(g, s, d, x, who));
    }
    const pairs = [...couplePairs(g), ...casualPairs(g)];
    for (const p of pairs) {
        if (p.a === YOU || p.b === YOU)
            continue;
        const A = g.cast[p.a], B = g.cast[p.b], k = pairKey(p.a, p.b);
        if (!inGame(A) || !inGame(B) || known.has(k) || written.has(k) || seen.has(`pair:${k}`))
            continue;
        const secret = secretCouple(g, w, p.a, p.b);
        const day = DAYS[((g.day - 2) % 7 + 7) % 7];
        out.push({ s, d, id: `pair:${k}`, who: [A, B], pair: k,
            line: `${first(A)} came in with ${first(B)} on ${day}, ${rnd(g, `stay|${k}|${g.day}`) < 0.5 ? 'a night\'s stay' : 'for a rest'}.${secret ? ' They kept their faces turned from the lobby camera.' : ''}`,
            slip: `${first(A)} and ${first(B)} were seen going into a love hotel together.` });
    }
    return out;
}
function written1(g, s, d, x, who) {
    const line = x.line.replace(/\{(\d)\}/g, (_, i) => (who[Number(i)] ? first(who[Number(i)]) : x.with ?? ''));
    return { s, d, id: x.id, who, line, learn: x.learn, kept: x.kept, ...(who.length === 2 ? { pair: pairKey(who[0].avatar, who[1].avatar) } : {}),
        slip: x.slip ?? `${who.map(first).join(' and ')} ${who.length > 1 ? 'were' : 'was'} seen going into a love hotel${x.with ? ` with ${x.with}` : ' together'}.` };
}
// How many sightings a week may bring: one, two in a week with the year-end's or Christmas Eve's nights.
function weekCap(g, w) {
    const from = weekOf(g.day) * 7 + 1;
    for (let d = from; d < from + 7; d++)
        if (festivalsOn(g, w, d).some(f => SIGHT.busy.includes(f.id)))
            return 2;
    return 1;
}
function capLeft(g, w) {
    const v = ventureStore(g), wk = weekOf(g.day);
    if (v.sightWeek !== wk) {
        v.sightWeek = wk;
        v.sightN = 0;
    }
    return !v.sighting && (v.sightN ?? 0) < weekCap(g, w);
}
// The notebook holds: its condition, and its keeper at work at the hotel (her job's place is one of its places).
function notebookOpen(g, w, s, d) {
    if (!d.notebook)
        return null;
    const r = personNamed(g, d.notebook.who);
    if (!r || r.gone)
        return null;
    if (d.notebook.when && !whenHolds(g, w, d.notebook.when, { place: s.place, key: `notebook|${s.id}`, day: true }))
        return null;
    const job = w.occupations.find(o => o.id === r.occupation);
    return job && placesOf(s).includes(workPlace(g, w, r, job)) ? r : null;
}
function put(g, x, via) {
    const v = ventureStore(g);
    v.sighting = { venture: x.s.id, id: x.id, who: x.who.map(r => r.avatar), day: g.day, via };
    v.sightN = (v.sightN ?? 0) + 1;
    x.s.sighted = [...(x.s.sighted ?? []), x.id].slice(-200);
}
/** The sighting waiting for your choice, if any (gone after a week, or when its people or hotel are). */
export function pendingSighting(g, w) {
    const p = st(g)?.sighting;
    if (!p || !sightingsOn(g, w) || p.day < g.day - 7)
        return null;
    const s = venturesOf(g).find(x => x.id === p.venture), d = s && ventureDef(w, s.id);
    if (!s || !d)
        return null;
    const who = p.who.map(a => g.cast[a]);
    if (!who.every(r => r && !r.gone))
        return null;
    if (p.id.startsWith('pair:')) {
        const [A, B] = who;
        return { s, d, id: p.id, who, via: p.via, pair: p.id.slice(5), line: `${first(A)} came in with ${first(B)}.`, slip: `${first(A)} and ${first(B)} were seen going into a love hotel together.` };
    }
    const x = d.sightings?.find(y => y.id === p.id);
    return x ? { ...written1(g, s, d, x, who), via: p.via } : null;
}
/** What you do with it. `keep`: the hotel's discretion (a little Fame, a secret kept); `use`: you learn it (its thread,
 *  the couple); `slip`: a rumor about them, their romance hurt and their feelings toward you, the hotel's name with it. */
export function chooseSighting(g, w, how) {
    const x = pendingSighting(g, w);
    if (!x)
        return [];
    delete ventureStore(g).sighting;
    const out = [], name = ventureName(w, x.s), names = x.who.map(first).join(' and ');
    if (how === 'keep') {
        x.s.kept = (x.s.kept ?? 0) + 1;
        addStat(g, w, x.s, 'fame', SIGHT.keep);
        out.push(x.kept ?? `You keep it to yourself. At ${name}, nobody ever saw anyone.`);
        ventureReport(x.s, 'A guest\'s secret kept.');
    }
    else if (how === 'use') {
        if (x.learn && revealThread(g, w, x.learn, 'saw'))
            out.push(`Now you know something about ${names} they don't know you know.`);
        if (x.pair) {
            const v = ventureStore(g);
            v.pairs = [...new Set([...(v.pairs ?? []), x.pair])];
            out.push(`${names}: you know about them now.`);
        }
        if (!out.length)
            out.push(`You remember it: ${x.line}`);
        note(g, '{u} saw {0} at {1}.', [names, name], x.who.map(r => r.avatar), x.s.place, 'social');
    }
    else {
        x.s.slipped = (x.s.slipped ?? 0) + 1;
        addStat(g, w, x.s, 'fame', SIGHT.slip);
        startRumor(g, w, x.slip, x.s.place, { about: x.who.map(r => r.name), secret: true, id: `sight|${x.id}` });
        if (x.who.length === 2) {
            const [A, B] = x.who;
            lose(g, 'r', A.avatar, B.avatar, SIGHT.hurt);
            lose(g, 'r', B.avatar, A.avatar, SIGHT.hurt);
        }
        for (const r of x.who)
            lose(g, 'f', r.avatar, YOU, SIGHT.cold);
        out.push(`It gets around. ${names} will hear where it started.`);
        ventureReport(x.s, 'A guest\'s secret let slip.');
    }
    return out;
}
/** Your setting for a hotel: tell me only when it matters (default), or never tell me. */
export function setTell(g, w, id, tell) {
    const s = venturesOf(g).find(x => x.id === id);
    if (!s || !ventureDef(w, s.id))
        return false;
    if (tell === 'never') {
        s.tell = 'never';
        const v = ventureStore(g);
        if (v.sighting?.venture === id)
            delete v.sighting;
    }
    else
        delete s.tell;
    return true;
}
/** What the AI is told: couples you learned about at your hotel, when both are here (they don't know you know). */
export function sightingLine(g, w, present) {
    if (!sightingsOn(g, w))
        return '';
    const here = new Set(present);
    const lines = knownPairs(g).map(k => k.split('|')).filter(([a, b]) => here.has(a) && here.has(b) && g.cast[a] && g.cast[b])
        .map(([a, b]) => `{{user}} knows ${first(g.cast[a])} and ${first(g.cast[b])} see each other (seen at {{user}}'s hotel; they don't know {{user}} knows).`);
    return lines.join(' ');
}
// At the desk: after your own hours, now and then what you saw (sim/ventures.ts runStint asks).
ventureLink.stint = (g, w, id) => {
    const x = hotels(g, w).find(h => h.s.id === id);
    if (!x || !capLeft(g, w) || rnd(g, `deskseen|${id}|${g.day}|${g.minutes}`) >= SIGHT.day * 2)
        return [];
    const c = candidates(g, w, x.s, x.d)[0];
    if (!c)
        return [];
    put(g, c, 'desk');
    return [`At the desk: ${c.line}`];
};
// Each morning: from the notebook, while it holds, a line of the week's report with the choice waiting in the app.
onDay.push((g, w) => {
    const list = hotels(g, w);
    if (!list.length || !capLeft(g, w))
        return [];
    for (const { s, d } of list) {
        const keeper = notebookOpen(g, w, s, d);
        if (!keeper || rnd(g, `notebook|${s.id}|${g.day}`) >= SIGHT.day)
            continue;
        const c = candidates(g, w, s, d)[0];
        if (!c)
            continue;
        put(g, c, 'notebook');
        ventureReport(s, `${first(keeper)}'s notebook: ${c.line}`);
        return [];
    }
    return [];
});
