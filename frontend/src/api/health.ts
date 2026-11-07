import { apiBaseUrl } from './base-url';

export type HealthResponse = {
  status: 'ok';
  service: string;
  timestamp: string;
};

export async function fetchHealth(
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health`, { signal });

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}
