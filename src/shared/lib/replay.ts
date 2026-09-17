import { ReplayResult } from '@src/shared/types/message';

/** Window expressions we are willing to resolve as a replay target. */
export const FRAME_TARGET_RE = /^(window|self|top|parent|opener)(\.frames\[\d+\])*$/;

/**
 * The captured frame path (`top`, `top.frames[0]`) is also a valid JS window
 * expression, so it doubles as the replay target. Anything we do not recognise
 * (a cross-window handle, `diffwin`, `unknown`) falls back to the current window.
 */
export function normalizeTarget(frame: string): string {
  const trimmed = (frame || '').trim();
  return FRAME_TARGET_RE.test(trimmed) ? trimmed : 'window';
}

export function isResolvableFrame(frame: string): boolean {
  return FRAME_TARGET_RE.test((frame || '').trim());
}

/** Builds the expression evaluated in the page to fire one postMessage. */
export function buildReplayExpression(
  target: string,
  mode: 'json' | 'text',
  rawText: string,
  targetOrigin: string,
): string {
  const valueExpr = mode === 'json' ? `JSON.parse(${JSON.stringify(rawText)})` : JSON.stringify(rawText);
  const originLit = JSON.stringify(targetOrigin || '*');
  const targetExpr = normalizeTarget(target);
  return (
    `(function(){try{var _t=${targetExpr};` +
    `if(!_t)return JSON.stringify({ok:false,error:'target frame not found'});` +
    `_t.postMessage(${valueExpr},${originLit});` +
    `return JSON.stringify({ok:true})}` +
    `catch(e){return JSON.stringify({ok:false,error:String((e&&e.message)||e)})}})()`
  );
}

/** True when replay is possible: only the DevTools panel can eval in the page. */
export function canReplay(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.devtools?.inspectedWindow?.eval;
}

/** Fires a (possibly mutated) message into the inspected page. */
export function runReplay(
  target: string,
  mode: 'json' | 'text',
  rawText: string,
  targetOrigin: string,
): Promise<ReplayResult> {
  return new Promise(resolve => {
    if (!canReplay()) {
      resolve({ ok: false, error: 'Replay is only available in the DevTools panel.' });
      return;
    }
    const expression = buildReplayExpression(target, mode, rawText, targetOrigin);
    try {
      chrome.devtools.inspectedWindow.eval(expression, (result: string, exception) => {
        if (exception && (exception.isError || exception.isException)) {
          resolve({ ok: false, error: exception.value || exception.description || 'evaluation failed' });
          return;
        }
        try {
          resolve(JSON.parse(result));
        } catch (e) {
          resolve({ ok: false, error: 'unexpected replay result' });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}
