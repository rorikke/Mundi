// What each message changed, so feelings follow the chat (swipe, regenerate, edit, continue, delete or reload).
// Every change a message causes (your line's talk, the reaction in a reply) is recorded against a fingerprint of
// its speaker and text. After any change to the chat, reconcile() compares the open messages (those since the last
// settle point) with the records: a record whose message is gone (deleted, swiped away, regenerated, edited) is
// undone exactly, and a message without a record is judged. Leaving a place or sleeping settles the scene: its
// messages are marked, their records are dropped (kept a day while the debug view is on, to be looked at and undone
// by hand), and changing them later changes nothing.
//
// The emotion read in a reply is kept on the message itself (`extra.mundi_ex`, with the fingerprint of the text it
// belongs to), so a label SillyTavern copies onto a new swipe is recognized as stale, and an earlier swipe shown
// again needs no new AI call.
import { game, saveGame, nowAbs, state, TUT, type Save } from '../core/store.js';
import { getWorld } from '../core/world.js';
import { chat, saveChat, speakerOf, expressionOf, replying, currentChatId, type Expr } from '../st/bridge.js';
import { presentAt } from './people.js';
import { gain as gainMeter, undoGain, relCfg, SOURCES, YOU, type Meter } from './rel.js';
import { reactionGain } from './mood.js';

/** One meter change: `x`'s meter `m` toward `y` (you when absent) moved by `d`, its pacing weight by `fat`. */
interface Change { x: string; y?: string; m: Meter; d: number; fat: number }
/** What one message changed. `fp` identifies the message (speaker and text); `why` says what was judged; `undone`:
 *  taken back by hand (the record stays, so the message isn't judged again). */
export interface Rec { id?: number; fp: string; who: string; kind: 'line' | 'reply'; at: number; why: string; label?: string; ch: Change[]; undone?: true }
interface Log { chat: string; open: Rec[]; settled?: Rec[]; n?: number }
/** The emotion read in a reply: k 'l' a label, 'f' the classifier failed, 'n' there is no classifier. */
interface Ex { fp: string; k: 'l' | 'f' | 'n'; l?: string }

const logOf = (g: Save): Log | undefined => ((g as any).rel ??= {}).log;

/* ---------- fingerprints ---------- */

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
// the words of a message as the AI and the classifier see them (no thinking, whitespace collapsed)
const textOf = (m: any) => String(m?.mes ?? '')
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').replace(/<(think|thinking|reasoning)>[\s\S]*$/i, '')
    .replace(/\s+/g, ' ').trim();
const speakerKey = (m: any) => (m.is_user ? YOU : speakerOf(m) ?? String(m.name ?? ''));
export const fpOf = (m: any) => fnv(`${speakerKey(m)}\n${textOf(m)}`);
const isLine = (m: any) => m && !m.is_system && textOf(m) !== '';

// The open messages: everything after the last settled one (system lines, like the narrator's, don't count).
function openWindow(list: any[]): any[] {
    let start = list.length;
    while (start > 0 && !list[start - 1]?.extra?.mundi_settled) start--;
    return list.slice(start).filter(isLine);
}

/* ---------- emotions ---------- */

// Results kept for this session too (a reply swiped away while it was being read gets its answer when shown again).
const known = new Map<string, Ex>();
const pending = new Set<string>();
const tries = new Map<string, number>();
const RETRIES = 2;

function exOf(m: any, fp = fpOf(m)): Ex | undefined {
    const ex = m?.extra?.mundi_ex as Ex | undefined;
    if (ex?.fp === fp) return ex;
    const k = known.get(fp);
    if (k) { m.extra = { ...(m.extra ?? {}), mundi_ex: k, mundi_expr: k.l ?? null }; saveChat(); }
    return k;
}

// The emotion to show for a line (sprites): its own, a stale one copied from another swipe counts as none yet.
// Lines from before Mundi kept fingerprints only have `mundi_expr`.
export function labelOf(m: any): string | null {
    if (!m || m.is_user || m.is_system) return null;
    if (m.extra?.mundi_ex) return exOf(m)?.l ?? null;
    return known.get(fpOf(m))?.l ?? m.extra?.mundi_expr ?? null;
}

// Reads a reply's emotion in the background (queued with Mundi's other AI calls); a failure is tried again twice.
function classify(fp: string, text: string) {
    if (pending.has(fp)) return;
    pending.add(fp);
    void expressionOf(text).then(async (res: Expr) => {
        if (res === 'failed' && (tries.get(fp) ?? 0) < RETRIES) {
            tries.set(fp, (tries.get(fp) ?? 0) + 1);
            await new Promise(r => setTimeout(r, 1500));
            pending.delete(fp);
            schedule(0);
            return;
        }
        const ex: Ex = res === 'none' ? { fp, k: 'n' } : res === 'failed' ? { fp, k: 'f' } : { fp, k: 'l', l: res.label };
        known.set(fp, ex);
        tries.delete(fp);
        pending.delete(fp);
        for (const m of chat()) if (!m.is_user && !m.is_system && fpOf(m) === fp) m.extra = { ...(m.extra ?? {}), mundi_ex: ex, mundi_expr: ex.l ?? null };
        saveChat();
        schedule(0);
    }).catch(() => { pending.delete(fp); });
}

/* ---------- judging and undoing ---------- */

// Friendship toward you gained (paced), recorded so it can be taken back exactly.
function gain(g: Save, a: string, n: number): Change | null {
    const r = gainMeter(g, 'f', a, YOU, n);
    return r.d || r.fat ? { x: a, m: 'f', d: r.d, fat: r.fat } : null;
}
function undo(g: Save, r: Rec) {
    for (const c of r.ch) undoGain(g, c.m ?? 'f', c.x, c.y ?? YOU, { d: c.d, fat: c.fat });
}

// Your line: a little closer to everyone in the conversation (residents here who have spoken in this scene; only
// the one you talk to, when talking alone). Bystanders who never spoke gain nothing.
function judgeLine(g: Save, fp: string, speakers: Set<string>): Rec {
    const w = getWorld(g.world);
    const solo = String((g as any).social?.solo ?? '');
    const hearers = w ? presentAt(g, w, g.player.loc).filter(r => r.met && (solo ? r.avatar === solo : speakers.has(r.avatar))) : [];
    const ch = hearers.map(r => gain(g, r.avatar, SOURCES.talk)).filter((c): c is Change => !!c);
    return { fp, who: YOU, kind: 'line', at: nowAbs(g), why: 'talk', ch };
}
// A reply: a warm reaction brings the speaker closer (once you've met).
function judgeReply(g: Save, m: any, fp: string, ex: Ex): Rec {
    const who = speakerOf(m) ?? '';
    const n = ex.k === 'l' ? reactionGain(ex.l ?? '') : 0;
    const c = n && who && g.cast[who]?.met ? gain(g, who, n) : null;
    return { fp, who, kind: 'reply', at: nowAbs(g), why: ex.k === 'l' ? ex.l! : ex.k === 'f' ? 'not read (classifier failed)' : 'no classifier', label: ex.l, ch: c ? [c] : [] };
}

/* ---------- reconcile ---------- */

let timer: any = null;
// Reconciles soon (changes to the chat come in bursts: a swipe is a delete, a generation, a render…).
export function schedule(ms = 300) {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; reconcile(); }, ms);
}

// Marks the messages after the last settled one (all of them in a chat that has none) as settled.
function markSettled(list: any[], id: string) {
    let n = 0;
    for (let i = list.length - 1; i >= 0 && !list[i]?.extra?.mundi_settled; i--) { list[i].extra = { ...(list[i].extra ?? {}), mundi_settled: id }; n++; }
    if (n) saveChat();
}

export function reconcile() {
    if (TUT.save) return;   // the tutorial's lines aren't a chat
    if (replying()) { schedule(1000); return; }   // never while a reply is being written
    const list = chat();
    const g = game();
    if (!g) { if (state.open && state.view === 'chat') sprites(list); return; }   // other chats: only Mundi's chat view reads emotions
    let log = logOf(g);
    // the first time (a save from before records, or a chat copied from another): what's already there is settled
    const chatId = currentChatId();
    if (!log || log.chat !== chatId) {
        markSettled(list, 'start');
        (g as any).rel.log = { chat: chatId, open: [] } as Log;
        saveGame();
        return;
    }
    const win = openWindow(list);
    const msgs = new Map<string, any[]>();
    for (const m of win) { const fp = fpOf(m); (msgs.get(fp) ?? msgs.set(fp, []).get(fp)!).push(m); }
    let changed = false;
    // records whose message is gone (more records with a fingerprint than open messages with it): undo the newest
    const byFp = new Map<string, number[]>();
    log.open.forEach((r, i) => (byFp.get(r.fp) ?? byFp.set(r.fp, []).get(r.fp)!).push(i));
    const drop = new Set<number>();
    for (const [fp, idx] of byFp) for (let k = 0; k < idx.length - (msgs.get(fp)?.length ?? 0); k++) drop.add(idx[idx.length - 1 - k]);
    for (let i = log.open.length - 1; i >= 0; i--) if (drop.has(i)) { undo(g, log.open[i]); log.open.splice(i, 1); changed = true; }
    // messages without a record, oldest first
    const recs = new Map<string, number>();
    for (const r of log.open) recs.set(r.fp, (recs.get(r.fp) ?? 0) + 1);
    const used = new Map<string, number>();
    const speakers = new Set(win.filter(m => !m.is_user).map(m => speakerOf(m) ?? ''));
    const add = (r: Rec) => { r.id = log!.n = (log!.n ?? 0) + 1; log!.open.push(r); changed = true; };
    for (const m of win) {
        const fp = fpOf(m);
        const u = (used.get(fp) ?? 0) + 1; used.set(fp, u);
        if (u <= (recs.get(fp) ?? 0)) continue;   // this one already has its record
        if (m.is_user) { add(judgeLine(g, fp, speakers)); continue; }
        const ex = exOf(m, fp);
        if (!ex) { classify(fp, textOf(m)); continue; }
        add(judgeReply(g, m, fp, ex));
        recs.set(fp, (recs.get(fp) ?? 0) + 1);
    }
    if (changed) { saveGame(); notifyLater(); }
}

// Outside a game (a chat with characters): only the emotions of the last replies, for the sprites. A label from
// before fingerprints (`mundi_expr` alone) is kept as it is.
function sprites(list: any[]) {
    const old = (m: any) => m.extra?.mundi_expr !== undefined && !m.extra?.mundi_ex;
    for (const m of list.slice(-6)) if (!m.is_user && isLine(m) && !old(m) && !exOf(m)) classify(fpOf(m), textOf(m));
}

// Redraws once the records changed (imported lazily: the screen's store is loaded already).
const notifyLater = () => { void import('../core/store.js').then(s => s.notify()); };

/* ---------- settling ---------- */

// Ends the undo window: the open messages are marked settled and their records dropped (their changes stay). With
// the debug view on, the last game day's records are kept to be looked at (and corrected by hand).
export function settleNow(id: string) {
    const g = game();
    if (!g || TUT.save) return;
    const log = logOf(g);
    markSettled(chat(), id);
    if (log) {
        if (relCfg(g).debug) log.settled = [...(log.settled ?? []), ...log.open].filter(r => r.at >= nowAbs(g) - 1440);
        else delete log.settled;
        log.open = [];
    }
    saveGame();
}
// The same at the end of a scene, after the replies still being read have been judged (a few seconds at most).
export async function settleScene(id: string) {
    if (TUT.save || !game()) return;
    for (let t = 0; pending.size && t < 8000; t += 250) await new Promise(r => setTimeout(r, 250));
    reconcile();
    settleNow(id);
}

/* ---------- debugging ---------- */

// The records: open ones (the scene still going), then the settled ones kept for the debug view, newest first.
export function records(g: Save): (Rec & { settled: boolean })[] {
    const log = logOf(g);
    if (!log) return [];
    if (log.settled && !relCfg(g).debug) delete log.settled;
    return [...log.open.map(r => ({ ...r, settled: false })), ...(log.settled ?? []).map(r => ({ ...r, settled: true }))].sort((a, b) => b.at - a.at || (b.id ?? 0) - (a.id ?? 0));
}
// Takes back one record by hand (the debug view): an open one exactly, a settled one only on the meter (its pacing
// weight has faded). The record stays, marked undone, so its message isn't judged again.
export function undoRecord(g: Save, id: number): boolean {
    const log = logOf(g);
    const open = log?.open.find(r => r.id === id), done = open ?? log?.settled?.find(r => r.id === id);
    if (!done || done.undone) return false;
    for (const c of done.ch) undoGain(g, c.m ?? 'f', c.x, c.y ?? YOU, { d: c.d, fat: c.fat }, !open);
    done.ch = []; done.undone = true;
    saveGame();
    return true;
}

// The open records, for the console (`Mundi.ledger()`).
export function ledger() {
    const g = game(); const log = g && logOf(g);
    if (!log) return [];
    return log.open.map(r => ({ who: r.who === YOU ? 'you' : g!.cast[r.who]?.name ?? r.who, kind: r.kind, why: r.why, changes: r.ch.map(c => `${g!.cast[c.x]?.name ?? c.x} ${c.d >= 0 ? '+' : ''}${c.d}`).join(', '), fp: r.fp }));
}
