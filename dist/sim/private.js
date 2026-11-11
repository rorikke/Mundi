// Private moments that play (adult content, Tokyo's adult progression): a private action done with someone who's ready
// for it gets a roll (the action's skill, Sensuality, as every roll; how your role in bed suits theirs; something you
// know they like; your own likes) against the action's difficulty, and one of three results: great (romance, mood,
// Desire full), good (as any action, a little romance) or awkward (a funny moment, a little mood, nothing lost). What an
// action matches (`matches`) is compared with their likes and hard limits by the gifts' word test: a like is learned on
// a good night, a limit stops the action (a kind no, and it's never offered with them again). Two people can share one,
// when each is fine with the other. Also: the scene verdict's private moments (counted for less), what the AI is told
// about what you know of each other, and your own likes (they never block anything). Everything goes through the hooks
// in sim/hooks.ts and the record of private moments in sim/intimacy.ts; nothing here does anything with adult content
// off.
import { adultOn } from '../core/store.js';
import { systemOn, isScenario } from '../core/world.js';
import { privateChecks, privateResults, actionGates, intimateLines, onRoll } from './hooks.js';
import { relOf, idOf, fr, ro, gain, lose, statusOf, attracted, YOU } from './rel.js';
import { intimacyReady, noteIntimate, knownOf, learn, roleOf, intimateCount } from './intimacy.js';
import { wordsIn, withYou } from './social.js';
import { familyBlocked } from './family.js';
import { CRUSH, DISLIKES } from './romance.js';
import { rollBonus, rollD20 } from './dice.js';
import { effectMul } from './effects.js';
import { addStatus, statusDef } from './needs.js';
import { trainSkill, hobbyFor, skillName } from './hobbies.js';
import { tallyEvent } from './tally.js';
import { traitsInPlay } from './traits.js';
/** What a private moment's result is worth: romance (raw, paced) by result, mood on top, the skill's experience. */
export const PRIVATE = {
    romance: { great: 4, good: 2, awkward: 0 },
    mood: { great: 5, awkward: 2 },
    xp: { great: 15, good: 10, awkward: 4 },
    beatBy: 5, // great: the roll beats the difficulty by this much
    dc: 10, dcRisky: 13, // an action's difficulty when it sets none (one with a risk of being caught: harder)
    knownLike: 2, yourLike: 1, role: 1,
    limitRomance: 2, // romance lost when an action runs into a hard limit
    notInto: 0.25, // the mood you don't get from something you're not into
};
/** A private moment the scene verdict saw (no action clicked): less than an action's. */
export const VERDICT_INTIMATE = { desire: 25, xp: 3 };
const DESIRE = 'desire';
const PILLOW = 'pillow-talk';
const THREESOME = ['threesome', 'threesomes'];
// The prompt's budget for what you know of each other (X24): per person, at most this many likes and limits.
export const KNOWN_MAX = { likes: 4, limits: 2 };
const nameOf = (g, a) => g.cast[a]?.name ?? '';
const listed = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? '');
const tidy = (s) => s.replace(/\s+/g, ' ').trim().replace(/[.;\s]+$/, '');
const profile = (g, a) => relOf(g).people[idOf(g, a)]?.intimate;
/* ---------- likes and limits ---------- */
/** The first of these phrases (someone's likes, limits) that the action's words match, or ''. */
export const matchIn = (g, words, phrases) => !words?.length ? '' : (phrases ?? []).find(p => wordsIn(g, words, p) || wordsIn(g, [p], words.join(' . '))) ?? '';
/** Their likes and hard limits, as their profile has them. */
export const likesOf = (g, a) => (profile(g, a)?.prefs ?? []).filter(s => typeof s === 'string' && s.trim());
export const limitsOf = (g, a) => (profile(g, a)?.limits ?? []).filter(s => typeof s === 'string' && s.trim());
/** Your own likes and the things you're not into: kept in your own intimate profile (`prefs`, `limits`), so "Play as"
 *  makes them the likes of the one you play. They never hide or block anything, and are never told as limits. */
export const yourLikes = (g) => likesOf(g, YOU);
export const yourNotInto = (g) => limitsOf(g, YOU);
export function setYourLikes(g, likes, notInto) {
    const clean = (l) => [...new Set(l.map(tidy).filter(Boolean))];
    const p = (relOf(g).people[YOU] ??= {}), i = (p.intimate ??= {});
    i.prefs = clean(likes);
    i.limits = clean(notInto);
    if (!i.prefs.length)
        delete i.prefs;
    if (!i.limits.length)
        delete i.limits;
    if (!Object.keys(i).length)
        delete p.intimate;
}
/** Your likes that someone shares (a like of theirs it matches): the dating app counts them, as shared interests. */
export const sharedLikes = (g, a) => (adultOn(g) ? yourLikes(g).filter(l => matchIn(g, [l], likesOf(g, a))) : []);
/** Your role in bed: your own profile's, else an In bed trait whose name says it (Leads, Follows, Switch). */
export function yourRole(g, w) {
    const own = profile(g, YOU)?.role;
    if (own)
        return own;
    const adult = new Set((w.sheet?.traits ?? []).flatMap(t => [...(t.adult ? t.options ?? [] : []), ...(t.adultOptions ?? [])]));
    for (const t of traitsInPlay(g, w)) {
        if (!adult.has(t))
            continue;
        const k = t.toLowerCase();
        if (k.startsWith('lead'))
            return 'lead';
        if (k.startsWith('follow'))
            return 'follow';
        if (k.startsWith('switch'))
            return 'switch';
    }
    return undefined;
}
/** How your role suits theirs: +1 one leads and the other follows, −1 both lead or both follow, 0 otherwise. */
export function roleFit(mine, theirs) {
    if (!mine || !theirs || mine === 'switch' || theirs === 'switch')
        return 0;
    return mine === theirs ? -PRIVATE.role : PRIVATE.role;
}
/* ---------- who a private moment is with ---------- */
/** Could a's private moment with you happen now: adult content and romance on, an adult who isn't family, attracted to
 *  you, with their intimacy needs met (and, when they keep it for a partner, your partner). */
export function readyWithYou(g, w, a) {
    const r = g.cast[a];
    return !!r && adultOn(g) && systemOn(w, 'romance') && !familyBlocked(g, a, YOU) && attracted(g, a, YOU) && intimacyReady(g, a, r.name).lean === 'yes';
}
// a and b may share one with you: neither dislikes the other, no family between them, and each is drawn to the other
// (attracted, or a couple, casual included) or likes the idea
function fineWith(g, a, b) {
    if (familyBlocked(g, a, b) || fr(g, a, b) < DISLIKES)
        return false;
    return attracted(g, a, b) || !!statusOf(g, a, b) || !!matchIn(g, THREESOME, likesOf(g, a));
}
const crushOrMore = (g, a) => ro(g, a, YOU) >= CRUSH || !!statusOf(g, a, YOU);
/** Who of the people with you takes part: those ready for it, the closest first; two at most, and two only when both
 *  have a Crush on you or more (casual included) and each is fine with the other (else only the closest one). */
export function whoJoins(g, w, mates) {
    const ready = mates.filter(a => readyWithYou(g, w, a)).sort((a, b) => ro(g, b, YOU) - ro(g, a, YOU));
    if (ready.length < 2)
        return ready;
    const two = ready.filter(a => crushOrMore(g, a));
    for (let i = 0; i < two.length; i++)
        for (let j = i + 1; j < two.length; j++)
            if (fineWith(g, two[i], two[j]) && fineWith(g, two[j], two[i]))
                return [two[i], two[j]];
    return ready.slice(0, 1);
}
/* ---------- the roll ---------- */
/** The skill a private action rolls: its own roll's, else the world's adult skill (Sensuality). */
export const privateSkill = (w, a) => a.roll?.skill ?? (w.skills ?? []).find(s => s.adult)?.id;
/** Its difficulty: its own `dc`, else 10 (13 for one with a risk of being caught). */
export const privateDc = (a) => (typeof a.dc === 'number' ? a.dc : (a.risk ?? 0) > 0 ? PRIVATE.dcRisky : PRIVATE.dc);
/** What the moment adds to the usual bonus for one person: your role against theirs, a like of theirs you know, a like of
 *  your own the action matches. */
export function personBonus(g, w, a, who) {
    let b = roleFit(yourRole(g, w), roleOf(g, who));
    const known = knownOf(g, who).likes;
    if (likesOf(g, who).some(l => known.includes(l) && matchIn(g, a.matches, [l])))
        b += PRIVATE.knownLike;
    if (matchIn(g, a.matches, yourLikes(g)))
        b += PRIVATE.yourLike;
    return b;
}
/** The whole bonus: the usual one (the skill, energy and mood, effects aimed at the skill, the action's tags, `private`,
 *  `intimate`), plus the people's (the mean of the two, when two share it). */
export function privateBonus(g, w, a, who) {
    const tags = [...new Set([...(a.tags ?? []), 'private', 'intimate'])];
    const own = rollBonus(g, w, { skill: privateSkill(w, a), tags });
    const theirs = who.length ? who.reduce((s, p) => s + personBonus(g, w, a, p), 0) / who.length : 0;
    return own + Math.trunc(theirs);
}
/** `extra`: what another check added (sim/drive.ts: +1 when someone here has been wanting you, `notes.eager`). */
export function rollPrivate(g, w, a, who, rnd = Math.random, extra = 0) {
    const bonus = privateBonus(g, w, a, who) + extra, dc = privateDc(a);
    const d20 = rollD20(g, w, bonus, dc, rnd), total = d20 + bonus;
    const tier = d20 === 20 || (d20 !== 1 && total >= dc + PRIVATE.beatBy) ? 'great' : d20 !== 1 && total >= dc ? 'good' : 'awkward';
    const skill = privateSkill(w, a);
    for (const f of onRoll)
        f({ skill: skill ? skillName(w, skill) : a.name, d20, total, dc, grade: tier === 'great' ? 'critical-success' : tier === 'good' ? 'success' : 'fail' });
    return { d20, bonus, total, dc, tier };
}
// A funny moment for an awkward night: the world's `awkward` table (its text only), else one of these.
const AWKWARD = [
    { id: 'aw_cramp', weight: 1, text: 'A leg cramp at the worst possible moment turns it into a fit of giggles.' },
    { id: 'aw_wall', weight: 1, text: 'The neighbour knocks on the wall, and after that neither of you can stop laughing.' },
    { id: 'aw_soon', weight: 1, text: 'It is over sooner than either of you meant, and you end up laughing about it under the covers.' },
    { id: 'aw_giggle', weight: 1, text: 'A giggle fit starts halfway through and never quite goes away.' },
];
export function awkwardOutcome(w, rnd = Math.random) {
    const rows = (w.tables?.awkward ?? []).filter(r => r?.text && (r.weight ?? 0) > 0);
    const list = rows.length ? rows.map(r => ({ id: r.id, weight: r.weight, text: r.text })) : AWKWARD;
    const total = list.reduce((s, o) => s + o.weight, 0);
    let x = rnd() * total;
    for (const o of list) {
        x -= o.weight;
        if (x < 0)
            return o;
    }
    return list[list.length - 1];
}
export const notesOf = (x) => x.notes.a;
const isPillow = (a) => !!a.tags?.includes(PILLOW);
// A hard limit of someone taking part: it doesn't happen. They say no kindly and you talk instead; romance a little
// down, and you know that limit now (the action isn't offered with them again).
function limitStop(g, w, a, who, limit) {
    const name = nameOf(g, who);
    if (systemOn(w, 'romance'))
        lose(g, 'r', who, YOU, PRIVATE.limitRomance);
    if (learn(g, who, 'limit', limit))
        tallyEvent(g, 'learned', 1, who);
    const text = `${name} doesn't want that, and says so kindly. You talk instead; now you know.`;
    return {
        lines: [{ text, kind: 'info' }], roll: null, outcome: { weight: 0, text }, keepsake: null, with: [who], together: [],
        ai: `[Just now {{user}} wanted to ${a.label.toLowerCase()} with ${name}, but it goes against one of ${name}'s hard limits (${tidy(limit)}): ${name} says a clear, kind no, and they talk instead. Narrate it gently; it isn't a fight, and it doesn't happen.]`,
    };
}
privateChecks.push((g, w, x) => {
    const who = whoJoins(g, w, x.with);
    const notes = { who };
    x.notes.a = notes;
    if (!who.length)
        return; // nobody ready for it: it plays as any action
    if (isPillow(x.a)) {
        notes.talk = true;
        return;
    }
    for (const p of who) {
        const l = matchIn(g, x.a.matches, limitsOf(g, p));
        if (l) {
            x.stop = limitStop(g, w, x.a, p, l);
            return;
        }
    }
    if (isScenario(w)) {
        notes.tier = 'good';
        return;
    } // Home: no rolls, as for every action
    // (sim/drive.ts, whose check runs first: +1 when someone here has been wanting you, once however many)
    notes.roll = rollPrivate(g, w, x.a, who, x.rnd, Math.min(1, Math.max(0, Number(x.notes.eager ?? 0) || 0)));
    notes.tier = notes.roll.tier;
    if (notes.tier === 'awkward')
        x.outcome = awkwardOutcome(w, x.rnd);
});
/* ---------- once it has played: what came of it ---------- */
// Pillow talk: one like or limit of theirs you didn't know, picked here; a little friendship. Not a moment of its own.
export function unknownOf(g, a) {
    const k = knownOf(g, a);
    const like = likesOf(g, a).find(l => !k.likes.includes(l)), limit = limitsOf(g, a).find(l => !k.limits.includes(l));
    return like ? { what: 'like', value: like } : limit ? { what: 'limit', value: limit } : null;
}
const canTalk = (g, w, a) => readyWithYou(g, w, a) && crushOrMore(g, a) && !!unknownOf(g, a);
function pillowTalk(g, done, who) {
    const p = who.find(a => crushOrMore(g, a) && unknownOf(g, a));
    const u = p ? unknownOf(g, p) : null;
    if (!p || !u)
        return;
    learn(g, p, u.what, u.value);
    tallyEvent(g, 'learned', 1, p);
    gain(g, 'f', p, YOU, 1);
    const name = nameOf(g, p);
    done.lines.push({ text: u.what === 'like' ? `You learned something ${name} likes: ${tidy(u.value)}.` : `You learned something ${name} won't do: ${tidy(u.value)}.`, kind: 'success' });
    done.ai = done.ai.replace(/\]$/, ` In the talk ${name} tells {{user}} ${u.what === 'like' ? 'something they love' : 'something they never want'}: ${tidy(u.value)}.]`);
}
privateResults.push((g, w, x, done) => {
    const n = notesOf(x);
    if (!n?.who.length)
        return;
    const who = n.who;
    if (n.talk) {
        pillowTalk(g, done, who);
        return;
    }
    const tier = n.tier ?? 'good';
    const names = who.map(a => nameOf(g, a));
    const says = [];
    for (const p of who) {
        noteIntimate(g, p);
        tallyEvent(g, 'intimate', 1, p);
        const raw = PRIVATE.romance[tier];
        if (raw > 0 && systemOn(w, 'romance'))
            gain(g, 'r', p, YOU, raw * effectMul(g, w, 'gain', ['intimate', `intimate:${roleOf(g, p) ?? ''}`]));
        // a like the action matches is learned on a good night
        const liked = tier !== 'awkward' ? matchIn(g, x.a.matches, likesOf(g, p)) : '';
        if (liked && learn(g, p, 'like', liked)) {
            tallyEvent(g, 'learned', 1, p);
            done.lines.push({ text: `You learned something ${nameOf(g, p)} likes: ${tidy(liked)}.`, kind: 'success' });
            says.push(`${nameOf(g, p)} clearly loves it (${tidy(liked)}).`);
        }
        const fit = roleFit(yourRole(g, w), roleOf(g, p));
        if (fit < 0)
            says.push(`${nameOf(g, p)} and {{user}} both want to ${roleOf(g, p) === 'lead' ? 'lead' : 'be led'}, and it shows.`);
    }
    if (who.length > 1)
        tallyEvent(g, 'threesome', 1, who[0]);
    // mood: more on a great night, a little on an awkward one; less from something you're not into. Scaled by your
    // drive as the action's own mood is (sim/drive.ts sets `notes.moodMul` in its check; ×1 without it)
    const mul = Number(x.notes.moodMul ?? 1) || 1;
    if (tier === 'great')
        addStatus(g, w, 'mood', Math.round(PRIVATE.mood.great * mul));
    if (tier === 'awkward')
        addStatus(g, w, 'mood', Math.round(PRIVATE.mood.awkward * mul));
    if (matchIn(g, x.a.matches, yourNotInto(g))) {
        const m = Math.max(0, x.a.effects?.mood ?? 0) + Math.max(0, done.outcome?.effects?.mood ?? 0);
        if (m > 0)
            addStatus(g, w, 'mood', -Math.round(m * mul * PRIVATE.notInto));
    }
    if (tier === 'great') {
        const d = statusDef(w, DESIRE);
        if (d)
            addStatus(g, w, DESIRE, d.max);
    }
    // the skill, by how it went (an action that trains it already gave its practice)
    const skill = privateSkill(w, x.a);
    if (skill) {
        const xp = PRIVATE.xp[tier] - (hobbyFor(w, x.a)?.id === skill ? 6 : 0);
        if (xp > 0)
            trainSkill(g, w, skill, xp).forEach(t => done.lines.push({ text: t, kind: 'success' }));
    }
    if (tier === 'great')
        done.lines.push({ text: `A night to remember with ${listed(names)}.`, kind: 'success' });
    // what the AI is told: who took part, how it went
    const left = x.with.filter(a => !who.includes(a)).map(a => nameOf(g, a)).filter(Boolean);
    if (who.length > 1)
        says.unshift(`${listed(names)} share it with {{user}}, all three of them together.`);
    if (left.length)
        says.push(`${listed(left)} ${left.length > 1 ? "don't" : "doesn't"} take part in the intimate part.`);
    if (tier === 'great')
        says.unshift(`This was one of the best nights ${listed(names)} ${who.length > 1 ? 'have' : 'has'} had with {{user}}.`);
    if (tier === 'awkward')
        says.unshift('It was clumsy and funny rather than smooth: nobody is hurt or upset, they laugh about it.');
    if (says.length)
        done.ai = done.ai.replace(/\]$/, ` ${says.join(' ')}]`);
});
/* ---------- what's offered: past a known limit, never; pillow talk only with something to learn ---------- */
actionGates.push((g, w, a) => {
    if (!adultOn(g) || !(a.private || (a.risk ?? 0) > 0))
        return '';
    if (isPillow(a))
        return a.together && !withYou(g, w).some(p => canTalk(g, w, p)) ? 'There is nothing to talk about yet.' : '';
    if (!a.matches?.length || !a.together)
        return '';
    for (const p of withYou(g, w))
        if (matchIn(g, a.matches, knownOf(g, p).limits))
            return `${nameOf(g, p)} won't do that.`;
    return '';
});
/* ---------- a private moment the scene verdict saw (X19) ---------- */
/** Could a private moment have happened in this scene with a (the verdict may then say it did): a private place, and
 *  a ready to be with you. Asked when the scene is captured. */
export const verdictCould = (g, w, a, privateHere) => privateHere && readyWithYou(g, w, a);
/** The verdict says a's scene with you was intimate: counted as a private moment, for less than an action (no roll, no
 *  like learned, no romance beyond the verdict's own): the record, the moment, a little Desire and practice. */
export function verdictIntimate(g, w, a) {
    noteIntimate(g, a);
    tallyEvent(g, 'intimate', 1, a);
    if (statusDef(w, DESIRE))
        addStatus(g, w, DESIRE, VERDICT_INTIMATE.desire);
    const skill = (w.skills ?? []).find(s => s.adult)?.id;
    if (skill)
        trainSkill(g, w, skill, VERDICT_INTIMATE.xp);
}
/* ---------- the intimate block (X24) ---------- */
// The matches of the private action going on in the scene (what's happening now): those come first.
const nowMatches = (g) => g.act?.a?.matches ?? [];
const firstMatching = (g, list, max) => {
    const now = nowMatches(g), hit = (s) => !!now.length && !!matchIn(g, now, [s]);
    return [...list.filter(hit), ...list.filter(s => !hit(s))].slice(0, max).map(tidy);
};
/** One line per person whose profile the block tells: what you know of their likes and limits, what they know of
 *  yours (someone you've been with), how your roles suit each other. */
export function knownLines(g, w, who) {
    const out = [];
    const mine = yourLikes(g), role = yourRole(g, w);
    for (const r of who) {
        const k = knownOf(g, r.avatar), bits = [];
        const likes = firstMatching(g, k.likes, KNOWN_MAX.likes), limits = firstMatching(g, k.limits, KNOWN_MAX.limits);
        if (likes.length)
            bits.push(`{{user}} knows ${r.name} likes ${listed(likes)}`);
        if (limits.length)
            bits.push(`{{user}} knows ${r.name} won't do ${listed(limits)}`);
        if (mine.length && intimateCount(g, r.avatar) > 0)
            bits.push(`${r.name} knows {{user}} likes ${listed(firstMatching(g, mine, KNOWN_MAX.likes))}`);
        const theirs = roleOf(g, r.avatar), fit = roleFit(role, theirs);
        if (fit > 0)
            bits.push(`in bed ${theirs === 'lead' ? `${r.name} leads and {{user}} follows` : `{{user}} leads and ${r.name} follows`}, and they suit each other`);
        if (fit < 0)
            bits.push(`in bed ${r.name} and {{user}} both want to ${theirs === 'lead' ? 'lead' : 'be led'}, and they clash over it`);
        if (bits.length)
            out.push(`- ${r.name}: ${bits.join('; ')}.`);
    }
    return out;
}
intimateLines.push((g, w, _here, _present, who) => knownLines(g, w, [...who.full, ...who.limitsOnly]));
