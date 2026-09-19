export type JsonPath = Array<string | number>;

export type JsonNodeType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export interface JsonNode {
  path: JsonPath;
  key: string;
  type: JsonNodeType;
  value: unknown;
}

export function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function typeOfJson(value: unknown): JsonNodeType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return t;
  return 'object';
}

/** Walks string / number / boolean leaves plus empty object/array containers. */
export function walkLeaves(value: unknown, path: JsonPath = []): JsonNode[] {
  const type = typeOfJson(value);
  if (type === 'object' && isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return [{ path, key: pathKey(path), type, value }];
    }
    const nodes: JsonNode[] = [];
    for (const key of keys) {
      nodes.push(...walkLeaves(value[key], path.concat(key)));
    }
    return nodes;
  }
  if (type === 'array' && Array.isArray(value)) {
    if (value.length === 0) return [{ path, key: pathKey(path), type, value }];
    const nodes: JsonNode[] = [];
    for (let i = 0; i < value.length; i++) {
      nodes.push(...walkLeaves(value[i], path.concat(i)));
    }
    return nodes;
  }
  return [{ path, key: pathKey(path), type, value }];
}

export function pathKey(path: JsonPath): string {
  if (path.length === 0) return '(root)';
  return path
    .map((part, index) => (typeof part === 'number' ? `[${part}]` : index === 0 ? part : `.${part}`))
    .join('');
}

export function getAtPath(root: unknown, path: JsonPath): unknown {
  let current = root;
  for (const part of path) {
    if (current == null) return undefined;
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

export function setAtPath(root: unknown, path: JsonPath, value: unknown): unknown {
  if (path.length === 0) return value;
  const clone = cloneJson(root);
  let cursor: Record<string | number, unknown> = clone as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const part = path[i];
    const next = cursor[part];
    const nextPart = path[i + 1];
    if (next == null || typeof next !== 'object') {
      cursor[part] = typeof nextPart === 'number' ? [] : {};
    } else {
      cursor[part] = Array.isArray(next) ? next.slice() : { ...(next as object) };
    }
    cursor = cursor[part] as Record<string | number, unknown>;
  }
  cursor[path[path.length - 1]] = value;
  return clone;
}

export function deleteAtPath(root: unknown, path: JsonPath): unknown {
  if (path.length === 0) return root;
  const clone = cloneJson(root);
  let cursor: Record<string | number, unknown> = clone as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const part = path[i];
    const next = cursor[part];
    if (next == null || typeof next !== 'object') return clone;
    cursor[part] = Array.isArray(next) ? next.slice() : { ...(next as object) };
    cursor = cursor[part] as Record<string | number, unknown>;
  }
  const last = path[path.length - 1];
  if (Array.isArray(cursor) && typeof last === 'number') {
    (cursor as unknown as unknown[]).splice(last, 1);
  } else {
    delete cursor[last];
  }
  return clone;
}

/** Sets `__proto__` / `constructor` / `prototype` on the object at `path`. */
export function polluteAtPath(root: unknown, path: JsonPath, key: string, value: unknown): unknown {
  const target = path.length === 0 ? root : getAtPath(root, path);
  if (!isPlainObject(target) && !Array.isArray(target) && path.length !== 0) {
    return setAtPath(root, path, { [key]: value });
  }
  const polluted = { ...(isPlainObject(target) ? target : {}), [key]: value };
  return setAtPath(root, path, polluted);
}

export function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* cyclic / exotic */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Splices a `__proto__` key into a JSON object string so it survives stringify. */
export function withProtoKey(jsonText: string): string {
  const trimmed = (jsonText || '').trim();
  if (trimmed.indexOf('"__proto__"') !== -1) return jsonText;
  if (trimmed.startsWith('{')) {
    return '{"__proto__":{"dominatorPolluted":true}' + (trimmed === '{}' ? '}' : ',' + trimmed.slice(1));
  }
  return '{"__proto__":{"dominatorPolluted":true},"value":' + (trimmed || 'null') + '}';
}

/** Replaces every string leaf with `mapper`; used by auto-probe canary injection. */
export function mapStringLeaves(value: unknown, mapper: (leaf: string, path: JsonPath) => string, path: JsonPath = []): unknown {
  if (typeof value === 'string') return mapper(value, path);
  if (Array.isArray(value)) {
    return value.map((item, index) => mapStringLeaves(item, mapper, path.concat(index)));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = mapStringLeaves(value[key], mapper, path.concat(key));
    }
    return out;
  }
  return value;
}
