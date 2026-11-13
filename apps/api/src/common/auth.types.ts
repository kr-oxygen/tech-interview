export interface InterviewerJwtPayload {
  sub: string;
  role: 'interviewer';
}

export interface CandidateJwtPayload {
  sub: string; // sessionId
  role: 'candidate';
  /** candidateTokenVersion at the moment of issue */
  tv: number;
}

export type JwtPayload = InterviewerJwtPayload | CandidateJwtPayload;

export interface AuthUser {
  id: string;
}
