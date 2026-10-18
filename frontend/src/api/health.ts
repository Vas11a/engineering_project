export type HealthResponse = {
  status: 'ok';
  service: string;
  timestamp: string;
};

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function fetchHealth(
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const response = await fetch(`${apiUrl}/health`, { signal });

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}
