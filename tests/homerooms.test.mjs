// Rooms at home: "my scene" goes through sceneHere (sim/homerooms.ts), which narrows the people at your place to the
// room you're in. A new `presentAt(g, w, g.player.loc)`, `presentAt(…, playerHomeId)` or `whereNow(…) === g.player.loc`
// anywhere else would see the whole house as the scene again: this check fails on one, unless its file is listed below
// with why. (presentAt for another place, the map's faces, the crowd, rumors' first hearers, stays as it is.)
// Run: node tests/homerooms.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const src = path.join(root, 'src');
// file (from src/) → why it may ask for everyone at your place
const ALLOWED = {
    'sim/homerooms.ts': 'where the scene is narrowed to your room',
};
const PATTERNS = [
    [/presentAt\((\w+), *\w+, *\1\.player\.loc\)/g, 'presentAt(…, g.player.loc)'],
    [/presentAt\([^()]*playerHomeId\)/g, 'presentAt(…, playerHomeId)'],
    [/whereNow\([^()]*\) *=== *\w+\.player\.loc/g, 'whereNow(…) === g.player.loc'],
];
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
walk(src);
let fails = 0, seen = 0;
for (const f of files) {
    const rel = path.relative(src, f).split(path.sep).join('/');
    if (ALLOWED[rel]) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const [re, what] of PATTERNS) for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split('\n').length;
        console.log(`  FAIL ${rel}:${line}: ${what} — use sceneHere(g, w) (or sceneAt / scenePlace from sim/homerooms.ts)`);
        fails++;
    }
    seen++;
}
console.log(`homerooms: ${seen} files checked, ${fails} failed`);
process.exit(fails ? 1 : 0);
