// How the conversation looks: SillyTavern's own message formatting (markdown, code blocks, regex scripts…),
// the chat styles (visual novel, classic, cards), avatars by the names, the character's picture opened on the
// side (full resolution, zoom under the mouse), pictures in focus, text colors, and look presets.
import { esc, notify, toast, UI, saveSettings, state, onPhone } from '../core/store.js';
import { stripControls } from '../core/safe.js';
import { ctx, chat, speakerOf, thumb, avatarUrl, persona, personaThumb } from '../st/bridge.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
import { talkLookHtml } from './talkcolors.js';
// @ts-ignore
import { power_user } from '../../../../../power-user.js';

const U = () => UI() as any;

/* ---------- text: exactly as SillyTavern formats it ---------- */

export function stFormat(text: string, m: any, i: number, fallback: (t: string) => string): string {
    try {
        const f = ctx().messageFormatting;
        if (typeof f !== 'function') return fallback(text);
        let html = stripControls(String(f(text, m?.name ?? '', !!m?.is_system, !!m?.is_user, i)));   // no Mundi controls from a message
        // Pictures written as links (![](https://…) or <img src="https://…">): SillyTavern removes them when its
        // "Forbid external media" is on (a picture from another site tells that site you are reading). Mundi does
        // the same, unless you turn "Show pictures from links" on in Chat look.
        if (U().linkPics === true) {
            const missing = linkedPics(text).filter(u => !html.includes(u) && !html.includes(esc(u)));
            if (missing.length) {
                html += missing.map(u => `<img class="mu-line-img" data-act="lightbox" src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join('');
            }
        }
        // pictures in the text open in focus mode and follow the picture layout
        return html.replace(/<img\b(?![^>]*\bmu-line-img\b)/gi, '<img class="mu-line-img" data-act="lightbox"');
    } catch { return fallback(text); }
}

// The http(s) pictures written into a text.
export function linkedPics(t: string): string[] {
    const out: string[] = [];
    for (const m of t.matchAll(/!\[[^\]]*\]\(\s*<?(https?:\/\/[^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g)) out.push(m[1]);
    for (const m of t.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) out.push(m[1]);
    return [...new Set(out)];
}

/* ---------- avatars by the names, and the full picture on the side ---------- */

export const fullPicOf = (m: any) => {
    if (m?.is_user) {
        // SillyTavern stores the persona picture of a line as a thumbnail address ("/thumbnail?type=persona&file=…"):
        // the full picture is that file in User Avatars
        const fa = String(m.force_avatar ?? '');
        const file = (fa.match(/[?&]file=([^&]+)/)?.[1] ? decodeURIComponent(fa.match(/[?&]file=([^&]+)/)![1]) : '') || (/^\/?User Avatars\//i.test(fa) ? decodeURIComponent(fa.replace(/^\/?User Avatars\//i, '')) : '') || (!fa ? persona() : '');
        if (file) return `/User%20Avatars/${encodeURIComponent(file)}`;
        return fa;   // an address of its own (another site, or a data: picture)
    }
    const a = speakerOf(m); return a ? avatarUrl(a) : '';
};
// your lines keep the persona they were written as (at Mundi's picture quality)
export const lineFile = (fa: string) => { const q = fa.match(/[?&]file=([^&]+)/)?.[1]; return q ? decodeURIComponent(q) : /^\/?User Avatars\//i.test(fa) ? decodeURIComponent(fa.replace(/^\/?User Avatars\//i, '')) : ''; };
export const smallPicOf = (m: any) => (m?.is_user ? personaThumb(lineFile(String(m.force_avatar ?? '')) || undefined) : (speakerOf(m) ? thumb(speakerOf(m)!) : ''));
export function avatarHtml(m: any) {
    const shape = U().avatarShape ?? 'rect';
    if (shape === 'none') return '';
    const s = smallPicOf(m); if (!s) return '';
    return `<button class="mu-line-av is-${shape}" data-act="portrait" data-src="${esc(fullPicOf(m))}" data-name="${esc(m.name ?? '')}" title="Show the picture"><img src="${esc(s)}" alt=""></button>`;
}
// Cards style: the big picture beside each message (full resolution).
export function cardPicHtml(m: any) {
    if ((U().layout ?? 'vn') !== 'cards') return '';
    const src = fullPicOf(m); if (!src) return '';
    return `<figure class="mu-line-card" data-act="lightbox" data-src="${esc(src)}"><img src="${esc(src)}" alt="" loading="lazy"></figure>`;
}

export const PORTRAIT = { src: '', name: '' };
export function portraitHtml() {
    if (!PORTRAIT.src) return '';
    return `<aside class="mu-sidepic"><div class="mu-sidepic-frame"><img src="${esc(PORTRAIT.src)}" alt="" draggable="false"><button class="mu-sidepic-x" data-act="portrait-close" title="Close">${icon('x')}</button></div>
        <span class="mu-sidepic-name" data-notr>${esc(PORTRAIT.name)}</span></aside>`;
}

/* ---------- a picture in focus ---------- */

const LB = { src: '', zoom: 1, x: 50, y: 50 };
export function lightboxHtml() {
    if (!LB.src) return '';
    return `<div class="mu-focus" data-act="lightbox-bg"><img src="${esc(LB.src)}" alt="" draggable="false" style="transform:scale(${LB.zoom});transform-origin:${LB.x}% ${LB.y}%" data-act="lightbox-zoom">
        <button class="mu-focus-x" data-act="lightbox-close" title="Close">${icon('x')}</button><small class="mu-focus-hint">Scroll or click to zoom</small></div>`;
}
document.addEventListener('wheel', (e) => {
    if (!LB.src || !(e.target as HTMLElement).closest?.('.mu-focus')) return;
    e.preventDefault();
    LB.zoom = Math.max(1, Math.min(6, LB.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const img = document.querySelector<HTMLElement>('.mu-focus img');
    if (img) { const r = img.getBoundingClientRect(); LB.x = ((e.clientX - r.left) / r.width) * 100; LB.y = ((e.clientY - r.top) / r.height) * 100; img.style.transformOrigin = `${LB.x}% ${LB.y}%`; img.style.transform = `scale(${LB.zoom})`; }
}, { passive: false });
// the side picture zooms where the mouse is
document.addEventListener('mousemove', (e) => {
    const f = (e.target as HTMLElement).closest?.('.mu-sidepic-frame, .mu-zoomable') as HTMLElement | null;
    if (!f) return;
    const r = f.getBoundingClientRect();
    f.style.setProperty('--zx', `${((e.clientX - r.left) / r.width) * 100}%`);
    f.style.setProperty('--zy', `${((e.clientY - r.top) / r.height) * 100}%`);
});

/* ---------- colors of the text and the windows ---------- */

export const COLOR_KEYS: [string, string, string][] = [
    ['main', 'Main text', '--mu-c-main'], ['em', 'Italic text (*…*)', '--mu-c-em'], ['under', 'Underlined text', '--mu-c-under'], ['quote', 'Quoted text ("…")', '--mu-c-quote'],
    ['shadow', 'Text shadow', '--mu-c-shadow'],
    ['chat', 'Dialogue box background', '--mu-c-chat'], ['ui', 'Message box background', '--mu-c-ui'], ['border', 'Dialogue box border', '--mu-c-border'],
];
// A color as red, green, blue and how opaque it is (0..1): from "#rrggbb" or "rgba(r, g, b, a)".
export function parseColor(s: string): { r: number; g: number; b: number; a: number } | null {
    const h = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(s || '').trim());
    if (h) { const n = parseInt(h[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: h[2] ? parseInt(h[2], 16) / 255 : 1 }; }
    const m = String(s || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a] = m[1].split(',').map(x => Number(x.trim()));
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: Number.isFinite(a) ? a : 1 };
}
const rgba = (c: { r: number; g: number; b: number; a: number }, a = c.a) => `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round(Math.max(0, Math.min(1, a)) * 100) / 100})`;
export function applyColors(r: HTMLElement) {
    const c = (U().colors ?? {}) as Record<string, string>;
    for (const [k, , v] of COLOR_KEYS) { if (c[k]) r.style.setProperty(v, c[k]); else r.style.removeProperty(v); }
    // the HUD's glass follows the chat colors too (panels, menus, cards): the dialogue box's color tints the glass,
    // its border colors the glass edge, the main text the HUD's text
    const bg = parseColor(c.chat), edge = parseColor(c.border), fg = parseColor(c.main);
    const set = (name: string, val: string | null) => { if (val) r.style.setProperty(name, val); else r.style.removeProperty(name); };
    set('--glass', bg ? rgba(bg) : null);
    set('--glass-strong', bg ? rgba(bg, Math.min(1, bg.a + .18)) : null);
    set('--glass-edge', edge ? rgba(edge, Math.min(edge.a, .6)) : null);
    set('--hud-fg', fg ? rgba(fg, 1) : null);
}
const rgbaToHex = (s: string) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return s; const [r, g, b] = m[1].split(',').map(x => Math.round(Number(x))); return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`; };
// From SillyTavern's current theme colors (User Settings → Theme colors).
function stColors(p: any) {
    return { main: rgbaToHex(p.main_text_color), em: rgbaToHex(p.italics_text_color), under: rgbaToHex(p.underline_text_color), quote: rgbaToHex(p.quote_text_color),
        shadow: String(p.shadow_color ?? ''), ai: String(p.bot_mes_blur_tint_color ?? ''), user: String(p.user_mes_blur_tint_color ?? ''),
        chat: String(p.chat_tint_color ?? ''), ui: String(p.blur_tint_color ?? ''), border: String(p.border_color ?? '') };   // these keep their transparency
}
let stThemes: any[] | null = null;
async function loadThemes() {
    try { const res = await fetch('/api/settings/get', { method: 'POST', headers: ctx().getRequestHeaders(), body: '{}' }); const d = await res.json(); stThemes = Array.isArray(d.themes) ? d.themes : []; }
    catch { stThemes = []; }
    notify();
}

/* ---------- look presets: saved as SillyTavern themes named "Mundi - <name>" ---------- */
// Each one is a normal SillyTavern theme (it also shows in SillyTavern's theme list, with Mundi's colors), with
// Mundi's own look kept inside it under "mundi".
const PREFIX = 'Mundi - ';
const OLD_FILE = 'mundi-look-presets.json';   // where the first presets were kept (moved into themes once)
// only the chat's look: a preset never changes the rest of Mundi (overall scale, font, theme color stay as they are)
const LOOK_KEYS = ['linkPics', 'picQuality', 'layout', 'chatSwap', 'avatarShape', 'imgLayout', 'sceneText', 'dialogW', 'dialogH', 'dialogBlur', 'spriteSize', 'spriteW', 'spriteY', 'dialogPos', 'colors'];
let presets: Record<string, any> | null = null;
const hdr = () => ({ ...ctx().getRequestHeaders(), 'Content-Type': 'application/json' });
const hexToRgba = (v: string) => { const c = parseColor(v); return c ? rgba(c) : v; };
const ST_KEY: Record<string, string> = { main: 'main_text_color', em: 'italics_text_color', under: 'underline_text_color', quote: 'quote_text_color', shadow: 'shadow_color',
    ai: 'bot_mes_blur_tint_color', user: 'user_mes_blur_tint_color', chat: 'chat_tint_color', ui: 'blur_tint_color', border: 'border_color' };
async function allThemes(): Promise<any[]> {
    const res = await fetch('/api/settings/get', { method: 'POST', headers: hdr(), body: '{}' });
    const d = await res.json(); return Array.isArray(d.themes) ? d.themes : [];
}
async function saveTheme(name: string, look: any) {
    // starts from SillyTavern's current theme, so the theme is complete when used in SillyTavern
    const list = stThemes ?? await allThemes();
    const base = structuredClone(list.find((t: any) => t.name === power_user.theme) ?? {});
    for (const [k, v] of Object.entries((look.colors ?? {}) as Record<string, string>)) if (ST_KEY[k] && v) base[ST_KEY[k]] = hexToRgba(v);
    const theme = { ...base, name: PREFIX + name, mundi: look };
    const r = await fetch('/api/themes/save', { method: 'POST', headers: hdr(), body: JSON.stringify(theme) });
    if (!r.ok) throw new Error('The preset could not be saved.');
    // SillyTavern's theme list shows it right away
    const sel = document.getElementById('themes') as HTMLSelectElement | null;
    if (sel && ![...sel.options].some(o => o.value === theme.name)) { const o = document.createElement('option'); o.value = o.textContent = theme.name; sel.appendChild(o); }
    const i = (stThemes ??= []).findIndex((t: any) => t.name === theme.name); if (i >= 0) stThemes[i] = theme; else stThemes.push(theme);
}
async function deleteTheme(name: string) {
    await fetch('/api/themes/delete', { method: 'POST', headers: hdr(), body: JSON.stringify({ name: PREFIX + name }) });
    document.querySelector(`#themes option[value="${CSS.escape(PREFIX + name)}"]`)?.remove();
    if (stThemes) stThemes = stThemes.filter((t: any) => t.name !== PREFIX + name);
}
async function loadPresets() {
    presets = {};
    try {
        const list = await allThemes(); stThemes ??= list;
        for (const t of list) if (String(t.name).startsWith(PREFIX) && t.mundi) presets[String(t.name).slice(PREFIX.length)] = t.mundi;
        // presets from the old file become themes once
        const r = await fetch(`/user/files/${OLD_FILE}`, { cache: 'no-cache' });
        if (r.ok) {
            const old = await r.json() as Record<string, any>;
            for (const [n, look] of Object.entries(old ?? {})) if (!presets[n]) { await saveTheme(n, look); presets[n] = look; }
            await fetch('/api/files/delete', { method: 'POST', headers: hdr(), body: JSON.stringify({ path: `user/files/${OLD_FILE}` }) });
        }
    } catch (e) { console.warn('[Mundi] look presets', e); }
    notify();
}

/* ---------- the look panel (scenario drawer, and the HUD's menu) ---------- */

const chips = (key: string, opts: [string, string][], def: string) => `<div class="mu-chips">${opts.map(([v, l]) => `<button class="mu-chip ${String(U()[key] ?? def) === v ? 'is-on' : ''}" data-act="look-set" data-k="${esc(key)}" data-v="${esc(v)}">${l}</button>`).join('')}</div>`;
const range = (label: string, key: string, min: number, max: number, def: number, unit = '') => `<label class="mu-field slider"><span>${label} · ${U()[key] ?? def}${unit}</span><input type="range" min="${min}" max="${max}" value="${U()[key] ?? def}" data-input="look-num" data-k="${esc(key)}"></label>`;
// Each part of the panel folds (the choice is remembered).
const FOLD_KEY = 'mundi-look-folds';
let folds: Record<string, boolean> = (() => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}'); } catch { return {}; } })();
const CLOSED_FIRST = ['themes', 'quality'];
const folded = (id: string) => folds[id] ?? CLOSED_FIRST.includes(id);
const sec = (id: string, title: string, body: string, extra = '') => `<details class="mu-look-sec" ${folded(id) ? '' : 'open'}><summary data-act="look-fold" data-id="${esc(id)}"><span>${title}</span>${extra}</summary><div class="mu-look-body">${body}</div></details>`;
export function lookPanelHtml() {
    if (presets === null) loadPresets();
    const c = (U().colors ?? {}) as Record<string, string>;
    const themes = (stThemes ?? []).filter((t: any) => !String(t.name).startsWith(PREFIX));
    return `<div class="mu-look">
        ${sec('style', 'Chat style', `${chips('layout', [['vn', 'Visual novel'], ['classic', 'Classic'], ['cards', 'Cards']], 'vn')}
            ${U().layout === 'cards' ? `<label class="mu-check"><input type="checkbox" data-input="look-bool" data-k="chatSwap" ${U().chatSwap ? 'checked' : ''}><span>Swap the sides of the AI and you</span></label>` : ''}
            ${(U().layout ?? 'vn') === 'vn' && !onPhone() ? `<div class="mu-field"><span>Dialogue box</span>${chips('dialogPos', [['center', 'Centered'], ['left', 'Left']], 'center')}</div>` : ''}`)}
        ${sec('avatar', 'Picture by the name', chips('avatarShape', [['none', 'Hidden'], ['circle', 'Circle'], ['square', 'Square'], ['rect', 'Rectangle']], 'rect'))}
        ${sec('pics', 'Pictures in messages', `<label class="mu-check"><input type="checkbox" data-input="look-bool" data-k="linkPics" ${U().linkPics === true ? 'checked' : ''}><span>Show pictures from links (internet addresses), even when SillyTavern's "Forbid external media" is on</span></label>${chips('imgLayout', [['left', 'Below, left'], ['center', 'Below, centered'], ['right', 'Below, right'], ['wrap', 'Beside the text']], 'left')}`)}
        ${sec('quality', 'Picture quality', chips('picQuality', [['full', 'Original resolution'], ['thumb', 'Thumbnails (faster)']], 'full'))}
        ${sec('sizes', 'Sizes', `<div class="mu-row mu-look-resetrow"><button class="mu-ghost mu-look-reset" data-act="look-reset" title="Put the sliders back to their default values">${icon('undo')}<span>Reset sizes</span></button></div>${range('Text', 'sceneText', 70, 160, 100, '%')}${onPhone() ? '' : range('Dialogue box width', 'dialogW', 60, 160, 100, '%')}${range('Dialogue box height', 'dialogH', 60, 200, 100, '%')}${range('Dialogue box blur', 'dialogBlur', 0, 40, 12, 'px')}${range('Character size', 'spriteSize', 50, 160, 100, '%')}`)}
        ${sec('colors', 'Colors', `<div class="mu-look-colors">${COLOR_KEYS.map(([k, l]) => `<label class="mu-look-color"><input type="color" value="${esc(rgbaToHex(c[k] || '#ffffff'))}" data-input="look-color" data-k="${esc(k)}" title="${esc(l)}"><button class="mu-ghost mu-ibtn" data-act="look-color-reset" data-k="${esc(k)}" title="Default" ${c[k] ? '' : 'aria-disabled="true"'}>${icon('undo')}</button><span>${l}</span>
                <span class="mu-look-alpha" title="Transparency"><input type="range" min="0" max="100" step="1" value="${Math.round((parseColor(c[k])?.a ?? 1) * 100)}" data-input="look-alpha" data-k="${esc(k)}" ${c[k] ? '' : 'disabled'}><small>${c[k] ? `${Math.round((parseColor(c[k])?.a ?? 1) * 100)}%` : '—'}</small></span></label>`).join('')}</div>
            <div class="mu-row"><button class="mu-ghost" data-act="look-import-st">${icon('upload')}<span>Use SillyTavern's current colors</span></button>
                <button class="mu-ghost" data-act="look-colors-default" ${Object.keys(c).length ? '' : 'aria-disabled="true"'}>${icon('undo')}<span>Default colors</span></button></div>`)}
        ${sec('talk', "Speakers' colors", talkLookHtml())}
        ${sec('themes', 'From a SillyTavern theme', !stThemes ? '<p class="mu-muted">Loading…</p>' : `<div class="mu-look-themegrid">${themes.map((t: any) => { const sc = stColors(t);
                return `<button class="mu-look-theme" data-act="look-theme" data-name="${esc(t.name)}" title="Use the colors of ${esc(t.name)}" style="--tb:${esc(sc.chat || '#222')};--tm:${esc(sc.main || '#fff')}">
                    <span class="mu-look-theme-sw">${[sc.main, sc.em, sc.quote, sc.ai, sc.user].map(x => `<i style="background:${esc(x || 'transparent')}"></i>`).join('')}</span>
                    <b data-notr>${esc(t.name)}</b><small style="color:${esc(sc.main || '#fff')}">Aa <em style="color:${esc(sc.em || 'inherit')}">italic</em> <q style="color:${esc(sc.quote || 'inherit')}">"quote"</q></small></button>`; }).join('')}</div>`, stThemes ? `<small class="mu-look-count">${themes.length}</small>` : '')}
        ${sec('presets', 'Presets', `<p class="mu-muted mu-look-note">Saved as SillyTavern themes named "Mundi - …". They change the chat's look and tint the HUD's glass (panels, menus, cards).</p>
            <div class="mu-look-presets">
            <div class="mu-look-themegrid is-presets">${BUILTIN.map(([n, c]) => builtinCard(n, c)).join('')}${presets === null ? '' : Object.entries(presets).map(([n, p]) => presetCard(n, p)).join('')}
                <button class="mu-look-theme mu-look-new" data-act="look-new" title="Make a new preset from the current look">${icon('plus')}<span>New preset</span></button></div>
            ${presets === null ? '<p class="mu-muted">Loading your presets…</p>' : ''}
            <small class="mu-muted">Click a preset to use it. On the one in use: duplicate or delete it (top corner); click its name to rename it. Changes you make while one of yours is in use are saved into it.</small>
            </div>`)}
    </div>`;
}
const LOOK = { naming: false, name: '', cur: '', reset: false, themesOpen: false, renaming: '', newName: '' };
// Mundi's own presets: colors only (text, *actions*, "speech", the box and the HUD's glass), always there.
const BUILTIN: [string, Record<string, string>][] = [
    ['Midnight Glass', { main: '#e8edf5', em: '#9fb4d6', quote: '#ffd58a', chat: 'rgba(18, 26, 43, 0.62)', border: 'rgba(255, 255, 255, 0.22)', ui: 'rgba(10, 16, 28, 0.45)', shadow: 'rgba(0, 0, 0, 0.6)' }],
    ['Rose Dusk', { main: '#f6ecef', em: '#d9a7b8', quote: '#ffb3c7', chat: 'rgba(42, 19, 32, 0.6)', border: 'rgba(255, 158, 192, 0.28)', ui: 'rgba(26, 12, 20, 0.45)', shadow: 'rgba(0, 0, 0, 0.55)' }],
    ['Forest Calm', { main: '#eef3ec', em: '#c9bfa0', quote: '#9ee6b8', chat: 'rgba(19, 34, 27, 0.6)', border: 'rgba(184, 240, 200, 0.22)', ui: 'rgba(11, 21, 16, 0.45)', shadow: 'rgba(0, 0, 0, 0.55)' }],
];
function builtinCard(n: string, c: Record<string, string>) {
    const on = LOOK.cur === `★${n}`;
    return `<div class="mu-look-theme is-builtin is-preset ${on ? 'is-on' : ''}" style="--tb:${esc(c.chat)};--tm:${esc(c.main)};background:linear-gradient(160deg, rgba(255,255,255,.12), rgba(255,255,255,0) 60%), ${esc(c.chat)} !important;border-color:${esc(c.border)} !important">
        <button class="mu-look-preset-use" data-act="look-builtin" data-name="${esc(n)}" title="Use ${esc(n)}">
            <span class="mu-look-theme-sw">${[c.main, c.em, c.quote, c.chat, c.border].map(x => `<i style="background:${esc(x)}"></i>`).join('')}</span>
            <b>${esc(n)}</b><small style="color:${esc(c.main)}">Aa <em style="color:${esc(c.em)}">*action*</em> <q style="color:${esc(c.quote)}">speech</q></small></button>
        ${on ? `<span class="mu-look-corner"><button class="mu-ibtn mu-ghost" data-act="look-dup" data-builtin="${esc(n)}" title="Duplicate (as one of yours)">${icon('copy')}</button></span>` : ''}</div>`;
}
// A saved preset: its colors like the theme cards; click to use it; replace it with the current look, rename or delete it.
const LAYOUT_NAME: Record<string, string> = { vn: 'Visual novel', classic: 'Classic', cards: 'Cards' };
function presetCard(n: string, p: any) {
    const c = (p?.colors ?? {}) as Record<string, string>;
    const on = LOOK.cur === n;
    const name = LOOK.renaming === n
        ? `<span class="mu-row mu-look-rename"><input type="text" value="${esc(LOOK.newName)}" data-input="look-newname" data-focus="look-newname" maxlength="40"><button class="mu-ibtn" data-act="look-rename-go" data-name="${esc(n)}" title="Rename">${icon('check')}</button></span>`
        : `<b class="mu-look-name" data-act="look-rename" data-name="${esc(n)}" title="Click to rename" data-notr>${esc(n)}</b>`;
    return `<div class="mu-look-theme is-preset is-mine ${on ? 'is-on' : ''}" style="--tb:${esc(c.chat || 'rgba(255,255,255,.06)')};--tm:${esc(c.main || '#fff')}${c.chat ? `;background:linear-gradient(160deg, rgba(255,255,255,.12), rgba(255,255,255,0) 60%), ${esc(c.chat)} !important` : ''}${c.border ? `;border-color:${esc(c.border)} !important` : ''}">
        <button class="mu-look-preset-use" data-act="look-use" data-name="${esc(n)}" title="Use this preset">
            <span class="mu-look-theme-sw">${[c.main, c.em, c.quote, c.chat, c.border].map(x => `<i style="background:${esc(x || 'transparent')}"></i>`).join('')}</span>
            <small style="color:${esc(c.main || 'inherit')}">${esc(LAYOUT_NAME[p?.layout] ?? 'Visual novel')} · Aa <em style="color:${esc(c.em || 'inherit')}">*action*</em></small></button>
        ${name}
        ${on ? `<span class="mu-look-corner"><button class="mu-ibtn mu-ghost" data-act="look-dup" data-name="${esc(n)}" title="Duplicate">${icon('copy')}</button><button class="mu-ibtn mu-ghost" data-act="look-del" data-name="${esc(n)}" title="Delete">${icon('trash')}</button></span>` : ''}
    </div>`;
}
const currentLook = () => Object.fromEntries(LOOK_KEYS.filter(k => U()[k] !== undefined).map(k => [k, structuredClone(U()[k])]));
function usePreset(n: string) {
    const p = presets?.[n]; if (!p) return;
    LOOK.cur = n; Object.assign(UI(), Object.fromEntries(Object.entries(structuredClone(p)).filter(([k]) => LOOK_KEYS.includes(k)))); changed(); toast(`Preset "${n}" applied.`, 'success');
}
// The confirmation for "Reset", drawn outside the side menu so it covers the whole screen.
export const lookConfirmHtml = () => (LOOK.reset ? `<div class="mu-dlg-veil is-fixed" data-act="look-reset-no"></div><div class="mu-panel mu-confirm" role="dialog"><h3>Reset the sliders?</h3>
            <p class="mu-muted">Text, the dialogue box's width, height and blur, and the character's size, width and height go back to their default values. Colors, chat style and presets are not changed.</p>
            <div class="mu-row"><button class="mu-primary" data-act="look-reset-yes">Reset</button><button data-act="look-reset-no">Cancel</button></div></div>` : '');
let apply: () => void = () => {};
export const setLookApplier = (f: () => void) => { apply = f; };
// A change while one of your presets is in use goes into it (saved a moment later, once you stop moving sliders).
let autosave = 0;
const changed = () => {
    saveSettings(); apply(); notify();
    const n = LOOK.cur;
    if (n && presets?.[n]) { presets[n] = currentLook(); clearTimeout(autosave); autosave = window.setTimeout(() => { saveTheme(n, presets![n]).catch(() => { /* kept locally */ }); }, 1500); }
};

Object.assign(ACT, {
    portrait: (el) => { PORTRAIT.src = el.dataset.src ?? ''; PORTRAIT.name = el.dataset.name ?? ''; notify(); },
    'portrait-close': () => { PORTRAIT.src = ''; notify(); },
    lightbox: (el) => { LB.src = el.dataset.src || (el as HTMLImageElement).src || ''; LB.zoom = 1; notify(); },
    'lightbox-close': () => { LB.src = ''; notify(); },
    'lightbox-bg': (el, e) => { if (e.target === el) { LB.src = ''; notify(); } },
    'lightbox-zoom': (el, e) => {
        const r = el.getBoundingClientRect(); const me = e as MouseEvent;
        LB.x = ((me.clientX - r.left) / r.width) * 100; LB.y = ((me.clientY - r.top) / r.height) * 100;
        LB.zoom = LB.zoom > 1 ? 1 : 2.5; notify();
    },
    'look-reset': () => { LOOK.reset = true; notify(); },
    'look-reset-no': () => { LOOK.reset = false; notify(); },
    'look-reset-yes': () => { Object.assign(UI(), { sceneText: 100, dialogW: 100, dialogH: 100, dialogBlur: 12, spriteSize: 100, spriteW: 100, spriteY: 0 }); LOOK.reset = false; changed(); toast('Sliders back to default.', 'success'); },
    'look-set': (el) => { U()[el.dataset.k!] = el.dataset.v; changed(); },
    'look-color-reset': (el) => { delete (U().colors ??= {})[el.dataset.k!]; changed(); },
    'look-import-st': () => { U().colors = stColors(power_user); changed(); toast('Colors copied from SillyTavern.', 'success'); },
    'look-load-themes': () => { loadThemes(); },
    'look-fold': (el, e) => {
        e.preventDefault();
        const id = el.dataset.id!; folds[id] = !folded(id);
        try { localStorage.setItem(FOLD_KEY, JSON.stringify(folds)); } catch { /* only for this session */ }
        if (id === 'themes' && !folded(id) && !stThemes) loadThemes();
        notify();
    },
    'look-theme': (el) => { const t = stThemes?.find((x: any) => x.name === el.dataset.name); if (!t) return; U().colors = stColors(t); changed(); toast(`Colors from "${t.name}".`, 'success'); },
    'look-colors-default': () => { U().colors = {}; changed(); toast('Colors back to default.', 'success'); },
    'look-save': () => { LOOK.naming = true; LOOK.name = ''; notify(); },
    'look-save-go': async () => {
        const n = LOOK.name.trim(); if (!n) return;
        presets ??= {};
        presets[n] = currentLook();
        LOOK.naming = false; LOOK.cur = n; LOOK.name = '';
        document.querySelectorAll<HTMLInputElement>('[data-input="look-name"]').forEach(x => { x.value = ''; });
        try { await saveTheme(n, presets[n]); toast(`Saved as the SillyTavern theme "${PREFIX}${n}".`, 'success'); } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'look-use': (el) => usePreset(el.dataset.name!),
    // "+": a new preset from the current look; type its name right away
    'look-new': async () => {
        presets ??= {};
        let n = 'My preset', k = 2; while (presets[n]) n = `My preset ${k++}`;
        presets[n] = currentLook(); LOOK.cur = n;
        try { await saveTheme(n, presets[n]); } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        LOOK.renaming = n; LOOK.newName = n; notify();
        setTimeout(() => { const i = document.querySelector<HTMLInputElement>('[data-focus="look-newname"]'); i?.focus(); i?.select(); }, 30);
    },
    'look-dup': async (el) => {
        presets ??= {};
        const b = el.dataset.builtin ? BUILTIN.find(([x]) => x === el.dataset.builtin) : null;
        const from = b ? b[0] : el.dataset.name!;
        const look = b ? { ...currentLook(), colors: { ...b[1] } } : structuredClone(presets[from]);
        if (!look) return;
        let n = `${from} copy`, k = 2; while (presets[n]) n = `${from} copy ${k++}`;
        presets[n] = look; LOOK.cur = n;
        if (b) { U().colors = { ...b[1] }; }
        try { await saveTheme(n, look); toast(`Duplicated as "${n}".`, 'success'); } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'look-builtin': (el) => { const b = BUILTIN.find(([n]) => n === el.dataset.name); if (!b) return; U().colors = { ...b[1] }; LOOK.cur = `★${b[0]}`; changed(); toast(`Preset "${b[0]}" applied.`, 'success'); },
    'look-replace': async (el) => {
        const n = el.dataset.name!; if (!presets?.[n]) return;
        presets[n] = currentLook(); LOOK.cur = n;
        try { await saveTheme(n, presets[n]); toast(`"${n}" now has the current look.`, 'success'); } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'look-rename': (el) => { LOOK.renaming = el.dataset.name!; LOOK.newName = el.dataset.name!; notify(); setTimeout(() => { const i = document.querySelector<HTMLInputElement>('[data-focus="look-newname"]'); i?.focus(); i?.select(); }, 30); },
    'look-rename-no': () => { LOOK.renaming = ''; notify(); },
    'look-rename-go': async (el) => {
        const from = el.dataset.name!, to = LOOK.newName.trim();
        LOOK.renaming = '';
        if (!to || to === from || !presets?.[from]) { notify(); return; }
        if (presets[to]) { toast(`There is already a preset called "${to}".`, 'warn'); notify(); return; }
        try { await saveTheme(to, presets[from]); await deleteTheme(from); presets[to] = presets[from]; delete presets[from]; if (LOOK.cur === from) LOOK.cur = to; toast(`Renamed to "${to}".`, 'success'); }
        catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'look-del': async (el) => {
        const n = el.dataset.name || LOOK.cur; if (!n || !presets?.[n]) return;
        delete presets[n]; if (LOOK.cur === n) LOOK.cur = ''; await deleteTheme(n); toast(`Preset "${n}" deleted.`, 'success'); notify();
    },
});
Object.assign(INPUT, {
    'look-num': (el) => { U()[el.dataset.k!] = Number(el.value); saveSettings(); apply(); const s = el.previousElementSibling; if (s) s.textContent = s.textContent!.replace(/·.*$/, `· ${el.value}${el.dataset.k === 'dialogBlur' ? 'px' : '%'}`); },
    'look-bool': (el) => { U()[el.dataset.k!] = el.checked; changed(); },
    // a new color keeps the transparency it had
    'look-color': (el) => {
        const cs = (U().colors ??= {}); const k = el.dataset.k!;
        const was = parseColor(cs[k]); const now = parseColor(el.value)!;
        cs[k] = was && was.a < 1 ? rgba(now, was.a) : el.value;
        saveSettings(); apply();
        const box = el.closest('.mu-look-color'); const rng = box?.querySelector('[data-input="look-alpha"]') as HTMLInputElement | null;
        if (rng) { rng.disabled = false; rng.value = String(Math.round((was?.a ?? 1) * 100)); const sm = rng.nextElementSibling; if (sm) sm.textContent = `${rng.value}%`; }
    },
    // how opaque the color is (like SillyTavern's own color pickers)
    'look-alpha': (el) => {
        const cs = (U().colors ??= {}); const k = el.dataset.k!;
        const c = parseColor(cs[k]); if (!c) return;
        cs[k] = rgba(c, Number(el.value) / 100);
        const sm = el.nextElementSibling; if (sm) sm.textContent = `${el.value}%`;
        saveSettings(); apply();
    },
    'look-name': (el) => { const had = !!LOOK.name.trim(); LOOK.name = el.value; if (had !== !!LOOK.name.trim()) notify(); },
    'look-preset': (el) => usePreset(el.value),
    'look-newname': (el) => { LOOK.newName = el.value; },
    'look-import-theme': (el) => { const t = stThemes?.find((x: any) => x.name === el.value); if (!t) return; U().colors = stColors(t); changed(); toast(`Colors from "${t.name}".`, 'success'); },
});
void chat; void state;

// Enter in the preset name saves it
document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && t?.dataset?.focus === 'look-name' && LOOK.name.trim()) { e.preventDefault(); (ACT['look-save-go'] as any)(t, e); }
    if (e.key === 'Enter' && t?.dataset?.focus === 'look-newname') { e.preventDefault(); const b = document.querySelector<HTMLElement>('[data-act="look-rename-go"]'); if (b) (ACT['look-rename-go'] as any)(b, e); }
    if (e.key === 'Escape' && t?.dataset?.focus === 'look-newname') { LOOK.renaming = ''; notify(); }
});
