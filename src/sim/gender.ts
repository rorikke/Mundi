// Genders and attraction (requirements G-1…G-9): each world has its list (the style's when it has none), each person
// may have one (`rel.people[id].gender`; unset is fine) and, per gender, how much of the normal rate their friendship
// and romance grow (`att`; the multiplier itself is `attraction()` in rel.ts, applied to every gain). Also where a
// person's own settings come from at a new game (their card's Mundi data, a cast preset, the world's example cast),
// cleaned of anything a hand-edited file might hold; suggestions read from a card by the AI; and the AI's line about
// the gender, pronouns and attraction of the people in the scene.
import type { Save, Resident } from '../core/store.js';
import { getWorld, systemOn, type WorldDef, type GenderDef, type ExampleCharacter, type IntimateProfile } from '../core/world.js';
import { DEFAULT_GENDERS } from '../core/presets.js';
import { relOf, idOf, YOU, type Person, type Attraction } from './rel.js';
import { isMinor } from './family.js';
import { quiet } from '../st/bridge.js';

export const gendersOf = (w: WorldDef | null | undefined): GenderDef[] => w?.genders ?? DEFAULT_GENDERS;
export const genderDef = (w: WorldDef | null | undefined, id: string | undefined) => (id ? gendersOf(w).find(x => x.id === id) : undefined);
export const genderOf = (g: Save, a: string): string | undefined => relOf(g).people[idOf(g, a)]?.gender;
// "women", for sentences (a gender without a plural: "<name> people").
export const pluralOf = (d: GenderDef) => (d.plural?.trim() || `${d.name.toLowerCase()} people`);

/* ---------- a person's own settings, from outside the save ---------- */

const PACES = ['slow', 'normal', 'fast'];
const PRESETS = ['free', 'passionate', 'steady', 'slow', 'devoted', 'custom'];
const RNEEDS = ['interest', 'crush', 'infatuated'], FNEEDS = ['none', 'friend', 'good', 'best'];
const num01 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined);
// Only the settings a person carries between games (gender, pace, relationship and intimacy styles, an intimate
// profile), checked one by one; `null` (how a card forgets a setting) and anything unknown are dropped. Undefined when nothing is left.
export function cleanPerson(raw: any): Person | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const p: Person = {};
    if (typeof raw.gender === 'string' && raw.gender.trim()) p.gender = raw.gender.trim().slice(0, 40);
    const pace: any = {};
    for (const m of ['f', 'r']) if (PACES.includes(raw.pace?.[m])) pace[m] = raw.pace[m];
    if (Object.keys(pace).length) p.pace = pace;
    if (raw.style === 'exclusive' || raw.style === 'open') p.style = raw.style;
    const i = raw.intimacy, intim: any = {};
    if (PRESETS.includes(i?.preset)) intim.preset = i.preset;
    if (RNEEDS.includes(i?.r)) intim.r = i.r;
    if (FNEEDS.includes(i?.f)) intim.f = i.f;
    if (i?.casual === false) intim.casual = false;
    if (Object.keys(intim).length) p.intimacy = intim;
    const att: Record<string, { f?: number; r?: number }> = {};
    for (const [k, v] of Object.entries<any>(raw.att ?? raw.attraction ?? {})) {
        const f = num01(v?.f), r = num01(v?.r);
        if (f !== undefined && f < 1) (att[k] ??= {}).f = f;
        if (r !== undefined && r < 1) (att[k] ??= {}).r = r;
    }
    if (Object.keys(att).length) p.att = att;
    const intimate = cleanIntimate(raw.intimate);
    if (intimate) p.intimate = intimate;
    return Object.keys(p).length ? p : undefined;
}
// (E15) An intimate profile: short lines and short lists of plain words, nothing else; undefined when empty.
export const INTIMATE_LINES = ['experience', 'wants', 'drawnTo', 'flirts', 'dynamic'] as const;
export const INTIMATE_LISTS = ['prefs', 'limits'] as const;
export function cleanIntimate(raw: any): IntimateProfile | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
    const p: IntimateProfile = {};
    for (const k of INTIMATE_LINES) { const v = line(raw[k], 400); if (v) p[k] = v; }
    for (const k of INTIMATE_LISTS) { const v = (Array.isArray(raw[k]) ? raw[k] : []).map((x: unknown) => line(x, 120)).filter(Boolean).slice(0, 12); if (v.length) p[k] = v; }
    return Object.keys(p).length ? p : undefined;
}
export const exampleSettings = (ex: ExampleCharacter | undefined) => cleanPerson(ex);
// Puts carried settings on someone's entry in the save (their age, minor flag… stay).
export function applyPerson(g: Save, a: string, p: Person | undefined) {
    if (!p) return;
    const people = relOf(g).people, id = idOf(g, a);
    people[id] = { ...(people[id] ?? {}), ...structuredClone(p) };
}

/* ---------- suggestions from a card (nothing is set until the player confirms) ---------- */

const INTIMACY_WORDS: [RegExp, string][] = [[/free/, 'free'], [/passion/, 'passionate'], [/steady/, 'steady'], [/slow/, 'slow'], [/devot/, 'devoted']];
// The AI's four lines read back: a gender of the world, who they're attracted to, an intimacy style, "only with a
// partner". Anything unknown or unreadable is left out; undefined when nothing is left.
export function parseSuggestion(text: string, gs: GenderDef[]): Person | undefined {
    const line = (label: string) => (new RegExp(`^\\W*${label}\\W*:\\s*(.+)$`, 'im').exec(text)?.[1] ?? '').trim().toLowerCase().replace(/[.*_]+$/g, '');
    const find = (s: string) => gs.find(d => [d.id, d.name, d.plural ?? '', pluralOf(d)].some(n => n && s.replace(/[^a-z-]/g, '') === n.toLowerCase().replace(/[^a-z-]/g, '')));
    const p: Person = {};
    const gender = line('gender');
    if (gender && !/unknown/.test(gender)) { const d = find(gender); if (d) p.gender = d.id; }
    const to = line('attracted to');
    if (to && !/unknown/.test(to)) {
        if (/no ?one|nobody|none/.test(to)) p.att = Object.fromEntries(gs.map(d => [d.id, { r: 0 }]));
        else if (!/every|anyone|all/.test(to)) {
            const yes = to.split(/,|\band\b|\//).map(s => find(s.trim())).filter(Boolean) as GenderDef[];
            if (yes.length) { const att = Object.fromEntries(gs.filter(d => !yes.includes(d)).map(d => [d.id, { r: 0 }])); if (Object.keys(att).length) p.att = att; }
        }
    }
    const intim = line('intimacy');
    const preset = INTIMACY_WORDS.find(([re]) => re.test(intim))?.[1];
    if (preset && preset !== 'steady') p.intimacy = { preset: preset as any };
    if (/^yes/.test(line('only with a partner'))) p.intimacy = { ...(p.intimacy ?? {}), casual: false };
    return Object.keys(p).length ? p : undefined;
}
// One quiet AI call about one card (the "later" lane: it waits for anything the player is waiting on).
export async function suggestFromCard(name: string, card: string, gs: GenderDef[]): Promise<Person | undefined> {
    const names = gs.map(d => d.name.toLowerCase()), plurals = gs.map(pluralOf);
    const out = await quiet(`This is a character card for ${name}:\n"""\n${card.slice(0, 3000)}\n"""\n\nFrom what the card says (and only that), answer about ${name} in exactly these four lines, with "unknown" wherever the card doesn't say:\n` +
        `Gender: ${names.join(', ')}, or unknown\nAttracted to: a list of ${plurals.join(', ')}; or everyone, no one, or unknown\n` +
        'Intimacy: free spirit (a spark is enough), passionate (real attraction, no friendship needed), steady, slow to trust (only with close friends), devoted (only when deeply in love), or unknown\n' +
        'Only with a partner: yes (no casual intimacy at all), no, or unknown', 120, 'You read character cards and answer in the exact format asked, with no other words.');
    return parseSuggestion(out, gs);
}

/* ---------- for the AI ---------- */

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// Someone's attraction in plain words, when it isn't the usual ("Saya is attracted to men; only rarely to women",
// "Kaho is not attracted to women"); and friendships that come slowly or never with a gender. No numbers.
export function attractionWords(name: string, att: Attraction | undefined, gs: GenderDef[], romance = true): string {
    if (!att || !gs.length) return '';
    const v = (d: GenderDef, m: 'f' | 'r') => att[d.id]?.[m] ?? 1;
    const out: string[] = [];
    if (romance && gs.some(d => v(d, 'r') < 1)) {
        const band = (lo: number, hi: number) => gs.filter(d => v(d, 'r') > lo && v(d, 'r') <= hi).map(pluralOf);
        const full = gs.filter(d => v(d, 'r') >= 1).map(pluralOf), some = band(0.5, 0.99999), rare = band(0, 0.5), none = gs.filter(d => v(d, 'r') <= 0).map(pluralOf);
        if (!full.length && !some.length && !rare.length) out.push(`${name} is not attracted to anyone`);
        else if (!some.length && !rare.length) out.push(full.length < none.length ? `${name} is only attracted to ${list(full)}` : `${name} is not attracted to ${list(none)}`);
        else {
            const segs: string[] = [];
            const seg = (xs: string[], first: string, later: string) => { if (xs.length) segs.push(`${segs.length ? later : first} ${list(xs)}`); };
            seg(full, 'attracted to', 'attracted to'); seg(some, 'only sometimes attracted to', 'only sometimes to');
            seg(rare, 'only rarely attracted to', 'only rarely to'); seg(none, 'not attracted to', 'not to');
            out.push(`${name} is ${segs.join('; ')}`);
        }
    }
    const slow = gs.filter(d => v(d, 'f') > 0 && v(d, 'f') < 1).map(pluralOf), never = gs.filter(d => v(d, 'f') <= 0).map(pluralOf);
    if (slow.length) out.push(`${name} is slow to make friends with ${list(slow)}`);
    if (never.length) out.push(`${name} never warms to ${list(never)} as friends`);
    return out.join('. ');
}
// The gender (and pronouns) of everyone in the scene who has one, you included, and the attraction of the people here
// when it isn't the usual (never for minors).
export function genderLine(g: Save, w: WorldDef, present: Resident[]): string {
    const say = (name: string, id: string | undefined) => {
        const d = genderDef(w, id); if (!d) return '';
        return `${name}: ${d.name.toLowerCase()}${d.pronouns?.trim() ? ` (${d.pronouns.trim()})` : ''}`;
    };
    const here = present.filter(r => idOf(g, r.avatar) !== YOU);
    const parts = [say('{{user}}', genderOf(g, YOU)), ...here.map(r => say(r.name, genderOf(g, r.avatar)))].filter(Boolean);
    const gs = gendersOf(w), romance = systemOn(w, 'romance');
    const att = here.filter(r => !isMinor(g, r.avatar)).map(r => attractionWords(r.name, relOf(g).people[idOf(g, r.avatar)]?.att, gs, romance)).filter(Boolean);
    return [parts.length ? `Gender: ${parts.join('; ')}.` : '', att.length ? `${att.join('. ')}.` : ''].filter(Boolean).join(' ');
}
// For a "no" that attraction decides: "isn't attracted to men (like {{user}})".
export function notAttractedWords(g: Save, name: string): string {
    const d = genderDef(getWorld(g.world), genderOf(g, YOU));
    return d ? `${name} isn't attracted to ${pluralOf(d)} (like {{user}})` : `${name} isn't attracted to {{user}}`;
}
