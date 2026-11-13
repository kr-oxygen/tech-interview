import { Logger } from '@nestjs/common';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { PrismaService } from './prisma.service';

/**
 * Migrations are applied by an explicit deploy step (`entrypoint.sh migrate`), never on start.
 * This guard stops an image from running against a database that lacks its migrations, e.g.
 * when the migrate step was skipped. Returns the names of pending migrations.
 */
export async function findPendingMigrations(
  prisma: PrismaService,
  migrationsDir: string,
): Promise<string[]> {
  const expected = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(migrationsDir, d.name, 'migration.sql')))
    .map((d) => d.name);
  let applied: string[] = [];
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    applied = rows.map((r) => r.migration_name);
  } catch {
    // No _prisma_migrations table yet: nothing has been applied.
  }
  const done = new Set(applied);
  return expected.filter((m) => !done.has(m));
}

/** Aborts start-up (exit code 1) when migrations are pending. Production only. */
export async function assertMigrationsApplied(prisma: PrismaService, dir?: string): Promise<void> {
  const logger = new Logger('Migrations');
  const migrationsDir = resolve(dir ?? 'prisma/migrations');
  if (!existsSync(migrationsDir)) {
    logger.warn(`Migrations directory not found (${migrationsDir}); skipping the check`);
    return;
  }
  const pending = await findPendingMigrations(prisma, migrationsDir);
  if (pending.length) {
    logger.error(
      `Database is missing ${pending.length} migration(s): ${pending.join(', ')}. ` +
        'Run the migrate step (`entrypoint.sh migrate`) before starting this version.',
    );
    process.exit(1);
  }
}
