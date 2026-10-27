import { addBond } from './social.js';
// the character's reaction, from the emotion of their reply (labels of SillyTavern's Expressions classifier)
const GOOD = { love: 3, admiration: 2, gratitude: 2, joy: 1, amusement: 1, caring: 2, excitement: 1 };
export function judgeReaction(g, avatar, label) {
    const l = String(label ?? '').toLowerCase();
    return GOOD[l] ? addBond(g, avatar, GOOD[l]) : 0;
}
