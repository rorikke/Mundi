// Starting feelings as data: how two people (or someone and you) start out, written by the new game, cast presets and
// the World creator, and the table that turns the old relation types (friend, rival, married to…) into them. Pure data
// (types only from sim/), so worlds can be upgraded from core/; sim/startfeel.ts applies them to a save.
import type { Status } from '../sim/rel.js';

// The levels are the friendship and romance tiers players see (FRIEND_TIERS / ROMANCE_TIERS in sim/romance.ts); each
// starts at one value inside its tier.
export type FriendLevel = 'hates' | 'dislikes' | 'wary' | 'stranger' | 'acquaintance' | 'friend' | 'good' | 'best';
export const FRIEND_LEVELS: FriendLevel[] = ['hates', 'dislikes', 'wary', 'stranger', 'acquaintance', 'friend', 'good', 'best'];
export type RomLevel = 'none' | 'interest' | 'crush' | 'infatuated';
export const ROM_LEVELS: RomLevel[] = ['none', 'interest', 'crush', 'infatuated'];
export const FRIEND_START: Record<FriendLevel, number> = { hates: -75, dislikes: -45, wary: -15, stranger: 0, acquaintance: 15, friend: 40, good: 65, best: 85 };
export const ROM_START: Record<RomLevel, number> = { none: 0, interest: 25, crush: 50, infatuated: 75 };
// Where someone stands with you at the start (approval) follows how they feel about you; a couple adds a little.
export const APPROVAL_START: Record<FriendLevel, number> = { hates: -50, dislikes: -25, wary: -10, stranger: 0, acquaintance: 5, friend: 15, good: 20, best: 30 };
export const COUPLE_APPROVAL = 10;
// The other way (a cast preset's "how each sees you"): the highest level whose approval it reaches.
export const levelOfApproval = (v: number): FriendLevel => [...FRIEND_LEVELS].reverse().find(l => v >= APPROVAL_START[l]) ?? 'hates';
// A couple starts as good friends and in love unless told otherwise.
export const COUPLE_FRIEND: FriendLevel = 'good';

// Family: the only relations that stay ties. Without a feeling chosen, family starts where it usually does.
export type FamilyType = 'parent' | 'child' | 'sibling' | 'cousin';
export const FAMILY_TYPES: FamilyType[] = ['parent', 'child', 'sibling', 'cousin'];
export const FAMILY_START: Record<FamilyType, number> = { parent: 75, child: 75, sibling: 55, cousin: 30 };
export const FAMILY_APPROVAL: Record<FamilyType, number> = { parent: 20, child: 20, sibling: 15, cousin: 10 };
export const isFamily = (type: string): type is FamilyType => (FAMILY_TYPES as string[]).includes(type);

/** How a starts with b: a's friendship and romance toward b, b's back (missing: the same), a couple's status, or the
 *  couple they used to be. With you (`b` = '__you') only a's side counts: your own feelings are played, never set. */
export interface FeelParts { f?: FriendLevel; back?: FriendLevel; r?: RomLevel; rback?: RomLevel; status?: Status; was?: Status | 'ex' }
export interface StartFeel extends FeelParts { a: string; b: string }

/* ---------- the old relation types ---------- */

// Each old type's usual tone (as sim/rel.ts TYPE_START had it): a tone that differs says something of its own.
const USUAL: Record<string, string> = {
    parent: 'close', child: 'close', sibling: 'good', cousin: 'neutral', spouse: 'close', partner: 'close', dating: 'good',
    bestfriend: 'close', friend: 'good', ally: 'good', colleague: 'neutral', roommate: 'neutral', rival: 'tense',
    enemy: 'hostile', ex: 'tense', mentor: 'good', apprentice: 'good',
};
const BY_TYPE: Record<string, FriendLevel> = {
    bestfriend: 'best', friend: 'friend', ally: 'friend', mentor: 'friend', apprentice: 'friend',
    colleague: 'acquaintance', roommate: 'acquaintance', rival: 'wary', enemy: 'dislikes',
};
const BY_TONE: Record<string, FriendLevel> = { close: 'good', good: 'friend', neutral: 'acquaintance', tense: 'wary', hostile: 'dislikes' };
const COUPLE: Record<string, Status> = { spouse: 'married', partner: 'dating', dating: 'dating' };

// One old tie ({ type, tone, back? }, as world files, cast presets and new games wrote them): family stays a tie, with a
// feeling only when its tone isn't the usual one (the manor's tense cousins stay tense); anything else becomes a
// starting feeling. The level comes from the type, unless the tone says otherwise; `back` from its own tone. A couple
// starts at least as friends.
export function fromOldTie(t: { type: string; tone?: string; back?: string }): { family?: FamilyType; feel?: FeelParts } {
    const usual = USUAL[t.type], tone = t.tone || usual, back = t.back || tone;
    const floor = (l: FriendLevel | undefined) => (l && COUPLE[t.type] && FRIEND_LEVELS.indexOf(l) < FRIEND_LEVELS.indexOf('friend') ? 'friend' : l);
    const level = (x: string | undefined) => floor(x && x !== usual ? BY_TONE[x] : BY_TYPE[t.type]);
    const feel: FeelParts = {};
    const f = level(tone), fb = level(back);
    if (f) feel.f = f;
    if (fb && fb !== f) feel.back = fb;
    if (COUPLE[t.type]) feel.status = COUPLE[t.type];
    if (t.type === 'ex') feel.was = 'ex';
    const out: { family?: FamilyType; feel?: FeelParts } = {};
    if (isFamily(t.type)) out.family = t.type;
    if (Object.keys(feel).length) out.feel = feel;
    return out;
}

/* ---------- relations as the new game and cast presets keep them ---------- */

/** One relation chosen for a game: optionally family (`a` is the `family` of `b`), and how they start. */
export interface StartRel extends StartFeel { family?: FamilyType }
// Relations in either form, as starting relations: old ties ({ type, tone, back? }, cast presets saved before) go
// through fromOldTie; new ones (no `type`) are kept. Pure, so it can run on saved presets and drafts alike.
export function toStartRels(list: any[] | undefined): StartRel[] {
    const out: StartRel[] = [];
    for (const t of Array.isArray(list) ? list : []) {
        if (!t?.a || !t?.b || t.a === t.b) continue;
        if (!('type' in t)) { out.push(t); continue; }
        const { family, feel } = fromOldTie(t);
        if (family || feel) out.push({ a: t.a, b: t.b, ...(family ? { family } : {}), ...(feel ?? {}) });
    }
    return out;
}
