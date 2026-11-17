// A photo studio of your own (photography with housing): one at a time, rented by the week or bought, kept in its own
// slot (`g.houses.studio`) and its own zone list (`w.homes.studios`), outside `houses.owned` and `homes.zones`, so no
// rule or list of homes (settling homes, the two-home and let limits, homes for sale, where people live, moving) ever
// sees it. Its place is `home:studio`; the hourly rental at someone else's studio is `g.photo.rental`. Filled in by
// session H; until then nobody has a studio and no studio is offered.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type StudioZone } from '../core/world.js';

/** The place of your own photo studio. */
export const STUDIO_ID = 'home:studio';
/** Your photo studio: its zone, rented or bought, since when, what you paid, its fixtures; `free`: given by an ending. */
export interface StudioState { zone: string; way: 'rent' | 'buy'; day: number; paid: number; fix: string[]; free?: true }

/** Your photo studio, if you have one (never written). */
export const studioOf = (g: Save): StudioState | null => (((g as any).houses?.studio as StudioState | undefined) ?? null);
/** The photo studios a world has (with `housing` on). */
export const studioZones = (w: WorldDef): StudioZone[] => (systemOn(w, 'housing') ? w.homes?.studios ?? [] : []);
/** Are you in a photo studio now (your own, or the hours you rented one), with that fixture (`cyc`, `dressing`: only
 *  your own studio's)? */
export function inStudio(_g: Save, _w: WorldDef, _need?: string): boolean { return false; }
