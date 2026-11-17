// The phone's Help app: a window in the middle of the screen that explains each part of the game, topic by topic.
import { notify, game, esc, adultOn } from '../core/store.js';
import { getWorld, appsOf, styleOf, isScenario, systemOn } from '../core/world.js';
import { lex, appRef } from '../core/lexicon.js';
import { GOAL_POINTS } from '../core/goals.js';
import { DAILY_CAP } from '../sim/points.js';
import { degreesOffered } from '../sim/degrees.js';
import { ventureDefs } from '../sim/ventures.js';
import { billList as bills } from '../sim/bills.js';
import { shopItems } from '../sim/shop.js';
import { collectionOn } from '../sim/collection.js';
import { icon } from './icons.js';
import { ACT } from './reg.js';
import { STORYLINES_HELP } from './threadui.js';
import { housingOn } from '../sim/housing.js';
import { museumDef, upgradeName } from '../sim/museum.js';
import { digsOf, DIG } from '../sim/dig.js';
import { digSeasonWord } from './museumui.js';
// (museum) The Collection topic's museum part, in a world with a museum: its numbers are the world's own (the cases,
// the first room, the dealer's days, the sales' lots), and only the parts it has.
function museumHelp(w) {
    const m = museumDef(w), name = `<span data-notr>${esc(m.name)}</span>`, n = (v, d) => esc(String(Math.round(v ?? d)));
    return [
        ['The museum', `Display pieces (art, crafts, things of the city) come from finds, shops, festival stalls, people's storylines and more. Your first one begins a museum of your own: its tabs come first in the app.`],
        ['Cases at home', `Until you have a museum, your ${n(m.cases, 6)} dearest pieces sit in glass cases at home and the rest are boxed. Every piece counts for the museum's percentage as soon as it's yours, wherever it is.`],
        ['Your own museum', `Keep collecting and ${name} may be offered to you: take it on in the Museum tab, paid once, with no weekly upkeep. Its first room shows ${n(m.room, 12)} pieces from any hall.`],
        ['Wings and upgrades', 'A wing puts a whole hall on show. Other upgrades bring renown, a place to read or have tea, and room for what needs it: some pieces wait for a climate room, security or a night guard, and their tiles say so.'],
        ['Renown and visitors', 'Pieces on show, upgrades, shows and the museum\'s milestones bring renown. Each level opens more (the Museum tab says what the next one brings), and every Monday the visitors pay a little.'],
        ...(m.dealer ? [['The dealer', `Once the museum is yours a dealer calls every ${n(m.dealer.every, 7)} days with a few pieces, on sale until her next visit. No piece waits too long for its turn. You can ask her for one piece at a time: it comes within two visits, a little dearer.`]] : []),
        ...(m.auctions ? [['The sales', 'Sales come four times a year, with a catalogue a week before. Set a top bid for each lot by phone, or be in the saleroom as it starts to raise once more if you are outbid. Another collector bids too; a lot she takes comes back later, dearer.']] : []),
        ['Damaged pieces and replicas', 'A find can come damaged: it counts once the restoration workshop has restored it. A piece whose only chance has passed can be made as a replica by the workshop: it fills the slot at half the renown, and the real piece replaces it if it ever comes.'],
        ...(m.shows ? [['Shows', `With an exhibition hall, open a show once a season on a theme with at least ${n(m.shows.min, 6)} pieces on show: more renown while it's on, and a little for good the first time each theme is shown.`]] : []),
        ...natureHelp(w),
    ];
}
// (nature) "Nature and the dig", in a museum world with pieces that come by season and hour, a dig, or pieces in
// parts: only the parts the world has, with its own numbers and names. (A piece "by season" is one with a way that
// names a season: festival stalls and markets are the museum's own items.)
const TIMED = /\bseason\s*:/;
function natureHelp(w) {
    const slots = w.collection?.slots ?? [], n = (v, d) => esc(String(Math.round(v ?? d)));
    const timed = slots.filter(s => (s.sources ?? []).some(x => (x.kind === 'find' || x.kind === 'sold') && (TIMED.test(String(x.when ?? '')) || TIMED.test(String(w.actions.find(a => a.id === x.action)?.when ?? '')))));
    const needs = [...new Set(timed.map(s => s.needsUpgrade).filter((u) => !!u))].map(u => `<span data-notr>${esc(upgradeName(w, u))}</span>`);
    const digs = digsOf(w), parts = slots.some(s => s.parts?.length && s.mount);
    // each sentence in an element of its own, so the translation (core/tr.ts, text node by text node) finds it whole
    const s = (text) => `<span>${text}</span>`, out = [];
    if (timed.length) {
        out.push(s('Some pieces come only in their season and at their hour: insects, fish and flowers turn up while you look for them in the parks, by the water and where things bloom.'), s('A missing piece marked In season can come now, and its hall says how many; the Here tab says what could turn up where you are.'), s('Gear from the shop adds a little to the roll.'));
        if (needs.length)
            out.push(`${s('Some wait for')} ${needs.join(', ')}${s(', as their tiles say.')}`);
    }
    for (const d of digs) {
        const when = digSeasonWord(d);
        out.push(`<span data-notr>${esc(d.name)}</span> ${s(when ? `comes back every ${esc(when)}: dig or sift with the team on as many days as you like.` : 'comes back in its season: dig or sift with the team on as many days as you like.')}`, s(`${n(d.sure, DIG.sure)} days in one season make sure of a find, and at most ${n(d.most, DIG.most)} come in a season.`), ...(d.lend ? [s('Its finds come only once the museum is yours, on long loan.')] : []), s('The Museum tab\'s Dig card shows how the season is going.'));
    }
    if (parts)
        out.push(s('A piece in parts (a skeleton) comes one part at a time, each shown under its tile.'), s('Once every part is in, the workshop mounts it from the Museum tab, for a fee and a few days, and then it counts.'));
    return out.length ? [['Nature and the dig', out.join(' ')]] : [];
}
// Written with the world's own words: its apps, bills, courses and device (a phone, a journal…).
// A Home: one house, no work or money, so its own short set of topics.
const homeTopics = (w) => {
    const app = (id) => appsOf(w).find(a => a.id === id)?.name ?? id;
    const dev = lex(w, 'device');
    const devl = dev.toLowerCase();
    const medieval = styleOf(w) === 'medieval';
    return [
        { id: 'start', icon: 'home', title: 'Getting started', intro: 'A Home is one house and the characters you chose to live in it. No work, money or bills: just the people, their days and the story the AI writes.',
            items: [
                ['The clock (top left)', 'The day, the time and the weather. Click it to let time pass until the next part of the day.'],
                ['Here', 'Who is in this room with you. Click a face for what you can do with that person.'],
                ['Things to do (right)', 'What this room offers: eat, rest, shower… They cost nothing. Turn on "Something else…" in Settings → Game to do anything you can think of.'],
                ['Rooms', 'The house, floor by floor. Click a room to go there: inside the house, walking takes no time.'],
            ] },
        { id: 'talk', icon: 'chat', title: 'Talking', intro: 'Write in the box under the story. The engine keeps the time and the relationships; the AI writes the scene.',
            items: [
                ['Say, Do, Story, See', 'Say: what you say out loud. Do: what you do. Story: a direction for the story ("it starts to rain"). See: ask the narrator to describe something.'],
                ['@ someone', 'Type @ and pick a name: only that person answers your line.'],
                ['Buttons on a line', 'Edit, delete, regenerate, continue, or let the AI write your line.'],
                ['Bonds grow as you talk', 'Being kind brings people closer. How fast depends on the difficulty you chose (Easy is quicker, Hard is slower).'],
            ] },
        { id: 'time', icon: 'moon', title: 'Time and sleep', intro: 'Time moves a little with each message, and jumps when you sleep or let it pass.',
            items: [
                ['Each message', 'A few minutes go by with every message you send (☰ → This Home → Home sets how many, or turns it off).'],
                ['Let time pass', 'Click the clock: time jumps to the next part of the day.'],
                ['Sleep', 'In your bedroom. You wake up in the morning, back where you went to bed, and the diary of the day is written.'],
                ['Their days', 'People get up, eat, go to bed, and (if you turned it on in This Home) go out or to work for a while. A job and its shift are written in This Home → Home.'],
            ] },
        { id: 'house', icon: 'users', title: 'The house', intro: 'Who lives where, who comes and goes, and what people wear.',
            items: [
                ['Who lives here (☰)', 'Everyone\'s bedroom. Pick another one for someone; two people in the same bedroom share it, and the AI knows.'],
                ['Someone moves in', 'Any of your characters can move in during the game. They take a free bedroom, or share one when the house is full.'],
                ['Moving out', 'Someone leaves the house for good: their bedroom is free again and plans with them are off. They can move back in later.'],
                ['Dress code', 'In This Home: what people wear in each room (towels in the bathroom, pajamas in the bedrooms…). The AI is told.'],
                ['Floors', 'With a floor plan, the floors are at the bottom left; the faces show who is on each floor. A red "!" marks a room that is not on the plan yet.'],
            ] },
        { id: 'out', icon: 'map', title: 'Going out', intro: 'The story can leave the house for a while.',
            items: [
                ['Go out (☰, or the top of Rooms)', `Write where you are going (${medieval ? '"the market square", "the village tavern"' : '"the beach", "a café downtown"'}), pick who comes with you from the people in the house, and a background from SillyTavern's.`],
                ['Out there', 'A free scene, like a chat. ☰ → Background changes the picture.'],
                ['Back home', 'The button at the top right. The people who came with you come back too.'],
                ['Plans', `Plans can be "Somewhere out…": write the place and the time${medieval ? '' : ' (a date, a party)'}.`],
            ] },
        { id: 'people', icon: 'heart', title: 'People and relationships', intro: 'Everyone has two bars: friendship and romance. Each bar fills inside its level, then the level goes up.',
            items: [
                ['Levels', 'Stranger, acquaintance, friend, good friend, best friend; and for romance, from a crush up to love.'],
                ['Asking someone out', 'From their card or with your own words. The engine decides how ready they are; the scene shows the answer.'],
                ['Your persona (☰)', 'Play as another of your SillyTavern personas, like in a chat.'],
                ['Difficulty', 'Easy, Normal or Hard: how fast people grow close to you.'],
            ] },
        { id: 'phone', icon: medieval ? 'book' : 'phone', title: `The ${devl}`, intro: lex(w, 'deviceIntro'),
            items: [
                [app('messages'), lex(w, 'messagesHelp')],
                [app('people'), 'Everyone you know, with their bars and what they feel.'],
                [app('plans'), 'Your plans, who is with you, and parties (free in a Home).'],
                [app('journal'), 'A calendar of your days, with each day\'s diary and what happened.'],
            ] },
        { id: 'journal', icon: 'book', title: 'Memory and the diary', intro: 'Mundi remembers in short facts ("You met Bianca in the kitchen"). The AI gets only the facts of the people in the scene.',
            items: [
                ['One long conversation', 'Moving from room to room or going out keeps the conversation: the AI still sees what was just said. Sleeping closes the day: the next morning starts fresh, with the diary.'],
                ['The diary', 'Written when you sleep, from the day\'s facts and conversations. It tells the AI what happened on the days before.'],
                ['Remember this', 'On a line of the story: turns it into a fact.'],
            ] },
        { id: 'look', icon: 'palette', title: 'Look and settings', intro: 'Make it yours.',
            items: [
                ['Chat look (☰ menu)', 'Visual novel, Classic or Cards; sizes; colors with transparency; colors from a SillyTavern theme.'],
                ['This Home (☰ menu)', 'People, bedrooms, dress code, time per message, jobs and shifts, and what the AI is told.'],
                ['A red warning on top', 'Something in SillyTavern may hurt the game (context too big, Summarize on…). It says what to change.'],
            ] },
    ];
};
const topics = (w) => {
    if (w && isScenario(w))
        return homeTopics(w);
    const app = (id) => (w ? appsOf(w).find(a => a.id === id)?.name ?? id : id);
    const on = (id) => !w || appsOf(w).find(a => a.id === id)?.on !== false;
    const dev = lex(w, 'device');
    const devl = dev.toLowerCase();
    const billList = bills(w).map(b => b.name).join(', ').replace(/, ([^,]*)$/, ' and $1');
    const modern = styleOf(w) === 'modern';
    const goalsOn = !w || systemOn(w, 'goals');
    const shopOn = !w || (systemOn(w, 'shop') && on('shop') && shopItems(w).length > 0);
    const collectionHere = !!w && collectionOn(w) && on('collection');
    const museumHere = collectionHere && !!museumDef(w);
    const ownOn = !!w && housingOn(w) && on('homes') && w.homes.zones.some(z => (z.price ?? 0) > 0); // (housing: homes to buy)
    const carHome = !w || shopItems(w).some(it => it.late);
    return [
        { id: 'start', icon: 'home', title: 'Getting started', intro: 'Mundi turns a SillyTavern group chat into a life you live: a world, a clock, needs, people with their own days, and the story the AI writes around what you do.',
            items: [
                ['Your card (top left)', 'Your name, money, energy and needs. Click your photo to play as someone else.'],
                ['The clock (top)', 'The day, the time, where you are and the weather. Time passes when you do things, travel or sleep. Click it to let time pass.'],
                ['Here', 'Who is in this place right now. Click a face for what you can do with that person.'],
                ['Things to do (right)', 'What this place offers: eat, drink, work, rest… Turn on "Something else…" in Settings → Game to do anything you can think of.'],
                ['Doing things with people around', "Being in the same place isn't being together: what you do on your own goes into the story with no reply, and the people here go on with their own things. Someone may come over now and then (friends more often, and more in a bar than a library): talk, or nod and keep going. Talk to someone and they're with you for a while. \"Keep to myself\" in Things to do: only friends come over, and rarely."],
                ['Map', 'Go to other places. Travelling takes time; the people you are with can come along.'],
            ] },
        { id: 'talk', icon: 'chat', title: 'Talking', intro: 'Write in the box under the story. The engine keeps the numbers (time, money, relationships); the AI writes the scene.',
            items: [
                ['Say, Do, Story, See', 'Say: what you say out loud. Do: what you do. Story: a direction for the story ("it starts to rain"). See: ask the narrator to describe something.'],
                ['@ someone', 'Type @ and pick a name: only that person answers your line.'],
                ['Talk only with them', 'On a person\'s card: the others stay but give you space.'],
                ['Buttons on a line', 'Edit, delete, regenerate, continue, or let the AI write your line.'],
                ['Bonds grow as you talk', 'Being kind brings people closer (a little each line, up to a limit each day). Rude lines push them away.'],
            ] },
        { id: 'needs', icon: 'bolt', title: 'Time and needs', intro: 'Energy, hunger, thirst, mood and hygiene drop over time. Keep them up with the things you do.',
            items: [
                ['Actions take time', 'Each action shows its cost and how long it takes. The clock moves forward when you do it.'],
                ['Sleep', 'At home (or where you stay the night). The night ends the day: your diary is written and you see how the day went with everyone.'],
                ['Let time pass', 'Click the clock: time jumps to the next part of the day.'],
                ...(billList ? [['Rent and bills', `${billList} are weekly bills: pay them ${appRef(w, 'homes')} (they turn red when due). One left unpaid for a week stops (or, for the rent, you are locked out of your home) until you pay what is overdue; you can pay part of a bill, and one that stopped owes no more weeks.`]] : []),
                ['Difficulty', 'Easy, Normal or Hard (chosen when you start, changeable in ☰ → This world): it changes what work pays and what things cost.'],
                ['Events lift your mood', 'Being on a date or at a party raises your mood and keeps it up while it lasts.'],
            ] },
        { id: 'people', icon: 'heart', title: 'People and relationships', intro: 'Everyone has two bars: friendship and romance. Each bar fills inside its level, then the level goes up and the bar changes color.',
            items: [
                ['Levels', 'Stranger, acquaintance, friend, good friend, best friend; and for romance, from a crush up to love.'],
                ['Asking someone out', 'From their card or with your own words ("will you be my girlfriend?"). The engine decides how ready they are; the scene shows the answer. If they need time, wait before asking again.'],
                ['Proposing, marriage, a baby', 'Once you are a couple, the next steps appear on their card.'],
                ['What they think of you', 'Approval goes up when you keep your word and down when you let people down. Feelings (happy, hurt…) fade with the days.'],
                ['Their own lives', `People work, go out and sleep on their own schedule. ${lex(w, 'reachThem')}`],
            ] },
        ...(!w || systemOn(w, 'living') ? [{ id: 'storylines', icon: 'book', ...STORYLINES_HELP }] : []),
        { id: 'plans', icon: 'calendar', title: 'Plans and events', intro: 'Invite people to hang out, go on a date or come to your party. A plan becomes an event when it starts.',
            items: [
                ['Make plans', `From a person's card (in person) or the ${devl}. Choose where, when, and give it a name: the story will be about it ("${lex(w, 'planTitleEg').replace(/^e\.g\. /, '').split(',')[0]}").`],
                ['Getting there', 'An hour before, "Things to do" lets you wait for them; half an hour before, a reminder asks if you want to go.'],
                ['During the event', 'A panel shows it. End it to say goodbye (they tell you what they thought), or ask them to stay the night.'],
                ['A party', `Invite several people at once ${appRef(w, 'plans')}. You wait for all your guests in one go.`],
                ['Standing someone up', lex(w, 'standUpHelp')],
            ] },
        { id: 'work', icon: 'briefcase', title: 'Work and money', intro: `Find work ${appRef(w, 'jobs')} or at the place itself, then work your shifts. The Work button (top right) takes you there.`,
            items: [
                ['Job interviews', lex(w, 'interviewHelp')],
                [lex(w, 'courses'), `${lex(w, 'studyWhere').replace(/^./, c => c.toUpperCase())}: a course lasts weeks, with a set number of classes (2 h, one a day at most, on its schedule if it has one). Every class teaches a little of its skills, and finishing gives you their levels for good; some jobs and ranks need one first. You can miss about one class in ten freely; more adds make-up classes that cost money, and too many fail the course. Take up to two at once (each class then counts a bit less). Long programs are paid by the season, and some have help with the fee. A class during your shift counts as missed, so check the clash before you enroll.`],
                ['Shifts', 'Each job has its days and hours: your week is in the Calendar, and you get a reminder before each shift. Choose how hard you work; if you have plans, you can work part of the shift and then go. Some jobs pay extra at night or for overtime.'],
                ['Performance and days off', 'Good shifts raise your performance; missing a shift, coming in late and slacking lower it. Book vacation days or call in sick ahead. How strict all this is depends on the work rules (This world → World).'],
                ['Promotions', 'The next rank asks for shifts and time in your rank, a good performance and sometimes skills: the work screen and the Jobs app show what is missing. The top of a career takes about a game year.'],
                ['Quick gigs', 'Some places offer one-off work for quick money.'],
                [`${app('bank')} and ${app('shop')}`, 'See where your money goes, and buy things that make life easier.'],
                ['At home', lex(w, 'homeUnwind', app('shop'))],
            ] },
        ...(shopOn ? [{ id: 'shopping', icon: 'wallet', title: 'Shopping', intro: `What money buys, ${appRef(w, 'shop')}: a tab for each kind of thing, Here for the place you're at, and Yours for what you have.`,
                items: [
                    ['Where things are sold', `Most things are sold ${appRef(w, 'shop')}, delivered. A place that sells shows "Shop here" in its things to do while it's open: it opens the Here tab, with what that place sells (some things are sold only there) and the gifts sold there.`],
                    ['Kept, or bought again', 'Most things are yours for good once bought. A service lasts some days (a cleaner, a trainer, flowers) and can be paid a little ahead; a case holds a few uses (bottles of wine), one used each time; a gift to give becomes a keepsake, for you to give to someone. Yours shows the days or uses left.'],
                    ['Small bonuses', "Many things help a little: a skill trains faster, a need drains slower, a better night's sleep, a better first impression. Each card says what it does. Of things that do the same, only the best one counts: a second, cheaper one adds nothing."],
                    ...(carHome ? [['A car', 'With a car of your own you drive home after the last train: no taxi, no wait.']] : []),
                    ['No selling, no upkeep', 'Nothing can be sold back, and nothing costs you anything weekly: you pay the price, and that is all.'],
                    ['More by invitation.', 'Some things are sold only to people who have earned it (a story seen, an introduction): until then the tab says "More by invitation." and keeps them hidden.'],
                    ...(adultOn(game()) ? [['Adult things', 'Shown, and doing anything at all, only while adult content is on in this game: even the ones you already have.']] : []),
                ] }] : []),
        ...(collectionHere ? [{ id: 'collection', icon: 'museum', title: 'Collection', intro: `What you have lived here, ${appRef(w, 'collection')}: a record that fills by itself as things happen, with a slot for each.`,
                items: [
                    ['What fills it', 'A storyline coming to its end, a festival or a city event you were at, every street story of a district and every place in it, life goals, a business at its top, every keepsake of a kind. Each slot fills the first time it happens and stays filled, whatever happens after.'],
                    ['Any ending counts', 'A storyline fills its slot however it ended; its plaque says how. A good ending gets a gold frame, never needed for 100%.'],
                    ['What can no longer happen', "A district's count leaves out the stories tied to a business or a job, and a story that can't happen any more (its person is gone, or it hung on another ending) drops out of it and says so."],
                    ['New slots', 'When the world gains something new, a record already at 100% stays at 100%, with the new slots marked New until you fill them.'],
                    ['An older game', "The record begins with what your game already remembers (storylines ended, festivals and events since the life goals came, places, stories, goals finished, keepsakes): what it never kept, like a café sold before, can't be counted."],
                    ...(museumHere ? museumHelp(w) : []),
                ] }] : []),
        ...(ownOn ? [{ id: 'owning', icon: 'home', title: 'Owning a home', intro: `Some homes can be bought, ${appRef(w, 'homes')}: Homes for sale, under the homes for rent.`,
                items: [
                    ['Buying', "A home is bought outright: no rent, and no loan. You can buy one to live in, or as a second home (the place for weekends); you can own two at most. Some homes can only be bought, never rented."],
                    ['Upkeep', "A home you own costs a weekly upkeep (management, taxes, staff), a bill like the others. Left a week unpaid, the house's rooms and fixtures stop working until it's paid; you're never locked out of a home you own."],
                    ['Selling', "A home you own can be sold back for part of what you paid (the card says how much). Its rooms and fixtures stay with it. To move out of the home you own, you'll be asked whether to sell it or keep it as your second home."],
                    ['Rooms and fixtures', "A home you own can be fitted out: a sauna, a grand piano, a garden, a home bar… Each is bought once for that house and adds things to do there and a small help; of what you own, only the best of each kind of help counts. A few are rooms of their own (a rooftop terrace, a bath): Things to do takes you there."],
                    ['The second home', "Your second home is on the map: go there, sleep there, and use its rooms while you're there."],
                    ['Parties', "A bigger home has room for more guests, and a big one can have a party catered."],
                ] }] : []),
        { id: 'phone', icon: modern ? 'phone' : 'book', title: `The ${devl}`, intro: lex(w, 'deviceIntro'),
            items: [
                [app('messages'), lex(w, 'messagesHelp')],
                [app('people'), 'Everyone you know, with their bars and what they feel.'],
                ...(on('social') || on('dating') ? [[[on('social') ? app('social') : '', on('dating') ? app('dating') : ''].filter(Boolean).join(' and '), lex(w, 'socialHelp')]] : []),
                [app('plans'), 'Your plans, who is with you, and parties.'],
                [app('journal'), 'A calendar of your days, with each day\'s diary and what happened.'],
                [lex(w, 'profile'), lex(w, 'profileHelp')],
                ...(goalsOn ? [[app('goals'), 'Your life goal, its steps and the goals you could follow; its Rewards tab spends your life points.']] : []),
                ...(modern ? [['Settings', 'Change the wallpaper: a picture from your computer, a link, or your gallery.']] : []),
            ] },
        ...(goalsOn ? [{ id: 'goals', icon: 'star', title: 'Life goals and life points', intro: `Like in The Sims: follow one life goal at a time, ${appRef(w, 'goals')}. Nothing is required; a goal gives your days a direction, and finishing it gives you something for good.`,
                items: [
                    ['A life goal', 'A few steps toward something you want (cooking for friends, the top of a career, every corner of the city). The goals suggested first suit how you started. The AI knows the goal you follow.'],
                    ['Steps', 'Each step lists what it asks for and how far you are ("Meals cooked 6/15"). Steps are done in order, as soon as everything they ask for holds; some must keep holding for a few days. What you do counts for the goal you follow, from when you picked it.'],
                    ['Switching', 'Switch whenever you like: the goal you leave is paused and keeps its finished steps and what it counted, for when you pick it again.'],
                    ['A perk', 'Finishing a goal gives a perk: a small change to the game\'s numbers that lasts for good (lower prices, energy that lasts longer, a bonus on rolls). A goal gives a perk, not a trait: traits are who you are. Your perks are in the Goals app and on your profile; when two touch the same thing, percentages multiply and flat bonuses add.'],
                    ['Life points', `Each step of your goal gives life points (${GOAL_POINTS.step}), and finishing it more (${GOAL_POINTS.goal}). Festivals and city events (the first time each year), street stories, secrets and storylines you followed give a few too, up to ${DAILY_CAP} a day.`],
                    ['Rewards', 'Spend life points in the Goals app\'s Rewards tab: a lucky day, energy full now, a nudge in how someone feels about you, a fresh start with someone, a trait swapped… Each shows its price and how often it can be used; some only work in certain places, and a world may have its own.'],
                ] }] : []),
        ...((w && degreesOffered(w).length) ? [{ id: 'university', icon: 'book', title: 'University', intro: `Study for a degree at a university, like in The Sims: enroll ${appRef(w, 'campus')}, take a few modules each term (a term is a season) and graduate.`,
                items: [
                    ['Terms and modules', "Each term you take two or three of the degree's modules (the required ones are marked); choose next term's in the last week of this one. A module's classes are on campus on set weekdays: go to them (Study, in the things to do there)."],
                    ['Coursework', 'Each module asks for a few hours of coursework a week: Coursework at home, or studying in a library or a quiet room. Each hour goes to the module furthest behind.'],
                    ['Grades', "When the term ends every module gets a grade, A to F: attendance, coursework and the final (a roll on its skill). A term's grade point average (GPA) under the minimum is a weak term: two put you on probation, three and you are out. An F is taken again in a later term."],
                    ['Money', "Tuition is paid each term; a scholarship pays it while each term's GPA holds, and a weak term takes it away. Unpaid tuition holds your classes until you pay it in the Campus app."],
                    ['Being a student', "While you study you work a few shifts a week at most and rent only student homes (unless your family pays). Some jobs and ranks want a degree; you can join one of the school's clubs too."],
                    ['Graduating', 'Pass enough modules, every required one among them, and you graduate: a degree jobs ask for, life points, and with a GPA of 3.5 or more a distinguished degree that starts you a rank up in related jobs.'],
                ] }] : []),
        ...((w && ventureDefs(game(), w).length) ? [{ id: 'business', icon: 'store', title: 'Running a business', intro: `A late game: a business of your own, or a division to run at the top of a company. Follow it ${appRef(w, 'business')}.`,
                items: [
                    ['Ways in', 'The Business app lists them: take over a place you work at, lease a unit and name it, buy a hotel for sale, go into partnership, or rise above a career\'s top. Each says what it costs and what it asks for.'],
                    ['Hotels', 'A hotel earns by its rooms: Capacity opens them, its other numbers and the calendar fill them. Part of a hotel\'s price can be paid off from its takings, never from your own money. Someone may rent a room for a business of their own.'],
                    ['How it grows', "A business has a few numbers that make what a day brings in. Upgrades raise them for good: some are bought, some turn up around the city, some are earned. Each tier has a ceiling, and the next asks for a milestone."],
                    ['Running it', 'Work the counter yourself for the whole day\'s takings and the chance of something coming up, or let hired hands keep it open. The takings come at the week\'s end, with a report; left alone, it never collapses.'],
                    ['People', "The world's people are never your staff, but friends come by, and a business can change how their stories end."],
                ] }] : []),
        { id: 'journal', icon: 'book', title: 'Memory and the diary', intro: 'Mundi remembers in short facts ("You met Bianca at the café"). The AI gets only the facts of the people in the scene.',
            items: [
                ['The diary', 'Written when you sleep, from the day\'s facts and conversations. It tells the AI what happened on the days before.'],
                ['Translated', 'If SillyTavern\'s Chat Translation translates the replies, the diary and Mundi\'s ready-made lines are translated too.'],
                ['Remember this', 'On a line of the story: turns it into a fact.'],
            ] },
        { id: 'family', icon: 'users', title: 'Households and family', intro: 'People who live together share a home, like in The Sims.',
            items: [
                ['Your household', 'The faces under your card. Click one to play as them, call them over or go to them.'],
                ['Households', 'In ☰ → This world: who lives where, and how they are related.'],
                ['Children', 'A baby grows a stage at each birthday, once a week. Celebrate it from their card.'],
            ] },
        { id: 'playas', icon: 'user', title: 'Play as someone else', intro: 'Click your photo to switch to another person of the world.',
            items: [
                ['Choosing who you can play', '"Choose who you can play" keeps people ready; you switch only when you click one.'],
                ['What changes', 'You go where they are and live in their home. Each person keeps their own relationships, diary and job.'],
                ['What stays', 'Energy, needs and money are the same for everyone you play.'],
                ['The one you were', 'Stays where they were, or with you if they were your company.'],
            ] },
        { id: 'look', icon: 'palette', title: 'Look and settings', intro: 'Make it yours.',
            items: [
                ['Chat look (☰ menu)', 'Visual novel, Classic or Cards; sizes; colors with transparency; colors from a SillyTavern theme.'],
                ['Presets', 'Mundi\'s presets (Midnight Glass, Rose Dusk, Forest Calm) and your own. They also tint the HUD\'s glass.'],
                ['This world', 'People, homes, households and what the AI is told (AI context).'],
                ['A red warning on top', 'Something in SillyTavern may hurt the game (context too big, Summarize on…). It says what to change.'],
                ['Tip', 'A context of about 30k tokens works well. Keep it the same in SillyTavern and in your AI program.'],
            ] },
    ];
};
const H = { open: false, topic: 'start' };
export const openHelp = () => { H.open = true; notify(); };
export function helpHtml() {
    if (!H.open)
        return '';
    const g = game();
    const w = g ? getWorld(g.world) : null;
    const TOPICS = topics(w);
    const t = TOPICS.find(x => x.id === H.topic) ?? TOPICS[0];
    return `<div class="mu-recap-veil mu-help-veil" data-act="help-bg"><section class="mu-recap mh-glass mu-help" role="dialog" aria-label="${lex(w, 'help')}">
        <header class="mu-row"><div><small>${lex(w, 'help')}</small><h3>How Mundi works</h3></div><button class="mu-ibtn mu-ghost mu-right" data-act="help-close" aria-label="Close">${icon('x')}</button></header>
        <div class="mu-help-body">
            <nav class="mu-help-nav">${TOPICS.map(x => `<button class="${x.id === t.id ? 'is-on' : ''}" data-act="help-topic" data-id="${esc(x.id)}">${icon(x.icon)}<span>${x.title}</span></button>`).join('')}</nav>
            <article class="mu-help-page" data-keep="help-page">
                <h4>${icon(t.icon)} ${t.title}</h4>
                <p class="mu-help-intro">${t.intro}</p>
                <dl>${t.items.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
            </article>
        </div></section></div>`;
}
Object.assign(ACT, {
    'help-close': () => { H.open = false; notify(); },
    'help-bg': (el, e) => { if (e.target === el) {
        H.open = false;
        notify();
    } },
    'help-topic': (el) => { H.topic = el.dataset.id; notify(); requestAnimationFrame(() => { const p = document.querySelector('#mundi-root .mu-help-page'); if (p)
        p.scrollTop = 0; }); },
});
