// Places other systems hook into time (kept apart, with no imports, so no module waits on another).
import type { Save, Resident } from '../core/store.js';
import type { WorldDef, ActionDef, Place, StatusDef, WorkResult, SlotDef } from '../core/world.js';
import type { PrivateCtx, ActionDone } from './actions.js';
import type { ShopItem } from '../core/presets.js';
export const onHour: ((g: Save, w: WorldDef) => string[])[] = [];
export const onDay: ((g: Save, w: WorldDef) => string[])[] = [];
// After anything changed (the prompt is refreshed: arriving somewhere, a click, the clock): the world's stories and
// threads look at the scene (sim/stories.ts, sim/threads.ts).
export const onLook: ((g: Save, w: WorldDef) => void)[] = [];

// Things you have, in a shop item's shape: each entry lists what you own right now. Only the shop's (sim/shop.ts) for
// now; a home's rooms and fixtures can join later. Read through `ownedDefs` in sim/shop.ts, never one by one.
export const thingsOwned: ((g: Save, w: WorldDef) => ShopItem[])[] = [];

// After you do an action (habits, pets…).
export const onAction: ((g: Save, w: WorldDef, a: { id: string; tags?: string[]; name: string }) => void)[] = [];
// (museum, sim/museum.ts) What the rest of the game asks of the museum's engine, so neither waits on the other; with none,
// nothing. `settle`: run inside the collection's settle (sim/collection.ts), lines to show; `found`: after an action's
// roll (sim/actions.ts, `ok` its success, null without a roll; `began`: the minute the action began, so a find's
// window is judged as you set out, not as the try ends), a find's lines; `story`: a street story's result with
// `renown` or `damage` (sim/stories.ts), lines; `begun`: are the display halls shown (null: the world has no museum,
// track 4's rule); `tile`: what a display piece's tile adds (sim/collection.ts `recordView`); `hall`: how a display
// hall is on show. (nature, sim/dig.ts) `dug`: after the same action, a dig's day and roll, lines; `inSeason`: can a
// piece's way come round in the season now (the tiles' mark); `settleDig`: the dig's part of the settle, run right after
// the museum's (pieces mounted on their ready day), lines.
export const museumHooks: {
    settle: (g: Save, w: WorldDef) => string[];
    settleDig: (g: Save, w: WorldDef) => string[];
    found: (g: Save, w: WorldDef, a: ActionDef, ok: boolean | null, mates: string[], began?: number) => string[];
    dug: (g: Save, w: WorldDef, a: ActionDef, ok: boolean | null, mates: string[], began?: number) => string[];
    inSeason: (g: Save, w: WorldDef, slot: string) => boolean;
    story: (g: Save, w: WorldDef, r: { renown?: number; damage?: boolean }) => string[];
    begun: (g: Save, w: WorldDef) => boolean | null;
    tile: (g: Save, w: WorldDef, slot: string) => Record<string, unknown>;
    hall: (g: Save, w: WorldDef, hall: string) => Record<string, unknown> | undefined;
} = { settle: () => [], settleDig: () => [], found: () => [], dug: () => [], inSeason: () => false, story: () => [], begun: () => null, tile: () => ({}), hall: () => undefined };
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
// A keepsake gained (actions, stories, goal steps, the shop, a gift bought): the collection remembers it was held.
export const onKeepsake: ((g: Save, id: string) => void)[] = [];
// What the condition grammar asks of the collection (sim/collection.ts fills these in; until then nothing holds):
// `seen: all in <map>` (a district's street stories, less those that can't happen any more) and `goal: all`; (museum,
// sim/museum.ts) `piece:` and `museum:` and their words.
export const collectionLink: {
    storiesDone: (g: Save, w: WorldDef, map: string) => boolean;
    storiesWords: (g: Save, w: WorldDef, map: string) => string;
    goalsAll: (g: Save, w: WorldDef) => boolean;
    goalsWords: (g: Save, w: WorldDef) => string;
    piece: (g: Save, w: WorldDef, v: string) => boolean;
    pieceWords: (g: Save, w: WorldDef, v: string) => string;
    museum: (g: Save, w: WorldDef, v: string) => boolean;
    museumWords: (g: Save, w: WorldDef, v: string) => string;
    /** (museum, the market: sim/market.ts) `sales:` and `dealer:`, the counters the rival's and the dealer's tiers read. */
    market: (g: Save, w: WorldDef, key: 'sales' | 'dealer', v: string) => boolean;
    marketWords: (g: Save, w: WorldDef, key: 'sales' | 'dealer', v: string) => string;
    /** (track 7: sim/collection.ts) `record:`, the record's percentage or a record hall's fill, and its words. */
    record: (g: Save, w: WorldDef, v: string) => boolean;
    recordWords: (g: Save, w: WorldDef, v: string) => string;
    /** (nature: sim/dig.ts) `dig:`, the counters of the world's digs, and its words. */
    dig: (g: Save, w: WorldDef, v: string) => boolean;
    digWords: (g: Save, w: WorldDef, v: string) => string;
} = { storiesDone: () => false, storiesWords: () => '', goalsAll: () => false, goalsWords: () => '',
    piece: () => false, pieceWords: (_g, _w, v) => v, museum: () => false, museumWords: (_g, _w, v) => v,
    market: () => false, marketWords: (_g, _w, _k, v) => v, record: () => false, recordWords: (_g, _w, v) => v, dig: () => false, digWords: (_g, _w, v) => v };
// (museum) What the market (sim/market.ts) asks of the museum's engine (sim/museum.ts fills these in, so neither file
// imports the other's rules). Unset, the market uses its own plain answers: renown level 0, a piece can be housed when
// it needs no upgrade or the museum has one by that id or `does`, prices through the difficulty only, and a piece
// bought is written into the collection as it is.
export const museumLink: {
    /** The renown level now (0: below the first level). */
    level?: (g: Save, w: WorldDef) => number;
    /** Can the museum house this piece now (the upgrade it needs is built)? */
    canHouse?: (g: Save, w: WorldDef, s: SlotDef) => boolean;
    /** A museum price from its yen before difficulty: the difficulty and any perk. */
    price?: (g: Save, w: WorldDef, base: number) => number;
    /** The piece is yours, bought from the dealer or at a sale for `paid`: write it, return any lines. */
    give?: (g: Save, w: WorldDef, id: string, x: { src: 'dealer' | 'auction'; paid: number }) => string[];
} = {};
// (museum) Whether a place is in the game now (sim/places.ts `placeOn` asks every entry): the museum's place stays off
// the maps until it's yours. Empty: every place is.
export const placeGates: ((g: Save | null | undefined, w: WorldDef, id: string) => boolean)[] = [];
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
// You learned a like or a hard limit of someone's (`learn()` in sim/intimacy.ts, only when it's new): the points ledger pays
// for it (sim/points.ts). `value`: its words, as in their profile.
export const onLearned: ((g: Save, who: string, what: 'like' | 'limit', value: string) => void)[] = [];

// Degrees (sim/degrees.ts) meet the courses engine and the rest of the game here, so neither waits on the other. A
// module (a course of a degree) ended in the courses engine: its classes all done, or failed for missed classes; the
// degree grades it when the term ends. `held`: why a module's classes wait ('' when they don't: the term's tuition unpaid).
export const moduleLink: {
    ended: (g: Save, w: WorldDef, course: string, how: 'done' | 'failed') => void;
    held: (g: Save, w: WorldDef, course: string) => string;
} = { ended: () => {}, held: () => '' };
// Being a student: the most shifts a week you may work (null: no cap), why you can't move to a home ('' when you can),
// and the ranks a new job starts you up (a distinguished degree's head start). Asked by sim/work.ts and the Homes app.
// (A job that wants a degree goes through `missingCourses` in sim/courses.ts.)
export const studentLink: {
    workCap: (g: Save, w: WorldDef) => number | null;
    homeBlock: (g: Save, w: WorldDef, zone: string) => string;
    headStart: (g: Save, w: WorldDef, job: string) => number;
} = { workCap: () => null, homeBlock: () => '', headStart: () => 0 };

// Ventures (business, sim/ventures.ts) meet the rest of the game here, so neither waits on the other. A street story's
// result (or anything else) `finds` an upgrade of a venture you own: it waits in the Business app (lines to show; nothing
// without the venture).
// A choice at work (sim/work.ts) whose result `add`s to a venture's numbers or `finds` an upgrade: the division of that
// job gets it (sim/exec.ts). Lines to show.
// (hospitality) Someone renting a room of a venture of yours for their own business (B-19) works there, not at their
// job's own place (sim/dayplan.ts asks; null: their job's place as usual).
export const ventureLink: {
    find: (g: Save, w: WorldDef, upgrade: string) => string[];
    workResult: (g: Save, w: WorldDef, job: string, r: WorkResult, ok: (n: number | undefined) => number) => string[];
    workPlace: (g: Save, w: WorldDef, avatar: string) => string | null;
    /** (the love hotel) after your hours at the desk: what you saw (sim/sightings.ts; lines to show) */
    stint: (g: Save, w: WorldDef, venture: string) => string[];
} = { find: () => [], workResult: () => [], workPlace: () => null, stint: () => [] };

// (museum) People who unlock (sim/tiers.ts fills these in; until it loads, and in a world without tiers, nothing changes).
// Asked with store ids (the person's avatar). `cap`: the highest friendship or romance toward you their tier allows now
// (null: no cap); `hold`: a gain's raw points that passed it (kept for the next tier, or dropped); `reserved`: drawn to
// whoever you play, whatever your gender, and to no one else; `notYet`: why their tier doesn't allow a couple status
// (`casual`… `married`) with you now (null: it does; `ever`: no tier ever will); `intimacy`: their needs from their tier
// (undefined: no tier says, their own apply; null: not before a later tier); `moves`: they may make the move now;
// `outfit`: the game may put that outfit on them now; `invites`: they may text you invitations now (`inviteOdds`: how many
// times as often as anyone, 1 without a tier saying; `inviteMax`: the most any tier of the world says); `words`: their own
// words for the move's card or for asking you over (empty: the engine's).
export const tierLink: {
    cap: (g: Save, m: 'f' | 'r', x: string) => number | null;
    hold: (g: Save, m: 'f' | 'r', x: string, raw: number) => void;
    reserved: (g: Save, x: string) => boolean;
    notYet: (g: Save, x: string, status: 'casual' | 'dating' | 'engaged' | 'married') => { ever: boolean; when: string } | null;
    intimacy: (g: Save, x: string) => { preset?: string; r?: string; f?: string; casual?: false } | null | undefined;
    moves: (g: Save, x: string) => boolean;
    outfit: (g: Save, x: string, outfit: string) => boolean;
    invites: (g: Save, x: string) => boolean;
    inviteOdds: (g: Save, x: string) => number;
    inviteMax: (g: Save) => number;
    words: (g: Save, x: string, k: 'moveLines' | 'askLines') => string[];
} = { cap: () => null, hold: () => {}, reserved: () => false, notYet: () => null, intimacy: () => undefined, moves: () => true, outfit: () => true,
    invites: () => true, inviteOdds: () => 1, inviteMax: () => 1, words: () => [] };
// (museum) A place that is yours (the museum you own and its rooms), asked when you're caught at a place: null when it
// isn't; else being caught there bans nothing, and `risk` multiplies the chance of being seen (the night guard's
// rounds). sim/museum.ts fills it in.
export const ownedPlaces: ((g: Save, w: WorldDef, place: string) => { risk: number } | null)[] = [];
// (photography) What the rest of the game asks of the photo gigs (sim/photo.ts and sim/studio.ts fill these in; until
// then, and with the system off, nothing holds). `holds`: the condition keys `photorep`, `portfolio`, `contact`,
// `photobook`, `photos`, `studio`, `freelance`; `words`: such a key in words for what a goal or a rank still asks ("a
// photo reputation of 30 (12 now)"; '' when it has none); `count`: how far you are on a counted one (null: not counted).
// `photo`: an action or a work event's choice that takes a photo was done (`ok`: its roll; null without one), lines.
export const photoLink: {
    holds: (g: Save, w: WorldDef, key: string, v: string) => boolean;
    words: (g: Save, w: WorldDef, key: string, v: string) => string;
    count: (g: Save, w: WorldDef, key: string, v: string) => number | null;
    photo: (g: Save, w: WorldDef, from: { action?: ActionDef; choice?: WorkResult & { photo?: true; label?: string }; ok: boolean | null; mates: string[] }) => string[];
} = { holds: () => false, words: () => '', count: () => null, photo: () => [] };
// (C-7) Lines for the AI about the people here and the place right now, from systems that have them (the market's: the
// other collector at a sale, the dealer at her van). Called in the scene's focus block (sim/prompt.ts).
export const sceneLines: ((g: Save, w: WorldDef, present: Resident[]) => string[])[] = [];
// (photography) Actions a system offers from its own state where you are (the hourly studio rental), added to the
// engine's own (`extraActions` in sim/life.ts); what one does is its system's own `onAction`.
export const engineActions: ((g: Save, w: WorldDef) => ActionDef[])[] = [];
