// Relationships in two tracks, like The Sims: friendship (the bond, 0..100) and romance (0..100 plus a status).
// The engine owns the numbers. The AI only plays the scenes: when you ask someone out or propose, the engine tells the
// AI how ready that person is, the AI writes the reaction, and a tiny follow-up question ("did they accept?") lets
// the engine apply the result. Each scene is judged when it ends (sim/verdict.ts).
import { nowAbs, cfg } from '../core/store.js';
import { bondOf, bump } from './social.js';
import { ro, gain, lose, pairOf, pastOf, pastWords, setStatus, setCooldown, attracted, rateOf, partnersOf as partnersOfId, casualsOf as casualsOfId, YOU } from './rel.js';
import { notAttractedWords } from './gender.js';
import { intimacyReady, intimacyLine, styleOf } from './intimacy.js';
import { dating, lookingOf } from './feed.js';
import { approvalOf, approve } from './living.js';
import { note } from './facts.js';
import { romanceBlocked, canTryForBaby } from './family.js';
import { getWorld, systemOn } from '../core/world.js';
// Is a system on in this save's world (romance, children)?
export const sysOn = (g, id) => systemOn(getWorld(g.world), id);
// Where someone stands with you romantically, read from the relationships store (sim/rel.ts). A copy: change the
// status with setStatus(), romance with addRomance().
export function romOf(g, avatar) {
    const p = pairOf(g, avatar, YOU);
    const st = p?.status;
    return { value: romValue(g, avatar), status: st ?? 'none', cooldown: p?.cooldown };
}
export const romValue = (g, avatar) => Math.round(ro(g, avatar, YOU));
// Romance toward you, up or down (asks, the night's verdict, breakups).
export function addRomance(g, avatar, delta) { if (delta > 0)
    gain(g, 'r', avatar, YOU, delta, false);
else if (delta < 0)
    lose(g, 'r', avatar, YOU, delta); }
// Below Stranger: people who dislike you (each tier includes its lower bound, so 0 is a Stranger, not Wary).
export const FRIEND_TIERS = [
    { id: 'hates', name: 'Hates', lo: -100, hi: -60, color: '#b3261e' },
    { id: 'dislikes', name: 'Dislikes', lo: -60, hi: -30, color: '#e0603a' },
    { id: 'wary', name: 'Wary', lo: -30, hi: 0, color: '#c9a227' },
    { id: 'stranger', name: 'Stranger', lo: 0, hi: 10, color: '#8a94a6' },
    { id: 'acquaintance', name: 'Acquaintance', lo: 10, hi: 30, color: '#5aa0e6' },
    { id: 'friend', name: 'Friend', lo: 30, hi: 55, color: '#43b51b' },
    { id: 'good', name: 'Good friend', lo: 55, hi: 80, color: '#16b3a5' },
    { id: 'best', name: 'Best friend', lo: 80, hi: 101, color: '#f0ad13' },
];
export const ROMANCE_TIERS = [
    { id: 'none', name: 'No romance', lo: 0, hi: 15, color: '#8a94a6' },
    { id: 'interest', name: 'Interest', lo: 15, hi: 40, color: '#f48fb1' },
    { id: 'crush', name: 'Crush', lo: 40, hi: 70, color: '#e7489a' },
    { id: 'infatuated', name: 'Infatuated', lo: 70, hi: 101, color: '#d01f6f' },
];
const STATUS_TIER = {
    casual: { id: 'casual', name: 'Fling', lo: 0, hi: 101, color: '#ef6c9a' },
    dating: { id: 'dating', name: 'Dating', lo: 0, hi: 101, color: '#e23b6e' },
    engaged: { id: 'engaged', name: 'Engaged', lo: 0, hi: 101, color: '#c2185b' },
    married: { id: 'married', name: 'Married', lo: 0, hi: 101, color: '#ad1457' },
};
export const friendTier = (v) => FRIEND_TIERS.find(t => v >= t.lo && v < t.hi) ?? FRIEND_TIERS[0];
export function romanceTier(g, avatar, value = romValue(g, avatar)) {
    const s = romOf(g, avatar).status;
    if (s === 'casual')
        return { ...STATUS_TIER.casual, name: casualName(g, avatar) };
    return s !== 'none' ? STATUS_TIER[s] : ROMANCE_TIERS.find(t => value >= t.lo && value < t.hi) ?? ROMANCE_TIERS[0];
}
// Something casual reads by friendship: a fling, or friends with benefits once they're friends.
export const casualName = (g, avatar) => (bondOf(g, avatar) >= 30 ? 'Friends with benefits' : 'Fling');
// progress inside the tier (the bar fills up and starts again at each new tier, like The Sims); below 0 it fills as
// the dislike deepens
export const tierPct = (t, v) => Math.round(Math.max(0, Math.min(1, t.hi <= 0 ? (t.hi - v) / (t.hi - t.lo) : (v - t.lo) / (Math.min(t.hi, 100) - t.lo))) * 100);
export const DISLIKES = -30, HATES = -60, INTEREST = 15, CRUSH = 40, INFATUATED = 70;
const LABELS = [
    { id: 'soulmates', name: 'Soulmates', words: 'soulmates: deeply in love and the closest of friends', ok: (f, r) => r >= 90 && f >= 90 },
    { id: 'inlove', name: 'In love', words: 'in love', ok: (f, r) => r >= INFATUATED && f >= 55 },
    { id: 'infatuated', name: 'Infatuated', words: 'infatuated, without really knowing them yet', ok: (f, r) => r >= INFATUATED && f >= 0 },
    { id: 'lovehate', name: 'Love-hate', words: 'drawn to them despite resenting them', ok: (f, r) => r >= CRUSH && f < 0 },
    { id: 'platonic', name: 'Platonic', words: "close, but doesn't see them that way", ok: (f, r) => r < INTEREST && f >= 55 },
];
export function labelOf(f, r) {
    const l = LABELS.find(x => x.ok(f, r));
    return l ? { id: l.id, name: l.name, words: l.words } : null;
}
// The label of someone toward you (romance only counts with the romance system on and no family block).
export function labelToward(g, avatar) {
    const love = sysOn(g, 'romance') && !romanceBlocked(g, avatar);
    return labelOf(bondOf(g, avatar), love ? romValue(g, avatar) : 0);
}
// How a feeling below Stranger reads in a sentence ("Kaho dislikes {{user}}"); '' from Stranger up.
export const coldWords = (f) => (f < HATES ? 'hates' : f < DISLIKES ? 'dislikes' : f < 0 ? 'is wary of' : '');
// A crush on you that can outweigh dislike (enemies to lovers).
export const crushOn = (g, avatar) => sysOn(g, 'romance') && !romanceBlocked(g, avatar) && romValue(g, avatar) >= CRUSH;
// Someone who doesn't want you around: at Hates for everything, at Dislikes unless it's romantic and they have a crush
// on you. They refuse invitations, plans and "come with me", don't invite you and don't let you in.
export function shutOut(g, avatar, romantic = false) {
    const f = bondOf(g, avatar);
    return f < HATES || (f < DISLIKES && !(romantic && crushOn(g, avatar)));
}
export const ASKS = {
    casual: { label: 'Keep it casual?', line: n => `*asks ${n} if they'd like to keep things casual between them, no strings attached*`, to: 'casual', from: ['none'] },
    date: { label: 'Ask them out', line: n => `*asks ${n} to be a couple* "Will you be with me? As a couple, I mean."`, to: 'dating', from: ['none', 'casual'] },
    propose: { label: 'Propose', line: n => `*proposes to ${n}*`, to: 'engaged', from: ['dating'] },
    marry: { label: 'Get married', line: n => `*asks ${n} to set the date and get married*`, to: 'married', from: ['engaged'] },
    baby: { label: 'Try for a baby', line: n => `*asks ${n} if they want to try for a baby together*`, to: null, from: ['dating', 'engaged', 'married'] },
};
export const canAsk = (g, avatar, k) => sysOn(g, k === 'baby' ? 'family' : 'romance') && !romanceBlocked(g, avatar) && !shutOut(g, avatar, true) && ASKS[k].from.includes(romOf(g, avatar).status) && (k !== 'baby' || canTryForBaby(g, avatar));
export const coolingDown = (g, avatar) => (romOf(g, avatar).cooldown ?? 0) > nowAbs(g);
// The engine's own "no", whatever the AI writes: something casual with someone who only gets intimate with a partner,
// and being a couple or something casual with someone not attracted to your gender (G-6).
export const forcedNo = (g, avatar, k) => (k === 'casual' && intimacyReady(g, avatar, '').lean === 'never') || (k === 'date' && !attracted(g, avatar, YOU));
// Seeing someone else matters to someone exclusive (a step less ready); an open person doesn't mind.
const seeingOthers = (g, avatar) => [...partnersOf(g), ...casualsOf(g)].some(a => a !== avatar);
const LEAN = ['would most likely say no, or feel uncomfortable: it is too soon', 'is unsure: it could go either way, and asking may feel too soon', 'would probably say yes, maybe with some nerves', 'would very likely say yes'];
// How ready they are: told to the AI so it does not simply say yes (models like to please).
// How much someone wants what's asked (a couple, an engagement, a wedding, a baby) against what it needs: at or above
// the need, a likely yes. Characters who ask you themselves use the same numbers (sim/initiative.ts).
export function askScore(g, avatar, k) {
    const f = bondOf(g, avatar), r = romValue(g, avatar), a = approvalOf(g, avatar);
    // with a crush, dislike isn't counted against them a second time (enemies to lovers)
    const b = f < 0 && r >= CRUSH ? 0 : f;
    const st = romOf(g, avatar).status;
    const need = k === 'date' ? 45 : k === 'propose' ? 70 : k === 'marry' ? 80 : st === 'married' ? 60 : st === 'engaged' ? 75 : 85;
    return { score: r * 0.6 + b * 0.4 + a * 0.2 - (k === 'date' && seeingOthers(g, avatar) && styleOf(g, avatar) === 'exclusive' ? 15 : 0), need };
}
export function readiness(g, avatar, name, k) {
    if (k === 'casual')
        return casualReadiness(g, avatar, name);
    const f = bondOf(g, avatar), a = approvalOf(g, avatar);
    const ft = coldWords(f) ? `${name} ${coldWords(f)} {{user}}` : friendTier(f).name.toLowerCase(), rt = romanceTier(g, avatar).name.toLowerCase();
    const { score, need } = askScore(g, avatar, k);
    const lean = k === 'date' && !attracted(g, avatar, YOU) ? `will say no: ${notAttractedWords(g, name)}` : LEAN[score >= need + 15 ? 3 : score >= need ? 2 : score >= need - 15 ? 1 : 0];
    return `[{{user}} is asking ${name} ${k === 'date' ? 'to be a couple' : k === 'propose' ? 'to marry them' : k === 'marry' ? 'to get married now' : 'to try for a baby together'}. Where they stand: ${ft}, romance: ${rt}${a <= -15 ? `, and ${name} disapproves of how {{user}} behaves` : ''}. Realistically ${name} ${lean}. ` +
        (k === 'date' && seeingOthers(g, avatar) ? othersWords(g, avatar, name) : '') +
        `Let ${name}'s personality decide within that; do not make ${name} agree just to please. Write ${name}'s honest reaction, and make the answer clear (yes, no, or that they need time to think).]`;
}
const othersWords = (g, avatar, name) => (styleOf(g, avatar) === 'open'
    ? `${name} knows {{user}} is seeing someone else, and is fine with open relationships. `
    : `${name} knows {{user}} is already seeing someone else, which matters to ${name}: they want to be the only one. `);
// Something casual: decided by their intimacy needs (the least-met one), and whether they only do it with a partner.
function casualReadiness(g, avatar, name) {
    const ready = intimacyReady(g, avatar, name);
    let i = ready.lean === 'yes' ? 3 : ready.lean === 'unsure' ? 1 : 0;
    if (i > 0 && seeingOthers(g, avatar) && styleOf(g, avatar) === 'exclusive')
        i--;
    const lean = ready.lean === 'never' ? `will say no: ${ready.why}` : `${LEAN[i]}${ready.lean === 'yes' ? '' : ` (${ready.why})`}`;
    const app = dating(g).matches.includes(avatar) && lookingOf(g, avatar) === 'Something casual' ? ` ${name} is on the dating app looking for something casual too.` : '';
    return `[{{user}} is asking ${name} to keep things casual between them: intimacy without being a couple. Where they stand: ${friendTier(bondOf(g, avatar)).name.toLowerCase()}, romance: ${romanceTier(g, avatar).name.toLowerCase()}.${app} Realistically ${name} ${lean}. ` +
        (seeingOthers(g, avatar) ? othersWords(g, avatar, name) : '') +
        `Let ${name}'s personality decide within that; do not make ${name} agree just to please. Write ${name}'s honest reaction, and make the answer clear (yes, no, or that they need time to think).]`;
}
// Open relationships (World → Rules): no jealousy, several partners at once, and everyone knows it.
export const polyOn = (g) => !!cfg(g).poly;
export const partnersOf = (g) => partnersOfId(g, YOU);
export const casualsOf = (g) => casualsOfId(g, YOU);
// A new romance (or something casual) while you are with someone: each partner whose own style is exclusive is hurt
// when they learn of it. Casual partners are never hurt.
function jealousy(g, avatar, name) {
    const out = [];
    for (const other of partnersOf(g)) {
        if (other === avatar || styleOf(g, other) === 'open')
            continue;
        const who = g.cast[other]?.name ?? other;
        addRomance(g, other, -20);
        bump(g, other, -12);
        approve(g, other, -15);
        (g.jealous ??= {})[other] = { of: avatar, day: g.day };
        note(g, '{0} found out that {u} is also with {1}, and is hurt.', [who, name], [other, avatar], g.player.loc, 'love');
        out.push(`${who} found out about ${name}: romance −20, bond −12.`);
    }
    return out;
}
// After the reply: the engine applies the answer.
export function applyAnswer(g, avatar, name, k, answer) {
    const cool = (until) => setCooldown(g, avatar, YOU, until);
    if (answer === 'yes') {
        if (k === 'baby') {
            cool(0);
            addRomance(g, avatar, 5);
            return '';
        } // the engine then decides (family.ts)
        const hurt = k === 'date' || k === 'casual' ? jealousy(g, avatar, name) : [];
        if (k === 'casual') { // a milestone for romance; friendship stays where it is
            setStatus(g, avatar, YOU, 'casual');
            cool(0);
            addRomance(g, avatar, 5);
            note(g, '{u} and {0} started something casual.', [name], [avatar], g.player.loc, 'love');
            return [`You and ${name} are keeping it casual.`, ...hurt].join(' ');
        }
        setStatus(g, avatar, YOU, ASKS[k].to);
        cool(0);
        addRomance(g, avatar, 15);
        bump(g, avatar, 5);
        note(g, k === 'date' ? '{u} and {0} started dating.' : k === 'propose' ? '{u} and {0} got engaged.' : '{u} and {0} got married.', [name], [avatar], g.player.loc, 'love');
        return [k === 'date' ? `You and ${name} are now dating!` : k === 'propose' ? `You and ${name} are engaged!` : `You and ${name} are married!`, ...hurt].join(' ');
    }
    const day = 1440;
    if (answer === 'maybe') {
        cool(nowAbs(g) + day);
        note(g, '{0} asked {u} for some time to think about it.', [name], [avatar], g.player.loc, 'love');
        return `${name} wants some time to think.`;
    }
    // a no: a little awkward, and asking again too soon makes it worse
    if (k === 'baby') {
        cool(nowAbs(g) + 3 * day);
        note(g, '{0} is not ready to have a baby with {u}.', [name], [avatar], g.player.loc, 'family');
        return `${name} is not ready for a baby.`;
    }
    if (k === 'casual') {
        cool(nowAbs(g) + 2 * day);
        addRomance(g, avatar, -4);
        bump(g, avatar, -2);
        note(g, '{0} turned down something casual with {u}.', [name], [avatar], g.player.loc, 'love');
        return `${name} said no.`;
    }
    cool(nowAbs(g) + 3 * day);
    addRomance(g, avatar, -8);
    bump(g, avatar, -4);
    note(g, '{0} turned {u} down.', [name], [avatar], g.player.loc, 'love');
    return `${name} said no.`;
}
// Staying the night (yours or theirs): a sleepover between friends, decided by friendship (or being partners), or a
// night together, decided by their intimacy needs. Staying doesn't move romance by itself; the scene verdict judges
// what happened. With the romance system off, only friendship speaks.
export function stayReadiness(g, avatar, name, mine) {
    const f = bondOf(g, avatar), st = romOf(g, avatar).status, partner = st !== 'none';
    const sleep = partner ? 3 : f >= 70 ? 3 : f >= 55 ? 1 : 0;
    const sleepWords = partner ? `${name} and {{user}} are ${st === 'casual' ? 'seeing each other' : 'together'}` : f >= 70 ? `${name} is close enough to {{user}} for that` : f >= 55 ? `${name} might be, though they aren't that close yet` : `${name} isn't close enough to {{user}} for that`;
    const love = sysOn(g, 'romance') && !romanceBlocked(g, avatar) && (partner || romValue(g, avatar) >= INTEREST);
    const ready = love ? intimacyReady(g, avatar, name) : null;
    const night = !ready ? 0 : ready.lean === 'yes' ? 3 : ready.lean === 'unsure' ? 1 : 0;
    const nightWords = !ready ? '' : ready.lean === 'yes' ? `As a night together: ${ready.why}, so they may want more than sleeping. `
        : ready.lean === 'never' ? `As a night together: no (${ready.why}); a sleepover at most. ` : `As a night together: not yet (${ready.why}). `;
    return `[{{user}} asks ${name} ${mine ? "to stay the night at {{user}}'s place" : `if {{user}} can sleep at ${name}'s place tonight`}. As a sleepover between friends: ${sleepWords}. ${nightWords}` +
        `Realistically ${name} ${LEAN[Math.max(sleep, night)]}. Staying the night doesn't have to mean more than sleeping. Let ${name}'s personality decide within that; do not make ${name} agree just to please. Write ${name}'s honest reaction, and make the answer clear (yes or no).]`;
}
// asking again while they still feel awkward
export function pushTooSoon(g, avatar, name) { bump(g, avatar, -6); approve(g, avatar, -5); return `${name} is not ready to talk about that again so soon (bond −6).`; }
/* ---------- ending it ---------- */
export function endRelationship(g, avatar, name) {
    const was = romOf(g, avatar).status;
    if (was === 'none')
        return '';
    if (was === 'casual') { // no strings attached: a smaller sting
        setStatus(g, avatar, YOU, null);
        addRomance(g, avatar, -15);
        bump(g, avatar, -5);
        approve(g, avatar, -3);
        note(g, '{u} and {0} stopped seeing each other.', [name], [avatar], g.player.loc, 'love');
        return `You and ${name} stopped seeing each other.`;
    }
    setStatus(g, avatar, YOU, null);
    addRomance(g, avatar, -45);
    bump(g, avatar, was === 'married' ? -30 : -20);
    approve(g, avatar, -10);
    note(g, was === 'married' ? '{u} and {0} got divorced.' : '{u} broke up with {0}.', [name], [avatar], g.player.loc, 'love');
    return was === 'married' ? `You and ${name} are divorced.` : `You and ${name} broke up.`;
}
// Gains toward you that have slowed a lot (S-11's readable slowdown): romance first, then friendship; null when not.
export const SLOW_RATE = 0.25;
export function slowedDown(g, avatar) {
    if (sysOn(g, 'romance') && !romanceBlocked(g, avatar) && rateOf(g, 'r', avatar, YOU) < SLOW_RATE)
        return 'r';
    return rateOf(g, 'f', avatar, YOU) < SLOW_RATE ? 'f' : null;
}
const SLOW_WORDS = { r: (n) => `${n} needs some time to take all this in`, f: (n) => `${n} needs a little time before getting any closer` };
// For the AI: where {{user}} stands with the people in this scene (friendship and romance, in words).
export function romanceLine(g, present) {
    const parts = present.map(r => {
        const b = bondOf(g, r.avatar), rt = romanceTier(g, r.avatar), love = rt.id !== 'none' && sysOn(g, 'romance') ? rt.name.toLowerCase() : '';
        const lab = labelToward(g, r.avatar), st = romOf(g, r.avatar).status;
        // with a partner: whether they're still in love; otherwise the label in words
        const how = st !== 'none' ? (lab?.id === 'soulmates' || lab?.id === 'inlove' ? `, and ${lab.words}` : romValue(g, r.avatar) < CRUSH ? ', but no longer in love' : '')
            : lab && lab.id !== 'lovehate' ? ` (${lab.words})` : '';
        if (!coldWords(b))
            return `${r.name}: ${friendTier(b).name.toLowerCase()}${love ? `, ${love}` : ''}${how}`;
        return `${r.name} ${coldWords(b)} {{user}}${love ? ` (yet romance: ${love}; ${r.name} is drawn to {{user}} despite resenting them)` : ''}${st !== 'none' ? how : ''}` +
            (b < HATES ? `: ${r.name} doesn't want {{user}} around, and leaves or tells {{user}} to leave` : '');
    });
    if (!parts.length)
        return '';
    const mine = partnersOf(g).map(a => g.cast[a]?.name ?? a);
    const exclusive = partnersOf(g).filter(a => styleOf(g, a) === 'exclusive').map(a => g.cast[a]?.name ?? a);
    const flings = casualsOf(g).map(a => g.cast[a]?.name ?? a);
    const love = !sysOn(g, 'romance') ? '' : (!mine.length ? '' : polyOn(g) && !exclusive.length
        ? ` In this world relationships are open: {{user}} is with ${mine.join(' and ')}, everyone knows and nobody is jealous of it.`
        : mine.length > 1 ? ` {{user}} is seeing ${mine.join(' and ')} at the same time${exclusive.length ? `; ${exclusive.join(' and ')} ${exclusive.length > 1 ? 'each expect' : 'expects'} to be the only one` : ''}.` : '')
        + (flings.length ? ` {{user}} has something casual with ${flings.join(' and ')} (no strings attached, not a couple).` : '');
    const past = present.map(r => { const p = pastOf(g, r.avatar, YOU); return p ? `${r.name} and {{user}} ${pastWords(g, p)}` : ''; }).filter(Boolean);
    const jl = g.jealous ?? {};
    const hurt = present.filter(r => jl[r.avatar] && g.day - jl[r.avatar].day < 7).map(r => `${r.name} is still hurt that {{user}} is also with ${g.cast[jl[r.avatar].of]?.name ?? 'someone else'}`);
    const needs = sysOn(g, 'romance') ? intimacyLine(g, present, a => romanceBlocked(g, a)) : '';
    const slow = present.map(r => { const m = slowedDown(g, r.avatar); return m ? SLOW_WORDS[m](r.name) : ''; }).filter(Boolean);
    return `How {{user}} stands with them: ${parts.join('; ')}.${love}${past.length ? ` ${past.join('; ')}.` : ''}${hurt.length ? ` ${hurt.join('; ')}.` : ''}${needs ? ` ${needs}` : ''}${slow.length ? ` ${slow.join('; ')}.` : ''}`;
}
