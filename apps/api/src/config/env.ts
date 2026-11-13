import { z } from 'zod';

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
  PUBLIC_WEB_URL: z.string().url().optional(),
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
