// The version of Mundi (the same as manifest.json: a test checks it) and what each version brought.
export const VERSION = '0.4.0';

export interface Release { v: string; title: string; items: [string, string][] }
// Newest first. The first one is what the window shows after an update.
export const CHANGELOG: Release[] = [
    { v: '0.4.0', title: 'Running a business in Tokyo', items: [
        ['store', "A café of your own: take over Kissa Shirakaba or lease a unit and name it, then grow it from a stand to a roastery with upgrades bought, found around the city or earned. Run the counter yourself or let hired hands keep it open."],
        ['briefcase', "The executive's floor: three ranks above Asahina Trading's, Mochi Byte's and Wave TV's tops, then a division of your own with a season's budget and the board's verdict."],
        ['heart', "A business can change how people's stories end, and a Business app on the phone follows it all."],
        ['moon', "With adult content on, four new women in Tokyo's night world: Shiori, Tsubaki, Sumire and Kaoru, each with her own storyline."],
        ['users', "People around you no longer join everything you do: someone may come over now and then, and you talk or keep going. What you do on your own needs no AI reply."],
        ['flame', "Not everyone is attracted to everyone: in a new game, people are drawn to your gender if you're drawn to theirs, and straight otherwise."],
        ['star', "The Goals app says how to do each objective, and the university student start has a life goal of its own."],
        ['globe', "Everything new in Portuguese and Spanish. \"Something else…\" in Things to do is now a choice in Settings → Game."],
    ] },
    { v: '0.3.4', title: 'Training together, and a city easier to find your way in', items: [
        ['users', "Training together: a friend who's good at what you're not can teach you, you can teach what you know, or you trade (a language exchange). Agree on it in conversation; it replaces apprentices."],
        ['chat', "Suggest it in your own words and they answer yes or no; someone may offer it when the talk turns that way, and you accept or turn it down on a card."],
        ['mic', "Tokyo's Streamer: anyone can stream for little at first, then choose games and chatting or, with adult content on, adult streams."],
        ['moon', "Tokyo's maps change at night: every district and the whole city light up from 18:00 (neon, lanterns, Tokyo Tower), with the pins where they were."],
        ['speaker', "Tokyo sounds like Tokyo: every place plays real recordings (its crowds, an izakaya, the Shibuya crossing, cicadas in summer, a temple bell), quieter when the place is quiet, and silent while it's closed."],
        ['search', "The map has a Find button: type part of a name to see every matching place, its district and the trip there."],
        ['star', "Things to do show the skill they train, and each skill on the Profile lists where to practise it, when, and what it waits for."],
        ['bell', "Notices stay as long as they need and count down one at a time, with a Log of them all in the ☰ menu; cards that come to you show one at a time."],
        ['book', "In a game, ☰ → This world → In detail shows the whole world you play, built-in ones too: every job's ranks, pay, shifts, requirements and career paths, the places, needs, courses… as the World creator shows them, only to look."],
        ['download', "The main menu tells you when Mundi has an update and offers to update and reload. The Jobs app sorts its openings."],
        ['globe', "Everything new in Portuguese and Spanish, and fixes to the map's card, a character's menu, the scene's text box and Say."],
    ] },
    { v: '0.3.3', title: "University, and a city that makes you work for it", items: [
        ['cap', "University: Hijiri offers four degrees, played the way The Sims does it: terms of modules, coursework, grades and a GPA, a scholarship you can lose, and a Campus app. The University student start begins enrolled."],
        ['briefcase', "Job interviews are harder: about 30% with nothing that helps, a job beyond your reach won't see you, and noes in a row at one place wait longer."],
        ['moon', "With adult content on, Tokyo's hostess clubs, pole club and AV studios take women from the listings; anyone else needs an introduction or a top skill. Men work as AV actors."],
        ['wallet', "Tokyo's starts begin with less money: about four weeks of rent and bills for most."],
        ['flame', "Spark: choose whom you want to see. A like is answered days later, if at all, and a match takes more in common."],
        ['sparkles', "Life points say where to spend them: the Goals app's Rewards tab."],
        ['edit', "The World creator edits every field of the built-in worlds, Tokyo included, and a new game can change one of the world's starts for that game."],
        ['globe', "Everything new in Portuguese and Spanish, and a fix: with the hobbies system off, a hobby no longer adds to a roll."],
    ] },
    { v: '0.3.2', title: 'Life goals, and Tokyo after dark', items: [
        ['star', "Life goals: follow one through its steps, switch any time without losing what it counted, and finishing it gives a perk for good. Tokyo has 25 of its own."],
        ['sparkles', "Life points from steps and small moments buy a lucky day, a nudge, an invitation, insight into someone and Tokyo's shrine charms."],
        ['heart', "With adult content on, Tokyo's love life plays: private moments go great, good or awkward, and you learn what someone likes and won't do."],
        ['flame', "Desire, and a drive for you and everyone: some want you often, some rarely, and someone who wants you may make the move."],
        ['moon', "Risky places can get you caught: a fee, a week's ban, a rumor and a partner who hears about it."],
        ['briefcase', "Careers with a track for each gender: the video industry and the new esthe therapist at Aroma Room Lily, with pole and massage classes."],
        ['wallet', "Rent can be paid in part, you're warned the day before the lock, and the Homes app shows the way back in."],
        ['globe', "Everything new in Portuguese and Spanish, and fixes for every world: a need that empties no longer hits all at once."],
    ] },
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
