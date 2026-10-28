import { settings, game } from './store.js';
import { upgradeWorld, presetOf, PRESETS } from './presets.js';
import type { RpgDef } from './rpgdef.js';
import type { FeelParts, FamilyType, FriendLevel } from './feel.js';
// The world format. A world is pure data (worlds/<id>/world.json); Mundi's systems read it.
// Everything a world can configure is declared here, so this file is also the format's documentation.

/** A part of the day. `prices`: what things cost then (× as listed; 1 or none = as listed). */
export interface Period { id: string; name: string; from: number; prices?: number }
export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
/** Days of the week as worlds write them (day 1 of a game is a Monday). */
export const WEEKDAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekdayId = typeof WEEKDAY_IDS[number];
/** A condition, read by sim/when.ts: `key: value` with `;` between conditions that must all hold, `or` between
 *  alternatives inside one, and `not` before them to exclude them all (`weekday: not sat or sun`). A key may repeat
 *  (`present: Ren; present: Mio`: both are here). Example: `period: evening or night; weekday: fri; feels: Kyōko friend`.
 *  Keys: `period` (an id; a name in older worlds), `weekday` (`mon` … `sun`), `weekend` (`yes`/`no`), `season`,
 *  `seasonDays` (`3-6`: days of the season), `weather` (`rain`, `cloudy`…; region weather `fujiview`, `gas`),
 *  `festival` (id, on today), `event` (a city event's id, on now), `place`, `zone` (the home zone of the place you're
 *  at), `region` (a map id), `daily` (`yes`: once a day), `regular` (visits here: `8`), `skill` (`cooking 3`), `feels`
 *  (`Ayaka friend`: one of the world's people toward you, at that level or closer), `onShift` (someone at work here),
 *  `present` (someone here now), `after` (an action done here today), `job` (an id, or `here`), `start` (the player's
 *  start), `chance` (per day, `0.2`), `clock` (`19:00-20:00`), `stayed` (slept at that place last night), `holds` (a
 *  keepsake), `companion` (someone with you at that level or closer: `dating`). An outcome's own condition may be
 *  written `when: present: Kaito`. Worlds made before conditions were text give an object (LoreWhen), read as before. */
export type When = string | LoreWhen;
/** The old form of a condition (lore before E26): the weather, a period by name, a place or region, weekends, a
 *  season, the region's public mood or tension, a range of days, a chance each day. */
export interface LoreWhen {
    weather?: string; period?: string; place?: string; weekend?: boolean;
    region?: string; season?: string; tensionAbove?: number; moodAbove?: number; moodBelow?: number;
    fromDay?: number; toDay?: number; chance?: number;
}
/** A map. `parent`: the bigger map it sits in (a city inside a region); `minutesPerUnit`: travel speed on it. */
export interface MapDef {
    id: string; name: string; image: string; ratio: number; parent?: string; minutesPerUnit?: number;
    /** Where it is: its city, state or province (shown in the maps picker). */
    area?: string;
    /** A town with districts: trips between its own places stay short even though other maps hang from it. */
    town?: boolean;
    /** Minutes to get here from the map it is inside (a district of a city: 20-30; a village up the road: 60-90). */
    trip?: number;
    /** temperate, cold, hot, coastal…: which extreme weather can strike here */
    climate?: string;
    /** Life in the region (the living world): usual public mood -100..100, tension 0..100, prices ×, crowds ×, own weather. */
    mood?: number; tension?: number; prices?: number; crowd?: number; ownWeather?: boolean;
    /** The map's picture for some parts of the day (period id → picture). */
    images?: Record<string, string>;
}
export interface Place {
    id: string; name: string; map: string; x: number; y: number;
    tags?: string[]; desc?: string; event?: string; bg?: string;
    /** How busy it gets compared with places of its kind (0.5 quiet, 1.5 lively). */
    crowd?: number;
    /** The parts of the day (period ids) it is closed in; none given: like places of its kind. */
    closed?: string[];
    /** The scene's background for some parts of the day (period id → picture). */
    bgs?: Record<string, string>;
    /** A pin that opens another map (a city on the region map) instead of being a place. */
    link?: string;
    /** A scenario: a room that is off unless the player chooses it when starting (the rooms are picked per game). */
    scenarioOff?: boolean;
    /** What the place is for the game (a healer, a jail, a contracts board…); none given: guessed from its name. */
    roles?: string[];
    /** (E1) Who's around besides the world's people, 6–20 words ("the master works in silence; old men at the
     *  counter"): background the AI may describe, never characters. */
    staff?: string;
    /** (E14) Ids of actions offered here besides those that name this place. `generic: false`: none of the actions its
     *  tags bring (walk, coffee, meal…); missing: they're offered, as before. */
    actions?: string[]; generic?: boolean;
    /** (E6) You can sleep here (a capsule, a ryokan): see PlaceSleep. */
    sleep?: PlaceSleep;
    /** (E19) Opening hours by the clock, [from, to) in hours (17.5 = 17:30; `to` below `from` goes past midnight:
     *  `[18, 5]`, and the hours after midnight belong to the day before), on top of `closed` (without `closed`, they
     *  replace the guess from its tags); `openBySeason` for hours that change through the year (`winter: [10, 18]`). */
    open?: [number, number]; openBySeason?: Partial<Record<SeasonId, [number, number]>>;
    /** (E19) Weekdays it's closed all day (`mon` … `sun`). */
    closedDays?: WeekdayId[];
    /** (E19) Festival ids on whose days it never closes, through the night after until the first trains (a temple
     *  open all night on New Year's Eve). */
    festivalOpen?: string[];
    /** (E19) What it costs to get in (a garden's gate), paid once a day on the way in (not by guests staying the night). */
    entry?: number;
    /** (E33) A private place (a karaoke room, a love-hotel room): a private scene for the intimate profiles (E15). */
    private?: boolean;
    /** (E15) Only with adult content on: otherwise it's on no map and nobody's routine sends them there. */
    adult?: boolean;
}
/** (E6) Sleeping at a place: what a night costs (0: free or paid with something else), how well you rest, when you
 *  must leave (an hour, default the world's `sleep.until`), actions included with the night (the ryokan's bath,
 *  dinner and breakfast, by action id: free from booking the room until you leave the morning after), and who may
 *  stay (`when`, see When: `feels: Haru friend or job: animator`). */
export interface PlaceSleep { price: number; rest: 'poor' | 'fair' | 'good' | 'great'; until?: number; includes?: string[]; when?: When }
// Roles a place can have. A place with its own list uses only that list; one without is guessed from its name, so
// older worlds keep working and any world can set them in the map editor.
export const PLACE_ROLES: { id: string; name: string; re: RegExp }[] = [
    { id: 'healer', name: 'Healer or hospital', re: /heal|hospital|infirm|mending|balm|apothec|doctor/i },
    { id: 'shrine', name: 'Shrine or temple (prayers, rituals)', re: /temple|chapel|church|shrine|cathedral|monaster|altar|circle/i },
    { id: 'tavern', name: 'Tavern or bar (rumors and clues)', re: /tavern|inn|mead|mug|goose|dog|plough|lantern|camel|mermaid|torch|pickaxe|caf[eé]|\bbar\b|pub|club/i },
    { id: 'hire', name: 'Companions for hire', re: /tavern|inn|barrack|guild|plough|saltdog|fort|\bbar\b|pub|club/i },
    { id: 'contracts', name: 'Contracts board', re: /guild|lodge|hunter|board/i },
    { id: 'guarded', name: 'Guarded (wanted people are stopped)', re: /guard|barrack|police|customs|fort|station|gate|castle|palace|civic|jarl|watch|square|market|bazaar/i },
    { id: 'jail', name: 'Jail', re: /barrack|fort|castle|jarl|palace|civic|police|guard/i },
    { id: 'blackmarket', name: 'Black market (night auctions)', re: /dock|bazaar|warehouse|black|underground|industrial/i },
];
export const guessRoles = (p: { id: string; name: string; tags?: string[] }) => PLACE_ROLES.filter(r => r.re.test(`${p.id} ${p.name}`) || (p.tags ?? []).includes(r.id)).map(r => r.id);
export const placeIs = (p: { id: string; name: string; tags?: string[]; roles?: string[] } | null | undefined, role: string) => !!p && (p.roles ? p.roles.includes(role) : guessRoles(p).includes(role));
export interface HomeZone {
    id: string; name: string; map: string; kind: string; rent: number; desc?: string;
    spots: [number, number][];
}
export interface StatusDef {
    id: string; name: string; icon: string; color: string; start: number; max: number; hud?: boolean;
    /** `rpg`: only in the RPG game mode (health…); `off`: turned off in a Custom world. */
    rpg?: boolean; off?: boolean;
    decay?: { amount: number; everyMinutes: number; awakeOnly?: boolean };
    zero?: {
        text?: string; place?: string; cost?: number; restore?: number;
        drain?: { status: string; amount: number; everyMinutes: number };
        /** A crisis: after `after` minutes at zero, something happens once (you faint, you break down…). */
        crisis?: Crisis;
    };
}
// A crisis at zero: the message, where you end up ('home', a place, or '' to stay), what it costs, what the need
// comes back to, your mood, how much the people who saw it think less of you, and the fact they remember
// ({u} you, {0} the place).
export interface Crisis { after: number; text: string; place?: string; cost?: number; restore?: number; mood?: number; shame?: number; seen?: string }
export interface ActionDef {
    id: string; name: string; label: string; icon?: string; cost: number; minutes: number;
    tags?: string[]; place?: string; home?: boolean; anywhere?: boolean;
    /** An outing (a scenario): you leave the house off-screen for a while (work, errands, a night out) and come back. */
    outing?: boolean;
    effects: Record<string, number>;
    /** A one-click skill action (fishing, fixing something): an invisible d20 roll + trait bonuses against `dc`.
     *  Time and the base effects always apply; then `success` or `fail` adds its own effects and money.
     *  `skill` (J3): a skill whose level adds to the roll. */
    roll?: { dc: number; traits?: string[]; skill?: string; success: RollOutcome; fail: RollOutcome };
    /** Only shown when the player owns this shop item (a coffee machine, a loom…). */
    needsItem?: string;
    /** Not offered in places with any of these tags (a run is not for the gym). */
    notTags?: string[];
    /** The hobby this action trains (its level adds to the roll and raises what it pays). Set by the engine from `hobbies`. */
    hobby?: string;
    /** (E14) More places that offer it (one action for three karaoke boxes), next to `place`. */
    places?: string[];
    /** (E14) When it's offered (see When): `period: afternoon; daily: yes; feels: Ayaka friend`. */
    when?: When;
    /** (E14) Done with the people with you (it counts as time together): `needed` when it can't be done alone;
     *  `text`: what it means for you two, for the AI ("eating side by side at the counter"). With you: the people who
     *  came with you and are here, and the one you talk to alone. */
    together?: { needed?: boolean; text?: string };
    /** (E14) Weighted outcomes (an omikuji's four results), one drawn after the roll if there is one. */
    outcomes?: ActionOutcome[];
    /** (E14) A keepsake it always leaves (an id from the world's `keepsakes`); an outcome's or a roll result's own
     *  keepsake only when that one comes out. */
    keepsake?: string;
    /** (E14) What's remembered and told to the AI ({u} the player, {0} the place): "{u} ate ramen at {0}". */
    fact?: string;
    /** (J3) The skill it trains a little (an id from the world's `skills`). */
    trains?: string;
    /** (E33) Done in private (a room of your own, a private bath): a private scene for the intimate profiles. */
    private?: boolean;
    /** (E15) Only with adult content on. */
    adult?: boolean;
}
/** A roll's result. `keepsake` and `fact` as on the action (E14); `feels`: how some of the world's people feel about
 *  you after it (a name → a small change, up paced and down in full: "Mio's and Chloe's friendship up a little"). */
export interface RollOutcome { text: string; money?: number; effects?: Record<string, number>; keepsake?: string; fact?: string; feels?: Record<string, number> }
/** (E14) One of an action's outcomes: drawn by `weight` among those whose own condition holds (`when: present: Kaito`). */
export interface ActionOutcome extends RollOutcome { weight: number; when?: When }
export interface Attribute { id: string; name: string; desc?: string }
export interface TraitGroup { id: string; label: string; max: number; options: string[] }
export interface Origin {
    id: string; name: string; desc?: string; money: number; home?: string; knows?: number;
    attributes?: Record<string, number>;
    /** RPG: the skills this background is trained in, and what it gives you (like a BG3 background). */
    skills?: string[]; feature?: string;
}
/** A rank of a job: its name and pay per hour. (J3) What it takes to be promoted to it: skill levels (`needs`:
 *  `{ cooking: 4 }`; `performance` there is the performance it asks for, 0–100, instead of the usual 60), one of some
 *  traits, a course, or anything else as a condition (`when: feels: Genzō good`).
 *  (E20) `place`: where this rank works, when not the job's place (an idol's top ranks at the TV studio). */
export interface Rank { name: string; pay: number; needs?: Record<string, number>; traits?: string[]; course?: string; when?: When; place?: string }
// Career branches (like The Sims): reaching rank `at` (3, 6, 9…), you choose a path; its ranks come next.
// `promote`: shifts to reach each of its ranks; `after`: the option is only offered after one of these paths.
export interface BranchOption { id: string; name: string; desc?: string; ranks: Rank[]; promote?: number[]; likes?: string[]; after?: string[] }
export interface Branch { at: number; options: BranchOption[] }
// A career as you live it: the job's ranks up to its first branch, then the ranks of each path you chose. `open`: a
// branch waiting for your choice (you are at its rank); the next promotion comes once you choose.
export interface Career { ranks: Rank[]; promote: number[]; likes: string[]; open: Branch | null; options: BranchOption[] }
export function career(o: Occupation, path: string[] = []): Career {
    const branches = [...(o.branches ?? [])].filter(b => b.at > 0 && b.options?.length).sort((a, b) => a.at - b.at);
    const first = branches[0];
    const ranks = first ? o.ranks.slice(0, first.at) : [...o.ranks];
    const promote = (o.promote ?? []).slice(0, Math.max(0, ranks.length - 1));
    const likesOf = [...(o.likes ?? [])];
    const pad = () => { while (promote.length < ranks.length - 1) promote.push((promote.at(-1) ?? 4) + 3); };
    pad();
    let i = 0;
    for (const b of branches) {
        if (ranks.length < b.at) break;   // not reached (the job has fewer ranks than this branch)
        ranks.length = b.at; promote.length = Math.min(promote.length, b.at - 1); pad();
        const offered = b.options.filter(x => !x.after?.length || x.after.some(a => path.includes(a)));
        const pick = offered.find(x => x.id === path[i]);
        if (!pick) return { ranks, promote, likes: likesOf, open: offered.length ? { ...b, options: offered } : null, options: offered };
        for (const [k, r] of pick.ranks.entries()) { ranks.push(r); promote.push(pick.promote?.[k] ?? (promote.at(-1) ?? 4) + 3); }
        likesOf.push(...(pick.likes ?? []));
        i++;
    }
    return { ranks, promote, likes: likesOf, open: null, options: [] };
}

export interface Occupation {
    id: string; name: string; place: string; ranks: Rank[]; shift: number;
    cost?: Record<string, number>; requires?: Record<string, number>;
    /** Traits that make promotions faster; `needs`: one of these traits is required to be hired. */
    likes?: string[]; needs?: string[];
    /** Opening hours [from, to) and shifts needed at each rank before the next. */
    hours?: [number, number]; promote?: number[];
    /** A hobby level needed to be hired (a bar musician needs Guitar 4). */
    hobby?: { id: string; level: number };
    /** Career branches: at some ranks you choose a path (see Branch). */
    branches?: Branch[];
    /** Course ids needed to be hired (sim/skills.ts). (J3) `skills`: skill levels needed to be hired. */
    courses?: string[]; skills?: Record<string, number>;
    /** (J1) When it's worked; missing: whenever the place is open, as before (see Schedule). */
    schedule?: Schedule;
    /** (J4) How long the top takes compared with the average career (1: about a game year at 1×; a konbini clerk 0.5,
     *  a doctor 2). Missing: 1. */
    length?: number;
    /** (E20) Extra pay for night hours (22:00–5:00), as a share of the hourly pay (0.25: +25%). */
    nightPay?: number;
    /** (E20) Worked off-screen, as Home mode's jobs are: during a shift the person is away, on no map. */
    offScreen?: boolean;
    /** (E20) false: not open to the player (only the world's people have it). */
    hireable?: boolean;
    /** (J6) Things that happen at work now and then (see WorkEvent). */
    events?: WorkEvent[];
    /** (J3) Skills the job trains a little each shift. (J1) `overtime`: the boss asks for extra hours now and then. */
    trains?: string[]; overtime?: boolean;
    /** (E15) Only with adult content on. */
    adult?: boolean;
}
/** (J1) A weekly schedule: how many days a week (the engine picks which) or which weekdays, and a shift's hours
 *  [from, to) (`to` below `from` goes past midnight: 20–6). A job worked round the clock lists its `shifts` instead
 *  of from/to. The work preset (J9) scales the days. */
export interface Schedule { days: number | WeekdayId[]; from?: number; to?: number; shifts?: { id: string; name?: string; from: number; to: number }[] }
/** (J6) A thing that happens on a shift: a setup sentence and two or three choices. */
export interface WorkEvent { id: string; setup: string; when?: When; choices: WorkChoice[]; adult?: boolean }
/** A choice at work: an optional roll (a skill against `dc`), and what it does: performance up or down (`perf`,
 *  −2…2), money, how some of the world's people feel about you (`feels`: name → friendship points, 2–5 for "a
 *  little"), a fact; `fail`: what happens instead when the roll fails. `when`: only offered then (`present: Mio`). */
export interface WorkChoice extends WorkResult { label: string; roll?: { skill?: string; dc: number }; fail?: WorkResult; when?: When }
export interface WorkResult { text?: string; perf?: number; money?: number; effects?: Record<string, number>; feels?: Record<string, number>; fact?: string }
export type RoutineStep = [number, string];   // [hour, 'home' | 'work' | 'leisure' | placeId]
export interface Routine { weekday: RoutineStep[]; weekend: RoutineStep[] }
export interface ExampleCharacter {
    name: string; age: number; occupation: string | null; home: string; routine: string; leisure?: string[];
    description: string; first_mes?: string; personality?: string;
    /** The world whose card this is (a copied world reuses the original's cards instead of making new ones). */
    from?: string;
    /** Their family among the world's other people: they are the `type` (parent, child, sibling, cousin) of `to` (the
     *  other person's name). Worlds made before family-only ties may have any relation type and a tone here (`back`: how
     *  the other feels back): upgradeWorld() moves those into `feelings`. */
    ties?: { to: string; type: string; tone?: string; back?: string }[];
    /** How they start with the world's other people, in every game (`to`: the other person's name): friendship and
     *  romance levels each way, a couple's status, or the couple they used to be (core/feel.ts). */
    feelings?: (FeelParts & { to: string; /** (E15) only with adult content on (an adult thread) */ adult?: boolean;
        /** (E29) a couple that keeps it secret: seen together only by people they trust */ secret?: boolean })[];
    /** Their own ways, from the start of every game (all optional: unset means the defaults). `gender`: one of the
     *  world's gender ids. `attraction`: per gender id, how much of the normal rate their friendship (`f`) and romance
     *  (`r`) grow toward people of that gender (0..1, missing = 1). */
    gender?: string; attraction?: Record<string, { f?: number; r?: number }>;
    pace?: { f?: 'slow' | 'normal' | 'fast'; r?: 'slow' | 'normal' | 'fast' }; style?: 'exclusive' | 'open';
    intimacy?: { preset?: string; r?: string; f?: string; casual?: false };
    /** (E18) Everyone with the same household id shares one home in every game (like the new game's households). */
    household?: string;
    /** (E3) Their portrait (a picture in the world's folder) and a folder of expression sprites, uploaded when their
     *  card is first made. */
    avatar?: string; sprites?: string;
    /** (J5) The rank they hold in their job: an index (0 = the first) or the rank's name. */
    rank?: number | string;
    /** (E21) Standing appointments (see Ritual). */
    rituals?: Ritual[];
    /** (E22) Their secrets and storylines (see Thread). */
    threads?: Thread[];
    /** (E25) Chemistry hints toward the world's other people (by name), 0..1: how strongly they're drawn. */
    chemistry?: Record<string, number>;
    /** (E15) Only with adult content on: otherwise their card isn't made, and ties, feelings and households with them
     *  are left out. */
    adult?: boolean;
    /** (E15) Their intimate profile, sent to the AI only with adult content on (see IntimateProfile). */
    intimate?: IntimateProfile;
    /** (E27) One short line on their looks and one on their voice, for scenes where they're present but not speaking. */
    look?: string; voice?: string;
    /** (E25) The world's own people stay themselves: no random new job or home (only their threads or the player change
     *  that). Missing: they stay themselves; `false` lets one change by chance. */
    anchored?: boolean;
}
/** (E21) A standing appointment: where, which weekdays (none: the owner's days off), hours [from, to) (past 24 runs into the
 *  night: 21–26 is 21:00 to 2:00). `every`: each week (default), every N weeks (`2`, starting on week `week`), once a
 *  month (the season's week `week`: 1 = the first, -1 = the last) or once a year; `festival` or `event`: only on those
 *  days. `places`: some weeks one of these instead. `with`: others who come (names of the world's people); `chance`:
 *  how often it happens (1 = always); `text`: what they're doing, for the AI ("sings at Bar Kotori"). It wins over free
 *  time, not over a work shift. */
export interface Ritual {
    place: string; days?: WeekdayId[]; from: number; to: number;
    every?: 'week' | 'month' | 'year' | number; week?: number; festival?: string; event?: string;
    places?: string[]; with?: string[]; chance?: number; text: string; when?: When; adult?: boolean;
}
/** (E22) A secret or storyline that moves in stages. `hidden`: what the character knows and doesn't say (told to the
 *  AI as hidden); `known`: how it reads once the player knows ({{user}} knows …); `reveal`: what makes the player
 *  know (a condition: `feels: Rina good`, a story, an overheard rumor). */
export interface Thread { id: string; hidden: string; known?: string; reveal?: When; stages: ThreadStage[]; endings?: ThreadEnding[]; adult?: boolean }
/** A stage: when it begins (a condition on the calendar or the story so far: `season: summer; seasonDays: 8-14`), how
 *  it's told (`hidden`, `hinted` or `known`), the text, and what it brings: a moment, a rumor, a fact. */
export interface ThreadStage { id?: string; when?: When; tell?: 'hidden' | 'hinted' | 'known'; text: string; moment?: string; rumor?: string; fact?: string }
/** How a thread ends, picked by what happened (`when`): the text, and a life that changes (a new job or home). */
export interface ThreadEnding { id: string; when?: When; text: string; job?: string; home?: string; fact?: string }
/** (E15) An intimate profile, character-sheet style: experience (a line), what they want, what draws them, how they
 *  flirt, who leads, preference tags, hard limits (never cut by the token budget). */
export interface IntimateProfile { experience?: string; wants?: string; drawnTo?: string; flirts?: string; dynamic?: string; prefs?: string[]; limits?: string[] }
/** One of a world's genders: `pronouns` and the `plural` ("women") are what the AI is told. */
export interface GenderDef { id: string; name: string; plural?: string; pronouns?: string }
export const exampleTag = (w: WorldDef, ex: ExampleCharacter) => `${ex.from ?? w.id}:${ex.name}`;
/** A phone app: which one (`id`), and how it is called and looks in this world. */
export interface AppDef { id: string; name: string; icon: string; color: string; on: boolean; rpg?: boolean }
/** A lore entry: keyed (in the lorebook, sent when a key word comes up), or with `when` (sent with the scene while the
 *  condition holds, see When), or a `rumor` (goes around between people once its `when` holds, sim/living.ts).
 *  (E15) `adult`: only with adult content on. (E31) `about`: who a rumor is about (by name; they never "hear" it);
 *  `secret`: their close friends don't pass it on. (E32) `priority`: kept first when a busy scene has too much lore. */
export interface LoreEntry { keys: string[]; content: string; constant?: boolean; when?: When; rumor?: boolean; adult?: boolean; about?: string; secret?: boolean; priority?: number }

export interface WorldDef {
    format: 1;
    id: string; name: string; kind: string; version: string; description: string; setting: string;
    cover?: string;
    /** (no longer used) */
    music?: Record<string, string>;
    /** One currency per world. `after`: the symbol goes after the amount ("40 g" instead of "$40").
     *  (`tiers`, coins of several metals, is no longer used: amounts were always counted in the smallest coin.) */
    currency: { name: string; symbol: string; after?: boolean; tiers?: { symbol: string; value: number }[] };
    /** The style it is built on (modern, medieval…): the look of the game and the base the world creator copies. */
    style?: string;
    /** The game mode: Life-Sim (daily life, the base), RPG (adds health, and later factions, missions and fights)
     *  or Custom (each system turned on or off in the creator). The style only sets the look and the words. */
    mode?: GameMode;
    /** A scenario instead of a world: one closed place (a house, a mansion) with its residents and a premise. */
    scenario?: { premise: string };
    /** Ids the world no longer has, and what took their place (saves are moved over when they load). */
    retired?: { maps?: Record<string, string>; places?: Record<string, string> };
    /** A scenario's floor plan (optional): when on, the house map is a plan with floors instead of the room pictures. */
    plan?: HousePlan;
    /** what kind of world this is: how it can be played (Life-Sim, RPG) and what it holds (realistic or fantasy); systems for one kind stay off in the others */
    tags?: WorldTag[];
    /** The way of playing this world was made for (shown on its card): Life-Sim or RPG. */
    madeFor?: 'lifesim' | 'rpg';
    time: { startDay: number; startMinutes: number; speed: number; periods: Period[] };
    /** (no longer used: trips take 30 minutes inside a town, 2 hours between towns) */
    travel?: { minutesPerUnit: number; round: number[]; sameMap: number };
    maps: MapDef[];
    places: Place[];
    /** `bills`: water, power… charged with the rent (each kind of home its own amounts). */
    /** `kinds.<kind>.bills`: what each kind of home pays a week for each expense (by expense id).
     *  `expenses`: the bills besides the rent (water, power, firewood, taxes…); each `blocks` the actions it stops while
     *  it is a week unpaid. Without it, a world has water and power. */
    homes: { zones: HomeZone[]; kinds: Record<string, { name: string; desc: string; image?: string; images?: Record<string, string>; bills?: Record<string, number> }>;
        expenses?: { id: string; name: string; icon?: string; blocks?: string[]; cut?: string; back?: string }[] };
    statuses: StatusDef[];
    actions: ActionDef[];
    sleep: { until: number; restore: Record<string, number>; homeOnly?: boolean };
    rent?: { everyDays: number; text?: string };
    sheet: {
        /** (no longer used) */
        fields?: string[];
        age?: { min: number; max: number; default: number };
        appearance?: { id: string; label: string; options: string[] }[];
        attributes?: { points: number; min: number; max: number; list: Attribute[] };
        /** Ready-made descriptions the player picks (e.g. Proficiency: strong, smart), up to `max` each. */
        traits?: TraitGroup[];
        /** What the player chooses when making a character (each one on unless set to false). */
        ask?: { portrait?: boolean; age?: boolean; appearance?: boolean; origin?: boolean; traits?: boolean; bio?: boolean };
    };
    catalogs: { origins?: Origin[]; [name: string]: unknown };
    occupations: Occupation[];
    cast: { routineTemplates: Record<string, Routine>; examples: ExampleCharacter[] };
    /** The genders people can have here (the style's list when a world has none). */
    genders?: GenderDef[];
    lore: LoreEntry[];
    /** SillyTavern lorebooks this world uses (switched on while one of its games is open). */
    lorebooks?: string[];
    /** The Author's Note every new game of this world starts with. */
    note?: { text: string; depth?: number; interval?: number; position?: number };
    /** The RPG of the world (attributes, classes, magic…): needed for the RPG mode. */
    rpg?: RpgDef;
    /** Habits that become traits (do something often enough and it sticks; stop and it fades). */
    habits?: HabitDef[];
    /** The calendar's festivals (fixed days of a season: prices, crowds at a place, a celebration). */
    festivals?: FestivalDef[];
    /** City events of the week: shows, matches, fairs (a weekday, every N weeks, at a place; in the calendar, you go if you want). */
    cityEvents?: CityEventDef[];
    /** Hobbies that level up with practice (guitar, painting…): a bonus on their rolls, more money, jobs that ask for them. */
    hobbies?: HobbyDef[];
    /** Pets and familiars you can buy and keep. */
    pets?: PetDef[];
    /** Crafting recipes (ingredients → a good or gem; a d20 check; legendary ones are named by you). */
    recipes?: RecipeDef[];
    /** Endless towers (a place; floors of foes that grow stronger, loot, checkpoints). */
    towers?: TowerDef[];
    /** Weapons with a will of their own (found deep in towers or at auctions). */
    blades?: BladeDef[];
    /** Goods that are bought and sold (prices differ by town: cheap where made, dear where scarce; some illegal). */
    goods?: GoodDef[];
    /** What can be grown at home (seed, days to grow, the good it yields). */
    crops?: CropDef[];
    /** Kinds of business you can open (cost, daily profit, staff, the places that suit it). */
    businesses?: BusinessDef[];
    /** Celestial events (eclipses, mana storms, blood moons…) and extreme weather by climate. */
    skies?: { events?: CelestialDef[]; hazards?: HazardDef[] };
    /** Schools, academies, universities: a ladder of ranks, tuition, lessons, exams and clubs. */
    institutions?: InstitutionDef[];
    /** Factions: guilds, orders, houses, gangs, kingdoms (standing, membership, ranks, power, rivalries). */
    factions?: FactionDef[];
    /** How the realm is ruled, what power it leans on, and its gods (none: altars are only monuments). */
    realm?: RealmDef;
    /** (E16) Ready-made starts: who you are when the game begins (see StartDef). Missing: the origins are the starts. */
    starts?: StartDef[];
    /** (J3) Skills with levels 0–10 (cooking, fitness, Japanese…), trained by actions, courses and jobs. */
    skills?: SkillDef[];
    /** (E14, E20, E35) Things you can keep, from actions and street stories (a goshuin stamp, a claw-machine plush). */
    keepsakes?: KeepsakeDef[];
    /** (E17, E28) Street stories: short one-off stories that happen at a place (see StoryDef). */
    stories?: StoryDef[];
    /** (E2) Weather by climate and season (a map's `climate` picks one; see ClimateDef). Missing: one table all year,
     *  as before. */
    climates?: Record<string, ClimateDef>;
    /** (E8) How people address you as they get closer (see AddressDef). */
    address?: AddressDef;
    /** (E4) Trains: the last and first ones, taxis and the walk to the station (see TransitDef). Missing: no last
     *  train, as before. */
    transit?: TransitDef;
    /** (J9) The work rules a new game starts with (Tokyo: `reduced`). Missing: the engine's default. */
    workPreset?: 'realistic' | 'reduced' | 'relaxed';
    /** (J4) How fast careers go in this world (2: twice as fast; 0.5: half as fast). Missing: 1. */
    careerSpeed?: number;
    /** (E1, E32) What the AI is told in a scene (see SceneDef). Missing: as before. */
    scene?: SceneDef;
    /** What the world has: a phone (modern), a journal (medieval)… and which systems are on. */
    features?: { phone?: boolean; device?: string; apps?: AppDef[] } & Partial<Record<SystemId, boolean>>;
    /** Set by the loader: the folder URL the world's files live in. */
    base?: string;
    /** Set by the loader: the world's own interface translations (worlds/<id>/lang/<lang>.json). */
    i18n?: Record<string, Record<string, string>>;
}

/** (E16) A start. `premise`: what the AI is told; `home`: a home zone id; `job`: a job id; `knows`: people you already
 *  know (by name) and how they feel about you (`f`, `r`, a couple's `status`, `was`), or what they are to you in the
 *  family (`family: 'cousin'`); `traits` and `skills` (levels) you begin with; `default`: picked first. `household`:
 *  you live with this household of the world's people (their `household` id), in your home. Made from an origin (an
 *  older world), a start has the origin's id, and the origin still gives what only it has (RPG skills, "knows N"). */
export interface StartDef { id: string; name: string; desc?: string; premise: string; home?: string; money?: number; job?: string; knows?: StartKnown[]; traits?: string[]; skills?: Record<string, number>; default?: boolean; adult?: boolean; household?: string }
export interface StartKnown extends FeelParts { name: string; family?: FamilyType }
/** (J3) A skill. */
export interface SkillDef { id: string; name: string; icon?: string; desc?: string }
/** (E14, E35) A keepsake: its kind (charm, photo, print…: a gift of each kind counts once per person), whether it can
 *  be given (`gift: false`: it can't; missing: it can), and who would love it (names of the world's people, or words
 *  matched against a person's job and the places, and kinds of place, where they spend their free time). */
export interface KeepsakeDef { id: string; name: string; icon: string; kind?: string; desc?: string; gift?: boolean; loves?: string[]; adult?: boolean }
/** (E17) A street story, seen once: where, when (see When), the setup told to the AI (unnamed background people, or one
 *  of the world's people by name), and two or three choices. (E28) `brings`: someone placed at the story's place while
 *  it lasts; `after`: another story seen first; `yearly`: it comes back every year. */
export interface StoryDef { id: string; place: string; when?: When; setup: string; choices: StoryChoice[]; brings?: string; after?: string; yearly?: boolean; adult?: boolean }
/** A street story's choice: a label, an optional roll (a skill against `dc`), what happens, and `fail` instead when the
 *  roll fails. */
export interface StoryChoice extends StoryResult { label: string; roll?: { skill?: string; dc: number }; fail?: StoryResult }
/** What a story's choice leads to: text, needs and money, a keepsake, a rumor it starts, a fact, how some of the
 *  world's people feel about you (`feels`: name → small change), and (E28) `favor`: someone who now owes you one. */
export interface StoryResult { text: string; effects?: Record<string, number>; money?: number; keepsake?: string; rumor?: string; fact?: string; feels?: Record<string, number>; favor?: string }
/** (E2) A climate: per season, the odds of each kind of weather (`sunny`, `rain`, `storm`, `snow`, `hot`…); `days`: a
 *  stretch of a season with odds of its own (the rainy season, summer 1–5); `regional`: weather a region has on its own
 *  (`fujiview`, `gas`), with its odds per season. */
export interface ClimateDef {
    seasons: Partial<Record<SeasonId, Record<string, number>>>;
    days?: { season: SeasonId; from: number; to: number; odds: Record<string, number> }[];
    regional?: Record<string, Partial<Record<SeasonId, number>>>;
}
/** (E8) How people address you, by how close they are: a few words per friendship level and per romance level or
 *  couple status, and how a senior or junior at work does. Told to the AI. */
export interface AddressDef { friend?: Partial<Record<FriendLevel, string>>; romance?: Record<string, string>; senior?: string; junior?: string }
/** (E1, E32) Scene settings. `background`: the AI may describe unnamed background people (staff, regulars,
 *  passers-by) at every place, not only at places with `staff`; `lore`: at most this many conditional lore rows in a
 *  scene (missing or 0: no limit). */
export interface SceneDef { background?: boolean; lore?: number }
/** (E4) Trains: the hour the last ones leave (0.5 = 0:30) and the first ones (5), the fare of a taxi (a base and per
 *  minute of the trip), and the walk to the station (minutes) added to trips between districts. */
export interface TransitDef { last?: number; first?: number; taxi?: { base: number; perMinute?: number }; walk?: number }

// The phone's apps, as the Modern style has them (a world can rename them, change icons or turn them off).
export const DEFAULT_APPS: AppDef[] = [
    { id: 'messages', name: 'Messages', icon: 'chat', color: '#34c759', on: true },
    { id: 'people', name: 'People', icon: 'users', color: '#ff9f0a', on: true },
    { id: 'jobs', name: 'Jobs', icon: 'briefcase', color: '#0a84ff', on: true },
    { id: 'bank', name: 'Bank', icon: 'wallet', color: '#5e5ce6', on: true },
    { id: 'homes', name: 'Homes', icon: 'home', color: '#ff375f', on: true },
    { id: 'social', name: 'Chirp', icon: 'at', color: '#1d9bf0', on: true },
    { id: 'dating', name: 'Spark', icon: 'flame', color: '#ff4f6d', on: true },
    { id: 'plans', name: 'Calendar', icon: 'calendar', color: '#ff9500', on: true },
    { id: 'journal', name: 'Journal', icon: 'book', color: '#8e6cf0', on: true },
    { id: 'shop', name: 'Shop', icon: 'wallet', color: '#16c79a', on: true },
    { id: 'goals', name: 'Goals', icon: 'star', color: '#ffb02e', on: true },
    { id: 'sheet', name: 'Character', icon: 'user', color: '#e0533f', on: true, rpg: true },
    { id: 'quests', name: 'Quests', icon: 'map', color: '#c08a2e', on: true, rpg: true },
    { id: 'grimoire', name: 'Grimoire', icon: 'sparkles', color: '#7b5cff', on: true, rpg: true },
    { id: 'party', name: 'Party', icon: 'users', color: '#b5562b', on: true, rpg: true },
    { id: 'standing', name: 'Reputation', icon: 'crown', color: '#c9a227', on: true },
    { id: 'pets', name: 'Animals', icon: 'heart', color: '#e58a4e', on: true },
    { id: 'factions', name: 'Factions', icon: 'crown', color: '#6b4fd8', on: true },
    { id: 'assets', name: 'Holdings', icon: 'wallet', color: '#2f9e6b', on: true },
    { id: 'tower', name: 'Tower', icon: 'up', color: '#7a3db8', on: true, rpg: true },
    { id: 'contracts', name: 'Contracts', icon: 'pin', color: '#a8452c', on: true, rpg: true },
    { id: 'workshop', name: 'Recipes', icon: 'gear', color: '#8a6d3b', on: true },
    { id: 'trophies', name: 'Trophies', icon: 'star', color: '#d4a017', on: true, rpg: true },
    { id: 'blade', name: 'Weapon', icon: 'bolt', color: '#4a6fa5', on: true, rpg: true },
    { id: 'soulbond', name: 'Soul bond', icon: 'sparkles', color: '#9b59b6', on: true },
    { id: 'health', name: 'Health', icon: 'pulse', color: '#d64550', on: true },
];
export const appsOf = (w: WorldDef): AppDef[] => {
    const own = w.features?.apps ?? [];
    return DEFAULT_APPS.map(d => ({ ...d, ...(own.find(a => a.id === d.id) ?? {}) }));
};
// The apps the player sees: on in the world, and their system on too.
// A scenario's phone is smaller: one house, so no moving, holdings, factions or reputation per region.
export const SCENARIO_APPS_OFF = ['homes', 'assets', 'factions', 'standing', 'social', 'dating', 'workshop', 'jobs', 'bank', 'shop', 'goals'];
/** Systems a scenario never has: no neighbors (everyone lives in the house), no social network, no crafting. */
// Home (a scenario): a simpler world made for role-play with your characters in one house. Work, money, courses,
// the economy and the like are gone; what is left is the house, the people, love and plans.
export const SCENARIO_SYSTEMS_OFF: SystemId[] = ['neighbors', 'social', 'crafting', 'events', 'jobs', 'courses', 'shop', 'consults', 'rumors', 'goals', 'habits',
    'trade', 'farming', 'dice', 'factions', 'institutions', 'property', 'banks', 'auctions', 'taxes', 'ecology', 'mounts', 'prison', 'trophies', 'identity',
    'mentors', 'letters', 'legends', 'festivals', 'hobbies', 'reputation', 'bills', 'breakdowns', 'living'];
// Life-Sim keeps to daily life: no groups to join, property to run or recipes to craft (those come with the RPG mode).
export const LIFESIM_APPS_OFF = ['factions', 'assets', 'workshop'];
export const appsShown = (w: WorldDef): AppDef[] => appsOf(w).filter(a => a.on && !(isScenario(w) && SCENARIO_APPS_OFF.includes(a.id)) && !(gameMode(w) === 'lifesim' && LIFESIM_APPS_OFF.includes(a.id)) && (!appSystem(a.id) || systemOn(w, appSystem(a.id)!)) && (!DEFAULT_APPS.find(d => d.id === a.id)?.rpg || (gameMode(w) === 'rpg' && !!w.rpg?.classes?.length)));
const registry = new Map<string, WorldDef>();
export const BUILT_IN = ['modern', 'urban', 'medieval', 'house', 'manor', 'tokyo'];
export type GameMode = 'lifesim' | 'rpg' | 'custom';
// The RPG mode waits for a later update: while this is on, nothing of it can be chosen, made or played. Worlds made
// for it are shown locked, any other world plays as Life-Sim, and its systems stay off. Turn it off to bring it back.
export const RPG_LOCKED: boolean = !(globalThis as any).__MUNDI_RPG;   // the tests turn it on (tests/env.mjs)
export const RPG_NOTE = 'The RPG mode comes in a later update.';
// The medieval style is locked for this release too: its worlds show "Soon" and it cannot be picked in the creator.
export const MEDIEVAL_LOCKED: boolean = !(globalThis as any).__MUNDI_MEDIEVAL;   // the tests turn it on (tests/env.mjs)
// Tokyo is being built (its pictures and the engine work it needs come first): it shows "Soon" until it's ready.
export const TOKYO_LOCKED: boolean = !(globalThis as any).__MUNDI_TOKYO;
export const GAME_MODES: { id: GameMode; name: string; desc: string; soon?: boolean }[] = [
    { id: 'lifesim', name: 'Life-Sim', desc: 'Daily life: work, home and bills, friends and love. Needs: energy, hunger, thirst, mood and hygiene.' },
    { id: 'rpg', soon: RPG_LOCKED, name: 'RPG', desc: 'Life-Sim plus a character sheet: level, hit points, focus, attributes, a class and subclass, d20 checks, quests, titles, magic and long journeys. Needs the world\'s RPG (RPG tab).' },
    { id: 'custom', name: 'Custom', desc: 'You choose each system: which needs exist, the phone, jobs, plans.' },
];
// The game mode: the open game's own (a world with an RPG can be played as Life-Sim or RPG), else the world's.
export const gameMode = (w: WorldDef | null | undefined): GameMode => {
    const g = w ? game() : null;
    const own = g && g.world === w!.id ? ((g as any).cfg?.mode as GameMode | undefined) : undefined;
    if (isScenario(w)) return 'lifesim';   // a scenario is always Life-Sim (realistic or fantasy)
    const m = own ?? w?.mode ?? 'lifesim';
    return RPG_LOCKED && m === 'rpg' ? 'lifesim' : m;
};
// The needs in play: RPG-only ones (health) stay out of Life-Sim; a Custom world can turn any of them off, and with
// the needs system off only the RPG ones (health) are left.
export const activeStatuses = (w: WorldDef) => w.statuses.filter(s => !s.off && !(s.rpg && gameMode(w) === 'lifesim') && (s.rpg || systemOn(w, 'needs')));

// The game's systems. Each one can be turned off in a world (features.<id> = false): then it is gone from the HUD,
// the phone or journal, the AI's prompt, and the engine stops running it. What the save holds for it is kept, so
// turning it back on picks up where it was. `apps`: the apps it owns; `blocks`: the prompt blocks it owns.
export type SystemId = 'living' | 'neighbors' | 'consults' | 'needs' | 'jobs' | 'bills' | 'courses' | 'shop' | 'breakdowns' | 'plans' | 'romance' | 'relations' | 'family' | 'social' | 'rumors' | 'diary' | 'goals'
    | 'habits' | 'reputation' | 'identity' | 'pets' | 'mentors' | 'letters' | 'festivals' | 'factions' | 'faith' | 'legends' | 'talents' | 'institutions' | 'trade' | 'property' | 'banks' | 'farming' | 'auctions' | 'taxes' | 'skies' | 'ecology' | 'debuffs' | 'injuries' | 'fatigue' | 'elements' | 'mounts' | 'prison' | 'towers' | 'sentient' | 'crafting' | 'trophies' | 'contracts' | 'soulbound' | 'dice' | 'pins' | 'events' | 'hobbies';
export interface HabitDef { id: string; name: string; desc?: string; trait: string; actions?: string[]; tags?: string[]; hours?: [number, number]; count: number; days: number; lose?: number; daily?: Record<string, number> }
export interface CityEventDef {
    id: string; name: string; icon?: string; desc?: string; place: string;
    /** 0 = Monday … 6 = Sunday; `every` weeks (1 = every week), starting on week `week`. */
    weekday: number; every?: number; week?: number;
    /** Starts at this hour and lasts `hours`. */
    from: number; hours?: number;
    /** The ticket (0: free), the mood it gives, how long you stay (minutes) and what the button says. */
    price?: number; mood?: number; minutes?: number; action?: string;
    /** Called off when it rains. `crowd`: how many in 100 people with free time go. */
    outdoor?: boolean; crowd?: number;
    /** Perform there with a hobby (an open mic, a stall at the fair): the level it needs, the button, the pay. */
    stage?: { hobby: string; level: number; label: string; pay: number };
    /** (E19) More weekdays it's on, besides `weekday` (Friday and Saturday nights). */
    weekdays?: number[];
    /** (E9) Only in these seasons, and only on these days of the season [from, to] (summer days 1–11). */
    seasons?: SeasonId[]; seasonDays?: [number, number];
    /** (E23) Who comes and who has a part in it (see Audience, EventRole). */
    audience?: Audience[]; roles?: EventRole[];
    /** (E15) Only with adult content on. */
    adult?: boolean;
}
/** (E23) Who a festival or event draws: `everyone`, `couples`, `friends` (of those taking part), `fans` (people who
 *  spend their free time at the place), `colleagues` (people who work there), `neighbors` (who live on its map),
 *  `students`; or `hobby:<id>`, `job:<id>`. */
export type Audience = string;
/** (E23) Someone's part in a festival or event (Kanon behind her convention table): who (a name of the world's people),
 *  where (default the event's place), the hours [from, to) (default the event's), and what they do, for the AI. It wins
 *  over their routine like a ritual. */
export interface EventRole { who: string; place?: string; from?: number; to?: number; text: string }
// A floor plan: floors (a picture each, optional) and where each room is on them. A room is a place of the world
// (`id`) or a bedroom: `spot:<area>:<n>`, the n-th home spot of a housing area (whoever lives there in the game).
export interface PlanFloor { id: string; name: string; image?: string; /** the plan at other parts of the day */ images?: Record<string, string>; ratio?: number }
export interface PlanRoom { id: string; floor: string; x: number; y: number; w: number; h: number }
export interface HousePlan { on?: boolean; floors: PlanFloor[]; rooms: PlanRoom[]; /** the color a room lights up with under the mouse */ glow?: string; /** false: names only under the mouse */ labels?: boolean }
export interface HobbyDef { id: string; name: string; icon?: string; desc?: string; actions: string[]; /** extra pay per level, in % (default 12) */ pay?: number }
/** A festival: a season's day(s), its place (none: everyone's), prices × and mood. (E19) `places`: more places it
 *  fills (cherry blossoms in three parks). (E23) `crowd`: how many in 100 people with free time go; `audience`,
 *  `roles` as for city events. (E5) `custom`: what it means between people (see FestivalCustom). (E15) `adult`. */
export interface FestivalDef {
    id: string; name: string; season: string; day: number; days?: number; place?: string; prices?: number; mood?: number; desc?: string;
    places?: string[]; crowd?: number; audience?: Audience[]; roles?: EventRole[]; custom?: FestivalCustom; adult?: boolean;
}
/** (E5) A festival's custom between people, played as moments chosen by each person's feelings: `gift` (people who
 *  like you give you something: Valentine's chocolate), `return` (the return gift: White Day), `couples` (partners
 *  expect a date: Christmas Eve), `family` (family and close friends go together: the New Year shrine visit), `group`
 *  (friends invite you along: hanami). `text`: the custom in a sentence, for the AI. */
export interface FestivalCustom { kind: 'gift' | 'return' | 'couples' | 'family' | 'group'; text?: string }
export interface GoodDef { id: string; name: string; icon: string; price: number; kind?: string; cheap?: string[]; dear?: string[]; illegal?: boolean; socket?: { slot: 'weapon' | 'armor'; kind: 'attack' | 'damage' | 'armor'; amount: number }; cures?: boolean }
export interface RecipeDef { id: string; name: string; needs: Record<string, number>; makes: string; count?: number; skill?: string; dc?: number; at?: string[]; risky?: boolean; legendary?: boolean }
export interface TowerDef { id: string; name: string; place: string; floors: number; tags?: string[]; desc?: string }
export interface BladeDef { id: string; name: string; personality: string; likes: 'fights' | 'quests' | 'gold' | 'mercy'; bonus: number; desc?: string }
export interface CropDef { id: string; name: string; icon: string; days: number; seed: number; good: string; yield: number }
export interface BusinessDef { id: string; name: string; icon: string; cost: number; profit: number; staff: number; tags: string[] }
export interface CelestialDef { id: string; name: string; desc?: string; every: number; days: number; effect: 'mana' | 'monsters' | 'omen'; amount?: number }
export interface HazardDef { id: string; name: string; desc?: string; climate: string; season?: string; chance: number; drain?: Record<string, number>; blocksCamp?: boolean; closes?: boolean }
export interface InstitutionDef { id: string; name: string; place: string; ranks: string[]; tuition?: number; skill?: string; trait?: string; examEvery?: number; clubs?: string[]; desc?: string }
export interface FactionDef { id: string; name: string; kind: string; desc?: string; hq?: string; region?: string; ranks: string[]; allies?: string[]; rivals?: string[]; beats?: string; dues?: number; quota?: number; jobs?: string[]; secret?: boolean; joinRep?: number }
export type Government = 'monarchy' | 'fractured' | 'empire' | 'republic' | 'theocracy' | 'council';
export type PowerAffinity = 'balanced' | 'military' | 'arcane' | 'trade' | 'faith';
export interface God { id: string; name: string; domain: string; symbol?: string; card?: string }
export interface RealmDef { /** the country (or kingdom) the world's cities belong to */ name?: string; government?: Government; leadership?: string; power?: PowerAffinity; pantheon?: God[]; tax?: number }
export interface PetDef { id: string; name: string; icon: string; price: number; desc?: string; follows?: boolean; familiar?: boolean; mood?: number; skill?: string; bonus?: number; where?: string[]; mount?: boolean; speed?: number; carry?: number }
export type WorldTag = 'lifesim' | 'rpg' | 'realistic' | 'fantasy';
export const WORLD_TAGS: { id: WorldTag; name: string; desc: string }[] = [
    { id: 'lifesim', name: 'Life-Sim', desc: 'can be played as a life: needs, work, home, people.' },
    { id: 'rpg', name: 'RPG', desc: 'can be played as an adventure: a class, checks, fights and quests.' },
    { id: 'realistic', name: 'Realistic', desc: 'no magic or gods: martial arts, technology, the street.' },
    { id: 'fantasy', name: 'Fantasy', desc: 'magic, gods, familiars and weapons with a soul.' },
];
// A world's tags; a world from before tags gets them from what it has (its RPG, its gods, its style).
export const worldTags = (w: WorldDef | null | undefined): WorldTag[] => (RPG_LOCKED ? allTags(w).filter(t => t !== 'rpg') : allTags(w));
export const allTags = (w: WorldDef | null | undefined): WorldTag[] => {
    if (!w) return [];
    if (w.tags?.length) return isScenario(w) ? w.tags.filter(t => t !== 'rpg') : w.tags;
    const t: WorldTag[] = [];
    if (w.mode !== 'rpg') t.push('lifesim');
    if (w.mode === 'rpg' || w.rpg?.classes?.length) t.push('rpg');
    t.push(styleOf(w) === 'modern' && !w.realm?.pantheon?.length ? 'realistic' : 'fantasy');
    return t;
};
export const madeFor = (w: WorldDef): 'lifesim' | 'rpg' => w.madeFor ?? (w.mode === 'rpg' ? 'rpg' : 'lifesim');
export const hasTag = (w: WorldDef | null | undefined, t: WorldTag) => worldTags(w).includes(t);
export interface SystemDef { id: SystemId; name: string; desc: string; apps: string[]; blocks: string[]; needs?: SystemId; /** only in worlds with this tag */ tag?: WorldTag }
export const SYSTEMS: SystemDef[] = [
    { id: 'living', name: 'Living world', desc: 'places are never busier or emptier, and no region changes its mood, tension or prices.', apps: [], blocks: ['world'] },
    { id: 'needs', name: 'Needs', desc: 'no hunger, energy, thirst, mood or hygiene to look after (health, in RPG, stays).', apps: [], blocks: ['needs'] },
    { id: 'jobs', name: 'Jobs and promotions', desc: 'nobody works, not even you; no jobs anywhere.', apps: ['jobs'], blocks: [] },
    { id: 'bills', name: 'Rent and bills', desc: 'homes are free and nothing is ever cut off.', apps: [], blocks: [] },
    { id: 'courses', name: 'Courses', desc: 'no courses to take; jobs do not ask for any.', apps: [], blocks: [] },
    { id: 'shop', name: 'Shop', desc: 'nothing to buy for your home.', apps: ['shop'], blocks: [] },
    { id: 'breakdowns', name: 'Things break at home', desc: 'nothing at home ever breaks.', apps: [], blocks: [] },
    { id: 'plans', name: 'Plans', desc: 'no meet-ups, dates, "come with me" or invitations.', apps: ['plans'], blocks: ['plans'] },
    { id: 'romance', name: 'Romance', desc: 'only friendship: no dating, love, engagement or marriage.', apps: ['dating'], blocks: ['couples'] },
    { id: 'relations', name: 'Relationships between people', desc: 'people\'s feelings for each other never change, and couples between them never form, move on or end by themselves.', apps: [], blocks: [] },
    { id: 'family', name: 'Children', desc: 'no babies (children already born stay).', apps: [], blocks: [], needs: 'romance' },
    { id: 'social', name: 'Social network', desc: 'no posts, likes or notices.', apps: ['social'], blocks: [] },
    { id: 'neighbors', name: 'Neighbors', desc: 'nobody from your area knocks at your door. (Needs at least 2 of the world\'s people living in your area.)', apps: [], blocks: [] },
    { id: 'consults', name: 'Advice and life events', desc: 'friends do not ask your advice, and you do not hear of birthdays, promotions or weddings.', apps: [], blocks: [] },
    { id: 'rumors', name: 'Rumors', desc: 'people do not gossip about what you do.', apps: [], blocks: ['rumors'] },
    { id: 'diary', name: 'Diary', desc: 'no diary written when you sleep, and none sent to the AI (the notes of each day stay).', apps: [], blocks: ['diary'] },
    { id: 'goals', name: 'Life goals', desc: 'no life goal to chase.', apps: ['goals'], blocks: [] },
    { id: 'habits', name: 'Habits become traits', desc: 'what you do often never becomes part of who you are.', apps: [], blocks: [] },
    { id: 'reputation', name: 'Reputation', desc: 'no reputation per region (and it never fades).', apps: ['standing'], blocks: [] },
    { id: 'identity', name: 'Secret identity', desc: 'no alter ego or disguise.', apps: [], blocks: [] },
    { id: 'pets', name: 'Pets and familiars', desc: 'no animals to keep.', apps: ['pets'], blocks: [] },
    { id: 'mentors', name: 'Apprentices', desc: 'you cannot take an apprentice.', apps: [], blocks: [] },
    { id: 'letters', name: 'Letters from afar', desc: 'friends in other towns never write, and distance never cools a friendship.', apps: [], blocks: [] },
    { id: 'festivals', name: 'Festivals', desc: 'no festivals in the calendar.', apps: [], blocks: [] },
    { id: 'events', name: 'City events', desc: 'no shows, matches or fairs in the city calendar.', apps: [], blocks: [] },
    { id: 'hobbies', name: 'Hobbies', desc: 'practice never levels up a hobby (guitar, painting…), and no job asks for one.', apps: [], blocks: [] },
    { id: 'factions', name: 'Factions and guilds', desc: 'no guilds, orders, gangs or kingdoms to join or lead.', apps: ['factions'], blocks: [] },
    { id: 'legends', name: 'Legends', desc: 'your deeds never become tales that travel and grow.', apps: [], blocks: [] },
    { id: 'talents', name: 'Talent trees', desc: 'no talents to choose when you level up (RPG).', apps: [], blocks: [], tag: 'rpg' },
    { id: 'institutions', name: 'Schools and academies', desc: 'no schools to enroll in, no exams or clubs.', apps: [], blocks: [] },
    { id: 'trade', name: 'Trade and smuggling', desc: 'no goods to buy and sell between towns, no contraband.', apps: [], blocks: [] },
    { id: 'property', name: 'Property and businesses', desc: 'you cannot buy houses to rent out or open a business.', apps: ['assets'], blocks: [] },
    { id: 'banks', name: 'Banks and moneylenders', desc: 'nobody lends money.', apps: [], blocks: [] },
    { id: 'farming', name: 'Growing things', desc: 'nothing to plant at home.', apps: [], blocks: [] },
    { id: 'auctions', name: 'Black market auctions', desc: 'no auctions of rare things.', apps: [], blocks: [] },
    { id: 'taxes', name: 'Taxes', desc: 'nobody collects taxes.', apps: [], blocks: [] },
    { id: 'skies', name: 'Celestial events and extreme weather', desc: 'no eclipses, storms of mana, blizzards or heatwaves.', apps: [], blocks: [] },
    { id: 'ecology', name: 'Living ecology', desc: 'hunting never changes the animals of a region.', apps: [], blocks: [] },
    { id: 'debuffs', name: 'Debuffs', desc: 'no poisons, curses, blindness or silence.', apps: [], blocks: [], tag: 'rpg' },
    { id: 'injuries', name: 'Long-term injuries', desc: 'no broken bones or deep wounds after a defeat.', apps: ['health'], blocks: [], tag: 'rpg' },
    { id: 'fatigue', name: 'Arcane fatigue', desc: 'spells never strain you.', apps: [], blocks: [], tag: 'fantasy' },
    { id: 'elements', name: 'Elements and weather', desc: 'fire, water and lightning are all the same, rain or shine.', apps: [], blocks: [] },
    { id: 'mounts', name: 'Mounts', desc: 'no horses or other mounts to ride.', apps: [], blocks: [] },
    { id: 'prison', name: 'Crime and prison', desc: 'no stealing, arrests or prison.', apps: [], blocks: [] },
    { id: 'towers', name: 'Towers', desc: 'no endless towers to climb.', apps: ['tower'], blocks: [], tag: 'rpg' },
    { id: 'sentient', name: 'Sentient weapons', desc: 'no weapons with a will of their own.', apps: ['blade'], blocks: [], tag: 'fantasy' },
    { id: 'crafting', name: 'Crafting and gems', desc: 'nothing to craft, no gems to set.', apps: ['workshop'], blocks: [] },
    { id: 'trophies', name: 'Trophies', desc: 'no trophies from great foes.', apps: ['trophies'], blocks: [] },
    { id: 'contracts', name: 'Hunting contracts', desc: 'no contracts to hunt monsters and outlaws.', apps: ['contracts'], blocks: [], tag: 'rpg' },
    { id: 'soulbound', name: 'Soul bond', desc: 'you cannot bind your soul to a companion creature, mount or weapon.', apps: ['soulbond'], blocks: [], tag: 'fantasy' },
    { id: 'dice', name: '3D dice', desc: 'checks show no rolling die.', apps: [], blocks: [] },
    { id: 'pins', name: 'Pin a memory', desc: 'no button to turn a reply into a memory.', apps: [], blocks: [] },
    { id: 'faith', name: 'Divine favor', desc: 'no devotion or miracles, even with gods in the realm.', apps: [], blocks: [], tag: 'fantasy' },
];
export const systemOn = (w: WorldDef | null | undefined, id: SystemId): boolean => {
    if (!w) return true;
    if ((w.features as any)?.[id] === false) return false;
    if (isScenario(w) && SCENARIO_SYSTEMS_OFF.includes(id)) return false;
    const d = SYSTEMS.find(x => x.id === id);
    // a system made for another kind of world starts off, but the world can turn it on (anything can be in any world)
    if (RPG_LOCKED && d?.tag === 'rpg') return false;
    if (d?.tag && !hasTag(w, d.tag) && (w.features as any)?.[id] !== true) return false;
    return !d?.needs || systemOn(w, d.needs);
};
// The system that owns an app or a prompt block (none: always there).
export const appSystem = (app: string) => SYSTEMS.find(x => x.apps.includes(app))?.id;
export const blockSystem = (block: string) => SYSTEMS.find(x => x.blocks.includes(block))?.id;
export const styleOf = (w: WorldDef | null | undefined) => (w?.style ?? ((w?.kind || '').toLowerCase().includes('modern') ? 'modern' : (w?.kind || 'modern').toLowerCase()));

// Worlds made with the world creator: saved as a JSON file in SillyTavern's user files (user/files/), listed in
// Mundi's settings. Their pictures are files there too; built-in pictures they reuse are absolute URLs.
export interface CustomWorld { id: string; name: string; kind: string; file: string; updated: number }
export const customWorlds = (): CustomWorld[] => ((settings() as any).customWorlds ??= []);
export const isCustom = (id: string) => customWorlds().some(c => c.id === id);
export const builtInIds = () => BUILT_IN;
export function registerWorld(w: WorldDef) { registry.set(w.id, upgradeWorld(w)); }
export function forgetWorld(id: string) { registry.delete(id); }

// Loads a world: a bundled one (worlds/<id>/world.json, next to the extension) or one made with the creator.
export async function loadWorld(id: string): Promise<WorldDef> {
    const hit = registry.get(id);
    if (hit) return hit;
    const custom = customWorlds().find(c => c.id === id);
    if (custom) {
        const res = await fetch(`/${custom.file}?t=${custom.updated}`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`World "${custom.name}" could not be loaded.`);
        const w = (await res.json()) as WorldDef;
        w.base = new URL('/', location.href).href;
        w.i18n = {};
        registry.set(id, upgradeWorld(w));
        return w;
    }
    const base = new URL(`../../worlds/${id}/`, import.meta.url).href;
    const res = await fetch(`${base}world.json`);
    if (!res.ok) throw new Error(`World "${id}" could not be loaded.`);
    const w = (await res.json()) as WorldDef;
    w.base = base;
    w.i18n = {};
    registry.set(id, upgradeWorld(w));
    return w;
}

export const worlds = () => [...registry.values()];
/** How you fit in a scenario (chosen at the start instead of an origin). `custom`: your own premise, written by you or
 *  by your AI from lorebooks. `met`: you already know everyone; `bond`/`approval`: where they stand with you. */
export interface ScenarioStart { id: string; name: string; desc: string; premise: string; /** the premise as the player reads it */ you?: string; met?: boolean; bond?: number; approval?: number }
export const SCENARIO_STARTS: ScenarioStart[] = [
    { id: 'moved', name: 'You just moved in', desc: 'You needed a room and took the last free one. Nobody here knows you yet.', premise: '{{user}} has just moved in, renting the last free room; nobody in the house knows {{user}} yet.', you: 'You have just moved in, renting the last free room; nobody in the house knows you yet.' },
    { id: 'host', name: 'Your house, your guests', desc: 'The house is yours, and these people are staying with you.', premise: 'The house belongs to {{user}}; the others are staying there as {{user}}\'s guests, under {{user}}\'s roof and rules.', you: 'The house is yours; the others are staying as your guests, under your roof and rules.', met: true, bond: 30, approval: 20 },
    { id: 'longtime', name: 'Together for a long time', desc: 'You have shared this house with them for years: everyone knows you, for better or worse.', premise: '{{user}} has lived in this house with the others for a long time; they all know {{user}} well, habits, history and all.', you: 'You have lived in this house with the others for a long time; they all know you well, habits, history and all.', met: true, bond: 45, approval: 30 },
    { id: 'custom', name: 'Custom', desc: 'Write your own premise, or let your AI write it from one or more lorebooks.', premise: '' },
];
/** In a scenario every job happens off-screen: you leave the house for the shift and come back. */
export const offScreenWork = (w: WorldDef | null | undefined) => isScenario(w);
export const isScenario = (w: WorldDef | null | undefined) => !!w?.scenario;
export const loadAllWorlds = () => Promise.all([...BUILT_IN, ...customWorlds().map(c => c.id)].map(id => loadWorld(id).catch(e => console.warn('[Mundi] world', id, e))));
export const getWorld = (id: string) => registry.get(id) ?? null;
// A world's short description is only for choosing it (it is never sent to the AI): kept short so the cards line up.
export const WORLD_DESC_MAX = 160;
export const shortDesc = (s: string) => { const t = String(s ?? '').trim(); return t.length <= WORLD_DESC_MAX ? t : `${t.slice(0, WORLD_DESC_MAX - 1).trimEnd()}…`; };
export const worldFile = (w: WorldDef, file?: string) => (file ? new URL(file, w.base).href : '');

// How this world's device, social app and messages work, and how its people write (from the world; its style's
// preset fills them in when missing, see core/presets.ts).
const kinds = (w: WorldDef | null | undefined) => (w ? presetOf(w) : PRESETS.modern).kinds;
export const deviceLook = (w: WorldDef | null | undefined): 'phone' | 'book' => ((w?.features as any)?.deviceLook ?? kinds(w).deviceLook);
export const socialKind = (w: WorldDef | null | undefined): 'feed' | 'board' => ((w?.features as any)?.socialKind ?? kinds(w).socialKind);
export const messageKind = (w: WorldDef | null | undefined): 'texts' | 'letters' => ((w?.features as any)?.messageKind ?? kinds(w).messageKind);
export const aiVoice = (w: WorldDef | null | undefined): string => String((w as any)?.ai?.voice ?? kinds(w).voice);
// A world that cannot be played yet (RPG worlds wait for the next update).
export const worldLocked = (w: WorldDef | null | undefined) => !!w && ((MEDIEVAL_LOCKED && styleOf(w) === 'medieval') || (TOKYO_LOCKED && w.id === 'tokyo')
    || (((w.mode ?? 'lifesim') === 'rpg' || (RPG_LOCKED && w.madeFor === 'rpg')) && (RPG_LOCKED || !w.rpg?.classes?.length)));   // an RPG world without its RPG, or a style coming later
// What a locked world is waiting for (its "Soon" badge).
export const lockedFor = (w: WorldDef | null | undefined) => (TOKYO_LOCKED && w?.id === 'tokyo' ? 'In the works' : MEDIEVAL_LOCKED && styleOf(w) === 'medieval' ? 'Medieval' : 'RPG mode');
