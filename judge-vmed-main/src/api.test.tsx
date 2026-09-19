// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider, useResource } from './api';
import { REQUEST_TIMEOUT_MS } from './request';

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn<typeof fetch>();
const mounts = vi.fn();

function Page() {
  useEffect(() => { mounts(); }, []);
  return <input aria-label="Unsaved marks" defaultValue="7" />;
}

function Resource({ path = '/me', poll = 0 }: { path?: string | null; poll?: number }) {
  const resource = useResource<{ name: string }>(path, poll);
  return <>
    <span data-loading>{String(resource.loading)}</span>
    <span data-error>{resource.error}</span>
    <span data-name>{resource.data?.name}</span>
    <button onClick={resource.reload}>Refresh</button>
    {resource.loading && !resource.data ? <p>Loading</p> : <Page />}
  </>;
}

async function render(token = 'first-token', path: string | null = '/me', poll = 0) {
  await act(async () => {
    root.render(<ApiProvider getToken={async () => token}>
      <Resource path={path} poll={poll} />
    </ApiProvider>);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  fetchMock.mockReset().mockImplementation(async () => Response.json({ name: 'Round A' }));
  mounts.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resource loading', () => {
  it('ends loading when token acquisition stalls and never sends a late request', async () => {
    vi.useFakeTimers();
    const token = deferred<string | null>();
    await act(async () => root.render(
      <ApiProvider getToken={() => token.promise}><Resource /></ApiProvider>,
    ));
    await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); });
    expect(container.querySelector('[data-loading]')!.textContent).toBe('false');
    expect(container.querySelector('[data-error]')!.textContent).toContain('The request took too long.');
    await act(async () => { token.resolve('late-token'); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves the page and unsaved input through ten auth refreshes, then uses the latest token', async () => {
    await render();
    const input = container.querySelector('input')!;
    input.value = '9';
    for (let i = 1; i <= 10; i++) await render(`token-${i}`);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input')).toBe(input);
    expect(input.value).toBe('9');

    await act(async () => container.querySelector('button')!.click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer token-10' });
  });

  it('does not overlap polls when the previous request is slow', async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    await render('token', '/rounds', 1000);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(Response.json({ name: 'Round A' })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('pauses polling in a hidden tab and refreshes when visible again', async () => {
    vi.useFakeTimers();
    await render('token', '/rounds', 1000);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears the previous round immediately and aborts its request on navigation', async () => {
    await render('token', '/rounds/a');
    const oldRequest = deferred<Response>();
    fetchMock.mockReturnValueOnce(oldRequest.promise);
    await act(async () => container.querySelector('button')!.click());
    const signal = fetchMock.mock.calls[1][1]?.signal;

    const newRequest = deferred<Response>();
    fetchMock.mockReturnValueOnce(newRequest.promise);
    await render('token', '/rounds/b');
    expect(container.querySelector('[data-name]')!.textContent).toBe('');
    expect(signal?.aborted).toBe(true);
    await act(async () => { newRequest.resolve(Response.json({ name: 'Round B' })); });
    await act(async () => { oldRequest.resolve(Response.json({ name: 'Stale A' })); });
    expect(container.querySelector('[data-name]')!.textContent).toBe('Round B');
  });

  it('keeps loaded content on a refresh error and supports retry', async () => {
    await render();
    const input = container.querySelector('input');
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Temporarily unavailable' }, { status: 503 }));
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('[data-name]')!.textContent).toBe('Round A');
    expect(container.querySelector('[data-error]')!.textContent).toBe('Temporarily unavailable');
    expect(container.querySelector('input')).toBe(input);
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('[data-error]')!.textContent).toBe('');
  });

  it('clears errors and data when no resource is selected', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'Unavailable' }, { status: 503 }));
    await render();
    await render('token', null);
    expect(container.querySelector('[data-loading]')!.textContent).toBe('false');
    expect(container.querySelector('[data-error]')!.textContent).toBe('');
    expect(container.querySelector('[data-name]')!.textContent).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
