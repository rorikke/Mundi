import { onDay } from './hooks.js';
import { museumDef, museumOf, museumState, museumOpen } from './museum.js';
import { percentOf } from './collection.js';
import { payOf } from './bills.js';
import { effectMul } from './effects.js';
import { book } from './ledger.js';
import { money } from './needs.js';
const royDef = (w) => museumDef(w)?.royalties;
const peek = (g) => (museumOf(g)?.roy ?? {});
const state = (g) => (museumState(g).roy ??= {});
const isMonday = (day) => (day - 1) % 7 === 0;
/** The museum's percentage as royalties read it (the display halls'). */
const pctNow = (g, w) => percentOf(g, w, false).pct;
/** What a week pays at a percentage by the curve alone (before difficulty and effects): nothing below the first point,
 *  a straight line between two, the last above it. */
export function curvePay(r, pct) {
    const c = r.curve;
    if (!c.length || pct < c[0].at)
        return 0;
    for (let i = 1; i < c.length; i++) {
        const a = c[i - 1], b = c[i];
        if (pct <= b.at)
            return b.at === a.at ? b.pay : a.pay + (b.pay - a.pay) * (pct - a.at) / (b.at - a.at);
    }
    return c[c.length - 1].pay;
}
/** What this week's royalties are worth now (after the difficulty's pay and the `royalty` effects; 0 while the museum
 *  isn't yours or is below the curve). */
export function royaltyNow(g, w, pct = pctNow(g, w)) {
    const r = royDef(w);
    if (!r || !museumOpen(g, w))
        return 0;
    const base = curvePay(r, pct);
    return base > 0 ? payOf(g, base * effectMul(g, w, 'royalty')) : 0;
}
// Each Monday, after the visitors: the week's royalties by the percentage now.
onDay.push((g, w) => {
    const m = museumDef(w), r = m?.royalties;
    if (!m || !r || !museumOpen(g, w) || !isMonday(g.day) || peek(g).paidDay === g.day)
        return [];
    const n = royaltyNow(g, w);
    if (!(n > 0))
        return [];
    const st = state(g);
    st.paidDay = g.day;
    st.last = n;
    g.player.money += n;
    book(g, `${m.name}: royalties`, n);
    return [`${m.name}'s royalties: +${money(w, n)}`];
});
// Each morning: a step reached for the first time is said (only the highest of several reached at once: an old save
// already past them, or a big day), and the others reached are marked said.
onDay.push((g, w) => {
    const r = royDef(w);
    if (!r?.steps?.length || !museumOpen(g, w))
        return [];
    const pct = pctNow(g, w), said = new Set(peek(g).said ?? []);
    const now = r.steps.filter(s => s.at <= pct && !said.has(s.at));
    if (!now.length)
        return [];
    const st = state(g);
    st.said = [...new Set([...(st.said ?? []), ...now.map(s => s.at)])].sort((a, b) => a - b);
    return [now[now.length - 1].line];
});
export function royaltyView(g, w) {
    const r = royDef(w), pct = pctNow(g, w);
    if (!r || !museumOpen(g, w))
        return { on: false, pct, now: 0, top: 0, from: 0 };
    const st = peek(g), said = new Set(st.said ?? []), next = r.steps?.find(s => !said.has(s.at) && s.at > pct);
    return { on: true, ...(st.last !== undefined ? { last: st.last } : {}), pct, now: royaltyNow(g, w, pct), top: royaltyNow(g, w, 100),
        from: r.curve[0].at, ...(next ? { next: { at: next.at, line: next.line } } : {}) };
}
/** For the AI (the `you` block, after the museum's line): what the steps reached so far say. Facts only. */
export function royaltyLine(g, w) {
    const r = royDef(w);
    if (!r?.steps?.length || !museumOpen(g, w))
        return '';
    const said = new Set(peek(g).said ?? []);
    return r.steps.filter(s => said.has(s.at) && s.ai).map(s => s.ai).join(' ');
}
