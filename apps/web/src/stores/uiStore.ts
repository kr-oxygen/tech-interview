import type { ActivityEventType } from '@ti/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type EditorTheme = 'vs' | 'vs-dark' | 'hc-black';
export type TimelineFilter = 'editing' | 'clipboard' | 'selection' | 'focus' | 'session';

export const FILTER_TYPES: Record<TimelineFilter, ActivityEventType[]> = {
  editing: ['TEXT_INSERT', 'TEXT_DELETE', 'TEXT_CHANGE', 'DOCUMENT_RESYNC'],
  clipboard: ['COPY', 'CUT', 'PASTE'],
  selection: ['SELECTION'],
  focus: ['EDITOR_FOCUS', 'EDITOR_BLUR', 'TAB_HIDDEN', 'TAB_VISIBLE', 'WINDOW_FOCUS', 'WINDOW_BLUR', 'IDLE'],
  session: [
    'SESSION_STARTED',
    'SESSION_ENDED',
    'CANDIDATE_CONNECTED',
    'CANDIDATE_DISCONNECTED',
    'SESSION_LOCKED',
    'RETURN_ALLOWED',
    'TASK_SWITCH',
    'NAVIGATION_BACK',
    'PAGE_UNLOAD',
  ],
};

interface UiState {
  editorTheme: EditorTheme;
  fontSize: number;
  minimap: boolean;
  timelineFilters: TimelineFilter[];
  setEditorTheme: (t: EditorTheme) => void;
  setFontSize: (n: number) => void;
  setMinimap: (v: boolean) => void;
  setTimelineFilters: (f: TimelineFilter[]) => void;
}

/** Per-viewer UI preferences (persisted, non-critical). */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      editorTheme: 'vs-dark',
      fontSize: 14,
      minimap: false,
      timelineFilters: ['editing', 'clipboard', 'selection', 'focus', 'session'],
      setEditorTheme: (editorTheme) => set({ editorTheme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setMinimap: (minimap) => set({ minimap }),
      setTimelineFilters: (timelineFilters) => set({ timelineFilters }),
    }),
    {
      name: 'ti.ui',
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
    },
  ),
);
