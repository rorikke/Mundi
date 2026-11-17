const str = (v) => typeof v === 'string' && !!v.trim();
const isWhen = (v) => str(v) || (!!v && typeof v === 'object' && !Array.isArray(v));
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined);
const LOAN_FEE_MAX = 100_000_000;
/** Adds to a cleaned museum (`out`) the C-7 fields of the raw one (`m`): a name on the dealer and the rival (any
 *  non-empty text; world-check says whether it's one of the world's people), the dealer's `extra` ([tier, pieces]), and
 *  `loans` only with a person, a condition and a fee above 0 (five fees by rung, numbers held to their ranges, `also`
 *  slot ids). Returns `out`. */
export function upgradeRival(m, out) {
    if (!m || typeof m !== 'object')
        return out;
    if (out.dealer && m.dealer && typeof m.dealer === 'object') {
        if (str(m.dealer.who))
            out.dealer.who = m.dealer.who.trim();
        const e = m.dealer.extra;
        if (Array.isArray(e) && e.length === 2) {
            const t = num(e[0], 0, 20), n = num(e[1], 1, 6);
            if (t !== undefined && n !== undefined)
                out.dealer.extra = [t, n];
        }
    }
    if (out.auctions?.rival && m.auctions?.rival && str(m.auctions.rival.who))
        out.auctions.rival.who = m.auctions.rival.who.trim();
    const l = m.loans;
    if (l && typeof l === 'object' && str(l.who) && isWhen(l.when) && Array.isArray(l.fees)) {
        const fees = [0, 1, 2, 3, 4].map(i => num(l.fees[i], 0, LOAN_FEE_MAX) ?? 0);
        if (fees.some(f => f > 0)) {
            const x = { who: l.who.trim(), when: l.when, fees };
            const min = num(l.min, 1, 5);
            if (min !== undefined)
                x.min = min;
            const wait = num(l.wait, 1, 56);
            if (wait !== undefined)
                x.wait = wait;
            const again = num(l.again, 0, 999);
            if (again !== undefined)
                x.again = again;
            if (Array.isArray(l.also)) {
                const a = [...new Set(l.also.filter((s) => str(s) && /^[a-z0-9_]+$/.test(s)))];
                if (a.length)
                    x.also = a;
            }
            for (const k of ['label', 'place'])
                if (str(l[k]))
                    x[k] = l[k].trim();
            out.loans = x;
        }
    }
    return out;
}
