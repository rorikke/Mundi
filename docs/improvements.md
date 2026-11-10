# Other improvements in this fork

Besides its work on relationships ([Relationships in this fork](relationships.md)), this fork of
[Mundi](https://github.com/tjalis/Mundi) adds improvements of other kinds. This page describes them from a player's
point of view, and grows as new ones arrive.

- [A color for each speaker's dialogue](#a-color-for-each-speakers-dialogue)
- [Pictures that follow the weather and the season](#pictures-that-follow-the-weather-and-the-season)
- [Who you are, and courses that take weeks](#who-you-are-and-courses-that-take-weeks)

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
The traits old courses taught (Kind, Curious, Speaks Japanese…) and the ones finished life goals gave you are taken away (life goals are to give rewards of their own; until then a goal
you finish still gives its trait). A course you were taking goes on under its new length, usually with more classes to
go. If you work as a doctor or a nurse in Tokyo, or as a doctor, engineer, nurse or teacher in Porto Alto, your rank
moves up one, since those careers have a new first rank. Your old trait lists are kept in the save, and the game tells you once what moved. A custom world keeps its traits as they were.
