// Desire and drive (Tokyo's adult progression, design 2c; adult content only). Two halves. The player's Desire need
// drains at the speed of their Drive (the trait group in sim/traits.ts, with its numbers): at zero they're restless (a
// little mood, by drive), at 70 or more the afterglow slows mood's drain (by drive), being alone gives some of it back
// (by drive) and a private action's mood follows the drive too. No Drive and no afterglow while Desire isn't in play.
// And every character has a drive (`IntimateProfile.drive`): no meter, only the time of your last private moment with
// them (sim/intimacy.ts), which their drive turns into a state: not ready again yet (your private actions with them are
// turned down, nothing lost), wanting you (casual partners and partners: they text more, roll +1, the AI is told),
// frustrated (partners who see you and go too long without a night: romance −1 a day, a want). You learn someone's drive
// after three nights together. Characters making the move in a scene (X23) live in sim/initiative.ts, with the budget.
import { nowAbs, adultOn, cfg, type Save, type Resident } from '../core/store.js';
import { systemOn, activeStatuses, type WorldDef, type ActionDef, type IntimateDrive } from '../core/world.js';
import { onHour, onDay, privateChecks, privateResults, intimateLines, zeroDrainMods, gainMods } from './hooks.js';
import { addStatus, statusDef } from './needs.js';
import { playerDrive, desireOn, PLAYER_DRIVE } from './traits.js';
import { driveOf, lastIntimate, intimateCount, intimacyReady, knownOf, learn } from './intimacy.js';
import { isPrivateAct, type ActionDone } from './actions.js';
import { statusOf, pairOf, lastContact, lose, ro, attracted, PARTNER, YOU, type Status } from './rel.js';
import { romanceBlocked } from './family.js';
import { FADE } from './fading.js';

export { playerDrive, desireOn, PLAYER_DRIVE };

/* ---------- the player's Desire ---------- */

/** Desire's id, and the line above which the afterglow holds. */
export const DESIRE = 'desire';
export const AFTERGLOW_AT = 70;
const H = 60, D = 24 * 60;
const desireNow = (g: Save, w: WorldDef) => g.player.stats[DESIRE] ?? statusDef(w, DESIRE)?.start ?? 0;

/** A private action's mood, by your drive (×1 without Desire in play): for what a private action's result adds. */
export const driveMoodMul = (g: Save, w: WorldDef | null | undefined): number => { const d = playerDrive(g, w); return d ? PLAYER_DRIVE[d].mood : 1; };
/** How much slower mood drains right now: your drive's afterglow while Desire is 70 or more, else 0. */
export function afterglow(g: Save, w: WorldDef): number {
    const d = playerDrive(g, w);
    return d && desireNow(g, w) >= AFTERGLOW_AT ? PLAYER_DRIVE[d].afterglow : 0;
}

// Restless at zero: the world's empty-Desire drain is Average's; Low feels it half as much, High more often.
zeroDrainMods.push((g, w, s, z) => {
    const d = s.id === DESIRE ? playerDrive(g, w) : null;
    if (!d || d === 'average') return z;
    const r = PLAYER_DRIVE[d].restless;
    return { ...z, amount: z.amount * r.amount, everyMinutes: Math.max(30, Math.round(z.everyMinutes * r.every)) };
});
// Being alone (an action tagged `solo`) gives back Desire by drive; a private action's mood follows the drive.
gainMods.push((g, w, a, id, v) => {
    const d = playerDrive(g, w);
    if (!d || d === 'average') return v;
    if (id === DESIRE && (a.tags ?? []).includes('solo')) return Math.round(v * PLAYER_DRIVE[d].alone);
    if (id === 'mood' && isPrivateAct(g, a as ActionDef)) return Math.round(v * PLAYER_DRIVE[d].mood);
    return v;
});
// The afterglow: while Desire is 70 or more, a share of mood's drain comes back each hour (kept with its fractions, so
// a 5% afterglow counts as much as it says).
export function glowHour(g: Save, w: WorldDef) {
    const share = afterglow(g, w), mood = activeStatuses(w, g).find(s => s.id === 'mood');
    if (!share || !mood?.decay || (mood.decay.awakeOnly && g.asleep)) return;
    const total = (g.tick['glow:mood'] ?? 0) + share * mood.decay.amount * (H / mood.decay.everyMinutes) * (cfg(g).decay ?? 1), whole = Math.floor(total);
    g.tick['glow:mood'] = total - whole;
    if (whole) addStatus(g, w, 'mood', whole);
}

/* ---------- characters' drive ---------- */

/** By their drive: how long after a night with you they're ready again, after how long they want you, after how long a
 *  partner gets frustrated (minutes), and how likely they are to make the move on a day they want you (X23). */
export const CHAR_DRIVE: Record<IntimateDrive, { ready: number; wanting: number; frustrated: number; move: number }> = {
    low: { ready: 2 * D, wanting: 8 * D, frustrated: 24 * D, move: 0.15 },
    average: { ready: 12 * H, wanting: 4 * D, frustrated: 12 * D, move: 0.35 },
    high: { ready: 2 * H, wanting: 2 * D, frustrated: 6 * D, move: 0.6 },
};
/** After this many nights together you know someone's drive. */
export const LEARN_AFTER = 3;
export type DriveState = 'notready' | 'wanting' | 'frustrated' | null;

// The drive's states belong to adult content and the romance system; never for family or minors.
const statesOn = (g: Save, w: WorldDef, a: string) => adultOn(g) && systemOn(w, 'romance') && !!g.cast[a] && !romanceBlocked(g, a);
const st = (g: Save, a: string) => statusOf(g, a, YOU);
// Since when they've gone without you: the last private moment, else the day you got together.
function without(g: Save, a: string): number | null {
    const last = lastIntimate(g, a);
    if (last !== undefined) return nowAbs(g) - last;
    const since = pairOf(g, a, YOU)?.since;
    return st(g, a) && since !== undefined ? nowAbs(g) - since * D : null;
}
/** Not ready again yet: a private moment with you less than their drive's time ago. */
export function notReady(g: Save, w: WorldDef, a: string): boolean {
    if (!statesOn(g, w, a)) return false;
    const last = lastIntimate(g, a);
    return last !== undefined && nowAbs(g) - last < CHAR_DRIVE[driveOf(g, a)].ready;
}
// Someone who could want you at all: attracted, their intimacy needs met (never "only with a partner" when you aren't).
const couldWant = (g: Save, a: string) => attracted(g, a, YOU) && intimacyReady(g, a, '').lean === 'yes';
/** Wanting you: a casual partner or a partner who has gone their drive's time without a night with you. */
export function wantingYou(g: Save, w: WorldDef, a: string): boolean {
    if (!statesOn(g, w, a) || !st(g, a) || !couldWant(g, a)) return false;
    const t = without(g, a);
    return t !== null && t >= CHAR_DRIVE[driveOf(g, a)].wanting;
}
/** Frustrated: a partner (dating or more) who has gone their drive's longer time without a night, while you've still
 *  been seeing each other (contact in the last few days: someone away misses you instead). */
export function frustrated(g: Save, w: WorldDef, a: string): boolean {
    if (!statesOn(g, w, a) || !PARTNER.includes(st(g, a) as Status) || !couldWant(g, a)) return false;
    const t = without(g, a), seen = lastContact(g, a);
    return t !== null && t >= CHAR_DRIVE[driveOf(g, a)].frustrated && seen !== undefined && g.day - seen <= FADE.partner.grace;
}
/** Their state toward you, the strongest first. */
export function driveState(g: Save, w: WorldDef, a: string): DriveState {
    return notReady(g, w, a) ? 'notready' : frustrated(g, w, a) ? 'frustrated' : wantingYou(g, w, a) ? 'wanting' : null;
}

// Before a private action with them: someone not ready again turns it down (nothing lost: no price, no time, not done
// today); someone who has been wanting you makes it go better (+1 for A's roll, `x.notes.eager`: one, however many
// want you). First in the list, so a "not tonight" comes before any roll.
privateChecks.unshift((g, w, x) => {
    const mates = x.with.filter(a => !!g.cast[a]);
    const tired = mates.find(a => notReady(g, w, a));
    if (tired) {
        const name = g.cast[tired].name, text = `${name} isn't in the mood tonight.`;
        x.stop = {
            lines: [{ text, kind: 'warn' }], roll: null, outcome: { id: 'drive:notready', text, weight: 0 }, keepsake: null, with: x.with, together: [],
            ai: `[Just now {{user}} wanted to ${x.a.label.toLowerCase()} with ${name}, but ${name} isn't in the mood tonight (they were together only recently). ${name} says so kindly; nothing is wrong between them. Play it in the scene.]`,
        };
        return;
    }
    if (mates.some(a => wantingYou(g, w, a))) x.notes.eager = 1;
});

// You learn someone's drive after three nights together (from any path that counts one: actions, the verdict).
function learnDrives(g: Save, who: string[]): string[] {
    const out: string[] = [];
    for (const a of who) if (g.cast[a] && intimateCount(g, a) >= LEARN_AFTER && !knownOf(g, a).drive && learn(g, a, 'drive')) out.push(`You know ${g.cast[a].name}'s drive now: ${driveOf(g, a)}.`);
    return out;
}
privateResults.push((g, w, x, done: ActionDone) => { if (adultOn(g)) for (const t of learnDrives(g, x.with)) done.lines.push({ text: t, kind: 'info' }); });

onHour.push((g, w) => {
    if (!adultOn(g)) return [];
    glowHour(g, w);
    return systemOn(w, 'romance') ? learnDrives(g, Object.keys(g.cast)) : [];
});
// Each day: a frustrated partner's romance toward you drops a point (never below the fading floor).
onDay.push((g, w) => {
    if (!adultOn(g) || !systemOn(w, 'romance')) return [];
    for (const a of Object.keys(g.cast)) {
        if (!frustrated(g, w, a)) continue;
        const v = ro(g, a, YOU);
        if (v > FADE.partner.floor) lose(g, 'r', a, YOU, Math.min(1, v - FADE.partner.floor));
    }
    return [];
});

/** For the AI and the People app: what someone's drive makes them want from you now ('' when nothing). */
export function driveWant(g: Save, w: WorldDef, a: string, n: string): string {
    return frustrated(g, w, a) ? `${n} wants more nights together with {{user}}` : '';
}
// The intimate block: one line per person here whose drive says something about tonight, as `- {name}: …` so the block
// joins it with the other lines about that person (sim/scenepeople.ts).
const LINES: Record<Exclude<DriveState, null>, string> = {
    notready: "was with {{user}} only recently and isn't in the mood again yet",
    wanting: 'has been wanting {{user}}: it shows (lingering touches, an invitation in the look), and a scene may turn flirty without being asked',
    frustrated: "wants more nights together with {{user}} and is a little frustrated it's been so long",
};
intimateLines.push((g, w, _here, present: Resident[]) => present.map(r => { const s = driveState(g, w, r.avatar); return s ? `- ${r.name}: ${LINES[s]}.` : ''; }).filter(Boolean));

/** How likely two of the world's people are to start something casual, by both drives (×1.5 with two High, ×0.5 with a
 *  Low; ×1 with adult content off). */
export function casualOdds(g: Save, x: string, y: string): number {
    if (!adultOn(g)) return 1;
    const a = driveOf(g, x), b = driveOf(g, y);
    return a === 'low' || b === 'low' ? 0.5 : a === 'high' && b === 'high' ? 1.5 : 1;
}

/** For tests and the debug view: Desire now, the afterglow's share, your drive. */
export const desireInfo = (g: Save, w: WorldDef) => ({ on: desireOn(g, w), value: desireNow(g, w), drive: playerDrive(g, w), afterglow: afterglow(g, w) });
