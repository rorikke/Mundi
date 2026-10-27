export const FRIEND_LEVELS = ['hates', 'dislikes', 'wary', 'stranger', 'acquaintance', 'friend', 'good', 'best'];
export const ROM_LEVELS = ['none', 'interest', 'crush', 'infatuated'];
export const FRIEND_START = { hates: -75, dislikes: -45, wary: -15, stranger: 0, acquaintance: 15, friend: 40, good: 65, best: 85 };
export const ROM_START = { none: 0, interest: 25, crush: 50, infatuated: 75 };
// Where someone stands with you at the start (approval) follows how they feel about you; a couple adds a little.
export const APPROVAL_START = { hates: -50, dislikes: -25, wary: -10, stranger: 0, acquaintance: 5, friend: 15, good: 20, best: 30 };
export const COUPLE_APPROVAL = 10;
// A couple starts as good friends and in love unless told otherwise.
export const COUPLE_FRIEND = 'good';
export const FAMILY_TYPES = ['parent', 'child', 'sibling', 'cousin'];
export const FAMILY_START = { parent: 75, child: 75, sibling: 55, cousin: 30 };
export const FAMILY_APPROVAL = { parent: 20, child: 20, sibling: 15, cousin: 10 };
export const isFamily = (type) => FAMILY_TYPES.includes(type);
/* ---------- the old relation types ---------- */
// Each old type's usual tone (as sim/rel.ts TYPE_START had it): a tone that differs says something of its own.
const USUAL = {
    parent: 'close', child: 'close', sibling: 'good', cousin: 'neutral', spouse: 'close', partner: 'close', dating: 'good',
    bestfriend: 'close', friend: 'good', ally: 'good', colleague: 'neutral', roommate: 'neutral', rival: 'tense',
    enemy: 'hostile', ex: 'tense', mentor: 'good', apprentice: 'good',
};
const BY_TYPE = {
    bestfriend: 'best', friend: 'friend', ally: 'friend', mentor: 'friend', apprentice: 'friend',
    colleague: 'acquaintance', roommate: 'acquaintance', rival: 'wary', enemy: 'dislikes',
};
const BY_TONE = { close: 'good', good: 'friend', neutral: 'acquaintance', tense: 'wary', hostile: 'dislikes' };
const COUPLE = { spouse: 'married', partner: 'dating', dating: 'dating' };
// One old tie ({ type, tone, back? }, as world files, cast presets and new games wrote them): family stays a tie, with a
// feeling only when its tone isn't the usual one (the manor's tense cousins stay tense); anything else becomes a
// starting feeling. The level comes from the type, unless the tone says otherwise; `back` from its own tone. A couple
// starts at least as friends.
export function fromOldTie(t) {
    const usual = USUAL[t.type], tone = t.tone || usual, back = t.back || tone;
    const floor = (l) => (l && COUPLE[t.type] && FRIEND_LEVELS.indexOf(l) < FRIEND_LEVELS.indexOf('friend') ? 'friend' : l);
    const level = (x) => floor(x && x !== usual ? BY_TONE[x] : BY_TYPE[t.type]);
    const feel = {};
    const f = level(tone), fb = level(back);
    if (f)
        feel.f = f;
    if (fb && fb !== f)
        feel.back = fb;
    if (COUPLE[t.type])
        feel.status = COUPLE[t.type];
    if (t.type === 'ex')
        feel.was = 'ex';
    const out = {};
    if (isFamily(t.type))
        out.family = t.type;
    if (Object.keys(feel).length)
        out.feel = feel;
    return out;
}
