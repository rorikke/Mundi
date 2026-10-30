// Test environment: runs Mundi's compiled engine in Node. SillyTavern's modules are replaced by empty stubs and the
// browser by a few globals; `stage(root)` copies a build (dist + worlds) into a fake SillyTavern tree.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function stage(root, tag = 'cur') {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), `mundi-${tag}-`));
    process.on('exit', () => fs.rmSync(base, { recursive: true, force: true }));
    const scripts = path.join(base, 'public', 'scripts');
    const ext = path.join(scripts, 'extensions', 'third-party', 'Mundi');
    fs.mkdirSync(ext, { recursive: true });
    for (const d of ['dist', 'worlds']) fs.cpSync(path.join(root, d), path.join(ext, d), { recursive: true });
    // every SillyTavern module the build imports gets a stub with the same names
    const mods = new Map();
    const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) scan(fs.readFileSync(p, 'utf8')); } };
    const scan = (src) => {
        for (const m of src.matchAll(/^import \{([^}]+)\} from '((?:\.\.\/){5,})([a-z-]+)\.js'/gm)) {
            const file = m[2].split('../').length - 1 === 6 ? path.join(base, 'public', `${m[3]}.js`) : path.join(scripts, `${m[3]}.js`);
            const set = mods.get(file) ?? new Set();
            for (const n of m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) set.add(n);
            mods.set(file, set);
        }
    };
    walk(path.join(ext, 'dist'));
    const VALUES = { getContext: '() => globalThis.__ctx', groups: '[]', world_names: '[]', tags: '[]', tag_map: '{}', power_user: '{}', world_info: '{}' };
    for (const [file, names] of mods) fs.writeFileSync(file, [...names].map(n => n in VALUES ? `export const ${n} = ${VALUES[n]};` : /^(selected_|user_avatar|METADATA_KEY)/.test(n) ? `export let ${n} = '';` : `export const ${n} = (...a) => undefined;`).join('\n') + '\n');
    return ext;
}

// A fresh SillyTavern context and browser globals; `meta` is the open chat's metadata (where the save lives).
globalThis.__MUNDI_RPG = true;
globalThis.__MUNDI_MEDIEVAL = true;   // the medieval style too (MEDIEVAL_LOCKED)   // the RPG mode is locked for the release (core/world.ts RPG_LOCKED); its tests still run
export function browser(meta = {}) {
    const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, remove() {} });
    globalThis.window = globalThis; globalThis.requestAnimationFrame = () => 0;
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, addEventListener() {}, documentElement: el(), body: el(), head: el() };
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    globalThis.location = { href: 'http://localhost:8000/' };
    globalThis.$ = globalThis.jQuery = () => ({ on() { return this; }, off() { return this; }, val() {}, trigger() {}, length: 0 });
    let saves = 0;
    globalThis.__ctx = { extensionSettings: {}, chatMetadata: meta, chat: [], characters: [], groups: [], name1: 'Tester',
        saveSettingsDebounced() {}, saveMetadataDebounced() { saves++; }, saveMetadata: async () => { saves++; },
        eventSource: { on() {}, emit() {} }, eventTypes: {}, event_types: {}, executeSlashCommandsWithOptions: async () => ({ pipe: '' }) };
    return { get writes() { return saves; } };
}

// A seeded Math.random, so a run is the same every time.
export function seed(n = 1) { let s = n >>> 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const world = (ext, id) => { const w = JSON.parse(fs.readFileSync(path.join(ext, 'worlds', id, 'world.json'), 'utf8')); w.base = `file://${path.join(ext, 'worlds', id)}/`; w.i18n = {}; return w; };
