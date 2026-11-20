// Waiting for something you're going to (sim/waitgo.ts): from the Calendar, "Wait and go" asks first (when you'd leave
// and arrive, and what waiting would make you miss), then lets the time pass until it's time to leave and makes the
// trip, so you arrive as it starts; from the clock's "Let time pass?", waiting until it's time to leave, without the
// trip. Too late to wait: it's "Go now", with when you'll get there. Something called off or cancelled meanwhile: no
// trip.
import { esc, game, notify, toast, saveGame, state, nowAbs, type Save } from '../core/store.js';
import { getWorld, type WorldDef } from '../core/world.js';
import { hm } from '../sim/time.js';
import { advance } from '../sim/time.js';
import { placeOf } from '../sim/places.js';
import { verdictNow } from '../sim/verdict.js';
import { syncScene } from '../sim/game.js';
import { findTarget, nextTarget, leaveAt, tripTo, wouldMiss, type Target } from '../sim/waitgo.js';
import { showTransition } from './lifeui.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';

export const WG = { kind: '', id: '' };

/** The Calendar's button on something you're going to. */
export const waitGoBtn = (t: { kind: string; id: string }) => `<button class="mu-primary" data-act="wg-ask" data-kind="${esc(t.kind)}" data-id="${esc(t.id)}" title="Wait until it's time to leave, then go">${icon('skip')}<span>Wait and go</span></button>`;

const missHtml = (list: string[]) => (list.length ? `<p class="mu-bad">Waiting means missing:</p><ul class="mu-wg-miss">${list.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '');

/** The confirmation (the Calendar's "Wait and go"). */
export function waitGoHtml(): string {
    const g = game(); const w = g && getWorld(g.world);
    if (!WG.kind || !g || !w) return '';
    const t = findTarget(g, w, WG.kind, WG.id);
    if (!t) { WG.kind = ''; return ''; }
    const now = nowAbs(g), trip = tripTo(g, w, t.place), leave = leaveAt(g, w, t), where = placeOf(g, w, t.place)?.name ?? '';
    const there = trip === 0, late = leave <= now;
    const line = there ? `You're there: wait until ${hm(t.at % 1440)}.`
        : late ? `It's ${trip} min there: you'd arrive at ${hm((now + trip) % 1440)}.`
        : `Leave at ${hm(leave % 1440)} (${trip} min there) and arrive at ${hm(t.at % 1440)}.`;
    return `<div class="mu-dlg-veil" data-act="wg-no"></div><div class="mu-panel mu-dlg mu-glassdlg mu-outback mu-wg" role="dialog"><h3>${esc(late && !there ? 'Go now?' : 'Wait, then go?')}</h3>
        <p><b data-notr>${esc(t.title)}</b> <span class="mu-muted">· <span data-notr>${esc(where)}</span></span></p>
        <p class="mu-muted">${esc(line)}</p>${missHtml(wouldMiss(g, w, there ? t.at : leave, t))}
        <div class="mu-row mu-dlg-btns"><button data-act="wg-no">Not now</button><button class="mu-primary" data-act="wg-yes">${icon(late && !there ? 'map' : 'skip')}<span>${esc(late && !there ? 'Go now' : there ? 'Wait' : 'Wait and go')}</span></button></div></div>`;
}

/** The clock's "Let time pass?": waiting until it's time to leave for the next thing (none: nothing). */
export function clockWaitHtml(g: Save, w: WorldDef): string {
    const t = nextTarget(g, w); if (!t) return '';
    const leave = leaveAt(g, w, t), there = tripTo(g, w, t.place) === 0;
    return `<div class="mu-wg-clock"><p class="mu-muted">${esc(there ? `${t.title} starts at ${hm(t.at % 1440)}, here.` : `Time to leave for ${t.title} at ${hm(leave % 1440)}.`)}</p>${missHtml(wouldMiss(g, w, leave, t))}</div>`;
}
export const clockWaitBtn = (g: Save, w: WorldDef) => { const t = nextTarget(g, w); return t ? `<button data-act="wg-clock" data-kind="${esc(t.kind)}" data-id="${esc(t.id)}">${icon('clock')}<span>${esc(`Until ${hm(leaveAt(g, w, t) % 1440)}`)}</span></button>` : ''; };

// Let the time pass until `until` (absolute), as the clock's skip does: the scene's verdict first, then the time, the
// plans, the scene.
async function waitUntil(g: Save, w: WorldDef, until: number) {
    const mins = until - nowAbs(g); if (mins <= 0) return;
    await verdictNow(g, w, 'time skipped');
    advance(g, w, mins).forEach(m => toast(m, 'warn'));
    showTransition(hm(g.minutes), `Day ${g.day}`, 'time');
    const { runPlans } = await import('./plans.js'); runPlans();
    saveGame();
}
async function run(kind: string, id: string, go: boolean) {
    const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
    if (state.generating) { toast('Wait until they finish speaking.', 'info'); return; }
    const t: Target | null = findTarget(g, w, kind, id); if (!t) { toast('That is not on any more.', 'info'); return; }
    const there = tripTo(g, w, t.place) === 0;
    await waitUntil(g, w, there ? t.at : leaveAt(g, w, t));
    if (!go) { await syncScene(); notify(); return; }
    // still on? (called off by the rain, cancelled meanwhile): then no trip
    if (!findTarget(g, w, kind, id) && !(there && t.at <= nowAbs(g))) { toast(`${t.title}: it's off.`, 'info'); await syncScene(); notify(); return; }
    const { closePhone } = await import('./phone.js'); closePhone();
    if (t.place !== g.player.loc) { const { travelTo } = await import('./map.js'); await travelTo(t.place); }
    else { await syncScene(); state.view = 'scene'; notify(); }
}

Object.assign(ACT, {
    'wg-ask': (el) => { WG.kind = el.dataset.kind ?? ''; WG.id = el.dataset.id ?? ''; notify(); },
    'wg-no': () => { WG.kind = ''; notify(); },
    'wg-yes': async () => { const { kind, id } = WG; WG.kind = ''; notify(); await run(kind, id, true); },
    // (the clock's dialog: it asked already)
    'wg-clock': async (el) => { const { SKIP } = await import('./hud.js'); SKIP.ask = false; notify(); await run(el.dataset.kind ?? '', el.dataset.id ?? '', false); },
});
