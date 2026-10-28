// Save safety. A player's save is hours of their life: no update may break it.
//
//  - `v: 1` marks a chat as a Mundi save and never changes (changing it would hide every existing save).
//  - `schema` is the save's format. Each update that changes the format adds a migration below; migrations run in
//    order, once, on saves older than SCHEMA, and must be safe to run again (idempotent).
//  - Before a save is changed by a migration or a repair, a copy is kept in the chat (`mundi_backups`, the last 3),
//    and can be restored from Settings → Game → This save.
//  - Links from the save to its world (job, rank, home, place, plans, course…) that the world no longer has are
//    repaired to something safe, with a notice, instead of breaking the game.
//  - A save made by a newer Mundi (schema above SCHEMA) is played as a detached copy and never written.
import { SAVE, toast } from './store.js';
import { ctx } from '../st/bridge.js';
import { getWorld, career } from './world.js';
import { relOf, idOf, setFr, setRo, setStatus, setCooldown, statusOf, hasMeter, setPast, pastOf, PARTNER, COUPLE_ROMANCE, YOU } from '../sim/rel.js';
import { isFamily } from './feel.js';
/** The save format this version of Mundi writes. Raise it together with a new migration. */
export const SCHEMA = 4;
// In order. `run` gets a save at schema `to - 1` and leaves it at `to`.
const MIGRATIONS = [
    // 1 (Mundi 0.1.x): the first versioned format. Saves from before only get the stamp; every system already fills
    // in what an older save lacks when it reads it.
    { to: 1, what: 'version stamp', run: () => { } },
    // 2 (relationships work): friendship, romance and couples move to one store (`rel`, sim/rel.ts).
    { to: 2, what: 'relationships in one store', run: g => toRelStore(g) },
    // 3 (family-only ties): ties are family only; couples, exes and the rest live in the relationships store.
    { to: 3, what: 'family ties only', run: g => familyTiesOnly(g) },
    // 4 (jobs and careers): a job keeps its rank and shifts, with a performance and the time in the rank; hobbies'
    // experience becomes the skills'.
    { to: 4, what: 'jobs with performance, hobbies as skills', run: g => jobsAndSkills(g) },
];
// Schema 2. Every value moves as it is: friendship toward you (`social.bond`) and romance (`romance[a]`) become the
// directions toward you, the status (and the partner list) the pair's; each "Play as" copy (`swap.persp`) holds how
// everyone felt about that person, so it fills the directions toward them; couples between characters
// (`living.pairs`, `pairInfo`) become pairs. Then directions with no value yet start from ties (seedFromOldTies
// below), except toward you and toward people whose view was stored. The old keys are removed at the end, so a
// second run finds nothing to move.
function toRelStore(g) {
    relOf(g);
    const STATUSES = ['dating', 'engaged', 'married'];
    const asStatus = (v) => (STATUSES.includes(String(v)) ? v : null);
    // a pair's status set by two copies: the current seat wins, then the copy with more romance
    const setBy = new Map();
    const pairKey = (a, b) => [idOf(g, a), idOf(g, b)].sort().join('|');
    const claim = (x, y, status, cooldown, rank) => {
        const k = pairKey(x, y);
        if (status && (!statusOf(g, x, y) || (setBy.get(k) ?? -1) < rank)) {
            setStatus(g, x, y, status, g.day);
            setBy.set(k, rank);
        }
        if (Number(cooldown) > 0 && !(g.rel.pairs[k]?.cooldown))
            setCooldown(g, x, y, Number(cooldown));
    };
    // 1. the person you play now
    const soc = g.social ?? {}, rom = g.romance ?? {};
    const partner = Array.isArray(soc.partner) ? soc.partner : [];
    for (const [a, v] of Object.entries(soc.bond ?? {}))
        setFr(g, a, YOU, Number(v) || 0);
    for (const [a, r] of Object.entries(rom))
        setRo(g, a, YOU, Number(r?.value) || 0);
    for (const a of new Set([...Object.keys(rom), ...partner])) {
        const r = rom[a];
        claim(a, YOU, asStatus(r?.status) ?? (partner.includes(a) ? 'dating' : null), r?.cooldown, Infinity);
    }
    // 2. everyone you played before: how others felt about them
    const sw = g.swap;
    const viewed = new Set();
    for (const [key, p] of Object.entries(sw?.persp ?? {})) {
        const who = key === '__orig' ? sw.origCard : key;
        if (!who || !g.cast[who])
            continue; // that person is gone
        viewed.add(idOf(g, who));
        const ps = p?.social ?? {}, pr = p?.romance ?? {};
        const pp = Array.isArray(ps.partner) ? ps.partner : [];
        for (const [x, v] of Object.entries(ps.bond ?? {}))
            setFr(g, x, who, Number(v) || 0);
        for (const [x, r] of Object.entries(pr))
            setRo(g, x, who, Number(r?.value) || 0);
        for (const x of new Set([...Object.keys(pr), ...pp])) {
            const r = pr[x];
            claim(x, who, asStatus(r?.status) ?? (pp.includes(x) ? 'dating' : null), r?.cooldown, Number(r?.value) || 0);
        }
    }
    // 3. couples between characters
    const liv = g.living ?? {};
    for (const pair of Array.isArray(liv.pairs) ? liv.pairs : []) {
        const [a, b] = pair ?? [];
        if (!a || !b || statusOf(g, a, b))
            continue;
        const info = liv.pairInfo?.[[a, b].sort().join('|')];
        setStatus(g, a, b, asStatus(info?.stage) ?? 'dating', Number(info?.since) || g.day);
    }
    // 4. starting values from ties where nothing is stored
    seedFromOldTies(g, Array.isArray(liv.ties) ? liv.ties : [], (_x, y) => viewed.has(y));
    // 5. the old keys
    for (const x of [soc, ...Object.values(sw?.persp ?? {}).map(p => p?.social)])
        if (x) {
            delete x.bond;
            delete x.today;
            delete x.partner;
        }
    delete g.romance;
    for (const p of Object.values(sw?.persp ?? {}))
        if (p)
            delete p.romance;
    delete liv.pairs;
    delete liv.pairInfo;
    if (g.cfg)
        delete g.cfg.bondCap;
    delete g.rel.day; // moving values isn't a change of the day (the recap would show them all)
}
// Schema 2's starting values from ties, as they were then (any relation type, a tone per direction), for directions
// with no value: friendship from the tone (or the type's usual one); couples by type or status at least on good terms,
// with romance. Never toward you. Kept here unchanged: a migration must do the same on every old save.
const OLD_TONE = { close: 75, good: 55, neutral: 30, tense: 0, hostile: -50 };
const OLD_USUAL = { bestfriend: 'close', friend: 'good', ally: 'good', colleague: 'neutral', dating: 'good', partner: 'close', spouse: 'close', parent: 'close', child: 'close', sibling: 'good', cousin: 'neutral', roommate: 'neutral', rival: 'tense', enemy: 'hostile', ex: 'tense', mentor: 'good', apprentice: 'good' };
const OLD_COUPLE = ['dating', 'partner', 'spouse'];
function seedFromOldTies(g, ties, skip) {
    const seed = (x, y, f, r) => {
        if (x === y || y === YOU || skip(x, y))
            return;
        if (!hasMeter(g, 'f', x, y))
            setFr(g, x, y, f);
        if (r !== undefined && !hasMeter(g, 'r', x, y))
            setRo(g, x, y, r);
    };
    const toneF = (t, couple) => Math.max(couple ? OLD_TONE.good : -100, OLD_TONE[t] ?? 30);
    for (const t of ties) {
        if (!t?.a || !t?.b)
            continue;
        const a = idOf(g, t.a), b = idOf(g, t.b);
        const couple = OLD_COUPLE.includes(t.type) || PARTNER.includes(statusOf(g, a, b));
        const tone = t.tone ?? OLD_USUAL[t.type] ?? 'neutral', back = t.back ?? tone;
        seed(a, b, toneF(tone, couple), couple ? COUPLE_ROMANCE : undefined);
        seed(b, a, toneF(back, couple), couple ? COUPLE_ROMANCE : undefined);
    }
    for (const [k, p] of Object.entries(g.rel.pairs)) {
        if (!p.status || !PARTNER.includes(p.status))
            continue;
        const [a, b] = k.split('|');
        seed(a, b, OLD_TONE.good, COUPLE_ROMANCE);
        seed(b, a, OLD_TONE.good, COUPLE_ROMANCE);
    }
}
// Schema 3. Ties keep only family (parent, child, sibling, cousin), without tones: feelings have been in the store
// since schema 2. A couple tie between two characters with no status (the built-in House world's married couple
// never got one) becomes that couple; with you it means the couple ended (new games always set the status, and a
// divorce left the tie behind), so they become exes, as does an `ex` tie. Everything else is dropped: friendships and
// rivalries are feelings, roommates share a home, apprentices have their own list. A second run finds only family.
const OLD_STATUS = { spouse: 'married', partner: 'dating', dating: 'dating' };
function familyTiesOnly(g) {
    const liv = g.living;
    if (!liv || !Array.isArray(liv.ties))
        return;
    relOf(g);
    const known = (id) => id === YOU || !!g.cast?.[id];
    const keep = [];
    for (const t of liv.ties) {
        if (!t?.a || !t?.b || t.a === t.b || !known(t.a) || !known(t.b))
            continue;
        if (isFamily(t.type)) {
            keep.push({ a: t.a, b: t.b, type: t.type });
            continue;
        }
        const st = OLD_STATUS[t.type], withYou = idOf(g, t.a) === YOU || idOf(g, t.b) === YOU;
        if (st && !statusOf(g, t.a, t.b) && !withYou && !pastOf(g, t.a, t.b))
            setStatus(g, t.a, t.b, st, g.day);
        else if (st && !statusOf(g, t.a, t.b) && withYou)
            setPast(g, t.a, t.b, { status: st, until: g.day });
        else if (t.type === 'ex' && !pastOf(g, t.a, t.b))
            setPast(g, t.a, t.b, { until: g.day });
    }
    liv.ties = keep;
}
// Schema 4. The player's job (and the jobs kept for "Play as") gets a performance in the middle (50), so a promotion
// first asks for some good shifts; the shifts toward the next rank stay as shifts in the rank, and the time in the
// rank counts from now, as do vacation days and the shifts already looked at (no absence is counted for the days
// before). Hobbies' experience (`player.hobbies`) moves to `player.skills`, the same numbers, so every level stays.
// A second run finds the fields set and no hobbies left.
function jobsAndSkills(g) {
    const day = Number(g.day) || 1, now = day * 1440 + (Number(g.minutes) || 0);
    const job = (j) => {
        if (!j || typeof j !== 'object')
            return;
        j.perf ??= 50;
        j.since ??= now;
        j.checked ??= day;
        j.vac ??= 0;
        j.vacAt ??= day;
        j.shifts = Number(j.shifts) || 0;
    };
    job(g.player?.job);
    for (const j of Object.values(g.swap?.jobs ?? {}))
        job(j);
    const p = g.player;
    if (p?.hobbies && typeof p.hobbies === 'object') {
        p.skills = p.skills && typeof p.skills === 'object' ? p.skills : {};
        for (const [k, v] of Object.entries(p.hobbies))
            p.skills[k] = Math.max(Number(p.skills[k]) || 0, Number(v) || 0);
        delete p.hobbies;
    }
}
export const schemaOf = (g) => Number(g.schema ?? 0);
const KEEP = 3;
export const backups = () => (Array.isArray(ctx().chatMetadata?.mundi_backups) ? ctx().chatMetadata.mundi_backups : []);
export function backup(g, reason) {
    const m = ctx().chatMetadata;
    if (!m)
        return;
    const list = backups().slice(-(KEEP - 1));
    list.push({ at: Date.now(), schema: schemaOf(g), reason, data: structuredClone(g) });
    m.mundi_backups = list;
}
// Puts a backup back as the save (the current state is backed up first, so this can be undone too).
export function restoreBackup(i) {
    const m = ctx().chatMetadata;
    const b = backups()[i];
    if (!m || !b || !m.mundi)
        return false;
    backup(m.mundi, 'before restoring a backup');
    m.mundi = structuredClone(b.data);
    ctx().saveMetadataDebounced();
    return true;
}
/* ---------- migrations ---------- */
// Brings a save to the current format. Returns what was done ('' if nothing).
export function migrate(g) {
    const from = schemaOf(g);
    if (from >= SCHEMA)
        return '';
    backup(g, `before the update (save format ${from} → ${SCHEMA})`);
    const done = [];
    for (const m of MIGRATIONS)
        if (m.to > from && m.to <= SCHEMA) {
            m.run(g);
            g.schema = m.to;
            done.push(m.what);
        }
    g.schema = SCHEMA;
    return done.join(', ');
}
/* ---------- links to the world ---------- */
const HOME = 'home:player';
const isPlace = (g, w, id) => id === HOME || (id.startsWith('home:') && !!g.cast[id.slice(5)]) || w.places.some(p => p.id === id && !p.link);
const firstSpot = (w, zoneId) => { const z = w.homes.zones.find(x => x.id === zoneId); const s = z?.spots?.[0]; return { x: s?.[0] ?? 0, y: s?.[1] ?? 0, n: 1 }; };
// Repairs what in the save points to things the world no longer has. Safe to run on every load.
export function repair(g, w) {
    const notes = [];
    const p = g.player;
    const zones = w.homes?.zones ?? [];
    // your home
    if (zones.length && !zones.some(z => z.id === p.home?.zone)) {
        const z = zones.find(x => x.kind === p.home?.kind) ?? zones[0];
        p.home = { ...(p.home ?? {}), zone: z.id, kind: z.kind, ...firstSpot(w, z.id) };
        notes.push(`Your old neighborhood is not in this world anymore: you now live in ${z.name}.`);
    }
    if (p.home && !w.homes.kinds[p.home.kind]) {
        const z = zones.find(x => x.id === p.home.zone);
        if (z)
            p.home.kind = z.kind;
    }
    // where you are
    if (p.loc && !isPlace(g, w, p.loc)) {
        p.loc = HOME;
        notes.push('The place you were in is not in this world anymore: you are back home.');
    }
    // your job and rank
    if (p.job) {
        const o = w.occupations.find(x => x.id === p.job.id);
        if (!o) {
            notes.push(`Your job (${p.job.id}) is not in this world anymore: you are free to look for a new one.`);
            p.job = null;
        }
        else if (!o.ranks?.length)
            p.job = null;
        else {
            // the career as it is now (a path the world no longer has is dropped, from there on)
            const keep = [];
            for (const id of p.job.path ?? []) {
                const c = career(o, keep);
                if (c.open?.options.some(x => x.id === id))
                    keep.push(id);
                else
                    break;
            }
            if ((p.job.path ?? []).length !== keep.length) {
                p.job.path = keep;
                notes.push(`A career path at ${o.name} is not in this world anymore: choose again when you get there.`);
            }
            const ranks = career(o, keep).ranks;
            if (p.job.rank >= ranks.length || p.job.rank < 0) {
                p.job.rank = Math.max(0, Math.min(p.job.rank, ranks.length - 1));
                notes.push(`Your rank at ${o.name} changed: you are now ${ranks[p.job.rank].name}.`);
            }
        }
    }
    // needs the world added since the save was made start at their usual value
    p.stats ??= {};
    for (const s of w.statuses ?? [])
        if (typeof p.stats[s.id] !== 'number')
            p.stats[s.id] = s.start;
    // the course you are taking
    const l = p.learning;
    const courses = (w.catalogs.courses ?? []);
    if (l?.current && !courses.some(c => c.id === l.current)) {
        l.current = '';
        notes.push('The course you were taking is not offered anymore.');
    }
    // the people
    for (const r of Object.values(g.cast)) {
        if (r.occupation && !w.occupations.some(o => o.id === r.occupation))
            r.occupation = null;
        if (zones.length && !zones.some(z => z.id === r.home?.zone))
            r.home = { zone: zones[0].id, ...firstSpot(w, zones[0].id) };
        if (Array.isArray(r.leisure))
            r.leisure = r.leisure.filter(id => isPlace(g, w, id));
    }
    // maps the world retired: what saves kept per region moves to the map that took its place
    for (const [from, to] of Object.entries(w.retired?.maps ?? {})) {
        if (w.maps.some(m => m.id === from) || !w.maps.some(m => m.id === to))
            continue;
        for (const key of ['regions', 'bounty', 'rep']) {
            const box = g[key];
            if (box && box[from] !== undefined) {
                if (box[to] === undefined)
                    box[to] = box[from];
                delete box[from];
            }
        }
    }
    // homes whose spot moved (the world's map of homes was redrawn): each old address moves to the home with its
    // number, or the next free one; people who shared an address keep sharing it
    {
        const all = [p.home, ...Object.values(g.cast).map(r => r.home)].filter(Boolean);
        const onSpot = (h) => !!zones.find(z => z.id === h.zone)?.spots.some(s => s[0] === h.x && s[1] === h.y);
        const used = new Set(all.filter(onSpot).map(h => `${h.zone}:${h.x},${h.y}`));
        const moved = new Map();
        for (const h of all) {
            if (onSpot(h))
                continue;
            const z = zones.find(x => x.id === h.zone);
            if (!z?.spots.length)
                continue;
            const key = `${h.zone}:${h.x},${h.y}`;
            if (!moved.has(key)) {
                const free = (i) => !used.has(`${z.id}:${z.spots[i][0]},${z.spots[i][1]}`);
                let i = (h.n ?? 1) - 1;
                if (i < 0 || i >= z.spots.length || !free(i))
                    i = z.spots.findIndex((_s, k) => free(k));
                if (i < 0)
                    i = Math.max(0, Math.min(z.spots.length - 1, (h.n ?? 1) - 1));
                used.add(`${z.id}:${z.spots[i][0]},${z.spots[i][1]}`);
                moved.set(key, [z.spots[i][0], z.spots[i][1], i + 1]);
            }
            const [x, y, n] = moved.get(key);
            h.x = x;
            h.y = y;
            h.n = n;
        }
        if (moved.size)
            notes.push('The map of homes was redrawn: everyone keeps their home, at its new place on the map.');
    }
    // plans at places that are gone are called off
    const appts = g.social?.appts;
    for (const a of appts ?? [])
        if ((a.state === 'set' || a.state === 'met') && !isPlace(g, w, a.place)) {
            a.state = 'cancelled';
            notes.push('A plan at a place that is gone was called off.');
        }
    return notes;
}
/* ---------- the check when a save is opened ---------- */
const later = (f) => setTimeout(f, 300);
export function checkSave(g) {
    // made by a newer Mundi: play a copy, never write
    if (schemaOf(g) > SCHEMA) {
        SAVE.readOnly = true;
        SAVE.shadow.set(g, structuredClone(g));
        later(() => toast(`This save was made with a newer version of Mundi (save format ${schemaOf(g)}; this version knows up to ${SCHEMA}). It opens read-only: nothing you do now is saved. Update Mundi to keep playing it.`, 'warn'));
        return;
    }
    let changed = false;
    const did = migrate(g);
    if (did)
        changed = true;
    const w = getWorld(g.world);
    if (w) {
        const probe = structuredClone(g);
        const notes = repair(probe, w); // first on a copy: back up only if something will change
        if (JSON.stringify(probe) !== JSON.stringify(g)) {
            if (!did)
                backup(g, 'before repairing links to the world');
            repair(g, w);
            changed = true;
            if (notes.length)
                later(() => toast(`This world changed since your last visit. ${notes.join(' ')} A backup of the save was kept (Settings → Game → This save).`, 'info'));
        }
    }
    if (changed)
        ctx().saveMetadataDebounced();
}
SAVE.hooks.push(checkSave);
