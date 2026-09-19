import { describe, expect, it } from 'vitest';
import {
  buildReplayExpression,
  buildSpoofReplayExpression,
  highlightFrameExpression,
  isResolvableFrame,
  normalizeTarget,
} from './replay';

describe('replay', () => {
  it('normalises frame paths', () => {
    expect(normalizeTarget('top.frames[0]')).toBe('top.frames[0]');
    expect(normalizeTarget('diffwin')).toBe('window');
    expect(isResolvableFrame('parent.frames[2]')).toBe(true);
  });

  it('builds a postMessage expression', () => {
    const expr = buildReplayExpression('top', 'json', '{"a":1}', '*');
    expect(expr).toContain('JSON.parse');
    expect(expr).toContain('postMessage');
  });

  it('builds a spoofed-origin dispatch', () => {
    const expr = buildSpoofReplayExpression('window', 'text', 'hello', 'https://evil.com');
    expect(expr).toContain('__DOMINATOR__');
    expect(expr).toContain('https://evil.com');
    expect(expr).toContain('MessageEvent');
  });

  it('builds a frame outline expression', () => {
    expect(highlightFrameExpression('top.frames[0]')).toContain('frameElement');
  });
});
