export const onHour = [];
export const onDay = [];
// After anything changed (the prompt is refreshed: arriving somewhere, a click, the clock): the world's stories and
// threads look at the scene (sim/stories.ts, sim/threads.ts).
export const onLook = [];
// After you do an action (habits, pets…).
export const onAction = [];
// Who you are seen as right now (an alter ego in disguise): facts, and so rumors, are about that name.
export const seenAs = [];
// Other things that help or hurt a d20 check (a familiar, an injury, a debuff, a talent…).
export const checkMods = [];
// How fast a need drops right now (a heatwave dries you out faster…): multipliers.
export const decayMods = [];
// Places shut by events (a blood moon, a storm…).
export const closedByEvents = [];
// Things that react to the end of a fight (a quest step, the ecology…).
export const afterFight = [];
// Life goals and life points meet here, so neither waits on the other (sim/goals.ts on one side, sim/points.ts and
// sim/rewards.ts on the other). A step of the active goal was done (`step`: its index; `last`: the goal is finished):
// the points ledger pays for it. Returns lines to show.
export const onGoalStep = [];
// What the rewards shop asks of life goals; sim/goals.ts fills these in (until then: no goal, nothing to skip).
export const goalLink = { active: () => null, canSkip: () => false, skip: () => [] };
// Every d20 check that is rolled (the screen can show the die).
export const onRoll = [];
// Adult content's private moments (Tokyo's adult progression) meet here, so the sessions that fill them never wait on
// each other; empty, nothing changes.
// Before an action is offered or done: why it can't be ('' when it can): a place that won't serve you after you were
// caught there. Asked by `canDo` in sim/needs.ts.
export const actionGates = [];
// A private action about to play (adult content on), and the same one once its result is in: see `PrivateCtx` in
// sim/actions.ts. A check may stop it (`x.stop`) or choose its outcome; a result adds to what came of it.
export const privateChecks = [];
export const privateResults = [];
// More lines for the intimate block (sim/scenepeople.ts), for the people here: what you know of them, their drive,
// their wanting you… (`who`: whose profiles the block tells, as `profilePeople` chose them).
export const intimateLines = [];
// An adult need's empty-need drain (Desire's restlessness at zero) as the player's drive makes it (sim/drive.ts): each
// gets the world's rule and returns the one to use. Asked by the timed rules in sim/needs.ts.
export const zeroDrainMods = [];
// What an action (or its outcome) gives back of a need, after its `rest` effects (`restGain` in sim/needs.ts): being
// alone and a private action's mood, by drive.
export const gainMods = [];
// You learned a like or a hard limit of someone's (`learn()` in sim/intimacy.ts, only when it's new): the points ledger pays
// for it (sim/points.ts). `value`: its words, as in their profile.
export const onLearned = [];
// Degrees (sim/degrees.ts) meet the courses engine and the rest of the game here, so neither waits on the other. A
// module (a course of a degree) ended in the courses engine: its classes all done, or failed for missed classes; the
// degree grades it when the term ends. `held`: why a module's classes wait ('' when they don't: the term's tuition unpaid).
export const moduleLink = { ended: () => { }, held: () => '' };
// Being a student: the most shifts a week you may work (null: no cap), why you can't move to a home ('' when you can),
// and the ranks a new job starts you up (a distinguished degree's head start). Asked by sim/work.ts and the Homes app.
// (A job that wants a degree goes through `missingCourses` in sim/courses.ts.)
export const studentLink = { workCap: () => null, homeBlock: () => '', headStart: () => 0 };
// Ventures (business, sim/ventures.ts) meet the rest of the game here, so neither waits on the other. A street story's
// result (or anything else) `finds` an upgrade of a venture you own: it waits in the Business app (lines to show; nothing
// without the venture).
// A choice at work (sim/work.ts) whose result `add`s to a venture's numbers or `finds` an upgrade: the division of that
// job gets it (sim/exec.ts). Lines to show.
// (hospitality) Someone renting a room of a venture of yours for their own business (B-19) works there, not at their
// job's own place (sim/dayplan.ts asks; null: their job's place as usual).
export const ventureLink = { find: () => [], workResult: () => [], workPlace: () => null };
