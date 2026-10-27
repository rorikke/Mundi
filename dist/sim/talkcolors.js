// Each speaker's colour for their dialogue (the "…" in their lines), when Chat look's "Colour each speaker's dialogue"
// is on. Who decides, in order: a colour set on the card (`data.extensions.mundi.color`; yours is per persona, in the
// interface settings), then your AI (one background call that reads the cards, the colours of their pictures and who is often
// together), then hue spacing in code when the AI can't answer. Code makes every chosen colour readable on the
// dialogue box and keeps it apart from the others, above all from the people they are often with. The result is kept
// in the save (`talk`), so a colour never changes by itself.
import { UI, saveSettings, saveGame, notify, game, TUT } from '../core/store.js';
import { charOf, speakerOf, fullCharacter, fetchSprites, quiet, thumb, persona, personaThumb, personaName, personas } from '../st/bridge.js';
import { ties, homeKey } from './living.js';
import { couplePairs, YOU } from './rel.js';
import { swapOf, playing } from './playas.js';
export const ME = '__you'; // your own character in `talk` (the one you play by default)
const U = () => UI();
export const talkOn = () => !!U().talkColors;
const store = (g) => (g.talk ??= {});
export const cleanHex = (s) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s ?? '').trim()); return m ? `#${m[1].toLowerCase()}` : ''; };
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function hexToLab(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => toLin(v / 255));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
// Linear sRGB of an OKLab colour (values outside 0..1 are outside what a screen shows).
function labToLin([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const linToHex = (rgb) => `#${rgb.map(v => Math.round(Math.min(1, Math.max(0, toGam(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0')).join('')}`;
const lch = (L, C, h) => [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)];
const hueOf = (x) => (Math.atan2(x[2], x[1]) * 180 / Math.PI + 360) % 360;
const chromaOf = (x) => Math.hypot(x[1], x[2]);
const dist = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
// The colour at this lightness and hue, as saturated as asked or as the screen allows.
function shade(L, C, h) {
    for (let c = C; c > 0; c -= 0.005) {
        const x = lch(L, c, h);
        if (labToLin(x).every(v => v >= -0.0005 && v <= 1.0005))
            return x;
    }
    return lch(L, 0, h);
}
const labHex = (x) => linToHex(labToLin(x));
// The lightness and saturation that read well on the dialogue box: light colours when the main text is light (a dark
// box, Mundi's default), darker ones when it is dark.
function readable() {
    const main = anyHex(U().colors?.main);
    const dark = !main || hexToLab(main)[0] > 0.6;
    return dark ? { L: 0.80, L2: 0.70, C: 0.13 } : { L: 0.48, L2: 0.38, C: 0.14 };
}
// "#rrggbb" from a colour of Chat look ("#rrggbb", "#rrggbbaa" or "rgba(r, g, b, a)"), its transparency left out.
function anyHex(v) {
    const t = String(v ?? '').trim();
    const h = /^#([0-9a-f]{6})/i.exec(t);
    if (h)
        return `#${h[1].toLowerCase()}`;
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(t);
    return m ? `#${[m[1], m[2], m[3]].map(x => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('')}` : '';
}
// A colour the AI (or the code) chose, at the readable lightness and saturation, keeping its hue. A colour the code
// placed on the second, darker (or lighter) ring stays there; a `raw` one (the AI's own) always starts on the first.
const fitCache = new Map();
function fit(hex, raw = false) {
    const r = readable(), k = `${hex}|${r.L}|${raw}`;
    let out = fitCache.get(k);
    if (!out) {
        const x = hexToLab(hex);
        const L = !raw && Math.abs(x[0] - r.L2) < 0.02 ? r.L2 : r.L;
        out = labHex(shade(L, r.C, hueOf(x)));
        fitCache.set(k, out);
    }
    return out;
}
// How far apart colours must be: wide with few people, narrower as more share the wheel (a second ring of slightly
// darker colours opens past ten). People who are rarely together only need to be apart a little.
function needed(n, C) {
    const ring = n > 10 ? Math.ceil(n / 2) : Math.max(3, n);
    return Math.min(0.08, 0.7 * 2 * C * Math.sin(Math.PI / ring));
}
// How far a colour is from the nearest one taken; with `loose`, people rarely together count as farther than they are.
const score = (x, taken, loose = false) => taken.reduce((lo, t) => Math.min(lo, dist(x, t.lab) / (loose && !t.close ? 0.6 : 1)), Infinity);
// The colour closest to the one wanted (a hue from the AI or the picture) that is far enough from those taken: from
// everyone if there is room, else from the people often together; with none far enough, the one farthest from all.
function place(want, taken, n, salt) {
    const r = readable(), need = needed(n, r.C);
    const pref = want ? hexToLab(fit(want, true)) : null;
    const cands = [];
    for (let h = 0; h < 360; h += 5) {
        cands.push(shade(r.L, r.C, h));
        if (n > 10)
            cands.push(shade(r.L2, r.C, h));
    }
    const start = pref ?? shade(r.L, r.C, hash(salt) % 360); // no wish: a hue from the name, for variety
    for (const loose of [false, true]) {
        if (pref && score(pref, taken, loose) >= need)
            return labHex(pref);
        const ok = cands.filter(c => score(c, taken, loose) >= need);
        if (ok.length)
            return labHex(ok.reduce((b, c) => (dist(c, start) < dist(b, start) ? c : b)));
    }
    return labHex(cands.reduce((b, c) => (score(c, taken) > score(b, taken) ? c : b)));
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return h >>> 0; }
/* ---------- pictures ---------- */
// The picture that shows a person best: their neutral expression sprite (the usual folder, not an outfit), which is
// mostly hair and clothes on a transparent background; without sprites, their avatar (a persona's for you).
export async function pictureOf(g, id) {
    if (id === ME)
        return { url: personaThumb(myPersona(g)), kind: 'avatar' };
    const list = id.startsWith('__') ? [] : await fetchSprites(id, '');
    const hit = list.find(x => String(x.label).toLowerCase() === 'neutral') ?? list[0];
    return hit?.path ? { url: String(hit.path), kind: 'sprite' } : { url: thumb(id), kind: 'avatar' };
}
// The two or three strongest colours of RGBA pixels, measured in OKLab (where a pale lavender counts as a colour
// and a dark brown barely does): greys, near-black (outlines, dark hair, the dark of shadows) and near-white are left
// out, and skin tones count for little, so clothes, eyes and bright hair lead. Each pixel weighs as much as it is
// colourful.
export function paletteOf(d) {
    const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
    let all = 0;
    for (let i = 0; i + 3 < d.length; i += 4) {
        if (d[i + 3] < 128)
            continue;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const x = hexToLab(`#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`);
        const C = chromaOf(x), h = hueOf(x);
        if (x[0] < 0.3 || x[0] > 0.97 || C < 0.025)
            continue;
        const skin = h >= 25 && h <= 80 && C < 0.11 && x[0] > 0.4;
        const w = C * (skin ? 0.15 : 1), bin = bins[Math.floor(h / 15) % 24];
        bin.w += w;
        bin.r += r * w;
        bin.g += g * w;
        bin.b += b * w;
        all += w;
    }
    return bins.filter(x => x.w > all * 0.08).sort((x, y) => y.w - x.w).slice(0, 3)
        .map(x => `#${[x.r, x.g, x.b].map(v => Math.round(v / x.w).toString(16).padStart(2, '0')).join('')}`);
}
// A picture's colours (see paletteOf), read once per picture from a small copy of it.
const palettes = new Map();
export function pictureColors(url) {
    if (!url || typeof document === 'undefined' || typeof Image === 'undefined')
        return Promise.resolve([]);
    let p = palettes.get(url);
    if (!p) {
        p = new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                try {
                    const W = 48, H = Math.max(12, Math.min(96, Math.round(W * img.naturalHeight / Math.max(1, img.naturalWidth))));
                    const cv = document.createElement('canvas');
                    cv.width = W;
                    cv.height = H;
                    const cx = cv.getContext('2d', { willReadFrequently: true });
                    cx.drawImage(img, 0, 0, W, H);
                    resolve(paletteOf(cx.getImageData(0, 0, W, H).data));
                }
                catch {
                    resolve([]);
                }
            };
            img.onerror = () => resolve([]);
            img.src = url;
        });
        palettes.set(url, p);
    }
    return p;
}
/* ---------- who has which colour ---------- */
const cardColor = (avatar) => cleanHex(charOf(avatar)?.data?.extensions?.mundi?.color);
// Your own persona file (the one you started with, also while you play someone else).
export const myPersona = (g) => (g && swapOf(g)?.orig) || persona();
export const myColor = (g) => cleanHex(U().meColors?.[myPersona(g)]);
export function setMyColor(g, hex) {
    const m = (U().meColors ??= {});
    const f = myPersona(g);
    if (hex)
        m[f] = hex;
    else {
        delete m[f];
        forget(ME);
    }
    saveSettings();
}
const want = new Set(); // people seen without a colour, for the next round
const missed = new Set(); // …each noted once, so a redraw never starts a round by itself again
let soon = 0;
const later = () => { if (!soon)
    soon = window.setTimeout(() => { soon = 0; const g = game(); if (g)
        void ensure(g); }, 50); };
let lastGame = null;
// Someone's colour was taken away (from their card, or yours): they get one again the next time they need it.
export const forget = (id) => { missed.delete(id); };
// A person's colour ('' = none yet: one is on its way). `id` is a card's avatar file or ME.
export function colorOf(g, id) {
    if (g !== lastGame) {
        lastGame = g;
        missed.clear();
        want.clear();
    }
    if (id === ME) {
        const m = myColor(g);
        if (m)
            return m;
    }
    else {
        const c = cardColor(id);
        if (c)
            return c;
    }
    const e = store(g)[id];
    if (e?.c)
        return e.by === 'card' ? e.c : fit(e.c);
    // your original character, now a person of the world after "Play as", keeps your colour
    const s = swapOf(g);
    if (s?.origCard === id)
        return colorOf(g, ME);
    if (!missed.has(id)) {
        missed.add(id);
        want.add(id);
        later();
    }
    return '';
}
// The colour of a line of the chat ('' for the narrator, system lines, or while off). `file` reads the persona file
// of a line of yours.
export function lineColor(m, file) {
    const g = game();
    if (!g || !talkOn() || !m || m.is_system || m.extra?.mundi_narrator)
        return '';
    if (m.is_user) {
        // a line of yours: whoever you were playing when you wrote it (each one has a persona of their own)
        const s = swapOf(g);
        if (!s)
            return colorOf(g, ME);
        const f = file(String(m.force_avatar ?? ''));
        const who = !f ? playing(g) : f === s.orig ? '' : (Object.entries(s.files ?? {}).find(([, pf]) => pf === f)?.[0] ?? playing(g));
        return colorOf(g, who || ME);
    }
    const avatar = speakerOf(m);
    return avatar ? colorOf(g, avatar) : '';
}
// What decided someone's colour, for the list in Chat look.
export function sourceOf(g, id) {
    if (id === ME && myColor(g))
        return 'mine';
    if (id !== ME && cardColor(id))
        return 'card';
    return store(g)[id]?.by ?? '';
}
// Setting a colour on a card (or clearing it): kept in the save too, so it shows while the card is loaded without its
// data (SillyTavern's lazy loading).
export function noteCardColor(g, avatar, hex) {
    const s = store(g);
    if (hex)
        s[avatar] = { c: hex, by: 'card' };
    else {
        delete s[avatar];
        forget(avatar);
    }
    saveGame();
}
/* ---------- asking the AI ---------- */
export const TALK = { busy: false, failed: '' };
const tried = new Set(); // asked this session (an answer that didn't come is asked again next time)
// The people who need a colour: you (without your own), the cast, and anyone else who spoke.
function everyone(g) {
    return [...new Set([ME, ...Object.keys(g.cast), ...want])];
}
const nameOf = (g, id) => (id === ME ? personaName(myPersona(g)) : g.cast[id]?.name ?? charOf(id)?.name ?? id);
// Pairs often in a scene together: a household, a couple, family and other ties.
function together(g) {
    const out = new Set(), me = (id) => (id === YOU ? (playing(g) || ME) : id);
    const add = (a, b) => { if (a !== b) {
        out.add(`${a}|${b}`);
        out.add(`${b}|${a}`);
    } };
    const homes = new Map();
    homes.set(homeKey(g.player.home), [playing(g) || ME]);
    for (const r of Object.values(g.cast)) {
        const k = homeKey(r.home);
        homes.set(k, [...(homes.get(k) ?? []), r.avatar]);
    }
    for (const list of homes.values())
        for (const a of list)
            for (const b of list)
                add(a, b);
    for (const p of couplePairs(g))
        add(me(p.a), me(p.b));
    for (const t of ties(g))
        add(me(t.a), me(t.b));
    return out;
}
// Gives everyone without a colour one: a spaced one at once, then your AI's choice when it answers.
export async function ensure(g, again = false) {
    if (!talkOn() || TALK.busy)
        return;
    const s = store(g);
    if (again) {
        for (const [k, e] of Object.entries(s))
            if (e.by !== 'card')
                delete s[k];
        tried.clear();
        missed.clear();
    }
    const ids = everyone(g);
    want.clear();
    TALK.busy = true;
    try {
        // cards that SillyTavern loaded without their data are loaded in full (their colour and text are needed)
        for (const id of ids)
            if (id !== ME && charOf(id)?.shallow) {
                try {
                    await fullCharacter(id);
                }
                catch { /* the card is read as it is */ }
            }
        let dirty = false;
        for (const id of ids) {
            if (id === ME)
                continue;
            const c = cardColor(id), e = s[id];
            if (c) {
                if (e?.c !== c || e.by !== 'card') {
                    s[id] = { c, by: 'card' };
                    dirty = true;
                }
            }
            else if (e?.by === 'card' && charOf(id) && !charOf(id).shallow) {
                delete s[id];
                dirty = true;
            } // removed from the card
        }
        if (dirty)
            saveGame();
        const fixed = (id) => (id === ME ? !!myColor(g) : s[id]?.by === 'card');
        const todo = ids.filter(id => !fixed(id) && (!s[id] || (s[id].by === 'auto' && !tried.has(id))));
        if (!todo.length)
            return;
        notify();
        const close = together(g), n = ids.length;
        const narrator = anyHex(U().colors?.quote);
        const takenFor = (id, skip) => [
            ...(narrator ? [{ lab: hexToLab(narrator), close: true }] : []),
            ...ids.filter(o => o !== id && !skip.has(o)).map(o => ({ o, c: colorNow(g, o) })).filter(x => x.c).map(x => ({ lab: hexToLab(x.c), close: close.has(`${id}|${x.o}`) })),
        ];
        // first the spaced colours, so every line has one while the AI thinks
        const pics = new Map();
        for (const id of todo)
            pics.set(id, await pictureColors((await pictureOf(g, id)).url));
        for (const id of todo)
            if (!s[id])
                s[id] = { c: place(pics.get(id)?.[0] ?? '', takenFor(id, new Set()), n, nameOf(g, id)), by: 'auto' };
        saveGame();
        notify();
        if (TUT.save)
            return;
        let answer = {};
        try {
            answer = await askAi(g, todo, ids, pics, close, narrator);
            TALK.failed = '';
        }
        catch (e) {
            console.warn('[Mundi] dialogue colours', e);
            TALK.failed = String(e?.message ?? e);
        }
        for (const id of todo)
            tried.add(id);
        if (game() !== g)
            return; // another game was opened meanwhile
        // the AI's colours go in one by one (you first, then the people you know), each kept apart from those before
        const order = [...todo].sort((a, b) => (a === ME ? -1 : b === ME ? 1 : Number(!!g.cast[b]?.met) - Number(!!g.cast[a]?.met)));
        const pending = new Set(order);
        for (const id of order) {
            pending.delete(id);
            const c = answer[id];
            if (c)
                s[id] = { c: place(c, takenFor(id, pending), n, nameOf(g, id)), by: 'ai' };
        }
        saveGame();
    }
    finally {
        TALK.busy = false;
        if (want.size)
            later();
        notify();
    }
}
// A colour as it shows now, without asking for one.
function colorNow(g, id) {
    if (id === ME && myColor(g))
        return myColor(g);
    const c = id !== ME ? cardColor(id) : '';
    if (c)
        return c;
    const e = store(g)[id];
    return e?.c ? (e.by === 'card' ? e.c : fit(e.c)) : '';
}
const clip = (t, n) => { const s = t.replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };
async function askAi(g, todo, ids, pics, close, narrator) {
    const me = personaName(myPersona(g));
    const card = async (id) => {
        if (id === ME)
            return personas().find(p => p.file === myPersona(g))?.description ?? '';
        const c = await fullCharacter(id).catch(() => null) ?? charOf(id);
        return [c?.description, c?.personality].filter(Boolean).join(' ');
    };
    const fill = (t, name) => t.replace(/{{char}}/gi, name).replace(/{{user}}/gi, me);
    const rows = [];
    for (const id of todo) {
        const name = nameOf(g, id), p = pics.get(id) ?? [];
        rows.push(`- ${name}${id === ME ? ' (the player)' : ''}. ${p.length ? `Colors in their picture: ${p.join(', ')}. ` : ''}${clip(fill(await card(id), name), 300)}`.trim());
    }
    const taken = ids.filter(id => !todo.includes(id)).map(id => ({ id, c: colorNow(g, id) })).filter(x => x.c).map(x => `- ${nameOf(g, x.id)}: ${x.c}`);
    if (narrator)
        taken.unshift(`- the narrator: ${narrator}`);
    const pairs = [];
    for (const a of todo)
        for (const b of ids)
            if (a < b || !todo.includes(b))
                if (a !== b && close.has(`${a}|${b}`))
                    pairs.push(`${nameOf(g, a)} & ${nameOf(g, b)}`);
    const dark = readable().L > 0.6;
    const prompt = 'Each character\'s spoken words ("…") are shown in their own color, so readers can tell who is talking.\n' +
        'Choose one color for each character below that fits them (the colors in their picture, their personality, a color their description mentions) ' +
        'and is easy to tell apart from every other color here, above all from the people they are often with.\n' +
        `The words are shown on a ${dark ? 'dark' : 'light'} background: choose ${dark ? 'bright' : 'deep'}, saturated colors (no black, gray or white).\n\n` +
        (taken.length ? `Colors already taken (don't reuse them or come close):\n${taken.join('\n')}\n\n` : '') +
        (pairs.length ? `Often together: ${[...new Set(pairs)].slice(0, 60).join('; ')}.\n\n` : '') +
        `Characters:\n${rows.join('\n')}\n\nAnswer with one line per character and nothing else, exactly:\nName | #rrggbb`;
    const out = await quiet(prompt, Math.min(1500, 60 + todo.length * 24), 'You choose colors and answer in the exact format asked, with no other words.');
    return parseAnswer(out, todo.map(id => ({ id, name: nameOf(g, id) })));
}
// "Name | #rrggbb" lines; a name given twice goes to the next person of that name. Anything else is ignored.
export function parseAnswer(out, people) {
    const res = {};
    const norm = (s) => s.toLowerCase().replace(/[*_`"“”]/g, '').replace(/\s*\(the player\)\s*/, '').replace(/^\s*(?:[-•]|\d+[.)])\s*/, '').trim();
    for (const line of String(out ?? '').split('\n')) {
        const m = /^(.*?)\s*[|:–-]\s*(#?[0-9a-f]{6})\b/i.exec(line.trim());
        if (!m)
            continue;
        const name = norm(m[1]), c = cleanHex(m[2]);
        if (!c || chromaOf(hexToLab(c)) < 0.03)
            continue; // a grey says nothing about the hue
        const p = people.find(x => !res[x.id] && norm(x.name) === name);
        if (p)
            res[p.id] = c;
    }
    return res;
}
