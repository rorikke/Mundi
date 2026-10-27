// A person's own ways, the same panel in every editor (the in-game People tab, the new game, the World creator, the
// Library cast presets): gender, attraction, how fast their feelings grow, and their intimacy and relationship styles.
// Each editor registers a scope that reads and writes its own copy (the save, the new-game draft, the world's example
// cast); the panel only knows the `Person` shape.
import { esc, notify } from '../core/store.js';
import { PRESETS as INTIMACY, R_NAME, F_NAME } from '../sim/intimacy.js';
import { INPUT } from './reg.js';
export const SCOPES = {};
const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(label)}</option>`;
const PP = { custom: new Set() }; // attraction shown as sliders even when the values match a preset
const key = (scope, id) => `${scope}|${id}`;
const data = (scope, id) => `data-scope="${esc(scope)}" data-id="${esc(id)}"`;
/* ---------- attraction presets ---------- */
const mult = (p, gid, m) => p?.att?.[gid]?.[m] ?? 1;
// "everyone", "none", "only:<gender>" or "custom", from the values.
export function attPreset(p, gs) {
    if (gs.some(x => mult(p, x.id, 'f') !== 1))
        return 'custom';
    const r = gs.map(x => mult(p, x.id, 'r'));
    if (r.every(v => v === 1))
        return 'everyone';
    if (r.every(v => v === 0))
        return 'none';
    const ones = gs.filter(x => mult(p, x.id, 'r') === 1);
    return ones.length === 1 && r.filter(v => v === 0).length === gs.length - 1 ? `only:${ones[0].id}` : 'custom';
}
function setAttPreset(p, preset, gs) {
    if (preset === 'custom')
        return;
    delete p.att;
    const only = preset.startsWith('only:') ? preset.slice(5) : '';
    if (preset === 'none' || only)
        p.att = Object.fromEntries(gs.filter(x => x.id !== only).map(x => [x.id, { r: 0 }]));
}
/* ---------- the panel ---------- */
function genderHtml(scope, id, p, gs) {
    const known = !p?.gender || gs.some(x => x.id === p.gender);
    return `<label class="mu-field"><span>Gender</span><select data-input="pp" data-k="gender" ${data(scope, id)}>${opt('', 'Not set', !p?.gender)}${gs.map(x => opt(x.id, x.name, p?.gender === x.id)).join('')}${known ? '' : opt(p.gender, p.gender, true)}</select></label>`;
}
function attractionHtml(scope, id, p, gs, romance, you) {
    if (!gs.length)
        return '';
    const preset = attPreset(p, gs), custom = preset === 'custom' || PP.custom.has(key(scope, id));
    const slider = (x, m) => {
        const v = Math.round(mult(p, x.id, m) * 100);
        return `<label class="mu-field slider"><span>${m === 'r' ? 'Romance' : 'Friendship'} · ${esc(x.name)} · ${v}%</span><input type="range" min="0" max="100" step="5" value="${v}" data-input="pp" data-k="att" data-g="${esc(x.id)}" data-m="${m}" ${data(scope, id)}></label>`;
    };
    return `${romance ? `<label class="mu-field"><span>Attracted to</span><select data-input="pp" data-k="attp" ${data(scope, id)}>${opt('everyone', 'Everyone (default)', !custom && preset === 'everyone')}${gs.map(x => opt(`only:${x.id}`, `Only: ${x.name}`, !custom && preset === `only:${x.id}`)).join('')}${opt('none', 'No one', !custom && preset === 'none')}${opt('custom', 'Custom', custom)}</select></label>` : ''}
        ${custom || !romance ? `<p class="mu-muted">How fast feelings grow toward each gender (100% is normal, 0% never). Losses are never changed.</p>
            ${gs.map(x => `<div class="mu-row2">${romance ? slider(x, 'r') : ''}${slider(x, 'f')}</div>`).join('')}` : ''}
        ${you ? '<small class="mu-muted">Yours only sorts the dating app: while you play someone, their own feelings wait. It counts again once you stop playing them.</small>' : ''}`;
}
function paceHtml(scope, id, p, romance) {
    const PACES = [['', 'World default'], ['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']];
    const sel = (m, label) => `<label class="mu-field"><span>${label}</span><select data-input="pp" data-k="pace" data-m="${m}" ${data(scope, id)}>${PACES.map(([v, l]) => opt(v, l, (p?.pace?.[m] ?? '') === v)).join('')}</select></label>`;
    return `<div class="mu-row2">${sel('f', 'Friendship grows')}${romance ? sel('r', 'Romance grows') : ''}</div>`;
}
// What they need before getting intimate (and whether only with a partner), and one partner or several.
function waysHtml(scope, id, p) {
    const i = p?.intimacy ?? {}, preset = i.preset ?? 'steady';
    const presets = [['steady', 'Steady (default): a crush, and friends'], ['free', 'Free spirit: a spark is enough'], ['passionate', 'Passionate: a crush, no friendship needed'], ['slow', 'Slow to trust: a crush, and close friends'], ['devoted', 'Devoted: deeply in love, and best friends'], ['custom', 'Custom']];
    const base = preset === 'custom' ? { r: i.r ?? 'crush', f: i.f ?? 'friend' } : INTIMACY[preset] ?? INTIMACY.steady;
    return `<label class="mu-field"><span>Before getting intimate, they need</span><select data-input="pp" data-k="intim" data-f="preset" ${data(scope, id)}>${presets.map(([v, l]) => opt(v, l, preset === v)).join('')}</select></label>
        ${preset === 'custom' ? `<div class="mu-row2"><label class="mu-field"><span>Romance</span><select data-input="pp" data-k="intim" data-f="r" ${data(scope, id)}>${Object.keys(R_NAME).map(v => opt(v, R_NAME[v], base.r === v)).join('')}</select></label>
            <label class="mu-field"><span>Friendship</span><select data-input="pp" data-k="intim" data-f="f" ${data(scope, id)}>${Object.keys(F_NAME).map(v => opt(v, F_NAME[v], base.f === v)).join('')}</select></label></div>` : ''}
        <label class="mu-check"><input type="checkbox" data-input="pp" data-k="partner" ${data(scope, id)} ${i.casual === false ? 'checked' : ''}><span>Only with a partner<small>Nothing casual and no night together that's more than a sleepover until you're a couple, however they feel.</small></span></label>
        <label class="mu-field"><span>Relationships</span><select data-input="pp" data-k="style" ${data(scope, id)}>${opt('', 'World default', !p?.style)}${opt('exclusive', 'Exclusive: one partner', p?.style === 'exclusive')}${opt('open', 'Open: fine with more than one', p?.style === 'open')}</select></label>`;
}
// The parts asked for, for one person of a scope. `you`: the person you play (no pace or styles: you play them).
export function personPanel(scope, id, parts, opts = {}) {
    const s = SCOPES[scope];
    if (!s)
        return '';
    const p = s.get(id), gs = s.genders(), romance = s.romance();
    return parts.map(part => part === 'gender' ? genderHtml(scope, id, p, gs)
        : part === 'attraction' ? attractionHtml(scope, id, p, gs, romance, !!opts.you)
            : part === 'pace' ? paceHtml(scope, id, p, romance)
                : romance ? waysHtml(scope, id, p) : '').join('');
}
/* ---------- editing ---------- */
// Drops what is back to the default, so an untouched person stores nothing.
export function tidyPerson(p) {
    if (p.att) {
        for (const [k, v] of Object.entries(p.att)) {
            if (v.f === 1)
                delete v.f;
            if (v.r === 1)
                delete v.r;
            if (v.f === undefined && v.r === undefined)
                delete p.att[k];
        }
        if (!Object.keys(p.att).length)
            delete p.att;
    }
    if (p.pace && !p.pace.f && !p.pace.r)
        delete p.pace;
    if (p.intimacy && !Object.keys(p.intimacy).length)
        delete p.intimacy;
    if (!p.gender)
        delete p.gender;
    if (!p.style)
        delete p.style;
    return Object.keys(p).length ? p : undefined;
}
function edit(el, fn) {
    const s = SCOPES[el.dataset.scope];
    const id = el.dataset.id;
    if (!s)
        return;
    const p = structuredClone(s.get(id) ?? {});
    fn(p, s);
    s.set(id, tidyPerson(p));
    notify();
}
Object.assign(INPUT, {
    pp: (el) => {
        const v = el.value, k = el.dataset.k, m = el.dataset.m;
        if (k === 'attp') {
            const kk = key(el.dataset.scope, el.dataset.id);
            if (v === 'custom')
                PP.custom.add(kk);
            else
                PP.custom.delete(kk);
        }
        edit(el, (p, s) => {
            if (k === 'gender')
                p.gender = v || undefined;
            else if (k === 'attp')
                setAttPreset(p, v, s.genders());
            else if (k === 'att') {
                const e = ((p.att ??= {})[el.dataset.g] ??= {});
                e[m] = Math.max(0, Math.min(1, Number(v) / 100));
            }
            else if (k === 'pace') {
                const pc = (p.pace ??= {});
                if (v)
                    pc[m] = v;
                else
                    delete pc[m];
            }
            else if (k === 'intim') {
                const i = (p.intimacy ??= {}), f = el.dataset.f;
                if (f === 'preset') {
                    const was = INTIMACY[(i.preset ?? 'steady')]; // custom starts from the preset it leaves
                    if (v === 'custom') {
                        i.r ??= was?.r ?? 'crush';
                        i.f ??= was?.f ?? 'friend';
                    }
                    else {
                        delete i.r;
                        delete i.f;
                    }
                    if (v === 'steady')
                        delete i.preset;
                    else
                        i.preset = v;
                }
                else if (f === 'r')
                    i.r = v;
                else if (f === 'f')
                    i.f = v;
            }
            else if (k === 'partner') {
                const i = (p.intimacy ??= {});
                if (el.checked)
                    i.casual = false;
                else
                    delete i.casual;
            }
            else if (k === 'style')
                p.style = (v || undefined);
        });
    },
});
