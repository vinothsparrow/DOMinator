# DOMinator Privacy Policy

_Last updated: 20 September 2026 — applies to DOMinator 1.0.0 and later._

DOMinator is a developer and security-testing tool. It analyses the pages **you**
open in your own browser and shows you what it found. It has no account, no
server, and no analytics.

## The short version

**DOMinator does not collect, transmit or sell any data.** Everything it records
stays inside your browser profile. No data is sent to the developer or to any
third party.

## What DOMinator reads

To do its job the extension observes the pages you visit:

- **Message traffic** — the payload, origin, target and call site of every
  `postMessage` / `message` event on the tab, including `MessagePort`,
  `BroadcastChannel`, `Worker` and `ServiceWorker` channels.
- **Page code** — the source text of `message` listeners and the stack traces
  behind them, so it can classify origin checks and find dangerous sinks.
- **Page structure and URLs** — element `id` / `name` attributes for DOM
  clobbering checks, and `location`, `document.referrer` and `window.name` for
  taint sources.
- **The address of the inspected tab**, to label and scope a session.

Message payloads are ordinary website data, but on a site you are logged into
they can contain personal information — a session token in a widget handshake, a
name in a chat frame. DOMinator treats that data exactly like the rest: it is
held locally, shown only to you, and never uploaded.

## Where it is stored

| Data | Storage | Lifetime |
| --- | --- | --- |
| Captured messages, listeners and findings | `chrome.storage.session` | Cleared when the browser closes, and when you press **Clear** |
| Settings: enabled sinks, taint minimum, canary and auto-probe switches | `chrome.storage.local` | Until you change them or uninstall |
| Per-site exclusions | `chrome.storage.local` | Until you change them or uninstall |

Nothing uses `chrome.storage.sync`, so nothing is copied to your Google or
Firefox account or to your other devices. Uninstalling the extension deletes all
of it. Exports (JSON, markdown report) are written only when you ask for them,
to the location you choose.

## Network requests

DOMinator makes exactly one kind of outbound request, and only when you ask for
it: when you click a captured call site in the DevTools panel, it fetches that
script's source map (`//# sourceMappingURL`) **from the site being inspected**,
so it can show you the original file and line. That request goes to the
inspected site's own server, not to us. There is no telemetry, no crash
reporting, no update ping, and no remote code — the whole extension runs from
the code in the package.

## Actions that change the inspected page

These are the point of the tool, they run in your browser against the site you
are testing, and none of them send anything to a third party:

- **Replay / Intercept** re-send or modify a message you selected, when you press
  the button.
- **Auto-probe and canary injection** send test payloads to listeners on the
  page. Both are **off by default** and are switched on per session by you.

Only run these against sites you own or are authorised to test.

## Permissions, and why each is needed

- **`host_permissions` for `http://*/*` and `https://*/*`** — DOM XSS lives in
  third-party frames and widgets on arbitrary origins, and the hooks must be
  installed at `document_start`, in every frame, before the page's own scripts
  run; a message sent during page load is missed otherwise. The extension cannot
  know in advance which site you will test. Use the per-site exclusion list to
  switch it off wherever you do not want it.
- **`scripting`** — registers that content script at runtime, which is what makes
  the exclusion list possible (it is applied as `excludeMatches`).
- **`storage`** — holds the session capture and your settings, as described above.
- **`activeTab`** — identifies the tab you are currently inspecting.

## Children

DOMinator is a professional developer tool and is not directed at children.

## Changes

Material changes to this policy will be published in this file and noted in
[CHANGELOG.md](CHANGELOG.md). The published copy lives at
<https://vinothsparrow.github.io/DOMinator/privacy.html>.

## Contact

Open an issue at <https://github.com/vinothsparrow/DOMinator/issues>.
