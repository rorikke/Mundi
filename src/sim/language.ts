// A language barrier for a newcomer (E13). A world may say which language its people speak (`language.local`, a skill
// such as `japanese`) and which others some of them share with a newcomer (`others`: `english`). The player's levels in
// those skills shape what the AI is told: how much {{user}} follows, and with whom {{user}} can talk freely in another
// language. It never blocks anything: people find a way (gestures, pointing, a translation app), and the AI plays what
// {{user}} misses. Time spent with people who speak only the local language trains it, a little each hour, up to a
// day's worth. A world without `language`, or a player who speaks it well: nothing. It belongs to the skills
// (`hobbies` system).
import type { Save, Resident } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { onHour } from './hooks.js';
import { levelOf, trainSkill, skillName, skillXp } from './hobbies.js';
import { presentAt } from './people.js';
import { exampleOf } from './dayplan.js';

/** From this level on, {{user}} speaks the local language well enough that nothing needs saying. */
export const FLUENT = 7;
/** Sharing another language: both speak it at least this well. */
export const SHARED = 5;
/** Practice from being among people who speak only the local language: per hour (more with more of them), and per day. */
export const IMMERSION = { alone: 1, perPerson: 1.5, most: 3, perDay: 12 };

const on = (w: WorldDef) => !!w.language?.local && systemOn(w, 'hobbies');
/** How well one of the world's people speaks a language (a skill id): their own `languages`, else the local language
 *  fluently and the others a little. */
export function speaks(w: WorldDef, r: Resident, skill: string): number {
    const own = exampleOf(w, r)?.languages?.[skill];
    if (own !== undefined) return own;
    return skill === w.language?.local ? 10 : w.language?.level ?? 2;
}
/** The other language you share with them, if any (both speak it well enough). */
export function sharedWith(g: Save, w: WorldDef, r: Resident): string | null {
    for (const s of w.language?.others ?? []) if (levelOf(g, s) >= SHARED && speaks(w, r, s) >= SHARED) return s;
    return null;
}
/** Does {{user}} need the barrier told (the world has one, and {{user}}'s level, set by the start, is below fluent)? A
 *  player whose start gave no level in it (a custom start, a save from before) speaks it as people here do. */
export const barrierOn = (g: Save, w: WorldDef) => on(w) && skillXp(g)[w.language!.local] !== undefined && levelOf(g, w.language!.local) < FLUENT;

const names = (list: string[]) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
// How well {{user}} speaks it, in words.
function levelWords(n: number, lang: string): string {
    if (n <= 0) return `{{user}} speaks no ${lang} at all`;
    if (n <= 2) return `{{user}} knows only a few words of ${lang} (hello, thank you, sorry)`;
    if (n <= 4) return `{{user}} speaks basic ${lang}: simple sentences, slowly; fast talk, slang and polite forms are lost on {{user}}`;
    return `{{user}} speaks conversational ${lang}, but fast talk, slang and very polite speech still trip {{user}} up`;
}
/** For the AI (the `language` block): how much {{user}} follows, and with whom {{user}} shares another language. */
export function languageLines(g: Save, w: WorldDef, present: Resident[]): string[] {
    if (!barrierOn(g, w)) return [];
    const local = w.language!.local, lang = skillName(w, local), mine = levelOf(g, local);
    const out = [`${levelWords(mine, lang)}; signs and menus are in ${lang}.`];
    const by = new Map<string, string[]>(), some: string[] = [], none: string[] = [];
    for (const r of present) {
        const s = sharedWith(g, w, r);
        if (s) { const n = skillName(w, s); (by.get(n) ?? by.set(n, []).get(n)!).push(r.name); continue; }
        const bits = (w.language!.others ?? []).filter(x => levelOf(g, x) >= 3 && speaks(w, r, x) >= 3);
        (bits.length ? some : none).push(r.name);
    }
    for (const [n, who] of by) out.push(`{{user}} can talk freely in ${n} with ${names(who)}.`);
    if (some.length) out.push(`${names(some)} ${some.length > 1 ? 'know' : 'knows'} a little ${skillName(w, w.language!.others![0])}, mixed with simple ${lang}.`);
    if (none.length) out.push(`${names(none)} ${none.length > 1 ? 'speak' : 'speaks'} only ${lang} with {{user}}.`);
    out.push(`What {{user}} can't follow stays unclear to {{user}}, but it never stops the scene: they get by with gestures, pointing or a translation app.`);
    return out;
}

/* ---------- practice: being among people who speak it ---------- */

interface Practice { day: number; xp: number }
/** Each hour awake, away from home: practice in the local language, more with people around who speak only it. */
export function immersion(g: Save, w: WorldDef): string[] {
    if (!on(w) || g.asleep || (g as any).traveling || g.player.loc.startsWith('home:')) return [];
    const local = w.language!.local;
    if (skillXp(g)[local] === undefined || levelOf(g, local) >= 10) return [];
    const p = ((g.player as any).langPractice ??= { day: g.day, xp: 0 }) as Practice;
    if (p.day !== g.day) { p.day = g.day; p.xp = 0; }
    if (p.xp >= IMMERSION.perDay) return [];
    const locals = presentAt(g, w, g.player.loc).filter(r => !sharedWith(g, w, r) && speaks(w, r, local) >= SHARED).length;
    const xp = Math.min(IMMERSION.perDay - p.xp, locals ? Math.min(IMMERSION.most, locals) * IMMERSION.perPerson : IMMERSION.alone);
    p.xp += xp;
    return trainSkill(g, w, local, xp);
}
onHour.push(immersion);
