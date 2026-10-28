// The people of the world: where each one is right now, following their routine (unless she is with you,
// or has plans with you). Shifts, standing appointments, parts in festivals, dates and outings come from
// sim/dayplan.ts; the routine template fills the rest.
import { homeJobOf, npcOut, onShift, SHIFTS } from './hometime.js';
import { festivalSpot } from './festivals.js';
import { eventSpot } from './cityevents.js';
import { lockedHere } from './life.js';
import { nowAbs, changes } from '../core/store.js';
import { systemOn, isScenario } from '../core/world.js';
import { isWeekend } from './time.js';
import { appointmentNow, isWith } from './social.js';
import { weatherOn } from './weather.js';
import { weatherAt } from './worldstate.js';
import { breakNow } from './daylife.js';
import { openAt } from './daynight.js';
import { festivalsOn } from './festivals.js';
import { placeOn, extraRooms } from './places.js';
import { partySpot } from './houseparty.js';
import { stampOf, slotAt, shiftAt, shiftOn, scheduled, dayStep, dayOff, onVacation, broughtNow, adultOn, adultPlaces, jobOf, workPlace } from './dayplan.js';
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return h >>> 0; };
// Outdoor places are the ones only for leisure (a park, a beach); a café or a mall has a roof.
const outdoors = (w, id) => { const t = w.places.find(p => p.id === id)?.tags ?? []; return t.includes('leisure') && !t.some(x => ['food', 'shop', 'service', 'work', 'study'].includes(x)); };
// Her neighborhood: the map her home is on (the player's, for someone who lives with you).
export const homeMapOf = (g, w, r) => {
    const h = r.homeWith === '__you' ? g.player.home : r.home;
    return w.homes.zones.find(z => z.id === h?.zone)?.map ?? '';
};
// Where she spends her free time. On a working day she stays around home or work (her favorite spots there, or any
// spot for leisure on those maps), and right after a shift near work (drinks after work); on a day off her favorites
// anywhere, and now and then a day out in another town (farther towns less often). On vacation, somewhere away. A
// random hangout is never an adult place; adult places are only for games with adult content.
function leisurePool(g, w, r, day, stepHour, st) {
    const adult = adultOn(g);
    const fun = (p) => !p.link && !!p.tags?.includes('leisure');
    const wild = (p) => fun(p) && !p.adult;
    const banned = adult ? null : adultPlaces(w);
    const pool = r.leisure.length ? r.leisure : w.places.filter(wild).map(p => p.id);
    const all = banned?.size ? pool.filter(id => !banned.has(id)) : pool;
    const on = all.filter(id => placeOn(g, w, id)); // a scenario: only the rooms of this game
    const mine = on.length ? on : isScenario(w) ? w.places.filter(p => fun(p) && placeOn(g, w, p.id)).map(p => p.id) : all;
    if (isScenario(w))
        mine.push(...extraRooms(g).filter(fun).map(p => p.id)); // rooms added for this game are used too
    const homeMap = homeMapOf(g, w, r);
    if (!homeMap || w.maps.length < 2)
        return mine;
    const mapOf = (id) => w.places.find(p => p.id === id)?.map;
    const job = isScenario(w) ? null : jobOf(g, w, r);
    const workMap = job ? mapOf(job.place) : undefined;
    const near = (map) => w.places.filter(p => wild(p) && p.map === map).map(p => p.id);
    if (!st && !isScenario(w))
        st = stampOf(g, w);
    if (st && onVacation(g, w, r, day, st)) {
        const far = w.places.filter(p => wild(p) && p.map !== homeMap && p.map !== workMap).map(p => p.id);
        if (far.length)
            return far;
    }
    if (!(st ? dayOff(g, w, r, day, st) : isWeekend(day))) {
        if (workMap && workMap !== homeMap && afterWork(g, w, r, day, stepHour, st)) {
            const own = mine.filter(id => mapOf(id) === workMap);
            const n = near(workMap);
            if (own.length || n.length)
                return own.length ? own : n;
        }
        const own = mine.filter(id => mapOf(id) === homeMap || (!!workMap && mapOf(id) === workMap));
        return own.length ? own : near(homeMap).length ? near(homeMap) : mine;
    }
    // a day out: one in three days off (one in two on a holiday with no place of its own, like Golden Week)
    const holiday = festivalsOn(g, w, day).some(f => !f.place && (!!f.audience?.length || f.crowd !== undefined));
    if (hash(`${r.avatar}|out|${day}`) % (holiday ? 2 : 3) === 0) {
        const trip = (id) => w.maps.find(m => m.id === mapOf(id))?.trip ?? 0;
        const away = w.places.filter(p => wild(p) && p.map !== homeMap).map(p => p.id).filter(id => trip(id) <= 30 || hash(`${r.avatar}|far|${mapOf(id)}|${day}`) % 1000 < 30000 / trip(id));
        if (away.length)
            return [...mine, ...away];
    }
    return mine;
}
// Within three hours after the end of her shift today (or of her routine's work hours).
function afterWork(g, w, r, day, stepHour, st) {
    const at = day * 1440 + stepHour * 60;
    if (st && scheduled(g, w, r)) {
        for (const d of [day, day - 1]) {
            const s = shiftOn(g, w, r, d, st);
            if (s && at >= s.to && at - s.to < 180)
                return true;
        }
        return false;
    }
    const steps = isWeekend(day) ? r.routine.weekend : r.routine.weekday;
    const i = steps.findIndex(x => x[0] === stepHour);
    return i > 0 && steps[i - 1][1] === 'work';
}
function leisureSpot(g, w, r, day, stepHour, st) {
    let list = leisurePool(g, w, r, day, stepHour, st);
    // a place closed at that hour is out (the living world); with all of them closed, she stays home
    if (systemOn(w, 'living')) {
        list = list.filter(id => openAt(g, w, id, day * 1440 + stepHour * 60));
        if (!list.length)
            return `home:${r.avatar}`;
    }
    // rain changes plans: outdoor spots are skipped for somewhere with a roof (or home)
    // (a region with a weather of its own may be dry while it rains elsewhere)
    const wet = (id) => weatherAt(g, w, id, day).rain;
    // it rains on her plans: an outdoor spot of hers is wet (or, with none, it rains in the world)
    const raining = list.some(id => outdoors(w, id)) ? list.some(id => outdoors(w, id) && wet(id)) : weatherOn(g.world, day).rain;
    if (raining) {
        const dry = list.filter(id => !outdoors(w, id) || !wet(id));
        list = dry.length ? dry : w.places.filter(p => !p.adult && (p.tags ?? []).some(t => t === 'food' || t === 'shop')).map(p => p.id);
        if (!list.length || hash(`${r.avatar}|rain|${day}`) % 3 === 0)
            return `home:${r.avatar}`;
    }
    return list[hash(`${r.avatar}|${day}|${stepHour}`) % list.length] ?? `home:${r.avatar}`;
}
// The step of her routine at a given moment (absolute minutes): [start hour, 'home' | 'work' | 'leisure' | place id].
export function routineStep(r, at) {
    const day = Math.floor(at / 1440), h = Math.floor((at % 1440) / 60);
    const steps = isWeekend(day) ? r.routine.weekend : r.routine.weekday;
    let cur = steps[0];
    for (const s of steps)
        if (s[0] <= h)
            cur = s;
    return cur;
}
/** Out of the house, off-screen (a scenario): not at any place. */
export const OUT = 'out';
// Where her routine puts her at a given moment (plans and company left aside): a role, a standing appointment, a date
// or an outing that day (sim/dayplan.ts), else her shift, else her routine.
export function routineAt(g, w, r, at) {
    return slotAt(g, w, r, at)?.place ?? routineCore(g, w, r, at);
}
// Her shift or her routine template's step. With a job that has a schedule, the template only fills the rest: its
// work hours are free time, and a day off follows its weekend steps.
function routineCore(g, w, r, at, st) {
    const day = Math.floor(at / 1440);
    // someone who lives with you (or with someone else) is at that home
    const homeId = r.homeWith === '__you' ? 'home:player' : r.homeWith ? `home:${r.homeWith}` : `home:${r.avatar}`;
    // Home: a job you wrote for them has its shift (out of the house while it lasts); without one, their routine
    if (isScenario(w)) {
        const [start, target] = routineStep(r, at);
        const j = homeJobOf(r), out = npcOut(g);
        if (out && onShift(j, at))
            return OUT;
        const shifted = !!SHIFTS.find(x => x.id === j.shift && x.from !== undefined) || j.shift === 'off';
        if (target === 'work' && shifted)
            return leisureSpot(g, w, r, day, start); // their own hours replace the routine's
        if (target === 'home')
            return homeId;
        // work, errands and nights out happen off-screen (`OUT`), and they come back later (or they stay in)
        if (target === 'work' || target === 'out')
            return out ? OUT : leisureSpot(g, w, r, day, start);
        if (target === 'leisure')
            return eventSpot(g, w, r.avatar, at) ?? festivalSpot(g, w, at, { map: homeMapOf(g, w, r) }) ?? leisureSpot(g, w, r, day, start);
        return w.places.some(p => p.id === target) && placeOn(g, w, target) ? target : leisureSpot(g, w, r, day, start);
    }
    st ??= stampOf(g, w);
    const shift = scheduled(g, w, r) ? shiftAt(g, w, r, at, st) : null;
    if (shift)
        return shift.place;
    const step = dayStep(g, w, r, at, st), start = step[0];
    const target = step[1] === 'work' && scheduled(g, w, r) ? 'leisure' : step[1];
    if (target === 'home')
        return homeId;
    if (target === 'work') {
        const job = jobOf(g, w, r);
        return job ? workPlace(g, w, r, job) : leisureSpot(g, w, r, day, start, st);
    }
    if (target === 'leisure')
        return eventSpot(g, w, r.avatar, at) ?? festivalSpot(g, w, at, { map: homeMapOf(g, w, r) }) ?? leisureSpot(g, w, r, day, start, st); // on a festival day, free time is spent there
    return w.places.some(p => p.id === target) && placeOn(g, w, target) && (adultOn(g) || !w.places.find(p => p.id === target)?.adult) ? target : homeId;
}
/** Where they work at that moment (their shift, their routine's work hours for a job without a schedule, or working
 *  late), or null when they aren't working. */
export function workingAt(g, w, r, at) {
    const job = isScenario(w) ? (systemOn(w, 'jobs') ? w.occupations.find(o => o.id === r.occupation) : null) : jobOf(g, w, r);
    if (!job)
        return null;
    const place = isScenario(w) ? job.place : workPlace(g, w, r, job);
    if (scheduled(g, w, r)) {
        const s = shiftAt(g, w, r, at);
        if (s)
            return s.place;
    }
    else if (routineStep(r, at)[1] === 'work')
        return place;
    return breakNow(g, w, r, at)?.kind === 'late' ? place : null;
}
export function whereNow(g, w, r) {
    if (isWith(g, r.avatar))
        return g.player.loc; // she came along with you
    const locked = lockedHere(g, r.avatar); // in the middle of a conversation with you
    if (locked)
        return locked;
    const appt = appointmentNow(g, r.avatar); // plans with you win over the routine
    if (appt)
        return appt.place;
    const left = g.swap?.left?.[r.avatar]; // the one you played until now stays where you left them for a while
    if (left && nowAbs(g) < left.until)
        return left.loc;
    const party = partySpot(g, w, r.avatar); // a scenario's house party: everyone in the common rooms
    if (party)
        return party;
    const story = broughtNow(g, r.avatar); // a street story has brought her to its place
    if (story)
        return story.place;
    const brk = breakNow(g, w, r); // something interrupted her routine today (an errand, a cold…)
    if (brk)
        return brk.place;
    if (isScenario(w))
        return routineNow(g, w, r);
    const st = stampOf(g, w);
    const slot = slotAt(g, w, r, nowAbs(g), st); // a role, a standing appointment, a date, an outing
    if (slot)
        return slot.place;
    return routineNow(g, w, r, st);
}
const kept = new WeakMap();
function routineNow(g, w, r, st) {
    const at = nowAbs(g), n = changes(), c = g.cfg;
    let k = kept.get(g);
    // (outside a Home, the day plan's stamp covers the rules: the systems, the length of the seasons)
    const rules = st ? '' : rulesOf(w, c);
    if (!k || k.at !== at || k.w !== w || k.n !== n || k.features !== w.features || k.cfg !== c || k.st !== st || k.rules !== rules)
        kept.set(g, k = { at, w, n, features: w.features, cfg: c, rules, st, by: new Map() });
    const hw = r.homeWith, job = homeJobOf(r), mine = hw === '__you' ? g.player.home?.zone : undefined;
    const x = k.by.get(r.avatar);
    if (x && x.r === r && x.routine === r.routine && x.job === r.occupation && x.hw === hw && x.zone === r.home?.zone && x.mine === mine
        && x.leisure === r.leisure && x.n === r.leisure.length && x.shift === job.shift && x.days === job.days)
        return x.loc;
    const loc = routineCore(g, w, r, at, st);
    k.by.set(r.avatar, { r, routine: r.routine, job: r.occupation, hw, zone: r.home?.zone, mine, leisure: r.leisure, n: r.leisure.length, shift: job.shift, days: job.days, loc });
    return loc;
}
// The systems and save rules a routine reads (a Home's rooms, the length of the seasons for festivals).
const rulesOf = (w, c) => `${systemOn(w, 'living')}|${systemOn(w, 'jobs')}|${systemOn(w, 'events')}|${systemOn(w, 'festivals')}|${c?.seasonDays}|${c?.npcOut}|${c?.rooms?.join(',')}|${c?.extraRooms?.length}`;
export const residents = (g) => Object.values(g.cast);
// (someone you are playing as is not "here": you are them)
const selfOf = (g) => { const s = g.swap; return s ? (s.avatar || s.origCard || '') : ''; };
export const presentAt = (g, w, loc) => residents(g).filter(r => r.avatar !== selfOf(g) && whereNow(g, w, r) === loc);
