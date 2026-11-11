// The Goals app (phone, Profile section) and its Rewards tab. Goals: the goal you follow (its perk first, its steps as
// pips, the current step's objectives with how far you are), or "Pick a life goal" with the badge (D-7); goals
// suggested for you; every goal this game offers in the nine categories, folded (finished ones with a check, the
// world's own with a mark; nothing greyed out: goals a game can't offer simply aren't there); a goal's detail (steps,
// objectives, step rewards, perk); the perks you have. Rewards: your life points and the shop (sim/rewards.ts), with
// the pickers an item needs (a person, the Nudge's meter, Insight's question, a trait, a rumor). The engine owns every
// number (sim/goals.ts, sim/points.ts, sim/rewards.ts); this file only draws and calls. With the `goals` system off
// there is nothing here, no badge and nothing on the profile.
import { esc, game, toast, notify, saveGame, SAVE, type Save } from '../core/store.js';
import { getWorld, systemOn, type WorldDef, type GoalDef, type GoalStep } from '../core/world.js';
import { GOAL_CATEGORIES, GOAL_POINTS, isOwnGoal } from '../core/goals.js';
import { goalsState, offeredGoals, activeGoal, canPick, pickGoal, goalProgress, stepProgress, suggestedGoals, perksOf, needsPick, type Objective } from '../sim/goals.js';
import { pointsOf } from '../sim/points.js';
import { shopItems, peopleFor, traitChoices, rumorsToQuiet, buyReward, type ShopItem, type RewardChoice, type InsightId } from '../sim/rewards.js';
import { countedOf } from '../sim/when.js';
import { placesBeen, beenTo, isRegular } from '../sim/tally.js';
import { placeOf } from '../sim/places.js';
import { bannedUntil } from '../sim/caught.js';
import { courseOf } from '../sim/courses.js';
import { money } from '../sim/needs.js';
import { skillName } from '../sim/hobbies.js';
import { refreshPrompt } from '../sim/prompt.js';
import type { Meter } from '../sim/rel.js';
import { ACT } from './reg.js';

/** What the Goals app shows (memory only): the tab, the categories opened, the goal whose detail is open, the item
 *  being bought and what was picked for it. `said`: the last lines shown (toasted). */
export const GS = {
    tab: 'goals' as 'goals' | 'rewards', open: [] as string[], detail: '',
    buy: '', person: '', meter: '' as '' | Meter, question: '' as '' | InsightId, group: '', from: '', to: '', habit: '', rumor: '',
    said: [] as string[],
};
const clearPick = () => Object.assign(GS, { buy: '', person: '', meter: '', question: '', group: '', from: '', to: '', habit: '', rumor: '' });
// What the app shows belongs to one game: a game opened starts again on the Goals tab, with nothing open or picked.
SAVE.hooks.push(() => { Object.assign(GS, { tab: 'goals', open: [], detail: '' }); clearPick(); });

/** The Goals app's badge (D-7): no goal followed and one to pick. Never with the `goals` system off. */
export const goalsBadge = (g: Save, w: WorldDef): boolean => systemOn(w, 'goals') && needsPick(g, w);

const n = (x: number) => esc(Math.round(x).toLocaleString('en-US'));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const humanize = (id: string) => cap(id.replace(/^[a-z]{2}_/, '').replace(/[_-]+/g, ' '));

/* ---------- objectives in words ---------- */

// The engine's own moments (sim/tally.ts, TALLY_EVENTS), as a count reads.
const EVENT_WORDS: Record<string, string> = {
    meal: 'Meals cooked', workout: 'Workouts', painting: 'Paintings sold', shift: 'Shifts worked', party: 'Parties thrown', missed_shift: 'Missed shifts',
    missed_train: 'Last trains missed', date: 'Dates', overnight: 'Nights over', night_away: 'Nights away', crisis: 'Crises', collapse: 'Collapses',
    apprentice: 'Apprentices taken', lesson: 'Lessons given', taught: 'Apprentices who finished', baby: 'Children', business: 'Businesses opened',
    big_party: 'Parties with five guests', loved_party: 'Parties everyone loved', night_together: 'Nights together', trip: 'Day trips', late_night: 'Late nights',
};
// Friendship and romance levels as people ("3 good friends", "someone with a crush on you").
const LEVEL_WORDS: Record<string, [string, string]> = {
    acquaintance: ['acquaintance', 'acquaintances'], friend: ['friend', 'friends'], good: ['good friend', 'good friends'], best: ['best friend', 'best friends'],
    interest: ['person interested in you', 'people interested in you'], crush: ['person with a crush on you', 'people with a crush on you'],
    infatuated: ['person in love with you', 'people in love with you'], casual: ['casual partner', 'casual partners'], dating: ['partner', 'partners'],
    engaged: ['fiancé(e)', 'fiancé(e)s'], married: ['spouse', 'spouses'],
};
const levelWord = (lvl: string, many: number) => (LEVEL_WORDS[lvl.toLowerCase()] ?? [lvl, lvl])[many === 1 ? 0 : 1];
// An action by its name, with where it's done ("Ramen at Kamejirō") when it belongs to a place.
const actionName = (w: WorldDef, id: string) => {
    const a = w.actions.find(x => x.id === id); if (!a) return humanize(id);
    const p = a.place ? w.places.find(x => x.id === a.place) : null;
    return `${a.name || a.label}${p ? ` at ${p.name}` : ''}`;
};
const placeName = (w: WorldDef, id: string) => w.places.find(p => p.id === id)?.name ?? humanize(id);
const mapName = (w: WorldDef, id: string) => w.maps.find(m => m.id === id)?.name ?? id;
const eventName = (w: WorldDef, id: string) => w.festivals?.find(f => f.id === id)?.name ?? w.cityEvents?.find(e => e.id === id)?.name ?? humanize(id);
const jobName = (w: WorldDef, id: string) => w.occupations.find(o => o.id === id)?.name ?? humanize(id);
const keepsakeName = (w: WorldDef, id: string) => w.keepsakes?.find(k => k.id === id)?.name ?? humanize(id);
// What a counted value counts (`did`), in words.
function didWords(w: WorldDef, what: string): string {
    const [pre, rest] = what.includes(':') ? [what.slice(0, what.indexOf(':')), what.slice(what.indexOf(':') + 1)] : ['', what];
    switch (pre) {
        case 'tag': return `${cap(rest)} (any)`;
        case 'roll': return `${skillName(w, rest)} rolls that went well`;
        case 'win': return `Won: ${actionName(w, rest)}`;
        case 'with': return rest === 'any' ? 'Things done with someone' : `${actionName(w, rest)}, with someone`;
        case 'people': return `${EVENT_WORDS[rest] ?? actionName(w, rest)} with different people`;
    }
    return EVENT_WORDS[what] ?? actionName(w, what);
}
// One value of a condition in words.
function valueWords(w: WorldDef, key: string, v: string): string {
    switch (key) {
        case 'did': { const x = countedOf('did', v); if (!x) return v; return `${didWords(w, x.what)}${x.with ? `, with a ${levelWord(x.with, 1)}` : ''}`; }
        case 'attended': { const x = countedOf('attended', v); if (!x) return v; return x.what === 'any' ? 'Festivals or city events' : eventName(w, x.what); }
        case 'skill': {
            const m = v.match(/^(\S+)\s+(\d+)(?:\s+x(\d+))?$/); if (!m) return v;
            const many = Number(m[3] ?? 1), group = m[1] === 'any' ? '' : m[1] === 'creative' ? 'creative ' : null;
            if (group === null) return `${skillName(w, m[1])} ${m[2]}`;
            return many === 1 ? `A ${group}skill at ${m[2]}` : `${many} ${group}skills at ${m[2]}`;
        }
        case 'money': return 'Money saved';
        case 'visited': {
            if (v === 'map') return 'Every place on one map';
            if (v === 'maps') return 'A place on every map';
            if (v === 'all') return 'Every place';
            let m = v.match(/^all\s+in\s+(\S+)$/); if (m) return `Every place in ${mapName(w, m[1])}`;
            m = v.match(/^(\d+)\s+regular$/); if (m) return 'Places where you are a regular';
            m = v.match(/^(\d+)\s+in\s+(\S+)$/); if (m) return `Places visited in ${mapName(w, m[2])}`;
            if (/^\d+$/.test(v)) return 'Places visited';
            m = v.match(/^(\S+)\s+regular$/); if (m) return `A regular at ${placeName(w, m[1])}`;
            return `Go to ${placeName(w, v)}`;
        }
        case 'job': return v === 'any' ? 'A job' : `Work as ${jobName(w, v)}`;
        case 'rank': {
            const m = v.match(/^(\S+)\s+in\s+(\d+)\s+jobs$/); if (m) return `Rank ${m[1]} in ${m[2]} jobs`;
            return v === 'top' ? 'The top rank' : v === 'middle' ? 'The middle rank' : v === 'top-1' ? 'One rank below the top' : `Rank ${v}`;
        }
        case 'home': return v === 'alone' ? 'Living on your own' : v === 'better' ? 'A better home than your first' : v === 'top' ? 'A home among the best' : v === 'season' ? 'A season in your home' : /^\d+$/.test(v) ? `${v} days in your home` : `A home: ${humanize(v)}`;
        case 'partner': return v === 'any' ? 'A partner' : v === 'none' ? 'Single' : v === 'home' ? 'Living with your partner' : cap(v);
        case 'friends': {
            const m = v.match(/^(\d+)\s+(\S+)(?:\s+(?:in\s+(\S+)|at\s+(regular)))?$/i); if (!m) return v;
            const k = Number(m[1]), who = `${k === 1 ? (/^[aeiou]/i.test(levelWord(m[2], 1)) ? 'An' : 'A') : k} ${levelWord(m[2], k)}`;
            return `${who}${m[3] ? ` in ${mapName(w, m[3])}` : m[4] ? ' where you are a regular' : ''}`;
        }
        case 'course': return /^\d+$/.test(v) ? 'Courses finished' : `The course ${courseOf(w, v)?.name ?? humanize(v)}`;
        case 'secrets': return 'Secrets learned';
        case 'known': return 'Likes and limits you know of your lovers';
        case 'helped': return /^\d+$/.test(v) ? `${v} storyline${v === '1' ? '' : 's'} helped to a good ending` : 'A storyline helped to a good ending';
        case 'holds': return /^\d+$/.test(v) ? `${v} different keepsakes` : v === 'kind:any' ? 'Every keepsake of one kind' : v.startsWith('kind:') ? `Every ${v.slice(5)} keepsake` : `Keep ${keepsakeName(w, v)}`;
        case 'need': { const [id, x] = v.split(/\s+/); return id === 'all' ? `Every need at ${x} or more` : `${cap(w.statuses.find(s => s.id === id)?.name ?? id)} at ${x} or more`; }
        case 'rep': return `Reputation: ${v}`;
        case 'festival': return v === 'any' ? 'A festival day' : `During ${eventName(w, v)}`;
        case 'event': return v === 'any' ? 'A city event' : `During ${eventName(w, v)}`;
        case 'stayed': return `A night at ${placeName(w, v)}`;
        case 'goal': return /^\d+$/.test(v) ? `${v} life goals finished` : `Life goal: ${humanize(v.split(/\s+/)[0])}`;
        case 'place': return `At ${placeName(w, v)}`;
    }
    return `${cap(key)}: ${v}`;
}
// Places you've been to among the world's visitable ones (as sim/when.ts counts them), for the counts the engine's
// `stepProgress` leaves without numbers ("Visited 4 of 9 places in Asakusa", "regular at 2 of 3").
const visitable = (w: WorldDef) => w.places.filter(p => !p.link && !p.private && !p.adult);
const onMapOf = (w: WorldDef, p: { map: string }, map: string) => p.map === map || w.maps.find(m => m.id === p.map)?.area === map;
function extraCount(g: Save, w: WorldDef, key: string, v: string): { have: number; need: number } | null {
    if (key === 'visited') {
        let m = v.match(/^(\d+)\s+in\s+(\S+)$/);
        if (m) return { have: visitable(w).filter(p => onMapOf(w, p, m![2]) && beenTo(g, p.id)).length, need: Number(m[1]) };
        m = v.match(/^all\s+in\s+(\S+)$/);
        if (m) { const on = visitable(w).filter(p => onMapOf(w, p, m![1])); return { have: on.filter(p => beenTo(g, p.id)).length, need: on.length }; }
        m = v.match(/^(\d+)\s+regular$/);
        if (m) return { have: visitable(w).filter(p => isRegular(g, p.id)).length, need: Number(m[1]) };
        if (v === 'all') return { have: placesBeen(g).filter(id => visitable(w).some(p => p.id === id)).length, need: visitable(w).length };
    }
    if (key === 'course' && /^\d+$/.test(v)) return { have: ((g.player as any).learning?.done ?? []).length, need: Number(v) };
    return null;
}
/** One objective as a row reads: its words, and `have/need` where a number says how far you are. */
export function objectiveWords(g: Save, w: WorldDef, o: Objective): { text: string; have?: number; need?: number } {
    const values = o.text.slice(o.text.indexOf(':') + 1).trim().replace(/^not\s+/, '').split(/\s+or\s+/);
    const words = values.map(v => valueWords(w, o.key, v)).join(' or ');
    const text = o.not ? `No ${words.charAt(0).toLowerCase()}${words.slice(1)}` : words;
    let have = o.have, need = o.need;
    if (have === undefined && values.length === 1 && !o.not) { const x = extraCount(g, w, o.key, values[0]); if (x) ({ have, need } = x); }
    // a count of one reads as done or not, not as 0/1
    if (need !== undefined && need <= 1 && o.key !== 'skill') return { text };
    if (have === undefined || need === undefined) return { text };
    // a single skill reads "Cooking 3/5": the level asked for is the number after the slash
    if (o.key === 'skill' && values.length === 1) return { text: text.replace(/\s+\d+$/, ''), have, need };
    return { text, have, need };
}
function objectiveHtml(g: Save, w: WorldDef, o: Objective): string {
    const x = objectiveWords(g, w, o);
    const num = x.have !== undefined && x.need !== undefined
        ? ` <span class="mu-gl-num">${o.key === 'money' ? `${esc(money(w, Math.min(x.have, x.need)))} / ${esc(money(w, x.need))}` : `${n(Math.min(x.have, x.need))}/${n(x.need)}`}</span>` : '';
    const bar = x.have !== undefined && x.need ? `<span class="mu-bond"><i style="width:${Math.max(0, Math.min(100, Math.round((x.have / x.need) * 100)))}%"></i></span>` : '';
    return `<li class="${o.ok ? 'is-ok' : ''}"><i>${o.ok ? '✓' : '○'}</i><span><span class="mu-gl-otext">${esc(x.text)}${num}</span>${bar}${o.ok ? '' : hintOf(o)}</span></li>`;
}
// How to do an objective the game has no button for in a scene: living together is set in This world → Households.
const hintOf = (o: Objective) => (o.key === 'partner' && !o.not && o.text.slice(o.text.indexOf(':') + 1).split(' or ').map(v => v.trim()).includes('home') ? `<small class="mu-gl-hint">${esc('To live together, move your partner into your household: This world → Households.')}</small>` : '');
// A step's ways of being done, each a list of objectives (several ways read "or").
function waysHtml(g: Save, w: WorldDef, goal: GoalDef, step: number): string {
    const p = stepProgress(g, w, goal.id, step);
    if (!p) return '';
    const ways = p.ways.map(objs => `<ul class="mu-gl-objs">${objs.map(o => objectiveHtml(g, w, o)).join('')}</ul>`);
    const hold = p.hold ? `<small class="mu-gl-hold">Held ${n(Math.min(p.hold.days, p.hold.need))} of ${n(p.hold.need)} days</small>` : '';
    return `${ways.join('<small class="mu-gl-or">or</small>')}${hold}`;
}

/* ---------- the Goals tab ---------- */

const perkLine = (goal: GoalDef) => (goal.perk ? `${goal.perk.name}${goal.perk.desc ? `: ${goal.perk.desc}` : ''}` : '');
function pipsHtml(done: number, total: number, finished: boolean): string {
    return `<span class="mu-gl-pips" aria-label="${esc(`${done} of ${total} steps`)}">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'is-done' : i === done && !finished ? 'is-now' : ''}"></i>`).join('')}</span>`;
}
function activeHtml(g: Save, w: WorldDef): string {
    const goal = activeGoal(g, w);
    if (!goal) {
        const notice = goalsState(g).notice?.text;
        return `<section class="mu-ph-card mu-gl-active is-empty"><b>Pick a life goal <em class="mu-gl-badge">!</em></b>
            <small>${esc(notice || 'It guides your days, and finishing it gives you a perk.')}</small><small class="mu-muted">One goal at a time; switch whenever you like, nothing is lost.</small></section>`;
    }
    const p = goalProgress(g, w, goal.id), i = Math.min(p.done, goal.steps.length - 1), st = goal.steps[i];
    return `<section class="mu-ph-card mu-gl-active"><small>Your life goal</small>
        <button class="mu-gl-title" data-act="gl-open" data-id="${esc(goal.id)}"><i>${esc(goal.icon ?? '⭐')}</i><b>${esc(goal.name)}</b></button>
        ${goal.perk ? `<small class="mu-gl-perk"><b>Perk:</b> ${esc(perkLine(goal))}</small>` : ''}
        ${pipsHtml(p.done, p.total, p.finished)}
        <small>Step ${n(i + 1)} of ${n(p.total)}: <b>${esc(st.name)}</b></small>
        ${waysHtml(g, w, goal, i)}</section>`;
}
// The small mark a world's own goal carries in a list (Suggested and the categories).
const ownMark = (w: WorldDef, goal: GoalDef) => (isOwnGoal(goal.id) ? ` <span class="mu-gl-own" title="${esc(`${w.name}'s own`)}">✦</span>` : '');
function suggestedHtml(g: Save, w: WorldDef): string {
    const list = suggestedGoals(g, w, 3);
    if (!list.length) return '';
    return `<section class="mu-gl-suggest"><h4>Suggested</h4>${list.map(x => `<div class="mu-gl-sug">
        <button class="mu-gl-row" data-act="gl-open" data-id="${esc(x.id)}"><i>${esc(x.icon ?? '⭐')}</i><b>${esc(x.name)}${ownMark(w, x)}</b><small>${esc(perkLine(x))}</small></button>
        <button class="mu-primary" data-act="gl-pick" data-id="${esc(x.id)}">Pick</button></div>`).join('')}</section>`;
}
// Categories: the nine in their order, then any new one a world's own goals use (its own group).
function categoriesOf(goals: GoalDef[]): { id: string; name: string; icon: string }[] {
    const extra = [...new Set(goals.map(x => x.category))].filter(c => !GOAL_CATEGORIES.some(k => k.id === c));
    return [...GOAL_CATEGORIES, ...extra.map(id => ({ id, name: humanize(id), icon: '🌟' }))].filter(c => goals.some(x => x.category === c.id));
}
function rowHtml(g: Save, w: WorldDef, goal: GoalDef): string {
    const p = goalProgress(g, w, goal.id);
    const state = p.finished ? '<em class="mu-gl-check" aria-label="Finished">✓</em>' : p.active ? '<em class="mu-gl-now">Now</em>' : p.done ? `<em class="mu-gl-step">${n(p.done)}/${n(p.total)}</em>` : '';
    return `<button class="mu-gl-row ${p.active ? 'is-on' : ''} ${p.finished ? 'is-done' : ''}" data-act="gl-open" data-id="${esc(goal.id)}"><i>${esc(goal.icon ?? '⭐')}</i>
        <b>${esc(goal.name)}${ownMark(w, goal)}</b><small>${esc(perkLine(goal))}</small>${state}</button>`;
}
function allGoalsHtml(g: Save, w: WorldDef): string {
    const goals = offeredGoals(g, w), s = goalsState(g);
    const order = (x: GoalDef) => { const p = goalProgress(g, w, x.id); return p.finished ? 2 : p.active || p.paused || p.done ? 0 : 1; };
    return `<section class="mu-gl-all"><h4>All goals</h4>${categoriesOf(goals).map(c => {
        const mine = goals.map((x, i) => ({ x, i })).filter(y => y.x.category === c.id).sort((a, b) => order(a.x) - order(b.x) || a.i - b.i).map(y => y.x);
        const done = mine.filter(x => s.done.includes(x.id)).length, open = GS.open.includes(c.id);
        return `<div class="mu-gl-cat ${open ? 'is-open' : ''}"><button class="mu-gl-cathead" data-act="gl-cat" data-id="${esc(c.id)}" aria-expanded="${open}"><i>${esc(c.icon)}</i><b>${esc(c.name)}</b>
            <small>${n(mine.length)} goal${mine.length === 1 ? '' : 's'}${done ? ` · ${n(done)} finished` : ''}</small><span class="mu-gl-fold">${open ? '▾' : '▸'}</span></button>
            ${open ? `<div class="mu-gl-rows">${mine.map(x => rowHtml(g, w, x)).join('')}</div>` : ''}</div>`;
    }).join('')}</section>`;
}
/** "Your perks": what the goals you finished gave you (also on the profile). */
export function perksListHtml(g: Save, w: WorldDef): string {
    if (!systemOn(w, 'goals')) return '';
    const perks = perksOf(g, w);
    return perks.length ? `${perks.map(p => `<div class="mu-pf-row mu-gl-perkrow"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small><small class="mu-muted">From: ${esc(p.goalName)}</small></div>`).join('')}
        ${perks.length > 1 ? '<small class="mu-muted">Perks add up: percentages multiply, flat bonuses add.</small>' : ''}`
        : '<p class="mu-muted">None yet. Finish a life goal to earn its perk.</p>';
}
// What a step gives when it's done: its own reward, else the general mood; and its life points.
function rewardWords(w: WorldDef, st: GoalStep): string {
    const r = st.reward, out: string[] = [];
    if (r?.keepsake) out.push(keepsakeName(w, r.keepsake));
    if (r?.money) out.push(money(w, r.money));
    out.push(`+${(r?.points ?? GOAL_POINTS.step).toLocaleString('en-US')} life points`);
    if (r ? r.mood : true) out.push('a good mood');
    return out.join(' · ');
}
function detailHtml(g: Save, w: WorldDef, goal: GoalDef): string {
    const p = goalProgress(g, w, goal.id), cur = activeGoal(g, w);
    const cat = categoriesOf([goal])[0];
    const status = p.finished ? 'Finished' : p.active ? 'Your life goal now' : p.paused ? `Paused: ${p.done} of ${p.total} steps done, progress kept` : '';
    const steps = goal.steps.map((st, i) => {
        const state = i < p.done ? 'is-done' : i === p.done && !p.finished ? 'is-now' : '';
        return `<li class="mu-gl-stepi ${state}"><b><i>${i < p.done ? '✓' : n(i + 1)}</i>${esc(st.name)}</b>
            ${i < p.done ? '' : waysHtml(g, w, goal, i)}
            <small class="mu-gl-gives">${esc(rewardWords(w, st))}${st.hold ? ` · ${esc(st.hold === 'season' ? 'held a season' : `held ${st.hold} days`)}` : ''}</small></li>`;
    }).join('');
    const pick = canPick(g, w, goal.id)
        ? `<button class="mu-primary" data-act="gl-pick" data-id="${esc(goal.id)}">${cur ? 'Switch to this goal' : 'Pick this goal'}</button>${cur ? `<small class="mu-muted">${esc(cur.name)} is paused and keeps its progress.</small>` : ''}` : '';
    return `<div class="mu-gl-detail"><button class="mu-ghost mu-gl-back" data-act="gl-close">‹ All goals</button>
        <header><i>${esc(goal.icon ?? '⭐')}</i><span><b>${esc(goal.name)}${isOwnGoal(goal.id) ? ` <span class="mu-gl-own">✦ ${esc(`${w.name}'s own`)}</span>` : ''}</b><small>${esc(cat ? `${cat.icon} ${cat.name}` : '')}</small></span></header>
        ${goal.desc ? `<p>${esc(goal.desc)}</p>` : ''}
        ${goal.perk ? `<section class="mu-ph-card mu-gl-perkcard"><small>Perk for finishing it</small><b>${esc(goal.perk.name)}</b>${goal.perk.desc ? `<small>${esc(goal.perk.desc)}</small>` : ''}<small class="mu-muted">A perk is not a trait: it changes numbers in the game, for good.</small></section>` : ''}
        ${pipsHtml(p.done, p.total, p.finished)}${status ? `<small class="mu-gl-status">${esc(status)}</small>` : ''}
        <ol class="mu-gl-steps">${steps}</ol>
        <small class="mu-muted">Finishing it: +${n(GOAL_POINTS.goal)} life points${goal.perk ? ` and the perk ${esc(goal.perk.name)}` : ''}.</small>
        ${pick}</div>`;
}
function goalsTab(g: Save, w: WorldDef): string {
    const goal = GS.detail ? offeredGoals(g, w).find(x => x.id === GS.detail) : null;
    if (goal) return detailHtml(g, w, goal);
    return `${activeHtml(g, w)}${suggestedHtml(g, w)}${allGoalsHtml(g, w)}<section class="mu-gl-perks"><h4>Your perks</h4>${perksListHtml(g, w)}</section>`;
}

/* ---------- the Rewards tab ---------- */

const PER: Record<string, string> = { day: 'a day', week: 'a week', season: 'a season', year: 'a year', goal: 'per goal' };
function limitWords(it: ShopItem): string {
    const l = it.limit; if (!l) return '';
    const times = l.n === 1 ? 'Once' : `${l.n} times`;
    const per = l.per === 'ever' ? (l.person ? '' : ' only') : ` ${PER[l.per] ?? ''}`;
    return `${times}${l.person ? ' per person' : ''}${per}${l.used ? ` · used ${l.used} of ${l.n}` : ''}`;
}
// What a line of the points log was for.
function logWords(g: Save, w: WorldDef, why: string, items: ShopItem[]): string {
    const [k, a, b] = why.split(':');
    const goal = (id: string) => offeredGoals(g, w).find(x => x.id === id)?.name ?? humanize(id ?? '');
    switch (k) {
        case 'step': return `A step of ${goal(a)}${b !== undefined ? ` (step ${Number(b) + 1})` : ''}`;
        case 'goal': return `${goal(a)} finished`;
        case 'festival': case 'event': return a ? eventName(w, a) : 'A festival or city event';
        case 'story': return 'A street story';
        case 'secret': return 'A secret learned';
        case 'thread': return 'A story you followed came to its end';
        case 'keepsake': return a ? `A new keepsake: ${keepsakeName(w, a)}` : 'A new keepsake';
        case 'learned': return g.cast[a] ? `Something you learned about ${g.cast[a].name}` : 'Something you learned about someone';   // (adult) never the words
    }
    return items.find(x => x.id === why)?.name ?? humanize(why);
}
// (adult) A rumor about getting caught: quieting it also lifts that place's ban while it lasts (the place's name, or '').
const caughtAt = (g: Save, w: WorldDef, r: { caught?: string }) => (r.caught && bannedUntil(g, r.caught) !== null ? placeOf(g, w, r.caught)?.name ?? '' : '');
function pointsHtml(g: Save, w: WorldDef, items: ShopItem[]): string {
    const log = [...(((g as any).points?.log ?? []) as { day: number; n: number; why: string }[])].reverse().slice(0, 5);
    return `<section class="mu-ph-card mu-rw-points"><small>Life points</small><b>${n(pointsOf(g))}</b>
        <small class="mu-muted">Earned from your life goal's steps (+${n(GOAL_POINTS.step)}) and finishing it (+${n(GOAL_POINTS.goal)}), and a little from festivals, stories and secrets.</small>
        ${log.length ? `<ul class="mu-rw-log">${log.map(x => `<li><b class="${x.n < 0 ? 'is-spent' : ''}">${x.n > 0 ? '+' : ''}${n(x.n)}</b><span>${esc(logWords(g, w, x.why, items))}</span><small>Day ${n(x.day + 1)}</small></li>`).join('')}</ul>` : ''}</section>`;
}
// The choices an item needs before it's bought (a person, a meter, a question, a trait, a rumor), and the buy button.
function pickerHtml(g: Save, w: WorldDef, it: ShopItem): string {
    const buy = (ready: boolean) => `<button class="mu-primary" data-act="rw-buy" data-id="${esc(it.id)}" ${ready ? '' : 'aria-disabled="true"'}>Buy · ${n(it.price)} points</button>`;
    const chip = (act: string, v: string, label: string, on: boolean) => `<button class="mu-chip ${on ? 'is-on' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(label)}</button>`;
    if (it.pick === 'person') {
        const people = peopleFor(g, w, it.id), who = people.find(p => p.avatar === GS.person && p.ok);
        let more = '', ready = !!who;
        if (who && it.kind === 'nudge') {
            const meters = who.meters ?? [];
            more = `<small>What should grow?</small><div class="mu-chips">${meters.map(m => chip('rw-meter', m, m === 'r' ? 'Romance' : 'Friendship', GS.meter === m)).join('')}</div>`;
            ready = meters.includes(GS.meter as Meter);
        }
        if (who && it.kind === 'insight') {
            const qs = who.questions ?? [];
            more = `<small>What do you want to know?</small><div class="mu-chips">${qs.map(q => chip('rw-question', q.id, q.name, GS.question === q.id)).join('')}</div>`;
            ready = qs.some(q => q.id === GS.question);
        }
        return `<div class="mu-rw-pick"><small>Who?</small>${people.length ? `<div class="mu-rw-people">${people.map(p => p.ok
            ? `<button class="mu-chip ${GS.person === p.avatar ? 'is-on' : ''}" data-act="rw-person" data-v="${esc(p.avatar)}"><span data-notr>${esc(p.name)}</span></button>`
            : `<span class="mu-chip mu-rw-no" aria-disabled="true"><span data-notr>${esc(p.name)}</span> <small>${esc(p.why ?? '')}</small></span>`).join('')}</div>` : '<p class="mu-muted">You don\'t know anyone yet.</p>'}
            ${more}${buy(ready)}</div>`;
    }
    if (it.pick === 'trait') {
        const c = traitChoices(g, w), grp = c.groups.find(x => x.id === GS.group);
        const kinds = `<div class="mu-chips">${c.groups.map(x => chip('rw-group', x.id, `Swap: ${x.name}`, GS.group === x.id)).join('')}${c.habits.length ? chip('rw-group', 'habit', 'Drop a habit', GS.group === 'habit') : ''}</div>`;
        let more = '', ready = false;
        if (grp) {
            more = `<small>Swap…</small><div class="mu-chips">${grp.have.map(t => chip('rw-from', t, t, GS.from === t)).join('')}</div>
                <small>…for</small><div class="mu-chips">${grp.can.map(t => chip('rw-to', t, t, GS.to === t)).join('')}</div>`;
            ready = grp.have.includes(GS.from) && grp.can.includes(GS.to);
        } else if (GS.group === 'habit') {
            more = `<div class="mu-chips">${c.habits.map(h => chip('rw-habit', h.id, h.name, GS.habit === h.id)).join('')}</div>`;
            ready = c.habits.some(h => h.id === GS.habit);
        }
        return `<div class="mu-rw-pick"><small>What changes?</small>${kinds}${more}<small class="mu-muted">Strengths are skill levels: they can't be swapped.</small>${buy(ready)}</div>`;
    }
    if (it.pick === 'rumor') {
        const rumors = rumorsToQuiet(g, w);
        return `<div class="mu-rw-pick"><small>Which rumor?</small><div class="mu-rw-rumors">${rumors.map(r => `<button class="mu-chip ${GS.rumor === r.id ? 'is-on' : ''}" data-act="rw-rumor" data-v="${esc(r.id)}"><span data-notr>${esc(r.text)}</span>${caughtAt(g, w, r) ? ` <small class="mu-rw-ban">Also lifts the ban at <span data-notr>${esc(caughtAt(g, w, r))}</span></small>` : ''}</button>`).join('')}</div>
            ${buy(rumors.some(r => r.id === GS.rumor))}</div>`;
    }
    return '';
}
function itemHtml(g: Save, w: WorldDef, it: ShopItem): string {
    const open = GS.buy === it.id && it.ok;
    const btn = !it.ok ? `<button aria-disabled="true" disabled>${it.pick ? 'Choose' : 'Buy'}</button>`
        : it.pick ? `<button class="${open ? 'is-on' : ''}" data-act="rw-choose" data-id="${esc(it.id)}">${open ? 'Close' : 'Choose'}</button>`
        : `<button class="mu-primary" data-act="rw-buy" data-id="${esc(it.id)}">Buy</button>`;
    const lim = limitWords(it);
    return `<article class="mu-rw-item ${it.ok ? '' : 'is-not'} ${open ? 'is-open' : ''}"><i>${esc(it.icon)}</i>
        <span><b>${esc(it.name)}</b><small>${esc(it.desc)}</small>
            <small class="mu-rw-price">${n(it.price)} points${lim ? ` · ${esc(lim)}` : ''}</small>${it.ok ? '' : `<small class="mu-rw-why">${esc(it.why ?? '')}</small>`}</span>
        ${btn}${open ? pickerHtml(g, w, it) : ''}</article>`;
}
function rewardsTab(g: Save, w: WorldDef): string {
    const items = shopItems(g, w);
    const list = (xs: ShopItem[]) => [...xs.filter(x => x.ok), ...xs.filter(x => !x.ok)].map(x => itemHtml(g, w, x)).join('');
    const general = items.filter(x => !x.own), own = items.filter(x => x.own);
    return `${pointsHtml(g, w, items)}
        ${general.length ? `<section class="mu-rw-list"><h4>Rewards</h4>${list(general)}</section>` : ''}
        ${own.length ? `<section class="mu-rw-list"><h4>${esc(`${w.name}'s own`)}</h4>${list(own)}</section>` : ''}
        ${items.length ? '' : '<p class="mu-muted">Nothing in the shop in this world.</p>'}`;
}

/* ---------- the app ---------- */

/** The Goals app: the Goals tab or the Rewards tab, under the section's header. */
export function goalsApp(g: Save, w: WorldDef, head: string): string {
    if (!systemOn(w, 'goals')) return `${head}<div class="mu-ph-body"><p class="mu-muted">No life goals in this world.</p></div>`;
    const tab = GS.tab === 'rewards' ? 'rewards' : 'goals';
    return `${head}<div class="mu-ph-body mu-gl">
        <nav class="mu-gl-tabs"><button class="${tab === 'goals' ? 'is-on' : ''}" data-act="gl-tab" data-v="goals">Goals${goalsBadge(g, w) ? ' <em class="mu-gl-badge">!</em>' : ''}</button>
            <button class="${tab === 'rewards' ? 'is-on' : ''}" data-act="gl-tab" data-v="rewards">Rewards <small>${n(pointsOf(g))}</small></button></nav>
        ${tab === 'rewards' ? rewardsTab(g, w) : goalsTab(g, w)}</div>`;
}

// Shows what the engine said (toasts), and remembers it for the checks.
function say(lines: string[], kind: 'success' | 'info' = 'success') {
    GS.said = lines;
    for (const l of lines) toast(l, kind);
}
const here = () => { const g = game(); const w = g && getWorld(g.world); return g && w && systemOn(w, 'goals') ? { g, w } : null; };
const toggle = (list: string[], v: string) => { const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); };

Object.assign(ACT, {
    'gl-tab': (el) => { GS.tab = el.dataset.v === 'rewards' ? 'rewards' : 'goals'; GS.detail = ''; clearPick(); notify(); },
    'gl-cat': (el) => { toggle(GS.open, el.dataset.id ?? ''); notify(); },
    'gl-open': (el) => { GS.detail = el.dataset.id ?? ''; notify(); },
    'gl-close': () => { GS.detail = ''; notify(); },
    // one tap picks (switching needs no warning: the goal you followed is paused and keeps its progress)
    'gl-pick': (el) => {
        const x = here(); if (!x) return;
        const id = el.dataset.id ?? '';
        if (!canPick(x.g, x.w, id)) return;
        const goal = offeredGoals(x.g, x.w).find(y => y.id === id);
        const lines = pickGoal(x.g, x.w, id);
        say([...(goal ? [`New life goal: ${goal.name}.`] : []), ...lines]);
        GS.detail = '';
        saveGame(); refreshPrompt(); notify();
    },
    'rw-choose': (el) => { const id = el.dataset.id ?? ''; const again = GS.buy === id; clearPick(); if (!again) GS.buy = id; notify(); },
    'rw-person': (el) => {
        const x = here(); if (!x) return;
        GS.person = el.dataset.v ?? ''; GS.meter = ''; GS.question = '';
        // a single choice is made for you
        const p = peopleFor(x.g, x.w, GS.buy).find(y => y.avatar === GS.person);
        if (p?.meters?.length === 1) GS.meter = p.meters[0];
        if (p?.questions?.length === 1) GS.question = p.questions[0].id;
        notify();
    },
    'rw-meter': (el) => { GS.meter = el.dataset.v === 'r' ? 'r' : 'f'; notify(); },
    'rw-question': (el) => { GS.question = (el.dataset.v ?? '') as InsightId; notify(); },
    'rw-group': (el) => { GS.group = el.dataset.v ?? ''; GS.from = ''; GS.to = ''; GS.habit = ''; notify(); },
    'rw-from': (el) => { GS.from = el.dataset.v ?? ''; notify(); },
    'rw-to': (el) => { GS.to = el.dataset.v ?? ''; notify(); },
    'rw-habit': (el) => { GS.habit = el.dataset.v ?? ''; notify(); },
    'rw-rumor': (el) => { GS.rumor = el.dataset.v ?? ''; notify(); },
    'rw-buy': (el) => {
        const x = here(); if (!x || el.getAttribute('aria-disabled')) return;
        const id = el.dataset.id ?? '';
        const it = shopItems(x.g, x.w).find(y => y.id === id); if (!it) return;
        const c: RewardChoice = {};
        if (it.pick && GS.buy === id) {
            if (it.pick === 'person') { c.person = GS.person; if (GS.meter) c.meter = GS.meter; if (GS.question) c.question = GS.question; }
            if (it.pick === 'trait') { if (GS.group === 'habit') c.habit = GS.habit; else { c.group = GS.group; c.from = GS.from; c.to = GS.to; } }
            if (it.pick === 'rumor') c.rumor = GS.rumor;
        }
        const res = buyReward(x.g, x.w, id, c);
        say(res.lines, res.ok ? 'success' : 'info');
        if (!res.ok) { notify(); return; }
        clearPick();
        res.persona?.then(ok => { if (ok) toast('Your persona card says who you are now.', 'info'); }).catch(() => undefined);
        saveGame(); refreshPrompt(); notify();
    },
});
