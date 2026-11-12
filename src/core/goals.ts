// Life goals and the rewards shop as data: the general goals every world offers where they fit (with today's twelve
// aspirations' ids, so old saves keep what they had), the general items life points buy, the categories, the limits a
// perk or a boost stays inside, and how a world's own `goals` and `rewards` (core/world.ts) turn some off, rename them
// and add their own. The engine side is elsewhere: conditions in sim/when.ts (steps are conditions), counters in
// sim/tally.ts, perks and boosts as sources of effects in sim/perks.ts.
import { systemOn, SYSTEMS, type WorldDef, type GoalDef, type GoalStep, type PerkDef, type RewardDef, type WorldGoals, type WorldRewards } from './world.js';
import { cleanEffects, type EffectDef, type EffectLimits } from './traits.js';

/** The nine categories the Goals app groups goals in. A world's own goals use them too (a new id is its own group). */
export const GOAL_CATEGORIES: { id: string; name: string; icon: string }[] = [
    { id: 'fortune', name: 'Fortune', icon: '💰' }, { id: 'career', name: 'Career', icon: '💼' }, { id: 'love', name: 'Love', icon: '💞' },
    { id: 'social', name: 'Social', icon: '🦋' }, { id: 'knowledge', name: 'Knowledge', icon: '🎓' }, { id: 'creativity', name: 'Creativity', icon: '🎨' },
    { id: 'food', name: 'Food', icon: '🍳' }, { id: 'health', name: 'Health', icon: '🏃' }, { id: 'explorer', name: 'Explorer', icon: '🧭' },
];

/** What one perk's effect may give: ±50% (Devoted halves romance fading), flat ±3 (a warmer first meeting, +3 at
 *  interviews). The kinds' own bounds (`EFFECT_KINDS`) still hold the pile of every source together. */
export const PERK_LIMITS: EffectLimits = { pct: 0.5, flat: 3 };
/** What one effect of a timed boost from the shop may give: up to double (a work boost doubles performance gains). */
export const BOOST_LIMITS: EffectLimits = { pct: 1, flat: 3 };
/** How long a boost may last, in days. */
export const BOOST_DAYS = { min: 1, max: 7 };
/** Life points a step and a finished goal give when the world says nothing else (sim/points.ts adds them up). */
export const GOAL_POINTS = { step: 100, goal: 200 };

/** Groups of skills a condition (`skill: creative 3`) or an effect's target (`learn creative`) can name at once. */
export const SKILL_GROUPS: Record<string, string[]> = {
    creative: ['music', 'singing', 'drawing', 'painting', 'writing', 'dance', 'fashion'],
};
/** The groups a skill belongs to (what a roll or training of it also counts as). */
export const groupsOf = (skill: string | undefined): string[] => (skill ? Object.keys(SKILL_GROUPS).filter(k => SKILL_GROUPS[k].includes(skill)) : []);

/** Old aspirations folded into another goal: a save that finished "In top shape" counts Athlete as finished. */
export const FOLDED_GOALS: Record<string, string> = { fit: 'athlete' };

/** What a reward can do (`RewardDef.kind`). `boost`: its effects for its days (sim/perks.ts keeps it); `refill`: a need
 *  full now; the rest act once, through the systems they touch (sim/rewards.ts): `nudge` (one person's friendship or
 *  romance for you +15, within the rules), `clear` (their feelings for you back to zero), `fresh` (that, and they
 *  forget you), `forgive` (a grudge ends), `invite` (they ask you out soon), `quiet` (a rumor stops spreading),
 *  `insight` (one true thing about them), `retrait` (swap a personality or interest trait, or drop a habit), `skip`
 *  (the active goal's step counts as done), `rentfree` (the next rent or bills), `cleanslate` (a warning and the last
 *  missed shift forgotten), `double` (the active goal's finishing points doubled: Tokyo's daruma). */
export const REWARD_KINDS = ['boost', 'refill', 'nudge', 'clear', 'fresh', 'forgive', 'invite', 'quiet', 'insight', 'retrait', 'skip', 'rentfree', 'cleanslate', 'double'] as const;
export type RewardKind = typeof REWARD_KINDS[number];
/** One-off kinds that act on a person you pick. */
export const PERSON_KINDS: RewardKind[] = ['nudge', 'clear', 'fresh', 'forgive', 'invite', 'insight'];

/* ---------- the general goals ---------- */

const s = (name: string, when: string, hold?: number | 'season'): GoalStep => (hold ? { name, when, hold } : { name, when });
const perk = (name: string, desc: string, ...effects: EffectDef[]): PerkDef => ({ name, desc, effects });

/** The general goals, in every world whose systems they need. Steps are conditions (the grammar in sim/when.ts); amounts
 *  of money are in the world's usual pay (`money: 2 weeks`), so they scale. `fit` isn't here: it's folded into
 *  `athlete`. Ids are permanent (saves keep them). */
export const GENERAL_GOALS: GoalDef[] = [
    { id: 'rich', name: 'Get rich', icon: '💰', category: 'fortune', desc: 'Save up a fortune.', steps: [
        s('Two weeks\' pay saved', 'money: 2 weeks'), s('Two months\' pay saved', 'money: 2 months'), s('Half a year\'s pay saved', 'money: 6 months'), s('A fortune', 'money: fortune')],
        perk: perk('Shrewd', 'Prices 5% lower everywhere.', { kind: 'price', target: 'prices', value: -0.05 }) },
    { id: 'home', name: 'A place of your own', icon: '🏡', category: 'fortune', desc: 'A home that is yours, and better than where you started.', steps: [
        s('Live on your own', 'home: alone'), s('A better home than your first', 'home: better'), s('A home among the best', 'home: top'), s('A season there', 'home: top; home: season')],
        perk: perk('Homebody', 'A better mood each morning at home, and sleep at home restores more.', { kind: 'morning', target: 'mood', value: 3, when: 'place: home:player' }, { kind: 'rest', target: 'sleep home', value: 0.2 }) },
    { id: 'career', name: 'Top of the career', icon: '🏆', category: 'career', desc: 'Reach the highest rank of a job.', needs: ['jobs'], steps: [
        s('Rank 2', 'rank: 2'), s('The middle rank', 'rank: middle'), s('One below the top', 'rank: top-1'), s('The top', 'rank: top')],
        perk: perk('Go-getter', 'Ranks take 10% less time.', { kind: 'career', target: 'rank', value: -0.1 }) },
    { id: 'worker', name: 'Hard worker', icon: '💼', category: 'career', desc: 'Show up, shift after shift.', needs: ['jobs'], steps: [
        s('10 shifts', 'did: shift 10'), s('30 shifts', 'did: shift 30'), s('60 shifts', 'did: shift 60'), s('A season without a missed shift', 'rank: 1; did: not missed_shift', 'season')],
        perk: perk('Reliable', 'Performance grows 25% faster, and steps give 25% more life points.', { kind: 'perf', target: 'gain', value: 0.25 }, { kind: 'points', target: 'step', value: 0.25 }) },
    { id: 'jack', name: 'Jack of all trades', icon: '🧰', category: 'career', desc: 'Try your hand at many jobs.', needs: ['jobs'], steps: [
        s('Two different jobs', 'rank: 1 in 2 jobs'), s('Three different jobs', 'rank: 1 in 3 jobs'), s('Rank 2 in three jobs', 'rank: 2 in 3 jobs'), s('Three skills at 5', 'skill: any 5 x3')],
        perk: perk('Adaptable', '+3 at job interviews, and a new job starts halfway to the next rank.', { kind: 'interview', value: 3 }, { kind: 'career', target: 'hire', value: -0.5 }) },
    { id: 'romance', name: 'Find love', icon: '💞', category: 'love', desc: 'Fall in love and build a life together.', needs: ['romance'], steps: [
        s('A date', 'did: date'), s('Someone in love with you', 'friends: 1 crush'), s('Together a season', 'partner: dating or engaged or married', 'season'), s('Living together', 'partner: home')],
        perk: perk('Devoted', 'Your partner\'s romance fades half as fast.', { kind: 'fade', target: 'partner', value: -0.5 }) },
    { id: 'freespirit', name: 'Free spirit', icon: '🕊️', category: 'love', desc: 'Love freely, with no strings.', needs: ['romance'], steps: [
        s('Dates with three people', 'did: people:date 3'), s('A casual relationship', 'partner: casual'), s('A night together', 'did: night_together'), s('Single and happy for a season', 'partner: none; need: mood 60', 'season')],
        perk: perk('Easy charm', '+3 friendship when you first meet someone.', { kind: 'warm', target: 'new', value: 3 }) },
    { id: 'social', name: 'Social butterfly', icon: '🦋', category: 'social', desc: 'Have many good friends.', steps: [
        s('A good friend', 'friends: 1 good'), s('Three good friends', 'friends: 3 good'), s('Five good friends', 'friends: 5 good'), s('Ten good friends', 'friends: 10 good')],
        perk: perk('Magnetic', 'Friendship toward you grows 10% faster.', { kind: 'gain', target: 'friend', value: 0.1 }) },
    { id: 'bff', name: 'Best friends', icon: '🤝', category: 'social', desc: 'One friend for life.', steps: [
        s('A best friend', 'friends: 1 best'), s('A day trip together', 'friends: 1 best; did: trip with best'), s('A night at each other\'s place', 'friends: 1 best; did: overnight with best'), s('A season as best friends', 'friends: 1 best', 'season')],
        perk: perk('Loyal', 'Friendship with good friends grows 15% faster.', { kind: 'gain', target: 'good friends', value: 0.15 }) },
    { id: 'host', name: 'Party host', icon: '🎉', category: 'social', desc: 'Throw the parties people talk about.', steps: [
        s('Throw a party', 'did: party'), s('Three parties', 'did: party 3'), s('A party with five guests', 'did: big_party'), s('A party everyone loved', 'did: loved_party')],
        perk: perk('Life of the party', 'Parties give 25% more mood.', { kind: 'party', target: 'mood', value: 0.25 }) },
    { id: 'scholar', name: 'Lifelong learner', icon: '🎓', category: 'knowledge', desc: 'Never stop learning.', needs: ['courses'], steps: [
        s('A course', 'course: 1'), s('Three courses', 'course: 3'), s('Three skills at 5', 'skill: any 5 x3'), s('A skill at 10', 'skill: any 10')],
        perk: perk('Quick study', 'Every skill trains 15% faster.', { kind: 'learn', value: 0.15 }) },
    { id: 'chef', name: 'Home chef', icon: '🍳', category: 'food', desc: 'Cook well, and for others.', steps: [
        s('Cook 15 meals', 'did: meal 15'), s('Cooking 4', 'skill: cooking 4'), s('Cook for a friend 5 times', 'did: with:cook 5'), s('Cooking 8', 'skill: cooking 8')],
        perk: perk('Gourmet', 'Meals you cook restore 20% more.', { kind: 'rest', target: 'cook', value: 0.2 }) },
    { id: 'athlete', name: 'Athlete', icon: '🏃', category: 'health', desc: 'Train hard and get fit.', steps: [
        s('15 workouts', 'did: workout 15'), s('Fitness 4', 'skill: fitness 4'), s('50 workouts', 'did: workout 50'), s('Fitness 8', 'skill: fitness 8')],
        perk: perk('Fit', 'Energy drains 20% slower.', { kind: 'drain', target: 'energy', value: -0.2 }) },
    { id: 'artist', name: 'Artist', icon: '🎨', category: 'creativity', desc: 'Make things, and let people see them.', steps: [
        s('A creative skill at 3', 'skill: creative 3'), s('Sell or show five works', 'did: painting 5 or tag:art 5'), s('Two creative skills at 5', 'skill: creative 5 x2'), s('A creative skill at 10', 'skill: creative 10')],
        perk: perk('Inspired', 'Creative skills +2 on rolls and train 20% faster.', { kind: 'roll', target: 'creative', value: 2 }, { kind: 'learn', target: 'creative', value: 0.2 }) },
    { id: 'regular', name: 'Regular', icon: '☕', category: 'explorer', desc: 'Places where everyone knows your face.', needs: ['living'], steps: [
        s('A regular at one place', 'visited: 1 regular'), s('A regular at three places', 'visited: 3 regular'), s('A regular at five places', 'visited: 5 regular'), s('A good friend who works at one of them', 'friends: 1 good at regular')],
        perk: perk('Familiar face', '10% lower prices where you\'re a regular.', { kind: 'price', target: 'regular', value: -0.1 }) },
    { id: 'explorer', name: 'Explorer', icon: '🧭', category: 'explorer', desc: 'See every corner of the world.', steps: [
        s('Visit 10 places', 'visited: 10'), s('Every place on one map', 'visited: map'), s('A place on every map', 'visited: maps'), s('Every place', 'visited: all')],
        perk: perk('Local', 'Trips take 10% less time.', { kind: 'travel', value: -0.1 }) },
    { id: 'collector', name: 'Collector', icon: '🧸', category: 'explorer', desc: 'Keep a little of everything.', steps: [
        s('Five different keepsakes', 'holds: 5'), s('Ten keepsakes', 'holds: 10'), s('Twenty keepsakes', 'holds: 20'), s('Every keepsake of one kind', 'holds: kind:any')],
        perk: perk('Lucky', '+1 on every roll.', { kind: 'roll', value: 1 }) },
    { id: 'balance', name: 'Balanced life', icon: '☯️', category: 'health', desc: 'Look after yourself.', needs: ['needs'], steps: [
        s('A week with every need above 30', 'need: all 30', 7), s('A season without collapsing', 'did: not collapse', 'season'), s('Asleep before 1:00 for two weeks', 'did: not late_night', 14), s('Every need high on a festival day', 'need: all 70; festival: any')],
        perk: perk('Steady', 'Mood drains 20% slower.', { kind: 'drain', target: 'mood', value: -0.2 }) },
    { id: 'mentor', name: 'Mentor', icon: '🧑‍🏫', category: 'social', desc: 'Pass on what you know.', needs: ['mentors'], steps: [
        s('Start teaching someone', 'did: apprentice'), s('Teach 10 sessions', 'did: lesson 10'), s('Someone you teach learns all you can teach', 'did: taught'), s('Two who learn all you can teach', 'did: taught 2')],
        perk: perk('Teacher', 'Those you teach learn 50% more each session.', { kind: 'study', target: 'teach', value: 0.5 }) },
    // only with the systems they're about
    { id: 'family', name: 'A family of your own', icon: '👶', category: 'love', desc: 'A partner, a home together, children.', needs: ['romance', 'family'], steps: [
        s('A partner', 'partner: dating or engaged or married'), s('Living together', 'partner: home'), s('A child', 'did: baby'), s('Two children', 'did: baby 2')],
        perk: perk('Warm home', '+2 mood each morning while you live with your partner.', { kind: 'morning', target: 'mood', value: 2, when: 'partner: home' }) },
    { id: 'renown', name: 'A good name', icon: '⭐', category: 'social', desc: 'Be known, then respected, then renowned.', needs: ['reputation'], steps: [
        s('Known in town', 'rep: known'), s('Respected', 'rep: respected'), s('Respected for a season', 'rep: respected', 'season'), s('Renowned', 'rep: renowned')],
        perk: perk('Good name', '+2 friendship when you first meet someone.', { kind: 'warm', target: 'new', value: 2 }) },
    { id: 'business', name: 'Your own business', icon: '🏪', category: 'fortune', desc: 'Open a business and keep it going.', needs: ['property'], steps: [
        s('Open a business', 'did: business'), s('Run it a season', 'did: business', 'season'), s('A second business', 'did: business 2'), s('Two for a season', 'did: business 2', 'season')],
        perk: perk('Head for business', 'Work pays 5% more.', { kind: 'pay', value: 0.05 }) },
];

/* ---------- the general rewards ---------- */

/** What life points buy in every world (a world turns items off, re-prices and adds its own). Prices are first guesses. */
export const GENERAL_REWARDS: RewardDef[] = [
    { id: 'focused', name: 'Focused', icon: '🎯', desc: 'Skills train 50% faster for a day.', price: 250, kind: 'boost', effects: [{ kind: 'learn', value: 0.5 }], days: 1, limit: { per: 'day' } },
    { id: 'luckyday', name: 'Lucky day', icon: '🍀', desc: '+2 on every roll for a day.', price: 200, kind: 'boost', effects: [{ kind: 'roll', value: 2 }], days: 1, limit: { per: 'day' } },
    { id: 'secondwind', name: 'Second wind', icon: '⚡', desc: 'Energy full now.', price: 150, kind: 'refill', need: 'energy', limit: { per: 'day' } },
    { id: 'clearhead', name: 'Clear head', icon: '🌤️', desc: 'Mood full now.', price: 150, kind: 'refill', need: 'mood', limit: { per: 'day' } },
    { id: 'workboost', name: 'Work boost', icon: '🚀', desc: 'Performance gains doubled for three days.', price: 250, kind: 'boost', effects: [{ kind: 'perf', target: 'gain', value: 1 }], days: 3, limit: { per: 'week' }, needs: ['jobs'], when: 'job: any' },
    { id: 'cleanslate', name: 'Clean slate at work', icon: '🧽', desc: 'A warning and the last missed shift are forgotten.', price: 300, kind: 'cleanslate', limit: { per: 'season' }, needs: ['jobs'], when: 'job: any' },
    { id: 'rentholiday', name: 'Rent holiday', icon: '🗝️', desc: 'Skip the next rent or bills payment.', price: 300, kind: 'rentfree', limit: { per: 'season' }, needs: ['bills'] },
    { id: 'nudge', name: 'Nudge', icon: '💝', desc: 'One person\'s friendship or romance for you grows (never past what the rules allow).', price: 400, kind: 'nudge', limit: { per: 'season', person: true } },
    { id: 'cleartheair', name: 'Clear the air', icon: '🌬️', desc: 'One person\'s feelings for you start over from nothing; they still remember what happened.', price: 400, kind: 'clear' },
    { id: 'freshstart', name: 'A fresh start', icon: '🌱', desc: 'One person forgets you, as if you never met (your journal keeps it).', price: 900, kind: 'fresh' },
    { id: 'forgive', name: 'Forgive and forget', icon: '🕊️', desc: 'One person\'s grudge against you ends.', price: 200, kind: 'forgive', limit: { per: 'season', person: true } },
    { id: 'invitation', name: 'An invitation', icon: '✉️', desc: 'Someone you know asks you out in the next days.', price: 150, kind: 'invite', needs: ['plans'] },
    { id: 'quietrumor', name: 'Quiet a rumor', icon: '🤫', desc: 'One rumor about you stops spreading.', price: 200, kind: 'quiet', needs: ['rumors'] },
    { id: 'insight', name: 'Insight', icon: '🔮', desc: 'Learn one true thing about someone.', price: 250, kind: 'insight', limit: { per: 'season', person: true } },
    { id: 'changetrait', name: 'Change a trait', icon: '🎭', desc: 'Swap a personality or interest trait, or drop a habit.', price: 500, kind: 'retrait' },
    { id: 'skipstep', name: 'Skip a step', icon: '⏭️', desc: 'The current step of your goal counts as done (never the last).', price: 400, kind: 'skip', limit: { per: 'goal' } },
];

/* ---------- a world's goals and rewards ---------- */

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
// A system off in the world: goals and items that need it are left out (needs that can be off in one game are the
// game's business: sim/goals.ts).
/** Is this one of a goal's or a reward's `needs` a system (else it's a need)? */
export const isSystemNeed = (id: string) => SYSTEMS.some(x => x.id === id);
const systemsOk = (w: WorldDef, needs: string[] | undefined) => (needs ?? []).every(id => !isSystemNeed(id) || systemOn(w, id as any));

/** The world's goals: the general ones it keeps (renamed where it says so), then its own (one with a general goal's id
 *  takes that goal's place), without those whose systems the world has off. Nothing with the `goals` system off. */
export function goalsOf(w: WorldDef | null | undefined): GoalDef[] {
    if (!w || !systemOn(w, 'goals')) return [];
    const own = w.goals ?? {}, off = new Set(own.off ?? []), add = own.add ?? [];
    const general = GENERAL_GOALS.filter(x => !off.has(x.id) && !add.some(a => a.id === x.id)).map(x => (own.names?.[x.id] ? { ...x, name: own.names[x.id] } : x));
    return [...general, ...add].filter(x => systemsOk(w, x.needs));
}
/** One goal by id (an old folded id finds the goal it went into), whether or not this world offers it now. */
export function goalOf(w: WorldDef | null | undefined, id: string): GoalDef | null {
    const key = FOLDED_GOALS[id] ?? id;
    return w?.goals?.add?.find(x => x.id === key) ?? GENERAL_GOALS.find(x => x.id === key) ?? null;
}
/** Is this the world's own goal (not one of the general ones)? */
export const isOwnGoal = (id: string) => !GENERAL_GOALS.some(x => x.id === id) && !(id in FOLDED_GOALS);

/** The world's rewards: the general items it keeps (renamed and re-priced where it says so), then its own, without
 *  those whose systems are off. Nothing with the `goals` system off. */
export function rewardsOf(w: WorldDef | null | undefined): RewardDef[] {
    if (!w || !systemOn(w, 'goals')) return [];
    const own = w.rewards ?? {}, off = new Set(own.off ?? []), add = own.add ?? [];
    const general = GENERAL_REWARDS.filter(x => !off.has(x.id) && !add.some(a => a.id === x.id))
        .map(x => (own.names?.[x.id] || own.prices?.[x.id] !== undefined ? { ...x, ...(own.names?.[x.id] ? { name: own.names[x.id] } : {}), ...(typeof own.prices?.[x.id] === 'number' ? { price: own.prices[x.id] } : {}) } : x));
    return [...general, ...add].filter(x => systemsOk(w, x.needs));
}
export const rewardOf = (w: WorldDef | null | undefined, id: string): RewardDef | null => rewardsOf(w).find(x => x.id === id) ?? null;
export const isOwnReward = (id: string) => !GENERAL_REWARDS.some(x => x.id === id);

/* ---------- made safe as a world loads (upgradeWorld) ---------- */

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : undefined);
const nums = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
function cleanStep(x: any): GoalStep | null {
    if (!isObj(x) || typeof x.when !== 'string') return null;
    const r = isObj(x.reward) ? clean({ keepsake: str(x.reward.keepsake), mood: nums(x.reward.mood), money: nums(x.reward.money), points: nums(x.reward.points) }) : undefined;
    const hold = x.hold === 'season' ? 'season' : nums(x.hold) !== undefined && x.hold > 0 ? x.hold : undefined;
    const or = strs(x.or);
    return clean({ name: str(x.name) ?? x.when, when: x.when, or: or?.length ? or : undefined, hold, reward: r && Object.keys(r).length ? r : undefined }) as GoalStep;
}
function cleanGoal(x: any): GoalDef | null {
    if (!isObj(x) || !str(x.id) || !str(x.name)) return null;
    const steps = (Array.isArray(x.steps) ? x.steps : []).map(cleanStep).filter((y: GoalStep | null): y is GoalStep => !!y);
    if (!steps.length) return null;
    const p = isObj(x.perk) && str(x.perk.name) ? clean({ name: x.perk.name, desc: str(x.perk.desc), effects: cleanEffects(x.perk.effects, PERK_LIMITS) }) as PerkDef : undefined;
    return clean({ ...x, category: str(x.category) ?? 'social', starts: strs(x.starts), needs: strs(x.needs), steps, perk: p, adult: x.adult === true ? true : undefined, offer: str(x.offer) }) as GoalDef;
}
function cleanReward(x: any): RewardDef | null {
    if (!isObj(x) || !str(x.id) || !str(x.name) || !(REWARD_KINDS as readonly string[]).includes(x.kind)) return null;
    const lim = isObj(x.limit) ? clean({ per: ['day', 'week', 'season', 'year', 'goal', 'ever'].includes(x.limit.per) ? x.limit.per : undefined, n: nums(x.limit.n), person: x.limit.person === true ? true : undefined }) : undefined;
    const days = nums(x.days) !== undefined ? Math.max(BOOST_DAYS.min, Math.min(BOOST_DAYS.max, Math.round(x.days))) : undefined;
    return clean({ ...x, price: Math.max(0, Math.round(nums(x.price) ?? 0)), effects: x.effects !== undefined ? cleanEffects(x.effects, BOOST_LIMITS) : undefined, days, limit: lim && Object.keys(lim).length ? lim : undefined,
        roles: strs(x.roles), needs: strs(x.needs), adult: x.adult === true ? true : undefined }) as RewardDef;
}
const cleanNames = (v: unknown) => (isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'string' && n)) as Record<string, string> : undefined);
/** A world's `goals` made safe: bad entries dropped, perks inside the perk limits. Nothing there: undefined. */
export function upgradeGoals(v: unknown): WorldGoals | undefined {
    if (!isObj(v)) return undefined;
    return clean({ off: strs(v.off), names: cleanNames(v.names), add: Array.isArray(v.add) ? v.add.map(cleanGoal).filter((x): x is GoalDef => !!x) : undefined });
}
/** A world's `rewards` made safe: bad entries dropped, boosts inside the boost limits. Nothing there: undefined. */
export function upgradeRewards(v: unknown): WorldRewards | undefined {
    if (!isObj(v)) return undefined;
    const prices = isObj(v.prices) ? Object.fromEntries(Object.entries(v.prices).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n >= 0).map(([k, n]) => [k, Math.round(n as number)])) : undefined;
    return clean({ off: strs(v.off), names: cleanNames(v.names), prices, add: Array.isArray(v.add) ? v.add.map(cleanReward).filter((x): x is RewardDef => !!x) : undefined });
}
