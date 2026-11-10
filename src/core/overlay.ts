// A private overlay for a built-in world: a JSON file the player keeps in SillyTavern's user files
// (user/files/mundi-overlay-<world id>.json) that adds to the world, or changes parts of it, when it loads. It's how
// someone extends a world with material that doesn't belong in the repository (more adult places, people, actions,
// lore, pictures) without forking the world. This file only merges data; `loadWorld()` in world.ts fetches the file.
//
// Rules (they keep saves safe, since a save points at ids):
// · nothing is ever removed or renamed: an item with an id the world already has is changed, any other is added;
// · in an object, the overlay's fields are merged into the world's, nested objects included; a list of items with
//   ids (places, actions, jobs, a person's threads…) is merged item by item; any other list replaces the world's;
// · `lore` entries and `cast.examples` (matched by `name`) are the two lists without ids: lore is added to, people
//   are matched by name;
// · a field ending in "+" adds to a list instead of replacing it ("threads+", "outcomes+"), without ids too;
// · `"adult": true` at the top: everything the file adds counts as adult content (shown only with the save's adult
//   switch on) unless the item says `"adult": false`;
// · the world's id, format and base can't be changed.
import type { WorldDef } from './world.js';

export const overlayFile = (worldId: string) => `user/files/mundi-overlay-${worldId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`;

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const LOCKED = new Set(['id', 'format', 'base', 'i18n']);   // top level
const NOT_DATA = new Set(['world', 'overlay', 'adult']);   // top level: about the file, not part of the world
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const hasStr = (o: unknown, k: string) => isObj(o) && typeof o[k] === 'string' && !!o[k];

export interface OverlayResult { world: WorldDef; added: number; changed: number }

/** The world with the overlay applied (a copy: the world given is left as it was; throws when the file isn't an overlay). */
export function applyOverlay(world: WorldDef, overlay: unknown): OverlayResult {
    if (!isObj(overlay)) throw new Error('an overlay is a JSON object');
    if (overlay.world !== undefined && overlay.world !== world.id) throw new Error(`this overlay is for "${String(overlay.world)}", not "${world.id}"`);
    const adult = overlay.adult === true;
    const w = copy({ ...world, base: undefined, i18n: undefined }) as any;
    let added = 0, changed = 0;

    // A new item, copied; with the adult default it is marked unless it says otherwise.
    const fresh = (item: any) => { const c = copy(item); added++; if (adult && isObj(c) && c.adult === undefined) c.adult = true; return c; };
    const freshList = (list: any[]) => list.map(x => fresh(x));

    // Which field names the items of a list: by id, `name` for the world's people; null: no key (the list is replaced).
    const keyFor = (path: string, base: unknown, over: unknown[]): 'id' | 'name' | null => {
        if (path === 'cast.examples') return over.every(x => hasStr(x, 'name')) ? 'name' : null;
        const all = (l: unknown[]) => l.every(x => hasStr(x, 'id'));
        return over.length && all(over) && (!Array.isArray(base) || all(base)) ? 'id' : null;
    };

    function mergeValue(base: any, over: any, path: string): any {
        if (isObj(base) && isObj(over)) { mergeObject(base, over, path); return base; }
        if (Array.isArray(base) && Array.isArray(over)) {
            const key = keyFor(path, base, over);
            if (!key) return copy(over);
            for (const item of over) {
                const hit = base.find((b: any) => b[key] === item[key]);
                if (hit) { mergeObject(hit, item, path); changed++; } else base.push(fresh(item));
            }
            return base;
        }
        return copy(over);
    }
    function mergeObject(base: any, over: Record<string, any>, path: string) {
        for (const k of Object.keys(over)) {
            if (UNSAFE.has(k)) continue;
            if (!path && (LOCKED.has(k) || NOT_DATA.has(k))) continue;
            if (k.endsWith('+') && k.length > 1 && Array.isArray(over[k])) {
                const t = k.slice(0, -1);
                if (UNSAFE.has(t)) continue;
                base[t] = [...(Array.isArray(base[t]) ? base[t] : []), ...freshList(over[k])];
                continue;
            }
            const p = path ? `${path}.${k}` : k;
            if (!(k in base) || base[k] === null || base[k] === undefined) { base[k] = Array.isArray(over[k]) ? freshList(over[k]) : copy(over[k]); continue; }
            base[k] = mergeValue(base[k], over[k], p);
        }
    }

    // lore has no ids: what the overlay has is added (it can't change an entry, only add)
    const lore = Array.isArray(overlay.lore) ? overlay.lore : null;
    const rest = { ...overlay }; if (lore) delete rest.lore;
    mergeObject(w, rest, '');
    if (lore) { w.lore = [...(Array.isArray(w.lore) ? w.lore : []), ...freshList(lore)]; }
    w.base = world.base; w.i18n = world.i18n;
    return { world: w as WorldDef, added, changed };
}
