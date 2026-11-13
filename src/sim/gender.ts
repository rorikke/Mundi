// Genders and attraction (requirements G-1…G-9): each world has its list (the style's when it has none), each person
// may have one (`rel.people[id].gender`; unset is fine) and, per gender, how much of the normal rate their friendship
// and romance grow (`att`; the multiplier itself is `attraction()` in rel.ts, applied to every gain). Also where a
// person's own settings come from at a new game (their card's Mundi data, a cast preset, the world's example cast),
// cleaned of anything a hand-edited file might hold; suggestions read from a card by the AI; and the AI's line about
// the gender, pronouns and attraction of the people in the scene. Someone whose romance isn't set follows your gender
// when you are drawn to theirs, and is straight when you aren't (`fitToYou`): "everyone" is only ever chosen.
import { adultOn, game, type Save, type Resident } from '../core/store.js';
import { getWorld, systemOn, INTIMATE_ROLES, INTIMATE_DRIVES, type WorldDef, type GenderDef, type ExampleCharacter, type IntimateProfile } from '../core/world.js';
import { DEFAULT_GENDERS } from '../core/presets.js';
import { relOf, idOf, pairOf, YOU, type Person, type Attraction } from './rel.js';
import { saveSeed } from './relations.js';
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
    if (raw.attMode === 'you' || raw.attMode === 'set') p.attMode = raw.attMode;
    const intimate = cleanIntimate(raw.intimate);
    if (intimate) p.intimate = intimate;
    return Object.keys(p).length ? p : undefined;
}
// (E15) An intimate profile: short lines and short lists of plain words, nothing else; undefined when empty.
export const INTIMATE_LINES = ['experience', 'wants', 'drawnTo', 'flirts', 'dynamic'] as const;
// their body and how they are in bed take more words than a line
export const INTIMATE_LONG = ['body', 'inBed'] as const;
export const INTIMATE_LONG_MAX = 800;
export const INTIMATE_LISTS = ['prefs', 'limits'] as const;
export function cleanIntimate(raw: any): IntimateProfile | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
    const p: IntimateProfile = {};
    for (const k of INTIMATE_LINES) { const v = line(raw[k], 400); if (v) p[k] = v; }
    for (const k of INTIMATE_LONG) { const v = line(raw[k], INTIMATE_LONG_MAX); if (v) p[k] = v; }
    for (const k of INTIMATE_LISTS) { const v = (Array.isArray(raw[k]) ? raw[k] : []).map((x: unknown) => line(x, 120)).filter(Boolean).slice(0, 12); if (v.length) p[k] = v; }
    // who leads and how often they want it: one of the known words, nothing else
    if (INTIMATE_ROLES.includes(raw.role)) p.role = raw.role;
    if (INTIMATE_DRIVES.includes(raw.drive)) p.drive = raw.drive;
    return Object.keys(p).length ? p : undefined;
}
export const exampleSettings = (ex: ExampleCharacter | undefined) => cleanPerson(ex);
/* ---------- romance that follows your gender ---------- */

// Their romance follows your gender: chosen so, or nothing chosen at all (no romance value).
export const followsYou = (p: Person | undefined) => p?.attMode === 'you' || (p?.attMode !== 'set' && !Object.values(p?.att ?? {}).some(v => typeof v?.r === 'number'));
// Straight, for someone of gender `id`: man for woman and woman for man (by id, else by pronouns she/he), the other
// one in a world of two genders; undefined when there is no such gender (non-binary).
const OPPOSITE: Record<string, string> = { woman: 'man', man: 'woman', she: 'he', he: 'she' };
export function oppositeOf(gs: GenderDef[], id: string): string | undefined {
    const d = gs.find(x => x.id === id); if (!d) return undefined;
    if (OPPOSITE[d.id] && gs.some(x => x.id === OPPOSITE[d.id])) return OPPOSITE[d.id];
    const pr = (x: GenderDef) => (x.pronouns ?? '').split('/')[0].trim().toLowerCase();
    const byPr = gs.filter(x => OPPOSITE[pr(d)] && pr(x) === OPPOSITE[pr(d)]);
    if (byPr.length === 1) return byPr[0].id;
    return gs.length === 2 ? gs.find(x => x.id !== id)?.id : undefined;
}
// A fixed draw per person and game, 0..1 (the save's seed, so another game draws again).
const draw = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
// Most people aren't attracted to everyone, and most should be able to fall for you. Whoever follows your gender is
// drawn to it when you are drawn to theirs: your own romance value for their gender is the share of them who are (all
// of them at 100%, none at 0%: "Only: Women" leaves every man straight, "No one" everyone; 20%: about one in five, a
// fixed draw per person and game). The others are straight (`oppositeOf`; with no opposite, as if they were drawn to
// you). Either way they stay drawn to the genders of anyone they are or were with (a couple, something casual, an
// ex), so no relationship is cut off; a crush alone doesn't count (in play it's mostly chance, and a world that wants
// one across genders sets the person's attraction). Romance toward every other gender is 0.
// Friendship values stay. Only `only` (avatars) when given; never the person you play. Done once, when people come
// into a game (a new game, newcomers a running game takes in): the save keeps only the values (no `attMode`), and
// nothing fits them again later (the People tab, "Play as"). With your gender unset, those drawn to you can fall for
// anyone.
export function fitToYou(g: Save, w: WorldDef | null | undefined, only?: string[]) {
    const people = relOf(g).people, me = people[YOU], mine = me?.gender, gs = gendersOf(w), seed = saveSeed(g, w);
    const share = (gid: string) => { const v = me?.att?.[gid]?.r; return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; };
    const all = Object.keys(g.cast).map(a => idOf(g, a)).filter(id => id !== YOU);
    for (const x of only ? only.map(a => idOf(g, a)).filter(id => id !== YOU && g.cast[id]) : all) {
        const p = people[x];
        if (!followsYou(p)) { if (p?.attMode) delete p.attMode; continue; }
        const gx = p?.gender, s = gx ? share(gx) : 1;
        const toYou = s >= 1 || (s > 0 && draw(`${seed}|drawn to you|${x}`) < s);
        const straight = gx && !toYou ? oppositeOf(gs, gx) : undefined;
        const keep = new Set<string>(straight ? [straight] : mine ? [mine] : gs.map(d => d.id));
        for (const y of all) {
            const gy = people[y]?.gender, pr = pairOf(g, x, y);
            if (y !== x && gy && (pr?.status || pr?.was)) keep.add(gy);
        }
        const att: Attraction = {};
        for (const [k, v] of Object.entries(p?.att ?? {})) if (typeof v?.f === 'number' && v.f < 1) att[k] = { f: v.f };
        for (const d of gs) if (!keep.has(d.id)) (att[d.id] ??= {}).r = 0;
        const next: Person = { ...(p ?? {}) };
        delete next.attMode;
        if (Object.keys(att).length) next.att = att; else delete next.att;
        people[x] = next;
    }
}

// Puts carried settings on someone's entry in the save (their age, minor flag… stay).
export function applyPerson(g: Save, a: string, p: Person | undefined) {
    if (!p) return;
    const people = relOf(g).people, id = idOf(g, a);
    people[id] = { ...(people[id] ?? {}), ...structuredClone(p) };
}

/* ---------- suggestions from a card (nothing is set until the player confirms) ---------- */

const INTIMACY_WORDS: [RegExp, string][] = [[/free/, 'free'], [/passion/, 'passionate'], [/steady/, 'steady'], [/slow/, 'slow'], [/devot/, 'devoted']];
// The AI's lines read back: a gender of the world, who they're attracted to, an intimacy style, "only with a partner"
// (and, with adult content, a role, a drive, likes and limits). Anything unknown or unreadable is left out; undefined
// when nothing is left.
export function parseSuggestion(text: string, gs: GenderDef[], adult = false): Person | undefined {
    const raw = (label: string) => (new RegExp(`^\\W*${label}\\W*:[\\s*_]*(.+)$`, 'im').exec(text)?.[1] ?? '').trim();
    const line = (label: string) => raw(label).toLowerCase().replace(/[.*_]+$/g, '');
    const find = (s: string) => gs.find(d => [d.id, d.name, d.plural ?? '', pluralOf(d)].some(n => n && s.replace(/[^a-z-]/g, '') === n.toLowerCase().replace(/[^a-z-]/g, '')));
    const p: Person = {};
    const gender = line('gender');
    if (gender && !/unknown/.test(gender)) { const d = find(gender); if (d) p.gender = d.id; }
    const to = line('attracted to');
    if (to && !/unknown/.test(to)) {
        if (/no ?one|nobody|none/.test(to)) p.att = Object.fromEntries(gs.map(d => [d.id, { r: 0 }]));
        else if (/every|anyone|all/.test(to)) p.attMode = 'set';
        else {
            const yes = to.split(/,|\band\b|\//).map(s => find(s.trim())).filter(Boolean) as GenderDef[];
            if (yes.length) { const att = Object.fromEntries(gs.filter(d => !yes.includes(d)).map(d => [d.id, { r: 0 }])); if (Object.keys(att).length) p.att = att; else p.attMode = 'set'; }
        }
    }
    const intim = line('intimacy');
    const preset = INTIMACY_WORDS.find(([re]) => re.test(intim))?.[1];
    if (preset && preset !== 'steady') p.intimacy = { preset: preset as any };
    if (/^yes/.test(line('only with a partner'))) p.intimacy = { ...(p.intimacy ?? {}), casual: false };
    if (adult) {
        // only what the card says is kept here; sim/profiles.ts fills the rest from the world's pool
        const i: any = {}, rl = line('role in bed'), dl = line('drive');
        const role = INTIMATE_ROLES.find(r => new RegExp(`^${r}\\b`).test(rl)) ?? (/^(versatile|either)/.test(rl) ? 'switch' : undefined);
        if (role) i.role = role;
        const drive = INTIMATE_DRIVES.find(d => new RegExp(`^${d}\\b`).test(dl));
        if (drive) i.drive = drive;
        const items = (label: string, max: number) => raw(label).replace(/[.*_]+$/g, '').split(/;|,/).map(x => x.trim()).filter(x => x && x.length <= 80 && !/^(unknown|none|nothing|n\/a|not said)\.?$/i.test(x)).slice(0, max);
        const likes = items('likes', 5), limits = items('limits', 3).filter(l => !likes.some(k => k.toLowerCase() === l.toLowerCase()));
        if (likes.length) i.prefs = likes;
        if (limits.length) i.limits = limits;
        const clean = cleanIntimate(i);
        if (clean) p.intimate = clean;
    }
    return Object.keys(p).length ? p : undefined;
}
// One quiet AI call about one card (the "later" lane: it waits for anything the player is waiting on). With adult
// content on (`adult`; by default the open game's) it asks four more lines: their role in bed, their drive, what they
// like and what they won't do.
export async function suggestFromCard(name: string, card: string, gs: GenderDef[], adult: boolean = adultOn(game())): Promise<Person | undefined> {
    const names = gs.map(d => d.name.toLowerCase()), plurals = gs.map(pluralOf);
    const out = await quiet(`This is a character card for ${name}:\n"""\n${card.slice(0, 3000)}\n"""\n\nFrom what the card says (and only that), answer about ${name} in exactly these ${adult ? 'eight' : 'four'} lines, with "unknown" wherever the card doesn't say:\n` +
        `Gender: ${names.join(', ')}, or unknown\nAttracted to: a list of ${plurals.join(', ')}; or everyone, no one, or unknown\n` +
        'Intimacy: free spirit (a spark is enough), passionate (real attraction, no friendship needed), steady, slow to trust (only with close friends), devoted (only when deeply in love), or unknown\n' +
        'Only with a partner: yes (no casual intimacy at all), no, or unknown' +
        (adult ? '\nRole in bed: lead (takes charge), follow (likes being led), switch (either), or unknown\nDrive: low, average, high (how often they want sex), or unknown\nLikes: up to five things they enjoy in intimacy, separated by semicolons, or unknown\nLimits: up to three things they will not do, separated by semicolons, or unknown' : ''),
        adult ? 260 : 120, 'You read character cards and answer in the exact format asked, with no other words.');
    return parseSuggestion(out, gs, adult);
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
