// Permanent ids. Saves point to a world's things by id (a job, a place, a home area, a course…), so a released id
// may never disappear from a built-in world: rename it (change the name), never remove or re-id it.
// `node tests/ids.mjs` checks the worlds against ids.lock.json; `node tests/ids.mjs --update` adds new ids to it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const lockFile = path.join(here, 'ids.lock.json');
const ids = (w) => ({
    maps: w.maps.map(m => m.id), places: w.places.map(p => p.id), zones: w.homes.zones.map(z => z.id), homeKinds: Object.keys(w.homes.kinds), expenses: (w.homes.expenses ?? []).map(e => e.id),
    statuses: w.statuses.map(s => s.id), actions: w.actions.map(a => a.id), occupations: w.occupations.map(o => o.id),
    courses: (w.catalogs.courses ?? []).map(c => c.id), origins: (w.catalogs.origins ?? []).map(o => o.id),
    routines: Object.keys(w.cast.routineTemplates), people: w.cast.examples.map(e => e.name), apps: (w.features?.apps ?? []).map(a => a.id),
    ranks: Object.fromEntries(w.occupations.map(o => [o.id, o.ranks.length])),
});
const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : {};
const problems = [];
for (const id of fs.readdirSync(path.join(root, 'worlds'))) {
    const file = path.join(root, 'worlds', id, 'world.json'); if (!fs.existsSync(file)) continue;
    const now = ids(JSON.parse(fs.readFileSync(file, 'utf8')));
    const old = lock[id] ?? {};
    for (const [k, list] of Object.entries(old)) {
        if (k === 'ranks') { for (const [o, n] of Object.entries(list)) if ((now.ranks[o] ?? 0) < n) problems.push(`${id}: job "${o}" had ${n} ranks, now ${now.ranks[o] ?? 0}`); continue; }
        // a retired id names what took its place (world.retired), and the save repair moves saves over to it
        const retired = JSON.parse(fs.readFileSync(file, 'utf8')).retired?.[k] ?? {};
        for (const x of list) if (!now[k]?.includes(x) && !(retired[x] && now[k]?.includes(retired[x]))) problems.push(`${id}: ${k} "${x}" was removed`);
    }
    // the lock only grows
    const merged = {};
    for (const k of Object.keys(now)) merged[k] = k === 'ranks' ? { ...(old.ranks ?? {}), ...Object.fromEntries(Object.entries(now.ranks).map(([o, n]) => [o, Math.max(n, old.ranks?.[o] ?? 0)])) } : [...new Set([...(old[k] ?? []), ...now[k]])];
    lock[id] = merged;
}
if (problems.length) { console.log(`Ids removed from built-in worlds (saves point to them):\n  ${problems.join('\n  ')}`); process.exit(1); }
if (process.argv.includes('--update')) { fs.writeFileSync(lockFile, JSON.stringify(lock, null, 1) + '\n'); console.log('ids.lock.json updated'); }
else console.log('ids ok');
