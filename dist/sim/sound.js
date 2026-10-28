import { crowdLevel } from './worldstate.js';
import { openNow } from './daynight.js';
import { seasonOf } from './time.js';
/** The sound tags the engine can make itself, with what each one is (for the world's authors and its `sounds` slots). */
export const SOUND_TAGS = {
    crowd: 'people talking and walking past', traffic: 'cars and buses going by', station: 'a station: announcements\' chime, trains, footsteps',
    crossing: 'a big crossing: the walk signal\'s chirps and the crowd', cicadas: 'cicadas (summer days only)', birds: 'birds (mornings above all)',
    izakaya: 'a busy izakaya: voices, laughter, glasses', bar: 'a small bar: a few voices and glasses', kitchen: 'a kitchen: sizzling and clatter',
    karaoke: 'singing and music through the walls', club: 'a club\'s bass', arcade: 'arcade machines\' bleeps and jingles', pachinko: 'pachinko balls\' clatter and jingles',
    temple: 'a temple: wind and now and then a deep bell', shrine: 'a shrine: wind in the trees, a small bell, a clap', waves: 'the sea',
    wind: 'wind', water: 'running water, a bath', office: 'an office: a hum and typing', hospital: 'a hospital: a hum and soft monitor beeps',
    train: 'a train\'s rumble', market: 'a market: voices calling', rain: 'rain on a roof (as well as the weather\'s)',
};
// Tags whose sound comes from people: they follow how busy the place is, and stop when it's closed.
const PEOPLE = new Set(['crowd', 'station', 'crossing', 'izakaya', 'bar', 'kitchen', 'karaoke', 'club', 'arcade', 'pachinko', 'office', 'market', 'traffic', 'train']);
/** What plays at a place now (`place`: where you are). Nothing at home, asleep, on the way somewhere, or at a place
 *  without tags. */
export function soundsAt(g, w, place = g.player.loc) {
    const p = w.places.find(x => x.id === place);
    if (!p?.sound?.length || g.asleep || g.traveling)
        return [];
    const h = g.minutes / 60, season = seasonOf(g).id;
    const open = openNow(g, w, place), busy = crowdLevel(g, w, place); // 0..4
    const late = h < 5 || h >= 23;
    const out = [];
    for (const tag of [...new Set(p.sound)]) {
        let level = 1;
        if (tag === 'cicadas') {
            if (season !== 'summer' || h < 6 || h >= 19)
                continue;
            level = h < 9 || h >= 17 ? 0.6 : 1;
        }
        else if (tag === 'birds') {
            if (h < 4.5 || h >= 19)
                continue;
            level = h < 10 ? 1 : 0.4;
        }
        else if (PEOPLE.has(tag)) {
            if (!open || busy === 0)
                continue;
            level = 0.35 + busy * 0.16;
        }
        else if (late)
            level = 0.6;
        const file = w.sounds?.[tag]?.trim();
        out.push({ tag, level: Math.round(level * 100) / 100, ...(file ? { file } : {}) });
    }
    return out;
}
