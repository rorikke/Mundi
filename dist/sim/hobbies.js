import { systemOn } from '../core/world.js';
import { note } from './facts.js';
// Experience needed for each level (level 10 is the top, and the cap).
export const LEVELS = [0, 20, 50, 100, 170, 260, 380, 530, 720, 950, 1250];
export const MAX_LEVEL = LEVELS.length - 1;
const TITLES = ['New to it', 'Beginner', 'Beginner', 'Getting there', 'Decent', 'Good', 'Good', 'Very good', 'Very good', 'Excellent', 'A master'];
const on = (w) => !!w && systemOn(w, 'hobbies') && !!w.hobbies?.length;
export const hobbiesOf = (w) => (on(w) ? w.hobbies : []);
/** Every skill of a world: its own skills, then its hobbies (with the hobbies system on), one per id. */
export function skillsOf(w) {
    const out = (w?.skills ?? []).map(s => ({ ...s, actions: [] }));
    for (const h of hobbiesOf(w)) {
        const i = out.findIndex(s => s.id === h.id);
        if (i < 0)
            out.push(h);
        else
            out[i] = { ...out[i], ...h, name: out[i].name };
    }
    return out;
}
export const skillDef = (w, id) => skillsOf(w).find(s => s.id === id) ?? null;
export const skillName = (w, id) => skillDef(w, id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
// What the save keeps: experience per skill (`player.skills`; saves before schema 4 kept it as `hobbies`, moved by
// the migration). A save that never practiced starts from what it already did (meals, workouts, paintings).
export function skillXp(g) {
    const p = g.player;
    if (!p.skills) {
        const c = p.learning?.count ?? {};
        p.skills = {};
        const seed = { cooking: (c.meals ?? 0) * 6, fitness: (c.workouts ?? 0) * 8, painting: (c.paintings ?? 0) * 10 };
        for (const [k, v] of Object.entries(seed))
            if (v > 0)
                p.skills[k] = Math.min(LEVELS[5], v);
    }
    return p.skills;
}
/** The old name (hobbies were the only skills). */
export const hobbyXp = skillXp;
export const levelFor = (xp) => { let l = 0; while (l < MAX_LEVEL && xp >= LEVELS[l + 1])
    l++; return l; };
export const levelOf = (g, id) => levelFor(skillXp(g)[id] ?? 0);
export const titleOf = (level) => TITLES[Math.max(0, Math.min(MAX_LEVEL, level))];
export function progressOf(g, id) {
    const xp = skillXp(g)[id] ?? 0, l = levelFor(xp);
    if (l >= MAX_LEVEL)
        return { level: l, xp, next: 0, pct: 100 };
    return { level: l, xp, next: LEVELS[l + 1], pct: Math.round(((xp - LEVELS[l]) / (LEVELS[l + 1] - LEVELS[l])) * 100) };
}
/** At least this level (a start's skills, a course's): never lowers one. */
export function setSkillLevel(g, id, level) {
    const xp = skillXp(g), l = Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
    if ((xp[id] ?? 0) < LEVELS[l])
        xp[id] = LEVELS[l];
}
// The hobby an action trains (from the world's list, or set on the action itself), or the skill it names (`trains`).
export const hobbyFor = (w, a) => hobbiesOf(w).find(h => h.id === a.hobby || h.actions.includes(a.id)) ?? (a.trains ? skillDef(w, a.trains) : null);
// On its roll: +1 every 2 levels.
export const hobbyBonus = (g, w, a) => { const h = hobbyFor(w, a); return h ? Math.floor(levelOf(g, h.id) / 2) : 0; };
// On what it pays: +12% a level (or the hobby's own rate).
export const hobbyPay = (g, w, a) => { const h = hobbyFor(w, a); return h ? 1 + (levelOf(g, h.id) * (h.pay ?? 12)) / 100 : 1; };
/** Experience for a skill (from practice, a shift, a course); the message when it reaches a new level. */
export function trainSkill(g, w, id, amount) {
    const xp = skillXp(g);
    const before = levelFor(xp[id] ?? 0);
    xp[id] = Math.min(LEVELS[MAX_LEVEL], (xp[id] ?? 0) + amount);
    const after = levelFor(xp[id]);
    if (after <= before)
        return [];
    const h = skillDef(w, id), name = skillName(w, id);
    note(g, '{u} got better at {0} (level {1}).', [name.toLowerCase(), String(after)], [], g.player.loc, 'skill');
    const jobs = w.occupations.filter(o => o.hireable !== false && ((o.hobby?.id === id && o.hobby.level === after) || o.skills?.[id] === after)).map(o => o.name);
    return [`${h?.icon ?? '⭐'} ${name}: level ${after} (${titleOf(after).toLowerCase()}).${jobs.length ? ` New job you can apply for: ${jobs.join(', ')}.` : ''}`];
}
// After you do it: experience (10 when it goes well, 4 when not, 15 on a great day; actions without a roll give 6).
export function practice(g, w, a, success, great = false) {
    const h = hobbyFor(w, a);
    if (!h)
        return [];
    return trainSkill(g, w, h.id, success === null ? 6 : great ? 15 : success ? 10 : 4);
}
// Jobs: the hobby level and the skill levels they ask for to be hired.
export const hobbyFits = (g, w, o) => (!on(w) || !o.hobby?.id || levelOf(g, o.hobby.id) >= (o.hobby.level ?? 0)) && Object.entries(o.skills ?? {}).every(([id, n]) => levelOf(g, id) >= n);
export function hobbyNeed(g, w, o) {
    const parts = [];
    const h = on(w) && o.hobby?.id ? hobbiesOf(w).find(x => x.id === o.hobby.id) : null;
    if (h)
        parts.push(`${h.name} level ${o.hobby.level} (you: ${levelOf(g, h.id)})`);
    for (const [id, n] of Object.entries(o.skills ?? {}))
        parts.push(`${skillName(w, id)} level ${n} (you: ${levelOf(g, id)})`);
    return parts.join(', ');
}
// For the AI: what you are good at (level 3 and up).
export function hobbyLine(g, w) {
    const list = skillsOf(w).map(h => [h, levelOf(g, h.id)]).filter(([, l]) => l >= 3);
    const what = w.skills?.length ? 'skills' : 'hobbies';
    const langs = new Set([w.language?.local, ...(w.language?.others ?? [])]); // "English" keeps its capital
    const named = (h) => (langs.has(h.id) ? h.name : h.name.toLowerCase());
    return list.length ? `{{user}}'s ${what}: ${list.map(([h, l]) => `${named(h)} (${titleOf(l).toLowerCase()}, level ${l} of ${MAX_LEVEL})`).join(', ')}.` : '';
}
