// People who unlock (the museum's end-game characters): a person's tiers and `reserved` from someone else's file made
// safe. The format is PersonTier in core/world.ts; what plays it is sim/tiers.ts. A world without tiers gets no key.
import { FRIEND_LEVELS, ROM_LEVELS } from './feel.js';

const ID = /^[a-z0-9_]+$/;
// (a cap of `none`: no couple at all while at that tier)
const STATUSES = ['none', 'casual', 'dating', 'engaged', 'married'];
const str = (v: unknown) => typeof v === 'string' && !!v.trim();
const isWhen = (v: unknown) => typeof v === 'string' || (!!v && typeof v === 'object' && !Array.isArray(v));

/** One person's tiers made safe, in place: ids `[a-z0-9_]` and unique, a name and a condition each, caps only at known
 *  levels, `hold`, `moves` and `invites` booleans, `sets` at known levels, texts texts, outfits and lines lists of texts; a tier missing any of
 *  its musts dropped, and no `tiers` key left when none is. `reserved` only when true. */
export function upgradeTiers(ex: any) {
    if (!ex || typeof ex !== 'object') return;
    if ('reserved' in ex && ex.reserved !== true) delete ex.reserved;
    if (!('tiers' in ex)) return;
    const seen = new Set<string>(), out: any[] = [];
    for (const t of Array.isArray(ex.tiers) ? ex.tiers : []) {
        if (!t || typeof t !== 'object' || !ID.test(t.id ?? '') || seen.has(t.id) || !str(t.name) || !isWhen(t.when)) continue;
        seen.add(t.id);
        const x: any = { id: t.id, name: t.name, when: t.when };
        if (t.caps && typeof t.caps === 'object') {
            const caps: any = {};
            if ((FRIEND_LEVELS as string[]).includes(t.caps.f)) caps.f = t.caps.f;
            if ((ROM_LEVELS as string[]).includes(t.caps.r)) caps.r = t.caps.r;
            if (STATUSES.includes(t.caps.status)) caps.status = t.caps.status;
            if (Object.keys(caps).length) x.caps = caps;
        }
        if (t.hold && typeof t.hold === 'object') {
            const hold: any = {};
            for (const k of ['f', 'r']) if (typeof t.hold[k] === 'boolean') hold[k] = t.hold[k];
            if (Object.keys(hold).length) x.hold = hold;
        }
        if (str(t.ai)) x.ai = t.ai;
        if (t.intimacy && typeof t.intimacy === 'object') {
            const i: any = {};
            for (const k of ['preset', 'r', 'f']) if (str(t.intimacy[k])) i[k] = t.intimacy[k];
            if (t.intimacy.casual === false) i.casual = false;
            if (Object.keys(i).length) x.intimacy = i;
        }
        if (t.intimate && typeof t.intimate === 'object' && !Array.isArray(t.intimate)) {
            const p: any = {};
            for (const [k, v] of Object.entries(t.intimate)) {
                if (typeof v === 'string' && v.trim()) p[k] = v;
                else if (Array.isArray(v)) { const list = v.filter(s => typeof s === 'string' && s.trim()); if (list.length) p[k] = list; }
            }
            if (Object.keys(p).length) x.intimate = p;
        }
        if (Array.isArray(t.outfits)) { const list = t.outfits.filter(str); if (list.length) x.outfits = list; }
        if (t.moves === true) x.moves = true;
        if (t.invites === true) x.invites = true;
        if (typeof t.inviteOdds === 'number' && Number.isFinite(t.inviteOdds) && t.inviteOdds > 0) x.inviteOdds = Math.min(5, t.inviteOdds);
        for (const k of ['moveLines', 'askLines']) if (Array.isArray(t[k])) { const list = t[k].filter(str); if (list.length) x[k] = list; }
        if (Array.isArray(t.about)) { const list = t.about.filter((a: any) => a && typeof a === 'object' && isWhen(a.when) && str(a.ai)).map((a: any) => ({ when: a.when, ai: a.ai })); if (list.length) x.about = list; }
        if (t.sets && typeof t.sets === 'object') {
            const sets: any = {};
            if ((FRIEND_LEVELS as string[]).includes(t.sets.f)) sets.f = t.sets.f;
            if ((ROM_LEVELS as string[]).includes(t.sets.r)) sets.r = t.sets.r;
            if (Object.keys(sets).length) x.sets = sets;
        }
        out.push(x);
    }
    if (out.length) ex.tiers = out; else delete ex.tiers;
}
