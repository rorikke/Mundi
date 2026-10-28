# Tokyo's place sounds

Each place in `world.json` lists what you hear there (`sound`: `station`, `izakaya`, `cicadas`…). Mundi makes these
sounds itself, on the fly, so the world ships no audio files.

To use a recording of your own for a tag, put the file in this folder and name it in `world.json`'s `sounds`, which
has one empty slot per tag Tokyo uses:

```json
"sounds": { "station": "sound/station.mp3", "izakaya": "", … }
```

An empty slot (or a file that doesn't load) plays Mundi's own sound. Files loop, so a seamless loop of 20–60 seconds
works best; use only recordings you have the right to use.

The tags: `arcade`, `bar`, `birds`, `cicadas` (summer days only), `club`, `crossing`, `crowd`, `hospital`, `izakaya`,
`karaoke`, `kitchen`, `market`, `office`, `pachinko`, `shrine`, `station`, `temple`, `traffic`, `train`, `water`,
`waves`, `wind`. Sounds made by people follow how busy the place is and stop while it's closed.
