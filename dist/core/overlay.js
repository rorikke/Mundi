export const overlayFile = (worldId) => `user/files/mundi-overlay-${worldId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const LOCKED = new Set(['id', 'format', 'base', 'i18n']); // top level
const NOT_DATA = new Set(['world', 'overlay', 'adult', 'flatFiles']); // top level: about the file, not part of the world
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const hasStr = (o, k) => isObj(o) && typeof o[k] === 'string' && !!o[k];
/** The world with the overlay applied (a copy: the world given is left as it was; throws when the file isn't an overlay). */
export function applyOverlay(world, overlay) {
    if (!isObj(overlay))
        throw new Error('an overlay is a JSON object');
    if (overlay.world !== undefined && overlay.world !== world.id)
        throw new Error(`this overlay is for "${String(overlay.world)}", not "${world.id}"`);
    const adult = overlay.adult === true;
    const w = copy({ ...world, base: undefined, i18n: undefined });
    let added = 0, changed = 0;
    // A new item, copied; with the adult default it is marked unless it says otherwise.
    const fresh = (item) => { const c = copy(item); added++; if (adult && isObj(c) && c.adult === undefined)
        c.adult = true; return c; };
    const freshList = (list) => list.map(x => fresh(x));
    // Which field names the items of a list: by id, `name` for the world's people; null: no key (the list is replaced).
    const keyFor = (path, base, over) => {
        if (path === 'cast.examples')
            return over.every(x => hasStr(x, 'name')) ? 'name' : null;
        const all = (l) => l.every(x => hasStr(x, 'id'));
        return over.length && all(over) && (!Array.isArray(base) || all(base)) ? 'id' : null;
    };
    function mergeValue(base, over, path) {
        if (isObj(base) && isObj(over)) {
            mergeObject(base, over, path);
            return base;
        }
        if (Array.isArray(base) && Array.isArray(over)) {
            const key = keyFor(path, base, over);
            if (!key)
                return copy(over);
            for (const item of over) {
                const hit = base.find((b) => b[key] === item[key]);
                if (hit) {
                    mergeObject(hit, item, path);
                    changed++;
                }
                else
                    base.push(fresh(item));
            }
            return base;
        }
        return copy(over);
    }
    function mergeObject(base, over, path) {
        for (const k of Object.keys(over)) {
            if (UNSAFE.has(k))
                continue;
            if (!path && (LOCKED.has(k) || NOT_DATA.has(k)))
                continue;
            if (k.endsWith('+') && k.length > 1 && Array.isArray(over[k])) {
                const t = k.slice(0, -1);
                if (UNSAFE.has(t))
                    continue;
                // an adult file's options for a trait group are adult options (strings can't carry the mark)
                if (adult && t === 'options' && path === 'sheet.traits' && over[k].every((x) => typeof x === 'string')) {
                    base.adultOptions = [...(Array.isArray(base.adultOptions) ? base.adultOptions : []), ...copy(over[k])];
                    added += over[k].length;
                    continue;
                }
                base[t] = [...(Array.isArray(base[t]) ? base[t] : []), ...freshList(over[k])];
                continue;
            }
            const p = path ? `${path}.${k}` : k;
            // an object the world doesn't have yet is merged into an empty one, so its "+" lists add and what its lists
            // add is marked adult as anywhere else (`goals: { "add": […], "off+": […] }` on a world without goals)
            if (!(k in base) || base[k] === null || base[k] === undefined) {
                if (isObj(over[k])) {
                    base[k] = {};
                    mergeObject(base[k], over[k], p);
                }
                else
                    base[k] = Array.isArray(over[k]) ? freshList(over[k]) : copy(over[k]);
                continue;
            }
            base[k] = mergeValue(base[k], over[k], p);
        }
    }
    // lore is added to; an entry with the id of one of the world's replaces that one (its fields merged), so the world's
    // plain line isn't sent next to the overlay's
    const lore = Array.isArray(overlay.lore) ? overlay.lore : null;
    const rest = { ...overlay };
    if (lore)
        delete rest.lore;
    mergeObject(w, rest, '');
    if (lore) {
        const list = Array.isArray(w.lore) ? w.lore : [];
        for (const item of lore) {
            const hit = hasStr(item, 'id') ? list.find(b => isObj(b) && b.id === item.id) : null;
            if (hit) {
                mergeObject(hit, item, 'lore');
                changed++;
            }
            else
                list.push(fresh(item));
        }
        w.lore = list;
    }
    w.base = world.base;
    w.i18n = world.i18n;
    return { world: w, added, changed };
}
/* ---------- overlay packs: a zip the player installs (Settings → Add-ons) ---------- */
// A pack is a zip of what goes into SillyTavern's user files: `mundi-overlay-<world id>.json` at its top and the
// pictures in their folders, as the overlay's `/user/files/…` addresses name them. SillyTavern's upload only takes plain
// file names, so the pictures are saved with their folders joined by "__" (`priv/tokyo/bar.avif` →
// `priv__tokyo__bar.avif`) and the overlay is saved with `"flatFiles": true`; Mundi then reads that world's
// `/user/files/…` addresses the same way (`flatUrl`). An overlay copied in by hand, folders and all, keeps its folders.
export const flatName = (rel) => rel.split('/').join('__');
export function flatUrl(file) {
    const m = /^\/user\/files\/([^?#]+)$/.exec(file);
    return m && m[1].includes('/') ? `/user/files/${flatName(m[1])}` : file;
}
const PACK_FILE = /\.(png|webp|avif|gif|jpe?g|json|mp3|ogg|wav|m4a)$/i;
const PART = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/; // what SillyTavern's upload takes, one folder or file name at a time
/** What installing a pack writes (throws with a message for the player when it can't be installed). `worlds`: the
 *  bundled worlds' ids, the only ones an overlay can be for. Files that can't be saved are skipped (and listed). */
export function packPlan(entries, worlds) {
    let list = entries.map(e => ({ name: e.name.replace(/\\/g, '/').replace(/^(\.\/)+/, ''), data: e.data }))
        .filter(e => !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i.test(e.name));
    // zipped from outside its folder ("pack/mundi-overlay-tokyo.json"): that folder is left out
    for (;;) {
        const top = list[0]?.name.split('/')[0];
        if (!top || list.some(e => !e.name.startsWith(`${top}/`)) || list.some(e => /^mundi-overlay-.*\.json$/.test(e.name)))
            break;
        list = list.map(e => ({ ...e, name: e.name.slice(top.length + 1) }));
    }
    const plan = { overlays: [], files: [], skipped: [] };
    const seen = new Map();
    const dec = new TextDecoder();
    for (const e of list) {
        const ov = /^mundi-overlay-(.+)\.json$/.exec(e.name);
        if (ov) {
            const world = worlds.find(id => overlayFile(id) === `user/files/${e.name}`);
            if (!world)
                throw new Error(`"${e.name}" is for a world Mundi doesn't have.`);
            let o;
            try {
                o = JSON.parse(dec.decode(e.data));
            }
            catch {
                throw new Error(`"${e.name}" isn't readable JSON.`);
            }
            if (!isObj(o))
                throw new Error(`"${e.name}" isn't an overlay.`);
            if (o.world !== undefined && o.world !== world)
                throw new Error(`"${e.name}" says it is for "${String(o.world)}".`);
            plan.overlays.push({ world, name: e.name, text: JSON.stringify({ ...o, world, flatFiles: true }) });
            continue;
        }
        const parts = e.name.split('/');
        // a picture always comes in a folder: a plain name could replace one of Mundi's own files (a made world)
        if (parts.length < 2 || !parts.every(p => PART.test(p) && p !== '..') || !PACK_FILE.test(e.name)) {
            plan.skipped.push(e.name);
            continue;
        }
        const name = flatName(e.name);
        if (name.length > 200)
            throw new Error(`"${e.name}": the name is too long.`);
        const before = seen.get(name.toLowerCase());
        if (before)
            throw new Error(`"${before}" and "${e.name}" would be saved as the same file.`);
        seen.set(name.toLowerCase(), e.name);
        plan.files.push({ name, data: e.data });
    }
    if (!plan.overlays.length)
        throw new Error('No overlay in this zip: it needs a mundi-overlay-<world>.json at its top.');
    return plan;
}
