# Save safety

A save is hours of a player's life. No update may break one. These rules and checks keep it that way.

## Rules

- **`v: 1` never changes.** It is how Mundi recognizes a chat as a save. Changing it would hide every save.
- **The save format is `schema`** (`src/core/saves.ts`). When an update changes how something is stored, raise
  `SCHEMA` and add a migration to `MIGRATIONS`. A migration runs once, in order, on older saves, and must be safe to
  run twice. Never delete or rename a field without a migration.
- **Backups are automatic.** Before a migration or a repair changes a save, a copy is kept in the chat
  (`mundi_backups`, the last 3), restorable in Settings → Game → This save.
- **Ids in built-in worlds are permanent.** Saves point to jobs, places, home areas, courses… by id. Rename things by
  changing their `name`; never remove an id or lower a job's number of ranks. `tests/ids.mjs` fails the build if you do.
- **Links to a world that changed are repaired, not crashed on.** A job, home area, place, plan or course the world no
  longer has falls back to something safe, with a notice (`repair` in `saves.ts`). Custom worlds change freely.
- **A save from a newer Mundi is never written.** It is played as a detached copy, read-only, with a warning.

## Checks (run by `build.sh`)

- `node tests/ids.mjs`: built-in worlds still have every id in `ids.lock.json`. `--update` adds new ids (the lock only grows).
- `node tests/saves.test.mjs`: every save in `fixtures/` opens with the current build without losing a value, keeps an
  exact backup, plays a week, draws its screens; plus a changed world, a newer save, a new save and a restore.

## Parity (also run by `build.sh`)

- `node tests/systems.test.mjs`: each system turned off in turn (needs, jobs, bills, courses, shop, breakdowns,
  plans, romance, children, social, rumors, diary, goals) in both built-in worlds: its apps and prompt blocks are
  gone, two weeks pass without it running, the screens still draw, and nothing in the save is lost (bills turned
  back on owe nothing old).
- `node tests/prompt.test.mjs`: the prompt's editable texts (a block's own text around `{text}`, the rules of the
  scene, your own instructions) land where they should; untouched, the prompt is exactly Mundi's.
- `node tests/world.test.mjs`: the living world. Regions (maps) keep their public mood, tension and prices in range
  and the same days always give the same world; places are busier at the right hours; prices follow the region; a
  region with a weather of its own keeps it; with the system off nothing is kept or sent.
- `node tests/daylife.test.mjs`: routines interrupted (sick, errands, visits, working late) put people where they
  should be, always the same for the same day; places remember visits, who works there and where people last saw
  you; a need left at zero becomes a crisis once, seen and remembered by the people there.
- `node tests/rumors.test.mjs`: lore that switches on with season, tension, region, days or a daily chance; world
  rumors (lore marked as a rumor) start with two people, spread, get garbled, can be overheard and die out; couples
  move on (engaged, married and moving in, or breaking up) and people get promoted over the weeks.
- `node tests/daynight.test.mjs`: opening hours (built-in places have their own, others close like their kind), a
  closed place has nothing to do and nobody out for leisure, prices by the part of the day, the evening livelier than
  dawn, and pictures for each part of the day.
- `node tests/social.test.mjs`: career paths (a choice at ranks 3, 6 and 9; every way up has 10 ranks; a lost path
  is dropped from a save, the rank kept), a good word from someone at rank 3+, neighbors (welcome, knocks; none
  without 2 people in your area), advice that changes a friend's life and comes back days later, birthdays, and the
  number of cards each mode needs.
- `node tests/rpg.test.mjs`: the RPG sheet (point buy, backgrounds, hit points = the life need, levels, subclass,
  attribute points), d20 checks with advantage, the AI judge's answer and social checks, quests from the world,
  titles, magic (casting, preparing after a rest, learning), journeys with camp, the RPG bill by the Lexicon, Life-Sim
  of the same world untouched, and memories carried from another game.
- `node tests/hobbies.test.mjs`: city events on their weekdays (every N weeks), called off by rain, in the calendar and the
  prompt, crowds at the place, the "I'll go" reminder, once per event; hobbies that level with practice, add to their
  rolls, pay more, open jobs, and are known by the AI; with the systems off, nothing.
- `node tests/parity.test.mjs`: every field of a built-in world can be made in the world creator (a form field on
  some tab, or one of the creator's tools listed in `TOOLS`). A new field nobody can edit fails the build.

## Fixtures

`fixtures/` holds saves made by released versions. Before each release, add saves from it:

    git worktree add /tmp/old <release tag or commit>
    node tests/make-fixture.mjs /tmp/old modern tests/fixtures/v<version>-modern.json

Real saves from players are the best fixtures: the `mundi` object in a chat's metadata (first line of the group
chat's `.jsonl`) can be saved here as a `.json` file.
