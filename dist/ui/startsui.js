// (E16) Starts on screen: the cards to choose one in the new game, the editor of a custom start (its premise, written
// by you or by your AI from lorebooks, the home area, money, a job, the people you already know, skill levels) shared by
// the new game and Library → Starts, where the starts you saved for each world are changed or deleted. A start of the
// world (or one you saved) can be copied into the custom one and changed for this game ("Change this start").
import { state, notify, esc, toast } from '../core/store.js';
import { getWorld, worlds, systemOn } from '../core/world.js';
import { FRIEND_TIERS, ROMANCE_TIERS } from '../sim/romance.js';
import { FAMILY_TYPES } from '../core/feel.js';
import { worldStarts, savedStarts, saveStart, deleteStart, cleanStart, findStart, CUSTOM_START } from '../sim/starts.js';
import { skillsOf } from '../sim/hobbies.js';
import { lorebooks, loadLore, quiet } from '../st/bridge.js';
import { money } from '../sim/needs.js';
import { icon } from './icons.js';
import { ACT, INPUT } from './reg.js';
/** A start copied into a draft to change it (its id isn't kept: saved, it becomes a start of your own). */
export const draftOf = (s) => {
    const c = JSON.parse(JSON.stringify(s));
    return { name: c.name, premise: c.premise ?? '', home: c.home, money: c.money, rent: c.rent, job: c.job, knows: c.knows ?? [], skills: c.skills, traits: c.traits, household: c.household, adult: c.adult, from: c.name };
};
export const blankStart = (w) => ({ name: '', premise: '', home: w?.homes.zones[0]?.id ?? '', money: w?.starts?.find(s => s.default)?.money ?? w?.starts?.[0]?.money ?? w?.catalogs.origins?.[0]?.money ?? 0, knows: [] });
// Each editor's draft and world: the new game's custom start, or the start open in the Library.
const LIB = { world: '', sel: '', draft: null };
const SC = {
    ng: { draft: () => (state.wizard ? (state.wizard.cstart ??= blankStart(getWorld(state.wizard.world))) : null), world: () => getWorld(state.wizard?.world ?? ''), adult: () => !!state.wizard?.adult },
    lib: { draft: () => LIB.draft, world: () => getWorld(LIB.world), adult: () => true },
};
const opt = (v, l, on) => `<option value="${esc(v)}" ${on ? 'selected' : ''}>${esc(l)}</option>`;
const zoneName = (w, id) => w.homes.zones.find(z => z.id === id)?.name ?? '';
const TOGETHER = [['', 'Not a couple'], ['casual', 'Something casual'], ['dating', 'Dating'], ['engaged', 'Engaged'], ['married', 'Married'], ['ex', 'Used to be together']];
const FAMILY_NAME = { parent: 'your parent', child: 'your child', sibling: 'your sibling', halfsibling: 'your half-sibling', grandparent: 'your grandparent',
    grandchild: 'your grandchild', uncle: 'your aunt or uncle', nephew: 'your niece or nephew', cousin: 'your cousin', stepparent: 'your stepparent', stepchild: 'your stepchild',
    stepsibling: 'your stepsibling', parentinlaw: 'your parent-in-law', childinlaw: 'your son- or daughter-in-law', siblinginlaw: 'your brother- or sister-in-law',
    godparent: 'your godparent', godchild: 'your godchild', guardian: 'your guardian', ward: 'your ward' };
/** The world's people a start has you living with (its `household`), among those in this game (`people`: their names;
 *  first names as the world writes them). None: the start has no household, or none of them is in the game. */
export function householdOf(w, s, people) {
    if (!s?.household)
        return [];
    return w.cast.examples.filter(e => e.household === s.household && people.includes(e.name)).map(e => e.name.split(/\s+/)[0]);
}
// The world's households to live with (id → who, and the area of their home), adult-only people only with adult content.
const householdsOf = (w, adult) => {
    const out = new Map();
    for (const e of w.cast.examples)
        if (e.household && (adult || !e.adult)) {
            const h = out.get(e.household) ?? { names: [], home: e.home };
            h.names.push(e.name.split(/\s+/)[0]);
            out.set(e.household, h);
        }
    return out;
};
/* ---------- choosing a start (new game) ---------- */
// The line under a start's name: where you live, and who you know already.
export function startFacts(w, s) {
    const knows = (s.knows ?? []).map(k => k.name.split(/\s+/)[0]);
    return [zoneName(w, s.home), knows.length ? `You know ${knows.slice(0, 4).join(', ')}${knows.length > 4 ? ` and ${knows.length - 4} more` : ''}` : ''].filter(Boolean).join(' · ');
}
/** The start cards of a world (its own, the ones you saved, Custom) and, for Custom, the editor. `on`: the id chosen. */
export function startPickHtml(w, on, adult) {
    const card = (s, mine) => `<button class="mu-origin ${on === s.id ? 'is-on' : ''}" data-act="ng-origin" data-id="${esc(s.id)}"><b data-notr>${esc(s.name)}</b><small>${s.money !== undefined ? money(w, s.money) : ''}${mine ? ' · yours' : ''}</small>
        ${startFacts(w, s) ? `<small class="mu-muted" data-notr>${esc(startFacts(w, s))}</small>` : ''}<p data-notr>${esc(s.desc ?? (s.premise ?? '').replace(/\{\{user\}\}/gi, 'you'))}</p></button>`;
    return `<section class="mu-origins mu-starts"><h3>Your start</h3><p class="mu-muted">Who you are when the story begins: where you live, what you have, who you already know.</p>
        <div class="mu-cards small">${worldStarts(w, adult).map(s => card(s, false)).join('')}${savedStarts(w.id).filter(s => adult || !s.adult).map(s => card(s, true)).join('')}
            <button class="mu-origin ${on === CUSTOM_START ? 'is-on' : ''}" data-act="ng-origin" data-id="${CUSTOM_START}"><b>Custom</b><p>Write your own premise, or let your AI write it from lorebooks; then choose your home, your money and whom you know.</p></button></div>
        ${on !== CUSTOM_START && findStart(w, on, adult) ? `<div class="mu-row"><button data-act="st-copy" data-id="${esc(on)}">${icon('edit')}<span>Change this start</span></button><small class="mu-muted">Copied into Custom, to change its premise, money, home, whom you know and your skills for this game.</small></div>` : ''}
        ${on === CUSTOM_START ? `<div class="mu-panel mu-situation-custom">${startEditorHtml('ng')}${aiPremiseHtml()}
            <div class="mu-row"><button data-act="st-save" data-scope="ng">${icon('save')}<span>Save as a start</span></button><small class="mu-muted">Keep it for this world's next games (Library → Starts).</small></div></div>` : ''}</section>`;
}
/* ---------- the editor ---------- */
export function startEditorHtml(scope) {
    const sc = SC[scope], d = sc.draft(), w = sc.world();
    if (!d)
        return '';
    const f = (k) => `data-input="st-f" data-scope="${scope}" data-k="${k}" data-focus="st-${scope}-${k}"`;
    const people = w ? w.cast.examples.filter(e => sc.adult() || !e.adult).map(e => e.name) : [];
    const love = !w || systemOn(w, 'romance');
    const jobs = w && systemOn(w, 'jobs') ? w.occupations.filter(o => o.hireable !== false && (sc.adult() || !o.adult)) : [];
    const known = (k, i) => {
        const sel = (key, list, v) => `<select data-input="st-k" data-scope="${scope}" data-i="${i}" data-k="${key}">${list.map(([x, l]) => opt(x, l, (v ?? '') === x)).join('')}</select>`;
        const names = people.includes(k.name) ? people : [k.name, ...people];
        return `<div class="mu-ties-add">${sel('name', names.map(n => [n, n]), k.name)}
            ${sel('family', [['', 'not family'], ...FAMILY_TYPES.map(t => [t, FAMILY_NAME[t]])], k.family)}
            ${sel('f', [['', 'Friendship as usual'], ...[...FRIEND_TIERS].reverse().map(t => [t.id, t.name])], k.f)}
            ${love ? `${sel('r', [['', 'No romance'], ...ROMANCE_TIERS.filter(t => t.id !== 'none').map(t => [t.id, t.name])], k.r)}${sel('together', TOGETHER, k.status ?? (k.was ? 'ex' : ''))}` : ''}
            <button class="mu-ibtn mu-ghost" data-act="st-k-del" data-scope="${scope}" data-i="${i}" title="Remove">${icon('x')}</button></div>`;
    };
    const households = w ? householdsOf(w, sc.adult()) : new Map();
    const skills = w ? skillsOf(w).filter(k => sc.adult() || !k.adult) : [];
    const has = Object.keys(d.skills ?? {});
    const free = skills.filter(k => !has.includes(k.id));
    const skillRow = (id) => `<div class="mu-ties-add"><select data-input="st-skill" data-scope="${scope}" data-from="${esc(id)}">${[...skills.filter(k => k.id === id || free.includes(k)).map(k => opt(k.id, k.name, k.id === id)), ...(skills.some(k => k.id === id) ? [] : [opt(id, id, true)])].join('')}</select>
        <input type="number" min="0" max="10" step="1" data-input="st-skill-lv" data-scope="${scope}" data-skill="${esc(id)}" value="${esc(d.skills?.[id] ?? 0)}" title="Level (0–10)">
        <button class="mu-ibtn mu-ghost" data-act="st-skill-del" data-scope="${scope}" data-skill="${esc(id)}" title="Remove">${icon('x')}</button></div>`;
    return `${d.from ? `<p class="mu-muted">${esc(`Based on ${d.from}: what you change here is for this game, unless you save it as a start.`)}</p>` : ''}
        <label class="mu-field"><span>Name</span><input ${f('name')} maxlength="60" value="${esc(d.name)}" placeholder="My start"></label>
        <label class="mu-field"><span>Premise (how the story starts; the AI is told this)</span><textarea rows="5" ${f('premise')} placeholder="Who you are, why you're here, and what's going on as the story begins. Write {{user}} for yourself.">${esc(d.premise)}</textarea></label>
        ${w && households.size ? `<label class="mu-field"><span>Who you live with</span><select ${f('household')}>${opt('', 'Nobody: a home of your own', !d.household)}${[...households].map(([id, h]) => opt(id, `${h.names.join(', ')} (${zoneName(w, h.home)})`, d.household === id)).join('')}${d.household && !households.has(d.household) ? opt(d.household, d.household, true) : ''}</select></label>` : ''}
        ${w ? `<div class="mu-row2">${d.household && households.has(d.household) ? `<label class="mu-field"><span>Where you live</span><input value="${esc(zoneName(w, d.home))}" disabled title="${esc('Their home, while you live with them')}"></label>` : `<label class="mu-field"><span>Where you live</span><select ${f('home')}>${w.homes.zones.map(z => opt(z.id, z.name, d.home === z.id)).join('')}</select></label>`}
            <label class="mu-field"><span>Money</span><input type="number" min="0" step="1" ${f('money')} value="${esc(d.money ?? '')}"></label></div>
        ${systemOn(w, 'bills') && w.rent ? `<label class="mu-field"><span>Rent you pay there, a week (empty: the home's own, ${esc(money(w, w.homes.zones.find(z => z.id === d.home)?.rent ?? 0))}; until you move)</span><input type="number" min="0" step="1" ${f('rent')} value="${esc(d.rent ?? '')}"></label>` : ''}
        ${jobs.length ? `<label class="mu-field"><span>A job to start with</span><select ${f('job')}>${opt('', 'None', !d.job)}${jobs.map(o => opt(o.id, o.name, d.job === o.id)).join('')}</select></label>` : ''}
        <h4>Whom you already know</h4><p class="mu-muted">The world's people who know you from the start, and how (only those in the game; your own characters are under "Your relations").</p>
        ${d.knows.map(known).join('') || '<p class="mu-muted">Nobody yet.</p>'}
        ${people.length ? `<button data-act="st-k-add" data-scope="${scope}">${icon('plus')}<span>Someone you know</span></button>` : ''}
        ${skills.length || has.length ? `<h4>Your skills</h4><p class="mu-muted">The levels you begin with (0–10).</p>${has.map(skillRow).join('') || '<p class="mu-muted">None.</p>'}
            ${free.length ? `<button data-act="st-skill-add" data-scope="${scope}">${icon('plus')}<span>A skill</span></button>` : ''}` : ''}
        ${d.traits?.length ? `<p class="mu-muted">${esc(`It also gives you ${d.traits.join(', ')}, added to the traits you pick.`)}</p>` : ''}` : ''}`;
}
// The new game: let your AI write the premise from one or more lorebooks.
function aiPremiseHtml() {
    const d = SC.ng.draft();
    const books = lorebooks().filter(b => !d.bq || b.toLowerCase().includes(String(d.bq).toLowerCase())).sort((a, b) => a.localeCompare(b));
    const chosen = d.books ?? [];
    return `<h4>Or let your AI write the premise from lorebooks</h4>
        <input class="mu-search" type="search" data-input="st-bq" data-focus="st-bq" placeholder="Search lorebooks" value="${esc(d.bq ?? '')}">
        <div class="mu-chips mu-situation-books">${books.slice(0, 60).map(b => `<button class="mu-chip ${chosen.includes(b) ? 'is-on' : ''}" data-act="st-book" data-name="${esc(b)}" data-notr>${esc(b)}</button>`).join('') || '<span class="mu-muted">No lorebooks.</span>'}</div>
        <div class="mu-row"><button class="mu-primary" data-act="st-gen" ${chosen.length && !d.busy ? '' : 'aria-disabled="true"'}>${icon('sparkles')}<span>${d.busy ? 'Writing…' : d.premise.trim() ? 'Write it again' : 'Write the premise'}</span></button><small class="mu-muted">${chosen.length} chosen</small></div>`;
}
// The lorebooks' text, short enough for one request.
export async function loreText(names, max = 9000) {
    const out = [];
    for (const n of names) {
        const data = await loadLore(n);
        for (const e of Object.values(data?.entries ?? {}))
            if (!e?.disable && e?.content)
                out.push(`- ${(e.comment || (e.key ?? [])[0] || '').toString().slice(0, 60)}: ${String(e.content).replace(/\s+/g, ' ').trim()}`);
    }
    return out.join('\n').slice(0, max);
}
/** The draft as a start (for the new game: its id is 'custom', the saved one's when it was saved). */
export function draftStart(d, id) {
    const { books, bq, busy, savedId, from, ...s } = d;
    void books;
    void bq;
    void busy;
    void savedId;
    void from;
    return cleanStart({ ...s, id, name: s.name.trim() || 'Custom' });
}
/* ---------- Library → Starts ---------- */
export function startsTabHtml() {
    const ws = worlds().filter(w => savedStarts(w.id).length);
    const rows = ws.flatMap(w => savedStarts(w.id).map(s => ({ w, s })));
    if (LIB.sel && !rows.some(r => r.w.id === LIB.world && r.s.id === LIB.sel)) {
        LIB.sel = '';
        LIB.draft = null;
    }
    return `<div class="mu-lib-body mu-cp">
        <aside class="mu-lib-list mu-panel mu-cp-list">${ws.map(w => `<h5 data-notr>${esc(w.name)}</h5>${savedStarts(w.id).map(s => `<button class="mu-cp-row ${LIB.world === w.id && LIB.sel === s.id ? 'is-on' : ''}" data-act="st-lib-sel" data-world="${esc(w.id)}" data-id="${esc(s.id)}"><b data-notr>${esc(s.name)}</b><small data-notr>${esc(startFacts(w, s) || (s.money !== undefined ? money(w, s.money) : ''))}</small></button>`).join('')}`).join('')
        || '<p class="mu-muted">No starts yet. Write a custom start in a new game and choose "Save as a start": it shows up here, for that world\'s next games.</p>'}</aside>
        <section class="mu-lib-detail mu-panel" data-keep="lib-detail">${LIB.draft ? `<div class="mu-row"><h3 data-notr>${esc(getWorld(LIB.world)?.name ?? '')}</h3>
                <button class="mu-primary mu-right" data-act="st-save" data-scope="lib">${icon('save')}<span>Save</span></button><button class="mu-ghost" data-act="st-lib-del">${icon('trash')}<span>Delete</span></button></div>
            ${startEditorHtml('lib')}` : '<p class="mu-muted mu-pad">Choose a start to change it.</p>'}</section></div>`;
}
Object.assign(ACT, {
    'st-k-add': (el) => {
        const sc = SC[el.dataset.scope], d = sc?.draft(), w = sc?.world();
        if (!d || !w)
            return;
        const name = w.cast.examples.find(e => (sc.adult() || !e.adult) && !d.knows.some(k => k.name === e.name))?.name;
        if (!name)
            return;
        d.knows.push({ name, f: 'acquaintance' });
        notify();
    },
    // a start of the world (or one you saved) copied into the custom one, to change it for this game
    'st-copy': (el) => {
        const wz = state.wizard, w = SC.ng.world();
        const s = w && findStart(w, el.dataset.id, !!wz?.adult);
        if (!wz || !s)
            return;
        wz.cstart = draftOf(s);
        wz.hero.origin = CUSTOM_START;
        notify();
    },
    // a skill level: the next skill of the world not there yet (at 1), removed
    'st-skill-add': (el) => {
        const sc = SC[el.dataset.scope], d = sc?.draft(), w = sc?.world();
        if (!d || !w)
            return;
        const k = skillsOf(w).find(x => (sc.adult() || !x.adult) && d.skills?.[x.id] === undefined);
        if (!k)
            return;
        d.skills = { ...(d.skills ?? {}), [k.id]: 1 };
        notify();
    },
    'st-skill-del': (el) => { const d = SC[el.dataset.scope]?.draft(); if (!d?.skills)
        return; const { [el.dataset.skill]: _gone, ...rest } = d.skills; void _gone; d.skills = Object.keys(rest).length ? rest : undefined; notify(); },
    'st-k-del': (el) => { const d = SC[el.dataset.scope]?.draft(); if (!d)
        return; d.knows.splice(Number(el.dataset.i), 1); notify(); },
    'st-book': (el) => { const d = SC.ng.draft(); if (!d)
        return; const n = el.dataset.name; const l = (d.books ??= []); d.books = l.includes(n) ? l.filter(b => b !== n) : [...l, n]; notify(); },
    'st-gen': async () => {
        const d = SC.ng.draft(), w = SC.ng.world();
        if (!d || !w || !d.books?.length || d.busy)
            return;
        d.busy = true;
        notify();
        try {
            const lore = await loreText(d.books);
            const people = (state.wizard?.wp ?? []).slice(0, 40).join(', ');
            const prompt = `You are setting up how an interactive story game begins. The world: ${w.name}. ${w.setting}\nSome of the people who live there: ${people || '(not chosen yet)'}.\n\nLorebook notes to adapt (use what fits; move it into this world):\n${lore}\n\nWrite the player's premise: 3 to 5 sentences, present tense, plain prose, no lists or headings. Say who {{user}} is, why {{user}} is here, and the situation the story starts with. Write {{user}} for the player. Reply with the premise only.`;
            const out = (await quiet(prompt, 400)).replace(/^\s*(premise\s*:)?\s*/i, '').trim();
            if (out)
                d.premise = out.slice(0, 4000);
            else
                toast('Your AI sent nothing back. Try again.', 'error');
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        d.busy = false;
        notify();
    },
    'st-save': (el) => {
        const scope = el.dataset.scope, sc = SC[scope], d = sc?.draft(), w = sc?.world();
        if (!d || !w)
            return;
        if (!d.name.trim()) {
            toast('Give the start a name first.', 'info');
            return;
        }
        const id = scope === 'lib' ? LIB.sel : d.savedId ?? `my${Date.now().toString(36)}`;
        const s = saveStart(w.id, draftStart(d, id));
        if (!s)
            return;
        if (scope === 'ng')
            d.savedId = s.id;
        toast(scope === 'ng' ? `Saved as "${s.name}" (Library → Starts).` : 'Saved.', 'success');
        notify();
    },
    'st-lib-sel': (el) => {
        const w = getWorld(el.dataset.world);
        const s = w && savedStarts(w.id).find(x => x.id === el.dataset.id);
        if (!w || !s)
            return;
        LIB.world = w.id;
        LIB.sel = s.id;
        LIB.draft = { ...JSON.parse(JSON.stringify(s)), knows: JSON.parse(JSON.stringify(s.knows ?? [])) };
        notify();
    },
    'st-lib-del': () => { if (!LIB.sel)
        return; deleteStart(LIB.world, LIB.sel); LIB.sel = ''; LIB.draft = null; toast('Start deleted.', 'info'); notify(); },
});
Object.assign(INPUT, {
    // text fields don't redraw while you type
    'st-f': (el) => {
        const d = SC[el.dataset.scope]?.draft();
        if (!d)
            return;
        const k = el.dataset.k, v = el.value;
        if (k === 'money' || k === 'rent')
            d[k] = v === '' ? undefined : Math.max(0, Math.round(Number(v) || 0));
        // living with a household: your home is in their area
        else if (k === 'household') {
            const sc = SC[el.dataset.scope], w = sc?.world();
            if (v) {
                d.household = v;
                const h = w && householdsOf(w, true).get(v);
                if (h)
                    d.home = h.home;
            }
            else
                delete d.household;
        }
        else
            d[k] = v;
        if (k === 'home' || k === 'job' || k === 'household')
            notify();
    },
    'st-k': (el) => {
        const d = SC[el.dataset.scope]?.draft();
        const kn = d?.knows[Number(el.dataset.i)];
        if (!kn)
            return;
        const k = el.dataset.k, v = el.value;
        if (k === 'together') {
            delete kn.status;
            delete kn.was;
            if (v === 'ex')
                kn.was = 'ex';
            else if (v)
                kn.status = v;
        }
        else if (v)
            kn[k] = v;
        else
            delete kn[k];
        notify();
    },
    // a skill changed for another (its level and place kept), a level held at 0–10
    'st-skill': (el) => {
        const d = SC[el.dataset.scope]?.draft();
        const from = el.dataset.from, to = el.value;
        if (!d?.skills || !to || to === from || d.skills[to] !== undefined)
            return;
        d.skills = Object.fromEntries(Object.entries(d.skills).map(([k, v]) => [k === from ? to : k, v]));
        notify();
    },
    'st-skill-lv': (el) => {
        const d = SC[el.dataset.scope]?.draft();
        const k = el.dataset.skill;
        if (!d?.skills || d.skills[k] === undefined || el.value === '')
            return;
        d.skills[k] = Math.max(0, Math.min(10, Math.round(Number(el.value) || 0)));
    },
    'st-bq': (el) => { const d = SC.ng.draft(); if (d) {
        d.bq = el.value;
        notify();
    } },
});
