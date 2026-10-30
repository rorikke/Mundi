// The version of Mundi (the same as manifest.json: a test checks it) and what each version brought.
export const VERSION = '0.2.1';

export interface Release { v: string; title: string; items: [string, string][] }
// Newest first. The first one is what the window shows after an update.
export const CHANGELOG: Release[] = [
    { v: '0.2.1', title: 'Fixes and improvements for Home mode', items: [
        ['bell', "Visitors: invite people over from the Calendar. They arrive about an hour later, ring the doorbell and stay until you say goodbye. You choose where each one sleeps."],
        ['users', "Parties can have guests from outside, or happen somewhere out. Edit the guests on the party card, and ask someone to stay after the party."],
        ['home', "What you can do fits the room: eating in the kitchen and the dining room, washing up in the bathrooms, the TV and video games in the living room, swimming at the pool… Your own Homes too."],
        ['utensils', "Needs, if you want them: hunger, thirst, mood and hygiene, shown under the clock (This Home → Needs)."],
        ['moon', "Sleeping through a party or a date asks first, and Sleep until wakes you up just in time."],
        ['chat', "The AI narrates what you do right away. Everything that calls the AI can be turned off in This world → AI context."],
        ['image', "Rain sounds, sprites on the left or the right in Cards, and the dialog box on the left in Visual novel."],
        ['lock', "Safety fixes (thanks, coldasblues). A spouse added later shows as Married, and playful slaps no longer cost bond."],
    ] },
    { v: '0.2.0', title: 'Homes', items: [
        ['home', 'Home: a new way to play. One house, the characters you choose, and no work, money or bills: just the people and the story.'],
        ['users', 'A ready Home, The Shared House, or your own one made in the Home creator.'],
        ['map', 'Houses with floors and a floor plan, Go out to take the story anywhere, Who lives here to move people in and out, and a dress code for each room.'],
        ['skip', 'In a Home, the clock moves a little with each message. Click it to let time pass.'],
        ['folder', 'Library: drag cards into folders, rename folders and sort them.'],
        ['image', 'Sprites overlap like a stage, and whoever spoke last stands in front.'],
        ['image', 'Porto Alto has a picture for every place, three kinds of apartments and houses, a gym and a cinema.'],
        ['lock', 'The RPG mode and the medieval style are coming soon: they are locked while they get finished.'],
    ] },
];
// "0.2.0" > "0.1.3"
export function newer(a: string, b: string): boolean {
    const pa = a.split('.').map(n => parseInt(n, 10) || 0), pb = b.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d > 0; }
    return false;
}
