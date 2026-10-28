// This world (the globe button, in game): the people who live here (job, home, routine), this save's notes,
// the lorebooks the world uses, and the world's rules. "Advanced" shows the finer settings.
import { castLevel, neighbors, NEIGHBORS_MIN, FRIEND_BOND } from '../sim/happenings.js';
import { bondOf } from '../sim/social.js';
import { state, notify, esc, game, toast, saveGame, cfg, type Save } from '../core/store.js';
import { DIFFICULTIES, difficultyOf } from '../sim/bills.js';
import { isCustom, getWorld, activeStatuses, gameMode, GAME_MODES, systemOn, isScenario, type WorldDef } from '../core/world.js';
import { dressHtml } from './dressui.js';
import { homeJobOf, SHIFTS, DAYS } from '../sim/hometime.js';
import './homeui.js';
import { ctx, thumb, characters, charOf, personaThumb, personaName, lorebooks, chatLore, bindChatLore, createLorebook, saveCardPerson } from '../st/bridge.js';
import { homeAddress, placeOf } from '../sim/places.js';
import { resident, homeSpot, takenHomes, syncScene, currentEntry } from '../sim/game.js';
import { social } from '../sim/social.js';
import { FRIEND_TIERS, ROMANCE_TIERS } from '../sim/romance.js';
import { familyBlocked, isMinor, kidOf } from '../sim/family.js';
import { tiesOf, removeTie, normalizeHomes, TIE_TYPES, type TieType } from '../sim/living.js';
import { addOldTie, pickLevel, friendLevelOf, romLevelOf } from '../sim/startfeel.js';
import { ROM_START, type FriendLevel, type RomLevel } from '../core/feel.js';
import { freeSpots } from '../sim/work.js';
import { refreshPrompt } from '../sim/prompt.js';
import { facts } from '../sim/facts.js';
import { factUi, stamp } from './journal.js';
import { applyGameLore } from '../sim/lore.js';
import { icon } from './icons.js';
import { weekday } from '../sim/time.js';
import { tabHouseholds } from './households.js';
import { houseRoomsHtml } from './newgame.js';
import { openCreatorEdit, CW as CREATOR } from './creator.js';
import { tabAiContext } from './aictx.js';
import { warningsBanner } from './warnings.js';
import { ACT, INPUT } from './reg.js';
import { talkFieldHtml } from './talkcolors.js';
import { ME } from '../sim/talkcolors.js';
import { playing } from '../sim/playas.js';
import { setMeter, meter, setStatus, statusOf, pastOf, forgetPast, seedFamily, COUPLE_ROMANCE, relOf, relCfg, idOf, YOU, type Meter, type Status } from '../sim/rel.js';
import { CURVES, HALF_LIFE } from '../sim/pace.js';
import { relNumbersHtml, relChangesHtml } from './reldebug.js';
import { personPanel, suggestHtml, SCOPES } from './personui.js';
import { gendersOf, cleanPerson } from '../sim/gender.js';

type Tab = 'people' | 'homes' | 'house' | 'save' | 'lore' | 'ai' | 'rules';
const TABS: [Tab, string][] = [['people', 'People'], ['homes', 'Households'], ['house', 'The house'], ['save', "Author's Note"], ['lore', 'Lorebooks'], ['ai', 'AI context'], ['rules', 'World']];
const WC = { tab: 'people' as Tab, adv: false, who: '', adding: false, q: '', lq: '', back: 'map' as string };

const opt = (v: string, label: string, sel: boolean) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
const sameRoutine = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- people ---------- */

function personForm(g: Save, w: WorldDef): string {
    if (WC.who === YOU) return youForm(g, w);
    const r = g.cast[WC.who];
    if (!r) return '<p class="mu-muted mu-pad">Choose someone on the left.</p>';
    const tpl = Object.entries(w.cast.routineTemplates).find(([, t]) => sameRoutine(t, r.routine))?.[0] ?? '';
    const leisure = w.places.filter(p => (p.tags ?? []).some(t => ['leisure', 'food', 'shop'].includes(t)));
    return `<header class="mu-wc-head"><img src="${esc(thumb(r.avatar))}" alt=""><div><h3 data-notr>${esc(r.name)}</h3><small>${esc(homeAddress(w, r.home))}</small></div></header>
        ${isScenario(w) ? (() => { const j = homeJobOf(r); const timed = !!SHIFTS.find(x => x.id === j.shift && x.from !== undefined);
            // Home: no ready-made jobs; write what they do, and when they are out for it (the bedroom is in the Bedrooms tab)
            return `<label class="mu-field"><span>What they do (optional)</span><input type="text" maxlength="60" placeholder="nurse, barista, student…" value="${esc(j.name ?? '')}" data-input="home-job" data-who="${esc(r.avatar)}" data-focus="wcjob"></label>
            <div class="mu-row2"><label class="mu-field"><span>When they are out for it</span><select data-input="home-shift" data-who="${esc(r.avatar)}">${SHIFTS.map(x => opt(x.id, x.name, x.id === (j.shift ?? ''))).join('')}</select></label>
                ${timed ? `<label class="mu-field"><span>Days</span><select data-input="home-days" data-who="${esc(r.avatar)}">${DAYS.map(([v, l]) => opt(v, l, (j.days ?? 'weekdays') === v)).join('')}</select></label>` : ''}</div>`; })()
        : `<label class="mu-field"><span>Job</span><select data-input="wc-job">${opt('', 'No job', !r.occupation)}${w.occupations.map(o => opt(o.id, `${o.name} · ${placeOf(g, w, o.place)?.name ?? ''}`, r.occupation === o.id)).join('')}</select></label>
        <label class="mu-field"><span>Lives in</span><select data-input="wc-zone">${w.homes.zones.map(z => opt(z.id, `${z.name} (${w.homes.kinds[z.kind]?.name ?? z.kind})`, r.home.zone === z.id)).join('')}</select></label>`}
        <label class="mu-check"><input type="checkbox" data-input="wc-met" ${r.met ? 'checked' : ''}><span>You know them<small>They show up by name, in People and in Messages.</small></span></label>
        ${talkFieldHtml(r.avatar)}
        ${personPanel('save', r.avatar, ['gender'])}
        ${tiesHtml(g, r.avatar)}
        ${pairHtml(g, w, r.avatar)}
        ${WC.adv ? `<h4 class="mu-lib-advhead">Advanced settings</h4>
            <label class="mu-field"><span>Daily routine</span><select data-input="wc-routine">${tpl ? '' : opt('', 'Custom', true)}${Object.keys(w.cast.routineTemplates).map(k => opt(k, k, tpl === k)).join('')}</select></label>
            <div class="mu-field"><span>Where they go in their free time</span><div class="mu-chips">${leisure.map(p => `<button class="mu-chip ${r.leisure.includes(p.id) ? 'is-on' : ''}" data-act="wc-leisure" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>
                <small class="mu-muted">None chosen: any leisure place.</small></div>
            ${personPanel('save', r.avatar, ['attraction', 'pace', 'ways'])}
            ${charOf(r.avatar) ? `<div class="mu-row"><button class="mu-ghost" data-act="wc-save-card">${icon('save')}<span>Save to card</span></button><small class="mu-muted">Their gender, attraction, pace and styles go to their card's Mundi settings, so new games with them start from these. Nothing else on the card changes.</small></div>` : ''}
            ${minorHtml(g, r.avatar)}
            <button class="mu-danger" data-act="wc-remove">${icon('trash')}<span>Remove from this world</span></button>
            <small class="mu-muted">Their card stays in SillyTavern; they just stop living here.</small>` : ''}
        ${relNumbersHtml(g, r.avatar)}${relChangesHtml(g, r.avatar)}`;
}

// You: your own gender (the others' attraction reads it) and, under Advanced, your attraction (it sorts the dating app).
function youForm(g: Save, w: WorldDef): string {
    return `<header class="mu-wc-head"><img src="${esc(personaThumb())}" alt=""><div><h3 data-notr>${esc(personaName())}</h3><small>You · ${esc(homeAddress(w, g.player.home))}</small></div></header>
        ${talkFieldHtml(playing(g) || ME)}
        ${personPanel('save', YOU, ['gender'])}
        ${WC.adv ? personPanel('save', YOU, ['attraction'], { you: true }) : '<p class="mu-muted">Turn on "Advanced" for who you are attracted to.</p>'}`;
}
// The People tab edits the save's own entries (the store's ids: the person you play is '__you').
SCOPES.save = {
    get: (id) => { const g = game(); return g ? relOf(g).people[idOf(g, id)] : undefined; },
    set: (id, p) => { const g = game(); if (!g) return; const people = relOf(g).people; const k = idOf(g, id); if (p) people[k] = p; else delete people[k]; saveGame(); refreshPrompt(); },
    genders: () => gendersOf(getWorld(game()?.world ?? '')),
    romance: () => systemOn(getWorld(game()?.world ?? ''), 'romance'),
    cards: () => { const g = game(); return g ? Object.values(g.cast).filter(r => idOf(g, r.avatar) !== YOU && charOf(r.avatar)).map(r => ({ id: r.avatar, avatar: r.avatar, name: r.name })) : []; },
};

// A minor is left out of every romance: a child born in the game, an age under 18 from the world, or this box.
function minorHtml(g: Save, avatar: string): string {
    const p = relOf(g).people[idOf(g, avatar)], fixed = !!kidOf(g, avatar) || (p?.age !== undefined && p.age < 18);
    return `<label class="mu-check"><input type="checkbox" data-input="wc-minor" ${isMinor(g, avatar) ? 'checked' : ''} ${fixed ? 'disabled' : ''}><span>A minor<small>${fixed && p?.age !== undefined ? `Age ${esc(p.age)}: never part of any romance.` : 'Never part of any romance.'}</small></span></label>`;
}
// How this person and someone else (you, by default) feel about each other: a level per direction for friendship and,
// where romance can be, for romance; whether they're a couple, or used to be. With you only their side is set: your
// own feelings are played. The exact values are sliders under Advanced.
const PAIR = { other: YOU as string };
function pairHtml(g: Save, w: WorldDef, a: string): string {
    if (idOf(g, a) === YOU) return '';
    const others = Object.values(g.cast).filter(x => x.avatar !== a && idOf(g, x.avatar) !== YOU).sort((x, y) => x.name.localeCompare(y.name));
    const b = PAIR.other === YOU || others.some(x => x.avatar === PAIR.other) ? PAIR.other : YOU;
    const you = b === YOU;
    const who = (x: string) => (x === YOU ? '<span>you</span>' : `<span data-notr>${esc(g.cast[x]?.name ?? x)}</span>`);   // names never translated
    const debug = !!relCfg(g).debug;
    const love = systemOn(w, 'romance') && !familyBlocked(g, a, b);
    const level = (x: string, y: string, m: Meter) => {
        const v = meter(g, m, x, y), cur = m === 'f' ? friendLevelOf(v) : romLevelOf(v);
        const tiers = m === 'f' ? [...FRIEND_TIERS].reverse() : ROMANCE_TIERS;
        return `<label class="mu-field"><span>${m === 'f' ? 'Friendship' : 'Romance'}</span><select data-input="wc-level" data-x="${esc(x)}" data-y="${esc(y)}" data-m="${m}">${tiers.map(t => opt(t.id, t.name, t.id === cur)).join('')}</select></label>`;
    };
    const side = (x: string, y: string) => `<div class="mu-feel-side"><b>${who(x)} → ${who(y)}</b><div class="mu-row2">${level(x, y, 'f')}${love ? level(x, y, 'r') : ''}</div></div>`;
    const slider = (x: string, y: string, m: Meter) => {
        const v = Math.round(meter(g, m, x, y));
        return `<label class="mu-field slider"><span>${who(x)} → ${who(y)} · ${m === 'f' ? 'Friendship' : 'Romance'} · <b>${v}</b>${debug ? ` · ${meter(g, m, x, y).toFixed(2)}` : ''}</span><input type="range" min="${m === 'f' ? -100 : 0}" max="100" value="${v}" data-input="wc-pair" data-x="${esc(x)}" data-y="${esc(y)}" data-m="${m}"></label>`;
    };
    const st = statusOf(g, a, b) ?? '';
    const pairs: [string, string][] = you ? [[a, b]] : [[a, b], [b, a]];
    return `<section class="mu-ties mu-wc-pair"><h4>Feelings</h4>
        <label class="mu-field"><span>With</span><select data-input="wc-pair-who">${opt(YOU, 'You', you)}${others.map(x => opt(x.avatar, x.name, x.avatar === b)).join('')}</select></label>
        ${pairs.map(([x, y]) => side(x, y)).join('')}
        ${love ? `<label class="mu-field"><span>Together</span><select data-input="wc-pair-status" data-b="${esc(b)}">${[['', 'Not a couple'], ['casual', 'Something casual'], ['dating', 'Dating'], ['engaged', 'Engaged'], ['married', 'Married']].map(([v, l]) => opt(v, l, st === v)).join('')}</select></label>` : ''}
        ${pastHtml(g, a, b)}
        ${WC.adv ? pairs.flatMap(([x, y]) => [slider(x, y, 'f'), ...(love ? [slider(x, y, 'r')] : [])]).join('') : ''}
    </section>`;
}

// The couple two people used to be, with a way to forget it (set by mistake, or a story that went another way).
const PAST_UI: Record<string, string> = { casual: 'Something casual', dating: 'Dating', engaged: 'Engaged', married: 'Married' };
function pastHtml(g: Save, a: string, b: string): string {
    const p = pastOf(g, a, b); if (!p) return '';
    return `<div class="mu-row"><small class="mu-muted">Used to be: ${PAST_UI[p.status ?? ''] ?? 'A couple'}, until day ${esc(p.until)}</small><button class="mu-ghost" data-act="wc-past-forget" data-b="${esc(b)}">Forget</button></div>`;
}

// Relationships, per save: open relationships, and (Advanced) how fast feelings grow and the debug view.
function relSection(g: Save, w: WorldDef): string {
    const c = cfg(g); const rc = relCfg(g);
    const sl = (label: string, k: string, v: number, min: number, max: number, step: number, unit: string) =>
        `<label class="mu-field slider"><span>${label} · ${v}${unit}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-input="wc-rel" data-k="${k}"></label>`;
    const E = (m: Meter) => rc.pace?.[m]?.E ?? CURVES[m].E, H = (m: Meter) => rc.pace?.[m]?.H ?? CURVES[m].H;
    return `<section class="mu-wc-sec"><h4>Relationships</h4>
        ${systemOn(w, 'romance') ? `<label class="mu-check"><input type="checkbox" data-input="wc-poly" ${c.poly ? 'checked' : ''}><span>Open relationships (polyamory)<small>No jealousy: you can date several people at once, freely, and everyone knows. Off: a new romance hurts the partners you already have.</small></span></label>` : ''}
        <label class="mu-check"><input type="checkbox" data-input="wc-rel-verdict" ${rc.verdict !== false ? 'checked' : ''}><span>Judge each scene when it ends<small>When you leave, sleep, skip time or someone you talked with leaves, the AI reads the scene and says how it changed what each person feels about you (one short AI call per scene). Off: only talking, warm replies and the game's own events move relationships.</small></span></label>
        <label class="mu-field"><span>Characters take the initiative</span><select data-input="wc-rel-init">${opt('off', 'Off', rc.initiative === 'off')}${opt('rarely', 'Rarely', rc.initiative === 'rarely')}${opt('', 'Normal (default)', !rc.initiative || rc.initiative === 'normal')}${opt('often', 'Often', rc.initiative === 'often')}</select>
            <small class="mu-muted">People open up, confess, ask you out, text you, warn you before they leave and hold grudges on their own. Normal: at most one thing they start on their own a day, and every few days per person. Off: none of it.</small></label>
        ${systemOn(w, 'relations') && rc.initiative !== 'off' ? `<label class="mu-check"><input type="checkbox" data-input="wc-rel-spread" ${rc.spread !== false ? 'checked' : ''}><span>Opinions spread through friends<small>Someone who adores you, or can't stand you, talks about you to their close friends, and slowly colors what they think of you (never worse than wary, by talk alone).</small></span></label>` : ''}
        ${isScenario(w) ? '' : `<label class="mu-field"><span>When you stop playing someone ("Play as"), their feelings</span><select data-input="wc-rel-playas">${opt('', 'follow how everyone now feels about them', rc.playAs !== 'keep')}${opt('keep', 'stay as they were', rc.playAs === 'keep')}</select>
            <small class="mu-muted">While you play someone, their own feelings wait. When you leave them, they can feel about each person what that person came to feel about them, or carry on from where they were.</small></label>`}
        ${WC.adv ? `<p class="mu-muted">How fast feelings grow. The first points with someone come at full speed; after that each gain counts a little less, and the pace comes back over the next hours. Nothing ever stops completely.</p>
            ${sl('Friendship: points at full speed', 'f.E', E('f'), 1, 20, 1, '')}
            ${sl('Friendship: points more until half speed', 'f.H', H('f'), 1, 20, 1, '')}
            ${systemOn(w, 'romance') ? `${sl('Romance: points at full speed', 'r.E', E('r'), 1, 20, 1, '')}
            ${sl('Romance: points more until half speed', 'r.H', H('r'), 1, 20, 1, '')}` : ''}
            ${systemOn(w, 'romance') ? sl('Romance fades without contact (× normal; 0 = never)', 'fade', rc.fade ?? 1, 0, 3, 0.5, '×') : ''}
            ${sl('The pace comes back by half in', 'halfLife', Math.round((rc.halfLife ?? HALF_LIFE) / 60), 1, 24, 1, ' h')}
            <label class="mu-check"><input type="checkbox" data-input="wc-rel-debug" ${rc.debug ? 'checked' : ''}><span>Show the numbers (debug)<small>The raw values, how fast each relationship grows right now, and what each message changed, with undo. For tuning: the AI never sees it.</small></span></label>
            <button class="mu-ghost" data-act="wc-rel-reset">${icon('undo')}<span>Back to the world's defaults</span></button>`
            : '<p class="mu-muted">Turn on "Advanced" for how fast feelings grow and the debug view.</p>'}</section>`;
}

function addPicker(g: Save): string {
    const q = WC.q.toLowerCase();
    const list = characters().filter(c => !g.cast[c.avatar] && (!q || String(c.name).toLowerCase().includes(q))).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return `<div class="mu-dlg-veil" data-act="wc-add-close"></div><div class="mu-panel mu-scpick" role="dialog"><header><h3>Add someone to this world</h3><button class="mu-ibtn mu-ghost" data-act="wc-add-close" aria-label="Close">${icon('x')}</button></header>
        <p class="mu-muted">Mundi gives them a home, a routine and a job. Their card is not changed.</p>
        <input class="mu-search" type="search" data-input="wc-q" data-focus="wcq" placeholder="Search your characters" value="${esc(WC.q)}">
        <div class="mu-scpick-grid" data-keep="wcpick">${list.map(c => `<button data-act="wc-add" data-avatar="${esc(c.avatar)}"><img src="${esc(thumb(c.avatar))}" alt="" loading="lazy"><span data-notr>${esc(c.name)}</span></button>`).join('') || '<p class="mu-muted">No characters found.</p>'}</div></div>`;
}

// Opens a person's page in People (from Households).
// How alive this world is with the people in it, and which social systems are working (they need cards).
function lifeSection(g: Save, w: WorldDef) {
    const n = Object.keys(g.cast).length, c = castLevel(n, gameMode(w)), nb = neighbors(g).length;
    const friends = Object.values(g.cast).filter(r => r.met && bondOf(g, r.avatar) >= FRIEND_BOND).length;
    const row = (on: boolean, name: string, why: string) => `<li class="${on ? 'is-on' : 'is-off'}"><b>${on ? '●' : '○'} ${esc(name)}</b> <small>${esc(why)}</small></li>`;
    return `<section class="mu-wc-sec"><h4>Life in the world</h4>
        <p><b>${n} ${n === 1 ? 'person' : 'people'}</b> · ${esc(c.level)}. <span class="mu-muted">${esc(c.tip)}</span></p>
        <ul class="mu-wc-life">${row(systemOn(w, 'neighbors') && nb >= NEIGHBORS_MIN, 'Neighbors', !systemOn(w, 'neighbors') ? 'Off in this world.' : nb >= NEIGHBORS_MIN ? `${nb} live in your area.` : `Needs ${NEIGHBORS_MIN} of the world's people living in your area (now ${nb}). Move near people, or add cards.`)}
            ${row(systemOn(w, 'consults') && friends > 0, 'Advice and life events', !systemOn(w, 'consults') ? 'Off in this world.' : friends ? `${friends} close ${friends === 1 ? 'friend' : 'friends'} may ask your advice.` : 'Comes when you have close friends (bond 40+).')}
            ${row(systemOn(w, 'rumors') && n >= 4, 'Rumors', n >= 4 ? 'Going around.' : 'Need at least 4 people to travel.')}</ul></section>`;
}
export function editPerson(avatar: string) { WC.tab = 'people'; WC.who = avatar; notify(); }

function tabPeople(g: Save, w: WorldDef): string {
    const list = Object.values(g.cast).sort((a, b) => a.name.localeCompare(b.name));
    if (!g.cast[WC.who] && WC.who !== YOU) WC.who = list[0]?.avatar ?? '';
    // grouped by address: people who live together are listed together
    const key = (r: typeof list[number]) => `${r.home.zone}:${r.home.x},${r.home.y}`;
    const mine = `${g.player.home.zone}:${g.player.home.x},${g.player.home.y}`;
    const groups = new Map<string, typeof list>();
    for (const r of list) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
    const ordered = [...groups.entries()].sort(([a, x], [b, y]) => Number(b === mine) - Number(a === mine) || x[0].name.localeCompare(y[0].name));
    return `<div class="mu-wc-people">
        <aside class="mu-wc-list" data-keep="wc-list">
            <button class="mu-primary" data-act="wc-add-open">${icon('plus')}<span>Add someone</span></button>
            <button class="mu-wc-row is-you ${WC.who === YOU ? 'is-on' : ''}" data-act="wc-who" data-who="${YOU}"><img src="${esc(personaThumb())}" alt=""><span><b data-notr>${esc(personaName())}</b><small>You · ${esc(homeAddress(w, g.player.home))}</small></span></button>
            ${ordered.map(([k, rs]) => `<h5 class="mu-wc-addr">${k === mine ? `${icon('home')} ` : ''}${esc(homeAddress(w, rs[0].home))}${k === mine ? ' · with you' : ''}</h5>
                ${rs.map(r => `<button class="mu-wc-row ${WC.who === r.avatar ? 'is-on' : ''}" data-act="wc-who" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt="">
                <span><b data-notr>${esc(r.name)}</b><small>${esc(isScenario(w) ? homeJobOf(r).name || '' : w.occupations.find(o => o.id === r.occupation)?.name ?? 'No job')}</small></span></button>`).join('')}`).join('')}
        </aside>
        <section class="mu-wc-form" data-keep="wc-form">${suggestHtml('save')}${personForm(g, w)}</section>
    </div>${WC.adding ? addPicker(g) : ''}`;
}

/* ---------- a Home: the house itself ---------- */

// Its rooms in this game (on or off, what can be done in each, rooms of your own), and its floor plan (the Home's own
// maps: the Home creator, for a Home you made).
function tabHouse(w: WorldDef): string {
    const own = isCustom(w.id);
    return `<div class="mu-house-rooms">${houseRoomsHtml()}</div>
        <section class="mu-wc-sec"><h4>Floor plan and pictures</h4>
            <p class="mu-muted">${own ? 'The floors, where each room is on them and the pictures of the rooms are part of this Home: change them in the Home creator (this game follows).' : 'This is a ready Home: its floor plan and pictures stay as they are. To change them, make a copy of it in the Home creator (New game › Create a Home) and play that one.'}</p>
            ${own ? `<button data-act="wc-house-plan">${icon('map')}<span>Edit the floor plan and pictures</span></button>` : ''}</section>`;
}

/* ---------- this save: Author's Note ---------- */

const AN_POS: [number, string][] = [[1, 'In the chat, at a depth'], [0, 'After the story string'], [2, 'Before the story string']];
function tabSave(): string {
    const m = ctx().chatMetadata ?? {};
    return `<section class="mu-wc-sec"><h4>Author's Note</h4>
        <label class="mu-field"><span>A standing instruction for this save only: tone, pacing, what to focus on.</span><textarea rows="6" data-input="wc-note" data-focus="wcnote">${esc(m.note_prompt ?? '')}</textarea></label>
        ${WC.adv ? `<div class="mu-row2"><label class="mu-field"><span>Every how many messages</span><input type="number" min="0" value="${esc(m.note_interval ?? 1)}" data-input="wc-note-num" data-k="note_interval"></label>
            <label class="mu-field"><span>Depth</span><input type="number" min="0" value="${esc(m.note_depth ?? 4)}" data-input="wc-note-num" data-k="note_depth"></label></div>
            <label class="mu-field"><span>Position</span><select data-input="wc-note-num" data-k="note_position">${AN_POS.map(([v, l]) => opt(String(v), l, Number(m.note_position ?? 1) === v)).join('')}</select></label>` : ''}
        <small class="mu-muted">The same Author's Note as in SillyTavern; it is saved with this chat.</small></section>
        ${WC.adv ? `
        <section class="mu-wc-sec"><h4>Story memory</h4><p class="mu-muted">Facts the game noted as you played. The AI only gets those about the people in the scene and this place.</p>
            ${memoryByDay()}</section>` : ''}`;
}

// Story memory, a day at a time (newest day first), like the diary. MEMDAYS: days opened or closed by hand.
const MEMDAYS = new Map<number, boolean>();
function memoryByDay(): string {
    const g = game()!; const w = getWorld(g.world)!;
    const list = facts(g).slice(-120);
    if (!list.length) return '<p class="mu-muted">Nothing yet.</p>';
    const days = [...new Set(list.map(f => Math.floor(f.at / 1440)))].sort((a, b) => b - a);
    const open = (d: number) => (MEMDAYS.has(d) ? MEMDAYS.get(d)! : d === days[0]);
    return days.map(d => `<div class="mu-wc-day"><button class="mu-ghost mu-wc-dayhead" data-act="wc-memday" data-d="${d}">${icon(open(d) ? 'up' : 'down')}<span>${esc(weekday(d))} · Day ${d}</span><small>${list.filter(f => Math.floor(f.at / 1440) === d).length}</small></button>
        ${open(d) ? list.filter(f => Math.floor(f.at / 1440) === d).reverse().map(f => `<div class="mu-wc-recap"><span><small>${esc(stamp(g, w, f))}</small><p data-notr>${esc(factUi(f))}</p></span><button class="mu-ghost mu-ibtn" data-act="wc-fact-del" data-id="${esc(f.id)}" title="Forget this">${icon('trash')}</button></div>`).join('') : ''}</div>`).join('');
}

/* ---------- lorebooks ---------- */

function tabLore(g: Save): string {
    const own = chatLore();
    const extra = cfg(g).lore ?? [];
    const on = (n: string) => n === own || extra.includes(n);
    const q = WC.lq.toLowerCase();
    const books = lorebooks().filter(n => !q || n.toLowerCase().includes(q)).sort((a, b) => Number(on(b)) - Number(on(a)) || a.localeCompare(b));
    const count = lorebooks().filter(on).length;
    return `<section class="mu-wc-sec"><h4>Lorebooks of this world · ${count}</h4>
            <p class="mu-muted">Tick as many as you want: all of them are used while you play this world. The main one is saved with the chat (SillyTavern's chat lorebook); the others are switched on when you enter this game and off when you leave it.</p>
            <div class="mu-row"><input class="mu-search" type="search" data-input="wc-lq" data-focus="wclq" placeholder="Search lorebooks" value="${esc(WC.lq)}">
                <button data-act="wc-lore-new">${icon('plus')}<span>New lorebook</span></button></div>
            <div class="mu-wc-books">${books.map(n => `<div class="mu-wc-book ${on(n) ? 'is-on' : ''}">
                <label class="mu-check"><input type="checkbox" data-input="wc-lore" data-name="${esc(n)}" ${on(n) ? 'checked' : ''}><span data-notr>${esc(n)}</span></label>
                ${n === own ? '<b class="mu-wc-main">Main</b>' : on(n) ? `<button class="mu-ghost" data-act="wc-lore-main" data-name="${esc(n)}" title="Save it with the chat">Make main</button>` : ''}</div>`).join('') || '<p class="mu-muted">No lorebooks found.</p>'}</div>
            <button class="mu-ghost" data-act="wc-lib">${icon('book')}<span>Edit lorebooks in the Library</span></button></section>`;
}

/* ---------- the world's rules ---------- */

function tabRules(g: Save, w: WorldDef): string {
    const c = cfg(g);
    const list = (items: string[]) => `<div class="mu-chips">${items.map(x => `<span class="mu-chip">${esc(x)}</span>`).join('')}</div>`;
    const slider = (label: string, key: keyof typeof c, v: number, min: number, max: number, step: number, unit: string) =>
        `<label class="mu-field slider"><span>${label} · ${v}${unit}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-input="wc-cfg" data-k="${key}"></label>`;
    const live = (c.clock ?? 'action') === 'live';
    return `<section class="mu-wc-sec"><h4>${esc(w.name)}</h4><p>${esc(w.description)}</p><p class="mu-muted">Game mode: <b>${GAME_MODES.find(m => m.id === gameMode(w))!.name}</b> (change it in the world creator).</p></section>
        ${isScenario(w) ? `${dressHtml(g, w)}${relSection(g, w)}<section class="mu-wc-sec"><h4>Rooms</h4>${list(w.places.map(p => p.name))}</section>` : `
        <section class="mu-wc-sec"><h4>Time</h4>
            <div class="mu-heropick is-start">
                <button class="mu-herocard ${live ? '' : 'is-on'}" data-act="wc-clock" data-v="action"><b>Only with actions</b><p>The clock moves only when you do something: eat, drink, sleep, work, travel, or let time pass. Talking does not spend time.</p></button>
                <button class="mu-herocard ${live ? 'is-on' : ''}" data-act="wc-clock" data-v="live"><b>Running clock</b><p>Time also passes by itself while you play (1 real second = 1 game minute at ×1). For testing.</p></button></div></section>
        <section class="mu-wc-sec"><h4>Difficulty</h4><p class="mu-muted">Changes the economy: what work pays, what things cost and what bills are.</p>
            <div class="mu-heropick is-start mu-diff">${DIFFICULTIES.map(d => `<button class="mu-herocard ${difficultyOf(g).id === d.id ? 'is-on' : ''}" data-act="wc-diff" data-v="${d.id}"><b>${d.name}</b><p>${d.desc}</p></button>`).join('')}</div></section>
        ${relSection(g, w)}
        ${lifeSection(g, w)}
        <section class="mu-wc-sec"><h4>Needs</h4>${list(activeStatuses(w).map(s => `${s.icon} ${s.name}`))}</section>
        <section class="mu-wc-sec"><h4>Places</h4>${list(w.places.map(p => p.name))}</section>
        <section class="mu-wc-sec"><h4>Jobs</h4><ul class="mu-lib-jobs">${w.occupations.map(o => `<li><b>${esc(o.name)}</b> <small>${o.ranks.map(r => esc(r.name)).join(' → ')}</small></li>`).join('')}</ul></section>
        ${WC.adv ? `<section class="mu-wc-sec"><h4>Advanced settings</h4>
            ${slider('Travel time', 'travel', c.travel ?? 1, 0.25, 3, 0.25, '×')}
            ${slider('How fast needs drop', 'decay', c.decay ?? 1, 0, 3, 0.25, '×')}
            ${slider('Days in each season', 'seasonDays', c.seasonDays ?? 14, 3, 60, 1, ' days')}
            <button class="mu-ghost" data-act="wc-cfg-reset">${icon('undo')}<span>Back to the world's defaults</span></button></section>`
            : '<p class="mu-muted">Turn on "Advanced" for travel time, how fast needs drop and more.</p>'}`}`;
}

export function worldCfgHtml(): string {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w) return '';
    const body = WC.tab === 'people' ? tabPeople(g, w) : WC.tab === 'homes' ? tabHouseholds(g, w) : WC.tab === 'house' ? tabHouse(w) : WC.tab === 'ai' ? tabAiContext() : WC.tab === 'save' ? tabSave() : WC.tab === 'lore' ? tabLore(g) : tabRules(g, w);
    return `<div class="mu-settings mu-worldcfg">
        <div class="mu-subhead"><button data-act="wc-back" data-sfx="back">← Back</button><h2>${isScenario(w) ? 'This Home' : 'This world'}</h2><small data-notr>${esc(currentEntry()?.title ?? w.name)}</small>
            <label class="mu-switch-row"><span>Advanced</span><input type="checkbox" class="mu-toggle" data-input="wc-adv" ${WC.adv ? 'checked' : ''}></label></div>
        ${warningsBanner()}
        <div class="mu-settings-layout">
            <nav class="mu-tabs">${TABS.filter(([id]) => id !== 'house' || isScenario(w)).map(([id, l]) => `<button class="${WC.tab === id ? 'is-on' : ''}" data-act="wc-tab" data-tab="${id}">${isScenario(w) && id === 'rules' ? 'Home' : isScenario(w) && id === 'homes' ? 'Bedrooms' : l}</button>`).join('')}</nav>
            <div class="mu-settings-body mu-panel" data-keep="worldcfg">${body}</div>
        </div></div>`;
}

/* ---------- actions ---------- */

const ctxGW = () => { const g = game(); const w = g && getWorld(g.world); return g && w ? { g, w } : null; };
const changed = async () => { saveGame(); await syncScene(); refreshPrompt(); notify(); };
const noteSave = () => { ctx().saveMetadataDebounced(); };

// Family (like The Sims): who is whose mother, sibling… '__you' is you. How they get along is their feelings, where
// they live the Households tab.
const TIE = { other: '', type: 'sibling' as TieType };
// a tie told from this person's side ("Sadie is sibling of Aishah" on Sadie's page; parent and child swap)
function viewTie(t: { a: string; b: string; type: TieType }, avatar: string) {
    if (t.a === avatar) return t;
    const flip: Partial<Record<TieType, TieType>> = { parent: 'child', child: 'parent' };
    return { a: t.b, b: t.a, type: flip[t.type] ?? t.type };
}
function tiesHtml(g: Save, avatar: string) {
    const nm = (id: string) => (id === '__you' ? 'You' : g.cast[id]?.name ?? id);
    const others = [['__you', 'You'] as [string, string], ...Object.values(g.cast).filter(x => x.avatar !== avatar).map(x => [x.avatar, x.name] as [string, string])];
    const list = tiesOf(g, avatar);
    return `<section class="mu-ties"><h4>Family</h4>
        ${list.length ? `<ul>${list.map(t => { const v = viewTie(t, avatar);
            return `<li><span data-notr>${esc(nm(v.a))} · ${esc(TIE_TYPES.find(x => x[0] === v.type)?.[1] ?? v.type)} · ${esc(nm(v.b))}</span><button class="mu-ibtn mu-ghost" data-act="wc-tie-del" data-a="${esc(t.a)}" data-b="${esc(t.b)}" title="Remove">${icon('x')}</button></li>`; }).join('')}</ul>` : '<p class="mu-muted">No family yet.</p>'}
        <div class="mu-ties-add"><span data-notr>${esc(g.cast[avatar]?.name ?? '')} is</span>
            <select data-input="wc-tie" data-k="type">${TIE_TYPES.map(([id, l]) => opt(id, l, TIE.type === id)).join('')}</select>
            <select data-input="wc-tie" data-k="other"><option value="">who?</option>${others.map(([id, n]) => `<option value="${esc(id)}" ${TIE.other === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
            <button class="mu-primary" data-act="wc-tie-add" ${TIE.other ? '' : 'aria-disabled="true"'}>${icon('plus')}<span>Add</span></button></div>
        <div class="mu-row"><small class="mu-muted">Friends, couples and exes are feelings (below). Who lives together:</small><button class="mu-ghost" data-act="wc-tab" data-tab="homes">Households</button></div>
    </section>`;
}

Object.assign(ACT, {
    'wc-house-plan': () => { const g = game(); if (!g) return; openCreatorEdit(g.world); (CREATOR as any).tab = 'maps'; notify(); },
    'open-world': () => { WC.back = state.view; state.view = 'worldcfg' as any; notify(); },
    'wc-back': () => { state.view = (WC.back === 'scene' ? 'scene' : 'map') as any; notify(); },
    'wc-memday': (el) => { const d = Number(el.dataset.d); const g = game(); const newest = g ? Math.max(...facts(g).map(f => Math.floor(f.at / 1440))) : d; const cur = MEMDAYS.has(d) ? MEMDAYS.get(d)! : d === newest; MEMDAYS.set(d, !cur); notify(); },
    'wc-tab': (el) => { WC.tab = el.dataset.tab as Tab; notify(); },
    'wc-who': (el) => { WC.who = el.dataset.who!; notify(); },
    'wc-add-open': () => { WC.adding = true; WC.q = ''; notify(); },
    'wc-add-close': () => { WC.adding = false; notify(); },
    'wc-add': async (el) => {
        const c = ctxGW(); if (!c) return;
        const a = el.dataset.avatar!;
        const taken = new Set(Object.values(c.g.cast).map(r => `${r.home.x},${r.home.y}`));
        taken.add(`${c.g.player.home.x},${c.g.player.home.y}`);
        c.g.cast[a] = resident(c.w, a, taken, c.g.player.home);
        WC.adding = false; WC.who = a;
        toast(`${charOf(a)?.name ?? ''} now lives in ${c.w.name}.`, 'success');
        await changed();
    },
    'wc-remove': async () => {
        const c = ctxGW(); if (!c || !c.g.cast[WC.who]) return;
        if (Object.keys(c.g.cast).length <= 1) { toast('A world needs at least one person.', 'info'); return; }
        const name = c.g.cast[WC.who].name;
        delete c.g.cast[WC.who];
        const s = social(c.g); s.with = s.with.filter(x => x.avatar !== WC.who); s.appts = s.appts.filter(x => x.avatar !== WC.who);
        WC.who = '';
        toast(`${name} left this world.`, 'info');
        await changed();
    },
    'wc-leisure': async (el) => {
        const c = ctxGW(); const r = c?.g.cast[WC.who]; if (!c || !r) return;
        const id = el.dataset.id!; const i = r.leisure.indexOf(id);
        i >= 0 ? r.leisure.splice(i, 1) : r.leisure.push(id);
        await changed();
    },
    'wc-fact-del': (el) => { const g = game(); if (!g) return; const l = facts(g); const i = l.findIndex(f => f.id === el.dataset.id); if (i >= 0) l.splice(i, 1); saveGame(); refreshPrompt(); notify(); },
    'wc-lore-main': async (el) => {
        const g = game(); if (!g) return;
        const n = el.dataset.name!; const l = (cfg(g).lore ??= []);
        const old = chatLore();
        l.splice(l.indexOf(n), 1);
        if (old) l.push(old);
        await bindChatLore(n);
        saveGame(); await applyGameLore(); notify();
    },
    'wc-lore-new': async () => {
        const g = game(); if (!g) return;
        const base = `${getWorld(g.world)?.name ?? 'World'} - notes`;
        let n = base, k = 2; while (lorebooks().includes(n)) n = `${base} ${k++}`;
        try {
            const made = await createLorebook(n);
            if (chatLore()) (cfg(g).lore ??= []).push(made); else await bindChatLore(made);
            saveGame(); await applyGameLore();
            toast(`Lorebook “${made}” created and added to this world. Rename or fill it in the Library.`, 'success');
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        notify();
    },
    'wc-lib': async () => { const { openLibrary } = await import('./library.js'); openLibrary('lorebooks'); },
    'wc-clock': (el) => { const g = game(); if (!g) return; cfg(g).clock = el.dataset.v === 'live' ? 'live' : 'action'; if (cfg(g).clock === 'live' && !g.speed) g.speed = 60; saveGame(); notify(); },
    'wc-tie-add': async () => {
        const g = game(); if (!g || !TIE.other) return;
        const t = { a: WC.who, b: TIE.other, type: TIE.type };
        addOldTie(g, t); seedFamily(g, [t]);   // feelings already there are kept (edit them below)
        TIE.other = ''; await changed();
    },
    'wc-past-forget': async (el) => { const g = game(); if (!g) return; forgetPast(g, WC.who, el.dataset.b!); await changed(); },
    'wc-tie-del': async (el) => { const g = game(); if (!g) return; removeTie(g, el.dataset.a!, el.dataset.b!); await changed(); },
    'wc-diff': (el) => { const g = game(); if (!g) return; (cfg(g) as any).difficulty = el.dataset.v; saveGame(); notify(); },
    'wc-cfg-reset': () => { const g = game(); if (!g) return; const c = cfg(g); delete c.travel; delete c.decay; delete c.seasonDays; delete c.rel; saveGame(); notify(); },
    'wc-save-card': async () => {
        const g = game(); const r = g?.cast[WC.who]; if (!g || !r) return;
        try { await saveCardPerson(r.avatar, cleanPerson(relOf(g).people[idOf(g, r.avatar)]) ?? {}); toast(`Saved to ${r.name}'s card.`, 'success'); }
        catch (e: any) { toast(String(e?.message ?? e), 'error'); }
    },
    'wc-rel-reset': () => { const g = game(); if (!g) return; delete cfg(g).rel; saveGame(); notify(); },
});
Object.assign(INPUT, {
    'wc-tie': (el) => { (TIE as any)[el.dataset.k!] = el.value; notify(); },
    'wc-minor': async (el) => { const g = game(); if (!g) return; const id = idOf(g, WC.who); const ps = relOf(g).people; if (el.checked) (ps[id] ??= {}).minor = true; else if (ps[id]) delete ps[id].minor; await changed(); },
    'wc-pair-who': (el) => { PAIR.other = el.value; notify(); },
    'wc-pair': (el) => { const g = game(); if (!g) return; setMeter(g, el.dataset.m as Meter, el.dataset.x!, el.dataset.y!, Number(el.value)); saveGame(); const b = el.previousElementSibling?.querySelector('b'); if (b) b.textContent = el.value; },
    'wc-pair-status': async (el) => {
        const g = game(); if (!g) return;
        const a = WC.who, b = el.dataset.b!, status = (el.value || null) as Status | null;
        if (status && familyBlocked(g, a, b)) { toast('Not possible with family or a child.', 'info'); notify(); return; }
        setStatus(g, a, b, status, g.day, false);
        // a couple set by hand starts with some romance where there was none (with you: only their side)
        const floor = status === 'casual' ? ROM_START.interest : status ? COUPLE_ROMANCE : 0;
        for (const [x, y] of idOf(g, b) === YOU ? [[a, b]] : [[a, b], [b, a]]) if (romLevelOf(meter(g, 'r', x, y)) === 'none' && floor) setMeter(g, 'r', x, y, floor);
        await changed();
    },
    'wc-level': async (el) => { const g = game(); if (!g) return; pickLevel(g, el.dataset.m as Meter, el.dataset.x!, el.dataset.y!, el.value as FriendLevel | RomLevel); await changed(); },
    'wc-adv': (el) => { WC.adv = el.checked; notify(); },
    'wc-q': (el) => { WC.q = el.value; notify(); },
    'wc-job': async (el) => { const c = ctxGW(); const r = c?.g.cast[WC.who]; if (!r) return; r.occupation = el.value || null; await changed(); },
    'wc-zone': async (el) => {
        const c = ctxGW(); const r = c?.g.cast[WC.who]; if (!c || !r) return;
        if (!freeSpots(c.g, c.w, el.value).length) { toast('There is no free home there.', 'info'); notify(); return; }
        r.home = homeSpot(c.w, el.value, takenHomes(c.g, r), c.g.player.home); normalizeHomes(c.g);
        await changed();
    },
    'wc-met': async (el) => { const c = ctxGW(); const r = c?.g.cast[WC.who]; if (!r) return; r.met = el.checked; await changed(); },
    'wc-routine': async (el) => { const c = ctxGW(); const r = c?.g.cast[WC.who]; if (!c || !r || !el.value) return; r.routine = structuredClone(c.w.cast.routineTemplates[el.value]); await changed(); },
    'wc-note': (el) => { ctx().chatMetadata.note_prompt = el.value; noteSave(); const t = document.getElementById('extension_floating_prompt') as HTMLTextAreaElement | null; if (t) t.value = el.value; },
    'wc-note-num': (el) => { ctx().chatMetadata[el.dataset.k!] = Number(el.value); noteSave(); },
    'wc-lq': (el) => { WC.lq = el.value; notify(); },
    'wc-lore': async (el) => {
        const g = game(); if (!g) return;
        const n = el.dataset.name!;
        const c = cfg(g); const l = (c.lore ??= []);
        if (el.checked) {
            if (!chatLore()) await bindChatLore(n);          // the first one becomes the main (chat) lorebook
            else if (!l.includes(n) && n !== chatLore()) l.push(n);
        } else if (n === chatLore()) {
            const next = l.shift();                          // another ticked one takes its place
            if (next) await bindChatLore(next); else { delete ctx().chatMetadata.world_info; ctx().saveMetadataDebounced(); }
        } else l.splice(l.indexOf(n), 1);
        saveGame(); await applyGameLore(); notify();
    },
    'wc-poly': (el) => { const g = game(); if (!g) return; cfg(g).poly = (el as HTMLInputElement).checked || undefined; saveGame(); notify(); },
    'wc-cfg': (el) => { const g = game(); if (!g) return; (cfg(g) as any)[el.dataset.k!] = Number(el.value); saveGame(); notify(); },
    'wc-rel': (el) => {
        const g = game(); if (!g) return;
        const rc = (cfg(g).rel ??= {}); const k = el.dataset.k!; const v = Number(el.value);
        if (k === 'halfLife') rc.halfLife = v * 60;
        else if (k === 'fade') { if (v === 1) delete rc.fade; else rc.fade = v; }
        else { const [m, part] = k.split('.') as [Meter, 'E' | 'H']; ((rc.pace ??= {})[m] ??= {})[part] = v; }
        saveGame(); notify();
    },
    'wc-rel-verdict': (el) => { const g = game(); if (!g) return; const rc = (cfg(g).rel ??= {}); if ((el as HTMLInputElement).checked) delete rc.verdict; else rc.verdict = false; saveGame(); notify(); },
    'wc-rel-spread': (el) => { const g = game(); if (!g) return; const rc = (cfg(g).rel ??= {}); if ((el as HTMLInputElement).checked) delete rc.spread; else rc.spread = false; saveGame(); notify(); },
    'wc-rel-init': (el) => { const g = game(); if (!g) return; const rc = (cfg(g).rel ??= {}); if (el.value) rc.initiative = el.value as any; else delete rc.initiative; saveGame(); refreshPrompt(); notify(); },
    'wc-rel-playas': (el) => { const g = game(); if (!g) return; const rc = (cfg(g).rel ??= {}); if (el.value === 'keep') rc.playAs = 'keep'; else delete rc.playAs; saveGame(); notify(); },
    'wc-rel-debug': (el) => { const g = game(); if (!g) return; const rc = (cfg(g).rel ??= {}); if ((el as HTMLInputElement).checked) rc.debug = true; else delete rc.debug; saveGame(); notify(); },
});
