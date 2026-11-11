// Places other systems hook into time (kept apart, with no imports, so no module waits on another).
import type { Save, Resident } from '../core/store.js';
import type { WorldDef, ActionDef, Place, StatusDef } from '../core/world.js';
import type { PrivateCtx, ActionDone } from './actions.js';
export const onHour: ((g: Save, w: WorldDef) => string[])[] = [];
export const onDay: ((g: Save, w: WorldDef) => string[])[] = [];
// After anything changed (the prompt is refreshed: arriving somewhere, a click, the clock): the world's stories and
// threads look at the scene (sim/stories.ts, sim/threads.ts).
export const onLook: ((g: Save, w: WorldDef) => void)[] = [];

// After you do an action (habits, pets…).
export const onAction: ((g: Save, w: WorldDef, a: { id: string; tags?: string[]; name: string }) => void)[] = [];
// Who you are seen as right now (an alter ego in disguise): facts, and so rumors, are about that name.
export const seenAs: ((g: Save) => string)[] = [];
// Other things that help or hurt a d20 check (a familiar, an injury, a debuff, a talent…).
export const checkMods: ((g: Save, w: WorldDef, skill: string) => number)[] = [];
// How fast a need drops right now (a heatwave dries you out faster…): multipliers.
export const decayMods: ((g: Save, w: WorldDef, status: string) => number)[] = [];
// Places shut by events (a blood moon, a storm…).
export const closedByEvents: ((g: Save, w: WorldDef, placeId: string) => boolean)[] = [];
// Things that react to the end of a fight (a quest step, the ecology…).
export const afterFight: ((g: Save, w: WorldDef, c: any) => string[])[] = [];
// Life goals and life points meet here, so neither waits on the other (sim/goals.ts on one side, sim/points.ts and
// sim/rewards.ts on the other). A step of the active goal was done (`step`: its index; `last`: the goal is finished):
// the points ledger pays for it. Returns lines to show.
export const onGoalStep: ((g: Save, w: WorldDef, goal: string, step: number, last: boolean) => string[])[] = [];
// What the rewards shop asks of life goals; sim/goals.ts fills these in (until then: no goal, nothing to skip).
export const goalLink: {
    active: (g: Save) => string | null;
    canSkip: (g: Save, w: WorldDef) => boolean;
    skip: (g: Save, w: WorldDef) => string[];
} = { active: () => null, canSkip: () => false, skip: () => [] };
// Every d20 check that is rolled (the screen can show the die).
export const onRoll: ((c: { skill: string; d20: number; other?: number; total: number; dc: number; grade: string }) => void)[] = [];

// Adult content's private moments (Tokyo's adult progression) meet here, so the sessions that fill them never wait on
// each other; empty, nothing changes.
// Before an action is offered or done: why it can't be ('' when it can): a place that won't serve you after you were
// caught there. Asked by `canDo` in sim/needs.ts.
export const actionGates: ((g: Save, w: WorldDef, a: ActionDef) => string)[] = [];
// A private action about to play (adult content on), and the same one once its result is in: see `PrivateCtx` in
// sim/actions.ts. A check may stop it (`x.stop`) or choose its outcome; a result adds to what came of it.
export const privateChecks: ((g: Save, w: WorldDef, x: PrivateCtx) => void)[] = [];
export const privateResults: ((g: Save, w: WorldDef, x: PrivateCtx, done: ActionDone) => void)[] = [];
// More lines for the intimate block (sim/scenepeople.ts), for the people here: what you know of them, their drive,
// their wanting you… (`who`: whose profiles the block tells, as `profilePeople` chose them).
export const intimateLines: ((g: Save, w: WorldDef, here: Place | null, present: Resident[], who: { full: Resident[]; limitsOnly: Resident[] }) => string[])[] = [];
// An adult need's empty-need drain (Desire's restlessness at zero) as the player's drive makes it (sim/drive.ts): each
// gets the world's rule and returns the one to use. Asked by the timed rules in sim/needs.ts.
export const zeroDrainMods: ((g: Save, w: WorldDef, s: StatusDef, z: { status: string; amount: number; everyMinutes: number }) => { status: string; amount: number; everyMinutes: number })[] = [];
// What an action (or its outcome) gives back of a need, after its `rest` effects (`restGain` in sim/needs.ts): being
// alone and a private action's mood, by drive.
export const gainMods: ((g: Save, w: WorldDef, a: { id: string; tags?: string[] }, id: string, v: number) => number)[] = [];
