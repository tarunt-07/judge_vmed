import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { withRequestTimeout } from './request';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Api {
  get<T>(path: string, signal?: AbortSignal): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  del(path: string): Promise<void>;
  download(path: string, filename: string): Promise<void>;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
const ApiContext = createContext<Api | null>(null);
export function ApiProvider({
  getToken,
  children,
}: {
  getToken: () => Promise<string | null>;
  children: ReactNode;
}) {
  // getToken is a fresh closure each render; keep it in a ref so `api` stays
  // referentially stable. Otherwise every Clerk token refresh re-renders App,
  // rebuilds `api`, and re-fires every useResource effect (visible reload flash).
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const api = useMemo<Api>(() => {
    const json = async <T,>(res: Response) =>
      (res.status === 204 ? undefined : await res.json()) as T;
    function request<T>(
      path: string,
      method = 'GET',
      body?: unknown,
      signal?: AbortSignal,
      read: (res: Response) => Promise<T> = json<T>,
    ) {
      return withRequestTimeout(async (requestSignal) => {
        const headers: Record<string, string> = {};
        const token = await getTokenRef.current();
        requestSignal.throwIfAborted();
        if (!token) throw new ApiError(401, 'Please sign in again.');
        headers.Authorization = `Bearer ${token}`;
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const res = await fetch(`/api${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: requestSignal,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({ error: `Request failed (${res.status}).` }))) as {
            error?: string;
          };
          throw new ApiError(res.status, data.error || 'Request failed.');
        }
        return read(res);
      }, signal);
    }
    return {
      get: <T,>(path: string, signal?: AbortSignal) => request<T>(path, 'GET', undefined, signal),
      post: <T,>(path: string, body?: unknown) => request<T>(path, 'POST', body),
      put: <T,>(path: string, body: unknown) => request<T>(path, 'PUT', body),
      patch: <T,>(path: string, body: unknown) => request<T>(path, 'PATCH', body),
      del: async (path) => {
        await request(path, 'DELETE');
      },
      download: async (path, filename) => {
        const blob = await request(path, 'GET', undefined, undefined, (res) => res.blob());
        downloadBlob(blob, filename);
      },
    };
  }, []);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}
export function useApi() {
  const api = useContext(ApiContext);
  if (!api) throw new Error('API provider is missing.');
  return api;
}
export function useResource<T>(path: string | null, poll = 0) {
  const api = useApi();
  const [state, setState] = useState({ path, data: null as T | null, error: '', loading: !!path });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!path) {
      setState({ path, data: null, error: '', loading: false });
      return;
    }
    const load = async () => {
      if (!active || controller) return;
      controller = new AbortController();
      try {
        const result = await api.get<T>(path, controller.signal);
        if (active) {
          setState({ path, data: result, error: '', loading: false });
        }
      } catch (err) {
        if (active) setState((previous) => ({ ...previous, error: errorMessage(err), loading: false }));
      } finally {
        controller = undefined;
        // Schedule after completion so a slow request never overlaps another poll.
        if (active && poll > 0 && document.visibilityState === 'visible') {
          timer = setTimeout(() => void load(), poll);
        }
      }
    };
    setState((previous) => ({
      path,
      data: previous.path === path ? previous.data : null,
      error: '',
      loading: true,
    }));
    void load();
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') void load();
    };
    if (poll > 0) document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [api, path, version, poll]);
  // Never expose the previous round's data during the render before effects run.
  const current = state.path === path ? state : { data: null, error: '', loading: !!path };
  return { data: current.data, error: current.error, loading: current.loading, reload };
}
export function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
