<div align="center">
<img src="public/icon128.png" alt="logo"/>
<h1>DOMinator</h1>

![GitHub action badge](https://github.com/vinothsparrow/DOMinator/actions/workflows/release.yml/badge.svg)

</div>

DOMinator is a powerful Chrome extension designed to assist developers and security professionals in testing and identifying DOM-based Cross-Site Scripting (XSS) vulnerabilities on websites. This tool provides a user-friendly interface for dynamically analyzing and manipulating the Document Object Model (DOM) of web pages to uncover potential security weaknesses. With DOMinator, users can simulate various attack scenarios, inject payloads, and observe how the DOM reacts, enabling them to pinpoint vulnerable areas and strengthen the overall security posture of web applications. 

## What it captures

Every `window.postMessage` call and every `message` event on the inspected tab is recorded in the
background worker, per tab, and shown live in the toolbar popup and in the **DOMinator** DevTools panel.

**Messages**

- Direction (`sent` / `recv`), origin → target, sender and receiver frame, payload type and size.
- The **call site** of the send as `file:line:column`, plus the full call stack. Inside DevTools the
  location opens the file in the Sources panel; in the popup it copies to the clipboard.
- Receives are paired with the send that produced them, so a receive shows the sender's `file:line`
  too (marked *via sender*).
- Risk flags: wildcard `targetOrigin`, markup / script-like payloads, cross-origin traffic.

**Listeners**

- Where each `addEventListener('message', …)` was registered, as `file:line:column`.
- Whether the handler validates `event.origin`.
- Dangerous sinks found in the handler body (`innerHTML`, `document.write`, `eval`, `location`,
  `srcdoc`, jQuery `html()`, storage and cookie writes, relays, …).
- Wrapper unwrapping: handlers wrapped by **Sentry, Raven, New Relic, Rollbar, Bugsnag** or **jQuery**
  are unpacked so the list shows the real listener, tagged *via <library>* (the wrapper source is kept
  in the detail pane).
- Bound and native functions cannot be stringified by the engine; those are labelled *bound / native*
  and the registration stack points at the real handler.

**Views**

- Frame picker, in the spirit of the DevTools console one, to scope everything to `top` or a nested frame.
- Filters for direction, high risk and listeners that skip the origin check, plus free-text search.
- Clear and JSON export per tab; badge shows the message count, red when something is high risk.

## Active testing

DOMinator is not only a recorder — three features turn a capture into a test.

**Replay / re-sender.** Every message row in the DevTools panel has a **Replay** button. It opens
an editor pre-filled with the captured payload where you can mutate it (one-click `<img onerror>`,
SVG `onload`, `javascript:` URL, `__proto__` pollution, or free-form JSON/text), pick the target
frame and `targetOrigin`, and fire it back into the page. The message is dispatched from the
inspected page itself via `chrome.devtools.inspectedWindow.eval`, so same-origin frames and the
page's own listeners receive it exactly as a real sender would — and the replayed send is captured
again, so any resulting sink flow is confirmed live. Replay is only available in the DevTools panel
(the popup cannot evaluate in the page).

**Dynamic sink trace.** Beyond statically scanning listener bodies, DOMinator taints the string
values of every received payload and hooks the dangerous sinks in the page realm — `innerHTML`,
`outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `location.assign` / `replace`, string
`setTimeout` / `setInterval`, `iframe.srcdoc` and URL-bearing `setAttribute`. When a tainted value
actually reaches a sink, the source message is marked **confirmed** and shows exactly where it landed
(`reached innerHTML @ app.js:412`). That is the difference between "this listener looks dangerous"
and "this payload *is* exploitable"; filter the message list to **Confirmed** to see only proven flows.

**Auto-generated PoC.** The detail pane of any listener generates a ready-to-serve HTML proof of
concept — an `<iframe>` pointed at the target document that posts the payload after load. The payload
templates are chosen from the sinks found in the listener (HTML for markup sinks, a JS expression for
code sinks, a `javascript:` URL for navigation sinks, plus prototype pollution). Copy it or download it
as `.html`.

### Known limitation

A send to a **cross-origin** window (`iframe.contentWindow.postMessage(…)`, `parent.postMessage(…)`
across origins) goes through that window's cross-origin proxy, which no page script can hook, so the
send has no call site. The message is still captured in the receiving frame, with its origin and the
listeners it reaches.
