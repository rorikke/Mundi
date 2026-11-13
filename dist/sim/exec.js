import { systemOn } from '../core/world.js';
import { effectSources } from './effects.js';
import { venturesOf } from './ventures.js';
/** The world's division for a job (the venture of track `exec` whose `job` it is). */
export const divisionDefOf = (w, job) => (job && systemOn(w, 'business') ? (w.ventures ?? []).find(v => v.track === 'exec' && v.job === job) ?? null : null);
/** Your division, while you hold a rank that opens it. */
export function divisionOf(g, w) {
    const d = divisionDefOf(w, g.player.job?.id);
    return d ? venturesOf(g).find(s => s.id === d.id) ?? null : null;
}
// The bonuses by how your division did: nothing until you have one.
effectSources.push((g, w) => (w.ventures && divisionOf(g, w) ? [] : []));
