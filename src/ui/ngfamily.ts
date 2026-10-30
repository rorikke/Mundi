// New game, like The Sims: households (people who share a home, and which of them are family), your own household
// (who lives with you), relations (family elsewhere, and how anyone starts with anyone: friends, a couple, exes…), and
// choosing your home on the map. Everyone left over gets a home of their own at random.
import { homeKindName } from '../sim/places.js';
import { safeUrl } from '../core/safe.js';
import { state, notify, esc, toast, busy } from '../core/store.js';
import { getWorld, worldFile, isScenario, systemOn, type WorldDef } from '../core/world.js';
import { characters, thumb, charOf, createCharacter } from '../st/bridge.js';
import { pickFile } from './cropper.js';
import { TIE_TYPES } from '../sim/living.js';
import { FRIEND_TIERS, ROMANCE_TIERS } from '../sim/romance.js';
import type { FamilyType, StartRel } from '../core/feel.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
import { personPanel, suggestHtml, SCOPES } from './personui.js';
import { cleanPerson, gendersOf } from '../sim/gender.js';
import { personaSheet } from '../st/bridge.js';
import type { Person } from '../sim/rel.js';

/** A family tie inside a household: `a` is the `type` of `b`. */
export interface NgTie { a: string; b: string; type: FamilyType }
export interface NgHousehold { members: string[]; ties: NgTie[]; /** where they live (none: a home at random) */ home?: NgHome }
/** Someone in your household; `type`: how they're your family (none: a partner, a roommate…). */
export interface NgFamily { avatar: string; type?: FamilyType }
export interface NgHome { zone: string; x: number; y: number; n: number }

const wz = () => state.wizard as any;
const W = (): WorldDef => getWorld(wz().world)!;
const nm = (a: string) => charOf(a)?.name ?? a;
const hhs = (): NgHousehold[] => (wz().hh ??= []);
export const familyOf = (): NgFamily[] => (wz().family ??= []);
const inHousehold = (a: string) => hhs().some(h => h.members.includes(a)) || familyOf().some(f => f.avatar === a);
const opt = (v: string, l: string, on: boolean) => `<option value="${esc(v)}" ${on ? 'selected' : ''}>${esc(l)}</option>`;
const face = (a: string) => `<img src="${esc(thumb(a))}" alt="" title="${esc(nm(a))}">`;
/* ---------- step: households ---------- */

export function stepHouseholds(): string {
    const z = wz(); const list = hhs(); const sel = Math.min(z.hhSel ?? 0, Math.max(0, list.length - 1));
    const free = (z.cast as string[]).filter(a => !inHousehold(a));
    const h = list[sel];
    // a scenario: everyone lives in the same house, so only the relations
    if (isScenario(getWorld(z.world))) return `<p class="mu-muted">Everyone lives in the same house: say who is family and how they get along.</p>${relationsHtml(false)}${jobsHtml()}
        ${z.presetEdit || !(z.cast as string[]).length ? '' : `<div class="mu-row"><button class="mu-ghost" data-act="cp-save-wizard">${icon('save')}<span>Save these people as a preset</span></button></div>`}`;
    return `<h3>Households</h3>
        <p class="mu-muted">A household is people who live in the same home: a family, a couple, roommates. Put together the people who live together and say who is family. Everyone you leave out gets a home of their own, at random. You can skip this.</p>
        <div class="mu-ngh">
            <aside class="mu-ngh-list">${list.map((x, i) => `<button class="mu-ngh-card ${i === sel ? 'is-on' : ''}" data-act="ngh-sel" data-i="${esc(i)}"><b>Household ${i + 1}</b>
                <span class="mu-hh-faces">${x.members.map(face).join('') || '<em>Empty</em>'}</span></button>`).join('')}
                <button class="mu-primary" data-act="ngh-new">${icon('plus')}<span>New household</span></button></aside>
            <section class="mu-ngh-edit">${h ? `
                <header class="mu-row"><h4>Household ${sel + 1}</h4><button class="mu-ghost mu-right" data-act="ngh-del" data-i="${esc(sel)}">${icon('trash')}<span>Remove</span></button></header>
                <div class="mu-ngh-members">${h.members.map(a => `<span class="mu-chip is-on">${face(a)}<span data-notr>${esc(nm(a))}</span><button class="mu-ibtn mu-ghost" data-act="ngh-out" data-who="${esc(a)}" title="Take out">${icon('x')}</button></span>`).join('') || '<p class="mu-muted">Click people below to add them.</p>'}</div>
                ${h.members.length >= 2 ? `<h5>Family in this household</h5>
                    ${h.ties.map((t, k) => `<div class="mu-ties-add"><span data-notr>${esc(nm(t.a))}</span><span>is</span><select data-input="ngh-tie" data-k="${esc(k)}" data-f="type">${TIE_TYPES.map(([id, l]) => opt(id, l, t.type === id)).join('')}</select>
                        <span data-notr>${esc(nm(t.b))}</span>
                        <button class="mu-ibtn mu-ghost" data-act="ngh-tie-del" data-k="${esc(k)}">${icon('x')}</button></div>`).join('')}
                    <div class="mu-ties-add"><select data-input="ngh-pair" data-f="a">${h.members.map(a => opt(a, nm(a), (h.members.includes(z.hhA) ? z.hhA : h.members[0]) === a)).join('')}</select><span>and</span>
                        <select data-input="ngh-pair" data-f="b">${h.members.map(a => opt(a, nm(a), (h.members.includes(z.hhB) ? z.hhB : h.members[1]) === a)).join('')}</select>
                        <button data-act="ngh-tie-add">${icon('plus')}<span>Add family</span></button></div>
                    <small class="mu-muted">Friends, a couple or roommates sharing this home: say how they get along under Relations.</small>` : ''}
                ${z.presetEdit ? '' : `<h5>Their home</h5>
                ${homePicker(sel, 'hhMap')}
                <div class="mu-row"><p class="mu-nghome-pick">${homeLine(h.home, 'No home chosen: one at random.')}</p>${h.home ? `<button class="mu-ghost" data-act="nghm-clear">${icon('x')}<span>At random</span></button>` : ''}</div>`}
                <h5>People without a household</h5>
                <div class="mu-chips">${free.map(a => `<button class="mu-chip" data-act="ngh-in" data-who="${esc(a)}">${face(a)}<span data-notr>${esc(nm(a))}</span></button>`).join('') || '<p class="mu-muted">Everyone has a household.</p>'}</div>`
            : '<p class="mu-muted">No households yet: everyone lives alone. Make one with "New household".</p>'}</section></div>
        ${relationsHtml(false)}
        ${jobsHtml()}
        ${whoTheyAreHtml()}
        ${z.presetEdit || !(z.cast as string[]).length ? '' : `<div class="mu-row"><button class="mu-ghost" data-act="cp-save-wizard">${icon('save')}<span>Save these people as a preset</span></button><small class="mu-muted">People, households and relations, for other worlds too (Library → Presets).</small></div>`}`;
}

/* ---------- who they are: each one's gender and own ways ---------- */

// The draft's own entries ('__you' is you). An entry, even empty, wins over the card's settings and a preset's.
const ngPeople = (): Record<string, Person> => (wz().people ??= {});
// Where someone starts when the draft has nothing for them: your persona's last game, their card's Mundi settings, or
// the cast preset they came with.
function startOfPerson(a: string): Person | undefined {
    if (a === '__you') return wz().heroMode === 'existing' && wz().persona ? cleanPerson(personaSheet(wz().persona)?.person) : undefined;
    return cleanPerson(charOf(a)?.data?.extensions?.mundi?.person) ?? cleanPerson(wz().presetPeople?.[a]);
}
SCOPES.ng = {
    get: (id) => ngPeople()[id] ?? startOfPerson(id),
    set: (id, p) => { ngPeople()[id] = p ?? {}; },
    genders: () => gendersOf(getWorld(wz().world)),
    romance: () => !getWorld(wz().world) || systemOn(getWorld(wz().world), 'romance'),
    adult: () => !!wz().adult,
    cards: () => [...new Set([...(wz().cast as string[]), ...familyOf().map(f => f.avatar)])].filter(a => charOf(a)).map(a => ({ id: a, avatar: a, name: nm(a) })),
};
// What the game starts with, for everyone chosen and you.
export function ngPeopleFor(avatars: string[]): Record<string, Person> {
    const out: Record<string, Person> = {};
    for (const a of [...avatars, '__you']) { const p = SCOPES.ng.get(a); if (p) out[a] = p; }
    return out;
}
// Only the entries made in the draft (a preset keeps those).
export const ngEdited = (): Record<string, Person> => Object.fromEntries(Object.entries(ngPeople()).filter(([, p]) => cleanPerson(p)).map(([a, p]) => [a, cleanPerson(p)!]));
function whoTheyAreHtml(): string {
    const z = wz(); const people: string[] = [...new Set([...(z.cast as string[]), ...familyOf().map(f => f.avatar)])];
    if (!people.length) return '';
    return `<section class="mu-panel mu-ngwho"><h3>Who they are</h3>
        <p class="mu-muted">Each one's gender and, under "More", who they are attracted to, how fast their feelings grow and how they are about intimacy. Taken from their card when it has Mundi settings; the cards are not changed.</p>
        ${suggestHtml('ng')}
        ${people.map(a => `<div class="mu-ngwho-row">${face(a)}<b data-notr>${esc(nm(a))}</b>${personPanel('ng', a, ['gender'])}
            <button class="mu-ghost" data-act="ngw-more" data-who="${esc(a)}">${icon(z.whoOpen === a ? 'x' : 'edit')}<span>${z.whoOpen === a ? 'Less' : 'More'}</span></button></div>
            ${z.whoOpen === a ? `<div class="mu-ngwho-more">${personPanel('ng', a, ['attraction', 'pace', 'ways'])}</div>` : ''}`).join('')}
    </section>`;
}
// Your own gender and attraction (on the "Your character" step).
export function youWaysHtml(): string {
    return `<section class="mu-panel mu-ngwho is-you"><h3>About you</h3>${personPanel('ng', '__you', ['gender', 'attraction'], { you: true })}</section>`;
}

/* ---------- jobs: what each of your characters does for a living ---------- */

// At random (the default), no job, or one of the world's jobs (in a scenario they happen off-screen).
function jobsHtml(): string {
    const z = wz(); const w = getWorld(z.world); if (z.presetEdit || !w || !systemOn(w, 'jobs') || !w.occupations.length) return '';
    const people = z.cast as string[]; if (!people.length) return '';
    const jobs: Record<string, string> = (z.jobs ??= {});
    return `<section class="mu-panel mu-ngjobs"><h3>Jobs</h3>
        <p class="mu-muted">What each one does for a living${isScenario(w) ? ' (outside the house, off-screen)' : ''}. "At random": the world picks one, or none.</p>
        <div class="mu-ngjobs-grid">${people.map(a => `<label class="mu-field"><span>${face(a)} <span data-notr>${esc(nm(a))}</span></span><select data-input="ngj-set" data-who="${esc(a)}">
            ${opt('', 'At random', !jobs[a])}${opt('none', 'No job', jobs[a] === 'none')}${w.occupations.filter(o => z.adult || !o.adult).map(o => opt(o.id, `${o.name} · ${o.ranks[0]?.name ?? ''}`, jobs[a] === o.id)).join('')}</select></label>`).join('')}</div>
    </section>`;
}

/* ---------- relations: anyone with anyone, in any household ---------- */

// How any two people of this game (or someone and you) start, whatever household they live in: family, each one's
// friendship and romance (levels, core/feel.ts), and whether they are a couple or used to be. `mine`: only your
// relations (on the "Your character" step). With you only their side is set: your own feelings are played.
const rels = (): StartRel[] => (wz().rels ??= []);
export const relationsOf = (): StartRel[] => rels();
const who = (a: string) => (a === '__you' ? 'You' : nm(a));
const levelSel = (k: number, f: string, v: string | undefined, m: 'f' | 'r', none: string) => {
    const tiers = m === 'f' ? [...FRIEND_TIERS].reverse() : ROMANCE_TIERS;
    return `<label class="mu-field"><span>${m === 'f' ? 'Friendship' : 'Romance'}</span><select data-input="ngr-set" data-k="${k}" data-f="${f}">${opt('', none, !v)}${tiers.map(t => opt(t.id, t.name, v === t.id)).join('')}</select></label>`;
};
const TOGETHER: [string, string][] = [['', 'Not a couple'], ['casual', 'Something casual'], ['dating', 'Dating'], ['engaged', 'Engaged'], ['married', 'Married'], ['ex', 'Used to be together']];
function relRow(t: StartRel, k: number, love: boolean): string {
    const you = t.a === '__you' || t.b === '__you', them = t.a === '__you' ? t.b : t.a;
    const side = (x: string, f: string, r: string, none: string) => `<div class="mu-feel-side"><b>${x === '__you' ? '' : `<span data-notr>${esc(nm(x))}</span> `}<span>${you ? 'feels about you' : 'feels'}</span></b>
        <div class="mu-row2">${levelSel(k, f, (t as any)[f], 'f', none)}${love ? levelSel(k, r, (t as any)[r], 'r', none) : ''}</div></div>`;
    const together = t.status ?? (t.was ? 'ex' : '');
    return `<div class="mu-ngrel-row">
        <div class="mu-ties-add">${t.a === '__you' ? '' : face(t.a)}<span data-notr>${esc(who(t.a))}</span><span>${t.a === '__you' ? 'are' : 'is'}</span>
            <select data-input="ngr-set" data-k="${k}" data-f="family">${opt('', 'not family', !t.family)}${TIE_TYPES.map(([id, l]) => opt(id, l, t.family === id)).join('')}</select>
            ${t.b === '__you' ? '' : face(t.b)}<span data-notr>${esc(who(t.b))}</span>
            <button class="mu-ibtn mu-ghost mu-right" data-act="ngr-del" data-k="${k}" title="Remove">${icon('x')}</button></div>
        ${you ? side(them, 'f', 'r', 'As usual') : `${side(t.a, 'f', 'r', 'As usual')}${side(t.b, 'back', 'rback', 'The same')}`}
        ${love ? `<label class="mu-field"><span>Together</span><select data-input="ngr-set" data-k="${k}" data-f="together">${TOGETHER.map(([v, l]) => opt(v, l, together === v)).join('')}</select></label>` : ''}
    </div>`;
}
function relationsHtml(mine: boolean): string {
    const z = wz(); const w = getWorld(z.world);
    const love = !w || systemOn(w, 'romance');
    const people: string[] = [...new Set([...(z.cast as string[]), ...familyOf().map(f => f.avatar)])];
    const list = rels().map((t, k) => [t, k] as const).filter(([t]) => !mine || t.a === '__you' || t.b === '__you');
    const pick = (f: 'a' | 'b', def: string, withYou: boolean) => `<select data-input="ngr-pair" data-f="${esc(f)}">${(withYou ? ['__you', ...people] : people).map(a => opt(a, who(a), (z[`rel${f}`] ?? def) === a)).join('')}</select>`;
    return `<section class="mu-panel mu-ngrel"><h3>${mine ? 'Your relations' : 'Relations'}</h3>
        <p class="mu-muted">${mine ? 'How you start with anyone in this world, not only who lives with you: family across town, a best friend, a rival, an old flame, someone you are dating.' : (w && isScenario(w) ? 'Between any two people of the house (or with you): family, friends, a couple, exes, people who can\'t stand each other…' : 'Between any two people, in any household (or with you): family elsewhere, friends, a couple, exes, people who can\'t stand each other…')} <span>"As usual": where they would start anyway.</span></p>
        ${list.map(([t, k]) => relRow(t, k, love)).join('') || '<p class="mu-muted">None yet.</p>'}
        ${people.length ? `<div class="mu-ties-add">${mine ? '<span>You and</span>' : pick('a', '__you', true)}${mine ? '' : '<span>and</span>'}${pick('b', people[0], false)}
            <button data-act="ngr-add" data-mine="${mine ? '1' : ''}">${icon('plus')}<span>Add a relation</span></button></div>` : '<p class="mu-muted">Choose the people of this world first.</p>'}
    </section>`;
}

/* ---------- your household (on the "Your character" step, once you have one) ---------- */

export function yourHouseholdHtml(): string {
    const z = wz(); const fam = familyOf();
    if (isScenario(getWorld(z.world))) return relationsHtml(true);   // one house: no household of your own
    const q = String(z.famQ ?? '').toLowerCase();
    const pool = characters().filter(c => !fam.some(f => f.avatar === c.avatar) && !hhs().some(h => h.members.includes(c.avatar)) && (!q || String(c.name).toLowerCase().includes(q))).slice(0, 40);
    return `<section class="mu-panel mu-ngfam"><h3>Your household</h3>
        <p class="mu-muted">The people who live with you: family, a partner, roommates. They share your home and your wallet, and you can play as any of them later ("Play as"). A partner or a friend: say how you get along under Your relations.</p>
        ${fam.map((f, k) => `<div class="mu-ties-add">${face(f.avatar)}<b data-notr>${esc(nm(f.avatar))}</b><span>is your</span>
            <select data-input="ngf-set" data-k="${esc(k)}" data-f="type">${opt('', 'housemate (not family)', !f.type)}${TIE_TYPES.map(([id, l]) => opt(id, l.replace(/ of$/, ''), f.type === id)).join('')}</select>
            <button class="mu-ibtn mu-ghost" data-act="ngf-del" data-k="${esc(k)}">${icon('x')}</button></div>`).join('') || '<p class="mu-muted">You live alone for now.</p>'}
        ${z.famNew ? newCharForm(z.famNew) : z.famOpen ? `<input class="mu-search" type="search" data-input="ngf-q" data-focus="ngfq" placeholder="Search your characters" value="${esc(z.famQ ?? '')}">
            <div class="mu-chips mu-ngfam-pool"><button class="mu-chip mu-ngfam-newchip" data-act="ngf-new">${icon('plus')}<span>Create a new character</span></button>${pool.map(c => `<button class="mu-chip" data-act="ngf-add" data-who="${esc(c.avatar)}">${face(c.avatar)}<span data-notr>${esc(c.name)}</span></button>`).join('') || '<p class="mu-muted">No characters found.</p>'}</div>`
            : `<div class="mu-row mu-ngfam-btns"><button data-act="ngf-open">${icon('plus')}<span>Add someone to your household</span></button><button data-act="ngf-new">${icon('user')}<span>Create a new character</span></button></div>`}
    </section>${relationsHtml(true)}`;
}

// A new SillyTavern character, made right here, who moves in with you.
interface NewChar { name: string; desc: string; url?: string; blob?: Blob }
function newCharForm(n: NewChar): string {
    return `<div class="mu-ngfam-new">
        <button class="mu-ngfam-pic" data-act="ngf-new-pic" title="Choose a picture" style="${n.url ? `background-image:url('${safeUrl(n.url)}')` : ''}">${n.url ? '' : `${icon('image')}<small>Picture</small>`}</button>
        <div class="mu-ngfam-newf">
            <input type="text" data-input="ngf-new-f" data-f="name" data-focus="ngfnew-name" maxlength="40" placeholder="Name" value="${esc(n.name)}">
            <textarea rows="3" data-input="ngf-new-f" data-f="desc" data-focus="ngfnew-desc" placeholder="Who they are: looks, personality, what they do (optional)">${esc(n.desc)}</textarea>
            <div class="mu-row"><small class="mu-muted">Saved as a character in your SillyTavern.</small><span class="mu-right mu-row"><button class="mu-ghost" data-act="ngf-new-cancel">Cancel</button><button class="mu-primary" data-act="ngf-new-yes">${icon('plus')}<span>Create and add</span></button></span></div>
        </div></div>`;
}

/* ---------- a home on the map (yours, or a household's) ---------- */

const sameHome = (a: NgHome | null | undefined, zone: string, x: number, y: number) => !!a && a.zone === zone && a.x === x && a.y === y;
// `who`: 'you' or a household's index. Homes chosen by someone else are shown as taken.
function homePicker(who: 'you' | number, mapKey: 'homeMap' | 'hhMap'): string {
    const z = wz(); const w = W();
    const maps = w.maps.filter(m => w.homes.zones.some(zn => zn.map === m.id));
    const mapId = maps.some(m => m.id === z[mapKey]) ? z[mapKey] : maps[0]?.id;
    const m = w.maps.find(x => x.id === mapId);
    const mine: NgHome | null = who === 'you' ? z.home ?? null : hhs()[who]?.home ?? null;
    const others: NgHome[] = [...(who === 'you' ? [] : [z.home]), ...hhs().filter((_h, i) => i !== who).map(h => h.home)].filter(Boolean) as NgHome[];
    const act = who === 'you' ? 'ngm' : 'nghm';
    return `${maps.length > 1 ? `<div class="mu-chips">${maps.map(x => `<button class="mu-chip ${x.id === mapId ? 'is-on' : ''}" data-act="${act}-map" data-id="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>` : ''}
        ${m ? `<div class="mu-nghome-map" style="aspect-ratio:${m.ratio};width:min(100%, calc(64vh * ${m.ratio}));background-image:url('${safeUrl(worldFile(w, m.image))}')">
            ${w.homes.zones.filter(zn => zn.map === m.id).map(zn => zn.spots.map(([x, y], k) => {
                const on = sameHome(mine, zn.id, x, y), taken = others.some(o => sameHome(o, zn.id, x, y));
                return `<button class="mu-nghome-spot ${on ? 'is-on' : ''} ${taken ? 'is-taken' : ''}" style="left:${x}%;top:${y}%" data-act="${act}-pick" data-zone="${esc(zn.id)}" data-k="${esc(k)}" ${taken ? 'aria-disabled="true"' : ''} title="${esc(zn.name)} · ${zn.kind === 'house' ? 'House' : 'Apartment'} ${k + 1} · rent ${zn.rent}${taken ? ' · taken' : ''}">${icon('home')}</button>`;
            }).join('')).join('')}</div>` : ''}`;
}
const homeLine = (h: NgHome | null | undefined, none: string) => { const w = W(); const zone = h && w.homes.zones.find(zn => zn.id === h.zone); return zone && h ? `${icon('home')} <b>${esc(zone.name)}, ${esc(homeKindName(w, zone.kind))} ${h.n}</b> · ${esc(w.homes.kinds[zone.kind]?.name ?? zone.kind)} · rent ${zone.rent}` : `<span class="mu-muted">${none}</span>`; };

/* ---------- step: choosing your home ---------- */

export function stepHome(): string {
    const w = W();
    if (isScenario(w)) {   // a scenario: the kinds of bedroom as pictures, no floor plan
        const cur = wz().home;
        return `<h3>Choose your room</h3><p class="mu-muted">Your bedroom in ${esc(w.name)}. Not choosing: one is given to you.</p>
            <div class="mu-rooms-grid">${w.homes.zones.map(zn => { const k = w.homes.kinds[zn.kind]; const pic = k?.image ? worldFile(w, k.image) : '';
                return `<button class="mu-room ${cur?.zone === zn.id ? 'is-you' : ''}" data-act="ngm-pick" data-zone="${esc(zn.id)}" data-k="0"><i style="${pic ? `background-image:url('${safeUrl(pic)}')` : ''}">${cur?.zone === zn.id ? `<em>${icon('pin')} Yours</em>` : ''}</i>
                    <b data-notr>${esc(k?.name ?? zn.name)}</b><small class="mu-muted" data-notr>${esc(k?.desc ?? zn.desc ?? '')}</small></button>`; }).join('')}</div>`;
    }
    return `<h3>Choose your home</h3>
        <p class="mu-muted">Click a home on the map. The others are given to the people of the world after you choose.${familyOf().length ? ' Your household moves in with you.' : ''}</p>
        ${homePicker('you', 'homeMap')}
        <p class="mu-nghome-pick">${homeLine(wz().home, 'No home chosen yet: one is given by your origin.')}</p>`;
}

/* ---------- actions ---------- */

Object.assign(ACT, {
    'ngw-more': (el) => { const z = wz(); z.whoOpen = z.whoOpen === el.dataset.who ? '' : el.dataset.who; notify(); },
    'ngh-new': () => { hhs().push({ members: [], ties: [] }); wz().hhSel = hhs().length - 1; notify(); },
    'ngh-sel': (el) => { wz().hhSel = Number(el.dataset.i); notify(); },
    'ngh-del': (el) => { hhs().splice(Number(el.dataset.i), 1); wz().hhSel = 0; notify(); },
    'ngh-in': (el) => { const h = hhs()[wz().hhSel ?? 0]; if (h) h.members.push(el.dataset.who!); notify(); },
    'ngh-out': (el) => { const h = hhs()[wz().hhSel ?? 0]; if (!h) return; const a = el.dataset.who!; h.members = h.members.filter(x => x !== a); h.ties = h.ties.filter(t => t.a !== a && t.b !== a); notify(); },
    'ngh-tie-add': () => {
        const z = wz(); const h = hhs()[z.hhSel ?? 0]; if (!h) return;
        const a = z.hhA && h.members.includes(z.hhA) ? z.hhA : h.members[0], b = z.hhB && h.members.includes(z.hhB) ? z.hhB : h.members[1];
        if (!a || !b || a === b) { toast('Choose two different people.', 'info'); return; }
        h.ties = h.ties.filter(t => !((t.a === a && t.b === b) || (t.a === b && t.b === a)));
        h.ties.push({ a, b, type: 'sibling' }); notify();
    },
    'ngh-tie-del': (el) => { const h = hhs()[wz().hhSel ?? 0]; if (h) h.ties.splice(Number(el.dataset.k), 1); notify(); },
    'ngf-open': () => { wz().famOpen = true; notify(); },
    'ngr-add': (el) => {
        const z = wz(); const people: string[] = [...new Set([...(z.cast as string[]), ...familyOf().map(f => f.avatar)])];
        const a = el.dataset.mine ? '__you' : (z.rela ?? '__you'), b = z.relb ?? people[0];
        if (!a || !b || a === b) { toast('Choose two different people.', 'info'); return; }
        const list = rels(); const i = list.findIndex(t => (t.a === a && t.b === b) || (t.a === b && t.b === a));
        const t: StartRel = { a, b, f: 'friend' };
        if (i >= 0) list.splice(i, 1, t); else list.push(t);
        notify();
    },
    'ngr-del': (el) => { rels().splice(Number(el.dataset.k), 1); notify(); },
    'ngf-add': (el) => {
        const a = el.dataset.who!; const z = wz();
        familyOf().push({ avatar: a, type: 'sibling' });
        if (!z.cast.includes(a)) z.cast.push(a);   // they live in this world, of course
        z.famOpen = false; z.famQ = ''; notify();
    },
    'ngf-new': () => { wz().famNew = { name: '', desc: '' }; notify(); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#mundi-root [data-focus="ngfnew-name"]')?.focus()); },
    'ngf-new-cancel': () => { const n = wz().famNew as NewChar | null; if (n?.url) URL.revokeObjectURL(n.url); wz().famNew = null; notify(); },
    'ngf-new-pic': async () => {
        const f = await pickFile(); const n = wz().famNew as NewChar | null; if (!f || !n) return;
        if (n.url) URL.revokeObjectURL(n.url);
        n.blob = f; n.url = URL.createObjectURL(f); notify();
    },
    'ngf-new-yes': async () => {
        const z = wz(); const n = z.famNew as NewChar | null; if (!n) return;
        const name = n.name.trim(); if (!name) { toast('Write a name.', 'warn'); return; }
        let a = '';
        try { a = await busy('Creating', () => createCharacter({ name, description: n.desc.trim() || `${name}.` }, n.blob)); }
        catch (e) { toast(String((e as Error).message ?? e), 'error'); return; }
        if (n.url) URL.revokeObjectURL(n.url);
        familyOf().push({ avatar: a, type: 'sibling' });
        if (!z.cast.includes(a)) z.cast.push(a);
        z.famNew = null; z.famOpen = false; z.famQ = '';
        toast(`${name} was created and lives with you. Say how you are related.`, 'success'); notify();
    },
    'ngf-del': (el) => { familyOf().splice(Number(el.dataset.k), 1); notify(); },
    'ngm-map': (el) => { wz().homeMap = el.dataset.id; notify(); },
    'nghm-map': (el) => { wz().hhMap = el.dataset.id; notify(); },
    'nghm-pick': (el) => {
        const h = hhs()[wz().hhSel ?? 0]; const zn = W().homes.zones.find(x => x.id === el.dataset.zone); const k = Number(el.dataset.k);
        if (!h || !zn || !zn.spots[k] || el.getAttribute('aria-disabled') === 'true') return;
        h.home = { zone: zn.id, x: zn.spots[k][0], y: zn.spots[k][1], n: k + 1 }; notify();
    },
    'nghm-clear': () => { const h = hhs()[wz().hhSel ?? 0]; if (h) delete h.home; notify(); },
    'ngm-pick': (el) => {
        const zn = W().homes.zones.find(x => x.id === el.dataset.zone); const k = Number(el.dataset.k);
        if (!zn || !zn.spots[k] || el.getAttribute('aria-disabled') === 'true') return;
        wz().home = { zone: zn.id, x: zn.spots[k][0], y: zn.spots[k][1], n: k + 1 }; notify();
    },
});
Object.assign(INPUT, {
    'ngj-set': (el) => { const z = wz(); const j = (z.jobs ??= {}); const a = el.dataset.who!; if (el.value) j[a] = el.value; else delete j[a]; },
    'ngh-tie': (el) => { const t = hhs()[wz().hhSel ?? 0]?.ties[Number(el.dataset.k)]; if (t) t.type = el.value as FamilyType; notify(); },
    'ngh-pair': (el) => { wz()[el.dataset.f === 'a' ? 'hhA' : 'hhB'] = el.value; },
    'ngr-set': (el) => {
        const t = rels()[Number(el.dataset.k)] as any; if (!t) return;
        const f = el.dataset.f!, v = el.value;
        if (f === 'together') { delete t.status; delete t.was; if (v === 'ex') t.was = 'ex'; else if (v) t.status = v; }
        else if (v) t[f] = v; else delete t[f];
        notify();
    },
    'ngr-pair': (el) => { wz()[el.dataset.f === 'a' ? 'rela' : 'relb'] = el.value; },
    'ngf-set': (el) => { const f = familyOf()[Number(el.dataset.k)]; if (!f) return; if (el.value) f.type = el.value as FamilyType; else delete f.type; },
    'ngf-new-f': (el) => { const n = wz().famNew as NewChar | null; if (n) (n as any)[el.dataset.f!] = el.value; },
    'ngf-q': (el) => { wz().famQ = el.value; notify(); },
});
