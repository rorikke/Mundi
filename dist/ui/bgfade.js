"use strict";
// The scene's background changes softly: when the picture of the same place changes (morning, afternoon, evening,
// night…), the old picture stays on top and fades out slowly over the new one, once the new one is loaded (so it never
// flashes empty). Moving to another place still changes it at once. No loading screen: only the background.
// The old picture is a child of .mu-scene-bg (marked data-morph-skip, so redrawing the screen leaves it alone),
// under the scene's shading (.mu-scene-bg::after).
const FADE_MS = 3000;
const urlOf = (style) => /url\((['"]?)(.*?)\1\)/.exec(style)?.[2] ?? '';
const still = () => { try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
catch {
    return false;
} };
function fade(bg, oldStyle) {
    const now = bg.getAttribute('style') ?? '';
    const from = urlOf(oldStyle), to = urlOf(now);
    if (!from || from === to || still())
        return;
    const old = document.createElement('div');
    old.className = 'mu-scene-bg-old';
    old.setAttribute('style', oldStyle);
    bg.appendChild(old);
    let started = false;
    const go = () => {
        if (started)
            return;
        started = true;
        old.style.transition = `opacity ${FADE_MS}ms ease-in-out`;
        requestAnimationFrame(() => requestAnimationFrame(() => { old.style.opacity = '0'; }));
        setTimeout(() => old.remove(), FADE_MS + 300);
    };
    if (!to) {
        go();
        return;
    }
    const img = new Image();
    img.src = to;
    (img.decode ? img.decode() : Promise.resolve()).then(go, go);
    setTimeout(go, 4000); // a picture that takes too long: fade anyway
}
const watch = new MutationObserver(records => {
    // per background, in this batch: its style before the change, and whether the place changed with it
    const seen = new Map();
    for (const r of records) {
        const el = r.target;
        if (!el.classList?.contains('mu-scene-bg'))
            continue;
        const x = seen.get(el) ?? { style: null, moved: false };
        if (r.attributeName === 'data-place')
            x.moved = x.moved || r.oldValue !== el.getAttribute('data-place');
        if (r.attributeName === 'style' && x.style === null)
            x.style = r.oldValue ?? '';
        seen.set(el, x);
    }
    for (const [el, x] of seen)
        if (x.style !== null && !x.moved)
            fade(el, x.style);
});
watch.observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'data-place'] });
