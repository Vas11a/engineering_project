import { copyFile } from 'node:fs/promises';

// Vercel packages dist as the function root, so its ESM scope must travel with it.
await copyFile(
  new URL('../package.json', import.meta.url),
  new URL('../dist/package.json', import.meta.url),
);
