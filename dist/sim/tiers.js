import { getWorld } from '../core/world.js';
import { onHour, onDay, tierLink } from './hooks.js';
import { relOf, idOf, land, YOU } from './rel.js';
import { whenHolds, missingWords } from './when.js';
import { exampleOf } from './dayplan.js';
import { milestonePoints } from './points.js';
import { FRIEND_TIERS, ROMANCE_TIERS } from './romance.js';
/** Life points for each tier reached (once per person and tier, outside the day's cap). */
export const TIER_POINTS = 40;
const STATUS_RANK = { none: 0, casual: 1, dating: 2, engaged: 3, married: 4 };
// Whether a world has anyone with tiers or `reserved` (kept while its example cast stays the same list): without, every
// hook returns at once.
const kept = new WeakMap();
function anyTiers(w) {
    const list = w?.cast?.examples;
    if (!w || !list?.length)
        return false;
    let k = kept.get(w);
    if (!k || k.list !== list || k.n !== list.length)
        kept.set(w, k = { list, n: list.length, any: list.some(e => !!e.tiers?.length || e.reserved === true) });
    return k.any;
}
// The world's example behind someone in this game (null: none, or the world has no tiers at all).
function exOf(g, w, id) {
    if (!anyTiers(w) || !id || id === YOU)
        return null;
    const r = g.cast?.[id];
    return r ? exampleOf(w, r) : null;
}
/** A person's tiers, in order (empty for everyone without). */
export const tiersOf = (g, w, id) => exOf(g, w, id)?.tiers ?? [];
/** Is someone reserved (drawn to whoever you play and to nobody else)? */
export const isReserved = (g, w, id) => exOf(g, w, id)?.reserved === true;
/** The highest tier reached (−1: none yet). */
export const tierReached = (g, id) => relOf(g).people[idOf(g, id)]?.tier?.n ?? -1;
// The tier whose caps hold now: the one reached, or the first before any is (a list shorter than the save's tier: the last).
const capsTier = (list, n) => list[Math.min(Math.max(0, n), list.length - 1)];
const reachedTiers = (list, n) => list.slice(0, Math.max(0, Math.min(n + 1, list.length)));
/* ---------- caps and held gains ---------- */
const bandsOf = (m) => (m === 'f' ? FRIEND_TIERS : ROMANCE_TIERS);
// The highest value a level allows: a point under the next level (so the rounded value still reads as that level);
// the top level has no cap.
function capValue(m, level) {
    const b = bandsOf(m).find(t => t.id === level);
    return !b || b.hi > 100 ? null : b.hi - 1;
}
// One level's worth past a cap: the width of the level above it.
function levelWorth(m, level) {
    const list = bandsOf(m), i = list.findIndex(t => t.id === level), next = list[i + 1];
    return next ? Math.min(next.hi, 100) - next.lo : 0;
}
/** The highest friendship or romance toward you someone's tier allows now (null: no cap). */
export function capOf(g, w, id, m) {
    const list = tiersOf(g, w, id);
    return list.length ? capValue(m, capsTier(list, tierReached(g, id)).caps?.[m]) : null;
}
/** What's held for the next tier (raw points, per meter). */
export const heldOf = (g, id) => ({ ...(relOf(g).people[idOf(g, id)]?.held ?? {}) });
// A gain's raw rest past the cap: held, up to one level's worth, unless the tier drops it.
function hold(g, w, id, m, raw) {
    const list = tiersOf(g, w, id);
    if (!list.length || !(raw > 0))
        return;
    const t = capsTier(list, tierReached(g, id)), level = t.caps?.[m];
    if (!level || t.hold?.[m] === false)
        return;
    const p = (relOf(g).people[id] ??= {}), h = (p.held ??= {});
    h[m] = Math.round(Math.min(levelWorth(m, level), (h[m] ?? 0) + raw) * 10000) / 10000;
}
// The next tier is open: what was held comes in through the usual pacing (and past a new cap, is held again).
function release(g, id) {
    const p = relOf(g).people[id], h = p?.held;
    if (!h)
        return;
    delete p.held;
    for (const m of ['f', 'r'])
        if ((h[m] ?? 0) > 0)
            land(g, m, id, YOU, h[m], true);
}
/* ---------- reaching a tier ---------- */
// What a tier writes into the save as it opens: its profile lines (texts replace the earlier ones, likes and limits are
// added to them, a role or drive replaces the old).
function openTier(g, id, t) {
    if (!t.intimate)
        return;
    const p = (relOf(g).people[id] ??= {}), i = (p.intimate ??= {});
    for (const [k, v] of Object.entries(t.intimate)) {
        if (Array.isArray(v))
            i[k] = [...new Set([...(Array.isArray(i[k]) ? i[k] : []), ...v])];
        else if (typeof v === 'string' && v.trim())
            i[k] = v;
    }
}
/** Opens every tier whose turn it is, in order (each needs the one before it and its own condition holding): the save
 *  keeps the highest and its day; each brings a line (once you've met them), life points and the gains held for it.
 *  Nobody's tiers move while you play them. Returns the lines to show. */
export function latchTiers(g, w) {
    if (!anyTiers(w))
        return [];
    const out = [];
    for (const r of Object.values(g.cast ?? {})) {
        const id = idOf(g, r.avatar), list = tiersOf(g, w, id);
        if (!list.length)
            continue;
        let n = tierReached(g, id);
        while (n + 1 < list.length && whenHolds(g, w, list[n + 1].when, { key: `tier|${id}|${n + 1}` })) {
            n++;
            const t = list[n];
            (relOf(g).people[id] ??= {}).tier = { n, day: g.day };
            openTier(g, id, t);
            release(g, id);
            if (r.met)
                out.push(`You and ${r.name} are closer now: ${t.name}.`);
            const paid = milestonePoints(g, w, TIER_POINTS, `tier:${(exOf(g, w, id)?.name ?? r.name).toLowerCase()}:${n}`, `for getting closer to ${r.name}`);
            if (paid)
                out.push(paid);
        }
    }
    return out;
}
export function tierOf(g, w, id) {
    const list = tiersOf(g, w, idOf(g, id));
    if (!list.length)
        return null;
    const st = relOf(g).people[idOf(g, id)]?.tier, n = Math.min(st?.n ?? -1, list.length - 1), next = list[n + 1];
    return { n, day: st?.day, tier: n >= 0 ? list[n] : null, of: list.length, ...(next ? { next, needs: missingWords(g, w, next.when) } : {}) };
}
/* ---------- what each tier lets in ---------- */
// Why a status (or something casual before intimacy opens) isn't allowed now: what opens it in words, or `ever`.
function notYet(g, w, id, status) {
    const list = tiersOf(g, w, id);
    if (!list.length || !w)
        return null;
    const n = tierReached(g, id), want = STATUS_RANK[status] ?? 0;
    // at tier i (reached): its caps allow the status, and something casual has intimacy open there
    const okAt = (i) => {
        const caps = capsTier(list, i).caps;
        return (caps?.status === undefined || want <= STATUS_RANK[caps.status]) && (status !== 'casual' || intimacyAt(list, i) !== null);
    };
    if (okAt(n))
        return null;
    for (let i = n + 1; i < list.length; i++)
        if (i >= 0 && okAt(i))
            return { ever: false, when: missingWords(g, w, list[i].when).join(' and ') };
    return { ever: true, when: '' };
}
// The intimacy needs at tier n: the nearest tier at or below it that has some (undefined: no tier ever says; null: none
// reached yet, not before a later one).
function intimacyAt(list, n) {
    if (!list.some(t => t.intimacy))
        return undefined;
    return [...reachedTiers(list, n)].reverse().find(t => t.intimacy)?.intimacy ?? null;
}
/** Their intimacy needs now (see `tierLink.intimacy`). */
export const intimacyOf = (g, w, id) => { const list = tiersOf(g, w, id); return list.length ? intimacyAt(list, tierReached(g, id)) : undefined; };
/** May they make the move now? Someone with tiers only from one that says so; everyone else as before. */
export function movesNow(g, w, id) {
    const list = tiersOf(g, w, id);
    return !list.length || reachedTiers(list, tierReached(g, id)).some(t => t.moves);
}
/** May they text you invitations now? Someone whose tiers never say (`invites`), always, as anyone; otherwise only from
 *  a tier that says so. */
export function invitesNow(g, w, id) {
    const list = tiersOf(g, w, id);
    return !list.some(t => t.invites) || reachedTiers(list, tierReached(g, id)).some(t => t.invites);
}
/** How many times as often as anyone they text you invitations now: the nearest reached tier's `inviteOdds`, else 1. */
export function inviteOddsNow(g, w, id) {
    return [...reachedTiers(tiersOf(g, w, id), tierReached(g, id))].reverse().find(t => t.inviteOdds)?.inviteOdds ?? 1;
}
// the most any tier of the world says (the invitation rolls' first cut), kept per world
const oddsKept = new WeakMap();
export function inviteOddsMax(w) {
    const list = w?.cast?.examples;
    if (!w || !list?.length)
        return 1;
    let k = oddsKept.get(w);
    if (!k || k.list !== list || k.n !== list.length)
        oddsKept.set(w, k = { list, n: list.length, max: Math.max(1, ...list.flatMap(e => (e.tiers ?? []).map(t => t.inviteOdds ?? 1))) });
    return k.max;
}
/** Their own words for the move's card or for asking you over tonight (`moveLines`, `askLines`): the nearest reached
 *  tier's list (empty: the engine's words). */
export function tierWords(g, w, id, k) {
    return [...reachedTiers(tiersOf(g, w, id), tierReached(g, id))].reverse().find(t => t[k]?.length)?.[k] ?? [];
}
/** May the game put this outfit on them now? An outfit no tier names, always; one a tier names, from that tier. */
export function outfitOpen(g, w, id, outfit) {
    const list = tiersOf(g, w, id), o = outfit.trim().toLowerCase();
    if (!list.some(t => t.outfits?.some(x => x.trim().toLowerCase() === o)))
        return true;
    return reachedTiers(list, tierReached(g, id)).some(t => t.outfits?.some(x => x.trim().toLowerCase() === o));
}
/** Every outfit their tiers have opened so far (for the screens and the data that wires them). */
export const outfitsOpen = (g, w, id) => [...new Set(reachedTiers(tiersOf(g, w, id), tierReached(g, id)).flatMap(t => t.outfits ?? []))];
/* ---------- for the AI ---------- */
/** For the people here (whom you've met), what their tier lets them show now: the tier's `ai` line, or the nearest lower
 *  tier's that has one. Nothing for someone whose first tier hasn't opened. */
export function tierLines(g, w, present) {
    if (!anyTiers(w))
        return [];
    const out = [];
    for (const r of present) {
        const id = idOf(g, r.avatar), list = tiersOf(g, w, id), n = tierReached(g, id);
        if (!list.length || n < 0)
            continue;
        const t = [...reachedTiers(list, n)].reverse().find(x => x.ai?.trim());
        if (t)
            out.push(`How close ${r.name} lets {{user}} come now (${list[Math.min(n, list.length - 1)].name}): ${t.ai.trim().replace(/\s+/g, ' ')}`);
    }
    return out;
}
/* ---------- the hooks ---------- */
const W = (g) => getWorld(g.world);
tierLink.cap = (g, m, x) => capOf(g, W(g), x, m);
tierLink.hold = (g, m, x, raw) => hold(g, W(g), x, m, raw);
tierLink.reserved = (g, x) => isReserved(g, W(g), x);
tierLink.notYet = (g, x, status) => notYet(g, W(g), x, status);
tierLink.intimacy = (g, x) => intimacyOf(g, W(g), x);
tierLink.moves = (g, x) => movesNow(g, W(g), x);
tierLink.outfit = (g, x, o) => outfitOpen(g, W(g), x, o);
tierLink.invites = (g, x) => invitesNow(g, W(g), x);
tierLink.inviteOdds = (g, x) => inviteOddsNow(g, W(g), x);
tierLink.inviteMax = (g) => inviteOddsMax(W(g));
tierLink.words = (g, x, k) => tierWords(g, W(g), x, k);
onHour.push(latchTiers);
onDay.push(latchTiers);
