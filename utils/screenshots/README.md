# Store screenshots

`capture.js` drives a real run of the extension and writes 1280x800 PNGs — the
Chrome Web Store screenshot size — to `store/screenshots/`.

```
npm run build
npm run screenshots
```

It starts a local server for `demo.html` (the content script only matches
`http`/`https`, so the demo cannot be a `file://` page), launches Chrome with
`dist/` loaded, reloads the demo tab once the service worker has registered the
content script, and then opens the extension's own pages as **background** tabs:
outside DevTools a DOMinator page resolves its target through
`chrome.tabs.query({active: true})`, so the demo tab has to stay the active one
for the screenshots to show real traffic.

## Chrome for Testing is required

Stable Chrome no longer honours `--load-extension`. Install a Chrome for Testing
build and point `CHROME_PATH` at it:

```
npx @puppeteer/browsers install chrome@stable --path /tmp/browsers
CHROME_PATH="/tmp/browsers/chrome/mac_arm-<version>/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
  npm run screenshots
```

Pass `--headful` to watch it happen.

## The demo page

`demo.html`, `widget.html` and `app.js` are a deliberately vulnerable checkout
page: listeners with no origin check, a `startsWith` check that is bypassable, a
strict one, `innerHTML` / `document.cookie` / `localStorage` sinks, a wildcard
`targetOrigin`, a `__proto__` payload and an `id="getElementById"` clobber. They
are test fixtures — they are not part of the extension package.

## What has to be captured by hand

**Replay and Intercept.** Both are gated on `chrome.devtools.inspectedWindow`,
so their controls do not render outside a real DevTools panel and no automated
tab can reach them. For those shots:

1. `npm run build`, load `dist/` at `chrome://extensions` (Developer mode → Load
   unpacked) in a Chrome for Testing profile.
2. Serve this folder (`npx serve utils/screenshots`) and open `demo.html`.
3. Open DevTools → **DOMinator** panel, sized so the viewport is 1280x800.
4. Press **Replay** on a message row, set the presented origin to *evil.TARGET*,
   and capture the dialog.
