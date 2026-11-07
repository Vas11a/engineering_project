import { createRuntime } from './runtime.js';

// Vercel owns the HTTP lifecycle. Polling and signal handlers live in server.ts.
const { app } = createRuntime();

export default app;
