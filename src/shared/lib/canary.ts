import { mapStringLeaves, parseJson, setAtPath, stringifyJson } from './jsonPath';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Unique token long enough to pass the taint minimum (8 chars). */
export function makeCanary(prefix = 'DOMNTR'): string {
  let rand = '';
  for (let i = 0; i < 10; i++) {
    rand += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `__${prefix}_${rand}__`;
}

export const XSS_HTML = '<img src=x onerror=alert(document.domain)>';
export const XSS_SVG = '<svg onload=alert(document.domain)>';
export const XSS_JS = 'alert(document.domain)';
export const XSS_URL = 'javascript:alert(document.domain)';
export const PROTO_KEY = '__proto__';
export const PROTO_VALUE = { dominatorPolluted: true };

export function withCanary(html: string, canary: string): string {
  return html.replace('alert(document.domain)', `alert(${JSON.stringify(canary)})`);
}

/**
 * Injects `canary` into every string leaf of a JSON payload, or replaces a
 * raw string. Returns `{ text, mode }` ready for the replay editor.
 */
export function injectCanary(raw: string, canary: string, mode: 'json' | 'text'): { text: string; mode: 'json' | 'text' } {
  if (mode === 'json') {
    const parsed = parseJson(raw);
    if (parsed === undefined) {
      return { text: canary, mode: 'text' };
    }
    if (typeof parsed === 'string') {
      return { text: JSON.stringify(parsed + canary), mode: 'json' };
    }
    const mapped = mapStringLeaves(parsed, leaf => (leaf.length ? leaf + canary : canary));
    return { text: stringifyJson(mapped), mode: 'json' };
  }
  return { text: raw ? raw + canary : canary, mode: 'text' };
}

export function injectAtLeaf(raw: string, path: Array<string | number>, value: string): string {
  const parsed = parseJson(raw);
  if (parsed === undefined) return JSON.stringify(value);
  return stringifyJson(setAtPath(parsed, path, value));
}
