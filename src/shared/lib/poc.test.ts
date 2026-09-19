import { describe, expect, it } from 'vitest';
import { ExtensionListenerMessage } from '@src/shared/types/message';
import { buildPoc, payloadTemplates, suggestedPayload } from './poc';

function listener(partial: Partial<ExtensionListenerMessage> = {}): ExtensionListenerMessage {
  return {
    id: 'lsn-1',
    time: 1,
    listener: 'function(){}',
    stack: '',
    frame: 'top',
    origin: 'https://target.example/',
    checksOrigin: false,
    originCheck: 'none',
    sinks: ['innerHTML'],
    risk: 'high',
    ...partial,
  };
}

describe('poc', () => {
  it('prefers markup payloads for HTML sinks', () => {
    expect(suggestedPayload(['innerHTML']).label).toMatch(/HTML/);
  });

  it('builds iframe, opener and snippet PoCs', () => {
    const template = payloadTemplates(['innerHTML'])[0];
    const iframe = buildPoc(listener(), template, 'iframe');
    const opener = buildPoc(listener(), template, 'opener');
    const snippet = buildPoc(listener(), template, 'snippet');
    expect(iframe).toContain('iframe');
    expect(opener).toContain('window.open');
    expect(snippet).toContain('postMessage');
  });

  it('warns when the origin check is bypassable', () => {
    const html = buildPoc(listener({ originCheck: 'bypassable', originCheckDetail: 'startsWith', checksOrigin: true }), suggestedPayload(['innerHTML']));
    expect(html).toContain('bypassable');
  });
});
