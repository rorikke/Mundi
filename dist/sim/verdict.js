// The scene verdict (requirements S-14): when a scene ends (you leave, sleep, skip time, someone who spoke leaves,
// every 30 messages, a "Play as" switch), one quiet AI call reads what was said and judges how it changed what each
// resident who spoke feels about you, in a fixed format (`Name | friendship ±n | romance ±n | why`). It judges what
// the in-scene sources missed (it's told what they already counted), so the same warmth isn't counted twice. With
// "Relationships between people" on, it also says how the scene changed what two residents who both spoke feel about
// each other (`A > B | …`).
// Capture, settle, then ask: the scene is read and its messages settled at once (so swiping or hiding lines later
// can't race with it), and the answer is applied when it comes back. A failure applies nothing and isn't retried.
import { saveGame, nowAbs, notify, TUT } from '../core/store.js';
import { systemOn } from '../core/world.js';
import { quiet, personaName, speakerOf } from '../st/bridge.js';
import { openMessages, openTotals, openSince, readyToSettle, settleNow, addSettled, textOf } from './msglog.js';
import { fr, ro, gain, lose, relOf, relCfg, SOURCES, YOU } from './rel.js';
import { facts, factText, placeName } from './facts.js';
import { romanceBlocked, familyBlocked } from './family.js';
import { finishMoments } from './moments.js';
export const MIN_MESSAGES = 4; // passing through a place (a greeting, a word) costs no AI call
export const verdictOn = (g) => relCfg(g).verdict !== false;
const LINE = /^\s*[-*•]?\s*([^|\n>]+?)\s*(?:>\s*([^|\n]+?)\s*)?\|\s*friendship\s*([+-]?\s*\d)\s*\|\s*romance\s*([+-]?\s*\d)\s*\|\s*([^|\n]+?)\s*(?:\|\s*(made\s*up)\s*)?$/i;
const step = (v) => Math.max(-3, Math.min(3, Number(v.replace(/\s+/g, '')) || 0));
export function parseVerdict(text) {
    const out = [];
    for (const raw of String(text ?? '').replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').split('\n')) {
        const m = LINE.exec(raw.replace(/\*\*/g, ''));
        if (!m)
            continue;
        out.push({ name: m[1].trim(), ...(m[2] ? { to: m[2].trim() } : {}), f: step(m[3]), r: step(m[4]), why: m[5].trim().slice(0, 160), madeUp: !!m[6] });
    }
    return out;
}
const NONE = { done: Promise.resolve(null) };
let capturing = false;
// Ends the scene for the records and, when there's enough to judge, asks for the verdict. `end`: the scene is over
// (leaving, sleeping, "Play as"), so it settles even when it's too short to judge; otherwise (a time skip, someone
// leaving, a long scene) nothing happens under 4 messages. Returns the pending answer (applied when it comes).
export async function verdictNow(g, w, reason, { end = false } = {}) {
    if (TUT.save || capturing)
        return NONE;
    capturing = true;
    try {
        await readyToSettle(); // replies still being read are judged first
        const msgs = openMessages();
        if (!end && msgs.length < MIN_MESSAGES)
            return NONE;
        // capture what the scene was
        const me = personaName();
        const spoke = [...new Set(msgs.filter(m => !m.is_user).map(m => speakerOf(m) ?? ''))].filter(a => g.cast[a]?.met);
        const people = spoke.map(a => ({ avatar: a, name: g.cast[a].name }));
        const counted = openTotals(g);
        const since = openSince(g);
        const noted = facts(g).filter(f => f.at >= since).map(f => `- ${placeName(g, w, f.place)}: ${factText(f, me)}`);
        let talk = msgs.map(m => `${m.is_user ? me : String(m.name ?? '')}: ${textOf(m).slice(0, 400)}`).join('\n');
        if (talk.length > 9000)
            talk = talk.slice(-9000);
        const playing = String(g.swap?.avatar ?? '');
        const day = g.day;
        // the moments the story was asked to play with the people who spoke are done (A-0)
        const moments = finishMoments(g, spoke).map(m => `${g.cast[m.who]?.name ?? ''}: ${m.text}`);
        // then settle: from here on, editing these messages changes nothing
        settleNow(`v${nowAbs(g)}`);
        if (msgs.length < MIN_MESSAGES || !people.length || !verdictOn(g)) {
            console.debug('[Mundi] scene verdict skipped:', reason, `${msgs.length} messages`);
            return NONE;
        }
        console.debug('[Mundi] scene verdict queued:', reason, `${msgs.length} messages`);
        const romance = systemOn(w, 'romance');
        const between = systemOn(w, 'relations') && people.length >= 2;
        const already = people.map(p => { const c = counted[p.avatar]; return c && (c.f || c.r) ? `${p.name}: friendship ${c.f >= 0 ? '+' : ''}${c.f.toFixed(1)}${c.r ? `, romance ${c.r >= 0 ? '+' : ''}${c.r.toFixed(1)}` : ''}` : ''; }).filter(Boolean);
        const prompt = `A scene in ${w.name} between ${me} and ${people.map(p => p.name).join(', ')} has just ended.\n\n` +
            `${noted.length ? `What surely happened meanwhile:\n${noted.join('\n')}\n\n` : ''}What was said:\n${talk}\n\n` +
            `${moments.length ? `The story asked for these moments in this scene (judge how ${me} responded to them, if they happened): ${moments.join(' ')}\n\n` : ''}` +
            `${already.length ? `Already counted during the scene (from talking and warm replies, in points): ${already.join('; ')}. Judge only what that missed; do not count the same warmth again.\n\n` : ''}` +
            `Judge how this scene changed how each of these people feels about ${me}: ${people.map(p => p.name).join(', ')}. Write one line for each, exactly like this:\n` +
            `Name | friendship +1 | romance 0 | a short reason\n` +
            `Friendship${romance ? ' and romance go' : ' goes'} from -3 to +3; 0 when nothing changed. ${romance ? 'Romance only moves with flirting, a date or intimacy. ' : 'Always write romance 0. '}` +
            `Insults, fights, cruelty or broken promises are negative. Be honest, not generous. ` +
            (between ? `When the scene clearly changed how one of them feels about another of them (not about ${me}), add a line for that too, like this:
${people[0].name} > ${people[1].name} | friendship -1 | romance 0 | a short reason
` : '') +
            `Write only the lines.`;
        const done = quiet(prompt, 400, 'You judge how a scene changed relationships. You answer only with lines in the given format.')
            .then(out => apply(g, w, out, people, playing, day))
            .catch(e => { console.warn('[Mundi] scene verdict', e); return null; });
        return { done };
    }
    finally {
        capturing = false;
    }
}
// Applies an answer to the values as they are now. Each step is worth 2 points; gains are paced, losses in full.
function apply(g, w, out, people, playing, day) {
    const lines = parseVerdict(out);
    if (!lines.length) {
        console.debug('[Mundi] scene verdict: no usable lines');
        return null;
    }
    // toward whom: you, unless you switched to someone else since (then the one you were)
    const sw = g.swap;
    const to = String(sw?.avatar ?? '') === playing ? YOU : (playing || String(sw?.origCard ?? '') || YOU);
    const changes = [];
    const st = relOf(g);
    const who = (n) => people.find(x => x.name.toLowerCase() === n.toLowerCase());
    const done = new Set();
    for (const l of lines) {
        if (l.to) { // "A > B": how A's feelings for B changed (both spoke in the scene)
            const a = who(l.name), b = who(l.to);
            if (!a || !b || a === b || !systemOn(w, 'relations') || done.has(`${a.avatar}>${b.avatar}`))
                continue;
            done.add(`${a.avatar}>${b.avatar}`);
            const ch = moveBy(g, a.avatar, b.avatar, l.f, systemOn(w, 'romance') && !familyBlocked(g, a.avatar, b.avatar) ? l.r : 0);
            if (ch.length)
                addSettled(g, { fp: 'verdict', who: a.avatar, kind: 'verdict', at: nowAbs(g), why: `${l.why} (${b.name})`, ch });
            continue;
        }
        const p = who(l.name);
        if (!p || changes.some(c => c.avatar === p.avatar))
            continue;
        const f0 = Math.round(fr(g, p.avatar, to)), r0 = Math.round(ro(g, p.avatar, to));
        const ch = moveBy(g, p.avatar, to, l.f, systemOn(w, 'romance') && !romanceBlocked(g, p.avatar) ? l.r : 0);
        changes.push({ avatar: p.avatar, name: p.name, why: l.why, f0, f1: Math.round(fr(g, p.avatar, to)), r0, r1: Math.round(ro(g, p.avatar, to)) });
        addSettled(g, { fp: 'verdict', who: p.avatar, kind: 'verdict', at: nowAbs(g), why: l.why, ch });
        if (st.day?.day === day)
            (st.day.why[p.avatar] ??= []).push(l.why);
    }
    saveGame();
    notify();
    return { day, changes };
}
// x's feelings toward y move by verdict steps (gains paced, losses in full); returns what changed, for the records.
function moveBy(g, x, y, f, r) {
    const ch = [];
    for (const [m, steps] of [['f', f], ['r', r]]) {
        const n = steps * SOURCES.verdict;
        if (n > 0) {
            const a = gain(g, m, x, y, n);
            if (a.d || a.fat)
                ch.push({ x, y, m, ...a });
        }
        else if (n < 0) {
            const d = lose(g, m, x, y, n);
            if (d)
                ch.push({ x, y, m, d: -d, fat: 0 });
        }
    }
    return ch;
}
/* ---------- the end of the day ---------- */
// A copy of the day's start values (take it before the night passes: a change after midnight starts a new day).
export const daySnapshot = (g, day) => { const d = relOf(g).day; return d?.day === day ? structuredClone(d) : null; };
// How the day went with everyone: from the day's start values to now, whatever moved them; the reasons come from
// the day's verdicts (and the last one's, when it came after the night).
export function dayChanges(g, start, last) {
    if (!start)
        return last?.changes ?? [];
    const why = (a) => [...(start.why[a] ?? []), ...(last?.changes.filter(c => c.avatar === a).map(c => c.why) ?? [])];
    const ids = new Set([...Object.keys(start.snap), ...Object.keys(g.cast)]);
    const out = [];
    for (const a of ids) {
        if (!g.cast[a] || a === YOU)
            continue;
        const [f0, r0] = (start.snap[a] ?? [0, 0]).map(Math.round);
        const f1 = Math.round(fr(g, a, YOU)), r1 = Math.round(ro(g, a, YOU));
        if (f0 === f1 && r0 === r1)
            continue;
        out.push({ avatar: a, name: g.cast[a].name, why: [...new Set(why(a))].join('; '), f0, f1, r0, r1 });
    }
    return out;
}
/* ---------- someone who spoke left ---------- */
// Called when the scene's people change (syncScene): a resident who spoke and isn't here any more ends that part.
export function checkLeft(g, w, here) {
    const msgs = openMessages();
    if (msgs.length < MIN_MESSAGES)
        return;
    const gone = msgs.some(m => { const a = !m.is_user && speakerOf(m); return a && g.cast[a] && !here.includes(a); });
    if (gone)
        void verdictNow(g, w, 'someone who spoke left');
}
