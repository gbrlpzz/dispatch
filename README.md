# Dispatch

**A local-first personal feed, shaped like Apple Calendar.**

Dispatch turns your feed subscriptions into a calendar you can swipe through:
a row of day bubbles up top, today's content below, and a swipe left or right
to move between days. Every day shows the articles, videos and podcast
episodes your sources published that day — with cards that link out to the
Substack, YouTube or Apple Podcasts apps.

Everything runs in your browser and everything stays on your device:

- **No account, no backend, no central infrastructure.** Dispatch is a static
  PWA — anyone can host it (or just open the hosted version) and get a
  personalized feed.
- **Local persistence.** Sources, items and pinned links live in IndexedDB on
  your device, and Dispatch asks the browser for persistent storage, so your
  history survives restarts and works offline.
- **Local feed pulling.** Feed fetching happens in your browser. Feeds that
  allow direct access are read directly; feeds that block browser requests
  fall back to a small list of public CORS proxies, in order. No feed data
  ever touches a server you don't choose.

## Features

- **Calendar-shaped feed.** A scrollable strip of day bubbles (today marked
  with an outline, the selected day filled), a date title, and a swipeable
  day view — built to the Apple Human Interface Guidelines with a monochrome
  palette that follows light/dark appearance.
- **Three kinds of sources.**
  - *Text* — Substack and any RSS/Atom feed, with cover image, byline and a
    pulled summary.
  - *Video* — YouTube channels, with thumbnail, title, channel and a duration
    badge where the feed provides one.
  - *Podcast* — any audio RSS feed, with artwork, show name and a link into
    Apple Podcasts (resolved via the iTunes search API at add time).
- **Add a link to any day.** Pin any URL to a specific day with an optional
  note; it becomes a card on that day.
- **Manage sources.** A Sources screen lists everything you follow, with
  swipe-to-delete. Removing a source removes its items from the past, the
  present and the future.
- **Automatic refresh.** Dispatch re-fetches stale sources when you open it,
  when the app returns to the foreground, and periodically while it's open.
  Pull down on any day to refresh immediately.
- **Installable.** Add it to your iPhone home screen (Share → Add to Home
  Screen) — it runs full-screen with its own icon, and works offline thanks
  to the service worker.

## How it works

1. **Adding a source.** Paste a link — a Substack publication, a YouTube
   channel page (`/channel/…` or `@handle`), a podcast RSS URL, or any
   RSS/Atom feed. Dispatch resolves the feed URL, fetches it, classifies it
   (text / video / podcast), and stores it locally. For podcasts it also
   looks up the show on Apple Podcasts so cards can deep-link into the app.
2. **Fetching.** Feeds are parsed in the browser (RSS 2.0, Atom, and the
   YouTube channel feed). Each item is bucketed into the *device-local* day
   its `pubDate` falls on, deduplicated by GUID, and stored in IndexedDB.
3. **The calendar.** The strip covers roughly 4 months back and 2 weeks
   forward from today, extending as you scroll. The day view shows that
   day's pinned links, then its feed items newest-first.
4. **Refresh scheduling.** There is no background daemon — iOS doesn't allow
   web apps to fetch in the background. Instead Dispatch refreshes whenever
   you open it or bring it to the foreground if any source is older than 12
   hours, and re-checks every 30 minutes while it's open.

## Run locally

Dispatch is a static site — no build step, no dependencies.

```sh
cd dispatch
python3 -m http.server 8787
# open http://localhost:8787
```

For the full install experience (service worker, icons, manifest), serve over
HTTPS or use a tool that sets the right headers:

```sh
npx serve .
```

## Deploy

Any static host works. Vercel (this repo's setup):

```sh
vercel --prod
```

or push to GitHub and import the repo in the Vercel dashboard — `vercel.json`
ships with clean URLs, the correct service-worker headers and the manifest
content type.

## CORS proxies

Most feeds (Substack, YouTube, most podcast hosts) don't send CORS headers,
so a browser can't fetch them directly. Dispatch tries, in order:

1. the feed directly,
2. `api.allorigins.win` (raw),
3. `corsproxy.io`,
4. `api.codetabs.com`,
5. `api.allorigins.win` (JSON wrapper).

You can edit the `PROXIES` array at the top of `app.js` to use your own
proxy or remove the fallbacks entirely. Note that feed URLs and titles pass
through whatever proxy you choose; the default list only forwards the bytes.

## Privacy

Dispatch stores everything in your browser's IndexedDB and never phones home.
The only network requests are: the feeds you add, the CORS proxies above,
Apple's iTunes Search API (podcast lookup), and YouTube's oEmbed endpoint
(video titles). No analytics, no tracking, no accounts.

## Design

Monochrome Apple Human Interface Guidelines: system grouped background and
card surfaces, label/secondary/tertiary text, opaque separators, system-fill
pills, continuous-corner cards, SF-style glyphs drawn inline, the iOS motion
curves, light and dark appearance, safe-area insets, and a full-screen
standalone experience on iPhone. Every accent is pure black in light mode and
pure white in dark mode — nothing else, so it reads as one system.

## License

MIT — see [LICENSE](LICENSE).
