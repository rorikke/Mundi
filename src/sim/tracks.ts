// Job tracks by gender (`Occupation.tracks`): one job, one listing, one name, with its own ranks, pay, hours, pace,
// gates and events on each track (the AV actor's track, men's and women's esthe). The player works the track they were
// hired on (`JobState.track`), else their gender's; a player whose gender has no track of its own picks one once when
// hired (`hire()` in work.ts). The world's people work their own gender's track. A job without tracks, or someone with
// no track in it, works the job as written, so every reader asks `trackOf()` and nothing changes for such a job.
import { getWorld, type Occupation, type JobTrack, type When, type WorldDef } from '../core/world.js';
import { DEFAULT_GENDERS } from '../core/presets.js';
import type { Save } from '../core/store.js';
import { relOf, idOf, YOU } from './rel.js';

// A person's gender, read from the store as gender.ts does (importing gender.ts here would load it, and what it loads,
// too early: skills.ts imports this file, and the module cycle then breaks).
const genderOf = (g: Save, a: string): string | undefined => relOf(g).people[idOf(g, a)]?.gender;

/** A job as someone works it: its track laid over it. `track`: the track's id (a gender id); `trackName`: what the
 *  track calls itself; `hire`: a condition to be hired on it, or a list of them where one is enough (an introduction);
 *  `fee`: money taken when you're hired; `pace`: its ranks take this many times as long. */
export interface TrackedJob extends Occupation { track?: string; trackName?: string; hire?: When | When[]; fee?: number; pace?: number }

// Jobs already laid (asked again, they come back as they are), and each job's laid tracks, so a track keeps one object
// (memos keyed by the job, such as the day plan's weeks, keep working).
const laid = new WeakSet<Occupation>();
const kept = new WeakMap<Occupation, Map<string, { t: JobTrack; o: TrackedJob }>>();

/** The job with one of its tracks laid over it: what the track sets replaces the job's own, except `events`, which come
 *  on top of the job's (a track's event with the id of one of the job's replaces it) and `name`, the track's own
 *  (`trackName`; the job keeps its name). The job as written when it has no such track. */
export function layTrack(o: Occupation, id: string): TrackedJob {
    const t = o.tracks?.[id];
    if (!t || laid.has(o)) return o;
    let m = kept.get(o); if (!m) kept.set(o, m = new Map());
    const k = m.get(id); if (k && k.t === t) return k.o;
    const { name, events, ...rest } = t;
    const own = new Set((events ?? []).map(e => e.id));
    const x: TrackedJob = { ...o, ...(rest as Partial<TrackedJob>), track: id };
    if (name) x.trackName = name;
    if (events) x.events = [...(o.events ?? []).filter(e => !own.has(e.id)), ...events];
    delete x.tracks;
    laid.add(x); m.set(id, { t, o: x });
    return x;
}

/** The track the player works a job on (or would, applying): the one kept when hired, else their gender's when the job
 *  has one. Undefined for a job without tracks, or when their gender has none there and they aren't on one (a pick). */
export function playerTrack(g: Save, o: Occupation): string | undefined {
    if (!o.tracks || laid.has(o)) return (o as TrackedJob).track;
    const j = g.player.job as { id: string; track?: string } | null;
    if (j?.id === o.id && j.track && o.tracks[j.track]) return j.track;
    const mine = genderOf(g, YOU);
    return mine && o.tracks[mine] ? mine : undefined;
}
/** Someone's track in a job: the player's (`playerTrack`), or one of the world's people's: their gender's. */
export function trackKey(g: Save, o: Occupation, avatar: string = YOU): string | undefined {
    if (avatar === YOU) return playerTrack(g, o);
    if (!o.tracks || laid.has(o)) return (o as TrackedJob).track;
    const theirs = genderOf(g, avatar);
    return theirs && o.tracks[theirs] ? theirs : undefined;
}
/** A job as someone works it: their track laid over it (the player by default, else one of the world's people). */
export function trackOf(g: Save, o: Occupation, avatar: string = YOU): TrackedJob {
    if (!o.tracks) return o;
    const k = trackKey(g, o, avatar);
    return k ? layTrack(o, k) : o;
}
/** The track of the job the player holds: what `JobState.track` says, else their gender ('' with none). */
export const jobTrack = (g: Save): string => (g.player.job as { track?: string } | null)?.track ?? genderOf(g, YOU) ?? '';
/** A job with tracks where the player has none yet: applying asks them to pick one (once; kept in `JobState.track`). */
export const needsPick = (g: Save, o: Occupation): boolean => !!o.tracks && Object.keys(o.tracks).length > 0 && playerTrack(g, o) === undefined;
/** A track's name for the screens: its own, else the gender's ("Woman"), else its id. */
export function trackName(w: WorldDef | null | undefined, o: Occupation, id: string): string {
    const t = o.tracks?.[id] ?? ((o as TrackedJob).track === id ? { name: (o as TrackedJob).trackName } : undefined);
    return t?.name || ((w ?? null)?.genders ?? DEFAULT_GENDERS).find(x => x.id === id)?.name || id;
}
/** Every track of a job, with its name (the job as written has none). */
export const tracksOf = (g: Save, o: Occupation): { id: string; name: string }[] =>
    Object.keys(o.tracks ?? {}).map(id => ({ id, name: trackName(getWorld(g.world), o, id) }));
