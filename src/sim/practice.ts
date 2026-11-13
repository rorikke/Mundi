// Where to practise a skill, for the Profile: the things that train it in the places you've been to (and at home),
// how many more wait in places you haven't found yet, and the jobs that train it a little each shift. It only reads
// the world and the save; what doing them gives is decided in hobbies.ts.
import { adultOk, adultOn, type Save } from '../core/store.js';
import { systemOn, type ActionDef, type WorldDef } from '../core/world.js';
import { trainedBy } from './hobbies.js';
import { beenTo } from './tally.js';
import { hasItem, shopItems } from './life.js';
import { placeOf } from './places.js';
import { parseWhen } from './when.js';

/** One thing that trains the skill: where you've seen it (`where`, place names), or at home (`home`, with the item it
 *  needs and you don't have yet), or anywhere. */
export interface PracticeSpot { label: string; icon: string; where: string[]; more: number; home?: boolean; anywhere?: boolean; item?: string; when?: string[] }
/** `immersion`: the world's local language, which also grows by itself while you're out among people (language.ts). */
export interface Practice { spots: PracticeSpot[]; unseen: number; jobs: string[]; immersion?: boolean }

// When an action is offered, and what it waits for, in a few words ("Evening", "once a day", "with Haru as a friend"),
// so a spot that isn't on the list right now isn't taken for missing. Keys a practice action doesn't use are left out.
const DAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const AS: Record<string, string> = { acquaintance: 'an acquaintance', friend: 'a friend', good: 'a good friend', best: 'a best friend' };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
// the time first, then how often, then what it waits for
const ORDER = ['event', 'festival', 'season', 'weekday', 'weekend', 'period', 'clock', 'weather', 'daily', 'regular', 'skill', 'job', 'course', 'feels', 'present', 'onShift', 'after', 'holds', 'companion'];
const human = (id: string) => cap(id.replace(/[_-]+/g, ' '));
export function whenWords(w: WorldDef, when: ActionDef['when']): string[] {
    const out: [number, string][] = [];
    const or = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0] ?? '');
    const said = (xs: string[]) => cap(or(xs.map(x => x.toLowerCase())));   // "Late morning or afternoon"
    for (const c of parseWhen(when).conds) {
        const v = c.values, add = (t: string) => out.push([ORDER.indexOf(c.key as string), t]);
        switch (c.key) {
            case 'period': { const t = said(v.map(id => w.time.periods.find(p => p.id === id)?.name ?? human(id))); add(c.not ? `Not ${t.toLowerCase()}` : t); break; }
            case 'season': { const t = said(v.map(human)); add(c.not ? `Not in ${t.toLowerCase()}` : t); break; }
            case 'weekday': { const t = or(v.map(d => DAYS[['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(d)] ?? human(d))); add(c.not ? `Not on ${t}` : t); break; }
            case 'weekend': add(v[0] === 'no' ? 'Weekdays' : 'Weekends'); break;
            case 'clock': add(v.join(', ')); break;
            case 'weather': add(c.not ? `Not in ${or(v).replace(/_/g, ' ')}` : said(v.map(human))); break;
            case 'event': add(`During ${or(v.map(id => w.cityEvents?.find(e => e.id === id)?.name ?? human(id)))}`); break;
            case 'festival': add(`During ${or(v.map(id => w.festivals?.find(f => f.id === id)?.name ?? human(id)))}`); break;
            case 'daily': add('once a day'); break;
            case 'regular': add("once you're a regular"); break;
            case 'feels': {
                // "with Reiko, Daisuke or Mei as an acquaintance": the people asked for, by the level asked
                const by = new Map<string, string[]>();
                for (const x of v) { const [who, lvl] = x.split(/\s+(?=\S+$)/); by.set(lvl, [...(by.get(lvl) ?? []), who]); }
                add(`with ${[...by].map(([lvl, who]) => `${or(who)} as ${AS[lvl] ?? lvl}`).join(' or ')}`); break;
            }
            case 'onShift': add(`when ${or(v)} is working`); break;
            case 'present': add(`when ${or(v)} is there`); break;
            case 'skill': add(or(v.map(x => { const [id, n] = x.split(/\s+/); return `${w.skills?.find(k => k.id === id)?.name ?? human(id)} ${n}`; }))); break;
            case 'after': add(`after “${or(v.map(id => w.actions.find(x => x.id === id)?.label ?? human(id)))}”`); break;
            case 'job': if (!c.not) add(v[0] === 'here' ? 'working here' : `as ${or(v.map(id => w.occupations.find(o => o.id === id)?.name ?? human(id)))}`); break;
            case 'holds': add(`with ${or(v.map(id => w.keepsakes?.find(k => k.id === id)?.name ?? human(id)))}`); break;
            case 'course': add(`after ${or(v.map(id => ((w.catalogs as any)?.courses ?? []).find((k: { id: string }) => k.id === id)?.name ?? human(id)))}`); break;
            case 'companion': add('with a partner'); break;
        }
    }
    const words = out.sort((a, b) => a[0] - b[0]).map(x => x[1]);
    if (words[0]) words[0] = cap(words[0]);
    return words;
}

// The places an action is offered in: the one or ones it names, the places that list it, or (with neither) every place
// whose tags bring it, as actionsHere() in needs.ts decides.
export function placesFor(w: WorldDef, a: ActionDef): string[] {
    const named = [a.place, ...(a.places ?? []), ...w.places.filter(p => p.actions?.includes(a.id)).map(p => p.id)].filter((x): x is string => !!x);
    if (named.length || a.place || a.places) return [...new Set(named)];
    return w.places.filter(p => !p.link && p.generic !== false && (a.tags ?? []).some(t => p.tags?.includes(t)) && !(a.notTags ?? []).some(t => p.tags?.includes(t))).map(p => p.id);
}

export function practiceFor(g: Save, w: WorldDef, skill: string): Practice {
    const out: Practice = { spots: [], unseen: 0, jobs: [] };
    for (const a of w.actions) {
        if (trainedBy(w, a)?.id !== skill || !adultOk(g, a) || a.id === 'fix') continue;   // (fixing: only when something breaks)
        const base = { label: a.label, icon: a.icon ?? '', when: whenWords(w, a.when) };
        if (a.home) {
            const it = a.needsItem && !hasItem(g, a.needsItem) ? shopItems(w).find(x => x.id === a.needsItem)?.name ?? a.needsItem : undefined;
            out.spots.push({ ...base, where: [], more: 0, home: true, item: it });
            continue;
        }
        if (a.anywhere) { out.spots.push({ ...base, where: [], more: 0, anywhere: true }); continue; }
        const all = placesFor(w, a);
        const seen = all.filter(id => beenTo(g, id));
        if (!seen.length) { if (all.length) out.unseen++; continue; }
        out.spots.push({ ...base, where: seen.map(id => placeOf(g, w, id)?.name ?? id), more: all.length - seen.length });
    }
    if (w.language?.local === skill && systemOn(w, 'hobbies')) out.immersion = true;
    out.jobs = w.occupations.filter(o => o.hireable !== false && (!o.adult || adultOn(g)) && o.trains?.includes(skill)).map(o => o.name);
    return out;
}
