// An action's own background (E-5): a room inside a place that isn't a place of its own (a bar's back room, a hotel's
// themed rooms, a closet studio at a friend's flat). While the action plays, and for a little while after it while the
// scene stays the same, the scene shows the action's picture instead of the place's or the room's.
//
// How long it stays: from the moment the action starts until the scene moves on, which is the first of
// · another action, with no picture of its own (one with a picture takes over);
// · leaving the place, or walking into another room of the home;
// · the visit ending (leaving, sleeping);
// · once the action is over, `LINGER` minutes passing or the part of the day changing (the moment the place's own
//   picture would change). While it plays, its picture follows the part of the day as a place's does (`bgs`).
// It never sticks: the action is read from the world each time (a world that no longer has the action or its picture
// shows the usual one), an adult action shows only with adult content on, and a record that no longer holds is dropped
// as soon as anything looks. The save keeps one small record, `g.actPic`, only after an action with a picture.
import { adultOk, nowAbs, type Save } from '../core/store.js';
import type { WorldDef, ActionDef } from '../core/world.js';
import { slotAt, pictureAt } from './daynight.js';
import { roomNow } from './homerooms.js';

/** The action whose picture the scene shows: its id, where (the place, the room of a home: '' for none), from when
 *  until when it plays (absolute game minutes) and the visit it belongs to (`g.visitStart` then). */
export interface ActPic { id: string; loc: string; room?: string; from: number; to: number; visit: number }
// How long the picture stays once the action is over (never past the part of the day it ended in).
export const LINGER = 60;

const roomId = (g: Save, w: WorldDef) => roomNow(g, w)?.id ?? '';
const visitOf = (g: Save) => Number((g as any).visitStart ?? 0) || 0;
/** Has this action a picture of its own? */
export const hasActionPic = (a: ActionDef | null | undefined) => !!a && (!!a.bg || !!(a.bgs && Object.keys(a.bgs).length));

/** An action starts (`to`: the minute it ends): one with a picture is shown from now, and any other one ends what
 *  was shown. A world without these pictures never writes anything. */
export function noteActionPic(g: Save, w: WorldDef, a: ActionDef, from: number, to: number) {
    if (!hasActionPic(a)) { if ((g as any).actPic) delete (g as any).actPic; return; }
    const room = roomId(g, w);
    (g as any).actPic = { id: a.id, loc: g.player.loc, ...(room ? { room } : {}), from, to: Math.max(from, to), visit: visitOf(g) } satisfies ActPic;
}

// Does the record still hold here and now? (Not the world's side: that's read each time.)
function holds(g: Save, w: WorldDef, r: ActPic): boolean {
    const now = nowAbs(g);
    if (r.loc !== g.player.loc || (r.room ?? '') !== roomId(g, w) || r.visit !== visitOf(g) || now < r.from) return false;
    return now <= r.to || (now - r.to <= LINGER && slotAt(now) === slotAt(r.to));
}

/** The action whose picture the scene shows now, or null. A record that no longer holds is dropped (it can't hold
 *  again: time only moves on, and coming back is a new scene). */
export function picAction(g: Save, w: WorldDef): ActionDef | null {
    const r = (g as any).actPic as ActPic | undefined;
    if (!r) return null;
    if (typeof r !== 'object' || typeof r.id !== 'string' || !holds(g, w, r)) { delete (g as any).actPic; return null; }
    const a = w.actions.find(x => x.id === r.id);
    return a && adultOk(g, a) && hasActionPic(a) ? a : null;
}

/** The picture of the action going on, for this part of the day (a file as the world names it, for `worldFile()`),
 *  or null: the scene shows its usual picture. */
export function actionPicture(g: Save, w: WorldDef): string | null {
    const a = picAction(g, w);
    return (a && pictureAt(w, g.minutes, a.bg, a.bgs)) || null;
}
