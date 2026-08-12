/* ============================================================
   Dispatch — local-first personal feed, shaped like a calendar.
   All logic runs in your browser; nothing is stored on a server.
   ============================================================ */
'use strict';

/* ---------------- Small utilities ---------------- */

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripHtml(html) {
  const t = document.createElement('div');
  t.innerHTML = html || '';
  return (t.textContent || '').replace(/\s+/g, ' ').trim();
}

function truncate(s, n) {
  s = String(s || '').trim();
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, '') + '…';
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; }
}

function isSubstackHostname(host) {
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  return h.endsWith('.substack.com') && h !== 'substack.com';
}

function isSubstackSource(source) {
  if (!source) return false;
  const platform = String(source.platform || '').toLowerCase();
  return platform === 'substack' ||
    isSubstackHostname(hostOf(source.url)) ||
    isSubstackHostname(hostOf(source.feedUrl));
}

function isYouTubeHost(host) {
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  return h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be';
}

function isYouTubeShortUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return isYouTubeHost(u.hostname) && /\/shorts(?:\/|$)/i.test(u.pathname);
  } catch (e) {
    return /(?:youtube\.com|youtu\.be)\/shorts(?:\/|$)/i.test(String(value || ''));
  }
}

function hasYouTubeShortMarker(value) {
  return /(?:^|[\s([{-])#shorts?(?=$|[\s)\]}.,!?])/i.test(String(value || ''));
}

/* ---------------- Dates (device-local days) ---------------- */

const DAY_MS = 86400000;

function todayMidnight() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fromDayKey(k) { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd); }

function navTitle(d) {
  // The bubbles already carry the precise DD/MM date; keep the native
  // navigation title quiet and readable with only the weekday.
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = 60000, h = 3600000, d = 86400000;
  if (diff < 0) return 'just now';
  if (diff < 60 * m) return 'just now';
  if (diff < h) return Math.max(1, Math.round(diff / m)) + 'm ago';
  if (diff < 24 * h) return Math.round(diff / h) + 'h ago';
  if (diff < 7 * d) return Math.round(diff / d) + 'd ago';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDuration(sec) {
  if (!sec && sec !== 0) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

/* ---------------- SVG glyphs (monochrome SF-style) ---------------- */

const ICONS = {
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.2 9.2l4.6 2.8-4.6 2.8z" fill="currentColor"/></svg>',
  podcast: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 12a4 4 0 0 1 8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.5 12a1.5 1.5 0 0 1 3 0v3a1.5 1.5 0 0 1-3 0z" fill="currentColor"/></svg>',
  text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M5 10h14M5 15h9M5 19h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  xmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const KIND_META = {
  article: { label: 'Text', icon: ICONS.text },
  youtube: { label: 'Video', icon: ICONS.play },
  podcast: { label: 'Podcast', icon: ICONS.podcast },
  link: { label: 'Link', icon: ICONS.link },
};

/* ---------------- State ---------------- */

const state = {
  day: todayMidnight(),
  sources: [],
  items: [],
  db: null,
  fetching: false,
  fetchingSourceIds: new Set(),
  stripRange: null, // { start: Date, end: Date }
  // Only the active rolling window is held in memory. IndexedDB remains the
  // durable archive, so moving beyond the window never loses a saved item.
  dayCache: new Map(),
  dayRange: null,
  dayLoadPromise: null,
  dayLoadKey: null,
  dayLoadToken: 0,
  renderedDayKey: null,
  // Keep the first network pass visually quiet: cached content should settle
  // before later refreshes are allowed to animate list displacement.
  startupRefreshActive: true,
  // Background refresh is deliberately separate from foreground gestures:
  // it keeps the cache warm without holding the UI or showing a spinner.
  backgroundRefreshing: false,
  backgroundRefreshPromise: null,
  backgroundRefreshTimer: null,
  // A source can be touched by the initial hydrator, an automatic refresh,
  // or a source-list action. Keep both the single fetch and the retrying
  // refresh operation deduplicated so those paths never race each other.
  sourceFetchPromises: new Map(),
  sourceRefreshPromises: new Map(),
};

const STALE_OPEN_MS = 12 * 3600000;
const STALE_IDLE_MS = 24 * 3600000;
const SOURCE_SNAPSHOT_KEY = 'dispatch.source-snapshot.v1';
const REFRESH_MAX_ATTEMPTS = 3;
const REFRESH_RETRY_DELAYS_MS = [0, 900, 2500];
const REFRESH_CONCURRENCY = 3;
// Keep the cache warm while the app is open, but do this after the first
// paint and only revalidate sources that have become old enough.
const BACKGROUND_REFRESH_DELAY_MS = 450;
const BACKGROUND_REFRESH_INTERVAL_MS = 15 * 60000;
const BACKGROUND_REFRESH_MAX_AGE_MS = 30 * 60000;

// Keep the recent week and today ready on first launch. The window slides one
// day at a time as the selected date moves; future dates are never loaded.
const DAY_PRELOAD_BACK = 7;
const DAY_BUFFER = 0;
const DAY_CACHE_RETENTION = 0;

// Media is warmed through the browser cache only. Nothing is copied into
// IndexedDB, and the bounded queue prevents a large archive from becoming a
// large startup download.
const MEDIA_PRELOAD_CONCURRENCY = 3;
const MEDIA_PRELOAD_MAX = 64;
const MEDIA_PRELOAD_DELAY_MS = 120;

const sheetEl = () => $('#sheet');
const sourcesScreenEl = () => $('#sources-screen');

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function motionDelay(ms) {
  return prefersReducedMotion() ? 0 : ms;
}

function syncAppInert() {
  const app = $('#app');
  const sources = sourcesScreenEl();
  const sheetOpen = !sheetEl().hidden;
  const sourcesOpen = !sources.hidden;
  const blocked = sheetOpen || sourcesOpen;

  if (app) {
    app.inert = blocked;
    if (blocked) app.setAttribute('inert', '');
    else app.removeAttribute('inert');
  }

  // A sheet opened from the Sources screen is a modal above that screen too.
  // Keep the underlying list out of the focus order until the sheet closes.
  sources.inert = sheetOpen;
  if (sheetOpen) sources.setAttribute('inert', '');
  else sources.removeAttribute('inert');
}

/* ---------------- IndexedDB ---------------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('dispatch', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('sources')) {
        const s = db.createObjectStore('sources', { keyPath: 'id', autoIncrement: true });
        s.createIndex('feedUrl', 'feedUrl', { unique: true });
      }
      if (!db.objectStoreNames.contains('items')) {
        const it = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        it.createIndex('day', 'day');
        it.createIndex('sourceId', 'sourceId');
        it.createIndex('guid', ['sourceId', 'guid'], { unique: true });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbReq(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

async function storeGetAll(store) {
  const tx = state.db.transaction(store, 'readonly');
  return idbReq(tx.objectStore(store).getAll());
}
async function storeGetByDayRange(startKey, endKey) {
  const tx = state.db.transaction('items', 'readonly');
  const index = tx.objectStore('items').index('day');
  return idbReq(index.getAll(IDBKeyRange.bound(startKey, endKey)));
}
async function storeGetBySourceId(sourceId) {
  const tx = state.db.transaction('items', 'readonly');
  return idbReq(tx.objectStore('items').index('sourceId').getAll(IDBKeyRange.only(sourceId)));
}
async function storePut(store, value) {
  const tx = state.db.transaction(store, 'readwrite');
  const req = tx.objectStore(store).put(value);
  await idbReq(req);
  return new Promise((res, rej) => { tx.oncomplete = () => res(req.result); tx.onerror = () => rej(tx.error); });
}
async function storeBulkPut(store, values) {
  if (!values.length) return;
  const tx = state.db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

// IndexedDB is the primary store. Keep a small source-only manifest in
// localStorage as a recovery path if the browser evicts the database while
// the installed app is kept on the desktop. Items are intentionally not
// duplicated here; the feed can rebuild them from these URLs.
function persistSourceSnapshot() {
  try {
    localStorage.setItem(SOURCE_SNAPSHOT_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      sources: state.sources.map((source) => Object.assign({}, source)),
    }));
  } catch (e) { /* storage may be unavailable or full */ }
}

function readSourceSnapshot() {
  try {
    const raw = localStorage.getItem(SOURCE_SNAPSHOT_KEY);
    if (!raw) return [];
    const snapshot = JSON.parse(raw);
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.sources)) return [];
    return snapshot.sources.filter((source) => source && source.feedUrl);
  } catch (e) {
    return [];
  }
}

async function restoreSourcesFromSnapshot() {
  const saved = readSourceSnapshot();
  if (!saved.length) return [];
  const restored = [];
  for (const savedSource of saved) {
    const source = Object.assign({}, savedSource, { lastFetchedAt: null, lastError: null });
    try {
      await storePut('sources', source);
      restored.push(source);
    } catch (e) { /* skip a malformed source and restore the rest */ }
  }
  return restored;
}
async function storeDelete(store, key) {
  const tx = state.db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function deleteSourceCascade(sourceId) {
  const tx = state.db.transaction(['sources', 'items'], 'readwrite');
  tx.objectStore('sources').delete(sourceId);
  const idx = tx.objectStore('items').index('sourceId');
  const req = idx.openKeyCursor(IDBKeyRange.only(sourceId));
  req.onsuccess = () => {
    const cur = req.result;
    if (cur) { tx.objectStore('items').delete(cur.primaryKey); cur.continue(); }
  };
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function deleteItemsForSource(sourceId) {
  const tx = state.db.transaction('items', 'readwrite');
  const idx = tx.objectStore('items').index('sourceId');
  const req = idx.openKeyCursor(IDBKeyRange.only(sourceId));
  req.onsuccess = () => {
    const cur = req.result;
    if (cur) { tx.objectStore('items').delete(cur.primaryKey); cur.continue(); }
  };
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

async function deleteItemsByIds(ids) {
  if (!ids.length) return;
  const tx = state.db.transaction('items', 'readwrite');
  const os = tx.objectStore('items');
  for (const id of ids) os.delete(id);
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

/* ---------------- Rolling day cache ---------------- */

function dayKeysBetween(start, end) {
  const keys = [];
  for (let d = addDays(start, 0); d <= end; d = addDays(d, 1)) keys.push(dayKey(d));
  return keys;
}

function flattenDayCache() {
  state.items = [];
  for (const items of state.dayCache.values()) state.items.push(...items);
}

function itemIdentity(item) {
  if (!item) return '';
  return String(item.sourceId == null ? '' : item.sourceId) + '\u0000' +
    String(item.guid || item.link || item.id || '');
}

function itemDataSignature(item) {
  return JSON.stringify([
    itemIdentity(item),
    item.day || '',
    item.publishedAt || '',
    item.title || '',
    item.author || '',
    item.summary || '',
    item.link || '',
    item.audioUrl || '',
    item.imageUrl || '',
    item.duration || '',
    item.kind || '',
    !!item.youtubeShort,
  ]);
}

function dayItemsEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const previous = new Map(left.map((item) => [itemIdentity(item), itemDataSignature(item)]));
  return right.every((item) => previous.get(itemIdentity(item)) === itemDataSignature(item));
}

function mergeDayItems(previous, next) {
  const merged = previous.slice();
  const indexes = new Map(merged.map((item, index) => [itemIdentity(item), index]));
  for (const item of next) {
    const identity = itemIdentity(item);
    const index = indexes.get(identity);
    if (index == null) {
      indexes.set(identity, merged.length);
      merged.push(item);
    } else {
      merged[index] = item;
    }
  }
  return merged;
}

let dayCacheSyncPromise = null;
let dayCacheSyncQueued = false;
let dayCacheSyncRemoveMissing = false;

function syncLoadedDayCache(removeMissing = false) {
  if (!state.db || !state.dayRange) return Promise.resolve(false);
  dayCacheSyncRemoveMissing = dayCacheSyncRemoveMissing || removeMissing;
  dayCacheSyncQueued = true;
  if (dayCacheSyncPromise) return dayCacheSyncPromise;

  const run = (async () => {
    let changedAny = false;
    do {
      dayCacheSyncQueued = false;
      const removeMissing = dayCacheSyncRemoveMissing;
      dayCacheSyncRemoveMissing = false;
      const range = { start: state.dayRange.start, end: state.dayRange.end };
      let rows;
      try {
        rows = await storeGetByDayRange(range.start, range.end);
      } catch (e) {
        return changedAny;
      }

      // Navigation can replace the active window while this read is in
      // flight. Re-run against the new range instead of mixing the two.
      if (!state.dayRange ||
          state.dayRange.start !== range.start ||
          state.dayRange.end !== range.end) {
        dayCacheSyncQueued = true;
        continue;
      }

      const grouped = new Map();
      for (const row of rows) {
        if (!grouped.has(row.day)) grouped.set(row.day, []);
        grouped.get(row.day).push(row);
      }

      let changed = false;
      for (const key of dayKeysBetween(fromDayKey(range.start), fromDayKey(range.end))) {
        const previous = state.dayCache.get(key);
        if (previous === undefined) continue;
        const next = grouped.get(key) || [];
        const reconciled = removeMissing ? next : mergeDayItems(previous, next);
        if (!dayItemsEqual(previous, reconciled)) {
          state.dayCache.set(key, reconciled);
          changed = true;
        }
      }

      if (changed) {
        flattenDayCache();
        renderDayIncremental();
        scheduleMediaPreload();
        changedAny = true;
      }
    } while (dayCacheSyncQueued);
    return changedAny;
  })();

  dayCacheSyncPromise = run;
  void run.then(
    () => {
      if (dayCacheSyncPromise !== run) return;
      dayCacheSyncPromise = null;
      if (dayCacheSyncQueued) void syncLoadedDayCache();
    },
    () => {
      if (dayCacheSyncPromise !== run) return;
      dayCacheSyncPromise = null;
      dayCacheSyncQueued = false;
    }
  );
  return run;
}

async function loadDayWindow(center, token, options = {}) {
  if (!state.db) return;

  const safeCenter = center > todayMidnight() ? todayMidnight() : center;
  const preloadBack = Math.max(0, Number(options.preloadBack ?? DAY_PRELOAD_BACK) || 0);
  const preloadForward = Math.max(
    0,
    Math.min(DAY_BUFFER, Number(options.preloadForward ?? DAY_BUFFER) || 0)
  );
  const start = addDays(safeCenter, -preloadBack);
  const end = addDays(safeCenter, preloadForward);
  const wanted = dayKeysBetween(start, end);
  const missing = wanted.filter((key) => !state.dayCache.has(key));

  if (missing.length) {
    const rows = await storeGetByDayRange(missing[0], missing[missing.length - 1]);
    // A refresh may have invalidated this read while it was in flight.
    if (token !== state.dayLoadToken) return;

    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.day)) grouped.set(row.day, []);
      grouped.get(row.day).push(row);
    }
    for (const key of missing) state.dayCache.set(key, grouped.get(key) || []);
  }

  if (token !== state.dayLoadToken) return;

  const keepStart = dayKey(addDays(start, -DAY_CACHE_RETENTION));
  const keepEnd = dayKey(addDays(end, DAY_CACHE_RETENTION));
  for (const key of state.dayCache.keys()) {
    if (key < keepStart || key > keepEnd) state.dayCache.delete(key);
  }
  state.dayRange = { start: dayKey(start), end: dayKey(end) };
  flattenDayCache();
  scheduleMediaPreload();
}

function requestDayWindow(center, renderWhenReady = true, options = {}) {
  const safeCenter = center > todayMidnight() ? todayMidnight() : center;
  const targetKey = dayKey(safeCenter);
  const preloadBack = Math.max(0, Number(options.preloadBack ?? DAY_PRELOAD_BACK) || 0);
  const preloadForward = Math.max(
    0,
    Math.min(DAY_BUFFER, Number(options.preloadForward ?? DAY_BUFFER) || 0)
  );
  const loadKey = targetKey + '|' + preloadBack + '|' + preloadForward;
  if (state.dayLoadPromise && state.dayLoadKey === loadKey) return state.dayLoadPromise;

  const token = ++state.dayLoadToken;
  state.dayLoadKey = loadKey;
  const promise = loadDayWindow(safeCenter, token, { preloadBack, preloadForward })
    .then(() => {
      if (renderWhenReady && token === state.dayLoadToken && dayKey(state.day) === targetKey) renderDay();
    })
    .catch(() => {
      // Keep navigation usable if IndexedDB is temporarily unavailable.
      if (token === state.dayLoadToken && !state.dayCache.has(targetKey)) {
        state.dayCache.set(targetKey, []);
        flattenDayCache();
        if (renderWhenReady && dayKey(state.day) === targetKey) renderDay();
      }
    });
  state.dayLoadPromise = promise;
  void promise.finally(() => {
    if (state.dayLoadPromise === promise) {
      state.dayLoadPromise = null;
      state.dayLoadKey = null;
    }
  });
  return promise;
}

let mediaPreloadTimer = null;

function mediaWarmDayKeys() {
  const keys = [dayKey(state.day)];
  for (let offset = 1; offset <= DAY_BUFFER; offset++) keys.push(dayKey(addDays(state.day, offset)));
  for (let offset = 1; offset <= DAY_PRELOAD_BACK; offset++) keys.push(dayKey(addDays(state.day, -offset)));
  return keys;
}

function mediaUrlsForWarmWindow() {
  const urls = [];
  const seen = new Set();
  for (const key of mediaWarmDayKeys()) {
    for (const item of state.dayCache.get(key) || []) {
      const url = String(item.imageUrl || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
      if (urls.length >= MEDIA_PRELOAD_MAX) return urls;
    }
  }
  return urls;
}

function preloadMediaUrl(url) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(); return; }
    let timer = null;
    let image;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
      resolve();
    };
    try {
      image = new Image();
      image.decoding = 'async';
      image.loading = 'eager';
      if ('fetchPriority' in image) image.fetchPriority = 'low';
      image.onload = finish;
      image.onerror = finish;
      timer = setTimeout(finish, 12000);
      image.src = url;
    } catch (e) {
      finish();
    }
  });
}

async function preloadDayMedia() {
  const urls = mediaUrlsForWarmWindow();
  if (!urls.length) return;
  await mapWithConcurrency(urls, MEDIA_PRELOAD_CONCURRENCY, preloadMediaUrl);
}

function scheduleMediaPreload() {
  if (mediaPreloadTimer) clearTimeout(mediaPreloadTimer);
  mediaPreloadTimer = setTimeout(() => {
    mediaPreloadTimer = null;
    void preloadDayMedia().catch(() => {});
  }, MEDIA_PRELOAD_DELAY_MS);
}

/* ---------------- Feed fetching (local, in-browser) ---------------- */

const PROXIES = [
  // cors.io returns a CORS-enabled JSON envelope and is currently the fast
  // path for both Substack feeds and YouTube channel pages.
  (u) => 'https://cors.io/?url=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  (u) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u),
];

async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 20000);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); }
  finally { clearTimeout(t); }
}

async function fetchText(url, options = {}) {
  const accept = typeof options.accept === 'function'
    ? options.accept
    : (value) => !!(value && value.trim());
  const accepts = (value) => {
    try { return !!accept(value); } catch (e) { return false; }
  };
  const headers = {
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.5',
  };
  try {
    const r = await fetchWithTimeout(url, { headers, redirect: 'follow' }, 8000);
    if (r.ok) {
      const text = await r.text();
      if (accepts(text)) return { text, via: 'direct' };
    }
  } catch (e) { /* CORS or network — fall through to proxies */ }

  for (let i = 0; i < PROXIES.length; i++) {
    try {
      const r = await fetchWithTimeout(PROXIES[i](url), { headers }, 10000);
      if (!r.ok) continue;
      const text = await r.text();
      if (!text || !text.trim()) continue;
      if (i === 0) {
        try {
          const envelope = JSON.parse(text);
          if (envelope && envelope.status >= 200 && envelope.status < 300 &&
              typeof envelope.body === 'string' && accepts(envelope.body)) {
            return { text: envelope.body, via: 'proxy' };
          }
        } catch (e) { /* not the cors.io envelope */ }
        continue;
      }
      if (i === PROXIES.length - 1) {
        try {
          const j = JSON.parse(text);
          if (j && typeof j.contents === 'string' && accepts(j.contents)) return { text: j.contents, via: 'proxy' };
        } catch (e) { /* not JSON */ }
        continue;
      }
      if (!/^\s*[{[]/.test(text) && accepts(text)) return { text, via: 'proxy' };
    } catch (e) { /* try next proxy */ }
  }
  throw new Error('Could not fetch this URL from the browser (blocked by CORS).');
}

function looksLikeFeed(text) {
  const t = String(text || '').replace(/^\uFEFF/, '').slice(0, 1200).toLowerCase();
  return /<\s*(?:rss|feed|rdf(?::rdf)?)\b/.test(t);
}

function isUsableFeedText(text) {
  if (!looksLikeFeed(text)) return false;
  if (typeof DOMParser === 'undefined') return true;
  try {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) return false;
    const rootName = String(doc.documentElement && doc.documentElement.tagName || '')
      .toLowerCase().split(':').pop();
    return rootName === 'rss' || rootName === 'feed' || rootName === 'rdf';
  } catch (e) {
    return false;
  }
}

async function fetchFeed(url) {
  const { text } = await fetchText(url, { accept: isUsableFeedText });
  return text;
}

/* ---------------- Feed parsing (RSS 2.0 + Atom + YouTube) ---------------- */

function localChildren(node, local) {
  const out = [];
  for (const c of node.children || []) {
    const ln = String(c.localName || c.tagName || '').toLowerCase().split(':').pop();
    if (ln === local.toLowerCase()) out.push(c);
  }
  return out;
}
function childText(node, locals) {
  for (const l of locals) {
    const c = localChildren(node, l)[0];
    if (c && c.textContent && c.textContent.trim()) return c.textContent.trim();
  }
  return '';
}
function childAttr(node, locals, attr) {
  for (const l of locals) {
    const c = localChildren(node, l)[0];
    if (c) {
      const v = c.getAttribute(attr);
      if (v && v.trim()) return v.trim();
    }
  }
  return '';
}

function childUrl(node, locals) {
  for (const l of locals) {
    const c = localChildren(node, l)[0];
    if (!c) continue;
    for (const attr of ['href', 'url', 'src']) {
      const v = c.getAttribute(attr);
      if (v && v.trim()) return v.trim();
    }
    const text = (c.textContent || '').trim();
    if (/^(?:https?:)?\/\//i.test(text)) return text;
  }
  return '';
}
function attrOf(node, names) {
  for (const n of names) {
    const v = node.getAttribute(n);
    if (v && v.trim()) return v.trim();
  }
  return '';
}

function firstImage(html) {
  if (!html) return '';
  const metaImage = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
  if (metaImage) return metaImage;

  // Prefer a real editorial image over a tracking pixel, avatar, or logo.
  const tags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of tags) {
    let src = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!src) src = (tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!src) src = (tag.match(/\bdata-lazy-src\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!src) src = (tag.match(/\bdata-original\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    if (!src) {
      const srcset = (tag.match(/\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
      const candidates = srcset.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean);
      src = candidates[candidates.length - 1] || '';
    }
    if (!src) {
      const attrs = (tag.match(/\bdata-attrs\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
      try { src = JSON.parse(attrs.replace(/&quot;/g, '"')).src || ''; } catch (e) { /* ignore malformed metadata */ }
    }
    if (!src || /^data:/i.test(src) || /\.svg(?:[?#]|$)/i.test(src)) continue;
    const width = Number((tag.match(/\bwidth=["']?(\d+)/i) || [])[1] || 0);
    const height = Number((tag.match(/\bheight=["']?(\d+)/i) || [])[1] || 0);
    if (width && height && (width < 180 || height < 120)) continue;
    if (/avatar|author|logo|icon/i.test(tag) && width && width < 500) continue;
    return src;
  }
  return '';
}

function parseDate(str) {
  if (!str) return null;
  const t = Date.parse(str);
  return isNaN(t) ? null : new Date(t);
}

function parseDuration(str) {
  if (!str) return null;
  str = String(str).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || null;
}

function parseFeed(text, feedUrl, options = {}) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse this feed.');
  const root = doc.documentElement;
  const rootName = String(root.tagName || '').toLowerCase().split(':').pop();

  let feedTitle = '', feedLink = '', feedIcon = '', feedGenerator = '';
  let feedAuthor = '', feedAuthorUrl = '', feedChannelId = '';
  const items = [];
  const pushItem = (item) => {
    if (!item) return;
    const youtubeLike = item.kind === 'youtube' || isYouTubeHost(hostOf(item.link));
    if (!options.includeYouTubeShorts && youtubeLike && item.youtubeShort) return;
    items.push(item);
  };

  if (rootName === 'rss' || rootName === 'rdf') {
    const channel = localChildren(root, 'channel')[0] || root;
    feedTitle = childText(channel, ['title']) || hostOf(feedUrl);
    feedLink = childText(channel, ['link']) || feedUrl;
    feedGenerator = childText(channel, ['generator']);
    const img = localChildren(channel, 'image')[0];
    if (img) feedIcon = childUrl(img, ['url']);
    feedIcon = feedIcon || childUrl(channel, ['image', 'icon', 'logo', 'thumbnail']);
    const entries = localChildren(channel, 'item');
    for (const it of entries) pushItem(parseRssItem(it));
  } else if (rootName === 'feed') {
    feedTitle = childText(root, ['title']) || hostOf(feedUrl);
    feedLink = childAttr(root, ['link'], 'href') || feedUrl;
    feedGenerator = childText(root, ['generator']);
    feedIcon = childUrl(root, ['icon', 'logo', 'image']);
    const author = localChildren(root, 'author')[0];
    feedAuthor = childText(author, ['name']);
    feedAuthorUrl = childUrl(author, ['uri', 'link']);
    feedChannelId = childText(root, ['channelId']);
    const entries = localChildren(root, 'entry');
    for (const it of entries) pushItem(parseAtomItem(it));
  } else {
    throw new Error('Unrecognized feed format.');
  }
  return { feedTitle, feedLink, feedIcon, feedGenerator, feedAuthor, feedAuthorUrl, feedChannelId, items };
}

function parseRssItem(it) {
  const title = childText(it, ['title']);
  const link = childText(it, ['link']) || childAttr(it, ['link'], 'href') || '';
  const guid = childText(it, ['guid']) || childText(it, ['id']) || link;
  const pub = parseDate(childText(it, ['pubDate', 'date', 'published']));
  const author = childText(it, ['creator', 'author']) || '';
  const descHtml = childText(it, ['description']);
  const contentHtml = childText(it, ['encoded', 'content']);
  const summary = truncate(stripHtml(descHtml || contentHtml), 340);
  const youtubeShort = isYouTubeShortUrl(link) || hasYouTubeShortMarker(title + ' ' + descHtml + ' ' + contentHtml);

  const enclosure = localChildren(it, 'enclosure')[0];
  const encUrl = enclosure ? enclosure.getAttribute('url') || '' : '';
  const encType = enclosure ? enclosure.getAttribute('type') || '' : '';

  const isAudio = /^audio\//.test(encType) || /\.(?:mp3|m4a|m4b|aac|ogg|oga|opus|wav)(?:[?#]|$)/i.test(encUrl);
  const isImage = /^image\//.test(encType);

  // media group / thumbnail / content
  const mediaGroup = localChildren(it, 'group')[0] || it;
  let thumb = childAttr(mediaGroup, ['thumbnail', 'content'], 'url') || childAttr(it, ['thumbnail', 'content'], 'url');
  if (!thumb && isImage) thumb = encUrl;
  const itemImage = childUrl(it, ['image']);
  const mediaDur = parseDuration(attrOf(mediaGroup, ['duration']) || attrOf(it, ['duration']));

  const itunesDur = parseDuration(childText(it, ['duration']));
  const duration = itunesDur || mediaDur || null;

  const kind = isAudio ? 'podcast' : 'article';
  const image = kind === 'podcast'
    ? (itemImage || thumb || firstImage(contentHtml || descHtml) || '')
    : (thumb || firstImage(contentHtml || descHtml) || '');

  return {
    guid: guid || (link + title),
    title: title || hostOf(link),
    link,
    audioUrl: isAudio ? encUrl : '',
    author,
    summary,
    imageUrl: image,
    duration,
    publishedAt: pub ? pub.toISOString() : null,
    kind,
    youtubeShort,
    raw: { videoId: childText(it, ['videoId']) || '' },
  };
}

function parseAtomItem(en) {
  const title = childText(en, ['title']);
  const link = childAttr(en, ['link'], 'href') || '';
  const guid = childText(en, ['id']) || childText(en, ['guid']) || link;
  const pub = parseDate(childText(en, ['published', 'updated', 'date']));
  const author = childText(en, ['name', 'author']) || '';

  const mediaGroup = localChildren(en, 'group')[0] || en;
  let thumb = childAttr(mediaGroup, ['thumbnail', 'content'], 'url');
  const mediaDur = parseDuration(attrOf(mediaGroup, ['duration']) || attrOf(en, ['duration']));
  const itemImage = childUrl(en, ['image']);

  const enclosure = localChildren(en, 'enclosure')[0];
  const encUrl = enclosure ? enclosure.getAttribute('url') || '' : '';
  const encType = enclosure ? enclosure.getAttribute('type') || '' : '';
  const isAudio = /^audio\//.test(encType) || /\.(?:mp3|m4a|m4b|aac|ogg|oga|opus|wav)(?:[?#]|$)/i.test(encUrl);

  const contentHtml = childText(en, ['summary', 'content']);
  const summary = truncate(stripHtml(contentHtml), 340);

  const videoId = childText(en, ['videoId']) ||
    (String(guid || '').match(/^yt:video:(.+)$/) || [])[1] || '';
  const isYouTube = !!(videoId || (link && /youtube\.com\/(?:watch|shorts)/i.test(link)));
  const youtubeShort = isYouTubeShortUrl(link) || hasYouTubeShortMarker(title + ' ' + contentHtml);

  const kind = isAudio ? 'podcast' : (isYouTube ? 'youtube' : 'article');
  const image = isYouTube
    ? (thumb || 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg')
    : (thumb || itemImage || firstImage(contentHtml) || '');

  return {
    guid: guid || (link + title),
    title: title || hostOf(link),
    link: isYouTube && videoId ? 'https://www.youtube.com/watch?v=' + videoId : link,
    audioUrl: isAudio ? encUrl : '',
    author,
    summary,
    imageUrl: image,
    duration: mediaDur || null,
    publishedAt: pub ? pub.toISOString() : null,
    kind,
    youtubeShort,
    raw: { videoId },
  };
}

/* ---------------- Source resolution ---------------- */

function normalizeUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) throw new Error('Enter a URL.');
  // Mobile share sheets sometimes include surrounding prose, markdown, or
  // punctuation. Keep the first real URL and discard only its wrapper text.
  const embedded = url.match(/https?:\/\/[^\s<>"'`]+/i);
  if (embedded) url = embedded[0];
  url = url.replace(/^<|>$/g, '').replace(/[),.;!?]+$/g, '');
  if (/^feed:\/\//i.test(url)) url = 'https://' + url.slice(7);
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function youtubeChannelIdFromUrl(u) {
  const m = u.pathname.match(/^\/channel\/(UC[\w-]{22})/i);
  return m ? m[1] : null;
}

function youtubeUserFromUrl(u) {
  const m = u.pathname.match(/^\/(?:@|user\/|c\/)([^/]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

function substackHandleFromProfileUrl(u) {
  if (!u || u.hostname.replace(/^www\./, '').toLowerCase() !== 'substack.com') return null;
  const m = u.pathname.match(/^\/@([^/]+)\/?$/i);
  if (!m) return null;
  const handle = decodeURIComponent(m[1]);
  return /^[a-z0-9][a-z0-9._-]*$/i.test(handle) ? handle : null;
}

async function youtubeChannelIdFromPage(handleUrl) {
  const { text } = await fetchText(handleUrl, { accept: youtubeChannelPageHasId });
  return youtubeChannelIdFromHtml(text);
}

function youtubeChannelIdFromHtml(html) {
  const text = String(html || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    .replace(/\\u0022/gi, '"')
    .replace(/\\"/g, '"');
  const patterns = [
    /["']?(?:channelId|externalId|browseId)["']?\s*:\s*["'](UC[\w-]{22})/i,
    /(?:itemprop|name)\s*=\s*["']channelId["'][^>]+content\s*=\s*["'](UC[\w-]{22})/i,
    /content\s*=\s*["'](UC[\w-]{22})["'][^>]+(?:itemprop|name)\s*=\s*["']channelId["']/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  const canonical = text.match(/<link\b[^>]+(?:rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]+href\s*=\s*["']([^"']+)["']|href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["'][^"']*canonical[^"']*["'])/i);
  if (canonical) {
    try { return youtubeChannelIdFromUrl(new URL(canonical[1] || canonical[2])); } catch (e) { /* keep looking */ }
  }
  return null;
}

function youtubeChannelPageHasId(html) {
  return !!youtubeChannelIdFromHtml(html);
}

function youtubeChannelIdFromFeedUrl(feedUrl) {
  const m = String(feedUrl || '').match(/[?&]channel_id=(UC[\w-]{22})/i);
  return m ? m[1] : null;
}

function normalizeYouTubeChannelId(value) {
  const m = String(value || '').match(/(UC[\w-]{22})/i);
  return m ? m[1] : null;
}

function youtubePlaylistId(channelId, prefix) {
  const id = normalizeYouTubeChannelId(channelId);
  return id ? prefix + id.slice(2) : '';
}

function youtubeVideosFeedUrl(channelId) {
  const playlistId = youtubePlaylistId(channelId, 'UULF');
  return playlistId ? 'https://www.youtube.com/feeds/videos.xml?playlist_id=' + playlistId : '';
}

function youtubeChannelFeedUrl(channelId) {
  const id = normalizeYouTubeChannelId(channelId);
  return id ? 'https://www.youtube.com/feeds/videos.xml?channel_id=' + id : '';
}

function youtubeShortsFeedUrl(channelId) {
  const playlistId = youtubePlaylistId(channelId, 'UUSH');
  return playlistId ? 'https://www.youtube.com/feeds/videos.xml?playlist_id=' + playlistId : '';
}

function isYouTubeVideosFeedUrl(feedUrl) {
  return /[?&]playlist_id=UULF[\w-]+/i.test(String(feedUrl || ''));
}

function isYouTubeSource(source) {
  return !!source && (String(source.platform || '').toLowerCase() === 'youtube' || source.type === 'youtube');
}

function youtubeChannelIdFromSource(source, parsed) {
  const fromUrl = (value) => {
    try { return youtubeChannelIdFromUrl(new URL(value)); } catch (e) { return null; }
  };
  const candidates = [
    source && source.channelId,
    parsed && parsed.feedChannelId,
    source && youtubeChannelIdFromFeedUrl(source.feedUrl),
    source && fromUrl(source.channelUrl),
    source && fromUrl(source.url),
  ];
  for (const candidate of candidates) {
    const id = normalizeYouTubeChannelId(candidate);
    if (id) return id;
  }
  return null;
}

function youtubeFeedCandidates(source) {
  if (!source) return [];
  const candidates = [source.feedUrl];
  const channelId = youtubeChannelIdFromSource(source);
  if (channelId) {
    // Prefer the Videos playlist, then fall back to YouTube's documented
    // channel feed if the playlist endpoint or a proxy is having trouble.
    candidates.push(youtubeVideosFeedUrl(channelId), youtubeChannelFeedUrl(channelId));
  }
  try {
    const u = new URL(source.url || '');
    const user = youtubeUserFromUrl(u);
    if (user) candidates.push('https://www.youtube.com/feeds/videos.xml?user=' + encodeURIComponent(user));
  } catch (e) { /* the stored feed URL remains the only candidate */ }
  return [...new Set(candidates.filter(Boolean))];
}

async function fetchFeedForSource(source) {
  let candidates = isYouTubeSource(source) ? youtubeFeedCandidates(source) : [source && source.feedUrl];
  let lastError = null;
  const tried = new Set();
  const tryCandidates = async (urls) => {
    for (const feedUrl of urls) {
      if (!feedUrl || tried.has(feedUrl)) continue;
      tried.add(feedUrl);
      try { return await fetchFeed(feedUrl); }
      catch (error) { lastError = error; }
    }
    return null;
  };

  let text = await tryCandidates(candidates);
  if (text != null) return text;

  // Legacy saved sources may only have a /@handle or /user feed URL. Resolve
  // the stable channel id once before giving up, then retry both feed forms.
  if (isYouTubeSource(source) && !youtubeChannelIdFromSource(source)) {
    const page = youtubeChannelPageUrl(source);
    try {
      const channelId = page ? await youtubeChannelIdFromPage(page) : null;
      if (channelId) {
        source.channelId = channelId;
        source.channelUrl = source.channelUrl || page;
        source.feedUrl = youtubeVideosFeedUrl(channelId) || source.feedUrl;
        candidates = youtubeFeedCandidates(source);
        text = await tryCandidates(candidates);
        if (text != null) return text;
      }
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Could not fetch this source.');
}

function canonicalizeYouTubeSource(source, parsed) {
  if (!isYouTubeSource(source)) return false;
  const channelId = youtubeChannelIdFromSource(source, parsed);
  const feedUrl = youtubeVideosFeedUrl(channelId);
  if (!channelId || !feedUrl) return false;

  let changed = false;
  if (source.channelId !== channelId) { source.channelId = channelId; changed = true; }
  if (!source.channelUrl) { source.channelUrl = 'https://www.youtube.com/channel/' + channelId; changed = true; }
  if (source.feedUrl !== feedUrl) { source.feedUrl = feedUrl; changed = true; }
  return changed;
}

function decodeRemoteUrl(value) {
  return String(value || '')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/\\"/g, '"')
    .trim();
}

function metaContent(html, name) {
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = (tag.match(/\b(?:property|name)=['"]([^'"]+)['"]/i) || [])[1] || '';
    if (key.toLowerCase() !== name.toLowerCase()) continue;
    const content = (tag.match(/\bcontent=['"]([^'"]+)['"]/i) || [])[1] || '';
    if (content) return decodeRemoteUrl(content);
  }
  return '';
}

function absoluteUrl(value, base) {
  if (!value) return '';
  try { return new URL(value, base).href; } catch (e) { return value; }
}

async function articleImageFromPage(url) {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  try {
    const { text } = await fetchText(url);
    const image = metaContent(text, 'og:image') || metaContent(text, 'twitter:image') || firstImage(text);
    return absoluteUrl(image, url);
  } catch (e) {
    return '';
  }
}

async function enrichMissingArticleImages(sourceId, parsedItems) {
  const candidates = parsedItems
    .filter((item) => !item.imageUrl && item.link)
    .slice(0, 40);
  if (!candidates.length) return;

  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const item = candidates[cursor++];
      item.imageUrl = await articleImageFromPage(item.link);
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, candidates.length) }, worker));

  const source = state.sources.find((candidate) => candidate.id === sourceId);
  if (!source || source.type !== 'article') return;
  const byGuid = new Map(candidates.filter((item) => item.imageUrl).map((item) => [item.guid, item.imageUrl]));
  const existing = await storeGetBySourceId(sourceId);
  const updates = existing
    .filter((item) => byGuid.has(item.guid) && item.imageUrl !== byGuid.get(item.guid))
    .map((item) => Object.assign({}, item, { imageUrl: byGuid.get(item.guid) }));
  if (!updates.length) return;

  try {
    await storeBulkPut('items', updates);
    await syncLoadedDayCache();
    renderDayIncremental();
  } catch (e) { /* keep the feed usable even if image enrichment cannot persist */ }
}

async function upgradeMissingArticleImages() {
  const now = Date.now();
  const articleSources = state.sources.filter((source) => {
    if (source.type !== 'article' || !source.lastFetchedAt) return false;
    return now - new Date(source.lastFetchedAt).getTime() <= STALE_OPEN_MS;
  });
  await mapWithConcurrency(articleSources, 2, async (source) => {
    const existing = await storeGetBySourceId(source.id);
    const missing = existing
      .filter((item) => !item.imageUrl && item.link)
      .map((item) => ({ guid: item.guid, link: item.link, imageUrl: '' }));
    if (missing.length) await enrichMissingArticleImages(source.id, missing);
  });
}

function youtubeChannelAvatarFromHtml(html) {
  const ogImage = metaContent(html, 'og:image');
  if (ogImage) return ogImage;

  // Channel pages embed the same avatar in several renderer shapes. Prefer
  // the channel header/metadata blocks, then use a bounded generic fallback.
  const patterns = [
    /"c4TabbedHeaderRenderer"[\s\S]{0,12000}?"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[([\s\S]*?)\]/i,
    /"channelMetadataRenderer"[\s\S]{0,12000}?"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[([\s\S]*?)\]/i,
    /"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[([\s\S]*?)\]/i,
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (!match) continue;
    const urls = [...match[1].matchAll(/"url"\s*:\s*"([^"]+)"/gi)].map((m) => decodeRemoteUrl(m[1]));
    if (urls.length) return urls[urls.length - 1];
  }
  return '';
}

function youtubeChannelPageUrl(source) {
  if (!source) return '';
  if (source.channelUrl) return source.channelUrl;
  const channelId = source.channelId || youtubeChannelIdFromFeedUrl(source.feedUrl);
  if (channelId) return 'https://www.youtube.com/channel/' + channelId;
  try {
    const u = new URL(source.url || '');
    if (isYouTubeHost(u.hostname) && !/\/watch\b|\/shorts\//i.test(u.pathname) && u.hostname !== 'youtu.be') {
      return u.href;
    }
  } catch (e) { /* use the feed URL fallback below */ }
  return '';
}

function needsYouTubeChannelIcon(source) {
  return !!source && (String(source.platform || '').toLowerCase() === 'youtube' || source.type === 'youtube') && !source.channelIconUrl;
}

async function saveYouTubeChannelIcon(source, image) {
  if (!image || !source || !state.sources.some((s) => s.id === source.id)) return;
  source.channelIconUrl = image;
  source.iconUrl = image;
  await storePut('sources', source);
  persistSourceSnapshot();
  renderSourcesList();
  renderDayIncremental();
}

async function youtubeChannelImageFromSource(source) {
  const candidates = [];
  const page = youtubeChannelPageUrl(source);
  if (page) candidates.push(page);
  if (source && source.channelId) candidates.push('https://www.youtube.com/channel/' + source.channelId);
  const fallbackId = youtubeChannelIdFromFeedUrl(source && source.feedUrl);
  if (fallbackId) candidates.push('https://www.youtube.com/channel/' + fallbackId);

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const { text } = await fetchText(candidate, { accept: youtubeChannelPageHasId });
      const image = youtubeChannelAvatarFromHtml(text);
      if (image) return image;
    } catch (e) { /* try the next channel URL */ }
  }
  return '';
}

async function oembed(url) {
  const endpoints = [
    'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url),
    'https://noembed.com/embed?url=' + encodeURIComponent(url),
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetchWithTimeout(ep, {}, 10000);
      if (r.ok) {
        const j = await r.json();
        if (j && j.title) return j;
      }
    } catch (e) { /* use the next endpoint/proxy */ }
    try {
      const { text } = await fetchText(ep);
      const j = JSON.parse(text);
      if (j && j.title) return j;
    } catch (e) { /* use the next endpoint */ }
  }
  return null;
}

function feedCandidates(origin) {
  return ['/feed', '/feed/', '/rss', '/rss.xml', '/feed.xml', '/index.xml', '/atom.xml', '/rss/']
    .map((p) => origin + p);
}

async function findFeedLinkInHtml(url) {
  try {
    const { text } = await fetchText(url);
    if (looksLikeFeed(text)) return url;
    const re = /<link[^>]+(?:application\/rss\+xml|application\/atom\+xml|application\/xml)[^>]*>/gi;
    const links = [];
    let m;
    while ((m = re.exec(text)) && links.length < 6) {
      const tag = m[0];
      const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      if (href) links.push(new URL(href, url).href);
    }
    // Only trust an explicit RSS/Atom alternate. A generic rel=alternate
    // link can be a language/canonical URL and is not safe to add as a feed.
    return links.length ? links[0] : null;
  } catch (e) { return null; }
}

async function applePodcastLookup(id) {
  const endpoint = 'https://itunes.apple.com/lookup?id=' + encodeURIComponent(id) + '&entity=podcast';
  try {
    const r = await fetchWithTimeout(endpoint, { headers: { Accept: 'application/json' } }, 12000);
    if (r.ok) {
      const j = await r.json();
      const result = j.results && j.results[0];
      if (result && result.feedUrl) return result;
    }
  } catch (e) { /* use the normal proxy fallback below */ }
  try {
    const { text } = await fetchText(endpoint);
    const j = JSON.parse(text);
    const result = j.results && j.results[0];
    return result && result.feedUrl ? result : null;
  } catch (e) {
    return null;
  }
}

async function resolveFeedUrl(raw, options = {}) {
  const url = normalizeUrl(raw);
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const youtubeHost = isYouTubeHost(host);
  const substackHost = isSubstackHostname(host);
  const substackProfileHandle = substackHandleFromProfileUrl(u);

  // Substack profile links such as substack.com/@palladium point to the
  // account's publication, whose feed lives at the corresponding subdomain.
  // Keep the profile URL as the user-supplied source URL, but follow the
  // publication feed so the app receives the actual posts.
  if (substackProfileHandle) {
    return {
      kind: 'source',
      type: 'article',
      platform: 'substack',
      url,
      siteUrl: 'https://' + substackProfileHandle + '.substack.com',
      feedUrl: 'https://' + substackProfileHandle + '.substack.com/feed',
    };
  }

  // Substack's publication feed is stable at /feed. Do not download the
  // heavy publication page first; persist the source immediately and let the
  // background hydrator fetch the feed once.
  if (substackHost) {
    return { kind: 'source', type: 'article', platform: 'substack', url, feedUrl: u.origin + '/feed' };
  }

  // --- YouTube ---
  if (youtubeHost) {
    const user = youtubeUserFromUrl(u);
    if (user) {
      // Resolve handles to the channel's Videos playlist so Shorts never enter
      // the feed. Keep the legacy user feed as a compatibility fallback when
      // YouTube does not expose the channel page to the browser proxy.
      let channelId = null;
      try { channelId = await youtubeChannelIdFromPage(url); } catch (e) { /* use the legacy feed fallback */ }
      return {
        kind: 'source', type: 'youtube', platform: 'youtube', url,
        channelId,
        channelUrl: url,
        feedUrl: youtubeVideosFeedUrl(channelId) || 'https://www.youtube.com/feeds/videos.xml?user=' + encodeURIComponent(user),
      };
    }
    const isSingleVideo = host === 'youtu.be' || /\/watch\b/.test(u.pathname) || /\/shorts\//.test(u.pathname);
    const hasPlaylist = !!u.searchParams.get('list');
    if (isSingleVideo || hasPlaylist) {
      const videoId = host === 'youtu.be'
        ? u.pathname.slice(1).split('/')[0]
        : (u.searchParams.get('v') || '');
      const embed = isSingleVideo ? await oembed(url) : null;
      // A shared video is still useful as a source: follow its channel rather
      // than rejecting a perfectly valid YouTube share URL.
      const authorUrl = embed && embed.author_url ? embed.author_url : '';
      let channelId = null;
      if (authorUrl) {
        try {
          const authorPage = new URL(authorUrl);
          channelId = youtubeChannelIdFromUrl(authorPage);
          if (channelId) return {
            kind: 'source', type: 'youtube', platform: 'youtube', url,
            channelId, channelUrl: authorPage.href,
            feedUrl: youtubeVideosFeedUrl(channelId),
          };
          const authorUser = youtubeUserFromUrl(authorPage);
          if (authorUser) return {
            kind: 'source', type: 'youtube', platform: 'youtube', url,
            channelUrl: authorPage.href,
            feedUrl: 'https://www.youtube.com/feeds/videos.xml?user=' + encodeURIComponent(authorUser),
          };
        } catch (e) { /* resolve below */ }
        channelId = await youtubeChannelIdFromPage(authorUrl);
      }
      if (!channelId && hasPlaylist) channelId = await youtubeChannelIdFromPage(url);
      if (channelId) {
        return {
          kind: 'source', type: 'youtube', platform: 'youtube', url,
          channelId, channelUrl: url,
          feedUrl: youtubeVideosFeedUrl(channelId),
        };
      }
      if (isSingleVideo) {
        throw new Error('Could not identify the YouTube channel from this video. Paste the channel page URL instead.');
      }
    }
    const channelId = youtubeChannelIdFromUrl(u) || await youtubeChannelIdFromPage(url);
    if (!channelId) throw new Error('Could not find this YouTube channel. Use a channel page URL.');
    return {
      kind: 'source',
      type: 'youtube',
      platform: 'youtube',
      url,
      channelId,
      channelUrl: url,
      feedUrl: youtubeVideosFeedUrl(channelId),
    };
  }

  // --- Apple Podcasts / iTunes show pages ---
  // A show page is not itself an RSS feed, but its numeric id is stable and
  // Apple's lookup endpoint returns the publisher's feed URL.
  if (host === 'podcasts.apple.com' || host === 'itunes.apple.com') {
    const idMatch = u.pathname.match(/\bid(\d+)/i);
    if (idMatch) {
      const result = await applePodcastLookup(idMatch[1]);
      if (result && result.feedUrl) {
        return {
          kind: 'source',
          type: 'podcast',
          platform: 'podcast',
          url,
          feedUrl: result.feedUrl,
          appleUrl: result.collectionViewUrl || url,
        };
      }
    }
  }

  // --- Feed-looking URL ---
  const likelyFeedPath = /(?:^|\/)(?:feed(?:\/podcast)?|podcast\/(?:rss|feed)|rss|atom)(?:\/)?$/i.test(u.pathname) || /\.(xml|rss|atom)$/i.test(u.pathname);
  if (likelyFeedPath) {
    return { kind: 'source', type: 'article', platform: 'rss', url, feedUrl: url };
  }

  const origin = u.origin;
  if (options.optimistic !== false) {
    // Most publication platforms (including custom-domain Substacks) expose
    // /feed. Persist that candidate immediately; hydrateSource performs the
    // full discovery fallback if this candidate is not a feed.
    return { kind: 'source', type: 'article', platform: 'rss', url, feedUrl: origin + '/feed', optimistic: true };
  }

  // --- Page scan + common feed paths ---
  // Run the page scan and the most likely /feed paths together. Publication
  // pages often expose one or the other; racing them makes mobile adds feel
  // immediate without requiring a preview request first.
  const pagePromise = findFeedLinkInHtml(url).then((found) => {
    if (!found) throw new Error('No alternate feed link');
    return { kind: 'source', type: 'article', platform: 'rss', url, feedUrl: found };
  });
  const quickCandidates = feedCandidates(origin).slice(0, 3);
  const quickPromise = Promise.any(quickCandidates.map(async (cand) => {
    const { text } = await fetchText(cand);
    if (!looksLikeFeed(text)) throw new Error('Not a feed');
    return { kind: 'source', type: 'article', platform: 'rss', url, feedUrl: cand, feedText: text };
  }));
  try {
    return await Promise.any([pagePromise, quickPromise]);
  } catch (e) {
    for (const cand of feedCandidates(origin).slice(3)) {
      try {
        const { text } = await fetchText(cand);
        if (looksLikeFeed(text)) return { kind: 'source', type: 'article', platform: 'rss', url, feedUrl: cand, feedText: text };
      } catch (err) { /* keep trying */ }
    }
  }
  throw new Error('No feed found at this URL.');
}

/* ---------------- iTunes lookup for podcasts ---------------- */

async function itunesLookup(showName) {
  try {
    const r = await fetchWithTimeout(
      'https://itunes.apple.com/search?media=podcast&limit=1&term=' + encodeURIComponent(showName), {}, 12000);
    if (!r.ok) return null;
    const j = await r.json();
    const res = j.results && j.results[0];
    if (!res) return null;
    return { itunesId: res.collectionId, itunesUrl: res.collectionViewUrl };
  } catch (e) { return null; }
}

function isSubstackFeed(parsed, feedUrl, feedText) {
  if (isSubstackHostname(hostOf(feedUrl))) return true;
  if (/\bsubstack\b/i.test(String(parsed && parsed.feedGenerator || ''))) return true;
  return /<generator\b[^>]*>\s*Substack\s*<\/generator>/i.test(String(feedText || '').slice(0, 12000));
}

function updateSourceMetadata(source, parsed, feedText) {
  if (!source || !parsed) return;

  if (isSubstackSource(source) || isSubstackFeed(parsed, source.feedUrl, feedText)) {
    source.platform = 'substack';
  } else if (!source.platform) {
    source.platform = source.type === 'youtube' ? 'youtube' : source.type === 'podcast' ? 'podcast' : 'rss';
  }

  const hasAudio = parsed.items.some((item) => item.kind === 'podcast' || item.audioUrl);
  const hasItunes = /<itunes:/i.test(String(feedText || '').slice(0, 12000));
  if (source.platform === 'substack') {
    // Audio posts are still publication posts: they use the editorial card
    // anatomy and should not turn the whole Substack into a native podcast.
    source.type = 'article';
  } else if (source.platform === 'youtube') {
    source.type = 'youtube';
  } else if (hasAudio || hasItunes || source.platform === 'podcast') {
    source.type = 'podcast';
    source.platform = 'podcast';
  } else if (!source.type) {
    source.type = 'article';
  }

  if (source.platform === 'youtube') {
    if (parsed.feedChannelId) source.channelId = normalizeYouTubeChannelId(parsed.feedChannelId) || source.channelId;
    source.channelUrl = source.channelUrl || parsed.feedAuthorUrl || parsed.feedLink || source.url;
    const genericTitle = /^(?:videos|short videos|live streams|uploads(?: from .*)?)$/i;
    source.title = parsed.feedAuthor || (!genericTitle.test(String(parsed.feedTitle || '')) ? parsed.feedTitle : source.title) || source.title;
    source.siteUrl = source.channelUrl || parsed.feedLink || source.siteUrl;
  } else {
    source.title = parsed.feedTitle || source.title;
    source.siteUrl = parsed.feedLink || source.siteUrl;
  }
  source.iconUrl = source.channelIconUrl || parsed.feedIcon || source.iconUrl || ('https://' + hostOf(source.feedUrl) + '/favicon.ico');
}

/* ---------------- Add source / fetch ---------------- */

async function addSource(rawUrl) {
  const resolved = await resolveFeedUrl(rawUrl);
  if (resolved.kind === 'video') {
    throw new Error('That looks like a single video — paste the channel page URL to follow the channel.');
  }
  const feedUrl = resolved.feedUrl;

  if (state.sources.some((s) => s.feedUrl === feedUrl)) {
    throw new Error('This source is already added.');
  }

  // Persist the source as soon as its URL is resolved. Feed parsing and item
  // storage continue in the background, so the mobile sheet closes promptly.
  const initialType = resolved.type === 'youtube' ? 'youtube' : (resolved.type === 'podcast' ? 'podcast' : 'article');
  const source = {
    url: resolved.url,
    feedUrl,
    title: resolved.title || hostOf(resolved.url),
    type: initialType,
    platform: resolved.platform || initialType,
    siteUrl: resolved.siteUrl || resolved.url,
    iconUrl: 'https://' + hostOf(feedUrl) + '/favicon.ico',
    channelId: resolved.channelId || null,
    channelUrl: resolved.channelUrl || null,
    channelIconUrl: null,
    itunesId: resolved.appleId || null,
    itunesUrl: resolved.appleUrl || null,
    addedAt: new Date().toISOString(),
    lastFetchedAt: null,
    lastError: null,
    youtubeShortsCheckedAt: null,
  };
  const id = await storePut('sources', source);
  source.id = id;
  state.sources.push(source);
  persistSourceSnapshot();
  state.fetchingSourceIds.add(source.id);
  renderSourcesList();
  renderDayIncremental();
  void hydrateSource(source, resolved);
  return source;
}

async function hydrateSource(source, resolved) {
  if (!state.sources.some((s) => s.id === source.id)) return;
  try {
    let text;
    try {
      text = resolved.feedText || await fetchFeedForSource(source);
    } catch (firstError) {
      // If the lightweight YouTube user feed is not mapped, fall back to the
      // channel page once and upgrade the source to its canonical UC feed.
      if (source.type === 'youtube' && /feeds\/videos\.xml\?user=/i.test(source.feedUrl)) {
        const channelId = await youtubeChannelIdFromPage(source.url);
        if (!channelId) throw firstError;
        source.channelId = channelId;
        source.channelUrl = source.channelUrl || source.url;
        source.feedUrl = youtubeVideosFeedUrl(channelId);
        text = await fetchFeedForSource(source);
      } else if (resolved.optimistic) {
        // Publication pages get an immediate /feed candidate. If that was a
        // 404/HTML page, now do the slower explicit alternate/candidate
        // discovery and retry with the real feed URL.
        const discovered = await resolveFeedUrl(source.url, { optimistic: false });
        if (!discovered.feedUrl || discovered.feedUrl === source.feedUrl) throw firstError;
        source.feedUrl = discovered.feedUrl;
        text = discovered.feedText || await fetchFeed(source.feedUrl);
      } else {
        throw firstError;
      }
    }
    let parsed = parseFeed(text, source.feedUrl);
    // Existing installs may still point at the all-uploads channel feed. Once
    // its channel id is known, switch to YouTube's Videos playlist before
    // storing any items so Shorts cannot be added to the local archive.
    if (canonicalizeYouTubeSource(source, parsed)) {
      await storePut('sources', source);
      persistSourceSnapshot();
      text = await fetchFeedForSource(source);
      parsed = parseFeed(text, source.feedUrl);
    }
    updateSourceMetadata(source, parsed, text);
    await storePut('sources', source);
    persistSourceSnapshot();

    // Item parsing/storage happens independently of the optional Apple
    // Podcasts search, so a slow lookup never delays the feed itself.
    const lookup = source.type === 'podcast' && !source.itunesUrl
      ? itunesLookup(parsed.feedTitle)
      : Promise.resolve(null);
    const fetched = await fetchSource(source.id, parsed, text);
    if (!fetched.ok) throw fetched.error || new Error('Could not fetch this source.');
    if (!state.sources.some((s) => s.id === source.id)) return;
    const it = await lookup;
    if (it) {
      source.itunesId = it.itunesId;
      source.itunesUrl = it.itunesUrl;
      await storePut('sources', source);
      persistSourceSnapshot();
    }
  } catch (err) {
    if (state.sources.some((s) => s.id === source.id)) {
      source.lastError = err && err.message ? err.message : String(err);
      await storePut('sources', source);
      persistSourceSnapshot();
    }
  } finally {
    state.fetchingSourceIds.delete(source.id);
  }
  renderSourcesList();
  renderDayIncremental();
}

async function fetchSourceOnce(sourceId, preParsed, preText) {
  const source = state.sources.find((s) => s.id === sourceId);
  if (!source) return;
  let parsed = preParsed;
    let feedText = preText || '';
    if (!parsed) {
      if (canonicalizeYouTubeSource(source)) {
        await storePut('sources', source);
        persistSourceSnapshot();
      }
      feedText = await fetchFeedForSource(source);
      parsed = parseFeed(feedText, source.feedUrl);
    }
    if (canonicalizeYouTubeSource(source, parsed)) {
      await storePut('sources', source);
      persistSourceSnapshot();
      feedText = await fetchFeedForSource(source);
      parsed = parseFeed(feedText, source.feedUrl);
    }
    updateSourceMetadata(source, parsed, feedText);
    const channelIconPromise = needsYouTubeChannelIcon(source)
      ? youtubeChannelImageFromSource(source).catch(() => '')
      : null;

    const now = new Date().toISOString();
    const normalized = [];
    for (const it of parsed.items) {
      normalized.push({
        sourceId,
        guid: it.guid,
        day: dayKey(it.publishedAt ? new Date(it.publishedAt) : todayMidnight()),
        title: it.title,
        author: it.author,
        summary: it.summary,
        link: it.link,
        audioUrl: it.audioUrl,
        imageUrl: it.imageUrl,
        duration: it.duration,
        publishedAt: it.publishedAt || now,
        kind: it.kind === 'article' && source.type === 'youtube' ? 'youtube' : it.kind,
        youtubeShort: !!it.youtubeShort,
        fetchedAt: now,
      });
    }
    // Upsert: keep existing ids for same (sourceId, guid)
    const existing = await storeGetBySourceId(sourceId);
    const byGuid = new Map(existing.map((i) => [i.guid, i]));
    const seen = new Set();
    const uniq = normalized.filter((n) => (seen.has(n.guid) ? false : (seen.add(n.guid), true)));
    const toPut = [];
    for (const n of uniq) {
      const old = byGuid.get(n.guid);
      if (old) {
        if (old.publishedAt === n.publishedAt && old.title === n.title && old.summary === n.summary &&
            old.author === n.author && old.link === n.link && old.imageUrl === n.imageUrl &&
            old.duration === n.duration && old.kind === n.kind && old.youtubeShort === n.youtubeShort) continue;
        toPut.push(Object.assign({}, old, n, { id: old.id }));
      } else {
        toPut.push(n);
      }
    }
    await storeBulkPut('items', toPut);

    // Bounded history: keep the newest MAX_ITEMS_PER_SOURCE items per source,
    // prune the rest so local storage stays minimal but the archive persists.
    const MAX_ITEMS_PER_SOURCE = 4000;
    const mine = await storeGetBySourceId(sourceId);
    if (mine.length > MAX_ITEMS_PER_SOURCE) {
      mine.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
      const keep = new Set(mine.slice(0, MAX_ITEMS_PER_SOURCE).map((i) => i.id));
      const drop = mine.filter((i) => !keep.has(i.id)).map((i) => i.id);
      const tx = state.db.transaction('items', 'readwrite');
      for (const id of drop) tx.objectStore('items').delete(id);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    }

    // Keep the archive in IndexedDB and reconcile the already-loaded window in
    // the background. The visible day cache is never cleared during refresh.


    if (toPut.length) await syncLoadedDayCache();

    source.lastFetchedAt = now;
    source.lastError = null;
    await storePut('sources', source);
    persistSourceSnapshot();
    if (source.type === 'article') void enrichMissingArticleImages(source.id, parsed.items);
    if (channelIconPromise) {
      void channelIconPromise.then((image) => saveYouTubeChannelIcon(source, image)).catch(() => {});
    }
}

function sourceErrorMessage(error) {
  return error && error.message ? error.message : String(error || 'Refresh failed');
}

function fetchSource(sourceId, preParsed, preText) {
  const active = state.sourceFetchPromises.get(sourceId);
  if (active) return active;

  const promise = (async () => {
    const source = state.sources.find((s) => s.id === sourceId);
    if (!source) return { ok: false, missing: true };
    state.fetchingSourceIds.add(sourceId);
    try {
      await fetchSourceOnce(sourceId, preParsed, preText);
      return { ok: true };
    } catch (error) {
      // Keep the last good items visible while recording the failed attempt.
      // The retry layer decides whether to try the source again.
      if (state.sources.some((s) => s.id === sourceId)) {
        source.lastError = sourceErrorMessage(error);
        try { await storePut('sources', source); } catch (e) { /* keep retry result */ }
        persistSourceSnapshot();
      }
      return { ok: false, error };
    } finally {
      state.fetchingSourceIds.delete(sourceId);
      renderSourcesList();
      renderDayIncremental();
    }
  })();

  state.sourceFetchPromises.set(sourceId, promise);
  void promise.then(
    () => { if (state.sourceFetchPromises.get(sourceId) === promise) state.sourceFetchPromises.delete(sourceId); },
    () => { if (state.sourceFetchPromises.get(sourceId) === promise) state.sourceFetchPromises.delete(sourceId); }
  );
  return promise;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshSourceWithRetry(sourceId, maxAttempts = REFRESH_MAX_ATTEMPTS) {
  const attempts = Math.max(1, Math.min(REFRESH_MAX_ATTEMPTS, Number(maxAttempts) || REFRESH_MAX_ATTEMPTS));
  let result = { ok: false, error: new Error('Refresh failed') };
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await wait(REFRESH_RETRY_DELAYS_MS[attempt] || 0);
    result = await fetchSource(sourceId);
    if (result.ok || result.missing) return Object.assign({}, result, { attempts: attempt + 1 });
  }
  return Object.assign({}, result, { attempts });
}

function refreshSource(sourceId, options = {}) {
  const active = state.sourceRefreshPromises.get(sourceId);
  if (active) return active;
  const maxAttempts = Math.max(1, Math.min(
    REFRESH_MAX_ATTEMPTS,
    Number(options.maxAttempts) || REFRESH_MAX_ATTEMPTS
  ));
  const promise = refreshSourceWithRetry(sourceId, maxAttempts);
  state.sourceRefreshPromises.set(sourceId, promise);
  void promise.then(
    () => { if (state.sourceRefreshPromises.get(sourceId) === promise) state.sourceRefreshPromises.delete(sourceId); },
    () => { if (state.sourceRefreshPromises.get(sourceId) === promise) state.sourceRefreshPromises.delete(sourceId); }
  );
  return promise;
}

async function mapWithConcurrency(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index]);
    }
  }
  const workers = Math.min(Math.max(1, limit), values.length);
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}

function refreshAll(force, options = {}) {
  const background = options.background === true;
  if (background && state.backgroundRefreshPromise) return state.backgroundRefreshPromise;
  if (!background && state.fetching) {
    return Promise.resolve({ skipped: true, succeeded: 0, failed: 0 });
  }

  const now = Date.now();
  const sourceIds = state.sources
    .filter((source) => {
      if (!background || force) return true;
      if (!source.lastFetchedAt) return true;
      return now - new Date(source.lastFetchedAt).getTime() > BACKGROUND_REFRESH_MAX_AGE_MS;
    })
    .map((source) => source.id);
  if (!sourceIds.length) return Promise.resolve({ succeeded: 0, failed: 0 });

  const run = (async () => {
    if (background) state.backgroundRefreshing = true;
    else state.fetching = true;
    if (!background) beginRefreshFeedback();

    try {
      // Give every source one quick opportunity before spending time on
      // retries. A failed YouTube proxy must not occupy a worker while all
      // other sources wait behind it.
      let pendingIds = sourceIds.slice();
      const resultsById = new Map();

      for (let pass = 0; pass < REFRESH_MAX_ATTEMPTS && pendingIds.length; pass++) {
        if (pass > 0) await wait(REFRESH_RETRY_DELAYS_MS[pass] || 0);
        const passResults = await mapWithConcurrency(
          pendingIds,
          REFRESH_CONCURRENCY,
          (sourceId) => refreshSource(sourceId, { maxAttempts: 1 })
        );
        passResults.forEach((result, index) => {
          resultsById.set(pendingIds[index], result);
        });
        pendingIds = pendingIds.filter((sourceId) => {
          const result = resultsById.get(sourceId);
          return !(result && (result.ok || result.missing));
        });
      }

      const results = sourceIds.map((sourceId) => (
        resultsById.get(sourceId) || { ok: false, error: new Error('Refresh failed') }
      ));
      renderSourcesList();
      renderDayIncremental();
      const succeeded = results.filter((result) => result && result.ok).length;
      const failed = results.length - succeeded;
      if (options.notify && failed) {
        toast(succeeded ? 'Some sources couldn’t refresh' : 'Couldn’t refresh — check your connection');
      }
      return { succeeded, failed, results };
    } finally {
      if (background) state.backgroundRefreshing = false;
      else {
        state.fetching = false;
        endRefreshFeedback();
      }
    }
  })();

  if (background) {
    state.backgroundRefreshPromise = run;
    void run.then(
      () => { if (state.backgroundRefreshPromise === run) state.backgroundRefreshPromise = null; },
      () => { if (state.backgroundRefreshPromise === run) state.backgroundRefreshPromise = null; }
    );
  }
  return run;
}

async function refreshOneSource(sourceId) {
  const source = state.sources.find((candidate) => candidate.id === sourceId);
  if (!source) return { skipped: true, succeeded: 0, failed: 0 };
  if (state.fetching) {
    toast('Dispatch is already refreshing');
    return { skipped: true, succeeded: 0, failed: 0 };
  }

  state.fetching = true;
  beginRefreshFeedback();
  try {
    const result = await refreshSource(sourceId);
    renderSourcesList();
    renderDayIncremental();
    if (result.ok) toast('Updated “' + source.title + '”');
    else toast('Couldn’t refresh “' + source.title + '”');
    return { succeeded: result.ok ? 1 : 0, failed: result.ok ? 0 : 1, result };
  } finally {
    state.fetching = false;
    endRefreshFeedback();
  }
}

async function upgradeYouTubeSourceIcons() {
  const pending = state.sources.filter(needsYouTubeChannelIcon);
  if (!pending.length) return;
  let changed = false;
  await mapWithConcurrency(pending, 2, async (source) => {
    try {
      const image = await youtubeChannelImageFromSource(source);
      if (!image || !state.sources.some((s) => s.id === source.id)) return;
      await saveYouTubeChannelIcon(source, image);
      changed = true;
    } catch (e) { /* keep the existing fallback icon */ }
  });
  if (changed) {
    renderSourcesList();
    renderDayIncremental();
  }
}

async function purgeKnownYouTubeShorts(source) {
  if (!isYouTubeSource(source) || source.youtubeShortsCheckedAt) return;
  const shortsFeedUrl = youtubeShortsFeedUrl(source.channelId);
  if (!shortsFeedUrl) return;

  try {
    const text = await fetchFeed(shortsFeedUrl);
    const parsed = parseFeed(text, shortsFeedUrl, { includeYouTubeShorts: true });
    const shortGuids = new Set(parsed.items.map((item) => item.guid));
    const existing = await storeGetBySourceId(source.id);
    const drop = existing
      .filter((item) => shortGuids.has(item.guid) || isFilteredYouTubeItem(item))
      .map((item) => item.id);
    if (drop.length) {
      await deleteItemsByIds(drop);
      await syncLoadedDayCache(true);
    }
    source.youtubeShortsCheckedAt = new Date().toISOString();
    await storePut('sources', source);
    persistSourceSnapshot();
    if (drop.length) {
      renderSourcesList();
      renderDayIncremental();
    }
  } catch (e) { /* the Videos playlist is already the primary filter */ }
}

async function upgradeYouTubeSources() {
  const pending = state.sources.filter((source) =>
    isYouTubeSource(source) && (!isYouTubeVideosFeedUrl(source.feedUrl) || !source.youtubeShortsCheckedAt));
  if (!pending.length) return;

  await mapWithConcurrency(pending, 2, async (source) => {
    if (!state.sources.some((candidate) => candidate.id === source.id)) return;

    let channelId = youtubeChannelIdFromSource(source);
    if (!channelId) {
      const page = youtubeChannelPageUrl(source);
      if (page) {
        try { channelId = await youtubeChannelIdFromPage(page); } catch (e) { /* feed parsing below may reveal it */ }
      }
      if (channelId) {
        source.channelId = channelId;
        source.channelUrl = source.channelUrl || page;
      }
    }

    const changed = canonicalizeYouTubeSource(source);
    if (!isYouTubeVideosFeedUrl(source.feedUrl) || changed) {
      const fetched = await refreshSource(source.id);
      if (!fetched.ok) return;
    }
    await purgeKnownYouTubeShorts(source);
  });
}

async function removeSource(id) {
  await deleteSourceCascade(id);
  state.sources = state.sources.filter((s) => s.id !== id);
  await syncLoadedDayCache(true);
  persistSourceSnapshot();
  renderSourcesList();
  renderDayIncremental();
}

/* ---------------- Rendering: strip ---------------- */

const STRIP_BACK = 6, STRIP_FWD = 0, STRIP_EXTEND = 1;

function ensureStripRange() {
  const today = todayMidnight();
  if (!state.stripRange) {
    state.stripRange = { start: addDays(today, -STRIP_BACK), end: addDays(today, STRIP_FWD) };
    return;
  }
  const d = state.day > today ? today : state.day;
  if (d < state.stripRange.start) {
    while (d < state.stripRange.start) state.stripRange.start = addDays(state.stripRange.start, -STRIP_EXTEND);
  } else if (d > state.stripRange.end) {
    while (d > state.stripRange.end) state.stripRange.end = addDays(state.stripRange.end, STRIP_EXTEND);
  }
  if (state.stripRange.end > today) state.stripRange.end = today;
}

function renderStrip({ center = false, smooth = false, preserveAnchorKey = null, preserveAnchorOffset = 0 } = {}) {
  ensureStripRange();
  const strip = $('#strip');
  const today = todayMidnight();
  const selKey = dayKey(state.day);
  const prevScrollLeft = strip.scrollLeft;
  const prevSel = strip.querySelector('.bubble--selected');
  const selWasVisible = prevSel
    ? (prevSel.offsetLeft >= prevScrollLeft - 8 && prevSel.offsetLeft + prevSel.clientWidth <= prevScrollLeft + strip.clientWidth + 8)
    : false;
  const frag = document.createDocumentFragment();
  for (let d = state.stripRange.start; d <= state.stripRange.end; d = addDays(d, 1)) {
    const key = dayKey(d);
    let cls = 'bubble';
    if (key === selKey) cls += ' bubble--selected';
    else if (key === dayKey(today)) cls += ' bubble--today';
    else if (d < today) cls += ' bubble--past';
    else continue;
    const b = el('button', cls);
    b.setAttribute('aria-label', d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    b.dataset.day = key;
    // Live date, day/month, no weekday — “09/08” for 9 August.
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    b.innerHTML = '<span class="dn">' + dd + '/' + mm + '</span>';
    frag.appendChild(b);
  }
  strip.innerHTML = '';
  strip.appendChild(frag);
  if (center) {
    // A focused day is always the spotlight: move the whole carousel so the
    // selected circle, not just its black fill, is exactly at centre.
    scrollStripTo(selKey, smooth);
  } else if (preserveAnchorKey) {
    const anchor = strip.querySelector('.bubble[data-day="' + preserveAnchorKey + '"]');
    strip.scrollLeft = anchor
      ? prevScrollLeft + (anchor.offsetLeft - preserveAnchorOffset)
      : prevScrollLeft;
  } else if (selWasVisible) {
    strip.scrollLeft = prevScrollLeft;   // data refresh: don't yank the strip
  } else {
    scrollStripTo(selKey, false);        // first render / range extension
  }
}

function extendStripRange(direction) {
  if (!state.stripRange) ensureStripRange();
  const today = todayMidnight();
  if (direction > 0 && state.stripRange.end >= today) return;
  const strip = $('#strip');
  const anchorKey = direction < 0
    ? dayKey(state.stripRange.start)
    : dayKey(state.stripRange.end);
  const anchor = strip.querySelector('.bubble[data-day="' + anchorKey + '"]');
  const anchorOffset = anchor ? anchor.offsetLeft : 0;

  if (direction < 0) {
    state.stripRange.start = addDays(state.stripRange.start, -STRIP_EXTEND);
  } else {
    state.stripRange.end = addDays(state.stripRange.end, STRIP_EXTEND);
    if (state.stripRange.end > today) state.stripRange.end = today;
  }
  renderStrip({ preserveAnchorKey: anchorKey, preserveAnchorOffset: anchorOffset });
}

function maybeExtendStripRange() {
  const strip = $('#strip');
  if (!state.stripRange || strip.scrollWidth <= strip.clientWidth) return;
  const threshold = Math.max(72, strip.clientWidth * 0.18);
  if (strip.scrollLeft < threshold) extendStripRange(-1);
  else if (strip.scrollLeft + strip.clientWidth > strip.scrollWidth - threshold) extendStripRange(1);
}

function scrollStripTo(dayKeyVal, smooth) {
  const strip = $('#strip');
  const b = strip.querySelector('.bubble[data-day="' + dayKeyVal + '"]');
  if (!b) return;
  const target = b.offsetLeft - strip.clientWidth / 2 + b.clientWidth / 2;
  strip.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
}

/* ---------------- Rendering: day content ---------------- */

function sourceBadge(source) {
  const letter = source && source.title ? esc(source.title.trim()[0].toUpperCase()) : '?';
  if (source && source.iconUrl) {
    return '<span class="source-badge"><span class="badge-letter" aria-hidden="true">' + letter + '</span><img class="media-reveal" decoding="async" draggable="false" src="' + esc(source.iconUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add(\'media-reveal--loaded\')" onerror="this.remove()"></span>';
  }
  return '<span class="source-badge" aria-hidden="true">' + letter + '</span>';
}

function isAudioItem(item) {
  return !!item && (item.kind === 'podcast' || !!item.audioUrl);
}

function isFilteredYouTubeItem(item) {
  if (!item || item.kind !== 'youtube') return false;
  return !!item.youtubeShort || isYouTubeShortUrl(item.link) ||
    hasYouTubeShortMarker(String(item.title || '') + ' ' + String(item.summary || ''));
}

function cardTarget(item, source) {
  if (item.kind === 'youtube') {
    const vid = item.rawVideoId || (item.link || '').match(/[?&]v=([\w-]+)/);
    return item.link || 'https://www.youtube.com/watch?v=' + (typeof vid === 'string' ? vid : (vid ? vid[1] : ''));
  }
  if (isAudioItem(item) && !isSubstackSource(source) && source && source.itunesUrl) return source.itunesUrl;
  return item.link || item.audioUrl || (source ? source.siteUrl : '#');
}

function sourceProvenance(source) {
  if (!source) return '';
  const title = String(source.title || '').trim();
  if (title && !/^(?:text feed|rss|article|podcast)$/i.test(title)) return title;
  return hostOf(source.siteUrl || source.url || source.feedUrl);
}

function pillLabel(item, source) {
  if (item.kind === 'youtube') return 'Watch on YouTube';
  if (isAudioItem(item)) {
    if (isSubstackSource(source)) return 'Listen on Substack';
    if (source && source.itunesUrl) return 'Listen on Apple Podcasts';
    const destination = sourceProvenance(source);
    return destination ? 'Listen on ' + destination : 'Listen';
  }
  const destination = isSubstackSource(source) ? 'Substack' : sourceProvenance(source);
  return destination ? 'Read on ' + destination : 'Read';
}

function itemRenderKey(item, source) {
  return JSON.stringify([
    itemDataSignature(item),
    source ? source.title || '' : '',
    source ? source.iconUrl || '' : '',
    source ? source.itunesUrl || '' : '',
    source ? source.siteUrl || '' : '',
  ]);
}

function buildItemCard(item, source) {
  const card = el('article', 'card');
  card.dataset.itemKey = itemIdentity(item);
  card.dataset.renderKey = itemRenderKey(item, source);
  const targetUrl = cardTarget(item, source) || '#';
  const actionLabel = pillLabel(item, source);

  const substack = isSubstackSource(source);
  const podcastImage = item.imageUrl || (source && source.iconUrl) || '';
  const editorialImage = item.imageUrl || (substack ? podcastImage : '');
  let media = '';
  if (item.kind === 'youtube' && item.imageUrl) {
    media = '<div class="card-media">' +
      '<img class="media-reveal" decoding="async" draggable="false" src="' + esc(item.imageUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add(\'media-reveal--loaded\')" onerror="this.parentElement.style.display=\'none\'">' +
      (item.duration ? '<span class="duration-badge mono-glyph">' + fmtDuration(item.duration) + '</span>' : '') +
      '</div>';
  } else if ((item.kind === 'article' || substack) && editorialImage) {
    media = '<div class="card-media">' +
      '<img class="media-reveal" decoding="async" draggable="false" src="' + esc(editorialImage) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add(\'media-reveal--loaded\')" onerror="this.parentElement.style.display=\'none\'">' +
      '</div>';
  }

  let body;
  if (isAudioItem(item) && !substack) {
    const art = podcastImage
      ? '<img class="media-reveal" decoding="async" draggable="false" src="' + esc(podcastImage) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add(\'media-reveal--loaded\')" onerror="this.remove();this.parentElement.classList.add(\'pod-art--fallback\')"><span class="pod-art-fallback" aria-hidden="true">' + KIND_META.podcast.icon + '</span>'
      : KIND_META.podcast.icon;
    body =
      '<div class="pod-row">' +
        '<div class="pod-art" aria-hidden="true">' + art + '</div>' +
        '<div class="pod-body">' +
          '<h3 class="card-title">' + esc(item.title) + '</h3>' +
          (item.author || item.duration ? '<p class="card-byline">' + esc([item.author, item.duration ? fmtDuration(item.duration) : ''].filter(Boolean).join(' · ')) + '</p>' : '') +
          (item.summary ? '<p class="card-summary">' + esc(item.summary) + '</p>' : '') +
        '</div>' +
      '</div>';
  } else {
    const metadata = [item.author, substack && item.duration ? fmtDuration(item.duration) : ''].filter(Boolean).join(' · ');
    body =
      '<h3 class="card-title">' + esc(item.title) + '</h3>' +
      (metadata ? '<p class="card-byline">' + esc(metadata) + '</p>' : '') +
      (item.summary ? '<p class="card-summary">' + esc(item.summary) + '</p>' : '');
  }

  card.innerHTML =
    media +
    '<div class="card-source-row">' +
      sourceBadge(source) +
      '<span class="source-name">' + esc(source ? source.title : '') + '</span>' +
      '<span class="relative-time">' + esc(timeAgo(item.publishedAt)) + '</span>' +
    '</div>' +
    body +
    '<a class="pill" href="' + esc(targetUrl) + '" target="_blank" rel="noopener noreferrer">' +
      '<span>' + esc(actionLabel) + '</span><span class="pill-arrow" aria-hidden="true">↗</span>' +
    '</a>';

  return card;
}

function buildEmpty(day) {
  const d = el('div', 'empty');
  const firstRun = state.sources.length === 0;
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  d.innerHTML =
    '<div class="empty-glyph" aria-hidden="true">' + ICONS.calendar + '</div>' +
    '<h3>' + (firstRun ? 'Start your feed' : (dayKey(day) === dayKey(todayMidnight()) ? 'Nothing on today’s feed yet' : 'Nothing on this day')) + '</h3>' +
    '<p>' + (firstRun
      ? 'Dispatch is private and local. Add a source and your feed history stays on this device.'
      : (dayKey(day) === dayKey(todayMidnight())
        ? 'Add a source and Dispatch will gather its recent items here.'
        : 'No items were published on this day. Swipe to another day.')) + '</p>' +
    (firstRun && !standalone ? '<p class="empty-install">On iPhone: Share → Add to Home Screen.</p>' : '') +
    '<button type="button" class="pill pill--primary" data-action="add-source">Add a source</button>';
  d.querySelector('[data-action="add-source"]').addEventListener('click', () => openSheet('source'));
  return d;
}

function buildDayLoading(day) {
  const empty = el('div', 'empty');
  empty.innerHTML =
    '<div class="empty-glyph" aria-hidden="true">' + ICONS.refresh + '</div>' +
    '<h3>Loading ' + esc(navTitle(day).toLowerCase()) + '…</h3>' +
    '<p>Preparing this day.</p>';
  return empty;
}

function buildAppCredit() {
  const footer = el('footer', 'app-footer');
  footer.setAttribute('aria-label', 'Dispatch');
  footer.innerHTML =
    '<span class="app-footer__brand">dispatch</span>' +
    '<span class="app-footer__byline">by <a href="https://gbrlpzz.com/" target="_blank" rel="noopener noreferrer">gbrlpzz</a></span>';
  return footer;
}

function visibleDayItems(cached) {
  if (!cached) return [];
  const seen = new Set();
  return cached
    .filter((item) => !isFilteredYouTubeItem(item))
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .filter((item) => {
      const key = itemIdentity(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function animateDayReflow(before) {
  if (prefersReducedMotion()) return;
  const view = $('#dayview');
  const cards = view.querySelectorAll('.card[data-item-key]');
  for (const card of cards) {
    const previous = before.get(card.dataset.itemKey);
    if (!previous) continue;
    const current = card.getBoundingClientRect();
    const delta = previous.top - current.top;
    if (Math.abs(delta) < 1) continue;
    card.style.transition = 'none';
    card.style.transform = 'translateY(' + delta + 'px)';
    requestAnimationFrame(() => {
      card.style.transition = 'transform 0.56s var(--spring)';
      card.style.transform = 'translateY(0)';
      setTimeout(() => {
        card.style.transition = '';
        card.style.transform = '';
      }, motionDelay(620));
    });
  }
}

function renderDayIncremental() {
  const day = state.day;
  const key = dayKey(day);
  const cached = state.dayCache.get(key);
  if (cached === undefined) return;

  const view = $('#dayview');
  if (!view) return;
  const items = visibleDayItems(cached);
  const srcById = new Map(state.sources.map((s) => [s.id, s]));
  const before = new Map(
    [...view.querySelectorAll('.card[data-item-key]')]
      .map((card) => [card.dataset.itemKey, card.getBoundingClientRect()])
  );
  const existing = new Map(
    [...view.querySelectorAll('.card[data-item-key]')]
      .map((card) => [card.dataset.itemKey, card])
  );
  let insertedCount = 0;
  const footer = view.querySelector('.app-footer') || buildAppCredit();
  view.appendChild(footer);

  for (const card of existing.values()) {
    if (!items.some((item) => itemIdentity(item) === card.dataset.itemKey)) card.remove();
  }
  view.querySelectorAll('.empty').forEach((empty) => empty.remove());

  if (!items.length) {
    view.insertBefore(buildEmpty(day), footer);
  } else {
    for (const item of items) {
      const source = srcById.get(item.sourceId);
      let card = existing.get(itemIdentity(item));
      if (!card) {
        insertedCount++;
        card = buildItemCard(item, source);
        // Keep the initial network reconciliation quiet. Later background
        // additions can animate once the launch pass has settled.
        if (!state.startupRefreshActive) card.classList.add('card--incoming');
      } else if (card.dataset.renderKey !== itemRenderKey(item, source)) {
        const fresh = buildItemCard(item, source);
        card.innerHTML = fresh.innerHTML;
        card.dataset.renderKey = fresh.dataset.renderKey;
      }
      view.insertBefore(card, footer);
    }
  }

  view.appendChild(footer);
  if (insertedCount && !state.startupRefreshActive) animateDayReflow(before);
  state.renderedDayKey = key;
  $('#nav-title').textContent = navTitle(day);
}

function renderDay() {
  const day = state.day;
  const key = dayKey(day);
  const view = $('#dayview');
  const cached = state.dayCache.get(key);
  const hasMountedDay = state.renderedDayKey === key && view.querySelector('.card, .empty');
  if (hasMountedDay) {
    $('#nav-title').textContent = navTitle(day);
    if (cached === undefined) return;
    renderDayIncremental();
    return;
  }
  const items = visibleDayItems(cached);
  const srcById = new Map(state.sources.map((s) => [s.id, s]));

  const frag = document.createDocumentFragment();
  if (cached === undefined) {
    frag.appendChild(buildDayLoading(day));
  } else {
    for (const it of items) {
      const src = srcById.get(it.sourceId);
      frag.appendChild(buildItemCard(it, src));
    }
    if (!items.length) frag.appendChild(buildEmpty(day));
  }
  frag.appendChild(buildAppCredit());

  view.innerHTML = '';
  view.appendChild(frag);
  state.renderedDayKey = key;
  $('#nav-title').textContent = navTitle(day);
}

function renderAll(options = {}) {
  renderStrip(options);
  renderDay();
  renderSourcesList();
  const key = dayKey(state.day);
  if (state.db && !state.dayCache.has(key)) requestDayWindow(state.day);
  else scheduleMediaPreload();
}

function dismissBootScreen() {
  const boot = $('#boot-screen');
  if (boot) boot.remove();
}

/* ---------------- Rendering: sources screen ---------------- */

function typeLabel(t) {
  return t === 'youtube' ? 'YouTube' : t === 'podcast' ? 'Podcast' : 'Text feed';
}

function sourceTypeLabel(source) {
  return isSubstackSource(source) ? 'Text feed' : typeLabel(source.type);
}

function sourceSub(source) {
  if (state.fetchingSourceIds.has(source.id)) return sourceTypeLabel(source) + ' · updating…';
  if (source.lastError) return 'Refresh failed' + (source.lastFetchedAt ? ' · updated ' + timeAgo(source.lastFetchedAt) : '');
  if (source.lastFetchedAt) return sourceTypeLabel(source) + ' · updated ' + timeAgo(source.lastFetchedAt);
  return sourceTypeLabel(source) + ' · not fetched yet';
}

function buildSourceRow(source, onDelete) {
  const row = el('div', 'source-row');
  row.dataset.id = source.id;
  const letter = esc(source.title.trim()[0].toUpperCase() || '?');
  const icon = source.iconUrl
    ? '<span class="source-letter" aria-hidden="true">' + letter + '</span><img src="' + esc(source.iconUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">'
    : letter;
  row.innerHTML =
    '<div class="source-icon" aria-hidden="true">' + icon + '</div>' +
    '<div class="s-text">' +
      '<div class="s-title">' + esc(source.title) + '</div>' +
      '<div class="s-sub' + (source.lastError ? ' s-sub--error' : '') + '">' + esc(sourceSub(source)) + '</div>' +
    '</div>' +
    '<span class="s-chevron" aria-hidden="true">' + ICONS.chevron + '</span>' +
    '<button class="s-refresh" type="button" aria-label="Refresh ' + esc(source.title) + '">' +
      '<span class="s-refresh__icon" aria-hidden="true">' + ICONS.refresh + '</span>' +
      '<span>Refresh</span>' +
    '</button>' +
    '<button class="s-delete" type="button" aria-label="Delete ' + esc(source.title) + '">Delete</button>';

  // Swipe left for Refresh and right for Delete.
  const actionWidth = 92;
  const revealThreshold = 46;
  let startX = null, startY = null, curDx = 0;
  let openDirection = 0, dragging = false, axis = null, suppressClick = false;
  const isActionTarget = (target) => !!(target && target.closest && target.closest('.s-delete, .s-refresh'));

  const resetOpenState = () => {
    openDirection = 0;
    row.style.transform = 'translateX(0)';
  };
  const revealAction = (direction) => {
    openDirection = direction;
    row.style.transition = '';
    row.style.transform = 'translateX(' + (direction * actionWidth) + 'px)';
  };

  const delBtn = row.querySelector('.s-delete');
  delBtn.addEventListener('focus', () => revealAction(1));
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetOpenState();
    removeSource(source.id).then(() => toast('Removed “' + source.title + '”'));
  });

  const refreshBtn = row.querySelector('.s-refresh');
  refreshBtn.addEventListener('focus', () => revealAction(-1));
  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetOpenState();
    refreshBtn.setAttribute('aria-busy', 'true');
    refreshBtn.classList.add('s-refresh--busy');
    void refreshOneSource(source.id)
      .catch(() => {})
      .finally(() => {
        refreshBtn.removeAttribute('aria-busy');
        refreshBtn.classList.remove('s-refresh--busy');
      });
  });

  const down = (x, y, pid) => {
    if (dragging) return;
    startX = x;
    startY = y;
    axis = null;
    curDx = openDirection * actionWidth;
    dragging = true;
    if (pid != null) { try { row.setPointerCapture(pid); } catch (e) { /* synthetic */ } }
  };
  const move = (x, y) => {
    if (!dragging || startX == null || startY == null) return;
    const dx = x - startX;
    const dy = y - startY;
    if (!axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'y') {
        dragging = false;
        return;
      }
    }
    if (axis !== 'x') return;
    const next = Math.max(-actionWidth, Math.min(actionWidth, curDx + dx));
    row.style.transition = 'none';
    row.style.transform = 'translateX(' + next + 'px)';
  };
  const settle = (x) => {
    if (!dragging) return;
    dragging = false;
    if (axis === 'x') {
      const finalX = typeof x === 'number' ? x : startX;
      const finalDx = curDx + finalX - startX;
      if (finalDx <= -revealThreshold) openDirection = -1;
      else if (finalDx >= revealThreshold) openDirection = 1;
      else openDirection = 0;
      suppressClick = true;
    }
    row.style.transition = '';
    row.style.transform = 'translateX(' + (openDirection * actionWidth) + 'px)';
  };

  row.addEventListener('touchstart', (e) => {
    if (isActionTarget(e.target)) return;
    const t = e.touches && e.touches[0];
    if (t) down(t.clientX, t.clientY, null);
  }, { passive: true });
  row.addEventListener('touchmove', (e) => {
    const t = e.touches && e.touches[0];
    if (t) move(t.clientX, t.clientY);
  }, { passive: true });
  row.addEventListener('touchend', (e) => {
    const t = e.changedTouches && e.changedTouches[0];
    settle(t ? t.clientX : startX);
  });
  row.addEventListener('pointerdown', (e) => {
    if (isActionTarget(e.target)) return;
    down(e.clientX, e.clientY, e.pointerId);
  });
  row.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
  row.addEventListener('pointerup', (e) => settle(e.clientX));
  row.addEventListener('pointercancel', () => settle(startX));
  row.addEventListener('click', (e) => {
    if (suppressClick) {
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (openDirection) {
      resetOpenState();
      e.stopPropagation();
    }
  });
  return row;
}
function renderSourcesList() {
  const list = $('#sources-list');
  const groups = el('div', 'source-group');
  for (const s of state.sources) groups.appendChild(buildSourceRow(s));

  list.innerHTML = '';
  if (state.sources.length === 0) {
    const empty = el('div', 'empty');
    empty.innerHTML =
      '<div class="empty-glyph" aria-hidden="true">' + ICONS.text + '</div>' +
      '<h3>No sources yet</h3>' +
      '<p>Add a Substack, a YouTube channel, a podcast or any RSS feed.</p>' +
      '<button type="button" class="pill pill--primary" data-action="add-source">Add a source</button>';
    empty.querySelector('[data-action="add-source"]').addEventListener('click', () => openSheet('source'));
    list.appendChild(empty);
  } else {
    list.appendChild(groups);
  }

  const footer = el('p', 'sources-footer');
  footer.id = 'sources-footer';
  footer.innerHTML =
    'Swipe left to refresh · swipe right to delete.<br>' +
    'Deleting a source removes its items from every day.';
  list.appendChild(footer);
}
/* ---------------- Sheets ---------------- */

let sheetMode = null;
let sheetOpener = null;
let sourcesOpener = null;
let sourcesFocusFrame = null;

function openSheet(mode) {
  sheetMode = mode;
  sheetOpener = document.activeElement;
  $('#backdrop').hidden = false;
  const sheet = sheetEl();
  sheet.hidden = false;
  syncAppInert();
  requestAnimationFrame(() => sheet.classList.add('sheet-open'));
  buildSheet(mode);
}

function closeSheet() {
  const sheet = sheetEl();
  sheet.classList.remove('sheet-open');
  $('#backdrop').hidden = true;
  setTimeout(() => {
    sheet.hidden = true;
    sheetMode = null;
    syncAppInert();
    if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus();
    sheetOpener = null;
  }, motionDelay(460));
}

function openSourcesScreen() {
  sourcesOpener = document.activeElement;
  const screen = sourcesScreenEl();
  screen.hidden = false;
  syncAppInert();
  if (sourcesFocusFrame) cancelAnimationFrame(sourcesFocusFrame);
  sourcesFocusFrame = requestAnimationFrame(() => {
    sourcesFocusFrame = null;
    if (!screen.hidden) screen.focus({ preventScroll: true });
  });
}

function closeSourcesScreen() {
  const screen = sourcesScreenEl();
  screen.hidden = true;
  syncAppInert();
  if (sourcesFocusFrame) {
    cancelAnimationFrame(sourcesFocusFrame);
    sourcesFocusFrame = null;
  }
  if (sourcesOpener && document.contains(sourcesOpener)) sourcesOpener.focus();
  sourcesOpener = null;
}

function buildSheet(mode) {
  const body = $('#sheet-body');
  body.innerHTML = '';
  if (mode === 'source') return buildSourceSheet();
  if (mode === 'info') return buildInfoSheet();
}

function sheetNav(title, actionLabel, onAction, actionEnabled) {
  const nav = el('div', 'sheet-nav');
  nav.innerHTML =
    '<button class="nav-btn" data-sheet-cancel>Cancel</button>' +
    '<h2 id="sheet-title">' + esc(title) + '</h2>' +
    '<button class="nav-btn nav-btn--icon nav-btn--disabled" data-sheet-action disabled>' + esc(actionLabel) + '</button>';
  nav.querySelector('[data-sheet-cancel]').addEventListener('click', closeSheet);
  const action = nav.querySelector('[data-sheet-action]');
  action.addEventListener('click', onAction);
  if (actionEnabled) {
    action.disabled = false;
    action.classList.remove('nav-btn--disabled');
  }
  return nav;
}

function fieldRow(icon, placeholder, inputAttrs) {
  const wrap = el('div', 'field');
  wrap.innerHTML = '<span aria-hidden="true">' + icon + '</span>';
  const input = document.createElement('input');
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  input.autocapitalize = 'off';
  input.autocorrect = 'off';
  input.spellcheck = false;
  for (const [k, v] of Object.entries(inputAttrs || {})) input.setAttribute(k, v);
  wrap.appendChild(input);
  return { wrap, input };
}

const FEEDBACK_URL = 'https://github.com/gbrlpzz/dispatch/issues/new?title=Dispatch%20feedback&body=What%20would%20you%20like%20to%20share%3F%0A%0ADevice%20and%20browser%20(optional)%3A%0A';

function buildInfoSheet() {
  const body = $('#sheet-body');
  body.innerHTML = '';

  const nav = el('div', 'sheet-nav');
  nav.innerHTML =
    '<button class="nav-btn" data-sheet-cancel>Close</button>' +
    '<h2 id="sheet-title">About Dispatch</h2>' +
    '<span class="sheet-nav__balance" aria-hidden="true"></span>';
  nav.querySelector('[data-sheet-cancel]').addEventListener('click', closeSheet);

  const content = el('div', 'info-sheet');
  content.innerHTML =
    '<img class="info-sheet__logo" src="icons/favicon.svg" alt="" />' +
    '<h3>Dispatch</h3>' +
    '<p class="info-sheet__lede">A quiet daily reader for the sources you choose.</p>' +
    '<p class="info-sheet__note">Your sources and reading history stay on this device.</p>' +
    '<a class="pill info-sheet__feedback" href="' + esc(FEEDBACK_URL) + '" target="_blank" rel="noopener noreferrer">' +
      '<span>Send feedback</span><span class="pill-arrow" aria-hidden="true">↗</span>' +
    '</a>';

  body.appendChild(nav);
  body.appendChild(content);
  nav.querySelector('[data-sheet-cancel]').focus();
}

function buildSourceSheet() {
  const body = $('#sheet-body');
  body.innerHTML = '';
  const urlRow = fieldRow(ICONS.link, 'Feed or channel URL');
  urlRow.input.type = 'url';
  urlRow.input.inputMode = 'url';
  urlRow.input.enterKeyHint = 'done';

  const nav = sheetNav('Add Source', 'Add', async () => {
    const btn = nav.querySelector('[data-sheet-action]');
    const url = urlRow.input.value.trim();
    if (!url || btn.dataset.busy) return;
    btn.dataset.busy = '1';
    btn.disabled = true;
    btn.textContent = 'Adding…';
    btn.classList.add('nav-btn--disabled');
    urlRow.input.disabled = true;
    try {
      const src = await addSource(url);
      closeSheet();
      toast('Source added');
    } catch (err) {
      btn.dataset.busy = '';
      btn.disabled = false;
      btn.textContent = 'Add';
      btn.classList.remove('nav-btn--disabled');
      urlRow.input.disabled = false;
      toast(err && err.message ? err.message : 'Could not add this source.');
      urlRow.input.focus();
    }
  }, false);

  body.appendChild(nav);
  body.appendChild(el('div', 'field-label', 'URL'));
  body.appendChild(urlRow.wrap);

  const action = nav.querySelector('[data-sheet-action]');
  const updateAction = () => {
    const hasUrl = urlRow.input.value.trim().length >= 8;
    const disabled = !hasUrl || !!action.dataset.busy;
    action.disabled = disabled;
    action.classList.toggle('nav-btn--disabled', disabled);
  };
  urlRow.input.addEventListener('input', updateAction);
  urlRow.input.addEventListener('change', updateAction);
  urlRow.input.addEventListener('paste', () => setTimeout(updateAction, 0));
  urlRow.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !action.classList.contains('nav-btn--disabled')) {
      e.preventDefault();
      action.click();
    }
  });
  urlRow.input.focus();
}

/* ---------------- Toast ---------------- */

let toastTimer = null;
let refreshStatusTimer = null;

function beginRefreshFeedback() {
  const status = $('#refresh-status');
  if (!status) return;
  if (refreshStatusTimer) clearTimeout(refreshStatusTimer);
  refreshStatusTimer = setTimeout(() => {
    status.hidden = false;
  }, 220);
}

function endRefreshFeedback() {
  if (refreshStatusTimer) {
    clearTimeout(refreshStatusTimer);
    refreshStatusTimer = null;
  }
  const status = $('#refresh-status');
  if (status) status.hidden = true;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------------- Day navigation + swipe pager ---------------- */

function setDay(d, options = {}) {
  const next = addDays(d, 0);
  next.setHours(0, 0, 0, 0);
  const today = todayMidnight();
  if (next > today) return;
  state.day = next;
  // Keep one more date ready when navigation reaches either visible edge.
  // This also lets the desktop strip grow progressively when all current
  // bubbles fit without requiring a physical scroll gesture.
  if (state.stripRange) {
    if (next <= addDays(state.stripRange.start, 1)) {
      state.stripRange.start = addDays(state.stripRange.start, -STRIP_EXTEND);
    } else if (next >= addDays(state.stripRange.end, -1) && state.stripRange.end < today) {
      state.stripRange.end = addDays(state.stripRange.end, STRIP_EXTEND);
      if (state.stripRange.end > today) state.stripRange.end = today;
    }
  }
  // Every intentional focus change recentres the complete carousel. The
  // spotlight settle calls this too, so the selected circle cannot drift.
  renderAll({ center: options.center !== false, smooth: options.smooth !== false });
}

function goToDay(offset) {
  const dir = offset > 0 ? 1 : -1;
  if (dir > 0 && state.day >= todayMidnight()) return;
  const w = $('#pager').clientWidth || window.innerWidth;
  const view = $('#dayview');
  if (view.dataset.swiping === '1') return;
  if (prefersReducedMotion()) {
    setDay(addDays(state.day, dir));
    return;
  }
  view.style.transition = 'transform 0.38s var(--ease)';
  view.style.transform = 'translateX(' + (-dir * w) + 'px)';
  setTimeout(() => {
    setDay(addDays(state.day, dir));
    view.style.transition = 'none';
    view.style.transform = 'translateX(0)';
  }, 390);
}

function initSwipe() {
  const pager = $('#pager');
  const view = $('#dayview');
  let startX = 0, startY = 0, axis = null, active = false, dx = 0;

  const onDown = (x, y) => {
    if (!sheetEl().hidden || !sourcesScreenEl().hidden) return;
    startX = x; startY = y;
    axis = null; active = true; dx = 0;
  };
  const onMove = (x, y, e) => {
    if (!active) return;
    const mx = x - startX;
    const my = y - startY;
    if (!axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    }
    if (axis === 'y') { active = false; return; }
    if (e && e.cancelable) e.preventDefault();
    dx = mx;
    view.style.transition = 'none';
    view.style.transform = 'translateX(' + mx + 'px)';
  };
  const end = () => {
    if (!active) return;
    active = false;
    if (axis !== 'x') return;
    const w = pager.clientWidth || window.innerWidth;
    const threshold = Math.min(90, w * 0.22);
    if (Math.abs(dx) > threshold) {
      const dir = dx < 0 ? 1 : -1;
      if (dir > 0 && state.day >= todayMidnight()) {
        view.style.transition = 'transform 0.32s var(--ease)';
        view.style.transform = 'translateX(0)';
        return;
      }
      if (prefersReducedMotion()) {
        setDay(addDays(state.day, dir));
        return;
      }
      view.dataset.swiping = '1';
      view.style.transition = 'transform 0.38s var(--ease)';
      view.style.transform = 'translateX(' + (-dir * w) + 'px)';
      setTimeout(() => {
        setDay(addDays(state.day, dir));
        view.style.transition = 'none';
        view.style.transform = 'translateX(0)';
        view.dataset.swiping = '0';
      }, 390);
    } else {
      view.style.transition = 'transform 0.32s var(--ease)';
      view.style.transform = 'translateX(0)';
    }
  };

  // Touch path — primary (iOS Safari, mobile Chrome)
  pager.addEventListener('touchstart', (e) => {
    const t = e.touches && e.touches[0];
    if (t) onDown(t.clientX, t.clientY);
  }, { passive: true });
  pager.addEventListener('touchmove', (e) => {
    const t = e.touches && e.touches[0];
    if (t) onMove(t.clientX, t.clientY, e);
  }, { passive: false });
  pager.addEventListener('touchend', end);
  pager.addEventListener('touchcancel', end);

  // Pointer path — desktop mouse drag fallback (mouse events only)
  pager.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return; // handled by touch path
    onDown(e.clientX, e.clientY);
  });
  pager.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    onMove(e.clientX, e.clientY, e);
  });
  pager.addEventListener('pointerup', end);
  pager.addEventListener('pointercancel', end);
}

/* ---------------- Pull to refresh ---------------- */

function initPullToRefresh() {
  const view = $('#dayview');
  let startY = 0, pulling = false, dy = 0;

  const onDown = (y) => {
    if (view.scrollTop <= 0) { startY = y; pulling = true; dy = 0; }
  };
  const onMove = (y, e) => {
    if (!pulling) return;
    const my = y - startY;
    if (my < 0) { pulling = false; return; }
    dy = Math.min(120, my * 0.5);
  };
  const end = () => {
    if (!pulling) return;
    pulling = false;
    if (dy >= 60) {
      void refreshAll(true, { notify: true }).catch(() => {
        toast('Couldn’t refresh — check your connection');
      });
    }
    dy = 0;
  };

  view.addEventListener('touchstart', (e) => {
    const t = e.touches && e.touches[0];
    if (t) onDown(t.clientY);
  }, { passive: true });
  view.addEventListener('touchmove', (e) => {
    const t = e.touches && e.touches[0];
    if (t) onMove(t.clientY, e);
  }, { passive: true });
  view.addEventListener('touchend', end);
  view.addEventListener('touchcancel', end);

  view.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    onDown(e.clientY);
  });
  view.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    onMove(e.clientY, e);
  });
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
}

/* ---------------- Navigation wiring ---------------- */

function initSheetDismiss() {
  // Native iOS sheet behaviour: drag down from the grabber (or from a
  // scrolled-to-top body) to dismiss; release past the threshold to close.
  const sheet = sheetEl();
  let startY = null, dy = 0, dragging = false;

  sheet.addEventListener('touchstart', (e) => {
    if (sheetEl().hidden) return;
    const onGrabber = !!e.target.closest('#sheet-grabber');
    if (!onGrabber) return;
    startY = e.touches[0].clientY;
    dy = 0;
    dragging = false;
  }, { passive: true });

  sheet.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const y = e.touches[0].clientY;
    const d = y - startY;
    if (d <= 0) return;
    dragging = true;
    dy = Math.min(220, d * 0.6);
    sheet.style.transition = 'none';
    sheet.style.transform = 'translateY(' + dy + 'px)';
  }, { passive: true });

  const end = () => {
    if (startY == null) return;
    startY = null;
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    if (dy >= 110) {
      closeSheet();
    } else {
      sheet.style.transform = 'translateY(0)';
    }
    dy = 0;
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}

function initStripSpotlight() {
  // Scrolling the strip moves the whole carousel through a fixed centre;
  // the date that lands in the centre becomes the selected day.
  const strip = $('#strip');
  let timer = null;
  const settle = () => {
    const rect = strip.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    let best = null, bestD = Infinity;
    for (const b of strip.querySelectorAll('.bubble')) {
      const r = b.getBoundingClientRect();
      const d = Math.abs((r.left + r.width / 2) - cx);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) {
      const key = best.dataset.day;
      if (key && key !== dayKey(state.day)) setDay(fromDayKey(key), { center: true, smooth: false });
    }
  };
  let extensionFrame = null;
  strip.addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(settle, 140);
    if (extensionFrame == null) {
      extensionFrame = requestAnimationFrame(() => {
        extensionFrame = null;
        maybeExtendStripRange();
      });
    }
  }, { passive: true });
  if ('onscrollend' in strip) {
    strip.addEventListener('scrollend', () => { clearTimeout(timer); settle(); });
  }
}

function focusableWithin(root) {
  return Array.from(root.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )).filter((node) => !node.hidden && !node.closest('[hidden]') && node.getClientRects().length);
}

function trapOverlayFocus(event) {
  if (event.key !== 'Tab') return false;
  const overlay = !sheetEl().hidden
    ? sheetEl()
    : (!sourcesScreenEl().hidden ? sourcesScreenEl() : null);
  if (!overlay) return false;

  const focusable = focusableWithin(overlay);
  if (!focusable.length) {
    event.preventDefault();
    return true;
  }
  const active = document.activeElement;
  if (!overlay.contains(active)) {
    event.preventDefault();
    focusable[0].focus();
    return true;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function initNav() {
  $('#today-btn').addEventListener('click', () => setDay(todayMidnight()));
  $('#add-btn').addEventListener('click', () => openSheet('source'));
  $('#sources-btn').addEventListener('click', openSourcesScreen);
  $('#sources-done').addEventListener('click', closeSourcesScreen);

  $('#strip').addEventListener('click', (e) => {
    const b = e.target.closest('.bubble');
    if (!b) return;
    setDay(fromDayKey(b.dataset.day));
  });

  $('#backdrop').addEventListener('click', closeSheet);

  $('#sources-add').addEventListener('click', () => openSheet('source'));
  $('#sources-info').addEventListener('click', () => openSheet('info'));
}

/* ---------------- Auto refresh ---------------- */

function scheduleDayPreload() {
  setTimeout(() => {
    const start = () => {
      void requestDayWindow(state.day, false, { preloadBack: DAY_PRELOAD_BACK })
        .catch(() => {});
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(start, { timeout: 1800 });
    } else {
      setTimeout(start, 0);
    }
  }, BACKGROUND_REFRESH_DELAY_MS + 150);
}

function scheduleBackgroundRefresh(
  delay = BACKGROUND_REFRESH_DELAY_MS,
  force = false,
  startup = false
) {
  if (state.backgroundRefreshTimer) return;
  state.backgroundRefreshTimer = setTimeout(() => {
    state.backgroundRefreshTimer = null;
    const start = () => {
      const promise = refreshAll(force, { notify: false, background: true });
      if (startup) {
        void promise.then(
          () => { state.startupRefreshActive = false; },
          () => { state.startupRefreshActive = false; }
        );
      }
    };

    // requestIdleCallback lets the first cached frame, scrolling and input
    // win over network parsing. Safari gets the timer fallback.
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(start, { timeout: Math.max(1000, delay + 1200) });
    } else {
      setTimeout(start, 0);
    }
  }, Math.max(0, delay));
}

function scheduleBackgroundEnrichment() {
  setTimeout(() => {
    const refresh = state.backgroundRefreshPromise || Promise.resolve();
    void refresh
      .catch(() => {})
      .then(() => upgradeYouTubeSources())
      .then(() => upgradeYouTubeSourceIcons())
      .then(() => upgradeMissingArticleImages())
      .catch(() => {});
  }, 3500);
}

async function maybeAutoRefresh() {
  const now = Date.now();
  const stale = state.sources.some((source) =>
    !source.lastFetchedAt ||
    (now - new Date(source.lastFetchedAt).getTime()) > BACKGROUND_REFRESH_MAX_AGE_MS
  );
  if (stale && !state.fetching && !state.backgroundRefreshing) {
    return refreshAll(false, { notify: false, background: true });
  }
  return { succeeded: 0, failed: 0 };
}

function initAutoRefresh() {
  const resume = () => {
    if (!document.hidden) scheduleBackgroundRefresh(250);
  };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  setInterval(() => {
    if (!document.hidden) scheduleBackgroundRefresh(0);
  }, BACKGROUND_REFRESH_INTERVAL_MS);
}

/* ---------------- Boot ---------------- */

async function init() {
  state.db = await openDB();
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  state.sources = await storeGetAll('sources');
  if (!state.sources.length) {
    state.sources = await restoreSourcesFromSnapshot();
  }
  // Do not pull the complete archive into memory. The durable IndexedDB
  // archive is queried for the previous week and today only.
  state.items = [];
  // Hydrate only the visible day before the first paint. The previous
  // seven days are read from IndexedDB in the background immediately after.
  await requestDayWindow(state.day, false, { preloadBack: 0 });
  state.sources.sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
  persistSourceSnapshot();

  initNav();
  initSwipe();
  initStripSpotlight();
  initSheetDismiss();
  initPullToRefresh();
  initAutoRefresh();

  // Paint the local archive first. Network refresh and enrichment are
  // scheduled after that frame, so opening Dispatch never waits for feeds.
  renderAll();
  dismissBootScreen();
  scheduleDayPreload();
  scheduleBackgroundRefresh(BACKGROUND_REFRESH_DELAY_MS, true, true);
  scheduleBackgroundEnrichment();

  // Keyboard: day navigation, modal focus management, and ESC to close overlays.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!sheetEl().hidden) { closeSheet(); return; }
      if (!sourcesScreenEl().hidden) { closeSourcesScreen(); return; }
    }
    if (trapOverlayFocus(e)) return;
    if (!sheetEl().hidden || !sourcesScreenEl().hidden) return;
    if (e.key === 'ArrowLeft') goToDay(-1);
    else if (e.key === 'ArrowRight') goToDay(1);
    else if (e.key === 't') setDay(todayMidnight());
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    console.error(err);
    dismissBootScreen();
    toast('Dispatch could not start: ' + (err && err.message ? err.message : err));
  });
});
