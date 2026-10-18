import { useEffect, useState } from 'react';

import { fetchHealth } from '../api/health';

type HealthState = 'checking' | 'online' | 'offline';

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>('checking');

  useEffect(() => {
    const controller = new AbortController();

    void fetchHealth(controller.signal)
      .then(() => setState('online'))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setState('offline');
      });

    return () => controller.abort();
  }, []);

  return state;
}
