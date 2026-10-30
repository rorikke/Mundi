// The prompt's texts are editable: a block's own text ({text} = what Mundi wrote), the scene's rules and your own
// instructions. Untouched, the prompt is exactly Mundi's. Run: node tests/prompt.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'prompt');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); const P = await D('sim/prompt.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };

seed(2);
const w = world(ext, 'modern'); W.registerWorld(w);
const g0 = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'v0.1.0-modern.json'), 'utf8'));
meta.mundi = g0; const g = store.game();
const pc = P.promptCfg();
const plain = P.sceneText();
ok(plain.includes(P.DEFAULT_RULES), 'Mundi\'s rules are sent');
ok(!P.sceneBlocks().find(b => b.id === 'extra' && b.state === 'sent'), 'no own instructions until you write some');
// a block with something to say: make a need low
const low = w.statuses.find(s => s.id === 'hunger'); g.player.stats[low.id] = 5;
const mundi = P.sceneBlocks().find(b => b.id === 'needs').text;
ok(mundi.length > 0, 'the needs block has text');
pc.text.needs = '[Body] {text} (play it subtly)';
ok(P.sceneText().includes(`[Body] ${mundi} (play it subtly)`), 'your words go around {text}');
pc.text.needs = '{{user}} is starving.';
ok(P.sceneBlocks().find(b => b.id === 'needs').text === '{{user}} is starving.', 'without {text} your words replace it');
g.player.stats[low.id] = 100; for (const s of w.statuses) g.player.stats[s.id] = s.max;
ok(P.sceneBlocks().find(b => b.id === 'needs').state === 'empty', 'and are not sent when the block has nothing to say');
pc.text.needs = '   ';
ok(P.applyTemplate(pc.text.needs, 'x') === 'x', 'a blank text is Mundi\'s');
pc.rules = 'Stay in the room. Keep it short.';
ok(P.sceneText().includes('Stay in the room. Keep it short.') && !P.sceneText().includes(P.DEFAULT_RULES), 'your rules replace Mundi\'s');
ok(P.sceneText().trim().split('\n').some(l => l === 'Stay in the room. Keep it short.') && P.sceneText().indexOf('Stay in the room') > P.sceneText().indexOf('[World state'), 'rules stay after the scene basics');
pc.extra = 'Replies under 150 words.';
const t = P.sceneText();
ok(t.includes('Replies under 150 words.') && t.indexOf('Replies under 150 words.') < t.indexOf('Stay in the room'), 'your instructions are sent, before the rules');
pc.budget = 1; ok(P.sceneText().includes('Replies under 150 words.'), 'your instructions are never dropped by the budget');
// back to Mundi's: identical to the start
pc.budget = 0; pc.rules = ''; pc.extra = ''; pc.text = {};
for (const s of w.statuses) g.player.stats[s.id] = g0.player.stats[s.id];
meta.mundi = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'v0.1.0-modern.json'), 'utf8')); store.game();
ok(P.sceneText() === plain, 'untouched, the prompt is exactly Mundi\'s');
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
