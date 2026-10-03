# Deploying the Workout Tracker

How changes in this repo reach the app on the phone. Written after a round of
changes where every step "worked" but the phone kept showing the old app — the
gotchas below are the reason that happened.

## What lives where

This repo contains **two separate apps**, not one app and a copy of it. They
share no code and each keeps its own data.

| | Root app | v2 app |
| --- | --- | --- |
| Files | `index.html` | `v2/index.html`, `v2/sw.js`, `v2/manifest.json`, `v2/icon.png` |
| URL | https://pinetoks.github.io/workout-tracker/ | https://pinetoks.github.io/workout-tracker/v2/index.html |
| Service worker | none | yes (`sw.js`) |
| Installable PWA | no | yes (manifest + apple-mobile-web-app tags) |
| localStorage key | `wt_data_v2` | `workoutData`, `customExercises` |
| Look | "💪 Workout Tracker" header, "Day streak" stat, body-part chips in a row | month name with ‹ › at top, "Cardio Days (28D)" stat, bottom sheet on tapping a day |

**Before editing anything, confirm which app the home-screen icon actually
opens.** An iOS home-screen web app hides the URL bar, so the easiest check is
visual — open both URLs side by side and see which matches. Editing the wrong
one is invisible: every push succeeds, the site deploys fine, and nothing
changes on the phone.

Each app also has its own localStorage, so workouts logged in one are not
visible in the other.

## Hosting setup

GitHub Pages serves the `main` branch from the repo root. There is no build
step, no GitHub Actions workflow, and no `gh-pages` branch — the `.html` files
are served exactly as committed. Pushing to `main` is the entire deploy.

Local clone: `~/Documents/workout-tracker`

## The update procedure

1. Edit the app file. For v2 that is `v2/index.html` — a single self-contained
   file with inline CSS and JS. Nothing to compile.

2. If you changed `v2/sw.js` itself (or `manifest.json` / `icon.png`), bump the
   cache version: `const CACHE = 'workout-v25'` -> `v26`, and so on. Changes to
   `v2/index.html` alone no longer need a bump (since v25 pages are
   network-first), but bumping anyway is harmless.

3. Commit and push:

   ```
   cd ~/Documents/workout-tracker
   git add v2/index.html v2/sw.js
   git commit -m "..."
   git push origin main
   ```

4. Wait a minute or two. The push itself is instant, but Pages rebuilds and
   propagates afterward.

5. Verify the deploy actually went out (see below) before concluding anything
   about the phone.

6. On the phone, fully close the app (swipe it away in the app switcher — do not
   just background it) and reopen it. The service worker only checks for an
   update on a real navigation; resuming from the app switcher may not trigger
   one. A second open is sometimes needed: the first launch installs and
   activates the new worker, and the launch after that is served from the
   rebuilt cache.

## How the service worker caches (since workout-v25)

- **Page loads (`index.html`) are network-first.** When the phone is online it
  always gets the latest `index.html` (fetched with `cache: 'no-store'`) and
  refreshes the cached copy; the cache is only used offline.
- **Other assets (manifest, icon) are cache-first**, so changing them still
  needs a `CACHE` bump.
- **Install uses `cache: 'reload'`.** GitHub Pages sends `Cache-Control:
  max-age=600`. Before v25, a new worker installed within 10 minutes of a push
  could precache the OLD `index.html` from Safari's HTTP cache and then serve it
  indefinitely. That is what happened with the v24 deploy (2026-10-03).
- The page registers the worker with `updateViaCache: 'none'` and calls
  `reg.update()` whenever the app comes back to the foreground, so the phone
  notices a new `sw.js` without needing a cold launch.

History: up to v24 the fetch handler was pure cache-first
(`caches.match(req).then(r => r || fetch(req))`), so every `index.html` change
needed a `CACHE` bump to reach installed phones.

## Verifying a deploy

Methods that actually answer the question, in order of usefulness:

**Confirm GitHub received the push.** This talks to git directly and is never
stale:

```
git fetch origin main
git log origin/main -1 --oneline
```

**Confirm Pages is serving the new code.** Open the URL in a desktop browser and
check for something that only exists in the new version, in the DevTools
console. Because these apps render everything from JavaScript, "view source" and
any tool that only reads rendered HTML will tell you nothing. For example, after
the cardio change:

```js
CARDIO_PROTOCOLS.map(p => p.label)   // ["Treadmill", "4x4 Norwegian", "HIIT (Sprint)"]
```

Methods that mislead:

`raw.githubusercontent.com` is CDN-cached and lagged several minutes behind a
successful push during this session — it reported the old file contents while
`git fetch` correctly showed the new commit. Do not use it to decide whether a
push landed.

Fetching the `github.io` URL from a sandboxed or corporate-proxied environment
may be blocked by an egress allowlist, which looks like a site outage but is not.

## Data safety

Workout history lives in **localStorage**. The service worker cache is a
separate storage area. A normal service-worker update replaces the cache and
never touches localStorage, so ordinary updates cannot lose data.

The destructive thing to avoid is **Settings → Safari → Advanced → Website Data
→ delete**, which clears the entire origin — service worker, caches, *and*
localStorage. That wipes logged workouts. It should be a last resort, and only
after exporting.

Both apps have Export and Import buttons that read and write a JSON file, which
is the safe way to back up before anything risky, or to move data between
devices. Note that the two apps' export formats are not interchangeable.

## Notes for editing the v2 app

Cardio entries use a different shape from strength entries. A strength exercise
is `{ name, sets: [{ reps, weight, unit }] }`; a cardio protocol entry is
`{ name, cardio: { type, ...protocol fields } }` with no `sets` array. The
rendering code branches on `ex.cardio` and falls through to the generic sets
table when it is absent, which is what keeps previously logged entries working.

When adding UI, be careful about reusing existing CSS classes. The sheet's event
handlers are attached by querying class names, so a new input given
`class="set-input"` was picked up by the handler for reps/weight fields and threw
on every edit. Those handlers are now scoped by data attribute
(`.set-input[data-ex]`, `.unit-toggle button[data-u]`) — keep new controls on
their own data attributes.

There is no test suite. The changes in this session were checked by loading
`v2/index.html` in jsdom and driving the DOM directly — adding exercises,
editing fields, toggling units, verifying the resulting localStorage payload,
and confirming previously logged data still rendered. Worth repeating for
anything non-trivial, since a runtime error in this app is silent until you tap
the exact control that triggers it.
