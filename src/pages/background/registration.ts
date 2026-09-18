import { enabledPatterns, exclusionStorage, resolveRules } from '@src/shared/storages/exclusions';

/**
 * DOMinator's content script is registered dynamically rather than declared in
 * the manifest, so that exclusions can be applied as `excludeMatches`.
 *
 * Checking a stored list inside the content script instead would mean an async
 * storage read at `document_start`, and the hooks have to be installed before
 * the page's own scripts run — by the time the read resolved the early
 * `postMessage` calls and listener registrations would already be missed.
 * Letting the browser do the matching keeps injection synchronous.
 */
const SCRIPT_ID = 'dominator-hooks';

function definition(excludeMatches: string[]): chrome.scripting.RegisteredContentScript {
  return {
    id: SCRIPT_ID,
    js: ['src/pages/contentInjected/index.js'],
    matches: ['http://*/*', 'https://*/*'],
    // Always sent: `updateContentScripts` leaves omitted keys untouched, so an
    // empty array is what clears the previous exclusions.
    excludeMatches,
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true,
  };
}

async function apply(script: chrome.scripting.RegisteredContentScript): Promise<void> {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) {
    await chrome.scripting.updateContentScripts([script]);
  } else {
    await chrome.scripting.registerContentScripts([script]);
  }
}

/** Re-registers the content script against the currently enabled exclusions. */
export async function syncContentScripts(): Promise<void> {
  const patterns = enabledPatterns(resolveRules(await exclusionStorage.get()));
  try {
    await apply(definition(patterns));
  } catch (error) {
    // One rejected pattern fails the whole call, which would leave the
    // extension injecting nowhere at all. Capturing an excluded frame is the
    // lesser failure, so fall back to running everywhere.
    console.error('DOMinator: could not register exclusions, injecting everywhere', error);
    try {
      await apply(definition([]));
    } catch (fallbackError) {
      console.error('DOMinator: content script registration failed', fallbackError);
    }
  }
}

export function watchExclusions(): void {
  chrome.runtime.onInstalled.addListener(() => void syncContentScripts());
  chrome.runtime.onStartup.addListener(() => void syncContentScripts());
  exclusionStorage.subscribe(() => void syncContentScripts());
}
