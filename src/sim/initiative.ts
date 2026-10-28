// What makes characters take the initiative with you (requirements A-1, A-2, R-13), on top of the moments queue
// (sim/moments.ts). The first time someone's feelings toward you reach a tier, they get a moment: becoming friends,
// opening up, telling you what you mean to them, small signs of attraction, a hint or a confession (picked from their
// intimacy style), saying they love you, or telling you plainly what bothers them when it falls. Someone here who
// would say yes if you asked may ask you instead (a couple, something casual, an engagement, the wedding, a baby,
// staying the night); afterwards ui/relui.ts asks the AI whether you accepted. Away from you, someone with a crush
// may text you a date, and a casual partner a "come over tonight?". Romantic initiatives need the romance system,
// attraction to your gender and no family or minor block; an exclusive person with a partner of their own keeps it
// to themselves. And, for the AI, what each person here wants from you right now (A-7).
// Festivals with a custom between people (E5) give moments chosen by each person's feelings toward you (Valentine's
// chocolate, a partner expecting a date on Christmas Eve, an invitation to the New Year shrine visit or to hanami), and
// a friend may introduce you to a good friend of theirs you haven't met, at that friend's standing appointment or at a
// place their day takes them to (E30).
import { nowAbs, type Save, type Resident } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { onHour, onDay, onLook } from './hooks.js';
import { presentAt, residents, routineAt, workingAt } from './people.js';
import { placeOf, playerHomeId } from './places.js';
import { hm } from './time.js';
import { social, bondOf, textFrom } from './social.js';
import { personaName } from '../st/bridge.js';
import { FRIEND_TIERS, ROMANCE_TIERS, friendTier, romOf, romValue, coolingDown, askScore, canAsk, shutOut, HATES, ASKS, type AskKind } from './romance.js';
import { romanceBlocked } from './family.js';
import { intimacyReady, needsOf, styleOf } from './intimacy.js';
import { canDate } from './plans.js';
import { attracted, partnersOf, idOf, relOf, fr, lose, statusOf, YOU } from './rel.js';
import { grudgeOf } from './grudges.js';
import { warning, lowFor } from './warnings.js';
import { lookingOf } from './feed.js';
import { confrontations } from './jealousy.js';
import { initiativeOn, canSpend, spend, queueMoment, tidyMoments, momentsHere, seat, type Moment, type Asked } from './moments.js';
import { festivalsOn } from './festivals.js';
import { slotAt, adultOn } from './dayplan.js';
import { ties } from './living.js';
import { threadMomentFits } from './threads.js';
import { isWith } from './social.js';

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const rnd = (g: Save, salt: string) => H(`${g.world}|${g.day}|${salt}`);
const fIdx = (v: number) => FRIEND_TIERS.indexOf(friendTier(v));
const rIdx = (v: number) => { const i = ROMANCE_TIERS.findIndex(t => v >= t.lo && v < t.hi); return i < 0 ? 0 : i; };
const F = Object.fromEntries(FRIEND_TIERS.map((t, i) => [t.id, i])) as Record<string, number>;
const isMine = (g: Save, a: string) => !!g.cast[a] && idOf(g, a) !== YOU;
const partnered = (g: Save, a: string) => romOf(g, a).status !== 'none' && romOf(g, a).status !== 'casual';

// Romance may come from them: the system on, no family or minor block, attracted to you, not hating you, and not an
// exclusive person with a partner of their own (R-9).
export function romanticOk(g: Save, w: WorldDef, a: string): boolean {
    if (!systemOn(w, 'romance') || romanceBlocked(g, a) || !attracted(g, a, YOU) || bondOf(g, a) < HATES) return false;
    const own = partnersOf(g, a).filter(x => x !== YOU);
    return !(own.length && styleOf(g, a) === 'exclusive');
}

/* ---------- A-1: a feeling reaches a tier ---------- */

// What each tier brings (names only: the AI plays it in character).
const TIER_TEXT: Record<string, (n: string) => string> = {
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
const CONFESS: Record<string, number> = { free: 0.75, passionate: 0.7, steady: 0.4, slow: 0.2, devoted: 0.2, custom: 0.4 };
interface Crossed { f: number; r: number; low: number; confessed?: boolean }
const crossedOf = (g: Save) => (((seat(g) as any).crossed ??= {}) as Record<string, Crossed>);

export function checkTiers(g: Save, w: WorldDef) {
    const crossed = crossedOf(g);
    for (const r of residents(g)) {
        const a = r.avatar;
        if (!r.met || !isMine(g, a)) continue;
        const fi = fIdx(bondOf(g, a)), ri = rIdx(romValue(g, a));
        const c = crossed[a];
        if (!c) { crossed[a] = { f: fi, r: ri, low: fi }; continue; }   // first seen: where they are already counts as reached
        const n = r.name;
        if (fi > c.f) {   // up: the highest new tier that has a moment (once per tier)
            const t = ['best', 'good', 'friend'].find(id => F[id] <= fi && F[id] > c.f);
            if (t) queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT[t](n) });
            c.f = fi;
        }
        if (fi < c.low && fi <= F.wary) queueMoment(g, { who: a, kind: 'down', tier: FRIEND_TIERS[fi].id, text: TIER_TEXT.down(n) });
        c.low = fi;   // a fall counts again only after they've risen above it
        if (ri > c.r) {
            if (romanticOk(g, w, a)) {
                const t = ROMANCE_TIERS[ri].id, partner = partnered(g, a);
                if (t === 'interest' && !partner) queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT.interest(n) });
                else if (t === 'crush' && !partner) {
                    const confess = rnd(g, `confess|${a}`) < (CONFESS[needsOf(g, a).preset] ?? 0.4);
                    if (confess) c.confessed = true;
                    queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT[confess ? 'confess' : 'hint'](n) });
                } else if (t === 'infatuated') {
                    if (partner) queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT.love(n) });
                    else if (!c.confessed) { c.confessed = true; queueMoment(g, { who: a, kind: 'tier', tier: t, text: TIER_TEXT.infatuated(n) }); }
                }
            }
            c.r = ri;
        }
    }
}

/* ---------- A-2: they ask you, here and now ---------- */

const ASK_TEXT: Record<Asked, (n: string) => string> = {
    date: n => `${n} asks {{user}} to be a couple in this scene, in their own way.`,
    casual: n => `${n} suggests to {{user}}, in their own way, keeping things casual between them: intimacy without being a couple.`,
    propose: n => `${n} proposes to {{user}} in this scene, in their own way.`,
    marry: n => `${n} asks {{user}} to set the date and get married.`,
    baby: n => `${n} brings up having a baby with {{user}}.`,
    stay: n => `${n} asks {{user}} if they can stay the night.`,
    staytheirs: n => `${n} asks {{user}} to stay the night at ${n}'s place.`,
};
export const ASK_WHAT: Record<Asked, string> = {
    date: 'to be a couple', casual: 'to keep things casual between them', propose: 'to marry them', marry: 'to set the date and get married',
    baby: 'about having a baby together', stay: 'if they could stay the night', staytheirs: 'to stay the night at their place',
};
const homeOf = (g: Save, a: string) => { const h: any = g.cast[a]; const wth = h?.homeWith; return wth === YOU ? playerHomeId : `home:${wth && g.cast[wth] ? wth : a}`; };
// Where a night could be asked for: at your home (they stay) or theirs (you stay), in the evening.
function stayKind(g: Save, a: string): Asked | null {
    if (Math.floor(g.minutes / 60) < 20 || (social(g) as any).stay) return null;
    return g.player.loc === playerHomeId ? 'stay' : g.player.loc === homeOf(g, a) ? 'staytheirs' : null;
}
const likelyYes = (g: Save, a: string, k: Exclude<AskKind, 'casual'>) => { const s = askScore(g, a, k); return s.score >= s.need; };
// What they would ask now, if anything: the next step for your status, when it's what they'd say yes to themselves.
export function readyToAsk(g: Save, w: WorldDef, a: string): Asked | null {
    if (!romanticOk(g, w, a) || shutOut(g, a, true) || coolingDown(g, a) || grudgeOf(g, a)) return null;
    const st = romOf(g, a).status;
    const night = intimacyReady(g, a, '').lean === 'yes' && (st !== 'none' || romValue(g, a) >= ROMANCE_TIERS[1].lo);
    const ok = (k: AskKind) => canAsk(g, a, k);
    // asking you out takes a crush, however good friends you are
    if ((st === 'none' || st === 'casual') && ok('date') && romValue(g, a) >= ROMANCE_TIERS[2].lo && likelyYes(g, a, 'date')) return 'date';
    if (st === 'none' && ok('casual') && night && !needsOf(g, a).partnerOnly) return 'casual';
    if (st === 'dating' && ok('propose') && likelyYes(g, a, 'propose')) return 'propose';
    if (st === 'engaged' && ok('marry') && likelyYes(g, a, 'marry')) return 'marry';
    if (ok('baby') && likelyYes(g, a, 'baby')) return 'baby';
    const s = night ? stayKind(g, a) : null;
    return s;
}
// A moment for one of them here, sometimes (a fixed chance per day and person), within the budget.
export function checkAsks(g: Save, w: WorldDef) {
    if (seat(g).moments.some(m => m.kind === 'ask')) return;   // one question at a time
    for (const r of presentAt(g, w, g.player.loc)) {
        // one thing at a time: a confession or a grudge they still have to bring up comes first
        if (!r.met || !isMine(g, r.avatar) || seat(g).moments.some(m => m.who === r.avatar) || rnd(g, `ask|${r.avatar}`) >= 0.35 || !canSpend(g, r.avatar)) continue;
        const k = readyToAsk(g, w, r.avatar); if (!k) continue;
        if (queueMoment(g, { who: r.avatar, kind: 'ask', ask: k, text: ASK_TEXT[k](r.name) })) { spend(g, r.avatar); return; }
    }
}

/* ---------- R-13: an invitation by text ---------- */

export interface TextAsk { kind: 'date' | 'casual' }
// Someone away from you with a crush texts you a date; a casual partner, a "come over tonight?". Answered on the
// invitation card (Accept, Decline, Not yet).
export function textAsks(g: Save, w: WorldDef): string[] {
    const h = Math.floor(g.minutes / 60), s = social(g) as any;
    if (!systemOn(w, 'plans') || !systemOn(w, 'romance') || s.invite || h < 10 || h > 19 || rnd(g, `textask|${h}`) > 0.05) return [];
    const here = new Set(presentAt(g, w, g.player.loc).map(r => r.avatar));
    const pool = residents(g).filter(r => r.met && isMine(g, r.avatar) && !here.has(r.avatar) && romanticOk(g, w, r.avatar) && !coolingDown(g, r.avatar) && !grudgeOf(g, r.avatar) && canSpend(g, r.avatar));
    const pick = (r: Resident): TextAsk | null => {
        const st = romOf(g, r.avatar).status;
        if (st === 'casual' && intimacyReady(g, r.avatar, '').lean === 'yes') return { kind: 'casual' };
        if (st === 'none' && romValue(g, r.avatar) >= ROMANCE_TIERS[2].lo && canDate(g, r.avatar) && r.leisure.length) return { kind: 'date' };
        return null;
    };
    const list = pool.map(r => [r, pick(r)] as const).filter((x): x is readonly [Resident, TextAsk] => !!x[1]);
    if (!list.length) return [];
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
        : `${r.name} has a crush on ${me} and texts to ask them out on a date: ${where}, ${when}. One or two short sentences, in their own voice, a little nervous.`,
        t.kind === 'casual' ? `Come over tonight? ${when}.` : `Would you like to go out with me? ${where}, ${when}?`)
        .then(() => { s.unread[r.avatar] = (s.unread[r.avatar] ?? 0) + 1; })
        .catch(() => { /* offline: the invitation card still shows */ });
    return [];
}

/* ---------- moments that still fit, and the AI's line ---------- */

export function fits(g: Save, w: WorldDef, m: Moment): boolean {
    const a = m.who; if (!isMine(g, a)) return false;
    if (m.until !== undefined && g.day > m.until) return false;
    if (m.kind === 'thread') return threadMomentFits(g, m.tier ?? '');
    if (m.kind === 'custom') return true;
    if (m.kind === 'intro') { if (m.tier?.startsWith('tell:')) return true; const b = g.cast[m.tier ?? '']; return !!b && presentAt(g, w, g.player.loc).includes(b); }
    if (m.kind === 'down') return bondOf(g, a) < 0;
    if (m.kind === 'grudge') return !!grudgeOf(g, a);
    if (m.kind === 'talk') return lowFor(g, a);
    if (m.kind === 'jealous') return partnered(g, a);
    if (m.kind === 'ask') return readyToAskStill(g, w, m);
    if (m.kind === 'tier') {
        const ft = FRIEND_TIERS.find(t => t.id === m.tier);
        if (ft) return bondOf(g, a) >= ft.lo;
        const rt = ROMANCE_TIERS.find(t => t.id === m.tier);
        return !!rt && romanticOk(g, w, a) && romValue(g, a) >= rt.lo && (m.tier === 'infatuated' || !partnered(g, a));
    }
    return true;
}
// A question already sent stays until it's answered (or the scene ends); one not sent yet must still be the right one.
function readyToAskStill(g: Save, w: WorldDef, m: Moment): boolean {
    const k = m.ask as Asked;
    if (m.sent !== undefined) return k === 'stay' || k === 'staytheirs' || ASKS[k].from.includes(romOf(g, m.who).status);   // unless it's already settled

    if (k === 'stay' || k === 'staytheirs') return stayKind(g, m.who) === k && romanticOk(g, w, m.who);
    return romanticOk(g, w, m.who) && !coolingDown(g, m.who) && ASKS[k].from.includes(romOf(g, m.who).status);
}
export function momentsFor(g: Save, w: WorldDef, present: Resident[]): Moment[] { return momentsHere(g, present, m => fits(g, w, m)); }
export function momentsLine(list: Moment[]): string {
    return list.length ? `Moments for this scene (each happens once; play it naturally and in character, when it fits): ${list.map(m => m.text).join(' ')}` : '';
}

/* ---------- A-7: what each person here wants from you ---------- */

// One plain line per person, from the first rule that matches: an apology, the relationship, being asked out,
// something casual, getting closer, some space (no numbers).
export function wantOf(g: Save, w: WorldDef, a: string, n: string): string {
    const st = romOf(g, a).status, f = bondOf(g, a), r = romValue(g, a);
    const day = relOf(g).day, lost = day?.day === g.day && (day.snap[a]?.[0] ?? f) - fr(g, a, YOU) >= 3;
    if (grudgeOf(g, a)) return `${n} is waiting for an apology from {{user}}`;
    if (warning(g, a)) return `${n} is worried about their relationship with {{user}}`;
    const love = romanticOk(g, w, a);
    if (love && st === 'none' && r >= ROMANCE_TIERS[2].lo && !coolingDown(g, a)) return `${n} is hoping {{user}} will ask them out`;
    if (love && st === 'none' && r >= ROMANCE_TIERS[1].lo && !needsOf(g, a).partnerOnly && (lookingOf(g, a) === 'Something casual' || ['free', 'passionate'].includes(needsOf(g, a).preset))) return `${n} would like to keep things casual with {{user}}`;
    if (!lost && f >= FRIEND_TIERS[F.friend].lo && f < FRIEND_TIERS[F.best].lo) return `${n} wants to get closer to {{user}}`;
    if (lost) return `${n} wants some space from {{user}} right now`;
    return '';
}
export function wantsLine(g: Save, w: WorldDef, present: Resident[]): string {
    if (!initiativeOn(g)) return '';
    const parts = present.filter(r => r.met && isMine(g, r.avatar)).map(r => wantOf(g, w, r.avatar, r.name)).filter(Boolean);
    return parts.length ? `What they want from {{user}} right now: ${parts.join('; ')}.` : '';
}

/* ---------- E5: festival customs between you and them ---------- */

// Who you are to them, for a custom: family (a tie with you, or living with you), a partner.
const familyOf = (g: Save, a: string) => ties(g).some(t => (t.a === a && t.b === YOU) || (t.b === a && t.a === YOU)) || (g.cast[a] as any)?.homeWith === YOU;
const partnerOf = (g: Save, a: string) => ['dating', 'engaged', 'married'].includes(statusOf(g, a, YOU) ?? '');
interface CustomDone { day: Record<string, number>; late: Record<string, number>; gave?: { fest: string; day: number; who: string[] } }
const customsDone = (g: Save) => { const c = ((seat(g) as any).customs ??= {}) as CustomDone; c.day ??= {}; c.late ??= {}; return c; };
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const whenText = (g: Save, at: number) => { const d = Math.floor(at / 1440); return `${hm(at % 1440)} ${d === g.day ? 'today' : d === g.day + 1 ? 'tomorrow' : `on ${WEEKDAY_NAMES[(d - 1) % 7]}`}`; };
// A texted invitation (one waits at a time), with the plans system on. `note`: what they convey, for the AI.
function textInvite(g: Save, w: WorldDef, r: Resident, place: string, from: number, note: string, fallback: string): boolean {
    const s = social(g) as any;
    if (!systemOn(w, 'plans') || s.invite || !placeOf(g, w, place)) return false;
    s.invite = { avatar: r.avatar, place, from, kind: 'hangout' };
    void textFrom(g, w, r.avatar, `${r.name} texts ${personaName()}: ${note} One or two short sentences, in their own voice.`, fallback)
        .then(() => { s.unread[r.avatar] = (s.unread[r.avatar] ?? 0) + 1; })
        .catch(() => { /* offline: the invitation card still shows */ });
    return true;
}
/** On a festival day with a custom, each person's part in it, by their feelings toward you: `gift` (romance from
 *  Interest gives the real thing, a friend a courtesy gift, nobody else anything), `return` (who gave you something
 *  on the last gift day waits to see what you give back), `couples` (a partner expects the evening and is hurt when
 *  nothing was planned by 21:00; a crush drops a hint), `family` (family, a partner or a best friend asks you along),
 *  `group` (the closest friend invites you, friends here ask you to join). Moments for the day, and one texted
 *  invitation to the festival's place. Once a festival day (and the evening's check), with the festivals system on. */
export function festivalCustoms(g: Save, w: WorldDef): string[] {
    const h = Math.floor(g.minutes / 60);
    if (!systemOn(w, 'festivals') || !initiativeOn(g) || h < 8) return [];
    const done = customsDone(g), romance = systemOn(w, 'romance');
    const people = residents(g).filter(r => r.met && isMine(g, r.avatar)).sort((a, b) => bondOf(g, b.avatar) - bondOf(g, a.avatar));
    const add = (r: Resident, tier: string, text: string, until = g.day) => queueMoment(g, { who: r.avatar, kind: 'custom', tier, text, until });
    for (const f of festivalsOn(g, w)) {
        const c = f.custom; if (!c || (f.adult && !adultOn(g))) continue;
        const name = f.name;
        if (c.kind === 'couples' && romance && h >= 21 && done.day[f.id] === g.day && done.late[f.id] !== g.day) {
            done.late[f.id] = g.day;
            for (const r of people.filter(x => partnerOf(g, x.avatar))) {
                const plan = social(g).appts.some(a => a.avatar === r.avatar && Math.floor(a.from / 1440) === g.day && (a.state === 'set' || a.state === 'met'));
                if (plan || isWith(g, r.avatar) || presentAt(g, w, g.player.loc).includes(r)) continue;
                lose(g, 'r', r.avatar, YOU, 3);
                add(r, `${f.id}:late`, `${r.name} is hurt that {{user}} made no plans with them on ${name}, the couples' night, and lets it show in this scene.`, g.day + 2);
            }
        }
        if (done.day[f.id] === g.day) continue;
        done.day[f.id] = g.day;
        if (c.kind === 'gift') {
            const gave: string[] = [];
            for (const r of people) {
                if (romance && romanticOk(g, w, r.avatar) && (romValue(g, r.avatar) >= ROMANCE_TIERS[1].lo || partnerOf(g, r.avatar))) add(r, f.id, `It's ${name}: ${r.name} has feelings for {{user}} and gives them chocolate, the real thing (handmade or carefully chosen), in this scene, in their own way.`);
                else if (bondOf(g, r.avatar) >= FRIEND_TIERS[F.friend].lo) add(r, f.id, `It's ${name}: ${r.name} gives {{user}} a small box of courtesy chocolate, friendly and nothing more, in this scene.`);
                else continue;
                gave.push(r.avatar);
            }
            done.gave = { fest: name, day: g.day, who: gave };
        } else if (c.kind === 'return') {
            const gave = done.gave;   // the last gift day (a year back at most)
            if (gave && g.day - gave.day <= 16 * 14) for (const r of people.filter(x => gave.who.includes(x.avatar))) add(r, f.id, `It's ${name}: ${r.name} gave {{user}} chocolate on ${gave.fest} and quietly waits to see whether {{user}} gives something back today.`);
        } else if (c.kind === 'couples' && romance) {
            for (const r of people) {
                if (partnerOf(g, r.avatar)) add(r, f.id, `It's ${name}, the couples' night: ${r.name} hopes to spend the evening with {{user}} (dinner, the lights, a date) and brings it up if nothing is planned.`);
                else if (romanticOk(g, w, r.avatar) && romValue(g, r.avatar) >= ROMANCE_TIERS[2].lo && !partnered(g, r.avatar)) add(r, f.id, `It's ${name}, the couples' night: ${r.name} has a crush on {{user}} and drops a hint about having no plans tonight.`);
            }
        } else if (c.kind === 'family' || c.kind === 'group') {
            const close = c.kind === 'family'
                ? people.filter(r => familyOf(g, r.avatar) || partnerOf(g, r.avatar) || bondOf(g, r.avatar) >= FRIEND_TIERS[F.best].lo)
                : people.filter(r => bondOf(g, r.avatar) >= FRIEND_TIERS[F.friend].lo);
            const asks = c.kind === 'family' ? `asks {{user}} to come along for ${name}` : `invites {{user}} to join them for ${name}`;
            const now = nowAbs(g), hour = c.at !== undefined ? g.day * 1440 + Math.round(c.at * 60) : 0;
            const from = hour >= now + 60 ? hour : now + 120 - (now % 30);
            const [first, ...rest] = close;
            const texted = !!first && !!f.place && Math.floor(from / 1440) === g.day
                && textInvite(g, w, first, f.place, from, `${c.kind === 'family' ? 'come along' : 'come and join us'} for ${name} at ${placeOf(g, w, f.place)?.name ?? 'the festival'}, ${whenText(g, from)}.`, `Come along for ${name}? ${placeOf(g, w, f.place)?.name ?? ''}, ${hm(from % 1440)}.`);
            for (const r of texted ? rest : close) add(r, f.id, `It's ${name}: ${r.name} ${asks}, in this scene.`);
        }
    }
    return [];
}

/* ---------- E30: introductions through friends ---------- */

const introsDone = (g: Save) => ((seat(g) as any).intros ??= {}) as Record<string, number>;
// A friend's friend: someone they're close to (a good friend, or family).
const closeTo = (g: Save, a: string, b: string) => fr(g, a, b) >= FRIEND_TIERS[F.good].lo || ties(g).some(t => (t.a === a && t.b === b) || (t.a === b && t.b === a));
/** Where you could meet a friend's friend soon (from two hours on): their standing appointment in the next three days,
 *  else a public place their day takes them to in the next two, at a time the friend isn't working. */
export function meetSpot(g: Save, w: WorldDef, a: Resident, b: Resident): { place: string; from: number; why: string } | null {
    const start = nowAbs(g) + 120 - (nowAbs(g) % 30);
    const free = (at: number) => !workingAt(g, w, a, at);
    const ok = (p: string) => !!p && !p.startsWith('home:') && w.places.some(x => x.id === p && (!x.adult || adultOn(g)));
    for (let at = start; at < start + 3 * 1440; at += 30) {
        const s = slotAt(g, w, b, at);
        if (s?.kind === 'ritual' && ok(s.place) && free(at)) return { place: s.place, from: at, why: s.why };
    }
    for (let at = start; at < start + 2 * 1440; at += 60) {
        const h = Math.floor((at % 1440) / 60);
        if (h < 11 || h > 21) continue;
        const p = routineAt(g, w, b, at);
        if (ok(p) && free(at) && !workingAt(g, w, b, at)) return { place: p, from: at, why: 'one of their usual places' };
    }
    return null;
}
/** A friend who'd like you to meet a good friend of theirs you haven't met texts you to come along (or, here with you,
 *  brings it up); once the three of you are together, they introduce you. Once per new person, within the initiative
 *  budget, with the social system on. `force`: skip the hour's dice (tests). */
export function introductions(g: Save, w: WorldDef, force = false): string[] {
    const h = Math.floor(g.minutes / 60);
    if (!systemOn(w, 'social') || !initiativeOn(g) || h < 10 || h > 19 || (!force && rnd(g, `intro|${h}`) > 0.06)) return [];
    const done = introsDone(g);
    const friends = residents(g).filter(r => r.met && isMine(g, r.avatar) && bondOf(g, r.avatar) >= FRIEND_TIERS[F.friend].lo && !grudgeOf(g, r.avatar) && canSpend(g, r.avatar));
    const strangers = residents(g).filter(r => !r.met && isMine(g, r.avatar) && done[r.avatar] === undefined);
    const pairs = friends.flatMap(a => strangers.filter(b => b !== a && closeTo(g, a.avatar, b.avatar)).map(b => [a, b] as const))
        .sort((x, y) => rnd(g, `introw|${x[0].avatar}|${x[1].avatar}`) - rnd(g, `introw|${y[0].avatar}|${y[1].avatar}`));
    for (const [a, b] of pairs) {
        const spot = meetSpot(g, w, a, b); if (!spot) continue;
        const where = placeOf(g, w, spot.place)?.name ?? 'there', when = whenText(g, spot.from);
        const texted = textInvite(g, w, a, spot.place, spot.from, `come to ${where} (${when}): ${b.name}, a good friend of ${a.name}'s, will be there (${spot.why}), and ${a.name} wants them to meet.`, `Come to ${where}, ${when}? I want you to meet ${b.name}.`);
        if (!texted) {
            if (!presentAt(g, w, g.player.loc).includes(a)) continue;
            queueMoment(g, { who: a.avatar, kind: 'intro', tier: `tell:${b.avatar}`, text: `${a.name} tells {{user}} about ${b.name}, a good friend of theirs, and suggests coming along to ${where} some time (${spot.why}).` });
        }
        // when the three of you are together, the friend introduces you
        queueMoment(g, { who: a.avatar, kind: 'intro', tier: b.avatar, text: `${a.name} introduces {{user}} to ${b.name}, their good friend, in this scene.`, until: Math.floor(spot.from / 1440) + 1 });
        done[b.avatar] = g.day;
        spend(g, a.avatar);
        return [];
    }
    return [];
}

/* ---------- when it runs ---------- */

// After anything that may have moved feelings (the prompt is refreshed), and every hour. The world's stories and
// threads look at the scene first: they don't depend on the initiative setting.
export function checkInitiative(g: Save, w: WorldDef) {
    for (const f of onLook) f(g, w);
    if (!initiativeOn(g)) return;
    checkTiers(g, w);
    confrontations(g, w, presentAt(g, w, g.player.loc));
    checkAsks(g, w);
}
onHour.push((g, w) => { if (!initiativeOn(g)) return []; checkInitiative(g, w); return [...textAsks(g, w), ...festivalCustoms(g, w), ...introductions(g, w)]; });
onDay.push((g, w) => { if (initiativeOn(g)) tidyMoments(g, m => fits(g, w, m)); return []; });
