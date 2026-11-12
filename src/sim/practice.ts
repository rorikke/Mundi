// Where to practise a skill, for the Profile: the things that train it in the places you've been to (and at home),
// how many more wait in places you haven't found yet, and the jobs that train it a little each shift. It only reads
// the world and the save; what doing them gives is decided in hobbies.ts.
import { adultOk, adultOn, type Save } from '../core/store.js';
import { systemOn, type ActionDef, type WorldDef } from '../core/world.js';
import { trainedBy } from './hobbies.js';
import { beenTo } from './tally.js';
import { hasItem, shopItems } from './life.js';
import { placeOf } from './places.js';

/** One thing that trains the skill: where you've seen it (`where`, place names), or at home (`home`, with the item it
 *  needs and you don't have yet), or anywhere. */
export interface PracticeSpot { label: string; icon: string; where: string[]; more: number; home?: boolean; anywhere?: boolean; item?: string }
/** `immersion`: the world's local language, which also grows by itself while you're out among people (language.ts). */
export interface Practice { spots: PracticeSpot[]; unseen: number; jobs: string[]; immersion?: boolean }

// The places an action is offered in: the one or ones it names, the places that list it, or (with neither) every place
// whose tags bring it, as actionsHere() in needs.ts decides.
function placesFor(w: WorldDef, a: ActionDef): string[] {
    const named = [a.place, ...(a.places ?? []), ...w.places.filter(p => p.actions?.includes(a.id)).map(p => p.id)].filter((x): x is string => !!x);
    if (named.length || a.place || a.places) return [...new Set(named)];
    return w.places.filter(p => !p.link && p.generic !== false && (a.tags ?? []).some(t => p.tags?.includes(t)) && !(a.notTags ?? []).some(t => p.tags?.includes(t))).map(p => p.id);
}

export function practiceFor(g: Save, w: WorldDef, skill: string): Practice {
    const out: Practice = { spots: [], unseen: 0, jobs: [] };
    for (const a of w.actions) {
        if (trainedBy(w, a)?.id !== skill || !adultOk(g, a) || a.id === 'fix') continue;   // (fixing: only when something breaks)
        const base = { label: a.label, icon: a.icon ?? '' };
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
