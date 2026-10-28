import { seasonDays, SEASONS } from './time.js';
// From the clearest to the wettest: one day's draw falls on the same side of every climate's table, so a rainy day in
// the city is a rainy day in the hills too.
export const WEATHER_KINDS = [
    { id: 'sunny', icon: '☀️', name: 'Sunny', rain: false },
    { id: 'hot', icon: '🌡️', name: 'Hot', rain: false },
    { id: 'fair', icon: '🌤️', name: 'Fair', rain: false },
    { id: 'humid', icon: '🌫️', name: 'Hot and humid', rain: false },
    { id: 'partly', icon: '⛅', name: 'Partly cloudy', rain: false },
    { id: 'cloudy', icon: '☁️', name: 'Cloudy', rain: false },
    { id: 'snow', icon: '🌨️', name: 'Snow', rain: false, snow: true },
    { id: 'rain', icon: '🌧️', name: 'Rain', rain: true },
    { id: 'heavyrain', icon: '⛈️', name: 'Heavy rain', rain: true },
    { id: 'storm', icon: '🌀', name: 'Storm', rain: true },
];
const kind = (id) => WEATHER_KINDS.find(k => k.id === id);
// A clear sky: what a view of something far away needs.
export const CLEAR = ['sunny', 'hot', 'fair'];
// The day's draw, 0..1 (only the length of the seed counts: every region of a world shares it, unless it has a weather
// of its own).
const unit = (seed, day) => Math.abs(Math.sin(day * 12.9898 + (seed.length * 7.1)) * 43758.5453) % 1;
const H = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
} return (h >>> 0) / 4294967296; };
// The one table for worlds without climates (and their old odds).
const OLD = ['sunny', 'fair', 'partly', 'cloudy', 'rain'];
export function weatherOn(world, day) {
    const h = unit(world, day);
    return { ...kind(OLD[h < .3 ? 0 : h < .55 ? 1 : h < .75 ? 2 : h < .9 ? 3 : 4]) };
}
export function weatherOf(g) {
    const wx = weatherOn(g.world, g.day);
    const night = g.minutes < 330 || g.minutes >= 1170;
    return { ...wx, icon: night && !wx.rain ? '🌙' : wx.icon };
}
/* ---------- climates (E2) ---------- */
const seasonAt = (g, day) => SEASONS[Math.floor((Math.max(1, day) - 1) / seasonDays(g)) % 4].id;
const daySeason = (g, day) => ((Math.max(1, day) - 1) % seasonDays(g)) + 1;
// The climate of a map: its own `climate`, else the map it sits in; only a climate the world gives a table counts.
export function climateOf(w, mapId) {
    if (!w?.climates)
        return null;
    let m = w.maps.find(x => x.id === mapId);
    for (let i = 0; m && i < 6; i++) {
        if (m.climate)
            return w.climates[m.climate] ?? null;
        m = w.maps.find(x => x.id === m.parent);
    }
    return null;
}
// The odds that day: a stretch of the season with odds of its own (days as written, like festivals), else the season's.
function oddsOn(g, c, day) {
    const s = seasonAt(g, day), d = daySeason(g, day);
    return c.days?.find(x => x.season === s && d >= x.from && d <= x.to)?.odds ?? c.seasons?.[s] ?? null;
}
// A kind in the climate's own words (storm → Typhoon).
const named = (c, k) => (c.names?.[k.id] ? { ...k, name: c.names[k.id] } : { ...k });
/** The weather on a map that day: from its climate's odds, or the world's one table. */
export function skyOn(g, w, mapId, day) {
    const map = w?.maps.find(m => m.id === mapId);
    const seed = map?.ownWeather ? `${g.world}:${map.id}` : g.world;
    const c = climateOf(w, mapId), odds = c && oddsOn(g, c, day);
    if (!c || !odds)
        return weatherOn(seed, day);
    const list = WEATHER_KINDS.filter(k => (odds[k.id] ?? 0) > 0);
    const total = list.reduce((a, k) => a + odds[k.id], 0);
    if (!total)
        return weatherOn(seed, day);
    let x = unit(seed, day) * total;
    for (const k of list) {
        x -= odds[k.id];
        if (x < 0)
            return named(c, k);
    }
    return named(c, list[list.length - 1]);
}
/** The world's weather that day (its first map's: the city, for a world of districts). */
export const worldWeather = (g, w, day) => (climateOf(w, w?.maps[0]?.id) ? skyOn(g, w, w.maps[0].id, day) : weatherOn(g.world, day));
/* ---------- weather a region has on its own (E2) ---------- */
// The kinds a world's climates draw on their own (fujiview, gas…), and the two the world format names.
export const REGIONAL = ['fujiview', 'gas'];
export const isRegional = (w, v) => REGIONAL.includes(v) || Object.values(w?.climates ?? {}).some(c => !!c.regional?.[v]);
// A view is gone once the haze of the day builds up (earlier in summer), and it needs daylight.
const VIEW_FROM = 6 * 60;
const VIEW_UNTIL = { winter: 17 * 60, autumn: 15 * 60, spring: 12 * 60, summer: 10 * 60 };
/** Whether a region has that weather of its own that day (and at that minute of the day, for a view): one draw a day for
 *  the whole world, against each climate's odds for the season, so places agree. A view (a kind ending in "view": a
 *  far mountain) also needs a clear sky there, from 6:00 until the haze builds up (17:00 in winter, 10:00 in summer). */
export function regionalOn(g, w, v, mapId, day, minutes) {
    const s = seasonAt(g, day);
    const p = climateOf(w, mapId)?.regional?.[v]?.[s] ?? 0;
    if (!(p > 0) || H(`${g.world}|${v}|${day}`) >= p)
        return false;
    if (!v.endsWith('view'))
        return true;
    if (!CLEAR.includes(skyOn(g, w, mapId, day).id))
        return false;
    return minutes === undefined || (minutes >= VIEW_FROM && minutes < VIEW_UNTIL[s]);
}
/** Whether the weather is `v`: a kind by its id (`storm`), by a word of its name (`rain` is also heavy rain, `cloudy`
 *  also partly cloudy, `typhoon` a storm named so), or weather of the region's own (`fujiview`). */
export function weatherMatches(wx, v) {
    const s = v.toLowerCase();
    return wx.id === s || wx.name.toLowerCase().includes(s) || !!WEATHER_KINDS.find(k => k.id === wx.id)?.name.toLowerCase().includes(s);
}
