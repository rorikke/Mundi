// What people wear in the scene, from the game rather than by hand. Home: a dress code per room ("swimsuit" at the
// pool, "pajamas" in the bedrooms), which each person follows only as far as their comfort goes (their card's, set in
// Library › Expressions with how bold each of their outfits is; never undressed by it). Any world with adult content
// on: the people doing a private action with you (a night at a love hotel, a bath for two) wear their "naked" outfit
// while it plays out. (dress) Any world: a place,
// an action, a street story, a festival or a standing appointment can carry a dress code by kind (`swim`, `yukata`), and the people it covers put on an outfit of
// that kind, chosen by how bold it is (its level, ExampleCharacter.wear) against how bold they go (their comfort:
// in public, or one more in private with someone close); a scripted code sets the level itself. Whoever has an outfit
// with that name (a subfolder of their Expressions folder) wears it; when the code no longer holds for them (another
// room, the action over, gone from the scene) the outfit it put on comes off again. You don't pick what the world's
// people wear: with the dress system on, someone here in an outfit nothing calls for changes back into their own
// clothes. The AI is told what they wear.
import { cfg, state, adultOn, nowAbs, type Save } from '../core/store.js';
import { isScenario, systemOn, type WorldDef, type DressDef, type WearDef, type ExampleCharacter } from '../core/world.js';
import { outfitOf, wearOutfit, charOf } from '../st/bridge.js';
import { tierLink } from './hooks.js';
import { sceneHere } from './homerooms.js';
import { exampleOf, slotAt } from './dayplan.js';
import { festivalsOn } from './festivals.js';
import { placeOf, isHome } from './places.js';
import { whenHolds, personNamed, parseWhen, levelHolds } from './when.js';
import { statusOf, YOU } from './rel.js';

export const dressCodes = (g: Save): Record<string, string> => ((cfg(g) as any).dress ??= {});
// a room's own code; a bedroom (home:…) uses the one set for all the bedrooms
export const dressAt = (g: Save, loc: string) => String(dressCodes(g)[loc] ?? (loc.startsWith('home:') ? dressCodes(g).__bedrooms : '') ?? '').trim();
const dressed = (g: Save): Record<string, string> => (((g as any).dressed ??= {}) as Record<string, string>);
/** The outfit worn during a private action (sim/actions.ts plays it out in the scene). */
export const UNDRESSED = 'naked';

/* ---------- kinds and levels ---------- */

// Words a Home's room code may use for a kind (a code that names none is an outfit's own name, as before)
const KIND_WORDS: Record<string, string> = { swim: 'swim', swimsuit: 'swim', swimsuits: 'swim', swimwear: 'swim', bikini: 'swim', biquini: 'swim', 'maiô': 'swim', 'bañador': 'swim' };
export const kindOf = (code: string) => KIND_WORDS[code.trim().toLowerCase()] ?? code.trim().toLowerCase();
// the folder names a card of someone who isn't one of the world's people may have for a kind
const folderNames = (kind: string) => [...new Set([kind, ...Object.keys(KIND_WORDS).filter(k => KIND_WORDS[k] === kind)])];
export const levelOf = (d: WearDef | undefined) => Math.min(4, Math.max(1, Math.round(Number(d?.level) || 1)));
/** Shown only with adult content on: marked so, or explicit (level 4). */
export const adultWear = (d: WearDef | undefined) => !!d && (d.adult === true || levelOf(d) >= 4);
export const comfortOf = (ex: ExampleCharacter | null | undefined) => Math.min(3, Math.max(1, Math.round(Number(ex?.comfort) || 2)));
const exOf = (g: Save, w: WorldDef, avatar: string) => (g.cast[avatar] ? exampleOf(w, g.cast[avatar]) : null);
// Your own cards (a Home's cast) carry their comfort and how bold each outfit is (`data.extensions.mundi`, Library ›
// Expressions); the world's people have theirs from the world.
const cardDress = (avatar: string) => { const m = charOf(avatar)?.data?.extensions?.mundi ?? {}; return { comfort: m.comfort, wear: (m.wear ?? {}) as Record<string, number | null> }; };
/** How bold someone goes in public (1–3; unset: 2). */
export const comfortFor = (g: Save, w: WorldDef, avatar: string) => { const ex = exOf(g, w, avatar); return comfortOf(ex ?? { comfort: cardDress(avatar).comfort } as ExampleCharacter); };
/** How bold one of their outfits is (1–4): what the world says, else their card; "naked" is explicit; unset: 1. */
export function outfitLevel(g: Save, w: WorldDef, avatar: string, outfit: string): number {
    const o = outfit.trim().toLowerCase();
    if (o === UNDRESSED) return 4;
    const d = exOf(g, w, avatar)?.wear?.[outfit];
    if (d) return levelOf(d);
    const c = Object.entries(cardDress(avatar).wear).find(([k]) => k.toLowerCase() === o)?.[1];
    return levelOf({ kind: '', level: Number(c) || 1 });
}
/** Someone's outfits the world describes, with what each is (only those with a folder). */
export function wearOf(g: Save, w: WorldDef, avatar: string): [string, WearDef][] {
    const ex = exOf(g, w, avatar);
    return Object.entries(ex?.wear ?? {}).filter(([o, d]) => d && typeof d.kind === 'string' && typeof ex?.outfits?.[o] === 'string');
}

/* ---------- what holds for one person ---------- */

/** What someone is to wear now. `code`: an outfit's own name (a Home's room, "naked"), else `kind` chosen by level;
 *  `level`: a scripted level; `explicit`: level 4 may be worn (a private or adult scene with adult content on);
 *  `bump`: a private place and someone close: one level bolder than in public; `room`: a Home's room code, which
 *  nobody follows past their comfort. */
export interface DressNeed { code?: string; kind?: string; level?: number; explicit?: boolean; bump?: boolean; room?: boolean }

type Act = { a?: { private?: boolean; adult?: boolean; tags?: string[]; dress?: DressDef }; place?: string; with?: string[]; priv?: { notes?: { a?: { who?: string[] } } } };
const named = (g: Save, names: string[] | undefined, avatar: string) => !!names?.some(n => personNamed(g, n)?.avatar === avatar);
const closeToYou = (g: Save, w: WorldDef, avatar: string) => !!statusOf(g, avatar, YOU) || levelHolds(g, w, avatar, 'good') || (systemOn(w, 'romance') && levelHolds(g, w, avatar, 'crush'));
// a room of your own, a home, a private place: where someone close goes a level bolder
function privateHere(g: Save, w: WorldDef): boolean {
    const loc = g.player.loc, p = placeOf(g, w, loc) as any;
    return isHome(loc) || !!p?.home || !!p?.private || !!p?.homeZone || !!p?.room;
}
const holds = (g: Save, w: WorldDef, d: DressDef | undefined, key: string): d is DressDef =>
    !!d && typeof d.kind === 'string' && !!d.kind.trim() && whenHolds(g, w, d.when, { place: g.player.loc, key: `dress|${key}` });
function fromCode(g: Save, w: WorldDef, d: DressDef, avatar: string, explicit: boolean): DressNeed {
    const scripted = Number.isFinite(Number(d.level)) && Number(d.level) > 0 && (!d.who?.length || named(g, d.who, avatar));
    return { kind: kindOf(d.kind), ...(scripted ? { level: Math.min(4, Math.max(1, Math.round(Number(d.level)))) } : {}), explicit: explicit && adultOn(g), bump: privateHere(g, w) && closeToYou(g, w, avatar) };
}
// The street story going on here (read from the save as sim/stories.ts keeps it, so this file needs nothing from there)
function storyHere(g: Save, w: WorldDef) {
    const now = (g as any).stories?.now as { id?: string; place?: string; until?: number } | null | undefined;
    const s = now && now.place === g.player.loc && nowAbs(g) < (now.until ?? 0) ? (w.stories ?? []).find(x => x.id === now.id) : undefined;
    return s && (!s.adult || adultOn(g)) ? s : undefined;
}
const storyPeople = (s: { brings?: string; when?: unknown; dress?: DressDef }) =>
    [...(s.dress?.who ?? []), ...(s.brings ? [s.brings] : []), ...parseWhen(typeof s.when === 'string' ? s.when : '').conds.filter(c => c.key === 'present' && !c.not).flatMap(c => c.values)];

/** What one person in the scene is to wear now, or null. A Home's room code; else, with adult content on, the people
 *  taking part in a private action with you undress (or, when it has a dress code, put that on, up to explicit); else
 *  (the `dress` system) an action's code for the people doing it with you, a street story's for the people it names,
 *  a standing appointment's for the people at it here, a festival's for everyone at its places on its days, then the
 *  place's for everyone here. */
export function needFor(g: Save, w: WorldDef, avatar: string): DressNeed | null {
    // (your home: someone close goes a level bolder)
    if (isScenario(w)) { const c = dressAt(g, g.player.loc); return c ? { code: c, room: true, bump: closeToYou(g, w, avatar) } : null; }
    const on = systemOn(w, 'dress');
    const act = (g as any).act as Act | undefined;
    const doing = act?.a && act.place === g.player.loc ? act : undefined;
    // the ones taking part in a private action (sim/private.ts: one or two people ready for it), or, when its check
    // didn't say, everyone doing it with you
    const inPrivate = doing?.a?.private && !doing.a.tags?.includes('pillow-talk') && adultOn(g) && (doing.priv?.notes?.a?.who ?? doing.with)?.includes(avatar);
    if (inPrivate) return on && holds(g, w, doing!.a!.dress, `act|${avatar}`) ? fromCode(g, w, doing!.a!.dress!, avatar, true) : { code: UNDRESSED };
    if (!on) return null;
    if (doing && (doing.with?.includes(avatar) || named(g, doing.a?.dress?.who, avatar)) && holds(g, w, doing.a?.dress, `act|${avatar}`))
        return fromCode(g, w, doing.a!.dress!, avatar, !!doing.a!.adult);
    const s = storyHere(g, w);
    if (s && holds(g, w, s.dress, `story|${s.id}`) && named(g, storyPeople(s), avatar)) return fromCode(g, w, s.dress!, avatar, !!s.adult);
    const r = g.cast[avatar], slot = r ? slotAt(g, w, r, nowAbs(g)) : null;
    if (slot?.kind === 'ritual' && slot.place === g.player.loc && holds(g, w, slot.dress, `ritual|${slot.key ?? avatar}`)) return fromCode(g, w, slot.dress!, avatar, false);
    const f = festivalHere(g, w);
    if (f) return fromCode(g, w, f.dress!, avatar, !!f.adult);
    const p = placeOf(g, w, g.player.loc);
    if (holds(g, w, p?.dress, `place|${p?.id}`)) return fromCode(g, w, p!.dress!, avatar, false);
    return null;
}
// A festival on today at the place you're at whose code holds now
function festivalHere(g: Save, w: WorldDef) {
    const loc = g.player.loc;
    return systemOn(w, 'festivals') ? festivalsOn(g, w).find(f => (f.place === loc || f.places?.includes(loc)) && (!f.adult || adultOn(g)) && holds(g, w, f.dress, `festival|${f.id}`)) : undefined;
}
/** The code for one person here, as a word: an outfit's name or a kind (empty: nothing). */
export function dressFor(g: Save, w: WorldDef, avatar: string): string {
    const n = needFor(g, w, avatar);
    return n?.code ?? n?.kind ?? '';
}

/* ---------- choosing the outfit ---------- */

// The boldest level someone wears for a code: their comfort, one more in private with someone close (never explicit).
const roomAllowed = (g: Save, w: WorldDef, avatar: string, need: DressNeed) => Math.min(3, comfortFor(g, w, avatar) + (need.bump ? 1 : 0));

const H = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
/** Which of their outfits of that kind they put on: a scripted level (the nearest below it they have, else the
 *  nearest above), else the boldest their comfort allows here (explicit only in a private or adult scene), picked
 *  among the boldest three times as often as one level below, the same all day. Adult outfits only with adult content
 *  on; a tier's outfit only from that tier (unless scripted). Undefined: none fits. */
export function chooseWear(g: Save, w: WorldDef, avatar: string, need: DressNeed): string | undefined {
    if (!need.kind) return undefined;
    const list = wearOf(g, w, avatar).filter(([o, d]) => kindOf(d.kind) === need.kind && (!adultWear(d) || adultOn(g)) && (levelOf(d) < 4 || need.explicit)
        && (need.level ? true : tierLink.outfit(g, avatar, o)));
    if (!list.length) return undefined;
    let pool: [string, number][];
    if (need.level) {
        const below = list.filter(([, d]) => levelOf(d) <= need.level!), from = below.length ? below : list;
        const at = below.length ? Math.max(...from.map(([, d]) => levelOf(d))) : Math.min(...from.map(([, d]) => levelOf(d)));
        pool = from.filter(([, d]) => levelOf(d) === at).map(([o]) => [o, 1]);
    } else {
        const allowed = need.explicit ? 4 : roomAllowed(g, w, avatar, need);
        const fit = list.filter(([, d]) => levelOf(d) <= allowed);
        if (!fit.length) return undefined;
        const top = Math.max(...fit.map(([, d]) => levelOf(d)));
        pool = fit.map(([o, d]) => [o, levelOf(d) === top ? 3 : levelOf(d) === top - 1 ? 1 : 0] as [string, number]).filter(([, n]) => n > 0);
    }
    const sum = pool.reduce((a, [, n]) => a + n, 0);
    let x = H(`${g.world}|${g.day}|${avatar}|${need.kind}`) * sum;
    for (const [o, n] of pool) { x -= n; if (x < 0) return o; }
    return pool[pool.length - 1][0];
}

/* ---------- putting it on ---------- */

// Puts on (or takes off) the coded outfit for the people in the scene, and takes it off whoever it was put on who
// isn't here now. `has`: the outfits someone has, given a code (null while still looking: nothing changes yet);
// `ready`: whether one of the world's outfits is in their Expressions yet (false: it's being uploaded, and the scene
// syncs again when it's there).
export function applyDress(g: Save, w: WorldDef, has: (avatar: string, code: string) => string[] | null, ready: (avatar: string, outfit: string) => boolean = () => true): boolean {
    const worn = dressed(g), on = systemOn(w, 'dress'); let changed = false;
    const here = sceneHere(g, w).map(r => r.avatar);
    for (const a of new Set([...here, ...Object.keys(worn)])) {
        if (!g.cast[a]) { delete worn[a]; continue; }
        const need = here.includes(a) ? needFor(g, w, a) : null;
        let match: string | undefined;
        if (need) {
            // a Home's code naming a kind, or a kind: the world's outfits by level first
            const kind = need.kind ?? (need.code && need.code !== UNDRESSED && kindOf(need.code) !== need.code.toLowerCase() ? kindOf(need.code) : undefined);
            const pick = kind ? chooseWear(g, w, a, { ...need, kind }) : undefined;
            if (pick) {
                if (!ready(a, pick)) continue;
                match = pick;
            } else if (kind && wearOf(g, w, a).some(([, d]) => kindOf(d.kind) === kind)) {
                // the world describes their outfits of that kind and none fits here: they keep their clothes
            } else {
                // an outfit's own name (or, for a kind, a folder called like it on a card of someone not the world's)
                const names = need.code ? [need.code] : folderNames(need.kind!);
                let looking = false;
                for (const n of names) {
                    const list = has(a, n.toLowerCase());
                    if (!list) { looking = true; continue; }
                    // ((museum) an outfit someone's tier hasn't opened yet isn't put on)
                    match = list.find(o => o.toLowerCase() === n.toLowerCase() && tierLink.outfit(g, a, o));
                    // a Home's room code: not past their comfort (and so never undressed)
                    if (match && need.room && outfitLevel(g, w, a, match) > roomAllowed(g, w, a, need)) match = undefined;
                    if (match) break;
                }
                if (!match && looking) continue;
            }
        }
        const cur = outfitOf(a);
        if (match) {
            if (cur.toLowerCase() !== match.toLowerCase()) { wearOutfit(a, match); worn[a] = match; delete (state.sprites as any)[a]; changed = true; }
        } else if (worn[a] || (cur && on && here.includes(a))) {
            // what they wear is the game's to say, not yours: with the dress system on, an outfit nothing here calls
            // for (put on by hand, through /costume or the sprite menu of older versions) comes off too
            if (cur && (on || cur.toLowerCase() === worn[a]?.toLowerCase())) { wearOutfit(a, ''); delete (state.sprites as any)[a]; changed = true; }
            delete worn[a];
        }
    }
    return changed;
}

/* ---------- for the AI ---------- */

// the words for a kind the AI is told about (any other: "Dressed for it")
const KIND_LINE: Record<string, string> = { swim: 'In swimwear', yukata: 'In yukata', fencing: 'In fencing whites' };
// What people here wear because of a code: a Home's room; elsewhere each person's outfit in words, and how bold it is
// for them (above their public comfort, explicit, or at ease being looked at).
export function dressLine(g: Save, w: WorldDef): string {
    if (isScenario(w)) {
        const code = dressAt(g, g.player.loc);
        if (!code) return '';
        // who follows it and who keeps their clothes (it's too bold for them, or they have no such outfit)
        const worn = dressed(g), here = sceneHere(g, w), on = here.filter(r => worn[r.avatar] && outfitOf(r.avatar).toLowerCase() === worn[r.avatar].toLowerCase());
        const off = here.filter(r => !on.includes(r));
        return `Dress code in this room: ${code}.${on.length ? ` Wearing it: ${on.map(r => `${r.name} (${worn[r.avatar]})`).join('; ')}.` : ''}${off.length ? ` In their own clothes: ${off.map(r => r.name).join(', ')}.` : ''}`;
    }
    if (!systemOn(w, 'dress')) return '';
    const worn = dressed(g), byKind = new Map<string, string[]>();
    for (const r of sceneHere(g, w)) {
        const o = worn[r.avatar], need = o ? needFor(g, w, r.avatar) : null;
        if (!o || !need?.kind) continue;
        const d = exOf(g, w, r.avatar)?.wear?.[o];
        if (!d) continue;
        const lv = levelOf(d), c = comfortFor(g, w, r.avatar);
        const how = lv >= 4 ? ' (explicit)' : lv > c ? ' (bolder than they wear in public)' : lv >= 3 && c >= 3 ? ' (at ease being looked at)' : '';
        const look = String(d.look ?? '').trim();
        (byKind.get(need.kind) ?? byKind.set(need.kind, []).get(need.kind)!).push(`${r.name}${look ? ` in ${look}` : ''}${how}`);
    }
    const mine = playerKind(g, w);
    if (mine && !byKind.has(mine)) byKind.set(mine, []);
    return [...byKind].map(([k, list]) => `${KIND_LINE[k] ?? 'Dressed for it'}: ${[...list, ...(k === mine ? ['{{user}} too'] : [])].join('; ')}.`).join(' ');
}
// The kind a code puts on you too: the action you're doing, the street story you're in, the place you're at (not a
// festival's or someone's appointment: whether you came in a yukata is yours to say).
function playerKind(g: Save, w: WorldDef): string {
    const act = (g as any).act as Act | undefined;
    if (act?.a && act.place === g.player.loc && holds(g, w, act.a.dress, 'act|you') && !(act.a.private && adultOn(g) && !act.a.dress)) return kindOf(act.a.dress.kind);
    const s = storyHere(g, w);
    if (s && holds(g, w, s.dress, `story|${s.id}`)) return kindOf(s.dress.kind);
    const p = placeOf(g, w, g.player.loc);
    return holds(g, w, p?.dress, `place|${p?.id}`) ? kindOf(p.dress.kind) : '';
}
