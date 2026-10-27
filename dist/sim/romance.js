// Relationships in two tracks, like The Sims: friendship (the bond, 0..100) and romance (0..100 plus a status).
// The engine owns the numbers. The AI only plays the scenes: when you ask someone out or propose, the engine tells the
// AI how ready that person is, the AI writes the reaction, and a tiny follow-up question ("did they accept?") lets
// the engine apply the result. Each scene is judged when it ends (sim/verdict.ts).
import { nowAbs, cfg } from '../core/store.js';
import { bondOf, bump } from './social.js';
import { ro, gain, lose, pairOf, setStatus, setCooldown, partnersOf as partnersOfId, YOU } from './rel.js';
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
    return { value: romValue(g, avatar), status: st === 'dating' || st === 'engaged' || st === 'married' ? st : 'none', cooldown: p?.cooldown };
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
    { id: 'crush', name: 'Crush', lo: 40, hi: 101, color: '#e7489a' },
];
const STATUS_TIER = {
    dating: { id: 'dating', name: 'Dating', lo: 0, hi: 101, color: '#e23b6e' },
    engaged: { id: 'engaged', name: 'Engaged', lo: 0, hi: 101, color: '#c2185b' },
    married: { id: 'married', name: 'Married', lo: 0, hi: 101, color: '#ad1457' },
};
export const friendTier = (v) => FRIEND_TIERS.find(t => v >= t.lo && v < t.hi) ?? FRIEND_TIERS[0];
export function romanceTier(g, avatar, value = romValue(g, avatar)) {
    const s = romOf(g, avatar).status;
    return s !== 'none' ? STATUS_TIER[s] : ROMANCE_TIERS.find(t => value >= t.lo && value < t.hi) ?? ROMANCE_TIERS[0];
}
// progress inside the tier (the bar fills up and starts again at each new tier, like The Sims); below 0 it fills as
// the dislike deepens
export const tierPct = (t, v) => Math.round(Math.max(0, Math.min(1, t.hi <= 0 ? (t.hi - v) / (t.hi - t.lo) : (v - t.lo) / (Math.min(t.hi, 100) - t.lo))) * 100);
export const DISLIKES = -30, HATES = -60, CRUSH = 40;
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
    date: { label: 'Ask them out', line: n => `*asks ${n} to be a couple* "Will you be with me? As a couple, I mean."`, to: 'dating', from: ['none'] },
    propose: { label: 'Propose', line: n => `*proposes to ${n}*`, to: 'engaged', from: ['dating'] },
    marry: { label: 'Get married', line: n => `*asks ${n} to set the date and get married*`, to: 'married', from: ['engaged'] },
    baby: { label: 'Try for a baby', line: n => `*asks ${n} if they want to try for a baby together*`, to: null, from: ['dating', 'engaged', 'married'] },
};
export const canAsk = (g, avatar, k) => sysOn(g, k === 'baby' ? 'family' : 'romance') && !romanceBlocked(g, avatar) && !shutOut(g, avatar, true) && ASKS[k].from.includes(romOf(g, avatar).status) && (k !== 'baby' || canTryForBaby(g, avatar));
export const coolingDown = (g, avatar) => (romOf(g, avatar).cooldown ?? 0) > nowAbs(g);
// How ready they are: told to the AI so it does not simply say yes (models like to please).
export function readiness(g, avatar, name, k) {
    const f = bondOf(g, avatar), r = romValue(g, avatar), a = approvalOf(g, avatar);
    // with a crush, dislike isn't counted against them a second time (enemies to lovers)
    const b = f < 0 && r >= CRUSH ? 0 : f;
    const ft = coldWords(f) ? `${name} ${coldWords(f)} {{user}}` : friendTier(f).name.toLowerCase(), rt = romanceTier(g, avatar).name.toLowerCase();
    const st = romOf(g, avatar).status;
    const need = k === 'date' ? 45 : k === 'propose' ? 70 : k === 'marry' ? 80 : st === 'married' ? 60 : st === 'engaged' ? 75 : 85;
    const score = r * 0.6 + b * 0.4 + a * 0.2;
    const lean = score >= need + 15 ? 'would very likely say yes' : score >= need ? 'would probably say yes, maybe with some nerves' : score >= need - 15 ? 'is unsure: it could go either way, and asking may feel too soon'
        : 'would most likely say no, or feel uncomfortable: it is too soon';
    return `[{{user}} is asking ${name} ${k === 'date' ? 'to be a couple' : k === 'propose' ? 'to marry them' : k === 'marry' ? 'to get married now' : 'to try for a baby together'}. Where they stand: ${ft}, romance: ${rt}${a <= -15 ? `, and ${name} disapproves of how {{user}} behaves` : ''}. Realistically ${name} ${lean}. ` +
        (k === 'date' && partnersOf(g).some(a => a !== avatar) ? (polyOn(g) ? `${name} knows {{user}} is already with someone; relationships are open here, so that is fine. ` : `${name} knows {{user}} is already with someone else, which matters to most people. `) : '') +
        `Let ${name}'s personality decide within that; do not make ${name} agree just to please. Write ${name}'s honest reaction, and make the answer clear (yes, no, or that they need time to think).]`;
}
// Open relationships (World → Rules): no jealousy, several partners at once, and everyone knows it.
export const polyOn = (g) => !!cfg(g).poly;
export const partnersOf = (g) => partnersOfId(g, YOU);
// A new romance while you are with someone else: unless relationships are open, each partner who learns of it is hurt.
function jealousy(g, avatar, name) {
    if (polyOn(g))
        return [];
    const out = [];
    for (const other of partnersOf(g)) {
        if (other === avatar)
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
        const hurt = k === 'date' ? jealousy(g, avatar, name) : [];
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
    cool(nowAbs(g) + 3 * day);
    addRomance(g, avatar, -8);
    bump(g, avatar, -4);
    note(g, '{0} turned {u} down.', [name], [avatar], g.player.loc, 'love');
    return `${name} said no.`;
}
// asking again while they still feel awkward
export function pushTooSoon(g, avatar, name) { bump(g, avatar, -6); approve(g, avatar, -5); return `${name} is not ready to talk about that again so soon (bond −6).`; }
/* ---------- ending it ---------- */
export function endRelationship(g, avatar, name) {
    const was = romOf(g, avatar).status;
    if (was === 'none')
        return '';
    setStatus(g, avatar, YOU, null);
    addRomance(g, avatar, -45);
    bump(g, avatar, was === 'married' ? -30 : -20);
    approve(g, avatar, -10);
    note(g, was === 'married' ? '{u} and {0} got divorced.' : '{u} broke up with {0}.', [name], [avatar], g.player.loc, 'love');
    return was === 'married' ? `You and ${name} are divorced.` : `You and ${name} broke up.`;
}
// For the AI: where {{user}} stands with the people in this scene (friendship and romance, in words).
export function romanceLine(g, present) {
    const parts = present.map(r => {
        const b = bondOf(g, r.avatar), rt = romanceTier(g, r.avatar), love = rt.id !== 'none' && sysOn(g, 'romance') ? rt.name.toLowerCase() : '';
        if (!coldWords(b))
            return `${r.name}: ${friendTier(b).name.toLowerCase()}${love ? `, ${love}` : ''}`;
        return `${r.name} ${coldWords(b)} {{user}}${love ? ` (yet romance: ${love})` : ''}` +
            (b < HATES ? `: ${r.name} doesn't want {{user}} around, and leaves or tells {{user}} to leave` : '');
    });
    if (!parts.length)
        return '';
    const mine = partnersOf(g).map(a => g.cast[a]?.name ?? a);
    const love = !sysOn(g, 'romance') || !mine.length ? '' : polyOn(g)
        ? ` In this world relationships are open: {{user}} is with ${mine.join(' and ')}, everyone knows and nobody is jealous of it.`
        : mine.length > 1 ? ` {{user}} is seeing ${mine.join(' and ')} at the same time; each one expects to be the only one.` : '';
    const jl = g.jealous ?? {};
    const hurt = polyOn(g) ? [] : present.filter(r => jl[r.avatar] && g.day - jl[r.avatar].day < 7).map(r => `${r.name} is still hurt that {{user}} is also with ${g.cast[jl[r.avatar].of]?.name ?? 'someone else'}`);
    return `How {{user}} stands with them: ${parts.join('; ')}.${love}${hurt.length ? ` ${hurt.join('; ')}.` : ''}`;
}
