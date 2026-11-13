# 0009 — Candidate as a first-class entity without an account

- Status: Accepted
- Date: 12/11/2026

## Context
The spec stores `candidateName` on the session and requires candidates not to register. The product owner wants candidates managed separately, so that the same person can have several sessions (and a candidate history, Phase 4).

## Decision
- A `Candidate` model (`name`, `email?`, `notes?`) owned by an interviewer. `InterviewSession.candidateId` replaces `candidateName`.
- Candidates are created on the Candidates page or inline in the “New session” dialog (pick an existing one or create a new one).
- Candidates never log in. Access is only through the per-session invite link (ADR-0004).
- A candidate with sessions cannot be deleted (409), to keep history consistent.

## Consequences
- The candidate detail page lists their interview history across interviews.
- Candidates are scoped per interviewer. Sharing them across a team would need an organisation/team model.
