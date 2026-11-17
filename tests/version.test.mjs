// The version in the code is the manifest's, the changelog starts with it, and versions compare as numbers.
// Run: node tests/version.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
// import() wants a URL: a bare Windows path (C:\…) reads as a URL scheme "c:" and fails
const V = await import(pathToFileURL(path.join(root, 'dist/core/version.js')).href);
const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
ok(V.VERSION === man.version, `VERSION (${V.VERSION}) is the manifest's (${man.version})`);
ok(V.CHANGELOG[0]?.v === V.VERSION, 'the changelog starts with this version');
ok(V.newer('0.2.0', '0.1.9') && V.newer('0.10.0', '0.9.0') && !V.newer('0.2.0', '0.2.0') && !V.newer('0.1.0', '0.2.0') && V.newer('1.0', '0.9.9'), 'versions compare as numbers');
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
