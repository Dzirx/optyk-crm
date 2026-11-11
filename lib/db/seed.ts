import { db } from './index';
import bcrypt from 'bcryptjs';
import { initAllStockHistories } from '@/lib/stock/init-all';

/** Historia magazynu dla salonów, które jej nie mają (idempotentne). */
async function initStockHistories(silent: boolean) {
  // Błąd nie blokuje startu: historię i tak założy pierwsza operacja na magazynie (lockStock).
  try {
    const n = await initAllStockHistories();
    if (!silent && n > 0) console.log(`📦 Historia magazynu założona w ${n} salonach`);
  } catch (e) {
    console.error('⚠️ Nie udało się założyć historii magazynu przy starcie (zostanie założona przy pierwszej operacji):', e);
  }
}

async function seed() {
  const silent = process.argv.includes('--silent');

  if (!silent) {
    console.log('🌱 Checking admin user...');
  }

  const rootEmail = process.env.ROOT_USER_EMAIL;
  const rootPassword = process.env.ROOT_USER_PASSWORD;
  const rootName = process.env.ROOT_USER_NAME;

  if (!rootEmail || !rootPassword || !rootName) {
    if (!silent) {
      console.error('❌ Missing ROOT_USER environment variables!');
      console.error('Please set ROOT_USER_EMAIL, ROOT_USER_PASSWORD, and ROOT_USER_NAME in .env.local');
    }
    process.exit(1);
  }

  try {
    // Check if ANY admin exists
    const existingAdmin = await db.user.findFirst({
      where: { role: 'admin' },
    });

    if (existingAdmin) {
      // Admin already exists - don't create another one
      if (!silent) {
        console.log(`✅ Admin user already exists: ${existingAdmin.email}`);
      }
      await initStockHistories(silent);
      process.exit(0);
    }

    // No admin found - check if database is empty
    const allUsers = await db.user.findMany();

    if (allUsers.length === 0) {
      // Database is empty - safe to create root admin
      if (!silent) {
        console.log('📊 Database is empty, creating root admin...');
      }
    } else {
      // Database has users but no admin - create root admin
      if (!silent) {
        console.log('⚠️  No admin found, creating root admin...');
      }
    }

    // Create root admin from ENV
    const passwordHash = await bcrypt.hash(rootPassword, 10);

    const newUser = await db.user.create({
      data: {
        email: rootEmail,
        passwordHash,
        name: rootName,
        role: 'admin',
      },
    });

    console.log('✅ Root admin created!');
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Name: ${newUser.name}`);
    console.log(`   Role: ${newUser.role}`);

    await initStockHistories(silent);
    process.exit(0);
  } catch (error) {
    if (!silent) {
      console.error('❌ Seed error:', error);
    }
    process.exit(1);
  }
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
