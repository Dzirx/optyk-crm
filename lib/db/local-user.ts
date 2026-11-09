// Wersja Windows: konto lokalne z danymi z aktywacji (ten sam e-mail i hasło co w chmurze).
// Uruchamiane przez program po udanej aktywacji. Dane wejściowe tylko ze zmiennych środowiska,
// bo hasło nie może trafić do argumentów procesu (widać je na liście procesów).
//
// LOCAL_USER_EMAIL, LOCAL_USER_PASSWORD, LOCAL_USER_NAME

import { db } from './index';
import bcrypt from 'bcryptjs';

async function main() {
  const email = process.env.LOCAL_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.LOCAL_USER_PASSWORD;
  const name = process.env.LOCAL_USER_NAME || null;
  if (!email || !password) {
    console.error('Brak LOCAL_USER_EMAIL lub LOCAL_USER_PASSWORD');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

  if (existing) {
    // Ponowna aktywacja (np. zgubiony plik licencji): aktualne hasło z chmury.
    await db.user.update({ where: { id: existing.id }, data: { passwordHash, name: name ?? existing.name } });
  } else {
    // Rola admin: w wersji Windows nie ma panelu admina (ukryty), a rola nie ma limitów.
    await db.user.create({ data: { email, passwordHash, name, role: 'admin' } });
  }
  await db.$disconnect();
}

main().catch((error) => {
  console.error('local-user:', error instanceof Error ? error.message : error);
  process.exit(1);
});
