export type DiffKind = 'eq' | 'add' | 'del';

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/** Line-level LCS diff, good enough for captured vs replayed payloads. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = (before ?? '').split('\n');
  const b = (after ?? '').split('\n');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'eq', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: a[i] });
      i += 1;
    } else {
      out.push({ kind: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ kind: 'del', text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: 'add', text: b[j] });
    j += 1;
  }
  return out;
}

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
