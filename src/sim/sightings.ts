// Sightings and discretion (business, the love hotel, adult content only: plans/business-hospitality.md H6,
// requirements/business.md B-14, B-20): a hotel sees who comes in with whom. The world's couples count in the night's
// rooms without a word; one you'd notice becomes a sighting only when it moves a story (a secret not yet known, a
// couple you didn't know was one, someone with a partner coming in with someone else), at most one a week (two in the
// year-end weeks), heard at the desk during your own hours or from the notebook of whoever keeps the night window.
// Your choice: keep it, use it (you learn it), let it slip (a rumor, a couple hurt). Nothing here runs with the
// `business` system off or adult content off. Phase H0: the gate only; the rest comes in session D.
import { adultOn, type Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';

/** Can this game have sightings at all: the system on, adult content on, and a venture in the world that has them. */
export const sightingsOn = (g: Save, w: WorldDef): boolean =>
    systemOn(w, 'business') && adultOn(g) && (w.ventures ?? []).some(v => !!v.sightings?.length || !!v.notebook);
