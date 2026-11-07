import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';

function untilAborted(signal: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const abort = () =>
      reject(new DOMException('Request aborted', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('API request cancellation', () => {
  it('cancels a pending read when its caller leaves the view', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, options) =>
      untilAborted(options!.signal!),
    );
    const result = apiRequest('/sets', { signal: caller.signal });
    const rejection = expect(result).rejects.toMatchObject({
      name: 'AbortError',
    });
    caller.abort();
    await rejection;
    await vi.advanceTimersByTimeAsync(30_000);
  });

  it('honors a caller signal that was already cancelled', async () => {
    const caller = new AbortController();
    caller.abort();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, options) =>
      untilAborted(options!.signal!),
    );
    await expect(
      apiRequest('/sets', { signal: caller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('ends a stalled request with an actionable timeout message', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, options) =>
      untilAborted(options!.signal!),
    );
    const result = apiRequest('/sets');
    const rejection = expect(result).rejects.toThrow(
      'The request timed out. Please try again.',
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
  });

  it('also times out when the server stalls while sending its response body', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input, options) =>
        ({
          ok: true,
          status: 200,
          json: () => untilAborted(options!.signal!),
        }) as Response,
    );
    const result = apiRequest('/sets');
    const rejection = expect(result).rejects.toThrow(
      'The request timed out. Please try again.',
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
  });
});

describe('configured API URL', () => {
  it.each([
    { production: true, configured: undefined, expectedBase: '' },
    { production: true, configured: '', expectedBase: '' },
    {
      production: false,
      configured: undefined,
      expectedBase: 'http://localhost:3000',
    },
  ])(
    'routes API and health calls with production=$production, configured=$configured',
    async ({ production, configured, expectedBase }) => {
      vi.stubEnv('PROD', production);
      vi.stubEnv('VITE_API_URL', configured);
      vi.resetModules();
      const { apiRequest: configuredRequest } = await import('./client');
      const { fetchHealth } = await import('./health');
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => Response.json({ status: 'ok' }));

      await configuredRequest('/sets');
      await fetchHealth();

      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        `${expectedBase}/api/v1/sets`,
        `${expectedBase}/health`,
      ]);
    },
  );

  it('accepts a trailing slash for both authenticated requests and health checks', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_API_URL', 'https://api.example.com///');
    vi.resetModules();
    const { apiRequest: configuredRequest } = await import('./client');
    const { fetchHealth } = await import('./health');
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
      );
    await configuredRequest('/sets');
    await fetchHealth();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/api/v1/sets',
      'https://api.example.com/health',
    ]);
  });
});
