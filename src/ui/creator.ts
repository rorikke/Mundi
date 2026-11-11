// The world creator: everything a world is made of, editable (Porto Alto itself could be built with it).
// A world starts from a base (a copy of Porto Alto, or the Modern rules with an empty map) and is saved as a
// JSON file in SillyTavern's user files. Inputs bind to the draft by path: data-path="statuses.2.name".
import { TIME_SLOTS } from '../sim/daynight.js';
import { safeUrl } from '../core/safe.js';
import { money } from '../sim/needs.js';
import { DEFAULT_EXPENSES } from '../sim/bills.js';
import { lex, lexGroups, lexDefault } from '../core/lexicon.js';
import { slidesHtml, toneTag } from './slides.js';
import { houseMapsHtml } from './planedit.js';
import { MEDIEVAL_RPG, MODERN_RPG, POWERS_RPG } from '../core/rpgdef.js';
import { TIE_TYPES } from '../sim/living.js';
import { FRIEND_TIERS, ROMANCE_TIERS } from '../sim/romance.js';
import { GOVERNMENTS, POWERS } from '../sim/realm.js';
import { state, notify, esc, toast, busy } from '../core/store.js';
import { getWorld, shortDesc, WORLD_DESC_MAX, worldFile, worlds, styleOf, isCustom, gameMode, GAME_MODES, SYSTEMS, systemOn, appSystem, isScenario, worldTags, allTags, WORLD_TAGS, RPG_LOCKED, RPG_NOTE, worldLocked, PLACE_ROLES, type WorldDef, type GameMode, type GoalDef, type GoalStep, type RewardDef, type Rank } from '../core/world.js';
import { STYLES, inWorld } from './styles.js';
import { SKINS } from './skins.js';

import { tr, setWorldDicts } from '../core/tr.js';
import { lorebooks } from '../st/bridge.js';
import { hm, WEEKDAYS } from '../sim/time.js';
import { newWorldFrom, saveWorld, deleteWorld, exportWorld, importWorld, uploadWorldPicture, appsOf, slug, newId } from '../sim/creator.js';
import { mapEditorHtml, ME } from './mapedit.js';
import { pickFile } from './cropper.js';
import { icon, ICON_NAMES } from './icons.js';
import { ACT, INPUT } from './reg.js';
import { personPanel, SCOPES } from './personui.js';
import { cleanPerson, cleanIntimate, gendersOf } from '../sim/gender.js';
import { whenError, namedIn, PARTNER_VALUES } from '../sim/when.js';
import { skillsOf } from '../sim/hobbies.js';
import { WORK_PRESETS, worldPreset } from '../sim/work.js';
import { STANDARD_TRAIT_INFO, EFFECT_KINDS, TRAIT_LIMITS, OUT_OF_WORK, clampEffect, isEffectKind, type EffectKind, type EffectDef, type EffectLimits, type TraitInfo } from '../core/traits.js';
import { GENERAL_GOALS, GENERAL_REWARDS, GOAL_CATEGORIES, PERK_LIMITS, BOOST_LIMITS, BOOST_DAYS, GOAL_POINTS, REWARD_KINDS, PERSON_KINDS, SKILL_GROUPS, isSystemNeed } from '../core/goals.js';
import { TALLY_EVENTS } from '../sim/tally.js';
import { SECOND_POINTS } from '../sim/points.js';

type Tab = 'economy' | 'realm' | 'customs' | 'rpg' | 'general' | 'features' | 'needs' | 'maps' | 'homes' | 'actions' | 'jobs' | 'goals' | 'courses' | 'shop' | 'words' | 'character' | 'people' | 'lore' | 'books';
const TABS: [Tab, string][] = [['general', 'General'], ['features', 'Features'], ['needs', 'Needs'], ['maps', 'Maps & places'], ['homes', 'Homes & rent'],
    ['actions', 'Things to do'], ['jobs', 'Jobs'], ['goals', 'Goals & rewards'], ['courses', 'Courses'], ['shop', 'Shop'], ['words', 'Words (lexicon)'], ['character', 'Character creation'], ['rpg', 'RPG'], ['customs', 'Customs & calendar'], ['realm', 'Realm & factions'], ['economy', 'Economy & skies'], ['people', 'People & routines'], ['lore', 'Lore'], ['books', 'Lorebooks & notes']];
// A scenario (one house, its residents) leaves out the tabs about towns, careers and kingdoms (a switch shows them), and
// life goals (a Home has them off).
const SCENARIO_HIDES: Tab[] = ['realm', 'economy', 'rpg', 'goals'];
export const CW = {
    w: null as WorldDef | null, tab: 'general' as Tab, dirty: false, saving: false, confirmDel: false, leaveAsk: false, nameMiss: false,
    sel: { courses: 0, needs: 0, actions: 0, jobs: 0, zones: 0, kinds: '', traits: 0, origins: 0, people: 0, routine: '', lore: 0, tinfo: '' } as Record<string, any>,
    start: null as null | { name: string; style: string; base: string; mode: 'copy' | 'empty'; game: GameMode; scenario?: boolean },
    allTabs: false,
};
export const W = () => CW.w!;

/* ---------- binding by path ---------- */

export function getPath(path: string): any { return path.split('.').reduce((o: any, k) => (o == null ? undefined : o[k]), CW.w); }
export function setPath(path: string, v: any) {
    const keys = path.split('.'); const last = keys.pop()!;
    if ([...keys, last].some(k => k === '__proto__' || k === 'constructor' || k === 'prototype')) return;   // (an id from a file can't reach the built-in objects)
    let o: any = CW.w;
    for (const k of keys) { o[k] ??= /^\d+$/.test(last) ? [] : {}; o = o[k]; }
    if (v === undefined) delete o[last]; else o[last] = v;
    CW.dirty = true;
}
const val = (p: string) => esc(getPath(p) ?? '');
export const txt = (label: string, p: string, ph = '') => `<label class="mu-field"><span>${label}</span><input data-input="cw" data-path="${esc(p)}" data-focus="${esc(p)}" value="${val(p)}" placeholder="${esc(ph)}"></label>`;
export const area = (label: string, p: string, rows = 3, ph = '') => `<label class="mu-field"><span>${label}</span><textarea rows="${rows}" data-input="cw" data-path="${esc(p)}" data-focus="${esc(p)}" placeholder="${esc(ph)}">${val(p)}</textarea></label>`;
export const num = (label: string, p: string, min = 0, step = 1) => `<label class="mu-field"><span>${label}</span><input type="number" min="${min}" step="${step}" data-input="cw" data-type="num" data-path="${esc(p)}" data-focus="${esc(p)}" value="${val(p)}"></label>`;
export const chk = (label: string, p: string, hint = '', inverse = false) => `<label class="mu-check"><input type="checkbox" data-input="cw" data-type="${inverse ? 'nbool' : 'bool'}" data-path="${esc(p)}" ${(inverse ? getPath(p) !== false : !!getPath(p)) ? 'checked' : ''}><span>${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
export const sel = (label: string, p: string, opts: [string, string][], type = '') => `<label class="mu-field"><span>${label}</span><select data-input="cw" data-path="${esc(p)}" ${type ? `data-type="${esc(type)}"` : ''}>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(getPath(p) ?? '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const time = (label: string, p: string) => `<label class="mu-field"><span>${label}</span><input type="time" data-input="cw" data-type="time" data-path="${esc(p)}" value="${hm(Number(getPath(p) ?? 0))}"></label>`;
const csv = (label: string, p: string, hint = '') => `<label class="mu-field"><span>${label}</span><input data-input="cw" data-type="csv" data-path="${esc(p)}" data-focus="${esc(p)}" value="${esc((getPath(p) ?? []).join(', '))}">${hint ? `<small class="mu-muted">${hint}</small>` : ''}</label>`;
const color = (label: string, p: string) => `<label class="mu-field mu-cw-color"><span>${label}</span><input type="color" data-input="cw" data-path="${esc(p)}" value="${val(p) || '#888888'}"></label>`;
// `drop`: none picked leaves nothing in the file (a track's list left to the job's)
const chips = (list: string[], p: string, drop = false) => { const on: string[] = getPath(p) ?? []; return `<div class="mu-chips">${list.map(x => `<button class="mu-chip ${on.includes(x) ? 'is-on' : ''}" data-act="cw-chip" data-path="${esc(p)}" data-v="${esc(x)}" ${drop ? 'data-drop="1"' : ''}>${esc(x)}</button>`).join('')}</div>`; };
// A number held between two bounds as it is typed (a skill level 1–10, a share 0–1); a whole number when it steps by 1.
const bounded = (label: string, p: string, lo: number, hi: number, step = 1) => `<label class="mu-field"><span>${label}</span><input type="number" min="${lo}" max="${hi}" step="${step}" data-input="cw" data-type="num" data-clamp="${lo},${hi}" ${step === 1 ? 'data-int="1"' : ''} data-path="${esc(p)}" data-focus="${esc(p)}" value="${val(p)}"></label>`;
// (adult) The mark on what only plays with adult content on, so it's plain which parts of a world need it.
const ADULT = '<em class="mu-cw-adult" title="Only with adult content on">Adult</em>';
// A switch whose "off" leaves nothing in the file (no `false`), for the newer marks: a world that never had them gains none.
const flag = (label: string, p: string, hint = '', adult = false) => `<label class="mu-check"><input type="checkbox" data-input="cw" data-type="flag" data-path="${esc(p)}" ${getPath(p) ? 'checked' : ''}><span>${label}${adult ? ` ${ADULT}` : ''}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
// Words separated by commas, or a text, where nothing typed leaves nothing in the file (an optional id, a job's tags).
const words = (label: string, p: string, hint = '', ph = '') => `<label class="mu-field"><span>${label}</span><input data-input="cw" data-type="words" data-path="${esc(p)}" data-focus="${esc(p)}" value="${esc((getPath(p) ?? []).join(', '))}" placeholder="${esc(ph)}">${hint ? `<small class="mu-muted">${hint}</small>` : ''}</label>`;
const optTxt = (label: string, p: string, ph = '', hint = '') => `<label class="mu-field"><span>${label}</span><input data-input="cw" data-type="opt" data-path="${esc(p)}" data-focus="${esc(p)}" value="${val(p)}" placeholder="${esc(ph)}">${hint ? `<small class="mu-muted">${hint}</small>` : ''}</label>`;
// One per line (likes, limits), kept as typed while typing; nothing typed leaves nothing in the file.
const lines = (label: string, p: string, rows = 4, ph = '') => `<label class="mu-field"><span>${label}</span><textarea rows="${rows}" data-input="cw" data-type="lines" data-path="${esc(p)}" data-focus="${esc(p)}" placeholder="${esc(ph)}">${esc((getPath(p) ?? []).join('\n'))}</textarea></label>`;
// A choice that may be left to something else (a track's field left to the job's): `*` is "as the job", '' a value.
const inherit = (label: string, p: string, opts: [string, string][], from: string) => { const v = getPath(p); const on = v === undefined ? '*' : String(v);
    return `<label class="mu-field"><span>${label}</span><select data-input="cw" data-type="inherit" data-path="${esc(p)}">${[['*', from] as [string, string], ...opts].map(([x, l]) => `<option value="${esc(x)}" ${on === x ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`; };
// A condition in the grammar of sim/when.ts, checked as it is typed: what can't be read shows under it (such a condition
// never holds in a game). `ok`: a value the reader of this field takes besides the grammar.
const cond = (label: string, p: string, ph = '', hint = '', ok = '') => {
    const v = getPath(p); const err = typeof v === 'string' && v !== ok ? whenError(v) : '';
    return `<label class="mu-field"><span>${label}</span><input data-input="cw-when" data-path="${esc(p)}" data-focus="${esc(p)}" ${ok ? `data-ok="${esc(ok)}"` : ''} value="${typeof v === 'string' ? esc(v) : ''}" placeholder="${esc(ph)}">
        <small class="mu-cw-err" ${err ? '' : 'hidden'}>${esc(err)}</small>${hint ? `<small class="mu-muted">${hint}</small>` : ''}</label>`;
};
// The header's "•" once something changed, without drawing the screen again (typing keeps its place).
function dirtyMark() {
    if (typeof document === 'undefined') return;
    const top = document.querySelector('.mu-creator-ed .mu-subhead small'); if (top && !top.textContent?.endsWith('•')) top.textContent = `${W().name} •`;
}
// Every skill of the world (its skills, then its hobbies), as the engine counts them.
const skillOpts = (w: WorldDef): [string, string][] => skillsOf(w).map(s => [s.id, s.name] as [string, string]);
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
const own = <T>(o: Record<string, T> | undefined, k: string): T | undefined => (o && !BAD_KEYS.includes(k) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// A list on the left (pick, add, remove) and the picked item's form on the right.
function master(key: string, path: string, label: (x: any, i: number) => string, form: (i: number) => string, add: string, empty = 'Nothing here yet.') {
    const list: any[] = getPath(path) ?? [];
    const i = Math.min(CW.sel[key] ?? 0, Math.max(0, list.length - 1)); CW.sel[key] = i;
    return `<div class="mu-cw-master">
        <aside class="mu-cw-list" data-keep="cw-${key}">${list.map((x, k) => `<button class="mu-cw-row ${k === i ? 'is-on' : ''}" data-act="cw-pick" data-k="${esc(key)}" data-i="${esc(k)}">${label(x, k)}</button>`).join('') || `<p class="mu-muted">${empty}</p>`}
            <button class="mu-primary" data-act="cw-add" data-what="${esc(add)}">${icon('plus')}<span>Add</span></button></aside>
        <section class="mu-cw-form">${list.length ? `${form(i)}<button class="mu-danger mu-cw-del" data-act="cw-del" data-path="${path}.${i}">${icon('trash')}<span>Remove</span></button>` : ''}</section></div>`;
}
const placeOpts = (w: WorldDef, none = ''): [string, string][] => [...(none ? [['', none] as [string, string]] : []), ...w.places.filter(p => !p.link).map(p => [p.id, p.name] as [string, string])];
const statusOpts = (w: WorldDef): [string, string][] => w.statuses.map(s => [s.id, `${s.icon} ${s.name}`]);
const zoneOpts = (w: WorldDef, none = ''): [string, string][] => [...(none ? [['', none] as [string, string]] : []), ...w.homes.zones.map(z => [z.id, z.name] as [string, string])];
// (adult options too: a job may like Shameless)
const traitOptions = (w: WorldDef) => (w.sheet.traits ?? []).flatMap(t => [...t.options, ...(t.adultOptions ?? [])]);

/* ---------- tabs ---------- */

function tabGeneral(w: WorldDef) {
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec"><h4>About this ${isScenario(w) ? 'Home' : 'world'}</h4>${txt('Name', 'name')}${sel('Made for (the tag on its card)', 'madeFor', RPG_LOCKED ? [['lifesim', 'Life-Sim']] : [['lifesim', 'Life-Sim'], ['rpg', 'RPG']])}<label class="mu-field"><span>Short description (shown when choosing a world)</span><textarea rows="3" maxlength="${WORLD_DESC_MAX}" data-input="cw" data-path="description" data-focus="description">${val('description')}</textarea><small class="mu-muted">Up to ${WORLD_DESC_MAX} characters. Only you see it: it is not sent to the AI (the setting below is).</small></label>
            ${area('Setting (what the AI always knows about this world)', 'setting', 5)}
            ${isScenario(w) ? `${area('Premise (how the story starts: shown when the game begins, and told to the AI)', 'scenario.premise', 5)}
                <label class="mu-check"><input type="checkbox" data-input="cw-alltabs" ${CW.allTabs ? 'checked' : ''}><span>Show every tab<small>A Home hides Realm, Economy, RPG and Goals & rewards (a Home is always Life-Sim, with life goals off). Jobs and courses happen off-screen.</small></span></label>` : ''}</section>
        <section class="mu-cw-sec"><h4>Cover</h4><div class="mu-cw-cover" style="${w.cover ? `background-image:url('${safeUrl(worldFile(w, w.cover))}')` : ''}">${w.cover ? '' : '<span>No cover</span>'}</div>
            <div class="mu-row"><button data-act="cw-cover">${icon('upload')}<span>Choose a picture</span></button>${!isScenario(w) && w.maps[0] ? `<button class="mu-ghost" data-act="cw-cover-map">Use the first map</button>` : ''}${w.cover ? `<button class="mu-ghost" data-act="cw-cover-clear">${icon('x')}<span>Remove</span></button>` : ''}</div>
            <small class="mu-muted">The picture on the ${isScenario(w) ? 'Home' : 'world'}'s card. Best at 16:9 (1400 × 782).</small>
            ${isScenario(w) ? (() => { const pics = [...new Set(w.places.filter(p => !p.link && p.bg).map(p => p.bg!))]; return pics.length ? `<span class="mu-cw-sub">Or use a room's picture</span><div class="mu-cw-coverpick">${pics.map(f => `<button class="${w.cover === f ? 'is-on' : ''}" data-act="cw-cover-room" data-file="${esc(f)}" title="${esc(w.places.find(p => p.bg === f)?.name ?? '')}" style="background-image:url('${safeUrl(worldFile(w, f))}')"></button>`).join('')}</div>` : ''; })() : ''}</section>
        <section class="mu-cw-sec"><h4>Look: style and skin</h4>
            ${sel('Style (the words of the game and the device)', 'style', STYLES.filter(x => x.ready).map(x => [x.id, x.name] as [string, string]))}
            ${sel('Skin (colors of the HUD)', 'skin', (SKINS[styleOf(w)] ?? []).map(k => [k.id, k.name] as [string, string]))}
            <small class="mu-muted">Mix them as you like: the rules and the people stay the same. Players can still pick another skin in their settings.</small></section>
        <section class="mu-cw-sec"><h4>Money</h4><div class="mu-row2">${txt('Currency name', 'currency.name', 'Gold')}${txt('Symbol', 'currency.symbol', 'g')}</div>${chk('The symbol goes after the amount ("40 g")', 'currency.after')}</section>
        <section class="mu-cw-sec"><h4>Time</h4><div class="mu-row2">
            ${sel('The game starts on', 'time.startDay', WEEKDAYS.map((d, k) => [String(k + 1), d] as [string, string]), 'num')}${time('at', 'time.startMinutes')}</div>
            ${sel('Clock speed', 'time.speed', [['0', 'Paused'], ['30', '×0.5'], ['60', '×1 (1 real second = 1 game minute)'], ['120', '×2']], 'num')}
            <div class="mu-row2">${time('Sleeping ends at', 'sleep.until')}<p class="mu-muted">Travel: 30 minutes inside a town, 2 hours between towns.</p></div>
            ${chk('Sleep only at home', 'sleep.homeOnly')}
            <h4>Periods of the day</h4>
            ${w.time.periods.map((_p, k) => `<div class="mu-row mu-cw-inline">${txt('Name', `time.periods.${k}.name`)}${time('From', `time.periods.${k}.from`)}${num('Prices ×', `time.periods.${k}.prices`, 0.1, 0.05)}<button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="time.periods.${k}" title="Remove">${icon('x')}</button></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="period">${icon('plus')}<span>Add a period</span></button>
            <small class="mu-muted">Each part of the day can change what is open (Maps: a place's "Closed at"), what things cost out and about (Prices ×, empty = as listed) and how places, homes and maps look (a picture for each part of the day).</small></section>
    </div>`;
}

function tabFeatures(w: WorldDef) {
    const apps = appsOf(w);
    w.features ??= {}; w.features.apps = apps;
    w.tags = [...allTags(w)];   // the RPG tag stays in the world while the RPG mode is locked
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec mu-cw-wide"><h4>What kind of world</h4><p class="mu-muted">${RPG_LOCKED ? `Realistic or fantasy: what it holds (magic, gods, familiars and weapons with a soul only in fantasy). ${RPG_NOTE}` : 'Life-Sim and RPG: the ways it can be played (with both, the player chooses when starting). Realistic or fantasy: what it holds (magic, gods, familiars and weapons with a soul only in fantasy).'}</p>
            ${pairChips(WORLD_TAGS.filter(t => !RPG_LOCKED || t.id !== 'rpg').map(t => [t.id, `${t.name}: ${t.desc}`] as [string, string]), 'tags')}</section>
        ${isScenario(w) ? '' : `<section class="mu-cw-sec mu-cw-wide"><h4>Game mode</h4><p class="mu-muted">How a new game starts (the player can pick another way the tags allow).</p>${modeCards(gameMode(w), 'cw-mode')}
            ${gameMode(w) === 'custom' ? '<small class="mu-muted">Custom: turn each need on or off in the Needs tab, and the systems below here.</small>' : ''}</section>`}
        <section class="mu-cw-sec"><h4>Phone</h4>${chk('The player has a phone', 'features.phone')}${txt('What it is called', 'features.device', 'Phone')}
            <div class="mu-cw-apps">${apps.map((a, k) => `<div class="mu-cw-app ${a.on && (!appSystem(a.id) || systemOn(w, appSystem(a.id)!)) ? '' : 'is-off'}" ${appSystem(a.id) && !systemOn(w, appSystem(a.id)!) ? `title="Its system is off (Systems, below)"` : ''}><i style="--c:${esc(a.color)}">${icon(a.icon)}</i>
                <input type="checkbox" data-input="cw" data-type="bool" data-path="features.apps.${k}.on" ${a.on ? 'checked' : ''} title="On">
                <input data-input="cw" data-path="features.apps.${k}.name" data-focus="app${k}" value="${esc(a.name)}">
                <select data-input="cw" data-path="features.apps.${k}.icon">${ICON_NAMES().map(n => `<option ${n === a.icon ? 'selected' : ''}>${n}</option>`).join('')}</select>
                <input type="color" data-input="cw" data-path="features.apps.${k}.color" value="${esc(a.color)}"></div>`).join('')}</div>
            <small class="mu-muted">Rename an app, change its icon and color, or turn it off.</small></section>
        <section class="mu-cw-sec"><h4>How things work here</h4>
            ${sel('The device looks like', 'features.deviceLook', [['phone', 'A phone (apps on a screen)'], ['book', 'A journal (an open book with pages)']])}
            ${sel('The social app is', 'features.socialKind', [['feed', 'A social network (posts, likes and replies)'], ['board', 'A notice board (notices; whoever answers writes you a letter)']])}
            ${sel('Messages are', 'features.messageKind', [['texts', 'Text messages'], ['letters', 'Letters carried by a courier']])}
            ${txt('How people write (what the AI is told for messages and posts)', 'ai.voice', 'casual; emoji and hashtags are fine')}</section>
        <section class="mu-cw-sec"><h4>Systems</h4>
            <small class="mu-muted">A system turned off is gone from the HUD, the ${esc(w.features?.device ?? 'phone').toLowerCase()} and what the AI is told, and the game stops running it. Saves keep its data: turn it back on and it picks up where it was.</small>
            <div class="mu-cw-systems">${SYSTEMS.map(sy => {
                const named = sy.apps.map(id => apps.find(a => a.id === id)?.name).filter(n => n && n !== sy.name);   // the world's name for its app
                const blocked = sy.needs && !systemOn(w, sy.needs) ? SYSTEMS.find(x => x.id === sy.needs)!.name : '';
                const label = `${esc(sy.name)}${named.length ? ` <em class="mu-muted">(${esc(named.join(', '))})</em>` : ''}`;
                const hint = blocked ? `Needs ${esc(blocked)} on.` : `Off: ${esc(sy.desc)}`;
                // a system made for another kind of world (fantasy, RPG) starts off here, but any world can turn it on
                if (sy.tag) { const tagName = WORLD_TAGS.find(t => t.id === sy.tag)?.name ?? sy.tag;
                    return `<div class="${blocked ? 'is-off' : ''}"><label class="mu-check"><input type="checkbox" data-input="cw" data-type="bool" data-path="features.${sy.id}" ${systemOn(w, sy.id) ? 'checked' : ''}><span>${label}<small>${hint}${worldTags(w).includes(sy.tag) ? '' : ` Made for ${esc(tagName)} worlds: off unless you turn it on.`}</small></span></label></div>`; }
                return `<div class="${blocked ? 'is-off' : ''}">${chk(label, `features.${sy.id}`, hint, true)}</div>`;
            }).join('')}</div>
            ${systemOn(w, 'bills') ? chk('Rent', 'rent', 'Off: homes are free (the other bills stay).') : ''}
            ${w.rent && systemOn(w, 'bills') ? `<div class="mu-row2">${num('Rent is paid every … days', 'rent.everyDays', 1)}${txt('Message when it is paid', 'rent.text')}</div>` : ''}</section>
    </div>`;
}

function tabNeeds(w: WorldDef) {
    return master('needs', 'statuses', s => `<b>${esc(s.icon)} ${esc(s.name)}</b><small>${s.hud ? 'On the HUD' : ''}${s.adult ? ' · adult' : ''}</small>`, i => {
        const p = `statuses.${i}`; const s = w.statuses[i];
        return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon (an emoji)', `${p}.icon`)}</div>
            <div class="mu-row2">${color('Color', `${p}.color`)}${chk('Show on the HUD', `${p}.hud`)}</div>
            <div class="mu-row2">${RPG_LOCKED ? '' : chk('Only in the RPG mode', `${p}.rpg`, 'Like health: out of Life-Sim worlds.')}${gameMode(w) === 'custom' ? chk('Turned off in this world', `${p}.off`) : ''}</div>
            ${flag('Only with adult content on', `${p}.adult`, 'Like Desire: out of play otherwise, and nothing changes it.', true)}
            <div class="mu-row2">${num('Starts at', `${p}.start`)}${num('Maximum', `${p}.max`, 1)}</div>
            <h4>Drops over time</h4>${chk('It drops by itself', `${p}.decay`)}
            ${s.decay ? `<div class="mu-row2">${num('By', `${p}.decay.amount`, 0, 0.5)}${num('Every … game minutes', `${p}.decay.everyMinutes`, 1)}</div>${chk('Only while awake', `${p}.decay.awakeOnly`)}` : ''}
            ${num('Sleeping restores', `sleep.restore.${s.id}`)}
            <h4>At zero</h4>${chk('Something happens at zero', `${p}.zero`)}
            ${s.zero ? `${area('Message', `${p}.zero.text`, 2, 'You pass out… The bill is {cost}.')}
                <div class="mu-row2">${sel('You wake up at', `${p}.zero.place`, [['', '(stay where you are)'], ['home', 'Your home'], ...placeOpts(w)])}${num('It costs', `${p}.zero.cost`)}</div>
                <div class="mu-row2">${num('Comes back to', `${p}.zero.restore`)}${sel('While at zero, it drains', `${p}.zero.drain.status`, [['', '(nothing)'], ...statusOpts(w)])}</div>
                ${s.zero.drain?.status ? `<div class="mu-row2">${num('By', `${p}.zero.drain.amount`)}${num('Every … minutes', `${p}.zero.drain.everyMinutes`, 1)}</div>` : ''}
                ${chk('A crisis after a while at zero', `${p}.zero.crisis`, 'Once each time it hits zero: you faint, you break down… People who see it remember it.')}
                ${s.zero.crisis ? `<div class="mu-row2">${num('After … minutes at zero', `${p}.zero.crisis.after`)}${sel('You end up at', `${p}.zero.crisis.place`, [['', '(stay where you are)'], ['home', 'Your home'], ...placeOpts(w)])}</div>
                    ${area('What happens (message)', `${p}.zero.crisis.text`, 2, 'You feel faint and nearly collapse…')}
                    <div class="mu-row2">${num('It costs', `${p}.zero.crisis.cost`)}${num('Comes back to', `${p}.zero.crisis.restore`)}</div>
                    <div class="mu-row2">${num('Your mood changes by', `${p}.zero.crisis.mood`, -100)}${num('People who saw it think less of you by', `${p}.zero.crisis.shame`)}</div>
                    ${txt('What the people who saw it remember ({u} = you, {0} = the place)', `${p}.zero.crisis.seen`, '{u} nearly fainted at {0}.')}` : ''}` : ''}`;
    }, 'need');
}

const WHERE: [string, string][] = [['tags', 'At places with a tag'], ['place', 'At one place'], ['home', 'At home'], ['anywhere', 'Anywhere']];
function tabActions(w: WorldDef) {
    const tags = [...new Set(w.places.flatMap(p => p.tags ?? []))];
    return `${master('actions', 'actions', a => `<b>${esc(a.icon ?? '')} ${esc(a.label || a.name)}</b><small>${a.cost ? `${esc(money(w, a.cost))} · ` : ''}${a.minutes} min</small>`, i => {
        const p = `actions.${i}`; const a = w.actions[i];
        const where = a.anywhere ? 'anywhere' : a.home ? 'home' : a.place ? 'place' : 'tags';
        return `<div class="mu-row2">${txt('Button text', `${p}.label`, 'Have a coffee')}${txt('Short name', `${p}.name`, 'Coffee')}</div>
            <div class="mu-row2">${txt('Icon (an emoji)', `${p}.icon`)}${num('Takes … minutes', `${p}.minutes`, 0)}</div>
            ${num(`Costs (${esc(w.currency.symbol)})`, `${p}.cost`)}
            <label class="mu-field"><span>Where</span><select data-act-input="cw-where" data-input="cw-where" data-i="${esc(i)}">${WHERE.map(([v, l]) => `<option value="${v}" ${where === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            ${where === 'tags' ? chips(tags, `${p}.tags`) : where === 'place' ? sel('Place', `${p}.place`, placeOpts(w)) : ''}
            ${where === 'tags' ? `<h4>But not in places tagged</h4>${chips(tags, `${p}.notTags`)}` : ''}
            ${chk('An outing (off-screen)', `${p}.outing`, 'You leave for a while (work, errands, a night out) and come back: offered even when needs are off. Made for Homes.')}
            ${sel('Only if the player owns', `${p}.needsItem`, [['', 'Nothing (always offered)'] as [string, string], ...(((w.catalogs as any).shop ?? []) as any[]).map(it => [it.id, `${it.icon ?? ''} ${it.name}`] as [string, string])])}
            <h4>Effects</h4><div class="mu-cw-effects">${w.statuses.map(s => num(esc(`${s.icon} ${s.name}`), `${p}.effects.${s.id}`, -1000)).join('')}</div>
            ${privateBox(w, p, a)}${outcomesList(a)}`;
    }, 'action')}${storiesList(w)}`;
}
// (adult) A private moment: done in private, only with adult content on, how hard it is (the private roll), the words it
// matches against someone's likes and hard limits, and the chance of being caught where it's done (with what that costs).
// Folded in a world whose action has none of it.
function privateBox(w: WorldDef, p: string, a: WorldDef['actions'][number]) {
    const set = a.private || a.adult || a.risk !== undefined || a.fee !== undefined || a.dc !== undefined || !!a.matches?.length;
    return `<details class="mu-cw-adultbox" ${set ? 'open' : ''}><summary>Private moments ${ADULT}</summary>
        <div class="mu-row2">${flag('Done in private', `${p}.private`, 'A room of its own, a private bath: a private scene, where intimate profiles count.')}${flag('Only with adult content on', `${p}.adult`, '', true)}</div>
        <div class="mu-row2">${bounded('How hard it is (the private roll: 1–30)', `${p}.dc`, 1, 30)}${words('Words it matches (likes and hard limits)', `${p}.matches`, 'Matched against what someone likes, and their hard limits (a limit stops it).', 'massage, bath together')}</div>
        <div class="mu-row2">${bounded('Chance of being caught (0 … 1)', `${p}.risk`, 0, 1, 0.05)}${num(`Getting caught costs (${esc(w.currency.symbol)})`, `${p}.fee`)}</div>
        <small class="mu-muted">Empty: the roll is the game's (10, 13 with a chance of being caught); no chance of being caught. Caught, it doesn't happen: a fee, a week's ban there, and maybe a rumor.</small></details>`;
}
// Outcomes and story choices aren't edited here: they're kept as the world file has them. Their ids (a name a private
// overlay rewrites them by) are shown, never changed or renumbered.
const idTag = (id: unknown) => (typeof id === 'string' && id ? `<code data-notr>${esc(id)}</code>` : '<small class="mu-muted">(no id)</small>');
const clip = (t: unknown, n = 70) => { const x = String(t ?? ''); return esc(x.length > n ? `${x.slice(0, n - 1)}…` : x); };
function outcomesList(a: WorldDef['actions'][number]) {
    const l = a.outcomes ?? []; if (!l.length) return '';
    return `<details class="mu-cw-kept"><summary>Outcomes · ${l.length} (kept as the world file has them)</summary>
        ${l.map(o => `<div class="mu-cw-keptrow">${idTag(o.id)}<small class="mu-muted">weight ${esc(o.weight)}</small><span data-notr>${clip(o.text)}</span></div>`).join('')}</details>`;
}
function storiesList(w: WorldDef) {
    const l = w.stories ?? []; if (!l.length) return '';
    return `<section class="mu-cw-sec mu-cw-wide"><details class="mu-cw-kept"><summary>Street stories · ${l.length} (kept as the world file has them)</summary>
        <p class="mu-muted">Seen once at a place. Their choices keep their order (\`seen: story:2\` counts by position) and their ids, which a private overlay rewrites them by.</p>
        ${l.map(x => `<div class="mu-cw-keptstory"><div class="mu-cw-keptrow">${idTag(x.id)}${x.adult ? ADULT : ''}<span data-notr>${clip(x.setup, 90)}</span></div>
            ${(x.choices ?? []).map((c, k) => `<div class="mu-cw-keptrow is-sub"><small class="mu-muted">${k + 1}</small>${idTag(c.id)}<span data-notr>${clip(c.label)}</span></div>`).join('')}</div>`).join('')}</details></section>`;
}

function tabJobs(w: WorldDef) {
    return `<div class="mu-row2">${num('Career speed (×; 2: twice as fast)', 'careerSpeed', 0.25, 0.25)}${sel('Work rules a new game starts with', 'workPreset', [['', 'Realistic (Relaxed in a Home)'], ['realistic', 'Realistic'], ['reduced', 'Reduced'], ['relaxed', 'Relaxed']], 'opt')}</div>
        ${master('jobs', 'occupations', o => `<b>${esc(o.name)}</b><small>${esc(w.places.find(p => p.id === o.place)?.name ?? '—')}</small>`, i => {
        const p = `occupations.${i}`; const o = w.occupations[i];
        return `${txt('Name', `${p}.name`)}<button class="mu-ghost" data-act="cw-rnd-job" data-i="${esc(i)}">${icon('redo')}<span>Randomize hours, pay and promotions</span></button>
            ${sel('Works at', `${p}.place`, placeOpts(w, '(choose a place)'))}
            <div class="mu-row2">${num('Shift length (hours)', `${p}.shift`, 1)}${num('Energy per shift', `${p}.cost.energy`)}</div>
            <div class="mu-row2">${num('Opens at (hour)', `${p}.hours.0`, 0)}${num('Closes at (hour)', `${p}.hours.1`, 0)}</div>
            <div class="mu-row2">${num('Days a week (empty: five)', `${p}.schedule.days`, 0)}${num('Career length (1: about a game year)', `${p}.length`, 0.1, 0.1)}</div>
            <div class="mu-row2">${num('Shift from (hour; empty: when it opens)', `${p}.schedule.from`, 0)}${num('Shift to (hour)', `${p}.schedule.to`, 0)}</div>
            <div class="mu-row2">${num('Extra pay at night (0.25: +25%)', `${p}.nightPay`, 0, 0.05)}${chk('The boss asks for overtime', `${p}.overtime`)}</div>
            <div class="mu-row2">${chk('Worked off-screen', `${p}.offScreen`, 'Away from every map during the shift')}${chk('Open to the player', `${p}.hireable`, '', true)}</div>
            <div class="mu-row2">${flag('Only with adult content on', `${p}.adult`, '', true)}${bounded('Months before the first shift (0–12; empty: from the next shift)', `${p}.startAfter`, 0, 12, 0.5)}</div>
            ${words('Kinds of job (tags, comma separated)', `${p}.tags`, 'Effects can aim at them: pay and performance in every job of a kind (adult-stage, nightwork).', 'nightwork')}
            <h4>Ranks and pay per hour</h4>
            ${rankRows(w, p, o)}
            ${csv('New bottom ranks added (ids)', `${p}.shifted`, 'Added a rank below the first one after people played this job? Add a new id here once: saved games holding this job move up one rank, so they keep the rank they had.')}
            ${branchEditor(w, o, p)}
            <h4>Traits that help (faster promotions)</h4>${chips(traitOptions(w), `${p}.likes`)}
            <h4>Required traits (one of them)</h4>${chips(traitOptions(w), `${p}.needs`)}
            ${(w.hobbies ?? []).length ? `<div class="mu-row2">${sel('Hobby it asks for', `${p}.hobby.id`, [['', '(none)'], ...(w.hobbies ?? []).map(h => [h.id, h.name] as [string, string])])}${num('Level', `${p}.hobby.level`, 0)}</div>` : ''}
            ${skillOpts(w).length || o.skills || o.trains ? `<h4>Skills</h4>${skillLevels(w, `${p}.skills`, 'Skill levels it asks to be hired')}
                <div class="mu-field"><span>Skills it trains a little each shift</span>${pairChips(skillOpts(w), `${p}.trains`, true)}</div>` : ''}
            ${eventsEditor(w, `${p}.events`, o.events ?? [], 'Things that happen on a shift now and then: a setup and two or three choices.')}
            ${trackEditor(w, o, p)}`;
    }, 'job')}`;
}

// A job's (or a track's) ranks: name, pay per hour, time to the next, days a week at that rank (an extra called once a
// week), and the student rank when it asks for a course.
function rankRows(w: WorldDef, p: string, o: { ranks?: Rank[]; courses?: string[] }, courses = o.courses) {
    const ranks = o.ranks ?? [];
    return `${ranks.map((_r, k) => `<div class="mu-row mu-cw-inline">${txt('Rank', `${p}.ranks.${k}.name`)}${num(`Pay (${esc(w.currency.symbol)}/h)`, `${p}.ranks.${k}.pay`)}
            ${k < ranks.length - 1 ? num('Time to the next rank (relative)', `${p}.promote.${k}`, 1) : '<span class="mu-cw-spacer"></span>'}
            ${bounded('Days a week (empty: the schedule\'s)', `${p}.ranks.${k}.days`, 1, 7)}
            <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${p}.ranks.${k}" title="Remove">${icon('x')}</button></div>`).join('')}
        <button class="mu-ghost" data-act="cw-add" data-what="rank" data-path="${p}.ranks">${icon('plus')}<span>Add a rank</span></button>
        ${ranks.map((r, k) => (k === 0 && (courses ?? []).length) || r.student ? chk(k ? `${esc(r.name)} is a student rank` : 'The first rank is a student rank', `${p}.ranks.${k}.student`, 'You can be hired at it while you take the course this job asks for; the next rank needs the course finished.') : '').join('')}`;
}
// Skill levels by skill (a job's or a track's levels to be hired): a row each, the skill changed in place (its level
// kept, never two of one skill), "Add a skill" adding the next one of the world at level 3.
function skillLevels(w: WorldDef, p: string, label: string) {
    const map = (getPath(p) ?? {}) as Record<string, number>; const all = skillOpts(w);
    const has = Object.keys(map).filter(s => !BAD_KEYS.includes(s)); const free = all.filter(([id]) => !has.includes(id));
    return `<span class="mu-cw-sub">${label}</span>${has.map(s => `<div class="mu-row mu-cw-inline"><label class="mu-field"><span>Skill</span><select data-input="cw-rekey" data-path="${esc(p)}" data-from="${esc(s)}">${[...all.filter(([id]) => id === s || free.some(([f]) => f === id)), ...(all.some(([id]) => id === s) ? [] : [[s, s] as [string, string]])].map(([id, n]) => `<option value="${esc(id)}" ${id === s ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
            ${bounded('Level (1–10)', `${p}.${s}`, 1, 10)}<button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${esc(`${p}.${s}`)}" title="Remove">${icon('x')}</button></div>`).join('') || '<small class="mu-muted">None.</small>'}
        ${free.length ? `<button class="mu-ghost" data-act="cw-add" data-what="mapkey" data-keys="skills" data-v="3" data-path="${esc(p)}">${icon('plus')}<span>Add a skill</span></button>` : ''}`;
}
// How some of the world's people feel about you after a choice (a name → friendship points, 2–5 "a little"); in an event
// from a colleague, "{who}" is them.
function feelsRows(w: WorldDef, p: string, who: boolean) {
    const map = (getPath(p) ?? {}) as Record<string, number>; const names = [...(who ? ['{who}'] : []), ...w.cast.examples.map(e => e.name)];
    const has = Object.keys(map).filter(n => !BAD_KEYS.includes(n)); const free = names.filter(n => !has.includes(n));
    const label = (n: string) => (n === '{who}' ? 'The colleague ({who})' : n);
    return `<span class="mu-cw-sub">How people feel about you after it</span>${has.map(n => `<div class="mu-row mu-cw-inline"><label class="mu-field"><span>Who</span><select data-input="cw-rekey" data-path="${esc(p)}" data-from="${esc(n)}">${[...names.filter(x => x === n || free.includes(x)), ...(names.includes(n) ? [] : [n])].map(x => `<option value="${esc(x)}" ${x === n ? 'selected' : ''}>${esc(label(x))}</option>`).join('')}</select></label>
            ${num('Friendship (points; 2–5: a little)', `${p}.${n}`, -100)}<button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${esc(`${p}.${n}`)}" title="Remove">${icon('x')}</button></div>`).join('')}
        ${free.length ? `<button class="mu-ghost" data-act="cw-add" data-what="mapkey" data-keys="${who ? 'who' : 'people'}" data-v="3" data-path="${esc(p)}">${icon('plus')}<span>Add someone</span></button>` : ''}`;
}

/* ---------- work events and job tracks ---------- */

// Who an event may come from (`WorkEvent.from.level`): a friendship level, a romance level or a couple's.
const FROM_LEVELS = (): Opt[] => [...FRIEND_TIERS.filter(t => t.lo >= 10).map(t => [t.id, t.name] as Opt), ...ROMANCE_TIERS.filter(t => t.lo > 0).map(t => [t.id, `${t.name} (romance)`] as Opt),
    ['casual', 'Something casual'], ['dating', 'Dating'], ['engaged', 'Engaged'], ['married', 'Married']];
// What a choice (or its failed roll) does: what happens, performance (−2 … 2), money, needs, how people feel, a fact, a
// rumor, a skill it trains, (adult) a chance of a raid, and a boost for some days held inside the boost limits.
function resultForm(w: WorldDef, q: string, who: boolean) {
    const boost = getPath(`${q}.boost`);
    return `${area('What happens (told to the AI)', `${q}.text`, 2)}
        <div class="mu-row2">${bounded('Performance (−2 … 2)', `${q}.perf`, -2, 2)}${num(`Money (${esc(w.currency.symbol)}; below 0: it costs)`, `${q}.money`, -1000000)}</div>
        <div class="mu-cw-effects">${w.statuses.map(s => num(esc(`${s.icon} ${s.name}`), `${q}.effects.${s.id}`, -100)).join('')}</div>
        ${feelsRows(w, `${q}.feels`, who)}
        <div class="mu-row2">${optTxt('Remembered (a fact; {u}: you)', `${q}.fact`, '{u} covered a shift for a colleague')}${optTxt('A rumor it starts at work', `${q}.rumor`)}</div>
        <div class="mu-row2">${skillOpts(w).length ? sel('A skill it trains a little', `${q}.trains`, [['', '(none)'], ...skillOpts(w)], 'opt') : '<span></span>'}${bounded(`Chance of a raid over it (0 … 1) ${ADULT}`, `${q}.risk`, 0, 1, 0.05)}</div>
        ${boost ? `<div class="mu-cw-path"><span class="mu-cw-sub">A boost for some days</span>${bounded(`For how many days (${BOOST_DAYS.min}–${BOOST_DAYS.max})`, `${q}.boost.days`, BOOST_DAYS.min, BOOST_DAYS.max)}
            <p class="mu-muted">One or two effects, each within ±${BOOST_LIMITS.pct * 100}% (a flat amount within ±${BOOST_LIMITS.flat}) and the range the game allows for its kind (a ranking's +15% pay for a week).</p>
            ${fxEditor(w, `${q}.boost.effects`, 'boost', 2)}<button class="mu-ghost mu-danger-text" data-act="cw-del" data-path="${esc(`${q}.boost`)}">${icon('x')}<span>No boost</span></button></div>`
        : `<button class="mu-ghost" data-act="cw-add" data-what="wboost" data-path="${esc(`${q}.boost`)}">${icon('plus')}<span>A boost for some days</span></button>`}`;
}
const ROLL_NONE = '-', ROLL_PLAIN = '*';
function choiceForm(w: WorldDef, q: string, k: number, c: any, who: boolean) {
    const roll: string = c.roll ? (c.roll.skill ?? ROLL_PLAIN) : ROLL_NONE;
    const rolls: Opt[] = [[ROLL_NONE, 'No roll'], [ROLL_PLAIN, 'A roll (no skill)'], ...skillOpts(w)];
    if (!rolls.some(([v]) => v === roll)) rolls.push([roll, roll]);
    return `<div class="mu-cw-path mu-cw-choice"><div class="mu-row mu-cw-inline"><b class="mu-cw-stepno">Choice ${k + 1}</b>${idTag(c.id)}<span class="mu-cw-spacer"></span>
            <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${esc(q)}" title="Remove this choice">${icon('x')}</button></div>
        <div class="mu-row2">${txt('What you choose (the button)', `${q}.label`, 'Cover for them')}${cond('Only offered while (optional)', `${q}.when`, 'present: Mio')}</div>
        <div class="mu-row2"><label class="mu-field"><span>A roll</span><select data-input="cw-roll" data-path="${esc(q)}">${rolls.map(([v, l]) => `<option value="${esc(v)}" ${v === roll ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            ${c.roll ? bounded('Against (1–30)', `${q}.roll.dc`, 1, 30) : '<span></span>'}</div>
        ${resultForm(w, q, who)}
        ${c.roll ? (c.fail ? `<div class="mu-cw-path"><span class="mu-cw-sub">When the roll fails, instead</span>${resultForm(w, `${q}.fail`, who)}
                <button class="mu-ghost mu-danger-text" data-act="cw-del" data-path="${esc(`${q}.fail`)}">${icon('x')}<span>Remove: a failed roll only “did not work out”</span></button></div>`
            : `<button class="mu-ghost" data-act="cw-add" data-what="wfail" data-path="${esc(`${q}.fail`)}">${icon('plus')}<span>What happens when the roll fails</span></button>`) : ''}</div>`;
}
// A job's (or a track's) work events: a list, the one picked open below it. Choices keep their order and their ids (a
// private overlay rewrites them by id): ids are shown, never changed; a new choice gets one when the others have them.
function eventsEditor(w: WorldDef, p: string, list: any[], intro: string) {
    const open = list.findIndex((_e, k) => CW.sel.wev === `${p}.${k}`);
    const e = open >= 0 ? list[open] : undefined, q = `${p}.${open}`, who = !!e?.from;
    return `<h4>Work events</h4><p class="mu-muted">${esc(intro)}</p>
        <div class="mu-cw-evs">${list.map((x, k) => `<button class="mu-cw-row ${k === open ? 'is-on' : ''}" data-act="cw-wev" data-k="${esc(`${p}.${k}`)}"><b data-notr>${clip(x.setup, 60)}</b><small>${esc(x.id)} · ${(x.choices ?? []).length} choices${x.from ? ' · from a colleague' : ''}${x.adult ? ' · adult' : ''}</small></button>`).join('') || '<small class="mu-muted">No work events.</small>'}
            <button class="mu-ghost" data-act="cw-add" data-what="wevent" data-path="${esc(p)}">${icon('plus')}<span>Add a work event</span></button></div>
        ${e ? `<div class="mu-cw-path mu-cw-event"><div class="mu-row mu-cw-inline">${idTag(e.id)}<span class="mu-cw-spacer"></span>
                <button class="mu-ghost mu-danger-text" data-act="cw-del" data-path="${esc(q)}">${icon('trash')}<span>Remove this event</span></button></div>
            ${area('What happens (the setup)', `${q}.setup`, 2, 'A colleague asks you to cover their shift.')}
            <div class="mu-row2">${cond('Only while (optional)', `${q}.when`, 'track: woman')}${flag('Only with adult content on', `${q}.adult`, '', true)}</div>
            <label class="mu-check"><input type="checkbox" data-input="cw-from" data-path="${esc(`${q}.from`)}" ${e.from ? 'checked' : ''}><span>It comes from a colleague<small>One of the world's people in this job whom you know well enough: {who} in its texts is their name.</small></span></label>
            ${e.from ? `<div class="mu-row2">${sel('Known at least as', `${q}.from.level`, [['', 'Friend (as usual)'], ...FROM_LEVELS().filter(([v]) => v !== 'friend')], 'opt')}${optTxt('With nobody like that, someone unnamed', `${q}.from.fallback`, 'another actress', 'Empty: the event waits for such a colleague.')}</div>
                ${bounded('…at this share of the usual chance (0 … 1; empty: 0.5)', `${q}.from.odds`, 0, 1, 0.05)}` : ''}
            ${(e.choices ?? []).map((c: any, k: number) => choiceForm(w, `${q}.choices.${k}`, k, c, who)).join('')}
            ${(e.choices ?? []).length < 4 ? `<button class="mu-ghost" data-act="cw-add" data-what="wchoice" data-path="${esc(`${q}.choices`)}">${icon('plus')}<span>Add a choice</span></button>` : ''}</div>` : ''}`;
}
// A job's tracks by gender (`Occupation.tracks`): one job, one listing, with its own ranks, pay, hours and gates for a
// gender. What a track leaves empty is the job's own; its work events come on top of the job's.
function trackEditor(w: WorldDef, o: WorldDef['occupations'][number], p: string) {
    const tracks = o.tracks ?? {}; const gs = gendersOf(w);
    const ids = Object.keys(tracks).filter(k => !BAD_KEYS.includes(k));
    if (!ids.includes(CW.sel.track)) CW.sel.track = ids[0] ?? '';
    const g: string = CW.sel.track; const t = g ? tracks[g] : undefined; const q = `${p}.tracks.${g}`;
    const gname = (id: string) => gs.find(x => x.id === id)?.name ?? id;
    const free = gs.filter(x => !ids.includes(x.id));
    const yes = (b: boolean | undefined, d: boolean) => ((b ?? d) ? 'yes' : 'no');
    const courses = (((w.catalogs as any).courses ?? []) as any[]).map(c => [c.id, c.name] as Opt);
    const placeName = o.place ? (w.places.find(x => x.id === o.place)?.name ?? o.place) : '(none)';
    const hire = t?.hire === undefined ? [] : Array.isArray(t.hire) ? t.hire : [t.hire];
    return `<h4>Tracks by gender</h4><p class="mu-muted">One job and one listing, with its own ranks, pay, hours and gates for a gender (the AV actor's track beside the actresses'). What a track leaves empty is the job's own; its work events come on top of the job's. A player whose gender has no track picks one of the open tracks once, when hired. Write a track for every gender that has one, even when it is the job as written.</p>
        <div class="mu-row mu-cw-inline mu-cw-tracks">${ids.map(id => `<button class="mu-chip ${id === g ? 'is-on' : ''}" data-act="cw-track" data-id="${esc(id)}">${esc(tracks[id]?.name || o.name)} <small>${esc(gname(id))}</small></button>`).join('') || '<small class="mu-muted">No tracks: the job is the same for everyone.</small>'}
            ${free.length ? `<label class="mu-field"><span>Add a track for</span><select data-input="cw-track-add" data-path="${esc(`${p}.tracks`)}"><option value="">(choose)</option>${free.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>` : ''}</div>
        ${t ? `<div class="mu-cw-path mu-cw-track">
            <div class="mu-row mu-cw-inline">${optTxt(`Name of this track (${esc(gname(g))}; empty: the job's)`, `${q}.name`, o.name)}<button class="mu-ghost mu-danger-text" data-act="cw-del" data-path="${esc(q)}">${icon('trash')}<span>Remove this track</span></button></div>
            <span class="mu-cw-sub">Being hired</span>
            <div class="mu-row2">${sel('Open to the player', `${q}.hireable`, [['', `As the job (${yes(o.hireable, true)})`], ['true', 'Yes'], ['false', 'No']], 'tri')}${num(`A fee when hired (${esc(w.currency.symbol)}; waived by one of its courses)`, `${q}.fee`)}</div>
            <span class="mu-cw-sub">Hired only with (one of these is enough; none: anyone)</span>
            ${hire.map((_h, k) => `<div class="mu-row mu-cw-inline">${wayField(`Condition ${k + 1}`, Array.isArray(t.hire) ? `${q}.hire.${k}` : `${q}.hire`, 'holds: av_director_card')}<button class="mu-ghost mu-ibtn" data-act="cw-hire-del" data-path="${esc(q)}" data-k="${k}" title="Remove">${icon('x')}</button></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="hire" data-path="${esc(q)}">${icon('plus')}<span>Add a condition</span></button>
            ${courses.length ? `<div class="mu-field"><span>Courses it asks for (none picked: the job's)</span>${pairChips(courses, `${q}.courses`, true)}</div>` : ''}
            ${bounded('Months before the first shift (0–12; empty: the job\'s)', `${q}.startAfter`, 0, 12, 0.5)}
            <span class="mu-cw-sub">The work (empty: as the job)</span>
            ${inherit('Works at', `${q}.place`, [['', '(no place: off-screen)'], ...placeOpts(w)], `As the job (${placeName})`)}
            <div class="mu-row2">${num('Shift length (hours)', `${q}.shift`, 1)}${num('Energy per shift', `${q}.cost.energy`)}</div>
            <div class="mu-row2">${num('Opens at (hour)', `${q}.hours.0`, 0)}${num('Closes at (hour)', `${q}.hours.1`, 0)}</div>
            <div class="mu-row2">${num('Days a week', `${q}.schedule.days`, 0)}${num('Career length (1: about a game year)', `${q}.length`, 0.1, 0.1)}</div>
            <div class="mu-row2">${num('Shift from (hour)', `${q}.schedule.from`, 0)}${num('Shift to (hour)', `${q}.schedule.to`, 0)}</div>
            <div class="mu-row2">${num('Extra pay at night (0.25: +25%)', `${q}.nightPay`, 0, 0.05)}${bounded('Pace (its ranks take this many times as long: 0.1–4)', `${q}.pace`, 0.1, 4, 0.1)}</div>
            <div class="mu-row2">${sel('Worked off-screen', `${q}.offScreen`, [['', `As the job (${yes(o.offScreen, false)})`], ['true', 'Yes'], ['false', 'No']], 'tri')}${sel('The boss asks for overtime', `${q}.overtime`, [['', `As the job (${yes(o.overtime, false)})`], ['true', 'Yes'], ['false', 'No']], 'tri')}</div>
            <span class="mu-cw-sub">Ranks and pay per hour</span>
            <label class="mu-check"><input type="checkbox" data-input="cw-track-ranks" data-path="${esc(q)}" data-job="${esc(p)}" ${t.ranks ? 'checked' : ''}><span>Ranks of its own<small>${t.ranks ? 'Off: the job\'s ranks, paths and promotions again.' : 'Starts from a copy of the job\'s ranks, paths and promotions.'}</small></span></label>
            ${t.ranks ? `${rankRows(w, q, t, t.courses ?? o.courses)}${branchEditor(w, t as any, q)}` : ''}
            <span class="mu-cw-sub">What it likes, asks and trains</span>
            <div class="mu-field"><span>Traits that help (none picked: the job's)</span>${chips(traitOptions(w), `${q}.likes`, true)}</div>
            ${skillOpts(w).length || t.skills || t.trains ? `${skillLevels(w, `${q}.skills`, 'Skill levels it asks to be hired (none: the job\'s)')}
                <div class="mu-field"><span>Skills it trains (none picked: the job's)</span>${pairChips(skillOpts(w), `${q}.trains`, true)}</div>` : ''}
            ${eventsEditor(w, `${q}.events`, t.events ?? [], 'On top of the job\'s (one with the id of one of the job\'s takes its place).')}
            </div>` : ''}`;
}

const ELEMENTS: [string, string][] = [['', '(none)'], ['fire', 'Fire'], ['water', 'Water'], ['lightning', 'Lightning'], ['ice', 'Ice'], ['earth', 'Earth'], ['light', 'Light'], ['dark', 'Dark']];
// Goods and their markets, crops, businesses, celestial events and extreme weather.
function tabEconomy(w: WorldDef) {
    const goods = (w.goods ?? []).map(x => [x.id, x.name] as [string, string]);
    const where = [...w.maps.map(m => [m.id, `${m.name} (map)`] as [string, string]), ...[...new Set(w.places.flatMap(p => p.tags ?? []))].map(t => [t, `${t} (tag)`] as [string, string]), ...w.places.filter(p => !p.link).map(p => [p.id, p.name] as [string, string])];
    const tags = [...new Set(w.places.flatMap(p => p.tags ?? []))].map(t => [t, t] as [string, string]);
    const seasons: [string, string][] = [['', '(any season)'], ['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']];
    const climates: [string, string][] = [['temperate', 'Temperate'], ['cold', 'Cold'], ['hot', 'Hot'], ['coastal', 'Coastal']];
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec mu-cw-wide"><h4>Goods</h4><p class="mu-muted">Bought and sold at markets (places tagged shop). Cheap where they are made, dear where they are scarce; illegal ones can be found by guards. A good with id camping_gear lets you rest at camp in a storm.</p>
        ${master('good', 'goods', x => `<b>${esc(x.icon)} ${esc(x.name)}</b><small>${x.price}${x.illegal ? ' · illegal' : ''}</small>`, i => {
            const p = `goods.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon', `${p}.icon`, '🌾')}</div>
                <div class="mu-row2">${num('Price', `${p}.price`, 1)}${sel('Type', `${p}.kind`, [['food', 'Food'], ['drink', 'Drink'], ['meat', 'Meat (ecology)'], ['fur', 'Fur (ecology)'], ['ore', 'Ore'], ['cloth', 'Cloth'], ['spice', 'Spice'], ['herb', 'Herb'], ['potion', 'Potion (dearer in tense towns)'], ['arms', 'Arms (dearer in tense towns)'], ['goods', 'Goods'], ['gear', 'Gear'], ['contraband', 'Contraband'], ['relic', 'Relic (auctions)'], ['rare', 'Rare (auctions)'], ['sentient', 'A weapon with a will (wakes in your hands)']])}</div>
                <div class="mu-field"><span>Cheap at</span>${pairChips(where, `${p}.cheap`)}</div><div class="mu-field"><span>Dear at</span>${pairChips(where, `${p}.dear`)}</div>
                ${chk('Illegal (contraband)', `${p}.illegal`)}${chk('Cures afflictions when used (poison, curses…)', `${p}.cures`)}
                <div class="mu-row2">${sel('Set into gear (a gem, a mod)', `${p}.socket.slot`, [['', '(no)'], ['weapon', 'Weapon'], ['armor', 'Armor']])}${sel('Gives', `${p}.socket.kind`, [['attack', '+ to hit'], ['damage', '+ damage'], ['armor', '+ armor']])}</div>
                ${num('By (+)', `${p}.socket.amount`, 0)}`;
        }, 'good')}</section>
        <section class="mu-cw-sec mu-cw-wide"><h4>Crafting</h4><p class="mu-muted">Recipes turn goods into goods at the right place (an id, a tag, part of a name, or home). Legendary ones make a named artifact.</p>
        ${master('recipe', 'recipes', x => `<b>${esc(x.name)}</b><small>${esc(w.goods?.find(g => g.id === x.makes)?.name ?? '')}${x.legendary ? ' · legendary' : ''}</small>`, i => {
            const p = `recipes.${i}`; const skills = (w.rpg?.skills ?? []).map(k => [k.id, k.name] as [string, string]);
            return `${txt('Name', `${p}.name`)}<div class="mu-row2">${sel('Makes', `${p}.makes`, goods)}${num('How many', `${p}.count`, 1)}</div>
                <h4>Needs</h4><div class="mu-row2">${(w.goods ?? []).map(g => num(`${esc(g.icon)} ${esc(g.name)}`, `${p}.needs.${g.id}`, 0)).join('')}</div>
                ${csv('Made at (comma separated)', `${p}.at`)}
                <div class="mu-row2">${RPG_LOCKED ? '' : sel('Check (RPG)', `${p}.skill`, [['', '(none)'], ...skills])}${num('Difficulty', `${p}.dc`, 1)}</div>
                ${chk('Risky (a bad roll hurts)', `${p}.risky`)}${chk('Legendary (you name what you make)', `${p}.legendary`)}`;
        }, 'recipe')}</section>
        ${RPG_LOCKED ? '' : `<section class="mu-cw-sec"><h4>Towers</h4><p class="mu-muted">RPG: floor after floor of fights, a boss and a checkpoint every 10.</p>
        ${master('tower', 'towers', x => `<b>${esc(x.name)}</b><small>${x.floors} floors</small>`, i => {
            const p = `towers.${i}`;
            return `${txt('Name', `${p}.name`)}${txt('What it is like', `${p}.desc`)}<div class="mu-row2">${sel('At', `${p}.place`, placeOpts(w))}${num('Floors', `${p}.floors`, 1)}</div>
                ${csv('Foes with these tags (comma separated; empty: any)', `${p}.tags`)}`;
        }, 'tower')}</section>`}
        <section class="mu-cw-sec"><h4>Sentient weapons</h4><p class="mu-muted">Found deep in towers or won at auctions (a good of the kind "a weapon with a will").</p>
        ${master('blade', 'blades', x => `<b>${esc(x.name)}</b><small>likes ${esc(x.likes)}</small>`, i => {
            const p = `blades.${i}`;
            return `${txt('Name', `${p}.name`)}${txt('Personality (told to the AI)', `${p}.personality`)}${txt('What it is', `${p}.desc`)}
                <div class="mu-row2">${sel('It likes', `${p}.likes`, [['fights', 'Fights'], ['quests', 'Quests'], ['gold', 'Gold'], ['mercy', 'Mercy']])}${num('Bonus when content', `${p}.bonus`, 0)}</div>`;
        }, 'blade')}</section>
        <section class="mu-cw-sec"><h4>Crops</h4>${master('crop', 'crops', x => `<b>${esc(x.icon)} ${esc(x.name)}</b><small>${x.days} days</small>`, i => {
            const p = `crops.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon', `${p}.icon`)}</div><div class="mu-row2">${num('Days to grow', `${p}.days`, 1)}${num('Seed price', `${p}.seed`, 0)}</div>
                <div class="mu-row2">${sel('Gives', `${p}.good`, goods)}${num('How many', `${p}.yield`, 1)}</div>`;
        }, 'crop')}</section>
        <section class="mu-cw-sec"><h4>Businesses</h4>${master('biz', 'businesses', x => `<b>${esc(x.icon)} ${esc(x.name)}</b><small>${x.cost}</small>`, i => {
            const p = `businesses.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon', `${p}.icon`)}</div><div class="mu-row2">${num('Cost to open', `${p}.cost`, 0)}${num('Profit a day (about)', `${p}.profit`, 0)}</div>
                ${num('Staff (most)', `${p}.staff`, 0)}<div class="mu-field"><span>At places tagged</span>${pairChips(tags, `${p}.tags`)}</div>`;
        }, 'biz')}</section>
        <section class="mu-cw-sec"><h4>Celestial events</h4>${master('sky', 'skies.events', x => `<b>${esc(x.name)}</b><small>every ${x.every} days</small>`, i => {
            const p = `skies.events.${i}`;
            return `${txt('Name', `${p}.name`)}${txt('What it is like', `${p}.desc`)}<div class="mu-row2">${num('Comes back every (days)', `${p}.every`, 2)}${num('Lasts (days)', `${p}.days`, 1)}</div>
                <div class="mu-row2">${sel('Effect', `${p}.effect`, [['mana', 'Mana storm: focus back every morning'], ['monsters', 'Blood moon: roads twice as dangerous, shops shut'], ['omen', 'Omen: moods drop']])}${num('Amount (omen: mood)', `${p}.amount`, -50)}</div>`;
        }, 'sky')}</section>
        <section class="mu-cw-sec"><h4>Extreme weather</h4><p class="mu-muted">Each map has a climate (Maps & places → Life in this region).</p>${master('hazard', 'skies.hazards', x => `<b>${esc(x.name)}</b><small>${esc(x.climate)}</small>`, i => {
            const p = `skies.hazards.${i}`;
            return `${txt('Name', `${p}.name`)}${txt('What it is like', `${p}.desc`)}<div class="mu-row2">${sel('Climate', `${p}.climate`, climates)}${sel('Season', `${p}.season`, seasons)}</div>
                ${num('Chance on a day (0 … 1)', `${p}.chance`, 0, 0.01)}<h4>Needs drop faster (×)</h4><div class="mu-row2">${w.statuses.map(st => num(esc(st.name), `${p}.drain.${st.id}`, 0, 0.1)).join('')}</div>
                ${chk('No rest at camp without camping gear', `${p}.blocksCamp`)}${chk('Shuts the shops', `${p}.closes`)}`;
        }, 'hazard')}</section>
    </div>`;
}

// The realm (government, leadership, power, taxes, gods) and its factions.
function tabRealm(w: WorldDef) {
    const places = w.places.filter(p => !p.link).map(p => [p.id, p.name] as [string, string]);
    const maps = w.maps.map(m => [m.id, m.name] as [string, string]);
    const facs = (w.factions ?? []).map(f => [f.id, f.name] as [string, string]);
    const jobs = w.occupations.map(o => [o.id, o.name] as [string, string]);
    const ex = w.cast.examples.map(e => [e.name, e.name] as [string, string]);
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec mu-cw-wide"><h4>The realm</h4>
            ${txt('The country (or kingdom) its cities belong to', 'realm.name', 'Costa Serena')}
            <div class="mu-row2">${sel('Government', 'realm.government', GOVERNMENTS.map(([id, n]) => [id, n] as [string, string]))}${txt('Leadership', 'realm.leadership', 'A single emperor, regional kings, elected leaders…')}</div>
            <div class="mu-row2">${sel('Power affinity', 'realm.power', POWERS.map(([id, n, d]) => [id, `${n}: ${d}`] as [string, string]))}${num('Tax rate (0.1 = 10%; empty: by government)', 'realm.tax', 0, 0.01)}</div></section>
        <section class="mu-cw-sec"><h4>Pantheon</h4><p class="mu-muted">Optional. With no gods, altars are monuments, faith classes use their secular name and faith attributes are hidden.</p>
        ${master('god', 'realm.pantheon', x => `<b>${esc(x.symbol ?? '')} ${esc(x.name)}</b><small>${esc(x.domain)}</small>`, i => {
            const p = `realm.pantheon.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Symbol', `${p}.symbol`, '☀️')}</div>${txt('Domain', `${p}.domain`, 'war, the sun, the sea…')}
                ${sel('Played by (a character of the world)', `${p}.card`, [['', '(nobody: a distant god)'], ...ex])}`;
        }, 'god', 'No gods: the realm is secular.')}</section>
        <section class="mu-cw-sec mu-cw-wide"><h4>Factions</h4>${master('faction', 'factions', f => `<b>${esc(f.name)}</b><small>${esc(f.kind)}</small>`, i => {
            const p = `factions.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Type', `${p}.kind`, 'guild, order, house, gang, kingdom…')}</div>${area('What it is (told to the AI)', `${p}.desc`, 2)}
                <div class="mu-row2">${sel('Headquarters', `${p}.hq`, [['', '(none)'], ...places])}${sel('Region', `${p}.region`, [['', '(none)'], ...maps])}</div>
                ${csv('Ranks, lowest to highest (the last one leads it)', `${p}.ranks`)}
                <div class="mu-row2">${num('Weekly dues', `${p}.dues`, 0)}${num('Duties a week', `${p}.quota`, 0)}</div>
                <div class="mu-row2">${num('Standing needed to join', `${p}.joinRep`, -100)}${sel('Beats (gains ground on)', `${p}.beats`, [['', '(nobody)'], ...facs])}</div>
                <div class="mu-field"><span>Rivals</span>${pairChips(facs, `${p}.rivals`)}</div><div class="mu-field"><span>Allies</span>${pairChips(facs, `${p}.allies`)}</div>
                <div class="mu-field"><span>Its members (people with these jobs)</span>${pairChips(jobs, `${p}.jobs`)}</div>
                ${chk('Secret (only shown once you have dealings with it)', `${p}.secret`)}`;
        }, 'faction')}</section>
    </div>`;
}

const DAYS: [string, string][] = [['0', 'Monday'], ['1', 'Tuesday'], ['2', 'Wednesday'], ['3', 'Thursday'], ['4', 'Friday'], ['5', 'Saturday'], ['6', 'Sunday']];
// Habits that become traits, festivals of the calendar, pets and familiars.
function tabCustoms(w: WorldDef) {
    const acts = w.actions.map(a => [a.id, a.name] as [string, string]);
    const tags = [...new Set(w.places.flatMap(p => p.tags ?? []))].map(t => [t, t] as [string, string]);
    const seasons: [string, string][] = [['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']];
    const places = w.places.filter(p => !p.link).map(p => [p.id, p.name] as [string, string]);
    const skills = (w.rpg?.skills ?? []).map(k => [k.id, k.name] as [string, string]);
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec mu-cw-wide"><h4>Habits that become traits</h4><p class="mu-muted">Do something often enough in a few days and it becomes a trait (jobs like it, the AI knows it); stop for long and it fades.</p>
        ${master('habit', 'habits', h => `<b>${esc(h.trait)}</b><small>${h.count}× in ${h.days} days</small>`, i => {
            const p = `habits.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Trait it gives', `${p}.trait`, 'Early riser')}</div>${txt('How to get it', `${p}.desc`)}
                <div class="mu-field"><span>Actions that count</span>${pairChips(acts, `${p}.actions`)}</div>
                <div class="mu-field"><span>Or any action at places tagged</span>${pairChips(tags, `${p}.tags`)}</div>
                <div class="mu-row2">${num('Only between (hour)', `${p}.hours.0`, 0)}${num('and (hour)', `${p}.hours.1`, 0)}</div>
                <div class="mu-row2">${num('Times', `${p}.count`, 1)}${num('In how many days', `${p}.days`, 1)}</div>
                ${num('Fades after days without it (empty: twice the days above)', `${p}.lose`, 1)}
                ${skillOpts(w).length ? sel('A skill it trains a little faster while you have it', `${p}.learn`, [['', '(none)'], ...skillOpts(w)], 'opt') : ''}
                ${flag('Only with adult content on', `${p}.adult`, "Otherwise it isn't gained, named, counted or felt.", true)}
                <h4>Every morning while you have it</h4><div class="mu-row2">${w.statuses.map(st => num(esc(st.name), `${p}.daily.${st.id}`, -50)).join('')}</div>`;
        }, 'habit')}</section>
        <section class="mu-cw-sec"><h4>Festivals</h4>${master('festival', 'festivals', f => `<b>${esc(f.name)}</b><small>${esc(f.season)} ${f.day}</small>`, i => {
            const p = `festivals.${i}`;
            return `${txt('Name', `${p}.name`)}${txt('What it is like (told to the AI)', `${p}.desc`)}
                <div class="mu-row2">${sel('Season', `${p}.season`, seasons)}${num('Day of the season', `${p}.day`, 1)}</div>
                <div class="mu-row2">${num('Lasts (days)', `${p}.days`, 1)}${sel('People gather at', `${p}.place`, [['', '(nowhere in particular)'], ...places])}</div>
                <div class="mu-row2">${num('Prices ×', `${p}.prices`, 0, 0.05)}${num('Mood when you celebrate', `${p}.mood`, 0)}</div>`;
        }, 'festival')}</section>
        <section class="mu-cw-sec"><h4>City events</h4><p class="mu-muted">Shows, matches, fairs: on a weekday, every few weeks, at a place. They are in the calendar and you go if you want.</p>
        ${master('cevent', 'cityEvents', e => `<b>${esc(e.icon ?? '')} ${esc(e.name)}</b><small>${esc(DAYS[e.weekday]?.[1] ?? '')} ${e.from}h</small>`, i => {
            const p = `cityEvents.${i}`;
            const hob: [string, string][] = [['', '(no stage)'], ...(w.hobbies ?? []).map(h => [h.id, h.name] as [string, string])];
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon', `${p}.icon`, '🎉')}</div>${txt('What it is like (told to the AI)', `${p}.desc`)}
                <div class="mu-row2">${sel('Place', `${p}.place`, places)}${sel('Weekday', `${p}.weekday`, DAYS, 'num')}</div>
                <div class="mu-row2">${num('Every (weeks)', `${p}.every`, 1)}${num('Starting on week (0 = the first)', `${p}.week`, 0)}</div>
                <div class="mu-row2">${num('Starts at (hour)', `${p}.from`, 0)}${num('Lasts (hours)', `${p}.hours`, 1)}</div>
                <div class="mu-row2">${num('Ticket (0: free)', `${p}.price`, 0)}${num('Mood when you go', `${p}.mood`, 0)}</div>
                <div class="mu-row2">${num('You stay (minutes)', `${p}.minutes`, 10)}${txt('Button', `${p}.action`, 'Watch the show')}</div>
                <div class="mu-row2">${num('Crowd (of 100 people with free time)', `${p}.crowd`, 0)}${chk('Outdoors (called off when it rains)', `${p}.outdoor`)}</div>
                <h4>Perform there (a hobby)</h4>
                <div class="mu-row2">${sel('Hobby', `${p}.stage.hobby`, hob)}${num('Level needed', `${p}.stage.level`, 0)}</div>
                <div class="mu-row2">${txt('Button', `${p}.stage.label`, 'Play at the open mic')}${num('Pay', `${p}.stage.pay`, 0)}</div>`;
        }, 'cevent')}</section>
        <section class="mu-cw-sec"><h4>Hobbies</h4><p class="mu-muted">Practice levels them up (to 10): +1 on their rolls every 2 levels, more money each level, and jobs can ask for a level.</p>
        ${master('hobby', 'hobbies', h => `<b>${esc(h.icon ?? '')} ${esc(h.name)}</b><small>${(h.actions ?? []).length} actions</small>`, i => {
            const p = `hobbies.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon', `${p}.icon`, '🎸')}</div>${txt('Description', `${p}.desc`)}
                <div class="mu-field"><span>Actions that train it</span>${pairChips(acts, `${p}.actions`)}</div>
                ${num('Extra pay per level (%)', `${p}.pay`, 0)}`;
        }, 'hobby')}</section>
        <section class="mu-cw-sec mu-cw-wide"><h4>Schools and academies</h4><p class="mu-muted">A ladder of ranks (students first, the head last), tuition, lessons, exams and clubs. Its staff (the people who work at the place) are its faculty.</p>
        ${master('inst', 'institutions', x => `<b>${esc(x.name)}</b><small>${esc(w.places.find(p => p.id === x.place)?.name ?? '')}</small>`, i => {
            const p = `institutions.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${sel('Place', `${p}.place`, places)}</div>${txt('What it is like', `${p}.desc`)}
                ${csv('Ranks, students first, the head last', `${p}.ranks`)}
                <div class="mu-row2">${num('Tuition a week', `${p}.tuition`, 0)}${num('An exam every (days)', `${p}.examEvery`, 1)}</div>
                <div class="mu-row2">${RPG_LOCKED ? '' : sel('Skill it teaches (RPG)', `${p}.skill`, [['', '(none)'], ...skills])}${txt('Trait it teaches (Life-Sim)', `${p}.trait`, 'Smart')}</div>
                ${csv('Clubs (comma separated)', `${p}.clubs`)}`;
        }, 'inst')}</section>
        <section class="mu-cw-sec"><h4>Animals (pets and familiars)</h4>${master('pet', 'pets', a => `<b>${esc(a.icon)} ${esc(a.name)}</b><small>${a.price}${a.familiar ? ' · familiar' : ''}</small>`, i => {
            const p = `pets.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon', `${p}.icon`, '🐕')}</div>${txt('Description', `${p}.desc`)}
                <div class="mu-row2">${num('Price', `${p}.price`, 0)}${num('Mood each morning when happy', `${p}.mood`, 0)}</div>
                ${csv('Sold at places whose id, name or tag has (comma separated; empty: any shop)', `${p}.where`)}
                ${chk('Follows you everywhere (else waits at home)', `${p}.follows`)}${RPG_LOCKED ? '' : chk('Familiar (RPG only): helps a skill', `${p}.familiar`)}
                <div class="mu-row2">${sel('Skill it helps', `${p}.skill`, [['', '(none)'], ...skills])}${num('Bonus', `${p}.bonus`, 0)}</div>
                ${chk('A mount (you ride it)', `${p}.mount`)}<div class="mu-row2">${num('Trips take (× the time)', `${p}.speed`, 0.1, 0.05)}${num('Carries (more goods)', `${p}.carry`, 0)}</div>`;
        }, 'pet')}</section>
    </div>`;
}

// The world's RPG: attributes, skills, classes and subclasses, schools of magic, spells, titles.
function tabRpg(w: WorldDef) {
    const r = w.rpg;
    if (!r) return `<div class="mu-cw-grid"><section class="mu-cw-sec mu-cw-wide"><h4>RPG</h4>
        <p class="mu-muted">The RPG mode needs the world's RPG: attributes, skills, classes (with a subclass at level 3 or 5), magic and titles. Start from the medieval one and change what you like, or from nothing.</p>
        <div class="mu-row"><button class="mu-primary" data-act="cw-rpg-preset" data-v="medieval">${icon('sparkles')}<span>Use the medieval RPG</span></button><button class="mu-primary" data-act="cw-rpg-preset" data-v="modern">${icon('sparkles')}<span>Use the martial arts RPG (realistic)</span></button><button class="mu-primary" data-act="cw-rpg-preset" data-v="powers">${icon('sparkles')}<span>Use the superpowers RPG (fantasy)</span></button><button class="mu-ghost" data-act="cw-rpg-empty">${icon('plus')}<span>Start an empty one</span></button></div></section></div>`;
    const attrs = r.attributes.map(a => [a.id, `${a.short} · ${a.name}`] as [string, string]);
    const skills = r.skills.map(k => [k.id, k.name] as [string, string]);
    const schools = r.schools.map(s => [s.id, s.name] as [string, string]);
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec mu-cw-wide"><h4>Numbers</h4>
            <div class="mu-row2">${sel('Hit points grow with', 'rpg.hpAttr', attrs)}${txt(`The resource for ${esc(lexDefault(w, 'spellsNoun'))} is called`, 'rpg.focusName', 'Focus')}</div>
            <div class="mu-row2">${csv('Experience for level 2, 3, 4… (comma separated)', 'rpg.xp')}${num('Hours on the road before making camp', 'rpg.campEvery', 1)}</div></section>
        <section class="mu-cw-sec"><h4>Attributes</h4>${master('rattr', 'rpg.attributes', a => `<b>${esc(a.short)}</b><small>${esc(a.name)}</small>`, i => `<div class="mu-row2">${txt('Name', `rpg.attributes.${i}.name`)}${txt('Short', `rpg.attributes.${i}.short`)}</div>${txt('What it is for', `rpg.attributes.${i}.desc`)}${chk('Faith (hidden while the realm has no gods)', `rpg.attributes.${i}.faith`)}`, 'rattr')}</section>
        <section class="mu-cw-sec"><h4>Skills</h4>${master('rskill', 'rpg.skills', k => `<b>${esc(k.name)}</b><small>${esc(r.attributes.find(a => a.id === k.attr)?.short ?? '')}</small>`, i => `${txt('Name', `rpg.skills.${i}.name`)}${sel('Uses', `rpg.skills.${i}.attr`, attrs)}`, 'rskill')}</section>
        <section class="mu-cw-sec mu-cw-wide"><h4>Classes</h4>${master('rclass', 'rpg.classes', c => `<b>${esc(c.name)}</b><small>d${c.hit}${c.schools?.length ? ' · spells' : ''}</small>`, i => {
            const p = `rpg.classes.${i}`; const c = r.classes[i];
            return `${txt('Name', `${p}.name`)}${area('What it is', `${p}.desc`, 2)}
                <div class="mu-row2">${chk('Faith class', `${p}.faith`)}${txt('Its name with no gods in the realm', `${p}.secular`, 'Healer')}</div>
                <div class="mu-row2">${num('Hit points at level 1', `${p}.hit`, 1)}${sel('Key attribute', `${p}.key`, attrs)}</div>
                <div class="mu-field"><span>Skills to choose from (2 at the start)</span>${pairChips(skills, `${p}.skills`)}</div>
                <div class="mu-field"><span>${esc(lexDefault(w, 'schoolsWord'))} (none: no ${esc(lexDefault(w, 'spellsNoun'))})</span>${pairChips(schools, `${p}.schools`)}</div>
                ${sel('Subclass at level', `${p}.subAt`, [['3', '3'], ['5', '5']], 'num')}
                <h4>In a fight</h4>
                <div class="mu-row2">${num('Armor (added to 10; 5 or more: heavy, covers the back row)', `${p}.armor`, 0)}${txt('Weapon', `${p}.weapon.name`, 'longsword')}</div>
                <div class="mu-row2">${num('Damage dice', `${p}.weapon.dice`, 1)}${num('Sides of each die', `${p}.weapon.sides`, 2)}</div>
                <div class="mu-row2">${sel('Weapon uses', `${p}.weapon.attr`, attrs)}${chk('Ranged (bow, spell): fights from the back row', `${p}.weapon.ranged`)}</div>
                ${sel('Weapon element', `${p}.weapon.element`, ELEMENTS)}
                <div class="mu-row2">${txt('Ability (once a fight)', `${p}.ability.name`, 'Second wind')}${sel('What it does', `${p}.ability.kind`, [['heal', 'Heals (% of hit points)'], ['guard', 'Guards the back row'], ['shield', 'More armor until the next turn'], ['hide', 'Hides: next attack with advantage and extra damage'], ['mark', 'Marks a foe: more damage against it'], ['inspire', 'Inspires allies: bonus to hit (and +2 initiative for the party)'], ['rage', 'Rage: more damage, less armor']])}</div>
                <div class="mu-row2">${num('Amount', `${p}.ability.amount`, 0)}${txt('Ability description', `${p}.ability.desc`)}</div>
                <h4>Subclasses</h4>${c.subclasses.map((s, k) => `<div class="mu-cw-path"><div class="mu-row2">${txt('Name', `${p}.subclasses.${k}.name`)}${txt('What it is', `${p}.subclasses.${k}.desc`)}</div>
                    <div class="mu-row2">${sel('Trained in', `${p}.subclasses.${k}.skill`, [['', '(nothing more)'], ...skills])}${sel('Adds the school', `${p}.subclasses.${k}.school`, [['', '(none)'], ...schools])}</div>
                    <button class="mu-ghost mu-danger-text" data-act="cw-del" data-path="${p}.subclasses.${k}">${icon('x')}<span>Remove</span></button></div>`).join('')}
                <button class="mu-ghost" data-act="cw-add" data-what="rsub" data-path="${p}.subclasses">${icon('plus')}<span>Add a subclass</span></button>`;
        }, 'rclass')}</section>
        <section class="mu-cw-sec"><h4>${esc(lexDefault(w, 'schoolsWord'))}</h4>${master('rschool', 'rpg.schools', s => `<b>${esc(s.name)}</b>`, i => `${txt('Name', `rpg.schools.${i}.name`)}${txt('What it is', `rpg.schools.${i}.desc`)}`, 'rschool')}</section>
        <section class="mu-cw-sec"><h4>${esc(lexDefault(w, 'spellsNoun').replace(/^./, c => c.toUpperCase()))}</h4>${master('rspell', 'rpg.spells', s => `<b>${esc(s.name)}</b><small>${esc(r.schools.find(x => x.id === s.school)?.name ?? '')} · ${s.level}</small>`, i => {
            const p = `rpg.spells.${i}`; const sp = r.spells[i];
            return `${txt('Name', `${p}.name`)}${area('What it does (told to the AI)', `${p}.desc`, 2)}
                <div class="mu-row2">${sel('School', `${p}.school`, schools)}${num('Level (1 at level 1-2, 2 at 3-4…)', `${p}.level`, 1)}</div>
                ${num(`Cost (${esc(r.focusName ?? 'focus')})`, `${p}.cost`, 0)}
                ${sel('Effect', `${p}.effect.kind`, [['heal', 'Heals (% of hit points)'], ['advantage', 'Advantage on the next check of…'], ['bonus', 'A bonus on the next check'], ['calm', 'Calms the town (tension down)'], ['rumor', 'Reveals a rumor'], ['weather', 'Changes the weather'], ['cleanse', 'Cures afflictions'], ['scene', 'Only told to the AI (or a fight move)']])}
                ${['heal', 'bonus', 'calm'].includes(sp.effect.kind) ? num('Amount', `${p}.effect.amount`, 0) : ''}
                ${['advantage', 'bonus'].includes(sp.effect.kind) ? `<div class="mu-field"><span>Skills (none: any, for a bonus)</span>${pairChips(skills, `${p}.effect.skills`)}</div>` : ''}
                ${sp.effect.kind === 'weather' ? sel('Weather', `${p}.effect.to`, [['rain', 'Rain'], ['clear', 'Clear skies']]) : ''}
                <div class="mu-row2">${sel('In a fight', `${p}.combat`, [['', '(by its school)'], ['damage', 'A blow (damage)'], ['shield', 'A guard (+3 armor)']])}${sel('Element', `${p}.element`, ELEMENTS)}</div>`;
        }, 'rspell')}</section>
        <section class="mu-cw-sec"><h4>Titles</h4>${master('rtitle', 'rpg.titles', t => `<b>${esc(t.name)}</b><small>${esc(t.desc)}</small>`, i => {
            const p = `rpg.titles.${i}`;
            return `${txt('Title', `${p}.name`, 'the Brave')}${txt('How to earn it', `${p}.desc`)}
                <div class="mu-row2">${num('At level', `${p}.when.level`, 1)}${num('With renown', `${p}.when.renown`, 0)}</div>
                <div class="mu-row2">${sel('Or after', `${p}.when.count`, [['', '(nothing)'], ['socialWins', 'social checks won'], ['quests', 'quests finished'], ['camps', 'nights at camp'], ['casts', 'spells cast']])}${num('How many', `${p}.when.n`, 1)}</div>`;
        }, 'rtitle')}</section>
        <section class="mu-cw-sec mu-cw-wide"><h4>Bestiary (foes in fights)</h4>${master('rfoe', 'rpg.bestiary', f => `<b>${esc(f.icon ?? '')} ${esc(f.name)}</b><small>level ${f.level} · ${f.hp} HP${f.ranged ? ' · ranged' : ''}</small>`, i => {
            const p = `rpg.bestiary.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon (an emoji, shown in fights)', `${p}.icon`, '🐺')}</div>${num('Level (the party takes on foes up to its total level)', `${p}.level`, 1)}${txt('What it is (told to the AI)', `${p}.desc`)}
                <div class="mu-row2">${num('Hit points', `${p}.hp`, 1)}${num('Armor class', `${p}.ac`, 1)}</div>
                <div class="mu-row2">${num('To hit (+)', `${p}.atk`, 0)}${num('Damage bonus', `${p}.bonus`, 0)}</div>
                <div class="mu-row2">${num('Damage dice', `${p}.dice`, 1)}${num('Sides of each die', `${p}.sides`, 2)}</div>
                <div class="mu-row2">${sel('Row', `${p}.row`, [['front', 'Front'], ['back', 'Back']])}${chk('Ranged (reaches the back row)', `${p}.ranged`)}</div>
                ${csv('Where it is met (road, wild, town, tower; boss for bosses… comma separated)', `${p}.tags`)}
                <div class="mu-row2">${sel('Element', `${p}.element`, ELEMENTS)}${sel('Its blows can cause', `${p}.inflict.kind`, [['', '(nothing)'], ['poison', 'Poison'], ['burn', 'Burn'], ['blind', 'Blindness'], ['silence', 'Silence'], ['curse', 'Curse'], ['slow', 'Slow']])}</div>
                <div class="mu-row2">${num('Chance (0 … 1)', `${p}.inflict.chance`, 0, 0.05)}${num('For (turns)', `${p}.inflict.turns`, 1)}</div>`;
        }, 'rfoe')}</section>
        <section class="mu-cw-sec mu-cw-wide"><h4>Talent trees</h4><p class="mu-muted">A point per level after the first. A tier opens every 3 levels (tier 2 at level 4, tier 3 at 7…). Players can respec any time.</p>
        ${master('rtal', 'rpg.talents', t => `<b>${esc(t.name)}</b><small>tier ${t.tier}${t.cls ? ` · ${esc(r.classes.find(c => c.id === t.cls)?.name ?? '')}` : ''}</small>`, i => {
            const p = `rpg.talents.${i}`; const t = r.talents![i];
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('What it does', `${p}.desc`)}</div>
                <div class="mu-row2">${sel('Class', `${p}.cls`, [['', '(any class)'], ...r.classes.map(c => [c.id, c.name] as [string, string])])}${num('Tier', `${p}.tier`, 1)}</div>
                <div class="mu-field"><span>Needs first</span>${pairChips((r.talents ?? []).filter(x => x.id !== t.id).map(x => [x.id, x.name] as [string, string]), `${p}.requires`)}</div>
                <div class="mu-row2">${sel('Effect', `${p}.effect.kind`, [['hp', 'Hit points'], ['focus', 'Focus'], ['skill', 'A skill'], ['attack', 'To hit'], ['armor', 'Armor'], ['damage', 'Damage'], ['initiative', 'Initiative'], ['camp', 'Nights at camp']])}${num('Amount', `${p}.effect.amount`, 0)}</div>
                ${t.effect.kind === 'skill' ? sel('Skill', `${p}.effect.skill`, skills) : ''}`;
        }, 'rtal')}</section>
        <section class="mu-cw-sec"><h4>Sellswords</h4>${csv('Names (comma separated)', 'rpg.mercNames')}${num('Daily wage per level', 'rpg.mercWage', 0)}
            <small class="mu-muted">Hired at a tavern, an inn or barracks. Not people of the world (no card): paid daily, they leave unpaid and die if they fall.</small></section>
    </div>`;
}

// Career branches: at a rank (3, 6, 9…) the player chooses a path, and its ranks come next.
function branchEditor(w: WorldDef, o: WorldDef['occupations'][number], p: string) {
    const list = o.branches ?? [];
    const first = [...list].sort((a, b) => a.at - b.at)[0];
    const earlier = (at: number) => list.filter(b => b.at < at).flatMap(b => b.options.map(x => [x.id, x.name] as [string, string]));
    return `<h4>Career paths</h4>
        <p class="mu-muted">At some ranks (3, 6, 9 in the built-in careers) the player chooses a path; its ranks come next.${first && o.ranks.length > first.at ? ` Ranks after rank ${first.at} above are not used: the paths replace them.` : ''}</p>
        ${list.map((b, bi) => `<section class="mu-cw-branch"><div class="mu-row mu-cw-inline">${num('Choose at rank', `${p}.branches.${bi}.at`, 1)}<span class="mu-cw-spacer"></span>
            <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${p}.branches.${bi}" title="Remove these paths">${icon('trash')}</button></div>
            ${b.options.map((x, k) => { const q = `${p}.branches.${bi}.options.${k}`; return `<div class="mu-cw-path">
                <div class="mu-row2">${txt('Path', `${q}.name`)}${txt('What it is', `${q}.desc`)}</div>
                ${x.ranks.map((_r, ri) => `<div class="mu-row mu-cw-inline">${txt('Rank', `${q}.ranks.${ri}.name`)}${num(`Pay (${esc(w.currency.symbol)}/h)`, `${q}.ranks.${ri}.pay`)}${num('Time to reach it (relative)', `${q}.promote.${ri}`, 1)}
                    ${bounded('Days a week (empty: the schedule\'s)', `${q}.ranks.${ri}.days`, 1, 7)}
                    <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${q}.ranks.${ri}" title="Remove">${icon('x')}</button></div>`).join('')}
                <button class="mu-ghost" data-act="cw-add" data-what="rank" data-path="${q}.ranks">${icon('plus')}<span>Add a rank</span></button>
                <div class="mu-field"><span>Traits that help on this path</span>${chips(traitOptions(w), `${q}.likes`)}</div>
                ${earlier(b.at).length ? `<div class="mu-field"><span>Only after (empty: after any)</span>${pairChips(earlier(b.at), `${q}.after`)}</div>` : ''}
                <button class="mu-ghost mu-danger-text" data-act="cw-del" data-path="${esc(q)}">${icon('x')}<span>Remove this path</span></button></div>`; }).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="boption" data-path="${p}.branches.${bi}.options">${icon('plus')}<span>Add a path</span></button></section>`).join('')}
        <button class="mu-ghost" data-act="cw-add" data-what="branch" data-path="${p}.branches">${icon('plus')}<span>Add a choice of paths</span></button>`;
}

// What a bill or a broken thing can stop at home: the world's home actions.
const homeActionOpts = (w: WorldDef): [string, string][] => w.actions.filter(a => a.home).map(a => [a.id, a.label || a.name] as [string, string]);
const pairChips = (opts: [string, string][], p: string, drop = false) => { const on: string[] = getPath(p) ?? []; return `<div class="mu-chips">${opts.map(([v, l]) => `<button class="mu-chip ${on.includes(v) ? 'is-on' : ''}" data-act="cw-chip" data-path="${esc(p)}" data-v="${esc(v)}" ${drop ? 'data-drop="1"' : ''}>${esc(l)}</button>`).join('')}</div>`; };
// A world made before free expenses gets its water and power written out, so they can be edited like any other.
function ensureExpenses(w: WorldDef) {
    if (w.homes.expenses) return;
    w.homes.expenses = DEFAULT_EXPENSES.map(e => ({ ...e, blocks: [...(e.blocks ?? [])], name: lex(w, `bill_${e.id}`) }));
    for (const k of Object.values(w.homes.kinds)) { const b = k.bills as Record<string, number> | undefined; if (b && b.firewood !== undefined && b.power === undefined) { b.power = b.firewood; delete b.firewood; } }
}

// What a course's length means in days, as the game counts it (sim/courses.ts, spanOf): a share of a year of four
// seasons, 14 days each unless a game changes it (World → Rules), shortened by the work rules' career speed. Shown for
// Realistic and for this world's default work rules.
const SEASON_DAYS = 14;
const spanAt = (length: number, speed: number) => Math.max(1, Math.round((4 * SEASON_DAYS * length) / Math.max(0.05, speed)));
const defaultRules = (w: WorldDef) => WORK_PRESETS.find(x => x.id === worldPreset(w)) ?? WORK_PRESETS[0];
const courseDays = (w: WorldDef, c: any) => (Number(c?.length) > 0 ? spanAt(Number(c.length), defaultRules(w).rules.speed) : Math.max(1, Math.round(Number(c?.days) || 1)));
// Paid each season: when it says so, else when it lasts longer than a season (sim/courses.ts, perSeason).
const seasonal = (w: WorldDef, c: any) => (typeof c?.perSeason === 'boolean' ? c.perSeason : courseDays(w, c) > SEASON_DAYS);
function lengthNote(w: WorldDef, c: any): string {
    if (!c) return '';
    const len = Number(c.length);
    if (!(len > 0)) return esc(`No length: it lasts ${courseDays(w, c)} days. A length (a share of a year) follows the season length and the work rules, as careers do.`);
    const def = defaultRules(w); const real = spanAt(len, 1);
    const days = def.id === 'realistic' ? `About ${real} days with ${SEASON_DAYS}-day seasons (Realistic work rules, this world's default)`
        : `About ${real} days with ${SEASON_DAYS}-day seasons and Realistic work rules; ${spanAt(len, def.rules.speed)} with ${def.name} (this world's default)`;
    return esc(`${days}. Its classes: the days its schedule meets in that time; without a schedule, five a week (about ${Math.round(courseDays(w, c) * 5 / 7)}).`);
}
// Lines that say what a number means, drawn again as it is typed without drawing the form again.
const NOTES: Record<string, (i: number) => string> = { clen: i => lengthNote(W(), ((W().catalogs as any).courses ?? [])[i]) };
function refreshNotes() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll<HTMLElement>('.mu-creator-ed [data-cw-note]').forEach(el => { const f = NOTES[el.dataset.cwNote ?? '']; if (f) el.innerHTML = f(Number(el.dataset.i)); });
}
const AID_KINDS: [string, string][] = [['employer', 'An employer (sponsorship)'], ['merit', 'A school (merit scholarship)'], ['public', 'The government (public benefit)']];

// Courses: what each teaches (skill levels in a world with skills, traits in one without), how long it takes, where
// and when its classes are, what it asks first, what it costs and who may help pay. A course is also a credential:
// jobs that require it are linked here. Traits drive the bonuses of worlds without skills, so those links are written
// where the engine reads them: a job it favors (the course's traits in occupation.likes: faster promotions), a roll it
// improves (its traits in the action's roll).
function tabCourses(w: WorldDef) {
    const list = ((w.catalogs as any).courses ?? []) as any[];
    const rolls = w.actions.filter(a => a.roll);
    const skilled = !!skillOpts(w).length;
    return `<section class="mu-cw-sec"><h4>Courses</h4>
        <p class="mu-muted">${skilled ? 'Players enroll, pay and go to its classes (at its place, or at home or where a place is tagged "study"). Each class teaches a little of its skills, and finishing it gives at least their levels. A finished course is a credential jobs and ranks can ask for.'
            : 'Players pay once, then study a little each day (at home or where a place is tagged "study"). When they finish, they learn the course\'s traits for good.'}</p>
        ${master('courses', 'catalogs.courses', c => `<b>${esc(c.icon ?? '')} ${esc(c.name)}</b><small>${esc(courseDays(w, c))} days · ${esc(money(w, c.cost ?? 0))}${seasonal(w, c) ? ' a season' : ''}${c.retired ? ' · retired' : ''}${c.adult ? ' · adult' : ''}</small>`, i => {
            const p = `catalogs.courses.${i}`; const c = list[i]; const g: string[] = c.grants ?? [];
            const has = (l: string[] | undefined) => g.length > 0 && g.every(t => (l ?? []).includes(t));
            const rel = (kind: string, id: string, on: boolean, label: string) => `<button class="mu-chip ${on ? 'is-on' : ''}" data-act="cw-crel" data-kind="${esc(kind)}" data-id="${esc(id)}" data-i="${esc(i)}" ${kind !== 'req' && !g.length ? 'aria-disabled="true" title="Give the course a trait to teach first"' : ''}>${esc(label)}</button>`;
            const taught = Object.entries((c.skills ?? {}) as Record<string, number>);
            const free = skillOpts(w).filter(([id]) => !taught.some(([s]) => s === id));
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon (an emoji)', `${p}.icon`, '📚')}</div>
                <div class="mu-row2">${txt('Area', `${p}.area`, 'Health')}${num(`${seasonal(w, c) ? 'Fee each season' : 'Price'} (${esc(w.currency.symbol)})`, `${p}.cost`)}</div>
                ${area('Description', `${p}.desc`, 2)}
                ${skilled || taught.length ? `<h4>Skills it teaches</h4>
                    ${taught.map(([s]) => `<div class="mu-row mu-cw-inline"><label class="mu-field"><span>Skill</span><select data-input="cw-cskill" data-i="${esc(i)}" data-from="${esc(s)}">${[...skillOpts(w).filter(([id]) => id === s || free.some(([f]) => f === id)), ...(skillOpts(w).some(([id]) => id === s) ? [] : [[s, s] as [string, string]])].map(([id, n]) => `<option value="${esc(id)}" ${id === s ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
                        ${bounded('Level at the end (1–10)', `${p}.skills.${s}`, 1, 10)}<button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${esc(`${p}.skills.${s}`)}" title="Remove">${icon('x')}</button></div>`).join('')}
                    ${free.length ? `<button class="mu-ghost" data-act="cw-add" data-what="cskill" data-i="${esc(i)}">${icon('plus')}<span>Add a skill</span></button>` : ''}` : ''}
                ${csv(skilled ? 'Also teaches these traits (optional)' : 'Teaches these traits', `${p}.grants`, 'Separated by commas. A trait can be new; it helps wherever it is asked for.')}
                ${traitOptions(w).length ? `<small class="mu-muted">Traits of this world: ${esc(traitOptions(w).join(', '))}</small>` : ''}
                <h4>How long</h4>
                <div class="mu-row2">${num('Length (a share of a game year: 0.25 is a season)', `${p}.length`, 0, 0.05)}${num('Days (when it has no length)', `${p}.days`, 1)}</div>
                <small class="mu-muted" data-cw-note="clen" data-i="${esc(i)}">${lengthNote(w, c)}</small>
                <h4>Where and when</h4>
                ${sel('Taught at', `${p}.at`, placeOpts(w, '(anywhere you can study: home or a place tagged "study")'), 'opt')}
                ${cond('Schedule (when its classes are)', `${p}.when`, 'weekday: tue or thu; clock: 19:00-21:00', 'Empty: any five days a week, one class a day at most. The words of conditions (weekday, clock…), as in Things to do.')}
                <h4>Enrolling and paying</h4>
                ${cond('It asks first (a condition)', `${p}.needs`, 'skill: japanese 4', 'Empty: anyone can enroll. A finished course: course: its id.')}
                ${sel('The fee is paid', `${p}.perSeason`, [['', 'By its length (each season when it lasts longer than one)'], ['true', 'Every season while you take it'], ['false', 'Once, when you enroll']], 'tri')}
                ${chk('Retired', `${p}.retired`, 'No longer offered. A game taking it can finish it, and jobs still accept it. A course is never removed once games may have taken it.')}
                ${flag('Only with adult content on', `${p}.adult`, "Otherwise not offered, no aid and no boss's message; one being taken waits.", true)}
                <h4>Help paying (aid)</h4><p class="mu-muted">Only the best one a player qualifies for counts.</p>
                ${((c.aid ?? []) as any[]).map((ad, k) => { const q = `${p}.aid.${k}`; return `<div class="mu-cw-path">
                    <div class="mu-row2">${txt('Name', `${q}.name`, 'Hospital scholarship')}${sel('Who pays', `${q}.kind`, AID_KINDS)}</div>
                    <div class="mu-row2">${bounded('Share of the fee (0.5: half, 1: all)', `${q}.share`, 0, 1, 0.05)}${sel('When it pays', `${q}.pays`, [['', 'As usual (employer and merit: at enrollment; public: at the end)'], ['enroll', 'Off the fee when you enroll'], ['finish', 'Back when you finish']], 'opt')}</div>
                    ${cond('Who qualifies (a condition)', `${q}.when`, 'job: nurse; perf: 70')}
                    <div class="mu-row2">${ad.jobless ? '' : num('Only after holding a job for (seasons)', `${q}.held`, 0)}${ad.held ? '' : chk('Only while out of work', `${q}.jobless`)}</div>
                    ${chk('Stay a season after finishing', `${q}.stay`, 'Leaving that job before then pays back the share of the season left.')}
                    <button class="mu-ghost mu-danger-text" data-act="cw-del" data-path="${esc(q)}">${icon('x')}<span>Remove this aid</span></button></div>`; }).join('')}
                <button class="mu-ghost" data-act="cw-add" data-what="aid" data-path="${esc(`${p}.aid`)}">${icon('plus')}<span>Add aid</span></button>
                <h4>Required for these jobs</h4><div class="mu-chips">${w.occupations.map(o => rel('req', o.id, ((o as any).courses ?? []).includes(c.id), o.name)).join('') || '<small class="mu-muted">No jobs yet.</small>'}</div>
                ${skilled && !g.length ? '' : `<h4>Helps in these jobs (faster promotions)</h4><div class="mu-chips">${w.occupations.map(o => rel('job', o.id, has(o.likes), o.name)).join('') || '<small class="mu-muted">No jobs yet.</small>'}</div>
                <h4>Improves these skills (+2 on their roll)</h4><div class="mu-chips">${rolls.map(a => rel('act', a.id, has(a.roll?.traits), a.label || a.name)).join('') || '<small class="mu-muted">No things to do with a roll yet (Things to do → a roll).</small>'}</div>`}`;
        }, 'course', 'No courses yet.')}</section>`;
}

// The shop: things to buy once. A vehicle shortens trips, a good bed lifts the mood each morning, and an item can
// unlock things to do at home (Things to do → "Only if the player owns").
function tabShop(w: WorldDef) {
    const list = ((w.catalogs as any).shop ?? []) as any[];
    return `<section class="mu-cw-sec"><h4>Shop</h4>
        ${master('shop', 'catalogs.shop', it => `<b>${esc(it.icon ?? '')} ${esc(it.name)}</b><small>${esc(money(w, it.price ?? 0))}</small>`, i => {
            const p = `catalogs.shop.${i}`; const it = list[i];
            const unlocks = w.actions.filter(a => a.needsItem === it.id).map(a => a.label || a.name);
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon (an emoji)', `${p}.icon`, '🛏️')}</div>
                ${area('Description', `${p}.desc`, 2)}
                <div class="mu-row2">${num(`Price (${esc(w.currency.symbol)})`, `${p}.price`)}${num('Mood when you wake up at home (+)', `${p}.sleepMood`)}</div>
                <div class="mu-row2">${num('Trips take this share of the time (0.5 = half; empty = not a vehicle)', `${p}.travel`, 0, 0.05)}</div>
                <p class="mu-muted">${unlocks.length ? `Unlocks: ${esc(unlocks.join(', '))}.` : 'Unlocks nothing to do yet: in Things to do, pick this item under "Only if the player owns".'}</p>`;
        }, 'item', 'Nothing for sale.')}</section>`;
}

// The words of the game: every term with the style's word as a hint; what you write replaces it in this world.
const WORDS = { q: '' };
function tabWords(w: WorldDef) {
    const own = ((w as any).lexicon ?? {}) as Record<string, string>;
    const q = WORDS.q.trim().toLowerCase();
    const groups = lexGroups().map(g => ({ ...g, keys: g.keys.filter(k => !q || lexDefault(w, k).toLowerCase().includes(q) || String(own[k] ?? '').toLowerCase().includes(q)) })).filter(g => g.keys.length);
    const changed = Object.values(own).filter(Boolean).length;
    return `<section class="mu-cw-sec"><h4>Words of the game</h4>
        <p class="mu-muted">Every term the game shows or tells the AI, as the ${esc(styleOf(w))} style says it. Write your world's own word to replace it (a phone can be a "Den Den Mushi", a course "training"…); leave it empty to keep the style's. {0}, {1}… are filled in by the game (a name, a price…). Apps, places, jobs and needs are named in their own tabs.</p>
        <div class="mu-row2"><label class="mu-field"><span>Search</span><input data-input="cw-words-q" data-focus="cw-words-q" value="${esc(WORDS.q)}" placeholder="phone, rent, course…"></label><p class="mu-muted">${changed} term${changed === 1 ? '' : 's'} changed in this world.</p></div>
        ${groups.map(g => `<h4>${esc(g.title)}</h4><div class="mu-cw-words">${g.keys.map(k => `<label class="mu-field"><span>${esc(lexDefault(w, k))}</span><input data-input="cw" data-path="lexicon.${k}" data-focus="lexicon.${k}" value="${esc(own[k] ?? '')}" placeholder="${esc(lexDefault(w, k))}"></label>`).join('')}</div>`).join('') || '<p class="mu-muted">Nothing matches.</p>'}
    </section>`;
}

function tabHomes(w: WorldDef) {
    ensureExpenses(w);
    const kinds = Object.entries(w.homes.kinds);
    const exps = w.homes.expenses ?? [];
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec"><h4>Housing areas</h4>
            ${master('zones', 'homes.zones', z => `<b>${esc(z.name)}</b><small>${z.spots.length} homes · ${esc(money(w, z.rent))}</small>`, i => {
                const p = `homes.zones.${i}`; const z = w.homes.zones[i];
                return `${txt('Name', `${p}.name`)}${area('Description', `${p}.desc`, 2)}
                    <div class="mu-row2">${sel('Kind of home', `${p}.kind`, kinds.map(([id, k]) => [id, k.name] as [string, string]))}${num(`Rent (${esc(w.currency.symbol)})`, `${p}.rent`)}</div>
                    ${sel('On the map', `${p}.map`, w.maps.map(m => [m.id, m.name] as [string, string]))}
                    <p class="mu-muted">${z.spots.length} homes placed. They are numbered (House 1, House 2…).</p>
                    <button data-act="cw-homes-map" data-i="${esc(i)}">${icon('map')}<span>Place the homes on the map</span></button>`;
            }, 'zone', 'No housing areas yet.')}</section>
        <section class="mu-cw-sec"><h4>Kinds of home</h4>
            ${kinds.map(([id, k]) => `<div class="mu-cw-kind"><div class="mu-cw-cover is-small" style="${k.image ? `background-image:url('${safeUrl(worldFile(w, k.image))}')` : ''}"></div>
                <div>${txt('Name', `homes.kinds.${id}.name`)}${area('Description', `homes.kinds.${id}.desc`, 2)}
                ${exps.length ? `<div class="mu-row2">${exps.map(e => num(`${esc(e.name)} a week (${esc(w.currency.symbol)})`, `homes.kinds.${id}.bills.${e.id}`)).join('')}</div>` : ''}
                <details class="mu-me-times" ${Object.keys(k.images ?? {}).length ? 'open' : ''}><summary>Inside at other times of the day</summary>
                    ${TIME_SLOTS.map(per => { const b = k.images?.[per.id] ? worldFile(w, k.images[per.id]) : ''; return `<div class="mu-me-time"><div class="mu-cw-cover is-mini" style="${b ? `background-image:url('${safeUrl(b)}')` : ''}">${b ? '' : '<span>usual</span>'}</div><b>${esc(per.name)}</b>
                        <button class="mu-ghost mu-ibtn" data-act="cw-kind-img" data-id="${esc(id)}" data-period="${esc(per.id)}" title="Upload">${icon('upload')}</button>${b ? `<button class="mu-ghost mu-ibtn" data-act="cw-kind-img-clear" data-id="${esc(id)}" data-period="${esc(per.id)}" title="Use the usual one">${icon('x')}</button>` : ''}</div>`; }).join('')}</details>
                <div class="mu-row"><button class="mu-ghost" data-act="cw-kind-img" data-id="${esc(id)}">${icon('image')}<span>Inside picture (scene)</span></button>
                ${kinds.length > 1 ? `<button class="mu-ghost" data-act="cw-del" data-path="homes.kinds.${id}">${icon('trash')}</button>` : ''}</div></div></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="kind">${icon('plus')}<span>Add a kind of home</span></button></section>
        <section class="mu-cw-sec"><h4>Expenses (besides the rent)</h4>
            <p class="mu-muted">Bills every home pays each week with the rent: water, power, firewood, servants, taxes… as many as you like, or none. Each kind of home sets its own amount above. One left unpaid for a week stops the things you pick here.</p>
            ${master('expenses', 'homes.expenses', e => `<b>${esc(e.name || lexDefault(w, `bill_${e.id}`))}${e.rpg ? ' <small>(RPG)</small>' : ''}</b><small>${(e.blocks ?? []).length ? `stops ${(e.blocks ?? []).length} thing${(e.blocks ?? []).length === 1 ? '' : 's'}` : 'stops nothing'}</small>`, i => {
                const p = `homes.expenses.${i}`; const e = exps[i];
                return `${RPG_LOCKED ? '' : chk('Only in the RPG mode', `${p}.rpg`, 'Like the upkeep of arms and gear: not billed in Life-Sim.')}<div class="mu-row2">${txt('Name (empty: the Words tab\'s word)', `${p}.name`, lexDefault(w, `bill_${e.id}`))}<label class="mu-field"><span>Icon</span><select data-input="cw" data-path="${p}.icon">${ICON_NAMES().map(n => `<option ${n === (e.icon ?? 'wallet') ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
                    <h4>When it is a week unpaid, it stops</h4>${pairChips(homeActionOpts(w), `${p}.blocks`)}
                    ${area('Message when it stops (optional; {app} = where to pay)', `${p}.cut`, 2, `${e.name} was not paid for a week: it stopped until you pay it.`)}
                    ${txt('Message when it is paid again (optional)', `${p}.back`, `${e.name} is back.`)}`;
            }, 'expense', 'No expenses: homes only pay the rent.')}</section>
        <section class="mu-cw-sec"><h4>Things that break at home</h4>
            <p class="mu-muted">Now and then one of these breaks and stops some things until it is fixed (by the player, or paying someone).</p>
            ${num(`Paying someone to fix it costs (${esc(w.currency.symbol)})`, 'homes.repairCost')}
            ${master('breakables', 'homes.breakables', b => `<b>${esc(b.name)}</b><small>stops ${(b.blocks ?? []).length}</small>`, i => {
                const p = `homes.breakables.${i}`;
                return `${txt('Name (as in "Oh no: … broke at home")', `${p}.name`, 'the stove')}<h4>While broken, it stops</h4>${pairChips(homeActionOpts(w), `${p}.blocks`)}`;
            }, 'breakable', 'Nothing breaks.')}</section>
    </div>`;
}

// A strengths group (`TraitGroup.skills`): each option starts a skill at a level, so a pick becomes skill levels
// instead of a trait. Options no longer offered can keep theirs (`formerly`), so old saves and persona sheets that
// picked them still convert. Fields name the trait in data-path for the parity check but are bound by name (a trait's
// name may hold a dot).
function strengthsEditor(w: WorldDef, k: number) {
    const t = w.sheet.traits?.[k]; if (!t) return '';
    if (!t.skills) return skillOpts(w).length ? `<label class="mu-check"><input type="checkbox" data-input="cw-strengths" data-k="${esc(k)}"><span>Strengths: each option starts a skill<small>A pick becomes skill levels instead of a trait (Good cook: Cooking 3).</small></span></label>` : '';
    const p = `sheet.traits.${k}`; const map = t.skills;
    const names = [...new Set([...t.options, ...(t.adultOptions ?? []), ...(t.formerly ?? []), ...Object.keys(map)])].filter(n => !BAD_KEYS.includes(n));
    const row = (n: string) => {
        const has = Object.entries(own(map, n) ?? {}); const status = t.options.includes(n) ? '' : (t.adultOptions ?? []).includes(n) ? 'adult option' : (t.formerly ?? []).includes(n) ? 'former option' : 'no longer offered: kept as a former option when saved';
        const pick = (s: string) => `<label class="mu-field"><span>Skill</span><select data-input="cw-strength" data-k="${esc(k)}" data-name="${esc(n)}" data-from="${esc(s)}">${[['', '(none: stays a trait)'] as [string, string], ...skillOpts(w).filter(([id]) => id === s || !has.some(([x]) => x === id)), ...(s && !skillOpts(w).some(([id]) => id === s) ? [[s, s] as [string, string]] : [])].map(([id, l]) => `<option value="${esc(id)}" ${id === s ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
        const level = (s: string, lv: number) => `<label class="mu-field"><span>Level</span><input type="number" min="1" max="10" step="1" data-input="cw-strength-lv" data-k="${esc(k)}" data-name="${esc(n)}" data-skill="${esc(s)}" data-path="${esc(`${p}.skills.${n}.${s}`)}" value="${esc(lv)}"></label>`;
        return (has.length ? has : [['', 0] as [string, number]]).map(([s, lv], j) => `<div class="mu-row mu-cw-inline mu-cw-strength"><span class="mu-cw-sname">${j ? '' : `${esc(n)}${status ? ` <small class="mu-muted">${esc(status)}</small>` : ''}`}</span>${pick(s)}${s ? level(s, lv) : '<span class="mu-cw-spacer"></span>'}</div>`).join('');
    };
    return `<div class="mu-cw-strengths"><span class="mu-cw-sub">Skill each option starts</span>${names.map(row).join('')}
        ${csv('Former options (no longer offered; old saves and persona sheets still convert)', `${p}.formerly`)}
        <label class="mu-check"><input type="checkbox" data-input="cw-strengths" data-k="${esc(k)}" checked><span>Strengths: each option starts a skill<small>Off: the options are traits again, and their skills are forgotten.</small></span></label></div>`;
}

// What each trait does in this world (`traitInfo`): a line for the creation screen and the profile, small effects
// from the engine's fixed list, held inside a trait's bounds (±15%, flat ±1), and for an interest, what it covers.
// The standard names (Calm, Shy, Music…) come with the engine's own; a world keeps only what it changed (ownTraitInfo).
// Strengths groups are skills, not effects, so they are left out.
// The kinds a trait may use: the rest of `EFFECT_KINDS` (prices, pay, trips, rest, rerolls, life points, interviews, and
// whatever the engine adds later) are for life goals' perks and the shop's boosts.
// (adult) `jealousy` and `risk` too: a Flirtatious trait minds a partner's other dates less, Shameless takes more chances.
const TRAIT_KINDS: EffectKind[] = ['drain', 'learn', 'roll', 'perf', 'career', 'warm', 'gain', 'fade', 'morning', 'party', 'study', 'jealousy', 'risk'];
const KIND_NAMES: Record<string, string> = { drain: 'A need drops faster or slower', learn: 'Skills train faster or slower', roll: 'A bonus on rolls', perf: 'Performance gains at work', career: 'Time a rank takes', warm: 'First impressions', gain: 'Friendship or romance gains', fade: 'How fast love fades', morning: 'Mood each morning', party: 'Mood at parties', study: 'What a class is worth',
    price: 'Prices', pay: 'Pay at work', travel: 'How long trips take', rest: 'What a night, a bath or food gives back', reroll: 'Failed rolls rolled again (each day)', points: 'Life points', interview: 'Job interviews', hint: 'Friends\' secrets show in small signs (1: on)',
    jealousy: 'How much jealousy hurts (adult)', risk: 'The chance of being caught (adult)' };
// The targets each kind's hook asks for. `wide`: also those only life goals' hooks know (a skill's group, a roll at work,
// first meetings on a map or at a kind of place, a partner's romance, a new job's head start, lessons you give).
function targetOpts(w: WorldDef, kind: EffectKind, cur = '', wide = false): [string, string][] {
    const placeTags = [...new Set(w.places.flatMap(p => p.tags ?? []))], actTags = [...new Set(w.actions.flatMap(a => a.tags ?? []))];
    const tags = [...new Set([...placeTags, ...actTags])];
    const groups = wide ? Object.keys(SKILL_GROUPS).map(g => [g, `Group: ${g}`] as [string, string]) : [];
    const maps = w.maps.map(m => [m.id, `Map: ${m.name}`] as [string, string]);
    const areas = [...new Set(w.maps.map(m => m.area).filter((a): a is string => !!a && !w.maps.some(m => m.id === a)))].map(a => [a, `Area: ${a}`] as [string, string]);
    const places = placeOpts(w).map(([id, n]) => [id, `Place: ${n}`] as [string, string]);
    const tagged = (l: string[]) => l.map(t => [t, `Tag: ${t}`] as [string, string]);
    const jobs = w.occupations.map(o => [o.id, `Job: ${o.name}`] as [string, string]);
    const jobTags = [...new Set(w.occupations.flatMap(o => o.tags ?? []))].map(t => [t, `Kind of job: ${t}`] as [string, string]);
    const list: [string, string][] = kind === 'drain' ? [['', 'Every need'], ...w.statuses.map(s => [s.id, `${s.icon} ${s.name}`] as [string, string])]
        : kind === 'learn' ? [['all', 'Every skill'], ['upto:3', 'Every skill, up to level 3'], ['upto:5', 'Every skill, up to level 5'], ...skillOpts(w), ...groups]
        : kind === 'roll' ? [['', 'Every roll'], ...(wide ? [['work', 'Any roll at work'] as [string, string]] : []), ...skillOpts(w), ...groups, ...tagged(tags)]
        : kind === 'perf' ? [['gain', 'Performance gains'], ...jobs, ...jobTags] : kind === 'career' ? [['rank', 'Days a rank takes'], ...(wide ? [['hire', 'A new job starts on the way to the next rank (−50%: halfway)'] as [string, string]] : [])]
        : kind === 'warm' ? [['new', 'Someone you first meet (points)'], ...(wide ? [...maps, ...areas, ...tagged(placeTags), ...places] : [])]
        : kind === 'gain' ? [['friend', 'Friendship'], ['romance', 'Romance'], ['dates', 'Romance from dates'], ['gifts', 'Gifts'], ['good friends', 'Friendship with good friends'], ['romance:early', 'Romance until a Crush'],
            ['intimate', 'Romance from private moments (adult)'], ['intimate:lead', 'Romance from private moments with someone who leads (adult)'],
            ['intimate:follow', 'Romance from private moments with someone who follows (adult)'], ['intimate:switch', 'Romance from private moments with someone who switches (adult)']]
        : kind === 'fade' ? [['romance', 'Romance'], ...(wide ? [['partner', 'Your partner\'s romance'] as [string, string]] : []), ['friend', 'Friendship']] : kind === 'morning' || kind === 'party' ? [['mood', 'Mood']]
        : kind === 'study' ? (wide ? [['', 'Every class and lesson'], ['class', 'A course\'s classes'], ['teach', 'Lessons you give an apprentice']] : [['', 'Every class']])
        : kind === 'price' ? [['prices', 'What places and actions charge'], ['regular', 'Where you\'re a regular'], ['rent', 'Rent'], ['bills', 'Bills'], ['entry', 'Entry fees'],
            ...placeTags.map(t => [`entry:${t}`, `Entry fees at places tagged ${t}`] as [string, string]), ...tagged(placeTags), ...maps, ...areas, ...places]
        : kind === 'pay' ? [['', 'All pay'], ['wage', 'Wages'], ['bonus', 'Seasonal bonuses'], ['tips', 'Money from choices at work'], ...jobs, ...jobTags, ...tagged(placeTags)]
        : kind === 'rest' ? [['sleep', 'A night\'s sleep'], ['sleep home', 'A night at home'], ['sleep away', 'A night away'], ['sleep together', 'A night spent together'], ['bath', 'Baths'], ['food', 'Food and drink'], ...tagged(actTags)]
        : kind === 'points' ? [['', 'All life points'], ['active', 'From goals (steps and finishing)'], ['passive', 'From everything else'],
            ...[...Object.keys(GOAL_POINTS), ...Object.keys(SECOND_POINTS)].map(s => [s, s === 'learned' ? 'From likes and limits you learn of someone (adult)' : `From: ${s}`] as [string, string]),
            ['festivals', 'From festivals and city events'], ['secrets', 'From secrets, street stories and storylines']]
        : kind === 'interview' ? [['', 'Every job'], ...jobs]
        : kind === 'risk' ? [['', 'Every risky action'], ...w.actions.filter(a => a.risk !== undefined).map(a => [a.id, `Action: ${a.label || a.name}`] as [string, string]), ...tagged(actTags)]
        : kind === 'jealousy' ? [['', 'Every partner']]
        : kind === 'travel' ? [['', 'Every trip']] : kind === 'reroll' ? [['', 'Any failed roll']] : [['', 'Everything']];
    return cur && !list.some(([v]) => v === cur) ? [...list, [cur, cur]] : list;
}
const hasStd = (n: string) => !!own(STANDARD_TRAIT_INFO, n);
// Same content, whatever the order of its keys (an entry edited back to what the engine says is not the world's own).
const canon = (x: unknown) => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));
const isStd = (n: string, info: TraitInfo | undefined) => hasStd(n) && (!info || canon(info) === canon(STANDARD_TRAIT_INFO[n]));
/** The trait info a world file keeps: its own entries, without the standard names' entries that still say what the
 *  engine says (upgradeWorld gives those to every world as it loads, so later tuning of the standard names reaches it). */
export function ownTraitInfo(all: Record<string, TraitInfo> | undefined): Record<string, TraitInfo> | undefined {
    const out: Record<string, TraitInfo> = {};
    for (const [n, info] of Object.entries(all ?? {})) if (!BAD_KEYS.includes(n) && !isStd(n, info)) out[n] = structuredClone(info);
    return Object.keys(out).length ? out : undefined;
}
/** The world as its file is written: everything, with only its own trait info. An entry taken over from a standard
 *  name may name skills this world doesn't have (Music covers singing): they could never match, so they go. An option
 *  taken out of a strengths group that still has its skill becomes a former option, so old saves still convert. */
export function forSaving(w: WorldDef): WorldDef {
    const out = structuredClone(w); const mine = ownTraitInfo(w.traitInfo);
    const known = new Set([...(w.skills ?? []), ...(w.hobbies ?? [])].map(s => s.id));
    for (const info of Object.values(mine ?? {})) {
        if (info.covers?.skills) info.covers.skills = info.covers.skills.filter(s => known.has(s));
        if (info.effects) info.effects = info.effects.filter(e => e.kind !== 'learn' || !e.target || e.target === 'all' || e.target.startsWith('upto:') || known.has(e.target));
        tidyInfo(info);
    }
    if (mine) out.traitInfo = mine; else delete out.traitInfo;
    tidyGoals(out); tidyAdult(out);
    for (const g of out.sheet?.traits ?? []) {
        const left = Object.keys(g.skills ?? {}).filter(n => !g.options.includes(n) && !(g.adultOptions ?? []).includes(n) && !(g.formerly ?? []).includes(n));
        if (left.length) g.formerly = [...(g.formerly ?? []), ...left];
    }
    return out;
}
// What the newer editors can leave that the engine would refuse: a track's hiring condition left empty, a boost whose
// effects were all removed, an emptied pool of likes and limits. Nothing else is touched (an untouched world saves as it was).
function tidyAdult(w: WorldDef) {
    for (const o of w.occupations ?? []) {
        for (const t of Object.values(o.tracks ?? {})) {
            if (!t || t.hire === undefined) continue;
            if (Array.isArray(t.hire)) { const l = t.hire.filter(h => typeof h !== 'string' || h.trim()); if (l.length) t.hire = l; else delete t.hire; }
            else if (typeof t.hire === 'string' && !t.hire.trim()) delete t.hire;
        }
        for (const e of [...(o.events ?? []), ...Object.values(o.tracks ?? {}).flatMap(t => t?.events ?? [])])
            for (const c of e.choices ?? []) for (const r of [c, c.fail]) if (r?.boost && !r.boost.effects?.length) delete r.boost;
    }
    const pool = w.intimatePool;
    if (pool) { for (const k of ['prefs', 'limits'] as const) if (Array.isArray(pool[k]) && !pool[k]!.length) delete pool[k]; if (!Object.keys(pool).length) delete w.intimatePool; }
}
// The entry being edited: the world's own, made from the standard one the first time it changes.
function infoOf(name: string, make = false): TraitInfo | undefined {
    if (BAD_KEYS.includes(name)) return undefined;
    const w = W(); const mine = own(w.traitInfo, name);
    if (mine || !make) return mine ?? (hasStd(name) ? STANDARD_TRAIT_INFO[name] : undefined);
    return ((w.traitInfo ??= {})[name] = structuredClone(hasStd(name) ? STANDARD_TRAIT_INFO[name] : {}));
}
// Empty parts go, so a trait edited back to nothing says nothing (and one edited back to the standard is the standard).
function tidyInfo(info: TraitInfo) {
    if (!info.desc) delete info.desc;
    if (!info.effects?.length) delete info.effects;
    if (info.covers) { if (!info.covers.skills?.length) delete info.covers.skills; if (!info.covers.tags?.length) delete info.covers.tags; if (!Object.keys(info.covers).length) delete info.covers; }
}
const pctOf = (k: EffectKind) => EFFECT_KINDS[k].mode === 'mul';
function traitInfoEditor(w: WorldDef) {
    const groups: [string, string[]][] = (w.sheet.traits ?? []).filter(t => !t.skills && (t.options.length || t.adultOptions?.length)).map(t => [t.label, [...t.options, ...(t.adultOptions ?? [])]]);
    if ((w.habits ?? []).length) groups.push(['Habits', [...new Set((w.habits ?? []).map(h => h.trait).filter(Boolean))]]);
    const listed = new Set(groups.flatMap(g => g[1]));
    const others = Object.keys(w.traitInfo ?? {}).filter(n => !listed.has(n) && !BAD_KEYS.includes(n));
    if (others.length) groups.push(['Others with info', others]);
    const names = [...new Set(groups.flatMap(g => g[1]))].filter(n => !BAD_KEYS.includes(n));
    if (!names.includes(CW.sel.tinfo)) CW.sel.tinfo = names[0] ?? '';
    const n: string = CW.sel.tinfo; const info = n ? infoOf(n) : undefined; const p = `traitInfo.${n}`;
    const label = (x: string) => { const i = infoOf(x); const fx = i?.effects?.length ?? 0;
        return `${isStd(x, own(w.traitInfo, x)) ? 'standard' : hasStd(x) ? 'changed' : i ? 'this world' : 'nothing yet'}${fx ? ` · ${fx} effect${fx === 1 ? '' : 's'}` : ''}`; };
    const at = (f: string, extra = '') => `data-name="${esc(n)}" data-f="${esc(f)}" data-path="${esc(`${p}.${f}`)}" ${extra}`;
    const effect = (e: any, j: number) => {
        const kind: EffectKind = isEffectKind(e.kind) ? e.kind : 'drain'; const pct = pctOf(kind); const lim = pct ? TRAIT_LIMITS.pct * 100 : TRAIT_LIMITS.flat;
        const shown = pct ? Math.round(Number(e.value) * 1000) / 10 : Number(e.value);
        const kinds = TRAIT_KINDS.includes(kind) ? TRAIT_KINDS : [...TRAIT_KINDS, kind];
        const whenErr = typeof e.when === 'string' && e.when !== OUT_OF_WORK ? whenError(e.when) : '';
        return `<div class="mu-cw-path"><div class="mu-row2">
            <label class="mu-field"><span>What it changes</span><select data-input="cw-ti" ${at(`effects.${j}.kind`)}>${kinds.map(k => `<option value="${esc(k)}" ${k === kind ? 'selected' : ''}>${esc(KIND_NAMES[k] ?? k)}</option>`).join('')}</select></label>
            <label class="mu-field"><span>Of</span><select data-input="cw-ti" ${at(`effects.${j}.target`)}>${targetOpts(w, kind, e.target ?? '').map(([v, l]) => `<option value="${esc(v)}" ${v === (e.target ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
            <div class="mu-row2"><label class="mu-field"><span>${pct ? `By (%; −${lim} … +${lim})` : `By (−${lim} … +${lim})`}</span><input type="number" min="${-lim}" max="${lim}" step="${pct ? 1 : 0.5}" data-input="cw-ti" ${at(`effects.${j}.value`)} data-focus="${esc(`${p}.effects.${j}.value`)}" value="${esc(shown)}"></label>
            <label class="mu-field"><span>Only while (optional)</span><input data-input="cw-ti" ${at(`effects.${j}.when`)} data-focus="${esc(`${p}.effects.${j}.when`)}" value="${esc(typeof e.when === 'string' ? e.when : '')}" placeholder="period: night · out of work">
                <small class="mu-cw-err" ${whenErr ? '' : 'hidden'}>${esc(whenErr)}</small></label></div>
            <button class="mu-ghost mu-danger-text" data-act="cw-ti-del" data-name="${esc(n)}" data-j="${esc(j)}">${icon('x')}<span>Remove this effect</span></button></div>`;
    };
    const covered = info?.covers?.skills ?? [];
    return `<section class="mu-cw-sec mu-cw-wide"><h4>What traits do</h4>
        <p class="mu-muted">A line about each trait (shown when picking it and on the profile) and small effects from a fixed list, each within ±${TRAIT_LIMITS.pct * 100}% (a flat amount within ±${TRAIT_LIMITS.flat}). An interest also says what it covers: doing something that fits it lifts the mood a little more. Standard traits (Calm, Shy, Music…) come with the game's own; change them here, or leave them to get the game's later tuning.</p>
        ${names.length ? `<div class="mu-cw-master"><aside class="mu-cw-list" data-keep="cw-tinfo">${groups.map(([g, l]) => `<span class="mu-cw-sub">${esc(g)}</span>${l.filter(x => !BAD_KEYS.includes(x)).map(x => `<button class="mu-cw-row ${x === n ? 'is-on' : ''}" data-act="cw-tinfo" data-name="${esc(x)}"><b>${esc(x)}</b><small>${esc(label(x))}</small></button>`).join('')}`).join('')}</aside>
        <section class="mu-cw-form"><h4>${esc(n)}</h4>
            <label class="mu-field"><span>Description (when picking it, and on the profile)</span><input data-input="cw-ti" ${at('desc')} data-focus="${esc(`${p}.desc`)}" value="${esc(info?.desc ?? '')}"></label>
            <h4>Effects</h4>${(info?.effects ?? []).map(effect).join('') || '<p class="mu-muted">No effects: it only colors how the AI plays you (and job fit, when jobs like it).</p>'}
            <button class="mu-ghost" data-act="cw-ti-add" data-name="${esc(n)}">${icon('plus')}<span>Add an effect</span></button>
            <h4>An interest covers</h4>
            ${skillOpts(w).length || covered.length ? `<div class="mu-field"><span>Skills</span><div class="mu-chips">${[...skillOpts(w), ...covered.filter(s => !skillOpts(w).some(([id]) => id === s)).map(s => [s, s] as [string, string])].map(([id, l]) => `<button class="mu-chip ${covered.includes(id) ? 'is-on' : ''}" data-act="cw-ti-chip" data-name="${esc(n)}" data-v="${esc(id)}" data-path="${esc(`${p}.covers.skills`)}">${esc(l)}</button>`).join('')}</div></div>` : ''}
            <label class="mu-field"><span>Tags of actions and places (comma separated)</span><input data-input="cw-ti" ${at('covers.tags')} data-focus="${esc(`${p}.covers.tags`)}" value="${esc((info?.covers?.tags ?? []).join(', '))}" placeholder="bar, club"></label>
            ${hasStd(n) && !isStd(n, own(w.traitInfo, n)) ? `<button class="mu-ghost" data-act="cw-ti-reset" data-name="${esc(n)}">${icon('redo')}<span>Back to the standard</span></button>` : !hasStd(n) && own(w.traitInfo, n) ? `<button class="mu-ghost mu-danger-text" data-act="cw-ti-reset" data-name="${esc(n)}">${icon('x')}<span>Clear what it does</span></button>` : ''}
        </section></div>` : '<p class="mu-muted">No traits to describe yet: add a group above.</p>'}</section>`;
}

// The world's skills (what you can do: levels 1–10 that jobs, courses and rolls ask for). Only in a world on the skills
// model (one that has a list); an adult one (Sensuality) is out of the profile, the AI and conditions without adult content.
function skillsEditor(w: WorldDef) {
    if (!Array.isArray(w.skills)) return '';
    return `<section class="mu-cw-sec mu-cw-wide"><h4>Skills</h4><p class="mu-muted">What a character can do, in levels 1–10: jobs, ranks, courses and rolls ask for them, and strengths start them. Hobbies (Customs & calendar) count as skills too.</p>
        ${master('skill', 'skills', k => `<b>${esc(k.icon ?? '')} ${esc(k.name)}</b><small>${k.adult ? 'adult' : ''}</small>`, i => {
            const p = `skills.${i}`;
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon (an emoji)', `${p}.icon`, '🎯')}</div>${txt('Description', `${p}.desc`)}
                ${flag('Only with adult content on', `${p}.adult`, 'Like Sensuality: hidden from the profile, the AI and conditions otherwise. Whatever asks for it or trains it must be adult too.', true)}`;
        }, 'skill', 'No skills yet.')}</section>`;
}

function tabCharacter(w: WorldDef) {
    const s = w.sheet;
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec mu-cw-wide"><h4>What the player chooses</h4><p class="mu-muted">The parts of making a character this world asks for (a new character or a persona). Turned off, it is not asked: the first origin is used, and no traits or words about you.</p>
            <div class="mu-cw-asks">${chk('A picture', 'sheet.ask.portrait', 'New characters only.', true)}${chk('Age', 'sheet.ask.age', '', true)}${chk('Appearance', 'sheet.ask.appearance', '', true)}${chk('Origin', 'sheet.ask.origin', 'Money, home and (RPG) skills.', true)}${chk('Traits', 'sheet.ask.traits', 'The groups below.', true)}${chk('About you', 'sheet.ask.bio', 'A few words of their own.', true)}</div></section>
        <section class="mu-cw-sec"><h4>Age</h4><div class="mu-row2">${num('From', 'sheet.age.min', 1)}${num('To', 'sheet.age.max', 1)}</div>${num('Default', 'sheet.age.default', 1)}
            <h4>Appearance</h4>
            ${(s.appearance ?? []).map((_a, k) => `<div class="mu-row mu-cw-inline">${txt('Trait', `sheet.appearance.${k}.label`)}${csv('Options (comma separated)', `sheet.appearance.${k}.options`)}<button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="sheet.appearance.${k}">${icon('x')}</button></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="look">${icon('plus')}<span>Add</span></button></section>
        <section class="mu-cw-sec"><h4>Traits the player picks</h4>
            ${(s.traits ?? []).map((_t, k) => `<div class="mu-cw-trait"><div class="mu-row2">${txt('Group', `sheet.traits.${k}.label`)}${num('Pick up to', `sheet.traits.${k}.max`, 1)}</div>${csv('Options (comma separated)', `sheet.traits.${k}.options`)}
                ${words(`Adult options (comma separated) ${ADULT}`, `sheet.traits.${k}.adultOptions`, 'Offered after the others, only with adult content on (Good in bed, Shameless).')}
                ${flag('The whole group only with adult content on', `sheet.traits.${k}.adult`, 'Like In bed or Drive.', true)}${strengthsEditor(w, k)}<button class="mu-ghost" data-act="cw-del" data-path="sheet.traits.${k}">${icon('trash')}<span>Remove</span></button></div>`).join('')}
            <button class="mu-ghost" data-act="cw-add" data-what="trait">${icon('plus')}<span>Add a group</span></button></section>
        ${traitInfoEditor(w)}
        ${skillsEditor(w)}
        <section class="mu-cw-sec mu-cw-wide"><h4>Origins (how you start)</h4>
            ${master('origins', 'catalogs.origins', o => `<b>${esc(o.name)}</b><small>${esc(money(w, o.money))}</small>`, i => {
                const p = `catalogs.origins.${i}`;
                return `${txt('Name', `${p}.name`)}${area('Description', `${p}.desc`, 2)}
                    <div class="mu-row2">${num(`Money (${esc(w.currency.symbol)})`, `${p}.money`)}${num('People you already know', `${p}.knows`)}</div>
                    ${sel('You live in', `${p}.home`, zoneOpts(w, '(first area)'))}
                    ${w.rpg && !RPG_LOCKED ? `<h4>In the RPG</h4><div class="mu-field"><span>Trained skills</span>${pairChips(w.rpg.skills.map(k => [k.id, k.name] as [string, string]), `${p}.skills`)}</div>
                        ${txt('What it gives you', `${p}.feature`, 'Folk hero: common folk take you in.')}
                        <div class="mu-row2">${w.rpg.attributes.map(a => num(`+ ${esc(a.short)}`, `${p}.attributes.${a.id}`, 0)).join('')}</div>` : ''}`;
            }, 'origin')}</section>
    </div>`;
}

/* ---------- life goals and the rewards shop (Goals & rewards) ---------- */

// Life goals (D-11): the engine's general goals on or off and renamed (a rename is kept apart, so the engine's later
// changes to the goal still reach the world), the world's own goals with their steps, step rewards and perk, the general
// rewards on or off, renamed and re-priced, and the world's own rewards. Perk and boost values are held inside the
// limits the engine sets (core/goals.ts) and each kind's own range (core/traits.ts), so a custom goal can't break the
// game. Steps are conditions (sim/when.ts), checked as they are typed; quick-add buttons write the common ones with the
// world's own ids. Kinds, targets, tiers and moments come from the engine's lists, so what it learns later shows here.
type Opt = [string, string];
const round4 = (x: number) => Math.round(x * 10000) / 10000;
const FX_LIMITS: Record<string, EffectLimits> = { perk: PERK_LIMITS, boost: BOOST_LIMITS };
/** What one effect may be: its source's limits (a perk ±50%, a boost ±100%; flat ±3) and its kind's own range for the
 *  whole pile (a price no lower than ×0.5, pay no lower than ×0.75, rerolls 0 to 3…): one perk can't do it alone. */
export function fxRange(kind: EffectKind, lim: EffectLimits): [number, number] {
    const k = EFFECT_KINDS[kind], m = k.mode === 'mul' ? lim.pct : lim.flat;
    return [Math.max(-m, round4(k.mode === 'mul' ? k.min - 1 : k.min)), Math.min(m, round4(k.mode === 'mul' ? k.max - 1 : k.max))];
}
export function holdEffect(e: EffectDef, lim: EffectLimits): EffectDef { const [lo, hi] = fxRange(e.kind, lim); return { ...e, value: round4(Math.max(lo, Math.min(hi, Number(e.value) || 0))) }; }
const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : '0');
// A perk's or a boost's effects (`p`: the list's path), edited as "what traits do" edits a trait's: every kind the engine
// has, the targets its hook asks for, a value held inside the limits as it is typed, and an optional condition.
function fxEditor(w: WorldDef, p: string, which: 'perk' | 'boost', max = 2) {
    const lim = FX_LIMITS[which]; const list: EffectDef[] = getPath(p) ?? [];
    const row = (e: EffectDef, j: number) => {
        const kind: EffectKind = isEffectKind(e.kind) ? e.kind : 'learn'; const pct = pctOf(kind); const [lo, hi] = fxRange(kind, lim);
        const sh = (x: number) => (pct ? Math.round(x * 1000) / 10 : x);
        const q = `${p}.${j}`; const at = (f: string) => `data-input="cw-fx" data-lim="${which}" data-path="${esc(`${q}.${f}`)}"`;
        const err = typeof e.when === 'string' ? whenError(e.when) : '';
        const kinds = (Object.keys(EFFECT_KINDS) as EffectKind[]);
        return `<div class="mu-cw-path"><div class="mu-row2">
            <label class="mu-field"><span>What it changes</span><select ${at('kind')}>${kinds.map(k => `<option value="${esc(k)}" ${k === kind ? 'selected' : ''}>${esc(KIND_NAMES[k] ?? k)}</option>`).join('')}</select></label>
            <label class="mu-field"><span>Of</span><select ${at('target')}>${targetOpts(w, kind, e.target ?? '', true).map(([v, l]) => `<option value="${esc(v)}" ${v === (e.target ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
            <div class="mu-row2"><label class="mu-field"><span>${pct ? `By (%; ${signed(sh(lo))} … ${signed(sh(hi))})` : `By (${signed(lo)} … ${signed(hi)})`}</span><input type="number" min="${esc(sh(lo))}" max="${esc(sh(hi))}" step="1" ${at('value')} data-focus="${esc(`${q}.value`)}" value="${esc(sh(Number(e.value) || 0))}"></label>
            <label class="mu-field"><span>Only while (optional)</span><input ${at('when')} data-focus="${esc(`${q}.when`)}" value="${esc(typeof e.when === 'string' ? e.when : '')}" placeholder="period: night">
                <small class="mu-cw-err" ${err ? '' : 'hidden'}>${esc(err)}</small></label></div>
            <button class="mu-ghost mu-danger-text" data-act="cw-del" data-path="${esc(q)}">${icon('x')}<span>Remove this effect</span></button></div>`;
    };
    return `${list.map(row).join('') || '<p class="mu-muted">No effects yet.</p>'}${list.length < max ? `<button class="mu-ghost" data-act="cw-fx-add" data-path="${esc(p)}">${icon('plus')}<span>Add an effect</span></button>` : ''}`;
}

/** What keeps a step from working: a condition that can't be read (it never holds), no objectives (it would be done at
 *  once), or (D-4) every way of doing it names one of the world's people or a storyline (a game can leave them out, and
 *  then doesn't offer the goal). `bad`: it can't work as it is; `warn`: it may not be offered. */
export function stepIssues(st: GoalStep | undefined): { bad: string[]; warn: string[] } {
    const bad: string[] = [], warn: string[] = [];
    if (!st) return { bad, warn };
    const ways = [st.when, ...(st.or ?? [])].filter((x): x is string => typeof x === 'string' && !!x.trim());
    if (typeof st.when !== 'string' || !st.when.trim()) bad.push('No objectives: it would be done at once.');
    for (const x of ways) { const e = whenError(x); if (e) bad.push(`A condition can't be read (${e}): it never holds.`); }
    const named = ways.map(x => namedIn(x));
    if (named.length && named.every(n => n.people.length || n.threads.length))
        warn.push(`It names ${[...new Set(named.flatMap(n => [...n.people, ...n.threads]))].join(', ')} in every way: add another way that names nobody, or a game without them won't offer this goal.`);
    return { bad, warn };
}
export function goalIssues(goal: GoalDef): { bad: string[]; warn: string[] } {
    const steps = goal.steps ?? []; const bad: string[] = [], warn: string[] = [];
    if (!steps.length) bad.push('It has no steps.');
    if (steps.length > 6) bad.push('More than six steps.');
    steps.forEach((st, k) => { const r = stepIssues(st); bad.push(...r.bad.map(x => `Step ${k + 1}: ${x}`)); warn.push(...r.warn.map(x => `Step ${k + 1}: ${x}`)); });
    if ((goal.perk?.effects ?? []).length > 2) bad.push('A perk has one or two effects.');
    return { bad, warn };
}
/** The world's own goals that can't work as they are (shown in the tab, and said when the world is saved). */
export const goalsToFix = (w: WorldDef) => (w.goals?.add ?? []).filter(x => goalIssues(x).bad.length);
/** What Save says. A world is saved as it is; a goal of its own that can't work yet is named (in a game it would stay
 *  stuck at that step until it's fixed). */
export function savedNote(w: WorldDef): [string, 'success' | 'warn'] {
    const fix = goalsToFix(w);
    return fix.length ? [`World saved. Not working yet (Goals & rewards): ${fix.map(x => x.name).join(', ')}.`, 'warn'] : ['World saved.', 'success'];
}

// What a reward does, by kind (REWARD_KINDS in core/goals.ts; a kind the engine adds later shows by its id).
const REWARD_KIND_NAMES: Record<string, string> = { boost: 'A boost for a few days', refill: 'A need full now', nudge: 'Nudge: one person\'s feelings for you grow', clear: 'Clear the air: one person\'s feelings start over',
    fresh: 'A fresh start: one person forgets you', forgive: 'Forgive and forget: a grudge ends', invite: 'An invitation: someone asks you out soon', quiet: 'Quiet a rumor about you', insight: 'Insight: one true thing about someone',
    retrait: 'Change a trait, or drop a habit', skip: 'Skip the current step of your goal', rentfree: 'Rent holiday: the next rent and bills a week later', cleanslate: 'Clean slate at work', double: 'Double the finishing points of your goal' };
// What an Insight item can tell (sim/rewards.ts): `bed` stands for the three adult ones.
const INSIGHT_QUESTIONS: Opt[] = [['heart', 'Their heart'], ['view', 'How they see you'], ['secret', 'Their secret'], ['bed_like', 'Something they like (adult)'], ['bed_limit', "Something they won't do (adult)"], ['bed_drive', 'Their drive (adult)'], ['bed', 'Anything about them in bed (adult)']];
const LIMIT_PER: Opt[] = [['', 'No limit'], ['day', 'A day'], ['week', 'A week'], ['season', 'A season'], ['year', 'A year'], ['goal', 'For each goal you follow'], ['ever', 'Ever']];
// Systems and needs a goal or a reward can't do without (with one off, a game doesn't offer it): the world's systems that
// are on, its needs, and whatever the entry already names.
const needOpts = (w: WorldDef, cur: string[] = []): Opt[] => {
    const l: Opt[] = [...SYSTEMS.filter(s => systemOn(w, s.id)).map(s => [s.id, s.name] as Opt), ...w.statuses.filter(s => !s.rpg).map(s => [s.id, `${s.icon} ${s.name}`] as Opt)];
    return [...l, ...cur.filter(c => !l.some(([v]) => v === c)).map(c => [c, c] as Opt)];
};
// folded, since a world has many systems: its summary says what is picked
const needsBox = (w: WorldDef, cur: string[] | undefined, p: string, why: string) => `<details class="mu-cw-needs"><summary>It can't do without: ${esc((cur ?? []).map(id => SYSTEMS.find(s => s.id === id)?.name ?? w.statuses.find(s => s.id === id)?.name ?? id).join(', ') || 'nothing in particular')}</summary><small class="mu-muted">${esc(why)}.</small>${pairChips(needOpts(w, cur), p)}</details>`;
const roleOpts = (w: WorldDef, cur: string[] = []): Opt[] => {
    const l: Opt[] = [...PLACE_ROLES.map(r => [r.id, r.name] as Opt), ...[...new Set(w.places.flatMap(p => p.roles ?? []))].filter(r => !PLACE_ROLES.some(x => x.id === r)).map(r => [r, r] as Opt)];
    return [...l, ...cur.filter(c => !l.some(([v]) => v === c)).map(c => [c, c] as Opt)];
};

// Quick-add: the common objectives, written with the world's own ids so nobody has to remember them. Every kind lists its
// choices from the world and the engine (skills and their groups, jobs and ranks, the engine's moments, festivals and
// events, places, maps and areas, friendship and romance tiers, keepsakes, courses, partners); a form the condition
// grammar doesn't read yet is left out (a regular at one place: `visited: <place> regular`).
const MOMENT_NAMES: Record<string, string> = { meal: 'Cook a meal', workout: 'Work out', painting: 'Paint', shift: 'Work a shift', party: 'Throw a party', missed_shift: 'Miss a shift', missed_train: 'Miss the last train', date: 'Go on a date',
    overnight: 'Someone stays the night', night_away: 'A night away from home', crisis: 'A crisis (a need at zero)', collapse: 'Collapse from exhaustion', apprentice: 'Take an apprentice', lesson: 'Teach a lesson', taught: 'An apprentice finishes',
    baby: 'Have a baby', business: 'Open a business', big_party: 'A party with five guests', loved_party: 'A party everyone loved', night_together: 'A night together', trip: 'A day trip', late_night: 'Still up at 1:00',
    // (adult)
    intimate: 'A private moment with someone (adult)', learned: 'Learn something someone likes or won\'t do (adult)', risky: 'Get away with something risky (adult)', caught: 'Get caught (adult)',
    threesome: 'A night for three (adult)', jealous: 'Make a partner jealous', gift_loved: 'A gift someone loved' };
const PARTNER_NAMES: Record<string, string> = { any: 'Any partner', none: 'No partner', home: 'A partner living with you', casual: 'Something casual', dating: 'Dating', engaged: 'Engaged', married: 'Married', open: 'A partner fine with more than one' };
interface Quick { name: string; ok: (w: WorldDef) => boolean; opts: (w: WorldDef) => Opt[]; n?: string; extra?: (w: WorldDef, what: string) => Opt[]; make: (what: string, n: number, extra: string) => string }
const realPlaces = (w: WorldDef) => w.places.filter(p => !p.link);
// (an area named with a space can't be written in a condition)
const areasOf = (w: WorldDef) => [...new Set(w.maps.map(m => m.area).filter((a): a is string => !!a && /^[^\s,;]+$/.test(a) && !w.maps.some(m => m.id === a)))];
function rankOpts(w: WorldDef, job: string): Opt[] {
    const o = w.occupations.find(x => x.id === job); const n = o ? o.ranks.length : Math.max(0, ...w.occupations.map(x => x.ranks.length));
    return [['', 'Any rank'], ...Array.from({ length: Math.max(0, n - 1) }, (_x, k) => [String(k + 2), o ? `Rank ${k + 2}: ${o.ranks[k + 1]?.name ?? ''}` : `Rank ${k + 2}`] as Opt), ['middle', 'The middle rank'], ['top-1', 'One below the top'], ['top', 'The top']];
}
// (forms the grammar reads only since D-19: a regular at one place, and regulars on a map or near home; asked, not assumed)
function visitOpts(w: WorldDef): Opt[] {
    const ps = realPlaces(w); const regular = !!ps[0] && !whenError(`visited: ${ps[0].id} regular`);
    const where = [...w.maps.map(m => [m.id, `on ${m.name}`] as Opt), ...areasOf(w).map(a => [a, `in ${a}`] as Opt)];
    const regIn = !!w.maps[0] && !whenError(`visited: 2 regular in ${w.maps[0].id}`);
    return [['n', 'A number of places'], ['regular', 'A regular at a number of places'], ...where.map(([id, l]) => [`in:${id}`, `A number of places ${l}`] as Opt),
        ...(regIn ? [['in:home', 'A number of places near home'] as Opt, ...where.map(([id, l]) => [`rin:${id}`, `A regular at a number of places ${l}`] as Opt), ['rin:home', 'A regular at a number of places near home'] as Opt] : []),
        ...w.maps.map(m => [`all:${m.id}`, `Every place on ${m.name}`] as Opt), ['map', 'Every place on one map'], ['maps', 'A place on every map'], ['all', 'Every place'],
        ...ps.map(p => [`at:${p.id}`, `Been to ${p.name}`] as Opt), ...(regular ? ps.map(p => [`reg:${p.id}`, `A regular at ${p.name}`] as Opt) : [])];
}
const visitMake = (x: string, n: number) => (x === 'n' ? `visited: ${n}` : x === 'regular' ? `visited: ${n} regular` : x.startsWith('in:') ? `visited: ${n} in ${x.slice(3)}` : x.startsWith('rin:') ? `visited: ${n} regular in ${x.slice(4)}`
    : x.startsWith('all:') ? `visited: all in ${x.slice(4)}` : x.startsWith('at:') ? `visited: ${x.slice(3)}` : x.startsWith('reg:') ? `visited: ${x.slice(4)} regular` : `visited: ${x}`);
const tierOpts = (): Opt[] => [...[...FRIEND_TIERS].reverse().filter(t => t.lo >= 10).map(t => [t.id, `${t.name} (friendship)`] as Opt), ...ROMANCE_TIERS.filter(t => t.lo > 0).map(t => [t.id, `${t.name} (romance)`] as Opt)];
const times = (n: number) => (n > 1 ? ` ${n}` : '');
export const QUICK: Record<string, Quick> = {
    skill: { name: 'A skill level', ok: w => skillOpts(w).length > 0, opts: w => [...skillOpts(w), ['any', 'Any skill'], ...Object.keys(SKILL_GROUPS).map(g => [g, `Any ${g} skill`] as Opt)], n: 'Level', make: (s, n) => `skill: ${s} ${Math.min(10, n)}` },
    job: { name: 'A job and rank', ok: w => w.occupations.length > 0, opts: w => [['any', 'Any job'], ...w.occupations.map(o => [o.id, o.name] as Opt)], extra: rankOpts, make: (j, _n, r) => `job: ${j}${r ? `; rank: ${r}` : ''}` },
    money: { name: 'Money saved', ok: () => true, opts: () => [['', 'An amount'], ['weeks', 'Weeks of the usual pay'], ['months', 'Months of the usual pay'], ['years', 'Years of the usual pay'], ['fortune', 'A fortune']], n: 'How much',
        make: (u, n) => (u === 'fortune' ? 'money: fortune' : `money: ${n}${u ? ` ${u}` : ''}`) },
    did: { name: 'Did something N times', ok: () => true, n: 'Times', make: (x, n) => `did: ${x}${times(n)}`,
        opts: w => [...TALLY_EVENTS.map(m => [m, MOMENT_NAMES[m] ?? m] as Opt), ['with:any', 'Anything, with someone'], ...w.actions.map(a => [a.id, a.label || a.name] as Opt),
            ...[...new Set(w.actions.flatMap(a => a.tags ?? []))].map(t => [`tag:${t}`, `Anything tagged ${t}`] as Opt), ...skillOpts(w).map(([id, n]) => [`roll:${id}`, `A ${n} roll that goes well`] as Opt)] },
    attended: { name: 'Went to a festival or event', ok: w => !!((w.festivals ?? []).length || (w.cityEvents ?? []).length), n: 'Times', make: (x, n) => `attended: ${x}${times(n)}`,
        opts: w => [['any', 'Any festival or event'], ...(w.festivals ?? []).map(f => [f.id, f.name] as Opt), ...(w.cityEvents ?? []).map(e => [e.id, e.name] as Opt)] },
    visited: { name: 'Visited places', ok: w => realPlaces(w).length > 0, opts: visitOpts, n: 'How many', make: visitMake },
    friends: { name: 'Friends at a tier', ok: () => true, opts: tierOpts, n: 'How many', extra: w => [['', 'Anywhere'], ...w.maps.map(m => [m.id, `Living on ${m.name}`] as Opt), ...areasOf(w).map(a => [a, `Living in ${a}`] as Opt), ['regular', 'Working where you\'re a regular']],
        make: (t, n, x) => `friends: ${n} ${t}${x === 'regular' ? ' at regular' : x ? ` in ${x}` : ''}` },
    holds: { name: 'A keepsake', ok: w => (w.keepsakes ?? []).length > 0, opts: w => [['#', 'A number of different keepsakes'], ...(w.keepsakes ?? []).map(k => [k.id, `${k.icon ?? ''} ${k.name}`.trim()] as Opt)], n: 'How many', make: (x, n) => (x === '#' ? `holds: ${n}` : `holds: ${x}`) },
    course: { name: 'A course finished', ok: w => ((w.catalogs as any).courses ?? []).length > 0, opts: w => [['#', 'A number of courses'], ...((w.catalogs as any).courses ?? []).map((c: any) => [c.id, c.name] as Opt)], n: 'How many', make: (x, n) => (x === '#' ? `course: ${n}` : `course: ${x}`) },
    partner: { name: 'A partner', ok: w => systemOn(w, 'romance'), opts: () => PARTNER_VALUES.map(v => [v, PARTNER_NAMES[v] ?? v] as Opt), make: x => `partner: ${x}` },
    partners: { name: 'Partners at once', ok: w => systemOn(w, 'romance'), opts: () => [['', 'Casual ones included']], n: 'How many', make: (_x, n) => `partner: ${Math.max(1, n)}` },
    known: { name: 'Likes and limits you know (adult)', ok: w => systemOn(w, 'romance'), opts: () => [['', 'Of your lovers, in all']], n: 'How many', make: (_x, n) => `known: ${Math.max(1, n)}` },
    track: { name: 'A job on a track', ok: w => w.occupations.some(o => Object.keys(o.tracks ?? {}).length), opts: w => trackOpts(w), make: x => { const [j, t] = x.split('|'); return `job: ${j}; track: ${t}`; } },
    seen: { name: 'A choice made at work', ok: w => workEvents(w).length > 0, opts: w => workEvents(w).map(([o, e]) => [e.id, `${o.name}: ${e.setup.length > 50 ? `${e.setup.slice(0, 49)}…` : e.setup}`] as Opt),
        extra: (w, id) => { const e = workEvents(w).find(([, x]) => x.id === id)?.[1]; return [['', 'Any choice'], ...(e?.choices ?? []).map((c, k) => [String(k + 1), c.label] as Opt)]; },
        make: (id, _n, c) => `seen: ${id}${c ? `:${c}` : ''}` },
};
// The world's work events (a job's and its tracks'), with their job, each once by id.
function workEvents(w: WorldDef): [WorldDef['occupations'][number], NonNullable<WorldDef['occupations'][number]['events']>[number]][] {
    const out: [any, any][] = []; const seen = new Set<string>();
    for (const o of w.occupations) for (const e of [...(o.events ?? []), ...Object.values(o.tracks ?? {}).flatMap(t => t?.events ?? [])]) if (e?.id && !seen.has(e.id) && /^[^\s,;:]+$/.test(e.id)) { seen.add(e.id); out.push([o, e]); }
    return out;
}
const trackOpts = (w: WorldDef): Opt[] => { const gs = gendersOf(w);
    return w.occupations.flatMap(o => Object.entries(o.tracks ?? {}).filter(([g]) => /^[^\s,;:]+$/.test(g) && /^[^\s,;:]+$/.test(o.id)).map(([g, t]) => [`${o.id}|${g}`, `${o.name}: ${t?.name || o.name} (${gs.find(x => x.id === g)?.name ?? g})`] as Opt)); };
// What each step's quick-add row has picked (by the step's path; kept while the form is drawn again).
const QA: Record<string, { kind: string; what: string; n: number; extra: string; to: string }> = {};
const qaOf = (k: string) => (QA[k] ??= { kind: '', what: '', n: 1, extra: '', to: 'when' });
const pickIn = (opts: Opt[], v: string) => (opts.some(([x]) => x === v) ? v : opts[0]?.[0] ?? '');
/** The condition a step's quick-add row writes now (or '' with nothing picked). */
export function quickMade(w: WorldDef, k: string): string {
    const q = qaOf(k), qk = QUICK[q.kind]; if (!qk || !qk.ok(w)) return '';
    const what = pickIn(qk.opts(w), q.what);
    return qk.make(what, Math.max(1, Math.round(Number(q.n) || 1)), qk.extra ? pickIn(qk.extra(w, what), q.extra) : '');
}
function quickAdd(w: WorldDef, sp: string, st: GoalStep) {
    const q = qaOf(sp), qk = QUICK[q.kind]; const at = (f: string) => `data-input="cw-qa" data-k="${esc(sp)}" data-f="${f}"`;
    const opt = (v: string, l: string, on: string) => `<option value="${esc(v)}" ${v === on ? 'selected' : ''}>${esc(l)}</option>`;
    const choose = (label: string, f: string, opts: Opt[], on: string) => `<label class="mu-field"><span>${label}</span><select ${at(f)}>${opts.map(([v, l]) => opt(v, l, on)).join('')}</select></label>`;
    const what = qk ? pickIn(qk.opts(w), q.what) : '';
    const ways: Opt[] = [['when', 'The objectives'], ...(st.or ?? []).map((_x, j) => [`or.${j}`, `Way ${j + 2}`] as Opt)];
    return `<div class="mu-cw-quick"><div class="mu-row mu-cw-inline">${choose('Quick add', 'kind', [['', '(choose)'], ...Object.entries(QUICK).filter(([, x]) => x.ok(w)).map(([id, x]) => [id, x.name] as Opt)], q.kind)}
        ${qk ? `${choose('Which', 'what', qk.opts(w), what)}${qk.extra ? choose('And', 'extra', qk.extra(w, what), pickIn(qk.extra(w, what), q.extra)) : ''}
            ${qk.n ? `<label class="mu-field mu-cw-qn"><span>${esc(qk.n)}</span><input type="number" min="1" step="1" ${at('n')} value="${esc(q.n)}"></label>` : ''}
            ${ways.length > 1 ? choose('Into', 'to', ways, pickIn(ways, q.to)) : ''}
            <button class="mu-ghost" data-act="cw-qa-add" data-k="${esc(sp)}">${icon('plus')}<span>Add</span></button>` : ''}</div>
        ${qk ? `<small class="mu-muted">Adds <code data-notr>${esc(quickMade(w, sp))}</code></small>` : ''}</div>`;
}
// A way of doing a step, kept as typed (an empty one stays until it is removed) and checked like any condition.
const wayField = (label: string, p: string, ph: string) => {
    const v = getPath(p); const err = typeof v === 'string' ? whenError(v) : '';
    return `<label class="mu-field"><span>${label}</span><input data-input="cw-way" data-path="${esc(p)}" data-focus="${esc(p)}" value="${typeof v === 'string' ? esc(v) : ''}" placeholder="${esc(ph)}">
        <small class="mu-cw-err" ${err ? '' : 'hidden'}>${esc(err)}</small></label>`;
};
function stepForm(w: WorldDef, p: string, k: number, st: GoalStep, n: number) {
    const sp = `${p}.steps.${k}`; const r = stepIssues(st); const hold = st.hold;
    const ks: Opt[] = (w.keepsakes ?? []).map(x => [x.id, `${x.icon ?? ''} ${x.name}`.trim()] as Opt);
    const kept = st.reward?.keepsake; if (kept && !ks.some(([v]) => v === kept)) ks.push([kept, kept]);
    return `<div class="mu-cw-path mu-cw-step"><div class="mu-row mu-cw-inline"><b class="mu-cw-stepno">Step ${k + 1}</b><span class="mu-cw-spacer"></span>
            ${k > 0 ? `<button class="mu-ghost mu-ibtn" data-act="cw-move" data-path="${esc(`${p}.steps`)}" data-i="${k}" data-d="-1" title="Move up">${icon('up')}</button>` : ''}
            ${k < n - 1 ? `<button class="mu-ghost mu-ibtn" data-act="cw-move" data-path="${esc(`${p}.steps`)}" data-i="${k}" data-d="1" title="Move down">${icon('down')}</button>` : ''}
            <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${esc(sp)}" title="Remove this step">${icon('x')}</button></div>
        ${txt('What it says (in the Goals app)', `${sp}.name`, 'Cook 15 meals')}
        ${wayField('Objectives (all of them, separated by ;)', `${sp}.when`, 'did: meal 15; skill: cooking 3')}
        ${(st.or ?? []).map((_x, j) => `<div class="mu-row mu-cw-inline">${wayField(`Or instead (way ${j + 2})`, `${sp}.or.${j}`, 'skill: cooking 6')}<button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${esc(`${sp}.or.${j}`)}" title="Remove this way">${icon('x')}</button></div>`).join('')}
        ${quickAdd(w, sp, st)}
        <button class="mu-ghost" data-act="cw-add" data-what="gor" data-path="${esc(`${sp}.or`)}">${icon('plus')}<span>Add another way to do it</span></button>
        ${r.bad.filter(x => x.startsWith('No objectives')).map(x => `<p class="mu-cw-bad">${esc(x)}</p>`).join('')}${r.warn.map(x => `<p class="mu-warn">${esc(x)}</p>`).join('')}
        <div class="mu-row2"><label class="mu-field"><span>The objectives must keep holding</span><select data-input="cw-hold" data-path="${esc(`${sp}.hold`)}">${([['', 'No: once is enough'], ['days', 'For some days'], ['season', 'For a season']] as Opt[]).map(([v, l]) => `<option value="${v}" ${(typeof hold === 'number' ? 'days' : hold === 'season' ? 'season' : '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            ${typeof hold === 'number' ? num('Days', `${sp}.hold`, 1) : '<span></span>'}</div>
        <span class="mu-cw-sub">When it's done, it gives</span>
        <div class="mu-row2">${ks.length ? sel('A keepsake', `${sp}.reward.keepsake`, [['', '(none)'], ...ks], 'opt') : ''}${num('Mood (empty: a little)', `${sp}.reward.mood`, -100)}
            ${num(`Money (${esc(w.currency.symbol)})`, `${sp}.reward.money`, 0)}${num(`Life points (empty: ${GOAL_POINTS.step})`, `${sp}.reward.points`, 0)}</div></div>`;
}
function goalForm(w: WorldDef, i: number) {
    const p = `goals.add.${i}`; const goal = w.goals!.add![i]; const steps = goal.steps ?? [];
    const known = GOAL_CATEGORIES.some(c => c.id === goal.category); const issues = goalIssues(goal);
    return `${issues.bad.length ? `<div class="mu-cw-bad"><b>Can't work yet</b>${issues.bad.map(x => `<small>${esc(x)}</small>`).join('')}</div>` : ''}
        ${issues.warn.length ? `<div class="mu-warn"><b>May not be offered</b>${issues.warn.map(x => `<small>${esc(x)}</small>`).join('')}</div>` : ''}
        <div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon (an emoji)', `${p}.icon`, '⭐')}</div>
        <div class="mu-row2"><label class="mu-field"><span>Category</span><select data-input="cw-gcat" data-path="${esc(`${p}.category`)}">${[...GOAL_CATEGORIES.map(c => [c.id, `${c.icon} ${c.name}`] as Opt), ['', 'A category of its own…'] as Opt].map(([v, l]) => `<option value="${esc(v)}" ${(known ? goal.category === v : !v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            ${known ? '<span></span>' : txt('Its own category (a group of its own in the Goals app)', `${p}.category`, 'Night life')}</div>
        ${area('Description', `${p}.desc`, 2)}
        ${(w.starts ?? []).length ? `<div class="mu-field"><span>Starts it suits (suggested first to players who start so)</span>${pairChips((w.starts ?? []).map(s => [s.id, s.name] as Opt), `${p}.starts`)}</div>` : ''}
        ${needsBox(w, goal.needs, `${p}.needs`, 'A game with one of these off doesn\'t offer it')}
        ${chk('Adult (only with adult content on)', `${p}.adult`)}
        ${cond('Offered while (empty: always)', `${p}.offer`, 'skill: not japanese 4', 'A goal already started stays.')}
        <h4>Steps</h4><p class="mu-muted">Done in order, each when all its objectives hold (or one of its other ways does). Three or four are best; one to six work. Counted objectives (did, attended) count only while the goal is the one followed; the rest count at once.</p>
        ${steps.map((st, k) => stepForm(w, p, k, st, steps.length)).join('')}
        ${steps.length < 6 ? `<button class="mu-ghost" data-act="cw-add" data-what="gstep" data-path="${esc(`${p}.steps`)}">${icon('plus')}<span>Add a step</span></button>` : ''}
        <h4>Its perk (for finishing it)</h4>
        ${goal.perk ? `<div class="mu-row2">${txt('Name', `${p}.perk.name`, 'Shrewd')}${txt('What it does, in a few words', `${p}.perk.desc`, 'Prices 5% lower everywhere.')}</div>
            <p class="mu-muted">One or two effects, each within ±${PERK_LIMITS.pct * 100}% (a flat amount within ±${PERK_LIMITS.flat}) and the range the game allows for its kind. A perk is not a trait: it is kept with the goal and never told to the AI.</p>
            ${fxEditor(w, `${p}.perk.effects`, 'perk', 2)}
            <button class="mu-ghost mu-danger-text" data-act="cw-del" data-path="${esc(`${p}.perk`)}">${icon('x')}<span>No perk</span></button>`
        : `<p class="mu-muted">No perk: finishing it gives its life points and a good mood only.</p><button class="mu-ghost" data-act="cw-add" data-what="perk" data-path="${esc(`${p}.perk`)}">${icon('plus')}<span>Give it a perk</span></button>`}`;
}
function rewardForm(w: WorldDef, i: number) {
    const p = `rewards.add.${i}`; const r = w.rewards!.add![i]; const kind = r.kind;
    const kinds = [...REWARD_KINDS as readonly string[], ...((REWARD_KINDS as readonly string[]).includes(kind) ? [] : [kind])];
    return `<div class="mu-row2">${txt('Name', `${p}.name`)}${txt('Icon (an emoji)', `${p}.icon`, '🎁')}</div>
        ${area('Description (what the player reads in the shop)', `${p}.desc`, 2)}
        <div class="mu-row2">${num('Price (life points)', `${p}.price`, 0, 10)}<label class="mu-field"><span>What it does</span><select data-input="cw-rkind" data-path="${esc(`${p}.kind`)}">${kinds.map(k => `<option value="${esc(k)}" ${k === kind ? 'selected' : ''}>${esc(REWARD_KIND_NAMES[k] ?? k)}</option>`).join('')}</select></label></div>
        ${kind === 'boost' ? `${bounded(`For how many days (${BOOST_DAYS.min}–${BOOST_DAYS.max})`, `${p}.days`, BOOST_DAYS.min, BOOST_DAYS.max)}
            <p class="mu-muted">One or two effects, each within ±${BOOST_LIMITS.pct * 100}% (a flat amount within ±${BOOST_LIMITS.flat}) and the range the game allows for its kind. While it runs, the same item isn't for sale.</p>${fxEditor(w, `${p}.effects`, 'boost', 2)}`
        : kind === 'refill' || r.need ? sel('The need it fills', `${p}.need`, statusOpts(w), 'opt')
        : `<p class="mu-muted">${(PERSON_KINDS as string[]).includes(kind) ? 'The player picks a person you know when buying it. ' : ''}It works as the general item of this kind does, under this item's own name and words.</p>`}
        ${kind === 'insight' || r.questions ? `<div class="mu-field"><span>What it can tell (none picked: everything Insight asks)</span>${pairChips(INSIGHT_QUESTIONS.filter(([v]) => v !== 'bed' || (r.questions ?? []).includes('bed')), `${p}.questions`, true)}</div>
            ${(r.questions ?? []).some(q => q.startsWith('bed')) && !r.adult ? '<p class="mu-warn">A question about someone in bed is adult: mark the item adult below.</p>' : ''}` : ''}
        <h4>How often</h4>
        <div class="mu-row2"><label class="mu-field"><span>At most once</span><select data-input="cw-rlimit" data-path="${esc(`${p}.limit.per`)}">${LIMIT_PER.map(([v, l]) => `<option value="${v}" ${(r.limit ? r.limit.per ?? 'ever' : '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            ${r.limit ? num('Times (empty: once)', `${p}.limit.n`, 1) : '<span></span>'}</div>
        ${r.limit && ((PERSON_KINDS as string[]).includes(kind) || r.limit.person) ? chk('Counted for each person apart', `${p}.limit.person`, 'Once per person per season, say.') : ''}
        <h4>Where and when</h4>
        <div class="mu-field"><span>Only at places with one of these roles (none: anywhere)</span>${pairChips(roleOpts(w, r.roles), `${p}.roles`)}</div>
        ${cond('Only while (a condition)', `${p}.when`, 'job: any')}
        ${needsBox(w, r.needs, `${p}.needs`, 'A game with one of these off doesn\'t sell it')}
        ${chk('Adult (only with adult content on)', `${p}.adult`)}`;
}
function tabGoals(w: WorldDef) {
    const gs = w.goals ?? {}, rs = w.rewards ?? {};
    const sysOff = (needs: string[] = []) => needs.filter(n => isSystemNeed(n) && !systemOn(w, n as any)).map(n => SYSTEMS.find(s => s.id === n)?.name ?? n);
    const cat = (id: string) => GOAL_CATEGORIES.find(c => c.id === id)?.name ?? id;
    const general = GENERAL_GOALS.map(x => {
        const on = !(gs.off ?? []).includes(x.id), mine = (gs.add ?? []).some(a => a.id === x.id), off = sysOff(x.needs);
        return `<div class="mu-cw-gen ${on && !mine && !off.length ? '' : 'is-off'}" title="${esc(x.steps.map(s => s.name).join(' · '))}">
            <label class="mu-check"><input type="checkbox" data-input="cw-off" data-path="goals.off" data-id="${esc(x.id)}" ${on ? 'checked' : ''}><span>${esc(x.icon ?? '')}</span></label>
            <label class="mu-field"><span>${esc(cat(x.category))} · ${esc(x.perk?.name ?? '')}</span><input data-input="cw-rename" data-path="goals.names.${esc(x.id)}" data-focus="goals.names.${esc(x.id)}" value="${esc(own(gs.names, x.id) ?? '')}" placeholder="${esc(x.name)}"></label>
            <small class="mu-muted">${esc(x.perk?.desc ?? '')}${off.length ? ` Not offered here: needs ${esc(off.join(', '))} on.` : ''}${mine ? ' This world\'s own goal with the same id takes its place.' : ''}</small></div>`;
    }).join('');
    const rewards = GENERAL_REWARDS.map(x => {
        const on = !(rs.off ?? []).includes(x.id), mine = (rs.add ?? []).some(a => a.id === x.id), off = sysOff(x.needs);
        return `<div class="mu-cw-gen is-priced ${on && !mine && !off.length ? '' : 'is-off'}">
            <label class="mu-check"><input type="checkbox" data-input="cw-off" data-path="rewards.off" data-id="${esc(x.id)}" ${on ? 'checked' : ''}><span>${esc(x.icon ?? '')}</span></label>
            <label class="mu-field"><span>Name</span><input data-input="cw-rename" data-path="rewards.names.${esc(x.id)}" data-focus="rewards.names.${esc(x.id)}" value="${esc(own(rs.names, x.id) ?? '')}" placeholder="${esc(x.name)}"></label>
            <label class="mu-field"><span>Price</span><input type="number" min="0" step="10" data-input="cw-reprice" data-path="rewards.prices.${esc(x.id)}" data-focus="rewards.prices.${esc(x.id)}" value="${esc(own(rs.prices, x.id) ?? '')}" placeholder="${esc(x.price)}"></label>
            <small class="mu-muted">${esc(x.desc ?? '')}${off.length ? ` Not sold here: needs ${esc(off.join(', '))} on.` : ''}${mine ? ' This world\'s own item with the same id takes its place.' : ''}</small></div>`;
    }).join('');
    const goalRow = (x: GoalDef) => { const is = goalIssues(x); return `<b>${esc(x.icon ?? '')} ${esc(x.name)}</b><small>${esc(cat(x.category))} · ${esc((x.steps ?? []).length)} steps${is.bad.length ? ' · can\'t work yet' : is.warn.length ? ' · may not be offered' : ''}</small>`; };
    return `<div class="mu-cw-grid mu-cw-goals">
        ${systemOn(w, 'goals') ? '' : '<section class="mu-cw-sec mu-cw-wide"><p class="mu-warn">Life goals are off in this world (Features → Systems): nothing here is offered in a game until they are on.</p></section>'}
        <section class="mu-cw-sec mu-cw-wide"><h4>General goals</h4>
            <p class="mu-muted">The game's own goals, offered in every world whose systems they need. Untick one this world can't do; give it a name of your own (empty: the game's name). A renamed goal keeps the game's steps and perk, so later changes to them still reach this world.</p>
            <div class="mu-cw-gens">${general}</div></section>
        <section class="mu-cw-sec mu-cw-wide"><h4>This world's own goals</h4>
            <p class="mu-muted">Goals of this world, shown with the general ones in their categories. A step that names one of the world's people or a storyline needs another way that names nobody: a game can leave them out. A goal removed after games picked it is gone from them, perk included.</p>
            ${master('goal', 'goals.add', goalRow, i => goalForm(w, i), 'goal', 'No goals of its own yet.')}</section>
        <section class="mu-cw-sec mu-cw-wide"><h4>General rewards</h4>
            <p class="mu-muted">What life points buy in every world. Untick one, rename it, or give it a price of its own (empty: the game's).</p>
            <div class="mu-cw-gens">${rewards}</div></section>
        <section class="mu-cw-sec mu-cw-wide"><h4>This world's own rewards</h4>
            <p class="mu-muted">A boost for a few days, a need full now, or one of the game's one-off kinds under a name of this world's (as Tokyo's omikuji is a lucky week).</p>
            ${master('reward', 'rewards.add', x => `<b>${esc(x.icon ?? '')} ${esc(x.name)}</b><small>${esc(x.price)} points · ${esc(REWARD_KIND_NAMES[x.kind] ?? x.kind)}</small>`, i => rewardForm(w, i), 'reward', 'No rewards of its own yet.')}</section>
    </div>`;
}
// A world's goals and rewards as its file keeps them: empty parts go (an untouched world saves what it had); a step keeps
// its condition even when empty (the tab says it can't work yet), and its other ways only when they say something.
function tidyGoals(w: WorldDef) {
    const blank = (o: any, keys: string[]) => { for (const k of keys) if (o[k] === '' || o[k] === undefined || o[k] === false || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; };
    const g = w.goals as any;
    if (g) {
        blank(g, ['off', 'add']); if (g.names && !Object.keys(g.names).length) delete g.names;
        for (const x of g.add ?? []) {
            blank(x, ['icon', 'desc', 'starts', 'needs', 'adult', 'offer']);
            for (const st of x.steps ?? []) {
                if (typeof st.when !== 'string') st.when = '';
                if (Array.isArray(st.or)) st.or = st.or.filter((v: unknown) => typeof v === 'string' && v.trim());
                blank(st, ['or']);
                if (st.reward) { blank(st.reward, Object.keys(st.reward)); if (!Object.keys(st.reward).length) delete st.reward; }
            }
            if (x.perk) blank(x.perk, ['desc']);
        }
        if (!Object.keys(g).length) delete w.goals;
    }
    const r = w.rewards as any;
    if (r) {
        blank(r, ['off', 'add']); for (const k of ['names', 'prices']) if (r[k] && !Object.keys(r[k]).length) delete r[k];
        for (const x of r.add ?? []) {
            blank(x, ['icon', 'desc', 'roles', 'needs', 'when', 'adult']);
            if (x.limit) { blank(x.limit, ['person']); if (!Object.keys(x.limit).length) delete x.limit; }
        }
        if (!Object.keys(r).length) delete w.rewards;
    }
}

const TARGETS = (w: WorldDef): [string, string][] => [['home', 'Home'], ['work', 'Work'], ['leisure', 'Free time'], ...placeOpts(w)];
function routineEditor(w: WorldDef) {
    const ids = Object.keys(w.cast.routineTemplates);
    if (!ids.includes(CW.sel.routine)) CW.sel.routine = ids[0] ?? '';
    const id = CW.sel.routine; const r = w.cast.routineTemplates[id];
    const days = (k: 'weekday' | 'weekend', label: string) => `<h4>${label}</h4>${r[k].map((_s, j) => `<div class="mu-row mu-cw-inline">
        ${num('From hour', `cast.routineTemplates.${id}.${k}.${j}.0`, 0)}${sel('Goes to', `cast.routineTemplates.${id}.${k}.${j}.1`, TARGETS(w))}
        <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="cast.routineTemplates.${id}.${k}.${j}">${icon('x')}</button></div>`).join('')}
        <button class="mu-ghost" data-act="cw-add" data-what="step" data-path="cast.routineTemplates.${id}.${k}">${icon('plus')}<span>Add a step</span></button>`;
    return `<section class="mu-cw-sec"><h4>Routines</h4><div class="mu-chips">${ids.map(x => `<button class="mu-chip ${x === id ? 'is-on' : ''}" data-act="cw-routine" data-id="${esc(x)}">${esc(x)}</button>`).join('')}
            <button class="mu-chip" data-act="cw-add" data-what="routine" title="New routine">${icon('plus')}</button><button class="mu-chip" data-act="cw-rnd-routine" title="New random routine">${icon('redo')}</button></div>
        ${r ? `${days('weekday', 'Weekdays')}${days('weekend', 'Weekends')}${ids.length > 1 ? `<button class="mu-ghost" data-act="cw-del" data-path="cast.routineTemplates.${id}">${icon('trash')}<span>Remove this routine</span></button>` : ''}` : ''}</section>`;
}
// One of a person's starting feelings (core/feel.ts) toward another of the world's people: levels each way ("As usual" /
// "The same" leave it unset), and Together (a couple, or "Used to be together": `was`).
const LEVELS = (none: string): [string, string][] => [['', none], ...[...FRIEND_TIERS].reverse().map(t => [t.id, t.name] as [string, string])];
const ROMANCE = (none: string): [string, string][] => [['', none], ...ROMANCE_TIERS.map(t => [t.id, t.name] as [string, string])];
const TOGETHER: [string, string][] = [['', 'Not a couple'], ['casual', 'Something casual'], ['dating', 'Dating'], ['engaged', 'Engaged'], ['married', 'Married'], ['ex', 'Used to be together']];
function feelRow(q: string, others: [string, string][], love: boolean): string {
    const f = getPath(q) ?? {}; const together = f.status ?? (f.was ? 'ex' : '');
    return `<div class="mu-cw-feel"><div class="mu-row mu-cw-inline">${sel('With', `${q}.to`, others)}
        ${love ? `<label class="mu-field"><span>Together</span><select data-input="cw-together" data-path="${esc(q)}">${TOGETHER.map(([v, l]) => `<option value="${v}" ${together === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
        <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${esc(q)}" title="Remove">${icon('x')}</button></div>
        <div class="mu-row2">${sel('Friendship', `${q}.f`, LEVELS('As usual'), 'opt')}${love ? sel('Romance', `${q}.r`, ROMANCE('As usual'), 'opt') : ''}</div>
        <div class="mu-row2">${sel('Their friendship back', `${q}.back`, LEVELS('The same'), 'opt')}${love ? sel('Their romance back', `${q}.rback`, ROMANCE('The same'), 'opt') : ''}</div></div>`;
}
// The world's own people: a character card is made from each when a game of this world starts (or reused).
function peopleEditor(w: WorldDef) {
    const others = (e: { name: string }) => w.cast.examples.filter(x => x.name !== e.name).map(x => [x.name, x.name] as [string, string]);
    const love = systemOn(w, 'romance');
    const jobs: [string, string][] = [['', 'No job'], ...w.occupations.map(o => [o.id, o.name] as [string, string])];
    const routines = Object.keys(w.cast.routineTemplates).map(id => [id, id] as [string, string]);
    const spots = w.places.filter(p => !p.link).map(p => p.name).length;
    return `<section class="mu-cw-sec mu-cw-wide"><h4>People of this world</h4>
        <p class="mu-muted">Each becomes a character card when a game of this world starts. Their job, home and routine say where they are each hour.</p>
        ${master('people', 'cast.examples', e => `<b>${esc(e.name)}</b><small>${esc(w.occupations.find(o => o.id === e.occupation)?.name ?? 'No job')} · ${e.age}</small>`, i => {
            const p = `cast.examples.${i}`; const e = w.cast.examples[i];
            return `<div class="mu-row2">${txt('Name', `${p}.name`)}${num('Age', `${p}.age`, 18)}</div>
                ${personPanel('cw', String(i), ['gender'])}
                <div class="mu-row2">${sel('Job', `${p}.occupation`, jobs, 'nullable')}${sel('Lives in', `${p}.home`, zoneOpts(w))}</div>
                ${sel('Routine', `${p}.routine`, routines)}
                <h4>Goes out to (free time)</h4>${pairChips(w.places.filter(x => !x.link).map(x => [x.id, x.name] as [string, string]), `${p}.leisure`)}
                ${area('Description (who they are; becomes the card\'s description)', `${p}.description`, 5)}
                ${area('Personality (optional)', `${p}.personality`, 2)}
                ${area('First message (optional; the card\'s greeting)', `${p}.first_mes`, 3)}
                <h4>Family</h4><p class="mu-muted">Who ${esc(e.name)} is related to among the world's other people.</p>
                ${(e.ties ?? []).map((t, k) => `<div class="mu-row mu-cw-inline">${sel('Is', `${p}.ties.${k}.type`, TIE_TYPES.map(([id, l]) => [id, l] as [string, string]))}${sel('Of', `${p}.ties.${k}.to`, others(e))}
                    <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="${p}.ties.${k}" title="Remove">${icon('x')}</button></div>`).join('')}
                ${others(e).length ? `<button class="mu-ghost" data-act="cw-add" data-what="etie" data-i="${esc(i)}">${icon('plus')}<span>Add family</span></button>` : ''}
                <h4>How they start with others</h4><p class="mu-muted">From the start of every game: friendship${love ? ' and romance' : ''} each way ("As usual": where they would start anyway)${love ? ', a couple, or exes' : ''}.</p>
                ${(e.feelings ?? []).map((_f, k) => feelRow(`${p}.feelings.${k}`, others(e), love)).join('')}
                ${others(e).length ? `<button class="mu-ghost" data-act="cw-add" data-what="efeel" data-i="${esc(i)}">${icon('plus')}<span>Add a relation</span></button>` : ''}
                <h4>Their ways</h4><p class="mu-muted">Where every game of this world starts from (a card's own Mundi settings come first). Unset: the defaults.</p>
                ${personPanel('cw', String(i), ['attraction', 'pace', 'ways'])}
                <div class="mu-row"><button class="mu-ghost" data-act="cw-rnd-person" data-i="${esc(i)}">${icon('redo')}<span>New job, home and routine</span></button></div>
                ${spots ? '' : '<small class="mu-muted">Add places on the map first.</small>'}${e ? '' : ''}`;
        }, 'person', 'Nobody lives here yet.')}
        <button class="mu-ghost" data-act="cw-rnd-all">${icon('redo')}<span>Shuffle everyone's job, home and routine</span></button></section>`;
}
// (adult) The plain likes and hard limits people made in the game draw their intimate profiles from (a private overlay
// replaces each list with its own).
function poolEditor(w: WorldDef) {
    if (!systemOn(w, 'romance')) return '';
    return `<section class="mu-cw-sec"><h4>Likes and limits for new people ${ADULT}</h4><p class="mu-muted">People made in a game (residents, guests) draw an intimate profile from these: a few likes, a hard limit or two, who leads and their drive. Plain words, one per line. Empty: they have none.</p>
        ${lines('Likes (one per line)', 'intimatePool.prefs', 6, 'slow and tender')}${lines('Hard limits (one per line)', 'intimatePool.limits', 4, 'nothing in public')}</section>`;
}
// The genders people can have in this world (the AI is told the pronouns; the plural is for sentences like "attracted
// to women").
function gendersEditor(w: WorldDef) {
    return `<section class="mu-cw-sec"><h4>Genders</h4><p class="mu-muted">Everyone can have one of these (or none). Who people are attracted to is set per gender.</p>
        ${(w.genders ?? []).map((_x, k) => `<div class="mu-row mu-cw-inline">${txt('Name', `genders.${k}.name`, 'Woman')}${txt('Plural (for the AI)', `genders.${k}.plural`, 'women')}${txt('Pronouns', `genders.${k}.pronouns`, 'she/her')}
            <button class="mu-ghost mu-ibtn" data-act="cw-del" data-path="genders.${k}" title="Remove">${icon('x')}</button></div>`).join('') || '<p class="mu-muted">No genders: nobody has one, and attraction does nothing.</p>'}
        <button class="mu-ghost" data-act="cw-add" data-what="gender">${icon('plus')}<span>Add a gender</span></button></section>`;
}
function tabPeople(w: WorldDef) {
    return `<div class="mu-cw-grid">
        ${peopleEditor(w)}
        ${gendersEditor(w)}
        ${poolEditor(w)}
        ${routineEditor(w)}
    </div>`;
}
// An example person's own ways, edited with the shared panel (stored on the example; `attraction` in world.json).
SCOPES.cw = {
    get: (id) => { const e = CW.w?.cast.examples[Number(id)]; return e ? cleanPerson(e) : undefined; },
    set: (id, p) => {
        const e: any = CW.w?.cast.examples[Number(id)]; if (!e) return;
        for (const k of ['gender', 'attraction', 'pace', 'style', 'intimacy']) delete e[k];
        if (p?.gender) e.gender = p.gender;
        if (p?.att) e.attraction = p.att;
        if (p?.pace) e.pace = p.pace;
        if (p?.style) e.style = p.style;
        if (p?.intimacy) e.intimacy = p.intimacy;
        // (adult) the intimate profile (and the panel's role and drive) only when the panel changed it: one never touched stays
        // exactly as the file has it
        if (canon(cleanIntimate(e.intimate)) !== canon(p?.intimate)) { if (p?.intimate) e.intimate = p.intimate; else delete e.intimate; }
        CW.dirty = true;
    },
    genders: () => CW.w?.genders ?? [],
    romance: () => systemOn(CW.w, 'romance'),
    // a world's people carry their intimate profiles whatever a game's adult switch will say (it's marked adult)
    adult: () => true,
};

function tabLore(w: WorldDef) {
    return master('lore', 'lore', (l, k) => `<b>${esc((l.keys ?? []).join(', ') || `#${k + 1}`)}</b><small>${l.constant ? 'Always on' : ''}${l.id ? ` · ${esc(l.id)}` : ''}</small>`, i => {
        const p = `lore.${i}`;
        return `${csv('Keywords (comma separated)', `${p}.keys`, 'The entry is used when one of these comes up in the chat.')}${chk('Always on', `${p}.constant`)}
            ${optTxt('Id (optional)', `${p}.id`, 'tk_lore_hotel', 'A name a private overlay can replace this entry by: its entry with the same id is used instead of this one. Keep it once games may use the overlay.')}
            <h4>Only when… (optional: the entry switches on by itself when the world is like this)</h4>
            <div class="mu-row2">${sel('Weather', `${p}.when.weather`, [['', 'Any'], ['Sunny', 'Sunny'], ['Fair', 'Fair'], ['Partly cloudy', 'Partly cloudy'], ['Cloudy', 'Cloudy'], ['Rain', 'Rain']])}${sel('Part of the day', `${p}.when.period`, [['', 'Any'], ...w.time.periods.map(x => [x.name, x.name] as [string, string])])}</div>
            <div class="mu-row2">${sel('Place', `${p}.when.place`, [['', 'Anywhere'], ...placeOpts(w)])}${sel('Days', `${p}.when.weekend`, [['', 'Any day'], ['true', 'Weekends'], ['false', 'Weekdays']], 'tri')}</div>
            <div class="mu-row2">${sel('Region (map)', `${p}.when.region`, [['', 'Anywhere'], ...w.maps.map(m => [m.id, m.name] as [string, string])])}${sel('Season', `${p}.when.season`, [['', 'Any'], ['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']])}</div>
            <div class="mu-row2">${num('Tension above (0 … 100)', `${p}.when.tensionAbove`)}${num('Chance each day (0 … 1)', `${p}.when.chance`, 0, 0.05)}</div>
            <div class="mu-row2">${num('Public mood above (−100 … 100)', `${p}.when.moodAbove`, -100)}${num('Public mood below', `${p}.when.moodBelow`, -100)}</div>
            <div class="mu-row2">${num('From day', `${p}.when.fromDay`, 1)}${num('Until day', `${p}.when.toDay`, 1)}</div>
            ${chk('It is a rumor', `${p}.rumor`, 'Instead of telling the AI, people pass it around (from two people in its region, when the conditions hold); you may overhear it.')}
            ${area('Content', `${p}.content`, 8)}`;
    }, 'lore', 'No entries yet.') + `<p class="mu-muted">These entries, the setting and every place become the world's lorebook when a game starts.</p>`;
}

const AN_POS: [string, string][] = [['1', 'In the chat, at a depth'], ['0', 'After the story string'], ['2', 'Before the story string']];
function tabBooks(w: WorldDef) {
    const on = w.lorebooks ?? [];
    const books = lorebooks().sort((a, b) => Number(on.includes(b)) - Number(on.includes(a)) || a.localeCompare(b));
    return `<div class="mu-cw-grid">
        <section class="mu-cw-sec"><h4>Lorebooks of this world · ${on.length}</h4>
            <p class="mu-muted">SillyTavern lorebooks this world uses, like lorebooks linked to the game's group: they are switched on while you play one of its games (besides the lorebook Mundi writes from the Lore tab).</p>
            <div class="mu-wc-books">${books.map(n => `<label class="mu-check mu-wc-book ${on.includes(n) ? 'is-on' : ''}"><input type="checkbox" data-act="cw-book" data-name="${esc(n)}" ${on.includes(n) ? 'checked' : ''}><span data-notr>${esc(n)}</span></label>`).join('') || '<p class="mu-muted">You have no lorebooks yet.</p>'}</div></section>
        <section class="mu-cw-sec"><h4>Author's Note</h4>
            ${area('Every new game of this world starts with this note (you can change it in each save later, in the globe).', 'note.text', 6, 'Tone, pacing, what to focus on.')}
            <div class="mu-row2">${num('Every how many messages', 'note.interval', 0)}${num('Depth', 'note.depth', 0)}</div>
            ${sel('Position', 'note.position', AN_POS, 'num')}</section>
    </div>`;
}

/* ---------- random fill (jobs, routines, where people live and work) ---------- */

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T>(l: T[]): T | undefined => l[Math.floor(Math.random() * l.length)];
function randomRoutine(w: WorldDef): string {
    const id = `random${Object.keys(w.cast.routineTemplates).length + 1}`;
    const start = rnd(6, 11), end = Math.min(20, start + rnd(6, 9)), night = rnd(21, 23);
    w.cast.routineTemplates[id] = {
        weekday: [[0, 'home'], [start, 'work'], [end, 'leisure'], [night, 'home']],
        weekend: [[0, 'home'], [rnd(9, 12), 'leisure'], [rnd(15, 18), 'leisure'], [rnd(21, 23), 'home']],
    };
    return id;
}
function randomizeJob(w: WorldDef, o: WorldDef['occupations'][number]) {
    const hours = pick<[number, number]>([[7, 19], [8, 18], [9, 17], [10, 22], [6, 14], [14, 23]])!;
    o.hours = hours; o.shift = rnd(4, 8);
    const work = w.places.filter(p => !p.link && (p.tags ?? []).includes('work'));
    if (!o.place && work.length) o.place = pick(work)!.id;
    let pay = rnd(12, 30);
    o.ranks = o.ranks.map(r => { const x = { ...r, pay }; pay += rnd(4, 10); return x; });
    o.promote = o.ranks.slice(0, -1).map((_r, k) => rnd(3, 6) * (k + 1));
    const opts = traitOptions(w);
    o.likes = [...new Set([pick(opts), pick(opts)].filter(Boolean) as string[])];
}
function randomizePerson(w: WorldDef, e: WorldDef['cast']['examples'][number]) {
    e.occupation = Math.random() < 0.85 ? pick(w.occupations)?.id ?? null : null;
    e.home = pick(w.homes.zones)?.id ?? e.home;
    const tpls = Object.keys(w.cast.routineTemplates);
    e.routine = pick(tpls) ?? randomRoutine(w);
    const leisure = w.places.filter(p => !p.link && (p.tags ?? []).some(t => ['leisure', 'food', 'shop'].includes(t))).map(p => p.id);
    e.leisure = [...new Set([pick(leisure), pick(leisure), pick(leisure)].filter(Boolean) as string[])];
}

/* ---------- the screen ---------- */

// A new world: its style (what the game is like), then where it starts from: a ready world (a preset) to change, or nothing.
// Life-Sim / RPG / Custom, as three cards.
const modeCards = (on: GameMode, act: string) => `<div class="mu-heropick is-start mu-modes">${GAME_MODES.map(m => `<button class="mu-herocard ${m.id === on ? 'is-on' : ''} ${m.soon ? 'is-soon' : ''}" data-act="${esc(act)}" data-v="${esc(m.id)}" ${m.soon ? 'aria-disabled="true"' : ''}><b>${m.name}${m.soon ? ' <em class="mu-soon-tag">Soon</em>' : ''}</b><p>${m.desc}</p></button>`).join('')}</div>`;
const presetsOf = (style: string, scenario = false) => worlds().filter(w => !worldLocked(w) && isScenario(w) === scenario && (scenario || styleOf(w) === style)).sort((a, b) => Number(isCustom(a.id)) - Number(isCustom(b.id)));
function startPage(): string {
    const s = CW.start!;
    const st = STYLES.find(x => x.id === s.style) ?? STYLES[0];
    const presets = presetsOf(st.id, !!s.scenario);
    const base = getWorld(s.base);
    return `<div class="mu-settings mu-cw-new">
        <div class="mu-subhead"><button data-act="cw-start-cancel" data-sfx="back">← Back</button><h2>${s.scenario ? 'New Home' : 'New world'}</h2></div>
        <div class="mu-cw-new-body mu-panel"><div class="mu-cw-new-grid"><section class="mu-cw-new-a">
            <!-- world or scenario: already chosen on the New game screen -->
            <label class="mu-field mu-cw-new-name ${CW.nameMiss ? 'is-missing' : ''}"><span>Name of your ${s.scenario ? 'Home' : 'world'}</span><input data-input="cw-start-name" data-focus="cwname" value="${esc(s.name)}" placeholder="${s.scenario ? 'My Home' : 'My world'}">${CW.nameMiss ? `<small class="mu-miss-note">Give your ${s.scenario ? 'Home' : 'world'} a name first.</small>` : ''}</label>
            <h3>Style</h3>
            <p class="mu-muted">Every style has the same parts (needs, a device to talk to people, trades, homes, people with routines), dressed for its time. The style decides how they look and what they are called.</p>
            <div class="mu-styles">${STYLES.map(x => `<button class="mu-style ${x.id === st.id ? 'is-on' : ''} ${x.ready ? '' : 'is-soon'}" data-act="cw-start-style" data-id="${esc(x.id)}" ${x.ready ? '' : 'aria-disabled="true"'}>
                <b>${x.name}</b><small>${x.ready ? x.tagline : x.soon ?? 'Coming later.'}</small></button>`).join('')}</div>
            <section class="mu-panel mu-style-info"><h4>What this style brings</h4><ul>${st.changes.map(c => `<li>${c}</li>`).join('')}</ul></section></section>
            <section class="mu-cw-new-b">${s.scenario ? '<p class="mu-muted">A Home is always Life-Sim (realistic or fantasy), made for role-play: no work, money or courses.</p>' : `<h3>Game mode</h3>
            <p class="mu-muted">What the game is about. Any style works with any mode.</p>
            ${modeCards(s.game, 'cw-start-game')}`}
            <h3>Start from</h3>
            <p class="mu-muted">A preset is a ready world: you get a copy of it to change as you like (the original stays as it is).</p>
            <div class="mu-cards">${presets.map(w => `<button class="mu-worldcard ${s.mode === 'copy' && s.base === w.id ? 'is-on' : ''}" data-act="cw-start-preset" data-id="${esc(w.id)}">
                    <span class="mu-worldart" style="${w.cover ? `background-image:url('${worldFile(w, w.cover)}')` : ''}">${slidesHtml(w)}<span class="mu-style-tags"><em class="mu-style-tag is-${esc(styleOf(w))}">${esc(STYLES.find(x => x.id === styleOf(w))?.name ?? st.name)}</em>${toneTag(w)}</span></span>
                    <b data-notr>${esc(inWorld(w, w.name))}</b><small>${isCustom(w.id) ? 'Made by you' : 'Ready world'}</small><p data-notr>${esc(shortDesc(inWorld(w, w.description)))}</p></button>`).join('')}
                <div class="mu-cw-startnew"><button class="mu-worldcard is-new ${s.mode === 'empty' ? 'is-on' : ''}" data-act="cw-start-empty"><span class="mu-worldart">${icon('map')}</span><b>Start from nothing</b><small>Only the ${esc(st.name)} rules</small><p>Needs, things to do, the device and the character sheet of this style; you draw the maps, places and people.</p></button>
                <button class="mu-worldcard is-new is-later" aria-disabled="true"><span class="mu-worldart">${icon('book')}</span><b>From lorebooks</b><small>Coming soon</small><p>Your AI reads lorebooks you choose and builds the world from them.</p></button></div></div></section></div>
            <div class="mu-row mu-cw-new-go"><span class="mu-muted">${s.mode === 'copy' ? `A copy of ${esc(base?.name ?? '')}` : `An empty ${esc(st.name)} world`}</span>
                <button class="mu-primary mu-big ${s.name.trim() ? '' : 'is-dim'}" data-act="cw-start-go" ${base ? '' : 'aria-disabled="true"'}>${s.scenario ? 'Create the Home' : 'Create the world'} ▶</button></div>
        </div></div>`;
}

export function creatorHtml(): string {
    if (CW.start && !CW.w) return startPage();
    const w = CW.w; if (!w) return '';
    const body = CW.tab === 'general' ? tabGeneral(w) : CW.tab === 'features' ? tabFeatures(w) : CW.tab === 'needs' ? tabNeeds(w) : CW.tab === 'maps' ? (isScenario(w) ? houseMapsHtml(w) : mapEditorHtml(w))
        : CW.tab === 'homes' ? tabHomes(w) : CW.tab === 'actions' ? tabActions(w) : CW.tab === 'jobs' ? tabJobs(w) : CW.tab === 'goals' ? tabGoals(w) : CW.tab === 'courses' ? tabCourses(w) : CW.tab === 'shop' ? tabShop(w) : CW.tab === 'words' ? tabWords(w) : CW.tab === 'character' ? tabCharacter(w) : CW.tab === 'rpg' ? tabRpg(w) : CW.tab === 'customs' ? tabCustoms(w) : CW.tab === 'realm' ? tabRealm(w) : CW.tab === 'economy' ? tabEconomy(w)
        : CW.tab === 'people' ? tabPeople(w) : CW.tab === 'books' ? tabBooks(w) : tabLore(w);
    return `<div class="mu-settings mu-creator-ed">
        <div class="mu-subhead"><button data-act="cw-close" data-sfx="back">← Back</button><h2>${isScenario(w) ? 'Home creator' : 'World creator'}</h2><small data-notr>${esc(w.name)}${CW.dirty ? ' •' : ''}</small>
</div>
        <div class="mu-settings-layout mu-cw-layout">
            <nav class="mu-tabs">${TABS.filter(([id]) => !(RPG_LOCKED && id === 'rpg')).filter(([id]) => CW.allTabs || !isScenario(W()) || !SCENARIO_HIDES.includes(id)).map(([id, l]) => `<button class="${CW.tab === id ? 'is-on' : ''}" data-act="cw-tab" data-tab="${esc(id)}">${l}</button>`).join('')}</nav>
            <div class="mu-settings-body mu-panel ${CW.tab === 'maps' ? 'is-maps' : ''}" data-keep="cw-body">${body}</div>
        </div>
        <div class="mu-row mu-cw-new-go mu-cw-foot">
            ${CW.confirmDel ? `<span class="mu-warn">Delete "${esc(w.name)}"? This cannot be undone.</span><button data-act="cw-delete-no">Cancel</button><button class="mu-danger" data-act="cw-delete-yes">${icon('trash')}<span>Delete</span></button>`
            : `<button class="mu-danger" data-act="cw-delete" title="Delete this ${isScenario(w) ? 'Home' : 'world'}">${icon('trash')}<span>Delete</span></button>
               <button class="mu-ghost" data-act="cw-dup" title="Make a copy of it">${icon('copy')}<span>Duplicate</span></button>
               <button class="mu-ghost" data-act="cw-export" title="Export to a file">${icon('upload')}<span>Export</span></button>
               <span class="mu-grow"></span>${CW.dirty ? '<span class="mu-muted">Not saved</span>' : ''}
               <button class="mu-primary mu-big" data-act="cw-save" ${CW.saving ? 'disabled' : ''}>${icon('save')}<span>${CW.saving ? 'Saving…' : 'Save'}</span></button>`}</div>
        ${CW.leaveAsk ? leaveHtml('cw') : ''}</div>`;
}

/* ---------- opening ---------- */

let backTo = 'newgame';
export function openCreatorNew(style = 'modern', scenario = false) {
    if (!STYLES.find(x => x.id === style)?.ready) style = 'modern';
    backTo = state.view; CW.w = null; CW.confirmDel = false; CW.leaveAsk = false; CW.dirty = false;
    CW.nameMiss = false; CW.start = { name: '', style, base: presetsOf(style, scenario)[0]?.id ?? 'modern', mode: 'copy', game: 'lifesim', scenario };
    state.view = 'creator' as any; notify();
}
export function openCreatorEdit(id: string) {
    const w = getWorld(id); if (!w) return;
    backTo = state.view; CW.w = structuredClone(w); CW.w.base = w.base; CW.tab = 'general'; CW.dirty = false; CW.confirmDel = false; CW.leaveAsk = false; CW.start = null;
    state.view = 'creator' as any; notify();
}
// Leaving with changes not saved: save them, leave without them, or stay.
export const leaveHtml = (k: string) => `<div class="mu-dlg-veil" data-act="${k}-leave-stay"><div class="mu-dlg mu-panel mu-leave" role="dialog" data-act="lib-stay">
    <h3>Unsaved changes</h3><p>You have changes that are not saved. Leave anyway?</p>
    <div class="mu-row mu-dlg-btns"><button data-act="${k}-leave-stay">Stay</button><button class="mu-danger" data-act="${k}-leave-go">Leave without saving</button><button class="mu-primary" data-act="${k}-leave-save">${icon('save')}<span>Save and leave</span></button></div></div></div>`;
function close() { CW.leaveAsk = false; CW.confirmDel = false; CW.dirty = false; CW.w = null; CW.start = null; state.view = (backTo === 'creator' ? 'newgame' : backTo) as any; notify(); }

const NEW: Record<string, () => [string, any]> = {
    rattr: () => ['rpg.attributes', { id: newId('attr'), name: 'New attribute', short: 'NEW' }],
    rskill: () => ['rpg.skills', { id: newId('skill'), name: 'New skill', attr: W().rpg?.attributes[0]?.id ?? 'str' }],
    rclass: () => ['rpg.classes', { id: newId('class'), name: 'New class', hit: 8, key: W().rpg?.attributes[0]?.id ?? 'str', skills: [], subAt: 3, subclasses: [] }],
    rschool: () => ['rpg.schools', { id: newId('school'), name: 'New school' }],
    rspell: () => ['rpg.spells', { id: newId('spell'), name: 'New spell', school: W().rpg?.schools[0]?.id ?? '', level: 1, cost: 1, desc: '', effect: { kind: 'scene' } }],
    rtitle: () => ['rpg.titles', { id: newId('title'), name: 'the New', desc: '', when: { level: 5 } }],
    good: () => ['goods', { id: newId('good'), name: 'New good', icon: '📦', price: 10, kind: 'goods' }],
    crop: () => ['crops', { id: newId('crop'), name: 'New crop', icon: '🌱', days: 3, seed: 3, good: W().goods?.[0]?.id ?? '', yield: 3 }],
    biz: () => ['businesses', { id: newId('biz'), name: 'New business', icon: '🏪', cost: 300, profit: 15, staff: 2, tags: ['shop'] }],
    sky: () => ['skies.events', { id: newId('sky'), name: 'New event', every: 30, days: 1, effect: 'omen' }],
    hazard: () => ['skies.hazards', { id: newId('hz'), name: 'New hazard', climate: 'temperate', chance: 0.1 }],
    god: () => ['realm.pantheon', { id: newId('god'), name: 'New god', domain: '' }],
    faction: () => ['factions', { id: newId('fac'), name: 'New faction', kind: 'guild', ranks: ['Member', 'Officer', 'Leader'], quota: 1 }],
    inst: () => ['institutions', { id: newId('school'), name: 'New school', place: W().places.find(p => !p.link)?.id ?? '', ranks: ['Student', 'Prefect', 'Teacher', 'Head'], tuition: 10, examEvery: 7 }],
    rtal: () => ['rpg.talents', { id: newId('talent'), name: 'New talent', tier: 1, effect: { kind: 'hp', amount: 5 } }],
    habit: () => ['habits', { id: newId('habit'), name: 'New habit', trait: 'New trait', actions: [], count: 5, days: 7 }],
    festival: () => ['festivals', { id: newId('fest'), name: 'New festival', season: 'spring', day: 1, days: 1, mood: 15 }],
    cevent: () => ['cityEvents', { id: newId('event'), name: 'New event', icon: '🎉', place: W().places.find(p => !p.link)?.id ?? '', weekday: 5, every: 1, from: 18, hours: 3, mood: 12 }],
    hobby: () => ['hobbies', { id: newId('hobby'), name: 'New hobby', icon: '⭐', actions: [] }],
    recipe: () => ['recipes', { id: newId('recipe'), name: 'New recipe', needs: {}, makes: W().goods?.[0]?.id ?? '' }],
    tower: () => ['towers', { id: newId('tower'), name: 'New tower', place: W().places.find(p => !p.link)?.id ?? '', floors: 20 }],
    blade: () => ['blades', { id: newId('blade'), name: 'New blade', personality: '', likes: 'fights', bonus: 1 }],
    pet: () => ['pets', { id: newId('pet'), name: 'New animal', icon: '🐾', price: 50, mood: 3 }],
    rfoe: () => ['rpg.bestiary', { id: newId('foe'), name: 'New foe', level: 1, hp: 10, ac: 12, atk: 3, dice: 1, sides: 6, bonus: 1, row: 'front', tags: ['road'], desc: '' }],
    item: () => ['catalogs.shop', { id: newId('item'), name: 'New item', desc: '', icon: '🎁', price: 100 }],
    breakable: () => ['homes.breakables', { id: newId('thing'), name: 'the new thing', blocks: [] }],
    course: () => ['catalogs.courses', { id: newId('course'), name: 'New course', area: 'General', days: 3, cost: 100, grants: [], icon: '📚', desc: '' }],
    expense: () => ['homes.expenses', { id: newId('expense'), name: 'New expense', icon: 'wallet', blocks: [] }],
    need: () => ['statuses', { id: newId('need'), name: 'New need', icon: '⭐', color: '#4fb0ff', start: 80, max: 100, hud: true, decay: { amount: 1, everyMinutes: 60, awakeOnly: true } }],
    action: () => ['actions', { id: newId('act'), name: 'Thing', label: 'Do something', icon: '✨', cost: 0, minutes: 30, tags: ['leisure'], effects: {} }],
    job: () => ['occupations', { id: newId('job'), name: 'New job', place: W().places.find(p => !p.link)?.id ?? '', shift: 6, hours: [8, 18], cost: { energy: 25 }, ranks: [{ name: 'Junior', pay: 15 }, { name: 'Senior', pay: 22 }], promote: [6], likes: [], needs: [] }],
    zone: () => ['homes.zones', { id: newId('zone'), name: 'New area', map: W().maps[0]?.id ?? '', kind: Object.keys(W().homes.kinds)[0] ?? 'apartment', rent: 300, desc: '', spots: [] }],
    origin: () => ['catalogs.origins', { id: newId('origin'), name: 'New origin', desc: '', money: 1000, knows: 0 }],
    gender: () => ['genders', { id: newId('gender'), name: 'New gender', plural: '', pronouns: '' }],
    person: () => ['cast.examples', { name: 'New person', age: 25, occupation: null, home: W().homes.zones[0]?.id ?? '', routine: Object.keys(W().cast.routineTemplates)[0] ?? '', leisure: [], description: '', first_mes: '', personality: '' }],
    lore: () => ['lore', { keys: [], content: '', constant: false }],
    period: () => ['time.periods', { id: newId('p'), name: 'New period', from: 720 }],
    look: () => ['sheet.appearance', { id: newId('look'), label: 'New trait', options: [] }],
    trait: () => ['sheet.traits', { id: newId('trait'), label: 'New group', max: 2, options: [] }],
    skill: () => ['skills', { id: newId('skill'), name: 'New skill', icon: '🎯' }],
    goal: () => ['goals.add', { id: newId('goal'), name: 'New goal', icon: '⭐', category: 'social', desc: '', steps: [{ name: 'Step 1', when: '' }], perk: { name: 'New perk', desc: '', effects: [{ kind: 'learn', value: 0.1 }] } }],
    reward: () => ['rewards.add', { id: newId('reward'), name: 'New reward', icon: '🎁', desc: '', price: 200, kind: 'boost', effects: [{ kind: 'roll', value: 1 }], days: 1, limit: { per: 'day' } }],
};
const listKey: Record<string, string> = { 'rpg.attributes': 'rattr', 'rpg.skills': 'rskill', 'rpg.classes': 'rclass', 'rpg.schools': 'rschool', 'rpg.spells': 'rspell', 'rpg.titles': 'rtitle', 'rpg.bestiary': 'rfoe', habits: 'habit', festivals: 'festival', cityEvents: 'cevent', hobbies: 'hobby', pets: 'pet', 'realm.pantheon': 'god', factions: 'faction', institutions: 'inst', 'rpg.talents': 'rtal', goods: 'good', recipes: 'recipe', towers: 'tower', blades: 'blade', crops: 'crop', businesses: 'biz', 'skies.events': 'sky', 'skies.hazards': 'hazard', 'catalogs.shop': 'shop', 'homes.breakables': 'breakables', 'catalogs.courses': 'courses', 'homes.expenses': 'expenses', statuses: 'needs', actions: 'actions', occupations: 'jobs', 'homes.zones': 'zones', 'catalogs.origins': 'origins', 'cast.examples': 'people', lore: 'lore', 'goals.add': 'goal', 'rewards.add': 'reward', skills: 'skill' };

Object.assign(ACT, {
    'cw-rpg-preset': (el) => { W().rpg = structuredClone(el.dataset.v === 'modern' ? MODERN_RPG : el.dataset.v === 'powers' ? POWERS_RPG : MEDIEVAL_RPG); CW.dirty = true; notify(); },
    'cw-rpg-empty': () => { W().rpg = { attributes: [], hpAttr: '', skills: [], classes: [], xp: [100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 6600], schools: [], spells: [], titles: [] }; CW.dirty = true; notify(); },
});
Object.assign(ACT, {
    'cw-start-style': (el) => {
        const st = STYLES.find(x => x.id === el.dataset.id); if (!st?.ready || !CW.start) return;
        const p = presetsOf(st.id, !!CW.start.scenario)[0] ?? presetsOf(st.id)[0]; if (!p) return;
        Object.assign(CW.start, { style: st.id, base: p.id, mode: 'copy' }); setWorldDicts(p.id, p.i18n ?? {}); notify();
    },
    'cw-start-preset': (el) => { const w = getWorld(el.dataset.id!); if (!w || !CW.start) return; Object.assign(CW.start, { base: w.id, mode: 'copy' }); setWorldDicts(w.id, w.i18n ?? {}); notify(); },
    'cw-start-type': (el) => { const s = CW.start; if (!s) return; s.scenario = !!el.dataset.v; s.base = presetsOf(s.style, s.scenario)[0]?.id ?? s.base; s.mode = 'copy'; notify(); },
    'cw-start-game': (el) => { if (!CW.start || GAME_MODES.find(m => m.id === el.dataset.v)?.soon) return; CW.start.game = el.dataset.v as GameMode; notify(); },
    'cw-mode': (el) => { const w = CW.w; if (!w || GAME_MODES.find(m => m.id === el.dataset.v)?.soon) return; w.mode = el.dataset.v as GameMode; CW.dirty = true; notify(); },
    'cw-start-empty': () => { if (!CW.start) return; CW.start.mode = 'empty'; CW.start.base = presetsOf(CW.start.style, !!CW.start.scenario).find(w => !isCustom(w.id))?.id ?? CW.start.base; notify(); },
    'cw-start-cancel': () => close(),
    'cw-start-go': async () => {
        const s = CW.start!;
        // no name yet: point at the name field instead of doing nothing
        if (!s.name.trim()) { CW.nameMiss = true; notify(); setTimeout(() => { const i = document.querySelector<HTMLInputElement>('[data-input="cw-start-name"]'); i?.focus(); i?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 30); return; }
        try {
            CW.w = await busy('Creating the world', () => newWorldFrom(s.base, s.mode, s.name));
            CW.w.mode = s.scenario ? 'lifesim' : s.game;
            if (s.scenario && !CW.w.scenario) CW.w.scenario = { premise: '' };
            CW.start = null; CW.tab = 'general'; CW.dirty = true; CW.confirmDel = false;
            await saveDraft();
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'cw-dup': async () => {
        const w = CW.w; if (!w) return;
        if (CW.dirty) { toast('Save your changes first, then duplicate.', 'warn'); return; }
        try {
            const copy = await busy('Duplicating', () => newWorldFrom(w.id, 'copy', `${w.name} (copy)`));
            copy.mode = w.mode; copy.madeFor = w.madeFor;
            await saveWorld(forSaving(copy));
            CW.w = copy; CW.tab = 'general'; CW.dirty = false; CW.confirmDel = false;
            toast(`"${copy.name}" created. You are editing the copy now.`, 'success');
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'cw-close': () => { if (CW.dirty) { CW.leaveAsk = true; notify(); return; } close(); },
    'cw-leave-stay': (el, e) => { if (e && el.classList.contains('mu-dlg-veil') && e.target !== el) return; CW.leaveAsk = false; notify(); },
    'cw-leave-go': () => { CW.dirty = false; close(); },
    'cw-leave-save': async () => { CW.leaveAsk = false; await saveDraft(); if (!CW.dirty) close(); else notify(); },
    'cw-tab': (el) => { CW.tab = el.dataset.tab as Tab; notify(); },
    'cw-pick': (el) => { CW.sel[el.dataset.k!] = Number(el.dataset.i); notify(); },
    'cw-routine': (el) => { CW.sel.routine = el.dataset.id; notify(); },
    'cw-add': (el) => {
        const what = el.dataset.what!; const w = W();
        if (what === 'rank') { (getPath(el.dataset.path!) as any[]).push({ name: 'New rank', pay: 20 }); CW.dirty = true; notify(); return; }
        if (what === 'etie' || what === 'efeel') {
            const e = w.cast.examples[Number(el.dataset.i)]; const other = w.cast.examples.find(x => x.name !== e?.name); if (!e || !other) return;
            if (what === 'etie') (e.ties ??= []).push({ to: other.name, type: 'sibling' }); else (e.feelings ??= []).push({ to: other.name, f: 'friend' });
            CW.dirty = true; notify(); return;
        }
        if (what === 'rsub') { (getPath(el.dataset.path!) as any[]).push({ id: newId('sub'), name: 'New subclass', desc: '' }); CW.dirty = true; notify(); return; }
        if (what === 'boption') { (getPath(el.dataset.path!) as any[]).push({ id: newId('path'), name: 'New path', ranks: [{ name: 'New rank', pay: 30 }] }); CW.dirty = true; notify(); return; }
        if (what === 'branch') {
            const list = (getPath(el.dataset.path!) ?? (setPath(el.dataset.path!, []), getPath(el.dataset.path!))) as any[];
            const at = list.length ? Math.max(...list.map((b: any) => b.at)) + 3 : 3;
            list.push({ at, options: [{ id: newId('path'), name: 'Path A', ranks: [{ name: 'New rank', pay: 30 }] }, { id: newId('path'), name: 'Path B', ranks: [{ name: 'New rank', pay: 30 }] }] });
            CW.dirty = true; notify(); return;
        }
        if (what === 'step') { (getPath(el.dataset.path!) as any[]).push([12, 'leisure']); CW.dirty = true; notify(); return; }
        if (what === 'cskill') {
            const c = ((w.catalogs as any).courses ?? [])[Number(el.dataset.i)]; if (!c) return;
            const free = skillOpts(w).find(([id]) => !own(c.skills, id)); if (!free) return;
            (c.skills ??= {})[free[0]] = 3; CW.dirty = true; notify(); return;
        }
        if (what === 'aid') {
            const list = (getPath(el.dataset.path!) ?? (setPath(el.dataset.path!, []), getPath(el.dataset.path!))) as any[];
            list.push({ id: newId('aid'), name: 'New aid', kind: 'public', share: 0.2 }); CW.dirty = true; notify(); return;
        }
        if (what === 'routine') { const id = `routine${Object.keys(w.cast.routineTemplates).length + 1}`; w.cast.routineTemplates[id] = { weekday: [[0, 'home'], [9, 'work'], [18, 'leisure'], [22, 'home']], weekend: [[0, 'home'], [11, 'leisure'], [22, 'home']] }; CW.sel.routine = id; CW.dirty = true; notify(); return; }
        if (what === 'kind') { w.homes.kinds[newId('kind')] = { name: 'New kind', desc: '' }; CW.dirty = true; notify(); return; }
        // a goal's step (six at most), another way to do a step, a perk
        if (what === 'gstep' || what === 'gor') {
            const list = (getPath(el.dataset.path!) ?? (setPath(el.dataset.path!, []), getPath(el.dataset.path!))) as any[];
            if (what === 'gstep' && list.length >= 6) return;
            list.push(what === 'gstep' ? { name: `Step ${list.length + 1}`, when: '' } : ''); CW.dirty = true; notify(); return;
        }
        if (what === 'perk') { setPath(el.dataset.path!, { name: 'New perk', desc: '', effects: [{ kind: 'learn', value: 0.1 }] }); notify(); return; }
        // a key of a small map (a skill level to be hired, how someone feels after a choice): the next one not there yet
        if (what === 'mapkey') {
            const p = el.dataset.path!; const m = (getPath(p) ?? {}) as Record<string, number>;
            const keys = el.dataset.keys === 'skills' ? skillOpts(w).map(([id]) => id) : [...(el.dataset.keys === 'who' ? ['{who}'] : []), ...w.cast.examples.map(e => e.name)];
            const k = keys.find(x => !BAD_KEYS.includes(x) && own(m, x) === undefined); if (!k) return;
            setPath(p, { ...m, [k]: Number(el.dataset.v) || 3 }); notify(); return;
        }
        // work events, their choices, a failed roll's own result, a boost; a track's hiring conditions
        if (what === 'wevent') {
            const list = (getPath(el.dataset.path!) ?? (setPath(el.dataset.path!, []), getPath(el.dataset.path!))) as any[];
            list.push({ id: newId('ev'), setup: '', choices: [{ id: newId('c'), label: 'Choice A', text: '', perf: 1 }, { id: newId('c'), label: 'Choice B', text: '', perf: 0 }] });
            CW.sel.wev = `${el.dataset.path}.${list.length - 1}`; CW.dirty = true; notify(); return;
        }
        if (what === 'wchoice') {
            const list = getPath(el.dataset.path!) as any[]; if (!Array.isArray(list) || list.length >= 4) return;
            list.push({ ...(list.length && list.every(c => typeof c.id === 'string' && c.id) ? { id: newId('c') } : {}), label: `Choice ${String.fromCharCode(65 + list.length)}`, text: '', perf: 0 });
            CW.dirty = true; notify(); return;
        }
        if (what === 'wfail') { setPath(el.dataset.path!, { text: '' }); notify(); return; }
        if (what === 'wboost') { setPath(el.dataset.path!, { effects: [{ kind: 'pay', value: 0.1 }], days: 7 }); notify(); return; }
        if (what === 'hire') {
            const t = getPath(el.dataset.path!); if (!t) return;
            t.hire = t.hire === undefined ? '' : [...(Array.isArray(t.hire) ? t.hire : [t.hire]), ''];
            CW.dirty = true; notify(); return;
        }
        const [path, item] = NEW[what]();
        const list = (getPath(path) ?? (setPath(path, []), getPath(path))) as any[];
        list.push(item);
        if (listKey[path]) CW.sel[listKey[path]] = list.length - 1;
        CW.dirty = true; notify();
    },
    'cw-del': (el) => {
        const path = el.dataset.path!; const keys = path.split('.'); const last = keys.pop()!;
        const parent = getPath(keys.join('.'));
        if (Array.isArray(parent)) parent.splice(Number(last), 1); else if (parent) delete parent[last];
        CW.dirty = true; notify();
    },
    // a link between a course and a job or a skill (see tabCourses)
    'cw-crel': (el) => {
        const w = W(); const c = ((w.catalogs as any).courses ?? [])[Number(el.dataset.i)]; if (!c) return;
        const id = el.dataset.id!; const g: string[] = c.grants ?? [];
        const toggle = (l: string[], items: string[], on: boolean) => { const out = l.filter(x => !items.includes(x)); return on ? [...out, ...items] : out; };
        if (el.dataset.kind === 'req') { const o: any = w.occupations.find(x => x.id === id); if (!o) return; const l: string[] = o.courses ?? []; o.courses = l.includes(c.id) ? l.filter(x => x !== c.id) : [...l, c.id]; }
        else if (!g.length) return;
        else if (el.dataset.kind === 'job') { const o = w.occupations.find(x => x.id === id); if (!o) return; const on = !g.every(t => (o.likes ?? []).includes(t)); o.likes = toggle(o.likes ?? [], g, on); }
        else { const a = w.actions.find(x => x.id === id); if (!a?.roll) return; const on = !g.every(t => (a.roll!.traits ?? []).includes(t)); a.roll.traits = toggle(a.roll.traits ?? [], g, on); }
        CW.dirty = true; notify();
    },
    // a goal's step up or down
    'cw-move': (el) => {
        const l = getPath(el.dataset.path!); const i = Number(el.dataset.i), j = i + Number(el.dataset.d);
        if (!Array.isArray(l) || !(i >= 0 && i < l.length) || !(j >= 0 && j < l.length)) return;
        [l[i], l[j]] = [l[j], l[i]]; CW.dirty = true; notify();
    },
    // a perk's or a boost's effect (one or two)
    'cw-fx-add': (el) => {
        const p = el.dataset.path!; const l = (getPath(p) ?? (setPath(p, []), getPath(p))) as EffectDef[];
        if (l.length >= 2) return;
        l.push({ kind: 'learn', value: 0.1 }); CW.dirty = true; notify();
    },
    // the work event open below its list (another click closes it), the track shown
    'cw-wev': (el) => { CW.sel.wev = CW.sel.wev === el.dataset.k ? '' : el.dataset.k; notify(); },
    'cw-track': (el) => { CW.sel.track = el.dataset.id; notify(); },
    // one of a track's hiring conditions; one left stays a list of one (an emptied list goes)
    'cw-hire-del': (el) => {
        const t = getPath(el.dataset.path!); if (!t || t.hire === undefined) return;
        const l = (Array.isArray(t.hire) ? t.hire : [t.hire]).filter((_x: unknown, k: number) => k !== Number(el.dataset.k));
        if (l.length) t.hire = Array.isArray(t.hire) ? l : l[0]; else delete t.hire;
        CW.dirty = true; notify();
    },
    // what a step's quick-add row has picked, added to its objectives (or to one of its other ways)
    'cw-qa-add': (el) => {
        const k = el.dataset.k!; const made = quickMade(W(), k); if (!made) return;
        if (whenError(made)) { toast(`Can't add "${made}": ${whenError(made)}`, 'warn'); return; }
        const to = qaOf(k).to; const path = `${k}.${to.startsWith('or.') && typeof getPath(`${k}.${to}`) === 'string' ? to : 'when'}`;
        const cur = String(getPath(path) ?? '').trim();
        setPath(path, cur ? `${cur}; ${made}` : made); notify();
    },
    'cw-chip': (el) => {
        const l: string[] = getPath(el.dataset.path!) ?? []; const v = el.dataset.v!; const i = l.indexOf(v);
        i >= 0 ? l.splice(i, 1) : l.push(v);
        setPath(el.dataset.path!, l.length || !el.dataset.drop ? l : undefined); notify();
    },
    // what traits do (traitInfoEditor)
    'cw-tinfo': (el) => { CW.sel.tinfo = el.dataset.name ?? ''; notify(); },
    'cw-ti-add': (el) => { const info = infoOf(el.dataset.name!, true); if (!info) return; (info.effects ??= []).push({ kind: 'drain', ...(W().statuses[0] ? { target: W().statuses[0].id } : {}), value: -0.1 }); CW.dirty = true; notify(); },
    'cw-ti-del': (el) => { const info = infoOf(el.dataset.name!, true); if (!info?.effects) return; info.effects.splice(Number(el.dataset.j), 1); tidyInfo(info); CW.dirty = true; notify(); },
    'cw-ti-chip': (el) => {
        const info = infoOf(el.dataset.name!, true); if (!info) return; const v = el.dataset.v!;
        const l = (info.covers ??= {}).skills ?? []; info.covers.skills = l.includes(v) ? l.filter(x => x !== v) : [...l, v];
        tidyInfo(info); CW.dirty = true; notify();
    },
    // a standard name goes back to the engine's own; any other loses what it does
    'cw-ti-reset': (el) => {
        const n = el.dataset.name!; const w = W(); if (BAD_KEYS.includes(n) || !w.traitInfo) return;
        if (hasStd(n)) w.traitInfo[n] = structuredClone(STANDARD_TRAIT_INFO[n]); else delete w.traitInfo[n];
        CW.dirty = true; notify();
    },
    'cw-cover': async () => { const f = await pickFile('image/*'); if (!f) return; try { W().cover = await uploadWorldPicture(W(), f, 'cover'); CW.dirty = true; } catch (e: any) { toast(String(e?.message ?? e), 'error'); } notify(); },
    'cw-cover-map': () => { W().cover = W().maps[0]?.image; CW.dirty = true; notify(); },
    'cw-cover-room': (el) => { W().cover = el.dataset.file || undefined; CW.dirty = true; notify(); },
    'cw-cover-clear': () => { W().cover = undefined; CW.dirty = true; notify(); },
    'cw-kind-img': async (el) => {
        const f = await pickFile('image/*'); if (!f) return;
        const k = W().homes.kinds[el.dataset.id!], per = el.dataset.period;
        try { const url = await uploadWorldPicture(W(), f, `home-${el.dataset.id}${per ? `-${per}` : ''}`); if (per) (k.images ??= {})[per] = url; else k.image = url; CW.dirty = true; } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'cw-kind-img-clear': (el) => { const k = W().homes.kinds[el.dataset.id!]; if (!k?.images) return; delete k.images[el.dataset.period!]; if (!Object.keys(k.images).length) delete k.images; CW.dirty = true; notify(); },
    'cw-homes-map': (el) => { const z = W().homes.zones[Number(el.dataset.i)]; if (!z) return; CW.tab = 'maps'; ME.map = z.map || W().maps[0]?.id || ''; ME.mode = 'homes'; ME.zone = z.id; notify(); },
    'cw-rnd-all': () => { const w = W(); w.cast.examples.forEach(e => randomizePerson(w, e)); CW.dirty = true; toast('Everyone got a new job, home and routine.', 'success'); notify(); },
    'cw-rnd-person': (el) => { const w = W(); const e = w.cast.examples[Number(el.dataset.i)]; if (e) randomizePerson(w, e); CW.dirty = true; notify(); },
    'cw-rnd-routine': () => { CW.sel.routine = randomRoutine(W()); CW.dirty = true; notify(); },
    'cw-rnd-job': (el) => { const w = W(); const o = w.occupations[Number(el.dataset.i)]; if (o) randomizeJob(w, o); CW.dirty = true; notify(); },
    'cw-book': (el) => { const w = W(); const l = (w.lorebooks ??= []); const n = el.dataset.name!; const i = l.indexOf(n); i >= 0 ? l.splice(i, 1) : l.push(n); CW.dirty = true; notify(); },
    'cw-save': () => saveDraft(),
    'cw-export': async () => {
        const w = W();
        try {
            const blob = await busy('Exporting', () => exportWorld(forSaving(w)));
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${slug(w.name)}.mundi-world.json`; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
    },
    'cw-delete': () => { CW.confirmDel = true; notify(); },
    'cw-delete-no': () => { CW.confirmDel = false; notify(); },
    'cw-delete-yes': async () => { const id = W().id; await busy('Deleting', () => deleteWorld(id)); toast('World deleted. Games made with it can no longer be opened.', 'info'); CW.dirty = false; close(); },
});

async function saveDraft() {
    const w = CW.w; if (!w || CW.saving) return;
    CW.saving = true; notify();
    try {
        await saveWorld(forSaving(w)); CW.dirty = false;
        toast(...savedNote(w));
    }
    catch (e: any) { toast(String(e?.message ?? e), 'error'); }
    CW.saving = false; notify();
}

// Import: a world exported from Mundi (pictures included).
export async function importWorldFile() {
    const f = await pickFile('.json,application/json'); if (!f) return null;
    try { const w = await busy('Importing the world', async () => importWorld(await f.text())); toast(`“${w.name}” imported.`, 'success'); return w; }
    catch (e: any) { toast(String(e?.message ?? e), 'error'); return null; }
}

Object.assign(INPUT, {
    'cw-words-q': (el) => { WORDS.q = el.value; notify(); },
    // a starting feeling's Together: a couple's status, or the couple they used to be
    'cw-together': (el) => { const q = el.dataset.path!; setPath(`${q}.status`, undefined); setPath(`${q}.was`, undefined); if (el.value === 'ex') setPath(`${q}.was`, 'ex'); else if (el.value) setPath(`${q}.status`, el.value); notify(); },
    'cw-alltabs': (el) => { CW.allTabs = (el as HTMLInputElement).checked; notify(); },
    cw: (el) => {
        const t = el.dataset.type; const p = el.dataset.path!;
        let v: any = el.value;
        if (t === 'num') {
            v = el.value === '' || !Number.isFinite(Number(el.value)) ? undefined : Number(el.value);
            if (v !== undefined && el.dataset.clamp) { const [lo, hi] = el.dataset.clamp.split(',').map(Number); v = Math.max(lo, Math.min(hi, el.dataset.int ? Math.round(v) : v)); }
        }
        else if (t === 'bool') v = el.checked;
        else if (t === 'flag') v = el.checked ? true : undefined;
        else if (t === 'inherit') v = el.value === '*' ? undefined : el.value;
        else if (t === 'words') { const l = el.value.split(',').map((x: string) => x.trim()).filter(Boolean); v = l.length ? l : undefined; }
        else if (t === 'lines') { const l = el.value.split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean); setPath(p, l.length ? l : undefined); dirtyMark(); return; }
        else if (t === 'nbool') v = el.checked ? undefined : false;
        else if (t === 'tri') v = el.value === '' ? undefined : el.value === 'true';
        else if (t === 'nullable') v = el.value === '' ? null : el.value;   // a choice where empty means none (no job)
        else if (t === 'opt') v = el.value === '' ? undefined : el.value;   // a choice where empty means unset (removed)
        else if (p.includes('.when.') && el.value === '') v = undefined;
        else if (t === 'time') { const [h, m] = el.value.split(':').map(Number); v = (h || 0) * 60 + (m || 0); }
        else if (t === 'csv') v = el.value.split(',').map((x: string) => x.trim()).filter(Boolean);
        // switching a block on or off (decay, zero, rent)
        if (t === 'bool' && /(\.decay|\.zero|\.crisis|^rent)$/.test(p)) v = el.checked ? (p === 'rent' ? { everyDays: 7, text: 'Rent: {cost}.' } : p.endsWith('crisis') ? { after: 120, text: '', restore: 25 } : p.endsWith('decay') ? { amount: 1, everyMinutes: 60, awakeOnly: true } : { text: '', restore: 30 }) : undefined;
        // optional parts: empty removes them; picking one fills the rest
        if (/\.(socket\.slot|inflict\.kind)$/.test(p)) {
            const base = p.replace(/\.(slot|kind)$/, '');
            if (v === '') { setPath(base, undefined); notify(); return; }
            if (!getPath(base)) setPath(base, p.endsWith('slot') ? { slot: v, kind: v === 'armor' ? 'armor' : 'attack', amount: 1 } : { kind: v, chance: 0.3, turns: 3 });
        }
        if (/\.(element|combat)$/.test(p) && v === '') v = undefined;
        setPath(p, v);
        if (el.tagName !== 'INPUT' || ['checkbox', 'color', 'time'].includes(el.type)) notify();
        else { dirtyMark(); refreshNotes(); }
    },
    // a condition: kept as typed, and what can't be read is said under it (see cond)
    'cw-when': (el) => {
        const v = el.value.trim(); setPath(el.dataset.path!, v || undefined);
        const err = v && v !== el.dataset.ok ? whenError(v) : '';
        const s = el.parentElement?.querySelector('.mu-cw-err'); if (s) { s.textContent = err; s.hidden = !err; }
        dirtyMark();
    },
    // a skill a course teaches, changed for another (its level kept, its place in the list too)
    'cw-cskill': (el) => {
        const c = ((W().catalogs as any).courses ?? [])[Number(el.dataset.i)]; const from = el.dataset.from!, to = el.value;
        if (!c?.skills || !to || to === from || own(c.skills, to) !== undefined || BAD_KEYS.includes(to)) return;
        c.skills = Object.fromEntries(Object.entries(c.skills as Record<string, number>).map(([s, l]) => [s === from ? to : s, l]));
        CW.dirty = true; notify();
    },
    // a key of a small map changed for another (a skill to be hired, who feels something): its value and place kept
    'cw-rekey': (el) => {
        const p = el.dataset.path!; const m = getPath(p) as Record<string, number> | undefined; const from = el.dataset.from!, to = el.value;
        if (!m || !to || to === from || own(m, to) !== undefined || BAD_KEYS.includes(to) || own(m, from) === undefined) return;
        setPath(p, Object.fromEntries(Object.entries(m).map(([k, v]) => [k === from ? to : k, v]))); notify();
    },
    // a work choice's roll: none, one with no skill, or a skill's (its difficulty kept)
    'cw-roll': (el) => {
        const c = getPath(el.dataset.path!); if (!c) return; const v = el.value;
        if (v === ROLL_NONE) delete c.roll; else c.roll = { ...(v === ROLL_PLAIN ? {} : { skill: v }), dc: c.roll?.dc ?? 12 };
        CW.dirty = true; notify();
    },
    // an event that comes from a colleague (as Friend, at half the usual chance with an unnamed fallback), or not
    'cw-from': (el) => { setPath(el.dataset.path!, (el as HTMLInputElement).checked ? {} : undefined); notify(); },
    // a track for one of the world's genders: the job as written until something is set
    'cw-track-add': (el) => {
        const g = el.value; if (!g || BAD_KEYS.includes(g)) return;
        const m = (getPath(el.dataset.path!) ?? (setPath(el.dataset.path!, {}), getPath(el.dataset.path!))) as Record<string, any>;
        if (own(m, g)) return; m[g] = {}; CW.sel.track = g; CW.dirty = true; notify();
    },
    // a track's own ranks (a copy of the job's ranks, paths and promotions to start from), or the job's again
    'cw-track-ranks': (el) => {
        const t = getPath(el.dataset.path!), o = getPath(el.dataset.job!); if (!t || !o) return;
        if ((el as HTMLInputElement).checked) { t.ranks = structuredClone(o.ranks ?? []); if (o.promote) t.promote = structuredClone(o.promote); if (o.branches) t.branches = structuredClone(o.branches); }
        else { delete t.ranks; delete t.promote; delete t.branches; }
        CW.dirty = true; notify();
    },
    // a strengths group on or off (strengthsEditor)
    'cw-strengths': (el) => {
        const t = W().sheet.traits?.[Number(el.dataset.k)]; if (!t) return;
        if ((el as HTMLInputElement).checked) t.skills ??= {}; else { delete t.skills; delete t.formerly; }
        CW.dirty = true; notify();
    },
    // the skill an option starts ('' : none, it stays a trait); its level is kept when the skill changes
    'cw-strength': (el) => {
        const t = W().sheet.traits?.[Number(el.dataset.k)]; const n = el.dataset.name!, from = el.dataset.from ?? '', to = el.value;
        if (!t?.skills || BAD_KEYS.includes(n) || BAD_KEYS.includes(to)) return;
        const map = own(t.skills, n) ?? {}; const out: Record<string, number> = {};
        for (const [s, l] of Object.entries(map)) { if (s !== from) out[s] = l; else if (to && !(to in map)) out[to] = l; }
        if (!from && to) out[to] = 3;
        if (Object.keys(out).length) t.skills[n] = out; else delete t.skills[n];
        CW.dirty = true; notify();
    },
    'cw-strength-lv': (el) => {
        const t = W().sheet.traits?.[Number(el.dataset.k)]; const map = own(t?.skills, el.dataset.name!); const s = el.dataset.skill!;
        const lv = Number(el.value); if (!map || own(map, s) === undefined || el.value === '' || !Number.isFinite(lv)) return;
        map[s] = Math.max(1, Math.min(10, Math.round(lv))); CW.dirty = true; dirtyMark();
    },
    // a field of what a trait does (traitInfoEditor); values held inside a trait's bounds as they are typed
    'cw-ti': (el) => {
        const w = W(); const info = infoOf(el.dataset.name!, true); const f = el.dataset.f ?? ''; if (!info) return;
        const redraw = el.tagName === 'SELECT';
        if (f === 'desc') info.desc = el.value.trim() ? el.value : '';
        else if (f === 'covers.tags') (info.covers ??= {}).tags = el.value.split(',').map(x => x.trim()).filter(Boolean);
        else {
            const m = f.match(/^effects\.(\d+)\.(kind|target|value|when)$/); const e = m ? info.effects?.[Number(m[1])] : undefined; if (!m || !e) return;
            if (m[2] === 'kind') {
                if (!isEffectKind(el.value)) return;
                const was = pctOf(e.kind); e.kind = el.value;
                const opts = targetOpts(w, e.kind); if (!opts.some(([v]) => v === (e.target ?? ''))) { if (opts[0]?.[0]) e.target = opts[0][0]; else delete e.target; }
                if (pctOf(e.kind) !== was) e.value = (e.value < 0 ? -1 : 1) * (pctOf(e.kind) ? 0.1 : 1);
                Object.assign(e, clampEffect(e, TRAIT_LIMITS));
            } else if (m[2] === 'target') { if (el.value) e.target = el.value; else delete e.target; }
            else if (m[2] === 'value') {
                const x = Number(el.value); if (el.value === '' || !Number.isFinite(x)) return;
                const kept = clampEffect({ ...e, value: pctOf(e.kind) ? x / 100 : x }, TRAIT_LIMITS).value; e.value = kept;
                const shown = pctOf(e.kind) ? Math.round(kept * 1000) / 10 : kept; if (Number(el.value) !== shown) el.value = String(shown);
            } else {
                const v = el.value.trim(); if (v) e.when = v; else delete e.when;
                const err = v && v !== OUT_OF_WORK ? whenError(v) : '';
                const s = el.parentElement?.querySelector('.mu-cw-err'); if (s) { s.textContent = err; s.hidden = !err; }
            }
        }
        tidyInfo(info); CW.dirty = true;
        if (redraw) notify(); else dirtyMark();
    },
    // Goals & rewards: a general goal or reward offered or not (`off` lists the ones that aren't)
    'cw-off': (el) => {
        const p = el.dataset.path!, id = el.dataset.id!; if (BAD_KEYS.includes(id)) return;
        const l: string[] = ((getPath(p) ?? []) as string[]).filter(x => x !== id);
        if (!(el as HTMLInputElement).checked) l.push(id);
        setPath(p, l.length ? l : undefined); notify();
    },
    // a general goal's or reward's own name in this world; empty, or the game's own name, is the game's name again
    'cw-rename': (el) => {
        const p = el.dataset.path!; const [part, , id] = p.split('.'); if (!id || BAD_KEYS.includes(id)) return;
        const base = (part === 'goals' ? GENERAL_GOALS : GENERAL_REWARDS).find(x => x.id === id)?.name; const v = el.value.trim();
        setPath(p, v && v !== base ? v : undefined); dirtyMark();
    },
    // a general reward's price in this world; empty, or the game's own price, is the game's price again
    'cw-reprice': (el) => {
        const p = el.dataset.path!; const id = p.split('.')[2]; if (!id || BAD_KEYS.includes(id)) return;
        const x = Number(el.value), base = GENERAL_REWARDS.find(r => r.id === id)?.price;
        setPath(p, el.value === '' || !Number.isFinite(x) || Math.max(0, Math.round(x)) === base ? undefined : Math.max(0, Math.round(x))); dirtyMark();
    },
    // a step's way of being done: kept as typed (an empty one stays until removed), what can't be read said under it
    'cw-way': (el) => {
        const v = el.value.trim(); setPath(el.dataset.path!, v);
        const err = v ? whenError(v) : ''; const s = el.parentElement?.querySelector('.mu-cw-err'); if (s) { s.textContent = err; s.hidden = !err; }
        dirtyMark();
    },
    'cw-hold': (el) => { const p = el.dataset.path!; const cur = getPath(p); setPath(p, el.value === 'season' ? 'season' : el.value === 'days' ? (typeof cur === 'number' ? cur : 7) : undefined); notify(); },
    // a goal's category: one of the nine, or one of its own (typed in the field that shows then)
    'cw-gcat': (el) => { const p = el.dataset.path!; if (el.value) setPath(p, el.value); else if (GOAL_CATEGORIES.some(c => c.id === getPath(p))) setPath(p, 'other'); notify(); },
    'cw-qa': (el) => {
        const q = qaOf(el.dataset.k!); const f = el.dataset.f as 'kind' | 'what' | 'n' | 'extra' | 'to';
        if (f === 'n') q.n = Math.max(1, Math.round(Number(el.value) || 1)); else if (f in q) (q as any)[f] = el.value;
        if (f === 'kind') { q.what = ''; q.extra = ''; } if (f === 'what') q.extra = '';
        if (el.tagName === 'SELECT') notify();
        else { const c = el.closest?.('.mu-cw-quick')?.querySelector('code'); if (c) c.textContent = quickMade(W(), el.dataset.k!); }
    },
    // what a reward does: a boost gets an effect and days, a refill a need; the rest act once
    'cw-rkind': (el) => {
        const base = el.dataset.path!.replace(/\.kind$/, ''); const r = getPath(base) as RewardDef | undefined;
        if (!r || !(REWARD_KINDS as readonly string[]).includes(el.value)) return;
        r.kind = el.value;
        if (r.kind === 'boost') { if (!r.effects?.length) r.effects = [{ kind: 'learn', value: 0.1 }]; r.days ??= 1; } else { delete r.effects; delete r.days; }
        if (r.kind === 'refill') r.need ??= W().statuses.find(s => !s.rpg)?.id; else delete r.need;
        if (r.limit?.person && !(PERSON_KINDS as string[]).includes(r.kind)) delete r.limit.person;
        CW.dirty = true; notify();
    },
    'cw-rlimit': (el) => { const p = el.dataset.path!; if (el.value) setPath(p, el.value); else setPath(p.replace(/\.per$/, ''), undefined); notify(); },
    // a field of a perk's or a boost's effect, held inside its limits and its kind's range as it is typed (see fxEditor)
    'cw-fx': (el) => {
        const m = el.dataset.path!.match(/^(.*)\.(\d+)\.(kind|target|value|when)$/); if (!m) return;
        const list = getPath(m[1]); const e: EffectDef | undefined = Array.isArray(list) ? list[Number(m[2])] : undefined; if (!e) return;
        const lim = FX_LIMITS[el.dataset.lim ?? 'perk'] ?? PERK_LIMITS;
        if (m[3] === 'kind') {
            if (!isEffectKind(el.value)) return;
            const was = pctOf(e.kind); e.kind = el.value;
            const opts = targetOpts(W(), e.kind, '', true); if (!opts.some(([v]) => v === (e.target ?? ''))) { if (opts[0]?.[0]) e.target = opts[0][0]; else delete e.target; }
            if (pctOf(e.kind) !== was) e.value = (e.value < 0 ? -1 : 1) * (pctOf(e.kind) ? 0.1 : 1);
            Object.assign(e, holdEffect(e, lim));
        } else if (m[3] === 'target') { if (el.value) e.target = el.value; else delete e.target; }
        else if (m[3] === 'value') {
            const x = Number(el.value); if (el.value === '' || !Number.isFinite(x)) return;
            e.value = holdEffect({ ...e, value: pctOf(e.kind) ? x / 100 : x }, lim).value;
            const shown = pctOf(e.kind) ? Math.round(e.value * 1000) / 10 : e.value; if (Number(el.value) !== shown) el.value = String(shown);
        } else {
            const v = el.value.trim(); if (v) e.when = v; else delete e.when;
            const err = v ? whenError(v) : ''; const s = el.parentElement?.querySelector('.mu-cw-err'); if (s) { s.textContent = err; s.hidden = !err; }
        }
        CW.dirty = true;
        if (el.tagName === 'SELECT') notify(); else dirtyMark();
    },
    'cw-where': (el) => {
        const a = W().actions[Number(el.dataset.i)]; if (!a) return;
        delete a.anywhere; delete a.home; delete a.place;
        if (el.value === 'anywhere') { a.anywhere = true; a.tags = []; } else if (el.value === 'home') { a.home = true; a.tags = []; } else if (el.value === 'place') { a.place = W().places.find(p => !p.link)?.id; a.tags = []; } else a.tags ??= [];
        CW.dirty = true; notify();
    },
    'cw-start-name': (el) => { CW.start!.name = el.value; document.querySelector('[data-act="cw-start-go"]')?.classList.toggle('is-dim', !el.value.trim()); if (CW.nameMiss && el.value.trim()) { CW.nameMiss = false; el.closest('.mu-cw-new-name')?.classList.remove('is-missing'); el.parentElement?.querySelector('.mu-miss-note')?.remove(); } },
});
export const _tr = tr;
