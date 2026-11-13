export const sessionRoom = (sessionId: string) => `interview:session:${sessionId}`;
export const observersRoom = (sessionId: string) => `${sessionRoom(sessionId)}:observers`;
export const candidateRoom = (sessionId: string) => `${sessionRoom(sessionId)}:candidate`;
