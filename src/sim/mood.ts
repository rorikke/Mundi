// How a character reacts to you moves the bond: a warm reaction (the emotion the Expressions extension reads in
// their reply) makes it go up a little. Reactions never lower it: a single reply read without its context misfires
// too often (a sad story read as grief, teasing read as annoyance). Insults, fights and broken promises are judged
// in context instead (the diary's verdict, missed plans, jealousy…).
import type { Save } from '../core/store.js';
import { addBond } from './social.js';

// the character's reaction, from the emotion of their reply (labels of SillyTavern's Expressions classifier)
const GOOD: Record<string, number> = { love: 3, admiration: 2, gratitude: 2, joy: 1, amusement: 1, caring: 2, excitement: 1 };
export function judgeReaction(g: Save, avatar: string, label: string | null): number {
    const l = String(label ?? '').toLowerCase();
    return GOOD[l] ? addBond(g, avatar, GOOD[l]) : 0;
}
