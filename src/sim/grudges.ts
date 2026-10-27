// Grudges and making up (requirement A-4). A clear loss in a scene verdict (friendship −2 steps or worse), or a plan
// you missed or called off, leaves them hurt: a fading feeling the AI already hears about ("Hurt: …", 5 days, 7 after
// a −3), and a moment where they bring it up or act cold. While it lasts they turn down invitations and plans
// (partners too, dates included), don't invite you and don't ask you anything. A verdict that finds you apologized or
// made amends ("| made up") ends it with a small friendship bonus; otherwise it fades by itself and the loss stays.
// One grudge per person: a new one extends it. Part of "Characters take the initiative" (off: none of this).
import { nowAbs, type Save } from '../core/store.js';
import { activeFeelings, feelingsOf } from './life.js';
import { social } from './social.js';
import { gain, YOU } from './rel.js';
import { initiativeOn, queueMoment, seat } from './moments.js';

export const GRUDGE = { days: 5, worse: 7, bonus: 3 };
export const grudgeOf = (g: Save, a: string) => activeFeelings(g, a).find(f => (f as any).grudge) ?? null;

// They're hurt by what happened (`why`, in words: "you insulted them"); a grudge already there is extended.
export function holdGrudge(g: Save, a: string, why: string, days = GRUDGE.days): boolean {
    const r = g.cast[a];
    if (!r || !initiativeOn(g)) return false;
    const old = grudgeOf(g, a);
    const until = Math.max(old?.until ?? 0, nowAbs(g) + days * 1440);
    (social(g) as any).feel = [...feelingsOf(g).filter(f => !(f.avatar === a && (f as any).grudge)), { avatar: a, tag: `Hurt: ${why}`, until, grudge: true }].slice(-80);
    if (!old) queueMoment(g, { who: a, kind: 'grudge', text: `${r.name} is still hurt (${why}) and brings it up with {{user}} in this scene, or acts noticeably cold.` });
    return true;
}
// You made up: the grudge ends, with a small bonus (a milestone, not paced).
export function makeUp(g: Save, a: string): boolean {
    if (!grudgeOf(g, a)) return false;
    (social(g) as any).feel = feelingsOf(g).filter(f => !(f.avatar === a && (f as any).grudge));
    const s = seat(g); s.moments = s.moments.filter(m => !(m.who === a && m.kind === 'grudge'));
    gain(g, 'f', a, YOU, GRUDGE.bonus, false);
    return true;
}
