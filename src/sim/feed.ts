// What people post (short posts, or notices on a board in an older world) and the dating app. Posts are written by
// the AI, two at a time, and shown read-only in the news (ui/newsui.ts); who posts when, and whether posts get a
// picture, are options in the game settings.
import { romanceBlocked } from './family.js';
import { relOf, idOf, attraction, YOU } from './rel.js';
import { needsOf } from './intimacy.js';
import { scriptText } from '../core/safe.js';
import { nowAbs, settings, saveSettings, adultOn, type Save, type Resident } from '../core/store.js';
import { socialKind, aiVoice, systemOn, type WorldDef } from '../core/world.js';
import { ctx, charOf, personaName, sayLine, quiet } from '../st/bridge.js';
import { exampleOf } from './dayplan.js';
import type { PhotoRec } from './photo.js';
import { aiLangName } from '../core/i18n.js';
import { hm, weekday } from './time.js';
import { placeOf } from './places.js';
import { whereNow, residents } from './people.js';
import { social, isPartner, bondAtLeast, wordsIn } from './social.js';
import { sharedLikes, likesOf } from './private.js';
import { groupOptions } from './traits.js';
import { levelOf, skillDef } from './hobbies.js';
import { onDay, tierLink } from './hooks.js';

export interface Reply { by: string; text: string; at: number }          // by: avatar, or 'me'
export interface Post { id: string; by: string; text: string; at: number; likes: number; liked: boolean; reposts: number; replies: Reply[]; image?: string }
export interface Feed { posts: Post[]; last: number }
export function feed(g: Save): Feed {
    const s = social(g) as any;
    const f = (s.feed ??= {}) as Feed;
    f.posts ??= []; f.last ??= 0;
    return f;
}
export type FeedMode = 'button' | 'auto' | 'open';
// Default: new posts only when you tap "More news". (Saves from before had "open" as the default: moved once. "Only
// you post; they reply" went with posting: it is the default now.)
export const feedPrefs = () => {
    const s = settings() as any; s.social ??= {};
    if (!s.social.v2) { if (!s.social.mode || s.social.mode === 'open') s.social.mode = 'button'; s.social.v2 = true; saveSettings(); }
    if (s.social.mode === 'react') s.social.mode = 'button';
    s.social.mode ??= 'button'; s.social.images ??= false;
    return s.social as { mode: FeedMode; images: boolean };
};

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const handle = (name: string) => `@${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')}`;

const about = (r: Resident) => String(charOf(r.avatar)?.description ?? '').replace(/{{char}}/g, r.name).replace(/{{user}}/g, personaName()).slice(0, 500);

/* ---------- characters post ---------- */

async function picture(prompt: string): Promise<string | undefined> {
    if (!feedPrefs().images) return undefined;
    try {
        const r = await ctx().executeSlashCommandsWithOptions(`/sd quiet=true ${scriptText(prompt.replace(/\|/g, ' '))}`);
        const url = String(r?.pipe ?? '').trim();
        return url && !url.startsWith('Error') ? url : undefined;
    } catch { return undefined; }
}

// The feed as the AI sees it: a social network or a notice board (the world's socialKind), in the world's voice.
const appTitle = (w: WorldDef) => (socialKind(w) === 'board' ? 'notice board' : 'Chirp');   // (the network's name, for the AI only)
const header = (g: Save, w: WorldDef) => socialKind(w) === 'board'
    ? `[The ${appTitle(w)} of ${w.name}: people pin short notices, rumors, offers and requests, and others scribble answers below. ${weekday(g.day)}, ${hm(g.minutes)}. Notices and answers are short (one or two sentences), written in ${aiLangName(g.lang)}, ${aiVoice(w)}. An answer replies to the notice above it.]`
    : `[${appTitle(w)}, the Twitter-like social network of ${w.name}. ${weekday(g.day)}, ${hm(g.minutes)}. Posts and replies are short (one or two sentences), written in ${aiLangName(g.lang)}; ${aiVoice(w)}. A reply answers the message right above it.]`;

// A few residents post about their day (one short AI call each, written as the next line of a feed).
export async function generatePosts(g: Save, w: WorldDef, count = 2): Promise<number> {   // two people post at a time
    if (!systemOn(w, 'social')) return 0;
    const now = nowAbs(g);
    const pool = residents(g).sort((a, b) => hash(`${a.avatar}|${now}`) - hash(`${b.avatar}|${now}`)).slice(0, count);
    const f = feed(g);
    const recent = f.posts.slice(0, 3).reverse().map(p => `${p.by === 'me' ? personaName() : g.cast[p.by]?.name ?? '?'} (${handle(p.by === 'me' ? personaName() : g.cast[p.by]?.name ?? '?')}) posted: ${p.text}`);
    let n = 0;
    for (const r of pool) {
        const transcript = [header(g, w), `[${r.name}: ${about(r)} Right now at ${placeOf(g, w, whereNow(g, w, r))?.name ?? 'home'}.]`, ...recent].join('\n');
        const text = await sayLine(transcript, `${r.name} (${handle(r.name)}) posted`, [r.name], 240, 90);
        if (!text) continue;
        const image = hash(text) % 3 === 0 ? await picture(`${r.name}: ${text}`) : undefined;
        f.posts.unshift({ id: `p${now}${n}`, by: r.avatar, text, at: now - (pool.length - n) * 7, likes: 3 + hash(text) % 60, liked: false, reposts: hash(text) % 6, replies: [], image });
        recent.push(`${r.name} (${handle(r.name)}) posted: ${text}`);
        n++;
    }
    f.last = now;
    if (f.posts.length > 80) f.posts.length = 80;
    return n;
}

// When to post on their own: "auto" every few game hours (called by the clock), "open" when Messages opens.
// "button" (the default) never posts on its own: only "More news" (forced) makes new posts.
export const shouldPost = (g: Save, mode: FeedMode) => feedPrefs().mode === mode && nowAbs(g) - feed(g).last >= (mode === 'auto' ? 180 : 120);

/* ---------- dating ---------- */

export const LOOKING = ['A relationship', 'Something casual', 'Friendship', 'Not sure yet'];
/** `show`: the genders whose profiles you see (gender ids; missing: the ones you're drawn to). */
export interface DatingProfile { bio: string; looking: string[]; interests: string[]; ready: boolean; show?: string[] }
/** `waiting`: likes not answered yet: who → the day the answer comes and what it is (decided when you liked them). */
export interface Dating { profile: DatingProfile; seen: Record<string, 'like' | 'pass'>; matches: string[]; waiting: Record<string, { day: number; yes: boolean }>;
    /** matches that came while the app was closed, shown with "It's a match!" when it's opened */ news: string[] }
export function dating(g: Save): Dating {
    const s = social(g) as any;
    const d = (s.dating ??= {}) as Dating;
    d.profile ??= { bio: '', looking: [], interests: [...(g.player.traits?.interests ?? [])], ready: false };
    d.seen ??= {}; d.matches ??= []; d.waiting ??= {}; d.news ??= [];
    return d;
}
// What someone looks for on the app: set for them, else from how they are about intimacy (only with a partner: a
// relationship; a free spirit: something casual), else fixed per person.
export function lookingOf(g: Save, avatar: string): string {
    const set = relOf(g).people[idOf(g, avatar)]?.looking;
    if (set && LOOKING.includes(set)) return set;
    const n = needsOf(g, avatar);
    if (n.partnerOnly) return 'A relationship';
    if (n.preset === 'free') return 'Something casual';
    return LOOKING[hash(avatar) % LOOKING.length];
}
// (adult, design 3d) The adult interest (Kink) is someone's when their likes in bed mention what it covers, so a match on
// it means something: it shows on their card and counts as a shared interest like the others.
export const KINK_WORDS = ['rope', 'tied', 'tied up', 'shibari', 'bondage', 'cuffs', 'restraints', 'spanking', 'spanked', 'paddle', 'flogger', 'orders', 'being led', 'pinned down', 'blindfold', 'edging', 'wax', 'collar'];
// The interests a player can pick on the app (adult options with adult content on).
export const appInterests = (g: Save, w: WorldDef): string[] => { const t = w.sheet.traits?.find(x => x.id === 'interests'); return t ? groupOptions(g, t) : []; };
// The world's adult interest named Kink, with adult content on.
export const kinkInterest = (g: Save, w: WorldDef): string => (adultOn(g) ? appInterests(g, w).find(o => /kink/i.test(o) && !(w.sheet.traits?.find(x => x.id === 'interests')?.options ?? []).includes(o)) ?? '' : '');
/** The questions a profile can answer (DatingCard.prompts' `q`, word for word: the interface translates them). */
export const DATING_PROMPTS = ['My ideal Sunday', 'A perfect first date', "I'm looking for someone who", 'The way to win me over', 'My most unpopular opinion',
    "I'll know it's going well when", 'Two truths and a lie', "Don't hate me if I", 'My simple pleasures', 'I get way too excited about', 'Typical Friday night', 'Green flags'];
type Written = { bio: string; prompts: { q: string; a: string }[] };
// What the AI wrote for someone the world has no profile for (card people, newcomers): kept in the save, so it's
// written once. `failed`: asked this session and it didn't answer (asked again next session).
const writtenOf = (g: Save): Record<string, Written> => ((dating(g) as any).written ??= {});
const failed = new Set<string>(), writing = new Set<string>();
const cleanPrompts = (list: unknown): { q: string; a: string }[] => (Array.isArray(list) ? list : [])
    .filter((p: any) => p && DATING_PROMPTS.includes(p.q) && String(p.a ?? '').trim()).map((p: any) => ({ q: p.q, a: String(p.a).trim() })).slice(0, 3);
// Her profile on the app: what she looks for, a few interests, and what she wrote: the world's own words for her, else
// what the AI wrote (empty until it has: `pending` while nothing is written and it can still be asked), and her age.
export function theirProfile(g: Save, w: WorldDef, r: Resident) {
    const h = hash(r.avatar);
    const interests = (w.sheet.traits?.find(t => t.id === 'interests')?.options ?? []);
    const own = [interests[h % interests.length], interests[(h >> 3) % interests.length]].filter((x, i, a) => x && a.indexOf(x) === i);
    const kink = kinkInterest(g, w);
    const ex = exampleOf(w, r), card = ex?.dating, kept = writtenOf(g)[r.avatar];
    const bio = String(card?.bio ?? kept?.bio ?? '').trim();
    return {
        looking: lookingOf(g, r.avatar),
        interests: kink && likesOf(g, r.avatar).some(l => wordsIn(g, KINK_WORDS, l)) ? [...own, kink] : own,
        bio, prompts: cleanPrompts(card?.prompts ?? kept?.prompts),
        age: relOf(g).people[idOf(g, r.avatar)]?.age ?? ex?.age,   // (a save's own, else the world's)
        pending: !bio && !failed.has(r.avatar),
        onApp: h % 10 < 8,
    };
}
// Asks the AI once for the profile of someone the world wrote none for, in their own words (a matchmaker's in a world
// with notice boards instead of a feed). True when something was written.
export async function writeProfile(g: Save, w: WorldDef, r: Resident): Promise<boolean> {
    if (exampleOf(w, r)?.dating?.bio || writtenOf(g)[r.avatar] || failed.has(r.avatar) || writing.has(r.avatar)) return false;
    writing.add(r.avatar);
    const old = socialKind(w) === 'board';
    const prompt = old
        ? `${r.name}: ${about(r)}\n\nIn ${w.name}, a matchmaker introduces people. Write what the matchmaker tells someone about ${r.name}: two or three warm, slightly gossipy sentences in ${aiLangName(g.lang)}, ${aiVoice(w)}, with one telling detail and what ${r.name} hopes for. Not a record: no surname, age or trade. Nothing ${r.name} keeps secret.\n\nReply with one line:\nBIO: <the words>`
        : `${r.name}: ${about(r)}\n\nWrite ${r.name}'s profile on a dating app, as ${r.name} would really write it: in their own voice, in ${aiLangName(g.lang)}, one to three sentences, concrete and specific, in their own style (lowercase, emoji, dry, terse or chatty, as fits them). Never their surname, age, job title or workplace by name, never their looks, nothing they keep secret, no dating-app clichés. Then answer one or two of these questions in their voice, each under 15 words: ${DATING_PROMPTS.join('; ')}.\n\nReply in exactly this format, nothing else:\nBIO: <the bio>\nQ: <a question, word for word>\nA: <the answer>`;
    try {
        const out = await quiet(prompt, 300, 'You write short in-character text in the exact format asked, nothing else.');
        const line = (k: string) => out.split('\n').map(l => l.trim()).filter(l => l.toUpperCase().startsWith(`${k}:`)).map(l => l.slice(k.length + 1).trim().replace(/^["“]|["”]$/g, ''));
        const bio = line('BIO')[0]?.slice(0, 400) ?? '';
        if (!bio) { failed.add(r.avatar); return false; }
        const qs = line('Q'), as = line('A');
        writtenOf(g)[r.avatar] = { bio, prompts: old ? [] : cleanPrompts(qs.map((q, i) => ({ q: DATING_PROMPTS.find(p => p.toLowerCase() === q.toLowerCase().replace(/[:?.]+$/, '')) ?? '', a: (as[i] ?? '').slice(0, 160) }))) };
        return true;
    } catch { failed.add(r.avatar); return false; }
    finally { writing.delete(r.avatar); }
}
/** The photos on someone's profile, as Lens records (ui/photoui.ts draws them): the world's DatingCard photos whose
 *  place and outfit exist (an adult outfit only with adult content on); none without sprites (the portrait then). */
export function profilePhotos(g: Save, w: WorldDef, r: Resident): PhotoRec[] {
    const ex = exampleOf(w, r); if (!ex?.sprites) return [];
    return (ex.dating?.photos ?? []).filter(p => {
        if (!w.places.some(x => x.id === p.place)) return false;
        if (!p.outfit) return true;
        const wear = ex.wear?.[p.outfit];
        return p.outfit !== 'naked' && !!ex.outfits?.[p.outfit] && (adultOn(g) || !(wear?.adult || (wear?.level ?? 1) >= 4));
    }).slice(0, 6).map((p, i) => ({ id: -1 - i, day: g.day, min: 0, src: 'spot', place: p.place, slot: p.slot ?? 'day', looks: [], who: [{ name: ex.name, expr: p.expr || 'joy', ...(p.outfit ? { outfit: p.outfit } : {}) }],
        frame: [50, 40, 1], look: 'phone', cap: '' }));
}
// The genders the app shows you: the ones you chose on your profile, else the ones you're drawn to.
function shows(g: Save, d: Dating, r: Resident): boolean {
    const show = d.profile.show;
    if (!show?.length) return attraction(g, YOU, r.avatar, 'r') > 0;
    const theirs = relOf(g).people[idOf(g, r.avatar)]?.gender;
    return !theirs || show.includes(theirs);
}
// Who the app shows: never someone not attracted to your gender, nor someone of a gender you didn't ask to see; the ones
// of the genders you're most attracted to first.
export function candidates(g: Save, w: WorldDef): Resident[] {
    const d = dating(g);
    // a random order, the same until the app is opened again (so the card on screen does not jump)
    const seed = String((d as any).seed ??= Math.random().toString(36).slice(2));
    const mine = (r: Resident) => attraction(g, YOU, r.avatar, 'r');
    return residents(g).sort((a, b) => mine(b) - mine(a) || hash(`${seed}|${a.avatar}`) - hash(`${seed}|${b.avatar}`))
        .filter(r => !d.seen[r.avatar] && !isPartner(g, r.avatar) && !romanceBlocked(g, r.avatar) && !tierLink.reserved(g, r.avatar) && theirProfile(g, w, r).onApp && attraction(g, r.avatar, YOU, 'r') > 0 && shows(g, d, r));   // ((museum) someone reserved isn't on the app)
}
/** The odds (0–75%) that someone likes you back: a long shot with nothing in common (10%). What you both look for,
 *  shared interests (Kink included) and likes in bed you share (adult content), a profile with a few words about you,
 *  and your charm where the world has Charisma; half when one wants a relationship and the other only something casual,
 *  and as much less as they're less drawn to your gender. */
export function matchChance(g: Save, w: WorldDef, avatar: string): number {
    const d = dating(g), r = g.cast[avatar]; if (!r || tierLink.reserved(g, avatar)) return 0;
    const p = theirProfile(g, w, r), mine = d.profile.looking;
    let chance = 10;
    if (mine.includes(p.looking)) chance += 15;
    chance += 8 * Math.min(3, p.interests.filter(i => d.profile.interests.includes(i)).length) + 5 * Math.min(2, sharedLikes(g, avatar).length);
    if (d.profile.bio.trim().length >= 40) chance += 5;
    if (skillDef(w, 'charisma')) chance += Math.min(10, 2 * levelOf(g, 'charisma'));
    const only = (x: string) => mine.length > 0 && mine.every(m => m === x);
    if ((p.looking === 'A relationship' && only('Something casual')) || (p.looking === 'Something casual' && only('A relationship'))) chance *= 0.5;
    chance *= attraction(g, avatar, YOU, 'r');   // less attracted to your gender: fewer matches
    return Math.max(0, Math.min(75, Math.round(chance)));
}
/** Days a like waits for its answer, yes or no (from, to). */
export const ANSWER_DAYS = [1, 4];
// A like is answered a few days later: a match, or nothing at all (some people never like you back). The answer is
// decided now, so nothing done in between can turn it; true when it will be a match.
export function swipe(g: Save, w: WorldDef, avatar: string, like: boolean): boolean {
    const d = dating(g);
    d.seen[avatar] = like ? 'like' : 'pass';
    if (!like || !g.cast[avatar]) return false;
    const yes = hash(`${avatar}|${g.day}|${d.profile.bio.length}`) % 100 < matchChance(g, w, avatar);
    const [lo, hi] = ANSWER_DAYS;
    d.waiting[avatar] = { day: g.day + lo + (hash(`${avatar}|answer|${g.day}`) % (hi - lo + 1)), yes };
    return yes;
}
/** A match: they're a contact now (Messages and People), with a little friendship to start from. */
function matchWith(g: Save, d: Dating, avatar: string) {
    if (!d.matches.includes(avatar)) d.matches.push(avatar);
    g.cast[avatar].met = true;
    bondAtLeast(g, avatar, 10);
}
/** Likes still waiting for an answer. */
export const waitingCount = (g: Save): number => Object.keys(dating(g).waiting).length;
// Each morning the likes whose day has come are answered: a match is told, a no is never said.
onDay.push((g) => {
    const s = (g as any).social?.dating as Dating | undefined;
    if (!s?.waiting || !Object.keys(s.waiting).length) return [];
    const d = dating(g), out: string[] = [];
    for (const [avatar, x] of Object.entries(d.waiting)) {
        if (x.day > g.day) continue;
        delete d.waiting[avatar];
        if (!x.yes || !g.cast[avatar] || isPartner(g, avatar) || romanceBlocked(g, avatar)) continue;
        matchWith(g, d, avatar); d.news.push(avatar);
        out.push(`Spark: ${g.cast[avatar].name} liked you back. It's a match!`);
    }
    return out;
});
