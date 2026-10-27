// Playing as someone else ("Play as"). You take that person's place; the one you were becomes a person of the world
// (with a card of their own, created once) and stays with you as company.
// Shared by everyone you play: the needs (energy, mood…) and the money. Each person has their own: approval,
// feelings, texts, plans, dating, diary and job (their "seat", swapped in and out). Friendship, romance and couples
// live in the relationships store (sim/rel.ts), where `'__you'` is whoever you play: switching rewrites its ids like
// the ties'. While you play someone their own feelings are frozen; when you leave them, a per-save setting decides
// whether they now feel about each person what that person came to feel about them (default) or keep what they felt.
import { nowAbs } from '../core/store.js';
import { charOf, avatarUrl, createPersona, createCharacter, usePersona, persona, personaName, personas } from '../st/bridge.js';
import { whereNow } from './people.js';
import { ties, normalizeHomes } from './living.js';
import { fr, ro, setFr, setRo, swapIds, relCfg, attracted } from './rel.js';
import { familyBlocked } from './family.js';
import { note } from './facts.js';
import { resident } from './game.js';
import { verdictNow } from './verdict.js';
const ORIG = '__orig';
export const swapOf = (g) => (g.swap ?? null);
const ensure = (g) => (g.swap ??= { avatar: '', orig: persona(), origName: personaName(), files: {} });
// The person of the world who is you right now (left out of the scene and of "who is here").
export const selfAvatar = (g) => { const s = swapOf(g); return s ? (s.avatar || s.origCard || '') : ''; };
export const roster = (g) => (ensure(g).roster ??= []);
export const playing = (g) => swapOf(g)?.avatar ?? '';
/* ---------- each one's own view of the world ---------- */
function takeOut(g) {
    const x = g;
    x.living ??= {};
    return { social: x.social ?? {}, approval: x.living.approval ?? {}, journalProse: x.journalProse ?? {}, journalProseTr: x.journalProseTr ?? {} };
}
function putIn(g, p) {
    const x = g;
    x.living ??= {};
    x.social = p.social;
    x.living.approval = p.approval;
    x.journalProse = p.journalProse;
    x.journalProseTr = p.journalProseTr;
}
// Someone played for the first time: a seat of their own (texts, plans, approval…). How people feel about them, and
// how they feel about others, is already in the store.
const fresh = () => ({ social: { threads: {}, unread: {}, appts: [], with: [] }, approval: {}, journalProse: {}, journalProseTr: {} });
// The one you leave becomes a person again. "Copy" (default): they now feel about each person what that person came to
// feel about them, friendship and romance (not romance they can't feel: family, minors), without the pacing weight; a
// one-off copy, after which both directions move on their own. "Keep": their feelings stay as they were.
function feelingsOfLeft(g, left) {
    if (relCfg(g).playAs === 'keep')
        return;
    for (const x of Object.keys(g.cast)) {
        if (x === left)
            continue;
        setFr(g, left, x, fr(g, x, left));
        if (!familyBlocked(g, left, x) && attracted(g, left, x))
            setRo(g, left, x, ro(g, x, left)); // never a romance they can't feel
    }
}
/* ---------- your original character, as a person of the world ---------- */
async function origCardOf(g, w, s) {
    if (s.origCard && g.cast[s.origCard] && charOf(s.origCard))
        return s.origCard;
    const row = personas().find(p => p.file === s.orig);
    let img;
    try {
        img = await (await fetch(`/User Avatars/${encodeURIComponent(s.orig)}`)).blob();
    }
    catch { /* no picture */ }
    const avatar = await createCharacter({ name: s.origName, description: String(row?.description ?? `${s.origName}.`).replace(/\{\{user\}\}/g, s.origName),
        tags: ['Mundi'], extensions: { mundi: { world: w.id, player: true } } }, img);
    const base = resident(w, avatar, new Set());
    g.cast[avatar] = { ...base, name: s.origName, home: { ...g.player.home }, met: true };
    g.cast[avatar].homeWith = '__you';
    s.origCard = avatar;
    return avatar;
}
/* ---------- switching ---------- */
// Switch to `target` (an avatar of the world, or '' for your original character).
export async function switchTo(g, w, target) {
    const s = ensure(g);
    if (!s.avatar) {
        s.orig = s.orig || persona();
        s.origName = s.origName || personaName();
    }
    const fromKey = s.avatar || ORIG, toKey = target || ORIG;
    if (fromKey === toKey)
        return '';
    if (target && !charOf(target))
        throw new Error('That character is not in SillyTavern anymore.');
    // switching ends the scene for the person you leave: it's judged (toward them) and its records settle before the
    // ids are rewritten
    await verdictNow(g, w, 'Play as', { end: true });
    // an event or a night over ends when you leave the person you are
    const soc = g.social ?? {};
    soc.event = null;
    soc.stay = null;
    soc.solo = '';
    const origCard = await origCardOf(g, w, s);
    const fromCard = s.avatar || origCard, toCard = target || origCard;
    const fromName = personaName();
    const toPerson = target ? g.cast[target] : g.cast[origCard];
    const where = toPerson ? whereNow(g, w, toPerson) : g.player.loc;
    const here = g.player.loc;
    // keep what is yours, take what is theirs
    s.persp ??= {};
    s.jobs ??= {};
    const mine = takeOut(g);
    const wasWithMe = (mine.social.with ?? []).some((c) => c.avatar === toCard);
    s.persp[fromKey] = mine;
    s.jobs[fromKey] = g.player.job ?? null;
    const theirs = s.persp[toKey] ?? fresh();
    delete s.persp[toKey];
    putIn(g, theirs);
    g.player.job = s.jobs[toKey] ?? null;
    // the household follows who you play: you live in their home; the one you were keeps theirs (and their family)
    s.homes ??= {};
    s.homes[fromKey] = { ...g.player.home };
    const fromRes = g.cast[fromCard];
    if (fromRes)
        fromRes.home = { ...g.player.home };
    const newHome = toKey === ORIG ? (s.homes[ORIG] ?? g.cast[origCard]?.home) : g.cast[target]?.home;
    const swapId = (v) => (v === '__you' ? fromCard : v === toCard ? '__you' : v);
    for (const r of Object.values(g.cast)) {
        const x = r;
        if (x.homeWith)
            x.homeWith = swapId(x.homeWith);
    }
    if (fromRes && (fromRes.homeWith === fromCard || fromRes.homeWith === '__you'))
        delete fromRes.homeWith; // the head of their own home
    for (const t of ties(g)) {
        t.a = swapId(t.a);
        t.b = swapId(t.b);
    }
    swapIds(g, swapId);
    if (newHome)
        g.player.home = { ...newHome, kind: w.homes.zones.find(z => z.id === newHome.zone)?.kind ?? g.player.home.kind };
    normalizeHomes(g);
    // the persona
    let file = target ? s.files[target] : s.orig;
    if (target && !file) {
        const ch = charOf(target);
        const img = await (await fetch(avatarUrl(target))).blob();
        file = await createPersona(ch.name, String(ch.description ?? '').replace(/\{\{char\}\}/g, ch.name), img);
        s.files[target] = file;
    }
    await usePersona(file);
    s.avatar = target;
    feelingsOfLeft(g, fromCard);
    // you take their place (and go where they are); the one you were stays with you only if they were your company
    g.player.loc = where || g.player.loc;
    const soc2 = g.social;
    soc2.with = (soc2.with ?? []).filter((c) => c.avatar !== toCard && c.avatar !== fromCard);
    s.left ??= {};
    delete s.left[toCard];
    if (wasWithMe)
        soc2.with.push({ avatar: fromCard, until: nowAbs(g) + 180 });
    else
        s.left[fromCard] = { loc: here, until: nowAbs(g) + 240 };
    const toName = target ? g.cast[target]?.name ?? charOf(target)?.name ?? '' : s.origName;
    note(g, '{u} took over from {0} for a while.', [fromName], [fromCard]);
    return toName;
}
