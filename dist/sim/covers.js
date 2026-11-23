// A title's cover (adult industry, plans/adult-industry.md "Covers and pictures"): layers, not a file, the way a photo
// is drawn (sim/photo.ts photoLayers): the set's picture for the time of the shoot, up to two stars' sprites (their
// naked set when the overlay gives them one and adult content is on, else their own sprites; the player is never on
// it), and the words the layout puts over them (the title, the label, the stars' names). Pure: every picture goes
// through worldFile and safeUrl; the words are the screen's to escape.
import { adultOn } from '../core/store.js';
import { worldFile } from '../core/world.js';
import { safeUrl } from '../core/safe.js';
import { charOf } from '../st/bridge.js';
import { pictureAt } from './daynight.js';
import { photoLayers } from './photo.js';
import { YOU } from './rel.js';
import { rosterOf, rosterByCard } from './onset.js';
/** The minute a cover's set is drawn at when the title doesn't say (a shoot's call is in the morning). */
export const COVER_MINUTE = 11 * 60;
// The set's picture: its place's (or that place's map's), or the home kind of the zone it's in.
function setPicture(w, t, minute) {
    const set = w.industry?.sets?.find(s => s.id === t.set);
    let file;
    if (set?.place) {
        const p = w.places.find(x => x.id === set.place);
        file = p ? pictureAt(w, minute, p.bg, p.bgs) : undefined;
        if (!file && p) {
            const m = w.maps.find(x => x.id === p.map);
            file = m ? pictureAt(w, minute, m.image, m.images) : undefined;
        }
    }
    else if (set?.zone) {
        const z = [...(w.homes?.zones ?? []), ...(w.homes?.studios ?? [])].find((x) => x.id === set.zone);
        const kind = z ? w.homes?.kinds?.[z.kind] : undefined;
        file = (z?.image || z?.images ? pictureAt(w, minute, z.image, z.images) : undefined) ?? (kind ? pictureAt(w, minute, kind.image, kind.images) : undefined);
    }
    return file ? safeUrl(worldFile(w, file)) : '';
}
// Someone on the title as the person to draw: a roster performer, else one of the world's people by name.
function personOf(g, w, x) {
    const p = rosterOf(w, x) ?? rosterByCard(g, w, x);
    if (p)
        return p;
    const name = g.cast[x]?.name ?? charOf(x)?.name;
    return name ? w.cast.examples.find(e => e.name === name) : undefined;
}
/** A title's cover. */
export function coverLayers(g, w, t) {
    const minute = Number.isFinite(t.call) ? Number(t.call) % 1440 : COVER_MINUTE;
    const stars = t.cast.filter(x => x !== YOU).slice(0, 2);
    const sprites = [], missing = [], names = [];
    // (the roster's performers aren't the world's people: drawn as if they were, for this picture only)
    const roster = w.industry?.roster ?? [];
    const wx = roster.length ? { ...w, cast: { ...w.cast, examples: [...w.cast.examples, ...roster] } } : w;
    stars.forEach((x, i) => {
        const ex = personOf(g, w, x);
        const name = ex?.name ?? String(charOf(x)?.name ?? x);
        names.push(name);
        if (!ex) {
            missing.push(`${name}, not on the cover`);
            return;
        }
        const naked = adultOn(g) && typeof ex.outfits?.naked === 'string';
        const l = photoLayers(g, wx, { place: '', slot: 'day', look: 'digital', frame: [0, 0, 0], who: [{ name: ex.name, expr: naked ? 'desire' : 'joy', ...(naked ? { outfit: 'naked' } : {}) }] });
        const s = l.sprites[0];
        if (!s) {
            missing.push(`${name}, not on the cover`);
            return;
        }
        sprites.push({ url: s.url, side: stars.length === 1 ? 'center' : i === 0 ? 'left' : 'right', name });
    });
    return { bg: setPicture(w, t, minute), sprites, title: t.name, label: w.industry?.labels?.find(l => l.id === t.label)?.name ?? t.label, stars: names, layout: w.industry?.covers?.layout ?? '', missing };
}
