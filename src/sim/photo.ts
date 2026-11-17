// The player's photography (the `photography` system): photo reputation and contacts, the photos kept in the Lens app
// (records of a place, its looks and who was in the frame, drawn again from the world's pictures), the portfolio, and
// what the AI is told. The boards and briefs are sim/assignments.ts, freelance work sim/freelance.ts, photobooks
// sim/photobooks.ts, the photo studio sim/studio.ts. The save: `g.photo` (PhotoState), read with defaults (old saves
// have none). With the system off, or a world without `photo`, nothing here writes anything.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type CameraRule } from '../core/world.js';
import { stricter } from '../core/photo.js';
import { relOf, idOf } from './rel.js';

/** A brief on offer (either board): `brief` its id, offered on `day` until `until`, its subject (an avatar) and place. */
export interface Offer { id: number; brief: string; day: number; until: number; who?: string; place: string }
/** A shot: the roll's total and DC, the quality, and what added to it by name (the camera, the light, an assistant…). */
export interface Shot { day: number; min: number; place: string; total: number; dc: number; ok: boolean; q: number; parts: { name: string; n: number }[]; photo?: number; redo?: boolean }
/** A brief taken: due on `due`; shot, edited (the lift), extended once; `win`: days its window held while it was open. */
export interface Taken extends Offer { taken: number; due: number; shot?: Shot; edited?: number; extended?: boolean; win?: number[]; plan?: string; yes?: boolean }
/** A photo kept in the Lens app: the place and its looks at that moment, who was in the frame, the camera's look. */
export interface PhotoRec {
    id: number; day: number; min: number; src: 'spot' | 'brief' | 'event' | 'book' | 'private';
    place: string; slot: 'day' | 'afternoon' | 'night'; looks: string[];
    who?: { name: string; expr: string; outfit?: string }[];
    frame: [number, number, number];
    look: 'phone' | 'digital' | 'film' | 'instant';
    cap: string; q?: number; stars?: number; brief?: string; client?: string;
    adult?: true; star?: true; undeveloped?: true;
}
/** A photobook: offered, in progress or published (`def` its PhotobookDef id). */
export interface Book { id: number; def: string; state: 'offered' | 'project' | 'published' | 'declined' | 'ended'; briefs: number; missed?: number; day: number; pay?: number; weeks?: number; paidDay?: number; last?: number; pages?: number[]; said?: boolean }
/** What the save keeps of your photography. */
export interface PhotoState {
    rep: number;
    contacts: Record<string, { day: number; cold?: number }>;
    board: Offer[];
    open: Taken[];
    photos: PhotoRec[];
    portfolio: number[];
    books: Book[];
    done: number;
    week: { from: number; n: number };
    nextId: number;
    /** deliveries by kind (`photos: wedding`), and clients met through a condition (kept once it held) */
    kinds?: Record<string, number>;
    /** the hourly studio you're in: until (absolute minutes), where */
    rental?: { until: number; at: string };
    /** (freelance) how you left the studio: Erika's blessing or a falling-out */
    freelance?: 'blessing' | 'fallout';
    /** the small board's last new gig (day) and the last days a missed or late brief was said */
    smallDay?: number;
}

/** Is photography played in this world (the system on, and the world has photo gigs)? */
export const photoOn = (w: WorldDef | null | undefined) => !!w?.photo && systemOn(w, 'photography');
/** The save's photography, never written (a fresh one for a save that has none). */
export const peekPhoto = (g: Save): PhotoState => ((g as any).photo as PhotoState | undefined) ?? blank();
/** The save's photography, created with its defaults the first time (only call this once something happens). */
export function photoOf(g: Save): PhotoState {
    const p = ((g as any).photo ??= blank()) as PhotoState;
    p.rep ??= 0; p.contacts ??= {}; p.board ??= []; p.open ??= []; p.photos ??= []; p.portfolio ??= [];
    p.books ??= []; p.done ??= 0; p.week ??= { from: g.day, n: 0 }; p.nextId ??= 1;
    return p;
}
function blank(): PhotoState { return { rep: 0, contacts: {}, board: [], open: [], photos: [], portfolio: [], books: [], done: 0, week: { from: 0, n: 0 }, nextId: 1 }; }
/** Your photo reputation, 0–100. */
export const repOf = (g: Save) => peekPhoto(g).rep;

/** How someone stands in front of a camera: the strictest of what the world says of them and what the game keeps (a
 *  card's own settings); missing: free. `avatar` is a store id. */
export function cameraOf(g: Save, w: WorldDef, avatar: string): CameraRule | undefined {
    const r = g.cast?.[avatar], ex = r ? (w.cast?.examples ?? []).find(e => e.name === r.name) : undefined;
    const own = relOf(g).people[idOf(g, avatar)]?.camera;
    return stricter(ex?.camera, own);
}

/** A set with only some of the expressions (an outfit drawn in five): the nearest one it has, before neutral (shared by
 *  the scene's sprites and the photos). */
export const NEAR: Record<string, string[]> = {
    excitement: ['desire', 'joy'], curiosity: ['surprise', 'embarrassment'], admiration: ['love', 'joy'],
    nervousness: ['embarrassment', 'fear'], fear: ['nervousness', 'embarrassment'], surprise: ['embarrassment', 'joy'],
    confusion: ['embarrassment', 'surprise'], realization: ['surprise', 'embarrassment'], remorse: ['sadness', 'embarrassment'],
    caring: ['love'], gratitude: ['love', 'joy'], relief: ['love', 'joy'], approval: ['love', 'joy'], optimism: ['joy', 'love'],
    amusement: ['joy'], pride: ['joy'], desire: ['love'], love: ['desire', 'caring'], embarrassment: ['nervousness'],
};
/** The expression to draw from a set that has `have`: the one wanted, else the nearest, else neutral, else the first. */
export function nearestExpr(want: string, have: string[]): string | undefined {
    const w = (want || 'neutral').toLowerCase(), set = new Set(have.map(h => h.toLowerCase()));
    return [w, ...(NEAR[w] ?? []), 'neutral'].find(x => set.has(x)) ?? have[0];
}

/** A photo as layers to draw (sim/photo.ts builds it, ui/photoui.ts draws it): the place's picture, the sprites, the
 *  look's class, the frame, and who couldn't be drawn ("Hina, not in the picture"). */
export interface PhotoLayers { bg: string; sprites: { url: string; side: 'left' | 'right' | 'center' }[]; look: PhotoRec['look']; frame: [number, number, number]; missing: string[] }
/** The layers of a photo (filled in by session A). */
export function photoLayers(_g: Save, _w: WorldDef, rec: PhotoRec): PhotoLayers {
    return { bg: '', sprites: [], look: rec.look, frame: rec.frame, missing: [] };
}
/** For the AI (the `you` block, after the job's line): your photography in a line; '' with nothing to say. */
export function photoLine(_g: Save, _w: WorldDef): string { return ''; }
