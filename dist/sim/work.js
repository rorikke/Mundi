// Jobs: getting hired, a weekly schedule of shifts at the job's place (or off-screen), pay per hour (more for night
// hours, raised when the work rules give you fewer days), performance, days off, promotions that ask for time in the
// rank, performance and skills, careers that take about a game year to the top, and things that happen at work.
// The work rules (presets Realistic, Reduced, Relaxed, or your own) ease or switch off each pressure per save.
// Moving home and the bank's ledger live here too (the money side of the world).
import { hobbyFits, hobbyNeed, levelOf, trainSkill, skillName } from './hobbies.js';
import { addRep } from './standing.js';
import { lex } from '../core/lexicon.js';
import { bump, bondOf, social } from './social.js';
import { approvalOf, startRumor } from './living.js';
import { npcRank } from './longlife.js';
import { retryIn, interview, interviewChance, countUp } from './skills.js';
import { missingCourses, hasCourse, courseOf } from './courses.js';
import { needCourseText } from './coursenudge.js';
import { rollBonus, rollD20, bonusLabel } from './dice.js';
import { tallyRoll, tallyEvent } from './tally.js';
import { effectMul } from './effects.js';
import { addBoost } from './perks.js';
import { cleanEffects } from '../core/traits.js';
import { BOOST_LIMITS } from '../core/goals.js';
import { payOf, priceOf, resetBills, difficultyOf } from './bills.js';
import { note } from './facts.js';
import { cfg, nowAbs, adultOn } from '../core/store.js';
import { career, systemOn, getWorld, offScreenWork, isScenario, WEEKDAY_IDS } from '../core/world.js';
import { scheduleOf } from '../core/presets.js';
import { advance, hour, hm, seasonDays, WEEKDAYS } from './time.js';
import { addStatus, money } from './needs.js';
import { book } from './ledger.js';
import { onHour, onDay, onLook, studentLink } from './hooks.js';
import { queueMoment } from './moments.js';
import { shiftOn as npcShiftOn, slotAt, placeOk, bringTo } from './dayplan.js';
import { festivalsOn } from './festivals.js';
import { openAt } from './daynight.js';
import { whenHolds, personNamed, parseWhen, favorOwed, levelHolds } from './when.js';
import { callInFavor } from './stories.js';
import { presentAt, workingAt } from './people.js';
import { placeOf, travelMinutes } from './places.js';
import { ailOf } from './afflictions.js';
import { fr, YOU } from './rel.js';
import { trackOf, playerTrack, layTrack, trackName } from './tracks.js';
import { workRisk } from './caught.js'; // (adult) a choice with a risk of a raid
export { ledger, book } from './ledger.js';
export { trackOf, jobTrack, playerTrack, layTrack, needsPick, tracksOf, trackName } from './tracks.js';
export { scheduleOf } from '../core/presets.js';
// The job with what older code (a new game's job, "Play as") may not have set yet.
function jobOf(g) {
    const j = g.player.job;
    if (j) {
        j.perf ??= 50;
        j.since ??= nowAbs(g);
        j.checked ??= g.day;
    }
    return j;
}
export const jobDef = (w, id) => w.occupations.find(o => o.id === id) ?? null;
/** The job you hold as you work it (your track laid over it). */
export const myJob = (g, w) => { const o = jobDef(w, g.player.job?.id); return o ? trackOf(g, o) : null; };
export const traitsOf = (g) => Object.values(g.player.traits ?? {}).flat();
export const fits = (g, o, w) => { o = trackOf(g, o); return (!o.needs?.length || o.needs.some(t => traitsOf(g).includes(t))) && hobbyFits(g, w ?? getWorld(g.world), o); };
export const likes = (g, o) => careerOf(g, o).likes.filter(t => traitsOf(g).includes(t));
/** The courses a job asks for that you haven't finished (ones the world no longer has, or has retired, aren't asked
 *  for). Applying goes through `missingCourses` (sim/courses.ts), which also lets a student rank take you while enrolled. */
const askedCourses = (g, w, o) => (o.courses ?? []).filter(id => { const c = courseOf(w, id); return !!c && !c.retired && !hasCourse(g, id); });
/** At a job's student rank while its course isn't finished: leaving the rank asks for it. */
export const studentGap = (g, w, o) => { o = trackOf(g, o); return rankOf(g, o)?.student ? askedCourses(g, w, o).map(id => courseOf(w, id).name) : []; };
// The job's opening hours (whether it is open at all now).
export const isOpen = (g, o) => { const [a, b] = o.hours ?? [0, 24]; const h = hour(g); return a <= b ? h >= a && h < b : h >= a || h < b; };
// Adult content (E15): its switch is the new game's; until then, a save setting.
/** (E20) Jobs open to the player: not the ones only the world's people have, nor adult ones without adult content. A job
 *  with tracks: open on your track (its `hireable` and `hire`), or, with a track to pick, on one of them. */
export const openJobs = (g, w) => w.occupations.filter(o => (!o.adult || adultOn(g)) && (o.tracks ? trackOpen(g, w, o) : openOn(g, w, o)));
/** Open to you on this track (or a job without tracks): hireable, and its `hire` condition (an introduction) holds. */
const openOn = (g, w, o) => o.hireable !== false && (!o.hire || (Array.isArray(o.hire) ? o.hire : [o.hire]).some((h, i) => whenHolds(g, w, h, { place: o.place, key: `hire|${o.id}|${o.track ?? ''}|${i}` })));
/** The tracks you could be hired on: yours, or with none of your own, every one open to you (the pick). */
export function openTracks(g, w, o) {
    const mine = playerTrack(g, o);
    return (mine !== undefined ? [mine] : Object.keys(o.tracks ?? {})).filter(id => openOn(g, w, layTrack(o, id)));
}
const trackOpen = (g, w, o) => (playerTrack(g, o) === undefined && !Object.keys(o.tracks ?? {}).length ? o.hireable !== false : openTracks(g, w, o).length > 0);
/** (E20) Worked off-screen: every job in a Home, and jobs marked so (you go to work from anywhere). */
export const offScreen = (w, o) => offScreenWork(w) || !!o?.offScreen;
/** (E20) Where a rank works: its own place (an idol's top ranks at the TV studio), or the job's. */
export const rankPlace = (o, rank) => rank?.place || o.place;
/** Where you work now (your rank's place). */
export const jobPlace = (g, o) => { o = trackOf(g, o); return rankPlace(o, rankOf(g, o)); };
/** At the place where you can work your shift (anywhere for an off-screen job). */
export const atWork = (g, w, o) => offScreen(w, trackOf(g, o)) || g.player.loc === jobPlace(g, o);
export const WORK_PRESETS = [
    { id: 'realistic', name: 'Realistic', desc: 'Every job keeps its real days. A missed shift costs you, lateness counts after 15 minutes, and low performance can get you fired.',
        rules: { days: 1, missed: 10, grace: 15, low: 'fire', vacation: 14, sick: 'ill', events: 0.35, gentle: false, speed: 1 } },
    { id: 'reduced', name: 'Reduced', desc: 'About three quarters of the days, paid more per shift so a week earns the same. Gentler on absences and lateness; careers a little faster.',
        rules: { days: 0.75, missed: 5, grace: 30, low: 'demote', vacation: 7, sick: 'sometimes', events: 0.2, gentle: false, speed: 1.25 } },
    { id: 'relaxed', name: 'Relaxed', desc: 'About half the days, paid more per shift so a week earns the same. Skip a shift whenever you like; nothing at work goes badly; careers faster.',
        rules: { days: 0.5, missed: 0, grace: null, low: 'warn', vacation: 0, sick: 'any', events: 0.1, gentle: true, speed: 1.5 } },
];
const workCfg = (g) => (cfg(g).work ??= {});
/** The preset a world starts with: its own, or Relaxed in a Home (work is off-screen there), Realistic elsewhere. */
export const worldPreset = (w) => w?.workPreset || (isScenario(w) ? 'relaxed' : 'realistic');
export const presetOf = (g, w) => WORK_PRESETS.find(p => p.id === (workCfg(g).preset ?? worldPreset(w))) ?? WORK_PRESETS[0];
/** The preset shown: 'custom' once one of its rules was changed. */
export const presetShown = (g, w) => (Object.keys(workCfg(g).custom ?? {}).length ? 'custom' : presetOf(g, w).id);
export const workRules = (g, w) => ({ ...presetOf(g, w).rules, ...(workCfg(g).custom ?? {}) });
export function setPreset(g, id) { const c = workCfg(g); c.preset = id; delete c.custom; }
export function setRule(g, w, k, v) {
    const c = workCfg(g);
    c.preset ??= presetOf(g, w).id;
    const custom = (c.custom ??= {});
    if (presetOf(g, w).rules[k] === v)
        delete custom[k];
    else
        custom[k] = v;
    if (!Object.keys(custom).length)
        delete c.custom;
}
export const resetRules = (g) => { delete cfg(g).work; };
/** (J4) How fast careers go: the world's career speed × the save's (the work rules) × the difficulty's. */
export const careerSpeed = (g, w) => Math.max(0.05, (w.careerSpeed ?? 1) * workRules(g, w).speed * (difficultyOf(g).career ?? 1));
/* ---------- the schedule (J1) ---------- */
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return h >>> 0; };
const wdOf = (day) => (((day - 1) % 7) + 7) % 7; // 0 Monday … 6 Sunday
/** The days a week the job lists (the realistic ones), or a rank's own (`Rank.days`: an extra called once a week). */
export const realDays = (o, rank) => { const d = rank?.days ?? scheduleOf(o).days; return Math.max(1, Math.min(7, Array.isArray(d) ? d.length : Math.round(d))); };
// The days a week of the job at the rank you hold in it (the job's own when it isn't yours).
const weekDays = (g, o) => realDays(o, g.player.job?.id === o.id ? rankOf(g, o) : null);
// The days a week the work rules give a job (at least one).
const ruleDays = (g, w, o) => Math.max(1, Math.min(weekDays(g, o), Math.round(weekDays(g, o) * workRules(g, w).days)));
/** The days a week you work it under the work rules (at least one), and no more than a student may (sim/degrees.ts: a
 *  part-time cap while you study for a degree, which isn't paid back by a higher hourly pay). */
export const daysAWeek = (g, w, o) => { o = trackOf(g, o); const cap = studentLink.workCap(g, w); return Math.max(1, Math.min(ruleDays(g, w, o), cap ?? 7)); };
/** Your working weekdays (0 Monday … 6 Sunday): the job's own weekdays, the first ones when you work fewer; for a
 *  number of days, an office week (Monday on) for a full-time job worked four days or more, and otherwise the days
 *  spread over the week (from Monday for a full-time job; shops and restaurants work weekends), the same for the same
 *  job. */
export function workdays(g, w, o) {
    o = trackOf(g, o);
    const s = scheduleOf(o), n = daysAWeek(g, w, o);
    if (Array.isArray(s.days))
        return s.days.map(d => WEEKDAY_IDS.indexOf(d)).filter(i => i >= 0).slice(0, n).sort((a, b) => a - b);
    if (weekDays(g, o) >= 5 && n >= 4)
        return [0, 1, 2, 3, 4, 5, 6].slice(0, n);
    const off = weekDays(g, o) >= 5 ? 0 : H(o.id) % 7;
    return [...new Set(Array.from({ length: n }, (_, k) => (off + Math.floor((k * 7) / n)) % 7))].sort((a, b) => a - b);
}
/** The hours of your shift [from, to): the shift you work in a job worked round the clock, or the schedule's. */
export function shiftHours(g, o) {
    o = trackOf(g, o);
    const s = scheduleOf(o);
    if (s.shifts?.length)
        return s.shifts.find(x => x.id === jobOf(g)?.shift) ?? s.shifts[0];
    const [a, b] = o.hours ?? [0, 24];
    return { from: s.from ?? a, to: s.to ?? b };
}
const span = (from, to) => (((to - from) % 24) + 24) % 24 || 24;
export function shiftOn(g, w, o, day) {
    o = trackOf(g, o);
    if (!workdays(g, w, o).includes(wdOf(day)))
        return null;
    const j = g.player.job;
    if (j?.id === o.id && j.start !== undefined && day < j.start)
        return null; // (signed, not working yet)
    const sh = shiftHours(g, o), long = span(sh.from, sh.to);
    const hours = Math.max(1, Math.min(o.shift, long));
    const start = day * 1440 + Math.round(sh.from * 60), end = start + long * 60;
    return { day, start, end, hours, latest: end - hours * 60 };
}
const EARLY = 120; // you may set off for work up to two hours before your shift (the time waits until it starts)
const worked = (j, day) => (j.worked ?? []).includes(day);
const offOn = (j, day) => j.off?.[day];
/** The shift you can work now: today's, or last night's still going; null when there's none (or it was worked). */
export function shiftNow(g, w, o) {
    const j = jobOf(g);
    if (!j)
        return null;
    o = trackOf(g, o);
    const now = nowAbs(g);
    for (const d of [g.day, g.day - 1, g.day + 1]) {
        const s = shiftOn(g, w, o, d);
        if (s && now >= s.start - EARLY && now <= s.end - 60 && !worked(j, d) && !offOn(j, d))
            return s;
    }
    return null;
}
/** Your next shift from now (not worked, not booked off). */
export function nextShift(g, w, o, from = nowAbs(g)) {
    const j = jobOf(g);
    if (!j)
        return null;
    o = trackOf(g, o);
    if (j.id === o.id && j.start !== undefined)
        from = Math.max(from, j.start * 1440);
    for (let d = Math.floor(from / 1440) - 1; d <= Math.floor(from / 1440) + 8; d++) {
        const s = shiftOn(g, w, o, d);
        if (s && s.end - 60 > from && !worked(j, d) && !offOn(j, d))
            return s;
    }
    return null;
}
/** What the work button can do now: work your shift (`early`: waiting for it to start; `late`: past the grace),
 *  overtime outside it (the job allows it and the place is open), or nothing (`why`). */
export function canWork(g, w, o) {
    o = trackOf(g, o);
    const s = shiftNow(g, w, o), now = nowAbs(g), grace = workRules(g, w).grace;
    if (s)
        return { kind: 'shift', shift: s, early: now < s.start, late: grace !== null && now > s.latest + grace };
    const j = jobOf(g);
    if (o.overtime && isOpen(g, o) && j?.extraDay !== g.day && !(j?.start !== undefined && g.day < j.start))
        return { kind: 'overtime' }; // one overtime shift a day
    const n = nextShift(g, w, o);
    return { kind: 'none', why: n ? `Your next shift: ${whenText(g, n)}.` : 'No shift this week.' };
}
/** "today 09:00–18:00", "Tuesday 22:00–07:00". */
export function whenText(g, s) {
    const d = s.day === g.day ? 'today' : s.day === g.day + 1 ? 'tomorrow' : s.day === g.day - 1 ? 'last night' : WEEKDAYS[wdOf(s.day)];
    return `${d} ${hm(s.start % 1440)}–${hm(s.end % 1440)}`;
}
/** Your week: each working weekday with its hours. */
export function weekText(g, w, o) {
    o = trackOf(g, o);
    const sh = shiftHours(g, o);
    return `${workdays(g, w, o).map(i => WEEKDAYS[i].slice(0, 3)).join(', ')} · ${hm(Math.round(sh.from * 60) % 1440)}–${hm(Math.round(sh.to * 60) % 1440)}`;
}
/** What effects (life goals' perks, boosts) do to what this job pays: `wage` (shifts and overtime), `bonus` (the
 *  seasonal bonuses), `tips` (money from a choice at work); also aimed at the job, its place or the place's tags. */
export const payMul = (g, w, o, what) => { o = trackOf(g, o); return effectMul(g, w, 'pay', [what, o.id, ...jobTags(g, o), o.place, ...(w.places.find(p => p.id === o.place)?.tags ?? [])]); };
/** Pay per hour for this rank: the rank's pay, raised so a week earns the same with fewer days (J9). */
export const payFactor = (g, w, o) => weekDays(g, trackOf(g, o)) / ruleDays(g, w, trackOf(g, o));
export const hourlyPay = (g, w, o) => rankOf(g, o).pay * payFactor(g, w, o);
// Minutes of a stretch of time that fall in the night (22:00–5:00), for night pay (E20).
function nightMinutes(start, minutes) {
    let n = 0;
    for (let t = start; t < start + minutes; t += 15) {
        const h = (t % 1440) / 60;
        if (h >= 22 || h < 5)
            n += Math.min(15, start + minutes - t);
    }
    return n;
}
/* ---------- a good word from someone high up (a referral) ---------- */
// Someone you know who holds a high rank (3 or more) at their job can recommend you there, if they like you enough, or
// if they owe you a favor (a street story's): then they say yes, and the favor is spent.
export const REFER_RANK = 2, REFER_BOND = 40;
export function canRefer(g, w, avatar) {
    const r = g.cast[avatar];
    const job = r && jobDef(w, r.occupation), o = job && trackOf(g, job);
    if (!r || !o || !r.met || !systemOn(w, 'jobs') || g.player.job?.id === o.id || o.hireable === false)
        return null;
    if (npcRank(g, avatar) < REFER_RANK || (bondOf(g, avatar) < REFER_BOND && !favorOwed(g, avatar)))
        return null;
    return o;
}
const asked = (g) => ((g.living ??= {}).refAsked ??= {});
export const askedThisWeek = (g, avatar) => g.day - (asked(g)[avatar] ?? -99) < 7;
export function referralFor(g, jobId) {
    const ref = g.referral;
    return ref && ref.job === jobId && g.day <= ref.until && g.cast[ref.avatar] ? ref.avatar : null;
}
export function askReferral(g, w, avatar) {
    const o = canRefer(g, w, avatar);
    const r = g.cast[avatar];
    if (!o || !r)
        return { ok: false, text: '' };
    if (askedThisWeek(g, avatar))
        return { ok: false, text: `You already asked ${r.name} this week.` };
    asked(g)[avatar] = g.day;
    const chance = 0.35 + bondOf(g, avatar) / 200 + approvalOf(g, avatar) / 200;
    const no = bondOf(g, avatar) < REFER_BOND || Math.random() >= chance;
    if (no && favorOwed(g, avatar) > 0) {
        callInFavor(g, avatar);
        note(g, '{u} called in the favor {0} owed them.', [r.name], [avatar], g.player.loc, 'work');
    }
    else if (no) {
        note(g, '{u} asked {0} for a good word at {1}; {0} could not promise anything.', [r.name, o.name], [avatar], g.player.loc, 'work');
        return { ok: false, text: `${r.name} would rather not vouch for anyone at ${o.name} right now.` };
    }
    g.referral = { job: o.id, avatar, until: g.day + 14 };
    note(g, '{0} agreed to put in a good word for {u} at {1}.', [r.name, o.name], [avatar], g.player.loc, 'work');
    return { ok: true, text: `${r.name} will put in a good word for you at ${o.name}: apply within two weeks and you are in (if you have the courses it asks for).` };
}
/* ---------- careers and their branches ---------- */
export { career } from '../core/world.js';
const jobPath = (g) => g.player.job?.path ?? [];
// Your career in this job (for someone else's: a path picked for them, the same every time).
// (on your track: sim/tracks.ts)
export const careerOf = (g, o) => career(trackOf(g, o), g.player.job?.id === o.id ? jobPath(g) : []);
// With the save: the path the world gave them (a rank named in a branch, see `pathTo`), kept in `living.paths`; and
// their own track (their gender's).
export function npcCareer(o, avatar, g) {
    if (g)
        o = trackOf(g, o, avatar);
    const path = [...((g && npcPath(g, avatar, o)) ?? [])];
    for (let n = path.length; n < 4; n++) {
        const c = career(o, path);
        if (!c.open)
            return c;
        // (an adult path isn't one of theirs with adult content off)
        const opts = c.open.options.filter(x => !x.adult || (!!g && adultOn(g))), from = opts.length ? opts : c.open.options;
        path.push(from[H(`${avatar}|${o.id}|${n}`) % from.length].id);
    }
    return career(o, path);
}
/** The path the save keeps for one of the world's people in this job (null: none, the picked one holds). */
export function npcPath(g, avatar, o) {
    const p = g.living?.paths?.[avatar];
    return p && p.job === o.id ? p.path : null;
}
export function setNpcPath(g, avatar, o, path) { ((g.living ??= {}).paths ??= {})[avatar] = { job: o.id, path }; }
/** The path through a job's branches that reaches a rank of this name (the shortest), with its index; null when no
 *  path does. */
export function pathTo(o, name) {
    const want = name.trim().toLowerCase();
    let paths = [[]];
    for (let depth = 0; depth < 5 && paths.length; depth++) {
        const next = [];
        for (const p of paths) {
            const c = career(o, p);
            const i = c.ranks.findIndex(r => r.name.trim().toLowerCase() === want);
            if (i >= 0)
                return { path: p, rank: i };
            for (const x of c.open?.options ?? [])
                next.push([...p, x.id]);
        }
        paths = next;
    }
    return null;
}
// The whole career from a path: the paths not chosen yet taken as their first option (what the top is measured on).
function fullCareer(o, path) {
    const p = [...path];
    for (let n = 0; n < 6; n++) {
        const c = career(o, p);
        if (!c.open)
            return c;
        p.push(c.open.options[0].id);
    }
    return career(o, p);
}
// The rank you hold (its name and pay), and the one after it.
export const rankOf = (g, o) => { const c = careerOf(g, o); return c.ranks[Math.min(g.player.job?.rank ?? 0, c.ranks.length - 1)]; };
export const nextRankOf = (g, o) => careerOf(g, o).ranks[(g.player.job?.rank ?? 0) + 1] ?? null;
// A branch waiting for you: you are at its rank.
export function pendingBranch(g, o) {
    const j = g.player.job;
    if (!j || j.id !== o.id)
        return null;
    const c = careerOf(g, o);
    return c.open && j.rank >= c.ranks.length - 1 ? c.open : null;
}
/** The kinds of job it is for you: its own tags, and those of the paths you took in it (while you hold it). */
export function jobTags(g, o) {
    const j = g.player.job, own = o.tags ?? [];
    if (!j || j.id !== o.id || !(j.path ?? []).length)
        return own;
    const opts = (o.branches ?? []).flatMap(b => b.options ?? []).filter(x => (j.path ?? []).includes(x.id));
    return [...new Set([...own, ...opts.flatMap(x => x.tags ?? [])])];
}
/** A branch's paths as you can take them: an adult one only with adult content on (else not offered at all), one with
 *  `hire` open only when one of its conditions holds (else shown closed, with its `closed` line). */
export function pathChoices(g, w, b) {
    return b.options.filter(x => !x.adult || adultOn(g)).map(opt => ({ opt, open: !opt.hire || (Array.isArray(opt.hire) ? opt.hire : [opt.hire]).some((h, i) => whenHolds(g, w, h, { key: `path|${opt.id}|${i}` })) }));
}
/** Why a path is closed to you: its own words, else a general line. */
export const closedText = (opt) => opt.closed?.trim() || 'Not open to you yet: it takes an introduction, or being very good at it already.';
// Choosing a path: it decides the ranks that come next.
export function choosePath(g, w, optionId) {
    const j = g.player.job;
    const o = myJob(g, w);
    if (!j || !o)
        return '';
    const b = pendingBranch(g, o);
    const c = b && pathChoices(g, w, b).find(x => x.opt.id === optionId), opt = c?.opt;
    if (!b || !opt)
        return '';
    if (!c.open)
        return closedText(opt);
    (j.path ??= []).push(opt.id);
    delete j.toldBranch;
    note(g, '{u} chose a path at work: {0} ({1}).', [opt.name, o.name], [], o.place, 'work');
    return `You chose ${opt.name}. Next: ${opt.ranks[0]?.name ?? ''}.`;
}
/* ---------- how long a career takes (J4) ---------- */
/** A game year in days (four seasons), so a career follows the season length. */
export const yearDays = (g) => 4 * seasonDays(g);
/** Days to reach the top, played well: a year × the job's length (× its track's pace), at the career speed. */
export const topDays = (g, w, o) => { const t = trackOf(g, o); return (yearDays(g) * (t.length ?? 1) * (t.pace ?? 1)) / careerSpeed(g, w); };
/** The days a rank takes, played well: the career's time shared out by its promotion weights (`promote`: entry ranks
 *  short, the last ones long). Liked traits make each a little shorter. */
export function rankDays(g, w, o, rank, path = jobPath(g), traits = traitsOf(g)) {
    o = trackOf(g, o);
    const c = fullCareer(o, path);
    const weights = c.promote.slice(0, Math.max(0, c.ranks.length - 1));
    const sum = weights.reduce((a, b) => a + Math.max(0.1, b), 0);
    if (!sum || rank >= weights.length)
        return 0;
    const liked = Math.min(3, c.likes.filter(t => traits.includes(t)).length);
    // (a path's pace: reaching one of its ranks takes that many times as long)
    return (topDays(g, w, o) * Math.max(0.1, weights[rank]) / sum) * (c.pace?.[rank + 1] ?? 1) * (1 - 0.05 * liked) * effectMul(g, w, 'career', 'rank');
}
// What a promotion asks of the performance, unless the rank says otherwise.
export const PROMO_PERF = 60;
export const perfOf = (g) => Math.round(jobOf(g)?.perf ?? 50);
/** The performance a rank asks for: `needs.performance`, or `perf` in its `when` ("a high performance": `perf: 80`),
 *  the higher of them, else the usual 60. */
export function perfWanted(r) {
    const said = parseWhen(r.when).conds.filter(c => c.key === 'perf' && !c.not).map(c => Number(c.values[0]));
    return Math.max(r.needs?.performance ?? (said.length ? 0 : PROMO_PERF), ...said);
}
// A rank's condition without its `perf` parts (they're asked as the performance, and said as "performance 80").
function whenBesidesPerf(when) {
    if (typeof when !== 'string')
        return when;
    const rest = when.split(';').filter(p => !/^\s*`?perf\s*:/i.test(p)).join(';').trim();
    return rest || undefined;
}
export function promoNeeds(g, w, o) {
    o = trackOf(g, o);
    const j = jobOf(g);
    const next = nextRankOf(g, o);
    if (!j || j.id !== o.id || !next || pendingBranch(g, o))
        return null;
    const d = rankDays(g, w, o, j.rank);
    const perf = perfOf(g), want = perfWanted(next);
    const shifts = (d * daysAWeek(g, w, o)) / 7 * (1.3 - (0.3 * perf) / 100);
    const days = d * 0.5, inRank = (nowAbs(g) - (j.since ?? nowAbs(g))) / 1440;
    const skills = Object.entries(next.needs ?? {}).filter(([id]) => id !== 'performance').map(([id, need]) => ({ id, name: skillName(w, id), need, have: levelOf(g, id) }));
    const traits = next.traits ?? [];
    const missing = [];
    if (j.shifts + 1e-6 < shifts)
        missing.push('more shifts');
    if (inRank + 1e-6 < days)
        missing.push('more time in the rank');
    if (perf < want)
        missing.push(`performance ${want}`);
    for (const s of skills)
        if (s.have < s.need)
            missing.push(`${s.name} ${s.need}`);
    if (traits.length && !traits.some(t => traitsOf(g).includes(t)))
        missing.push(traits.join(' or '));
    // (a retired course nobody can take any more isn't asked for: the rank would be out of reach forever)
    if (next.course && courseOf(w, next.course) && !courseOf(w, next.course).retired && !hasCourse(g, next.course))
        missing.push(courseOf(w, next.course).name);
    for (const c of studentGap(g, w, o))
        if (!missing.includes(c))
            missing.push(c); // the way out of the student rank
    const rest = whenBesidesPerf(next.when);
    const when = rest ? whenHolds(g, w, rest, { place: rankPlace(o, next), key: `promo|${o.id}|${j.rank}` }) : undefined;
    if (when === false)
        missing.push(...whenMissing(g, w, rest, rankPlace(o, next)));
    return { rank: next, shifts, have: j.shifts, days, inRank, perf: want, skills, traits, course: next.course, when, ready: !missing.length, missing };
}
// What a rank's condition still asks, in words for the work screen: skills ("Logic 2 or Drawing 2") and friendships
// ("friendship with Kyōko (Good friend)"); anything else is "something more".
// A degree named in a condition (a degree's id is its credential): "a degree in Economics".
const degreeWord = (w, id) => { const d = (w.institutions ?? []).flatMap(i => i.degrees ?? []).find(x => x.id === id); return d ? `a degree (${d.name})` : undefined; };
const FRIEND_WORDS = { acquaintance: 'Acquaintance', friend: 'Friend', good: 'Good friend', best: 'Best friend' };
function whenMissing(g, w, when, place) {
    const out = [];
    let other = false;
    for (const c of parseWhen(when).conds) {
        const text = `${c.not ? 'not ' : ''}${c.key}: ${c.values.join(' or ')}`;
        if (whenHolds(g, w, text, { place }))
            continue;
        if (c.key === 'skill' && !c.not)
            out.push(c.values.map(v => { const [id, n] = v.split(/\s+/); return `${skillName(w, id)} ${n ?? ''}`.trim(); }).join(' or '));
        else if (c.key === 'course' && !c.not)
            out.push(c.values.map(v => (/^\d+$/.test(v) ? `${v} courses finished` : courseOf(w, v)?.name ?? degreeWord(w, v) ?? v)).join(' or '));
        else if (c.key === 'feels' && !c.not && c.values.length === 1) {
            const [who, lvl] = c.values[0].split(/\s+/);
            out.push(`friendship with ${who} (${FRIEND_WORDS[lvl] ?? lvl})`);
        }
        else
            other = true;
    }
    return other || !out.length ? [...out, 'something more'] : out;
}
// Shifts still needed for the next rank. null: no next rank (or a path to choose).
export function shiftsToPromote(g, o, _rank) {
    const w = getWorld(g.world);
    const p = w && promoNeeds(g, w, o);
    return p ? Math.max(1, Math.ceil(p.shifts * 100) / 100) : null;
}
/** Progress to the next rank, 0–100 (the slowest of shifts and time; skills and the rest shown apart). */
export function promoProgress(p) { return Math.max(0, Math.min(100, Math.floor(Math.min(p.have / Math.max(0.01, p.shifts), p.inRank / Math.max(0.01, p.days)) * 100))); }
/* ---------- getting hired, quitting ---------- */
// Applying is a job interview: a d20 where the traits the job looks for are your bonus. Some jobs need a course first.
// A job with tracks takes you on yours; with none of your own you pick one (`track`), once: without it, `pick` lists the
// tracks open to you (one alone is taken). A track can ask for an introduction (`hire`) and a fee when you start, which a
// course it lists, finished, waives.
export function hire(g, w, id, track) {
    const job = jobDef(w, id);
    if (!job || (job.adult && !adultOn(g)))
        return { ok: false, text: job ? 'They are not hiring.' : '' };
    let key;
    if (job.tracks && Object.keys(job.tracks).length) {
        const open = openTracks(g, w, job), mine = playerTrack(g, job);
        key = track !== undefined && mine === undefined ? track : mine;
        if (key === undefined && open.length === 1)
            key = open[0];
        if (key === undefined && open.length > 1)
            return { ok: false, text: `${job.name}: choose the track you'll work on (${open.map(t => trackName(w, job, t)).join(' or ')}). It can't be changed later.`, pick: open.map(t => ({ id: t, name: trackName(w, job, t) })) };
        if (key === undefined || !job.tracks[key])
            return { ok: false, text: 'They are not hiring.' };
        if (!open.includes(key))
            return { ok: false, text: layTrack(job, key).hireable === false ? 'They are not hiring.' : `${job.name} only takes people who come with an introduction.` };
    }
    const o = key !== undefined ? layTrack(job, key) : job;
    if (o.hireable === false)
        return { ok: false, text: 'They are not hiring.' };
    if (key === undefined && !openOn(g, w, o))
        return { ok: false, text: `${job.name} only takes people who come with an introduction.` };
    const miss = missingCourses(g, w, o);
    if (miss.length)
        return { ok: false, text: needCourseText(g, w, o, miss) };
    if (!hobbyFits(g, w, o))
        return { ok: false, text: `They are looking for someone better at it: ${hobbyNeed(g, w, o)}.` };
    // (a good word from someone high up there gets you in without the interview, and without waiting for one)
    const ref = referralFor(g, id);
    const again = ref ? 0 : retryIn(g, id, o, traitsOf(g));
    if (again)
        return { ok: false, text: again <= 1 ? 'You already had an interview there today. Try again tomorrow.' : `They turned you down not long ago. Try again in ${again} days, or once you're better at what the job asks for.` };
    const fee = feeOf(g, w, o);
    if (fee > g.player.money)
        return { ok: false, text: `They ask a fee of ${money(w, fee)} when you start, and you don't have it.` };
    // a job beyond your reach isn't worth their time (no roll, nothing counted): what would change it is on the job's listing
    if (!ref && !interviewChance(g, o, traitsOf(g)))
        return { ok: false, text: "They won't consider you yet: get better at what the job uses, have the traits it likes or finish its course, and come rested and clean." };
    const r = ref ? { ok: true, crit: false, text: `${g.cast[ref]?.name ?? 'Someone'} put in a good word for you.` } : interview(g, o, traitsOf(g));
    if (ref)
        delete g.referral;
    if (!r.ok) {
        note(g, '{u} had a job interview for {0}, but did not get it.', [o.name], [], o.place, 'work');
        return { ok: false, text: r.text };
    }
    // today's shift counts if it hasn't started yet
    const today = shiftOn(g, w, o, g.day);
    // a bottom rank added for students (the job's ranks were shifted for it: Medical student) is for those still taking
    // the course: with it finished you start at the rank after it. (A student rank that is the job's own first rank, a
    // lifeguard's, is where everyone starts.)
    let rank = 0;
    if ((o.shifted ?? []).length && !askedCourses(g, w, o).length)
        while (o.ranks[rank]?.student && rank < o.ranks.length - 1)
            rank++;
    // a distinguished degree in this field starts you higher (never past the career's first branch)
    const up = studentLink.headStart(g, w, id);
    if (up > 0)
        rank = Math.max(rank, Math.min(rank + up, career(o).ranks.length - 1));
    const j = { id, rank, shifts: 0, perf: r.crit ? 65 : 50, since: nowAbs(g), checked: today && today.start > nowAbs(g) ? g.day - 1 : g.day, vac: 0, vacAt: g.day };
    if (key !== undefined)
        j.track = key;
    // a job that waits after signing (a month before the first shoot): no shift, no absence and no time in the rank till then
    const wait = waitDays(g, o);
    if (wait) {
        j.start = g.day + wait;
        j.since = j.start * 1440;
        j.checked = j.start - 1;
    }
    g.player.job = j;
    if (fee) {
        g.player.money -= fee;
        book(g, `${o.name}: fee`, -fee);
    }
    headStart(g, w, o, j);
    note(g, '{u} got hired: {0} at {1}.', [o.ranks[rank].name, o.name], [], o.place, 'work');
    const s = nextShift(g, w, o);
    return { ok: true, text: `You got the job! ${r.text}${fee ? ` You paid the fee (${money(w, fee)}).` : ''}${systemOn(w, 'jobs') ? ` Your week: ${weekText(g, w, o)}.${wait ? ` You start in ${wait} day${wait === 1 ? '' : 's'}.` : ''}${s ? ` First shift: ${whenText(g, s)}.` : ''}` : ''}` };
}
/** The fee a job (its track) takes when you're hired: none once you've finished one of the courses it lists. */
export function feeOf(g, w, o) {
    const t = trackOf(g, o), fee = Math.max(0, Math.round(t.fee ?? 0));
    if (!fee || (t.courses ?? []).some(id => hasCourse(g, id)))
        return 0;
    return priceOf(g, fee);
}
/** Days between signing and the first shift: `startAfter` months, a month being a third of a season (at least a day). */
export function waitDays(g, o) {
    const m = trackOf(g, o).startAfter ?? 0;
    return m > 0 ? Math.max(1, Math.round((m * seasonDays(g)) / 3)) : 0;
}
// A new job can start part of the way to the next rank (life goals' Adaptable: a `career` effect aimed at `hire`, −50%
// is halfway): that share of the shifts and of the time the rank asks for counts as done.
function headStart(g, w, o, j) {
    const share = Math.min(0.5, Math.max(0, 1 - effectMul(g, w, 'career', 'hire', { exact: true })));
    const p = share > 0 ? promoNeeds(g, w, o) : null;
    if (!p)
        return;
    j.shifts = Math.round(p.shifts * share * 100) / 100;
    j.since = nowAbs(g) - Math.round(p.days * share * 1440);
}
export function quitJob(g, w) { const o = w && jobDef(w, g.player.job?.id); if (o)
    note(g, '{u} quit the job ({0}).', [o.name], [], g.player.loc, 'work'); g.player.job = null; }
// Round the clock: the shift you'd rather work (from your next one on).
export function chooseShift(g, w, id) {
    const j = jobOf(g);
    const o = myJob(g, w);
    const s = o && scheduleOf(o).shifts?.find(x => x.id === id);
    if (!j || !o || !s)
        return '';
    j.shift = s.id;
    return `From now on you work the ${(s.name ?? s.id).toLowerCase()} shift (${hm(s.from * 60 % 1440)}–${hm(s.to * 60 % 1440)}).`;
}
/* ---------- performance (J2) ---------- */
/** Performance up or down (0–100); low performance brings a warning, then a demotion, then being fired, as far as
 *  the work rules go. Returns what happened. */
export function addPerf(g, w, n) {
    const j = jobOf(g);
    const o = myJob(g, w);
    if (!j || !o)
        return [];
    if (n > 0)
        n *= effectMul(g, w, 'perf', ['gain', o.id, ...jobTags(g, o)]);
    j.perf = Math.max(0, Math.min(100, (j.perf ?? 50) + n));
    const low = workRules(g, w).low, out = [];
    if (j.perf >= 60)
        delete j.warn;
    const warn = j.warn ?? 0;
    if (j.perf < 25 && warn === 0) {
        j.warn = 1;
        out.push(`Your boss had a word with you about your work at ${o.name}. Your performance is low.`);
        note(g, '{u} got a warning at work ({0}).', [o.name], [], o.place, 'work');
    }
    else if (j.perf < 15 && warn >= 1 && low !== 'warn') {
        if (low === 'fire' && (warn >= 2 || j.rank === 0)) {
            g.player.job = null;
            out.push(`You were let go from ${o.name}. Your performance was too low for too long.`);
            note(g, '{u} was fired ({0}).', [o.name], [], o.place, 'work');
        }
        else if (j.rank > 0) {
            j.rank--;
            j.shifts = 0;
            j.since = nowAbs(g);
            j.perf = 35;
            j.warn = 2;
            out.push(`You were moved down to ${rankOf(g, o).name} at ${o.name}.`);
            note(g, '{u} was demoted to {0}.', [rankOf(g, o).name], [], o.place, 'work');
        }
        else {
            j.perf = 35;
            j.warn = 2;
            out.push(`A last warning at ${o.name}: things have to get better.`);
        }
    }
    return out;
}
/** Is there something for the rewards shop's "Clean slate at work" to forget (a warning, a missed shift)? */
export const slateToClean = (g, w) => { const j = jobOf(g); return !!j && !!jobDef(w, j.id) && (!!j.warn || j.missed !== undefined); };
/** "Clean slate at work": one warning and the last missed shift are forgotten (its performance comes back). Null when
 *  there's nothing to forget. */
export function cleanSlate(g, w) {
    const j = jobOf(g), o = myJob(g, w);
    if (!j || !o || !slateToClean(g, w))
        return null;
    if (j.warn) {
        if (j.warn > 1)
            j.warn--;
        else
            delete j.warn;
    }
    if (j.missed !== undefined) {
        j.perf = Math.min(100, (j.perf ?? 50) + workRules(g, w).missed);
        delete j.missed;
    }
    return [`At ${o.name}, it's as if it never happened: a clean slate.`];
}
// What a shift does to your performance: how you worked, how you came in (rested, fed, clean, in a good mood), whether
// you have the skills your rank asks for, and how the boss feels about you (J7).
const MODE_PERF = { normal: 4, hard: 8, social: 2, easy: -4 };
function shiftPerf(g, w, o, mode, part) {
    const s = g.player.stats;
    let n = MODE_PERF[mode];
    const low = ['energy', 'mood', 'hunger', 'hygiene'].filter(k => typeof s[k] === 'number' && s[k] < 25).length;
    n += low ? -2 * low : (s.energy ?? 100) >= 50 && (s.mood ?? 100) >= 50 ? 1 : 0;
    const needs = Object.entries(rankOf(g, o).needs ?? {}).filter(([id]) => id !== 'performance');
    if (needs.length && needs.every(([id, v]) => levelOf(g, id) >= v))
        n += 1;
    const b = bossOf(g, w, o);
    if (b) {
        const f = fr(g, b.avatar, YOU);
        n += f >= 40 ? 1 : f < 0 ? -1 : 0;
    }
    return n * part;
}
/* ---------- colleagues (J7) ---------- */
/** The world's people with your job (or working at your place), by rank. */
export const colleaguesOf = (g, w, o) => {
    o = trackOf(g, o);
    return Object.values(g.cast).filter(r => r.occupation && (r.occupation === o.id || jobDef(w, r.occupation)?.place === o.place)).sort((a, b) => npcRank(g, b.avatar) - npcRank(g, a.avatar));
};
/** Colleagues on shift with you: here, at the place you work, now (an off-screen job has none you can see). */
export const onShiftWith = (g, w, o) => (offScreen(w, trackOf(g, o)) ? [] : presentAt(g, w, jobPlace(g, o)).filter(r => colleaguesOf(g, w, o).includes(r)));
/** The boss: the colleague with your job who ranks highest, above you. */
export function bossOf(g, w, o) {
    const mine = jobOf(g)?.rank ?? 0;
    return colleaguesOf(g, w, o).find(r => r.occupation === o.id && npcRank(g, r.avatar) > mine) ?? null;
}
/** Seniors (senpai): colleagues a rank or more above you, among these people. */
export const seniorsOf = (g, w, o, among) => among.filter(r => colleaguesOf(g, w, o).includes(r) && npcRank(g, r.avatar) > (jobOf(g)?.rank ?? 0));
export const WORK_MODES = [
    { id: 'normal', name: 'Do the job', desc: 'A normal shift.', icon: '💼' },
    { id: 'hard', name: 'Work hard', desc: 'Your performance grows fastest, with a chance of a bonus. More tiring, a bit stressful.', icon: '🔥' },
    { id: 'social', name: 'Chat with coworkers', desc: 'Better mood, closer to the colleagues on shift with you. Performance grows slowly.', icon: '💬' },
    { id: 'easy', name: 'Take it easy', desc: 'Less tiring, but your performance drops and the boss notices.', icon: '😌' },
];
const OVERTIME_PAY = 0.25;
// `hours`: a shorter shift (leaving early for a date): pay, tiredness and progress are for the hours worked.
export function workShift(g, w, mode = 'normal', hours) {
    const j = jobOf(g);
    const o = myJob(g, w);
    if (!j || !o)
        return [];
    const rules = workRules(g, w), sched = systemOn(w, 'jobs');
    const can = canWork(g, w, o);
    const out = [];
    // waiting for the shift to start, then whether you came in late
    if (can.kind === 'shift' && can.early)
        out.push(...advance(g, w, can.shift.start - nowAbs(g)));
    const s = can.kind === 'shift' ? can.shift : null;
    const overtime = !s && can.kind === 'overtime';
    const room = s ? Math.floor((s.end - nowAbs(g)) / 60) : o.shift;
    const h = Math.max(1, Math.min(s?.hours ?? o.shift, room, Math.round(hours ?? o.shift)));
    const part = h / (s?.hours ?? o.shift);
    let perf = 0;
    if (s && can.late) {
        const lateBy = Math.round(nowAbs(g) - s.latest);
        perf -= rules.missed ? Math.max(2, Math.round(rules.missed / 2)) : 3;
        out.push(`You came in ${lateBy} minutes late.`);
    }
    if (s) {
        j.worked = [...(j.worked ?? []).filter(d => d > g.day - 15), s.day];
    } // before the time passes: a night shift goes past midnight
    if (overtime)
        j.extraDay = g.day;
    const start = nowAbs(g);
    const mates = onShiftWith(g, w, o);
    out.unshift(...advance(g, w, h * 60));
    const k = mode === 'hard' ? 1.35 : mode === 'easy' ? 0.6 : 1;
    for (const [id, v] of Object.entries(o.cost ?? {}))
        addStatus(g, w, id, -v * part * (id === 'energy' ? k : 1));
    if (mode === 'hard')
        addStatus(g, w, 'mood', -5 * part);
    if (mode === 'social')
        addStatus(g, w, 'mood', 8 * part);
    // pay: per hour, raised for fewer days a week, more for night hours (E20) and overtime
    const rk = rankOf(g, o);
    const night = nightMinutes(start, h * 60) / 60;
    const base = rk.pay * payFactor(g, w, o) * (overtime ? 1 + OVERTIME_PAY : 1);
    let pay = payOf(g, (base * h + base * night * (o.nightPay ?? 0)) * payMul(g, w, o, 'wage'));
    countUp(g, 'shifts', part);
    const bonus = mode === 'hard' && Math.random() < 0.3 ? Math.round(pay * 0.25) : 0;
    pay += bonus;
    g.player.money += pay;
    book(g, `${rk.name}: ${h} h${overtime ? ' (overtime)' : ''}${bonus ? ' (+ bonus)' : ''}`, pay);
    out.unshift(`You worked ${h} hour${h === 1 ? '' : 's'}${overtime ? ' of overtime' : ''} and earned ${money(w, pay)}${bonus ? ` (a bonus of ${money(w, bonus)} for the hard work)` : ''}${night >= 1 && o.nightPay ? ' (with night pay)' : ''}.`);
    j.shifts = Math.round((j.shifts + part) * 100) / 100;
    for (const id of o.trains ?? [])
        out.push(...trainSkill(g, w, id, (mode === 'hard' ? 6 : mode === 'easy' ? 2 : 4) * part));
    if (mode === 'social' && mates.length) {
        for (const r of mates)
            bump(g, r.avatar, 3);
        out.push(`You got closer to ${mates.map(r => r.name).join(', ')}.`);
    }
    if (sched) {
        perf += shiftPerf(g, w, o, mode, part);
        if (mode === 'easy' && !rules.gentle && Math.random() < 0.25) {
            perf -= 3;
            out.push('Your boss noticed you were slacking.');
        }
        out.push(...addPerf(g, w, rules.gentle ? Math.max(0, perf) : perf));
        if (!g.player.job)
            return out; // fired
        rollWorkEvent(g, w, o);
    }
    out.push(...tryPromote(g, w, o));
    if (pendingBranch(g, o) && !j.toldBranch) {
        j.toldBranch = j.rank;
        out.push(lex(w, 'choosePath', o.name));
    }
    if (s)
        out.push(...askForDrinks(g, w, o, s.start, mates));
    return out;
}
// A promotion when everything it asks for is there (what's left over of the shifts counts toward the next rank).
function tryPromote(g, w, o) {
    const j = jobOf(g);
    const p = promoNeeds(g, w, o);
    if (!j || !p?.ready)
        return [];
    j.rank++;
    j.shifts = Math.max(0, Math.round((j.shifts - p.shifts) * 100) / 100);
    j.since = nowAbs(g);
    const name = rankOf(g, o).name, moved = rankPlace(o, rankOf(g, o)) !== rankPlace(o, careerOf(g, o).ranks[j.rank - 1]);
    note(g, '{u} got promoted to {0}.', [name], [], o.place, 'work');
    addRep(g, w, 3, 'promotion', o.place);
    return [`Promotion! You are now ${name}.${moved ? ` You work at ${placeOf(g, w, jobPlace(g, o))?.name ?? 'a new place'} from now on.` : ''}`];
}
/* ---------- things that happen at work (J6) ---------- */
// The boss asking you to stay longer (jobs with overtime): a work event of the engine's own.
const OVERTIME_ASK = { id: '_overtime', setup: 'Your boss asks if you can stay two more hours tonight.', choices: [
        { label: 'Stay (overtime pay)', perf: 1, text: 'You stayed. The boss noticed.' },
        { label: 'Go home on time', perf: -1, text: 'You left on time. The boss did not say anything.' },
    ] };
const eventDef = (o, id) => (id === OVERTIME_ASK.id ? OVERTIME_ASK : (o.events ?? []).find(e => e.id === id) ?? null);
/** The colleague a work event comes from (`WorkEvent.from`): the closest of the world's people in your job whom you've
 *  met, at its level or closer; null when nobody is. */
export function colleagueFor(g, w, o, e) {
    if (!e.from)
        return null;
    const lvl = e.from.level || 'friend', self = g.swap?.avatar;
    return Object.values(g.cast).filter(r => r.occupation === o.id && r.met && !r.gone && r.avatar !== self && levelHolds(g, w, r.avatar, lvl))
        .sort((a, b) => fr(g, b.avatar, YOU) - fr(g, a.avatar, YOU))[0] ?? null;
}
// A work event as it is told: {who} is the colleague it comes from (or the unnamed one); a `feels` key "{who}" is them.
const NAMED = ['text', 'fact', 'rumor'];
function told(x, name, avatar) {
    const y = { ...x };
    for (const k of [...NAMED, 'label'])
        if (typeof y[k] === 'string')
            y[k] = y[k].split('{who}').join(name);
    if (y.feels && '{who}' in y.feels) {
        const f = { ...y.feels };
        const v = f['{who}'];
        delete f['{who}'];
        if (avatar)
            f[name] = v;
        y.feels = f;
    }
    if (y.fail)
        y.fail = told(y.fail, name, avatar);
    return y;
}
function namedEvent(g, e, who) {
    if (!e.from || who === undefined)
        return e;
    const name = who ? g.cast[who]?.name ?? e.from.fallback ?? 'A colleague' : e.from.fallback ?? 'A colleague';
    return { ...e, setup: e.setup.split('{who}').join(name), choices: e.choices.map(c => told(c, name, who)) };
}
const choiceOk = (g, w, o, c, i) => !c.when || whenHolds(g, w, c.when, { place: jobPlace(g, o), key: `workc|${o.id}|${i}` });
// After a shift, now and then (as often as the work rules say): one of the job's events whose condition holds, or the
// boss asking for overtime. It waits for your choice on the work screen.
function rollWorkEvent(g, w, o) {
    const j = jobOf(g);
    const chance = workRules(g, w).events;
    delete j.event;
    if (Math.random() >= chance)
        return;
    const list = (o.events ?? []).filter(e => (!e.adult || adultOn(g)) && e.choices?.length && (!e.when || whenHolds(g, w, e.when, { place: jobPlace(g, o), key: `work|${e.id}` })));
    // an event from a colleague: theirs when one is close enough, else the unnamed one's at lower odds (or none)
    const who = new Map();
    const ready = list.filter(e => {
        if (!e.from)
            return true;
        const r = colleagueFor(g, w, o, e);
        if (r) {
            who.set(e.id, r.avatar);
            return true;
        }
        if (e.from.fallback && Math.random() < Math.max(0, Math.min(1, e.from.odds ?? 0.5))) {
            who.set(e.id, '');
            return true;
        }
        return false;
    });
    if (o.overtime && Math.random() < (ready.length ? 0.3 : 0.6)) {
        j.event = { id: OVERTIME_ASK.id, day: g.day };
        return;
    }
    if (ready.length) {
        const e = ready[Math.floor(Math.random() * ready.length)];
        j.event = { id: e.id, day: g.day };
        if (who.has(e.id))
            j.event.who = who.get(e.id);
    }
}
/** The event waiting for your choice (with the choices you can make now), if any. */
export function pendingEvent(g, w) {
    const j = jobOf(g);
    const o = myJob(g, w);
    const def = j?.event && o ? eventDef(o, j.event.id) : null;
    const e = def && namedEvent(g, def, j.event.who);
    if (!j || !o || !e || j.event.day < g.day - 1)
        return null;
    const choices = e.choices.map((c, i) => ({ c, i })).filter(x => choiceOk(g, w, o, x.c, x.i));
    return choices.length ? { ev: e, choices } : null;
}
export const dropEvent = (g) => { const j = jobOf(g); if (j)
    delete j.event; };
/** Your choice: a roll if it has one (d20 + the roll bonus against its difficulty), then what it does:
 *  performance, money, needs, how people feel about you, a fact. With the gentle rules nothing turns out badly. */
export function chooseEvent(g, w, i, rnd = Math.random) {
    const j = jobOf(g);
    const o = myJob(g, w);
    const p = pendingEvent(g, w);
    const pick = p?.choices.find(x => x.i === i);
    if (!j || !o || !p || !pick)
        return [];
    delete j.event;
    const c = pick.c, out = [];
    let res = c, ok = null;
    if (c.roll) {
        // (a choice at work is a `work` roll: what effects aimed at work add counts here, not on actions or stories; and
        // the job's id and tags, as `perf` and `pay` take them, so a trait aimed at stage work (`adult-stage`) reaches it)
        const bonus = rollBonus(g, w, { skill: c.roll.skill, tags: ['work', o.id, ...jobTags(g, o)] }), d20 = rollD20(g, w, bonus, c.roll.dc, rnd);
        ok = d20 === 20 || (d20 > 1 && d20 + bonus >= c.roll.dc);
        if (ok)
            tallyRoll(g, c.roll.skill);
        out.push(`🎲 ${d20}${bonusLabel(bonus)} against ${c.roll.dc}: ${ok ? 'it worked.' : 'it did not work.'}`);
        if (!ok)
            res = c.fail ?? { text: 'It did not work out.' };
    }
    out.push(...applyResult(g, w, o, res, workRules(g, w).gentle, p.ev.id, rnd));
    out.push(...choicePractice(g, w, c.roll?.skill, ok, res.trains));
    if (p.ev.id !== OVERTIME_ASK.id)
        (j.seen ??= {})[p.ev.id] = ok === null ? { choice: i } : { choice: i, ok };
    if (p.ev.id === OVERTIME_ASK.id && i === 0)
        out.push(...overtimeHours(g, w, o, 2));
    return out;
}
/** Practice from a choice (at work, in a street story): trying a roll trains its skill (more when it works), and a
 *  result's `trains` trains that one. Returns the level-up lines. */
export const CHOICE_PRACTICE = { worked: 6, failed: 3, trains: 5 };
export function choicePractice(g, w, rolled, ok, trains) {
    const out = [];
    if (rolled && ok !== null)
        out.push(...trainSkill(g, w, rolled, ok ? CHOICE_PRACTICE.worked : CHOICE_PRACTICE.failed));
    if (trains)
        out.push(...trainSkill(g, w, trains, CHOICE_PRACTICE.trains));
    return out;
}
function applyResult(g, w, o, r, gentle, from = '', rnd = Math.random) {
    const out = [];
    const ok = (n) => (n === undefined ? 0 : gentle ? Math.max(0, n) : n);
    if (r.text)
        out.push(r.text);
    if (ok(r.perf))
        out.push(...addPerf(g, w, ok(r.perf) * 5));
    if (ok(r.money)) {
        const m = ok(r.money) > 0 ? payOf(g, ok(r.money) * payMul(g, w, o, 'tips')) : -priceOf(g, -ok(r.money));
        g.player.money += m;
        book(g, o.name, m);
        out.push(m > 0 ? `+${money(w, m)}` : `−${money(w, -m)}`);
    }
    for (const [id, v] of Object.entries(r.effects ?? {}))
        if (ok(v))
            addStatus(g, w, id, ok(v));
    for (const [name, v] of Object.entries(r.feels ?? {})) {
        const who = personNamed(g, name);
        if (who && ok(v))
            bump(g, who.avatar, ok(v));
    }
    if (r.fact)
        note(g, r.fact, [placeOf(g, w, jobPlace(g, o))?.name ?? o.name], [], jobPlace(g, o), 'work');
    if (r.rumor)
        startRumor(g, w, r.rumor, jobPlace(g, o), { you: true, id: `work:${o.id}:${r.rumor.slice(0, 24)}` }); // (E31) it goes round from work
    // a timed effect (a ranking's better pay for a week), kept as a boost
    const fx = r.boost ? cleanEffects(r.boost.effects, BOOST_LIMITS).filter(e => !gentle || e.value >= 0) : [];
    if (fx.length)
        addBoost(g, `work:${o.id}:${from}`, fx, r.boost.days);
    if (r.risk && !gentle)
        out.push(...workRisk(g, w, o, r, rnd)); // (adult) caught: a raid
    return out;
}
// Staying longer: the hours pass, paid as overtime.
function overtimeHours(g, w, o, h) {
    const start = nowAbs(g);
    const out = advance(g, w, h * 60);
    addStatus(g, w, 'energy', -((o.cost?.energy ?? 20) / o.shift) * h);
    const base = rankOf(g, o).pay * payFactor(g, w, o) * (1 + OVERTIME_PAY);
    const pay = payOf(g, (base * h + base * (nightMinutes(start, h * 60) / 60) * (o.nightPay ?? 0)) * payMul(g, w, o, 'wage'));
    g.player.money += pay;
    book(g, `${rankOf(g, o).name}: ${h} h (overtime)`, pay);
    return [`You worked ${h} more hours and earned ${money(w, pay)}.`, ...out];
}
/* ---------- days off: vacation and sick days (J2) ---------- */
export const vacationLeft = (g, w) => (workRules(g, w).vacation ? Math.floor(jobOf(g)?.vac ?? 0) : Infinity);
/** Book a day off (a vacation day) for a shift today (not started) or later this week, or give it back. */
export function bookOff(g, w, day) {
    const j = jobOf(g);
    const o = myJob(g, w);
    if (!j || !o)
        return '';
    const off = (j.off ??= {});
    if (off[day] === 'vacation') {
        delete off[day];
        if (workRules(g, w).vacation)
            j.vac = (j.vac ?? 0) + 1;
        return 'Day off cancelled: you work that day.';
    }
    const s = shiftOn(g, w, o, day);
    if (!s || worked(j, day) || off[day] || s.start <= nowAbs(g))
        return 'You can only book a shift that hasn\'t started.';
    if (vacationLeft(g, w) < 1)
        return 'You have no vacation days left.';
    if (workRules(g, w).vacation)
        j.vac = (j.vac ?? 0) - 1;
    off[day] = 'vacation';
    return `Day off booked: ${WEEKDAYS[wdOf(day)]}.`;
}
/** Too ill to work: hurt, under a curse or a poison, or with nothing left in you. */
export function reallyIll(g, w) {
    const a = ailOf(g), s = g.player.stats;
    return a.injuries.some(i => i.until > g.day) || a.debuffs.length > 0 || (s.energy ?? 100) < 10 || (typeof s.health === 'number' && s.health < 30) || (a.stress ?? 0) >= 80;
}
/** May you call in sick today: only when really ill (Realistic), now and then (once every two weeks, or when ill),
 *  or any time. '' when you may; why not otherwise. */
export function sickNo(g, w) {
    const j = jobOf(g);
    if (!j)
        return 'No job.';
    const rule = workRules(g, w).sick, ill = reallyIll(g, w);
    if (rule === 'ill' && !ill)
        return 'You are not ill enough to call in sick.';
    if (rule === 'sometimes' && !ill && g.day - (j.sickAt ?? -99) < 14)
        return 'You called in sick not long ago.';
    return '';
}
/** Kept off work until `until` (absolute minutes: a night in hospital): every shift not yet over that starts before then
 *  is a sick day, whatever the rules on calling in sick. */
export function sickLeave(g, w, until) {
    const j = jobOf(g);
    const o = myJob(g, w);
    if (!j || !o)
        return;
    for (let d = g.day - 1; d * 1440 < until; d++) {
        const s = shiftOn(g, w, o, d);
        if (s && s.start < until && s.end > nowAbs(g) && !worked(j, d) && !offOn(j, d))
            (j.off ??= {})[d] = 'sick';
    }
}
export function callSick(g, w) {
    const j = jobOf(g);
    const o = myJob(g, w);
    if (!j || !o)
        return '';
    const why = sickNo(g, w);
    if (why)
        return why;
    const s = shiftNow(g, w, o) ?? nextShift(g, w, o);
    if (!s || s.day > g.day + 1)
        return 'You have no shift to call in sick for.';
    (j.off ??= {})[s.day] = 'sick';
    j.sickAt = g.day;
    note(g, '{u} called in sick ({0}).', [o.name], [], g.player.loc, 'work');
    return `You called in sick for ${whenText(g, s)}.`;
}
/* ---------- the days going by: missed shifts, vacation, bonuses, reminders ---------- */
// Every hour: shifts that ended without you (an absence, unless booked off), and a reminder before the next one
// (with the trip there: living far away means leaving earlier).
export function workHour(g, w) {
    const j = jobOf(g);
    const o = myJob(g, w);
    if (!j || !o || !systemOn(w, 'jobs'))
        return [];
    const out = [], now = nowAbs(g), rules = workRules(g, w);
    // (from yesterday at most: a job taken back after "Play as" doesn't count the days someone else lived)
    for (let d = Math.max((j.checked ?? g.day) + 1, g.day - 1); d <= g.day; d++) {
        const s = shiftOn(g, w, o, d);
        if (s && s.end > now)
            break;
        j.checked = d;
        if (!s || worked(j, d) || offOn(j, d))
            continue;
        tallyEvent(g, 'missed_shift');
        if (rules.missed) {
            out.push(`You missed your shift at ${o.name} (${WEEKDAYS[wdOf(d)]}).${rules.low === 'fire' ? ' Your boss is not happy.' : ''}`);
            note(g, '{u} missed a shift at work ({0}).', [o.name], [], o.place, 'work');
            j.missed = d;
            out.push(...addPerf(g, w, -rules.missed));
            if (!g.player.job)
                return out;
        }
    }
    // days off already over are forgotten
    for (const k of Object.keys(j.off ?? {}))
        if (Number(k) < g.day - 7)
            delete j.off[k];
    const n = nextShift(g, w, o);
    if (n && j.told !== n.day && n.start > now) {
        const trip = offScreen(w, o) || g.player.loc === jobPlace(g, o) ? 0 : travelMinutes(g, w, g.player.loc, jobPlace(g, o));
        if (n.start - now <= 60 + trip) {
            j.told = n.day;
            out.push(`Your shift at ${o.name} starts at ${hm(n.start % 1440)}${trip ? ` (${trip} min away)` : ''}.`);
        }
    }
    return out;
}
// Every day: a vacation day saved up every so often, and the summer and winter bonuses of full-time jobs (J8),
// paid on the first day of summer and of winter: a week's pay, more with a good performance.
export function workDay(g, w) {
    const j = jobOf(g);
    const o = myJob(g, w);
    if (!j || !o || !systemOn(w, 'jobs'))
        return [];
    const rules = workRules(g, w), out = [];
    if (rules.vacation) {
        while (g.day - (j.vacAt ?? g.day) >= rules.vacation) {
            j.vacAt = (j.vacAt ?? g.day) + rules.vacation;
            j.vac = Math.min(10, (j.vac ?? 0) + 1);
        }
    }
    else
        j.vacAt = g.day;
    const sd = seasonDays(g), season = Math.floor((g.day - 1) / sd) % 4, first = (g.day - 1) % sd === 0;
    if (first && (season === 1 || season === 3) && weekDays(g, o) >= 5 && j.bonus !== g.day && g.day - Math.floor((j.since ?? 0) / 1440) >= 7) {
        j.bonus = g.day;
        const pay = payOf(g, rankOf(g, o).pay * o.shift * weekDays(g, o) * (0.5 + perfOf(g) / 100) * payMul(g, w, o, 'bonus'));
        g.player.money += pay;
        book(g, `${o.name}: ${season === 1 ? 'summer' : 'winter'} bonus`, pay);
        note(g, '{u} got the {0} bonus at work.', [season === 1 ? 'summer' : 'winter'], [], o.place, 'work');
        out.push(`Your ${season === 1 ? 'summer' : 'winter'} bonus from ${o.name}: ${money(w, pay)}.`);
    }
    return out;
}
onHour.push(workHour);
onDay.push(workDay);
export const DRINKS = { chance: 0.25, friday: 0.5, party: 0.9, minutes: 150 };
const goneAway = (r) => !!r.gone;
// The colleagues who worked today: on shift with you, or with a shift today that overlapped yours.
function workedToday(g, w, o, start, mates) {
    const out = new Set(mates), now = nowAbs(g);
    for (const r of colleaguesOf(g, w, o))
        for (const d of [g.day - 1, g.day]) {
            const s = npcShiftOn(g, w, r, d);
            if (s && s.from < now && s.to > start)
                out.add(r);
        }
    const self = g.swap?.avatar;
    return [...out].filter(r => !goneAway(r) && r.avatar !== self);
}
const halfHour = (t) => t + ((30 - (t % 30)) % 30);
// A hash spread evenly over [0, 1) (FNV-1a of strings that differ in a digit or two clusters).
const mix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
/** Where and when drinks after this shift would be (null: none today): a standing appointment of colleagues in the
 *  next three hours away from work (with another of them, or at one of the job's drinking places), else (by the day's
 *  dice) one of the job's drinking places open then. */
export function drinksPlan(g, w, o, workers) {
    const now = nowAbs(g), work = jobPlace(g, o);
    for (let at = halfHour(now); at <= now + 180; at += 30)
        for (const r of workers) {
            const s = slotAt(g, w, r, at);
            const team = s?.kind === 'ritual' && (s.with.some(a => workers.some(x => x.avatar === a)) || !!o.drinks?.includes(s.place));
            if (s && team && s.place !== work && !s.place.startsWith('home:') && placeOk(g, w, s.place))
                return { place: s.place, from: Math.max(at, s.from), host: r };
        }
    const places = (o.drinks ?? []).filter(id => id !== work && placeOk(g, w, id));
    if (!places.length)
        return null;
    const from = halfHour(now + 30), wd = wdOf(g.day);
    const party = festivalsOn(g, w).some(f => f.custom?.kind === 'group' && !!f.place && places.includes(f.place));
    const chance = party ? DRINKS.party : wd === 4 ? DRINKS.friday : DRINKS.chance;
    if (mix(H(`${g.world}|${g.day}|drinks|${o.id}`)) >= chance)
        return null;
    const open = places.filter(id => openAt(g, w, id, from) && openAt(g, w, id, from + 90));
    return open.length ? { place: open[H(`${g.world}|${g.day}|drinksat|${o.id}`) % open.length], from } : null;
}
// At the end of a shift: an invitation from the most senior colleague you've met who is free then.
function askForDrinks(g, w, o, start, mates) {
    const j = jobOf(g), s = social(g);
    if (!j || !systemOn(w, 'jobs') || !systemOn(w, 'plans') || isScenario(w) || offScreen(w, o) || s.invite || j.drinks?.day === g.day)
        return [];
    const workers = workedToday(g, w, o, start, mates);
    if (!workers.length)
        return [];
    const plan = drinksPlan(g, w, o, workers);
    if (!plan)
        return [];
    const free = workers.filter(r => !workingAt(g, w, r, plan.from));
    const host = (plan.host?.met && free.includes(plan.host) ? plan.host : null) ?? free.filter(r => r.met).sort((a, b) => npcRank(g, b.avatar) - npcRank(g, a.avatar))[0];
    if (!host)
        return [];
    j.drinks = { day: g.day, place: plan.place, from: plan.from, to: plan.from + DRINKS.minutes, host: host.avatar, who: free.map(r => r.avatar) };
    s.invite = { avatar: host.avatar, place: plan.place, from: plan.from, kind: 'hangout' };
    const where = placeOf(g, w, plan.place)?.name ?? 'a bar nearby', at = hm(plan.from % 1440);
    const others = free.filter(r => r !== host).map(r => r.name);
    (s.threads[host.avatar] ??= []).push({ me: false, text: `Drinks after work? ${where}, ${at}.${others.length ? ` ${others.join(', ')} ${others.length > 1 ? 'are' : 'is'} coming.` : ''}`, at: nowAbs(g) });
    s.unread[host.avatar] = (s.unread[host.avatar] ?? 0) + 1;
    if (presentAt(g, w, g.player.loc).includes(host))
        queueMoment(g, { who: host.avatar, kind: 'custom', tier: `drinks:${g.day}`, text: `As the shift ends, ${host.name} asks {{user}} to come along for drinks after work at ${where} (${at})${others.length ? `, with ${names(others)}` : ''}, in this scene.`, until: g.day });
    return [`${host.name} asks if you'd like to come for drinks after work: ${where}, ${at}.`];
}
const names = (list) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
/** Drinks you said yes to: the colleagues come along when it starts, and once you're there with them it counts (closer
 *  to each, a senior notices, a fact, and a moment for the scene with who is senior to whom). After every change and
 *  every hour. */
export function drinksTick(g, w) {
    const j = jobOf(g), d = j?.drinks, o = myJob(g, w);
    if (!j || !d || !o || !systemOn(w, 'jobs'))
        return [];
    const now = nowAbs(g);
    if (now >= d.to || now < d.from)
        return [];
    const plan = social(g).appts.find(a => a.avatar === d.host && a.place === d.place && a.from === d.from && (a.state === 'set' || a.state === 'met'));
    if (!plan)
        return [];
    if (!d.brought) {
        d.brought = true;
        for (const a of d.who) {
            const r = g.cast[a];
            if (a !== d.host && r && !goneAway(r) && !workingAt(g, w, r, now))
                bringTo(g, a, d.place, d.to, 'is out for drinks after work with their colleagues');
        }
    }
    if (d.went || g.player.loc !== d.place)
        return [];
    const here = presentAt(g, w, d.place).filter(r => d.who.includes(r.avatar) || r.avatar === d.host);
    if (!here.length)
        return [];
    d.went = true;
    for (const r of here)
        if (r.avatar !== d.host)
            bump(g, r.avatar, 2); // (the one who asked: the plan kept)
    const seniors = seniorsOf(g, w, o, here), juniors = juniorsOf(g, w, o, here);
    const out = [];
    if (seniors.length)
        out.push(...addPerf(g, w, 2));
    const where = placeOf(g, w, d.place)?.name ?? d.place;
    note(g, '{u} went for drinks after work with {0} at {1}.', [names(here.map(r => r.name)), where], here.map(r => r.avatar), d.place, 'work');
    const host = g.cast[d.host];
    if (host)
        queueMoment(g, { who: d.host, kind: 'custom', tier: `drinks:at:${g.day}`, until: g.day,
            text: `Drinks after work with colleagues: a first round together and a toast; the juniors pour for the seniors and keep the glasses full.${seniors.length ? ` ${names(seniors.map(r => r.name))} ${seniors.length > 1 ? 'are' : 'is'} senior to {{user}} at work.` : ''}${juniors.length ? ` {{user}} is senior to ${names(juniors.map(r => r.name))}.` : ''} The talk drifts from work to life.` });
    return out;
}
/** Juniors (kōhai): colleagues with your job a rank or more below you, among these people. */
export const juniorsOf = (g, w, o, among) => among.filter(r => r.occupation === o.id && npcRank(g, r.avatar) < (jobOf(g)?.rank ?? 0));
onHour.push(drinksTick);
onLook.push((g, w) => { drinksTick(g, w); });
/* ---------- for the AI ---------- */
/** Your job, rank and shift, which colleagues here are your seniors (J7), and, in a world whose people address juniors
 *  at work in a way of their own (`address.junior`), your juniors (E10). */
export function workLine(g, w, present) {
    const j = jobOf(g);
    const o = myJob(g, w);
    if (!j || !o || !systemOn(w, 'jobs') || isScenario(w))
        return '';
    const c = careerOf(g, o);
    const seniors = seniorsOf(g, w, o, present);
    const juniors = w.address?.junior ? juniorsOf(g, w, o, present) : [];
    const boss = bossOf(g, w, o);
    return `{{user}} works as ${rankOf(g, o).name} (${o.name}, rank ${j.rank + 1} of ${c.ranks.length + (c.open ? 1 : 0)}).${seniors.length ? ` At work, ${seniors.map(r => r.name).join(' and ')} ${seniors.length > 1 ? 'are' : 'is'} senior to {{user}} (senpai)${boss && seniors.includes(boss) ? `; ${boss.name} is the boss` : ''}.` : ''}${juniors.length ? ` ${juniors.map(r => r.name).join(' and ')} ${juniors.length > 1 ? 'are' : 'is'} junior to {{user}} (kōhai).` : ''}`;
}
/* ---------- moving ---------- */
export function freeSpots(g, w, zoneId) {
    const zone = w.homes.zones.find(z => z.id === zoneId);
    if (!zone)
        return [];
    const taken = new Set([g.player.home, ...Object.values(g.cast).map(r => r.home)].map(h => `${h.x},${h.y}`));
    return zone.spots.filter(s => !taken.has(`${s[0]},${s[1]}`));
}
// Moving costs one week of the new rent; rent then counts from today.
export function moveTo(g, w, zoneId) {
    const zone = w.homes.zones.find(z => z.id === zoneId);
    const spot = freeSpots(g, w, zoneId)[0];
    if (!zone || !spot)
        return 'There is no free home there.';
    const student = studentLink.homeBlock(g, w, zone.id); // (while you study for a degree: student homes only)
    if (student)
        return student;
    const deposit = priceOf(g, zone.rent);
    if (g.player.money < deposit)
        return 'Not enough money.';
    g.player.money -= deposit;
    book(g, `${zone.name}: deposit`, -deposit);
    g.player.home = { zone: zone.id, kind: zone.kind, x: spot[0], y: spot[1], n: zone.spots.findIndex(s => s[0] === spot[0] && s[1] === spot[1]) + 1 };
    g.player.rentPaidDay = g.day;
    resetBills(g, w);
    note(g, '{u} moved to a new home: {0}.', [zone.name], [], g.player.loc, 'home');
    return '';
}
