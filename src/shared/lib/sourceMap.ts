import { SourceLocation } from '@src/shared/types/message';

const VLQ_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VLQ_MAP: Record<string, number> = {};
for (let i = 0; i < VLQ_ALPHABET.length; i++) VLQ_MAP[VLQ_ALPHABET[i]] = i;

interface SourceMapFile {
  version?: number;
  file?: string;
  sources?: string[];
  sourcesContent?: Array<string | null>;
  names?: string[];
  mappings?: string;
  sourceRoot?: string;
}

interface Mapping {
  generatedLine: number;
  generatedColumn: number;
  sourceIndex: number;
  originalLine: number;
  originalColumn: number;
}

const cache = new Map<string, { mappings: Mapping[]; sources: string[] } | null>();

function decodeVlq(segment: string): number[] {
  const values: number[] = [];
  let i = 0;
  while (i < segment.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = VLQ_MAP[segment[i]];
      if (byte === undefined) return values;
      i += 1;
      result += (byte & 31) << shift;
      shift += 5;
    } while (byte & 32);
    const signed = result & 1 ? -(result >> 1) : result >> 1;
    values.push(signed);
  }
  return values;
}

function parseMappings(map: SourceMapFile): Mapping[] {
  const mappings: Mapping[] = [];
  const lines = (map.mappings || '').split(';');
  let genLine = 1;
  let srcIndex = 0;
  let origLine = 1;
  let origCol = 0;
  for (const line of lines) {
    let genCol = 0;
    if (line) {
      const segments = line.split(',');
      for (const segment of segments) {
        const decoded = decodeVlq(segment);
        if (decoded.length < 4) continue;
        genCol += decoded[0];
        srcIndex += decoded[1];
        origLine += decoded[2];
        origCol += decoded[3];
        mappings.push({
          generatedLine: genLine,
          generatedColumn: Math.max(0, genCol),
          sourceIndex: srcIndex,
          originalLine: origLine,
          originalColumn: Math.max(0, origCol),
        });
      }
    }
    genLine += 1;
  }
  return mappings;
}

function findMapping(mappings: Mapping[], line: number, column: number): Mapping | null {
  let best: Mapping | null = null;
  for (const mapping of mappings) {
    if (mapping.generatedLine < line) {
      best = mapping;
      continue;
    }
    if (mapping.generatedLine > line) break;
    if (mapping.generatedColumn <= column) best = mapping;
    else break;
  }
  return best && best.generatedLine === line ? best : best;
}

function sourceMappingUrl(content: string): string | null {
  const match = content.match(/[#@]\s*sourceMappingURL\s*=\s*(\S+)\s*$/m);
  return match ? match[1].trim() : null;
}

function resolveUrl(spec: string, base: string): string {
  if (spec.startsWith('data:')) return spec;
  try {
    return new URL(spec, base).href;
  } catch {
    return spec;
  }
}

async function fetchText(url: string): Promise<string | null> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma < 0) return null;
    const meta = url.slice(5, comma);
    const data = url.slice(comma + 1);
    try {
      return /;base64/i.test(meta) ? decodeURIComponent(escape(atob(data))) : decodeURIComponent(data);
    } catch {
      return null;
    }
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function getResourceContent(url: string): Promise<string | null> {
  const getResources = chrome.devtools?.inspectedWindow?.getResources;
  if (!getResources) return fetchText(url);
  return new Promise(resolve => {
    getResources(resources => {
      const resource = resources.find(item => item.url === url);
      if (!resource) {
        fetchText(url).then(resolve);
        return;
      }
      resource.getContent(content => resolve(content || null));
    });
  });
}

async function mappingsFor(file: string): Promise<{ mappings: Mapping[]; sources: string[] } | null> {
  const cached = cache.get(file);
  if (cached === null) return null;
  if (cached) return cached;
  const content = await getResourceContent(file);
  if (!content) {
    cache.set(file, null);
    return null;
  }
  const spec = sourceMappingUrl(content);
  if (!spec) {
    cache.set(file, null);
    return null;
  }
  const mapUrl = resolveUrl(spec, file);
  let raw: string | null;
  if (mapUrl.startsWith('data:')) raw = await fetchText(mapUrl);
  else raw = (await getResourceContent(mapUrl)) || (await fetchText(mapUrl));
  if (!raw) {
    cache.set(file, null);
    return null;
  }
  try {
    const map = JSON.parse(raw) as SourceMapFile;
    const parsed = { mappings: parseMappings(map), sources: map.sources || [] };
    cache.set(file, parsed);
    return parsed;
  } catch {
    cache.set(file, null);
    return null;
  }
}

/**
 * Resolves a generated `file:line:column` through its source map when DevTools
 * (or fetch) can see the script. Failures return the original location.
 */
export async function resolveSourceLocation(source: SourceLocation): Promise<SourceLocation> {
  if (source.mapped) return source;
  try {
    const result = await mappingsFor(source.file);
    if (!result || result.mappings.length === 0) return source;
    const mapping = findMapping(result.mappings, source.line, source.column);
    if (!mapping) return source;
    const origin = result.sources[mapping.sourceIndex];
    if (!origin) return source;
    let file = origin;
    try {
      file = new URL(origin, source.file).href;
    } catch {
      file = origin;
    }
    return {
      ...source,
      mapped: {
        file,
        fileName: file.split(/[\\/]/).pop()?.split('?')[0] || file,
        line: mapping.originalLine,
        column: mapping.originalColumn,
      },
    };
  } catch {
    return source;
  }
}
