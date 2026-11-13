/** All thresholds for observations in one place. */
export const INSIGHTS_CONFIG = {
  /** Look-back window to correlate a PASTE with an earlier COPY/CUT. */
  copyPasteWindowMs: 30 * 60_000,
  /** Similarity (0..100) from which a paste is considered to match an internal copy. */
  copyPasteMatchMin: 80,
  /** Paste length from which an unmatched paste is reported. */
  largePasteChars: 200,
  /** Typed (non-paste) characters within the window that count as rapid insertion. */
  rapidInsertChars: 300,
  rapidInsertWindowMs: 10_000,
  /** Tab hides within the window that count as frequent switching. */
  tabSwitchCount: 5,
  tabSwitchWindowMs: 5 * 60_000,
  /** Idle length reported as long inactivity. */
  longIdleMs: 5 * 60_000,
  /** Single input change from which an edit is flagged as large. */
  largeEditChars: 100,
  /** Similarity is computed on at most this many characters per side. */
  similarityMaxChars: 20_000,
} as const;
