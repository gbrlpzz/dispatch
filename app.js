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

/* ---------------- Dates (device-local days) ---------------- */

const DAY_MS = 86400000;

function todayMidnight() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fromDayKey(k) { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd); }

function navTitle(d) {
  // Always the full date — the “Today” button already says Today.
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
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
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 15v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
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
  pins: [],
  db: null,
  fetching: false,
  stripRange: null, // { start: Date, end: Date }
};

const STALE_OPEN_MS = 12 * 3600000;
const STALE_IDLE_MS = 24 * 3600000;

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
      if (!db.objectStoreNames.contains('pins')) {
        const p = db.createObjectStore('pins', { keyPath: 'id', autoIncrement: true });
        p.createIndex('day', 'day');
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
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
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
    const r = await fetchWithTimeout(url, { headers, redirect: 'follow' });
    if (r.ok) return { text: await r.text(), via: 'direct' };
  } catch (e) { /* CORS or network — fall through to proxies */ }

  for (let i = 0; i < PROXIES.length; i++) {
    try {
      const r = await fetchWithTimeout(PROXIES[i](url), { headers });
      if (!r.ok) continue;
      const text = await r.text();
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
function attrOf(node, names) {
  for (const n of names) {
    const v = node.getAttribute(n);
    if (v && v.trim()) return v.trim();
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

  let feedTitle = '', feedLink = '', feedIcon = '';
  const items = [];

  if (rootName === 'rss' || rootName === 'rdf') {
    const channel = localChildren(root, 'channel')[0] || root;
    feedTitle = childText(channel, ['title']) || hostOf(feedUrl);
    feedLink = childText(channel, ['link']) || feedUrl;
    const img = localChildren(channel, 'image')[0];
    if (img) feedIcon = childText(img, ['url']);
    feedIcon = feedIcon || childAttr(channel, ['image'], 'href') || '';
    const entries = localChildren(channel, 'item');
    for (const it of entries) items.push(parseRssItem(it));
  } else if (rootName === 'feed') {
    feedTitle = childText(root, ['title']) || hostOf(feedUrl);
    feedLink = childAttr(root, ['link'], 'href') || feedUrl;
    feedIcon = childAttr(root, ['icon', 'logo'], 'href') || childText(root, ['icon', 'logo']) || '';
    const entries = localChildren(root, 'entry');
    for (const it of entries) items.push(parseAtomItem(it));
  } else {
    throw new Error('Unrecognized feed format.');
  }
  return { feedTitle, feedLink, feedIcon, items };
}

function parseRssItem(it) {
  const title = childText(it, ['title']);
  const link = childText(it, ['link']) || childAttr(it, ['link'], 'href') || '';
  const guid = childText(it, ['guid']) || childText(it, ['id']) || link;
  const pub = parseDate(childText(it, ['pubDate', 'date', 'published']));
  const author = childText(it, ['creator', 'author']) || '';
  const summary = truncate(stripHtml(childText(it, ['description', 'encoded', 'summary'])), 340);

  const enclosure = localChildren(it, 'enclosure')[0];
  const encUrl = enclosure ? enclosure.getAttribute('url') || '' : '';
  const encType = enclosure ? enclosure.getAttribute('type') || '' : '';

  const isAudio = /^audio\//.test(encType);
  const isImage = /^image\//.test(encType);

  // media group / thumbnail / content
  const mediaGroup = localChildren(it, 'group')[0] || it;
  let thumb = childAttr(mediaGroup, ['thumbnail', 'content'], 'url') || childAttr(it, ['thumbnail', 'content'], 'url');
  if (!thumb) thumb = encType && isImage ? encUrl : '';
  const mediaDur = parseDuration(attrOf(mediaGroup, ['duration']) || attrOf(it, ['duration']));

  const itunesDur = parseDuration(childText(it, ['duration']));
  const duration = itunesDur || mediaDur || null;

  const kind = isAudio ? 'podcast' : 'article';
  const image = kind === 'podcast' ? (childAttr(it, ['image'], 'href') || thumb || '') : (thumb || '');

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

  const enclosure = localChildren(en, 'enclosure')[0];
  const encUrl = enclosure ? enclosure.getAttribute('url') || '' : '';
  const encType = enclosure ? enclosure.getAttribute('type') || '' : '';
  const isAudio = /^audio\//.test(encType);

  const summary = truncate(stripHtml(childText(en, ['summary', 'content'])), 340);

  const videoId = childText(en, ['videoId']) ||
    (String(guid || '').match(/^yt:video:(.+)$/) || [])[1] || '';
  const isYouTube = !!(videoId || (link && /youtube\.com\/watch/.test(link)));

  const kind = isAudio ? 'podcast' : (isYouTube ? 'youtube' : 'article');
  const image = isYouTube
    ? (thumb || 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg')
    : (thumb || (isAudio ? childAttr(en, ['image'], 'href') : ''));

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
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function youtubeChannelIdFromUrl(u) {
  const m = u.pathname.match(/^\/channel\/(UC[\w-]{22})/i);
  return m ? m[1] : null;
}

async function youtubeChannelIdFromPage(handleUrl) {
  const { text } = await fetchText(handleUrl);
  const m = text.match(/"channelId":"(UC[\w-]{22})"/) ||
            text.match(/"externalId":"(UC[\w-]{22})"/) ||
            text.match(/"browseId":"(UC[\w-]{22})"/);
  return m ? m[1] : null;
}

async function oembed(url) {
  for (const ep of [
    'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url),
    'https://noembed.com/embed?url=' + encodeURIComponent(url),
  ]) {
    try {
      const r = await fetchWithTimeout(ep, {}, 10000);
      if (r.ok) {
        const j = await r.json();
        if (j && j.title) return j;
      }
    } catch (e) { /* try next */ }
  }
  return null;
}

async function ogFromPage(url) {
  try {
    const { text } = await fetchText(url);
    const mTitle = text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                   text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
                   text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const mImage = text.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                   text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return {
      title: mTitle ? mTitle[1].trim() : '',
      image: mImage ? mImage[1].trim() : '',
    };
  } catch (e) { return { title: '', image: '' }; }
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
    if (links.length) return links[0];
    // look for feedburner-style alternate without explicit type attr ordering
    const re2 = /<link[^>]+rel=["']alternate["'][^>]*>/gi;
    let m2;
    while ((m2 = re2.exec(text)) && links.length < 6) {
      const tag = m2[0];
      const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
      if (href) {
        const u = new URL(href, url).href;
        if (!links.includes(u)) links.push(u);
      }
    }
    return links.length ? links[0] : null;
  } catch (e) { return null; }
}

async function resolveFeedUrl(raw) {
  const url = normalizeUrl(raw);
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const isYouTubeHost = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';

  // --- YouTube ---
  if (isYouTubeHost) {
    if (host === 'youtu.be' || /\/watch\b/.test(u.pathname) || /\/shorts\//.test(u.pathname)) {
      const videoId = host === 'youtu.be'
        ? u.pathname.slice(1).split('/')[0]
        : (u.searchParams.get('v') || '');
      const embed = await oembed(url);
      return {
        kind: 'video',
        type: 'youtube',
        url,
        title: embed ? embed.title : 'YouTube video',
        author: embed && embed.author_name ? embed.author_name : '',
        image: embed && embed.thumbnail_url ? embed.thumbnail_url : 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
        feedUrl: null,
      };
    }
    const channelId = youtubeChannelIdFromUrl(u) || await youtubeChannelIdFromPage(url);
    if (!channelId) throw new Error('Could not find this YouTube channel. Use a channel page URL.');
    return {
      kind: 'source',
      type: 'youtube',
      url,
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId,
    };
  }

  // --- Feed-looking URL ---
  if (/\.(xml|rss|atom)(\?|$)/i.test(u.pathname)) {
    return { kind: 'source', type: 'article', url, feedUrl: url };
  }

  // --- Page scan for <link rel=alternate> ---
  const found = await findFeedLinkInHtml(url);
  if (found) {
    return { kind: 'source', type: 'article', url, feedUrl: found };
  }

  // --- Candidate feed paths ---
  const origin = u.origin;
  for (const cand of feedCandidates(origin)) {
    try {
      const { text } = await fetchText(cand);
      if (looksLikeFeed(text)) return { kind: 'source', type: 'article', url, feedUrl: cand };
    } catch (e) { /* keep trying */ }
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

/* ---------------- Add source / fetch ---------------- */

async function addSource(rawUrl) {
  const resolved = await resolveFeedUrl(rawUrl);
  if (resolved.kind === 'video') {
    throw new Error('That looks like a video link — use “Add Link to Day” for single links, or paste a channel page URL to follow the channel.');
  }
  const feedUrl = resolved.feedUrl;

  // dedupe
  if (state.sources.some((s) => s.feedUrl === feedUrl)) {
    throw new Error('This source is already added.');
  }

  const text = await fetchFeed(feedUrl);
  const parsed = parseFeed(text, feedUrl);
  let type = resolved.type === 'youtube' ? 'youtube' : 'article';
  if (parsed.items.some((i) => i.kind === 'podcast') ||
      /<itunes:/i.test(text.slice(0, 3000))) type = 'podcast';
  if (resolved.type === 'youtube') type = 'youtube';

  let itunesId = null, itunesUrl = null;
  if (type === 'podcast') {
    const it = await itunesLookup(parsed.feedTitle);
    if (it) { itunesId = it.itunesId; itunesUrl = it.itunesUrl; }
  }

  const siteUrl = parsed.feedLink || resolved.url;
  const source = {
    url: resolved.url,
    feedUrl,
    title: parsed.feedTitle,
    type,
    siteUrl,
    iconUrl: parsed.feedIcon || '',
    itunesId,
    itunesUrl,
    addedAt: new Date().toISOString(),
    lastFetchedAt: null,
    lastError: null,
  };
  const id = await storePut('sources', source);
  source.id = id;
  state.sources.push(source);
  await fetchSource(source.id, parsed, text);
  renderAll();
  return source;
}

async function fetchSource(sourceId, preParsed, preText) {
  const source = state.sources.find((s) => s.id === sourceId);
  if (!source) return;
  try {
    let parsed = preParsed;
    if (!parsed) {
      const text = await fetchFeed(source.feedUrl);
      parsed = parseFeed(text, source.feedUrl);
    }
    source.title = parsed.feedTitle || source.title;
    source.siteUrl = parsed.feedLink || source.siteUrl;
    if (parsed.feedIcon) source.iconUrl = parsed.feedIcon;

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
        if (old.publishedAt === n.publishedAt && old.title === n.title && old.summary === n.summary) continue;
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
  } catch (err) {
    source.lastError = err && err.message ? err.message : String(err);
    await storePut('sources', source);
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

async function removeSource(id) {
  await deleteSourceCascade(id);
  state.sources = state.sources.filter((s) => s.id !== id);
  state.items = state.items.filter((i) => i.sourceId !== id);
  renderAll();
}

/* ---------------- Pins ---------------- */

async function addPin({ day, url, note }) {
  const target = normalizeUrl(url);
  let title = hostOf(target);
  let image = '';
  let kind = 'link';
  const u = new URL(target);
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
    const em = await oembed(target);
    if (em) { title = em.title; image = em.thumbnail_url || ''; }
    kind = 'youtube';
  } else {
    const og = await ogFromPage(target);
    if (og.title) title = og.title;
    if (og.image) image = og.image;
  }
  const pin = {
    day,
    url: target,
    title: truncate(title, 200),
    note: String(note || '').trim(),
    imageUrl: image,
    kind,
    createdAt: new Date().toISOString(),
  };
  const id = await storePut('pins', pin);
  pin.id = id;
  state.pins.push(pin);
  renderAll();
}

async function removePin(id) {
  await storeDelete('pins', id);
  state.pins = state.pins.filter((p) => p.id !== id);
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

function renderStrip() {
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
  const wdFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  for (let d = state.stripRange.start; d <= state.stripRange.end; d = addDays(d, 1)) {
    const key = dayKey(d);
    let cls = 'bubble';
    if (key === selKey) cls += ' bubble--selected';
    else if (key === dayKey(today)) cls += ' bubble--today';
    else if (d < today) cls += ' bubble--past';
    else cls += ' bubble--future';
    const b = el('button', cls);
    b.setAttribute('aria-label', d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
    b.dataset.day = key;
    b.innerHTML = '<span class="wd">' + esc(wdFmt.format(d)) + '</span><span class="dn">' + d.getDate() + '</span>';
    frag.appendChild(b);
  }
  strip.innerHTML = '';
  strip.appendChild(frag);
  if (selWasVisible) {
    strip.scrollLeft = prevScrollLeft;   // data refresh: don't yank the strip
  } else {
    scrollStripTo(selKey, false);        // day change: recenter the selection
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

function kindBadge(kind) {
  const meta = KIND_META[kind] || KIND_META.link;
  return '<span class="source-badge" aria-hidden="true">' + meta.icon + '</span>';
}

function sourceBadge(source) {
  if (source && source.iconUrl) {
    return '<span class="source-badge"><img src="' + esc(source.iconUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>';
  }
  const letter = source && source.title ? esc(source.title.trim()[0].toUpperCase()) : '?';
  return '<span class="source-badge" aria-hidden="true">' + letter + '</span>';
}

function cardTarget(item, source) {
  if (item.kind === 'youtube') {
    const vid = item.rawVideoId || (item.link || '').match(/[?&]v=([\w-]+)/);
    return item.link || 'https://www.youtube.com/watch?v=' + (typeof vid === 'string' ? vid : (vid ? vid[1] : ''));
  }
  if (item.kind === 'podcast' && source && source.itunesUrl) return source.itunesUrl;
  return item.link || item.audioUrl || (source ? source.siteUrl : '#');
}

function pillLabel(item, source) {
  if (item.kind === 'youtube') return 'Watch on YouTube';
  if (item.kind === 'podcast') {
    return source && source.itunesId ? 'Listen in Podcasts' : 'Listen';
  }
  return source && /substack/i.test(source.title) ? 'Read on Substack' : 'Read';
}

function buildItemCard(item, source) {
  const card = el('a', 'card');
  card.href = cardTarget(item, source) || '#';
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.setAttribute('role', 'link');

  let media = '';
  if (item.kind === 'youtube' && item.imageUrl) {
    media = '<div class="card-media">' +
      '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display=\'none\'">' +
      (item.duration ? '<span class="duration-badge mono-glyph">' + fmtDuration(item.duration) + '</span>' : '') +
      '</div>';
  } else if (item.kind === 'article' && item.imageUrl) {
    media = '<div class="card-media">' +
      '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display=\'none\'">' +
      '</div>';
  }

  let body;
  if (item.kind === 'podcast') {
    const art = item.imageUrl
      ? '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">'
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
    body =
      '<h3 class="card-title">' + esc(item.title) + '</h3>' +
      (item.author ? '<p class="card-byline">' + esc(item.author) + '</p>' : '') +
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

function buildPinCard(pin) {
  const card = el('a', 'card pin-card');
  card.href = pin.url || '#';
  card.target = '_blank';
  card.rel = 'noopener noreferrer';

  let media = '';
  if (pin.imageUrl && pin.kind === 'youtube') {
    media = '<div class="card-media">' +
      '<img src="' + esc(pin.imageUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display=\'none\'">' +
      '</div>';
  }

  card.innerHTML =
    media +
    '<div class="pin-head">' + ICONS.pin + '<span>Pinned</span>' +
      '<span class="relative-time">' + esc(timeAgo(pin.createdAt)) + '</span>' +
      '<button class="pin-remove" aria-label="Remove this pinned link">' + ICONS.xmark + '</button>' +
    '</div>' +
    '<h3 class="card-title">' + esc(pin.title) + '</h3>' +
    (pin.note ? '<p class="pin-note">' + esc(pin.note) + '</p>' : '') +
    '<p class="pin-host">' + esc(hostOf(pin.url)) + '</p>' +
    '<span class="pill"><span>Open</span><span class="pill-arrow" aria-hidden="true">↗</span></span>';
  card.querySelector('.pin-remove').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    removePin(pin.id);
  });
  return card;
}

function buildEmpty(day) {
  const d = el('div', 'empty');
  d.innerHTML =
    '<div class="empty-glyph" aria-hidden="true">' + ICONS.calendar + '</div>' +
    '<h3>' + (dayKey(day) === dayKey(todayMidnight()) ? 'Nothing on today’s feed yet' : 'Nothing on this day') + '</h3>' +
    '<p>' + (dayKey(day) === dayKey(todayMidnight())
      ? 'Add a source and Dispatch will gather its recent items here.'
      : 'No items were published on this day. Swipe to another day or add a link.') + '</p>' +
    '<span class="pill pill--primary" data-action="add-source">Add a source</span>' +
    '<span class="pill" data-action="add-link">Add a link to this day</span>';
  d.querySelector('[data-action="add-source"]').addEventListener('click', () => openSheet('source'));
  d.querySelector('[data-action="add-link"]').addEventListener('click', () => openSheet('link'));
  return d;
}

function renderDay() {
  const day = state.day;
  const key = dayKey(day);
  const view = $('#dayview');
  const items = state.items
    .filter((i) => i.day === key)
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const pins = state.pins
    .filter((p) => p.day === key)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const srcById = new Map(state.sources.map((s) => [s.id, s]));

  const frag = document.createDocumentFragment();
  if (pins.length) {
    frag.appendChild(el('div', 'day-header', 'Pinned'));
    for (const p of pins) frag.appendChild(buildPinCard(p));
  }
  if (items.length) {
    if (pins.length) frag.appendChild(el('div', 'day-header', 'Feed'));
    for (const it of items) {
      const src = srcById.get(it.sourceId);
      frag.appendChild(buildItemCard(it, src));
    }
  }
  if (!pins.length && !items.length) {
    frag.appendChild(buildEmpty(day));
  }

  view.innerHTML = '';
  view.appendChild(frag);
  $('#nav-title').textContent = navTitle(day);
}

function renderAll() {
  renderStrip();
  renderDay();
  renderSourcesList();
}

/* ---------------- Rendering: sources screen ---------------- */

function typeLabel(t) {
  return t === 'youtube' ? 'YouTube' : t === 'podcast' ? 'Podcast' : 'Text feed';
}

function sourceSub(source) {
  if (source.lastError) return 'Error — ' + source.lastError;
  if (source.lastFetchedAt) return typeLabel(source.type) + ' · updated ' + timeAgo(source.lastFetchedAt);
  return typeLabel(source.type) + ' · not fetched yet';
}

function buildSourceRow(source, onDelete) {
  const row = el('div', 'source-row');
  row.dataset.id = source.id;
  const icon = source.iconUrl
    ? '<img src="' + esc(source.iconUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">'
    : esc(source.title.trim()[0].toUpperCase() || '?');
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
      '<span class="pill pill--primary" data-action="add-source">Add a source</span>';
    empty.querySelector('[data-action="add-source"]').addEventListener('click', () => openSheet('source'));
    list.appendChild(empty);
  } else {
    list.appendChild(groups);
  }
}

/* ---------------- Sheets ---------------- */

let sheetMode = null;

function openSheet(mode) {
  sheetMode = mode;
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
  setTimeout(() => { sheet.hidden = true; sheetMode = null; }, 380);
}

function buildSheet(mode) {
  const body = $('#sheet-body');
  body.innerHTML = '';
  if (mode === 'menu') return buildMenuSheet();
  if (mode === 'source') return buildSourceSheet();
  if (mode === 'link') return buildLinkSheet();
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

function buildMenuSheet() {
  const body = $('#sheet-body');
  const card = el('div', 'source-group');
  const src = el('button', 'source-row');
  src.innerHTML =
    '<div class="source-icon" aria-hidden="true">' + KIND_META.article.icon + '</div>' +
    '<div class="s-text"><div class="s-title">Add Source</div><div class="s-sub">Substack, YouTube channel, podcast or RSS</div></div>' +
    '<span class="s-chevron" aria-hidden="true">' + ICONS.chevron + '</span>';
  const pin = el('button', 'source-row');
  pin.innerHTML =
    '<div class="source-icon" aria-hidden="true">' + ICONS.link + '</div>' +
    '<div class="s-text"><div class="s-title">Add Link to Day</div><div class="s-sub">Save anything for a specific day</div></div>' +
    '<span class="s-chevron" aria-hidden="true">' + ICONS.chevron + '</span>';
  src.addEventListener('click', () => buildSheet('source'));
  pin.addEventListener('click', () => buildSheet('link'));
  card.appendChild(src);
  card.appendChild(pin);
  body.appendChild(card);
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

function previewCard() {
  const card = el('div', 'preview-card');
  card.id = 'preview-card';
  card.innerHTML = '<p class="pc-error">Paste a link to see what Dispatch detects.</p>';
  return card;
}

async function probePreview(url) {
  const card = $('#preview-card');
  if (!card) return;
  try {
    const resolved = await resolveFeedUrl(url);
    if (resolved.kind === 'video') {
      card.innerHTML =
        '<div class="pc-head">' + kindBadge('youtube') + '<span class="pc-title">' + esc(resolved.title) + '</span><span class="pc-tag">Video</span></div>' +
        (resolved.author ? '<div class="pc-sub">' + esc(resolved.author) + '</div>' : '') +
        '<div class="pc-samples">Single link — use “Add Link to Day”.</div>';
      return;
    }
    const feedUrl = resolved.feedUrl;
    if (state.sources.some((s) => s.feedUrl === feedUrl)) {
      card.innerHTML = '<p class="pc-error">Already added — this source is in your list.</p>';
      return;
    }
    const text = await fetchFeed(feedUrl);
    const parsed = parseFeed(text, feedUrl);
    let type = resolved.type;
    if (parsed.items.some((i) => i.kind === 'podcast')) type = 'podcast';
    const tag = type === 'youtube' ? 'YouTube' : type === 'podcast' ? 'Podcast' : 'Text';
    card.innerHTML =
      '<div class="pc-head">' + kindBadge(type === 'youtube' ? 'youtube' : type === 'podcast' ? 'podcast' : 'article') +
        '<span class="pc-title">' + esc(parsed.feedTitle) + '</span><span class="pc-tag">' + tag + '</span></div>' +
      '<div class="pc-sub">' + esc(hostOf(feedUrl)) + '</div>' +
      '<div class="pc-samples">' + esc(parsed.items.slice(0, 3).map((i) => i.title).join(' · ')) + '</div>';
  } catch (err) {
    card.innerHTML = '<p class="pc-error">' + esc(err && err.message ? err.message : 'Could not read this link.') + '</p>';
  }
}

let probeTimer = null;

function buildSourceSheet() {
  const body = $('#sheet-body');
  body.innerHTML = '';
  const urlRow = fieldRow(ICONS.link, 'Link or feed URL (https://…)');
  const nav = sheetNav('Add Source', 'Add', async () => {
    const btn = nav.querySelector('[data-sheet-action]');
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    btn.textContent = 'Adding…';
    btn.classList.add('nav-btn--disabled');
    urlRow.input.disabled = true;
    try {
      const src = await addSource(urlRow.input.value);
      closeSheet();
      toast('Added “' + src.title + '”');
    } catch (err) {
      btn.dataset.busy = '';
      btn.textContent = 'Add';
      btn.classList.remove('nav-btn--disabled');
      urlRow.input.disabled = false;
      toast(err && err.message ? err.message : 'Could not add this source.');
    }
  }, false);

  body.appendChild(nav);
  body.appendChild(el('div', 'field-label', 'URL'));
  body.appendChild(urlRow.wrap);
  body.appendChild(previewCard());

  urlRow.input.addEventListener('input', () => {
    const v = urlRow.input.value.trim();
    if (probeTimer) clearTimeout(probeTimer);
    if (v.length < 8) {
      const pc = $('#preview-card');
      if (pc) pc.innerHTML = '<p class="pc-error">Paste a link to see what Dispatch detects.</p>';
      nav.querySelector('[data-sheet-action]').classList.add('nav-btn--disabled');
      return;
    }
    nav.querySelector('[data-sheet-action]').classList.remove('nav-btn--disabled');
    probeTimer = setTimeout(() => probePreview(v), 700);
  });
  urlRow.input.focus();
}

function buildLinkSheet() {
  const body = $('#sheet-body');
  body.innerHTML = '';
  const urlRow = fieldRow(ICONS.link, 'https://…');
  const noteRow = fieldRow(ICONS.text, 'Note (optional)');
  const dateRow = el('div', 'field');
  dateRow.innerHTML = '<span aria-hidden="true">' + ICONS.calendar + '</span>';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = dayKey(state.day);
  dateInput.setAttribute('aria-label', 'Day');
  dateRow.appendChild(dateInput);

  const nav = sheetNav('Add Link to Day', 'Add', async () => {
    try {
      await addPin({
        day: dateInput.value || dayKey(state.day),
        url: urlRow.input.value,
        note: noteRow.input.value,
      });
      closeSheet();
      toast('Saved to ' + (dateInput.value || dayKey(state.day)));
    } catch (err) {
      toast(err && err.message ? err.message : 'Could not add this link.');
    }
  }, false);

  body.appendChild(nav);
  body.appendChild(el('div', 'field-label', 'URL'));
  body.appendChild(urlRow.wrap);
  body.appendChild(el('div', 'field-label', 'Note'));
  body.appendChild(noteRow.wrap);
  body.appendChild(el('div', 'field-label', 'Day'));
  body.appendChild(dateRow.wrap);

  urlRow.input.addEventListener('input', () => {
    const v = urlRow.input.value.trim();
    nav.querySelector('[data-sheet-action]').classList.toggle('nav-btn--disabled', v.length < 8);
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

function setDay(d, animate) {
  const next = addDays(d, 0);
  next.setHours(0, 0, 0, 0);
  state.day = next;
  renderAll();
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
    indicator.style.transform = 'translateY(0)';
    indicator.style.opacity = '0';
    setTimeout(() => { indicator.hidden = true; }, 300);
    if (dy >= 60) {
      toast('Refreshing…');
      refreshAll(true);
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

function initNav() {
  $('#today-btn').addEventListener('click', () => setDay(todayMidnight()));
  $('#add-btn').addEventListener('click', () => openSheet('menu'));

  $('#strip').addEventListener('click', (e) => {
    const b = e.target.closest('.bubble');
    if (!b) return;
    setDay(fromDayKey(b.dataset.day));
  });

  $('#backdrop').addEventListener('click', closeSheet);

  $('#sources-done').addEventListener('click', () => { $('#sources-screen').hidden = true; });
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
  state.items = await storeGetAll('items');
  state.pins = await storeGetAll('pins');
  state.sources.sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''));

  initNav();
  initSwipe();
  initPullToRefresh();
  initAutoRefresh();

  renderAll();
  maybeAutoRefresh();

  // keyboard day navigation
  document.addEventListener('keydown', (e) => {
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
