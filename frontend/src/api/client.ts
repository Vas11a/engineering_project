import { retrieveRawInitData } from '@tma.js/sdk-react';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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

  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    ...options,
    headers,
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
}
