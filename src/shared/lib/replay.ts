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

function valueExpr(mode: 'json' | 'text', rawText: string): string {
  return mode === 'json' ? `JSON.parse(${JSON.stringify(rawText)})` : JSON.stringify(rawText);
}

/** Builds the expression evaluated in the page to fire one postMessage. */
export function buildReplayExpression(
  target: string,
  mode: 'json' | 'text',
  rawText: string,
  targetOrigin: string,
): string {
  const originLit = JSON.stringify(targetOrigin || '*');
  const targetExpr = normalizeTarget(target);
  return (
    `(function(){try{var _t=${targetExpr};` +
    `if(!_t)return JSON.stringify({ok:false,error:'target frame not found'});` +
    `_t.postMessage(${valueExpr(mode, rawText)},${originLit});` +
    `return JSON.stringify({ok:true})}` +
    `catch(e){return JSON.stringify({ok:false,error:String((e&&e.message)||e)})}})()`
  );
}

/**
 * Dispatches a MessageEvent with a chosen origin so listeners that check
 * `event.origin` see an attacker origin. Prefers the page's `__DOMINATOR__.replay`
 * helper so the receive is still captured.
 */
export function buildSpoofReplayExpression(
  target: string,
  mode: 'json' | 'text',
  rawText: string,
  spoofedOrigin: string,
): string {
  const originLit = JSON.stringify(spoofedOrigin);
  const targetExpr = normalizeTarget(target);
  const data = valueExpr(mode, rawText);
  return (
    `(function(){try{var _t=${targetExpr};` +
    `if(!_t)return JSON.stringify({ok:false,error:'target frame not found'});` +
    `if(_t.__DOMINATOR__&&typeof _t.__DOMINATOR__.replay==='function'){` +
    `return JSON.stringify(_t.__DOMINATOR__.replay(${data},${originLit}));}` +
    `var ev=new MessageEvent('message',{data:${data},origin:${originLit},source:window});` +
    `_t.dispatchEvent(ev);return JSON.stringify({ok:true,spoofed:true})}` +
    `catch(e){return JSON.stringify({ok:false,error:String((e&&e.message)||e)})}})()`
  );
}

export function highlightFrameExpression(frame: string): string {
  const target = isResolvableFrame(frame) ? frame : 'window';
  return (
    `(function(){try{var w=${target};var el=(w&&w!==window&&w.frameElement)||(w&&w.document&&w.document.documentElement);` +
    `if(!el)return;el.setAttribute('data-dominator-outline','1');el.style.outline='3px solid #6366f1';el.style.outlineOffset='-3px';` +
    `setTimeout(function(){try{el.style.outline='';el.style.outlineOffset='';el.removeAttribute('data-dominator-outline')}catch(e){}},1600)}catch(e){}})()`
  );
}

/** True when replay is possible: only the DevTools panel can eval in the page. */
export function canReplay(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.devtools?.inspectedWindow?.eval;
}

function evalJson(expression: string): Promise<ReplayResult> {
  return new Promise(resolve => {
    if (!canReplay()) {
      resolve({ ok: false, error: 'Replay is only available in the DevTools panel.' });
      return;
    }
    try {
      chrome.devtools.inspectedWindow.eval(expression, (result: string, exception) => {
        if (exception && (exception.isError || exception.isException)) {
          resolve({ ok: false, error: exception.value || exception.description || 'evaluation failed' });
          return;
        }
        try {
          resolve(JSON.parse(result));
        } catch {
          resolve({ ok: false, error: 'unexpected replay result' });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

/** Fires a (possibly mutated) message into the inspected page. */
export function runReplay(
  target: string,
  mode: 'json' | 'text',
  rawText: string,
  targetOrigin: string,
  spoofedOrigin?: string,
): Promise<ReplayResult> {
  if (spoofedOrigin) {
    return evalJson(buildSpoofReplayExpression(target, mode, rawText, spoofedOrigin));
  }
  return evalJson(buildReplayExpression(target, mode, rawText, targetOrigin));
}

export function highlightFrame(frame: string): void {
  if (!canReplay() || !frame) return;
  try {
    chrome.devtools.inspectedWindow.eval(highlightFrameExpression(frame), () => undefined);
  } catch {
    /* panel closed */
  }
}
