// (E16) Starts: who you are when a game begins. A world has ready-made ones (older worlds' origins became starts in
// upgradeWorld()); the player can write a custom one at the new game and keep it for that world's next games ("Save
// as a start", in Mundi's settings; Library → Starts). A start gives the home area, money, maybe a job, the traits and
// skill levels you begin with, the premise the AI is told, and the people you already know (by name, with starting
// feelings or as family). Applied once, by the new game.
import { settings, saveSettings, adultOk, type Save } from '../core/store.js';
import { systemOn, exampleTag, type WorldDef, type StartDef, type StartKnown } from '../core/world.js';
import { FRIEND_LEVELS, ROM_LEVELS, FAMILY_TYPES } from '../core/feel.js';
import { charOf } from '../st/bridge.js';
import { applyStartFeel, addOldTie } from './startfeel.js';
import { liveTogether } from './living.js';
import { hobbyXp, LEVELS, MAX_LEVEL } from './hobbies.js';
import { YOU } from './rel.js';

export const CUSTOM_START = 'custom';
/** The world's own starts (for this save's adult setting when one is given). */
export const worldStarts = (w: WorldDef, adult = false): StartDef[] => (w.starts ?? []).filter(s => adult || !s.adult);
/** The starts the player saved for this world. */
export const savedStarts = (worldId: string): StartDef[] => { const all = (settings().starts ??= {}); return (all[worldId] ??= []); };
export const defaultStart = (w: WorldDef, adult = false): StartDef | undefined => { const l = worldStarts(w, adult); return l.find(s => s.default) ?? l[0]; };
export const findStart = (w: WorldDef, id: string | undefined, adult = false): StartDef | undefined =>
    (id ? worldStarts(w, adult).find(s => s.id === id) ?? savedStarts(w.id).find(s => s.id === id) : undefined);

const STATUSES = ['casual', 'dating', 'engaged', 'married'];
const line = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// A start from a draft or a settings file, checked field by field (what isn't understood is dropped).
export function cleanStart(raw: any): StartDef | null {
    if (!raw || typeof raw !== 'object') return null;
    const s: StartDef = { id: line(raw.id, 60) || `my${Date.now().toString(36)}`, name: line(raw.name, 60) || 'My start', premise: line(raw.premise, 4000) };
    const desc = line(raw.desc, 300); if (desc) s.desc = desc;
    const home = line(raw.home, 80); if (home) s.home = home;
    if (Number.isFinite(Number(raw.money)) && raw.money !== '' && raw.money !== null) s.money = Math.max(0, Math.round(Number(raw.money)));
    const job = line(raw.job, 80); if (job) s.job = job;
    const household = line(raw.household, 80); if (household) s.household = household;
    const knows = (Array.isArray(raw.knows) ? raw.knows : []).map(cleanKnown).filter(Boolean) as StartKnown[];
    if (knows.length) s.knows = knows.slice(0, 40);
    const traits = (Array.isArray(raw.traits) ? raw.traits : []).map((t: unknown) => line(t, 60)).filter(Boolean);
    if (traits.length) s.traits = traits.slice(0, 20);
    const skills = Object.entries(raw.skills ?? {}).filter(([k, v]) => k && Number.isFinite(Number(v))).map(([k, v]) => [k.slice(0, 40), Math.max(0, Math.min(MAX_LEVEL, Math.round(Number(v))))]);
    if (skills.length) s.skills = Object.fromEntries(skills);
    if (raw.adult === true) s.adult = true;
    return s;
}
function cleanKnown(raw: any): StartKnown | null {
    const name = line(raw?.name, 80); if (!name) return null;
    const k: StartKnown = { name };
    if (FRIEND_LEVELS.includes(raw.f)) k.f = raw.f;
    if (ROM_LEVELS.includes(raw.r) && raw.r !== 'none') k.r = raw.r;
    if (STATUSES.includes(raw.status)) k.status = raw.status;
    else if (raw.was === 'ex' || STATUSES.includes(raw.was)) k.was = raw.was;
    if ((FAMILY_TYPES as string[]).includes(raw.family)) k.family = raw.family;
    return k;
}
/** Keeps a custom start for this world's next games (a start with the same id is replaced). */
export function saveStart(worldId: string, raw: any): StartDef | null {
    const s = cleanStart(raw); if (!s) return null;
    const list = savedStarts(worldId); const i = list.findIndex(x => x.id === s.id);
    if (i >= 0) list.splice(i, 1, s); else list.push(s);
    saveSettings();
    return s;
}
export function deleteStart(worldId: string, id: string) {
    const all = (settings().starts ??= {});
    all[worldId] = (all[worldId] ?? []).filter(s => s.id !== id);
    if (!all[worldId].length) delete all[worldId];
    saveSettings();
}

/* ---------- at the new game ---------- */

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
// The card of one of the world's people in this save, by full name or first name (accents and case ignored; a full
// name wins); people from the player's own cards only when no world person has that name.
export function knownAvatar(g: Save, w: WorldDef, name: string): string | undefined {
    const n = plain(name), all = Object.values(g.cast);
    const ours = all.filter(r => w.cast.examples.some(e => exampleTag(w, e) === charOf(r.avatar)?.data?.extensions?.mundi?.example));
    for (const list of [ours, all]) {
        const hit = list.find(r => plain(r.name ?? '') === n) ?? list.find(r => plain(r.name ?? '').split(/\s+/)[0] === n);
        if (hit) return hit.avatar;
    }
    return undefined;
}
// The start's traits added to the chosen ones (each in the world's group that has it, within the group's limit).
export function withStartTraits(w: WorldDef, traits: Record<string, string[]>, start: StartDef | undefined): Record<string, string[]> {
    const out: Record<string, string[]> = JSON.parse(JSON.stringify(traits ?? {}));
    for (const t of start?.traits ?? []) {
        const grp = (w.sheet.traits ?? []).find(x => x.options.some(o => plain(o) === plain(t))); if (!grp) continue;
        const opt = grp.options.find(o => plain(o) === plain(t))!;
        const l = (out[grp.id] ??= []);
        if (!l.includes(opt) && l.length < grp.max) l.push(opt);
    }
    return out;
}
/** What a start gives once the save and its people exist: its job, skill levels, the people you know (feelings or
 *  family, met), the household you live with. Your own choices in the new game come after and win. */
export function applyStart(g: Save, w: WorldDef, start: StartDef | undefined) {
    if (!start) return;
    g.player.start = start.id;
    if (start.premise?.trim()) g.player.premise = start.premise.trim().slice(0, 4000);
    const job = start.job ? w.occupations.find(o => o.id === start.job) : undefined;
    if (job && systemOn(w, 'jobs') && adultOk(g, job)) g.player.job = { id: job.id, rank: 0, shifts: 0 };
    // skill levels (J3): kept where levelOf() reads them
    for (const [id, lv] of Object.entries(start.skills ?? {})) { const xp = hobbyXp(g); xp[id] = Math.max(xp[id] ?? 0, LEVELS[Math.max(0, Math.min(MAX_LEVEL, lv))]); }
    for (const k of start.knows ?? []) {
        const a = knownAvatar(g, w, k.name); if (!a || !g.cast[a]) continue;   // not in this game (not chosen, adult-only…)
        g.cast[a].met = true;
        if (k.family) addOldTie(g, { a, b: YOU, type: k.family }, true);
        const { name, family, ...feel } = k; void name; void family;
        if (Object.keys(feel).length) applyStartFeel(g, { a, b: YOU, ...feel }, true);
    }
    if (start.household) {
        const tagOf = (a: string) => charOf(a)?.data?.extensions?.mundi?.example;
        for (const ex of w.cast.examples.filter(e => e.household === start.household)) {
            const r = Object.values(g.cast).find(x => tagOf(x.avatar) === exampleTag(w, ex)); if (!r) continue;
            r.met = true;
            liveTogether(g, YOU, r.avatar);
        }
    }
}
