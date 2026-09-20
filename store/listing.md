# Chrome Web Store listing — DOMinator

Paste-ready copy for the Developer Dashboard. Regenerate the images with
`npm run screenshots` and `node utils/screenshots/promo.js`.

---

## Store listing tab

**Title** (from the package): `DOMinator`

**Summary** (from the package, 129/132): DevTools for DOM XSS hunting: capture
postMessage traffic, audit listener origin checks, trace taint into sinks, replay
payloads.

**Category:** Developer Tools · **Language:** English (en)

### Description

```
DOMinator is a DevTools panel for developers and security testers who need to see what a page's postMessage traffic is actually doing — and whether a message can reach a dangerous sink.

It installs hooks in the page, records every message the tab sends and receives, and shows the result live in a DevTools panel and in the toolbar popup.

WHAT IT CAPTURES

• Every window.postMessage call and every message event: direction, origin to target, sending and receiving frame, payload type and size, and the transfer list.
• The call site of each send as file:line:column, with the full stack. Inside DevTools the location opens the file in Sources, resolved through the source map when one is reachable.
• Receives paired with the send that produced them, so a receive shows the sender's file and line too.
• Channels beyond window: MessagePort, BroadcastChannel, Worker, SharedWorker and ServiceWorker.
• Risk flags: wildcard targetOrigin, markup or script-like payloads, cross-origin traffic, confirmed sink flows, and cross-origin leaks of location.href, cookies or token-like keys.

LISTENER ANALYSIS

For each addEventListener('message', ...), window.onmessage or handleEvent, DOMinator shows where it was registered and what kind of origin check it performs — not a yes/no, but which kind:

• none — no check at all
• strict — === or an allowlist helper
• bypassable — startsWith, endsWith, indexOf, includes or an unanchored regex
• source — event.source === parent or opener instead of an origin check

It also lists the dangerous sinks in the handler body (innerHTML, document.write, eval, location, srcdoc, jQuery html(), storage and cookie writes, relays, DOMParser, dynamic import) and unwraps handlers wrapped by Sentry, Raven, New Relic, Rollbar, Bugsnag or jQuery so you see the real listener.

FINDINGS

• Prototype pollution through Object.assign, jQuery.extend and lodash merge / defaultsDeep.
• DOM clobbering: id and name attributes that overwrite globals.
• URL and DOM taint sources: location.hash / search / href, document.referrer, window.name, history.pushState.

ACTIVE TESTING

• Replay — re-send any captured message with an edited payload, a chosen target frame and a chosen presented origin. Nested JSON opens as a tree with per-field injection. Presenting an attacker origin is how you prove that a startsWith or endsWith origin check is bypassable.
• Intercept — pause a message inside the handler, edit the origin and payload, then deliver or drop it. One-shot handshake messages no longer sail past you.
• Auto-probe — hit each new listener with a unique canary, a nested JSON probe and a __proto__ payload. Off by default.
• Dynamic sink trace — taint survives JSON, URI encoding, base64, replace, split/join and case transforms. Assignments blocked by Trusted Types or CSP are recorded as blocked rather than dropped.
• Generated proof of concept — per listener, as an iframe, a window.open / opener page, or a console or Burp snippet.

VIEWS AND EXPORT

Frame picker scoped to top or any nested frame, filters for direction, high risk, confirmed flows, missing or bypassable origin checks, free-text search, JSON export and import, and a markdown findings report per tab. The toolbar badge shows the message count and turns red on high-risk traffic. Sessions survive service-worker restarts.

For headless runs, the page exposes window.__DOMINATOR__.dump().

PRIVACY

DOMinator has no account, no server and no analytics. Captured traffic stays in your browser: session storage for the capture, local storage for your settings, nothing synced, nothing transmitted. The only network request it makes is fetching a script's source map from the site you are inspecting, when you click a call site. Full policy: https://vinothsparrow.github.io/DOMinator/privacy.html

SCOPE OF USE

This is a testing tool. Replay, intercept and auto-probe send payloads into the page you are inspecting, and they are off until you switch them on. Use it only on sites you own or are authorised to test.

Open source (MIT): https://github.com/vinothsparrow/DOMinator
```

### Graphic assets

| Field | File |
| --- | --- |
| Store icon, 128x128 | `public/icon128.png` |
| Screenshots, 1280x800 (at least 1, up to 5) | `store/screenshots/1-panel-messages.png`, `3-panel-findings.png`, `4-options.png` |
| Small promo tile, 440x280 | `store/promo/small-promo-tile-440x280.png` |
| Marquee promo tile, 1400x560 | `store/promo/marquee-promo-tile-1400x560.png` |

Screenshots go in **Global** assets; leave the localised ones empty unless you
publish a second language. All the PNGs are 24-bit, no alpha, as the store
requires.

**Official URL:** leave as None unless you verify `vinothsparrow.github.io` in
Google Search Console first.

---

## Privacy tab

**Single purpose**

```
DOMinator is a developer tool for finding DOM-based XSS. It records the postMessage traffic and message-event listeners of the page under inspection, analyses each listener's origin check and the sinks it reaches, and lets the developer replay or intercept a message to confirm a finding. Everything it does serves that single purpose: inspecting the page you are testing.
```

**Permission justifications**

- `host permissions (http://*/* and https://*/*)`

```
DOM XSS in postMessage handlers lives in third-party widgets and frames on arbitrary origins, and the extension cannot know in advance which site the developer will test. The hooks must be installed at document_start in every frame, before the page's own scripts run, or the messages sent and the listeners registered during page load are missed. The extension ships a per-site exclusion list so the developer can switch it off for any site.
```

- `scripting`

```
The content script is registered at runtime rather than declared statically, so that the user's per-site exclusions can be applied as excludeMatches. Checking a stored exclusion list inside the content script instead would require an async storage read at document_start, by which time the early messages would already be missed.
```

- `storage`

```
Holds the captured session for the inspected tab (chrome.storage.session, cleared when the browser closes) and the user's settings and per-site exclusions (chrome.storage.local). Nothing is written to chrome.storage.sync and nothing leaves the browser.
```

- `activeTab`

```
Identifies the tab the developer is currently inspecting, so the popup and the DevTools panel show that tab's capture.
```

**Remote code:** No, I am not using remote code. Everything the extension runs is
in the package.

**Data usage.** Nothing is transmitted off the device, so no data type needs to
be disclosed as collected. The three certifications are all true: the data is not
sold to third parties, not used or transferred for any purpose unrelated to the
single purpose above, and not used or transferred to determine creditworthiness
or for lending.

**Privacy policy URL:** `https://vinothsparrow.github.io/DOMinator/privacy.html`

---

## Access → Test instructions

```
No account or login is needed.

1. Open any page that embeds third-party widgets or iframes — a page with an embedded YouTube player, a payment widget or a chat widget all send postMessage traffic on load.
2. Open DevTools and select the DOMinator panel.
3. Reload the page. Messages appear in the Messages tab as they are captured, with the sender's file and line; Listeners shows each message handler and the kind of origin check it performs; Findings shows confirmed sink flows, prototype pollution and DOM clobbering.
4. The popup on the toolbar icon shows the same capture for the active tab.

Replay, Intercept and Auto-probe are off by default and only act on the page currently open in DevTools.
```

---

## Distribution tab

Visibility **Public**, all regions, free, no in-app purchases. The extension has
no ads and no payments.
