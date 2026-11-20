// Rows that scroll sideways (the Shop's, Collection's and Lens's tabs, a conversation's quick replies, the library's
// tabs…) with a mouse: drag them like a finger on a phone, or turn the wheel over them (the page under them doesn't
// scroll). A drag never counts as a click on what's under it. Only rows that scroll sideways and not up and down; the map and the map editor keep their own.
const SKIP = '.mu-map, .mu-me-stage, input, textarea, select, [contenteditable], [data-nodrag]';
const DRAG_AFTER = 5; // pixels before a press becomes a drag
// The row under the pointer that can scroll sideways (and only sideways).
function rowAt(el, root) {
    for (let x = el; x && x !== root; x = x.parentElement) {
        if (x.closest(SKIP))
            return null;
        if (x.scrollWidth > x.clientWidth + 2 && x.scrollHeight <= x.clientHeight + 2) {
            const o = getComputedStyle(x).overflowX;
            if (o === 'auto' || o === 'scroll')
                return x;
        }
    }
    return null;
}
export function attachHScroll(root) {
    let row = null, x0 = 0, left0 = 0, dragged = false;
    root.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0)
            return; // (touch scrolls by itself)
        row = rowAt(e.target, root);
        if (!row)
            return;
        x0 = e.clientX;
        left0 = row.scrollLeft;
        dragged = false;
    });
    root.addEventListener('pointermove', (e) => {
        if (!row)
            return;
        const dx = e.clientX - x0;
        if (!dragged && Math.abs(dx) < DRAG_AFTER)
            return;
        if (!dragged) {
            dragged = true;
            row.classList.add('is-dragging');
        }
        row.scrollLeft = left0 - dx;
    });
    const end = () => { if (row)
        row.classList.remove('is-dragging'); row = null; };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    // the click that ends a drag is not a click
    root.addEventListener('click', (e) => { if (dragged) {
        dragged = false;
        e.preventDefault();
        e.stopPropagation();
    } }, true);
    // the wheel over a sideways row scrolls it sideways, and only it: at its end it stops there, the page under it
    // doesn't scroll instead (a trackpad's own sideways swipe passes through)
    root.addEventListener('wheel', (e) => {
        if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))
            return;
        const r = rowAt(e.target, root);
        if (!r)
            return;
        r.scrollLeft += e.deltaY;
        e.preventDefault();
    }, { passive: false });
}
