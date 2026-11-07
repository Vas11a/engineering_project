import { afterEach, describe, expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => {
  const app = () => undefined;
  const startPolling = vi.fn();
  return {
    app,
    startPolling,
    createRuntime: vi.fn(() => ({ app, bot: { startPolling } })),
    createServer: vi.fn(() => {
      throw new Error('A serverless import must not start an HTTP listener.');
    }),
  };
});

vi.mock('../src/runtime.js', () => ({ createRuntime: doubles.createRuntime }));
vi.mock('node:http', () => ({ createServer: doubles.createServer }));

afterEach(() => vi.restoreAllMocks());

describe('Vercel service entrypoint', () => {
  it('exports the request handler without taking ownership of the process lifecycle', async () => {
    const processOn = vi.spyOn(process, 'on');
    const { default: app } = await import('../src/app.js');

    expect(app).toBe(doubles.app);
    expect(doubles.createRuntime).toHaveBeenCalledOnce();
    expect(doubles.createServer).not.toHaveBeenCalled();
    expect(doubles.startPolling).not.toHaveBeenCalled();
    expect(
      processOn.mock.calls.some(
        ([event]) => event === 'SIGINT' || event === 'SIGTERM',
      ),
    ).toBe(false);
  });
});
