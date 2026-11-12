// A world's own place sounds: every filled `sounds` slot names a tag its places use, points to a file that is in the
// world's folder, and has a line in that folder's CREDITS.md (who made it, its license). Run: node tests/sounds.test.mjs
// [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const LICENSES = /creativecommons\.org\/(publicdomain\/zero|licenses\/by\/)/;

for (const id of fs.readdirSync(path.join(root, 'worlds'))) {
    const dir = path.join(root, 'worlds', id), file = path.join(dir, 'world.json');
    if (!fs.existsSync(file)) continue;
    const w = JSON.parse(fs.readFileSync(file, 'utf8'));
    const filled = Object.entries(w.sounds ?? {}).filter(([, f]) => typeof f === 'string' && f.trim());
    if (!filled.length) continue;
    const used = new Set((w.places ?? []).flatMap(p => p.sound ?? []));
    const credits = path.join(dir, 'sound', 'CREDITS.md');
    const lines = fs.existsSync(credits) ? fs.readFileSync(credits, 'utf8').split('\n') : [];
    ok(lines.length > 0, `${id}: sound/CREDITS.md exists`);
    for (const [tag, f] of filled) {
        const p = path.join(dir, f.trim());
        ok(used.has(tag), `${id}: the slot "${tag}" is a tag its places use`);
        ok(!f.includes('..') && !path.isAbsolute(f) && /^sound\/[a-z0-9-]+\.(mp3|ogg)$/.test(f.trim()), `${id}: "${f}" is a file in sound/`);
        ok(fs.existsSync(p), `${id}: ${f} exists`);
        if (fs.existsSync(p)) ok(fs.statSync(p).size < 1.5e6, `${id}: ${f} is under 1.5 MB`);
        const line = lines.find(l => l.startsWith(`| \`${path.basename(f)}\` |`));
        ok(!!line, `${id}: ${f} has a line in CREDITS.md`);
        if (line) ok(LICENSES.test(line), `${id}: ${f}'s credit links a CC0 or CC-BY license`);
    }
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
