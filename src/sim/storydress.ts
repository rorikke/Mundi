// Outfits that follow the story: when a reply clearly has someone undress, half-undress, dress again or (where they
// could) change clothes, their sprite follows and the AI is told. After the newest reply, one small quiet AI call is
// told what each person in it has on and what they could be in now, and says which they're in at the end of it. The
// answer is kept on the reply (`extra.mundi_dress`, with the reply's fingerprint, as the emotion read is), so
// swiping, editing or deleting the reply takes it back; the newest answer in the open scene wins while the codes
// (sim/dress.ts) still call for what they did when it was asked, and a settle (leaving, sleeping, a verdict) ends it.
// What someone can be in: what they have on and their own clothes, always; in a private place with adult content on,
// naked, a half-undressed state of what they have on (kind `undressed`, or any outfit whose WearDef.from names it),
// dressing back into what that's a state of, and lingerie (worn under their clothes, or under the outfits its `from`
// names); in public too, a `from` that
// isn't adult and stays within how bold they go in public (a beach shirt taken off); any other outfit only where they
// can change (their own home, or anywhere in a Home). Nothing here changes
// a number; asked only when someone in the reply has a real choice, and never with "Outfits follow the story" off.
import { game, cfg, adultOn, notify, TUT, type Save, type Resident } from '../core/store.js';
import { getWorld, isScenario, systemOn, type WorldDef, type WearDef } from '../core/world.js';
import { quiet, personaName, speakerOf, outfitOf, saveChat, chat, replying } from '../st/bridge.js';
import { openMessages, fpOf, textOf } from './msglog.js';
import { sceneHere, scenePlace } from './homerooms.js';
import { privateScene } from './scenepeople.js';
import { placeOf } from './places.js';
import { tierLink } from './hooks.js';
import { UNDRESSED, codeFor, wearOf, outfitLevel, kindOf, adultWear, levelOf, comfortFor } from './dress.js';

/** Their own clothes (no outfit folder). */
export const OWN = '';
/** One reply's answer: who has what on at its end (`at`), what the codes called for then (`under`), and which of
 *  those outfits are adult (`ad`: dropped if adult content goes off). */
export interface DressRead { fp: string; at: Record<string, string>; under: Record<string, string>; ad?: string[] }

export const storyDressOn = (g: Save) => (cfg(g) as any).storyDress !== false;

/* ---------- the story layer ---------- */

// fingerprints are worked out often (every dress check): kept per message while its text stays the same
const fpCache = new WeakMap<object, { mes: string; fp: string }>();
const fpFor = (m: any): string => {
    const c = fpCache.get(m);
    if (c && c.mes === m.mes) return c.fp;
    const fp = fpOf(m);
    fpCache.set(m, { mes: m.mes, fp });
    return fp;
};
// a read copied onto another swipe or left on an edited reply belongs to other words: none
const readOf = (m: any): DressRead | undefined => {
    const r = m?.extra?.mundi_dress as DressRead | undefined;
    return r && typeof r === 'object' && r.at && r.fp === fpFor(m) ? r : undefined;
};

/** What the story last said someone has on (an outfit's name, OWN for their own clothes), or undefined: it said
 *  nothing about them in this scene, or the codes call for something else than when it did (`under`: what they call
 *  for now, codeFor()). Only the newest answer about them counts. */
export function storyOutfit(g: Save, avatar: string, under: string): string | undefined {
    if (!storyDressOn(g)) return undefined;
    const list = openMessages();
    for (let i = list.length - 1; i >= 0; i--) {
        const r = readOf(list[i]);
        if (!r || !Object.prototype.hasOwnProperty.call(r.at, avatar)) continue;
        if ((r.under?.[avatar] ?? '') !== under) return undefined;
        const o = String(r.at[avatar] ?? '');
        return o && !adultOn(g) && r.ad?.includes(avatar) ? undefined : o;
    }
    return undefined;
}

/* ---------- what someone could be in now ---------- */

interface Option { key: string; label: string; adult: boolean }
/** The outfit folders a card has, and whether it has one by that name (null: still looking). From ui/outfits.ts. */
export interface Have { outfits: (a: string) => string[] | null; has: (a: string, name: string) => boolean | null }

// a card's own folder that's underwear rather than something to change into
const LINGERIE = /lingerie|underwear|\bbra\b|panties|undies|briefs|boxers|negligee/i;
// the outfits one is a state of, as the world says (null: it says nothing)
const fromSet = (d: WearDef | undefined): string[] | null => {
    const f = d?.from;
    // ("own", as the World creator writes it, is their own clothes too)
    return f === undefined || f === null ? null : (Array.isArray(f) ? f : [f]).map(x => String(x ?? '').trim()).map(x => (/^own( clothes)?$/i.test(x) ? OWN : x));
};
// a half-undressed state that says nothing is one of their own clothes
const fromOf = (d: WearDef | undefined): string[] => fromSet(d) ?? [OWN];
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The outfits someone could be in at the end of the next reply, what they have on first. Null: their folders are
 *  still being looked up. */
export function optionsFor(g: Save, w: WorldDef, r: Resident, current: string, have: Have): Option[] | null {
    const a = r.avatar;
    const adult = adultOn(g);
    const privateHere = adult && privateScene(g, w, scenePlace(g, w));
    // where they can change: their own home (wherever they live), or anywhere in a Home, with outfits switched on
    const canChange = isScenario(w) || (systemOn(w, 'dress') && placeOf(g, w, `home:${a}`)?.id === g.player.loc);
    const world = new Map(wearOf(g, w, a));
    const cur = world.get(current), curKind = current === UNDRESSED ? 'naked' : cur ? kindOf(cur.kind) : current && LINGERIE.test(current) ? 'lingerie' : '';
    // naked, half-undressed or in underwear: dressing again partly is possible from there too
    const bare = curKind === 'naked' || curKind === 'undressed' || curKind === 'lingerie';
    // what they have on is a state of (`from`): they can dress back into it (in public, only into what isn't adult)
    const back = curKind === 'undressed' ? fromOf(cur) : fromSet(cur) ?? [];
    // how bold they go in public: a `from` that stays within it (a beach shirt taken off) works anywhere
    const publicLevel = comfortFor(g, w, a);
    const label = (o: string) => o === OWN ? 'own clothes' : o === UNDRESSED ? 'naked' : o;
    const out: Option[] = [];
    const add = (key: string, look: string, ad: boolean) => { if (!out.some(x => same(x.key, key))) out.push({ key, label: `"${label(key)}"${look ? ` (${look})` : ''}`, adult: ad }); };
    add(current, String(cur?.look ?? '').trim(), current === UNDRESSED || (!!cur && adultWear(cur)) || (!cur && !!current && outfitLevel(g, w, a, current) >= 4));
    add(OWN, '', false);
    let looking = false;
    if (privateHere && !same(current, UNDRESSED)) {
        const h = have.has(a, UNDRESSED);
        if (h === null) looking = true; else if (h) add(UNDRESSED, '', true);
    }
    const cards = have.outfits(a);
    if (cards === null && !world.size) looking = true;
    const names = [...new Set([...world.keys(), ...(cards ?? []).filter(o => ![...world.keys()].some(k => same(k, o)))])];
    for (const o of names) {
        if (same(o, current) || same(o, UNDRESSED) || !tierLink.outfit(g, a, o)) continue;
        const d = world.get(o);
        const kind = d ? kindOf(d.kind) : LINGERIE.test(o) ? 'lingerie' : 'costume';
        const ad = d ? adultWear(d) : outfitLevel(g, w, a, o) >= 4;
        if (ad && !adult) continue;
        // (from naked or underwear, only back into a state of their own clothes: what they took off isn't known)
        // Any outfit with a `from` (a sheer robe over a bikini taken off, a rope harness under a robe) is also a state
        // of those outfits, whatever its kind: in private, or anywhere when it isn't adult and stays within how bold
        // they go in public (a beach shirt taken off); and they can dress back into what it's a state of. Lingerie is
        // worn under their own clothes, and also under the outfits its `from` names (long sleeves that could hide it).
        const mild = !ad && (d ? levelOf(d) : outfitLevel(g, w, a, o)) <= publicLevel;
        const ok = kind === 'undressed' ? privateHere && fromOf(d).some(f => same(f, current) || (bare && f === OWN))
            : kind === 'lingerie' ? privateHere && (current === OWN || bare || !!fromSet(d)?.some(f => same(f, current)))
            : canChange || ((privateHere || mild) && !!fromSet(d)?.some(f => same(f, current)));
        if (!ok && (privateHere || !ad) && back.some(f => f && same(f, o))) { add(o, String(d?.look ?? '').trim(), ad); continue; }
        if (ok) add(o, String(d?.look ?? '').trim(), ad);
    }
    return looking && out.length <= 2 ? null : out;
}

/* ---------- asking ---------- */

const pending = new Set<string>();
const tries = new Map<string, number>();
let lastSig: string | null = null;

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (text: string, x: string) => !!x && new RegExp(`(^|[^\\p{L}\\p{N}])${reEsc(x)}([^\\p{L}\\p{N}]|$)`, 'iu').test(text);
// someone the text names: their full name, or their first name when nobody else here shares it
const named = (text: string, name: string, all: string[]) => {
    const n = name.trim(), first = n.split(/\s+/)[0];
    const firstOf = (x: string) => x.trim().split(/\s+/)[0].toLowerCase();
    return word(text, n) || (first !== n && all.filter(x => firstOf(x) === first.toLowerCase()).length === 1 && word(text, first));
};
const clip = (s: string, n: number) => (s.length > n ? `…${s.slice(-n)}` : s);

// Reads one answer line's outfit against someone's options (exact first, then one named inside it, then "dressed").
export function pickOption(answer: string, options: { key: string }[]): string | undefined {
    const x = answer.replace(/\([^)]*\)/g, '').replace(/["“”'`*]/g, '').trim().toLowerCase();
    if (!x) return undefined;
    const keyOf = (o: { key: string }) => (o.key === OWN ? 'own clothes' : o.key === UNDRESSED ? 'naked' : o.key.toLowerCase());
    const exact = options.find(o => keyOf(o) === x);
    if (exact) return exact.key;
    const inside = [...options].sort((p, q) => keyOf(q).length - keyOf(p).length).find(o => o.key !== OWN && x.includes(keyOf(o)));
    if (inside) return inside.key;
    return /\bown\b|clothes|dressed/.test(x) && options.some(o => o.key === OWN) ? OWN : undefined;
}
/** Parses the answer (`Name | outfit` lines) for the people asked: avatar → outfit. */
export function parseAnswer(text: string, people: { avatar: string; name: string; options: { key: string }[] }[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const raw of String(text ?? '').replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').split('\n')) {
        const m = /^\s*[-*•]?\s*([^|\n]+?)\s*[|:]\s*(.+?)\s*$/.exec(raw.replace(/\*\*/g, ''));
        if (!m) continue;
        const who = m[1].trim().toLowerCase();
        const p = people.find(x => x.name.toLowerCase() === who) ?? people.find(x => who.startsWith(x.name.toLowerCase().split(/\s+/)[0]));
        if (!p || p.avatar in out) continue;
        const o = pickOption(m[2], p.options);
        if (o !== undefined) out[p.avatar] = o;
    }
    return out;
}

const SYSTEM = 'You keep track of what people in a story are wearing. You answer only with lines in the given format.';

/** After the chat changed (msglog's reconcile): puts the clothes right when the answers in the scene changed (a reply
 *  swiped away, edited or deleted), and asks about the newest reply when someone in it has a real choice. */
export async function afterReconcile(): Promise<void> {
    const g = game();
    if (!g || TUT.save || replying()) return;
    const w = getWorld(g.world);
    if (!w) return;
    const list = openMessages();
    const sig = list.filter(m => readOf(m)).map(m => fpFor(m)).join(',');
    if (lastSig !== null && sig !== lastSig) void resync();
    lastSig = sig;
    if (!storyDressOn(g)) return;
    const m = list.at(-1);
    if (!m || m.is_user || readOf(m)) return;
    const fp = fpFor(m);
    if (pending.has(fp)) return;
    pending.add(fp);
    try { await ask(g, w, m, fp, list); } finally { pending.delete(fp); }
}

async function ask(g: Save, w: WorldDef, m: any, fp: string, list: any[]) {
    // what they have on now is what the sync just put on (a code's outfit, or an earlier answer's)
    await (await import('./game.js')).syncScene();
    const o = await import('../ui/outfits.js');
    const have: Have = { outfits: o.outfitsOf, has: o.hasOutfit };
    const speaker = speakerOf(m);
    const i = list.indexOf(m);
    const before = list.slice(Math.max(0, i - 2), i);
    const text = [...before, m].map(textOf).join('\n');
    const people: { avatar: string; name: string; current: string; options: Option[] }[] = [];
    let looking = false;
    const here = sceneHere(g, w), all = here.map(r => r.name);
    for (const r of here) {
        if (r.avatar !== speaker && !named(text, r.name, all)) continue;
        const current = outfitOf(r.avatar);
        const options = optionsFor(g, w, r, current, have);
        if (!options) { looking = true; continue; }
        // a choice worth an AI call: something besides what they have on and their own clothes, or dressing again
        // out of something the story put on
        const real = options.some(x => !same(x.key, current) && x.key !== OWN) || (current !== OWN && storyOutfit(g, r.avatar, codeFor(g, w, r.avatar)) !== undefined);
        if (options.length > 1 && real) people.push({ avatar: r.avatar, name: r.name, current, options });
    }
    if (!people.length) {
        // their outfit folders weren't known yet: once more in a moment
        if (looking && (tries.get(`l|${fp}`) ?? 0) < 1) { tries.set(`l|${fp}`, 1); setTimeout(() => { void afterReconcile(); }, 2000); }
        return;
    }
    const me = personaName();
    const nameOf = (x: any) => (x.is_user ? me : g.cast[speakerOf(x) ?? '']?.name ?? String(x.name ?? ''));
    const scene = [...before.map(x => `${nameOf(x)}: ${clip(textOf(x), 1200)}`), `${nameOf(m)}: ${clip(textOf(m), 4000)}`].join('\n\n');
    const prompt = `The latest part of a story:\n\n${scene}\n\n` +
        `For each person below, say what they are wearing at the end of the last part. Keep what they have on now unless the text clearly shows them undressing, getting dressed or changing clothes. Choose only from their list.\n` +
        people.map(p => `${p.name}: now ${p.options[0].label}. Can be: ${p.options.map(x => x.label).join('; ')}.`).join('\n') +
        `\n\nAnswer with one line per person and nothing else: Name | outfit`;
    let answer = '';
    try { answer = await quiet(prompt, 120, SYSTEM); } catch (e) { console.warn('[Mundi] story outfits', e); }
    const at = parseAnswer(answer, people);
    if (!Object.keys(at).length) {
        // no usable answer: tried once more, then left (nothing changes)
        if ((tries.get(fp) ?? 0) < 1) { tries.set(fp, 1); setTimeout(() => { void afterReconcile(); }, 1500); }
        return;
    }
    tries.delete(fp);
    const read: DressRead = { fp, at, under: Object.fromEntries(people.filter(p => p.avatar in at).map(p => [p.avatar, codeFor(g, w, p.avatar)])) };
    const ad = people.filter(p => p.avatar in at && p.options.find(x => x.key === at[p.avatar])?.adult).map(p => p.avatar);
    if (ad.length) read.ad = ad;
    let kept = false;
    for (const x of chat()) if (!x.is_user && !x.is_system && fpFor(x) === fp) { x.extra = { ...(x.extra ?? {}), mundi_dress: read }; kept = true; }
    if (!kept) return;   // the reply is gone already
    saveChat();
    await resync();
}

// Puts on what the story layer says now, and tells the AI.
async function resync() {
    lastSig = openMessages().filter(m => readOf(m)).map(m => fpFor(m)).join(',');
    await (await import('./game.js')).syncScene();
    notify();
}
