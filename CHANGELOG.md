# Changelog

## 0.3.4 · 2026-11-12

Training together: the people you know can teach you what they're good at, you can teach them, or you trade lessons,
all agreed in conversation. It replaces apprentices. Tokyo gets a Streamer job, maps that light up at night and the
sounds of the city, and it is easier to find your way in: a Find button on the map, where to practise each skill,
notices you can read again, and the whole world you play, in detail, from inside the game. Your saves are upgraded
once (save format 6), with a backup kept in the save.

### Training together

- **Teach, be taught, or trade.** Someone who is good at something (level 6 or more, three levels above the learner)
  can teach it: a friend teaching you, you teaching a friend, or an exchange, each teaching the other (a Tokyo native
  teaching you Japanese while you help with their English). With someone who feels like a Friend or closer, two at a
  time.
- **Agreed in conversation.** Suggest it in your own words; after their reply the AI says whether they agreed, choosing
  only among what the rules allow. Yes starts it; no means it won't come up with them for four weeks, and it's a little
  awkward. Rarely, someone who'd make a good match is nudged to offer it if the talk turns that way, and characters may
  offer on their own: an offer comes as a card, Accept or Not now, and your answer goes to the scene.
- **Sessions** are an hour together, twice a week, from the things to do: the learner gains by the gap between you, up
  to a level below the teacher (Japanese 1 to 4 in about two and a half weeks with Chloe), and each one brings you
  closer. Two weeks without one and it lapses. The Profile lists your arrangements; adult skills are never taught this
  way.
- **Tokyo's 30 people are good at things of their own** (Genzō cooks at 10, Kyōko mixes drinks at 9, Natsuki games at
  9), on top of their languages and what their job asks. The World creator sets it for anyone.
- **Apprentices are gone,** in every world: an apprentice who had finished stays as a former apprentice; one halfway
  through (learning a trait) is dropped. The **Mentor** life goal counts teaching now, and Tokyo offers it.

### Tokyo

- **Streamer,** a new job: anyone can start streaming from their room, for very little at first (¥600 an hour). Then
  choose: games and chatting, slow to climb and poorly paid, toward esports or talk streams; or, with adult content on,
  adult streams, better paid from the start, toward a fan page of your own or a live studio. The adult path is open to
  women; anyone else needs Airi or Momo as a friend, or Sensuality 7.
- **The maps change at night.** Every district's map and the map of the whole city have a night picture, shown from
  18:00 to 05:00: Kabukichō's neon, Asakusa's lanterns, Tokyo Tower lit up, the bay bridge's lights and the moon on
  Hakone's lake. The pins stay where they were.
- **Tokyo sounds like Tokyo.** Every place plays real recordings in place of the sounds Mundi made itself: the
  crowds in a shopping street, an izakaya, Ameyoko's vendors, the Shibuya crossing, the Hibiya line, cicadas on summer
  days, a temple bell now and then, a typhoon's wind on the towers. As before, they follow the hour and how busy a
  place is, and stop while it's closed. They are other people's recordings, free to share (CC0 or CC BY), credited
  in `worlds/tokyo/sound/CREDITS.md`.
- **Career paths can ask for something** (shown closed with why), be adult-only, carry tags of their own and take longer
  or shorter; the World creator edits it all.

### Finding your way

- **The map has a Find button:** type part of a name to list every matching place on every map, with its district and
  the trip there, then show it on the map or go.
- **Where to practise.** Things to do show the skill they train; each skill on the Profile lists where to practise it,
  when each place offers it and what it waits for (evenings, once a day, a friend, being a regular). An action that
  rolls a skill trains it.
- **Notices** stay on screen as long as they need and count down one at a time; the ☰ menu has a Log of every notice
  of the session.
- **Cards that come to you show one at a time** (a plan coming up, then a street story, an invitation or a happening,
  then a chance meeting), and a meeting you leave without answering stays behind.
- **The whole world in detail.** ☰ → This world → World has "See everything about this world", and "In detail" on
  its needs, places and jobs: the World creator opens on the world you're playing, built-in ones included, only to
  look. Every tab and field is there (a job's ranks, pay, shifts, what it asks and its career paths; places, needs,
  courses, the shop…); nothing can be changed, and Back returns to the game.
- **The Jobs app sorts its openings** by pay, interview chance, where or days a week.
- **Updates:** the main menu checks for new commits on Mundi's branch through SillyTavern's extension manager and
  offers to update and reload.

### Fixes

- The map's card opens on a side of the pin clear of the HUD, and the things to do run down to whatever is under them.
- A character's menu is drawn above the chat box and the HUD's bars, so none of its buttons are hidden.
- The scene's text box has its padding back.
- Say sends a line that already quotes what's said as written, instead of wrapping it all in quotes.
- Everything new in Portuguese and Spanish.

## 0.3.3 · 2026-11-12

A university to study at, and a Tokyo that makes you work for it: harder job interviews, less money to start with,
introductions for the night jobs, and a dating app that takes its time. The World creator now edits every field of the
built-in worlds. Your saves open as they are: no save format change.

### University

- **Degrees at Tokyo's Hijiri University,** played the way The Sims does it: Economics, Japanese and English studies,
  Computer science, and Arts and design. A term is a season; each term you take two or three of the degree's modules,
  with classes on campus two weekdays, coursework hours each week, and a final.
- **Grades from A to F and a GPA.** An F is taken again; two weak terms put you on probation, a third gets you expelled.
  Pass eight modules and you graduate, and with a GPA of 3.5 or more the degree is distinguished: you start a rank up in
  the jobs it's for.
- **Being a student:** at most three shifts a week, only student homes (unless your family pays), and some jobs want a
  degree (the office hires only graduates). Tuition is paid each term, with aid for some.
- **The University student start begins enrolled,** on a scholarship that pays the tuition while each term's GPA holds.
- **The Campus app** follows it all: your degree, term, GPA, this term's modules with their classes, attendance and
  coursework, next term's choice, the scholarship and the clubs. The World creator gives any school degrees.

### Getting a job

- **Interviews are harder.** With nothing that helps, an interview is about 30% (it was 50–60%); each trait the job
  likes, the skill it uses and its course (finished or being taken) add to it, and careers that pay far above the usual
  are harder.
- **Asking every day no longer wins a long shot.** A 20 on the die no longer passes on its own, so a job beyond your
  reach shows "out of your reach for now" and won't see you. After a no you can try again the next day, then each no in
  a row at the same job waits longer (3 days, then a week): about four tries a season. A new season, getting better at
  what the job looks for, or a good word from someone there starts again.
- **Tokyo's women's night jobs** (the hostess clubs in Kabukichō and Yokohama, the pole club's dancers and the AV
  studios, with adult content on) take women from the listings. Anyone else needs an introduction (Sayuri for the
  hostess clubs, Lisa for the pole club, Airi or Momo or the scout's card for AV) or to be very good at it already
  (Charisma, Dance or Sensuality 7). Working at the love hotel is no longer an introduction. Men see the job as *AV
  actor*, with a harder interview.
- **World makers** can give any job a condition to be hired (a new `gender:` condition among them), make its interview
  harder or easier, and name a job differently on each track.

### Money, love and points

- **Tokyo's starts begin with less money,** about four weeks of rent and bills for most: Up from the countryside
  ¥80,000 (was ¥250,000), University student ¥70,000 (¥150,000), Tokyo born ¥40,000 (¥120,000), New in Japan ¥100,000
  (¥300,000), Family money ¥1,500,000 (¥3,000,000), Back after years away ¥60,000 (¥180,000), Down on your luck ¥15,000
  (¥40,000).
- **Spark takes its time.** Choose on your profile which genders you want to see. A like is answered one to four days
  later with a message, or never: matches start at 10% with nothing in common, and what you both look for, shared
  interests, a few words about yourself and your charm make a yes likelier. A match that came while you were away shows
  as "It's a match!" when you open the app.
- **Life points say where to spend them** (the Goals app's Rewards tab) until you first buy something.

### The World creator and the new game

- **The World creator edits every field of the built-in worlds,** Tokyo included: a lore entry's condition and marks,
  what a thing to do brings (its roll, outcomes, shared tables and their words), every street story, starts, keepsakes
  and gifts, a job's shifts and drinks after work, what a rank asks before a promotion, people's appointments,
  storylines, looks, voice, pictures and household, weather by climate, trains and taxis, places' hours by season,
  closed days, entry fees, sounds and pictures, and the scene's settings.
- **Change one of the world's starts for a new game** ("Change this start"): its money, home, whom you know, your skills
  and the premise. Starts you save keep their skills, and a start you live in with others (Tokyo's share house) keeps
  its home and says who you live with.

### Fixes

- With the hobbies system off, a hobby's level no longer adds to a roll (busking with Guitar got +2).
- Everything new in Portuguese and Spanish.

## 0.3.2 · 2026-11-11

Life goals with perks and life points to spend; and with adult content on, Tokyo's love life and night world have
something to play. Rent you can pay in part, and fixes for every world. Your saves open as they are: no save format
change, and your old aspirations carry over as life goals.

### Life goals and life points

- **Follow one life goal at a time** through its three or four steps. Switching pauses a goal and keeps what it had
  counted, so nothing is lost. Finishing one gives a **perk** that changes a number in the game for good (prices,
  energy, how fast skills train, a reroll a day…). There are 22 general goals, and Tokyo has 25 of its own, six of
  them adult. Your old aspirations and what you finished carry over.
- **Life points** come from steps and finished goals, and a little from small things (a first festival each year, a
  street story, a secret, a storyline you followed ending, a new keepsake, something you learn of a lover), at most 60
  a day from small things.
- **The rewards shop** (the Goals app's Rewards tab): a focused or lucky day, a second wind, a nudge to someone's
  feelings, clearing the air or a fresh start, forgiveness, an invitation, quieting a rumor, insight into someone,
  changing a trait, skipping a step, a rent holiday and a clean slate at work. Tokyo adds its shrine charms: the
  omikuji, four omamori, the daruma and the ema.
- **The Goals app** shows your goal's progress step by step, a few suggested goals and every goal by category; your
  perks are on your profile. The World creator writes a world's own goals, perks and rewards.

### Tokyo's adult progression (adult content only)

- **Private moments play.** A new skill, Sensuality, rolls each private moment: it can go great, good or awkward, and
  an awkward night costs nothing. You learn what someone likes and what they won't do; a hard limit stops the moment
  kindly, and you remember it. *Pillow talk* after a night, two lovers at once, and a night that happens only in the
  chat counts too.
- **Desire, and a drive for everyone.** A Desire need you pick the pace of (Low, Average or High drive, each with its
  trade-offs), and a drive for every character: when they're ready again, when they've been wanting you, when a
  partner gets frustrated. Someone who wants you may make the move in a scene; saying no costs nothing.
- **Who you are in bed:** *Leads*, *Follows* or *Switch*, the *Good in bed* strength, Shameless, the Kink interest
  (it counts on the dating app), and two habits. Flirtatious is a new personality trait for everyone.
- **Getting caught.** Some places are risky: a fee, a week's ban, a rumor, a partner who hears about it, and a raid
  at work.
- **Careers with a track for each gender.** The video industry opens to the player: actresses are scouted, actors
  need an introduction and start as extras. A new job, the esthe therapist at *Aroma Room Lily* in Shinjuku, works the
  men's esthe or women's services. Pole dance classes and a massage course lead into them.
- **Five adult goals and three shop items,** a profile of likes and limits for everyone, people you make and your own
  cards included, and the World creator edits all of it. Nothing of it exists with adult content off.

### Rent and fixes

- **Rent can be paid in part,** oldest week first. A bill that's cut off owes no more weeks, you're warned the day
  before the lock, and the Homes app says what gets you back in or where a cheaper home is. The *Tokyo born* start
  pays a family share of ¥10,000 a week instead of the whole house's rent.
- **A need that empties again drains from then,** not all the hours since it was last empty (hunger no longer takes
  days of health at once). Every world.
- **Things done with someone count for each of them** in life goals' steps.
- **A city event watched to its end counts as attended.** Tokyo's fireworks, beach, boats and street music go on in hot
  and humid weather. Club Hibiscus opens at 20:00 as its hours say, so helping Sayuri before the guests come is offered.
  A course's class is held at its place even before the place opens to the public.
- **A ready persona keeps its own description:** renaming it in the Library works, and changing a trait no longer
  touches it.
- Everything new in Portuguese and Spanish.

## 0.3.1 · 2026-11-11

Who you are, and courses that take weeks; gifts, private moments and your own additions to a world. Your saves open as
they are, moved once to the new traits and courses with a backup kept in the save.

### Who you are

- **Strengths start your skills.** In Tokyo and Porto Alto each strength you pick names the skill it starts ("Good
  cook · Cooking 3"); two on the same skill add only one more level. A persona made before converts too.
- **Personality does something small.** Each personality trait nudges one number, some with a cost: a calm person's
  mood drains slower, a shy one makes a cooler first impression but holds on to love, a serious one gains performance
  faster but enjoys parties less. The profile and the new game say what each one does.
- **Interests and habits.** Doing something that fits an interest lifts your mood a little more. Habits have names of
  their own (Gym regular, Home cook…) and make their skill train faster while you keep them.
- **The AI knows you** as you are now: your personality, interests and habits are told every turn.
- **No job is closed to your personality.** Jobs like who you are and ask for skills; interviews count your best skill
  for the job, the traits it likes and a course it asks for.
- **One roll bonus.** Actions, street stories and choices at work count the same thing: the roll's skill, and −2 each
  for very low energy or mood (street stories and work choices didn't have that before). Tokyo's cooking, workouts,
  running, busking and repairs train their skill, as Porto Alto's do.

### Courses that take weeks

- **Classes on a calendar.** A course lasts a share of the game year (a season course is about two weeks), with classes
  on its schedule or five days a week, one a day at most. Each class teaches a little of its skills; finishing gives
  you at least their levels, and the certificate jobs ask for.
- **Missing classes:** about one in ten is free; more add make-up classes that cost part of the fee, and too many fail
  the course (what you learned stays). A class during your shift counts as missed, and the window says before you
  enroll how many clash, and when they're more than the course lets you miss.
- **Two at once,** each a little slower. Long programs are paid by the season and wait when you can't pay; some have
  help with the fee from an employer, a school or the government.
- **Study while you work.** Jobs that ask for a course take you at a student rank while you study (a medical student,
  a nursing assistant), and your boss writes when your next rank needs a course.
- **Tokyo has 17 courses,** from Japanese for beginners to medical school, at their own places and times. Porto Alto's
  16 take weeks too. The World creator edits all of it, and a strengths group's skills and what each trait does.

### Gifts and private moments

- **Gifts:** buy them where they're sold. A romantic gift warms a crush or a partner; an intimate one only lands with
  someone drawn to you (handed back otherwise, refused past their limits, loved when it fits their profile). Things
  to do can use a gift you gave, and intimate profiles say how someone looks and how they are in bed.
- **Outfits from the game:** with adult content on, the people in a private moment wear their "naked" outfit and dress
  again after. A world's people can bring outfits of their own, and an outfit drawn with only a few expressions shows
  the nearest one.
- **Adult content stays hidden when it's off,** everywhere: adult actions are left out at any place, and people never
  run errands to an adult place.

### Worlds

- **Your own additions to a built-in world:** a file in SillyTavern's user files (`mundi-overlay-<world id>.json`)
  adds places, people, actions, lore and pictures when the world loads, marked adult if you want, never touching the
  world's own ids. The format is described at the top of `src/core/overlay.ts`.
- **Tokyo's maps:** every place and home sits where it belongs on its district's map.
- **New pictures reach your cards:** a world's sprite set can carry a version, and a card made before it changed gets
  the new expressions and outfits (Hannah's are fixed).
- **Translations:** everything new in Portuguese and Spanish.

### Your existing games

Converted once, with a backup kept in the save, and a message the first time you open one: strengths you picked
become skill levels, finished courses give their new skills, the traits old courses and finished life goals gave
are taken away (your old lists are kept), a course you were taking goes on under its new length, and a doctor's or
nurse's rank moves up one where those careers have a new student rank. Custom worlds keep their traits as they were.

## 0.3.0 · 2026-11-10

This fork's first release, on top of Mundi 0.2.1: a new world, Tokyo, and relationships, work and daily life
reworked. Your saves open as they are, upgraded once with a backup kept in the save.

### Tokyo, a new world

- **Eight districts and two getaways:** Shibuya, Shinjuku, Shimokita and Kōenji, Akihabara, Asakusa and Ueno,
  Marunouchi and Ginza, Odaiba, Roppongi, and trips to Yokohama and Hakone. 88 places and 30 people with their own
  homes, jobs, routines, secrets and storylines.
- **Getting around:** trips between districts take the train's time for the distance. After the last train it's a
  taxi or a wait for the first one, and people out late miss it too.
- **Pictures:** every place has its own anime background for morning, afternoon and night, a rainy one, and snow,
  cherry blossom or autumn leaves where they belong. All 30 people have a portrait and 28 expressions, and each
  district has an illustrated map.
- **Tokyo's year:** 31 festivals and events (cherry blossoms, Golden Week, Sanja Matsuri, Tanabata, the Sumida
  fireworks, Bon Odori, New Year's at the shrine…), typhoons that stop the city, heat waves and the odd snow day.
- **Life there:** 43 jobs with their ranks, drinks with colleagues after work, senpai and kōhai, names that change as
  you get closer (from family name and -san to first names), praying and drawing omikuji at the shrines, place
  sounds, a language barrier if you start as a foreigner, seven starts and 70 small stories at the places.

### Relationships

- **Feelings go both ways.** Everyone feels their own way about everyone else; people can come to dislike or hate
  you, and a crush can still outweigh it.
- **Friendship and romance are separate.** Romance fades when you stop seeing each other, partners can leave you,
  something casual is possible, and exes are remembered as exes.
- **Scenes count.** Each scene is judged when it ends; swiping or editing replies no longer stacks changes.
- **Who people are:** a gender, an attraction, a way of being about intimacy and an exclusive or open style, which
  your AI can suggest from the cards.
- **People take the initiative:** they open up, confess, ask you out, text you, warn you before a breakup, hold
  grudges until you apologize, get jealous and talk about you. The world's people make friends, date, marry and break
  up among themselves.
- **Family is family:** many more family ties (half-siblings, grandparents, aunts and uncles, cousins, step-family,
  in-laws, godparents, guardians), kept apart from feelings. See [Relationships in this fork](docs/relationships.md).

### Living and working

- **Jobs with a working week:** shifts and days off in the Calendar and the Jobs app, performance, and promotions that
  say what they still need. Sick days, vacations and lateness follow work rules you can ease (Realistic, Reduced,
  Relaxed), and you can set the career speed.
- **The world's people work too,** with their own shifts, days off and vacations.
- **Skills:** hobbies became skills that level up; things you do and courses train them.
- **Couples go out** on dates a couple of evenings a week.
- **A new game your way:** choose the world's people one by one, begin from a start (who you are, your home, money,
  job and who you know) or write your own, and one switch for adult content.
- **The AI knows the scene better:** what the people in a crowded place share is said once, and results written for
  you reach it as what you were told. The world's lorebook stays small in every request.

### Other

- **A color for each speaker's dialogue,** chosen by your AI to fit the characters (Chat look, ☰ menu).
- **Pictures that follow the weather and the season:** a place can have a picture for a weather in a season
  (`rain-autumn-day`), tried before the others. See [Other improvements](docs/improvements.md).
- **Expression sprites in any format:** a world's WebP or AVIF sprites are saved to the card under their own type
  (they used to be saved as .png).

## 0.2.1 · 2026-10-28

Fixes and improvements for Home mode.

### Security

Thanks to **coldasblues**, whose fork found these.

- **World files can no longer run code.** Picture addresses, numbers and colors from a world file (yours or one
  you imported) went into the page's styles as they were, and a crafted file could run code inside SillyTavern.
  Now a picture can only be a picture, numbers stay numbers and colors stay colors, and everything Mundi draws
  is cleaned of anything that could run code.
- **Slash commands:** text sent through SillyTavern's commands (lines, narration, read aloud, pictures) can no
  longer carry an STscript `{: … :}` block.
- **Importing a world** only uses the pictures inside the file: nothing is downloaded from other sites.
- **Messages can't press Mundi's buttons:** a reply (or a card, or a shared chat) with HTML that copied Mundi's
  controls could make a click do something in Mundi. Those controls are now removed from what messages show.
- **Pictures from links in messages** now follow SillyTavern's "Forbid external media" (a picture from another
  site tells that site you are reading). To show them anyway: Chat look → Show pictures from links.
- **Every attribute filled from a world, a card or a save is escaped**, also in the world creator's fields, and a
  currency symbol or an icon can't carry HTML.

### Visitors (Home)

- **Invite people over** from the Calendar (a new Visits tab). They arrive about an hour later and stay until
  you say goodbye.
- **The doorbell:** when they arrive, it rings. Open the door yourself, or someone else answers after a while.
  If you are out, they are let in.
- **Where they sleep:** a free bedroom, your room or a housemate's room, chosen for each guest (and changeable
  while they stay).
- **Guests' rooms** are always open to you, and saying goodbye in their room no longer leaves you in the dark.

### Parties and going out

- **Guests from outside:** a party can invite people who don't live in the house. They come at the start and go
  home at the end, unless you ask them to stay after the party.
- **A party out of the house:** pick the place and its background.
- **Edit the guests** of a planned party on its card (Edit guests), next to Call it off.
- **Go out** with anyone from your cast or your library, and pick the background. A date "somewhere out" can
  have its own background too.
- **Sleeping through plans:** going to sleep when a party or a date is coming asks first. "Sleep until the
  party" (or the date) wakes you up just in time.

### Looks and sound

- **The AI narrates what you do right away** (Things to do, in a scene). On by default.
- **AI calls in one place:** This world → AI context lists everything that makes Mundi call the AI (narrating what
  you do, the diary, characters' texts, Chirp posts and pictures), each with its own switch. New: characters' texts
  can use short ready-made replies instead of the AI.
- **Rain and storm sounds**, with their own switch and volume (Settings → Weather sounds).
- **Cards layout:** sprites on the left or the right.
- **Visual novel:** the dialog box on the left, with an adjustable width.
- **Backgrounds** fade into each other when you move.
- **Character picker:** folders keep their color.

### Home

- **This Home** comes first in the menu and holds the Home settings.
- **Company stays:** someone who comes along with you stays until you part (no timer), and can go to your room
  with you.
- **More kinds of family ties.**
- **Bedroom doors:** someone's room when they're not in is locked (no more ringing a doorbell inside the house); when
  they're in, you knock.
- **The menu** no longer repeats "Go to my room" and "Go out" (they're on the top bar).
- **What you can do fits the room:** eating and drinking in the kitchen (everything) and the dining room (a meal, a
  coffee, a drink, a snack); the TV and the new **Play video games** in the living room; washing up (a shower, the
  new **Brush your teeth**) in the bathrooms. Rooms you set up yourself in the Home creator keep your choice.
- **Things to do in each room:** swim, sunbathe or relax by the pool; do the laundry; tinker or wash the car in the
  garage; sit on the porch or water the plants; tidy up the storage room; set the table; read in bed. Working out
  (the treadmill too) is in the gym.
  Your own Homes get the same: a room called "Piscina", "Garage", "Banheiro"… gets the actions of that kind of room
  (by its name, in English, Portuguese or Spanish).
- **Homes you made before** are brought up to date when they open: they get the actions added since and lose built-in
  ones that no longer exist. Actions you made yourself are never touched, and one you remove stays removed.
- **Go out** from the garage and the entrance too, not only from the floor plan.
- **Go somewhere else:** when you are out, go on to another place (the cinema, then the mall, then a restaurant…)
  with its own name and background; who is with you comes along.
- **Running into someone:** stopping to talk no longer makes them follow you. They stay where you met for a while.
- **New pictures** for Stella and Seraphina in the tour.
- **Needs, if you want them:** This Home → Needs turns on hunger, thirst, mood and hygiene for this game (off by
  default). Their icons show under the clock, they drop with time, and the AI is told when one is low. No energy, and
  nothing bad happens when one runs out.
- **The Advanced switch** at the top of This Home is easier to see.

### First steps, tour and gallery

- **Choose your language first:** the first time Mundi opens, before Stella shows up, a window asks only for the
  language (English, Português (Brasil), Español). The welcome and the tour then come in that language.
- **Stella's tour box** stays in the same place and the same size on every step, so the buttons (Skip tour, back,
  Next) never move. The text is bigger, the step count sits next to the buttons, and Stella is shown whole from the
  waist up, standing on the box's bottom line.
- **Gallery:** two tabs, **Saves** and **Character greetings**. Saves are one grid, newest first, with the game's
  name under each album (before, every game had its own row, so it looked like a list).
- **Settings → Game → What's new** opens this version's changelog instead of the tour.
- **The Old Manor** has a cover picture.

### Fixes

- **Playful slaps and teasing** no longer cost bond: a harsh line only counts if the character takes it badly (the
  emotion of their reply, or, without the Expressions extension, the words of it: they laugh, or they pull away in
  tears). Said with a grin, "de leve", "playfully"… it doesn't count at all.
- **Family and ties:** someone added later as your spouse (or fiancé, or partner) shows as Married (Engaged,
  Dating) and is no longer a stranger. Before, this only worked when set while creating the game.
- **Rooms off the floor plan:** a guest sleeping in a shared room no longer creates a room that isn't on the plan.
- **Scene background:** the floor plan no longer gets stuck in the background after you move.
- **The phone** no longer slides in again when a dialog opens.
- **Exporting a world** now takes along the backgrounds you picked from your own SillyTavern (My backgrounds),
  so the person who imports it sees them too.

## 0.2.0 · 2026-10-25

Everything since 0.1.0 (the last version on GitHub, commit `33837e1`).

### Highlights

- **Home**, a new way to play: one house, the characters you choose, and pure role-play.
- **Porto Alto**:
  - a picture for every place;
  - three kinds of apartments and houses;
  - a new gym and a new cinema.
- **A living world**: people with full days, places that get busy and quiet, day and night, and news from the
  lives of the people you know.
- **The interface in Português (Brasil) and Español.**
- **Save safety**: migrations, automatic backups and branches.
- **The RPG mode and the medieval style** are built but locked ("Soon") while they get finished.

### Home mode (new)

- **What a Home is:** a house and the characters who live in it, with no work, money or bills. Life outside
  happens off-screen.
- **Two ready Homes:**
  - The Shared House (modern, three floors, ten bedrooms, a new Entrance);
  - The Old Manor (medieval, locked for now).
- **The Home creator:**
  - premise;
  - rooms;
  - bedrooms;
  - cover picture, which can also be one of the room pictures.
- **New game in a Home:**
  - choose the rooms the house has;
  - choose what can be done in each room;
  - add rooms of your own;
  - write your situation, or let your AI write the premise from lorebooks.
- **Floor plan (optional):**
  - one picture per floor, with day, afternoon and night versions;
  - each room drawn as a box: drag to move, drag the corner to resize;
  - floor buttons with the faces of who is on each floor;
  - a red "!" marks rooms not on the plan;
  - without a plan picture, the room pictures are grouped by floor.
- **Time:**
  - the clock moves a few minutes with each message (can be turned off);
  - click the clock to let time pass;
  - sleeping brings you back to where you went to bed.
- **Go out:**
  - write where you are going, pick who comes and a background;
  - the scene out there is free, like a chat;
  - **Back home** asks first.
- **Who lives here:**
  - change bedrooms (two people in one bedroom share it, and the AI knows);
  - someone can move in or move out during the game, with a confirmation.
- **Dress code per room:** an outfit folder from the character's Expressions (swimsuit at the pool, pajamas in
  the bedrooms…). The AI is told what people wear.
- **Housemates:**
  - can go out for a while, or stay in;
  - each can have a job written in your own words, with a shift.
- **House party:** free; everyone leaves their rooms for the common areas.
- **This Home settings:**
  - Bedrooms, Home and Dress code;
  - a new **The house** tab: rooms on or off, what can be done in each, your own rooms, and the floor plan (for
    Homes you made).
- **Difficulty** in a Home changes how fast bonds grow.
- **One long conversation:** moving between rooms or going out no longer hides what was just said from the AI.
  Only sleeping starts a new day.
- **Bathrooms and shower rooms** no longer offer snacks or drinks.
- **Liquid-glass windows:** Let time pass, Go out, Back home, Who lives here and the pickers.

### Porto Alto

- **Pictures:** a background for every place (45) and for six kinds of home:
  - small apartment, apartment, penthouse;
  - small house, house, villa.
- **New places:**
  - **Palm Coast Gym**, apart from the **Stadium**;
  - **Cineplex** in Midtown ("Watch a movie" moved there).
- **The elevator ride** when arriving at an apartment was removed.
- **Map cards:** a place with a long card (many jobs) now shows it beside the pin, so the pin can still be clicked.
- **The HUD on maps:** the clock, the place name and the map tabs never overlap, at any HUD size.

### Life in the world

- **Day and night:**
  - opening hours;
  - prices and the mood of the streets by part of the day;
  - a picture per part of the day for places, homes and maps.
- **Regions:** each has a crowd level, a public mood, tension, weather and prices that drift day by day.
- **People's days:**
  - routines get interrupted (sick at home, errands, working late);
  - places remember regulars;
  - over the weeks, couples get engaged, marry or break up, and people get promoted.
- **Things that come to you:**
  - neighbors knocking;
  - friends asking your advice;
  - news of birthdays, promotions and weddings.
- **City events** (shows, matches, fairs, open mic) and **festivals**, in the calendar.
- **Hobbies** that level up: some jobs ask for a level, and it raises what they pay.
- **Habits that become traits** (Early riser…), and fade when you stop.
- **Other systems** (each can be turned on or off per world in the World creator):
  - reputation per town and secret identities;
  - pets;
  - apprentices;
  - letters from friends in other towns;
  - schools with exams and clubs;
  - factions and guilds;
  - the realm and its gods;
  - trade and smuggling;
  - property, businesses, a garden and loans;
  - taxes;
  - crime and prison;
  - celestial events.
- **The AI context:** a token budget, with the least important blocks dropped first. Each block's text can be
  edited, and you can add your own instructions.

### Characters, scene and chat

- **Sprites:**
  - overlap like a stage, and whoever spoke last stands in front;
  - click a sprite for a radial menu with actions and outfits.
- **Outfits:** subfolders of a character's Expressions (pajamas, swimsuit…).
- **Persona:**
  - switch persona in a chat or a Home, optionally renaming your earlier lines;
  - **Play as** in a World now has **Use another persona** too.
- **Chat look:**
  - visual novel, Classic or Cards;
  - sizes and colors with transparency;
  - colors from a SillyTavern theme;
  - presets (Midnight Glass, Rose Dusk, Forest Calm, and your own, saved as SillyTavern themes).
- **Images:**
  - pictures in messages, with a lightbox;
  - an Image Generation button;
  - TTS and Speech Recognition support (Settings → Add-ons).
- **Background pickers:** two sources, **My backgrounds** (SillyTavern's) and **Mundi** (the pictures of Mundi's
  worlds).

### Library

- **Folders** for characters, personas and lorebooks:
  - drag cards into folders (they move, nothing is copied);
  - rename, color, sort and export a folder as a zip.
- **Sorting:** by name, date, last chat, tokens or entries. Folders follow the same order.
- **Characters:**
  - alternate greetings;
  - tags;
  - expressions and outfits;
  - export as PNG or JSON;
  - the saves they are in.
- **People presets:** a group of characters with their households and relations, usable in any world.

### World creator

- **More tabs:**
  - Words (lexicon);
  - Character creation;
  - Customs & calendar;
  - Realm & factions;
  - Economy & skies;
  - RPG (locked).
- **Setup:** systems on or off, game modes, style and skin.
- **Maps:** per-period pictures, opening hours, crowd and region mood.
- **Homes:**
  - expenses (water, power, firewood…);
  - things that break at home;
  - the house maps editor for Homes.
- **New world:** start from a ready world or from nothing; the name field is highlighted if it is missing.

### Saves

- **Migrations** keep old saves working.
- **Automatic backups** (the last 3) before a migration or a repair; restore them in Settings → Game.
- **Make a branch:** a copy of the save as it is now.
- **A save from a newer Mundi** opens read-only.
- **A room added to a Home after the game started** is turned on by itself.

### Languages

- **Português (Brasil) and Español**, in Settings → Interface → Language. Only Mundi's own screens are
  translated: the worlds' places and people and the story keep their own language.

### Updates and onboarding

- **What's new:** after an update, a window with what's new, and a short tour by Stella of only the new things.
- **Update notice:** on the main menu, a small note when a newer Mundi is on GitHub, with an Update button.
- **Stella's tour** has a **Home** part. Settings → Game can replay any part, or only what's new.
- **Help** has its own topics in a Home: time and sleep, the house, going out.

### Look and settings

- **Settings tabs:** Game, Sound, Interface, Add-ons.
- **Look:**
  - date and time formats;
  - fonts;
  - theme and secondary colors;
  - skins;
  - separate scales for phones.
- **Background music:** menu, world and home, with crossfades.
- **Main menu:** a map behind it, and the real version in the footer.
- **World cards** show only the cover (no slideshow).

### Locked for a later update

- **The RPG mode:**
  - character sheet, classes, magic, quests;
  - combat (tactical or narrative), party and sellswords;
  - journeys, towers, contracts, crafting, artifacts, legends.

  Worlds made for it, like **Nova Vega**, show "Soon".
- **The medieval style:**
  - **Valdoria** in Life-Sim, with the journal in place of a phone: letters, a market of pinned notes, a medieval
    almanac, lodgings by town;
  - **The Old Manor** Home.

  They show "Soon · Medieval".
