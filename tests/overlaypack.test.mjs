// Overlay packs (core/overlay.ts, core/zip.ts): a zip a player picks is untrusted, so what it can write into
// SillyTavern's user files is checked here, and a world whose overlay came in a pack finds its pictures without folders.
// Run: node tests/overlaypack.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { stage, browser } from './env.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'ovpack');
browser({});
const Z = await import(`${ext}/dist/core/zip.js`);
const O = await import(`${ext}/dist/core/overlay.js`);
const W = await import(`${ext}/dist/core/world.js`);
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const throws = (f, m) => { try { f(); ok(false, m); } catch { ok(true, m); } };
const rejects = async (p, m) => { try { await p; ok(false, m); } catch { ok(true, m); } };
const enc = new TextEncoder();
const file = (name, text) => ({ name, data: enc.encode(text) });
const zipOf = async (files) => new Uint8Array(await Z.makeZip(files).arrayBuffer());
const WORLDS = W.builtInIds();

// the zip reader: what the writer makes comes back the same
const files = [file('mundi-overlay-tokyo.json', '{"adult":true}'), file('priv/tokyo/bar.avif', 'AVIF'), file('priv/tokyo/emi/sprites/sprites.json', '["joy.avif"]')];
const back = await Z.readZip(await zipOf(files));
ok(back.length === 3 && back.every((f, i) => f.name === files[i].name && Buffer.from(f.data).equals(Buffer.from(files[i].data))), 'a zip comes back as it was written');

// a deflated entry (what most zip tools make), written by hand
function deflatedZip(name, text) {
    const data = Buffer.from(text), packed = zlib.deflateRawSync(data), n = Buffer.from(name), crc = Z.crc32(data);
    const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8); loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(packed.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(n.length, 28);
    const body = Buffer.concat([loc, n, packed]);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(body.length, 16);
    return { zip: new Uint8Array(Buffer.concat([body, cen, n, end])), loc };
}
const text = 'Tokyo at night '.repeat(200);
let deflateRaw = true; try { new DecompressionStream('deflate-raw'); } catch { deflateRaw = false; }
if (deflateRaw) {
    const d = deflatedZip('priv/a.json', text);
    const [one] = await Z.readZip(d.zip);
    ok(one?.name === 'priv/a.json' && new TextDecoder().decode(one.data) === text, 'a deflated file is read');
    const lying = deflatedZip('priv/a.json', text); lying.zip[22] = 10; lying.zip[23] = 0; lying.zip[24] = 0; lying.zip[25] = 0;   // local header only
    const bad = new Uint8Array(lying.zip); const cenAt = bad.length - 22 - 46 - 11; new DataView(bad.buffer).setUint32(cenAt + 24, 10, true);
    await rejects(Z.readZip(bad), 'a file bigger than it says is refused');
} else console.log('  (this Node has no deflate-raw DecompressionStream: deflated zips not checked)');
await rejects(Z.readZip(enc.encode('not a zip at all, just text')), 'not a zip: refused');
const corrupt = await zipOf([file('priv/x.json', '{"a":1}')]); corrupt[30 + 'priv/x.json'.length] ^= 0xff;
await rejects(Z.readZip(corrupt), 'a damaged file (wrong checksum) is refused');
await rejects(Z.readZip(await zipOf(files), { bytes: 10, files: 100 }), 'a zip that unpacks to too much is refused');
await rejects(Z.readZip(await zipOf(files), { bytes: 1e9, files: 2 }), 'a zip with too many files is refused');

// what a pack may write
const plan = O.packPlan(files, WORLDS);
ok(plan.overlays.length === 1 && plan.overlays[0].world === 'tokyo' && plan.overlays[0].name === 'mundi-overlay-tokyo.json', 'the overlay is found');
const ov = JSON.parse(plan.overlays[0].text);
ok(ov.flatFiles === true && ov.world === 'tokyo' && ov.adult === true, 'the overlay is marked flat, keeps its fields');
ok(plan.files.map(f => f.name).join() === 'priv__tokyo__bar.avif,priv__tokyo__emi__sprites__sprites.json', 'folders are joined into plain names');
ok(plan.files.every(f => /^[a-zA-Z0-9_\-.]+$/.test(f.name) && !f.name.startsWith('.')), 'every name is one SillyTavern accepts');
const wrapped = O.packPlan(files.map(f => ({ ...f, name: `My pack/${f.name}` })).concat([file('__MACOSX/._x', '')]), WORLDS);
ok(wrapped.overlays.length === 1 && wrapped.files[0].name === 'priv__tokyo__bar.avif', 'a pack zipped from outside its folder installs the same');
const odd = O.packPlan([...files, file('../evil/x.avif', ''), file('priv/../../x.avif', ''), file('priv/run.js', ''), file('priv/page.html', ''), file('loose.avif', ''), file('mundi-w_x.json', '{}'), file('priv/.hidden.avif', ''), file('priv/a b.avif', '')], WORLDS);
ok(odd.files.length === 2 && odd.skipped.length === 8, 'climbing out, scripts, pages, hidden or loose files are left out');
ok(!odd.files.some(f => /mundi-w_|\.\.|\.js$|\.html$/.test(f.name)), "nothing can replace a made world or run as a page");
throws(() => O.packPlan([file('mundi-overlay-nowhere.json', '{}')], WORLDS), 'an overlay for a world Mundi lacks is refused');
throws(() => O.packPlan([file('mundi-overlay-tokyo.json', '{"world":"house"}')], WORLDS), 'an overlay that names another world is refused');
throws(() => O.packPlan([file('mundi-overlay-tokyo.json', '{oops')], WORLDS), 'broken JSON is refused');
throws(() => O.packPlan([file('mundi-overlay-tokyo.json', '[1]')], WORLDS), 'JSON that is not an object is refused');
throws(() => O.packPlan([file('priv/a.avif', '')], WORLDS), 'a zip without an overlay is refused');
throws(() => O.packPlan([files[0], file('priv/a__b/c.avif', ''), file('priv/a/b__c.avif', '')], WORLDS), 'two files that would be saved as one are refused');
ok(JSON.parse(O.packPlan([file('mundi-overlay-tokyo.json', '﻿{"adult":true}')], WORLDS).overlays[0].text).adult === true, 'an overlay saved with a BOM reads');
ok(!('flatFiles' in O.applyOverlay({ id: 'x', format: 1 }, { flatFiles: true, lore: [] }).world), 'flatFiles is about the file, not world data');

// addresses: a pack's world reads its pictures without folders, other worlds as before
ok(O.flatUrl('/user/files/priv/tokyo/bar.avif') === '/user/files/priv__tokyo__bar.avif', 'a folder address is flattened');
ok(O.flatUrl('/user/files/bar.avif') === '/user/files/bar.avif' && O.flatUrl('people/mio.png') === 'people/mio.png', 'plain and relative addresses stay');
const overlay = { flatFiles: true, lore: [{ id: 'ov_test', text: 'x' }] };
globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/mundi-overlay-tokyo.json')) return { ok: true, json: async () => overlay };
    if (u.startsWith('file:') && u.endsWith('world.json')) return { ok: true, json: async () => JSON.parse(fs.readFileSync(fileURLToPath(u), 'utf8')) };
    return { ok: false, json: async () => null };
};
// worldFile only gives web addresses (safeUrl), so the worlds are read as if served
const served = (w) => ({ ...w, base: 'http://localhost:8000/scripts/extensions/third-party/Mundi/worlds/tokyo/' });
const tokyo = served(await W.loadWorld('tokyo'));
ok(W.worldFile(tokyo, '/user/files/priv/tokyo/emi/sprites/joy.avif') === 'http://localhost:8000/user/files/priv__tokyo__emi__sprites__joy.avif', "a pack's world finds its pictures");
ok(W.overlaysInUse().some(u => u.id === 'tokyo' && u.added === 1), 'the overlay in use is listed');
overlay.flatFiles = false; W.forgetWorld('tokyo');
const nested = served(await W.loadWorld('tokyo'));
ok(W.worldFile(nested, '/user/files/priv/tokyo/emi/sprites/joy.avif') === 'http://localhost:8000/user/files/priv/tokyo/emi/sprites/joy.avif', 'an overlay copied in by hand keeps its folders');
ok(W.worldFile({ id: 'house', base: 'http://localhost:8000/' }, '/user/files/a/b.png') === 'http://localhost:8000/user/files/a/b.png', "another world's addresses are untouched");

console.log(fails ? `overlay packs: ${fails} FAILED, ${passes} passed` : `overlay packs: all ${passes} passed`);
process.exit(fails ? 1 : 0);
