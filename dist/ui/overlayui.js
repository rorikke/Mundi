// Overlay packs in Settings → Add-ons: the player picks a zip someone shared (a private overlay for a bundled world and
// its pictures, see the end of core/overlay.ts) and Mundi saves it into SillyTavern's user files, where the world
// reads it the next time the page loads. The content never comes with Mundi: only this way to install it.
import { notify, esc, toast } from '../core/store.js';
import { readZip } from '../core/zip.js';
import { packPlan } from '../core/overlay.js';
import { builtInIds, overlaysInUse, worlds } from '../core/world.js';
import { uploadUserFile } from '../st/bridge.js';
import { pickFile } from './cropper.js';
import { ACT } from './reg.js';
const OV = { busy: false, done: 0, total: 0, result: '' };
const worldName = (id) => worlds().find(w => w.id === id)?.name ?? id;
export function overlaysHtml() {
    const used = overlaysInUse();
    return `<section><h3>Overlay packs</h3>
        <p class="mu-muted">A pack adds to one of Mundi's worlds (people, places, pictures, words) from a zip someone shared with you. Mundi doesn't come with any: install only packs from people you trust, and turn on adult content in a game for the adult ones.</p>
        ${used.length ? `<ul class="mu-ov-used">${used.map(u => `<li><b data-notr>${esc(worldName(u.id))}</b> · ${esc(`${u.added} added, ${u.changed} changed`)}</li>`).join('')}</ul>` : ''}
        <div class="mu-row"><button data-act="ov-install" ${OV.busy ? 'aria-disabled="true"' : ''}>${OV.busy ? esc(`Installing… ${OV.done} of ${OV.total}`) : 'Install a pack…'}</button></div>
        ${OV.result ? `<p class="mu-good">${esc(OV.result)}</p>` : ''}</section>`;
}
async function install() {
    if (OV.busy)
        return;
    const f = await pickFile('.zip,application/zip');
    if (!f)
        return;
    OV.busy = true;
    OV.done = 0;
    OV.total = 0;
    OV.result = '';
    notify();
    try {
        const plan = packPlan(await readZip(new Uint8Array(await f.arrayBuffer())), builtInIds());
        OV.total = plan.files.length + plan.overlays.length;
        notify();
        // the pictures first, the overlay last: a pack stopped halfway isn't used with pictures missing
        for (const p of plan.files) {
            await uploadUserFile(p.name, new Blob([p.data]));
            if (++OV.done % 10 === 0)
                notify();
        }
        for (const o of plan.overlays) {
            await uploadUserFile(o.name, o.text);
            OV.done++;
        }
        const names = plan.overlays.map(o => worldName(o.world)).join(', ');
        OV.result = `Installed for ${names}: ${plan.files.length} files. Reload the page to use it.`;
        if (plan.skipped.length)
            console.warn('[Mundi] left out of the overlay pack:', plan.skipped);
        toast(OV.result, 'success');
    }
    catch (e) {
        toast(`The pack wasn't installed: ${String(e?.message ?? e)}`, 'error');
    }
    finally {
        OV.busy = false;
        notify();
    }
}
Object.assign(ACT, { 'ov-install': () => void install() });
