// Fame and being recognized (adult industry, the life outside the shoots): a fame number per seat (performing most,
// directing a third, the label a tenth) that grows with each release and each week on the chart and fades a week
// without one; strangers who recognize you in public (by fame and the place's tags, once a day at most): a fan's
// approach waiting for its card, or someone who tells the people around (a rumor about you, adult); a day job whose
// `stigma` minds (a coworker recognizing you: a warning, and with stigma 2 let go the second time in a season; a
// university student gets a quiet word and nothing more); and your family learning of it (a message and a cool season
// of approval that recovers, never a block). Who knows and what they think is sim/stance.ts's; the two meet through
// `stanceBridge` below. Nothing here does anything with the `industry` system or adult content off, or in a world
// without an industry, and nothing is written to the save until you have fame.
import { adultOn, nowAbs, residentsOf } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { INDUSTRY } from '../core/industry.js';
import { isFamily } from '../core/feel.js';
import { onDay, onLook, onRelease, industryLink, sceneLines } from './hooks.js';
import { presentAt } from './people.js';
import { placeOf, playerHomeId } from './places.js';
import { startRumor, approve, tiesOf } from './living.js';
import { addStatus } from './needs.js';
import { note, placeName } from './facts.js';
import { seasonDays } from './time.js';
import { myJob } from './work.js';
import { workWarning, CAUGHT } from './caught.js';
import { degreeOf } from './degrees.js';
import { textFrom } from './social.js';
import { YOU } from './rel.js';
import { personaName } from '../st/bridge.js';
/** The numbers (first guesses, tuned by the long run). */
export const FAME = {
    /** a release's fame (the world's `fame.titles`, at quality 60) times this per seat; the weekly fade too (the stills
     *  photographer's none: no fame as a performer) */
    seat: { perform: 1, direct: 1 / 3, label: 0.1, stills: 0 },
    chart: 1, // a week with a title of yours in the chart's top 10 (× the seat's share)
    top3: 2, // …in its top 3, instead
    recognize: 0.08, // a public place's chance: fame/100 × the place's weight × this (L: 0.25 recognized a famous player every other day)
    fan: 0.6, // of those recognized, a fan's approach (else a stranger tells someone present; always a fan when nobody is)
    clingy: 0.2, // a fan who won't let go
    fanMood: 3, // a photo or a signature: mood
    clingyMood: -3, // a fan who won't let go: mood
    fanMinutes: 180, // a fan's approach waits this long for its card, at the place, then it's gone
    stigma: 0.3, // a week worked at a day job with stigma: fame/100 × this that a coworker recognizes you
    family: 40, // fame at which family may learn of it, once a season (half the time each)
    cool: 20, // family learning of it: approval down, back over a season
    knows: 60, // fame at which everyone you've met knows (sim/stance.ts)
};
/** The save's `g.industry` (A's object, sim/industry.ts) without writing; R's keys are `fame`, `fans`, `stance`, `out`. */
export const peekInd = (g) => g.industry;
/** …and for writing: created with only what R adds (A's own keys are A's to fill). */
export const indOf = (g) => (g.industry ??= {});
export const outOf = (g) => (indOf(g).out ??= {});
/** Is the industry played here now: a world with an industry, the system and adult content on. */
export const industryOn = (g, w) => !!w?.industry && systemOn(w, 'industry') && adultOn(g);
const fameDef = (w) => w.industry?.fame ?? INDUSTRY.fame;
const SEATS = ['perform', 'direct', 'label'];
const round1 = (n) => Math.round(n * 10) / 10;
const seasonNo = (g, day = g.day) => Math.floor((Math.max(1, day) - 1) / seasonDays(g));
/** What sim/stance.ts tells this file (it fills these in): someone learns of your work (how), lines; do they know. */
export const stanceBridge = { learn: () => [], knows: () => false };
/* ---------- fame ---------- */
/** Fame in a seat (0–100), or without one your best seat's. 0 with nothing yet. */
export function fameOf(g, seat) {
    const f = peekInd(g)?.fame ?? {};
    return seat ? f[seat] ?? 0 : Math.max(0, ...SEATS.map(s => f[s] ?? 0));
}
/** The seat you're best known for (null with no fame). */
export function famousFor(g) {
    const f = peekInd(g)?.fame ?? {};
    let best = null;
    for (const s of SEATS)
        if ((f[s] ?? 0) > 0 && (best === null || (f[s] ?? 0) > (f[best] ?? 0)))
            best = s;
    return best;
}
/** Fame in a seat up or down (held in 0–100). */
export function addFame(g, seat, n) {
    const f = (indOf(g).fame ??= {});
    f[seat] = Math.max(0, Math.min(100, round1((f[seat] ?? 0) + n)));
}
// a line when fame crosses a step (what the rest of the game will feel)
const STEPS = [[20, 'People in the industry\'s circles know your face now.'], [40, 'Strangers recognize you now and then.'],
    [60, 'You\'re well known: most people you know have heard of your work.'], [80, 'You\'re famous: people recognize you all over town.']];
const crossed = (before, after) => STEPS.filter(([at]) => before < at && after >= at).map(([, t]) => t);
/** A title released (sim/titles.ts through `onRelease`): fame for each seat you held on it, by its quality. Lines. */
export function fameOnRelease(g, w, t) {
    if (!industryOn(g, w) || t.cancelled)
        return [];
    const before = fameOf(g), per = fameDef(w).titles * Math.max(0, t.q ?? 60) / 60, o = outOf(g);
    for (const seat of new Set(t.you)) {
        if (!FAME.seat[seat])
            continue;
        addFame(g, seat, per * FAME.seat[seat]);
        (o.rel ??= {})[seat] = g.day;
    }
    return crossed(before, fameOf(g));
}
onRelease.push(fameOnRelease);
// The week settled (the first day of a new week): chart weeks add, a week without a release fades; the day job's roll.
function weekly(g, w, rnd) {
    const ind = peekInd(g);
    if (!ind?.fame)
        return [];
    const o = outOf(g), wk = Math.floor((g.day - 1) / 7);
    if (o.wk === undefined || o.wk > wk) {
        o.wk = wk;
        return [];
    }
    if (o.wk === wk)
        return [];
    o.wk = wk;
    const before = fameOf(g);
    for (const seat of SEATS) {
        const k = FAME.seat[seat];
        if (industryLink.holds(g, w, 'chart', `${seat} top 3`))
            addFame(g, seat, FAME.top3 * k);
        else if (industryLink.holds(g, w, 'chart', `${seat} top 10`))
            addFame(g, seat, FAME.chart * k);
        else if ((ind.fame[seat] ?? 0) > 0 && g.day - (o.rel?.[seat] ?? -Infinity) > 7)
            addFame(g, seat, -fameDef(w).fade * k);
    }
    return [...crossed(before, fameOf(g)), ...dayJob(g, w, rnd)];
}
/* ---------- recognized in public ---------- */
/** How much more (or less) likely you're recognized at a place, from its tags and the world's `fame.places`: the
 *  strongest tag above 1 if any, else the weakest below 1, else 1. */
export function placeWeight(w, tags) {
    const ws = (tags ?? []).map(t => fameDef(w).places[t]).filter((n) => typeof n === 'number');
    const up = ws.filter(n => n > 1), down = ws.filter(n => n < 1);
    return up.length ? Math.max(...up) : down.length ? Math.min(...down) : 1;
}
/** Is this a public place (not a home, not an outing, a place of the world)? */
export function publicPlace(g, w, loc) {
    if (!loc || loc === playerHomeId || loc.startsWith('home:'))
        return false;
    const p = placeOf(g, w, loc);
    return !!p && !p.home && !(p.tags ?? []).includes('home') && !(p.tags ?? []).includes('outing');
}
/** The chance of being recognized at a place now (a public place; 0 elsewhere or with no fame). */
export function recognizeChance(g, w, loc = g.player.loc) {
    if (!industryOn(g, w) || !publicPlace(g, w, loc))
        return 0;
    return Math.min(1, fameOf(g) / 100 * placeWeight(w, placeOf(g, w, loc)?.tags) * FAME.recognize);
}
const seatWords = { perform: 'from adult videos', direct: 'as an adult video director', label: 'as the head of an adult video label', stills: 'as an adult video stills photographer' };
/** Looking at the scene (`onLook`): at a public place not yet rolled today, and nobody has recognized you today, a roll;
 *  recognized, a fan's approach waits for its card, or a stranger tells the people around (a rumor about you, adult,
 *  and they know). Returns what happened ('' nothing, 'fan', 'rumor'). */
export function lookRecognize(g, w, rnd = Math.random) {
    if (!industryOn(g, w) || !(fameOf(g) > 0))
        return '';
    const o = outOf(g), loc = g.player.loc;
    if (o.fan && !fanNow(g, w))
        delete o.fan;
    if (!publicPlace(g, w, loc))
        return '';
    if (o.look?.day !== g.day)
        o.look = { day: g.day, at: [] };
    if (o.look.hit || o.look.at.includes(loc))
        return '';
    o.look.at.push(loc);
    if (!(rnd() < recognizeChance(g, w, loc)))
        return '';
    o.look.hit = true;
    const seat = famousFor(g) ?? 'perform';
    const here = presentAt(g, w, loc).filter(r => !r.onset && r.avatar !== YOU).map(r => r.avatar);
    if (here.length && !(rnd() < FAME.fan) && strangerTells(g, w, loc, here, seat)) {
        o.seen = { at: nowAbs(g), place: loc, how: 'rumor' };
        return 'rumor';
    }
    if (o.fan)
        return ''; // one card at a time
    o.fan = { at: nowAbs(g), place: loc, seat, ...(rnd() < FAME.clingy ? { clingy: true } : {}) };
    o.seen = { at: nowAbs(g), place: loc, how: 'fan' };
    return 'fan';
}
onLook.push((g, w) => { lookRecognize(g, w); });
// A stranger who recognized you tells the people here: a rumor about you (adult), and they know of your work.
function strangerTells(g, w, loc, here, seat) {
    const r = startRumor(g, w, `Someone recognized ${personaName()} at ${placeName(g, w, loc)} ${seatWords[seat]}.`, loc, { first: here, id: `av:seen:${nowAbs(g)}` });
    if (!r)
        return false;
    r.adult = true;
    r.about = [YOU];
    stanceBridge.learn(g, w, r.knownBy.filter(a => a !== YOU), 'rumor');
    return true;
}
/** The fan's approach waiting for its card now (at the place, within its time), or null. Nothing is written. */
export function fanNow(g, w) {
    const f = industryOn(g, w) ? peekInd(g)?.out?.fan : undefined;
    return f && f.place === g.player.loc && nowAbs(g) - f.at < FAME.fanMinutes ? f : null;
}
/** The card's three answers: *A photo*, *A signature*, *Walk away*. Lines; [] when there's no fan now. */
export function answerFan(g, w, how) {
    const f = fanNow(g, w);
    if (!f)
        return [];
    const ind = indOf(g), o = outOf(g), where = placeName(g, w, f.place), out = [];
    delete o.fan;
    if (how === 'walk') {
        out.push('You smile, say thanks and walk on.');
        if (f.clingy) {
            addStatus(g, w, 'mood', FAME.clingyMood);
            out.push('The fan follows you, calling your name: people turn to look.');
            const here = presentAt(g, w, f.place).filter(r => !r.onset).map(r => r.avatar);
            if (here.length)
                strangerTells(g, w, f.place, here, f.seat);
        }
        return out;
    }
    ind.fans = (ind.fans ?? 0) + 1;
    addStatus(g, w, 'mood', FAME.fanMood);
    out.push(how === 'photo' ? 'You pose for a photo with the fan.' : 'You sign something for the fan.');
    if (f.clingy) {
        addStatus(g, w, 'mood', FAME.clingyMood);
        out.push('They won\'t let go: they follow you a while, asking for more.');
    }
    note(g, '{u} was recognized by a fan at {0}.', [where], [], f.place, 'event');
    return out;
}
/** Fans who approached you and got a photo or a signature (for goals and the Take app). */
export const fansOf = (g) => peekInd(g)?.fans ?? 0;
/* ---------- day jobs ---------- */
// A week worked at a day job with `stigma`: a coworker may recognize you (a warning; with stigma 2, let go the second
// time in a season). A university student: a quiet word at the faculty, once a season at most, nothing more.
function dayJob(g, w, rnd) {
    const fame = fameOf(g), out = [];
    if (!(fame > 0))
        return out;
    const o = outOf(g), season = seasonNo(g);
    if (degreeOf(g, w) && o.faculty !== season && rnd() < fame / 100 * FAME.stigma) {
        o.faculty = season;
        out.push('Someone at the faculty had a quiet word with you about your work in adult video. Nothing more came of it.');
    }
    const j = g.player.job, job = myJob(g, w);
    const stigma = Number(job?.stigma ?? 0);
    if (!j || !(stigma > 0) || !(j.worked ?? []).some(d => d > g.day - 8 && d < g.day))
        return out;
    if (!(rnd() < fame / 100 * FAME.stigma))
        return out;
    out.push(`A coworker at ${job.name} recognized you from your work in adult video.`);
    if (stigma >= 2 && o.warn?.job === j.id && g.day - o.warn.day < seasonDays(g)) {
        g.player.job = null;
        delete o.warn;
        note(g, '{u} was let go ({0}).', [job.name], [], job.place, 'work');
        out.push(`You were let go from ${job.name}: it was the second time this season.`);
        return out;
    }
    out.push(...workWarning(g, w, CAUGHT.atWork));
    o.warn = { job: j.id, day: g.day };
    if (stigma >= 2)
        out.push('Another time this season and you are out.');
    return out;
}
/* ---------- family ---------- */
/** Your family in the game (anyone with a family tie to you: the Tokyo born start's, a parent, a sibling…). */
export function familyOf(g) {
    return tiesOf(g, YOU).filter(t => isFamily(t.type)).map(t => (t.a === YOU ? t.b : t.a)).filter(a => !!g.cast[a] && !g.cast[a].onset);
}
/** A family member learned of your work (sim/stance.ts calls it when they do): a message from them and a cool season
 *  (approval down, coming back day by day over a season). Lines. */
export function familyLearns(g, w, who) {
    if (!industryOn(g, w) || !familyOf(g).includes(who))
        return [];
    const o = outOf(g), name = g.cast[who]?.name ?? who;
    approve(g, who, -FAME.cool);
    (o.cool ??= {})[who] = FAME.cool;
    note(g, '{0} found out about {u}\'s work in adult video.', [name], [who], g.player.loc, 'life');
    const me = personaName();
    void textFrom(g, w, who, `${name} is family to ${me} and just found out about ${me}'s work in adult video: a short message, shaken and disappointed but still family, asking ${me} to talk.`, 'I heard about your work. I don\'t know what to say. Call me when you can.')
        .catch(() => { });
    return [`${name} found out about your work in adult video and sent you a message. Things will be cool between you for a season.`];
}
// Day by day: family's approval comes back; once a season with fame of 40 or more, each family member who doesn't know
// yet may learn of it (half the time).
function familyDay(g, w, rnd) {
    const ind = peekInd(g);
    if (!ind?.fame && !ind?.out?.cool)
        return [];
    const o = outOf(g), out = [];
    for (const [who, left] of Object.entries(o.cool ?? {})) {
        const step = Math.min(left, FAME.cool / seasonDays(g));
        if (g.cast[who])
            approve(g, who, step);
        if (left - step <= 1e-6 || !g.cast[who])
            delete o.cool[who];
        else
            o.cool[who] = Math.round((left - step) * 1000) / 1000;
    }
    if (o.cool && !Object.keys(o.cool).length)
        delete o.cool;
    const season = seasonNo(g);
    if (fameOf(g) >= FAME.family && o.famSeason !== season) {
        o.famSeason = season;
        const learn = familyOf(g).filter(a => !stanceBridge.knows(g, a) && rnd() < 0.5);
        if (learn.length)
            out.push(...stanceBridge.learn(g, w, learn, 'fame'));
    }
    return out;
}
onDay.push((g, w) => (industryOn(g, w) ? [...weekly(g, w, Math.random), ...familyDay(g, w, Math.random)] : []));
/** (tests) The day's settling with a given roll. */
export const fameDay = (g, w, rnd = Math.random) => (industryOn(g, w) ? [...weekly(g, w, rnd), ...familyDay(g, w, rnd)] : []);
/* ---------- words ---------- */
/** Your fame in plain words for the AI or a screen ('' with none): "recognized now and then, most of all in nightlife". */
export function fameWords(g, w) {
    if (!industryOn(g, w))
        return '';
    const f = fameOf(g), seat = famousFor(g);
    if (!seat || f < 5)
        return '';
    const how = f >= 80 ? 'famous: recognized all over town' : f >= 60 ? 'well known: recognized often' : f >= 40 ? 'recognized now and then' : f >= 20 ? 'known in the industry\'s circles' : 'barely known yet';
    return `${how} ${seatWords[seat]}`;
}
// For the AI, while a fan's approach waits: someone here has just recognized {{user}}.
sceneLines.push((g, w) => {
    const f = fanNow(g, w);
    return f ? [`A fan has just recognized {{user}} here ${seatWords[f.seat]} and comes up to them${f.clingy ? ', a little too eager' : ''}.`] : [];
});
/** (for the residents' list) everyone you've met, the ones fame ≥ 60 reaches. */
export const metPeople = (g) => residentsOf(g).filter(r => r.met).map(r => r.avatar);
