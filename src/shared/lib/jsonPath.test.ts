import { describe, expect, it } from 'vitest';
import { getAtPath, mapStringLeaves, parseJson, setAtPath, walkLeaves, withProtoKey } from './jsonPath';
import { injectCanary, injectAtLeaf, makeCanary } from './canary';

describe('jsonPath', () => {
  it('walks nested string leaves', () => {
    const leaves = walkLeaves({ type: 'x', payload: { html: '<b>1</b>', n: 2 } });
    expect(leaves.map(leaf => leaf.key)).toContain('payload.html');
  });

  it('sets a nested path', () => {
    const next = setAtPath({ a: { b: 'old' } }, ['a', 'b'], 'new');
    expect(getAtPath(next, ['a', 'b'])).toBe('new');
  });

  it('injects a proto key into JSON text', () => {
    const text = withProtoKey('{"type":"msg"}');
    expect(text).toContain('"__proto__"');
    expect(parseJson(text)).toBeTruthy();
  });

  it('maps string leaves', () => {
    const mapped = mapStringLeaves({ a: 'x', b: [ 'y' ] }, leaf => leaf + '!');
    expect(mapped).toEqual({ a: 'x!', b: ['y!'] });
  });
});

describe('canary', () => {
  it('is long enough to pass the default taint minimum', () => {
    expect(makeCanary().length).toBeGreaterThanOrEqual(12);
  });

  it('appends a canary to every JSON string leaf', () => {
    const next = injectCanary('{"html":"hi"}', '__DOMNTR_test__', 'json');
    expect(next.mode).toBe('json');
    expect(JSON.parse(next.text).html).toBe('hi__DOMNTR_test__');
  });

  it('writes a value at a leaf path', () => {
    expect(JSON.parse(injectAtLeaf('{"a":{"b":"x"}}', ['a', 'b'], 'xss')).a.b).toBe('xss');
  });
});
