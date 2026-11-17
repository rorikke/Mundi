import { systemOn } from '../core/world.js';
import { onHour } from './hooks.js';
import { whenHolds } from './when.js';
import { milestone, SECOND_POINTS, MUSEUM_DONE_POINTS } from './points.js';
const QUARTERS = [25, 50, 75, 100];
/** The milestones this world has (whatever this game can reach: a condition that can't hold here never pays). */
export function milestonesOf(w) {
    const out = [{ source: 'home', key: 'first', when: 'did: home_bought', n: SECOND_POINTS.home, what: 'your first home' }];
    for (const d of w.ventures ?? [])
        if (d.tiers?.length)
            out.push({ source: 'venture', key: d.id, when: `venture: ${d.id} tier ${d.tiers.length}`, n: SECOND_POINTS.venture, what: `${d.name} at its top` });
    const halls = w.collection?.halls ?? [];
    for (const h of halls)
        if (!h.record)
            out.push({ source: 'hall', key: h.id, when: `piece: all in ${h.id}`, n: SECOND_POINTS.hall, what: `${h.name} complete` });
    if (w.collection?.museum)
        out.push({ source: 'hall', key: 'all', when: 'museum: 100%', n: MUSEUM_DONE_POINTS, what: `${w.collection.museum.name} complete` });
    const rec = halls.find(h => h.record && !h.apart);
    if (rec)
        for (const q of QUARTERS)
            out.push({ source: 'record', key: String(q), when: `record: ${q}%`, n: SECOND_POINTS.record, what: `${rec.name} ${q}% complete` });
    return out;
}
const lists = new WeakMap();
// The keys already paid (the ledger's `kinds`), read without making the ledger.
const paid = (g) => new Set((g.points?.kinds ?? []));
/** Pays every milestone that holds now and hasn't been paid. Returns the lines to show. */
export function payMilestones(g, w) {
    if (!w || !systemOn(w, 'goals'))
        return [];
    let list = lists.get(w);
    if (!list)
        lists.set(w, list = milestonesOf(w));
    const done = paid(g), out = [];
    for (const m of list) {
        if (done.has(`${m.source}:${m.key}`) || !whenHolds(g, w, m.when, { key: `milestone|${m.source}|${m.key}` }))
            continue;
        const line = milestone(g, w, m.source, m.key, m.n, m.what);
        if (line)
            out.push(line);
    }
    return out;
}
onHour.push((g, w) => payMilestones(g, w));
