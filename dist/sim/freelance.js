import { onDay, onLook } from './hooks.js';
import { photoOn, peekPhoto, photoOf } from './photo.js';
import { afterDelivery, afterMissed } from './assignments.js';
import { isFreelance, freelancePath, myJob, rankOf, addPerf, tryPromote, payMul, jobPlace } from './work.js';
import { eventsReady } from './workevents.js';
import { whenHolds, parseWhen, personNamed } from './when.js';
import { fr, YOU } from './rel.js';
import { FRIEND_TIERS } from './romance.js';
import { payOf } from './bills.js';
import { book } from './ledger.js';
import { money } from './needs.js';
/** The rules' numbers: performance by stars and for a missed brief, the chance of an event a delivery. */
export const FREELANCE = { perf: [0, -8, -4, 0, 3, 6], missed: -8, events: 0.35 };
const isMonday = (day) => (day - 1) % 7 === 0;
/** The freelance options of a job (every branch's). */
const freeIds = (o) => (o.branches ?? []).flatMap(b => (b.options ?? []).filter(x => x.freelance).map(x => x.id));
/** A freelance event that can come now: the job's own whose condition names one of its freelance paths, adult ones
 *  only with adult content on, none that waits for a colleague. */
export function freelanceEvents(g, w, o) {
    const ids = freeIds(o);
    return eventsReady(g, w, o.events, jobPlace(g, o), e => `work|${e.id}`)
        .filter(e => !e.from && parseWhen(e.when).conds.some(c => c.key === 'path' && !c.not && c.values.some(v => ids.includes(v))));
}
/** A delivery as a freelancer: a shift toward the next rank, performance by its stars, now and then one of the path's
 *  events (it waits on the work screen). Lines to show. */
export function onDelivered(g, w, stars, _late, rnd = Math.random) {
    const j = g.player.job, o = myJob(g, w);
    if (!j || !o || !isFreelance(g, w))
        return [];
    noteFreelance(g, w); // (how you left the studio, if nothing has looked yet)
    const out = [];
    j.shifts = Math.round((j.shifts + 1) * 100) / 100;
    out.push(...addPerf(g, w, FREELANCE.perf[Math.max(1, Math.min(5, stars))] ?? 0));
    out.push(...tryPromote(g, w, o));
    if (!j.event && rnd() < FREELANCE.events) {
        const list = freelanceEvents(g, w, o);
        if (list.length) {
            const e = list[Math.floor(rnd() * list.length)];
            j.event = { id: e.id, day: g.day };
            out.push(`Something came up with this client: see your job (${e.setup.length > 80 ? `${e.setup.slice(0, 77)}…` : e.setup})`);
        }
    }
    return out;
}
afterDelivery.push((g, w, _t, _b, stars, late) => onDelivered(g, w, stars, late));
afterMissed.push((g, w) => (isFreelance(g, w) ? addPerf(g, w, FREELANCE.missed) : []));
/** How you left the studio, once you're freelance: the mentor's blessing when the world names a mentor who's your
 *  friend or closer and her leaving (`photo.leaving`) holds, a falling-out otherwise (no mentor: the blessing). */
export function noteFreelance(g, w) {
    if (!photoOn(w) || peekPhoto(g).freelance || !isFreelance(g, w))
        return;
    const p = w.photo, m = p.mentor ? personNamed(g, p.mentor) : undefined, friend = FRIEND_TIERS.find(t => t.id === 'friend').lo;
    const blessed = !p.mentor || (!!m && fr(g, m.avatar, YOU) >= friend && (!p.leaving || whenHolds(g, w, p.leaving, { key: 'photo-leaving' })));
    photoOf(g).freelance = blessed ? 'blessing' : 'fallout';
}
onLook.push((g, w) => noteFreelance(g, w));
/** The retainer this week would pay (a week with a delivery; 0 otherwise). */
export function retainerNow(g, w) {
    const o = myJob(g, w);
    if (!o || !isFreelance(g, w))
        return 0;
    return payOf(g, rankOf(g, o).pay * payMul(g, w, o, 'wage'));
}
// Each Monday, for the week just ended: the retainer with at least one delivery, then a new week.
onDay.push((g, w) => {
    if (!photoOn(w))
        return [];
    noteFreelance(g, w);
    if (!isMonday(g.day) || !g.photo || peekPhoto(g).retainDay === g.day)
        return [];
    const p = photoOf(g), n = p.week?.n ?? 0;
    p.retainDay = g.day;
    p.week = { from: g.day, n: 0 };
    const o = myJob(g, w), free = freelancePath(g, w);
    if (!o || !free || n < 1)
        return [];
    const pay = retainerNow(g, w), rk = rankOf(g, o);
    if (pay <= 0)
        return [];
    g.player.money += pay;
    book(g, `Retainer: ${rk.name}`, pay);
    return [`Your retainer for last week (${n} deliver${n === 1 ? 'y' : 'ies'}): +${money(w, pay)}.`];
});
