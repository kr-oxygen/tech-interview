// Prisma CLI configuration (migrate, generate, studio). Prisma 7 no longer reads
// `.env` itself, so load it here; in containers DATABASE_URL comes from the
// environment and a missing `.env` is fine.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Deliberately not `env('DATABASE_URL')`: that throws when the variable is
    // unset, and `prisma generate` must run at build time without a database.
    url: process.env.DATABASE_URL ?? '',
  },
});
