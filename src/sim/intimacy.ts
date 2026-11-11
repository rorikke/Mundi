// Each person's own needs and ways in love (requirements R-15, R-9). Intimacy style: what they need before getting
// intimate (a casual relationship, a night together that's more than a sleepover), as a romance tier and a friendship
// tier, from presets (Free spirit … Devoted) or custom; and a switch for those who only get intimate with a partner.
// Relationship style: exclusive or open (unset: the world's setting). Stored per person in the relationships store
// (`rel.people`); the engine turns them into readiness hints and words for the AI, and forces a "no" only where the
// switch says so. Also (adult content) the record of private moments between people and what each has learned of the
// other's likes, limits and drive (at the bottom).
import { cfg, nowAbs, type Save } from '../core/store.js';
import type { IntimateRole, IntimateDrive } from '../core/world.js';
import { relOf, idOf, ro, fr, isPartner, attracted, YOU } from './rel.js';
import { notAttractedWords } from './gender.js';
import { bondOf } from './social.js';

export type IntimacyPreset = 'free' | 'passionate' | 'steady' | 'slow' | 'devoted' | 'custom';
export type RNeed = 'interest' | 'crush' | 'infatuated';
export type FNeed = 'none' | 'friend' | 'good' | 'best';
export interface Intimacy { preset?: IntimacyPreset; r?: RNeed; f?: FNeed; casual?: false }
export type RelStyle = 'exclusive' | 'open';

export const PRESETS: Record<Exclude<IntimacyPreset, 'custom'>, { name: string; r: RNeed; f: FNeed }> = {
    free: { name: 'Free spirit', r: 'interest', f: 'none' },
    passionate: { name: 'Passionate', r: 'crush', f: 'none' },
    steady: { name: 'Steady', r: 'crush', f: 'friend' },
    slow: { name: 'Slow to trust', r: 'crush', f: 'good' },
    devoted: { name: 'Devoted', r: 'infatuated', f: 'best' },
};
export const R_AT: Record<RNeed, number> = { interest: 15, crush: 40, infatuated: 70 };
export const F_AT: Record<FNeed, number | null> = { none: null, friend: 30, good: 55, best: 80 };
export const R_NAME: Record<RNeed, string> = { interest: 'Interest', crush: 'Crush', infatuated: 'Infatuated' };
export const F_NAME: Record<FNeed, string> = { none: 'None', friend: 'Friend', good: 'Good friend', best: 'Best friend' };

const personOf = (g: Save, a: string) => relOf(g).people[idOf(g, a)] as ({ intimacy?: Intimacy; style?: RelStyle } | undefined);
// A person's needs (unset: Steady, casual intimacy yes).
export function needsOf(g: Save, a: string): { preset: IntimacyPreset; r: RNeed; f: FNeed; partnerOnly: boolean } {
    const i = personOf(g, a)?.intimacy ?? {};
    const preset = i.preset ?? 'steady';
    const base = preset === 'custom' ? { r: i.r ?? 'crush', f: i.f ?? 'friend' } : PRESETS[preset] ?? PRESETS.steady;
    return { preset, r: base.r, f: base.f, partnerOnly: i.casual === false };
}
// Exclusive or open: the person's own style, else the world's "open relationships".
export const styleOf = (g: Save, a: string): RelStyle => personOf(g, a)?.style ?? (cfg(g).poly ? 'open' : 'exclusive');
export const ownStyle = (g: Save, a: string): RelStyle | undefined => personOf(g, a)?.style;

/** How ready someone is for intimacy with you (a casual relationship, a night together): `never` for "only with a
 *  partner" when you aren't one, and for no attraction to your gender (the engine then says no, whatever the AI writes). `why`: what's missing, in words. */
export interface IntimacyReady { lean: 'yes' | 'unsure' | 'no' | 'never'; why: string }
export function intimacyReady(g: Save, a: string, name: string): IntimacyReady {
    if (!attracted(g, a, YOU)) return { lean: 'never', why: notAttractedWords(g, name) };
    const n = needsOf(g, a);
    if (n.partnerOnly && !isPartner(g, a)) return { lean: 'never', why: `${name} only gets intimate with a partner, and {{user}} isn't one` };
    const r = ro(g, a, YOU), f = bondOf(g, a), fNeed = F_AT[n.f];
    const gapR = R_AT[n.r] - r, gapF = fNeed === null ? (f < 0 ? -f : 0) : fNeed - f;
    const missing = [
        gapR > 0 ? `${name} isn't attracted enough to {{user}} yet` : '',
        gapF > 0 ? (fNeed === null ? `${name} resents {{user}} too much` : `${name} needs to trust {{user}} more first (as a ${F_NAME[n.f].toLowerCase()}, at least)`) : '',
    ].filter(Boolean);
    const gap = Math.max(gapR, gapF);
    if (gap <= 0) return { lean: 'yes', why: `${name} feels enough for {{user}} for that` };
    return { lean: gap <= 10 ? 'unsure' : 'no', why: missing.join(', and ') };
}

// Between two people of the world (R-6): x's needs are met toward y (romance and friendship at least what x's style
// asks), and x doesn't keep intimacy for a partner.
export function needsMetToward(g: Save, x: string, y: string): boolean {
    const n = needsOf(g, x); if (n.partnerOnly) return false;
    const fNeed = F_AT[n.f];
    return ro(g, x, y) >= R_AT[n.r] && fr(g, x, y) >= (fNeed ?? 0);
}

// For the AI: a non-default style in plain words (no numbers).
const STYLE_WORDS: Record<IntimacyPreset, string> = {
    free: 'is a free spirit: a spark of attraction is enough for them to get intimate',
    passionate: 'gets intimate when the attraction is real, even without a long friendship',
    steady: '',
    slow: 'only gets intimate with someone they trust as a close friend',
    devoted: 'only gets intimate with someone they are deeply in love with and trust completely',
    custom: '',
};
// For the people here who feel something for you: how they are about intimacy (when it isn't the usual), whether
// you're there yet, and an exclusive or open style that differs from the world's.
export function intimacyLine(g: Save, present: { avatar: string; name: string }[], blocked: (a: string) => boolean): string {
    const out: string[] = [];
    for (const p of present) {
        if (blocked(p.avatar)) continue;
        const own = ownStyle(g, p.avatar), world: RelStyle = cfg(g).poly ? 'open' : 'exclusive';
        if (own && own !== world) out.push(own === 'open' ? `${p.name} is fine with open, non-exclusive relationships` : `${p.name} wants an exclusive relationship, even here`);
        if (ro(g, p.avatar, YOU) < R_AT.interest && !isPartner(g, p.avatar)) continue;
        const n = needsOf(g, p.avatar);
        const style = n.preset === 'custom' ? `needs ${R_NAME[n.r].toLowerCase()} and ${n.f === 'none' ? 'no friendship in particular' : `to be at least a ${F_NAME[n.f].toLowerCase()}`} before getting intimate` : STYLE_WORDS[n.preset];
        const parts = [style, n.partnerOnly ? 'only gets intimate with a partner' : ''].filter(Boolean);
        const ready = intimacyReady(g, p.avatar, p.name);
        if (!parts.length && ready.lean === 'yes') continue;   // the usual, and you're there: nothing to say
        const now = ready.lean === 'yes' ? `with {{user}}, ${p.name} is ready for that` : ready.lean === 'never' ? `${p.name} isn't ready with {{user}}: ${ready.why}` : `${p.name} isn't ready with {{user}} yet: ${ready.why}`;
        out.push(parts.length ? `${p.name} ${parts.join(', and ')}; ${now}` : now);
    }
    return out.length ? `Intimacy: ${out.join('. ')}.` : '';
}

/* ---------- private moments, and what you've learned of each other (Tokyo's adult progression) ---------- */
// Kept in the relationships store, so "Play as" moves it with the people (`swapIds`): per pair (`rel.close`, "a|b") the
// time of their last private moment together and how many; per direction (`rel.knows`, "x>y") the likes and hard limits
// x has learned of y, and whether x knows y's drive. Nothing is written until something happens, and nothing reads it
// to change a number yet: sim/private.ts, sim/drive.ts and the rest call these.
const pairKey = (a: string, b: string) => [a, b].sort().join('|');
/** What someone has learned of a person in bed: likes and hard limits (words from their profile), and their drive. */
export interface Known { likes: string[]; limits: string[]; drive: boolean }
/** A private moment between a and b (you, by default) just happened (`at`: absolute minutes, default now). */
export function noteIntimate(g: Save, a: string, b: string = YOU, at = nowAbs(g)) {
    a = idOf(g, a); b = idOf(g, b);
    if (!a || !b || a === b) return;
    const c = (relOf(g).close ??= {}), k = pairKey(a, b);
    const e = (c[k] ??= { last: at, n: 0 });
    e.last = Math.max(e.last, at); e.n += 1;
}
/** When a and b (you) last had a private moment (absolute minutes), or undefined when never. */
export const lastIntimate = (g: Save, a: string, b: string = YOU): number | undefined => relOf(g).close?.[pairKey(idOf(g, a), idOf(g, b))]?.last;
/** How many private moments a and b (you) have had. */
export const intimateCount = (g: Save, a: string, b: string = YOU): number => relOf(g).close?.[pairKey(idOf(g, a), idOf(g, b))]?.n ?? 0;
/** What `by` (you) has learned of a (copies). */
export function knownOf(g: Save, a: string, by: string = YOU): Known {
    const k = relOf(g).knows?.[`${idOf(g, by)}>${idOf(g, a)}`];
    return { likes: [...(k?.likes ?? [])], limits: [...(k?.limits ?? [])], drive: !!k?.drive };
}
/** `by` (you) learns one of a's likes or hard limits (`value`: its words, as in their profile), or a's drive. True when
 *  it's new. */
export function learn(g: Save, a: string, what: 'like' | 'limit' | 'drive', value = '', by: string = YOU): boolean {
    a = idOf(g, a); by = idOf(g, by);
    if (!a || !by || a === by || (what !== 'drive' && !value.trim())) return false;
    const all = (relOf(g).knows ??= {}), k = `${by}>${a}`, e = (all[k] ??= {});
    if (what === 'drive') { if (e.drive) return false; e.drive = true; return true; }
    const list = (what === 'like' ? (e.likes ??= []) : (e.limits ??= []));
    if (list.includes(value)) return false;
    list.push(value);
    return true;
}
/** Someone's role in bed and drive, from their intimate profile (a drive not set is average; a role not set is none). */
export const roleOf = (g: Save, a: string): IntimateRole | undefined => relOf(g).people[idOf(g, a)]?.intimate?.role;
export const driveOf = (g: Save, a: string): IntimateDrive => relOf(g).people[idOf(g, a)]?.intimate?.drive ?? 'average';
