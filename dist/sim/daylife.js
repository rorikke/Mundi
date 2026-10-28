// A day in people's lives, beyond their routine, and what places remember.
// · Routines get interrupted: someone is home sick, runs errands, visits a friend, works late, or stays in while
//   the town is tense. These come from the day itself (worked out, not stored), so every look gives the same answer.
// · Places remember you: how often you come (a regular, a first time), who works there and who comes often, and
//   where each person last saw you.
// · Why each person is here, for the AI: a break, a shift, a standing appointment, a part in a festival, a date.
import { nowAbs } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { onHour } from './hooks.js';
import { isWeekend, hm } from './time.js';
import { isHome, placeOf, playerHomeId } from './places.js';
import { regionOf, regionState } from './worldstate.js';
import { presentAt } from './people.js';
import { openAt } from './daynight.js';
import { overhear, couples } from './living.js';
import { exesOf, fr } from './rel.js';
import { lex } from '../core/lexicon.js';
import { scheduled, shiftOn, shiftAt, slotAt, stampOf, broughtNow, onVacation, rankName } from './dayplan.js';
import { workingAt, routineStep, waitingForTrain } from './people.js';
import { levelHolds } from './when.js';
const FRIEND = 30; // where Friend starts (FRIEND_TIERS in sim/romance.ts)
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const homeOf = (r) => (r.homeWith === '__you' ? playerHomeId : r.homeWith ? `home:${r.homeWith}` : `home:${r.avatar}`);
const isKid = (g, a) => (g.family?.kids ?? []).some((k) => k.avatar === a);
// What interrupts her routine on a given day (none most days). Same world, day and person: same answer.
const memo = new WeakMap(); // asked often (where is everyone?): worked out once
export function breakOf(g, w, r, day) {
    if (!systemOn(w, 'living') || isKid(g, r.avatar))
        return null;
    const tense = regionState(g, w, regionOf(g, w, homeOf(r))).tension >= 60;
    // (a job with a schedule: its shifts depend on the whole team, so on the day plan's stamp too)
    const key = `${w.id}|${day}|${r.avatar}|${homeOf(r)}|${r.occupation}|${tense}|${scheduled(g, w, r) ? stampOf(g, w).id : ''}`;
    let m = memo.get(g);
    if (!m)
        memo.set(g, m = new Map());
    if (m.has(key))
        return m.get(key);
    const b = work(g, w, r, day, tense);
    if (m.size > 5000)
        m.clear();
    m.set(key, b);
    return b;
}
function work(g, w, r, day, tense) {
    const k = `${g.world}|${day}|${r.avatar}`;
    const roll = H(`${k}|brk`), at = (h) => day * 1440 + h * 60;
    const home = homeOf(r);
    // errands and visits fit around a shift (someone with a schedule doesn't leave work for them)
    const sched = scheduled(g, w, r);
    const onJob = (from, to) => sched && [day - 1, day].some(d => { const x = shiftOn(g, w, r, d); return !!x && x.from < to && from < x.to; });
    if (roll < 0.03)
        return { kind: 'sick', from: at(0), to: at(24), place: home, why: 'is home sick today' };
    if (roll < 0.15) {
        const spots = w.places.filter(p => !p.link && (p.tags ?? []).some(t => t === 'shop' || t === 'service') && p.map === regionOf(g, w, home));
        const list = spots.length ? spots : w.places.filter(p => !p.link && (p.tags ?? []).some(t => t === 'shop' || t === 'service'));
        const h = 9 + Math.floor(H(`${k}|when`) * 8);
        const open = list.filter(p => openAt(g, w, p.id, day * 1440 + h * 60)); // somewhere open at that hour
        if (open.length && !onJob(at(h), at(h) + 120)) {
            const p = open[Math.floor(H(`${k}|where`) * open.length)];
            return { kind: 'errand', from: at(h), to: at(h) + 60 + Math.floor(H(`${k}|long`) * 2) * 30, place: p.id, why: 'is running errands' };
        }
    }
    if (roll < 0.21) {
        const pairs = couples(g);
        const ties = g.living?.ties ?? []; // family
        const friends = Object.keys(g.cast).filter(a => fr(g, r.avatar, a) >= FRIEND);
        const exes = new Set(exesOf(g, r.avatar, false)); // exes (not old flings) don't drop by
        const close = [...pairs.filter(p => p.includes(r.avatar)).flat(), ...ties.filter(t => t.a === r.avatar || t.b === r.avatar).flatMap(t => [t.a, t.b]), ...friends]
            .filter(a => a !== r.avatar && a !== '__you' && g.cast[a] && homeOf(g.cast[a]) !== home && !exes.has(a));
        const pool = close.length ? close : Object.keys(g.cast).filter(a => a !== r.avatar && homeOf(g.cast[a]) !== home && !isKid(g, a) && !exes.has(a));
        const h = 18 + Math.floor(H(`${k}|when`) * 3);
        if (pool.length && !onJob(at(h), at(h) + 120)) {
            const o = g.cast[pool[Math.floor(H(`${k}|whom`) * pool.length)]];
            return { kind: 'visit', from: at(h), to: at(h) + 120, place: homeOf(o), why: `is visiting ${o.name}` };
        }
    }
    const job = systemOn(w, 'jobs') ? w.occupations.find(o => o.id === r.occupation) : null;
    if (roll < 0.29 && job && sched) {
        // two more hours after a day shift that ends before 22:00
        const x = shiftOn(g, w, r, day);
        if (x && x.to <= at(22) - 60)
            return { kind: 'late', from: x.to, to: x.to + 120, place: x.place, why: 'is working late' };
    }
    else if (roll < 0.29 && job && !isWeekend(day) && job.hours && job.hours[1] < 22 && job.hours[1] > job.hours[0]) {
        return { kind: 'late', from: at(job.hours[1]), to: at(job.hours[1] + 2), place: job.place, why: 'is working late' };
    }
    // a tense town keeps people in at night
    if (tense && H(`${k}|in`) < 0.5)
        return { kind: 'in', from: at(19), to: at(24), place: home, why: 'is staying in (the town is tense)' };
    return null;
}
// The interruption going on right now, if any.
export function breakNow(g, w, r, at = nowAbs(g)) {
    const b = breakOf(g, w, r, Math.floor(at / 1440));
    return b && at >= b.from && at < b.to ? b : null;
}
const mem = (g) => { const l = (g.living ??= {}); l.visits ??= {}; l.seen ??= {}; return l; };
export const visitsTo = (g, place) => mem(g).visits[place] ?? null;
export const lastSeen = (g, avatar) => mem(g).seen[avatar] ?? null;
// Each hour: a new place you came to counts as a visit, and everyone here sees you.
export function notice(g, w, present) {
    if (!systemOn(w, 'living'))
        return;
    const m = mem(g), now = nowAbs(g), loc = g.player.loc;
    if (m.at !== loc) {
        m.at = loc;
        if (!isHome(loc)) {
            const v = (m.visits[loc] ??= { n: 0, first: now, last: now });
            v.n += 1;
            v.last = now;
        }
    }
    for (const r of present)
        if (r.met)
            m.seen[r.avatar] = { place: loc, at: now };
}
onHour.push((g, w) => {
    if (g.asleep)
        return [];
    const here = presentAt(g, w, g.player.loc);
    notice(g, w, here);
    return overhear(g, w, here).map(r => lex(w, 'overheard', r.text)); // a rumor you overhear goes into your journal
});
// For the AI: what this place and the people here remember.
export function placeMemoryLines(g, w, present) {
    if (!systemOn(w, 'living'))
        return [];
    const loc = g.player.loc, out = [];
    if (!isHome(loc)) {
        const v = visitsTo(g, loc);
        if (!v || v.n <= 1)
            out.push(`It is {{user}}'s first time here.`);
        else if (v.n >= 8)
            out.push(`{{user}} is a regular here (${v.n} visits); the staff and regulars know {{user}}'s face.`);
        else if (v.n >= 3)
            out.push(`{{user}} has been here a few times before.`);
    }
    const job = (r) => systemOn(w, 'jobs') ? w.occupations.find(o => o.id === r.occupation) : null;
    const works = present.filter(r => job(r)?.place === loc).map(r => { const rank = rankName(g, w, r); return rank ? `${r.name} (${rank})` : r.name; });
    const often = present.filter(r => job(r)?.place !== loc && r.leisure.includes(loc)).map(r => r.name);
    if (works.length)
        out.push(`${works.join(', ')} ${works.length > 1 ? 'work' : 'works'} here.`);
    if (often.length)
        out.push(`${often.join(', ')} ${often.length > 1 ? 'come' : 'comes'} here often.`);
    const now = nowAbs(g);
    for (const r of present.filter(x => x.met)) {
        const s = lastSeen(g, r.avatar);
        if (!s || s.place === loc || now - s.at > 7 * 1440 || now - s.at < 60)
            continue;
        const days = Math.floor(now / 1440) - Math.floor(s.at / 1440);
        out.push(`${r.name} last saw {{user}} at ${placeOf(g, w, s.place)?.name ?? 'another place'}, ${days <= 0 ? 'earlier today' : days === 1 ? 'yesterday' : `${days} days ago`}.`);
    }
    return out;
}
// For the AI: why the people here are here: a break in their routine, a story, a standing appointment, a part in a
// festival or event, a date, an event they came for, their shift (with its end), a vacation. A couple kept secret is
// only "here together" unless {{user}} is close to one of them (a good friend).
export function whyHereLines(g, w, present) {
    const loc = g.player.loc, now = nowAbs(g), out = [], told = new Set();
    const here = new Set(present.map(r => r.avatar));
    const names = (list) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
    for (const r of present) {
        if (told.has(r.avatar))
            continue;
        const b = breakNow(g, w, r);
        if (b) {
            out.push(`${r.name} ${b.why}.`);
            continue;
        }
        const story = broughtNow(g, r.avatar);
        if (story && story.place === loc) {
            out.push(`${r.name} ${story.why}.`);
            continue;
        }
        const s = slotAt(g, w, r, now);
        if (s && s.place === loc) {
            const with_ = s.with.filter(a => here.has(a) && !told.has(a) && slotAt(g, w, g.cast[a], now)?.why === s.why);
            if (s.kind === 'date' && s.partner && g.cast[s.partner]) {
                const o = g.cast[s.partner], trusted = levelHolds(g, w, r.avatar, 'good') || levelHolds(g, w, o.avatar, 'good');
                told.add(o.avatar);
                out.push(s.secret && !trusted ? `${r.name} and ${o.name} are here together.` : `${r.name} is ${s.why} ${o.name}${s.secret ? ' (they keep their relationship secret from others)' : ''}.`);
            }
            else if (s.kind === 'ritual') {
                with_.forEach(a => told.add(a));
                const who = [r.name, ...with_.map(a => g.cast[a].name)];
                out.push(`${names(who)} ${who.length > 1 ? 'are' : 'is'} here for a standing appointment (${s.why}).`);
            }
            else
                out.push(`${r.name} ${s.why}.`);
            continue;
        }
        const job = workingAt(g, w, r, now);
        if (job === loc) {
            const x = shiftAt(g, w, r, now), rank = rankName(g, w, r);
            const end = x ? x.to : endOfWork(r, now);
            out.push(`${r.name} is working${end ? ` (until ${hm(end % 1440)})` : ''}${rank ? `, as ${rank}` : ''}.`);
            continue;
        }
        if (onVacation(g, w, r, Math.floor(now / 1440)))
            out.push(`${r.name} is on vacation (a few days off work).`);
        else if (waitingForTrain(g, w, r, now))
            out.push(`${r.name} missed the last train home and is staying out until the first one.`);
    }
    return out;
}
// When the work step of a routine ends (for a job without a schedule).
function endOfWork(r, at) {
    const day = Math.floor(at / 1440), steps = isWeekend(day) ? r.routine.weekend : r.routine.weekday;
    const [start] = routineStep(r, at), next = steps.find(s => s[0] > start);
    return next ? day * 1440 + next[0] * 60 : 0;
}
