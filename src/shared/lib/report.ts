import { ClobberRecord, ExtensionListenerMessage, ExtensionPostMessage, PollutionRecord, SessionDump } from '@src/shared/types/message';
import { hostOf } from './format';
import { originCheckLabel } from './originCheck';
import { buildPoc, suggestedPayload } from './poc';

export function buildReport(dump: SessionDump): string {
  const url = dump.url || 'unknown page';
  const host = hostOf(url);
  const messages = dump.messages || [];
  const listeners = dump.listeners || [];
  const pollutions = dump.pollutions || [];
  const clobbers = dump.clobbers || [];
  const confirmed = messages.filter(m => m.confirmed);
  const highListeners = listeners.filter(l => l.risk === 'high' && !l.removed);
  const leaks = messages.filter(m => m.leaks && m.leaks.length > 0);
  const dangerousClobber = clobbers.filter(c => c.dangerous);

  const lines: string[] = [];
  lines.push(`# DOMinator findings — ${host}`);
  lines.push('');
  lines.push(`- **Target:** ${url}`);
  lines.push(`- **Exported:** ${new Date(dump.exportedAt || Date.now()).toISOString()}`);
  lines.push(`- **Messages:** ${messages.length} (${confirmed.length} confirmed sink flows)`);
  lines.push(`- **Listeners:** ${listeners.length} (${highListeners.length} high risk)`);
  lines.push(`- **Prototype pollution:** ${pollutions.length}`);
  lines.push(`- **DOM clobbering:** ${clobbers.length} (${dangerousClobber.length} dangerous)`);
  lines.push(`- **Cross-origin leaks:** ${leaks.length}`);
  lines.push('');

  if (confirmed.length) {
    lines.push('## Confirmed source-to-sink flows');
    lines.push('');
    for (const message of confirmed) {
      lines.push(`### ${message.id}`);
      lines.push('');
      lines.push(`- **From** \`${message.from}\` → **to** \`${message.to}\``);
      lines.push(`- **Frame:** \`${message.fromFrame} → ${message.toFrame}\``);
      if (message.taintSource) lines.push(`- **Source:** ${message.taintSource}`);
      for (const flow of message.flows || []) {
        const loc = flow.source ? `${flow.source.fileName}:${flow.source.line}` : 'unknown';
        const blocked = flow.blocked ? ` *(blocked by ${flow.blockedReason || 'CSP/Trusted Types'})*` : '';
        lines.push(`- Reached \`${flow.sink}\` at \`${loc}\`${blocked}`);
        lines.push('');
        lines.push('```');
        lines.push(truncate(flow.value, 400));
        lines.push('```');
      }
      lines.push('');
    }
  }

  if (highListeners.length) {
    lines.push('## High-risk listeners');
    lines.push('');
    for (const listener of highListeners) {
      const loc = listener.source ? `${listener.source.fileName}:${listener.source.line}:${listener.source.column}` : 'unknown';
      lines.push(`### ${loc}`);
      lines.push('');
      lines.push(`- **Origin check:** ${originCheckLabel(listener.originCheck)}${listener.originCheckDetail ? ` (${listener.originCheckDetail})` : ''}`);
      lines.push(`- **Sinks:** ${listener.sinks.length ? listener.sinks.join(', ') : 'none detected (static)'}`);
      lines.push(`- **Hits:** ${listener.hitCount ?? 0}${listener.confirmedCount ? `, ${listener.confirmedCount} confirmed` : ''}`);
      lines.push(`- **Frame:** \`${listener.frame}\``);
      lines.push('');
    }
  }

  if (leaks.length) {
    lines.push('## Cross-origin leaks');
    lines.push('');
    for (const message of leaks) {
      lines.push(`- \`${hostOf(message.from)}\` → \`${hostOf(message.to)}\` posted ${message.leaks?.join(', ')}`);
    }
    lines.push('');
  }

  if (pollutions.length) {
    lines.push('## Prototype pollution');
    lines.push('');
    for (const pollution of pollutions) {
      const loc = pollution.source ? `${pollution.source.fileName}:${pollution.source.line}` : 'unknown';
      lines.push(`- \`${pollution.via}\` wrote \`${pollution.keys.join(', ')}\` at \`${loc}\``);
    }
    lines.push('');
  }

  if (dangerousClobber.length) {
    lines.push('## DOM clobbering');
    lines.push('');
    for (const hit of dangerousClobber) {
      lines.push(`- \`<${hit.tag.toLowerCase()} id/name="${hit.name}">\` overwrites \`window.${hit.name}\` in \`${hit.frame}\``);
    }
    lines.push('');
  }

  if (highListeners.length) {
    lines.push('## PoC sketches');
    lines.push('');
    for (const listener of highListeners.slice(0, 8)) {
      const template = suggestedPayload(listener.sinks);
      lines.push(`### ${listener.source ? `${listener.source.fileName}:${listener.source.line}` : listener.id}`);
      lines.push('');
      lines.push('```html');
      lines.push(buildPoc(listener, template));
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function truncate(value: string, max: number): string {
  if (!value) return '';
  return value.length > max ? value.slice(0, max) + '…' : value;
}

export function sessionDump(
  url: string,
  messages: ExtensionPostMessage[],
  listeners: ExtensionListenerMessage[],
  pollutions: PollutionRecord[] = [],
  clobbers: ClobberRecord[] = [],
): SessionDump {
  return {
    version: 1,
    exportedAt: Date.now(),
    url,
    messages,
    listeners,
    pollutions,
    clobbers,
  };
}
