/**
 * Chrome match pattern helpers.
 *
 * Kept free of any `chrome.*` access so both the background worker and the
 * extension pages can use them, and so they are testable on their own.
 * @see https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
 */

// Only the schemes the content script is registered for. `excludeMatches` can
// merely narrow `matches`, so a file:// or ftp:// rule could never do anything
// and is rejected rather than silently accepted as a dead rule.
const SCHEME = /^(\*|https?)$/;

type ParsedPattern = { scheme: string; host: string; path: string };

function parsePattern(pattern: string): ParsedPattern | null {
  if (!pattern || pattern === '<all_urls>') return null;

  const schemeEnd = pattern.indexOf('://');
  if (schemeEnd < 1) return null;
  const scheme = pattern.slice(0, schemeEnd);
  if (!SCHEME.test(scheme)) return null;

  const rest = pattern.slice(schemeEnd + 3);
  const pathStart = rest.indexOf('/');
  if (pathStart < 0) return null;

  const host = rest.slice(0, pathStart).toLowerCase();
  if (!host) return null;
  if (host !== '*') {
    // `*` is only legal as the whole host or as the leading `*.` label.
    const bare = host.startsWith('*.') ? host.slice(2) : host;
    if (!bare || bare.indexOf('*') !== -1) return null;
    if (!/^[a-z0-9.-]+$/.test(bare)) return null;
  }

  return { scheme, host, path: rest.slice(pathStart) };
}

/**
 * `registerContentScripts` rejects the entire call on a single bad pattern, so
 * anything that would not survive it has to be filtered out beforehand.
 */
export function isValidMatchPattern(pattern: string): boolean {
  return parsePattern(pattern) !== null;
}

function pathToRegExp(path: string): RegExp {
  // `*` in a match pattern path spans any characters, including `/`.
  const escaped = path.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\s\\S]*');
  return new RegExp('^' + escaped + '$');
}

/**
 * Whether a URL would be excluded by a pattern, mirroring how Chrome matches.
 *
 * Only used to describe the current tab in the UI — the browser itself does the
 * matching that decides whether the content script actually runs.
 */
export function patternMatchesUrl(pattern: string, url: string): boolean {
  const parsed = parsePattern(pattern);
  if (!parsed) return false;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }

  const scheme = target.protocol.replace(':', '');
  // As in Chrome, `*` covers http and https only.
  if (parsed.scheme === '*') {
    if (scheme !== 'http' && scheme !== 'https') return false;
  } else if (parsed.scheme !== scheme) {
    return false;
  }

  const host = target.hostname.toLowerCase();
  if (parsed.host !== '*') {
    if (parsed.host.startsWith('*.')) {
      const suffix = parsed.host.slice(2);
      if (host !== suffix && !host.endsWith('.' + suffix)) return false;
    } else if (host !== parsed.host) {
      return false;
    }
  }

  return pathToRegExp(parsed.path).test(target.pathname + target.search);
}

/** `*://example.com/*` — the exact host only, subdomains are not implied. */
export function sitePattern(host: string): string {
  return '*://' + host.toLowerCase() + '/*';
}

/** The rule id used for a whole-site exclusion added from the popup. */
export function siteRuleId(host: string): string {
  return 'site:' + host.toLowerCase();
}
