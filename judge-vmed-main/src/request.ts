export const REQUEST_TIMEOUT_MS = 15_000;

// Bound the whole operation, including token acquisition and reading the body.
// Reject even if a dependency ignores cancellation, and never replay a write.
export async function withRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(
    'The request took too long. Check your connection and refresh before trying again.',
  )), REQUEST_TIMEOUT_MS);
  let onAbort: () => void = () => {};
  try {
    return await new Promise<T>((resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
      else request(controller.signal).then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
