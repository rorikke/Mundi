import { chat, hideMessages, setPrompt } from '../st/bridge.js';
import { note, placeName } from './facts.js';
import { verdictNow } from './verdict.js';
// Where this visit starts in the chat. A mark past the end (lines deleted, or an old copied save) falls back to just
// after the last hidden line, so the scene still shows what was said in it.
export const visitStart = (g) => {
    const list = chat();
    const v = g.visitStart ?? 0;
    if (v <= list.length)
        return v;
    let i = list.length;
    while (i > 0 && !list[i - 1]?.is_system)
        i--;
    return i;
};
export const recaps = (g) => (g.recaps ??= []);
// Returns the scene verdict's pending answer (applied when it comes; sleep waits for it before the day's recap).
export async function endVisit(g, w) {
    // the scene is over: it's judged, and what its messages changed stays, even if they're edited or deleted later
    const judged = await verdictNow(g, w, 'the scene ended', { end: true });
    const list = chat();
    const start = visitStart(g), end = list.length - 1;
    g.visitStart = list.length;
    setPrompt('mundi_roll', '');
    const lines = list.slice(start).filter(m => !m.is_system && String(m.mes ?? '').trim());
    if (!lines.length)
        return judged;
    await hideMessages(start, end);
    // what is kept is a fact, written by the engine (no AI summary): who you spent time with, and where
    const talked = new Set(lines.filter(m => !m.is_user && !m.extra?.mundi_narrator).map(m => String(m.name ?? '')));
    const who = Object.values(g.cast).filter(r => talked.has(r.name));
    if (who.length)
        note(g, '{u} spent time with {0} at {1}.', [who.map(r => r.name).join(', '), placeName(g, w, g.player.loc)], who.map(r => r.avatar), g.player.loc, 'visit');
    return judged;
}
// For the world prompt: what happened earlier (the last few visits).
export function recapLines(g) {
    const list = recaps(g).filter(r => r.text).slice(-4);
    return list.length ? `Earlier: ${list.map(r => `(day ${r.day}, ${r.place}) ${r.text}`).join(' ')}` : '';
}
