// Safety for files other people make: picture addresses and numbers from a world cannot break out of style="",
// slash-command text cannot carry an STscript {: … :} block. Run: node tests/security.test.mjs [repo root]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser } from './env.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'security');
browser({});
const S = await import(`${ext}/dist/core/safe.js`);
const W = await import(`${ext}/dist/core/world.js`);
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const quoteFree = (s) => !/["'()\\<>\s]/.test(s);

// picture addresses
ok(S.safeUrl('javascript:alert(1)') === '', 'no javascript:');
ok(S.safeUrl('data:text/html,<b>') === '', 'no data:text/html');
ok(S.safeUrl('vbscript:x') === '' && S.safeUrl('file:///etc/passwd') === '', 'no other schemes');
const d = S.safeUrl('data:image/png,x" onmouseover="alert(1)');
ok(d.startsWith('data:image/png,') && quoteFree(d), 'a data: picture cannot close the attribute');
ok(quoteFree(S.safeUrl("/user/files/a');background:url(//evil/x.jpg")), 'cannot close url(\'…\')');
ok(S.safeUrl('/user/files/kitchen.jpg') === '/user/files/kitchen.jpg', 'a normal path stays as it is');
ok(S.safeUrl('https://example.com/a b.jpg') === 'https://example.com/a%20b.jpg', 'spaces are encoded');
const w = { base: 'http://localhost:8000/' };
ok(quoteFree(W.worldFile(w, 'data:image/png,x" onerror="alert(1)')), 'worldFile is safe');
ok(W.worldFile(w, 'javascript:alert(1)') === '', 'worldFile drops javascript:');

// numbers and colors from a world
const data = S.cleanData({ maps: [{ ratio: '1.6" onmouseover="x' }], places: [{ x: '50;}', y: 20 }], homes: { zones: [{ spots: [['1"', 2]] }] }, plan: { glow: 'red;background:url(x)' }, apps: [{ color: '#a0b0c0' }] });
ok(data.maps[0].ratio === 0 && data.places[0].x === 0 && data.places[0].y === 20, 'numbers stay numbers');
ok(data.homes.zones[0].spots[0][0] === 0 && data.homes.zones[0].spots[0][1] === 2, 'home spots are numbers');
ok(!('glow' in data.plan) && data.apps[0].color === '#a0b0c0', 'only plain colors');
ok(S.cssColor('rgba(0, 0, 0, .5)') && S.cssColor('tomato') && !S.cssColor('red;x:y') && !S.cssColor('url(x)'), 'cssColor');

// slash commands
const t = S.scriptText('hi {: /run x :}() | /echo y');
ok(!t.includes('{:') && !t.includes(':}') && !t.includes('|'), 'no {: :} block and no pipe');
ok(S.scriptText('*smiles* "hello"') === '*smiles* "hello"', 'normal text unchanged');

console.log(`security: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
