// A person's own ways, the same panel in every editor (the in-game People tab, the new game, the World creator, the
// Library cast presets): gender, attraction, how fast their feelings grow, and their intimacy and relationship styles.
// Each editor registers a scope that reads and writes its own copy (the save, the new-game draft, the world's example
// cast); the panel only knows the `Person` shape. "Suggest from the cards" asks the AI about people without a gender
// and shows what it read until the player applies or dismisses it.
import { esc, notify } from '../core/store.js';
import type { GenderDef } from '../core/world.js';
import type { Person, Pace } from '../sim/rel.js';
import { PRESETS as INTIMACY, R_NAME, F_NAME, type RNeed, type FNeed } from '../sim/intimacy.js';
import { ACT, INPUT } from './reg.js';
import { fullCharacter } from '../st/bridge.js';
import { suggestFromCard } from '../sim/gender.js';

export interface PersonScope {
    get(id: string): Person | undefined;
    set(id: string, p: Person | undefined): void;
    genders(): GenderDef[];
    /** the romance system is on (attraction for romance, intimacy, relationships) */
    romance(): boolean;
    /** the people with a card to read ("Suggest from the cards") */
    cards?(): { id: string; avatar: string; name: string }[];
}
export const SCOPES: Record<string, PersonScope> = {};
export type Part = 'gender' | 'attraction' | 'pace' | 'ways';

const opt = (v: string, label: string, sel: boolean) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
const PP = { custom: new Set<string>() };   // attraction shown as sliders even when the values match a preset
const key = (scope: string, id: string) => `${scope}|${id}`;
const data = (scope: string, id: string) => `data-scope="${esc(scope)}" data-id="${esc(id)}"`;

/* ---------- attraction presets ---------- */

const mult = (p: Person | undefined, gid: string, m: 'f' | 'r') => p?.att?.[gid]?.[m] ?? 1;
// "everyone", "none", "only:<gender>" or "custom", from the values.
export function attPreset(p: Person | undefined, gs: GenderDef[]): string {
    if (gs.some(x => mult(p, x.id, 'f') !== 1)) return 'custom';
    const r = gs.map(x => mult(p, x.id, 'r'));
    if (r.every(v => v === 1)) return 'everyone';
    if (r.every(v => v === 0)) return 'none';
    const ones = gs.filter(x => mult(p, x.id, 'r') === 1);
    return ones.length === 1 && r.filter(v => v === 0).length === gs.length - 1 ? `only:${ones[0].id}` : 'custom';
}
function setAttPreset(p: Person, preset: string, gs: GenderDef[]) {
    if (preset === 'custom') return;
    delete p.att;
    const only = preset.startsWith('only:') ? preset.slice(5) : '';
    if (preset === 'none' || only) p.att = Object.fromEntries(gs.filter(x => x.id !== only).map(x => [x.id, { r: 0 }]));
}

/* ---------- the panel ---------- */

function genderHtml(scope: string, id: string, p: Person | undefined, gs: GenderDef[]): string {
    const known = !p?.gender || gs.some(x => x.id === p.gender);
    return `<label class="mu-field"><span>Gender</span><select data-input="pp" data-k="gender" ${data(scope, id)}>${opt('', 'Not set', !p?.gender)}${gs.map(x => opt(x.id, x.name, p?.gender === x.id)).join('')}${known ? '' : opt(p!.gender!, p!.gender!, true)}</select></label>`;
}
function attractionHtml(scope: string, id: string, p: Person | undefined, gs: GenderDef[], romance: boolean, you: boolean): string {
    if (!gs.length) return '';
    const preset = attPreset(p, gs), custom = preset === 'custom' || PP.custom.has(key(scope, id));
    const slider = (x: GenderDef, m: 'f' | 'r') => {
        const v = Math.round(mult(p, x.id, m) * 100);
        return `<label class="mu-field slider"><span>${m === 'r' ? 'Romance' : 'Friendship'} · ${esc(x.name)} · ${v}%</span><input type="range" min="0" max="100" step="5" value="${v}" data-input="pp" data-k="att" data-g="${esc(x.id)}" data-m="${m}" ${data(scope, id)}></label>`;
    };
    return `${romance ? `<label class="mu-field"><span>Attracted to</span><select data-input="pp" data-k="attp" ${data(scope, id)}>${opt('everyone', 'Everyone (default)', !custom && preset === 'everyone')}${gs.map(x => opt(`only:${x.id}`, `Only: ${x.name}`, !custom && preset === `only:${x.id}`)).join('')}${opt('none', 'No one', !custom && preset === 'none')}${opt('custom', 'Custom', custom)}</select></label>` : ''}
        ${custom || !romance ? `<p class="mu-muted">How fast feelings grow toward each gender (100% is normal, 0% never). Losses are never changed.</p>
            ${gs.map(x => `<div class="mu-row2">${romance ? slider(x, 'r') : ''}${slider(x, 'f')}</div>`).join('')}` : ''}
        ${you ? '<small class="mu-muted">Yours only sorts the dating app: while you play someone, their own feelings wait. It counts again once you stop playing them.</small>' : ''}`;
}
function paceHtml(scope: string, id: string, p: Person | undefined, romance: boolean): string {
    const PACES: [string, string][] = [['', 'World default'], ['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']];
    const sel = (m: 'f' | 'r', label: string) => `<label class="mu-field"><span>${label}</span><select data-input="pp" data-k="pace" data-m="${m}" ${data(scope, id)}>${PACES.map(([v, l]) => opt(v, l, (p?.pace?.[m] ?? '') === v)).join('')}</select></label>`;
    return `<div class="mu-row2">${sel('f', 'Friendship grows')}${romance ? sel('r', 'Romance grows') : ''}</div>`;
}
// What they need before getting intimate (and whether only with a partner), and one partner or several.
function waysHtml(scope: string, id: string, p: Person | undefined): string {
    const i = p?.intimacy ?? {}, preset = i.preset ?? 'steady';
    const presets: [string, string][] = [['steady', 'Steady (default): a crush, and friends'], ['free', 'Free spirit: a spark is enough'], ['passionate', 'Passionate: a crush, no friendship needed'], ['slow', 'Slow to trust: a crush, and close friends'], ['devoted', 'Devoted: deeply in love, and best friends'], ['custom', 'Custom']];
    const base = preset === 'custom' ? { r: i.r ?? 'crush', f: i.f ?? 'friend' } : INTIMACY[preset as keyof typeof INTIMACY] ?? INTIMACY.steady;
    return `<label class="mu-field"><span>Before getting intimate, they need</span><select data-input="pp" data-k="intim" data-f="preset" ${data(scope, id)}>${presets.map(([v, l]) => opt(v, l, preset === v)).join('')}</select></label>
        ${preset === 'custom' ? `<div class="mu-row2"><label class="mu-field"><span>Romance</span><select data-input="pp" data-k="intim" data-f="r" ${data(scope, id)}>${(Object.keys(R_NAME) as RNeed[]).map(v => opt(v, R_NAME[v], base.r === v)).join('')}</select></label>
            <label class="mu-field"><span>Friendship</span><select data-input="pp" data-k="intim" data-f="f" ${data(scope, id)}>${(Object.keys(F_NAME) as FNeed[]).map(v => opt(v, F_NAME[v], base.f === v)).join('')}</select></label></div>` : ''}
        <label class="mu-check"><input type="checkbox" data-input="pp" data-k="partner" ${data(scope, id)} ${i.casual === false ? 'checked' : ''}><span>Only with a partner<small>Nothing casual and no night together that's more than a sleepover until you're a couple, however they feel.</small></span></label>
        <label class="mu-field"><span>Relationships</span><select data-input="pp" data-k="style" ${data(scope, id)}>${opt('', 'World default', !p?.style)}${opt('exclusive', 'Exclusive: one partner', p?.style === 'exclusive')}${opt('open', 'Open: fine with more than one', p?.style === 'open')}</select></label>`;
}
// The parts asked for, for one person of a scope. `you`: the person you play (no pace or styles: you play them).
export function personPanel(scope: string, id: string, parts: Part[], opts: { you?: boolean } = {}): string {
    const s = SCOPES[scope]; if (!s) return '';
    const p = s.get(id), gs = s.genders(), romance = s.romance();
    return parts.map(part => part === 'gender' ? genderHtml(scope, id, p, gs)
        : part === 'attraction' ? attractionHtml(scope, id, p, gs, romance, !!opts.you)
        : part === 'pace' ? paceHtml(scope, id, p, romance)
        : romance ? waysHtml(scope, id, p) : '').join('');
}

/* ---------- suggestions from the cards ---------- */

// What the AI read in each card, waiting for the player to apply or dismiss it (nothing is set before that).
const SUG = { busy: '', list: {} as Record<string, { scope: string; id: string; name: string; p?: Person }> };
const untagged = (scope: string) => { const s = SCOPES[scope]; return (s?.cards?.() ?? []).filter(c => !s.get(c.id)?.gender && !SUG.list[key(scope, c.id)]); };
// One person's suggestion in words ("woman · attracted to men · slow to trust").
function sugWords(p: Person | undefined, gs: GenderDef[]): string {
    if (!p) return 'The card does not say.';
    const out: string[] = [];
    const d = gs.find(x => x.id === p.gender); if (d) out.push(d.name);
    if (p.att) { const yes = gs.filter(x => (p.att?.[x.id]?.r ?? 1) > 0); out.push(yes.length ? `attracted to: ${yes.map(x => x.name).join(', ')}` : 'attracted to no one'); }
    const preset = p.intimacy?.preset; if (preset && preset !== 'custom') out.push(INTIMACY[preset as keyof typeof INTIMACY]?.name ?? preset);
    if (p.intimacy?.casual === false) out.push('only with a partner');
    return out.join(' · ');
}
// The button (for people with no gender yet) and the suggestions waiting for an answer.
export function suggestHtml(scope: string): string {
    const s = SCOPES[scope]; if (!s?.cards) return '';
    const n = untagged(scope).length, gs = s.genders();
    const mine = Object.entries(SUG.list).filter(([, x]) => x.scope === scope);
    if (!gs.length || (!n && !mine.length && !SUG.busy)) return '';
    return `<section class="mu-panel mu-sug">
        <div class="mu-row"><button data-act="pp-suggest" data-scope="${esc(scope)}" ${n && !SUG.busy ? '' : 'aria-disabled="true"'}>${SUG.busy ? `<span>${esc(SUG.busy)}</span>` : `<span>Suggest from the cards</span>`}</button>
            <small class="mu-muted">${n ? `${n} without a gender. Your AI reads each card once (gender, attraction, intimacy); nothing changes until you apply it.` : 'Everyone has a gender.'}</small></div>
        ${mine.map(([k, x]) => `<div class="mu-sug-row"><b data-notr>${esc(x.name)}</b><small>${esc(sugWords(x.p, gs))}</small>
            <span>${x.p ? `<button class="mu-ghost" data-act="pp-sug" data-k="${esc(k)}" data-v="1">Apply</button>` : ''}<button class="mu-ghost" data-act="pp-sug" data-k="${esc(k)}">Dismiss</button></span></div>`).join('')}
        ${mine.filter(([, x]) => x.p).length > 1 ? `<button class="mu-primary" data-act="pp-sug-all" data-scope="${esc(scope)}">Apply all</button>` : ''}</section>`;
}

/* ---------- editing ---------- */

// Drops what is back to the default, so an untouched person stores nothing.
export function tidyPerson(p: Person): Person | undefined {
    if (p.att) {
        for (const [k, v] of Object.entries(p.att)) { if (v.f === 1) delete v.f; if (v.r === 1) delete v.r; if (v.f === undefined && v.r === undefined) delete p.att[k]; }
        if (!Object.keys(p.att).length) delete p.att;
    }
    if (p.pace && !p.pace.f && !p.pace.r) delete p.pace;
    if (p.intimacy && !Object.keys(p.intimacy).length) delete p.intimacy;
    if (!p.gender) delete p.gender;
    if (!p.style) delete p.style;
    return Object.keys(p).length ? p : undefined;
}
function edit(el: HTMLElement, fn: (p: Person, s: PersonScope) => void) {
    const s = SCOPES[el.dataset.scope!]; const id = el.dataset.id!; if (!s) return;
    const p: Person = structuredClone(s.get(id) ?? {});
    fn(p, s);
    s.set(id, tidyPerson(p));
    notify();
}

Object.assign(ACT, {
    'pp-suggest': async (el) => {
        const scope = el.dataset.scope!, s = SCOPES[scope]; if (!s || SUG.busy) return;
        const todo = untagged(scope);
        try {
            for (const [i, c] of todo.entries()) {
                SUG.busy = `Reading ${c.name}'s card (${i + 1}/${todo.length})…`; notify();
                const ch = await fullCharacter(c.avatar);
                const card = [ch?.description, ch?.personality, ch?.scenario].filter(Boolean).join('\n').replace(/{{char}}/g, c.name);
                let p: Person | undefined;
                try { p = card.trim() ? await suggestFromCard(c.name, card, s.genders()) : undefined; } catch (e) { console.warn('[Mundi] suggest', e); }
                SUG.list[key(scope, c.id)] = { scope, id: c.id, name: c.name, p };
                notify();
            }
        } finally { SUG.busy = ''; notify(); }
    },
    'pp-sug': (el) => {
        const x = SUG.list[el.dataset.k!]; if (!x) return;
        delete SUG.list[el.dataset.k!];
        if (el.dataset.v) applySuggestion(x.scope, x.id, x.p);
        notify();
    },
    'pp-sug-all': (el) => {
        for (const [k, x] of Object.entries(SUG.list)) if (x.scope === el.dataset.scope && x.p) { applySuggestion(x.scope, x.id, x.p); delete SUG.list[k]; }
        notify();
    },
});
// A confirmed suggestion goes on top of what the person has (their pace, age… stay).
function applySuggestion(scope: string, id: string, p: Person | undefined) {
    const s = SCOPES[scope]; if (!s || !p) return;
    const cur: Person = structuredClone(s.get(id) ?? {});
    if (p.gender) cur.gender = p.gender;
    if (p.att) cur.att = structuredClone(p.att);
    if (p.intimacy) cur.intimacy = { ...(cur.intimacy ?? {}), ...p.intimacy };
    s.set(id, tidyPerson(cur));
}

Object.assign(INPUT, {
    pp: (el) => {
        const v = (el as HTMLInputElement).value, k = el.dataset.k, m = el.dataset.m as 'f' | 'r';
        if (k === 'attp') { const kk = key(el.dataset.scope!, el.dataset.id!); if (v === 'custom') PP.custom.add(kk); else PP.custom.delete(kk); }
        edit(el, (p, s) => {
            if (k === 'gender') p.gender = v || undefined;
            else if (k === 'attp') setAttPreset(p, v, s.genders());
            else if (k === 'att') { const e = ((p.att ??= {})[el.dataset.g!] ??= {}); e[m] = Math.max(0, Math.min(1, Number(v) / 100)); }
            else if (k === 'pace') { const pc = (p.pace ??= {}); if (v) pc[m] = v as Pace; else delete pc[m]; }
            else if (k === 'intim') {
                const i = (p.intimacy ??= {}), f = el.dataset.f;
                if (f === 'preset') {
                    const was = INTIMACY[(i.preset ?? 'steady') as keyof typeof INTIMACY];   // custom starts from the preset it leaves
                    if (v === 'custom') { i.r ??= was?.r ?? 'crush'; i.f ??= was?.f ?? 'friend'; } else { delete i.r; delete i.f; }
                    if (v === 'steady') delete i.preset; else i.preset = v as any;
                }
                else if (f === 'r') i.r = v as RNeed; else if (f === 'f') i.f = v as FNeed;
            }
            else if (k === 'partner') { const i = (p.intimacy ??= {}); if ((el as HTMLInputElement).checked) i.casual = false; else delete i.casual; }
            else if (k === 'style') p.style = (v || undefined) as any;
        });
    },
});
