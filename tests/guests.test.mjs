// Home guests: a visit (arrives ~1 h later, stays at home, sleeps on the sofa or in a shared bedroom, leaves when you
// say goodbye), party guests from outside (come at the start, go home at the end, or stay on as visitors), a party out
// of the house, what the AI is told. Run: node tests/guests.test.mjs [repo root]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stage, browser, seed, world } from './env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? path.join(here, '..');
const ext = stage(root, 'guests');
const meta = {}; browser(meta);
const D = (p) => import(`${ext}/dist/${p}`);
const store = await D('core/store.js'); const W = await D('core/world.js'); await D('core/saves.js');
const time = await D('sim/time.js'); const people = await D('sim/people.js'); const gm = await D('sim/game.js');
const G = await D('sim/guests.js'); const HP = await D('sim/houseparty.js'); const homes = await D('sim/homes.js'); const facts = await D('sim/facts.js');
await D('sim/prompt.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL', m); } };
seed(7);
const w = world(ext, 'house'); W.registerWorld(w);
ok(W.isScenario(w), 'the house world is a Home');
const chars = ['hana', 'boruto', 'vis1', 'vis2', 'par1', 'par2', 'par3'].map(n => ({ avatar: `${n}.png`, name: n[0].toUpperCase() + n.slice(1), data: {} }));
globalThis.__ctx.characters = chars;
const zone = w.homes.zones[0];
const save = { v: 1, world: 'house', lang: 'en', day: 3, minutes: 9 * 60, speed: 0, player: { loc: 'home:player', home: { zone: zone.id, kind: zone.kind, x: zone.spots[0][0], y: zone.spots[0][1] }, stats: {}, money: 100, traits: {}, origin: '', job: null, rentPaidDay: 3 }, cast: {}, cfg: { rooms: w.places.map(p => p.id) } };
meta.mundi = save; const g = store.game();
for (const a of ['hana.png', 'boruto.png']) { const r = gm.resident(w, a, homes.takenHomes(g), g.player.home); r.met = true; g.cast[a] = r; }
homes.normalizeHomes(g);
const at = (r) => people.whereNow(g, w, r);
const to = (h) => { const now = g.day * 1440 + g.minutes; let t = Math.floor(now / 1440) * 1440 + h * 60; if (t <= now) t += 1440; return time.advance(g, w, t - now); };

// a visit, on the sofa
{
    ok(G.inviteVisit(g, w, ['vis1.png'], { kind: 'sofa' }) === 1, 'a visit is invited');
    ok(G.inviteVisit(g, w, ['vis1.png', 'hana.png'], { kind: 'sofa' }) === 0, 'nobody twice, and no housemate');
    ok(!g.cast['vis1.png'] && G.pendingVisits(g).length === 1, 'on the way, not here yet');
    time.advance(g, w, 30);
    ok(!g.cast['vis1.png'], 'not before about an hour');
    const msgs = time.advance(g, w, 45);
    const v = g.cast['vis1.png'];
    ok(!!v && G.guestOf(g, 'vis1.png')?.kind === 'visit', 'arrives about an hour later');
    ok(G.doorbell(g).includes('vis1.png') && !msgs.some(m => /Vis1 arrived/.test(m)), 'you are home: they ring the doorbell (no plain note)');
    ok(!G.pendingVisits(g).length, 'no longer on the way');
    ok(v.met === true, 'you know each other');
    ok(!G.housemates(g).some(r => r.avatar === 'vis1.png'), 'a guest is not a housemate');
    const rooms = HP.partyRooms(g, w);
    for (const h of [10, 13, 16, 19, 22]) { to(h); ok(rooms.includes(at(v)), `by day (${h}:00) in a common room (${at(v)})`); }
    to(2); ok(at(v) === 'home:vis1.png', `at night in a free bedroom of their own, never the sofa (${at(v)})`);
    to(9);
    g.social = g.social ?? {}; g.social.bond = { ...(g.social.bond ?? {}), 'vis1.png': 42 };
    const n = G.sendHome(g, 'vis1.png');
    ok(n === 'Vis1' && !g.cast['vis1.png'], 'saying goodbye: they go home');
    ok(g.social.bond['vis1.png'] === 42, 'the bond stays after they leave');
    ok(facts.facts(g).some(f => f.who.includes('vis1.png') && /said goodbye/.test(f.t)), 'the visit is remembered');
    ok(facts.facts(g).some(f => f.who.includes('vis1.png') && /arrived to stay/.test(f.t)), 'the arrival is remembered');
}
// a visit sharing a bedroom
{
    G.inviteVisit(g, w, ['vis2.png'], { kind: 'share', host: 'hana.png' });
    time.advance(g, w, 300);
    const v = g.cast['vis2.png']; ok(!!v, 'the second visitor arrives');
    to(3);
    const hana = g.cast['hana.png'];
    const bed = homes.homeKey(hana.home) === homes.homeKey(g.player.home) ? 'home:player' : (hana.homeWith ? `home:${hana.homeWith}` : 'home:hana.png');
    ok(at(v) === bed, `at night in Hana's bedroom (${at(v)} / ${bed})`);
    G.inviteVisit(g, w, ['vis1.png'], { kind: 'share', host: '__you' }); time.advance(g, w, 300); to(3);
    ok(at(g.cast['vis1.png']) === 'home:player', `sharing your bedroom: in your room at night (${at(g.cast['vis1.png'])})`);
    G.sendHome(g, 'vis1.png'); G.sendHome(g, 'vis2.png');
}
// a party with guests from outside
{
    to(17);
    const from = g.day * 1440 + 20 * 60;
    ok(HP.throwHouseParty(g, w, from, 'Pool night', { guests: ['par1.png', 'par2.png', 'hana.png'] }) === '', 'a party with guests from outside');
    ok(JSON.stringify(HP.houseParty(g).guests) === JSON.stringify(['par1.png', 'par2.png']), 'housemates are not guests from outside');
    ok(!g.cast['par1.png'], 'guests are not here before it starts');
    { const AP = await D('ui/appts.js');
      ok(AP.partyConflict(g, 14 * 60), 'sleeping now would run over the party: asked first');
      ok(!AP.partyConflict(g, 60), 'an hour of something: no question');
      ok(AP.askAboutPlans(g, 14 * 60, 'sleep'), 'the question opens');
      globalThis.__conflict = AP.conflictHtml(g, w); }
    ok(/Pool night/.test(globalThis.__conflict) && /The party starts at 20:00, at home/.test(globalThis.__conflict) && /You would sleep through it/.test(globalThis.__conflict) && /cf-party/.test(globalThis.__conflict), 'it names the party and offers to wait for it');
    ok(/Guests from outside the house: Par1, Par2/.test(HP.partyLine(g, w)), 'the AI knows who is coming');
    to(20);
    ok(G.guestOf(g, 'par1.png')?.kind === 'party' && G.guestOf(g, 'par2.png')?.kind === 'party', 'they arrive when it starts');
    { const PL = await D('sim/places.js'); ok(!PL.pins(g, w).some(p => p.id === 'home:par1.png'), 'a guest without a bedroom has no room (nothing off the plan)'); }
    const rooms = HP.partyRooms(g, w);
    ok(rooms.includes(at(g.cast['par1.png'])) && rooms.includes(at(g.cast['hana.png'])), 'guests and housemates in the party rooms');
    G.partyGuest(g, w, 'par3.png', true);
    ok(G.guestOf(g, 'par3.png')?.kind === 'party' && HP.houseParty(g).guests.includes('par3.png'), 'added during the party: they arrive at once');
    G.partyGuest(g, w, 'par3.png', false);
    ok(!g.cast['par3.png'] && !HP.houseParty(g).guests.includes('par3.png'), 'taken off during the party: they go home');
    ok(G.stayAfterParty(g, 'par2.png') && G.guestOf(g, 'par2.png').kind === 'visit', 'asked to stay on: now a visitor');
    const msgs = to(1);
    ok(!g.cast['par1.png'], 'the party guest goes home when it ends');
    ok(msgs.some(m => /Par1 went home after the party/.test(m)), 'a note says they went home');
    ok(!!g.cast['par2.png'] && at(g.cast['par2.png']) === 'home:par2.png', `the one who stayed is still here, in a bedroom at night (${at(g.cast['par2.png'])})`);
    ok(facts.facts(g).some(f => f.who.includes('par1.png') && /after .*party/.test(f.t)), 'the party is remembered');
    G.sendHome(g, 'par2.png');
}
// a party out of the house
{
    to(17);
    const from = g.day * 1440 + 21 * 60;
    HP.throwHouseParty(g, w, from, '', { guests: ['par3.png'], out: { place: 'the beach', bg: 'beach.jpg', people: ['hana.png'] } });
    G.partyGuest(g, w, 'par1.png', true); G.partyPerson(g, 'boruto.png'); G.partyPerson(g, 'boruto.png');
    ok(HP.houseParty(g).guests.includes('par1.png') && !g.cast['par1.png'], 'before it starts: a guest added to the list, not here yet');
    ok(!HP.houseParty(g).out.people.includes('boruto.png'), 'someone of the house added and taken off again');
    G.partyGuest(g, w, 'par1.png', false);
    to(22);
    ok(at(g.cast['hana.png']) === 'out' && at(g.cast['par3.png']) === 'out', 'out of the house: who goes is out there');
    ok(at(g.cast['boruto.png']) !== 'out' || people.routineAt(g, w, g.cast['boruto.png'], g.day * 1440 + g.minutes) === 'out', 'who was not invited keeps their day');
    ok(/going on out of the house, at the beach/.test(HP.partyLine(g, w)), 'the AI knows where the party is');
    to(2);
    ok(!g.cast['par3.png'], 'the guest goes home after the party out');
    ok(at(g.cast['hana.png']) !== 'out' || people.routineAt(g, w, g.cast['hana.png'], g.day * 1440 + g.minutes) === 'out', 'the housemate is back to their day');
}
// choosing the bed after the invitation (on the way, and once here)
{
    to(10);
    G.inviteVisit(g, w, ['vis2.png']);
    ok(G.pendingVisits(g).find(v => v.avatar === 'vis2.png')?.sleep.kind === 'room', 'invited without choosing: a free bedroom');
    G.setSleep(g, 'vis2.png', { kind: 'share', host: '__you' });
    ok(G.pendingVisits(g).find(v => v.avatar === 'vis2.png')?.sleep.kind === 'share', 'the bed is chosen while they are on the way');
    time.advance(g, w, 300); to(3);
    ok(at(g.cast['vis2.png']) === 'home:player', `they arrive and sleep where chosen (${at(g.cast['vis2.png'])})`);
    G.setSleep(g, 'vis2.png', { kind: 'share', host: 'boruto.png' }); to(3);
    const b = g.cast['boruto.png']; const bed = homes.homeKey(b.home) === homes.homeKey(g.player.home) ? 'home:player' : (b.homeWith ? `home:${b.homeWith}` : 'home:boruto.png');
    ok(at(g.cast['vis2.png']) === bed, `moved to Boruto's bedroom (${at(g.cast['vis2.png'])} / ${bed})`);
    const fr = G.freeRooms(g, w, 'vis2.png')[0]; G.setSleep(g, 'vis2.png', { kind: 'room', spot: fr.spot }); to(3);
    ok(at(g.cast['vis2.png']) === 'home:vis2.png', 'and to a free bedroom');
    g.cast['vis2.png'].guest.sleep = { kind: 'sofa' }; G.guestTick(g, w);
    ok(G.guestOf(g, 'vis2.png').sleep.kind !== 'sofa', 'an old save with a visitor on the sofa: they get a bedroom');
    ok(!G.housemates(g).some(r => r.avatar === 'vis2.png') && g.cast['boruto.png'].homeWith !== 'vis2.png', 'a guest never becomes the head of a bedroom');
    G.sendHome(g, 'vis2.png');
}
// a free bedroom of their own
{
    to(10);
    const free = G.freeRooms(g, w);
    ok(free.length > 0, `the house has free bedrooms (${free.length})`);
    G.inviteVisit(g, w, ['vis1.png', 'vis2.png']);
    G.setSleep(g, 'vis1.png', { kind: 'room', spot: free[0].spot });
    ok(!G.freeRooms(g, w, 'vis2.png').some(r => r.spot === free[0].spot), 'a room chosen for someone on the way is no longer free for another');
    ok(G.freeRooms(g, w, 'vis1.png').some(r => r.spot === free[0].spot), '…but still listed for the one who has it');
    time.advance(g, w, 300); to(3);
    const v = g.cast['vis1.png'];
    ok(at(v) === 'home:vis1.png', `they sleep in their own room (${at(v)})`);
    { const LIFE = await D('sim/life.js'); g.social.bond['vis1.png'] = 0; ok(LIFE.doorAnswer(g, w, 'home:vis1.png').ok, 'a guest\'s room: you can always go in, even as strangers'); }
    ok(!G.freeRooms(g, w).some(r => r.spot === free[0].spot), 'the room is taken while they stay');
    { const PL = await D('sim/places.js'); g.player.loc = 'home:vis1.png';
      G.sendHome(g, 'vis1.png');
      const p = PL.placeOf(g, w, 'home:vis1.png');
      ok(!!p && p.name === 'Empty bedroom', 'goodbye in their room: you are still in it, now empty (no dark screen)');
      g.player.loc = 'living'; G.guestTick(g, w);
      ok(!PL.placeOf(g, w, 'home:vis1.png') && !g.vacated, 'you walk out: the room is shut again'); }
    G.sendHome(g, 'vis2.png');
    ok(G.freeRooms(g, w).some(r => r.spot === free[0].spot), 'free again once they leave');
}
// going out with someone from your library (and a housemate who is not home)
{
    const OUTG = await D('sim/outing.js');
    to(14);
    const r = G.arrive(g, w, 'par1.png', 'outing', { kind: 'sofa' });
    ok(!!r && G.guestOf(g, 'par1.png').kind === 'outing', 'someone from your library comes along');
    OUTG.startOuting(g, w, 'the beach', ['par1.png', 'boruto.png']);
    ok(at(g.cast['par1.png']) === g.player.loc && at(g.cast['boruto.png']) === g.player.loc, 'both are with you out there');
    ok(/came out with \{\{user\}\}/.test(G.guestLine(g, [g.cast['par1.png']])), 'the AI knows they are not housemates');
    time.advance(g, w, 90);
    ok(!!g.cast['par1.png'], 'they stay while you are out');
    OUTG.endOuting(g);
    const msgs = time.advance(g, w, 60);
    ok(!g.cast['par1.png'] && msgs.some(m => /Par1 went home/.test(m)), 'back home: they go home');
    ok(!!g.cast['boruto.png'], 'the housemate stays a housemate');
    ok(facts.facts(g).some(f => f.who.includes('par1.png') && /going out with/.test(f.t)), 'the outing is remembered');
}
// the doorbell
{
    to(10);
    G.inviteVisit(g, w, ['vis2.png']); time.advance(g, w, 70);
    ok(G.doorbell(g).includes('vis2.png'), 'arriving while you are home: they ring the doorbell');
    const door = G.doorRoom(g, w);
    ok(door === 'entrance', `the door is the entrance hall (${door})`);
    ok(at(g.cast['vis2.png']) === door, 'they wait at the door');
    ok(G.answerDoor(g, 'vis2.png', true) && !G.doorbell(g).length, 'you go and greet them');
    g.player.loc = door;
    ok(at(g.cast['vis2.png']) === door, 'greeted: they are with you');
    ok(facts.facts(g).some(f => f.who.includes('vis2.png') && /welcomed/.test(f.t)), 'the welcome is remembered');
    G.sendHome(g, 'vis2.png'); g.player.loc = 'home:player'; g.social.with = [];
    to(10); G.inviteVisit(g, w, ['vis1.png']); time.advance(g, w, 70);
    ok(G.answerDoor(g, 'vis1.png', false), 'or you just open the door');
    G.sendHome(g, 'vis1.png'); G.inviteVisit(g, w, ['vis1.png']); time.advance(g, w, 70);
    ok(G.doorbell(g).includes('vis1.png'), 'ringing again');
    const m2 = time.advance(g, w, 130);
    ok(!G.doorbell(g).length && m2.some(m => /came in \(someone opened the door\)/.test(m)), 'nobody answers for an hour: someone in the house opens');
    to(14); ok(HP.partyRooms(g, w).includes(at(g.cast['vis1.png'])), 'they come in by themselves, to the common rooms');
    G.sendHome(g, 'vis1.png');
}
// what the AI is told
{
    G.inviteVisit(g, w, ['vis1.png'], { kind: 'sofa' }); time.advance(g, w, 300);
    const line = G.guestLine(g, [g.cast['vis1.png'], g.cast['hana.png']]);
    ok(/Guests, not housemates: Vis1 is visiting/.test(line) && !/Hana/.test(line), `a guest is named as a guest (${line})`);
}
// an old save (no guests yet) still works
{
    const old = { ...save, cast: { ...save.cast } }; delete old.visitsPending;
    ok(Array.isArray(G.pendingVisits(old)) && G.guestsNow(old).length >= 0, 'a save without guests opens');
}
console.log(`guests: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
