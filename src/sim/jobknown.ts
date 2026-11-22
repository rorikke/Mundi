// Whether you know what someone does for a living. Saying hi isn't enough: you learn it by seeing them at work, by
// working the same job, or by getting to know them (an Acquaintance, by then it has come up). Once learned it stays
// learned, kept on the person (`jobKnown`), even if you drift apart later.
import { nowAbs, type Save, type Resident, residentsOf } from '../core/store.js';
import type { WorldDef } from '../core/world.js';
import { fr, YOU } from './rel.js';
import { workingAt } from './people.js';
import { tiesOf } from './living.js';

export const KNOW_JOB_AT = 10;   // FRIEND_TIERS' Acquaintance

const coworker = (g: Save, r: Resident) => !!r.occupation && g.player.job?.id === r.occupation;
const acquainted = (g: Save, r: Resident) => r.met && Math.round(fr(g, r.avatar, YOU)) >= KNOW_JOB_AT;
// your family and whoever lives with you: you'd know
const close = (g: Save, r: Resident) => (r as any).homeWith === YOU || tiesOf(g, r.avatar).some(t => t.a === YOU || t.b === YOU);

/** Do you know their job? (Read-only: the scene sync is what keeps it learned.) */
export const knowsJob = (g: Save, r: Resident) => !!r.jobKnown || coworker(g, r) || acquainted(g, r) || close(g, r);

/** Learn the jobs you can know now: whoever is here working at the place you're at, your coworkers (you keep knowing
 *  after you leave the job) and anyone you've got to know. */
export function learnJobs(g: Save, w: WorldDef, here: Resident[]): void {
    const at = nowAbs(g);
    for (const r of here) if (!r.jobKnown && r.occupation && workingAt(g, w, r, at) === g.player.loc) r.jobKnown = true;
    for (const r of residentsOf(g)) if (!r.jobKnown && r.occupation && (coworker(g, r) || acquainted(g, r))) r.jobKnown = true;
}
