# Plan: editing the world from inside a game

In a game, ☰ → This world (`src/ui/worldcfg.ts`) edits only the save's own data: its people, their feelings, family
and households, the save's choices about the rules (difficulty, work preset, relationship pace, travel, how fast
needs drop), the Author's Note and lorebooks. The world itself (places, jobs, needs, things to do…) is only listed.
Everything the world creator (`src/ui/creator.ts`) can change should be changeable from a running game too.

## What there is already

- The creator can be opened from a game: a Home's "Edit the floor plan and pictures" does it (`wc-house-plan`), and
  the game uses the edited Home from then on.
- `repair()` in `src/core/saves.ts` mends a save whose world changed: places, neighborhoods, jobs, ranks, career paths
  and courses that are gone, needs that were added, homes whose spot moved, plans at places that are gone. It runs
  in `checkSave()`, so only when a save is opened, and backs the save up first.
- The games list (`settings().games`, one `GameEntry` per game, with its `world`) says which games use which world.

## Limitations

1. **Only worlds you made yourself can be edited.** The built-in worlds (Porto Alto, Tokyo…) ship with Mundi; the
   creator only opens worlds listed in `customWorlds()`. A game in a built-in world gets its own copy of the world
   first (see below).
2. **A world file is shared.** Editing your own world in one game changes it for every game that uses it. The others
   are repaired, with a backup and a note, the next time they're opened. The creator says so when opened from a game.
3. **Some of the creator only matters when a game starts.** Changing it in a running game does nothing:
   - People & routines: each person's home, household, family ties, age and starting feelings are copied into the
     save when the game is made (`startNewGame` in `src/sim/game.ts`). Their stories, rituals and daily plans are read as
     the game plays and do apply.
   - Starts and Character creation.
   These are labelled "only for new games" when the creator is opened from a game. The game's own people stay in
   This world → People.
4. **`repair()` doesn't cover everything.** It doesn't check owned goods, businesses, crops, goals and rewards in
   progress, traits or factions. Deleting one of those from the world could leave the save pointing at something
   that's gone, so either the creator refuses to delete what this game uses ("in use in this game"), or `repair()`
   learns to handle them first.
5. **Some changes can't be made mid-game:** game mode, Home or world, and style. They're locked, and Delete is hidden
   (deleting the world makes the game impossible to open).
6. **Systems switched on or off** (Features) should mostly be fine, since a system does nothing when off. Edge cases
   such as switching jobs off while you have one need checking.
7. **World defaults and this game's choices.** Work preset, relationship pace and difficulty exist in both. When the
   game has its own choice, changing the world's default changes nothing in it; the creator shows a hint ("this game
   uses its own setting: This world → World").
8. **The creator saves in one go**, while This world applies each change at once. After a save from a game: run
   `repair()` on the game that's open (backup first), then refresh the scene (`syncScene`), the AI prompt
   (`refreshPrompt`) and the lorebooks (`applyGameLore`). With the running clock on, the game pauses while the creator
   is open.

## A built-in world: a copy for this game

"Make it my own for this game" copies the world (`newWorldFrom(id, 'copy', …)`) and moves the game onto the copy.

### The world's id is the game's random seed

`g.world` seeds about 45 random rolls: people's birthdays (`birthdayOf`), the weather, daily routines, dates and
rituals (`dayplan.ts`), prices (`economy.ts`), city events, letters, training hints and more. A copy has a new id,
so moving onto it would quietly move everyone's birthday, change the weather and reshuffle everyone's days.

Fix: a `seedOf(g)` helper returning `g.seed ?? g.world`, used by all those rolls. Switching worlds sets `g.seed` to
the old id, so nothing moves. It's a new field read with a default: no change to the save format (`SCHEMA`).

### Other places that remember a world's id

- **The games list:** `enterGame` loads `entry.world` before opening the save, so the entry moves to the copy too.
- **The world's own people:** cards are matched by `exampleTag` (`ex.from ?? w.id`), and a copy already sets
  `from` to the original's id, so the game's people stay linked to their cards.
- **Cards added later:** a card remembers the job, home and routine it had in its world (`meta.world === w.id` in
  `resident()`). The copy records `copyOf` (the original's id) and these checks accept it.
- **The game mode setting** compares the game with the current world, so it follows the switch.

### What the copy keeps and loses

- **Keeps** every id (places, jobs, homes, courses), so `repair()` should find nothing to mend; the pictures (their
  paths point into Mundi's folder); and whatever a private overlay (`src/core/overlay.ts`) added when the copy was made.
- **Loses Mundi's updates to the original:** new places, jobs, lore and fixes don't reach the copy, and a picture an
  update renames or removes goes missing in it. New world fields still get their defaults (`upgradeWorld()` runs on
  your own worlds too).
- **Loses translations:** the copy is written in the interface language at the time of copying (your own worlds have
  no translation dictionaries). Later changes to the overlay file don't reach it either.
- **Size:** Tokyo's copy is a file of about 1.1 MB in SillyTavern's user files.

## Steps

1. **The seed:** `seedOf(g)` and its call sites. A Node check against `dist/` that birthdays, weather and routines
   come out the same before and after a switch.
2. **"Make it my own for this game"** in This world → World, for a built-in world (your own world goes straight to
   the creator): back up the save (`backup()`); copy the world as "<world> · <game title>" with `copyOf`, keeping its
   mode and `madeFor` as Duplicate does; set `g.seed`; move `g.world` and the games-list entry to the copy; run
   `repair()`, refresh, and open the creator.
3. **The creator opened from a game:** "Edit this world" in This world; Delete hidden; game mode and Home or world
   locked; tabs that only matter for new games labelled; the running clock paused; after Save, `repair()` on the open
   game and a refresh; a note when other games use the same world. Delete in New game warns too when games use the
   world.
4. **Card links:** `copyOf` accepted wherever a card's remembered world is compared.
5. **Safe deletions:** the creator refuses to delete what this game uses, or `repair()` handles goods, businesses,
   goals, traits and factions.
6. **Later, if wanted:**
   - "Go back to <original>": the ids match, the seed stays, and `repair()` drops what only the copy had.
   - "Bring in what's new from <original>": add the original's new items to the copy without overwriting your edits.
   - The creator's richer editors (the routine editor instead of a choice of templates) in This world → People,
     bound to the save the way `personPanel` already works for both.
