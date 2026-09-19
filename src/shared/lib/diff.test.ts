import { describe, expect, it } from 'vitest';
import { isEmptyMessage } from './format';
import { lineDiff, prettyJson } from './diff';

describe('isEmptyMessage', () => {
  it('drops null and empty payloads', () => {
    expect(isEmptyMessage({ dataType: 'null', message: 'null' } as never)).toBe(true);
    expect(isEmptyMessage({ dataType: 'undefined', message: 'undefined' } as never)).toBe(true);
    expect(isEmptyMessage({ dataType: 'string', message: '' } as never)).toBe(true);
    expect(isEmptyMessage({ dataType: 'string', message: '   ' } as never)).toBe(true);
  });

  it('keeps a real string that happens to say null', () => {
    expect(isEmptyMessage({ dataType: 'string', message: 'null' } as never)).toBe(false);
    expect(isEmptyMessage({ dataType: 'object', message: '{"a":1}' } as never)).toBe(false);
  });
});

describe('lineDiff', () => {
  it('marks added and removed lines', () => {
    const diff = lineDiff('a\nb\nc', 'a\nB\nc');
    expect(diff.some(line => line.kind === 'del' && line.text === 'b')).toBe(true);
    expect(diff.some(line => line.kind === 'add' && line.text === 'B')).toBe(true);
  });
});

describe('prettyJson', () => {
  it('formats valid JSON and leaves junk alone', () => {
    expect(prettyJson('{"a":1}')).toContain('\n');
    expect(prettyJson('not json')).toBe('not json');
  });
});
