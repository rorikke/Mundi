// What people wear in the scene, from the game rather than by hand. Home: a dress code per room ("swimsuit" at the
// pool, "pajamas" in the bedrooms). Any world with adult content on: the people doing a private action with you
// (a night at a love hotel, a bath for two) wear their "naked" outfit while it plays out. Whoever has an outfit with
// that name (a subfolder of their Expressions folder) wears it; when the code no longer holds for them (another
// room, the action over, gone from the scene) the outfit it put on comes off again. The AI is told the room's code.
import { cfg, state, adultOn, type Save } from '../core/store.js';
import { isScenario, type WorldDef } from '../core/world.js';
import { presentAt } from './people.js';
import { outfitOf, wearOutfit } from '../st/bridge.js';

export const dressCodes = (g: Save): Record<string, string> => ((cfg(g) as any).dress ??= {});
// a room's own code; a bedroom (home:…) uses the one set for all the bedrooms
export const dressAt = (g: Save, loc: string) => String(dressCodes(g)[loc] ?? (loc.startsWith('home:') ? dressCodes(g).__bedrooms : '') ?? '').trim();
const dressed = (g: Save): Record<string, string> => (((g as any).dressed ??= {}) as Record<string, string>);
/** The outfit worn during a private action (sim/actions.ts plays it out in the scene). */
export const UNDRESSED = 'naked';

// The code for one person here: the room's in a Home; otherwise "naked" for those in the private action going on.
// (The action is read from the save as sim/actions.ts keeps it, so this file needs nothing from there.)
export function dressFor(g: Save, w: WorldDef, avatar: string): string {
    if (isScenario(w)) return dressAt(g, g.player.loc);
    const act = (g as any).act as { a?: { private?: boolean }; place?: string; with?: string[] } | undefined;
    return adultOn(g) && act?.a?.private && act.place === g.player.loc && act.with?.includes(avatar) ? UNDRESSED : '';
}

// Puts on (or takes off) the coded outfit for the people in the scene, and takes it off whoever it was put on who
// isn't here now. `has`: the outfits someone has, given the code (null while still looking: nothing changes yet).
export function applyDress(g: Save, w: WorldDef, has: (avatar: string, code: string) => string[] | null): boolean {
    const worn = dressed(g); let changed = false;
    const here = presentAt(g, w, g.player.loc).map(r => r.avatar);
    for (const a of new Set([...here, ...Object.keys(worn)])) {
        if (!g.cast[a]) { delete worn[a]; continue; }
        const code = here.includes(a) ? dressFor(g, w, a).toLowerCase() : '';
        const list = code ? has(a, code) : [];
        if (!list) continue;
        const match = code ? list.find(o => o.toLowerCase() === code) : undefined;
        const cur = outfitOf(a);
        if (match) {
            if (cur.toLowerCase() !== match.toLowerCase()) { wearOutfit(a, match); worn[a] = match; delete (state.sprites as any)[a]; changed = true; }
        } else if (worn[a]) {
            if (cur.toLowerCase() === worn[a].toLowerCase()) { wearOutfit(a, ''); delete (state.sprites as any)[a]; changed = true; }
            delete worn[a];
        }
    }
    return changed;
}
// For the AI: what people wear in this room.
export function dressLine(g: Save, w: WorldDef): string {
    if (!isScenario(w)) return '';
    const code = dressAt(g, g.player.loc);
    return code ? `Dress code here: people wear their ${code} (outfit) in this room.` : '';
}
