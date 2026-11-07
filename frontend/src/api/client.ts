import { retrieveRawInitData } from '@tma.js/sdk-react';
import { apiBaseUrl } from './base-url';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  let rawInitData: string | undefined;

  try {
    rawInitData = retrieveRawInitData();
  } catch {
    // Outside Telegram the backend may provide the explicit local dev identity.
    rawInitData = undefined;
  }

  if (rawInitData) {
    headers.set('Authorization', `tma ${rawInitData}`);
  }
  if (options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const callerSignal = options.signal;
  const abortFromCaller = () => controller.abort();
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  if (callerSignal?.aborted) controller.abort();
  let timedOut = false;
  const timeout = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    path.startsWith('/ai/') ? 65_000 : 30_000,
  );

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new ApiError(
        payload?.error?.message ??
          `Request failed with status ${response.status}`,
        response.status,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (cause) {
    if (timedOut) {
      throw new Error('The request timed out. Please try again.', { cause });
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}
