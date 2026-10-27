// What makes characters take the initiative with you (requirements A-1, A-2, R-13), on top of the moments queue
// (sim/moments.ts). The first time someone's feelings toward you reach a tier, they get a moment: becoming friends,
// opening up, telling you what you mean to them, small signs of attraction, a hint or a confession (picked from their
// intimacy style), saying they love you, or telling you plainly what bothers them when it falls. Someone here who
// would say yes if you asked may ask you instead (a couple, something casual, an engagement, the wedding, a baby,
// staying the night); afterwards ui/relui.ts asks the AI whether you accepted. Away from you, someone with a crush
// may text you a date, and a casual partner a "come over tonight?". Romantic initiatives need the romance system,
// attraction to your gender and no family or minor block; an exclusive person with a partner of their own keeps it
// to themselves.
import { nowAbs } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { onHour, onDay } from './hooks.js';
import { presentAt, residents } from './people.js';
import { placeOf, playerHomeId } from './places.js';
import { hm } from './time.js';
import { social, bondOf, textFrom } from './social.js';
import { personaName } from '../st/bridge.js';
import { FRIEND_TIERS, ROMANCE_TIERS, friendTier, romOf, romValue, coolingDown, askScore, canAsk, shutOut, HATES, ASKS } from './romance.js';
import { romanceBlocked } from './family.js';
import { intimacyReady, needsOf, styleOf } from './intimacy.js';
import { canDate } from './plans.js';
import { attracted, partnersOf, idOf, YOU } from './rel.js';
import { initiativeOn, canSpend, spend, queueMoment, tidyMoments, momentsHere, seat } from './moments.js';
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
const rnd = (g, salt) => H(`${g.world}|${g.day}|${salt}`);
const fIdx = (v) => FRIEND_TIERS.indexOf(friendTier(v));
const rIdx = (v) => { const i = ROMANCE_TIERS.findIndex(t => v >= t.lo && v < t.hi); return i < 0 ? 0 : i; };
const F = Object.fromEntries(FRIEND_TIERS.map((t, i) => [t.id, i]));
const isMine = (g, a) => !!g.cast[a] && idOf(g, a) !== YOU;
const partnered = (g, a) => romOf(g, a).status !== 'none' && romOf(g, a).status !== 'casual';
// Romance may come from them: the system on, no family or minor block, attracted to you, not hating you, and not an
// exclusive person with a partner of their own (R-9).
export function romanticOk(g, w, a) {
    if (!systemOn(w, 'romance') || romanceBlocked(g, a) || !attracted(g, a, YOU) || bondOf(g, a) < HATES)
        return false;
    const own = partnersOf(g, a).filter(x => x !== YOU);
    return !(own.length && styleOf(g, a) === 'exclusive');
}
/* ---------- A-1: a feeling reaches a tier ---------- */
// What each tier brings (names only: the AI plays it in character).
const TIER_TEXT = {
    friend: n => `${n} feels they're becoming friends with {{user}}: in this scene ${n} asks {{user}} something personal, or suggests meeting up again.`,
    good: n => `${n} has come to trust {{user}}: in this scene ${n} opens up and shares something personal (a worry, a secret or a story from their past), or invites {{user}} somewhere that matters to them.`,
    best: n => `${n} tells {{user}}, in their own way, what {{user}} means to them.`,
    interest: n => `${n} is starting to be attracted to {{user}}: small signs in this scene (a compliment, some nervousness, lingering a little longer).`,
    hint: n => `${n} has a crush on {{user}} and hints at it in this scene, without saying it outright.`,
    confess: n => `${n} has been working up the courage to tell {{user}} how they feel, and confesses it in this scene, in their own way.`,
    infatuated: n => `${n} is falling hard for {{user}} and tells them how they feel in this scene.`,
    love: n => `${n} tells {{user}} they love them, in this scene, in their own way.`,
    down: n => `${n} is bothered by how things are going with {{user}}: in this scene ${n} tells {{user}} plainly what bothers them, or turns noticeably cold.`,
};
// How likely a crush is confessed rather than hinted at, by intimacy style.
const CONFESS = { free: 0.75, passionate: 0.7, steady: 0.4, slow: 0.2, devoted: 0.2, custom: 0.4 };
const crossedOf = (g) => (seat(g).crossed ??= {});
export function checkTiers(g, w) {
    const crossed = crossedOf(g);
    for (const r of residents(g)) {
        const a = r.avatar;
        if (!r.met || !isMine(g, a))
            continue;
        const fi = fIdx(bondOf(g, a)), ri = rIdx(romValue(g, a));
        const c = crossed[a];
        if (!c) {
            crossed[a] = { f: fi, r: ri, low: fi };
            continue;
        } // first seen: where they are already counts as reached
        const n = r.name;
        if (fi > c.f) { // up: the highest new tier that has a moment (once per tier)
            const t = ['best', 'good', 'friend'].find(id => F[id] <= fi && F[id] > c.f);
            if (t)
                queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT[t](n) });
            c.f = fi;
        }
        if (fi < c.low && fi <= F.wary)
            queueMoment(g, { who: a, kind: 'down', tier: FRIEND_TIERS[fi].id, text: TIER_TEXT.down(n) });
        c.low = fi; // a fall counts again only after they've risen above it
        if (ri > c.r) {
            if (romanticOk(g, w, a)) {
                const t = ROMANCE_TIERS[ri].id, partner = partnered(g, a);
                if (t === 'interest' && !partner)
                    queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT.interest(n) });
                else if (t === 'crush' && !partner) {
                    const confess = rnd(g, `confess|${a}`) < (CONFESS[needsOf(g, a).preset] ?? 0.4);
                    if (confess)
                        c.confessed = true;
                    queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT[confess ? 'confess' : 'hint'](n) });
                }
                else if (t === 'infatuated') {
                    if (partner)
                        queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT.love(n) });
                    else if (!c.confessed) {
                        c.confessed = true;
                        queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT.infatuated(n) });
                    }
                }
            }
            c.r = ri;
        }
    }
}
/* ---------- A-2: they ask you, here and now ---------- */
const ASK_TEXT = {
    date: n => `${n} asks {{user}} to be a couple in this scene, in their own way.`,
    casual: n => `${n} suggests to {{user}}, in their own way, keeping things casual between them: intimacy without being a couple.`,
    propose: n => `${n} proposes to {{user}} in this scene, in their own way.`,
    marry: n => `${n} asks {{user}} to set the date and get married.`,
    baby: n => `${n} brings up having a baby with {{user}}.`,
    stay: n => `${n} asks {{user}} if they can stay the night.`,
    staytheirs: n => `${n} asks {{user}} to stay the night at ${n}'s place.`,
};
export const ASK_WHAT = {
    date: 'to be a couple', casual: 'to keep things casual between them', propose: 'to marry them', marry: 'to set the date and get married',
    baby: 'about having a baby together', stay: 'if they could stay the night', staytheirs: 'to stay the night at their place',
};
const homeOf = (g, a) => { const h = g.cast[a]; const wth = h?.homeWith; return wth === YOU ? playerHomeId : `home:${wth && g.cast[wth] ? wth : a}`; };
// Where a night could be asked for: at your home (they stay) or theirs (you stay), in the evening.
function stayKind(g, a) {
    if (Math.floor(g.minutes / 60) < 20 || social(g).stay)
        return null;
    return g.player.loc === playerHomeId ? 'stay' : g.player.loc === homeOf(g, a) ? 'staytheirs' : null;
}
const likelyYes = (g, a, k) => { const s = askScore(g, a, k); return s.score >= s.need; };
// What they would ask now, if anything: the next step for your status, when it's what they'd say yes to themselves.
export function readyToAsk(g, w, a) {
    if (!romanticOk(g, w, a) || shutOut(g, a, true) || coolingDown(g, a))
        return null;
    const st = romOf(g, a).status;
    const night = intimacyReady(g, a, '').lean === 'yes' && (st !== 'none' || romValue(g, a) >= ROMANCE_TIERS[1].lo);
    const ok = (k) => canAsk(g, a, k);
    if ((st === 'none' || st === 'casual') && ok('date') && likelyYes(g, a, 'date'))
        return 'date';
    if (st === 'none' && ok('casual') && night && !needsOf(g, a).partnerOnly)
        return 'casual';
    if (st === 'dating' && ok('propose') && likelyYes(g, a, 'propose'))
        return 'propose';
    if (st === 'engaged' && ok('marry') && likelyYes(g, a, 'marry'))
        return 'marry';
    if (ok('baby') && likelyYes(g, a, 'baby'))
        return 'baby';
    const s = night ? stayKind(g, a) : null;
    return s;
}
// A moment for one of them here, sometimes (a fixed chance per day and person), within the budget.
export function checkAsks(g, w) {
    if (seat(g).moments.some(m => m.kind === 'ask'))
        return; // one question at a time
    for (const r of presentAt(g, w, g.player.loc)) {
        if (!r.met || !isMine(g, r.avatar) || rnd(g, `ask|${r.avatar}`) >= 0.35 || !canSpend(g, r.avatar))
            continue;
        const k = readyToAsk(g, w, r.avatar);
        if (!k)
            continue;
        if (queueMoment(g, { who: r.avatar, kind: 'ask', ask: k, text: ASK_TEXT[k](r.name) })) {
            spend(g, r.avatar);
            return;
        }
    }
}
// Someone away from you with a crush texts you a date; a casual partner, a "come over tonight?". Answered on the
// invitation card (Accept, Decline, Not yet).
export function textAsks(g, w) {
    const h = Math.floor(g.minutes / 60), s = social(g);
    if (!systemOn(w, 'plans') || !systemOn(w, 'romance') || s.invite || h < 10 || h > 19 || rnd(g, `textask|${h}`) > 0.05)
        return [];
    const here = new Set(presentAt(g, w, g.player.loc).map(r => r.avatar));
    const pool = residents(g).filter(r => r.met && isMine(g, r.avatar) && !here.has(r.avatar) && romanticOk(g, w, r.avatar) && !coolingDown(g, r.avatar) && canSpend(g, r.avatar));
    const pick = (r) => {
        const st = romOf(g, r.avatar).status;
        if (st === 'casual' && intimacyReady(g, r.avatar, '').lean === 'yes')
            return { kind: 'casual' };
        if (st === 'none' && romValue(g, r.avatar) >= ROMANCE_TIERS[2].lo && canDate(g, r.avatar) && r.leisure.length)
            return { kind: 'date' };
        return null;
    };
    const list = pool.map(r => [r, pick(r)]).filter((x) => !!x[1]);
    if (!list.length)
        return [];
    const [r, t] = list[Math.floor(rnd(g, 'textaskwho') * list.length)];
    const now = nowAbs(g);
    const base = t.kind === 'casual' ? Math.max(now + 60, g.day * 1440 + 21 * 60) : now + 120, from = base - (base % 30);
    const place = t.kind === 'casual' ? homeOf(g, r.avatar) : r.leisure[Math.floor(rnd(g, 'textaskwhere') * r.leisure.length)];
    s.invite = { avatar: r.avatar, place, from, kind: 'date', initiative: t.kind };
    spend(g, r.avatar);
    const when = `${hm(from % 1440)}${Math.floor(from / 1440) === g.day ? ' today' : ' tomorrow'}`;
    const where = t.kind === 'casual' ? `${r.name}'s place` : placeOf(g, w, place)?.name ?? 'somewhere nice';
    const me = personaName();
    void textFrom(g, w, r.avatar, t.kind === 'casual'
        ? `${r.name} texts ${me} out of the blue: would ${me} like to come over to ${r.name}'s place tonight (${when})? One or two short, flirty sentences, in their own voice.`
        : `${r.name} has a crush on ${me} and texts to ask them out on a date: ${where}, ${when}. One or two short sentences, in their own voice, a little nervous.`, t.kind === 'casual' ? `Come over tonight? ${when}.` : `Would you like to go out with me? ${where}, ${when}?`)
        .then(() => { s.unread[r.avatar] = (s.unread[r.avatar] ?? 0) + 1; })
        .catch(() => { });
    return [];
}
/* ---------- moments that still fit, and the AI's line ---------- */
export function fits(g, w, m) {
    const a = m.who;
    if (!isMine(g, a))
        return false;
    if (m.kind === 'down')
        return bondOf(g, a) < 0;
    if (m.kind === 'ask')
        return readyToAskStill(g, w, m);
    if (m.kind === 'tier') {
        const ft = FRIEND_TIERS.find(t => t.id === m.tier);
        if (ft)
            return bondOf(g, a) >= ft.lo;
        const rt = ROMANCE_TIERS.find(t => t.id === m.tier);
        return !!rt && romanticOk(g, w, a) && romValue(g, a) >= rt.lo && (m.tier === 'infatuated' || !partnered(g, a));
    }
    return true;
}
// A question already sent stays until it's answered (or the scene ends); one not sent yet must still be the right one.
function readyToAskStill(g, w, m) {
    if (m.sent !== undefined)
        return true;
    const k = m.ask;
    if (k === 'stay' || k === 'staytheirs')
        return stayKind(g, m.who) === k && romanticOk(g, w, m.who);
    return romanticOk(g, w, m.who) && !coolingDown(g, m.who) && ASKS[k].from.includes(romOf(g, m.who).status);
}
export function momentsFor(g, w, present) { return momentsHere(g, present, m => fits(g, w, m)); }
export function momentsLine(list) {
    return list.length ? `Moments for this scene (each happens once; play it naturally and in character, when it fits): ${list.map(m => m.text).join(' ')}` : '';
}
/* ---------- when it runs ---------- */
// After anything that may have moved feelings (the prompt is refreshed), and every hour.
export function checkInitiative(g, w) {
    if (!initiativeOn(g))
        return;
    checkTiers(g, w);
    checkAsks(g, w);
}
onHour.push((g, w) => { if (!initiativeOn(g))
    return []; checkInitiative(g, w); return textAsks(g, w); });
onDay.push((g, w) => { if (initiativeOn(g))
    tidyMoments(g, m => fits(g, w, m)); return []; });
