// The executive (business, requirements/business.md B-4, B-11): a career beyond a company's top ranks. The ranks
// themselves are job data (`Rank.beyond`, gated by `inrank`, the leadership program and the nomination's stories);
// what's only the executive's lives here: the division (a venture of track `exec` riding on the job, opened by
// reaching its first rank above the top and closed when you leave the job), the season's target its numbers set, the
// performance a shift gives, and the summer and winter bonuses (an effects source on `pay` `bonus`). Nothing happens
// with the `business` system off or without a division in the world.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type VentureDef } from '../core/world.js';
import type { EffectDef } from '../core/traits.js';
import { effectSources } from './effects.js';
import { venturesOf, type VentureState } from './ventures.js';

/** The world's division for a job (the venture of track `exec` whose `job` it is). */
export const divisionDefOf = (w: WorldDef, job: string | null | undefined): VentureDef | null =>
    (job && systemOn(w, 'business') ? (w.ventures ?? []).find(v => v.track === 'exec' && v.job === job) ?? null : null);
/** Your division, while you hold a rank that opens it. */
export function divisionOf(g: Save, w: WorldDef): VentureState | null {
    const d = divisionDefOf(w, g.player.job?.id);
    return d ? venturesOf(g).find(s => s.id === d.id) ?? null : null;
}

// The bonuses by how your division did: nothing until you have one.
effectSources.push((g, w): EffectDef[] => (w.ventures && divisionOf(g, w) ? [] : []));
