// The Log (☰ menu in a game): every notice shown this session, newest first, so one that went by too fast can be read
// again. Notices from another game are left out; those from outside a game (the main menu) show with the clock time.
import { toastLog, watchToastLog, notify, esc, type ToastRow } from '../core/store.js';
import { fmtClock, fmtTime, fmtDateTime } from '../core/fmt.js';
import { selectedGroup } from '../st/bridge.js';
import { ACT } from './reg.js';
import { icon } from './icons.js';

const LOG = { open: false };
watchToastLog(() => { if (LOG.open) notify(); });

const when = (r: ToastRow) => (r.day != null && r.min != null ? `Day ${r.day} · ${fmtClock(r.min)}` : fmtTime(r.at));

function row(r: ToastRow) {
    const src = r.source ? `<small class="mu-log-src" data-notr>(${esc(r.source)})</small>` : '';
    const head = r.title ? `<b ${r.source ? 'data-notr' : ''}>${esc(r.title)}</b>` : '';
    return `<li class="mu-log-row is-${r.kind}"><small class="mu-log-when" title="${esc(fmtDateTime(r.at))}">${esc(when(r))}</small>${src}${head}<span ${r.source ? 'data-notr' : ''}>${esc(r.msg)}</span></li>`;
}

/** Escape: closes the Log when it's open (true when it was). */
export function closeToastLog() { if (!LOG.open) return false; LOG.open = false; notify(); return true; }

export function toastLogHtml() {
    if (!LOG.open) return '';
    const gid = selectedGroup();
    const rows = toastLog.filter(r => !r.gid || r.gid === gid).reverse();
    return `<div class="mu-dlg-veil" data-keep="log-veil" data-act="log-close"></div><div class="mu-panel mu-scpick mu-glassdlg mu-logdlg" data-keep="log-dlg" role="dialog" aria-label="Log">
        <header><h3>Log</h3><button class="mu-ibtn mu-ghost" data-act="log-close" aria-label="Close">${icon('x')}</button></header>
        ${rows.length ? `<ol class="mu-loglist">${rows.map(row).join('')}</ol>` : '<p class="mu-muted">Nothing here yet. Notices that pop up while you play are kept here until you close SillyTavern.</p>'}
        ${rows.length ? `<div class="mu-row mu-dlg-btns"><button data-act="log-clear">${icon('trash')}<span>Clear</span></button></div>` : ''}
    </div>`;
}

Object.assign(ACT, {
    'log-open': () => { LOG.open = true; notify(); },
    'log-close': () => { LOG.open = false; notify(); },
    'log-clear': () => {
        const gid = selectedGroup();
        for (let i = toastLog.length - 1; i >= 0; i--) if (!toastLog[i].gid || toastLog[i].gid === gid) toastLog.splice(i, 1);
        notify();
    },
});
