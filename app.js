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
};

const STALE_OPEN_MS = 12 * 3600000;
const STALE_IDLE_MS = 24 * 3600000;
const SOURCE_SNAPSHOT_KEY = 'dispatch.source-snapshot.v1';

const sheetEl = () => $('#sheet');
const sourcesScreenEl = () => $('#sources-screen');

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

async function fetchText(url) {
  const headers = {
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.5',
  };
  try {
    const r = await fetchWithTimeout(url, { headers, redirect: 'follow' }, 8000);
    if (r.ok) return { text: await r.text(), via: 'direct' };
  } catch (e) { /* CORS or network — fall through to proxies */ }

  for (let i = 0; i < PROXIES.length; i++) {
    try {
      const r = await fetchWithTimeout(PROXIES[i](url), { headers }, 10000);
      if (!r.ok) continue;
      const text = await r.text();
      if (i === 0) {
        try {
          const envelope = JSON.parse(text);
          if (envelope && envelope.status >= 200 && envelope.status < 300 && typeof envelope.body === 'string') {
            return { text: envelope.body, via: 'proxy' };
          }
        } catch (e) { /* not the cors.io envelope */ }
        continue;
      }
      if (i === PROXIES.length - 1) {
        try {
          const j = JSON.parse(text);
          if (j && typeof j.contents === 'string') return { text: j.contents, via: 'proxy' };
        } catch (e) { /* not JSON */ }
        continue;
      }
      if (text && !/^\s*[{[]/.test(text)) return { text, via: 'proxy' };
    } catch (e) { /* try next proxy */ }
  }
  throw new Error('Could not fetch this URL from the browser (blocked by CORS).');
}

function looksLikeFeed(text) {
  const t = String(text || '').slice(0, 400).toLowerCase();
  return t.includes('<rss') || t.includes('<feed') || (t.includes('<?xml') && t.includes('<rss'));
}

async function fetchFeed(url) {
  const { text } = await fetchText(url);
  if (!looksLikeFeed(text)) throw new Error('This URL is not an RSS or Atom feed.');
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

function parseFeed(text, feedUrl) {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse this feed.');
  const root = doc.documentElement;
  const rootName = String(root.tagName || '').toLowerCase();

  let feedTitle = '', feedLink = '', feedIcon = '', feedGenerator = '';
  const items = [];

  if (rootName === 'rss' || rootName === 'rdf') {
    const channel = localChildren(root, 'channel')[0] || root;
    feedTitle = childText(channel, ['title']) || hostOf(feedUrl);
    feedLink = childText(channel, ['link']) || feedUrl;
    feedGenerator = childText(channel, ['generator']);
    const img = localChildren(channel, 'image')[0];
    if (img) feedIcon = childUrl(img, ['url']);
    feedIcon = feedIcon || childUrl(channel, ['image', 'icon', 'logo', 'thumbnail']);
    const entries = localChildren(channel, 'item');
    for (const it of entries) items.push(parseRssItem(it));
  } else if (rootName === 'feed') {
    feedTitle = childText(root, ['title']) || hostOf(feedUrl);
    feedLink = childAttr(root, ['link'], 'href') || feedUrl;
    feedGenerator = childText(root, ['generator']);
    feedIcon = childUrl(root, ['icon', 'logo', 'image']);
    const entries = localChildren(root, 'entry');
    for (const it of entries) items.push(parseAtomItem(it));
  } else {
    throw new Error('Unrecognized feed format.');
  }
  return { feedTitle, feedLink, feedIcon, feedGenerator, items };
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
  const isYouTube = !!(videoId || (link && /youtube\.com\/watch/.test(link)));

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
  const { text } = await fetchText(handleUrl);
  const m = text.match(/"channelId":"(UC[\w-]{22})"/) ||
            text.match(/"externalId":"(UC[\w-]{22})"/) ||
            text.match(/"browseId":"(UC[\w-]{22})"/);
  return m ? m[1] : null;
}

function youtubeChannelIdFromFeedUrl(feedUrl) {
  const m = String(feedUrl || '').match(/[?&]channel_id=(UC[\w-]{22})/i);
  return m ? m[1] : null;
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
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker));

  const source = state.sources.find((candidate) => candidate.id === sourceId);
  if (!source || source.type !== 'article') return;
  const byGuid = new Map(candidates.filter((item) => item.imageUrl).map((item) => [item.guid, item.imageUrl]));
  const updates = state.items
    .filter((item) => item.sourceId === sourceId && byGuid.has(item.guid) && item.imageUrl !== byGuid.get(item.guid))
    .map((item) => Object.assign({}, item, { imageUrl: byGuid.get(item.guid) }));
  if (!updates.length) return;

  try {
    await storeBulkPut('items', updates);
    state.items = await storeGetAll('items');
    renderAll();
  } catch (e) { /* keep the feed usable even if image enrichment cannot persist */ }
}

async function upgradeMissingArticleImages() {
  const now = Date.now();
  const articleSources = state.sources.filter((source) => {
    if (source.type !== 'article' || !source.lastFetchedAt) return false;
    return now - new Date(source.lastFetchedAt).getTime() <= STALE_OPEN_MS;
  });
  await Promise.all(articleSources.map(async (source) => {
    const missing = state.items
      .filter((item) => item.sourceId === source.id && !item.imageUrl && item.link)
      .map((item) => ({ guid: item.guid, link: item.link, imageUrl: '' }));
    if (missing.length) await enrichMissingArticleImages(source.id, missing);
  }));
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
  renderAll();
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
      const { text } = await fetchText(candidate);
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
      // YouTube still supports its lightweight legacy user RSS endpoint for
      // many app-shared handles. Try it first; hydration falls back to page
      // channel-id extraction when a handle is not mapped there.
      return {
        kind: 'source', type: 'youtube', platform: 'youtube', url,
        channelUrl: url,
        feedUrl: 'https://www.youtube.com/feeds/videos.xml?user=' + encodeURIComponent(user),
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
            feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId,
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
          feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId,
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
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId,
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

  source.title = parsed.feedTitle || source.title;
  source.siteUrl = parsed.feedLink || source.siteUrl;
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
  };
  const id = await storePut('sources', source);
  source.id = id;
  state.sources.push(source);
  persistSourceSnapshot();
  state.fetchingSourceIds.add(source.id);
  renderAll();
  void hydrateSource(source, resolved);
  return source;
}

async function hydrateSource(source, resolved) {
  if (!state.sources.some((s) => s.id === source.id)) return;
  try {
    let text;
    try {
      text = resolved.feedText || await fetchFeed(source.feedUrl);
    } catch (firstError) {
      // If the lightweight YouTube user feed is not mapped, fall back to the
      // channel page once and upgrade the source to its canonical UC feed.
      if (source.type === 'youtube' && /feeds\/videos\.xml\?user=/i.test(source.feedUrl)) {
        const channelId = await youtubeChannelIdFromPage(source.url);
        if (!channelId) throw firstError;
        source.channelId = channelId;
        source.channelUrl = source.channelUrl || source.url;
        source.feedUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId;
        text = await fetchFeed(source.feedUrl);
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
    const parsed = parseFeed(text, source.feedUrl);
    updateSourceMetadata(source, parsed, text);
    await storePut('sources', source);
    persistSourceSnapshot();

    // Item parsing/storage happens independently of the optional Apple
    // Podcasts search, so a slow lookup never delays the feed itself.
    const lookup = source.type === 'podcast' && !source.itunesUrl
      ? itunesLookup(parsed.feedTitle)
      : Promise.resolve(null);
    await fetchSource(source.id, parsed, text);
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
  renderAll();
}

async function fetchSource(sourceId, preParsed, preText) {
  const source = state.sources.find((s) => s.id === sourceId);
  if (!source) return;
  try {
    let parsed = preParsed;
    let feedText = preText || '';
    if (!parsed) {
      feedText = await fetchFeed(source.feedUrl);
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
        fetchedAt: now,
      });
    }
    // Upsert: keep existing ids for same (sourceId, guid)
    const existing = state.items.filter((i) => i.sourceId === sourceId);
    const byGuid = new Map(existing.map((i) => [i.guid, i]));
    const seen = new Set();
    const uniq = normalized.filter((n) => (seen.has(n.guid) ? false : (seen.add(n.guid), true)));
    const toPut = [];
    for (const n of uniq) {
      const old = byGuid.get(n.guid);
      if (old) {
        if (old.publishedAt === n.publishedAt && old.title === n.title && old.summary === n.summary &&
            old.author === n.author && old.link === n.link && old.imageUrl === n.imageUrl &&
            old.duration === n.duration && old.kind === n.kind) continue;
        toPut.push(Object.assign({}, old, n, { id: old.id }));
      } else {
        toPut.push(n);
      }
    }
    await storeBulkPut('items', toPut);

    // Bounded history: keep the newest MAX_ITEMS_PER_SOURCE items per source,
    // prune the rest so local storage stays minimal but the archive persists.
    const MAX_ITEMS_PER_SOURCE = 4000;
    const mine = state.items.filter((i) => i.sourceId === sourceId);
    if (mine.length > MAX_ITEMS_PER_SOURCE) {
      mine.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
      const keep = new Set(mine.slice(0, MAX_ITEMS_PER_SOURCE).map((i) => i.id));
      const drop = mine.filter((i) => !keep.has(i.id)).map((i) => i.id);
      const tx = state.db.transaction('items', 'readwrite');
      for (const id of drop) tx.objectStore('items').delete(id);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    }

    // Refresh in-memory items for this source
    state.items = state.items.filter((i) => i.sourceId !== sourceId);
    const fresh = await storeGetAll('items');
    state.items = fresh;

    source.lastFetchedAt = now;
    source.lastError = null;
    await storePut('sources', source);
    persistSourceSnapshot();
    if (source.type === 'article') void enrichMissingArticleImages(source.id, parsed.items);
    if (channelIconPromise) {
      void channelIconPromise.then((image) => saveYouTubeChannelIcon(source, image)).catch(() => {});
    }
  } catch (err) {
    source.lastError = err && err.message ? err.message : String(err);
    await storePut('sources', source);
    persistSourceSnapshot();
  }
}

async function refreshAll(force) {
  if (state.fetching) return;
  state.fetching = true;
  try {
    await Promise.all(state.sources.map((s) => fetchSource(s.id)));
    renderAll();
    if (state.sources.length && state.sources.every((s) => !!s.lastError)) {
      toast('Couldn’t refresh — check your connection');
    }
  } finally {
    state.fetching = false;
  }
}

async function upgradeYouTubeSourceIcons() {
  const pending = state.sources.filter(needsYouTubeChannelIcon);
  if (!pending.length) return;
  let changed = false;
  await Promise.all(pending.map(async (source) => {
    try {
      const image = await youtubeChannelImageFromSource(source);
      if (!image || !state.sources.some((s) => s.id === source.id)) return;
      await saveYouTubeChannelIcon(source, image);
      changed = true;
    } catch (e) { /* keep the existing fallback icon */ }
  }));
  if (changed) renderAll();
}

async function removeSource(id) {
  await deleteSourceCascade(id);
  state.sources = state.sources.filter((s) => s.id !== id);
  state.items = state.items.filter((i) => i.sourceId !== id);
  persistSourceSnapshot();
  renderAll();
}

/* ---------------- Rendering: strip ---------------- */

const STRIP_BACK = 120, STRIP_FWD = 14, STRIP_EXTEND = 30;

function ensureStripRange() {
  const today = todayMidnight();
  if (!state.stripRange) {
    state.stripRange = { start: addDays(today, -STRIP_BACK), end: addDays(today, STRIP_FWD) };
    return;
  }
  const d = state.day;
  if (d < state.stripRange.start) {
    state.stripRange.start = addDays(state.stripRange.start, -STRIP_EXTEND);
  } else if (d > state.stripRange.end) {
    state.stripRange.end = addDays(state.stripRange.end, STRIP_EXTEND);
  }
}

function renderStrip({ center = false, smooth = false } = {}) {
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
    else cls += ' bubble--future';
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
  } else if (selWasVisible) {
    strip.scrollLeft = prevScrollLeft;   // data refresh: don't yank the strip
  } else {
    scrollStripTo(selKey, false);        // first render / range extension
  }
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
    return '<span class="source-badge"><span class="badge-letter" aria-hidden="true">' + letter + '</span><img src="' + esc(source.iconUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>';
  }
  return '<span class="source-badge" aria-hidden="true">' + letter + '</span>';
}

function isAudioItem(item) {
  return !!item && (item.kind === 'podcast' || !!item.audioUrl);
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

function buildItemCard(item, source) {
  const card = el('a', 'card');
  card.href = cardTarget(item, source) || '#';
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.setAttribute('role', 'link');

  const substack = isSubstackSource(source);
  const podcastImage = item.imageUrl || (source && source.iconUrl) || '';
  const editorialImage = item.imageUrl || (substack ? podcastImage : '');
  let media = '';
  if (item.kind === 'youtube' && item.imageUrl) {
    media = '<div class="card-media">' +
      '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display=\'none\'">' +
      (item.duration ? '<span class="duration-badge mono-glyph">' + fmtDuration(item.duration) + '</span>' : '') +
      '</div>';
  } else if ((item.kind === 'article' || substack) && editorialImage) {
    media = '<div class="card-media">' +
      '<img src="' + esc(editorialImage) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display=\'none\'">' +
      '</div>';
  }

  let body;
  if (isAudioItem(item) && !substack) {
    const art = podcastImage
      ? '<img src="' + esc(podcastImage) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.classList.add(\'pod-art--fallback\')"><span class="pod-art-fallback" aria-hidden="true">' + KIND_META.podcast.icon + '</span>'
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
    '<span class="pill"><span>' + pillLabel(item, source) + '</span><span class="pill-arrow" aria-hidden="true">↗</span></span>';
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

function renderDay() {
  const day = state.day;
  const key = dayKey(day);
  const view = $('#dayview');
  const items = state.items
    .filter((i) => i.day === key)
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const srcById = new Map(state.sources.map((s) => [s.id, s]));

  const frag = document.createDocumentFragment();
  for (const it of items) {
    const src = srcById.get(it.sourceId);
    frag.appendChild(buildItemCard(it, src));
  }
  if (!items.length) {
    frag.appendChild(buildEmpty(day));
  }

  view.innerHTML = '';
  view.appendChild(frag);
  $('#nav-title').textContent = navTitle(day);
}

function renderAll(options = {}) {
  renderStrip(options);
  renderDay();
  renderSourcesList();
}

/* ---------------- Rendering: sources screen ---------------- */

function typeLabel(t) {
  return t === 'youtube' ? 'YouTube' : t === 'podcast' ? 'Podcast' : 'Text feed';
}

function sourceTypeLabel(source) {
  return isSubstackSource(source) ? 'Text feed' : typeLabel(source.type);
}

function sourceSub(source) {
  if (state.fetchingSourceIds.has(source.id)) return sourceTypeLabel(source) + ' · fetching…';
  if (source.lastError) return 'Error — ' + source.lastError;
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
    '<button class="s-delete" aria-label="Delete ' + esc(source.title) + '">Delete</button>';
  const delBtn = row.querySelector('.s-delete');
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeSource(source.id).then(() => toast('Removed “' + source.title + '”'));
  });

  // Swipe to reveal delete (horizontal drag on the row; touch + mouse)
  let startX = null, curDx = 0, open = false, dragging = false;
  const down = (x, pid) => {
    if (dragging) return;
    startX = x;
    curDx = open ? -92 : 0;
    dragging = true;
    if (pid != null) { try { row.setPointerCapture(pid); } catch (e) { /* synthetic */ } }
  };
  const move = (x) => {
    if (!dragging || startX == null) return;
    const dx = x - startX;
    const next = Math.max(-92, Math.min(0, curDx + dx));
    row.style.transition = 'none';
    row.style.transform = 'translateX(' + next + 'px)';
  };
  const settle = (x) => {
    if (!dragging) return;
    dragging = false;
    const dx = x - startX;
    open = (curDx + dx) < -46;
    row.style.transition = '';
    row.style.transform = open ? 'translateX(-92px)' : 'translateX(0)';
  };
  row.addEventListener('touchstart', (e) => { const t = e.touches && e.touches[0]; if (t) down(t.clientX, null); }, { passive: true });
  row.addEventListener('touchmove', (e) => { const t = e.touches && e.touches[0]; if (t) move(t.clientX); }, { passive: true });
  row.addEventListener('touchend', (e) => { const t = e.changedTouches && e.changedTouches[0]; settle(t ? t.clientX : startX); });
  row.addEventListener('pointerdown', (e) => { if (e.target.closest('.s-delete')) return; down(e.clientX, e.pointerId); });
  row.addEventListener('pointermove', (e) => move(e.clientX));
  row.addEventListener('pointerup', (e) => settle(e.clientX));
  row.addEventListener('pointercancel', () => settle(startX));
  row.addEventListener('click', (e) => {
    if (open) { open = false; row.style.transform = 'translateX(0)'; e.stopPropagation(); }
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
}

/* ---------------- Sheets ---------------- */

let sheetMode = null;
let sheetOpener = null;

function openSheet(mode) {
  sheetMode = mode;
  sheetOpener = document.activeElement;
  $('#backdrop').hidden = false;
  const sheet = sheetEl();
  sheet.hidden = false;
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
    if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus();
    sheetOpener = null;
  }, 380);
}

function buildSheet(mode) {
  const body = $('#sheet-body');
  body.innerHTML = '';
  if (mode === 'source') return buildSourceSheet();
}

function sheetNav(title, actionLabel, onAction, actionEnabled) {
  const nav = el('div', 'sheet-nav');
  nav.innerHTML =
    '<button class="nav-btn" data-sheet-cancel>Cancel</button>' +
    '<h2>' + esc(title) + '</h2>' +
    '<button class="nav-btn nav-btn--icon nav-btn--disabled" data-sheet-action>' + esc(actionLabel) + '</button>';
  nav.querySelector('[data-sheet-cancel]').addEventListener('click', closeSheet);
  const action = nav.querySelector('[data-sheet-action]');
  action.addEventListener('click', onAction);
  if (actionEnabled) action.classList.remove('nav-btn--disabled');
  return nav;
}

function fieldRow(icon, placeholder, inputAttrs) {
  const wrap = el('div', 'field');
  wrap.innerHTML = '<span aria-hidden="true">' + icon + '</span>';
  const input = document.createElement('input');
  input.placeholder = placeholder;
  input.autocapitalize = 'off';
  input.autocorrect = 'off';
  input.spellcheck = false;
  for (const [k, v] of Object.entries(inputAttrs || {})) input.setAttribute(k, v);
  wrap.appendChild(input);
  return { wrap, input };
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
    btn.textContent = 'Adding…';
    btn.classList.add('nav-btn--disabled');
    urlRow.input.disabled = true;
    try {
      const src = await addSource(url);
      closeSheet();
      toast('Source added');
    } catch (err) {
      btn.dataset.busy = '';
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
    action.classList.toggle('nav-btn--disabled', !hasUrl || !!action.dataset.busy);
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
  state.day = next;
  // Every intentional focus change recentres the complete carousel. The
  // spotlight settle calls this too, so the selected circle cannot drift.
  renderAll({ center: options.center !== false, smooth: options.smooth !== false });
}

function goToDay(offset) {
  const dir = offset > 0 ? 1 : -1;
  const w = $('#pager').clientWidth || window.innerWidth;
  const view = $('#dayview');
  if (view.dataset.swiping === '1') return;
  view.style.transition = 'transform 0.26s var(--ease)';
  view.style.transform = 'translateX(' + (-dir * w) + 'px)';
  setTimeout(() => {
    setDay(addDays(state.day, dir));
    view.style.transition = 'none';
    view.style.transform = 'translateX(0)';
  }, 270);
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
      view.dataset.swiping = '1';
      view.style.transition = 'transform 0.24s var(--ease)';
      view.style.transform = 'translateX(' + (-dir * w) + 'px)';
      setTimeout(() => {
        setDay(addDays(state.day, dir));
        view.style.transition = 'none';
        view.style.transform = 'translateX(0)';
        view.dataset.swiping = '0';
      }, 250);
    } else {
      view.style.transition = 'transform 0.2s var(--ease)';
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
  const indicator = $('#pull-indicator');
  let startY = 0, pulling = false, dy = 0;

  const onDown = (y) => {
    if (view.scrollTop <= 0) { startY = y; pulling = true; dy = 0; }
  };
  const onMove = (y, e) => {
    if (!pulling) return;
    const my = y - startY;
    if (my < 0) { pulling = false; return; }
    dy = Math.min(120, my * 0.5);
    indicator.hidden = false;
    indicator.style.transform = 'translateY(' + dy + 'px)';
    indicator.style.opacity = Math.min(1, dy / 70);
  };
  const end = () => {
    if (!pulling) return;
    pulling = false;
    if (dy >= 60) {
      indicator.style.transform = 'translateY(0)';
      indicator.style.opacity = '1';
      indicator.hidden = false;
      toast('Refreshing…');
      refreshAll(true).finally(() => {
        indicator.style.opacity = '0';
        setTimeout(() => { indicator.hidden = true; }, 300);
      });
    } else {
      indicator.style.transform = 'translateY(0)';
      indicator.style.opacity = '0';
      setTimeout(() => { indicator.hidden = true; }, 300);
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
  strip.addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(settle, 140);
  }, { passive: true });
  if ('onscrollend' in strip) {
    strip.addEventListener('scrollend', () => { clearTimeout(timer); settle(); });
  }
}

function initNav() {
  $('#today-btn').addEventListener('click', () => setDay(todayMidnight()));
  $('#add-btn').addEventListener('click', () => openSheet('source'));
  $('#sources-btn').addEventListener('click', () => { $('#sources-screen').hidden = false; });
  $('#sources-done').addEventListener('click', () => { $('#sources-screen').hidden = true; });

  $('#strip').addEventListener('click', (e) => {
    const b = e.target.closest('.bubble');
    if (!b) return;
    setDay(fromDayKey(b.dataset.day));
  });

  $('#backdrop').addEventListener('click', closeSheet);

  $('#sources-add').addEventListener('click', () => openSheet('source'));
}

/* ---------------- Auto refresh ---------------- */

async function maybeAutoRefresh() {
  const now = Date.now();
  const stale = state.sources.some((s) =>
    !s.lastFetchedAt || (now - new Date(s.lastFetchedAt).getTime()) > STALE_OPEN_MS);
  if (stale && !state.fetching) {
    await refreshAll();
    toast('Dispatch refreshed');
  }
}

function initAutoRefresh() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) maybeAutoRefresh();
  });
  setInterval(() => {
    const now = Date.now();
    const stale = state.sources.some((s) =>
      !s.lastFetchedAt || (now - new Date(s.lastFetchedAt).getTime()) > STALE_IDLE_MS);
    if (stale && !state.fetching) refreshAll();
  }, 30 * 60000);
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
  state.items = await storeGetAll('items');
  state.sources.sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));
  persistSourceSnapshot();

  initNav();
  initSwipe();
  initStripSpotlight();
  initSheetDismiss();
  initPullToRefresh();
  initAutoRefresh();

  renderAll();
  void upgradeYouTubeSourceIcons();
  void upgradeMissingArticleImages();
  maybeAutoRefresh();

  // keyboard: day navigation, ESC to close overlays
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!sourcesScreenEl().hidden) { sourcesScreenEl().hidden = true; return; }
      if (!sheetEl().hidden) { closeSheet(); return; }
    }
    if (!sheetEl().hidden || !sourcesScreenEl().hidden) return;
    if (e.key === 'ArrowLeft') goToDay(-1);
    else if (e.key === 'ArrowRight') goToDay(1);
    else if (e.key === 't') setDay(todayMidnight());
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    console.error(err);
    toast('Dispatch could not start: ' + (err && err.message ? err.message : err));
  });
});
