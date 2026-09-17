import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@src/shared/hooks/useTheme';
import { cn } from '@src/lib/utils';

function resolvedTheme(theme: string): 'dark' | 'light' {
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const current = resolvedTheme(theme);

  return (
    <button
      type="button"
      title={`Switch to ${current === 'dark' ? 'light' : 'dark'} theme`}
      onClick={() => setTheme(current === 'dark' ? 'light' : 'dark')}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        className,
      )}>
      {current === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
