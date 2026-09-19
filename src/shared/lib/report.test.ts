import { describe, expect, it } from 'vitest';
import { buildReport, sessionDump } from './report';
import { ExtensionListenerMessage, ExtensionPostMessage } from '@src/shared/types/message';

describe('report', () => {
  it('summarises confirmed flows and high-risk listeners', () => {
    const messages: ExtensionPostMessage[] = [
      {
        id: 'rcv-1',
        time: 1,
        direction: 'received',
        isTop: true,
        from: 'https://evil.com',
        to: 'https://target.example/',
        fromFrame: 'top',
        toFrame: 'top',
        message: '<img src=x>',
        dataType: 'string',
        size: 12,
        risk: 'high',
        flags: ['reached innerHTML'],
        confirmed: true,
        flows: [{ id: 'snk-1', time: 2, sink: 'innerHTML', value: '<img src=x>', messageId: 'rcv-1' }],
      },
    ];
    const listeners: ExtensionListenerMessage[] = [
      {
        id: 'lsn-1',
        time: 1,
        listener: 'function (e) { el.innerHTML = e.data }',
        stack: '',
        frame: 'top',
        origin: 'https://target.example/',
        checksOrigin: false,
        originCheck: 'none',
        sinks: ['innerHTML'],
        risk: 'high',
      },
    ];
    const md = buildReport(sessionDump('https://target.example/', messages, listeners));
    expect(md).toContain('Confirmed source-to-sink flows');
    expect(md).toContain('innerHTML');
    expect(md).toContain('High-risk listeners');
  });
});
