// The social network (short posts, like Twitter/X) and the dating app. Posts are written by the AI in one batch
// call; who posts and whether posts get a picture are options in the game settings.
import { romanceBlocked } from './family.js';
import { relOf, idOf, attraction, YOU } from './rel.js';
import { needsOf } from './intimacy.js';
import { scriptText } from '../core/safe.js';
import { nowAbs, settings, saveSettings, adultOn, type Save, type Resident } from '../core/store.js';
import { appsOf, socialKind, aiVoice, systemOn, type WorldDef } from '../core/world.js';
import { ctx, charOf, personaName, sayLine } from '../st/bridge.js';
import { aiLangName } from '../core/i18n.js';
import { hm, weekday } from './time.js';
import { placeOf } from './places.js';
import { whereNow, residents } from './people.js';
import { social, addBond, standsWith, isPartner, bondAtLeast, wordsIn } from './social.js';
import { sharedLikes, likesOf } from './private.js';
import { groupOptions } from './traits.js';
import { levelOf, skillDef } from './hobbies.js';
import { onDay } from './hooks.js';

export interface Reply { by: string; text: string; at: number }          // by: avatar, or 'me'
export interface Post { id: string; by: string; text: string; at: number; likes: number; liked: boolean; reposts: number; replies: Reply[]; image?: string }
export interface Feed { posts: Post[]; last: number }
export function feed(g: Save): Feed {
    const s = social(g) as any;
    const f = (s.feed ??= {}) as Feed;
    f.posts ??= []; f.last ??= 0;
    return f;
}
export type FeedMode = 'button' | 'auto' | 'open' | 'react';
// Default: new posts only when you tap "New posts". (Saves from before had "open" as the default: moved once.)
export const feedPrefs = () => {
    const s = settings() as any; s.social ??= {};
    if (!s.social.v2) { if (!s.social.mode || s.social.mode === 'open') s.social.mode = 'button'; s.social.v2 = true; saveSettings(); }
    s.social.mode ??= 'button'; s.social.images ??= false;
    return s.social as { mode: FeedMode; images: boolean };
};

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const handle = (name: string) => `@${name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')}`;
export const handleOf = (g: Save, by: string) => (by === 'me' ? handle(personaName()) : handle(g.cast[by]?.name ?? '?'));

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
const appTitle = (w: WorldDef) => appsOf(w).find(a => a.id === 'social')?.name ?? 'Chirp';
const header = (g: Save, w: WorldDef) => socialKind(w) === 'board'
    ? `[The ${appTitle(w)} of ${w.name}: people pin short notices, rumors, offers and requests, and others scribble answers below. ${weekday(g.day)}, ${hm(g.minutes)}. Notices and answers are short (one or two sentences), written in ${aiLangName(g.lang)}, ${aiVoice(w)}. An answer replies to the notice above it.]`
    : `[${appTitle(w)}, the Twitter-like social network of ${w.name}. ${weekday(g.day)}, ${hm(g.minutes)}. Posts and replies are short (one or two sentences), written in ${aiLangName(g.lang)}; ${aiVoice(w)}. A reply answers the message right above it.]`;

// A few residents post about their day (one short AI call each, written as the next line of a feed).
export async function generatePosts(g: Save, w: WorldDef, count = 2): Promise<number> {   // two people post at a time
    if (!systemOn(w, 'social')) return 0;
    const now = nowAbs(g);
    const pool = residents(g).sort((a, b) => hash(`${a.avatar}|${now}`) - hash(`${b.avatar}|${now}`)).slice(0, count);
    const f = feed(g);
    const recent = f.posts.slice(0, 3).reverse().map(p => `${p.by === 'me' ? personaName() : g.cast[p.by]?.name ?? '?'} (${handleOf(g, p.by)}) posted: ${p.text}`);
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

// The thread of one post as a transcript (post, then replies in order).
function threadOf(g: Save, w: WorldDef, post: Post, aboutWho: Resident[]) {
    const nameOf = (by: string) => (by === 'me' ? personaName() : g.cast[by]?.name ?? '?');
    return [
        header(g, w),
        ...aboutWho.map(r => `[${r.name}: ${about(r).slice(0, 350)} ${r.met ? `${standsWith(g, r.avatar, r.name, personaName())}.` : `${r.name} does not know ${personaName()} yet.`}]`),
        `${nameOf(post.by)} (${handleOf(g, post.by)}) posted: ${post.text}`,
        ...post.replies.map(x => `${nameOf(x.by)} (${handleOf(g, x.by)}) replied: ${x.text}`),
    ].join('\n');
}

// When to post on their own: "auto" every few game hours (called by the clock), "open" when the app opens.
// "button" (the default) and "react" never post on their own: only the "New posts" button (forced) makes new posts.
export const shouldPost = (g: Save, mode: FeedMode) => feedPrefs().mode === mode && nowAbs(g) - feed(g).last >= (mode === 'auto' ? 180 : 120);

/* ---------- the player posts, likes and replies ---------- */

export async function postAsMe(g: Save, w: WorldDef, text: string) {
    const now = nowAbs(g);
    const post: Post = { id: `m${now}`, by: 'me', text, at: now, likes: 0, liked: false, reposts: 0, replies: [] };
    feed(g).posts.unshift(post);
    // people who know you react, one after the other (each sees the replies before hers)
    const known = residents(g).filter(r => r.met).sort((a, b) => hash(`${a.avatar}${now}`) - hash(`${b.avatar}${now}`)).slice(0, 2);
    post.likes = known.length + hash(text) % 8;
    for (const r of known) {
        const line = await sayLine(threadOf(g, w, post, [r]), `${r.name} (${handle(r.name)}) replied`, [r.name, personaName()], 200, 80);
        if (line) post.replies.push({ by: r.avatar, text: line, at: now + 5 });
    }
    return post;
}

export function toggleLike(g: Save, post: Post) {
    post.liked = !post.liked;
    post.likes += post.liked ? 1 : -1;
    if (post.liked && post.by !== 'me' && g.cast[post.by]?.met) addBond(g, post.by, 1);
}

export async function replyTo(g: Save, w: WorldDef, post: Post, text: string) {
    const now = nowAbs(g);
    post.replies.push({ by: 'me', text, at: now });
    const r = g.cast[post.by];
    if (!r) return;
    if (r.met) addBond(g, r.avatar, 2);
    const line = await sayLine(threadOf(g, w, post, [r]), `${r.name} (${handle(r.name)}) replied`, [r.name, personaName()], 200, 80);
    if (line) post.replies.push({ by: r.avatar, text: line, at: now + 3 });
}

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
// Her profile on the app: who she is, what she looks for and a few interests.
export function theirProfile(g: Save, w: WorldDef, r: Resident) {
    const h = hash(r.avatar);
    const interests = (w.sheet.traits?.find(t => t.id === 'interests')?.options ?? []);
    const own = [interests[h % interests.length], interests[(h >> 3) % interests.length]].filter((x, i, a) => x && a.indexOf(x) === i);
    const kink = kinkInterest(g, w);
    return {
        looking: lookingOf(g, r.avatar),
        interests: kink && likesOf(g, r.avatar).some(l => wordsIn(g, KINK_WORDS, l)) ? [...own, kink] : own,
        bio: about(r).split(/(?<=[.!?])\s/).slice(0, 2).join(' '),
        onApp: h % 10 < 8,
    };
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
        .filter(r => !d.seen[r.avatar] && !isPartner(g, r.avatar) && !romanceBlocked(g, r.avatar) && theirProfile(g, w, r).onApp && attraction(g, r.avatar, YOU, 'r') > 0 && shows(g, d, r));
}
/** The odds (0–75%) that someone likes you back: a long shot with nothing in common (10%). What you both look for,
 *  shared interests (Kink included) and likes in bed you share (adult content), a profile with a few words about you,
 *  and your charm where the world has Charisma; half when one wants a relationship and the other only something casual,
 *  and as much less as they're less drawn to your gender. */
export function matchChance(g: Save, w: WorldDef, avatar: string): number {
    const d = dating(g), r = g.cast[avatar]; if (!r) return 0;
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
