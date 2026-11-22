// The adult industry's job worked by bookings (plans/adult-industry.md, "Bookings"): over sim/work.ts's guards (no
// shifts, warnings, sack, vacation, sick days or bonus while `noShifts`), a title wrapped counts as a shift toward
// promotion (an exclusive's as two), performance moves by its scenes' grades, the fee is paid, and now and then one of
// the job's events comes after it (colleagues' ones too). Too many titles in a week wear you down (`burnout`, read by
// the set's rolls); a clinic test is due once a month (no shoot is set while it's overdue). The actress's contract:
// freelance until a label offers an exclusive (a card), renewed each season by her titles' sales (a raise, as it is,
// or not renewed: freelance again, never jobless). Fans come with each release; from Popular name a monthly fan
// meeting pays by them; the star-producer's fan club pays weekly. The lens: a storyline stage offers a photographer
// the industry's entry, which hires them straight onto the directing path's first rank.
import { nowAbs, type Save } from '../core/store.js';
import type { WorldDef, ActionDef, ContractDef, EntryDef } from '../core/world.js';
import { INDUSTRY, type SceneGrade, type TitleRec } from '../core/industry.js';
import { onWrap, onRelease, engineActions, onAction } from './hooks.js';
import {
    peekIndustry, industryOf, industryOn, inIndustry, industryJob, labelOf, labelsOf, homeLabel, monthDays, releaseDays, seasonIndex, fameOf, onPath, STAR_PATH,
    type Title, type Offer, type SeatState,
} from './industry.js';
import { myJob, rankOf, trackOf, realDays, addPerf, tryPromote, payMul, perfOf, workRules, rollWorkEvent, pendingEvent, bookedLink, hireEntry, quitJob, type JobState } from './work.js';
import { whenHolds } from './when.js';
import { YOU } from './rel.js';
import { payOf, priceOf } from './bills.js';
import { book } from './ledger.js';
import { money } from './needs.js';
import { note } from './facts.js';
import { genderOf } from './gender.js';
import { levelOf } from './hobbies.js';
import { seasonDays } from './time.js';

/** The rules' numbers (first guesses, tuned by the long run). */
export const BOOKINGS = {
    /** performance a title brings: a shift worked's (4, +1 with the rank's skills, as sim/work.ts's normal shift), and
     *  what its scenes' grades add (their average), so promotion keeps the shift job's pace for a player doing well */
    perf: { base: 4, skills: 1, great: 3, good: 1, poor: -3 },
    /** scene rolls lost per title over the rank's days + 1 in seven days */
    burnout: 2,
    /** fans a release brings at quality 60 (× fame and the contract's `fame`), fewer as the fan base nears `fanCap`
     *  (tuned in L: the base had no ceiling, and four years of releases made a fan meeting pay ¥500,000) */
    fans: 600, fanCap: 8000,
    /** a fan meeting's pay per fan, the fan club's per fan a week (L: 5 and 2 before the cap) */
    meeting: 2, club: 1,
    /** an exclusive's renewal: a raise at this share above the line, the raise, and the most the raises add up to (×
     *  the contract's own fee; L: raises compounded every season without one) */
    raiseAt: 1.25, raise: 1.1, raiseMax: 1.2,
    /** a missed shoot: performance, the label's standing */
    missed: { perf: -8, standing: -2 },
    /** the clinic's test: its price, and how early it can be taken (days before it's due) */
    test: { price: 6000, early: 2 },
};

/* ---------- a title as a shift ---------- */

/** The contract a title of yours is under (the actress's exclusive), as its ContractDef. */
export function contractDef(g: Save, w: WorldDef): ContractDef | null {
    const c = peekIndustry(g).seats.perform?.contract, o = myJob(g, w);
    return c && o ? (trackOf(g, o).contracts ?? []).find(x => x.id === c.id) ?? null : null;
}
/** Shifts a title counts for: an exclusive's `counts` for a title you perform in for its label, else 1. */
export function titleCounts(g: Save, w: WorldDef, t: TitleRec): number {
    const c = peekIndustry(g).seats.perform?.contract, d = contractDef(g, w);
    return c && d && t.you.includes('perform') && t.label === c.label ? d.counts ?? 2 : 1;
}
const gradeOf = (q: number): SceneGrade => (q >= 70 ? 'great' : q >= 45 ? 'good' : 'poor');
/** A title's quality from its scenes (S's `q`, else from their grades), 0–100. */
export function titleQuality(t: TitleRec): number {
    const qs = t.scenes.map(s => s.q ?? (s.grade === 'great' ? 80 : s.grade === 'good' ? 60 : s.grade === 'poor' ? 35 : undefined)).filter((x): x is number => x !== undefined);
    return qs.length ? Math.round(qs.reduce((a, b) => a + b, 0) / qs.length) : 50;
}
/** What a title does to your performance: a shift worked's (4, +1 when you have the skills your rank asks for), and its
 *  scenes' grades on top (great +3, good +1, poor −3, their average). */
export function titlePerf(g: Save, w: WorldDef, t: TitleRec): number {
    const o = myJob(g, w), P = BOOKINGS.perf;
    const needs = o ? Object.entries(rankOf(g, o).needs ?? {}).filter(([id]) => id !== 'performance') : [];
    const graded = t.scenes.map(s => s.grade ?? gradeOf(s.q ?? t.q ?? 50));
    const res = graded.reduce((a, x) => a + P[x], 0) / Math.max(1, graded.length);
    return Math.round(P.base + (needs.length && needs.every(([id, v]) => levelOf(g, id) >= v) ? P.skills : 0) + res);
}
/** After a shoot wraps (each title once: its quality marks it done): the scenes' results copied in when the set hands a
 *  copy, the quality and release day, the fee paid, the title counted as shifts, performance by its scenes, a promotion,
 *  sometimes one of the job's events. Lines. */
export function wrapStep(g: Save, w: WorldDef, title: TitleRec): string[] {
    if (!industryOn(g, w)) return [];
    const st = industryOf(g), t = st.titles.find(x => x.id === title.id) as Title | undefined;
    if (!t || t.q !== undefined || t.cancelled) return [];
    if (t !== title) t.scenes = title.scenes.map(s => ({ ...s }));
    const out: string[] = [];
    t.q = titleQuality(t);
    t.release = t.shoot + releaseDays(g);
    if (!t.you.includes('direct')) t.edited = g.day;   // (the label's editor: no lift)
    for (const seat of t.you) if (seat !== 'label') { const s = (st.seats[seat] ??= { titles: 0 }); s.titles++; s.last = t.shoot; }
    for (const who of t.cast) if (who.startsWith('roster:')) { const r = (st.roster[who.slice(7)] ??= { titles: 0 }); r.titles++; r.last = g.day; }
    const lb = (st.standing[t.label] ??= { n: 0 }); lb.n++;
    if (t.fee) { g.player.money += t.fee; book(g, `${labelOf(w, t.label)?.name ?? t.label}: "${t.name}"`, t.fee); out.push(`The fee for "${t.name}": +${money(w, t.fee)}.`); }
    note(g, '{u} shot "{0}" for {1}.', [t.name, labelOf(w, t.label)?.name ?? t.label], [], g.player.loc, 'work');
    const j = g.player.job as JobState | null, o = myJob(g, w);
    if (j && o && inIndustry(g, w)) {
        j.shifts = Math.round((j.shifts + titleCounts(g, w, t)) * 100) / 100;
        out.push(...addPerf(g, w, titlePerf(g, w, t)));
        out.push(...tryPromote(g, w, o));
        // (an event left unanswered past its day no longer waits: L found one blocking every event after it)
        if (!pendingEvent(g, w)) { rollWorkEvent(g, w, o); if (j.event) out.push('Something came up on set: see your job.'); }
    }
    out.push(`"${t.name}" is in the can: quality ${t.q}. It comes out in ${t.release - g.day} days.`);
    return out;
}
onWrap.push(wrapStep);

/* ---------- burnout and the monthly test ---------- */

/** Titles you shot in the last seven days (today's counted). */
export const titlesThisWeek = (g: Save) => peekIndustry(g).titles.filter(t => !t.cancelled && t.shoot > 0 && t.shoot <= g.day && t.shoot > g.day - 7 && (t.q !== undefined || t.shoot === g.day)).length;
/** What each scene's roll loses now: 2 for each title over the rank's days + 1 in seven days (sim/onset.ts reads it). */
export function burnout(g: Save, w: WorldDef): number {
    const o = myJob(g, w);
    if (!o || !inIndustry(g, w)) return 0;
    return BOOKINGS.burnout * Math.max(0, titlesThisWeek(g) - (realDays(trackOf(g, o), rankOf(g, o)) + 1));
}
/** The test is overdue (a month since the last): no shoot can be set until it's done. */
export const testDue = (g: Save) => g.day - peekIndustry(g).test >= monthDays(g);
/** The day the next test is due. */
export const testNext = (g: Save) => peekIndustry(g).test + monthDays(g);
/** Where the test can be taken: a place tagged `health` (a hospital, a clinic). */
export const testHere = (g: Save, w: WorldDef) => !!w.places.find(p => p.id === g.player.loc)?.tags?.includes('health');
export const TEST_ID = 'x-ind-test';
engineActions.push((g, w) => {
    if (!inIndustry(g, w) || !testHere(g, w) || testNext(g) - g.day > BOOKINGS.test.early) return [];
    return [{ id: TEST_ID, name: 'Monthly test', label: 'Take the monthly test', icon: '🩺', cost: priceOf(g, BOOKINGS.test.price), minutes: 60, effects: {}, scene: false, tags: ['industry'],
        outcomes: [{ weight: 1, text: 'The clinic runs the industry\'s tests: clear. You are good to shoot for another month.' }] } as unknown as ActionDef];
});
onAction.push((g, w, a) => { if (a.id === TEST_ID && inIndustry(g, w)) industryOf(g).test = g.day; });

/* ---------- the actress's contract ---------- */

const trackContracts = (g: Save, w: WorldDef) => { const o = myJob(g, w); return o ? trackOf(g, o).contracts ?? [] : []; };
/** An exclusive contract a label offers her: from rank 1 (Named actress), freelance, by fame or performance, once a
 *  season at most; from a label of the top tier she knows (the director's label at first). */
export function offerExclusive(g: Save, w: WorldDef, newId: () => number): Offer | null {
    const st = industryOf(g), seat = st.seats.perform, ex = trackContracts(g, w).find(c => c.exclusive), j = g.player.job;
    if (!ex || !seat || seat.contract || !j || j.rank < 1 || !inIndustry(g, w) || onPath(g, w, 'director')) return null;
    if (st.offers.some(o => o.kind === 'exclusive')) return null;
    if (seat.exclusiveAsked !== undefined && g.day - seat.exclusiveAsked < 4 * monthDays(g)) return null;
    if (fameOf(g, 'perform') < 20 && perfOf(g) < 70) return null;
    const known = new Set(st.titles.map(t => t.label));
    const lb = [...labelsOf(w)].filter(l => known.has(l.id) || l === homeLabel(w)).sort((a, b) => (b.tier ?? 2) - (a.tier ?? 2))[0];
    if (!lb) return null;
    seat.exclusiveAsked = g.day;
    return { id: newId(), kind: 'exclusive', day: g.day, until: g.day + 7, label: lb.id, contract: ex.id };
}
/** Her answer to an exclusive offer (yes: exclusive to its label from today; no: freelance, asked again later), or to a
 *  renewal (yes: kept; no: freelance from today). */
export function answerContract(g: Save, w: WorldDef, o: Offer, yes: boolean): string {
    const st = industryOf(g), seat = (st.seats.perform ??= { titles: 0 });
    st.offers = st.offers.filter(x => x !== o);
    const name = labelOf(w, o.label)?.name ?? o.label ?? '';
    if (o.kind === 'exclusive') {
        const d = trackContracts(g, w).find(c => c.id === o.contract);
        if (!yes || !d) return `You stay freelance: any label, any genre.`;
        seat.contract = { id: d.id, label: o.label!, since: g.day, fee: d.fee ?? 3, season: seasonIndex(g) };
        st.offers = st.offers.filter(x => x.kind !== 'title' || x.label === o.label);
        note(g, '{u} signed an exclusive contract with {0}.', [name], [], g.player.loc, 'work');
        return `You signed with ${name}: exclusive, ${d.titles ?? 2} title${(d.titles ?? 2) === 1 ? '' : 's'} a month, each a big release.`;
    }
    if (o.kind === 'renewal' && !yes && seat.contract) {
        delete seat.contract;
        note(g, '{u} left {0}\'s exclusive contract and went freelance.', [name], [], g.player.loc, 'work');
        return 'You go freelance again: any label, any genre.';
    }
    return o.result === 'dropped' ? '' : `You stay with ${name}.`;
}
/** Sales of her titles for a label since a day (the exclusive's season, read at its renewal). */
const salesSince = (g: Save, label: string, since: number) => peekIndustry(g).titles.filter(t => t.label === label && t.you.includes('perform') && t.contract >= since).reduce((a, t) => a + t.sold, 0);
/** On a season's first Monday, an exclusive is renewed by a season's sales against its line: a raise, as it is, or not
 *  renewed (freelance from today: never jobless). A card in Take says which (a raise or as it is can still be turned
 *  down). The sales are those counted each Monday since the last renewal (`sold`, from `from`), as a season's worth;
 *  the first renewal waits for a season of them, since a title comes out a month and four months after its contract
 *  (L: judged at once, every exclusive was dropped with nothing sold). A contract from before that count is judged
 *  by its titles' sales, once one has sold. Lines. */
export function renewContract(g: Save, w: WorldDef, newId: () => number): string[] {
    const st = industryOf(g), seat = st.seats.perform, c = seat?.contract, d = contractDef(g, w);
    if (!seat || !c || seasonIndex(g) === c.season) return [];
    if (!d) { delete seat.contract; return []; }
    const before = c.from === undefined ? salesSince(g, c.label, c.since) : 0;
    if (c.from === undefined ? !before : seasonIndex(g, c.from) === seasonIndex(g)) return [];
    const weeks = Math.max(1, Math.round((g.day - (c.from ?? g.day)) / 7));
    const sold = c.from === undefined ? before : Math.round((c.sold ?? 0) / weeks * (seasonDays(g) / 7));
    const line = d.renew ?? 0, name = labelOf(w, c.label)?.name ?? c.label;
    const result: Offer['result'] = sold >= line * BOOKINGS.raiseAt && line > 0 ? 'raise' : sold >= line ? 'same' : 'dropped';
    c.season = seasonIndex(g); c.since = g.day; c.from = g.day; c.sold = 0;
    if (result === 'raise') c.fee = Math.min(Math.round(c.fee * BOOKINGS.raise * 100) / 100, Math.round((d.fee ?? 3) * BOOKINGS.raiseMax * 100) / 100);
    if (result === 'dropped') delete seat.contract;
    st.offers.push({ id: newId(), kind: 'renewal', day: g.day, until: g.day + 7, label: c.label, result, amount: sold });
    return [result === 'dropped' ? `${name} didn't renew your exclusive contract: you're freelance from today.` : result === 'raise' ? `${name} renewed your exclusive contract with a raise.` : `${name} renewed your exclusive contract as it is.`];
}

/* ---------- fans ---------- */

/** Fans a release brings (the performer's): by its quality, your fame and an exclusive's `fame`. */
export function releaseFans(g: Save, w: WorldDef, t: TitleRec): number {
    if (!t.you.includes('perform')) return 0;
    const ex = t.label === peekIndustry(g).seats.perform?.contract?.label ? contractDef(g, w)?.fame ?? 2 : 1;
    return Math.round(BOOKINGS.fans * ((t.q ?? 50) / 60) * (1 + fameOf(g, 'perform') / 50) * ex);
}
/** The performer's fan base (grown by releases; sim/fame.ts's `fans` counts those who approached you). */
export const fanBase = (g: Save) => peekIndustry(g).seats.perform?.fans ?? 0;
/** The actress's fan meetings: from Popular name (her track's fourth rank) on, a card each month paying by her fans. */
export function offerMeeting(g: Save, w: WorldDef, newId: () => number): Offer | null {
    const st = industryOf(g), seat = st.seats.perform, j = g.player.job, o = myJob(g, w);
    if (!seat || !j || !o || !inIndustry(g, w) || genderOf(g, YOU) !== 'woman' || j.rank < 3 || !fanBase(g)) return null;
    if (st.offers.some(x => x.kind === 'fans') || (seat.meetings !== undefined && g.day - seat.meetings < monthDays(g))) return null;
    seat.meetings = g.day;
    return { id: newId(), kind: 'fans', day: g.day, until: g.day + monthDays(g), amount: payOf(g, fanBase(g) * BOOKINGS.meeting * payMul(g, w, o, 'tips')) };
}
/** The star-producer's fan club: what it pays this week (her fans), 0 off that path. */
export const fanClubWeek = (g: Save, w: WorldDef) => (inIndustry(g, w) && onPath(g, w, STAR_PATH) ? payOf(g, fanBase(g) * BOOKINGS.club) : 0);
/** An exclusive's title brings more fame (its contract's `fame`, ×2): the share above sim/fame.ts's own release fame
 *  (`fame.titles` × q/60), added to the performer's fame on release. Lines (none). */
export function exclusiveFame(g: Save, w: WorldDef, t: TitleRec): string[] {
    const c = peekIndustry(g).seats.perform?.contract, d = contractDef(g, w);
    if (!industryOn(g, w) || !c || !d || !t.you.includes('perform') || t.label !== c.label || (d.fame ?? 1) <= 1) return [];
    const st = industryOf(g), f = (st.fame ??= {});
    const add = (w.industry?.fame?.titles ?? INDUSTRY.fame.titles) * ((t.q ?? 50) / 60) * ((d.fame ?? 1) - 1);
    f.perform = Math.round(Math.min(100, (f.perform ?? 0) + add) * 10) / 10;
    return [];
}
onRelease.push(exclusiveFame);

/* ---------- the lens ---------- */

/** The entries of the industry's job open to you (on your gender's track, else any track): id, name, path, its when. */
export function entriesOf(g: Save, w: WorldDef): EntryDef[] {
    const o = industryJob(w);
    if (!o) return [];
    const own = trackOf(g, o).entries ?? [];
    return own.length ? own : [...(o.entries ?? []), ...Object.values(o.tracks ?? {}).flatMap(t => t?.entries ?? [])].filter((e, i, l) => l.findIndex(x => x.id === e.id) === i);
}
/** Offers an entry (a storyline stage's `offer`): only while its `when` holds, never to someone already in the
 *  industry's job, kept a season. True when offered. */
export function offerEntry(g: Save, w: WorldDef, id: string): boolean {
    if (!industryOn(g, w) || g.player.job?.id === w.industry!.job) return false;
    const e = entriesOf(g, w).find(x => x.id === id), st = industryOf(g);
    if (!e || st.offers.some(o => o.kind === 'entry' && o.entry === id)) return false;
    if (e.when && !whenHolds(g, w, e.when, { key: `entry|${e.id}` })) return false;
    st.offers.push({ id: st.nextId++, kind: 'entry', day: g.day, until: g.day + seasonDays(g), entry: e.id, label: homeLabel(w)?.id });
    return true;
}
/** Takes an entry's offer: the job you hold is left the normal way (a photographer's reputation and contacts stay), you
 *  are hired onto its path's first rank, a director who came from the lens (never a performer's seat). */
export function takeEntry(g: Save, w: WorldDef, o: Offer): { ok: boolean; text: string } {
    const e = entriesOf(g, w).find(x => x.id === o.entry), st = industryOf(g), job = industryJob(w);
    if (!e || !job || !industryOn(g, w)) return { ok: false, text: '' };
    if (e.when && !whenHolds(g, w, e.when, { key: `entry|${e.id}` })) return { ok: false, text: 'That offer needs what it asked for still to hold.' };
    if (g.player.job) quitJob(g, w);
    const r = hireEntry(g, w, job.id, e.id);
    if (!r.ok) return r;
    st.offers = st.offers.filter(x => x !== o);
    const seat: SeatState = (st.seats.direct ??= { titles: 0 }); seat.lens = true;
    st.test = g.day;
    return r;
}

/* ---------- old saves (schema 10) ---------- */

/** Settles an old save that held a job when it met the industry (schema 10's `industryTodo`), once the world is known:
 *  a player in the industry's job, booked now, keeps job, track, rank, path and shifts, and gets the industry's save
 *  (the first offers come on Monday); anyone else only loses the flag. Returns what to tell the player ('' nothing),
 *  or null when there was nothing to settle. Idempotent. */
export function settleIndustry(g: Save, w: WorldDef): string | null {
    if (!(g as any).industryTodo) return null;
    delete (g as any).industryTodo;
    if (!inIndustry(g, w)) return '';
    industryOf(g);
    return 'Your adult video work now goes title by title: no more shifts. Offers come to the Take app each Monday, with your rank kept.';
}

/* ---------- the texts ---------- */

bookedLink.hired = (g, w) => (industryOn(g, w) ? 'There are no shifts: offers come to Take, one title at a time, each with a contract, a month\'s wait and a shoot day.' : 'Your offers will come to Take, one title at a time.');
bookedLink.line = (g, w) => {
    const o = myJob(g, w);
    if (!o || !inIndustry(g, w)) return '';
    const c = peekIndustry(g).seats.perform?.contract;
    return `{{user}} works as ${rankOf(g, o).name} (${(trackOf(g, o) as any).title ?? o.name}), title by title: no shifts, a contract and a shoot day for each title${c ? `, exclusive to ${labelOf(w, c.label)?.name ?? c.label}` : ''}.`;
};
/** Your bookings this week for the job's screen (sim/titles.ts and the Take app say more). */
export const bookingsWeek = (g: Save, w: WorldDef) => ({ titles: titlesThisWeek(g), burnout: burnout(g, w), testDue: testDue(g), testNext: testNext(g), now: nowAbs(g), events: workRules(g, w).events });
