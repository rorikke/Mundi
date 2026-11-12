// After an update: a window with what the new version brought, and the tour of only that. And on the main menu, a
// window offering to update when the branch Mundi was installed from has anything new (quiet when offline).
import { state, notify, settings, saveSettings, toast, esc } from '../core/store.js';
import { extVersion, extUpdate } from '../st/bridge.js';
import { VERSION, CHANGELOG, newer } from '../core/version.js';
import { tutorialOn, startTutorial, TOUR_VERSION } from './tutorial.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';

const S = () => settings() as any;
const REMOTE = 'https://raw.githubusercontent.com/tjalis/Mundi/main/manifest.json';
const REPO = 'https://github.com/tjalis/Mundi';

/* ---------- the changelog, once after an update ---------- */

// Someone who played before has seen the tour; someone new gets the welcome instead (and never this window).
function seenVersion(): string {
    const s = S();
    if (!s.lastVersion) { s.lastVersion = s.tourSeen ? '0.1.0' : VERSION; saveSettings(); }
    return s.lastVersion;
}
// opened by hand (Settings → Game → What's new): this version's changelog, anywhere, with only "Got it"
let asked = false;
export function whatsNewHtml(): string {
    if (asked && !tutorialOn()) return changelogHtml(false);
    if (state.view !== 'menu' || tutorialOn() || !S().tourSeen) return '';
    if (!newer(VERSION, seenVersion())) return '';
    return changelogHtml(newer(TOUR_VERSION, seenVersion()));
}
function changelogHtml(offerTour: boolean): string {
    const r = CHANGELOG[0];
    return `<div class="mu-recap-veil mu-wn-veil"><section class="mu-recap mh-glass mu-wn" role="dialog" aria-label="What's new">
        <header><small>Mundi ${r.v.replace(/\.0$/, '')}</small><h3>${r.title}</h3></header>
        <ul class="mu-wn-list">${r.items.map(([ic, t]) => `<li>${icon(ic)}<span>${t}</span></li>`).join('')}</ul>
        ${offerTour   // Stella's tour of what's new: only for someone coming from before it
            ? `<footer><p>Want a quick look at what's new? Stella shows only the new things.</p>
            <div class="mu-row"><button class="mu-ghost" data-act="wn-close">Not now</button><button class="mu-primary" data-act="wn-tour">${icon('forward')}<span>Show me</span></button></div></footer>`
            : `<footer><div class="mu-row"><button class="mu-primary" data-act="wn-close">Got it</button></div></footer>`}</section></div>`;
}
function seen() { S().lastVersion = VERSION; saveSettings(); }

/* ---------- an update for Mundi ---------- */

// Asked once per page load, on the main menu, through SillyTavern's extension manager (bridge's extVersion): any new
// commit on the branch Mundi is on counts. When there is one, a window offers to update and reload; "Not now" keeps
// it away for a day and leaves a small note at the top right instead.
const SNOOZE = 24 * 60 * 60 * 1000;
const U = { checked: false, behind: false, zip: false, branch: '', version: '', link: '', busy: false, help: false, closed: false, hidden: false };
async function remoteVersion(url: string): Promise<string> {
    try {
        const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return '';
        const v = String((await r.json())?.version ?? '');
        return /^\d+(\.\d+){0,3}$/.test(v) && newer(v, VERSION) ? v : '';
    } catch { return ''; }   // offline: say nothing
}
async function check() {
    U.checked = true;
    const v = await extVersion().catch(() => null);
    if (!v) return;   // SillyTavern couldn't tell (a branch with nothing on origin, say): quiet
    if (v.commit) {
        if (v.upToDate) return;
        U.behind = true; U.branch = v.branch;
        // from GitHub: its commits as "what changed", and the new version number when the manifest has one
        const gh = /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(v.remote);
        if (gh) { U.link = `https://github.com/${gh[1]}/${gh[2]}/commits/${v.branch}`; U.version = await remoteVersion(`https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${v.branch}/manifest.json`); }
        notify(); return;
    }
    // not a git clone (a zip): only a newer version number can be told, and it's updated by hand
    const rv = await remoteVersion(REMOTE);
    if (rv) { U.behind = true; U.zip = true; U.version = rv; U.link = REPO; notify(); }
}
const whatsOut = () => U.version ? `Mundi ${esc(U.version)} is out.` : `There are new changes on ${esc(U.branch || 'main')}.`;
const helpText = () => U.zip ? "This copy of Mundi can't update itself: get the new version from GitHub."
    : U.help ? 'Could not update from here. Update it in SillyTavern: Extensions → Manage extensions → Mundi → Update, then reload the page.' : '';
const seeLink = () => U.link ? `<a class="mu-upd-link" href="${esc(U.link)}" target="_blank" rel="noopener">See what changed</a>` : '';
const goBtn = (label: string) => U.zip ? '' : `<button class="mu-primary" data-act="upd-go" ${U.busy ? 'aria-disabled="true"' : ''}>${U.busy ? 'Updating…' : label}</button>`;
const asking = () => !U.zip && !U.closed && (Number(S().updateSnooze) || 0) < Date.now();
export function updateHtml(): string {
    if (state.view !== 'menu') return '';
    if (!U.checked) void check();
    if (!U.behind || tutorialOn() || whatsNewHtml()) return '';   // not over the changelog
    if (asking()) return `<div class="mu-recap-veil mu-wn-veil"><section class="mu-recap mh-glass mu-wn" role="dialog" aria-label="Update Mundi">
        <header><small>Mundi ${esc(VERSION.replace(/\.0$/, ''))}</small><h3>An update is available</h3></header>
        <p>${whatsOut()}</p><p>Update to the latest version and reload the page?</p>
        ${U.help ? `<p class="mu-warn">${helpText()}</p>` : ''}
        <footer><div class="mu-row">${seeLink()}<button class="mu-ghost" data-act="upd-later">Not now</button>${goBtn('Update and reload')}</div></footer></section></div>`;
    if (U.hidden) return '';
    const help = helpText();
    return `<aside class="mu-upd mh-glass" role="status">
        <span class="mu-upd-ic">${icon('download')}</span>
        <div><b>An update is available</b><small>${whatsOut()}${help ? ` ${help}` : ''}</small>
            <div class="mu-row">${goBtn('Update')}${seeLink()}</div></div>
        <button class="mu-ibtn mu-ghost" data-act="upd-x" aria-label="Dismiss" title="Not now">${icon('x')}</button></aside>`;
}
// SillyTavern's own extension update (a git pull), then a reload to run the new version
async function update() {
    if (U.busy) return;
    U.busy = true; notify();
    const ok = await extUpdate().catch(() => false);
    U.busy = false;
    if (ok) { toast('Mundi updated. Reloading…', 'success'); setTimeout(() => location.reload(), 1200); }
    else { U.help = true; toast('Could not update from here.', 'info'); }
    notify();
}

Object.assign(ACT, {
    'wn-close': () => { asked = false; seen(); notify(); },
    'wn-open': () => { asked = true; notify(); },
    'wn-tour': () => { seen(); startTutorial('new'); },
    'upd-go': () => { void update(); },
    'upd-later': () => { U.closed = true; S().updateSnooze = Date.now() + SNOOZE; saveSettings(); notify(); },
    'upd-x': () => { U.hidden = true; notify(); },
});
