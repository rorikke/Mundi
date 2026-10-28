// Interface sounds: Kenney's UI Audio pack (CC0, assets/sfx) played through WebAudio.
// Every file is decoded once, on the first click (browsers only allow audio after a user gesture), and then played
// from memory, so a click never waits for a download. Until the files are ready, a tiny synthesized tone is used.
// On/off and volume in Settings → Interface.
import { UI, asset } from '../core/store.js';
// Each sound: one or more layers { f: file, r: playback rate (pitch), v: volume, at: delay in seconds }.
// To swap a sound, change the file name: any of the 50 files in assets/sfx works (click1-5, rollover1-6, switch1-38...).
const SOUNDS = {
    click: [{ f: 'click2', v: 0.7 }],
    open: [{ f: 'switch7', v: 0.6 }],
    back: [{ f: 'switch13', v: 0.6, r: 0.9 }],
    success: [{ f: 'switch26', v: 0.6 }, { f: 'click4', v: 0.45, r: 1.35, at: 0.09 }],
    error: [{ f: 'switch16', v: 0.55, r: 0.72 }],
    warn: [{ f: 'click5', v: 0.6, r: 0.85 }, { f: 'click5', v: 0.6, r: 0.85, at: 0.13 }],
    info: [{ f: 'rollover3', v: 0.5 }],
    msg: [{ f: 'rollover1', v: 0.55, r: 1.15 }],
    notify: [{ f: 'switch28', v: 0.55, r: 1.1 }],
    tutorial: [{ f: 'rollover6', v: 0.6 }],
};
// fallback tones while the files load: [frequency, duration]
const TONES = { click: [520, 0.06], open: [640, 0.1], back: [420, 0.08], success: [880, 0.14], error: [200, 0.16], warn: [440, 0.1], info: [760, 0.09], msg: [990, 0.12], notify: [1100, 0.12], tutorial: [600, 0.12] };
let ac = null, master = null, last = 0, live = 0;
const buffers = new Map(); // file -> AudioBuffer | null (failed) | Promise (loading)
const on = () => { try {
    return UI().sound !== false;
}
catch {
    return true;
} };
const vol = () => { try {
    return Math.max(0, Math.min(100, UI().volume ?? 50)) / 100;
}
catch {
    return 0.5;
} };
function ctxAudio() {
    if (!ac) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC)
            return null;
        const a = new AC();
        ac = a;
        master = a.createGain();
        const comp = a.createDynamicsCompressor(); // prevents clipping when several sounds overlap
        master.connect(comp);
        comp.connect(a.destination);
        preload();
    }
    const a = ac;
    if (a.state === 'suspended')
        a.resume().catch(() => { });
    return a;
}
// Decodes every file the sound table uses, once. A missing file just keeps the fallback tone.
function preload() {
    const files = new Set(Object.values(SOUNDS).flat().map(l => l.f));
    for (const f of files) {
        if (buffers.has(f))
            continue;
        const job = fetch(asset(`sfx/${f}.mp3`))
            .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then(data => new Promise((res, rej) => ac.decodeAudioData(data, res, rej)))
            .then(buf => { buffers.set(f, buf); })
            .catch(() => { buffers.set(f, null); });
        buffers.set(f, job);
    }
}
function track(node, ...extra) {
    live++;
    node.onended = () => { live--; try {
        node.disconnect();
        for (const n of extra)
            n.disconnect();
    }
    catch { /* already gone */ } };
}
function layer(a, { f, r = 1, v = 0.6, at = 0 }) {
    const buf = buffers.get(f);
    if (!buf || typeof buf.getChannelData !== 'function')
        return false; // still loading (a Promise) or failed (null)
    const src = a.createBufferSource(), g = a.createGain();
    src.buffer = buf;
    src.playbackRate.value = r;
    g.gain.value = v;
    src.connect(g);
    g.connect(master);
    track(src, g);
    src.start(a.currentTime + at);
    return true;
}
function tone(a, [f, dur]) {
    const t0 = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.008); // short attack, no pop
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    track(o, g);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
}
export function play(name = 'click') {
    try {
        if (!on() || vol() <= 0)
            return;
        const now = performance.now();
        if (now - last < 45 || live > 8)
            return; // never stacks too many sounds
        const a = ctxAudio();
        if (!a || a.state === 'closed')
            return;
        last = now;
        master.gain.value = vol();
        const layers = SOUNDS[name] ?? SOUNDS.click;
        let played = false;
        for (const l of layers)
            played = layer(a, l) || played;
        if (!played)
            tone(a, TONES[name] ?? TONES.click);
    }
    catch { /* sound is only an extra: it must never break the game */ }
}
// Which sound a clicked control makes: a data-sfx attribute wins; otherwise it is guessed from the action name.
const BACK = /(back|close|cancel|exit|to-menu|settings-back)/i;
const OPEN = /(open|enter|new|go|start|travel|to-map|to-scene|settings|ng-next|menu-)/i;
function soundFor(el) {
    if (el.dataset?.sfx)
        return el.dataset.sfx;
    const act = el.dataset?.act ?? '';
    if (act === 'menu-view')
        return el.dataset.v === 'main' ? 'back' : 'open';
    if (BACK.test(act))
        return 'back';
    if (OPEN.test(act))
        return 'open';
    return 'click';
}
export function installSfx() {
    globalThis.__muSfx = play;
    document.addEventListener('click', (e) => {
        const el = e.target?.closest?.('#mundi-root button, #mundi-root [data-act], #mundi-root .mu-pin');
        if (!el || el.disabled)
            return;
        play(soundFor(el));
    }, true);
}
/* ---------- life sounds, made on the fly (no files): water, food, shower, work, sleep, rain ---------- */
export function noiseBuffer(a, seconds) {
    const b = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
    const d = b.getChannelData(0);
    let last2 = 0;
    for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        last2 = (last2 + 0.02 * w) / 1.02;
        d[i] = last2 * 3.5 + w * 0.15;
    } // soft, brownish noise
    return b;
}
function noise(a, at, dur, freq, q, v, type = 'bandpass') {
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = noiseBuffer(a, dur + 0.05);
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + Math.min(0.05, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    track(src, f, g);
    src.start(at);
    src.stop(at + dur + 0.05);
}
function blip(a, at, f0, f1, dur, v, type = 'sine') {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(master);
    track(o, g);
    o.start(at);
    o.stop(at + dur + 0.03);
}
const LIFE = {
    // a few gulps
    water: (a, t) => { for (let i = 0; i < 3; i++)
        blip(a, t + i * 0.28, 180, 420, 0.12, 0.35); },
    // crunching
    food: (a, t) => { for (let i = 0; i < 4; i++)
        noise(a, t + i * 0.22 + Math.random() * 0.05, 0.09, 2200, 1.2, 0.5); },
    // running water
    shower: (a, t) => noise(a, t, 1.8, 3200, 0.6, 0.35, 'highpass'),
    // typing, then a little bell
    work: (a, t) => { for (let i = 0; i < 7; i++)
        noise(a, t + i * 0.09 + Math.random() * 0.03, 0.035, 3500, 3, 0.4); blip(a, t + 0.8, 1320, 1320, 0.5, 0.18, 'triangle'); },
    // a soft, low chime
    sleep: (a, t) => { blip(a, t, 523, 523, 1.2, 0.12, 'sine'); blip(a, t + 0.25, 392, 392, 1.4, 0.1, 'sine'); },
};
export function lifeSound(kind) {
    try {
        if (!on() || vol() <= 0 || !LIFE[kind])
            return;
        const a = ctxAudio();
        if (!a)
            return;
        master.gain.value = vol();
        LIFE[kind](a, a.currentTime + 0.02);
    }
    catch { /* sound is only an extra */ }
}
// Which sound an action makes, from what it does.
export function actionSound(effects = {}, id = '') {
    if (/shower|bath|wash/i.test(id) || (effects.hygiene ?? 0) >= 40)
        return lifeSound('shower');
    if ((effects.hunger ?? 0) > 0)
        return lifeSound('food');
    if ((effects.thirst ?? 0) > 0)
        return lifeSound('water');
}
/** (E12) The shared output for the place sounds (ui/ambience.ts): the context and the master volume, once the browser
 *  allows sound (after the first click); null before, or with sound off. */
export function audioOut() {
    try {
        if (!on() || vol() <= 0)
            return null;
        const a = ctxAudio();
        if (!a || a.state !== 'running' || !master)
            return null;
        master.gain.value = vol();
        return { a, out: master };
    }
    catch {
        return null;
    }
}
// Rain: a quiet loop while it rains where you are (the map and scenes).
let rainNode = null;
export function rainAmbience(raining) {
    try {
        const want = raining && on() && vol() > 0;
        if (!want) {
            if (rainNode) {
                const n = rainNode;
                rainNode = null;
                n.g.gain.setTargetAtTime(0.0001, n.src.context.currentTime, 0.4);
                setTimeout(() => { try {
                    n.src.stop();
                }
                catch { /* gone */ } }, 1500);
            }
            return;
        }
        if (rainNode)
            return;
        const a = ctxAudio();
        if (!a || a.state !== 'running')
            return; // only after the first click (browsers' rule)
        master.gain.value = vol();
        const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
        src.buffer = noiseBuffer(a, 4);
        src.loop = true;
        f.type = 'lowpass';
        f.frequency.value = 2400;
        g.gain.setValueAtTime(0.0001, a.currentTime);
        g.gain.setTargetAtTime(0.16, a.currentTime, 0.8);
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start();
        rainNode = { src, g };
    }
    catch { /* sound is only an extra */ }
}
