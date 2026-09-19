import { OriginCheckKind, RiskLevel } from '@src/shared/types/message';

export interface OriginCheckResult {
  kind: OriginCheckKind;
  detail?: string;
  /** Back-compat boolean used by older UI filters. */
  checksOrigin: boolean;
}

/**
 * Classifies how a message listener validates the sender.
 *
 * Keep the regexes here in sync with the copies in `pages/content/ui/index.ts`
 * (that file cannot import this module — it is loaded as a classic script).
 */
const STRICT_RE =
  /origin\s*===|===\s*[\w.]*origin|origin\s*!==|!==\s*[\w.]*origin|originIsAllowed|isTrustedOrigin|ALLOWED_ORIGINS|allowedOrigins|trustedOrigins|ALLOWEDORIGIN/i;

const BYPASS_METHOD_RE = /\.origin\s*\.\s*(startsWith|endsWith|includes|indexOf|search)\s*\(/;

const BYPASS_INDEXOF_RE = /\.indexOf\s*\(\s*(event\.)?origin|(event\.)?origin\s*\)\s*[!=<>]/;

const BYPASS_MATCH_RE = /\.origin\s*\.match\s*\(\s*\/[^/\n]*[^$/]/;
const BYPASS_TEST_RE = /\/[^/\n]*[^$/\n]\/\s*\.\s*(?:test|exec)\s*\(\s*(event\.)?origin/;

const SOURCE_RE = /event\s*\.\s*source\b|\.source\s*===\s*(window|parent|opener|frames)/;

function firstGroup(re: RegExp, source: string): string | undefined {
  const match = re.exec(source);
  return match && match[1] ? match[1] : undefined;
}

export function classifyOriginCheck(source: string): OriginCheckResult {
  if (!source) return { kind: 'none', checksOrigin: false };

  const bypassMethod = firstGroup(BYPASS_METHOD_RE, source);
  const unanchored = BYPASS_MATCH_RE.test(source) || BYPASS_TEST_RE.test(source);
  const indexOf = BYPASS_INDEXOF_RE.test(source);
  const bypassed = Boolean(bypassMethod) || unanchored || indexOf;

  if (bypassed) {
    const detail = bypassMethod || (indexOf ? 'indexOf' : 'unanchored-regex');
    return { kind: 'bypassable', detail, checksOrigin: true };
  }

  if (STRICT_RE.test(source)) {
    return { kind: 'strict', detail: '=== / allowlist', checksOrigin: true };
  }

  if (SOURCE_RE.test(source)) {
    return { kind: 'source', detail: 'event.source', checksOrigin: true };
  }

  return { kind: 'none', checksOrigin: false };
}

export function originCheckLabel(kind: OriginCheckKind): string {
  switch (kind) {
    case 'strict':
      return 'strict origin';
    case 'bypassable':
      return 'bypassable origin check';
    case 'source':
      return 'source check only';
    default:
      return 'no origin check';
  }
}

/** Risk of a listener given sinks + origin-check kind. */
export function scoreListenerRisk(sinkCount: number, kind: OriginCheckKind): RiskLevel {
  if (sinkCount > 0 && (kind === 'none' || kind === 'bypassable')) return 'high';
  if (sinkCount > 0 && kind === 'source') return 'high';
  if (sinkCount > 0) return 'medium';
  if (kind === 'none' || kind === 'bypassable') return 'medium';
  return 'low';
}
