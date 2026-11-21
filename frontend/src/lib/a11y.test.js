import { describe, it, expect, beforeEach } from 'vitest';
import { loadA11y, saveA11y, applyA11y, motionOff } from './a11y.js';

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.fs; delete document.documentElement.dataset.motion; });

describe('display preferences', () => {
  it('starts with normal text and the device setting for motion', () => {
    expect(loadA11y()).toEqual({ size: 'md', motion: null });
  });
  it('ignores junk in storage', () => {
    localStorage.setItem('findit.a11y', '{"size":"huge","motion":"sideways"}');
    expect(loadA11y()).toEqual({ size: 'md', motion: null });
    localStorage.setItem('findit.a11y', 'not json');
    expect(loadA11y()).toEqual({ size: 'md', motion: null });
  });
  it('saves, reloads and puts the choice on <html>', () => {
    saveA11y({ size: 'xl', motion: 'reduced' });
    expect(loadA11y()).toEqual({ size: 'xl', motion: 'reduced' });
    expect(document.documentElement.dataset.fs).toBe('xl');
    expect(document.documentElement.dataset.motion).toBe('reduced');
    applyA11y({ size: 'md', motion: null });
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });
  it('an explicit choice beats the device setting', () => {
    expect(motionOff(true)).toBe(true);
    expect(motionOff(false)).toBe(false);
    document.documentElement.dataset.motion = 'full';
    expect(motionOff(true)).toBe(false);
    document.documentElement.dataset.motion = 'reduced';
    expect(motionOff(false)).toBe(true);
  });
});
