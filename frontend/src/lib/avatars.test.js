import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('./api.js', () => ({ api: { get: h.get } }));
import { useAvatars } from './avatars.js';

beforeEach(() => { h.get.mockReset(); });

describe('useAvatars', () => {
  it('asks once for the unique ids and returns the pictures', async () => {
    h.get.mockResolvedValue({ avatars: { b: '/api/auth/avatar/b?v=1' } });
    const { result, rerender } = renderHook(({ ids }) => useAvatars(ids), { initialProps: { ids: ['b', 'a', 'b', ''] } });
    await waitFor(() => expect(result.current).toEqual({ b: '/api/auth/avatar/b?v=1' }));
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get).toHaveBeenCalledWith('/auth/avatars?ids=a,b');
    rerender({ ids: ['a', 'b'] }); // same people in a new array: no new request
    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it('does not ask when there is nobody to ask about, and survives a failed request', async () => {
    const { result } = renderHook(() => useAvatars([]));
    expect(h.get).not.toHaveBeenCalled();
    expect(result.current).toEqual({});
    h.get.mockRejectedValue(new Error('x'));
    const r2 = renderHook(() => useAvatars(['a']));
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(r2.result.current).toEqual({});
  });

  it('picks up a changed picture when the window is focused again', async () => {
    h.get.mockResolvedValueOnce({ avatars: { a: '/api/auth/avatar/a?v=1' } }).mockResolvedValueOnce({ avatars: { a: '/api/auth/avatar/a?v=2' } });
    const { result } = renderHook(() => useAvatars(['a']));
    await waitFor(() => expect(result.current.a).toMatch(/v=1$/));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(result.current.a).toMatch(/v=2$/));
  });
});
