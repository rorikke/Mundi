# Mundi

**Open worlds inside SillyTavern.** Mundi turns a SillyTavern group chat into a life you live: a city with a map and a clock, needs to look after, a job, bills, people with their own days, and the story the AI writes around what you do.

<p align="center"><img src="docs/map.jpg" alt="Midtown, the map of Porto Alto"></p>

It is a SillyTavern **extension** (no server plugin). Everything is built on what SillyTavern already has: your character cards, personas, lorebooks and group chats. A save *is* a chat.

## What this fork adds

This is a fork of [tjalis/Mundi](https://github.com/tjalis/Mundi) with features of its own on top. Your existing Mundi saves open as they are, upgraded once with a backup kept in the save. So far it adds:

### Relationships that feel alive

People in your world have feelings of their own, for you and for each other, and act on them. **[Relationships in this fork](docs/relationships.md)** describes it all from a player's point of view.

- **Feelings go both ways.** Everyone feels their own way about everyone else, and people can come to dislike or even hate you. A crush can still outweigh dislike, so enemies to lovers is possible.
- **Friendship and romance are separate.** A best friend can stay just a friend; a stranger can flirt with you on the first night. Romance fades when you stop seeing each other, partners can leave you, and something casual is possible too. Exes are remembered as exes.
- **Scenes count.** Each scene is judged when it ends: kindness, flirting, a fight or an insult all change how people feel, right away. Swiping or editing replies no longer stacks changes.
- **Who people are.** Everyone can have a gender, an attraction (who they can fall for), a way of being about intimacy (from free spirit to devoted) and an exclusive or open relationship style. Your AI can suggest them from the cards.
- **People take the initiative.** They open up, confess their feelings, ask you out, text you, warn you before a breakup, hold grudges until you apologize, get jealous, and talk about you to their friends. How often is up to you.
- **The world's people live their own lives.** They make friends, fall out, fall for each other, date, marry and break up, from their own feelings.
- **Family is family, feelings are feelings.** Family ties (parent, child, sibling, cousin) are kept apart from how people feel; everything else, from best friends to exes, is set as feelings: in the new game, the World creator and the People tab, without needing the Advanced settings.

### A color for each speaker's dialogue

Turn on **Color each speaker's dialogue** in Chat look (the ☰ menu): the quotes in each line, and the speaker's name, take that person's color, so you can tell at a glance who says what.

- **Colors that fit the characters.** Your AI picks them once (one short request in the background), from how each card describes the character and the colors of their avatar and sprites, and gives people who are often together (a household, a couple, family, good friends) colors that are easy to tell apart.
- **Always readable.** Mundi checks every color against the dialogue box and keeps similar colors apart, and falls back to its own choice when your AI can't answer.
- **Yours to change.** Set a color in Chat look or on a person's page in the People tab: a character's is saved on their card, yours is kept for your persona. "Pick colors again" asks your AI for a new set; colors you chose stay.

## What you can do

- **Live in a world.** A map of places, time that moves when you act, weather and seasons. Energy, hunger, thirst, mood and hygiene drop over time.
- **Talk.** A visual-novel scene with Say / Do / Story / See. Type `@` to pick who answers. The engine keeps the numbers (time, money, relationships); the AI writes the scene.
- **Relationships.** Friendship and romance bars with levels, approval, feelings that fade, dates, proposals, marriage, a baby. People keep their own routines: find them, or text them.
- **Work and money.** Job interviews (a d20 roll with your traits as bonus), shifts, promotions, quick gigs, courses that teach traits, weekly rent, water and power that get cut off if you don't pay. Easy / Normal / Hard.
- **A phone.** Messages, People, Jobs, Bank, Homes, Chirp (social), Spark (dating), Calendar, Journal, Shop, Goals, Profile and Help.
- **Households and "Play as".** Live with family or roommates, then switch to playing any of them.
- **A diary.** Each night the day is written as a short entry, so the story remembers what happened.
- **Make it yours.** Layouts (Visual novel, Classic, Cards), colors with transparency, presets that tint the HUD glass, a world creator for your own maps and rules.
- **Phones.** Upright and sideways layouts, with their own scale for the HUD.
- **A tour.** Stella shows you around in a practice world. No AI needed.
- **Home mode.** A more role-play focused way to play: one house, the characters you choose, no work or bills. Pick the rooms, draw a floor plan, go out and come back.
- **In your language.** The interface is in English, Português (Brasil) and Español (Settings → Interface → Language).

It comes with **Porto Alto**, a modern coastal state with five cities (Midtown, Palm Coast, Maple Heights, Pinecrest and Green Valley), and **The Shared House** for Home mode. The medieval style (Valdoria) and the RPG mode are coming in a later update.

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## Screenshots (0.2)

| | | |
|---|---|---|
| ![Midtown, the map of Porto Alto](docs/map.jpg) | ![Palm Coast, the beach city](docs/map-palmcoast.jpg) | ![Choosing a city of Porto Alto](docs/map-cities.jpg) |
| ![The floor plan of the Shared House](docs/house-plan.jpg) | ![At home, in the bedroom](docs/home-bedroom.jpg) | ![An apartment at 13:30](docs/home-apartment.jpg) |
| ![Sky Hotel & Rooftop Bar](docs/scene-sky.jpg) | ![The university](docs/scene-university.jpg) | ![The stadium](docs/scene-stadium.jpg) |

## Screenshots

| | |
|---|---|
| ![At home, with the phone open](docs/home.jpg) | ![Courses](docs/courses.jpg) |
| ![A match on Spark, the dating app](docs/spark.jpg) | ![Someone's card in a scene](docs/people.jpg) |
| ![How the day went](docs/diary.jpg) | ![Chirp, the social network](docs/chirp.jpg) |

On a phone:

<p align="center">
  <img src="docs/phone-scene.jpg" width="23%" alt="A scene on a phone">
  <img src="docs/phone-homes.jpg" width="23%" alt="The Homes app">
  <img src="docs/phone-profile.jpg" width="23%" alt="The Profile app">
</p>

## Install

1. In SillyTavern, open **Extensions → Install extension**.
2. Paste `https://github.com/tjalis/Mundi` and install (or `https://github.com/rorikke/Mundi` for this fork; if you already have Mundi installed, remove it first).
3. Reload SillyTavern (Ctrl+F5). Open Mundi from the **Extensions menu** (the magic wand next to the chat box). The tour starts the first time you open it.

Works with SillyTavern 1.19 or newer. Any chat-completion or text-completion API works; a context of about 30k tokens is a good size.


## Building from source

The repository ships the compiled `dist/` and `style.css`, so you don't need to build to use it. To change the code:

```sh
npm i -g typescript
./build.sh        # src/*.ts → dist/, css/*.css → style.css
```

## Credits

- Sounds by [Kenney](https://kenney.nl) (CC0).
- Seraphina is SillyTavern's default character; her picture is bundled for the tour.

## License

[AGPL-3.0](LICENSE), the same license as SillyTavern.
