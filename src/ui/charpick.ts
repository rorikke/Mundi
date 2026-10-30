// One character picker for the whole of Mundi (scenario, adding someone to a scenario, the people of a new world):
// everyone without folders, or with SillyTavern's folders; filter by tag; search by name; only favorites.
import { esc, notify } from '../core/store.js';
import { thumb, folders, tagIdsOf, allTags, isFav, folderColor } from '../st/bridge.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';

export interface PickState { q: string; view: 'folders' | 'flat'; folder: string | null; tag: string; fav: boolean }
const PICKS: Record<string, PickState> = {};
export const pickState = (key: string): PickState => (PICKS[key] ??= { q: '', view: 'folders', folder: null, tag: '', fav: false });
export const resetPick = (key: string) => { delete PICKS[key]; };

interface Opts { key: string; list: any[]; selected: string[]; act: string; multi?: boolean; selectAllAct?: string; placeholder?: string }
// The characters shown right now (used by "Select all" — inside a folder, only that folder's characters).
export function shownChars(key: string, list: any[]): any[] {
    const st = pickState(key);
    const q = st.q.toLowerCase();
    const fs = folders();
    const inFolder = (a: string) => tagIdsOf(a).filter(t => fs.some(f => f.id === t));
    let out = list.filter(c => (!st.fav || isFav(c)) && (!st.tag || tagIdsOf(c.avatar).includes(st.tag)));
    if (q) out = out.filter(c => String(c.name).toLowerCase().includes(q));
    else if (st.view === 'folders') out = st.folder ? out.filter(c => inFolder(c.avatar).includes(st.folder!)) : out.filter(c => !inFolder(c.avatar).length);
    return out.sort((x, y) => String(x.name).localeCompare(String(y.name)));
}
export function charPicker(o: Opts): string {
    const st = pickState(o.key);
    const fs = folders();
    const tags = allTags();
    const base = o.list.filter(c => (!st.fav || isFav(c)) && (!st.tag || tagIdsOf(c.avatar).includes(st.tag)));
    const shown = shownChars(o.key, o.list);
    const open = st.folder ? fs.find(f => f.id === st.folder) : null;
    const tiles = st.view === 'folders' && !st.q && !open ? fs.map(f => {
        const ids = base.filter(c => tagIdsOf(c.avatar).includes(f.id)).map(c => c.avatar);
        if (!ids.length) return '';
        const on = ids.filter(a => o.selected.includes(a)).length;
        const fc = folderColor(f.id);   // the folder's color, as in the Library
        return `<button class="mu-castcard is-folder ${o.multi && on === ids.length ? 'is-on' : ''}" data-act="cp-folder" data-key="${esc(o.key)}" data-id="${esc(f.id)}" style="${fc ? `--fc:${esc(fc)}` : ''}"><span class="mu-castfolder-ic">${icon('folder')}</span><span data-notr>${esc(f.name)}</span><small>${o.multi && on ? `${on}/` : ''}${ids.length}</small></button>`;
    }).join('') : '';
    const allOn = shown.length > 0 && shown.every(c => o.selected.includes(c.avatar));
    return `<div class="mu-cpick">
        <div class="mu-row mu-cast-bar">
            ${open ? `<button class="mu-ghost" data-act="cp-folder" data-key="${esc(o.key)}" data-id="">${icon('back')}<span data-notr>${esc(open.name)}</span></button>` : ''}
            <input class="mu-search" type="search" data-input="cp-q" data-key="${esc(o.key)}" data-focus="cp-${o.key}" placeholder="${esc(o.placeholder ?? 'Search by name')}" value="${esc(st.q)}">
            <div class="mu-chips"><button class="mu-chip ${st.view === 'folders' ? 'is-on' : ''}" data-act="cp-view" data-key="${esc(o.key)}" data-v="folders">${icon('folder')}<span>Folders</span></button><button class="mu-chip ${st.view === 'flat' ? 'is-on' : ''}" data-act="cp-view" data-key="${esc(o.key)}" data-v="flat">${icon('grid')}<span>Everyone</span></button>
                <button class="mu-chip ${st.fav ? 'is-on' : ''}" data-act="cp-fav" data-key="${esc(o.key)}" title="Only favorites">${icon(st.fav ? 'starFill' : 'star')}<span>Favorites</span></button></div>
            ${tags.length ? `<select data-input="cp-tag" data-key="${esc(o.key)}" title="Filter by tag"><option value="">All tags</option>${tags.map(t => `<option value="${esc(t.id)}" ${st.tag === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}
            ${o.multi && o.selectAllAct && shown.length ? `<button class="mu-ghost" data-act="${esc(o.selectAllAct)}" data-key="${esc(o.key)}">${icon('select')}<span>${allOn ? 'Unselect these' : open ? `Select all in ${esc(open.name)} (${shown.length})` : `Select all shown (${shown.length})`}</span></button>` : ''}
            ${o.multi ? `<span class="mu-muted">${o.selected.length} chosen</span>` : ''}</div>
        <div class="mu-castgrid" data-keep="cp-${o.key}">${tiles}${shown.map(c => `
            <button class="mu-castcard ${o.selected.includes(c.avatar) ? 'is-on' : ''}" data-act="${esc(o.act)}" data-avatar="${esc(c.avatar)}" title="${esc(c.name)}">
                <img src="${esc(thumb(c.avatar))}" alt="" loading="lazy"><span data-notr>${esc(c.name)}</span>${isFav(c) ? `<em class="mu-castfav">${icon('starFill')}</em>` : ''}<i>✓</i></button>`).join('')}
            ${!shown.length && !tiles ? '<p class="mu-muted">No characters found.</p>' : ''}</div></div>`;
}

Object.assign(ACT, {
    'cp-folder': (el) => { pickState(el.dataset.key!).folder = el.dataset.id || null; notify(); },
    'cp-view': (el) => { const s = pickState(el.dataset.key!); s.view = el.dataset.v as any; s.folder = null; notify(); },
    'cp-fav': (el) => { const s = pickState(el.dataset.key!); s.fav = !s.fav; notify(); },
});
Object.assign(INPUT, {
    'cp-q': (el) => { pickState(el.dataset.key!).q = el.value; notify(); },
    'cp-tag': (el) => { pickState(el.dataset.key!).tag = el.value; notify(); },
});
