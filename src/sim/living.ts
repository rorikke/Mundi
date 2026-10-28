// The living world: approval (what people think of how you behave), lore that switches on with the state of
// the world, people's own lives moving on over the weeks, and rumors that travel between people.
import { personaName } from '../st/bridge.js';
import { nowAbs, type Save, type Resident } from '../core/store.js';
import { systemOn, isScenario, type WorldDef, type LoreWhen, type Occupation } from '../core/world.js';
import { exampleOf, adultOn } from './dayplan.js';
import { onDay } from './hooks.js';
import { residents, whereNow, presentAt } from './people.js';
import { regionOf, regionState } from './worldstate.js';
import { whenHolds, whenPlace, whenRegionOk, personNamed } from './when.js';
import { note, facts, factText } from './facts.js';
import { homeSpot, takenHomes } from './homes.js';
import { lifeMoment } from './happenings.js';
import { couplePairs, casualPairs, pastPairs, pastWords, fr } from './rel.js';
import { placeOf } from './places.js';
import type { FamilyType } from '../core/feel.js';

const rnd = (g: Save, salt: string) => { let h = 2166136261; const s = `${g.world}|${g.day}|${salt}`; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const L = (g: Save) => { const x = ((g as any).living ??= {}); x.approval ??= {}; x.rumors ??= []; return x as { approval: Record<string, number>; rumors: Rumor[] }; };

/* ---------- approval (55): what people think of the way you act, -100..100 ---------- */

export const approvalOf = (g: Save, avatar: string) => L(g).approval[avatar] ?? 0;
export function approve(g: Save, avatar: string, delta: number) { const a = L(g).approval; a[avatar] = Math.max(-100, Math.min(100, (a[avatar] ?? 0) + delta)); }
// Everyone who hears about it reacts a little (kind acts raise it, broken promises lower it).
export function approveAll(g: Save, delta: number, except: string[] = []) { for (const r of residents(g)) if (r.met && !except.includes(r.avatar)) approve(g, r.avatar, delta); }
export const approvalWord = (v: number) => (v >= 50 ? 'Admires you' : v >= 15 ? 'Approves of you' : v > -15 ? 'Neutral' : v > -50 ? 'Disapproves' : 'Despises your ways');
export function approvalLine(g: Save, present: Resident[]) {
    const p = present.filter(r => Math.abs(approvalOf(g, r.avatar)) >= 15);
    return p.length ? `What they think of how {{user}} behaves: ${p.map(r => `${r.name} — ${approvalWord(approvalOf(g, r.avatar)).toLowerCase()}`).join('; ')}.` : '';
}

/* ---------- lore that switches on with the world (75) ---------- */

// A world's lore entry can have `when` (a condition, sim/when.ts): sent with the scene while it holds. `rumor: true`
// makes it a rumor that goes around instead (people mention it; see the rumor pool below). Each entry rolls its own
// `chance` dice (salted with its index), so the same lore is on all day.
export type { LoreWhen };
export function activeWorldLore(g: Save, w: WorldDef): string[] {
    return w.lore.filter((e, i) => !!e.when && !!e.content && !e.rumor && whenHolds(g, w, e.when, { key: `lore|${i}` })).map(e => e.content);
}

/* ---------- people's own lives (76) ---------- */

// Couples between people of the world (the pairs in the relationships store, sim/rel.ts). They form from feelings
// (sim/relations.ts), not here.
export const couples = (g: Save): [string, string][] => couplePairs(g).map(p => [p.a, p.b]);
// The world's own people stay themselves (E25): their job and home change only through their stories or the player
// (an example character with `anchored: false` may change by chance like anyone).
const anchored = (w: WorldDef, r: Resident) => { const ex = exampleOf(w, r); return !!ex && ex.anchored !== false; };
// A job someone could just take: one that asks for no training (courses, skills, a hobby level), that the world's
// people can hold, and that this game has (adult jobs only with adult content on).
const takeable = (g: Save, w: WorldDef, o: Occupation) => !o.courses?.length && !Object.keys(o.skills ?? {}).length && !o.hobby && !o.needs?.length && o.hireable !== false && (!o.adult || adultOn(g)) && w.places.some(p => p.id === o.place);
function lifeGoesOn(g: Save, w: WorldDef): string[] {
    const out: string[] = [];
    const people = residents(g).filter(r => !anchored(w, r));
    if (!people.length) return out;
    // about once a week someone's life changes: a new job or a new home
    if (rnd(g, 'life') > 0.15) return out;
    const r = people[Math.floor(rnd(g, 'who') * people.length)];
    const kind = rnd(g, 'kind');
    const tell = (t: string, a: string[]) => { if (r.met) out.push(a.reduce((s, x, i) => s.replace(`{${i}}`, x), t)); };
    const jobs = w.occupations.filter(o => takeable(g, w, o));
    if (kind < 0.35 && jobs.length) {
        const o = jobs[Math.floor(rnd(g, 'job') * jobs.length)];
        if (o.id !== r.occupation && systemOn(w, 'jobs')) {
            r.occupation = o.id; delete ((g as any).living?.ranks ?? {})[r.avatar];
            note(g, '{0} started a new job: {1}.', [r.name, o.name], [r.avatar], o.place, 'life'); tell('{0} started a new job: {1}.', [r.name, o.name]);
            lifeMoment(g, w, r.avatar, `${r.name} started a new job: ${o.name}.`, 'good');
        }
    } else if (kind < 0.6) {
        const z = w.homes.zones[Math.floor(rnd(g, 'zone') * w.homes.zones.length)];
        // the whole household moves together (someone who lives with you stays; nobody moves away from one of the world's
        // own people)
        const house = residents(g).filter(x => homeKey(x.home) === homeKey(r.home));
        if (homeKey(r.home) !== homeKey(g.player.home) && !house.some(x => anchored(w, x))) {
            const taken = takenHomes(g);
            const spot = homeSpot(w, z.id, taken, g.player.home);
            for (const x of house) x.home = { ...spot };
            normalizeHomes(g);
            note(g, '{0} moved to {1}.', [r.name, z.name], [r.avatar], `home:${r.avatar}`, 'life'); tell('{0} moved to {1}.', [r.name, z.name]);
        }
    }
    return out;
}
export function couplesLine(g: Save, present: Resident[]) {
    const here = new Set(present.map(r => r.avatar));
    const c = couplePairs(g).filter(p => here.has(p.a) || here.has(p.b));
    const word: Record<string, string> = { dating: 'are dating', engaged: 'are engaged', married: 'are married' };
    const casual = casualPairs(g).filter(p => here.has(p.a) || here.has(p.b)).map(p => `${g.cast[p.a].name} and ${g.cast[p.b].name} have something casual (not a couple)`);
    const past = pastPairs(g).filter(p => here.has(p.a) || here.has(p.b)).map(p => `${g.cast[p.a].name} and ${g.cast[p.b].name} ${pastWords(g, p.was)}`);
    const all = [...c.map(p => `${g.cast[p.a].name} and ${g.cast[p.b].name} ${word[p.status] ?? 'are dating'}`), ...casual, ...past];
    return all.length ? `Relationships between people: ${all.join('; ')}.` : '';
}

/* ---------- rumors (77) ---------- */

// The rumor pool: what goes around. A rumor starts from something juicy that happened (to you or to anyone), or
// from the world's own lore marked as a rumor; it spreads between people who spend time at the same places
// (faster where the town is tense), cools down day by day, and gets garbled as it passes from mouth to mouth.
// `hops`: how many mouths it went through to reach each person (0: they saw it). '__you' in knownBy: you heard it.
// (E31) `about`: the people it's about (avatars): they never hear it, and when it's `secret` their close friends
// (good friends or closer) don't pass it on. `thread`: a thread's stage started it (overhearing it tells you the
// thread, sim/threads.ts).
export interface Rumor { id: string; text: string; at: number; knownBy: string[]; heat?: number; hops?: Record<string, number>; world?: boolean; heard?: number; about?: string[]; secret?: boolean; thread?: string }
// Close enough to keep a friend's secret: a good friend or closer.
const LOYAL = 55;
const GOSSIP = ['love', 'party', 'plan', 'life', 'goal', 'work', 'crisis'];
export const YOU = '__you';
export const rumorPool = (g: Save): Rumor[] => L(g).rumors;
const heatOf = (g: Save, r: Rumor) => r.heat ?? Math.max(0, 100 - 8 * Math.floor((nowAbs(g) - r.at) / 1440));
function spreadRumors(g: Save, w: WorldDef): string[] {
    if (!systemOn(w, 'rumors')) return [];
    const st = L(g);
    const yesterday = nowAbs(g) - 1440;
    for (const f of facts(g).filter(f => f.at >= yesterday && f.who.length && GOSSIP.includes(f.kind ?? '') && !st.rumors.some(r => r.id === f.id))) {   // somebody has to have seen it
        st.rumors.push({ id: f.id, text: factText(f, personaName()), at: f.at, knownBy: [...f.who], heat: 100, hops: Object.fromEntries(f.who.map(a => [a, 0])) });
    }
    seedWorldRumors(g, w);
    const people = residents(g);
    const spots = (r: Resident) => new Set([...r.leisure, w.occupations.find(o => o.id === r.occupation)?.place ?? '', whereNow(g, w, r)].filter(Boolean));
    for (const rumor of st.rumors) {
        const heat = heatOf(g, rumor);
        const tension = systemOn(w, 'living') ? regionState(g, w, regionOf(g, w, rumor.knownBy.find(a => g.cast[a]) ? `home:${rumor.knownBy.find(a => g.cast[a])}` : g.player.loc)).tension : 0;
        const chance = Math.min(0.9, 0.4 * Math.min(1.2, heat / 100 + 0.2) * (1 + tension / 100));
        rumor.hops ??= {};
        for (const knower of people.filter(p => rumor.knownBy.includes(p.avatar))) {
            if (rumor.secret && rumor.about?.some(a => fr(g, knower.avatar, a) >= LOYAL)) continue;   // they keep it to themselves
            const ks = spots(knower);
            for (const other of people) {
                if (rumor.knownBy.includes(other.avatar) || rumor.about?.includes(other.avatar)) continue;   // nobody tells you gossip about yourself
                if ([...spots(other)].some(s => ks.has(s)) && rnd(g, `${rumor.id}|${other.avatar}`) < chance) {
                    rumor.knownBy.push(other.avatar);
                    rumor.hops[other.avatar] = (rumor.hops[knower.avatar] ?? 1) + 1;
                }
            }
        }
        rumor.heat = Math.max(0, heat - 8);
    }
    // at most 40 going around: the hottest stay (what really happened outlives the world's own gossip)
    const live = st.rumors.filter(r => nowAbs(g) - r.at < 14 * 1440 && heatOf(g, r) > 0);
    const rank = (r: Rumor) => heatOf(g, r) - (r.world ? 25 : 0);
    const keep = new Set([...live].sort((a, b) => rank(b) - rank(a) || b.at - a.at).slice(0, 40));
    st.rumors = live.filter(r => keep.has(r));
    return [];
}
// The world's lore marked as a rumor starts going around when its conditions hold (two people start it, in its
// region if it has one); once it has died out it can start again another day. A few a day at most (a world with many
// would otherwise crowd out what really happens). One about someone (E31) is never started by them; adult ones only
// with adult content on.
const WORLD_RUMORS_A_DAY = 3;
function seedWorldRumors(g: Save, w: WorldDef) {
    const st = L(g);
    let n = 0;
    const order = w.lore.map((e, i) => [e, i] as const).filter(([e]) => e.rumor).sort((a, b) => rnd(g, `seed|${a[1]}`) - rnd(g, `seed|${b[1]}`));
    order.forEach(([e, i]) => {
        if (n >= WORLD_RUMORS_A_DAY || !e.content || (e.adult && !adultOn(g))) return;
        const id = `lore:${i}`;
        if (st.rumors.some(r => r.id === id)) return;
        // only what holds for the whole day counts (where the player is doesn't), and a quarter of the days by default
        const c = e.when ?? {};
        if (!whenHolds(g, w, c, { key: `lore|rumor|${i}`, day: true, place: whenPlace(c) ?? g.player.loc, chance: 0.25 })) return;
        const about = aboutOf(g, e.about);
        const pool = residents(g).filter(r => !about.includes(r.avatar) && (whenRegionOk(c, regionOf(g, w, `home:${r.avatar}`)) || whenRegionOk(c, regionOf(g, w, w.occupations.find(o => o.id === r.occupation)?.place ?? ''))));
        if (!pool.length) return;
        const first = [...pool].sort((a, b) => rnd(g, `${id}|${a.avatar}`) - rnd(g, `${id}|${b.avatar}`)).slice(0, 2);
        st.rumors.push({ id, text: e.content, at: nowAbs(g), knownBy: first.map(r => r.avatar), heat: 100, hops: Object.fromEntries(first.map(r => [r.avatar, 1])), world: true, ...(about.length ? { about } : {}), ...(e.secret ? { secret: true } : {}) });
        n++;
    });
}
// Who a rumor is about: names of the world's people (one, or several with commas), as avatars in this save.
const aboutOf = (g: Save, names: string | string[] | undefined) => (Array.isArray(names) ? names : (names ?? '').split(',')).map(n => personNamed(g, n.trim())?.avatar).filter((a): a is string => !!a);
/** (E31) Starts a rumor from something that just happened (an action's outcome, a work result, a story's choice, a
 *  thread's stage): the people at `place` know it first (or two whose days pass through there), never the ones it's
 *  about. `you`: the player was there (it isn't news to you). Returns it, or null when nobody is there to tell it or
 *  the rumors system is off. */
export function startRumor(g: Save, w: WorldDef, text: string, place: string, o: { about?: string | string[]; secret?: boolean; thread?: string; you?: boolean; id?: string } = {}): Rumor | null {
    if (!systemOn(w, 'rumors') || !text.trim()) return null;
    const st = L(g), id = o.id ?? `r${nowAbs(g)}|${text.slice(0, 24)}`;
    if (st.rumors.some(r => r.id === id)) return null;
    const about = aboutOf(g, o.about);
    let first = presentAt(g, w, place).filter(r => !about.includes(r.avatar)).map(r => r.avatar);
    if (!first.length) {
        const there = (r: Resident) => r.leisure.includes(place) || w.occupations.find(x => x.id === r.occupation)?.place === place;
        first = residents(g).filter(r => !about.includes(r.avatar) && there(r)).sort((a, b) => rnd(g, `${id}|${a.avatar}`) - rnd(g, `${id}|${b.avatar}`)).slice(0, 2).map(r => r.avatar);
    }
    if (!first.length) return null;
    const rumor: Rumor = { id, text, at: nowAbs(g), knownBy: [...first, ...(o.you ? [YOU] : [])], heat: 100, hops: Object.fromEntries(first.map(a => [a, 1])), ...(about.length ? { about } : {}), ...(o.secret ? { secret: true } : {}), ...(o.thread ? { thread: o.thread } : {}) };
    if (o.you) rumor.hops![YOU] = 0;
    st.rumors.push(rumor);
    return rumor;
}
// How a rumor sounds after passing through some mouths.
const garble = (hops: number) => (hops >= 4 ? ' (heard it fourth- or fifth-hand: details may be wrong or exaggerated)' : hops >= 2 ? ' (secondhand)' : '');
export function rumorLines(g: Save, present: Resident[]) {
    const out: string[] = [];
    for (const r of present) {
        const heard = L(g).rumors.filter(x => x.knownBy.includes(r.avatar) && !x.about?.includes(r.avatar) && !facts(g).find(f => f.id === x.id)?.who.includes(r.avatar)).slice(-2);
        if (heard.length) out.push(`${r.name} has heard around town: ${heard.map(h => `${h.text}${garble(h.hops?.[r.avatar] ?? 1)}`).join(' ')}`);
    }
    return out;
}
// You overhear what the people around you talk about (in public places, now and then).
export function overhear(g: Save, w: WorldDef, present: Resident[]): Rumor[] {
    if (!systemOn(w, 'rumors') || g.player.loc.startsWith('home:')) return [];
    const got: Rumor[] = [];
    for (const rumor of L(g).rumors) {
        if (rumor.knownBy.includes(YOU)) continue;
        const teller = present.find(r => rumor.knownBy.includes(r.avatar));
        if (!teller || rnd(g, `hear|${rumor.id}|${g.minutes}`) > 0.3) continue;
        rumor.knownBy.push(YOU); rumor.hops ??= {}; rumor.hops[YOU] = (rumor.hops[teller.avatar] ?? 1) + 1; rumor.heard = nowAbs(g);
        got.push(rumor);
        break;   // one at a time
    }
    return got;
}
// What you have heard (newest first), for the Journal.
export const heardRumors = (g: Save) => L(g).rumors.filter(r => r.knownBy.includes(YOU)).sort((a, b) => (b.heard ?? b.at) - (a.heard ?? a.at));
export const rumorSource = (r: Rumor) => garble(r.hops?.[YOU] ?? 1).replace(/^ \(|\)$/g, '');

onDay.push((g, w) => [...lifeGoesOn(g, w), ...spreadRumors(g, w)]);

/* ---------- family (like The Sims: who is whose mother) ---------- */

// Only family is a tie: friendships, couples, exes and rivals are feelings in the relationships store (sim/rel.ts).
// `a` is the <type> of `b`; '__you' is the player.
export type TieType = FamilyType;
export interface Tie { a: string; b: string; type: TieType }
export const TIE_TYPES: [TieType, string][] = [['parent', 'parent of'], ['child', 'child of'], ['sibling', 'sibling of'], ['cousin', 'cousin of']];
export const ties = (g: Save): Tie[] => ((L(g) as any).ties ??= []);
export const tiesOf = (g: Save, avatar: string) => ties(g).filter(t => t.a === avatar || t.b === avatar);
export function setTie(g: Save, t: Tie) {
    const list = ties(g); const i = list.findIndex(x => (x.a === t.a && x.b === t.b) || (x.a === t.b && x.b === t.a));
    if (i >= 0) list.splice(i, 1, { a: t.a, b: t.b, type: t.type }); else list.push({ a: t.a, b: t.b, type: t.type });
}
export function removeTie(g: Save, a: string, b: string) { const list = ties(g); const i = list.findIndex(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)); if (i >= 0) list.splice(i, 1); }
// Living together: the second person moves into the first one's home (the player's home for '__you').
export function liveTogether(g: Save, host: string, guest: string) {
    const r = g.cast[guest]; if (!r) return;
    r.home = host === '__you' ? { ...g.player.home } : { ...g.cast[host].home };
    (r as any).homeWith = host;
    normalizeHomes(g);
}
// Households: everyone at the same address shares one home. With the player there, it is the player's home;
// otherwise the first person who lived there is the "head" whose home the others share (`homeWith`).
export { homeKey, normalizeHomes } from './homes.js';
import { homeKey, normalizeHomes } from './homes.js';
const nameOfId = (g: Save, id: string) => (id === '__you' ? '{{user}}' : g.cast[id]?.name ?? id);
// For the AI: the family of the people in this scene (only those, like the memories). How they get along is told by
// their feelings (feelingsLine in sim/relations.ts).
export function tiesLine(g: Save, present: Resident[]) {
    const here = new Set(present.map(r => r.avatar));
    const list = ties(g).filter(t => here.has(t.a) || here.has(t.b));
    if (!list.length) return '';
    return `Family: ${list.map(t => `${nameOfId(g, t.a)} is ${TIE_TYPES.find(x => x[0] === t.type)?.[1] ?? t.type} ${nameOfId(g, t.b)}`).join('; ')}.`;
}
const names = (list: string[]) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
// For the AI: who among the people here shares a home (with {{user}} too). Not in a Home scenario, where everyone
// lives in the house anyway.
export function householdLine(g: Save, w: WorldDef, present: Resident[]) {
    if (isScenario(w)) return '';
    const mine = homeKey(g.player.home), homes = new Map<string, string[]>();
    for (const r of present) { const k = homeKey(r.home); homes.set(k, [...(homes.get(k) ?? []), r.name]); }
    const out = [...homes].filter(([k, list]) => list.length > 1 || k === mine).map(([k, list]) => (k === mine ? `${names(list)} ${list.length > 1 ? 'live' : 'lives'} with {{user}}` : `${names(list)} live together`));
    return out.length ? `Households: ${out.join('; ')}.` : '';
}
// For the AI: who among the people here works at the same place ({{user}} too), from their jobs, so it follows every
// change of job.
export function colleaguesLine(g: Save, w: WorldDef, present: Resident[]) {
    if (!systemOn(w, 'jobs') || isScenario(w)) return '';
    const placeOfJob = (id: string | null | undefined) => (id ? w.occupations.find(o => o.id === id)?.place : undefined);
    const at = new Map<string, string[]>();
    const add = (place: string | undefined, name: string) => { if (place) at.set(place, [...(at.get(place) ?? []), name]); };
    add(placeOfJob(g.player.job?.id), '{{user}}');
    for (const r of present) add(placeOfJob(r.occupation), r.name);
    const out = [...at].filter(([, list]) => list.length > 1).map(([p, list]) => `${names(list)} work at ${placeOf(g, w, p)?.name ?? p}`);
    return out.length ? `Colleagues: ${out.join('; ')}.` : '';
}
