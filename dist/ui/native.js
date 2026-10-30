// SillyTavern's own panels, shown inside Mundi. The real panel (with its handlers, texts and translations) is
// moved into a host element while its tab is open and moved back to its place in SillyTavern afterwards, so
// both always edit the same settings. Nothing is copied or rebuilt.
// @ts-ignore
import { getUserAvatars } from '../../../../../personas.js';
import { esc } from '../core/store.js';
export const NATIVE = {
    'st-ai': { id: 'left-nav-panel', label: 'AI Response Configuration' },
    'st-api': { id: 'rm_api_block', label: 'API Connections' },
    'st-format': { id: 'AdvancedFormatting', label: 'AI Response Formatting' },
    'st-user': { id: 'user-settings-block', label: 'User Settings' },
    'st-ext': { id: 'rm_extensions_block', label: 'Extensions' },
    'st-worldinfo': { id: 'WorldInfo', label: 'World Info' },
    'st-personas': { id: 'PersonaManagement', label: 'Persona Management' },
    'st-characters': { id: 'right-nav-panel', label: 'Character Management' },
    'backgrounds': { id: 'Backgrounds', label: 'Backgrounds' },
    'st-extmenu': { id: 'extensionsMenu', label: 'Extensions menu' },
};
const homes = new Map();
// Parts of a panel shown beside it instead of at its bottom: the AI response settings' prompt list goes to a
// right-hand column, so it is not a long scroll away from the sliders.
const SIDE = { 'st-ai': 'completion_prompt_manager' };
export const nativeHost = (tab, note = '') => {
    const n = NATIVE[tab];
    if (!n)
        return '';
    const side = SIDE[tab];
    const main = `<div class="mu-native-wrap" data-keep="native-${tab}">${note ? `<p class="mu-muted mu-native-note">${note}</p>` : ''}<div class="mu-native-host" data-native="${esc(n.id)}"></div></div>`;
    return side ? `<div class="mu-native-cols">${main}<div class="mu-native-wrap mu-native-side" data-keep="native-${tab}-side"><div class="mu-native-host" data-native="${esc(side)}" data-part></div></div></div>` : main;
};
// Called after every redraw: panels whose host is on screen move in, the others go home.
export function syncNative(main) {
    const wanted = new Set();
    main.querySelectorAll('[data-native]').forEach(host => {
        const id = host.dataset.native;
        // after a redraw the panel may be out of the page (its old host was replaced): it is still ours
        const el = document.getElementById(id) ?? [...homes.keys()].find(e => e.id === id) ?? null;
        if (!el) {
            if (!host.hasAttribute('data-part'))
                host.innerHTML = '<p class="mu-muted mu-pad">This SillyTavern panel was not found.</p>';
            return;
        }
        wanted.add(id);
        if (!homes.has(el)) {
            const mark = document.createComment(`mundi:${id}`);
            el.parentNode?.insertBefore(mark, el);
            homes.set(el, mark);
            firstShow(id);
        }
        if (el.parentElement !== host)
            host.appendChild(el);
        el.classList.add('mu-native');
    });
    // parts go home first (their place is inside a panel that may be going home too)
    for (const [el, mark] of [...homes].sort((a, b) => Number(a[0].contains(b[0])) - Number(b[0].contains(a[0])))) {
        if (wanted.has(el.id))
            continue;
        el.classList.remove('mu-native');
        if (mark.parentNode)
            mark.parentNode.insertBefore(el, mark);
        mark.remove();
        homes.delete(el);
    }
}
export const releaseNative = () => syncNative(document.createElement('div'));
// Some panels fill their lists only when SillyTavern opens their drawer.
function firstShow(id) {
    if (id === 'PersonaManagement') {
        try {
            getUserAvatars(true);
        }
        catch { /* the list refreshes on its own */ }
    }
}
// The backgrounds panel is for importing and organizing here: clicking a picture does not apply it
// (its menu buttons, folders and selection mode still work).
export function guardBackgrounds(root) {
    root.addEventListener('click', (e) => {
        const t = e.target;
        const panel = t.closest?.('#Backgrounds.mu-native');
        if (!panel)
            return;
        const tile = t.closest('.bg_example');
        if (!tile || t.closest('.jg-menu, .mobile-only-menu-toggle'))
            return;
        if (panel.classList.contains('bg-selection-mode') || panel.querySelector('.bg-selection-mode'))
            return;
        e.stopPropagation();
        e.preventDefault();
    }, true);
}
