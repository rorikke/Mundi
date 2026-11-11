# Other improvements in this fork

Besides its work on relationships ([Relationships in this fork](relationships.md)), this fork of
[Mundi](https://github.com/tjalis/Mundi) adds improvements of other kinds. This page describes them from a player's
point of view, and grows as new ones arrive.

- [A color for each speaker's dialogue](#a-color-for-each-speakers-dialogue)
- [Pictures that follow the weather and the season](#pictures-that-follow-the-weather-and-the-season)
- [Who you are, and courses that take weeks](#who-you-are-and-courses-that-take-weeks)
- [Life goals and life points](#life-goals-and-life-points)

## A color for each speaker's dialogue

In a busy scene it's easy to lose track of who said what. With this on, what each person says takes their own color.

- **Turning it on.** In Chat look (the ☰ menu), check **Color each speaker's dialogue**. It's off until you turn it on.
  The quoted words in each line ("…") and the speaker's name take that person's color; the narrator keeps the usual
  color. Leave it off if your chat preset or regex scripts already color quotes.
- **Colors that fit the characters.** Your AI chooses them: it reads how each card describes the character (hair, eyes,
  clothes), looks at the colors of their avatar and expression sprites, and knows who is often together (a household, a
  couple, family, good friends), so those people get colors that are easy to tell apart.
- **Always readable.** Mundi adjusts every color to read well on the dialogue box and keeps everyone's colors apart.
  While your AI is still choosing, or if it can't answer, everyone gets an automatic color, so no line goes without one.
- **Colors stay.** They're kept in the save, so nobody's color changes by itself. Someone new gets one when they first
  appear; a color your AI chose only moves if it's too close to someone that person is often with.
- **Yours to change.** Chat look lists everyone in the game with their color and where it came from (your choice, set
  on the card, chosen by your AI, automatic). Pick a color there, or on a person's page in the People tab: a
  character's color is saved on their card, so every game with them uses it; yours is kept for your persona. The undo
  button gives someone back a color your AI chooses, and **Pick colors again** asks your AI for a new set while keeping
  the colors you chose.

A note on AI usage: choosing colors is one short background request when people need them (a new game, someone new,
or "Pick colors again").

## Pictures that follow the weather and the season

A place's picture changes with the time of day, the weather and the season, where the world has a picture for them.
Tokyo has one for every outdoor place in the rain, at every time of day, plus snow in Hakone and at the shrines,
cherry blossom and autumn leaves in the parks, and bare trees in winter.

- **The best match wins.** Mundi looks for a picture of the weather and the season together first (rain in autumn),
  then the weather at that time of day (rain at night), then the season (autumn by day), then the usual picture. So a
  park whose usual picture is in blossom shows green leaves in summer, red ones in autumn, and the right leaves in the
  rain too.
- **For world makers.** In a place's `bgs`, a key is the time of day (`day`, `afternoon`, `night`), a look and the time
  (`rain-night`, `autumn-day`), or two looks and the time (`rain-autumn-day`). Looks are the weather's kinds (`rain`
  covers heavy rain and storms too, `snow`…) and the seasons. A home kind's `images` work the same way.
- **Expression sprites in any format.** A world's sprites can be PNG, WebP or AVIF (Tokyo's are AVIF, about half the
  size); each is saved to the card under its own type.

## Who you are, and courses that take weeks

In Tokyo and Porto Alto, what you're good at is a skill, who you are is your personality, interests and habits, and a
course teaches you skills over a few weeks.

### Strengths start your skills

- **Two strengths, each a skill level.** When you make your character, each strength names the skill it starts:
  "Good cook · Cooking 3", "Charming · Charisma 3". Two strengths on the same skill add only one more level (Strong and
  Athletic: Fitness 4). A start that already gives you a higher level keeps it.
- **Your own personas convert too.** A persona made before keeps its picks, and a new game turns them into levels the
  same way.
- Worlds without skills (the Shared House, for example) keep these choices as traits, as before.

### Personality

Your three personality traits tell your employers who you are, are told to the AI every turn, and each does one small
thing (a few cost you something too, so no choice is simply best):

| Trait | What it does |
|---|---|
| Outgoing | a warmer first impression, and friendships grow a little faster |
| Shy | a cooler first impression, but romance fades more slowly |
| Calm | mood drains 10% slower |
| Hot-headed | +1 on fitness and dance rolls, but mood drains 10% faster |
| Cheerful | +1 mood every morning |
| Serious | performance at work grows 10% faster, but parties give 10% less mood |
| Romantic | romance from dates +10% |
| Ambitious | ranks take 5% less time, but a morning without a job costs 1 mood |
| Lazy | energy drains 10% slower, but performance grows 10% slower |
| Curious | skills train 15% faster up to level 3 |
| Kind | gifts give 10% more friendship |
| Sarcastic | friendships with good friends grow 10% faster, first impressions are cooler |

Each trait's line is shown when you pick it and on your profile ("Who you are").

### Interests and habits

- **Interests** still fill your dating profile, and doing something that fits one lifts your mood a little more:
  playing music with Music, a round of games with Games, cooking with Cooking.
- **Habits have names of their own.** Work out often and you become a Gym regular; cook often and you're a Home cook
  (in Tokyo also a Karaoke regular or an Izakaya regular). While you keep a habit, its skill trains 10% faster.
- **The AI knows who you are.** Your personality, interests and habits are told to it every turn, so they stay true
  after a habit comes or goes.

### Jobs and rolls

- **No job is closed to your personality.** Jobs like some personalities and interests: each one you have makes every
  rank a little shorter and helps at the interview. The interview also counts the skill the job uses most (+1 for every
  two levels, up to +4) and a course it asks for, once you've finished it.
- **One bonus for every roll.** Things you do, choices in street stories and choices at work all add the same bonus:
  +1 for every two levels of the skill they use, and −2 each when you're exhausted or miserable.
- **Practice trains in Tokyo.** Cooking at home trains Cooking; working out and running train Fitness; busking trains
  Music; fixing things trains Logic.

### Courses take weeks

- **A course lasts as long as the calendar says**: a short class about a week, most courses a season, the long programs
  up to about half a game year. It follows your season length and work rules (on Reduced, everything is a fifth
  shorter).
- **Classes.** A course has a set number of classes, 2 hours each, at most one a day: on its schedule ("Mon, Wed, Fri ·
  18:30–20:30") at its own place, or, for one without a schedule, any five days a week at home or a place to study.
  Every class teaches a little of its skills, and finishing gives you their levels for good. If you're already good,
  the classes still teach you something.
- **Missing classes.** About one class in ten can be missed freely (at least one). After that, each missed class adds a
  make-up class at the end, which usually costs part of the fee; miss more than a fifth (at least two) and you fail the course: what you
  learned stays, but there's no certificate. Enroll again within a year and half the classes you attended count
  (once), though the fee is paid again. Your phone warns you when you've used half your free misses, all of them, and when one more would fail you.
- **Work comes first.** A class during your shift counts as missed. The courses window tells you before you enroll how
  many classes clash with your shifts; take a day off, or pick a course that fits your week.
- **Two at once.** You can take two courses, but each class then counts a little less, so each takes about a fifth
  longer (14 classes become 17). The window shows it.
- **Fees.** Short courses are paid once. Programs longer than a season are paid when you enroll and at the start of
  each season; if you can't pay, the course waits (no classes are missed meanwhile) and goes on once the money is there.
- **Help with the fee.** Some courses have aid: your employer may pay for a course its ranks ask for if you work well,
  a school may give a scholarship for good skills, and public benefits pay part of it back when you finish. Only the
  best one counts. Full sponsorship from an employer asks you to stay a season after you finish; leaving sooner pays
  back what's left.
- **Study while you work.** Some jobs let you start while you study for them: in Tokyo you can be hired as a Medical
  student or a Nursing assistant while you take medical or nursing school, and you move up once you've finished it. In Porto Alto every job that asks
  for a course works this way.
- **Your boss tells you.** When the next rank asks for a course you don't have and you're doing well, your boss (or the
  manager, in the work app) writes to suggest it, with where it's taught, how long it takes and any help with the fee.
  The job page also says when a rank two steps ahead needs a course.
- **Tokyo's courses.** Seventeen, from Japanese for beginners and English conversation to nursing and medical school,
  beauty school, bartending, idol lessons, manga, programming, bookkeeping, omotenashi and guitar. Each start also gives
  you a skill or two that fit its story.

### Your existing games

They're converted once, with a backup kept in the save (Settings → Game → This save). Strengths you picked become
their skill levels, and the courses you finished give their new skills (the old Japanese course gives Japanese 4).
The traits old courses taught (Kind, Curious, Speaks Japanese…) and the ones finished life goals gave you are taken away:
a finished goal gives you its perk instead (see [Life goals and life points](#life-goals-and-life-points)). A course
you were taking goes on under its new length, usually with more classes to go. If you work as a doctor or a nurse in Tokyo, or as a doctor, engineer, nurse or teacher in Porto Alto, your rank
moves up one, since those careers have a new first rank. Your old trait lists are kept in the save, and the game tells you once what moved. A custom world keeps its traits as they were.

## Life goals and life points

A life goal is something you work toward over a few weeks of play: get rich, find love, become a regular, make it in
Tokyo. You follow one at a time, it moves in steps, and finishing it gives you a **perk** that stays with you for good.
Steps and goals also earn **life points**, which you spend in a small shop.

### Following a goal

- **The Goals app** (on the phone, under Profile) shows the goal you follow: its perk first, its steps as a row of dots,
  and what the current step still needs ("Meals cooked 6/15", "Cooking 3/5", "Held 3 of 14 days"). Below it, a few
  **suggested** goals (the ones made for your start first), then **every goal** in nine groups: Fortune, Career, Love,
  Social, Knowledge, Creativity, Food, Health and Explorer. Tap a goal to see all its steps and what each gives.
- **Picking one.** With no goal followed, the app shows a badge and the game tells you once. Nothing is ever blocked:
  it's a guide, not a quest.
- **Switching loses nothing.** Pick another goal any time; the one you leave is paused, keeping its finished steps and
  its counts, and carries on from there when you pick it again. Things you count (meals cooked, shifts worked, festivals
  attended) count only while the goal is the one you follow; things that are a state (a skill level, money saved, a rank)
  count at once. So a goal whose first steps you've already done moves on the moment you pick it.
- **Some steps must hold for a while** ("a season as best friends", "two weeks asleep before 1:00"). Your needs aren't
  held against you overnight: a night empties hunger and thirst, so a step about needs gives you until two hours after
  you wake.
- **Only goals you can do here.** A goal whose system is off, that needs someone left out of your game, or that asks for
  more than the world has (more courses, a skill it lacks) isn't listed. Adult goals only show with adult content on.

### Perks

- **A perk changes numbers in the game**: prices 5% lower everywhere (*Get rich*), energy draining 20% slower
  (*Athlete*), ranks taking 10% less time (*Top of the career*), +3 friendship when you first meet someone (*Free
  spirit*), one failed roll a day rolled again (Tokyo's *Strategist*). Your perks are listed in the Goals app and on your
  profile, after who you are.
- **A perk is not a trait.** It isn't told to the AI as who you are, and jobs and rolls that look at traits don't count
  it. The AI does hear what you did ("reached a life goal…") and the goal you're working toward.
- **Perks add up**, with your personality and habits: percentages multiply (two −20% make −36%, never reaching zero) and
  flat bonuses add, and every kind has a limit for the whole pile, so collecting goals makes you stronger without breaking
  the game.

### The goals

Every world has the same general goals where they fit: *Get rich*, *A place of your own*, *Top of the career*, *Hard
worker*, *Jack of all trades*, *Find love*, *Free spirit*, *Social butterfly*, *Best friends*, *Party host*, *Lifelong
learner*, *Home chef*, *Athlete*, *Artist*, *Regular*, *Explorer*, *Collector*, *Balanced life*, and with their systems
on *Mentor*, *A family of your own*, *A good name* and *Your own business*.

**Tokyo** has twenty of its own: *Make it in Tokyo*, *Nihongo jōzu* (for those still learning Japanese), *Bookworm*,
*Strategist*, *Idol dream*, *The Shimokita sound*, *Up the corporate ladder*, *Founder*, *Taste of Tokyo*, *After the last
train*, *Seasons of Japan*, *Akiba legend*, *Doujin artist*, *Hot springs and getaways*, *Old Tokyo heart*, *Karaoke king
or queen*, *A Tokyo romance*, *Up from Isezaki*, *Keeper of secrets*, and with adult content on *King or queen of
Kabukichō*. A world's own goals are marked ✦. Mentors, businesses and reputation are off in Tokyo, so those goals aren't
there.

### Life points and the shop

- **Earning them.** Each step of the goal you follow gives 100, finishing it 200 more. A little comes from living too:
  a festival or city event the first time each year (10), a street story finished (15), a secret learned (20), a story you
  followed reaching its end (40), a new kind of keepsake (10), at most 60 a day. Some perks raise these.
- **Spending them** in the Goals app's **Rewards** tab:

| Item | What it does | Points |
|---|---|---|
| Focused | skills train 50% faster for a day | 250 |
| Lucky day | +2 on every roll for a day | 200 |
| Second wind / Clear head | energy / mood full now | 150 |
| Work boost | performance gains doubled for three days (once a week) | 250 |
| Clean slate at work | a warning and the last missed shift forgotten (once a season) | 300 |
| Rent holiday | the next rent and bills a week later (once a season) | 300 |
| Nudge | one person's friendship or romance for you +15, never past what the rules allow (once per person a season) | 400 |
| Clear the air | one person's feelings for you start over; they still remember what happened | 400 |
| A fresh start | one person forgets you, as if you never met (your journal keeps it) | 900 |
| Forgive and forget | a grudge against you ends | 200 |
| An invitation | someone you know asks you out in the next days | 150 |
| Quiet a rumor | a rumor about you stops spreading | 200 |
| Insight | one true thing about someone: who they have feelings for, how they see you, or their secret | 250 |
| Change a trait | swap a personality or interest trait, or drop a habit (your persona card is updated) | 500 |
| Skip a step | the current step counts as done; never the last one, once per goal, and it pays no points | 400 |

- **Tokyo's shrines** sell their own, at Sensō-ji, Meiji Jingū, Kanda Myōjin and Tsukimi Inari: an *omikuji* (a lucky
  week, 500), four *omamori* charms for love, study, health and work (a week each, 300), a *daruma* that doubles the
  finishing points of the goal you follow (300) and an *ema* that brings someone you know to invite you out (150).
- Items you can't use right now stay in the list with the reason ("Only at a shrine", "Already full", "Nobody to use it
  on"). A boost can't be bought again while it's running.

### World makers and older games

- **The World creator** has a **Goals & rewards** tab: turn general goals and items off, rename or re-price them, and
  write your world's own goals (steps as conditions, checked as you type, with quick-add buttons for the common ones),
  perks (held inside limits so a custom perk can't break the game) and shop items.
- **Your existing games** keep what they had: an old life goal you were following or had finished carries over, and a
  finished one gives you its perk.
