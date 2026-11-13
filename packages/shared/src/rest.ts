import { z } from 'zod';
import { LANGUAGES } from './enums';

// ---------- Auth ----------
export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});
export type LoginDto = z.infer<typeof loginSchema>;

// ---------- Interviews ----------
export const createInterviewSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).default(''),
});
export type CreateInterviewDto = z.infer<typeof createInterviewSchema>;
export const updateInterviewSchema = createInterviewSchema.partial();
export type UpdateInterviewDto = z.infer<typeof updateInterviewSchema>;

// ---------- Tasks ----------
export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(50_000).default(''),
  // Documents are LF-only so client/server offsets always agree.
  initialCode: z.string().max(200_000).default('').transform((v) => v.replace(/\r\n?/g, '\n')),
  language: z.enum(LANGUAGES).default('typescript'),
  order: z.number().int().min(0).optional(),
});
export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export const updateTaskSchema = createTaskSchema.partial();
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

// ---------- Candidates ----------
export const createCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(254).optional().nullable(),
  notes: z.string().max(10_000).optional().nullable(),
});
export type CreateCandidateDto = z.infer<typeof createCandidateSchema>;
export const updateCandidateSchema = createCandidateSchema.partial();
export type UpdateCandidateDto = z.infer<typeof updateCandidateSchema>;

// ---------- Sessions ----------
export const createSessionSchema = z
  .object({
    candidateId: z.string().uuid().optional(),
    newCandidate: createCandidateSchema.optional(),
    durationMinutes: z.number().int().min(5).max(480).default(60),
    inviteTtlHours: z.number().int().min(1).max(24 * 30).default(72),
  })
  .refine((v) => Boolean(v.candidateId) !== Boolean(v.newCandidate), {
    message: 'Provide exactly one of candidateId or newCandidate',
  });
export type CreateSessionDto = z.infer<typeof createSessionSchema>;

export const inviteOptionsSchema = z.object({
  inviteTtlHours: z.number().int().min(1).max(24 * 30).default(72),
});
export type InviteOptionsDto = z.infer<typeof inviteOptionsSchema>;

/**
 * Allow a paused candidate back in. By default the original link is re-armed for a short
 * window; `newLink` rotates the token instead (e.g. when the old link may have leaked).
 */
export const allowReturnSchema = z.object({
  newLink: z.boolean().default(false),
});
export type AllowReturnDto = z.infer<typeof allowReturnSchema>;

export const exchangeInviteSchema = z.object({
  token: z.string().min(20).max(200),
  consent: z.literal(true),
});
export type ExchangeInviteDto = z.infer<typeof exchangeInviteSchema>;

export const inviteInfoQuerySchema = z.object({ token: z.string().min(20).max(200) });

export const beaconSchema = z.object({
  token: z.string().min(10).max(2000),
  type: z.literal('PAGE_UNLOAD'),
  clientTimestamp: z.number().int(),
});
export type BeaconDto = z.infer<typeof beaconSchema>;

export const eventsQuerySchema = z.object({
  after: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type EventsQuery = z.infer<typeof eventsQuerySchema>;
