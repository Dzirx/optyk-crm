// Kompiluje lib/db/seed.ts do jednego pliku JS dla obrazu Docker.
// Obraz nie potrzebuje wtedy tsx ani plików .ts (aliasy @/ rozwiązuje esbuild z tsconfig.json).
// esbuild pochodzi z zależności tsx, więc nie dodajemy osobnego pakietu.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const esbuildPath = require.resolve('esbuild', {
  paths: [path.resolve('node_modules/tsx'), process.cwd()],
});
const esbuild = require(esbuildPath);

await esbuild.build({
  entryPoints: ['lib/db/seed.ts'],
  outfile: 'dist/seed.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  tsconfig: 'tsconfig.json',
  // Klient Prisma ma silnik natywny – zostaje w node_modules obrazu.
  external: ['@prisma/client', '.prisma/client'],
  logLevel: 'info',
});
