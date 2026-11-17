// The museum's royalties made safe (R-b of the end-game revenue): the curve of what a week pays by the museum's
// percentage, and the lines said as it grows (RoyaltyDef in core/world.ts). Called by core/collection.ts once the rest
// of the museum is clean; what plays it is sim/royalties.ts.
import type { MuseumDef, RoyaltyDef } from './world.js';

const PAY_MAX = 100_000_000;
const whole = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Adds to a cleaned museum (`out`) the raw one's (`m`) royalties: points with `at` 0…100 and `pay` 0…¥100M, sorted,
 *  one per percentage, kept only when one pays something; steps at 1…100 with a line, sorted, one per percentage, with
 *  what the AI is told when there is any. Returns `out`. */
export function upgradeRoyalties(m: any, out: MuseumDef): MuseumDef {
    const r = m?.royalties;
    if (!r || typeof r !== 'object' || !Array.isArray(r.curve)) return out;
    const curve = new Map<number, number>();
    for (const p of r.curve) {
        const at = whole(p?.at, 0, 100), pay = whole(p?.pay, 0, PAY_MAX);
        if (at !== undefined && pay !== undefined && !curve.has(at)) curve.set(at, pay);
    }
    if (![...curve.values()].some(v => v > 0)) return out;
    const x: RoyaltyDef = { curve: [...curve].sort((a, b) => a[0] - b[0]).map(([at, pay]) => ({ at, pay })) };
    const steps = new Map<number, { at: number; line: string; ai?: string }>();
    for (const s of Array.isArray(r.steps) ? r.steps : []) {
        const at = whole(s?.at, 1, 100), line = text(s?.line), ai = text(s?.ai);
        if (at !== undefined && line && !steps.has(at)) steps.set(at, { at, line, ...(ai ? { ai } : {}) });
    }
    if (steps.size) x.steps = [...steps.values()].sort((a, b) => a.at - b.at);
    out.royalties = x;
    return out;
}
