// The RPG mode is locked for the release: worlds made for it are locked, everything else plays as Life-Sim, its
// systems are off and it cannot be picked in the creator. Run: node tests/rpglock.test.mjs [repo root]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'rpglock');
browser({});
delete globalThis.__MUNDI_RPG;   // as in the real game
const W = await import(`${ext}/dist/core/world.js`);
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
ok(W.RPG_LOCKED === true, 'the RPG mode is locked');
const urban = world(ext, 'urban'), modern = world(ext, 'modern'), medieval = world(ext, 'medieval');
ok(W.worldLocked(urban), 'a world made for the RPG is locked');
ok(!W.worldLocked(modern) && !W.worldLocked(medieval), 'Life-Sim worlds are not');
const rpgWorld = { ...structuredClone(modern), id: 'x-rpg', mode: 'rpg', madeFor: 'lifesim' };
ok(W.worldLocked(rpgWorld), 'a world whose game mode is RPG is locked');
const both = { ...structuredClone(medieval), id: 'x-both', tags: ['lifesim', 'rpg', 'fantasy'] };
ok(!W.worldTags(both).includes('rpg') && W.allTags(both).includes('rpg'), 'the RPG tag is hidden (and kept in the world)');
ok(W.gameMode(both) === 'lifesim', 'it plays as Life-Sim');
ok(!W.systemOn({ ...both, features: { towers: true, contracts: true } }, 'towers'), 'RPG systems stay off even when turned on');
ok(W.GAME_MODES.find(m => m.id === 'rpg')?.soon === true, 'the RPG mode card says "next update"');
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
