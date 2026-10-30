// Legends that travel and grow, talent trees with respec, schools with a ladder (RPG §7 and §10).
// Run: node tests/growth.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'growth');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); await D('core/saves.js');
const time = await D('sim/time.js'); const R = await D('sim/rpg.js'); const facts = await D('sim/facts.js'); const LG = await D('sim/legends.js');
const IN = await D('sim/institutions.js'); const C = await D('sim/combat.js'); const P = await D('sim/prompt.js'); const ST = await D('sim/standing.js');
const RUI = await D('ui/rpgui.js'); const LUI = await D('ui/lifeplus.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));
const open = (s) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = s; return store.game(); };
const fresh = (rpg, cls = 'fighter', file = 'v0.1.0-medieval.json') => { const s = fixture(file); s.schema = 1; s.cfg = { ...(s.cfg ?? {}), mode: rpg ? 'rpg' : 'lifesim' }; const g = open(s); if (rpg) { g.rpg = R.makeSheet(w, { cls }); R.syncLife(g, w); } return g; };
seed(14);
const w = world(ext, 'medieval'); W.registerWorld(w);
const modern = world(ext, 'modern'); W.registerWorld(modern);

// legends
{
    const g = fresh(); g.player.loc = 'tavern';
    facts.note(g, '{u} finished a quest: {0}.', ['Bandits on the road'], [], 'tavern', 'goal');
    time.advance(g, w, 1440);
    ok(LG.legendsOf(g).length === 1 && LG.legendsOf(g)[0].level === 0, 'a great deed becomes a legend');
    for (let i = 0; i < 25; i++) time.advance(g, w, 1440);
    const l = LG.legendsOf(g)[0];
    ok(l.regions.length > 1 && l.level >= 1, `it travels (${l.regions.length} towns) and grows (${LG.LEVELS[l.level]})`);
    const far = l.regions.find(r => r !== 'aurenfort');
    g.player.loc = w.places.find(p => p.map === far && !p.link).id;
    ok(LG.legendLines(g, w).some(x => x.includes('Bandits on the road')) && P.sceneText().includes('A tale told around here'), 'the AI tells it the way the town knows it');
    if (l.level >= 2 && !l.credit) { const before = ST.repIn(g, w, far); LG.legendWelcome(g, w); ok(ST.repIn(g, w, far) > before, 'your legend precedes you: reputation where it has grown'); }
    l.level = 3; l.credit = 'Elara';
    ok(LG.legendLines(g, w).some(x => x.includes('Elara')), 'told often enough, someone else gets the credit');
}
// talents
{
    const g = fresh(true, 'fighter');
    ok(R.talentTree(w, g.rpg).length >= 6 && R.talentTree(w, g.rpg).every(t => !t.cls || t.cls === 'fighter'), 'a talent tree for the class (and general talents)');
    ok(R.talentPoints(g.rpg) === 0, 'no points at level 1');
    R.addXp(g, w, 600, 'x');   // level 4
    ok(R.talentPoints(g.rpg) === 3, 'a point per level after the first');
    const hp = R.hpMax(w, g.rpg);
    ok(R.takeTalent(g, w, 'tough') === '' && R.hpMax(w, g.rpg) === hp + 6, 'Toughness: more hit points');
    ok(/before/.test(R.takeTalent(g, w, 'f_armor')), 'a talent needs the one before it');
    R.takeTalent(g, w, 'f_master'); R.takeTalent(g, w, 'f_armor');
    ok(R.talentPoints(g.rpg) === 0 && /No talent points/.test(R.canTake(w, g.rpg, 'keen')), 'points run out');
    ok(/level 7/.test(R.canTake(w, { ...g.rpg, talents: [] , level: 4 }, 'f_cleave')), 'higher tiers open with levels');
    const c = C.startCombat(g, w, { why: 'x', foes: ['wolf'] }); const me = c.list.find(f => f.id === 'you');
    ok(me.atk === R.prof(g.rpg.level) + R.mod(g.rpg.attrs.str) + 1 && me.ac === 17, `talents count in a fight (to hit ${me.atk}, armor ${me.ac})`);
    delete g.combat;
    ok(/reset/.test(R.respec(g, w)) && R.talentPoints(g.rpg) === 3 && R.hpMax(w, g.rpg) === hp, 'respec: every point back');
    ok(RUI.sheetApp(g, w, '').includes('Talents') && RUI.sheetApp(g, w, '').includes('3 points'), 'talents on the character sheet');
}
// schools (RPG)
{
    const g = fresh(true, 'mage'); g.player.money = 500; g.player.loc = 'arcanum';
    ok(LUI.schoolActs(g, w).includes('Enroll'), 'enroll at the school');
    ok(/Student/.test(IN.enroll(g, w, 'arcanum')) && g.player.money === 485, 'enrolling: the first week of tuition');
    const lesson = IN.attend(g, w, 'arcanum');
    ok(lesson.minutes === 120 && /already/.test(IN.attend(g, w, 'arcanum').text), 'a lesson a day');
    g.rpg.skills = g.rpg.skills.filter(s => s !== 'arcana');
    for (let i = 0; i < 5; i++) { g.day++; IN.attend(g, w, 'arcanum'); }
    ok(g.rpg.skills.includes('arcana'), 'after some lessons the school\'s skill is trained');
    let passed = 0, n = 0;
    while (IN.schoolOf(g).arcanum && IN.schoolOf(g).arcanum.rank < 1 && n++ < 30) { g.day += 7; IN.attend(g, w, 'arcanum'); const r = IN.sitExam(g, w, 'arcanum'); if (r.passed) passed++; }
    ok(!IN.schoolOf(g).arcanum || IN.schoolOf(g).arcanum.rank >= 1, `exams climb the ladder (${passed} passed)`);
    if (IN.schoolOf(g).arcanum) ok(P.sceneText().includes('Prefect') || P.sceneText().includes('ladder'), 'the AI knows the ladder and your rank');
}
// schools (Life-Sim) and expulsion
{
    const s = fixture('v0.1.0-modern.json'); s.schema = 1; const g = open(s); g.player.money = 1000; g.player.loc = 'campus';
    ok(/Freshman/.test(IN.enroll(g, modern, 'uni')), 'a university in the modern world');
    for (let i = 0; i < 6; i++) { g.day++; IN.attend(g, modern, 'uni'); }
    ok(Object.values(g.player.traits).flat().includes('Smart'), 'studying gives its trait');
    IN.joinClub(g, modern, 'uni', 'Chess club');
    ok(IN.clubMeeting(g, modern, 'uni').minutes === 60, 'a club meeting');
    Math.random = () => 0.999;
    g.day += 7; IN.sitExam(g, modern, 'uni'); g.day += 7; IN.attend(g, modern, 'uni'); const r = IN.sitExam(g, modern, 'uni');
    ok(/expelled/.test(r.text) && !IN.schoolOf(g).uni, 'two failures in a row: expelled');
    seed(15);
    IN.enroll(g, modern, 'uni'); g.player.money = 0;
    for (let i = 0; i < 8; i++) time.advance(g, modern, 1440);
    ok(!IN.schoolOf(g).uni, 'unpaid tuition: dropped');
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
