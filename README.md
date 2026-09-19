<div align="center">
<img src="public/icon128.png" alt="logo"/>
<h1>DOMinator</h1>

![GitHub action badge](https://github.com/vinothsparrow/DOMinator/actions/workflows/release.yml/badge.svg)

</div>

DOMinator is a Chrome (and Firefox) extension for developers and security testers hunting DOM XSS — especially `postMessage` bugs, but also URL/DOM sources, prototype pollution and DOM clobbering. It records traffic, classifies listeners, taints payloads through transforms, confirms when a value actually reaches a sink, and turns that into a replay / PoC.

## What it captures

Every `window.postMessage` call and every `message` event on the inspected tab is recorded in the
background worker, per tab, and shown live in the toolbar popup and in the **DOMinator** DevTools panel.

**Messages**

- Direction (`sent` / `recv`), origin → target, sender and receiver frame, payload type and size.
- Channel: `window`, `MessagePort`, `BroadcastChannel`, `Worker` / `SharedWorker`, `ServiceWorker`.
- The structured-clone **transfer list** (ports, buffers) when present.
- The **call site** of the send as `file:line:column`, plus the full call stack. Inside DevTools the
  location opens the file in the Sources panel (resolved through `//# sourceMappingURL` when the map is reachable); in the popup it copies to the clipboard.
- Receives are paired with the send that produced them, so a receive shows the sender's `file:line`
  too (marked *via sender*).
- Which wrapped listener actually ran for a receive, and whether it read `event.origin` / `event.data`.
- Risk flags: wildcard `targetOrigin`, markup / script-like payloads, cross-origin traffic, confirmed sink flows, cross-origin leaks (`location.href`, cookies, token-like keys).

**Listeners**

- Where each `addEventListener('message', …)`, `window.onmessage = …` or `handleEvent` was registered.
- Origin-check **kind**, not a boolean:
  - `none` — no check
  - `strict` — `===` / allowlist helpers
  - `bypassable` — `startsWith` / `indexOf` / `includes` / `endsWith` / unanchored regex
  - `source` — `event.source === parent|opener` instead of origin
- Dangerous sinks found in the handler body (`innerHTML`, `document.write`, `eval`, `location`,
  `srcdoc`, jQuery `html()`, storage and cookie writes, relays, `DOMParser`, `import()`, …).
- Wrapper unwrapping: handlers wrapped by **Sentry, Raven, New Relic, Rollbar, Bugsnag** or **jQuery**
  are unpacked so the list shows the real listener, tagged *via <library>* (the wrapper source is kept
  in the detail pane).
- Bound and native functions cannot be stringified by the engine; those are labelled *bound / native*
  and the registration stack points at the real handler.
- Hit counts, SPA re-register dedup, and `removeEventListener` so stale handlers drop off.

**Other findings** (Findings tab)

- Prototype pollution: `Object.assign`, `jQuery.extend`, lodash `merge` / `defaultsDeep` writing onto `Object.prototype`.
- DOM clobbering: `id`/`name` collisions that overwrite globals (`location`, `getElementById`, …).
- URL / DOM taint sources: `location.hash` / `search` / `href`, `document.referrer`, `window.name`, `history.pushState`.

**Views**

- Frame picker, in the spirit of the DevTools console one, to scope everything to `top` or a nested frame. Picking a frame outlines it in the page.
- Filters for direction, high risk, confirmed flows, missing origin check, bypassable origin check, plus free-text search.
- Clear, JSON export / import, and a markdown findings report per tab; badge shows the message count, red when something is high risk.
- Sessions survive service-worker restarts (`chrome.storage.session`).

## Active testing

DOMinator is not only a recorder — these features turn a capture into a test.

**Replay / re-sender.** Every message row in the DevTools panel has a **Replay** button. It opens
an editor pre-filled with the captured payload. For nested JSON that is a collapsible tree with
per-field inject (XSS / canary / `__proto__`). You can pick the target frame, `targetOrigin`, and
the **origin presented to listeners**:

- *Page origin* fires a real `postMessage` from the inspected page.
- *evil.com* / *evil.TARGET* / *TARGET.evil.com* / custom dispatch a `MessageEvent` so `event.origin` is the attacker value. That is how you prove a listener whose origin check is a `startsWith` / `endsWith` / `indexOf`.

The page helper is `window.__DOMINATOR__.replay(data, origin)`. Replay is only available in the DevTools panel.

**Intercept.** Pause a message in the wrapped listener, edit origin + payload, then deliver or drop. One-shot init messages no longer sail past you. Auto-delivers after 20s so the page cannot hang forever.

**Auto-probe / canary fuzz.** When enabled, each new listener is hit with a unique canary string, a nested JSON probe and a `__proto__` payload. Live traffic can also have a canary appended to every string leaf. Confirmed sink flows show up in the message list as before.

**Dynamic sink trace.** Taint survives `JSON.parse` / `stringify`, `encodeURIComponent` / `decodeURI`, `btoa` / `atob`, `replace`, `split`/`join`, case transforms and friends. Runtime hooks cover the sinks the static scan already names, including `location.href` / `hash` / `search`, `new Function`, `element.src`, `script.text`, `DOMParser.parseFromString`, `Range.createContextualFragment`, jQuery `html`/`append`, `document.cookie`, `localStorage.setItem`, `fetch` / XHR, and script insertion. If Trusted Types or CSP block the assignment, the flow is still recorded as **blocked**.

**Configurable sources/sinks.** Options page (and the probe strip in the panel) let you turn sinks off when they break a site, raise the taint minimum, and disable canary injection.

**Auto-generated PoC.** The detail pane of any listener generates a ready-to-serve proof of
concept — iframe, `window.open` / opener, or a console / Burp snippet. Payload templates prefer a captured JSON leaf that actually reached the listener, then sink-aware XSS / JS / `javascript:` / prototype pollution. Copy it or download it.

### Headless / Playwright

The page realm exposes:

```js
window.__DOMINATOR__.dump()
// { messages, listeners, flows }
```

Load a URL with the extension installed, wait for network idle, then `page.evaluate(() => window.__DOMINATOR__.dump())` in each frame you care about.

### Firefox

```
yarn build:firefox
```

loads as a temporary add-on from `dist/`. Safari is not a target yet.

### Known limitation

A send to a **cross-origin** window (`iframe.contentWindow.postMessage(…)`, `parent.postMessage(…)`
across origins) goes through that window's cross-origin proxy, which no page script can hook, so the
send has no call site. The message is still captured in the receiving frame, with its origin and the
listeners it reaches. Origin spoofing is a *presented* origin on the wrapped listener (or a synthetic
`MessageEvent`); it cannot change the browser-enforced origin of a real `postMessage`.
