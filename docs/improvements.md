# Other improvements in this fork

Besides its work on relationships ([Relationships in this fork](relationships.md)), this fork of
[Mundi](https://github.com/tjalis/Mundi) adds improvements of other kinds. This page describes them from a player's
point of view, and grows as new ones arrive.

- [A color for each speaker's dialogue](#a-color-for-each-speakers-dialogue)

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
