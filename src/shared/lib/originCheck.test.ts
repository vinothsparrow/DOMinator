import { describe, expect, it } from 'vitest';
import { classifyOriginCheck, scoreListenerRisk } from './originCheck';

describe('classifyOriginCheck', () => {
  it('detects no check', () => {
    expect(classifyOriginCheck('function (e) { el.innerHTML = e.data }').kind).toBe('none');
  });

  it('detects strict equality', () => {
    expect(classifyOriginCheck('if (event.origin === "https://a.com") handle(event.data)').kind).toBe('strict');
    expect(classifyOriginCheck('if (originIsAllowed(event.origin)) handle()').kind).toBe('strict');
  });

  it('detects bypassable startsWith / indexOf / includes', () => {
    expect(classifyOriginCheck('if (event.origin.startsWith("https://bank.com")) x()').kind).toBe('bypassable');
    expect(classifyOriginCheck('if (event.origin.indexOf("bank.com") > -1) x()').kind).toBe('bypassable');
    expect(classifyOriginCheck('if (event.origin.includes("bank.com")) x()').kind).toBe('bypassable');
    expect(classifyOriginCheck('if (event.origin.endsWith("bank.com")) x()').kind).toBe('bypassable');
  });

  it('prefers bypassable over a later strict check', () => {
    const source = 'if (event.origin.startsWith("https://a.com") && event.origin === expected) x()';
    expect(classifyOriginCheck(source).kind).toBe('bypassable');
  });

  it('detects event.source checks', () => {
    expect(classifyOriginCheck('if (event.source === window.parent) x()').kind).toBe('source');
  });
});

describe('scoreListenerRisk', () => {
  it('rates missing or bypassable checks with sinks as high', () => {
    expect(scoreListenerRisk(1, 'none')).toBe('high');
    expect(scoreListenerRisk(1, 'bypassable')).toBe('high');
    expect(scoreListenerRisk(1, 'source')).toBe('high');
    expect(scoreListenerRisk(1, 'strict')).toBe('medium');
    expect(scoreListenerRisk(0, 'none')).toBe('medium');
    expect(scoreListenerRisk(0, 'strict')).toBe('low');
  });
});
