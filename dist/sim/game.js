// Games and saves. A new game creates native SillyTavern objects: the cast's cards (the world's own people chosen
// for this game, made once with their portraits and sprites and reused by later games), the player's persona, the
// world's lorebook and a group chat. The save lives in that chat. Also where a game starts (E16 starts), the world's
// own households (E18) and what adult content leaves out (E15).
import { pictureAt } from './daynight.js';
import { addXp, makeSheet, syncLife } from './rpg.js';
import { rpgOf } from '../core/rpgdef.js';
import { SCHEMA } from '../core/saves.js';
import { worldFile, isScenario, SCENARIO_STARTS } from '../core/world.js';
import { DIFFICULTIES } from './bills.js';
import { placeOf as placeOf2 } from './places.js';
import { TUT, settings as settings2, cfg as cfgOf } from '../core/store.js';
import { note, placeName } from './facts.js';
import { settings, saveSettings, state, game, setGame, saveGame, notify, toast, } from '../core/store.js';
import { loadWorld, getWorld, exampleTag } from '../core/world.js';
import { setWorldDicts } from '../core/tr.js';
import { lang } from '../core/i18n.js';
import { characters, charOf, createCharacter, createPersona, usePersona, createGroup, openGame, groupOf, clearGreetings, writeLorebook, bindChatLore, setPresent, saveMeta, chat, currentChatId, selectedGroup, pastChats, deleteChat, deleteGroup, setPersonaSheet, personaSheet, personaName, recentChats, ctx, deleteScenarioChat, saveName, copyGroupChat, groupChatId, readChatMeta, uploadSprite, saveCardMundi, setCharacterImage, DEFAULT_EXPRESSIONS, } from '../st/bridge.js';
import { findStart, defaultStart, withStartTraits, applyStart } from './starts.js';
import { playerHomeId } from './places.js';
import { presentAt } from './people.js';
import { sceneText, refreshPrompt } from './prompt.js';
import { liveTogether, normalizeHomes, ties as tiesOfSave } from './living.js';
import { addOldTie, applyStartFeel } from './startfeel.js';
import { FRIEND_START, levelOfApproval, isFamily } from '../core/feel.js';
import { checkLeft } from './verdict.js';
import { fr, setFr, seedFamily, relOf, YOU } from './rel.js';
import { cleanPerson, exampleSettings, applyPerson } from './gender.js';
import { applyGameLore } from './lore.js';
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// A square portrait with initials on a gradient (used when no image is chosen).
export function initialsAvatar(name, colors) {
    const c = document.createElement('canvas');
    c.width = c.height = 400;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 400, 400);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, 400, 400);
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.font = '700 170px "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(), 200, 215);
    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}
const PALETTE = [['#ff7a9a', '#7a2e8f'], ['#3b82f6', '#6d28d9'], ['#f59e0b', '#b45309'], ['#10b981', '#065f46'], ['#ef4444', '#7f1d1d'], ['#8b5cf6', '#312e81'], ['#06b6d4', '#164e63'], ['#ec4899', '#831843']];
// `start`: the start chosen (by default the world's start with the origin's id); an origin's words are told as before.
export function heroDescription(w, h, start) {
    const origin = w.catalogs.origins?.find(o => o.id === h.origin);
    const st = start ?? findStart(w, h.origin, true);
    const background = origin && (!start || start.id === origin.id) ? `Background: ${origin.name} — ${origin.desc ?? ''}`
        : st ? `Background: ${st.name} — ${st.premise?.trim() || st.desc || ''}` : '';
    const look = (w.sheet.appearance ?? []).map(a => h.appearance[a.id] ? `${a.label.toLowerCase()}: ${h.appearance[a.id].toLowerCase()}` : '').filter(Boolean).join(', ');
    const traits = (w.sheet.traits ?? []).map(t => (h.traits?.[t.id]?.length ? `${t.label}: ${h.traits[t.id].map(x => x.toLowerCase()).join(', ')}.` : '')).filter(Boolean);
    return [
        `{{user}} is ${h.name}, ${h.age}.`,
        look ? `Appearance: ${look}.` : '',
        background,
        ...traits,
        h.bio.trim(),
    ].filter(Boolean).join('\n');
}
export const sheetOf = (w, h) => ({ world: w.id, name: h.name, age: h.age, appearance: { ...h.appearance }, origin: h.origin, traits: JSON.parse(JSON.stringify(h.traits ?? {})), bio: h.bio });
/* ---------- the cast ---------- */
// The world's people chosen for this game become real cards (created once, reused by later games). (E3) A card is made
// with its portrait from the world's folder (initials without one) and its expression sprites; a card made before the
// world had them gets them once.
async function exampleCards(w, list) {
    const out = [];
    let i = 0;
    for (const ex of list) {
        const tag = exampleTag(w, ex);
        const slugName = ex.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const byFile = new RegExp(`^mundi_(?:${[ex.from, w.id].filter(Boolean).map(x => String(x).replace(/[^a-z0-9_-]/gi, '')).join('|')})_${slugName}(?:_?\\d+)?\\.png$`, 'i');
        const found = characters().find(c => c.data?.extensions?.mundi?.example === tag) ?? characters().find(c => byFile.test(String(c.avatar ?? '')));
        if (found) {
            out.push(found.avatar);
            i++;
            await examplePictures(w, ex, found.avatar);
            continue;
        }
        const file = `mundi_${w.id}_${ex.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        const pic = await worldPicture(w, ex.avatar);
        const avatar = await createCharacter({
            name: ex.name, description: ex.description, first_mes: ex.first_mes ?? '', personality: ex.personality ?? '',
            scenario: w.setting, tags: ['Mundi', w.name], file,
            extensions: { mundi: { example: tag, world: w.id, occupation: ex.occupation, home: ex.home, routine: ex.routine, leisure: ex.leisure ?? [], ...(pic ? { portrait: ex.avatar } : {}) } },
        }, pic ?? await initialsAvatar(ex.name, PALETTE[i % PALETTE.length]));
        i++;
        out.push(avatar);
        await examplePictures(w, ex, avatar);
    }
    return out;
}
// A picture from the world's folder, or null when there is none (or it can't be read).
async function worldPicture(w, file) {
    if (!file)
        return null;
    try {
        const res = await fetch(worldFile(w, file));
        if (!res.ok)
            return null;
        const b = await res.blob();
        return b.size ? b : null;
    }
    catch {
        return null;
    }
}
// The sprites in a world's folder: the files its `sprites.json` lists (each file's name is its expression), or one
// file per default expression (`joy.png`…).
async function spriteFiles(w, folder) {
    const base = folder.replace(/\/*$/, '/');
    try {
        const res = await fetch(worldFile(w, `${base}sprites.json`));
        const list = res.ok ? await res.json() : null;
        if (Array.isArray(list))
            return list.filter(f => typeof f === 'string' && /^[\w .-]+\.(png|webp|gif|jpe?g)$/i.test(f)).map(f => ({ label: f.replace(/\.[^.]+$/, '').toLowerCase(), file: base + f }));
    }
    catch { /* no list: the default names */ }
    return DEFAULT_EXPRESSIONS.map(label => ({ label, file: `${base}${label}.png` }));
}
// What a card still lacks from the world (its portrait, its sprites), uploaded once: the card remembers what it got.
async function examplePictures(w, ex, avatar) {
    const card = charOf(avatar)?.data?.extensions?.mundi ?? {};
    try {
        if (ex.avatar && card.portrait !== ex.avatar) {
            const pic = await worldPicture(w, ex.avatar);
            if (pic) {
                await setCharacterImage(avatar, pic);
                await saveCardMundi(avatar, { portrait: ex.avatar });
            }
        }
        if (ex.sprites && card.sprites !== ex.sprites) {
            let n = 0;
            for (const s of await spriteFiles(w, ex.sprites)) {
                const b = await worldPicture(w, s.file);
                if (!b)
                    continue;
                await uploadSprite(avatar, s.label, b);
                n++;
            }
            if (n)
                await saveCardMundi(avatar, { sprites: ex.sprites }); // none found: tried again next time
        }
    }
    catch (e) {
        console.warn('[Mundi] pictures of', ex.name, e);
    }
}
/* ---------- adult content (E15) ---------- */
// The world's people in a game: the ones chosen (all of them when none are named), without the adult-only ones when
// adult content is off.
export const worldPeopleFor = (w, names, adult) => w.cast.examples.filter(e => (adult || !e.adult) && (!names || names.includes(e.name)));
// One of this world's adult-only people (a card made in a game with adult content on).
const adultOnlyCard = (w, avatar) => { const tag = charOf(avatar)?.data?.extensions?.mundi?.example; return !!tag && w.cast.examples.some(e => e.adult && exampleTag(w, e) === tag); };
// The world's lorebook: its setting, lore and places. A world with adult lore or places has a second book for games
// with adult content on, so the games with it off never share one with them.
const hasAdultLore = (w) => w.lore.some(l => l.adult) || w.places.some(p => p.adult);
export const loreBookName = (w, adult) => `Mundi - ${w.name}${adult && hasAdultLore(w) ? ' (adult)' : ''}`;
export async function writeWorldLore(w, adult) {
    const ok = (x) => adult || !x.adult;
    const name = loreBookName(w, adult);
    await writeLorebook(name, [
        { keys: [w.name], content: w.setting, constant: true, comment: 'Setting' },
        ...w.lore.filter(ok).map(l => ({ keys: l.keys, content: l.content, constant: !!l.constant })),
        ...w.places.filter(ok).map(p => ({ keys: [p.name], content: `${p.name}: ${p.desc ?? ''}`, comment: `Place: ${p.name}` })),
    ]);
    return name;
}
/** Turns adult content on or off for the open game (the save's settings): the lorebook follows and the AI is told
 *  again. Nothing in the save is removed, so turning it back on brings everything back. */
export async function setAdult(g, on) {
    const w = getWorld(g.world);
    if (!w)
        return;
    if (on)
        cfgOf(g).adult = true;
    else
        delete cfgOf(g).adult;
    if (hasAdultLore(w) && !TUT.save)
        await bindChatLore(await writeWorldLore(w, on));
    saveGame();
    refreshPrompt();
    notify();
}
export { spotKey, takenHomes, homeSpot } from './homes.js';
import { spotKey, homeSpot, takenHomes } from './homes.js';
// Home: someone given a "second flat" at a bedroom (more people than bedrooms) shares that bedroom instead.
export function shareRooms(g) { for (const r of Object.values(g.cast)) {
    delete r.home.unit;
    r.occupation = null;
} } // (and no ready-made jobs in a Home)
// Home: a character joins the house in the middle of a game (a free bedroom, or sharing one).
export async function addResident(g, w, avatar) {
    if (g.cast[avatar])
        return null;
    const r = resident(w, avatar, takenHomes(g), g.player.home);
    delete r.home.unit;
    r.occupation = null;
    const st = SCENARIO_STARTS.find(s => s.id === g.cfg?.start?.id);
    r.met = !!st?.met;
    g.cast[avatar] = r;
    normalizeHomes(g);
    note(g, '{0} moved into the house.', [r.name], [avatar], g.player.loc, 'event');
    await syncScene();
    return r;
}
// Home: someone moves out of the house (their card and chats stay in SillyTavern; their memories of the house stay in
// the story's facts). Plans with them are called off.
export function removeResident(g, avatar) {
    const r = g.cast[avatar];
    if (!r)
        return;
    const soc = g.social;
    if (soc) {
        soc.with = (soc.with ?? []).filter((c) => c.avatar !== avatar);
        for (const a of soc.appts ?? [])
            if (a.avatar === avatar && (a.state === 'set' || a.state === 'met'))
                a.state = 'cancelled';
        if (soc.solo === avatar)
            soc.solo = '';
    }
    for (const x of Object.values(g.cast))
        if (x.homeWith === avatar)
            delete x.homeWith;
    delete g.cast[avatar];
    normalizeHomes(g);
    note(g, '{0} moved out of the house.', [r.name], [avatar], g.player.loc, 'event');
}
// Home: moves someone to another bedroom (a spot of a housing area); with someone there already, they share it.
export function moveToRoom(g, avatar, h) {
    const r = g.cast[avatar];
    if (!r)
        return;
    r.home = { zone: h.zone, x: h.x, y: h.y };
    delete r.homeWith;
    normalizeHomes(g);
}
export function resident(w, avatar, taken, avoid) {
    const ch = charOf(avatar);
    const card = ch?.data?.extensions?.mundi ?? {};
    // one of this world's own people: her job, home and routine come from the world (also in copied worlds)
    const ex = w.cast.examples.find(e => exampleTag(w, e) === card.example);
    const meta = ex ? { world: w.id, occupation: ex.occupation, home: ex.home, routine: ex.routine, leisure: ex.leisure ?? [] } : card;
    const occupation = meta.world === w.id ? meta.occupation ?? null : pick([...w.occupations.map(o => o.id), null]);
    const templateId = meta.world === w.id && meta.routine ? meta.routine : (occupation ? pick(['office', 'early']) : pick(Object.keys(w.cast.routineTemplates)));
    const routine = structuredClone(w.cast.routineTemplates[templateId] ?? Object.values(w.cast.routineTemplates)[0]);
    const zone = meta.world === w.id && meta.home ? meta.home : pick(w.homes.zones).id;
    return { avatar, name: ch?.name ?? avatar, occupation, home: homeSpot(w, zone, taken, avoid), routine, leisure: meta.world === w.id ? meta.leisure ?? [] : [], met: false };
}
export async function startNewGame(o) {
    const w = o.world;
    const adult = !!o.adult;
    state.busy = 'Creating the cast';
    notify();
    // without adult content, the world's adult-only people aren't made (nor brought along as cards made before)
    const cast = [...new Set([...(o.examples ? await exampleCards(w, worldPeopleFor(w, o.worldPeople, adult)) : []), ...o.cast])].filter(a => adult || !adultOnlyCard(w, a));
    if (!cast.length)
        throw new Error('Choose at least one person to live in the world.');
    // the start: what it gives your character (traits) is part of who you are from the persona on
    const start = isScenario(w) ? undefined : o.worldStart ?? findStart(w, o.hero.origin, adult) ?? defaultStart(w, adult);
    if (start)
        o.hero = { ...o.hero, traits: withStartTraits(w, o.hero.traits, start) };
    // your character: a persona you already have, or a new one saved to your personas
    let personaFile = o.persona ?? '';
    if (personaFile) {
        o.hero.name = personaName(personaFile);
        const sheet = personaSheet(personaFile);
        // the origin, traits and words chosen in the new game win; the persona keeps them for its next game here
        const chosen = Object.values(o.hero.traits ?? {}).some(v => (Array.isArray(v) ? v.length : !!v));
        if (!chosen && sheet?.traits && sheet.world === w.id)
            o.hero.traits = sheet.traits;
        setPersonaSheet(personaFile, { ...(sheet ?? {}), world: w.id, origin: o.hero.origin, traits: JSON.parse(JSON.stringify(o.hero.traits ?? {})), bio: o.hero.bio ?? '', person: cleanPerson(o.people?.[YOU]) });
    }
    else {
        state.busy = 'Creating your character';
        notify();
        const portrait = o.hero.portrait ?? await initialsAvatar(o.hero.name, ['#22d3ee', '#4f46e5']);
        personaFile = await createPersona(o.hero.name, heroDescription(w, o.hero, start), portrait);
        setPersonaSheet(personaFile, { ...sheetOf(w, o.hero), person: cleanPerson(o.people?.[YOU]) });
    }
    state.busy = 'Writing the world\'s lorebook';
    notify();
    const loreName = await writeWorldLore(w, adult);
    state.busy = 'Creating the world\'s group chat';
    notify();
    const groupId = await createGroup(`Mundi · ${w.name} · ${o.hero.name}`, cast);
    await openGame(groupId);
    clearGreetings();
    const taken = new Set();
    // an origin still gives what only it has (RPG skills and attributes, "knows N people"): the one the start came from
    const origin = start ? w.catalogs.origins?.find(x => x.id === start.id) : w.catalogs.origins?.find(x => x.id === o.hero.origin) ?? w.catalogs.origins?.[0];
    const picked = o.home && w.homes.zones.find(z => z.id === o.home.zone);
    if (picked)
        taken.add(spotKey(o.home.zone, o.home.x, o.home.y));
    // homes chosen for households are nobody else's
    for (const h of o.households ?? [])
        if (h.home && w.homes.zones.some(z => z.id === h.home.zone))
            taken.add(spotKey(h.home.zone, h.home.x, h.home.y));
    const area = [start?.home, origin?.home].find(z => z && w.homes.zones.some(x => x.id === z)) ?? origin?.home ?? w.homes.zones[0].id;
    const home = picked ? { zone: o.home.zone, x: o.home.x, y: o.home.y, n: o.home.n } : homeSpot(w, area, taken);
    const zone = w.homes.zones.find(z => z.id === home.zone);
    const save = {
        v: 1, world: w.id, lang: lang(), day: w.time.startDay, minutes: w.time.startMinutes, speed: w.time.speed,
        player: {
            loc: playerHomeId, home: { ...home, kind: zone.kind },
            stats: Object.fromEntries(w.statuses.map(s => [s.id, s.start])),
            money: Math.round((start?.money ?? origin?.money ?? 0) * (DIFFICULTIES.find(d => d.id === (o.difficulty ?? 'normal'))?.start ?? 1)), traits: JSON.parse(JSON.stringify(o.hero.traits ?? {})), origin: origin?.id ?? '', job: null, rentPaidDay: w.time.startDay,
        },
        cast: {}, tick: {}, log: [],
        ...{ cfg: { difficulty: o.difficulty ?? 'normal', ...(o.mode ? { mode: o.mode } : {}), ...(adult ? { adult: true } : {}) }, schema: SCHEMA },
    };
    // a persona's words about you in this world (its own description stays as it is)
    if (o.persona && o.hero.bio?.trim())
        save.player.bio = o.hero.bio.trim().slice(0, 1200);
    // nobody lives in your home unless you chose them (your household)
    for (const a of cast)
        save.cast[a] = resident(w, a, taken, save.player.home);
    // jobs chosen at the start: the job, and a routine that goes to work (or none that does)
    for (const [a, id] of Object.entries(o.jobs ?? {})) {
        const r = save.cast[a];
        if (!r)
            continue;
        const job = id === 'none' ? null : w.occupations.find(x => x.id === id);
        if (id !== 'none' && !job)
            continue;
        r.occupation = job?.id ?? null;
        const goes = (t) => [...(t?.weekday ?? []), ...(t?.weekend ?? [])].some((s) => s[1] === 'work');
        if (!!job !== goes(r.routine)) {
            const tpl = Object.entries(w.cast.routineTemplates).find(([k, t]) => goes(t) === !!job && (!job || k === 'office' || k === 'early')) ?? Object.entries(w.cast.routineTemplates).find(([, t]) => goes(t) === !!job);
            if (tpl)
                r.routine = structuredClone(tpl[1]);
        }
    }
    // RPG: the character sheet (class, attributes, skills; the background adds its own)
    if ((o.mode ?? w.mode) === 'rpg' && rpgOf(w) && o.rpg) {
        save.rpg = makeSheet(w, { ...o.rpg, origin });
        syncLife(save, w);
    }
    // memories carried over from another life (another game with some of the same people): memories only
    if (o.memoriesFrom) {
        try {
            await portMemories(save, o.memoriesFrom);
        }
        catch (e) {
            console.warn('[Mundi] memories', e);
        }
    }
    // the world's own people in this game, by name (their ties, feelings and households only between those here)
    const exAvatar = new Map();
    for (const a of Object.keys(save.cast)) {
        const tag = charOf(a)?.data?.extensions?.mundi?.example;
        const ex = w.cast.examples.find(e => exampleTag(w, e) === tag);
        if (ex)
            exAvatar.set(ex.name, a);
    }
    // (E18) the world's households: everyone here with the same household id shares the home of the first one
    const worldHh = new Map();
    for (const ex of w.cast.examples) {
        const a = exAvatar.get(ex.name);
        if (a && ex.household)
            worldHh.set(ex.household, [...(worldHh.get(ex.household) ?? []), a]);
    }
    for (const [head, ...rest] of worldHh.values())
        for (const a of rest)
            liveTogether(save, head, a);
    // your household moves in with you; each other household shares the home of its first member (both win over the
    // world's own households)
    for (const f of o.family ?? []) {
        if (!save.cast[f.avatar])
            continue;
        save.cast[f.avatar].met = true;
        liveTogether(save, '__you', f.avatar);
        if (f.type && isFamily(f.type))
            addOldTie(save, { a: f.avatar, b: '__you', type: f.type }, true);
    }
    for (const h of o.households ?? []) {
        const [head, ...rest] = h.members.filter(a => save.cast[a]);
        if (!head)
            continue;
        if (h.home && w.homes.zones.some(z => z.id === h.home.zone)) {
            save.cast[head].home = { zone: h.home.zone, x: h.home.x, y: h.home.y, n: h.home.n };
            delete save.cast[head].homeWith;
        }
        for (const a of rest)
            liveTogether(save, head, a);
        for (const t of h.ties)
            if (save.cast[t.a] && save.cast[t.b] && isFamily(t.type))
                addOldTie(save, { a: t.a, b: t.b, type: t.type }, true);
    }
    // relations: the world's own (between its example people) and the ones chosen for this game (anyone with anyone),
    // which win over the world's: family becomes ties, the rest starting feelings (sim/startfeel.ts)
    for (const ex of w.cast.examples)
        for (const t of ex.ties ?? []) {
            const a = exAvatar.get(ex.name), b = exAvatar.get(t.to);
            if (a && b && a !== b)
                addOldTie(save, { a, b, type: t.type, tone: t.tone, back: t.back });
        }
    // the example people's ages (minors are left out of every romance)
    for (const ex of w.cast.examples) {
        const a = exAvatar.get(ex.name);
        if (a && Number.isFinite(ex.age))
            (relOf(save).people[a] ??= {}).age = ex.age;
    }
    // each one's own ways (gender, pace, styles): as chosen in the new game, else their card's, else the world's
    const exOf = new Map([...exAvatar].map(([name, a]) => [a, w.cast.examples.find(e => e.name === name)]));
    for (const a of Object.keys(save.cast))
        applyPerson(save, a, o.people?.[a] ? cleanPerson(o.people[a]) : cleanPerson(charOf(a)?.data?.extensions?.mundi?.person) ?? exampleSettings(exOf.get(a)));
    applyPerson(save, YOU, cleanPerson(o.people?.[YOU]));
    // the world's own starting feelings (after ages and minors are known: no romance for them; adult ones only with
    // adult content on)
    for (const ex of w.cast.examples)
        for (const f of ex.feelings ?? []) {
            const a = exAvatar.get(ex.name), b = exAvatar.get(f.to);
            if (a && b && a !== b && (adult || !f.adult)) {
                const { to, adult: x, ...feel } = f;
                void to;
                void x;
                applyStartFeel(save, { a, b, ...feel });
            }
        }
    // (E16) the start: its job, skills, the people you already know, the household you live with
    applyStart(save, w, start);
    for (const t of o.relations ?? []) {
        if ((t.a !== '__you' && !save.cast[t.a]) || (t.b !== '__you' && !save.cast[t.b]) || t.a === t.b)
            continue;
        if (t.family && isFamily(t.family))
            addOldTie(save, { a: t.a, b: t.b, type: t.family }, true);
        applyStartFeel(save, t, true); // with you: where you stand with them from day one
        const other = t.a === '__you' ? t.b : t.b === '__you' ? t.a : '';
        if (other)
            save.cast[other].met = true;
    }
    // a scenario: how you fit in the house (you know everyone already, or nobody), unless a relation said otherwise
    const st0 = isScenario(w) && o.start ? SCENARIO_STARTS.find(s => s.id === o.start.id) : undefined;
    if (st0) {
        if (o.rooms)
            save.cfg.rooms = o.rooms.filter(id => w.places.some(p => p.id === id));
        if (o.rooms)
            save.cfg.roomsSeen = w.places.filter(p => !p.link).map(p => p.id); // the rooms there were to choose from
        if (o.extraRooms?.length)
            save.cfg.extraRooms = o.extraRooms.filter(r => r?.id && r?.name).map(r => ({ id: r.id, name: String(r.name).slice(0, 60), map: w.maps[0]?.id ?? '', x: 50, y: 50, tags: r.tags ?? ['leisure'], desc: String(r.desc ?? '').slice(0, 400), ...(r.bg ? { bg: r.bg } : {}), closed: [] }));
        if (o.roomActs && Object.keys(o.roomActs).length)
            save.cfg.roomActs = o.roomActs;
        save.cfg.start = { id: st0.id, ...(st0.id === 'custom' && o.start.text?.trim() ? { text: o.start.text.trim().slice(0, 4000) } : {}) };
        if (st0.met)
            for (const r of Object.values(save.cast)) {
                const liv = (save.living ??= {});
                if (!r.met) {
                    if (!fr(save, r.avatar, YOU))
                        setFr(save, r.avatar, YOU, st0.bond ?? 0);
                    (liv.approval ??= {})[r.avatar] ??= st0.approval ?? 0;
                }
                r.met = true;
            }
    }
    // where each one stands with you, from a preset: approval as chosen, and friendship from the matching level
    for (const [a, v] of Object.entries(o.approval ?? {})) {
        if (!save.cast[a] || !Number.isFinite(v))
            continue;
        const liv = (save.living ??= {});
        (liv.approval ??= {})[a] = Math.max(-100, Math.min(100, v));
        setFr(save, a, YOU, FRIEND_START[levelOfApproval(v)]);
        save.cast[a].met = true;
    }
    // feelings in families and couples (and your own, hidden while you play) start where they usually do
    seedFamily(save, tiesOfSave(save));
    delete save.rel?.day; // starting values aren't the first day's changes
    if (isScenario(w))
        shareRooms(save); // Home: more people than bedrooms share a room (no second flat in a house)
    normalizeHomes(save);
    // the world's lorebooks and the characters' lorebooks chosen to stay on in this world
    const books = [...new Set([...(w.lorebooks ?? []), ...(o.lore ?? [])])];
    if (books.length)
        save.cfg = { ...save.cfg, lore: books }; // keeps the difficulty
    Object.values(save.cast).slice(0, origin?.knows ?? 0).forEach(r => { r.met = true; });
    setGame(save);
    await bindChatLore(loreName);
    if (w.note?.text) { // the world's Author's Note, the same one SillyTavern uses
        const m = ctx().chatMetadata;
        m.note_prompt = w.note.text;
        m.note_interval = w.note.interval ?? 1;
        m.note_depth = w.note.depth ?? 4;
        m.note_position = w.note.position ?? 1;
    }
    await usePersona(personaFile);
    await saveMeta();
    const entry = { groupId, world: w.id, title: `${w.name} · ${o.hero.name}`, persona: personaFile, created: Date.now(), last: Date.now() };
    settings().games.unshift(entry);
    settings().lastGame = groupId;
    settings().last = { kind: 'world', group: groupId, chatId: currentChatId() };
    saveSettings();
    await applyGameLore();
    await afterEnter();
}
/* ---------- entering and leaving ---------- */
export const gameEntry = (groupId) => settings().games.find(e => e.groupId === groupId) ?? null;
export const currentEntry = () => gameEntry(selectedGroup());
export async function enterGame(groupId, chatId) {
    const entry = gameEntry(groupId);
    if (!entry || !groupOf(groupId)) {
        toast('This game no longer exists in SillyTavern.', 'error');
        return;
    }
    await loadWorld(entry.world);
    await openGame(groupId, chatId);
    if (!game()) {
        toast('This chat has no Mundi save.', 'error');
        return;
    }
    entry.last = Date.now();
    tokenNote();
    settings().lastGame = groupId;
    settings().last = { kind: 'world', group: groupId, chatId: currentChatId() };
    saveSettings();
    await usePersona(entry.persona);
    await afterEnter();
}
// When a save loads: how big its chat is, and how much of it actually goes to the AI (only the current scene's lines
// are sent; older ones are hidden and live on as facts and the diary).
function tokenNote() {
    const list = chat();
    const g = game();
    if (!g)
        return;
    const est = (t) => Math.ceil(t.length / 3.6);
    const all = list.reduce((n, m) => n + est(String(m.mes ?? '')), 0);
    const sent = list.filter(m => !m.is_system).reduce((n, m) => n + est(String(m.mes ?? '')), 0);
    const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
    toast(`This save: ${list.length} messages (≈ ${k(all)} tokens in all). Sent to the AI now: ≈ ${k(sent)} from the chat + ≈ ${k(est(sceneText()))} from Mundi, plus your preset and the cards of who is in the scene.`, 'info', { ms: 9000 });
}
async function afterEnter() {
    const g = game();
    const w = g && getWorld(g.world);
    if (w)
        setWorldDicts(w.id, w.i18n ?? {});
    state.view = 'map';
    state.sel = null;
    await syncScene();
    notify();
}
// A branch: a copy of this save as it is now (story, diary, state), saved next to it. You stay where you are;
// the branch shows up in Load.
export async function branchSave() {
    const g = game();
    const gid = selectedGroup();
    if (!g || !gid)
        return;
    saveGame();
    await saveMeta();
    const id = saveName(' (branch)');
    await copyGroupChat(gid, id, structuredClone(ctx().chatMetadata ?? {}), structuredClone(chat()));
    toast('Branch saved. You are still in this save; the branch is in Load.', 'success');
}
/* ---------- the scene follows the player ---------- */
let syncing = Promise.resolve();
// Who is here: present residents are unmuted in the group, everyone else is muted. Then the prompt is refreshed.
// Someone you did not know becomes someone you know: only through an interaction (they answered you in the scene,
// you stopped to talk or said hi, you introduced yourself…), never just by being in the same place.
export function markMet(g, avatar) {
    const r = g.cast[avatar];
    const w = getWorld(g.world);
    if (!r || r.met || !w)
        return false;
    r.met = true;
    note(g, '{u} met {0} for the first time, at {1}.', [r.name, placeName(g, w, g.player.loc)], [r.avatar], g.player.loc, 'meet');
    addXp(g, w, 10, 'met someone'); // RPG: meeting people is experience too
    return true;
}
export function syncScene() {
    syncing = syncing.then(async () => {
        const g = game();
        const gid = selectedGroup();
        if (!g || !gid || TUT.save)
            return; // the tutorial's world is not a group chat
        const w = getWorld(g.world);
        if (!w)
            return;
        const here = presentAt(g, w, g.player.loc);
        checkLeft(g, w, here.map(r => r.avatar)); // someone who spoke left: that part of the scene is judged
        // talking with only one person: the others stay in the scene but keep quiet
        let solo = String(g.social?.solo ?? '');
        // the one you were talking to alone left: everyone talks again
        if (solo && !here.some(r => r.avatar === solo)) {
            g.social.solo = '';
            solo = '';
        }
        const talking = solo ? [solo] : here.map(r => r.avatar);
        await setPresent(gid, Object.keys(g.cast), talking);
        // Home: the room's dress code (the outfits are looked up in the background; the next sync catches up)
        {
            const { applyDress, dressAt } = await import('./dress.js');
            const { outfitsOf, hasOutfit } = await import('../ui/outfits.js');
            const code = dressAt(g, g.player.loc);
            applyDress(g, w, a => { const l = outfitsOf(a); if (!code)
                return l; const h = hasOutfit(a, code); return h === null ? null : h ? [...(l ?? []), code] : (l ?? []); });
        }
        followBackground(g, w);
        refreshPrompt();
        saveGame();
    }).catch(e => console.warn('[Mundi] scene sync', e));
    return syncing;
}
/* ---------- memories from another life ---------- */
// Only memories travel between games (Life-Sim ↔ RPG, or two games of the same people): what the people of this cast
// remember from the other game, marked as from another life. Nothing else (money, skills, jobs) comes along.
export async function portMemories(save, chatId) {
    const meta = await readChatMeta(chatId);
    const old = meta?.mundi;
    if (!old)
        return 0;
    const here = new Set(Object.keys(save.cast));
    const list = (old.facts ?? []).filter(f => (f.who ?? []).some((a) => here.has(a))).slice(-120);
    const facts = (save.facts ??= []);
    for (const f of list)
        facts.push({ ...f, id: `life2:${f.id}`, at: 0, place: '', t: `(In another life) ${f.t}` });
    return list.length;
}
export async function listSaves() {
    const rows = [];
    for (const e of settings().games) {
        const g = groupOf(e.groupId);
        if (!g)
            continue;
        for (const c of await pastChats(e.groupId)) {
            const id = groupChatId(e.groupId, String(c.file_name ?? '').replace(/\.jsonl$/, ''));
            rows.push({ kind: 'world', groupId: e.groupId, chatId: id, title: e.title, world: e.world, last: Date.parse(c.last_mes) || Number(c.last_mes) || 0, count: Number(c.chat_items ?? 0), current: id === currentChatId() });
        }
    }
    // every other SillyTavern chat is a scenario
    const games = new Set(settings().games.map(e => e.groupId));
    try {
        for (const c of await recentChats()) {
            if (c.group && games.has(c.group))
                continue;
            // a chat nobody played (only the greeting, or empty: SillyTavern opens one by itself) is not a save
            if (c.count <= 1)
                continue;
            rows.push({ kind: 'chat', groupId: c.group ?? '', avatar: c.avatar, chatId: c.chatId, title: c.avatar ? charOf(c.avatar)?.name ?? '' : groupOf(c.group)?.name ?? '', world: '', last: c.last, count: c.count, current: c.chatId === currentChatId(), preview: c.preview });
        }
    }
    catch (e) {
        console.warn('[Mundi] recent chats', e);
    }
    return rows.sort((a, b) => b.last - a.last);
}
export async function deleteSave(r) {
    if (r.kind === 'chat') {
        await deleteScenarioChat({ avatar: r.avatar, group: r.groupId || undefined, chatId: r.chatId });
        return;
    }
    const g = groupOf(r.groupId);
    if (!g)
        return;
    if ((g.chats ?? []).length <= 1) { // the last save of a game: the whole game goes
        await deleteGroup(r.groupId);
        settings().games = settings().games.filter(e => e.groupId !== r.groupId);
        if (settings().lastGame === r.groupId)
            settings().lastGame = null;
        if (settings().last?.group === r.groupId)
            settings().last = null;
        saveSettings();
    }
    else
        await deleteChat(r.groupId, r.chatId);
}
// 35: SillyTavern's own chat background can follow the place you are in (Settings → Game).
function followBackground(g, w) {
    if (settings2().bgFollow !== 'chat')
        return;
    const p = placeOf2(g, w, g.player.loc);
    if (!p)
        return;
    let img = pictureAt(w, g.minutes, p.bg, w.places.find(x => x.id === p.id)?.bgs) ?? '';
    if (!img && p.home) {
        const k = w.homes.kinds[p.id === 'home:player' ? g.player.home.kind : (w.homes.zones.find(z => z.id === g.cast[p.id.slice(5)]?.home.zone)?.kind ?? '')];
        img = (k && pictureAt(w, g.minutes, k.image, k.images)) ?? '';
    }
    if (!img)
        return;
    const url = `url("${worldFile(w, img)}")`;
    const m = ctx().chatMetadata;
    if (m.custom_background === url)
        return;
    m.custom_background = url;
    ctx().saveMetadataDebounced();
    const el = document.getElementById('bg1');
    if (el)
        el.style.backgroundImage = url;
}
