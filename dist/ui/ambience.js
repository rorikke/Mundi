// Place sounds (E12): a quiet loop of what you hear where you are (sim/sound.ts decides what and how loud). Every sound
// is made on the fly with WebAudio (filtered noise, a few tones: no files, nothing to license), unless the world gives
// a file of its own for a tag (`sounds`, a looped file in the world's folder; a file that won't load falls back to the
// made one). It plays only with the interface sounds on and "Place sounds" on (Settings → Sound), through the same
// output as the interface sounds, after the first click (the browser's rule). Sound is an extra: nothing here may break
// the game.
import { UI } from '../core/store.js';
import { worldFile } from '../core/world.js';
import { audioOut } from './sfx.js';
const on = () => { try {
    return UI().sound !== false && UI().ambience !== false;
}
catch {
    return false;
} };
/** The place sounds' own volume (0–1), on top of the interface volume. */
export const ambienceVolume = () => { try {
    return Math.max(0, Math.min(100, UI().ambienceVolume ?? 60)) / 100;
}
catch {
    return 0.6;
} };
const noiseFor = new WeakMap();
// Two seconds of soft noise, made once per context and looped.
function noise(a) {
    let b = noiseFor.get(a);
    if (!b) {
        b = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
        const d = b.getChannelData(0);
        let last = 0;
        for (let i = 0; i < d.length; i++) {
            const w = Math.random() * 2 - 1;
            last = (last + 0.02 * w) / 1.02;
            d[i] = last * 3.5 + w * 0.15;
        }
        noiseFor.set(a, b);
    }
    return b;
}
const env = (g, t, v, attack, dur) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
const done = (src, ...rest) => { src.onended = () => { try {
    src.disconnect();
    for (const n of rest)
        n.disconnect();
}
catch { /* gone */ } }; };
/** A tone gliding from f0 to f1. */
function tone(a, out, t, f0, f1, dur, v, type = 'sine') {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, v, Math.min(0.01, dur / 4), dur);
    o.connect(g);
    g.connect(out);
    done(o, g);
    o.start(t);
    o.stop(t + dur + 0.05);
}
/** A burst of filtered noise. */
function burst(a, out, t, dur, freq, q, v, type = 'bandpass', attack = 0.005) {
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noise(a);
    s.loop = true;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    env(g, t, v, Math.min(attack, dur / 2), dur);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    done(s, f, g);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
}
// A struck bell: a few partials dying away slowly.
function bell(a, out, t, base, v, dur) {
    for (const [k, m] of [[1, 1], [2.01, 0.5], [2.76, 0.35], [5.4, 0.15]])
        tone(a, out, t, base * k, base * k * 0.998, dur / (k > 2 ? 2 : 1), v * m);
}
const CROWD = [{ type: 'bandpass', f: 700, q: 0.8, g: 0.2, lfo: [0.3, 0.3] }, { type: 'lowpass', f: 300, g: 0.08 }];
const WIND = [{ type: 'lowpass', f: 380, g: 0.12, lfo: [0.07, 0.7] }];
const HUM = { f: 100, g: 0.03, hum: true };
const clink = (a, o, t) => { const f = 2600 + Math.random() * 1400; tone(a, o, t, f, f, 0.3, 0.05); tone(a, o, t, f * 2.7, f * 2.7, 0.15, 0.015); };
const chirp = (a, o, t) => { const f = 2400 + Math.random() * 1800; for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++)
    tone(a, o, t + i * 0.14, f, f * (0.8 + Math.random() * 0.5), 0.09, 0.04); };
const thump = (v) => (a, o, t) => { tone(a, o, t, 70, 40, 0.2, v); burst(a, o, t, 0.03, 3000, 1, v * 0.15, 'highpass'); };
const RECIPES = {
    crowd: { beds: CROWD },
    traffic: { beds: [{ type: 'lowpass', f: 260, g: 0.2, lfo: [0.08, 0.5] }], events: [{ every: 10, fn: (a, o, t) => burst(a, o, t, 1.6, 500, 0.6, 0.12, 'lowpass', 0.7) }] },
    // a station: the crowd, a melody before announcements, and now and then a train
    station: { beds: CROWD, events: [{ every: 45, fn: (a, o, t) => [659, 523, 587, 392].forEach((f, i) => tone(a, o, t + i * 0.42, f, f, 0.6, 0.05, 'triangle')) },
            { every: 70, fn: (a, o, t) => burst(a, o, t, 5, 110, 0.7, 0.2, 'lowpass', 1.5) }] },
    // the walk signal's "piyo-piyo" for a few seconds, now and then
    crossing: { beds: CROWD, events: [{ every: 50, fn: (a, o, t) => { for (let i = 0; i < 8; i++) {
                    tone(a, o, t + i, 2500, 2050, 0.11, 0.05);
                    tone(a, o, t + i + 0.22, 2300, 1900, 0.11, 0.045);
                } } }] },
    cicadas: { beds: [{ type: 'bandpass', f: 4800, q: 3, g: 0.1, lfo: [38, 0.8] }, { type: 'bandpass', f: 6200, q: 4, g: 0.05, lfo: [27, 0.7] }] },
    birds: { events: [{ every: 2.5, fn: chirp }] },
    izakaya: { beds: [{ type: 'bandpass', f: 850, q: 1, g: 0.24, lfo: [0.5, 0.35] }, { type: 'lowpass', f: 260, g: 0.08 }], events: [{ every: 3, fn: clink }, { every: 12, fn: (a, o, t) => burst(a, o, t, 0.6, 1300, 2, 0.08, 'bandpass', 0.05) }] },
    bar: { beds: [{ type: 'bandpass', f: 700, q: 1.2, g: 0.1, lfo: [0.2, 0.4] }], events: [{ every: 7, fn: clink }] },
    kitchen: { beds: [{ type: 'highpass', f: 3200, g: 0.06, lfo: [7, 0.5] }], events: [{ every: 5, fn: (a, o, t) => { for (let i = 0; i < 3; i++)
                    burst(a, o, t + i * 0.09, 0.05, 2500, 3, 0.06, 'bandpass'); } }] },
    karaoke: { beds: [{ type: 'lowpass', f: 420, g: 0.05, lfo: [0.5, 0.5] }], beat: { bpm: 100, fn: thump(0.08) } },
    club: { beds: [{ type: 'lowpass', f: 180, g: 0.08 }], beat: { bpm: 124, fn: thump(0.2) } },
    arcade: { beds: [{ type: 'bandpass', f: 2000, q: 0.7, g: 0.04 }], events: [{ every: 0.6, fn: (a, o, t) => { const f = 300 + Math.random() * 1200; tone(a, o, t, f, f * (Math.random() < 0.5 ? 2 : 0.5), 0.08, 0.025, 'square'); } }] },
    pachinko: { beds: [{ type: 'highpass', f: 5000, g: 0.09, lfo: [12, 0.6] }, { type: 'bandpass', f: 900, q: 1, g: 0.06 }],
        events: [{ every: 5, fn: (a, o, t) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(a, o, t + i * 0.07, f, f, 0.1, 0.03, 'square')) }] },
    temple: { beds: WIND, events: [{ every: 50, fn: (a, o, t) => bell(a, o, t, 98, 0.12, 7) }] },
    shrine: { beds: WIND, events: [{ every: 25, fn: (a, o, t) => { for (let i = 0; i < 9; i++) {
                    const f = 3200 + Math.random() * 1200;
                    tone(a, o, t + i * 0.06, f, f, 0.12, 0.02);
                } } },
            { every: 40, fn: (a, o, t) => { burst(a, o, t, 0.04, 1500, 1.5, 0.12); burst(a, o, t + 0.35, 0.04, 1500, 1.5, 0.12); } }] },
    waves: { beds: [{ type: 'lowpass', f: 520, g: 0.26, lfo: [0.12, 0.9] }] },
    wind: { beds: WIND },
    water: { beds: [{ type: 'highpass', f: 1800, g: 0.08 }, { type: 'bandpass', f: 600, q: 0.8, g: 0.05, lfo: [0.4, 0.3] }] },
    office: { beds: [HUM, { type: 'lowpass', f: 200, g: 0.04 }], events: [{ every: 1.2, fn: (a, o, t) => { for (let i = 0; i < 1 + Math.floor(Math.random() * 5); i++)
                    burst(a, o, t + i * 0.11, 0.03, 3200, 3, 0.04); } }] },
    hospital: { beds: [HUM], events: [{ every: 2.4, fn: (a, o, t) => tone(a, o, t, 1000, 1000, 0.12, 0.025) }] },
    train: { beds: [{ type: 'lowpass', f: 130, g: 0.22, lfo: [1.3, 0.5] }] },
    market: { beds: CROWD, events: [{ every: 6, fn: (a, o, t) => { const f = 220 + Math.random() * 120; tone(a, o, t, f, f * 0.8, 0.5, 0.025, 'sawtooth'); } }] },
    rain: { beds: [{ type: 'lowpass', f: 2400, g: 0.1 }] },
};
const voices = new Map();
const files = new Map(); // url → decoded, failed (null), or loading
let timer = null;
let ctx = null, outNode = null;
function startBeds(a, v, beds) {
    for (const b of beds) {
        const g = a.createGain();
        g.gain.value = b.g;
        if (b.hum) {
            for (const k of [1, 2]) {
                const o = a.createOscillator();
                o.frequency.value = b.f * k;
                const h = a.createGain();
                h.gain.value = k === 1 ? 1 : 0.3;
                o.connect(h);
                h.connect(g);
                o.start();
                v.srcs.push(o);
                v.nodes.push(h);
            }
        }
        else {
            const s = a.createBufferSource(), f = a.createBiquadFilter();
            s.buffer = noise(a);
            s.loop = true;
            f.type = b.type ?? 'lowpass';
            f.frequency.value = b.f;
            f.Q.value = b.q ?? 0.7;
            s.connect(f);
            f.connect(g);
            s.start(a.currentTime, Math.random() * 2);
            v.srcs.push(s);
            v.nodes.push(f);
            if (b.lfo) {
                const o = a.createOscillator(), d = a.createGain();
                o.frequency.value = b.lfo[0];
                d.gain.value = b.g * b.lfo[1];
                o.connect(d);
                d.connect(g.gain);
                o.start();
                v.srcs.push(o);
                v.nodes.push(d);
            }
        }
        g.connect(v.g);
        v.nodes.push(g);
    }
}
function start(a, out, s, w) {
    const v = { key: keyOf(s), g: a.createGain(), nodes: [], srcs: [], nextBeat: a.currentTime + 0.5 };
    v.g.gain.value = 0.0001;
    v.g.connect(out);
    const url = s.file && w ? worldFile(w, s.file) : '';
    const buf = url ? files.get(url) : undefined;
    if (url && buf === undefined)
        loadFile(a, url, v.key);
    if (url && buf && typeof buf.getChannelData === 'function') {
        const src = a.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(v.g);
        src.start();
        v.srcs.push(src);
    }
    else {
        v.recipe = RECIPES[s.tag];
        if (v.recipe?.beds)
            startBeds(a, v, v.recipe.beds);
    }
    return v;
}
// A world's own file for a tag: fetched and decoded once (a failure keeps the made sound).
function loadFile(a, url, key) {
    const job = fetch(url)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then(data => new Promise((res, rej) => a.decodeAudioData(data, res, rej)))
        .then(b => { files.set(url, b); const v = voices.get(key); if (v)
        stop(v); }) // the file takes over on the next draw
        .catch(() => { files.set(url, null); });
    files.set(url, job);
}
function stop(v) {
    voices.delete(v.key);
    try {
        const t = v.g.context.currentTime;
        v.g.gain.cancelScheduledValues(t);
        v.g.gain.setTargetAtTime(0.0001, t, 0.5);
        setTimeout(() => { try {
            for (const s of v.srcs)
                s.stop();
            for (const n of [...v.nodes, v.g])
                n.disconnect();
        }
        catch { /* gone */ } }, 2500);
    }
    catch { /* gone */ }
}
const keyOf = (s) => `${s.tag}|${s.file ?? ''}`;
// Four times a second: each sound's events, by chance, and its beats, a little ahead.
function tick() {
    const a = ctx, out = outNode;
    if (!a || !out || a.state !== 'running')
        return;
    for (const v of voices.values()) {
        const r = v.recipe;
        if (!r)
            continue;
        for (const e of r.events ?? [])
            if (Math.random() < 0.25 / e.every)
                e.fn(a, v.g, a.currentTime + 0.05 + Math.random() * 0.2);
        if (r.beat) {
            const step = 60 / r.beat.bpm;
            if (v.nextBeat < a.currentTime)
                v.nextBeat = a.currentTime + 0.05;
            while (v.nextBeat < a.currentTime + 0.4) {
                r.beat.fn(a, v.g, v.nextBeat);
                v.nextBeat += step;
            }
        }
    }
}
/** Plays these sounds (the place you're at), fading the others out; an empty list (or sound off) stops everything.
 *  Cheap when nothing changed: called after every draw. */
export function syncAmbience(list, w = null) {
    try {
        const vol = ambienceVolume();
        if (!on() || vol <= 0)
            list = [];
        const io = list.length ? audioOut() : null;
        if (list.length && !io)
            return; // not allowed yet (before the first click): tried again on the next draw
        if (io) {
            ctx = io.a;
            outNode = io.out;
        }
        const keys = new Set(list.map(keyOf));
        for (const v of [...voices.values()])
            if (!keys.has(v.key) || v.g.context !== ctx)
                stop(v);
        for (const s of list) {
            let v = voices.get(keyOf(s));
            if (!v) {
                v = start(io.a, io.out, s, w);
                voices.set(v.key, v);
            }
            v.g.gain.setTargetAtTime(Math.max(0.0001, s.level * vol), io.a.currentTime, 0.8);
        }
        if (voices.size && !timer)
            timer = setInterval(tick, 250);
        if (!voices.size && timer) {
            clearInterval(timer);
            timer = null;
        }
    }
    catch { /* sound is only an extra */ }
}
/** What is playing now (tags), for the tests and the settings screen. */
export const playingNow = () => [...voices.keys()].map(k => k.split('|')[0]);
