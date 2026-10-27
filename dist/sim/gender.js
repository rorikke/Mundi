import { DEFAULT_GENDERS } from '../core/presets.js';
import { relOf, idOf, YOU } from './rel.js';
export const gendersOf = (w) => w?.genders ?? DEFAULT_GENDERS;
export const genderDef = (w, id) => (id ? gendersOf(w).find(x => x.id === id) : undefined);
export const genderOf = (g, a) => relOf(g).people[idOf(g, a)]?.gender;
// "women", for sentences (a gender without a plural: "<name> people").
export const pluralOf = (d) => (d.plural?.trim() || `${d.name.toLowerCase()} people`);
/* ---------- a person's own settings, from outside the save ---------- */
const PACES = ['slow', 'normal', 'fast'];
const PRESETS = ['free', 'passionate', 'steady', 'slow', 'devoted', 'custom'];
const RNEEDS = ['interest', 'crush', 'infatuated'], FNEEDS = ['none', 'friend', 'good', 'best'];
const num01 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined);
// Only the settings a person carries between games (gender, pace, relationship and intimacy styles), checked one by
// one; `null` (how a card forgets a setting) and anything unknown are dropped. Undefined when nothing is left.
export function cleanPerson(raw) {
    if (!raw || typeof raw !== 'object')
        return undefined;
    const p = {};
    if (typeof raw.gender === 'string' && raw.gender.trim())
        p.gender = raw.gender.trim().slice(0, 40);
    const pace = {};
    for (const m of ['f', 'r'])
        if (PACES.includes(raw.pace?.[m]))
            pace[m] = raw.pace[m];
    if (Object.keys(pace).length)
        p.pace = pace;
    if (raw.style === 'exclusive' || raw.style === 'open')
        p.style = raw.style;
    const i = raw.intimacy, intim = {};
    if (PRESETS.includes(i?.preset))
        intim.preset = i.preset;
    if (RNEEDS.includes(i?.r))
        intim.r = i.r;
    if (FNEEDS.includes(i?.f))
        intim.f = i.f;
    if (i?.casual === false)
        intim.casual = false;
    if (Object.keys(intim).length)
        p.intimacy = intim;
    const att = {};
    for (const [k, v] of Object.entries(raw.att ?? raw.attraction ?? {})) {
        const f = num01(v?.f), r = num01(v?.r);
        if (f !== undefined && f < 1)
            (att[k] ??= {}).f = f;
        if (r !== undefined && r < 1)
            (att[k] ??= {}).r = r;
    }
    if (Object.keys(att).length)
        p.att = att;
    return Object.keys(p).length ? p : undefined;
}
export const exampleSettings = (ex) => cleanPerson(ex);
// Puts carried settings on someone's entry in the save (their age, minor flag… stay).
export function applyPerson(g, a, p) {
    if (!p)
        return;
    const people = relOf(g).people, id = idOf(g, a);
    people[id] = { ...(people[id] ?? {}), ...structuredClone(p) };
}
/* ---------- for the AI ---------- */
// The gender (and pronouns) of everyone in the scene who has one, you included.
export function genderLine(g, w, present) {
    const say = (name, id) => {
        const d = genderDef(w, id);
        if (!d)
            return '';
        return `${name}: ${d.name.toLowerCase()}${d.pronouns?.trim() ? ` (${d.pronouns.trim()})` : ''}`;
    };
    const parts = [say('{{user}}', genderOf(g, YOU)), ...present.filter(r => idOf(g, r.avatar) !== YOU).map(r => say(r.name, genderOf(g, r.avatar)))].filter(Boolean);
    return parts.length ? `Gender: ${parts.join('; ')}.` : '';
}
