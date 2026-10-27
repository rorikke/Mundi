// The scene verdict (requirements S-14): when a scene ends (you leave, sleep, skip time, someone who spoke leaves,
// every 30 messages, a "Play as" switch), one quiet AI call reads what was said and judges how it changed what each
// resident who spoke feels about you, in a fixed format (`Name | friendship ±n | romance ±n | why`). It judges what
// the in-scene sources missed (it's told what they already counted), so the same warmth isn't counted twice.
// Capture, settle, then ask: the scene is read and its messages settled at once (so swiping or hiding lines later
// can't race with it), and the answer is applied when it comes back. A failure applies nothing and isn't retried.
import { saveGame, nowAbs, notify, TUT, type Save } from '../core/store.js';
import { systemOn, type WorldDef } from '../core/world.js';
import { quiet, personaName, speakerOf } from '../st/bridge.js';
import { openMessages, openTotals, openSince, readyToSettle, settleNow, addSettled, textOf } from './msglog.js';
import { fr, ro, gain, lose, relOf, relCfg, SOURCES, YOU, type Applied, type DaySnap, type Meter } from './rel.js';
import { facts, factText, placeName } from './facts.js';
import { romanceBlocked } from './family.js';
import type { Change } from './romance.js';

export const MIN_MESSAGES = 4;   // passing through a place (a greeting, a word) costs no AI call
export const verdictOn = (g: Save) => relCfg(g).verdict !== false;

/* ---------- the answer ---------- */

/** One line of a verdict. `to`: an "A > B" line (how A's feelings for B changed), read but applied only once feelings
 *  between people move. `madeUp`: the optional "made up" marker (a grudge resolved; used later). */
export interface VerdictLine { name: string; to?: string; f: number; r: number; why: string; madeUp: boolean }
const LINE = /^\s*[-*•]?\s*([^|\n>]+?)\s*(?:>\s*([^|\n]+?)\s*)?\|\s*friendship\s*([+-]?\s*\d)\s*\|\s*romance\s*([+-]?\s*\d)\s*\|\s*([^|\n]+?)\s*(?:\|\s*(made\s*up)\s*)?$/i;
const step = (v: string) => Math.max(-3, Math.min(3, Number(v.replace(/\s+/g, '')) || 0));
export function parseVerdict(text: string): VerdictLine[] {
    const out: VerdictLine[] = [];
    for (const raw of String(text ?? '').replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').split('\n')) {
        const m = LINE.exec(raw.replace(/\*\*/g, ''));
        if (!m) continue;
        out.push({ name: m[1].trim(), ...(m[2] ? { to: m[2].trim() } : {}), f: step(m[3]), r: step(m[4]), why: m[5].trim().slice(0, 160), madeUp: !!m[6] });
    }
    return out;
}

/* ---------- judging a scene ---------- */

export interface Verdict { day: number; changes: Change[] }
const NONE = { done: Promise.resolve(null as Verdict | null) };
let capturing = false;

// Ends the scene for the records and, when there's enough to judge, asks for the verdict. `end`: the scene is over
// (leaving, sleeping, "Play as"), so it settles even when it's too short to judge; otherwise (a time skip, someone
// leaving, a long scene) nothing happens under 4 messages. Returns the pending answer (applied when it comes).
export async function verdictNow(g: Save, w: WorldDef, reason: string, { end = false } = {}): Promise<{ done: Promise<Verdict | null> }> {
    if (TUT.save || capturing) return NONE;
    capturing = true;
    try {
        await readyToSettle();   // replies still being read are judged first
        const msgs = openMessages();
        if (!end && msgs.length < MIN_MESSAGES) return NONE;
        // capture what the scene was
        const me = personaName();
        const spoke = [...new Set(msgs.filter(m => !m.is_user).map(m => speakerOf(m) ?? ''))].filter(a => g.cast[a]?.met);
        const people = spoke.map(a => ({ avatar: a, name: g.cast[a].name }));
        const counted = openTotals(g);
        const since = openSince(g);
        const noted = facts(g).filter(f => f.at >= since).map(f => `- ${placeName(g, w, f.place)}: ${factText(f, me)}`);
        let talk = msgs.map(m => `${m.is_user ? me : String(m.name ?? '')}: ${textOf(m).slice(0, 400)}`).join('\n');
        if (talk.length > 9000) talk = talk.slice(-9000);
        const playing = String((g as any).swap?.avatar ?? '');
        const day = g.day;
        // then settle: from here on, editing these messages changes nothing
        settleNow(`v${nowAbs(g)}`);
        if (msgs.length < MIN_MESSAGES || !people.length || !verdictOn(g)) { console.debug('[Mundi] scene verdict skipped:', reason, `${msgs.length} messages`); return NONE; }
        console.debug('[Mundi] scene verdict queued:', reason, `${msgs.length} messages`);
        const romance = systemOn(w, 'romance');
        const already = people.map(p => { const c = counted[p.avatar]; return c && (c.f || c.r) ? `${p.name}: friendship ${c.f >= 0 ? '+' : ''}${c.f.toFixed(1)}${c.r ? `, romance ${c.r >= 0 ? '+' : ''}${c.r.toFixed(1)}` : ''}` : ''; }).filter(Boolean);
        const prompt = `A scene in ${w.name} between ${me} and ${people.map(p => p.name).join(', ')} has just ended.\n\n` +
            `${noted.length ? `What surely happened meanwhile:\n${noted.join('\n')}\n\n` : ''}What was said:\n${talk}\n\n` +
            `${already.length ? `Already counted during the scene (from talking and warm replies, in points): ${already.join('; ')}. Judge only what that missed; do not count the same warmth again.\n\n` : ''}` +
            `Judge how this scene changed how each of these people feels about ${me}: ${people.map(p => p.name).join(', ')}. Write one line for each, exactly like this:\n` +
            `Name | friendship +1 | romance 0 | a short reason\n` +
            `Friendship${romance ? ' and romance go' : ' goes'} from -3 to +3; 0 when nothing changed. ${romance ? 'Romance only moves with flirting, a date or intimacy. ' : 'Always write romance 0. '}` +
            `Insults, fights, cruelty or broken promises are negative. Be honest, not generous. Write only the lines.`;
        const done = quiet(prompt, 400, 'You judge how a scene changed relationships. You answer only with lines in the given format.')
            .then(out => apply(g, w, out, people, playing, day))
            .catch(e => { console.warn('[Mundi] scene verdict', e); return null; });
        return { done };
    } finally { capturing = false; }
}

// Applies an answer to the values as they are now. Each step is worth 2 points; gains are paced, losses in full.
function apply(g: Save, w: WorldDef, out: string, people: { avatar: string; name: string }[], playing: string, day: number): Verdict | null {
    const lines = parseVerdict(out);
    if (!lines.length) { console.debug('[Mundi] scene verdict: no usable lines'); return null; }
    // toward whom: you, unless you switched to someone else since (then the one you were)
    const sw = (g as any).swap;
    const to = String(sw?.avatar ?? '') === playing ? YOU : (playing || String(sw?.origCard ?? '') || YOU);
    const changes: Change[] = [];
    const st = relOf(g);
    for (const l of lines) {
        if (l.to) continue;   // "A > B": feelings between people don't move yet
        const p = people.find(x => x.name.toLowerCase() === l.name.toLowerCase());
        if (!p || changes.some(c => c.avatar === p.avatar)) continue;
        const f0 = Math.round(fr(g, p.avatar, to)), r0 = Math.round(ro(g, p.avatar, to));
        const ch: { x: string; y: string; m: Meter; d: number; fat: number }[] = [];
        const move = (m: Meter, steps: number) => {
            const n = steps * SOURCES.verdict;
            if (n > 0) { const a: Applied = gain(g, m, p.avatar, to, n); if (a.d || a.fat) ch.push({ x: p.avatar, y: to, m, ...a }); }
            else if (n < 0) { const d = lose(g, m, p.avatar, to, n); if (d) ch.push({ x: p.avatar, y: to, m, d: -d, fat: 0 }); }
        };
        move('f', l.f);
        if (systemOn(w, 'romance') && !romanceBlocked(g, p.avatar)) move('r', l.r);
        changes.push({ avatar: p.avatar, name: p.name, why: l.why, f0, f1: Math.round(fr(g, p.avatar, to)), r0, r1: Math.round(ro(g, p.avatar, to)) });
        addSettled(g, { fp: 'verdict', who: p.avatar, kind: 'verdict', at: nowAbs(g), why: l.why, ch });
        if (st.day?.day === day) (st.day.why[p.avatar] ??= []).push(l.why);
    }
    saveGame(); notify();
    return { day, changes };
}

/* ---------- the end of the day ---------- */

// A copy of the day's start values (take it before the night passes: a change after midnight starts a new day).
export const daySnapshot = (g: Save, day: number): DaySnap | null => { const d = relOf(g).day; return d?.day === day ? structuredClone(d) : null; };
// How the day went with everyone: from the day's start values to now, whatever moved them; the reasons come from
// the day's verdicts (and the last one's, when it came after the night).
export function dayChanges(g: Save, start: DaySnap | null, last: Verdict | null): Change[] {
    if (!start) return last?.changes ?? [];
    const why = (a: string) => [...(start.why[a] ?? []), ...(last?.changes.filter(c => c.avatar === a).map(c => c.why) ?? [])];
    const ids = new Set([...Object.keys(start.snap), ...Object.keys(g.cast)]);
    const out: Change[] = [];
    for (const a of ids) {
        if (!g.cast[a] || a === YOU) continue;
        const [f0, r0] = (start.snap[a] ?? [0, 0]).map(Math.round);
        const f1 = Math.round(fr(g, a, YOU)), r1 = Math.round(ro(g, a, YOU));
        if (f0 === f1 && r0 === r1) continue;
        out.push({ avatar: a, name: g.cast[a].name, why: [...new Set(why(a))].join('; '), f0, f1, r0, r1 });
    }
    return out;
}

/* ---------- someone who spoke left ---------- */

// Called when the scene's people change (syncScene): a resident who spoke and isn't here any more ends that part.
export function checkLeft(g: Save, w: WorldDef, here: string[]) {
    const msgs = openMessages();
    if (msgs.length < MIN_MESSAGES) return;
    const gone = msgs.some(m => { const a = !m.is_user && speakerOf(m); return a && g.cast[a] && !here.includes(a); });
    if (gone) void verdictNow(g, w, 'someone who spoke left');
}
