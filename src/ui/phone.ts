// The phone (Modern world): messages, people, jobs, bank and homes. Opens over the map or the scene.
import { safeUrl } from '../core/safe.js';
import { askingFrom, answerAdvice } from '../sim/happenings.js';
import { approvalOf, approvalWord } from '../sim/living.js';
import { interviewChance, interviewSkill, triedToday, retryText } from '../sim/skills.js';
import { missingCourses, isTaking } from '../sim/courses.js';
import { profileApp, jobCourseHtml, PF } from './courses.js';
import { billList, billAmount, billName, owed, isCut, daysLeft, payBill, payOf, priceOf, owedAmount, paidToward, payPlan, daysToCut, toGetBackIn, cheapestHome, billsApp, type BillId } from '../sim/bills.js';
import { shopApp } from './lifeui.js';
import { SH } from './shopui.js';
import { goalsApp, goalsBadge, closeGoal } from './goalsui.js';
import { collectionApp, openCollection, closeSlot, CL } from './collection.js';
import { tierHtml } from './museumui.js';
import { campusApp, campusBadge } from './campus.js';
import { businessApp, businessBadge } from './business.js';
import { lensApp, lensBadge, LS, photoPic, wantSprites } from './photoui.js';
import { retainerNow } from '../sim/freelance.js';
import { studentLink } from '../sim/hooks.js';
import { sheetApp, questsApp, grimoireApp } from './rpgui.js';
import { partyApp } from './combatui.js';
import { standingApp, standingHtml, petsApp, helpBtn } from './lifeplus.js';
import { factionsApp } from './factionsui.js';
import { holdingsApp } from './holdingsui.js';
import { towerApp, contractsApp, workshopApp, trophiesApp, bladeApp, soulApp, healthApp } from './adventureui.js';
import { PL, askByText } from './plans.js';
import { todayCard, resetToday } from './today.js';
import { feel } from '../sim/life.js';
import { journalApp, openJournal } from './journal.js';
import { relBar, relSubtitle, workWeekHtml, perfWord, askTrack, visitRow } from './relui.js';
import { note } from '../sim/facts.js';
import { notify, esc, game, toast, saveGame, settings, saveSettings, nowAbs, UI, adultOn } from '../core/store.js';
import { galleryPictures, photosOf } from './gallery.js';
import { getWorld, worldFile, deviceLook, messageKind, appsShown, systemOn, type WorldDef, type Occupation, isScenario } from '../core/world.js';
import { upcoming, when as planWhen, isWorking } from '../sim/plans.js';
import { lex, appRef } from '../core/lexicon.js';
import { whenText } from './plans.js';
import type { Save, Resident } from '../core/store.js';
import { thumb, chat } from '../st/bridge.js';
import { weekday } from '../sim/time.js';
import { fmtClock as hm } from '../core/fmt.js';
import { money, billsOf } from '../sim/needs.js';
import { placeOf, homeAddress } from '../sim/places.js';
import { whereNow, residents } from '../sim/people.js';
import { breakNow } from '../sim/daylife.js';
import { social, bondOf, bondLabel, isPartner, textOut, textBack, addBond, PARTNER_BOND } from '../sim/social.js';
import { awayNow, answerLater, dueLater, waitingOn, heartTone, heartBackfired, HEART } from '../sim/texting.js';
import { grudgeOf } from '../sim/grudges.js';
import { planForm, calendarApp, plansBadge } from './plans.js';
import { hobbyNeed, hobbyFits, skillName } from '../sim/hobbies.js';
import { likes, traitsOf, hire, quitJob, ledger, freeSpots, moveTo, rankOf, pendingBranch, choosePath, canRefer, askReferral, referralFor, askedThisWeek, promoNeeds, promoProgress, perfOf, hourlyPay, weekText, careerOf, openJobs, offScreen, jobPlace, realDays, myJob, trackOf, needsPick, openTracks, feeOf, waitDays, pathChoices, closedText, isFreelance, bookedJob, colleaguesOf, bossOf, colleagueWeekText } from '../sim/work.js';
import { rankName, jobOf as npcJob } from '../sim/dayplan.js';
import { trackName } from '../sim/tracks.js';
import { icon } from './icons.js';
import { appsOf, featureOn } from '../sim/creator.js';
import { generatePosts, shouldPost, feedPrefs, dating, theirProfile, writeProfile, profilePhotos, candidates, swipe, waitingCount, appInterests, LOOKING } from '../sim/feed.js';
import { newsStripHtml, newsApp, refreshNews } from './newsui.js';
import { gendersOf } from '../sim/gender.js';
import { personaName, personaThumb, translateTo, uploadUserFile } from '../st/bridge.js';
import { pickFile } from './cropper.js';
// (adult industry) after the screens above, which have loaded the industry's modules: the order modules load in stays
import { takeApp, takeBadge, seeTake, takeBack, takeNewsHtml } from './takeui.js';
import { titleFee, offersAWeek } from '../sim/titles.js';
import { directing } from '../sim/industry.js';
import { openHelp } from './help.js';
import { ACT, INPUT } from './reg.js';
import { setStatus, casualsOf, attracted, relOf, YOU } from '../sim/rel.js';
import { ties } from '../sim/living.js';
import { crushOn, canAsk, tierNo, romanceTier } from '../sim/romance.js';
import { knownHtml } from './personui.js';
import { PP, personTabs, feelingsNow, aboutHtml, memoriesHtml, circleHtml, notesHtml } from './personpage.js';
import { nudgeAnswersHtml, theirStoryHtml } from './threadui.js';
import { sharedLikes } from '../sim/private.js';
import { buyOnly } from '../sim/housing.js';
import { HU, ownedHtml, letHtml, forSaleHtml, roomsHtml, askHtml, askLeave } from './homesui.js';

type App = 'campus' | 'business' | 'sheet' | 'quests' | 'grimoire' | 'party' | 'standing' | 'pets' | 'factions' | 'assets' | 'tower' | 'contracts' | 'workshop' | 'trophies' | 'blade' | 'soulbond' | 'health' | 'home' | 'messages' | 'thread' | 'people' | 'person' | 'jobs' | 'bank' | 'homes' | 'news' | 'dating' | 'dprofile' | 'matches' | 'plans' | 'journal' | 'shop' | 'goals' | 'collection' | 'photos' | 'take' | 'settings' | 'profile';
// Closing slides the phone away first (the dialogue box glides back at the same time), then it is gone.
let closeTimer = 0;
export function closePhone() {
    if (!P.open || P.closing) return;
    const desktop = !document.getElementById('mundi-root')?.dataset.mobile && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!desktop) { P.open = false; notify(); return; }
    P.closing = true; notify();
    clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => { P.closing = false; P.open = false; notify(); }, 260);
}
export const P = { closing: false, open: false, app: 'home' as App, who: '' as string, draft: '', typing: '' as string, busy: false, matched: '' as string, q: '' };
// Sections: several apps under one icon (on the phone and in the journal), with tabs to move between them.
const SECTIONS: { id: string; name: string; icon: string; color: string; apps: App[] }[] = [
    { id: 'profile', name: 'Profile', icon: 'user', color: '#0a66c2', apps: ['profile', 'sheet', 'trophies'] },
    { id: 'companions', name: 'Companions', icon: 'heart', color: '#e58a4e', apps: ['pets', 'soulbond', 'blade'] },
    { id: 'groups', name: 'Groups', icon: 'users', color: '#6b4fd8', apps: ['party', 'factions'] },
    { id: 'missions', name: 'Missions', icon: 'map', color: '#c08a2e', apps: ['quests', 'tower', 'contracts'] },
    { id: 'work', name: 'Work', icon: 'briefcase', color: '#0a84ff', apps: ['jobs', 'campus', 'business'] },
];
const LAST_TAB: Record<string, App> = {};
// Apps shown inside another rather than on their own: Reputation is a tab of the Profile.
const FOLDED = new Set<string>(['standing']);
// The Profile's Reputation tab: the Reputation app's name and page, where this world shows that app and has something
// on it.
const repTab = (g: Save, w: WorldDef) => (shownApps(w).some(a => a.id === 'standing') ? { name: appsOf(w).find(a => a.id === 'standing')?.name ?? 'Reputation', html: standingHtml(g, w) } : undefined);
// The apps this game shows: the world's (appsShown), and an adult app (Take) only with adult content on.
const shownApps = (w: WorldDef) => appsShown(w).filter(a => !a.adult || adultOn(game()));
const sectionFor = (a: App) => SECTIONS.find(s => s.apps.includes(a));
// The apps of a section this world shows (the profile is always there).
const secApps = (w: WorldDef, s: typeof SECTIONS[number]) => { const shown = new Set(shownApps(w).map(x => x.id)); return s.apps.filter(a => (a === 'profile' && !isScenario(w)) || shown.has(a)); };   // Home: no Profile app
// The device's list: each app, or its section in the place of the section's first app (the profile at the end when none shows).
// A section with only one app this world shows is that app, under its own name.
// [the app it opens, name, icon, color, its key in the list]
const APPS = (w: WorldDef): [App, string, string, string, string][] => {
    const out: [App, string, string, string, string][] = []; const done = new Set<string>();
    for (const x of shownApps(w)) {
        if (FOLDED.has(x.id)) continue;
        const s = sectionFor(x.id as App);
        if (!s) { out.push([x.id as App, x.name, x.icon, x.color, x.id]); continue; }
        if (done.has(s.id)) continue; done.add(s.id);
        const list = secApps(w, s); if (!list.length) continue; const open = LAST_TAB[s.id] && list.includes(LAST_TAB[s.id]) ? LAST_TAB[s.id] : list[0];
        const only = list.length === 1 ? shownApps(w).find(a => a.id === list[0]) : undefined;
        out.push(only ? [only.id as App, only.name, only.icon, only.color, only.id] : [open, s.name, s.icon, s.color, s.id]);
    }
    if (!done.has('profile') && !isScenario(w)) { const s = SECTIONS[0]; out.push([LAST_TAB.profile ?? 'profile', s.name, s.icon, s.color, 'profile']); }
    return out;
};
// The header of an app: in a section with more than one app, the section's name and a tab for each of its apps.
function hd(app: App, title?: string) {
    const g = game(); const w = g && getWorld(g.world); const s = sectionFor(app);
    const name = (a: App) => (a === 'profile' ? T('profile') : appName(a));
    const list = s && w ? secApps(w, s) : [];
    if (!s) return head(title ?? name(app), 'home');
    if (list.length < 2) return head(title ?? name(app), 'home');
    if (w && sideSection(w, app)) return head(esc(s.name), 'home');   // (unfolded: the apps are listed on the left instead)
    // a tab carries its app's badge (Goals: "pick a life goal", D-7; Campus, Business, Lens: something to do)
    const mark = (a: App) => (g && w && badgeOf(g, w, a) ? ' <em class="mu-sec-badge">!</em>' : '');
    return head(esc(s.name), 'home').replace(/<\/div>$/, `<nav class="mu-sec-tabs">${list.map(a => `<button class="${a === app ? 'is-on' : ''}" data-act="ph-go" data-app="${esc(a)}">${name(a)}${mark(a)}</button>`).join('')}</nav></div>`);
}
// Unfolded, a section's apps are a list on the left and the open one fills the right (the Profile's section keeps its
// tabs: the Profile has a layout of its own). The section, when it's drawn that way.
const SIDE_SECTIONS = new Set(['work', 'companions', 'groups', 'missions']);
function sideSection(w: WorldDef, app: App): typeof SECTIONS[number] | undefined {
    const s = sectionFor(app);
    return s && SIDE_SECTIONS.has(s.id) && !BOOK && isWide() && secApps(w, s).length > 1 ? s : undefined;
}
// The section's apps on the left (each with its badge), the app as it draws on the right, under the section's head.
function sideHtml(g: Save, w: WorldDef, s: typeof SECTIONS[number], body: string): string {
    const top = head(esc(s.name), 'home');
    if (!body.startsWith(top)) return body;
    const icons = Object.fromEntries(appsOf(w).map(a => [a.id, a.icon]));
    const rows = secApps(w, s).map(a => `<button class="mu-sec-row ${a === P.app ? 'is-on' : ''}" data-act="ph-go" data-app="${esc(a)}" aria-pressed="${a === P.app}">${icon(icons[a] ?? 'grid')}<b>${appName(a)}</b>${badgeOf(g, w, a) ? '<em class="mu-sec-badge">!</em>' : ''}</button>`).join('');
    return `${top}<div class="mu-ph-split mu-sec-split"><div class="mu-ph-pane is-list" data-keep="sec-pane-list"><div class="mu-ph-body"><nav class="mu-sec-rows">${rows}</nav></div></div>
        <div class="mu-ph-pane is-open" data-keep="sec-pane-${esc(P.app)}">${body.slice(top.length)}</div></div>`;
}
const appName = (id: string) => { const g = game(); const w = g && getWorld(g.world); return esc(w ? appsOf(w).find(a => a.id === id)?.name ?? id : id); };
// Words that change with the world's style: the medieval journal speaks of letters, notices and the matchmaker.
let BOOK = false, LETTERS = false, LW: WorldDef | null = null;   // the world's device and messages
const T = (key: string, ...a: string[]) => lex(LW, key, ...a);
const met = (g: Save) => residents(g).filter(r => r.met);
const day = (g: Save, at: number) => { const d = Math.floor(at / 1440); return d === g.day ? hm(at % 1440) : `${weekday(d).slice(0, 3)} ${hm(at % 1440)}`; };
const bar = (v: number) => `<span class="mu-bond"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span>`;

// Signal bars (always full), like a real phone's status bar.
const SIGNAL = '<svg class="mu-ic" viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><rect x="3" y="15" width="3" height="5" rx="1"/><rect x="8" y="11" width="3" height="9" rx="1"/><rect x="13" y="7" width="3" height="13" rx="1"/><rect x="18" y="3" width="3" height="17" rx="1"/></svg>';
// The head of a view. Its Back button goes one step back (ph-back); `back` is where it goes when there is no step
// to go back to (the phone opened straight on a conversation: Messages).
function head(title: string, back: App | null) {
    return `<div class="mu-ph-head">${back ? backBtn(back) : '<span></span>'}<b>${title}</b><span></span></div>`;
}
const backBtn = (parent: App) => `<button class="mu-ibtn mu-ghost" data-act="ph-back" data-app="${esc(parent)}" aria-label="Back" title="Back">${icon('back')}</button>`;

/* ---------- going back: one Back button, a step at a time ---------- */

// The views you came through, the one showing not included. Back first closes what is open inside an app (a goal, a
// photo, a house's rooms), then goes to the view before; with none before, to the head's parent, then home.
type View = { app: App; who: string };
const NAV = { stack: [] as View[], last: null as View | null, mode: '' as '' | 'root' | 'back' | 'swap' };
const viewNow = (): View => ({ app: P.app, who: P.app === 'thread' || P.app === 'person' ? P.who : '' });
const sameView = (a: View, b: View) => a.app === b.app && a.who === b.who;
// Run on every drawing of the open phone, so views opened from anywhere (a card in the scene, a toast) count too.
// Not a step: the home screen and what it opens, a section's tabs, another conversation picked from the list
// (data-nav="swap"). Another person's page opened from a person's Circle is one.
function trackView() {
    const now = viewNow(), prev = NAV.last, mode = NAV.mode;
    NAV.last = now; NAV.mode = '';
    if (!prev || now.app === 'home' || mode === 'root') { NAV.stack = []; return; }
    if (mode === 'back' || sameView(prev, now) || prev.app === 'home' || (prev.app === now.app && (mode === 'swap' || !now.who))) return;
    const s = sectionFor(prev.app); if (s && s === sectionFor(now.app)) return;
    // back on a view already passed through (a person's page → their conversation → their page): no loop
    const i = NAV.stack.findIndex(v => sameView(v, now));
    if (i >= 0) NAV.stack.length = i; else NAV.stack.push(prev);
}
// What Back closes inside an app before leaving it.
function innerBack(): boolean {
    if (P.app === 'thread' && NICK.who) { NICK.who = ''; return true; }
    if (P.app === 'goals' && closeGoal()) return true;
    if (P.app === 'photos' && LS.photo) { LS.photo = 0; return true; }
    if (P.app === 'take' && takeBack()) return true;
    if (P.app === 'homes' && HU.rooms) { HU.rooms = ''; return true; }
    if (P.app === 'collection' && closeSlot()) return true;
    if (P.app === 'dating' && P.matched) { P.matched = ''; return true; }
    return false;
}
// Opening an app, forward or back: what each one does when it opens.
function openApp(app: App) {
    if (app === 'standing') { app = 'profile'; PF.tab = 'reputation'; }   // (folded into the Profile)
    P.app = app; P.draft = ''; P.matched = ''; P.q = '';
    { const s = sectionFor(app); if (s) LAST_TAB[s.id] = app; }
    const g = game(); const w = g && getWorld(g.world);
    if (app === 'journal') openJournal();
    if (app === 'collection' && g && w) { openCollection(g, w); saveGame(); }
    if (app === 'take' && g && w && seeTake(g, w)) saveGame();   // (its offers and releases seen: the badge goes)
    // a new shuffle of Spark, and the newest match that came while you were away (its "It's a match!")
    if (app === 'dating' && g) { const d = dating(g); (d as any).seed = Math.random().toString(36).slice(2); const n = d.news.shift(); if (n && g.cast[n]) P.matched = n; }
    notify();
    if (app === 'messages') void refreshNews();   // new posts in the news, only in "each time you open Messages" mode
}

/* ---------- the unfolded phone: twice as wide, lists and what's open side by side ---------- */

// A computer only: on a phone's screen the phone already fills it.
const isWide = () => !!(settings() as any).phoneWide && !document.getElementById('mundi-root')?.dataset.mobile;
// Unfolded, a list and the view it opens show together: the conversation next to Messages, the person next to People.
const PAIRS: Partial<Record<App, App>> = { messages: 'messages', thread: 'messages', people: 'people', person: 'people' };
function pairHtml(g: Save, w: WorldDef, list: App): string {
    const open = list === 'messages' ? (P.app === 'thread' && g.cast[P.who] ? threadApp(g) : '') : P.app === 'person' && g.cast[P.who] ? personApp(g, w) : '';
    const none = list === 'messages' ? 'Pick a conversation.' : 'Pick someone to see their page.';
    return `<div class="mu-ph-split"><div class="mu-ph-pane is-list" data-keep="ph-pane-list">${list === 'messages' ? messagesApp(g) : peopleApp(g)}</div>
        <div class="mu-ph-pane is-open" data-keep="ph-pane-open-${esc(P.app)}">${open || `<p class="mu-ph-none">${icon(list === 'messages' ? 'chat' : 'users')}<span>${esc(none)}</span></p>`}</div></div>`;
}
const isOpenRow = (avatar: string) => (P.app === 'thread' || P.app === 'person') && P.who === avatar;

// An app's badge: unread messages, plans to answer, bills due (where they're paid), something to do in Campus,
// Business, Lens or Take, a life goal to pick, a path to choose at your job. A number, '!' or nothing.
function badgeOf(g: Save, w: WorldDef, a: string): number | '!' | '' {
    if (a === 'messages') return Object.values(social(g).unread).reduce((x, y) => x + y, 0) || '';
    if (a === 'plans') return plansBadge(g) || '';
    if (a === billsApp(w) && billList(w).some(b => billAmount(g, w, b.id) && owed(g, b.id))) return '!';
    if ((a === 'campus' && campusBadge(g, w)) || (a === 'business' && businessBadge(g, w)) || (a === 'photos' && lensBadge(g, w)) || (a === 'take' && takeBadge(g, w)) || (a === 'goals' && goalsBadge(g, w))) return '!';
    if (a === 'jobs') { const o = myJob(g, w); if (o && pendingBranch(g, o)) return '!'; }   // a path to choose at your job
    return '';
}
// The badge of a tile on the home screen (or a ribbon of the journal): its app's, or for a section, the first of its apps'.
function tileBadge(g: Save, w: WorldDef, id: string, key: string): string {
    const s = SECTIONS.find(x => x.id === key);
    const b = s ? secApps(w, s).map(a => badgeOf(g, w, a)).find(Boolean) ?? '' : badgeOf(g, w, id);
    return b ? `<em${key === 'goals' ? ' class="is-goals"' : ''}>${b}</em>` : '';
}
function homeApp(g: Save, w: WorldDef) {
    return `<div class="mu-ph-apps">${todayCard(g, w, shownApps(w).some(a => a.id === 'plans'), shownApps(w).some(a => a.id === 'goals'))}${APPS(w).map(([id, name, ic, color, key]) => `<button class="mu-ph-app" data-act="ph-go" data-nav="root" data-app="${esc(id)}">
        <i style="--c:${color}">${icon(ic)}</i><span>${esc(name)}</span>${tileBadge(g, w, id, key)}</button>`).join('')}
        <button class="mu-ph-app" data-act="ph-go" data-nav="root" data-app="settings"><i style="--c:#7d8597">${icon('gear')}</i><span>Settings</span></button>
        <button class="mu-ph-app" data-act="ph-help"><i style="--c:#30b0c7">${icon('help')}</i><span>${T('help')}</span></button></div>`;
}

/* ---------- Settings: the wallpaper (a picture from the web, or one from Mundi's gallery) ---------- */

const WP = { url: '', more: false, busy: false, pick: '' as '' | 'chat' | 'gallery' };
const NICK = { who: '', text: '' };
Object.assign(ACT, {
    'ph-nick-edit': (el) => { const g = game(); const who = el.dataset.who!; NICK.who = who; NICK.text = g ? nicks(g)[who] ?? g.cast[who]?.name ?? '' : ''; notify(); setTimeout(() => document.querySelector<HTMLInputElement>('#mundi-root [data-focus="ph-nick"]')?.select(), 30); },
    // while editing: a message can be deleted (yours or theirs), gone from the conversation for good
    'ph-msg-del': (el) => {
        const g = game(); if (!g || !NICK.who) return;
        const t = social(g).threads[NICK.who]; const i = Number(el.dataset.i);
        if (!t || !t[i]) return;
        t.splice(i, 1); saveGame(); notify();
    },
    'ph-nick-save': () => {
        const g = game(); if (!g || !NICK.who) return;
        const r = g.cast[NICK.who]; const t = NICK.text.trim();
        if (!t || t === r?.name) delete nicks(g)[NICK.who]; else nicks(g)[NICK.who] = t;
        NICK.who = ''; saveGame(); notify();
    },
});
Object.assign(INPUT, { 'ph-nick': (el) => { NICK.text = el.value; } });
const wallpaper = () => String((settings() as any).phoneBg ?? '');
const cssUrl = (u: string) => `url("${safeUrl(u)}")`;
// The pictures of the chat being played (Image Generation, attachments, links), newest first.
const chatPictures = (): string[] => [...new Set(chat().flatMap((m: any, i: number) => photosOf(m, i).map(p => p.url)))].reverse();
// The phone's own options (the same as in This world → AI context, for all your games): when people post in the news,
// pictures in their posts, and whether characters write their own texts.
function phoneOptions(): string {
    const fp = feedPrefs(), news = !LW || systemOn(LW, 'social');
    const modes: [string, string][] = [['button', 'Only when you tap "More news"'], ['open', 'New posts each time you open Messages'], ['auto', 'The characters, on their own as time passes']];
    return `${news ? `<section class="mu-ph-opts"><h4>${esc(LW ? lex(LW, 'news') : 'News')}</h4>
            <label class="mu-field"><span>People's posts in the news</span><select data-input="set-feed">${modes.map(([v, l]) => `<option value="${v}" ${fp.mode === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
            <label class="mu-check"><input type="checkbox" data-input="set-feedimg" ${fp.images ? 'checked' : ''}><span>Pictures in posts<small>Made with SillyTavern's Image Generation extension, when it is set up.</small></span></label></section>` : ''}
        <section class="mu-ph-opts"><h4>${esc(LW ? appName('messages') : 'Messages')}</h4>
            <label class="mu-check"><input type="checkbox" data-input="ui-bool" data-key="aiTexts" ${UI().aiTexts !== false ? 'checked' : ''}><span>Characters write their own texts<small>Answers to your invitations, being stood up, asking your advice, letters from far away. Off: short ready-made replies.</small></span></label></section>`;
}
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
        ${phoneOptions()}
        ${WP.pick ? `<section class="mu-ph-wp-pick">
            <div class="mu-sec-tabs"><button class="${WP.pick === 'chat' ? 'is-on' : ''}" data-act="wp-src" data-v="chat">From this chat</button><button class="${WP.pick === 'gallery' ? 'is-on' : ''}" data-act="wp-src" data-v="gallery">From the Mundi gallery</button></div>
            ${pics === null ? '<p class="mu-muted"><span class="mu-spin"></span> Loading your pictures…</p>'
            : pics.length ? `<div class="mu-ph-wp-grid">${shown.map(u => `<button class="${u === cur ? 'is-on' : ''}" data-act="wp-pick" data-url="${esc(u)}" style="background-image:${esc(cssUrl(u))}" aria-label="Use this picture"></button>`).join('')}</div>
                ${pics.length > shown.length ? `<button class="mu-ghost" data-act="wp-more">Show more (${pics.length - shown.length})</button>` : ''}`
            : `<p class="mu-muted">${empty}</p>`}
        </section>` : ''}</div>`;
}
const setWallpaper = (u: string) => { (settings() as any).phoneBg = u; saveSettings(); notify(); };
Object.assign(ACT, {
    'wp-set-url': () => { const u = WP.url.trim(); if (!/^(https?:\/\/|\/|data:image\/)/i.test(u)) { toast('Paste a picture link (https://…).', 'info'); return; } WP.url = ''; setWallpaper(u); toast('Wallpaper changed.', 'success'); },
    'wp-pick': (el) => { setWallpaper(el.dataset.url!); toast('Wallpaper changed.', 'success'); },
    'wp-reset': () => setWallpaper(''),
    'wp-more': () => { WP.more = true; notify(); },
    'wp-pick-open': () => { WP.pick = WP.pick ? '' : 'chat'; WP.more = false; notify(); },
    'wp-src': (el) => { WP.pick = el.dataset.v as 'chat' | 'gallery'; WP.more = false; notify(); },
    // a picture from your computer: saved in SillyTavern's user files, so it stays the same on every device
    'wp-upload': async () => {
        const f = await pickFile('image/*'); if (!f) return;
        WP.busy = true; notify();
        try {
            const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
            const path = await uploadUserFile(`mundi-wallpaper-${Date.now().toString(36)}.${ext}`, f);
            setWallpaper(`/${path}`); toast('Wallpaper changed.', 'success');
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        WP.busy = false; notify();
    },
});
Object.assign(INPUT, { 'wp-url': (el) => { WP.url = el.value; } });

// A search box at the top of a list (39).
const searchBox = (ph: string) => `<div class="mu-ph-search">${icon('search')}<input type="search" placeholder="${ph}" value="${esc(P.q)}" data-input="ph-q" data-focus="ph-q"></div>`;
const matchQ = (g: Save, r: { avatar: string; name: string }, texts = false) => {
    const q = P.q.trim().toLowerCase(); if (!q) return true;
    return r.name.toLowerCase().includes(q) || (texts && (social(g).threads[r.avatar] ?? []).some(m => m.text.toLowerCase().includes(q)));
};
// The name you saved them under (like a phone contact): their name unless you changed it.
const nicks = (g: Save): Record<string, string> => (((social(g) as any).nick ??= {}) as Record<string, string>);
const contactName = (g: Save, r: { avatar: string; name: string }) => nicks(g)[r.avatar] || r.name;
// Under a name in Messages: their last message, marked when it waits for your answer (a question you haven't
// answered), or yours with a tick while they will answer later.
function rowNote(g: Save, avatar: string, last: { me: boolean; text: string } | undefined): string {
    if (!last) return '';
    const text = `<span data-notr>${esc(last.text)}</span>`;
    if (last.me) return waitingOn(g, avatar) ? `<i class="mu-ph-sent" title="Delivered">${icon('check')}</i>${text}` : text;
    return /\?\s*$/.test(last.text) && !social(g).unread[avatar] ? `<i class="mu-ph-yourturn" title="Waiting for your answer">${icon('chat')}</i>${text}` : text;
}
function messagesApp(g: Save) {
    const s = social(g);
    const list = met(g).filter(r => matchQ(g, r, true)).sort((a, b) => (s.threads[b.avatar]?.at(-1)?.at ?? 0) - (s.threads[a.avatar]?.at(-1)?.at ?? 0));
    return `${head(appName('messages'), 'home')}${searchBox(T('searchMessages'))}${P.q.trim() || !LW ? '' : `${newsStripHtml(g, LW)}${takeNewsHtml(g, LW)}`}<div class="mu-ph-list">${list.length ? list.map(r => {
        const last = s.threads[r.avatar]?.at(-1);
        return `<button class="mu-ph-row ${isOpenRow(r.avatar) ? 'is-on' : ''}" data-act="ph-thread" data-nav="swap" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt="">
            <span><b data-notr>${esc(contactName(g, r))}</b><small>${rowNote(g, r.avatar, last)}</small></span>${s.unread[r.avatar] ? `<em>${s.unread[r.avatar]}</em>` : last ? `<small>${day(g, last.at)}</small>` : ''}</button>`;
    }).join('') : `<p class="mu-muted mu-pad">${T('noContacts')}</p>`}</div>`;
}

// Under your last message while their answer waits: delivered, and why not yet (work, sleep).
function laterNote(g: Save, avatar: string): string {
    const l = waitingOn(g, avatar); if (!l) return '';
    const why = l.why === 'sleep' ? "Delivered. They're probably asleep: they'll answer in the morning." : "Delivered. They're probably at work: they'll answer when they get a moment.";
    return `<p class="mu-ph-later">${icon('clock')}<span>${esc(why)}</span></p>`;
}
// The quick replies: what fits now (sorry while they're hurt, a plan coming up, the time of day, a partner), then
// "How are you?". Four at most, the first ones first.
function quickReplies(g: Save, avatar: string): [string, string, string][] {
    const out: [string, string, string][] = [];
    const h = Math.floor(g.minutes / 60), close = bondOf(g, avatar) >= 30;
    if (grudgeOf(g, avatar)) out.push(['Say sorry', "I'm sorry about before.", 'heart']);
    const next = upcoming(g, avatar)[0];
    if (next) out.push(['See you then', `See you ${planWhen(g, next.from)}!`, 'calendar']);
    if (!LETTERS && close && h >= 5 && h < 11) out.push(['Good morning', 'Good morning!', 'chat']);
    if (!LETTERS && close && (h >= 21 || h < 2)) out.push(['Good night', 'Good night!', 'moon']);
    if (isPartner(g, avatar)) out.push(['Miss you', 'I miss you.', 'heart']);
    else if (close) out.push(['Thinking of you', 'I was thinking about you.', 'heart']);
    out.push(['How are you?', 'How are you doing?', 'chat']);
    return out.slice(0, 4);
}
function threadApp(g: Save) {
    const r = g.cast[P.who]; if (!r) return messagesApp(g);
    const t = social(g).threads[r.avatar] ?? [];
    social(g).unread[r.avatar] = 0;
    return `<div class="mu-ph-head is-chat">${backBtn('messages')}
            ${NICK.who === r.avatar
                ? `<div class="mu-ph-nick"><input type="text" maxlength="40" data-input="ph-nick" data-focus="ph-nick" value="${esc(NICK.text)}" placeholder="${esc(r.name)}"><button class="mu-ibtn mu-primary" data-act="ph-nick-save" aria-label="Save">${icon('check')}</button></div>`
                : `<button class="mu-ph-chathead" data-act="ph-person" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt=""><span><b data-notr title="${esc(contactName(g, r))}">${esc(contactName(g, r))}</b><small>${P.typing === r.avatar ? T('typing') : bondLabel(g, r.avatar)}</small></span></button>
                <button class="mu-ibtn mu-ghost mu-ph-pen" data-act="ph-nick-edit" data-who="${esc(r.avatar)}" title="${esc(T('editThread'))}" aria-label="Edit">${icon('pen')}</button>`}</div>
        ${NICK.who === r.avatar ? `<p class="mu-ph-editnote">${icon('trash')} ${T('deleteMsgHint')}</p>` : ''}
        <div class="mu-ph-thread ${NICK.who === r.avatar ? 'is-editing' : ''}" data-keep="ph-thread" data-bottom>${t.map((m, i) => NICK.who === r.avatar
            ? `<button class="mu-ph-msg ${m.me ? 'is-me' : ''}" data-notr data-act="ph-msg-del" data-i="${esc(i)}" title="${esc(T('deleteMsg'))}">${esc(m.text)}<small>${day(g, m.at)}</small><i class="mu-ph-del">${icon('trash')}</i></button>`
            : `<div class="mu-ph-msg ${m.me ? 'is-me' : ''} ${m.heart ? 'has-heart' : ''}"><span data-notr>${esc(m.text)}</span><small>${day(g, m.at)}</small>${m.me || LETTERS ? '' : `<button class="mu-ph-like ${m.heart ? 'is-on' : ''}" data-act="ph-heart" data-i="${esc(i)}" aria-pressed="${!!m.heart}" aria-label="Heart" title="Heart">${icon(m.heart ? 'heart' : 'heartLine')}</button>`}</div>`).join('')}
            ${NICK.who === r.avatar ? '' : laterNote(g, r.avatar)}
            ${P.typing === r.avatar ? '<div class="mu-ph-msg is-typing"><i></i><i></i><i></i></div>' : ''}
            ${t.length ? '' : `<p class="mu-muted mu-pad">${T('emptyThread')}</p>`}${NICK.who === r.avatar ? '' : (() => { const w = getWorld(g.world); return w ? nudgeAnswersHtml(g, w, r.avatar) : ''; })()}</div>
        <div class="mu-ph-quick">
            <button data-act="pl-come" data-who="${esc(r.avatar)}" ${PL.busy ? 'disabled' : ''}>${icon('home')}<span>Come over</span></button>
            <button data-act="ph-person" data-who="${esc(r.avatar)}" data-tab="about">${icon('calendar')}<span>Make plans</span></button>
            ${quickReplies(g, r.avatar).map(([label, text, ic]) => `<button data-act="ph-quick" data-text="${esc(text)}">${icon(ic)}<span>${esc(label)}</span></button>`).join('')}${(() => { const w = getWorld(g.world); return w ? helpBtn(g, w, r.avatar) : ""; })()}</div>
        <div class="mu-ph-compose"><input type="text" placeholder="${T('messagePlaceholder')}" value="${esc(P.draft)}" data-input="ph-draft" data-focus="ph-draft" ${P.typing ? 'disabled' : ''}>
            <button class="mu-ibtn mu-primary" data-act="ph-send" aria-label="${T('send')}" ${P.typing ? 'disabled' : ''}>${icon('send')}</button></div>`;
}

// People: your partners first, then something casual (listed apart: they aren't partners), then everyone else.
// Filters over it (who you'd look for): friends, romance, family, who lives with you, coworkers, neighbours, and who
// is free right now; each only when it has someone (and not everyone). A dot on each row says free, at work or asleep (Busy people).
type PeopleFilter = 'all' | 'free' | 'friends' | 'romance' | 'family' | 'home' | 'work' | 'neighbours';
const PEOPLE = { filter: 'all' as PeopleFilter };
const FRIEND_AT = 30;
const livesWithYou = (r: Resident) => (r as any).homeWith === '__you';
function peopleFilters(g: Save, w: WorldDef): [PeopleFilter, string, (r: Resident) => boolean][] {
    const job = g.player.job?.id, zone = g.player.home.zone;
    const family = new Set(ties(g).filter(t => t.a === YOU || t.b === YOU).map(t => (t.a === YOU ? t.b : t.a)));
    return [
        ['free', 'Free now', r => systemOn(w, 'busy') && !awayNow(g, w, r)],
        ['friends', 'Friends', r => bondOf(g, r.avatar) >= FRIEND_AT],
        ['romance', 'Romance', r => systemOn(w, 'romance') && (isPartner(g, r.avatar) || casualsOf(g).includes(r.avatar) || romanceTier(g, r.avatar).id !== 'none')],
        ['family', 'Family', r => family.has(r.avatar)],
        ['home', 'At home', r => livesWithYou(r)],
        ['work', 'Work', r => !!job && r.occupation === job],
        ['neighbours', 'Neighbours', r => !isScenario(w) && r.home?.zone === zone && !livesWithYou(r)],
    ];
}
// Free, at work or asleep: a dot on the row (nothing with Busy people off).
function busyDot(g: Save, w: WorldDef, r: Resident): string {
    if (!systemOn(w, 'busy')) return '';
    const away = awayNow(g, w, r);
    const word = away === 'work' ? 'At work' : away === 'sleep' ? 'Asleep' : 'Free now';
    return `<i class="mu-ph-dot is-${away || 'free'}" title="${esc(word)}" aria-label="${esc(word)}"></i>`;
}
function peopleApp(g: Save) {
    const w = LW!;
    const all = met(g).sort((a, b) => bondOf(g, b.avatar) - bondOf(g, a.avatar));
    const filters = peopleFilters(g, w).map(([id, name, ok]) => [id, name, ok, all.filter(ok).length] as const).filter(f => f[3] > 0 && f[3] < all.length);   // (one that is everyone says nothing)
    const on = filters.find(f => f[0] === PEOPLE.filter) ?? null;
    if (!on) PEOPLE.filter = 'all';
    const list = all.filter(r => matchQ(g, r) && (!on || on[2](r)));
    const casual = new Set(casualsOf(g));
    const row = (r: Resident) => `<button class="mu-ph-row ${isOpenRow(r.avatar) ? 'is-on' : ''}" data-act="ph-person" data-nav="swap" data-who="${esc(r.avatar)}"><img src="${esc(thumb(r.avatar))}" alt="">${busyDot(g, w, r)}
        <span><b data-notr>${esc(contactName(g, r))}</b><small>${relSubtitle(g, r.avatar)}</small>${relBar(r.avatar)}</span>${isPartner(g, r.avatar) ? `<i class="mu-ph-heart">${icon('heart')}</i>` : ''}</button>`;
    const groups: [string, Resident[]][] = [['', list.filter(r => isPartner(g, r.avatar))], ['Casual', list.filter(r => casual.has(r.avatar))], ['', list.filter(r => !isPartner(g, r.avatar) && !casual.has(r.avatar))]];
    const chips = all.length && filters.length ? `<div class="mu-chips mu-ph-filters">${[['all', 'All', null, all.length] as const, ...filters].map(([id, name, , n]) => `<button class="mu-chip ${PEOPLE.filter === id ? 'is-on' : ''}" data-act="ph-people-filter" data-v="${id}" aria-pressed="${PEOPLE.filter === id}">${esc(name)} <small>${n}</small></button>`).join('')}</div>` : '';
    return `${head(appName('people'), 'home')}${searchBox('Search people')}${chips}<div class="mu-ph-list">${list.length ? groups.filter(([, rs]) => rs.length).map(([h, rs]) => `${h ? `<h5 class="mu-ph-group">${h}</h5>` : ''}${rs.map(row).join('')}`).join('')
        : `<p class="mu-muted mu-pad">${all.length ? esc('No one here.') : T('noneMet')}</p>`}</div>`;
}

// A sure yes by phone: very close friends who also have a crush on you (being a couple needs both).
const quickCouple = (g: Save, a: string) => bondOf(g, a) >= PARTNER_BOND && crushOn(g, a) && canAsk(g, a, 'date') && attracted(g, a, YOU) && !tierNo(g, a, 'date');   // a sure yes: never against attraction, nor (museum) before their tier

// A person's page: who they are to you on top (with the buttons that matter most), then the tabs of ui/personpage.ts.
function personApp(g: Save, w: WorldDef) {
    const r = g.cast[P.who]; if (!r) return peopleApp(g);
    if (!r.met) return strangerApp(g, w, r);
    const a = r.avatar, partner = isPartner(g, a);
    const here = whereNow(g, w, r), br = breakNow(g, w, r);
    const now = `<section class="mu-pp-sec mu-pp-now"><h5>${icon('pin')}<span>Now</span></h5><b data-notr>${esc(placeOf(g, w, here)?.name ?? '')}</b>${br && here === br.place ? `<small>${esc(br.why.replace(/^is /, ''))}</small>` : ''}</section>`;
    const plans = featureOn(w, 'plans') ? `<section class="mu-pp-sec">${planForm(g, w, a)}${visitRow(g, w, a)}</section>` : '';
    const body = PP.tab === 'memories' ? memoriesHtml(g, w, a) : PP.tab === 'circle' ? circleHtml(g, w, a) : PP.tab === 'notes' ? notesHtml(g, w, a, knownHtml(g, w, a))
        : aboutHtml(g, w, a, now, `${plans}${theirStoryHtml(g, w, a)}${referBtn(g, w, a)}`);
    return `${head(esc(contactName(g, r)), 'people')}<div class="mu-ph-body mu-pp">
        <div class="mu-ph-profile"><img src="${esc(thumb(a))}" alt=""><b data-notr>${esc(r.name)}</b>${nicks(g)[a] ? `<small data-notr>${esc(T('inYourDevice', nicks(g)[a]))}</small>` : ''}<small>${relSubtitle(g, a)}</small>${relBar(a)}${tierHtml(g, w, a)}<small>${approvalWord(approvalOf(g, a))}</small>${feelingsNow(g, a)}</div>
        <div class="mu-pp-acts"><button class="mu-primary" data-act="ph-thread" data-who="${esc(a)}">${icon(LETTERS ? 'send' : 'chat')}<span>${T('writeMessage')}</span></button>
            ${partner ? '<p class="mu-ph-love">You are together.</p>' : quickCouple(g, P.who) ? `<button data-act="ph-partner">${icon('heart')}<span>Ask to be together</span></button>` : ''}</div>
        ${personTabs(g, w, a)}
        <div class="mu-pp-body">${body}</div>
    </div>`;
}

// Someone you haven't met (a face in Here, Their card on a sprite): only what you can see. No name, no number to
// write to and nothing in the tabs yet: where they are, and their job while they're at it. Once you've met, their
// page is the whole one.
function strangerApp(g: Save, w: WorldDef, r: Resident) {
    const here = whereNow(g, w, r), seen = here === g.player.loc;   // (only where you see them: here with you)
    const job = seen && isWorking(g, w, r, nowAbs(g)) ? w.occupations.find(o => o.id === r.occupation)?.name ?? '' : '';
    return `${head('Someone', 'people')}<div class="mu-ph-body mu-pp">
        <div class="mu-ph-profile"><img src="${esc(thumb(r.avatar))}" alt=""><b>Someone</b><small>You don't know them yet.</small></div>
        ${seen ? `<section class="mu-pp-sec mu-pp-now"><h5>${icon('pin')}<span>Now</span></h5><b data-notr>${esc(placeOf(g, w, here)?.name ?? '')}</b>${job ? `<small><span>At work</span>: <span data-notr>${esc(job)}</span></small>` : ''}</section>` : ''}
    </div>`;
}

// Someone high up at their job can recommend you there.
function referBtn(g: Save, w: WorldDef, avatar: string) {
    const o = canRefer(g, w, avatar); if (!o) return '';
    if (referralFor(g, o.id) === avatar) return `<p class="mu-muted">${esc(g.cast[avatar].name)} will vouch for you at ${esc(o.name)}.</p>`;
    return `<button data-act="ph-refer" data-who="${esc(avatar)}" ${askedThisWeek(g, avatar) ? 'aria-disabled="true" title="Once a week"' : ''}>${icon('briefcase')}<span>Ask for a good word at ${esc(o.name)}</span></button>`;
}
// The paths of a career you chose, in words.
const pathNames = (o: Occupation, path: string[]) => path.map(id => (o.branches ?? []).flatMap(b => b.options).find(x => x.id === id)?.name ?? id).join(' › ');
// At a branch: the paths you can take next (each with its ranks and pay); one that isn't open to you shows why.
function branchPicker(g: Save, w: WorldDef, o: Occupation) {
    const b = pendingBranch(g, o); if (!b) return '';
    return `<div class="mu-branch"><b>${T('choosePathTitle')}</b><small class="mu-muted">The next ranks depend on it; it cannot be changed later.</small>
        ${pathChoices(g, w, b).map(({ opt: x, open }) => `<button class="mu-branch-opt" data-act="ph-path" data-id="${esc(x.id)}" ${open ? '' : 'aria-disabled="true"'}><b>${esc(x.name)}</b>${x.desc ? `<small>${esc(x.desc)}</small>` : ''}
            <small class="mu-muted">${x.ranks.map(r => `${esc(r.name)} (${money(w, r.pay)}/h)`).join(' › ')}</small>${x.likes?.length ? `<small>Good for: ${esc(x.likes.join(', '))}</small>` : ''}${open ? '' : `<small class="mu-bad">${esc(closedText(x))}</small>`}</button>`).join('')}</div>`;
}
// What helps an interview: your best skill for the job (about +1 for every two levels) and the traits it likes (+2 each).
function interviewHelp(g: Save, w: WorldDef, o: Occupation): string {
    const s = interviewSkill(g, o), liked = (o.likes ?? []).filter(t => traitsOf(g).includes(t));
    return `${s ? `<small class="mu-good">Your ${esc(skillName(w, s.id))} (level ${s.level}) helps: +${s.bonus}</small>` : ''}${liked.length ? `<small class="mu-good">Your traits help: ${esc(liked.join(', '))}</small>` : ''}`;
}
// Jobs: how the openings are sorted ('' as the world lists them). Kept while the game runs, like the Homes app's city.
const JF = { sort: '' };
const JOB_SORTS: [string, string][] = [['', 'Listed'], ['pay', 'Pay'], ['chance', 'Interview chance'], ['place', 'Where'], ['days', 'Days a week']];
// The openings in the order picked: the best starting pay first (then the best top pay), the best interview chance
// first (a job asking for a course you haven't got last), by district and then place (off-screen jobs last), or the
// fewest days a week first (then the best pay). Ties keep the world's order.
function sortedOpenings(g: Save, w: WorldDef, list: Occupation[]): Occupation[] {
    if (!JF.sort) return list;
    const on = (job: Occupation) => trackOf(g, job);
    const pay = (o: Occupation) => payOf(g, o.ranks[0]?.pay ?? 0), top = (o: Occupation) => payOf(g, o.ranks.at(-1)?.pay ?? 0);
    const chance = (o: Occupation) => (missingCourses(g, w, o).length ? -1 : interviewChance(g, o, traitsOf(g)));
    const where = (o: Occupation) => { if (offScreen(w, o)) return '\uffff'; const p = placeOf(g, w, o.place); return `${w.maps?.find(m => m.id === p?.map)?.name ?? ''}\u0000${p?.name ?? ''}`; };
    const by: Record<string, (a: Occupation, b: Occupation) => number> = {
        pay: (a, b) => pay(b) - pay(a) || top(b) - top(a),
        chance: (a, b) => chance(b) - chance(a),
        place: (a, b) => where(a).localeCompare(where(b)),
        days: (a, b) => realDays(a, a.ranks[0]) - realDays(b, b.ranks[0]) || pay(b) - pay(a),
    };
    const cmp = by[JF.sort]; if (!cmp) return list;
    return list.map(job => ({ job, o: on(job) })).sort((x, y) => cmp(x.o, y.o)).map(x => x.job);
}
const jobSortChips = () => `<div class="mu-chips mu-jobs-sort"><small class="mu-muted">Sort by</small>${JOB_SORTS.map(([id, name]) => `<button class="mu-chip ${JF.sort === id ? 'is-on' : ''}" data-act="ph-jobs-sort" data-id="${esc(id)}">${esc(name)}</button>`).join('')}</div>`;
// Jobs in two views while you have a job: Your job (rank, pay, performance, promotion, your week) and Openings (the
// list, sorted as you pick). It opens on Your job, and on Openings again once you quit or before you're hired; a job
// taken or left (however: the list, a pick of track, the scene) starts it over.
const JV = { tab: '' as '' | 'mine' | 'openings', job: undefined as string | undefined };
// The other people with your job (or working at your place): their rank and their shifts this week, so you know who
// you'll be working with, the boss among them, and who you haven't met yet.
function coworkersHtml(g: Save, w: WorldDef, o: Occupation): string {
    if (!systemOn(w, 'jobs')) return '';
    const self = (g as any).swap?.avatar, boss = bossOf(g, w, o);
    const list = colleaguesOf(g, w, o).filter(r => r.avatar !== self && !(r as any).gone && npcJob(g, w, r));
    if (!list.length) return '';
    const row = (r: Resident) => {
        const job = npcJob(g, w, r)!, rank = rankName(g, w, r), week = colleagueWeekText(g, w, r);
        const what = [rank, job.id !== o.id ? job.name : ''].filter(Boolean).join(' · ');
        return `<div class="mu-ph-job mu-cowork"><img src="${esc(thumb(r.avatar))}" alt=""><span><b data-notr>${esc(r.name)}</b>${r === boss ? ' <em class="mu-cowork-boss">Boss</em>' : ''}${what ? `<small>${esc(what)}</small>` : ''}
            <small class="mu-muted">${week ? esc(week) : 'No shifts this week'}</small>${r.met ? '' : '<small class="mu-muted">Not met yet</small>'}</span></div>`;
    };
    return `<section class="mu-workweek mu-coworkers"><h4>${icon('users')} Coworkers</h4>${list.map(row).join('')}</section>`;
}
function jobsApp(g: Save, w: WorldDef) {
    const j = g.player.job; const mine = myJob(g, w);   // the job you hold, on your track
    if (JV.job !== j?.id) { JV.job = j?.id; JV.tab = ''; }
    const view = mine && j ? (JV.tab || 'mine') : 'openings';
    const openings = openJobs(g, w).filter(o => o.id !== j?.id);
    const p = mine && j ? promoNeeds(g, w, mine) : null;
    const where = (o: Occupation) => (offScreen(w, o) ? 'off-screen' : placeOf(g, w, mine && o.id === mine.id ? jobPlace(g, o) : o.place)?.name ?? '');
    const sched = systemOn(w, 'jobs');
    // (job tracks) the track you work it on, and the days still to wait before the first shift
    const track = mine?.track !== undefined ? mine.trackName ?? trackName(w, mine, mine.track) : '';
    const wait = j && (j as any).start > g.day ? (j as any).start - g.day : 0;
    const free = !!mine && isFreelance(g, w);   // (photography) a freelancer works brief by brief: no shifts, a retainer
    const booked = !!mine && !free && bookedJob(g, w, mine);   // (adult industry) worked title by title: the offers are in Take
    const per = (k: number) => (k === 1 ? 'about 1 offer a week' : `about ${k} offers a week`);
    const tabs = mine && j ? `<nav class="mu-pf-tabs mu-jb-tabs"><button class="${view === 'mine' ? 'is-on' : ''}" data-act="ph-jobs-view" data-v="mine" aria-pressed="${view === 'mine'}">${T('yourJob')}</button>
        <button class="${view === 'openings' ? 'is-on' : ''}" data-act="ph-jobs-view" data-v="openings" aria-pressed="${view === 'openings'}">${T('openings')} <small>${openings.length}</small></button></nav>` : '';
    // your job, all it says (and your week)
    const mineHtml = () => (mine && j ? `<section class="mu-ph-card"><h4>${T('yourJob')}</h4><b>${esc(rankOf(g, mine).name)}</b><small>${esc(mine.name)}${track ? ` · ${esc(track)}` : ''} · ${esc(where(mine))}${(j.path ?? []).length ? ` · ${esc(pathNames(mine, j.path!))}` : ''}</small>
            <small>${free ? esc(`${money(w, retainerNow(g, w))} a week with a delivery`) : booked ? esc(`About ${money(w, titleFee(g, w, '', ''))} a title · ${per(offersAWeek(g, w))}`) : `${money(w, payOf(g, hourlyPay(g, w, mine)))}/h · ${mine.shift} h shifts · ${esc(weekText(g, w, mine))}`} · rank ${j.rank + 1} of ${careerOf(g, mine).ranks.length + (careerOf(g, mine).open ? 1 : 0)}</small>
            ${free ? `<small>Your briefs are in Lens.</small>${shownApps(w).some(a => a.id === 'photos') ? '<button class="mu-ghost" data-act="ph-go" data-app="photos">Open Lens</button>' : ''}` : ''}
            ${booked ? `<small>${directing(g, w) ? 'You work title by title: your briefs are in Take.' : 'You work title by title: your offers are in Take.'}</small>${shownApps(w).some(a => a.id === 'take') ? '<button class="mu-ghost" data-act="ph-go" data-app="take">Open Take</button>' : ''}` : ''}
            ${wait ? `<small class="mu-good">${booked ? `Your first offers come in ${wait} ${wait === 1 ? 'day' : 'days'}.` : `Your first shift is in ${wait} ${wait === 1 ? 'day' : 'days'}.`}</small>` : ''}
            ${sched ? `<small>Performance: ${perfOf(g)} (${perfWord(perfOf(g))})</small>${bar(perfOf(g))}` : ''}
            ${p ? `<small>Next rank: ${esc(p.rank.name)}</small>${bar(promoProgress(p))}${p.missing.length ? `<small class="mu-muted">Still needs: ${p.missing.map(m => `<span>${esc(m)}</span>`).join(', ')}</small>` : ''}` : pendingBranch(g, mine) ? '' : '<small>Top rank.</small>'}
            ${branchPicker(g, w, mine)}
            ${jobCourseHtml(g, w, mine.id)}
            ${likes(g, mine).length ? `<small>Your traits help: ${esc(likes(g, mine).join(', '))}</small>` : ''}
            <button class="mu-danger" data-act="ph-quit">Quit</button></section>
            ${workWeekHtml(g, w)}${coworkersHtml(g, w, mine)}` : '');
    // an opening, all it says, with Apply
    const card = (job: Occupation) => { const o = trackOf(g, job), picks = needsPick(g, job) ? openTracks(g, w, job) : [], fee = feeOf(g, w, job), days = waitDays(g, job), byTitle = bookedJob(g, w, job);
            const hours = o.shift || 8;   // (adult industry) a title pays the rank's pay for a shift's hours
            return `<div class="mu-ph-job"><span><b>${esc(o.name)}</b><small>${esc(where(o))} · ${byTitle ? `${money(w, payOf(g, o.ranks[0].pay * hours))}–${money(w, payOf(g, o.ranks.at(-1)!.pay * hours))} a title · offers in Take, no shifts` : `${money(w, payOf(g, o.ranks[0].pay))}–${money(w, payOf(g, o.ranks.at(-1)!.pay))}/h${sched ? ` · ${realDays(o, o.ranks[0])} days a week` : ''}`}</small>
            ${picks.length > 1 ? `<small>${esc(picks.length === 2 ? 'Two tracks' : `${picks.length} tracks`)}: ${esc(picks.map(t => trackName(w, job, t)).join(' or '))} (you choose when hired)</small>` : o.track !== undefined && o.trackName ? `<small>Your track: ${esc(o.trackName)}</small>` : ''}
            ${fee ? `<small>A fee of ${money(w, fee)} when you start</small>` : ''}${days ? `<small>${byTitle ? `First offers ${days} ${days === 1 ? 'day' : 'days'} after signing` : `First shift ${days} ${days === 1 ? 'day' : 'days'} after signing`}</small>` : ''}
            ${missingCourses(g, w, o).length ? `<small class="mu-bad">${T('needsCourse')}: ${esc(missingCourses(g, w, o).join(', '))}</small>` : ((o as any).courses ?? []).length ? `<small class="mu-good">${((o as any).courses as string[]).some(id => isTaking(g, id)) ? 'You can start while you study for it' : T('courseDone')}</small>` : ''}
            ${o.needs?.length ? `<small class="${o.needs.some(t => traitsOf(g).includes(t)) ? 'mu-good' : ''}">Looks for: ${esc(o.needs.join(' / '))}${o.needs.some(t => traitsOf(g).includes(t)) ? ' ✓' : ''}</small>` : ''}
            ${hobbyNeed(g, w, o) ? `<small class="${hobbyFits(g, w, o) ? 'mu-good' : 'mu-bad'}">Needs: ${esc(hobbyNeed(g, w, o))}${hobbyFits(g, w, o) ? ' ✓' : ''}</small>` : ''}
            ${missingCourses(g, w, o).length ? '' : `${interviewHelp(g, w, o)}${interviewChance(g, o, traitsOf(g)) ? `<small>Interview: ${interviewChance(g, o, traitsOf(g))}% chance${triedToday(g, o.id, o, traitsOf(g)) ? ` · try again ${retryText(g, o.id, o, traitsOf(g))}` : ''}</small>` : '<small class="mu-bad">Interview: out of your reach for now</small>'}`}</span>
            <button data-act="ph-apply" data-id="${esc(o.id)}" ${missingCourses(g, w, o).length || triedToday(g, o.id, o, traitsOf(g)) || !interviewChance(g, o, traitsOf(g)) ? 'aria-disabled="true"' : ''}>${T('jobApply')}</button></div>`;  };
    const sorted = sortedOpenings(g, w, openings);
    return `${hd('jobs')}<div class="mu-ph-body">${tabs}
        ${view !== 'mine' ? '' : mineHtml()}
        ${view !== 'openings' ? '' : `${mine && j ? '' : `<p class="mu-muted">${T('noJob')}</p><h4>${T('openings')}</h4>`}
        ${openings.length > 1 ? jobSortChips() : ''}
        <div class="mu-ph-jobs">${sorted.map(card).join('')}</div>`}
    </div>`;
}
// Your money: the balance, the bills to pay (in the world's Bank; sim/bills.ts billsApp), the last week in and out,
// and the statement.
function bankApp(g: Save, w: WorldDef) {
    const since = nowAbs(g) - 7 * 1440, week = ledger(g).filter(e => e.at >= since);
    const got = week.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0), spent = week.filter(e => e.amount < 0).reduce((a, e) => a - e.amount, 0);
    return `${head(appName('bank'), 'home')}<div class="mu-ph-body">
        <section class="mu-ph-card mu-ph-balance"><small>${T('balance')}</small><b>${money(w, g.player.money)}</b>
            ${week.length ? `<small class="mu-ph-week">${esc('Last 7 days')}: <span class="mu-good">+${money(w, got)}</span> · <span class="mu-bad">−${money(w, spent)}</span></small>` : ''}</section>
        ${billsApp(w) === 'bank' ? billsHtml(g, w) : ''}
        <h4>${T('statement')}</h4>
        <div class="mu-ph-ledger">${ledger(g).map(e => `<div><span>${esc(e.text)}<small>${day(g, e.at)}</small></span><b class="${e.amount < 0 ? 'mu-bad' : 'mu-good'}">${e.amount < 0 ? '−' : '+'}${money(w, Math.abs(e.amount))}</b></div>`).join('') || `<p class="mu-muted">${T('noMovements')}</p>`}</div>
    </div>`;
}

// The bills: a tile each (pay it, part of it, or get back in), moving somewhere cheaper when you're locked out, and
// Pay everything. In the Bank, or in Homes in a world without a Bank.
function billsHtml(g: Save, w: WorldDef): string {
    if (!billList(w).some(b => billAmount(g, w, b.id))) return '';
    const billBtn = (b: ReturnType<typeof billList>[number]) => {
        const amount = billAmount(g, w, b.id); if (!amount) return '';
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
    return `<section class="mu-ph-bills"><h4>${esc('Bills')}</h4><div class="mu-bills">${billList(w).map(billBtn).join('')}</div>
        ${cheaper && cheaper.rent < toGetBackIn(g, w, 'rent') ? `<p class="mu-bad">${esc(`Or move somewhere cheaper: ${cheaper.name}, ${money(w, cheaper.rent)} a week, paid one week in advance.`)}</p>${billsApp(w) === 'bank' ? `<button class="mu-ghost" data-act="ph-homes-rent">${icon('home')}<span>${esc(appName('homes'))}</span></button>` : ''}` : ''}
        <small class="mu-muted">${T('billsNote')}</small>
        ${billList(w).filter(b => billAmount(g, w, b.id) && owed(g, b.id)).length > 1 ? `<button class="mu-primary" data-act="ph-bill-all">${icon('wallet')}<span>Pay everything</span></button>` : ''}</section>`;
}

const HF = { city: '' };   // Homes: the city whose homes are shown ('' all)
const HV = { tab: 'mine' as 'mine' | 'rent' | 'sale' };   // Homes: the tab shown
// (Homes, with a Bank) what your home costs a week, and the way to pay: the Bank, marked when something is due.
function billsLine(g: Save, w: WorldDef): string {
    const list = billList(w).filter(b => billAmount(g, w, b.id)); if (!list.length) return '';
    const due = list.some(b => owed(g, b.id));
    return `<button class="mu-ph-billsline ${due ? 'is-due' : ''}" data-act="ph-go" data-app="bank"><span>${esc(T('billsLine', list.map(b => `${billName(w, b.id)} ${money(w, billAmount(g, w, b.id))}`).join(' · '), appRef(w, 'bank')))}</span>${due ? `<b class="mu-bad">${esc('Due now')}</b>` : ''}${icon('forward')}</button>`;
}
// Unfolded (`wide`), like Messages: your home and the tabs as a list on the left (how many homes are for rent), the
// open tab (or a house's rooms) on the right.
function homesApp(g: Save, w: WorldDef, wide = false) {
    const pic = (kind: string) => { const im = w.homes.kinds[kind]?.image; return im ? `style="background-image:url('${safeUrl(worldFile(w, im))}')"` : ''; };
    const mine = w.homes.zones.find(z => z.id === g.player.home.zone);
    // (housing) a house of yours' rooms and fixtures, in place of the rest
    const rooms = HU.rooms ? roomsHtml(g, w) : '';
    if (rooms && !wide) return `${head(appName('homes'), 'home')}<div class="mu-ph-body mu-homes">${rooms}</div>${askHtml(g, w)}`;
    // in tabs: your home (and what you own or let), homes for rent, homes and studios for sale (when there are any)
    const sale = forSaleHtml(g, w);
    const tabs: [typeof HV.tab, string][] = [['mine', T('myHome')], ['rent', 'For rent'], ...(sale.trim() ? [['sale', 'For sale'] as [typeof HV.tab, string]] : [])];
    const tab = tabs.some(t => t[0] === HV.tab) ? HV.tab : 'mine';
    const nav = `<nav class="mu-pf-tabs mu-hm-tabs">${tabs.map(([id, name]) => `<button class="${id === tab ? 'is-on' : ''}" data-act="ph-homes-tab" data-v="${id}" aria-pressed="${id === tab}">${esc(name)}</button>`).join('')}</nav>`;
    const content = `${tab !== 'mine' ? '' : `<section><h4>${T('myHome')}</h4>
        <article class="mu-home-card is-mine"><span class="mu-home-pic" ${pic(g.player.home.kind ?? mine?.kind ?? '')}></span>
            <div class="mu-home-info"><span><b>${esc(homeAddress(w, g.player.home))}</b><small>${esc(w.homes.kinds[g.player.home.kind ?? mine?.kind ?? '']?.name ?? '')} · ${T('yourHome')}</small></span></div></article>
        ${billsApp(w) === 'homes' ? billsHtml(g, w) : billsLine(g, w)}
        ${ownedHtml(g, w)}
        </section>
        ${letHtml(g, w)}`}
        ${tab === 'sale' ? sale : ''}
        ${tab !== 'rent' ? '' : `<section><h4>${T('homesForRent')}</h4>
        ${(() => { // by city (map): the one you live in first
            const cities = [...new Set(w.homes.zones.filter(z => z.id !== g.player.home.zone).map(z => z.map))].map(id => w.maps.find(m => m.id === id)).filter(Boolean) as { id: string; name: string }[];
            if (cities.length < 2) return '';
            if (HF.city && !cities.some(c => c.id === HF.city)) HF.city = '';
            return `<div class="mu-chips mu-homes-cities"><button class="mu-chip ${HF.city ? '' : 'is-on'}" data-act="ph-homes-city" data-id="">All</button>${cities.map(c => `<button class="mu-chip ${HF.city === c.id ? 'is-on' : ''}" data-act="ph-homes-city" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>`; })()}
        <div class="mu-home-grid">${w.homes.zones.filter(z => z.id !== g.player.home.zone && !buyOnly(z) && (!HF.city || z.map === HF.city)).map(z => {   // (homes you can only buy aren't for rent)
            const free = freeSpots(g, w, z.id).length, student = studentLink.homeBlock(g, w, z.id);   // (a student: student homes only)
            const rent = priceOf(g, z.rent), bills = priceOf(g, billsOf(w, z.kind));
            return `<article class="mu-home-card"><span class="mu-home-pic" ${pic(z.kind)}></span>
                <div class="mu-home-info"><span><b>${esc(z.name)}</b><small>${esc(w.homes.kinds[z.kind]?.name ?? z.kind)} · ${money(w, rent)}/wk${bills ? ` + ${money(w, bills)} bills` : ''} · ${free} free</small></span>
                <button class="mu-home-move" data-act="ph-move" data-id="${esc(z.id)}" ${free && g.player.money >= rent && !student ? '' : 'aria-disabled="true"'} ${student ? 'title="Not while you study for a degree"' : ''}>Move</button></div></article>`;
        }).join('')}</div>
        ${w.homes.zones.some(z => studentLink.homeBlock(g, w, z.id)) ? `<p class="mu-bad">${esc(w.homes.zones.map(z => studentLink.homeBlock(g, w, z.id)).find(Boolean)!)}</p>` : ''}
        <p class="mu-muted">${T('movingNote')}</p></section>`}`;
    if (wide) {
        const forRent = w.homes.zones.filter(z => z.id !== g.player.home.zone && !buyOnly(z)).length;
        const sub: Record<string, string> = { mine: homeAddress(w, g.player.home), rent: plural(forRent, '1 home', '{0} homes'), sale: '' };
        const rows = tabs.map(([id, name]) => { const on = id === tab && !rooms; return `<button class="mu-hm-row ${on ? 'is-on' : ''}" data-act="ph-homes-tab" data-v="${id}" aria-pressed="${on}"><b>${esc(name)}</b>${sub[id] ? `<small>${esc(sub[id])}</small>` : ''}</button>`; }).join('');
        return `${head(appName('homes'), 'home')}<div class="mu-ph-split mu-hm-split"><div class="mu-ph-pane is-list" data-keep="hm-pane-list"><div class="mu-ph-body mu-homes">
                <article class="mu-home-card is-mine"><span class="mu-home-pic" ${pic(g.player.home.kind ?? mine?.kind ?? '')}></span></article><nav class="mu-hm-rows">${rows}</nav></div></div>
            <div class="mu-ph-pane is-open" data-keep="hm-pane-${rooms ? 'rooms' : tab}"><div class="mu-ph-body mu-homes">${rooms || content}</div></div></div>${askHtml(g, w)}`;
    }
    return `${head(appName('homes'), 'home')}<div class="mu-ph-body mu-homes">${nav}
        ${content}
    </div>${askHtml(g, w)}`;
}
const plural = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('{0}', String(k)));
Object.assign(ACT, {
    'ph-refer': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; const r = askReferral(g, w, el.dataset.who!); if (r.text) toast(r.text, r.ok ? 'success' : 'info'); saveGame(); notify(); },
    'ph-path': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; const m = choosePath(g, w, el.dataset.id!); if (m) toast(m, 'success'); saveGame(); notify(); },
    'ph-bill': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; const before = g.player.money; const msg = payBill(g, w, el.dataset.id as BillId); if (g.player.money < before) { toast(msg || 'Paid.', 'success'); saveGame(); } else toast(msg, 'warn'); notify(); },
    // the rent first, then the other bills, each as far as the money goes (part payments included)
    'ph-bill-all': () => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const start = g.player.money; let said = '', failed = '';
        for (const b of billList(w)) if (owed(g, b.id)) { const before = g.player.money, m = payBill(g, w, b.id); if (g.player.money < before) said ||= m; else failed ||= m; }
        if (g.player.money < start) { if (said) toast(said, 'success'); saveGame(); } else if (failed) toast(failed, 'warn');
        notify();
    },
    'ph-homes-city': (el) => { HF.city = el.dataset.id ?? ''; notify(); },
    // (unfolded, the tabs sit beside a house's rooms: picking one leaves them; folded, the rooms hide the tabs)
    'ph-homes-tab': (el) => { HV.tab = (el.dataset.v as typeof HV.tab) || 'mine'; if (isWide()) HU.rooms = ''; notify(); },
    'ph-homes-rent': () => { HV.tab = 'rent'; openApp('homes'); },   // (Money's "move somewhere cheaper")
    'ph-people-filter': (el) => { PEOPLE.filter = (el.dataset.v as PeopleFilter) || 'all'; notify(); },
    'ph-jobs-sort': (el) => { JF.sort = el.dataset.id ?? ''; notify(); },
    'ph-jobs-view': (el) => { JV.tab = el.dataset.v === 'openings' ? 'openings' : 'mine'; notify(); },
    'ph-open-homes': () => { P.open = true; P.app = 'homes'; notify(); },
    'ph-open-bills': () => { const g = game(); const w = g && getWorld(g.world); P.open = true; P.app = w ? billsApp(w) : 'homes'; notify(); },   // (the HUD's "Locked out")
    'ph-open-campus': () => { P.open = true; P.app = 'campus'; notify(); },
    'ph-open-business': () => { P.open = true; P.app = 'business'; notify(); },
    'ph-open-shop': () => { P.open = true; P.app = 'shop'; SH.tab = 'here'; notify(); },   // (the HUD's "Shop here")
    'ph-open-collection': (el) => {   // (the HUD's "Museum pieces": the Collection app on Here)
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        P.open = true; P.app = 'collection'; openCollection(g, w); CL.hall = el.dataset.v ?? ''; CL.open = new Set(); CL.seeded = ''; CL.group = ''; CL.slot = ''; saveGame(); notify();
    },
});

/* ---------- Spark: the dating app ---------- */

function chips(list: string[], on: string[], act: string) {
    return `<div class="mu-chips">${list.map(x => `<button class="mu-chip ${on.includes(x) ? 'is-on' : ''}" data-act="${esc(act)}" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
}
// The genders whose profiles Spark shows: your pick, else the ones you're drawn to (what it showed before there was a pick).
const shownGenders = (g: Save, w: WorldDef): string[] => dating(g).profile.show ?? gendersOf(w).filter(x => (relOf(g).people[YOU]?.att?.[x.id]?.r ?? 1) > 0).map(x => x.id);
function showChips(g: Save, w: WorldDef) {
    const on = shownGenders(g, w);
    return `<div class="mu-chips">${gendersOf(w).map(x => `<button class="mu-chip ${on.includes(x.id) ? 'is-on' : ''}" data-act="sp-show" data-v="${esc(x.id)}">${esc(x.plural ? x.plural.charAt(0).toUpperCase() + x.plural.slice(1) : x.name)}</button>`).join('')}</div>`;
}
function datingProfileApp(g: Save, w: WorldDef) {
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
// Unfolded (`wide`), like Messages: your profile and your matches as a list on the left, the profile you're looking at
// (or "It's a match!") on the right.
function datingApp(g: Save, w: WorldDef, wide = false) {
    const d = dating(g);
    if (!d.profile.ready) return datingProfileApp(g, w);
    const side = (right: string, key: string) => sparkWide(g, w, right, key);
    if (P.matched) {
        const r = g.cast[P.matched];
        const match = `<div class="mu-sp-match"><h2>${T('matchTitle')}</h2>
            <div class="mu-sp-pair"><img src="${esc(personaThumb())}" alt=""><img src="${esc(thumb(P.matched))}" alt=""></div>
            <p>${esc(T('matchLine', r?.name ?? ''))}</p>
            <button class="mu-primary" data-act="ph-thread" data-who="${esc(P.matched)}">${icon(LETTERS ? 'send' : 'chat')}<span>${T('sendMessage')}</span></button>
            <button data-act="sp-next">${T('nextSuitor')}</button></div>`;
        return wide ? side(match, `match-${P.matched}`) : `${head(appName('dating'), 'home')}${match}`;
    }
    const list = candidates(g, w);
    const r = list[0];
    const top = `<div class="mu-ph-head">${backBtn('home')}<b>${appName('dating')}</b>
        <span class="mu-row"><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="matches" aria-label="${T('matches')}" title="${T('matches')}">${icon('chat')}</button><button class="mu-ibtn mu-ghost" data-act="ph-go" data-app="dprofile" aria-label="${T('yourProfile')}" title="${T('yourProfile')}">${icon('user')}</button></span></div>`;
    if (!r) return wide ? side(`<p class="mu-muted mu-pad">${T('noCandidates')}</p>`, 'none') : `${top}<p class="mu-muted mu-pad">${T('noCandidates')}</p>`;
    const p = theirProfile(g, w, r), interests = p.interests;
    if (p.pending) writeProfile(g, w, r).then(ok => { if (ok) saveGame(); notify(); }).catch(() => { /* the AI may be offline */ });
    const shared = interests.filter(i => d.profile.interests.includes(i)), both = sharedLikes(g, r.avatar).slice(0, 2);   // (adult) likes in bed you share
    const photos = profilePhotos(g, w, r);
    wantSprites(w, photos);
    // A profile read top to bottom: the first picture with who they are, what they wrote, then their other pictures
    // between their answers, the way dating apps lay one out. The first picture is one of them: places without them
    // (someone who keeps their face off the app) come after their portrait.
    const lead = photos[0]?.who?.length ? photos[0] : null, more = lead ? photos.slice(1) : photos;
    const pic = (i: number) => (more[i - 1] ? `<div class="mu-sp-photo">${photoPic(g, w, more[i - 1])}</div>` : '');
    const answer = (i: number) => (p.prompts[i] ? `<div class="mu-sp-prompt"><small>${esc(p.prompts[i].q)}</small><p data-notr>${esc(p.prompts[i].a)}</p></div>` : '');
    const hero = `<div class="mu-sp-hero">${lead ? photoPic(g, w, lead) : `<img src="${esc(thumb(r.avatar))}" alt="">`}
            <div class="mu-sp-info"><h3><span data-notr>${esc(r.name)}</span>${Number.isFinite(p.age) ? `<span class="mu-sp-age">, ${Math.round(p.age!)}</span>` : ''}</h3><small>${esc(p.looking)}</small></div>
            ${photos.length > 1 ? `<span class="mu-sp-count">${icon('image')}${photos.length}</span>` : ''}</div>`;
    const bio = p.bio ? `<div class="mu-sp-bio">${BOOK ? '<small>The matchmaker says</small>' : ''}<p data-notr>${esc(p.bio)}</p></div>`
        : p.pending ? `<div class="mu-sp-bio is-pending" aria-label="Writing…"><i></i><i></i><i></i></div>` : '';
    const likes = `<div class="mu-sp-likes"><div class="mu-chips">${interests.map(i => `<span class="mu-chip ${shared.includes(i) ? 'is-on' : ''}">${esc(i)}</span>`).join('')}</div>
            ${both.length ? `<small class="mu-sp-both">${icon('flame')}<span>In bed, you both like:</span> <span data-notr>${esc(both.join(', '))}</span></small>` : ''}</div>`;
    const rest = more.slice(2).map((_, i) => pic(i + 3) + answer(i + 2)).join('') + (more.length <= 2 ? answer(2) : '');
    const card = `<div class="mu-sp-card" data-keep="sp-${esc(r.avatar)}">${hero}${bio}${pic(1)}${answer(0)}${likes}${pic(2)}${answer(1)}${rest}</div>
        <div class="mu-sp-btns"><button class="mu-sp-no" data-act="sp-swipe" data-who="${esc(r.avatar)}" data-like="0" aria-label="${T('pass')}" title="${T('pass')}">${icon('x')}</button>
            <button class="mu-sp-yes" data-act="sp-swipe" data-who="${esc(r.avatar)}" data-like="1" aria-label="${T('like')}" title="${T('like')}">${icon('heart')}</button></div>`;
    return wide ? side(card, `p-${r.avatar}`) : `${top}${card}`;
}
// Spark unfolded: your profile (to edit it) and your matches on the left, `right` on the right (its key changes with
// what it shows, so each opens at its top).
function sparkWide(g: Save, w: WorldDef, right: string, key: string): string {
    const d = dating(g), n = waitingCount(g);
    const me = `<button class="mu-sp-me" data-act="ph-go" data-app="dprofile"><img src="${esc(personaThumb())}" alt=""><span><b data-notr>${esc(personaName())}</b><small>${T('yourProfile')}</small></span>${icon('forward')}</button>`;
    const matches = d.matches.length ? d.matches.map(a => `<button class="mu-ph-row" data-act="ph-thread" data-who="${esc(a)}"><img src="${esc(thumb(a))}" alt=""><span><b data-notr>${esc(g.cast[a]?.name ?? '')}</b><small>${bondLabel(g, a)}</small></span></button>`).join('')
        : `<p class="mu-muted">${T('noMatches')}</p>`;
    return `${head(appName('dating'), 'home')}<div class="mu-ph-split mu-sp-split"><div class="mu-ph-pane is-list" data-keep="sp-pane-list"><div class="mu-ph-body">${me}
            <h4>${T('matches')} <small>${d.matches.length}</small></h4>${n ? `<small class="mu-muted">${esc(n === 1 ? 'One like is waiting for an answer.' : `${n} likes are waiting for an answer.`)}</small>` : ''}<div class="mu-ph-list">${matches}</div></div></div>
        <div class="mu-ph-pane is-open mu-sp-pane" data-keep="sp-pane-${esc(key)}">${right}</div></div>`;
}
function matchesApp(g: Save) {
    const d = dating(g);
    const n = waitingCount(g);
    return `${head(T('matches'), 'dating')}${n ? `<p class="mu-muted mu-pad">${esc(n === 1 ? 'One like is waiting for an answer.' : `${n} likes are waiting for an answer.`)}</p>` : ''}<div class="mu-ph-list">${d.matches.length ? d.matches.map(a => `<button class="mu-ph-row" data-act="ph-thread" data-who="${esc(a)}"><img src="${esc(thumb(a))}" alt=""><span><b data-notr>${esc(g.cast[a]?.name ?? '')}</b><small>${bondLabel(g, a)}</small></span></button>`).join('') : `<p class="mu-muted mu-pad">${T('noMatches')}</p>`}</div>`;
}

// The clock calls this: in "characters post on their own" mode, new posts every few game hours.
let autoBusy = false;
export function feedTick() {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || autoBusy || !w.features?.phone || !systemOn(w, 'social') || !shouldPost(g, 'auto')) return;
    autoBusy = true;
    generatePosts(g, w, 2).then(n => { if (n) { saveGame(); notify(); } }).catch(() => { /* the AI may be offline */ }).finally(() => { autoBusy = false; });
}

// The answers to messages read later (sim/texting.ts), once they're free: run after the clock moves (ui/plans.ts's
// runPlans). One at a time, so two answers never write over each other.
let laterBusy = false;
export async function laterTick() {
    const g = game(); const w = g && getWorld(g.world);
    if (!g || !w || laterBusy) return;
    const due = dueLater(g); if (!due.length) return;
    laterBusy = true;
    try {
        for (const who of due) {
            if (await textBack(g, w, who).catch(() => '') && !(P.open && P.app === 'thread' && P.who === who)) {
                social(g).unread[who] = (social(g).unread[who] ?? 0) + 1;
                toast(lex(w, 'newMessage', g.cast[who]?.name ?? ''), 'info');
            }
        }
    } finally { laterBusy = false; saveGame(); notify(); }
}

export function phoneHtml(): string {
    const g = game(); const w = g && getWorld(g.world);
    if (!P.open || !g || !w) { turn.opened = 0; NAV.last = null; return ''; }
    BOOK = deviceLook(w) === 'book'; LETTERS = messageKind(w) === 'letters'; LW = w;
    trackView();
    const wide = !BOOK && isWide(), pair = wide ? PAIRS[P.app] : undefined;
    let body = pair ? pairHtml(g, w, pair) : P.app === 'messages' ? messagesApp(g) : P.app === 'thread' ? threadApp(g) : P.app === 'people' ? peopleApp(g) : P.app === 'person' ? personApp(g, w)
        : P.app === 'jobs' ? jobsApp(g, w) : P.app === 'bank' ? bankApp(g, w) : P.app === 'homes' ? homesApp(g, w, wide)
        : P.app === 'news' ? newsApp(g, w, head(esc(lex(w, 'news')), 'messages')) : P.app === 'dating' ? datingApp(g, w, wide) : P.app === 'dprofile' ? datingProfileApp(g, w) : P.app === 'matches' ? matchesApp(g) : P.app === 'plans' ? calendarApp(g, w, head(appName('plans'), 'home')) : P.app === 'journal' ? journalApp(g, w, head(appName('journal'), 'home')) : P.app === 'shop' ? shopApp(g, w, head(appName('shop'), 'home'), wide) : P.app === 'goals' ? goalsApp(g, w, hd('goals'), wide) : P.app === 'collection' ? collectionApp(g, w, hd('collection'), wide) : P.app === 'photos' ? lensApp(g, w, hd('photos'), wide) : P.app === 'take' ? takeApp(g, w, hd('take'), wide) : P.app === 'campus' ? campusApp(g, w, hd('campus')) : P.app === 'business' ? businessApp(g, w, hd('business')) : P.app === 'sheet' ? sheetApp(g, w, hd('sheet')) : P.app === 'quests' ? questsApp(g, w, hd('quests')) : P.app === 'grimoire' ? grimoireApp(g, w, head(appName('grimoire'), 'home')) : P.app === 'party' ? partyApp(g, w, hd('party')) : P.app === 'standing' ? standingApp(g, w, hd('standing')) : P.app === 'pets' ? petsApp(g, w, hd('pets')) : P.app === 'factions' ? factionsApp(g, w, hd('factions')) : P.app === 'assets' ? holdingsApp(g, w, head(appName('assets'), 'home')) : P.app === 'tower' ? towerApp(g, w, hd('tower')) : P.app === 'contracts' ? contractsApp(g, w, hd('contracts')) : P.app === 'workshop' ? workshopApp(g, w, head(appName('workshop'), 'home')) : P.app === 'trophies' ? trophiesApp(g, w, hd('trophies')) : P.app === 'blade' ? bladeApp(g, w, hd('blade')) : P.app === 'soulbond' ? soulApp(g, w, hd('soulbond')) : P.app === 'health' ? healthApp(g, w, head(appName('health'), 'home')) : P.app === 'settings' ? settingsApp() : P.app === 'profile' ? profileApp(g, w, hd('profile', T('profile')), wide, repTab(g, w)) : BOOK ? bookFront(g, w) : homeApp(g, w);
    if (BOOK) return bookHtml(g, w, body);
    const side = sideSection(w, P.app);
    if (side) body = sideHtml(g, w, side, body);
    const unread = phoneUnread();
    // data-keep: the phone keeps its identity when the screen is redrawn (a dialog opening right before it is never
    // taken for it, which rebuilt the phone and replayed its slide-in). The screen's key changes with the app, so an app
    // opens at its top instead of where the last one was scrolled to.
    // No frame around the screen: the status bar holds the time and the buttons (unfold, close), the bar at the bottom
    // goes to the home screen.
    const bg = wallpaper();
    return `<div class="mu-phone ${P.closing ? 'is-closing' : ''} ${wide ? 'is-wide' : ''} ${bg ? 'has-bg' : ''}" data-keep="phone" role="dialog" aria-label="Phone" style="${bg ? `--ph-bg:${esc(cssUrl(bg))}` : ''}"><div class="mu-ph-status">
            <span class="mu-ph-left"><b>${hm(g.minutes)}</b>${unread ? `<i class="mu-ph-notif" title="${unread}">${icon('chat')}</i>` : ''}</span>
            <span class="mu-ph-right">${SIGNAL}<span class="mu-ph-batt"><i><b></b></i></span>
                <button class="mu-ph-sbtn mu-ph-fold" data-act="ph-fold" aria-pressed="${wide}" aria-label="${wide ? 'Fold the phone' : 'Unfold the phone'}" title="${wide ? 'Fold the phone' : 'Unfold the phone'}">${icon(wide ? 'fold' : 'unfold')}</button>
                <button class="mu-ph-sbtn" data-act="ph-close" aria-label="${esc(T('closeDevice'))}" title="${esc(T('closeDevice'))}">${icon('x')}</button></span></div>
        <div class="mu-ph-screen" data-keep="ph-screen-${esc(pair ?? P.app)}">${body}</div>
        <button class="mu-ph-homebar" data-act="ph-homebar" aria-label="${P.app === 'home' ? esc(T('closeDevice')) : 'Home screen'}" title="${P.app === 'home' ? esc(T('closeDevice')) : 'Home screen'}"></button></div>`;
}
/* ---------- the medieval journal: an open book, contents on the left, the chosen section on the right ---------- */

const RIBBONS = [10, 20, 30, 40, 50, 60, 70, 80];   // cloth bookmarks along the right edge (top of each, in % of the book's height)
const TURN_MS = 650;
const turn = { app: '' as string, at: 0, back: false, opened: 0 };
const OPEN_MS = 350;
// Which section a view belongs to, so moving inside one (a thread inside Letters) does not turn the page.
const sectionOf = (a: App): string => (a === 'thread' ? 'messages' : a === 'person' ? 'people' : a === 'news' ? 'messages' : a === 'dprofile' || a === 'matches' ? 'dating' : sectionFor(a)?.id ?? a);

function bookHtml(g: Save, w: WorldDef, body: string): string {
    const apps = APPS(w);
    const sec = sectionOf(P.app);
    const order = (id: string) => (id === 'home' ? -1 : apps.findIndex(a => a[4] === id));
    if (turn.app && turn.app !== sec) { turn.back = order(sec) < order(turn.app); turn.at = Date.now(); }
    turn.app = sec;
    if (!turn.opened) { turn.opened = Date.now(); turn.at = 0; }
    const o = Date.now() - turn.opened;
    const opening = o < OPEN_MS ? ` is-opening" style="--open-delay:-${o}ms` : '';
    // A turn keeps going across re-renders (the clock re-draws the screen every few seconds).
    const t = Date.now() - turn.at;
    const leaf = t < TURN_MS ? `<i class="mu-bk-leaf ${turn.back ? 'is-back' : ''}" style="animation-delay:-${t}ms"></i>` : '';
    const badge = (id: string, key = id) => tileBadge(g, w, id, key);
    const left = `<header class="mu-bk-title"><small>${esc(w.features?.device ?? 'Journal')}</small><b data-notr>${esc(personaName())}</b>
            <span>${esc(weekday(g.day))} · Day ${g.day + 1} · ${hm(g.minutes % 1440)}</span><span class="mu-bk-purse">${icon('wallet')}${money(w, g.player.money)}</span></header>
        <h4 class="mu-bk-h">Contents</h4>
        <ol class="mu-bk-toc">${apps.map(([id, name, ic, , key]) => `<li><button class="${sec === key ? 'is-here' : ''}" data-act="ph-go" data-nav="root" data-app="${esc(id)}">${icon(ic)}<span>${esc(name)}</span><i></i>${badge(id, key)}</button></li>`).join('')}
            <li><button data-act="ph-help">${icon('help')}<span>${esc(T('help'))}</span><i></i></button></li></ol>`;
    return `<div class="mu-bk-wrap${opening}" data-act="bk-bg"><div class="mu-book ${P.app === 'home' ? 'is-home' : ''}" role="dialog" aria-label="${esc(w.features?.device ?? 'Journal')}">
        <div class="mu-bk-page is-left" data-keep="bk-left">${left}</div>
        <div class="mu-bk-page is-right mu-ph-screen ${t < TURN_MS ? 'is-turning' : ''}" data-keep="ph-screen" style="--turn-delay:-${Math.min(t, TURN_MS)}ms">${body}</div>
        ${leaf}
        <nav class="mu-bk-ribbons">${apps.slice(0, RIBBONS.length).map(([id, name, ic, , key], i) => `<button class="mu-bk-ribbon ${sec === id ? 'is-here' : ''}" style="top:${RIBBONS[i]}%" data-act="ph-go" data-nav="root" data-app="${esc(id)}" title="${esc(name)}">${icon(ic)}<span>${esc(name)}</span>${badge(id, key)}</button>`).join('')}</nav>
        <button class="mu-bk-close" data-act="ph-close" aria-label="Close the journal" title="Close">${icon('x')}</button>
    </div></div>`;
}
// The journal's first page: who you are meeting soon.
function bookFront(g: Save, w: WorldDef) {
    const next = upcoming(g).slice(0, 5);
    return `<div class="mu-bk-front"><h3>Days to come</h3>
        ${next.length ? `<ul class="mu-bk-list">${next.map(a => `<li><b data-notr>${esc(g.cast[a.avatar]?.name ?? '')}</b><span>${esc(whenText(g, a.from))}${a.place ? ` · ${esc(placeOf(g, w, a.place)?.name ?? '')}` : ''}</span></li>`).join('')}</ul>`
            : '<p class="mu-muted">Nothing written for the days to come. Send a letter to arrange a meeting.</p>'}
        <p class="mu-bk-flourish">❦</p></div>`;
}

export const phoneUnread = () => { const g = game(); return g ? Object.values(social(g).unread).reduce((a, b) => a + b, 0) : 0; };

Object.assign(ACT, {
    phone: () => { if (P.open) return closePhone(); P.open = true; resetToday(); if (P.app === 'thread' && !P.who) P.app = 'home'; notify(); },
    'ph-close': () => closePhone(),
    'ph-help': () => openHelp(),
    'bk-bg': (el, e) => { if (e.target === el) { P.open = false; notify(); } },
    // data-nav="root": opened from the home screen or the journal's contents, so Back goes home from there
    'ph-go': (el) => { if (el.dataset.nav === 'root') NAV.mode = 'root'; openApp(el.dataset.app as App); },
    // the bar at the bottom: the home screen, or from it, the phone closes (like going home twice)
    'ph-homebar': () => { if (P.app === 'home') { closePhone(); return; } NAV.mode = 'root'; openApp('home'); },
    'ph-back': (el) => {
        if (innerBack()) { notify(); return; }
        const v = NAV.stack.pop();
        NAV.mode = 'back';
        if (v) P.who = v.who || P.who;
        openApp(v?.app ?? ((el.dataset.app as App) || 'home'));
    },
    'ph-fold': () => { (settings() as any).phoneWide = !(settings() as any).phoneWide; saveSettings(); notify(); },
    // Spark
    'sp-look': (el) => { const g = game(); if (!g) return; const l = dating(g).profile.looking; const v = el.dataset.v!; const i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.push(v); notify(); },
    'sp-int': (el) => { const g = game(); if (!g) return; const l = dating(g).profile.interests; const v = el.dataset.v!; const i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.length < 5 && l.push(v); notify(); },
    'sp-save': () => { const g = game(); if (!g) return; const d = dating(g); if (!d.profile.looking.length) { toast('Choose what you are looking for.', 'info'); return; } d.profile.ready = true; P.app = 'dating'; saveGame(); notify(); },
    'sp-show': (el) => { const g = game(); const w = g && getWorld(g.world); if (!g || !w) return; const l = [...shownGenders(g, w)]; const v = el.dataset.v!; const i = l.indexOf(v); i >= 0 ? l.splice(i, 1) : l.push(v); dating(g).profile.show = l; notify(); },
    'sp-swipe': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        const like = el.dataset.like === '1';
        swipe(g, w, el.dataset.who!, like);   // the answer comes in a few days (sim/feed.ts)
        if (like) toast("Liked. If they like you back, you'll hear within a few days.", 'info');
        saveGame(); notify();
    },
    'sp-next': () => { P.matched = ''; notify(); },
    'ph-quick': async (el) => { P.draft = await translateTo(el.dataset.text ?? ''); ACT['ph-send']?.(el, new Event('click')); },
    'ph-thread': (el) => { if (el.dataset.nav === 'swap') NAV.mode = 'swap'; P.who = el.dataset.who!; P.app = 'thread'; P.draft = ''; notify(); },
    'ph-person': (el) => { if (el.dataset.nav === 'swap') NAV.mode = 'swap'; if (el.dataset.who !== P.who) PP.more = false; if (el.dataset.tab) PP.tab = 'about'; P.who = el.dataset.who!; P.app = 'person'; notify(); },
    'ph-send': async () => {
        const g = game(); const w = g && getWorld(g.world);
        const text = P.draft.trim(); const who = P.who;
        if (!g || !w || !text || !who || P.typing || !g.cast[who]) return;
        P.draft = '';
        try {
            // the answer to a friend's question: what it means is judged, and they decide
            if (askingFrom(g, who)) { P.typing = who; notify(); await answerAdvice(g, w, who, text); }
            else {
                textOut(g, who, text); P.typing = who; notify();
                // asking to meet: the plan rules answer; else they answer now, or later when they're free
                const away = awayNow(g, w, g.cast[who]);
                if (await askByText(g, w, who, text)) { /* answered, with the plan's toast */ }
                else if (away) answerLater(g, w, who, away);
                else if (!await textBack(g, w, who)) toast('No answer (is the AI connected?).', 'warn');
            }
            const last = social(g).threads[who]?.at(-1);
            if (last && !last.me && !(P.open && P.app === 'thread' && P.who === who)) { social(g).unread[who] = (social(g).unread[who] ?? 0) + 1; toast(lex(getWorld(g.world), 'newMessage', g.cast[who]?.name ?? ''), 'info'); }
        } catch (e: any) { toast(String(e?.message ?? e), 'error'); }
        P.typing = ''; saveGame(); notify();
    },
    // a heart on their message, the first time: a little friendship, or (bad news, a worry, an apology…) a little
    // lost and their answer. Taking it back undoes nothing; giving it again does nothing more.
    'ph-heart': async (el) => {
        const g = game(); const w = g && getWorld(g.world); const who = P.who;
        const m = g && social(g).threads[who]?.[Number(el.dataset.i)];
        if (!g || !w || !m || m.me || LETTERS || !g.cast[who]) return;
        m.heart = !m.heart; saveGame(); notify();
        if (!m.heart || m.liked) return;
        m.liked = true;
        m.tone ??= await heartTone(g, g.cast[who], m.text);
        if (m.tone === 'ok') { addBond(g, who, HEART.ok); saveGame(); notify(); return; }
        P.typing = who; notify();
        try { await heartBackfired(g, w, who, m.text); } catch { /* the AI may be offline: the friendship moved anyway */ }
        P.typing = '';
        if (!(P.open && P.app === 'thread' && P.who === who)) { social(g).unread[who] = (social(g).unread[who] ?? 0) + 1; toast(lex(w, 'newMessage', g.cast[who]?.name ?? ''), 'info'); }
        saveGame(); notify();
    },
    'ph-partner': () => {
        const g = game(); if (!g) return;
        if (!quickCouple(g, P.who)) return;
        setStatus(g, P.who, YOU, 'dating');
        note(g, '{u} and {0} became a couple.', [g.cast[P.who]?.name ?? ''], [P.who], g.player.loc, 'love');
        feel(g, P.who, 'In love', 7);
        toast(`${g.cast[P.who]?.name} said yes!`, 'success'); saveGame(); notify();
    },
    'ph-apply': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        if (g.player.job) { toast('Quit your current job first.', 'info'); return; }
        const r = hire(g, w, el.dataset.id!);
        if (r.pick) { askTrack(el.dataset.id!, r.pick); return; }   // (job tracks) pick yours first
        toast(r.text, r.ok ? 'success' : 'warn'); saveGame(); notify();
    },
    'ph-quit': () => { const g = game(); if (!g) return; quitJob(g, getWorld(g.world) ?? undefined); toast('You quit your job.', 'info'); saveGame(); notify(); },
    'ph-move': (el) => {
        const g = game(); const w = g && getWorld(g.world); if (!g || !w) return;
        if (askLeave(g, w, el.dataset.id!)) return;   // (a home you own: sell it, or keep it as the second, first)
        const err = moveTo(g, w, el.dataset.id!);
        if (err) { toast(err, 'warn'); return; }
        toast(`You moved to ${homeAddress(w, g.player.home)}.`, 'success'); saveGame(); notify();
    },
});
Object.assign(INPUT, {
    'ph-draft': (el) => { P.draft = el.value; },
    'ph-q': (el) => { P.q = el.value; notify(); },
    'sp-bio': (el) => { const g = game(); if (g) dating(g).profile.bio = el.value; },
});
