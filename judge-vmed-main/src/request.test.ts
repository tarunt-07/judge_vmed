import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUEST_TIMEOUT_MS, withRequestTimeout } from './request';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('request deadline', () => {
  it('aborts stalled work and returns a useful error without retrying', async () => {
    const request = vi.fn(async (_signal: AbortSignal) => new Promise<never>(() => {}));
    const result = withRequestTimeout(request);
    const rejected = expect(result).rejects.toThrow('The request took too long.');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await rejected;
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start an already cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn(async () => 'result');
    await expect(withRequestTimeout(request, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels in-flight work on navigation', async () => {
    const controller = new AbortController();
    const request = vi.fn(async (_signal: AbortSignal) => new Promise<never>(() => {}));
    const result = withRequestTimeout(request, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(request.mock.calls[0][0].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up its deadline when the entire operation completes', async () => {
    await expect(withRequestTimeout(async () => ({ ok: true }))).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
