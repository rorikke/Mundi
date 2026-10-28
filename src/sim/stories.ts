// Street stories (E17, E28): short stories that happen at a place now and then (a lost new hire at the station, a fan
// following an idol home), written in the world's data (`stories`, core/world.ts): where, when, the setup the AI plays,
// and two or three choices with a roll, each leading to money, needs, a keepsake, a rumor, a fact, how some of the
// world's people feel about you, a favor owed (or called in), a thread learned, practice in a skill. Each is seen once (`yearly`: once a
// year), at its place and when its condition holds, one at a time. The AI plays it with unnamed people around, or the
// world's people by name; nobody new is made up. `brings`: one of the world's people is placed at the story's place
// while it lasts (sim/dayplan.ts `bringTo`); `after`: another story was seen first. On screen it's a card like the
// happenings' (ui/storyui.ts); the AI gets its own line (`mundi_story`). It belongs to the living world (`living`).
import { nowAbs, type Save, type Resident } from '../core/store.js';
import { systemOn, type WorldDef, type StoryDef, type StoryChoice, type StoryResult } from '../core/world.js';
import { setPrompt } from '../st/bridge.js';
import { onLook } from './hooks.js';
import { adultOn, bringTo } from './dayplan.js';
import { workingAt } from './people.js';
import { whenHolds, personNamed, favorOwed, parseWhen } from './when.js';
import { openNow } from './daynight.js';
import { addStatus, money } from './needs.js';
import { payOf, priceOf } from './bills.js';
import { book } from './ledger.js';
import { levelOf } from './hobbies.js';
import { note, placeName, toldAs } from './facts.js';
import { feelsFrom, addKeepsake, keepsakeDef } from './social.js';
import { startRumor } from './living.js';
import { revealThread } from './threads.js';
import { seasonDays, advance } from './time.js';
import { choicePractice } from './work.js';

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rnd = (g: Save, salt: string) => H(`${g.world}|${g.day}|${salt}`);

export const STORY_PROMPT = 'mundi_story';
// How long a story goes on (minutes), how many a day at most, and how likely one starts: on the first look at a place
// today, then once an hour while you stay. One that only happens on a festival or event day starts whenever it can.
export const STORY = { minutes: 120, perDay: 2, first: 0.45, later: 0.1 };
// What a choice takes when it doesn't say (a choice's own `minutes`: running a rickshaw loop is half an hour).
export const CHOICE_MINUTES = 15;

/** What the save keeps (`g.stories`): the stories seen (the day, the choice made, whether its roll worked), the one
 *  going on, favors owed to you (by a person's avatar, or a stranger's id), and today's looks. */
export interface Seen { day: number; choice?: number; ok?: boolean }
export interface StoryNow { id: string; place: string; at: number; until: number; choice?: number; ok?: boolean; said?: string }
interface Stories { seen: Record<string, Seen>; now?: StoryNow | null; favors: Record<string, number>; looks: { day: number; keys: string[]; n: number } }
export function storyState(g: Save): Stories {
    const s = ((g as any).stories ??= {}) as Stories;
    s.seen ??= {}; s.favors ??= {}; s.looks ??= { day: g.day, keys: [], n: 0 };
    if (s.looks.day !== g.day) s.looks = { day: g.day, keys: [], n: 0 };
    return s;
}
const yearOf = (g: Save, day: number) => Math.floor((Math.max(1, day) - 1) / (4 * seasonDays(g)));
const storyDef = (w: WorldDef, id: string) => (w.stories ?? []).find(s => s.id === id) ?? null;

/* ---------- which stories can happen here ---------- */

// The condition without the brought person's presence: the story brings them.
function condFor(s: StoryDef): string {
    if (typeof s.when !== 'string') return '';
    if (!s.brings) return s.when;
    const who = s.brings.trim().toLowerCase();
    return s.when.split(';').filter(p => !/^\s*present\s*:/i.test(p) || p.split(':')[1].trim().toLowerCase() !== who).join(';');
}
// Someone the story names as there: the brought person and everyone its condition wants present.
export function castOf(g: Save, s: StoryDef): Resident[] {
    const names = [...(s.brings ? [s.brings] : []), ...parseWhen(typeof s.when === 'string' ? s.when : '').conds.filter(c => c.key === 'present' && !c.not).flatMap(c => c.values)];
    return [...new Set(names.map(n => personNamed(g, n)).filter((r): r is Resident => !!r))];
}
const selfOf = (g: Save) => { const x = (g as any).swap; return x ? (x.avatar || x.origCard || '') : ''; };
// The person a story brings can come: in this game, not the one you're playing, and not working right now.
function canBring(g: Save, w: WorldDef, s: StoryDef): boolean {
    if (!s.brings) return true;
    const r = personNamed(g, s.brings);
    return !!r && r.avatar !== selfOf(g) && !workingAt(g, w, r, nowAbs(g));
}
// A story whose condition names its time of day happens then (a street at night, though its shops close at 20:00);
// one that doesn't, only while the place is open.
const timed = (s: StoryDef) => parseWhen(typeof s.when === 'string' ? s.when : '').conds.some(c => (c.key === 'period' || c.key === 'clock') && !c.not);
/** Could this story happen now, where you are (or at `place`)? */
export function storyFits(g: Save, w: WorldDef, s: StoryDef, place = g.player.loc): boolean {
    if (s.place !== place || (s.adult && !adultOn(g)) || !s.choices?.length) return false;
    if (!timed(s) && !openNow(g, w, place)) return false;
    const st = storyState(g), seen = st.seen[s.id];
    if (seen && !(s.yearly && yearOf(g, seen.day) < yearOf(g, g.day))) return false;
    if (s.after && !st.seen[s.after]) return false;
    if (!canBring(g, w, s)) return false;
    return whenHolds(g, w, condFor(s), { place, key: `story|${s.id}` });
}
export const storiesHere = (g: Save, w: WorldDef, place = g.player.loc) => (w.stories ?? []).filter(s => storyFits(g, w, s, place));
// A story that only happens on a festival or city event day is rare: when it can happen, it does.
const rare = (s: StoryDef) => parseWhen(typeof s.when === 'string' ? s.when : '').conds.some(c => (c.key === 'festival' || c.key === 'event') && !c.not);

/* ---------- it starts, it goes on, it ends ---------- */

/** The story going on here now, if any. */
export function currentStory(g: Save, w: WorldDef): { s: StoryDef; now: StoryNow } | null {
    const now = storyState(g).now;
    const s = now && storyDef(w, now.id);
    return s && now && now.place === g.player.loc && nowAbs(g) < now.until ? { s, now } : null;
}
/** Starts a story here (the screen's card and the AI's line follow). */
export function startStory(g: Save, w: WorldDef, s: StoryDef): StoryNow {
    const st = storyState(g), at = nowAbs(g);
    const now: StoryNow = { id: s.id, place: s.place, at, until: at + STORY.minutes };
    st.now = now; st.seen[s.id] = { day: g.day }; st.looks.n++;
    const r = s.brings ? personNamed(g, s.brings) : null;
    if (r) bringTo(g, r.avatar, s.place, now.until, 'is caught up in what is happening here (the street story)');
    return now;
}
/** Looks at the scene: a story going on ends when you leave (or it's over); otherwise one may start (once an hour per
 *  place, a few a day). Keeps the AI's line in step. */
export function lookStories(g: Save, w: WorldDef, roll = (salt: string) => rnd(g, salt)) {
    if (!w.stories?.length && !(g as any).stories) return;   // a world without stories keeps nothing in the save
    const st = storyState(g);
    if (st.now && (st.now.place !== g.player.loc || nowAbs(g) >= st.now.until)) st.now = null;
    if (!st.now && systemOn(w, 'living') && !g.asleep && !(g as any).traveling && st.looks.n < STORY.perDay) {
        const loc = g.player.loc, key = `${loc}|${Math.floor(g.minutes / 60)}`;
        if (!loc.startsWith('home:') && !st.looks.keys.includes(key)) {
            const first = !st.looks.keys.some(k => k.startsWith(`${loc}|`));
            st.looks.keys.push(key);
            const list = storiesHere(g, w, loc);
            const pick = list.find(rare) ?? list[Math.floor(roll(`pick|${key}`) * list.length)];
            if (pick && (rare(pick) || roll(`start|${key}`) < (first ? STORY.first : STORY.later))) startStory(g, w, pick);
        }
    }
    setPrompt(STORY_PROMPT, storyLine(g, w));
}

/** The choices you can make now (with their place in the story's list). */
export function storyChoices(g: Save, w: WorldDef, s: StoryDef): { c: StoryChoice; i: number }[] {
    return s.choices.map((c, i) => ({ c, i })).filter(({ c, i }) => (!c.when || whenHolds(g, w, c.when, { place: s.place, key: `story|${s.id}|${i}` })) && (!c.spend || favorOwed(g, c.spend) > 0));
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Your choice: a roll if it has one (d20 + half your skill level against its difficulty, as at work), then what it
 *  leads to. Returns the lines for the screen. */
export function chooseStory(g: Save, w: WorldDef, i: number, rand = Math.random): string[] {
    const cur = currentStory(g, w);
    if (!cur || cur.now.choice !== undefined) return [];
    const pick = storyChoices(g, w, cur.s).find(x => x.i === i);
    if (!pick) return [];
    const c = pick.c, out: string[] = [];
    let res: StoryResult = c, ok = true;
    if (c.roll) {
        const d20 = 1 + Math.floor(rand() * 20), bonus = c.roll.skill ? Math.floor(levelOf(g, c.roll.skill) / 2) : 0;
        ok = d20 === 20 || (d20 > 1 && d20 + bonus >= c.roll.dc);
        out.push(`🎲 ${d20}${bonus ? ` + ${bonus}` : ''} against ${c.roll.dc}: ${ok ? 'it worked.' : 'it did not work.'}`);
        if (!ok) res = c.fail ?? { text: 'It did not work out.' };
    }
    out.push(...applyResult(g, w, cur.s, res));
    out.push(...choicePractice(g, w, c.roll?.skill, c.roll ? ok : null, res.trains));   // trying something trains it
    Object.assign(cur.now, { choice: i, ok, said: `${c.label.toLowerCase()}${c.roll ? (ok ? ' (and it worked)' : ' (and it did not work)') : ''}: ${toldAs(res.text)}` });
    storyState(g).seen[cur.s.id] = { day: storyState(g).seen[cur.s.id]?.day ?? g.day, choice: i, ok };
    setPrompt(STORY_PROMPT, storyLine(g, w));
    // what you did took its time; the story stays on until you leave or it's over (its `until` covers it)
    const mins = Math.max(0, c.minutes ?? CHOICE_MINUTES);
    if (mins) { cur.now.until = Math.max(cur.now.until, nowAbs(g) + mins + 30); out.push(...advance(g, w, mins)); }
    return out;
}
/** You walk away from it (it's still seen). */
export function leaveStory(g: Save, w: WorldDef) {
    const cur = currentStory(g, w);
    if (!cur || cur.now.choice !== undefined) return;
    Object.assign(cur.now, { choice: -1, said: '' });
    setPrompt(STORY_PROMPT, storyLine(g, w));
}
// Everything a result does. Money below 0 is a cost (after the difficulty, as everywhere).
function applyResult(g: Save, w: WorldDef, s: StoryDef, r: StoryResult): string[] {
    const out: string[] = [];
    const cast = castOf(g, s), where = placeName(g, w, s.place);
    if (r.text) out.push(cap(r.text.trim()));
    if (r.money) {
        const m = r.money > 0 ? payOf(g, r.money) : -priceOf(g, -r.money);
        g.player.money = Math.max(0, g.player.money + m); book(g, where, m);
        out.push(m > 0 ? `+${money(w, m)}` : `−${money(w, -m)}`);
    }
    for (const [id, v] of Object.entries(r.effects ?? {})) if (v) addStatus(g, w, id, v);
    feelsFrom(g, w, r.feels);
    if (r.keepsake) { addKeepsake(g, r.keepsake); const k = keepsakeDef(w, r.keepsake); out.push(`You keep: ${k.icon} ${k.name}.`); }
    if (r.rumor) startRumor(g, w, r.rumor, s.place, { about: cast.map(x => x.name), you: true, id: `story:${s.id}` });
    if (r.fact) note(g, r.fact, [where], cast.map(x => x.avatar), s.place, 'story');
    if (r.favor) out.push(owe(g, r.favor, 1));
    if (r.spend && favorOwed(g, r.spend) > 0) out.push(owe(g, r.spend, -1));
    if (r.reveal) revealThread(g, w, r.reveal, 'story');
    return out.filter(Boolean);
}

/* ---------- favors (E28) ---------- */

// A favor owed to you, or called in (n = -1): by the person's avatar, or a stranger's id.
function owe(g: Save, who: string, n: number): string {
    const f = storyState(g).favors, r = personNamed(g, who), k = r?.avatar ?? who;
    f[k] = Math.max(0, (f[k] ?? 0) + n);
    if (!f[k]) delete f[k];
    if (!r) return n > 0 ? 'Someone owes you a favor.' : '';
    return n > 0 ? `${r.name} owes you a favor.` : `You called in a favor from ${r.name}.`;
}
/** Calls in a favor someone owes you (a plan they agree to, a good word at work): one fewer. */
export const callInFavor = (g: Save, who: string) => owe(g, who, -1);
/** Favors the world's people here owe you, for the AI. */
export function favorLines(g: Save, present: Resident[]): string[] {
    const f = storyState(g).favors;
    const who = present.filter(r => (f[r.avatar] ?? 0) > 0).map(r => r.name);
    return who.length ? [`${who.join(', ')} ${who.length > 1 ? 'owe' : 'owes'} {{user}} a favor (from something {{user}} did for them); {{user}} may call it in.`] : [];
}

/* ---------- for the AI ---------- */

const names = (list: string[]) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
/** The story going on here, as the AI's line: the setup to play while you decide, then how it turned out. */
export function storyLine(g: Save, w: WorldDef): string {
    const cur = currentStory(g, w);
    if (!cur) return '';
    const { s, now } = cur;
    const cast = castOf(g, s).map(r => r.name);
    const who = `unnamed people around (passers-by, staff, strangers)${cast.length ? ` and ${names(cast)} as themselves` : ''}; give nobody else a name and bring in no other named character`;
    if (now.choice === undefined) return `[Something is happening here, now (a street story): ${s.setup.trim()} Play it as it happens, with ${who}. Leave what {{user}} does to {{user}}.]`;
    if (now.choice < 0) return '[{{user}} walked away from what was happening here; it goes on without them, in the background.]';
    return `[What was happening here: {{user}} chose to ${now.said} Narrate how it ends, with ${who}; don't change the outcome.]`;
}

onLook.push((g, w) => lookStories(g, w));
