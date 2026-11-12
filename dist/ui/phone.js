// The phone (Modern world): messages, people, jobs, bank and homes. Opens over the map or the scene.
import { safeUrl } from '../core/safe.js';
import { askingFrom, answerAdvice } from '../sim/happenings.js';
import { approvalOf, approvalWord } from '../sim/living.js';
import { interviewChance, interviewSkill, triedToday, retryText } from '../sim/skills.js';
import { missingCourses, isTaking } from '../sim/courses.js';
import { profileApp, jobCourseHtml } from './courses.js';
import { billList, billAmount, billName, owed, isCut, daysLeft, payBill, payOf, priceOf, owedAmount, paidToward, payPlan, daysToCut, toGetBackIn, cheapestHome } from '../sim/bills.js';
import { shopApp, feelingsHtml } from './lifeui.js';
import { goalsApp, goalsBadge } from './goalsui.js';
import { campusApp, campusBadge } from './campus.js';
import { studentLink } from '../sim/hooks.js';
import { sheetApp, questsApp, grimoireApp } from './rpgui.js';
import { partyApp } from './combatui.js';
import { standingApp, petsApp, apprenticeBtn, helpBtn } from './lifeplus.js';
import { factionsApp } from './factionsui.js';
import { holdingsApp } from './holdingsui.js';
import { towerApp, contractsApp, workshopApp, trophiesApp, bladeApp, soulApp, healthApp } from './adventureui.js';
import { PL } from './plans.js';
import { feel } from '../sim/life.js';
import { journalApp, openJournal } from './journal.js';
import { relBar, relSubtitle, workWeekHtml, perfWord, askTrack } from './relui.js';
import { note } from '../sim/facts.js';
import { notify, esc, game, toast, saveGame, settings, saveSettings } from '../core/store.js';
import { galleryPictures, photosOf } from './gallery.js';
import { getWorld, worldFile, deviceLook, socialKind, messageKind, appsShown, systemOn, isScenario } from '../core/world.js';
import { upcoming } from '../sim/plans.js';
import { lex, appRef } from '../core/lexicon.js';
import { whenText } from './plans.js';
import { thumb, chat } from '../st/bridge.js';
import { weekday } from '../sim/time.js';
import { fmtClock as hm } from '../core/fmt.js';
import { money, billsOf } from '../sim/needs.js';
import { placeOf, homeAddress } from '../sim/places.js';
import { whereNow, residents } from '../sim/people.js';
import { breakNow } from '../sim/daylife.js';
import { social, bondOf, bondLabel, isPartner, sendText, PARTNER_BOND } from '../sim/social.js';
import { planForm, calendarApp, plansBadge } from './plans.js';
import { hobbyNeed, hobbyFits, skillName } from '../sim/hobbies.js';
import { likes, traitsOf, hire, quitJob, ledger, freeSpots, moveTo, rankOf, pendingBranch, choosePath, canRefer, askReferral, referralFor, askedThisWeek, promoNeeds, promoProgress, perfOf, hourlyPay, weekText, careerOf, openJobs, offScreen, jobPlace, realDays, myJob, trackOf, needsPick, openTracks, feeOf, waitDays, pathChoices, closedText } from '../sim/work.js';
import { trackName } from '../sim/tracks.js';
import { icon } from './icons.js';
import { appsOf, featureOn } from '../sim/creator.js';
import { feed, feedPrefs, generatePosts, shouldPost, postAsMe, toggleLike, replyTo, handleOf, dating, theirProfile, candidates, swipe, waitingCount, appInterests, LOOKING } from '../sim/feed.js';
import { gendersOf } from '../sim/gender.js';
import { personaName, personaThumb, translateTo, uploadUserFile } from '../st/bridge.js';
import { pickFile } from './cropper.js';
import { openHelp } from './help.js';
import { ACT, INPUT } from './reg.js';
import { setStatus, casualsOf, attracted, relOf, YOU } from '../sim/rel.js';
import { crushOn, canAsk } from '../sim/romance.js';
import { knownHtml } from './personui.js';
import { sharedLikes } from '../sim/private.js';
// Closing slides the phone away first (the dialogue box glides back at the same time), then it is gone.
let closeTimer = 0;
export function closePhone() {
    if (!P.open || P.closing)
        return;
    const desktop = !document.getElementById('mundi-root')?.dataset.mobile && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!desktop) {
        P.open = false;
        notify();
        return;
    }
    P.closing = true;
    notify();
    clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => { P.closing = false; P.open = false; notify(); }, 260);
}
export const P = { closing: false, open: false, app: 'home', who: '', draft: '', typing: '', post: '', busy: false, matched: '', q: '' };
// Sections: several apps under one icon (on the phone and in the journal), with tabs to move between them.
const SECTIONS = [
    { id: 'profile', name: 'Profile', icon: 'user', color: '#0a66c2', apps: ['profile', 'sheet', 'goals', 'trophies', 'standing'] },
    { id: 'companions', name: 'Companions', icon: 'heart', color: '#e58a4e', apps: ['pets', 'soulbond', 'blade'] },
    { id: 'groups', name: 'Groups', icon: 'users', color: '#6b4fd8', apps: ['party', 'factions'] },
    { id: 'missions', name: 'Missions', icon: 'map', color: '#c08a2e', apps: ['quests', 'tower', 'contracts'] },
];
const LAST_TAB = {};
const sectionFor = (a) => SECTIONS.find(s => s.apps.includes(a));
// The apps of a section this world shows (the profile is always there).
const secApps = (w, s) => { const shown = new Set(appsShown(w).map(x => x.id)); return s.apps.filter(a => (a === 'profile' && !isScenario(w)) || shown.has(a)); }; // Home: no Profile app
// The device's list: each app, or its section in the place of the section's first app (the profile at the end when none shows).
// [the app it opens, name, icon, color, its key in the list]
const APPS = (w) => {
    const out = [];
    const done = new Set();
    for (const x of appsShown(w)) {
        const s = sectionFor(x.id);
        if (!s) {
            out.push([x.id, x.name, x.icon, x.color, x.id]);
            continue;
        }
        if (done.has(s.id))
            continue;
        done.add(s.id);
        const list = secApps(w, s);
        if (!list.length)
            continue;
        const open = LAST_TAB[s.id] && list.includes(LAST_TAB[s.id]) ? LAST_TAB[s.id] : list[0];
        out.push([open, s.name, s.icon, s.color, s.id]);
    }
    if (!done.has('profile') && !isScenario(w)) {
        const s = SECTIONS[0];
        out.push([LAST_TAB.profile ?? 'profile', s.name, s.icon, s.color, 'profile']);
    }
    return out;
};
// The header of an app: in a section with more than one app, the section's name and a tab for each of its apps.
function hd(app, title) {
    const g = game();
    const w = g && getWorld(g.world);
    const s = sectionFor(app);
    const name = (a) => (a === 'profile' ? T('profile') : appName(a));
    const list = s && w ? secApps(w, s) : [];
    if (!s)
        return head(title ?? name(app), 'home');
    if (list.length < 2)
        return head(esc(s.name), 'home');
    // the Goals tab carries the "pick a life goal" badge (D-7)
    const mark = (a) => (a === 'goals' && g && w && goalsBadge(g, w) ? ' <em class="mu-sec-badge">!</em>' : '');
    return head(esc(s.name), 'home').replace(/<\/div>$/, `<nav class="mu-sec-tabs">${list.map(a => `<button class="${a === app ? 'is-on' : ''}" data-act="ph-go" data-app="${esc(a)}">${name(a)}${mark(a)}</button>`).join('')}</nav></div>`);
}
const appName = (id) => { const g = game(); const w = g && getWorld(g.world); return esc(w ? appsOf(w).find(a => a.id === id)?.name ?? id : id); };
// Words that change with the world's style: the medieval journal speaks of letters, notices and the matchmaker.
let BOOK = false, BOARD = false, LETTERS = false, LW = null; // the world's device, social app and messages
const T = (key, ...a) => lex(LW, key, ...a);
const met = (g) => residents(g).filter(r => r.met);
const day = (g, at) => { const d = Math.floor(at / 1440); return d === g.day ? hm(at % 1440) : `${weekday(d).slice(0, 3)} ${hm(at % 1440)}`; };
const bar = (v) => `<span class="mu-bond"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;
// Signal bars (always full), like a real phone's status bar.
const SIGNAL = '<svg class="mu-ic" viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><rect x="3" y="15" width="3" height="5" rx="1"/><rect x="8" y="11" width="3" height="9" rx="1"/><rect x="13" y="7" width="3" height="13" rx="1"/><rect x="18" y="3" width="3" height="17" rx="1"/></svg>';
function head(title, back) {
    return `<div class="mu-ph-head">${back ? `<button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="${esc(back)}" aria-label="Back">${icon('back')}</button>` : '<span></span>'}<b>${title}</b><span></span></div>`;
}
function homeApp(g, w) {
    const unread = Object.values(social(g).unread).reduce((a, b) => a + b, 0);
    return `<div class="mu-ph-apps">${APPS(w).map(([id, name, ic, color, key]) => `<button class="mu-ph-app" data-act="ph-go" data-app="${esc(id)}">
        <i style="--c:${color}">${icon(ic)}</i><span>${esc(name)}</span>${id === 'messages' && unread ? `<em>${unread}</em>` : id === 'plans' && plansBadge(g) ? `<em>${plansBadge(g)}</em>` : id === 'homes' && billList(w).some(b => billAmount(g, w, b.id) && owed(g, b.id)) ? `<em>!</em>` : id === 'campus' && campusBadge(g, w) ? '<em>!</em>' : key === 'profile' && goalsBadge(g, w) ? '<em class="is-goals">!</em>' : ''}</button>`).join('')}
        <button class="mu-ph-app" data-act="ph-go" data-app="settings"><i style="--c:#7d8597">${icon('gear')}</i><span>Settings</span></button>
        <button class="mu-ph-app" data-act="ph-help"><i style="--c:#30b0c7">${icon('help')}</i><span>${T('help')}</span></button></div>`;
}
/* ---------- Settings: the wallpaper (a picture from the web, or one from Mundi's gallery) ---------- */
const WP = { url: '', more: false, busy: false, pick: '' };
const NICK = { who: '', text: '' };
Object.assign(ACT, {
    'ph-nick-edit': (el) => { const g = game(); const who = el.dataset.who; NICK.who = who; NICK.text = g ? nicks(g)[who] ?? g.cast[who]?.name ?? '' : ''; notify(); setTimeout(() => document.querySelector('#mundi-root [data-focus="ph-nick"]')?.select(), 30); },
    // while editing: a message can be deleted (yours or theirs), gone from the conversation for good
    'ph-msg-del': (el) => {
        const g = game();
        if (!g || !NICK.who)
            return;
        const t = social(g).threads[NICK.who];
        const i = Number(el.dataset.i);
        if (!t || !t[i])
            return;
        t.splice(i, 1);
        saveGame();
        notify();
    },
    'ph-nick-save': () => {
        const g = game();
        if (!g || !NICK.who)
            return;
        const r = g.cast[NICK.who];
        const t = NICK.text.trim();
        if (!t || t === r?.name)
            delete nicks(g)[NICK.who];
        else
            nicks(g)[NICK.who] = t;
        NICK.who = '';
        saveGame();
        notify();
    },
});
Object.assign(INPUT, { 'ph-nick': (el) => { NICK.text = el.value; } });
const wallpaper = () => String(settings().phoneBg ?? '');
const cssUrl = (u) => `url("${safeUrl(u)}")`;
// The pictures of the chat being played (Image Generation, attachments, links), newest first.
const chatPictures = () => [...new Set(chat().flatMap((m, i) => photosOf(m, i).map(p => p.url)))].reverse();
function settingsApp() {
    const cur = wallpaper();
    const pics = WP.pick === 'chat' ? chatPictures() : WP.pick === 'gallery' ? galleryPictures() : [];
    const shown = pics ? pics.slice(0, WP.more ? 240 : 36) : [];
    const empty = WP.pick === 'chat' ? 'No pictures in this chat yet (Image Generation, attachments).' : 'No pictures in the Mundi gallery yet.';
    return `${head('Settings', 'home')}<div class="mu-ph-body">
        <section class="mu-ph-wp"><h4>Wallpaper</h4>
            <div class="mu-ph-wp-now" style="${cur ? `background-image:${esc(cssUrl(cur))}` : ''}">${cur ? '' : '<small>Default</small>'}</div>
            <button class="mu-primary" data-act="wp-upload" ${WP.busy ? 'disabled' : ''}>${icon('upload')}<span>${WP.busy ? 'Uploading…' : 'Choose a picture from your computer'}</span></button>
            <button data-act="wp-pick-open">${icon('image')}<span>Choose from your pictures</span></button>
            <label class="mu-field"><span>Or a picture from the web (link)</span></label>
            <div class="mu-ph-wp-link"><input type="text" inputmode="url" data-input="wp-url" data-focus="wpurl" placeholder="https://…/picture.jpg" value="${esc(WP.url)}" aria-label="Picture link"><button data-act="wp-set-url" title="Use this link">${icon('check')}<span>Use</span></button></div>
            ${cur ? `<button class="mu-ghost" data-act="wp-reset">${icon('undo')}<span>Back to the default</span></button>` : ''}</section>
        ${WP.pick ? `<section class="mu-ph-wp-pick">
            <div class="mu-sec-tabs"><button class="${WP.pick === 'chat' ? 'is-on' : ''}" data-act="wp-src" data-v="chat">From this chat</button><button class="${WP.pick === 'gallery' ? 'is-on' : ''}" data-act="wp-src" data-v="gallery">From the Mundi gallery</button></div>
            ${pics === null ? '<p class="mu-muted"><span class="mu-spin"></span> Loading your pictures…</p>'
        : pics.length ? `<div class="mu-ph-wp-grid">${shown.map(u => `<button class="${u === cur ? 'is-on' : ''}" data-act="wp-pick" data-url="${esc(u)}" style="background-image:${esc(cssUrl(u))}" aria-label="Use this picture"></button>`).join('')}</div>
                ${pics.length > shown.length ? `<button class="mu-ghost" data-act="wp-more">Show more (${pics.length - shown.length})</button>` : ''}`
            : `<p class="mu-muted">${empty}</p>`}
        </section>` : ''}</div>`;
}
const setWallpaper = (u) => { settings().phoneBg = u; saveSettings(); notify(); };
Object.assign(ACT, {
    'wp-set-url': () => { const u = WP.url.trim(); if (!/^(https?:\/\/|\/|data:image\/)/i.test(u)) {
        toast('Paste a picture link (https://…).', 'info');
        return;
    } WP.url = ''; setWallpaper(u); toast('Wallpaper changed.', 'success'); },
    'wp-pick': (el) => { setWallpaper(el.dataset.url); toast('Wallpaper changed.', 'success'); },
    'wp-reset': () => setWallpaper(''),
    'wp-more': () => { WP.more = true; notify(); },
    'wp-pick-open': () => { WP.pick = WP.pick ? '' : 'chat'; WP.more = false; notify(); },
    'wp-src': (el) => { WP.pick = el.dataset.v; WP.more = false; notify(); },
    // a picture from your computer: saved in SillyTavern's user files, so it stays the same on every device
    'wp-upload': async () => {
        const f = await pickFile('image/*');
        if (!f)
            return;
        WP.busy = true;
        notify();
        try {
            const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
            const path = await uploadUserFile(`mundi-wallpaper-${Date.now().toString(36)}.${ext}`, f);
            setWallpaper(`/${path}`);
            toast('Wallpaper changed.', 'success');
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        WP.busy = false;
        notify();
    },
});
Object.assign(INPUT, { 'wp-url': (el) => { WP.url = el.value; } });
// A search box at the top of a list (39).
const searchBox = (ph) => `<div class="mu-ph-search">${icon('search')}<input type="search" placeholder="${ph}" value="${esc(P.q)}" data-input="ph-q" data-focus="ph-q"></div>`;
const matchQ = (g, r, texts = false) => {
    const q = P.q.trim().toLowerCase();
    if (!q)
        return true;
    return r.name.toLowerCase().includes(q) || (texts && (social(g).threads[r.avatar] ?? []).some(m => m.text.toLowerCase().includes(q)));
};
// The name you saved them under (like a phone contact): their name unless you changed it.
const nicks = (g) => (social(g).nick ??= {});
const contactName = (g, r) => nicks(g)[r.avatar] || r.name;
function messagesApp(g) {
    const s = social(g);
    const list = met(g).filter(r => matchQ(g, r, true)).sort((a, b) => (s.threads[b.avatar]?.at(-1)?.at ?? 0) - (s.threads[a.avatar]?.at(-1)?.at ?? 0));
    return `${head(appName('messages'), 'home')}${searchBox(T('searchMessages'))}<div class="mu-ph-list">${list.length ? list.map(r => {
        const last = s.threads[r.avatar]?.at(-1);
        return `<button class="mu-ph-row" data-act="ph-thread" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt="">
            <span><b data-notr>${esc(contactName(g, r))}</b><small data-notr>${last ? esc(last.text) : ''}</small></span>${s.unread[r.avatar] ? `<em>${s.unread[r.avatar]}</em>` : last ? `<small>${day(g, last.at)}</small>` : ''}</button>`;
    }).join('') : `<p class="mu-muted mu-pad">${T('noContacts')}</p>`}</div>`;
}
function threadApp(g) {
    const r = g.cast[P.who];
    if (!r)
        return messagesApp(g);
    const t = social(g).threads[r.avatar] ?? [];
    social(g).unread[r.avatar] = 0;
    return `<div class="mu-ph-head is-chat"><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="messages" aria-label="Back">${icon('back')}</button>
            ${NICK.who === r.avatar
        ? `<div class="mu-ph-nick"><input type="text" maxlength="40" data-input="ph-nick" data-focus="ph-nick" value="${esc(NICK.text)}" placeholder="${esc(r.name)}"><button class="mu-ibtn mu-primary" data-act="ph-nick-save" aria-label="Save">${icon('check')}</button></div>`
        : `<button class="mu-ph-chathead" data-act="ph-person" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt=""><span><b data-notr title="${esc(contactName(g, r))}">${esc(contactName(g, r))}</b><small>${P.typing === r.avatar ? T('typing') : bondLabel(g, r.avatar)}</small></span></button>
                <button class="mu-ibtn mu-ghost mu-ph-pen" data-act="ph-nick-edit" data-who="${esc(r.avatar)}" title="${esc(T('editThread'))}" aria-label="Edit">${icon('pen')}</button>`}</div>
        ${NICK.who === r.avatar ? `<p class="mu-ph-editnote">${icon('trash')} ${T('deleteMsgHint')}</p>` : ''}
        <div class="mu-ph-thread ${NICK.who === r.avatar ? 'is-editing' : ''}" data-keep="ph-thread" data-bottom>${t.map((m, i) => NICK.who === r.avatar
        ? `<button class="mu-ph-msg ${m.me ? 'is-me' : ''}" data-notr data-act="ph-msg-del" data-i="${esc(i)}" title="${esc(T('deleteMsg'))}">${esc(m.text)}<small>${day(g, m.at)}</small><i class="mu-ph-del">${icon('trash')}</i></button>`
        : `<div class="mu-ph-msg ${m.me ? 'is-me' : ''}" data-notr>${esc(m.text)}<small>${day(g, m.at)}</small></div>`).join('')}
            ${P.typing === r.avatar ? '<div class="mu-ph-msg is-typing"><i></i><i></i><i></i></div>' : ''}
            ${t.length ? '' : `<p class="mu-muted mu-pad">${T('emptyThread')}</p>`}</div>
        <div class="mu-ph-quick">
            <button data-act="pl-come" data-who="${esc(r.avatar)}" ${PL.busy ? 'disabled' : ''}>${icon('home')}<span>Come over</span></button>
            <button data-act="ph-person" data-who="${esc(r.avatar)}">${icon('calendar')}<span>Make plans</span></button>
            <button data-act="ph-quick" data-text="How are you doing?">${icon('chat')}<span>How are you?</span></button>
            <button data-act="ph-quick" data-text="I was thinking about you.">${icon('heart')}<span>Thinking of you</span></button>${(() => { const w = getWorld(g.world); return w ? helpBtn(g, w, r.avatar) : ""; })()}</div>
        <div class="mu-ph-compose"><input type="text" placeholder="${T('messagePlaceholder')}" value="${esc(P.draft)}" data-input="ph-draft" data-focus="ph-draft" ${P.typing ? 'disabled' : ''}>
            <button class="mu-ibtn mu-primary" data-act="ph-send" aria-label="${T('send')}" ${P.typing ? 'disabled' : ''}>${icon('send')}</button></div>`;
}
// People: your partners first, then something casual (listed apart: they aren't partners), then everyone else.
function peopleApp(g) {
    const list = met(g).filter(r => matchQ(g, r)).sort((a, b) => bondOf(g, b.avatar) - bondOf(g, a.avatar));
    const casual = new Set(casualsOf(g));
    const row = (r) => `<button class="mu-ph-row" data-act="ph-person" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt="">
        <span><b data-notr>${esc(contactName(g, r))}</b><small>${relSubtitle(g, r.avatar)}</small>${relBar(r.avatar)}</span>${isPartner(g, r.avatar) ? `<i class="mu-ph-heart">${icon('heart')}</i>` : ''}</button>`;
    const groups = [['', list.filter(r => isPartner(g, r.avatar))], ['Casual', list.filter(r => casual.has(r.avatar))], ['', list.filter(r => !isPartner(g, r.avatar) && !casual.has(r.avatar))]];
    return `${head(appName('people'), 'home')}${searchBox('Search people')}<div class="mu-ph-list">${list.length ? groups.filter(([, rs]) => rs.length).map(([h, rs]) => `${h ? `<h5 class="mu-ph-group">${h}</h5>` : ''}${rs.map(row).join('')}`).join('')
        : `<p class="mu-muted mu-pad">${T('noneMet')}</p>`}</div>`;
}
// A sure yes by phone: very close friends who also have a crush on you (being a couple needs both).
const quickCouple = (g, a) => bondOf(g, a) >= PARTNER_BOND && crushOn(g, a) && canAsk(g, a, 'date') && attracted(g, a, YOU); // a sure yes: never against attraction
function personApp(g, w) {
    const r = g.cast[P.who];
    if (!r)
        return peopleApp(g);
    const partner = isPartner(g, r.avatar);
    return `${head(esc(contactName(g, r)), 'people')}<div class="mu-ph-body">
        <div class="mu-ph-profile"><img src="${esc(thumb(r.avatar))}" alt=""><b data-notr>${esc(r.name)}</b>${nicks(g)[r.avatar] ? `<small data-notr>${esc(T('inYourDevice', nicks(g)[r.avatar]))}</small>` : ''}<small>${relSubtitle(g, r.avatar)}</small>${relBar(r.avatar)}<small>${approvalWord(approvalOf(g, r.avatar))}</small>${feelingsHtml(g, r.avatar)}</div>
        ${knownHtml(g, w, r.avatar)}
        <button data-act="ph-thread" data-who="${esc(r.avatar)}">${icon(LETTERS ? 'send' : 'chat')}<span>${T('writeMessage')}</span></button>
        ${featureOn(w, 'plans') ? planForm(g, w, r.avatar) : ''}
        ${partner ? '<p class="mu-ph-love">You are together.</p>' : quickCouple(g, P.who) ? '<button data-act="ph-partner">Ask to be together</button>' : ''}
        ${referBtn(g, w, r.avatar)}
        ${apprenticeBtn(g, w, r.avatar)}
        <p class="mu-muted">Now: ${esc(placeOf(g, w, whereNow(g, w, r))?.name ?? '')}${breakNow(g, w, r) && whereNow(g, w, r) === breakNow(g, w, r).place ? ` · <i>${esc(breakNow(g, w, r).why.replace(/^is /, ''))}</i>` : ''}</p>
    </div>`;
}
// Someone high up at their job can recommend you there.
function referBtn(g, w, avatar) {
    const o = canRefer(g, w, avatar);
    if (!o)
        return '';
    if (referralFor(g, o.id) === avatar)
        return `<p class="mu-muted">${esc(g.cast[avatar].name)} will vouch for you at ${esc(o.name)}.</p>`;
    return `<button data-act="ph-refer" data-who="${esc(avatar)}" ${askedThisWeek(g, avatar) ? 'aria-disabled="true" title="Once a week"' : ''}>${icon('briefcase')}<span>Ask for a good word at ${esc(o.name)}</span></button>`;
}
// The paths of a career you chose, in words.
const pathNames = (o, path) => path.map(id => (o.branches ?? []).flatMap(b => b.options).find(x => x.id === id)?.name ?? id).join(' › ');
// At a branch: the paths you can take next (each with its ranks and pay); one that isn't open to you shows why.
function branchPicker(g, w, o) {
    const b = pendingBranch(g, o);
    if (!b)
        return '';
    return `<div class="mu-branch"><b>${T('choosePathTitle')}</b><small class="mu-muted">The next ranks depend on it; it cannot be changed later.</small>
        ${pathChoices(g, w, b).map(({ opt: x, open }) => `<button class="mu-branch-opt" data-act="ph-path" data-id="${esc(x.id)}" ${open ? '' : 'aria-disabled="true"'}><b>${esc(x.name)}</b>${x.desc ? `<small>${esc(x.desc)}</small>` : ''}
            <small class="mu-muted">${x.ranks.map(r => `${esc(r.name)} (${money(w, r.pay)}/h)`).join(' › ')}</small>${x.likes?.length ? `<small>Good for: ${esc(x.likes.join(', '))}</small>` : ''}${open ? '' : `<small class="mu-bad">${esc(closedText(x))}</small>`}</button>`).join('')}</div>`;
}
// What helps an interview: your best skill for the job (about +1 for every two levels) and the traits it likes (+2 each).
function interviewHelp(g, w, o) {
    const s = interviewSkill(g, o), liked = (o.likes ?? []).filter(t => traitsOf(g).includes(t));
    return `${s ? `<small class="mu-good">Your ${esc(skillName(w, s.id))} (level ${s.level}) helps: +${s.bonus}</small>` : ''}${liked.length ? `<small class="mu-good">Your traits help: ${esc(liked.join(', '))}</small>` : ''}`;
}
// Jobs: how the openings are sorted ('' as the world lists them). Kept while the game runs, like the Homes app's city.
const JF = { sort: '' };
const JOB_SORTS = [['', 'Listed'], ['pay', 'Pay'], ['chance', 'Interview chance'], ['place', 'Where'], ['days', 'Days a week']];
// The openings in the order picked: the best starting pay first (then the best top pay), the best interview chance
// first (a job asking for a course you haven't got last), by district and then place (off-screen jobs last), or the
// fewest days a week first (then the best pay). Ties keep the world's order.
function sortedOpenings(g, w, list) {
    if (!JF.sort)
        return list;
    const on = (job) => trackOf(g, job);
    const pay = (o) => payOf(g, o.ranks[0]?.pay ?? 0), top = (o) => payOf(g, o.ranks.at(-1)?.pay ?? 0);
    const chance = (o) => (missingCourses(g, w, o).length ? -1 : interviewChance(g, o, traitsOf(g)));
    const where = (o) => { if (offScreen(w, o))
        return '\uffff'; const p = placeOf(g, w, o.place); return `${w.maps?.find(m => m.id === p?.map)?.name ?? ''}\u0000${p?.name ?? ''}`; };
    const by = {
        pay: (a, b) => pay(b) - pay(a) || top(b) - top(a),
        chance: (a, b) => chance(b) - chance(a),
        place: (a, b) => where(a).localeCompare(where(b)),
        days: (a, b) => realDays(a, a.ranks[0]) - realDays(b, b.ranks[0]) || pay(b) - pay(a),
    };
    const cmp = by[JF.sort];
    if (!cmp)
        return list;
    return list.map(job => ({ job, o: on(job) })).sort((x, y) => cmp(x.o, y.o)).map(x => x.job);
}
const jobSortChips = () => `<div class="mu-chips mu-jobs-sort"><small class="mu-muted">Sort by</small>${JOB_SORTS.map(([id, name]) => `<button class="mu-chip ${JF.sort === id ? 'is-on' : ''}" data-act="ph-jobs-sort" data-id="${esc(id)}">${esc(name)}</button>`).join('')}</div>`;
function jobsApp(g, w) {
    const j = g.player.job;
    const mine = myJob(g, w); // the job you hold, on your track
    const p = mine && j ? promoNeeds(g, w, mine) : null;
    const where = (o) => (offScreen(w, o) ? 'off-screen' : placeOf(g, w, mine && o.id === mine.id ? jobPlace(g, o) : o.place)?.name ?? '');
    const sched = systemOn(w, 'jobs');
    // (job tracks) the track you work it on, and the days still to wait before the first shift
    const track = mine?.track !== undefined ? mine.trackName ?? trackName(w, mine, mine.track) : '';
    const wait = j && j.start > g.day ? j.start - g.day : 0;
    return `${head(appName('jobs'), 'home')}<div class="mu-ph-body">
        ${mine && j ? `<section class="mu-ph-card"><h4>${T('yourJob')}</h4><b>${esc(rankOf(g, mine).name)}</b><small>${esc(mine.name)}${track ? ` · ${esc(track)}` : ''} · ${esc(where(mine))}${(j.path ?? []).length ? ` · ${esc(pathNames(mine, j.path))}` : ''}</small>
            <small>${money(w, payOf(g, hourlyPay(g, w, mine)))}/h · ${mine.shift} h shifts · ${esc(weekText(g, w, mine))} · rank ${j.rank + 1} of ${careerOf(g, mine).ranks.length + (careerOf(g, mine).open ? 1 : 0)}</small>
            ${wait ? `<small class="mu-good">Your first shift is in ${wait} ${wait === 1 ? 'day' : 'days'}.</small>` : ''}
            ${sched ? `<small>Performance: ${perfOf(g)} (${perfWord(perfOf(g))})</small>${bar(perfOf(g))}` : ''}
            ${p ? `<small>Next rank: ${esc(p.rank.name)}</small>${bar(promoProgress(p))}${p.missing.length ? `<small class="mu-muted">Still needs: ${p.missing.map(m => `<span>${esc(m)}</span>`).join(', ')}</small>` : ''}` : pendingBranch(g, mine) ? '' : '<small>Top rank.</small>'}
            ${branchPicker(g, w, mine)}
            ${jobCourseHtml(g, w, mine.id)}
            ${likes(g, mine).length ? `<small>Your traits help: ${esc(likes(g, mine).join(', '))}</small>` : ''}
            <button class="mu-danger" data-act="ph-quit">Quit</button></section>
            ${workWeekHtml(g, w)}` : `<p class="mu-muted">${T('noJob')}</p>`}
        <h4>${T('openings')}</h4>
        ${openJobs(g, w).filter(o => o.id !== j?.id).length > 1 ? jobSortChips() : ''}
        ${sortedOpenings(g, w, openJobs(g, w).filter(o => o.id !== j?.id)).map(job => {
        const o = trackOf(g, job), picks = needsPick(g, job) ? openTracks(g, w, job) : [], fee = feeOf(g, w, job), days = waitDays(g, job);
        return `<div class="mu-ph-job"><span><b>${esc(o.name)}</b><small>${esc(where(o))} · ${money(w, payOf(g, o.ranks[0].pay))}–${money(w, payOf(g, o.ranks.at(-1).pay))}/h${sched ? ` · ${realDays(o, o.ranks[0])} days a week` : ''}</small>
            ${picks.length > 1 ? `<small>${esc(picks.length === 2 ? 'Two tracks' : `${picks.length} tracks`)}: ${esc(picks.map(t => trackName(w, job, t)).join(' or '))} (you choose when hired)</small>` : o.track !== undefined && o.trackName ? `<small>Your track: ${esc(o.trackName)}</small>` : ''}
            ${fee ? `<small>A fee of ${money(w, fee)} when you start</small>` : ''}${days ? `<small>First shift ${days} ${days === 1 ? 'day' : 'days'} after signing</small>` : ''}
            ${missingCourses(g, w, o).length ? `<small class="mu-bad">${T('needsCourse')}: ${esc(missingCourses(g, w, o).join(', '))}</small>` : (o.courses ?? []).length ? `<small class="mu-good">${o.courses.some(id => isTaking(g, id)) ? 'You can start while you study for it' : T('courseDone')}</small>` : ''}
            ${o.needs?.length ? `<small class="${o.needs.some(t => traitsOf(g).includes(t)) ? 'mu-good' : ''}">Looks for: ${esc(o.needs.join(' / '))}${o.needs.some(t => traitsOf(g).includes(t)) ? ' ✓' : ''}</small>` : ''}
            ${hobbyNeed(g, w, o) ? `<small class="${hobbyFits(g, w, o) ? 'mu-good' : 'mu-bad'}">Needs: ${esc(hobbyNeed(g, w, o))}${hobbyFits(g, w, o) ? ' ✓' : ''}</small>` : ''}
            ${missingCourses(g, w, o).length ? '' : `${interviewHelp(g, w, o)}${interviewChance(g, o, traitsOf(g)) ? `<small>Interview: ${interviewChance(g, o, traitsOf(g))}% chance${triedToday(g, o.id, o, traitsOf(g)) ? ` · try again ${retryText(g, o.id, o, traitsOf(g))}` : ''}</small>` : '<small class="mu-bad">Interview: out of your reach for now</small>'}`}</span>
            <button data-act="ph-apply" data-id="${esc(o.id)}" ${missingCourses(g, w, o).length || triedToday(g, o.id, o, traitsOf(g)) || !interviewChance(g, o, traitsOf(g)) ? 'aria-disabled="true"' : ''}>${T('jobApply')}</button></div>`;
    }).join('')}
    </div>`;
}
function bankApp(g, w) {
    const zone = w.homes.zones.find(z => z.id === g.player.home.zone);
    return `${head(appName('bank'), 'home')}<div class="mu-ph-body">
        <section class="mu-ph-card mu-ph-balance"><small>${T('balance')}</small><b>${money(w, g.player.money)}</b></section>
        ${zone?.rent && billList(w).length ? `<p>${esc(T('billsLine', billList(w).filter(b => billAmount(g, w, b.id)).map(b => `${billName(w, b.id)} ${money(w, billAmount(g, w, b.id))}`).join(' · '), appRef(w, 'homes')))}${billList(w).some(b => owed(g, b.id)) ? ' <b class="mu-bad">(due now)</b>' : ''}</p>` : ''}
        <h4>${T('statement')}</h4>
        <div class="mu-ph-ledger">${ledger(g).map(e => `<div><span>${esc(e.text)}<small>${day(g, e.at)}</small></span><b class="${e.amount < 0 ? 'mu-bad' : 'mu-good'}">${e.amount < 0 ? '−' : '+'}${money(w, Math.abs(e.amount))}</b></div>`).join('') || `<p class="mu-muted">${T('noMovements')}</p>`}</div>
    </div>`;
}
const HF = { city: '' }; // Homes: the city whose homes are shown ('' all)
function homesApp(g, w) {
    const pic = (kind) => { const im = w.homes.kinds[kind]?.image; return im ? `style="background-image:url('${safeUrl(worldFile(w, im))}')"` : ''; };
    const mine = w.homes.zones.find(z => z.id === g.player.home.zone);
    const billBtn = (b) => {
        const amount = billAmount(g, w, b.id);
        if (!amount)
            return '';
        const n = owed(g, b.id), cut = isCut(g, b.id), left = daysLeft(g, b.id), paid = paidToward(g, b.id), plan = payPlan(g, w, b.id), toCut = daysToCut(g, b.id);
        const state = cut ? (b.id === 'rent' ? T('lockedOutShort') : T('cutOff')) : n ? 'Due now' : left <= 1 ? 'Due tomorrow' : `Paid · due in ${left} days`;
        // when it's cut off, what's paid of it already, and what the button pays when it isn't everything
        const soon = n && !cut ? (toCut <= 1 ? (b.id === 'rent' ? 'Locked out tomorrow' : 'Cut off tomorrow') : b.id === 'rent' ? `Locked out in ${toCut} days` : `Cut off in ${toCut} days`) : '';
        const how = plan.how === 'back' ? (b.id === 'rent' ? `${money(w, plan.amount)} gets you back in` : `${money(w, plan.amount)} gets it back`)
            : plan.how === 'part' ? `Pay ${money(w, plan.amount)} toward it` : n && plan.how === 'none' ? 'Not enough money' : '';
        return `<button class="mu-bill ${n ? 'is-due' : 'is-paid'} ${cut ? 'is-cut' : ''}" data-act="ph-bill" data-id="${esc(b.id)}" ${n ? '' : 'aria-disabled="true"'} title="${n ? (plan.how === 'none' ? 'Not enough money' : `Pay ${money(w, plan.amount)}`) : 'Paid'}">
            <i>${icon(b.icon)}</i><b>${esc(billName(w, b.id))}</b><span>${money(w, n ? owedAmount(g, w, b.id) : amount)}${n > 1 ? ` (${n} wk)` : ''}</span><small>${state}</small>
            ${soon ? `<small>${soon}</small>` : ''}${paid ? `<small>${money(w, paid)} paid so far</small>` : ''}${how ? `<small><strong>${how}</strong></small>` : ''}</button>`;
    };
    // locked out: the cheapest home you could move to instead, when it costs less than getting back in
    const cheaper = isCut(g, 'rent') && billAmount(g, w, 'rent') ? cheapestHome(g, w, z => freeSpots(g, w, z).length) : null;
    return `${head(appName('homes'), 'home')}<div class="mu-ph-body mu-homes">
        <section><h4>${T('myHome')}</h4>
        <article class="mu-home-card is-mine"><span class="mu-home-pic" ${pic(g.player.home.kind ?? mine?.kind ?? '')}></span>
            <div class="mu-home-info"><span><b>${esc(homeAddress(w, g.player.home))}</b><small>${esc(w.homes.kinds[g.player.home.kind ?? mine?.kind ?? '']?.name ?? '')} · ${T('yourHome')}</small></span></div></article>
        ${billList(w).length ? `<div class="mu-bills">${billList(w).map(billBtn).join('')}</div>
        ${cheaper && cheaper.rent < toGetBackIn(g, w, 'rent') ? `<p class="mu-bad">${esc(`Or move somewhere cheaper: ${cheaper.name}, ${money(w, cheaper.rent)} a week, paid one week in advance.`)}</p>` : ''}
        <small class="mu-muted">${T('billsNote')}</small>` : ''}
        ${billList(w).filter(b => billAmount(g, w, b.id) && owed(g, b.id)).length > 1 ? `<button class="mu-primary" data-act="ph-bill-all">${icon('wallet')}<span>Pay everything</span></button>` : ''}
        </section>
        <section><h4>${T('homesForRent')}</h4>
        ${(() => {
        const cities = [...new Set(w.homes.zones.filter(z => z.id !== g.player.home.zone).map(z => z.map))].map(id => w.maps.find(m => m.id === id)).filter(Boolean);
        if (cities.length < 2)
            return '';
        if (HF.city && !cities.some(c => c.id === HF.city))
            HF.city = '';
        return `<div class="mu-chips mu-homes-cities"><button class="mu-chip ${HF.city ? '' : 'is-on'}" data-act="ph-homes-city" data-id="">All</button>${cities.map(c => `<button class="mu-chip ${HF.city === c.id ? 'is-on' : ''}" data-act="ph-homes-city" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>`;
    })()}
        ${w.homes.zones.filter(z => z.id !== g.player.home.zone && (!HF.city || z.map === HF.city)).map(z => {
        const free = freeSpots(g, w, z.id).length, student = studentLink.homeBlock(g, w, z.id); // (a student: student homes only)
        const rent = priceOf(g, z.rent), bills = priceOf(g, billsOf(w, z.kind));
        return `<article class="mu-home-card"><span class="mu-home-pic" ${pic(z.kind)}></span>
                <div class="mu-home-info"><span><b>${esc(z.name)}</b><small>${esc(w.homes.kinds[z.kind]?.name ?? z.kind)} · ${money(w, rent)}/wk${bills ? ` + ${money(w, bills)} bills` : ''} · ${free} free</small></span>
                <button class="mu-home-move" data-act="ph-move" data-id="${esc(z.id)}" ${free && g.player.money >= rent && !student ? '' : 'aria-disabled="true"'} ${student ? 'title="Not while you study for a degree"' : ''}>Move</button></div></article>`;
    }).join('')}
        ${w.homes.zones.some(z => studentLink.homeBlock(g, w, z.id)) ? `<p class="mu-bad">${esc(w.homes.zones.map(z => studentLink.homeBlock(g, w, z.id)).find(Boolean))}</p>` : ''}
        <p class="mu-muted">${T('movingNote')}</p></section>
    </div>`;
}
Object.assign(ACT, {
    'ph-refer': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w)
        return; const r = askReferral(g, w, el.dataset.who); if (r.text)
        toast(r.text, r.ok ? 'success' : 'info'); saveGame(); notify(); },
    'ph-path': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w)
        return; const m = choosePath(g, w, el.dataset.id); if (m)
        toast(m, 'success'); saveGame(); notify(); },
    'ph-bill': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w)
        return; const before = g.player.money; const msg = payBill(g, w, el.dataset.id); if (g.player.money < before) {
        toast(msg || 'Paid.', 'success');
        saveGame();
    }
    else
        toast(msg, 'warn'); notify(); },
    // the rent first, then the other bills, each as far as the money goes (part payments included)
    'ph-bill-all': () => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const start = g.player.money;
        let said = '', failed = '';
        for (const b of billList(w))
            if (owed(g, b.id)) {
                const before = g.player.money, m = payBill(g, w, b.id);
                if (g.player.money < before)
                    said ||= m;
                else
                    failed ||= m;
            }
        if (g.player.money < start) {
            if (said)
                toast(said, 'success');
            saveGame();
        }
        else if (failed)
            toast(failed, 'warn');
        notify();
    },
    'ph-homes-city': (el) => { HF.city = el.dataset.id ?? ''; notify(); },
    'ph-jobs-sort': (el) => { JF.sort = el.dataset.id ?? ''; notify(); },
    'ph-open-homes': () => { P.open = true; P.app = 'homes'; notify(); },
    'ph-open-campus': () => { P.open = true; P.app = 'campus'; notify(); },
});
/* ---------- Chirp: short posts, like Twitter/X ---------- */
const who = (g, by) => by === 'me' ? { name: personaName(), img: personaThumb() } : { name: g.cast[by]?.name ?? '?', img: thumb(by) };
function postHtml(g, p, full = false) {
    const a = who(g, p.by);
    return `<article class="mu-ch-post" ${full ? '' : `data-act="ph-post" data-id="${esc(p.id)}"`}>
        <img src="${esc(a.img)}" alt="">
        <div><header><b data-notr>${esc(a.name)}</b><small data-notr>${esc(handleOf(g, p.by))} · ${day(g, p.at)}</small></header>
            <p data-notr>${esc(p.text)}</p>${p.image ? `<img class="mu-ch-img" src="${esc(p.image)}" alt="">` : ''}
            <footer><span>${icon('chat')}${p.replies.length}</span><span>${icon('repost')}${p.reposts}</span>
                <button class="mu-ch-like ${p.liked ? 'is-on' : ''}" data-act="ph-like" data-id="${esc(p.id)}" aria-label="Like">${icon(p.liked ? 'heart' : 'heartLine')}${p.likes}</button></footer>
        </div></article>`;
}
// The medieval notice board: notices pinned by people; answering one means writing its author a letter.
function noteHtml(g, p) {
    const a = who(g, p.by);
    return `<article class="mu-bd-note"><header><img src="${esc(a.img)}" alt=""><b data-notr>${esc(a.name)}</b><small>${day(g, p.at)}</small></header>
        <p data-notr>${esc(p.text)}</p>${p.image ? `<img class="mu-ch-img" src="${esc(p.image)}" alt="">` : ''}
        ${p.by !== 'me' && g.cast[p.by] ? `<button class="mu-bd-write" data-act="ph-thread" data-who="${esc(p.by)}">${icon('send')}<span>Write to them</span></button>` : p.by === 'me' ? '<small class="mu-bd-mine">Your notice</small>' : ''}</article>`;
}
function boardApp(g) {
    const f = feed(g);
    return `${head(appName('social'), 'home')}
        <div class="mu-ph-compose is-top"><input type="text" placeholder="Pin a notice on the board…" value="${esc(P.draft)}" data-input="ph-draft" data-focus="ph-draft" ${P.busy ? 'disabled' : ''}>
            <button class="mu-ibtn mu-primary" data-act="ph-chirp" aria-label="Pin it" title="Pin it" ${P.busy ? 'disabled' : ''}>${icon('pin')}</button></div>
        ${feedPrefs().mode !== 'react' ? `<button class="mu-ghost mu-ch-refresh" data-act="ph-refresh" ${P.busy ? 'disabled' : ''}>${icon('redo')}<span>${P.busy ? 'Reading the board…' : 'Look for new notices'}</span></button>` : ''}
        <div class="mu-bd-board">${f.posts.length ? f.posts.map(p => noteHtml(g, p)).join('') : `<p class="mu-muted mu-pad">${P.busy ? 'Reading the board…' : feedPrefs().mode === 'react' ? 'The board is empty. Pin a notice and people will answer.' : 'The board is empty. Tap "Look for new notices" to see what people pinned.'}</p>`}</div>`;
}
function socialApp(g) {
    if (BOARD)
        return boardApp(g);
    const f = feed(g);
    return `${head(appName('social'), 'home')}
        <div class="mu-ph-compose is-top"><input type="text" placeholder="What's happening?" value="${esc(P.draft)}" data-input="ph-draft" data-focus="ph-draft" ${P.busy ? 'disabled' : ''}>
            <button class="mu-ibtn mu-primary" data-act="ph-chirp" aria-label="Post" ${P.busy ? 'disabled' : ''}>${icon('send')}</button></div>
        ${feedPrefs().mode !== 'react' ? `<button class="mu-ghost mu-ch-refresh" data-act="ph-refresh" ${P.busy ? 'disabled' : ''}>${icon('redo')}<span>${P.busy ? 'Loading…' : 'New posts'}</span></button>` : ''}
        <div class="mu-ch-feed">${f.posts.length ? f.posts.map(p => postHtml(g, p)).join('') : `<p class="mu-muted mu-pad">${P.busy ? 'Loading…' : feedPrefs().mode === 'react' ? 'Nothing here yet. Post something and people will reply.' : 'Nothing here yet. Tap "New posts" to see what people are saying.'}</p>`}</div>`;
}
function postApp(g) {
    const p = feed(g).posts.find(x => x.id === P.post);
    if (!p)
        return socialApp(g);
    return `${head('Post', 'social')}<div class="mu-ch-feed">${postHtml(g, p, true)}
        ${p.replies.map(r => { const a = who(g, r.by); return `<div class="mu-ch-reply"><img src="${esc(a.img)}" alt=""><div><b data-notr>${esc(a.name)}</b> <small data-notr>${esc(handleOf(g, r.by))}</small><p data-notr>${esc(r.text)}</p></div></div>`; }).join('')}
        ${P.busy ? '<p class="mu-muted mu-pad">…</p>' : ''}</div>
        <div class="mu-ph-compose"><input type="text" placeholder="Reply" value="${esc(P.draft)}" data-input="ph-draft" data-focus="ph-draft" ${P.busy ? 'disabled' : ''}>
            <button class="mu-ibtn mu-primary" data-act="ph-reply" aria-label="Reply" ${P.busy ? 'disabled' : ''}>${icon('send')}</button></div>`;
}
/* ---------- Spark: the dating app ---------- */
function chips(list, on, act) {
    return `<div class="mu-chips">${list.map(x => `<button class="mu-chip ${on.includes(x) ? 'is-on' : ''}" data-act="${esc(act)}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
}
// The genders whose profiles Spark shows: your pick, else the ones you're drawn to (what it showed before there was a pick).
const shownGenders = (g, w) => dating(g).profile.show ?? gendersOf(w).filter(x => (relOf(g).people[YOU]?.att?.[x.id]?.r ?? 1) > 0).map(x => x.id);
function showChips(g, w) {
    const on = shownGenders(g, w);
    return `<div class="mu-chips">${gendersOf(w).map(x => `<button class="mu-chip ${on.includes(x.id) ? 'is-on' : ''}" data-act="sp-show" data-v="${esc(x.id)}">${esc(x.plural ? x.plural.charAt(0).toUpperCase() + x.plural.slice(1) : x.name)}</button>`).join('')}</div>`;
}
function datingProfileApp(g, w) {
    const d = dating(g);
    const interests = appInterests(g, w);
    return `${head(T('yourProfile'), d.profile.ready ? 'dating' : 'home')}<div class="mu-ph-body">
        <div class="mu-ph-profile"><img src="${esc(personaThumb())}" alt=""><b data-notr>${esc(personaName())}</b><small>${g.player.traits ? '' : ''}</small></div>
        <label class="mu-field"><span>${T('profileAbout')}</span><textarea rows="3" data-input="sp-bio" data-focus="sp-bio" placeholder="A line or two about you">${esc(d.profile.bio)}</textarea></label>
        <section><h4>Who you want to see</h4>${showChips(g, w)}</section>
        <section><h4>Looking for</h4>${chips(LOOKING, d.profile.looking, 'sp-look')}</section>
        <section><h4>Interests</h4>${chips(interests, d.profile.interests, 'sp-int')}</section>
        <button class="mu-primary" data-act="sp-save" ${d.profile.looking.length ? '' : 'aria-disabled="true"'}>${d.profile.ready ? 'Save' : T('profileStart')}</button>
    </div>`;
}
function datingApp(g, w) {
    const d = dating(g);
    if (!d.profile.ready)
        return datingProfileApp(g, w);
    if (P.matched) {
        const r = g.cast[P.matched];
        return `${head(appName('dating'), 'home')}<div class="mu-sp-match"><h2>${T('matchTitle')}</h2>
            <div class="mu-sp-pair"><img src="${esc(personaThumb())}" alt=""><img src="${esc(thumb(P.matched))}" alt=""></div>
            <p>${esc(T('matchLine', r?.name ?? ''))}</p>
            <button class="mu-primary" data-act="ph-thread" data-who="${esc(P.matched)}">${icon(LETTERS ? 'send' : 'chat')}<span>${T('sendMessage')}</span></button>
            <button data-act="sp-next">${T('nextSuitor')}</button></div>`;
    }
    const list = candidates(g, w);
    const r = list[0];
    const top = `<div class="mu-ph-head"><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="home" aria-label="Back">${icon('back')}</button><b>${appName('dating')}</b>
        <span class="mu-row"><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="matches" aria-label="${T('matches')}" title="${T('matches')}">${icon('chat')}</button><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="dprofile" aria-label="${T('yourProfile')}" title="${T('yourProfile')}">${icon('user')}</button></span></div>`;
    if (!r)
        return `${top}<p class="mu-muted mu-pad">${T('noCandidates')}</p>`;
    const p = theirProfile(g, w, r), interests = p.interests;
    const shared = interests.filter(i => d.profile.interests.includes(i)), both = sharedLikes(g, r.avatar).slice(0, 2); // (adult) likes in bed you share
    return `${top}<div class="mu-sp-card"><img src="${esc(thumb(r.avatar))}" alt="">
            <div class="mu-sp-info"><h3 data-notr>${esc(r.name)}</h3><small>${esc(p.looking)}</small>
                <p data-notr>${esc(p.bio)}</p>
                <div class="mu-chips">${interests.map(i => `<span class="mu-chip ${shared.includes(i) ? 'is-on' : ''}">${esc(i)}</span>`).join('')}</div>
                ${both.length ? `<small class="mu-sp-both">${icon('flame')}<span>In bed, you both like:</span> <span data-notr>${esc(both.join(', '))}</span></small>` : ''}</div></div>
        <div class="mu-sp-btns"><button class="mu-sp-no" data-act="sp-swipe" data-who="${esc(r.avatar)}" data-like="0" aria-label="${T('pass')}" title="${T('pass')}">${icon('x')}</button>
            <button class="mu-sp-yes" data-act="sp-swipe" data-who="${esc(r.avatar)}" data-like="1" aria-label="${T('like')}" title="${T('like')}">${icon('heart')}</button></div>`;
}
function matchesApp(g) {
    const d = dating(g);
    const n = waitingCount(g);
    return `${head(T('matches'), 'dating')}${n ? `<p class="mu-muted mu-pad">${esc(n === 1 ? 'One like is waiting for an answer.' : `${n} likes are waiting for an answer.`)}</p>` : ''}<div class="mu-ph-list">${d.matches.length ? d.matches.map(a => `<button class="mu-ph-row" data-act="ph-thread" data-who="${esc(a)}"><img src="${esc(thumb(a))}" alt=""><span><b data-notr>${esc(g.cast[a]?.name ?? '')}</b><small>${bondLabel(g, a)}</small></span></button>`).join('') : `<p class="mu-muted mu-pad">${T('noMatches')}</p>`}</div>`;
}
async function refreshFeed(g, w, force = false) {
    if (P.busy || (!force && !shouldPost(g, 'open')))
        return;
    P.busy = true;
    notify();
    try {
        await generatePosts(g, w);
    }
    catch (e) {
        toast(String(e?.message ?? e), 'error');
    }
    P.busy = false;
    saveGame();
    notify();
}
// The clock calls this: in "characters post on their own" mode, new posts every few game hours.
let autoBusy = false;
export function feedTick() {
    const g = game();
    const w = g && getWorld(g.world);
    if (!g || !w || autoBusy || !w.features?.phone || !systemOn(w, 'social') || !shouldPost(g, 'auto'))
        return;
    autoBusy = true;
    generatePosts(g, w, 2).then(n => { if (n) {
        saveGame();
        notify();
    } }).catch(() => { }).finally(() => { autoBusy = false; });
}
export function phoneHtml() {
    const g = game();
    const w = g && getWorld(g.world);
    if (!P.open || !g || !w) {
        turn.opened = 0;
        return '';
    }
    BOOK = deviceLook(w) === 'book';
    BOARD = socialKind(w) === 'board';
    LETTERS = messageKind(w) === 'letters';
    LW = w;
    const body = P.app === 'messages' ? messagesApp(g) : P.app === 'thread' ? threadApp(g) : P.app === 'people' ? peopleApp(g) : P.app === 'person' ? personApp(g, w)
        : P.app === 'jobs' ? jobsApp(g, w) : P.app === 'bank' ? bankApp(g, w) : P.app === 'homes' ? homesApp(g, w)
            : P.app === 'social' ? socialApp(g) : P.app === 'post' ? postApp(g) : P.app === 'dating' ? datingApp(g, w) : P.app === 'dprofile' ? datingProfileApp(g, w) : P.app === 'matches' ? matchesApp(g) : P.app === 'plans' ? calendarApp(g, w, head(appName('plans'), 'home')) : P.app === 'journal' ? journalApp(g, w, head(appName('journal'), 'home')) : P.app === 'shop' ? shopApp(g, w, head(appName('shop'), 'home')) : P.app === 'goals' ? goalsApp(g, w, hd('goals')) : P.app === 'campus' ? campusApp(g, w, head(appName('campus'), 'home')) : P.app === 'sheet' ? sheetApp(g, w, hd('sheet')) : P.app === 'quests' ? questsApp(g, w, hd('quests')) : P.app === 'grimoire' ? grimoireApp(g, w, head(appName('grimoire'), 'home')) : P.app === 'party' ? partyApp(g, w, hd('party')) : P.app === 'standing' ? standingApp(g, w, hd('standing')) : P.app === 'pets' ? petsApp(g, w, hd('pets')) : P.app === 'factions' ? factionsApp(g, w, hd('factions')) : P.app === 'assets' ? holdingsApp(g, w, head(appName('assets'), 'home')) : P.app === 'tower' ? towerApp(g, w, hd('tower')) : P.app === 'contracts' ? contractsApp(g, w, hd('contracts')) : P.app === 'workshop' ? workshopApp(g, w, head(appName('workshop'), 'home')) : P.app === 'trophies' ? trophiesApp(g, w, hd('trophies')) : P.app === 'blade' ? bladeApp(g, w, hd('blade')) : P.app === 'soulbond' ? soulApp(g, w, hd('soulbond')) : P.app === 'health' ? healthApp(g, w, head(appName('health'), 'home')) : P.app === 'settings' ? settingsApp() : P.app === 'profile' ? profileApp(g, w, hd('profile', T('profile'))) : BOOK ? bookFront(g, w) : homeApp(g, w);
    if (BOOK)
        return bookHtml(g, w, body);
    const unread = phoneUnread();
    // data-keep: the phone keeps its identity when the screen is redrawn (a dialog opening right before it is never
    // taken for it, which rebuilt the phone and replayed its slide-in)
    return `<div class="mu-phone ${P.closing ? 'is-closing' : ''}" data-keep="phone" role="dialog" aria-label="Phone"><div class="mu-ph-status">
            <span class="mu-ph-left"><b>${hm(g.minutes)}</b>${unread ? `<i class="mu-ph-notif" title="${unread}">${icon('chat')}</i>` : ''}</span>
            <span class="mu-ph-right">${SIGNAL}${icon('wifi')}<span class="mu-ph-batt"><small>100%</small><i><b></b></i></span></span></div>
        <div class="mu-ph-screen ${wallpaper() ? 'has-bg' : ''}" data-keep="ph-screen" style="${wallpaper() ? `--ph-bg:${esc(cssUrl(wallpaper()))}` : ''}">${body}</div>
        <button class="mu-ph-close" data-act="ph-close" aria-label="${esc(T('closeDevice'))}"></button></div>`;
}
/* ---------- the medieval journal: an open book, contents on the left, the chosen section on the right ---------- */
const RIBBONS = [10, 20, 30, 40, 50, 60, 70, 80]; // cloth bookmarks along the right edge (top of each, in % of the book's height)
const TURN_MS = 650;
const turn = { app: '', at: 0, back: false, opened: 0 };
const OPEN_MS = 350;
// Which section a view belongs to, so moving inside one (a thread inside Letters) does not turn the page.
const sectionOf = (a) => (a === 'thread' ? 'messages' : a === 'person' ? 'people' : a === 'post' ? 'social' : a === 'dprofile' || a === 'matches' ? 'dating' : sectionFor(a)?.id ?? a);
function bookHtml(g, w, body) {
    const apps = APPS(w);
    const sec = sectionOf(P.app);
    const order = (id) => (id === 'home' ? -1 : apps.findIndex(a => a[4] === id));
    if (turn.app && turn.app !== sec) {
        turn.back = order(sec) < order(turn.app);
        turn.at = Date.now();
    }
    turn.app = sec;
    if (!turn.opened) {
        turn.opened = Date.now();
        turn.at = 0;
    }
    const o = Date.now() - turn.opened;
    const opening = o < OPEN_MS ? ` is-opening" style="--open-delay:-${o}ms` : '';
    // A turn keeps going across re-renders (the clock re-draws the screen every few seconds).
    const t = Date.now() - turn.at;
    const leaf = t < TURN_MS ? `<i class="mu-bk-leaf ${turn.back ? 'is-back' : ''}" style="animation-delay:-${t}ms"></i>` : '';
    const unread = Object.values(social(g).unread).reduce((a, b) => a + b, 0);
    const badge = (id, key = id) => (id === 'messages' && unread ? `<em>${unread}</em>` : id === 'plans' && plansBadge(g) ? `<em>${plansBadge(g)}</em>` : key === 'profile' && goalsBadge(g, w) ? '<em class="is-goals">!</em>' : '');
    const left = `<header class="mu-bk-title"><small>${esc(w.features?.device ?? 'Journal')}</small><b data-notr>${esc(personaName())}</b>
            <span>${esc(weekday(g.day))} · Day ${g.day + 1} · ${hm(g.minutes % 1440)}</span><span class="mu-bk-purse">${icon('wallet')}${money(w, g.player.money)}</span></header>
        <h4 class="mu-bk-h">Contents</h4>
        <ol class="mu-bk-toc">${apps.map(([id, name, ic, , key]) => `<li><button class="${sec === key ? 'is-here' : ''}" data-act="ph-go" data-app="${esc(id)}">${icon(ic)}<span>${esc(name)}</span><i></i>${badge(id, key)}</button></li>`).join('')}
            <li><button data-act="ph-help">${icon('help')}<span>${esc(T('help'))}</span><i></i></button></li></ol>`;
    return `<div class="mu-bk-wrap${opening}" data-act="bk-bg"><div class="mu-book ${P.app === 'home' ? 'is-home' : ''}" role="dialog" aria-label="${esc(w.features?.device ?? 'Journal')}">
        <div class="mu-bk-page is-left" data-keep="bk-left">${left}</div>
        <div class="mu-bk-page is-right mu-ph-screen ${t < TURN_MS ? 'is-turning' : ''}" data-keep="ph-screen" style="--turn-delay:-${Math.min(t, TURN_MS)}ms">${body}</div>
        ${leaf}
        <nav class="mu-bk-ribbons">${apps.slice(0, RIBBONS.length).map(([id, name, ic, , key], i) => `<button class="mu-bk-ribbon ${sec === id ? 'is-here' : ''}" style="top:${RIBBONS[i]}%" data-act="ph-go" data-app="${esc(id)}" title="${esc(name)}">${icon(ic)}<span>${esc(name)}</span>${badge(id, key)}</button>`).join('')}</nav>
        <button class="mu-bk-close" data-act="ph-close" aria-label="Close the journal" title="Close">${icon('x')}</button>
    </div></div>`;
}
// The journal's first page: who you are meeting soon.
function bookFront(g, w) {
    const next = upcoming(g).slice(0, 5);
    return `<div class="mu-bk-front"><h3>Days to come</h3>
        ${next.length ? `<ul class="mu-bk-list">${next.map(a => `<li><b data-notr>${esc(g.cast[a.avatar]?.name ?? '')}</b><span>${esc(whenText(g, a.from))}${a.place ? ` · ${esc(placeOf(g, w, a.place)?.name ?? '')}` : ''}</span></li>`).join('')}</ul>`
        : '<p class="mu-muted">Nothing written for the days to come. Send a letter to arrange a meeting.</p>'}
        <p class="mu-bk-flourish">❦</p></div>`;
}
// On the notice board nobody scribbles below your notice: whoever answers sends you a letter.
function lettersFromNotice(g, post) {
    const s = social(g);
    for (const r of post.replies) {
        (s.threads[r.by] ??= []).push({ me: false, text: r.text, at: r.at });
        if (!(P.open && P.app === 'thread' && P.who === r.by))
            s.unread[r.by] = (s.unread[r.by] ?? 0) + 1;
        toast(lex(getWorld(g.world), 'newMessage', g.cast[r.by]?.name ?? ''), 'info');
    }
    post.replies = [];
}
export const phoneUnread = () => { const g = game(); return g ? Object.values(social(g).unread).reduce((a, b) => a + b, 0) : 0; };
Object.assign(ACT, {
    phone: () => { if (P.open)
        return closePhone(); P.open = true; if (P.app === 'thread' && !P.who)
        P.app = 'home'; notify(); },
    'ph-close': () => closePhone(),
    'ph-help': () => openHelp(),
    'bk-bg': (el, e) => { if (e.target === el) {
        P.open = false;
        notify();
    } },
    'ph-go': (el) => {
        P.app = el.dataset.app;
        P.draft = '';
        P.matched = '';
        P.q = '';
        {
            const s = sectionFor(P.app);
            if (s)
                LAST_TAB[s.id] = P.app;
        }
        if (P.app === 'journal')
            openJournal();
        // a new shuffle of Spark, and the newest match that came while you were away (its "It's a match!")
        if (P.app === 'dating') {
            const g = game();
            if (g) {
                const d = dating(g);
                d.seed = Math.random().toString(36).slice(2);
                const n = d.news.shift();
                if (n && g.cast[n])
                    P.matched = n;
            }
        }
        notify();
        const g = game();
        const w = g && getWorld(g.world);
        if (P.app === 'social' && g && w && feedPrefs().mode === 'open')
            refreshFeed(g, w); // only in "each time you open the app" mode
    },
    // Chirp
    'ph-refresh': () => { const g = game(); const w = g && getWorld(g.world); if (g && w)
        refreshFeed(g, w, true); },
    'ph-post': (el, e) => { if (e.target.closest('[data-act="ph-like"]'))
        return; P.post = el.dataset.id; P.app = 'post'; P.draft = ''; notify(); },
    'ph-like': (el, e) => { e.stopPropagation(); const g = game(); if (!g)
        return; const p = feed(g).posts.find(x => x.id === el.dataset.id); if (p) {
        toggleLike(g, p);
        saveGame();
        notify();
    } },
    'ph-chirp': async () => {
        const g = game();
        const w = g && getWorld(g.world);
        const text = P.draft.trim();
        if (!g || !w || !text || P.busy)
            return;
        P.draft = '';
        P.busy = true;
        notify();
        try {
            const post = await postAsMe(g, w, text);
            if (socialKind(w) === 'board')
                lettersFromNotice(g, post);
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        P.busy = false;
        saveGame();
        notify();
    },
    'ph-reply': async () => {
        const g = game();
        const text = P.draft.trim();
        const p = g && feed(g).posts.find(x => x.id === P.post);
        if (!g || !p || !text || P.busy)
            return;
        P.draft = '';
        P.busy = true;
        notify();
        try {
            const w = getWorld(g.world);
            if (w)
                await replyTo(g, w, p, text);
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        P.busy = false;
        saveGame();
        notify();
    },
    // Spark
    'sp-look': (el) => { const g = game(); if (!g)
        return; const l = dating(g).profile.looking; const v = el.dataset.v; const i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.push(v); notify(); },
    'sp-int': (el) => { const g = game(); if (!g)
        return; const l = dating(g).profile.interests; const v = el.dataset.v; const i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.length < 5 && l.push(v); notify(); },
    'sp-save': () => { const g = game(); if (!g)
        return; const d = dating(g); if (!d.profile.looking.length) {
        toast('Choose what you are looking for.', 'info');
        return;
    } d.profile.ready = true; P.app = 'dating'; saveGame(); notify(); },
    'sp-show': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w)
        return; const l = [...shownGenders(g, w)]; const v = el.dataset.v; const i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.push(v); dating(g).profile.show = l; notify(); },
    'sp-swipe': (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const like = el.dataset.like === '1';
        swipe(g, w, el.dataset.who, like); // the answer comes in a few days (sim/feed.ts)
        if (like)
            toast("Liked. If they like you back, you'll hear within a few days.", 'info');
        saveGame();
        notify();
    },
    'sp-next': () => { P.matched = ''; notify(); },
    'ph-quick': async (el) => { P.draft = await translateTo(el.dataset.text ?? ''); ACT['ph-send']?.(el, new Event('click')); },
    'ph-thread': (el) => { P.who = el.dataset.who; P.app = 'thread'; P.draft = ''; notify(); },
    'ph-person': (el) => { P.who = el.dataset.who; P.app = 'person'; notify(); },
    'ph-send': async () => {
        const g = game();
        const w = g && getWorld(g.world);
        const text = P.draft.trim();
        const who = P.who;
        if (!g || !w || !text || !who || P.typing)
            return;
        P.draft = '';
        P.typing = who;
        notify();
        try {
            // the answer to a friend's question: what it means is judged, and they decide
            const reply = askingFrom(g, who) ? (await answerAdvice(g, w, who, text), social(g).threads[who]?.at(-1)?.text ?? '') : await sendText(g, w, who, text);
            if (!reply)
                toast('No answer (is the AI connected?).', 'warn');
            else if (!(P.open && P.app === 'thread' && P.who === who)) {
                social(g).unread[who] = (social(g).unread[who] ?? 0) + 1;
                toast(lex(getWorld(g.world), 'newMessage', g.cast[who]?.name ?? ''), 'info');
            }
        }
        catch (e) {
            toast(String(e?.message ?? e), 'error');
        }
        P.typing = '';
        saveGame();
        notify();
    },
    'ph-partner': () => {
        const g = game();
        if (!g)
            return;
        if (!quickCouple(g, P.who))
            return;
        setStatus(g, P.who, YOU, 'dating');
        note(g, '{u} and {0} became a couple.', [g.cast[P.who]?.name ?? ''], [P.who], g.player.loc, 'love');
        feel(g, P.who, 'In love', 7);
        toast(`${g.cast[P.who]?.name} said yes!`, 'success');
        saveGame();
        notify();
    },
    'ph-apply': (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        if (g.player.job) {
            toast('Quit your current job first.', 'info');
            return;
        }
        const r = hire(g, w, el.dataset.id);
        if (r.pick) {
            askTrack(el.dataset.id, r.pick);
            return;
        } // (job tracks) pick yours first
        toast(r.text, r.ok ? 'success' : 'warn');
        saveGame();
        notify();
    },
    'ph-quit': () => { const g = game(); if (!g)
        return; quitJob(g, getWorld(g.world) ?? undefined); toast('You quit your job.', 'info'); saveGame(); notify(); },
    'ph-move': (el) => {
        const g = game();
        const w = g && getWorld(g.world);
        if (!g || !w)
            return;
        const err = moveTo(g, w, el.dataset.id);
        if (err) {
            toast(err, 'warn');
            return;
        }
        toast(`You moved to ${homeAddress(w, g.player.home)}.`, 'success');
        saveGame();
        notify();
    },
});
Object.assign(INPUT, {
    'ph-draft': (el) => { P.draft = el.value; },
    'ph-q': (el) => { P.q = el.value; notify(); },
    'sp-bio': (el) => { const g = game(); if (g)
        dating(g).profile.bio = el.value; },
});
