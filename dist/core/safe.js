// Safety for what comes from files other people make (world files, cards, chats, the AI's replies).
// · Pictures and numbers from a world go into style="" attributes: a picture address can only be a picture
//   (http, https, a data: picture or sound, a blob), and it can never close the url('…') or the attribute.
// · Every piece of HTML Mundi draws is cleaned before it reaches the page: no on…= handlers, no javascript: links,
//   no <script>, <iframe>, <object>… So even a value that slipped through cannot run code.
// · Text sent through SillyTavern's slash commands cannot carry a {: … :} block (STscript runs those).
// Thanks to coldasblues, whose fork found these.
/** A picture or sound address made safe for CSS url('…') and for src/href: '' when it is not one. */
export function safeUrl(u) {
    let s = String(u ?? '').trim();
    if (!s)
        return '';
    if (/^data:/i.test(s)) {
        if (!/^data:(image|audio|video)\/[a-z0-9.+-]+[;,]/i.test(s))
            return '';
    }
    else if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^(https?|blob):/i.test(s))
        return ''; // javascript:, vbscript:, file:…
    // nothing that can close a quote, a url( ) or an attribute, or start a CSS escape
    return s.replace(/["'()\\<>\s`]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}
/** A number (from a file) that can only be a number. */
export const num = (v, d = 0) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : d; };
/** A plain CSS color (#hex, rgb()/hsl() with numbers, or a color name), or ''. */
export const cssColor = (c) => { const s = String(c ?? '').trim(); return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/+-]+\)|[a-z]{3,30}|transparent)$/i.test(s) ? s : ''; };
const NUM_KEYS = new Set(['x', 'y', 'w', 'h', 'ratio', 'zoom', 'pct', 'left', 'top', 'width', 'height']);
const COLOR_KEYS = new Set(['color', 'glow', 'tint', 'accent']);
/** A world (or anything from a file) cleaned in place: numbers stay numbers, colors stay colors, spots are numbers. */
export function cleanData(o) {
    const walk = (v, depth) => {
        if (!v || typeof v !== 'object' || depth > 40)
            return;
        if (Array.isArray(v)) {
            for (const x of v)
                walk(x, depth + 1);
            return;
        }
        for (const k of Object.keys(v)) {
            const x = v[k];
            if (NUM_KEYS.has(k) && x !== undefined && x !== null && typeof x !== 'number' && typeof x !== 'object')
                v[k] = num(x);
            else if (COLOR_KEYS.has(k) && typeof x === 'string' && !cssColor(x))
                delete v[k];
            else if ((k === 'symbol' || k === 'icon') && typeof x === 'string')
                v[k] = x.replace(/[<>"'&`\\]/g, '').slice(0, 16); // shown as they are (money, chips)
            else if (k === 'spots' && Array.isArray(x))
                v[k] = x.map((p) => Array.isArray(p) ? p.map((n) => num(n)) : p);
            else
                walk(x, depth + 1);
        }
    };
    walk(o, 0);
    return o;
}
const BAD_TAGS = 'script,iframe,frame,frameset,object,embed,applet,base,meta,link,form,portal';
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href', 'srcset', 'poster', 'data', 'background'];
/** Removes what could run code from a tree that is not on the page yet (a <template>'s content). */
export function cleanTree(root) {
    root.querySelectorAll(BAD_TAGS).forEach(el => el.remove());
    root.querySelectorAll('*').forEach(el => {
        for (const a of Array.from(el.attributes)) {
            const n = a.name.toLowerCase();
            if (n.startsWith('on'))
                el.removeAttribute(a.name);
            else if (URL_ATTRS.includes(n) && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value.replace(/[\u0000-\u001f\s]+/g, '')))
                el.removeAttribute(a.name);
            else if (n === 'style' && /expression\s*\(|javascript:|@import/i.test(a.value))
                el.removeAttribute(a.name);
        }
    });
}
/** HTML that came from a message (the AI's reply, a card, a chat someone shared): it can't carry Mundi's own controls,
 *  so a reply with <div data-act="…"> can't make a click do something in Mundi. (Ids go too: they could take
 *  the place of Mundi's.) */
export function stripControls(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    cleanTree(t.content);
    t.content.querySelectorAll('*').forEach(el => { for (const a of Array.from(el.attributes))
        if (a.name.startsWith('data-') || a.name === 'id' || a.name === 'for' || a.name === 'form')
            el.removeAttribute(a.name); });
    return t.innerHTML;
}
/** Puts `html` into `el`, cleaned. */
export function setHtml(el, html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    cleanTree(t.content);
    el.replaceChildren(t.content);
}
/** The text of a piece of HTML, without loading anything it names (an <img> in it never loads). */
export const htmlText = (html) => { const t = document.createElement('template'); t.innerHTML = String(html ?? ''); return (t.content.textContent ?? '').trim(); };
/** Text that goes after a slash command: no pipe (the next command) and no {: … :} block (STscript would run it). */
export const scriptText = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\{:/g, '{ :').replace(/:\}/g, ': }');
