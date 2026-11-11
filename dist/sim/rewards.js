// The rewards shop: what life points (sim/points.ts) buy. Its items are the world's (`rewardsOf`: the general ones it
// keeps, renamed and re-priced, and its own), less what this game can't use (adult items without adult content, a
// refill or an item that needs a need that isn't in play). An item may only be bought at a place with one of its
// `roles` (Tokyo's shrines) or while its `when` holds, within its limit (per day, week, season, year, goal, ever; per
// person), with the points. A `boost` starts a timed boost (sim/perks.ts keeps it), a `refill` fills a need now, and
// the other kinds act once through the systems they touch, never past their rules: the Nudge (`gain()` in rel.ts, +15
// in friendship or romance, a week's hold on romance fading), Clear the air and A fresh start (their feelings for you
// back to zero; a fresh start also hides what they remember from the AI and makes you strangers), Forgive and forget
// (`makeUp()`), An invitation (sim/initiative.ts), Quiet a rumor (sim/living.ts), Insight (one true thing the engine
// knows: their heart, how they see you, their secret), Change a trait (`swapTrait()`, `resetHabit()`), Skip a step
// (sim/goals.ts through `goalLink`), Rent holiday (sim/bills.ts), Clean slate at work (sim/work.ts) and Tokyo's daruma
// (the active goal's finishing points doubled). What the AI hears is a fact, as for anything else that happens.
// All of it belongs to the `goals` system: with it off the shop is empty.
import { nowAbs, adultOk, adultOn } from '../core/store.js';
import { systemOn, activeStatuses, placeIs } from '../core/world.js';
import { rewardsOf, isOwnReward, isSystemNeed, PERSON_KINDS } from '../core/goals.js';
import { goalLink } from './hooks.js';
import { pointsState, pointsOf, spendPoints, yearOf, whileSkipping } from './points.js';
import { liftBan } from './caught.js';
import { knownOf, learn, driveOf } from './intimacy.js';
import { tallyEvent } from './tally.js';
import { addBoost, boostsOf } from './perks.js';
import { addStatus } from './needs.js';
import { placeOf } from './places.js';
import { seasonDays } from './time.js';
import { whenHolds, levelHolds } from './when.js';
import { note, fill, forgetFacts } from './facts.js';
import { gain, fr, ro, setFr, setRo, forgetPast, pastOf, statusOf, rateOf, attraction, touch, holdFade, directedAbove, idOf, relOf, SOURCES, YOU } from './rel.js';
import { bondOf, social } from './social.js';
import { romanceBlocked } from './family.js';
import { SLOW_RATE, CRUSH, INFATUATED, DISLIKES } from './romance.js';
import { grudgeOf, makeUp } from './grudges.js';
import { feelingsOf } from './life.js';
import { seat } from './moments.js';
import { inviteSoon, invitesDue, wantOf } from './initiative.js';
import { approvalOf, approve, rumorsAboutYou, quietRumor } from './living.js';
import { threadsOf, threadStates, advanceThreads, revealThread, goneFromMap } from './threads.js';
import { exampleOf, secretCouple } from './dayplan.js';
import { swapTrait, traitNames, strengthGroups, groupOptions, isAdultTrait } from './traits.js';
import { habitsOf, resetHabit } from './habits.js';
import { refreshPersona } from './game.js';
import { skipBills, billsToPay } from './bills.js';
import { cleanSlate, slateToClean } from './work.js';
const PER_WORDS = { day: 'today', week: 'this week', season: 'this season', year: 'this year', goal: 'for this goal', ever: '' };
const pickOf = (kind) => (PERSON_KINDS.includes(kind) ? 'person' : kind === 'retrait' ? 'trait' : kind === 'quiet' ? 'rumor' : null);
const shopOn = (g, w) => !!w && systemOn(w, 'goals') && !!g;
// Needs it counts on that are needs (not systems) must be in play in this game.
const inPlay = (g, w, need) => activeStatuses(w, g).some(s => s.id === need);
/** The items this game has (whether or not they can be bought now). */
export function offeredRewards(g, w) {
    if (!shopOn(g, w))
        return [];
    return rewardsOf(w).filter(x => adultOk(g, x) && (x.kind !== 'refill' || (!!x.need && inPlay(g, w, x.need)))
        && (x.needs ?? []).every(n => isSystemNeed(n) || inPlay(g, w, n)));
}
/* ---------- limits ---------- */
const week = (day) => Math.floor((Math.max(1, day) - 1) / 7);
const season = (g, day) => Math.floor((Math.max(1, day) - 1) / seasonDays(g));
// Purchases that count against an item's limit now (for one person, when the limit is per person).
function usedOf(g, def, person) {
    const lim = def.limit;
    if (!lim)
        return 0;
    const per = lim.per ?? 'ever', goal = goalLink.active(g);
    const same = (b) => per === 'day' ? b.day === g.day : per === 'week' ? week(b.day) === week(g.day) : per === 'season' ? season(g, b.day) === season(g, g.day)
        : per === 'year' ? yearOf(g, b.day) === yearOf(g) : per === 'goal' ? !!goal && b.goal === goal : true;
    return pointsState(g).bought.filter(b => b.id === def.id && (!lim.person || b.person === person) && same(b)).length;
}
const limitLeft = (g, def, person) => (def.limit ? (def.limit.n ?? 1) - usedOf(g, def, person) : Infinity);
const againWords = (def) => { const p = def.limit?.per ?? 'ever'; return p === 'ever' ? 'Already used' : `Used up ${PER_WORDS[p]}`; };
/* ---------- what each kind needs now ---------- */
const activeBoost = (g, id) => boostsOf(g).some(b => b.id === id && b.until > nowAbs(g));
// Why an item can't be bought now, before any pick (null: it can). Points are asked last.
function whyNot(g, w, def) {
    if (def.roles?.length && !def.roles.some(r => placeIs(placeOf(g, w, g.player.loc), r)))
        return `Only at a ${def.roles.join(' or ')}`;
    if (def.when && !whenHolds(g, w, def.when, { key: `reward|${def.id}` }))
        return 'Not now';
    if (!def.limit?.person && limitLeft(g, def) <= 0)
        return againWords(def);
    const k = def.kind;
    if (k === 'boost' && activeBoost(g, def.id))
        return 'Still going';
    if (k === 'refill') {
        const s = activeStatuses(w, g).find(x => x.id === def.need);
        if (s && (g.player.stats[s.id] ?? s.start) >= s.max)
            return 'Already full';
    }
    if (k === 'skip' && !goalLink.canSkip(g, w))
        return 'No step to skip';
    if (k === 'double') {
        const goal = goalLink.active(g);
        if (!goal)
            return 'Pick a life goal first';
        if (pointsState(g).double.includes(goal))
            return 'Already for this goal';
    }
    if (k === 'cleanslate' && !slateToClean(g, w))
        return 'Nothing to forget at work';
    if (k === 'rentfree' && !billsToPay(g, w).length)
        return 'Nothing to pay';
    if (k === 'quiet' && !rumorsAboutYou(g).length)
        return 'No rumor about you is going round';
    if (k === 'retrait') {
        const c = traitChoices(g, w);
        if (!c.groups.length && !c.habits.length)
            return 'Nothing to change';
    }
    if (pickOf(k) === 'person' && !peopleFor(g, w, def.id).some(p => p.ok))
        return 'Nobody to use it on';
    if (def.price > pointsOf(g))
        return 'Not enough life points';
    return null;
}
/** The shop as the Rewards tab shows it: every item this game has, with its price, its limit and whether it can be
 *  bought now. */
export function shopItems(g, w) {
    if (!shopOn(g, w))
        return [];
    return offeredRewards(g, w).map(def => {
        const why = whyNot(g, w, def), lim = def.limit;
        return { id: def.id, name: def.name, icon: def.icon ?? '🎁', desc: def.desc ?? '', price: def.price, kind: def.kind, own: isOwnReward(def.id), pick: pickOf(def.kind),
            limit: lim ? { per: lim.per ?? 'ever', n: lim.n ?? 1, ...(lim.person ? {} : { used: usedOf(g, def) }), person: !!lim.person } : null,
            ok: !why, ...(why ? { why } : {}), def };
    });
}
const togetherWith = (g, a) => !!statusOf(g, a, YOU);
// People you know (not the one you play).
const known = (g) => Object.values(g.cast).filter(r => r.met && idOf(g, r.avatar) !== YOU);
/** Why the Nudge can't raise this meter for them (null: it can): never past the rules (attraction zero means never,
 *  no romance with family, not while they need some time). */
export function nudgeWhy(g, w, a, m) {
    if (m === 'r' && !systemOn(w, 'romance'))
        return 'No romance in this world';
    if (m === 'r' && romanceBlocked(g, a))
        return 'Family, or too young';
    if (attraction(g, a, YOU, m) <= 0)
        return m === 'r' ? 'Not attracted to you' : 'Not interested in being friends';
    if (rateOf(g, m, a, YOU) < SLOW_RATE)
        return 'Needs some time';
    if ((m === 'r' ? ro(g, a, YOU) : fr(g, a, YOU)) >= 100)
        return 'Already as high as it goes';
    return null;
}
function personWhy(g, w, def, r) {
    const a = r.avatar;
    if (def.limit?.person && limitLeft(g, def, a) <= 0)
        return { why: def.limit.per && def.limit.per !== 'ever' ? `Used for them ${PER_WORDS[def.limit.per]}` : 'Already used for them' };
    switch (def.kind) {
        case 'nudge': {
            const meters = ['f', 'r'].filter(m => !nudgeWhy(g, w, a, m));
            return { why: meters.length ? null : nudgeWhy(g, w, a, 'f') ?? nudgeWhy(g, w, a, 'r'), meters };
        }
        case 'clear': return { why: togetherWith(g, a) ? 'You are together' : clearable(g, a) ? null : 'Nothing to clear' };
        case 'fresh': return { why: togetherWith(g, a) ? 'You are together' : null };
        case 'forgive': return { why: grudgeOf(g, a) ? null : 'No grudge to forgive' };
        case 'invite': return { why: goneFromMap(r) ? 'Not around any more' : bondOf(g, a) < DISLIKES ? 'They dislike you' : grudgeOf(g, a) ? 'Still upset with you' : a in invitesDue(g) ? 'Already on its way' : null };
        case 'insight': {
            const questions = insightQuestions(g, w, a, def.questions);
            return { why: questions.length ? null : 'Nothing to learn', questions };
        }
    }
    return { why: null };
}
/** The people an item can be used on (people you know), each with whether it can be used on them now. */
export function peopleFor(g, w, id) {
    if (!shopOn(g, w))
        return [];
    const def = offeredRewards(g, w).find(x => x.id === id);
    if (!def || pickOf(def.kind) !== 'person')
        return [];
    return known(g).map(r => { const x = personWhy(g, w, def, r); return { avatar: r.avatar, name: r.name, ok: !x.why, ...(x.why ? { why: x.why } : {}), ...(x.meters ? { meters: x.meters } : {}), ...(x.questions ? { questions: x.questions } : {}) }; });
}
/* ---------- Clear the air, A fresh start ---------- */
const jealousOf = (g) => (g.jealous ?? {});
const clearable = (g, a) => !!fr(g, a, YOU) || !!ro(g, a, YOU) || !!pastOf(g, a, YOU) || !!grudgeOf(g, a) || a in jealousOf(g);
// Their feelings for you back to zero: friendship, romance, the couple you were, grudges, jealousy and the moods they
// had about you. What happened stays in their memory (facts).
function clearFeelings(g, a) {
    setFr(g, a, YOU, 0);
    setRo(g, a, YOU, 0);
    forgetPast(g, a, YOU);
    social(g).feel = feelingsOf(g).filter(f => f.avatar !== a);
    delete jealousOf(g)[a];
    const s = seat(g);
    s.moments = s.moments.filter(m => !(m.who === a && ['grudge', 'jealous', 'down', 'talk'].includes(m.kind)));
}
// The `bed` questions (adult content): one like, one hard limit or the drive of someone, you pick which. An item that lists
// `questions` keeps to the ones it names, or to a group of them (`bed`).
const QUESTIONS = [{ id: 'heart', name: 'Their heart' }, { id: 'view', name: 'How they see you' }, { id: 'secret', name: 'Their secret' },
    { id: 'bed_like', name: 'Something they like' }, { id: 'bed_limit', name: "Something they won't do" }, { id: 'bed_drive', name: 'Their drive' }];
const groupOf = (q) => q.split('_')[0];
const askable = (only, q) => !only?.length || only.includes(q) || only.includes(groupOf(q));
const told = (g, a) => pointsState(g).told[a] ?? [];
const trimEnd = (s) => s.trim().replace(/[.\s]+$/, '');
// Their heart: who they have feelings for (a crush or love; you included), strongest first; a couple everyone knows of
// isn't news.
function heartAnswer(g, w, a) {
    if (!systemOn(w, 'romance'))
        return null;
    const id = idOf(g, a), name = g.cast[a]?.name ?? '';
    const loves = directedAbove(g, 'r', CRUSH).filter(x => x.x === id && x.y !== id && (x.y === YOU || !!g.cast[x.y])).sort((p, q) => q.v - p.v);
    for (const { y, v } of loves) {
        const deep = v >= INFATUATED, key = `heart:${y}:${deep ? 'love' : 'crush'}`;
        const known = told(g, a).includes(key) || (!!statusOf(g, a, y) && (y === YOU || !secretCouple(g, w, a, y)));
        if (known)
            continue;
        return y === YOU ? { key, t: deep ? '{u} learned that {0} is in love with {u}.' : '{u} learned that {0} has a crush on {u}.', a: [name] }
            : { key, t: deep ? '{u} learned that {0} is in love with {1}.' : '{u} learned that {0} has a crush on {1}.', a: [name, g.cast[y].name] };
    }
    return null;
}
// How they see you: a grudge and why, what they want from you now, whether they could be attracted to you at all.
function viewAnswer(g, w, a) {
    const name = g.cast[a]?.name ?? '', had = told(g, a), out = [];
    const grudge = grudgeOf(g, a);
    if (grudge)
        out.push({ key: `grudge:${grudge.tag}`, t: '{u} learned that {0} is still hurt: {1}.', a: [name, trimEnd(grudge.tag.replace(/^Hurt:\s*/, ''))] });
    const want = wantOf(g, w, a, '{0}');
    if (want)
        out.push({ key: `want:${want}`, t: `{u} learned what {0} wants: ${want.replace(/\{\{user\}\}/g, '{u}')}.`, a: [name] });
    if (systemOn(w, 'romance') && !romanceBlocked(g, a)) {
        const v = attraction(g, a, YOU, 'r'), b = v <= 0 ? 'never' : v < 1 ? 'some' : 'yes';
        out.push({ key: `att:${b}`, t: b === 'never' ? '{u} learned that {0} could never be attracted to {u}.' : b === 'some' ? '{u} learned that {0} is only sometimes drawn to people like {u}.' : '{u} learned that {0} could be attracted to {u}.', a: [name] });
    }
    return out.find(x => !had.includes(x.key)) ?? null;
}
// Their secret (the world's own people only): a stage of a storyline they keep hidden, or a couple they keep secret
// from people who aren't close to them.
function secretAnswer(g, w, a) {
    const r = g.cast[a];
    if (!r || !exampleOf(w, r) || !systemOn(w, 'living'))
        return null;
    const mine = threadsOf(g, w).filter(x => x.r.avatar === a);
    if (mine.some(x => !threadStates(g)[x.t.id]))
        advanceThreads(g, w); // first sight: where each thread is now
    for (const { t } of mine) {
        const st = threadStates(g)[t.id];
        if (st && !st.known && !st.ended && st.stage >= 0)
            return { key: `thread:${t.id}`, t: '{u} found out {0}\'s secret: {1}.', a: [r.name, trimEnd(t.hidden)], thread: t.id };
    }
    for (const b of Object.values(g.cast)) {
        if (b.avatar === a || !statusOf(g, a, b.avatar) || !secretCouple(g, w, a, b.avatar) || told(g, a).includes(`couple:${b.avatar}`))
            continue;
        if (levelHolds(g, w, a, 'good') || levelHolds(g, w, b.avatar, 'good'))
            continue; // they'd have told you
        return { key: `couple:${b.avatar}`, t: '{u} found out that {0} and {1} are secretly together.', a: [r.name, b.name] };
    }
    return null;
}
// What they like, won't do, or how strong their drive is: only for someone with a Crush on you or more (their feelings are the
// door; the item never opens one), only something you don't know yet, only with adult content and romance on.
const crushOrMore = (g, a) => ro(g, a, YOU) >= CRUSH || togetherWith(g, a);
const bedOpen = (g, w, a) => adultOn(g) && systemOn(w, 'romance') && !romanceBlocked(g, a) && attraction(g, a, YOU, 'r') > 0 && crushOrMore(g, a);
const profileOf = (g, a) => relOf(g).people[idOf(g, a)]?.intimate;
const tidy = (s) => s.replace(/\s+/g, ' ').trim().replace(/[.;\s]+$/, '');
function bedAnswer(what) {
    return (g, w, a) => {
        if (!bedOpen(g, w, a))
            return null;
        const name = g.cast[a]?.name ?? '', k = knownOf(g, a);
        if (what === 'drive') {
            if (k.drive || !profileOf(g, a))
                return null;
            return { key: 'bed:drive', t: "{u} learned that {0}'s drive is {1}.", a: [name, driveOf(g, a)], then: () => { learn(g, a, 'drive'); } };
        }
        const mine = what === 'like' ? k.likes : k.limits, list = (what === 'like' ? profileOf(g, a)?.prefs : profileOf(g, a)?.limits) ?? [];
        const value = list.find(s => typeof s === 'string' && s.trim() && !mine.includes(s));
        if (!value)
            return null;
        return { key: `bed:${what}:${value}`, t: what === 'like' ? '{u} learned that {0} likes {1}.' : "{u} learned that {0} won't do {1}.", a: [name, tidy(value)], then: () => { if (learn(g, a, what, value))
                tallyEvent(g, 'learned', 1, a); } };
    };
}
const ANSWERS = { heart: heartAnswer, view: viewAnswer, secret: secretAnswer,
    bed_like: bedAnswer('like'), bed_limit: bedAnswer('limit'), bed_drive: bedAnswer('drive') };
/** The questions Insight can ask about someone now: each only when there's something you don't know yet. `only`: the ones an
 *  item keeps to (`RewardDef.questions`). */
export function insightQuestions(g, w, a, only) {
    if (!w || !g.cast[a])
        return [];
    return QUESTIONS.filter(q => askable(only, q.id) && !!ANSWERS[q.id](g, w, a));
}
/* ---------- Change a trait ---------- */
const SWAPPABLE = { personality: 'Personality', interests: 'Interests' };
/** What Change a trait can do: per group (personality, interests), the traits you have and those you could take
 *  instead; the habits you could drop. Strengths are skill levels: never here. */
export function traitChoices(g, w) {
    if (!w)
        return { groups: [], habits: [] };
    const strengths = strengthGroups(w), mine = traitNames(g);
    // (adult traits and habits only with adult content on: what you have stays, and isn't listed while it's off)
    const groups = (w.sheet?.traits ?? []).filter(t => SWAPPABLE[t.id] && !strengths.includes(t)).map(t => ({ id: t.id, name: SWAPPABLE[t.id],
        have: [...((g.player.traits ?? {})[t.id] ?? [])].filter(o => adultOn(g) || !isAdultTrait(w, o)), can: groupOptions(g, t).filter(o => !mine.includes(o)) })).filter(x => x.have.length && x.can.length);
    const habits = systemOn(w, 'habits') ? habitsOf(g).has.map(id => w.habits?.find(h => h.id === id)).filter(h => !!h && (!h.adult || adultOn(g))).map(h => ({ id: h.id, name: h.trait || h.name })) : [];
    return { groups, habits };
}
/** Rumors about you that Quiet a rumor can stop. */
export const rumorsToQuiet = (g, w) => (w && systemOn(w, 'rumors') ? rumorsAboutYou(g) : []);
/* ---------- buying ---------- */
const no = (why) => ({ ok: false, lines: [why] });
// What each kind does. A string is a refusal (nothing is spent); else the lines to show.
function act(g, w, def, c) {
    const r = c.person ? g.cast[c.person] : undefined, a = r?.avatar ?? '', name = r?.name ?? '', home = `home:${a}`;
    if (pickOf(def.kind) === 'person') {
        if (!r || !r.met || idOf(g, a) === YOU)
            return 'Pick someone you know';
        const x = personWhy(g, w, def, r);
        if (x.why)
            return x.why;
    }
    switch (def.kind) {
        case 'boost':
            addBoost(g, def.id, def.effects ?? [], def.days ?? 1);
            return { lines: [`${def.icon ?? ''} ${def.name}: ${def.desc ?? ''}`.trim()] };
        case 'refill': {
            const s = activeStatuses(w, g).find(x => x.id === def.need);
            if (!s)
                return 'Not in this game';
            addStatus(g, w, s.id, s.max);
            return { lines: [`${def.name}: ${s.name} full.`] };
        }
        case 'nudge': {
            const m = c.meter ?? 'f', why = nudgeWhy(g, w, a, m);
            if (why)
                return why;
            const got = gain(g, m, a, YOU, SOURCES.nudge, false);
            if (!got.d)
                return 'It would make no difference';
            touch(g, a);
            if (m === 'r')
                holdFade(g, a, YOU, g.day + 7);
            note(g, m === 'r' ? '{0} has found {u} on their mind a lot lately.' : '{0} has been thinking warmly of {u} lately.', [name], [a], home, 'reward');
            return { lines: [m === 'r' ? `${name} has you on their mind.` : `${name} feels a little closer to you.`] };
        }
        case 'clear':
            clearFeelings(g, a);
            note(g, '{u} and {0} cleared the air: what was between them is behind them, and they start over.', [name], [a], home, 'reward');
            return { lines: [`You and ${name} start over.`] };
        case 'fresh': {
            clearFeelings(g, a);
            approve(g, a, -approvalOf(g, a));
            note(g, '{u} made a fresh start with {0}, who no longer remembers {u}.', [name], [a], home, 'reward');
            forgetFacts(g, a);
            r.met = false;
            delete (seat(g).crossed ?? {})[a];
            return { lines: [`${name} doesn't remember you. Your journal still does.`] };
        }
        case 'forgive':
            if (!makeUp(g, a))
                return 'No grudge to forgive';
            note(g, '{0} forgave {u} and let it go.', [name], [a], home, 'reward');
            return { lines: [`${name} isn't upset with you any more.`] };
        case 'invite':
            inviteSoon(g, a);
            return { lines: [`${name} will invite you out in the next days.`] };
        case 'quiet': {
            const ru = c.rumor ? rumorsAboutYou(g).find(x => x.id === c.rumor) : undefined;
            if (!ru || !quietRumor(g, ru.id))
                return 'Pick a rumor about you';
            // a rumor about getting caught somewhere also takes back the place's ban (sim/caught.ts)
            return { lines: ['That rumor stops here.', ...(ru.caught && liftBan(g, ru.caught) ? ['And they will serve you there again.'] : [])] };
        }
        case 'insight': {
            const q = c.question && ANSWERS[c.question] && askable(def.questions, c.question) ? c.question : null, ans = q ? ANSWERS[q](g, w, a) : null;
            if (!ans)
                return 'Nothing to learn there';
            ans.then?.();
            if (ans.thread)
                revealThread(g, w, ans.thread, 'insight');
            (pointsState(g).told[a] ??= []).push(ans.key);
            note(g, ans.t, ans.a, [a], home, 'reward');
            const said = fill(ans.t, ans.a, 'you');
            return { lines: [said.charAt(0).toUpperCase() + said.slice(1)] };
        }
        case 'retrait': {
            if (c.habit) {
                const h = traitChoices(g, w).habits.find(x => x.id === c.habit);
                if (!h || !resetHabit(g, w, h.id))
                    return 'You don\'t have that habit';
                note(g, '{u} dropped a habit: {0}.', [h.name.toLowerCase()], [], g.player.loc, 'skill');
                return { lines: [`No longer: ${h.name}.`] };
            }
            if (!c.group || !SWAPPABLE[c.group] || strengthGroups(w).some(t => t.id === c.group))
                return 'Only a personality or an interest trait can be swapped (strengths are skill levels)';
            if (!c.from || !c.to)
                return 'Pick the trait to swap and the new one';
            const res = swapTrait(g, w, c.group, c.from, c.to);
            if (!res.ok)
                return res.text;
            return { lines: [res.text], persona: refreshPersona(g, w, c.group).catch(() => false) };
        }
        case 'skip': {
            if (!goalLink.canSkip(g, w))
                return 'No step to skip';
            return { lines: whileSkipping(() => goalLink.skip(g, w)) };
        }
        case 'rentfree': {
            const lines = skipBills(g, w);
            return lines ? { lines } : 'Nothing to pay';
        }
        case 'cleanslate': {
            const lines = cleanSlate(g, w);
            if (!lines)
                return 'Nothing to forget at work';
            const job = w.occupations.find(o => o.id === g.player.job?.id);
            if (job)
                note(g, '{u} got a clean slate at work ({0}).', [job.name], [], job.place, 'reward');
            return { lines };
        }
        case 'double': {
            const goal = goalLink.active(g);
            if (!goal)
                return 'Pick a life goal first';
            pointsState(g).double.push(goal);
            return { lines: [`${def.name}: finishing this goal pays double.`] };
        }
    }
    return 'That does nothing here';
}
// Purchases kept for limits: a year back, and for good when the limit is per goal or ever.
function tidyBought(g, w) {
    const p = pointsState(g), span = 4 * seasonDays(g), defs = rewardsOf(w);
    p.bought = p.bought.filter(b => { const per = defs.find(d => d.id === b.id)?.limit?.per; return per === 'goal' || per === 'ever' || g.day - b.day <= span; });
}
/** Buys an item with what it needs picked (`choice`) and uses it at once. Nothing is spent when it can't be used. */
export function buyReward(g, w, id, choice = {}) {
    if (!shopOn(g, w))
        return no('The rewards shop is closed.');
    const def = offeredRewards(g, w).find(x => x.id === id);
    if (!def)
        return no('That is not in the shop.');
    const why = whyNot(g, w, def);
    if (why)
        return no(why);
    const done = act(g, w, def, choice);
    if (typeof done === 'string')
        return no(done);
    spendPoints(g, def.price, def.id);
    pointsState(g).bought.push({ id: def.id, day: g.day, ...(choice.person && pickOf(def.kind) === 'person' ? { person: choice.person } : {}), ...(goalLink.active(g) ? { goal: goalLink.active(g) } : {}) });
    tidyBought(g, w);
    return { ok: true, lines: done.lines, ...(done.persona ? { persona: done.persona } : {}) };
}
