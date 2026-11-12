# Tokyo's place sounds

Each place in `world.json` lists what you hear there (`sound`: `station`, `izakaya`, `cicadas`…). A tag with a file
in `world.json`'s `sounds` plays that recording, looped; a tag with an empty slot (or a file that doesn't load) plays
the sound Mundi makes itself, on the fly.

```json
"sounds": { "station": "sound/station.mp3", "izakaya": "sound/izakaya.mp3", "bar": "", … }
```

The recordings here are other people's, under CC0 or CC-BY: who made each one and its license are in
[`CREDITS.md`](CREDITS.md). A new file needs a line there too (`tests/sounds.test.mjs` checks). Files loop, so a
seamless loop of 30–60 seconds works best, set to the loudness of Mundi's own sound for its tag; how the files were
made, what each tag plays and what was left out is in [`docs/tokyo-sounds.md`](../../../docs/tokyo-sounds.md).

The tags: `arcade`, `bar`, `birds`, `cicadas` (summer days only), `club`, `crossing`, `crowd`, `hospital`, `izakaya`,
`karaoke`, `kitchen`, `market`, `office`, `pachinko`, `shop`, `shrine`, `station`, `temple`, `traffic`, `train`, `water`,
`waves`, `wind`. Sounds made by people follow how busy the place is and stop while it's closed.
