import React from 'react';
import { Crosshair, Pause, ShieldAlert } from 'lucide-react';
import useStorage from '@src/shared/hooks/useStorage';
import { instrumentationStorage, mergeInstrumentation } from '@src/shared/storages/instrumentation';
import { OriginSpoofMode } from '@src/shared/types/message';
import { Switch } from './Switch';
import { cn } from '@src/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@src/components/ui/select';

const SPOOF: { value: OriginSpoofMode; label: string }[] = [
  { value: 'off', label: 'Origin: real' },
  { value: 'evil', label: 'evil.com' },
  { value: 'prefix', label: 'evil.target' },
  { value: 'suffix', label: 'target.evil.com' },
  { value: 'custom', label: 'custom' },
];

/** Live toggles for auto-probe, intercept and origin spoofing. */
export function ProbeControls({ className }: { className?: string }) {
  const raw = useStorage(instrumentationStorage);
  const config = mergeInstrumentation(raw);

  const set = (patch: Partial<typeof config>) => {
    void instrumentationStorage.set({ ...config, ...patch });
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]">
        <Crosshair className="h-3 w-3 text-muted-foreground" />
        Probe
        <Switch on={config.autoProbe} onChange={value => set({ autoProbe: value })} label="Auto-probe listeners" />
      </span>
      <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]">
        <Pause className="h-3 w-3 text-muted-foreground" />
        Intercept
        <Switch on={config.intercept} onChange={value => set({ intercept: value })} label="Pause messages before listeners" />
      </span>
      <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]">
        Canary
        <Switch
          on={config.canaryInjection}
          onChange={value => set({ canaryInjection: value })}
          label="Inject canaries into live payloads"
        />
      </span>
      <Select
        value={config.spoofOrigin}
        onValueChange={next => set({ spoofOrigin: next as OriginSpoofMode })}>
        <SelectTrigger
          title="Origin presented to listeners"
          className="h-7 w-[150px] gap-1 px-2 text-[10px]">
          <ShieldAlert className="h-3 w-3 shrink-0 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[200]" position="popper">
          {SPOOF.map(option => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {config.spoofOrigin === 'custom' && (
        <input
          value={config.spoofCustom}
          onChange={event => set({ spoofCustom: event.target.value })}
          spellCheck={false}
          className="h-6 w-[140px] rounded-md border bg-background px-1.5 font-mono text-[10px] outline-none"
        />
      )}
    </div>
  );
}
