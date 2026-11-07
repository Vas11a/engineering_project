// Services share one origin in production. An explicit value can still point to
// a separately hosted API; an empty value deliberately selects the same origin.
export const apiBaseUrl = (
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? '' : 'http://localhost:3000')
).replace(/\/+$/, '');
