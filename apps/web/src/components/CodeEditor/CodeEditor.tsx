import Editor, { type OnMount } from '@monaco-editor/react';
import { Box, CircularProgress } from '@mui/material';
import type { editor } from 'monaco-editor';
import { useUiStore } from '../../stores/uiStore';
import './monacoSetup';

export interface CodeEditorProps {
  /** Model path; one model per path is kept (undo history per task). */
  path: string;
  language: string;
  value?: string;
  defaultValue?: string;
  readOnly?: boolean;
  onMount?: OnMount;
  onChange?: (value: string) => void;
  height?: string | number;
  options?: editor.IStandaloneEditorConstructionOptions;
}

export function CodeEditor({
  path,
  language,
  value,
  defaultValue,
  readOnly = false,
  onMount,
  onChange,
  height = '100%',
  options,
}: CodeEditorProps) {
  const { editorTheme, fontSize, minimap } = useUiStore();
  return (
    <Editor
      path={path}
      language={language}
      value={value}
      defaultValue={defaultValue}
      theme={editorTheme}
      height={height}
      onMount={onMount}
      onChange={(v) => onChange?.(v ?? '')}
      loading={
        <Box sx={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <CircularProgress size={24} />
        </Box>
      }
      options={{
        readOnly,
        domReadOnly: readOnly,
        fontSize,
        minimap: { enabled: minimap },
        lineNumbers: 'on',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
        formatOnPaste: false,
        renderWhitespace: 'selection',
        ...options,
      }}
    />
  );
}
