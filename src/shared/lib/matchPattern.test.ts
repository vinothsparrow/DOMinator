import { describe, expect, it } from 'vitest';
import { isValidMatchPattern, patternMatchesUrl, sitePattern, siteRuleId } from './matchPattern';

describe('isValidMatchPattern', () => {
  it.each([
    '*://example.com/*',
    '*://*.hcaptcha.com/*',
    'https://www.google.com/recaptcha/*',
    'http://example.com/path/to/page',
    '*://*/*',
  ])('accepts %s', pattern => {
    expect(isValidMatchPattern(pattern)).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['<all_urls>', 'rejected by registerContentScripts in excludeMatches'],
    ['example.com/*', 'no scheme'],
    ['*://example.com', 'no path'],
    ['ws://example.com/*', 'unsupported scheme'],
    ['file:///*', 'the content script only runs on http(s), so it could never apply'],
    ['ftp://example.com/*', 'the content script only runs on http(s)'],
    ['*://exa*mple.com/*', 'wildcard inside the host'],
    ['*://*example.com/*', 'wildcard not a whole label'],
    ['*:///*', 'empty host'],
  ])('rejects %s (%s)', pattern => {
    expect(isValidMatchPattern(pattern)).toBe(false);
  });
});

describe('patternMatchesUrl', () => {
  it('matches an exact host', () => {
    expect(patternMatchesUrl('*://example.com/*', 'https://example.com/page')).toBe(true);
    expect(patternMatchesUrl('*://example.com/*', 'http://example.com/')).toBe(true);
  });

  it('does not imply subdomains for an exact host', () => {
    expect(patternMatchesUrl('*://example.com/*', 'https://www.example.com/')).toBe(false);
  });

  it('matches the bare domain and subdomains for *.host', () => {
    expect(patternMatchesUrl('*://*.hcaptcha.com/*', 'https://hcaptcha.com/')).toBe(true);
    expect(patternMatchesUrl('*://*.hcaptcha.com/*', 'https://newassets.hcaptcha.com/captcha/v1/')).toBe(true);
  });

  it('does not let a suffix match a different domain', () => {
    expect(patternMatchesUrl('*://*.hcaptcha.com/*', 'https://nothcaptcha.com/')).toBe(false);
    expect(patternMatchesUrl('*://*.hcaptcha.com/*', 'https://hcaptcha.com.evil.test/')).toBe(false);
  });

  it('constrains the path', () => {
    const pattern = '*://www.google.com/recaptcha/*';
    expect(patternMatchesUrl(pattern, 'https://www.google.com/recaptcha/api2/anchor?k=abc')).toBe(true);
    expect(patternMatchesUrl(pattern, 'https://www.google.com/search?q=recaptcha')).toBe(false);
  });

  it('lets * in a path span slashes', () => {
    expect(patternMatchesUrl('*://example.com/a/*', 'https://example.com/a/b/c/d')).toBe(true);
  });

  it('treats the * scheme as http and https only', () => {
    expect(patternMatchesUrl('*://example.com/*', 'ftp://example.com/x')).toBe(false);
    expect(patternMatchesUrl('https://example.com/*', 'http://example.com/x')).toBe(false);
  });

  it('is case insensitive on the host but not the path', () => {
    expect(patternMatchesUrl('*://Example.COM/*', 'https://example.com/x')).toBe(true);
    expect(patternMatchesUrl('*://example.com/Path', 'https://example.com/path')).toBe(false);
  });

  it('returns false for unparseable urls and patterns', () => {
    expect(patternMatchesUrl('*://example.com/*', 'not a url')).toBe(false);
    expect(patternMatchesUrl('nonsense', 'https://example.com/')).toBe(false);
    expect(patternMatchesUrl('*://example.com/*', '')).toBe(false);
  });

  it('covers a reCAPTCHA frame embedded in an unrelated site', () => {
    // The reason built-in rules exist: excluding the top-level site would not
    // stop DOMinator injecting into the widget's own frame.
    const frame = 'https://www.google.com/recaptcha/api2/anchor?k=6Le-wvkS&co=aHR0cHM6Ly9zaG9wLnRlc3Q6NDQz';
    expect(patternMatchesUrl(sitePattern('shop.test'), frame)).toBe(false);
    expect(patternMatchesUrl('*://www.google.com/recaptcha/*', frame)).toBe(true);
  });
});

describe('site helpers', () => {
  it('builds a pattern and id for a host', () => {
    expect(sitePattern('Example.com')).toBe('*://example.com/*');
    expect(siteRuleId('Example.com')).toBe('site:example.com');
  });

  it('produces a pattern that matches its own host', () => {
    expect(patternMatchesUrl(sitePattern('shop.test'), 'https://shop.test/checkout?a=1')).toBe(true);
  });
});
