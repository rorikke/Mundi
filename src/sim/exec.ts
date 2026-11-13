// The executive (business, requirements/business.md B-4, B-11): a career beyond a company's top ranks. The ranks
// themselves are job data (`Rank.beyond`, gated by `inrank`, the leadership program and the nomination's stories);
// what's only the executive's lives here: the division (a venture of track `exec` riding on the job, sim/ventures.ts:
// opened by reaching the job's first rank above the top, its tier the rank you hold, closed when you leave the job),
// its budget for initiatives (a season's, from the company, never your money), the season's target its numbers set
// and the board's verdict at a season's end, the performance a shift gives, and the summer and winter bonuses (effects
// sources on `perf` and on `pay` `bonus`, sim/effects.ts). Nothing happens with the `business` system off or without a
// division in the world.
import type { Save } from '../core/store.js';
import { systemOn, type WorldDef, type VentureDef } from '../core/world.js';
import type { EffectDef } from '../core/traits.js';
import { effectSources } from './effects.js';
import { onDay, onLook, ventureLink } from './hooks.js';
import { seasonDays } from './time.js';
import { payOf } from './bills.js';
import { money } from './needs.js';
import { note } from './facts.js';
import { venturesOf, ventureStore, fill, addStat, weekOf, retier, startOf, resultAdds, execTarget, type VentureState } from './ventures.js';
import { careerOf, jobDef, myJob } from './work.js';

/** The executive's numbers. `budget`: a season's budget for initiatives at each tier (× the tier's `base` when it has
 *  one; the season's target is `EXEC_TARGET` in sim/ventures.ts); `perf` and `bonus`: what a full division adds to the performance a shift gives and to the bonuses
 *  (an empty one takes a little away); `board`: Standing points the board's verdict moves. */
export const EXEC = { budget: 1_500_000, perf: { min: -0.1, max: 0.25 }, bonus: { min: -0.2, max: 0.5 }, board: 3 };

/** The world's division for a job (the venture of track `exec` whose `job` it is). */
export const divisionDefOf = (w: WorldDef, job: string | null | undefined): VentureDef | null =>
    (job && systemOn(w, 'business') ? (w.ventures ?? []).find(v => v.track === 'exec' && v.job === job) ?? null : null);
/** Your division, while you hold a rank that opens it. */
export function divisionOf(g: Save, w: WorldDef): VentureState | null {
    const d = divisionDefOf(w, g.player.job?.id);
    return d ? venturesOf(g).find(s => s.id === d.id) ?? null : null;
}
/** Which of the division's tiers your rank is (1: the first rank above the top), 0 below it. A tier names its rank
 *  (`TierDef.rank`); one that doesn't is the n-th rank above the top. */
export function rankTier(g: Save, w: WorldDef, d: VentureDef): number {
    const j = g.player.job, o = j && jobDef(w, j.id);
    if (!j || !o || o.id !== d.job) return 0;
    const ranks = careerOf(g, o).ranks, first = ranks.findIndex(r => r.beyond);
    if (first < 0 || j.rank < first) return 0;
    const held = ranks[Math.min(j.rank, ranks.length - 1)];
    const named = d.tiers.findIndex(t => !!t.rank && t.rank.trim().toLowerCase() === held.name.trim().toLowerCase());
    return named >= 0 ? named + 1 : Math.min(d.tiers.length, j.rank - first + 1);
}
const seasonOfDay = (g: Save, day: number) => Math.floor((Math.max(1, day) - 1) / seasonDays(g));
/** A season's budget for initiatives at the division's tier. */
export const budgetOf = (g: Save, d: VentureDef, tier: number) => Math.round(payOf(g, d.tiers[Math.max(0, tier - 1)]?.base ?? EXEC.budget * tier) / 1000) * 1000;
/** The season's target: how full the board wants the division (0–1), higher at each tier. */
export const targetOf = (s: VentureState) => execTarget(s.tier);

// The division follows your rank: opened at the first rank above the top (with this season's budget), its tier the
// rank you hold, closed once you leave the job (or fall below). Returns lines to show.
function syncDivision(g: Save, w: WorldDef): string[] {
    if (!systemOn(w, 'business') || !w.ventures?.length) return [];
    const out: string[] = [];
    for (const s of venturesOf(g)) {   // a division of a job you no longer hold, or a rank you no longer have
        const d = (w.ventures ?? []).find(v => v.id === s.id);
        if (!d || d.track !== 'exec' || (g.player.job?.id === d.job && rankTier(g, w, d) > 0)) continue;
        s.closed = g.day;
        out.push(`You no longer run ${d.name}.`);
    }
    const d = divisionDefOf(w, g.player.job?.id), tier = d ? rankTier(g, w, d) : 0;
    if (!d || !tier) return out;
    let s = venturesOf(g).find(x => x.id === d.id);
    if (!s) {
        const st = ventureStore(g);
        st.list = st.list.filter(x => x.id !== d.id);
        const o = myJob(g, w)!;
        s = { id: d.id, place: d.place ?? o.place, way: 'rank', since: g.day, tier, stats: startOf(d, 'rank', tier), owned: [], found: [], disc: [], staff: [], cash: budgetOf(g, d, tier), week: { n: weekOf(g.day), takings: 0, costs: 0, run: 0, notes: [] }, season: seasonOfDay(g, g.day) };
        st.list.push(s);
        note(g, '{u} took charge of {0}.', [d.name], [], s.place, 'work');
        out.push(`You run ${d.name} now: its initiatives are in the Business app, with a budget of ${money(w, s.cash)} this season.`);
    } else if (s.tier !== tier) {
        retier(g, w, s, tier);
        out.push(`${d.name} grows with you: ${d.tiers[tier - 1]?.name ?? 'a new tier'}.`);
    }
    return out;
}
// A new season: the board's verdict on the one that ended (the division against its target: Standing up or down), and
// the new season's budget.
function newSeason(g: Save, w: WorldDef): string[] {
    const s = divisionOf(g, w), d = s && divisionDefOf(w, g.player.job?.id);
    if (!s || !d) return [];
    const now = seasonOfDay(g, g.day), was = s.season ?? now;
    if (now === was) return [];
    s.season = now;
    const got = fill(d, s), want = targetOf(s), met = got >= want;
    addStat(g, w, s, 'standing', met ? EXEC.board : -EXEC.board);
    s.cash = budgetOf(g, d, s.tier);
    const line = `The board looked at ${d.name}'s season: ${Math.round(got * 100)}% against a target of ${Math.round(want * 100)}%${met ? ', ahead' : ', behind'}. A new budget: ${money(w, s.cash)}.`;
    s.week.notes = [...s.week.notes, line].slice(-8);
    s.verdicts = [...(s.verdicts ?? []), { season: was, got: Math.round(got * 100), want: Math.round(want * 100) }].slice(-8);
    note(g, met ? 'The board was pleased with {u}\'s division ({0}).' : 'The board wanted more of {u}\'s division ({0}).', [d.name], [], s.place, 'work');
    return [line];
}
/** How the division stands this season: how full it is and the target, both 0–100. */
export function seasonStanding(g: Save, w: WorldDef): { got: number; want: number } | null {
    const s = divisionOf(g, w), d = s && divisionDefOf(w, g.player.job?.id);
    return s && d ? { got: Math.round(fill(d, s) * 100), want: Math.round(targetOf(s) * 100) } : null;
}

// The division's numbers in your work: a fuller one makes each shift count for more, and the bonuses larger.
effectSources.push((g, w): EffectDef[] => {
    if (!w.ventures) return [];
    const s = divisionOf(g, w), d = s && divisionDefOf(w, g.player.job?.id);
    if (!s || !d) return [];
    const f = fill(d, s), lerp = (r: { min: number; max: number }) => Math.round((r.min + (r.max - r.min) * f) * 1000) / 1000;
    return [{ kind: 'perf', value: lerp(EXEC.perf), target: d.job }, { kind: 'pay', value: lerp(EXEC.bonus), target: 'bonus' }];
});
// A choice at work that adds to the division's numbers (an initiative's result, a client won).
ventureLink.workResult = (g, w, job, r, ok) => {
    if (!r.add && !r.finds) return [];
    const s = divisionOf(g, w);
    return s && g.player.job?.id === job ? resultAdds(g, w, s, r, ok) : r.finds ? ventureLink.find(g, w, r.finds) : [];
};
onDay.push((g, w) => [...syncDivision(g, w), ...newSeason(g, w)]);
onLook.push((g, w) => { syncDivision(g, w); });
