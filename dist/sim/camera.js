// Camera rules that loosen over a game (the `photography` system). A world person's `cameraSteps` and their tiers'
// `camera` (CameraChange in core/world.ts) latch here, checked every hour and day as tiers are: a step the first time
// its condition holds (a later one brings those before it), a tier's as the tier is reached. Latched is never lost
// (`rel.people[id].camSteps`, read with a default: old saves have none and latch what holds the next hour). As a step
// latches, the hard limits it `lifts` come off the save's copy of their profile and off what anyone knew of them, the
// ones it `adds` go on (learned by whoever knew a limit it lifted: they were told the new rule), and the player sees its
// line once. `cameraOf` (sim/photo.ts) reads the rule. Also the private photo actions' check at run time: nobody here
// whose rule or limits keep them from a private photo (the world's rules, so it holds with photography off too: it took
// the place of the names the overlay's data once wrote into those actions' `when`). With photography off nothing
// latches and no step counts; an adult step only latches, counts and speaks with adult content on.
import { adultOn } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { cameraStepsOf } from '../core/photo.js';
import { onHour, onDay, actionGates } from './hooks.js';
import { relOf, idOf, YOU } from './rel.js';
import { whenHolds } from './when.js';
import { tierReached } from './tiers.js';
import { sceneHere } from './homerooms.js';
import { limitsOf, matchIn } from './private.js';
import { cameraOf, cameraPerson, stepCounts } from './photo.js';
// Two limits are the same one when their words are (case, spaces and stops aside).
const same = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// What a step does to the save as it latches: its limits off and on, in their profile and in what anyone knew.
function applyStep(g, id, s) {
    const people = relOf(g).people, p = (people[id] ??= {});
    (p.camSteps ??= {})[s.key] = g.day;
    const off = new Set((s.lifts ?? []).map(same)), on = s.adds ?? [];
    if (!off.size && !on.length)
        return;
    const i = (p.intimate ??= {});
    const kept = (i.limits ?? []).filter(l => !off.has(same(l)));
    for (const a of on)
        if (!kept.some(l => same(l) === same(a)))
            kept.push(a);
    if (kept.length)
        i.limits = kept;
    else
        delete i.limits;
    if (!Object.keys(i).length)
        delete p.intimate;
    for (const [k, e] of Object.entries(relOf(g).knows ?? {})) {
        if (!k.endsWith(`>${id}`) || !e?.limits?.length)
            continue;
        const left = e.limits.filter(l => !off.has(same(l)));
        if (left.length === e.limits.length)
            continue;
        for (const a of on)
            if (!left.some(l => same(l) === same(a)))
                left.push(a);
        e.limits = left;
    }
}
/** Latches every camera step whose turn it is, for everyone in the game (nobody's while you play them): a person's own
 *  steps the first time one's condition holds (with the unlatched ones before it, in order), a tier's once the tier is
 *  reached. Returns the lines to show (a step's own line, once you've met them). */
export function latchCamera(g, w) {
    if (!systemOn(w, 'photography'))
        return [];
    const out = [];
    for (const r of Object.values(g.cast ?? {})) {
        const id = idOf(g, r.avatar);
        if (!id || id === YOU)
            continue;
        const list = cameraStepsOf(cameraPerson(g, w, r.avatar));
        if (!list.length)
            continue;
        const got = relOf(g).people[id]?.camSteps ?? {};
        const open = (s) => got[s.key] === undefined && stepCounts(g, w, s);
        const own = list.filter(s => s.tier === undefined);
        // the furthest own step that holds now; it brings the unlatched ones before it
        let k = -1;
        for (let i = own.length - 1; i >= 0 && k < 0; i--)
            if (open(own[i]) && own[i].when !== undefined && whenHolds(g, w, own[i].when, { key: `camera|${id}|${own[i].key}` }))
                k = i;
        const now = [...own.slice(0, k + 1).filter(open), ...list.filter(s => s.tier !== undefined && open(s) && tierReached(g, id) >= s.tier)];
        for (const s of now)
            applyStep(g, id, s);
        const last = now.filter(s => s.line?.trim()).at(-1);
        if (last && r.met)
            out.push(last.line.trim().replace(/\{name\}/g, r.name));
    }
    return out;
}
/* ---------- the private photo actions, checked as they're offered ---------- */
// The words that mean a lens (what O's script once baked in as names): a hard limit with one keeps them out too.
export const LENS_WORDS = ['photos', 'photo', 'camera', 'cameras', 'being photographed', 'photographs', 'recording', 'recordings'];
/** Who here keeps a private photo action from being offered: someone whose camera rule isn't free or "asks first", or
 *  whose hard limits meet a lens or the action's own words. '' when nobody does. */
export function lensRefused(g, w, a) {
    const words = [...new Set([...LENS_WORDS, ...(a.matches ?? [])])];
    // ((homerooms) at home with rooms inside, only the room you are in: a housemate down the hall isn't in the photo)
    for (const r of sceneHere(g, w)) {
        if (idOf(g, r.avatar) === YOU)
            continue;
        const rule = cameraOf(g, w, r.avatar);
        if ((rule && rule !== 'ask') || matchIn(g, words, limitsOf(g, r.avatar)))
            return r.name;
    }
    return '';
}
actionGates.push((g, w, a) => {
    if (!a.photo || !a.private || !adultOn(g))
        return '';
    const who = lensRefused(g, w, a);
    return who ? `${who} won't be in a private photo.` : '';
});
/* ---------- work and private life (plans/industry-lens.md Part 4, IQL-3) ---------- */
// Filming a title is work someone agreed to: her camera rule and her limits about cameras are about her private life.
// So the industry's own word test reads a title's camera words as work (the casting and the set: `workWords`), and her
// rule and limits don't hold the stills of a title she's in the cast of, nor its label's promo brief naming her
// (`filmedFor`). Off set they still decide everything: Lens briefs and private photos (`lensRefused` above).
/** Is this a lens word, or a phrase with one (a genre's "camera", the scene "to the camera")? */
export const lensWord = (s) => same(s).split(' ').some(x => LENS_WORDS.includes(x));
/** A title's words as the industry's word test reads them (AV-6, IQL-3): its camera words are the work the cast agreed
 *  to, never a private limit, so they're left out; every other word stays. For sim/titles.ts's `sceneWords` (the
 *  casting) and sim/onset.ts's `wordsOf` (a scene on set). */
export const workWords = (words) => words.filter(x => !lensWord(x));
/** Did they agree to be filmed for this title: in its cast (an avatar, or `roster:<id>`), the title not cancelled? */
export const agreedToFilm = (t, who) => !!t && !t.cancelled && (t.cast ?? []).includes(who);
/** How long after a title's release its promo briefs are still offered (days). */
export const PROMO_DAYS = 14;
const titlesHere = (g) => (g.industry?.titles ?? []);
/** Is a photo of them work they agreed to, so their camera rule and private limits don't hold it (the industry in play:
 *  its system and adult content)? `title`: the stills of that title (its id or record), when they're in its cast.
 *  `client`: a promo brief (`subject.title`), when they're in the cast of one of your titles (that label's, when the
 *  client is one of the industry's labels) from the offer to `PROMO_DAYS` after its release. Neither: never (Lens
 *  briefs and private photos keep their rule). */
export function filmedFor(g, w, who, x) {
    if (!who || who === YOU || !w.industry || !systemOn(w, 'industry') || !adultOn(g))
        return false;
    if (x.title) {
        const t = typeof x.title === 'string' ? titlesHere(g).find(r => r.id === x.title) : x.title;
        if (agreedToFilm(t, who))
            return true;
    }
    if (x.client !== undefined) {
        const label = (w.industry.labels ?? []).some(l => l.id === x.client);
        return titlesHere(g).some(t => (!label || t.label === x.client) && agreedToFilm(t, who) && (t.q === undefined || g.day <= t.release + PROMO_DAYS));
    }
    return false;
}
onHour.push(latchCamera);
onDay.push(latchCamera);
