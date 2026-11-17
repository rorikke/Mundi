// A friend staying over (the plans system): someone close stays at your place for one to three nights, or "for a
// while" (until you say goodbye, a week at most). They arrive that evening and ring the doorbell, sleep where you
// chose, keep their own job and days (going out from yours), and grow a little closer each night. The engine decides
// who says yes and counts the nights; the AI only plays it. Not in a scenario (Home mode has its own guests) and
// nothing at all with plans off. The one-night stay (`social.stay`, ui/events.ts) is something else and stays as it is.
// The save: `social.visitors` (optional, read with defaults; no migration).
import { nowAbs } from '../core/store.js';
import { getWorld, isScenario, systemOn } from '../core/world.js';
import { onHour, onDay, roomRules } from './hooks.js';
import { playerHomeId } from './places.js';
import { homeKey } from './homes.js';
import { whereNow } from './people.js';
import { social, bondOf, isPartner, isWith } from './social.js';
import { HOME_BOND, housemate, letGo, nightTogether } from './plans.js';
import { shutOut } from './romance.js';
import { isMinor } from './family.js';
import { gain, touch, YOU } from './rel.js';
import { tallyEvent } from './tally.js';
import { note } from './facts.js';
import { hm, weekday } from './time.js';
import { sceneHere, asleepAt } from './homerooms.js';
const LEAVE = 10 * 60, EVENING = 19 * 60, WEEK = 7;
// read without writing (asked very often: every routine works out a home)
const listOf = (g) => g.social?.visitors ?? [];
const store = (g) => (social(g).visitors ??= []);
/** Visitors play in this world: plans on, not a scenario. */
export const visitsOn = (w) => !!w && !isScenario(w) && systemOn(w, 'plans');
// The night a stay's first evening belongs to (asked before 10:00, it's last night's), and the night a moment is part of.
const firstNight = (at) => Math.floor(at / 1440) - (at % 1440 < LEAVE ? 1 : 0);
const nightOf = (at) => Math.floor(at / 1440) - (at % 1440 < 12 * 60 ? 1 : 0);
/** How many nights the stay was asked for (an open one: its week). */
export const nightsOf = (v) => Math.floor(v.until / 1440) - firstNight(v.from);
/** Their stay at that moment, or null. */
export function visitorAt(g, avatar, at) {
    for (const v of listOf(g))
        if (v.avatar === avatar && v.from <= at && at < v.until)
            return v;
    return null;
}
/** Their stay, now or still ahead (asked, not over). */
export const visitOf = (g, avatar) => listOf(g).find(v => v.avatar === avatar && nowAbs(g) < v.until) ?? null;
/** Everyone staying or about to (one at a time in this attempt, but the save keeps a list). */
export const visitors = (g) => listOf(g).filter(v => nowAbs(g) < v.until);
// The home they live in (someone who lives with another person is at that person's home, or yours).
const ownHome = (r) => (r.homeWith === '__you' ? playerHomeId : r.homeWith ? `home:${r.homeWith}` : `home:${r.avatar}`);
/** A person's home at a moment: yours while they stay with you, else their own. Their routine's home steps (and a ritual
 *  "at home") go there; their leisure stays near their own neighborhood (homeMapOf), and who lives together doesn't
 *  change (a visitor isn't a housemate). In a scenario or with plans off, always their own. */
export function homeIdAt(g, w, r, at) {
    const own = ownHome(r);
    const vs = g.social?.visitors;
    if (!vs || !vs.length || !visitsOn(w))
        return own;
    return visitorAt(g, r.avatar, at) ? playerHomeId : own;
}
/** What the day plan's stamp keeps of the stays (sim/dayplan.ts): a new or changed stay works everyone's day out again. */
export function visSig(g, w) {
    const vs = g.social?.visitors;
    if (!vs || !vs.length || !visitsOn(w))
        return '';
    let s = '';
    for (const v of vs)
        s += `${v.avatar}:${v.from}:${v.until};`;
    return s;
}
/* ---------- asking ---------- */
/** Can they stay a few days? Not a minor; not someone who doesn't want you around; close (friendship 50, or your
 *  partner); not someone who lives with you; one visitor at a time. `why` empty: don't offer it at all. */
export function visitAnswer(g, w, avatar) {
    const r = g.cast[avatar];
    if (!visitsOn(w) || !r || isMinor(g, avatar))
        return { ok: false, why: '' };
    if (r.gone)
        return { ok: false, why: 'They have moved away.' };
    if (housemate(g, avatar))
        return { ok: false, why: '' };
    const have = visitors(g);
    if (have.some(v => v.avatar === avatar))
        return { ok: false, why: 'They are already staying with you.' };
    if (shutOut(g, avatar, isPartner(g, avatar)))
        return { ok: false, why: 'They do not want to spend time with you.' };
    if (!isPartner(g, avatar) && bondOf(g, avatar) < HOME_BOND)
        return { ok: false, why: 'They are not close enough to you to stay at your place.' };
    if (have.length)
        return { ok: false, why: `${g.cast[have[0].avatar]?.name ?? 'Someone'} is already staying with you.` };
    return { ok: true, why: '' };
}
/** They said yes (asked and decided by the engine): the stay starts now if they're with you, else this evening at 19:00
 *  (tomorrow's, asked after 19:00), and lasts the nights asked for (an open stay: a week at most). '' or why not. */
export function askToStay(g, w, avatar, nights, sleep = 'sofa') {
    const ans = visitAnswer(g, w, avatar);
    if (!ans.ok)
        return ans.why || 'They cannot stay with you.';
    const r = g.cast[avatar], now = nowAbs(g);
    const here = isWith(g, avatar) || sceneHere(g, w).includes(r); // (asked in person: they come now)
    const today = Math.floor(now / 1440);
    const from = here ? now : now % 1440 < EVENING ? today * 1440 + EVENING : (today + 1) * 1440 + EVENING;
    const n = nights === 'open' ? WEEK : Math.max(1, Math.min(3, Math.round(Number(nights) || 1)));
    const v = { avatar, from, until: (firstNight(from) + n) * 1440 + LEAVE, home: homeKey(g.player.home), sleep: sleep || 'sofa', nights: 0 };
    if (nights === 'open')
        v.open = true;
    if (here && g.player.loc === playerHomeId)
        v.arrived = true;
    store(g).push(v);
    note(g, nights === 'open' ? '{0} agreed to stay at {u}\'s place for a while.' : n === 1 ? '{0} agreed to stay the night at {u}\'s place.' : '{0} agreed to stay at {u}\'s place for {1} nights.', [r.name, String(n)], [avatar], g.player.loc, 'plan');
    return '';
}
/** When the stay starts and ends, for the screens ("Arrives today at 19:00", "Until Friday 10:00"). */
export function visitWhen(g, v) {
    const day = (at) => { const d = Math.floor(at / 1440); return d === g.day ? 'today' : d === g.day + 1 ? 'tomorrow' : weekday(d); };
    return { arrives: `${day(v.from)} at ${hm(v.from % 1440)}`, until: `${day(v.until)} at ${hm(v.until % 1440)}` };
}
/* ---------- arriving (the doorbell) ---------- */
/** Someone at your door right now: their stay has started, they came to your place, you're home, and you haven't let
 *  them in yet (with you: they came in with you). */
export function atTheDoor(g, w) {
    if (!visitsOn(w) || g.player.loc !== playerHomeId)
        return null;
    const now = nowAbs(g);
    for (const v of listOf(g)) {
        const r = g.cast[v.avatar];
        if (v.arrived || !r || now < v.from || now >= v.until || isWith(g, v.avatar))
            continue;
        if (whereNow(g, w, r) === playerHomeId)
            return v;
    }
    return null;
}
/** You open the door (`open`) or let them in to settle while you carry on: either way they're in. */
export function letIn(g, avatar) {
    const v = listOf(g).find(x => x.avatar === avatar && !x.arrived);
    if (!v)
        return null;
    v.arrived = true;
    note(g, '{0} arrived at {u}\'s place to stay.', [g.cast[avatar]?.name ?? ''], [avatar], playerHomeId, 'plan');
    return v;
}
/* ---------- each night ---------- */
// Once a night: a night over (and a night together, by the same rule as staying the night), a little closer (+1
// friendship from them, paced as any gain), and contact (feelings don't fade while they stay).
function countNight(g, v, night) {
    if (v.lastNight === night || night < firstNight(v.from))
        return;
    v.lastNight = night;
    v.nights = (v.nights ?? 0) + 1;
    tallyEvent(g, 'overnight', 1, v.avatar);
    if (nightTogether(g, v.avatar))
        tallyEvent(g, 'night_together', 1, v.avatar);
    gain(g, 'f', v.avatar, YOU, 1);
    touch(g, v.avatar);
}
/** You go to sleep (sim/plans.ts beforeSleep): at home, with them home, tonight counts now. */
export function visitorsSleep(g, w = getWorld(g.world)) {
    if (!visitsOn(w) || g.player.loc !== playerHomeId)
        return;
    const now = nowAbs(g);
    for (const v of listOf(g)) {
        const r = g.cast[v.avatar];
        if (r && v.from <= now && now < v.until && whereNow(g, w, r) === playerHomeId)
            countNight(g, v, nightOf(now));
    }
}
/** Is this person staying with you now (beforeSleep doesn't send them home)? */
export const stayingWithYou = (g, avatar) => visitsOn(getWorld(g.world)) && !!visitorAt(g, avatar, nowAbs(g));
/* ---------- leaving ---------- */
const nightsText = (n) => (n === 1 ? 'one night' : `${n} nights`);
// The stay is over: off the list, out of your company, and a note when they really stayed.
function endStay(g, v, why) {
    const r = g.cast[v.avatar], name = r?.name ?? '';
    const s = social(g);
    s.visitors = store(g).filter(x => x !== v);
    if (r && isWith(g, v.avatar) && why !== 'time')
        letGo(g, v.avatar);
    const n = v.nights ?? 0;
    if (r && (n > 0 || v.arrived))
        note(g, n === 1 ? '{0} went home after staying one night at {u}\'s place.' : '{0} went home after staying {1} nights at {u}\'s place.', [name, String(n)], [v.avatar], playerHomeId, 'plan');
    else if (r)
        note(g, '{0}\'s stay at {u}\'s place was called off.', [name], [v.avatar], playerHomeId, 'plan');
    if (!r)
        return '';
    if (why === 'out')
        return `${name} packed their things and went home: they don't want to stay with you any more.`;
    if (why === 'moved')
        return `${name} went home: you no longer live where they were staying.`;
    if (n === 0 && !v.arrived)
        return `${name} won't be coming to stay.`;
    return `${name} went home after staying ${nightsText(n)} at your place.`;
}
/** You say goodbye (their card, People, the Calendar): the stay ends now. The toast's text, '' if they weren't staying. */
export function sayGoodbye(g, avatar) {
    const v = visitOf(g, avatar);
    return v ? endStay(g, v, 'bye') : '';
}
// Every hour: a stay at its last morning (10:00), with someone who turned against you, or in a home you left, ends;
// someone whose stay has started and who came to your place rings the doorbell (you're home) or is let in (you're not).
function visitTick(g, w) {
    if (!listOf(g).length || !visitsOn(w))
        return [];
    const out = [], now = nowAbs(g), mine = homeKey(g.player.home);
    for (const v of [...listOf(g)]) {
        const r = g.cast[v.avatar];
        if (!r) {
            endStay(g, v, 'bye');
            continue;
        }
        const why = now >= v.until || r.gone ? 'time' : v.home !== mine ? 'moved' : shutOut(g, v.avatar, isPartner(g, v.avatar)) ? 'out' : '';
        if (why) {
            const t = endStay(g, v, why);
            if (t)
                out.push(t);
            continue;
        }
        if (v.arrived || now < v.from || whereNow(g, w, r) !== playerHomeId)
            continue;
        if (g.player.loc !== playerHomeId) {
            v.arrived = true;
            note(g, '{0} arrived at {u}\'s place to stay.', [r.name], [v.avatar], playerHomeId, 'plan');
            out.push(`${r.name} has arrived at your place and is waiting for you there.`);
        }
        else if (isWith(g, v.avatar))
            v.arrived = true;
        else if (!v.rang) {
            v.rang = true;
            out.push(`${r.name} is at the door.`);
        }
    }
    return out;
}
// The day's turn: a night not counted at your sleep (you were out, or they were) counts now.
function visitDay(g, w) {
    if (!listOf(g).length || !visitsOn(w))
        return [];
    const now = nowAbs(g);
    for (const v of listOf(g))
        if (g.cast[v.avatar] && v.from <= now && now < v.until)
            countNight(g, v, nightOf(now));
    return [];
}
onHour.push(visitTick);
onDay.push(visitDay);
/* ---------- the AI ---------- */
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const sleepWords = (v) => (v.sleep === 'yours' ? "sleeping in {{user}}'s room" : v.sleep === 'sofa' ? 'sleeping on the sofa' : 'sleeping in the spare room');
/** For the plans block: who is staying at {{user}}'s place, which night it is and where they sleep, shown when they're
 *  in the scene or you're at home. '' otherwise. */
export function visitorLine(g, w, present) {
    if (!visitsOn(w))
        return '';
    const now = nowAbs(g), home = g.player.loc === playerHomeId;
    return visitors(g).map(v => {
        const r = g.cast[v.avatar];
        if (!r)
            return '';
        const here = present.some(p => p.avatar === v.avatar);
        if (!here && !home)
            return '';
        if (now < v.from)
            return `${r.name} is coming to stay at {{user}}'s place ${visitWhen(g, v).arrives.replace(/ at /, ' from ')}, ${v.open ? 'for a while' : nightsText(nightsOf(v))}.`;
        const total = nightsOf(v), night = Math.min(total, (v.nights ?? 0) + (nightOf(now) === v.lastNight ? 0 : 1));
        const which = `${ORD[night - 1] ?? `${night}th`} night`;
        const when = v.open ? `(${which}, until {{user}} says goodbye)` : total === 1 ? '(one night)' : `(${which} of ${['one', 'two', 'three'][total - 1] ?? total})`;
        const arrive = !v.arrived ? (here ? " They have just arrived and are at the door: {{user}} hasn't let them in yet." : ' They are on their way and have not arrived yet.') : '';
        const away = !here && v.arrived ? " They are out right now, not in this scene." : '';
        return `${r.name} is staying at {{user}}'s place for a few days ${when}, ${sleepWords(v)}; they keep their own job and days, going out from here.${arrive}${away}`;
    }).filter(Boolean).join(' ');
}
// (homerooms) In a home with rooms, a friend staying over is in the sofa room while awake, and asleep where you chose
// (the sofa room, or your room). Coming to the door is let in there too; "Open the door" brings them to you first.
roomRules.push((g, w, r, x) => {
    if (x.loc !== playerHomeId || !visitsOn(w))
        return null;
    const v = visitOf(g, r.avatar);
    if (!v || x.at < v.from)
        return null;
    const sofa = x.rooms.find(o => o.sofa)?.id ?? x.rooms.find(o => !o.bed && o.tags.includes('living'))?.id ?? x.rooms[0].id;
    if (!asleepAt(g, w, r, x.at))
        return sofa;
    return v.sleep === 'yours' ? 'bed:you' : v.sleep !== 'sofa' && x.rooms.some(o => o.id === v.sleep) ? v.sleep : sofa;
});
