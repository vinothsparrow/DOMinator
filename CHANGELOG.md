# Changelog

All notable changes to DOMinator are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-20

First public release, submitted to the Chrome Web Store and to addons.mozilla.org.

### Added

- **Message capture.** Every `window.postMessage` call and `message` event on the
  inspected tab is recorded per tab and shown live in the toolbar popup and the
  DOMinator DevTools panel: direction, origin → target, frames, payload type and
  size, structured-clone transfer list, and the `file:line:column` call site with
  its full stack. Receives are paired with the send that produced them.
- **Channel coverage** beyond `window`: `MessagePort`, `BroadcastChannel`,
  `Worker` / `SharedWorker` and `ServiceWorker`.
- **Listener analysis.** Where each handler was registered, its origin-check kind
  (`none` / `strict` / `bypassable` / `source`) rather than a boolean, and the
  dangerous sinks in its body. Handlers wrapped by Sentry, Raven, New Relic,
  Rollbar, Bugsnag or jQuery are unwrapped to the real listener.
- **Findings tab** for prototype pollution, DOM clobbering and URL/DOM taint
  sources.
- **Replay.** Re-send any captured message with an edited payload, a chosen target
  frame and a chosen presented origin, which is how a `startsWith` / `endsWith` /
  `indexOf` origin check is proven bypassable.
- **Intercept.** Pause a message inside the wrapped listener, edit origin and
  payload, then deliver or drop. Auto-delivers after 20s.
- **Auto-probe and canary fuzzing**, off by default: each new listener is hit with
  a unique canary, a nested JSON probe and a `__proto__` payload.
- **Dynamic sink trace.** Taint survives JSON, URI, base64, `replace`, `split` /
  `join` and case transforms; assignments blocked by Trusted Types or CSP are
  still recorded, as `blocked`.
- **Auto-generated PoC** per listener — iframe, `window.open` / opener, or a
  console / Burp snippet — and a markdown findings report per tab.
- **Frame picker**, filters, free-text search, JSON export / import, and a badge
  that turns red on high-risk traffic.
- **Per-site exclusions.** The content script is registered at runtime with
  `excludeMatches`, so DOMinator can be switched off for a site without losing
  `document_start` injection everywhere else.
- **Configurable sources and sinks** in the options page, including a taint
  minimum length and a canary-injection switch.
- **Headless access** through `window.__DOMINATOR__.dump()` for Playwright runs.
- **Firefox build** (`npm run build:firefox`), loadable as a temporary add-on.

[1.0.0]: https://github.com/vinothsparrow/DOMinator/releases/tag/v1.0.0
