// How a character reacts to you moves the bond: a warm reaction (the emotion the Expressions extension reads in
// their reply) makes it go up a little, and in a one-on-one scene desire (or love, once there's interest) raises
// romance. Reactions never lower it: a single reply read without its context misfires
// too often (a sad story read as grief, teasing read as annoyance). Insults, fights and broken promises are judged
// in context instead (the diary's verdict, missed plans, jealousy…). The gain is applied and recorded per message
// by sim/msglog.ts, so it follows swipes, edits and deletes.

// friendship a reaction is worth, by the label of SillyTavern's Expressions classifier
const GOOD: Record<string, number> = { love: 3, admiration: 2, gratitude: 2, joy: 1, amusement: 1, caring: 2, excitement: 1 };
export const reactionGain = (label: string | null): number => GOOD[String(label ?? '').toLowerCase()] ?? 0;
// Romance a reaction is worth, in one-on-one scenes only (in a group the feeling may be about someone else): desire,
// and love once there's already some interest (affection between friends never starts a romance).
export const ROMANCE_GAIN = { desire: 3, love: 3 };
export function reactionRomance(label: string | null, romance: number): number {
    const l = String(label ?? '').toLowerCase();
    return l === 'desire' ? ROMANCE_GAIN.desire : l === 'love' && romance >= 15 ? ROMANCE_GAIN.love : 0;
}
