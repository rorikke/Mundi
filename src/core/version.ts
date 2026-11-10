// The version of Mundi (the same as manifest.json: a test checks it) and what each version brought.
export const VERSION = '0.3.1';

export interface Release { v: string; title: string; items: [string, string][] }
// Newest first. The first one is what the window shows after an update.
export const CHANGELOG: Release[] = [
    { v: '0.3.1', title: 'Who you are, and courses that take weeks', items: [
        ['star', "Who you are matters: your strengths start your skills (Good cook · Cooking 3), and each personality trait and interest does something small. Habits have names of their own and make their skill train faster."],
        ['book', "Courses take weeks: classes on a schedule, a few you can miss, make-up classes, two courses at once, fees by the season and help with the fee. Tokyo has 17."],
        ['briefcase', "Start a job while you study for it, and your boss tells you when your next rank needs a course. No job is closed to your personality, and every roll gets the same bonus from your skill."],
        ['heart', "Gifts: buy them where they're sold. A romantic gift warms a crush, and an intimate one only lands with someone drawn to you."],
        ['image', "With adult content on, people undress for private moments and dress again after, and a world's people can bring outfits of their own. With it off, adult actions stay hidden everywhere."],
        ['map', "Tokyo's places and homes sit where they belong on each map, and characters get their new pictures when a world updates them."],
        ['folder', "Add to a built-in world with a file of your own: places, people, actions, lore and pictures, kept in SillyTavern's user files."],
        ['globe', "Everything new in Portuguese and Spanish. Your games move to the new traits and courses once, with a backup kept in the save."],
    ] },
    { v: '0.3.0', title: 'Tokyo, and relationships that feel alive', items: [
        ['map', "Tokyo, a new world: eight districts and two getaways, 88 places, 30 people with lives of their own, and trains with a last train home."],
        ['image', "Tokyo in pictures: every place by morning, afternoon and night, in the rain, the snow and each season; a portrait and 28 expressions for everyone, and an illustrated map for each district."],
        ['calendar', "Tokyo's year: 31 festivals and events, typhoons and heat waves; drinks after work, senpai and kōhai, prayers and omikuji at the shrines."],
        ['heart', "Feelings go both ways, friendship and romance are separate, and every scene counts when it ends. People can come to dislike you, and a crush can outweigh it."],
        ['users', "People take the initiative: they confess, ask you out, text you and hold grudges. The world's people date, marry and break up among themselves."],
        ['briefcase', "Jobs with a working week: shifts and days off, performance, promotions that say what they still need, and work rules you can ease."],
        ['star', "Skills that level up, couples who go out, and a new game your way: pick the people, choose a start, one switch for adult content."],
        ['palette', "A color for each speaker's dialogue, chosen by your AI (Chat look, ☰ menu)."],
    ] },
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
