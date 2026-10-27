// How a character reacts to you moves the bond: a warm reaction (the emotion the Expressions extension reads in
// their reply) makes it go up a little. Reactions never lower it: a single reply read without its context misfires
// too often (a sad story read as grief, teasing read as annoyance). Insults, fights and broken promises are judged
// in context instead (the diary's verdict, missed plans, jealousy…). The gain is applied and recorded per message
// by sim/msglog.ts, so it follows swipes, edits and deletes.
// friendship a reaction is worth, by the label of SillyTavern's Expressions classifier
const GOOD = { love: 3, admiration: 2, gratitude: 2, joy: 1, amusement: 1, caring: 2, excitement: 1 };
export const reactionGain = (label) => GOOD[String(label ?? '').toLowerCase()] ?? 0;
