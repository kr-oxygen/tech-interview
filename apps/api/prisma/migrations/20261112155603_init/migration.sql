-- CreateEnum
CREATE TYPE "Language" AS ENUM ('javascript', 'typescript');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CREATED', 'ACTIVE', 'LOCKED', 'ENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LockReason" AS ENUM ('PAGE_UNLOAD', 'DISCONNECT_TIMEOUT');

-- CreateEnum
CREATE TYPE "SnapshotReason" AS ENUM ('PERIODIC', 'LARGE_CHANGE', 'TASK_SWITCH', 'SESSION_END', 'RESYNC');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewTask" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "initialCode" TEXT NOT NULL DEFAULT '',
    "language" "Language" NOT NULL DEFAULT 'typescript',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'CREATED',
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "inviteTokenHash" TEXT NOT NULL,
    "inviteExpiresAt" TIMESTAMP(3) NOT NULL,
    "inviteConsumedAt" TIMESTAMP(3),
    "candidateTokenVersion" INTEGER NOT NULL DEFAULT 0,
    "consentAcceptedAt" TIMESTAMP(3),
    "activeTaskId" UUID,
    "lastSequenceNumber" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockReason" "LockReason",
    "lockCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTaskState" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "currentContent" TEXT NOT NULL,
    "documentVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionTaskState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "taskId" UUID,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "clientEventId" TEXT NOT NULL,
    "clientTimestamp" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequenceNumber" INTEGER NOT NULL,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeSnapshot" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "documentVersion" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "reason" "SnapshotReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Interview_createdById_idx" ON "Interview"("createdById");

-- CreateIndex
CREATE INDEX "InterviewTask_interviewId_order_idx" ON "InterviewTask"("interviewId", "order");

-- CreateIndex
CREATE INDEX "Candidate_ownerId_email_idx" ON "Candidate"("ownerId", "email");

-- CreateIndex
CREATE INDEX "Candidate_ownerId_name_idx" ON "Candidate"("ownerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSession_inviteTokenHash_key" ON "InterviewSession"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "InterviewSession_interviewId_idx" ON "InterviewSession"("interviewId");

-- CreateIndex
CREATE INDEX "InterviewSession_candidateId_idx" ON "InterviewSession"("candidateId");

-- CreateIndex
CREATE INDEX "InterviewSession_status_endedAt_idx" ON "InterviewSession"("status", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTaskState_sessionId_taskId_key" ON "SessionTaskState"("sessionId", "taskId");

-- CreateIndex
CREATE INDEX "ActivityEvent_sessionId_timestamp_idx" ON "ActivityEvent"("sessionId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_sessionId_clientEventId_key" ON "ActivityEvent"("sessionId", "clientEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_sessionId_sequenceNumber_key" ON "ActivityEvent"("sessionId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "CodeSnapshot_sessionId_taskId_documentVersion_idx" ON "CodeSnapshot"("sessionId", "taskId", "documentVersion");

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewTask" ADD CONSTRAINT "InterviewTask_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTaskState" ADD CONSTRAINT "SessionTaskState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTaskState" ADD CONSTRAINT "SessionTaskState_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "InterviewTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeSnapshot" ADD CONSTRAINT "CodeSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
