# Other improvements in this fork

Besides its work on relationships ([Relationships in this fork](relationships.md)), this fork of
[Mundi](https://github.com/tjalis/Mundi) adds improvements of other kinds. This page describes them from a player's
point of view, and grows as new ones arrive.

- [A color for each speaker's dialogue](#a-color-for-each-speakers-dialogue)
- [Pictures that follow the weather and the season](#pictures-that-follow-the-weather-and-the-season)
- [Who you are, and courses that take weeks](#who-you-are-and-courses-that-take-weeks)
- [Life goals and life points](#life-goals-and-life-points)
- [Tokyo's adult progression](#tokyos-adult-progression)
- [Owing rent](#owing-rent)
- [University](#university)
- [Training together](#training-together)
- [Running a business](#running-a-business)
- [Shopping](#shopping)
- [Your own home](#your-own-home)
- [Storylines](#storylines)
- [Tokyo memories](#tokyo-memories)
- [A museum of your own, and Tamaki](#a-museum-of-your-own-and-tamaki)
- [The World creator and the new game](#the-world-creator-and-the-new-game)

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
  two levels, up to +4) and a course it asks for, finished or being taken (a job takes you while you study only at a rank
  for students). With none of that it's a long shot (about
  30%, less for careers that pay well above the usual), and a job beyond your reach won't see you at all (0%) until you
  get better at what it looks for. After a no, try again the next day; each no in a row at the same job in a season waits
  longer (3 days, then a week…), about four tries a season, so a long shot can't be had by asking every day. A new season,
  or getting better at what the job looks for (a skill level, a trait, its course), starts the count again; a disaster
  waits at least three days, and a good word from someone there gets you in at once.
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

**Tokyo** has twenty-one of its own: *Make it in Tokyo*, *Nihongo jōzu* (for those still learning Japanese), *Hijiri
graduate* (for the university student start), *Bookworm*,
*Strategist*, *Idol dream*, *The Shimokita sound*, *Up the corporate ladder*, *Founder*, *Taste of Tokyo*, *After the last
train*, *Seasons of Japan*, *Akiba legend*, *Doujin artist*, *Hot springs and getaways*, *Old Tokyo heart*, *Karaoke king
or queen*, *A Tokyo romance*, *Up from Isezaki*, *Keeper of secrets*, and with adult content on *King or queen of
Kabukichō*. Five more come with adult content on: *Adult star*, *The art of pleasure*, *Keeping the spark*, *Open hearts*
and *Thrill seeker* (see [Tokyo's adult progression](#tokyos-adult-progression)). A world's own goals are marked ✦.
Reputation is off in Tokyo, so *A good name* isn't there; *Your own business* is, through [a café of your
own](#a-café-of-your-own), and *Mentor* through [training together](#training-together).

### Life points and the shop

- **Earning them.** Each step of the goal you follow gives 100, finishing it 200 more. A little comes from living too:
  a festival or city event the first time each year (10), a street story finished (15), a secret learned (20), a story you
  followed reaching its end (20), a new kind of keepsake (10), at most 60 a day. Some perks raise these.
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

## Tokyo's adult progression

Tokyo's night world and love life used to be scenery. With **adult content on**, they now have a skill, a way to learn
what someone likes, a need that sets a rhythm, risks, careers with ranks of their own, courses, traits, goals and shop
items. It's all between adults who want to, and it never gets past a hard limit or a "not tonight".

### What turns it on

- **One switch:** *Adult content* in the new game, or in a game's settings (🌐 → Rules → Adult content). With it off none
  of this exists: no skill, traits, courses, jobs or need, nothing on the HUD, profile or phone, and nothing told to
  the AI. What you picked stays in the save and counts again when you turn it back on.
- Parts of it also need a system: private moments, drive and getting caught need **relationships**, the careers need
  **jobs**, Desire needs **needs**, the goals and shop need **goals**.
- Any world can use it (see the end of this section). Tokyo has all of it.

### Sensuality

A skill like the others (levels 0–10), only there with adult content on. It grows from private moments, from the two
adult courses and from some adult work (a dancer's or an AV shift), and it's what the adult careers ask for. The
strength **Good in bed** starts you at Sensuality 3.

### Private moments

A private moment is something done in private with someone who's ready for it: a night at a love hotel, a bath for two,
a lap dance at home, a massage.

- **They have a roll.** Sensuality helps, so do the usual things (a lucky day, a charm, how you feel), and so does
  how well you and the other person suit each other. It comes out **great** (romance from them grows more, a mood
  lift, Desire back to full, and the AI is told it was a night to remember), **good**, or **awkward** (a funny
  mishap: a little mood, nothing lost, never a punishment).
- **Who leads.** The **In bed** traits are *Leads*, *Follows* and *Switch*. *Leads* with someone who likes to be led (or
  the other way round) helps the roll and makes romance grow faster; two who both lead, or both follow, make it a bit
  harder. *Switch* works with anyone and never clashes. It's not a personality pick, so it costs nothing against
  your three.
- **What someone likes.** Every person has likes and hard limits. A like the action fits helps the roll, and on a good or
  great night you learn it. A hard limit stops the action: they say no kindly, you talk instead, romance dips a little,
  and you now know the limit, so that action is hidden with them from then on.
- **Not tonight.** Someone who isn't ready (see their drive, below) turns it down before anything happens: no time
  passes, nothing is lost.
- **Pillow talk** is a short talk after a private moment, with someone at Crush or more, and teaches you one like or
  limit you didn't know. The shop sells a version of it (below).
- **A night you played in the chat** counts too, for a little less. When the game judges a private scene, it also asks
  whether it went all the way; the AI only answers yes or no, and the game decides what that's worth (Desire, a little
  Sensuality, the goals' counts; no roll and no like learned).
- **Two companions.** Some actions (*The three of you*) take two people, if both are at Crush or more with you, and each
  is fine with the other.
- **Your own likes.** *Profile → In bed* has two boxes: what you like and what you're not into. They never hide or stop
  anything. A like you share with a partner helps the roll, something you're not into gives you a bit less mood, and the
  dating app counts likes you share. People you've been with know your likes, and the AI is told.

### What you know of someone

Their phone page (People app) lists what you've learned: likes, limits, their drive once you know it and who leads once
you've been together. Nothing shows until you know something. The AI hears what you know ("Mio knows you like being led"
and the like), a few lines a person at most, so the prompt stays small. Each like or limit you learn also gives 10 life
points (once each, inside the daily cap).

### Desire and Drive

- **Desire** is a need (🔥 on the HUD) from 0 to 100. It starts at 60 and, at an average drive, empties in about five
  days. At zero you're restless and your mood drains. While it's 70 or more you're in **afterglow**, and your mood
  drains more slowly. A private moment refills it (a great one: full), so does time alone, watching a show, or a risky
  moment you get away with.
- **Drive** is a trait you pick at the start (*Low drive*, *Average drive*, *High drive*; *Change a trait* can swap it):

| | Low | Average | High |
|---|---|---|---|
| Desire drains | half as fast | normal | 1.6 times as fast |
| Restless at zero | mood −1 every 3 hours | −2 every 3 hours | −2 every 2 hours |
| Afterglow (mood drains slower) | 5% | 10% | 15% |
| Time alone refills | +40 | +30 | +20 |
| Mood from a private moment | ×0.8 | ×1 | ×1.25 |
| Romance from a private moment | −10% | ±0 | +10% |

  No drive is best. The afterglow a night gives is about the same, so a drive changes how *often* you need someone,
  not how much a night is worth. Turn Desire off for a game and there's no Drive and no afterglow either.

### Other people's drive

- **Everyone has a drive too,** from their profile (people made in the game get one). It decides what happens after a
  night together: **ready again** (2 hours for a high drive, 12 hours average, 2 days low), **wanting you** (casual
  partners and partners, after 2, 4 or 8 days: they text you more, you roll a little better, the AI is told) and, for
  partners only, **frustrated** (after 8, 12 or 24 days, so meeting weekly is enough even for a high drive, only while you keep seeing each other: romance toward you slips
  a point a day and the People app says they want more nights together). The next night together ends it.
- **You learn a drive** after three nights together, or from Pillow talk.
- **Making the move.** Someone who wants you, alone with you where it could happen, may pull you closer: a card with
  **Yes** (the private moment starts) or **Not tonight** (nothing lost, no grudge). It uses the same budget as other
  initiative, so it stays occasional.
- Casual flings between the world's people form more often when both have a high drive, less with a low one.
- **Jealousy.** *Flirtatious* (in the Personality list, not an adult trait) makes romance with new people grow 10% faster
  until a Crush, and your partners' jealousy hurts 15% more; the perk *Compersion* makes it hurt 40% less. A partner who
  hears that you were caught with someone else is hurt the same way, once (a partner with an open style doesn't mind).

### Getting caught

Some private moments happen where they shouldn't: the manga café's couple booth (15% to be caught), after hours at the
office (20%), Ueno Park after dark (15%), the ryokan's shared bath after midnight (10%).

- **Not caught:** it plays as usual, with a thrill (mood up, Desire full).
- **Caught:** you leave at once and nothing else happens, your mood drops, there may be a fee (¥5,000 "cleaning" at the
  manga café), the place won't serve you what's private, risky or paid for **for a week** (the map and the things to do say
  so, and for how many days more), and if someone from the world was there, a rumor about you and who was with you
  starts. At your own workplace your boss gives you a warning.
- *Shameless* makes it 10% more likely, the *Blind spots* perk half as likely, and *Quiet a rumor* in the shop also
  lifts the ban when the rumor is about getting caught.
- **Work can be risky too:** at the esthe, "a little more" has a 10% chance of a raid. The shop shuts for a week (no
  shifts, no pay), you get a warning, and a second raid within a year lets you go.

### Careers

- **Sensuality** is asked by the AV and the dancer's higher ranks, and trained on the job. Hosts, hostesses and club staff
  sell talk and company, so they still ask for Charisma. Adult jobs stay closed with adult content off.
- **Women's night jobs.** Hostess clubs (Kabukichō and Yokohama), the pole club's dancers and the AV studios take women
  from the listings; anyone else needs an introduction (a friend who works there: Sayuri for the hostess clubs, Lisa for
  the pole club, Airi or Momo for AV), the scout's card for AV, or to be very good at it already (Charisma 7, Dance 7,
  Sensuality 7). Without one, the job isn't among your openings.
- **Streamer.** Anyone can start streaming from their room, for very little at first (¥600 an hour). After the first rank
  you choose a path. *Games and chatting* stays poorly paid for a long time (¥700 to ¥1,300 an hour) and climbs slowly,
  behind skills and performance, to esports or talk streams (¥2,200 to ¥4,000). *Adult streams*, with adult content on,
  pays better from the start (¥1,700 to ¥2,800, then your own fan page or a live studio, up to ¥4,300); the sites take
  women, and anyone else only with an introduction (Airi or Momo) or Sensuality 7: the path shows closed and says why.
- **One job, a track for each gender.** The AV job and the esthe have one listing for everyone, but ranks,
  pay, hours, pace and needs differ by track, as they do in real life. Your track comes from your gender (in Tokyo, a
  woman is an actress and works the men's esthe, a man is an actor and works women's services); if your gender has
  none, you pick one when you're hired, once, and it can't be changed later. The world's people use their own.
- **AV.** *AV actress* is the job as before (from the listings, for women). *AV actor* has no listing: you need an
  introduction (a director's card from a street story in Kabukichō, Airi or Momo as a friend, or Sensuality 7), Fitness
  and Sensuality to start, and a harder interview; the pay is lower (¥800 to ¥3,000 an hour against ¥1,500 to ¥4,000). Ranks take half again as
  long, you're called one day a week to begin with, and some ranks wait for a work event: a director calling you back,
  an actress asking for you (a friend of yours first, otherwise someone unnamed). Both tracks wait a month between
  signing and the first shoot.
- **Esthe therapist.** A new job at *Aroma Room Lily* in Shinjuku, the way on from the massage course (finishing it starts
  you past the trainee rank). *Men's esthe* works at the room, *Women's services* works outcalls off screen: slower ranks
  (×1.4), and a ¥30,000 training fee unless you've finished the massage course. Its main event is "Is there an option?":
  keep it clean, offer a little more (better tip and performance, but it's risky), or refuse. On the room's ranking day, a
  good photo diary gives +15% pay for a week.
- **Dancer** lists the pole classes: finishing them starts you past the new bottom rank, *Pole class student*.

### Adult courses

Both are adult, run on a schedule like Tokyo's others, and teach Sensuality:

- **Pole dance classes** (¥55,000 a season, at Pole Star) teach Dance, Fitness and a little Sensuality, and unlock
  *Lap dance* at home.
- **Sensual massage course** (¥65,000 a season, online and at home) teaches Sensuality and Charisma, and unlocks *Full oil
  massage* and the way into the esthe job.

### Traits and habits

- **Strengths:** *Good in bed* (Sensuality 3).
- **Personality:** *Flirtatious* (above) and *Shameless* (+1 on rolls where being seen is part of it, but 10% more likely
  to be caught).
- **Interests:** *Kink*, a little more mood from what fits it; on the dating app it shows on people whose likes fit, and counts as an interest you share with them.
- **In bed** and **Drive:** one pick each (above).
- **Habits** come from doing: *An active love life* (five private moments in a week: Sensuality trains 10% faster, +2
  mood each morning) and *Kabukichō regular* (four nights at a host club, hostess lounge or Pole Star in a week:
  Charisma trains 10% faster, but −3 energy each morning).

### Goals and the shop

Six adult goals, only with adult content on:

| Goal | The idea | Perk |
|---|---|---|
| *King or queen of Kabukichō* | work up as a host or hostess | *Silver tongue*: hosts and hostesses are paid 15% more |
| *Adult star* | an AV career, to the top of your track | *Fan service*: performance in stage and screen work grows 20% faster |
| *The art of pleasure* | Sensuality 3, a class, eight things you know your lovers like or won't do (what you learned before the goal counts), Sensuality 8 | *Attentive lover*: romance from private moments grows 15% faster |
| *Keeping the spark* | ten moments with a partner, a night away, a gift they love, then a season | *Sleeping in their arms*: a night together rests you 25% better |
| *Open hearts* | a partner with an open style and a second partner, a night for three, a season without jealousy | *Compersion* |
| *Thrill seeker* | get away with it, then the ryokan's bath, the office or the park, then five times | *Blind spots* |

Three shop items join the shrine charms, all adult:

- **Pillow talk** (200 points): one thing a close someone likes, one hard limit, or their drive, for the person you pick
  (Crush or more, once a season each). The general *Insight* can ask about someone's likes, limits or drive too.
- **Mamushi drink** (200): for a day, private moments give half as much again and energy drains slower.
- **Kanamara charm** (250, bought anywhere): +2 on private moments for a week.

Nothing in the shop gets past a hard limit, a "not tonight", a lack of attraction, or family.

### World makers and older games

- **The World creator** edits every part: a skill marked adult, adult trait options and groups, adult courses, needs and
  habits, a private action's difficulty, the words it matches and its chance of being caught, jobs' kinds and tracks (a
  track editor beside the ranks, hiring conditions, fees, days a week per rank, who a work event comes from, a choice's
  boost or risk), the pool of likes and limits for people made in the game, each person's role and drive, and the
  questions an insight item can answer. What a world doesn't use stays out of its file.
- **Your existing games** open as they were. A person of the world whose profile had no role or drive gets it from the
  world once, never over a value you set; people made in the game and people from your own cards get a profile from the
  world's pool (only with adult content on). Desire starts at 60, and Drive at Average.

## Owing rent

Rent, water and power are paid weekly, and a bill you don't pay gets cut off: your home is locked, or the water or
power stops. Owing more than you have used to lock you out for good. Now:

- **You can pay part of what you owe,** oldest week first. Each bill in the Homes app has one button that says what it
  does: pay everything, pay what gets you back in, or pay what you can toward it (it always leaves you a day of food).
  You're back in once nothing is more than a week overdue.
- **A bill that's cut off owes no more weeks** while it stays cut off, so the debt stays something you can pay off.
- **You're warned the day before** a bill would be cut off, with what to pay.
- **The Homes app says what's owed**: the total, the weeks, what you've already paid toward it and when it will be cut
  off; while you're locked out, the cheapest home you could move to. The HUD's "Locked out" button says how much gets
  you back in. Moving out leaves the old debt behind.
- **Tokyo born pays a family share** of ¥10,000 a week while living in the family home, instead of the whole house's
  rent. A game already started as Tokyo born, still in the family home, moves to the share once.

## University

Tokyo's Hijiri University offers four degrees, played the way The Sims plays university: Economics, Japanese and
English studies, Computer science, and Arts and design. The University student start begins enrolled.

- **The Campus app** (on the phone) is to studying what the Jobs app is to work: your degree, the term and the days
  left of it, your grade point average (GPA), the modules you passed and the ones still to pass, the scholarship and
  the tuition, this term's modules with their class times, attendance and coursework, next term's choice, every term's
  grades, the school's clubs, and leaving. Not a student yet: each degree with what it takes, what it costs and which
  jobs want it, and Enroll.
- **Terms and modules.** A term is a season (four terms are a game year). Each term you take two or three of the
  degree's modules, chosen in the last week of the term before; the required ones are marked and suggested, and two
  that meet at the same time can't both be chosen. In a term's first days you can still change its modules. Classes are
  on campus on two weekdays (10:00–12:00 or 13:00–15:00): go to them with Study in the things to do there.
- **Coursework.** Each module asks for a few hours a week: Coursework at home, or studying in the university's library or
  the juku's quiet room. Each hour goes to the module furthest behind, and practices its skill a little.
- **Grades.** At the term's end each module gets a grade from A to F: half from attendance, a third from coursework, the
  rest from the final (a roll on the module's skill, with the usual bonus). Missing too many classes fails a module
  right away. An F is taken again in a later term. A term with a GPA under 2.0 is a weak term: two put you on academic
  probation, a third gets you expelled.
- **Money.** Tuition is paid each term (¥40,000 at Hijiri, with a merit scholarship or a public grant for some). The
  student start has a scholarship that pays it while each term's GPA holds; a weak term takes it away. Unpaid tuition
  holds your classes until you pay it in the Campus app.
- **Being a student.** While you study you work at most three shifts a week (a job with more days is worked part-time,
  without a higher hourly pay), and you rent only student homes: the Kōenji share house, the dorm and the cheap wooden
  apartments, unless your family pays (the Family money start). You can join one of the university's clubs for a meeting
  a week.
- **Graduating.** Pass eight modules, every required one among them, and you graduate: a ceremony, life points (twice
  for a distinguished degree), and a degree jobs ask for. The office hires only graduates; the juku's class teachers,
  the startup's team members, TV's assistant directors and the museum's senior guides need a degree too. With a GPA of
  3.5 or more the degree is distinguished, and you start a rank up in the jobs it's for (Economics: office and startup;
  Japanese and English studies: English teacher, museum and TV; Computer science: startup and game studio; Arts and
  design: animator, stylist and museum).
- **World makers** can give any school degrees in the World creator (its terms, modules a term, modules to pass, the
  least GPA, tuition and aid, the work cap, the jobs a distinguished degree helps), mark a course as a module of a degree
  (from which term, required, hours of coursework), and mark a job's wanted degrees, a start's degree and scholarship, and
  student homes. Schools without degrees work as before. Older games aren't enrolled; someone on Hijiri's old ladder
  keeps it until choosing a degree.

## Training together

Someone who is good at what you're not can teach you; you can teach what you know; or you trade, each teaching the
other (Mio from the share house teaching you Japanese while you help with her English homework). It replaces
apprentices, in every world.

- **Who can teach.** A teacher needs level 6 in the skill and three levels more than the learner. The world's people
  are good at what their world says (Genzō cooks at 10, Kyōko mixes drinks at 9, Natsuki games at 9), at the languages
  they speak (a Tokyo native speaks Japanese at 10 and a little English), and at what their job's rank asks.
- **Who with.** Someone you've met who feels like a **Friend** or closer. Two arrangements at a time, one per person.
  Adult skills are never taught this way.
- **How it starts: in conversation.** Suggest it in your own words ("could you teach me Japanese? I'd help with your
  English"). After their reply the game asks the AI whether they agreed, and to what, choosing only among what the
  rules allow: yes starts it at once, no means it won't come up with them for four weeks (and it's a little awkward:
  friendship −2). Someone who isn't a friend yet puts it off kindly, with no cost. Rarely, someone who'd make a good
  match is nudged to offer it if the talk turns that way (at most one nudge in ten days, the same person once in four
  weeks), and characters may offer on their own: an offer comes as a card, **Accept** or **Not now**, and your answer
  goes to the scene by itself.
- **Sessions.** An hour together, with them beside you: a button among the things to do ("Language exchange with Mio",
  "Lesson with Genzō", "Teach Haru"). Once a day, twice a week. The learner gains 16 experience plus 4 for each level
  between them (up to 36), never past a level below the teacher; twice a week takes you from Japanese 1 to 4 with
  Chloe in two and a half weeks. Each session brings you closer (friendship +3, and a little romance when there's some
  already), and the AI hears about the arrangement whenever they're in the scene.
- **Finishing and lapsing.** Once both sides have learned all they can, it's finished: a memory for both of you and a
  warmer friendship. Two weeks without a session and it lapses (a little cooler between you); someone who no longer
  feels like a friend calls it off. End one yourself from the Profile's **Training together**.
- **Mentor**, the general life goal, counts it: start teaching someone, teach ten sessions, someone you teach learns
  all you can teach, two of them. Its perk, Teacher, makes those you teach learn 50% more.
- **Worlds and older games.** It belongs to the *Training together* system (World → Systems), which needs skills. World
  makers set what each person is good at in the World creator (People, "What they're good at"); without it, a person
  knows what their job asks. Apprentices who had finished in an older game stay as former apprentices; one halfway
  through had been learning a trait, which training together doesn't teach, so that one is gone.

## Running a business

A late game for Tokyo, in three tracks for now: a café of your own, the executive's floor above a company's top
ranks, and hotels. A stake in a company may come on the same engine. The world's people are never your staff:
they're your regulars, the people you fight for, the ones whose stories your business can change.

### A café of your own

- **Two ways in.** Rise to "The master's right hand" at Kissa Shirakaba and the master, about to retire, shows you his
  notebook and then offers you the lease (¥300,000 of key money): you run the place now instead of working shifts there.
  Or lease a small unit and open a café you name: a narrow two-storey place on a Shimokita lane, an old wooden front in
  Yanaka, or a white concrete box off Omotesandō, each with its price and weekly rent. One café at a time.
- **How it grows.** Four numbers, Quality, Atmosphere, Capacity and Fame, make what a day brings in, with the calendar:
  weekends, festivals in its part of town, the season, how busy the street is. Upgrades raise one of them for good; each
  costs more than the last of its number. A third are bought from the app; a third turn up around Tokyo (1970s chairs at
  Second Bloom, beans from an Ameyoko importer, sweets from a Yanaka maker, a wall of books from Jinbōchō); a third are
  earned (the master's siphon bar, a house blend once you cook well, your friends' crowd). Money only buys what's there.
- **Tiers.** A coffee stand (open only while you're behind it), a kissaten (hired hands keep it open on the days you
  don't come), two cafés, a roastery. Each has a ceiling its numbers can't pass, and the next asks for a milestone: an
  upgrade and a scene (your first regulars, the coffee guide's critic, the bank's answer). Each tier has its style,
  chosen once (as it was, specialty coffee, open late): about the same money, other guests and other finds.
- **Running it yourself.** "Run the counter" at your café passes four hours like a shift: the day counts as yours (all
  its takings), you practise cooking and charm, something may come up at the counter, and you may discover a pairing
  that lasts (iced coffee in summer, hot milk coffee for the illuminations). It never clashes with your job's shift.
- **The week.** The takings come to you at the week's end, less the rent, with a report. Now and then a calendar card
  offers one optional choice (a stall at the Kōenji Awa Odori, a reading for the book fair): never more than one a week,
  and skipping it costs only what it would have given. Left alone, a café never collapses; you can sell it or close it.
- **People.** Friends who like eating out come by the café you run. Seo-yeon's novel is set in Kissa Shirakaba, and
  if you keep the place as it was, her parents come to your counter. Genzō, Kyōko, Mio, Haru and Ayaka have their
  moments too.

### The executive's floor

- **Above the top.** Asahina Trading, Mochi Byte Games and Wave TV have three ranks above their old tops: Executive
  officer, Managing director, Vice president. The careers below are paced as before.
- **The gate is hard.** Three seasons at the top with a high performance, two skills at their best and a third close
  behind, the Executive leadership program at Hijiri's business school (the company pays half if a director backs you),
  the board's nomination (a few work stories: a crisis, a sponsor, the offer), and one of the company's people's
  [storylines](#storylines) come to its end (Reiko's, Hannah's, or Hina's or Nanami's), which only starts once you know
  them.
- **Your division.** At Executive officer you run a division: four numbers (Results, Team, Network, Standing) grown
  by initiatives paid from the season's budget (never your money), found around the city (a client over drinks, the
  trade fair, the fan convention) or earned. At each season's end the board looks at it against a target. A fuller
  division makes your shifts count for more and your summer and winter bonuses larger.
- **People.** As an executive you can fight for Mei to stay, have your company sponsor Chloe's visa, sign Rina's deal
  with Mochi Byte, and give Hina's last show or Nanami's band an hour of Wave TV, each after a step of their own.

### The Business app, world makers and older games

- The **Business** app shows each venture's numbers against the ceiling, the week, what the next tier asks, its
  upgrades (with hints of where to look for the ones still to find), discoveries and staff, and the ways in.
- Ventures are world data, so other worlds can have their own (the World creator edits them); with the business
  system off, none of it exists. Older games have no ventures until one opens; a player already at a career's top keeps
  their rank, with the new ranks simply above it.

### Hotels

- **Three kinds, one of each.** Nest Capsule in Shinjuku, Ryokan Kasumi-sō in Hakone and, with adult content on, Hotel
  Coco Palace in Dōgenzaka. You can own one of each beside a café.
- **Ways in.** Rise to Hotel manager at the capsule hotel or the love hotel and the owner offers it to you, or buy it
  from outside when it's for sale. Either way you pay part of the price at once and the rest comes out of the hotel's
  weekly takings until it's paid off, never out of your own money. The ryokan isn't for sale: through Shizuka's story
  her family takes you in as a partner, with a third of the takings, and half once you fund the open-air bath.
- **Rooms and nights.** A hotel earns by its rooms: Capacity opens more of them, its other numbers and the calendar
  fill them (the last train's Fridays and the year-end parties at the capsule hotel, the autumn leaves and New Year at
  the ryokan, weekends and Christmas Eve at the love hotel), at a night's and a rest's price that follow its tier and
  style. Running costs and the upkeep come off. A full house is full: on its busiest nights only more rooms earn more.
- **Tiers.** A capsule hotel, then a sauna and lounge, then a cabin hotel with a women's floor. The old inn, then the
  open-air bath, then the detached rooms across the garden. The love hotel, then themed floors, then a second hotel
  in Isezakichō, with the owner's suite on the top floor. Upgrades are bought, found around Tokyo and earned, as at the
  café.
- **Running it yourself.** "Work the front desk" passes the hours like a shift. At a hotel of yours you pay the owner's
  rate, half of what a room and the place cost.
- **Tenants and partners.** People are never your staff, but someone may rent a room for a business of their own:
  Tsubaki's licensed aroma salon at the ryokan or the capsule hotel. They pay rent with the week and work there.
- **The night desk.** A love hotel sees who comes in with whom. Most guests come and go without a word; once in a while
  someone you know, when it moves a story: a secret you didn't know, a couple you didn't know was one. You hear it at
  the desk in your own hours, or from Kaoru's notebook while she keeps the window. Keep it, use it, or let it slip.
  The hotel can be told never to tell you. Choosing the self check-in machine over Kaoru's window closes that, and her
  job there.
- **People.** Shizuka's story can end with you as her family's partner, Kaoru's with her running the hotel by day,
  Tsubaki's with her salon at your hotel. The Hamakaze Group's man comes to your desk, and Sayuri can count on you or
  not; Akane turns up when trouble does; Shiori's family's hotel group is your rival, and would buy you out.
- **Selling.** Sell or close a hotel as any business; a buyer's offer may come for more, less what's still owed.

## Shopping

The phone's Shop app grew from eight things into Tokyo's whole high street: about 160 things in ten categories, from a
¥1,000 charm to a ¥15,000,000 car with a driver. Early prices are as they were (the futon, the bike and the coffee
machine cost what they always did), and the top is for the end game, when a career, a café and a hotel bring in half a
million yen a week or more. It's meant for choosing, not buying out: everything together costs far more than a game
earns.

### What's sold, and where

- **Ten categories**, each a tab: Home & furniture, Kitchen, Tech, Hobbies & instruments, Fashion & accessories,
  Vehicles, Luxury, Wellness & services, Gifts to give, and (with adult content on) Adult. A **Here** tab shows what the
  place you're at sells, and **Yours** what you have, with the days or uses left.
- **Most things come online**, delivered. Some are sold only at their places, while they're open: knives at the Tsukiji
  market, vintage guitars and the film camera at Second Bloom, watches, cars and the tailor's suits on Ginza Chūō-dōri,
  the finest furniture and lacquer at Tsubakiya, a shamisen, a yukata and bonsai at Sensō-ji, the spa day at Omotesandō or in
  Hakone. A place that sells shows "Shop here" in its things to do.
- **Two new places**: Kamome Marina in Yokohama, with its berths and the cruiser, and Akatsuki Motorworks behind
  Azabu's embassy streets, where old cars are restored under work lights.
- **By invitation.** Some things are shown only to people who've earned them: Tsubakiya's members' salon asks for money
  in the bank, the classic-car dealer wants you to drive already, the marina has its showing, the master luthier's
  violin wants a musician. Until then a tab says "More by invitation." and keeps them hidden.
- **The brands are made up**, each checked so it isn't a real one.

### What things do

- **Kept for good**: most things are yours once bought. Nothing can be sold back, nothing wears out, and nothing costs
  anything weekly: no upkeep, no insurance.
- **Services last some days**: flowers each week, a cleaner, a trainer's or a tutor's month, a stylist's season, the
  Ginza spa membership. They can be paid a little ahead. A case of wine or sake holds six bottles, one opened each time;
  a massage, a spa day or a private chef's dinner does its good at once.
- **Small bonuses, the best one counting.** A skill trains faster (knives for cooking, a pen display for drawing, a
  desk recording kit for music and singing, cameras for photography), a good suit helps at an interview, a tailored
  one or a stylist with first impressions, a hinoki bed means a better morning, the cleaner keeps you fresh for longer.
  Each card says what it does. They stay small (a few percent, a point), and of two things that do the same only the
  better one counts: the top of the shop pays in what it is, what it says about you and what it opens, not in bigger
  numbers.
- **Things to do**: over thirty things unlock something at home or around town: an espresso machine, an aquarium to
  watch, a telescope, a projector for movie nights, a stage piano, a barre, a VR headset, a cruiser to take out on the
  bay alone, with friends or on a date.
- **A car** drives you home after the last train: no taxi, no wait. By day you still take trains, and still meet people
  on them.
- **What the AI knows.** It's told the dearest things people can see on you when you're out ("wears a tailored Ginza
  suit and a Fontanel & Fils watch, drives a compact car") and what's at your home when you're there, never what they
  cost or do.

### Photography

A new skill. Take photos at ten of Tokyo's best views from the first day (the scramble, Takeshita Street, the
Metropolitan Government's observatory, Yanaka's cats, Rainbow Bridge, the light tunnel, the tower, Minato Mirai by
night, Lake Ashi's water gate, the night view from the Sky Museum); a good one now and then becomes a keepsake. A camera makes
it come faster, the film camera lets you develop a roll at home, and any camera lets you sell your photos; a gallery on
Ginza Chūō-dōri buys a good photographer's work. Four jobs have a moment that asks for it (Wave TV, the fashion shop,
the museum, the maid café), and Hijiri's *Photography* module now teaches it: a game whose degree already passed that
module gets the skill.

### Gifts

- **Gifts to give** are sold like everything else: roses, Ginza chocolates, a crown melon, a silver necklace, pair
  rings, perfume, a Hakone yosegi box, Edo kiriko glasses, a pearl necklace, a fine fountain pen, a whisky from a closed
  distillery, a watch, a diamond pendant, a ring (by invitation). Buying one gives you the keepsake, to give when you
  like.
- **A gift's worth is how well it fits**, as before, whatever it cost: money doesn't buy anyone's affection. An
  expensive one is told to the AI as expensive, and each kind of gift counts once per person, so a hunt for every kind
  is still a hunt: every kind has at least one keepsake you can only earn.
- **With adult content on**, the overlay's milder intimate gifts (lingerie, costumes, a blindfold, massage oil) are now
  part of Tokyo itself, sold at Omotesandō, in Kabukichō and at Hotel Coco Palace, with what they unlock.

### Adult things

With adult content on, an Adult tab: silk sheets, candles for a bath for two, an instant camera, couture lingerie and
the like. They're told to the AI only at your home, and only when everyone there is your partner or drawn to you: the
things in plain sight as they are, the ones you keep put away as things nobody sees unless you bring them out, with who
already knows of each. Someone who spends time at your place may come across one now and then. With adult content off
they're hidden and do nothing, even the ones you have.

### World makers and older games

- Every field of a shop item is editable in the World creator's Shop tab: its category, where it's sold and whether
  online, when it's shown, bought again (days or uses), what it changes at once, its small effects (held to the shop's
  limits), driving after the last train, the keepsake it gives, what the AI is told and when, adult.
- Other worlds keep their shops, now in tabs. With the shop system off, none of it exists.
- Older games keep what they bought, at the price they paid (only the gaming PC costs more now).

## Your own home

Homes used to be only rented. Now some can be bought outright, to live in or as a second home, and fitted out with
rooms and fixtures: a sauna, a grand piano, a rooftop terrace. Like the shop, it's for the end game: the dearest homes
take a few game years of a top income, and a home with every room it could have takes longer still.

### Buying

- **The Homes app has "Homes for sale"**, under your home and its bills, before the homes for rent: a card for each
  housing area with homes free, its price, its upkeep a week, its size, how many guests a party there can have, and two
  buttons, *Buy* (to move in) and *As a second home*. When you can't buy, the button says why: not enough money, a
  student's limit on homes, two homes already.
- **Bought outright**: no loan and no rent. Before paying, the app says what it costs, its upkeep a week and what it
  would sell back for.
- **Two homes at most**: the one you live in and a second home.
- **Tokyo has six homes for sale.** Two can still be rented too: the Toyosu towers (about ¥2,400,000) and the Azabu
  residences (about ¥4,400,000). Four can only be bought: a penthouse at the top of a Roppongi tower (about ¥6,000,000),
  a hot-spring villa above Lake Ashi in Hakone (about ¥8,000,000, made for a second home, with its own open-air bath),
  a mansion in Den-en-chōfu (about ¥12,000,000) and a 1920s Western-style villa on the hill in Yamate, Yokohama, over a
  rose garden and the harbor (about ¥18,000,000). Nobody else is ever placed in those four by chance. Prices follow the
  difficulty.

### Upkeep instead of rent

- **A home you own pays no rent.** It costs a weekly **upkeep** instead (management, taxes, staff): about ¥18,000 a
  week at Toyosu, up to about ¥110,000 at the Yamate villa. Toyosu and Azabu keep their water and power bills; in the
  four new homes they're part of the upkeep. A second home's upkeep is added to the same bill.
- **It's a bill like the others**: paid in the Homes app, part payments, the warning the day before, a debt that never
  grows, the perks that lower bills.
- **Left a week unpaid, it's cut off, but you're never locked out** of a home you own. The staff and the management
  stop: the house's rooms and fixtures do nothing, and what they let you do isn't offered, until it's paid. Nothing is
  ever repossessed.

### Selling back

- **A home you own sells back for part of what you paid**: 80% at Toyosu and Azabu, 75% for the penthouse, 70% for the
  mansion and the Yamate villa, 65% for the Hakone villa. Its card always says what it would sell for. Any upkeep still
  owed is paid from the sale.
- **Its rooms and fixtures stay with the house**: they're sold with it and nothing is paid back for them.
- **You're never left without a home.** To move out of a home you own (to rent somewhere, or to buy another to live
  in), the app first asks whether to sell it or keep it as your second home. To sell the home you live in, move into
  your second home, or move out first.

### Rooms and fixtures

- **A home you own can be fitted out.** Its card has *Rooms and fixtures*: what fits that house, with what each does,
  its price and a *Buy* button. Tokyo has 24, from a ¥500,000 yoga room to a ¥3,200,000 grand piano: a home bar, a wine
  cellar, a chef's kitchen, a tea room, a sauna, a private gym, a massage room, a home theatre, a recording studio, a
  library, a games room, an atelier, a darkroom, a rooftop telescope dome, a Japanese garden and its koi pond, a guest
  room, and with adult content on a bedroom suite. What fits depends on the home: the Toyosu flat takes five, the
  bigger homes most of them, and some belong to certain homes only (a Japanese garden where there's ground for one, a
  telescope dome up high or in the hills).
- **Bought once for that house**, kept while it's yours. They're only for homes you own: a landlord doesn't let you
  build a sauna.
- **What they do**, as the shop's things do: small bonuses (a skill that trains faster at the piano, the kitchen, the
  gym, the studio, the library, the atelier or the darkroom; a better bath or sleep; parties that lift the mood more; a
  better morning in the tea room or the garden), and things to do at home, 27 in all: mix drinks at the bar, a tea
  ceremony, a sauna and a cold shower, a film with someone, billiards, feeding the koi. **Only the best one of each kind
  counts**, counted with the shop's things: a grand piano and the shop's stage piano don't add up.
- **Four are rooms of their own**, places on the map two minutes from the house: the penthouse's **rooftop terrace**,
  the Yamate villa's **veranda over the rose garden**, the Den-en-chōfu mansion's **cypress bath** and the Hakone villa's
  **open-air hot-spring bath** (which comes with the house). At home, Things to do has a button to go there, and one to
  come back inside. Each has its own things to do: drinks on the terrace, breakfast on the veranda, a long soak.
- **What the AI knows**: at a home you own, that it's yours and what it has (its five dearest rooms and fixtures, never
  what they cost or do), and which room you're in. The bedroom suite is told as the shop's adult things are: only when
  everyone with you is your partner or drawn to you. Out and about, nothing.

### The second home

- **Any home you can buy can be your second home**, and the Hakone villa is made for it. Bought as a second home, you
  stay where you live; or keep the home you leave as your second when you move.
- **It's on the map**, as *My second home*: go there, sleep there, and use its rooms and fixtures while you're there
  (only there). A night there counts as a night away. Nobody lives there, and parties are at the home you live in.

### Parties at a big home

- **A home has room for so many guests**: six in a dorm, a share house, a studio or a wooden apartment, eight in a 1LDK
  or an old house, ten in a family house, twelve in a tower flat, sixteen at Azabu, 24 at the penthouse or the Hakone
  villa, 30 at the mansion or the Yamate villa. The party form says so and stops at it; a party planned before isn't
  cut.
- **Catering**, at a home of size 3 or more (Azabu and up): food and drinks as usual, a caterer (about ¥15,000 a guest)
  or a chef and staff (about ¥40,000 a guest), each making the party a little better for everyone. You pay only for
  the guests who said yes.
- A party that twelve or more came to counts as a grand party, a moment a world's life goals can ask for (as buying
  and selling a home are).

### Rents that went up

- **The two top rents rose** to fit homes that can be bought: the Toyosu towers from ¥60,000 to ¥90,000 a week, the
  Azabu residences from ¥110,000 to ¥180,000. Tenants already there pay the new rent from the next week due.
- **The Family money start keeps its family flat at ¥60,000 a week**, in a new game and in one already started.

### World makers and older games

- **Older games** open with nothing owned. One that rents at Toyosu or Azabu is told once, when it opens, that the rent
  went up and that homes can be bought now; a Family money game is told its rent stays. A backup of the save is kept
  first (Settings → Game → This save).
- **The World creator edits all of it**, in the Homes & rent tab: a housing area's price (empty: not for sale), upkeep,
  share paid back when sold, size and whether it can be a second home, and its rent before it went up (to tell older
  games); an area with a price and no rent is for sale only. A kind of home has its size, how many guests a party can
  have, and the rooms and fixtures it comes with. **Rooms and fixtures** are a list of their own, with the shop item's
  form (without what only the shop uses) plus where each fits: the home's size, kinds of home, areas, another fixture
  first, and a room of its own. In Maps & places, a place can be a room of a home.
- **Owning a home is a system of its own** ("Owning a home"), on by default; a world has nothing to buy until one of
  its areas has a price, so Porto Alto and the Shared House play as before. With it off, nothing can be bought, a home
  already owned costs no upkeep and its rooms and fixtures do nothing. Home mode has none of it.
- Help has a topic, *Owning a home*, and all of it is in Portuguese and Spanish.

## Storylines

Some of Tokyo's people carry a story of their own: a debt, an exam, a lease, a visa, a leaving. 26 of its people have
one (seven of them are adult). A storyline starts once you know the person, runs on its own time, and at its end it
waits for you: you decide, in a scene with them, whether to help, wait or let it be, and if you leave it they come back
a few times before it ends without you.

### When a storyline starts

- **Only once you know them.** A storyline never starts for someone you haven't met. Once you have, it starts when you
  become friends, or earlier where their story says so: eight start as soon as you've met and they know you a little
  (Mio, Kaito, Ayaka, Camille, Linh, Hannah, Momo and Kanon, whose good ending is simply becoming friends); most
  colleagues' start once you work the same job and know each other; a few follow a business of yours (Sayuri's once
  you own a hotel, Kaoru's once you own Coco Palace). Learning someone's secret any other way starts it too: a street
  story, an overheard rumor, Insight, something seen at your hotel's desk.
- **You don't see it start.** Until you know their secret you only get signs of it; they tell you themselves once they
  trust you (a good friend), or you find out. From then on their page in People shows **Their story**: what it's
  called, where it stands, and what would help.
- **There is no limit** to how many run at once, and none starts for people you never meet. The living world has to be
  on, and the adult ones only run with adult content on (switch it off and they wait where they are).

### On their own time

A storyline moves through its stages whether you're around or not, following the calendar (a contest in summer, a
lease that runs out in winter) and what you do (a job, a business). Its first stage lasts at least half a season, a
week in Tokyo's seasons of 14 days, wherever in the year it starts. A stage tied to the calendar is never skipped:
one that starts in autumn waits for the winter and the spring it was written for. A stage that asks something of you,
like holding a job, is skipped when the story moves on without it. Nothing ends because time runs out; when the last
stage is over, the story waits for you.

### The deciding scene

The next time you're with them after that, they bring it up: the scene tells you their secret if you didn't know it,
and the ending is decided.

- **A good ending happens right there** if it already holds (you're friends enough, the business you run is far
  enough along) and no better one is still on its way.
- **Otherwise a card asks you.** **Now** takes the way that holds, or **Wait** for a better one that is on its way
  (Seo-yeon's café ending while you work at the kissaten). **Help** pays a price and takes a good ending (see below).
  **Wait** keeps the story waiting and lists what each good way still needs ("friendship with Mio (Friend; now
  Acquaintance)", "Book a session with Tsubaki: 5 times (2 so far)", "how Ayaka's storyline ends"). **Let it be** ends it
  the way it would without you. If nothing can change the ending any more (Ayaka lost her contest, the machines went in
  at Coco Palace), the card says why and offers only Let it be.
- **A card you don't answer** comes back the next time you're together. **Talk about it**, on their page in People
  while you're with them, brings it back whenever you want.
- **The AI is told** the scene is the moment they bring it up, and that what you do about it is decided on the card,
  not in the story. Once it ends, it plays out in that scene.

**Help** is the price of a good ending, and not every story has one. Two do: lend Kaito what he owes (¥150,000, even
by text), and put up the key money for Genzō's new lease (¥1,500,000, as a good friend, in person). It's help for a
friend, not a purchase; without the money the card shows the price and what you have,
and you can still wait.

### Last chances

If you wait, they come back to you about once a season (the first about half a season after the story came due),
asking whether you'll help.

- **In person** it's the same card again. **By text**, in the evening, it's a message from them in the phone with
  three answers: **Meet them** (they text you a time and place, and the next scene together brings the card),
  **Help** (only where the story's help can be given by text), or **Not now**. These come whether or not "Characters
  take the initiative" is on, because they're what keeps a storyline from ending unseen.
- **A text left three days counts as missed, and so does Not now.** After three missed, the story ends the way it
  would without you, and that is never one of its good endings: those need you there. That is about six game weeks
  of letting it go. Help, Wait or Meet them start the count over. The last text says it's the last. They send at most
  two of these texts a week, so when many stories are waiting the rest wait their turn.
- **Some stories cool off instead.** Where the bad ending is only things going on as they are (Kanon staying in,
  Tsubaki keeping her late slots), ignoring the last chances makes them cooler toward you (a friendship level down),
  and the story waits for you again, once. Ignore it a second time and it ends without you.
- These timings are first values and are tuned as the game is played.

### Stories that hang on each other

Some endings depend on how another story ends: Genzō's new lease hangs on Ayaka's contest, Jake staying on Rina's
company, Daisuke's letter on Reiko, Nanami's offer on Kaito's debt. That story waits quietly (no card, no texts) until
the other ends, and its page says what it hangs on. When it's Genzō's or Jake's turn and you've met Ayaka or Rina, the
scene starts their story, so the one they wait for really begins. While a story hangs on another you can still choose
**Talk about it** to Help or Let it be.

### Leaving

If a story ends with someone leaving Tokyo (Chloe's visa, Jake's offer from home), they go the morning after the
deciding scene, so the goodbye is played with you, or, if the last text went unanswered, with a goodbye text. Nobody
leaves off the screen.

### What it gives

A secret learned gives 20 life points and a story you knew coming to its end 40, and good endings count for *Keeper of
secrets* and the goals and upgrades that ask for people you've helped. The executive floor asks for one of your
company's people's storylines to have ended (Reiko's, Hannah's, Hina's or Nanami's): climbing means getting to know
your colleagues. A gate never waits on someone left out of your game.

### World makers and older games

- The **Help** app has a topic, "Storylines".
- The **World creator** edits a storyline's title, its earlier ways in, the deciding scene (for the AI), three
  last-chance texts and an ending's help; Tokyo's own are editable like the rest.
- **Your existing games** keep what they had. Storylines already over stay over; one under way with someone you've
  met keeps its stage and ends in a scene with you (if its last stage was over it's waiting for you at once); one with
  someone you haven't met goes back to not begun, and starts when you get to know them (a secret you learned stays
  learned). The game tells you once and keeps a backup of the save. Other worlds only have storylines if their
  makers write them.

## Tokyo memories

A record of what you've lived in Tokyo, in the phone's **Collection** app (next to Goals). It fills by itself, a slot
for each thing as it happens, and shows how much of the city you've seen: a first step toward a museum of your own.

### What it records

- **Storylines** that came to their end, whichever way: the plaque says how. A good ending gets a gold frame (never
  needed for 100%); one left to its last chances says you weren't there. A storyline shows only its person's name until
  you know its secret.
- **Festivals** and **city events** you were at, each with its emoji and when to go.
- **Districts**: every street story of a district that can still happen, and every place in it. Stories tied to a
  business or a job belong to those, not here, and a story that can't happen any more (its person is gone, or it hung
  on an ending that went another way) drops out of the count and says so.
- **Life goals**: your start's own goal, then five, ten and twenty goals finished.
- **A business at its top**: a café, an executive's division, a hotel (any of them).
- **Keepsakes**: every keepsake of a kind, held at some time (giving one away doesn't take it back).

### How it counts

- A slot fills the first time it happens and stays filled, whatever comes after (a café sold, a gift given).
- A game has only the slots it can have: your start's goal, the people in your game, adult content (the adult
  keepsake kinds), the systems on. The percentage counts those.
- When the world gains something new after your record is full, it stays at 100% and the new slots are marked
  **New**. What came in since your last look is marked **Just in**.

### World makers and older games

- The **Help** app has a topic, "Collection".
- The **World creator** has a Collection tab: halls and their groups, slots with the condition that fills them, a hint,
  a person's portrait, a plaque for each ending of a storyline; and a button that adds a slot for everything the world
  has (storylines, festivals, city events, districts, keepsake kinds, life goals, businesses), so a world of your own
  gets a record in a minute. A world can switch the collection off (Features › Systems).
- **Your existing games** start their record with what they already remember: storylines ended, festivals and events
  (since life goals came), places, stories, goals finished, keepsakes, a business at its top now. What a game never
  kept (a café sold before) can't be counted. Nothing else in the save changes.

## A museum of your own, and Tamaki

Tokyo's Collection app gains display halls beside Tokyo memories: **Art**, **Crafts and antiques**, **Modern Tokyo**
and, with adult content on, **the night world**. Their pieces (prints, screens, tea bowls, netsuke, a suit of armour,
Shōwa toys, the things the city's people leave you) end up in a private museum of your own, an old storehouse in
Yanaka, whose curator becomes the end game's reward. It's the largest thing in the game to spend on: years of money.

### Where pieces come from

- **Finds**: some things to do turn up a piece now and then: browsing the antique market at Tokyo Station (once a
  season, on a Saturday) and Jinbōchō's bookshops, the used-book festival's carts, trying things on at Second Bloom,
  Electric Town's retro corner, a drink in the night world. A find you can't house yet, or one that came damaged, says so.
- **Shops**: a **Museum pieces** row in the scene where pieces are sold (Jinbōchō's print shops, Second Bloom, Electric
  Town, the antique market on its day), and in the app's **Here** tab.
- **Festival stalls**, once a year each: Sanja, the Sumida fireworks, the fan convention, the used-book festival.
- **People's things**: fifteen of the city's people each leave you something when their storyline ends, whichever way
  (a gold frame for a good ending). With adult content on, the night world's people leave mementos the same way.
- **Two street stories** in the old town give a piece if you play them well, and a business at its top (a café, an
  executive's division, a hotel) or Wave TV's fourth rank brings one too. Each of these also has a second way, so
  nothing is lost for good.
- **The dealer and the sales** (below), once you have the museum.
- A piece counts as soon as it's yours. A damaged find counts once it's been restored.

### The Kurahashi kura

- Your first pieces go into **six glass cases at home** (the dearest on show, the rest boxed).
- Once you own three, walk Yanaka's lanes in the daytime: an old woman sweeping the step of her late husband's
  storehouse would rather see it full of things people come to look at. Take it on in the Collection app's **Museum**
  tab: **¥1,500,000**, paid once, with no weekly upkeep. The kura appears on Yanaka's map, and its first room shows
  twelve pieces.
- **Upgrades** (¥500,000 to ¥2,000,000 each): a **wing** for each hall puts the whole hall on show; the **climate room**
  is needed for paintings, screens and textiles, **security** for arms and sculpture, and a **night guard** for the
  three crown pieces; the **restoration workshop** restores damaged pieces and makes replicas; the **reading room**
  makes finds likelier; **lighting** and the **garden** add renown; the **exhibition hall** lets you hold shows. The
  shops, the dealer and the sales only offer what the museum can house, and each empty tile says what it needs.
- **Renown** comes from the pieces on show (rarer ones count more), the upgrades, shows and the museum's big moments.
  Its five levels, from "a local secret" to "famous", each bring life points; the higher ones bring more pieces from the
  dealer and the sales, the rarest pieces, a newspaper critic's visit, and an attempted theft (no piece is ever lost:
  at worst one needs restoring).
- **Visitors** pay a small sum each Monday, more with renown and twice that while a show is on. It's a thank-you, not
  an income: the museum costs far more than it ever brings in.
- **Shows**: with the exhibition hall, once a season, pick a theme with at least six pieces on show (prints, netsuke,
  Shōwa toys…), ¥300,000; renown while it's on and a little for good for each new theme. Your first show has an
  opening night.
- **At the kura**: walk the halls, tea in the garden, an afternoon in the reading room, help with the inventory, write
  a plaque with Tamaki, her appraisal lessons. It's open 10 to 18 and shut on Mondays.

### The dealer and the sales

- **The dealer**, a woman with an old van, calls every week with three pieces (four once the museum is in the
  guidebooks), on sale until her next visit. Nothing waits for ever: every piece she can bring comes round within a
  few visits. You can **ask her for a piece**: it comes with her next visit, on top of the rest, 10% dearer.
- **The sales**: four a year at an auction house on Ginza's Chūō-dōri (day 10 of each season at 15:00), the catalogue a
  week before. Set a top bid for each lot (the estimate, +25%, +50%, +100%). Another collector, a woman who bids by
  phone, wants some lots (the dear ones more often), and bids higher as your museum grows famous. Be in the saleroom as
  it starts and you get one more step when she outbids you.
- **A lot she takes comes back** within two sales, offered by her at 20% over the estimate. Not bought then, the dealer
  brings it later at half as much again. A piece whose only way has passed (a story played another way, a business you
  never ran) comes from the dealer, or the workshop makes a **replica**: it counts, gives half the renown, and gives way
  to the real piece if that ever comes.

### Tamaki Kurahashi

- The museum's curator: Mrs. Kurahashi's granddaughter, 26, silver-haired, the appraiser who was a child star of a TV
  appraisal show until she called a sponsor's heirloom a fake on air. Until you open the kura she labels other people's
  shows at Ueno Hall of Art; then she runs yours.
- **She lets you closer as the museum fills**, in five tiers: **Colleague** when the kura opens, **Confidante** at 25%,
  **Sweetheart** at 50%, **Lover** at 75%, **Partner** at 100% (every display slot your game has). Each tier lets
  friendship and romance go further; what you'd have gained past it is kept and comes in at the next tier; asking for
  more than she allows yet gets a kind "not yet". A tier, once reached, is never lost. Her People page shows her tier
  and what opens the next.
- She's drawn to you, whoever you play, and to no one else, and she never leaves Tokyo.
- **Her four storylines**, one opening at tier 0, 1, 2 and 4 (*Puppies in the snow*, *Back on Treasure Clinic*, *After
  hours*, *The last case*), wait for you: they never end by last chances. The first is about a painting her grandfather
  sold, which turns up at a sale; win it, and she hangs it in the kura again. The last can end with her moving in.
- **Her eye**: with her along, a find is likelier and less often damaged; after five of her lessons your own eye stays
  sharper; from Confidante she tells you which lot the other collector wants.
- **With her**: comb the antique market's stalls, a Jinbōchō evening, festival dates in yukata, staying after closing,
  the kura's roof at night, a weekend in Hakone, each from its tier; gifts she loves (sweets from Yanaka Ginza, a good
  writing brush, an old sale catalogue) and four keepsakes of hers. With adult content on, her intimate side opens
  from the later tiers, as anyone's does; with it off, everything else plays.

### How long it takes

- The four base halls and the kura's upgrades cost about **¥44 million**, more with shows, lots she pushes up, and
  pieces bought back. Tokyo's life goal **Patron of the arts** (open the kura, thirty pieces, in the guidebooks,
  famous) gives the **Connoisseur** perk: museum prices 10% lower (not bids at the sales).
- In the long simulated runs, a player putting the museum first (with a show every season) completes it about **four
  game years** after opening the kura on ¥1,500,000 a week, and **six to seven** on ¥1,000,000; on ¥500,000 it's over
  90% after eight years. Spending half as much takes it to three quarters or more. Someone who only picks up what's
  cheap, and the people's things, fills about forty slots without ever taking the kura on.

### World makers and older games

- The **Help** app's Collection topic explains the museum. The **World creator** edits each display piece's ways (find,
  shop, festival stall, dealer, sale, storyline, milestone, street story, replica), its price and the upgrade it needs;
  a **Museum** section (the place, the offer, the upgrades, renown, the dealer, the sales, shows); and a person's
  **tiers** and whether they're drawn only to you, so a world of your own can have its own museum and its own Tamaki.
- **Your existing games** get the halls at once: a storyline already ended gives its person's thing ("before the
  museum" when the day isn't known), and a business already at its top gives its piece. Nothing else in the save
  changes.

## The World creator and the new game

- **Every field of a built-in world can be edited** in the World creator, so anything Porto Alto, the Shared House or
  Tokyo does, a world of your own can do too: a lore entry's condition written as text, and whether it's adult, secret or
  about someone; what a thing to do brings (its roll, outcomes, shared tables and their words, when and with whom); every
  street story; starts, keepsakes and gifts; a job's shifts, where colleagues go for drinks, and what each rank asks
  before a promotion and where it works; people's standing appointments, storylines, looks, voice, pictures, household,
  rank and languages; weather by climate, trains and taxis, how people address you, languages, the scene's settings and
  who festivals and events draw. In the map editor, a place's hours by season and weekday, closed days and weather, entry
  fee, who's around, sounds, sleeping there, private and adult places, and pictures by season and weather.
- **A job can ask for something to be hired:** a condition, or a list where one is enough (an introduction, a gender
  with `gender: woman`, a skill at the top), its interview made harder or easier, and on a track by gender a name of its
  own (Tokyo's *AV actor*).
- **Change one of the world's starts for a new game:** choose "Change this start" and its money, home, whom you know,
  your skills and the premise become yours to change for that game (it's copied into Custom, so the world's start stays
  as it is). Starts you save keep their skills. A start you live in with others (Tokyo's student start in the Kōenji
  share house) keeps its home, the Home step marks your start's area, and a changed start says who you live with.

### Tokyo's starts and money

Tokyo's starts begin with less money than before, about four weeks of rent and bills for most, so a first job matters:

| Start | Money | Before |
|---|---|---|
| Up from the countryside | ¥80,000 | ¥250,000 |
| University student | ¥70,000 | ¥150,000 |
| Tokyo born | ¥40,000 | ¥120,000 |
| New in Japan | ¥100,000 | ¥300,000 |
| Family money | ¥1,500,000 | ¥3,000,000 |
| Back after years away | ¥60,000 | ¥180,000 |
| Down on your luck | ¥15,000 | ¥40,000 |
