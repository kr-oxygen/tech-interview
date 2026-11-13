import { z } from 'zod';

/** Optional setting where an empty value (`FOO=` in an env file) means "not set". */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CANDIDATE_JWT_EXPIRES_IN: z.string().default('12h'),
  /** Comma-separated list of origins allowed by CORS. */
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  /** Public base URL of the web app, used in invite links (e.g. an ngrok URL). Defaults to the first WEB_ORIGIN. */
  PUBLIC_WEB_URL: optional(z.string().url()),
  /**
   * Built web app (apps/web/dist) to serve from the API, so that web, REST and WebSocket share
   * one origin and port. Unset in development: Vite serves the web app.
   */
  WEB_DIST_DIR: optional(z.string()),
  /**
   * Express `trust proxy` setting (`true`, `false`, a hop count, or a list of addresses/subnets).
   * Enable only when the API port is reachable solely through your reverse proxy or tunnel.
   */
  TRUST_PROXY: z.string().default('false'),
  /**
   * Header carrying the real client IP, set by an edge proxy you trust (e.g. `cf-connecting-ip`
   * for Cloudflare). Used for rate limiting. Leave unset unless clients cannot reach the API directly.
   */
  CLIENT_IP_HEADER: optional(z.string().transform((h) => h.toLowerCase())),
  /** Directory with Prisma migrations, checked at start-up in production (pending ones abort the start). */
  MIGRATIONS_DIR: optional(z.string()),
  RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
  LOCK_GRACE_SECONDS: z.coerce.number().int().min(1).default(30),
  /** How long a link stays usable after the interviewer allows a paused candidate back. */
  RETURN_LINK_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .default(15),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  return parsed.data;
}
