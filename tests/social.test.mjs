// Life-Sim social (phase 4): career paths (ranks 3, 6, 9), a good word from someone high up, neighbors at your door,
// friends asking your advice, and the big moments of their lives. Run: node tests/social.test.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'social');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); await D('core/saves.js');
const time = await D('sim/time.js'); const work = await D('sim/work.js'); const HP = await D('sim/happenings.js');
const social = await D('sim/social.js');
await D('sim/prompt.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', f), 'utf8'));
const open = (s) => { for (const k of Object.keys(meta)) delete meta[k]; meta.mundi = s; return store.game(); };
seed(11);
const w = world(ext, 'modern'); W.registerWorld(w);
const med = world(ext, 'medieval'); W.registerWorld(med);

// career paths
{
    const dev = w.occupations.find(o => o.id === 'developer');
    let c = work.career(dev, []);
    ok(c.ranks.length === 3 && c.open && c.open.at === 3 && c.open.options.length === 2, 'a career opens a choice at rank 3');
    c = work.career(dev, ['dev_eng']);
    ok(c.ranks.length === 6 && c.open?.at === 6 && c.open.options.every(o => !o.after || o.after.includes('dev_eng')), 'after a path: its ranks, then the next choice (only what follows it)');
    c = work.career(dev, ['dev_eng', 'dev_arch', 'dev_cto']);
    ok(c.ranks.length === 10 && !c.open && c.ranks[9].name === 'Chief technology officer', 'ten ranks to the top');
    ok(work.career(dev, ['dev_eng', 'dev_growth']).ranks.length === 6, 'a path that does not follow is not taken');
    for (const wd of [w, med]) for (const o of wd.occupations.filter(o => o.branches)) {
        const all = []; const walk = (p) => { const k = work.career(o, p); if (!k.open) { all.push(k.ranks.length); return; } for (const x of k.open.options) walk([...p, x.id]); };
        walk([]); ok(all.every(n => n === 10), `${wd.id}/${o.id}: every way up has 10 ranks (${[...new Set(all)].join(',')})`);
    }
    const g = open(fixture('v0.1.0-modern.json'));
    g.player.job = { id: 'developer', rank: 2, shifts: 50 }; g.player.loc = 'downtown';
    ok(work.pendingBranch(g, dev) && work.shiftsToPromote(g, dev, 2) === null, 'at a choice: no promotion until you choose');
    const msgs = work.workShift(g, w, 'normal');
    ok(msgs.some(m => /choose your path/i.test(m)) && g.player.job.rank === 2, 'working tells you to choose');
    ok(/Engineering/.test(work.choosePath(g, w, 'dev_eng')) && !work.pendingBranch(g, dev), 'choosing a path');
    work.workShift(g, w, 'normal');
    ok(g.player.job.rank === 3 && work.rankOf(g, dev).name === 'Senior engineer', `promoted onto the path (${work.rankOf(g, dev).name})`);
    // a path the world no longer has: dropped when the save opens
    const s = fixture('v0.1.0-modern.json'); s.schema = 1; s.player.job = { id: 'developer', rank: 5, shifts: 0, path: ['dev_eng', 'gone'] };
    const g2 = open(s);
    ok(g2.player.job.path.join() === 'dev_eng' && g2.player.job.rank === 5, 'a lost path is dropped from there on, the rank kept');
}
// a good word from someone high up
{
    const g = open(fixture('v0.1.0-modern.json'));
    const r = Object.values(g.cast).find(x => x.occupation && x.occupation !== g.player.job?.id && w.occupations.find(o => o.id === x.occupation)?.ranks.length >= 3);
    r.met = true; social.social(g).bond[r.avatar] = 60;
    ok(!work.canRefer(g, w, r.avatar), 'someone at the bottom cannot recommend you');
    g.living ??= {}; g.living.ranks = { [r.avatar]: 2 };
    const o = work.canRefer(g, w, r.avatar);
    ok(!!o, 'someone at rank 3 who likes you can');
    let got = false;
    for (let d = 0; d < 20 && !got; d++) { g.day += 7; got = work.askReferral(g, w, r.avatar).ok; }
    ok(got && work.referralFor(g, o.id) === r.avatar, 'they agree (sooner or later)');
    const miss = (o.courses ?? []).length;
    if (!miss) { g.player.job = null; const h = work.hire(g, w, o.id); ok(h.ok && /good word/.test(h.text), 'and you are hired without the interview'); }
}
// neighbors
{
    const g = open(fixture('v0.1.0-modern.json'));
    const zone = g.player.home.zone;
    const two = Object.values(g.cast).filter(r => r.homeWith !== '__you').slice(0, 2);
    for (const r of two) r.home = { ...r.home, zone };
    ok(HP.neighbors(g).length >= 2 && HP.neighborsActive(g, w), 'two people in your area: neighbors come by');
    const z2 = w.homes.zones.find(z => z.id !== zone && z.spots.length);
    g.living ??= {}; g.living.homeKey = 'somewhere-else';   // you just moved in
    g.player.loc = 'home:player'; g.asleep = false; g.minutes = 10 * 60;
    time.advance(g, w, 60);
    ok(HP.currentHappening(g)?.kind === 'welcome', 'a neighbor welcomes you when you move in');
    const h = HP.currentHappening(g);
    ok(/comes in/.test(HP.answer(g, w, h.id, 'in')) && !HP.currentHappening(g), 'you invite them in');
    let kinds = new Set();
    for (let d = 0; d < 30; d++) { g.day++; for (let hh = 8; hh < 22; hh++) { g.minutes = hh * 60 + 59; time.advance(g, w, 1); const x = HP.currentHappening(g); if (x) { kinds.add(x.kind); HP.answer(g, w, x.id, x.choices[0][0]); } } }
    ok(kinds.size >= 2, `neighbors knock now and then (${[...kinds].join(', ')})`);
    for (const r of Object.values(g.cast)) if (r.home.zone === zone && r.homeWith !== '__you') r.home = { ...r.home, zone: z2.id };
    ok(!HP.neighborsActive(g, w), 'with nobody in your area, no neighbors');
}
// advice and life events
{
    const g = open(fixture('v0.1.0-modern.json'));
    const f = Object.values(g.cast)[0]; f.met = true; social.social(g).bond[f.avatar] = 70;
    // the AI (stubbed): writes her messages, and judges what your answer means
    let judged = '';
    globalThis.__ctx.generateRaw = async ({ prompt }) => (/Answer with one word: YES, NO or MAYBE/.test(prompt) ? (judged = prompt, /go for it|take it|yes/i.test((prompt.split('answered: "')[1] ?? '').split('"\n')[0]) ? 'YES' : 'MAYBE') : 'Hey, can I ask you something? I need your honest opinion on this.');
    let asked = null;
    for (let d = 0; d < 40 && !asked; d++) { time.advance(g, w, 1440); asked = g.living.asking ?? null; const x = HP.currentHappening(g); if (x) HP.answer(g, w, x.id, x.choices[0][0]); }
    ok(asked && asked.avatar === f.avatar && !asked.sent, 'a close friend wants your advice');
    // not while they are in the scene with you
    g.player.loc = 'park'; f.routine = { weekday: [[0, 'park']], weekend: [[0, 'park']] };
    const people = await D('sim/people.js');
    const inScene = (a) => people.presentAt(g, w, g.player.loc).some(r => r.avatar === a);
    ok(inScene(f.avatar) && await HP.deliverAsk(g, w, inScene) === '' && !g.living.asking.sent, 'no message while they are in the scene with you');
    f.routine = { weekday: [[0, 'home']], weekend: [[0, 'home']] }; g.player.loc = 'cafe';
    ok(await HP.deliverAsk(g, w, inScene) === f.name && HP.askingFrom(g, f.avatar), 'apart: the AI writes their message');
    ok(social.social(g).threads[f.avatar]?.at(-1)?.text.includes('honest opinion'), 'it is in your messages');
    await HP.answerAdvice(g, w, f.avatar, 'Yes, go for it, you deserve it!');
    ok(/answered: "Yes, go for it/.test(judged) && g.living.consults.length === 1 && g.living.consults[0].choice === 'yes' && !g.living.consults[0].alone, 'your written answer is judged as yes, and they follow it');
    ok(social.social(g).threads[f.avatar].slice(-2)[0].me && !HP.askingFrom(g, f.avatar), 'your answer and their reply are in the thread');
    const news = []; for (let d = 0; d < 4; d++) news.push(...time.advance(g, w, 1440));
    ok(news.some(m => /glad they listened|regrets following/.test(m)), 'days later, you hear how it went');
    // an answer that settles nothing: they decide on their own (no credit, no blame)
    g.living.asking = { avatar: f.avatar, d: 'study', x: 'study', ask: 'Should I go back to studying?', day: g.day, sent: true };
    await HP.answerAdvice(g, w, f.avatar, 'Hmm, I don\'t know, what do you think?');
    ok(g.living.consults.at(-1).alone === true, 'a maybe: they decide on their own');
    // a birthday
    let bd = g.day; while (!HP.isBirthday(g, f.avatar, bd)) bd++;
    g.social.happen = []; g.day = bd - 1; g.minutes = 23 * 60 + 50; time.advance(g, w, 20);
    ok((g.social.happen ?? []).some(x => x.kind === 'birthday' && x.avatar === f.avatar), 'a friend\'s birthday reaches you');
    // levels
    ok(HP.castLevel(3).level === 'too few' && HP.castLevel(8).level === 'pleasant' && HP.castLevel(15).level === 'lively' && HP.castLevel(10, 'rpg').level === 'works', 'how many cards each mode needs');
    const off = structuredClone(w); off.id = 'quiet'; off.features = { ...off.features, consults: false, neighbors: false }; W.registerWorld(off);
    const s = fixture('v0.1.0-modern.json'); s.world = 'quiet'; const g3 = open(s);
    const ff = Object.values(g3.cast)[0]; ff.met = true; social.social(g3).bond[ff.avatar] = 70;
    for (let d = 0; d < 20; d++) time.advance(g3, off, 1440);
    ok(!HP.currentHappening(g3), 'turned off: nothing comes to you');
}
// someone who lives with you always comes home with you, and walking the map costs no energy
{
    const plans = await D('sim/plans.js');
    const g = open(fixture('v0.1.0-modern.json'));
    const r = Object.values(g.cast)[0]; r.homeWith = '__you'; r.met = true; social.social(g).bond[r.avatar] = 0;
    ok(plans.askAlong(g, w, r.avatar).ok, 'someone you live with comes along, even if you are not close');
    ok(!plans.beforeTravel(g, w, 'home:player').length && social.isWith(g, r.avatar), 'and comes home with you');
    const e0 = g.player.stats.energy; g.traveling = true; time.advance(g, w, 180); delete g.traveling;
    ok(g.player.stats.energy === e0, 'the way there costs no energy');
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
