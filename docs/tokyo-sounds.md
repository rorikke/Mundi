# Tokyo's place sounds from public recordings

Tokyo has 23 sound tags (`worlds/tokyo/sound/README.md`). Each slot in `world.json`'s `sounds` now names a recording
other people published under a license we can ship (CC0 or CC BY), instead of the sound Mundi makes itself
(`src/ui/ambience.ts`). No engine change was needed: a slot takes a file path in the world's folder, the file loops,
and if it fails to load (or a slot is emptied), the made sound plays instead. Who made each file and how it was cut is
in `worlds/tokyo/sound/CREDITS.md`.

## Licenses

The code is AGPL-3.0. The sounds keep their own licenses, so each one must let us put the raw file in a public repo.

- **Use:** CC0 (preferred: no conditions, as with Kenney's clicks in `assets/sfx/`) and CC-BY 3.0/4.0 (credit the
  author, link the source and the license, and say what we changed).
- **Don't use:** NC or ND licenses; Freesound's old "Sampling+"; Pixabay (its license forbids handing out files "on
  a standalone basis"); Sonniss GDC bundles; BBC Sound Effects (RemArc, non-commercial); Japanese free-SFX sites that
  forbid passing the files on (素材の再配布禁止), such as Sound Effect Lab.
- **Check first:** OtoLogic (otologic.jp) is reported as CC BY 4.0, raw files included, with "OtoLogic" as the
  credit. Read its own terms page before using it.
- **Copyrighted music, even in the background:** no station departure melodies (some JR ones are real songs), shop
  or parlor music, karaoke songs or DJ tracks. Listen to the whole stretch you keep.
- **Record it:** each file gets a line in `worlds/tokyo/sound/CREDITS.md` (file, title, author, URL, license, what
  changed: "trimmed 0:40–1:25, looped, MP3"), and the README's Credits section names it.

## How to pick and prepare a file

- **One file per tag for the whole world.** Pick what fits most of the tag's places, not the best-known one:
  - `office` is the indoor hum of konbini, capsule hotels, manga cafés, a museum and a TV station as well as offices,
    so it needs a quiet room tone with no voices and little typing.
  - `water` is mostly baths (sento, ryokan, Hakone Yumoto, a love hotel, an esthe), with one river (Sumida).
  - `bar` also covers a kissaten and a mahjong parlor.
- **No birds or cicadas in other tags.** `birds` and `cicadas` have their own tags, which go quiet at night and
  outside summer. A shrine or water file with birdsong in it would sing at night; a shrine with cicadas would buzz in
  winter. The places that need them already have those tags.
- **Crowds need voices.** The steadiest stretch of a street recording can be a machine (the first crowd loop was
  construction). For tags made by people, pick the stretch by how much of it is voices (voiced pitch that moves, the
  2–8 Hz rhythm of syllables, sound in the voice band) and check it has no held notes (music).
- **Avoid doubling.** Tags are layered: `sb_yoyogi` plays crowd, birds and cicadas at once. A `crowd` file with
  heavy traffic, or a `crossing` file full of crowd, gets thicker than intended.
- **Loop:** cut 30–60 s from the steadiest stretch, without a sound that would be noticed each time it comes back (a
  door, a clear word, a car horn). Crossfade the end into the start so the loop has no seam.
- **Loudness:** each file matches Mundi's own sound for its tag, so the balance between tags stays as designed
  and the engine's level (0.35–1 by how busy the place is) works on top of it. Both are measured the same way in the
  browser: the made sound rendered offline (`OfflineAudioContext`, its beds and events at gain 1), the file decoded,
  both K-weighted (a 38 Hz high-pass and a +4 dB shelf at 1681 Hz) and averaged. The made `birds` is short chirps
  over silence, so its file is set 7 dB above it.
- **Format:** MP3, 128 kbps stereo, 48 kHz (as `assets/sfx/`), 0.5–1 MB per file. Chromium decodes these loops to
  their exact length (the encoder's padding is trimmed), so the loop point has no gap. Name files `sound/<tag>.mp3`.
- **How the files were made:** Freesound's high-quality previews (128 kbps MP3; the original files need a
  Freesound login and would be a little cleaner). A script chose each stretch. For the first batch it looked only at
  steadiness (little change in 3-second loudness, a penalty for a single loud event); for the crowd and the second
  batch it also scored, second by second, voices (wanted for crowd, izakaya, market, station
  and bar; avoided for office, kitchen, wind, water, hospital, shrine, temple and club) and held notes (music: avoided,
  counted for less at the arcade and pachinko, wanted for karaoke). It kept the best stretch, crossfaded 3 s of its
  tail into its head, applied the measured gain and encoded with ffmpeg. Two are mixes, with the overlay wrapped across
  the loop's seam: the temple bed with a bell at 0:04, the hospital's room tone with soft beeps made by the script.
  The crowd, the crossing and the second batch were listened to before they went in.

## What each tag plays (chosen 2026-11-12)

| Tag | Places | Recording | License | Notes |
|---|---|---|---|---|
| crowd | 27 | [Walking through shops of Japan](https://freesound.org/people/jrussell_tm/sounds/789673/) (jrussell_tm) | CC0 | The stretch with the most voices. Nakano Station north exit (markystar), the first pick, sounded like construction. Also liked: [Shibuya crossing](https://freesound.org/people/Heigh-hoo/sounds/31791/), now `crossing`. |
| birds | 13 | [Kashiwa birds](https://freesound.org/people/RutgerMuller/sounds/361918/) (RutgerMuller) | CC0 | 7 dB above the made sound, which is short chirps over silence. |
| wind | 13 | [Typhoon wind, Mitaka](https://freesound.org/people/piego/sounds/490656/) (piego) | CC0 | Chosen over wind in high pines (bruno.auzet) and Sapporo (pflanigan). |
| office | 10 | [Office Ambience](https://freesound.org/people/170026/sounds/407735/) (170026) | CC0 | A fan, distant talk, typing; 4 dB under the made sound. Also plays in a capsule hotel, a manga café and a museum. |
| shop | 1 | [Tokyo - Supermarket](https://freesound.org/people/manuke/sounds/315897/) (manuke) | CC0 | Hiroo: a queue, Japanese voices, coins and registers, no music; 4 dB under the made sound. A tag of its own for the konbini (Moonlight Mart), which sounded like an office; its made sound is a fridge hum, a two-note door chime and a till's beep. |
| traffic | 9 | [Tokyo evening rush](https://freesound.org/people/markystar/sounds/75271/) (markystar) | CC0 | |
| cicadas | 7 | [Hie Jinja, Akasaka](https://freesound.org/people/markystar/sounds/79086/) (markystar) | CC0 | |
| bar | 7 | [Tokyo darts bar](https://freesound.org/people/markystar/sounds/79089/) (markystar) | CC0 | A stretch before the music gets loud. |
| water | 6 | [Bath tap running](https://freesound.org/people/BenParamoreAudio/sounds/839780/) (BenParamoreAudio) | CC0 | Fits the baths; the Sumida river gets it too (see below). |
| market | 6 | [Ameyoko](https://freesound.org/people/manuke/sounds/315875/) (manuke) | CC0 | |
| izakaya | 5 | [Crowded Tokyo diner](https://freesound.org/people/markystar/sounds/75249/) (markystar) | CC0 | |
| kitchen | 5 | [Teppanyaki, Honolulu](https://freesound.org/people/RadioGoldProductions/sounds/352120/) (RadioGoldProductions) | CC BY 4.0 | Chosen over a Mexico City kitchen (Globofonia, CC0). |
| club | 5 | [Outside a club, Belgrade](https://freesound.org/people/Tomlija/sounds/106882/) (Tomlija) | CC BY 3.0 | A muffled kick drum; the recording is 37 s, so the loop is 34 s. |
| waves | 5 | [Setouchi soft waves](https://freesound.org/people/Intimana/sounds/621387/) (Intimana) | CC0 | A very quiet recording raised 35 dB. |
| shrine | 3 | [Hachimangu, Kamakura](https://freesound.org/people/volivieri/sounds/76582/) (volivieri) | CC BY 4.0 | Visitors, coins in the offering box. Chosen over Meiji Jingu (Oscarno, CC0). |
| train | 3 | [Hibiya line interior](https://freesound.org/people/manuke/sounds/315896/) (manuke) | CC0 | |
| arcade | 2 | [Tokyo arcade floor](https://freesound.org/people/csaszi/sounds/481770/) (csaszi) | CC0 | 6 dB above the made sound (sparse bleeps). |
| karaoke | 2 | [Distant Japanese bar](https://freesound.org/people/gazy/sounds/459807/) (gazy) | CC0 | Karaoke heard from outside a bar in Chatan, Okinawa. |
| station | 2 | [Ueno Station concourse](https://freesound.org/people/muse88/sounds/490525/) (muse88) | CC0 | A concourse, not a platform: no departure melodies. |
| pachinko | 1 | [Pachinko ambience](https://freesound.org/people/macdaddyno1/sounds/349390/) (macdaddyno1) | CC0 | A Tokyo parlor; the loop is 41 s. |
| temple | 1 | [Quiet Kyoto temple](https://freesound.org/people/LG/sounds/462733/) (LG) with the [Zojo-ji bell](https://freesound.org/people/Echograin/sounds/843521/) (Echograin) | CC BY 4.0 | A mix: the bell at 0:04 of a 60 s loop, 10 dB over the bed. |
| hospital | 1 | [Room tone, empty hospital](https://freesound.org/people/Kinoton/sounds/670070/) (Kinoton) | CC0 | A mix: soft beeps (960 Hz, every 2 s) made by the script; 3 dB under the made sound. |
| crossing | 1 | [Shibuya crossing](https://freesound.org/people/Heigh-hoo/sounds/31791/) (Heigh-hoo) | CC0 | People walking and talking on the crossing. The walk signal's chirps may not be in it. |

Left out after scoring: a shrine with a cicada chorus (Heigh-hoo: it would buzz in winter), an office with a
steady whine (DavidFrbr), a draft through a 6th-floor Tokyo window (f_t: it whistles).

## Still open

- **Sumida river:** with a bath in `water`, the river sounds like a tap. A `river` tag of its own would need a new
  entry in `SOUND_TAGS`, a made sound in `ambience.ts`, `ot_sumida`'s tags changed and a new slot. The
  [Tottori stream](https://freesound.org/people/tomasloos/sounds/843520/) (CC0) could fill it if its birds can be cut.
- **Play a few places with several tags** (`sb_yoyogi`, `yk_bay`, `sj_omoide`, `ot_sensoji`) at different hours and
  seasons, and adjust a tag's loudness if it stands out.
- **Better sources,** if wanted later: Freesound's original files instead of previews (a login), cicada species by
  name (minminzemi, aburazemi, higurashi), Wikimedia Commons' Japan audio (much is CC BY-SA, which needs its own credit
  line), OtoLogic (check its terms) for the crossing's chirps.
