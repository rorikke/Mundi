// The collection: halls of slots and the completion record (Tokyo memories). A record slot fills by itself, for good,
// the first time its condition holds; R-1 leaves out what this game can't have (and someone added later brings theirs
// back); R-3 records any ending; R-4 leaves a district's stories that can't happen any more out of its count; R-8 keeps
// a finished record finished when the world gains slots. Old saves are filled once, the first time, from what they
// remember. The world data is `w.collection` (core/world.ts, made safe by core/collection.ts); the save is
// `g.collection`. With the system off, or a world without halls, nothing here reads or writes anything.
import { adultOn } from '../core/store.js';
import { systemOn, getWorld } from '../core/world.js';
import { MIN_KIND } from '../core/collection.js';
import { onHour, onKeepsake, collectionLink, museumHooks } from './hooks.js';
import { parseWhen, whenHolds, namedIn, personNamed, threadsInGame, missingWords, kindHere, placesToVisit, placesOnMap } from './when.js';
import { threadsOf, goneFromMap, titleOf } from './threads.js';
import { personaName } from '../st/bridge.js';
import { offeredGoals } from './goals.js';
/** The system on and something to collect in this world. */
export const collectionOn = (w) => !!w && systemOn(w, 'collection') && !!w.collection?.halls?.length;
/** The save's collection as it is, without writing anything. */
export const collectionOf = (g) => g.collection;
/** The save's collection, made on first use. */
export function collectionState(g) {
    const c = (g.collection ??= {});
    c.got ??= {};
    c.counted ??= [];
    c.had ??= [];
    return c;
}
/* ---------- R-1: the slots this game has ---------- */
// The storylines' states, read without making the key (sim/threads.ts's accessor writes `g.threads`)
const threadStates = (g) => (g.threads ?? {});
const hallOf = (w, id) => w.collection?.halls.find(h => h.id === id);
// Which percentage a slot counts in: the record's, the museum's, or none (a hall of its own, `apart`)
const countsIn = (w, s, record) => { const h = hallOf(w, s.hall); return !h?.apart && !!h?.record === record; };
const fits = (g, w, x) => (!x.adult || adultOn(g)) && (x.needs ?? []).every(n => systemOn(w, n));
// The storyline a slot is about (`thread: <id>` with no ending named), and the keepsake kind (`had: all <kind>`).
const threadOfSlot = (s) => {
    const c = parseWhen(s.when).conds;
    return c.length === 1 && c[0].key === 'thread' && !c[0].not && c[0].values.length === 1 ? c[0].values[0].split(/\s+/)[0] : null;
};
// (museum) A piece whose only ways are storylines' endings (a person's thing) is about those storylines.
const endingsOfSlot = (s) => {
    const src = s.sources ?? [];
    return src.length && src.every(x => x.kind === 'ending' && !!x.id) ? src.map(x => x.id) : [];
};
const storyOfSlot = (s) => threadOfSlot(s) ?? endingsOfSlot(s)[0] ?? null;
const kindOfSlot = (s) => {
    for (const c of parseWhen(s.when).conds)
        if (c.key === 'had' && !c.not)
            for (const v of c.values) {
                const m = v.match(/^all\s+(.+)$/i);
                if (m)
                    return m[1].trim();
            }
    return null;
};
const memo = new WeakMap();
/** The slots this game has (R-1): adult ones only with adult content on, systems it needs on, this game's start, the
 *  people and storylines it names in the game (`thread:` holds when no one has the storyline, so a slot about an absent
 *  person's storyline must be left out before it's asked), a keepsake kind with at least `minKind` keepsakes here.
 *  Kept until the day, adult content or the cast changes. */
export function slotsHere(g, w) {
    if (!collectionOn(w))
        return [];
    const key = `${g.day}|${adultOn(g)}|${Object.keys(g.cast ?? {}).length}|${w.collection.slots.length}`;
    const m = memo.get(g);
    if (m && m.key === key && m.w === w)
        return m.slots;
    const start = g.player.start ?? g.player.origin;
    const threads = threadsInGame(g, w), min = w.collection.minKind ?? MIN_KIND;
    const slots = w.collection.slots.filter(s => {
        const h = hallOf(w, s.hall);
        if (!h || !fits(g, w, h) || !fits(g, w, s))
            return false;
        if (s.starts?.length && !s.starts.includes(start))
            return false;
        const named = namedIn(s.when);
        if (s.who)
            named.people.push(s.who);
        if (named.people.some(p => !personNamed(g, p)))
            return false;
        if (named.threads.some(t => !threads.has(t)))
            return false;
        const ends = endingsOfSlot(s);
        if (ends.length && !ends.some(t => threads.has(t)))
            return false;
        const kind = kindOfSlot(s);
        if (kind !== null && kindHere(g, w, kind).length < min)
            return false;
        return true;
    });
    memo.set(g, { key, w, slots });
    return slots;
}
/* ---------- R-4: a district's street stories ---------- */
// Stories that belong to the Business app and the jobs, not to a district; (museum) nor the museum's and the end game's
// people's (its milestones at the museum, a tier).
const NOT_DISTRICT = new Set(['venture', 'job', 'rank', 'upgrade', 'inrank', 'tenant', 'kept', 'track', 'piece', 'museum', 'tier', 'sales', 'dealer', 'dig', 'let', 'rent', 'board', 'record', 'photorep', 'portfolio', 'contact', 'photobook', 'photos', 'studio', 'freelance']);
const seenOf = (g) => (g.stories?.seen ?? {});
// A person a story names who left the map or isn't in this game.
const personGone = (g, name) => { const r = personNamed(g, name); return !r || goneFromMap(r); };
// Can one value of a condition never hold again?
function valueGone(g, w, key, v) {
    const st = threadStates(g);
    switch (key) {
        case 'present':
        case 'onShift':
        case 'favor': return personGone(g, v);
        case 'feels': return namedIn(`feels: ${v}`).people.some(p => personGone(g, p));
        case 'start': return (g.player.start ?? g.player.origin) !== v;
        case 'thread': {
            const [id, how] = v.split(/\s+/);
            return !!how && !!st[id]?.ended && st[id].ended !== how;
        }
        case 'knows': return !!st[v]?.ended && st[v].known === undefined;
        case 'seen': {
            const [id, n] = v.split(':');
            const s = seenOf(g)[id];
            return !!n && !!s && s.choice !== undefined && s.choice !== Number(n) - 1;
        }
        default: return false;
    }
}
function storyGone(g, w, s, depth = 0) {
    for (const c of parseWhen(s.when).conds)
        if (!c.not && c.values.length && c.values.every(v => valueGone(g, w, c.key, v)))
            return true;
    if (s.after && depth < 3 && !seenOf(g)[s.after]) {
        const a = (w.stories ?? []).find(x => x.id === s.after);
        if (a && storyGone(g, w, a, depth + 1))
            return true;
    }
    return false;
}
/** A district's street stories (R-4): those of its places (adult ones only with adult content on) without a venture,
 *  job or rank condition; seen ones, those still to come, and those that can't happen any more. */
export function storyPool(g, w, map) {
    const out = { seen: [], open: [], gone: [] };
    const own = w.collection?.museum?.place; // (museum) its place's stories are the museum's
    const places = new Set(w.places.filter(p => p.map === map && !p.venture && p.id !== own).map(p => p.id)), seen = seenOf(g);
    for (const s of w.stories ?? []) {
        if (!places.has(s.place) || (s.adult && !adultOn(g)))
            continue;
        if (parseWhen(s.when).conds.some(c => NOT_DISTRICT.has(c.key)))
            continue;
        if (seen[s.id])
            out.seen.push(s);
        else if (storyGone(g, w, s))
            out.gone.push(s);
        else
            out.open.push(s);
    }
    return out;
}
const mapName = (w, id) => w.maps.find(m => m.id === id)?.name ?? id;
collectionLink.storiesDone = (g, w, map) => { if (!collectionOn(w))
    return false; const p = storyPool(g, w, map); return p.seen.length > 0 && p.open.length === 0; };
collectionLink.storiesWords = (g, w, map) => { const p = storyPool(g, w, map); return `the rest of ${mapName(w, map)}'s street stories (${p.seen.length} of ${p.seen.length + p.open.length})`; };
/* ---------- every life goal ---------- */
const goalCount = (g, w) => { const all = offeredGoals(g, w); return { all: all.length, done: all.filter(x => whenHolds(g, w, `goal: ${x.id}`)).length }; };
collectionLink.goalsAll = (g, w) => { if (!collectionOn(w) || !systemOn(w, 'goals'))
    return false; const n = goalCount(g, w); return n.all > 0 && n.done >= n.all; };
collectionLink.goalsWords = (g, w) => { const n = goalCount(g, w); return `every life goal (${n.done} of ${n.all})`; };
/* ---------- latching, the backfill, R-8 ---------- */
// The day a slot's event happened, where the save knows it: a storyline's end, a district's last story or place.
function dayOf(g, w, s) {
    const t = threadOfSlot(s);
    if (t)
        return threadStates(g)[t]?.endDay;
    return undefined;
}
// A storyline's ending, whether it was good and how it came (R-3).
function endingOf(g, w, id) {
    const st = threadStates(g)[id];
    if (!st?.ended)
        return {};
    const t = threadsOf(g, w).find(x => x.t.id === id)?.t;
    const e = t?.endings?.find(x => x.id === st.ended);
    return { how: st.ended, ...(e?.good ? { good: true } : {}), ...(st.endedBy ? { by: st.endedBy } : {}) };
}
/** Filled ÷ counted, for the record (`record` halls) or the museum (every other hall), over the slots here; a hall of
 *  its own (`apart`) counts in neither. */
export function percentOf(g, w, record) {
    const c = collectionOf(g), counted = new Set(c?.counted ?? []);
    const here = slotsHere(g, w).filter(s => countsIn(w, s, record) && !s.bonus); // (a bonus piece never counts)
    const inIt = here.filter(s => counted.has(s.id)), filled = inIt.filter(s => c?.got[s.id]).length;
    return { filled, counted: inIt.length, pct: inIt.length ? Math.floor((filled / inIt.length) * 100) : 0, fresh: here.length - inIt.length };
}
// (track 7) `record: 50%` (the record's percentage) and `record: all in cabinet` / `record: 12 in cabinet` (one record
// hall's slots this game has, filled; an apart hall too), and their words.
const RECORD_IN = /^(\d+|all)\s+in\s+(\S+)$/i;
function recordFill(g, w, hall) {
    const slots = slotsHere(g, w).filter(s => s.hall === hall && !s.bonus), got = collectionOf(g)?.got ?? {};
    return { have: slots.filter(s => !!got[s.id]).length, all: slots.length };
}
collectionLink.record = (g, w, v) => {
    if (!collectionOn(w))
        return false;
    const m = v.match(RECORD_IN);
    if (m) {
        if (!hallOf(w, m[2])?.record)
            return false;
        const f = recordFill(g, w, m[2]);
        return m[1].toLowerCase() === 'all' ? f.all > 0 && f.have === f.all : f.have >= Number(m[1]);
    }
    const p = v.match(/^(\d+)%$/);
    if (!p)
        return false;
    const r = percentOf(g, w, true);
    return r.counted > 0 && r.pct >= Number(p[1]);
};
collectionLink.recordWords = (g, w, v) => {
    const m = v.match(RECORD_IN);
    if (m) {
        const f = recordFill(g, w, m[2]), name = hallOf(w, m[2])?.name ?? m[2];
        return m[1].toLowerCase() === 'all' ? `every entry in ${name} (${f.have} of ${f.all})` : `${m[1]} entries in ${name} (${f.have} now)`;
    }
    return `${recordName(w)} ${v} complete (${percentOf(g, w, true).pct}% now)`;
};
const recordName = (w) => w.collection?.halls.find(h => h.record && !h.apart)?.name ?? 'Your collection';
/** Fill what holds now (an hourly hook and when a save opens; the first run is the backfill). Returns lines to show. */
// (a condition can reach `game()`, which settles a save it's opening: never inside a settle already running)
let busy = false;
export function settleCollection(g, w) {
    if (!collectionOn(w) || busy)
        return [];
    busy = true;
    try {
        return [...settle(g, w), ...museumHooks.settle(g, w)];
    }
    finally {
        busy = false;
    }
}
function settle(g, w) {
    const c = collectionState(g), first = !c.v;
    if (first) {
        // keepsakes already held: those life points paid for, and those in hand
        const ids = new Set((w.keepsakes ?? []).map(k => k.id));
        const had = [...(g.points?.kinds ?? []), ...Object.entries((g.player.keepsakes ?? {})).filter(([, n]) => n > 0).map(([id]) => id)];
        for (const id of had)
            if (ids.has(id) && !c.had.includes(id))
                c.had.push(id);
    }
    const here = slotsHere(g, w), filled = [];
    for (const s of here) {
        if (c.got[s.id] || !s.when)
            continue;
        if (!whenHolds(g, w, s.when))
            continue;
        const t = threadOfSlot(s);
        const day = first ? dayOf(g, w, s) : undefined;
        // (`back`: filled by the first settle on a day the save doesn't know: "before the record began")
        c.got[s.id] = { day: day ?? g.day, ...(t ? endingOf(g, w, t) : {}), ...(first && day === undefined ? { back: true } : {}) };
        filled.push(s);
    }
    // R-8: a slot not counted yet joins the count when it fills, or at once while that percentage isn't 100%
    const counted = new Set(c.counted), halls = [];
    if (first)
        for (const s of here)
            counted.add(s.id);
    else
        for (const record of [true, false]) {
            const fresh = here.filter(s => !counted.has(s.id) && countsIn(w, s, record));
            if (!fresh.length)
                continue;
            const inIt = here.filter(s => counted.has(s.id) && countsIn(w, s, record) && !s.bonus);
            const done = inIt.length > 0 && inIt.every(s => c.got[s.id]);
            // a display hall none of whose slots was counted yet (a world's new halls, under a save below 100%) is said
            // once, as its slots join the count and the percentage drops; only where the display halls are shown
            if (!record && !done && museumHooks.begun(g, w) !== false)
                for (const h of w.collection?.halls ?? []) {
                    if (h.record || h.apart || (h.open && !whenHolds(g, w, h.open)))
                        continue;
                    if (fresh.some(s => s.hall === h.id) && !here.some(s => s.hall === h.id && counted.has(s.id)))
                        halls.push(h.name);
                }
            for (const s of fresh)
                if (!done || c.got[s.id])
                    counted.add(s.id);
        }
    // (a hall of its own has no percentage to keep at 100%, so no slot of it is ever "new")
    if (!first)
        for (const s of here)
            if (hallOf(w, s.hall)?.apart)
                counted.add(s.id);
    if (counted.size !== c.counted.length)
        c.counted = [...counted];
    c.v = 1;
    const news = halls.length === 1 ? [`The museum has a new hall: ${halls[0]}.`] : halls.length ? [`The museum has new halls: ${halls.join(', ')}.`] : [];
    if (!filled.length)
        return news;
    // a hall of its own tells what fills in it under its own name, and only while it's open (its slots fill meanwhile)
    const out = [...news], tell = (name, list, begin) => {
        if (!list.length)
            return;
        if (begin)
            out.push(`${name} begin with ${list.length} things you've already done.`);
        else
            out.push(list.length <= 2 ? `${name}: ${list.map(s => s.name).join(', ')}.` : `${name}: ${list.length} new.`);
    };
    tell(recordName(w), filled.filter(s => !hallOf(w, s.hall)?.apart), first);
    for (const h of w.collection?.halls ?? [])
        if (h.apart && (!h.open || whenHolds(g, w, h.open)))
            tell(h.name, filled.filter(s => s.hall === h.id), false);
    return out;
}
// A storyline's plaque: the world's own for that ending, else the ending's words cut to their first sentence.
function plaqueOf(g, w, s, got) {
    // (museum) a display piece's own line, when no ending gives the plaque
    if (!got.how)
        return s.plaque ? s.plaque.replace(/\{\{user\}\}/g, personaName()) : undefined;
    if (s.plaques?.[got.how])
        return s.plaques[got.how].replace(/\{\{user\}\}/g, personaName());
    const t = storyOfSlot(s), e = t ? threadsOf(g, w).find(x => x.t.id === t)?.t.endings?.find(x => x.id === got.how) : undefined;
    const text = (e?.text ?? '').replace(/\{\{user\}\}/g, personaName()).trim();
    const one = text.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? text;
    return one.length > 160 ? `${one.slice(0, 157).trimEnd()}…` : one || undefined;
}
// A storyline's title is the player's once they know its secret or it has ended (as the person's "Their story" shows it).
function titleNow(g, w, s) {
    const id = storyOfSlot(s), st = id ? threadStates(g)[id] : undefined;
    if (!id || !st || (st.known === undefined && !st.ended))
        return undefined;
    const x = threadsOf(g, w).find(y => y.t.id === id);
    return x ? titleOf(x.t, x.r) : undefined;
}
// How far along a group slot is: a district's stories or places, a keepsake kind.
function countOf(g, w, s) {
    for (const c of parseWhen(s.when).conds) {
        if (c.not || c.values.length !== 1)
            continue;
        const v = c.values[0];
        if (c.key === 'seen') {
            const m = v.match(/^all\s+in\s+(\S+)$/i);
            if (m) {
                const p = storyPool(g, w, m[1]);
                return { have: p.seen.length, need: p.seen.length + p.open.length, ...(p.gone.length ? { gone: p.gone.length } : {}) };
            }
        }
        if (c.key === 'visited') {
            const m = v.match(/^all\s+in\s+(\S+)$/i);
            if (m) {
                const p = placesToVisit(g, w, m[1]);
                return { have: p.been, need: p.all };
            }
        }
        if (c.key === 'had') {
            const m = v.match(/^all\s+(.+)$/i);
            if (m) {
                const list = kindHere(g, w, m[1].trim()), had = new Set(collectionOf(g)?.had ?? []);
                return { have: list.filter(k => had.has(k.id)).length, need: list.length };
            }
        }
        if (c.key === 'goal' && v === 'all') {
            const n = goalCount(g, w);
            return { have: n.done, need: n.all };
        }
    }
    return undefined;
}
/** The halls this game has and that are open, with their tiles, for the Collection app. Settles nothing. (museum) In a
 *  world with a museum a display hall is shown once the museum has begun, and its `open` says it's on show, not
 *  whether it's shown. */
export function recordView(g, w) {
    if (!collectionOn(w))
        return [];
    const c = collectionOf(g), counted = new Set(c?.counted ?? []), here = slotsHere(g, w), begun = museumHooks.begun(g, w);
    const shown = (h) => (h.record || begun === null ? !h.open || whenHolds(g, w, h.open) : begun);
    return w.collection.halls.filter((h) => fits(g, w, h) && shown(h)).map(h => ({
        id: h.id, name: h.name, icon: h.icon, desc: h.desc, record: !!h.record, ...(h.apart ? { apart: true } : {}),
        ...(!h.record && begun !== null ? { show: museumHooks.hall(g, w, h.id) } : {}),
        groups: h.groups.map(gr => {
            const tiles = here.filter(s => s.hall === h.id && s.group === gr.id).map((s) => {
                const got = c?.got[s.id];
                return {
                    id: s.id, name: s.name, icon: s.icon, who: s.who, pic: s.pic, got,
                    plaque: got ? plaqueOf(g, w, s, got) : undefined, gold: !!got?.good, away: got?.by === 'nudges', title: titleNow(g, w, s),
                    fresh: !counted.has(s.id), hint: got ? '' : s.hint ?? (s.when ? missingWords(g, w, s.when, undefined, { more: true }).join('; ') : ''),
                    count: got ? undefined : countOf(g, w, s),
                    ...(!h.record && (s.sources?.length || begun !== null) ? { piece: museumHooks.tile(g, w, s.id) } : {}),
                };
            });
            return { id: gr.id, name: gr.name, icon: gr.icon, tiles, filled: tiles.filter(t => t.got).length };
        }).filter(gr => gr.tiles.length),
    })).filter(h => h.groups.length);
}
export function slotParts(g, w, id) {
    const s = collectionOn(w) ? slotsHere(g, w).find(x => x.id === id) : undefined;
    if (!s)
        return null;
    const out = {}, conds = parseWhen(s.when).conds.filter(c => !c.not);
    for (const c of conds) {
        if (c.values.length !== 1)
            continue;
        const v = c.values[0];
        const kind = c.key === 'had' ? v.match(/^all\s+(.+)$/i) : null;
        if (kind) {
            const had = new Set(collectionOf(g)?.had ?? []), hand = (g.player.keepsakes ?? {});
            out.keepsakes = kindHere(g, w, kind[1].trim()).map(k => ({ id: k.id, name: k.name, icon: k.icon, pic: k.pic, had: had.has(k.id) || (hand[k.id] ?? 0) > 0, holding: Math.max(0, hand[k.id] ?? 0) }));
        }
        const map = c.key === 'visited' || c.key === 'seen' ? v.match(/^all\s+in\s+(\S+)$/i) : null;
        if (map && c.key === 'visited')
            out.places = placesOnMap(g, w, map[1]);
        if (map && c.key === 'seen') {
            const p = storyPool(g, w, map[1]), by = new Map();
            for (const st of p.open)
                by.set(st.place, (by.get(st.place) ?? 0) + 1);
            out.stories = { seen: p.seen.length, gone: p.gone.length, open: [...by].map(([pl, n]) => ({ place: w.places.find(x => x.id === pl)?.name ?? pl, n })).sort((a, b) => b.n - a.n) };
        }
    }
    if (conds.length === 1)
        out.cond = { key: conds[0].key, values: conds[0].values };
    return out;
}
/** The app was opened: new marks are seen. */
export function markSeen(g) { const c = collectionOf(g); if (c)
    c.seen = g.day; }
onHour.push((g, w) => settleCollection(g, w));
onKeepsake.push((g, id) => {
    if (!collectionOn(getWorld(g.world)))
        return;
    const c = collectionState(g);
    if (!c.had.includes(id))
        c.had.push(id);
});
