// Gain pacing (requirements S-11): nobody becomes a best friend in one conversation, yet a long warm talk gives more
// than a short one. Each directed meter keeps a fatigue: the paced points it gained recently, fading with game time
// (half gone every 8 game hours by default). The first E points of fatigue come at full rate; past them a gain's rate
// is 1 / (1 + extra / H), so after H more points gains come at half rate, ever slower, never stopping. A gain is
// computed in one step (gaining e points past E costs e + e²/(2H) raw points), so one +15 equals five +3.
// Pure: no imports, so the numbers can be checked in Node (.private/tests/pacing.mjs).

export interface Curve { E: number; H: number }
export type PaceId = 'slow' | 'normal' | 'fast';
/** Default curves per meter (friendship, romance); a save can change them (World → Rules → Relationships). */
export const CURVES: Record<'f' | 'r', Curve> = { f: { E: 5, H: 5 }, r: { E: 6, H: 6 } };
/** Game minutes for half of the fatigue to fade. */
export const HALF_LIFE = 480;
/** A person's own pace: slow halves E and H, fast doubles them. */
export const PACE: Record<PaceId, number> = { slow: 0.5, normal: 1, fast: 2 };

// Fatigue after `dt` game minutes.
export const faded = (F: number, dt: number, half = HALF_LIFE) => (F > 0 ? F * Math.pow(2, -Math.max(0, dt) / Math.max(1, half)) : 0);

// What a paced gain of `raw` points brings, against fatigue F (already faded to now). Fatigue grows by the same.
export function paced(raw: number, F: number, c: Curve): number {
    if (!(raw > 0)) return 0;
    const E = Math.max(0, c.E), H = Math.max(0.01, c.H), f = Math.max(0, F);
    const easy = Math.min(raw, Math.max(0, E - f));
    const q = raw - easy;
    if (q <= 0) return easy;
    const e0 = Math.max(0, f + easy - E);
    const e1 = -H + Math.sqrt(H * H + 2 * H * (q + e0 + e0 * e0 / (2 * H)));
    return easy + (e1 - e0);
}
// The rate of the next point gained (1 = full) at fatigue F.
export const rateAt = (F: number, c: Curve) => (F < c.E ? 1 : 1 / (1 + (F - c.E) / Math.max(0.01, c.H)));
